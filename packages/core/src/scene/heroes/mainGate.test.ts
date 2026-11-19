import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildMainGate } from './mainGate';

function createMainGateBuilding(): BuildingFeature {
  const cx = -127.7;
  const cz = 119.2;
  const radius = 4.5;
  const polygon: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    polygon.push([cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius]);
  }

  return {
    id: 'main-gate',
    landmarkId: 'main-gate',
    name: '関西大学 正門',
    shortName: '正門',
    kana: 'せいもん',
    englishName: 'Main Gate',
    category: 'gate',
    inCampus: true,
    faculties: ['メインエントランス'],
    facilityTags: ['gate'],
    keywords: ['正門'],
    description: '',
    sculptStyle: 'main-gate',
    labelPriority: 1,
    isSpotOnly: true,
    polygon,
    centroid: { x: cx, z: cz },
    groundY: 37.08,
    minGroundY: 37.08,
    maxGroundY: 37.08,
    height: 5.2,
    levels: 1,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

describe('buildMainGate', () => {
  const groundVisualY = 12.5;
  const building = createMainGateBuilding();

  it('builds a group with at least one mesh and stays lightweight', () => {
    const result = buildMainGate({ building, groundVisualY });
    let meshCount = 0;
    result.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshCount += 1;
      }
    });

    expect(meshCount).toBeGreaterThanOrEqual(1);
    expect(meshCount).toBeLessThanOrEqual(150);
  });

  it('produces only finite vertex coordinates (no NaN or Infinity)', () => {
    const result = buildMainGate({ building, groundVisualY });
    let checkedVertices = 0;

    result.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const pos = obj.geometry.getAttribute('position');
      expect(pos).toBeDefined();
      if (!pos) return;

      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i))).toBe(true);
        expect(Number.isFinite(pos.getY(i))).toBe(true);
        expect(Number.isFinite(pos.getZ(i))).toBe(true);
        checkedVertices += 1;
      }

      if (obj instanceof THREE.InstancedMesh) {
        for (const value of obj.instanceMatrix.array) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    });

    expect(checkedVertices).toBeGreaterThan(0);
  });

  it('fits its world bounding box within the specified main-gate bounds', () => {
    const result = buildMainGate({ building, groundVisualY });
    result.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(result.group);

    expect(box.isEmpty()).toBe(false);
    expect(box.min.x).toBeGreaterThanOrEqual(-150);
    expect(box.max.x).toBeLessThanOrEqual(-80);
    expect(box.min.z).toBeGreaterThanOrEqual(95);
    expect(box.max.z).toBeLessThanOrEqual(145);
    expect(box.min.y).toBeGreaterThanOrEqual(groundVisualY - 1);
    expect(box.max.y).toBeLessThanOrEqual(groundVisualY + 22);
  });

  it('returns bridge and monument stone as primaryMaterials and empty animated array', () => {
    const result = buildMainGate({ building, groundVisualY });

    expect(result.primaryMaterials.length).toBeGreaterThanOrEqual(1);
    expect(result.primaryMaterials).toHaveLength(2);
    expect(result.primaryMaterials.map((entry) => entry.baseHex)).toEqual([
      '#CFC3A6',
      '#C8C2B7',
    ]);
    expect(result.animated).toEqual([]);
  });
});
