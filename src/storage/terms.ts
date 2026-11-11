import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'com.mkdd.familyha.termsAcceptedVersion';

/**
 * نسخة الشروط الحالية. لو غيّرت نص الشروط بشكل جوهري، زوّد الرقم ده عشان
 * المستخدمين يوافقوا على النسخة الجديدة تاني.
 */
export const TERMS_VERSION = 1;

/** آخر نسخة شروط وافق عليها المستخدم (0 لو عمره ما وافق). */
export async function getAcceptedTermsVersion(): Promise<number> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    return value ? Number(value) || 0 : 0;
  } catch {
    return 0;
  }
}

/** تسجيل موافقة المستخدم على النسخة الحالية من الشروط. */
export async function acceptTerms(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(TERMS_VERSION));
  } catch {
    // فشل الحفظ (نادر) - هيتسأل تاني المرة الجاية، وده مقبول.
  }
}
