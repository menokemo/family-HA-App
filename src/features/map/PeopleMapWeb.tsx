import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Image, Linking, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import RNFS from 'react-native-fs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { absoluteHaUrl, authHeaders, getPersonHistory } from '../../api/homeAssistant';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { requestLocationPermission, watchLiveLocation, type LiveLocation } from '../../native/liveLocation';
import { PressableScale } from '../../components/PressableScale';

type Props = { people: HaEntity[]; home?: HaEntity; states: HaEntity[]; selectedPersonId?: string; settings: ConnectionSettings };
type Point = { id: string; name: string; lat: number; lng: number; color: string; picture?: string };
type Zone = { id: string; name: string; lat: number; lng: number; radius: number };

// نغيّر الرقم ده لو عملنا تعديل جوهري في mapHtml، عشان نجبر الـ WebView
// يعمل remount كامل بدل ما يحاول يحدّث المحتوى القديم في مكانه. بنضيف
// وضع الثيم (فاتح/غامق) في الـ key كمان عشان تبديل الثيم يعيد بناء
// الخريطة بالستايل الصح.
const MAP_TEMPLATE_VERSION = 'v12-life360';

// ألوان ثابتة لكل فرد (حلقة الصورة على الخريطة + في اللستة) - توقيعة
// Life360 إن كل شخص ليه لونه الخاص الثابت.
const PERSON_RING = ['#5C8DFF', '#2EE6A6', '#FFB020', '#FF4D6D', '#9B6DFF', '#12C2E9', '#FF7A45', '#39C36E'];

const WIN_H = Dimensions.get('window').height;
const SHEET_H = Math.min(560, Math.round(WIN_H * 0.72));
const PEEK = 160;
const COLLAPSED = SHEET_H - PEEK;

const coord = (e: HaEntity) => ({ latitude: Number(e.attributes.latitude), longitude: Number(e.attributes.longitude) });

const haversine = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const distance = (m?: number) => (m === undefined ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

function etaText(seconds: number) {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} ${i18n.t('min')}`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return `${h}${i18n.t('hourShort')} ${rem}${i18n.t('min')}`;
}

function timeAgo(iso?: string) {
  if (!iso) return '—';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.round(diff / 60000);
  if (min < 1) return i18n.t('justNow');
  if (min < 60) return `${min} ${i18n.t('minAgo')}`;
  const hr = Math.round(min / 60);
  return `${hr} ${i18n.t('hourAgo')}`;
}

async function avatar(entity: HaEntity, settings: ConnectionSettings) {
  const path = entity.attributes.entity_picture;
  if (typeof path !== 'string') return;
  try {
    const file = `${RNFS.CachesDirectoryPath}/familyha-${entity.entity_id.replace(/\W/g, '_')}.img`;
    const r = await RNFS.downloadFile({ fromUrl: absoluteHaUrl(settings, path), toFile: file, headers: authHeaders(settings) }).promise;
    if (r.statusCode < 200 || r.statusCode >= 300) return;
    return `data:image/jpeg;base64,${await RNFS.readFile(file, 'base64')}`;
  } catch {
    return;
  }
}

function esc(v: string) {
  return v.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function battery(p: HaEntity, states: HaEntity[]) {
  const n = Number(p.attributes.battery_level);
  if (Number.isFinite(n)) return `${n}%`;
  const key = p.entity_id.split('.')[1];
  const e = states.find(x => x.entity_id.startsWith('sensor.') && x.entity_id.includes(key) && x.entity_id.includes('battery'));
  return e ? `${e.state}%` : '—';
}

function batteryIcon(pct: number): string {
  if (!Number.isFinite(pct)) return 'battery-dead-outline';
  if (pct >= 95) return 'battery-full';
  if (pct >= 45) return 'battery-half';
  return 'battery-dead';
}

// العنوان العكسي: من إحداثيات لاسم شارع/منطقة مقروء، زي ما Life360
// بيعرض العنوان مش أرقام. بنستخدم BigDataCloud (مجاني تمامًا، بدون
// مفتاح API، وبيدعم العربية) مع كاش بالإحداثيات المقرّبة عشان ما
// نكررش الطلبات.
const addrCache = new Map<string, string>();
async function reverseGeocode(lat: number, lng: number, lang: string): Promise<string | undefined> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = addrCache.get(key);
  if (hit !== undefined) return hit;
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=${lang}`);
    const d = (await res.json()) as { locality?: string; city?: string; principalSubdivision?: string };
    const parts = [d.locality || d.city, d.principalSubdivision].filter(Boolean) as string[];
    const line = parts.slice(0, 2).join('، ');
    if (line) {
      addrCache.set(key, line);
      return line;
    }
  } catch {
    /* بدون إنترنت أو الخدمة مش متاحة - نرجع للإحداثيات/الوضع العام */
  }
  return undefined;
}

