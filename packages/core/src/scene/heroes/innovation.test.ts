import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildInnovation } from './innovation';

/** buildings.json の innovation（way_423067256）の輪郭 */
const INNOVATION_POLYGON: [number, number][] = [
  [-0.1, 36.58],
  [4.96, 39.33],
  [2.89, 43.08],
  [32.92, 59.47],
  [28.86, 66.86],
  [33.54, 69.42],
  [39.65, 58.31],
  [45.78, 61.66],
  [47.51, 58.52],
  [49.5, 54.9],
  [44.05, 51.93],
  [47.09, 46.4],
  [12.69, 27.59],
  [9.62, 32.94],
  [3.61, 29.81],
];

function createInnovationBuilding(): BuildingFeature {
  return {
    id: 'innovation',
    name: 'イノベーション創生センター',
    shortName: 'イノベーション創生',
    kana: 'いのべーしょんそうせいせんたー',
    englishName: 'Kansai University Innovation Center',
    category: 'shared',
    inCampus: true,
    faculties: [],
    facilityTags: ['study'],
    keywords: [],
    description: '',
    sculptStyle: 'standard',
    labelPriority: 7,
    polygon: INNOVATION_POLYGON.map(([x, z]) => [x, z]),
    centroid: { x: 26.84, z: 49.12 },
    groundY: 44.19,
    minGroundY: 41.81,
    maxGroundY: 44.97,
    height: 12.8,
    levels: 3,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

/** 北東の長い辺に沿う u 軸（東南東）と、それに直交する v 軸（南南西） */
const AXIS_U = new THREE.Vector2(0.87742, 0.47977);
const AXIS_V = new THREE.Vector2(-0.47977, 0.87742);
const toU = (p: THREE.Vector3): number => p.x * AXIS_U.x + p.z * AXIS_U.y;
const toV = (p: THREE.Vector3): number => p.x * AXIS_V.x + p.z * AXIS_V.y;

/** メッシュの頂点（ワールド座標）の v のいちばん小さい値（いちばん北東） */
function minVertexV(obj: THREE.Object3D): number {
  if (!(obj instanceof THREE.Mesh)) throw new Error(`${obj.name} is not a mesh`);
  obj.updateWorldMatrix(true, false);
  const pos = obj.geometry.getAttribute('position');
  const p = new THREE.Vector3();
  let min = Infinity;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
    min = Math.min(min, toV(p));
  }
  return min;
}

function worldBox(obj: THREE.Object3D): THREE.Box3 {
  obj.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(obj);
}

/** InstancedMesh の各インスタンスの単位箱（±0.5）の中心と 8 隅をワールド座標で返す */
function instances(mesh: THREE.InstancedMesh): { center: THREE.Vector3; corners: THREE.Vector3[] }[] {
  const out: { center: THREE.Vector3; corners: THREE.Vector3[] }[] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    m.premultiply(mesh.matrixWorld);
    const corners: THREE.Vector3[] = [];
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [-0.5, 0.5]) {
        for (const sz of [-0.5, 0.5]) corners.push(new THREE.Vector3(sx, sy, sz).applyMatrix4(m));
      }
    }
    out.push({ center: new THREE.Vector3().applyMatrix4(m), corners });
  }
  return out;
}

