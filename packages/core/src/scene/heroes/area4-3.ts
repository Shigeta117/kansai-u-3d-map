import * as THREE from 'three';
import { minGroundUnder } from './shared';
import type { HeroBuildContext, HeroBuilder, HeroBuildResult } from './types';

/**
 * 第4学舎3号館の専用モデル（段 A: 塊・屋根・外壁の色・目印 2 つまで。作り込みはしない）。
 *
 * 資料: docs/visual-research/area4-3.md（2017 年 4 月の空中写真、KAN-CAN! の第4学舎の図の⑥、
 * 持ち主の 2023 年の映像〈凜風館の屋上から〉、Commons の東体育館の写真〈2019 年〉、KAN-CAN! の部屋の一覧、
 * 持ち主の写真と現地の話〈2026-11-24、グラウンド側の面〉、比率の参考に大学の印刷物の平面図〈持ち主の手元の資料〉）。
 *
 * - 屋上の板: OSM の輪郭（角 4 つ、約 62m × 45m）どおり。空中写真の屋上の縁と 0.3〜1.5m で重なる
 * - 1〜4 階の塊: 輪郭のうち南東の面（グラウンド側。観客席が辺から 5〜6m に並ぶ）だけを内へ下げ、屋上の板だけが
 *   せり出す（持ち主の言葉「屋上のみがせり出した構造」）。せり出しは面の全長（平面図で屋上だけ南東へ深い。
 *   映像で南の角の端もせり出す）。東の約 6 割は、柱を立てて外壁をさらに引っ込めた部分（持ち主の写真）。
 *   東の角は平面図どおり斜めに欠ける
 * - 斜めの支え: せり出しの下に、壁から軒裏へ（持ち主の写真）
 * - 屋上: 緑の面と北西の縁の灰色の帯。テニスコート 4 面（空中写真で読んだ位置）は GroundsBuilder が
 *   structures.json の `tennis-area4-3-roof` から、この屋上の高さ（HERO_ROOF_DECKS）に置く。網の柵は描かせない
 *   （写真の囲いはこの形の半透明の板）
 * - 目印 1: 屋上を囲む 2 段の半透明の板と白い枠（映像・イラスト）
 * - 目印 2: 西の角だけ囲いの上端まで立ち上がる白い無地の塊（空中写真・映像・Commons）
 * - 作らない物: 窓・壁の丸い飾り・1 階の入口の凹み・校章と文字（持ち主が頼んでいない・段 A の外）、
 *   北西の帯の上の物
 *
 * 座標は、西の角（輪郭の点 3）を原点に、北西の辺に沿って北東へ u、それに直交して南東へ v の枠で組む。
 */

type P2 = [number, number];

/** 西の角（輪郭の点 3） */
const ORIGIN: P2 = [185.14, -65.3];
/** 北西の辺（点 3 → 点 0）の向き＝u 軸（北東）。v 軸（南東）はそれに直交する */
const AXIS_U: P2 = [0.73329, -0.6799];
const AXIS_V: P2 = [0.6799, 0.73329];
/** 枠の group の回転。ローカルの +X が AXIS_U、+Z が AXIS_V になる角度 */
const FRAME_ROT_Y = Math.atan2(-AXIS_U[1], AXIS_U[0]);

function toUV(x: number, z: number): P2 {
  const dx = x - ORIGIN[0];
  const dz = z - ORIGIN[1];
  return [dx * AXIS_U[0] + dz * AXIS_U[1], dx * AXIS_V[0] + dz * AXIS_V[1]];
}

