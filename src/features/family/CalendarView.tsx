import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Card } from '../../components/Card';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { getCalendarEvents, type CalendarEvent } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';

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

  useEffect(() => {
    let on = true;
    setLoading(true);
    const start = startOfMonth(monthCursor);
    const end = endOfMonth(monthCursor);
    void Promise.all(
      calendars.map(async (cal, i) => {
        try {
          const raw = await getCalendarEvents(settings, cal.entity_id, start.toISOString(), end.toISOString());
          return raw.map(e => ({ ...e, color: PALETTE[i % PALETTE.length], calendarName: String(cal.attributes.friendly_name ?? cal.entity_id) }));
        } catch {
          return [];
        }
      }),
    ).then(lists => {
      if (on) { setEvents(lists.flat()); setLoading(false); }
    });
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
        <Pressable style={[styles.toggleBtn, mode === 'agenda' && styles.toggleBtnActive]} onPress={() => setMode('agenda')}>
          <Text style={[styles.toggleText, mode === 'agenda' && styles.toggleTextActive]}>{i18n.t('agenda')}</Text>
        </Pressable>
        <Pressable style={[styles.toggleBtn, mode === 'month' && styles.toggleBtnActive]} onPress={() => setMode('month')}>
          <Text style={[styles.toggleText, mode === 'month' && styles.toggleTextActive]}>{i18n.t('month')}</Text>
        </Pressable>
      </View>

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
            <Pressable onPress={() => setMonthCursor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}><Ionicons name="chevron-back" size={20} color={colors.text} /></Pressable>
            <Text style={styles.dayTitle}>{monthCursor.toLocaleDateString(i18n.locale, { month: 'long', year: 'numeric' })}</Text>
            <Pressable onPress={() => setMonthCursor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}><Ionicons name="chevron-forward" size={20} color={colors.text} /></Pressable>
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
        <Pressable key={i} style={styles.cell} disabled={!d} onPress={() => d && onSelect(d)}>
          {d ? (
            <View style={[styles.cellInner, isSameDay(d, selectedDay) && styles.cellSelected, isSameDay(d, today) && styles.cellToday]}>
              <Text style={[styles.cellText, isSameDay(d, selectedDay) && styles.cellTextSelected]}>{d.getDate()}</Text>
              {(eventsByDay.get(dayKey(d)) ?? []).length > 0 ? <View style={styles.cellDot} /> : null}
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted },
  toggleRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4, gap: 4 },
  toggleBtn: { flex: 1, padding: 9, alignItems: 'center', borderRadius: 10 },
  toggleBtnActive: { backgroundColor: colors.surfaceElevated },
  toggleText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  toggleTextActive: { color: colors.primary },
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
});
