import * as THREE from 'three';
import { extrudePolygonXZ, minGroundUnder } from './shared';
import type { HeroBuilder } from './types';

type Pt = [number, number];

/**
 * 簡文館（関西大学博物館）の専用モデル。
 *
 * 根拠にしたもの:
 * - 公式（年史・博物館）: 1928 年の旧図書館本館に、1955 年に村野藤吾が円形の閲覧室を増築。
 *   赤褐色のタイルに青や緑のモザイク、円形の天窓
 * - Commons の Kansai_University_Museum.jpg（CC0、2011-04-25）: 円形部分の外周。
 *   1 階は白い角柱のピロティ、2 階は青いタイルに緑の区画と黄色の縁取りが入る手すり壁と青い枠の横長窓、
 *   3 階は茶褐色のレンガ壁（細かいレンガと明るい目地）で、窓は区画おき。窓は白い枠で、下の方に黒い鉄の手すり。
 *   白い打放しの縦の柱と横の帯が格子をつくる
 * - 航空写真（refs/aerial のタイル、ズーム 18）: 円形部分の屋根は緑青色で、中心から放射状の継ぎ目と中央の白い円（天窓）。
 *   東の翼は白い平屋根で、西の端は段のついた直線（円形部分との隅は緑青色）。北の翼は灰茶色の平屋根
 *
 * 1928 年の旧館（東と北の翼）は外観の写真が無いので、輪郭どおりの無地の箱にする（窓・軒は描かない。壁は明るい無彩に近い色）。
 * 屋根の膨らみの高さは航空写真では分からないので、低い円錐に近いドームにとどめる
 */

/** OSM の輪郭（way 423067243）の西側の円弧 10 点に当てはめた円。各点のずれは 0.4m 以内 */
const ROTUNDA_CX = 7.13;
const ROTUNDA_CZ = -92.73;
const ROTUNDA_R = 10.77;
/** 輪郭の点を「円の上」とみなす、半径との差の上限 (m) */
const ON_CIRCLE_TOL_M = 0.6;
/** 東の翼と北の翼の境目にする、輪郭の入隅の点（航空写真で屋根の色がここで変わる） */
const WING_INNER_CORNER: Pt = [29.16, -101.91];

/**
 * 円形部分の高さ（円の中心の地面から, m）。写真の 1 階：2 階 ≒ 265px：305px、
 * 2 階の内訳は 床の帯 45px・手すり壁 95px・窓 165px。OSM の 3 階・12.8m に収める
 */
const GF_TOP = 3.4;
const SLAB2_TOP = 4.0;
const PARAPET_TOP = 5.1;
const WINDOW2_TOP = 7.3;
const SLAB3_TOP = 7.9;
/** 最上部の白い帯の高さ。帯の上端（軒）は旧館の翼の屋根と同じ高さ（OSM の 12.8m）にそろえる */
const TOP_BAND_HEIGHT = 0.6;
/** 緑青の屋根の膨らみ（軒から天窓の根元まで）。航空写真では高さが読めないので低く */
const DOME_RISE = 1.6;
const SKYLIGHT_R = 1.1;

/** 半径方向の出入り (m)。床の帯は柱より少し出て、2 階の窓はバルコニーの奥行きだけ下がる */
const SLAB_PROUD = 0.25;
const POST_OUTER = 0.15;
const POST_DEPTH = 0.6;
const POST_WIDTH = 0.5;
const WINDOW_SETBACK = 0.9;
const CORE_SETBACK = 3.0;
const COLUMN_INSET = 0.6;
const COLUMN_WIDTH = 0.75;
const COLUMN_DEPTH = 0.9;
const EAVE_PROUD = 0.35;
/** 写真の 1 区画（白い縦の柱の間隔）の幅。2 階の高さの約 1.1 倍 */
const BAY_TARGET_M = 4.35;

