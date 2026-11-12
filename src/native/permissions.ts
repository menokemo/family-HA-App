import { Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';

type PermNative = {
  canUseFullScreenIntent?: () => Promise<boolean>;
  openFullScreenIntentSettings?: () => Promise<boolean>;
  canDrawOverlays?: () => Promise<boolean>;
  openOverlaySettings?: () => Promise<boolean>;
  isIgnoringBatteryOptimizations?: () => Promise<boolean>;
  requestIgnoreBatteryOptimizations?: () => Promise<boolean>;
};

const native = NativeModules.AlarmMonitor as PermNative | undefined;

// كل الأذونات اللي التطبيق محتاجها عشان يشتغل بالكامل (خصوصًا في الخلفية).
export type PermKey =
  | 'notifications'
  | 'location'
  | 'backgroundLocation'
  | 'battery'
  | 'overlay'
  | 'fullScreen';

export const PERMISSION_KEYS: PermKey[] = [
  'notifications',
  'location',
  'backgroundLocation',
  'battery',
  'overlay',
  'fullScreen',
];

const BACKGROUND_LOCATION = 'android.permission.ACCESS_BACKGROUND_LOCATION' as const;

export async function checkPermission(key: PermKey): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const version = Platform.Version as number;
  switch (key) {
    case 'notifications':
      return version < 33 ? true : PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    case 'location':
      return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    case 'backgroundLocation':
      return version < 29 ? true : PermissionsAndroid.check(BACKGROUND_LOCATION as never);
    case 'battery':
      return (await native?.isIgnoringBatteryOptimizations?.()) ?? true;
    case 'overlay':
      return (await native?.canDrawOverlays?.()) ?? true;
    case 'fullScreen':
      return (await native?.canUseFullScreenIntent?.()) ?? true;
  }
}

// الإذن ممكن يتطلب بنافذة مباشرة (الإشعارات/الموقع) أو بفتح شاشة إعدادات
// النظام (الخلفية/البطارية/العرض فوق/Full-screen). بنرجّع الحالة بعدها.
export async function requestPermission(key: PermKey): Promise<void> {
  if (Platform.OS !== 'android') return;
  const version = Platform.Version as number;
  switch (key) {
    case 'notifications':
      if (version >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      return;
    case 'location':
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      return;
    case 'backgroundLocation':
      // أندرويد 11+ مابيمنحش "طول الوقت" من نافذة عادية — لازم المستخدم
      // يختارها من إعدادات التطبيق. فبنجرّب الطلب، ولو مااتمنحش بنفتح
      // الإعدادات عشان يختار "السماح طول الوقت".
      if (version < 29) return;
      {
        const result = await PermissionsAndroid.request(BACKGROUND_LOCATION as never);
        if (result !== PermissionsAndroid.RESULTS.GRANTED) await Linking.openSettings();
      }
      return;
    case 'battery':
      await native?.requestIgnoreBatteryOptimizations?.();
      return;
    case 'overlay':
      await native?.openOverlaySettings?.();
      return;
    case 'fullScreen':
      await native?.openFullScreenIntentSettings?.();
      return;
  }
}
