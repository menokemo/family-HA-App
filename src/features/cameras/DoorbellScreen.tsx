import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { PressableScale } from '../../components/PressableScale';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { authHeaders, cameraSnapshotUrl } from '../../api/homeAssistant';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { WebRtcCameraPlayer } from './WebRtcCameraPlayer';
import { startDoorbellRinging, stopDoorbellRinging, doorbellRingerAvailable, type DoorbellTone } from '../../native/DoorbellRinger';

type Props = { camera: HaEntity; settings: ConnectionSettings; states: HaEntity[]; onClose: () => void };

// لو محدش رد، الشاشة بتقفل لوحدها بعد الفترة دي عشان ماتفضلش فاتحة للأبد.
const RING_TIMEOUT_MS = 45000;

/**
 * شاشة "مكالمة واردة" للجرس — بشكل موديرن.
 *  • أول ما ترنّ: الكاميرا **لايف على طول** (من غير انتظار قبول) + نغمة.
 *  • زر القبول/الرفض للمحادثة: القبول بيفتح المايك (كلام ثنائي عبر go2rtc
 *    backchannel)، الرفض بيقفل.
 *  • بعد الرد: أزرار كتم المايك · كتم الصوت الوارد · إنهاء المكالمة.
 */
export function DoorbellScreen({ camera, settings, states, onClose }: Props) {
  const [answered, setAnswered] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const token = typeof camera.attributes.access_token === 'string' ? camera.attributes.access_token : undefined;
  const title = String(camera.attributes.friendly_name ?? i18n.t('doorbellTitle'));

  // نغمة + اهتزاز وهي بترنّ فقط. بعد الرد صوت المكالمة (السبيكر) بيتدار جوّه
  // WebRtcCameraPlayer عبر manageAudio، فمابنلمسش InCallManager.start هنا.
  // بنفضّل نغمة التطبيق اللي الأدمن اختارها (native)؛ لو الموديول مش متاح (APK
  // قديم) بنرجع لنغمة InCallManager القديمة.
  useEffect(() => {
    if (answered) return;
    const tone = (settings.doorbellRingtone as DoorbellTone | undefined) ?? 'ding_dong';
    if (doorbellRingerAvailable) startDoorbellRinging(tone);
    else InCallManager.startRingtone('_BUNDLE_', [0, 1000, 800], 'default', 30);
    const timeout = setTimeout(onClose, RING_TIMEOUT_MS);
    return () => {
      if (doorbellRingerAvailable) stopDoorbellRinging();
      else InCallManager.stopRingtone();
      clearTimeout(timeout);
    };
  }, [answered, onClose, settings.doorbellRingtone]);

  // البث المباشر: وهي بترنّ = استقبال فقط وصوت مكتوم (عشان النغمة تبان)؛ بعد الرد
  // = كلام ثنائي وصوت وارد. تغيير الـ key بيعيد تركيب الاتصال (peer جديد بالمايك).
  const live = liveFailed ? (
    <Image
      source={{ uri: cameraSnapshotUrl(settings, camera.entity_id, Date.now(), token), headers: token ? undefined : authHeaders(settings) }}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
    />
  ) : (
    <WebRtcCameraPlayer
      key={answered ? 'call' : 'ring'}
      camera={camera}
      settings={settings}
      onUnavailable={() => setLiveFailed(true)}
      muted={!answered || speakerMuted}
      talk={answered}
      micMuted={micMuted}
      manageAudio={answered}
    />
  );

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill}>{live}</View>
      <View style={styles.scrim} />

      {/* شريط علوي: الحالة + اسم الكاميرا */}
      <View style={styles.top}>
        <View style={[styles.statusPill, answered && styles.statusPillLive]}>
          <View style={[styles.dot, { backgroundColor: answered ? colors.safe : '#fff' }]} />
          <Text style={styles.statusText}>{answered ? i18n.t('doorbellConnected') : i18n.t('doorbellRinging')}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      {/* أزرار الأسفل */}
      {answered ? (
        <View style={styles.callBar}>
          <CallBtn
            icon={micMuted ? 'mic-off' : 'mic'}
            label={i18n.t('doorbellMuteMic')}
            active={micMuted}
            onPress={() => setMicMuted(m => !m)}
          />
          <CallBtn
            icon={speakerMuted ? 'volume-mute' : 'volume-high'}
            label={i18n.t('doorbellMuteSpeaker')}
            active={speakerMuted}
            onPress={() => setSpeakerMuted(m => !m)}
          />
          <CallBtn icon="call" label={i18n.t('doorbellEndCall')} danger big onPress={onClose} />
        </View>
      ) : (
        <View style={styles.ringBar}>
          <View style={styles.ringAction}>
            <PressableScale style={[styles.circle, styles.decline]} onPress={onClose}>
              <Ionicons name="close" size={32} color="#fff" />
            </PressableScale>
            <Text style={styles.ringLabel}>{i18n.t('doorbellDismiss')}</Text>
          </View>
          <View style={styles.ringAction}>
            <PressableScale style={[styles.circle, styles.accept]} onPress={() => setAnswered(true)}>
              <Ionicons name="call" size={30} color="#fff" />
            </PressableScale>
            <Text style={styles.ringLabel}>{i18n.t('doorbellAnswer')}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function CallBtn({ icon, label, onPress, active, danger, big }: { icon: string; label: string; onPress: () => void; active?: boolean; danger?: boolean; big?: boolean }) {
  return (
    <View style={styles.callAction}>
      <PressableScale
        style={[styles.callCircle, big && styles.callCircleBig, danger ? styles.endCall : active ? styles.callActive : styles.callIdle]}
        onPress={onPress}
      >
        <Ionicons name={danger ? 'call' : icon} size={big ? 28 : 24} color={danger ? '#fff' : active ? colors.black : '#fff'} style={danger ? styles.endIcon : undefined} />
      </PressableScale>
      <Text style={styles.callLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, justifyContent: 'space-between' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.28)' },
  top: { alignItems: 'center', gap: 12, marginTop: 70 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,.45)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  statusPillLive: { backgroundColor: 'rgba(0,0,0,.4)' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', maxWidth: '85%', textAlign: 'center', textShadowColor: 'rgba(0,0,0,.6)', textShadowRadius: 8 },

  // شريط الرنين (قبول/رفض)
  ringBar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 64, paddingHorizontal: 44 },
  ringAction: { alignItems: 'center', gap: 11 },
  circle: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  decline: { backgroundColor: colors.danger },
  accept: { backgroundColor: colors.safe },
  ringLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // شريط المكالمة (كتم مايك/صوت/إنهاء)
  callBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 30, marginBottom: 56 },
  callAction: { alignItems: 'center', gap: 9 },
  callCircle: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  callCircleBig: { width: 70, height: 70, borderRadius: 35 },
  callIdle: { backgroundColor: 'rgba(255,255,255,.18)' },
  callActive: { backgroundColor: '#fff' },
  endCall: { backgroundColor: colors.danger },
  endIcon: { transform: [{ rotate: '135deg' }] },
  callLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
