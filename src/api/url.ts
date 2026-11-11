// تطبيع عنوان Home Assistant. دالة نقية (من غير أي استيراد native) عشان
// تتختبر بـjest وتبقى العقد الواضح لشكل العنوان في كل التطبيق.
//
// بتضيف البروتوكول تلقائيًا لما المستخدم يكتب الدومين من غيره: https
// للدومينات العامة، وhttp للعناوين المحلية (IP داخلي / localhost / ‎.local)
// لأن معظم تنصيبات HA المحلية بتشتغل على http. ده بيمنع فشل التحميل
// (net::ERR_NAME_NOT_RESOLVED) اللي بيحصل لما العنوان يبقى من غير بروتوكول.

// نطاقات IP الخاصة (RFC 1918) + localhost. ملحوظة: 172 الخاصة من 16 لـ31 بس.
const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

function isLocalHost(host: string): boolean {
  return PRIVATE_HOST.test(host) || host.toLowerCase().endsWith('.local');
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return trimmed;
  const host = trimmed.split('/')[0].split(':')[0];
  return `${isLocalHost(host) ? 'http' : 'https'}://${trimmed}`;
}
