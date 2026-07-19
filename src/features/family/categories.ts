import { i18n } from '../../i18n';

export type Category = { emoji: string; key: string; color: string };

// الفئات دي بتتحوّل لـ emoji بيتحط في أول عنوان الحدث/التذكير نفسه -
// مفيش حقل "فئة" في HA أصلًا (calendar/todo مفيهومش الحقل ده)، فده
// أبسط طريقة تتوافق مع HA بالكامل (حتى لو فتحت نفس الحدث من واجهة
// HA نفسها هتشوف الرمز)، وسهل نكتشفها تاني في التطبيق.
export const CATEGORIES: Category[] = [
  { emoji: '👨‍👩‍👧‍👦', key: 'family', color: '#3D5FEF' },
  { emoji: '🩺', key: 'doctor', color: '#E64C7A' },
  { emoji: '🛒', key: 'shopping', color: '#00B894' },
  { emoji: '📚', key: 'study', color: '#9B59B6' },
  { emoji: '✈️', key: 'travel', color: '#17A2B8' },
  { emoji: '🐾', key: 'pets', color: '#F5A623' },
  { emoji: '🚗', key: 'car', color: '#FF6B4A' },
  { emoji: '🔧', key: 'home', color: '#5D6D7E' },
  { emoji: '⛪', key: 'church', color: '#8E44AD' },
  { emoji: '🎂', key: 'birthday', color: '#E74C3C' },
  { emoji: '🎉', key: 'occasion', color: '#F39C12' },
  { emoji: '📌', key: 'other', color: '#7F8C8D' },
];

export function categoryLabel(key: string) {
  return i18n.t(`category_${key}` as never);
}

// بيدور على أول فئة الـ emoji بتاعها موجود في بداية النص - لو معرفش
// ياخد فئة "other" الافتراضية.
export function detectCategory(text: string): Category {
  const found = CATEGORIES.find(c => text.startsWith(c.emoji));
  return found ?? CATEGORIES[CATEGORIES.length - 1];
}

export function stripCategoryEmoji(text: string): string {
  const cat = CATEGORIES.find(c => text.startsWith(c.emoji));
  return cat ? text.slice(cat.emoji.length).trim() : text;
}
