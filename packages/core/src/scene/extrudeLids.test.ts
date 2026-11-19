import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getCampusConfig } from '../domain/campus-registry';
import type { BuildingFeature, TerrainGrid } from '../domain/types';
import { buildBuildingsGroup } from './BuildingBuilder';
import { ensureExtrudeLids } from './extrudeLids';

function readData<T>(file: string): T {
  const url = new URL(`../../../../public/data/senriyama/${file}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

/** 法線の y 成分で分けた三角形の面積（上向き・下向き） */
function facingAreas(geo: THREE.BufferGeometry): { up: number; down: number } {
  const pos = geo.getAttribute('position');
  const idx = geo.index;
  const n = idx ? idx.count : pos.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let up = 0;
  let down = 0;
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, idx ? idx.getX(i) : i);
    b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1);
    c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2);
    cross.crossVectors(b.clone().sub(a), c.clone().sub(a));
    const area = cross.length() / 2;
    const ny = cross.normalize().y;
    if (ny > 0.9) up += area;
    else if (ny < -0.9) down += area;
  }
  return { up, down };
}

function polygonArea(points: readonly [number, number][]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    if (!p || !q) continue;
    s += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(s) / 2;
}

describe('ensureExtrudeLids', () => {
  it('面取りなしの押し出しに屋根と底の蓋を足す（three r175 の不具合の補い）', () => {
    const shape = new THREE.Shape([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(4, 0),
      new THREE.Vector2(4, 3),
      new THREE.Vector2(0, 3),
    ]);
    const geo = ensureExtrudeLids(new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }), shape, 2);
    geo.rotateX(-Math.PI / 2);
    const { up, down } = facingAreas(geo);
    expect(up).toBeCloseTo(12, 5);
    expect(down).toBeCloseTo(12, 5);
    expect(geo.groups[0]).toMatchObject({ start: 0, materialIndex: 0 });
    expect(geo.groups[0]?.count).toBeGreaterThan(0);
    expect(geo.groups[1]?.materialIndex).toBe(1);
  });

  it('穴のある輪郭では穴を空けて蓋を張り、bottom: false なら底を張らない', () => {
    const shape = new THREE.Shape([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(10, 0),
      new THREE.Vector2(10, 10),
      new THREE.Vector2(0, 10),
    ]);
    shape.holes.push(
      new THREE.Path([new THREE.Vector2(3, 3), new THREE.Vector2(3, 7), new THREE.Vector2(7, 7), new THREE.Vector2(7, 3)]),
    );
    const geo = ensureExtrudeLids(
      new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: false }),
      shape,
      5,
      { bottom: false },
    );
    geo.rotateX(-Math.PI / 2);
    const { up, down } = facingAreas(geo);
    expect(up).toBeCloseTo(100 - 16, 5);
    expect(down).toBe(0);
  });

  it('蓋がすでにある（面取りあり）ならそのまま返す', () => {
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(0, 1)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelSegments: 1 });
    expect(ensureExtrudeLids(geo, shape, 1)).toBe(geo);
  });
});

describe('組み上げたシーンの押し出しの蓋', () => {
  const terrain = readData<TerrainGrid>('terrain.json');
  const buildings = readData<BuildingFeature[]>('buildings.json');
  const config = getCampusConfig('senriyama');
  const built = buildBuildingsGroup(buildings, terrain.minElevation, config, { terrain });

  it('周辺の建物に屋根がある（上向きの面の面積が輪郭の面積の合計とほぼ同じ）', () => {
    const mesh = built.root.getObjectByName('surrounding-buildings');
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    const { up, down } = facingAreas((mesh as THREE.Mesh).geometry);
    // 描かれた周辺の建物の輪郭の面積（台座の外・縁にかかる建物は描かれないので、上限として比べる）
    const footprintTotal = buildings
      .filter((b) => !b.inCampus && b.category === 'surrounding')
      .reduce((sum, b) => sum + polygonArea(b.polygon), 0);
    expect(up).toBeGreaterThan(footprintTotal * 0.5);
    expect(up).toBeLessThanOrEqual(footprintTotal * 1.01);
    expect(down).toBe(0);
  });

  it('蓋の無い ExtrudeGeometry が残っていない（見える端の面を自前で張っている百周年の 3 つを除く）', () => {
    const selfCapped = new Set(['centenary-vault-shell', 'centenary-canopy-shell', 'centenary-canopy-soffit']);
    const lidless: string[] = [];
    built.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const geo = obj.geometry as THREE.BufferGeometry;
      if (geo.type !== 'ExtrudeGeometry') return;
      const lid = geo.groups.find((g) => g.materialIndex === 0);
      if (lid && lid.count > 0) return;
      if (selfCapped.has(obj.name)) return;
      lidless.push(obj.name || obj.parent?.name || '(名前なし)');
    });
    expect(lidless).toEqual([]);
  });
});
