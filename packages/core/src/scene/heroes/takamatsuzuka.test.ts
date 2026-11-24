import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { HERO_BUILDERS } from './index';
import { frameToLocal, makeFrame } from './localFrame';
import {
  TAKAMATSUZUKA_ARCH_TOP_M,
  TAKAMATSUZUKA_DEPTH_M,
  TAKAMATSUZUKA_DOOR_TOP_M,
  TAKAMATSUZUKA_DOOR_U,
  TAKAMATSUZUKA_FRAME_TOP_M,
  TAKAMATSUZUKA_PLAQUE,
  TAKAMATSUZUKA_WIDTH_M,
  buildTakamatsuzuka,
} from './takamatsuzuka';

/** buildings.json の way_819790896（高松塚古墳壁画再現展示室）の輪郭 */
const ROOM_POLYGON: [number, number][] = [
  [2.01, -121.01],
  [1.55, -112.8],
  [8.31, -112.35],
  [8.88, -120.56],
];

function createRoomFeature(): BuildingFeature {
  return {
    id: 'way_819790896',
    name: '高松塚古墳壁画再現展示室',
    shortName: '高松塚古墳壁画再現展示室',
    kana: '',
    englishName: '',
    category: 'area1',
    inCampus: true,
    faculties: [],
    facilityTags: [],
    keywords: [],
    description: '',
    sculptStyle: 'standard',
    labelPriority: 7,
    polygon: ROOM_POLYGON,
    centroid: { x: 5.19, z: -116.68 },
    groundY: 54.03,
    minGroundY: 54.03,
    maxGroundY: 54.05,
    height: 3.4,
    levels: 1,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

function worldVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const pos = mesh.geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    out.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld));
  }
  return out;
}

