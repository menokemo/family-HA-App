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

// أحداث التقويم بتحمل معلومتين في الوصف: مين أنشأه (·by:) و«خاص بمين» (·for:)،
// كل واحدة في سطر. parse بالسطور عشان يتحمّل وجود الاتنين أو واحدة أو ولا حاجة.
const SUBJECT_PREFIX = '·for:';
const CREATOR_PREFIX = '·by:';

// الوصف ممكن يحمل كمان ملاحظة حرّة (أي سطور مش بادئة بعلامة) قبل سطور الـmeta.
export function splitEventMeta(description?: string): { createdBy?: string; forWhom?: string; note?: string } {
  if (!description) return {};
  let createdBy: string | undefined;
  let forWhom: string | undefined;
  const noteLines: string[] = [];
  for (const line of description.split('\n')) {
    if (line.startsWith(CREATOR_PREFIX)) createdBy = line.slice(CREATOR_PREFIX.length).trim();
    else if (line.startsWith(SUBJECT_PREFIX)) forWhom = line.slice(SUBJECT_PREFIX.length).trim();
    else noteLines.push(line);
  }
  const note = noteLines.join('\n').trim();
  return { createdBy, forWhom, note: note || undefined };
}

export function joinEventMeta(createdBy?: string, forWhom?: string, note?: string): string | undefined {
  const metaParts: string[] = [];
  if (createdBy) metaParts.push(`${CREATOR_PREFIX}${createdBy}`);
  if (forWhom) metaParts.push(`${SUBJECT_PREFIX}${forWhom}`);
  const meta = metaParts.join('\n');
  const n = (note ?? '').trim();
  if (n && meta) return `${n}\n${meta}`;
  return n || meta || undefined;
}
