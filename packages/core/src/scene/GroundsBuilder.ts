import * as THREE from 'three';
import { computeVisualY } from '../domain/projection';
import type {
  BuildingFeature,
  CampusConfig,
  CampusStructuresData,
  GroundFeature,
  TerrainGrid,
} from '../domain/types';
import { mergeSimpleGeometries } from './TerrainBuilder';

/**
 * グラウンド（陸上のトラック・直線の走路・野球場・テニスコート）を描く。
 * - 面は 1 つのメッシュ。線・レーン・コートの模様は、グラウンドごとの区画を並べた 1 枚のテクスチャ（canvas）に描いて貼る
 * - 網の柵（テニスコート）と外野のフェンスは、それぞれ 1 つのメッシュ
 * - 地面のグラウンドの下の地形は、表示ではグラウンドの面の高さにならす（carveTerrainForGrounds。データの地形は変えない）
 * 寸法・線の位置・色の多くは推定（packages/core/src/data/campuses/senriyama/grounds.ts）
 */

/** 面の高さ（ならした地形の上から。描画の奥行きの精度で地形と争わない高さ） */
const PLATE_LIFT_M = 0.12;
/** 屋上のコートの面の高さ（建物の屋根の上から。屋根の面取りの厚み 0.25m の上） */
const ROOF_PLATE_LIFT_M = 0.35;
/** テクスチャの 1m あたりの画素（線が地図の縮尺で見える太さになるよう、細い線は最小の太さで描く） */
const PX_PER_M = 8;
const ATLAS_WIDTH = 2048;
const MIN_LINE_PX = 1.6;

const COLORS = {
  track: '#B5573F',
  turf: '#4E8B3D',
  turfStripe: '#5C9A47',
  outfield: '#4F8F40',
  dirt: '#7C5236',
  mound: '#946646',
  warningTrack: '#9A4C37',
  line: '#F4F1E8',
  net: '#3A3F44',
  fenceNet: '#2E4A3C',
  outfieldWall: '#2F4B38',
  concrete: '#C9C3B6',
} as const;

type P2 = [number, number];

/** 模様の座標系（u 軸＝画像の横、v 軸＝画像の縦）と、テクスチャの中の区画 */
interface GroundRegion {
  ground: GroundFeature;
  u: P2;
  v: P2;
  minU: number;
  minV: number;
  widthPx: number;
  heightPx: number;
  x: number;
  y: number;
}

const dot = (p: P2, d: P2): number => p[0] * d[0] + p[1] * d[1];

/** 輪郭の中か（偶奇） */
function pointInPolygon(x: number, z: number, poly: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i] as P2;
    const [xj, zj] = poly[j] as P2;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** 輪郭のいちばん長い辺の向き（直線の走路の向き） */
function longestEdgeDir(poly: readonly P2[]): P2 {
  let best: P2 = [1, 0];
  let bestLen = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as P2;
    const b = poly[(i + 1) % poly.length] as P2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > bestLen) {
      bestLen = len;
      best = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    }
  }
  return best;
}

function bisector(b: NonNullable<GroundFeature['baseball']>): P2 {
  const l: P2 = [b.leftPole[0] - b.home[0], b.leftPole[1] - b.home[1]];
  const r: P2 = [b.rightPole[0] - b.home[0], b.rightPole[1] - b.home[1]];
  const ll = Math.hypot(l[0], l[1]) || 1;
  const rl = Math.hypot(r[0], r[1]) || 1;
  const d: P2 = [l[0] / ll + r[0] / rl, l[1] / ll + r[1] / rl];
  const dl = Math.hypot(d[0], d[1]) || 1;
  return [d[0] / dl, d[1] / dl];
}

/** 模様の u 軸（トラックは直線の向き、野球場は本塁から中堅への向き、テニスはコートの長い方向） */
function patternAxis(g: GroundFeature): P2 {
  if (g.track) return g.track.axis;
  if (g.grandstand) return g.grandstand.axis;
  if (g.baseball) return bisector(g.baseball);
  if (g.tennis && g.tennis.courts[0]) return g.tennis.courts[0].axis;
  return longestEdgeDir(g.polygon);
}

