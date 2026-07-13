import * as Keychain from 'react-native-keychain';
import type {ConnectionSettings} from '../types/homeAssistant';

const SERVICE = 'com.mkdd.familyha.settings';

export async function loadSettings(): Promise<ConnectionSettings | null> {
  const credentials = await Keychain.getGenericPassword({service: SERVICE});
  if (!credentials) return null;
  try {
    return JSON.parse(credentials.password) as ConnectionSettings;
  } catch {
    return null;
  }
}

export async function saveSettings(settings: ConnectionSettings): Promise<void> {
  await Keychain.setGenericPassword('family-ha', JSON.stringify(settings), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSettings(): Promise<void> {
  await Keychain.resetGenericPassword({service: SERVICE});
}
