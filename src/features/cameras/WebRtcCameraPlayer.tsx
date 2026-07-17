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

export function WebRtcCameraPlayer({ camera, settings, onUnavailable }: Props) {
  const [streamUrl, setStreamUrl] = useState<string>();
  const [status, setStatus] = useState(i18n.t('connecting'));
  const [hasAudio, setHasAudio] = useState(false);
  const fallbackRef = useRef(onUnavailable);
  fallbackRef.current = onUnavailable;

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

    const fail = (reason: string) => {
      if (disposed) return;
      setStatus(reason);
      fallbackRef.current(reason);
    };

    const command = (payload: Record<string, unknown>): Promise<unknown> => {
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
        const capabilities = (await command({
          type: 'camera/capabilities',
          entity_id: camera.entity_id,
        })) as { frontend_stream_types?: string[] };
        if (!capabilities.frontend_stream_types?.includes('web_rtc')) {
          fail(i18n.t('webrtcUnavailable'));
          return;
        }

        const clientConfig = (await command({
          type: 'camera/webrtc/get_client_config',
          entity_id: camera.entity_id,
        })) as ClientConfiguration;

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
          remoteStream.addTrack(event.track as never);
          const kind = (event.track as unknown as { kind?: string }).kind;
          if (kind === 'audio') setHasAudio(true);
          setStreamUrl(remoteStream.toURL());
          setStatus(i18n.t('liveStream'));
        };
        peerEvents.onicecandidate = event => {
          const candidate = event.candidate?.toJSON();
          if (candidate?.candidate) void sendCandidate(candidate);
        };
        peerEvents.oniceconnectionstatechange = () => {
          if (peer?.iceConnectionState === 'failed') fail(i18n.t('webrtcConnectionFailed'));
        };

        const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await peer.setLocalDescription(offer);
        offerSubscriptionId = nextId++;
        socket?.send(JSON.stringify({
          id: offerSubscriptionId,
          type: 'camera/webrtc/offer',
          entity_id: camera.entity_id,
          offer: offer.sdp ?? '',
        }));
      } catch (error) {
        fail(error instanceof Error ? error.message : i18n.t('cameraPlaybackFailed'));
      }
    };

    let authToken = settings.token;
    const openSocket = () => {
      socket = new WebSocket(websocketUrl(settings.baseUrl));
      socket.onmessage = raw => {
        const message = JSON.parse(String(raw.data)) as WsMessage;
        if (message.type === 'auth_required') {
          socket?.send(JSON.stringify({ type: 'auth', access_token: authToken }));
          return;
        }
        if (message.type === 'auth_invalid') {
        fail('Home Assistant authentication failed');
        return;
      }
      if (message.type === 'auth_ok') {
        void startWebRtc();
        return;
      }
      if (message.type === 'result' && typeof message.id === 'number') {
        if (message.id === offerSubscriptionId) {
          if (message.success === false) fail(message.error?.message ?? i18n.t('cameraPlaybackFailed'));
          return;
        }
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.success === false) request.reject(new Error(message.error?.message ?? 'Home Assistant request failed'));
        else request.resolve(message.result);
        return;
      }
      if (message.type === 'event' && message.id === offerSubscriptionId && message.event) {
        void handleOfferEvent(message.event);
      }
      };
      socket.onerror = () => fail(i18n.t('webrtcConnectionFailed'));
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

    void requestMediaPermissions().then(async () => {
      if (disposed) return;
      try {
        authToken = await ensureFreshToken(settings);
      } catch {
        // فشل التجديد لأي سبب - نكمل بالتوكن الموجود، وأي فشل مصادقة
        // فعلي هيتلقط عادي في auth_invalid تحت
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
        <>
          <RTCView streamURL={streamUrl} style={styles.video} objectFit="contain" mirror={false} />
          <View style={styles.audioBadge}>
            <Text style={styles.audioBadgeText}>{hasAudio ? '🔊' : '🔇 ' + i18n.t('noAudioSource')}</Text>
          </View>
        </>
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
  audioBadge: { position: 'absolute', bottom: 12, left: 12, backgroundColor: 'rgba(0,0,0,.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  audioBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
