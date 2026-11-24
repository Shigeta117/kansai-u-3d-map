import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyClosures, type CampusClosuresData } from '../domain/closures';
import { getCampusConfig } from '../domain/campus-registry';
import { computeVisualY } from '../domain/projection';
import type { BuildingFeature, TerrainGrid, WalkGraph } from '../domain/types';
import { applyBuildingVisualStates, buildBuildingsGroup, offsetPolygon } from './BuildingBuilder';
import { buildConstructionGroup, FENCE_HEIGHT_M } from './ConstructionBuilder';
import { sampleTerrainMeshElevation } from './DioramaBaseBuilder';

function readData<T>(file: string): T {
  const url = new URL(`../../../../public/data/senriyama/${file}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

describe('工事の範囲の見せ方', () => {
  const terrain = readData<TerrainGrid>('terrain.json');
  const { closures } = readData<CampusClosuresData>('closures.json');
  const config = getCampusConfig('senriyama');
  const built = buildConstructionGroup(closures, terrain, config);

  it('stands 3m white panels along every fence line, in materials that can be batched', () => {
    const panels = built.fences.getObjectByName('construction-fence-panels') as THREE.Mesh;
    expect(panels).toBeInstanceOf(THREE.Mesh);
    const mat = panels.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(false);
    expect(mat.side).toBe(THREE.FrontSide);
    const pos = panels.geometry.getAttribute('position');
    let tops = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const g = computeVisualY(sampleTerrainMeshElevation(terrain, x, z), terrain.minElevation, config.verticalExaggeration);
      const h = pos.getY(i) - g;
      if (h > 0) {
        tops++;
        expect(h).toBeCloseTo(FENCE_HEIGHT_M, 3);
      }
    }
    expect(tops).toBeGreaterThan(100);
    expect(built.fences.getObjectByName('construction-fence-posts')).toBeInstanceOf(THREE.Mesh);
  });

  it('lays the ground hatch as one transparent mesh over the area', () => {
    expect(built.hatch).toHaveLength(closures.length);
    const mat = built.hatch[0]!.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('wraps 3号館（旧館） in a grey sheet and fades the other buildings inside the area', () => {
    const { buildings } = applyClosures(readData<WalkGraph>('walk-graph.json'), readData<BuildingFeature[]>('buildings.json'), closures);
    const ids = ['way_624589997', 'way_624589994', 'way_819790904', 'way_624590000'];
    const result = buildBuildingsGroup(
      buildings.filter((b) => ids.includes(b.id)),
      terrain.minElevation,
      config,
      { terrain, mergeStaticParts: false },
    );
    const kyukan = result.campusRecords.get('way_624589997')!;
    const wall = kyukan.primaryMaterials[kyukan.primaryMaterials.length - 1]!;
    // 灰色（彩度の低い色）。屋根も灰色で、屋根の色の切り替えでも変わらない
    expect(new THREE.Color(wall.baseHex).getHSL({ h: 0, s: 0, l: 0 }).s).toBeLessThan(0.08);
    expect(kyukan.roofColors?.area).toBe(kyukan.roofColors?.aerial);
    // シートは足場の分だけ建物より高い
    const groundY = computeVisualY(buildings.find((b) => b.id === 'way_624589997')!.groundY, terrain.minElevation, config.verticalExaggeration);
    let top = -Infinity;
    kyukan.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.computeBoundingBox();
        top = Math.max(top, o.geometry.boundingBox!.max.y);
      }
    });
    expect(top - groundY).toBeGreaterThan(16.6 + 1);

    applyBuildingVisualStates(result.campusRecords, null, 'all');
    const lightness = (id: string) => {
      const rec = result.campusRecords.get(id)!;
      const e = rec.primaryMaterials[rec.primaryMaterials.length - 1]!;
      return {
        now: e.mat.color.getHSL({ h: 0, s: 0, l: 0 }).l,
        base: new THREE.Color(e.baseHex).getHSL({ h: 0, s: 0, l: 0 }).l,
      };
    };
    const tea = lightness('way_819790904');
    expect(tea.now).toBeGreaterThan(tea.base);
    const nibukan = lightness('way_624589994');
    expect(nibukan.now).toBeGreaterThan(nibukan.base);
    // 範囲の外の有鄰館は薄めない
    const yurin = lightness('way_624590000');
    expect(yurin.now).toBeCloseTo(yurin.base, 5);
  });

  it('offsets an outline outwards by the given distance', () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(offsetPolygon(square, 1)).toEqual([
      [-1, -1],
      [11, -1],
      [11, 11],
      [-1, 11],
    ]);
    expect(offsetPolygon([...square].reverse(), 1)[0]).toEqual([-1, 11]);
  });
});
