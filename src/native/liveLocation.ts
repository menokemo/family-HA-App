import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform } from 'react-native';

export type LiveLocation = { latitude: number; longitude: number; accuracy?: number };

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export function watchLiveLocation(onUpdate: (loc: LiveLocation) => void): () => void {
  const id = Geolocation.watchPosition(
    pos => {
      const accuracy = pos.coords.accuracy;
      // نتجاهل القراءات ضعيفة الدقة (أكبر من 50 متر) عشان ما تحركش نقطة
      // موقعي على الخريطة بالغلط وإحنا واقفين مكاننا (تشويش GPS).
      if (typeof accuracy === 'number' && accuracy > 50) return;
      onUpdate({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy });
    },
    () => undefined,
    // distanceFilter أكبر = النقطة ما تتحركش إلا لو اتحركت فعلاً 25 متر+.
    { enableHighAccuracy: true, distanceFilter: 25, interval: 20000, fastestInterval: 10000 },
  );
  return () => Geolocation.clearWatch(id);
}
