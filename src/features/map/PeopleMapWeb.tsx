import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Image, Linking, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import RNFS from 'react-native-fs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { absoluteHaUrl, authHeaders, getPersonHistory, requestLiveLocation } from '../../api/homeAssistant';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { requestLocationPermission, watchLiveLocation, type LiveLocation } from '../../native/liveLocation';
import { PressableScale } from '../../components/PressableScale';
import {
  bearing,
  coord,
  distance,
  etaText,
  filterNearbyHazards,
  haversine,
  LOW_BATTERY,
  MAX_SPEED_KMH,
  MIN_MOVE_M,
  MOVING_KMH,
  placeLabel,
  reverseGeocode,
  STILL_AFTER_MS,
  timeAgo,
  type Motion,
  type RouteMode,
} from './mapShared';
import { mapHtml, type Point, type Zone } from './mapWebTemplate';

type Props = { people: HaEntity[]; home?: HaEntity; states: HaEntity[]; selectedPersonId?: string; settings: ConnectionSettings };
type Hazard = { id: string; name: string; lat: number; lng: number; source: string; distanceKm: number };

// نغيّر الرقم ده لو عملنا تعديل جوهري في mapHtml، عشان نجبر الـ WebView
// يعمل remount كامل. بنضيف وضع الثيم في الـ key كمان عشان تبديل الثيم
// يعيد بناء الخريطة بالستايل الصح.
const MAP_TEMPLATE_VERSION = 'v14-life360-plus';

// ألوان ثابتة لكل فرد (حلقة الصورة + في اللستة).
const PERSON_RING = ['#5C8DFF', '#2EE6A6', '#FFB020', '#FF4D6D', '#9B6DFF', '#12C2E9', '#FF7A45', '#39C36E'];

const WIN_H = Dimensions.get('window').height;
const SHEET_H = Math.min(560, Math.round(WIN_H * 0.72));
const PEEK = 160;
const COLLAPSED = SHEET_H - PEEK;
// النافجيشن بار تحت بيطلّع دايرة التاب المتفعّل 26px فوق حافته،
// فبنرفع الـ sheet فوقها عشان ما يحصلش تداخل.
const SHEET_BOTTOM = 32;

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

function battery(p: HaEntity, states: HaEntity[]) {
  const n = Number(p.attributes.battery_level);
  if (Number.isFinite(n)) return `${n}%`;
  const key = p.entity_id.split('.')[1];
  const e = states.find(x => x.entity_id.startsWith('sensor.') && x.entity_id.includes(key) && x.entity_id.includes('battery'));
  return e ? `${e.state}%` : '—';
}

function batteryPct(p: HaEntity, states: HaEntity[]): number {
  return Number(battery(p, states).replace('%', ''));
}

function batteryIcon(pct: number): string {
  if (!Number.isFinite(pct)) return 'battery-dead-outline';
  if (pct >= 95) return 'battery-full';
  if (pct >= 45) return 'battery-half';
  return 'battery-dead';
}


