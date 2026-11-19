import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildEnshinkan } from './enshinkan';

/** buildings.json の enshinkan（OSM way 423067230）の輪郭。北に四角い張り出しが付く円 */
const ENSHINKAN_POLYGON: [number, number][] = [
  [34.73, 105.46],
  [35.93, 96.44],
  [45.07, 97.56],
  [44.18, 106.99],
  [48.68, 110.66],
  [52.11, 114.97],
  [53.78, 121.73],
  [53.54, 128.32],
  [50.65, 134.27],
  [45.39, 138.93],
  [38.98, 141.52],
  [32.57, 141.54],
  [26.5, 140.07],
  [22.3, 136.31],
  [18.93, 131.82],
  [17.14, 125.13],
  [17.58, 118.15],
  [20.68, 113],
  [24.54, 109.23],
  [29.03, 106.74],
];

const CX = 35.57;
const CZ = 123.6;

function createEnshinkanFeature(): BuildingFeature {
  return {
    id: 'enshinkan',
    name: 'ITセンター（円神館）',
    shortName: 'ITセンター',
    kana: 'えんしんかん あいてぃーせんたー',
    englishName: 'Enshinkan (IT Center)',
    category: 'shared',
    inCampus: true,
    faculties: [],
    facilityTags: ['study', 'architecture'],
    keywords: [],
    description: '',
    sculptStyle: 'enshinkan-piloti',
    labelPriority: 4,
    polygon: ENSHINKAN_POLYGON,
    centroid: { x: 35.62, z: 120.94 },
    groundY: 40.85,
    minGroundY: 40.71,
    maxGroundY: 40.85,
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

describe('buildEnshinkan', () => {
  const groundVisualY = 36.1;
  const result = buildEnshinkan({
    building: createEnshinkanFeature(),
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
    // 輪郭の外接箱 x 17.14〜53.78、z 96.44〜141.54 の ±20m
    expect(box.min.x).toBeGreaterThanOrEqual(-2.86);
    expect(box.max.x).toBeLessThanOrEqual(73.78);
    expect(box.min.z).toBeGreaterThanOrEqual(76.44);
    expect(box.max.z).toBeLessThanOrEqual(161.54);
    expect(box.min.y).toBeGreaterThanOrEqual(groundVisualY - 5);
    expect(box.max.y).toBeLessThanOrEqual(groundVisualY + 60);
    // 平らな地面では、底は地面の 0.5m 下
    expect(box.min.y).toBeCloseTo(groundVisualY - 0.5, 5);
    // 円の上の階は OSM の輪郭（半径 18.43m）からはみ出さない
    expect(box.max.x).toBeLessThanOrEqual(CX + 18.43 + 0.01);
    expect(box.min.x).toBeGreaterThanOrEqual(CX - 18.43 - 0.01);
  });

  it('exposes the drum and columns as primaryMaterials', () => {
    expect(result.primaryMaterials.length).toBeGreaterThanOrEqual(2);
    expect(result.primaryMaterials.length).toBeLessThanOrEqual(3);
    for (const entry of result.primaryMaterials) {
      expect(entry.mat).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(`#${entry.mat.color.getHexString().toUpperCase()}`).toBe(entry.baseHex.toUpperCase());
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

  it('stands 16 evenly spaced thick columns just inside the edge of the drum (small overhang, like the photo)', () => {
    const cols = result.group.getObjectByName('enshinkan-columns');
    if (!(cols instanceof THREE.InstancedMesh)) throw new Error('columns missing');
    expect(cols.count).toBe(16);
    cols.geometry.computeBoundingBox();
    const colBox = cols.geometry.boundingBox;
    if (!colBox) throw new Error('column bounds missing');
    // 太さ 1.1m 以上（写真の太さは隣の柱との間隔の 0.16 倍・上の階の高さの 0.18 倍 ≒ 1.05〜1.1m）
    const colRadius = (colBox.max.x - colBox.min.x) / 2;
    expect(colRadius * 2).toBeGreaterThanOrEqual(1.1);
    const angles = instanceCenters(cols)
      .map((c) => {
        const r = Math.hypot(c.x - CX, c.z - CZ);
        // 上の階の縁（半径 18.43m）から柱の外の面までの出は 0.2〜0.6m
        const overhang = 18.43 - (r + colRadius);
        expect(overhang).toBeGreaterThanOrEqual(0.2);
        expect(overhang).toBeLessThanOrEqual(0.6);
        return Math.atan2(c.z - CZ, c.x - CX);
      })
      .sort((a, b) => a - b);
    for (let i = 1; i < angles.length; i++) {
      const a = angles[i] ?? 0;
      const b = angles[i - 1] ?? 0;
      expect(a - b).toBeCloseTo((2 * Math.PI) / 16, 3);
    }
  });

  it('centers the roof block on the drum, turned about 9 degrees clockwise like the aerial photo', () => {
    const block = result.group.getObjectByName('enshinkan-roof-block');
    if (!block) throw new Error('roof block missing');
    const center = new THREE.Box3().setFromObject(block).getCenter(new THREE.Vector3());
    expect(center.x).toBeCloseTo(CX, 1);
    expect(center.z).toBeCloseTo(CZ, 1);
    // 局所の +X（東西の辺）は、東へ進むと南（+Z）へ下がる
    const east = new THREE.Vector3(1, 0, 0).transformDirection(block.matrixWorld);
    expect((Math.atan2(east.z, east.x) * 180) / Math.PI).toBeCloseTo(9, 0);
  });

  it('sizes the roof block like the aerial photo and keeps it low enough to hide behind the edge from the ground', () => {
    const block = result.group.getObjectByName('enshinkan-roof-block');
    if (!(block instanceof THREE.Mesh)) throw new Error('roof block missing');
    block.geometry.computeBoundingBox();
    const size = block.geometry.boundingBox?.getSize(new THREE.Vector3());
    if (!size) throw new Error('roof block bounds missing');
    // 航空写真の明るい平らな面: 東西 約 17.5m・南北 約 18.8m
    expect(size.x).toBeCloseTo(17.5, 0);
    expect(size.z).toBeCloseTo(18.8, 0);
    // 北西の道からの写真では上の階の縁の上に何も見えない（1.7m を超えると角がのぞく）
    expect(size.y).toBeLessThanOrEqual(1.5);
  });

  it('does not draw a green rim on the roof edge (not in the photo nor the aerial photo)', () => {
    const greenish: string[] = [];
    result.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        const hsl = { h: 0, s: 0, l: 0 };
        mat.color.getHSL(hsl, THREE.SRGBColorSpace);
        // 緑〜青緑（80°〜170°）で色みのあるもの
        if (hsl.s > 0.08 && hsl.h * 360 >= 80 && hsl.h * 360 <= 170) greenish.push(obj.name);
      }
    });
    expect(greenish).toEqual([]);
  });

  it('raises the north annex above the piloti ceiling but below the drum top, with white floor bands', () => {
    const annex = result.group.getObjectByName('enshinkan-annex');
    if (!annex) throw new Error('annex missing');
    const top = new THREE.Box3().setFromObject(annex).max.y;
    expect(top).toBeGreaterThan(groundVisualY + 7.0);
    expect(top).toBeLessThan(groundVisualY + 12.8);
    for (const name of ['enshinkan-annex-slab-0', 'enshinkan-annex-slab-1', 'enshinkan-annex-slab-2']) {
      expect(result.group.getObjectByName(name)).toBeDefined();
    }
  });

  it('does not add the unsourced blue/green/yellow mosaic band (no strongly saturated material)', () => {
    const saturated: string[] = [];
    result.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        const hsl = { h: 0, s: 0, l: 0 };
        mat.color.getHSL(hsl, THREE.SRGBColorSpace);
        // 灰色・灰青のガラスの彩度は 0.2 未満。モザイクの青・緑・黄なら 0.4 を超える
        if (hsl.s > 0.3) saturated.push(obj.name);
      }
    });
    expect(saturated).toEqual([]);
  });

  describe('on ground that rises to the south', () => {
    const ground = (x: number, z: number): number => groundVisualY + 0.05 * (z - 100) + 0.01 * x;
    const sloped = buildEnshinkan({
      building: createEnshinkanFeature(),
      groundVisualY,
      sampleGroundVisualY: ground,
    });
    sloped.group.updateMatrixWorld(true);

    it('buries every column bottom in its own ground', () => {
      const cols = sloped.group.getObjectByName('enshinkan-columns');
      if (!(cols instanceof THREE.InstancedMesh)) throw new Error('columns missing');
      for (const c of instanceCenters(cols)) {
        // インスタンスの行列は Float32 なので 1mm の誤差を見込む
        expect(c.y).toBeLessThanOrEqual(ground(c.x, c.z) - 0.5 + 1e-3);
      }
    });

    it('drops the lobby and the north annex below the lowest ground under the outline', () => {
      let lowest = Infinity;
      for (const [x, z] of ENSHINKAN_POLYGON) lowest = Math.min(lowest, ground(x, z));
      for (const name of ['enshinkan-lobby', 'enshinkan-annex']) {
        const obj = sloped.group.getObjectByName(name);
        if (!obj) throw new Error(`${name} missing`);
        expect(new THREE.Box3().setFromObject(obj).min.y).toBeLessThanOrEqual(lowest - 0.5 + 1e-6);
      }
    });
  });
});
