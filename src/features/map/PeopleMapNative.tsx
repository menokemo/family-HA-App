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
  filterNearbyHazards,
  hazardKind,
  hazardSeverity,
  isDisasterKind,
  type HazardKind,
  type HazardSeverity,
  compassKey,
  bearing,
  haversine,
  readMotion,
  batteryPct,
  batteryText,
  placeLabel,
  timeAgo,
  distance,
  segmentTrips,
  LOW_BATTERY,
  type RouteMode,
  type RouteResult,
  type Motion,
  type Trip,
} from './mapShared';
import { MapSheet, MAP_SHEET_PEEK } from './MapSheet';
import { PersonMarker } from './PersonMarker';
import { ZoneBubble, type BubbleMember } from './ZoneBubble';
import type { SimpleItem } from './SimpleList';

// بنجيب مكوّنات الخريطة عبر require (CommonJS) مش import: الـ import كان بيتحل
// لنسخة بترجع undefined وقت التشغيل (مشكلة exports field مع metro)، بينما require
// بيجيب النسخة الشغّالة — نفس اللي MapHost بيتأكد من وجودها قبل العرض.
const { Camera, GeoJSONSource, Layer, Map: MapView, Marker, UserLocation, VectorSource } = require('@maplibre/maplibre-react-native') as typeof import('@maplibre/maplibre-react-native');

const ME_COLOR = '#2a7bff';
// فوق الزوم ده بنفك تجميع سكان الزون ونعرض كل واحد على إحداثيه (زي الرسمي:
// "everyone in a zone shares its bubble until zooming spreads them").
const ZONE_SPREAD_ZOOM = 17;

type Props = { people: HaEntity[]; home?: HaEntity; states: HaEntity[]; selectedPersonId?: string; settings: ConnectionSettings };
type Point = { id: string; name: string; lat: number; lng: number; uri?: string; color: string };
type Zone = { id: string; name: string; lat: number; lng: number; radius: number };
type Hazard = { id: string; name: string; lat: number; lng: number; source: string; kind: HazardKind; severity?: HazardSeverity };

