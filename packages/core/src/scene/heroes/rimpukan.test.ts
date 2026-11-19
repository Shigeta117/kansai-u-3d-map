import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildRimpukan } from './rimpukan';

const RIMPUKAN_POLYGON: [number, number][] = [
  [99, 24],
  [99, 16],
  [101, 9],
  [108, -8],
  [124, -37],
  [152, -12],
  [154, -14],
  [166, -24],
  [169, -20],
  [191, -45],
  [200, -35],
  [167, -6],
  [142, 15],
  [117, 28],
  [110, 30],
  [105, 31],
  [100, 28],
];

function createRimpukanFeature(): BuildingFeature {
  return {
    id: 'rimpukan',
    name: '凜風館（総合学生会館）',
    shortName: '凜風館',
    kana: 'りんぷうかん',
    englishName: 'Rimpukan',
    category: 'shared',
    inCampus: true,
    faculties: [],
    facilityTags: ['cafeteria', 'study'],
    keywords: [],
    description: '',
    sculptStyle: 'rimpukan-green-roof',
    labelPriority: 10,
    polygon: RIMPUKAN_POLYGON,
    centroid: { x: 135.6, z: -1.2 },
    groundY: 40.88,
    minGroundY: 40.75,
    maxGroundY: 41.95,
    height: 16.6,
    levels: 4,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

describe('buildRimpukan', () => {
  const groundVisualY = 12.5;
  const result = buildRimpukan({
    building: createRimpukanFeature(),
    groundVisualY,
  });

  it('produces at least one mesh and stays well within the mesh budget', () => {
    const meshes: THREE.Mesh[] = [];
    result.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshes.push(obj);
      }
    });

    expect(meshes.length).toBeGreaterThanOrEqual(1);
    expect(meshes.length).toBeLessThanOrEqual(150);
  });

  it('has strictly finite vertex coordinates and instance matrices', () => {
    let checkedVertices = 0;

    result.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const pos = obj.geometry.getAttribute('position');
      expect(pos).toBeDefined();
      if (!pos) return;
      expect(pos.count).toBeGreaterThan(0);

      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i))).toBe(true);
        expect(Number.isFinite(pos.getY(i))).toBe(true);
        expect(Number.isFinite(pos.getZ(i))).toBe(true);
        checkedVertices++;
      }

      if (obj instanceof THREE.InstancedMesh) {
        const arr = obj.instanceMatrix.array;
        for (let i = 0; i < arr.length; i++) {
          expect(Number.isFinite(arr[i])).toBe(true);
        }
      }
    });

    expect(checkedVertices).toBeGreaterThan(0);
  });

  it('fits within the expected bounding box around Rimpukan', () => {
    result.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(result.group);

    expect(box.isEmpty()).toBe(false);
    expect(Number.isFinite(box.min.x)).toBe(true);
    expect(Number.isFinite(box.max.x)).toBe(true);
    expect(Number.isFinite(box.min.y)).toBe(true);
    expect(Number.isFinite(box.max.y)).toBe(true);
    expect(Number.isFinite(box.min.z)).toBe(true);
    expect(Number.isFinite(box.max.z)).toBe(true);

    expect(box.min.x).toBeGreaterThanOrEqual(85);
    expect(box.max.x).toBeLessThanOrEqual(205);
    expect(box.min.z).toBeGreaterThanOrEqual(-50);
    expect(box.max.z).toBeLessThanOrEqual(45);
    expect(box.min.y).toBeGreaterThanOrEqual(groundVisualY);
    expect(box.max.y).toBeLessThanOrEqual(groundVisualY + 24);
  });

  it('exposes exterior wall and 1F glass as primaryMaterials with no animated objects', () => {
    expect(result.primaryMaterials.length).toBeGreaterThanOrEqual(1);
    expect(result.primaryMaterials).toHaveLength(2);
    expect(result.primaryMaterials.map((m) => m.baseHex)).toEqual(['#8A5641', '#4F6670']);
    for (const entry of result.primaryMaterials) {
      expect(entry.mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    }
    expect(result.animated).toEqual([]);
  });

  it('populates instanced sakura orchard, columns, steps, and west roof poles', () => {
    const crowns = result.group.getObjectByName('rimpukan-sakura-crowns');
    const trunks = result.group.getObjectByName('rimpukan-sakura-trunks');
    const squareCols = result.group.getObjectByName('rimpukan-columns-square');
    const roundCols = result.group.getObjectByName('rimpukan-columns-round');
    const steps = result.group.getObjectByName('rimpukan-stairs-steps');
    const poles = result.group.getObjectByName('rimpukan-roof-poles');

    expect(crowns).toBeInstanceOf(THREE.InstancedMesh);
    expect(trunks).toBeInstanceOf(THREE.InstancedMesh);
    expect(squareCols).toBeInstanceOf(THREE.InstancedMesh);
    expect(roundCols).toBeInstanceOf(THREE.InstancedMesh);
    expect(steps).toBeInstanceOf(THREE.InstancedMesh);
    expect(poles).toBeInstanceOf(THREE.InstancedMesh);

    if (crowns instanceof THREE.InstancedMesh && trunks instanceof THREE.InstancedMesh) {
      expect(crowns.count).toBeGreaterThanOrEqual(60);
      expect(crowns.count).toBeLessThanOrEqual(120);
      expect(trunks.count).toBe(crowns.count);
    }
    if (squareCols instanceof THREE.InstancedMesh) {
      expect(squareCols.count).toBeGreaterThan(15);
    }
    if (roundCols instanceof THREE.InstancedMesh) {
      expect(roundCols.count).toBeGreaterThanOrEqual(1);
      expect(roundCols.count).toBeLessThanOrEqual(2);
    }
    if (steps instanceof THREE.InstancedMesh) {
      expect(steps.count).toBe(24);
    }
    if (poles instanceof THREE.InstancedMesh) {
      expect(poles.count).toBe(6);
    }
  });
});
