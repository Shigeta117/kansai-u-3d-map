import * as THREE from 'three';
import { minGroundUnder } from './shared';
import type { HeroBuildContext, HeroBuilder, HeroBuildResult } from './types';

/**
 * 第3学舎の専用モデル。
 *
 * 資料: docs/visual-research/area3.md（持ち主の写真 2 枚、関西大学会館〈本部〉側＝南西から）、
 * official-buildings.md（3 号館は地上 10 階、2002 年）、commons-buildings.md の第3学舎
 * （Commons の 3 枚: the_3rd_building〈2022〉、関西大学第3学舎.JPG〈2012〉、Dai-3_Gakusha〈2010〉）。
 *
 * 塔の位置の根拠:
 * - OSM の輪郭（37 点・中庭 1 つ）は、南の長い辺 7→8 の向き（東北東、約 -19.8°）に沿った直交の形。
 *   西端に中庭の無い 17.4m × 31.2m の塊（u = -301.7〜-284.3）があり、そこから東へ雁行する棟が続く
 * - 2012 年の Commons の写真（南西の芝の斜面から）では、塔が左、5 階の棟が右（東）へ 3 段に雁行して続く。
 *   輪郭の南面も u = -263.5 の段差と u = -239.4〜-236.9 の切れ込みで 3 区画に分かれ、写真の 3 段と合う
 * - 2022 年の写真では、フィンの面の下に入口（金属の庇つき）がある。西門の新アクセス道（屋根付き歩道）の終点は
 *   この西の面の前（u ≈ -312、v = 156〜167）で、輪郭の西の面には小さな張り出し（風除室と見た）がある
 * - よって塔は西端の塊。フィンの面は西の面（アクセス道の到着点を向く）、その南寄り 6 割。
 *   写真では塔の南面の東寄りの区画（窓が 2 つずつ並ぶ）が一段高い細い塔になり、上部に校章とアンテナがある
 *
 * 座標は、南の辺に沿う u（東北東が +）と、それに直交する v（南南東が +）の枠で組み、group ごと回して置く。
 */

type P2 = [number, number];

/** 南の長い辺（輪郭の点 7→8）の向き。u 軸（東北東）と v 軸（南南東、南面の外向き） */
const AXIS_U: P2 = [0.94101, -0.33837];
const AXIS_V: P2 = [0.33837, 0.94101];
/** 枠の group の回転。ローカルの +X が AXIS_U、+Z が AXIS_V になる角度 */
const FRAME_ROT_Y = Math.atan2(-AXIS_U[1], AXIS_U[0]);

function toWorld(u: number, v: number): P2 {
  return [u * AXIS_U[0] + v * AXIS_V[0], u * AXIS_U[1] + v * AXIS_V[1]];
}
function toFrame(x: number, z: number): P2 {
  return [x * AXIS_U[0] + z * AXIS_U[1], x * AXIS_V[0] + z * AXIS_V[1]];
}

// --- 輪郭から読んだ寸法（u, v。単位 m） ---
/** 塔の塊と雁行する棟の境目（輪郭の点 8・9 の u） */
const TOWER_EAST_U = -284.3;
/** 塔の西の面（輪郭の点 0・1・4） */
const WEST_FACE_U = -301.7;
/** 塔の北の面（輪郭の点 0・36） */
const TOWER_NORTH_V = 145.7;
/** 塔の南の面（輪郭の点 7・8） */
const TOWER_SOUTH_V = 176.9;
/** 南西の隅の欠き込み（輪郭の点 5→6→7） */
const CHAMFER_U = -299.5;
const CHAMFER_V = 173.2;
/** 西の面の張り出し（輪郭の点 1→2→3→4）。入口の風除室と見た */
const VESTIBULE = { u0: -306.5, u1: WEST_FACE_U, v0: 166.5, v1: 169.7 } as const;
/** アクセス道の屋根の終点（structures.json の access-west-canopy の T 字の端、u ≈ -312.3） */
const ACCESS_CANOPY_END_U = -312.6;

// --- 塔の段（写真で数えた階数と、面の幅に対する割合） ---
/**
 * 西の面の北寄りは低く、フィンの面の左肩が 2 段下がる（2012 年の写真。2022 年の写真でも 1 段目が見える）。
 * フィンの部分は面の幅の約 6 割で南寄り。その北（写真の左）の段の上端はフィンの下端より 1 階ほど高く（8 階）、
 * さらに北の端の上端はフィンの下端とそろう（7 階。2012 年の写真で、フィンの下端の線の延長に乗る）
 */
