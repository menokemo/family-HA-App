import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { findCalendarEntities, findTodoEntities } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { AgendaView } from './AgendaView';
import { FamilyDashboard } from './FamilyDashboard';
import { MealsView } from './MealsView';
import { WallView } from './WallView';
import { ChoresView } from './ChoresView';
import { ShoppingView } from './ShoppingView';
import { PressableScale } from '../../components/PressableScale';
import { Card } from '../../components/Card';
import { findMealieCalendars } from './mealie';

type Props = { states: HaEntity[]; settings: ConnectionSettings; onSettingsChange: (patch: Partial<ConnectionSettings>) => void };
// ٤ وجهات بس: الرئيسية / التقويم / المهام / المطبخ. (التواصل = ملاحظات سريعة من الهيدر.)
type Section = 'home' | 'calendar' | 'tasks' | 'kitchen';

export function FamilyTab({ states, settings, onSettingsChange }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<Section>('home');
  const [showCalendarSettings, setShowCalendarSettings] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const allCalendars = findCalendarEntities(states);
  const filteredCalendars = settings.selectedCalendarIds?.length ? allCalendars.filter(c => settings.selectedCalendarIds!.includes(c.entity_id)) : allCalendars;
  // لو الاختيار المحفوظ بقى IDs قديمة مش موجودة، نرجع نعرض الكل بدل شاشة فاضية.
  const calendarsAll = filteredCalendars.length > 0 || allCalendars.length === 0 ? filteredCalendars : allCalendars;
  // تقاويم الأكل (المحلي + Mealie) ليها شاشة الأكل، فبتتفصل عن تقاويم الأجندة.
  const mealsCalendar = allCalendars.find(c => c.entity_id.includes('secure_family_meals'));
  const mealieCalIds = new Set(findMealieCalendars(states).map(c => c.entity.entity_id));
  const hasMeals = !!mealsCalendar || mealieCalIds.size > 0;
  const calendars = calendarsAll.filter(c => !c.entity_id.includes('secure_family_meals') && !mealieCalIds.has(c.entity_id));
  const allLists = findTodoEntities(states);
  const filteredLists = settings.selectedTodoIds?.length ? allLists.filter(l => settings.selectedTodoIds!.includes(l.entity_id)) : allLists;
  const lists = filteredLists.length > 0 || allLists.length === 0 ? filteredLists : allLists;

  const TABS: { key: Section; label: string; icon: string }[] = [
    { key: 'home', label: i18n.t('home'), icon: 'home' },
    { key: 'calendar', label: i18n.t('calendar'), icon: 'calendar' },
    { key: 'tasks', label: i18n.t('chores'), icon: 'checkbox' },
    { key: 'kitchen', label: i18n.t('kitchen'), icon: 'restaurant' },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={s.header}>
        <Text style={s.title}>{i18n.t('family')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PressableScale onPress={() => setShowNotes(true)} style={s.settingsBtn}>
            <Ionicons name="reader-outline" size={20} color={colors.text} />
          </PressableScale>
          {tab === 'calendar' ? (
            <PressableScale onPress={() => setShowCalendarSettings(true)} style={s.settingsBtn}>
              <Ionicons name="options-outline" size={20} color={colors.text} />
            </PressableScale>
          ) : null}
        </View>
      </View>

      <View style={s.tabBar}>
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <PressableScale key={t.key} style={[s.tab, on && s.tabOn]} onPress={() => setTab(t.key)}>
              <Ionicons name={on ? t.icon : (t.icon + '-outline')} size={16} color={on ? colors.black : colors.muted} />
              <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>{t.label}</Text>
            </PressableScale>
          );
        })}
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'home' ? (
          <FamilyDashboard calendars={calendars} states={states} settings={settings} onOpenSection={setTab} onOpenNotes={() => setShowNotes(true)} />
        ) : tab === 'calendar' ? (
          <AgendaView calendars={calendars} states={states} settings={settings} />
        ) : tab === 'tasks' ? (
          <ChoresView states={states} settings={settings} />
        ) : (
          <KitchenView states={states} lists={lists} settings={settings} mealsCalendar={mealsCalendar} hasMeals={hasMeals} />
        )}
      </View>

      <Modal visible={showNotes} animationType="slide" onRequestClose={() => setShowNotes(false)}>
        <View style={s.sheetModal}>
          <View style={s.sheetModalHeader}>
            <Text style={s.sheetModalTitle}>{i18n.t('quickNotes')}</Text>
            <PressableScale onPress={() => setShowNotes(false)}><Ionicons name="close" size={24} color={colors.text} /></PressableScale>
          </View>
          <WallView calendars={calendars} states={states} settings={settings} />
        </View>
      </Modal>

      <EntityPickerModal
        visible={showCalendarSettings}
        title={i18n.t('calendarSettings')}
        hint={i18n.t('calendarSettingsHint')}
        entities={allCalendars.filter(c => !c.entity_id.includes('secure_family_meals'))}
        selectedIds={settings.selectedCalendarIds?.length ? settings.selectedCalendarIds : allCalendars.map(c => c.entity_id)}
        onClose={() => setShowCalendarSettings(false)}
        onSave={ids => { onSettingsChange({ selectedCalendarIds: ids }); setShowCalendarSettings(false); }}
      />
    </View>
  );
}

