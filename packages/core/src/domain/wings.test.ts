import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from './types';
import {
  findWing,
  findWingAt,
  joinBuildingWings,
  pickableWingBuildingIds,
  WING_ID_RULE,
  wingFloorsText,
  wingFootprintCentroid,
  wingHasFloor,
  wingLabel,
  wingRegionContains,
  wingSearchAliases,
  wingTitle,
  type BuildingWing,
  type Wing,
} from './wings';

function makeWing(partial: Partial<Wing> & Pick<Wing, 'id' | 'name'>): Wing {
  return {
    school: 'テスト学舎',
    floorsAbove: 4,
    floorsBelow: 0,
    floorHeightM: 3.9,
    entrances: [],
    ...partial,
  };
}

/** 東西 40m・南北 20m の建物を、東西の真ん中で西棟と東棟に分ける（枠は回さない） */
const WEST: BuildingWing = { ...makeWing({ id: 'area9-w', name: '西棟', hallName: '1号館' }), region: { axisU: [1, 0], uMax: 20 } };
const EAST: BuildingWing = {
  ...makeWing({ id: 'area9-e', name: '東棟', hallName: '2号館', floorsAbove: 6, floorsBelow: 1 }),
  region: { axisU: [1, 0], uMin: 20 },
};

const BUILDING: Pick<BuildingFeature, 'polygon' | 'holes' | 'wings'> = {
  polygon: [
    [0, 0],
    [40, 0],
    [40, 20],
    [0, 20],
  ],
  wings: [WEST, EAST],
};

describe('棟（館内の単位）と建物との対応', () => {
  it('joins the wing table and the building link table (one building can hold several wings, or a wing is a whole building)', () => {
    const wings = [makeWing({ id: 'area9-a', name: 'A棟' }), makeWing({ id: 'area9-b', name: 'B棟' }), makeWing({ id: 'area8-c', name: 'C棟' })];
    const joined = joinBuildingWings(wings, [
      { wingId: 'area9-a', buildingId: 'big', region: { axisU: [1, 0], uMax: 0 } },
      { wingId: 'area9-b', buildingId: 'big', region: { axisU: [1, 0], uMin: 0 } },
      { wingId: 'area8-c', buildingId: 'small' },
      { wingId: 'missing', buildingId: 'small' },
    ]);
    expect(joined.get('big')?.map((w) => w.id)).toEqual(['area9-a', 'area9-b']);
    expect(joined.get('big')?.[1]?.region?.uMin).toBe(0);
    expect(joined.get('small')?.map((w) => w.id)).toEqual(['area8-c']);
    // 範囲の無い棟は建物の全体
    expect(joined.get('small')?.[0]?.region).toBeUndefined();
    expect(findWingAt({ wings: joined.get('small') }, 1e6, -1e6)?.id).toBe('area8-c');
  });

  it('keeps wing ids apart from building ids (学舎の鍵 ＋ 棟の記号)', () => {
    for (const id of ['area3-c', 'area1-a', 'area2-f', 'iwasaki-f', 'area4-h3', 'area4-h1p', 'area4-h2a', 'area4-x6', 'shobunkan-main']) {
      expect(WING_ID_RULE.test(id), id).toBe(true);
    }
    for (const id of ['area3', 'area1-1', 'area4-2', 'area2-bighall', 'shinkandaikaikan-n', 'east-gym', 'way_423067247', 'c', 'area3-g', 'area4-h']) {
      expect(WING_ID_RULE.test(id), id).toBe(false);
    }
  });

  it('lets the map pick wings only in buildings whose wings all have a region (2 or more)', () => {
    const region = { axisU: [1, 0] as [number, number], uMax: 0 };
    const pickable = pickableWingBuildingIds([
      { wingId: 'area9-a', buildingId: 'split', region },
      { wingId: 'area9-b', buildingId: 'split', region: { axisU: [1, 0], uMin: 0 } },
      { wingId: 'area8-a', buildingId: 'single' },
      { wingId: 'area8-b', buildingId: 'single-with-region', region },
      { wingId: 'area7-a', buildingId: 'unsplit' },
      { wingId: 'area7-b', buildingId: 'unsplit' },
      { wingId: 'area6-a', buildingId: 'half', region },
      { wingId: 'area6-b', buildingId: 'half' },
    ]);
    expect([...pickable]).toEqual(['split']);
  });

  it('tells which wing region a point on the building is in', () => {
    expect(findWingAt(BUILDING, 5, 10)?.id).toBe('area9-w');
    expect(findWingAt(BUILDING, 35, 10)?.id).toBe('area9-e');
    expect(findWingAt({ wings: undefined }, 5, 10)).toBeNull();
  });

  it('uses the rotated frame of the building (u along axisU, v at +90° from x to z)', () => {
    // u 軸が北東（x+, z-）を向き、v 軸は南東（x+, z+）を向く枠
    const s = Math.SQRT1_2;
    const region = { axisU: [s, -s] as [number, number], uMin: 10, vMax: 1 };
    expect(wingRegionContains(region, 10, -10)).toBe(true); // u = 14.1、v = 0
    expect(wingRegionContains(region, 5, -5)).toBe(false); // u = 7.1
    expect(wingRegionContains(region, 13.54, -6.46)).toBe(false); // u = 14.1、v = 5
    expect(wingRegionContains(undefined, 1e6, 1e6)).toBe(true);
  });

  it('finds wings by id', () => {
    expect(findWing(BUILDING, 'area9-e')).toBe(EAST);
    expect(findWing(BUILDING, 'x')).toBeNull();
    expect(findWing(null, 'area9-e')).toBeNull();
    expect(findWing(BUILDING, null)).toBeNull();
  });

  it('names the wing with its school and hall: 「テスト学舎 1号館 西棟」', () => {
    expect(wingLabel(WEST)).toBe('1号館 西棟');
    expect(wingTitle(WEST)).toBe('テスト学舎 1号館 西棟');
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

  it('makes search names from the school, the hall and the wing name', () => {
    expect(wingSearchAliases(WEST)).toEqual([
      '西棟',
      'テスト学舎西棟',
      '1号館',
      'テスト学舎1号館',
      '1号館西棟',
      'テスト学舎1号館西棟',
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
    expect(east?.centroid.x).toBeCloseTo((400 * 30 - 50 * 22.5) / 350, 6);
    expect(wingFootprintCentroid(BUILDING, { region: { axisU: [1, 0], uMin: 100 } })).toBeNull();
    // 範囲の無い棟は建物の全体
    expect(wingFootprintCentroid(BUILDING, {})?.area).toBeCloseTo(800, 6);
  });
});
