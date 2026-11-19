import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildLibrary } from './library';

/** 1 段構えになる段の数の上限（段が 8 つ以下 → 踏み面は 7 つ以下） */
const SINGLE_FLIGHT_STEP_LIMIT = 7;

const LIBRARY_POLYGON: [number, number][] = [
  [-77, 72],
  [-75, 68],
  [-83, 64],
  [-56, 13],
  [-47, 17],
  [-45, 13],
  [-3, 36],
  [3, 40],
  [1, 43],
  [30, 58],
  [-19, 105],
  [-31, 98],
  [-30, 96],
  [-49, 86],
  [-64, 78],
  [-65, 79],
];

/** どこでも同じ高さの地面 */
function flatGround(y: number): (x: number, z: number) => number {
  return () => y;
}

/** 南（+Z、正面の道の側）へ 1m あたり slope だけ下る斜面。z = 60（重心付近）で groundVisualY */
function slopedGround(groundVisualY: number, slope: number): (x: number, z: number) => number {
  return (_x, z) => groundVisualY - slope * (z - 60);
}

/** InstancedMesh の各インスタンスの単位箱（±0.5）の 8 隅をワールド座標で返す */
function instanceCorners(mesh: THREE.InstancedMesh): THREE.Vector3[][] {
  const out: THREE.Vector3[][] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    m.premultiply(mesh.matrixWorld);
    const corners: THREE.Vector3[] = [];
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [-0.5, 0.5]) {
        for (const sz of [-0.5, 0.5]) {
          corners.push(new THREE.Vector3(sx, sy, sz).applyMatrix4(m));
        }
      }
    }
    out.push(corners);
  }
  return out;
}

