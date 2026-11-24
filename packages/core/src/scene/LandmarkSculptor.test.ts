import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../domain/types';
import { rotatedBoxInsidePolygon, sculptLandmarkDetails } from './LandmarkSculptor';

const buildings = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'public/data/senriyama/buildings.json'), 'utf8'),
) as BuildingFeature[];

function pointInRing(x: number, z: number, ring: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

describe('第4学舎の白い棟の屋上の塔屋の箱（area4-white-lab）', () => {
  const labs = buildings.filter((b) => b.sculptStyle === 'area4-white-lab');

  it('keeps the box only where it fits inside the outline (第4学舎2号館 encloses a courtyard, so its centroid is outside)', () => {
    expect(labs.map((b) => b.id).sort()).toEqual(['area4-1', 'area4-2', 'area4-4', 'hitech-core'].sort());
    const withBox = labs.filter((b) => sculptLandmarkDetails(b, 60, 40, '#ffffff').meshes.length > 0).map((b) => b.id);
    expect(withBox.sort()).toEqual(['area4-1', 'area4-4', 'hitech-core'].sort());
  });

  it('puts every corner of the kept boxes inside the outline', () => {
    for (const b of labs) {
      const { meshes } = sculptLandmarkDetails(b, 60, 40, '#ffffff');
      for (const root of meshes) {
        root.updateMatrixWorld(true);
        const box = root.children[0];
        if (!(box instanceof THREE.Mesh)) throw new Error(`${b.id}: no penthouse box`);
        const pos = box.geometry.getAttribute('position');
        const p = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i).applyMatrix4(box.matrixWorld);
          expect(pointInRing(p.x, p.z, b.polygon), `${b.id} vertex ${i}`).toBe(true);
        }
      }
    }
  });

  it('checks the rotated box the same way as three rotates it', () => {
    const square: [number, number][] = [
      [-10, -2],
      [10, -2],
      [10, 2],
      [-10, 2],
    ];
    expect(rotatedBoxInsidePolygon(square, 0, 0, 0, 16, 3)).toBe(true);
    // 90° 回すと長い辺が z の向きになり、はみ出す
    expect(rotatedBoxInsidePolygon(square, 0, 0, Math.PI / 2, 16, 3)).toBe(false);
  });
});