// --- 高さ（1 階の床＝重心の地面からの m）。すべて推定（資料は「地上 4 階」だけ） ---
/** 1 階（推定。KAN-CAN! の 1 階は 3101 教室） */
const GROUND_FLOOR_M = 4.6;
/** 2〜4 階（推定。デザインルームと教室） */
const UPPER_FLOOR_M = 4.1;
const UPPER_FLOORS = 3;
/** 屋上（テニスコートの面）の高さ（推定）。GroundsBuilder の屋上のコートもこの高さに置く（heroes/roofDecks.ts） */
export const AREA43_ROOF_DECK_M = GROUND_FLOOR_M + UPPER_FLOOR_M * UPPER_FLOORS + 0.3; // 17.2
/** パラペット（囲いの下の白い無地の帯）の高さ（推定） */
const PARAPET_M = 1.1;
/** 囲いの板 2 段の高さ（推定。映像 2 コマの板の幅との比で 4.7〜6.0m の中ほど） */
const SCREEN_M = 5.2;
/** 囲いと西の角の塊の上端（映像で両者の上端がそろう） */
export const AREA43_SCREEN_TOP_M = AREA43_ROOF_DECK_M + PARAPET_M + SCREEN_M; // 23.5
const PARAPET_THICKNESS_M = 0.35;
/** 囲いの板はパラペットの上、外の面から少し内側に立てる（推定） */
const SCREEN_INSET_M = 0.2;
/** 枠の縦の材の間隔（映像の南西の面で 9 列ほど＝約 4.3m） */
const MULLION_PITCH_M = 4.3;
const FRAME_BAR_M = 0.18;

// --- 屋上の配置（空中写真を u・v に描き直して測った値。誤差は ±0.5m） ---
/** 西の角の白い塊（空中写真の白い面 u 0〜10.2・v 0.7〜5.8。外の面は輪郭にそろえる） */
export const AREA43_CORNER_BLOCK = { u0: 0, u1: 10.2, v0: 0, v1: 5.8 } as const;
/** 北西の縁の灰色の帯（u 10.2〜61.5・v 0.6〜5.8）。北東の端はパラペットの内側まで */
export const AREA43_STRIP = { u0: AREA43_CORNER_BLOCK.u1, u1: 61.8, v1: 5.8 } as const;
/**
 * 帯の厚み（推定）。屋上のコートの面（輪郭を 1.2m 縮めた範囲、屋上の 0.05m 上で奥行きを手前へずらして描く）が
 * 帯の範囲にもかかるので、帯はその面より十分高くする（空中写真では帯はコートの面より下がっていない）
 */
const STRIP_THICK_M = 0.45;

// --- 南東の面（グラウンド側）の屋上のせり出し。すべて推定 ---
/**
 * 屋上の板が 1〜4 階の壁から張り出す奥行き（推定 4.0m）。平面図では屋上の図だけ南東へ約 4.5m 深く
 * （幅をそろえた奥行きの比 0.89）、持ち主の写真（東の端で張り出しが壁から柵までの約 0.7）で 3.2〜3.8m、
 * 映像（南西の面の右端）で 3.4〜5.8m。平面図と写真の間を取る
 */
export const AREA43_SE_OVERHANG_M = 4.0;
/** 屋上の板の厚み（推定。持ち主の写真の東の端の小口）。下の面が軒裏 */
export const AREA43_SLAB_M = 0.6;
/** 窓の並ぶ西の側と、柱の並ぶ東の側の境。南西の壁から南東の壁に沿って（平面図で 26m 前後、推定） */
export const AREA43_SE_SPLIT_M = 26.0;
/** 東の側の外壁は、柱の面（西の側の外壁と同じ面）からさらに引っ込む（推定。写真の柱の側面の見え方） */
const SE_RECESS_M = 1.5;
/** 東の側の柱の幅と、柱の間の数（推定。写真で柱 6〜7 本） */
const PILASTER_W_M = 0.8;
const SE_BAYS = 6;
/** 東の角の欠け（平面図の 1〜4 階。南東の壁に沿って 5.0m、北東の壁に沿って 2.2m、推定） */
const CHAMFER_SE_M = 5.0;
const CHAMFER_NE_M = 2.2;
/** 斜めの支え: 壁の上の取り付き（軒裏から下へ）と、軒裏の梁の長さ・支えが梁に届く所（せり出しに対する比） */
const BRACKET_DROP_M = 2.2;
const BRACKET_BEAM_RATIO = 0.9;
const BRACKET_REACH_RATIO = 0.6;
const BRACKET_W_M = 0.25;
const BRACKET_BEAM_H_M = 0.35;
/** 下の塊の上端は屋上の板の中へ少し入れる（すき間を見せない） */
const LOWER_INTO_SLAB_M = 0.05;

