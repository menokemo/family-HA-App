// قالب خريطة الويب (MapLibre GL داخل WebView).
// مفصول عن PeopleMapWeb.tsx عشان الملف ما يكبرش؛ mapHtml بتبني صفحة HTML كاملة كنص.
import type { Palette } from '../../theme';

export type Point = { id: string; name: string; lat: number; lng: number; color: string; picture?: string; heading?: number; moving?: boolean };
export type Zone = { id: string; name: string; lat: number; lng: number; radius: number };

export function mapHtml(points: Point[], zones: Zone[], mode: 'light' | 'dark', c: Palette) {
  const all = [...points.map(p => [p.lat, p.lng]), ...zones.map(z => [z.lat, z.lng])];
  const center = all.find(x => Number.isFinite(x[0]) && Number.isFinite(x[1])) ?? [52.1, 5.1];
  const style = mode === 'dark' ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';
  const popupBg = mode === 'dark' ? '#182535' : '#ffffff';
  const popupText = mode === 'dark' ? '#F5F8FC' : '#0E1620';
  const pts = points.map(p => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, color: p.color, picture: p.picture, heading: p.heading, moving: p.moving }));
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"><style>
html,body,#map{height:100%;margin:0;background:${c.background}}
.pin{width:44px;height:56px;position:relative}
.pin-tail{position:absolute;bottom:6px;left:50%;width:16px;height:16px;transform:translateX(-50%) rotate(45deg);border-radius:0 0 4px 0;box-shadow:1px 1px 3px rgba(0,0,0,.3)}
.pin-photo{position:absolute;top:0;left:2px;width:40px;height:40px;border-radius:50%;overflow:hidden;border:3px solid #3d5fef;background:${c.surfaceElevated};box-shadow:0 2px 7px rgba(0,0,0,.35);z-index:1;display:flex;align-items:center;justify-content:center}
.pin-photo img{width:100%;height:100%;object-fit:cover}
.pin-initial{color:#fff;font:700 16px sans-serif}
.pin-arrow{position:absolute;top:-11px;left:50%;margin-left:-6px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:11px solid #2a7bff;filter:drop-shadow(0 1px 1px rgba(0,0,0,.45));display:none}
.me-dot{width:20px;height:20px;border-radius:50%;background:#2a7bff;border:3px solid #fff;box-shadow:0 0 0 4px rgba(42,123,255,.3),0 1px 4px rgba(0,0,0,.4)}
.play-dot{width:16px;height:16px;border-radius:50%;background:#ffb020;border:3px solid #fff;box-shadow:0 0 0 3px rgba(255,176,32,.35),0 1px 3px rgba(0,0,0,.4)}
.hazard{width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:21px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.55))}
.zone-chip{padding:3px 9px;border-radius:12px;background:${popupBg};color:${popupText};font:700 11px sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.25);white-space:nowrap;opacity:.95}
.place{width:30px;height:30px;border-radius:9px;background:${popupBg};display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.maplibregl-popup-content{background:${popupBg};color:${popupText};font:600 13px sans-serif;border-radius:9px;box-shadow:0 2px 10px rgba(0,0,0,.3)}
.maplibregl-popup-tip{border-top-color:${popupBg} !important;border-bottom-color:${popupBg} !important}
</style></head><body><div id="map"></div><script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script><script>
window.onerror=function(msg,src,line,col){try{window.ReactNativeWebView.postMessage('JS_ERROR:'+msg+' @'+line+':'+col);}catch(e){}};
const map=new maplibregl.Map({container:'map',style:'${style}',center:[${center[1]},${center[0]}],zoom:15,pitch:0,bearing:0,antialias:true,attributionControl:false});
map.on('error',function(e){try{window.ReactNativeWebView.postMessage('MAP_ERROR:'+(e&&e.error?String(e.error.message||e.error):JSON.stringify(e)));}catch(x){}});
map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'bottom-right');
map.addControl(new maplibregl.AttributionControl({compact:true}));
const b=new maplibregl.LngLatBounds();
const markers={};
let meMarker=null;
window.__hazards=[];
const POINTS=${JSON.stringify(pts)};
const ZONES=${JSON.stringify(zones)};

function circlePoly(lng,lat,radiusM){
  const pts=[];const R=6378137;const d=(radiusM||100)/R;const latR=lat*Math.PI/180;const lngR=lng*Math.PI/180;
  for(let i=0;i<=64;i++){const brng=i*2*Math.PI/64;const lat2=Math.asin(Math.sin(latR)*Math.cos(d)+Math.cos(latR)*Math.sin(d)*Math.cos(brng));const lng2=lngR+Math.atan2(Math.sin(brng)*Math.sin(d)*Math.cos(latR),Math.cos(d)-Math.sin(latR)*Math.sin(lat2));pts.push([lng2*180/Math.PI,lat2*180/Math.PI]);}
  return {type:'Feature',geometry:{type:'Polygon',coordinates:[pts]}};
}
function applyArrow(el,p){
  const a=el&&el.querySelector('.pin-arrow');
  if(!a)return;
  if(p.moving&&typeof p.heading==='number'){a.style.display='block';a.style.transform='rotate('+p.heading+'deg)';}
  else{a.style.display='none';}
}
function makePersonEl(p){
  const el=document.createElement('div');
  el.innerHTML='<div class="pin"><div class="pin-arrow"></div><div class="pin-tail" style="background:'+p.color+'"></div><div class="pin-photo" data-pic="'+(p.picture||'')+'" style="border-color:'+p.color+'">'+(p.picture?('<img src="'+p.picture+'">'):('<div class="pin-initial">'+(p.name?p.name.slice(0,1).toUpperCase():'?')+'</div>'))+'</div></div>';
  const node=el.firstChild;
  node.addEventListener('click',function(){try{window.ReactNativeWebView.postMessage(p.id);}catch(e){}});
  applyArrow(node,p);
  return node;
}
function addPerson(p){
  if(!isFinite(p.lng)||!isFinite(p.lat))return;
  // لو فيه علامة قديمة لنفس الشخص (مثلاً من سباق توقيت بين load و
  // updateMarkers) نشيلها الأول عشان ما يحصلش تكرار على الخريطة.
  if(markers[p.id]){markers[p.id].remove();delete markers[p.id];}
  const m=new maplibregl.Marker({element:makePersonEl(p),anchor:'bottom'}).setLngLat([p.lng,p.lat]).setPopup(new maplibregl.Popup({offset:36,closeButton:false}).setText(p.name)).addTo(map);
  markers[p.id]=m;
}

map.on('load',function(){
  try{map.addLayer({id:'housenumbers',type:'symbol',source:'openmaptiles','source-layer':'housenumber',minzoom:17,layout:{'text-field':['get','housenumber'],'text-size':10,'text-font':['Noto Sans Regular']},paint:{'text-color':'${c.muted}','text-halo-color':'${popupBg}','text-halo-width':1.3}});}catch(e){window.ReactNativeWebView.postMessage('HOUSENUM_ERR:'+String(e));}

  try{
    map.addSource('satellite-src',{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,attribution:'Esri'});
    const firstSymbol=map.getStyle().layers.find(function(l){return l.type==='symbol'||l.type==='line'||l.type==='fill-extrusion';});
    map.addLayer({id:'satellite-layer',type:'raster',source:'satellite-src',layout:{visibility:'none'},paint:{'raster-opacity':1}},firstSymbol?firstSymbol.id:undefined);
  }catch(e){window.ReactNativeWebView.postMessage('SAT_ERR:'+String(e));}

  try{
    const feats=ZONES.filter(function(z){return isFinite(z.lng)&&isFinite(z.lat);}).map(function(z){return circlePoly(z.lng,z.lat,z.radius);});
    if(feats.length){
      map.addSource('zones',{type:'geojson',data:{type:'FeatureCollection',features:feats}});
      map.addLayer({id:'zones-fill',type:'fill',source:'zones',paint:{'fill-color':'${c.primary}','fill-opacity':0.12}});
      map.addLayer({id:'zones-line',type:'line',source:'zones',paint:{'line-color':'${c.primary}','line-opacity':0.55,'line-width':2,'line-dasharray':[2,2]}});
    }
    ZONES.forEach(function(z){if(!isFinite(z.lng)||!isFinite(z.lat))return;const el=document.createElement('div');el.className='zone-chip';el.textContent=(z.id==='zone.home'?'⌂ ':'')+z.name;new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([z.lng,z.lat]).addTo(map);b.extend([z.lng,z.lat]);});
  }catch(e){window.ReactNativeWebView.postMessage('ZONE_ERR:'+String(e));}

  window.toggleSatellite=function(on){if(map.getLayer('satellite-layer'))map.setLayoutProperty('satellite-layer','visibility',on?'visible':'none');};

  POINTS.forEach(function(p){addPerson(p);if(isFinite(p.lng)&&isFinite(p.lat))b.extend([p.lng,p.lat]);});
  if(!b.isEmpty())map.fitBounds(b,{padding:{top:90,bottom:200,left:50,right:50},maxZoom:16,duration:0});
});

window.focusPerson=function(id){const m=markers[id];if(!m)return;map.flyTo({center:m.getLngLat(),zoom:16.5,duration:800});m.togglePopup();};
window.setMe=function(lng,lat){
  if(!isFinite(lng)||!isFinite(lat)){if(meMarker){meMarker.remove();meMarker=null;}return;}
  if(meMarker){meMarker.setLngLat([lng,lat]);return;}
  const el=document.createElement('div');el.className='me-dot';
  meMarker=new maplibregl.Marker({element:el}).setLngLat([lng,lat]).addTo(map);
};
window.recenter=function(lng,lat){if(isFinite(lng)&&isFinite(lat))map.flyTo({center:[lng,lat],zoom:16,duration:700});};
window.fitAll=function(){
  const bb=new maplibregl.LngLatBounds();
  Object.keys(markers).forEach(function(id){bb.extend(markers[id].getLngLat());});
  if(meMarker)bb.extend(meMarker.getLngLat());
  if(!bb.isEmpty())map.fitBounds(bb,{padding:{top:90,bottom:200,left:50,right:50},maxZoom:16,duration:600});
};

window.updateMarkers=function(pointsJson){
  const pts=JSON.parse(pointsJson);const seen={};
  pts.forEach(function(p){
    seen[p.id]=true;const m=markers[p.id];
    if(m){
      if(isFinite(p.lng)&&isFinite(p.lat))m.setLngLat([p.lng,p.lat]);
      const el=m.getElement();const photoEl=el&&el.querySelector('.pin-photo');
      if(photoEl&&photoEl.getAttribute('data-pic')!==(p.picture||'')){photoEl.setAttribute('data-pic',p.picture||'');photoEl.innerHTML=p.picture?('<img src="'+p.picture+'">'):('<div class="pin-initial">'+(p.name?p.name.slice(0,1).toUpperCase():'?')+'</div>');}
      applyArrow(el,p);
    }else{addPerson(p);}
  });
  Object.keys(markers).forEach(function(id){if(!seen[id]){markers[id].remove();delete markers[id];}});
};

window.setHazards=function(json,show){
  (window.__hazards||[]).forEach(function(m){m.remove();});window.__hazards=[];
  if(!show)return;
  var list;try{list=JSON.parse(json);}catch(e){return;}
  list.forEach(function(h){
    if(!isFinite(h.lng)||!isFinite(h.lat))return;
    const el=document.createElement('div');el.innerHTML='<div class="hazard">⚠️</div>';
    const txt=h.name+(isFinite(h.distanceKm)?(' · '+Math.round(h.distanceKm)+' km'):'');
    const m=new maplibregl.Marker({element:el.firstChild}).setLngLat([h.lng,h.lat]).setPopup(new maplibregl.Popup({offset:16,closeButton:false}).setText(txt)).addTo(map);
    window.__hazards.push(m);
  });
};

let routeAbort=null;
window.showRoute=async function(fromLng,fromLat,toLng,toLat,mode){
  if(routeAbort)routeAbort.abort();
  routeAbort=new AbortController();
  const profile=(mode==='walking'||mode==='cycling')?mode:'driving';
  try{
    const url='https://router.project-osrm.org/route/v1/'+profile+'/'+fromLng+','+fromLat+';'+toLng+','+toLat+'?overview=full&geometries=geojson';
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
  ['route-casing','route-line'].forEach(function(id){if(map.getLayer(id))map.removeLayer(id);});
  if(map.getSource('route'))map.removeSource('route');
};

let playMarker=null;let playTimer=null;
window.showTimeline=function(pointsJson){
  const pts=JSON.parse(pointsJson);
  if(pts.length<2)return;
  window.__timelineCoords=pts.map(function(p){return [p.lng,p.lat];});
  const geojson={type:'Feature',geometry:{type:'LineString',coordinates:window.__timelineCoords}};
  if(map.getSource('timeline')){map.getSource('timeline').setData(geojson);}
  else{
    map.addSource('timeline',{type:'geojson',data:geojson});
    map.addLayer({id:'timeline-line',type:'line',source:'timeline',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffb020','line-width':4,'line-dasharray':[0.3,1.6]}});
  }
  const b2=new maplibregl.LngLatBounds();
  window.__timelineCoords.forEach(function(ci){b2.extend(ci);});
  map.fitBounds(b2,{padding:70,maxZoom:16,duration:600});
};
window.hideTimeline=function(){
  if(playTimer){clearInterval(playTimer);playTimer=null;}
  if(playMarker){playMarker.remove();playMarker=null;}
  if(map.getLayer('timeline-line'))map.removeLayer('timeline-line');
  if(map.getSource('timeline'))map.removeSource('timeline');
};
window.playTimeline=function(){
  const coords=window.__timelineCoords;
  if(!coords||coords.length<2)return;
  if(playTimer){clearInterval(playTimer);playTimer=null;}
  if(!playMarker){const el=document.createElement('div');el.className='play-dot';playMarker=new maplibregl.Marker({element:el}).setLngLat(coords[0]).addTo(map);}
  let i=0;
  playMarker.setLngLat(coords[0]);
  playTimer=setInterval(function(){
    i++;
    if(i>=coords.length){clearInterval(playTimer);playTimer=null;return;}
    playMarker.setLngLat(coords[i]);
    map.easeTo({center:coords[i],duration:180});
  },Math.max(90,Math.min(400,6000/coords.length)));
};

const placeIcons={restaurant:'🍽️',cafe:'☕',fast_food:'🍔',pharmacy:'💊',hospital:'🏥',bank:'🏦',fuel:'⛽',supermarket:'🛒',school:'🏫',bakery:'🥖',bar:'🍺'};
let placeMarkers=[];
let placesTimer=null;
function clearPlaces(){placeMarkers.forEach(function(m){m.remove();});placeMarkers=[];}
async function loadPlaces(){
  const bounds=map.getBounds();
  const bbox=[bounds.getSouth(),bounds.getWest(),bounds.getNorth(),bounds.getEast()].join(',');
  const query='[out:json][timeout:20];node["amenity"~"restaurant|cafe|fast_food|pharmacy|hospital|bank|fuel|supermarket|school|bakery|bar"]('+bbox+');out center 80;';
  try{
    const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:query});
    const data=await res.json();
    clearPlaces();
    (data.elements||[]).forEach(function(el){
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

