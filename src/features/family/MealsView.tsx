import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import {
  addTodoItem,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  getEntityConfigEntryId,
  mealieGetMealplan,
  mealieGetRecipeIngredients,
  mealieSetMealplan,
  mealieSetRandomMealplan,
  type CalendarEvent,
} from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';
import { findMealieCalendars, findMealieTodos, type MealSlot } from './mealie';

type Props = { states: HaEntity[]; lists: HaEntity[]; settings: ConnectionSettings; localCalendar?: HaEntity };
type Meal = CalendarEvent & { slot: MealSlot };

const SLOT_MARKER = '·slot:';
const SLOT_META: Record<MealSlot, { h: number; icon: string; color: string }> = {
  breakfast: { h: 8, icon: 'cafe-outline', color: '#F5A623' },
  lunch: { h: 13, icon: 'restaurant-outline', color: '#1D9E75' },
  dinner: { h: 19, icon: 'moon-outline', color: '#534AB7' },
  side: { h: 15, icon: 'nutrition-outline', color: '#C9892F' },
};
const LOCAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

function mondayOf(d: Date) { const r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const dow = (r.getDay() + 6) % 7; r.setDate(r.getDate() - dow); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function eventDayKey(start: string) { if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start; const d = new Date(start); return Number.isNaN(d.getTime()) ? null : dayKey(d); }

// وضع التقويم المحلي: الخانة بتتحدد من العلامة في الوصف (أو من الساعة).
function localSlotOf(ev: CalendarEvent): MealSlot {
  const d = ev.description ?? '';
  const i = d.indexOf(SLOT_MARKER);
  if (i !== -1) { const v = d.slice(i + SLOT_MARKER.length).trim(); if (v === 'breakfast' || v === 'lunch' || v === 'dinner') return v; }
  const h = /^\d{4}-\d{2}-\d{2}$/.test(ev.start) ? 12 : new Date(ev.start).getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';
}

export function MealsView({ states, lists, settings, localCalendar }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const mealieCals = useMemo(() => findMealieCalendars(states), [states]);
  const mealie = mealieCals.length > 0;
  // في وضع Mealie بنعرض الخانات اللي ليها تقويم فعلاً، بالترتيب المعتاد.
  const slots = useMemo<MealSlot[]>(() => {
    if (!mealie) return LOCAL_SLOTS;
    const present = new Set(mealieCals.map(c => c.slot));
    return (['breakfast', 'lunch', 'dinner', 'side'] as MealSlot[]).filter(x => present.has(x));
  }, [mealie, mealieCals]);

  // قائمة التسوّق الهدف: نفضّل قائمة Mealie لو موجودة.
  const groceryList = useMemo(() => {
    const m = findMealieTodos(states);
    return m[0] ?? lists[0] ?? null;
  }, [states, lists]);

  const [weekStart, setWeekStart] = useState<Date>(mondayOf(new Date()));
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<{ day: Date; slot: MealSlot } | null>(null);
  const [toast, setToast] = useState<string>('');
  const [ing, setIng] = useState<{ title: string; items: string[] } | null>(null);
  const [ingBusy, setIngBusy] = useState(false);
  const cfgRef = useRef<string | null | undefined>(undefined); // config_entry_id بتاع Mealie (undefined = لسه محلّلناش)

  const weekKey = dayKey(weekStart);
  const load = () => {
    setLoading(true);
    const start = weekStart;
    const end = addDays(weekStart, 7);
    const jobs: Promise<Meal[]>[] = mealie
      ? mealieCals.map(c =>
          getCalendarEvents(settings, c.entity.entity_id, start.toISOString(), end.toISOString())
            .then(list => list.map(e => ({ ...e, slot: c.slot })))
            .catch(() => []),
        )
      : localCalendar
        ? [getCalendarEvents(settings, localCalendar.entity_id, start.toISOString(), end.toISOString())
            .then(list => list.map(e => ({ ...e, slot: localSlotOf(e) })))
            .catch(() => [])]
        : [Promise.resolve([])];
    return Promise.all(jobs)
      .then(parts => setMeals(parts.flat()))
      .finally(() => setLoading(false));
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [weekKey, settings.baseUrl, settings.token, mealie]);

  // تجميع: يوم → خانة → كل الوجبات (Mealie ممكن يكون فيه أكتر من مدخل للخانة).
  const byDaySlot = useMemo(() => {
    const m: Record<string, Partial<Record<MealSlot, Meal[]>>> = {};
    for (const e of meals) { const k = eventDayKey(e.start); if (!k) continue; const day = (m[k] ??= {}); (day[e.slot] ??= []).push(e); }
    return m;
  }, [meals]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const listName = (l: HaEntity) => String(l.attributes.friendly_name ?? '');

  const addToGroceries = async (meal: Meal) => {
    if (!groceryList) { showToast(i18n.t('noLists')); return; }
    try { await addTodoItem(settings, groceryList.entity_id, meal.summary); showToast(`${i18n.t('addedToGroceries')} · ${listName(groceryList)}`); }
    catch { showToast(i18n.t('saveError')); }
  };

  // نحلّل config_entry_id بتاع Mealie مرّة واحدة ونخزّنه.
  const resolveCfg = async (): Promise<string | null> => {
    if (cfgRef.current !== undefined) return cfgRef.current;
    const id = await getEntityConfigEntryId(settings, mealieCals[0].entity.entity_id).catch(() => null);
    cfgRef.current = id;
    return id;
  };

  // ضغط السلة على وجبة Mealie: نجيب وصفتها ونفتح شيت المكوّنات. لو ملاحظة بدون وصفة → نضيف اسمها.
  const pickIngredients = async (meal: Meal, day: Date, slot: MealSlot) => {
    if (ingBusy) return;
    if (!mealie) { void addToGroceries(meal); return; }
    setIngBusy(true);
    try {
      const cfg = await resolveCfg();
      if (!cfg) { showToast(i18n.t('mealieNoConfig')); return; }
      const plan = await mealieGetMealplan(settings, cfg, dayKey(day));
      const entry =
        plan.find(e => e.entry_type === slot && (e.recipe?.name ?? e.title ?? '') === meal.summary) ??
        plan.find(e => e.entry_type === slot && e.recipe);
      const rid = entry?.recipe?.id ?? entry?.recipe?.slug;
      if (!rid) { await addToGroceries(meal); return; } // ملاحظة/بدون وصفة → الاسم
      const items = await mealieGetRecipeIngredients(settings, cfg, rid);
      if (!items.length) { await addToGroceries(meal); return; }
      setIng({ title: meal.summary, items });
    } catch {
      showToast(i18n.t('saveError'));
    } finally {
      setIngBusy(false);
    }
  };

  const addIngredients = async (items: string[]) => {
    if (!groceryList) { showToast(i18n.t('noLists')); setIng(null); return; }
    try {
      for (const it of items) await addTodoItem(settings, groceryList.entity_id, it);
      showToast(`${i18n.t('addedCount').replace('{n}', String(items.length))} · ${listName(groceryList)}`);
    } catch { showToast(i18n.t('saveError')); }
    setIng(null);
  };

  const editEntries = edit ? byDaySlot[dayKey(edit.day)]?.[edit.slot] ?? [] : [];

  return (
    <View style={{ flex: 1 }}>
      <View style={s.weekBar}>
        <PressableScale style={s.navBtn} onPress={() => setWeekStart(addDays(weekStart, -7))}><Ionicons name="chevron-back" size={20} color={colors.text} /></PressableScale>
        <Text style={s.weekLabel}>{weekStart.toLocaleDateString(i18n.locale || 'en', { day: 'numeric', month: 'short' })} – {addDays(weekStart, 6).toLocaleDateString(i18n.locale || 'en', { day: 'numeric', month: 'short' })}</Text>
        <PressableScale style={s.navBtn} onPress={() => setWeekStart(addDays(weekStart, 7))}><Ionicons name="chevron-forward" size={20} color={colors.text} /></PressableScale>
      </View>

      {mealie ? (
        <View style={s.sourceBar}>
          <Ionicons name="link-outline" size={13} color={colors.primary} />
          <Text style={s.sourceText}>{i18n.t('mealieConnected')}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {days.map(d => {
            const k = dayKey(d);
            const isToday = k === dayKey(new Date());
            return (
              <View key={k} style={[s.dayCard, isToday && s.dayCardToday]}>
                <Text style={[s.dayTitle, isToday && { color: colors.primary }]}>{d.toLocaleDateString(i18n.locale || 'en', { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
                {slots.map(slot => {
                  const meta = SLOT_META[slot];
                  const entries = byDaySlot[k]?.[slot] ?? [];
                  const label = entries.map(e => e.summary).join(' · ');
                  return (
                    <PressableScale key={slot} style={s.slotRow} onPress={() => setEdit({ day: d, slot })}>
                      <View style={[s.slotIcon, { backgroundColor: meta.color + '22' }]}><Ionicons name={meta.icon} size={16} color={meta.color} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.slotName}>{i18n.t(slot)}</Text>
                        <Text style={[s.slotMeal, !label && s.slotEmpty]} numberOfLines={2}>{label || i18n.t('tapToAdd')}</Text>
                      </View>
                      {entries.length ? (
                        <PressableScale hitSlop={8} onPress={() => void pickIngredients(entries[0], d, slot)} style={s.cartBtn}>
                          <Ionicons name="cart-outline" size={18} color={colors.muted} />
                        </PressableScale>
                      ) : <Ionicons name="add" size={20} color={colors.muted} />}
                    </PressableScale>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      {toast ? <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View> : null}

      {edit && mealie ? (
        <MealieSlotModal
          day={edit.day}
          slot={edit.slot}
          entries={editEntries}
          onAddNote={async text => {
            const cfg = await resolveCfg();
            if (!cfg) { showToast(i18n.t('mealieNoConfig')); return false; }
            try { await mealieSetMealplan(settings, cfg, { date: dayKey(edit.day), entry_type: edit.slot, note_title: text }); return true; }
            catch { showToast(i18n.t('saveError')); return false; }
          }}
          onRandom={async () => {
            const cfg = await resolveCfg();
            if (!cfg) { showToast(i18n.t('mealieNoConfig')); return false; }
            try { await mealieSetRandomMealplan(settings, cfg, { date: dayKey(edit.day), entry_type: edit.slot }); return true; }
            catch { showToast(i18n.t('saveError')); return false; }
          }}
          onAddToShopping={m => void pickIngredients(m, edit.day, edit.slot)}
          onClose={() => setEdit(null)}
          onDone={() => { setEdit(null); void load(); }}
        />
      ) : edit && localCalendar ? (
        <LocalEditMealModal
          calendarId={localCalendar.entity_id}
          day={edit.day}
          slot={edit.slot}
          current={editEntries[0]}
          settings={settings}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); void load(); }}
        />
      ) : null}

      {ing ? <IngredientsSheet title={ing.title} items={ing.items} onAdd={addIngredients} onClose={() => setIng(null)} /> : null}
    </View>
  );
}

// ===== شيت المكوّنات: الكل متعلّم مسبقًا — شيل اللي عندك وضيف الباقي =====
function IngredientsSheet({ title, items, onAdd, onClose }: { title: string; items: string[]; onAdd: (items: string[]) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [sel, setSel] = useState<Set<number>>(() => new Set(items.map((_, i) => i)));
  const [busy, setBusy] = useState(false);
  const toggle = (i: number) => setSel(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const chosen = items.filter((_, i) => sel.has(i));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { maxHeight: '82%' }]}>
          <View style={s.sheetHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Ionicons name="cart-outline" size={18} color={colors.primary} />
              <Text style={[s.sheetTitle, { textTransform: 'none', flex: 1 }]} numberOfLines={1}>{title}</Text>
            </View>
            <PressableScale onPress={onClose}><Ionicons name="close" size={22} color={colors.text} /></PressableScale>
          </View>

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
            {items.map((it, i) => {
              const on = sel.has(i);
              return (
                <PressableScale key={i} style={s.ingRow} onPress={() => toggle(i)}>
                  <View style={[s.check, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    {on ? <Ionicons name="checkmark" size={14} color={colors.black} /> : null}
                  </View>
                  <Text style={[s.ingText, !on && { color: colors.muted, textDecorationLine: 'line-through' }]}>{it}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>

          <PressableScale
            style={[s.save, { backgroundColor: colors.primary, opacity: busy || !chosen.length ? 0.6 : 1 }]}
            onPress={() => { if (busy || !chosen.length) return; setBusy(true); onAdd(chosen); }}
          >
            <Text style={[s.saveText, { color: colors.black }]}>{busy ? '…' : i18n.t('addSelected').replace('{n}', String(chosen.length))}</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

// ===== Mealie: إضافة وجبة (ملاحظة أو عشوائية) — الحذف/التعديل بيتعمل من Mealie نفسه =====
function MealieSlotModal({ day, slot, entries, onAddNote, onRandom, onAddToShopping, onClose, onDone }: {
  day: Date; slot: MealSlot; entries: Meal[];
  onAddNote: (text: string) => Promise<boolean>;
  onRandom: () => Promise<boolean>;
  onAddToShopping: (m: Meal) => void;
  onClose: () => void; onDone: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const meta = SLOT_META[slot];

  const run = async (fn: () => Promise<boolean>) => { if (busy) return; setBusy(true); const ok = await fn(); if (ok) onDone(); else setBusy(false); };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[s.slotIcon, { backgroundColor: meta.color + '22' }]}><Ionicons name={meta.icon} size={16} color={meta.color} /></View>
              <Text style={s.sheetTitle}>{i18n.t(slot)} · {day.toLocaleDateString(i18n.locale || 'en', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
            </View>
            <PressableScale onPress={onClose}><Ionicons name="close" size={22} color={colors.text} /></PressableScale>
          </View>

          {entries.length ? (
            <View style={{ gap: 6 }}>
              {entries.map((m, i) => (
                <View key={m.uid ?? i} style={s.entryRow}>
                  <Text style={s.entryName} numberOfLines={2}>{m.summary}</Text>
                  <PressableScale hitSlop={8} onPress={() => onAddToShopping(m)} style={s.cartBtn}>
                    <Ionicons name="cart-outline" size={18} color={colors.muted} />
                  </PressableScale>
                </View>
              ))}
            </View>
          ) : null}

          <TextInput style={s.input} placeholder={i18n.t('mealPlaceholder')} placeholderTextColor={colors.muted} value={text} onChangeText={setText} autoFocus multiline />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PressableScale style={[s.save, { backgroundColor: meta.color, flex: 1, opacity: busy || !text.trim() ? 0.6 : 1 }]} onPress={() => text.trim() && void run(() => onAddNote(text.trim()))}>
              <Text style={s.saveText}>{busy ? '…' : i18n.t('addMeal')}</Text>
            </PressableScale>
            <PressableScale style={[s.randomBtn, { opacity: busy ? 0.6 : 1 }]} onPress={() => void run(onRandom)}>
              <Ionicons name="shuffle" size={18} color={colors.text} />
              <Text style={s.randomText}>{i18n.t('randomMeal')}</Text>
            </PressableScale>
          </View>
          <Text style={s.hint}>{i18n.t('mealieRemoveHint')}</Text>
        </View>
      </View>
    </Modal>
  );
}

// ===== التقويم المحلي (من غير Mealie): إنشاء/استبدال/حذف كامل =====
function LocalEditMealModal({ calendarId, day, slot, current, settings, onClose, onSaved }: {
  calendarId: string; day: Date; slot: MealSlot; current?: Meal; settings: ConnectionSettings; onClose: () => void; onSaved: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [text, setText] = useState(current?.summary ?? '');
  const [saving, setSaving] = useState(false);
  const meta = SLOT_META[slot];

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // استبدال: نحذف وجبة الخانة القديمة (لو فيه) ثم ننشئ الجديدة.
      if (current?.uid) await deleteCalendarEvent(settings, calendarId, current.uid).catch(() => {});
      if (text.trim()) {
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), meta.h, 0, 0);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        await createCalendarEvent(settings, calendarId, {
          summary: text.trim(),
          start_date_time: start.toISOString(),
          end_date_time: end.toISOString(),
          description: `${SLOT_MARKER}${slot}`,
        });
      }
      onSaved();
    } catch {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[s.slotIcon, { backgroundColor: meta.color + '22' }]}><Ionicons name={meta.icon} size={16} color={meta.color} /></View>
              <Text style={s.sheetTitle}>{i18n.t(slot)} · {day.toLocaleDateString(i18n.locale || 'en', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
            </View>
            <PressableScale onPress={onClose}><Ionicons name="close" size={22} color={colors.text} /></PressableScale>
          </View>
          <TextInput style={s.input} placeholder={i18n.t('mealPlaceholder')} placeholderTextColor={colors.muted} value={text} onChangeText={setText} autoFocus multiline />
          <PressableScale style={[s.save, { backgroundColor: meta.color, opacity: saving ? 0.6 : 1 }]} onPress={save}>
            <Text style={s.saveText}>{saving ? '…' : i18n.t('save')}</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    weekBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
    navBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    weekLabel: { color: colors.text, fontSize: 16, fontWeight: '800' },
    sourceBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 6 },
    sourceText: { color: colors.primary, fontSize: 11.5, fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
    list: { padding: 14, gap: 12, paddingBottom: 30 },
    dayCard: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
    dayCardToday: { borderColor: colors.primary },
    dayTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 2 },
    slotRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
    slotIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    slotName: { color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    slotMeal: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 1 },
    slotEmpty: { color: colors.muted, fontWeight: '500' },
    cartBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
    toast: { position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: colors.text, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
    toastText: { color: colors.background, fontWeight: '700', fontSize: 13 },
    backdrop: { flex: 1, backgroundColor: 'rgba(4,8,14,.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 12 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
    entryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10 },
    entryName: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
    input: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, color: colors.text, fontSize: 15, minHeight: 60, textAlignVertical: 'top' },
    save: { borderRadius: 14, padding: 14, alignItems: 'center' },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    randomBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    randomText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    hint: { color: colors.muted, fontSize: 11.5, lineHeight: 16 },
    ingRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 11 },
    check: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    ingText: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
  });
}