function createLibraryBuilding(): BuildingFeature {
  return {
    id: 'library',
    name: '総合図書館',
    shortName: '総合図書館',
    kana: 'そうごうとしょかん',
    englishName: 'Kansai University General Library',
    category: 'heritage',
    inCampus: true,
    faculties: [],
    facilityTags: ['library'],
    keywords: [],
    description: '',
    sculptStyle: 'library-brick-canopy',
    labelPriority: 1,
    polygon: LIBRARY_POLYGON.map(([x, z]) => [x, z]),
    centroid: { x: -38.1, z: 60.4 },
    groundY: 45.55,
    minGroundY: 43.73,
    maxGroundY: 45.55,
    height: 9,
    levels: 2,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

describe('buildLibrary', () => {
  it('builds meshes within budget with primaryMaterials and empty animated list', () => {
    const result = buildLibrary({
      building: createLibraryBuilding(),
      groundVisualY: 25,
      sampleGroundVisualY: flatGround(25),
    });

    const meshes: THREE.Mesh[] = [];
    result.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshes.push(obj);
      }
    });

    expect(meshes.length).toBeGreaterThanOrEqual(1);
    expect(meshes.length).toBeLessThanOrEqual(150);

    expect(result.primaryMaterials.length).toBeGreaterThanOrEqual(1);
    expect(result.primaryMaterials).toHaveLength(2);
    expect(result.primaryMaterials.map((entry) => entry.baseHex)).toEqual([
      '#A8634A',
      '#4E6570',
    ]);
    for (const entry of result.primaryMaterials) {
      expect(entry.mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    }

    expect(result.animated).toEqual([]);
  });

  it('produces only finite vertex coordinates, normals, and instance matrices', () => {
    const result = buildLibrary({
      building: createLibraryBuilding(),
      groundVisualY: 25,
      sampleGroundVisualY: flatGround(25),
    });

    let totalVertices = 0;
    const instanceMat = new THREE.Matrix4();

    result.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;

      const posAttr = obj.geometry.getAttribute('position');
      expect(posAttr).toBeDefined();
      if (!posAttr) return;

      expect(posAttr.count).toBeGreaterThan(0);
      totalVertices += posAttr.count;
      for (let i = 0; i < posAttr.count; i++) {
        expect(Number.isFinite(posAttr.getX(i))).toBe(true);
        expect(Number.isFinite(posAttr.getY(i))).toBe(true);
        expect(Number.isFinite(posAttr.getZ(i))).toBe(true);
      }

      const normAttr = obj.geometry.getAttribute('normal');
      if (normAttr) {
        for (let i = 0; i < normAttr.count; i++) {
          expect(Number.isFinite(normAttr.getX(i))).toBe(true);
          expect(Number.isFinite(normAttr.getY(i))).toBe(true);
          expect(Number.isFinite(normAttr.getZ(i))).toBe(true);
        }
      }

      if (obj instanceof THREE.InstancedMesh) {
        expect(obj.count).toBeGreaterThan(0);
        for (let i = 0; i < obj.count; i++) {
          obj.getMatrixAt(i, instanceMat);
          for (const v of instanceMat.elements) {
            expect(Number.isFinite(v)).toBe(true);
          }
        }
      }
    });

    expect(totalVertices).toBeGreaterThan(0);
  });

  it.each([0, 25])(
    'fits within the expected bounding box for groundVisualY = %d',
    (groundVisualY) => {
      const result = buildLibrary({
        building: createLibraryBuilding(),
        groundVisualY,
        sampleGroundVisualY: flatGround(groundVisualY),
      });

      result.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(result.group);

      expect(box.isEmpty()).toBe(false);
      expect(box.min.x).toBeGreaterThanOrEqual(-95);
      expect(box.max.x).toBeLessThanOrEqual(40);
      expect(box.min.z).toBeGreaterThanOrEqual(0);
      expect(box.max.z).toBeLessThanOrEqual(125);
      // 平らな地面では、底は地面より 0.5m 下
      expect(box.min.y).toBeCloseTo(groundVisualY - 0.5, 5);
      // 右の塔はテラス 0.6m + 本体 14.4m + 2.5m = 17.5m（左の塔は +1.5m）
      expect(box.max.y).toBeLessThanOrEqual(groundVisualY + 22);
      // 3 階建てとして、誤った OSM 高さ（9m）より十分に高いことを確認
      expect(box.max.y).toBeGreaterThan(groundVisualY + 15);
    },
  );

  it('uses a single flight on flat ground (terrace only 0.6m above the ground)', () => {
    const result = buildLibrary({
      building: createLibraryBuilding(),
      groundVisualY: 25,
      sampleGroundVisualY: flatGround(25),
    });
    result.group.updateMatrixWorld(true);
    const landing = result.group.getObjectByName('library-stair-landing');
    expect(landing).toBeInstanceOf(THREE.Mesh);
    if (!(landing instanceof THREE.Mesh)) return;
    const landingBox = new THREE.Box3().setFromObject(landing);
    // 1 段構え: 踊り場の代わりにテラスの高さの床が続く
    expect(landingBox.max.y).toBeCloseTo(25.6, 5);
    expect(landingBox.min.y).toBeCloseTo(24.5, 5);
  });

  describe('on a slope that falls toward the street', () => {
    const groundVisualY = 42;
    const ground = slopedGround(groundVisualY, 0.2);
    const result = buildLibrary({
      building: createLibraryBuilding(),
      groundVisualY,
      sampleGroundVisualY: ground,
    });
    result.group.updateMatrixWorld(true);

    const stairs = result.group.getObjectByName('library-grand-stairs');
    const steps = stairs instanceof THREE.InstancedMesh ? instanceCorners(stairs) : [];
    const stepTops = steps.map((c) => Math.max(...c.map((p) => p.y)));

    it('splits the rise into two flights of 0.15-0.2m risers', () => {
      expect(stairs).toBeInstanceOf(THREE.InstancedMesh);
      expect(steps.length).toBeGreaterThan(SINGLE_FLIGHT_STEP_LIMIT);
      const uniqueTops = [...new Set(stepTops.map((y) => Math.round(y * 1000) / 1000))].sort(
        (a, b) => a - b,
      );
      const landing = result.group.getObjectByName('library-stair-landing');
      if (!(landing instanceof THREE.Mesh)) throw new Error('landing missing');
      const landingTop = new THREE.Box3().setFromObject(landing).max.y;
      const terrace = result.group.getObjectByName('library-entrance-terrace');
      if (!(terrace instanceof THREE.Mesh)) throw new Error('terrace missing');
      const terraceTop = new THREE.Box3().setFromObject(terrace).max.y;
      // 踊り場は下端とテラスの間（2 段構え）
      expect(landingTop).toBeGreaterThan(Math.min(...uniqueTops) + 1);
      expect(landingTop).toBeLessThan(terraceTop - 1);
      // 段の高さ（下の段の上面どうし・最後の段から踊り場・テラスまで）はどれも 0.15〜0.2m
      const levels = [...uniqueTops, landingTop, terraceTop].sort((a, b) => a - b);
      for (let i = 1; i < levels.length; i++) {
        const riser = (levels[i] ?? 0) - (levels[i - 1] ?? 0);
        expect(riser).toBeGreaterThanOrEqual(0.149);
        expect(riser).toBeLessThanOrEqual(0.201);
      }
    });

    it('starts the lowest step on the ground with no step-up or gap at the foot', () => {
      const lowestIdx = stepTops.indexOf(Math.min(...stepTops));
      const lowest = steps[lowestIdx];
      expect(lowest).toBeDefined();
      if (!lowest) return;
      const lowestTop = Math.max(...lowest.map((p) => p.y));
      const bottom = Math.min(...lowest.map((p) => p.y));
      // 段の底面の 4 隅すべてで、地面より下まで埋まっている（すき間なし）
      const bottomCorners = lowest.filter((p) => p.y < bottom + 1e-6);
      for (const p of bottomCorners) {
        expect(bottom).toBeLessThan(ground(p.x, p.z));
      }
      // 道寄りの前の縁でいちばん低い地面から、上面まで 1 段（0.2m 以下）。それ以上の段差（浮き）が無い
      const minGroundUnderLowest = Math.min(...bottomCorners.map((p) => ground(p.x, p.z)));
      expect(lowestTop - minGroundUnderLowest).toBeLessThanOrEqual(0.201);
      expect(lowestTop - minGroundUnderLowest).toBeGreaterThan(0);
    });

    it('sinks every step below the ground at its own corners', () => {
      for (const corners of steps) {
        const bottom = Math.min(...corners.map((p) => p.y));
        for (const p of corners) {
          expect(bottom).toBeLessThan(ground(p.x, p.z));
        }
      }
    });

    it('drops the footing 0.5m below the lowest ground under the outline and stairs', () => {
      const box = new THREE.Box3().setFromObject(result.group);
      let lowestOutline = Infinity;
      for (const [x, z] of LIBRARY_POLYGON) {
        lowestOutline = Math.min(lowestOutline, ground(x, z));
      }
      expect(box.min.y).toBeLessThanOrEqual(lowestOutline - 0.5 + 1e-6);
      const body = result.group.getObjectByName('library-main-body');
      if (!(body instanceof THREE.Mesh)) throw new Error('body missing');
      expect(new THREE.Box3().setFromObject(body).min.y).toBeLessThanOrEqual(
        lowestOutline - 0.5 + 1e-6,
      );
    });
  });
});