// المطبخ: الأكل + التسوّق في مكان واحد (لإنهم مترابطين). لو مفيش أكل → تسوّق مباشرة.
function KitchenView({ states, lists, settings, mealsCalendar, hasMeals }: {
  states: HaEntity[]; lists: HaEntity[]; settings: ConnectionSettings; mealsCalendar?: HaEntity; hasMeals: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [sub, setSub] = useState<'meals' | 'shopping'>(hasMeals ? 'meals' : 'shopping');

  if (!hasMeals) return <ShoppingView lists={lists} settings={settings} />;

  return (
    <View style={{ flex: 1 }}>
      <View style={s.seg}>
        {(['meals', 'shopping'] as const).map(k => {
          const on = sub === k;
          return (
            <PressableScale key={k} style={[s.segBtn, on && s.segBtnOn]} onPress={() => setSub(k)}>
              <Ionicons name={k === 'meals' ? 'restaurant-outline' : 'cart-outline'} size={15} color={on ? colors.black : colors.muted} />
              <Text style={[s.segText, on && s.segTextOn]}>{i18n.t(k === 'meals' ? 'meals' : 'shopping')}</Text>
            </PressableScale>
          );
        })}
      </View>
      <View style={{ flex: 1 }}>
        {sub === 'meals' ? (
          <MealsView states={states} lists={lists} settings={settings} localCalendar={mealsCalendar} />
        ) : (
          <ShoppingView lists={lists} settings={settings} />
        )}
      </View>
    </View>
  );
}

// نافذة اختيار التقاويم اللي تظهر في التبويب.
function EntityPickerModal({
  visible, title, hint, entities, selectedIds, onClose, onSave,
}: {
  visible: boolean; title: string; hint: string; entities: HaEntity[]; selectedIds: string[];
  onClose: () => void; onSave: (ids: string[]) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [local, setLocal] = useState(selectedIds);
  useEffect(() => { if (visible) setLocal(selectedIds); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalSheet}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{title}</Text>
            <PressableScale onPress={onClose}><Ionicons name="close" size={22} color={colors.text} /></PressableScale>
          </View>
          <ScrollView>
            <Card>
              <Text style={s.hintText}>{hint}</Text>
              {entities.length === 0 ? (
                <Text style={s.hintText}>{i18n.t('noCalendars')}</Text>
              ) : entities.map(e => (
                <View key={e.entity_id} style={s.toggleRow}>
                  <Text style={s.toggleLabel} numberOfLines={1}>{String(e.attributes.friendly_name ?? e.entity_id)}</Text>
                  <Switch
                    value={local.includes(e.entity_id)}
                    onValueChange={v => setLocal(prev => v ? [...new Set([...prev, e.entity_id])] : prev.filter(x => x !== e.entity_id))}
                    trackColor={{ true: colors.primary, false: colors.border }}
                  />
                </View>
              ))}
            </Card>
          </ScrollView>
          <PressableScale style={s.saveBtn} onPress={() => onSave(local)}>
            <Text style={s.saveBtnText}>{i18n.t('save')}</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Palette) { return StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  settingsBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  tabTextOn: { color: colors.black },
  seg: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2 },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  segTextOn: { color: colors.black },
  sheetModal: { flex: 1, backgroundColor: colors.background },
  sheetModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  sheetModalTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(4,8,14,.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '80%', gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  hintText: { color: colors.muted, fontSize: 13 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  toggleLabel: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1, marginRight: 10 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 14, alignItems: 'center' },
  saveBtnText: { color: colors.black, fontWeight: '900', fontSize: 15 },
}); }
