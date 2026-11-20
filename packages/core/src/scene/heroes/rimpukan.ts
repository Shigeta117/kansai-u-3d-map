import * as THREE from 'three';
import { ensureExtrudeLids } from '../extrudeLids';
import {
  TriBucket,
  addBucketMesh,
  createLocalGroup,
  frameToWorld,
  makeFrame,
  pushBox,
  pushWallStrip,
  type LocalFrame,
} from './localFrame';
import type { HeroBuilder } from './types';

// Palette from visual research and project brief
const WALL_HEX = '#8A5641';
const GLASS_HEX = '#4F6670';
const SOFFIT_HEX = '#C9A57E';
const COLUMN_HEX = '#B9B1A5';
const SOLAR_HEX = '#3A3F47';
const SOIL_HEX = '#8C7A58';
const RAILING_HEX = '#E8E8E4';
const TRUNK_HEX = '#6B5444';
const SAKURA_HEX = '#F1B9C7';
const POLE_HEX = '#F4F4F4';
const UPPER_HEX = '#D9CCB3';
const STAIR_HEX = '#8E5848';
const OPENING_HEX = '#2E3438';
const PLAQUE_FRAME_HEX = '#CFC5B0';
const PLAQUE_INNER_HEX = '#B9A983';
const WINDOW_HEX = '#3E4A52';

/**
 * 大階段は、メインストリートが北と東に分かれる Y 字路（OSM の交点 (85.3, 45.0)）の方へ下りる
 * （持ち主の確認 2026-11-20「Y 字路の方向に向かって階段は伸びてる」）。
 * OSM にこの階段そのものが steps の道（way 490803027）として載っているので、その上端と下端を使う。
 * 上端＝ドラムの南西の縁、下端＝Y 字路へ続く歩道との接点
 */
const STAIR_TOP_X = 99.9;
const STAIR_TOP_Z = 28.3;
const STAIR_BOTTOM_X = 94.7;
const STAIR_BOTTOM_Z = 33.7;
const FRONT_DIR_RAW_X = STAIR_BOTTOM_X - STAIR_TOP_X;
const FRONT_DIR_RAW_Z = STAIR_BOTTOM_Z - STAIR_TOP_Z;

/**
 * 大階段を出す地点の目安（OSM の階段の上端）。
 * この点にいちばん近い辺の中点を正面の基準にする。正面の向きに最も出た点の集め方だと、
 * 輪郭の座標が少し違うだけで隣の辺（z 9〜16）に移ってしまうため、辺を名指しする
 */
const FRONT_EDGE_HINT_X = STAIR_TOP_X;
const FRONT_EDGE_HINT_Z = STAIR_TOP_Z;
/** 目安の点から辺までがこれより遠ければ（別の輪郭）、正面の中心の線が当たる辺を使う */
const FRONT_EDGE_HINT_MAX_DIST_M = 5.0;

/**
 * 大階段の下端（道寄りの段の前）の、ドラムの先端の辺からの距離 (m)。
 * OSM の階段の道の上端から下端までの長さ（約 7.5m）。下端は Y 字路へ続く歩道との接点。
 * 下端を道の縁に合わせ、階段が道の上にかぶらず、道とすき間なくつながるようにする
 */
const STAIR_FOOT_DISTANCE_M = Math.hypot(STAIR_BOTTOM_X - STAIR_TOP_X, STAIR_BOTTOM_Z - STAIR_TOP_Z);

/** 段の高さの目安（0.15〜0.2m）。2 階の床までの総高をこの範囲の段に割る */
const STAIR_RISER_MAX_M = 0.2;

/** 1 階・柱・大階段の底を、輪郭と階段まわりで引いた地面のいちばん低い所からさらに下ろす深さ (m) */
const FOOTING_BELOW_LOWEST_GROUND_M = 0.5;

type Point2D = [number, number];

// ---------------------------------------------------------------------------
// 上の階（持ち主の指摘 2026-11-20「大階段の上のデッキは 4 階部分（3 階上）にちょっとあり、そこから折れて
// 4 階の上に屋上のスペースがある。4 階のフロアと屋上は全体的に一回り小さい」と、国土地理院の空中写真〈2017 年 4 月〉、
// 公式の地図のイラスト〈3 階の屋根の縁と 4 階の屋根の縁にそれぞれ桜の列〉、持ち主の 2023 年の映像 IMG_6416〜6418）
// 高さは 1 階の床（重心の地面）からの m。建物の高さは強調しない
// ---------------------------------------------------------------------------

/** 1 階（床から 2 階の床まで） */
const FLOOR1_M = 4.2;
/** 2・3 階の階高（推定。資料は「地上 4 階」だけ） */
const UPPER_FLOOR_M = 4.1;
/**
 * 3 階の屋根（4 階の床）の高さ。茶色の壁の上端で、その上が 4 階の外のテラスと裏の大階段の上のデッキ。
 * KUシンフォニーホールの専用モデル（裏の大階段を作る）が、階段の上端をこの高さにそろえる
 */
export const RIMPUKAN_DECK_M = FLOOR1_M + UPPER_FLOOR_M * 2; // 12.4
/**
 * 凜風館の 1 階の床の高さ（groundVisualY）を、ほかの建物の専用モデルが地形から引き直すための点。
 * buildings.json の凜風館の groundY は、データの生成がこの重心の地形の標高を引いた値
 */
export const RIMPUKAN_GROUND_REF: Readonly<Point2D> = [135.56, -1.18];
/**
 * 4 階の外のフェンスの太陽光パネル（ソーラーフェンス。大学の資料「4 階屋外フェンス」）。3 階の屋根の縁に立つ。
 * 高さは写真で茶色の帯の約 1/6（推定 1.5m）。上に低い白い手すり
 */
const SOLAR_FENCE_M = 1.5;
const SOLAR_FENCE_THICK_M = 0.15;
const SOLAR_RAIL_M = 0.08;

/**
 * 裏の大階段の上端（KUシンフォニーホールの専用モデルが作る階段）が 3 階の屋根に着く口。輪郭の切り欠きの点
 * （北東の辺の端 (152.5, −12.29) → (154.06, −13.7)）と、北東の棟の北西の面の上で階段のホール側の手すり壁が
 * 当たる点（推定）の間は、太陽光パネルの柵を付けない
 */
const STAIR_TOP_OPENING: readonly Point2D[] = [
  [152.5, -12.29],
  [154.06, -13.7],
  [159.42, -18.5],
];

/**
 * 北東の棟とデッキ・屋上の庭へ上る階段のまわりの縁。映像 IMG_6416_014〜016 ではデッキと階段の縁は低い白い壁と
 * 植え込みで、太陽光パネルは見えない。ここは太陽光パネルの柵の代わりに低い白い壁（高さは推定）。
 * 最後の点は南東の辺の上の、屋上の庭へ上る階段の上端（s = 27.5）
 */
const WING_EDGE_PATH: readonly Point2D[] = [
  [159.42, -18.5],
  [165.71, -24.14],
  [169.18, -20.2],
  [191.1, -44.95],
  [200.1, -34.6],
  [167.36, -5.88],
  [146.14, 11.61],
];
const WING_PARAPET_M = 1.0;

/**
 * 4 階と屋上の庭の輪郭（屋根の縁）。空中写真の屋上の庭の白い縁を読んだ推定（±1〜2m）:
 * 西の長い辺は 1〜3 階の輪郭から約 7m、北東の辺は約 8m 内側（その間が 4 階の外のテラス）。南東の辺は輪郭の 0.3m 内側まで出る。
 * 東の切り欠きは、デッキから屋上の庭へ上る階段の場所。北の角には丸い塔（空中写真の円。作らない）
 */
const UPPER_OUTLINE: readonly Point2D[] = [
  [105.4, 22.0],
  [105.14, 18.66],
  [107.16, 11.05],
  [114.53, -5.23],
  [125.26, -25.0],
  [148.08, -5.54],
  [138.5, 2.35],
  [145.49, 10.84],
  [138.88, 16.3],
  [117.3, 28.14],
  [111.43, 29.47],
  [108.6, 28.4],
  [106.3, 26.2],
];
/** 4 階の壁は屋根の縁から内へ下げる（写真の「張り出した曲面の庇」。推定 0.8m）。屋根の板の厚さ（推定） */
const UPPER_EAVE_M = 0.8;
const UPPER_SLAB_M = 0.5;
/** 屋上の庭の縁の白い金属の柵（映像 IMG_6417_000〜003、2023-06 の屋上の映像） */
const GARDEN_FENCE_M = 1.1;
/** 屋上の庭の桜の格子の間隔（推定。空中写真の樹冠の並び。大学の資料では屋上の庭に 120 本） */
const SAKURA_GRID_M = 4.2;
/**
 * 4 階の外のテラスの西の縁に並ぶ桜（空中写真で、1〜3 階の輪郭と 4 階の縁の間に桜色の樹冠の列。公式の地図のイラストでも
 * 3 階の屋根の縁に桜の列）。輪郭からの距離と間隔（推定）
 */
