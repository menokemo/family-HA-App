// خريطة العيلة بنسخة NATIVE (MapLibre React Native v11) - بديل للخريطة المبنية
// على WebView (PeopleMapWeb). بترسم بالـ GPU مباشرة فأنعم وأسرع.
// المرحلة أ+ب: خريطة أساسية + علامات الأشخاص بالأفاتار + النقطة الزرقاء النيتف
// (UserLocation, Fused عبر locationEngine=google) + المناطق كدوائر (home وغيرها)
// + طبقة المخاطر (geo_location) + مفتاح القمر الصناعي + أزرار تحكم + إعادة تمركز.
// باقي (المسار، التايملاين، الموقع الحي عند الطلب) في مرحلة لاحقة.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { absoluteHaUrl, authHeaders } from '../../api/homeAssistant';
import { requestLocationPermission, watchLiveLocation, type LiveLocation } from '../../native/liveLocation';
import { useTheme } from '../../theme';
import { PressableScale } from '../../components/PressableScale';
import { i18n } from '../../i18n';

// بنجيب مكوّنات الخريطة عبر require (CommonJS) مش import: الـ import كان بيتحل
// لنسخة بترجع undefined وقت التشغيل (مشكلة exports field مع metro)، بينما require
// بيجيب النسخة الشغّالة — نفس اللي MapHost بيتأكد من وجودها قبل العرض.
const { Camera, GeoJSONSource, Layer, Map: MapView, Marker, UserLocation } = require('@maplibre/maplibre-react-native') as typeof import('@maplibre/maplibre-react-native');

const ME_COLOR = '#2a7bff';

type Props = { people: HaEntity[]; home?: HaEntity; states: HaEntity[]; selectedPersonId?: string; settings: ConnectionSettings };
type Point = { id: string; name: string; lat: number; lng: number; uri?: string; color: string };
type Zone = { id: string; name: string; lat: number; lng: number; radius: number };
type Hazard = { id: string; name: string; lat: number; lng: number };

const PERSON_RING = ['#4F8BFF', '#34C759', '#FF9F0A', '#FF375F', '#AF52DE', '#5AC8FA'];
const num = (v: unknown) => Number(v);

