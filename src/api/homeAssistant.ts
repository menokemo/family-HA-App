import type { ConnectionSettings, HaEntity } from '../types/homeAssistant';

export const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? `HTTP ${response.status}: ${text.slice(0, 500)}`;
  } catch { return `HTTP ${response.status}: ${text.slice(0, 500)}`; }
}

async function request(settings: ConnectionSettings, path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${normalizeUrl(settings.baseUrl)}${path}`, {
    ...init,
    headers: { ...headers(settings.token), ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(await readError(response));
  return response;
}

export async function testConnection(settings: ConnectionSettings): Promise<void> { await request(settings, '/api/'); }
export async function getStates(settings: ConnectionSettings): Promise<HaEntity[]> { return (await request(settings, '/api/states')).json() as Promise<HaEntity[]>; }

export async function callOnvifPtz(settings: ConnectionSettings, entityId: string, data: Record<string, unknown>): Promise<void> {
  await request(settings, '/api/services/onvif/ptz', { method: 'POST', body: JSON.stringify({ entity_id: entityId, ...data }) });
}

export async function pressButton(settings: ConnectionSettings, entityId: string): Promise<void> {
  await request(settings, '/api/services/button/press', { method: 'POST', body: JSON.stringify({ entity_id: entityId }) });
}

export type PtzDirection = 'left' | 'right' | 'up' | 'down' | 'zoomIn' | 'zoomOut';

export function findReolinkPtzButtons(states: HaEntity[], cameraEntityId: string): Partial<Record<PtzDirection | 'stop', string>> {
  const slug = cameraEntityId.split('.')[1] ?? '';
  const parts = slug.split('_').filter(p => p.length > 2);
  const candidates = states.filter(s => s.entity_id.startsWith('button.') && parts.some(p => s.entity_id.includes(p)));
  const find = (...keywords: string[]) => candidates.find(s => keywords.every(k => s.entity_id.includes(k)))?.entity_id;
  return {
    left: find('ptz', 'left'),
    right: find('ptz', 'right'),
    up: find('ptz', 'up'),
    down: find('ptz', 'down'),
    zoomIn: find('zoom', 'in'),
    zoomOut: find('zoom', 'out'),
    stop: find('ptz', 'stop'),
  };
}

export async function ptzMove(settings: ConnectionSettings, states: HaEntity[], cameraEntityId: string, direction: PtzDirection): Promise<void> {
  try {
    const data: Record<string, unknown> = { move_mode: 'ContinuousMove', speed: 1, distance: 0.5 };
    if (direction === 'left' || direction === 'right') data.pan = direction.toUpperCase();
    if (direction === 'up' || direction === 'down') data.tilt = direction.toUpperCase();
    if (direction === 'zoomIn') data.zoom = 'ZOOM_IN';
    if (direction === 'zoomOut') data.zoom = 'ZOOM_OUT';
    await callOnvifPtz(settings, cameraEntityId, data);
    return;
  } catch {
    const buttons = findReolinkPtzButtons(states, cameraEntityId);
    const id = buttons[direction];
    if (id) await pressButton(settings, id);
  }
}

export async function ptzStop(settings: ConnectionSettings, states: HaEntity[], cameraEntityId: string): Promise<void> {
  try {
    await callOnvifPtz(settings, cameraEntityId, { move_mode: 'Stop' });
    return;
  } catch {
    const buttons = findReolinkPtzButtons(states, cameraEntityId);
    if (buttons.stop) await pressButton(settings, buttons.stop);
  }
}

export function findCalendarEntities(states: HaEntity[]): HaEntity[] {
  return states.filter(e => e.entity_id.startsWith('calendar.'));
}
export function findTodoEntities(states: HaEntity[]): HaEntity[] {
  return states.filter(e => e.entity_id.startsWith('todo.'));
}

export type CalendarEvent = { summary: string; start: string; end: string; description?: string; location?: string; uid?: string };

export async function getCalendarEvents(settings: ConnectionSettings, entityId: string, startISO: string, endISO: string): Promise<CalendarEvent[]> {
  const res = await request(settings, `/api/calendar/${entityId}/events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`);
  return (await res.json()) as CalendarEvent[];
}

export async function createCalendarEvent(settings: ConnectionSettings, entityId: string, data: { summary: string; start_date_time: string; end_date_time: string; description?: string; location?: string }): Promise<void> {
  await request(settings, '/api/services/calendar/create_event', { method: 'POST', body: JSON.stringify({ entity_id: entityId, ...data }) });
}

export type TodoItem = { uid: string; summary: string; status: 'needs_action' | 'completed'; due?: string };

function wsUrl(baseUrl: string) {
  return `${normalizeUrl(baseUrl).replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')}/api/websocket`;
}

export function wsCommand(settings: ConnectionSettings, payload: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl(settings.baseUrl));
    let id = 0;
    const timer = setTimeout(() => { socket.close(); reject(new Error('WebSocket request timed out')); }, 10000);
    socket.onmessage = event => {
      const message = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (message.type === 'auth_required') socket.send(JSON.stringify({ type: 'auth', access_token: settings.token }));
      if (message.type === 'auth_ok') { id = Math.floor(Math.random() * 1000000) + 1; socket.send(JSON.stringify({ id, ...payload })); }
      if (message.type === 'auth_invalid') { clearTimeout(timer); socket.close(); reject(new Error('Authentication failed')); }
      if (message.type === 'result' && message.id === id) {
        clearTimeout(timer);
        socket.close();
        if (message.success === false) reject(new Error(String((message.error as { message?: string } | undefined)?.message ?? 'Command failed')));
        else resolve(message.result);
      }
    };
    socket.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket connection failed')); };
  });
}

