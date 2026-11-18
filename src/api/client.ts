// طبقة النقل الأساسية لـ Home Assistant: توكن صالح، نداء REST، ونداء خدمة.
// مفصولة عشان باقي الوحدات تعتمد عليها في اتجاه واحد (مفيش دوّارة استيراد).
import type { ConnectionSettings } from '../types/homeAssistant';
import { refreshAccessToken } from './oauth';
import { getLiveSettings, updateLiveSettings } from '../storage/liveSettings';
import { normalizeUrl } from './url';

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

export async function request(settings: ConnectionSettings, path: string, init?: RequestInit): Promise<Response> {
  const token = await ensureFreshToken(settings);
  const response = await fetch(`${normalizeUrl(settings.baseUrl)}${path}`, {
    ...init,
    headers: { ...headers(token), ...(init?.headers ?? {}) },
  });
  // بنضيف الـ method + المسار لرسالة الخطأ عشان أي 401/غيره يبان مصدره بالظبط
  // (بدل "Unauthorized" مجرّدة مش معروف جاية من أنهي نداء).
  if (!response.ok) throw new Error(`${await readError(response)} · ${init?.method ?? 'GET'} ${path.split('?')[0]}`);
  return response;
}

export async function callService(settings: ConnectionSettings, domain: string, service: string, data: Record<string, unknown>): Promise<void> {
  await request(settings, `/api/services/${domain}/${service}`, { method: 'POST', body: JSON.stringify(data) });
}
