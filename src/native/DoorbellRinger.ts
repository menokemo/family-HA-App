import { NativeModules } from 'react-native';

// موديول native بيشغّل نغمة جرس من ملفات التطبيق (res/raw) — مش نغمة الموبايل.
// متوفّر بعد build APK فيه DoorbellRingerModule؛ لو مش موجود بنرجع للنغمة الأقدم.
const Native = (NativeModules as { DoorbellRinger?: {
  startRinging: (tone: string) => void;
  stopRinging: () => void;
  preview: (tone: string) => void;
} }).DoorbellRinger;

export type DoorbellTone = 'ding_dong' | 'chime' | 'bell';

export const DOORBELL_TONES: DoorbellTone[] = ['ding_dong', 'chime', 'bell'];
export const DEFAULT_DOORBELL_TONE: DoorbellTone = 'ding_dong';

/** هل الموديول الـnative متاح (APK محدّث)؟ */
export const doorbellRingerAvailable = !!Native;

export function startDoorbellRinging(tone: DoorbellTone = DEFAULT_DOORBELL_TONE): void {
  Native?.startRinging(tone);
}

export function stopDoorbellRinging(): void {
  Native?.stopRinging();
}

/** معاينة نغمة مرة واحدة (في إعدادات الأدمن). */
export function previewDoorbellTone(tone: DoorbellTone): void {
  Native?.preview(tone);
}
