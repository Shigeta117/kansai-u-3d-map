import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildRimpukan } from './rimpukan';

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

  it('runs the grand staircase west-northwest, square to the main street, from the x≈99 edge', () => {
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
    // 上の段から下の段へ向かう向きが (-0.98, -0.19)（道の向き (-0.19, 0.98) に直角）
    expect((fx - tx) / len).toBeCloseTo(-0.98, 1);
    expect((fz - tz) / len).toBeCloseTo(-0.19, 1);
    // 下端の段は、ドラムの先端の辺 (99, 16)-(99, 24) の中央 (99, 20) から約 6.3m 先（道の東の縁）にある
    const dirLen = Math.hypot(0.98, 0.19);
    const footFrontX = 99 + (-0.98 / dirLen) * 6.3;
    const footFrontZ = 20 + (-0.19 / dirLen) * 6.3;
    const footFrontDist = Math.min(
      ...foot.map((p) => Math.hypot(p.x - footFrontX, p.z - footFrontZ)),
    );
    expect(footFrontDist).toBeLessThan(9.2); // 段の隅（横 8.2m）までの距離
    expect(Math.hypot(fx - footFrontX, fz - footFrontZ)).toBeLessThan(0.5);
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
