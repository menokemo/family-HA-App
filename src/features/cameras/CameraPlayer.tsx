import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { authHeaders, cameraSnapshotUrl } from '../../api/homeAssistant';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { WebRtcCameraPlayer } from './WebRtcCameraPlayer';

type CameraPlayerProps = { camera: HaEntity; settings: ConnectionSettings };
type Mode = 'webrtc' | 'snapshot';

export function CameraPlayer({ camera, settings }: CameraPlayerProps) {
  const [mode, setMode] = useState<Mode>('webrtc');
  const [error, setError] = useState<string>();
  const [nonce, setNonce] = useState(Date.now());
  const token = typeof camera.attributes.access_token === 'string' ? camera.attributes.access_token : undefined;
  const snapshotUrl = useMemo(
    () => cameraSnapshotUrl(settings, camera.entity_id, nonce, token),
    [settings.baseUrl, settings.token, camera.entity_id, nonce, token],
  );

  return <View style={styles.container}>
    <View style={styles.header}>
      <View style={[styles.liveDot, { backgroundColor: mode === 'webrtc' ? colors.danger : colors.warning }]}/>
      <Text style={styles.badge}>{mode === 'webrtc' ? 'WebRTC · LIVE' : i18n.t('snapshot')}</Text>
    </View>

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

    {error ? <Text style={styles.error}>{error}</Text> : null}
    <View style={styles.actions}>
      <Pressable style={styles.button} onPress={() => { setError(undefined); setMode(mode === 'webrtc' ? 'snapshot' : 'webrtc'); }}>
        <Text style={styles.buttonText}>{mode === 'webrtc' ? i18n.t('useSnapshot') : i18n.t('retryLive')}</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => { setError(undefined); if (mode === 'snapshot') setNonce(Date.now()); else setMode('webrtc'); }}>
        <Text style={styles.buttonText}>{i18n.t('refresh')}</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:colors.black},
  header:{position:'absolute',zIndex:2,top:14,right:14,flexDirection:'row',alignItems:'center',gap:7,backgroundColor:'rgba(0,0,0,.58)',paddingHorizontal:12,paddingVertical:8,borderRadius:18},
  liveDot:{width:8,height:8,borderRadius:4},
  badge:{color:'#fff',fontSize:12,fontWeight:'800'},
  media:{flex:1,backgroundColor:colors.black},
  error:{color:colors.warning,paddingHorizontal:16,paddingVertical:10,backgroundColor:colors.surface},
  actions:{flexDirection:'row',gap:10,padding:14,backgroundColor:colors.surface},
  button:{flex:1,borderWidth:1,borderColor:colors.primary,borderRadius:13,padding:12,alignItems:'center'},
  buttonText:{color:colors.primary,fontWeight:'800'}
});
