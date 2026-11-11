import type { ConnectionSettings, HaEntity } from '../src/types/homeAssistant';

// نمسك نداءات خدمات Alarmo عشان نتأكد إن الـ abstraction layer بيفوّض صح.
// (أسماء بادئة بـ mock عشان jest يسمح بيها جوه jest.mock.)
const mockArm = jest.fn();
const mockDisarm = jest.fn();
const mockSkip = jest.fn();
jest.mock('../src/api/homeAssistant', () => ({
  callAlarmoArm: (...args: unknown[]) => mockArm(...args),
  callAlarmoDisarm: (...args: unknown[]) => mockDisarm(...args),
  skipAlarmoDelay: (...args: unknown[]) => mockSkip(...args),
}));

import { alarmProvider } from '../src/alarm';
import { armModes, sensorIdsFromAlarm } from '../src/features/alarmo/model';

const settings = { baseUrl: 'http://x' } as unknown as ConnectionSettings;

beforeEach(() => {
  mockArm.mockClear();
  mockDisarm.mockClear();
  mockSkip.mockClear();
});

describe('AlarmProvider abstraction (Alarmo implementation)', () => {
  it('identifies as alarmo and exposes every arm mode', () => {
    expect(alarmProvider.id).toBe('alarmo');
    expect(alarmProvider.allModes).toEqual(armModes);
  });

  it('arm() forwards the mode and defaults force to false', () => {
    void alarmProvider.arm(settings, 'alarm_control_panel.alarmo', 'away');
    expect(mockArm).toHaveBeenCalledWith(settings, 'alarm_control_panel.alarmo', 'away', false);
  });

  it('arm() passes force through from options', () => {
    void alarmProvider.arm(settings, 'alarm_control_panel.alarmo', 'home', { force: true });
    expect(mockArm).toHaveBeenCalledWith(settings, 'alarm_control_panel.alarmo', 'home', true);
  });

  it('disarm() forwards an optional code override', () => {
    void alarmProvider.disarm(settings, 'alarm_control_panel.alarmo', '1234');
    expect(mockDisarm).toHaveBeenCalledWith(settings, 'alarm_control_panel.alarmo', '1234');
  });

  it('skipDelay() delegates to the Alarmo service', () => {
    void alarmProvider.skipDelay(settings, 'alarm_control_panel.alarmo');
    expect(mockSkip).toHaveBeenCalledWith(settings, 'alarm_control_panel.alarmo');
  });

  it('sensorIds() delegates to the Alarmo sensor extraction', () => {
    const alarm: HaEntity = {
      entity_id: 'alarm_control_panel.alarmo',
      state: 'armed_away',
      attributes: { sensors: ['binary_sensor.back_door', 'binary_sensor.front_door'] },
    };
    expect(alarmProvider.sensorIds(alarm)).toEqual(sensorIdsFromAlarm(alarm));
    expect(alarmProvider.sensorIds(alarm)).toContain('binary_sensor.back_door');
  });
});
