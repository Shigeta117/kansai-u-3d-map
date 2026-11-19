import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SENRIYAMA_CONFIG } from '../data/campuses/senriyama/config';
import type { TerrainGrid } from '../domain/types';
import { isBuildingWithinDiorama } from './BuildingBuilder';
import {
  buildDioramaBaseGroup,
  createDioramaClippingPlanes,
  sampleTerrainMeshElevation,
} from './DioramaBaseBuilder';
import { LightingRig } from './LightingRig';

describe('DioramaBaseBuilder & diorama helpers', () => {
  it('creates 4 inward-facing clipping planes matching diorama bounds', () => {
    const planes = createDioramaClippingPlanes(SENRIYAMA_CONFIG.diorama);
    expect(planes).toHaveLength(4);

    const isKept = (x: number, y: number, z: number): boolean => {
      const pt = new THREE.Vector3(x, y, z);
      return planes.every((plane) => plane.distanceToPoint(pt) >= 0);
    };

    expect(isKept(0, 20, 0)).toBe(true);
    expect(isKept(-480, 0, -350)).toBe(true);
    expect(isKept(530, 0, 565)).toBe(true);
    expect(isKept(-481, 0, 0)).toBe(false);
    expect(isKept(531, 0, 0)).toBe(false);
    expect(isKept(0, 0, -351)).toBe(false);
    expect(isKept(0, 0, 566)).toBe(false);
  });

  it('samples terrain elevation using PlaneGeometry triangulation', () => {
    const grid: TerrainGrid = {
      cols: 2,
      rows: 2,
      minX: 0,
      maxX: 10,
      minZ: 0,
      maxZ: 10,
      minElevation: 10,
      maxElevation: 50,
      elevations: [10, 20, 20, 50],
    };

    expect(sampleTerrainMeshElevation(grid, 0, 0)).toBeCloseTo(10, 5);
    expect(sampleTerrainMeshElevation(grid, 10, 0)).toBeCloseTo(20, 5);
    expect(sampleTerrainMeshElevation(grid, 0, 10)).toBeCloseTo(20, 5);
    expect(sampleTerrainMeshElevation(grid, 10, 10)).toBeCloseTo(50, 5);
    expect(sampleTerrainMeshElevation(grid, 2.5, 2.5)).toBeCloseTo(15, 5);
    expect(sampleTerrainMeshElevation(grid, 5, 5)).toBeCloseTo(20, 5);
    expect(sampleTerrainMeshElevation(grid, 7.5, 7.5)).toBeCloseTo(35, 5);
  });

  it('builds sides, rim, and bottom excluded from clipping and without cast shadows', () => {
    const terrain: TerrainGrid = {
      cols: 3,
      rows: 3,
      minX: -30,
      maxX: 30,
      minZ: -30,
      maxZ: 30,
      minElevation: 10,
      maxElevation: 30,
      elevations: [10, 20, 30, 15, 20, 25, 10, 15, 20],
    };
    const config = {
      ...SENRIYAMA_CONFIG,
      diorama: {
        minX: -20,
        maxX: 20,
        minZ: -16,
        maxZ: 16,
        baseDepth: 10,
      },
    };

    const group = buildDioramaBaseGroup(terrain, config);
    expect(group.name).toBe('diorama-base');
    expect(group.userData?.excludeFromClipping).toBe(true);

    const sides = group.getObjectByName('diorama-sides');
    const rim = group.getObjectByName('diorama-rim');
    const bottom = group.getObjectByName('diorama-bottom');

    expect(sides).toBeInstanceOf(THREE.Mesh);
    expect(rim).toBeInstanceOf(THREE.Mesh);
    expect(bottom).toBeInstanceOf(THREE.Mesh);

    if (
      !(sides instanceof THREE.Mesh) ||
      !(rim instanceof THREE.Mesh) ||
      !(bottom instanceof THREE.Mesh)
    ) {
      return;
    }

    expect(sides.castShadow).toBe(false);
    expect(rim.castShadow).toBe(false);
    expect(bottom.castShadow).toBe(false);
    expect(sides.userData?.excludeFromClipping).toBe(true);
    expect(rim.userData?.excludeFromClipping).toBe(true);
    expect(bottom.userData?.excludeFromClipping).toBe(true);

    expect(sides.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    if (sides.material instanceof THREE.MeshStandardMaterial) {
      expect(sides.material.vertexColors).toBe(true);
    }

    const bottomPos = bottom.geometry.getAttribute('position');
    expect(bottomPos.count).toBe(4);
    for (let i = 0; i < bottomPos.count; i++) {
      expect(bottomPos.getY(i)).toBeCloseTo(-10, 5);
    }

    const sidesPos = sides.geometry.getAttribute('position');
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < sidesPos.count; i++) {
      const y = sidesPos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    expect(minY).toBeCloseTo(-10, 5);
    expect(maxY).toBeGreaterThan(0);
  });

  it('omits buildings with any polygon vertex outside the diorama footprint', () => {
    const diorama = SENRIYAMA_CONFIG.diorama;

    expect(
      isBuildingWithinDiorama(
        {
          polygon: [
            [-100, -100],
            [100, -100],
            [100, 100],
            [-100, 100],
          ],
          centroid: { x: 0, z: 0 },
        },
        diorama,
      ),
    ).toBe(true);

    expect(
      isBuildingWithinDiorama(
        {
          polygon: [
            [-475, 100],
            [-485, 100],
            [-485, 110],
            [-475, 110],
          ],
          centroid: { x: -480, z: 105 },
        },
        diorama,
      ),
    ).toBe(false);

    expect(
      isBuildingWithinDiorama(
        {
          polygon: [
            [0, 550],
            [10, 550],
            [10, 570],
            [0, 570],
          ],
          centroid: { x: 5, z: 560 },
        },
        diorama,
      ),
    ).toBe(false);

    expect(
      isBuildingWithinDiorama(
        { polygon: [], centroid: { x: -403, z: 327 } },
        diorama,
      ),
    ).toBe(true);

    expect(
      isBuildingWithinDiorama(
        { polygon: [], centroid: { x: -490, z: 327 } },
        diorama,
      ),
    ).toBe(false);
  });

  it('disables scene fog for both day and golden themes', () => {
    const rig = new LightingRig(false);
    const scene = new THREE.Scene();

    rig.applyTheme('day', scene);
    expect(scene.fog).toBeNull();
    expect(scene.background).toBeInstanceOf(THREE.Color);

    rig.applyTheme('golden', scene);
    expect(scene.fog).toBeNull();
    expect(scene.background).toBeInstanceOf(THREE.Color);
  });
});
