import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sampleElevation } from '../../domain/projection';
import type { BuildingFeature, TerrainGrid } from '../../domain/types';
import { RIMPUKAN_DECK_M, RIMPUKAN_GROUND_REF, buildRimpukan } from './rimpukan';

const RIMPUKAN_POLYGON: [number, number][] = [
  [99, 24],
  [99, 16],
  [101, 9],
  [108, -8],
  [124, -37],
  [152, -12],
  [154, -14],
  [166, -24],
  [169, -20],
  [191, -45],
  [200, -35],
  [167, -6],
  [142, 15],
  [117, 28],
  [110, 30],
  [105, 31],
  [100, 28],
];

function createRimpukanFeature(): BuildingFeature {
  return {
    id: 'rimpukan',
    name: '凜風館（総合学生会館）',
    shortName: '凜風館',
    kana: 'りんぷうかん',
    englishName: 'Rimpukan',
    category: 'shared',
    inCampus: true,
    faculties: [],
    facilityTags: ['cafeteria', 'study'],
    keywords: [],
    description: '',
    sculptStyle: 'rimpukan-green-roof',
    labelPriority: 10,
    polygon: RIMPUKAN_POLYGON,
    centroid: { x: 135.6, z: -1.2 },
    groundY: 40.88,
    minGroundY: 40.75,
    maxGroundY: 41.95,
    height: 16.6,
    levels: 4,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

/** InstancedMesh の各インスタンスの、底面が y = 0 の単位箱（x・z は ±0.5、y は 0〜1）の 8 隅をワールド座標で返す */
function stepCorners(mesh: THREE.InstancedMesh): THREE.Vector3[][] {
  const out: THREE.Vector3[][] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    m.premultiply(mesh.matrixWorld);
    const corners: THREE.Vector3[] = [];
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [0, 1]) {
        for (const sz of [-0.5, 0.5]) {
          corners.push(new THREE.Vector3(sx, sy, sz).applyMatrix4(m));
        }
      }
    }
    out.push(corners);
  }
  return out;
}

