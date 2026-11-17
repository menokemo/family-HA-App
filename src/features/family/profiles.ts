import type { HaEntity } from '../../types/homeAssistant';
import { readFamilyConfig } from '../../family/familyConfig';

// بروفايل كل فرد اللي الأدمن بيظبطه في لوحة المكوّن ويتنشر مع كونفيج العيلة.
// مفتاح الخريطة = entity_id بتاع كيان person.
export type Profile = { birthday?: string; role?: string; color?: string };
export type Profiles = Record<string, Profile>;

const HEX = /^#[0-9a-fA-F]{6}$/;

// بيقرا البروفايلات من كونفيج العيلة المنشور. مش ضمن الحقول المعرّفة في
// FamilyConfig فبنقراه من الكائن الخام بأمان.
export function readProfiles(states: HaEntity[]): Profiles {
  const fc = readFamilyConfig(states);
  const raw = fc && (fc.config as Record<string, unknown>).profiles;
  if (!raw || typeof raw !== 'object') return {};
  return raw as Profiles;
}

// لون البروفايل لفرد (لو موجود وصالح)، وإلا undefined فنرجع للون التلقائي.
export function profileColor(personEntityId: string | undefined, profiles: Profiles): string | undefined {
  if (!personEntityId) return undefined;
  const c = profiles[personEntityId]?.color;
  return c && HEX.test(c) ? c : undefined;
}
