import { NativeModules, Platform } from 'react-native';
import type { ConnectionSettings } from '../types/homeAssistant';

type SupportedLanguage = NonNullable<ConnectionSettings['language']>;
const supported: SupportedLanguage[] = ['ar', 'en', 'nl'];

function rawDeviceLocale(): string {
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      return settings?.AppleLocale ?? settings?.AppleLanguages?.[0] ?? 'en';
    }
    return NativeModules.I18nManager?.localeIdentifier ?? 'en';
  } catch {
    return 'en';
  }
}

export function detectDeviceLanguage(): SupportedLanguage {
  const locale = rawDeviceLocale().toLowerCase();
  const code = locale.split(/[_-]/)[0];
  return (supported as string[]).includes(code) ? (code as SupportedLanguage) : 'en';
}
