import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { readProfiles, type Profiles } from './profiles';

// دور الفرد زي ما الأدمن بيحدّده في لوحة المكوّن (البروفايل).
export type Role = 'manager' | 'adult' | 'child';

export function memberRole(personId: string | undefined, profiles: Profiles): Role | undefined {
  const r = personId ? profiles[personId]?.role : undefined;
  return r === 'manager' || r === 'adult' || r === 'child' ? r : undefined;
}

export function myRole(states: HaEntity[], settings: ConnectionSettings): Role | undefined {
  return memberRole(settings.selectedPersonId, readProfiles(states));
}

// مين يقدر يحذف/يدير: الكل ما عدا الطفل. (مفيش دور متحدّد = يقدر، عشان نفس
// السلوك القديم لو مفيش بروفايلات.) نفس الشرط متطبّق في المكوّن كمان.
export function canManage(role?: Role): boolean {
  return role !== 'child';
}
