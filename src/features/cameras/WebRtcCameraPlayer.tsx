import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PermissionsAndroid, Platform, StyleSheet, Text, View } from 'react-native';
import {
  MediaStream,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  mediaDevices,
} from 'react-native-webrtc';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { ensureFreshToken } from '../../api/homeAssistant';
import InCallManager from 'react-native-incall-manager';
import { colors } from '../../theme';
import { i18n } from '../../i18n';

type Props = {
  camera: HaEntity;
  settings: ConnectionSettings;
  onUnavailable: (reason: string) => void;
  onAudioChange?: (hasAudio: boolean) => void;
  muted?: boolean;
  /** وضع الكلام الثنائي: بنبعت مايك الموبايل للكاميرا (go2rtc backchannel). للجرس. */
  talk?: boolean;
  /** كتم المايك المحلي (في وضع الكلام). */
  micMuted?: boolean;
  /** بيتبلّغ لما المايك يشتغل فعلاً (نجح getUserMedia وانضاف المسار). */
  onTalkChange?: (talking: boolean) => void;
  /** يدير وضع صوت المكالمة (InCallManager). نخلّيه false وقت المعاينة تحت
   *  رنين الجرس عشان نغمة الرنين ماتتقطعش. افتراضي true (الكاميرا العادية). */
  manageAudio?: boolean;
};

// قبل ما نقع على اللقطة الثابتة، بنحاول نرجّع البث المباشر كذا مرة بفاصل متزايد.
// معظم القطع في البث لحظي (الشبكة، نوم الكاميرا شوية) وبيرجع لوحده.
const MAX_RECONNECTS = 3;
const RECONNECT_BACKOFF_MS = [1000, 2000, 4000];

type WsMessage = {
  id?: number;
  type: string;
  success?: boolean;
  result?: unknown;
  error?: { message?: string };
  event?: WebRtcEvent;
};

type IceCandidateInit = { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null };

type WebRtcEvent =
  | { type: 'session'; session_id: string }
  | { type: 'answer'; answer: string }
  | { type: 'candidate'; candidate: IceCandidateInit }
  | { type: 'error'; message: string; code?: string };

type ClientConfiguration = {
  configuration?: Record<string, unknown>;
  dataChannel?: string;
};

const websocketUrl = (baseUrl: string) =>
  `${baseUrl.trim().replace(/\/+$/, '').replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')}/api/websocket`;

