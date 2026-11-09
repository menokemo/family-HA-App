import { HA_ALARM_FEATURE, armModes, supportedModes } from '../src/features/alarmo/model';
import type { HaEntity } from '../src/types/homeAssistant';

// عقد مع HA/Alarmo: أرقام الـfeature bits لازم تطابق AlarmControlPanelEntityFeature
// الرسمية، وإلا أوضاع التسليح تظهر/تختفي غلط (حصل فعلًا قبل كده).
const panel = (features: number): HaEntity => ({
  entity_id: 'alarm_control_panel.alarmo',
  state: 'disarmed',
  attributes: { supported_features: features },
});
const modesOf = (features: number) => supportedModes(panel(features)).map(m => m.mode);

describe('Alarmo arm modes vs HA feature bits', () => {
  it('uses the official HA AlarmControlPanelEntityFeature values', () => {
    expect(HA_ALARM_FEATURE).toEqual({
      ARM_HOME: 1,
      ARM_AWAY: 2,
      ARM_NIGHT: 4,
      TRIGGER: 8,
      ARM_CUSTOM_BYPASS: 16,
      ARM_VACATION: 32,
    });
  });

  it('maps every arm mode to its own bit', () => {
    const bit = (mode: string) => armModes.find(m => m.mode === mode)?.feature;
    expect(bit('home')).toBe(1);
    expect(bit('away')).toBe(2);
    expect(bit('night')).toBe(4);
    expect(bit('custom')).toBe(16);
    expect(bit('vacation')).toBe(32);
  });

  it('shows no arm mode when only TRIGGER is set (Alarmo always sets it)', () => {
    expect(modesOf(HA_ALARM_FEATURE.TRIGGER)).toEqual([]);
  });

  it('shows vacation only when ARM_VACATION is set', () => {
    const base = HA_ALARM_FEATURE.TRIGGER | HA_ALARM_FEATURE.ARM_AWAY | HA_ALARM_FEATURE.ARM_HOME;
    expect(modesOf(base)).toEqual(['away', 'home']);
    expect(modesOf(base | HA_ALARM_FEATURE.ARM_VACATION)).toEqual(['away', 'home', 'vacation']);
  });

  it('shows custom bypass only when ARM_CUSTOM_BYPASS is set', () => {
    const base = HA_ALARM_FEATURE.TRIGGER | HA_ALARM_FEATURE.ARM_AWAY;
    expect(modesOf(base)).toEqual(['away']);
    expect(modesOf(base | HA_ALARM_FEATURE.ARM_CUSTOM_BYPASS)).toEqual(['away', 'custom']);
  });

  it('falls back to every mode when the entity reports no features', () => {
    expect(modesOf(0)).toHaveLength(armModes.length);
  });
});
