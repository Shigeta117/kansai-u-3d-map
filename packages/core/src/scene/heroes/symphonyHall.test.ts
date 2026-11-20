import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { HERO_BUILDERS } from './index';
import { frameToLocal, makeFrame } from './localFrame';
import { HERO_MODELED_PATH_IDS } from './modeledPaths';
import { RIMPUKAN_DECK_M, RIMPUKAN_GROUND_REF } from './rimpukan';
import { buildSymphonyHall, stairTreads } from './symphonyHall';

/** buildings.json の seishikan-4（OSM way 423067246）の輪郭。長方形の北西の面に張り出しが付く */
const HALL_POLYGON: [number, number][] = [
  [134.3, -47.78],
  [140.64, -53.89],
  [137.9, -56.72],
  [142.66, -61.32],
  [145.41, -58.49],
  [150.64, -63.52],
  [172.99, -40.48],
  [156.65, -24.74],
];

function createHallFeature(): BuildingFeature {
  return {
    id: 'seishikan-4',
    name: '誠之館 4号館（KUシンフォニーホール）',
    shortName: 'KUシンフォニー',
    kana: 'せいしかん しんふぉにーほーる',
    englishName: 'Seishikan No.4 / KU Symphony Hall',
    category: 'shared',
    inCampus: true,
    faculties: [],
    facilityTags: ['hall'],
    keywords: [],
    description: '',
    sculptStyle: 'standard',
    labelPriority: 5,
    polygon: HALL_POLYGON,
    centroid: { x: 147.65, z: -50.87 },
    groundY: 42.54,
    minGroundY: 41.58,
    maxGroundY: 42.54,
    height: 16.6,
    levels: 4,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

/** メッシュの頂点をワールド座標で集める */
function worldVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const pos = mesh.geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    out.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld));
  }
  return out;
}

