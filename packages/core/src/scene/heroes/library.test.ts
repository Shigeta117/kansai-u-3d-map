import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildLibrary } from './library';

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
      });

      result.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(result.group);

      expect(box.isEmpty()).toBe(false);
      expect(box.min.x).toBeGreaterThanOrEqual(-95);
      expect(box.max.x).toBeLessThanOrEqual(40);
      expect(box.min.z).toBeGreaterThanOrEqual(0);
      expect(box.max.z).toBeLessThanOrEqual(125);
      expect(box.min.y).toBeGreaterThanOrEqual(groundVisualY - 5);
      expect(box.max.y).toBeLessThanOrEqual(groundVisualY + 20);
      // 3 階建て＋基壇として、誤った OSM 高さ（9m）より十分に高いことを確認
      expect(box.max.y).toBeGreaterThan(groundVisualY + 15);
    },
  );
});
