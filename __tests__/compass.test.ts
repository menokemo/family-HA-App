import { bearing, compassKey } from '../src/features/map/mapShared';

describe('compassKey', () => {
  it('بيدي الاتجاهات الأصلية الأربعة', () => {
    expect(compassKey(0)).toBe('dirN');
    expect(compassKey(90)).toBe('dirE');
    expect(compassKey(180)).toBe('dirS');
    expect(compassKey(270)).toBe('dirW');
  });

  it('بيدي الاتجاهات الفرعية', () => {
    expect(compassKey(45)).toBe('dirNE');
    expect(compassKey(135)).toBe('dirSE');
    expect(compassKey(225)).toBe('dirSW');
    expect(compassKey(315)).toBe('dirNW');
  });

  it('الشمال متوسّط قطاعه (حدود ±22.5°)', () => {
    expect(compassKey(22)).toBe('dirN');
    expect(compassKey(338)).toBe('dirN');
    expect(compassKey(23)).toBe('dirNE');
    expect(compassKey(337)).toBe('dirNW');
  });

  it('بيلف صح حوالين 360 وبالسالب', () => {
    expect(compassKey(360)).toBe('dirN');
    expect(compassKey(720)).toBe('dirN');
    expect(compassKey(-90)).toBe('dirW');
    expect(compassKey(-45)).toBe('dirNW');
  });

  it('مع bearing: نقطة شمال البيت تطلع شمال', () => {
    const home = { lat: 52.16, lng: 4.49 };
    expect(compassKey(bearing(home.lat, home.lng, 52.2, 4.49))).toBe('dirN');
    expect(compassKey(bearing(home.lat, home.lng, 52.12, 4.49))).toBe('dirS');
    expect(compassKey(bearing(home.lat, home.lng, 52.16, 4.56))).toBe('dirE');
    expect(compassKey(bearing(home.lat, home.lng, 52.16, 4.42))).toBe('dirW');
  });
});
