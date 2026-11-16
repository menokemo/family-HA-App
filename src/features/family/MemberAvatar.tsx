import { Image, StyleSheet, Text, View } from 'react-native';
import { absoluteHaUrl, authHeaders } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';

// لوحة ألوان ثابتة لكل فرد — بتتحدّد من entity_id فبتفضل نفسها دايمًا (نفس لون
// الفرد في العمود والأحداث والأفاتار). متناسقة مع ألوان الخريطة.
const PALETTE = ['#D85A30', '#378ADD', '#1D9E75', '#BA7517', '#9B59B6', '#E64C7A', '#17A2B8', '#D4537E'];

export function personColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initial(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0).toUpperCase() : '?';
}

/** صورة الفرد (entity_picture) أو دايرة ملوّنة بأول حرف من اسمه. */
export function MemberAvatar({ person, name, settings, size = 28, ring }: {
  person?: HaEntity;
  name?: string;
  settings: ConnectionSettings;
  size?: number;
  ring?: boolean;
}) {
  const label = String(person?.attributes.friendly_name ?? name ?? person?.entity_id ?? '?');
  const color = personColor(person?.entity_id ?? label);
  const pic = person?.attributes.entity_picture as string | undefined;
  const uri = pic ? (pic.startsWith('http') ? pic : absoluteHaUrl(settings, pic)) : undefined;
  const r = size / 2;
  const base = { width: size, height: size, borderRadius: r } as const;
  const inner = uri ? (
    <Image source={{ uri, headers: authHeaders(settings) }} style={base} />
  ) : (
    <View style={[base, styles.fallback, { backgroundColor: color }]}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.42 }}>{initial(label)}</Text>
    </View>
  );
  if (!ring) return inner;
  return <View style={{ padding: 2, borderRadius: r + 2, borderWidth: 2, borderColor: color }}>{inner}</View>;
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
