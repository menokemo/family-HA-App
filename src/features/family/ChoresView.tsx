import { useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { choreAdd, choreSet, socialDelete } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';
import { MemberAvatar, personColor } from './MemberAvatar';
import { readProfiles, profileColor } from './profiles';
import { readSocial, resolvePoster, type Chore } from './social';
import { CHORE_CATS, choreIcon, joinChoreMeta, splitChoreMeta, type ChoreCat } from './chore';
import { MonthPicker } from './MonthPicker';
import { dayKey, locale, startOfDay } from './dates';

type Props = { states: HaEntity[]; settings: ConnectionSettings; canManage?: boolean };

const catLabel = (c: ChoreCat) => i18n.t('choreCat_' + c);
const dueLabel = (d: Date) => d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
const parseDue = (k?: string) => (k ? new Date(k + 'T00:00:00') : null);

export function ChoresView({ states, settings, canManage = true }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const persons = useMemo(() => states.filter(e => e.entity_id.startsWith('person.')), [states]);
  const profiles = useMemo(() => readProfiles(states), [states]);
  const chores = useMemo(() => readSocial<Chore>(states, 'chores').slice().reverse(), [states]);
  const open = chores.filter(c => !c.done);
  const done = chores.filter(c => c.done);
  const todayKey = dayKey(startOfDay(new Date()));

  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState<HaEntity | undefined>(undefined);
  const [cat, setCat] = useState<ChoreCat>('other');
  const [due, setDue] = useState<Date | null>(null);
  const [note, setNote] = useState('');
  const [showCal, setShowCal] = useState(false);
  const [adding, setAdding] = useState(false);

  const reset = () => { setTitle(''); setAssignee(undefined); setCat('other'); setDue(null); setNote(''); };
  const add = async () => {
    const t = title.trim();
    if (!t || adding) return;
    setAdding(true);
    const combined = joinChoreMeta(t, { cat, due: due ? dayKey(due) : undefined, note });
    try { await choreAdd(settings, combined, assignee?.entity_id); reset(); } finally { setAdding(false); }
  };
  const onDelete = (c: Chore) => {
    if (!canManage) return; // الطفل مايحذفش
    const { title: shown } = splitChoreMeta(c.title);
    Alert.alert(shown, '', [
      { text: i18n.t('cancel'), style: 'cancel' },
      { text: i18n.t('delete'), style: 'destructive', onPress: () => { void socialDelete(settings, 'chores', c.id).catch(() => {}); } },
    ]);
  };

  const row = (c: Chore) => {
    const who = resolvePoster(c, persons, profiles);
    const { title: shown, meta } = splitChoreMeta(c.title);
    const overdue = !c.done && meta.due && meta.due < todayKey;
    return (
      <PressableScale key={c.id} style={s.row} onPress={() => void choreSet(settings, c.id, !c.done).catch(() => {})} onLongPress={() => onDelete(c)}>
        <Ionicons name={c.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={c.done ? colors.safe : colors.muted} />
        <View style={[s.catDot, { backgroundColor: colors.surfaceElevated }]}><Ionicons name={choreIcon(meta.cat)} size={13} color={colors.muted} /></View>
        <View style={s.rowMid}>
          <Text style={[s.title, c.done && s.titleDone]} numberOfLines={1}>{shown}</Text>
          {meta.note ? <Text style={s.note} numberOfLines={1}>{meta.note}</Text> : null}
        </View>
        {meta.due ? (
          <View style={[s.dueBadge, overdue && { backgroundColor: colors.danger + '22' }]}>
            <Ionicons name="calendar-outline" size={11} color={overdue ? colors.danger : colors.muted} />
            <Text style={[s.dueText, overdue && { color: colors.danger }]}>{dueLabel(parseDue(meta.due)!)}</Text>
          </View>
        ) : null}
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pickOuter} contentContainerStyle={s.pick}>
        {CHORE_CATS.map(c => {
          const sel = cat === c.key;
          return (
            <PressableScale key={c.key} style={[s.catChip, sel && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setCat(c.key)}>
              <Ionicons name={c.icon} size={13} color={sel ? colors.black : colors.muted} />
              <Text style={[s.catChipText, sel && { color: colors.black }]}>{catLabel(c.key)}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      <View style={s.detailBar}>
        <PressableScale style={[s.duePill, due && { borderColor: colors.primary, backgroundColor: colors.primary + '18' }]} onPress={() => setShowCal(true)}>
          <Ionicons name="calendar-outline" size={14} color={due ? colors.primary : colors.muted} />
          <Text style={[s.duePillText, due && { color: colors.primary }]}>{due ? dueLabel(due) : i18n.t('addDue')}</Text>
          {due ? <PressableScale onPress={() => setDue(null)} hitSlop={8}><Ionicons name="close" size={13} color={colors.primary} /></PressableScale> : null}
        </PressableScale>
        <TextInput style={s.noteInput} placeholder={i18n.t('notePlaceholder')} placeholderTextColor={colors.muted} value={note} onChangeText={setNote} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pickOuter} contentContainerStyle={s.pick}>
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

      <Modal visible={showCal} transparent animationType="fade" onRequestClose={() => setShowCal(false)}>
        <PressableScale style={s.backdrop} onPress={() => setShowCal(false)}>
          <View style={s.sheet} onStartShouldSetResponder={() => true}>
            <MonthPicker selected={due ?? new Date()} onPick={d => { setDue(d); setShowCal(false); }} />
          </View>
        </PressableScale>
      </Modal>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    addBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 10 },
    input: { flex: 1, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15 },
    addBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    pickOuter: { flexGrow: 0, flexShrink: 0 },
    pick: { gap: 8, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
    catChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    catChipText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
    detailBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 2, paddingBottom: 2, alignItems: 'center' },
    duePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    duePillText: { color: colors.muted, fontSize: 12.5, fontWeight: '600' },
    noteInput: { flex: 1, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8, color: colors.text, fontSize: 13.5 },
    who: { alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, width: 62 },
    whoAll: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    whoName: { color: colors.muted, fontSize: 11, fontWeight: '600' },
    list: { padding: 14, paddingTop: 4, gap: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 2 },
    catDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    rowMid: { flex: 1 },
    title: { color: colors.text, fontSize: 15 },
    titleDone: { color: colors.muted, textDecorationLine: 'line-through' },
    note: { color: colors.muted, fontSize: 12, marginTop: 1 },
    dueBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 9, backgroundColor: colors.surfaceElevated },
    dueText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
    sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 2, marginLeft: 2 },
    empty: { alignItems: 'center', gap: 10, paddingVertical: 48 },
    emptyText: { color: colors.muted, fontSize: 14 },
    backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', paddingHorizontal: 24 },
    sheet: { backgroundColor: colors.background, borderRadius: 18, padding: 12 },
  });
}
