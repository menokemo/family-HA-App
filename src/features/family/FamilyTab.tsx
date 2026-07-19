import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { findCalendarEntities, findTodoEntities, getCalendarEvents, getTodoItems } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { CalendarView } from './CalendarView';
import { ListsView } from './ListsView';
import { PressableScale } from '../../components/PressableScale';
import { Card } from '../../components/Card';

type Props = { states: HaEntity[]; settings: ConnectionSettings; onSettingsChange: (patch: Partial<ConnectionSettings>) => void };
type Screen = 'hub' | 'calendar' | 'lists';

export function FamilyTab({ states, settings, onSettingsChange }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [screen, setScreen] = useState<Screen>('hub');
  const [showCalendarSettings, setShowCalendarSettings] = useState(false);
  const [showListSettings, setShowListSettings] = useState(false);
  const allCalendars = findCalendarEntities(states);
  const filteredCalendars = settings.selectedCalendarIds?.length ? allCalendars.filter(c => settings.selectedCalendarIds!.includes(c.entity_id)) : allCalendars;
  // لو الاختيار المحفوظ بقى مش متطابق مع أي تقويم حالي (IDs قديمة من
  // تجربة سابقة مثلًا)، الفلترة هترجع فاضية رغم وجود تقاويم فعليًا -
  // نرجع نعرض الكل بدل ما تفضل الشاشة فاضية بشكل مربك للمستخدم.
  const calendars = filteredCalendars.length > 0 || allCalendars.length === 0 ? filteredCalendars : allCalendars;
  const allLists = findTodoEntities(states);
  const filteredLists = settings.selectedTodoIds?.length ? allLists.filter(l => settings.selectedTodoIds!.includes(l.entity_id)) : allLists;
  const lists = filteredLists.length > 0 || allLists.length === 0 ? filteredLists : allLists;
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const calendarKey = calendars.map(c => c.entity_id).sort().join('|');
  const listKey = lists.map(l => l.entity_id).sort().join('|');

  useEffect(() => {
    if (screen !== 'hub') return;
    let on = true;
    if (!calendars.length) { setEventCount(0); return; }
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 7);
    void Promise.all(calendars.map(c => getCalendarEvents(settings, c.entity_id, start.toISOString(), end.toISOString()).catch(() => [])))
      .then(lists2 => { if (on) setEventCount(lists2.flat().length); });
    return () => { on = false; };
  }, [screen, calendarKey, settings.baseUrl, settings.token]);

  useEffect(() => {
    if (screen !== 'hub') return;
    let on = true;
    if (!lists.length) { setItemCount(0); return; }
    void Promise.all(lists.map(l => getTodoItems(settings, l.entity_id).catch(() => [])))
      .then(all => { if (on) setItemCount(all.flat().filter(i => i.status !== 'completed').length); });
    return () => { on = false; };
  }, [screen, listKey, settings.baseUrl, settings.token]);

  if (screen === 'calendar') {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader title={i18n.t('calendar')} onBack={() => setScreen('hub')} onSettings={() => setShowCalendarSettings(true)} />
        <ScrollView contentContainerStyle={s.content}><CalendarView calendars={calendars} settings={settings} /></ScrollView>
        <EntityPickerModal
          visible={showCalendarSettings}
          title={i18n.t('calendarSettings')}
          hint={i18n.t('calendarSettingsHint')}
          entities={allCalendars}
          selectedIds={settings.selectedCalendarIds?.length ? settings.selectedCalendarIds : allCalendars.map(c => c.entity_id)}
          onClose={() => setShowCalendarSettings(false)}
          onSave={ids => { onSettingsChange({ selectedCalendarIds: ids }); setShowCalendarSettings(false); }}
        />
      </View>
    );
  }
  if (screen === 'lists') {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader title={i18n.t('lists')} onBack={() => setScreen('hub')} onSettings={() => setShowListSettings(true)} />
        <ListsView lists={lists} settings={settings} />
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

  return (
    <ScrollView contentContainerStyle={s.hub}>
      <Text style={s.hubTitle}>{i18n.t('family')}</Text>
      <View style={s.tileGrid}>
        <Tile
          icon="calendar"
          color={colors.primary}
          title={i18n.t('calendar')}
          subtitle={eventCount === null ? i18n.t('loading') : `${eventCount} ${i18n.t('eventsThisWeek')}`}
          onPress={() => setScreen('calendar')}
        />
        <Tile
          icon="checkbox"
          color={colors.safe}
          title={i18n.t('lists')}
          subtitle={itemCount === null ? i18n.t('loading') : `${lists.length} · ${itemCount} ${i18n.t('itemsLeft')}`}
          onPress={() => setScreen('lists')}
        />
      </View>
    </ScrollView>
  );
}

function BackHeader({ title, onBack, onSettings }: { title: string; onBack: () => void; onSettings: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.backHeader}>
      <PressableScale onPress={onBack} style={s.backBtn}><Ionicons name="chevron-back" size={22} color={colors.text} /></PressableScale>
      <Text style={[s.backTitle, { flex: 1 }]}>{title}</Text>
      <PressableScale onPress={onSettings} style={s.backBtn}><Ionicons name="ellipsis-vertical" size={18} color={colors.text} /></PressableScale>
    </View>
  );
}

// نافذة اختيار مستقلة تمامًا - كل شاشة (تقويم / تذكيرات) بتاخد نسختها
// الخاصة (entities + selectedIds + مفتاح حفظ مختلف)، من غير أي تشابك
// بين الاتنين زي ما كان قبل كده.
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

function Tile({ icon, color, title, subtitle, onPress }: { icon: string; color: string; title: string; subtitle: string; onPress: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <PressableScale style={s.tile} onPress={onPress}>
      <View style={[s.tileIcon, { backgroundColor: color + '26' }]}>
        <Ionicons name={icon} size={26} color={color} />
      </View>
      <Text style={s.tileTitle}>{title}</Text>
      <Text style={s.tileSubtitle}>{subtitle}</Text>
    </PressableScale>
  );
}

function makeStyles(colors: Palette) { return StyleSheet.create({
  hub: { padding: 16, gap: 16 },
  hubTitle: { color: colors.text, fontSize: 26, fontWeight: '800' },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47.5%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  tileIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  tileSubtitle: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  backHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 4 },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  backTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  content: { padding: 16, gap: 14 },
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