export function PeopleMapWeb({ people, states, selectedPersonId, settings }: Props) {
  const { colors, resolvedMode } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [selected, setSelected] = useState<HaEntity | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null);
  const [routeMode, setRouteMode] = useState<RouteMode>('driving');
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineActive, setTimelineActive] = useState(false);
  const [timelineRange, setTimelineRange] = useState(24);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [addrMap, setAddrMap] = useState<Record<string, string>>({});
  const [motion, setMotion] = useState<Record<string, Motion>>({});
  const [showPlaces, setShowPlaces] = useState(false);
  const [showHazards, setShowHazards] = useState(true);
  const [satelliteOn, setSatelliteOn] = useState(false);
  const [follow, setFollow] = useState(false);
  const [batteryAlert, setBatteryAlert] = useState<string | null>(null);
  const webRef = useRef<WebView<object>>(null);
  // مرجع لكل فرد (lat/lng/الوقت) لحساب الحركة فقط - يتحدّث لما الإزاحة تعدّي
  // الحد، عشان نحسب سرعة/اتجاه حقيقيين من غير تشويش (مش بيأثر على مكان العلامة).
  const stableMetaRef = useRef<Record<string, { lat: number; lng: number; t: number }>>({});
  const batteryAlertedRef = useRef<Set<string>>(new Set());

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

  // ====== النقاط ======
  const pointsKey = people.map(p => `${p.entity_id}:${p.attributes.latitude},${p.attributes.longitude}`).join('|');
  // الموقع المعروض = آخر إحداثيات حقيقية من HA مباشرة (مظبوط زي أي تطبيق تاني).
  // الـ deadband تحت بيشتغل على كشف الحركة بس، مش على مكان العلامة، عشان
  // ما نجمّدش موقع غلط/قديم.
  const posFor = (p: HaEntity) => coord(p);
  const points: Point[] = people.map(p => {
    const c = posFor(p);
    return {
      id: p.entity_id,
      name: String(p.attributes.friendly_name ?? p.entity_id),
      lat: c.latitude,
      lng: c.longitude,
      color: colorFor[p.entity_id] ?? PERSON_RING[0],
      picture: avatars[p.entity_id],
      heading: motion[p.entity_id]?.heading,
      moving: motion[p.entity_id]?.moving,
    };
  });

  // ====== كشف السرعة/الاتجاه فقط (مقاومة تشويش GPS) ======
  // مكان العلامة بياخد آخر موقع حقيقي من HA مباشرة (فوق في posFor). هنا بس
  // بنقرر هل الفرد "بيتحرك" فعلاً: ما نعتبرهاش حركة إلا لو الإزاحة أكبر من
  // دقة الـ GPS الحالية (أو 50 متر على الأقل)، عشان ما نقولش "بيتحرك"
  // بالغلط من التشويش وإحنا واقفين. ده مابيأثرش على مكان العلامة.
  useEffect(() => {
    const now = Date.now();
    const meta = stableMetaRef.current;
    const motionUpdates: Record<string, Motion> = {};
    for (const p of people) {
      const lat = Number(p.attributes.latitude);
      const lng = Number(p.attributes.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const acc = Number(p.attributes.gps_accuracy);
      const deadband = Math.max(Number.isFinite(acc) && acc > 0 ? acc : 0, MIN_MOVE_M);
      const prev = meta[p.entity_id];
      if (!prev) {
        meta[p.entity_id] = { lat, lng, t: now };
        continue;
      }
      const d = haversine({ latitude: prev.lat, longitude: prev.lng }, { latitude: lat, longitude: lng });
      if (d > deadband) {
        // حركة حقيقية: نحدّث المرجع ونحسب السرعة والاتجاه
        const dt = (now - prev.t) / 1000;
        const speed = dt > 2 && dt < 3600 ? (d / dt) * 3.6 : 0;
        const realMove = speed > 0 && speed <= MAX_SPEED_KMH;
        motionUpdates[p.entity_id] = {
          speed: realMove ? speed : 0,
          heading: bearing(prev.lat, prev.lng, lat, lng),
          moving: realMove && speed >= MOVING_KMH,
        };
        meta[p.entity_id] = { lat, lng, t: now };
      } else if (motion[p.entity_id]?.moving && now - prev.t > STILL_AFTER_MS) {
        // جوّه الحد لفترة = رجع ثابت
        motionUpdates[p.entity_id] = { speed: 0, heading: motion[p.entity_id]?.heading ?? 0, moving: false };
      }
    }
    if (Object.keys(motionUpdates).length) setMotion(m => ({ ...m, ...motionUpdates }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  // ====== تنبيه البطارية المنخفضة ======
  useEffect(() => {
    for (const p of people) {
      const pct = batteryPct(p, states);
      if (!Number.isFinite(pct)) continue;
      if (pct <= LOW_BATTERY && !batteryAlertedRef.current.has(p.entity_id)) {
        batteryAlertedRef.current.add(p.entity_id);
        setBatteryAlert(String(p.attributes.friendly_name ?? p.entity_id));
      } else if (pct > LOW_BATTERY + 5) {
        batteryAlertedRef.current.delete(p.entity_id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  // ====== موقعي الحي من الموبايل ======
  const me = people.find(p => p.entity_id === selectedPersonId) ?? people[0];
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  useEffect(() => {
    let stopWatch: (() => void) | undefined;
    void requestLocationPermission().then(granted => {
      if (granted) stopWatch = watchLiveLocation(setLiveLocation);
    });
    return () => stopWatch?.();
  }, []);
  // علامتي بإحداثيات HA الصحيحة (اللي بيحسب بيها الحضور) مش الـ GPS المنفصل بتاع
  // المكتبة اللي بيبوظ جوّه المباني ويطلّعني بعيد. المنفصل بس كحل أخير لو مفيش HA.
  const meCoord = me ? coord(me) : undefined;
  const myCoord = meCoord ?? liveLocation;
  useEffect(() => {
    if (myCoord) webRef.current?.injectJavaScript(`window.setMe && window.setMe(${myCoord.longitude},${myCoord.latitude}); true;`);
  }, [myCoord?.latitude, myCoord?.longitude]);

  // ====== طلب الموقع اللايف للشخص المختار (زي Find Hub) ======
  // أول ما تفتح كارت شخص (غير نفسك)، نطلب من موبايله يدخل الوضع اللايف (يبعت
  // موقعه كل ~10 ثواني)، ونكرّر الطلب كل دقيقة طول ما الكارت مفتوح. موبايله
  // بيرجع عادي تلقائيًا بعد ما الطلبات تقف (توفير بطارية).
  const liveActive = !!selected && selected.entity_id !== me?.entity_id;
  useEffect(() => {
    if (!liveActive || !selected) return;
    const target = selected.entity_id;
    const ping = () => void requestLiveLocation(settings, target).catch(() => undefined);
    ping();
    // كل 25ث (أقصر من مهلة الوضع السريع 120ث) عشان جهاز الفرد يفضل في الوضع
    // اللحظي (دفع كل ~2.5-5ث) طول ما إنت فاتح كارته.
    const t = setInterval(ping, 25000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveActive, selected?.entity_id]);

  // ====== المسار من موقعي للشخص المختار (قيادة/مشي/دراجة) ======
  // نقرّب لـ 4 خانات (~11م) عشان تشويش الـ GPS الصغير ما يعيدش طلب المسار كل شوية.
  const selectedCoordKey = selected ? `${posFor(selected).latitude.toFixed(4)},${posFor(selected).longitude.toFixed(4)}` : undefined;
  useEffect(() => {
    if (!selected || !myCoord || selected.entity_id === me?.entity_id) {
      webRef.current?.injectJavaScript(`window.hideRoute && window.hideRoute(); true;`);
      setRouteInfo(null);
      return;
    }
    const target = posFor(selected);
    if (!Number.isFinite(target.latitude) || !Number.isFinite(target.longitude)) return;
    webRef.current?.injectJavaScript(
      `window.showRoute && window.showRoute(${myCoord.longitude},${myCoord.latitude},${target.longitude},${target.latitude},'${routeMode}'); true;`,
    );
  }, [selected?.entity_id, selectedCoordKey, myCoord?.latitude, myCoord?.longitude, routeMode]);

  // ====== وضع المتابعة: الكاميرا تلاحق الشخص المختار وهو بيتحرك ======
  useEffect(() => {
    if (follow && selected) {
      const c = posFor(selected);
      if (Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
        webRef.current?.injectJavaScript(`window.recenter && window.recenter(${c.longitude},${c.latitude}); true;`);
      }
    }
  }, [follow, selectedCoordKey]);

  useEffect(() => {
    if (timelineActive) {
      webRef.current?.injectJavaScript(`window.hideTimeline && window.hideTimeline(); true;`);
      setTimelineActive(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.entity_id]);

  // ====== المناطق (Places من HA) ======
  const zonesKey = states
    .filter(e => e.entity_id.startsWith('zone.'))
    .map(z => `${z.entity_id}:${z.attributes.latitude},${z.attributes.longitude}:${z.attributes.radius}`)
    .join('|');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zonesKey],
  );

  // ====== المخاطر/الكوارث (كيانات geo_location من HA) ======
  const hazardsKey = states
    .filter(e => e.entity_id.startsWith('geo_location.'))
    .map(h => `${h.entity_id}:${h.state}:${h.attributes.latitude},${h.attributes.longitude}`)
    .join('|');
  const allHazards: Hazard[] = useMemo(
    () =>
      states
        .filter(e => e.entity_id.startsWith('geo_location.') && Number.isFinite(Number(e.attributes.latitude)) && Number.isFinite(Number(e.attributes.longitude)))
        .map(h => ({
          id: h.entity_id,
          name: String(h.attributes.friendly_name ?? h.attributes.title ?? h.entity_id.replace('geo_location.', '')),
          lat: Number(h.attributes.latitude),
          lng: Number(h.attributes.longitude),
          source: String(h.attributes.source ?? ''),
          distanceKm: Number(h.state),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hazardsKey],
  );
  // نفس قاعدة الخريطة النيتف بالظبط (دالة مشتركة، مش نسخة تانية): 10كم من
  // البيت أو من أي فرد. وبنفلتر **من المصدر** فالخريطة والبانر يتفقوا.
  const hazardAnchors = useMemo(() => {
    const out: { lat: number; lng: number }[] = [];
    const home = zones.find(z => z.id === 'zone.home');
    if (home) out.push({ lat: home.lat, lng: home.lng });
    for (const p of people) {
      const lat = Number(p.attributes.latitude);
      const lng = Number(p.attributes.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonesKey, pointsKey]);
  const hazardRadiusM = (Number.isFinite(settings.hazardRadiusKm) ? (settings.hazardRadiusKm as number) : 10) * 1000;
  const hazards = useMemo(() => filterNearbyHazards(allHazards, hazardAnchors, hazardRadiusM), [allHazards, hazardAnchors, hazardRadiusM]);
  const nearbyHazards = hazards;
  useEffect(() => {
    webRef.current?.injectJavaScript(`window.setHazards && window.setHazards(${JSON.stringify(JSON.stringify(hazards))}, ${showHazards}); true;`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hazardsKey, showHazards]);

  // بنولّد الـ HTML مرة واحدة ونعيد توليده بس لو الثيم اتغيّر (فاتح/غامق).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => mapHtml(points, zones, resolvedMode, colors), [resolvedMode]);

  const markersKey = JSON.stringify(points.map(p => [p.id, p.lat, p.lng, p.picture ? 1 : 0, p.heading ? Math.round(p.heading) : -1, p.moving ? 1 : 0]));
  useEffect(() => {
    webRef.current?.injectJavaScript(`window.updateMarkers && window.updateMarkers(${JSON.stringify(JSON.stringify(points))}); true;`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey]);

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

  const loadTimeline = async (hours: number) => {
    if (!selected) return;
    setTimelineLoading(true);
    try {
      const pts = await getPersonHistory(settings, selected.entity_id, hours);
      if (pts.length < 2) {
        webRef.current?.injectJavaScript(`window.hideTimeline && window.hideTimeline(); true;`);
        setTimelineActive(false);
        return;
      }
      webRef.current?.injectJavaScript(`window.showTimeline && window.showTimeline(${JSON.stringify(JSON.stringify(pts))}); true;`);
      setTimelineActive(true);
    } finally {
      setTimelineLoading(false);
    }
  };
  const toggleTimeline = async () => {
    if (!selected) return;
    if (timelineActive) {
      webRef.current?.injectJavaScript(`window.hideTimeline && window.hideTimeline(); true;`);
      setTimelineActive(false);
      return;
    }
    await loadTimeline(timelineRange);
  };
  const changeRange = (hours: number) => {
    setTimelineRange(hours);
    if (timelineActive) void loadTimeline(hours);
  };
  const playTimeline = () => webRef.current?.injectJavaScript(`window.playTimeline && window.playTimeline(); true;`);

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
      : distance(haversine(posFor(person), myCoord));

  const RANGES: { h: number; label: string }[] = [
    { h: 24, label: i18n.t('today') },
    { h: 72, label: i18n.t('days3') },
    { h: 168, label: i18n.t('week') },
  ];
  const ROUTE_MODES: { m: RouteMode; icon: string }[] = [
    { m: 'driving', icon: 'car' },
    { m: 'walking', icon: 'walk' },
    { m: 'cycling', icon: 'bicycle' },
  ];

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
            if (liveLocation) webRef.current?.injectJavaScript(`window.setMe && window.setMe(${liveLocation.longitude},${liveLocation.latitude}); true;`);
            webRef.current?.injectJavaScript(`window.setHazards && window.setHazards(${JSON.stringify(JSON.stringify(hazards))}, ${showHazards}); true;`);
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

      {/* شريط علوي: اسم العائلة + بانرات التنبيه */}
      <View style={s.topBar} pointerEvents="box-none">
        <View style={s.titlePill}>
          <Ionicons name="people" size={15} color={colors.primary} />
          <Text style={s.titlePillText}>{i18n.t('mapMembers')}</Text>
          <View style={s.titleCount}>
            <Text style={s.titleCountText}>{people.length}</Text>
          </View>
        </View>
        {showHazards && nearbyHazards.length ? (
          <PressableScale
            style={s.hazardBanner}
            onPress={() => webRef.current?.injectJavaScript(`window.recenter && window.recenter(${nearbyHazards[0].lng},${nearbyHazards[0].lat}); true;`)}
          >
            <Ionicons name="warning" size={16} color="#fff" />
            <Text style={s.bannerText}>
              {nearbyHazards.length} {i18n.t('hazards')} · {i18n.t('hazardNear')}
            </Text>
          </PressableScale>
        ) : null}
        {batteryAlert ? (
          <PressableScale style={s.batteryBanner} onPress={() => setBatteryAlert(null)}>
            <Ionicons name="battery-dead" size={16} color="#fff" />
            <Text style={s.bannerText}>
              {batteryAlert} · {i18n.t('lowBattery')}
            </Text>
            <Ionicons name="close" size={15} color="#fff" />
          </PressableScale>
        ) : null}
      </View>

      {/* عمود أزرار التحكم على اليمين */}
      <View style={s.controls} pointerEvents="box-none">
        <PressableScale style={s.ctrlBtn} onPress={recenterMe}>
          <Ionicons name="locate" size={19} color={myCoord ? colors.primary : colors.muted} />
        </PressableScale>
        <PressableScale style={s.ctrlBtn} onPress={fitAll}>
          <Ionicons name="scan-outline" size={19} color={colors.text} />
        </PressableScale>
        <PressableScale style={[s.ctrlBtn, follow && s.ctrlBtnActive]} onPress={() => setFollow(v => !v)}>
          <Ionicons name="navigate-circle-outline" size={20} color={follow ? colors.black : colors.text} />
        </PressableScale>
        <PressableScale style={[s.ctrlBtn, showHazards && s.ctrlBtnDanger]} onPress={() => setShowHazards(v => !v)}>
          <Ionicons name="warning-outline" size={19} color={showHazards ? '#fff' : colors.text} />
        </PressableScale>
        <PressableScale style={[s.ctrlBtn, satelliteOn && s.ctrlBtnActive]} onPress={() => setSatelliteOn(v => !v)}>
          <Ionicons name="globe-outline" size={19} color={satelliteOn ? colors.black : colors.text} />
        </PressableScale>
        <PressableScale style={[s.ctrlBtn, showPlaces && s.ctrlBtnActive]} onPress={() => setShowPlaces(v => !v)}>
          <Ionicons name="storefront-outline" size={18} color={showPlaces ? colors.black : colors.text} />
        </PressableScale>
      </View>

      {/* ====== Bottom sheet: لستة الأعضاء ====== */}
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
            const pct = batteryPct(p, states);
            const mo = motion[p.entity_id];
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
                    <View style={s.rowNameLine}>
                      <Text style={s.rowName} numberOfLines={1}>
                        {String(p.attributes.friendly_name ?? p.entity_id)}
                      </Text>
                      {isSel && me && p.entity_id !== me.entity_id ? (
                        <View style={s.liveBadge}>
                          <View style={s.liveDot} />
                          <Text style={s.liveText}>{i18n.t('live')}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={s.rowPlaceLine}>
                      {mo?.moving ? <Ionicons name={mo.speed >= 25 ? 'car' : 'walk'} size={12} color={colors.primary} /> : null}
                      <Text style={s.rowPlace} numberOfLines={1}>
                        {placeLabel(p, addrMap, mo)} · {timeAgo(p.last_changed)}
                      </Text>
                    </View>
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
                      {mo?.moving ? (
                        <Box s={s} label={i18n.t('speed')} value={`${Math.round(mo.speed)} km/h`} />
                      ) : routeInfo && !(me && p.entity_id === me.entity_id) ? (
                        <Box s={s} label={i18n.t('eta')} value={etaText(routeInfo.durationSeconds)} />
                      ) : (
                        <Box
                          s={s}
                          label={i18n.t('locationAccuracy')}
                          value={Number.isFinite(Number(p.attributes.gps_accuracy)) ? distance(Number(p.attributes.gps_accuracy)) : '—'}
                        />
                      )}
                    </View>

                    {/* أوضاع المسار (قيادة/مشي/دراجة) - تظهر لما مش أنا */}
                    {!(me && p.entity_id === me.entity_id) ? (
                      <View style={s.segRow}>
                        {ROUTE_MODES.map(rm => (
                          <PressableScale key={rm.m} style={[s.segItem, routeMode === rm.m && s.segItemActive]} onPress={() => setRouteMode(rm.m)}>
                            <Ionicons name={rm.icon} size={17} color={routeMode === rm.m ? colors.black : colors.text} />
                          </PressableScale>
                        ))}
                      </View>
                    ) : null}

                    {/* مدة مسار الحركة */}
                    <View style={s.segRow}>
                      {RANGES.map(r => (
                        <PressableScale key={r.h} style={[s.rangeItem, timelineRange === r.h && s.rangeItemActive]} onPress={() => changeRange(r.h)}>
                          <Text style={[s.rangeText, timelineRange === r.h && s.rangeTextActive]}>{r.label}</Text>
                        </PressableScale>
                      ))}
                    </View>

                    <View style={s.actionsRow}>
                      <PressableScale style={s.navigate} onPress={() => navigate(p)}>
                        <Ionicons name="navigate" size={18} color={colors.black} />
                        <Text style={s.navigateText}>{i18n.t('navigateToPerson')}</Text>
                      </PressableScale>
                      <PressableScale style={[s.iconBtn, timelineActive && s.iconBtnActive]} onPress={() => void toggleTimeline()}>
                        <Ionicons name="time-outline" size={18} color={timelineActive ? colors.black : colors.text} />
                      </PressableScale>
                      {timelineActive ? (
                        <PressableScale style={s.iconBtn} onPress={playTimeline}>
                          <Ionicons name="play" size={18} color={colors.text} />
                        </PressableScale>
                      ) : null}
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

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    web: { flex: 1, backgroundColor: colors.background },
    empty: { padding: 24 },
    muted: { color: colors.muted },

    topBar: { position: 'absolute', top: 14, left: 14, right: 14, gap: 8 },
    titlePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, elevation: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    titlePillText: { color: colors.text, fontWeight: '800', fontSize: 14 },
    titleCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    titleCountText: { color: colors.black, fontWeight: '900', fontSize: 11 },
    hazardBanner: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.danger, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, elevation: 5, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    batteryBanner: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.warning, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, elevation: 5, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    bannerText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },

    controls: { position: 'absolute', right: 14, top: 64, gap: 10 },
    ctrlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    ctrlBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    ctrlBtnDanger: { backgroundColor: colors.danger, borderColor: colors.danger },

    sheet: { position: 'absolute', left: 0, right: 0, bottom: SHEET_BOTTOM, backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, borderWidth: 1, borderColor: colors.border, elevation: 20, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: -4 } },
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
    rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.danger, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
    liveText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
    rowPlaceLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    rowPlace: { color: colors.muted, fontSize: 12.5, flex: 1 },
    rowBattery: { alignItems: 'center', gap: 2, minWidth: 42 },
    rowBatteryText: { color: colors.muted, fontSize: 11, fontWeight: '700' },

    detailWrap: { paddingHorizontal: 10, paddingBottom: 12, gap: 10 },
    timelineRow: { alignItems: 'center', paddingVertical: 2 },
    details: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    box: { flexGrow: 1, flexBasis: '30%', backgroundColor: colors.background, borderRadius: 13, padding: 10 },
    boxLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
    boxValue: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
    segRow: { flexDirection: 'row', gap: 8 },
    segItem: { flex: 1, height: 40, borderRadius: 12, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    segItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    rangeItem: { flex: 1, height: 36, borderRadius: 11, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    rangeItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    rangeText: { color: colors.text, fontSize: 13, fontWeight: '800' },
    rangeTextActive: { color: colors.black },
    actionsRow: { flexDirection: 'row', gap: 8 },
    navigate: { flex: 1, backgroundColor: colors.primary, borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    navigateText: { color: colors.black, fontWeight: '900' },
    iconBtn: { width: 48, borderRadius: 14, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    iconBtnActive: { backgroundColor: colors.warning, borderColor: colors.warning },
  });
}
