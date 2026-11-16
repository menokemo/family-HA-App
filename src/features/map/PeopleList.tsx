// جسم تبويب "People" في كارت الخريطة: لستة الأفراد + كارت تفاصيل الفرد المختار
// (مسافة/ETA + أوضاع المسار + ملاحة + متابعة + تايملاين). القشرة والسحب في MapSheet.
import { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { absoluteHaUrl, authHeaders } from '../../api/homeAssistant';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { PressableScale } from '../../components/PressableScale';
import { batteryIcon, batteryPct, batteryText, distance, etaText, haversine, placeLabel, timeAgo, PERSON_RING, type Motion, type RouteMode, type RouteResult, type Trip } from './mapShared';

const TRAIL_RANGES: { h: number; key: 'today' | 'days3' | 'week' }[] = [
  { h: 24, key: 'today' },
  { h: 72, key: 'days3' },
  { h: 168, key: 'week' },
];

const ROUTE_MODES: { m: RouteMode; icon: string }[] = [
  { m: 'driving', icon: 'car' },
  { m: 'walking', icon: 'walk' },
  { m: 'cycling', icon: 'bicycle' },
];

export type PeopleListProps = {
  people: HaEntity[];
  states: HaEntity[];
  settings: ConnectionSettings;
  colorFor: Record<string, string>;
  addrMap: Record<string, string>;
  myCoord?: [number, number]; // [lng, lat]
  meId?: string;
  selectedId?: string;
  onSelect: (id: string) => void;
  onScroll?: (y: number) => void;
  routeMode?: RouteMode;
  onRouteMode?: (m: RouteMode) => void;
  routeInfo?: RouteResult | null;
  onNavigate?: (id: string) => void;
  motion?: Record<string, Motion>;
  follow?: boolean;
  onToggleFollow?: () => void;
  trailActive?: boolean;
  trailLoading?: boolean;
  trailRange?: number;
  onToggleTrail?: () => void;
  onChangeRange?: (hours: number) => void;
  onPlayTrail?: () => void;
  playing?: boolean;
  /** اتجاه ومسافة كل فرد بالنسبة للبيت ("2.3 km شمال شرق") — مش موجود للي في البيت. */
  homeDir?: Record<string, string>;
  /** مسار الطريق من البيت للفرد المختار — "of home" بتستخدم مسافته الفعلية. */
  homeRouteInfo?: RouteResult | null;
  trips?: Trip[];
  onPickTrip?: (trip: Trip) => void;
};

export function PeopleList({
  people,
  states,
  settings,
  colorFor,
  addrMap,
  myCoord,
  meId,
  selectedId,
  onSelect,
  onScroll,
  routeMode,
  onRouteMode,
  routeInfo,
  onNavigate,
  motion,
  follow,
  onToggleFollow,
  trailActive,
  trailLoading,
  trailRange,
  onToggleTrail,
  onChangeRange,
  onPlayTrail,
  playing,
  homeDir,
  homeRouteInfo,
  trips,
  onPickTrip,
}: PeopleListProps) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const clock = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString(i18n.locale || 'en', { hour: '2-digit', minute: '2-digit' });
  };

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

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.listContent} scrollEventThrottle={16} onScroll={e => onScroll?.(e.nativeEvent.contentOffset.y)}>
      {people.length === 0 ? <Text style={s.empty}>{i18n.t('noPeople')}</Text> : null}
      {people.map(p => {
        const isSel = selectedId === p.entity_id;
        const isMe = !!meId && p.entity_id === meId;
        const ring = colorFor[p.entity_id] ?? PERSON_RING[0];
        const pct = batteryPct(p, states);
        const uri = uriFor(p);
        const mo = motion?.[p.entity_id];
        return (
          <View key={p.entity_id} style={[s.row, isSel && s.rowSelected]}>
            <Pressable style={s.rowMain} onPress={() => onSelect(p.entity_id)}>
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
                  {isMe ? <View style={s.meDot} /> : null}
                </View>
                <View style={s.rowPlaceLine}>
                  {mo?.moving ? <Ionicons name={mo.speed >= 25 ? 'car' : 'walk'} size={12} color={colors.primary} /> : null}
                  <Text style={s.rowPlace} numberOfLines={1}>
                    {placeLabel(p, addrMap, mo)} · {timeAgo(p.last_changed)}
                  </Text>
                </View>
              </View>
              <View style={s.rowBattery}>
                <Ionicons name={batteryIcon(pct)} size={15} color={Number.isFinite(pct) && pct < 20 ? colors.danger : colors.muted} />
                <Text style={s.rowBatteryText}>{batteryText(p, states)}</Text>
              </View>
            </Pressable>

            {isSel ? (
              <>
                <View style={s.details}>
                  <Box s={s} label={i18n.t('battery')} value={batteryText(p, states)} />
                  {homeDir?.[p.entity_id] ? (
                    <Box
                      s={s}
                      label={i18n.t('ofHome')}
                      // مسافة الطريق الفعلية من البيت (لو اتحسبت) + الاتجاه، وإلا المستقيمة.
                      value={homeRouteInfo ? `${distance(homeRouteInfo.distanceMeters)} ${homeDir[p.entity_id].split(' ').pop()}` : homeDir[p.entity_id]}
                    />
                  ) : null}
                  {isMe ? (
                    <Box
                      s={s}
                      label={i18n.t('locationAccuracy')}
                      value={Number.isFinite(Number(p.attributes.gps_accuracy)) ? distance(Number(p.attributes.gps_accuracy)) : '—'}
                    />
                  ) : (
                    <>
                      <Box s={s} label={i18n.t('fromMe')} value={routeInfo ? distance(routeInfo.distanceMeters) : fromMe(p)} />
                      {mo?.moving ? (
                        <Box s={s} label={i18n.t('speed')} value={`${Math.round(mo.speed)} km/h`} />
                      ) : (
                        <Box s={s} label={i18n.t('eta')} value={routeInfo ? etaText(routeInfo.durationSeconds) : '…'} />
                      )}
                    </>
                  )}
                </View>

                {!isMe ? (
                  <>
                    <View style={s.actions}>
                      <View style={s.segRow}>
                        {ROUTE_MODES.map(rm => (
                          <PressableScale key={rm.m} style={[s.segItem, routeMode === rm.m && s.segItemActive]} onPress={() => onRouteMode?.(rm.m)}>
                            <Ionicons name={rm.icon} size={17} color={routeMode === rm.m ? colors.black : colors.text} />
                          </PressableScale>
                        ))}
                      </View>
                      <PressableScale style={s.navigate} onPress={() => onNavigate?.(p.entity_id)}>
                        <Ionicons name="navigate" size={17} color={colors.black} />
                        <Text style={s.navigateText}>{i18n.t('navigateToPerson')}</Text>
                      </PressableScale>
                    </View>

                    <View style={s.actions}>
                      <PressableScale style={[s.toolBtn, follow && s.toolBtnActive]} onPress={() => onToggleFollow?.()}>
                        <Ionicons name="navigate-circle-outline" size={16} color={follow ? colors.black : colors.text} />
                        <Text style={[s.toolText, follow && s.toolTextActive]}>{i18n.t('follow')}</Text>
                      </PressableScale>
                      <PressableScale style={[s.toolBtn, trailActive && s.toolBtnActive]} onPress={() => onToggleTrail?.()}>
                        {trailLoading ? (
                          <ActivityIndicator size="small" color={colors.text} />
                        ) : (
                          <>
                            <Ionicons name="git-commit-outline" size={16} color={trailActive ? colors.black : colors.text} />
                            <Text style={[s.toolText, trailActive && s.toolTextActive]}>{i18n.t('playTrail')}</Text>
                          </>
                        )}
                      </PressableScale>
                    </View>

                    {trailActive ? (
                      <View style={s.actions}>
                        <View style={[s.segRow, { flex: 1 }]}>
                          {TRAIL_RANGES.map(r => (
                            <PressableScale key={r.h} style={[s.segItemWide, trailRange === r.h && s.segItemActive]} onPress={() => onChangeRange?.(r.h)}>
                              <Text style={[s.segText, trailRange === r.h && s.segTextActive]}>{i18n.t(r.key)}</Text>
                            </PressableScale>
                          ))}
                        </View>
                        <PressableScale style={[s.playBtn, playing && s.toolBtnActive]} onPress={() => onPlayTrail?.()}>
                          <Ionicons name={playing ? 'pause' : 'play'} size={18} color={playing ? colors.black : colors.text} />
                        </PressableScale>
                      </View>
                    ) : null}

                    {trailActive && !trailLoading ? (
                      <View style={s.trips}>
                        <Text style={s.tripsTitle}>{i18n.t('trips')}{trips && trips.length ? ` · ${trips.length}` : ''}</Text>
                        {!trips || trips.length === 0 ? (
                          <Text style={s.tripsEmpty}>{i18n.t('noTrips')}</Text>
                        ) : (
                          trips.map(t => (
                            <PressableScale key={t.id} style={s.tripRow} onPress={() => onPickTrip?.(t)}>
                              <Ionicons name="car-outline" size={16} color={colors.primary} />
                              <View style={{ flex: 1 }}>
                                <Text style={s.tripTime} numberOfLines={1}>{clock(t.startAt)} → {clock(t.endAt)} · {etaText(t.durationSec)}</Text>
                                <Text style={s.tripMeta} numberOfLines={1}>{distance(t.distanceM)} · {Math.round(t.avgKmh)} km/h</Text>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                            </PressableScale>
                          ))
                        )}
                      </View>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
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
    rowPlaceLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    rowPlace: { color: c.muted, fontSize: 12.5, flexShrink: 1 },
    rowBattery: { alignItems: 'center', gap: 1, minWidth: 34 },
    rowBatteryText: { color: c.muted, fontSize: 11, fontWeight: '600' },
    details: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 12, paddingTop: 2 },
    box: { flex: 1, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingVertical: 8, paddingHorizontal: 10 },
    boxLabel: { color: c.muted, fontSize: 10.5, fontWeight: '600' },
    boxValue: { color: c.text, fontSize: 13.5, fontWeight: '700', marginTop: 3 },
    actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 12 },
    segRow: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    segItem: { width: 40, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
    segItemWide: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
    segItemActive: { backgroundColor: c.primary },
    segText: { color: c.text, fontSize: 12.5, fontWeight: '700' },
    segTextActive: { color: c.black },
    navigate: { flex: 1, backgroundColor: c.primary, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    navigateText: { color: c.black, fontWeight: '800', fontSize: 14 },
    toolBtn: { flex: 1, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40 },
    toolBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    toolText: { color: c.text, fontWeight: '700', fontSize: 13 },
    toolTextActive: { color: c.black },
    playBtn: { width: 46, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    trips: { paddingHorizontal: 10, paddingBottom: 12, gap: 6 },
    tripsTitle: { color: c.muted, fontSize: 11.5, fontWeight: '800', marginBottom: 2 },
    tripsEmpty: { color: c.muted, fontSize: 12.5, paddingVertical: 6 },
    tripRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingVertical: 9, paddingHorizontal: 11 },
    tripTime: { color: c.text, fontSize: 13, fontWeight: '700' },
    tripMeta: { color: c.muted, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  });