const COLORS = {
  brick: '#84635A',
  /** レンガ壁の material.color（テクスチャのレンガの面 #D0 を掛けて brick の色になる値。白い目地はこの色で出る） */
  brickLit: '#A37B70',
  frame: '#E6E3DC',
  upperGlass: '#56657A',
  railing: '#24272C',
  tileBlue: '#4F6BAA',
  tileBlueJoint: '#3F578D',
  tileGreen: '#4C7D5C',
  tileGreenJoint: '#3C6649',
  tileYellow: '#D0B060',
  glass: '#2B333D',
  sash: '#3E5E98',
  core: '#5A4F4C',
  copper: '#7A9F7F',
  /** 東の翼の屋根の、円形部分に接する隅の緑青（航空写真で円の外の北東の隅を平均した値） */
  copperFlat: '#7D937B',
  skylight: '#D6E2E3',
  /** 旧館の壁は写真が無い。東の翼は航空写真で白い屋根なので、壁も明るい無彩に近い色にとどめる（薄茶にしない） */
  wingWall: '#D8D3C8',
  /** 航空写真の屋根の色（東の翼の白 #E6E4D4・北の翼の灰茶 #7B756B を輪郭の内側で平均した値） */
  eastRoof: '#E6E4D4',
  northRoof: '#7B756B',
} as const;

const TAU = Math.PI * 2;

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** CanvasTexture を作る。document が無い環境（テスト）では null */
function makeCanvasTexture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return null;
  draw(g);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** レンガ目地（横は rowPx おき、縦は段ごとに半分ずらす）を描く */
function drawBrickJoints(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rowPx: number,
  brickPx: number,
  color: string,
): void {
  g.fillStyle = color;
  let row = 0;
  for (let y = y0; y < y0 + h; y += rowPx, row++) {
    g.fillRect(x0, y, w, 1);
    const off = row % 2 === 0 ? 0 : brickPx / 2;
    for (let x = x0 + off; x < x0 + w; x += brickPx) {
      g.fillRect(Math.floor(x), y, 1, rowPx);
    }
  }
}

/**
 * 2 階の手すり壁。写真では区画ごとに、青いタイルの面に緑のタイルの区画（右の縦の帯・右下の帯・右上の塊）と、
 * 黄色の細い縁取りが入る。3 つの組み合わせを区画ごとに回す
 */
function createParapetTexture(bays: number): THREE.CanvasTexture | null {
  const bw = 96;
  const h = 24;
  return makeCanvasTexture(bays * bw, h, (g) => {
    for (let i = 0; i < bays; i++) {
      const x0 = i * bw;
      g.fillStyle = COLORS.tileBlue;
      g.fillRect(x0, 0, bw, h);
      drawBrickJoints(g, x0, 0, bw, h, 4, 12, COLORS.tileBlueJoint);
      const variant = i % 3;
      let gx = x0 + bw * 0.78;
      let gy = 0;
      let gw = bw * 0.22;
      let gh = h;
      if (variant === 1) {
        gx = x0 + bw * 0.72;
        gy = h * 0.62;
        gw = bw * 0.28;
        gh = h * 0.38;
      } else if (variant === 2) {
        gx = x0 + bw * 0.55;
        gy = 0;
        gw = bw * 0.45;
        gh = h * 0.42;
      }
      g.fillStyle = COLORS.tileGreen;
      g.fillRect(gx, gy, gw, gh);
      drawBrickJoints(g, gx, gy, gw, gh, 4, 12, COLORS.tileGreenJoint);
      // 黄色の L 字の縁取り（写真では区画の下の隅に小さく入る）
      g.fillStyle = COLORS.tileYellow;
      const lx = variant === 0 ? x0 + 4 : gx - 14;
      g.fillRect(lx, h - 9, 2, 7);
      g.fillRect(lx, h - 3, 12, 2);
    }
  });
}