describe('buildSymphonyHall', () => {
  const groundVisualY = 38.4;
  const result = buildSymphonyHall({
    building: createHallFeature(),
    groundVisualY,
    sampleGroundVisualY: () => groundVisualY,
  });
  result.group.updateMatrixWorld(true);
  const meshes = new Map<string, THREE.Mesh>();
  result.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.set(obj.name, obj);
  });
  const frame = makeFrame(150.64, -63.52, 172.99 - 150.64, -40.48 - -63.52);

  it('is registered as the hero of seishikan-4 and owns the stairs behind Rimpukan', () => {
    expect(HERO_BUILDERS['seishikan-4']).toBe(buildSymphonyHall);
    expect(HERO_MODELED_PATH_IDS.has('path_1259556097')).toBe(true);
  });

  it('builds one mesh per material within a small budget', () => {
    expect(meshes.size).toBeGreaterThanOrEqual(6);
    expect(meshes.size).toBeLessThanOrEqual(8);
    for (const name of ['walls', 'slab', 'roof', 'stairs', 'planters', 'bank']) {
      expect(meshes.has(`seishikan-4-${name}`)).toBe(true);
    }
  });

  it('has finite vertex coordinates', () => {
    let checked = 0;
    for (const mesh of meshes.values()) {
      const pos = mesh.geometry.getAttribute('position');
      expect(pos.count).toBeGreaterThan(0);
      for (let i = 0; i < pos.count * 3; i++) {
        expect(Number.isFinite(pos.array[i])).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('stays around the outline and the stairs, and reaches below the ground', () => {
    const box = new THREE.Box3().setFromObject(result.group, true);
    // 輪郭の外接箱 x 134.3〜172.99、z −63.52〜−24.74。階段は凜風館の壁まで（南西へ約 15m）、
    // 小山は凜風館の北東の棟まで（南東へ約 12m）、屋根は北西へ 2.3m 出る
    expect(box.min.x).toBeGreaterThanOrEqual(122);
    expect(box.max.x).toBeLessThanOrEqual(178);
    expect(box.min.z).toBeGreaterThanOrEqual(-67);
    expect(box.max.z).toBeLessThanOrEqual(-10);
    expect(box.min.y).toBeCloseTo(groundVisualY - 0.5, 5);
    // いちばん高い物は、大階段の上端（凜風館の 3 階の屋根のデッキ）の手すり壁（段の鼻の線 +1.0m）
    expect(box.max.y).toBeCloseTo(groundVisualY + RIMPUKAN_DECK_M + 1.0, 5);
  });

  it('puts the thick roof slab over the outline with walls set back under the overhang', () => {
    const roof = meshes.get('seishikan-4-roof');
    const walls = meshes.get('seishikan-4-walls');
    expect(roof && walls).toBeTruthy();
    if (!roof || !walls) return;
    const roofLocal = worldVertices(roof).map((p) => frameToLocal(frame, p.x, p.z));
    const roofV = roofLocal.map(([, v]) => v);
    // 屋根の縁は輪郭の短手（v 0〜22.7）に一致する
    expect(Math.min(...roofV)).toBeCloseTo(0, 3);
    expect(Math.max(...roofV)).toBeCloseTo(22.7, 3);
    // 南西の壁（手すり壁 v ≈ 25.2 は除く: 壁の高さが屋根の下面の近くまである点）は輪郭から 2m 内側
    const wallV = worldVertices(walls)
      .filter((p) => p.y > groundVisualY + 8.0)
      .map((p) => frameToLocal(frame, p.x, p.z)[1])
      .filter((v) => v < 24);
    expect(Math.max(...wallV)).toBeCloseTo(20.7, 3);
  });

  it('climbs from the road to the deck on the 3rd-floor roof of Rimpukan (the 4th-floor level)', () => {
    const stairs = meshes.get('seishikan-4-stairs');
    expect(stairs).toBeTruthy();
    if (!stairs) return;
    const pts = worldVertices(stairs).map((p) => {
      const [u, v] = frameToLocal(frame, p.x, p.z);
      return { u, v, y: p.y };
    });
    // 平らな地面では、凜風館の 1 階の床と階段の下端の地面が同じ高さなので、上端は道から RIMPUKAN_DECK_M（12.4m）
    const topY = Math.max(...pts.map((p) => p.y));
    expect(topY).toBeCloseTo(groundVisualY + RIMPUKAN_DECK_M, 5);
    // 最下段は道の側（u ≈ 0.4）で 1 段目の高さ（0.155m 以下）、最上段の踊り場は凜風館の北東の棟（u ≈ 38.5）まで
    const firstRiser = pts.filter((p) => p.u < 0.5 && p.y > groundVisualY);
    const first = Math.max(...firstRiser.map((p) => p.y)) - groundVisualY;
    expect(first).toBeGreaterThan(0.12);
    expect(first).toBeLessThanOrEqual(0.155 + 1e-6);
    const topLanding = pts.filter((p) => p.y > topY - 0.01);
    expect(Math.max(...topLanding.map((p) => p.u))).toBeGreaterThan(38.4);
    // 階段はホールの南西（屋根の縁 v 22.7 より外）に収まる
    expect(Math.min(...pts.map((p) => p.v))).toBeGreaterThan(25);
  });

  it('splits the rise into steps of at most 0.155m with treads of 0.3m or more and short landings', () => {
    for (const rise of [10.9, 12.4]) {
      const treads = stairTreads(rise);
      const steps = treads.filter((t) => t.kind === 'step');
      const landings = treads.filter((t) => t.kind === 'landing');
      expect(steps.length).toBeGreaterThanOrEqual(Math.ceil(rise / 0.155 - 1e-6));
      expect(steps[steps.length - 1]!.top).toBeCloseTo(rise, 6);
      for (const st of steps) expect(st.u1 - st.u0).toBeGreaterThanOrEqual(0.3);
      // 最初の上りは道から全幅の 8 段（映像 IMG_6413_000・003）、踊り場は 6 か所（いちばん上はデッキへ続く 4m）
      expect(treads.findIndex((t) => t.kind === 'landing')).toBe(8);
      expect(landings).toHaveLength(6);
      const last = landings[landings.length - 1]!;
      expect(last.u1 - last.u0).toBeCloseTo(4.0, 6);
      let prev = 0;
      for (const st of steps) {
        expect(st.top - prev).toBeLessThanOrEqual(0.155 + 1e-9);
        prev = st.top;
      }
    }
  });

  it('keeps the ivy bank under the roof slab and below the deck at the top of the stairs', () => {
    const bank = meshes.get('seishikan-4-bank');
    expect(bank).toBeTruthy();
    if (!bank) return;
    const pts = worldVertices(bank).map((p) => {
      const [u, v] = frameToLocal(frame, p.x, p.z);
      return { u, v, y: p.y };
    });
    // 屋根の板の下（u −2.3〜33.0、v 0〜22.7）では、梁の下端（道から 8.5m）より低い
    const underRoof = pts.filter((p) => p.u > -2.3 && p.u < 33.0 && p.v > 0 && p.v < 22.7);
    expect(underRoof.length).toBeGreaterThan(0);
    expect(Math.max(...underRoof.map((p) => p.y))).toBeLessThan(groundVisualY + 8.5);
    // どこでも凜風館のデッキ（階段の上端）より低い
    expect(Math.max(...pts.map((p) => p.y))).toBeLessThan(groundVisualY + RIMPUKAN_DECK_M);
  });

  it('follows sloping ground: steps never float above the terrain', () => {
    // 南東へ下る地面（道の側が高い）でも、段の箱の底は地面より下にある
    const slope = (x: number, z: number): number => groundVisualY - (x - 134) * 0.05 - (z + 48) * 0.02;
    const sloped = buildSymphonyHall({
      building: createHallFeature(),
      groundVisualY,
      sampleGroundVisualY: slope,
    });
    sloped.group.updateMatrixWorld(true);
    let stairs: THREE.Mesh | null = null;
    sloped.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name === 'seishikan-4-stairs') stairs = obj;
    });
    expect(stairs).not.toBeNull();
    if (!stairs) return;
    const pts = worldVertices(stairs);
    // 段の箱の底（各列のいちばん低い頂点）は、その地点の地面より下
    const lowest = new Map<string, THREE.Vector3>();
    for (const p of pts) {
      const key = `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
      const cur = lowest.get(key);
      if (!cur || p.y < cur.y) lowest.set(key, p);
    }
    for (const p of lowest.values()) {
      expect(p.y).toBeLessThanOrEqual(slope(p.x, p.z) + 1e-6);
    }
    // 上端は、凜風館の重心の地面（凜風館の 1 階の床）から RIMPUKAN_DECK_M の高さ
    const topY = Math.max(...pts.map((p) => p.y));
    expect(topY).toBeCloseTo(slope(RIMPUKAN_GROUND_REF[0], RIMPUKAN_GROUND_REF[1]) + RIMPUKAN_DECK_M, 5);
  });
});
