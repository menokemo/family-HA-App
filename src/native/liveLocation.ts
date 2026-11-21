import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform } from 'react-native';

export type LiveLocation = { latitude: number; longitude: number; accuracy?: number };

// نجبر المكتبة تستخدم Google Play Services (Fused Location) بدل LocationManager
// الخام. الافتراضي "auto" في المكتبة بيروح للـ Android الخام (فيه باگ معروف
// إنه مابيحوّلش لـ playServices)، واللي بيطلع موقع مهتز/غير دقيق جوّه المباني -
// على عكس Find Hub/Google Maps اللي بيستخدموا Fused (بيدمج GPS + واي‑فاي + شبكة).
let configured = false;
function ensureFusedProvider(): void {
  if (configured || Platform.OS !== 'android') return;
  configured = true;
  try {
    Geolocation.setRNConfiguration({ locationProvider: 'playServices', skipPermissionRequests: false });
  } catch {
    // لو الإعداد مش مدعوم في نسخة ما، نكمّل بالافتراضي.
  }
}

export async function requestLocationPermission(): Promise<boolean> {
  ensureFusedProvider();
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export function watchLiveLocation(onUpdate: (loc: LiveLocation) => void): () => void {
  ensureFusedProvider();
  const id = Geolocation.watchPosition(
    pos => {
      const accuracy = pos.coords.accuracy;
      // نتجاهل القراءات ضعيفة الدقة (أكبر من 50 متر) عشان ما تحركش نقطة
      // موقعي على الخريطة بالغلط وإحنا واقفين مكاننا (تشويش GPS).
      if (typeof accuracy === 'number' && accuracy > 50) return;
      onUpdate({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy });
    },
    () => undefined,
    // تتبّع لحظي سلس (زي Find Hub) طول ما الخريطة مفتوحة: تحديث كل ~ثانية-ثانيتين
    // وبمسافة صغيرة عشان النقطة تتابع المشي والسواقة. فلتر الدقة فوق (>50م) +
    // distanceFilter 6م بيمنعوا تشويش الوقوف مكانك. الـwatch بيقف أول ما تسيب الخريطة.
    { enableHighAccuracy: true, distanceFilter: 6, interval: 2000, fastestInterval: 1000 },
  );
  return () => Geolocation.clearWatch(id);
}