/** 2 階の横長窓。暗いガラスに青い枠（縦 2 本・下に横 1 本） */
function createWindowTexture(bays: number): THREE.CanvasTexture | null {
  const bw = 64;
  const h = 32;
  return makeCanvasTexture(bays * bw, h, (g) => {
    g.fillStyle = COLORS.glass;
    g.fillRect(0, 0, bays * bw, h);
    g.fillStyle = COLORS.sash;
    for (let i = 0; i < bays; i++) {
      const x0 = i * bw;
      g.fillRect(x0 + 4, 2, bw - 8, 2);
      g.fillRect(x0 + 4, h - 3, bw - 8, 2);
      g.fillRect(x0 + 4, 2, 2, h - 4);
      g.fillRect(x0 + bw - 6, 2, 2, h - 4);
      g.fillRect(x0 + Math.round(bw / 3), 2, 2, h - 4);
      g.fillRect(x0 + Math.round((bw * 2) / 3), 2, 2, h - 4);
      g.fillRect(x0 + 4, Math.round(h * 0.78), bw - 8, 2);
    }
  });
}

/** 3 階のレンガ壁と窓のテクスチャの 1 区画の大きさ（px）。1 区画 ≒ 4.35m × 4.3m なので約 44px/m */
const BRICK_BAY_PX = 192;
const BRICK_H_PX = 192;

/**
 * 3 階のレンガ壁（material.color に掛け合わせる明暗）。写真のレンガは 1 区画の幅に 12〜13 個、段の高さは長さの約 1/3
 * （1 個 約 0.35m × 0.11m）。目地は明るい灰色なので、レンガの面を #D0 にして目地を白く（material.color は明るめに取る）。
 * 窓はこのテクスチャに描かず、白い枠の窓を別の面（createUpperWindowTexture）で重ねる
 */
function createBrickTexture(bays: number): THREE.CanvasTexture | null {
  const w = bays * BRICK_BAY_PX;
  const h = BRICK_H_PX;
  const rowPx = 5;
  const brickPx = 16;
  return makeCanvasTexture(w, h, (g) => {
    g.fillStyle = '#D0D0D0';
    g.fillRect(0, 0, w, h);
    // 写真のレンガは 1 個ずつ濃淡がばらつく。決まった並びの擬似乱数で 3 段階の濃淡を散らす
    let seed = 7;
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let row = 0;
    for (let y = 0; y < h; y += rowPx, row++) {
      const off = row % 2 === 0 ? 0 : brickPx / 2;
      for (let x = -off; x < w; x += brickPx) {
        const r = rand();
        if (r < 0.3) g.fillStyle = '#BDBDBD';
        else if (r > 0.8) g.fillStyle = '#DEDEDE';
        else continue;
        g.fillRect(Math.max(0, x), y, brickPx, rowPx);
      }
    }
    drawBrickJoints(g, 0, 0, w, h, rowPx, brickPx, '#FFFFFF');
  });
}

/**
 * 3 階の窓（レンガ壁の少し外に重ねる面。窓の外は透明で、alphaTest で抜く）。写真（Kansai_University_Museum.jpg）の 3 階:
 * 窓のある区画と「館」の板だけの区画が交互（板は描かない）。窓は白い枠（中央に縦の桟）で、下の 3 分の 1 ほどに
 * 黒い鉄の手すり、その足元に青いタイルの細い台。窓の幅は区画の約半分（写真の右の窓は区画 330px に対して 175px）。窓の上端は写真の外なので、レンガ壁の上から 1 割ほど下で止める。
 * 公式資料の「アーモンド型の高窓」は写真の範囲に写っていないので描かない
 */
function createUpperWindowTexture(bays: number): THREE.CanvasTexture | null {
  const bw = BRICK_BAY_PX;
  const h = BRICK_H_PX;
  return makeCanvasTexture(bays * bw, h, (g) => {
    g.clearRect(0, 0, bays * bw, h);
    const winW = Math.round(bw * 0.48);
    const winTop = Math.round(h * 0.11);
    const winBottom = Math.round(h * 0.92);
    const winH = winBottom - winTop;
    const frame = 5;
    const railTop = winBottom - Math.round(winH * 0.34);
    for (let i = 0; i < bays; i += 2) {
      const x0 = i * bw + Math.round((bw - winW) / 2);
      // 白い枠とガラス（空を映す灰青）、中央の縦の桟と上の横の桟
      g.fillStyle = COLORS.frame;
      g.fillRect(x0, winTop, winW, winH);
      g.fillStyle = COLORS.upperGlass;
      g.fillRect(x0 + frame, winTop + frame, winW - frame * 2, winH - frame * 2);
      g.fillStyle = COLORS.frame;
      g.fillRect(x0 + Math.round(winW / 2) - 2, winTop, 4, winH);
      g.fillRect(x0, winTop + Math.round(winH * 0.24), winW, 3);
      // 黒い鉄の手すり（上下の横棒と細い縦棒）
      g.fillStyle = COLORS.railing;
      g.fillRect(x0 - 2, railTop, winW + 4, 3);
      g.fillRect(x0 - 2, winBottom - 4, winW + 4, 3);
      for (let x = x0 + 3; x < x0 + winW - 1; x += 7) g.fillRect(x, railTop, 2, winBottom - railTop);
      // 手すりの足元の青いタイルの台
      g.fillStyle = COLORS.tileBlue;
      g.fillRect(x0 - 4, winBottom - 1, winW + 8, Math.round(h * 0.05));
    }
  });
}

