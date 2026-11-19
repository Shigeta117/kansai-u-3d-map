import { describe, expect, it } from 'vitest';
import {
  SENRIYAMA_LANDMARKS,
  searchLocationItems,
  type BuildingFeature,
} from '@kansai-u-3d/core';
import { getIndoorDataStats, SENRIYAMA_FLOOR_PLANS } from './senriyama-indoor';

function buildFixtureBuildings(): BuildingFeature[] {
  return SENRIYAMA_LANDMARKS.map((lm) => ({
    id: lm.id,
    landmarkId: lm.id,
    name: lm.name,
    shortName: lm.shortName,
    kana: lm.kana,
    englishName: lm.englishName,
    category: lm.category,
    inCampus: true,
    faculties: lm.faculties,
    facilityTags: lm.facilityTags,
    keywords: lm.keywords,
    description: lm.description,
    architectNote: lm.architectNote,
    sculptStyle: lm.sculptStyle ?? 'standard',
    labelPriority: lm.labelPriority,
    isSpotOnly: lm.isSpotOnly,
    isQuickOrigin: lm.isQuickOrigin,
    polygon: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    centroid: { x: 0, z: 0 },
    groundY: 40,
    minGroundY: 40,
    maxGroundY: 40,
    height: 15,
    levels: lm.defaultLevels,
    walkNodeId: 'n_1',
    accessibleWalkNodeId: 'n_1',
  }));
}

describe('SENRIYAMA_FLOOR_PLANS official KAN-CAN integrity', () => {
  const landmarkIds = new Set(SENRIYAMA_LANDMARKS.map((l) => l.id));
  const buildings = buildFixtureBuildings();

  it('maps every floorPlan buildingId and connector target to a valid SENRIYAMA_LANDMARKS id', () => {
    for (const [key, plan] of Object.entries(SENRIYAMA_FLOOR_PLANS)) {
      expect(plan.buildingId).toBe(key);
      expect(landmarkIds.has(key)).toBe(true);
      for (const conn of plan.connectors) {
        expect(landmarkIds.has(conn.fromBuildingId)).toBe(true);
        expect(landmarkIds.has(conn.toBuildingId)).toBe(true);
      }
    }
  });

  it('finds individual expanded room codes across Area 1, Area 2, Area 3, Area 4, and Shobunkan', () => {
    const d112 = searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, 'D112');
    expect(d112[0]?.buildingId).toBe('area1-4');
    expect(d112[0]?.floor).toBe(1);
    expect(d112[0]?.roomCode).toBe('D112');

    const r2205 = searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, '2205');
    expect(r2205[0]?.buildingId).toBe('area4-2');
    expect(r2205[0]?.floor).toBe(2);

    const r4002 = searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, '4002');
    expect(r4002[0]?.buildingId).toBe('area4-4');
    expect(r4002[0]?.floor).toBe(-1);

    const a503 = searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, 'A503');
    const a503Bldgs = a503.filter((i) => i.kind === 'room').map((i) => i.buildingId);
    expect(a503Bldgs).toContain('area1-1');
    expect(a503Bldgs).toContain('area2-1');
  });

  it('finds faculty offices, service centers, and Rimpukan 2F cafeteria accurately', () => {
    const hobun = searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, '法文オフィス');
    expect(hobun[0]?.buildingId).toBe('area1-1');
    expect(hobun[0]?.floor).toBe(1);

    const seigai = searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, '政外オフィス');
    expect(seigai[0]?.buildingId).toBe('iwasaki');
    expect(seigai[0]?.floor).toBe(1);

    const keisho = searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, '経商オフィス');
    expect(keisho[0]?.buildingId).toBe('area2-1');
    expect(keisho[0]?.floor).toBe(2);

    const kyomu = searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, '教務センター');
    expect(kyomu[0]?.buildingId).toBe('area2-1');
    expect(kyomu[0]?.floor).toBe(1);

    const area3Office = searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, '第3学舎オフィス');
    expect(area3Office[0]?.buildingId).toBe('area3');
    expect(area3Office[0]?.floor).toBe(1);

    const riko = searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, '理工系オフィス');
    expect(riko[0]?.buildingId).toBe('area4-1');
    expect(riko[0]?.floor).toBe(1);

    const dining = searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, '生協（食堂）');
    expect(dining[0]?.buildingId).toBe('rimpukan');
    expect(dining[0]?.floor).toBe(2);

    const career = searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, 'キャリアセンター事務室');
    expect(career[0]?.buildingId).toBe('shinkandaikaikan-n');
    expect(career[0]?.floor).toBe(3);
  });

  it('reports comprehensive stats and contains zero forbidden characters', () => {
    const stats = getIndoorDataStats();
    expect(stats.buildingCount).toBeGreaterThanOrEqual(24);
    expect(stats.searchableCodeCount).toBeGreaterThan(250);

    const serialized = JSON.stringify(SENRIYAMA_FLOOR_PLANS);
    expect(serialized.includes('\u7a93')).toBe(false);
    expect(serialized.includes('\u52b9\u304f')).toBe(false);
  });
});
