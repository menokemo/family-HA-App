import { readProfiles, profileColor } from '../src/features/family/profiles';
import type { HaEntity } from '../src/types/homeAssistant';

const states = [
  {
    entity_id: 'sensor.secure_family_config',
    state: '3',
    attributes: {
      config: {
        profiles: {
          'person.mena': { color: '#AABBCC', role: 'Dad', birthday: '1990-05-02' },
          'person.sara': { role: 'Daughter' },
          'person.bad': { color: 'not-a-color' },
        },
      },
    },
  },
] as unknown as HaEntity[];

describe('family profiles', () => {
  it('reads profiles from the published family config', () => {
    const p = readProfiles(states);
    expect(p['person.mena'].birthday).toBe('1990-05-02');
    expect(p['person.sara'].role).toBe('Daughter');
  });

  it('returns a valid hex colour, else undefined', () => {
    const p = readProfiles(states);
    expect(profileColor('person.mena', p)).toBe('#AABBCC');
    expect(profileColor('person.sara', p)).toBeUndefined(); // no colour set
    expect(profileColor('person.bad', p)).toBeUndefined(); // invalid colour
    expect(profileColor('person.none', p)).toBeUndefined(); // no profile
    expect(profileColor(undefined, p)).toBeUndefined();
  });

  it('returns empty when there is no config sensor', () => {
    expect(readProfiles([] as HaEntity[])).toEqual({});
  });
});
