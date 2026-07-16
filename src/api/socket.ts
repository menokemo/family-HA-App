import type { AlarmoEvent, ConnectionSettings, HaEntity } from '../types/homeAssistant';
import { absoluteHaUrl } from './homeAssistant';
import { refreshAccessToken } from './oauth';
import { getLiveSettings, updateLiveSettings } from '../storage/liveSettings';

const wsUrl = (url: string) => `${url.trim().replace(/\/+$/, '').replace(/^http:/i,'ws:').replace(/^https:/i,'wss:')}/api/websocket`;
interface Pending { resolve: (value: unknown) => void; reject: (error: Error) => void }
const REFRESH_MARGIN_MS = 60_000;

export class HomeAssistantSocket {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private stopped = false;
  private retry?: ReturnType<typeof setTimeout>;
  private authToken = '';
  constructor(private settings: ConnectionSettings, private onEntity: (entity: HaEntity) => void, private onAlarmoEvent: (event: AlarmoEvent) => void, private onConnection: (ok: boolean) => void) {}
  start(): () => void { void this.connect(); return () => this.stop(); }
  stop(): void { this.stopped = true; if (this.retry) clearTimeout(this.retry); this.socket?.close(); this.pending.forEach(x => x.reject(new Error('Connection closed'))); this.pending.clear(); }
  private async ensureFreshToken(): Promise<string> {
    if (this.settings.authMethod !== 'oauth' || !this.settings.refreshToken) return this.settings.token;
    const expiresAt = this.settings.tokenExpiresAt ?? 0;
    if (Date.now() < expiresAt - REFRESH_MARGIN_MS && this.settings.accessToken) return this.settings.accessToken;
    const fresh = await refreshAccessToken(this.settings.baseUrl, this.settings.refreshToken);
    const patch = { accessToken: fresh.access_token, tokenExpiresAt: Date.now() + fresh.expires_in * 1000 };
    this.settings = { ...this.settings, ...patch };
    const live = getLiveSettings();
    if (live && live.baseUrl === this.settings.baseUrl) await updateLiveSettings(patch);
    return fresh.access_token;
  }
  private async connect(): Promise<void> {
    if (this.stopped) return;
    try {
      this.authToken = await this.ensureFreshToken();
    } catch {
      this.onConnection(false);
      if (!this.stopped) this.retry = setTimeout(() => void this.connect(), 2500);
      return;
    }
    if (this.stopped) return;
    const socket = new WebSocket(wsUrl(this.settings.baseUrl)); this.socket = socket;
    socket.onmessage = event => this.handle(JSON.parse(String(event.data)) as Record<string, unknown>);
    socket.onerror = () => this.onConnection(false);
    socket.onclose = () => { this.onConnection(false); if (!this.stopped) this.retry = setTimeout(() => void this.connect(), 2500); };
  }
  private handle(message: Record<string, unknown>): void {
    if (message.type === 'auth_required') this.socket?.send(JSON.stringify({ type:'auth', access_token:this.authToken }));
    if (message.type === 'auth_ok') { this.onConnection(true); void this.subscribe('state_changed'); void this.subscribe('alarmo_failed_to_arm'); void this.subscribe('alarmo_command_success'); void this.subscribe('alarmo_ready_to_arm_modes_updated'); }
    if (message.type === 'result' && typeof message.id === 'number') {
      const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id);
      if (message.success === false) pending.reject(new Error(String((message.error as {message?:string}|undefined)?.message ?? 'WebSocket command failed'))); else pending.resolve(message.result);
    }
    if (message.type === 'event') {
      const event = message.event as { event_type?: string; data?: Record<string,unknown>; time_fired?: string } | undefined;
      if (!event?.event_type) return;
      if (event.event_type === 'state_changed') { const entity = event.data?.new_state as HaEntity | null | undefined; if (entity) this.onEntity(entity); }
      else if (event.event_type.startsWith('alarmo_')) this.onAlarmoEvent({ eventType: event.event_type as AlarmoEvent['eventType'], data:event.data ?? {}, timeFired:event.time_fired });
    }
  }
  private async subscribe(eventType: string): Promise<void> { await this.command({ type:'subscribe_events', event_type:eventType }); }
  command(payload: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve,reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) { reject(new Error('WebSocket is not connected')); return; }
      const id = this.nextId++; this.pending.set(id,{resolve,reject}); this.socket.send(JSON.stringify({ id, ...payload }));
      setTimeout(() => { const p=this.pending.get(id); if (p) { this.pending.delete(id); p.reject(new Error('WebSocket request timed out')); } }, 12000);
    });
  }
  async getCameraStream(entityId: string): Promise<{ hlsUrl?: string; mjpegUrl?: string }> {
    const result = await this.command({ type:'stream_camera', data:{ camera_entity_id: entityId } }) as { hls_path?: string | null; mjpeg_path?: string | null };
    const hlsUrl = result?.hls_path ? absoluteHaUrl(this.settings, result.hls_path) : undefined;
    const mjpegUrl = result?.mjpeg_path ? absoluteHaUrl(this.settings, result.mjpeg_path) : undefined;
    if (!hlsUrl && !mjpegUrl) throw new Error('Home Assistant did not return a compatible camera stream');
    return { hlsUrl, mjpegUrl };
  }
}
