import { useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
    <Pressable style={ptz.btn} onPressIn={() => start(direction)} onPressOut={stop}>
      <Ionicons name={icon} size={20} color="#fff" />
    </Pressable>
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

/** بتدير سحب/تكبير بإصبعين على الفيديو - من غير أي مكتبة إيماءات
 * خارجية، بس PanResponder المدمجة في React Native. */
function usePinchPan() {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const state = useRef({ baseScale: 1, baseX: 0, baseY: 0, startDistance: 0, startX: 0, startY: 0, touches: 0 });

  const distance = (touches: { pageX: number; pageY: number }[]) => {
    const [a, b] = touches;
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        const touches = e.nativeEvent.touches;
        state.current.touches = touches.length;
        if (touches.length === 2) state.current.startDistance = distance(touches as unknown as { pageX: number; pageY: number }[]);
        state.current.startX = e.nativeEvent.pageX;
        state.current.startY = e.nativeEvent.pageY;
      },
      onPanResponderMove: (e, gesture) => {
        const touches = e.nativeEvent.touches;
        if (touches.length === 2) {
          if (!state.current.startDistance) state.current.startDistance = distance(touches as unknown as { pageX: number; pageY: number }[]);
          const d = distance(touches as unknown as { pageX: number; pageY: number }[]);
          const nextScale = Math.min(4, Math.max(1, state.current.baseScale * (d / state.current.startDistance)));
          scale.setValue(nextScale);
        } else if (touches.length === 1 && state.current.baseScale > 1) {
          translateX.setValue(state.current.baseX + gesture.dx);
          translateY.setValue(state.current.baseY + gesture.dy);
        }
      },
      onPanResponderRelease: () => {
        scale.stopAnimation(v => { state.current.baseScale = v; });
        translateX.stopAnimation(v => { state.current.baseX = v; });
        translateY.stopAnimation(v => { state.current.baseY = v; });
        state.current.startDistance = 0;
        if (state.current.baseScale <= 1) {
          state.current.baseScale = 1;
          Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          ]).start(() => { state.current.baseX = 0; state.current.baseY = 0; });
        }
      },
    }),
  ).current;

  return { scale, translateX, translateY, panHandlers: responder.panHandlers };
}

export function CameraPlayer({ camera, settings, states, title, onClose }: CameraPlayerProps) {
  const [mode, setMode] = useState<Mode>('webrtc');
  const [error, setError] = useState<string>();
  const [nonce, setNonce] = useState(Date.now());
  const [chromeVisible, setChromeVisible] = useState(true);
  const [rotated, setRotated] = useState(true);
  const [showPtz, setShowPtz] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const { scale, translateX, translateY, panHandlers } = usePinchPan();
  const token = typeof camera.attributes.access_token === 'string' ? camera.attributes.access_token : undefined;
  const snapshotUrl = useMemo(
    () => cameraSnapshotUrl(settings, camera.entity_id, nonce, token),
    [settings.baseUrl, settings.token, camera.entity_id, nonce, token],
  );
  const { width: screenW, height: screenH } = Dimensions.get('window');

  const video = mode === 'webrtc' ? (
    <WebRtcCameraPlayer camera={camera} settings={settings} onUnavailable={reason => { setError(reason); setMode('snapshot'); }} onLog={line => setDebugLog(prev => [...prev.slice(-60), line])} />
  ) : (
    <Image
      source={{ uri: snapshotUrl, headers: token ? undefined : authHeaders(settings) }}
      style={styles.media}
      resizeMode="contain"
      onError={() => setError(i18n.t('snapshotFailed'))}
    />
  );

  return <View style={styles.container}>
    <Pressable style={styles.mediaWrap} onPress={() => setChromeVisible(v => !v)} {...panHandlers}>
      <Animated.View
        style={[
          rotated ? { width: screenH, height: screenW, transform: [{ rotate: '90deg' }, { scale }, { translateX }, { translateY }] } : { width: '100%', height: '100%', transform: [{ scale }, { translateX }, { translateY }] },
        ]}
      >
        {video}
      </Animated.View>
    </Pressable>

    <Pressable style={styles.closeButton} onPress={onClose} hitSlop={10}>
      <Ionicons name="close" size={20} color="#fff" />
    </Pressable>

    {chromeVisible ? (
      <>
        <View style={styles.header}>
          <View style={[styles.liveDot, { backgroundColor: mode === 'webrtc' ? colors.danger : colors.warning }]} />
          <Text style={styles.badge} numberOfLines={1}>{title}</Text>
        </View>

        <Pressable style={styles.rotateButton} onPress={() => setRotated(v => !v)}>
          <Ionicons name="phone-landscape-outline" size={18} color="#fff" />
        </Pressable>

        <Pressable style={[styles.ptzToggle, showPtz && styles.ptzToggleActive]} onPress={() => setShowPtz(v => !v)}>
          <Ionicons name="videocam" size={18} color="#fff" />
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable style={styles.button} onPress={() => { setError(undefined); setMode(mode === 'webrtc' ? 'snapshot' : 'webrtc'); }}>
            <Text style={styles.buttonText}>{mode === 'webrtc' ? i18n.t('useSnapshot') : i18n.t('retryLive')}</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={() => { setError(undefined); if (mode === 'snapshot') setNonce(Date.now()); else setMode('webrtc'); }}>
            <Text style={styles.buttonText}>{i18n.t('refresh')}</Text>
          </Pressable>
        </View>
      </>
    ) : null}

    {showPtz ? <PtzPad camera={camera} settings={settings} states={states} /> : null}

    <Pressable style={styles.debugToggle} onPress={() => setShowDebug(v => !v)}>
      <Text style={styles.debugToggleText}>🐛</Text>
    </Pressable>
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
  header: { position: 'absolute', zIndex: 2, top: 50, left: 60, right: 60, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(0,0,0,.58)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, alignSelf: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  badge: { color: '#fff', fontSize: 12, fontWeight: '800', flexShrink: 1 },
  error: { position: 'absolute', bottom: 90, alignSelf: 'center', color: colors.warning, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,.7)', borderRadius: 12 },
  actions: { position: 'absolute', bottom: 24, left: 14, right: 14, flexDirection: 'row', gap: 10 },
  button: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,.4)', backgroundColor: 'rgba(0,0,0,.5)', borderRadius: 13, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800' },
  closeButton: { position: 'absolute', zIndex: 3, top: 50, left: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,.58)', alignItems: 'center', justifyContent: 'center' },
  rotateButton: { position: 'absolute', zIndex: 2, top: 50, right: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,.58)', alignItems: 'center', justifyContent: 'center' },
  ptzToggle: { position: 'absolute', zIndex: 2, bottom: 90, left: 14, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,.58)', alignItems: 'center', justifyContent: 'center' },
  ptzToggleActive: { backgroundColor: colors.primary },
  debugToggle: { position: 'absolute', zIndex: 2, bottom: 90, right: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,.6)', alignItems: 'center', justifyContent: 'center' },
  debugToggleText: { fontSize: 15 },
  debugPanel: { position: 'absolute', zIndex: 3, top: 96, left: 8, right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,.9)', borderRadius: 10 },
  debugLine: { color: '#8FE388', fontSize: 10, fontFamily: 'monospace', marginBottom: 3 },
});
