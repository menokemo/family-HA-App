import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, PermissionsAndroid, Platform, StyleSheet, Text, View } from 'react-native';
import RNFS from 'react-native-fs';
import Orientation from 'react-native-orientation-locker';
import { PressableScale } from '../../components/PressableScale';
import { saveImageToGallery } from '../../native/AlarmMonitor';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { authHeaders, cameraSnapshotUrl, cameraHasPtz, ptzMove, ptzStop, type PtzDirection, type RegistryEntry } from '../../api/homeAssistant';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { WebRtcCameraPlayer } from './WebRtcCameraPlayer';
import Ionicons from 'react-native-vector-icons/Ionicons';

type CameraPlayerProps = { camera: HaEntity; settings: ConnectionSettings; states: HaEntity[]; registry: RegistryEntry[]; title: string; onClose: () => void };
type Mode = 'webrtc' | 'snapshot';

function PtzPad({ camera, settings, states, registry }: { camera: HaEntity; settings: ConnectionSettings; states: HaEntity[]; registry: RegistryEntry[] }) {
  const busy = useRef(false);
  const start = (direction: PtzDirection) => { busy.current = true; void ptzMove(settings, registry, states, camera.entity_id, direction); };
  const stop = () => { if (busy.current) { busy.current = false; void ptzStop(settings, registry, states, camera.entity_id); } };
  const Btn = ({ direction, icon }: { direction: PtzDirection; icon: string }) => (
    <PressableScale style={ptz.btn} onPressIn={() => start(direction)} onPressOut={stop}>
      <Ionicons name={icon} size={20} color="#fff" />
    </PressableScale>
  );
  return (
    <View style={ptz.wrap}>
      <View style={ptz.row}>
        <View style={ptz.spacer} />
        <Btn direction="up" icon="chevron-up" />
        <View style={ptz.spacer} />
      </View>
      <View style={ptz.row}>
        <Btn direction="left" icon="chevron-back" />
        <View style={ptz.center}><Ionicons name="move" size={16} color="rgba(255,255,255,.5)" /></View>
        <Btn direction="right" icon="chevron-forward" />
      </View>
      <View style={ptz.row}>
        <Btn direction="zoomOut" icon="remove" />
        <Btn direction="down" icon="chevron-down" />
        <Btn direction="zoomIn" icon="add" />
      </View>
    </View>
  );
}

const ZOOM_LEVEL = 2.5;

/** تكبير وتنقل بإصبع واحد بس (زوم بإصبعين مش موثوق مع فيديو WebRTC
 * على أندرويد - SurfaceView مش بيوصّل اللمسة التانية للتطبيق خالص،
 * اتأكد بدليل مباشر). دبل تاب يكبّر/يرجّع لحجمه الطبيعي، وسحب بإصبع
 * واحد بينقّل الصورة وانت مكبّر، وزرار +/- للتحكم الدقيق. */
function useZoomPan(onTap: () => void) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const state = useRef({ zoomed: false, baseX: 0, baseY: 0, moved: 0, lastTapAt: 0 });
  const [zoomed, setZoomed] = useState(false);

  const animateTo = (targetScale: number) => {
    state.current.zoomed = targetScale > 1;
    setZoomed(state.current.zoomed);
    Animated.parallel([
      Animated.spring(scale, { toValue: targetScale, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start(() => { state.current.baseX = 0; state.current.baseY = 0; });
  };

  const zoomIn = () => animateTo(ZOOM_LEVEL);
  const zoomOut = () => animateTo(1);
  const toggleZoom = () => animateTo(state.current.zoomed ? 1 : ZOOM_LEVEL);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => { state.current.moved = 0; },
      onPanResponderMove: (_e, gesture) => {
        state.current.moved = Math.max(state.current.moved, Math.abs(gesture.dx) + Math.abs(gesture.dy));
        if (state.current.zoomed) {
          translateX.setValue(state.current.baseX + gesture.dx);
          translateY.setValue(state.current.baseY + gesture.dy);
        }
      },
      onPanResponderRelease: () => {
        if (state.current.moved < 8) {
          const now = Date.now();
          if (now - state.current.lastTapAt < 300) { toggleZoom(); state.current.lastTapAt = 0; }
          else { onTap(); state.current.lastTapAt = now; }
        } else if (state.current.zoomed) {
          translateX.stopAnimation(v => { state.current.baseX = v; });
          translateY.stopAnimation(v => { state.current.baseY = v; });
        }
      },
    }),
  ).current;

  return { scale, translateX, translateY, panHandlers: responder.panHandlers, zoomed, zoomIn, zoomOut };
}