/** 観客席の側面の壁に使う、無地のコンクリートの色の区画（テクスチャの左下の隅） */
const CONCRETE_PATCH_PX = 8;

/** グラウンドごとの区画を、横 ATLAS_WIDTH の棚に左から詰める（最後の棚の後ろにコンクリートの区画） */
function layoutAtlas(grounds: readonly GroundFeature[]): { regions: GroundRegion[]; height: number; concrete: P2 } {
  const regions: GroundRegion[] = [];
  for (const ground of grounds) {
    const u = patternAxis(ground);
    const v: P2 = [-u[1], u[0]];
    const us = ground.polygon.map((p) => dot(p, u));
    const vs = ground.polygon.map((p) => dot(p, v));
    const minU = Math.min(...us) - 1;
    const minV = Math.min(...vs) - 1;
    const widthPx = Math.ceil((Math.max(...us) + 1 - minU) * PX_PER_M);
    const heightPx = Math.ceil((Math.max(...vs) + 1 - minV) * PX_PER_M);
    regions.push({ ground, u, v, minU, minV, widthPx, heightPx, x: 0, y: 0 });
  }
  // 高い区画から棚に並べる
  const order = [...regions].sort((a, b) => b.heightPx - a.heightPx);
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const r of order) {
    if (x + r.widthPx > ATLAS_WIDTH) {
      x = 0;
      y += shelf + 2;
      shelf = 0;
    }
    r.x = x;
    r.y = y;
    x += r.widthPx + 2;
    shelf = Math.max(shelf, r.heightPx);
  }
  const height = y + shelf + 2 + CONCRETE_PATCH_PX;
  // 区画の中心の画素
  const concrete: P2 = [CONCRETE_PATCH_PX / 2, y + shelf + 2 + CONCRETE_PATCH_PX / 2];
  return { regions, height, concrete };
}

/** ローカル座標 → テクスチャの画素 */
function toPx(r: GroundRegion, p: P2): P2 {
  return [r.x + (dot(p, r.u) - r.minU) * PX_PER_M, r.y + (dot(p, r.v) - r.minV) * PX_PER_M];
}

/** 400m のトラックの、内側の縁から半径 radius の線（直線と半円）の点の並び */
function stadiumLine(t: NonNullable<GroundFeature['track']>, radius: number): P2[] {
  const perp: P2 = [-t.axis[1], t.axis[0]];
  const pts: P2[] = [];
  for (const end of [1, -1]) {
    const c: P2 = [t.center[0] + t.axis[0] * (t.straightM / 2) * end, t.center[1] + t.axis[1] * (t.straightM / 2) * end];
    for (let k = 0; k <= 24; k++) {
      const a = -Math.PI / 2 + (k / 24) * Math.PI;
      const ca = Math.cos(a) * end;
      const sa = Math.sin(a) * end;
      pts.push([c[0] + (t.axis[0] * ca + perp[0] * sa) * radius, c[1] + (t.axis[1] * ca + perp[1] * sa) * radius]);
    }
  }
  return pts;
}

type Ctx = CanvasRenderingContext2D;

