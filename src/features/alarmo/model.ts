import type { HaEntity } from '../../types/homeAssistant';
// قيم AlarmControlPanelEntityFeature الرسمية من HA core
// (homeassistant/components/alarm_control_panel/const.py).
// TRIGGER مش وضع تسليح، وAlarmo بيضيفه دايمًا لأي كيان (alarm_control_panel.py)
// - فمستحيل نستخدمه كشرط لظهور أي وضع.
export const HA_ALARM_FEATURE = {
  ARM_HOME: 1,
  ARM_AWAY: 2,
  ARM_NIGHT: 4,
  TRIGGER: 8,
  ARM_CUSTOM_BYPASS: 16,
  ARM_VACATION: 32,
} as const;

export const armModes = [
  { feature:HA_ALARM_FEATURE.ARM_AWAY, mode:'away', state:'armed_away', label:'armAway' },
  { feature:HA_ALARM_FEATURE.ARM_HOME, mode:'home', state:'armed_home', label:'armHome' },
  { feature:HA_ALARM_FEATURE.ARM_NIGHT, mode:'night', state:'armed_night', label:'armNight' },
  { feature:HA_ALARM_FEATURE.ARM_VACATION, mode:'vacation', state:'armed_vacation', label:'armVacation' },
  { feature:HA_ALARM_FEATURE.ARM_CUSTOM_BYPASS, mode:'custom', state:'armed_custom_bypass', label:'armCustom' },
] as const;
export function supportedModes(alarm: HaEntity) { const features=Number(alarm.attributes.supported_features ?? 0); if(!features)return armModes; return armModes.filter(x => (features & x.feature) === x.feature); }
export function sensorIdsFromAlarm(alarm: HaEntity): string[] {
  const ids = new Set<string>();
  const walk=(value:unknown):void=>{ if(typeof value==='string' && /^(binary_sensor|sensor)\./.test(value)) ids.add(value); else if(Array.isArray(value)) value.forEach(walk); else if(value && typeof value==='object') Object.values(value as Record<string,unknown>).forEach(walk); };
  ['open_sensors','bypassed_sensors','sensors','triggered_sensors'].forEach(k=>walk(alarm.attributes[k])); return [...ids];
}
export function entitiesByIds(states: HaEntity[], ids: string[]): HaEntity[] { const wanted=new Set(ids); return states.filter(x=>wanted.has(x.entity_id)); }
export const isProblemState = (state:string) => ['on','open','unavailable','unknown','detected','problem','unsafe','smoke','moisture'].includes(state.toLowerCase());

const byFriendlyName = (a: HaEntity, b: HaEntity) =>
  String(a.attributes.friendly_name ?? a.entity_id).localeCompare(String(b.attributes.friendly_name ?? b.entity_id));

// أنواع الحساسات المرتبطة بالأمان (device_class في HA) - عشان نعرض للمستخدم
// الأبواب/الشبابيك/الحركة بس، مش كل الـ binary_sensors (بطارية/اتصال/تحديثات...).
export const SECURITY_SENSOR_CLASSES = new Set([
  'door','window','garage_door','opening','motion','occupancy','presence','vibration','smoke','gas','co','moisture','safety','tamper','sound',
]);

export function isSecuritySensor(entity: HaEntity): boolean {
  if (!entity.entity_id.startsWith('binary_sensor.')) return false;
  const deviceClass = String(entity.attributes.device_class ?? '').toLowerCase();
  return SECURITY_SENSOR_CLASSES.has(deviceClass);
}

/**
 * مرشّحو الحساسات اللي نعرضهم في "إضافة أبواب وشبابيك".
 * الافتراضي: الحساسات الأمنية بس (حسب device_class)، مرتّبة بالاسم الودّي.
 * includeAll=true بيرجّع كل الـ binary_sensors (للحالات النادرة اللي
 * الحساس مالوش device_class).
 */
export function sensorCandidates(states: HaEntity[], includeAll = false): HaEntity[] {
  const binarySensors = states.filter(s => s.entity_id.startsWith('binary_sensor.'));
  const list = includeAll ? binarySensors : binarySensors.filter(isSecuritySensor);
  return list.slice().sort(byFriendlyName);
}
