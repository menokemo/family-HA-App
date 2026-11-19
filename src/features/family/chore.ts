// بيانات إضافية للمهمة متخبّية في نص الـ title (قسم/تاريخ/ملاحظة) — من غير أي تعديل على المكوّن.
// نفس فكرة creator.ts للمواعيد: علامات بـ «·» تتفك للعرض وتتجمّع للحفظ.
export type ChoreCat =
  | 'kitchen' | 'bathroom' | 'laundry' | 'bedroom' | 'living' | 'outdoor' | 'maintenance' | 'other';

export const CHORE_CATS: { key: ChoreCat; icon: string }[] = [
  { key: 'kitchen', icon: 'restaurant' },
  { key: 'bathroom', icon: 'water' },
  { key: 'laundry', icon: 'shirt' },
  { key: 'bedroom', icon: 'bed' },
  { key: 'living', icon: 'tv' },
  { key: 'outdoor', icon: 'leaf' },
  { key: 'maintenance', icon: 'construct' },
  { key: 'other', icon: 'ellipsis-horizontal' },
];

export type ChoreMeta = { cat?: ChoreCat; due?: string; note?: string };

const M = { cat: '·cat:', due: '·due:', note: '·note:' };
const CAT_KEYS = new Set<string>(CHORE_CATS.map(c => c.key));
const DUE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function choreIcon(cat?: ChoreCat): string {
  return CHORE_CATS.find(c => c.key === (cat ?? 'other'))?.icon ?? 'ellipsis-horizontal';
}

// بيجمّع العنوان الظاهر مع العلامات في نص واحد يتحفظ. «note» دايمًا آخر حاجة لأنها ممكن تحتوي مسافات.
export function joinChoreMeta(title: string, meta: ChoreMeta): string {
  let out = title.trim();
  if (meta.cat && meta.cat !== 'other') out += ` ${M.cat}${meta.cat}`;
  if (meta.due && DUE_RE.test(meta.due)) out += ` ${M.due}${meta.due}`;
  const note = meta.note?.trim();
  if (note) out += ` ${M.note}${note}`;
  return out;
}

// بيفك النص المحفوظ لعنوان ظاهر + بيانات. صيغة قديمة من غير علامات بترجع زي ما هي.
export function splitChoreMeta(raw: string): { title: string; meta: ChoreMeta } {
  const idx = raw.search(/\s·(?:cat|due|note):/);
  if (idx < 0) return { title: raw.trim(), meta: {} };
  const title = raw.slice(0, idx).trim();
  const rest = raw.slice(idx);
  const meta: ChoreMeta = {};

  const noteMatch = rest.match(/·note:([\s\S]*)$/);
  let head = rest;
  if (noteMatch) {
    const note = noteMatch[1].trim();
    if (note) meta.note = note;
    head = rest.slice(0, noteMatch.index);
  }
  const catMatch = head.match(/·cat:(\S+)/);
  if (catMatch && CAT_KEYS.has(catMatch[1])) meta.cat = catMatch[1] as ChoreCat;
  const dueMatch = head.match(/·due:(\d{4}-\d{2}-\d{2})/);
  if (dueMatch) meta.due = dueMatch[1];

  return { title, meta };
}
