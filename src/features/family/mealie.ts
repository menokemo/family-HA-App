// اكتشاف تكامل Mealie الرسمي في Home Assistant بشكل استاندرد — بدون أسماء كيانات ثابتة.
//
// التكامل الرسمي (من إصدار HA 2024.7) بيعمل الكيانات دي تلقائيًا:
//   - todo.mealie_*      → قائمة لكل قائمة تسوّق في Mealie (تتحدث كل ٥ دقايق)
//   - calendar.mealie_*  → تقويم لكل وجبة: breakfast / lunch / dinner / side (تتحدث كل ساعة)
//   - sensor.mealie_*    → حسّاسات إحصائيات (وصفات/تصنيفات/وسوم/أدوات/مستخدمين)
// أسماء الـ object_id بتفضل إنجليزي مهما اتغيّرت لغة الواجهة، فالكشف بالبادئة آمن.
import type { HaEntity } from '../../types/homeAssistant';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'side';
export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'side'];

// الـ object_id لكيان Mealie إما "mealie" أو يبدأ بـ "mealie_".
function isMealieObject(entityId: string): boolean {
  const obj = entityId.slice(entityId.indexOf('.') + 1);
  return obj === 'mealie' || obj.startsWith('mealie_');
}

function slotFromId(entityId: string): MealSlot | null {
  const id = entityId.toLowerCase();
  if (id.includes('breakfast')) return 'breakfast';
  if (id.includes('lunch')) return 'lunch';
  if (id.includes('dinner')) return 'dinner';
  if (id.includes('side')) return 'side';
  return null;
}

// قوائم تسوّق Mealie (todo).
export function findMealieTodos(states: HaEntity[]): HaEntity[] {
  return states.filter(e => e.entity_id.startsWith('todo.') && isMealieObject(e.entity_id));
}

export type MealieCalendar = { entity: HaEntity; slot: MealSlot };

// تقاويم خطة الأكل في Mealie، مربوطة بالوجبة اللي بتمثّلها.
export function findMealieCalendars(states: HaEntity[]): MealieCalendar[] {
  const out: MealieCalendar[] = [];
  for (const e of states) {
    if (!e.entity_id.startsWith('calendar.') || !isMealieObject(e.entity_id)) continue;
    const slot = slotFromId(e.entity_id);
    if (slot) out.push({ entity: e, slot });
  }
  return out;
}

// هل Mealie متركّب ومتاح؟ (كفاية تقويم أو قائمة واحدة).
export function hasMealie(states: HaEntity[]): boolean {
  return findMealieCalendars(states).length > 0 || findMealieTodos(states).length > 0;
}
