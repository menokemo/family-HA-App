// هيلبرز مشتركة لخريطة العيلة (النيتف والويب) - عشان مانكررش نفس المنطق في
// أكتر من ملف. دوال خالصة + اللي بتعتمد على i18n بس. مفيش أي حاجة مرتبطة
// بمحرّك خريطة معيّن هنا.
import type { HaEntity } from '../../types/homeAssistant';
import { i18n } from '../../i18n';

export type Motion = { speed: number; heading: number; moving: boolean };

// ألوان ثابتة لكل فرد (حلقة الصورة + في اللستة).
export const PERSON_RING = ['#4F8BFF', '#34C759', '#FF9F0A', '#FF375F', '#AF52DE', '#5AC8FA', '#FF7A45', '#39C36E'];

// بطارية أقل من كده = تنبيه.
export const LOW_BATTERY = 15;

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
export function batteryText(p: HaEntity, states: HaEntity[]): string {
  const n = Number(p.attributes.battery_level);
  if (Number.isFinite(n)) return `${n}%`;
  const key = p.entity_id.split('.')[1];
  const e = states.find(x => x.entity_id.startsWith('sensor.') && x.entity_id.includes(key) && x.entity_id.includes('battery'));
  return e ? `${e.state}%` : '—';
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

// وصف مكان الشخص: بيتحرك (سرعة) / في البيت / اسم منطقة / عنوان حقيقي / بره.
export function placeLabel(p: HaEntity, addrMap: Record<string, string>, motion?: Motion): string {
  if (motion?.moving) return `${motion.speed >= 25 ? i18n.t('stDriving') : i18n.t('stMoving')} · ${Math.round(motion.speed)} km/h`;
  const st = String(p.state ?? '');
  if (st === 'home') return i18n.t('placeHome');
  if (st && !['not_home', 'unknown', 'unavailable', ''].includes(st)) return st;
  return addrMap[p.entity_id] || i18n.t('placeAway');
}
