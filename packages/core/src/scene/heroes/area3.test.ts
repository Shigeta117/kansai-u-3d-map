import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildArea3 } from './area3';

/** buildings.json の area3（rel_14656532）の輪郭と中庭 */
const AREA3_POLYGON: [number, number][] = [
  [-234.61, 239.22],
  [-227.52, 258.78],
  [-232.03, 260.41],
  [-230.93, 263.42],
  [-226.43, 261.8],
  [-225.24, 265.08],
  [-223.26, 264.36],
  [-221.99, 267.85],
  [-207.64, 262.69],
  [-206.87, 264.82],
  [-187.31, 257.78],
  [-186.31, 260.56],
  [-163.68, 252.41],
  [-166.88, 243.56],
  [-164.53, 242.7],
  [-161.32, 251.57],
  [-136.26, 242.55],
  [-142.05, 226.59],
  [-136.32, 224.53],
  [-145.61, 198.9],
  [-139.89, 196.85],
  [-145.75, 180.7],
  [-160.88, 186.14],
  [-165.85, 187.93],
  [-162.93, 196.03],
  [-164.64, 196.64],
  [-165.05, 195.54],
  [-168.45, 196.76],
  [-167.46, 199.47],
  [-165.33, 198.7],
  [-164.85, 200.04],
  [-171.61, 202.48],
  [-169.71, 207.72],
  [-179.38, 211.21],
  [-181.09, 206.5],
  [-220.9, 220.83],
  [-216.58, 232.73],
];
const AREA3_HOLE: [number, number][] = [
  [-211.23, 246.73],
  [-214.01, 239.42],
  [-191.16, 230.82],
  [-190.69, 232.08],
  [-180.45, 228.23],
  [-180.93, 226.97],
  [-175.13, 224.79],
  [-171.18, 235.23],
  [-187.37, 241.32],
  [-188.55, 238.2],
];