describe('buildRimpukan', () => {
  const groundVisualY = 12.5;
  const result = buildRimpukan({
    building: createRimpukanFeature(),
    groundVisualY,
    sampleGroundVisualY: () => groundVisualY,
  });

  it('produces at least one mesh and stays well within the mesh budget', () => {
    const meshes: THREE.Mesh[] = [];
    result.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshes.push(obj);
      }
    });

    expect(meshes.length).toBeGreaterThanOrEqual(1);
    expect(meshes.length).toBeLessThanOrEqual(150);
  });

  it('has strictly finite vertex coordinates and instance matrices', () => {
    let checkedVertices = 0;

    result.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const pos = obj.geometry.getAttribute('position');
      expect(pos).toBeDefined();
      if (!pos) return;
      expect(pos.count).toBeGreaterThan(0);

      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i))).toBe(true);
        expect(Number.isFinite(pos.getY(i))).toBe(true);
        expect(Number.isFinite(pos.getZ(i))).toBe(true);
        checkedVertices++;
      }

      if (obj instanceof THREE.InstancedMesh) {
        const arr = obj.instanceMatrix.array;
        for (let i = 0; i < arr.length; i++) {
          expect(Number.isFinite(arr[i])).toBe(true);
        }
      }
    });

    expect(checkedVertices).toBeGreaterThan(0);
  });

  it('fits within the expected bounding box around Rimpukan', () => {
    result.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(result.group);

    expect(box.isEmpty()).toBe(false);
    expect(Number.isFinite(box.min.x)).toBe(true);
    expect(Number.isFinite(box.max.x)).toBe(true);
    expect(Number.isFinite(box.min.y)).toBe(true);
    expect(Number.isFinite(box.max.y)).toBe(true);
    expect(Number.isFinite(box.min.z)).toBe(true);
    expect(Number.isFinite(box.max.z)).toBe(true);

    expect(box.min.x).toBeGreaterThanOrEqual(85);
    expect(box.max.x).toBeLessThanOrEqual(205);
    expect(box.min.z).toBeGreaterThanOrEqual(-50);
    expect(box.max.z).toBeLessThanOrEqual(45);
    // 平らな地面では、1 階・柱・大階段の底は地面より 0.5m 下
    expect(box.min.y).toBeCloseTo(groundVisualY - 0.5, 5);
    expect(box.max.y).toBeLessThanOrEqual(groundVisualY + 24);
  });

  it('exposes exterior wall and 1F glass as primaryMaterials with no animated objects', () => {
    expect(result.primaryMaterials.length).toBeGreaterThanOrEqual(1);
    expect(result.primaryMaterials).toHaveLength(2);
    expect(result.primaryMaterials.map((m) => m.baseHex)).toEqual(['#8A5641', '#4F6670']);
    for (const entry of result.primaryMaterials) {
      expect(entry.mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    }
    expect(result.animated).toEqual([]);
  });

  it('populates instanced sakura orchard, columns, steps, and west roof poles', () => {
    const crowns = result.group.getObjectByName('rimpukan-sakura-crowns');
    const trunks = result.group.getObjectByName('rimpukan-sakura-trunks');
    const squareCols = result.group.getObjectByName('rimpukan-columns-square');
    const roundCols = result.group.getObjectByName('rimpukan-columns-round');
    const steps = result.group.getObjectByName('rimpukan-stairs-steps');
    const poles = result.group.getObjectByName('rimpukan-roof-poles');

    expect(crowns).toBeInstanceOf(THREE.InstancedMesh);
    expect(trunks).toBeInstanceOf(THREE.InstancedMesh);
    expect(squareCols).toBeInstanceOf(THREE.InstancedMesh);
    expect(roundCols).toBeInstanceOf(THREE.InstancedMesh);
    expect(steps).toBeInstanceOf(THREE.InstancedMesh);
    expect(poles).toBeInstanceOf(THREE.InstancedMesh);

    if (crowns instanceof THREE.InstancedMesh && trunks instanceof THREE.InstancedMesh) {
      expect(crowns.count).toBeGreaterThanOrEqual(60);
      expect(crowns.count).toBeLessThanOrEqual(120);
      expect(trunks.count).toBe(crowns.count);
    }
    if (squareCols instanceof THREE.InstancedMesh) {
      expect(squareCols.count).toBeGreaterThan(15);
    }
    if (roundCols instanceof THREE.InstancedMesh) {
      expect(roundCols.count).toBeGreaterThanOrEqual(1);
      expect(roundCols.count).toBeLessThanOrEqual(2);
    }
    if (steps instanceof THREE.InstancedMesh) {
      // 2 階の床（4.2m）を 0.2m 以下の段に割る: 21 段の高さ → 踏み面 20
      expect(steps.count).toBe(20);
    }
    if (poles instanceof THREE.InstancedMesh) {
      expect(poles.count).toBe(6);
    }
  });

  it('runs the grand staircase toward the Y-junction, along the OSM steps way 490803027', () => {
    result.group.updateMatrixWorld(true);
    const steps = result.group.getObjectByName('rimpukan-stairs-steps');
    if (!(steps instanceof THREE.InstancedMesh)) throw new Error('steps missing');
    const corners = stepCorners(steps);
    const tops = corners.map((c) => Math.max(...c.map((p) => p.y)));
    const top = corners[tops.indexOf(Math.max(...tops))];
    const foot = corners[tops.indexOf(Math.min(...tops))];
    if (!top || !foot) throw new Error('steps empty');
    const centerXZ = (c: THREE.Vector3[]): [number, number] => [
      c.reduce((s, p) => s + p.x, 0) / c.length,
      c.reduce((s, p) => s + p.z, 0) / c.length,
    ];
    const [tx, tz] = centerXZ(top);
    const [fx, fz] = centerXZ(foot);
    const len = Math.hypot(fx - tx, fz - tz);
    // 上の段から下の段へ向かう向きは、OSM の階段の道の上端 (99.9, 28.3) → 下端 (94.7, 33.7)
    // ＝ Y 字路 (85.3, 45.0) の方（南西寄り、およそ (-0.69, 0.72)）
    const dx = 94.7 - 99.9;
    const dz = 33.7 - 28.3;
    const dlen = Math.hypot(dx, dz);
    expect((fx - tx) / len).toBeCloseTo(dx / dlen, 1);
    expect((fz - tz) / len).toBeCloseTo(dz / dlen, 1);
    // 下端の段の中央は OSM の階段の下端の近く
    expect(Math.hypot(fx - 94.7, fz - 33.7)).toBeLessThan(1.0);
  });

  describe('on ground that rises to the east', () => {
    const ground = (x: number, z: number): number => groundVisualY + 0.08 * (x - 99) + 0.02 * z;
    const sloped = buildRimpukan({
      building: createRimpukanFeature(),
      groundVisualY,
      sampleGroundVisualY: ground,
    });
    sloped.group.updateMatrixWorld(true);

    it('starts the lowest step on the ground and buries every step bottom', () => {
      const steps = sloped.group.getObjectByName('rimpukan-stairs-steps');
      if (!(steps instanceof THREE.InstancedMesh)) throw new Error('steps missing');
      const corners = stepCorners(steps);
      const tops = corners.map((c) => Math.max(...c.map((p) => p.y)));
      for (const c of corners) {
        const bottom = Math.min(...c.map((p) => p.y));
        for (const p of c) {
          expect(bottom).toBeLessThan(ground(p.x, p.z));
        }
      }
      const foot = corners[tops.indexOf(Math.min(...tops))];
      if (!foot) throw new Error('steps empty');
      const footTop = Math.max(...foot.map((p) => p.y));
      const minGroundUnderFoot = Math.min(...foot.map((p) => ground(p.x, p.z)));
      expect(footTop - minGroundUnderFoot).toBeGreaterThan(0);
      expect(footTop - minGroundUnderFoot).toBeLessThanOrEqual(0.201);
    });

    it('drops the 1F glass and columns below the lowest ground under the outline', () => {
      let lowest = Infinity;
      for (const [x, z] of RIMPUKAN_POLYGON) lowest = Math.min(lowest, ground(x, z));
      for (const name of ['rimpukan-floor1-glass', 'rimpukan-columns-square']) {
        const obj = sloped.group.getObjectByName(name);
        if (!obj) throw new Error(`${name} missing`);
        expect(new THREE.Box3().setFromObject(obj).min.y).toBeLessThanOrEqual(lowest - 0.5 + 1e-6);
      }
    });
  });
});

