import type { HaEntity } from '../../types/homeAssistant';
export const armModes = [
  { feature:2, mode:'away', state:'armed_away', label:'armAway' },
  { feature:1, mode:'home', state:'armed_home', label:'armHome' },
  { feature:4, mode:'night', state:'armed_night', label:'armNight' },
  { feature:8, mode:'vacation', state:'armed_vacation', label:'armVacation' },
  { feature:16, mode:'custom', state:'armed_custom_bypass', label:'armCustom' },
] as const;
export function supportedModes(alarm: HaEntity) { const features=Number(alarm.attributes.supported_features ?? 0); if(!features)return armModes; return armModes.filter(x => (features & x.feature) === x.feature); }
export function sensorIdsFromAlarm(alarm: HaEntity): string[] {
  const ids = new Set<string>();
  const walk=(value:unknown):void=>{ if(typeof value==='string' && /^(binary_sensor|sensor)\./.test(value)) ids.add(value); else if(Array.isArray(value)) value.forEach(walk); else if(value && typeof value==='object') Object.values(value as Record<string,unknown>).forEach(walk); };
  ['open_sensors','bypassed_sensors','sensors','triggered_sensors'].forEach(k=>walk(alarm.attributes[k])); return [...ids];
}
export function entitiesByIds(states: HaEntity[], ids: string[]): HaEntity[] { const wanted=new Set(ids); return states.filter(x=>wanted.has(x.entity_id)); }
export const isProblemState = (state:string) => ['on','open','unavailable','unknown','detected','problem','unsafe','smoke','moisture'].includes(state.toLowerCase());
