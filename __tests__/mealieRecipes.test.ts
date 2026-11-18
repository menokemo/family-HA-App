import { extractRecipes } from '../src/api/mealieApi';

describe('extractRecipes — يتعامل مع أشكال رد get_recipes', () => {
  it('الشكل القياسي: response.recipes.items[] (recipe_id/name/slug)', () => {
    const response = {
      recipes: {
        items: [
          { recipe_id: '940f528e-b726-4ac1-8848-086185b72e5a', name: 'Gehaktbal met spinazie', slug: 'gehaktbal-met-spinazie' },
          { recipe_id: 'abc', name: 'Komkommerrolletjes', slug: 'komkommerrolletjes' },
        ],
      },
    };
    const out = extractRecipes(response);
    expect(out).toHaveLength(2);
    expect(out[0].slug).toBe('gehaktbal-met-spinazie');
    expect(out[1].name).toBe('Komkommerrolletjes');
  });

  it('شكل بديل: {recipes:[…]} مصفوفة مباشرة', () => {
    expect(extractRecipes({ recipes: [{ slug: 'a' }] })).toHaveLength(1);
  });

  it('شكل بديل: {items:[…]}', () => {
    expect(extractRecipes({ items: [{ slug: 'a' }, { slug: 'b' }] })).toHaveLength(2);
  });

  it('مصفوفة مباشرة', () => {
    expect(extractRecipes([{ slug: 'a' }])).toHaveLength(1);
  });

  it('رد فاضي أو غير متوقّع → مصفوفة فاضية', () => {
    expect(extractRecipes(null)).toEqual([]);
    expect(extractRecipes({})).toEqual([]);
    expect(extractRecipes({ recipes: {} })).toEqual([]);
  });
});
