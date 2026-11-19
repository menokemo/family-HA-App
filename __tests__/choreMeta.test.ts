import { joinChoreMeta, splitChoreMeta } from '../src/features/family/chore';

describe('chore meta round-trip', () => {
  it('keeps a plain title with no markers', () => {
    expect(splitChoreMeta('Vacuum the hall')).toEqual({ title: 'Vacuum the hall', meta: {} });
  });

  it('joins and splits category, due and note', () => {
    const raw = joinChoreMeta('Mop floor', { cat: 'kitchen', due: '2026-11-25', note: 'use the strong soap' });
    const { title, meta } = splitChoreMeta(raw);
    expect(title).toBe('Mop floor');
    expect(meta.cat).toBe('kitchen');
    expect(meta.due).toBe('2026-11-25');
    expect(meta.note).toBe('use the strong soap');
  });

  it('omits the default "other" category from storage', () => {
    const raw = joinChoreMeta('Take out trash', { cat: 'other' });
    expect(raw).toBe('Take out trash');
    expect(splitChoreMeta(raw).meta.cat).toBeUndefined();
  });

  it('allows a note that contains spaces and marker-like text', () => {
    const raw = joinChoreMeta('Fix tap', { cat: 'maintenance', note: 'ask dad about the ·part first' });
    const { title, meta } = splitChoreMeta(raw);
    expect(title).toBe('Fix tap');
    expect(meta.cat).toBe('maintenance');
    expect(meta.note).toBe('ask dad about the ·part first');
  });

  it('ignores an unknown category and a malformed date', () => {
    const { meta } = splitChoreMeta('Clean ·cat:garage ·due:soon');
    expect(meta.cat).toBeUndefined();
    expect(meta.due).toBeUndefined();
  });

  it('drops an empty note and empty category', () => {
    expect(joinChoreMeta('Dust shelves', { note: '   ' })).toBe('Dust shelves');
  });
});
