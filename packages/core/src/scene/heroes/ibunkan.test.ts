import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildIbunkan } from './ibunkan';
import type { HeroBuildResult } from './types';

/** buildings.json の ibunkan（2026-11-19 生成）の輪郭 */
const IBUNKAN_POLYGON: [number, number][] = [
  [-105.52, -5.29],
  [-92.5, -96.3],
  [-69.15, -92.98],
  [-74.87, -52.93],
  [-79.84, -18.18],
  [-82.17, -1.97],
  [-86.88, -2.65],
];

function createIbunkanFeature(): BuildingFeature {
  return {
    id: 'ibunkan',
    name: '以文館',
    shortName: '以文館',
    kana: 'いぶんかん',
    englishName: 'Ibunkan',
    category: 'shared',
    inCampus: true,
    faculties: [],
    facilityTags: ['cafeteria', 'study', 'architecture'],
    keywords: [],
    description: '',
    sculptStyle: 'ibunkan-octagonal-domes',
    labelPriority: 4,
    polygon: IBUNKAN_POLYGON,
    centroid: { x: -84.42, z: -38.61 },
    groundY: 50.64,
    minGroundY: 48.79,
    maxGroundY: 53.04,
    height: 12.8,
    levels: 3,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

const GROUND_Y = 49.3;
/** 実データに近い傾き: 北東が高く南西が低い（輪郭の中で約 6m の差） */
const slopedGround = (x: number, z: number): number => GROUND_Y + 0.08 * (x + 87) - 0.03 * (z + 49);

function outlineBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const xs = IBUNKAN_POLYGON.map(([x]) => x);
  const zs = IBUNKAN_POLYGON.map(([, z]) => z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

function meshesOf(result: HeroBuildResult): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  result.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });
  return meshes;
}

describe('buildIbunkan', () => {
  const building = createIbunkanFeature();

  for (const [label, ground] of [
    ['flat ground', (): number => GROUND_Y],
    ['sloped ground', slopedGround],
  ] as const) {
    describe(`on ${label}`, () => {
      const result = buildIbunkan({ building, groundVisualY: GROUND_Y, sampleGroundVisualY: ground });
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
        expect(box.isEmpty()).toBe(false);
        expect(box.min.x).toBeGreaterThanOrEqual(b.minX - 20);
        expect(box.max.x).toBeLessThanOrEqual(b.maxX + 20);
        expect(box.min.z).toBeGreaterThanOrEqual(b.minZ - 20);
        expect(box.max.z).toBeLessThanOrEqual(b.maxZ + 20);
        expect(box.min.y).toBeGreaterThanOrEqual(GROUND_Y - 5);
        expect(box.max.y).toBeLessThanOrEqual(GROUND_Y + 60);
      });

      it('sinks its bottom below the lowest ground under the outline', () => {
        const box = new THREE.Box3().setFromObject(result.group);
        let lowest = Infinity;
        for (const [x, z] of IBUNKAN_POLYGON) lowest = Math.min(lowest, ground(x, z));
        expect(box.min.y).toBeLessThanOrEqual(lowest - 0.5 + 1e-6);
      });

      it('returns brick, slate roof and dome as primary materials', () => {
        expect(result.primaryMaterials.map((p) => p.baseHex)).toEqual(['#B4623F', '#4A5466', '#2F4170']);
        expect(result.animated).toEqual([]);
      });
    });
  }

  it('puts the two octagonal towers at the north-east and south-east corners', () => {
    const result = buildIbunkan({ building, groundVisualY: GROUND_Y, sampleGroundVisualY: () => GROUND_Y });
    result.group.updateMatrixWorld(true);
    const domeCenters: THREE.Vector3[] = [];
    result.group.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        obj.geometry instanceof THREE.SphereGeometry &&
        (obj.material as THREE.MeshStandardMaterial).color.getHexString() === '2f4170'
      ) {
        domeCenters.push(new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld));
      }
    });
    expect(domeCenters).toHaveLength(2);
    const [north, south] = [...domeCenters].sort((a, b) => a.z - b.z);
    // 北東の角 (-69.15, -92.98)・南東の角 (-82.17, -1.97) から 8m 以内
    expect(Math.hypot(north!.x + 69.15, north!.z + 92.98)).toBeLessThan(8);
    expect(Math.hypot(south!.x + 82.17, south!.z + 1.97)).toBeLessThan(8);
    // ドームは主棟の屋根より高い
    expect(north!.y).toBeGreaterThan(GROUND_Y + 15);
  });
});
