import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { authHeaders, cameraSnapshotUrl, ptzMove, ptzStop, type PtzDirection } from '../../api/homeAssistant';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { WebRtcCameraPlayer } from './WebRtcCameraPlayer';
import Ionicons from 'react-native-vector-icons/Ionicons';

type CameraPlayerProps = { camera: HaEntity; settings: ConnectionSettings; states: HaEntity[] };
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

export function CameraPlayer({ camera, settings, states }: CameraPlayerProps) {
  const [mode, setMode] = useState<Mode>('webrtc');
  const [error, setError] = useState<string>();
  const [nonce, setNonce] = useState(Date.now());
  const [immersive, setImmersive] = useState(false);
  const [showPtz, setShowPtz] = useState(false);
  const token = typeof camera.attributes.access_token === 'string' ? camera.attributes.access_token : undefined;
  const snapshotUrl = useMemo(
    () => cameraSnapshotUrl(settings, camera.entity_id, nonce, token),
    [settings.baseUrl, settings.token, camera.entity_id, nonce, token],
  );

  return <View style={styles.container}>
    {!immersive ? (
      <View style={styles.header}>
        <View style={[styles.liveDot, { backgroundColor: mode === 'webrtc' ? colors.danger : colors.warning }]} />
        <Text style={styles.badge}>{mode === 'webrtc' ? 'WebRTC · LIVE' : i18n.t('snapshot')}</Text>
      </View>
    ) : null}

    <Pressable style={styles.media} onPress={() => setImmersive(v => !v)}>
      {mode === 'webrtc' ? (
        <WebRtcCameraPlayer
          camera={camera}
          settings={settings}
          onUnavailable={reason => { setError(reason); setMode('snapshot'); }}
        />
      ) : (
        <Image
          source={{ uri: snapshotUrl, headers: token ? undefined : authHeaders(settings) }}
          style={styles.media}
          resizeMode="contain"
          onError={() => setError(i18n.t('snapshotFailed'))}
        />
      )}
    </Pressable>

    {showPtz ? <PtzPad camera={camera} settings={settings} states={states} /> : null}

    {!immersive ? (
      <Pressable style={styles.expandButton} onPress={() => setImmersive(true)}>
        <Ionicons name="expand" size={18} color="#fff" />
      </Pressable>
    ) : (
      <Pressable style={styles.collapseButton} onPress={() => setImmersive(false)}>
        <Ionicons name="contract" size={18} color="#fff" />
      </Pressable>
    )}

    <Pressable style={[styles.ptzToggle, showPtz && styles.ptzToggleActive]} onPress={() => setShowPtz(v => !v)}>
      <Ionicons name="videocam" size={18} color="#fff" />
    </Pressable>

    {!immersive && error ? <Text style={styles.error}>{error}</Text> : null}
    {!immersive ? (
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={() => { setError(undefined); setMode(mode === 'webrtc' ? 'snapshot' : 'webrtc'); }}>
          <Text style={styles.buttonText}>{mode === 'webrtc' ? i18n.t('useSnapshot') : i18n.t('retryLive')}</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => { setError(undefined); if (mode === 'snapshot') setNonce(Date.now()); else setMode('webrtc'); }}>
          <Text style={styles.buttonText}>{i18n.t('refresh')}</Text>
        </Pressable>
      </View>
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
  header: { position: 'absolute', zIndex: 2, top: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(0,0,0,.58)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  badge: { color: '#fff', fontSize: 12, fontWeight: '800' },
  media: { flex: 1, backgroundColor: colors.black },
  error: { color: colors.warning, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface },
  actions: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: colors.surface },
  button: { flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: 13, padding: 12, alignItems: 'center' },
  buttonText: { color: colors.primary, fontWeight: '800' },
  expandButton: { position: 'absolute', zIndex: 2, top: 14, left: 14, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,.58)', alignItems: 'center', justifyContent: 'center' },
  collapseButton: { position: 'absolute', zIndex: 2, top: 14, right: 14, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,.58)', alignItems: 'center', justifyContent: 'center' },
  ptzToggle: { position: 'absolute', zIndex: 2, bottom: 90, left: 14, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,.58)', alignItems: 'center', justifyContent: 'center' },
  ptzToggleActive: { backgroundColor: colors.primary },
});
