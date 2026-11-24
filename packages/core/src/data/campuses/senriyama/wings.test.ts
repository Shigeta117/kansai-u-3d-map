import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WING_ID_RULE, wingFootprintCentroid, wingRegionContains } from '../../../domain/wings';
import type { BuildingFeature } from '../../../domain/types';
import { buildArea3 } from '../../../scene/heroes/area3';
import { applyBuildingWings } from '../../loadCampusData';
import { AREA1_WING_IDS, AREA3_AXIS_U, AREA3_WING_IDS, SENRIYAMA_WING_BUILDINGS, SENRIYAMA_WINGS } from './wings';

const buildings = applyBuildingWings(
  JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'public/data/senriyama/buildings.json'), 'utf8'),
  ) as BuildingFeature[],
);
const area3 = buildings.find((b) => b.id === 'area3');
if (!area3) throw new Error('area3 missing');

function pointInRing(x: number, z: number, ring: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function ringArea(ring: readonly [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    if (p && q) a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** 枠の座標 (u, v) */
function frameOf(x: number, z: number): [number, number] {
  const [ax, az] = AREA3_AXIS_U;
  return [x * ax + z * az, -x * az + z * ax];
}

describe('第3学舎の 4 棟（1〜4 号館 A〜D 棟）', () => {
  const wings = area3.wings ?? [];

  it('attaches the 4 wings to area3 only, with the KAN-CAN! floor counts', () => {
    expect(buildings.filter((b) => b.wings).map((b) => b.id)).toEqual(['area3']);
    expect(wings.map((w) => [w.id, w.school, w.hallName, w.name, w.floorsBelow, w.floorsAbove])).toEqual([
      ['area3-a', '第3学舎', '1号館', 'A棟', 1, 4],
      ['area3-b', '第3学舎', '2号館', 'B棟', 0, 5],
      ['area3-c', '第3学舎', '3号館', 'C棟', 0, 10],
      ['area3-d', '第3学舎', '4号館', 'D棟', 0, 5],
    ]);
    for (const w of wings) {
      expect(w.entrances).toEqual([]);
      expect(w.region).toBeDefined();
    }
  });

  it('keeps the wing table and the building link table consistent (ids unique and follow the rule)', () => {
    const ids = SENRIYAMA_WINGS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(WING_ID_RULE);
    expect(Object.values(AREA3_WING_IDS)).toEqual(ids.filter((id) => id.startsWith('area3-')));
    const buildingIds = new Set(buildings.map((b) => b.id));
    for (const link of SENRIYAMA_WING_BUILDINGS) {
      expect(ids).toContain(link.wingId);
      expect(buildingIds.has(link.buildingId), link.buildingId).toBe(true);
    }
    // 1 つの棟は 1 つの建物に対応し、どの棟も対応がある
    const linked = SENRIYAMA_WING_BUILDINGS.map((l) => l.wingId);
    expect(new Set(linked).size).toBe(linked.length);
    expect(new Set(linked)).toEqual(new Set(ids));
    // 棟の id は建物の id と重ならない
    for (const b of buildings) expect(WING_ID_RULE.test(b.id), b.id).toBe(false);
  });

  it('splits the outline into the 4 wings with no gap and no overlap', () => {
    // 輪郭の中（中庭は除く）の 1m 間隔の点は、ちょうど 1 つの棟に入る
    const xs = area3.polygon.map(([x]) => x);
    const zs = area3.polygon.map(([, z]) => z);
    let inside = 0;
    const counts = new Map<string, number>();
    for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x += 1) {
      for (let z = Math.floor(Math.min(...zs)); z <= Math.max(...zs); z += 1) {
        const px = x + 0.37;
        const pz = z + 0.61;
        if (!pointInRing(px, pz, area3.polygon)) continue;
        if ((area3.holes ?? []).some((h) => pointInRing(px, pz, h))) continue;
        inside++;
        const hits = wings.filter((w) => wingRegionContains(w.region, px, pz));
        expect(hits).toHaveLength(1);
        const id = hits[0]?.id ?? '';
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    expect(inside).toBeGreaterThan(3000);
    for (const id of Object.values(AREA3_WING_IDS)) expect(counts.get(id) ?? 0).toBeGreaterThan(300);
    // 塊の面積の和は、輪郭の面積から中庭を引いた値
    const total = wings.reduce((sum, w) => sum + (wingFootprintCentroid(area3, w)?.area ?? 0), 0);
    const expected = ringArea(area3.polygon) - (area3.holes ?? []).reduce((s, h) => s + ringArea(h), 0);
    expect(total).toBeCloseTo(expected, 1);
  });

  it('places C at the west end, A at the east, B on the south side of the courtyard and D on the north', () => {
    const c = (id: string): [number, number] => {
      const w = wings.find((x) => x.id === id);
      const fc = w ? wingFootprintCentroid(area3, w) : null;
      if (!fc) throw new Error(`${id} has no footprint`);
      return frameOf(fc.centroid.x, fc.centroid.z);
    };
    const [cu] = c(AREA3_WING_IDS.c);
    const [au] = c(AREA3_WING_IDS.a);
    const [bu, bv] = c(AREA3_WING_IDS.b);
    const [du, dv] = c(AREA3_WING_IDS.d);
    expect(cu).toBeLessThan(bu - 15);
    expect(au).toBeGreaterThan(bu + 15);
    expect(Math.abs(bu - du)).toBeLessThan(3);
    // v は南南東が +（B棟は関西大学会館の側の手前、D棟は第3学舎連絡デッキの側）
    expect(bv).toBeGreaterThan(dv + 15);
  });

  it('matches the masses of the hero model (each part lies in its own wing)', () => {
    const groundVisualY = 42;
    const hero = buildArea3({ building: area3, groundVisualY, sampleGroundVisualY: () => groundVisualY });
    hero.group.updateMatrixWorld(true);
    /** 塊の範囲に入るか（境目の上の頂点は 1cm まで許す） */
    const inWing = (wingId: string, x: number, z: number): boolean => {
      const r = wings.find((w) => w.id === wingId)?.region;
      if (!r) throw new Error(wingId);
      const [u, v] = frameOf(x, z);
      const tol = 0.01;
      return (
        (r.uMin === undefined || u >= r.uMin - tol) &&
        (r.uMax === undefined || u <= r.uMax + tol) &&
        (r.vMin === undefined || v >= r.vMin - tol) &&
        (r.vMax === undefined || v <= r.vMax + tol)
      );
    };
    const expectIn = (name: string, wingIds: string[]): void => {
      const obj = hero.group.getObjectByName(name);
      if (!(obj instanceof THREE.Mesh)) throw new Error(`${name} missing`);
      const pos = obj.geometry.getAttribute('position');
      const p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
        expect(wingIds.some((id) => inWing(id, p.x, p.z)), `${name} vertex ${i}`).toBe(true);
      }
    };
    const { a, b, c, d } = AREA3_WING_IDS;
    for (const name of ['area3-tower-base', 'area3-tower-step', 'area3-tower-main', 'area3-tower-slender', 'area3-vestibule']) {
      expectIn(name, [c]);
    }
    expectIn('area3-wing-a', [a]);
    // B と D の 1 つの塊（中庭を挟む）は、B と D の範囲に収まる
    expectIn('area3-wing-bd', [b, d]);
    // 塔の部品には C棟の印がある（東の面のフィンと文字は B・D の範囲の上に張り出すので、範囲ではなく印で C棟にする）
    for (const name of ['area3-tower-main', 'area3-fins', 'area3-fin-glass', 'area3-fin-lintel-east', 'area3-letter-lines', 'area3-antenna']) {
      expect(hero.group.getObjectByName(name)?.userData.wingId, name).toBe(c);
    }
    expect(hero.group.getObjectByName('area3-wing-a')?.userData.wingId).toBe(a);
    for (const name of ['area3-wing-bd', 'area3-penthouses', 'area3-link-bd']) {
      expect(hero.group.getObjectByName(name)?.userData.wingId, name).toBeUndefined();
    }
  });
});

describe('第1・第2・第4学舎と大学院学舎の棟（P0b）', () => {
  const byId = new Map(SENRIYAMA_WINGS.map((w) => [w.id, w]));
  const linkOf = (wingId: string) => SENRIYAMA_WING_BUILDINGS.find((l) => l.wingId === wingId);

  it('lists every 学舎 heading of KAN-CAN! as one wing (5 + 1 + 2 + 6 + 4 + 13 = 31)', () => {
    expect(SENRIYAMA_WINGS).toHaveLength(31);
    const count = (school: string) => SENRIYAMA_WINGS.filter((w) => w.school === school).length;
    expect([count('第1学舎'), count('岩崎記念館'), count('大学院学舎'), count('第2学舎'), count('第3学舎'), count('第4学舎')]).toEqual([
      5, 1, 2, 6, 4, 13,
    ]);
  });

  it('maps 第2学舎 1号館 to A・B, 3号館 to D・E and BIG ホールの 4号館 to F (docs/indoor-plan.md 5 節)', () => {
    expect(['area2-a', 'area2-b', 'area2-c', 'area2-d', 'area2-e', 'area2-f'].map((id) => linkOf(id)?.buildingId)).toEqual([
      'area2-1',
      'area2-1',
      'area2-2',
      'area2-3',
      'area2-3',
      'area2-bighall',
    ]);
    expect(byId.get('area2-f')?.hallName).toBe('4号館');
  });

  it('maps 第1学舎 A〜E to the 5 buildings and 第4学舎 実験棟 to their own OSM outlines', () => {
    expect(Object.values(AREA1_WING_IDS).map((id) => linkOf(id)?.buildingId)).toEqual([
      'area1-1',
      'area1-2',
      'area1-3',
      'area1-4',
      'area1-5',
    ]);
    for (let n = 1; n <= 6; n++) {
      const building = buildings.find((b) => b.id === linkOf(`area4-x${n}`)?.buildingId);
      expect(building?.name, `x${n}`).toBe(`第4学舎 第${n}実験棟`);
    }
  });

  it('maps 第4学舎 2号館 研究棟別館 to the separate outline in the courtyard of 2号館', () => {
    const area42 = buildings.find((b) => b.id === 'area4-2');
    const annex = buildings.find((b) => b.id === linkOf('area4-h2a')?.buildingId);
    if (!area42 || !annex) throw new Error('area4-2 or the annex outline missing');
    expect(annex.id).toBe('way_624663829');
    // 別館の輪郭の角はどれも 2号館の輪郭の外（中庭）で、2号館の外形の枠の中
    const xs = area42.polygon.map(([x]) => x);
    const zs = area42.polygon.map(([, z]) => z);
    for (const [x, z] of annex.polygon) {
      expect(pointInRing(x, z, area42.polygon), `${x},${z}`).toBe(false);
      expect(x > Math.min(...xs) && x < Math.max(...xs) && z > Math.min(...zs) && z < Math.max(...zs)).toBe(true);
    }
    // 2号館の教室棟と研究棟は 2号館の輪郭のまま
    expect(linkOf('area4-h2')?.buildingId).toBe('area4-2');
    expect(linkOf('area4-h2r')?.buildingId).toBe('area4-2');
  });

  it('draws no region outside 第3学舎, so only 第3学舎 gets pickable wings (the screen stays as it was)', () => {
    for (const link of SENRIYAMA_WING_BUILDINGS) {
      if (link.buildingId !== 'area3') expect(link.region, link.wingId).toBeUndefined();
    }
    for (const w of SENRIYAMA_WINGS) {
      if (!w.id.startsWith('area3-')) expect(w.floorHeightM, w.id).toBeUndefined();
      expect(w.floorsAbove, w.id).toBeGreaterThan(0);
      expect(w.floorsBelow, w.id).toBeGreaterThanOrEqual(0);
    }
  });
});
