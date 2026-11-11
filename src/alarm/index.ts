import { alarmoProvider } from './alarmoProvider';
import type { AlarmProvider } from './types';

/**
 * المزوّد النشط اللي التطبيق بيستخدمه.
 *
 * ⬇️ لتبديل محرّك الإنذار (مثلًا لمحرّك خاص بينا بدل Alarmo)، غيّر السطر ده بس.
 */
export const alarmProvider: AlarmProvider = alarmoProvider;

export type { AlarmProvider, AlarmMode, AlarmModeDef, ArmOptions } from './types';
