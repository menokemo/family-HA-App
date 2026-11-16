import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { createCalendarEvent, deleteCalendarEvent, getCalendarEvents, type CalendarEvent } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';
import { MemberAvatar, personColor } from './MemberAvatar';

type Props = { calendars: HaEntity[]; states: HaEntity[]; settings: ConnectionSettings };
type Ev = CalendarEvent & { calendarId: string };
// وجهة الإضافة: فرد (تقويمه) أو العيلة (تقويم مشترك).
type Target = { key: string; label: string; color: string; person?: HaEntity; calendarId: string };

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function isAllDay(start: string) { return /^\d{4}-\d{2}-\d{2}$/.test(start); }
function eventDayKey(start: string): string | null { if (isAllDay(start)) return start; const d = new Date(start); return Number.isNaN(d.getTime()) ? null : dayKey(d); }
function timeLabel(start: string): string { if (isAllDay(start)) return i18n.t('allDay'); const d = new Date(start); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(i18n.locale || 'en', { hour: '2-digit', minute: '2-digit' }); }
function sortTime(a: Ev, b: Ev) { return (isAllDay(a.start) ? 0 : 1) - (isAllDay(b.start) ? 0 : 1) || a.start.localeCompare(b.start); }

export function AgendaView({ calendars, states, settings }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // لكل تقويم: صاحبه (فرد) ولونه ولقبه — عشان نلوّن الأحداث وننسبها.
  const calMeta = useMemo(() => {
    const persons = new Map(states.filter(e => e.entity_id.startsWith('person.')).map(p => [p.entity_id, p]));
    const m: Record<string, { person?: HaEntity; color: string; label: string }> = {};
    for (const cal of calendars) {
      const pid = cal.attributes.person_entity_id as string | undefined;
      const person = pid ? persons.get(pid) : undefined;
      m[cal.entity_id] = person
        ? { person, color: personColor(person.entity_id), label: String(person.attributes.friendly_name ?? person.entity_id) }
        : { color: colors.primary, label: i18n.t('familyShared') };
    }
    return m;
  }, [calendars, states, colors.primary]);

  // وجهات الإضافة: كل فرد له تقويم + «العيلة».
  const targets = useMemo<Target[]>(() => {
    const persons = new Map(states.filter(e => e.entity_id.startsWith('person.')).map(p => [p.entity_id, p]));
    const out: Target[] = [];
    for (const cal of calendars) {
      const pid = cal.attributes.person_entity_id as string | undefined;
      const person = pid ? persons.get(pid) : undefined;
      if (person) out.push({ key: person.entity_id, label: String(person.attributes.friendly_name ?? person.entity_id), color: personColor(person.entity_id), person, calendarId: cal.entity_id });
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    const shared = calendars.find(c => c.entity_id.includes('secure_family_events')) ?? calendars.find(c => !c.attributes.person_entity_id);
    if (shared) out.push({ key: 'family', label: i18n.t('familyShared'), color: colors.primary, calendarId: shared.entity_id });
    return out;
  }, [calendars, states, colors.primary]);

  const calKey = calendars.map(c => c.entity_id).sort().join('|');
  const load = () => {
    if (!calendars.length) { setEvents([]); setLoading(false); return Promise.resolve(); }
    setLoading(true);
    const start = startOfDay(new Date());
    const end = addDays(start, 30);
    return Promise.all(
      calendars.map(c => getCalendarEvents(settings, c.entity_id, start.toISOString(), end.toISOString())
        .then(list => list.map(e => ({ ...e, calendarId: c.entity_id })))
        .catch(() => [] as Ev[])),
    ).then(lists => { setEvents(lists.flat()); setLoading(false); });
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [calKey, settings.baseUrl, settings.token]);

  // تجميع بالأيام، من النهاردة لقدام، الأيام اللي فيها أحداث بس.
  const groups = useMemo(() => {
    const byDay: Record<string, Ev[]> = {};
    for (const e of events) { const k = eventDayKey(e.start); if (!k) continue; (byDay[k] ??= []).push(e); }
    const todayK = dayKey(new Date());
    return Object.keys(byDay).filter(k => k >= todayK).sort().map(k => ({ key: k, date: new Date(k + 'T00:00:00'), events: byDay[k].sort(sortTime) }));
  }, [events]);

  const dayTitle = (d: Date) => {
    const tk = dayKey(new Date());
    const k = dayKey(d);
    if (k === tk) return i18n.t('today');
    if (k === dayKey(addDays(new Date(), 1))) return i18n.t('tomorrow');
    return d.toLocaleDateString(i18n.locale || 'en', { weekday: 'long', day: 'numeric', month: 'short' });
  };

  const onDelete = (e: Ev) => {
    if (!e.uid) return;
    Alert.alert(e.summary || i18n.t('untitled'), i18n.t('deleteEventConfirm'), [
      { text: i18n.t('cancel'), style: 'cancel' },
      { text: i18n.t('delete'), style: 'destructive', onPress: () => { void deleteCalendarEvent(settings, e.calendarId, e.uid!).then(load).catch(() => {}); } },
    ]);
  };

  const row = (e: Ev, inHero: boolean) => {
    const meta = calMeta[e.calendarId] ?? { color: colors.primary, label: '' };
    return (
      <PressableScale key={(e.uid ?? '') + e.start} onLongPress={() => onDelete(e)} style={[s.row, inHero && s.rowHero]}>
        <View style={[s.bar, { backgroundColor: meta.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle} numberOfLines={1}>{e.summary || i18n.t('untitled')}</Text>
          <Text style={s.rowTime}>{timeLabel(e.start)}</Text>
        </View>
        <MemberAvatar person={meta.person} name={meta.label} settings={settings} size={26} />
      </PressableScale>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
      ) : groups.length === 0 ? (
        <View style={s.center}><Ionicons name="calendar-outline" size={40} color={colors.muted} /><Text style={s.empty}>{i18n.t('agendaEmpty')}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {groups.map((g, gi) => (
            gi === 0 && dayKey(g.date) === dayKey(new Date()) ? (
              <View key={g.key} style={s.hero}>
                <Text style={s.heroLabel}>{i18n.t('today')} · {g.date.toLocaleDateString(i18n.locale || 'en', { day: 'numeric', month: 'short' })}</Text>
                <View style={{ gap: 8 }}>{g.events.map(e => row(e, true))}</View>
              </View>
            ) : (
              <View key={g.key} style={{ marginTop: gi === 0 ? 0 : 6 }}>
                <Text style={s.dayHeader}>{dayTitle(g.date)}</Text>
                <View>{g.events.map(e => row(e, false))}</View>
              </View>
            )
          ))}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      <PressableScale style={s.fab} onPress={() => setAdding(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </PressableScale>

      {adding ? <AddEventSheet targets={targets} settings={settings} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} /> : null}
    </View>
  );
}

function AddEventSheet({ targets, settings, onClose, onSaved }: { targets: Target[]; settings: ConnectionSettings; onClose: () => void; onSaved: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [title, setTitle] = useState('');
  const [day, setDay] = useState<Date>(startOfDay(new Date()));
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [target, setTarget] = useState<Target | undefined>(targets[0]);
  const [saving, setSaving] = useState(false);
  const strip = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(startOfDay(new Date()), i)), []);

  const save = async () => {
    if (!title.trim() || !target || saving) return;
    setSaving(true);
    const h = Math.min(23, Math.max(0, parseInt(hour, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(minute, 10) || 0));
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    try {
      await createCalendarEvent(settings, target.calendarId, { summary: title.trim(), start_date_time: start.toISOString(), end_date_time: end.toISOString() });
      onSaved();
    } catch { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{i18n.t('addEvent')}</Text>
            <PressableScale onPress={onClose}><Ionicons name="close" size={22} color={colors.text} /></PressableScale>
          </View>
          <TextInput style={s.input} placeholder={i18n.t('eventTitle')} placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} autoFocus />

          <Text style={s.fieldLabel}>{i18n.t('forWho')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
            {targets.map(t => {
              const sel = target?.key === t.key;
              return (
                <PressableScale key={t.key} style={[s.who, sel && { borderColor: t.color, backgroundColor: t.color + '18' }]} onPress={() => setTarget(t)}>
                  {t.person ? <MemberAvatar person={t.person} settings={settings} size={28} /> : <View style={[s.whoFamily, { backgroundColor: t.color }]}><Ionicons name="home" size={15} color="#fff" /></View>}
                  <Text style={[s.whoName, sel && { color: t.color }]} numberOfLines={1}>{t.label.split(' ')[0]}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>

          <Text style={s.fieldLabel}>{i18n.t('day')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {strip.map(d => {
              const sel = dayKey(d) === dayKey(day);
              return (
                <PressableScale key={dayKey(d)} style={[s.dayPick, sel && s.dayPickSel]} onPress={() => setDay(d)}>
                  <Text style={[s.dayPickDow, sel && s.dayPickSelText]}>{d.toLocaleDateString(i18n.locale || 'en', { weekday: 'short' })}</Text>
                  <Text style={[s.dayPickNum, sel && s.dayPickSelText]}>{d.getDate()}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <Ionicons name="time-outline" size={20} color={colors.muted} />
            <TextInput style={[s.input, s.timeInput]} keyboardType="number-pad" maxLength={2} value={hour} onChangeText={setHour} />
            <Text style={s.colon}>:</Text>
            <TextInput style={[s.input, s.timeInput]} keyboardType="number-pad" maxLength={2} value={minute} onChangeText={setMinute} />
          </View>

          <PressableScale style={[s.save, { backgroundColor: target?.color ?? colors.primary, opacity: title.trim() && !saving ? 1 : 0.5 }]} onPress={save}>
            <Text style={s.saveText}>{saving ? '…' : i18n.t('saveEvent')}</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
    empty: { color: colors.muted, fontSize: 14 },
    list: { padding: 14, gap: 4 },
    hero: { backgroundColor: colors.primary + '14', borderRadius: 18, padding: 14, marginBottom: 10 },
    heroLabel: { fontSize: 13, fontWeight: '800', color: colors.primary, marginBottom: 10 },
    dayHeader: { fontSize: 12.5, fontWeight: '700', color: colors.muted, marginTop: 10, marginBottom: 4, marginLeft: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, paddingHorizontal: 2 },
    rowHero: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 11 },
    bar: { width: 4, height: 32, borderRadius: 3 },
    rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '600' },
    rowTime: { color: colors.muted, fontSize: 11.5, marginTop: 1 },
    fab: { position: 'absolute', bottom: 18, right: 18, width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    backdrop: { flex: 1, backgroundColor: 'rgba(4,8,14,.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 8 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
    fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 2 },
    input: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15 },
    timeInput: { width: 54, textAlign: 'center' },
    colon: { color: colors.text, fontSize: 18, fontWeight: '800' },
    who: { alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, width: 64 },
    whoFamily: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    whoName: { color: colors.muted, fontSize: 11, fontWeight: '600' },
    dayPick: { width: 46, paddingVertical: 7, borderRadius: 12, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    dayPickSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    dayPickDow: { color: colors.muted, fontSize: 10, fontWeight: '600' },
    dayPickNum: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
    dayPickSelText: { color: colors.black },
    save: { borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 14 },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
