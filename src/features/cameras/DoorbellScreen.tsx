import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { PressableScale } from '../../components/PressableScale';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { authHeaders, cameraSnapshotUrl, type RegistryEntry } from '../../api/homeAssistant';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { CameraPlayer } from './CameraPlayer';

type Props = { camera: HaEntity; settings: ConnectionSettings; states: HaEntity[]; registry: RegistryEntry[]; onClose: () => void };

// لو محدش رد، الشاشة بتقفل لوحدها بعد الفترة دي عشان ماتفضلش فاتحة للأبد.
const RING_TIMEOUT_MS = 45000;

/**
 * شاشة "مكالمة واردة" للجرس. وهي بترنّ: لقطة سريعة من الكاميرا (تظهر فورًا من غير
 * انتظار WebRTC) + نغمة واهتزاز + ردّ/تجاهل. أول ما تردّ، بتفتح البلاير الكامل
 * بالبث المباشر والصوت (تسمع الزائر) — وبكده مرحلة ١ خلصت (مشاهدة وسماع). الكلام
 * مرحلة ٢.
 */
export function DoorbellScreen({ camera, settings, states, registry, onClose }: Props) {
  const [answered, setAnswered] = useState(false);
  const token = typeof camera.attributes.access_token === 'string' ? camera.attributes.access_token : undefined;

  useEffect(() => {
    if (answered) return;
    // نغمة + اهتزاز. الاهتزاز نمط متكرر زي المكالمة.
    InCallManager.startRingtone('_BUNDLE_', [0, 1000, 800], 'default', 30);
    const timeout = setTimeout(onClose, RING_TIMEOUT_MS);
    return () => {
      InCallManager.stopRingtone();
      clearTimeout(timeout);
    };
  }, [answered, onClose]);

  if (answered) {
    return <CameraPlayer camera={camera} settings={settings} states={states} registry={registry} title={String(camera.attributes.friendly_name ?? i18n.t('doorbellTitle'))} onClose={onClose} />;
  }

  const snapshot = cameraSnapshotUrl(settings, camera.entity_id, Date.now(), token);

  return (
    <View style={styles.container}>
      <Image source={{ uri: snapshot, headers: token ? undefined : authHeaders(settings) }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={2} />
      <View style={styles.scrim} />

      <View style={styles.top}>
        <View style={styles.bellBadge}><Ionicons name="notifications" size={34} color="#fff" /></View>
        <Text style={styles.title}>{i18n.t('doorbellRinging')}</Text>
        <Text style={styles.sub} numberOfLines={1}>{String(camera.attributes.friendly_name ?? i18n.t('doorbellTitle'))}</Text>
      </View>

      <View style={styles.actions}>
        <View style={styles.action}>
          <PressableScale style={[styles.circle, styles.decline]} onPress={onClose}>
            <Ionicons name="close" size={30} color="#fff" />
          </PressableScale>
          <Text style={styles.actionLabel}>{i18n.t('doorbellDismiss')}</Text>
        </View>
        <View style={styles.action}>
          <PressableScale style={[styles.circle, styles.accept]} onPress={() => setAnswered(true)}>
            <Ionicons name="videocam" size={30} color="#fff" />
          </PressableScale>
          <Text style={styles.actionLabel}>{i18n.t('doorbellAnswer')}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, justifyContent: 'space-between' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.45)' },
  top: { alignItems: 'center', gap: 10, marginTop: 90 },
  bellBadge: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.16)', marginBottom: 6 },
  title: { color: '#fff', fontSize: 23, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,.75)', fontSize: 15, fontWeight: '600', maxWidth: '80%' },
  actions: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 70, paddingHorizontal: 40 },
  action: { alignItems: 'center', gap: 10 },
  circle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  decline: { backgroundColor: colors.danger },
  accept: { backgroundColor: colors.safe },
  actionLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