const FOOTING_BELOW_LOWEST_GROUND_M = 0.5;

const COLORS = {
  wall: '#E8E6DC', // 白い外壁（映像の日なた #eae8db）。パラペット・囲いの枠・角の塊も同じ
  deck: '#56805A', // コートの周りの緑（GroundsBuilder の屋上の面 surfaceHex と同じ。空中写真 #627d66）
  strip: '#959A96', // 北西の縁の帯（空中写真の明るい灰 #acb0ac と濃い列 #666b68 の間。推定）
  screen: '#A9B8BE', // 半透明の板（映像では空と奥が透けて灰色、イラストでは水色。推定）
} as const;
const SCREEN_OPACITY = 0.6;

interface EdgeFrame {
  a: P2;
  dir: P2;
  /** 輪郭の内側を向く法線 */
  inward: P2;
  length: number;
}

function edgeFrames(polygon: readonly [number, number][]): EdgeFrame[] {
  let area2 = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    if (!p || !q) continue;
    area2 += p[0] * q[1] - q[0] * p[1];
  }
  // (x, z) の面積の符号で内側の向きを決める（+Z が南なので、符号は画面の見た目と逆になる）
  const sign = area2 > 0 ? 1 : -1;
  const out: EdgeFrame[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) continue;
    const dir: P2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    out.push({ a: [a[0], a[1]], dir, inward: [-dir[1] * sign, dir[0] * sign], length });
  }
  return out;
}

type V3 = [number, number, number];

/** 三角形の向きを法線 n にそろえて、平らな面として足す（頂点の法線は 3 つとも n） */
function pushTri(pos: number[], nrm: number[], a: V3, b: V3, c: V3, n: V3): void {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const cross: V3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const [p, q] = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] >= 0 ? [b, c] : [c, b];
  pos.push(...a, ...p, ...q);
  for (let k = 0; k < 3; k++) nrm.push(...n);
}

/** 輪郭（[x, z][]）の辺ごとに、y0〜y1 の外向きの壁を足す（凹んだ輪郭でもよい） */
function pushWalls(pos: number[], nrm: number[], poly: readonly P2[], y0: number, y1: number): void {
  let area2 = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    area2 += p[0] * q[1] - q[0] * p[1];
  }
  const s = area2 > 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    // (x, z) の面積が正なら、辺の右手（dz, −dx）が外
    const n: V3 = [((b[1] - a[1]) / len) * s, 0, (-(b[0] - a[0]) / len) * s];
    const a0: V3 = [a[0], y0, a[1]];
    const b0: V3 = [b[0], y0, b[1]];
    const b1: V3 = [b[0], y1, b[1]];
    const a1: V3 = [a[0], y1, a[1]];
    pushTri(pos, nrm, a0, b0, b1, n);
    pushTri(pos, nrm, a0, b1, a1, n);
  }
}

/** 凸の輪郭の上か下の蓋（扇形に割る） */
function pushCap(pos: number[], nrm: number[], poly: readonly P2[], y: number, up: boolean): void {
  const n: V3 = [0, up ? 1 : -1, 0];
  const o = poly[0]!;
  for (let i = 1; i + 1 < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[i + 1]!;
    pushTri(pos, nrm, [o[0], y, o[1]], [p[0], y, p[1]], [q[0], y, q[1]], n);
  }
}

/** 箱（幅 w × 高さ h × 奥行き d、中心が原点）を行列で動かして足す */
function pushBox(pos: number[], nrm: number[], w: number, h: number, d: number, m: THREE.Matrix4): void {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  geo.applyMatrix4(m);
  const p = geo.getAttribute('position');
  const n = geo.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    pos.push(p.getX(i), p.getY(i), p.getZ(i));
    nrm.push(n.getX(i), n.getY(i), n.getZ(i));
  }
  geo.dispose();
}

