import * as THREE from 'three';
import { extrudePolygonXZ, minGroundUnder } from './shared';
import type { HeroBuildContext, HeroBuilder, HeroBuildResult } from './types';

/**
 * イノベーション創生センターの専用モデル。
 *
 * 資料: docs/visual-research/innovation.md（持ち主の写真 2 枚の観察）、commons-buildings.md
 * （Commons の 2 枚: Kansai_University_Center_For_Innovation_And_Creativity.jpg と同 (1)、いずれも 2016-09-13）。
 *
 * 部位の置き場所の根拠:
 * - OSM の輪郭（15 点）は北東の長い辺 12→11（39m、東南東向き）に沿った直交の形。北東の面は悠久の庭の芝に向く
 *   正面（写真の手前の芝・赤い低い壁）。南西の面は総合図書館の輪郭と 0.1〜1.1m で接する
 * - Commons の 2 枚は北東から撮っており、左（南東の端）にガラスの箱、その右に金属パネルの面、
 *   右へ長いルーバーの棟が続く。屋根の線の傾きから、金属パネルの面は南東を向いた側面で、ガラスの箱の
 *   北東の面より手前に出る。輪郭でも南東の端の小さな塊（u = 63.6〜69.8、v = 24.4〜32.1）は正面から 6.3m 下がる
 *   → ガラスの箱はこの塊、金属パネルは長い棟の南東の端の面（輪郭の辺 11→10）
 * - 持ち主の写真（第4学舎1号館側＝南東から）でも、ガラスの箱の左奥にレンガの図書館が見える（南西にある）
 * - 外階段: OSM に階段（steps）の道は無い。Commons (1) では、ガラスの箱の北東の面の前（輪郭の凹み）を
 *   南東から北西へ上がり、金属パネルの面の下の 1 階の戸口（南東向き）に着く。写真どおりに置いた
 * - 1 階の床（基壇の上面）は、北西の端で OSM の歩道が建物に入る所（9.61, 31.37）の地面に合わせる。
 *   地面は南東へ下がるので、南東の端では基壇が 1 階分ほど見える（「基壇は斜面に建ち、低い側で高く見える」）
 *
 * 座標は、北東の辺に沿う u（東南東が +）と、それに直交する v（南南西＝図書館の側が +）の枠で組む。
 */

type P2 = [number, number];

/** 北東の長い辺（輪郭の点 12→11）の向き。u 軸（東南東）と v 軸（南南西） */
const AXIS_U: P2 = [0.87742, 0.47977];
const AXIS_V: P2 = [-0.47977, 0.87742];
/** 枠の group の回転。ローカルの +X が AXIS_U、+Z が AXIS_V になる角度 */
const FRAME_ROT_Y = Math.atan2(-AXIS_U[1], AXIS_U[0]);

function toWorld(u: number, v: number): P2 {
  return [u * AXIS_U[0] + v * AXIS_V[0], u * AXIS_U[1] + v * AXIS_V[1]];
}

// --- 輪郭から読んだ寸法（u, v。単位 m） ---
const FRONT_V = 18.1; // 北東の面（辺 12→11）
const BACK_V = 36.4; // 南西の面（辺 2→3、図書館と接する）
const LONG_U0 = 24.3; // 長い棟の北西の端（点 12・13）
const PANEL_U0 = 57.4; // 金属パネルの棟の北西の端（点 3・4 の u）
const PANEL_U1 = 63.6; // 長い棟の南東の端の面（辺 11→10）
const STUB = { u0: 57.4, u1: 62.7, v0: BACK_V, v1: 44.8 } as const; // 南の張り出し（点 3→4→5→6）
const GLASS = { u0: PANEL_U1, u1: 69.8, v0: 24.4, v1: 32.1 } as const; // 南東の端の塊（点 10→9→7→6）
/** 北西の端の小さな塊（点 13→14→0→1→2）。写真に写らないので無地の箱 */
const NW_BLOCK: P2[] = [
  [17.5, 24.4],
  [LONG_U0, 24.4],
  [LONG_U0, BACK_V],
  [23.2, BACK_V],
  [23.2, 32.1],
  [17.5, 32.1],
];
/** 北西の端で OSM の歩道（path_423060523）が建物に入る所（ワールド座標） */
const NW_ENTRY_XZ: P2 = [9.61, 31.37];

