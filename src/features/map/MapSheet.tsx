// كارت الخريطة السفلي (Bottom sheet قابل للسحب) بأربع تبويبات:
// People (الأفراد) / Devices (أجهزة مش أشخاص) / Zones (المناطق) / Alerts (المخاطر).
// القشرة والسحب هنا؛ محتوى كل تبويب في مكوّن مستقل. السحب بـ Animated + PanResponder
// من غير أي مكتبة خارجية.
import { useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { PressableScale } from '../../components/PressableScale';
import { PeopleList, type PeopleListProps } from './PeopleList';
import { SimpleList, type SimpleItem } from './SimpleList';

const WIN_H = Dimensions.get('window').height;
const SHEET_H = Math.min(560, Math.round(WIN_H * 0.72));
const PEEK = 184;
const COLLAPSED = SHEET_H - PEEK;
const SHEET_BOTTOM = 24;

// ارتفاع الجزء الظاهر من الكارت وهو مقفول - الأب بيستخدمه عشان يرفع أزرار التحكم.
export const MAP_SHEET_PEEK = SHEET_BOTTOM + PEEK;

type Tab = 'people' | 'devices' | 'zones' | 'alerts';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'people', label: 'tabPeople', icon: 'people-outline' },
  { key: 'devices', label: 'tabDevices', icon: 'hardware-chip-outline' },
  { key: 'zones', label: 'tabZones', icon: 'location-outline' },
  { key: 'alerts', label: 'tabAlerts', icon: 'warning-outline' },
];

type Props = {
  people: Omit<PeopleListProps, 'onExpand'>;
  devices: SimpleItem[];
  zones: SimpleItem[];
  alerts: SimpleItem[];
  onPickDevice: (id: string) => void;
  onPickZone: (id: string) => void;
  onPickAlert: (id: string) => void;
};

export function MapSheet({ people, devices, zones, alerts, onPickDevice, onPickZone, onPickAlert }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<Tab>('people');

  // ====== السحب (Animated + PanResponder، بدون أي مكتبة) ======
  const sheetY = useRef(new Animated.Value(COLLAPSED)).current;
  const expandedRef = useRef(false);
  const snapTo = (to: number) => {
    Animated.spring(sheetY, { toValue: to, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
    expandedRef.current = to === 0;
  };
  const expand = () => {
    if (!expandedRef.current) snapTo(0);
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

  const counts: Record<Tab, number> = { people: people.people.length, devices: devices.length, zones: zones.length, alerts: alerts.length };

  const chooseTab = (t: Tab) => {
    setTab(t);
    expand();
  };

  return (
    <Animated.View style={[s.sheet, { transform: [{ translateY: sheetY }] }]}>
      <View {...pan.panHandlers} style={s.handleArea}>
        <View style={s.handle} />
        <View style={s.tabBar}>
          {TABS.map(t => {
            const active = tab === t.key;
            const alert = t.key === 'alerts' && counts.alerts > 0;
            return (
              <PressableScale key={t.key} style={[s.tab, active && s.tabActive]} onPress={() => chooseTab(t.key)}>
                <Ionicons name={t.icon} size={16} color={active ? colors.black : alert ? colors.danger : colors.muted} />
                <Text style={[s.tabText, active && s.tabTextActive, !active && alert && { color: colors.danger }]} numberOfLines={1}>
                  {i18n.t(t.label)}
                </Text>
                {counts[t.key] > 0 ? (
                  <Text style={[s.badge, active && s.badgeActive, !active && alert && { color: colors.danger }]}>{counts[t.key]}</Text>
                ) : null}
              </PressableScale>
            );
          })}
        </View>
      </View>

      {tab === 'people' ? (
        <PeopleList {...people} onExpand={expand} />
      ) : tab === 'devices' ? (
        <SimpleList items={devices} emptyText={i18n.t('noDevices')} onPick={onPickDevice} onExpand={expand} />
      ) : tab === 'zones' ? (
        <SimpleList items={zones} emptyText={i18n.t('noZones')} onPick={onPickZone} onExpand={expand} />
      ) : (
        <SimpleList items={alerts} emptyText={i18n.t('noAlerts')} onPick={onPickAlert} onExpand={expand} />
      )}
    </Animated.View>
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
    handleArea: { paddingTop: 10, paddingBottom: 8 },
    handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: c.border, alignSelf: 'center' },
    tabBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingTop: 10 },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 12, backgroundColor: c.surfaceElevated },
    tabActive: { backgroundColor: c.primary },
    tabText: { color: c.muted, fontSize: 12, fontWeight: '700' },
    tabTextActive: { color: c.black },
    badge: { color: c.muted, fontSize: 10.5, fontWeight: '800' },
    badgeActive: { color: c.black },
  });