/** 点 p から向き d の直線と、点 q から向き e の直線の交点 */
function intersectLines(p: P2, d: P2, q: P2, e: P2): P2 {
  const den = d[0] * e[1] - d[1] * e[0];
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}

/**
 * 南東の面（グラウンド側）の枠。輪郭の辺のうち、中点がいちばん南東（v が大きい）の辺。
 * 原点は南の角、x は南の角から東の角へ、z は辺から外（南東）へ。局所の (x, z) と世界の (x, z) を行き来する
 */
interface SeFrame {
  /** 南の角・東の角（世界） */
  s: P2;
  e: P2;
  length: number;
  dir: P2;
  /** 外向きの法線 */
  out: P2;
  toWorld: (x: number, z: number) => P2;
  toLocal: (p: P2) => P2;
  /** 局所 (x, y, z) → 世界の行列（右手系: X = dir、Y = 上、Z = out） */
  matrix: THREE.Matrix4;
}

function southEastFrame(polygon: readonly [number, number][]): { frame: SeFrame; west: P2; north: P2 } {
  let best = -1;
  let bestV = -Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const v = toUV((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)[1];
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  const n = polygon.length;
  const at = (i: number): P2 => {
    const p = polygon[((i % n) + n) % n]!;
    return [p[0], p[1]];
  };
  let a = at(best);
  let b = at(best + 1);
  // 南の角＝南西の側（u が小さい方）
  let before = at(best - 1);
  let after = at(best + 2);
  if (toUV(a[0], a[1])[0] > toUV(b[0], b[1])[0]) {
    [a, b] = [b, a];
    [before, after] = [after, before];
  }
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dir: P2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  // 右手系の Z（dir × 上）＝ (−dz, dx)。南西→北東の向きなら南東を向く
  const out: P2 = [-dir[1], dir[0]];
  const matrix = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(dir[0], 0, dir[1]),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(out[0], 0, out[1]),
  );
  matrix.setPosition(a[0], 0, a[1]);
  const frame: SeFrame = {
    s: a,
    e: b,
    length,
    dir,
    out,
    matrix,
    toWorld: (x, z) => [a[0] + dir[0] * x + out[0] * z, a[1] + dir[1] * x + out[1] * z],
    toLocal: (p) => {
      const dx = p[0] - a[0];
      const dz = p[1] - a[1];
      return [dx * dir[0] + dz * dir[1], dx * out[0] + dz * out[1]];
    },
  };
  // 南の角の隣（南西の辺の先）が西の角、東の角の隣（北東の辺の先）が北の角
  return { frame, west: before, north: after };
}

/**
 * 1〜4 階の塊の輪郭（世界の [x, z][]）と、東の側の柱の位置（局所の x）。
 * 南東の辺を内へ AREA43_SE_OVERHANG_M 下げ、東の側はさらに SE_RECESS_M 引っ込め、東の角を欠く
 */
export function area43LowerOutline(polygon: readonly [number, number][]): {
  outline: P2[];
  pilasterXs: number[];
  /** 下げた南東の壁の両端（局所の x）。斜めの支えはこの間に並べる */
  wallX0: number;
  wallX1: number;
  frame: SeFrame;
} {
  const { frame, west, north } = southEastFrame(polygon);
  const oh = AREA43_SE_OVERHANG_M;
  const wL = frame.toLocal(west);
  const nL = frame.toLocal(north);
  const eL: P2 = [frame.length, 0];
  // 下げた壁の線（z = −oh）と、南西の辺・北東の辺の交点
  const sp = intersectLines([0, -oh], [1, 0], [0, 0], [wL[0], wL[1]]);
  const ep = intersectLines([0, -oh], [1, 0], eL, [nL[0] - eL[0], nL[1] - eL[1]]);
  const neLen = Math.hypot(nL[0] - ep[0], nL[1] - ep[1]);
  const c1: P2 = [ep[0] + ((nL[0] - ep[0]) / neLen) * CHAMFER_NE_M, ep[1] + ((nL[1] - ep[1]) / neLen) * CHAMFER_NE_M];
  const c2: P2 = [ep[0] - CHAMFER_SE_M, -oh];
  const xSplit = sp[0] + AREA43_SE_SPLIT_M;
  const zRec = -oh - SE_RECESS_M;
  const local: P2[] = [wL, nL, c1, c2, [c2[0], zRec], [xSplit, zRec], [xSplit, -oh], sp];
  const pilasterXs: number[] = [];
  const span = c2[0] - xSplit - PILASTER_W_M;
  for (let k = 0; k <= SE_BAYS; k++) pilasterXs.push(xSplit + PILASTER_W_M / 2 + (span * k) / SE_BAYS);
  return {
    outline: local.map(([x, z]) => frame.toWorld(x, z)),
    pilasterXs,
    wallX0: sp[0],
    wallX1: c2[0],
    frame,
  };
}

