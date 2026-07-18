import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import RNFS from 'react-native-fs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { absoluteHaUrl, authHeaders } from '../../api/homeAssistant';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { requestLocationPermission, watchLiveLocation, type LiveLocation } from '../../native/liveLocation';
import { PressableScale } from '../../components/PressableScale';

type Props = { people: HaEntity[]; home?: HaEntity; states: HaEntity[]; selectedPersonId?: string; settings: ConnectionSettings };
type Point = { id: string; name: string; lat: number; lng: number; picture?: string };

// نغيّر الرقم ده لو عملنا تعديل جوهري في mapHtml، عشان نجبر الـ WebView
// يعمل remount كامل بدل ما يحاول يحدّث المحتوى القديم في مكانه.
const MAP_TEMPLATE_VERSION = 'v7-pin-fix';

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

function etaText(seconds: number) {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} ${i18n.t('min')}`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return `${h}${i18n.t('hourShort')} ${rem}${i18n.t('min')}`;
}

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
  const [routeInfo, setRouteInfo] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null);
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
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  useEffect(() => {
    let stopWatch: (() => void) | undefined;
    void requestLocationPermission().then(granted => {
      if (granted) stopWatch = watchLiveLocation(setLiveLocation);
    });
    return () => stopWatch?.();
  }, []);
  const myCoord = liveLocation ?? (me ? coord(me) : undefined);
  const selectedCoordKey = selected ? `${selected.attributes.latitude},${selected.attributes.longitude}` : undefined;
  useEffect(() => {
    if (!selected || !myCoord || selected.entity_id === me?.entity_id) {
      webRef.current?.injectJavaScript(`window.hideRoute && window.hideRoute(); true;`);
      setRouteInfo(null);
      return;
    }
    const target = coord(selected);
    if (!Number.isFinite(target.latitude) || !Number.isFinite(target.longitude)) return;
    webRef.current?.injectJavaScript(
      `window.showRoute && window.showRoute(${myCoord.longitude},${myCoord.latitude},${target.longitude},${target.latitude}); true;`,
    );
  }, [selected?.entity_id, selectedCoordKey, myCoord?.latitude, myCoord?.longitude]);
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
          if (e.nativeEvent.data.startsWith('ROUTE_INFO:')) {
            try {
              const info = JSON.parse(e.nativeEvent.data.slice('ROUTE_INFO:'.length)) as { distance: number; duration: number };
              setRouteInfo({ distanceMeters: info.distance, durationSeconds: info.duration });
            } catch { /* ignore */ }
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
              <PressableScale key={p.entity_id} onPress={() => focusPerson(p)} style={[s.avatarWrap, isSelected && s.avatarWrapSelected]}>
                {avatars[p.entity_id] ? (
                  <Image source={{ uri: avatars[p.entity_id] }} style={s.avatarImg} />
                ) : (
                  <View style={[s.avatarImg, s.avatarFallback]}><Ionicons name="person" size={20} color={colors.primary} /></View>
                )}
              </PressableScale>
            );
          })}
          <PressableScale style={[s.placesToggle, showPlaces && s.placesToggleActive]} onPress={() => setShowPlaces(v => !v)}>
            <Ionicons name="storefront" size={16} color={showPlaces ? colors.black : colors.text} />
          </PressableScale>
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
            <PressableScale onPress={() => setSelected(null)} style={s.close}><Ionicons name="close" size={20} color={colors.text} /></PressableScale>
          </View>
          <View style={s.details}>
            <Box label={i18n.t('battery')} value={battery(selected, states)} />
            <Box
              label={i18n.t('fromMe')}
              value={
                !myCoord
                  ? '—'
                  : me && selected.entity_id === me.entity_id
                  ? distance(0)
                  : routeInfo
                  ? distance(routeInfo.distanceMeters)
                  : distance(haversine(coord(selected), myCoord))
              }
            />
            {routeInfo && !(me && selected.entity_id === me.entity_id) ? (
              <Box label={i18n.t('eta')} value={etaText(routeInfo.durationSeconds)} />
            ) : (
              <Box label={i18n.t('locationAccuracy')} value={Number.isFinite(Number(selected.attributes.gps_accuracy)) ? distance(Number(selected.attributes.gps_accuracy)) : '—'} />
            )}
          </View>
          <PressableScale style={s.navigate} onPress={() => navigate(selected)}>
            <Ionicons name="navigate" size={20} color={colors.black} />
            <Text style={s.navigateText}>{i18n.t('navigateToPerson')}</Text>
          </PressableScale>
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
  // MapLibre GL بدل Leaflet - خريطة ثلاثية الأبعاد حقيقية (مباني
  // بارتفاعات، إمالة ودوران بإصبعين) من غير أي مفتاح API مدفوع.
  // OpenFreeMap بيوفّر بلاطات متجهية (vector tiles) مجانية بالكامل
  // ومن غير حد استخدام، بديل مجاني حقيقي لـ Mapbox.
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"><style>html,body,#map{height:100%;margin:0;background:#0b1220}.pin{width:44px;height:56px;position:relative}.pin-tail{position:absolute;bottom:6px;left:50%;width:16px;height:16px;background:#3d5fef;transform:translateX(-50%) rotate(45deg);border-radius:0 0 4px 0;box-shadow:1px 1px 3px rgba(0,0,0,.3)}.pin-photo{position:absolute;top:0;left:2px;width:40px;height:40px;border-radius:50%;overflow:hidden;border:3px solid #3d5fef;background:#152238;box-shadow:0 2px 6px rgba(0,0,0,.35);z-index:1;display:flex;align-items:center;justify-content:center}.pin-photo img{width:100%;height:100%;object-fit:cover}.pin-initial{color:#fff;font:700 16px sans-serif}.home{width:40px;height:40px;border-radius:50%;background:#27c499;color:#fff;text-align:center;line-height:40px;font-size:20px;border:3px solid #fff}.place{width:30px;height:30px;border-radius:9px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 8px #0007}.maplibregl-popup-content{background:#152238;color:#fff;font:600 13px sans-serif;border-radius:8px}.maplibregl-popup-tip{border-top-color:#152238 !important;border-bottom-color:#152238 !important}</style></head><body><div id="map"></div><script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script><script>
const map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[${c[1]},${c[0]}],zoom:16,pitch:55,bearing:-10,antialias:true,attributionControl:false});
map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-right');
map.addControl(new maplibregl.AttributionControl({compact:true}));
const b=new maplibregl.LngLatBounds();
const markers={};
map.on('load',()=>{
map.addLayer({id:'housenumbers',type:'symbol',source:'openmaptiles','source-layer':'housenumber',minzoom:17,layout:{'text-field':['get','housenumber'],'text-size':10,'text-font':['Noto Sans Regular']},paint:{'text-color':'#3a4a5c','text-halo-color':'#ffffff','text-halo-width':1.3}});
${home ? `{const el=document.createElement('div');el.innerHTML='<div class="home">⌂</div>';new maplibregl.Marker({element:el.firstChild}).setLngLat([${home.lng},${home.lat}]).setPopup(new maplibregl.Popup({offset:24,closeButton:false}).setText(\`${esc(home.name)}\`)).addTo(map);b.extend([${home.lng},${home.lat}]);}` : ''}
${points
  .map(
    p => `{const el=document.createElement('div');el.innerHTML=\`<div class="pin"><div class="pin-tail"></div><div class="pin-photo">${p.picture ? `<img src="${p.picture}">` : `<div class="pin-initial">${esc(p.name.slice(0, 1).toUpperCase())}</div>`}</div></div>\`;const node=el.firstChild;node.addEventListener('click',()=>window.ReactNativeWebView.postMessage('${p.id}'));const m=new maplibregl.Marker({element:node,anchor:'bottom'}).setLngLat([${p.lng},${p.lat}]).setPopup(new maplibregl.Popup({offset:36,closeButton:false}).setText(\`${esc(p.name)}\`)).addTo(map);markers['${p.id}']=m;b.extend([${p.lng},${p.lat}]);}`,
  )
  .join('')}
if(!b.isEmpty())map.fitBounds(b,{padding:70,maxZoom:17,duration:0});
});
window.focusPerson=function(id){const m=markers[id];if(!m)return;map.flyTo({center:m.getLngLat(),zoom:17,pitch:55,duration:800});m.togglePopup();};

