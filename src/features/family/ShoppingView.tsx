import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { addTodoItem, getTodoItems, removeTodoItem, setTodoItemStatus, type TodoItem } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';
import { joinShop, parseShop, SHOP_CATS, type ShopCat } from './shopping';

type Props = { lists: HaEntity[]; settings: ConnectionSettings; canManage?: boolean };

const catLabel = (c: string) => i18n.t('cat_' + c) || i18n.t('cat_other');

export function ShoppingView({ lists, settings, canManage = true }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const list = lists[0];
  const listState = lists.find(l => l.entity_id === list?.entity_id)?.state; // بيتغيّر مع إضافة/شطب → يعيد التحميل

  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [cat, setCat] = useState<ShopCat>('other');
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!list) { setItems([]); setLoading(false); return Promise.resolve(); }
    setLoading(true);
    return getTodoItems(settings, list.entity_id).then(its => { setItems(its); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [list?.entity_id, listState, settings.baseUrl, settings.token]);

  const add = async () => {
    const n = name.trim();
    if (!n || !list || busy) return;
    setBusy(true);
    try {
      await addTodoItem(settings, list.entity_id, n, undefined, joinShop({ qty: qty.trim() || undefined, unit: unit.trim() || undefined, cat }));
      setName(''); setQty(''); setUnit('');
      await load();
    } finally { setBusy(false); }
  };

  const toggle = (it: TodoItem) => {
    if (!list) return;
    void setTodoItemStatus(settings, list.entity_id, it.uid, it.status === 'completed' ? 'needs_action' : 'completed').then(load).catch(() => {});
  };
  const onDelete = (it: TodoItem) => {
    if (!canManage || !list) return;
    Alert.alert(it.summary, '', [
      { text: i18n.t('cancel'), style: 'cancel' },
      { text: i18n.t('delete'), style: 'destructive', onPress: () => { void removeTodoItem(settings, list.entity_id, it.uid).then(load).catch(() => {}); } },
    ]);
  };

  const toBuy = items.filter(i => i.status !== 'completed');
  const bought = items.filter(i => i.status === 'completed');
  // تجميع «للشراء» بالأقسام، بترتيب الأقسام المعرّف.
  const groups = SHOP_CATS.map(c => ({ cat: c, items: toBuy.filter(i => (parseShop(i.description).cat ?? 'other') === c) })).filter(g => g.items.length);

  const row = (it: TodoItem) => {
    const m = parseShop(it.description);
    const done = it.status === 'completed';
    return (
      <PressableScale key={it.uid} style={s.row} onPress={() => toggle(it)} onLongPress={() => onDelete(it)}>
        <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={done ? colors.safe : colors.muted} />
        <Text style={[s.name, done && s.nameDone]} numberOfLines={1}>{it.summary}</Text>
        {m.qty ? <Text style={s.qtyBadge}>{m.qty}{m.unit ? ` ${m.unit}` : ''}</Text> : null}
      </PressableScale>
    );
  };

  if (!list) {
    return <View style={s.center}><Ionicons name="cart-outline" size={44} color={colors.muted} /><Text style={s.empty}>{i18n.t('noShoppingList')}</Text></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={s.addBar}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder={i18n.t('addItemPlaceholder')} placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
        <TextInput style={[s.input, s.small]} placeholder={i18n.t('quantity')} placeholderTextColor={colors.muted} value={qty} onChangeText={setQty} keyboardType="numbers-and-punctuation" />
        <TextInput style={[s.input, s.small]} placeholder={i18n.t('unit')} placeholderTextColor={colors.muted} value={unit} onChangeText={setUnit} />
        <PressableScale onPress={add} disabled={!name.trim() || busy} style={[s.addBtn, { opacity: name.trim() && !busy ? 1 : 0.4 }]}><Ionicons name="add" size={22} color="#fff" /></PressableScale>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cats}>
        {SHOP_CATS.map(c => {
          const sel = cat === c;
          return (
            <PressableScale key={c} style={[s.catChip, sel && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setCat(c)}>
              <Text style={[s.catChipText, sel && { color: colors.black }]}>{catLabel(c)}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={s.list}>
        {loading ? null : toBuy.length === 0 && bought.length === 0 ? (
          <View style={s.center}><Ionicons name="cart-outline" size={40} color={colors.muted} /><Text style={s.empty}>{i18n.t('shoppingEmpty')}</Text></View>
        ) : null}
        {groups.map(g => (
          <View key={g.cat} style={{ marginBottom: 6 }}>
            <Text style={s.catHead}>{catLabel(g.cat)}</Text>
            <View style={s.card}>{g.items.map(row)}</View>
          </View>
        ))}
        {bought.length > 0 ? (
          <>
            <Text style={s.catHead}>{i18n.t('purchased')} ({bought.length})</Text>
            <View style={s.card}>{bought.map(row)}</View>
          </>
        ) : null}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
    empty: { color: colors.muted, fontSize: 14, textAlign: 'center' },
    addBar: { flexDirection: 'row', gap: 7, paddingHorizontal: 14, paddingTop: 10, alignItems: 'center' },
    input: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9, color: colors.text, fontSize: 14 },
    small: { width: 58, textAlign: 'center', paddingHorizontal: 4 },
    addBtn: { width: 40, height: 40, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    cats: { gap: 7, paddingHorizontal: 14, paddingVertical: 10 },
    catChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    catChipText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
    list: { paddingHorizontal: 14, paddingTop: 2 },
    catHead: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 4, marginLeft: 2 },
    card: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    name: { flex: 1, color: colors.text, fontSize: 15 },
    nameDone: { color: colors.muted, textDecorationLine: 'line-through' },
    qtyBadge: { color: colors.primary, fontSize: 12.5, fontWeight: '700' },
  });
}