const TERRACE_TREE_INSET_M = 3.5;
const TERRACE_TREE_SPACING_M = 5.0;

/**
 * デッキから屋上の庭へ上る階段（OSM の steps way 423060533: (150.0, −6.8) → (137.3, 6.5)）。輪郭の南東の辺
 * （(167.36, −5.88) → (142.34, 14.74)）に沿って南西へ上る。辺の上の距離 s・辺から内への距離 t で置く。
 * 映像 IMG_6416_016・020（デッキから見て、左に白い手すり壁、右に 4 階の壁）と、空中写真（南東の辺と 4 階の間の幅
 * 約 11m の帯。上端は s ≈ 27〜28 で、その先は屋上の庭が輪郭の近くまで出る）から。段の寸法は推定
 */
const SE_EDGE_A: Readonly<Point2D> = [167.36, -5.88];
const SE_EDGE_B: Readonly<Point2D> = [142.34, 14.74];
const UPPER_STAIR_TOP_S = 27.5;
const UPPER_STAIR_OUT_T = 1.0;
/** 4 階の切り欠きの辺（t = 12.0）から庇の分だけ奥の壁まで */
const UPPER_STAIR_IN_T = 12.0 + UPPER_EAVE_M;
const UPPER_STAIR_TREAD_M = 0.38;
const UPPER_STAIR_RISER_MAX_M = 0.16;
/** 階段の外の白い手すり壁（映像で白いコンクリートの壁と金属の手すり）。段の鼻の線から 1.0m（推定） */
const UPPER_STAIR_PARAPET_T: readonly [number, number] = [0.4, 0.75];

/**
 * 裏の大階段の上のデッキ（木の床。映像 IMG_6416_014・015、IMG_6418_004）。範囲は空中写真の茶色の面と
 * 上の階段の下端まで（推定）。4 階の下にかかる部分は 4 階に隠れる
 */
const DECK_OUTLINE: readonly Point2D[] = [
  [150.6, -10.6],
  [152.6, -12.0],
  [154.1, -13.4],
  [160.0, -18.6],
  [162.9, -19.8],
  [165.9, -7.6],
  [165.44, -5.07],
  [153.38, 4.87],
  [145.17, -5.09],
];
const DECK_HEX = '#8A7D72';

/**
 * 北東の棟の屋上の設備を囲う黒い横ルーバーの囲い（映像 IMG_6416_014・015・018、IMG_6418_003・004 でデッキの
 * 北東に建つ。空中写真では黒い縁の中に白い設備）。範囲は空中写真、高さはデッキから約 3.5m（推定）。上は開ける
 */
const LOUVER_OUTLINE: readonly Point2D[] = [
  [163.0, -20.5],
  [187.0, -39.0],
  [195.0, -35.0],
  [166.0, -8.0],
];
const LOUVER_H = 3.5;

/** 南東の辺（SE_EDGE_A → SE_EDGE_B）を u、内向きを v にした枠（u = s、v = t） */
function seEdgeFrame(): LocalFrame {
  return makeFrame(SE_EDGE_A[0], SE_EDGE_A[1], SE_EDGE_B[0] - SE_EDGE_A[0], SE_EDGE_B[1] - SE_EDGE_A[1]);
}

function seToWorld(s: number, t: number): Point2D {
  return frameToWorld(seEdgeFrame(), s, t);
}

interface PerimeterSample {
  x: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
}

interface WallHit {
  worldX: number;
  worldZ: number;
  localZ: number;
  nx: number;
  nz: number;
  /** 当たった辺の中点 */
  edgeMidX: number;
  edgeMidZ: number;
}

function signedAreaXZ(ring: Point2D[]): number {
  let area2 = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (!a || !b) continue;
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  return area2 * 0.5;
}

/**
 * Normalizes a 2D (x, z) polygon ring to clockwise orientation when viewed from +Y.
 * For CW-from-+Y rings, edge a->b has outward normal (dz/len, -dx/len)
 * and inward normal (-dz/len, dx/len).
 */
function normalizeRingCW(polygon: Point2D[], cx: number, cz: number): Point2D[] {
  const cleaned: Point2D[] = [];
  for (const pt of polygon) {
    const prev = cleaned[cleaned.length - 1];
    if (prev && Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) < 1e-4) {
      continue;
    }
    cleaned.push([pt[0], pt[1]]);
  }
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (
    cleaned.length > 1 &&
    first &&
    last &&
    Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-4
  ) {
    cleaned.pop();
  }
  if (cleaned.length < 3) {
    return [
      [cx - 10, cz + 10],
      [cx - 10, cz - 10],
      [cx + 10, cz - 10],
      [cx + 10, cz + 10],
    ];
  }
  if (signedAreaXZ(cleaned) < 0) {
    cleaned.reverse();
  }
  return cleaned;
}

/**
 * Offsets each vertex inward by `dist` meters using clamped edge-normal miters.
 * Handles concave corners cleanly without poking vertices outside the footprint.
 */
function insetPolygon(ringCW: Point2D[], dist: number): Point2D[] {
  const n = ringCW.length;
  if (n < 3) return ringCW;
  const out: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ringCW[(i - 1 + n) % n];
    const curr = ringCW[i];
    const next = ringCW[(i + 1) % n];
    if (!prev || !curr || !next) continue;

    const dx1 = curr[0] - prev[0];
    const dz1 = curr[1] - prev[1];
    const len1 = Math.hypot(dx1, dz1);
    const dx2 = next[0] - curr[0];
    const dz2 = next[1] - curr[1];
    const len2 = Math.hypot(dx2, dz2);

    if (len1 < 1e-6 || len2 < 1e-6) {
      out.push([curr[0], curr[1]]);
      continue;
    }

    const n1x = -dz1 / len1;
    const n1z = dx1 / len1;
    const n2x = -dz2 / len2;
    const n2z = dx2 / len2;

    const bx = n1x + n2x;
    const bz = n1z + n2z;
    const bLen = Math.hypot(bx, bz);
    if (bLen < 1e-4) {
      out.push([curr[0] + n1x * dist, curr[1] + n1z * dist]);
      continue;
    }

    const ux = bx / bLen;
    const uz = bz / bLen;
    const cosHalf = ux * n1x + uz * n1z;
    const miterScale = cosHalf > 0.45 ? Math.min(2.2, 1 / cosHalf) : 2.2;
    out.push([curr[0] + ux * dist * miterScale, curr[1] + uz * dist * miterScale]);
  }
  return out;
}

