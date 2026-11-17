import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { createCalendarEvent, deleteCalendarEvent, getCalendarEvents, type CalendarEvent } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';
import { MemberAvatar, personColor } from './MemberAvatar';
import { joinCreator, splitCreator } from './creator';

type Props = { calendars: HaEntity[]; states: HaEntity[]; settings: ConnectionSettings };
type Ev = CalendarEvent & { calendarId: string };
type Who = { person?: HaEntity; name: string; color: string };
// وجهة الإضافة: فرد (تقويمه) أو العيلة (تقويم مشترك).
type Target = { key: string; label: string; color: string; person?: HaEntity; calendarId: string };

const locale = () => i18n.locale || 'en';
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function sameMonth(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function isAllDay(start: string) { return /^\d{4}-\d{2}-\d{2}$/.test(start); }
function eventDayKey(start: string): string | null { if (isAllDay(start)) return start; const d = new Date(start); return Number.isNaN(d.getTime()) ? null : dayKey(d); }
function timeLabel(start: string): string { if (isAllDay(start)) return i18n.t('allDay'); const d = new Date(start); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); }
function sortTime(a: Ev, b: Ev) { return (isAllDay(a.start) ? 0 : 1) - (isAllDay(b.start) ? 0 : 1) || a.start.localeCompare(b.start); }
// 1 يناير 2023 كان يوم أحد → نولّد أسماء أيام الأسبوع تبدأ من الأحد.
function weekdayShort(i: number) { return new Date(2023, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' }); }

export function AgendaView({ calendars, states, settings }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'agenda' | 'month'>('agenda');
  const [selectedDay, setSelectedDay] = useState<Date>(startOfDay(new Date()));
  const [anchor, setAnchor] = useState<Date>(startOfMonth(new Date())); // الشهر المعروض في الفيو الشهري
  const scrollRef = useRef<ScrollView>(null);
  const dayOffsets = useRef<Record<string, number>>({});

  const persons = useMemo(() => states.filter(e => e.entity_id.startsWith('person.')), [states]);
  const me = useMemo(() => persons.find(p => p.entity_id === settings.selectedPersonId), [persons, settings.selectedPersonId]);
  const myName = me ? String(me.attributes.friendly_name ?? me.entity_id) : undefined;
  const personByName = useMemo(() => new Map(persons.map(p => [String(p.attributes.friendly_name ?? p.entity_id), p])), [persons]);

  // صاحب كل تقويم (fallback لو الحدث اتعمل برّا التطبيق فمفيش منشئ مخزّن).
  const calMeta = useMemo(() => {
    const byId = new Map(persons.map(p => [p.entity_id, p]));
    const m: Record<string, { person?: HaEntity; color: string; label: string }> = {};
    for (const cal of calendars) {
      const pid = cal.attributes.person_entity_id as string | undefined;
      const person = pid ? byId.get(pid) : undefined;
      m[cal.entity_id] = person
        ? { person, color: personColor(person.entity_id), label: String(person.attributes.friendly_name ?? person.entity_id) }
        : { color: colors.primary, label: i18n.t('familyShared') };
    }
    return m;
  }, [calendars, persons, colors.primary]);

  // مين الحدث: المنشئ أولًا (صورته واسمه)، وإلا صاحب التقويم.
  const resolveWho = (ev: Ev): Who => {
    const by = splitCreator(ev.description).createdBy;
    if (by) { const person = personByName.get(by); return { person, name: by, color: personColor(person?.entity_id ?? by) }; }
    const meta = calMeta[ev.calendarId];
    return { person: meta?.person, name: meta?.label ?? '', color: meta?.color ?? colors.primary };
  };

  const targets = useMemo<Target[]>(() => {
    const out: Target[] = [];
    for (const cal of calendars) {
      const pid = cal.attributes.person_entity_id as string | undefined;
      const person = pid ? persons.find(p => p.entity_id === pid) : undefined;
      if (person) out.push({ key: person.entity_id, label: String(person.attributes.friendly_name ?? person.entity_id), color: personColor(person.entity_id), person, calendarId: cal.entity_id });
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    const shared = calendars.find(c => c.entity_id.includes('secure_family_events')) ?? calendars.find(c => !c.attributes.person_entity_id);
    if (shared) out.push({ key: 'family', label: i18n.t('familyShared'), color: colors.primary, calendarId: shared.entity_id });
    return out;
  }, [calendars, persons, colors.primary]);

  // نافذة التحميل: الأجندة من النهاردة لـ6 أسابيع قدام؛ الشهري حوالين الشهر المعروض.
  const [winStart, winEnd] = useMemo<[Date, Date]>(() => {
    if (view === 'month') return [addDays(startOfMonth(anchor), -7), addDays(endOfMonth(anchor), 7)];
    return [startOfDay(new Date()), addDays(startOfDay(new Date()), 42)];
  }, [view, anchor]);
  const winKey = `${dayKey(winStart)}_${dayKey(winEnd)}`;
  const calKey = calendars.map(c => c.entity_id).sort().join('|');

  const load = () => {
    if (!calendars.length) { setEvents([]); setLoading(false); return Promise.resolve(); }
    setLoading(true);
    return Promise.all(
      calendars.map(c => getCalendarEvents(settings, c.entity_id, winStart.toISOString(), winEnd.toISOString())
        .then(list => list.map(e => ({ ...e, calendarId: c.entity_id })))
        .catch(() => [] as Ev[])),
    ).then(lists => { setEvents(lists.flat()); setLoading(false); });
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [calKey, winKey, settings.baseUrl, settings.token]);

  const byDay = useMemo(() => {
    const m: Record<string, Ev[]> = {};
    for (const e of events) { const k = eventDayKey(e.start); if (!k) continue; (m[k] ??= []).push(e); }
    for (const k of Object.keys(m)) m[k].sort(sortTime);
    return m;
  }, [events]);

  // مجموعات الأجندة: من النهاردة لقدام، الأيام اللي فيها أحداث بس.
  const groups = useMemo(() => {
    const todayK = dayKey(new Date());
    return Object.keys(byDay).filter(k => k >= todayK).sort().map(k => ({ key: k, date: new Date(k + 'T00:00:00'), events: byDay[k] }));
  }, [byDay]);

  const dayTitle = (d: Date) => {
    const tk = dayKey(new Date());
    const k = dayKey(d);
    if (k === tk) return i18n.t('today');
    if (k === dayKey(addDays(new Date(), 1))) return i18n.t('tomorrow');
    return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'short' });
  };

  const onDelete = (e: Ev) => {
    if (!e.uid) return;
    Alert.alert(e.summary || i18n.t('untitled'), i18n.t('deleteEventConfirm'), [
      { text: i18n.t('cancel'), style: 'cancel' },
      { text: i18n.t('delete'), style: 'destructive', onPress: () => { void deleteCalendarEvent(settings, e.calendarId, e.uid!).then(load).catch(() => {}); } },
    ]);
  };

  // لمس يوم في شريط الأسبوع → نلف لليوم ده في الأجندة (أو أقرب يوم بعده).
  const jumpToDay = (d: Date) => {
    setSelectedDay(startOfDay(d));
    const target = dayKey(d);
    const keys = groups.map(g => g.key);
    const hit = keys.includes(target) ? target : keys.find(k => k >= target);
    if (hit && dayOffsets.current[hit] != null) scrollRef.current?.scrollTo({ y: Math.max(0, dayOffsets.current[hit] - 8), animated: true });
  };

  const row = (e: Ev, inHero: boolean) => {
    const who = resolveWho(e);
    return (
      <PressableScale key={(e.uid ?? '') + e.start} onLongPress={() => onDelete(e)} style={[s.row, inHero && s.rowHero]}>
        <View style={[s.bar, { backgroundColor: who.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle} numberOfLines={1}>{e.summary || i18n.t('untitled')}</Text>
          <Text style={s.rowTime}>{timeLabel(e.start)}</Text>
        </View>
        <View style={s.by}>
          <MemberAvatar person={who.person} name={who.name} settings={settings} size={26} />
          {who.name ? <Text style={s.byName} numberOfLines={1}>{who.name.split(' ')[0]}</Text> : null}
        </View>
      </PressableScale>
    );
  };

  // شريط الأسبوع: 28 يوم من النهاردة، كل يوم فيه نقطة لو عليه أحداث.
  const weekStrip = useMemo(() => Array.from({ length: 28 }, (_, i) => addDays(startOfDay(new Date()), i)), []);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.topBar}>
        <Text style={s.monthLabel}>
          {(view === 'month' ? anchor : selectedDay).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}
        </Text>
        <PressableScale style={s.viewToggle} onPress={() => setView(v => v === 'agenda' ? 'month' : 'agenda')}>
          <Ionicons name={view === 'agenda' ? 'grid-outline' : 'list-outline'} size={16} color={colors.text} />
          <Text style={s.viewToggleText}>{view === 'agenda' ? i18n.t('month') : i18n.t('agenda')}</Text>
        </PressableScale>
      </View>

      {view === 'agenda' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.stripOuter} contentContainerStyle={s.strip}>
            {weekStrip.map(d => {
              const sel = dayKey(d) === dayKey(selectedDay);
              const isToday = dayKey(d) === dayKey(new Date());
              const has = !!byDay[dayKey(d)]?.length;
              return (
                <PressableScale key={dayKey(d)} style={[s.chip, sel && s.chipSel]} onPress={() => jumpToDay(d)}>
                  <Text style={[s.chipDow, sel && s.chipSelText]}>{d.toLocaleDateString(locale(), { weekday: 'short' })}</Text>
                  <Text style={[s.chipNum, sel && s.chipSelText, isToday && !sel && { color: colors.primary }]}>{d.getDate()}</Text>
                  <View style={[s.chipDot, { backgroundColor: has ? (sel ? colors.black : colors.primary) : 'transparent' }]} />
                </PressableScale>
              );
            })}
          </ScrollView>

          {loading ? (
            <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
          ) : groups.length === 0 ? (
            <View style={s.center}><Ionicons name="calendar-outline" size={40} color={colors.muted} /><Text style={s.empty}>{i18n.t('agendaEmpty')}</Text></View>
          ) : (
            <ScrollView ref={scrollRef} contentContainerStyle={s.list}>
              {groups.map((g, gi) => (
                <View key={g.key} onLayout={e => { dayOffsets.current[g.key] = e.nativeEvent.layout.y; }} style={{ marginTop: gi === 0 ? 0 : 6 }}>
                  {gi === 0 && g.key === dayKey(new Date()) ? (
                    <View style={s.hero}>
                      <Text style={s.heroLabel}>{i18n.t('today')} · {g.date.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}</Text>
                      <View style={{ gap: 8 }}>{g.events.map(e => row(e, true))}</View>
                    </View>
                  ) : (
                    <>
                      <Text style={s.dayHeader}>{dayTitle(g.date)}</Text>
                      <View>{g.events.map(e => row(e, false))}</View>
                    </>
                  )}
                </View>
              ))}
              <View style={{ height: 80 }} />
            </ScrollView>
          )}
        </>
      ) : (
        <MonthView
          anchor={anchor}
          selectedDay={selectedDay}
          byDay={byDay}
          colorOf={ev => resolveWho(ev).color}
          onPrev={() => setAnchor(a => startOfMonth(addDays(startOfMonth(a), -1)))}
          onNext={() => setAnchor(a => startOfMonth(addDays(endOfMonth(a), 1)))}
          onSelect={d => setSelectedDay(startOfDay(d))}
          colors={colors}
          s={s}
          renderRow={row}
          loading={loading}
        />
      )}

      <PressableScale style={s.fab} onPress={() => setAdding(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </PressableScale>

      {adding ? <AddEventSheet targets={targets} settings={settings} initialDay={selectedDay} myName={myName} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} /> : null}
    </View>
  );
}