// --- 高さ（基壇の上面からの m）。写真: ガラスの箱 4 層、長い棟は 1 階（斜めの筋交い）＋上 3 階（ルーバー） ---
const GROUND_FLOOR_M = 4.2;
const UPPER_FLOOR_M = 3.8;
const UPPER_FLOORS = 3;
const ROOF_M = GROUND_FLOOR_M + UPPER_FLOOR_M * UPPER_FLOORS + 0.4; // 16.0
/** 金属パネルの棟は屋根の線が少し上がる（Commons (1)） */
const PANEL_ROOF_M = ROOF_M + 0.9;
/** 1 階は正面から下げてテラスにする（上の階が筋交いの柱の上に張り出す） */
const GROUND_FLOOR_SETBACK_M = 1.7;
const ENTRY_FLOOR_ABOVE_GROUND_M = 0.3;

/**
 * ルーバー: 面に対して斜めに振れた淡い青緑のガラスの細い板。写真（Commons の 2 枚）では 1〜3 枚ずつの組が
 * まばらに付き、組の間から奥のガラスと窓の枠が見える。0.95m の格子のうち半分に置き（2 枚・隙間・1 枚・隙間 2 つ）、
 * 階ごとにずらす
 */
const FIN_PITCH_M = 0.95;
const FIN_WIDTH_M = 0.8;
const FIN_ANGLES_DEG = [24, 36, 18, 30, 22, 33] as const;
const FIN_FRONT_V = FRONT_V - 0.75;
const FIN_PATTERN = [true, true, false, true, false, false] as const;
const FIN_FLOOR_SHIFT = 2;
/** 1 階のガラスの方立ての間隔（写真では筋交いの 1 区画に 3〜4 枚） */
const GROUND_MULLION_PITCH_M = 2.2;
/** 1 階の正面の筋交い: 柱 7 本・6 区画、各区画に山形の 2 本 */
const BRACE_BAYS = 6;

/** 外階段（輪郭の凹みの中、ガラスの箱の北東の面に沿う） */
const STAIR_V0 = 21.4;
const STAIR_V1 = GLASS.v0 - 0.1;
const STAIR_LANDING_U1 = PANEL_U1 + 0.8;
const STAIR_TREAD_M = 0.3;
const STAIR_RISER_MAX_M = 0.2;

const FOOTING_BELOW_LOWEST_GROUND_M = 0.5;

const COLORS = {
  concrete: '#BDBAB2', // 打ち放しの基壇
  stair: '#C8C5BD',
  panel: '#868B90', // 縦の目地の金属パネル
  backGlass: '#97A9AE', // ルーバーの奥のガラスと窓の枠（灰青。写真では組の間から明るく見える）
  warmGlass: '#BCA684', // 1 階のカフェ: 暖色の室内が透けるガラス（方立ては銀の線）。看板は作らない
  warmGlow: '#2E2112', // 室内の明かり（ごく弱い自己発光）
  glassBox: '#B3C3C8', // 明るい灰青のガラス（銀の方立てで割る）
  fin: '#A3CEC5', // 淡い青緑のガラスのルーバー
  silver: '#D2D6D8',
  steel: '#565B61',
  roof: '#8E908F',
} as const;