// أيقونة ولون لكل نوع بلاغ. ألوان ثابتة (مش من الثيم) عشان تفضل مميّزة في
// الوضعين الفاتح والغامق.
const HAZARD_STYLE: Record<HazardKind, { icon: string; color: string }> = {
  ambulance: { icon: 'medical', color: '#E53935' },
  fire: { icon: 'flame', color: '#F57C00' },
  police: { icon: 'shield', color: '#1E6FE0' },
  accident: { icon: 'car-sport', color: '#8E5FE8' },
  earthquake: { icon: 'pulse', color: '#9C6B1E' },
  flood: { icon: 'water', color: '#1EA7C4' },
  storm: { icon: 'thunderstorm', color: '#5A6B8C' },
  other: { icon: 'warning', color: '#E0A800' },
};
// لون الخطورة للحدود (أحمر/برتقالي/أخضر). الحشو = النوع، الحدود = الخطورة، فتعرف
// الاتنين من نظرة. لو مفيش خطورة (بلاغات محلية) الحدود تفضل بيضا.
const SEVERITY_COLOR: Record<HazardSeverity, string> = { high: '#E53935', moderate: '#F57C00', low: '#2E9E5B' };
const hazStyle = (h: Hazard) => HAZARD_STYLE[h.kind];
type PresenceEvt = { id: string; person: string; kind: 'arrive' | 'leave'; place: string; ts: number };

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
  const [selHazardId, setSelHazardId] = useState<string | null>(null);
  const [satelliteOn, setSatelliteOn] = useState(false);
  const [buildings3D, setBuildings3D] = useState(false);
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  const [zoom, setZoom] = useState(15);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [addrMap, setAddrMap] = useState<Record<string, string>>({});
  const [routeMode, setRouteMode] = useState<RouteMode>('driving');
  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null);
  // مسار الطريق من البيت للفرد المختار — عشان "of home" تبقى مسافة طريق فعلية
  // (مش مستقيمة)، فتساوي "From me" وإنت في البيت.
  const [homeRouteInfo, setHomeRouteInfo] = useState<RouteResult | null>(null);
  const [batteryAlert, setBatteryAlert] = useState<string | null>(null);
  const [presence, setPresence] = useState<PresenceEvt[]>([]);
  const prevStateRef = useRef<Record<string, string>>({});
  const presenceInitRef = useRef(false);
  const [follow, setFollow] = useState(false);
  // وضع الملاحة: الخريطة بتلف مع اتجاه مواجهة الموبايل بدل ما الشمال ثابت
  // لفوق. MapLibre عنده الوضع ده جاهز (trackUserLocation="heading") وبيقرا
  // بوصلة الجهاز نيتف — من غير مكتبة زيادة ولا كود نيتف عندنا.
  const [headingUp, setHeadingUp] = useState(false);
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

  // اسم المكان لكل فرد (بيت/شغل/عنوان) — بيتعرض كبابل جنب صورته على الخريطة.
  const placeFor = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of people) m[p.entity_id] = placeLabel(p, addrMap, motion[p.entity_id]);
    return m;
  }, [people, addrMap, motion]);

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

  // كشف وصول/مغادرة كل فرد: نقارن حالته (اسم المنطقة) بآخر حالة متخزّنة؛ لو
  // اتغيّرت نضيف حدث لتبويب التنبيهات. أول تحميل بنسجّل الحالات من غير أحداث
  // (عشان مايطلعش سيل أحداث وهمية وقت فتح التطبيق).
  useEffect(() => {
    const isZone = (s: string) => !!s && !['not_home', 'unknown', 'unavailable', ''].includes(s);
    const prev = prevStateRef.current;
    const next: Record<string, string> = {};
    const fresh: PresenceEvt[] = [];
    for (const p of people) {
      const st = String(p.state ?? '');
      next[p.entity_id] = st;
      const was = prev[p.entity_id];
      if (!presenceInitRef.current || was === undefined || was === st) continue;
      const name = String(p.attributes.friendly_name ?? p.entity_id);
      const ts = Date.now();
      if (isZone(st)) {
        fresh.push({ id: `${p.entity_id}-${ts}`, person: name, kind: 'arrive', place: st === 'home' ? i18n.t('placeHome') : st, ts });
      } else if (st === 'not_home' && isZone(was)) {
        fresh.push({ id: `${p.entity_id}-${ts}`, person: name, kind: 'leave', place: was === 'home' ? i18n.t('placeHome') : was, ts });
      }
    }
    prevStateRef.current = next;
    presenceInitRef.current = true;
    if (fresh.length) setPresence(prevList => [...fresh, ...prevList].slice(0, 20));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people.map(p => `${p.entity_id}=${p.state}`).join('|')]);

  const zones = useMemo<Zone[]>(
    () =>
      states
        .filter(e => e.entity_id.startsWith('zone.') && Number.isFinite(num(e.attributes.latitude)) && Number.isFinite(num(e.attributes.longitude)))
        .map(z => ({ id: z.entity_id, name: String(z.attributes.friendly_name ?? z.entity_id.replace('zone.', '')), lat: num(z.attributes.latitude), lng: num(z.attributes.longitude), radius: num(z.attributes.radius ?? 100) })),
    [states],
  );

  const allHazards = useMemo<Hazard[]>(
    () =>
      states
        .filter(e => e.entity_id.startsWith('geo_location.') && Number.isFinite(num(e.attributes.latitude)) && Number.isFinite(num(e.attributes.longitude)))
        .map(h => {
          const name = String(h.attributes.friendly_name ?? h.attributes.title ?? h.entity_id.replace('geo_location.', ''));
          const source = String(h.attributes.source ?? '');
          return { id: h.entity_id, name, lat: num(h.attributes.latitude), lng: num(h.attributes.longitude), source, kind: hazardKind(`${name} ${source}`), severity: hazardSeverity(h.attributes) };
        }),
    [states],
  );
  // HA بيجيب كل مخاطر البلد (عشرات الحوادث البعيدة). بنفلترها على 10كم من البيت
  // أو من أي فرد — وبنفلترها **من المصدر** عشان الخريطة والبانر واللستة كلهم
  // يتكلموا بنفس الرقم، مش لستة نضيفة وخريطة مليانة علامات بعيدة.
  const hazardAnchors = useMemo(() => {
    const out: { lat: number; lng: number }[] = [];
    const home = zones.find(z => z.id === 'zone.home');
    if (home) out.push({ lat: home.lat, lng: home.lng });
    for (const p of people) {
      const lat = num(p.attributes.latitude);
      const lng = num(p.attributes.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
    }
    return out;
  }, [zones, people]);
  // نطاقين منفصلين بيتحكّم فيهم الأدمن (كم، بينتشروا): البلاغات المحلية
  // (إسعاف/مطافي/شرطة/حادث) بنطاق قريب، والكوارث الطبيعية (زلزال/فيضان/عاصفة)
  // بنطاق أوسع لأنها بتأثّر من مسافة أبعد. 0 في أي منهم = قافل نوعه.
  const hazardRadiusM = (Number.isFinite(settings.hazardRadiusKm) ? (settings.hazardRadiusKm as number) : 10) * 1000;
  const disasterRadiusM = (Number.isFinite(settings.disasterRadiusKm) ? (settings.disasterRadiusKm as number) : 100) * 1000;
  const hazards = useMemo(() => {
    const local = filterNearbyHazards(allHazards.filter(h => !isDisasterKind(h.kind)), hazardAnchors, hazardRadiusM);
    const disaster = filterNearbyHazards(allHazards.filter(h => isDisasterKind(h.kind)), hazardAnchors, disasterRadiusM);
    return [...disaster, ...local];
  }, [allHazards, hazardAnchors, hazardRadiusM, disasterRadiusM]);

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
  // علامتي بتستخدم **إحداثيات HA الصحيحة** (نفس اللي HA بيحسب بيها الحضور وبيعرضها
  // الخريطة الرسمية) — مش الـ GPS المنفصل بتاع المكتبة (`liveLocation`) اللي بيبوظ
  // جوّه المباني ويطلّعني بعيد بالرغم إن HA عنده موقعي صح. الـ GPS المنفصل بس كحل
  // أخير لو HA مفيهوش إحداثيات.
  const myCoord: [number, number] | undefined =
    Number.isFinite(meHaLat) && Number.isFinite(meHaLng)
      ? [meHaLng, meHaLat]
      : liveLocation
        ? [liveLocation.longitude, liveLocation.latitude]
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

  // ====== تجميع سكان الزون في فقاعة واحدة (زي خريطة HA الرسمية) ======
  // نفس منطق ha-map.ts: لو الكيان عنده `in_zones` بناخد أول زون فعّال منها،
  // وإلا (ومادام مش not_home) نحسب أصغر زون محتوياه مع مراعاة دقة الـ GPS —
  // نفس شرط HA: distance - accuracy < radius.
  const zoneIdOf = (p: HaEntity): string | undefined => {
    const inZones = p.attributes.in_zones as string[] | undefined;
    if (Array.isArray(inZones) && inZones.length > 0) {
      const active = inZones.find(id => {
        const z = states.find(s => s.entity_id === id);
        return !!z && z.attributes.passive !== true;
      });
      if (active && zones.some(z => z.id === active)) return active;
      return undefined;
    }
    const st = String(p.state ?? '');
    if (['not_home', 'unknown', 'unavailable', ''].includes(st)) return undefined;
    const lat = num(p.attributes.latitude);
    const lng = num(p.attributes.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    const acc = Number.isFinite(num(p.attributes.gps_accuracy)) ? num(p.attributes.gps_accuracy) : 0;
    let found: string | undefined;
    let foundRadius = Infinity;
    for (const z of zones) {
      const d = haversine({ latitude: lat, longitude: lng }, { latitude: z.lat, longitude: z.lng });
      if (d - acc < z.radius && z.radius < foundRadius) {
        found = z.id;
        foundRadius = z.radius;
      }
    }
    return found;
  };

  // تحت زوم معيّن بنجمّع، وفوقه بنفك التجميع ونعرض كل واحد على إحداثيه الحقيقي.
  const grouped = useMemo(() => {
    const byZone: Record<string, BubbleMember[]> = {};
    const loose = new Set<string>();
    if (zoom >= ZONE_SPREAD_ZOOM) {
      people.forEach(p => loose.add(p.entity_id));
      return { byZone, loose };
    }
    for (const p of people) {
      const zid = zoneIdOf(p);
      const pt = points.find(x => x.id === p.entity_id);
      if (!zid || !pt) {
        loose.add(p.entity_id);
        continue;
      }
      (byZone[zid] ??= []).push({ id: pt.id, name: pt.name, uri: pt.uri, color: pt.color });
    }
    return { byZone, loose };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, points, zones, states, zoom]);

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
  // اتجاه ومسافة كل فرد بالنسبة للبيت — بيظهر في كارت الفرد. مش بنعرضه للي
  // جوّه البيت أصلاً ("0 متر شمال البيت" كلام مالوش معنى).
  const homeDirFor = useMemo(() => {
    const m: Record<string, string> = {};
    const home = zones.find(z => z.id === 'zone.home');
    if (!home) return m;
    for (const p of people) {
      const lat = num(p.attributes.latitude);
      const lng = num(p.attributes.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const d = haversine({ latitude: lat, longitude: lng }, { latitude: home.lat, longitude: home.lng });
      if (d <= home.radius) continue;
      m[p.entity_id] = `${distance(d)} ${i18n.t(compassKey(bearing(home.lat, home.lng, lat, lng)))}`;
    }
    return m;
  }, [people, zones]);

  // مسار الطريق من البيت للفرد المختار (بنفس وضع المسار). بيلغي القديم قبل الجديد.
  const homeCoordKey = homeZone ? `${homeZone.lng.toFixed(5)},${homeZone.lat.toFixed(5)}` : '';
  useEffect(() => {
    if (!picked || picked === mePerson?.entity_id || !homeZone || !pickedPoint) {
      setHomeRouteInfo(null);
      return;
    }
    const ctrl = new AbortController();
    void (async () => {
      const r = await fetchRoute(routeMode, [homeZone.lng, homeZone.lat], [pickedPoint.lng, pickedPoint.lat], ctrl.signal);
      if (!ctrl.signal.aborted) setHomeRouteInfo(r);
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, pickedCoordKey, homeCoordKey, routeMode, mePerson?.entity_id]);

  const fromMeText = (lat: number, lng: number) => (myCoord ? distance(haversine({ latitude: myCoord[1], longitude: myCoord[0] }, { latitude: lat, longitude: lng })) : undefined);

  // أقرب مرساة (البيت أو أي فرد) لنقطة خطر — بنفس مجموعة المراسي اللي بنفلتر بيها.
  const nearestAnchor = (lat: number, lng: number): { name: string; d: number } | undefined => {
    const cands: { name: string; d: number }[] = [];
    const home = zones.find(z => z.id === 'zone.home');
    if (home && Number.isFinite(home.lat) && Number.isFinite(home.lng)) cands.push({ name: home.name, d: haversine({ latitude: lat, longitude: lng }, { latitude: home.lat, longitude: home.lng }) });
    for (const p of people) {
      const plat = num(p.attributes.latitude);
      const plng = num(p.attributes.longitude);
      if (Number.isFinite(plat) && Number.isFinite(plng)) cands.push({ name: String(p.attributes.friendly_name ?? p.entity_id), d: haversine({ latitude: lat, longitude: lng }, { latitude: plat, longitude: plng }) });
    }
    if (!cands.length) return undefined;
    return cands.reduce((a, b) => (b.d < a.d ? b : a));
  };

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
  // تنبيهات الأفراد: أحداث وصول/مغادرة (آخر ٦ ساعات) + بطارية ضعيفة + مش بيبعت
  // موقع (آخر تحديث أقدم من نص ساعة). بتظهر فوق المخاطر في تبويب التنبيهات.
  const memberAlerts = useMemo<SimpleItem[]>(() => {
    const out: SimpleItem[] = [];
    const now = Date.now();
    for (const e of presence) {
      if (now - e.ts > 6 * 3600 * 1000) continue;
      out.push({
        id: `evt-${e.id}`,
        title: `${e.person} ${e.kind === 'arrive' ? i18n.t('arrived') : i18n.t('left')} ${e.place}`,
        subtitle: timeAgo(new Date(e.ts).toISOString()),
        icon: e.kind === 'arrive' ? 'enter-outline' : 'exit-outline',
        tint: e.kind === 'arrive' ? colors.safe : colors.muted,
      });
    }
    for (const p of people) {
      const name = String(p.attributes.friendly_name ?? p.entity_id);
      const pct = batteryPct(p, states);
      if (Number.isFinite(pct) && pct <= LOW_BATTERY) {
        out.push({ id: `bat-${p.entity_id}`, title: `${name} · ${i18n.t('lowBattery')}`, subtitle: `${Math.round(pct)}%`, icon: 'battery-dead', tint: colors.warning });
      }
      const last = p.last_updated ?? p.last_changed;
      if (last && now - new Date(last).getTime() > 30 * 60 * 1000) {
        out.push({ id: `off-${p.entity_id}`, title: `${name} · ${i18n.t('offline')}`, subtitle: timeAgo(last), icon: 'cloud-offline-outline', tint: colors.muted });
      }
    }
    return out;
  }, [presence, people, states, colors.safe, colors.muted, colors.warning]);

  // تنبيهات العيلة والمخاطر العامة **مفصولين** بعنوان لكل مجموعة — مش مخلوطين.
  const alertItems = useMemo<SimpleItem[]>(
    () => [
      ...memberAlerts.map(a => ({ ...a, section: i18n.t('familyAlerts') })),
      ...hazards.map(h => ({
        id: h.id,
        title: h.name,
        subtitle: h.source || i18n.t('hazards'),
        meta: fromMeText(h.lat, h.lng),
        icon: hazStyle(h).icon,
        tint: hazStyle(h).color,
        section: i18n.t('nearbyHazards'),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberAlerts, hazards, myCoordKey, colors.danger],
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

  // تقطيع تاريخ الحركة لرحلات (وقوف→حركة→وقوف) + تركيز الكاميرا على رحلة مختارة.
  const trips = useMemo<Trip[]>(() => segmentTrips(trail), [trail]);
  const focusTrip = (t: Trip) => {
    if (t.points.length === 0) return;
    const lngs = t.points.map(p => p[0]);
    const lats = t.points.map(p => p[1]);
    const w = Math.min(...lngs);
    const e = Math.max(...lngs);
    const sLat = Math.min(...lats);
    const nLat = Math.max(...lats);
    if (w === e && sLat === nLat) cameraRef.current?.flyTo({ center: [w, sLat], zoom: 15, duration: 500 });
    else cameraRef.current?.fitBounds([w, sLat, e, nLat], { padding: { top: 90, bottom: MAP_SHEET_PEEK + 40, left: 50, right: 50 }, duration: 500 });
  };

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
      <MapView
        mapStyle={mapStyle}
        style={{ flex: 1 }}
        onRegionDidChange={e => {
          const z = e?.nativeEvent?.zoom;
          if (typeof z === 'number' && Number.isFinite(z)) setZoom(z);
        }}
      >
        <Camera
          ref={cameraRef}
          center={center}
          zoom={15}
          pitch={pitch}
          trackUserLocation={headingUp ? 'heading' : undefined}
          // لو المستخدم حرّك الخريطة بإيده، MapLibre بيوقف التتبّع — بنطفّي
          // الزرار كمان عشان الواجهة تقول الحقيقة.
          onTrackUserLocationChange={e => {
            if (headingUp && !e?.nativeEvent?.trackUserLocation) setHeadingUp(false);
          }}
        />

        {/* أرقام المباني: طبقة صريحة من مصدر OpenFreeMap المتجه — ظاهرة دايمًا
            (مش مربوطة بوضع 3D) من زوم 17 (مستوى الشارع) عشان ماتعملش زحمة. */}
        <VectorSource id="omt" url="https://tiles.openfreemap.org/planet">
          <Layer
            id="housenumbers"
            type="symbol"
            source="omt"
            source-layer="housenumber"
            minzoom={17}
            layout={{ 'text-field': ['get', 'housenumber'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 }}
            paint={{
              'text-color': resolvedMode === 'dark' ? '#cbd2db' : '#4a4f59',
              'text-halo-color': resolvedMode === 'dark' ? '#11151c' : '#ffffff',
              'text-halo-width': 1.3,
            }}
          />
        </VectorSource>
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
                <PressableScale onPress={() => { setSelHazardId(h.id); focusAt(h.lng, h.lat, 14); }}>
                  <View style={[styles.hazard, { backgroundColor: hazStyle(h).color }, h.severity ? { borderColor: SEVERITY_COLOR[h.severity], borderWidth: 3 } : null]}>
                    <Ionicons name={hazStyle(h).icon} size={16} color="#fff" />
                  </View>
                </PressableScale>
              </Marker>
            ))
          : null}

        {/* فقاعة واحدة لكل زون فيها سكانه (زي الخريطة الرسمية) — الضغط بيقرّب
            عشان تتفك لأفراد. */}
        {Object.entries(grouped.byZone).map(([zid, members]) => {
          const z = zones.find(x => x.id === zid);
          if (!z || members.length === 0) return null;
          return (
            <ZoneBubble
              key={`zb-${zid}`}
              id={`zb-${zid}`}
              lat={z.lat}
              lng={z.lng}
              members={members}
              settings={settings}
              onPress={() => cameraRef.current?.flyTo({ center: [z.lng, z.lat], zoom: ZONE_SPREAD_ZOOM + 1, duration: 600 })}
            />
          );
        })}

        {otherPoints
          .filter(p => grouped.loose.has(p.id))
          .map(p => (
            <PersonMarker
              key={p.id}
              id={p.id}
              name={p.name}
              lat={p.lat}
              lng={p.lng}
              color={p.color}
              place={placeFor[p.id] ?? ''}
              uri={p.uri}
              motion={motion[p.id]}
              selected={picked === p.id}
              settings={settings}
            />
          ))}

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
        {mePerson && myCoord && grouped.loose.has(mePerson.entity_id) ? (
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
        <PressableScale
          style={[styles.ctrl, { backgroundColor: headingUp ? colors.primary : colors.surfaceElevated, borderColor: colors.border }]}
          onPress={() => setHeadingUp(v => !v)}
          hitSlop={6}
          accessibilityLabel={i18n.t('headingUp')}
        >
          <Ionicons name="compass-outline" size={19} color={headingUp ? colors.black : colors.text} />
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
          trips,
          homeDir: homeDirFor,
          homeRouteInfo,
          onPickTrip: focusTrip,
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
          if (h) { focusAt(h.lng, h.lat, 13); setSelHazardId(h.id); }
        }}
      />

      {/* تفاصيل الخطر عند الضغط: نوعه + أقرب فرد/البيت والمسافة + المسافة مني. */}
      {(() => {
        const h = selHazardId ? hazards.find(x => x.id === selHazardId) : undefined;
        if (!h) return null;
        const near = nearestAnchor(h.lat, h.lng);
        const mine = fromMeText(h.lat, h.lng);
        return (
          <View style={styles.hazCard} pointerEvents="box-none">
            <View style={[styles.hazCardInner, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <View style={styles.hazCardHead}>
                <View style={[styles.hazCardIcon, { backgroundColor: hazStyle(h).color }]}><Ionicons name={hazStyle(h).icon} size={20} color="#fff" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.hazCardTitle, { color: colors.text }]} numberOfLines={2}>{h.name}</Text>
                  <View style={styles.hazCardChips}>
                    {h.severity ? <Text style={[styles.hazChip, { backgroundColor: SEVERITY_COLOR[h.severity] }]}>{i18n.t(`sev_${h.severity}`)}</Text> : null}
                    {h.source ? <Text style={[styles.hazCardSource, { color: colors.muted }]} numberOfLines={1}>{h.source}</Text> : null}
                  </View>
                </View>
                <PressableScale onPress={() => setSelHazardId(null)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={colors.muted} />
                </PressableScale>
              </View>
              {near ? (
                <View style={styles.hazCardRow}>
                  <Ionicons name="navigate-circle-outline" size={18} color={colors.primary} />
                  <Text style={[styles.hazCardMeta,{color:colors.text}]}>{i18n.t('near')} {near.name} · {distance(near.d)}</Text>
                </View>
              ) : null}
              {mine ? (
                <View style={styles.hazCardRow}>
                  <Ionicons name="person-outline" size={18} color={colors.muted} />
                  <Text style={[styles.hazCardMeta,{color:colors.muted}]}>{i18n.t('fromYou')} {mine}</Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })()}
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
  hazCard: { position: 'absolute', top: 96, left: 14, right: 14, alignItems: 'center' },
  hazCardInner: { width: '100%', maxWidth: 440, borderRadius: 18, borderWidth: 1, padding: 14, gap: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  hazCardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  hazCardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hazCardTitle: { fontSize: 15.5, fontWeight: '800' },
  hazCardChips: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  hazChip: { color: '#fff', fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  hazCardSource: { fontSize: 12.5 },
  hazCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hazCardMeta: { fontSize: 13.5, fontWeight: '600', flex: 1 },
  deviceMarker: { width: 32, height: 32, borderRadius: 9, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  playhead: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FF9F0A', borderWidth: 3, borderColor: '#fff', elevation: 4 },
  bannerLow: { top: 54 },
  banner: { position: 'absolute', top: 14, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  controls: { position: 'absolute', right: 16, bottom: MAP_SHEET_PEEK + 12, gap: 10 },
  ctrl: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