export function WebRtcCameraPlayer({ camera, settings, onUnavailable, onAudioChange, muted = false, talk = false, micMuted = false, onTalkChange, manageAudio = true }: Props) {
  const [streamUrl, setStreamUrl] = useState<string>();
  const [status, setStatus] = useState(i18n.t('connecting'));
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const fallbackRef = useRef(onUnavailable);
  fallbackRef.current = onUnavailable;
  const onAudioChangeRef = useRef(onAudioChange);
  onAudioChangeRef.current = onAudioChange;
  // عدد المحاولات الفاشلة المتتالية — بيترجّع لصفر لما البث يشتغل.
  const attemptsRef = useRef(0);
  // مسار الصوت البعيد عشان نقدر نكتمه (enabled=false بيكتم مسار بعيد محليًا).
  const audioTrackRef = useRef<{ enabled: boolean } | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  // مسار المايك المحلي (وضع الكلام) + حالة الكتم، عشان نكتمه ونوقفه عند الإغلاق.
  const localStreamRef = useRef<MediaStream | null>(null);
  const micMutedRef = useRef(micMuted);
  micMutedRef.current = micMuted;
  const talkRef = useRef(talk);
  talkRef.current = talk;
  const onTalkChangeRef = useRef(onTalkChange);
  onTalkChangeRef.current = onTalkChange;

  // كتم/تشغيل المايك المحلي في وضع الكلام.
  useEffect(() => {
    const tracks = localStreamRef.current?.getAudioTracks?.() ?? [];
    for (const t of tracks) (t as unknown as { enabled: boolean }).enabled = !micMuted;
  }, [micMuted]);

  // كتم/تشغيل الصوت على المسار الحالي. بيشتغل كمان بعد إعادة الاتصال لأن
  // كل مسار جديد بيتظبّط من `mutedRef` وقت ما يوصل.
  useEffect(() => {
    if (audioTrackRef.current) audioTrackRef.current.enabled = !muted;
  }, [muted]);

  useEffect(() => {
    // بدون ده، الصوت بيتوجّه لقناة "مكالمة" هادية وثابتة تقريبًا مش
    // بتستجيب لزرار الصوت العادي بتاع الموبايل - مشكلة معروفة في
    // react-native-webrtc. media:'video' بيوجّه الصوت للسماعة بمستوى
    // صوت الوسائط العادي (بيستجيب لزرار الصوت زي أي فيديو تاني).
    if (manageAudio) {
      InCallManager.start({ media: 'video' });
      InCallManager.setForceSpeakerphoneOn(true);
    }
    let disposed = false;
    let socket: WebSocket | undefined;
    let peer: RTCPeerConnection | undefined;
    let remoteStream: MediaStream | undefined;
    let nextId = 1;
    let offerSubscriptionId: number | undefined;
    let sessionId: string | undefined;
    const queuedCandidates: IceCandidateInit[] = [];
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

    const log = (message: string) => {
      console.log('[WebRTC]', camera.entity_id, message);
    };

    // عطل نهائي: الكاميرا مش بتدعم WebRTC أو المصادقة غلط — إعادة المحاولة
    // مش هتفيد، فبنقع على اللقطة الثابتة على طول.
    const fail = (reason: string) => {
      log(`❌ fail: ${reason}`);
      if (disposed) return;
      setStatus(reason);
      fallbackRef.current(reason);
    };

    // عطل مؤقت: جرّب ترجّع البث كذا مرة قبل ما تقع على اللقطة.
    const retryOrFail = (reason: string) => {
      if (disposed) return;
      if (attemptsRef.current >= MAX_RECONNECTS) {
        log(`❌ استنفدنا المحاولات (${reason})`);
        fail(reason);
        return;
      }
      const delay = RECONNECT_BACKOFF_MS[Math.min(attemptsRef.current, RECONNECT_BACKOFF_MS.length - 1)];
      attemptsRef.current += 1;
      log(`↻ إعادة محاولة ${attemptsRef.current}/${MAX_RECONNECTS} بعد ${delay}ms (${reason})`);
      setStreamUrl(undefined); // امسح البث الميت عشان تبان دائرة التحميل ورسالة "بيحاول يرجّع".
      setStatus(i18n.t('reconnecting'));
      setTimeout(() => { if (!disposed) setReconnectNonce(n => n + 1); }, delay);
    };

    const command = (payload: Record<string, unknown>): Promise<unknown> => {
      log(`→ command: ${String(payload.type)}`);
      const request = new Promise((resolve, reject) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket is not connected'));
          return;
        }
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, ...payload }));
        setTimeout(() => {
          const pendingRequest = pending.get(id);
          if (pendingRequest) {
            pending.delete(id);
            pendingRequest.reject(new Error('WebRTC request timed out'));
          }
        }, 15000);
      });
      // لو الشاشة اتقفلت واحنا لسه مستنيين رد (كاميرا بطيئة مثلاً)،
      // بيتم رفض الـ promise في الـ cleanup - الـ catch الفاضي ده بس
      // بيمنع تحذير "Unhandled Rejection" المزعج، مش بيمنع أي كود
      // تاني بيستنى نفس الـ promise من إنه ياخد الخطأ الحقيقي عادي.
      request.catch(() => undefined);
      return request;
    };

    const sendCandidate = async (candidate: IceCandidateInit) => {
      if (!sessionId) {
        queuedCandidates.push(candidate);
        return;
      }
      try {
        await command({
          type: 'camera/webrtc/candidate',
          entity_id: camera.entity_id,
          session_id: sessionId,
          candidate,
        });
      } catch {
        // لو الشاشة اتقفلت أثناء إرسال الـ candidate، تجاهل الخطأ -
        // مفيش داعي نظهره للمستخدم، والاتصال أصلًا بيتقفل في الـ cleanup
      }
    };

    const handleOfferEvent = async (event: WebRtcEvent) => {
      try {
        if (event.type === 'session') {
          sessionId = event.session_id;
          while (queuedCandidates.length) {
            const candidate = queuedCandidates.shift();
            if (candidate) await sendCandidate(candidate);
          }
          return;
        }
        if (event.type === 'answer') {
          await peer?.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: event.answer }));
          setStatus(i18n.t('liveStream'));
          return;
        }
        if (event.type === 'candidate') {
          const candidate = event.candidate.sdpMid || event.candidate.sdpMLineIndex != null
            ? event.candidate
            : { ...event.candidate, sdpMid: '0' };
          await peer?.addIceCandidate(new RTCIceCandidate(candidate));
          return;
        }
        retryOrFail(event.message || i18n.t('cameraPlaybackFailed'));
      } catch (error) {
        if (!disposed) retryOrFail(error instanceof Error ? error.message : i18n.t('cameraPlaybackFailed'));
      }
    };

    const startWebRtc = async () => {
      try {
        log('طلب camera/capabilities...');
        const capabilities = (await command({
          type: 'camera/capabilities',
          entity_id: camera.entity_id,
        })) as { frontend_stream_types?: string[] };
        log(`capabilities: ${JSON.stringify(capabilities.frontend_stream_types)}`);
        if (!capabilities.frontend_stream_types?.includes('web_rtc')) {
          fail(i18n.t('webrtcUnavailable'));
          return;
        }

        log('طلب camera/webrtc/get_client_config...');
        const clientConfig = (await command({
          type: 'camera/webrtc/get_client_config',
          entity_id: camera.entity_id,
        })) as ClientConfiguration;
        log(`client config: ${JSON.stringify(clientConfig).slice(0, 200)}`);

        peer = new RTCPeerConnection((clientConfig.configuration ?? {}) as never);
        remoteStream = new MediaStream();
        if (clientConfig.dataChannel) peer.createDataChannel(clientConfig.dataChannel);

        // وضع الكلام: نجيب مايك الموبايل ونبعته للكاميرا (sendrecv) عشان
        // الـbackchannel (go2rtc) يوصّل صوتنا للباب. لو فشل المايك، نرجع
        // لاستقبال فقط عشان الصوت الوارد والصورة يفضلوا شغّالين.
        let micAdded = false;
        if (talkRef.current) {
          try {
            const localStream = (await mediaDevices.getUserMedia({ audio: true, video: false })) as unknown as MediaStream;
            localStreamRef.current = localStream;
            const micTrack = localStream.getAudioTracks?.()[0];
            if (micTrack) {
              (micTrack as unknown as { enabled: boolean }).enabled = !micMutedRef.current;
              (peer as unknown as { addTrack: (t: unknown, s: unknown) => void }).addTrack(micTrack, localStream);
              micAdded = true;
              onTalkChangeRef.current?.(true);
            }
          } catch (e) {
            log(`⚠️ تعذّر فتح المايك، هنكمل استقبال فقط: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (!micAdded) peer.addTransceiver('audio', { direction: 'recvonly' });
        peer.addTransceiver('video', { direction: 'recvonly' });
        const peerEvents = peer as unknown as {
          ontrack?: (event: { track: { stop: () => void } }) => void;
          onicecandidate?: (event: { candidate?: { toJSON: () => IceCandidateInit } | null }) => void;
          oniceconnectionstatechange?: () => void;
        };
        peerEvents.ontrack = event => {
          if (!remoteStream || disposed) return;
          const track = event.track as unknown as { kind?: string; enabled: boolean };
          const kind = track.kind;
          log(`🎥 ontrack: ${kind}`);
          remoteStream.addTrack(event.track as never);
          if (kind === 'audio') {
            audioTrackRef.current = track;
            track.enabled = !mutedRef.current; // طبّق حالة الكتم على المسار الجديد (مهم بعد إعادة الاتصال).
            onAudioChangeRef.current?.(true);
          }
          // وصل البث = نجاح، صفّر عدّاد المحاولات عشان أي قطع بعد كده ياخد محاولاته كاملة.
          attemptsRef.current = 0;
          setStreamUrl(remoteStream.toURL());
          setStatus(i18n.t('liveStream'));
        };
        peerEvents.onicecandidate = event => {
          const candidate = event.candidate?.toJSON();
          if (candidate?.candidate) void sendCandidate(candidate);
        };
        peerEvents.oniceconnectionstatechange = () => {
          log(`ICE state: ${peer?.iceConnectionState}`);
          if (peer?.iceConnectionState === 'failed') retryOrFail(i18n.t('webrtcConnectionFailed'));
        };

        const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await peer.setLocalDescription(offer);
        log('SDP offer جاهز، بيتبعت...');
        offerSubscriptionId = nextId++;
        socket?.send(JSON.stringify({
          id: offerSubscriptionId,
          type: 'camera/webrtc/offer',
          entity_id: camera.entity_id,
          offer: offer.sdp ?? '',
        }));
      } catch (error) {
        log(`❌ خطأ في startWebRtc: ${error instanceof Error ? error.message : String(error)}`);
        retryOrFail(error instanceof Error ? error.message : i18n.t('cameraPlaybackFailed'));
      }
    };

    let authToken = settings.token;
    const openSocket = () => {
      log('فتح اتصال WebSocket...');
      socket = new WebSocket(websocketUrl(settings.baseUrl));
      socket.onmessage = raw => {
        const message = JSON.parse(String(raw.data)) as WsMessage;
        if (message.type === 'auth_required') {
          log('auth_required → بعتنا التوكن');
          socket?.send(JSON.stringify({ type: 'auth', access_token: authToken }));
          return;
        }
        if (message.type === 'auth_invalid') {
        log('❌ auth_invalid');
        fail('Home Assistant authentication failed');
        return;
      }
      if (message.type === 'auth_ok') {
        log('✅ auth_ok → بدء عرض الكاميرا');
        void startWebRtc();
        return;
      }
      if (message.type === 'result' && typeof message.id === 'number') {
        if (message.id === offerSubscriptionId) {
          if (message.success === false) {
            log(`❌ فشل الـ offer: ${message.error?.message ?? 'غير معروف'}`);
            retryOrFail(message.error?.message ?? i18n.t('cameraPlaybackFailed'));
          } else {
            log('✅ الـ offer اتقبل، مستنيين event');
          }
          return;
        }
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.success === false) {
          log(`❌ نتيجة سلبية للأمر #${message.id}: ${message.error?.message ?? ''}`);
          request.reject(new Error(message.error?.message ?? 'Home Assistant request failed'));
        } else {
          log(`✅ رد للأمر #${message.id}`);
          request.resolve(message.result);
        }
        return;
      }
      if (message.type === 'event' && message.id === offerSubscriptionId && message.event) {
        log(`⚡ event: ${message.event.type}`);
        void handleOfferEvent(message.event);
      }
      };
      socket.onerror = () => { log('❌ socket.onerror'); retryOrFail(i18n.t('webrtcConnectionFailed')); };
      socket.onclose = event => log(`socket.onclose (code ${event.code})`);
    };

    const requestMediaPermissions = async () => {
      if (Platform.OS !== 'android') return true;
      try {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        return Object.values(results).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
      } catch {
        return false;
      }
    };

    log('بدء تشغيل الكاميرا...');
    void requestMediaPermissions().then(async granted => {
      log(`صلاحيات الكاميرا/الميكروفون: ${granted ? 'ممنوحة' : 'مرفوضة/جزئية'}`);
      if (disposed) return;
      try {
        authToken = await ensureFreshToken(settings);
        log('توكن جاهز');
      } catch (e) {
        log(`⚠️ فشل تجديد التوكن، هنكمل بالتوكن الحالي: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (disposed) return;
      openSocket();
    });

    return () => {
      disposed = true;
      if (manageAudio) InCallManager.stop();
      pending.forEach(request => request.reject(new Error('WebRTC player closed')));
      pending.clear();
      audioTrackRef.current = null;
      // نوقف مايكنا المحلي عشان مايفضلش شغّال بعد قفل المكالمة.
      localStreamRef.current?.getTracks?.().forEach(t => (t as unknown as { stop: () => void }).stop());
      localStreamRef.current = null;
      onTalkChangeRef.current?.(false);
      remoteStream?.getTracks().forEach(track => track.stop());
      peer?.close();
      socket?.close();
    };
    // reconnectNonce في المصفوفة عشان أي زيادة فيه تعيد تشغيل الأثر كله (تنظيف
    // ثم اتصال جديد) = محاولة إعادة اتصال نظيفة.
  }, [camera.entity_id, settings.baseUrl, settings.token, reconnectNonce]);

  return (
    <View style={styles.container}>
      {streamUrl ? (
        <RTCView streamURL={streamUrl} style={styles.video} objectFit="contain" mirror={false} zOrder={0} />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.status}>{status}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  video: { flex: 1, backgroundColor: colors.black },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  status: { color: '#fff', textAlign: 'center', paddingHorizontal: 24 },
});
