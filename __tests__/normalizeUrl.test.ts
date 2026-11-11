import { normalizeUrl } from '../src/api/url';

// العقد: normalizeUrl بتضيف البروتوكول تلقائيًا لما يكون ناقص عشان نمنع
// فشل تحميل الـWebView (net::ERR_NAME_NOT_RESOLVED) اللي بيحصل للعناوين
// من غير بروتوكول. https للدومينات العامة، http للعناوين المحلية.
describe('normalizeUrl', () => {
  it('يضيف https:// لدومين عام من غير بروتوكول', () => {
    expect(normalizeUrl('familyha.duckdns.org')).toBe('https://familyha.duckdns.org');
  });

  it('يسيب https:// الصريح زي ما هو', () => {
    expect(normalizeUrl('https://ha.example.com')).toBe('https://ha.example.com');
  });

  it('يسيب http:// الصريح زي ما هو', () => {
    expect(normalizeUrl('http://192.168.1.5:8123')).toBe('http://192.168.1.5:8123');
  });

  it('يضيف http:// لـIP داخلي من غير بروتوكول', () => {
    expect(normalizeUrl('192.168.1.5:8123')).toBe('http://192.168.1.5:8123');
  });

  it('يضيف http:// لعنوان ‎.local', () => {
    expect(normalizeUrl('homeassistant.local:8123')).toBe('http://homeassistant.local:8123');
  });

  it('يضيف http:// لـlocalhost', () => {
    expect(normalizeUrl('localhost:8123')).toBe('http://localhost:8123');
  });

  it('يشيل أي / زيادة في الآخر', () => {
    expect(normalizeUrl('https://ha.example.com/')).toBe('https://ha.example.com');
  });

  it('يرجّع فاضي لو الإدخال فاضي أو مسافات', () => {
    expect(normalizeUrl('   ')).toBe('');
  });
});
