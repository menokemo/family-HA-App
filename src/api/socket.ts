import type { AlarmoEvent, ConnectionSettings, HaEntity } from '../types/homeAssistant';
import { absoluteHaUrl } from './homeAssistant';

const wsUrl = (url: string) => `${url.trim().replace(/\/+$/, '').replace(/^http:/i,'ws:').replace(/^https:/i,'wss:')}/api/websocket`;
interface Pending { resolve: (value: unknown) => void; reject: (error: Error) => void }

export class HomeAssistantSocket {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private stopped = false;
  private retry?: ReturnType<typeof setTimeout>;
  constructor(private settings: ConnectionSettings, private onEntity: (entity: HaEntity) => void, private onAlarmoEvent: (event: AlarmoEvent) => void, private onConnection: (ok: boolean) => void) {}
  start(): () => void { this.connect(); return () => this.stop(); }
  stop(): void { this.stopped = true; if (this.retry) clearTimeout(this.retry); this.socket?.close(); this.pending.forEach(x => x.reject(new Error('Connection closed'))); this.pending.clear(); }
  private connect(): void {
    if (this.stopped) return;
    const socket = new WebSocket(wsUrl(this.settings.baseUrl)); this.socket = socket;
    socket.onmessage = event => this.handle(JSON.parse(String(event.data)) as Record<string, unknown>);
    socket.onerror = () => this.onConnection(false);
    socket.onclose = () => { this.onConnection(false); if (!this.stopped) this.retry = setTimeout(() => this.connect(), 2500); };
  }
  private handle(message: Record<string, unknown>): void {
    if (message.type === 'auth_required') this.socket?.send(JSON.stringify({ type:'auth', access_token:this.settings.token }));
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
