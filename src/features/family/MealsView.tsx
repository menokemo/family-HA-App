import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { addTodoItem, createCalendarEvent, deleteCalendarEvent, getCalendarEvents, type CalendarEvent } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';

type Props = { mealsCalendar: HaEntity; lists: HaEntity[]; settings: ConnectionSettings };
type SlotKey = 'breakfast' | 'lunch' | 'dinner';
type Meal = CalendarEvent & { slot: SlotKey };

const SLOT_MARKER = '·slot:';
const SLOTS: { key: SlotKey; h: number; icon: string; color: string }[] = [
  { key: 'breakfast', h: 8, icon: 'cafe-outline', color: '#F5A623' },
  { key: 'lunch', h: 13, icon: 'restaurant-outline', color: '#1D9E75' },
  { key: 'dinner', h: 19, icon: 'moon-outline', color: '#534AB7' },
];

function mondayOf(d: Date) { const r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const dow = (r.getDay() + 6) % 7; r.setDate(r.getDate() - dow); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function eventDayKey(start: string) { if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start; const d = new Date(start); return Number.isNaN(d.getTime()) ? null : dayKey(d); }
function slotOf(ev: CalendarEvent): SlotKey {
  const d = ev.description ?? '';
  const i = d.indexOf(SLOT_MARKER);
  if (i !== -1) { const v = d.slice(i + SLOT_MARKER.length).trim(); if (v === 'breakfast' || v === 'lunch' || v === 'dinner') return v; }
  const h = /^\d{4}-\d{2}-\d{2}$/.test(ev.start) ? 12 : new Date(ev.start).getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';
}

export function MealsView({ mealsCalendar, lists, settings }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [weekStart, setWeekStart] = useState<Date>(mondayOf(new Date()));
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<{ day: Date; slot: SlotKey; current?: Meal } | null>(null);
  const [toast, setToast] = useState<string>('');

  const weekKey = dayKey(weekStart);
  const load = () => {
    setLoading(true);
    const start = weekStart;
    const end = addDays(weekStart, 7);
    return getCalendarEvents(settings, mealsCalendar.entity_id, start.toISOString(), end.toISOString())
      .then(list => setMeals(list.map(e => ({ ...e, slot: slotOf(e) }))))
      .catch(() => setMeals([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [weekKey, settings.baseUrl, settings.token]);

  // تجميع: يوم → وجبة → الحدث.
  const byDaySlot = useMemo(() => {
    const m: Record<string, Partial<Record<SlotKey, Meal>>> = {};
    for (const e of meals) { const k = eventDayKey(e.start); if (!k) continue; (m[k] ??= {})[e.slot] = e; }
    return m;
  }, [meals]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const addToGroceries = async (meal: Meal) => {
    if (!lists.length) { setToast(i18n.t('noLists')); return; }
    try { await addTodoItem(settings, lists[0].entity_id, meal.summary); setToast(`${i18n.t('addedToGroceries')} · ${lists[0].attributes.friendly_name ?? ''}`); }
    catch { setToast(i18n.t('saveError')); }
    setTimeout(() => setToast(''), 2500);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.weekBar}>
        <PressableScale style={s.navBtn} onPress={() => setWeekStart(addDays(weekStart, -7))}><Ionicons name="chevron-back" size={20} color={colors.text} /></PressableScale>
        <Text style={s.weekLabel}>{weekStart.toLocaleDateString(i18n.locale || 'en', { day: 'numeric', month: 'short' })} – {addDays(weekStart, 6).toLocaleDateString(i18n.locale || 'en', { day: 'numeric', month: 'short' })}</Text>
        <PressableScale style={s.navBtn} onPress={() => setWeekStart(addDays(weekStart, 7))}><Ionicons name="chevron-forward" size={20} color={colors.text} /></PressableScale>
      </View>

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
                {SLOTS.map(slot => {
                  const meal = byDaySlot[k]?.[slot.key];
                  return (
                    <PressableScale key={slot.key} style={s.slotRow} onPress={() => setEdit({ day: d, slot: slot.key, current: meal })}>
                      <View style={[s.slotIcon, { backgroundColor: slot.color + '22' }]}><Ionicons name={slot.icon} size={16} color={slot.color} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.slotName}>{i18n.t(slot.key)}</Text>
                        <Text style={[s.slotMeal, !meal && s.slotEmpty]} numberOfLines={2}>{meal?.summary || i18n.t('tapToAdd')}</Text>
                      </View>
                      {meal ? (
                        <PressableScale hitSlop={8} onPress={() => void addToGroceries(meal)} style={s.cartBtn}>
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

      {edit ? (
        <EditMealModal
          calendarId={mealsCalendar.entity_id}
          day={edit.day}
          slot={edit.slot}
          current={edit.current}
          settings={settings}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); void load(); }}
        />
      ) : null}
    </View>
  );
}

function EditMealModal({ calendarId, day, slot, current, settings, onClose, onSaved }: {
  calendarId: string; day: Date; slot: SlotKey; current?: Meal; settings: ConnectionSettings; onClose: () => void; onSaved: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [text, setText] = useState(current?.summary ?? '');
  const [saving, setSaving] = useState(false);
  const slotMeta = SLOTS.find(x => x.key === slot)!;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // استبدال: نحذف وجبة الخانة القديمة (لو فيه) ثم ننشئ الجديدة.
      if (current?.uid) await deleteCalendarEvent(settings, calendarId, current.uid).catch(() => {});
      if (text.trim()) {
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), slotMeta.h, 0, 0);
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
              <View style={[s.slotIcon, { backgroundColor: slotMeta.color + '22' }]}><Ionicons name={slotMeta.icon} size={16} color={slotMeta.color} /></View>
              <Text style={s.sheetTitle}>{i18n.t(slot)} · {day.toLocaleDateString(i18n.locale || 'en', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
            </View>
            <PressableScale onPress={onClose}><Ionicons name="close" size={22} color={colors.text} /></PressableScale>
          </View>
          <TextInput style={s.input} placeholder={i18n.t('mealPlaceholder')} placeholderTextColor={colors.muted} value={text} onChangeText={setText} autoFocus multiline />
          <PressableScale style={[s.save, { backgroundColor: slotMeta.color, opacity: saving ? 0.6 : 1 }]} onPress={save}>
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
    input: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, color: colors.text, fontSize: 15, minHeight: 60, textAlignVertical: 'top' },
    save: { borderRadius: 14, padding: 14, alignItems: 'center' },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
