import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform } from 'react-native';

export type LiveLocation = { latitude: number; longitude: number };

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
    pos => onUpdate({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
    () => undefined,
    { enableHighAccuracy: true, distanceFilter: 15, interval: 15000, fastestInterval: 10000 },
  );
  return () => Geolocation.clearWatch(id);
}
