import { normalizeUrl } from './homeAssistant';

// client_id و redirect_uri نفس القيمة بالظبط - HA بيتطلب إنهم يكونوا
// بنفس النطاق، والاتنين متطابقين يحققوا الشرط ده تلقائيًا من غير
// الحاجة لاستضافة أي صفحة حقيقية. الرابط ده منعمرش هيتفتح فعليًا -
// التطبيق بيعترضه جوه الـ WebView قبل ما يوصله (راجع
// OAuthLoginWebView.tsx)، فمش لازم يكون شغال كموقع حقيقي.
export const OAUTH_CLIENT_ID = 'https://familyha.app/callback';
export const OAUTH_REDIRECT_URI = 'https://familyha.app/callback';

export function buildAuthorizeUrl(baseUrl: string): string {
  const params = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: 'code',
  });
  return `${normalizeUrl(baseUrl)}/auth/authorize?${params.toString()}`;
}

export function extractAuthCode(url: string): string | null {
  if (!url.startsWith(OAUTH_REDIRECT_URI)) return null;
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('code');
  } catch {
    return null;
  }
}

export type TokenResult = { access_token: string; refresh_token?: string; expires_in: number };

async function tokenRequest(baseUrl: string, body: Record<string, string>): Promise<TokenResult> {
  const response = await fetch(`${normalizeUrl(baseUrl)}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`فشل تسجيل الدخول: HTTP ${response.status}${text ? ` — ${text.slice(0, 200)}` : ''}`);
  }
  return response.json() as Promise<TokenResult>;
}

export function exchangeCodeForTokens(baseUrl: string, code: string): Promise<TokenResult> {
  return tokenRequest(baseUrl, { grant_type: 'authorization_code', code, client_id: OAUTH_CLIENT_ID });
}

export function refreshAccessToken(baseUrl: string, refreshToken: string): Promise<TokenResult> {
  return tokenRequest(baseUrl, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: OAUTH_CLIENT_ID });
}