/** メッシュの頂点をワールド座標で集める */
function worldVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const pos = mesh.geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    out.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld));
  }
  return out;
}

/** 点から輪郭の辺までのいちばん近い距離 */
function distToOutline(x: number, z: number, poly: readonly [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
  }
  return best;
}

function insidePolygon(x: number, z: number, poly: readonly [number, number][]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}

describe('buildRimpukan: the upper floors (owner 2026-11-20 and the 2017 aerial photo)', () => {
  const groundVisualY = 12.5;
  const result = buildRimpukan({
    building: createRimpukanFeature(),
    groundVisualY,
    sampleGroundVisualY: () => groundVisualY,
  });
  result.group.updateMatrixWorld(true);
  const mesh = (name: string): THREE.Mesh => {
    const obj = result.group.getObjectByName(name);
    if (!(obj instanceof THREE.Mesh)) throw new Error(`${name} missing`);
    return obj;
  };
  const deckY = groundVisualY + RIMPUKAN_DECK_M;
  const roofY = groundVisualY + 16.6;

  it('tops the brown 2nd-3rd floor walls at the 3rd-floor roof (12.4m) and the roof garden at 16.6m', () => {
    expect(RIMPUKAN_DECK_M).toBeCloseTo(12.4, 6);
    const walls = worldVertices(mesh('rimpukan-body-walls')).map((p) => p.y);
    expect(Math.max(...walls)).toBeCloseTo(deckY, 5);
    for (const p of worldVertices(mesh('rimpukan-terrace-floor'))) expect(p.y).toBeCloseTo(deckY, 5);
    for (const p of worldVertices(mesh('rimpukan-roof-soil'))) expect(p.y).toBeCloseTo(roofY, 5);
  });

  it('runs the solar fence along the outline on the 3rd-floor roof, open where the back stairs arrive', () => {
    const fence = worldVertices(mesh('rimpukan-solar-fence'));
    expect(fence.length).toBeGreaterThan(0);
    for (const p of fence) {
      expect(p.y).toBeGreaterThanOrEqual(deckY - 1e-6);
      expect(p.y).toBeLessThanOrEqual(deckY + 1.5 + 1e-6);
      // 柵の内の面は輪郭から 0.15m（角の留めで最大 0.33m）内側
      expect(distToOutline(p.x, p.z, RIMPUKAN_POLYGON)).toBeLessThan(0.5);
    }
    // 大階段の上端が着く口（輪郭の切り欠き〜北東の棟の北西の面の途中）と、デッキのまわりには太陽光パネルが無い
    for (const [x, z] of [
      [153.3, -13.1],
      [156.7, -16.1],
      [180.0, -32.0],
      [160.0, 0.0],
    ] as const) {
      const near = fence.filter((p) => Math.hypot(p.x - x, p.z - z) < 0.8);
      expect(near).toHaveLength(0);
    }
    // 西の長い辺（輪郭の (101, 9) → (108, −8)）の両端に太陽光パネルの柵の角がある
    for (const [x, z] of [
      [101, 9],
      [108, -8],
    ] as const) {
      expect(fence.some((p) => Math.hypot(p.x - x, p.z - z) < 0.5)).toBe(true);
    }
  });

  it('sets the 4th floor and the roof garden back from the 1st-3rd floor outline (one size smaller)', () => {
    const upper = worldVertices(mesh('rimpukan-upper-walls'));
    for (const p of upper) {
      expect(insidePolygon(p.x, p.z, RIMPUKAN_POLYGON)).toBe(true);
      expect(p.y).toBeGreaterThanOrEqual(deckY - 1e-6);
      expect(p.y).toBeLessThanOrEqual(roofY + 1e-6);
    }
    // 西の長い辺（輪郭の (101, 9) → (108, −8) の中ほど）からは 6m 以上奥
    const westMid: [number, number] = [104.5, 0.5];
    const nearestWest = Math.min(...upper.map((p) => Math.hypot(p.x - westMid[0], p.z - westMid[1])));
    expect(nearestWest).toBeGreaterThan(6);
    // 北東の棟（輪郭の (169, −20)〜(200, −35)）の上には 4 階が無い
    expect(upper.every((p) => p.x < 150)).toBe(true);
  });

  it('plants the roof garden on the 4th-floor roof and a row of cherry trees on the west terrace', () => {
    const trunks = result.group.getObjectByName('rimpukan-sakura-trunks');
    if (!(trunks instanceof THREE.InstancedMesh)) throw new Error('trunks missing');
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let garden = 0;
    let terrace = 0;
    for (let i = 0; i < trunks.count; i++) {
      trunks.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      if (Math.abs(p.y - roofY) < 1e-6) garden++;
      else if (Math.abs(p.y - deckY) < 1e-6) {
        terrace++;
        // テラスの列は西の側（4 階より西、輪郭の中）
        expect(p.x).toBeLessThan(126);
        expect(insidePolygon(p.x, p.z, RIMPUKAN_POLYGON)).toBe(true);
      } else throw new Error(`tree at an unexpected height ${p.y}`);
    }
    expect(garden).toBeGreaterThanOrEqual(45);
    expect(terrace).toBeGreaterThanOrEqual(8);
    expect(terrace).toBeLessThanOrEqual(20);
  });

  it('climbs from the deck to the roof garden by the stairs along the south-east edge (OSM steps way 423060533)', () => {
    const stairs = worldVertices(mesh('rimpukan-upper-stair'));
    const ys = stairs.map((v) => v.y);
    expect(Math.min(...ys)).toBeCloseTo(deckY, 5);
    expect(Math.max(...ys)).toBeCloseTo(roofY, 5);
    // 南東の辺（(167.36, −5.88) → (142.34, 14.74)）から内へ 1〜13m の帯で、辺の上の距離 16〜29m
    const ax = 167.36;
    const az = -5.88;
    const len = Math.hypot(142.34 - ax, 14.74 - az);
    const ux = (142.34 - ax) / len;
    const uz = (14.74 - az) / len;
    for (const v of stairs) {
      const s2 = (v.x - ax) * ux + (v.z - az) * uz;
      const t = (v.x - ax) * -uz + (v.z - az) * ux;
      expect(s2).toBeGreaterThan(16);
      expect(s2).toBeLessThan(29);
      expect(t).toBeGreaterThan(0.9);
      expect(t).toBeLessThan(13);
    }
  });

  it('lays the timber deck at the top of the back stairs, just above the 3rd-floor roof', () => {
    const deck = worldVertices(mesh('rimpukan-deck'));
    for (const v of deck) expect(v.y).toBeCloseTo(deckY + 0.03, 5);
    const xs = deck.map((v) => v.x);
    const zs = deck.map((v) => v.z);
    // 大階段の上端（(154.06, −13.7)）の南東
    expect(Math.min(...xs)).toBeLessThan(154);
    expect(Math.max(...xs)).toBeGreaterThan(160);
    expect(Math.min(...zs)).toBeLessThan(-14);
  });
});

describe('RIMPUKAN_GROUND_REF (public/data/senriyama の実データ)', () => {
  const dataDir = path.resolve(process.cwd(), 'public/data/senriyama');
  const terrain = JSON.parse(fs.readFileSync(path.join(dataDir, 'terrain.json'), 'utf8')) as TerrainGrid;
  const buildings = JSON.parse(fs.readFileSync(path.join(dataDir, 'buildings.json'), 'utf8')) as BuildingFeature[];

  it('is the centroid of Rimpukan, where the data build samples groundY', () => {
    const b = buildings.find((x) => x.id === 'rimpukan');
    if (!b) throw new Error('rimpukan missing');
    expect(Math.hypot(b.centroid.x - RIMPUKAN_GROUND_REF[0], b.centroid.z - RIMPUKAN_GROUND_REF[1])).toBeLessThan(0.05);
    expect(Math.abs(sampleElevation(terrain, RIMPUKAN_GROUND_REF[0], RIMPUKAN_GROUND_REF[1]) - b.groundY)).toBeLessThan(0.01);
  });
});