function MonthView({ anchor, selectedDay, byDay, colorOf, onPrev, onNext, onSelect, colors, s, renderRow, loading }: {
  anchor: Date; selectedDay: Date; byDay: Record<string, Ev[]>; colorOf: (ev: Ev) => string;
  onPrev: () => void; onNext: () => void; onSelect: (d: Date) => void; colors: Palette;
  s: ReturnType<typeof makeStyles>; renderRow: (e: Ev, inHero: boolean) => ReactElement; loading: boolean;
}) {
  const first = startOfMonth(anchor);
  const lead = first.getDay(); // الأحد = 0
  const gridStart = addDays(first, -lead);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const selEvents = byDay[dayKey(selectedDay)] ?? [];

  return (
    <View style={{ flex: 1 }}>
      <View style={s.monthNav}>
        <PressableScale onPress={onPrev} style={s.navBtn}><Ionicons name="chevron-back" size={20} color={colors.text} /></PressableScale>
        <View style={{ flex: 1 }} />
        <PressableScale onPress={onNext} style={s.navBtn}><Ionicons name="chevron-forward" size={20} color={colors.text} /></PressableScale>
      </View>
      <View style={s.weekHeader}>
        {Array.from({ length: 7 }, (_, i) => <Text key={i} style={s.weekHeaderCell}>{weekdayShort(i)}</Text>)}
      </View>
      <View style={s.grid}>
        {cells.map(d => {
          const inMonth = sameMonth(d, anchor);
          const isToday = dayKey(d) === dayKey(new Date());
          const sel = dayKey(d) === dayKey(selectedDay);
          const evs = byDay[dayKey(d)] ?? [];
          return (
            <PressableScale key={dayKey(d)} style={[s.cell, sel && s.cellSel]} onPress={() => onSelect(d)}>
              <Text style={[s.cellNum, !inMonth && s.cellOut, isToday && s.cellToday, sel && s.cellSelText]}>{d.getDate()}</Text>
              <View style={s.dots}>
                {evs.slice(0, 3).map((e, i) => <View key={i} style={[s.dot, { backgroundColor: colorOf(e) }]} />)}
              </View>
            </PressableScale>
          );
        })}
      </View>
      <View style={s.monthDivider} />
      <Text style={s.selDayLabel}>{selectedDay.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.selList}>
          {selEvents.length === 0 ? <Text style={s.empty}>{i18n.t('noEventsThisDay')}</Text> : selEvents.map(e => renderRow(e, false))}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </View>
  );
}