function pathPolygon(ctx: Ctx, r: GroundRegion, poly: readonly P2[], close = true): void {
  ctx.beginPath();
  poly.forEach((p, i) => {
    const [x, y] = toPx(r, p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (close) ctx.closePath();
}

function strokeLine(ctx: Ctx, r: GroundRegion, pts: readonly P2[], widthM: number, color: string, close = false): void {
  pathPolygon(ctx, r, pts, close);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(MIN_LINE_PX, widthM * PX_PER_M);
  ctx.stroke();
}

/** 中心 c・向き u（長さ方向）・v の座標系での長方形の 4 隅 */
function rectCorners(c: P2, u: P2, halfU: number, halfV: number): P2[] {
  const v: P2 = [-u[1], u[0]];
  return [
    [c[0] - u[0] * halfU - v[0] * halfV, c[1] - u[1] * halfU - v[1] * halfV],
    [c[0] + u[0] * halfU - v[0] * halfV, c[1] + u[1] * halfU - v[1] * halfV],
    [c[0] + u[0] * halfU + v[0] * halfV, c[1] + u[1] * halfU + v[1] * halfV],
    [c[0] - u[0] * halfU + v[0] * halfV, c[1] - u[1] * halfU + v[1] * halfV],
  ];
}

const offset = (c: P2, u: P2, du: number, dv = 0): P2 => [c[0] + u[0] * du - u[1] * dv, c[1] + u[1] * du + u[0] * dv];

function circlePoints(c: P2, radius: number, a0 = 0, a1 = Math.PI * 2, n = 32): P2[] {
  return Array.from({ length: n + 1 }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / n;
    return [c[0] + Math.cos(a) * radius, c[1] + Math.sin(a) * radius] as P2;
  });
}

function paintTrack(ctx: Ctx, r: GroundRegion): void {
  const g = r.ground;
  const t = g.track;
  if (!t) return;
  pathPolygon(ctx, r, g.polygon);
  ctx.fillStyle = COLORS.track;
  ctx.fill();
  // 人工芝（長さ方向に 5m ごとの縞。公式の地図・空中写真の縞）
  ctx.save();
  pathPolygon(ctx, r, t.pitch);
  ctx.fillStyle = COLORS.turf;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = COLORS.turfStripe;
  const cu = dot(t.center, r.u);
  for (let k = -12; k < 12; k += 2) {
    const u0 = cu + k * 5;
    ctx.fillRect(r.x + (u0 - r.minU) * PX_PER_M, r.y, 5 * PX_PER_M, r.heightPx);
  }
  ctx.restore();
  // レーンの白線（内側の縁から 1 レーンごと）
  for (let k = 0; k <= t.lanes; k++) {
    strokeLine(ctx, r, stadiumLine(t, t.innerRadiusM + k * t.laneWidthM), k === 0 ? 0.15 : 0.05, COLORS.line, true);
  }
  // サッカーのコートの線（標準の寸法）
  const c = t.center;
  const u = t.axis;
  const L = t.fieldLengthM / 2;
  const W = t.fieldWidthM / 2;
  const lw = 0.12;
  strokeLine(ctx, r, rectCorners(c, u, L, W), lw, COLORS.line, true);
  strokeLine(ctx, r, [offset(c, u, 0, -W), offset(c, u, 0, W)], lw, COLORS.line);
  strokeLine(ctx, r, circlePoints(c, 9.15), lw, COLORS.line);
  for (const end of [1, -1]) {
    const goal = offset(c, u, L * end);
    strokeLine(ctx, r, rectCorners(offset(goal, u, -8.25 * end), u, 8.25, 20.16), lw, COLORS.line, true);
    strokeLine(ctx, r, rectCorners(offset(goal, u, -2.75 * end), u, 2.75, 9.16), lw, COLORS.line, true);
  }
}

function paintStraight(ctx: Ctx, r: GroundRegion): void {
  const g = r.ground;
  pathPolygon(ctx, r, g.polygon);
  ctx.fillStyle = COLORS.track;
  ctx.fill();
  const lanes = g.straight?.lanes ?? 4;
  const vs = g.polygon.map((p) => dot(p, r.v));
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);
  ctx.save();
  pathPolygon(ctx, r, g.polygon);
  ctx.clip();
  ctx.fillStyle = COLORS.line;
  const lineW = Math.max(MIN_LINE_PX, 0.05 * PX_PER_M);
  for (let k = 0; k <= lanes; k++) {
    const v = minV + ((maxV - minV) * k) / lanes;
    const y = r.y + (v - r.minV) * PX_PER_M;
    ctx.fillRect(r.x, y - lineW / 2, r.widthPx, lineW);
  }
  ctx.restore();
}

/** 観客席: 通路の色の地に、前の縁に平行な座席の列（0.85m ごと）と、15m ごとの縦の通路 */
function paintGrandstand(ctx: Ctx, r: GroundRegion): void {
  const g = r.ground;
  const st = g.grandstand;
  if (!st) return;
  ctx.save();
  pathPolygon(ctx, r, g.polygon);
  ctx.fillStyle = st.aisleHex;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = st.seatHex;
  const v0 = Math.min(st.vFront, st.vBack);
  const v1 = Math.max(st.vFront, st.vBack);
  for (let v = v0 + 0.6; v < v1 - 0.3; v += 0.85) {
    ctx.fillRect(r.x, r.y + (v - r.minV) * PX_PER_M, r.widthPx, 0.6 * PX_PER_M);
  }
  ctx.fillStyle = st.aisleHex;
  for (let u = 15; u < r.widthPx / PX_PER_M; u += 15) {
    ctx.fillRect(r.x + u * PX_PER_M, r.y, 1.2 * PX_PER_M, r.heightPx);
  }
  ctx.restore();
}

function paintBaseball(ctx: Ctx, r: GroundRegion): void {
  const g = r.ground;
  const b = g.baseball;
  if (!b) return;
  const dir = bisector(b);
  ctx.save();
  pathPolygon(ctx, r, g.polygon);
  ctx.fillStyle = COLORS.outfield;
  ctx.fill();
  ctx.clip();
  // フェンスの手前の土の帯（フェンスの線を太く引き、輪郭の外は面が無いので見えない）
  strokeLine(ctx, r, b.fence, b.warningTrackM * 2, COLORS.warningTrack);
  // 内野の土（投手板を中心にした円）
  const mound = offset(b.home, dir, b.moundDistanceM);
  pathPolygon(ctx, r, circlePoints(mound, b.infieldRadiusM, 0, Math.PI * 2, 48));
  ctx.fillStyle = COLORS.dirt;
  ctx.fill();
  pathPolygon(ctx, r, circlePoints(mound, 2.74, 0, Math.PI * 2, 20));
  ctx.fillStyle = COLORS.mound;
  ctx.fill();
  ctx.restore();
  // ファウルラインと塁間の線（公式の地図の白いダイヤモンド）
  strokeLine(ctx, r, [b.leftPole, b.home, b.rightPole], 0.1, COLORS.line);
  const toLeft: P2 = [b.leftPole[0] - b.home[0], b.leftPole[1] - b.home[1]];
  const toRight: P2 = [b.rightPole[0] - b.home[0], b.rightPole[1] - b.home[1]];
  const nl = Math.hypot(toLeft[0], toLeft[1]) || 1;
  const nr = Math.hypot(toRight[0], toRight[1]) || 1;
  const first: P2 = [b.home[0] + (toRight[0] / nr) * b.baseDistanceM, b.home[1] + (toRight[1] / nr) * b.baseDistanceM];
  const third: P2 = [b.home[0] + (toLeft[0] / nl) * b.baseDistanceM, b.home[1] + (toLeft[1] / nl) * b.baseDistanceM];
  const second = offset(b.home, dir, b.baseDistanceM * Math.SQRT2);
  strokeLine(ctx, r, [first, second, third], 0.1, COLORS.line);
  ctx.fillStyle = COLORS.line;
  for (const base of [b.home, first, second, third]) {
    const [x, y] = toPx(r, base);
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
}

function paintTennis(ctx: Ctx, r: GroundRegion): void {
  const g = r.ground;
  const t = g.tennis;
  if (!t) return;
  pathPolygon(ctx, r, g.polygon);
  ctx.fillStyle = t.surfaceHex;
  ctx.fill();
  const lw = 0.05;
  for (const court of t.courts) {
    const c = court.center;
    const u = court.axis;
    const L = 23.77 / 2;
    const Wd = 10.97 / 2;
    const Ws = 8.23 / 2;
    pathPolygon(ctx, r, rectCorners(c, u, L + 1.2, Wd + 0.8));
    ctx.fillStyle = t.courtHex;
    ctx.fill();
    strokeLine(ctx, r, rectCorners(c, u, L, Wd), lw, COLORS.line, true);
    strokeLine(ctx, r, [offset(c, u, -L, -Ws), offset(c, u, L, -Ws)], lw, COLORS.line);
    strokeLine(ctx, r, [offset(c, u, -L, Ws), offset(c, u, L, Ws)], lw, COLORS.line);
    for (const end of [1, -1]) {
      strokeLine(ctx, r, [offset(c, u, 6.4 * end, -Ws), offset(c, u, 6.4 * end, Ws)], lw, COLORS.line);
    }
    strokeLine(ctx, r, [offset(c, u, -6.4), offset(c, u, 6.4)], lw, COLORS.line);
    // ネット（コートの真ん中を横切る暗い線）
    strokeLine(ctx, r, [offset(c, u, 0, -Wd - 0.9), offset(c, u, 0, Wd + 0.9)], 0.12, COLORS.net);
  }
}

/** 全部のグラウンドの模様を 1 枚の canvas に描く。Node（document が無い）では null */
function createGroundsAtlas(
  regions: readonly GroundRegion[],
  height: number,
  concrete: P2,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = THREE.MathUtils.ceilPowerOfTwo(Math.max(1, height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  for (const r of regions) {
    switch (r.ground.kind) {
      case 'athletics-track':
        paintTrack(ctx, r);
        break;
      case 'track-straight':
        paintStraight(ctx, r);
        break;
      case 'baseball':
        paintBaseball(ctx, r);
        break;
      case 'tennis':
        paintTennis(ctx, r);
        break;
      case 'grandstand':
        paintGrandstand(ctx, r);
        break;
    }
  }
  ctx.fillStyle = COLORS.concrete;
  ctx.fillRect(
    concrete[0] - CONCRETE_PATCH_PX / 2,
    concrete[1] - CONCRETE_PATCH_PX / 2,
    CONCRETE_PATCH_PX,
    CONCRETE_PATCH_PX,
  );
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** テクスチャが無いとき（Node）の面の色 */
function plainColorOf(g: GroundFeature): string {
  if (g.kind === 'baseball') return COLORS.outfield;
  if (g.kind === 'grandstand') return g.grandstand?.seatHex ?? COLORS.concrete;
  if (g.kind === 'tennis') return g.tennis?.surfaceHex ?? COLORS.turf;
  return COLORS.track;
}

/** 面の高さ（表示の y）。屋上のコートは建物の屋根の上 */
export function groundPlateY(
  g: GroundFeature,
  buildingsById: ReadonlyMap<string, BuildingFeature>,
  minElevation: number,
  exag: number,
): number | null {
  const roofOf = g.tennis?.roofOf;
  if (roofOf) {
    const b = buildingsById.get(roofOf);
    if (!b) return null;
    return computeVisualY(b.groundY, minElevation, exag) + b.height + ROOF_PLATE_LIFT_M;
  }
  return computeVisualY(g.elevation, minElevation, exag) + PLATE_LIFT_M;
}

/**
 * 地面のグラウンドの下の地形の格子を、グラウンドの面の高さにならす（表示用。データの地形は変えない）。
 * 輪郭にかかる格子の升の 4 隅を全部そろえるので、面の縁まで地形が面の下に収まる
 */
export function carveTerrainForGrounds(terrain: TerrainGrid, structures: CampusStructuresData): TerrainGrid {
  // 屋上のコートはならさない。斜面に建つ観客席は、座席の面より上に出る地形だけを座席の面の下まで下げる（上げない）
  const grounds = (structures.grounds ?? []).filter((g) => !g.tennis?.roofOf && g.kind !== 'grandstand');
  const stands = (structures.grounds ?? []).filter((g) => g.grandstand);
  if (grounds.length === 0 && stands.length === 0) return terrain;
  const { cols, rows, minX, maxX, minZ, maxZ } = terrain;
  if (cols < 2 || rows < 2) return terrain;
  const dx = (maxX - minX) / (cols - 1);
  const dz = (maxZ - minZ) / (rows - 1);
  const elev = terrain.elevations.slice();
  let changed = false;
  const setCell = (px: number, pz: number, target: number): void => {
    const ix = Math.floor((px - minX) / dx);
    const iz = Math.floor((pz - minZ) / dz);
    if (ix < 0 || iz < 0 || ix >= cols - 1 || iz >= rows - 1) return;
    for (const [c, r] of [
      [ix, iz],
      [ix + 1, iz],
      [ix, iz + 1],
      [ix + 1, iz + 1],
    ] as const) {
      const idx = r * cols + c;
      if (elev[idx] !== target) {
        elev[idx] = target;
        changed = true;
      }
    }
  };
  /** 輪郭にかかる升を順に呼ぶ（中の点と、辺に沿った 1m ごとの点） */
  const forEachTouchedPoint = (poly: readonly P2[], fn: (x: number, z: number) => void): void => {
    const xs = poly.map((p) => p[0]);
    const zs = poly.map((p) => p[1]);
    const step = Math.min(dx, dz) / 2;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += step) {
        if (pointInPolygon(x, z, poly)) fn(x, z);
      }
    }
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i] as P2;
      const b = poly[(i + 1) % poly.length] as P2;
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
      for (let k = 0; k <= n; k++) {
        fn(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
      }
    }
  };
  for (const g of grounds) {
    forEachTouchedPoint(g.polygon, (x, z) => setCell(x, z, g.elevation));
  }
  for (const g of stands) {
    const st = g.grandstand;
    if (!st) continue;
    const lowerCell = (px: number, pz: number): void => {
      const ix = Math.floor((px - minX) / dx);
      const iz = Math.floor((pz - minZ) / dz);
      if (ix < 0 || iz < 0 || ix >= cols - 1 || iz >= rows - 1) return;
      for (const [c, r] of [
        [ix, iz],
        [ix + 1, iz],
        [ix, iz + 1],
        [ix + 1, iz + 1],
      ] as const) {
        const idx = r * cols + c;
        const target = grandstandTopElevation(st, minX + c * dx, minZ + r * dz) - STAND_TERRAIN_CLEARANCE_M;
        const cur = elev[idx];
        if (cur !== undefined && cur > target) {
          elev[idx] = target;
          changed = true;
        }
      }
    };
    forEachTouchedPoint(g.polygon, lowerCell);
  }
  return changed ? { ...terrain, elevations: elev } : terrain;
}

/** 観客席の座席の面の標高（m）。前の縁から後ろの縁へ線形に上がる（縁の外は縁の高さのまま） */
function grandstandTopElevation(st: NonNullable<GroundFeature['grandstand']>, x: number, z: number): number {
  const v = -st.axis[1] * x + st.axis[0] * z;
  const t = st.vBack === st.vFront ? 0 : Math.max(0, Math.min(1, (v - st.vFront) / (st.vBack - st.vFront)));
  return st.frontElevation + (st.backElevation - st.frontElevation) * t;
}

/** 観客席の座席の面と、その下の地形の間の空き（m） */
const STAND_TERRAIN_CLEARANCE_M = 0.3;

/** 観客席の座席の面の高さ（表示の y） */
function grandstandTopY(st: NonNullable<GroundFeature['grandstand']>, x: number, z: number, minElevation: number, exag: number): number {
  return computeVisualY(grandstandTopElevation(st, x, z), minElevation, exag);
}

/** 観客席の側面の壁（輪郭の各辺。下端は地面の下、上端は座席の面の縁）。UV はテクスチャのコンクリートの区画 */
function grandstandWalls(
  g: GroundFeature,
  minElevation: number,
  exag: number,
  concreteUv: P2,
): THREE.BufferGeometry | null {
  const st = g.grandstand;
  if (!st) return null;
  const bottom = computeVisualY(st.bottomElevation, minElevation, exag);
  const pos: number[] = [];
  // 外向きの面になるよう、輪郭の回る向き（x・z の符号付き面積）で辺の向きをそろえる
  let area = 0;
  g.polygon.forEach((p, i) => {
    const q = g.polygon[(i + 1) % g.polygon.length] as P2;
    area += p[0] * q[1] - q[0] * p[1];
  });
  const poly = area > 0 ? [...g.polygon].reverse() : g.polygon;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as P2;
    const b = poly[(i + 1) % poly.length] as P2;
    const ya = grandstandTopY(st, a[0], a[1], minElevation, exag);
    const yb = grandstandTopY(st, b[0], b[1], minElevation, exag);
    pos.push(a[0], bottom, a[1], b[0], bottom, b[1], b[0], yb, b[1], a[0], bottom, a[1], b[0], yb, b[1], a[0], ya, a[1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const n = pos.length / 3;
  const uv = new Float32Array(n * 2);
  const color = new Float32Array(n * 3);
  const c = new THREE.Color(COLORS.concrete);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = concreteUv[0];
    uv[i * 2 + 1] = concreteUv[1];
    color[i * 3] = c.r;
    color[i * 3 + 1] = c.g;
    color[i * 3 + 2] = c.b;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return geo;
}

/** 輪郭に沿った縦の帯（柵・フェンス）。y0 から高さ h、閉じた輪郭なら最後の辺も */
function pushFence(pos: number[], pts: readonly P2[], y0: number, h: number, closed: boolean): void {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i] as P2;
    const b = pts[(i + 1) % pts.length] as P2;
    pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y0 + h, b[1], a[0], y0, a[1], b[0], y0 + h, b[1], a[0], y0 + h, a[1]);
  }
}

function fenceGeometry(pos: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildGroundsGroup(
  structures: CampusStructuresData,
  buildings: readonly BuildingFeature[],
  terrain: TerrainGrid,
  config: CampusConfig,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'campus-grounds';
  const grounds = structures.grounds ?? [];
  if (grounds.length === 0) return group;

  const exag = config.verticalExaggeration;
  const minElev = terrain.minElevation;
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const { regions, height, concrete } = layoutAtlas(grounds);
  const atlasHeight = THREE.MathUtils.ceilPowerOfTwo(Math.max(1, height));
  const tex = createGroundsAtlas(regions, height, concrete);
  const concreteUv: P2 = [concrete[0] / ATLAS_WIDTH, 1 - concrete[1] / atlasHeight];

  const plates: THREE.BufferGeometry[] = [];
  const netPos: number[] = [];
  const wallPos: number[] = [];
  for (const r of regions) {
    const g = r.ground;
    const y = groundPlateY(g, byId, minElev, exag);
    if (y === null) continue;
    const shape = new THREE.Shape(g.polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y, 0);
    const pos = geo.getAttribute('position');
    // 観客席は座席の面を前から後ろへ傾ける
    const st = g.grandstand;
    if (st) {
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, grandstandTopY(st, pos.getX(i), pos.getZ(i), minElev, exag));
      }
      geo.computeVertexNormals();
    }
    const uv = new Float32Array(pos.count * 2);
    const color = new Float32Array(pos.count * 3);
    const plain = new THREE.Color(plainColorOf(g));
    for (let i = 0; i < pos.count; i++) {
      const [px, py] = toPx(r, [pos.getX(i), pos.getZ(i)]);
      uv[i * 2] = px / ATLAS_WIDTH;
      uv[i * 2 + 1] = 1 - py / atlasHeight;
      color[i * 3] = plain.r;
      color[i * 3 + 1] = plain.g;
      color[i * 3 + 2] = plain.b;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
    plates.push(geo);
    const walls = grandstandWalls(g, minElev, exag, concreteUv);
    if (walls) plates.push(walls);

    if (g.tennis) pushFence(netPos, g.polygon, y, g.tennis.fenceHeightM, true);
    if (g.baseball) pushFence(wallPos, g.baseball.fence, y - 0.3, g.baseball.fenceHeightM + 0.3, false);
  }

  if (plates.length > 0) {
    const merged = mergeSimpleGeometries(plates);
    for (const p of plates) p.dispose();
    const mat = new THREE.MeshStandardMaterial({
      ...(tex ? { map: tex } : { vertexColors: true }),
      roughness: 0.92,
      metalness: 0.02,
      // 地形の上 0.12m の面。遠くから見ても地形とちらつかないよう奥行きを手前へずらす
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'grounds-surface';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (netPos.length > 0) {
    const mesh = new THREE.Mesh(
      fenceGeometry(netPos),
      new THREE.MeshStandardMaterial({
        color: COLORS.fenceNet,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        side: THREE.DoubleSide,
        // 透明の両面を 1 回で描く（描画命令を 1 回に）
        forceSinglePass: true,
        roughness: 0.8,
      }),
    );
    mesh.name = 'grounds-net-fences';
    group.add(mesh);
  }
  if (wallPos.length > 0) {
    const mesh = new THREE.Mesh(
      fenceGeometry(wallPos),
      new THREE.MeshStandardMaterial({ color: COLORS.outfieldWall, roughness: 0.85, side: THREE.DoubleSide }),
    );
    mesh.name = 'grounds-outfield-fence';
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}
