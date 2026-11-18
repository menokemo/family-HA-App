// تكامل Mealie الرسمي في Home Assistant — خطط الأكل والوصفات.
import type { ConnectionSettings } from '../types/homeAssistant';
import { request } from './client';
import { wsCommand } from './wsClient';

// ===== تكامل Mealie الرسمي =====
// خدمات Mealie محتاجة config_entry_id مش entity_id — بنجيبه من سجل الكيانات.
// بنكتشفه تلقائيًا من أي كيان Mealie، فمفيش أي اسم ثابت متخزّن في التطبيق.
export async function getEntityConfigEntryId(settings: ConnectionSettings, entityId: string): Promise<string | null> {
  const res = (await wsCommand(settings, { type: 'config/entity_registry/get', entity_id: entityId })) as
    | { config_entry_id?: string | null }
    | null;
  return res?.config_entry_id ?? null;
}

// إضافة/تعيين وجبة في خطة Mealie (ملاحظة نصية أو وصفة). الخدمة بتضيف مدخل جديد.
export async function mealieSetMealplan(
  settings: ConnectionSettings,
  configEntryId: string,
  data: { date: string; entry_type: string; recipe_id?: string; note_title?: string; note_text?: string },
): Promise<void> {
  await request(settings, '/api/services/mealie/set_mealplan', {
    method: 'POST',
    body: JSON.stringify({ config_entry_id: configEntryId, ...data }),
  });
}

// تعيين وجبة عشوائية من وصفات Mealie لليوم/الخانة المحددة.
export async function mealieSetRandomMealplan(
  settings: ConnectionSettings,
  configEntryId: string,
  data: { date: string; entry_type: string },
): Promise<void> {
  await request(settings, '/api/services/mealie/set_random_mealplan', {
    method: 'POST',
    body: JSON.stringify({ config_entry_id: configEntryId, ...data }),
  });
}

// عنصر خطة أكل من Mealie: إما وصفة (recipe) أو ملاحظة نصية (title).
// mealplan_id لازم للحذف/التعديل؛ بنقبل id كمان كبديل حسب نسخة التكامل.
export type MealieMealplanEntry = {
  mealplan_id?: string | number;
  id?: string | number;
  date?: string;
  entry_type?: string;
  title?: string;
  text?: string;
  recipe?: { id?: string; slug?: string; name?: string } | null;
};

// خطة أكل لمدى تواريخ — نداء واحد بيرجّع كل المدخلات بمعرّفاتها ووصفاتها.
export async function mealieGetMealplan(
  settings: ConnectionSettings,
  configEntryId: string,
  startDate: string,
  endDate: string,
): Promise<MealieMealplanEntry[]> {
  const r = (await wsCommand(settings, {
    type: 'call_service', domain: 'mealie', service: 'get_mealplan',
    service_data: { config_entry_id: configEntryId, start_date: startDate, end_date: endDate }, return_response: true,
  })) as { response?: { mealplan?: MealieMealplanEntry[] } } | null;
  return r?.response?.mealplan ?? [];
}

type RecipeIngredient = { display?: string; note?: string; food?: { name?: string } | null; quantity?: number | null; unit?: { name?: string } | null };
type RecipeInstruction = { text?: string };

// نص مكوّن جاهز (display)، ومع بناء احتياطي لو display فاضي.
function ingredientText(ing: RecipeIngredient): string {
  const d = (ing.display ?? '').trim();
  if (d) return d;
  return [ing.quantity != null ? String(ing.quantity) : '', ing.unit?.name ?? '', ing.food?.name ?? '', ing.note ?? '']
    .map(x => x.trim()).filter(Boolean).join(' ').trim();
}

// وصفة كاملة من Mealie: الاسم + المكوّنات + خطوات التحضير.
export type MealieRecipe = { name: string; ingredients: string[]; steps: string[] };
export async function mealieGetRecipe(settings: ConnectionSettings, configEntryId: string, recipeId: string): Promise<MealieRecipe> {
  const r = (await wsCommand(settings, {
    type: 'call_service', domain: 'mealie', service: 'get_recipe',
    service_data: { config_entry_id: configEntryId, recipe_id: recipeId }, return_response: true,
  })) as { response?: { recipe?: { name?: string; recipeIngredient?: RecipeIngredient[]; recipeInstructions?: RecipeInstruction[] } } } | null;
  const rec = r?.response?.recipe;
  return {
    name: (rec?.name ?? '').trim(),
    ingredients: (rec?.recipeIngredient ?? []).map(ingredientText).filter(Boolean),
    steps: (rec?.recipeInstructions ?? []).map(s => (s.text ?? '').trim()).filter(Boolean),
  };
}

// مكوّنات وصفة فقط (غلاف رفيع حوالين mealieGetRecipe لتدفّق «ضيف للتسوّق»).
export async function mealieGetRecipeIngredients(settings: ConnectionSettings, configEntryId: string, recipeId: string): Promise<string[]> {
  return (await mealieGetRecipe(settings, configEntryId, recipeId)).ingredients;
}

// حذف مدخل من خطة Mealie.
export async function mealieDeleteMealplan(settings: ConnectionSettings, configEntryId: string, mealplanId: string): Promise<void> {
  await request(settings, '/api/services/mealie/delete_mealplan', {
    method: 'POST',
    body: JSON.stringify({ config_entry_id: configEntryId, mealplan_id: mealplanId }),
  });
}

// تعديل مدخل في خطة Mealie (تغيير اليوم/الخانة/الوصفة).
export async function mealieUpdateMealplan(
  settings: ConnectionSettings,
  configEntryId: string,
  data: { mealplan_id: string; date: string; entry_type: string; recipe_id?: string; note_title?: string; note_text?: string },
): Promise<void> {
  await request(settings, '/api/services/mealie/update_mealplan', {
    method: 'POST',
    body: JSON.stringify({ config_entry_id: configEntryId, ...data }),
  });
}

// استيراد وصفة لـ Mealie من رابط. بيرجّع الوصفة المستوردة (slug/id) لو أتاحها التكامل.
export async function mealieImportRecipe(
  settings: ConnectionSettings,
  configEntryId: string,
  url: string,
): Promise<{ id?: string; slug?: string; name?: string } | null> {
  const r = (await wsCommand(settings, {
    type: 'call_service', domain: 'mealie', service: 'import_recipe',
    service_data: { config_entry_id: configEntryId, url }, return_response: true,
  })) as { response?: { recipe?: { id?: string; slug?: string; name?: string }; id?: string; slug?: string; name?: string } } | null;
  const resp = r?.response;
  return resp?.recipe ?? (resp?.slug || resp?.id ? { id: resp?.id, slug: resp?.slug, name: resp?.name } : null);
}

// ===== شبكة العيلة (الحائط/الشات/المهام) عبر سيرفسات مكوّن secure_family =====
