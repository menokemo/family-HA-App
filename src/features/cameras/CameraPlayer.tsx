import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, ScrollView, StyleSheet, Text, View } from 'react-native';
import Orientation from 'react-native-orientation-locker';
import { PressableScale } from '../../components/PressableScale';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { authHeaders, cameraSnapshotUrl, ptzMove, ptzStop, type PtzDirection } from '../../api/homeAssistant';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { WebRtcCameraPlayer } from './WebRtcCameraPlayer';
import Ionicons from 'react-native-vector-icons/Ionicons';

type CameraPlayerProps = { camera: HaEntity; settings: ConnectionSettings; states: HaEntity[]; title: string; onClose: () => void };
type Mode = 'webrtc' | 'snapshot';

function PtzPad({ camera, settings, states }: { camera: HaEntity; settings: ConnectionSettings; states: HaEntity[] }) {
  const busy = useRef(false);
  const start = (direction: PtzDirection) => { busy.current = true; void ptzMove(settings, states, camera.entity_id, direction); };
  const stop = () => { if (busy.current) { busy.current = false; void ptzStop(settings, states, camera.entity_id); } };
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

export function CameraPlayer({ camera, settings, states, title, onClose }: CameraPlayerProps) {
  const [mode, setMode] = useState<Mode>('webrtc');
  const [error, setError] = useState<string>();
  const [nonce, setNonce] = useState(Date.now());
  const [chromeVisible, setChromeVisible] = useState(true);
  const [showPtz, setShowPtz] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
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

  const video = mode === 'webrtc' ? (
    <WebRtcCameraPlayer
      camera={camera}
      settings={settings}
      onUnavailable={reason => { setError(reason); setMode('snapshot'); }}
      onLog={line => setDebugLog(prev => [...prev.slice(-60), line])}
      onAudioChange={setHasAudio}
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
          <View style={styles.toolbar}>
            {mode === 'webrtc' ? (
              <View style={styles.iconBtn}>
                <Text style={styles.audioIcon}>{hasAudio ? '🔊' : '🔇'}</Text>
              </View>
            ) : null}
            <PressableScale style={[styles.iconBtn, showPtz && styles.iconBtnActive]} onPress={() => setShowPtz(v => !v)}>
              <Ionicons name="videocam" size={17} color="#fff" />
            </PressableScale>
            <PressableScale style={styles.iconBtn} onPress={zoomOut}>
              <Ionicons name="remove" size={17} color="#fff" />
            </PressableScale>
            <PressableScale style={[styles.iconBtn, zoomed && styles.iconBtnActive]} onPress={zoomIn}>
              <Ionicons name="add" size={17} color="#fff" />
            </PressableScale>
            <PressableScale style={[styles.iconBtn, isLandscape && styles.iconBtnActive]} onPress={toggleLandscape}>
              <Ionicons name="expand" size={17} color="#fff" />
            </PressableScale>
            <PressableScale style={[styles.iconBtn, showDebug && styles.iconBtnActive]} onPress={() => setShowDebug(v => !v)}>
              <Text style={styles.debugToggleText}>🐛</Text>
            </PressableScale>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <PressableScale style={styles.button} onPress={() => { setError(undefined); setMode(mode === 'webrtc' ? 'snapshot' : 'webrtc'); }}>
            <Text style={styles.buttonText}>{mode === 'webrtc' ? i18n.t('useSnapshot') : i18n.t('retryLive')}</Text>
          </PressableScale>
          <PressableScale style={styles.button} onPress={() => { setError(undefined); if (mode === 'snapshot') setNonce(Date.now()); else setMode('webrtc'); }}>
            <Text style={styles.buttonText}>{i18n.t('refresh')}</Text>
          </PressableScale>
        </View>
      </>
    ) : null}

    {showPtz ? <PtzPad camera={camera} settings={settings} states={states} /> : null}

    {showDebug ? (
      <ScrollView style={styles.debugPanel} contentContainerStyle={{ padding: 10 }}>
        <Text style={styles.debugLine}>وضع البث الحالي: {mode}</Text>
        {debugLog.length === 0 ? <Text style={styles.debugLine}>...</Text> : null}
        {debugLog.map((line, i) => <Text key={i} style={styles.debugLine} selectable>{line}</Text>)}
      </ScrollView>
    ) : null}
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
  toolbar: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(0,0,0,.58)', borderRadius: 16, padding: 3 },
  iconBtn: { width: 32, height: 32, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  iconBtnActive: { backgroundColor: colors.primary },
  audioIcon: { fontSize: 14 },
  error: { position: 'absolute', bottom: 90, alignSelf: 'center', color: colors.warning, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,.7)', borderRadius: 12 },
  actions: { position: 'absolute', bottom: 24, left: 14, right: 14, flexDirection: 'row', gap: 10 },
  button: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,.4)', backgroundColor: 'rgba(0,0,0,.5)', borderRadius: 13, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800' },
  debugToggleText: { fontSize: 14 },
  debugPanel: { position: 'absolute', zIndex: 3, top: 60, left: 8, right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,.9)', borderRadius: 10 },
  debugLine: { color: '#8FE388', fontSize: 10, fontFamily: 'monospace', marginBottom: 3 },
});
