import { filterNearbyHazards, HAZARD_NEAR_M } from '../src/features/map/mapShared';

// البيت في ليدن تقريبًا، وباقي النقط محسوبة بالنسبة له.
const HOME = { lat: 52.16, lng: 4.49 };
// ~2.2كم شمال البيت.
const NEAR_HOME = { id: 'near', lat: 52.18, lng: 4.49 };
// أمستردام ~30كم — بره النطاق.
const FAR = { id: 'far', lat: 52.37, lng: 4.9 };
// جنب فرد بعيد عن البيت.
const MEMBER = { lat: 51.92, lng: 4.48 };
const NEAR_MEMBER = { id: 'nearMember', lat: 51.93, lng: 4.48 };

describe('filterNearbyHazards', () => {
  it('من غير مراسي مايعرضش حاجة', () => {
    expect(filterNearbyHazards([NEAR_HOME, FAR], [])).toEqual([]);
  });

  it('بيعرض القريب من البيت ويستبعد البعيد', () => {
    const out = filterNearbyHazards([NEAR_HOME, FAR], [HOME]);
    expect(out.map(h => h.id)).toEqual(['near']);
  });

  it('بيعرض القريب من أي فرد مش من البيت بس', () => {
    const out = filterNearbyHazards([NEAR_HOME, FAR, NEAR_MEMBER], [HOME, MEMBER]);
    expect(out.map(h => h.id).sort()).toEqual(['near', 'nearMember']);
  });

  it('بيحترم نطاق مخصص', () => {
    expect(filterNearbyHazards([FAR], [HOME], 50000).map(h => h.id)).toEqual(['far']);
    expect(filterNearbyHazards([NEAR_HOME], [HOME], 500)).toEqual([]);
  });

  it('النطاق الافتراضي 10كم', () => {
    expect(HAZARD_NEAR_M).toBe(10000);
  });

  it('نطاق صفر = قافل، مايعرضش حاجة حتى لو في مراسي', () => {
    expect(filterNearbyHazards([NEAR_HOME], [HOME], 0)).toEqual([]);
  });
});
