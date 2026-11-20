import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBuildingWings } from '../data/loadCampusData';
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

describe('公式の地図（関西大学 広報課 CAMPUSMAP、2023 年 4 月）の名前', () => {
  const buildings = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'public/data/senriyama/buildings.json'), 'utf8'),
  ) as BuildingFeature[];
  const byKey = (key: string): BuildingFeature | undefined =>
    buildings.find((b) => b.id === key || b.osmId === key);

  it.each([
    ['法文研究室棟', 'hobunken'],
    ['ソシオネットワーク戦略研究機構', 'keisho-kenkyu'],
    ['第2学舎1号館B棟', 'way_423067212'],
    ['第4学舎 第3実験棟', 'way_423067248'],
    ['弓道場', 'way_490258123'],
    ['誠之館2・3号館', 'way_624589997'],
    ['関西大学共済会', 'way_624589997'],
    ['中央グラウンド', 'central-ground'],
    ['KAISERS', 'kaisers-baseball-field'],
    ['千里山北グラウンド', 'kaisers-baseball-field'],
    ['北広場', 'kitahiroba'],
    ['あすかの庭', 'asuka-garden'],
    ['一高', 'way_497645752'],
    ['関西大学第一中学校', 'way_497645756'],
    ['秀麗館', 'way_497645754'],
    ['秀麗寮', 'rel_10704520'],
  ])('finds "%s" (%s)', (query, key) => {
    const hit = byKey(key);
    expect(hit).toBeDefined();
    expect(searchBuildings(buildings, query).map((b) => b.id)).toContain(hit!.id);
  });

  it('keeps the old OSM names searchable', () => {
    expect(searchBuildings(buildings, '法文研究棟').map((b) => b.id)).toContain('hobunken');
    expect(searchBuildings(buildings, '誠之館2号館旧館').map((b) => b.osmId)).toContain('way_624589997');
  });

  it('draws the kyudo range as a low shed, not a 4-storey block', () => {
    const kyudo = byKey('way_490258123');
    expect(kyudo?.levels).toBe(1);
    expect(kyudo?.height).toBeLessThan(6);
  });

  it('places the grounds and gardens as spots without a marker pad', () => {
    for (const id of ['central-ground', 'kaisers-baseball-field', 'kitahiroba', 'asuka-garden']) {
      const spot = byKey(id);
      expect(spot?.isSpotOnly).toBe(true);
      expect(spot?.sculptStyle).toBe('open-space');
      expect(spot?.accessibleWalkNodeId).toBeTruthy();
    }
  });
});

describe('第3学舎の棟の検索（その棟を選んだ状態で開く）', () => {
  const buildings = applyBuildingWings(
    JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'public/data/senriyama/buildings.json'), 'utf8'),
    ) as BuildingFeature[],
  );
  // 部屋のデータの形だけを写した小さい表（本物は apps/guide の senriyama-indoor.ts）
  const plans: Record<string, BuildingFloorPlan> = {
    area3: {
      buildingId: 'area3',
      floors: [],
      entrances: [],
      connectors: [],
      rooms: [
        { id: 'a3-a101', code: 'A101', name: 'A101教室', floor: 1, kind: 'lecture', wing: '1号館 A棟', wingId: 'area3-a' },
        {
          id: 'a3-c301-304',
          code: 'C301〜C304',
          name: 'C301〜C304教室',
          floor: 3,
          kind: 'lecture',
          wing: '3号館 C棟',
          wingId: 'area3-c',
          searchableCodes: expandRoomRange('C', 301, 304),
        },
      ],
    },
    'area1-3': {
      buildingId: 'area1-3',
      wingLabel: 'C棟（3号館）',
      floors: [],
      entrances: [],
      connectors: [],
      rooms: [
        { id: 'c101', code: 'C101〜C104', name: 'C101〜C104教室', floor: 1, kind: 'lecture', wing: 'C棟', searchableCodes: expandRoomRange('C', 101, 104) },
        { id: 'c301', code: 'C301〜C304', name: 'C301〜C304教室', floor: 3, kind: 'lecture', wing: 'C棟', searchableCodes: expandRoomRange('C', 301, 304) },
      ],
    },
  };

  it.each(['C棟', '3号館', '3号館C棟', '第3学舎 C棟', '第3学舎3号館', 'C棟（3号館）', '３号館 Ｃ棟'])(
    'puts 第3学舎 3号館 C棟 first for "%s"',
    (query) => {
      const top = searchLocationItems(buildings, plans, query)[0];
      expect(top).toMatchObject({
        kind: 'building',
        buildingId: 'area3',
        wingId: 'area3-c',
        title: '第3学舎 3号館 C棟',
        subtitle: '第3学舎（社会） ・ 地上 10 階',
      });
    },
  );

  it('still lists the C棟 rooms of the other 学舎 below the wing', () => {
    const res = searchLocationItems(buildings, plans, 'C棟');
    expect(res.filter((i) => i.buildingId === 'area1-3' && i.kind === 'room').length).toBeGreaterThan(0);
    expect(res.filter((i) => i.wingId).map((i) => i.wingId)).toEqual(['area3-c', 'area3-c']);
  });

  it('does not list the 4 wings for the 学舎 name alone or a single letter', () => {
    for (const q of ['第3学舎', '第3', 'c', 'C']) {
      expect(searchLocationItems(buildings, plans, q).filter((i) => i.key.startsWith('wing:'))).toEqual([]);
    }
    expect(searchLocationItems(buildings, plans, '第3学舎')[0]?.buildingId).toBe('area3');
  });

  it('carries the wing id on rooms that have one (C301 opens the C wing on 3F)', () => {
    const c301 = searchLocationItems(buildings, plans, 'C301');
    const area3Room = c301.find((i) => i.buildingId === 'area3');
    expect(area3Room).toMatchObject({ kind: 'room', wingId: 'area3-c', floor: 3, roomCode: 'C301' });
    // 棟の id を持たない部屋（第1学舎）には付けない
    expect(c301.find((i) => i.buildingId === 'area1-3')?.wingId).toBeUndefined();
  });

  it('follows the category filter', () => {
    expect(searchLocationItems(buildings, plans, 'C棟', 'area1').some((i) => i.wingId)).toBe(false);
    expect(searchLocationItems(buildings, plans, 'C棟', 'area3')[0]?.wingId).toBe('area3-c');
  });
});
