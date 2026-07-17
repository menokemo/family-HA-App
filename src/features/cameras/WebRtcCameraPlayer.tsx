import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PermissionsAndroid, Platform, StyleSheet, Text, View } from 'react-native';
import {
  MediaStream,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
} from 'react-native-webrtc';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { ensureFreshToken } from '../../api/homeAssistant';
import { colors } from '../../theme';
import { i18n } from '../../i18n';

type Props = {
  camera: HaEntity;
  settings: ConnectionSettings;
  onUnavailable: (reason: string) => void;
  onLog?: (line: string) => void;
  onAudioChange?: (hasAudio: boolean) => void;
};

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

export function WebRtcCameraPlayer({ camera, settings, onUnavailable, onLog, onAudioChange }: Props) {
  const [streamUrl, setStreamUrl] = useState<string>();
  const [status, setStatus] = useState(i18n.t('connecting'));
  const fallbackRef = useRef(onUnavailable);
  fallbackRef.current = onUnavailable;
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;
  const onAudioChangeRef = useRef(onAudioChange);
  onAudioChangeRef.current = onAudioChange;

  useEffect(() => {
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
      const line = `${new Date().toLocaleTimeString()} — ${message}`;
      // eslint-disable-next-line no-console
      console.log('[WebRTC]', camera.entity_id, line);
      onLogRef.current?.(line);
    };

    const fail = (reason: string) => {
      log(`❌ fail: ${reason}`);
      if (disposed) return;
      setStatus(reason);
      fallbackRef.current(reason);
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
        fail(event.message || i18n.t('cameraPlaybackFailed'));
      } catch (error) {
        if (!disposed) fail(error instanceof Error ? error.message : i18n.t('cameraPlaybackFailed'));
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

        peer.addTransceiver('audio', { direction: 'recvonly' });
        peer.addTransceiver('video', { direction: 'recvonly' });
        const peerEvents = peer as unknown as {
          ontrack?: (event: { track: { stop: () => void } }) => void;
          onicecandidate?: (event: { candidate?: { toJSON: () => IceCandidateInit } | null }) => void;
          oniceconnectionstatechange?: () => void;
        };
        peerEvents.ontrack = event => {
          if (!remoteStream || disposed) return;
          const kind = (event.track as unknown as { kind?: string }).kind;
          log(`🎥 ontrack: ${kind}`);
          remoteStream.addTrack(event.track as never);
          if (kind === 'audio') onAudioChangeRef.current?.(true);
          setStreamUrl(remoteStream.toURL());
          setStatus(i18n.t('liveStream'));
        };
        peerEvents.onicecandidate = event => {
          const candidate = event.candidate?.toJSON();
          if (candidate?.candidate) void sendCandidate(candidate);
        };
        peerEvents.oniceconnectionstatechange = () => {
          log(`ICE state: ${peer?.iceConnectionState}`);
          if (peer?.iceConnectionState === 'failed') fail(i18n.t('webrtcConnectionFailed'));
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
        fail(error instanceof Error ? error.message : i18n.t('cameraPlaybackFailed'));
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
            fail(message.error?.message ?? i18n.t('cameraPlaybackFailed'));
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
      socket.onerror = () => { log('❌ socket.onerror'); fail(i18n.t('webrtcConnectionFailed')); };
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
      pending.forEach(request => request.reject(new Error('WebRTC player closed')));
      pending.clear();
      remoteStream?.getTracks().forEach(track => track.stop());
      peer?.close();
      socket?.close();
    };
  }, [camera.entity_id, settings.baseUrl, settings.token]);

  return (
    <View style={styles.container}>
      {streamUrl ? (
        <RTCView streamURL={streamUrl} style={styles.video} objectFit="contain" mirror={false} />
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