/** 緑青の屋根の放射状の継ぎ目（LatheGeometry の u は周方向なので、縦線が放射状の線になる） */
function createSeamTexture(): THREE.CanvasTexture | null {
  const w = 576;
  const h = 8;
  const seams = 36;
  return makeCanvasTexture(w, h, (g) => {
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#D8E0D6';
    for (let i = 0; i < seams; i++) {
      g.fillRect(Math.round((i * w) / seams), 0, 2, h);
    }
  });
}

interface OutlineSplit {
  /** 旧館の翼（東・北。境目が見つからなければ 1 つ） */
  wings: Pt[][];
  /** 円形部分が外に出ている円弧（角度は atan2(z - cz, x - cx)。start から増える向きに span） */
  freeStart: number;
  freeSpan: number;
  /**
   * 東の翼が円に接する所: 南の辺の円の上の点（start）とその次の点（next）、北の辺の円の上の点（end）と
   * 北の翼との入隅（corner）。東と北に分けられなかったときは null
   */
  attach: { start: Pt; next: Pt; end: Pt; corner: Pt } | null;
}

/**
 * 輪郭を「円の上の点」と「翼の点」に分け、翼の輪郭は円に接する所を円弧でえぐって閉じる
 * （円形部分の円柱と翼の箱が重ならないように）
 */
