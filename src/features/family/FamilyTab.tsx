import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { findCalendarEntities, findTodoEntities, getCalendarEvents, getTodoItems } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { CalendarView } from './CalendarView';
import { ListsView } from './ListsView';
import { PressableScale } from '../../components/PressableScale';

type Props = { states: HaEntity[]; settings: ConnectionSettings };
type Screen = 'hub' | 'calendar' | 'lists';

export function FamilyTab({ states, settings }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [screen, setScreen] = useState<Screen>('hub');
  const calendars = findCalendarEntities(states);
  const lists = findTodoEntities(states);
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
        <BackHeader title={i18n.t('calendar')} onBack={() => setScreen('hub')} />
        <ScrollView contentContainerStyle={s.content}><CalendarView calendars={calendars} settings={settings} /></ScrollView>
      </View>
    );
  }
  if (screen === 'lists') {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader title={i18n.t('lists')} onBack={() => setScreen('hub')} />
        <ListsView lists={lists} settings={settings} />
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

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.backHeader}>
      <PressableScale onPress={onBack} style={s.backBtn}><Ionicons name="chevron-back" size={22} color={colors.text} /></PressableScale>
      <Text style={s.backTitle}>{title}</Text>
    </View>
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
}); }
