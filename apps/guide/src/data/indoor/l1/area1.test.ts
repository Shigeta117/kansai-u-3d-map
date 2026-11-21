import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AREA1_WING_IDS, SENRIYAMA_WING_BUILDINGS, tierOf, type BuildingFeature } from '@kansai-u-3d/core';
import { AREA1_L1, AREA1_L1_POINTS, AREA1_L1_TIERS, AREA1_L1_WING_ORDER } from './area1';

const buildings = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'public/data/senriyama/buildings.json'), 'utf8'),
) as BuildingFeature[];
const { a: A, b: B, c: C, d: D, e: E } = AREA1_WING_IDS;

function distanceToRing(ring: readonly [number, number][], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    if (!p || !q) continue;
    const dx = q[0] - p[0];
    const dz = q[1] - p[1];
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(p[0] + t * dx - x, p[1] + t * dz - z));
  }
  return best;
}

describe('第1学舎の L1 のグラフ（P1 の試し）', () => {
  it('has the 5 wings in the screen order with their floors and elevator marks', () => {
    expect(AREA1_L1.wings.map((w) => w.wingId)).toEqual([B, C, A, E, D]);
    expect(AREA1_L1.wings.map((w) => w.floors.length)).toEqual([3, 5, 6, 6, 4]);
    // B棟はエレベーターの印が無い（無いとは書かれていない）
    expect(AREA1_L1.wings.map((w) => w.elevator)).toEqual(['unknown', 'yes', 'yes', 'yes', 'yes']);
    expect(AREA1_L1.elevators.every((g) => g.stops === null)).toBe(true);
    expect(AREA1_L1.elevators).toHaveLength(4);
  });

  it('makes 12 entrance nodes and 18 connector mouths, all with unknown zones', () => {
    expect(AREA1_L1.nodes.filter((n) => n.kind === 'entrance')).toHaveLength(12);
    expect(AREA1_L1.nodes.filter((n) => n.kind === 'connector-mouth')).toHaveLength(18);
    expect(AREA1_L1.edges).toHaveLength(9);
    expect(AREA1_L1.nodes.every((n) => n.zone === null)).toBe(true);
    // 段差なしで入れるのは A棟の西の自動扉と、B–C の C棟側の口だけ
    expect(AREA1_L1.nodes.filter((n) => n.stepFree === 'yes').map((n) => n.id)).toEqual(['bf-1-3', 'bf-area1-bc-2f@area1-c']);
    expect(AREA1_L1.edges.filter((e) => e.stepFree === 'no').map((e) => e.id)).toEqual(['bf-area1-ad-1f', 'bf-area1-de']);
  });

  it('places every node on the OSM outline of its wing building', () => {
    const buildingOf = new Map(SENRIYAMA_WING_BUILDINGS.map((l) => [l.wingId, l.buildingId]));
    for (const node of AREA1_L1.nodes) {
      expect(node.point, node.id).not.toBeNull();
      const building = buildings.find((b) => b.id === buildingOf.get(node.wingId));
      expect(building, node.id).toBeDefined();
      if (!building || !node.point) continue;
      expect(distanceToRing(building.polygon, node.point.x, node.point.z), node.id).toBeLessThan(0.1);
    }
    // 点の表に、使われない点は無い
    const used = new Set(AREA1_L1.nodes.map((n) => n.id));
    for (const id of Object.keys(AREA1_L1_POINTS)) expect(used.has(id), id).toBe(true);
  });

  it('aligns the floors by the corridors: A 2 = D 3 = E 2, D 2 = E 1, and slants A 1 – D 1 (stairs on the way)', () => {
    expect(AREA1_L1_TIERS.conflicts).toEqual([]);
    expect(AREA1_L1_TIERS.slanted).toEqual(['bf-area1-ad-1f']);
    expect(AREA1_L1_TIERS.components).toEqual([
      [B, C],
      [A, E, D],
    ]);
    const t = (wing: string, floor: number) => tierOf(AREA1_L1_TIERS, wing, floor);
    expect([t(A, 2), t(D, 3), t(E, 2)]).toEqual([2, 2, 2]);
    expect([t(D, 2), t(E, 1), t(A, 1)]).toEqual([1, 1, 1]);
    expect(t(D, 1)).toBe(0);
    expect(t(B, 2)).toBe(t(C, 2));
    expect(AREA1_L1_WING_ORDER).toHaveLength(5);
  });
});
