import * as THREE from 'three';
import { computeVisualY, sampleElevation } from '../domain/projection';
import type { CampusConfig, StationFacilitiesFeature, TerrainGrid } from '../domain/types';
import { sampleTerrainMeshElevation } from './DioramaBaseBuilder';
import { ColoredMeshBuilder, addPolygonTop, addPolygonWalls, densifyRing } from './meshKit';
import { SCENE_PALETTE } from './palette';

/**
 * 駅（transport.stationFacilities）を描く: ホーム・駅舎・上屋・駅名標。
 * 輪郭は OSM、高さは推定。頂点色つきの 1 つのメッシュにまとめる（描画命令 1 回）。
 * 阪急のマルーンは差し色（屋根の縁・駅名標）だけに使う。
 */

/** TransportBuilder の線路の帯の持ち上げ（表示の高さ）。ホームの上面はここから測る */
export const TRACK_BED_LIFT = 0.25;
/** ホームの上面の、線路面からの高さ（m）。依頼の条件（約 1m） */
export const PLATFORM_HEIGHT_ABOVE_TRACK = 1.0;
/** 屋根の縁（マルーンの帯）の高さ（m）。見た目の値 */
const FASCIA_HEIGHT = 0.45;
/** 上屋の屋根の厚み（m）。推定 */
const CANOPY_THICKNESS = 0.28;
/** 上屋の柱の間隔（m）。推定 */
const CANOPY_POST_SPACING = 6.5;

const COLORS = {
  platformTop: '#BDB7AC',
  platformSide: '#A39D92',
  buildingWall: '#E2DCD0',
  canopyRoof: '#D8D8D0',
  canopyUnderside: '#ECEAE3',
  post: '#8D9298',
  signFace: '#F4F1EA',
} as const;

export interface StationBuildResult {
  group: THREE.Group;
  /** 選択の当たり判定に使うメッシュ（userData.buildingId に駅の id） */
  interactive: THREE.Object3D[];
}

interface AxisInfo {
  ox: number;
  oz: number;
  dx: number;
  dz: number;
  min: number;
  max: number;
}

/** いちばん離れた 2 点を結ぶ向き（ホームや上屋の長い方向）と、その向きでの範囲 */
function longAxis(ring: readonly [number, number][]): AxisInfo {
  let best = -1;
  let a: [number, number] = ring[0] ?? [0, 0];
  let b: [number, number] = a;
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      const p = ring[i];
      const q = ring[j];
      if (!p || !q) continue;
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d > best) {
        best = d;
        a = p;
        b = q;
      }
    }
  }
  const len = Math.max(best, 1e-6);
  const dx = (b[0] - a[0]) / len;
  const dz = (b[1] - a[1]) / len;
  let min = Infinity;
  let max = -Infinity;
  for (const [x, z] of ring) {
    const t = (x - a[0]) * dx + (z - a[1]) * dz;
    min = Math.min(min, t);
    max = Math.max(max, t);
  }
  return { ox: a[0], oz: a[1], dx, dz, min, max };
}

/**
 * 長い方向の位置 t での、輪郭の幅の中点（ホームの中心線）。曲がったホームでも中に入るように、
 * 長い方向に直角な線と輪郭の交点の中点をとる
 */
function midlineAt(ring: readonly [number, number][], axis: AxisInfo, t: number): [number, number] | null {
  const px = axis.ox + axis.dx * t;
  const pz = axis.oz + axis.dz * t;
  // 直角な線: p + s * (-dz, dx)
  const nx = -axis.dz;
  const nz = axis.dx;
  const hits: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const denom = nx * ez - nz * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const qx = a[0] - px;
    const qz = a[1] - pz;
    const s = (qx * ez - qz * ex) / denom;
    const u = (qx * nz - qz * nx) / denom;
    if (u >= 0 && u <= 1) hits.push(s);
  }
  if (hits.length < 2) return null;
  const s = (Math.min(...hits) + Math.max(...hits)) / 2;
  return [px + nx * s, pz + nz * s];
}

