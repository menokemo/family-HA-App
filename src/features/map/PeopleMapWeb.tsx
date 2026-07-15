import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import RNFS from 'react-native-fs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { absoluteHaUrl, authHeaders } from '../../api/homeAssistant';
import { colors } from '../../theme';
import { i18n } from '../../i18n';

type Props = { people: HaEntity[]; home?: HaEntity; states: HaEntity[]; selectedPersonId?: string; settings: ConnectionSettings };
type Point = { id: string; name: string; lat: number; lng: number; picture?: string };

// نغيّر الرقم ده لو عملنا تعديل جوهري في mapHtml، عشان نجبر الـ WebView
// يعمل remount كامل بدل ما يحاول يحدّث المحتوى القديم في مكانه.
const MAP_TEMPLATE_VERSION = 'v4';

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

function timeAgo(iso?: string) {
  if (!iso) return '—';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.round(diff / 60000);
  if (min < 1) return i18n.t('justNow');
  if (min < 60) return `${min} ${i18n.t('minAgo')}`;
  const hr = Math.round(min / 60);
  return `${hr} ${i18n.t('hourAgo')}`;
}

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
  const [showPlaces, setShowPlaces] = useState(false);
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

  useEffect(() => {
    webRef.current?.injectJavaScript(`window.${showPlaces ? 'showPlaces' : 'hidePlaces'} && window.${showPlaces ? 'showPlaces' : 'hidePlaces'}(); true;`);
  }, [showPlaces]);

  if (!people.length) return <View style={s.empty}><Text style={s.muted}>{i18n.t('noPeople')}</Text></View>;

  const navigate = (p: HaEntity) => {
    const c = coord(p);
    if (Platform.OS === 'ios') {
      const label = encodeURIComponent(String(p.attributes.friendly_name ?? p.entity_id));
      void Linking.openURL(`maps://?daddr=${c.latitude},${c.longitude}&q=${label}`).catch(() =>
        Linking.openURL(`geo:${c.latitude},${c.longitude}?q=${c.latitude},${c.longitude}`),
      );
      return;
    }
    // geo: (بدون domain مرتبط بتطبيق افتراضي زي https links) بيخلي أندرويد
    // يعرض مربع اختيار التطبيق دايمًا بدل ما يفتح Google Maps تلقائيًا،
    // وصيغة بسيطة (إحداثيات بس، من غير label) بتضمن توافق أوسع مع
    // تطبيقات خرائط مختلفة بدل ما تتفسر غلط وتفتح خريطة فاضية
    void Linking.openURL(`geo:${c.latitude},${c.longitude}?q=${c.latitude},${c.longitude}`).catch(() =>
      Linking.openURL(`https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=17/${c.latitude}/${c.longitude}`),
    );
  };

  return (
    <View style={s.screen}>
      <WebView
        key={`${MAP_TEMPLATE_VERSION}:${points.length}:${home ? '1' : '0'}`}
        ref={webRef}
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        onMessage={e => {
          if (e.nativeEvent.data === 'MAP_HTML_V2_LOADED') return;
          if (e.nativeEvent.data.startsWith('TILE_TEST')) {
            const g = globalThis as unknown as { __familyHaLog?: (level: string, args: unknown[]) => void };
            g.__familyHaLog?.('trace', [e.nativeEvent.data]);
            return;
          }
          setSelected(people.find(p => p.entity_id === e.nativeEvent.data) ?? null);
        }}
        style={s.web}
      />

      <View style={s.topBar} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.avatarRow}>
          <View style={s.avatarPillCount}><Ionicons name="people" size={16} color={colors.primary} /></View>
          {people.map(p => {
            const isSelected = selected?.entity_id === p.entity_id;
            return (
              <Pressable key={p.entity_id} onPress={() => focusPerson(p)} style={[s.avatarWrap, isSelected && s.avatarWrapSelected]}>
                {avatars[p.entity_id] ? (
                  <Image source={{ uri: avatars[p.entity_id] }} style={s.avatarImg} />
                ) : (
                  <View style={[s.avatarImg, s.avatarFallback]}><Ionicons name="person" size={20} color={colors.primary} /></View>
                )}
              </Pressable>
            );
          })}
          <Pressable style={[s.placesToggle, showPlaces && s.placesToggleActive]} onPress={() => setShowPlaces(v => !v)}>
            <Ionicons name="storefront" size={16} color={showPlaces ? colors.black : colors.text} />
          </Pressable>
        </ScrollView>
      </View>

      {selected && me ? (
        <View style={s.sheet}>
          <View style={s.head}>
            {avatars[selected.entity_id] ? (
              <Image source={{ uri: avatars[selected.entity_id] }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}><Ionicons name="person" size={26} color={colors.primary} /></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{String(selected.attributes.friendly_name ?? selected.entity_id)}</Text>
              <Text style={s.muted}>{selected.state} · {timeAgo(selected.last_changed)} · {distance(home ? haversine(coord(selected), coord(home)) : undefined)}</Text>
            </View>
            <Pressable onPress={() => setSelected(null)} style={s.close}><Ionicons name="close" size={20} color={colors.text} /></Pressable>
          </View>
          <View style={s.details}>
            <Box label={i18n.t('battery')} value={battery(selected, states)} />
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
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0;background:#0b1220}.person{width:50px;height:50px;border:3px solid #51c7ff;border-radius:50%;background:#152238;overflow:hidden;box-shadow:0 4px 12px #0008}.person img{width:100%;height:100%;object-fit:cover}.initial{color:#fff;font:700 19px sans-serif;text-align:center;line-height:50px}.home{width:40px;height:40px;border-radius:50%;background:#27c499;color:#fff;text-align:center;line-height:40px;font-size:20px;border:3px solid #fff}.place{width:30px;height:30px;border-radius:9px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 8px #0007}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
const map=L.map('map',{zoomControl:true}).setView([${c[0]},${c[1]}],16);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors',errorTileUrl:''}).addTo(map);
const b=[];
const markers={};
${home ? `L.marker([${home.lat},${home.lng}],{icon:L.divIcon({className:'',html:'<div class="home">⌂</div>',iconSize:[46,46],iconAnchor:[23,23]})}).addTo(map).bindTooltip(\`${esc(home.name)}\`);b.push([${home.lat},${home.lng}]);` : ''}
${points
  .map(
    p => `(()=>{const i=L.divIcon({className:'',html:\`<div class="person">${p.picture ? `<img src="${p.picture}">` : `<div class="initial">${esc(p.name.slice(0, 1).toUpperCase())}</div>`}</div>\`,iconSize:[56,56],iconAnchor:[28,28]});const m=L.marker([${p.lat},${p.lng}],{icon:i}).addTo(map).bindTooltip(\`${esc(p.name)}\`).on('click',()=>window.ReactNativeWebView.postMessage('${p.id}'));markers['${p.id}']=m;b.push([${p.lat},${p.lng}]);})();`,
  )
  .join('')}
if(b.length>1)map.fitBounds(b,{padding:[60,60]});
window.focusPerson=function(id){const m=markers[id];if(!m)return;map.setView(m.getLatLng(),17,{animate:true});m.openTooltip();};

const placesLayer=L.layerGroup();
const placeIcons={restaurant:'🍽️',cafe:'☕',fast_food:'🍔',pharmacy:'💊',hospital:'🏥',bank:'🏦',fuel:'⛽',supermarket:'🛒',school:'🏫',bakery:'🥖',bar:'🍺'};
let placesTimer=null;
async function loadPlaces(){
  const bounds=map.getBounds();
  const bbox=[bounds.getSouth(),bounds.getWest(),bounds.getNorth(),bounds.getEast()].join(',');
  const query='[out:json][timeout:20];node["amenity"~"restaurant|cafe|fast_food|pharmacy|hospital|bank|fuel|supermarket|school|bakery|bar"]('+bbox+');out center 80;';
  try{
    const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:query});
    const data=await res.json();
    placesLayer.clearLayers();
    (data.elements||[]).forEach(el=>{
      const amenity=el.tags&&el.tags.amenity;
      const emoji=placeIcons[amenity]||'📍';
      const name=(el.tags&&el.tags.name)||amenity||'Place';
      const icon=L.divIcon({className:'',html:'<div class="place">'+emoji+'</div>',iconSize:[30,30],iconAnchor:[15,15]});
      L.marker([el.lat,el.lon],{icon}).addTo(placesLayer).bindTooltip(name);
    });
  }catch(e){}
}
window.showPlaces=function(){placesLayer.addTo(map);void loadPlaces();if(placesTimer)clearTimeout(placesTimer);map.on('moveend',onPlacesMoveEnd);};
window.hidePlaces=function(){placesLayer.clearLayers();map.removeLayer(placesLayer);map.off('moveend',onPlacesMoveEnd);};
function onPlacesMoveEnd(){if(placesTimer)clearTimeout(placesTimer);placesTimer=setTimeout(loadPlaces,600);}
window.ReactNativeWebView.postMessage('MAP_HTML_V2_LOADED');
fetch('https://tile.openstreetmap.org/1/0/0.png').then(r=>window.ReactNativeWebView.postMessage('TILE_TEST:'+r.status)).catch(e=>window.ReactNativeWebView.postMessage('TILE_TEST_FAILED:'+String(e)));
</script></body></html>`;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  web: { flex: 1, backgroundColor: colors.background },
  empty: { padding: 24 },
  muted: { color: colors.muted },
  topBar: { position: 'absolute', top: 14, left: 0, right: 0 },
  avatarRow: { paddingHorizontal: 14, gap: 9, alignItems: 'center' },
  avatarPillCount: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(16,24,38,.94)', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarWrap: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: 'rgba(16,24,38,.5)', padding: 1, backgroundColor: 'rgba(16,24,38,.94)' },
  avatarWrapSelected: { borderColor: colors.primary },
  avatarImg: { width: '100%', height: '100%', borderRadius: 20 },
  avatarFallback: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  placesToggle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(16,24,38,.94)', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  placesToggleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sheet: { position: 'absolute', left: 14, right: 14, bottom: 14, backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 16, elevation: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: { width: 58, height: 58, borderRadius: 29 },
  name: { color: colors.text, fontSize: 19, fontWeight: '800' },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  box: { width: '31%', backgroundColor: colors.surfaceElevated, borderRadius: 14, padding: 11 },
  boxLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  boxValue: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  navigate: { marginTop: 14, backgroundColor: colors.primary, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  navigateText: { color: colors.black, fontWeight: '900' },
});
