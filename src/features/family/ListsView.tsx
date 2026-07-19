import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { addTodoItem, getTodoItems, removeTodoItem, setTodoItemStatus, type TodoItem } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';
import { CATEGORIES, categoryLabel, detectCategory, stripCategoryEmoji } from './categories';

type Props = { lists: HaEntity[]; settings: ConnectionSettings };
type Row = { kind: 'item'; item: TodoItem } | { kind: 'header'; count: number };

export function ListsView({ lists, settings }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [activeId, setActiveId] = useState(lists[0]?.entity_id);
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
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
    <>
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
            <View style={styles.topRow}>
              {lists.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                  {lists.map(l => (
                    <PressableScale key={l.entity_id} style={[styles.tab, active?.entity_id === l.entity_id && styles.tabActive]} onPress={() => setActiveId(l.entity_id)}>
                      <Text style={[styles.tabText, active?.entity_id === l.entity_id && styles.tabTextActive]}>{String(l.attributes.friendly_name ?? l.entity_id)}</Text>
                    </PressableScale>
                  ))}
                </ScrollView>
              ) : <View style={{ flex: 1 }} />}
              <PressableScale style={styles.addBtn} onPress={() => setShowAdd(true)}>
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
            <PressableScale
              style={[styles.noteCard, { backgroundColor: row.item.status === 'completed' ? colors.surfaceElevated : detectCategory(row.item.summary).color }]}
              onPress={() => void toggle(row.item)}
            >
              <View style={[styles.checkbox, row.item.status === 'completed' && styles.checkboxDone]}>
                {row.item.status === 'completed' ? <Ionicons name="checkmark" size={13} color={colors.black} /> : null}
              </View>
              <Text style={styles.noteEmoji}>{detectCategory(row.item.summary).emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.noteText, row.item.status === 'completed' && styles.itemTextDone]} numberOfLines={4}>{stripCategoryEmoji(row.item.summary)}</Text>
                {row.item.due ? <Text style={styles.noteDue}>{new Date(row.item.due).toLocaleDateString(i18n.locale, { day: 'numeric', month: 'short' })}</Text> : null}
              </View>
              <PressableScale onPress={() => void remove(row.item)} hitSlop={10}>
                <Ionicons name="close" size={18} color={row.item.status === 'completed' ? colors.muted : 'rgba(255,255,255,.85)'} />
              </PressableScale>
            </PressableScale>
          )
        }
      />

      <AddReminderModal
        visible={showAdd}
        settings={settings}
        listEntityId={active?.entity_id}
        onClose={() => setShowAdd(false)}
        onCreated={() => { setShowAdd(false); void load(); }}
      />
    </>
  );
}

// نافذة إضافة منفصلة (Popup) - عنوان + تاريخ + فئة، بدل حقل مضغوط جوه
// الشاشة نفسها. نفس شكل نافذة إضافة الحدث في التقويم بالظبط.
function AddReminderModal({
  visible, settings, listEntityId, onClose, onCreated,
}: { visible: boolean; settings: ConnectionSettings; listEntityId?: string; onClose: () => void; onCreated: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (!listEntityId || !title.trim()) return;
    setSaving(true);
    setError(undefined);
    try {
      await addTodoItem(settings, listEntityId, `${category.emoji} ${title.trim()}`, dueDate.trim() || undefined);
      setTitle('');
      setDueDate('');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{i18n.t('newReminder')}</Text>

          <TextInput value={title} onChangeText={setTitle} placeholder={i18n.t('reminderTitle')} placeholderTextColor={colors.muted} style={styles.modalInput} />

          <Text style={styles.muted}>{i18n.t('dueDateOptional')}</Text>
          <TextInput value={dueDate} onChangeText={setDueDate} placeholder="2026-07-25" placeholderTextColor={colors.muted} style={styles.modalInput} keyboardType="numbers-and-punctuation" />

          <Text style={styles.muted}>{i18n.t('category')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {CATEGORIES.map(c => (
              <PressableScale key={c.key} onPress={() => setCategory(c)} style={[styles.catChip, { borderColor: c.color }, category.key === c.key && { backgroundColor: c.color }]}>
                <Text style={styles.catChipEmoji}>{c.emoji}</Text>
                <Text style={[styles.catChipText, category.key === c.key && { color: '#fff' }]}>{categoryLabel(c.key)}</Text>
              </PressableScale>
            ))}
          </ScrollView>

          {error ? <Text style={styles.errorText} selectable>{error}</Text> : null}

          <View style={styles.modalActions}>
            <PressableScale style={styles.modalCancel} onPress={onClose}><Text style={styles.modalCancelText}>{i18n.t('cancel')}</Text></PressableScale>
            <PressableScale style={[styles.modalSave, (!title.trim() || saving) && styles.modalSaveDisabled]} disabled={!title.trim() || saving} onPress={() => void submit()}>
              <Text style={styles.modalSaveText}>{saving ? i18n.t('loading') : i18n.t('save')}</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Palette) { return StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 16 },
  listContent: { padding: 16, paddingBottom: 32 },
  muted: { color: colors.muted },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tabs: { gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  tabTextActive: { color: colors.black },
  addBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.danger, fontSize: 12 },
  noteCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginBottom: 8 },
  noteText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  noteDue: { color: 'rgba(255,255,255,.85)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  noteEmoji: { fontSize: 17 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,.7)', alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: colors.safe, borderColor: colors.safe },
  itemTextDone: { color: colors.muted, textDecorationLine: 'line-through' },
  doneLabel: { color: colors.muted, fontWeight: '800', fontSize: 12, marginTop: 10, marginBottom: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(4,8,14,.82)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 10 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  modalInput: { color: colors.text, backgroundColor: colors.surfaceElevated, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10 },
  catRow: { gap: 8, paddingVertical: 2 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1.5, backgroundColor: colors.surfaceElevated },
  catChipEmoji: { fontSize: 15 },
  catChipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalCancel: { flex: 1, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelText: { color: colors.muted, fontWeight: '800' },
  modalSave: { flex: 1, padding: 13, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center' },
  modalSaveDisabled: { opacity: 0.5 },
  modalSaveText: { color: colors.black, fontWeight: '900' },
}); }
