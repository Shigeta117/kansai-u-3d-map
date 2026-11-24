import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildCentralGym } from './centralGym';
import { HERO_BUILDERS } from './index';
import { frameToLocal, makeFrame } from './localFrame';

/** buildings.json の central-gym（OSM way 423067235）の輪郭 */
const GYM_POLYGON: [number, number][] = [
  [73.33, -180.26],
  [77.54, -184.98],
  [72.7, -189.25],
  [101.92, -222.11],
  [106.96, -217.66],
  [109.85, -220.9],
  [159.26, -177.27],
  [156.09, -173.7],
  [160.28, -169.99],
  [155.52, -164.65],
  [162.18, -158.77],
  [142.35, -136.48],
  [136.83, -141.35],
  [131.21, -135.04],
  [125.9, -139.72],
  [122.98, -136.41],
];

function createGymFeature(): BuildingFeature {
  return {
    id: 'central-gym',
    name: '千里山中央体育館',
    shortName: '中央体育館',
    kana: 'せんりやまちゅうおうたいいくかん',
    englishName: 'Senriyama Central Gymnasium',
    category: 'sports',
    inCampus: true,
    faculties: [],
    facilityTags: ['gym'],
    keywords: [],
    description: '',
    sculptStyle: 'gym-arena',
    labelPriority: 3,
    polygon: GYM_POLYGON,
    centroid: { x: 124.68, z: -171.78 },
    groundY: 46.7,
    minGroundY: 45.28,
    maxGroundY: 48.37,
    height: 12.8,
    levels: 3,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

function worldVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const pos = mesh.geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    out.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld));
  }
  return out;
}

