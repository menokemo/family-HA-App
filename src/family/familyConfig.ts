import type { ConnectionSettings, HaEntity } from '../types/homeAssistant';

// الكيان اللي بيحمل إعداد العيلة من مكوّن secure_family في Home Assistant.
export const FAMILY_CONFIG_ENTITY = 'sensor.secure_family_config';

// الحقول المركزية اللي الأدمن بينشرها للعيلة. أي حاجة مش في القايمة دي تفضل
// شخصية لكل جهاز (الاتصال/التوكن، PIN، البصمة، الثيم، اللغة، الصفارة…)
// ومابتتنشرش ولا بتتكتب فوق إعداد الفرد.
export const FAMILY_CONFIG_FIELDS = [
  'alarmEntityId',
  'selectedSensorIds',
  'visibleAlarmModes',
  'directStatusChange',
  'showStatusBadge',
  'selectedCameraIds',
  'snapshotRefreshSeconds',
  'cameraColumns',
  'selectedDashboardPath',
  'zoneWatchPersonIds',
  'selectedCalendarIds',
  'selectedTodoIds',
  'backgroundMonitoringEnabled',
] as const;

export type FamilyConfig = Partial<Pick<ConnectionSettings, (typeof FAMILY_CONFIG_FIELDS)[number]>>;

// يطلّع نسخة الإعداد المركزي من الإعدادات الحالية (للأدمن عند النشر).
export function pickFamilyConfig(settings: ConnectionSettings): FamilyConfig {
  const out: Record<string, unknown> = {};
  for (const key of FAMILY_CONFIG_FIELDS) {
    if (settings[key] !== undefined) out[key] = settings[key];
  }
  return out as FamilyConfig;
}

// يقرأ إعداد العيلة من الحالات. HA بيولّد entity_id من اسم الجهاز فمش بالضرورة
// يبقى بالظبط FAMILY_CONFIG_ENTITY — فبنلاقيه بذكاء: أي كيان من مكوّن
// secure_family عنده attribute اسمه config. بنجرّب الاسم المتوقّع الأول.
export function readFamilyConfig(states: HaEntity[]): { version: number; config: FamilyConfig } | null {
  const hasConfigAttr = (s: HaEntity) =>
    !!s.attributes && typeof s.attributes.config === 'object' && s.attributes.config !== null;
  const entity =
    states.find(s => s.entity_id === FAMILY_CONFIG_ENTITY && hasConfigAttr(s)) ??
    states.find(s => s.entity_id.startsWith('sensor.secure_family') && hasConfigAttr(s)) ??
    states.find(s => s.entity_id.includes('secure_family') && hasConfigAttr(s));
  if (!entity) return null;
  const version = Number(entity.state) || 0;
  const config = (entity.attributes.config ?? {}) as FamilyConfig;
  return { version, config };
}
