import { describe, expect, it } from 'vitest';
import {
  AREA3_WING_IDS,
  SENRIYAMA_LANDMARKS,
  SENRIYAMA_WING_BUILDINGS,
  SENRIYAMA_WINGS,
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

  it('marks all unsourced accessibility fields as unknown and omits unsourced powerOutlets and capacity', () => {
    for (const plan of Object.values(SENRIYAMA_FLOOR_PLANS)) {
      for (const fl of plan.floors) {
        expect(fl.elevator).toBe('unknown');
        expect(fl.accessibleRestroom).toBe('unknown');
      }
      // 出典の無い出入口は持たない（docs/indoor-plan.md の P0a）
      expect(plan.entrances).toEqual([]);
      for (const conn of plan.connectors) {
        // 連絡は出典つきの物だけ。段差の有無は資料に書かれている物だけを yes/no にする
        expect(conn.source).toMatch(/バリアフリーマップ/);
        expect(conn.access).not.toBe('yes');
      }
      for (const room of plan.rooms) {
        expect(room.access ?? 'unknown').toBe('unknown');
        expect(room.access).not.toBe('yes');
        expect(room.access).not.toBe('no');
        expect('powerOutlets' in room).toBe(false);
        expect('capacity' in room).toBe(false);
      }
    }
  });
});

describe('SENRIYAMA_FLOOR_PLANS sourced connectors (P0a)', () => {
  const plans = Object.values(SENRIYAMA_FLOOR_PLANS);
  const all = plans.flatMap((plan) => plan.connectors.map((conn) => ({ plan, conn })));

  it('keeps one id per connector and lists it on both buildings it joins', () => {
    const byId = new Map<string, { plan: (typeof plans)[number]; conn: (typeof all)[number]['conn'] }[]>();
    for (const item of all) byId.set(item.conn.id, [...(byId.get(item.conn.id) ?? []), item]);
    for (const [id, items] of byId) {
      const conn = items[0]!.conn;
      expect(items.every((item) => item.conn === conn), id).toBe(true);
      expect(items.map((item) => item.plan.buildingId).sort(), id).toEqual(
        [conn.fromBuildingId, conn.toBuildingId].sort(),
      );
    }
  });

  it('matches the barrier-free map: A-D 1F with stairs, B-C 2F, D 2F-E 1F, area4 2-4 at B1 and 1-3F', () => {
    const ids = new Set(all.map((item) => item.conn.id));
    expect([...ids].sort()).toEqual(
      [
        'bf-area1-ad-1f',
        'bf-area1-bc-2f',
        'bf-area1-de',
        'bf-area4-24-1f',
        'bf-area4-24-2f',
        'bf-area4-24-3f',
        'bf-area4-24-b1',
      ].sort(),
    );
    const ad = all.find((item) => item.conn.id === 'bf-area1-ad-1f')!.conn;
    expect([ad.fromFloor, ad.toFloor, ad.access]).toEqual([1, 1, 'no']);
    const de = all.find((item) => item.conn.id === 'bf-area1-de')!.conn;
    expect([de.fromBuildingId, de.fromFloor, de.toBuildingId, de.toFloor]).toEqual(['area1-4', 2, 'area1-5', 1]);
    // 以前の出典の無い 12 件（全部 2 階 ↔ 2 階）が戻っていない
    expect(all.some((item) => item.conn.id.startsWith('conn-'))).toBe(false);
  });
});