export async function getTodoItems(settings: ConnectionSettings, entityId: string): Promise<TodoItem[]> {
  const result = (await wsCommand(settings, { type: 'call_service', domain: 'todo', service: 'get_items', target: { entity_id: entityId }, return_response: true })) as {
    response?: Record<string, { items?: TodoItem[] }>;
  };
  return result?.response?.[entityId]?.items ?? [];
}

export async function addTodoItem(settings: ConnectionSettings, entityId: string, summary: string): Promise<void> {
  await request(settings, '/api/services/todo/add_item', { method: 'POST', body: JSON.stringify({ entity_id: entityId, item: summary }) });
}

export async function setTodoItemStatus(settings: ConnectionSettings, entityId: string, uid: string, status: 'needs_action' | 'completed'): Promise<void> {
  await request(settings, '/api/services/todo/update_item', { method: 'POST', body: JSON.stringify({ entity_id: entityId, item: uid, status }) });
}

export async function removeTodoItem(settings: ConnectionSettings, entityId: string, uid: string): Promise<void> {
  await request(settings, '/api/services/todo/remove_item', { method: 'POST', body: JSON.stringify({ entity_id: entityId, item: uid }) });
}

export async function callAlarmoArm(settings: ConnectionSettings, entityId: string, mode: string, force = false): Promise<void> {
  const data: Record<string, unknown> = { entity_id: entityId, mode, force };
  if (settings.alarmCode.trim()) data.code = settings.alarmCode.trim();
  await request(settings, '/api/services/alarmo/arm', { method: 'POST', body: JSON.stringify(data) });
}
export async function callAlarmoDisarm(settings: ConnectionSettings, entityId: string, codeOverride?: string): Promise<void> {
  const data: Record<string, unknown> = { entity_id: entityId };
  const code = codeOverride ?? settings.alarmCode;
  if (code.trim()) data.code = code.trim();
  await request(settings, '/api/services/alarmo/disarm', { method: 'POST', body: JSON.stringify(data) });
}
export async function skipAlarmoDelay(settings: ConnectionSettings, entityId: string): Promise<void> {
  await request(settings, '/api/services/alarmo/skip_delay', { method: 'POST', body: JSON.stringify({ entity_id: entityId }) });
}
export const authHeaders = (settings: ConnectionSettings) => ({ Authorization: `Bearer ${settings.token}` });
export const cameraSnapshotUrl = (settings: ConnectionSettings, entityId: string, nonce: number, cameraToken?: string) => {
  const query = new URLSearchParams({ _: String(nonce) });
  if (cameraToken) query.set('token', cameraToken);
  return `${normalizeUrl(settings.baseUrl)}/api/camera_proxy/${encodeURIComponent(entityId)}?${query.toString()}`;
};

export const cameraStreamUrl = (settings: ConnectionSettings, entityId: string, cameraToken?: string) => {
  const query = new URLSearchParams();
  if (cameraToken) query.set('token', cameraToken);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return `${normalizeUrl(settings.baseUrl)}/api/camera_proxy_stream/${encodeURIComponent(entityId)}${suffix}`;
};
export function absoluteHaUrl(settings: ConnectionSettings, path: string): string { return /^https?:\/\//i.test(path) ? path : `${normalizeUrl(settings.baseUrl)}${path.startsWith('/') ? '' : '/'}${path}`; }
export function findAlarmoEntities(states: HaEntity[]): HaEntity[] {
  return states.filter(x => x.entity_id.startsWith('alarm_control_panel.')).sort((a,b) => Number(isAlarmo(b))-Number(isAlarmo(a)));
}
function isAlarmo(entity: HaEntity): boolean { return `${entity.entity_id} ${String(entity.attributes.friendly_name ?? '')}`.toLowerCase().includes('alarmo'); }
