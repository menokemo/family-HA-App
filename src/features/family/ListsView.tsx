import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Card } from '../../components/Card';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { addTodoItem, getTodoItems, removeTodoItem, setTodoItemStatus, type TodoItem } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';

type Props = { lists: HaEntity[]; settings: ConnectionSettings };

export function ListsView({ lists, settings }: Props) {
  const [activeId, setActiveId] = useState(lists[0]?.entity_id);
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');

  const active = lists.find(l => l.entity_id === activeId) ?? lists[0];

  const load = async () => {
    if (!active) return;
    setLoading(true);
    try {
      setItems(await getTodoItems(settings, active.entity_id));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load().catch(() => setItems([])); }, [active?.entity_id, settings.baseUrl, settings.token]);

  if (!lists.length) return <Card><Text style={styles.muted}>{i18n.t('noLists')}</Text></Card>;

  const toggle = async (item: TodoItem) => {
    setItems(cur => cur.map(x => (x.uid === item.uid ? { ...x, status: x.status === 'completed' ? 'needs_action' : 'completed' } : x)));
    try {
      await setTodoItemStatus(settings, active.entity_id, item.uid, item.status === 'completed' ? 'needs_action' : 'completed');
    } catch {
      void load();
    }
  };

  const remove = async (item: TodoItem) => {
    setItems(cur => cur.filter(x => x.uid !== item.uid));
    try {
      await removeTodoItem(settings, active.entity_id, item.uid);
    } catch {
      void load();
    }
  };

  const add = async () => {
    const summary = draft.trim();
    if (!summary || !active) return;
    setDraft('');
    try {
      await addTodoItem(settings, active.entity_id, summary);
      void load();
    } catch {
      void load();
    }
  };

  const pending = items.filter(x => x.status !== 'completed');
  const done = items.filter(x => x.status === 'completed');

  return (
    <View style={{ gap: 12 }}>
      {lists.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {lists.map(l => (
            <Pressable key={l.entity_id} style={[styles.tab, active?.entity_id === l.entity_id && styles.tabActive]} onPress={() => setActiveId(l.entity_id)}>
              <Text style={[styles.tabText, active?.entity_id === l.entity_id && styles.tabTextActive]}>{String(l.attributes.friendly_name ?? l.entity_id)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <Card>
        <View style={styles.addRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={i18n.t('addItem')}
            placeholderTextColor={colors.muted}
            style={styles.input}
            onSubmitEditing={() => void add()}
            returnKeyType="done"
          />
          <Pressable style={styles.addBtn} onPress={() => void add()}>
            <Ionicons name="add" size={22} color={colors.black} />
          </Pressable>
        </View>

        {loading ? <Text style={styles.muted}>{i18n.t('loading')}</Text> : null}

        {pending.map(item => (
          <Pressable key={item.uid} style={styles.itemRow} onPress={() => void toggle(item)}>
            <View style={styles.checkbox} />
            <Text style={styles.itemText}>{item.summary}</Text>
            <Pressable onPress={() => void remove(item)} hitSlop={10}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </Pressable>
        ))}

        {!loading && !pending.length && !done.length ? <Text style={styles.muted}>{i18n.t('emptyList')}</Text> : null}

        {done.length ? (
          <>
            <Text style={styles.doneLabel}>{i18n.t('completed')} · {done.length}</Text>
            {done.map(item => (
              <Pressable key={item.uid} style={styles.itemRow} onPress={() => void toggle(item)}>
                <View style={[styles.checkbox, styles.checkboxDone]}><Ionicons name="checkmark" size={13} color={colors.black} /></View>
                <Text style={[styles.itemText, styles.itemTextDone]}>{item.summary}</Text>
                <Pressable onPress={() => void remove(item)} hitSlop={10}>
                  <Ionicons name="close" size={18} color={colors.muted} />
                </Pressable>
              </Pressable>
            ))}
          </>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted },
  tabs: { gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  tabTextActive: { color: colors.black },
  addRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  input: { flex: 1, color: colors.text, backgroundColor: colors.surfaceElevated, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 },
  addBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: colors.safe, borderColor: colors.safe },
  itemText: { flex: 1, color: colors.text, fontSize: 15 },
  itemTextDone: { color: colors.muted, textDecorationLine: 'line-through' },
  doneLabel: { color: colors.muted, fontWeight: '800', fontSize: 12, marginTop: 10, marginBottom: 4 },
});
