import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { createCalendarEvent, deleteCalendarEvent, getCalendarEvents, type CalendarEvent } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';
import { MemberAvatar, personColor } from './MemberAvatar';
import { joinEventMeta, splitEventMeta, type EventKind, type EventMeta } from './creator';
import { profileColor, readProfiles, type Profiles } from './profiles';

type Props = { calendars: HaEntity[]; states: HaEntity[]; settings: ConnectionSettings; canManage?: boolean };
type Ev = CalendarEvent & { calendarId: string };
type Ident = { person?: HaEntity; name: string; color: string };
type Who = { holiday?: boolean; creator?: Ident; subject?: Ident };
// وجهة الإضافة: تقويم مشترك قابل للكتابة (سنوي = يوم كامل متكرر، أو مفكرة = بوقت).
type Target = { key: 'annual' | 'planner'; label: string; color: string; calendarId: string };

const STRIP_DAYS = 28;
const HOLIDAY_COLOR = '#C9892F';
const ANNUAL_COLOR = '#BA7517';
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
function weekdayShort(i: number) { return new Date(2023, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' }); }
// نوع التقويم: من attribute المكوّن، أو من entity_id كـfallback.
function calKindOf(cal: HaEntity): string {
  const k = cal.attributes.secure_family_kind as string | undefined;
  if (k) return k;
  const id = cal.entity_id;
  if (id.includes('secure_family_holidays')) return 'holidays';
  if (id.includes('secure_family_annual')) return 'annual';
  if (id.includes('secure_family_planner')) return 'planner';
  return 'other';
}

export function AgendaView({ calendars, states, settings, canManage = true }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Ev | null>(null);
  const [editing, setEditing] = useState<Ev | null>(null);
  const [view, setView] = useState<'agenda' | 'month'>('agenda');
  const [selectedDay, setSelectedDay] = useState<Date>(startOfDay(new Date()));
  const [anchor, setAnchor] = useState<Date>(startOfMonth(new Date()));

  const persons = useMemo(() => states.filter(e => e.entity_id.startsWith('person.')), [states]);
  const me = useMemo(() => persons.find(p => p.entity_id === settings.selectedPersonId), [persons, settings.selectedPersonId]);
  const myName = me ? String(me.attributes.friendly_name ?? me.entity_id) : undefined;
  const personByName = useMemo(() => new Map(persons.map(p => [String(p.attributes.friendly_name ?? p.entity_id), p])), [persons]);
  const kindById = useMemo(() => Object.fromEntries(calendars.map(c => [c.entity_id, calKindOf(c)])), [calendars]);
  const profiles = useMemo(() => readProfiles(states), [states]);

  const ident = (name?: string): Ident | undefined => {
    if (!name) return undefined;
    const person = personByName.get(name);
    const color = profileColor(person?.entity_id, profiles) ?? personColor(person?.entity_id ?? name);
    return { person, name, color };
  };
  // مين الحدث: عطلة رسمية؟ وإلا المنشئ (·by:) و«خاص بمين» (·for:) من الوصف.
  const resolveWho = (ev: Ev): Who => {
    if (kindById[ev.calendarId] === 'holidays') return { holiday: true };
    const { createdBy, forWhom } = splitEventMeta(ev.description);
    return { creator: ident(createdBy), subject: ident(forWhom) };
  };
  const colorOf = (ev: Ev): string => {
    const w = resolveWho(ev);
    if (w.holiday) return HOLIDAY_COLOR;
    return w.subject?.color ?? w.creator?.color ?? colors.primary;
  };

  // وجهات الإضافة: تقويم سنوي + مفكرة (القابلين للكتابة). الأعياد عرض-فقط فمش هنا.
  const targets = useMemo<Target[]>(() => {
    const out: Target[] = [];
    const annual = calendars.find(c => kindById[c.entity_id] === 'annual');
    const planner = calendars.find(c => kindById[c.entity_id] === 'planner');
    if (planner) out.push({ key: 'planner', label: i18n.t('calPlanner'), color: colors.primary, calendarId: planner.entity_id });
    if (annual) out.push({ key: 'annual', label: i18n.t('calAnnual'), color: ANNUAL_COLOR, calendarId: annual.entity_id });
    // توافق مع المكوّن القديم (قبل v0.9): لو مفيش سنوي/مفكرة، نستخدم أول تقويم
    // قابل للكتابة (مش عطلة) كـ«مفكرة» عشان زر الإضافة يفضل شغّال.
    if (out.length === 0) {
      const writable = calendars.find(c => kindById[c.entity_id] !== 'holidays');
      if (writable) out.push({ key: 'planner', label: i18n.t('calPlanner'), color: colors.primary, calendarId: writable.entity_id });
    }
    return out;
  }, [calendars, kindById, colors.primary]);

  const [winStart, winEnd] = useMemo<[Date, Date]>(() => {
    if (view === 'month') return [addDays(startOfMonth(anchor), -7), addDays(endOfMonth(anchor), 7)];
    return [startOfDay(new Date()), addDays(startOfDay(new Date()), STRIP_DAYS)];
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
  useEffect(() => { void load(); }, [calKey, winKey, settings.baseUrl, settings.token]);

  const byDay = useMemo(() => {
    const m: Record<string, Ev[]> = {};
    for (const e of events) { const k = eventDayKey(e.start); if (!k) continue; (m[k] ??= []).push(e); }
    for (const k of Object.keys(m)) m[k].sort(sortTime);
    return m;
  }, [events]);

  const dayTitle = (d: Date) => {
    const tk = dayKey(new Date());
    const k = dayKey(d);
    if (k === tk) return i18n.t('today');
    if (k === dayKey(addDays(new Date(), 1))) return i18n.t('tomorrow');
    return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const onDelete = (e: Ev) => {
    if (!canManage || !e.uid || kindById[e.calendarId] === 'holidays') return; // الطفل/الأعياد: مفيش حذف
    Alert.alert(e.summary || i18n.t('untitled'), i18n.t('deleteEventConfirm'), [
      { text: i18n.t('cancel'), style: 'cancel' },
      { text: i18n.t('delete'), style: 'destructive', onPress: () => { void deleteCalendarEvent(settings, e.calendarId, e.uid!).then(load).catch(() => {}); } },
    ]);
  };

  const row = (e: Ev): ReactElement => {
    const who = resolveWho(e);
    // الصورة على اليمين = المنشئ لو موجود، وإلا صاحب «خاص بمين» (زي الميلاد المتولّد).
    const right = who.creator ?? who.subject;
    // علامة «لـ فلان» تحت العنوان بس لما في منشئ **و** خاص-بمين مختلفين.
    const showFor = who.creator && who.subject;
    const barColor = who.holiday ? HOLIDAY_COLOR : (who.subject?.color ?? who.creator?.color ?? colors.primary);
    return (
      <PressableScale key={(e.uid ?? '') + e.start} onPress={() => setDetail(e)} style={s.row}>
        <View style={[s.bar, { backgroundColor: barColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle} numberOfLines={1}>{e.summary || i18n.t('untitled')}</Text>
          <Text style={s.rowTime} numberOfLines={1}>
            {timeLabel(e.start)}
            {showFor ? `  ·  ${i18n.t('forShort')} ${who.subject!.name.split(' ')[0]}` : ''}
          </Text>
          {splitEventMeta(e.description).note ? (
            <Text style={s.rowNote} numberOfLines={2}>{splitEventMeta(e.description).note}</Text>
          ) : null}
        </View>
        {who.holiday ? (
          <View style={[s.holidayBadge, { backgroundColor: HOLIDAY_COLOR + '22' }]}><Ionicons name="flag" size={15} color={HOLIDAY_COLOR} /></View>
        ) : right ? (
          <View style={s.by}>
            <MemberAvatar person={right.person} name={right.name} settings={settings} size={26} color={right.color} />
            <Text style={s.byName} numberOfLines={1}>{right.name.split(' ')[0]}</Text>
          </View>
        ) : null}
      </PressableScale>
    );
  };

  const strip = useMemo(() => Array.from({ length: STRIP_DAYS }, (_, i) => addDays(startOfDay(new Date()), i)), []);
  const dayEvents = byDay[dayKey(selectedDay)] ?? [];

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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.stripOuter} contentContainerStyle={s.stripRow}>
            {strip.map(d => {
              const sel = dayKey(d) === dayKey(selectedDay);
              const isToday = dayKey(d) === dayKey(new Date());
              const has = !!byDay[dayKey(d)]?.length;
              return (
                <PressableScale key={dayKey(d)} style={[s.chip, sel && s.chipSel]} onPress={() => setSelectedDay(startOfDay(d))}>
                  <Text style={[s.chipDow, sel && s.chipSelText]}>{d.toLocaleDateString(locale(), { weekday: 'short' })}</Text>
                  <Text style={[s.chipNum, sel && s.chipSelText, isToday && !sel && { color: colors.primary }]}>{d.getDate()}</Text>
                  <View style={[s.chipDot, { backgroundColor: has ? (sel ? colors.black : colors.primary) : 'transparent' }]} />
                </PressableScale>
              );
            })}
          </ScrollView>

          <Text style={s.selDayLabel}>{dayTitle(selectedDay)}</Text>
          {loading ? (
            <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
          ) : (
            <ScrollView contentContainerStyle={s.list}>
              {dayEvents.length === 0 ? (
                <View style={s.center}><Ionicons name="calendar-clear-outline" size={36} color={colors.muted} /><Text style={s.empty}>{i18n.t('noEventsThisDay')}</Text></View>
              ) : dayEvents.map(row)}
              <View style={{ height: 80 }} />
            </ScrollView>
          )}
        </>
      ) : (
        <MonthView
          anchor={anchor}
          selectedDay={selectedDay}
          byDay={byDay}
          colorOf={colorOf}
          onPrev={() => setAnchor(a => startOfMonth(addDays(startOfMonth(a), -1)))}
          onNext={() => setAnchor(a => startOfMonth(addDays(endOfMonth(a), 1)))}
          onSelect={d => setSelectedDay(startOfDay(d))}
          colors={colors}
          s={s}
          renderRow={row}
          dayTitle={dayTitle}
          loading={loading}
        />
      )}

      {targets.length > 0 ? (
        <PressableScale style={s.fab} onPress={() => setAdding(true)}>
          <Ionicons name="add" size={28} color="#fff" />
        </PressableScale>
      ) : null}

      {adding || editing ? (
        <EventSheet
          targets={targets}
          persons={persons}
          profiles={profiles}
          settings={settings}
          initialDay={selectedDay}
          myName={myName}
          edit={editing ?? undefined}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); void load(); }}
        />
      ) : null}

      {detail ? (
        <EventDetailSheet
          event={detail}
          who={resolveWho(detail)}
          meta={splitEventMeta(detail.description)}
          readOnly={kindById[detail.calendarId] === 'holidays'}
          settings={settings}
          onEdit={() => { setEditing(detail); setDetail(null); }}
          onDelete={() => { const e = detail; setDetail(null); onDelete(e); }}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </View>
  );
}

function MonthView({ anchor, selectedDay, byDay, colorOf, onPrev, onNext, onSelect, colors, s, renderRow, dayTitle, loading }: {
  anchor: Date; selectedDay: Date; byDay: Record<string, Ev[]>; colorOf: (ev: Ev) => string;
  onPrev: () => void; onNext: () => void; onSelect: (d: Date) => void; colors: Palette;
  s: ReturnType<typeof makeStyles>; renderRow: (e: Ev) => ReactElement; dayTitle: (d: Date) => string; loading: boolean;
}) {
  const first = startOfMonth(anchor);
  const gridStart = addDays(first, -first.getDay());
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
      <Text style={s.selDayLabel}>{dayTitle(selectedDay)}</Text>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {selEvents.length === 0 ? (
            <View style={s.center}><Ionicons name="calendar-clear-outline" size={36} color={colors.muted} /><Text style={s.empty}>{i18n.t('noEventsThisDay')}</Text></View>
          ) : selEvents.map(renderRow)}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </View>
  );
}

const REMIND_OPTS: { min: number; key: string }[] = [
  { min: -1, key: 'remindNone' },
  { min: 0, key: 'remindAtTime' },
  { min: 10, key: 'remind10m' },
  { min: 60, key: 'remind1h' },
  { min: 1440, key: 'remind1d' },
];

function remindLabel(min: number): string {
  if (min < 0) return i18n.t('remindNone');
  if (min === 0) return i18n.t('remindAtTime');
  if (min === 10) return i18n.t('remind10m');
  if (min === 60) return i18n.t('remind1h');
  if (min === 1440) return i18n.t('remind1d');
  return `${min} ${i18n.t('min')}`;
}

const KIND_META: Record<EventKind, { icon: string; key: string }> = {
  birthday: { icon: 'gift', key: 'kindBirthday' },
  appointment: { icon: 'calendar', key: 'kindAppointment' },
  occasion: { icon: 'sparkles', key: 'kindOccasion' },
};

// فورم موحّد للإضافة والتعديل، بأنواع سريعة (عيد ميلاد/ميعاد/مناسبة) تظبط الحقول.
function EventSheet({ targets, persons, profiles, settings, initialDay, myName, edit, onClose, onSaved }: {
  targets: Target[]; persons: HaEntity[]; profiles: Profiles; settings: ConnectionSettings; initialDay: Date; myName?: string;
  edit?: Ev; onClose: () => void; onSaved: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const annualTarget = targets.find(t => t.key === 'annual');
  const plannerTarget = targets.find(t => t.key === 'planner') ?? targets[0];

  const editMeta = edit ? splitEventMeta(edit.description) : undefined;
  const editStart = edit ? new Date(edit.start) : undefined;
  const editAllDay = edit ? isAllDay(edit.start) : false;
  const initKind: EventKind = editMeta?.kind ?? (edit ? (editAllDay ? 'occasion' : 'appointment') : 'appointment');

  const [kind, setKind] = useState<EventKind>(initKind);
  const [title, setTitle] = useState(edit && initKind !== 'birthday' ? edit.summary : '');
  const [who, setWho] = useState(edit ? (editMeta?.forWhom ?? (initKind === 'birthday' ? edit.summary : '')) : '');
  const [day, setDay] = useState<Date>(startOfDay(editStart && !Number.isNaN(editStart.getTime()) ? editStart : initialDay));
  const [hour, setHour] = useState(editStart && !editAllDay ? pad2(editStart.getHours()) : '09');
  const [minute, setMinute] = useState(editStart && !editAllDay ? pad2(editStart.getMinutes()) : '00');
  const [repeatYearly, setRepeatYearly] = useState<boolean>(edit ? edit.calendarId === annualTarget?.calendarId : false);
  const [location, setLocation] = useState(editMeta?.location ?? '');
  const [remind, setRemind] = useState<number>(editMeta?.remind ?? -1);
  const [note, setNote] = useState(editMeta?.note ?? '');
  const [saving, setSaving] = useState(false);

  const isBirthday = kind === 'birthday';
  const isAppt = kind === 'appointment';
  const allDay = !isAppt;
  const summaryText = (isBirthday ? who : title).trim();
  const canSave = summaryText.length > 0 && !saving;

  const resolveTarget = (): Target | undefined => {
    if (isAppt) return plannerTarget;
    if (isBirthday) return annualTarget ?? plannerTarget;
    return (repeatYearly ? annualTarget : plannerTarget) ?? plannerTarget;
  };

  const save = async () => {
    const target = resolveTarget();
    if (!canSave || !target) return;
    setSaving(true);
    const meta: EventMeta = {
      createdBy: editMeta?.createdBy ?? myName,
      forWhom: who.trim() || undefined,
      location: !isBirthday && location.trim() ? location.trim() : undefined,
      remind: remind >= 0 ? remind : undefined,
      kind,
      note: note.trim() || undefined,
    };
    const description = joinEventMeta(meta);
    try {
      if (edit?.uid) await deleteCalendarEvent(settings, edit.calendarId, edit.uid).catch(() => {});
      if (allDay) {
        await createCalendarEvent(settings, target.calendarId, { summary: summaryText, start_date: dayKey(day), end_date: dayKey(addDays(day, 1)), description });
      } else {
        const h = Math.min(23, Math.max(0, parseInt(hour, 10) || 0));
        const m = Math.min(59, Math.max(0, parseInt(minute, 10) || 0));
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        await createCalendarEvent(settings, target.calendarId, { summary: summaryText, start_date_time: start.toISOString(), end_date_time: end.toISOString(), description });
      }
      onSaved();
    } catch { setSaving(false); }
  };

  const whoChips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10, paddingVertical: 2 }} keyboardShouldPersistTaps="handled">
      {persons.map(p => {
        const name = String(p.attributes.friendly_name ?? p.entity_id);
        const sel = who === name;
        const c = profileColor(p.entity_id, profiles) ?? personColor(p.entity_id);
        return (
          <PressableScale key={p.entity_id} style={[s.who2, sel && { borderColor: c, backgroundColor: c + '18' }]} onPress={() => setWho(sel ? '' : name)}>
            <MemberAvatar person={p} settings={settings} size={26} color={c} />
            <Text style={[s.whoName, sel && { color: c }]} numberOfLines={1}>{name.split(' ')[0]}</Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{edit ? i18n.t('editEvent') : i18n.t('addEvent')}</Text>
            <PressableScale onPress={onClose}><Ionicons name="close" size={22} color={colors.text} /></PressableScale>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }} keyboardShouldPersistTaps="handled">

            <View style={s.kindRow}>
              {(['birthday', 'appointment', 'occasion'] as EventKind[]).map(k => {
                const sel = kind === k;
                return (
                  <PressableScale key={k} style={[s.kindBtn, sel && { borderColor: colors.primary, backgroundColor: colors.primary + '18' }]} onPress={() => setKind(k)}>
                    <Ionicons name={KIND_META[k].icon + (sel ? '' : '-outline')} size={18} color={sel ? colors.primary : colors.muted} />
                    <Text style={[s.kindText, sel && { color: colors.primary }]} numberOfLines={1}>{i18n.t(KIND_META[k].key)}</Text>
                  </PressableScale>
                );
              })}
            </View>

            {isBirthday ? (
              <>
                <Text style={s.fieldLabel}>{i18n.t('whoseBirthday')}</Text>
                <TextInput style={s.input} placeholder={i18n.t('birthdayNamePlaceholder')} placeholderTextColor={colors.muted} value={who} onChangeText={setWho} autoFocus />
                {whoChips}
              </>
            ) : (
              <TextInput style={s.input} placeholder={i18n.t('eventTitle')} placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} autoFocus />
            )}

            <Text style={s.fieldLabel}>{i18n.t('day')}</Text>
            <MonthPicker selected={day} onPick={setDay} />

            {isAppt ? (
              <>
                <Text style={s.fieldLabel}>{i18n.t('time')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 7, paddingVertical: 2, alignItems: 'center' }}>
                  {['07:00', '08:00', '09:00', '12:00', '13:00', '18:00', '20:00'].map(t => {
                    const [th, tm] = t.split(':');
                    const sel = th === hour && tm === minute;
                    return (
                      <PressableScale key={t} style={[s.timeChip, sel && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => { setHour(th); setMinute(tm); }}>
                        <Text style={[s.timeChipText, sel && { color: colors.black }]}>{t}</Text>
                      </PressableScale>
                    );
                  })}
                </ScrollView>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Ionicons name="time-outline" size={20} color={colors.muted} />
                  <TextInput style={[s.input, s.timeInput]} keyboardType="number-pad" maxLength={2} value={hour} onChangeText={setHour} onBlur={() => setHour(pad2(Math.min(23, Math.max(0, parseInt(hour, 10) || 0))))} />
                  <Text style={s.colon}>:</Text>
                  <TextInput style={[s.input, s.timeInput]} keyboardType="number-pad" maxLength={2} value={minute} onChangeText={setMinute} onBlur={() => setMinute(pad2(Math.min(59, Math.max(0, parseInt(minute, 10) || 0))))} />
                </View>
              </>
            ) : null}

            {kind === 'occasion' ? (
              <PressableScale style={s.toggleRow2} onPress={() => setRepeatYearly(v => !v)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="repeat" size={18} color={colors.muted} />
                  <Text style={s.toggleText}>{i18n.t('repeatYearly')}</Text>
                </View>
                <View style={[s.switchTrack, repeatYearly && { backgroundColor: colors.primary }]}>
                  <View style={[s.switchKnob, repeatYearly && { alignSelf: 'flex-end' }]} />
                </View>
              </PressableScale>
            ) : null}

            {!isBirthday ? (
              <>
                <Text style={s.fieldLabel}>{i18n.t('locationOptional')}</Text>
                <TextInput style={s.input} placeholder={i18n.t('locationPlaceholder')} placeholderTextColor={colors.muted} value={location} onChangeText={setLocation} />
                <Text style={s.fieldLabel}>{i18n.t('forWhomOptional')}</Text>
                {whoChips}
              </>
            ) : null}

            <Text style={s.fieldLabel}>{i18n.t('reminder')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 7, paddingVertical: 2 }}>
              {REMIND_OPTS.map(o => {
                const sel = remind === o.min;
                return (
                  <PressableScale key={o.key} style={[s.timeChip, sel && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setRemind(o.min)}>
                    <Text style={[s.timeChipText, sel && { color: colors.black }]}>{i18n.t(o.key)}</Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
            {remind >= 0 ? <Text style={s.remindHint}>{i18n.t('reminderPhase2')}</Text> : null}

            <Text style={s.fieldLabel}>{i18n.t('noteOptional')}</Text>
            <TextInput style={[s.input, { minHeight: 52, textAlignVertical: 'top' }]} placeholder={i18n.t('notePlaceholder')} placeholderTextColor={colors.muted} value={note} onChangeText={setNote} multiline />

            <PressableScale style={[s.save, { backgroundColor: colors.primary, opacity: canSave ? 1 : 0.5 }]} onPress={save}>
              <Text style={s.saveText}>{saving ? '…' : i18n.t('save')}</Text>
            </PressableScale>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// بطاقة تفاصيل الموعد عند الضغط عليه، مع تعديل/حذف (الأعياد عرض-فقط).
function EventDetailSheet({ event, who, meta, readOnly, settings, onEdit, onDelete, onClose }: {
  event: Ev; who: Who; meta: EventMeta; readOnly: boolean; settings: ConnectionSettings;
  onEdit: () => void; onDelete: () => void; onClose: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  void settings;
  const allDay = isAllDay(event.start);
  const d = new Date(allDay ? event.start + 'T12:00:00' : event.start);
  const whenStr = Number.isNaN(d.getTime()) ? '' :
    d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }) +
    (allDay ? '' : ` · ${d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`);
  const km = meta.kind ? KIND_META[meta.kind] : undefined;
  const headColor = who.holiday ? HOLIDAY_COLOR : (who.subject?.color ?? who.creator?.color ?? colors.primary);

  const rows: { icon: string; text: string }[] = [];
  if (whenStr) rows.push({ icon: 'calendar-outline', text: whenStr });
  if (who.holiday) rows.push({ icon: 'flag-outline', text: i18n.t('holiday') });
  if (meta.forWhom) rows.push({ icon: 'person-outline', text: `${i18n.t('forShort')} ${meta.forWhom}` });
  if (meta.location) rows.push({ icon: 'location-outline', text: meta.location });
  if (meta.remind != null) rows.push({ icon: 'notifications-outline', text: remindLabel(meta.remind) });
  if (meta.createdBy) rows.push({ icon: 'create-outline', text: `${i18n.t('byShort')} ${meta.createdBy}` });
  if (meta.note) rows.push({ icon: 'document-text-outline', text: meta.note });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 }}>
              <View style={[s.detailIcon, { backgroundColor: headColor + '22' }]}>
                <Ionicons name={who.holiday ? 'flag' : (km?.icon ?? 'calendar')} size={18} color={headColor} />
              </View>
              <Text style={s.detailTitle} numberOfLines={2}>{event.summary || i18n.t('untitled')}</Text>
            </View>
            <PressableScale onPress={onClose}><Ionicons name="close" size={22} color={colors.text} /></PressableScale>
          </View>

          <View style={{ gap: 10, marginTop: 4 }}>
            {rows.map((r, i) => (
              <View key={i} style={s.detailRow}>
                <Ionicons name={r.icon} size={18} color={colors.muted} />
                <Text style={s.detailText}>{r.text}</Text>
              </View>
            ))}
          </View>

          {!readOnly ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <PressableScale style={[s.save, { flex: 1, backgroundColor: colors.primary }]} onPress={onEdit}>
                <Text style={s.saveText}>{i18n.t('edit')}</Text>
              </PressableScale>
              <PressableScale style={s.deleteBtn} onPress={onDelete}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </PressableScale>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// منتقي تاريخ شهري بـ JS صافي (من غير مكتبة أصلية) — نتيجة شهر بأسهم، تختار أي يوم.
function MonthPicker({ selected, onPick }: { selected: Date; onPick: (d: Date) => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [month, setMonth] = useState<Date>(startOfMonth(selected));
  const daysInMonth = endOfMonth(month).getDate();
  const firstDow = (startOfMonth(month).getDay() + 6) % 7; // الإثنين = 0
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  const weekdays = Array.from({ length: 7 }, (_, i) => addDays(new Date(2024, 0, 1), i).toLocaleDateString(locale(), { weekday: 'narrow' })); // 2024-01-01 = إثنين
  const todayKey = dayKey(startOfDay(new Date()));

  return (
    <View style={s.mp}>
      <View style={s.mpHead}>
        <PressableScale style={s.mpNav} onPress={() => setMonth(startOfMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)))}><Ionicons name="chevron-back" size={18} color={colors.text} /></PressableScale>
        <Text style={s.mpTitle}>{month.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}</Text>
        <PressableScale style={s.mpNav} onPress={() => setMonth(startOfMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)))}><Ionicons name="chevron-forward" size={18} color={colors.text} /></PressableScale>
      </View>
      <View style={s.mpGrid}>
        {weekdays.map((w, i) => <View key={'w' + i} style={s.mpCell}><Text style={s.mpDow}>{w}</Text></View>)}
        {cells.map((d, i) => {
          if (!d) return <View key={'e' + i} style={s.mpCell} />;
          const k = dayKey(d);
          const sel = k === dayKey(selected);
          const isToday = k === todayKey;
          return (
            <PressableScale key={k} style={s.mpCell} onPress={() => onPick(d)}>
              <View style={[s.mpDay, sel && { backgroundColor: colors.primary }, !sel && isToday && { borderColor: colors.primary, borderWidth: 1 }]}>
                <Text style={[s.mpDayText, sel && { color: colors.black, fontWeight: '800' }]}>{d.getDate()}</Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 48 },
    empty: { color: colors.muted, fontSize: 14 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 },
    monthLabel: { color: colors.text, fontSize: 17, fontWeight: '800', textTransform: 'capitalize' },
    viewToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    viewToggleText: { color: colors.text, fontSize: 13, fontWeight: '700' },
    stripOuter: { flexGrow: 0, flexShrink: 0 },
    stripRow: { gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
    chip: { width: 50, paddingVertical: 8, borderRadius: 14, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipDow: { color: colors.muted, fontSize: 10, fontWeight: '600' },
    chipNum: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
    chipSelText: { color: colors.black },
    chipDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
    selDayLabel: { color: colors.text, fontSize: 15, fontWeight: '800', paddingHorizontal: 16, paddingBottom: 2, textTransform: 'capitalize' },
    list: { padding: 14, paddingTop: 6, gap: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, paddingHorizontal: 2 },
    bar: { width: 4, height: 34, borderRadius: 3 },
    rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '600' },
    rowTime: { color: colors.muted, fontSize: 11.5, marginTop: 1 },
    by: { alignItems: 'center', width: 46 },
    byName: { color: colors.muted, fontSize: 9.5, fontWeight: '600', marginTop: 2 },
    holidayBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    fab: { position: 'absolute', bottom: 18, right: 18, width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
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
    backdrop: { flex: 1, backgroundColor: 'rgba(4,8,14,.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 8, maxHeight: '92%' },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
    fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 2 },
    input: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15 },
    timeInput: { width: 54, textAlign: 'center' },
    colon: { color: colors.text, fontSize: 18, fontWeight: '800' },
    typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border },
    typeChipText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
    who2: { alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, width: 64 },
    whoFamily: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    whoName: { color: colors.muted, fontSize: 11, fontWeight: '600' },
    rowNote: { color: colors.muted, fontSize: 12.5, marginTop: 3, lineHeight: 17 },
    timeChip: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    timeChipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
    kindRow: { flexDirection: 'row', gap: 7 },
    kindBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    kindText: { color: colors.muted, fontSize: 11.5, fontWeight: '700' },
    toggleRow2: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginTop: 4 },
    toggleText: { color: colors.text, fontSize: 14, fontWeight: '700' },
    switchTrack: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.border, padding: 3, justifyContent: 'center' },
    switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
    remindHint: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: -2 },
    detailIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    detailTitle: { color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 },
    detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 11 },
    detailText: { color: colors.text, fontSize: 14.5, flex: 1, lineHeight: 20 },
    deleteBtn: { width: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger + '18' },
    mp: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 8 },
    mpHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 },
    mpNav: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
    mpTitle: { color: colors.text, fontSize: 14.5, fontWeight: '800', textTransform: 'capitalize' },
    mpGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    mpCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    mpDow: { color: colors.muted, fontSize: 11, fontWeight: '700' },
    mpDay: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    mpDayText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    save: { borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 14 },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
