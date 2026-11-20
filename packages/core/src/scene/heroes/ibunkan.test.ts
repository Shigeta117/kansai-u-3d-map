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
        expect(result.primaryMaterials.map((p) => p.baseHex)).toEqual(['#98654F', '#3A4560', '#2F4170']);
        expect(result.animated).toEqual([]);
      });
    });
  }

  describe('the arched passage (OSM way 490801252, tunnel=yes)', () => {
    /** 通路の西の口（関大前駅の側）と東の口（尚文館の側）。paths.json の道がここで終わる */
    const WEST: [number, number] = [-101.11, -36.93];
    const EAST: [number, number] = [-77.3, -34.96];

    for (const [label, ground] of [
      ['flat ground', (): number => GROUND_Y],
      ['sloped ground', slopedGround],
    ] as const) {
      describe(`on ${label}`, () => {
        const result = buildIbunkan({ building, groundVisualY: GROUND_Y, sampleGroundVisualY: ground });
        result.group.updateMatrixWorld(true);
        const dir = new THREE.Vector3(EAST[0] - WEST[0], 0, EAST[1] - WEST[1]).normalize();
        const highFloor = Math.max(ground(...WEST), ground(...EAST));

        const firstHitAlong = (offsetAlongLongAxis: number): number | null => {
          // 長手（南北から約 8° 傾く）の向きにずらした、通路と平行な水平の線
          const along = new THREE.Vector3(-0.1416, 0, 0.9899).multiplyScalar(offsetAlongLongAxis);
          const origin = new THREE.Vector3(WEST[0], highFloor + 1.5, WEST[1])
            .addScaledVector(dir, -8)
            .add(along);
          const ray = new THREE.Raycaster(origin, dir, 0, 40);
          const hits = ray.intersectObject(result.group, true);
          return hits[0]?.distance ?? null;
        };

        it('is open from the west face to the east face at walking height', () => {
          expect(firstHitAlong(0)).toBeNull();
        });

        it('is closed (solid brick) a little north of the passage', () => {
          const d = firstHitAlong(-15);
          expect(d).not.toBeNull();
          // 西の口の 8m 手前から出発して、西の面（約 8m 先）で当たる
          expect(d!).toBeLessThan(10);
        });

        it('lays its floor from the west mouth to the east mouth, meeting the ground there', () => {
          let floorMesh: THREE.Mesh | undefined;
          result.group.traverse((obj) => {
            if (obj instanceof THREE.Mesh && obj.name === 'ibunkan-passage-floor') floorMesh = obj;
          });
          expect(floorMesh).toBeDefined();
          // 口の点の真上から下へ線を落とし、床（坂の両端）に当たる高さが地面とそろうか
          for (const [mouth, inward] of [
            [WEST, 1],
            [EAST, -1],
          ] as const) {
            const origin = new THREE.Vector3(mouth[0], GROUND_Y + 40, mouth[1]).addScaledVector(dir, 0.3 * inward);
            const hit = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0)).intersectObject(floorMesh!)[0];
            expect(hit).toBeDefined();
            expect(Math.abs(hit!.point.y - ground(mouth[0], mouth[1]))).toBeLessThan(0.6);
          }
        });
      });
    }
  });

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

  it('keeps the tower window strips narrow grey stone (not wide white bands) and the wall window frames thin', () => {
    const result = buildIbunkan({ building, groundVisualY: GROUND_Y, sampleGroundVisualY: () => GROUND_Y });
    const boxes = meshesOf(result).filter(
      (mesh): mesh is THREE.InstancedMesh => mesh instanceof THREE.InstancedMesh && mesh.geometry instanceof THREE.BoxGeometry,
    );
    const scaleOf = (mesh: THREE.InstancedMesh, i: number): THREE.Vector3 => {
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const s = new THREE.Vector3();
      const q = new THREE.Quaternion();
      mesh.getMatrixAt(i, m);
      m.decompose(p, q, s);
      return s;
    };
    const hexOf = (mesh: THREE.Mesh): string => (mesh.material as THREE.MeshStandardMaterial).color.getHexString();
    // 塔の縦枠: 2 塔 × 8 面、背の高い板（高さ 10m 超）
    const strips = boxes.find((mesh) => mesh.count === 16 && scaleOf(mesh, 0).y > 10);
    if (!strips) throw new Error('tower strips missing');
    // 白（見切りの #E2DED6）ではなく灰色の石
    expect(hexOf(strips)).not.toBe('e2ded6');
    const c = (strips.material as THREE.MeshStandardMaterial).color;
    expect(Math.max(c.r, c.g, c.b)).toBeLessThan(0.5);
    for (let i = 0; i < strips.count; i++) expect(scaleOf(strips, i).x).toBeLessThanOrEqual(0.85);
    // 壁の窓の白い枠（見切りと同じ材質の、窓の数だけ並ぶ板）。枠の見付けは 0.1m 以下
    const frames = boxes.find((mesh) => hexOf(mesh) === 'e2ded6' && mesh.count > 50);
    if (!frames) throw new Error('window frames missing');
    const s = scaleOf(frames, 0);
    const frameWidth = Math.max(s.x, s.z);
    expect((frameWidth - 1.2) / 2).toBeGreaterThan(0);
    expect((frameWidth - 1.2) / 2).toBeLessThanOrEqual(0.1);
  });
});
