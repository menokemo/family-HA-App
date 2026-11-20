import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { getCalendarEvents, socialDelete, wallPost, type CalendarEvent } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';
import { MemberAvatar } from './MemberAvatar';
import { readProfiles } from './profiles';
import { familyMembers, readSocial, resolvePoster, type SocialPost } from './social';

type Props = { calendars: HaEntity[]; states: HaEntity[]; settings: ConnectionSettings; canManage?: boolean };

function ago(ts: number): string {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return i18n.t('justNow');
  if (s < 3600) return `${Math.floor(s / 60)} ${i18n.t('minAgo')}`;
  if (s < 86400) return `${Math.floor(s / 3600)} ${i18n.t('hourAgo')}`;
  return new Date(ts * 1000).toLocaleDateString(i18n.locale || 'en', { day: 'numeric', month: 'short' });
}
function isAllDay(start: string) { return /^\d{4}-\d{2}-\d{2}$/.test(start); }
function evTime(start: string) { if (isAllDay(start)) return i18n.t('allDay'); const d = new Date(start); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(i18n.locale || 'en', { hour: '2-digit', minute: '2-digit' }); }

export function WallView({ calendars, states, settings, canManage = true }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const persons = useMemo(() => familyMembers(states, settings), [states, settings]);
  const profiles = useMemo(() => readProfiles(states), [states]);
  const me = persons.find(p => p.entity_id === settings.selectedPersonId);
  const posts = useMemo(() => readSocial<SocialPost>(states, 'wall').slice().reverse(), [states]);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [today, setToday] = useState<CalendarEvent[]>([]);

  // مواعيد النهاردة لكارت «النهاردة» في أول الفيد.
  const calKey = calendars.map(c => c.entity_id).sort().join('|');
  useEffect(() => {
    if (!calendars.length) { setToday([]); return; }
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    let on = true;
    void Promise.all(calendars.map(c => getCalendarEvents(settings, c.entity_id, start.toISOString(), end.toISOString()).catch(() => [])))
      .then(lists => { if (on) setToday(lists.flat().sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4)); });
    return () => { on = false; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [calKey, settings.baseUrl, settings.token]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try { await wallPost(settings, t); setText(''); } finally { setSending(false); }
  };

  const onDelete = (p: SocialPost) => {
    if (!canManage) return; // الطفل مايحذفش
    Alert.alert(i18n.t('deletePost'), '', [
      { text: i18n.t('cancel'), style: 'cancel' },
      { text: i18n.t('delete'), style: 'destructive', onPress: () => { void socialDelete(settings, 'wall', p.id).catch(() => {}); } },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
      <View style={s.composer}>
        <MemberAvatar person={me} name={me ? undefined : i18n.t('family')} settings={settings} size={32} />
        <TextInput style={s.input} placeholder={i18n.t('wallPlaceholder')} placeholderTextColor={colors.muted} value={text} onChangeText={setText} multiline />
        <PressableScale onPress={send} disabled={!text.trim() || sending} style={[s.sendBtn, { opacity: text.trim() && !sending ? 1 : 0.4 }]}>
          <Ionicons name="send" size={16} color="#fff" />
        </PressableScale>
      </View>

      {today.length > 0 ? (
        <View style={s.card}>
          <View style={s.cardHead}><Ionicons name="calendar-outline" size={14} color={colors.muted} /><Text style={s.cardHeadText}>{i18n.t('today')}</Text></View>
          {today.map((e, i) => (
            <View key={i} style={s.evRow}>
              <View style={[s.evBar, { backgroundColor: colors.primary }]} />
              <Text style={s.evTitle} numberOfLines={1}>{e.summary || i18n.t('untitled')}</Text>
              <Text style={s.evTime}>{evTime(e.start)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {posts.length === 0 ? (
        <View style={s.empty}><Ionicons name="chatbubbles-outline" size={38} color={colors.muted} /><Text style={s.emptyText}>{i18n.t('wallEmpty')}</Text></View>
      ) : posts.map(p => {
        const who = resolvePoster(p, persons, profiles);
        return (
          <PressableScale key={p.id} style={s.card} onLongPress={() => onDelete(p)}>
            <View style={s.postHead}>
              <MemberAvatar person={who.person} name={who.name} settings={settings} size={30} color={who.color} />
              <Text style={s.postName}>{who.name.split(' ')[0]}</Text>
              <Text style={s.postTime}>{ago(p.ts)}</Text>
            </View>
            <Text style={s.postText}>{p.text}</Text>
          </PressableScale>
        );
      })}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    list: { padding: 14, gap: 10 },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 14, padding: 10 },
    input: { flex: 1, color: colors.text, fontSize: 14.5, maxHeight: 100, paddingVertical: 4 },
    sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    card: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 14, padding: 12 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    cardHeadText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
    evRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 },
    evBar: { width: 4, height: 22, borderRadius: 3 },
    evTitle: { flex: 1, color: colors.text, fontSize: 14 },
    evTime: { color: colors.muted, fontSize: 12 },
    postHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 7 },
    postName: { color: colors.text, fontSize: 14, fontWeight: '700' },
    postTime: { color: colors.muted, fontSize: 12, marginLeft: 'auto' },
    postText: { color: colors.text, fontSize: 14.5, lineHeight: 20 },
    empty: { alignItems: 'center', gap: 10, paddingVertical: 48 },
    emptyText: { color: colors.muted, fontSize: 14 },
  });
}
