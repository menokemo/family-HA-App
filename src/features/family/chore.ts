// بيانات المهمة الإضافية (قسم/تاريخ/تكرار/ملاحظة).
// من المكوّن v0.10.0 بتيجي كحقول حقيقية على عنصر المهمة. المهام القديمة (قبل
// التحديث) كانت بتخبّي القسم/التاريخ/الملاحظة في نص الـtitle بعلامات «·» —
// بنفضل نقراها كـ fallback عشان تفضل ظاهرة صح.
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

export type ChoreRepeat = 'none' | 'daily' | 'weekly' | 'monthly';

export const REPEAT_OPTS: { key: ChoreRepeat; icon: string }[] = [
  { key: 'none', icon: 'remove-circle-outline' },
  { key: 'daily', icon: 'today-outline' },
  { key: 'weekly', icon: 'calendar-outline' },
  { key: 'monthly', icon: 'calendar-number-outline' },
];

export type ChoreMeta = { cat?: ChoreCat; due?: string; note?: string };

const CAT_KEYS = new Set<string>(CHORE_CATS.map(c => c.key));
const REPEAT_KEYS = new Set<string>(REPEAT_OPTS.map(r => r.key));

export function choreIcon(cat?: ChoreCat): string {
  return CHORE_CATS.find(c => c.key === (cat ?? 'other'))?.icon ?? 'ellipsis-horizontal';
}

export function asCat(v?: string | null): ChoreCat | undefined {
  return v && CAT_KEYS.has(v) ? (v as ChoreCat) : undefined;
}

export function asRepeat(v?: string | null): ChoreRepeat {
  return v && REPEAT_KEYS.has(v) ? (v as ChoreRepeat) : 'none';
}

// بيفك العنوان القديم اللي فيه علامات لعنوان ظاهر + بيانات. عنوان من غير علامات بيرجع زي ما هو.
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

export type ResolvedChore = { title: string; cat?: ChoreCat; due?: string; note?: string; repeat: ChoreRepeat };

// الحقول الحقيقية (مكوّن جديد) لها الأولوية، والعلامات في العنوان (مهام قديمة) fallback.
export function readChore(c: {
  title: string; category?: string | null; due?: string | null; repeat?: string | null; note?: string | null;
}): ResolvedChore {
  const legacy = splitChoreMeta(c.title);
  return {
    title: legacy.title,
    cat: asCat(c.category) ?? legacy.meta.cat,
    due: (c.due || undefined) ?? legacy.meta.due,
    note: (c.note || undefined) ?? legacy.meta.note,
    repeat: asRepeat(c.repeat),
  };
}
