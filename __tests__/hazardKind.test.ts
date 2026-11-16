import { hazardKind } from '../src/features/map/mapShared';

describe('hazardKind', () => {
  it('إسعاف (هولندي/إنجليزي/MMT)', () => {
    expect(hazardKind('Ambulance · naar Amsterdam')).toBe('ambulance');
    expect(hazardKind('MMT inzet Leiden')).toBe('ambulance');
    expect(hazardKind('Ziekenwagen spoed')).toBe('ambulance');
  });

  it('مطافي', () => {
    expect(hazardKind('Brandweer Sassenheim')).toBe('fire');
    expect(hazardKind('Fire brigade dispatch')).toBe('fire');
    expect(hazardKind('Grote brand loods')).toBe('fire');
  });

  it('شرطة', () => {
    expect(hazardKind('Politie assistentie')).toBe('police');
    expect(hazardKind('Police incident')).toBe('police');
  });

  it('غير معروف = other', () => {
    expect(hazardKind('Aardbeving 3.1')).toBe('other');
    expect(hazardKind('')).toBe('other');
  });

  it('مش حسّاس لحالة الأحرف', () => {
    expect(hazardKind('AMBULANCE')).toBe('ambulance');
  });
});
