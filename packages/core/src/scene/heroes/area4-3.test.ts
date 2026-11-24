import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature, CampusStructuresData } from '../../domain/types';
import {
  AREA43_CORNER_BLOCK,
  AREA43_ROOF_DECK_M,
  AREA43_SCREEN_TOP_M,
  AREA43_SE_OVERHANG_M,
  AREA43_SE_SPLIT_M,
  AREA43_SLAB_M,
  AREA43_STRIP,
  buildArea43,
} from './area4-3';
import { HERO_ROOF_DECKS } from './roofDecks';

type P2 = [number, number];

/** buildings.json の area4-3（way_423067232）の輪郭: 北・東・南・西の角 */
const POLYGON: P2[] = [
  [230.75, -107.59],
  [261.94, -74.24],
  [215.28, -32.37],
  [185.14, -65.3],
];
const WEST: P2 = [185.14, -65.3];
const AXIS_U: P2 = [0.73329, -0.6799];
const AXIS_V: P2 = [0.6799, 0.73329];
const toUV = (x: number, z: number): P2 => [
  (x - WEST[0]) * AXIS_U[0] + (z - WEST[1]) * AXIS_U[1],
  (x - WEST[0]) * AXIS_V[0] + (z - WEST[1]) * AXIS_V[1],
];

function createBuilding(): BuildingFeature {
  return {
    id: 'area4-3',
    name: '第4学舎 3号館',
    shortName: '第4学舎3号館',
    kana: 'だいよんがくしゃ さんごうかん',
    englishName: '4th Academic Building No.3',
    category: 'area4',
    inCampus: true,
    faculties: [],
    facilityTags: ['study'],
    keywords: [],
    description: '',
    sculptStyle: 'standard',
    labelPriority: 6,
    polygon: POLYGON.map(([x, z]) => [x, z]),
    centroid: { x: 223.28, z: -69.88 },
    groundY: 41.9,
    minGroundY: 39.55,
    maxGroundY: 41.92,
    height: 24.2,
    levels: 6,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

function inside(p: P2, poly: readonly P2[]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}

/** 点から輪郭の辺までのいちばん近い距離 */
function distToOutline(p: P2): number {
  let best = Infinity;
  for (let i = 0; i < POLYGON.length; i++) {
    const a = POLYGON[i]!;
    const b = POLYGON[(i + 1) % POLYGON.length]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / (abx * abx + abz * abz)));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t)));
  }
  return best;
}

function worldVertices(obj: THREE.Mesh): THREE.Vector3[] {
  obj.updateWorldMatrix(true, false);
  const pos = obj.geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld));
  return out;
}