describe('部屋の棟の id（docs/indoor-plan.md 17 節の移行の先取り）', () => {
  const area3Ids = new Map(SENRIYAMA_WINGS.filter((w) => w.id.startsWith('area3-')).map((w) => [w.id, w]));

  it('gives every 第3学舎 room the id of its wing, matching the wing name and the room code letter', () => {
    const rooms = SENRIYAMA_FLOOR_PLANS.area3?.rooms ?? [];
    expect(rooms.length).toBeGreaterThan(15);
    for (const room of rooms) {
      const wing = room.wingId ? area3Ids.get(room.wingId) : undefined;
      expect(wing, room.id).toBeDefined();
      if (!wing) continue;
      // 表示の名前（'3号館 C棟'）と棟の表がそろう
      expect(room.wing).toBe(`${wing.hallName} ${wing.name}`);
      // 部屋の番号の頭の文字（C301 の C）が棟の記号と同じ（'B1F カフェソシオ' の B1F は地下 1 階で、棟ではない）
      const letter = /^[A-D](?=\d{3})/.exec(room.code)?.[0];
      if (letter) expect(`area3-${letter.toLowerCase()}`, room.id).toBe(room.wingId);
    }
    // 4 棟とも部屋がある
    expect(new Set(rooms.map((r) => r.wingId)).size).toBe(4);
    expect(rooms.find((r) => r.id === 'a3-cafe-socio')?.wingId).toBe(AREA3_WING_IDS.a);
  });

  it('gives every room of the other 学舎 a wing id from the table, linked to the same building (P0b)', () => {
    const wings = new Map(SENRIYAMA_WINGS.map((w) => [w.id, w]));
    const linkOf = new Map(SENRIYAMA_WING_BUILDINGS.map((l) => [l.wingId, l.buildingId]));
    const schoolPlans = Object.values(SENRIYAMA_FLOOR_PLANS).filter((plan) => plan.rooms.some((r) => r.wingId));
    expect(schoolPlans.map((p) => p.buildingId).sort()).toEqual(
      [
        'area1-1', 'area1-2', 'area1-3', 'area1-4', 'area1-5', 'iwasaki', 'shobunkan', 'ibunkan',
        'area2-1', 'area2-2', 'area2-3', 'area2-bighall', 'area3',
        'area4-1', 'area4-2', 'area4-3', 'area4-4', 'hitech-core',
      ].sort(),
    );
    let count = 0;
    for (const plan of schoolPlans) {
      for (const room of plan.rooms) {
        const wing = room.wingId ? wings.get(room.wingId) : undefined;
        expect(wing, room.id).toBeDefined();
        if (!wing || !room.wingId) continue;
        count++;
        if (plan.buildingId === 'hitech-core') {
          // 部屋のデータは実験棟 6 棟をハイテク・リサーチ・コアにまとめている。棟は OSM の実験棟ごとの輪郭に対応する
          expect(room.wing, room.id).toContain(wing.name);
        } else {
          expect(linkOf.get(room.wingId), room.id).toBe(plan.buildingId);
        }
        // 表示の名前（'A棟'・'③2号館（教室棟）' など）に棟の名前が入る（大学院学舎の部屋は表示の名前が無い）
        if (room.wing) expect(room.wing, room.id).toContain(wing.name);
      }
    }
    // 121 件から、部外者・学部生が入れない第4学舎2号館の研究棟の 1 件を外した（持ち主の決め 2026-11-24）
    expect(count).toBe(120);
    // 1 つの建物の中で、表示の名前と棟の id は 1 対 1（建物シートの棟のボタンの数と名前が変わらない）
    for (const plan of schoolPlans) {
      const pairs = new Set(plan.rooms.map((r) => `${r.wing ?? ''}|${r.wingId}`));
      expect(new Set(plan.rooms.map((r) => r.wingId)).size, plan.buildingId).toBe(pairs.size);
      expect(new Set(plan.rooms.map((r) => r.wing ?? '')).size, plan.buildingId).toBe(pairs.size);
    }
  });

  it('lists no room of a wing that outsiders and undergraduates cannot enter (docs/indoor-plan.md 3 節)', () => {
    const restricted = SENRIYAMA_WINGS.filter((w) => w.restricted).map((w) => w.id);
    // 今は第4学舎2号館の研究棟だけ（持ち主の決め 2026-11-24）。棟の名前は棟の表に残す
    expect(restricted).toEqual(['area4-h2r']);
    for (const plan of Object.values(SENRIYAMA_FLOOR_PLANS)) {
      for (const room of plan.rooms) expect(restricted, room.id).not.toContain(room.wingId);
    }
    // 検索でも研究棟の部屋は出ない（前に載っていた部屋の名前で探しても当たらない）
    const buildings = buildFixtureBuildings();
    for (const q of ['高磁場NMR室', '建築設計製図室', '電子顕微鏡室']) {
      expect(searchLocationItems(buildings, SENRIYAMA_FLOOR_PLANS, q).filter((i) => i.kind === 'room'), q).toEqual([]);
    }
  });

  it('leaves the rooms of buildings that are not 学舎 without a wing id', () => {
    for (const id of ['rimpukan', 'shinkandaikaikan-n', 'shinkandaikaikan-s', 'central-gym', 'east-gym', 'gaifukan', 'seishikan-4', 'library', 'kanbunkan', 'enshinkan']) {
      for (const room of SENRIYAMA_FLOOR_PLANS[id]?.rooms ?? []) expect(room.wingId, room.id).toBeUndefined();
    }
  });
});
