import { memberRole, canManage } from '../src/features/family/roles';
import type { Profiles } from '../src/features/family/profiles';

const profiles: Profiles = {
  'person.dad': { role: 'manager' },
  'person.mom': { role: 'adult' },
  'person.kid': { role: 'child' },
  'person.x': { role: 'nonsense' as unknown as 'child' },
};

describe('family roles', () => {
  it('reads a valid role, else undefined', () => {
    expect(memberRole('person.dad', profiles)).toBe('manager');
    expect(memberRole('person.kid', profiles)).toBe('child');
    expect(memberRole('person.x', profiles)).toBeUndefined();
    expect(memberRole('person.none', profiles)).toBeUndefined();
    expect(memberRole(undefined, profiles)).toBeUndefined();
  });

  it('everyone can manage except an explicit child', () => {
    expect(canManage('manager')).toBe(true);
    expect(canManage('adult')).toBe(true);
    expect(canManage(undefined)).toBe(true); // no role set → same as before
    expect(canManage('child')).toBe(false);
  });
});
