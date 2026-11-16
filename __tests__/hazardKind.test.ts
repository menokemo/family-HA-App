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
    expect(hazardKind('Stroomstoring wijk')).toBe('other');
    expect(hazardKind('')).toBe('other');
  });

  it('مش حسّاس لحالة الأحرف', () => {
    expect(hazardKind('AMBULANCE')).toBe('ambulance');
  });
});

import { hazardSeverity, isDisasterKind } from '../src/features/map/mapShared';

describe('hazardKind — الكوارث وحوادث الطرق', () => {
  it('زلزال/فيضان/عاصفة', () => {
    expect(hazardKind('Earthquake M5.2')).toBe('earthquake');
    expect(hazardKind('Aardbeving bij Groningen')).toBe('earthquake');
    expect(hazardKind('Flood warning')).toBe('flood');
    expect(hazardKind('Overstroming dijk')).toBe('flood');
    expect(hazardKind('Tropical Cyclone Nora')).toBe('storm');
  });
  it('حادث طريق', () => {
    expect(hazardKind('Ongeval A4')).toBe('accident');
    expect(hazardKind('Aanrijding letsel')).toBe('accident');
    expect(hazardKind('Car crash highway')).toBe('accident');
  });
  it('نوع الحادثة بياخد أولوية على الخدمة', () => {
    expect(hazardKind('Ambulance ongeval A4')).toBe('accident');
  });
});

describe('isDisasterKind', () => {
  it('الكوارث الطبيعية بس', () => {
    expect(isDisasterKind('earthquake')).toBe(true);
    expect(isDisasterKind('flood')).toBe(true);
    expect(isDisasterKind('storm')).toBe(true);
    expect(isDisasterKind('ambulance')).toBe(false);
    expect(isDisasterKind('accident')).toBe(false);
  });
});

describe('hazardSeverity', () => {
  it('GDACS alertlevel', () => {
    expect(hazardSeverity({ alertlevel: 'Red' })).toBe('high');
    expect(hazardSeverity({ alertlevel: 'Orange' })).toBe('moderate');
    expect(hazardSeverity({ alertlevel: 'Green' })).toBe('low');
  });
  it('USGS magnitude', () => {
    expect(hazardSeverity({ magnitude: 6.1 })).toBe('high');
    expect(hazardSeverity({ magnitude: 3.4 })).toBe('moderate');
    expect(hazardSeverity({ mag: 1.2 })).toBe('low');
  });
  it('مفيش بيانات خطورة = undefined', () => {
    expect(hazardSeverity({})).toBeUndefined();
    expect(hazardSeverity({ source: '112hier' })).toBeUndefined();
  });
});
