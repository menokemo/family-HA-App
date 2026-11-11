import { callAlarmoArm, callAlarmoDisarm, skipAlarmoDelay } from '../api/homeAssistant';
import { armModes, sensorIdsFromAlarm, supportedModes as alarmoSupportedModes } from '../features/alarmo/model';
import type { AlarmProvider } from './types';

/**
 * تطبيق `AlarmProvider` فوق تكامل Alarmo في Home Assistant.
 *
 * بيفوّض للدوال الموجودة أصلًا (خدمات `alarmo/*` وقراءة خصائص الكيان)، فسلوكه
 * مطابق للي كان قبل الـ abstraction layer — مجرد نقطة تجميع واحدة لكل ما هو
 * خاص بـ Alarmo.
 */
export const alarmoProvider: AlarmProvider = {
  id: 'alarmo',
  allModes: armModes,
  arm: (settings, entityId, mode, options) =>
    callAlarmoArm(settings, entityId, mode, options?.force ?? false),
  disarm: (settings, entityId, codeOverride) =>
    callAlarmoDisarm(settings, entityId, codeOverride),
  skipDelay: (settings, entityId) => skipAlarmoDelay(settings, entityId),
  supportedModes: (alarm) => alarmoSupportedModes(alarm),
  sensorIds: (alarm) => sensorIdsFromAlarm(alarm),
};
