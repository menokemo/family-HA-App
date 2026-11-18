// عميل WebSocket لـ Home Assistant — نداء أمر واحد مع المصادقة والمهلة.
import type { ConnectionSettings } from '../types/homeAssistant';
import { ensureFreshToken } from './client';
import { normalizeUrl } from './url';

function wsUrl(baseUrl: string) {
  return `${normalizeUrl(baseUrl).replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')}/api/websocket`;
}

// المهلة الافتراضية 8ث للأوامر السريعة؛ نمرّر أطول للنداءات اللي بتضرب على خدمة
// خارجية بطيئة (زي Mealie) عبر timeoutMs.
export async function wsCommand(settings: ConnectionSettings, payload: Record<string, unknown>, timeoutMs = 8000): Promise<unknown> {
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
    }, timeoutMs);
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

