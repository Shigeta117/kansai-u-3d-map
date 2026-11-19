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
 * 西の面の北寄りは低い。2012 年・2022 年の写真で、フィンの部分は面の幅の約 6 割で南寄り、
 * その北（写真の左）に 7 階の段、さらに北は低層部（5 階）
 */
const STEP7_NORTH_V = 150.5;
const MAIN_TOWER_NORTH_V = 157.4;
/** 一段高い細い塔（南面の東寄りの、窓が 2 つずつ並ぶ区画）。奥行きは写真に写らないので 8.9m とした */
const SLENDER = { u0: -292.3, u1: TOWER_EAST_U, v0: 168.0, v1: TOWER_SOUTH_V } as const;

const FLOOR_HEIGHT_M = 3.9;
const TOWER_FLOORS = 10;
const LOW_FLOORS = 5;
const STEP_FLOORS = 7;
/**
 * フィンは 8〜10 階の 3 層（2022 年の写真で、フィンの下に窓の列が 6 段＋入口の階。2012 年の写真でも
 * 窓が 2 つずつの面の 3 段分）。下端は北隣の 7 階の段の屋上とそろう。その上に文字の帯（模型では青い帯）を載せる笠木
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
  blue: '#2F56B0', // 「関西大学」の青い立体文字と校章（模型では無地の帯と円）
  penthouse: '#8C9093',
  vestibuleGlass: '#5F7A88',
  canopy: '#C9CCCE',
  antenna: '#B0B4B8',
} as const;

/** 窓の模様の 1 枚の横幅（m）。塔は四角い窓、低い棟は横長の窓の帯 */
const TOWER_WINDOW_TILE_M = 2.6;
const BAND_WINDOW_TILE_M = 1.8;

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

/**
 * 輪郭（穴つき）を baseY から topY まで押し出す。座標は枠の (u, v) を (x, z) として使う。
 * - 材質の番号: 0 = 屋根（上の蓋）、1 = 壁（splitY より上。窓の模様）、2 = 壁（splitY より下。無地の基礎）
 * - 壁の UV は m 単位（u = 輪郭に沿った長さ、v = y − splitY）。模様は texture.repeat で 1 枚の寸法に合わせる
 * - 底の蓋は作らない（いつも地面の下）
 */
function buildPrism(
  outer: readonly P2[],
  holes: readonly (readonly P2[])[],
  baseY: number,
  topY: number,
  splitY: number,
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
      pushQuad(upper, a, b, Math.max(baseY, splitY), topY, ua, ub, n);
      acc += len;
    }
  }

  const upperCount = upper.pos.length / 3;
  const lowerCount = lower.pos.length / 3;
  pos.push(...upper.pos, ...lower.pos);
  nor.push(...upper.nor, ...lower.nor);
  uv.push(...upper.uv, ...lower.uv);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.addGroup(0, lidCount, 0);
  geo.addGroup(lidCount, upperCount, 1);
  geo.addGroup(lidCount + upperCount, lowerCount, 2);
  return geo;
}

