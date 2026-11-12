import type { ConnectionSettings, HaEntity } from '../types/homeAssistant';
import { buildRecurringEventCommand, type RecurringEventInput } from './calendarCommands';
import { refreshAccessToken } from './oauth';
import { getLiveSettings, updateLiveSettings } from '../storage/liveSettings';
import { normalizeUrl } from './url';

export { normalizeUrl };
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? `HTTP ${response.status}: ${text.slice(0, 500)}`;
  } catch { return `HTTP ${response.status}: ${text.slice(0, 500)}`; }
}

const REFRESH_MARGIN_MS = 60_000; // نجدد قبل الانتهاء بدقيقة، تجنبًا لسباق الوقت أثناء الطلب نفسه
let refreshInFlight: Promise<string> | null = null;

/** بترجع توكن صالح للاستخدام - لو الإعدادات OAuth والتوكن قرّب ينتهي، تجدده تلقائيًا أولًا. */
export async function ensureFreshToken(settings: ConnectionSettings): Promise<string> {
  if (settings.authMethod !== 'oauth' || !settings.refreshToken) return settings.token;
  const expiresAt = settings.tokenExpiresAt ?? 0;
  if (Date.now() < expiresAt - REFRESH_MARGIN_MS && settings.accessToken) return settings.accessToken;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const fresh = await refreshAccessToken(settings.baseUrl, settings.refreshToken!);
        const patch = { accessToken: fresh.access_token, tokenExpiresAt: Date.now() + fresh.expires_in * 1000 };
        const live = getLiveSettings();
        if (live && live.baseUrl === settings.baseUrl) await updateLiveSettings(patch);
        return fresh.access_token;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

async function request(settings: ConnectionSettings, path: string, init?: RequestInit): Promise<Response> {
  const token = await ensureFreshToken(settings);
  const response = await fetch(`${normalizeUrl(settings.baseUrl)}${path}`, {
    ...init,
    headers: { ...headers(token), ...(init?.headers ?? {}) },
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

export type RegistryEntry = { entity_id: string; device_id?: string | null };

// سجل الكيانات من Home Assistant (أمر WebSocket). بيدّينا device_id لكل
// كيان عشان نقدر نجمع كيانات كل كاميرا مع بعض مهما كان التكامل أو الماركة.
export async function getEntityRegistry(settings: ConnectionSettings): Promise<RegistryEntry[]> {
  try {
    const result = await wsCommand(settings, { type: 'config/entity_registry/list' });
    if (Array.isArray(result)) return result as RegistryEntry[];
  } catch {
    // السجل مش متاح أو فشل الاتصال.
  }
  return [];
}

// كل الكيانات اللي على نفس جهاز الكاميرا. بنعتمد على السجل عشان نجمع كيانات
// كل كاميرا بشكل عام لأي ماركة. لو السجل مش متاح نرجع لمطابقة أجزاء الاسم.
export function cameraSiblings(registry: RegistryEntry[], states: HaEntity[], cameraEntityId: string): string[] {
  const reg = registry.find(e => e.entity_id === cameraEntityId);
  const deviceId = reg?.device_id ?? null;
  if (deviceId) return registry.filter(e => e.device_id === deviceId).map(e => e.entity_id);
  const slug = cameraEntityId.split('.')[1] ?? '';
  const parts = slug.split('_').filter(p => p.length > 2);
  return parts.length ? states.filter(s => parts.some(p => s.entity_id.includes(p))).map(s => s.entity_id) : [];
}

const PTZ_DIR: Record<PtzDirection, RegExp> = {
  left: /(^|[_-])left([_-]|$)/i,
  right: /(^|[_-])right([_-]|$)/i,
  up: /(^|[_-])up([_-]|$)/i,
  down: /(^|[_-])down([_-]|$)/i,
  zoomIn: /zoom[_-]?(in|tele)|(^|[_-])tele([_-]|$)/i,
  zoomOut: /zoom[_-]?(out|wide)|(^|[_-])wide([_-]|$)/i,
};

const PTZ_RE = /ptz|pan|tilt|zoom/i;

// أزرار الحركة (button) من كيانات نفس جهاز الكاميرا اللي ليها علاقة بـPTZ.
// عام لأي ماركة — مش معتمد على اسم أو تكامل معيّن.
export function ptzButtons(registry: RegistryEntry[], states: HaEntity[], cameraEntityId: string): Partial<Record<PtzDirection | 'stop', string>> {
  const ctrl = cameraSiblings(registry, states, cameraEntityId).filter(id => id.startsWith('button.') && PTZ_RE.test(id));
  const pick = (re: RegExp) => ctrl.find(id => re.test(id));
  return {
    left: pick(PTZ_DIR.left), right: pick(PTZ_DIR.right),
    up: pick(PTZ_DIR.up), down: pick(PTZ_DIR.down),
    zoomIn: pick(PTZ_DIR.zoomIn), zoomOut: pick(PTZ_DIR.zoomOut),
    stop: ctrl.find(id => /stop/i.test(id)),
  };
}

// الكاميرا تعتبر PTZ لو attributes بتاعتها فيها pan/tilt/ptz، أو لو على نفس
// جهازها أي كيان تحكّم (button/switch/select/number/cover) ليه علاقة بـPTZ.
export function cameraHasPtz(registry: RegistryEntry[], states: HaEntity[], cameraEntityId: string): boolean {
  const cam = states.find(s => s.entity_id === cameraEntityId);
  if (cam) for (const key of Object.keys(cam.attributes)) if (/ptz|pan[_-]?tilt|^pan$|^tilt$/i.test(key)) return true;
  return cameraSiblings(registry, states, cameraEntityId).some(id => /^(button|switch|select|number|cover)\./.test(id) && PTZ_RE.test(id));
}

export async function ptzMove(settings: ConnectionSettings, registry: RegistryEntry[], states: HaEntity[], cameraEntityId: string, direction: PtzDirection): Promise<void> {
  const id = ptzButtons(registry, states, cameraEntityId)[direction];
  if (id) { await pressButton(settings, id); return; }
  try {
    const data: Record<string, unknown> = { move_mode: 'ContinuousMove', speed: 1, distance: 0.5 };
    if (direction === 'left' || direction === 'right') data.pan = direction.toUpperCase();
    if (direction === 'up' || direction === 'down') data.tilt = direction.toUpperCase();
    if (direction === 'zoomIn') data.zoom = 'ZOOM_IN';
    if (direction === 'zoomOut') data.zoom = 'ZOOM_OUT';
    await callOnvifPtz(settings, cameraEntityId, data);
  } catch {
    // مفيش طريقة متاحة لهذه الكاميرا.
  }
}

export async function ptzStop(settings: ConnectionSettings, registry: RegistryEntry[], states: HaEntity[], cameraEntityId: string): Promise<void> {
  const stop = ptzButtons(registry, states, cameraEntityId).stop;
  if (stop) { await pressButton(settings, stop); return; }
  try {
    await callOnvifPtz(settings, cameraEntityId, { move_mode: 'Stop' });
  } catch {
    // مفيش أمر إيقاف متاح.
  }
}

export function findCalendarEntities(states: HaEntity[]): HaEntity[] {
  return states.filter(e => e.entity_id.startsWith('calendar.'));
}
export function findTodoEntities(states: HaEntity[]): HaEntity[] {
  return states.filter(e => e.entity_id.startsWith('todo.'));
}

export type CalendarEvent = { summary: string; start: string; end: string; description?: string; location?: string; uid?: string };
type RawCalendarEvent = { summary: string; start: string | { dateTime?: string; date?: string }; end: string | { dateTime?: string; date?: string }; description?: string; location?: string; uid?: string };

// HA بترجع start/end كـ string مباشر في بعض الإصدارات، وككائن
// {dateTime:...} أو {date:...} (للأحداث طول اليوم) في إصدارات تانية.
// من غير التطبيع ده، new Date() على كائن كامل بيرجع تاريخ غير صالح
// ("Invalid Date") ويكسّر التطبيق بالكامل.
function normalizeEventDate(v: string | { dateTime?: string; date?: string }): string {
  if (typeof v === 'string') return v;
  return v.dateTime ?? v.date ?? '';
}

export async function getCurrentUserId(settings: ConnectionSettings): Promise<string | undefined> {
  try {
    const result = (await wsCommand(settings, { type: 'auth/current_user' })) as { id?: string };
    return result?.id;
  } catch {
    return undefined;
  }
}

// بيرجّع لو المستخدم الحالي أدمن في Home Assistant — ده اللي بيحدد مين يقدر
// ينشر إعداد العيلة من التطبيق.
export async function isCurrentUserAdmin(settings: ConnectionSettings): Promise<boolean> {
  try {
    const result = (await wsCommand(settings, { type: 'auth/current_user' })) as {
      is_admin?: boolean;
      is_owner?: boolean;
    };
    return result?.is_admin === true || result?.is_owner === true;
  } catch {
    return false;
  }
}

// ينشر إعداد العيلة المركزي عبر خدمة مكوّن secure_family (للأدمن بس —
// المكوّن نفسه بيرفض غير الأدمن من جهة السيرفر).
export async function publishFamilyConfig(
  settings: ConnectionSettings,
  config: Record<string, unknown>,
): Promise<void> {
  await request(settings, '/api/services/secure_family/set_config', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
}

// ينشئ Long-Lived Access Token لخدمة المراقبة في الخلفية. توكن OAuth قصير
// العمر (بينتهي بعد ~نص ساعة)، والخدمة النيتف مش بتقدر تجدده والتطبيق مقفول
// فبتفشل المصادقة وتموت. LLAT بيدوم سنين، فالمراقبة تفضل شغّالة بإستمرار.
// قائمة الحساسات المضافة فعليًا في Alarmo (أمر WebSocket alarmo/sensors
// بيرجّع dict مفتاحه entity_id). دي المصدر الموثوق بدل التخمين أو الاختيار
// اليدوي. لو Alarmo قديم ومعندوش الأمر ده، بترجّع [] فنرجع للطريقة اليدوية.
export async function getAlarmoSensors(settings: ConnectionSettings): Promise<string[]> {
  try {
    const result = await wsCommand(settings, { type: 'alarmo/sensors' });
    if (result && typeof result === 'object') return Object.keys(result as Record<string, unknown>);
  } catch {
    // الأمر مش متاح (نسخة Alarmo قديمة) أو فشل الاتصال - نرجع للطريقة اليدوية.
  }
  return [];
}

export async function createMonitorToken(settings: ConnectionSettings): Promise<string | undefined> {
  const result = await wsCommand(settings, { type: 'auth/long_lived_access_token', client_name: `Secure Family Monitor ${Date.now()}`, lifespan: 3650 });
  return typeof result === 'string' ? result : undefined;
}

// كيانات person.* في HA ممكن تكون مربوطة بحساب مستخدم فعلي عن طريق
// user_id في attributes. لو المستخدم مسجل دخول بحسابه هو نفسه (OAuth)،
// نقدر نلاقي شخصه تلقائيًا من غير ما نطلب منه يختار يدويًا.
export function findPersonByUserId(people: HaEntity[], userId?: string): HaEntity | undefined {
  if (!userId) return undefined;
  return people.find(p => p.attributes.user_id === userId);
}

export async function getCalendarEvents(settings: ConnectionSettings, entityId: string, startISO: string, endISO: string): Promise<CalendarEvent[]> {
  const res = await request(settings, `/api/calendars/${entityId}?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`);
  const raw = (await res.json()) as RawCalendarEvent[];
  return raw
    .map(e => ({ ...e, start: normalizeEventDate(e.start), end: normalizeEventDate(e.end) }))
    .filter(e => e.start);
}

export async function createCalendarEvent(settings: ConnectionSettings, entityId: string, data: { summary: string; start_date_time: string; end_date_time: string; description?: string; location?: string }): Promise<void> {
  await request(settings, '/api/services/calendar/create_event', { method: 'POST', body: JSON.stringify({ entity_id: entityId, ...data }) });
}

// الأحداث المتكررة بتعدّي من WebSocket مش من الخدمة أعلاه (راجع calendarCommands.ts)
export async function createRecurringCalendarEvent(settings: ConnectionSettings, entityId: string, input: RecurringEventInput): Promise<void> {
  await wsCommand(settings, buildRecurringEventCommand(entityId, input));
}

export type TodoItem = { uid: string; summary: string; status: 'needs_action' | 'completed'; due?: string; description?: string };

function wsUrl(baseUrl: string) {
  return `${normalizeUrl(baseUrl).replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')}/api/websocket`;
}

export async function wsCommand(settings: ConnectionSettings, payload: Record<string, unknown>): Promise<unknown> {
  const token = await ensureFreshToken(settings);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (settled) return; settled = true; fn(); };
    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl(settings.baseUrl));
    } catch (e) {
      finish(() => reject(e instanceof Error ? e : new Error('Failed to open WebSocket')));
      return;
    }
    let id = 0;
    const timer = setTimeout(() => {
      finish(() => { try { socket.close(); } catch { /* ignore */ } reject(new Error('WebSocket request timed out')); });
    }, 8000);
    socket.onmessage = event => {
      try {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (message.type === 'auth_required') { socket.send(JSON.stringify({ type: 'auth', access_token: token })); return; }
        if (message.type === 'auth_ok') { id = Math.floor(Math.random() * 1000000) + 1; socket.send(JSON.stringify({ id, ...payload })); return; }
        if (message.type === 'auth_invalid') { clearTimeout(timer); finish(() => { socket.close(); reject(new Error('Authentication failed')); }); return; }
        if (message.type === 'result' && message.id === id) {
          clearTimeout(timer);
          finish(() => {
            socket.close();
            if (message.success === false) reject(new Error(String((message.error as { message?: string } | undefined)?.message ?? 'Command failed')));
            else resolve(message.result);
          });
        }
      } catch (e) {
        clearTimeout(timer);
        finish(() => reject(e instanceof Error ? e : new Error('Failed to parse WebSocket response')));
      }
    };
    socket.onerror = () => { clearTimeout(timer); finish(() => reject(new Error('WebSocket connection failed'))); };
    socket.onclose = () => { clearTimeout(timer); finish(() => reject(new Error('WebSocket closed before a response arrived'))); };
  });
}

