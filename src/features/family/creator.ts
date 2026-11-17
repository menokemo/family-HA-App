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
