import { segmentTrips, type TrackPoint } from '../src/features/map/mapShared';

// نقطة أساس (القاهرة تقريبًا) + إزاحة بالمتر لتوليد مسارات واقعية.
const BASE = { lat: 30.05, lng: 31.23 };
const mPerDegLat = 111_320;
const mPerDegLng = 111_320 * Math.cos((BASE.lat * Math.PI) / 180);
const pt = (offEastM: number, offNorthM: number, at: string): TrackPoint => ({
  lat: BASE.lat + offNorthM / mPerDegLat,
  lng: BASE.lng + offEastM / mPerDegLng,
  at,
});
const t = (min: number) => new Date(Date.UTC(2026, 0, 1, 8, min, 0)).toISOString();

describe('segmentTrips', () => {
  it('returns nothing for fewer than 2 points', () => {
    expect(segmentTrips([])).toEqual([]);
    expect(segmentTrips([pt(0, 0, t(0))])).toEqual([]);
  });

  it('treats one continuous movement as a single trip', () => {
    const points: TrackPoint[] = [pt(0, 0, t(0)), pt(300, 0, t(3)), pt(700, 0, t(6)), pt(1200, 0, t(10))];
    const trips = segmentTrips(points);
    expect(trips).toHaveLength(1);
    expect(trips[0].distanceM).toBeGreaterThan(1000);
    expect(trips[0].durationSec).toBe(600);
    expect(trips[0].avgKmh).toBeGreaterThan(0);
  });

  it('splits two trips separated by a long stop at the same place', () => {
    const points: TrackPoint[] = [
      pt(0, 0, t(0)), pt(500, 0, t(5)), pt(1000, 0, t(10)), // رحلة ١
      pt(1000, 0, t(40)), // نفس المكان بعد فجوة 30 دقيقة = وقفة
      pt(1500, 0, t(45)), pt(2200, 0, t(52)), // رحلة ٢
    ];
    const trips = segmentTrips(points);
    expect(trips).toHaveLength(2);
    // الأحدث الأول
    expect(new Date(trips[0].startAt).getTime()).toBeGreaterThan(new Date(trips[1].startAt).getTime());
  });

  it('drops noise clusters that never really move', () => {
    const points: TrackPoint[] = [pt(0, 0, t(0)), pt(20, 10, t(5)), pt(10, 20, t(10)), pt(0, 5, t(15))];
    expect(segmentTrips(points)).toEqual([]);
  });
});
