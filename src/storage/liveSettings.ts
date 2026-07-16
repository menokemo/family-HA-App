import type { ConnectionSettings } from '../types/homeAssistant';
import { saveSettings } from './settings';

// نسخة "حية" من الإعدادات، منفصلة عن React state، عشان أي دالة API
// (حتى لو مش مكوّن React) تقدر توصل لآخر توكن مُجدَّد فورًا من غير
// ما تحتاج تستنى إعادة render. بيتزامن مع React state عن طريق
// setLiveSettings في AppContent كل ما settings تتغيّر.
let current: ConnectionSettings | null = null;
const listeners = new Set<(s: ConnectionSettings) => void>();

export function setLiveSettings(s: ConnectionSettings): void {
  current = s;
}

export function getLiveSettings(): ConnectionSettings | null {
  return current;
}

export function onLiveSettingsChange(listener: (s: ConnectionSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** بتحدّث النسخة الحية + تحفظها بشكل دائم + تبلّغ أي مستمعين (زي AppContent) بالتحديث. */
export async function updateLiveSettings(patch: Partial<ConnectionSettings>): Promise<ConnectionSettings | null> {
  if (!current) return null;
  current = { ...current, ...patch };
  await saveSettings(current);
  listeners.forEach(l => l(current!));
  return current;
}
