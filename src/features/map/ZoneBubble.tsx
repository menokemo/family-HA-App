// فقاعة سكان المنطقة — زي خريطة Home Assistant الرسمية: كل اللي HA حاسبهم جوّه
// نفس الزون بيتجمّعوا في فقاعة واحدة فوق مركز الزون بدل ما كل واحد يترسم على
// إحداثيه الخام (اللي بيتشتت بأمتار جوّه البيت). بتتفك لما تقرّب الزوم.
import { Image, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings } from '../../types/homeAssistant';
import { authHeaders } from '../../api/homeAssistant';
import { useTheme } from '../../theme';
import { PressableScale } from '../../components/PressableScale';

const { Marker } = require('@maplibre/maplibre-react-native') as typeof import('@maplibre/maplibre-react-native');

// أقصى عدد صور في الفقاعة قبل ما نعرض "+N".
const MAX_AVATARS = 3;

export type BubbleMember = { id: string; name: string; uri?: string; color: string };

type Props = {
  id: string;
  lat: number;
  lng: number;
  members: BubbleMember[];
  settings: ConnectionSettings;
  onPress?: () => void;
};

export function ZoneBubble({ id, lat, lng, members, settings, onPress }: Props) {
  const { colors } = useTheme();
  const shown = members.length <= MAX_AVATARS ? members : members.slice(0, MAX_AVATARS - 1);
  const hidden = members.length - shown.length;

  return (
    <Marker id={id} lngLat={[lng, lat]} anchor="bottom">
      <View style={styles.wrap}>
        <PressableScale onPress={() => onPress?.()}>
          <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {shown.map(m => (
              <View key={m.id} style={[styles.avatar, { borderColor: m.color, backgroundColor: colors.surfaceElevated }]}>
                {m.uri ? (
                  <Image source={{ uri: m.uri, headers: authHeaders(settings) }} style={styles.avatarImg} />
                ) : (
                  <Ionicons name="person" size={16} color={colors.text} />
                )}
              </View>
            ))}
            {hidden > 0 ? (
              <View style={[styles.avatar, styles.more, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
                <Text style={[styles.moreText, { color: colors.text }]}>+{hidden}</Text>
              </View>
            ) : null}
          </View>
        </PressableScale>
        <View style={[styles.tail, { borderTopColor: colors.surface }]} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%' },
  more: { borderStyle: 'dashed' },
  moreText: { fontSize: 12, fontWeight: '800' },
  tail: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },
});
