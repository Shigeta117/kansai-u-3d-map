import { describe, expect, it } from 'vitest';
import {
  applyClearanceBumps,
  choosePierStations,
  computeRoadProfile,
  segmentIntersection,
  type ProfileSample,
} from './expressway';

describe('expressway profile helpers', () => {
  it('ignores the DEM under a bridge and joins both ends with a straight line', () => {
    // 0〜40m は地上（標高 34）、40〜120m は高架（下の DEM は 26 の谷）、120〜160m は地上（標高 36）
    const samples: ProfileSample[] = [];
    for (let s = 0; s <= 160; s += 4) {
      const bridge = s > 40 && s < 120;
      const dem = bridge ? 26 : s <= 40 ? 34 : 36;
      samples.push({ s, dem, excluded: bridge });
    }
    const elev = computeRoadProfile(samples, { median: 12, smooth: 0 });
    const at = (s: number) => elev[samples.findIndex((p) => p.s === s)] ?? NaN;
    expect(at(0)).toBeCloseTo(34, 5);
    expect(at(160)).toBeCloseTo(36, 5);
    // 谷の DEM（26）に引っ張られず、両端の間の直線上にある
    expect(at(80)).toBeGreaterThan(34.5);
    expect(at(80)).toBeLessThan(35.5);
  });

  it('removes a narrow dip with the median window', () => {
    const samples: ProfileSample[] = [];
    for (let s = 0; s <= 200; s += 4) {
      samples.push({ s, dem: s >= 96 && s <= 104 ? 28 : 35, excluded: false });
    }
    const elev = computeRoadProfile(samples, { median: 30, smooth: 10 });
    for (const e of elev) expect(e).toBeCloseTo(35, 5);
  });

  it('finds segment intersections', () => {
    expect(segmentIntersection([0, 0], [10, 0], [5, -5], [5, 5])).toEqual({ t: 0.5, u: 0.5 });
    expect(segmentIntersection([0, 0], [10, 0], [12, -5], [12, 5])).toBeNull();
    expect(segmentIntersection([0, 0], [10, 0], [0, 1], [10, 1])).toBeNull();
  });

  it('lifts the road smoothly only where the clearance is short', () => {
    const s = Array.from({ length: 101 }, (_, i) => i * 2);
    const elev = s.map(() => 34);
    const lifted = applyClearanceBumps(s, elev, [{ s: 100, minElev: 34.6 }], 60);
    const at = (x: number) => lifted[s.indexOf(x)] ?? NaN;
    expect(at(100)).toBeCloseTo(34.6, 5);
    expect(at(40)).toBeCloseTo(34, 5);
    expect(at(160)).toBeCloseTo(34, 5);
    // 勾配は数 % 以内
    for (let i = 0; i < s.length - 1; i++) {
      const grade = Math.abs((lifted[i + 1] ?? 0) - (lifted[i] ?? 0)) / 2;
      expect(grade).toBeLessThan(0.03);
    }
    // 足りていれば変えない
    expect(applyClearanceBumps(s, elev, [{ s: 100, minElev: 33 }], 60)).toEqual(elev);
  });

  it('places piers at roughly the target spacing and never on forbidden spots', () => {
    // 50〜62m は線路（置けない）
    const isAllowed = (x: number) => !(x >= 50 && x <= 62);
    const stations = choosePierStations(0, 150, { target: 30, min: 18, max: 40, endClearance: 10 }, isAllowed);
    expect(stations.length).toBeGreaterThan(0);
    let prev = 0;
    for (const st of stations) {
      expect(isAllowed(st)).toBe(true);
      expect(st - prev).toBeGreaterThanOrEqual(18);
      expect(st - prev).toBeLessThanOrEqual(40.0001);
      prev = st;
    }
    expect(150 - prev).toBeLessThanOrEqual(40);
  });
});