let routeAbort=null;
window.showRoute=async function(fromLng,fromLat,toLng,toLat){
  if(routeAbort)routeAbort.abort();
  routeAbort=new AbortController();
  try{
    const url='https://router.project-osrm.org/route/v1/driving/'+fromLng+','+fromLat+';'+toLng+','+toLat+'?overview=full&geometries=geojson';
    const res=await fetch(url,{signal:routeAbort.signal});
    const data=await res.json();
    const route=data.routes&&data.routes[0];
    if(!route)return;
    const geojson={type:'Feature',geometry:route.geometry};
    if(map.getSource('route')){map.getSource('route').setData(geojson);}
    else{
      map.addSource('route',{type:'geojson',data:geojson});
      map.addLayer({id:'route-casing',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#0a2a4d','line-width':9}});
      map.addLayer({id:'route-line',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#5c8dff','line-width':5}});
    }
    window.ReactNativeWebView.postMessage('ROUTE_INFO:'+JSON.stringify({distance:route.distance,duration:route.duration}));
  }catch(e){}
};
window.hideRoute=function(){
  if(routeAbort)routeAbort.abort();
  ['route-casing','route-line'].forEach(id=>{if(map.getLayer(id))map.removeLayer(id);});
  if(map.getSource('route'))map.removeSource('route');
};

const placeIcons={restaurant:'🍽️',cafe:'☕',fast_food:'🍔',pharmacy:'💊',hospital:'🏥',bank:'🏦',fuel:'⛽',supermarket:'🛒',school:'🏫',bakery:'🥖',bar:'🍺'};
let placeMarkers=[];
let placesTimer=null;
function clearPlaces(){placeMarkers.forEach(m=>m.remove());placeMarkers=[];}
async function loadPlaces(){
  const bounds=map.getBounds();
  const bbox=[bounds.getSouth(),bounds.getWest(),bounds.getNorth(),bounds.getEast()].join(',');
  const query='[out:json][timeout:20];node["amenity"~"restaurant|cafe|fast_food|pharmacy|hospital|bank|fuel|supermarket|school|bakery|bar"]('+bbox+');out center 80;';
  try{
    const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:query});
    const data=await res.json();
    clearPlaces();
    (data.elements||[]).forEach(el=>{
      const amenity=el.tags&&el.tags.amenity;
      const emoji=placeIcons[amenity]||'📍';
      const name=(el.tags&&el.tags.name)||amenity||'Place';
      const el2=document.createElement('div');
      el2.innerHTML='<div class="place">'+emoji+'</div>';
      const m=new maplibregl.Marker({element:el2.firstChild}).setLngLat([el.lon,el.lat]).setPopup(new maplibregl.Popup({offset:18,closeButton:false}).setText(name)).addTo(map);
      placeMarkers.push(m);
    });
  }catch(e){}
}
window.showPlaces=function(){void loadPlaces();if(placesTimer)clearTimeout(placesTimer);map.on('moveend',onPlacesMoveEnd);};
window.hidePlaces=function(){clearPlaces();map.off('moveend',onPlacesMoveEnd);};
function onPlacesMoveEnd(){if(placesTimer)clearTimeout(placesTimer);placesTimer=setTimeout(loadPlaces,600);}
window.ReactNativeWebView.postMessage('MAP_HTML_V2_LOADED');
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
