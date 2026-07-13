import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AlarmoEvent, HaEntity } from '../types/homeAssistant';

const STATES_KEY='familyha.cache.states.v1';
const EVENTS_KEY='familyha.cache.events.v1';
const META_KEY='familyha.cache.meta.v1';

export type CacheMeta={updatedAt:string};

export async function loadCachedStates():Promise<HaEntity[]>{
  try{return JSON.parse((await AsyncStorage.getItem(STATES_KEY))??'[]') as HaEntity[];}catch{return[];}
}
export async function saveCachedStates(states:HaEntity[]):Promise<void>{
  await Promise.all([AsyncStorage.setItem(STATES_KEY,JSON.stringify(states)),AsyncStorage.setItem(META_KEY,JSON.stringify({updatedAt:new Date().toISOString()} satisfies CacheMeta))]);
}
export async function loadCachedEvents():Promise<AlarmoEvent[]>{
  try{return JSON.parse((await AsyncStorage.getItem(EVENTS_KEY))??'[]') as AlarmoEvent[];}catch{return[];}
}
export async function saveCachedEvents(events:AlarmoEvent[]):Promise<void>{await AsyncStorage.setItem(EVENTS_KEY,JSON.stringify(events.slice(0,50)));}
export async function loadCacheMeta():Promise<CacheMeta|undefined>{try{const value=await AsyncStorage.getItem(META_KEY);return value?JSON.parse(value) as CacheMeta:undefined;}catch{return undefined;}}