function ringPerimeter(ringCW: Point2D[]): number {
  let total = 0;
  const n = ringCW.length;
  for (let i = 0; i < n; i++) {
    const a = ringCW[i];
    const b = ringCW[(i + 1) % n];
    if (!a || !b) continue;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

function pointInPolygon(x: number, z: number, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (!pi || !pj) continue;
    const [xi, zi] = pi;
    const [xj, zj] = pj;
    const intersect =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function samplePerimeter(ringCW: Point2D[], approxStep: number): PerimeterSample[] {
  const total = ringPerimeter(ringCW);
  if (total < 1e-4) return [];
  const count = Math.max(4, Math.round(total / approxStep));
  const step = total / count;
  const samples: PerimeterSample[] = [];

  const n = ringCW.length;
  let edgeIdx = 0;
  let edgeStartDist = 0;
  let nextSampleDist = step * 0.5;

  while (edgeIdx < n && samples.length < count) {
    const a = ringCW[edgeIdx];
    const b = ringCW[(edgeIdx + 1) % n];
    if (!a || !b) {
      edgeIdx++;
      continue;
    }
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) {
      edgeIdx++;
      continue;
    }
    const edgeEndDist = edgeStartDist + len;
    const tx = dx / len;
    const tz = dz / len;
    const nx = tz;
    const nz = -tx;

    while (nextSampleDist <= edgeEndDist && samples.length < count) {
      const t = (nextSampleDist - edgeStartDist) / len;
      samples.push({
        x: a[0] + dx * t,
        z: a[1] + dz * t,
        tx,
        tz,
        nx,
        nz,
      });
      nextSampleDist += step;
    }
    edgeStartDist = edgeEndDist;
    edgeIdx++;
  }

  return samples;
}

/**
 * Builds vertical side wall geometry along `ringCW` from `yBottom` to `yTop`.
 * U advances continuously by arc length divided by `uvUnitU` so vertical stripes
 * match wall length seamlessly around curves and angled edges.
 */
function buildSideWallGeometry(
  ringCW: Point2D[],
  yBottom: number,
  yTop: number,
  uvUnitU: number,
  uvUnitV: number,
  flipInward = false,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const n = ringCW.length;
  const h = yTop - yBottom;
  const vTop = h / uvUnitV;
  let cumDist = 0;

  for (let i = 0; i < n; i++) {
    const a = ringCW[i];
    const b = ringCW[(i + 1) % n];
    if (!a || !b) continue;

    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;

    const sign = flipInward ? -1 : 1;
    const nx = (dz / len) * sign;
    const nz = (-dx / len) * sign;

    const u0 = cumDist / uvUnitU;
    const u1 = (cumDist + len) / uvUnitU;
    const base = positions.length / 3;

    positions.push(
      a[0], yBottom, a[1],
      b[0], yBottom, b[1],
      b[0], yTop, b[1],
      a[0], yTop, a[1],
    );
    normals.push(
      nx, 0, nz,
      nx, 0, nz,
      nx, 0, nz,
      nx, 0, nz,
    );
    uvs.push(u0, 0, u1, 0, u1, vTop, u0, vTop);

    if (flipInward) {
      indices.push(base, base + 2, base + 3, base, base + 1, base + 2);
    } else {
      indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }

    cumDist += len;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function buildCapGeometry(
  ringCW: Point2D[],
  y: number,
  facing: 'up' | 'down',
): THREE.BufferGeometry {
  const shapePts = ringCW.map(([x, z]) => new THREE.Vector2(x, -z));
  if (THREE.ShapeUtils.isClockWise(shapePts)) {
    shapePts.reverse();
  }
  const shape = new THREE.Shape(shapePts);
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);

  if (facing === 'down') {
    const idx = geo.getIndex();
    if (idx) {
      for (let i = 0; i + 2 < idx.count; i += 3) {
        const i1 = idx.getX(i + 1);
        const i2 = idx.getX(i + 2);
        idx.setX(i + 1, i2);
        idx.setX(i + 2, i1);
      }
      idx.needsUpdate = true;
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a single closed thin perimeter wall (outer face, inner face, top rim)
 * between `outerRingCW` and `innerRingCW` of matching vertex count.
 */
function buildThinPerimeterWallGeometry(
  outerRingCW: Point2D[],
  innerRingCW: Point2D[],
  yBottom: number,
  yTop: number,
  /** 付けない辺（i 番の点 → i+1 番の点）。開いた所の両端は小口の面で閉じる */
  skipEdge: (i: number) => boolean = () => false,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const n = Math.min(outerRingCW.length, innerRingCW.length);

  const pushEndCap = (o: Point2D, inner: Point2D): void => {
    const base = positions.length / 3;
    positions.push(o[0], yBottom, o[1], inner[0], yBottom, inner[1], inner[0], yTop, inner[1], o[0], yTop, o[1]);
    const dx = inner[0] - o[0];
    const dz = inner[1] - o[1];
    const len = Math.hypot(dx, dz) || 1;
    // 小口は両面から見えるよう表裏の 2 枚
    const nx = -dz / len;
    const nz = dx / len;
    normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };

  for (let i = 0; i < n; i++) {
    const oA = outerRingCW[i];
    const oB = outerRingCW[(i + 1) % n];
    const iA = innerRingCW[i];
    const iB = innerRingCW[(i + 1) % n];
    if (!oA || !oB || !iA || !iB) continue;
    if (skipEdge(i)) continue;
    if (skipEdge((i - 1 + n) % n)) pushEndCap(oA, iA);
    if (skipEdge((i + 1) % n)) pushEndCap(oB, iB);

    const odx = oB[0] - oA[0];
    const odz = oB[1] - oA[1];
    const oLen = Math.hypot(odx, odz);
    if (oLen > 1e-6) {
      const nx = odz / oLen;
      const nz = -odx / oLen;
      const base = positions.length / 3;
      positions.push(
        oA[0], yBottom, oA[1],
        oB[0], yBottom, oB[1],
        oB[0], yTop, oB[1],
        oA[0], yTop, oA[1],
      );
      normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
      indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }

    const idx = iB[0] - iA[0];
    const idz = iB[1] - iA[1];
    const iLen = Math.hypot(idx, idz);
    if (iLen > 1e-6) {
      const nx = -idz / iLen;
      const nz = idx / iLen;
      const base = positions.length / 3;
      positions.push(
        iA[0], yBottom, iA[1],
        iB[0], yBottom, iB[1],
        iB[0], yTop, iB[1],
        iA[0], yTop, iA[1],
      );
      normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
      indices.push(base, base + 2, base + 3, base, base + 1, base + 2);
    }

    // Top rim quad facing +Y
    const topBase = positions.length / 3;
    positions.push(
      oA[0], yTop, oA[1],
      oB[0], yTop, oB[1],
      iB[0], yTop, iB[1],
      iA[0], yTop, iA[1],
    );
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    indices.push(topBase, topBase + 3, topBase + 2, topBase, topBase + 2, topBase + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

/**
 * Creates a multiplicative vertical stripe CanvasTexture.
 * Paired with material.color = '#8A5641':
 * - #FFFFFF stripe renders as #8A5641
 * - #DCDCE7 stripe renders as ~#76493A in sRGB after linear multiplication
 * Returns null in headless Node environments where `document` is unavailable.
 */
function createVerticalStripeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const w = 64;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w / 2, h);
  ctx.fillStyle = '#DCDCE7';
  ctx.fillRect(w / 2, 0, w / 2, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Intersects a vertical plane at `targetLx` (in front-group local X) with `ringCW`
 * and returns the front-most outward-facing hit on the west drum facade.
 */
function sampleFrontWallAt(
  ringCW: Point2D[],
  anchorX: number,
  anchorZ: number,
  fx: number,
  fz: number,
  targetLx: number,
): WallHit | null {
  let best: WallHit | null = null;
  const n = ringCW.length;

  for (let i = 0; i < n; i++) {
    const a = ringCW[i];
    const b = ringCW[(i + 1) % n];
    if (!a || !b) continue;

    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;

    const nx = dz / len;
    const nz = -dx / len;
    if (nx * fx + nz * fz < 0.15) continue;

    const lxA = (a[0] - anchorX) * fz + (a[1] - anchorZ) * -fx;
    const lzA = (a[0] - anchorX) * fx + (a[1] - anchorZ) * fz;
    const lxB = (b[0] - anchorX) * fz + (b[1] - anchorZ) * -fx;
    const lzB = (b[0] - anchorX) * fx + (b[1] - anchorZ) * fz;

    const minLx = Math.min(lxA, lxB);
    const maxLx = Math.max(lxA, lxB);
    if (targetLx < minLx - 1e-4 || targetLx > maxLx + 1e-4) continue;

    const span = lxB - lxA;
    const t = Math.abs(span) > 1e-6 ? Math.max(0, Math.min(1, (targetLx - lxA) / span)) : 0.5;
    const localZ = lzA + (lzB - lzA) * t;
    if (!best || localZ > best.localZ) {
      best = {
        worldX: a[0] + dx * t,
        worldZ: a[1] + dz * t,
        localZ,
        nx,
        nz,
        edgeMidX: (a[0] + b[0]) * 0.5,
        edgeMidZ: (a[1] + b[1]) * 0.5,
      };
    }
  }

  return best;
}

/** (x, z) にいちばん近い辺の中点と、その辺までの距離 */
function findNearestEdgeMid(
  ringCW: Point2D[],
  x: number,
  z: number,
): { midX: number; midZ: number; dist: number } | null {
  let best: { midX: number; midZ: number; dist: number } | null = null;
  const n = ringCW.length;
  for (let i = 0; i < n; i++) {
    const a = ringCW[i];
    const b = ringCW[(i + 1) % n];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-8) continue;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
    const dist = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
    if (!best || dist < best.dist) {
      best = { midX: (a[0] + b[0]) * 0.5, midZ: (a[1] + b[1]) * 0.5, dist };
    }
  }
  return best;
}

/** 点 p にいちばん近い頂点の番号（maxDist より遠ければ −1） */
function nearestVertexIndex(ring: Point2D[], p: Readonly<Point2D>, maxDist: number): number {
  let best = -1;
  let bestD = maxDist;
  ring.forEach(([x, z], i) => {
    const d = Math.hypot(x - p[0], z - p[1]);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** 点 p を、いちばん近い辺の途中に頂点として入れる（辺から maxDist より遠い・すでに頂点に近いときは入れない） */
function insertPointOnRing(ring: Point2D[], p: Readonly<Point2D>, maxDist: number): Point2D[] {
  let best = -1;
  let bestD = Infinity;
  let bestT = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-8) continue;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
    const d = Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
    if (d < bestD) {
      bestD = d;
      best = i;
      bestT = t;
    }
  }
  if (best < 0 || bestD > maxDist || bestT < 0.01 || bestT > 0.99) return ring;
  const out = ring.slice();
  out.splice(best + 1, 0, [p[0], p[1]]);
  return out;
}

/** 点の並び path（どれも輪郭の頂点に近い点）を順につなぐ辺なら true を返す判定（柵を付けない辺） */
function edgesAlongPath(ring: Point2D[], path: readonly Point2D[], maxDist: number): (i: number) => boolean {
  const n = ring.length;
  const idx = path.map((p) => nearestVertexIndex(ring, p, maxDist));
  const skip = new Set<number>();
  for (let k = 0; k + 1 < idx.length; k++) {
    const a = idx[k];
    const b = idx[k + 1];
    if (a === undefined || b === undefined || a < 0 || b < 0) continue;
    if ((a + 1) % n === b) skip.add(a);
    else if ((b + 1) % n === a) skip.add(b);
  }
  return (i) => skip.has(i);
}

/** 辺の中点が点 p にいちばん近い辺なら true を返す判定 */
function edgeNearest(ring: Point2D[], p: Readonly<Point2D>): (i: number) => boolean {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    const d = Math.hypot((a[0] + b[0]) / 2 - p[0], (a[1] + b[1]) / 2 - p[1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return (i) => i === best;
}

function deterministicHash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

interface EastWingFrame {
  midX: number;
  midZ: number;
  uNEx: number;
  uNEz: number;
  nInX: number;
  nInZ: number;
  edgeLen: number;
}

function findEastWingFrame(ringCW: Point2D[], cx: number, cz: number): EastWingFrame {
  let bestLen = -1;
  let bestA: Point2D | null = null;
  let bestB: Point2D | null = null;

  const n = ringCW.length;
  // Prefer the longest SE-facing edge on the eastern side (P10 -> P11 on Rimpukan)
  for (let i = 0; i < n; i++) {
    const a = ringCW[i];
    const b = ringCW[(i + 1) % n];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const mx = (a[0] + b[0]) * 0.5;
    const nx = dz / len;
    const nz = -dx / len;
    if (mx >= cx && nx > 0 && nz > 0 && len > bestLen) {
      bestLen = len;
      bestA = a;
      bestB = b;
    }
  }

  // Fallback to longest overall edge if polygon is non-standard
  if (!bestA || !bestB) {
    for (let i = 0; i < n; i++) {
      const a = ringCW[i];
      const b = ringCW[(i + 1) % n];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > bestLen) {
        bestLen = len;
        bestA = a;
        bestB = b;
      }
    }
  }

  if (!bestA || !bestB || bestLen < 1e-4) {
    return {
      midX: cx + 20,
      midZ: cz,
      uNEx: 1,
      uNEz: 0,
      nInX: 0,
      nInZ: -1,
      edgeLen: 20,
    };
  }

  const dx = bestB[0] - bestA[0];
  const dz = bestB[1] - bestA[1];
  return {
    midX: (bestA[0] + bestB[0]) * 0.5,
    midZ: (bestA[1] + bestB[1]) * 0.5,
    uNEx: -dx / bestLen,
    uNEz: -dz / bestLen,
    nInX: -dz / bestLen,
    nInZ: dx / bestLen,
    edgeLen: bestLen,
  };
}

export const buildRimpukan: HeroBuilder = (ctx) => {
  const { building, groundVisualY } = ctx;
  const cx = building.centroid.x;
  const cz = building.centroid.z;

  const floor1H = FLOOR1_M;
  const deckH = RIMPUKAN_DECK_M;
  /** 屋上の庭の面（4 階の屋根）。OSM の高さ 16.6m（4 階の階高 4.2m）。低すぎる値のときも 4 階の床の 3m 上より上 */
  const roofH = Math.max(deckH + 3.0, building.height > 6 ? building.height : 16.6);

  const ringCW = normalizeRingCW(building.polygon, cx, cz);
  const ring1F = insetPolygon(ringCW, 2.5);
  const ringColumns = insetPolygon(ringCW, 0.95);
  // 4 階と屋上の庭（空中写真で読んだ一回り小さい輪郭）。壁は庇の分だけ内側
  const ringUpper = normalizeRingCW(
    UPPER_OUTLINE.map(([x, z]) => [x, z] as Point2D),
    cx,
    cz,
  );
  const ringUpperWall = insetPolygon(ringUpper, UPPER_EAVE_M);
  const ringFenceOuter = insetPolygon(ringUpper, 0.15);
  const ringFenceInner = insetPolygon(ringUpper, 0.25);
  const ringPoles = insetPolygon(ringUpper, 0.8);
  const ringSakuraBounds = insetPolygon(ringUpper, 2.0);

  const group = new THREE.Group();
  group.name = 'hero-rimpukan';

  // --- Shared materials ---
  const stripeTex = createVerticalStripeTexture();
  const wallMat = new THREE.MeshStandardMaterial({
    color: WALL_HEX,
    roughness: 0.78,
    metalness: 0.04,
    ...(stripeTex ? { map: stripeTex } : {}),
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: GLASS_HEX,
    roughness: 0.62,
    metalness: 0.08,
  });
  const soffitMat = new THREE.MeshStandardMaterial({
    color: SOFFIT_HEX,
    roughness: 0.78,
    metalness: 0.03,
  });
  const columnMat = new THREE.MeshStandardMaterial({
    color: COLUMN_HEX,
    roughness: 0.8,
    metalness: 0.03,
  });
  const solarMat = new THREE.MeshStandardMaterial({
    color: SOLAR_HEX,
    roughness: 0.64,
    metalness: 0.1,
  });
  const soilMat = new THREE.MeshStandardMaterial({
    color: SOIL_HEX,
    roughness: 0.9,
    metalness: 0.02,
  });
  const railingMat = new THREE.MeshStandardMaterial({
    color: RAILING_HEX,
    roughness: 0.65,
    metalness: 0.25,
  });
  const trunkMat = new THREE.MeshStandardMaterial({
    color: TRUNK_HEX,
    roughness: 0.88,
    metalness: 0.02,
  });
  const sakuraMat = new THREE.MeshStandardMaterial({
    color: SAKURA_HEX,
    roughness: 0.84,
    metalness: 0.02,
  });
  const poleMat = new THREE.MeshStandardMaterial({
    color: POLE_HEX,
    roughness: 0.65,
    metalness: 0.2,
  });
  const upperMat = new THREE.MeshStandardMaterial({
    color: UPPER_HEX,
    roughness: 0.76,
    metalness: 0.04,
  });
  const stairMat = new THREE.MeshStandardMaterial({
    color: STAIR_HEX,
    roughness: 0.8,
    metalness: 0.04,
  });
  const openingMat = new THREE.MeshStandardMaterial({
    color: OPENING_HEX,
    roughness: 0.85,
    metalness: 0.04,
  });
  const plaqueFrameMat = new THREE.MeshStandardMaterial({
    color: PLAQUE_FRAME_HEX,
    roughness: 0.74,
    metalness: 0.06,
  });
  const plaqueInnerMat = new THREE.MeshStandardMaterial({
    color: PLAQUE_INNER_HEX,
    roughness: 0.72,
    metalness: 0.08,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: WINDOW_HEX,
    roughness: 0.62,
    metalness: 0.08,
  });

  // --- West drum front frame (local +Z points WSW outward, local +X points SSE) ---
  const frontDirLen = Math.hypot(FRONT_DIR_RAW_X, FRONT_DIR_RAW_Z);
  const fx = FRONT_DIR_RAW_X / frontDirLen;
  const fz = FRONT_DIR_RAW_Z / frontDirLen;

  let maxProj = -Infinity;
  for (const [x, z] of ringCW) {
    const p = x * fx + z * fz;
    if (p > maxProj) maxProj = p;
  }

  let minFrontLx = Infinity;
  let maxFrontLx = -Infinity;
  for (const [x, z] of ringCW) {
    const p = x * fx + z * fz;
    if (p >= maxProj - 4.5) {
      const lx = x * fz + z * -fx;
      if (lx < minFrontLx) minFrontLx = lx;
      if (lx > maxFrontLx) maxFrontLx = lx;
    }
  }
  const frontCenterLx = Number.isFinite(minFrontLx)
    ? (minFrontLx + maxFrontLx) * 0.5
    : cx * fz + cz * -fx;

  // Initial point along front center ray to sample exact rim intersection
  const probeAnchorX = frontCenterLx * fz + maxProj * fx;
  const probeAnchorZ = frontCenterLx * -fx + maxProj * fz;
  const centerRimHit = sampleFrontWallAt(ringCW, probeAnchorX, probeAnchorZ, fx, fz, 0);
  // OSM の階段の上端（ドラムの南西の縁）を正面の基準にする。大階段・入口・校章の枠はこの点から
  // 正面の向きに出す。目安の点の近くに辺が無い輪郭では、正面の中心の線が当たる辺の中点を使う
  const hintedEdge = findNearestEdgeMid(ringCW, FRONT_EDGE_HINT_X, FRONT_EDGE_HINT_Z);
  const useHint = hintedEdge !== null && hintedEdge.dist <= FRONT_EDGE_HINT_MAX_DIST_M;
  // 目安の点（OSM の階段の上端）が輪郭の近くにあれば、辺の中点ではなくその点そのものを基準にする
  const anchorX = useHint
    ? FRONT_EDGE_HINT_X
    : centerRimHit
      ? centerRimHit.edgeMidX
      : probeAnchorX;
  const anchorZ = useHint
    ? FRONT_EDGE_HINT_Z
    : centerRimHit
      ? centerRimHit.edgeMidZ
      : probeAnchorZ;

  const toFrontLocal = (x: number, z: number): [number, number] => {
    const dx = x - anchorX;
    const dz = z - anchorZ;
    return [dx * fz + dz * -fx, dx * fx + dz * fz];
  };
  const frontLocalToWorld = (lx: number, lz: number): [number, number] => [
    anchorX + lx * fz + lz * fx,
    anchorZ - lx * fx + lz * fz,
  ];

  // --- 地面の高さ ---
  // 大階段の割り付け（正面のローカル z: 0 = ドラムの先端の辺、+ = 道の側）
  const stairWidth = 18.0;
  const stairBackZ = -3.0; // tucked into curved drum to close side gaps
  const landingFrontZ = 1.0;
  const stairFrontZ = STAIR_FOOT_DISTANCE_M;
  const sampleGround = ctx.sampleGroundVisualY;
  const groundAtFront = (lx: number, lz: number): number => {
    const [wx, wz] = frontLocalToWorld(lx, lz);
    return sampleGround(wx, wz);
  };

  // 階段の下端: 道寄りの段の前の線に沿って引いた地面のいちばん低い所（どこにも段の前の段差が出ない）
  let stairFootY = Infinity;
  const footSampleCount = 7;
  for (let i = 0; i < footSampleCount; i++) {
    const lx = -stairWidth * 0.5 + (stairWidth * i) / (footSampleCount - 1);
    stairFootY = Math.min(stairFootY, groundAtFront(lx, stairFrontZ));
  }

  // 底: 輪郭の各点（辺の上も 4m おき）と階段の範囲で引いた地面のいちばん低い所より 0.5m 下
  let lowestGroundY = stairFootY;
  for (let i = 0; i < ringCW.length; i++) {
    const a = ringCW[i];
    const b = ringCW[(i + 1) % ringCW.length];
    if (!a || !b) continue;
    const segments = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4.0));
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      lowestGroundY = Math.min(
        lowestGroundY,
        sampleGround(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t),
      );
    }
  }
  for (let iu = 0; iu < 4; iu++) {
    for (let iw = 0; iw < 4; iw++) {
      const lx = -stairWidth * 0.5 + (stairWidth * iu) / 3;
      const lz = stairBackZ + ((stairFrontZ - stairBackZ) * iw) / 3;
      lowestGroundY = Math.min(lowestGroundY, groundAtFront(lx, lz));
    }
  }
  const bottomY = lowestGroundY - FOOTING_BELOW_LOWEST_GROUND_M;
  /** 1 階の柱などを、底から 2 階の床（軒裏）まで伸ばすときの縦の倍率 */
  const floor1Top = groundVisualY + floor1H;
  const floor1StretchY = (floor1Top - bottomY) / floor1H;

  // --- 1. 2〜3 階の茶色の縦縞の壁（2 階の床から 3 階の屋根まで。4 階は一回り小さいので別） ---
  const perim = ringPerimeter(ringCW);
  const stripePairCount = Math.max(1, Math.round(perim / 1.2));
  const stripePairWidth = perim / stripePairCount; // ~1.2m per pair = ~0.6m per stripe

  const bodyWallGeo = buildSideWallGeometry(
    ringCW,
    groundVisualY + floor1H,
    groundVisualY + deckH,
    stripePairWidth,
    1.2,
  );
  const bodyWallMesh = new THREE.Mesh(bodyWallGeo, wallMat);
  bodyWallMesh.name = 'rimpukan-body-walls';
  bodyWallMesh.castShadow = true;
  bodyWallMesh.receiveShadow = true;
  group.add(bodyWallMesh);

  // Overhang soffit (light wood tone on the underside of the 2F-4F projection)
  const soffitGeo = buildCapGeometry(ringCW, groundVisualY + floor1H, 'down');
  const soffitMesh = new THREE.Mesh(soffitGeo, soffitMat);
  soffitMesh.name = 'rimpukan-body-soffit';
  soffitMesh.receiveShadow = true;
  group.add(soffitMesh);

  // --- 2. 1F recessed dark glass volume (0 - 4.2m)。底は斜面のいちばん低い地面より下まで ---
  const glassWallGeo = buildSideWallGeometry(ring1F, bottomY, floor1Top, 4.0, 4.0);
  const glassMesh = new THREE.Mesh(glassWallGeo, glassMat);
  glassMesh.name = 'rimpukan-floor1-glass';
  glassMesh.castShadow = true;
  glassMesh.receiveShadow = true;
  group.add(glassMesh);

  // --- 3. 1F stone columns (square colonnade + 2 front round columns) ---
  const denseColSamples = samplePerimeter(ringColumns, 0.6);
  let roundColNorth: PerimeterSample | null = null;
  let roundColNorthLz = -Infinity;
  let roundColSouth: PerimeterSample | null = null;
  let roundColSouthLz = -Infinity;

  for (const s of denseColSamples) {
    const [lx, lz] = toFrontLocal(s.x, s.z);
    if (lz <= -4.6 && lz >= -11.0) {
      if (lx < -3.0 && lz > roundColNorthLz) {
        roundColNorthLz = lz;
        roundColNorth = s;
      } else if (lx > 3.0 && lz > roundColSouthLz) {
        roundColSouthLz = lz;
        roundColSouth = s;
      }
    }
  }

  const roundCols: PerimeterSample[] = [];
  if (roundColNorth) roundCols.push(roundColNorth);
  if (roundColSouth) roundCols.push(roundColSouth);

  const dummy = new THREE.Object3D();

  if (roundCols.length > 0) {
    const roundColGeo = new THREE.CylinderGeometry(0.46, 0.46, floor1H, 14);
    roundColGeo.translate(0, floor1H * 0.5, 0);
    const roundColInst = new THREE.InstancedMesh(roundColGeo, columnMat, roundCols.length);
    roundColInst.name = 'rimpukan-columns-round';
    roundColInst.receiveShadow = true;
    for (let i = 0; i < roundCols.length; i++) {
      const c = roundCols[i];
      if (!c) continue;
      dummy.position.set(c.x, bottomY, c.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, floor1StretchY, 1);
      dummy.updateMatrix();
      roundColInst.setMatrixAt(i, dummy.matrix);
    }
    roundColInst.instanceMatrix.needsUpdate = true;
    roundColInst.computeBoundingBox();
    roundColInst.computeBoundingSphere();
    group.add(roundColInst);
  }

  const rawSquareCols = samplePerimeter(ringColumns, 9.0);
  const squareCols = rawSquareCols.filter((s) => {
    const [lx, lz] = toFrontLocal(s.x, s.z);
    // Exclude columns inside the front grand staircase footprint
    if (Math.abs(lx) < 9.8 && lz > -4.4) return false;
    // Avoid duplicating near the two front round columns
    for (const rc of roundCols) {
      if (Math.hypot(s.x - rc.x, s.z - rc.z) < 4.0) return false;
    }
    return true;
  });

  if (squareCols.length > 0) {
    const squareColGeo = new THREE.BoxGeometry(0.9, floor1H, 0.9);
    squareColGeo.translate(0, floor1H * 0.5, 0);
    const squareColInst = new THREE.InstancedMesh(squareColGeo, columnMat, squareCols.length);
    squareColInst.name = 'rimpukan-columns-square';
    squareColInst.receiveShadow = true;
    for (let i = 0; i < squareCols.length; i++) {
      const c = squareCols[i];
      if (!c) continue;
      dummy.position.set(c.x, bottomY, c.z);
      dummy.rotation.set(0, Math.atan2(c.nx, c.nz), 0);
      dummy.scale.set(1, floor1StretchY, 1);
      dummy.updateMatrix();
      squareColInst.setMatrixAt(i, dummy.matrix);
    }
    squareColInst.instanceMatrix.needsUpdate = true;
    squareColInst.computeBoundingBox();
    squareColInst.computeBoundingSphere();
    group.add(squareColInst);
  }

  // --- 4. 3 階の屋根（4 階の床の高さ）: 床の面、縁の太陽光パネルの柵と白い手すり、デッキ、北東の棟の設備の囲い ---
  const deckY = groundVisualY + deckH;
  // 3 階の屋根の面（茶色のタイル。裏の大階段と同じ材質。空中写真では茶色がかった面）
  const terraceGeo = buildCapGeometry(ringCW, deckY, 'up');
  const terraceMesh = new THREE.Mesh(terraceGeo, stairMat);
  terraceMesh.name = 'rimpukan-terrace-floor';
  terraceMesh.castShadow = true;
  terraceMesh.receiveShadow = true;
  group.add(terraceMesh);

  // 縁の太陽光パネルの柵。裏の大階段が着く口（輪郭の切り欠き〜北東の棟の北西の面の途中）は開け、
  // 北東の棟の縁は低い白い壁にする
  let ringFence = ringCW;
  for (const p of [...STAIR_TOP_OPENING, ...WING_EDGE_PATH]) ringFence = insertPointOnRing(ringFence, p, 3.0);
  const onStairTop = edgesAlongPath(ringFence, STAIR_TOP_OPENING, 1.0);
  const onWing = edgesAlongPath(ringFence, WING_EDGE_PATH, 1.0);
  const skipStairTop = (i: number): boolean => onStairTop(i) || onWing(i);
  const ringFenceIn = insetPolygon(ringFence, SOLAR_FENCE_THICK_M);
  const solarFenceGeo = buildThinPerimeterWallGeometry(
    ringFence,
    ringFenceIn,
    deckY,
    deckY + SOLAR_FENCE_M,
    skipStairTop,
  );
  const solarFenceMesh = new THREE.Mesh(solarFenceGeo, solarMat);
  solarFenceMesh.name = 'rimpukan-solar-fence';
  solarFenceMesh.castShadow = true;
  solarFenceMesh.receiveShadow = true;
  group.add(solarFenceMesh);
  const solarRailGeo = buildThinPerimeterWallGeometry(
    ringFence,
    ringFenceIn,
    deckY + SOLAR_FENCE_M,
    deckY + SOLAR_FENCE_M + SOLAR_RAIL_M,
    skipStairTop,
  );
  const solarRailMesh = new THREE.Mesh(solarRailGeo, railingMat);
  solarRailMesh.name = 'rimpukan-solar-rail';
  solarRailMesh.receiveShadow = true;
  group.add(solarRailMesh);
  const wingParapetGeo = buildThinPerimeterWallGeometry(
    ringFence,
    ringFenceIn,
    deckY,
    deckY + WING_PARAPET_M,
    (i) => !onWing(i),
  );
  const wingParapetMesh = new THREE.Mesh(wingParapetGeo, railingMat);
  wingParapetMesh.name = 'rimpukan-wing-parapet';
  wingParapetMesh.receiveShadow = true;
  group.add(wingParapetMesh);

  // 裏の大階段の上のデッキ（木の床。3 階の屋根の面の少し上）
  const deckMat = new THREE.MeshStandardMaterial({ color: DECK_HEX, roughness: 0.86, metalness: 0.02 });
  const deckGeo = buildCapGeometry(
    normalizeRingCW(DECK_OUTLINE.map(([x, z]) => [x, z] as Point2D), cx, cz),
    deckY + 0.03,
    'up',
  );
  const deckMesh = new THREE.Mesh(deckGeo, deckMat);
  deckMesh.name = 'rimpukan-deck';
  deckMesh.receiveShadow = true;
  group.add(deckMesh);

  // 北東の棟の屋上の設備の黒い横ルーバーの囲い（上は開ける。太陽光パネルと同じ濃い灰）
  const louverRing = normalizeRingCW(LOUVER_OUTLINE.map(([x, z]) => [x, z] as Point2D), cx, cz);
  const louverGeo = buildThinPerimeterWallGeometry(
    louverRing,
    insetPolygon(louverRing, 0.15),
    deckY,
    deckY + LOUVER_H,
  );
  const louverMesh = new THREE.Mesh(louverGeo, solarMat);
  louverMesh.name = 'rimpukan-louver-enclosure';
  louverMesh.castShadow = true;
  louverMesh.receiveShadow = true;
  group.add(louverMesh);

  const wing = findEastWingFrame(ringCW, cx, cz);

  // --- 5. 4 階（一回り小さいベージュの階。庇の下に壁）と屋上の庭（土の面・白い柵・桜の格子・白い柱） ---
  const roofY = groundVisualY + roofH;
  const slabBottomY = roofY - UPPER_SLAB_M;
  const upperWallGeo = buildSideWallGeometry(ringUpperWall, deckY, slabBottomY + 0.02, 4.0, 4.0);
  const upperWallMesh = new THREE.Mesh(upperWallGeo, upperMat);
  upperWallMesh.name = 'rimpukan-upper-walls';
  upperWallMesh.castShadow = true;
  upperWallMesh.receiveShadow = true;
  group.add(upperWallMesh);
  const upperSlabSideGeo = buildSideWallGeometry(ringUpper, slabBottomY, roofY, 4.0, 4.0);
  const upperSlabSideMesh = new THREE.Mesh(upperSlabSideGeo, upperMat);
  upperSlabSideMesh.name = 'rimpukan-upper-eave';
  upperSlabSideMesh.castShadow = true;
  upperSlabSideMesh.receiveShadow = true;
  group.add(upperSlabSideMesh);
  const upperSoffitGeo = buildCapGeometry(ringUpper, slabBottomY, 'down');
  const upperSoffitMesh = new THREE.Mesh(upperSoffitGeo, upperMat);
  upperSoffitMesh.name = 'rimpukan-upper-soffit';
  upperSoffitMesh.castShadow = true;
  upperSoffitMesh.receiveShadow = true;
  group.add(upperSoffitMesh);

  const roofSoilY = roofY;
  const soilGeo = buildCapGeometry(ringUpper, roofSoilY, 'up');
  const soilMesh = new THREE.Mesh(soilGeo, soilMat);
  soilMesh.name = 'rimpukan-roof-soil';
  soilMesh.receiveShadow = true;
  group.add(soilMesh);

  // 屋上の庭の縁の白い柵。デッキから上る階段の上端の辺は開ける
  const stairTopMid = seToWorld(UPPER_STAIR_TOP_S, (UPPER_STAIR_OUT_T + 12.0) / 2);
  const railingGeo = buildThinPerimeterWallGeometry(
    ringFenceOuter,
    ringFenceInner,
    roofY,
    roofY + GARDEN_FENCE_M,
    edgeNearest(ringFenceOuter, stairTopMid),
  );
  const railingMesh = new THREE.Mesh(railingGeo, railingMat);
  railingMesh.name = 'rimpukan-roof-railing';
  railingMesh.receiveShadow = true;
  group.add(railingMesh);

  // 桜: 屋上の庭の格子（南東の長い辺にそろえる）と、4 階の外のテラスの西の縁の列
  let minS = Infinity;
  let maxS = -Infinity;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const [x, z] of ringSakuraBounds) {
    const dx = x - wing.midX;
    const dz = z - wing.midZ;
    const s = dx * wing.uNEx + dz * wing.uNEz;
    const t = dx * wing.nInX + dz * wing.nInZ;
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }

  interface SakuraPlacement {
    x: number;
    z: number;
    baseY: number;
    totalH: number;
    rotY: number;
  }

  const sakuraPlacements: SakuraPlacement[] = [];
  const sStart = Math.floor(minS / SAKURA_GRID_M) * SAKURA_GRID_M;
  const tStart = Math.floor(minT / SAKURA_GRID_M) * SAKURA_GRID_M;

  for (let s = sStart; s <= maxS; s += SAKURA_GRID_M) {
    for (let t = tStart; t <= maxT; t += SAKURA_GRID_M) {
      const h1 = deterministicHash(s, t);
      const h2 = deterministicHash(s + 37.3, t - 19.1);
      const h3 = deterministicHash(s - 11.7, t + 53.9);
      const js = s + (h1 - 0.5) * 0.45;
      const jt = t + (h2 - 0.5) * 0.45;

      const wx = wing.midX + js * wing.uNEx + jt * wing.nInX;
      const wz = wing.midZ + js * wing.uNEz + jt * wing.nInZ;
      if (!pointInPolygon(wx, wz, ringSakuraBounds)) continue;

      sakuraPlacements.push({
        x: wx,
        z: wz,
        baseY: roofSoilY,
        totalH: 4.0 + h3 * 1.0, // 4.0m - 5.0m
        rotY: h1 * Math.PI * 2,
      });
    }
  }

  // テラスの西の縁の列: 1〜3 階の輪郭から内へ一定の距離の線の上に一定の間隔で。4 階の壁から離れた所（テラスが広い所）だけ
  const ringTerraceTrees = insetPolygon(ringCW, TERRACE_TREE_INSET_M);
  for (const sample of samplePerimeter(ringTerraceTrees, TERRACE_TREE_SPACING_M)) {
    // 西の側（輪郭の外向きの法線が西を向く辺）だけ。大階段の上端の切り欠き（デッキ）のまわりは除く
    if (sample.nx > -0.35) continue;
    if (!pointInPolygon(sample.x, sample.z, ringCW)) continue;
    const [stairTopX, stairTopZ] = STAIR_TOP_OPENING[1] ?? [0, 0];
    if (Math.hypot(sample.x - stairTopX, sample.z - stairTopZ) < 10) continue;
    // 樹冠（半径 約 2m）が 4 階の庇に当たらない所
    let nearUpper = Infinity;
    for (let i = 0; i < ringUpper.length; i++) {
      const a = ringUpper[i];
      const b = ringUpper[(i + 1) % ringUpper.length];
      if (!a || !b) continue;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-8) continue;
      const t = Math.max(0, Math.min(1, ((sample.x - a[0]) * dx + (sample.z - a[1]) * dz) / len2));
      nearUpper = Math.min(nearUpper, Math.hypot(a[0] + dx * t - sample.x, a[1] + dz * t - sample.z));
    }
    // 4 階の縁から 2.4〜6m の帯（西のテラス）だけ。北東の棟の屋上（4 階から遠い）には植えない
    if (nearUpper < 2.4 || nearUpper > 6.0 || pointInPolygon(sample.x, sample.z, ringUpper)) continue;
    const h3 = deterministicHash(sample.x, sample.z);
    sakuraPlacements.push({
      x: sample.x,
      z: sample.z,
      baseY: deckY,
      totalH: 4.0 + h3 * 0.8,
      rotY: h3 * Math.PI * 2,
    });
  }

  if (sakuraPlacements.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.19, 1.0, 6);
    trunkGeo.translate(0, 0.5, 0);
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, sakuraPlacements.length);
    trunkInst.name = 'rimpukan-sakura-trunks';
    trunkInst.receiveShadow = true;

    const crownGeo = new THREE.IcosahedronGeometry(1.0, 1);
    const crownInst = new THREE.InstancedMesh(crownGeo, sakuraMat, sakuraPlacements.length);
    crownInst.name = 'rimpukan-sakura-crowns';
    crownInst.receiveShadow = true;

    for (let i = 0; i < sakuraPlacements.length; i++) {
      const p = sakuraPlacements[i];
      if (!p) continue;
      const trunkH = p.totalH * 0.54;
      const rY = p.totalH * 0.34;
      const rXZ = rY * 1.22;

      dummy.position.set(p.x, p.baseY, p.z);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.set(1, trunkH, 1);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(p.x, p.baseY + p.totalH - rY, p.z);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.set(rXZ, rY, rXZ);
      dummy.updateMatrix();
      crownInst.setMatrixAt(i, dummy.matrix);
    }

    trunkInst.instanceMatrix.needsUpdate = true;
    trunkInst.computeBoundingBox();
    trunkInst.computeBoundingSphere();

    crownInst.instanceMatrix.needsUpdate = true;
    crownInst.computeBoundingBox();
    crownInst.computeBoundingSphere();

    group.add(trunkInst, crownInst);
  }

  // ~6 thin white poles (0.25m diameter, 3.0m height) along west rooftop edge, no blades
  const densePoleSamples = samplePerimeter(ringPoles, 0.6);
  const westEdgeSamples = densePoleSamples.filter((s) => {
    const [, lz] = toFrontLocal(s.x, s.z);
    return lz > -15.5;
  });

  const poleCount = 6;
  const chosenPoles: PerimeterSample[] = [];
  if (westEdgeSamples.length >= poleCount) {
    // Sort laterally along the west drum arc so poles space evenly end to end
    const sortedWest = [...westEdgeSamples].sort(
      (a, b) => toFrontLocal(a.x, a.z)[0] - toFrontLocal(b.x, b.z)[0],
    );
    for (let i = 0; i < poleCount; i++) {
      const idx = Math.floor(((i + 0.5) / poleCount) * sortedWest.length);
      const sample = sortedWest[Math.min(sortedWest.length - 1, idx)];
      if (sample) chosenPoles.push(sample);
    }
  } else {
    for (let i = 0; i < Math.min(poleCount, densePoleSamples.length); i++) {
      const sample = densePoleSamples[i];
      if (sample) chosenPoles.push(sample);
    }
  }

  if (chosenPoles.length > 0) {
    const poleGeo = new THREE.CylinderGeometry(0.125, 0.125, 3.0, 8);
    poleGeo.translate(0, 1.5, 0);
    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, chosenPoles.length);
    poleInst.name = 'rimpukan-roof-poles';
    for (let i = 0; i < chosenPoles.length; i++) {
      const p = chosenPoles[i];
      if (!p) continue;
      dummy.position.set(p.x, groundVisualY + roofH, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);
    }
    poleInst.instanceMatrix.needsUpdate = true;
    poleInst.computeBoundingBox();
    poleInst.computeBoundingSphere();
    group.add(poleInst);
  }

  // --- 6. デッキから屋上の庭へ上る階段（南東の辺に沿って南西へ。茶色のタイルの段と、外の白い手すり壁） ---
  {
    const upperRise = roofY - deckY;
    const risers = Math.max(2, Math.ceil(upperRise / UPPER_STAIR_RISER_MAX_M - 1e-6));
    const riserH = upperRise / risers;
    const seLocal = createLocalGroup(seEdgeFrame());
    seLocal.name = 'rimpukan-upper-stair-frame';
    const stepBucket = new TriBucket();
    const parapetBucket = new TriBucket();
    // k 段目（1〜risers）の上面は 3 階の屋根から k 段ぶん。最後の段は屋上の庭の面の高さで、庇の下を 4 階の壁まで
    const sTop = UPPER_STAIR_TOP_S;
    const sBottom = sTop - (risers - 1) * UPPER_STAIR_TREAD_M;
    for (let k = 1; k <= risers; k++) {
      const s0 = sBottom + (k - 1) * UPPER_STAIR_TREAD_M;
      const s1 = k === risers ? sTop + UPPER_EAVE_M : s0 + UPPER_STAIR_TREAD_M + 0.01;
      pushBox(
        { sides: stepBucket, top: stepBucket, skip: k === risers ? ['+v'] : ['+u', '+v'] },
        s0,
        s1,
        deckY,
        deckY + k * riserH,
        UPPER_STAIR_OUT_T,
        UPPER_STAIR_IN_T,
      );
    }
    // 外の手すり壁（段の鼻の線から 1.0m 上。下端は 3 階の屋根）
    const [pv0, pv1] = UPPER_STAIR_PARAPET_T;
    pushWallStrip(
      parapetBucket,
      [
        [sBottom - 0.6, deckY + 1.0, deckY],
        [sBottom, deckY + riserH + 1.0, deckY],
        [sTop, roofY + 1.0, deckY],
        [sTop + 0.3, roofY + 1.0, deckY],
      ],
      pv0,
      pv1,
    );
    addBucketMesh(seLocal, stepBucket, stairMat, 'rimpukan-upper-stair', true);
    addBucketMesh(seLocal, parapetBucket, railingMat, 'rimpukan-upper-stair-parapet', false);
    group.add(seLocal);
  }

  // --- 7. West front grand staircase, entrances, and 8. 3F square plaque ---
  const frontGroup = new THREE.Group();
  frontGroup.name = 'rimpukan-front-group';
  // 高さはワールドの値で組む（group の y は 0）
  frontGroup.position.set(anchorX, 0, anchorZ);
  // Maps local +Z -> (fx, 0, fz) outward (W, slightly N), local +X -> (fz, 0, -fx) (S, slightly W)
  frontGroup.rotation.y = Math.atan2(fx, fz);

  // 上端は 2 階の床、下端は道寄りの段の前の地面。総高を 0.2m 以下の段に割る
  const landingTopY = floor1Top;
  const footY = Math.min(stairFootY, landingTopY - 0.4);
  const stairRise = landingTopY - footY;
  const riserCount = Math.max(2, Math.ceil(stairRise / STAIR_RISER_MAX_M - 1e-6));
  const riser = stairRise / riserCount;

  const wingThick = 0.8;
  const landingDepth = landingFrontZ - stairBackZ;
  const landingCenterZ = (stairBackZ + landingFrontZ) * 0.5;
  const landingDeckThickness = 1.2;
  const landingUndersideY = landingTopY - landingDeckThickness;

  // 2F top landing bridge spanning between the two 0.8m wing walls (no coplanar overlap)
  const innerStairWidth = stairWidth - wingThick * 2; // 16.4m
  const landingGeo = new THREE.BoxGeometry(innerStairWidth, landingDeckThickness, landingDepth);
  const landingMesh = new THREE.Mesh(landingGeo, stairMat);
  landingMesh.name = 'rimpukan-stairs-landing';
  landingMesh.position.set(0, landingUndersideY + landingDeckThickness * 0.5, landingCenterZ);
  landingMesh.castShadow = true;
  landingMesh.receiveShadow = true;
  frontGroup.add(landingMesh);

  // One solid full-width mass under the landing (photo: a single unbroken staircase, no central gap)
  const supportH = landingUndersideY - bottomY;
  const supportGeo = new THREE.BoxGeometry(innerStairWidth, supportH, landingDepth);
  supportGeo.translate(0, supportH * 0.5, 0);
  const supportMesh = new THREE.Mesh(supportGeo, stairMat);
  supportMesh.name = 'rimpukan-stairs-support';
  supportMesh.position.set(0, bottomY, landingCenterZ);
  supportMesh.receiveShadow = true;
  frontGroup.add(supportMesh);

  // Crisp full-width steps, continuous from the bottom step (on the street edge) to the landing.
  // 段は底まで埋めた箱にする（斜面の低い側でも段の下にすき間ができない）
  const stepCount = riserCount - 1;
  const runTotal = stairFrontZ - landingFrontZ;
  const stepRun = runTotal / stepCount;

  const stepGeo = new THREE.BoxGeometry(1, 1, 1);
  stepGeo.translate(0, 0.5, 0);
  const stepInst = new THREE.InstancedMesh(stepGeo, stairMat, stepCount);
  stepInst.name = 'rimpukan-stairs-steps';
  stepInst.receiveShadow = true;

  for (let i = 0; i < stepCount; i++) {
    const stepTop = landingTopY - (i + 1) * riser;
    const zBack = landingFrontZ + i * stepRun;
    const zFront = landingFrontZ + (i + 1) * stepRun;
    const zCenter = (zFront + zBack) * 0.5;
    const depth = zFront - zBack;

    dummy.position.set(0, bottomY, zCenter);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(innerStairWidth, stepTop - bottomY, depth);
    dummy.updateMatrix();
    stepInst.setMatrixAt(i, dummy.matrix);
  }
  stepInst.instanceMatrix.needsUpdate = true;
  stepInst.computeBoundingBox();
  stepInst.computeBoundingSphere();
  frontGroup.add(stepInst);

  // Triangular wing walls flanking both outer sides of the staircase (0.8m thick)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(stairBackZ, bottomY);
  wingShape.lineTo(stairFrontZ, bottomY);
  wingShape.lineTo(stairFrontZ, footY + 0.35);
  wingShape.lineTo(landingFrontZ, landingTopY + 0.35);
  wingShape.lineTo(stairBackZ, landingTopY + 0.35);
  wingShape.closePath();

  // 袖壁の外と内の大きな面は押し出しの蓋にあたる（three r175 は作らないので補う）
  const wingGeo = ensureExtrudeLids(
    new THREE.ExtrudeGeometry(wingShape, {
      depth: wingThick,
      bevelEnabled: false,
    }),
    wingShape,
    wingThick,
  );
  wingGeo.translate(0, 0, -wingThick * 0.5);
  wingGeo.rotateY(-Math.PI / 2);
  wingGeo.computeVertexNormals();

  const wingOffsetX = stairWidth * 0.5 - wingThick * 0.5; // 8.6m
  const leftWingWall = new THREE.Mesh(wingGeo, stairMat);
  leftWingWall.name = 'rimpukan-stairs-wall-left';
  leftWingWall.position.set(-wingOffsetX, 0, 0);
  leftWingWall.castShadow = true;
  leftWingWall.receiveShadow = true;
  frontGroup.add(leftWingWall);

  const rightWingWall = new THREE.Mesh(wingGeo, stairMat);
  rightWingWall.name = 'rimpukan-stairs-wall-right';
  rightWingWall.position.set(wingOffsetX, 0, 0);
  rightWingWall.castShadow = true;
  rightWingWall.receiveShadow = true;
  frontGroup.add(rightWingWall);

  // Brown entrance box jutting out of the upper-middle of the staircase (photo: dark opening
  // sits in its front face, just above the step it stands on; no glass box on the wall above)
  // 箱の前面は、2 階の床から約 1.3m 下の段の踏み面の上に立つ（1 回目の 4.2m の段で 2.9m の段）
  const entranceBoxW = 4.6;
  const entranceStepIdx = Math.min(
    stepCount - 1,
    Math.max(0, Math.round(1.3 / riser) - 1),
  );
  const entranceTreadTopY = landingTopY - (entranceStepIdx + 1) * riser;
  const entranceBoxFrontZ = landingFrontZ + (entranceStepIdx + 0.5) * stepRun;
  const entranceBoxBackZ = -1.0;
  const entranceBoxTopY = landingTopY + 1.0; // top ~1m above the landing deck
  const entranceBoxH = entranceBoxTopY - bottomY;
  const entranceBoxGeo = new THREE.BoxGeometry(
    entranceBoxW,
    entranceBoxH,
    entranceBoxFrontZ - entranceBoxBackZ,
  );
  entranceBoxGeo.translate(0, entranceBoxH * 0.5, 0);
  const entranceBoxMesh = new THREE.Mesh(entranceBoxGeo, stairMat);
  entranceBoxMesh.name = 'rimpukan-entrance-box';
  entranceBoxMesh.position.set(0, bottomY, (entranceBoxFrontZ + entranceBoxBackZ) * 0.5);
  entranceBoxMesh.castShadow = true;
  entranceBoxMesh.receiveShadow = true;
  frontGroup.add(entranceBoxMesh);

  // Small dark opening on the box front (floor level = step tread at that depth)
  const openingW = 3.0;
  const openingBottomY = entranceTreadTopY + 0.1;
  const openingTopY = openingBottomY + 1.7;
  const openingGeo = new THREE.PlaneGeometry(openingW, openingTopY - openingBottomY);
  const openingMesh = new THREE.Mesh(openingGeo, openingMat);
  openingMesh.name = 'rimpukan-entrance-opening';
  openingMesh.position.set(0, (openingBottomY + openingTopY) * 0.5, entranceBoxFrontZ + 0.02);
  frontGroup.add(openingMesh);

  // --- 8. Plain square 3F plaque (3.5m x 3.5m, no emblem) ---
  // 枠は正面の中心が当たる壁（ドラムの先端の辺）に沿わせる。辺は道に直角な向きから少し振れているので、
  // 正面の向きではなく辺の外向き法線に向ける（枠の片側が壁から浮かない）
  const plaqueHit = sampleFrontWallAt(ringCW, anchorX, anchorZ, fx, fz, 0);
  const plaqueSize = 3.5; // photo: ~1/3 of the brown wall band height
  const plaqueY = 10.6; // upper half of the brown wall band
  const plaqueFrameDepth = 0.72;
  const plaqueFrameFrontZ = 0.13;

  const plaqueGroup = new THREE.Group();
  plaqueGroup.name = 'rimpukan-plaque';
  plaqueGroup.position.set(
    plaqueHit ? plaqueHit.worldX : anchorX,
    groundVisualY + plaqueY,
    plaqueHit ? plaqueHit.worldZ : anchorZ,
  );
  plaqueGroup.rotation.y = plaqueHit ? Math.atan2(plaqueHit.nx, plaqueHit.nz) : Math.atan2(fx, fz);

  const plaqueFrameGeo = new THREE.BoxGeometry(plaqueSize, plaqueSize, plaqueFrameDepth);
  const plaqueFrameMesh = new THREE.Mesh(plaqueFrameGeo, plaqueFrameMat);
  plaqueFrameMesh.name = 'rimpukan-plaque-frame';
  plaqueFrameMesh.position.set(0, 0, plaqueFrameFrontZ - plaqueFrameDepth * 0.5);
  plaqueGroup.add(plaqueFrameMesh);

  const plaqueInnerGeo = new THREE.BoxGeometry(plaqueSize * 0.82, plaqueSize * 0.82, 0.03);
  const plaqueInnerMesh = new THREE.Mesh(plaqueInnerGeo, plaqueInnerMat);
  plaqueInnerMesh.name = 'rimpukan-plaque-inner';
  plaqueInnerMesh.position.set(0, 0, plaqueFrameFrontZ + 0.015);
  plaqueGroup.add(plaqueInnerMesh);

  group.add(frontGroup, plaqueGroup);

  // --- 9. Small vertical windows on the west front wall (4 windows, 0.9m x 1.8m) ---
  // 上の 2 つは茶色の壁（3 階の屋根まで）の中に収める
  const windowSpecs: [number, number][] = [
    [-5.2, 10.4],
    [5.2, 10.4],
    [-3.6, 11.3],
    [3.6, 11.3],
  ];
  const windowHits: { hit: WallHit; y: number }[] = [];
  for (const [targetLx, wy] of windowSpecs) {
    const hit = sampleFrontWallAt(ringCW, anchorX, anchorZ, fx, fz, targetLx);
    if (hit) {
      windowHits.push({ hit, y: wy });
    }
  }

  if (windowHits.length > 0) {
    const winGeo = new THREE.BoxGeometry(0.9, 1.8, 0.2);
    const winInst = new THREE.InstancedMesh(winGeo, windowMat, windowHits.length);
    winInst.name = 'rimpukan-front-windows';
    for (let i = 0; i < windowHits.length; i++) {
      const entry = windowHits[i];
      if (!entry) continue;
      const { hit, y } = entry;
      dummy.position.set(
        hit.worldX + hit.nx * 0.02,
        groundVisualY + y,
        hit.worldZ + hit.nz * 0.02,
      );
      dummy.rotation.set(0, Math.atan2(hit.nx, hit.nz), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      winInst.setMatrixAt(i, dummy.matrix);
    }
    winInst.instanceMatrix.needsUpdate = true;
    winInst.computeBoundingBox();
    winInst.computeBoundingSphere();
    group.add(winInst);
  }

  return {
    group,
    primaryMaterials: [
      { mat: wallMat, baseHex: WALL_HEX },
      { mat: glassMat, baseHex: GLASS_HEX },
    ],
    animated: [],
  };
};