function splitOutline(polygon: readonly Pt[]): OutlineSplit {
  const n = polygon.length;
  const angleOf = (p: Pt): number => Math.atan2(p[1] - ROTUNDA_CZ, p[0] - ROTUNDA_CX);
  const onCircle = polygon.map(
    ([x, z]) => Math.abs(Math.hypot(x - ROTUNDA_CX, z - ROTUNDA_CZ) - ROTUNDA_R) < ON_CIRCLE_TOL_M,
  );
  let j0 = -1;
  for (let i = 0; i < n; i++) {
    if (onCircle[i] && !onCircle[(i + 1) % n]) {
      j0 = i;
      break;
    }
  }
  if (j0 < 0) {
    return { wings: [polygon.map(([x, z]) => [x, z] as Pt)], freeStart: 0, freeSpan: TAU, attach: null };
  }
  const run: Pt[] = [];
  let j1 = -1;
  for (let k = 1; k < n; k++) {
    const idx = (j0 + k) % n;
    const p = polygon[idx];
    if (!p) continue;
    if (onCircle[idx]) {
      j1 = idx;
      break;
    }
    run.push([p[0], p[1]]);
  }
  const p0 = polygon[j0];
  const p1 = j1 >= 0 ? polygon[j1] : undefined;
  if (!p0 || !p1 || run.length < 2) {
    return { wings: [polygon.map(([x, z]) => [x, z] as Pt)], freeStart: 0, freeSpan: TAU, attach: null };
  }
  const a0 = angleOf(p0);
  const a1 = angleOf(p1);
  const s = mod(a1 - a0, TAU);
  // 接点以外の円の上の点が a0→a1（増える向き）に入っていれば、そちらが外に出ている円弧
  let probe: number | null = null;
  for (let i = 0; i < n; i++) {
    const p = polygon[i];
    if (onCircle[i] && i !== j0 && i !== j1 && p) {
      probe = angleOf(p);
      break;
    }
  }
  const freeIsA0toA1 = probe === null ? s > Math.PI : mod(probe - a0, TAU) < s;
  const freeStart = freeIsA0toA1 ? a0 : a1;
  const freeSpan = freeIsA0toA1 ? s : TAU - s;
  // 翼に接する円弧（p1 から p0 へ戻る向き）を 8° おきに足して閉じる
  const attachedStart = freeIsA0toA1 ? a1 : a0;
  const attachedSpan = TAU - freeSpan;
  const steps = Math.max(2, Math.ceil(attachedSpan / ((8 * Math.PI) / 180)));
  const arc: Pt[] = [];
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    const a = attachedStart + attachedSpan * (freeIsA0toA1 ? t : 1 - t);
    arc.push([ROTUNDA_CX + Math.cos(a) * ROTUNDA_R, ROTUNDA_CZ + Math.sin(a) * ROTUNDA_R]);
  }
  const start: Pt = [p0[0], p0[1]];
  const end: Pt = [p1[0], p1[1]];

  // 入隅の点で東と北の翼に分ける（東は円弧を含む側）
  let cornerIdx = -1;
  let best = 1.0;
  run.forEach((p, i) => {
    const d = Math.hypot(p[0] - WING_INNER_CORNER[0], p[1] - WING_INNER_CORNER[1]);
    if (d < best) {
      best = d;
      cornerIdx = i;
    }
  });
  const corner = cornerIdx >= 0 ? run[cornerIdx] : undefined;
  if (!corner || cornerIdx === 0 || cornerIdx === run.length - 1) {
    return { wings: [[start, ...run, end, ...arc]], freeStart, freeSpan, attach: null };
  }
  const east: Pt[] = [start, ...run.slice(0, cornerIdx + 1), end, ...arc];
  const north: Pt[] = [corner, ...run.slice(cornerIdx + 1), end];
  const next = run[0];
  const attach = next ? { start, next: [next[0], next[1]] as Pt, end, corner: [corner[0], corner[1]] as Pt } : null;
  return { wings: [east, north], freeStart, freeSpan, attach };
}

/** 角度 φ（atan2(z, x)）を CylinderGeometry / LatheGeometry の θ（x = sinθ, z = cosθ）に直す */
function phiToTheta(phi: number): number {
  return Math.PI / 2 - phi;
}

/**
 * 航空写真で東の翼の白い屋根の西の端: 北半分は x≈17.4、南半分は x≈19.7（境は z≈−96 の東西の影の線）。
 * その西（円形部分との隅と、南半分の円との間の帯）は円形部分と同じ緑青色。輪郭は航空写真の西へ約 2.9m のずれを補って測った
 */
const WHITE_ROOF_WEST_X_NORTH = 17.4;
const WHITE_ROOF_WEST_X_SOUTH = 19.7;
const WHITE_ROOF_STEP_Z = -96;

/** 直線 a→b の上で x になる点の z */
function zOnLineAtX(a: Pt, b: Pt, x: number): number {
  const t = (x - a[0]) / (b[0] - a[0]);
  return a[1] + (b[1] - a[1]) * t;
}

/** 円の上の角度 a0 から a1 まで（増える向き）を 6° おきに取る（両端を除く） */
function arcBetween(a0: number, a1: number): Pt[] {
  const span = mod(a1 - a0, TAU);
  const steps = Math.max(2, Math.ceil(span / ((6 * Math.PI) / 180)));
  const out: Pt[] = [];
  for (let k = 1; k < steps; k++) {
    const a = a0 + (span * k) / steps;
    out.push([ROTUNDA_CX + Math.cos(a) * ROTUNDA_R, ROTUNDA_CZ + Math.sin(a) * ROTUNDA_R]);
  }
  return out;
}

/**
 * 東の翼の屋根の上に重ねる緑青色の隅（北の隅と南の帯の 2 つ）。円の東側の弧（end → start、角度が増える向き）と、
 * 白い屋根の西の端の段つきの直線で囲む
 */
