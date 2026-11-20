import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getCampusConfig } from '../domain/campus-registry';
import type { BuildingFeature, TerrainGrid } from '../domain/types';
import { buildBuildingsGroup } from './BuildingBuilder';
import { dropExtrudeBottomLid } from './extrudeLids';

function readData<T>(file: string): T {
  const url = new URL(`../../../../public/data/senriyama/${file}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

/** 法線の y 成分で分けた三角形の面積（上向き・下向き・それ以外） */
function facingAreas(geo: THREE.BufferGeometry): { up: number; down: number; side: number } {
  const pos = geo.getAttribute('position');
  const idx = geo.index;
  const n = idx ? idx.count : pos.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let up = 0;
  let down = 0;
  let side = 0;
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, idx ? idx.getX(i) : i);
    b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1);
    c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2);
    cross.crossVectors(b.clone().sub(a), c.clone().sub(a));
    const area = cross.length() / 2;
    const ny = cross.normalize().y;
    if (ny > 0.9) up += area;
    else if (ny < -0.9) down += area;
    else side += area;
  }
  return { up, down, side };
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

function rectShape(w: number, h: number): THREE.Shape {
  return new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(w, 0),
    new THREE.Vector2(w, h),
    new THREE.Vector2(0, h),
  ]);
}

describe('three の ExtrudeGeometry の蓋（r176 で面取りなしでも作るようになった）', () => {
  it('面取りなしの押し出しに屋根と底の蓋がある（three を r175 に戻すとここで落ちる）', () => {
    const geo = new THREE.ExtrudeGeometry(rectShape(4, 3), { depth: 2, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const { up, down } = facingAreas(geo);
    expect(up).toBeCloseTo(12, 5);
    expect(down).toBeCloseTo(12, 5);
    expect(geo.groups[0]).toMatchObject({ start: 0, materialIndex: 0 });
    expect(geo.groups[0]?.count).toBeGreaterThan(0);
    expect(geo.groups[1]?.materialIndex).toBe(1);
  });

  it('穴のある輪郭では穴を空けて蓋を張る', () => {
    const shape = rectShape(10, 10);
    shape.holes.push(
      new THREE.Path([new THREE.Vector2(3, 3), new THREE.Vector2(3, 7), new THREE.Vector2(7, 7), new THREE.Vector2(7, 3)]),
    );
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const { up, down } = facingAreas(geo);
    expect(up).toBeCloseTo(100 - 16, 5);
    expect(down).toBeCloseTo(100 - 16, 5);
  });
});

describe('dropExtrudeBottomLid', () => {
  it('底の蓋だけを外し、上の蓋と側面と uv は残す', () => {
    const original = new THREE.ExtrudeGeometry(rectShape(4, 3), { depth: 2, bevelEnabled: false });
    const before = facingAreas(original.clone().rotateX(-Math.PI / 2));
    const geo = dropExtrudeBottomLid(original);
    expect(geo).not.toBe(original);
    const lidCount = geo.groups[0]?.count ?? 0;
    expect(geo.groups[0]).toMatchObject({ start: 0, materialIndex: 0 });
    expect(geo.groups[1]).toMatchObject({ start: lidCount, materialIndex: 1 });
    expect(lidCount + (geo.groups[1]?.count ?? 0)).toBe(geo.getAttribute('position').count);
    expect(geo.getAttribute('uv').count).toBe(geo.getAttribute('position').count);
    geo.rotateX(-Math.PI / 2);
    const after = facingAreas(geo);
    expect(after.up).toBeCloseTo(12, 5);
    expect(after.down).toBe(0);
    expect(after.side).toBeCloseTo(before.side, 5);
  });

  it('index のあるジオメトリはそのまま返す', () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    expect(dropExtrudeBottomLid(box)).toBe(box);
  });
});

/** 三角形（ワールド座標）と、その法線・平面の位置 */
interface Tri {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  n: THREE.Vector3;
  d: number;
  owner: string;
}

function makeTri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, owner: string): Tri | null {
  const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
  if (n.lengthSq() < 1e-10) return null;
  n.normalize();
  return { a, b, c, n, d: n.dot(a), owner };
}

/** メッシュの三角形をワールド座標で集める（range を渡せばその頂点の範囲だけ） */
function worldTris(mesh: THREE.Mesh, range?: { start: number; count: number }): Tri[] {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const pos = geo.getAttribute('position');
  const idx = geo.index;
  const total = idx ? idx.count : pos.count;
  const start = range?.start ?? 0;
  const end = Math.min(total, start + (range?.count ?? total));
  const at = (i: number): THREE.Vector3 =>
    new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld);
  const out: Tri[] = [];
  for (let i = start; i + 2 < end; i += 3) {
    const t = makeTri(at(i), at(i + 1), at(i + 2), mesh.name || mesh.parent?.name || '(名前なし)');
    if (t) out.push(t);
  }
  return out;
}

describe('組み上げたシーンの押し出しの蓋', () => {
  const terrain = readData<TerrainGrid>('terrain.json');
  const buildings = readData<BuildingFeature[]>('buildings.json');
  const config = getCampusConfig('senriyama');
  // 部品をまとめると ExtrudeGeometry ではなくなり蓋の検査を素通りするので、まとめる前のメッシュで調べる
  const built = buildBuildingsGroup(buildings, terrain.minElevation, config, {
    terrain,
    mergeStaticParts: false,
  });
  built.root.updateMatrixWorld(true);

  const extrudes: THREE.Mesh[] = [];
  built.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && (obj.geometry as THREE.BufferGeometry).type === 'ExtrudeGeometry') {
      extrudes.push(obj);
    }
  });

  it('周辺の建物に屋根があり、地面の下の底は張らない（上向きの面の面積が輪郭の面積の合計とほぼ同じ）', () => {
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

  it('どの ExtrudeGeometry にも、輪郭の面積の 2 倍（上と下）の蓋がある（欠けた蓋・除外なし）', () => {
    expect(extrudes.length).toBeGreaterThan(20);
    const bad: string[] = [];
    for (const mesh of extrudes) {
      const geo = mesh.geometry as THREE.ExtrudeGeometry;
      const lid = geo.groups.find((g) => g.materialIndex === 0);
      const shapes = Array.isArray(geo.parameters.shapes) ? geo.parameters.shapes : [geo.parameters.shapes];
      const curveSegments = geo.parameters.options.curveSegments ?? 12;
      const outline = shapes.reduce((sum, shape) => {
        const { shape: contour, holes } = shape.extractPoints(curveSegments);
        return holes.reduce((s, h) => s - Math.abs(THREE.ShapeUtils.area(h)), sum + Math.abs(THREE.ShapeUtils.area(contour)));
      }, 0);
      // 蓋の三角形の面積（ジオメトリの座標。回転・移動しても面積は変わらない）
      const lidArea = lid
        ? worldTris(new THREE.Mesh(geo), lid).reduce(
            (s, t) => s + new THREE.Vector3().crossVectors(t.b.clone().sub(t.a), t.c.clone().sub(t.a)).length() / 2,
            0,
          )
        : 0;
      if (Math.abs(lidArea - 2 * outline) > 2 * outline * 0.001 + 1e-6) {
        bad.push(`${mesh.name || mesh.parent?.name || '(名前なし)'}: 蓋 ${lidArea.toFixed(3)} / 輪郭の 2 倍 ${(2 * outline).toFixed(3)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
