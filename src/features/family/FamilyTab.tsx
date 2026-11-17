import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { findCalendarEntities, findTodoEntities } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { AgendaView } from './AgendaView';
import { ListsView } from './ListsView';
import { MealsView } from './MealsView';
import { readProfiles } from './profiles';
import { PressableScale } from '../../components/PressableScale';
import { Card } from '../../components/Card';

type Props = { states: HaEntity[]; settings: ConnectionSettings; onSettingsChange: (patch: Partial<ConnectionSettings>) => void };
type Tab = 'agenda' | 'tasks' | 'meals';

export function FamilyTab({ states, settings, onSettingsChange }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<Tab>('agenda');
  const [showCalendarSettings, setShowCalendarSettings] = useState(false);
  const [showListSettings, setShowListSettings] = useState(false);

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
  const persons = states.filter(e => e.entity_id.startsWith('person.'));
  const profiles = readProfiles(states);

  // لو تبويب الأكل مش متاح (المكوّن القديم) ما نسيبش المستخدم واقف عليه.
  useEffect(() => { if (tab === 'meals' && !mealsCalendar) setTab('agenda'); }, [tab, mealsCalendar]);

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'agenda', label: i18n.t('agenda'), icon: 'calendar' },
    { key: 'tasks', label: i18n.t('lists'), icon: 'checkbox' },
    ...(mealsCalendar ? [{ key: 'meals' as Tab, label: i18n.t('meals'), icon: 'restaurant' }] : []),
  ];

  const openSettings = () => { if (tab === 'agenda') setShowCalendarSettings(true); else setShowListSettings(true); };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.header}>
        <Text style={s.title}>{i18n.t('family')}</Text>
        <PressableScale onPress={openSettings} style={s.settingsBtn}>
          <Ionicons name="options-outline" size={20} color={colors.text} />
        </PressableScale>
      </View>

      <View style={s.tabBar}>
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <PressableScale key={t.key} style={[s.tab, on && s.tabOn]} onPress={() => setTab(t.key)}>
              <Ionicons name={on ? t.icon : (t.icon + '-outline')} size={16} color={on ? colors.black : colors.muted} />
              <Text style={[s.tabText, on && s.tabTextOn]}>{t.label}</Text>
            </PressableScale>
          );
        })}
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'agenda' ? (
          <AgendaView calendars={calendars} states={states} settings={settings} />
        ) : tab === 'tasks' ? (
          <ListsView lists={lists} settings={settings} persons={persons} profiles={profiles} myName={persons.find(p => p.entity_id === settings.selectedPersonId)?.attributes.friendly_name as string | undefined} />
        ) : mealsCalendar ? (
          <MealsView mealsCalendar={mealsCalendar} lists={lists} settings={settings} />
        ) : null}
      </View>

      <EntityPickerModal
        visible={showCalendarSettings}
        title={i18n.t('calendarSettings')}
        hint={i18n.t('calendarSettingsHint')}
        entities={allCalendars.filter(c => !c.entity_id.includes('secure_family_meals'))}
        selectedIds={settings.selectedCalendarIds?.length ? settings.selectedCalendarIds : allCalendars.map(c => c.entity_id)}
        onClose={() => setShowCalendarSettings(false)}
        onSave={ids => { onSettingsChange({ selectedCalendarIds: ids }); setShowCalendarSettings(false); }}
      />
      <EntityPickerModal
        visible={showListSettings}
        title={i18n.t('listSettings')}
        hint={i18n.t('listSettingsHint')}
        entities={allLists}
        selectedIds={settings.selectedTodoIds?.length ? settings.selectedTodoIds : allLists.map(l => l.entity_id)}
        onClose={() => setShowListSettings(false)}
        onSave={ids => { onSettingsChange({ selectedTodoIds: ids }); setShowListSettings(false); }}
      />
    </View>
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
  tabBar: { flexDirection: 'row', gap: 7, paddingHorizontal: 14, paddingBottom: 8 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  tabTextOn: { color: colors.black },
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
