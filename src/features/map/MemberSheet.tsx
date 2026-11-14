// لستة أعضاء العيلة (Bottom sheet قابل للسحب) + كارت تفاصيل الفرد المختار.
// مستقل عن محرّك الخريطة: بياخد الأفراد + ألوانهم + العناوين + موقعي، وبيرجّع
// الاختيار للأب (اللي بيركّز الكاميرا على الفرد). السحب بـ Animated + PanResponder
// من غير أي مكتبة خارجية.
import { useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { absoluteHaUrl, authHeaders } from '../../api/homeAssistant';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { PressableScale } from '../../components/PressableScale';
import { batteryIcon, batteryPct, batteryText, distance, haversine, placeLabel, timeAgo, PERSON_RING } from './mapShared';

const WIN_H = Dimensions.get('window').height;
const SHEET_H = Math.min(560, Math.round(WIN_H * 0.72));
const PEEK = 168;
const COLLAPSED = SHEET_H - PEEK;
const SHEET_BOTTOM = 24;

// ارتفاع الجزء الظاهر من اللستة وهي مقفولة (من أسفل الشاشة) - الأب بيستخدمه
// عشان يرفع أزرار التحكم فوق اللستة فمايحصلش تداخل.
export const MEMBER_SHEET_PEEK = SHEET_BOTTOM + PEEK;

type Props = {
  people: HaEntity[];
  states: HaEntity[];
  settings: ConnectionSettings;
  colorFor: Record<string, string>;
  addrMap: Record<string, string>;
  myCoord?: [number, number]; // [lng, lat]
  meId?: string;
  selectedId?: string;
  onSelect: (id: string) => void;
};

export function MemberSheet({ people, states, settings, colorFor, addrMap, myCoord, meId, selectedId, onSelect }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  // ====== السحب للـ bottom sheet (Animated + PanResponder، بدون أي مكتبة) ======
  const sheetY = useRef(new Animated.Value(COLLAPSED)).current;
  const expandedRef = useRef(false);
  const snapTo = (to: number) => {
    Animated.spring(sheetY, { toValue: to, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
    expandedRef.current = to === 0;
  };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        const base = expandedRef.current ? 0 : COLLAPSED;
        let ny = base + g.dy;
        if (ny < 0) ny = 0;
        if (ny > COLLAPSED) ny = COLLAPSED;
        sheetY.setValue(ny);
      },
      onPanResponderRelease: (_e, g) => {
        const base = expandedRef.current ? 0 : COLLAPSED;
        const ny = base + g.dy;
        snapTo(ny < COLLAPSED / 2 ? 0 : COLLAPSED);
      },
    }),
  ).current;

  const [open, setOpen] = useState(false);

  const uriFor = (p: HaEntity): string | undefined => {
    const pic = p.attributes.entity_picture as string | undefined;
    return pic ? (pic.startsWith('http') ? pic : absoluteHaUrl(settings, pic)) : undefined;
  };

  const fromMe = (p: HaEntity): string => {
    if (!myCoord) return '—';
    const lat = Number(p.attributes.latitude);
    const lng = Number(p.attributes.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '—';
    return distance(haversine({ latitude: myCoord[1], longitude: myCoord[0] }, { latitude: lat, longitude: lng }));
  };

  const pick = (id: string) => {
    onSelect(id);
    if (!expandedRef.current) snapTo(0); // افتح اللستة لما يختار فرد وهي مقفولة
  };

  return (
    <Animated.View style={[s.sheet, { transform: [{ translateY: sheetY }] }]}>
      <View {...pan.panHandlers} style={s.handleArea} onLayout={() => undefined}>
        <View style={s.handle} />
        <View style={s.titleRow}>
          <Text style={s.title}>{i18n.t('mapMembers')}</Text>
          <Text style={s.count}>{people.length}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        onScrollBeginDrag={() => {
          if (!expandedRef.current) snapTo(0);
          setOpen(true);
        }}
      >
        {people.length === 0 ? <Text style={s.empty}>{i18n.t('noPeople')}</Text> : null}
        {people.map(p => {
          const isSel = selectedId === p.entity_id;
          const ring = colorFor[p.entity_id] ?? PERSON_RING[0];
          const pct = batteryPct(p, states);
          const uri = uriFor(p);
          return (
            <View key={p.entity_id} style={[s.row, isSel && s.rowSelected]}>
              <Pressable style={s.rowMain} onPress={() => pick(p.entity_id)}>
                <View style={[s.rowAvatarRing, { borderColor: ring }]}>
                  {uri ? (
                    <Image source={{ uri, headers: authHeaders(settings) }} style={s.rowAvatar} />
                  ) : (
                    <View style={[s.rowAvatar, s.avatarFallback]}>
                      <Ionicons name="person" size={20} color={ring} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.rowNameLine}>
                    <Text style={s.rowName} numberOfLines={1}>
                      {String(p.attributes.friendly_name ?? p.entity_id)}
                    </Text>
                    {meId && p.entity_id === meId ? <View style={s.meDot} /> : null}
                  </View>
                  <Text style={s.rowPlace} numberOfLines={1}>
                    {placeLabel(p, addrMap)} · {timeAgo(p.last_changed)}
                  </Text>
                </View>
                <View style={s.rowBattery}>
                  <Ionicons name={batteryIcon(pct)} size={15} color={Number.isFinite(pct) && pct < 20 ? colors.danger : colors.muted} />
                  <Text style={s.rowBatteryText}>{batteryText(p, states)}</Text>
                </View>
              </Pressable>

              {isSel ? (
                <View style={s.details}>
                  <Box s={s} label={i18n.t('battery')} value={batteryText(p, states)} />
                  {meId && p.entity_id === meId ? null : <Box s={s} label={i18n.t('fromMe')} value={fromMe(p)} />}
                  <Box
                    s={s}
                    label={i18n.t('locationAccuracy')}
                    value={Number.isFinite(Number(p.attributes.gps_accuracy)) ? distance(Number(p.attributes.gps_accuracy)) : '—'}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

function Box({ s, label, value }: { s: ReturnType<typeof makeStyles>; label: string; value: string }) {
  return (
    <View style={s.box}>
      <Text style={s.boxLabel}>{label}</Text>
      <Text style={s.boxValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    sheet: {
      position: 'absolute',
      left: 10,
      right: 10,
      bottom: SHEET_BOTTOM,
      height: SHEET_H,
      backgroundColor: c.surface,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -2 },
      elevation: 12,
      overflow: 'hidden',
    },
    handleArea: { paddingTop: 10, paddingBottom: 6 },
    handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: c.border, alignSelf: 'center' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingTop: 8 },
    title: { color: c.text, fontWeight: '800', fontSize: 17 },
    count: { color: c.muted, fontWeight: '700', fontSize: 13, backgroundColor: c.surfaceElevated, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 10, overflow: 'hidden' },
    listContent: { paddingHorizontal: 10, paddingBottom: 18 },
    empty: { color: c.muted, textAlign: 'center', paddingVertical: 24 },
    row: { borderRadius: 16, marginTop: 6 },
    rowSelected: { backgroundColor: c.surfaceElevated },
    rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 9 },
    rowAvatarRing: { width: 46, height: 46, borderRadius: 23, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    rowAvatar: { width: 40, height: 40, borderRadius: 20 },
    avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowName: { color: c.text, fontWeight: '700', fontSize: 15, flexShrink: 1 },
    meDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2a7bff' },
    rowPlace: { color: c.muted, fontSize: 12.5, marginTop: 2 },
    rowBattery: { alignItems: 'center', gap: 1, minWidth: 34 },
    rowBatteryText: { color: c.muted, fontSize: 11, fontWeight: '600' },
    details: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 12, paddingTop: 2 },
    box: { flex: 1, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingVertical: 8, paddingHorizontal: 10 },
    boxLabel: { color: c.muted, fontSize: 10.5, fontWeight: '600' },
    boxValue: { color: c.text, fontSize: 13.5, fontWeight: '700', marginTop: 3 },
  });
