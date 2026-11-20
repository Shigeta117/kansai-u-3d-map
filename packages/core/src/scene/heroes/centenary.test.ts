import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildCentenary } from './centenary';
import type { HeroBuildResult } from './types';

/** buildings.json の centenary（2026-11-19 生成）の輪郭 */
const CENTENARY_POLYGON: [number, number][] = [
  [-229.27, 436.54],
  [-224.05, 434.91],
  [-221.06, 433.96],
  [-217.86, 432.97],
  [-212.72, 431.36],
  [-219.03, 414.06],
  [-207.93, 410.44],
  [-185.8, 480.29],
  [-192.48, 482.19],
  [-189.72, 491.23],
  [-193.13, 492.57],
  [-195.36, 495.78],
  [-199.87, 498.69],
  [-206.24, 499.14],
  [-209.83, 497.59],
  [-213.33, 498.69],
  [-216.27, 490.13],
  [-222.72, 491.77],
  [-229.91, 467.3],
  [-231.94, 467.77],
  [-245.15, 422.67],
  [-234.36, 419.55],
];

function createCentenaryFeature(): BuildingFeature {
  return {
    id: 'centenary',
    name: '関西大学百周年記念会館',
    shortName: '百周年記念会館',
    kana: 'ひゃくしゅうねんきねんかいかん',
    englishName: 'Centenary Memorial Hall',
    category: 'shared',
    inCampus: true,
    faculties: [],
    facilityTags: ['hall'],
    keywords: [],
    description: '',
    sculptStyle: 'standard',
    labelPriority: 6,
    polygon: CENTENARY_POLYGON,
    centroid: { x: -213.55, z: 463.16 },
    groundY: 37.16,
    minGroundY: 35.16,
    maxGroundY: 45.12,
    height: 12.8,
    levels: 3,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

const GROUND_Y = 31.1;
/** 実データに近い傾き: 北の広場が高く、南へ表示上 13m ほど下がる */
const slopedGround = (x: number, z: number): number => GROUND_Y - 0.15 * (z - 463) + 0.02 * (x + 213);

function outlineBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const xs = CENTENARY_POLYGON.map(([x]) => x);
  const zs = CENTENARY_POLYGON.map(([, z]) => z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

function meshesOf(result: HeroBuildResult): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  result.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });
  return meshes;
}