// ستايل القمر الصناعي (Esri World Imagery) - raster، نفس مصدر الخريطة الحالية.
const SATELLITE_STYLE = {
  version: 8 as const,
  sources: { sat: { type: 'raster' as const, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri, Maxar, Earthstar Geographics' } },
  layers: [{ id: 'sat', type: 'raster' as const, source: 'sat' }],
};

// دايرة جيوديسية (حلقة [lng,lat]) بنصف قطر بالمتر حوالين مركز - عشان نرسم
// المناطق بحجمها الحقيقي على الأرض (CircleLayer نصف قطره بالبكسل مش بالمتر).
function circleRing(lng: number, lat: number, radiusM: number, steps = 64): [number, number][] {
  const earth = 6378137;
  const dLat = (radiusM / earth) * (180 / Math.PI);
  const dLng = (radiusM / (earth * Math.cos((Math.PI * lat) / 180))) * (180 / Math.PI);
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return ring;
}

export function PeopleMapNative({ people, states, selectedPersonId, settings }: Props) {
  const { colors, resolvedMode } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const [showHazards, setShowHazards] = useState(true);
  const [satelliteOn, setSatelliteOn] = useState(false);
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  const vectorStyle = resolvedMode === 'dark' ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';

  // الموقع الحي لتليفوني (Fused عبر Play Services) - بنعرض بيه علامة "أنا"
  // الموحّدة مكان ما كانت النقطة الزرقاء، بدل الأفاتار اللي على موقع HA القديم.
  useEffect(() => {
    let stop: (() => void) | undefined;
    void (async () => {
      if (await requestLocationPermission()) stop = watchLiveLocation(setLiveLocation);
    })();
    return () => stop?.();
  }, []);

  const points = useMemo<Point[]>(
    () =>
      people
        .map((p, i): Point | null => {
          const lat = num(p.attributes.latitude);
          const lng = num(p.attributes.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const pic = p.attributes.entity_picture as string | undefined;
          const uri = pic ? (pic.startsWith('http') ? pic : absoluteHaUrl(settings, pic)) : undefined;
          return { id: p.entity_id, name: String(p.attributes.friendly_name ?? p.entity_id), lat, lng, uri, color: PERSON_RING[i % PERSON_RING.length] };
        })
        .filter((p): p is Point => p !== null),
    [people, settings],
  );

  const zones = useMemo<Zone[]>(
    () =>
      states
        .filter(e => e.entity_id.startsWith('zone.') && Number.isFinite(num(e.attributes.latitude)) && Number.isFinite(num(e.attributes.longitude)))
        .map(z => ({ id: z.entity_id, name: String(z.attributes.friendly_name ?? z.entity_id.replace('zone.', '')), lat: num(z.attributes.latitude), lng: num(z.attributes.longitude), radius: num(z.attributes.radius ?? 100) })),
    [states],
  );

  const hazards = useMemo<Hazard[]>(
    () =>
      states
        .filter(e => e.entity_id.startsWith('geo_location.') && Number.isFinite(num(e.attributes.latitude)) && Number.isFinite(num(e.attributes.longitude)))
        .map(h => ({ id: h.entity_id, name: String(h.attributes.friendly_name ?? h.attributes.title ?? h.entity_id.replace('geo_location.', '')), lat: num(h.attributes.latitude), lng: num(h.attributes.longitude) })),
    [states],
  );

  const zonesFC = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: zones.map(z => ({ type: 'Feature' as const, properties: { id: z.id }, geometry: { type: 'Polygon' as const, coordinates: [circleRing(z.lng, z.lat, z.radius)] } })),
    }),
    [zones],
  );

  // "أنا" = الشخص المطابق لـ selectedPersonId (التطبيق بيظبطه على شخص المستخدم
  // الحالي). علامتي بتبقى عند الموقع الحي لو متاح، وإلا على موقع HA.
  const mePerson = selectedPersonId ? people.find(p => p.entity_id === selectedPersonId) : undefined;
  const meUri = (() => {
    const pic = mePerson?.attributes.entity_picture as string | undefined;
    return pic ? (pic.startsWith('http') ? pic : absoluteHaUrl(settings, pic)) : undefined;
  })();
  const otherPoints = mePerson ? points.filter(p => p.id !== mePerson.entity_id) : points;
  const meHaLat = mePerson ? num(mePerson.attributes.latitude) : NaN;
  const meHaLng = mePerson ? num(mePerson.attributes.longitude) : NaN;
  const myCoord: [number, number] | undefined = liveLocation
    ? [liveLocation.longitude, liveLocation.latitude]
    : Number.isFinite(meHaLat) && Number.isFinite(meHaLng)
      ? [meHaLng, meHaLat]
      : undefined;

  const homeZone = zones.find(z => z.id === 'zone.home') ?? zones[0];
  const center: [number, number] = myCoord ?? (homeZone ? [homeZone.lng, homeZone.lat] : points[0] ? [points[0].lng, points[0].lat] : [0, 0]);

  const fitAll = () => {
    const all: [number, number][] = otherPoints.map(p => [p.lng, p.lat]);
    if (myCoord) all.push(myCoord);
    if (homeZone) all.push([homeZone.lng, homeZone.lat]);
    if (all.length === 0) return;
    const lngs = all.map(c => c[0]);
    const lats = all.map(c => c[1]);
    const w = Math.min(...lngs);
    const e = Math.max(...lngs);
    const sLat = Math.min(...lats);
    const nLat = Math.max(...lats);
    if (w === e && sLat === nLat) {
      cameraRef.current?.flyTo({ center: [w, sLat], zoom: 16, duration: 600 });
      return;
    }
    cameraRef.current?.fitBounds([w, sLat, e, nLat], { padding: { top: 90, bottom: 90, left: 60, right: 60 }, duration: 600 });
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView mapStyle={satelliteOn ? SATELLITE_STYLE : vectorStyle} style={{ flex: 1 }}>
        <Camera ref={cameraRef} center={center} zoom={15} />
        {/* النقطة الزرقاء الافتراضية بتظهر بس لو ماعرفناش مين "أنا" (fallback) -
            غير كده علامة "أنا" الموحّدة (الأفاتار) بتغطي الموقع الحي. */}
        {!myCoord ? <UserLocation animated /> : null}

        <GeoJSONSource id="zones" data={zonesFC}>
          <Layer id="zones-fill" type="fill" source="zones" paint={{ 'fill-color': '#4F8BFF', 'fill-opacity': 0.12 }} />
          <Layer id="zones-line" type="line" source="zones" paint={{ 'line-color': '#4F8BFF', 'line-width': 2, 'line-opacity': 0.6 }} />
        </GeoJSONSource>

        {zones.map(z => (
          <Marker key={z.id} id={`zlabel-${z.id}`} lngLat={[z.lng, z.lat]} anchor="center">
            <View style={[styles.zoneChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 11 }}>{z.id === 'zone.home' ? '⌂ ' : ''}{z.name}</Text>
            </View>
          </Marker>
        ))}

        {showHazards
          ? hazards.map(h => (
              <Marker key={h.id} id={`haz-${h.id}`} lngLat={[h.lng, h.lat]} anchor="center">
                <View style={styles.hazard}>
                  <Ionicons name="warning" size={16} color="#fff" />
                </View>
              </Marker>
            ))
          : null}

        {otherPoints.map(p => (
          <Marker key={p.id} id={p.id} lngLat={[p.lng, p.lat]} anchor="bottom">
            <View style={styles.markerWrap}>
              <View style={[styles.avatar, { borderColor: p.color, backgroundColor: colors.surface }]}>
                {p.uri ? <Image source={{ uri: p.uri, headers: authHeaders(settings) }} style={styles.avatarImg} /> : <Ionicons name="person" size={22} color={colors.text} />}
              </View>
              <View style={[styles.pin, { backgroundColor: p.color }]} />
            </View>
          </Marker>
        ))}

        {/* علامة "أنا" الموحّدة: الأفاتار عند الموقع الحي (مكان النقطة الزرقاء) -
            بحلقة زرقا تميّزها إنها موقعك الحي. */}
        {mePerson && myCoord ? (
          <Marker id="me" lngLat={myCoord} anchor="bottom">
            <View style={styles.markerWrap}>
              <View style={[styles.avatar, styles.avatarMe, { backgroundColor: colors.surface }]}>
                {meUri ? <Image source={{ uri: meUri, headers: authHeaders(settings) }} style={styles.avatarImg} /> : <Ionicons name="person" size={22} color={colors.text} />}
              </View>
              <View style={[styles.pin, { backgroundColor: ME_COLOR }]} />
            </View>
          </Marker>
        ) : null}
      </MapView>

      {showHazards && hazards.length ? (
        <PressableScale style={[styles.banner, { backgroundColor: colors.danger }]} onPress={() => hazards[0] && cameraRef.current?.flyTo({ center: [hazards[0].lng, hazards[0].lat], zoom: 14, duration: 600 })}>
          <Ionicons name="warning" size={16} color="#fff" />
          <Text style={styles.bannerText}>{hazards.length} {i18n.t('hazards')}</Text>
        </PressableScale>
      ) : null}

      <View style={styles.controls}>
        <PressableScale style={[styles.ctrl, { backgroundColor: showHazards ? colors.danger : colors.surfaceElevated, borderColor: colors.border }]} onPress={() => setShowHazards(v => !v)} hitSlop={6}>
          <Ionicons name="warning-outline" size={19} color={showHazards ? '#fff' : colors.text} />
        </PressableScale>
        <PressableScale style={[styles.ctrl, { backgroundColor: satelliteOn ? colors.primary : colors.surfaceElevated, borderColor: colors.border }]} onPress={() => setSatelliteOn(v => !v)} hitSlop={6}>
          <Ionicons name="globe-outline" size={19} color={satelliteOn ? colors.black : colors.text} />
        </PressableScale>
        <PressableScale style={[styles.ctrl, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} onPress={fitAll} hitSlop={6}>
          <Ionicons name="locate" size={19} color={colors.primary} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  markerWrap: { alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarMe: { borderColor: ME_COLOR, borderWidth: 4, shadowColor: ME_COLOR, shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  avatarImg: { width: '100%', height: '100%' },
  pin: { width: 10, height: 10, borderRadius: 5, marginTop: -3, transform: [{ rotate: '45deg' }] },
  zoneChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  hazard: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E53935', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  banner: { position: 'absolute', top: 14, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  controls: { position: 'absolute', right: 16, bottom: 24, gap: 10 },
  ctrl: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
