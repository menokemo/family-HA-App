import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { choreAdd, choreSet, socialDelete } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';
import { MemberAvatar, personColor } from './MemberAvatar';
import { readProfiles, profileColor } from './profiles';
import { readSocial, resolvePoster, type Chore } from './social';

type Props = { states: HaEntity[]; settings: ConnectionSettings };

export function ChoresView({ states, settings }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const persons = useMemo(() => states.filter(e => e.entity_id.startsWith('person.')), [states]);
  const profiles = useMemo(() => readProfiles(states), [states]);
  const chores = useMemo(() => readSocial<Chore>(states, 'chores').slice().reverse(), [states]);
  const open = chores.filter(c => !c.done);
  const done = chores.filter(c => c.done);

  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState<HaEntity | undefined>(undefined);
  const [adding, setAdding] = useState(false);

  const add = async () => {
    const t = title.trim();
    if (!t || adding) return;
    setAdding(true);
    try { await choreAdd(settings, t, assignee?.entity_id); setTitle(''); setAssignee(undefined); } finally { setAdding(false); }
  };
  const onDelete = (c: Chore) => {
    Alert.alert(c.title, '', [
      { text: i18n.t('cancel'), style: 'cancel' },
      { text: i18n.t('delete'), style: 'destructive', onPress: () => { void socialDelete(settings, 'chores', c.id).catch(() => {}); } },
    ]);
  };

  const row = (c: Chore) => {
    const who = resolvePoster(c, persons, profiles);
    return (
      <PressableScale key={c.id} style={s.row} onPress={() => void choreSet(settings, c.id, !c.done).catch(() => {})} onLongPress={() => onDelete(c)}>
        <Ionicons name={c.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={c.done ? colors.safe : colors.muted} />
        <Text style={[s.title, c.done && s.titleDone]} numberOfLines={1}>{c.title}</Text>
        <MemberAvatar person={who.person} name={who.name} settings={settings} size={24} color={who.color} />
      </PressableScale>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.addBar}>
        <TextInput style={s.input} placeholder={i18n.t('chorePlaceholder')} placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} />
        <PressableScale onPress={add} disabled={!title.trim() || adding} style={[s.addBtn, { opacity: title.trim() && !adding ? 1 : 0.4 }]}>
          <Ionicons name="add" size={22} color="#fff" />
        </PressableScale>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pick}>
        <PressableScale style={[s.who, !assignee && { borderColor: colors.primary, backgroundColor: colors.primary + '18' }]} onPress={() => setAssignee(undefined)}>
          <View style={[s.whoAll, { backgroundColor: colors.muted }]}><Ionicons name="people" size={13} color="#fff" /></View>
          <Text style={[s.whoName, !assignee && { color: colors.primary }]}>{i18n.t('anyone')}</Text>
        </PressableScale>
        {persons.map(p => {
          const sel = assignee?.entity_id === p.entity_id;
          const c = profileColor(p.entity_id, profiles) ?? personColor(p.entity_id);
          return (
            <PressableScale key={p.entity_id} style={[s.who, sel && { borderColor: c, backgroundColor: c + '18' }]} onPress={() => setAssignee(p)}>
              <MemberAvatar person={p} settings={settings} size={26} color={c} />
              <Text style={[s.whoName, sel && { color: c }]} numberOfLines={1}>{String(p.attributes.friendly_name ?? p.entity_id).split(' ')[0]}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={s.list}>
        {open.length === 0 && done.length === 0 ? (
          <View style={s.empty}><Ionicons name="checkbox-outline" size={38} color={colors.muted} /><Text style={s.emptyText}>{i18n.t('choresEmpty')}</Text></View>
        ) : null}
        {open.map(row)}
        {done.length > 0 ? <Text style={s.sectionLabel}>{i18n.t('completed')}</Text> : null}
        {done.map(row)}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    addBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 10 },
    input: { flex: 1, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15 },
    addBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    pick: { gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
    who: { alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, width: 62 },
    whoAll: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    whoName: { color: colors.muted, fontSize: 11, fontWeight: '600' },
    list: { padding: 14, paddingTop: 2, gap: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, paddingHorizontal: 2 },
    title: { flex: 1, color: colors.text, fontSize: 15 },
    titleDone: { color: colors.muted, textDecorationLine: 'line-through' },
    sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 2, marginLeft: 2 },
    empty: { alignItems: 'center', gap: 10, paddingVertical: 48 },
    emptyText: { color: colors.muted, fontSize: 14 },
  });
}
