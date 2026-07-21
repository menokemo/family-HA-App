import { findAlarmoEntities, getStates } from '../api/homeAssistant';
import { loadCachedStates, saveCachedStates } from '../storage/cache';
import { loadSettings } from '../storage/settings';
import type { ConnectionSettings, HaEntity } from '../types/homeAssistant';

export type WidgetData = {
  connected: boolean;
  alarmEntityId?: string;
  alarmState: string;
  people: { name: string; home: boolean }[];
  reminderCount: number;
};

// الويدجت بتشتغل في سياق جافاسكريبت منفصل تمامًا عن التطبيق الرئيسي
// (Headless JS)، فبتحمّل الإعدادات والحالة من نفس التخزين الآمن
// (Keychain/AsyncStorage) اللي التطبيق الرئيسي بيحفظ فيه - مفيش أي
// مشاركة state مباشرة ممكنة بين الاتنين.
export async function loadWidgetData(fresh = false): Promise<{ settings: ConnectionSettings | null; data: WidgetData }> {
  const settings = await loadSettings();
  if (!settings?.baseUrl || !settings.token) {
    return { settings: null, data: { connected: false, alarmState: 'unknown', people: [], reminderCount: 0 } };
  }
  let states: HaEntity[];
  if (fresh) {
    try {
      states = await getStates(settings);
      void saveCachedStates(states);
    } catch {
      states = await loadCachedStates();
    }
  } else {
    states = await loadCachedStates();
  }

  const alarm = settings.alarmEntityId ? states.find(s => s.entity_id === settings.alarmEntityId) : findAlarmoEntities(states)[0];
  const people = states
    .filter(s => s.entity_id.startsWith('person.'))
    .map(p => ({ name: String(p.attributes.friendly_name ?? p.entity_id).split(' ')[0], home: p.state === 'home' }));
  const reminderCount = states.filter(s => s.entity_id.startsWith('todo.')).reduce((sum, t) => sum + (Number(t.state) || 0), 0);

  return {
    settings,
    data: {
      connected: true,
      alarmEntityId: alarm?.entity_id,
      alarmState: alarm?.state ?? 'unknown',
      people,
      reminderCount,
    },
  };
}

// بيتنادى من التطبيق الرئيسي (مش من الويدجت نفسها) بعد أي تسليح/تعطيل
// ناجح، عشان الويدجت تتحدّث فورًا من غير ما تستنى فترة التحديث
// التلقائية (30 دقيقة كحد أدنى مفروض من أندرويد نفسها).
export async function refreshWidget(): Promise<void> {
  try {
    // استيراد كسول (lazy) عشان الملف ده يقدر يتحمّل في سياق التطبيق
    // الرئيسي من غير ما يجرّ مكوّنات الويدجت لو مش محتاجها
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { FamilyHaWidgetView } = await import('./FamilyHaWidgetView');
    await requestWidgetUpdate({
      widgetName: 'FamilyHaWidget',
      renderWidget: async () => {
        const { data } = await loadWidgetData(true);
        return <FamilyHaWidgetView data={data} />;
      },
    });
  } catch {
    // مفيش ويدجت مضافة، أو مش على أندرويد - تجاهل بهدوء
  }
}
