import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { findCalendarEntities, findTodoEntities } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { CalendarView } from './CalendarView';
import { ListsView } from './ListsView';

type Props = { states: HaEntity[]; settings: ConnectionSettings };
type Section = 'calendar' | 'lists';

export function FamilyTab({ states, settings }: Props) {
  const [section, setSection] = useState<Section>('calendar');
  const calendars = findCalendarEntities(states);
  const lists = findTodoEntities(states);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.tabs}>
        <Segment icon="calendar-outline" label={i18n.t('calendar')} active={section === 'calendar'} onPress={() => setSection('calendar')} />
        <Segment icon="checkbox-outline" label={i18n.t('lists')} active={section === 'lists'} onPress={() => setSection('lists')} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {section === 'calendar' ? <CalendarView calendars={calendars} settings={settings} /> : <ListsView lists={lists} settings={settings} />}
      </ScrollView>
    </View>
  );
}

function Segment({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.segment, active && styles.segmentActive]} onPress={onPress}>
      <Ionicons name={icon} size={17} color={active ? colors.primary : colors.muted} />
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, margin: 16, marginBottom: 0, borderRadius: 16, padding: 4, gap: 4 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderRadius: 12 },
  segmentActive: { backgroundColor: colors.surfaceElevated },
  segmentText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  segmentTextActive: { color: colors.primary },
  content: { padding: 16, gap: 14 },
});
