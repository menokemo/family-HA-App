// خريطة العيلة بنسخة NATIVE (MapLibre React Native v11) - بديل للخريطة المبنية
// على WebView (PeopleMapWeb). بترسم بالـ GPU مباشرة فأنعم وأسرع.
// المرحلة أ+ب: خريطة أساسية + علامات الأشخاص بالأفاتار + النقطة الزرقاء النيتف
// (UserLocation, Fused عبر locationEngine=google) + المناطق كدوائر (home وغيرها)
// + طبقة المخاطر (geo_location) + مفتاح القمر الصناعي + أزرار تحكم + إعادة تمركز
// + كارت سفلي بتبويبات (MapSheet): People / Devices / Zones / Alerts،
//   والضغط على عنصر يركّز الكاميرا عليه.
// + وضع المباني المجسّمة (3D): بيحوّل الستايل لـ Liberty (فيه مباني مجسّمة وأرقام
//   مباني جاهزين) ويميل الكاميرا.
// باقي (المسار والملاحة، التايملاين والمتابعة) في المرحلتين الجايتين.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { absoluteHaUrl, authHeaders, getPersonHistory, type HistoryPoint } from '../../api/homeAssistant';
import { requestLocationPermission, watchLiveLocation, type LiveLocation } from '../../native/liveLocation';
import { useTheme } from '../../theme';
import { PressableScale } from '../../components/PressableScale';
import { i18n } from '../../i18n';
import {
  PERSON_RING,
  reverseGeocode,
  fetchRoute,
  haversine,
  readMotion,
  batteryPct,
  batteryText,
  placeLabel,
  timeAgo,
  distance,
  LOW_BATTERY,
  type RouteMode,
  type RouteResult,
  type Motion,
} from './mapShared';
import { MapSheet, MAP_SHEET_PEEK } from './MapSheet';
import type { SimpleItem } from './SimpleList';

// بنجيب مكوّنات الخريطة عبر require (CommonJS) مش import: الـ import كان بيتحل
// لنسخة بترجع undefined وقت التشغيل (مشكلة exports field مع metro)، بينما require
// بيجيب النسخة الشغّالة — نفس اللي MapHost بيتأكد من وجودها قبل العرض.
const { Camera, GeoJSONSource, Layer, Map: MapView, Marker, UserLocation, VectorSource } = require('@maplibre/maplibre-react-native') as typeof import('@maplibre/maplibre-react-native');

const ME_COLOR = '#2a7bff';

