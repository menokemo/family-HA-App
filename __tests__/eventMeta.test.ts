import { joinEventMeta, splitEventMeta } from '../src/features/family/creator';

describe('event meta (creator + subject)', () => {
  it('returns empty for undefined/empty', () => {
    expect(splitEventMeta(undefined)).toEqual({});
    expect(splitEventMeta('')).toEqual({});
  });

  it('joins and splits creator only', () => {
    const d = joinEventMeta('Mena', undefined);
    expect(d).toBe('·by:Mena');
    expect(splitEventMeta(d)).toEqual({ createdBy: 'Mena', forWhom: undefined });
  });

  it('joins and splits subject only', () => {
    const d = joinEventMeta(undefined, 'Sara');
    expect(d).toBe('·for:Sara');
    expect(splitEventMeta(d)).toEqual({ createdBy: undefined, forWhom: 'Sara' });
  });

  it('round-trips both creator and subject', () => {
    const d = joinEventMeta('Mena', 'Sara');
    expect(splitEventMeta(d)).toEqual({ createdBy: 'Mena', forWhom: 'Sara' });
  });

  it('returns undefined when nothing to store', () => {
    expect(joinEventMeta(undefined, undefined)).toBeUndefined();
  });

  it('is tolerant of names with spaces', () => {
    const d = joinEventMeta('Abou Mena', 'Mother Maria');
    expect(splitEventMeta(d)).toEqual({ createdBy: 'Abou Mena', forWhom: 'Mother Maria' });
  });

  it('carries an optional note before the meta', () => {
    const d = joinEventMeta('Mena', 'Sara', 'Bring the documents');
    expect(d).toBe('Bring the documents\n·by:Mena\n·for:Sara');
    expect(splitEventMeta(d)).toEqual({ createdBy: 'Mena', forWhom: 'Sara', note: 'Bring the documents' });
  });

  it('note only, no meta', () => {
    const d = joinEventMeta(undefined, undefined, 'Just a note');
    expect(d).toBe('Just a note');
    expect(splitEventMeta(d)).toEqual({ note: 'Just a note' });
  });
});
