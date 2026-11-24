import * as THREE from 'three';
import {
  TriBucket,
  addBucketMesh,
  createLocalGroup,
  frameToWorld,
  makeFrame,
  pushBox,
} from './localFrame';
import { minGroundUnder } from './shared';
import type { HeroBuilder } from './types';

/**
 * 高松塚古墳壁画再現展示室（公式の地図の 34）の専用モデル。調べた事と出典は docs/visual-research/takamatsuzuka.md。
 *
 * 根拠にしたもの（持ち主の写真 2026-11-24。写真はリポジトリに入れない）:
 * - IMG_3386（西の面の正面、約 6m）: 白い鉄骨の枠にガラスを張った平屋の箱。西の面の上に白い管のアーチ、その上に
 *   ガラスの屋根（三角に組んだ骨組み）。西の面は 5 つに割れ、南から 2 つめと 3 つめの間が両開きのガラスの扉。
 *   扉の南（右）の手前に、名前を彫った灰色の石の台座（黒い銘板）。中に薄いベージュの大きな板（壁画の再現）と灰色の奥の壁
 * - IMG_3385（あすかの庭から南南東）: 北の面（長い横の枠、上にガラスの屋根のふくらみ）と西の面（アーチ）。
 *   すぐ奥に簡文館の北の翼のレンガの壁、右奥に簡文館の円形部分
 * - IMG_3388（道の角から東、約 50m）: 庭の向こうに西の面のアーチ
 * - 国土地理院の空中写真（2017 年 4 月）: OSM の輪郭（約 7×8m）の中に、東西 約 4.7m・南北 約 6.5m の小屋の影
 *
 * 寸法: 扉の取っ手（床から約 1.05m とみた）と地面の写り方から、西の面までの距離 約 5.7m・目の高さ 約 1.6m と割り出し、
 * 西の面の幅 約 5.0m、扉の上端 2.3m、枠の上端 2.55m、アーチの頂 3.35m。空中写真の小屋の大きさと合わせて、
 * 西の面（南北）5.4m・奥行き（東西）4.8m とした（どれも推定）
 *
 * 座標: 箱の南西の角を原点に、西の面に沿って北へ u（OSM の輪郭の西の辺の向き）、東へ v。高さは箱の中心の地面からの m
 */

const ORIGIN_X = 2.85;
const ORIGIN_Z = -114.0;
/** OSM の輪郭（way 819790896）の西の辺 (1.55, −112.8) → (2.01, −121.01) の向き */
const AXIS_DX = 2.01 - 1.55;
const AXIS_DZ = -121.01 - -112.8;

/** 西の面（南北）の幅と、奥行き（東西） */
export const TAKAMATSUZUKA_WIDTH_M = 5.4;
export const TAKAMATSUZUKA_DEPTH_M = 4.8;
/** 枠の上端・扉の上端・アーチの頂（地面から） */
export const TAKAMATSUZUKA_FRAME_TOP_M = 2.55;
export const TAKAMATSUZUKA_ARCH_TOP_M = 3.35;
const FLOOR_M = 0.05;

/** 枠の部材の太さ（隅の柱・上の梁・下の框・方立て・アーチの管） */
const POST_M = 0.14;
const BEAM_DEPTH_M = 0.2;
const SILL_M = 0.1;
const MULLION_M = 0.06;
const RIB_M = 0.12;
/**
 * 西の面の方立ての位置（南の端から, m）。写真の割り付け（幅に対して 0.152・0.293・0.445・0.601・0.781）から。
 * 0.445 は両開きの扉の召し合わせなので、方立てではなく扉の部材として別に描く
 */
const WEST_MULLIONS_U = [0.82, 1.58, 3.25, 4.22] as const;
/** 両開きの扉（方立て 1.58〜3.25 の間。召し合わせはその中ほど） */
export const TAKAMATSUZUKA_DOOR_U: readonly [number, number] = [1.58, 3.25];
export const TAKAMATSUZUKA_DOOR_TOP_M = 2.3;
/** アーチの管を置く v（西の面・中ほど 2 本・東の面） */
const RIB_VS = [0, 1.6, 3.2, TAKAMATSUZUKA_DEPTH_M] as const;
/** ガラスの屋根の出（妻の側・長い側） */
const GLASS_END_OVERHANG_M = 0.3;
const GLASS_SIDE_OVERHANG_M = 0.12;

/**
 * 石の台座（西の面の南の端寄りの前）と銘板。写真で台座の南の端は面の南の端から約 0.45m 内、幅 約 0.95m、
 * 面から 0.45〜0.85m 前、高さ 約 0.6m
 */
