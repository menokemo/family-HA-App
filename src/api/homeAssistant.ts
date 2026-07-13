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

export async function callAlarmoArm(settings: ConnectionSettings, entityId: string, mode: string, force = false): Promise<void> {
  const data: Record<string, unknown> = { entity_id: entityId, mode, force };
  if (settings.alarmCode.trim()) data.code = settings.alarmCode.trim();
  await request(settings, '/api/services/alarmo/arm', { method: 'POST', body: JSON.stringify(data) });
}
export async function callAlarmoDisarm(settings: ConnectionSettings, entityId: string): Promise<void> {
  const data: Record<string, unknown> = { entity_id: entityId };
  if (settings.alarmCode.trim()) data.code = settings.alarmCode.trim();
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