describe('buildCentenary', () => {
  const building = createCentenaryFeature();

  for (const [label, ground] of [
    ['flat ground', (): number => GROUND_Y],
    ['sloped ground', slopedGround],
  ] as const) {
    describe(`on ${label}`, () => {
      const result = buildCentenary({ building, groundVisualY: GROUND_Y, sampleGroundVisualY: ground });
      result.group.updateMatrixWorld(true);

      it('has meshes and stays within the mesh budget', () => {
        const meshes = meshesOf(result);
        expect(meshes.length).toBeGreaterThan(0);
        expect(meshes.length).toBeLessThanOrEqual(120);
      });

      it('produces only finite vertices and instance matrices', () => {
        let checked = 0;
        for (const mesh of meshesOf(result)) {
          const pos = mesh.geometry.getAttribute('position');
          for (let i = 0; i < pos.count; i++) {
            expect(Number.isFinite(pos.getX(i))).toBe(true);
            expect(Number.isFinite(pos.getY(i))).toBe(true);
            expect(Number.isFinite(pos.getZ(i))).toBe(true);
            checked++;
          }
          if (mesh instanceof THREE.InstancedMesh) {
            for (const v of mesh.instanceMatrix.array) expect(Number.isFinite(v)).toBe(true);
          }
        }
        expect(checked).toBeGreaterThan(0);
      });

      it('fits around the outline (±20m) and between ground −5m and +60m', () => {
        const box = new THREE.Box3().setFromObject(result.group);
        const b = outlineBounds();
        let lowest = Infinity;
        let highest = -Infinity;
        for (const [x, z] of CENTENARY_POLYGON) {
          lowest = Math.min(lowest, ground(x, z));
          highest = Math.max(highest, ground(x, z));
        }
        expect(box.isEmpty()).toBe(false);
        expect(box.min.x).toBeGreaterThanOrEqual(b.minX - 20);
        expect(box.max.x).toBeLessThanOrEqual(b.maxX + 20);
        expect(box.min.z).toBeGreaterThanOrEqual(b.minZ - 20);
        expect(box.max.z).toBeLessThanOrEqual(b.maxZ + 20);
        expect(box.min.y).toBeGreaterThanOrEqual(lowest - 5);
        expect(box.max.y).toBeLessThanOrEqual(highest + 60);
      });

      it('sinks its bottom below the lowest ground under the outline', () => {
        const box = new THREE.Box3().setFromObject(result.group);
        let lowest = Infinity;
        for (const [x, z] of CENTENARY_POLYGON) lowest = Math.min(lowest, ground(x, z));
        expect(box.min.y).toBeLessThanOrEqual(lowest - 0.5 + 1e-6);
      });

      it('returns brick and patina as primary materials', () => {
        expect(result.primaryMaterials.map((p) => p.baseHex)).toEqual(['#A65D3C', '#78A59C']);
        expect(result.animated).toEqual([]);
      });

      it('stands every canopy column on the ground (foot below, top above the local ground)', () => {
        const columns = meshesOf(result).find(
          (mesh): mesh is THREE.InstancedMesh =>
            mesh instanceof THREE.InstancedMesh && mesh.geometry instanceof THREE.CylinderGeometry,
        );
        expect(columns).toBeDefined();
        if (!columns) return;
        expect(columns.count).toBe(10);
        const m = new THREE.Matrix4();
        const p = new THREE.Vector3();
        const s = new THREE.Vector3();
        const qq = new THREE.Quaternion();
        for (let i = 0; i < columns.count; i++) {
          columns.getMatrixAt(i, m);
          m.premultiply(columns.matrixWorld);
          m.decompose(p, qq, s);
          const g = ground(p.x, p.z);
          expect(p.y - s.y / 2).toBeLessThanOrEqual(g + 0.01);
          expect(p.y + s.y / 2).toBeGreaterThan(g + 3);
        }
      });

      it('keeps the canopy roof level (photos) instead of following the ground, with a flat walkway under it', () => {
        const shell = result.group.getObjectByName('centenary-canopy-shell');
        const deck = result.group.getObjectByName('centenary-canopy-deck');
        if (!shell || !deck) throw new Error('canopy parts missing');
        const box = new THREE.Box3().setFromObject(shell);
        // 高さの幅は断面の円弧と板の厚みだけ（地面の傾きに沿うと 3m 以上になる）
        expect(box.max.y - box.min.y).toBeLessThan(1.3);
        // 床の上面は屋根の下端より 3m 以上下で、広場（北の端）の地面より下がらない
        const deckBox = new THREE.Box3().setFromObject(deck);
        expect(box.min.y - deckBox.max.y).toBeGreaterThan(3);
        expect(deckBox.max.y).toBeGreaterThanOrEqual(ground(-227.2, 408.9) - 0.5);
      });
    });
  }

  it('faces the barrel-vault gable north, at the end of the canopy', () => {
    const result = buildCentenary({ building, groundVisualY: GROUND_Y, sampleGroundVisualY: () => GROUND_Y });
    result.group.updateMatrixWorld(true);
    const extrudes = meshesOf(result).filter(
      (mesh) =>
        mesh.geometry instanceof THREE.ExtrudeGeometry &&
        (mesh.material as THREE.MeshStandardMaterial).color?.getHexString?.() === '78a59c',
    );
    // ホールの屋根と車寄せの屋根（どちらも円弧の断面の押し出し）
    expect(extrudes.length).toBe(2);
    const boxes = extrudes.map((mesh) => new THREE.Box3().setFromObject(mesh));
    const [canopyBox, hallRoofBox] = [...boxes].sort((a, b) => a.min.z - b.min.z);
    // 車寄せは北（z が小さい）にあり、ホールの屋根の北の端までつながる
    expect(canopyBox!.max.z).toBeGreaterThan(hallRoofBox!.min.z - 2);
    // ホールの屋根は輪郭の北の切り欠き（z ≈ 431〜437）から始まり、建物の頂部になる
    expect(hallRoofBox!.min.z).toBeGreaterThan(425);
    expect(hallRoofBox!.min.z).toBeLessThan(440);
    expect(hallRoofBox!.max.y).toBeGreaterThan(GROUND_Y + 11);
  });
});
