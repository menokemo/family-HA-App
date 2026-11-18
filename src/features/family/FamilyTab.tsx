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
import { ChatView } from './ChatView';
import { ChoresView } from './ChoresView';
import { ShoppingView } from './ShoppingView';
import { MembersView } from './MembersView';
import { PressableScale } from '../../components/PressableScale';
import { Card } from '../../components/Card';
import { canManage, myRole } from './roles';

type Props = { states: HaEntity[]; settings: ConnectionSettings; onSettingsChange: (patch: Partial<ConnectionSettings>) => void };
type Section = 'home' | 'calendar' | 'tasks' | 'shopping' | 'more';
type Module = 'meals' | 'wall' | 'members' | 'budget' | 'notes' | 'routines' | 'documents';

function moduleTitle(m: Module): string {
  const map: Record<Module, string> = {
    meals: 'meals', wall: 'wall', members: 'members', budget: 'budget',
    notes: 'notes', routines: 'routines', documents: 'documents',
  };
  return i18n.t(map[m]);
}

export function FamilyTab({ states, settings, onSettingsChange }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<Section>('home');
  const [showCalendarSettings, setShowCalendarSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [moduleOpen, setModuleOpen] = useState<Module | null>(null);

  const allCalendars = findCalendarEntities(states);
  const filteredCalendars = settings.selectedCalendarIds?.length ? allCalendars.filter(c => settings.selectedCalendarIds!.includes(c.entity_id)) : allCalendars;
  // لو الاختيار المحفوظ بقى IDs قديمة مش موجودة، نرجع نعرض الكل بدل شاشة فاضية.
  const calendarsAll = filteredCalendars.length > 0 || allCalendars.length === 0 ? filteredCalendars : allCalendars;
  // تقويم الأكل ليه شاشته، فبيتفصل عن تقاويم الأجندة.
  const mealsCalendar = allCalendars.find(c => c.entity_id.includes('secure_family_meals'));
  const calendars = calendarsAll.filter(c => !c.entity_id.includes('secure_family_meals'));
  const allLists = findTodoEntities(states);
  const filteredLists = settings.selectedTodoIds?.length ? allLists.filter(l => settings.selectedTodoIds!.includes(l.entity_id)) : allLists;
  const lists = filteredLists.length > 0 || allLists.length === 0 ? filteredLists : allLists;
  const manage = canManage(myRole(states, settings)); // الطفل مايحذفش

  const TABS: { key: Section; label: string; icon: string }[] = [
    { key: 'home', label: i18n.t('home'), icon: 'home' },
    { key: 'calendar', label: i18n.t('calendar'), icon: 'calendar' },
    { key: 'tasks', label: i18n.t('chores'), icon: 'checkbox' },
    { key: 'shopping', label: i18n.t('shopping'), icon: 'cart' },
    { key: 'more', label: i18n.t('more'), icon: 'ellipsis-horizontal' },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={s.header}>
        <Text style={s.title}>{i18n.t('family')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PressableScale onPress={() => setShowChat(true)} style={s.settingsBtn}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.text} />
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
          <FamilyDashboard calendars={calendars} states={states} settings={settings} onOpenSection={setTab} />
        ) : tab === 'calendar' ? (
          <AgendaView calendars={calendars} states={states} settings={settings} canManage={manage} />
        ) : tab === 'tasks' ? (
          <ChoresView states={states} settings={settings} canManage={manage} />
        ) : tab === 'shopping' ? (
          <ShoppingView lists={lists} settings={settings} canManage={manage} />
        ) : (
          <MoreMenu hasMeals={!!mealsCalendar} onOpen={setModuleOpen} />
        )}
      </View>

      <Modal visible={moduleOpen !== null} animationType="slide" onRequestClose={() => setModuleOpen(null)}>
        <View style={s.chatModal}>
          <View style={s.chatHeader}>
            <Text style={s.chatTitle}>{moduleOpen ? moduleTitle(moduleOpen) : ''}</Text>
            <PressableScale onPress={() => setModuleOpen(null)}><Ionicons name="close" size={24} color={colors.text} /></PressableScale>
          </View>
          <View style={{ flex: 1 }}>
            {moduleOpen === 'meals' && mealsCalendar ? (
              <MealsView mealsCalendar={mealsCalendar} lists={lists} settings={settings} />
            ) : moduleOpen === 'wall' ? (
              <WallView calendars={calendars} states={states} settings={settings} canManage={manage} />
            ) : moduleOpen === 'members' ? (
              <MembersView states={states} settings={settings} />
            ) : moduleOpen ? (
              <ComingSoon icon="construct-outline" label={moduleTitle(moduleOpen)} />
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={showChat} animationType="slide" onRequestClose={() => setShowChat(false)}>
        <View style={s.chatModal}>
          <View style={s.chatHeader}>
            <Text style={s.chatTitle}>{i18n.t('chat')}</Text>
            <PressableScale onPress={() => setShowChat(false)}><Ionicons name="close" size={24} color={colors.text} /></PressableScale>
          </View>
          <ChatView states={states} settings={settings} />
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

// شاشة «قريبًا» لموديول لسه ماتعملش (مرحلة جاية).
function ComingSoon({ icon, label }: { icon: string; label: string }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.comingWrap}>
      <Ionicons name={icon} size={46} color={colors.muted} />
      <Text style={s.comingTitle}>{label}</Text>
      <Text style={s.comingText}>{i18n.t('comingSoon')}</Text>
    </View>
  );
}

// قسم «المزيد»: باقي موديولات المنظّم. الجاهز بيفتح، والباقي «قريبًا».
function MoreMenu({ hasMeals, onOpen }: { hasMeals: boolean; onOpen: (m: Module) => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const items: { key: Module; icon: string; label: string; soon: boolean }[] = [];
  if (hasMeals) items.push({ key: 'meals', icon: 'restaurant-outline', label: i18n.t('meals'), soon: false });
  items.push(
    { key: 'wall', icon: 'newspaper-outline', label: i18n.t('wall'), soon: false },
    { key: 'members', icon: 'people-outline', label: i18n.t('members'), soon: false },
    { key: 'budget', icon: 'wallet-outline', label: i18n.t('budget'), soon: true },
    { key: 'notes', icon: 'document-text-outline', label: i18n.t('notes'), soon: true },
    { key: 'routines', icon: 'repeat-outline', label: i18n.t('routines'), soon: true },
    { key: 'documents', icon: 'folder-outline', label: i18n.t('documents'), soon: true },
  );
  return (
    <ScrollView contentContainerStyle={s.moreList}>
      {items.map(it => (
        <PressableScale key={it.key} style={s.moreRow} onPress={() => onOpen(it.key)}>
          <View style={[s.moreIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name={it.icon} size={20} color={colors.primary} /></View>
          <Text style={s.moreLabel}>{it.label}</Text>
          {it.soon ? <Text style={s.soonBadge}>{i18n.t('comingSoon')}</Text> : <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
        </PressableScale>
      ))}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// نافذة اختيار التقاويم/القوائم اللي تظهر في التبويب.
function EntityPickerModal({
  visible, title, hint, entities, selectedIds, onClose, onSave,
}: {
  visible: boolean; title: string; hint: string; entities: HaEntity[]; selectedIds: string[];
  onClose: () => void; onSave: (ids: string[]) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [local, setLocal] = useState(selectedIds);
  useEffect(() => { if (visible) setLocal(selectedIds); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [visible]);

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
  tabBar: { flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingBottom: 8 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  tabTextOn: { color: colors.black },
  comingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 30 },
  comingTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  comingText: { color: colors.muted, fontSize: 14 },
  moreList: { padding: 14, gap: 8 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 14, padding: 12 },
  moreIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  moreLabel: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  soonBadge: { fontSize: 11, color: colors.muted, backgroundColor: colors.surfaceElevated, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  chatModal: { flex: 1, backgroundColor: colors.background },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  chatTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
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