function AddEventSheet({ targets, settings, initialDay, myName, onClose, onSaved }: { targets: Target[]; settings: ConnectionSettings; initialDay: Date; myName?: string; onClose: () => void; onSaved: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [title, setTitle] = useState('');
  const [day, setDay] = useState<Date>(startOfDay(initialDay));
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
      await createCalendarEvent(settings, target.calendarId, {
        summary: title.trim(), start_date_time: start.toISOString(), end_date_time: end.toISOString(),
        description: joinCreator('', myName) || undefined,
      });
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
                <PressableScale key={t.key} style={[s.who2, sel && { borderColor: t.color, backgroundColor: t.color + '18' }]} onPress={() => setTarget(t)}>
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
                  <Text style={[s.dayPickDow, sel && s.dayPickSelText]}>{d.toLocaleDateString(locale(), { weekday: 'short' })}</Text>
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
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 },
    monthLabel: { color: colors.text, fontSize: 17, fontWeight: '800', textTransform: 'capitalize' },
    viewToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    viewToggleText: { color: colors.text, fontSize: 13, fontWeight: '700' },
    stripOuter: { flexGrow: 0, flexShrink: 0 },
    strip: { gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
    chip: { width: 50, paddingVertical: 8, borderRadius: 14, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipDow: { color: colors.muted, fontSize: 10, fontWeight: '600' },
    chipNum: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
    chipSelText: { color: colors.black },
    chipDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
    list: { padding: 14, paddingTop: 0, gap: 4 },
    hero: { backgroundColor: colors.primary + '14', borderRadius: 18, padding: 14, marginBottom: 10 },
    heroLabel: { fontSize: 13, fontWeight: '800', color: colors.primary, marginBottom: 10 },
    dayHeader: { fontSize: 12.5, fontWeight: '700', color: colors.muted, marginTop: 10, marginBottom: 4, marginLeft: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, paddingHorizontal: 2 },
    rowHero: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 11, marginBottom: 0 },
    bar: { width: 4, height: 34, borderRadius: 3 },
    rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '600' },
    rowTime: { color: colors.muted, fontSize: 11.5, marginTop: 1 },
    by: { alignItems: 'center', width: 46 },
    byName: { color: colors.muted, fontSize: 9.5, fontWeight: '600', marginTop: 2 },
    fab: { position: 'absolute', bottom: 18, right: 18, width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    // الفيو الشهري
    monthNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 4 },
    navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
    weekHeader: { flexDirection: 'row', paddingHorizontal: 10 },
    weekHeaderCell: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 11, fontWeight: '700', paddingVertical: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
    cell: { width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    cellSel: { backgroundColor: colors.primary },
    cellNum: { color: colors.text, fontSize: 14, fontWeight: '600' },
    cellOut: { color: colors.muted, opacity: 0.45 },
    cellToday: { color: colors.primary, fontWeight: '900' },
    cellSelText: { color: colors.black, fontWeight: '900' },
    dots: { flexDirection: 'row', gap: 2, marginTop: 3, height: 5 },
    dot: { width: 5, height: 5, borderRadius: 3 },
    monthDivider: { height: 1, backgroundColor: colors.border, marginVertical: 8, marginHorizontal: 14 },
    selDayLabel: { color: colors.text, fontSize: 14, fontWeight: '800', paddingHorizontal: 16, textTransform: 'capitalize' },
    selList: { padding: 14, gap: 4 },
    // شيت الإضافة
    backdrop: { flex: 1, backgroundColor: 'rgba(4,8,14,.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 8 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
    fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 2 },
    input: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15 },
    timeInput: { width: 54, textAlign: 'center' },
    colon: { color: colors.text, fontSize: 18, fontWeight: '800' },
    who2: { alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, width: 64 },
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
