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
export type MealieMealplanEntry = {
  date?: string;
  entry_type?: string;
  title?: string;
  text?: string;
  recipe?: { id?: string; slug?: string; name?: string } | null;
};

// خطة أكل يوم واحد — بنستخدم return_response (نفس باترون سيرفسات secure_family).
export async function mealieGetMealplan(settings: ConnectionSettings, configEntryId: string, date: string): Promise<MealieMealplanEntry[]> {
  const r = (await wsCommand(settings, {
    type: 'call_service', domain: 'mealie', service: 'get_mealplan',
    service_data: { config_entry_id: configEntryId, start_date: date, end_date: date }, return_response: true,
  })) as { response?: { mealplan?: MealieMealplanEntry[] } } | null;
  return r?.response?.mealplan ?? [];
}

type RecipeIngredient = { display?: string; note?: string; food?: { name?: string } | null; quantity?: number | null; unit?: { name?: string } | null };

// مكوّنات وصفة بالنص الجاهز (display)، ومع بناء احتياطي لو display فاضي.
export async function mealieGetRecipeIngredients(settings: ConnectionSettings, configEntryId: string, recipeId: string): Promise<string[]> {
  const r = (await wsCommand(settings, {
    type: 'call_service', domain: 'mealie', service: 'get_recipe',
    service_data: { config_entry_id: configEntryId, recipe_id: recipeId }, return_response: true,
  })) as { response?: { recipe?: { recipeIngredient?: RecipeIngredient[] } } } | null;
  const list = r?.response?.recipe?.recipeIngredient ?? [];
  return list
    .map(ing => {
      const d = (ing.display ?? '').trim();
      if (d) return d;
      const parts = [ing.quantity != null ? String(ing.quantity) : '', ing.unit?.name ?? '', ing.food?.name ?? '', ing.note ?? '']
        .map(x => x.trim()).filter(Boolean);
      return parts.join(' ').trim();
    })
    .filter(Boolean);
}

// ===== شبكة العيلة (الحائط/الشات/المهام) عبر سيرفسات مكوّن secure_family =====
