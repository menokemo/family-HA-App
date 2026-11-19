import { i18n } from '../../i18n';

// مساعدات تاريخ مشتركة بين التقويم والمهام — JS صافي، من غير مكتبة أصلية.
export const locale = () => i18n.locale || 'en';
export function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
export function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
export function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
export function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
