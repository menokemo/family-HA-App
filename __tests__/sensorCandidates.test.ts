import { isSecuritySensor, sensorCandidates } from '../src/features/alarmo/model';
import type { HaEntity } from '../src/types/homeAssistant';

const sensor = (id: string, deviceClass?: string, name?: string): HaEntity => ({
  entity_id: id,
  state: 'off',
  attributes: { ...(deviceClass ? { device_class: deviceClass } : {}), ...(name ? { friendly_name: name } : {}) },
});

const states: HaEntity[] = [
  sensor('binary_sensor.back_door', 'door', 'Back door'),
  sensor('binary_sensor.living_window', 'window', 'Living room window'),
  sensor('binary_sensor.hallway_motion', 'motion', 'Hallway motion'),
  sensor('binary_sensor.phone_battery', 'battery', 'Phone battery'),
  sensor('binary_sensor.router_connectivity', 'connectivity', 'Router'),
  sensor('binary_sensor.firmware_update', 'update', 'Firmware update'),
  sensor('binary_sensor.no_class'),
  sensor('light.lamp', undefined, 'Lamp'),
];

describe('security sensor filtering (simpler Choose sensors)', () => {
  it('keeps only security-relevant binary sensors by default', () => {
    const ids = sensorCandidates(states).map(s => s.entity_id);
    expect(ids).toEqual([
      'binary_sensor.back_door',
      'binary_sensor.hallway_motion',
      'binary_sensor.living_window',
    ]);
  });

  it('excludes battery, connectivity, update, class-less and non-binary entities', () => {
    const ids = sensorCandidates(states).map(s => s.entity_id);
    expect(ids).not.toContain('binary_sensor.phone_battery');
    expect(ids).not.toContain('binary_sensor.router_connectivity');
    expect(ids).not.toContain('binary_sensor.firmware_update');
    expect(ids).not.toContain('binary_sensor.no_class');
    expect(ids).not.toContain('light.lamp');
  });

  it('includeAll returns every binary_sensor (advanced fallback)', () => {
    const ids = sensorCandidates(states, true).map(s => s.entity_id);
    expect(ids).toContain('binary_sensor.no_class');
    expect(ids).toContain('binary_sensor.phone_battery');
    expect(ids).not.toContain('light.lamp');
  });

  it('sorts by friendly name', () => {
    const names = sensorCandidates(states).map(s => String(s.attributes.friendly_name));
    expect(names).toEqual(['Back door', 'Hallway motion', 'Living room window']);
  });

  it('isSecuritySensor is case-insensitive and domain-aware', () => {
    expect(isSecuritySensor(sensor('binary_sensor.d', 'DOOR'))).toBe(true);
    expect(isSecuritySensor(sensor('binary_sensor.b', 'battery'))).toBe(false);
    expect(isSecuritySensor(sensor('sensor.temp', 'temperature'))).toBe(false);
  });
});
