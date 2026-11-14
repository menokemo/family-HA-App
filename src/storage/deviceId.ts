import AsyncStorage from '@react-native-async-storage/async-storage';

// معرّف ثابت للموبايل ده. بيتولّد مرة واحدة ويتخزّن في مفتاح مستقل عن الإعدادات،
// فبيعيش بعد تسجيل الخروج/الدخول، وبيتغيّر بس مع إعادة تثبيت التطبيق أو مسح
// بياناته — وده مقصود: إعادة التثبيت تعتبر جهاز جديد فتحتاج موافقة أدمن.
// mkdd — Secure Family
const KEY = 'mkdd_physical_device_id';

function uuidV4(): string {
  // UUID v4 كافٍ كمعرّف جهاز (المهم التفرّد مش التشفير).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getPhysicalDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(KEY);
  if (!id) {
    id = uuidV4();
    await AsyncStorage.setItem(KEY, id);
  }
  return id;
}
