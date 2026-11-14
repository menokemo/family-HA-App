// خريطة العيلة بنسخة NATIVE (MapLibre React Native v11) - بديل تجريبي للخريطة
// المبنية على WebView (PeopleMapWeb). بترسم بالـ GPU مباشرة فأنعم وأسرع.
// المرحلة أ (de-risk البناء): خريطة أساسية + علامات الأشخاص بالأفاتار + علامة
// البيت + النقطة الزرقاء النيتف (UserLocation, fused عبر locationEngine=google)
// + زر إعادة التمركز. باقي المزايا (المناطق كدوائر، المسار، التايملاين،
// المخاطر، القمر الصناعي، أرقام العمارات) بتتنقل في المرحلة ب بعد تأكيد البناء.
import { useMemo, useRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Camera, type CameraRef, Map, Marker, UserLocation } from '@maplibre/maplibre-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { absoluteHaUrl, authHeaders } from '../../api/homeAssistant';
import { useTheme } from '../../theme';
import { PressableScale } from '../../components/PressableScale';

type Props = { people: HaEntity[]; home?: HaEntity; states: HaEntity[]; selectedPersonId?: string; settings: ConnectionSettings };

const PERSON_RING = ['#4F8BFF', '#34C759', '#FF9F0A', '#FF375F', '#AF52DE', '#5AC8FA'];
const num = (v: unknown) => Number(v);

type Point = { id: string; name: string; lat: number; lng: number; uri?: string; color: string };

export function PeopleMapNative({ people, home, settings }: Props) {
  const { colors, resolvedMode } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const styleUrl = resolvedMode === 'dark' ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';

  const points = useMemo<Point[]>(
    () =>
      people
        .map((p, i): Point | null => {
          const lat = num(p.attributes.latitude);
          const lng = num(p.attributes.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const pic = p.attributes.entity_picture as string | undefined;
          const uri = pic ? (pic.startsWith('http') ? pic : absoluteHaUrl(settings, pic)) : undefined;
          return { id: p.entity_id, name: String(p.attributes.friendly_name ?? p.entity_id), lat, lng, uri, color: PERSON_RING[i % PERSON_RING.length] };
        })
        .filter((p): p is Point => p !== null),
    [people, settings],
  );

  const homeLat = home ? num(home.attributes.latitude) : NaN;
  const homeLng = home ? num(home.attributes.longitude) : NaN;
  const hasHome = Number.isFinite(homeLat) && Number.isFinite(homeLng);
  const center: [number, number] = hasHome ? [homeLng, homeLat] : points[0] ? [points[0].lng, points[0].lat] : [0, 0];

  const fitAll = () => {
    const all: [number, number][] = points.map(p => [p.lng, p.lat]);
    if (hasHome) all.push([homeLng, homeLat]);
    if (all.length === 0) return;
    const lngs = all.map(c => c[0]);
    const lats = all.map(c => c[1]);
    const w = Math.min(...lngs);
    const e = Math.max(...lngs);
    const sLat = Math.min(...lats);
    const nLat = Math.max(...lats);
    if (w === e && sLat === nLat) {
      cameraRef.current?.flyTo({ center: [w, sLat], zoom: 16, duration: 600 });
      return;
    }
    cameraRef.current?.fitBounds([w, sLat, e, nLat], { padding: { top: 90, bottom: 90, left: 60, right: 60 }, duration: 600 });
  };

  return (
    <View style={{ flex: 1 }}>
      <Map mapStyle={styleUrl} style={{ flex: 1 }}>
        <Camera ref={cameraRef} center={center} zoom={15} />
        <UserLocation animated />
        {hasHome ? (
          <Marker id="home" lngLat={[homeLng, homeLat]} anchor="center">
            <View style={[styles.homeChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>⌂ {String(home?.attributes.friendly_name ?? 'Home')}</Text>
            </View>
          </Marker>
        ) : null}
        {points.map(p => (
          <Marker key={p.id} id={p.id} lngLat={[p.lng, p.lat]} anchor="bottom">
            <View style={styles.markerWrap}>
              <View style={[styles.avatar, { borderColor: p.color, backgroundColor: colors.surface }]}>
                {p.uri ? <Image source={{ uri: p.uri, headers: authHeaders(settings) }} style={styles.avatarImg} /> : <Ionicons name="person" size={22} color={colors.text} />}
              </View>
              <View style={[styles.pin, { backgroundColor: p.color }]} />
            </View>
          </Marker>
        ))}
      </Map>
      <PressableScale style={[styles.fab, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} onPress={fitAll} hitSlop={8}>
        <Ionicons name="locate" size={22} color={colors.primary} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  markerWrap: { alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%' },
  pin: { width: 10, height: 10, borderRadius: 5, marginTop: -3, transform: [{ rotate: '45deg' }] },
  homeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  fab: { position: 'absolute', right: 16, bottom: 24, width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
