import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildKanbunkan } from './kanbunkan';

/** buildings.json の kanbunkan（OSM way 423067243）の輪郭 */
const KANBUNKAN_POLYGON: [number, number][] = [
  [17.19, -89.92],
  [42.58, -86.24],
  [48.18, -85.66],
  [49.43, -93.09],
  [46.3, -93.62],
  [47.26, -99.34],
  [29.16, -101.91],
  [31.64, -121.48],
  [13.55, -123.61],
  [11.44, -102.76],
  [5.03, -103.26],
  [-0.36, -100.41],
  [-3.34, -95.11],
  [-2.96, -89.04],
  [0.64, -84.14],
  [6.33, -81.95],
  [12.3, -83.18],
  [16.66, -87.43],
];

/** 円形部分の中心（輪郭の円弧に当てはめた円） */
const ROTUNDA_CX = 7.13;
const ROTUNDA_CZ = -92.73;

function createKanbunkanFeature(): BuildingFeature {
  return {
    id: 'kanbunkan',
    name: '簡文館（関西大学博物館）',
    shortName: '簡文館',
    kana: 'かんぶんかん はくぶつかん',
    englishName: 'Kanbunkan / Kansai University Museum',
    category: 'heritage',
    inCampus: true,
    faculties: [],
    facilityTags: ['museum', 'architecture'],
    keywords: [],
    description: '',
    sculptStyle: 'kanbunkan-rotunda',
    labelPriority: 1,
    polygon: KANBUNKAN_POLYGON,
    centroid: { x: 20.61, z: -95.68 },
    groundY: 54.05,
    minGroundY: 52.29,
    maxGroundY: 54.06,
    height: 12.8,
    levels: 3,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

function instanceCenters(mesh: THREE.InstancedMesh): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    out.push(new THREE.Vector3().setFromMatrixPosition(m));
  }
  return out;
}

describe('buildKanbunkan', () => {
  const groundVisualY = 53.9;
  const result = buildKanbunkan({
    building: createKanbunkanFeature(),
    groundVisualY,
    sampleGroundVisualY: () => groundVisualY,
  });
  result.group.updateMatrixWorld(true);

  it('produces meshes within the budget', () => {
    const meshes: THREE.Mesh[] = [];
    result.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) meshes.push(obj);
    });
    expect(meshes.length).toBeGreaterThanOrEqual(1);
    expect(meshes.length).toBeLessThanOrEqual(120);
  });

  it('has finite vertex coordinates and instance matrices', () => {
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

  it('fits around the outline and reaches below the ground', () => {
    const box = new THREE.Box3().setFromObject(result.group);
    expect(box.isEmpty()).toBe(false);
    // 輪郭の外接箱 x -3.34〜49.43、z -123.61〜-81.95 の ±20m
    expect(box.min.x).toBeGreaterThanOrEqual(-23.34);
    expect(box.max.x).toBeLessThanOrEqual(69.43);
    expect(box.min.z).toBeGreaterThanOrEqual(-143.61);
    expect(box.max.z).toBeLessThanOrEqual(-61.95);
    expect(box.min.y).toBeGreaterThanOrEqual(groundVisualY - 5);
    expect(box.max.y).toBeLessThanOrEqual(groundVisualY + 60);
    // 平らな地面では、底は地面の 0.5m 下
    expect(box.min.y).toBeCloseTo(groundVisualY - 0.5, 5);
  });

  it('exposes the rotunda brick, the old wings and the copper roof as primaryMaterials', () => {
    expect(result.primaryMaterials.map((m) => m.baseHex)).toEqual(['#84635A', '#B8A692', '#7A9F7F']);
    for (const entry of result.primaryMaterials) {
      expect(entry.mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    }
    expect(result.animated).toEqual([]);
  });

  it('keeps every material non-metallic (no environment map)', () => {
    result.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
        if (mat instanceof THREE.MeshStandardMaterial) expect(mat.metalness).toBeLessThanOrEqual(0.1);
      }
    });
  });

  it('puts the copper roof on the rotunda, rising above the old wings', () => {
    const dome = result.group.getObjectByName('kanbunkan-dome');
    const east = result.group.getObjectByName('kanbunkan-wing-east');
    const north = result.group.getObjectByName('kanbunkan-wing-north');
    if (!dome || !east || !north) throw new Error('parts missing');
    const domeBox = new THREE.Box3().setFromObject(dome);
    const eastBox = new THREE.Box3().setFromObject(east);
    expect(domeBox.max.y).toBeGreaterThan(eastBox.max.y + 1);
    // 屋根は円形部分（半径 10.77m）の上だけ
    const center = domeBox.getCenter(new THREE.Vector3());
    expect(center.x).toBeCloseTo(ROTUNDA_CX, 1);
    expect(center.z).toBeCloseTo(ROTUNDA_CZ, 1);
    expect(domeBox.max.x - domeBox.min.x).toBeLessThan(2 * 10.77 + 1);
  });

  it('stands the piloti columns only on the free arc of the rotunda, not inside the old wings', () => {
    const cols = result.group.getObjectByName('kanbunkan-piloti');
    if (!(cols instanceof THREE.InstancedMesh)) throw new Error('piloti missing');
    expect(cols.count).toBeGreaterThanOrEqual(8);
    // 翼に接する円弧は、輪郭の接点 (11.44, -102.76)（-66.8°）から (17.19, -89.92)（15.6°）まで
    const lo = (-66.8 * Math.PI) / 180;
    const hi = (15.6 * Math.PI) / 180;
    for (const c of instanceCenters(cols)) {
      const a = Math.atan2(c.z - ROTUNDA_CZ, c.x - ROTUNDA_CX);
      const insideAttached = a > lo + 0.02 && a < hi - 0.02;
      expect(insideAttached).toBe(false);
      expect(Math.hypot(c.x - ROTUNDA_CX, c.z - ROTUNDA_CZ)).toBeLessThan(10.77);
    }
  });

  describe('on ground that drops to the east', () => {
    const ground = (x: number, z: number): number => groundVisualY - 0.06 * Math.max(0, x - 20) + 0.01 * z;
    const sloped = buildKanbunkan({
      building: createKanbunkanFeature(),
      groundVisualY,
      sampleGroundVisualY: ground,
    });
    sloped.group.updateMatrixWorld(true);

    it('buries every piloti column bottom in its own ground', () => {
      const cols = sloped.group.getObjectByName('kanbunkan-piloti');
      if (!(cols instanceof THREE.InstancedMesh)) throw new Error('piloti missing');
      for (const c of instanceCenters(cols)) {
        // インスタンスの行列は Float32 なので 1mm の誤差を見込む
        expect(c.y).toBeLessThanOrEqual(ground(c.x, c.z) - 0.5 + 1e-3);
      }
    });

    it('drops the old wings below the lowest ground under their outline', () => {
      let lowest = Infinity;
      for (const [x, z] of KANBUNKAN_POLYGON) lowest = Math.min(lowest, ground(x, z));
      const east = sloped.group.getObjectByName('kanbunkan-wing-east');
      if (!east) throw new Error('east wing missing');
      expect(new THREE.Box3().setFromObject(east).min.y).toBeLessThanOrEqual(lowest - 0.5 + 1e-6);
    });
  });
});
