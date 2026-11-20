import { asRepeat, readChore, splitChoreMeta } from '../src/features/family/chore';

describe('splitChoreMeta (legacy marker parsing)', () => {
  it('keeps a plain title with no markers', () => {
    expect(splitChoreMeta('Vacuum the hall')).toEqual({ title: 'Vacuum the hall', meta: {} });
  });

  it('parses category, due and note from markers', () => {
    const { title, meta } = splitChoreMeta('Mop floor ·cat:kitchen ·due:2026-11-25 ·note:use the strong soap');
    expect(title).toBe('Mop floor');
    expect(meta.cat).toBe('kitchen');
    expect(meta.due).toBe('2026-11-25');
    expect(meta.note).toBe('use the strong soap');
  });

  it('ignores an unknown category and a malformed date', () => {
    const { meta } = splitChoreMeta('Clean ·cat:garage ·due:soon');
    expect(meta.cat).toBeUndefined();
    expect(meta.due).toBeUndefined();
  });
});

describe('asRepeat', () => {
  it('accepts known values and defaults the rest to none', () => {
    expect(asRepeat('weekly')).toBe('weekly');
    expect(asRepeat('monthly')).toBe('monthly');
    expect(asRepeat('bogus')).toBe('none');
    expect(asRepeat(null)).toBe('none');
    expect(asRepeat(undefined)).toBe('none');
  });
});

describe('readChore (field-first, legacy fallback)', () => {
  it('prefers real fields from the new component', () => {
    const r = readChore({ title: 'Clean bath', category: 'bathroom', due: '2026-12-01', repeat: 'weekly', note: 'soap' });
    expect(r).toEqual({ title: 'Clean bath', cat: 'bathroom', due: '2026-12-01', note: 'soap', repeat: 'weekly' });
  });

  it('falls back to title markers for a legacy chore with no fields', () => {
    const r = readChore({ title: 'Mop floor ·cat:kitchen ·due:2026-11-25 ·note:rinse well' });
    expect(r.title).toBe('Mop floor');
    expect(r.cat).toBe('kitchen');
    expect(r.due).toBe('2026-11-25');
    expect(r.note).toBe('rinse well');
    expect(r.repeat).toBe('none');
  });

  it('strips no markers from a clean new-style title', () => {
    const r = readChore({ title: 'Take out trash', repeat: 'daily' });
    expect(r.title).toBe('Take out trash');
    expect(r.cat).toBeUndefined();
    expect(r.repeat).toBe('daily');
  });
});