function insidePolygon(x: number, z: number, poly: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

describe('buildTakamatsuzuka', () => {
  const groundVisualY = 53.9;
  const result = buildTakamatsuzuka({
    building: createRoomFeature(),
    groundVisualY,
    sampleGroundVisualY: () => groundVisualY,
  });
  result.group.updateMatrixWorld(true);
  const meshes = new Map<string, THREE.Mesh>();
  result.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.set(obj.name, obj);
  });
  // 箱の南西の角を原点に、西の面に沿って北へ u、東へ v
  const frame = makeFrame(2.85, -114.0, 2.01 - 1.55, -121.01 - -112.8);
  const local = (mesh: THREE.Mesh): { u: number; v: number; y: number }[] =>
    worldVertices(mesh).map((p) => {
      const [u, v] = frameToLocal(frame, p.x, p.z);
      return { u, v, y: p.y - groundVisualY };
    });

  it('is registered as the hero of way_819790896 (the outline named in OFFICIAL_MAP_BUILDINGS)', () => {
    expect(HERO_BUILDERS.way_819790896).toBe(buildTakamatsuzuka);
  });

  it('builds one mesh per material, and only the glass is transparent (one extra draw call)', () => {
    expect(meshes.size).toBeLessThanOrEqual(7);
    for (const name of ['floor', 'frame', 'partition', 'mural', 'plaque', 'plate', 'glass']) {
      expect(meshes.has(`takamatsuzuka-${name}`), name).toBe(true);
    }
    const transparent = [...meshes.values()].filter((m) => (m.material as THREE.Material).transparent);
    expect(transparent.map((m) => m.name)).toEqual(['takamatsuzuka-glass']);
    const glass = transparent[0]!.material as THREE.MeshStandardMaterial;
    expect(glass.side).toBe(THREE.DoubleSide);
    expect(glass.depthWrite).toBe(false);
    expect(glass.forceSinglePass).toBe(true);
  });

  it('has finite vertex coordinates', () => {
    for (const mesh of meshes.values()) {
      const pos = mesh.geometry.getAttribute('position');
      expect(pos.count).toBeGreaterThan(0);
      for (let i = 0; i < pos.count * 3; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
    }
  });

  it('stands inside the OSM outline as a small one-storey glass box (5.4 × 4.8m), reaching below the ground', () => {
    for (const name of ['frame', 'glass', 'floor', 'plaque']) {
      for (const p of worldVertices(meshes.get(`takamatsuzuka-${name}`)!)) {
        expect(insidePolygon(p.x, p.z, ROOM_POLYGON), `${name} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`).toBe(true);
      }
    }
    const frameBox = local(meshes.get('takamatsuzuka-frame')!);
    const us = frameBox.map((p) => p.u);
    const vs = frameBox.map((p) => p.v);
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(TAKAMATSUZUKA_WIDTH_M + 0.14, 1);
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(TAKAMATSUZUKA_DEPTH_M + 0.14, 1);
    const box = new THREE.Box3().setFromObject(result.group, true);
    expect(box.min.y).toBeLessThan(groundVisualY);
    // データの高さ（3.4m）とアーチの頂（3.35m ＋ガラス）がそろう
    expect(box.max.y - groundVisualY).toBeGreaterThan(TAKAMATSUZUKA_ARCH_TOP_M);
    expect(box.max.y - groundVisualY).toBeLessThanOrEqual(createRoomFeature().height + 0.05);
  });

  it('puts the arch on the west and east faces: high in the middle, down to the frame top at the corners', () => {
    const frameB = local(meshes.get('takamatsuzuka-frame')!);
    for (const vFace of [0, TAKAMATSUZUKA_DEPTH_M]) {
      const onFace = frameB.filter((p) => Math.abs(p.v - vFace) < 0.07);
      const top = (u0: number, u1: number): number =>
        Math.max(...onFace.filter((p) => p.u >= u0 && p.u <= u1).map((p) => p.y));
      expect(top(2.5, 2.9)).toBeCloseTo(TAKAMATSUZUKA_ARCH_TOP_M, 1);
      expect(top(-0.1, 0.1)).toBeLessThan(TAKAMATSUZUKA_FRAME_TOP_M + 0.2);
      expect(top(5.3, 5.5)).toBeLessThan(TAKAMATSUZUKA_FRAME_TOP_M + 0.2);
    }
    // ガラスの屋根は頂がアーチの上、軒は枠の上端あたり
    const glass = local(meshes.get('takamatsuzuka-glass')!);
    expect(Math.max(...glass.map((p) => p.y))).toBeGreaterThan(TAKAMATSUZUKA_ARCH_TOP_M);
    expect(Math.max(...glass.map((p) => p.y))).toBeLessThan(TAKAMATSUZUKA_ARCH_TOP_M + 0.1);
  });

  it('opens a double glass door in the west face (no mullion inside each leaf, a transom at 2.3m)', () => {
    const frameB = local(meshes.get('takamatsuzuka-frame')!);
    const [d0, d1] = TAKAMATSUZUKA_DOOR_U;
    const mid = (d0 + d1) / 2;
    // 西の面の床から 1.0〜2.0m の高さで、扉の葉の中（召し合わせと両脇の方立てを除く）に枠の点が無い
    const inLeaf = frameB.filter(
      (p) =>
        Math.abs(p.v) < 0.06 &&
        p.y > 1.0 &&
        p.y < 2.0 &&
        p.u > d0 + 0.08 &&
        p.u < d1 - 0.08 &&
        Math.abs(p.u - mid) > 0.05,
    );
    expect(inLeaf).toEqual([]);
    // 召し合わせは床から立つ（扉の高さまで）
    const meeting = frameB.filter((p) => Math.abs(p.v) < 0.06 && Math.abs(p.u - mid) <= 0.04);
    expect(Math.min(...meeting.map((p) => p.y))).toBeLessThan(0.1);
    expect(Math.max(...meeting.map((p) => p.y))).toBeCloseTo(TAKAMATSUZUKA_DOOR_TOP_M, 5);
  });

  it('sets the stone plaque in front of the west face, south of the door', () => {
    const plaque = local(meshes.get('takamatsuzuka-plaque')!);
    const vs = plaque.map((p) => p.v);
    const us = plaque.map((p) => p.u);
    expect(Math.max(...vs)).toBeLessThan(0);
    expect(Math.min(...vs)).toBeGreaterThan(-1);
    expect(Math.max(...us)).toBeLessThan(TAKAMATSUZUKA_DOOR_U[0]);
    expect(Math.min(...us)).toBeCloseTo(TAKAMATSUZUKA_PLAQUE.u0, 5);
    expect(Math.max(...plaque.map((p) => p.y))).toBeCloseTo(TAKAMATSUZUKA_PLAQUE.top, 5);
  });
});