export const TAKAMATSUZUKA_PLAQUE = { u0: 0.45, u1: 1.4, v0: -0.85, v1: -0.45, top: 0.62, baseH: 0.08 } as const;
const PLAQUE = TAKAMATSUZUKA_PLAQUE;

const COLORS = {
  frame: '#ECEDEA',
  glass: '#D3E4E8',
  floor: '#D9D7D1',
  partition: '#A9ABAD',
  mural: '#E4D9BE',
  granite: '#BDBDB8',
  plate: '#2B2D2F',
} as const;

/** アーチ（円弧）: 中心の高さ yc・半径 r・半幅 half。u の中心は WIDTH/2 */
interface Arch {
  yc: number;
  r: number;
  half: number;
}

function archFor(springY: number, crownY: number, half: number): Arch {
  const rise = crownY - springY;
  const r = (half * half + rise * rise) / (2 * rise);
  return { yc: crownY - r, r, half };
}

/** 円弧の上の点（角度 th は頂から測る。u と高さ） */
function archPoint(a: Arch, radius: number, th: number): [number, number] {
  return [TAKAMATSUZUKA_WIDTH_M / 2 + radius * Math.sin(th), a.yc + radius * Math.cos(th)];
}

/** アーチの管（角材を円弧に沿って折ったもの）を v0〜v1 の厚さで積む */
function pushArchRib(bucket: TriBucket, a: Arch, v0: number, v1: number, segments: number): void {
  const thMax = Math.asin(Math.min(0.999, a.half / a.r));
  const rIn = a.r - RIB_M / 2;
  const rOut = a.r + RIB_M / 2;
  for (let i = 0; i < segments; i++) {
    const t0 = -thMax + (2 * thMax * i) / segments;
    const t1 = -thMax + (2 * thMax * (i + 1)) / segments;
    const mid = (t0 + t1) / 2;
    const [ou0, oy0] = archPoint(a, rOut, t0);
    const [ou1, oy1] = archPoint(a, rOut, t1);
    const [iu0, iy0] = archPoint(a, rIn, t0);
    const [iu1, iy1] = archPoint(a, rIn, t1);
    const out: [number, number, number] = [Math.sin(mid), Math.cos(mid), 0];
    bucket.quad([ou0, oy0, v0], [ou1, oy1, v0], [ou1, oy1, v1], [ou0, oy0, v1], out);
    bucket.quad([iu0, iy0, v0], [iu1, iy1, v0], [iu1, iy1, v1], [iu0, iy0, v1], [-out[0], -out[1], 0]);
    bucket.quad([ou0, oy0, v0], [ou1, oy1, v0], [iu1, iy1, v0], [iu0, iy0, v0], [0, 0, -1]);
    bucket.quad([ou0, oy0, v1], [ou1, oy1, v1], [iu1, iy1, v1], [iu0, iy0, v1], [0, 0, 1]);
  }
}

/** ガラスの屋根（円筒の面。妻と長い側に少し出す） */
function pushGlassVault(bucket: TriBucket, a: Arch, segments: number): void {
  const radius = a.r + RIB_M / 2 + 0.01;
  const thMax = Math.asin(Math.min(0.999, (a.half + GLASS_SIDE_OVERHANG_M) / radius));
  const v0 = -GLASS_END_OVERHANG_M;
  const v1 = TAKAMATSUZUKA_DEPTH_M + GLASS_END_OVERHANG_M;
  for (let i = 0; i < segments; i++) {
    const t0 = -thMax + (2 * thMax * i) / segments;
    const t1 = -thMax + (2 * thMax * (i + 1)) / segments;
    const mid = (t0 + t1) / 2;
    const [u0, y0] = archPoint(a, radius, t0);
    const [u1, y1] = archPoint(a, radius, t1);
    bucket.quad([u0, y0, v0], [u1, y1, v0], [u1, y1, v1], [u0, y0, v1], [Math.sin(mid), Math.cos(mid), 0]);
  }
}

/** 妻（枠の上端とアーチの間の弓形）のガラス。v の位置に張る */
function pushGableGlass(bucket: TriBucket, a: Arch, baseY: number, v: number, facing: 1 | -1, segments: number): void {
  const thMax = Math.asin(Math.min(0.999, a.half / a.r));
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const th = -thMax + (2 * thMax * i) / segments;
    const [u, y] = archPoint(a, a.r - RIB_M / 2, th);
    pts.push([u, Math.max(baseY, y)]);
  }
  const first = pts[0];
  if (!first) return;
  for (let i = 1; i + 1 < pts.length; i++) {
    const b = pts[i];
    const c = pts[i + 1];
    if (!b || !c) continue;
    bucket.tri([first[0], baseY, v], [b[0], b[1], v], [c[0], c[1], v], [0, 0, facing]);
  }
}