function placeLabel(p: HaEntity, addrMap: Record<string, string>): string {
  const st = String(p.state ?? '');
  if (st === 'home') return i18n.t('placeHome');
  if (st && !['not_home', 'unknown', 'unavailable', ''].includes(st)) return st; // منطقة مسمّاة من HA
  return addrMap[p.entity_id] || i18n.t('placeAway');
}

export function PeopleMapWeb({ people, home, states, selectedPersonId, settings }: Props) {
  const { colors, resolvedMode } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [selected, setSelected] = useState<HaEntity | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineActive, setTimelineActive] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [addrMap, setAddrMap] = useState<Record<string, string>>({});
  const [showPlaces, setShowPlaces] = useState(false);
  const [satelliteOn, setSatelliteOn] = useState(false);
  const webRef = useRef<WebView<object>>(null);

  const colorFor = useMemo(() => {
    const m: Record<string, string> = {};
    people.forEach((p, i) => (m[p.entity_id] = PERSON_RING[i % PERSON_RING.length]));
    return m;
  }, [people.map(p => p.entity_id).join('|')]);

  // ====== السحب للـ bottom sheet (Animated + PanResponder، بدون أي مكتبة) ======
  const sheetY = useRef(new Animated.Value(COLLAPSED)).current;
  const expandedRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const snapTo = (to: number) => {
    Animated.spring(sheetY, { toValue: to, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
    expandedRef.current = to === 0;
    setExpanded(to === 0);
  };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        const base = expandedRef.current ? 0 : COLLAPSED;
        let ny = base + g.dy;
        if (ny < 0) ny = 0;
        if (ny > COLLAPSED) ny = COLLAPSED;
        sheetY.setValue(ny);
      },
      onPanResponderRelease: (_e, g) => {
        const base = expandedRef.current ? 0 : COLLAPSED;
        const ny = base + g.dy;
        snapTo(ny < COLLAPSED / 2 ? 0 : COLLAPSED);
      },
    }),
  ).current;

  // ====== صور الأفراد (كاش محلي) ======
  useEffect(() => {
    let on = true;
    void Promise.all(people.map(async p => [p.entity_id, await avatar(p, settings)] as const)).then(xs => {
      if (on) setAvatars(Object.fromEntries(xs.filter((x): x is readonly [string, string] => !!x[1])));
    });
    return () => {
      on = false;
    };
  }, [people.map(p => `${p.entity_id}:${String(p.attributes.entity_picture ?? '')}`).join('|'), settings.baseUrl, settings.token]);

  // ====== العناوين العكسية لمن هم خارج المناطق ======
  useEffect(() => {
    let on = true;
    void (async () => {
      const updates: Record<string, string> = {};
      for (const p of people) {
        if (String(p.state) !== 'not_home') continue;
        const a = await reverseGeocode(Number(p.attributes.latitude), Number(p.attributes.longitude), i18n.locale || 'en');
        if (a) updates[p.entity_id] = a;
      }
      if (on && Object.keys(updates).length) setAddrMap(m => ({ ...m, ...updates }));
    })();
    return () => {
      on = false;
    };
  }, [people.map(p => `${p.entity_id}:${p.state}:${p.attributes.latitude},${p.attributes.longitude}`).join('|'), i18n.locale]);

  // ====== موقعي الحي من الموبايل (نقطة زرقاء زي Life360) ======
  const me = people.find(p => p.entity_id === selectedPersonId) ?? people[0];
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  useEffect(() => {
    let stopWatch: (() => void) | undefined;
    void requestLocationPermission().then(granted => {
      if (granted) stopWatch = watchLiveLocation(setLiveLocation);
    });
    return () => stopWatch?.();
  }, []);
  const myCoord = liveLocation ?? (me ? coord(me) : undefined);
  useEffect(() => {
    if (liveLocation) webRef.current?.injectJavaScript(`window.setMe && window.setMe(${liveLocation.longitude},${liveLocation.latitude}); true;`);
  }, [liveLocation?.latitude, liveLocation?.longitude]);

  // ====== المسار من موقعي للشخص المختار ======
  const selectedCoordKey = selected ? `${selected.attributes.latitude},${selected.attributes.longitude}` : undefined;
  useEffect(() => {
    if (!selected || !myCoord || selected.entity_id === me?.entity_id) {
      webRef.current?.injectJavaScript(`window.hideRoute && window.hideRoute(); true;`);
      setRouteInfo(null);
      return;
    }
    const target = coord(selected);
    if (!Number.isFinite(target.latitude) || !Number.isFinite(target.longitude)) return;
    webRef.current?.injectJavaScript(
      `window.showRoute && window.showRoute(${myCoord.longitude},${myCoord.latitude},${target.longitude},${target.latitude}); true;`,
    );
  }, [selected?.entity_id, selectedCoordKey, myCoord?.latitude, myCoord?.longitude]);

  useEffect(() => {
    if (timelineActive) {
      webRef.current?.injectJavaScript(`window.hideTimeline && window.hideTimeline(); true;`);
      setTimelineActive(false);
    }
  }, [selected?.entity_id]);

  // ====== النقاط والمناطق ======
  const points: Point[] = people.map(p => ({
    id: p.entity_id,
    name: String(p.attributes.friendly_name ?? p.entity_id),
    lat: Number(p.attributes.latitude),
    lng: Number(p.attributes.longitude),
    color: colorFor[p.entity_id] ?? PERSON_RING[0],
    picture: avatars[p.entity_id],
  }));

  const zones: Zone[] = useMemo(
    () =>
      states
        .filter(e => e.entity_id.startsWith('zone.') && Number.isFinite(Number(e.attributes.latitude)) && Number.isFinite(Number(e.attributes.longitude)))
        .map(z => ({
          id: z.entity_id,
          name: String(z.attributes.friendly_name ?? z.entity_id.replace('zone.', '')),
          lat: Number(z.attributes.latitude),
          lng: Number(z.attributes.longitude),
          radius: Number(z.attributes.radius ?? 100),
        })),
    [states.filter(e => e.entity_id.startsWith('zone.')).map(z => `${z.entity_id}:${z.attributes.latitude},${z.attributes.longitude}:${z.attributes.radius}`).join('|')],
  );

  // بنولّد الـ HTML مرة واحدة ونعيد توليده بس لو الثيم اتغيّر (فاتح/غامق)،
  // عشان ستايل الخريطة يتبدّل. تحديثات مواقع الأشخاص بتتبعت عبر
  // injectJavaScript من غير إعادة توليد (عشان ما نعملش reload للخريطة).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => mapHtml(points, zones, resolvedMode, colors), [resolvedMode]);
  const pointsKey = JSON.stringify(points.map(p => [p.id, p.lat, p.lng]));
  useEffect(() => {
    webRef.current?.injectJavaScript(`window.updateMarkers && window.updateMarkers(${JSON.stringify(JSON.stringify(points))}); true;`);
  }, [pointsKey]);

  useEffect(() => {
    webRef.current?.injectJavaScript(`window.${showPlaces ? 'showPlaces' : 'hidePlaces'} && window.${showPlaces ? 'showPlaces' : 'hidePlaces'}(); true;`);
  }, [showPlaces]);
  useEffect(() => {
    webRef.current?.injectJavaScript(`window.toggleSatellite && window.toggleSatellite(${satelliteOn}); true;`);
  }, [satelliteOn]);

  const focusPerson = (person: HaEntity) => {
    setSelected(person);
    const c = coord(person);
    if (Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
      webRef.current?.injectJavaScript(`window.focusPerson && window.focusPerson('${person.entity_id}'); true;`);
    }
    if (!expandedRef.current) snapTo(0);
  };

  const toggleTimeline = async () => {
    if (!selected) return;
    if (timelineActive) {
      webRef.current?.injectJavaScript(`window.hideTimeline && window.hideTimeline(); true;`);
      setTimelineActive(false);
      return;
    }
    setTimelineLoading(true);
    try {
      const pts = await getPersonHistory(settings, selected.entity_id, 24);
      if (pts.length < 2) return;
      webRef.current?.injectJavaScript(`window.showTimeline && window.showTimeline(${JSON.stringify(JSON.stringify(pts))}); true;`);
      setTimelineActive(true);
    } finally {
      setTimelineLoading(false);
    }
  };

  const navigate = (p: HaEntity) => {
    const c = coord(p);
    const label = encodeURIComponent(String(p.attributes.friendly_name ?? p.entity_id));
    if (Platform.OS === 'ios') {
      void Linking.openURL(`maps://?daddr=${c.latitude},${c.longitude}&q=${label}`).catch(() =>
        Linking.openURL(`geo:${c.latitude},${c.longitude}?q=${c.latitude},${c.longitude}(${label})`),
      );
      return;
    }
    const url = `geo:${c.latitude},${c.longitude}?q=${c.latitude},${c.longitude}(${label})`;
    void Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=17/${c.latitude}/${c.longitude}`),
    );
  };

  const recenterMe = () => {
    if (myCoord) webRef.current?.injectJavaScript(`window.recenter && window.recenter(${myCoord.longitude},${myCoord.latitude}); true;`);
    else webRef.current?.injectJavaScript(`window.fitAll && window.fitAll(); true;`);
  };
  const fitAll = () => webRef.current?.injectJavaScript(`window.fitAll && window.fitAll(); true;`);

  if (!people.length)
    return (
      <View style={s.empty}>
        <Text style={s.muted}>{i18n.t('noPeople')}</Text>
      </View>
    );

  const detailFromMe = (person: HaEntity) =>
    !myCoord
      ? '—'
      : me && person.entity_id === me.entity_id
      ? distance(0)
      : routeInfo && selected?.entity_id === person.entity_id
      ? distance(routeInfo.distanceMeters)
      : distance(haversine(coord(person), myCoord));

  return (
    <View style={s.screen}>
      <WebView
        key={`${MAP_TEMPLATE_VERSION}-${resolvedMode}`}
        ref={webRef}
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        onMessage={e => {
          const data = e.nativeEvent.data;
          if (data === 'MAP_HTML_V2_LOADED') {
            if (myCoord && liveLocation) webRef.current?.injectJavaScript(`window.setMe && window.setMe(${liveLocation.longitude},${liveLocation.latitude}); true;`);
            return;
          }
          if (data.startsWith('JS_ERROR:') || data.startsWith('MAP_ERROR:') || data.startsWith('HOUSENUM_ERR:') || data.startsWith('SAT_ERR:') || data.startsWith('ZONE_ERR:')) {
            const g = globalThis as unknown as { __familyHaLog?: (level: string, args: unknown[]) => void };
            g.__familyHaLog?.('warn', [data]);
            return;
          }
          if (data.startsWith('ROUTE_INFO:')) {
            try {
              const info = JSON.parse(data.slice('ROUTE_INFO:'.length)) as { distance: number; duration: number };
              setRouteInfo({ distanceMeters: info.distance, durationSeconds: info.duration });
            } catch {
              /* ignore */
            }
            return;
          }
          const person = people.find(p => p.entity_id === data);
          if (person) focusPerson(person);
        }}
        style={s.web}
      />

      {/* شريط علوي: اسم العائلة */}
      <View style={s.topBar} pointerEvents="box-none">
        <View style={s.titlePill}>
          <Ionicons name="people" size={15} color={colors.primary} />
          <Text style={s.titlePillText}>{i18n.t('mapMembers')}</Text>
          <View style={s.titleCount}>
            <Text style={s.titleCountText}>{people.length}</Text>
          </View>
        </View>
      </View>

      {/* عمود أزرار التحكم على اليمين (زي Life360) */}
      <View style={s.controls} pointerEvents="box-none">
        <PressableScale style={s.ctrlBtn} onPress={recenterMe}>
          <Ionicons name="locate" size={19} color={myCoord ? colors.primary : colors.muted} />
        </PressableScale>
        <PressableScale style={s.ctrlBtn} onPress={fitAll}>
          <Ionicons name="scan-outline" size={19} color={colors.text} />
        </PressableScale>
        <PressableScale style={[s.ctrlBtn, satelliteOn && s.ctrlBtnActive]} onPress={() => setSatelliteOn(v => !v)}>
          <Ionicons name="globe-outline" size={19} color={satelliteOn ? colors.black : colors.text} />
        </PressableScale>
        <PressableScale style={[s.ctrlBtn, showPlaces && s.ctrlBtnActive]} onPress={() => setShowPlaces(v => !v)}>
          <Ionicons name="storefront-outline" size={18} color={showPlaces ? colors.black : colors.text} />
        </PressableScale>
      </View>

      {/* ====== Bottom sheet: لستة الأعضاء (قابلة للسحب) ====== */}
      <Animated.View style={[s.sheet, { height: SHEET_H, transform: [{ translateY: sheetY }] }]}>
        <View {...pan.panHandlers}>
          <Pressable onPress={() => snapTo(expanded ? COLLAPSED : 0)} style={s.handleArea}>
            <View style={s.handle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{i18n.t('mapMembers')}</Text>
              <Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={18} color={colors.muted} />
            </View>
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.listContent}>
          {people.map(p => {
            const isSel = selected?.entity_id === p.entity_id;
            const ring = colorFor[p.entity_id] ?? PERSON_RING[0];
            const pct = Number(battery(p, states).replace('%', ''));
            return (
              <View key={p.entity_id} style={[s.row, isSel && s.rowSelected]}>
                <Pressable
                  style={s.rowMain}
                  onPress={() => focusPerson(p)}
                  onLongPress={() => {
                    setSelected(p);
                    void toggleTimeline();
                  }}
                  delayLongPress={450}
                >
                  <View style={[s.rowAvatarRing, { borderColor: ring }]}>
                    {avatars[p.entity_id] ? (
                      <Image source={{ uri: avatars[p.entity_id] }} style={s.rowAvatar} />
                    ) : (
                      <View style={[s.rowAvatar, s.avatarFallback]}>
                        <Ionicons name="person" size={20} color={ring} />
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowName} numberOfLines={1}>
                      {String(p.attributes.friendly_name ?? p.entity_id)}
                    </Text>
                    <Text style={s.rowPlace} numberOfLines={1}>
                      {placeLabel(p, addrMap)} · {timeAgo(p.last_changed)}
                    </Text>
                  </View>
                  <View style={s.rowBattery}>
                    <Ionicons name={batteryIcon(pct)} size={15} color={Number.isFinite(pct) && pct < 20 ? colors.danger : colors.muted} />
                    <Text style={s.rowBatteryText}>{battery(p, states)}</Text>
                  </View>
                </Pressable>

                {isSel ? (
                  <View style={s.detailWrap}>
                    {timelineLoading ? (
                      <View style={s.timelineRow}>
                        <ActivityIndicator color={colors.primary} size="small" />
                      </View>
                    ) : null}
                    <View style={s.details}>
                      <Box s={s} label={i18n.t('battery')} value={battery(p, states)} />
                      <Box s={s} label={i18n.t('fromMe')} value={detailFromMe(p)} />
                      {routeInfo && !(me && p.entity_id === me.entity_id) ? (
                        <Box s={s} label={i18n.t('eta')} value={etaText(routeInfo.durationSeconds)} />
                      ) : (
                        <Box
                          s={s}
                          label={i18n.t('locationAccuracy')}
                          value={Number.isFinite(Number(p.attributes.gps_accuracy)) ? distance(Number(p.attributes.gps_accuracy)) : '—'}
                        />
                      )}
                    </View>
                    <View style={s.actionsRow}>
                      <PressableScale style={s.navigate} onPress={() => navigate(p)}>
                        <Ionicons name="navigate" size={18} color={colors.black} />
                        <Text style={s.navigateText}>{i18n.t('navigateToPerson')}</Text>
                      </PressableScale>
                      <PressableScale style={[s.timelineBtn, timelineActive && s.timelineBtnActive]} onPress={() => void toggleTimeline()}>
                        <Ionicons name="time-outline" size={18} color={timelineActive ? colors.black : colors.text} />
                      </PressableScale>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
          <View style={{ height: 20 }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function Box({ s, label, value }: { s: ReturnType<typeof makeStyles>; label: string; value: string }) {
  return (
    <View style={s.box}>
      <Text style={s.boxLabel}>{label}</Text>
      <Text style={s.boxValue}>{value}</Text>
    </View>
  );
}

function mapHtml(points: Point[], zones: Zone[], mode: 'light' | 'dark', c: Palette) {
  const all = [...points.map(p => [p.lat, p.lng]), ...zones.map(z => [z.lat, z.lng])];
  const center = all.find(x => Number.isFinite(x[0]) && Number.isFinite(x[1])) ?? [52.1, 5.1];
  const style = mode === 'dark' ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';
  const popupBg = mode === 'dark' ? '#182535' : '#ffffff';
  const popupText = mode === 'dark' ? '#F5F8FC' : '#0E1620';
  const pts = points.map(p => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, color: p.color, picture: p.picture }));
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"><style>
html,body,#map{height:100%;margin:0;background:${c.background}}
.pin{width:44px;height:56px;position:relative}
.pin-tail{position:absolute;bottom:6px;left:50%;width:16px;height:16px;transform:translateX(-50%) rotate(45deg);border-radius:0 0 4px 0;box-shadow:1px 1px 3px rgba(0,0,0,.3)}
.pin-photo{position:absolute;top:0;left:2px;width:40px;height:40px;border-radius:50%;overflow:hidden;border:3px solid #3d5fef;background:${c.surfaceElevated};box-shadow:0 2px 7px rgba(0,0,0,.35);z-index:1;display:flex;align-items:center;justify-content:center}
.pin-photo img{width:100%;height:100%;object-fit:cover}
.pin-initial{color:#fff;font:700 16px sans-serif}
.me-dot{width:20px;height:20px;border-radius:50%;background:#2a7bff;border:3px solid #fff;box-shadow:0 0 0 4px rgba(42,123,255,.3),0 1px 4px rgba(0,0,0,.4)}
.zone-chip{padding:3px 9px;border-radius:12px;background:${popupBg};color:${popupText};font:700 11px sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.25);white-space:nowrap;opacity:.95}
.place{width:30px;height:30px;border-radius:9px;background:${popupBg};display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.maplibregl-popup-content{background:${popupBg};color:${popupText};font:600 13px sans-serif;border-radius:9px;box-shadow:0 2px 10px rgba(0,0,0,.3)}
.maplibregl-popup-tip{border-top-color:${popupBg} !important;border-bottom-color:${popupBg} !important}
</style></head><body><div id="map"></div><script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script><script>
window.onerror=function(msg,src,line,col){try{window.ReactNativeWebView.postMessage('JS_ERROR:'+msg+' @'+line+':'+col);}catch(e){}};
const map=new maplibregl.Map({container:'map',style:'${style}',center:[${center[1]},${center[0]}],zoom:15,pitch:0,bearing:0,antialias:true,attributionControl:false});
map.on('error',function(e){try{window.ReactNativeWebView.postMessage('MAP_ERROR:'+(e&&e.error?String(e.error.message||e.error):JSON.stringify(e)));}catch(x){}});
map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'bottom-right');
map.addControl(new maplibregl.AttributionControl({compact:true}));
const b=new maplibregl.LngLatBounds();
const markers={};
let meMarker=null;
const POINTS=${JSON.stringify(pts)};
const ZONES=${JSON.stringify(zones)};

function circlePoly(lng,lat,radiusM){
  const pts=[];const R=6378137;const d=(radiusM||100)/R;const latR=lat*Math.PI/180;const lngR=lng*Math.PI/180;
  for(let i=0;i<=64;i++){const brng=i*2*Math.PI/64;const lat2=Math.asin(Math.sin(latR)*Math.cos(d)+Math.cos(latR)*Math.sin(d)*Math.cos(brng));const lng2=lngR+Math.atan2(Math.sin(brng)*Math.sin(d)*Math.cos(latR),Math.cos(d)-Math.sin(latR)*Math.sin(lat2));pts.push([lng2*180/Math.PI,lat2*180/Math.PI]);}
  return {type:'Feature',geometry:{type:'Polygon',coordinates:[pts]}};
}
function makePersonEl(p){
  const el=document.createElement('div');
  el.innerHTML='<div class="pin"><div class="pin-tail" style="background:'+p.color+'"></div><div class="pin-photo" data-pic="'+(p.picture||'')+'" style="border-color:'+p.color+'">'+(p.picture?('<img src="'+p.picture+'">'):('<div class="pin-initial">'+(p.name?p.name.slice(0,1).toUpperCase():'?')+'</div>'))+'</div></div>';
  const node=el.firstChild;
  node.addEventListener('click',function(){try{window.ReactNativeWebView.postMessage(p.id);}catch(e){}});
  return node;
}
function addPerson(p){
  if(!isFinite(p.lng)||!isFinite(p.lat))return;
  const m=new maplibregl.Marker({element:makePersonEl(p),anchor:'bottom'}).setLngLat([p.lng,p.lat]).setPopup(new maplibregl.Popup({offset:36,closeButton:false}).setText(p.name)).addTo(map);
  markers[p.id]=m;
}

map.on('load',function(){
  try{map.addLayer({id:'housenumbers',type:'symbol',source:'openmaptiles','source-layer':'housenumber',minzoom:17,layout:{'text-field':['get','housenumber'],'text-size':10,'text-font':['Noto Sans Regular']},paint:{'text-color':'${c.muted}','text-halo-color':'${popupBg}','text-halo-width':1.3}});}catch(e){window.ReactNativeWebView.postMessage('HOUSENUM_ERR:'+String(e));}

  // طبقة قمر صناعي مجانية (Esri World Imagery، بدون مفتاح) تحت الطرق والأسماء
  try{
    map.addSource('satellite-src',{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,attribution:'Esri'});
    const firstSymbol=map.getStyle().layers.find(function(l){return l.type==='symbol'||l.type==='line'||l.type==='fill-extrusion';});
    map.addLayer({id:'satellite-layer',type:'raster',source:'satellite-src',layout:{visibility:'none'},paint:{'raster-opacity':1}},firstSymbol?firstSymbol.id:undefined);
  }catch(e){window.ReactNativeWebView.postMessage('SAT_ERR:'+String(e));}

  // مناطق Home Assistant كدوائر (Places زي Life360)
  try{
    const feats=ZONES.filter(function(z){return isFinite(z.lng)&&isFinite(z.lat);}).map(function(z){return circlePoly(z.lng,z.lat,z.radius);});
    if(feats.length){
      map.addSource('zones',{type:'geojson',data:{type:'FeatureCollection',features:feats}});
      map.addLayer({id:'zones-fill',type:'fill',source:'zones',paint:{'fill-color':'${c.primary}','fill-opacity':0.12}});
      map.addLayer({id:'zones-line',type:'line',source:'zones',paint:{'line-color':'${c.primary}','line-opacity':0.55,'line-width':2,'line-dasharray':[2,2]}});
    }
    ZONES.forEach(function(z){if(!isFinite(z.lng)||!isFinite(z.lat))return;const el=document.createElement('div');el.className='zone-chip';el.textContent=(z.id==='zone.home'?'⌂ ':'')+z.name;new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([z.lng,z.lat]).addTo(map);b.extend([z.lng,z.lat]);});
  }catch(e){window.ReactNativeWebView.postMessage('ZONE_ERR:'+String(e));}

  window.toggleSatellite=function(on){if(map.getLayer('satellite-layer'))map.setLayoutProperty('satellite-layer','visibility',on?'visible':'none');};

  POINTS.forEach(function(p){addPerson(p);if(isFinite(p.lng)&&isFinite(p.lat))b.extend([p.lng,p.lat]);});
  if(!b.isEmpty())map.fitBounds(b,{padding:{top:90,bottom:200,left:50,right:50},maxZoom:16,duration:0});
});

window.focusPerson=function(id){const m=markers[id];if(!m)return;map.flyTo({center:m.getLngLat(),zoom:16.5,duration:800});m.togglePopup();};
window.setMe=function(lng,lat){
  if(!isFinite(lng)||!isFinite(lat)){if(meMarker){meMarker.remove();meMarker=null;}return;}
  if(meMarker){meMarker.setLngLat([lng,lat]);return;}
  const el=document.createElement('div');el.className='me-dot';
  meMarker=new maplibregl.Marker({element:el}).setLngLat([lng,lat]).addTo(map);
};
window.recenter=function(lng,lat){if(isFinite(lng)&&isFinite(lat))map.flyTo({center:[lng,lat],zoom:16,duration:700});};
window.fitAll=function(){
  const bb=new maplibregl.LngLatBounds();
  Object.keys(markers).forEach(function(id){bb.extend(markers[id].getLngLat());});
  if(meMarker)bb.extend(meMarker.getLngLat());
  if(!bb.isEmpty())map.fitBounds(bb,{padding:{top:90,bottom:200,left:50,right:50},maxZoom:16,duration:600});
};

window.updateMarkers=function(pointsJson){
  const pts=JSON.parse(pointsJson);const seen={};
  pts.forEach(function(p){
    seen[p.id]=true;const m=markers[p.id];
    if(m){
      if(isFinite(p.lng)&&isFinite(p.lat))m.setLngLat([p.lng,p.lat]);
      const el=m.getElement();const photoEl=el&&el.querySelector('.pin-photo');
      if(photoEl&&photoEl.getAttribute('data-pic')!==(p.picture||'')){photoEl.setAttribute('data-pic',p.picture||'');photoEl.innerHTML=p.picture?('<img src="'+p.picture+'">'):('<div class="pin-initial">'+(p.name?p.name.slice(0,1).toUpperCase():'?')+'</div>');}
    }else{addPerson(p);}
  });
  Object.keys(markers).forEach(function(id){if(!seen[id]){markers[id].remove();delete markers[id];}});
};

let routeAbort=null;
window.showRoute=async function(fromLng,fromLat,toLng,toLat){
  if(routeAbort)routeAbort.abort();
  routeAbort=new AbortController();
  try{
    const url='https://router.project-osrm.org/route/v1/driving/'+fromLng+','+fromLat+';'+toLng+','+toLat+'?overview=full&geometries=geojson';
    const res=await fetch(url,{signal:routeAbort.signal});
    const data=await res.json();
    const route=data.routes&&data.routes[0];
    if(!route)return;
    const geojson={type:'Feature',geometry:route.geometry};
    if(map.getSource('route')){map.getSource('route').setData(geojson);}
    else{
      map.addSource('route',{type:'geojson',data:geojson});
      map.addLayer({id:'route-casing',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#0a2a4d','line-width':9}});
      map.addLayer({id:'route-line',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#5c8dff','line-width':5}});
    }
    window.ReactNativeWebView.postMessage('ROUTE_INFO:'+JSON.stringify({distance:route.distance,duration:route.duration}));
  }catch(e){}
};
window.hideRoute=function(){
  if(routeAbort)routeAbort.abort();
  ['route-casing','route-line'].forEach(function(id){if(map.getLayer(id))map.removeLayer(id);});
  if(map.getSource('route'))map.removeSource('route');
};

window.showTimeline=function(pointsJson){
  const pts=JSON.parse(pointsJson);
  if(pts.length<2)return;
  const coords=pts.map(function(p){return [p.lng,p.lat];});
  const geojson={type:'Feature',geometry:{type:'LineString',coordinates:coords}};
  if(map.getSource('timeline')){map.getSource('timeline').setData(geojson);}
  else{
    map.addSource('timeline',{type:'geojson',data:geojson});
    map.addLayer({id:'timeline-line',type:'line',source:'timeline',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffb020','line-width':4,'line-dasharray':[0.3,1.6]}});
  }
  const b2=new maplibregl.LngLatBounds();
  coords.forEach(function(ci){b2.extend(ci);});
  map.fitBounds(b2,{padding:70,maxZoom:16,duration:600});
};
window.hideTimeline=function(){
  if(map.getLayer('timeline-line'))map.removeLayer('timeline-line');
  if(map.getSource('timeline'))map.removeSource('timeline');
};

const placeIcons={restaurant:'🍽️',cafe:'☕',fast_food:'🍔',pharmacy:'💊',hospital:'🏥',bank:'🏦',fuel:'⛽',supermarket:'🛒',school:'🏫',bakery:'🥖',bar:'🍺'};
let placeMarkers=[];
let placesTimer=null;
function clearPlaces(){placeMarkers.forEach(function(m){m.remove();});placeMarkers=[];}
async function loadPlaces(){
  const bounds=map.getBounds();
  const bbox=[bounds.getSouth(),bounds.getWest(),bounds.getNorth(),bounds.getEast()].join(',');
  const query='[out:json][timeout:20];node["amenity"~"restaurant|cafe|fast_food|pharmacy|hospital|bank|fuel|supermarket|school|bakery|bar"]('+bbox+');out center 80;';
  try{
    const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:query});
    const data=await res.json();
    clearPlaces();
    (data.elements||[]).forEach(function(el){
      const amenity=el.tags&&el.tags.amenity;
      const emoji=placeIcons[amenity]||'📍';
      const name=(el.tags&&el.tags.name)||amenity||'Place';
      const el2=document.createElement('div');
      el2.innerHTML='<div class="place">'+emoji+'</div>';
      const m=new maplibregl.Marker({element:el2.firstChild}).setLngLat([el.lon,el.lat]).setPopup(new maplibregl.Popup({offset:18,closeButton:false}).setText(name)).addTo(map);
      placeMarkers.push(m);
    });
  }catch(e){}
}
window.showPlaces=function(){void loadPlaces();if(placesTimer)clearTimeout(placesTimer);map.on('moveend',onPlacesMoveEnd);};
window.hidePlaces=function(){clearPlaces();map.off('moveend',onPlacesMoveEnd);};
function onPlacesMoveEnd(){if(placesTimer)clearTimeout(placesTimer);placesTimer=setTimeout(loadPlaces,600);}
window.ReactNativeWebView.postMessage('MAP_HTML_V2_LOADED');
</script></body></html>`;
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    web: { flex: 1, backgroundColor: colors.background },
    empty: { padding: 24 },
    muted: { color: colors.muted },

    topBar: { position: 'absolute', top: 14, left: 14, right: 14, flexDirection: 'row' },
    titlePill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, elevation: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    titlePillText: { color: colors.text, fontWeight: '800', fontSize: 14 },
    titleCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    titleCountText: { color: colors.black, fontWeight: '900', fontSize: 11 },

    controls: { position: 'absolute', right: 14, top: 64, gap: 10 },
    ctrlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    ctrlBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },

    sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: colors.border, elevation: 20, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: -4 } },
    handleArea: { paddingTop: 10, paddingBottom: 6 },
    handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: colors.border },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
    sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
    listContent: { paddingHorizontal: 12, paddingTop: 6 },

    row: { borderRadius: 18, marginBottom: 8, backgroundColor: colors.surface },
    rowSelected: { backgroundColor: colors.surfaceElevated },
    rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
    rowAvatarRing: { width: 50, height: 50, borderRadius: 25, borderWidth: 2.5, padding: 1.5 },
    rowAvatar: { width: '100%', height: '100%', borderRadius: 22 },
    avatarFallback: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
    rowName: { color: colors.text, fontSize: 16, fontWeight: '800' },
    rowPlace: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
    rowBattery: { alignItems: 'center', gap: 2, minWidth: 42 },
    rowBatteryText: { color: colors.muted, fontSize: 11, fontWeight: '700' },

    detailWrap: { paddingHorizontal: 10, paddingBottom: 12 },
    timelineRow: { alignItems: 'center', paddingVertical: 6 },
    details: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    box: { flexGrow: 1, flexBasis: '30%', backgroundColor: colors.background, borderRadius: 13, padding: 10 },
    boxLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
    boxValue: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
    actionsRow: { flexDirection: 'row', gap: 8 },
    navigate: { flex: 1, backgroundColor: colors.primary, borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    navigateText: { color: colors.black, fontWeight: '900' },
    timelineBtn: { width: 48, borderRadius: 14, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    timelineBtnActive: { backgroundColor: colors.warning, borderColor: colors.warning },
  });
}
