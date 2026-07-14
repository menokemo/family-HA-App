import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import RNFS from 'react-native-fs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { absoluteHaUrl, authHeaders } from '../../api/homeAssistant';
import { colors } from '../../theme';
import { i18n } from '../../i18n';

type Props = { people: HaEntity[]; home?: HaEntity; states: HaEntity[]; selectedPersonId?: string; settings: ConnectionSettings };
type Point = { id: string; name: string; lat: number; lng: number; picture?: string };

const coord = (e: HaEntity) => ({ latitude: Number(e.attributes.latitude), longitude: Number(e.attributes.longitude) });

const haversine = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const distance = (m?: number) => (m === undefined ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

async function avatar(entity: HaEntity, settings: ConnectionSettings) {
  const path = entity.attributes.entity_picture;
  if (typeof path !== 'string') return;
  try {
    const file = `${RNFS.CachesDirectoryPath}/familyha-${entity.entity_id.replace(/\W/g, '_')}.img`;
    const r = await RNFS.downloadFile({ fromUrl: absoluteHaUrl(settings, path), toFile: file, headers: authHeaders(settings) }).promise;
    if (r.statusCode < 200 || r.statusCode >= 300) return;
    return `data:image/jpeg;base64,${await RNFS.readFile(file, 'base64')}`;
  } catch {
    return;
  }
}

function esc(v: string) {
  return v.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function battery(p: HaEntity, states: HaEntity[]) {
  const n = Number(p.attributes.battery_level);
  if (Number.isFinite(n)) return `${n}%`;
  const key = p.entity_id.split('.')[1];
  const e = states.find(x => x.entity_id.startsWith('sensor.') && x.entity_id.includes(key) && x.entity_id.includes('battery'));
  return e ? `${e.state}%` : '—';
}

export function PeopleMapWeb({ people, home, states, selectedPersonId, settings }: Props) {
  const [selected, setSelected] = useState<HaEntity | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    let on = true;
    void Promise.all(people.map(async p => [p.entity_id, await avatar(p, settings)] as const)).then(xs => {
      if (on) setAvatars(Object.fromEntries(xs.filter((x): x is readonly [string, string] => !!x[1])));
    });
    return () => {
      on = false;
    };
  }, [people.map(p => `${p.entity_id}:${String(p.attributes.entity_picture ?? '')}`).join('|'), settings.baseUrl, settings.token]);

  const me = people.find(p => p.entity_id === selectedPersonId) ?? people[0];
  const points: Point[] = people.map(p => ({
    id: p.entity_id,
    name: String(p.attributes.friendly_name ?? p.entity_id),
    lat: Number(p.attributes.latitude),
    lng: Number(p.attributes.longitude),
    picture: avatars[p.entity_id],
  }));

  const html = useMemo(
    () => mapHtml(points, home ? { lat: Number(home.attributes.latitude), lng: Number(home.attributes.longitude), name: String(home.attributes.friendly_name ?? 'Home') } : undefined),
    [JSON.stringify(points), home?.attributes.latitude, home?.attributes.longitude],
  );

  const focusPerson = (person: HaEntity) => {
    setSelected(person);
    const c = coord(person);
    if (Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
      webRef.current?.injectJavaScript(`window.focusPerson && window.focusPerson('${person.entity_id}'); true;`);
    }
  };

  if (!people.length) return <View style={s.empty}><Text style={s.muted}>{i18n.t('noPeople')}</Text></View>;

  const navigate = (p: HaEntity) => {
    const c = coord(p);
    const label = encodeURIComponent(String(p.attributes.friendly_name ?? p.entity_id));
    const native = Platform.OS === 'ios'
      ? `maps://?daddr=${c.latitude},${c.longitude}&q=${label}`
      : `geo:${c.latitude},${c.longitude}?q=${c.latitude},${c.longitude}(${label})`;
    void Linking.openURL(native).catch(() => Linking.openURL(`https://www.openstreetmap.org/directions?to=${c.latitude},${c.longitude}`));
  };

  return (
    <View style={s.screen}>
      <View style={s.mapHalf}>
        <WebView
          ref={webRef}
          source={{ html }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          onMessage={e => setSelected(people.find(p => p.entity_id === e.nativeEvent.data) ?? null)}
          style={s.web}
        />
        <View style={s.badge}>
          <Ionicons name="people" size={19} color={colors.primary} />
          <Text style={s.badgeText}>{people.length} {i18n.t('people')}</Text>
        </View>
      </View>

      <View style={s.listHalf}>
        <FlatList
          data={people}
          keyExtractor={p => p.entity_id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => {
            const isSelected = selected?.entity_id === item.entity_id;
            return (
              <Pressable style={[s.row, isSelected && s.rowSelected]} onPress={() => focusPerson(item)}>
                {avatars[item.entity_id] ? (
                  <Image source={{ uri: avatars[item.entity_id] }} style={s.rowAvatar} />
                ) : (
                  <View style={[s.rowAvatar, s.rowAvatarFallback]}><Ionicons name="person" size={20} color={colors.primary} /></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{String(item.attributes.friendly_name ?? item.entity_id)}</Text>
                  <Text style={s.rowMuted}>{item.state} · {battery(item, states)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            );
          }}
        />
      </View>

      {selected && me ? (
        <View style={s.sheet}>
          <View style={s.head}>
            {avatars[selected.entity_id] ? (
              <Image source={{ uri: avatars[selected.entity_id] }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}><Ionicons name="person" size={28} color={colors.primary} /></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{String(selected.attributes.friendly_name ?? selected.entity_id)}</Text>
              <Text style={s.muted}>{selected.state}</Text>
            </View>
            <Pressable onPress={() => setSelected(null)} style={s.close}><Ionicons name="close" size={20} color={colors.text} /></Pressable>
          </View>
          <View style={s.details}>
            <Box label={i18n.t('battery')} value={battery(selected, states)} />
            <Box label={i18n.t('fromHome')} value={home ? distance(haversine(coord(selected), coord(home))) : '—'} />
            <Box label={i18n.t('fromMe')} value={distance(selected.entity_id === me.entity_id ? 0 : haversine(coord(selected), coord(me)))} />
            <Box label={i18n.t('locationAccuracy')} value={Number.isFinite(Number(selected.attributes.gps_accuracy)) ? distance(Number(selected.attributes.gps_accuracy)) : '—'} />
          </View>
          <Pressable style={s.navigate} onPress={() => navigate(selected)}>
            <Ionicons name="navigate" size={20} color={colors.black} />
            <Text style={s.navigateText}>{i18n.t('navigateToPerson')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return <View style={s.box}><Text style={s.boxLabel}>{label}</Text><Text style={s.boxValue}>{value}</Text></View>;
}

function mapHtml(points: Point[], home?: { lat: number; lng: number; name: string }) {
  const all = [...points.map(p => [p.lat, p.lng]), ...(home ? [[home.lat, home.lng]] : [])];
  const c = all[0] ?? [52.1, 5.1];
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0;background:#0b1220}.person{width:48px;height:48px;border:3px solid #51c7ff;border-radius:50%;background:#152238;overflow:hidden;box-shadow:0 4px 12px #0008}.person img{width:100%;height:100%;object-fit:cover}.initial{color:#fff;font:700 18px sans-serif;text-align:center;line-height:48px}.home{width:40px;height:40px;border-radius:50%;background:#27c499;color:#fff;text-align:center;line-height:40px;font-size:20px;border:3px solid #fff}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
const map=L.map('map').setView([${c[0]},${c[1]}],16);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:20,subdomains:'abcd',attribution:'© OpenStreetMap contributors © CARTO'}).addTo(map);
const b=[];
const markers={};
${home ? `L.marker([${home.lat},${home.lng}],{icon:L.divIcon({className:'',html:'<div class="home">⌂</div>',iconSize:[46,46],iconAnchor:[23,23]})}).addTo(map).bindTooltip(\`${esc(home.name)}\`);b.push([${home.lat},${home.lng}]);` : ''}
${points
  .map(
    p => `(()=>{const i=L.divIcon({className:'',html:\`<div class="person">${p.picture ? `<img src="${p.picture}">` : `<div class="initial">${esc(p.name.slice(0, 1).toUpperCase())}</div>`}</div>\`,iconSize:[54,54],iconAnchor:[27,27]});const m=L.marker([${p.lat},${p.lng}],{icon:i}).addTo(map).bindTooltip(\`${esc(p.name)}\`).on('click',()=>window.ReactNativeWebView.postMessage('${p.id}'));markers['${p.id}']=m;b.push([${p.lat},${p.lng}]);})();`,
  )
  .join('')}
if(b.length>1)map.fitBounds(b,{padding:[50,50]});
window.focusPerson=function(id){const m=markers[id];if(!m)return;map.setView(m.getLatLng(),16,{animate:true});m.openTooltip();};
</script></body></html>`;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  mapHalf: { flex: 1 },
  listHalf: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listContent: { padding: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceElevated },
  rowAvatar: { width: 40, height: 40, borderRadius: 20 },
  rowAvatarFallback: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  rowName: { color: colors.text, fontWeight: '800', fontSize: 15 },
  rowMuted: { color: colors.muted, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  web: { flex: 1, backgroundColor: colors.background },
  empty: { padding: 24 },
  muted: { color: colors.muted },
  badge: { position: 'absolute', top: 14, left: 14, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'rgba(16,24,38,.94)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  badgeText: { color: colors.text, fontWeight: '800' },
  sheet: { position: 'absolute', left: 14, right: 14, bottom: 14, backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 16, elevation: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: { width: 58, height: 58, borderRadius: 29 },
  avatarFallback: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 19, fontWeight: '800' },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  box: { width: '48%', backgroundColor: colors.surfaceElevated, borderRadius: 14, padding: 11 },
  boxLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  boxValue: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  navigate: { marginTop: 14, backgroundColor: colors.primary, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  navigateText: { color: colors.black, fontWeight: '900' },
});
