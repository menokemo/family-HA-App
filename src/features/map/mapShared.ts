// هيلبرز مشتركة لخريطة العيلة (النيتف والويب) - عشان مانكررش نفس المنطق في
// أكتر من ملف. دوال خالصة + اللي بتعتمد على i18n بس. مفيش أي حاجة مرتبطة
// بمحرّك خريطة معيّن هنا.
import type { HaEntity } from '../../types/homeAssistant';
import { i18n } from '../../i18n';

export type Motion = { speed: number; heading: number; moving: boolean };
export type RouteMode = 'driving' | 'walking' | 'cycling';
// نقطة في تاريخ الحركة (متوافقة مع HistoryPoint). رحلة = حركة بين وقفتين.
export type TrackPoint = { lat: number; lng: number; at: string };
export type Trip = { id: string; startAt: string; endAt: string; durationSec: number; distanceM: number; avgKmh: number; points: [number, number][] };
export type LineStringGeo = { type: 'LineString'; coordinates: [number, number][] };
export type RouteResult = { geometry: LineStringGeo; distanceMeters: number; durationSeconds: number };

// ألوان ثابتة لكل فرد (حلقة الصورة + في اللستة).
export const PERSON_RING = ['#4F8BFF', '#34C759', '#FF9F0A', '#FF375F', '#AF52DE', '#5AC8FA', '#FF7A45', '#39C36E'];

// بطارية أقل من كده = تنبيه.
export const LOW_BATTERY = 15;

// المخاطر (geo_location من HA) بتغطي البلد كلها — عشرات الحوادث البعيدة اللي
// مالهاش أي علاقة بالعيلة. بنعرض بس اللي في نطاق 10كم من البيت أو من أي فرد.
export const HAZARD_NEAR_M = 10000;

/** يرجّع المخاطر القريبة من أي "مرساة" (البيت أو أي فرد). من غير مراسي = مفيش
 *  حاجة نقيس عليها، فبنرجّع فاضي بدل ما نغرق اللستة بمخاطر بعيدة. */
export function filterNearbyHazards<T extends { lat: number; lng: number }>(
  hazards: T[],
  anchors: { lat: number; lng: number }[],
  withinM: number = HAZARD_NEAR_M,
): T[] {
  if (anchors.length === 0) return [];
  return hazards.filter(h =>
    anchors.some(a => haversine({ latitude: h.lat, longitude: h.lng }, { latitude: a.lat, longitude: a.lng }) <= withinM),
  );
}

// --- ثوابت استقرار الموقع (مقاومة تشويش GPS) ---
export const MIN_MOVE_M = 50; // أقل إزاحة تُعتبر حركة حقيقية (متر)؛ أقل من كده = تشويش
export const MOVING_KMH = 6; // أقل سرعة تُعتبر "بيتحرك"
export const MAX_SPEED_KMH = 250; // أسرع من كده = قفزة GPS غلط، مانعتبرهاش حركة
export const STILL_AFTER_MS = 60000; // بعد كده من غير حركة يرجع "ثابت"

export const coord = (e: HaEntity) => ({ latitude: Number(e.attributes.latitude), longitude: Number(e.attributes.longitude) });

