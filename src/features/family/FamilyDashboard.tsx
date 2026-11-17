import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { getCalendarEvents, type CalendarEvent } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';
import { MemberAvatar } from './MemberAvatar';
import { readProfiles } from './profiles';
import { readSocial, resolvePoster, type Chore, type SocialPost } from './social';

type Section = 'home' | 'calendar' | 'tasks' | 'shopping' | 'more';
type Props = { calendars: HaEntity[]; states: HaEntity[]; settings: ConnectionSettings; onOpenSection: (s: Section) => void };

function isAllDay(start: string) { return /^\d{4}-\d{2}-\d{2}$/.test(start); }
function evTime(start: string) { if (isAllDay(start)) return i18n.t('allDay'); const d = new Date(start); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(i18n.locale || 'en', { hour: '2-digit', minute: '2-digit' }); }

export function FamilyDashboard({ calendars, states, settings, onOpenSection }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const persons = useMemo(() => states.filter(e => e.entity_id.startsWith('person.')), [states]);
  const profiles = useMemo(() => readProfiles(states), [states]);
  const me = persons.find(p => p.entity_id === settings.selectedPersonId);
  const myFirst = me ? String(me.attributes.friendly_name ?? '').split(' ')[0] : '';

  const chores = useMemo(() => readSocial<Chore>(states, 'chores'), [states]);
  const openChores = chores.filter(c => !c.done);
  const doneChores = chores.filter(c => c.done);
  const latestPost = useMemo(() => readSocial<SocialPost>(states, 'wall').slice(-1)[0], [states]);

  const [today, setToday] = useState<CalendarEvent[]>([]);
  const calKey = calendars.map(c => c.entity_id).sort().join('|');
  useEffect(() => {
    if (!calendars.length) { setToday([]); return; }
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    let on = true;
    void Promise.all(calendars.map(c => getCalendarEvents(settings, c.entity_id, start.toISOString(), end.toISOString()).catch(() => [])))
      .then(lists => { if (on) setToday(lists.flat().sort((a, b) => a.start.localeCompare(b.start))); });
    return () => { on = false; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [calKey, settings.baseUrl, settings.token]);

  const h = new Date().getHours();
  const greet = h < 12 ? i18n.t('greetMorning') : h < 18 ? i18n.t('greetAfternoon') : i18n.t('greetEvening');
  const dateLabel = new Date().toLocaleDateString(i18n.locale || 'en', { weekday: 'long', day: 'numeric', month: 'long' });

  const stat = (value: number, label: string, color: string) => (
    <View style={s.stat}><Text style={[s.statNum, { color }]}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>
  );

  return (
    <ScrollView contentContainerStyle={s.list}>
      <View style={s.hero}>
        <Text style={s.heroGreet}>{greet}{myFirst ? `، ${myFirst}` : ''}</Text>
        <Text style={s.heroDate}>{dateLabel}</Text>
        {persons.length > 0 ? (
          <View style={s.avatars}>
            {persons.slice(0, 6).map(p => (
              <View key={p.entity_id} style={s.avatarRing}>
                <MemberAvatar person={p} settings={settings} size={34} />
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={s.stats}>
        {stat(openChores.length, i18n.t('statOpen'), colors.primary)}
        {stat(today.length, i18n.t('statApptsToday'), colors.safe)}
        {stat(doneChores.length, i18n.t('completed'), colors.muted)}
      </View>

      <View style={s.rowHead}>
        <Text style={s.rowHeadText}>{i18n.t('chores')}</Text>
        <PressableScale onPress={() => onOpenSection('tasks')}><Text style={s.link}>{i18n.t('viewAll')}</Text></PressableScale>
      </View>
      <View style={s.card}>
        {openChores.length === 0 ? (
          <Text style={s.emptyRow}>{i18n.t('choresEmpty')}</Text>
        ) : openChores.slice(0, 3).map((c, i) => {
          const who = resolvePoster(c, persons, profiles);
          return (
            <View key={c.id} style={[s.taskRow, i < Math.min(openChores.length, 3) - 1 && s.divider]}>
              <Ionicons name="ellipse-outline" size={20} color={colors.muted} />
              <Text style={s.taskTitle} numberOfLines={1}>{c.title}</Text>
              <MemberAvatar person={who.person} name={who.name} settings={settings} size={22} color={who.color} />
            </View>
          );
        })}
      </View>

      <View style={s.rowHead}>
        <Text style={s.rowHeadText}>{i18n.t('appointmentsToday')}</Text>
        <PressableScale onPress={() => onOpenSection('calendar')}><Text style={s.link}>{i18n.t('viewAll')}</Text></PressableScale>
      </View>
      {today.length === 0 ? (
        <View style={s.card}><Text style={s.emptyRow}>{i18n.t('noEventsThisDay')}</Text></View>
      ) : today.slice(0, 3).map((e, i) => (
        <View key={i} style={s.apptRow}>
          <View style={[s.apptBar, { backgroundColor: colors.primary }]} />
          <Text style={s.apptTitle} numberOfLines={1}>{e.summary || i18n.t('untitled')}</Text>
          <Text style={s.apptTime}>{evTime(e.start)}</Text>
        </View>
      ))}

      {latestPost ? (
        <PressableScale style={[s.wall, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '33' }]} onPress={() => onOpenSection('more')}>
          <View style={s.wallHead}><Ionicons name="megaphone-outline" size={15} color={colors.primary} /><Text style={[s.wallFrom, { color: colors.primary }]}>{i18n.t('fromWall')} · {resolvePoster(latestPost, persons, profiles).name.split(' ')[0]}</Text></View>
          <Text style={s.wallText} numberOfLines={2}>{latestPost.text}</Text>
        </PressableScale>
      ) : null}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    list: { padding: 14, gap: 12 },
    hero: { backgroundColor: colors.primary, borderRadius: 18, padding: 16 },
    heroGreet: { color: '#fff', fontSize: 18, fontWeight: '700' },
    heroDate: { color: 'rgba(255,255,255,.82)', fontSize: 12.5, marginTop: 2 },
    avatars: { flexDirection: 'row', gap: 7, marginTop: 12 },
    avatarRing: { borderRadius: 50, borderWidth: 2, borderColor: '#fff' },
    stats: { flexDirection: 'row', gap: 8 },
    stat: { flex: 1, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
    statNum: { fontSize: 22, fontWeight: '800' },
    statLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
    rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, paddingHorizontal: 2 },
    rowHeadText: { fontSize: 14.5, fontWeight: '700', color: colors.text },
    link: { fontSize: 12.5, color: colors.primary, fontWeight: '600' },
    card: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12 },
    emptyRow: { color: colors.muted, fontSize: 13.5, paddingVertical: 14, textAlign: 'center' },
    taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    divider: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
    taskTitle: { flex: 1, color: colors.text, fontSize: 14 },
    apptRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 12, padding: 11 },
    apptBar: { width: 4, height: 28, borderRadius: 3 },
    apptTitle: { flex: 1, color: colors.text, fontSize: 14 },
    apptTime: { color: colors.muted, fontSize: 12 },
    wall: { borderWidth: 0.5, borderRadius: 12, padding: 11 },
    wallHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    wallFrom: { fontSize: 12, fontWeight: '700' },
    wallText: { color: colors.text, fontSize: 13.5, lineHeight: 19 },
  });
}
