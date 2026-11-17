// بيانات صنف المشتريات (كمية/وحدة/قسم) بنخزّنها في description بتاع عنصر الـtodo
// نفسه في HA — فالموديول شغّال على قوائم HA القياسية من غير أي مكوّن.
export type ShopMeta = { qty?: string; unit?: string; cat?: string };

const Q = '·qty:';
const U = '·unit:';
const C = '·cat:';

export function parseShop(description?: string): ShopMeta {
  const m: ShopMeta = {};
  if (!description) return m;
  for (const line of description.split('\n')) {
    if (line.startsWith(Q)) m.qty = line.slice(Q.length).trim();
    else if (line.startsWith(U)) m.unit = line.slice(U.length).trim();
    else if (line.startsWith(C)) m.cat = line.slice(C.length).trim();
  }
  return m;
}

export function joinShop(m: ShopMeta): string | undefined {
  const p: string[] = [];
  if (m.qty) p.push(`${Q}${m.qty}`);
  if (m.unit) p.push(`${U}${m.unit}`);
  if (m.cat) p.push(`${C}${m.cat}`);
  return p.length ? p.join('\n') : undefined;
}

// أقسام المشتريات (المفتاح ثابت، والعرض مترجَم في i18n: catProduce…).
export const SHOP_CATS = ['produce', 'dairy', 'meat', 'bakery', 'cleaning', 'other'] as const;
export type ShopCat = (typeof SHOP_CATS)[number];