type Props = { people: HaEntity[]; home?: HaEntity; states: HaEntity[]; selectedPersonId?: string; settings: ConnectionSettings };
type Point = { id: string; name: string; lat: number; lng: number; uri?: string; color: string };
type Zone = { id: string; name: string; lat: number; lng: number; radius: number };
type Hazard = { id: string; name: string; lat: number; lng: number; source: string };

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
  const [buildings3D, setBuildings3D] = useState(false);
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [addrMap, setAddrMap] = useState<Record<string, string>>({});
  const [routeMode, setRouteMode] = useState<RouteMode>('driving');
  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null);
  const [batteryAlert, setBatteryAlert] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);
  const [trail, setTrail] = useState<HistoryPoint[]>([]);
  const [trailRange, setTrailRange] = useState(24);
  const [trailLoading, setTrailLoading] = useState(false);
  const [playIdx, setPlayIdx] = useState<number | null>(null);
  const batteryAlertedRef = useRef<Set<string>>(new Set());
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vectorStyle = resolvedMode === 'dark' ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';
  // Liberty فيه مباني مجسّمة (fill-extrusion) وأرقام مباني جاهزين — بنحوّله مع
  // ميلان الكاميرا لما المستخدم يفعّل وضع المباني المجسّمة.
  const LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  const mapStyle = satelliteOn ? SATELLITE_STYLE : buildings3D ? LIBERTY_STYLE : vectorStyle;
  const pitch = buildings3D && !satelliteOn ? 55 : 0;

  // لون ثابت لكل فرد (نفس ترتيب people) - عشان العلامة واللستة يبقوا متطابقين.
  const colorFor = useMemo(() => {
    const m: Record<string, string> = {};
    people.forEach((p, i) => (m[p.entity_id] = PERSON_RING[i % PERSON_RING.length]));
    return m;
  }, [people]);

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
          return { id: p.entity_id, name: String(p.attributes.friendly_name ?? p.entity_id), lat, lng, uri, color: colorFor[p.entity_id] ?? PERSON_RING[i % PERSON_RING.length] };
        })
        .filter((p): p is Point => p !== null),
    [people, settings, colorFor],
  );

  // العناوين الحقيقية للأفراد اللي بره المناطق (not_home) - BigDataCloud مع كاش.
  useEffect(() => {
    let on = true;
    void (async () => {
      const updates: Record<string, string> = {};
      for (const p of people) {
        if (String(p.state) !== 'not_home') continue;
        const addr = await reverseGeocode(num(p.attributes.latitude), num(p.attributes.longitude), i18n.locale || 'en');
        if (addr) updates[p.entity_id] = addr;
      }
      if (on && Object.keys(updates).length) setAddrMap(m => ({ ...m, ...updates }));
    })();
    return () => {
      on = false;
    };
  }, [people.map(p => `${p.entity_id}:${p.state}:${num(p.attributes.latitude).toFixed(4)},${num(p.attributes.longitude).toFixed(4)}`).join('|')]);

  const pointsKey = useMemo(() => points.map(p => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|'), [points]);

  // الحركة/السرعة/الاتجاه من attribute السرعة الموثوق في الـ device_tracker (HA
  // بيجيبه من الجهاز نفسه) — مش حساب محلي من قفز الموقع (اللي كان بيطلّع سرعة
  // وهمية ومختلفة من موبايل لموبايل). لو الجهاز مش بيبعت سرعة، مفيش حركة (مفيش
  // "بيسوق" كاذب). علامتنا بتبعت speed من الخدمة النيتف.
  const motion = useMemo(() => {
    const m: Record<string, Motion> = {};
    for (const p of people) {
      const mo = readMotion(p, states);
      if (mo) m[p.entity_id] = mo;
    }
    return m;
  }, [people, states]);

  // تنبيه البطارية المنخفضة (مرة لكل فرد لحد ما يشحن فوق الحد+5).
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
        .map(h => ({ id: h.entity_id, name: String(h.attributes.friendly_name ?? h.attributes.title ?? h.entity_id.replace('geo_location.', '')), lat: num(h.attributes.latitude), lng: num(h.attributes.longitude), source: String(h.attributes.source ?? '') })),
    [states],
  );

  // الأجهزة = device_tracker مش مربوط بأي شخص (تاجات/عربيات/تراكرات مستقلة).
  const personTrackers = useMemo(() => {
    const set = new Set<string>();
    states
      .filter(e => e.entity_id.startsWith('person.'))
      .forEach(p => (p.attributes.device_trackers as string[] | undefined)?.forEach(t => set.add(t)));
    return set;
  }, [states]);
  const deviceEntities = useMemo(
    () =>
      states.filter(
        e =>
          e.entity_id.startsWith('device_tracker.') &&
          !personTrackers.has(e.entity_id) &&
          Number.isFinite(num(e.attributes.latitude)) &&
          Number.isFinite(num(e.attributes.longitude)),
      ),
    [states, personTrackers],
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

  // المسار على الطريق (OSRM) من موقعي للفرد المختار - بيتحدّث مع تغيير الاختيار
  // أو وضع المسار أو موقعي. مابيرسمش مسار لنفسي. بيلغي الطلب القديم قبل الجديد.
  const pickedPoint = picked ? points.find(p => p.id === picked) : undefined;
  const pickedCoordKey = pickedPoint ? `${pickedPoint.lng.toFixed(5)},${pickedPoint.lat.toFixed(5)}` : '';
  const myCoordKey = myCoord ? `${myCoord[0].toFixed(5)},${myCoord[1].toFixed(5)}` : '';
  useEffect(() => {
    if (!picked || picked === mePerson?.entity_id || !myCoord || !pickedPoint) {
      setRouteInfo(null);
      return;
    }
    const ctrl = new AbortController();
    void (async () => {
      const r = await fetchRoute(routeMode, myCoord, [pickedPoint.lng, pickedPoint.lat], ctrl.signal);
      if (!ctrl.signal.aborted) setRouteInfo(r);
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, pickedCoordKey, myCoordKey, routeMode, mePerson?.entity_id]);

  const routeFC = useMemo(
    () =>
      routeInfo
        ? { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: routeInfo.geometry }] }
        : { type: 'FeatureCollection' as const, features: [] },
    [routeInfo],
  );

  const homeZone = zones.find(z => z.id === 'zone.home') ?? zones[0];
  const center: [number, number] = myCoord ?? (homeZone ? [homeZone.lng, homeZone.lat] : points[0] ? [points[0].lng, points[0].lat] : [0, 0]);

  // فتح خرائط الموبايل للتوجيه لموقع الفرد.
  const navigateTo = (id: string) => {
    const pt = points.find(p => p.id === id);
    if (!pt) return;
    const label = encodeURIComponent(pt.name);
    const geo = `geo:${pt.lat},${pt.lng}?q=${pt.lat},${pt.lng}(${label})`;
    const primary = Platform.OS === 'ios' ? `maps://?daddr=${pt.lat},${pt.lng}&q=${label}` : geo;
    void Linking.openURL(primary).catch(() =>
      Linking.openURL(`https://www.openstreetmap.org/?mlat=${pt.lat}&mlon=${pt.lng}#map=17/${pt.lat}/${pt.lng}`).catch(() => undefined),
    );
  };

  const focusAt = (lng: number, lat: number, zoom = 15) => cameraRef.current?.flyTo({ center: [lng, lat], zoom, duration: 600 });
  const fromMeText = (lat: number, lng: number) => (myCoord ? distance(haversine({ latitude: myCoord[1], longitude: myCoord[0] }, { latitude: lat, longitude: lng })) : undefined);

  // عناصر التبويبات البسيطة (أجهزة / مناطق / تنبيهات).
  const deviceItems = useMemo<SimpleItem[]>(
    () =>
      deviceEntities.map(d => {
        const bat = batteryText(d, states);
        return {
          id: d.entity_id,
          title: String(d.attributes.friendly_name ?? d.entity_id.replace('device_tracker.', '')),
          subtitle: `${placeLabel(d, addrMap)} · ${timeAgo(d.last_changed)}`,
          meta: bat !== '—' ? bat : undefined,
          icon: 'hardware-chip-outline',
          tint: colors.primary,
        };
      }),
    [deviceEntities, states, addrMap, colors.primary],
  );
  const zoneItems = useMemo<SimpleItem[]>(
    () =>
      zones.map(z => ({
        id: z.id,
        title: z.name,
        subtitle: `${i18n.t('zoneRadius')}: ${z.radius < 1000 ? `${Math.round(z.radius)} m` : `${(z.radius / 1000).toFixed(1)} km`}`,
        icon: z.id === 'zone.home' ? 'home-outline' : 'location-outline',
        tint: colors.primary,
      })),
    [zones, colors.primary],
  );
  const alertItems = useMemo<SimpleItem[]>(
    () =>
      hazards.map(h => ({
        id: h.id,
        title: h.name,
        subtitle: h.source || i18n.t('hazards'),
        meta: fromMeText(h.lat, h.lng),
        icon: 'warning',
        tint: colors.danger,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hazards, myCoordKey, colors.danger],
  );

  // وضع المتابعة: الكاميرا تلاحق الفرد المختار وهو بيتحرك.
  useEffect(() => {
    if (follow && pickedPoint) cameraRef.current?.flyTo({ center: [pickedPoint.lng, pickedPoint.lat], zoom: 16, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, pickedCoordKey]);

  // ====== التايملاين: مسار حركة الفرد (يوم/٣ أيام/أسبوع) + تشغيل ======
  const stopPlay = () => {
    if (playTimerRef.current) clearInterval(playTimerRef.current);
    playTimerRef.current = null;
    setPlayIdx(null);
  };
  const clearTrail = () => {
    stopPlay();
    setTrail([]);
  };
  const loadTrail = async (hours: number) => {
    if (!picked) return;
    setTrailLoading(true);
    try {
      const pts = await getPersonHistory(settings, picked, hours);
      stopPlay();
      setTrail(pts.length >= 2 ? pts : []);
    } finally {
      setTrailLoading(false);
    }
  };
  const toggleTrail = () => {
    if (trail.length) clearTrail();
    else void loadTrail(trailRange);
  };
  const changeRange = (hours: number) => {
    setTrailRange(hours);
    if (trail.length) void loadTrail(hours);
  };
  const playTrail = () => {
    if (trail.length < 2) return;
    if (playTimerRef.current) {
      stopPlay();
      return;
    }
    let i = 0;
    setPlayIdx(0);
    cameraRef.current?.flyTo({ center: [trail[0].lng, trail[0].lat], zoom: 15, duration: 400 });
    playTimerRef.current = setInterval(() => {
      i += 1;
      if (i >= trail.length) {
        stopPlay();
        return;
      }
      setPlayIdx(i);
      cameraRef.current?.flyTo({ center: [trail[i].lng, trail[i].lat], zoom: 15, duration: 250 });
    }, 300);
  };

  // تنظيف المؤقّت + مسح المسار لما يتغيّر الفرد المختار أو الشاشة تتقفل.
  useEffect(() => () => stopPlay(), []);
  useEffect(() => {
    clearTrail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  const trailFC = useMemo(
    () =>
      trail.length >= 2
        ? { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: trail.map(t => [t.lng, t.lat] as [number, number]) } }] }
        : { type: 'FeatureCollection' as const, features: [] },
    [trail],
  );
  const playhead = playIdx !== null && trail[playIdx] ? ([trail[playIdx].lng, trail[playIdx].lat] as [number, number]) : undefined;

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

  // اختيار فرد من اللستة: نركّز الكاميرا عليه ونحدّده (highlight في اللستة).
  const focusPerson = (id: string) => {
    setPicked(id);
    const pt = points.find(p => p.id === id);
    const target: [number, number] | undefined = pt ? [pt.lng, pt.lat] : id === mePerson?.entity_id ? myCoord : undefined;
    if (target) cameraRef.current?.flyTo({ center: target, zoom: 16, duration: 600 });
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView mapStyle={mapStyle} style={{ flex: 1 }}>
        <Camera ref={cameraRef} center={center} zoom={15} pitch={pitch} />

        {/* أرقام المباني: طبقة صريحة من مصدر OpenFreeMap المتجه، تبان من زوم 16. */}
        {buildings3D ? (
          <VectorSource id="omt" url="https://tiles.openfreemap.org/planet">
            <Layer
              id="housenumbers"
              type="symbol"
              source="omt"
              source-layer="housenumber"
              minzoom={16}
              layout={{ 'text-field': ['get', 'housenumber'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 }}
              paint={{
                'text-color': resolvedMode === 'dark' ? '#cbd2db' : '#4a4f59',
                'text-halo-color': resolvedMode === 'dark' ? '#11151c' : '#ffffff',
                'text-halo-width': 1.3,
              }}
            />
          </VectorSource>
        ) : null}
        {/* النقطة الزرقاء الافتراضية بتظهر بس لو ماعرفناش مين "أنا" (fallback) -
            غير كده علامة "أنا" الموحّدة (الأفاتار) بتغطي الموقع الحي. */}
        {!myCoord ? <UserLocation animated /> : null}

        <GeoJSONSource id="zones" data={zonesFC}>
          <Layer id="zones-fill" type="fill" source="zones" paint={{ 'fill-color': '#4F8BFF', 'fill-opacity': 0.12 }} />
          <Layer id="zones-line" type="line" source="zones" paint={{ 'line-color': '#4F8BFF', 'line-width': 2, 'line-opacity': 0.6 }} />
        </GeoJSONSource>

        {/* المسار للفرد المختار: خط أزرق بإطار غامق، تحت علامات الأشخاص. */}
        <GeoJSONSource id="route" data={routeFC}>
          <Layer id="route-casing" type="line" source="route" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#0A2A4D', 'line-width': 8 }} />
          <Layer id="route-line" type="line" source="route" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#5C8DFF', 'line-width': 4.5 }} />
        </GeoJSONSource>

        {/* مسار الحركة (تايملاين): خط برتقالي متقطّع. */}
        <GeoJSONSource id="trail" data={trailFC}>
          <Layer id="trail-line" type="line" source="trail" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#FF9F0A', 'line-width': 4, 'line-dasharray': [1.6, 1.2] }} />
        </GeoJSONSource>

        {playhead ? (
          <Marker id="playhead" lngLat={playhead} anchor="center">
            <View style={styles.playhead} />
          </Marker>
        ) : null}

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

        {otherPoints.map(p => {
          const mo = motion[p.id];
          return (
            <Marker key={p.id} id={p.id} lngLat={[p.lng, p.lat]} anchor="bottom">
              <View style={styles.markerWrap}>
                {mo?.moving ? (
                  <View style={[styles.heading, { transform: [{ rotate: `${Math.round(mo.heading)}deg` }] }]}>
                    <Ionicons name="navigate" size={14} color={p.color} />
                  </View>
                ) : null}
                <View style={[styles.avatar, { borderColor: p.color, backgroundColor: colors.surface }]}>
                  {p.uri ? <Image source={{ uri: p.uri, headers: authHeaders(settings) }} style={styles.avatarImg} /> : <Ionicons name="person" size={22} color={colors.text} />}
                </View>
                <View style={[styles.pin, { backgroundColor: p.color }]} />
              </View>
            </Marker>
          );
        })}

        {/* الأجهزة (device_tracker مش مربوط بشخص): علامة مربّعة بأيقونة جهاز. */}
        {deviceEntities.map(d => (
          <Marker key={d.entity_id} id={d.entity_id} lngLat={[num(d.attributes.longitude), num(d.attributes.latitude)]} anchor="bottom">
            <View style={styles.markerWrap}>
              <View style={[styles.deviceMarker, { backgroundColor: colors.primary }]}>
                <Ionicons name="hardware-chip" size={16} color="#fff" />
              </View>
              <View style={[styles.pin, { backgroundColor: colors.primary }]} />
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

      {batteryAlert ? (
        <PressableScale style={[styles.banner, styles.bannerLow, { backgroundColor: colors.warning }]} onPress={() => setBatteryAlert(null)}>
          <Ionicons name="battery-dead" size={16} color={colors.black} />
          <Text style={[styles.bannerText, { color: colors.black }]}>{batteryAlert} · {i18n.t('lowBattery')}</Text>
        </PressableScale>
      ) : null}

      <View style={styles.controls}>
        <PressableScale style={[styles.ctrl, { backgroundColor: showHazards ? colors.danger : colors.surfaceElevated, borderColor: colors.border }]} onPress={() => setShowHazards(v => !v)} hitSlop={6}>
          <Ionicons name="warning-outline" size={19} color={showHazards ? '#fff' : colors.text} />
        </PressableScale>
        <PressableScale style={[styles.ctrl, { backgroundColor: satelliteOn ? colors.primary : colors.surfaceElevated, borderColor: colors.border }]} onPress={() => setSatelliteOn(v => !v)} hitSlop={6}>
          <Ionicons name="globe-outline" size={19} color={satelliteOn ? colors.black : colors.text} />
        </PressableScale>
        <PressableScale style={[styles.ctrl, { backgroundColor: buildings3D ? colors.primary : colors.surfaceElevated, borderColor: colors.border }]} onPress={() => setBuildings3D(v => !v)} hitSlop={6}>
          <Ionicons name="business-outline" size={19} color={buildings3D ? colors.black : colors.text} />
        </PressableScale>
        <PressableScale style={[styles.ctrl, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} onPress={fitAll} hitSlop={6}>
          <Ionicons name="locate" size={19} color={colors.primary} />
        </PressableScale>
      </View>

      <MapSheet
        people={{
          people,
          states,
          settings,
          colorFor,
          addrMap,
          myCoord,
          meId: mePerson?.entity_id,
          selectedId: picked,
          onSelect: focusPerson,
          routeMode,
          onRouteMode: setRouteMode,
          routeInfo,
          onNavigate: navigateTo,
          motion,
          follow,
          onToggleFollow: () => setFollow(f => !f),
          trailActive: trail.length > 0,
          trailLoading,
          trailRange,
          onToggleTrail: toggleTrail,
          onChangeRange: changeRange,
          onPlayTrail: playTrail,
          playing: playIdx !== null,
        }}
        devices={deviceItems}
        zones={zoneItems}
        alerts={alertItems}
        onPickDevice={id => {
          const d = deviceEntities.find(e => e.entity_id === id);
          if (d) focusAt(num(d.attributes.longitude), num(d.attributes.latitude), 16);
        }}
        onPickZone={id => {
          const z = zones.find(x => x.id === id);
          if (z) focusAt(z.lng, z.lat, 14);
        }}
        onPickAlert={id => {
          const h = hazards.find(x => x.id === id);
          if (h) focusAt(h.lng, h.lat, 13);
        }}
      />
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
  deviceMarker: { width: 32, height: 32, borderRadius: 9, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  playhead: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FF9F0A', borderWidth: 3, borderColor: '#fff', elevation: 4 },
  heading: { marginBottom: 2 },
  bannerLow: { top: 54 },
  banner: { position: 'absolute', top: 14, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  controls: { position: 'absolute', right: 16, bottom: MAP_SHEET_PEEK + 12, gap: 10 },
  ctrl: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
