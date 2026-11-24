import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getCampusConfig } from '../domain/campus-registry';
import { computeVisualY } from '../domain/projection';
import type { BuildingFeature, TerrainGrid } from '../domain/types';
import { buildBuildingsGroup } from '../scene/BuildingBuilder';
import { heightForLevels } from './campuses/senriyama/building-facts';
import { SENRIYAMA_BUILDING_PARTS } from './campuses/senriyama/building-parts';
import { applyBuildingParts } from './loadCampusData';

function readData<T>(file: string): T {
  const url = new URL(`../../../../public/data/senriyama/${file}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

function area(poly: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]!;
    const [x2, z2] = poly[(i + 1) % poly.length]!;
    s += x1 * z2 - x2 * z1;
  }
  return Math.abs(s) / 2;
}

function inside(x: number, z: number, poly: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

describe('誠之館3号館（新館）の 3 つの塊', () => {
  const buildings = readData<BuildingFeature[]>('buildings.json');
  const terrain = readData<TerrainGrid>('terrain.json');
  const raw = buildings.find((b) => b.id === 'way_423067245');
  if (!raw) throw new Error('新館 missing');
  const [shinkan] = applyBuildingParts([raw]);
  const spec = SENRIYAMA_BUILDING_PARTS.find((s) => s.buildingId === 'way_423067245')!;

  it('splits into 5 / 4 / 3 storeys and reports the tallest as the building', () => {
    expect(shinkan?.parts?.map((p) => p.levels)).toEqual([5, 4, 3]);
    expect(shinkan?.parts?.map((p) => p.height)).toEqual([heightForLevels(5), heightForLevels(4), heightForLevels(3)]);
    expect(shinkan?.levels).toBe(5);
    expect(shinkan?.height).toBe(20.4);
  });

  it('covers exactly the OSM outline (areas add up, every part sits inside it)', () => {
    const total = spec.parts.reduce((s, p) => s + area(p.polygon), 0);
    expect(total).toBeCloseTo(area(raw.polygon), 0);
    for (const p of spec.parts) {
      const cx = p.polygon.reduce((s, q) => s + q[0], 0) / p.polygon.length;
      const cz = p.polygon.reduce((s, q) => s + q[1], 0) / p.polygon.length;
      expect(inside(cx, cz, raw.polygon)).toBe(true);
    }
  });

  it('draws each part at its own height but keeps it one pickable building', () => {
    const config = getCampusConfig('senriyama');
    const built = buildBuildingsGroup([shinkan!], terrain.minElevation, config, { terrain, mergeStaticParts: false });
    const rec = built.campusRecords.get('way_423067245');
    expect(rec).toBeDefined();
    const groundY = computeVisualY(raw.groundY, terrain.minElevation, config.verticalExaggeration);
    const tops = new Set<number>();
    rec!.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.buildingId !== 'way_423067245') return;
      o.geometry.computeBoundingBox();
      tops.add(Number((o.geometry.boundingBox!.max.y - groundY).toFixed(1)));
    });
    // 押し出しの面取り（0.25m）の分だけ上に出る
    const sorted = [...tops].sort((a, b) => b - a);
    expect(sorted).toHaveLength(3);
    [20.4, 16.6, 12.8].forEach((h, i) => {
      expect(sorted[i]! - h).toBeGreaterThanOrEqual(0);
      expect(sorted[i]! - h).toBeLessThan(0.4);
    });
    expect(built.interactiveMeshes.every((m) => m.userData.buildingId === 'way_423067245')).toBe(true);
  });
});
