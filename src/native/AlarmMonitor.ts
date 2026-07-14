import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

type AlarmMonitorNative = {
  start: (baseUrl: string, token: string, entityId: string, alarmCode: string) => Promise<boolean>;
  stop: () => Promise<boolean>;
  isRunning: () => Promise<boolean>;
};

const native = NativeModules.AlarmMonitor as AlarmMonitorNative | undefined;

export async function startAlarmMonitor(baseUrl: string, token: string, entityId: string, alarmCode: string): Promise<boolean> {
  if (!native) return false;
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch {
      /* المستخدم يقدر يرفض، الخدمة هتشتغل برضو بس من غير تنبيهات ظاهرة */
    }
  }
  return native.start(baseUrl, token, entityId, alarmCode);
}

export function stopAlarmMonitor(): Promise<boolean> {
  return native?.stop() ?? Promise.resolve(false);
}

export function isAlarmMonitorRunning(): Promise<boolean> {
  return native?.isRunning() ?? Promise.resolve(false);
}
