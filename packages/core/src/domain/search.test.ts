import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BuildingFloorPlan } from './indoor-types';
import {
  expandRoomRange,
  normalizeSearchText,
  searchBuildings,
  searchLocationItems,
} from './search';
import type { BuildingFeature } from './types';

function makeBuilding(partial: Partial<BuildingFeature>): BuildingFeature {
  return {
    id: 'b1',
    name: 'テスト棟',
    shortName: 'テスト',
    kana: 'てすと',
    englishName: 'Test Bldg',
    category: 'shared',
    inCampus: true,
    faculties: [],
    facilityTags: [],
    keywords: [],
    description: '',
    sculptStyle: 'standard',
    labelPriority: 5,
    polygon: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    centroid: { x: 5, z: 5 },
    groundY: 30,
    minGroundY: 30,
    maxGroundY: 30,
    height: 15,
    levels: 4,
    walkNodeId: 'n_1',
    accessibleWalkNodeId: 'n_1',
    ...partial,
  };
}

describe('search', () => {
  const sample: BuildingFeature[] = [
    makeBuilding({
      id: 'rimpukan',
      landmarkId: 'rimpukan',
      name: '凜風館（総合学生会館）',
      shortName: '凜風館',
      kana: 'りんぷうかん',
      category: 'shared',
      facilityTags: ['cafeteria', 'study'],
      keywords: ['学食', '食堂', '生協'],
      labelPriority: 1,
    }),
    makeBuilding({
      id: 'area1-4',
      landmarkId: 'area1-4',
      name: '第1学舎 4号館',
      shortName: '第1学舎4号館',
      kana: 'だいいちがくしゃ よんごうかん',
      category: 'area1',
      faculties: ['法学部', '文学部'],
      labelPriority: 4,
    }),
    makeBuilding({
      id: 'area4-1',
      landmarkId: 'area4-1',
      name: '第4学舎 1号館',
      shortName: '第4学舎1号館',
      kana: 'だいよんがくしゃ',
      category: 'area4',
      faculties: ['システム理工学部', '環境都市工学部'],
      labelPriority: 2,
    }),
    makeBuilding({
      id: 'house',
      name: '',
      shortName: '',
      category: 'surrounding',
      inCampus: false,
      labelPriority: 99,
    }),
  ];

  const floorPlans: Record<string, BuildingFloorPlan> = {
    'area1-4': {
      buildingId: 'area1-4',
      wingLabel: 'D棟',
      floors: [{ floor: 1, label: '1F', elevator: 'unknown' }],
      entrances: [],
      connectors: [],
      rooms: [
        {
          id: 'd-101-119',
          code: 'D101〜D119',
          name: '講義室・演習室',
          floor: 1,
          wing: 'D棟',
          kind: 'lecture',
          searchableCodes: expandRoomRange('D', 101, 119),
        },
      ],
    },
    'area4-1': {
      buildingId: 'area4-1',
      floors: [{ floor: 2, label: '2F', elevator: 'unknown' }],
      entrances: [],
      connectors: [],
      rooms: [
        {
          id: 'r-4102',
          code: '4102',
          name: '理工大講義室',
          floor: 2,
          kind: 'lecture',
        },
      ],
    },
  };

  it('normalizes katakana and full-width digits', () => {
    expect(normalizeSearchText('ＢＩＧホール１００')).toBe('bigほーる100');
  });

  it('expands numbered room ranges deterministically', () => {
    const codes = expandRoomRange('D', 101, 104);
    expect(codes).toEqual(['D101', 'D102', 'D103', 'D104']);
  });

  it('matches landmark by kana or keyword and excludes unnamed surrounding buildings', () => {
    const all = searchBuildings(sample, '');
    expect(all.some((b) => b.id === 'house')).toBe(false);

    const byKana = searchBuildings(sample, 'りんぷうかん');
    expect(byKana[0]?.id).toBe('rimpukan');

    const byFaculty = searchBuildings(sample, 'システム理工');
    expect(byFaculty[0]?.id).toBe('area4-1');
  });

  it('filters by category', () => {
    const onlyArea4 = searchBuildings(sample, '', 'area4');
    expect(onlyArea4).toHaveLength(1);
    expect(onlyArea4[0]?.id).toBe('area4-1');
  });

  it('searches indoor room codes and expanded range codes', () => {
    const res = searchLocationItems(sample, floorPlans, '4102');
    expect(res[0]?.kind).toBe('room');
    expect(res[0]?.buildingId).toBe('area4-1');
    expect(res[0]?.floor).toBe(2);

    const rangeHit = searchLocationItems(sample, floorPlans, 'D112');
    expect(rangeHit[0]?.kind).toBe('room');
    expect(rangeHit[0]?.buildingId).toBe('area1-4');
    expect(rangeHit[0]?.roomCode).toBe('D112');
    expect(rangeHit[0]?.wing).toBe('D棟');
    expect(rangeHit[0]?.floor).toBe(1);
  });
});

describe('第3学舎の棟の呼び名（KAN-CAN!）', () => {
  const buildings = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'public/data/senriyama/buildings.json'), 'utf8'),
  ) as BuildingFeature[];

  it.each(['第3学舎1号館', '1号館A棟', '第3学舎 2号館 B棟', '3号館C棟', '第3学舎4号館D棟'])(
    'finds 第3学舎 by "%s"',
    (query) => {
      expect(searchBuildings(buildings, query).map((b) => b.id)).toContain('area3');
    },
  );
});