function eastRoofCornerCaps(attach: { start: Pt; next: Pt; end: Pt; corner: Pt }): Pt[][] {
  const { start, next, end, corner } = attach;
  const angleOf = (p: Pt): number => Math.atan2(p[1] - ROTUNDA_CZ, p[0] - ROTUNDA_CX);
  const dz = WHITE_ROOF_STEP_Z - ROTUNDA_CZ;
  if (Math.abs(dz) >= ROTUNDA_R) return [];
  // 段の線（z = WHITE_ROOF_STEP_Z）が円の東側と交わる点
  const step: Pt = [ROTUNDA_CX + Math.sqrt(ROTUNDA_R * ROTUNDA_R - dz * dz), WHITE_ROOF_STEP_Z];
  const north: Pt[] = [
    [WHITE_ROOF_WEST_X_NORTH, zOnLineAtX(corner, end, WHITE_ROOF_WEST_X_NORTH)],
    end,
    ...arcBetween(angleOf(end), angleOf(step)),
    step,
  ];
  // 段の線が円と交わる点は x≈17.39 で、北半分の西の端（17.4）とほぼ重なる。離れているときだけ角を足す
  if (Math.abs(step[0] - WHITE_ROOF_WEST_X_NORTH) > 0.05) north.push([WHITE_ROOF_WEST_X_NORTH, WHITE_ROOF_STEP_Z]);
  const south: Pt[] = [
    step,
    ...arcBetween(angleOf(step), angleOf(start)),
    start,
    [WHITE_ROOF_WEST_X_SOUTH, zOnLineAtX(start, next, WHITE_ROOF_WEST_X_SOUTH)],
    [WHITE_ROOF_WEST_X_SOUTH, WHITE_ROOF_STEP_Z],
  ];
  return [north, south];
}