describe('buildArea43', () => {
  const groundVisualY = 37.5;
  // 東の角へ 3m 下がる斜面（DEM では東の角が約 2.3m 低い）
  const sampleGroundVisualY = (x: number, z: number): number => {
    const [u, v] = toUV(x, z);
    return groundVisualY - Math.max(0, (u / 62 + v / 45 - 1) * 3);
  };
  const result = buildArea43({ building: createBuilding(), groundVisualY, sampleGroundVisualY });
  result.group.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  result.group.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  const byName = (name: string): THREE.Mesh => {
    const m = meshes.find((x) => x.name === name);
    if (!m) throw new Error(`${name} missing`);
    return m;
  };
  const deckY = groundVisualY + AREA43_ROOF_DECK_M;
  const screenTopY = groundVisualY + AREA43_SCREEN_TOP_M;

  it('has meshes within the 120-mesh budget and finite vertices', () => {
    expect(meshes.length).toBeGreaterThan(5);
    expect(meshes.length).toBeLessThanOrEqual(120);
    for (const m of meshes) {
      for (const p of worldVertices(m)) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      }
    }
  });

  it('stays inside the OSM outline', () => {
    for (const m of meshes) {
      for (const p of worldVertices(m)) {
        const q: P2 = [p.x, p.z];
        expect(inside(q, POLYGON) || distToOutline(q) < 0.05).toBe(true);
      }
    }
  });

  it('is a 4-storey box whose roof deck carries the courts, with its footing below the lowest ground', () => {
    const box = new THREE.Box3().setFromObject(byName('area4-3-body'));
    expect(box.max.y).toBeCloseTo(deckY, 5);
    // 地上 4 階（KAN-CAN!）。階高は推定で 1 階分 3.8〜4.8m
    expect(AREA43_ROOF_DECK_M).toBeGreaterThan(4 * 3.8);
    expect(AREA43_ROOF_DECK_M).toBeLessThan(4 * 4.8);
    expect(box.min.y).toBeLessThan(groundVisualY - 3);
    expect(HERO_ROOF_DECKS['area4-3']?.deckM).toBe(AREA43_ROOF_DECK_M);
  });

  // 南東の辺（グラウンド側）: 南の角 → 東の角。t は南の角からの辺に沿った距離、d は辺から内への距離
  const SOUTH = POLYGON[2]!;
  const EAST = POLYGON[1]!;
  const seLen = Math.hypot(EAST[0] - SOUTH[0], EAST[1] - SOUTH[1]);
  const seDir: P2 = [(EAST[0] - SOUTH[0]) / seLen, (EAST[1] - SOUTH[1]) / seLen];
  const seIn: P2 = [seDir[1], -seDir[0]];
  const seTD = (p: THREE.Vector3): P2 => {
    const dx = p.x - SOUTH[0];
    const dz = p.z - SOUTH[1];
    return [dx * seDir[0] + dz * seDir[1], dx * seIn[0] + dz * seIn[1]];
  };
  const slabBottomY = deckY - AREA43_SLAB_M;

  it('lets only the roof slab overhang the south-east (ground-side) face, along its full length', () => {
    // 内向きの向きの確かめ: 輪郭の重心は南東の辺の内側
    expect(seTD(new THREE.Vector3(223.28, 0, -69.88))[1]).toBeGreaterThan(20);
    const pts = worldVertices(byName('area4-3-body'));
    const lowerPts = pts.filter((p) => p.y < slabBottomY - 0.01);
    expect(lowerPts.length).toBeGreaterThan(0);
    // 1〜4 階の壁は南東の辺からせり出しの奥行きだけ内にある
    for (const p of lowerPts) expect(seTD(p)[1]).toBeGreaterThan(AREA43_SE_OVERHANG_M - 1e-3);
    // 下げた壁は南の端から東の角の欠けの手前まで続く
    const onWall = lowerPts.filter((p) => Math.abs(seTD(p)[1] - AREA43_SE_OVERHANG_M) < 0.01).map((p) => seTD(p)[0]);
    expect(Math.min(...onWall)).toBeLessThan(1);
    expect(Math.max(...onWall)).toBeGreaterThan(seLen - 6.5);
    // 屋上の板は南の角・東の角まで（輪郭どおり）
    for (const corner of [SOUTH, EAST]) {
      const near = pts.filter((p) => Math.hypot(p.x - corner[0], p.z - corner[1]) < 0.05);
      expect(near.some((p) => Math.abs(p.y - slabBottomY) < 1e-4)).toBe(true);
      expect(near.some((p) => Math.abs(p.y - deckY) < 1e-4)).toBe(true);
    }
    // ほかの 3 つの面は 1〜4 階も輪郭の上（西の角・北の角）
    for (const corner of [POLYGON[3]!, POLYGON[0]!]) {
      expect(lowerPts.some((p) => Math.hypot(p.x - corner[0], p.z - corner[1]) < 0.05)).toBe(true);
    }
  });

  it('puts brackets under the overhang along the face and pilasters only on the east part', () => {
    const pts = worldVertices(byName('area4-3-se-frame'));
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      expect(p.y).toBeLessThan(slabBottomY + 0.1);
      const d = seTD(p)[1];
      expect(d).toBeGreaterThan(0.3);
      expect(d).toBeLessThan(AREA43_SE_OVERHANG_M + 2 + 1e-6);
    }
    // 支え（軒裏から 3m 以内の高さ）は南の端の近くから東の端の近くまで並ぶ
    const upper = pts.filter((p) => p.y > slabBottomY - 3).map((p) => seTD(p)[0]);
    expect(Math.min(...upper)).toBeLessThan(6);
    expect(Math.max(...upper)).toBeGreaterThan(seLen - 8);
    // 地面の近くまで下りる柱は、窓の並ぶ西の側と柱の並ぶ東の側の境より東だけ
    const low = pts.filter((p) => p.y < groundVisualY).map((p) => seTD(p)[0]);
    expect(low.length).toBeGreaterThan(0);
    expect(Math.min(...low)).toBeGreaterThan(AREA43_SE_SPLIT_M - 1);
    // 白（外壁と同じ材質）
    expect(byName('area4-3-se-frame').material).toBe(result.primaryMaterials[0]!.mat);
  });

  it('rings the roof with a translucent screen above the parapet, except at the west corner block', () => {
    const screen = byName('area4-3-screen');
    const mat = screen.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.side).toBe(THREE.DoubleSide);
    const pts = worldVertices(screen);
    expect(pts.length).toBeGreaterThan(0);
    let onSw = 0;
    let onNw = 0;
    for (const p of pts) {
      expect(p.y).toBeGreaterThan(deckY + 0.5);
      expect(p.y).toBeLessThanOrEqual(screenTopY + 1e-6);
      expect(distToOutline([p.x, p.z])).toBeLessThan(0.5);
      const [u, v] = toUV(p.x, p.z);
      // 角の塊の中には入らない
      expect(u < AREA43_CORNER_BLOCK.u1 - 0.1 && v < AREA43_CORNER_BLOCK.v1 - 0.1).toBe(false);
      if (Math.abs(u) < 1) onSw++;
      if (Math.abs(v) < 1) onNw++;
    }
    expect(onSw).toBeGreaterThan(0);
    expect(onNw).toBeGreaterThan(0);
    expect(screenTopY - deckY).toBeGreaterThan(5);
  });

  it('raises a solid white block at the west corner up to the top of the screen', () => {
    const block = byName('area4-3-corner-block');
    const box = new THREE.Box3().setFromObject(block);
    expect(box.max.y).toBeCloseTo(screenTopY, 5);
    expect(box.min.y).toBeCloseTo(deckY, 5);
    const uv = worldVertices(block).map((p) => toUV(p.x, p.z));
    expect(Math.min(...uv.map((q) => q[0]))).toBeCloseTo(AREA43_CORNER_BLOCK.u0, 3);
    expect(Math.max(...uv.map((q) => q[0]))).toBeCloseTo(AREA43_CORNER_BLOCK.u1, 3);
    expect(Math.max(...uv.map((q) => q[1]))).toBeCloseTo(AREA43_CORNER_BLOCK.v1, 3);
    expect((block.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(
      result.primaryMaterials[0]!.mat.color.getHexString(),
    );
  });

  it('keeps the grey strip on the north-west edge above the rooftop court surface', () => {
    const strip = byName('area4-3-strip');
    const box = new THREE.Box3().setFromObject(strip);
    // GroundsBuilder の屋上の面は屋上の 0.05m 上
    expect(box.max.y - (deckY + 0.05)).toBeGreaterThan(0.3);
    const uv = worldVertices(strip).map((p) => toUV(p.x, p.z));
    expect(Math.max(...uv.map((q) => q[1]))).toBeCloseTo(AREA43_STRIP.v1, 3);
    expect(Math.min(...uv.map((q) => q[0]))).toBeCloseTo(AREA43_STRIP.u0, 3);
  });

  it('fits the rooftop tennis courts of structures.json between the strip and the parapets', () => {
    const structures = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'public/data/senriyama/structures.json'), 'utf8'),
    ) as CampusStructuresData;
    const roof = (structures.grounds ?? []).find((g) => g.id === 'tennis-area4-3-roof');
    expect(roof?.tennis?.roofOf).toBe('area4-3');
    const courts = roof?.tennis?.courts ?? [];
    expect(courts).toHaveLength(4);
    for (const c of courts) {
      const perp: P2 = [-c.axis[1], c.axis[0]];
      for (const [du, dv] of [
        [-11.9, -5.5],
        [11.9, -5.5],
        [11.9, 5.5],
        [-11.9, 5.5],
      ] as const) {
        const p: P2 = [c.center[0] + c.axis[0] * du + perp[0] * dv, c.center[1] + c.axis[1] * du + perp[1] * dv];
        const [u, v] = toUV(p[0], p[1]);
        expect(inside(p, POLYGON)).toBe(true);
        expect(distToOutline(p)).toBeGreaterThan(0.35);
        expect(v).toBeGreaterThan(AREA43_STRIP.v1);
        expect(u).toBeGreaterThan(0);
      }
    }
  });
});
