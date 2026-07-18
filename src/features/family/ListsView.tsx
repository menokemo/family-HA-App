import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { addTodoItem, getTodoItems, removeTodoItem, setTodoItemStatus, type TodoItem } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';

type Props = { lists: HaEntity[]; settings: ConnectionSettings };
type Row = { kind: 'item'; item: TodoItem } | { kind: 'header'; count: number };

export function ListsView({ lists, settings }: Props) {
  const [activeId, setActiveId] = useState(lists[0]?.entity_id);
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const fetchingRef = useRef(false);

  const active = lists.find(l => l.entity_id === activeId) ?? lists[0];

  const load = async () => {
    if (!active || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      setItems(await getTodoItems(settings, active.entity_id));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  useEffect(() => { load().catch(() => setItems([])); }, [active?.entity_id, settings.baseUrl, settings.token]);

  const toggle = async (item: TodoItem) => {
    if (!active) return;
    setItems(cur => cur.map(x => (x.uid === item.uid ? { ...x, status: x.status === 'completed' ? 'needs_action' : 'completed' } : x)));
    try {
      await setTodoItemStatus(settings, active.entity_id, item.uid, item.status === 'completed' ? 'needs_action' : 'completed');
    } catch {
      void load();
    }
  };

  const remove = async (item: TodoItem) => {
    if (!active) return;
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

  const pending = useMemo(() => items.filter(x => x.status !== 'completed'), [items]);
  const done = useMemo(() => items.filter(x => x.status === 'completed'), [items]);

  // قائمة واحدة مدمجة (Row[]) تتغذّى لـ FlatList — أهم جزء في الحل:
  // FlatList بيرسم بس العناصر الظاهرة فعليًا على الشاشة، مهما كان
  // عدد العناصر الكلي كبير (آلاف العناصر)، عكس map() العادي اللي كان
  // بيرسم الكل مرة واحدة ويجمّد الواجهة.
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = pending.map(item => ({ kind: 'item', item }));
    if (done.length) {
      list.push({ kind: 'header', count: done.length });
      for (const item of done) list.push({ kind: 'item', item });
    }
    return list;
  }, [pending, done]);

  if (!lists.length) return <View style={styles.card}><Text style={styles.muted}>{i18n.t('noLists')}</Text></View>;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={styles.listContent}
      data={rows}
      keyExtractor={(row, i) => (row.kind === 'header' ? `header-${i}` : row.item.uid)}
      initialNumToRender={20}
      maxToRenderPerBatch={20}
      windowSize={7}
      removeClippedSubviews
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          {lists.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {lists.map(l => (
                <PressableScale key={l.entity_id} style={[styles.tab, active?.entity_id === l.entity_id && styles.tabActive]} onPress={() => setActiveId(l.entity_id)}>
                  <Text style={[styles.tabText, active?.entity_id === l.entity_id && styles.tabTextActive]}>{String(l.attributes.friendly_name ?? l.entity_id)}</Text>
                </PressableScale>
              ))}
            </ScrollView>
          ) : null}
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
            <PressableScale style={styles.addBtn} onPress={() => void add()}>
              <Ionicons name="add" size={22} color={colors.black} />
            </PressableScale>
          </View>
          {loading ? <Text style={styles.muted}>{i18n.t('loading')}</Text> : null}
          {!loading && !rows.length ? <Text style={styles.muted}>{i18n.t('emptyList')}</Text> : null}
        </View>
      }
      renderItem={({ item: row }) =>
        row.kind === 'header' ? (
          <Text style={styles.doneLabel}>{i18n.t('completed')} · {row.count}</Text>
        ) : (
          <PressableScale style={styles.itemRow} onPress={() => void toggle(row.item)}>
            <View style={[styles.checkbox, row.item.status === 'completed' && styles.checkboxDone]}>
              {row.item.status === 'completed' ? <Ionicons name="checkmark" size={13} color={colors.black} /> : null}
            </View>
            <Text style={[styles.itemText, row.item.status === 'completed' && styles.itemTextDone]}>{row.item.summary}</Text>
            <PressableScale onPress={() => void remove(row.item)} hitSlop={10}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </PressableScale>
          </PressableScale>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 16 },
  listContent: { padding: 16, paddingBottom: 32 },
  muted: { color: colors.muted },
  tabs: { gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  tabTextActive: { color: colors.black },
  addRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, color: colors.text, backgroundColor: colors.surfaceElevated, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 },
  addBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: colors.safe, borderColor: colors.safe },
  itemText: { flex: 1, color: colors.text, fontSize: 15 },
  itemTextDone: { color: colors.muted, textDecorationLine: 'line-through' },
  doneLabel: { color: colors.muted, fontWeight: '800', fontSize: 12, marginTop: 10, marginBottom: 4 },
});