const STEP_NORTH_V = 150.5;
const MAIN_TOWER_NORTH_V = 157.4;
/** 一段高い細い塔（南面の東寄りの、窓が 2 つずつ並ぶ区画）。奥行きは写真に写らないので 8.9m とした */
const SLENDER = { u0: -292.3, u1: TOWER_EAST_U, v0: 168.0, v1: TOWER_SOUTH_V } as const;

const FLOOR_HEIGHT_M = 3.9;
const TOWER_FLOORS = 10;
/** 雁行する棟（5 階） */
const LOW_FLOORS = 5;
/** 西の塊の土台（北の端に見える 2 段目、7 階） */
const BASE_FLOORS = 7;
/** 左肩の 1 段目（8 階） */
const STEP_FLOORS = 8;
const BASE_PARAPET_M = 0.3;
/**
 * フィンは 8〜10 階の 3 層（2022 年の写真で、フィンの下に窓の列が 6 段＋入口の階。2012 年の写真でも
 * 窓が 2 つずつの面の 3 段分）。下端は西の面の北の端（7 階）の屋上とそろう。その上に文字（模型では細い青い線）を載せる笠木
 */
const FIN_FROM_FLOOR = 7;
const TOWER_CROWN_M = 2.2;
const PARAPET_M = 1.0;
const SLENDER_EXTRA_M = 4.2;
/** フィンの面: 窓の縦の帯 6 本（写真）。内側のフィン 5 本と両端の枠 */
const FIN_BAYS = 6;
const FIN_DEPTH_M = 1.4;
const FIN_WIDTH_M = 0.6;
const FRAME_WIDTH_M = 0.9;

const FOOTING_BELOW_LOWEST_GROUND_M = 0.5;

const COLORS = {
  tile: '#DCD4C3', // ベージュ〜オフホワイトのタイル（Commons の観察 #d3cdbc を少し明るく）
  roof: '#A9A49A',
  plinth: '#CFC7B5',
  finGlass: '#4E6273',
  blue: '#2F56B0', // 「関西大学」の青い立体文字（模型では文字の位置に細い青い線を 4 本）
  emblem: '#C2B9A6', // 校章（模型では壁と同系の少し濃い無地の円）
  windowFrame: '#F7F6F2', // 窓の白い枠（2012 年・2022 年の写真）
  windowGlass: '#9AAEBE', // 空を映す明るめのガラス
  penthouse: '#8C9093',
  vestibuleGlass: '#5F7A88',
  canopy: '#C9CCCE',
  antenna: '#B0B4B8',
} as const;

/** 窓の模様の 1 枚の横幅（m）。塔は四角い窓、低い棟は横長の窓の帯 */
const TOWER_WINDOW_TILE_M = 2.6;
const BAND_WINDOW_TILE_M = 1.8;

/** 「関西大学」の文字の代わりの細い青い線: フィンの 6 区画のうち 2〜5 番目の上に 1 本ずつ（2022 年の写真の文字の位置） */
const LETTER_BAYS = [1, 2, 3, 4] as const;
const LETTER_WIDTH_OF_BAY = 0.7;
const LETTER_LINE_M = 0.3;
/** 校章の円（2012 年の写真で、細い塔の南面の幅の約 1/5、上端から 1 階分ほど下） */
const EMBLEM_RADIUS_M = 0.8;
const EMBLEM_BELOW_TOP_M = 2.0;

// ---------------------------------------------------------------------------
// 小道具

