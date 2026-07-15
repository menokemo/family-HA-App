import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

type AlarmMonitorNative = {
  start: (baseUrl: string, token: string, entityId: string, alarmCode: string, language: string, sirenTone: string, biometricEnabled: boolean) => Promise<boolean>;
  stop: () => Promise<boolean>;
  isRunning: () => Promise<boolean>;
  canUseFullScreenIntent: () => Promise<boolean>;
  openFullScreenIntentSettings: () => Promise<boolean>;
  canDrawOverlays: () => Promise<boolean>;
  openOverlaySettings: () => Promise<boolean>;
};

const native = NativeModules.AlarmMonitor as AlarmMonitorNative | undefined;

export function canUseFullScreenIntent(): Promise<boolean> {
  return native?.canUseFullScreenIntent() ?? Promise.resolve(true);
}

export function openFullScreenIntentSettings(): Promise<boolean> {
  return native?.openFullScreenIntentSettings() ?? Promise.resolve(false);
}

export function canDrawOverlays(): Promise<boolean> {
  return native?.canDrawOverlays() ?? Promise.resolve(true);
}

export function openOverlaySettings(): Promise<boolean> {
  return native?.openOverlaySettings() ?? Promise.resolve(false);
}

export async function startAlarmMonitor(baseUrl: string, token: string, entityId: string, alarmCode: string, language: string, sirenTone: string, biometricEnabled: boolean): Promise<boolean> {
  if (!native) return false;
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch {
      /* المستخدم يقدر يرفض، الخدمة هتشتغل برضو بس من غير تنبيهات ظاهرة */
    }
  }
  return native.start(baseUrl, token, entityId, alarmCode, language, sirenTone, biometricEnabled);
}

export function stopAlarmMonitor(): Promise<boolean> {
  return native?.stop() ?? Promise.resolve(false);
}

export function isAlarmMonitorRunning(): Promise<boolean> {
  return native?.isRunning() ?? Promise.resolve(false);
}
