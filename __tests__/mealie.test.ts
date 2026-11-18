import { findMealieTodos, findMealieCalendars, hasMealie } from '../src/features/family/mealie';
import type { HaEntity } from '../src/types/homeAssistant';

const ent = (entity_id: string, friendly_name?: string): HaEntity => ({
  entity_id,
  state: 'on',
  attributes: friendly_name ? { friendly_name } : {},
});

const states: HaEntity[] = [
  ent('todo.mealie_groceries', 'Mealie: Groceries'),
  ent('todo.mealie_party', 'Mealie: Party'),
  ent('todo.shopping_list', 'Shopping list'), // قائمة عادية مش Mealie
  ent('calendar.mealie_breakfast', 'Mealie breakfast'),
  ent('calendar.mealie_lunch'),
  ent('calendar.mealie_dinner'),
  ent('calendar.mealie_side'),
  ent('calendar.secure_family_meals'), // تقويم المكوّن المحلي، مش Mealie
  ent('calendar.family_holidays'),
  ent('sensor.mealie_recipes'),
];

describe('Mealie standard detection', () => {
  it('finds only Mealie todo lists (by prefix, not hardcoded names)', () => {
    const ids = findMealieTodos(states).map(e => e.entity_id);
    expect(ids).toEqual(['todo.mealie_groceries', 'todo.mealie_party']);
  });

  it('maps each Mealie calendar to its meal slot', () => {
    const cals = findMealieCalendars(states);
    expect(cals.map(c => c.slot)).toEqual(['breakfast', 'lunch', 'dinner', 'side']);
    expect(cals.map(c => c.entity.entity_id)).toContain('calendar.mealie_breakfast');
  });

  it('does not treat the local component meals calendar as Mealie', () => {
    const ids = findMealieCalendars(states).map(c => c.entity.entity_id);
    expect(ids).not.toContain('calendar.secure_family_meals');
  });

  it('hasMealie is true when any Mealie entity exists, false otherwise', () => {
    expect(hasMealie(states)).toBe(true);
    expect(hasMealie([ent('calendar.secure_family_meals'), ent('todo.shopping_list')])).toBe(false);
  });
});
