// منشئ العنصر (مهمة أو حدث تقويم) بنخزّنه داخل حقل description نفسه في
// Home Assistant بمحدّد ثابت (·by:)، فمفيش حاجة إضافية برّا HA. نفس
// المنطق بيستخدم في المهام والأجندة عشان نفك ونركّب المنشئ بنفس الشكل.
export const CREATOR_MARKER = '\n·by:';

export function splitCreator(description?: string): { notes: string; createdBy?: string } {
  if (!description) return { notes: '' };
  const idx = description.indexOf(CREATOR_MARKER);
  if (idx === -1) return { notes: description };
  return { notes: description.slice(0, idx), createdBy: description.slice(idx + CREATOR_MARKER.length).trim() };
}

// بتركّب الملاحظات مع المنشئ في نص description واحد (الملاحظات اختيارية).
export function joinCreator(notes: string, createdBy?: string): string {
  return notes.trim() + (createdBy ? `${CREATOR_MARKER}${createdBy}` : '');
}

// ===== بيانات حدث التقويم =====
// كل بيانات الحدث الإضافية بتتخزّن في وصف الحدث بعلامات في أول كل سطر، وأي سطور
// من غير علامة بتُعتبر «ملاحظة». كله جوه HA — من غير أي تخزين أو مكوّن إضافي.
export type EventKind = 'birthday' | 'appointment' | 'occasion';
export type EventMeta = {
  createdBy?: string;   // مين أضاف الحدث
  forWhom?: string;     // الحدث خاص بمين (أو صاحب عيد الميلاد)
  location?: string;    // المكان
  remind?: number;      // التذكير: دقائق قبل الحدث (غياب = مفيش)
  kind?: EventKind;     // نوع المُدخَل
  note?: string;        // ملاحظة حرّة
};

const P = { by: '·by:', for: '·for:', loc: '·loc:', rem: '·rem:', kind: '·kind:' } as const;
const isKind = (k: string): k is EventKind => k === 'birthday' || k === 'appointment' || k === 'occasion';

export function splitEventMeta(description?: string): EventMeta {
  if (!description) return {};
  const m: EventMeta = {};
  const noteLines: string[] = [];
  for (const line of description.split('\n')) {
    if (line.startsWith(P.by)) m.createdBy = line.slice(P.by.length).trim();
    else if (line.startsWith(P.for)) m.forWhom = line.slice(P.for.length).trim();
    else if (line.startsWith(P.loc)) m.location = line.slice(P.loc.length).trim();
    else if (line.startsWith(P.rem)) { const n = parseInt(line.slice(P.rem.length).trim(), 10); if (!Number.isNaN(n)) m.remind = n; }
    else if (line.startsWith(P.kind)) { const k = line.slice(P.kind.length).trim(); if (isKind(k)) m.kind = k; }
    else noteLines.push(line);
  }
  const note = noteLines.join('\n').trim();
  if (note) m.note = note;
  return m;
}

export function joinEventMeta(meta: EventMeta): string | undefined {
  const lines: string[] = [];
  if (meta.createdBy) lines.push(P.by + meta.createdBy);
  if (meta.forWhom) lines.push(P.for + meta.forWhom);
  if (meta.location) lines.push(P.loc + meta.location);
  if (meta.remind != null) lines.push(P.rem + String(meta.remind));
  if (meta.kind) lines.push(P.kind + meta.kind);
  const tail = lines.join('\n');
  const n = (meta.note ?? '').trim();
  if (n && tail) return `${n}\n${tail}`;
  return n || tail || undefined;
}
