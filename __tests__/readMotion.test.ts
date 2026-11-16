import { readMotion } from '../src/features/map/mapShared';
import type { HaEntity } from '../src/types/homeAssistant';

// شخص بسيط بسرعة واعطاء حالة (المنطقة). السرعة بالـ m/s زي HA.
const person = (state: string, speedMs: number): HaEntity =>
  ({
    entity_id: 'person.me',
    state,
    attributes: { speed: speedMs },
    last_changed: '',
    last_updated: '',
  } as unknown as HaEntity);

describe('readMotion', () => {
  it('returns undefined when no speed is reported', () => {
    const p = { entity_id: 'person.me', state: 'home', attributes: {} } as unknown as HaEntity;
    expect(readMotion(p, [])).toBeUndefined();
  });

  it('reports moving when away and above threshold', () => {
    // 5 m/s = 18 km/h, away from all zones → moving
    const m = readMotion(person('not_home', 5), []);
    expect(m?.moving).toBe(true);
    expect(Math.round(m!.speed)).toBe(18);
  });

  it('is NOT moving while in a zone even with jittery GPS speed', () => {
    // 2 m/s = 7.2 km/h (فوق الحد) لكن الحالة "home" → مش بيتحرك (تشويش داخلي)
    const m = readMotion(person('home', 2), []);
    expect(m?.moving).toBe(false);
  });

  it('is NOT moving while in a named zone', () => {
    const m = readMotion(person('Work', 2.5), []);
    expect(m?.moving).toBe(false);
  });

  it('is not moving when away but below threshold', () => {
    // 1 m/s = 3.6 km/h < 6 → مش بيتحرك
    const m = readMotion(person('not_home', 1), []);
    expect(m?.moving).toBe(false);
  });

  it('treats unknown / unavailable like away (no false "in zone")', () => {
    expect(readMotion(person('unknown', 5), [])?.moving).toBe(true);
    expect(readMotion(person('unavailable', 5), [])?.moving).toBe(true);
  });
});
