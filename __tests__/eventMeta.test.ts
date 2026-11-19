import { joinEventMeta, splitEventMeta } from '../src/features/family/creator';

describe('event meta (creator + subject + fields)', () => {
  it('returns empty for undefined/empty', () => {
    expect(splitEventMeta(undefined)).toEqual({});
    expect(splitEventMeta('')).toEqual({});
  });

  it('round-trips creator and subject', () => {
    const d = joinEventMeta({ createdBy: 'Mena', forWhom: 'Sara' });
    expect(splitEventMeta(d)).toEqual({ createdBy: 'Mena', forWhom: 'Sara' });
  });

  it('carries note, location, reminder and kind', () => {
    const d = joinEventMeta({ createdBy: 'Mena', forWhom: 'Sara', note: 'Bring papers', location: 'Clinic', remind: 60, kind: 'appointment' });
    expect(splitEventMeta(d)).toEqual({ createdBy: 'Mena', forWhom: 'Sara', note: 'Bring papers', location: 'Clinic', remind: 60, kind: 'appointment' });
  });

  it('note only', () => {
    const d = joinEventMeta({ note: 'Just a note' });
    expect(d).toBe('Just a note');
    expect(splitEventMeta(d)).toEqual({ note: 'Just a note' });
  });

  it('reminder 0 (at time) is preserved, not dropped', () => {
    const d = joinEventMeta({ kind: 'appointment', remind: 0 });
    expect(splitEventMeta(d).remind).toBe(0);
  });

  it('ignores an unknown kind', () => {
    expect(splitEventMeta('·kind:weird').kind).toBeUndefined();
  });

  it('is tolerant of names with spaces', () => {
    const d = joinEventMeta({ createdBy: 'Abou Mena', forWhom: 'Mother Maria' });
    expect(splitEventMeta(d)).toEqual({ createdBy: 'Abou Mena', forWhom: 'Mother Maria' });
  });

  it('returns undefined when nothing to store', () => {
    expect(joinEventMeta({})).toBeUndefined();
  });
});
