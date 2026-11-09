import { buildRecurringEventCommand } from '../src/api/calendarCommands';

// عقد مع HA: أمر WebSocket calendar/event/create (dtstart/dtend/summary/rrule).
// خدمة calendar.create_event بتستخدم start_date_time/end_date_time وبترفض rrule،
// فالأمرين لازم ما يتخلطوش.
const input = { summary: '🎂 Sara', start: '2026-07-25T09:00:00', end: '2026-07-25T10:00:00', freq: 'YEARLY' as const };

describe('buildRecurringEventCommand', () => {
  it('targets the calendar/event/create WebSocket command', () => {
    const cmd = buildRecurringEventCommand('calendar.family', input);
    expect(cmd.type).toBe('calendar/event/create');
    expect(cmd.entity_id).toBe('calendar.family');
  });

  it('sends dtstart/dtend/summary/rrule, never the service-only field names', () => {
    const { event } = buildRecurringEventCommand('calendar.family', input);
    expect(event).toMatchObject({ summary: '🎂 Sara', dtstart: input.start, dtend: input.end, rrule: 'FREQ=YEARLY' });
    expect(event).not.toHaveProperty('start_date_time');
    expect(event).not.toHaveProperty('end_date_time');
  });

  it('writes rrule as FREQ=... without the RRULE: prefix (HA parses FREQ=...)', () => {
    for (const freq of ['WEEKLY', 'MONTHLY', 'YEARLY'] as const) {
      const { event } = buildRecurringEventCommand('calendar.family', { ...input, freq });
      expect(event.rrule).toBe(`FREQ=${freq}`);
      expect(event.rrule.startsWith('RRULE:')).toBe(false);
    }
  });

  it('uses the ISO "T" separator and no timezone for dtstart/dtend', () => {
    const { event } = buildRecurringEventCommand('calendar.family', input);
    expect(event.dtstart).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(event.dtend).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('only includes description/location when provided', () => {
    expect(buildRecurringEventCommand('calendar.family', input).event).not.toHaveProperty('description');
    const withExtras = buildRecurringEventCommand('calendar.family', { ...input, description: 'note', location: 'home' }).event;
    expect(withExtras).toMatchObject({ description: 'note', location: 'home' });
  });
});
