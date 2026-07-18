import { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Card } from '../../components/Card';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { createCalendarEvent, getCalendarEvents, type CalendarEvent } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';

type Props = { calendars: HaEntity[]; settings: ConnectionSettings };
type ViewMode = 'agenda' | 'month';
type Event = CalendarEvent & { color: string; calendarName: string };

const PALETTE = [colors.primary, colors.safe, colors.warning, colors.danger, '#B37FEB', '#FF9F6B'];

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }
function isSameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }
function dayKey(d: Date) { return d.toISOString().slice(0, 10); }

export function CalendarView({ calendars, settings }: Props) {
  const [mode, setMode] = useState<ViewMode>('agenda');
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => {
    setLoading(true);
    const start = startOfMonth(monthCursor);
    const end = endOfMonth(monthCursor);
    return Promise.all(
      calendars.map(async (cal, i) => {
        try {
          const raw = await getCalendarEvents(settings, cal.entity_id, start.toISOString(), end.toISOString());
          return raw.map(e => ({ ...e, color: PALETTE[i % PALETTE.length], calendarName: String(cal.attributes.friendly_name ?? cal.entity_id) }));
        } catch {
          return [];
        }
      }),
    ).then(lists => { setEvents(lists.flat()); setLoading(false); });
  };

  useEffect(() => {
    let on = true;
    void load().catch(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [calendars.map(c => c.entity_id).join('|'), settings.baseUrl, settings.token, monthCursor.getMonth(), monthCursor.getFullYear()]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const key = dayKey(new Date(e.start));
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [events]);

  const agendaDays = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  if (!calendars.length) return <Card><Text style={styles.muted}>{i18n.t('noCalendars')}</Text></Card>;

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.toggleRow}>
        <PressableScale style={[styles.toggleBtn, mode === 'agenda' && styles.toggleBtnActive]} onPress={() => setMode('agenda')}>
          <Text style={[styles.toggleText, mode === 'agenda' && styles.toggleTextActive]}>{i18n.t('agenda')}</Text>
        </PressableScale>
        <PressableScale style={[styles.toggleBtn, mode === 'month' && styles.toggleBtnActive]} onPress={() => setMode('month')}>
          <Text style={[styles.toggleText, mode === 'month' && styles.toggleTextActive]}>{i18n.t('month')}</Text>
        </PressableScale>
        <PressableScale style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={20} color={colors.black} />
        </PressableScale>
      </View>

      <AddEventModal
        visible={showAdd}
        defaultDay={mode === 'month' ? selectedDay : new Date()}
        calendars={calendars}
        settings={settings}
        onClose={() => setShowAdd(false)}
        onCreated={() => { setShowAdd(false); void load(); }}
      />

      {loading ? <Card><Text style={styles.muted}>{i18n.t('loading')}</Text></Card> : null}

      {mode === 'agenda' ? (
        agendaDays.map(day => {
          const list = eventsByDay.get(dayKey(day)) ?? [];
          if (!list.length) return null;
          return (
            <Card key={dayKey(day)}>
              <Text style={styles.dayTitle}>{day.toLocaleDateString(i18n.locale, { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
              {list.map((e, i) => (
                <View key={i} style={styles.eventRow}>
                  <View style={[styles.eventDot, { backgroundColor: e.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle}>{e.summary}</Text>
                    <Text style={styles.muted}>{e.calendarName} · {new Date(e.start).toLocaleTimeString(i18n.locale, { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                </View>
              ))}
            </Card>
          );
        })
      ) : (
        <Card>
          <View style={styles.monthHeader}>
            <PressableScale onPress={() => setMonthCursor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}><Ionicons name="chevron-back" size={20} color={colors.text} /></PressableScale>
            <Text style={styles.dayTitle}>{monthCursor.toLocaleDateString(i18n.locale, { month: 'long', year: 'numeric' })}</Text>
            <PressableScale onPress={() => setMonthCursor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}><Ionicons name="chevron-forward" size={20} color={colors.text} /></PressableScale>
          </View>
          <MonthGrid cursor={monthCursor} eventsByDay={eventsByDay} selectedDay={selectedDay} onSelect={setSelectedDay} />
          <View style={styles.selectedDayEvents}>
            {(eventsByDay.get(dayKey(selectedDay)) ?? []).map((e, i) => (
              <View key={i} style={styles.eventRow}>
                <View style={[styles.eventDot, { backgroundColor: e.color }]} />
                <Text style={styles.eventTitle}>{e.summary}</Text>
              </View>
            ))}
            {!(eventsByDay.get(dayKey(selectedDay)) ?? []).length ? <Text style={styles.muted}>{i18n.t('noEventsThisDay')}</Text> : null}
          </View>
        </Card>
      )}
    </View>
  );
}

function MonthGrid({ cursor, eventsByDay, selectedDay, onSelect }: { cursor: Date; eventsByDay: Map<string, Event[]>; selectedDay: Date; onSelect: (d: Date) => void }) {
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

const styles = StyleSheet.create({
  muted: { color: colors.muted },
  toggleRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4, gap: 4 },
  toggleBtn: { flex: 1, padding: 9, alignItems: 'center', borderRadius: 10 },
  toggleBtnActive: { backgroundColor: colors.surfaceElevated },
  toggleText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  toggleTextActive: { color: colors.primary },
  addBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  dayTitle: { color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 8, textTransform: 'capitalize' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  eventDot: { width: 9, height: 9, borderRadius: 4.5 },
  eventTitle: { color: colors.text, fontWeight: '700', fontSize: 14 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellInner: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', gap: 2 },
  cellSelected: { backgroundColor: colors.primary },
  cellToday: { borderWidth: 1, borderColor: colors.primary },
  cellText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  cellTextSelected: { color: colors.black },
  cellDot: { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.warning },
  selectedDayEvents: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10, gap: 4 },
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
});
