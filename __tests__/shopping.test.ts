import { parseShop, joinShop } from '../src/features/family/shopping';

describe('shopping item meta', () => {
  it('returns empty for no description', () => {
    expect(parseShop(undefined)).toEqual({});
    expect(joinShop({})).toBeUndefined();
  });

  it('round-trips qty/unit/category', () => {
    const d = joinShop({ qty: '2', unit: 'kg', cat: 'produce' });
    expect(d).toBe('·qty:2\n·unit:kg\n·cat:produce');
    expect(parseShop(d)).toEqual({ qty: '2', unit: 'kg', cat: 'produce' });
  });

  it('handles a partial meta', () => {
    const d = joinShop({ qty: '3' });
    expect(parseShop(d)).toEqual({ qty: '3' });
  });
});