function createArea3Building(): BuildingFeature {
  return {
    id: 'area3',
    name: '第3学舎（社会学部・ソシオAV大ホール）',
    shortName: '第3学舎',
    kana: 'だいさんがくしゃ',
    englishName: '3rd Academic Building (Sociology)',
    category: 'area3',
    inCampus: true,
    faculties: ['社会学部'],
    facilityTags: ['study'],
    keywords: [],
    description: '',
    sculptStyle: 'area3-white-courtyard',
    labelPriority: 2,
    polygon: AREA3_POLYGON.map(([x, z]) => [x, z]),
    holes: [AREA3_HOLE.map(([x, z]) => [x, z])],
    centroid: { x: -182.08, z: 227.73 },
    groundY: 45.48,
    minGroundY: 39.39,
    maxGroundY: 48.29,
    height: 16.6,
    levels: 4,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

function bounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const xs = AREA3_POLYGON.map(([x]) => x);
  const zs = AREA3_POLYGON.map(([, z]) => z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

function worldBox(obj: THREE.Object3D): THREE.Box3 {
  obj.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(obj);
}

describe('buildArea3', () => {
  const groundVisualY = 42.4;
  const result = buildArea3({
    building: createArea3Building(),
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
    const b = bounds();
    const box = worldBox(result.group);
    expect(box.isEmpty()).toBe(false);
    expect(box.min.x).toBeGreaterThanOrEqual(b.minX - 20);
    expect(box.max.x).toBeLessThanOrEqual(b.maxX + 20);
    expect(box.min.z).toBeGreaterThanOrEqual(b.minZ - 20);
    expect(box.max.z).toBeLessThanOrEqual(b.maxZ + 20);
    expect(box.min.y).toBeCloseTo(groundVisualY - 0.5, 5);
    expect(box.min.y).toBeGreaterThanOrEqual(groundVisualY - 5);
    expect(box.max.y).toBeLessThanOrEqual(groundVisualY + 60);
  });

  it('exposes the tile walls and the roof as primaryMaterials', () => {
    expect(result.primaryMaterials).toHaveLength(3);
    // Node では窓の模様（canvas）が作れないので、壁はタイルの色の無地になる
    expect(result.primaryMaterials.map((m) => m.baseHex)).toEqual(['#DCD4C3', '#DCD4C3', '#A9A49A']);
    for (const entry of result.primaryMaterials) {
      expect(entry.mat).toBeInstanceOf(THREE.MeshStandardMaterial);
      // baseHex は材質の今の色と同じ（選択の解除で色を戻すときに使われる）
      expect(`#${entry.mat.color.getHexString().toUpperCase()}`).toBe(entry.baseHex);
    }
    expect(result.animated).toEqual([]);
  });

  it('puts the 10-storey tower at the west end, taller than the 5-storey wing, with a taller slender tower', () => {
    const main = result.group.getObjectByName('area3-tower-main');
    const wing = result.group.getObjectByName('area3-wing-bd');
    const slender = result.group.getObjectByName('area3-tower-slender');
    if (!main || !wing || !slender) throw new Error('parts missing');
    const mainBox = worldBox(main);
    const wingBox = worldBox(wing);
    const slenderBox = worldBox(slender);
    // 10 階（3.9m）＋笠木 ≒ 41m、低い棟は 5 階＋パラペット ≒ 20.5m
    expect(mainBox.max.y - groundVisualY).toBeGreaterThan(38);
    expect(wingBox.max.y - groundVisualY).toBeLessThan(23);
    expect(slenderBox.max.y).toBeGreaterThan(mainBox.max.y + 3);
    // 塔は輪郭の西端（関西大学会館側から見て左、西門のアクセス道の到着点）にある
    const mainCx = (mainBox.min.x + mainBox.max.x) / 2;
    const wingCx = (wingBox.min.x + wingBox.max.x) / 2;
    expect(mainCx).toBeLessThan(wingCx - 20);
    expect(mainBox.min.x).toBeLessThan(-225);
  });

  it('puts 5 deep fins plus the 2 frame edges and 4 thin blue lines (not a board) on the west face of the tower', () => {
    const fins = result.group.getObjectByName('area3-fins');
    const letters = result.group.getObjectByName('area3-letter-lines');
    const main = result.group.getObjectByName('area3-tower-main');
    if (!(fins instanceof THREE.InstancedMesh) || !(letters instanceof THREE.InstancedMesh) || !main) {
      throw new Error('fins missing');
    }
    expect(fins.count).toBe(7);
    expect(letters.count).toBe(4);
    expect(result.group.getObjectByName('area3-blue-band')).toBeUndefined();
    const finBox = worldBox(fins);
    const letterBox = worldBox(letters);
    const mainBox = worldBox(main);
    // フィンと青い線は塔の西の面より外（西）に出る
    expect(finBox.min.x).toBeLessThan(mainBox.min.x);
    expect(letterBox.min.x).toBeLessThan(mainBox.min.x);
    // 青い線は細い（一枚板にしない）
    expect(letterBox.max.y - letterBox.min.y).toBeLessThan(0.5);
    // フィンは塔の上部（8〜10 階）
    expect(finBox.min.y - groundVisualY).toBeGreaterThan(20);
  });

  it('steps the left shoulder of the fin face down twice (8 storeys, then 7 storeys at the north end)', () => {
    const step = result.group.getObjectByName('area3-tower-step');
    const base = result.group.getObjectByName('area3-tower-base');
    const fins = result.group.getObjectByName('area3-fins');
    const main = result.group.getObjectByName('area3-tower-main');
    if (!step || !base || !fins || !main) throw new Error('parts missing');
    const finBottom = worldBox(fins).min.y;
    const stepTop = worldBox(step).max.y;
    const baseTop = worldBox(base).max.y;
    const mainTop = worldBox(main).max.y;
    expect(stepTop).toBeGreaterThan(finBottom + 2);
    expect(stepTop).toBeLessThan(mainTop - 4);
    expect(baseTop).toBeLessThan(stepTop - 2);
    expect(Math.abs(baseTop - finBottom)).toBeLessThan(1);
  });

  it('keeps the emblem a small plain disc inside the slender tower face', () => {
    const disc = result.group.getObjectByName('area3-emblem-disc');
    const slender = result.group.getObjectByName('area3-tower-slender');
    if (!(disc instanceof THREE.Mesh) || !slender) throw new Error('emblem missing');
    const discBox = worldBox(disc);
    const slenderBox = worldBox(slender);
    const mat = disc.material as THREE.MeshStandardMaterial;
    // 青くしない（壁と同系の色）
    expect(mat.color.b).toBeLessThan(mat.color.r);
    expect(discBox.max.y - discBox.min.y).toBeLessThan(2);
    expect(discBox.max.y).toBeLessThan(slenderBox.max.y);
    expect(discBox.min.y).toBeGreaterThan(slenderBox.min.y);
    // 細い塔の面の幅の中に収まる（角からはみ出さない）
    const slenderSpan = Math.hypot(slenderBox.max.x - slenderBox.min.x, slenderBox.max.z - slenderBox.min.z);
    const discSpan = Math.hypot(discBox.max.x - discBox.min.x, discBox.max.z - discBox.min.z);
    expect(discSpan).toBeLessThan(slenderSpan / 3);
  });

  it('matches the KAN-CAN! floor counts per wing: C 10, B and D 5, A 4 (with a 5th-floor link between B and D)', () => {
    // 1 階の床: 平らな地面では、底（地面 −0.5m）から 1m 上（area3.ts の floorY）
    const floorY = groundVisualY + 0.5;
    const top = (name: string): THREE.Box3 => {
      const obj = result.group.getObjectByName(name);
      if (!obj) throw new Error(`${name} missing`);
      return worldBox(obj);
    };
    const storey = 3.9;
    // 3号館 C棟（塔）: 10 階＋笠木 2.2m
    expect(top('area3-tower-main').max.y - floorY).toBeCloseTo(10 * storey + 2.2, 3);
    // 2号館 B棟・4号館 D棟: 5 階＋パラペット 1m
    const bd = top('area3-wing-bd');
    expect(bd.max.y - floorY).toBeCloseTo(5 * storey + 1.0, 3);
    // 1号館 A棟: 地上 4 階＋パラペット 1m。B・D の東（新関西大学会館の側）
    const a = top('area3-wing-a');
    expect(a.max.y - floorY).toBeCloseTo(4 * storey + 1.0, 3);
    expect((a.min.x + a.max.x) / 2).toBeGreaterThan((bd.min.x + bd.max.x) / 2 + 15);
    // B と D を結ぶ 5 階の通路は A棟の屋上に載り、上端は B・D とそろう
    const link = top('area3-link-bd');
    expect(link.min.y).toBeCloseTo(a.max.y, 3);
    expect(link.max.y).toBeCloseTo(bd.max.y, 3);
    // 今のモデルにあった「雁行する棟は全部 5 階」の 1 つの塊は無い
    expect(result.group.getObjectByName('area3-wing')).toBeUndefined();
  });

  it('keeps the courtyard open', () => {
    const wing = result.group.getObjectByName('area3-wing-bd');
    if (!(wing instanceof THREE.Mesh)) throw new Error('wing missing');
    const ray = new THREE.Raycaster(new THREE.Vector3(-197, groundVisualY + 100, 236), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(wing).length).toBe(0);
    const solid = new THREE.Raycaster(new THREE.Vector3(-170, groundVisualY + 100, 250), new THREE.Vector3(0, -1, 0));
    expect(solid.intersectObject(wing).length).toBeGreaterThan(0);
  });

  describe('on ground that falls to the north-east', () => {
    // 東（+X）へ 1m あたり 0.06、北（-Z）へ 0.1 下がる
    const ground = (x: number, z: number): number => groundVisualY - 0.06 * (x + 190) + 0.1 * (z - 230);
    const sloped = buildArea3({
      building: createArea3Building(),
      groundVisualY,
      sampleGroundVisualY: ground,
    });
    sloped.group.updateMatrixWorld(true);

    it('buries the bottom 0.5m below the lowest ground under the outline', () => {
      let lowest = Infinity;
      for (const [x, z] of AREA3_POLYGON) lowest = Math.min(lowest, ground(x, z));
      const box = worldBox(sloped.group);
      expect(box.min.y).toBeLessThanOrEqual(lowest - 0.5 + 1e-6);
      for (const name of ['area3-tower-base', 'area3-wing-bd', 'area3-wing-a', 'area3-vestibule']) {
        const obj = sloped.group.getObjectByName(name);
        if (!obj) throw new Error(`${name} missing`);
        expect(worldBox(obj).min.y).toBeLessThanOrEqual(lowest - 0.5 + 1e-6);
      }
    });
  });
});