describe('buildCentralGym', () => {
  const groundVisualY = 44.0;
  const result = buildCentralGym({
    building: createGymFeature(),
    groundVisualY,
    sampleGroundVisualY: () => groundVisualY,
  });
  result.group.updateMatrixWorld(true);
  const meshes = new Map<string, THREE.Mesh>();
  result.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.set(obj.name, obj);
  });
  const frame = makeFrame(109.85, -220.9, 159.26 - 109.85, -177.27 - -220.9);
  const local = (mesh: THREE.Mesh): { u: number; v: number; y: number }[] =>
    worldVertices(mesh).map((p) => {
      const [u, v] = frameToLocal(frame, p.x, p.z);
      return { u, v, y: p.y };
    });

  it('is registered as the hero of central-gym', () => {
    expect(HERO_BUILDERS['central-gym']).toBe(buildCentralGym);
  });

  it('builds one mesh per material within a small budget', () => {
    expect(meshes.size).toBeLessThanOrEqual(6);
    for (const name of ['walls', 'vault', 'dark-metal', 'canopy', 'glass', 'sign']) {
      expect(meshes.has(`central-gym-${name}`)).toBe(true);
    }
  });

  it('has finite vertex coordinates', () => {
    for (const mesh of meshes.values()) {
      const pos = mesh.geometry.getAttribute('position');
      expect(pos.count).toBeGreaterThan(0);
      for (let i = 0; i < pos.count * 3; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
    }
  });

  it('fits the outline and reaches below the ground', () => {
    const box = new THREE.Box3().setFromObject(result.group, true);
    // 輪郭の外接箱 x 72.7〜162.18、z −222.11〜−135.04 の ±5m（庇が南東へ 4m 出る）
    expect(box.min.x).toBeGreaterThanOrEqual(67.7);
    expect(box.max.x).toBeLessThanOrEqual(167.2);
    expect(box.min.z).toBeGreaterThanOrEqual(-227.2);
    expect(box.max.z).toBeLessThanOrEqual(-130);
    expect(box.min.y).toBeCloseTo(groundVisualY - 0.5, 5);
  });

  it('roofs the arena with a barrel vault along the long axis (crown 19m, eave 12m)', () => {
    const vault = meshes.get('central-gym-vault');
    expect(vault).toBeTruthy();
    if (!vault) return;
    const pts = local(vault);
    const crown = Math.max(...pts.map((p) => p.y));
    // 頂 = 軒 12m + 上がり 7m + 殻の厚さ 0.45m（+0.02m のすき間）
    expect(crown).toBeCloseTo(groundVisualY + 19.47, 1);
    // 頂は短手の中ほど（v ≈ 27.3）、軒は長い辺（v ≈ 0 と 54.6 の外）で 12m ほど
    const top = pts.find((p) => p.y === crown);
    expect(top?.v ?? 0).toBeGreaterThan(26);
    expect(top?.v ?? 0).toBeLessThan(28.6);
    const edges = pts.filter((p) => p.v < 0 || p.v > 54.6);
    expect(Math.max(...edges.map((p) => p.y))).toBeLessThan(groundVisualY + 12.6);
    // 北西の端（u ≈ 0）は頂の高さまで、南東の端（u ≈ 66.6）は軒の高さまで下がる（映像で妻面が見えない）
    const nwEnd = pts.filter((p) => p.u < 0);
    const seEnd = pts.filter((p) => p.u > 66.5);
    expect(Math.max(...nwEnd.map((p) => p.y))).toBeCloseTo(crown, 3);
    expect(Math.max(...seEnd.map((p) => p.y))).toBeLessThan(groundVisualY + 12.5);
  });

  it('puts the entrance canopy where the aerial photo shows it, on the tall south-east wall', () => {
    const canopy = meshes.get('central-gym-canopy');
    const glass = meshes.get('central-gym-glass');
    expect(canopy && glass).toBeTruthy();
    if (!canopy || !glass) return;
    const box = new THREE.Box3().setFromObject(canopy, true);
    const center = box.getCenter(new THREE.Vector3());
    // 空中写真の白い枠の中心（およそ (155.5, −145.9)）から 2m 以内
    expect(Math.hypot(center.x - 155.5, center.z + 145.9)).toBeLessThan(2);
    // 庇の上端は広場から 4.6m、戸は広場の高さから
    expect(box.max.y).toBeCloseTo(groundVisualY + 4.6, 5);
    expect(new THREE.Box3().setFromObject(glass, true).min.y).toBeCloseTo(groundVisualY - 0.05, 5);
  });

  it('raises the north-west annex (the protrusion on the back) to about 11m, with a small window and a doorway on its north-west face', () => {
    // 持ち主の写真（2026-11-24、IMG_3393〜3395）: 裏側の凸はアリーナと同じタイルの高い箱。上は濃い色の陸屋根
    const walls = meshes.get('central-gym-walls');
    const dark = meshes.get('central-gym-dark-metal');
    const glass = meshes.get('central-gym-glass');
    expect(walls && dark && glass).toBeTruthy();
    if (!walls || !dark || !glass) return;
    const annexWall = local(walls).filter((p) => p.u < -1 && p.v > 4 && p.v < 48.5);
    expect(Math.max(...annexWall.map((p) => p.y))).toBeCloseTo(groundVisualY + 11.0, 5);
    const annexRoof = local(dark).filter((p) => p.u < -1 && p.v > 4 && p.v < 48.5);
    expect(annexRoof.length).toBeGreaterThan(0);
    expect(Math.max(...annexRoof.map((p) => p.y))).toBeCloseTo(groundVisualY + 11.0, 5);
    // 窓と戸口は北西の面（u ≈ −6.8）の少し外に貼る
    const onFace = local(glass).filter((p) => Math.abs(p.u + 6.83) < 0.01);
    const windowPts = onFace.filter((p) => p.y > groundVisualY + 5);
    expect(Math.min(...windowPts.map((p) => p.v))).toBeCloseTo(39.0, 5);
    expect(Math.max(...windowPts.map((p) => p.v))).toBeCloseTo(41.3, 5);
    expect(Math.max(...windowPts.map((p) => p.y))).toBeLessThan(groundVisualY + 11.0);
    const doorPts = onFace.filter((p) => p.y < groundVisualY + 5);
    expect(Math.min(...doorPts.map((p) => p.y))).toBeLessThan(groundVisualY);
    expect(Math.max(...doorPts.map((p) => p.v))).toBeLessThan(39.0);
  });

  it('clads the north-west tympanum in the roof metal, not the tile', () => {
    const walls = meshes.get('central-gym-walls');
    const vault = meshes.get('central-gym-vault');
    expect(walls && vault).toBeTruthy();
    if (!walls || !vault) return;
    // 妻面（u ≈ 0、軒の 12m より上）の点は屋根の材質のメッシュにあり、壁のメッシュには無い
    const above = (pts: { u: number; v: number; y: number }[]): number =>
      pts.filter((p) => Math.abs(p.u) < 0.01 && p.y > groundVisualY + 12.5).length;
    expect(above(local(walls))).toBe(0);
    expect(above(local(vault))).toBeGreaterThan(0);
  });

  it('slopes the top of the entrance wall down toward the north-east end', () => {
    const walls = meshes.get('central-gym-walls');
    expect(walls).toBeTruthy();
    if (!walls) return;
    // 正面（u ≈ 80.3）の点だけを見る
    const front = local(walls).filter((p) => Math.abs(p.u - 80.3) < 0.01);
    const at = (v: number): number => Math.max(...front.filter((p) => Math.abs(p.v - v) < 0.01).map((p) => p.y));
    expect(at(18.3)).toBeCloseTo(groundVisualY + 10.0, 5);
    expect(at(41.8)).toBeCloseTo(groundVisualY + 15.5, 5);
  });
});
