import type { HaEntity } from '../../types/homeAssistant';
import { personColor } from './MemberAvatar';
import { profileColor, type Profiles } from './profiles';

// عناصر شبكة العيلة زي ما المكوّن بيخزّنها (person = entity_id لكيان person أو null).
export type SocialPost = { id: string; ts: number; person?: string | null; name: string; text: string };
export type Chore = { id: string; ts: number; person?: string | null; name: string; title: string; done: boolean; category?: string | null; due?: string | null; repeat?: string | null; note?: string | null };

// بيقرا قسم (wall/chat/chores) من كيان السينسور بتاعه — بيتحدّث لحظيًا مع الحالة.
export function readSocial<T>(states: HaEntity[], section: 'wall' | 'chat' | 'chores'): T[] {
  const e = states.find(s => s.entity_id === `sensor.secure_family_${section}`);
  const list = e?.attributes?.[section];
  return Array.isArray(list) ? (list as T[]) : [];
}

// لو المكوّن القديم (مفيش كيانات الشبكة) — عشان التطبيق يفرّق ويعرض رسالة.
export function hasSocial(states: HaEntity[]): boolean {
  return states.some(s => s.entity_id === 'sensor.secure_family_wall');
}

export type Poster = { person?: HaEntity; name: string; color: string };

// هوية صاحب العنصر: كيان person (لو متخزّن)، اسمه، ولونه (بروفايل وإلا تلقائي).
export function resolvePoster(item: { person?: string | null; name: string }, persons: HaEntity[], profiles: Profiles): Poster {
  const person = item.person ? persons.find(p => p.entity_id === item.person) : undefined;
  const key = person?.entity_id ?? item.person ?? item.name;
  return { person, name: item.name, color: profileColor(person?.entity_id, profiles) ?? personColor(key) };
}
