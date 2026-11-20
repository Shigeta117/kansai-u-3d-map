import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from './types';
import {
  findWing,
  findWingAt,
  findWingForRoom,
  wingFloorsText,
  wingFootprintCentroid,
  wingHasFloor,
  wingLabel,
  wingRegionContains,
  wingSearchAliases,
  wingTitle,
  type BuildingWing,
} from './wings';

/** 東西 40m・南北 20m の建物を、東西の真ん中で西棟と東棟に分ける（枠は回さない） */
function makeWing(partial: Partial<BuildingWing> & Pick<BuildingWing, 'id' | 'name' | 'region'>): BuildingWing {
  return {
    roomWing: partial.name,
    floorsAbove: 4,
    floorsBelow: 0,
    floorHeightM: 3.9,
    entrances: [],
    ...partial,
  };
}

const WEST = makeWing({ id: 'w', name: '西棟', hallName: '1号館', region: { axisU: [1, 0], uMax: 20 } });
const EAST = makeWing({
  id: 'e',
  name: '東棟',
  hallName: '2号館',
  roomWing: '2号館 東棟',
  floorsAbove: 6,
  floorsBelow: 1,
  region: { axisU: [1, 0], uMin: 20 },
});

const BUILDING: Pick<BuildingFeature, 'shortName' | 'polygon' | 'holes' | 'wings'> = {
  shortName: 'テスト館',
  polygon: [
    [0, 0],
    [40, 0],
    [40, 20],
    [0, 20],
  ],
  wings: [WEST, EAST],
};

describe('棟（建物の部品）', () => {
  it('tells which wing a point on the building is in (the hit test mark)', () => {
    expect(findWingAt(BUILDING, 5, 10)?.id).toBe('w');
    expect(findWingAt(BUILDING, 35, 10)?.id).toBe('e');
    expect(findWingAt({ wings: undefined }, 5, 10)).toBeNull();
  });

  it('uses the rotated frame of the building (u along axisU, v at +90° from x to z)', () => {
    // u 軸が北東（x+, z-）を向き、v 軸は南東（x+, z+）を向く枠
    const s = Math.SQRT1_2;
    const region = { axisU: [s, -s] as [number, number], uMin: 10, vMax: 1 };
    expect(wingRegionContains(region, 10, -10)).toBe(true); // u = 14.1、v = 0
    expect(wingRegionContains(region, 5, -5)).toBe(false); // u = 7.1
    expect(wingRegionContains(region, 13.54, -6.46)).toBe(false); // u = 14.1、v = 5
  });

  it('finds wings by id and by the room data wing name', () => {
    expect(findWing(BUILDING, 'e')).toBe(EAST);
    expect(findWing(BUILDING, 'x')).toBeNull();
    expect(findWing(null, 'e')).toBeNull();
    expect(findWingForRoom(BUILDING, '2号館 東棟')).toBe(EAST);
    expect(findWingForRoom(BUILDING, undefined)).toBeNull();
  });

  it('names the wing with its hall: 「テスト館 1号館 西棟」', () => {
    expect(wingLabel(WEST)).toBe('1号館 西棟');
    expect(wingTitle(BUILDING, WEST)).toBe('テスト館 1号館 西棟');
    expect(wingFloorsText(WEST)).toBe('地上 4 階');
    expect(wingFloorsText(EAST)).toBe('地下 1 階・地上 6 階');
  });

  it('knows which floors a wing has', () => {
    expect(wingHasFloor(EAST, -1)).toBe(true);
    expect(wingHasFloor(EAST, 6)).toBe(true);
    expect(wingHasFloor(EAST, 7)).toBe(false);
    expect(wingHasFloor(EAST, 0)).toBe(false);
    expect(wingHasFloor(WEST, -1)).toBe(false);
  });

  it('makes search names from the hall and the wing name', () => {
    expect(wingSearchAliases(BUILDING, WEST)).toEqual([
      '西棟',
      'テスト館西棟',
      '1号館',
      'テスト館1号館',
      '1号館西棟',
      'テスト館1号館西棟',
      '西棟（1号館）',
    ]);
  });

  it('computes the area and centroid of the wing part of the outline, minus holes', () => {
    const west = wingFootprintCentroid(BUILDING, WEST);
    expect(west?.area).toBeCloseTo(400, 6);
    expect(west?.centroid.x).toBeCloseTo(10, 6);
    expect(west?.centroid.z).toBeCloseTo(10, 6);
    // 東棟に中庭（10m × 10m）が半分（5m × 10m）掛かる
    const withHole = {
      ...BUILDING,
      holes: [
        [
          [15, 5],
          [25, 5],
          [25, 15],
          [15, 15],
        ] as [number, number][],
      ],
    };
    const east = wingFootprintCentroid(withHole, EAST);
    expect(east?.area).toBeCloseTo(400 - 50, 6);
    // (400·30 − 50·22.5) / 350
    expect(east?.centroid.x).toBeCloseTo((400 * 30 - 50 * 22.5) / 350, 6);
    expect(wingFootprintCentroid(BUILDING, makeWing({ id: 'x', name: 'x', region: { axisU: [1, 0], uMin: 100 } }))).toBeNull();
  });
});
