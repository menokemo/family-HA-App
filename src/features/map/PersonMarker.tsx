// علامة الفرد على الخريطة: صورته (أفاتار) + بابل صغير فيه اسمه ومكانه، مع
// تحريك سلس للموقع بين التحديثات (بدل القفز). الـ Marker بييجي عبر require
// (نفس سبب PeopleMapNative: الـ import بيرجع undefined وقت التشغيل مع metro).
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings } from '../../types/homeAssistant';
import { authHeaders } from '../../api/homeAssistant';
import { useTheme } from '../../theme';
import type { Motion } from './mapShared';

const { Marker } = require('@maplibre/maplibre-react-native') as typeof import('@maplibre/maplibre-react-native');

// تحريك الإحداثيات بسلاسة من المكان الظاهر حاليًا للمكان الجديد (easeInOut).
// قفزة كبيرة جدًا (ظهور أول مرة أو انتقال بعيد) بتتعمل فورًا من غير أنيميشن.
function useSmoothCoord(targetLng: number, targetLat: number, duration = 650): [number, number] {
  const [coord, setCoord] = useState<[number, number]>([targetLng, targetLat]);
  const dispRef = useRef<[number, number]>([targetLng, targetLat]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = dispRef.current;
    const dLng = targetLng - from[0];
    const dLat = targetLat - from[1];
    if (Math.abs(dLng) < 1e-7 && Math.abs(dLat) < 1e-7) return;
    // أبعد من ~5 كم: قفزة مباشرة (مالوش لازمة نحرّكه عبر نص الخريطة).
    if (Math.abs(dLng) > 0.05 || Math.abs(dLat) > 0.05) {
      dispRef.current = [targetLng, targetLat];
      setCoord([targetLng, targetLat]);
      return;
    }
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const cur: [number, number] = [from[0] + dLng * e, from[1] + dLat * e];
      dispRef.current = cur;
      setCoord(cur);
      rafRef.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [targetLng, targetLat, duration]);

  return coord;
}

type Props = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  place: string;
  uri?: string;
  motion?: Motion;
  selected?: boolean;
  settings: ConnectionSettings;
};

export function PersonMarker({ id, name, lat, lng, color, place, uri, motion, selected, settings }: Props) {
  const { colors } = useTheme();
  const coord = useSmoothCoord(lng, lat);

  return (
    <Marker id={id} lngLat={coord} anchor="bottom">
      <View style={styles.wrap}>
        {/* بابل الاسم/المكان فوق الصورة — بيكبر لفوق فمايحركش طرف الدبوس. */}
        <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: selected ? color : colors.border }]}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.place, { color: colors.muted }]} numberOfLines={1}>
            {place}
          </Text>
        </View>
        {motion?.moving ? (
          <View style={[styles.heading, { transform: [{ rotate: `${Math.round(motion.heading)}deg` }] }]}>
            <Ionicons name="navigate" size={14} color={color} />
          </View>
        ) : null}
        <View style={[styles.avatar, { borderColor: color, backgroundColor: colors.surface }]}>
          {uri ? <Image source={{ uri, headers: authHeaders(settings) }} style={styles.avatarImg} /> : <Ionicons name="person" size={22} color={colors.text} />}
        </View>
        <View style={[styles.pin, { backgroundColor: color }]} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  bubble: {
    maxWidth: 148,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  name: { fontSize: 12, fontWeight: '800' },
  place: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  heading: { marginBottom: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%' },
  pin: { width: 10, height: 10, borderRadius: 5, marginTop: -3, transform: [{ rotate: '45deg' }] },
});