export const buildKanbunkan: HeroBuilder = (ctx) => {
  const group = new THREE.Group();
  group.name = 'kanbunkan';
  const polygon = ctx.building.polygon;
  const { wings, freeStart, freeSpan, attach } = splitOutline(polygon);

  const cx = ROTUNDA_CX;
  const cz = ROTUNDA_CZ;
  const R = ROTUNDA_R;
  const baseY = ctx.sampleGroundVisualY(cx, cz);
  let rotundaLowest = baseY;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    rotundaLowest = Math.min(rotundaLowest, ctx.sampleGroundVisualY(cx + Math.cos(a) * R, cz + Math.sin(a) * R));
  }
  const rotundaBottom = rotundaLowest - 0.5;
  const wingTop = ctx.groundVisualY + ctx.building.height;
  const topBandTop = Math.max(baseY + SLAB3_TOP + 3.0 + TOP_BAND_HEIGHT, wingTop);
  const brick3Top = topBandTop - TOP_BAND_HEIGHT;

  const bays = Math.max(3, Math.round((freeSpan * R) / BAY_TARGET_M));
  const freeThetaStart = phiToTheta(freeStart + freeSpan);

  // 材質
  const brickTex = createBrickTexture(bays);
  const brickHex = brickTex ? COLORS.brickLit : COLORS.brick;
  const brickMat = new THREE.MeshStandardMaterial({
    color: brickHex,
    map: brickTex,
    roughness: 0.86,
    metalness: 0.02,
  });
  const upperWindowTex = createUpperWindowTexture(bays);
  const upperWindowMat = upperWindowTex
    ? new THREE.MeshStandardMaterial({
        color: '#FFFFFF',
        map: upperWindowTex,
        alphaTest: 0.5,
        roughness: 0.45,
        metalness: 0.04,
      })
    : null;
  const frameMat = new THREE.MeshStandardMaterial({ color: COLORS.frame, roughness: 0.8, metalness: 0.02 });
  const parapetTex = createParapetTexture(bays);
  const parapetMat = new THREE.MeshStandardMaterial({
    color: parapetTex ? '#FFFFFF' : COLORS.tileBlue,
    map: parapetTex,
    roughness: 0.55,
    metalness: 0.04,
  });
  const windowTex = createWindowTexture(bays);
  const windowMat = new THREE.MeshStandardMaterial({
    color: windowTex ? '#FFFFFF' : COLORS.glass,
    map: windowTex,
    roughness: 0.35,
    metalness: 0.05,
  });
  const coreMat = new THREE.MeshStandardMaterial({ color: COLORS.core, roughness: 0.9, metalness: 0.02 });
  const seamTex = createSeamTexture();
  const copperMat = new THREE.MeshStandardMaterial({
    color: COLORS.copper,
    map: seamTex,
    roughness: 0.62,
    metalness: 0.08,
  });
  const skylightMat = new THREE.MeshStandardMaterial({ color: COLORS.skylight, roughness: 0.3, metalness: 0.05 });
  const wingWallMat = new THREE.MeshStandardMaterial({ color: COLORS.wingWall, roughness: 0.85, metalness: 0.02 });
  const eastRoofMat = new THREE.MeshStandardMaterial({ color: COLORS.eastRoof, roughness: 0.9, metalness: 0.02 });
  const northRoofMat = new THREE.MeshStandardMaterial({ color: COLORS.northRoof, roughness: 0.9, metalness: 0.02 });
  const copperFlatMat = new THREE.MeshStandardMaterial({ color: COLORS.copperFlat, roughness: 0.7, metalness: 0.06 });

  const addCylinder = (
    name: string,
    radius: number,
    y0: number,
    y1: number,
    mat: THREE.Material,
    opts: { segments?: number; open?: boolean; partial?: boolean; shadow?: boolean } = {},
  ): THREE.Mesh => {
    const geo = new THREE.CylinderGeometry(
      radius,
      radius,
      y1 - y0,
      opts.segments ?? 64,
      1,
      opts.open ?? false,
      opts.partial ? freeThetaStart : 0,
      opts.partial ? freeSpan : TAU,
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.position.set(cx, (y0 + y1) / 2, cz);
    mesh.castShadow = opts.shadow ?? false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // ── 円形部分（1955 年 村野藤吾） ──
  // 1 階: 奥まった壁（ピロティの奥。写真では暗いレンガとガラス戸）
  addCylinder('kanbunkan-gf-core', R - CORE_SETBACK, rotundaBottom, baseY + GF_TOP, coreMat, { segments: 48 });
  // 2 階の床の帯（下面がピロティの天井になる）
  addCylinder('kanbunkan-slab2', R + SLAB_PROUD, baseY + GF_TOP, baseY + SLAB2_TOP, frameMat, { shadow: true });
  // 2 階: 青と緑のタイルの手すり壁と、奥の横長窓
  addCylinder('kanbunkan-parapet', R, baseY + SLAB2_TOP, baseY + PARAPET_TOP, parapetMat, {
    open: true,
    partial: true,
  });
  addCylinder('kanbunkan-window2', R - WINDOW_SETBACK, baseY + SLAB2_TOP, baseY + WINDOW2_TOP, windowMat, {
    open: true,
    partial: true,
  });
  // 3 階の床の帯・3 階のレンガ壁・最上部の帯
  addCylinder('kanbunkan-slab3', R + POST_OUTER, baseY + WINDOW2_TOP, baseY + SLAB3_TOP, frameMat);
  addCylinder('kanbunkan-brick3', R - 0.05, baseY + SLAB3_TOP, brick3Top, brickMat, {
    open: true,
    partial: true,
    shadow: true,
  });
  addCylinder('kanbunkan-top-band', R + POST_OUTER, brick3Top, topBandTop, frameMat, {
    shadow: true,
  });
  // 3 階の白い枠の窓（レンガ壁の 4cm 外に重ねる。テクスチャが作れない環境では省く）
  if (upperWindowMat) {
    addCylinder('kanbunkan-windows3', R - 0.01, baseY + SLAB3_TOP, brick3Top, upperWindowMat, {
      open: true,
      partial: true,
    });
  }

  // 白い縦の柱（2 階の床から最上部の帯まで）と、その下の 1 階の角柱。区画の境目ごと（円弧の両端を含む）
  const postAngles: number[] = [];
  for (let k = 0; k <= bays; k++) postAngles.push(freeStart + (freeSpan * k) / bays);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  unitBox.translate(0, 0.5, 0);
  const posts = new THREE.InstancedMesh(unitBox, frameMat, postAngles.length);
  posts.name = 'kanbunkan-posts';
  const columns = new THREE.InstancedMesh(unitBox, frameMat, postAngles.length);
  columns.name = 'kanbunkan-piloti';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  postAngles.forEach((phi, i) => {
    q.setFromAxisAngle(up, phiToTheta(phi));
    const pr = R + POST_OUTER - POST_DEPTH / 2;
    m.compose(
      new THREE.Vector3(cx + Math.cos(phi) * pr, baseY + GF_TOP, cz + Math.sin(phi) * pr),
      q,
      new THREE.Vector3(POST_WIDTH, topBandTop - baseY - GF_TOP, POST_DEPTH),
    );
    posts.setMatrixAt(i, m);
    const cr = R - COLUMN_INSET;
    const colX = cx + Math.cos(phi) * cr;
    const colZ = cz + Math.sin(phi) * cr;
    const colBottom = ctx.sampleGroundVisualY(colX, colZ) - 0.5;
    m.compose(
      new THREE.Vector3(colX, colBottom, colZ),
      q,
      new THREE.Vector3(COLUMN_WIDTH, baseY + GF_TOP - colBottom, COLUMN_DEPTH),
    );
    columns.setMatrixAt(i, m);
  });
  posts.instanceMatrix.needsUpdate = true;
  columns.instanceMatrix.needsUpdate = true;
  posts.receiveShadow = true;
  columns.receiveShadow = true;
  group.add(posts, columns);

  // 緑青の屋根（低いドーム。放射状の継ぎ目）と中央の円い天窓
  const domeProfile = [
    new THREE.Vector2(R + POST_OUTER, -0.12),
    new THREE.Vector2(R + EAVE_PROUD, -0.12),
    new THREE.Vector2(R + EAVE_PROUD, 0.06),
    new THREE.Vector2(R * 0.78, DOME_RISE * 0.38),
    new THREE.Vector2(R * 0.5, DOME_RISE * 0.69),
    new THREE.Vector2(R * 0.25, DOME_RISE * 0.9),
    new THREE.Vector2(SKYLIGHT_R, DOME_RISE),
  ];
  const domeGeo = new THREE.LatheGeometry(domeProfile, 72);
  const dome = new THREE.Mesh(domeGeo, copperMat);
  dome.name = 'kanbunkan-dome';
  dome.position.set(cx, topBandTop, cz);
  dome.castShadow = true;
  dome.receiveShadow = true;
  group.add(dome);
  const skylight = new THREE.Mesh(new THREE.CylinderGeometry(SKYLIGHT_R, SKYLIGHT_R, 0.45, 24), skylightMat);
  skylight.name = 'kanbunkan-skylight';
  skylight.position.set(cx, topBandTop + DOME_RISE + 0.1, cz);
  group.add(skylight);

  // ── 旧館（1928 年）: 東と北の翼。写真が無いので輪郭どおりの無地の箱 ──
  wings.forEach((wing, i) => {
    const bottom = minGroundUnder(ctx, wing) - 0.5;
    const roofMat = i === 0 ? eastRoofMat : northRoofMat;
    const mesh = new THREE.Mesh(extrudePolygonXZ(wing, bottom, wingTop - bottom), [roofMat, wingWallMat]);
    mesh.name = i === 0 ? 'kanbunkan-wing-east' : 'kanbunkan-wing-north';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  // 東の翼の屋根のうち、円形部分の東の隅（航空写真で白い屋根の西の端より西）は緑青色。白い屋根の西の端は直線になる
  if (attach) {
    eastRoofCornerCaps(attach).forEach((cap, i) => {
      const mesh = new THREE.Mesh(extrudePolygonXZ(cap, wingTop - 0.02, 0.06), copperFlatMat);
      mesh.name = `kanbunkan-roof-corner-${i}`;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
  }

  return {
    group,
    primaryMaterials: [
      { mat: brickMat, baseHex: brickHex },
      { mat: wingWallMat, baseHex: COLORS.wingWall },
      { mat: copperMat, baseHex: COLORS.copper },
    ],
    animated: [],
  };
};