export function CameraPlayer({ camera, settings, states, registry, title, onClose }: CameraPlayerProps) {
  const [mode, setMode] = useState<Mode>('webrtc');
  const [error, setError] = useState<string>();
  const [nonce, setNonce] = useState(Date.now());
  const [chromeVisible, setChromeVisible] = useState(true);
  const [showPtz, setShowPtz] = useState(false);
  const hasPtz = useMemo(() => cameraHasPtz(registry, states, camera.entity_id), [registry, states, camera.entity_id]);
  const [isLandscape, setIsLandscape] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [muted, setMuted] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string>();
  const savingRef = useRef(false);
  // زيادة ده بتعيد تركيب بلاير الـWebRTC = إعادة اتصال فعلية لزرار التحديث في
  // البث المباشر (قبل كده كان بيعمل setMode('webrtc') وهو webrtc أصلاً = مفيش حاجة).
  const [reloadLive, setReloadLive] = useState(0);
  const { scale, translateX, translateY, panHandlers, zoomed, zoomIn, zoomOut } = useZoomPan(() => setChromeVisible(v => !v));
  const token = typeof camera.attributes.access_token === 'string' ? camera.attributes.access_token : undefined;
  const snapshotUrl = useMemo(
    () => cameraSnapshotUrl(settings, camera.entity_id, nonce, token),
    [settings.baseUrl, settings.token, camera.entity_id, nonce, token],
  );

  useEffect(() => {
    // التدوير هنا اختياري بزرار المستخدم (toggleLandscape) بس - مش
    // تلقائي عند فتح الكاميرا. هنا بس بنضمن الرجوع لوضع عمودي لو
    // المستخدم قفل الشاشة وهو مكبّر أفقيًا.
    return () => Orientation.lockToPortrait();
  }, []);

  const toggleLandscape = () => {
    if (isLandscape) Orientation.lockToPortrait();
    else Orientation.lockToLandscape();
    setIsLandscape(v => !v);
  };

  const closeAndUnlock = () => {
    Orientation.lockToPortrait();
    onClose();
  };

  // حفظ لقطة للمعرض. بنجيب لقطة طازة من HA (شغّالة في الوضعين، بث مباشر أو لقطة —
  // سحب إطار من فيديو WebRTC مش موثوق)، ننزّلها للكاش، وندّيها للـMediaStore النيتف.
  const saveSnapshot = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveMsg(i18n.t('saving'));
    const path = `${RNFS.CachesDirectoryPath}/snap-${Date.now()}.jpg`;
    try {
      // أندرويد ≤ 9 محتاج إذن تخزين؛ من 10 MediaStore مش محتاج.
      if (Platform.OS === 'android' && (Platform.Version as number) < 29) {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) { setSaveMsg(i18n.t('snapshotSaveFailed')); return; }
      }
      const url = cameraSnapshotUrl(settings, camera.entity_id, Date.now(), token);
      const res = await RNFS.downloadFile({ fromUrl: url, toFile: path, headers: token ? {} : authHeaders(settings) }).promise;
      const ok = res.statusCode >= 200 && res.statusCode < 300 && (await saveImageToGallery(path, `SecureFamily_${Date.now()}.jpg`));
      setSaveMsg(i18n.t(ok ? 'snapshotSaved' : 'snapshotSaveFailed'));
    } catch {
      setSaveMsg(i18n.t('snapshotSaveFailed'));
    } finally {
      void RNFS.unlink(path).catch(() => undefined);
      savingRef.current = false;
      setTimeout(() => setSaveMsg(undefined), 2500);
    }
  };

  const video = mode === 'webrtc' ? (
    <WebRtcCameraPlayer
      key={reloadLive}
      camera={camera}
      settings={settings}
      onUnavailable={reason => { setError(reason); setMode('snapshot'); }}
      onAudioChange={setHasAudio}
      muted={muted}
    />
  ) : (
    <Image
      source={{ uri: snapshotUrl, headers: token ? undefined : authHeaders(settings) }}
      style={styles.media}
      resizeMode="contain"
      onError={() => setError(i18n.t('snapshotFailed'))}
    />
  );

  return <View style={styles.container}>
    <View style={styles.mediaWrap}>
      <Animated.View style={{ width: '100%', height: '100%', transform: [{ scale }, { translateX }, { translateY }] }}>
        {video}
      </Animated.View>
      <View style={StyleSheet.absoluteFill} {...panHandlers} />
    </View>

    {chromeVisible ? (
      <>
        <View style={styles.topBar}>
          <PressableScale style={styles.iconBtn} onPress={closeAndUnlock} hitSlop={10}>
            <Ionicons name="close" size={19} color="#fff" />
          </PressableScale>
          <View style={styles.header}>
            <View style={[styles.liveDot, { backgroundColor: mode === 'webrtc' ? colors.danger : colors.warning }]} />
            <Text style={styles.badge} numberOfLines={1}>{title}</Text>
          </View>
          <View style={{ flex: 1 }} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saveMsg ? <Text style={[styles.error, styles.saveMsg]}>{saveMsg}</Text> : null}

        {/* كل أزرار التحكّم في فوتر واحد مدوّر بأيقونات. الأزرار المشروطة (كتم
            الصوت، PTZ) بتظهر وتختفي، والباقي ثابت. الأيقونة بتتلوّن بلون أساسي
            لما تكون شغّالة (مكبّر، أفقي، PTZ مفتوح). */}
        <View style={styles.footer}>
          {mode === 'webrtc' && hasAudio ? (
            <PressableScale style={[styles.fBtn, muted && styles.fBtnActive]} onPress={() => setMuted(m => !m)}>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
            </PressableScale>
          ) : null}
          <PressableScale style={styles.fBtn} onPress={saveSnapshot}>
            <Ionicons name="download-outline" size={20} color="#fff" />
          </PressableScale>
          {hasPtz ? (
            <PressableScale style={[styles.fBtn, showPtz && styles.fBtnActive]} onPress={() => setShowPtz(v => !v)}>
              <Ionicons name="game-controller-outline" size={20} color="#fff" />
            </PressableScale>
          ) : null}
          <PressableScale style={styles.fBtn} onPress={zoomOut}>
            <Ionicons name="remove" size={20} color="#fff" />
          </PressableScale>
          <PressableScale style={[styles.fBtn, zoomed && styles.fBtnActive]} onPress={zoomIn}>
            <Ionicons name="add" size={20} color="#fff" />
          </PressableScale>
          <PressableScale style={[styles.fBtn, isLandscape && styles.fBtnActive]} onPress={toggleLandscape}>
            <Ionicons name="phone-landscape-outline" size={20} color="#fff" />
          </PressableScale>
          <PressableScale style={styles.fBtn} onPress={() => { setError(undefined); setMode(mode === 'webrtc' ? 'snapshot' : 'webrtc'); }}>
            <Ionicons name={mode === 'webrtc' ? 'image-outline' : 'videocam-outline'} size={20} color="#fff" />
          </PressableScale>
          <PressableScale style={styles.fBtn} onPress={() => { setError(undefined); if (mode === 'snapshot') setNonce(Date.now()); else setReloadLive(n => n + 1); }}>
            <Ionicons name="refresh" size={20} color="#fff" />
          </PressableScale>
        </View>
      </>
    ) : null}

    {showPtz && hasPtz ? <PtzPad camera={camera} settings={settings} states={states} registry={registry} /> : null}
  </View>;
}

const ptz = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 90, right: 14, backgroundColor: 'rgba(0,0,0,.5)', borderRadius: 18, padding: 8, gap: 6 },
  row: { flexDirection: 'row', gap: 6 },
  btn: { width: 42, height: 42, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.16)', alignItems: 'center', justifyContent: 'center' },
  spacer: { width: 42, height: 42 },
  center: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  mediaWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  media: { width: '100%', height: '100%' },
  topBar: { position: 'absolute', zIndex: 2, top: 14, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  header: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,.58)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  badge: { color: '#fff', fontSize: 11, fontWeight: '700', flexShrink: 1 },
  iconBtn: { width: 32, height: 32, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  error: { position: 'absolute', bottom: 96, alignSelf: 'center', color: colors.warning, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,.7)', borderRadius: 12 },
  saveMsg: { bottom: 150, color: '#fff' },
  footer: { position: 'absolute', bottom: 24, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: 'rgba(0,0,0,.62)', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 6 },
  fBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fBtnActive: { backgroundColor: colors.primary },
});
