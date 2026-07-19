import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Card } from '../../components/Card';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { createCalendarEvent, getCalendarEvents, type CalendarEvent } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';

type Props = { calendars: HaEntity[]; settings: ConnectionSettings };
type Event = CalendarEvent & { color: string; calendarName: string };

const PALETTE = ['#E64C7A', '#3D5FEF', '#00B894', '#F5A623', '#9B59B6', '#FF6B4A', '#17A2B8', '#E74C3C'];
const STRIP_DAYS = 14;

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }
function isSameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }
function dayKey(d: Date) { return d.toISOString().slice(0, 10); }
// الأحداث "طول اليوم" (زي أعياد الميلاد) بتيجي من HA كتاريخ بس بدون
// وقت (YYYY-MM-DD) - تحويلها بـ new Date() وبعدين toISOString()
// بيفسّرها كمنتصف ليل UTC، وده ممكن يزيحها ليوم غلط حسب توقيت
// المستخدم المحلي. لو النص أصلًا بصيغة تاريخ بس، بنستخدمه زي ما هو
// من غير أي تحويل توقيت خالص.
function eventDayKey(startString: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(startString)) return startString;
  const d = new Date(startString);
  if (Number.isNaN(d.getTime())) return null;
  return dayKey(d);
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// نطاق تحميل واحد واسع (أسبوع للوراء لغاية 6 أسابيع قدام) بيغطي شريط
// الأيام الافتراضي وكمان تصفّح الشهر جوه نافذة "اختيار تاريخ" - من
// غير ما نحتاج نعيد التحميل في كل مرة يفتح فيها المستخدم شهر مختلف.
export function CalendarView({ calendars, settings }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  const load = () => {
    setLoading(true);
    const start = addDays(new Date(), -7);
    const end = addDays(new Date(), 42);
    return Promise.all(
      calendars.map(async (cal, i) => {
        try {
          const raw = await getCalendarEvents(settings, cal.entity_id, start.toISOString(), end.toISOString());
          return { ok: true as const, id: cal.entity_id, count: raw.length, list: raw.map(e => ({ ...e, color: PALETTE[i % PALETTE.length], calendarName: String(cal.attributes.friendly_name ?? cal.entity_id) })) };
        } catch (err) {
          return { ok: false as const, id: cal.entity_id, error: err instanceof Error ? err.message : String(err), list: [] as Event[] };
        }
      }),
    ).then(results => {
      setEvents(results.flatMap(r => r.list));
      setDebugInfo(`تقاويم: ${calendars.length} | ${results.map(r => r.ok ? `${r.id}=${r.count}` : `${r.id}=❌${r.error}`).join(' | ')}`);
      setLoading(false);
    });
  };

  useEffect(() => {
    let on = true;
    void load().catch(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [calendars.map(c => c.entity_id).join('|'), settings.baseUrl, settings.token]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const key = eventDayKey(e.start);
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [events]);

  const strip = useMemo(() => Array.from({ length: STRIP_DAYS }, (_, i) => addDays(new Date(), i)), []);
  const dayEvents = useMemo(() => (eventsByDay.get(dayKey(selectedDay)) ?? []).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()), [eventsByDay, selectedDay]);
  const isToday = isSameDay(selectedDay, new Date());

  if (!calendars.length) return <Card><Text style={styles.muted}>{i18n.t('noCalendars')}</Text></Card>;

  return (
    <View style={{ gap: 14 }}>
      {debugInfo ? <Text selectable style={{ color: colors.warning, fontSize: 10, fontFamily: 'monospace' }}>{debugInfo}</Text> : null}
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>
          {isToday ? i18n.t('today') : selectedDay.toLocaleDateString(i18n.locale, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PressableScale onPress={() => setShowDatePicker(true)} style={styles.iconBtn}>
            <Ionicons name="calendar-outline" size={18} color={colors.text} />
          </PressableScale>
          <PressableScale onPress={() => setShowAdd(true)} style={styles.addBtn}>
            <Ionicons name="add" size={20} color={colors.black} />
          </PressableScale>
        </View>
      </View>

      <FlatList
        horizontal
        data={strip}
        keyExtractor={dayKey}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item: d }) => {
          const has = (eventsByDay.get(dayKey(d)) ?? []).length > 0;
          const sel = isSameDay(d, selectedDay);
          return (
            <PressableScale onPress={() => setSelectedDay(d)} style={[styles.stripDay, sel && styles.stripDaySelected]}>
              <Text style={[styles.stripWeekday, sel && styles.stripTextSelected]}>{d.toLocaleDateString(i18n.locale, { weekday: 'short' })}</Text>
              <Text style={[styles.stripDate, sel && styles.stripTextSelected]}>{d.getDate()}</Text>
              {has ? <View style={[styles.stripDot, sel && styles.stripDotSelected]} /> : null}
            </PressableScale>
          );
        }}
      />

      <AddEventModal
        visible={showAdd}
        defaultDay={selectedDay}
        calendars={calendars}
        settings={settings}
        onClose={() => setShowAdd(false)}
        onCreated={() => { setShowAdd(false); void load(); }}
      />

      <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.monthHeader}>
              <PressableScale onPress={() => setMonthCursor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}><Ionicons name="chevron-back" size={20} color={colors.text} /></PressableScale>
              <Text style={styles.dayTitle}>{monthCursor.toLocaleDateString(i18n.locale, { month: 'long', year: 'numeric' })}</Text>
              <PressableScale onPress={() => setMonthCursor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}><Ionicons name="chevron-forward" size={20} color={colors.text} /></PressableScale>
            </View>
            <MonthGrid cursor={monthCursor} eventsByDay={eventsByDay} selectedDay={selectedDay} onSelect={d => { setSelectedDay(d); setShowDatePicker(false); }} />
            <PressableScale style={styles.modalCancel} onPress={() => setShowDatePicker(false)}><Text style={styles.modalCancelText}>{i18n.t('cancel')}</Text></PressableScale>
          </View>
        </View>
      </Modal>

      {loading ? (
        <Card><Text style={styles.muted}>{i18n.t('loading')}</Text></Card>
      ) : dayEvents.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 26 }}>
          <Ionicons name="sunny-outline" size={26} color={colors.muted} />
          <Text style={styles.muted}>{i18n.t('noEventsThisDay')}</Text>
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          {dayEvents.map((e, i) => (
            <View key={i} style={[styles.eventBlock, { backgroundColor: e.color }]}>
              <Text style={styles.eventBlockIcon}>{isBirthday(e.summary) ? '🎂' : '📌'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventBlockTitle} numberOfLines={2}>{e.summary}</Text>
                <Text style={styles.eventBlockMeta}>{e.calendarName} · {/^\d{4}-\d{2}-\d{2}$/.test(e.start) ? i18n.t('allDay') : new Date(e.start).toLocaleTimeString(i18n.locale, { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const BIRTHDAY_KEYWORDS = ['birthday', 'bday', 'عيد ميلاد', 'ميلاد', 'verjaardag'];
function isBirthday(summary: string) {
  const lower = summary.toLowerCase();
  return BIRTHDAY_KEYWORDS.some(k => lower.includes(k));
}

function MonthGrid({ cursor, eventsByDay, selectedDay, onSelect }: { cursor: Date; eventsByDay: Map<string, Event[]>; selectedDay: Date; onSelect: (d: Date) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const first = startOfMonth(cursor);
  const startOffset = first.getDay();
  const daysInMonth = endOfMonth(cursor).getDate();
  const cells: (Date | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))];
  const today = new Date();

  return (
    <View style={styles.grid}>
      {cells.map((d, i) => (
        <PressableScale key={i} style={styles.cell} disabled={!d} onPress={() => d && onSelect(d)}>
          {d ? (
            <View style={[styles.cellInner, isSameDay(d, selectedDay) && styles.cellSelected, isSameDay(d, today) && styles.cellToday]}>
              <Text style={[styles.cellText, isSameDay(d, selectedDay) && styles.cellTextSelected]}>{d.getDate()}</Text>
              {(eventsByDay.get(dayKey(d)) ?? []).length > 0 ? <View style={styles.cellDot} /> : null}
            </View>
          ) : null}
        </PressableScale>
      ))}
    </View>
  );
}

function AddEventModal({
  visible,
  defaultDay,
  calendars,
  settings,
  onClose,
  onCreated,
}: {
  visible: boolean;
  defaultDay: Date;
  calendars: HaEntity[];
  settings: ConnectionSettings;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [summary, setSummary] = useState('');
  const [calendarId, setCalendarId] = useState(calendars[0]?.entity_id);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    const target = calendars.find(c => c.entity_id === calendarId) ?? calendars[0];
    if (!target || !summary.trim()) return;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (![sh, sm, eh, em].every(Number.isFinite)) { setError(i18n.t('invalidTime')); return; }
    const start = new Date(defaultDay);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(defaultDay);
    end.setHours(eh, em, 0, 0);
    setSaving(true);
    setError(undefined);
    try {
      await createCalendarEvent(settings, target.entity_id, {
        summary: summary.trim(),
        start_date_time: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')} ${startTime}:00`,
        end_date_time: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')} ${endTime}:00`,
      });
      setSummary('');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.dayTitle}>{i18n.t('newEvent')}</Text>
          <Text style={styles.modalDate}>{defaultDay.toLocaleDateString(i18n.locale, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>

          {calendars.length > 1 ? (
            <View style={styles.calRow}>
              {calendars.map(c => (
                <PressableScale key={c.entity_id} style={[styles.calChip, calendarId === c.entity_id && styles.calChipActive]} onPress={() => setCalendarId(c.entity_id)}>
                  <Text style={[styles.calChipText, calendarId === c.entity_id && styles.calChipTextActive]}>{String(c.attributes.friendly_name ?? c.entity_id)}</Text>
                </PressableScale>
              ))}
            </View>
          ) : null}

          <TextInput value={summary} onChangeText={setSummary} placeholder={i18n.t('eventTitle')} placeholderTextColor={colors.muted} style={styles.modalInput} />

          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.muted}>{i18n.t('startTime')}</Text>
              <TextInput value={startTime} onChangeText={setStartTime} placeholder="09:00" placeholderTextColor={colors.muted} style={styles.modalInput} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.muted}>{i18n.t('endTime')}</Text>
              <TextInput value={endTime} onChangeText={setEndTime} placeholder="10:00" placeholderTextColor={colors.muted} style={styles.modalInput} keyboardType="numbers-and-punctuation" />
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.modalActions}>
            <PressableScale style={styles.modalCancel} onPress={onClose}><Text style={styles.modalCancelText}>{i18n.t('cancel')}</Text></PressableScale>
            <PressableScale style={[styles.modalSave, (!summary.trim() || saving) && styles.modalSaveDisabled]} disabled={!summary.trim() || saving} onPress={() => void submit()}>
              <Text style={styles.modalSaveText}>{saving ? i18n.t('loading') : i18n.t('saveEvent')}</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Palette) { return StyleSheet.create({
  muted: { color: colors.muted },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  screenTitle: { color: colors.text, fontSize: 20, fontWeight: '900', textTransform: 'capitalize', flexShrink: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stripDay: { width: 52, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 4 },
  stripDaySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  stripWeekday: { color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  stripDate: { color: colors.text, fontSize: 17, fontWeight: '800' },
  stripTextSelected: { color: colors.black },
  stripDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.warning },
  stripDotSelected: { backgroundColor: colors.black },
  dayTitle: { color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 8, textTransform: 'capitalize' },
  eventBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14 },
  eventBlockIcon: { fontSize: 18 },
  eventBlockTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  eventBlockMeta: { color: 'rgba(255,255,255,.85)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellInner: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', gap: 2 },
  cellSelected: { backgroundColor: colors.primary },
  cellToday: { borderWidth: 1, borderColor: colors.primary },
  cellText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  cellTextSelected: { color: colors.black },
  cellDot: { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.warning },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(4,8,14,.82)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 12 },
  modalDate: { color: colors.muted, marginTop: -6, marginBottom: 4 },
  calRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  calChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  calChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  calChipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  calChipTextActive: { color: colors.black },
  modalInput: { color: colors.text, backgroundColor: colors.surfaceElevated, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4 },
  timeRow: { flexDirection: 'row', gap: 10 },
  errorText: { color: colors.danger, fontSize: 13 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalCancel: { flex: 1, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelText: { color: colors.muted, fontWeight: '800' },
  modalSave: { flex: 1, padding: 13, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center' },
  modalSaveDisabled: { opacity: 0.5 },
  modalSaveText: { color: colors.black, fontWeight: '900' },
}); }