describe('buildInnovation', () => {
  const groundVisualY = 40.6;
  const result = buildInnovation({
    building: createInnovationBuilding(),
    groundVisualY,
    sampleGroundVisualY: () => groundVisualY,
  });
  result.group.updateMatrixWorld(true);

  it('has meshes within the 120-mesh budget', () => {
    let count = 0;
    result.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) count++;
    });
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(120);
  });

  it('has finite vertices and instance matrices', () => {
    let checked = 0;
    result.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const pos = obj.geometry.getAttribute('position');
      expect(pos.count).toBeGreaterThan(0);
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i))).toBe(true);
        expect(Number.isFinite(pos.getY(i))).toBe(true);
        expect(Number.isFinite(pos.getZ(i))).toBe(true);
        checked++;
      }
      if (obj instanceof THREE.InstancedMesh) {
        for (const v of obj.instanceMatrix.array) expect(Number.isFinite(v)).toBe(true);
      }
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('stays around the outline, sits 0.5m into flat ground, and stays under ground + 60m', () => {
    const xs = INNOVATION_POLYGON.map(([x]) => x);
    const zs = INNOVATION_POLYGON.map(([, z]) => z);
    const box = worldBox(result.group);
    expect(box.isEmpty()).toBe(false);
    expect(box.min.x).toBeGreaterThanOrEqual(Math.min(...xs) - 20);
    expect(box.max.x).toBeLessThanOrEqual(Math.max(...xs) + 20);
    expect(box.min.z).toBeGreaterThanOrEqual(Math.min(...zs) - 20);
    expect(box.max.z).toBeLessThanOrEqual(Math.max(...zs) + 20);
    expect(box.min.y).toBeCloseTo(groundVisualY - 0.5, 5);
    expect(box.max.y).toBeLessThanOrEqual(groundVisualY + 60);
  });

  it('exposes the metal panel, the glass louvers and the glass box as primaryMaterials', () => {
    expect(result.primaryMaterials).toHaveLength(3);
    expect(result.primaryMaterials.map((m) => m.baseHex)).toEqual(['#868B90', '#6FAEA0', '#AFC6C6']);
    for (const entry of result.primaryMaterials) {
      expect(entry.mat).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(entry.mat.metalness).toBeLessThanOrEqual(0.3);
    }
    expect(result.animated).toEqual([]);
  });

  it('puts the glass box at the south-east end, set back from the north-east front, and the panel block next to it', () => {
    const glass = result.group.getObjectByName('innovation-glass-box');
    const panel = result.group.getObjectByName('innovation-panel-block');
    const long = result.group.getObjectByName('innovation-long-upper');
    if (!glass || !panel || !long) throw new Error('parts missing');
    const center = (o: THREE.Object3D): THREE.Vector3 => worldBox(o).getCenter(new THREE.Vector3());
    // 南東（+u）へ: 長い棟 → 金属パネル → ガラスの箱
    expect(toU(center(long))).toBeLessThan(toU(center(panel)));
    expect(toU(center(panel))).toBeLessThan(toU(center(glass)));
    // ガラスの箱の北東の面は、長い棟の正面（-v、北東）から 6m ほど下がる（輪郭の点 11→10）
    expect(minVertexV(glass)).toBeGreaterThan(minVertexV(long) + 5);
  });

  it('lines the north-east front with slanted glass louvers on 3 upper floors and chevron braces on the ground floor', () => {
    const louvers = result.group.getObjectByName('innovation-louvers');
    const braces = result.group.getObjectByName('innovation-braces');
    const long = result.group.getObjectByName('innovation-long-upper');
    if (!(louvers instanceof THREE.InstancedMesh) || !(braces instanceof THREE.InstancedMesh) || !long) {
      throw new Error('louvers missing');
    }
    expect(louvers.count % 3).toBe(0);
    expect(louvers.count).toBeGreaterThanOrEqual(60);
    // 7 本の柱と 6 区画 × 2 本の筋交い
    expect(braces.count).toBe(7 + 12);
    const frontV = Math.min(...instances(louvers).flatMap((i) => i.corners.map(toV)));
    const longFrontV = minVertexV(long);
    // ルーバーは正面より外（北東）
    expect(frontV).toBeLessThan(longFrontV);
  });

  describe('on ground that falls to the south-east', () => {
    // 南東（+u）へ 1m あたり 0.1 下がる（北西の端の歩道の入口付近で groundVisualY）
    const ground = (x: number, z: number): number => groundVisualY - 0.1 * (x * AXIS_U.x + z * AXIS_U.y - 23);
    const sloped = buildInnovation({
      building: createInnovationBuilding(),
      groundVisualY,
      sampleGroundVisualY: ground,
    });
    sloped.group.updateMatrixWorld(true);

    it('buries the plinth 0.5m below the lowest ground under the outline', () => {
      let lowest = Infinity;
      for (const [x, z] of INNOVATION_POLYGON) lowest = Math.min(lowest, ground(x, z));
      const plinth = sloped.group.getObjectByName('innovation-plinth');
      if (!plinth) throw new Error('plinth missing');
      expect(worldBox(plinth).min.y).toBeLessThanOrEqual(lowest - 0.5 + 1e-6);
    });

    it('runs the outside stair up toward the north-west, from the ground to the ground floor', () => {
      const steps = sloped.group.getObjectByName('innovation-stair-steps');
      const landing = sloped.group.getObjectByName('innovation-stair-landing');
      if (!(steps instanceof THREE.InstancedMesh) || !landing) throw new Error('stair missing');
      const list = instances(steps);
      const tops = list.map((s) => Math.max(...s.corners.map((p) => p.y)));
      const hi = list[tops.indexOf(Math.max(...tops))];
      const lo = list[tops.indexOf(Math.min(...tops))];
      if (!hi || !lo) throw new Error('steps empty');
      // 上の段ほど北西（-u）
      expect(toU(hi.center)).toBeLessThan(toU(lo.center));
      // 下の段は地面から 1 段分（0.2m 以下）だけ上
      const loTop = Math.max(...lo.corners.map((p) => p.y));
      const groundUnderLo = Math.min(...lo.corners.map((p) => ground(p.x, p.z)));
      expect(loTop - groundUnderLo).toBeGreaterThan(0);
      expect(loTop - groundUnderLo).toBeLessThanOrEqual(0.25);
      // 段の底はすべて地面の下
      for (const s of list) {
        const bottom = Math.min(...s.corners.map((p) => p.y));
        for (const p of s.corners) expect(bottom).toBeLessThan(ground(p.x, p.z));
      }
      // 踊り場の上面＝1 階の床（基壇の上面）
      const plinth = sloped.group.getObjectByName('innovation-plinth');
      if (!plinth) throw new Error('plinth missing');
      expect(worldBox(landing).max.y).toBeCloseTo(worldBox(plinth).max.y, 5);
    });
  });
});
