import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { createCalendarEvent, getCalendarEvents, type CalendarEvent } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';
import { MemberAvatar, personColor } from './MemberAvatar';

type Props = { calendars: HaEntity[]; states: HaEntity[]; settings: ConnectionSettings };
type Ev = CalendarEvent & { calendarId: string };

// عمود = فرد (تقويمه الشخصي) أو العمود المشترك (تقاويم العيلة العامة).
type Column = { key: string; label: string; color: string; person?: HaEntity; calendars: HaEntity[]; primary: string };

const STRIP_DAYS = 14;

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function isAllDay(start: string) { return /^\d{4}-\d{2}-\d{2}$/.test(start); }
// مفتاح يوم الحدث بتوقيت المستخدم المحلي (الأحداث طول اليوم بتيجي YYYY-MM-DD
// من غير وقت، فبنستخدمها زي ما هي من غير تحويل توقيت يزيحها ليوم غلط).
function eventDayKey(start: string): string | null {
  if (isAllDay(start)) return start;
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}
function timeLabel(start: string): string {
  if (isAllDay(start)) return i18n.t('allDay');
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(i18n.locale || 'en', { hour: '2-digit', minute: '2-digit' });
}

export function MemberCalendarView({ calendars, states, settings }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [selectedDay, setSelectedDay] = useState<Date>(startOfDay(new Date()));
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [addFor, setAddFor] = useState<Column | null>(null);

  // الأعمدة: فرد لكل تقويم شخصي (عليه person_entity_id) + عمود "العيلة"
  // للتقاويم المشتركة (أعياد ميلاد/مناسبات/مواعيد وأي تقويم تاني).
  const columns = useMemo<Column[]>(() => {
    const persons = new Map(states.filter(e => e.entity_id.startsWith('person.')).map(p => [p.entity_id, p]));
    const personCols: Column[] = [];
    const shared: HaEntity[] = [];
    for (const cal of calendars) {
      const pid = cal.attributes.person_entity_id as string | undefined;
      const person = pid ? persons.get(pid) : undefined;
      if (person) {
        personCols.push({
          key: person.entity_id,
          label: String(person.attributes.friendly_name ?? person.entity_id),
          color: personColor(person.entity_id),
          person,
          calendars: [cal],
          primary: cal.entity_id,
        });
      } else {
        shared.push(cal);
      }
    }
    personCols.sort((a, b) => a.label.localeCompare(b.label));
    if (shared.length) {
      // التقويم الأساسي للإضافة في العمود المشترك: "events" لو موجود وإلا الأول.
      const primary = shared.find(c => c.entity_id.includes('events')) ?? shared[0];
      personCols.push({ key: 'family', label: i18n.t('familyShared'), color: colors.primary, calendars: shared, primary: primary.entity_id });
    }
    return personCols;
  }, [calendars, states, colors.primary]);

  const calendarKey = calendars.map(c => c.entity_id).sort().join('|');

  const load = () => {
    if (!calendars.length) { setEvents([]); setLoading(false); return Promise.resolve(); }
    setLoading(true);
    const start = addDays(new Date(), -7);
    const end = addDays(new Date(), 42);
    // تحميل كل التقاويم بالتوازي في نافذة واحدة واسعة (مفيش إعادة تحميل كل يوم).
    return Promise.all(
      calendars.map(c =>
        getCalendarEvents(settings, c.entity_id, start.toISOString(), end.toISOString())
          .then(list => list.map(e => ({ ...e, calendarId: c.entity_id })))
          .catch(() => [] as Ev[]),
      ),
    ).then(lists => { setEvents(lists.flat()); setLoading(false); });
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [calendarKey, settings.baseUrl, settings.token]);

  // أحداث اليوم المختار مجمّعة حسب التقويم — memoized عشان مفيش إعادة حساب كل render.
  const dayKeyStr = dayKey(selectedDay);
  const byCalendar = useMemo(() => {
    const m: Record<string, Ev[]> = {};
    for (const e of events) {
      if (eventDayKey(e.start) !== dayKeyStr) continue;
      (m[e.calendarId] ??= []).push(e);
    }
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => (isAllDay(a.start) ? -1 : 0) - (isAllDay(b.start) ? -1 : 0) || a.start.localeCompare(b.start));
    }
    return m;
  }, [events, dayKeyStr]);

  const strip = useMemo(() => Array.from({ length: STRIP_DAYS }, (_, i) => addDays(startOfDay(new Date()), i)), []);

  return (
    <View style={{ flex: 1 }}>
      {/* شريط الأيام — ارتفاع ثابت عشان مايتمدّدش */}
      <View style={s.stripOuter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
          {strip.map(d => {
            const sel = dayKey(d) === dayKeyStr;
            return (
              <PressableScale key={dayKey(d)} style={[s.dayCell, sel && s.dayCellSel]} onPress={() => setSelectedDay(d)}>
                <Text style={[s.dayDow, sel && s.daySelText]}>{d.toLocaleDateString(i18n.locale || 'en', { weekday: 'short' })}</Text>
                <Text style={[s.dayNum, sel && s.daySelText]}>{d.getDate()}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
        ) : columns.length === 0 ? (
          <View style={s.center}><Text style={s.empty}>{i18n.t('noCalendars')}</Text></View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.columns}>
            {columns.map(col => {
              const evs = col.calendars.flatMap(c => byCalendar[c.entity_id] ?? []);
              return (
                <View key={col.key} style={s.column}>
                  <View style={s.colHeader}>
                    {col.person ? <MemberAvatar person={col.person} settings={settings} size={26} /> : <View style={[s.familyDot, { backgroundColor: col.color }]}><Ionicons name="home" size={14} color="#fff" /></View>}
                    <Text style={s.colName} numberOfLines={1}>{col.label}</Text>
                  </View>
                  <PressableScale style={[s.addBtn, { borderColor: col.color }]} onPress={() => setAddFor(col)}>
                    <Ionicons name="add" size={18} color={col.color} />
                  </PressableScale>
                  <View style={{ gap: 6, paddingBottom: 12 }}>
                    {evs.map((e, i) => (
                      <View key={(e.uid ?? '') + i} style={[s.event, { backgroundColor: col.color + '22', borderLeftColor: col.color }]}>
                        <Text style={[s.eventTitle, { color: col.color }]} numberOfLines={2}>{e.summary || i18n.t('untitled')}</Text>
                        <Text style={[s.eventTime, { color: col.color }]}>{timeLabel(e.start)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {addFor ? (
        <AddEventModal
          column={addFor}
          day={selectedDay}
          settings={settings}
          onClose={() => setAddFor(null)}
          onSaved={() => { setAddFor(null); void load(); }}
        />
      ) : null}
    </View>
  );
}

function AddEventModal({ column, day, settings, onClose, onSaved }: { column: Column; day: Date; settings: ConnectionSettings; onClose: () => void; onSaved: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [summary, setSummary] = useState('');
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!summary.trim() || saving) return;
    setSaving(true);
    const h = Math.min(23, Math.max(0, parseInt(hour, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(minute, 10) || 0));
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    try {
      await createCalendarEvent(settings, column.primary, {
        summary: summary.trim(),
        start_date_time: start.toISOString(),
        end_date_time: end.toISOString(),
      });
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
              {column.person ? <MemberAvatar person={column.person} settings={settings} size={24} /> : <View style={[s.familyDot, { backgroundColor: column.color }]}><Ionicons name="home" size={12} color="#fff" /></View>}
              <Text style={s.sheetTitle}>{column.label}</Text>
            </View>
            <PressableScale onPress={onClose}><Ionicons name="close" size={22} color={colors.text} /></PressableScale>
          </View>
          <TextInput
            style={s.input}
            placeholder={i18n.t('eventTitle')}
            placeholderTextColor={colors.muted}
            value={summary}
            onChangeText={setSummary}
            autoFocus
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="time-outline" size={20} color={colors.muted} />
            <TextInput style={[s.input, s.timeInput]} keyboardType="number-pad" maxLength={2} value={hour} onChangeText={setHour} />
            <Text style={s.colon}>:</Text>
            <TextInput style={[s.input, s.timeInput]} keyboardType="number-pad" maxLength={2} value={minute} onChangeText={setMinute} />
            <Text style={s.dayHint}>{day.toLocaleDateString(i18n.locale || 'en', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
          </View>
          <PressableScale style={[s.save, { backgroundColor: column.color, opacity: summary.trim() && !saving ? 1 : 0.5 }]} onPress={save}>
            <Text style={s.saveText}>{saving ? '…' : i18n.t('save')}</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    stripOuter: { height: 72, flexGrow: 0, flexShrink: 0 },
    strip: { gap: 8, paddingHorizontal: 12, alignItems: 'center' },
    dayCell: { width: 48, paddingVertical: 8, borderRadius: 14, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    dayCellSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    dayDow: { color: colors.muted, fontSize: 11, fontWeight: '600' },
    dayNum: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 2 },
    daySelText: { color: colors.black },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
    empty: { color: colors.muted, fontSize: 14 },
    columns: { gap: 10, paddingHorizontal: 12, paddingBottom: 16, alignItems: 'flex-start' },
    column: { width: 150, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 8 },
    colHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4 },
    familyDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    colName: { color: colors.text, fontWeight: '700', fontSize: 13, flex: 1 },
    addBtn: { height: 30, borderRadius: 9, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
    colEmpty: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 10 },
    event: { borderRadius: 9, borderLeftWidth: 3, padding: 7 },
    eventTitle: { fontSize: 12, fontWeight: '700' },
    eventTime: { fontSize: 10.5, fontWeight: '600', marginTop: 2, opacity: 0.85 },
    backdrop: { flex: 1, backgroundColor: 'rgba(4,8,14,.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 12 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
    input: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15 },
    timeInput: { width: 54, textAlign: 'center' },
    colon: { color: colors.text, fontSize: 18, fontWeight: '800' },
    dayHint: { color: colors.muted, fontSize: 12, marginLeft: 'auto' },
    save: { borderRadius: 14, padding: 14, alignItems: 'center' },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
