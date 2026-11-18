import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { MemberAvatar, personColor } from './MemberAvatar';
import { readProfiles, profileColor } from './profiles';
import { memberRole, type Role } from './roles';
import { readSocial, type Chore } from './social';

type Props = { states: HaEntity[]; settings: ConnectionSettings };

const roleLabel = (r?: Role) => (r ? i18n.t('role_' + r) : '');
function birthdayLabel(b?: string): string | null {
  if (!b) return null;
  const d = new Date(b + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(i18n.locale || 'en', { day: 'numeric', month: 'long' });
}

export function MembersView({ states, settings }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const persons = useMemo(() => states.filter(e => e.entity_id.startsWith('person.')), [states]);
  const profiles = useMemo(() => readProfiles(states), [states]);
  const chores = useMemo(() => readSocial<Chore>(states, 'chores'), [states]);

  if (persons.length === 0) {
    return <View style={s.center}><Ionicons name="people-outline" size={44} color={colors.muted} /><Text style={s.empty}>{i18n.t('noMembers')}</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={s.list}>
      {persons.map(p => {
        const role = memberRole(p.entity_id, profiles);
        const color = profileColor(p.entity_id, profiles) ?? personColor(p.entity_id);
        const bday = birthdayLabel(profiles[p.entity_id]?.birthday);
        const home = p.state === 'home';
        const openTasks = chores.filter(c => !c.done && c.person === p.entity_id).length;
        return (
          <View key={p.entity_id} style={s.card}>
            <View style={s.head}>
              <MemberAvatar person={p} settings={settings} size={48} color={color} />
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{String(p.attributes.friendly_name ?? p.entity_id)}</Text>
                <View style={s.metaRow}>
                  {role ? <Text style={[s.roleBadge, { color, backgroundColor: color + '18' }]}>{roleLabel(role)}</Text> : null}
                  <View style={s.pill}><Ionicons name={home ? 'home' : 'walk'} size={12} color={home ? colors.safe : colors.muted} /><Text style={[s.pillText, { color: home ? colors.safe : colors.muted }]}>{i18n.t(home ? 'atHome' : 'away')}</Text></View>
                </View>
              </View>
            </View>
            <View style={s.facts}>
              {bday ? <View style={s.fact}><Ionicons name="gift-outline" size={15} color={colors.muted} /><Text style={s.factText}>{bday}</Text></View> : null}
              <View style={s.fact}><Ionicons name="checkbox-outline" size={15} color={colors.muted} /><Text style={s.factText}>{openTasks} · {i18n.t('chores')}</Text></View>
            </View>
          </View>
        );
      })}
      <Text style={s.note}>{i18n.t('membersNote')}</Text>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
    empty: { color: colors.muted, fontSize: 14 },
    list: { padding: 14, gap: 10 },
    card: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 14, padding: 14 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    name: { color: colors.text, fontSize: 16, fontWeight: '700' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
    roleBadge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    pillText: { fontSize: 11.5, fontWeight: '600' },
    facts: { flexDirection: 'row', gap: 16, marginTop: 12, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: colors.border },
    fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    factText: { color: colors.text, fontSize: 13 },
    note: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 8, paddingHorizontal: 20, lineHeight: 17 },
  });
}