function pointInRing(x: number, z: number, ring: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

/** 輪郭を半平面（keepGreater なら u ≥ uCut、そうでなければ u ≤ uCut）で切る（Sutherland–Hodgman。枠の座標で） */
function clipRingByU(ring: readonly P2[], uCut: number, keepGreater: boolean): P2[] {
  const inside = (p: P2): boolean => (keepGreater ? p[0] >= uCut : p[0] <= uCut);
  const out: P2[] = [];
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i];
    const prev = ring[(i + ring.length - 1) % ring.length];
    if (!cur || !prev) continue;
    const cIn = inside(cur);
    const pIn = inside(prev);
    if (cIn !== pIn) {
      const t = (uCut - prev[0]) / (cur[0] - prev[0]);
      out.push([uCut, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (cIn) out.push(cur);
  }
  return out;
}

function rect(u0: number, u1: number, v0: number, v1: number): P2[] {
  return [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
}

/** 壁の辺が窓の無い無地の面か（辺の中点 (u, v) と外向きの法線で判定） */
type PlainWallTest = (mu: number, mv: number, n: P2) => boolean;

/**
 * 輪郭（穴つき）を baseY から topY まで押し出す。座標は枠の (u, v) を (x, z) として使う。
 * - 材質の番号: 0 = 屋根（上の蓋）、1 = 壁（splitY より上。窓の模様）、2 = 壁（splitY より下。無地の基礎）、
 *   3 = 壁（splitY より上で、isPlain が真の辺。窓の無い無地の面）
 * - 壁の UV は m 単位（u = 輪郭に沿った長さ、v = y − splitY）。模様は texture.repeat で 1 枚の寸法に合わせる
 * - 底の蓋は作らない（いつも地面の下）
 */
function buildPrism(
  outer: readonly P2[],
  holes: readonly (readonly P2[])[],
  baseY: number,
  topY: number,
  splitY: number,
  isPlain?: PlainWallTest,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const geo = new THREE.BufferGeometry();

  // 上の蓋
  const contour = outer.map(([x, z]) => new THREE.Vector2(x, z));
  const holeVecs = holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
  const all: P2[] = [...outer, ...holes.flat()];
  const tris = THREE.ShapeUtils.triangulateShape(contour, holeVecs);
  for (const tri of tris) {
    const pa = all[tri[0] ?? -1];
    const pb = all[tri[1] ?? -1];
    const pc = all[tri[2] ?? -1];
    if (!pa || !pb || !pc) continue;
    const cross = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
    const order = cross < 0 ? [pa, pb, pc] : [pa, pc, pb];
    for (const p of order) {
      pos.push(p[0], topY, p[1]);
      nor.push(0, 1, 0);
      uv.push(p[0], p[1]);
    }
  }
  const lidCount = pos.length / 3;

  const inSolid = (x: number, z: number): boolean =>
    pointInRing(x, z, outer) && !holes.some((h) => pointInRing(x, z, h));

  const upper = { pos: [] as number[], nor: [] as number[], uv: [] as number[] };
  const lower = { pos: [] as number[], nor: [] as number[], uv: [] as number[] };
  const plain = { pos: [] as number[], nor: [] as number[], uv: [] as number[] };
  const pushQuad = (
    target: typeof upper,
    a: P2,
    b: P2,
    y0: number,
    y1: number,
    ua: number,
    ub: number,
    n: P2,
  ): void => {
    if (y1 - y0 < 1e-4) return;
    const quad: [P2, number, number][] = [
      [a, y0, ua],
      [b, y0, ub],
      [b, y1, ub],
      [a, y0, ua],
      [b, y1, ub],
      [a, y1, ua],
    ];
    for (const [p, y, u] of quad) {
      target.pos.push(p[0], y, p[1]);
      target.nor.push(n[0], 0, n[1]);
      target.uv.push(u, y - splitY);
    }
  };

  for (const ring of [outer, ...holes]) {
    let acc = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      if (!p || !q) continue;
      const dx = q[0] - p[0];
      const dz = q[1] - p[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      let n: P2 = [dz / len, -dx / len];
      const mx = (p[0] + q[0]) / 2;
      const mz = (p[1] + q[1]) / 2;
      if (inSolid(mx + n[0] * 0.02, mz + n[1] * 0.02)) n = [-n[0], -n[1]];
      // 三角形 (a, b, b の上) の法線は (-dz, 0, dx) の向き。外向きと逆なら辺の向きを入れ替える
      const flip = -dz * n[0] + dx * n[1] < 0;
      const a = flip ? q : p;
      const b = flip ? p : q;
      const ua = flip ? acc + len : acc;
      const ub = flip ? acc : acc + len;
      pushQuad(lower, a, b, baseY, Math.min(topY, splitY), ua, ub, n);
      pushQuad(isPlain?.(mx, mz, n) ? plain : upper, a, b, Math.max(baseY, splitY), topY, ua, ub, n);
      acc += len;
    }
  }

  const upperCount = upper.pos.length / 3;
  const lowerCount = lower.pos.length / 3;
  const plainCount = plain.pos.length / 3;
  pos.push(...upper.pos, ...lower.pos, ...plain.pos);
  nor.push(...upper.nor, ...lower.nor, ...plain.nor);
  uv.push(...upper.uv, ...lower.uv, ...plain.uv);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.addGroup(0, lidCount, 0);
  geo.addGroup(lidCount, upperCount, 1);
  geo.addGroup(lidCount + upperCount, lowerCount, 2);
  if (plainCount > 0) geo.addGroup(lidCount + upperCount + lowerCount, plainCount, 3);
  return geo;
}

/**
 * 壁の窓の模様。地はタイルの色、窓は白い枠と明るめのガラス（写真の窓は白い枠で、空を映して明るい）。
 * 色をそのまま描くので、材質の color は白にして使う。Node（document が無い）では null を返し、無地の壁になる
 */
function createWindowTexture(kind: 'punched' | 'band', tileWidthM: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = COLORS.tile;
  g.fillRect(0, 0, size, size);
  // 窓の高さ 1.6m（1 階分の 0.30〜0.72）。canvas の上が v = 1（1 階分の上端）
  const y0 = Math.round(size * (1 - 0.72));
  const h = Math.round(size * 0.42);
  // 塔は四角い窓（幅 1.3m）、低い棟は幅 1.5m の窓が細い柱を挟んで並ぶ帯
  const w = kind === 'punched' ? Math.round(size * 0.5) : Math.round(size * (1.5 / tileWidthM));
  const x0 = Math.round((size - w) / 2);
  const frame = Math.max(2, Math.round((0.09 / tileWidthM) * size));
  g.fillStyle = COLORS.windowFrame;
  g.fillRect(x0, y0, w, h);
  g.fillStyle = COLORS.windowGlass;
  g.fillRect(x0 + frame, y0 + frame, w - frame * 2, h - frame * 2);
  // 縦の方立てと、上寄りの無目（白）
  g.fillStyle = COLORS.windowFrame;
  g.fillRect(Math.round(size / 2 - frame / 2), y0, frame, h);
  g.fillRect(x0, y0 + Math.round(h * 0.3), w, Math.max(1, Math.round(frame * 0.7)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / tileWidthM, 1 / FLOOR_HEIGHT_M);
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------

export const buildArea3: HeroBuilder = (ctx: HeroBuildContext): HeroBuildResult => {
  const group = new THREE.Group();
  group.name = 'area3-hero';
  const frame = new THREE.Group();
  frame.name = 'area3-frame';
  frame.rotation.y = FRAME_ROT_Y;
  group.add(frame);

  const polygon = ctx.building.polygon;
  const bottomY = minGroundUnder(ctx, polygon) - FOOTING_BELOW_LOWEST_GROUND_M;
  const groundAt = (u: number, v: number): number => {
    const [x, z] = toWorld(u, v);
    return ctx.sampleGroundVisualY(x, z);
  };
  /**
   * 1 階の床。塔の入口（アクセス道の到着点）の前の地面に合わせ、雁行する棟も同じ床の高さにする
   * （つながった 1 つの建物として床をそろえる。2012 年の写真でも低い棟の屋上は塔の 5 階の上端とほぼそろう）。
   * 地面の低い東・北の側では、床より下の壁（無地の基礎）が見える
   */
  const floorY = Math.max(groundAt(VESTIBULE.u0 - 1, (VESTIBULE.v0 + VESTIBULE.v1) / 2), bottomY + 1);
  const yAtFloor = (floors: number): number => floorY + floors * FLOOR_HEIGHT_M;

  // --- 材質（窓の模様はタイルの色を地に描くので、模様があるときは color を白にする） ---
  const towerTex = createWindowTexture('punched', TOWER_WINDOW_TILE_M);
  const towerWallHex = towerTex ? '#FFFFFF' : COLORS.tile;
  const towerWallMat = new THREE.MeshStandardMaterial({
    color: towerWallHex,
    map: towerTex,
    roughness: 0.8,
    metalness: 0.03,
  });
  const wingTex = createWindowTexture('band', BAND_WINDOW_TILE_M);
  const wingWallHex = wingTex ? '#FFFFFF' : COLORS.tile;
  const wingWallMat = new THREE.MeshStandardMaterial({
    color: wingWallHex,
    map: wingTex,
    roughness: 0.8,
    metalness: 0.03,
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.86, metalness: 0.02 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: COLORS.plinth, roughness: 0.85, metalness: 0.02 });
  const finGlassMat = new THREE.MeshStandardMaterial({ color: COLORS.finGlass, roughness: 0.3, metalness: 0.1 });
  const plainTileMat = new THREE.MeshStandardMaterial({ color: COLORS.tile, roughness: 0.8, metalness: 0.03 });
  const blueMat = new THREE.MeshStandardMaterial({ color: COLORS.blue, roughness: 0.45, metalness: 0.08 });
  const emblemMat = new THREE.MeshStandardMaterial({ color: COLORS.emblem, roughness: 0.75, metalness: 0.03 });
  const penthouseMat = new THREE.MeshStandardMaterial({ color: COLORS.penthouse, roughness: 0.8, metalness: 0.05 });
  const vestibuleMat = new THREE.MeshStandardMaterial({
    color: COLORS.vestibuleGlass,
    roughness: 0.25,
    metalness: 0.1,
  });
  const canopyMat = new THREE.MeshStandardMaterial({ color: COLORS.canopy, roughness: 0.5, metalness: 0.3 });
  const antennaMat = new THREE.MeshStandardMaterial({ color: COLORS.antenna, roughness: 0.5, metalness: 0.3 });

  /**
   * 窓の無い無地の面: 塔の南西の隅。2012 年の写真で、塔の南面のうち細い塔より西の部分は地面から上まで窓が無く、
   * 2022 年の写真でも、フィンの面の右（南）の隅の面は無地
   */
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.05;
  const isPlainWall: PlainWallTest = (mu, mv, n) => {
    const facesSouth = n[1] > 0.9;
    const facesWest = n[0] < -0.9;
    if (facesSouth && near(mv, TOWER_SOUTH_V) && mu < SLENDER.u0) return true;
    if (facesWest && near(mu, CHAMFER_U) && mv > CHAMFER_V) return true;
    if (facesSouth && near(mv, CHAMFER_V) && mu < CHAMFER_U) return true;
    return false;
  };

  const addPrism = (
    name: string,
    outer: readonly P2[],
    holes: readonly (readonly P2[])[],
    topY: number,
    wallMat: THREE.MeshStandardMaterial,
    baseY = bottomY,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(buildPrism(outer, holes, baseY, topY, floorY, isPlainWall), [
      roofMat,
      wallMat,
      plinthMat,
      plainTileMat,
    ]);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    frame.add(mesh);
    return mesh;
  };

  // --- 1. 西の塊の土台（7 階。北の端だけ屋上が見え、左肩の 2 段目になる。南西の隅は輪郭どおり欠く） ---
  const towerBaseRing: P2[] = [
    [WEST_FACE_U, TOWER_NORTH_V],
    [TOWER_EAST_U, TOWER_NORTH_V],
    [TOWER_EAST_U, TOWER_SOUTH_V],
    [SLENDER.u0, TOWER_SOUTH_V], // 南面の窓のある東の区画と、無地の西の区画の境目
    [CHAMFER_U, TOWER_SOUTH_V],
    [CHAMFER_U, CHAMFER_V],
    [WEST_FACE_U, CHAMFER_V],
  ];
  const lowTopY = yAtFloor(LOW_FLOORS) + PARAPET_M;
  const baseTopY = yAtFloor(BASE_FLOORS) + BASE_PARAPET_M;
  addPrism('area3-tower-base', towerBaseRing, [], baseTopY, towerWallMat);

  // 上に載る段は、下の段の屋上から立ち上げる（同じ面の壁が重なって模様がちらつかないように）
  // --- 2. 左肩の 1 段目（8 階。フィンの部分の北隣） ---
  addPrism(
    'area3-tower-step',
    rect(WEST_FACE_U, TOWER_EAST_U, STEP_NORTH_V, MAIN_TOWER_NORTH_V),
    [],
    yAtFloor(STEP_FLOORS) + PARAPET_M,
    towerWallMat,
    baseTopY,
  );

  // --- 3. 塔の本体（10 階＋笠木） ---
  const towerTopY = yAtFloor(TOWER_FLOORS) + TOWER_CROWN_M;
  const mainRing: P2[] = [
    [WEST_FACE_U, MAIN_TOWER_NORTH_V],
    [TOWER_EAST_U, MAIN_TOWER_NORTH_V],
    [TOWER_EAST_U, TOWER_SOUTH_V],
    [SLENDER.u0, TOWER_SOUTH_V], // 南面の窓のある東の区画と、無地の西の区画の境目
    [CHAMFER_U, TOWER_SOUTH_V],
    [CHAMFER_U, CHAMFER_V],
    [WEST_FACE_U, CHAMFER_V],
  ];
  addPrism('area3-tower-main', mainRing, [], towerTopY, towerWallMat, baseTopY);

  // --- 4. 一段高い細い塔（階段室か機械室。上部に校章〈無地の円〉とアンテナ）。屋上より上は窓の無い無地（2012 年の写真） ---
  const slenderTopY = towerTopY + SLENDER_EXTRA_M;
  addPrism(
    'area3-tower-slender',
    rect(SLENDER.u0, SLENDER.u1, SLENDER.v0, SLENDER.v1),
    [],
    slenderTopY,
    plainTileMat,
    towerTopY,
  );
  // 校章: 細い塔の南面の中央、塔の屋上より上の面の中に収まる小さな無地の浮き彫り
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(EMBLEM_RADIUS_M, EMBLEM_RADIUS_M, 0.16, 24), emblemMat);
  disc.name = 'area3-emblem-disc';
  disc.rotation.x = Math.PI / 2;
  disc.position.set((SLENDER.u0 + SLENDER.u1) / 2, slenderTopY - EMBLEM_BELOW_TOP_M, SLENDER.v1 + 0.08);
  frame.add(disc);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 6), antennaMat);
  antenna.name = 'area3-antenna';
  antenna.position.set(SLENDER.u0 + 2.2, slenderTopY + 2.5, SLENDER.v0 + 3.0);
  frame.add(antenna);

  // --- 5. フィンの面（西の面の 8〜10 階）: 窓の縦の帯 6 本・深いフィン・上の笠木と文字の代わりの青い線 ---
  const finV0 = MAIN_TOWER_NORTH_V;
  const finV1 = CHAMFER_V;
  const bay = (finV1 - finV0) / FIN_BAYS;
  const finY0 = yAtFloor(FIN_FROM_FLOOR);
  const finY1 = yAtFloor(TOWER_FLOORS);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();

  const fins = new THREE.InstancedMesh(unitBox, plainTileMat, FIN_BAYS + 1);
  fins.name = 'area3-fins';
  for (let k = 0; k <= FIN_BAYS; k++) {
    const isFrame = k === 0 || k === FIN_BAYS;
    const w = isFrame ? FRAME_WIDTH_M : FIN_WIDTH_M;
    const vc = k === 0 ? finV0 + w / 2 : k === FIN_BAYS ? finV1 - w / 2 : finV0 + k * bay;
    dummy.position.set(WEST_FACE_U - FIN_DEPTH_M / 2, (finY0 + finY1) / 2, vc);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(FIN_DEPTH_M, finY1 - finY0, w);
    dummy.updateMatrix();
    fins.setMatrixAt(k, dummy.matrix);
  }
  fins.instanceMatrix.needsUpdate = true;
  fins.castShadow = true;
  frame.add(fins);

  const strips = new THREE.InstancedMesh(unitBox, finGlassMat, FIN_BAYS);
  strips.name = 'area3-fin-glass';
  for (let k = 0; k < FIN_BAYS; k++) {
    const v0 = finV0 + k * bay + (k === 0 ? FRAME_WIDTH_M : FIN_WIDTH_M / 2);
    const v1 = finV0 + (k + 1) * bay - (k === FIN_BAYS - 1 ? FRAME_WIDTH_M : FIN_WIDTH_M / 2);
    dummy.position.set(WEST_FACE_U - 0.06, (finY0 + finY1) / 2, (v0 + v1) / 2);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.1, finY1 - finY0 - 0.4, v1 - v0);
    dummy.updateMatrix();
    strips.setMatrixAt(k, dummy.matrix);
  }
  strips.instanceMatrix.needsUpdate = true;
  frame.add(strips);

  const lintel = new THREE.Mesh(unitBox, plainTileMat);
  lintel.name = 'area3-fin-lintel';
  lintel.position.set(WEST_FACE_U - FIN_DEPTH_M / 2, (finY1 + towerTopY) / 2, (finV0 + finV1) / 2);
  lintel.scale.set(FIN_DEPTH_M, towerTopY - finY1, finV1 - finV0);
  lintel.castShadow = true;
  frame.add(lintel);

  // 「関西大学」の青い立体文字の代わり: 壁と同じ色の笠木の面に、文字 1 つにつき 1 本の細い青い線（控えめに）
  const letters = new THREE.InstancedMesh(unitBox, blueMat, LETTER_BAYS.length);
  letters.name = 'area3-letter-lines';
  LETTER_BAYS.forEach((k, i) => {
    dummy.position.set(WEST_FACE_U - FIN_DEPTH_M - 0.04, (finY1 + towerTopY) / 2, finV0 + (k + 0.5) * bay);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.08, LETTER_LINE_M, bay * LETTER_WIDTH_OF_BAY);
    dummy.updateMatrix();
    letters.setMatrixAt(i, dummy.matrix);
  });
  letters.instanceMatrix.needsUpdate = true;
  frame.add(letters);

  // --- 6. 入口の風除室（輪郭の西の張り出し）と、アクセス道の屋根の終点までの庇（2022 年の写真の金属の庇） ---
  const vestibuleTopY = floorY + 3.6;
  const vestibule = new THREE.Mesh(unitBox, vestibuleMat);
  vestibule.name = 'area3-vestibule';
  vestibule.position.set(
    (VESTIBULE.u0 + VESTIBULE.u1) / 2,
    (bottomY + vestibuleTopY) / 2,
    (VESTIBULE.v0 + VESTIBULE.v1) / 2,
  );
  vestibule.scale.set(VESTIBULE.u1 - VESTIBULE.u0, vestibuleTopY - bottomY, VESTIBULE.v1 - VESTIBULE.v0);
  frame.add(vestibule);
  const canopy = new THREE.Mesh(unitBox, canopyMat);
  canopy.name = 'area3-entrance-canopy';
  const canopyV0 = VESTIBULE.v0 - 3.0;
  const canopyV1 = VESTIBULE.v1 + 2.7;
  canopy.position.set((ACCESS_CANOPY_END_U + WEST_FACE_U) / 2, floorY + 3.9, (canopyV0 + canopyV1) / 2);
  canopy.scale.set(WEST_FACE_U - ACCESS_CANOPY_END_U, 0.25, canopyV1 - canopyV0);
  canopy.castShadow = true;
  frame.add(canopy);

  // --- 7. 雁行する棟（5 階。輪郭のうち塔の東。中庭の穴は輪郭どおり） ---
  const outerFrame = polygon.map(([x, z]) => toFrame(x, z));
  const wingRing = clipRingByU(outerFrame, TOWER_EAST_U, true);
  const holesFrame = (ctx.building.holes ?? [])
    .map((h) => h.map(([x, z]) => toFrame(x, z)))
    .filter((h) => h.length >= 3 && h.every(([u]) => u > TOWER_EAST_U));
  const wingTopY = lowTopY;
  if (wingRing.length >= 3) {
    addPrism('area3-wing', wingRing, holesFrame, wingTopY, wingWallMat);
  }

  // 屋上の機械室（2012 年の写真で、雁行の区画の継ぎ目あたりに灰色の箱が 2〜3 個）
  const penthouses: [number, number, number, number][] = [
    [-279, -271, 166.5, 172.5],
    [-259, -249, 168.0, 175.0],
    [-233, -225, 166.5, 172.5],
  ];
  const ph = new THREE.InstancedMesh(unitBox, penthouseMat, penthouses.length);
  ph.name = 'area3-penthouses';
  penthouses.forEach(([u0, u1, v0, v1], i) => {
    dummy.position.set((u0 + u1) / 2, wingTopY + 1.4, (v0 + v1) / 2);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(u1 - u0, 3.2, v1 - v0);
    dummy.updateMatrix();
    ph.setMatrixAt(i, dummy.matrix);
  });
  ph.instanceMatrix.needsUpdate = true;
  ph.castShadow = true;
  frame.add(ph);

  for (const child of frame.children) {
    if (child instanceof THREE.InstancedMesh) {
      child.computeBoundingBox();
      child.computeBoundingSphere();
    }
  }

  return {
    group,
    primaryMaterials: [
      { mat: towerWallMat, baseHex: towerWallHex },
      { mat: wingWallMat, baseHex: wingWallHex },
      { mat: roofMat, baseHex: COLORS.roof },
    ],
    animated: [],
  };
};