export const buildTakamatsuzuka: HeroBuilder = (ctx) => {
  const frame = makeFrame(ORIGIN_X, ORIGIN_Z, AXIS_DX, AXIS_DZ);
  const W = TAKAMATSUZUKA_WIDTH_M;
  const D = TAKAMATSUZUKA_DEPTH_M;
  const corners: [number, number][] = [
    frameToWorld(frame, -0.05, PLAQUE.v0),
    frameToWorld(frame, W + 0.05, PLAQUE.v0),
    frameToWorld(frame, W + 0.05, D + 0.05),
    frameToWorld(frame, -0.05, D + 0.05),
  ];
  const [cx, cz] = frameToWorld(frame, W / 2, D / 2);
  /** 箱の中心の地面（高さの基準）と、足元の最も低い地面 */
  const ref = ctx.sampleGroundVisualY(cx, cz);
  const bottom = Math.min(ref, minGroundUnder(ctx, corners, 1)) - 0.3;

  const group = new THREE.Group();
  group.name = 'takamatsuzuka';
  const local = createLocalGroup(frame);
  group.add(local);

  const frameMat = new THREE.MeshStandardMaterial({ color: COLORS.frame, roughness: 0.45, metalness: 0.25 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: COLORS.glass,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
    // 透明の両面を 1 回で描く（three は透明の両面を既定で 2 回に分けて描く）
    forceSinglePass: true,
  });
  const floorMat = new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.85, metalness: 0.0 });
  const partitionMat = new THREE.MeshStandardMaterial({ color: COLORS.partition, roughness: 0.8, metalness: 0.02 });
  const muralMat = new THREE.MeshStandardMaterial({ color: COLORS.mural, roughness: 0.9, metalness: 0.0 });
  const graniteMat = new THREE.MeshStandardMaterial({ color: COLORS.granite, roughness: 0.7, metalness: 0.02 });
  const plateMat = new THREE.MeshStandardMaterial({ color: COLORS.plate, roughness: 0.4, metalness: 0.2 });

  const frameB = new TriBucket();
  const glass = new TriBucket();
  const floor = new TriBucket();
  const partition = new TriBucket();
  const mural = new TriBucket();
  const granite = new TriBucket();
  const plate = new TriBucket();

  const floorY = ref + FLOOR_M;
  const sillTop = floorY + SILL_M;
  const frameTop = ref + TAKAMATSUZUKA_FRAME_TOP_M;
  const beamBottom = frameTop - BEAM_DEPTH_M;
  const h = POST_M / 2;

  // ── 足元の台（地面から床まで）と床 ──
  pushBox({ sides: floor, top: floor }, -0.05, W + 0.05, bottom, floorY, -0.05, D + 0.05);

  // ── 白い枠: 隅の柱・上の梁・下の框 ──
  for (const [u, v] of [
    [0, 0],
    [W, 0],
    [0, D],
    [W, D],
  ] as const) {
    pushBox({ sides: frameB, top: frameB }, u - h, u + h, floorY, frameTop, v - h, v + h);
  }
  for (const v of [0, D]) {
    pushBox({ sides: frameB, top: frameB, bottom: frameB }, h, W - h, beamBottom, frameTop, v - h, v + h);
    pushBox({ sides: frameB, top: frameB }, h, W - h, floorY, sillTop, v - h, v + h);
  }
  for (const u of [0, W]) {
    pushBox({ sides: frameB, top: frameB, bottom: frameB }, u - h, u + h, beamBottom, frameTop, h, D - h);
    pushBox({ sides: frameB, top: frameB }, u - h, u + h, floorY, sillTop, h, D - h);
  }

  // ── 方立て: 西の面は写真の割り付け（扉の両脇は少し太く）、ほかの面は約 0.9m おき ──
  const m = MULLION_M / 2;
  for (const u of WEST_MULLIONS_U) {
    const w = u === TAKAMATSUZUKA_DOOR_U[0] || u === TAKAMATSUZUKA_DOOR_U[1] ? m * 1.5 : m;
    pushBox({ sides: frameB, top: null }, u - w, u + w, sillTop, beamBottom, -0.04, 0.04);
  }
  // 扉の召し合わせと、扉の上の横の桟
  const doorMid = (TAKAMATSUZUKA_DOOR_U[0] + TAKAMATSUZUKA_DOOR_U[1]) / 2;
  pushBox({ sides: frameB, top: null }, doorMid - m, doorMid + m, floorY, ref + TAKAMATSUZUKA_DOOR_TOP_M, -0.04, 0.04);
  pushBox(
    { sides: frameB, top: frameB, bottom: frameB },
    TAKAMATSUZUKA_DOOR_U[0],
    TAKAMATSUZUKA_DOOR_U[1],
    ref + TAKAMATSUZUKA_DOOR_TOP_M,
    ref + TAKAMATSUZUKA_DOOR_TOP_M + 0.08,
    -0.04,
    0.04,
  );
  const eastCount = 6;
  for (let i = 1; i < eastCount; i++) {
    const u = (W * i) / eastCount;
    pushBox({ sides: frameB, top: null }, u - m, u + m, sillTop, beamBottom, D - 0.04, D + 0.04);
  }
  const sideCount = 5;
  for (let i = 1; i < sideCount; i++) {
    const v = (D * i) / sideCount;
    for (const u of [0, W]) {
      pushBox({ sides: frameB, top: null }, u - 0.04, u + 0.04, sillTop, beamBottom, v - m, v + m);
    }
  }

  // ── アーチの管（西・中ほど 2 本・東）とガラスの屋根・妻のガラス ──
  const arch = archFor(frameTop, ref + TAKAMATSUZUKA_ARCH_TOP_M - RIB_M / 2, W / 2);
  for (const v of RIB_VS) {
    pushArchRib(frameB, arch, v - RIB_M / 2, v + RIB_M / 2, 16);
  }
  pushGlassVault(glass, arch, 16);
  pushGableGlass(glass, arch, frameTop, 0, -1, 16);
  pushGableGlass(glass, arch, frameTop, D, 1, 16);

  // ── 壁のガラス（4 面。框の上から梁の下まで） ──
  glass.quad([0, sillTop, 0], [W, sillTop, 0], [W, beamBottom, 0], [0, beamBottom, 0], [0, 0, -1]);
  glass.quad([0, sillTop, D], [W, sillTop, D], [W, beamBottom, D], [0, beamBottom, D], [0, 0, 1]);
  glass.quad([0, sillTop, 0], [0, sillTop, D], [0, beamBottom, D], [0, beamBottom, 0], [-1, 0, 0]);
  glass.quad([W, sillTop, 0], [W, sillTop, D], [W, beamBottom, D], [W, beamBottom, 0], [1, 0, 0]);

  // ── 中: 奥（東）の灰色の壁と、壁画の再現の板（西の面に平行な大きな板と、北の面に沿う板） ──
  pushBox({ sides: partition, top: partition }, 0.5, W - 0.5, floorY, floorY + 2.4, D - 0.5, D - 0.35);
  pushBox({ sides: mural, top: mural, bottom: mural }, 2.3, 4.6, floorY + 0.75, floorY + 2.25, 1.8, 1.86);
  pushBox({ sides: mural, top: mural, bottom: mural }, W - 0.86, W - 0.8, floorY + 0.75, floorY + 2.25, 1.0, 3.4);

  // ── 石の台座（西の面の南の端の前）と銘板 ──
  pushBox(
    { sides: plate, top: plate },
    PLAQUE.u0 - 0.04,
    PLAQUE.u1 + 0.04,
    bottom,
    ref + PLAQUE.baseH,
    PLAQUE.v0 - 0.04,
    PLAQUE.v1 + 0.04,
  );
  pushBox({ sides: granite, top: granite }, PLAQUE.u0, PLAQUE.u1, ref + PLAQUE.baseH, ref + PLAQUE.top, PLAQUE.v0, PLAQUE.v1);
  pushBox(
    { sides: plate, top: plate, skip: ['+v'] },
    PLAQUE.u0 + 0.15,
    PLAQUE.u1 - 0.15,
    ref + 0.3,
    ref + 0.48,
    PLAQUE.v0 - 0.02,
    PLAQUE.v0,
  );

  addBucketMesh(local, floor, floorMat, 'takamatsuzuka-floor', false);
  addBucketMesh(local, frameB, frameMat, 'takamatsuzuka-frame', true);
  addBucketMesh(local, partition, partitionMat, 'takamatsuzuka-partition', false);
  addBucketMesh(local, mural, muralMat, 'takamatsuzuka-mural', false);
  addBucketMesh(local, granite, graniteMat, 'takamatsuzuka-plaque', true);
  addBucketMesh(local, plate, plateMat, 'takamatsuzuka-plate', false);
  addBucketMesh(local, glass, glassMat, 'takamatsuzuka-glass', false);

  return {
    group,
    primaryMaterials: [
      { mat: frameMat, baseHex: COLORS.frame },
      { mat: muralMat, baseHex: COLORS.mural },
    ],
    animated: [],
  };
};