export function buildStationGroup(
  facilities: readonly StationFacilitiesFeature[],
  terrain: TerrainGrid,
  config: CampusConfig,
): StationBuildResult {
  const group = new THREE.Group();
  group.name = 'station-facilities';
  const interactive: THREE.Object3D[] = [];
  const exag = config.verticalExaggeration;
  const minElev = terrain.minElevation;
  const vis = (e: number) => computeVisualY(e, minElev, exag);
  const meshGround = (x: number, z: number) => vis(sampleTerrainMeshElevation(terrain, x, z));
  // 線路の帯と同じ地面の引き方（TransportBuilder は sampleElevation で線路を置く）
  const platformTopAt = (x: number, z: number) =>
    vis(sampleElevation(terrain, x, z)) + TRACK_BED_LIFT + PLATFORM_HEIGHT_ABOVE_TRACK;

  const c = {
    platformTop: new THREE.Color(COLORS.platformTop),
    platformSide: new THREE.Color(COLORS.platformSide),
    wall: new THREE.Color(COLORS.buildingWall),
    canopyRoof: new THREE.Color(COLORS.canopyRoof),
    canopyUnder: new THREE.Color(COLORS.canopyUnderside),
    post: new THREE.Color(COLORS.post),
    maroon: new THREE.Color(SCENE_PALETTE.accents.hankyuMaroon),
    signFace: new THREE.Color(COLORS.signFace),
  };

  for (const fac of facilities) {
    const mb = new ColoredMeshBuilder();

    // ホーム（線路面より約 1m 高い板）
    for (const pf of fac.platforms) {
      const ring = densifyRing(pf.polygon, 3);
      addPolygonTop(mb, ring, platformTopAt, c.platformTop);
      addPolygonWalls(mb, ring, platformTopAt, (x, z) => meshGround(x, z) - 0.4, c.platformSide);

      // 駅名標（ホームの長さの中ほど、線路の方向に沿って）。位置は推定
      const axis = longAxis(pf.polygon);
      const mid = midlineAt(pf.polygon, axis, (axis.min + axis.max) / 2);
      if (mid) {
        const top = platformTopAt(mid[0], mid[1]);
        const dir = { x: axis.dx, z: axis.dz };
        mb.addOrientedBox(mid[0], mid[1], dir, 2.4, 0.14, top + 1.95, top + 2.75, c.maroon);
        mb.addOrientedBox(mid[0], mid[1], dir, 2.0, 0.2, top + 2.1, top + 2.6, c.signFace);
        for (const side of [-0.95, 0.95]) {
          mb.addOrientedBox(
            mid[0] + axis.dx * side,
            mid[1] + axis.dz * side,
            dir,
            0.1,
            0.1,
            top,
            top + 1.95,
            c.post,
            { skipBottom: true, skipTop: true },
          );
        }
      }
    }

    // 駅舎（OSM の輪郭。平屋の高さは推定）。壁・マルーンの屋根の縁・屋根（空中写真の色）
    for (const b of fac.buildings) {
      const ring = densifyRing(b.polygon, 4);
      let cx = 0;
      let cz = 0;
      let base = Infinity;
      for (const [x, z] of ring) {
        cx += x / ring.length;
        cz += z / ring.length;
        base = Math.min(base, meshGround(x, z));
      }
      const top = vis(sampleElevation(terrain, cx, cz)) + b.heightM;
      addPolygonWalls(mb, ring, () => top - FASCIA_HEIGHT, () => base - 0.4, c.wall);
      addPolygonWalls(mb, ring, () => top, () => top - FASCIA_HEIGHT, c.maroon);
      addPolygonTop(mb, ring, () => top, new THREE.Color(b.roofHex));
    }

    // 上屋（空中写真で屋根が見える範囲だけ）。屋根の縁はマルーン
    for (const cp of fac.canopies) {
      const ring = densifyRing(cp.polygon, 3);
      const under = (x: number, z: number) => platformTopAt(x, z) + cp.clearHeightM;
      const over = (x: number, z: number) => under(x, z) + CANOPY_THICKNESS;
      addPolygonTop(mb, ring, over, c.canopyRoof);
      addPolygonTop(mb, ring, under, c.canopyUnder, -1);
      addPolygonWalls(mb, ring, over, under, c.maroon);
      const axis = longAxis(cp.polygon);
      const span = axis.max - axis.min;
      const count = Math.max(2, Math.round(span / CANOPY_POST_SPACING) + 1);
      for (let k = 0; k < count; k++) {
        const t = axis.min + 1.2 + ((span - 2.4) * k) / (count - 1);
        const m = midlineAt(cp.polygon, axis, t);
        if (!m) continue;
        mb.addOrientedBox(
          m[0],
          m[1],
          { x: axis.dx, z: axis.dz },
          0.26,
          0.26,
          platformTopAt(m[0], m[1]),
          under(m[0], m[1]),
          c.post,
          { skipBottom: true, skipTop: true },
        );
      }
    }

    if (mb.vertexCount === 0) continue;
    const mesh = new THREE.Mesh(
      mb.build(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.03 }),
    );
    mesh.name = `station-${fac.stationId}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { buildingId: fac.stationId };
    group.add(mesh);
    interactive.push(mesh);
  }

  return { group, interactive };
}