export async function getTodoItems(settings: ConnectionSettings, entityId: string): Promise<TodoItem[]> {
  const result = (await wsCommand(settings, { type: 'call_service', domain: 'todo', service: 'get_items', target: { entity_id: entityId }, return_response: true })) as {
    response?: Record<string, { items?: TodoItem[] }>;
  };
  return result?.response?.[entityId]?.items ?? [];
}

export async function addTodoItem(settings: ConnectionSettings, entityId: string, summary: string, dueDate?: string, description?: string, dueDateTime?: string): Promise<void> {
  const data: Record<string, unknown> = { entity_id: entityId, item: summary };
  if (dueDateTime) data.due_datetime = dueDateTime;
  else if (dueDate) data.due_date = dueDate;
  if (description) data.description = description;
  await request(settings, '/api/services/todo/add_item', { method: 'POST', body: JSON.stringify(data) });
}

// لتعديل عنصر موجود (بدل إضافة عنصر جديد) - HA بتستخدم نفس service
// بس بتحدد العنصر بـ uid وتديله rename/due_date/description جدد.
export async function updateTodoItemDetails(settings: ConnectionSettings, entityId: string, uid: string, changes: { summary?: string; dueDate?: string; description?: string; dueDateTime?: string }): Promise<void> {
  const data: Record<string, unknown> = { entity_id: entityId, item: uid };
  if (changes.summary !== undefined) data.rename = changes.summary;
  if (changes.dueDateTime) data.due_datetime = changes.dueDateTime;
  else if (changes.dueDate !== undefined) data.due_date = changes.dueDate || null;
  if (changes.description !== undefined) data.description = changes.description;
  await request(settings, '/api/services/todo/update_item', { method: 'POST', body: JSON.stringify(data) });
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
export const authHeaders = (settings: ConnectionSettings) => {
  const live = getLiveSettings();
  const effective = live && live.baseUrl === settings.baseUrl ? live : settings;
  const token = effective.authMethod === 'oauth' && effective.accessToken ? effective.accessToken : effective.token;
  return { Authorization: `Bearer ${token}` };
};
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
export type DashboardInfo = { urlPath: string; title: string };

export type HistoryPoint = { lat: number; lng: number; at: string };

export async function getPersonHistory(settings: ConnectionSettings, entityId: string, hours = 24): Promise<HistoryPoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  const path = `/api/history/period/${start.toISOString()}?filter_entity_id=${encodeURIComponent(entityId)}&end_time=${encodeURIComponent(end.toISOString())}`;
  const response = await request(settings, path);
  const data = (await response.json()) as Array<Array<{ attributes?: { latitude?: number; longitude?: number }; last_changed?: string }>>;
  const states = data[0] ?? [];
  return states
    .map(s => ({ lat: Number(s.attributes?.latitude), lng: Number(s.attributes?.longitude), at: s.last_changed ?? '' }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export async function listDashboards(settings: ConnectionSettings): Promise<DashboardInfo[]> {
  const defaultDashboard: DashboardInfo = { urlPath: 'lovelace', title: 'Overview' };
  try {
    const result = (await wsCommand(settings, { type: 'lovelace/dashboards/list' })) as Array<{ url_path?: string; title?: string }>;
    const extra = (Array.isArray(result) ? result : [])
      .filter(d => typeof d.url_path === 'string' && d.url_path !== defaultDashboard.urlPath)
      .map(d => ({ urlPath: d.url_path as string, title: d.title ?? d.url_path ?? '' }));
    return [defaultDashboard, ...extra];
  } catch {
    // لو الأمر فشل لأي سبب (نسخة HA قديمة، صلاحيات، إلخ)، منوقفش
    // المعالج - نرجع الداشبورد الافتراضي بس كخيار وحيد
    return [defaultDashboard];
  }
}

export function findAlarmoEntities(states: HaEntity[]): HaEntity[] {
  return states.filter(x => x.entity_id.startsWith('alarm_control_panel.')).sort((a,b) => Number(isAlarmo(b))-Number(isAlarmo(a)));
}
function isAlarmo(entity: HaEntity): boolean { return `${entity.entity_id} ${String(entity.attributes.friendly_name ?? '')}`.toLowerCase().includes('alarmo'); }