// المسافة بين نقطتين بالمتر (Haversine).
export function haversine(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// اتجاه الحركة بالدرجات (0 = شمال) من نقطة لنقطة.
export function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const toDeg = (x: number) => (x * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// مسافة مقروءة (متر/كيلومتر).
export const distance = (m?: number): string => (m === undefined ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

// وقت وصول مقروء من ثواني.
export function etaText(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} ${i18n.t('min')}`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return `${h}${i18n.t('hourShort')} ${rem}${i18n.t('min')}`;
}

// "آخر ظهور" مقروء من ISO.
export function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.round(diff / 60000);
  if (min < 1) return i18n.t('justNow');
  if (min < 60) return `${min} ${i18n.t('minAgo')}`;
  const hr = Math.round(min / 60);
  return `${hr} ${i18n.t('hourAgo')}`;
}

// نسبة البطارية كنص (من attribute الشخص أو من sensor بطارية مرتبط باسمه).
// الـ device_tracker المصدر للشخص (من attribute.source) — هو اللي بيحمل السرعة
// والبطارية الحقيقية اللي HA بياخدها من الجهاز.
export function sourceTracker(p: HaEntity, states: HaEntity[]): HaEntity | undefined {
  const src = p.attributes.source as string | undefined;
  return src && src.startsWith('device_tracker.') ? states.find(x => x.entity_id === src) : undefined;
}

// الحركة من المصدر الموثوق: attribute السرعة (m/s من HA) مش من حساب محلي (اللي
// بيطلّع سرعة وهمية من قفز الموقع وتوقيت التطبيق). undefined لو الجهاز مش بيبعت سرعة.
export function readMotion(p: HaEntity, states: HaEntity[]): Motion | undefined {
  const tracker = sourceTracker(p, states);
  const raw = Number(tracker?.attributes.speed ?? p.attributes.speed); // m/s
  if (!Number.isFinite(raw) || raw < 0) return undefined;
  const kmh = raw * 3.6;
  const course = Number(tracker?.attributes.course ?? p.attributes.course);
  return { speed: kmh, heading: Number.isFinite(course) ? course : 0, moving: kmh >= MOVING_KMH };
}

// نسبة البطارية كنص — من الشخص، أو من الـ device_tracker المصدر، أو من sensor رقمي
// مرتبط باسمه. لازم تكون قيمة رقمية — بنستبعد حسّاس حالة الشحن (Charging/Discharging).
export function batteryText(p: HaEntity, states: HaEntity[]): string {
  const direct = Number(p.attributes.battery_level);
  if (Number.isFinite(direct)) return `${Math.round(direct)}%`;
  const fromTracker = Number(sourceTracker(p, states)?.attributes.battery_level);
  if (Number.isFinite(fromTracker)) return `${Math.round(fromTracker)}%`;
  const key = p.entity_id.split('.')[1];
  const cand = states.filter(
    x => x.entity_id.startsWith('sensor.') && x.entity_id.includes(key) && x.entity_id.includes('battery') && Number.isFinite(Number(x.state)),
  );
  const lvl = cand.find(x => x.entity_id.includes('battery_level')) ?? cand[0];
  return lvl ? `${Math.round(Number(lvl.state))}%` : '—';
}

export function batteryPct(p: HaEntity, states: HaEntity[]): number {
  return Number(batteryText(p, states).replace('%', ''));
}

export function batteryIcon(pct: number): string {
  if (!Number.isFinite(pct)) return 'battery-dead-outline';
  if (pct >= 95) return 'battery-full';
  if (pct >= 45) return 'battery-half';
  return 'battery-dead';
}

// العنوان العكسي: من إحداثيات لاسم شارع/منطقة مقروء (BigDataCloud مجاني،
// بدون مفتاح، بيدعم العربية) مع كاش بالإحداثيات المقرّبة.
const addrCache = new Map<string, string>();
export async function reverseGeocode(lat: number, lng: number, lang: string): Promise<string | undefined> {
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
    /* بدون إنترنت أو الخدمة مش متاحة */
  }
  return undefined;
}

// مسار على الطريق بين نقطتين عبر OSRM المجاني (overview كامل + هندسة GeoJSON).
// بيرجّع الهندسة + المسافة + الزمن، أو null لو مفيش مسار/نت. يدعم إلغاء عبر signal.
export async function fetchRoute(
  mode: RouteMode,
  from: [number, number], // [lng, lat]
  to: [number, number], // [lng, lat]
  signal?: AbortSignal,
): Promise<RouteResult | null> {
  if (!from.every(Number.isFinite) || !to.every(Number.isFinite)) return null;
  const url = `https://router.project-osrm.org/route/v1/${mode}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, signal ? { signal } : undefined);
    const data = (await res.json()) as { routes?: { geometry: LineStringGeo; distance: number; duration: number }[] };
    const route = data.routes?.[0];
    if (!route) return null;
    return { geometry: route.geometry, distanceMeters: route.distance, durationSeconds: route.duration };
  } catch {
    return null; // بدون إنترنت أو اتلغى
  }
}

// وصف مكان الشخص: بيتحرك (سرعة) / في البيت / اسم منطقة / عنوان حقيقي / بره.
export function placeLabel(p: HaEntity, addrMap: Record<string, string>, motion?: Motion): string {
  if (motion?.moving) return `${motion.speed >= 25 ? i18n.t('stDriving') : i18n.t('stMoving')} · ${Math.round(motion.speed)} km/h`;
  const st = String(p.state ?? '');
  if (st === 'home') return i18n.t('placeHome');
  if (st && !['not_home', 'unknown', 'unavailable', ''].includes(st)) return st;
  return addrMap[p.entity_id] || i18n.t('placeAway');
}

// --- تقطيع تاريخ الحركة لرحلات ---
// HA بيسجّل نقطة جديدة أساسًا لما الموقع يتغيّر، فالوقوف بيطلع كـ "فجوة زمنية
// كبيرة ونفس المكان". فبنفصل رحلة عن اللي بعدها عند وقفة = نقطتين متتاليتين
// بينهم فجوة زمنية كبيرة والمسافة بينهم صغيرة. أي تجميعة حركتها الكلية صغيرة
// (مجرد تشويش في مكان واحد) بتتجاهل.
const TRIP_STOP_GAP_MS = 10 * 60 * 1000; // فجوة ≥ 10 دقايق في نفس المكان = وقفة
const TRIP_STILL_M = 120; // نصف قطر "نفس المكان"
const TRIP_MIN_DIST_M = 200; // أقل مسافة كلية تُعتبر رحلة حقيقية

function tripFrom(run: TrackPoint[]): Trip | null {
  if (run.length < 2) return null;
  let dist = 0;
  for (let i = 1; i < run.length; i++) {
    dist += haversine({ latitude: run[i - 1].lat, longitude: run[i - 1].lng }, { latitude: run[i].lat, longitude: run[i].lng });
  }
  if (dist < TRIP_MIN_DIST_M) return null;
  const startAt = run[0].at;
  const endAt = run[run.length - 1].at;
  const durationSec = Math.max(1, (new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000);
  const avgKmh = dist / 1000 / (durationSec / 3600);
  return { id: `${startAt}-${endAt}`, startAt, endAt, durationSec, distanceM: dist, avgKmh, points: run.map(p => [p.lng, p.lat] as [number, number]) };
}

export function segmentTrips(points: TrackPoint[]): Trip[] {
  if (points.length < 2) return [];
  const trips: Trip[] = [];
  let run: TrackPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const dt = new Date(cur.at).getTime() - new Date(prev.at).getTime();
    const dm = haversine({ latitude: prev.lat, longitude: prev.lng }, { latitude: cur.lat, longitude: cur.lng });
    if (dt >= TRIP_STOP_GAP_MS && dm < TRIP_STILL_M) {
      const t = tripFrom(run);
      if (t) trips.push(t);
      run = [cur];
    } else {
      run.push(cur);
    }
  }
  const last = tripFrom(run);
  if (last) trips.push(last);
  return trips.reverse(); // الأحدث الأول
}
