import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.mkdd.familyha.biometric-disarm';

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const type = await Keychain.getSupportedBiometryType();
    return type !== null;
  } catch {
    return false;
  }
}

export async function enableBiometricDisarm(code: string): Promise<void> {
  await Keychain.setGenericPassword('family-ha', code, {
    service: SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function disableBiometricDisarm(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}

export async function getBiometricCode(promptTitle: string, promptSubtitle: string): Promise<string | null> {
  try {
    const result = await Keychain.getGenericPassword({
      service: SERVICE,
      authenticationPrompt: { title: promptTitle, subtitle: promptSubtitle },
    });
    if (!result) return null;
    return result.password;
  } catch {
    return null;
  }
}