export const buildArea43: HeroBuilder = (ctx: HeroBuildContext): HeroBuildResult => {
  const group = new THREE.Group();
  group.name = 'area4-3-hero';
  const frame = new THREE.Group();
  frame.name = 'area4-3-frame';
  frame.position.set(ORIGIN[0], 0, ORIGIN[1]);
  frame.rotation.y = FRAME_ROT_Y;
  group.add(frame);

  const polygon = ctx.building.polygon;
  const floorY = ctx.groundVisualY;
  const bottomY = minGroundUnder(ctx, polygon) - FOOTING_BELOW_LOWEST_GROUND_M;
  const deckY = floorY + AREA43_ROOF_DECK_M;
  const parapetTopY = deckY + PARAPET_M;
  const screenTopY = floorY + AREA43_SCREEN_TOP_M;

  // --- 材質（白い部分は 1 つの材質にまとめ、描画命令を 1 回にする） ---
  const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.8, metalness: 0.03 });
  const deckMat = new THREE.MeshStandardMaterial({ color: COLORS.deck, roughness: 0.9, metalness: 0.0 });
  const stripMat = new THREE.MeshStandardMaterial({ color: COLORS.strip, roughness: 0.88, metalness: 0.02 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: COLORS.screen,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: SCREEN_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
    // 透明の両面を 1 回で描く（three は透明の両面を既定で 2 回に分けて描く）
    forceSinglePass: true,
  });

  const addWhite = (mesh: THREE.Mesh, name: string): void => {
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  // --- 1. 塊: 屋上の板（輪郭どおり。上＝屋上の緑の面、下＝軒裏、縁＝白）と、南東を下げた 1〜4 階の壁 ---
  // 1 つのジオメトリに材質のグループ 2 つ（0 = 屋上の緑、1 = 白）。見えない蓋（下の塊の上と底）は作らない
  const slabBottomY = deckY - AREA43_SLAB_M;
  const lower = area43LowerOutline(polygon);
  const deckPos: number[] = [];
  const deckNrm: number[] = [];
  const whitePos: number[] = [];
  const whiteNrm: number[] = [];
  pushCap(deckPos, deckNrm, polygon, deckY, true);
  pushCap(whitePos, whiteNrm, polygon, slabBottomY, false);
  pushWalls(whitePos, whiteNrm, polygon, slabBottomY, deckY);
  pushWalls(whitePos, whiteNrm, lower.outline, bottomY, slabBottomY + LOWER_INTO_SLAB_M);
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute([...deckPos, ...whitePos], 3));
  bodyGeo.setAttribute('normal', new THREE.Float32BufferAttribute([...deckNrm, ...whiteNrm], 3));
  bodyGeo.addGroup(0, deckPos.length / 3, 0);
  bodyGeo.addGroup(deckPos.length / 3, whitePos.length / 3, 1);
  const body = new THREE.Mesh(bodyGeo, [deckMat, wallMat]);
  addWhite(body, 'area4-3-body');

  // --- 1b. 南東の面: 東の側の柱と、せり出しの下の斜めの支え（白。1 つのメッシュ） ---
  const sePos: number[] = [];
  const seNrm: number[] = [];
  const oh = AREA43_SE_OVERHANG_M;
  /** 南東の面の枠の局所 (x, y, z) に置き、X 軸まわりに rotX 回す行列 */
  const local = (x: number, y: number, z: number, rotX = 0): THREE.Matrix4 =>
    lower.frame.matrix
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(x, y, z))
      .multiply(new THREE.Matrix4().makeRotationX(rotX));
  // 柱: 引っ込んだ外壁から、西の側の外壁と同じ面まで。地面の下（底）から軒裏まで
  const pilasterH = slabBottomY + LOWER_INTO_SLAB_M - bottomY;
  for (const x of lower.pilasterXs) {
    const at = local(x, bottomY + pilasterH / 2, -oh - SE_RECESS_M / 2);
    pushBox(sePos, seNrm, PILASTER_W_M, pilasterH, SE_RECESS_M, at);
  }
  // 斜めの支え: 東の側は柱ごと、西の側は同じ間隔で南西の端の近くまで（映像で南の角の端にも 1 本）
  const pitch = (lower.pilasterXs[1] ?? 0) - (lower.pilasterXs[0] ?? 0);
  const bracketXs = [...lower.pilasterXs];
  for (let x = (lower.pilasterXs[0] ?? 0) - pitch; x > lower.wallX0 + 0.5; x -= pitch) bracketXs.push(x);
  const beamLen = oh * BRACKET_BEAM_RATIO;
  const reach = oh * BRACKET_REACH_RATIO;
  const rise = BRACKET_DROP_M - BRACKET_BEAM_H_M;
  const strutLen = Math.hypot(reach, rise);
  const strutRot = Math.atan2(reach, rise);
  for (const x of bracketXs) {
    // 軒裏の梁（壁から外へ）
    const beamAt = local(x, slabBottomY - BRACKET_BEAM_H_M / 2, -oh + beamLen / 2);
    pushBox(sePos, seNrm, BRACKET_W_M, BRACKET_BEAM_H_M, beamLen, beamAt);
    // 斜めの支え（壁の上の取り付きから、梁の下へ）
    const strutAt = local(x, slabBottomY - BRACKET_BEAM_H_M - rise / 2, -oh + reach / 2, strutRot);
    pushBox(sePos, seNrm, BRACKET_W_M, strutLen, BRACKET_W_M, strutAt);
  }
  const seGeo = new THREE.BufferGeometry();
  seGeo.setAttribute('position', new THREE.Float32BufferAttribute(sePos, 3));
  seGeo.setAttribute('normal', new THREE.Float32BufferAttribute(seNrm, 3));
  addWhite(new THREE.Mesh(seGeo, wallMat), 'area4-3-se-frame');

  // --- 2. パラペットと囲い（輪郭の辺ごと）。西の角の塊にかかる部分は囲いを付けない ---
  const edges = edgeFrames(polygon);
  const screenPositions: number[] = [];
  const pushQuad = (p0: P2, p1: P2, y0: number, y1: number): void => {
    screenPositions.push(p0[0], y0, p0[1], p1[0], y0, p1[1], p1[0], y1, p1[1]);
    screenPositions.push(p0[0], y0, p0[1], p1[0], y1, p1[1], p0[0], y1, p0[1]);
  };
  edges.forEach((e, i) => {
    const angle = Math.atan2(-e.dir[1], e.dir[0]);
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(e.length, PARAPET_M, PARAPET_THICKNESS_M), wallMat);
    parapet.position.set(
      e.a[0] + (e.dir[0] * e.length) / 2 + (e.inward[0] * PARAPET_THICKNESS_M) / 2,
      deckY + PARAPET_M / 2,
      e.a[1] + (e.dir[1] * e.length) / 2 + (e.inward[1] * PARAPET_THICKNESS_M) / 2,
    );
    parapet.rotation.y = angle;
    addWhite(parapet, `area4-3-parapet-${i}`);

    // 辺の両端のうち西の角に当たる側は、塊の幅だけ囲いを短くする
    const [ua, va] = toUV(e.a[0], e.a[1]);
    const bEnd: P2 = [e.a[0] + e.dir[0] * e.length, e.a[1] + e.dir[1] * e.length];
    const [ub, vb] = toUV(bEnd[0], bEnd[1]);
    const alongU = Math.abs(e.dir[0] * AXIS_U[0] + e.dir[1] * AXIS_U[1]) > 0.7;
    const cut = alongU ? AREA43_CORNER_BLOCK.u1 : AREA43_CORNER_BLOCK.v1;
    // 囲いは外の面から SCREEN_INSET_M 内側の線の上。角では隣の辺の囲いとその線の上で出会う
    const off = SCREEN_INSET_M;
    let t0 = off;
    let t1 = e.length - off;
    if (Math.hypot(ua, va) < 1.0) t0 = cut;
    if (Math.hypot(ub, vb) < 1.0) t1 = e.length - cut;
    if (t1 - t0 < 1) return;

    const at = (t: number): P2 => [
      e.a[0] + e.dir[0] * t + e.inward[0] * off,
      e.a[1] + e.dir[1] * t + e.inward[1] * off,
    ];
    pushQuad(at(t0), at(t1), parapetTopY, screenTopY);

    // 枠: 縦の材（約 4.3m 間隔）と、下・中・上の横の材
    const segLen = t1 - t0;
    const bays = Math.max(1, Math.round(segLen / MULLION_PITCH_M));
    for (let k = 0; k <= bays; k++) {
      const p = at(t0 + (segLen * k) / bays);
      const post = new THREE.Mesh(new THREE.BoxGeometry(FRAME_BAR_M, SCREEN_M, FRAME_BAR_M), wallMat);
      post.position.set(p[0], (parapetTopY + screenTopY) / 2, p[1]);
      post.rotation.y = angle;
      addWhite(post, `area4-3-screen-post-${i}-${k}`);
    }
    const mid = at((t0 + t1) / 2);
    for (const [k, y] of [parapetTopY, (parapetTopY + screenTopY) / 2, screenTopY - FRAME_BAR_M / 2].entries()) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(segLen, FRAME_BAR_M, FRAME_BAR_M), wallMat);
      rail.position.set(mid[0], y, mid[1]);
      rail.rotation.y = angle;
      addWhite(rail, `area4-3-screen-rail-${i}-${k}`);
    }
  });

  const screenGeo = new THREE.BufferGeometry();
  screenGeo.setAttribute('position', new THREE.Float32BufferAttribute(screenPositions, 3));
  screenGeo.computeVertexNormals();
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.name = 'area4-3-screen';
  screen.renderOrder = 1;
  group.add(screen);

  // --- 3. 西の角の白い塊（屋上から囲いの上端まで） ---
  const cb = AREA43_CORNER_BLOCK;
  const cornerBlock = new THREE.Mesh(new THREE.BoxGeometry(cb.u1 - cb.u0, screenTopY - deckY, cb.v1 - cb.v0), wallMat);
  cornerBlock.position.set((cb.u0 + cb.u1) / 2, (deckY + screenTopY) / 2, (cb.v0 + cb.v1) / 2);
  cornerBlock.name = 'area4-3-corner-block';
  cornerBlock.castShadow = true;
  cornerBlock.receiveShadow = true;
  frame.add(cornerBlock);

  // --- 4. 北西の縁の灰色の帯（パラペットの内側から v 5.8 まで） ---
  const st = AREA43_STRIP;
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(st.u1 - st.u0, STRIP_THICK_M, st.v1 - PARAPET_THICKNESS_M),
    stripMat,
  );
  strip.position.set((st.u0 + st.u1) / 2, deckY + STRIP_THICK_M / 2, (PARAPET_THICKNESS_M + st.v1) / 2);
  strip.name = 'area4-3-strip';
  strip.receiveShadow = true;
  frame.add(strip);

  return {
    group,
    primaryMaterials: [
      { mat: wallMat, baseHex: COLORS.wall },
      { mat: deckMat, baseHex: COLORS.deck },
    ],
    animated: [],
  };
};
