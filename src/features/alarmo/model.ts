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