/** 壁の窓の模様（掛け算の白地に窓の色）。Node（document が無い）では null を返し、無地の壁になる */
function createWindowTexture(kind: 'punched' | 'band', tileWidthM: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, size, size);
  // 窓の色（タイルの色との掛け算で青灰色の窓になる）
  g.fillStyle = '#6A7A8C';
  if (kind === 'punched') {
    // 四角い窓（幅 1.3m・高さ 1.6m）。canvas の上が v = 1（1 階分の上端）
    g.fillRect(size * 0.25, size * (1 - 0.72), size * 0.5, size * 0.42);
  } else {
    // 横長の窓の帯（高さ 1.6m）と細い方立て
    g.fillRect(0, size * (1 - 0.72), size, size * 0.42);
    g.fillStyle = '#E6E6E6';
    g.fillRect(0, size * (1 - 0.72), 3, size * 0.42);
  }
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

  // --- 材質 ---
  const towerWallMat = new THREE.MeshStandardMaterial({
    color: COLORS.tile,
    map: createWindowTexture('punched', TOWER_WINDOW_TILE_M),
    roughness: 0.8,
    metalness: 0.03,
  });
  const wingWallMat = new THREE.MeshStandardMaterial({
    color: COLORS.tile,
    map: createWindowTexture('band', BAND_WINDOW_TILE_M),
    roughness: 0.8,
    metalness: 0.03,
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.86, metalness: 0.02 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: COLORS.plinth, roughness: 0.85, metalness: 0.02 });
  const finGlassMat = new THREE.MeshStandardMaterial({ color: COLORS.finGlass, roughness: 0.3, metalness: 0.1 });
  const plainTileMat = new THREE.MeshStandardMaterial({ color: COLORS.tile, roughness: 0.8, metalness: 0.03 });
  const blueMat = new THREE.MeshStandardMaterial({ color: COLORS.blue, roughness: 0.45, metalness: 0.08 });
  const penthouseMat = new THREE.MeshStandardMaterial({ color: COLORS.penthouse, roughness: 0.8, metalness: 0.05 });
  const vestibuleMat = new THREE.MeshStandardMaterial({
    color: COLORS.vestibuleGlass,
    roughness: 0.25,
    metalness: 0.1,
  });
  const canopyMat = new THREE.MeshStandardMaterial({ color: COLORS.canopy, roughness: 0.5, metalness: 0.3 });
  const antennaMat = new THREE.MeshStandardMaterial({ color: COLORS.antenna, roughness: 0.5, metalness: 0.3 });

  const addPrism = (
    name: string,
    outer: readonly P2[],
    holes: readonly (readonly P2[])[],
    topY: number,
    wallMat: THREE.MeshStandardMaterial,
    baseY = bottomY,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(buildPrism(outer, holes, baseY, topY, floorY), [roofMat, wallMat, plinthMat]);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    frame.add(mesh);
    return mesh;
  };

  // --- 1. 塔の低層部（5 階。西の塊の全体。南西の隅は輪郭どおり欠く） ---
  const towerBaseRing: P2[] = [
    [WEST_FACE_U, TOWER_NORTH_V],
    [TOWER_EAST_U, TOWER_NORTH_V],
    [TOWER_EAST_U, TOWER_SOUTH_V],
    [CHAMFER_U, TOWER_SOUTH_V],
    [CHAMFER_U, CHAMFER_V],
    [WEST_FACE_U, CHAMFER_V],
  ];
  const lowTopY = yAtFloor(LOW_FLOORS) + PARAPET_M;
  addPrism('area3-tower-base', towerBaseRing, [], lowTopY, towerWallMat);

  // 上に載る段は、下の段の屋上から立ち上げる（同じ面の壁が重なって模様がちらつかないように）
  // --- 2. 7 階の段（フィンの部分の北隣） ---
  addPrism(
    'area3-tower-step7',
    rect(WEST_FACE_U, TOWER_EAST_U, STEP7_NORTH_V, MAIN_TOWER_NORTH_V),
    [],
    yAtFloor(STEP_FLOORS) + PARAPET_M,
    towerWallMat,
    lowTopY,
  );

  // --- 3. 塔の本体（10 階＋笠木） ---
  const towerTopY = yAtFloor(TOWER_FLOORS) + TOWER_CROWN_M;
  const mainRing: P2[] = [
    [WEST_FACE_U, MAIN_TOWER_NORTH_V],
    [TOWER_EAST_U, MAIN_TOWER_NORTH_V],
    [TOWER_EAST_U, TOWER_SOUTH_V],
    [CHAMFER_U, TOWER_SOUTH_V],
    [CHAMFER_U, CHAMFER_V],
    [WEST_FACE_U, CHAMFER_V],
  ];
  addPrism('area3-tower-main', mainRing, [], towerTopY, towerWallMat, lowTopY);

  // --- 4. 一段高い細い塔（階段室か機械室。上部に校章〈無地の円〉とアンテナ） ---
  const slenderTopY = towerTopY + SLENDER_EXTRA_M;
  addPrism(
    'area3-tower-slender',
    rect(SLENDER.u0, SLENDER.u1, SLENDER.v0, SLENDER.v1),
    [],
    slenderTopY,
    towerWallMat,
    towerTopY,
  );
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.25, 24), blueMat);
  disc.name = 'area3-emblem-disc';
  disc.rotation.x = Math.PI / 2;
  disc.position.set((SLENDER.u0 + SLENDER.u1) / 2, slenderTopY - 2.1, SLENDER.v1 + 0.12);
  frame.add(disc);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 6), antennaMat);
  antenna.name = 'area3-antenna';
  antenna.position.set(SLENDER.u0 + 2.2, slenderTopY + 2.5, SLENDER.v0 + 3.0);
  frame.add(antenna);

  // --- 5. フィンの面（西の面の 8〜10 階）: 窓の縦の帯 6 本・深いフィン・上の笠木と青い帯 ---
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

  // 「関西大学」の青い立体文字の代わりの帯（内側の 4 区画の幅）
  const blueBand = new THREE.Mesh(unitBox, blueMat);
  blueBand.name = 'area3-blue-band';
  blueBand.position.set(WEST_FACE_U - FIN_DEPTH_M - 0.08, finY1 + (towerTopY - finY1) * 0.5, (finV0 + finV1) / 2);
  blueBand.scale.set(0.16, (towerTopY - finY1) * 0.62, bay * 4);
  frame.add(blueBand);

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
      { mat: towerWallMat, baseHex: COLORS.tile },
      { mat: wingWallMat, baseHex: COLORS.tile },
      { mat: roofMat, baseHex: COLORS.roof },
    ],
    animated: [],
  };
};