export const buildInnovation: HeroBuilder = (ctx: HeroBuildContext): HeroBuildResult => {
  const group = new THREE.Group();
  group.name = 'innovation-hero';
  const frame = new THREE.Group();
  frame.name = 'innovation-frame';
  frame.rotation.y = FRAME_ROT_Y;
  group.add(frame);

  const polygon = ctx.building.polygon;
  const groundAt = (u: number, v: number): number => {
    const [x, z] = toWorld(u, v);
    return ctx.sampleGroundVisualY(x, z);
  };
  const outlineBottomY = minGroundUnder(ctx, polygon) - FOOTING_BELOW_LOWEST_GROUND_M;
  const floorY = Math.max(
    ctx.sampleGroundVisualY(NW_ENTRY_XZ[0], NW_ENTRY_XZ[1]) + ENTRY_FLOOR_ABOVE_GROUND_M,
    outlineBottomY + 1.5,
  );

  // --- 材質 ---
  const mat = (color: string, roughness: number, metalness: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const concreteMat = mat(COLORS.concrete, 0.9, 0.02);
  const stairMat = mat(COLORS.stair, 0.88, 0.02);
  const panelMat = mat(COLORS.panel, 0.6, 0.15);
  const backGlassMat = mat(COLORS.backGlass, 0.3, 0.08);
  const warmGlassMat = mat(COLORS.warmGlass, 0.25, 0.05);
  warmGlassMat.emissive.set(COLORS.warmGlow);
  const glassBoxMat = mat(COLORS.glassBox, 0.15, 0.1);
  const finMat = mat(COLORS.fin, 0.25, 0.05);
  const silverMat = mat(COLORS.silver, 0.4, 0.3);
  const steelMat = mat(COLORS.steel, 0.5, 0.25);
  const roofMat = mat(COLORS.roof, 0.85, 0.02);

  /** 枠の中の箱。faceMats は BoxGeometry の面の順（+u, -u, 上, 下, +v〈奥〉, -v〈正面〉） */
  const addBox = (
    name: string,
    u0: number,
    u1: number,
    y0: number,
    y1: number,
    v0: number,
    v1: number,
    faceMats: THREE.Material | THREE.Material[],
    castShadow = true,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0, y1 - y0, v1 - v0), faceMats);
    mesh.name = name;
    mesh.position.set((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    frame.add(mesh);
    return mesh;
  };

  // --- 1. 打ち放しコンクリートの基壇（輪郭の全体、1 階の床まで） ---
  const plinth = new THREE.Mesh(
    extrudePolygonXZ(polygon, outlineBottomY, floorY - outlineBottomY),
    [concreteMat, concreteMat],
  );
  plinth.name = 'innovation-plinth';
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // --- 2. 長い棟の 1 階（カフェ。正面と南東の端は暖色の室内が透けるガラス。正面は下げてテラスに） ---
  const upperY0 = floorY + GROUND_FLOOR_M;
  addBox(
    'innovation-ground-floor',
    LONG_U0,
    PANEL_U1,
    floorY,
    upperY0,
    FRONT_V + GROUND_FLOOR_SETBACK_M,
    BACK_V,
    [warmGlassMat, panelMat, roofMat, concreteMat, panelMat, warmGlassMat],
  );

  // --- 3. 長い棟の 2〜4 階（正面は灰青のガラス、その前にルーバー） ---
  const roofY = floorY + ROOF_M;
  addBox('innovation-long-upper', LONG_U0, PANEL_U0, upperY0, roofY, FRONT_V, BACK_V, [
    panelMat,
    panelMat,
    roofMat,
    panelMat,
    panelMat,
    backGlassMat,
  ]);

  // --- 4. 縦の目地の金属パネルの棟（長い棟の南東の端。南の張り出しまで通す） ---
  const panelTopY = floorY + PANEL_ROOF_M;
  // 正面はルーバーの奥のガラス（長い棟と同じ）。屋根の線より上に出る分は金属パネルの笠
  addBox('innovation-panel-block', PANEL_U0, PANEL_U1, upperY0, roofY, FRONT_V, BACK_V, [
    panelMat,
    panelMat,
    roofMat,
    panelMat,
    panelMat,
    backGlassMat,
  ]);
  addBox('innovation-panel-cap', PANEL_U0, PANEL_U1, roofY, panelTopY, FRONT_V, BACK_V, [
    panelMat,
    panelMat,
    roofMat,
    panelMat,
    panelMat,
    panelMat,
  ]);
  addBox('innovation-panel-stub', STUB.u0, STUB.u1, floorY, panelTopY, STUB.v0, STUB.v1, [
    panelMat,
    panelMat,
    roofMat,
    panelMat,
    panelMat,
    panelMat,
  ]);
  // 南東の面の縦の目地（写真で見える、ガラスの箱より手前の部分だけ）
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  const ribCount = 8;
  const ribs = new THREE.InstancedMesh(unitBox, panelMat, ribCount);
  ribs.name = 'innovation-panel-ribs';
  for (let i = 0; i < ribCount; i++) {
    const v = FRONT_V + 0.4 + (i * (GLASS.v0 - FRONT_V - 0.8)) / (ribCount - 1);
    dummy.position.set(PANEL_U1 + 0.08, (upperY0 + panelTopY) / 2, v);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.16, panelTopY - upperY0, 0.12);
    dummy.updateMatrix();
    ribs.setMatrixAt(i, dummy.matrix);
  }
  ribs.instanceMatrix.needsUpdate = true;
  frame.add(ribs);

  // --- 5. ガラスのカーテンウォールの箱（4 層、中に階段） ---
  addBox('innovation-glass-box', GLASS.u0, GLASS.u1, floorY, roofY, GLASS.v0, GLASS.v1, [
    glassBoxMat,
    glassBoxMat,
    roofMat,
    glassBoxMat,
    glassBoxMat,
    glassBoxMat,
  ]);

  // --- 6. 北西の端の小さな塊（無地） ---
  const nwWorld = NW_BLOCK.map(([u, v]) => toWorld(u, v));
  const nwBlock = new THREE.Mesh(extrudePolygonXZ(nwWorld, floorY, ROOF_M), [roofMat, panelMat]);
  nwBlock.name = 'innovation-nw-block';
  nwBlock.castShadow = true;
  nwBlock.receiveShadow = true;
  group.add(nwBlock);

  // --- 7. 銀の線: ガラスの箱の方立て・無目、正面の各階の床の縁 ---
  const silver: { c: [number, number, number]; s: [number, number, number] }[] = [];
  const glassH = roofY - floorY;
  const levels = [0.1, GROUND_FLOOR_M, GROUND_FLOOR_M + UPPER_FLOOR_M, GROUND_FLOOR_M + 2 * UPPER_FLOOR_M, glassH - 0.12];
  const gw = GLASS.u1 - GLASS.u0;
  const gd = GLASS.v1 - GLASS.v0;
  for (let k = 0; k <= 7; k++) {
    const u = GLASS.u0 + (gw * k) / 7;
    silver.push({ c: [u, floorY + glassH / 2, GLASS.v0 - 0.05], s: [0.12, glassH, 0.12] }); // 北東の面
    silver.push({ c: [u, floorY + glassH / 2, GLASS.v1 + 0.05], s: [0.12, glassH, 0.12] }); // 南西の面
  }
  for (let k = 1; k < 8; k++) {
    const v = GLASS.v0 + (gd * k) / 8;
    silver.push({ c: [GLASS.u1 + 0.05, floorY + glassH / 2, v], s: [0.12, glassH, 0.12] }); // 南東の面
  }
  for (const h of levels) {
    const y = floorY + h;
    silver.push({ c: [(GLASS.u0 + GLASS.u1) / 2, y, GLASS.v0 - 0.06], s: [gw, 0.2, 0.12] });
    silver.push({ c: [(GLASS.u0 + GLASS.u1) / 2, y, GLASS.v1 + 0.06], s: [gw, 0.2, 0.12] });
    silver.push({ c: [GLASS.u1 + 0.06, y, (GLASS.v0 + GLASS.v1) / 2], s: [0.12, 0.2, gd] });
  }
  for (let i = 0; i <= UPPER_FLOORS; i++) {
    const y = upperY0 + i * UPPER_FLOOR_M + (i === UPPER_FLOORS ? 0.2 : 0);
    silver.push({ c: [(LONG_U0 + PANEL_U1) / 2, y, FRONT_V - 0.2], s: [PANEL_U1 - LONG_U0, 0.36, 0.5] });
  }
  // 1 階のガラスの方立て（正面と南東の端。茶色の壁ではなくガラスに見えるように）
  const gfFrontV = FRONT_V + GROUND_FLOOR_SETBACK_M - 0.05;
  const gfMullions = Math.floor((PANEL_U1 - LONG_U0) / GROUND_MULLION_PITCH_M);
  for (let k = 1; k < gfMullions; k++) {
    const u = LONG_U0 + (k * (PANEL_U1 - LONG_U0)) / gfMullions;
    silver.push({ c: [u, floorY + GROUND_FLOOR_M / 2, gfFrontV], s: [0.1, GROUND_FLOOR_M, 0.1] });
  }
  for (let k = 1; k < 7; k++) {
    const v = FRONT_V + GROUND_FLOOR_SETBACK_M + (k * (BACK_V - FRONT_V - GROUND_FLOOR_SETBACK_M)) / 7;
    silver.push({ c: [PANEL_U1 + 0.05, floorY + GROUND_FLOOR_M / 2, v], s: [0.1, GROUND_FLOOR_M, 0.1] });
  }
  silver.push({
    c: [(LONG_U0 + PANEL_U1) / 2, floorY + GROUND_FLOOR_M - 1.0, gfFrontV],
    s: [PANEL_U1 - LONG_U0, 0.1, 0.1],
  });
  const silverMesh = new THREE.InstancedMesh(unitBox, silverMat, silver.length);
  silverMesh.name = 'innovation-silver-lines';
  silver.forEach(({ c, s }, i) => {
    dummy.position.set(c[0], c[1], c[2]);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(s[0], s[1], s[2]);
    dummy.updateMatrix();
    silverMesh.setMatrixAt(i, dummy.matrix);
  });
  silverMesh.instanceMatrix.needsUpdate = true;
  frame.add(silverMesh);

  // --- 8. 斜めのガラスのルーバー（正面の 2〜4 階。細い板の組をまばらに） ---
  const slotsPerFloor = Math.floor((PANEL_U1 - LONG_U0 - 1.0) / FIN_PITCH_M) + 1;
  const finSlots: { k: number; f: number }[] = [];
  for (let f = 0; f < UPPER_FLOORS; f++) {
    for (let k = 0; k < slotsPerFloor; k++) {
      if (FIN_PATTERN[(k + f * FIN_FLOOR_SHIFT) % FIN_PATTERN.length]) finSlots.push({ k, f });
    }
  }
  const fins = new THREE.InstancedMesh(unitBox, finMat, finSlots.length);
  fins.name = 'innovation-louvers';
  finSlots.forEach(({ k, f }, fi) => {
    const y = upperY0 + f * UPPER_FLOOR_M + UPPER_FLOOR_M / 2 + 0.1;
    const deg = FIN_ANGLES_DEG[(k + f * 2) % FIN_ANGLES_DEG.length] ?? 36;
    dummy.position.set(LONG_U0 + 0.5 + k * FIN_PITCH_M, y, FIN_FRONT_V);
    // 板の表は南東寄り（+u）に振れる: Commons の 2 枚（どちらも南東寄りの正面から）で板の広い面が見える
    dummy.rotation.set(0, (-deg * Math.PI) / 180, 0);
    dummy.scale.set(FIN_WIDTH_M, UPPER_FLOOR_M - 0.5, 0.07);
    dummy.updateMatrix();
    fins.setMatrixAt(fi, dummy.matrix);
  });
  fins.instanceMatrix.needsUpdate = true;
  fins.castShadow = true;
  frame.add(fins);

  // --- 9. 1 階の正面の柱と山形の筋交い（鉄骨） ---
  const braceU0 = LONG_U0 + 0.5;
  const braceU1 = PANEL_U1 - 0.5;
  const bayW = (braceU1 - braceU0) / BRACE_BAYS;
  const braceV = FRONT_V + 0.3;
  const braces = new THREE.InstancedMesh(unitBox, steelMat, BRACE_BAYS + 1 + BRACE_BAYS * 2);
  braces.name = 'innovation-braces';
  let bi = 0;
  for (let k = 0; k <= BRACE_BAYS; k++) {
    dummy.position.set(braceU0 + k * bayW, floorY + GROUND_FLOOR_M / 2, braceV);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.45, GROUND_FLOOR_M, 0.45);
    dummy.updateMatrix();
    braces.setMatrixAt(bi++, dummy.matrix);
  }
  const diagLen = Math.hypot(bayW / 2, GROUND_FLOOR_M);
  const diagAngle = Math.atan2(GROUND_FLOOR_M, bayW / 2);
  for (let k = 0; k < BRACE_BAYS; k++) {
    const uMid = braceU0 + (k + 0.5) * bayW;
    for (const side of [-1, 1]) {
      dummy.position.set(uMid + (side * bayW) / 4, floorY + GROUND_FLOOR_M / 2, braceV);
      dummy.rotation.set(0, 0, side < 0 ? diagAngle : -diagAngle);
      dummy.scale.set(diagLen, 0.28, 0.28);
      dummy.updateMatrix();
      braces.setMatrixAt(bi++, dummy.matrix);
    }
  }
  braces.instanceMatrix.needsUpdate = true;
  braces.castShadow = true;
  frame.add(braces);

  // --- 10. 外階段（凹みの中を南東から北西へ上がり、1 階の南東の戸口の前の踊り場に着く） ---
  const stairCenterV = (STAIR_V0 + STAIR_V1) / 2;
  let footGround = groundAt(STAIR_LANDING_U1 + 6, stairCenterV);
  let risers = 0;
  for (let iter = 0; iter < 3; iter++) {
    const rise = floorY - footGround;
    risers = rise > 0.3 ? Math.ceil(rise / STAIR_RISER_MAX_M) : 0;
    footGround = groundAt(STAIR_LANDING_U1 + Math.max(0, risers - 1) * STAIR_TREAD_M, stairCenterV);
  }
  const stairFootU = STAIR_LANDING_U1 + Math.max(0, risers - 1) * STAIR_TREAD_M;
  const stairBottomY =
    Math.min(
      groundAt(PANEL_U1, STAIR_V0),
      groundAt(PANEL_U1, STAIR_V1),
      groundAt(stairFootU, STAIR_V0),
      groundAt(stairFootU, STAIR_V1),
      floorY,
    ) - FOOTING_BELOW_LOWEST_GROUND_M;
  addBox(
    'innovation-stair-landing',
    PANEL_U1,
    STAIR_LANDING_U1,
    stairBottomY,
    floorY,
    STAIR_V0,
    STAIR_V1,
    stairMat,
  );
  if (risers >= 2) {
    const riser = (floorY - footGround) / risers;
    const steps = new THREE.InstancedMesh(unitBox, stairMat, risers - 1);
    steps.name = 'innovation-stair-steps';
    for (let k = 1; k < risers; k++) {
      const top = floorY - k * riser;
      const u0 = STAIR_LANDING_U1 + (k - 1) * STAIR_TREAD_M;
      dummy.position.set(u0 + STAIR_TREAD_M / 2, (top + stairBottomY) / 2, stairCenterV);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(STAIR_TREAD_M, top - stairBottomY, STAIR_V1 - STAIR_V0);
      dummy.updateMatrix();
      steps.setMatrixAt(k - 1, dummy.matrix);
    }
    steps.instanceMatrix.needsUpdate = true;
    steps.receiveShadow = true;
    frame.add(steps);
  }

  for (const child of frame.children) {
    if (child instanceof THREE.InstancedMesh) {
      child.computeBoundingBox();
      child.computeBoundingSphere();
    }
  }

  return {
    group,
    primaryMaterials: [
      { mat: panelMat, baseHex: COLORS.panel },
      { mat: finMat, baseHex: COLORS.fin },
      { mat: glassBoxMat, baseHex: COLORS.glassBox },
    ],
    animated: [],
  };
};
