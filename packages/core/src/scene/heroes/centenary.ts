import * as THREE from 'three';
import { extrudePolygonXZ, minGroundUnder } from './shared';
import type { HeroBuilder } from './types';

/**
 * 関西大学百周年記念会館（1989 年、地上 3 階。多目的ホールと室内プール）の専用モデル。
 *
 * 根拠にした資料（docs/visual-research/official-buildings.md・commons-buildings.md）と写真:
 * - Wikimedia Commons の 100-nen_Kinen_Kaikan.jpg・Kansai_University_100_year_anniversary_hall.JPG・
 *   関西大学100周年記念会館.JPG。3 枚とも北の石畳の広場（OSM の転回路 path_175729526 の側）から南を見ている。
 *   左右に赤褐色レンガの低い翼、その間の奥に、上の縁が円弧の大きな妻面（中央に楕円の窓、上に緑青色の
 *   深い軒）、手前に曲面の屋根の車寄せ（真鍮色の細い柱が 2 列）
 * - 国土地理院の空中写真（全国最新写真〈シームレス〉z18）: 車寄せ（幅約 6〜7m、長さ約 25m）が北の転回路から
 *   南へ延び、その先に緑青色の屋根の塊（幅約 25m）がつながる。その南に横長の緑青色の帯、さらに南に緑青色の
 *   屋根の長い棟。左右の翼の屋根は灰色の陸屋根、南東の細い棟は赤茶色
 *
 * かまぼこ屋根の向きと位置: 写真で円弧の縁が見えるのは、北の広場から見た車寄せの突き当たりの面
 * （OSM の輪郭の北の切り欠きの奥の辺、s = -30.1）。円弧は妻面の形なので、円筒の軸は建物の長手（南北から
 * 約 17.6° 東へ振れた向き）に沿う。空中写真で車寄せがつながる緑青色の塊（幅約 25m、北の端から約 27m）を
 * その円筒の屋根とした。妻面の両端は左右の翼の陰に入るので、写真では翼の角から円弧が立ち上がって見える。
 *
 * 輪郭のいちばん長い辺（東の辺）の向きで、ローカルの座標（s: 長手で南が正、t: 短手で東が正、原点は重心）を
 * 作り、各部はこの座標で置く。s・t の値は buildings.json の輪郭の頂点と空中写真から読んだもの。
 */

const BRICK_HEX = '#A65D3C';
const PATINA_HEX = '#78A59C';
const WING_ROOF_HEX = '#6A6C64';
const BASE_ROOF_HEX = '#8E7A68';
const GLASS_HEX = '#3A4650';
const SOFFIT_HEX = '#E6E1D6';
const BRONZE_HEX = '#A9884F';
const TRIM_HEX = '#E9E6DF';
const DARK_HEX = '#3A3F42';
const OVAL_GLASS_HEX = '#2F3A46';

/** 底を、輪郭の下のいちばん低い地面からさらに下ろす深さ (m) */
const FOOTING_BELOW_LOWEST_GROUND_M = 0.5;

type ST = readonly [number, number];

/** 輪郭の西の辺（翼の外側）。s = -48.1 で t = -18.0、s = -1.1 で t = -18.9 */
function westEdgeT(s: number): number {
  return -18.0 + ((s + 48.1) * -0.9) / 47.0;
}
/** 輪郭の東の辺。s = -48.6 で t = 21.2、s = 24.7 で t = 21.3 */
function eastEdgeT(s: number): number {
  return 21.2 + ((s + 48.6) * 0.1) / 73.3;
}

/** 北の切り欠き（車寄せの入る中庭）の奥の辺 = ホールの北の妻面 */
const HALL_NORTH_S = -30.1;
/** ホール（かまぼこ屋根の棟）の幅と南の端。空中写真の緑青色の塊（幅約 25m） */
const HALL_T0 = -11.5;
const HALL_T1 = 13.0;
const HALL_SOUTH_S = -3.0;
const HALL_CENTER_T = (HALL_T0 + HALL_T1) / 2;

/** 各部の平面（s, t）。輪郭の頂点に合わせて切った部分ごとの多角形 */
const WEST_WING_NORTH: readonly ST[] = [
  [-48.1, -18.0],
  [-47.8, -6.7],
  [HALL_NORTH_S, -7.0],
  [HALL_NORTH_S, westEdgeT(HALL_NORTH_S)],
];
const WEST_WING_SOUTH: readonly ST[] = [
  [HALL_NORTH_S, westEdgeT(HALL_NORTH_S)],
  [HALL_NORTH_S, HALL_T0],
  [-13.0, HALL_T0],
  [-13.0, westEdgeT(-13.0)],
];
const EAST_WING_NORTH: readonly ST[] = [
  [-48.5, 9.5],
  [-48.6, eastEdgeT(-48.6)],
  [HALL_NORTH_S, eastEdgeT(HALL_NORTH_S)],
  [HALL_NORTH_S, 10.4],
];
const EAST_WING_SOUTH: readonly ST[] = [
  [HALL_NORTH_S, HALL_T1],
  [HALL_NORTH_S, eastEdgeT(HALL_NORTH_S)],
  [-12.0, eastEdgeT(-12.0)],
  [-12.0, HALL_T1],
];
/** ホールの南で全幅に広がる緑青色の帯（空中写真）。南の端は輪郭の西の辺の段（s = -1.0）に合わせる */
const CROSS_WING: readonly ST[] = [
  [-13.0, westEdgeT(-13.0)],
  [-13.0, eastEdgeT(-13.0)],
  [-1.0, eastEdgeT(-1.0)],
  [-1.0, -18.9],
];
const HALL: readonly ST[] = [
  [HALL_NORTH_S, HALL_T0],
  [HALL_NORTH_S, HALL_T1],
  [HALL_SOUTH_S, HALL_T1],
  [HALL_SOUTH_S, HALL_T0],
];
/** 南の緑青色の屋根の長い棟（空中写真）。南の端の曲面の張り出しと東西の細い部分は低い基壇に残す */
const SOUTH_BLOCK: readonly ST[] = [
  [-1.0, -10.6],
  [-1.0, 14.4],
  [34.0, 14.3],
  [34.0, -10.5],
];
/** 横長の帯の上の暗い帯（空中写真で設備が並ぶ） */
const DARK_STRIP_S0 = -3.0;
const DARK_STRIP_S1 = -1.2;

/**
 * 高さは北の広場の高さ（ホールの妻面の中央・両翼の北の面の中央の地面の高い方）を基準にする。
 * 敷地は南へ大きく下がる（輪郭の中で表示上 13m ほど）ので、北から見た写真の比を基準の上で再現する。
 * 写真では翼が約 2 階、円弧の両端は翼の上端とほぼ同じ高さで、頂部は翼の 1.5 倍ほど
 */
const BASE_TOP_ABOVE_REF_M = -1.5;
const WING_TOP_ABOVE_REF_M = 7.5;
const CROSS_WING_TOP_ABOVE_REF_M = 7.6;
/** 円弧の起拱点（ホールの側壁の上端）。翼の上端のすぐ上から円弧が立ち上がる */
const HALL_WALL_TOP_ABOVE_REF_M = 7.8;
/** 南の棟は写真に写らない（ホールの陰）ので、翼より低い箱にする */
const SOUTH_BLOCK_TOP_ABOVE_REF_M = 3.0;
/** かまぼこ屋根の起拱点からの高さ（写真の円弧は半スパンの 0.2〜0.25 ほど） */
const VAULT_RISE_M = 3.0;
const VAULT_SHELL_THICKNESS_M = 0.45;
/** 軒の出（写真で妻面の円弧の縁と側面に深い軒） */
const VAULT_EAVE_SIDE_M = 0.8;
const VAULT_EAVE_NORTH_M = 1.2;
const VAULT_EAVE_SOUTH_M = 0.4;

/**
 * 妻面の楕円の窓（写真で幅約 3m・高さ約 2m、円弧の起拱点の少し下、中央）と石の枠
 */
const OVAL_WIDTH_M = 3.0;
const OVAL_HEIGHT_M = 1.9;
const OVAL_CENTER_BELOW_SPRING_M = 1.4;
/** 入口の上の白い円弧の庇（写真で入口のガラスの上に白い弓形） */
const ENTRANCE_ARCH_HALF_CHORD_M = 8.5;
const ENTRANCE_ARCH_RISE_M = 1.3;
const ENTRANCE_ARCH_TOP_RATIO = 0.55;
const ENTRANCE_GLASS_HALF_WIDTH_M = 7.0;

/** 空中写真で車寄せの屋根の真上（2014 年の写真で車寄せの消点が建物の軸より西へ約 5° ずれるのと合う） */
const CANOPY_NORTH: ST = [-55.9, 3.4];
const CANOPY_SOUTH: ST = [HALL_NORTH_S - 0.3, 0.63];
const CANOPY_WIDTH_M = 7.0;
const CANOPY_ARC_RISE_M = 1.0;
const CANOPY_SHELL_THICKNESS_M = 0.3;
/** 車寄せの屋根の下端（中心線）の、その場の地面からの高さ */
const CANOPY_CLEARANCE_M = 3.8;
/** 柱（2 列 × 5 本）。写真で前の端から少し下がった所から、入口の手前まで */
const CANOPY_COLUMN_OFFSET_M = 2.7;
const CANOPY_COLUMN_RADIUS_M = 0.14;
const CANOPY_COLUMN_STATIONS_M = [1.6, 7.4, 13.2, 19.0, 24.2] as const;

/** 輪郭が使えないときの代わり（buildings.json の centenary） */
const FALLBACK_POLYGON: readonly [number, number][] = [
  [-229.27, 436.54],
  [-224.05, 434.91],
  [-221.06, 433.96],
  [-217.86, 432.97],
  [-212.72, 431.36],
  [-219.03, 414.06],
  [-207.93, 410.44],
  [-185.8, 480.29],
  [-192.48, 482.19],
  [-189.72, 491.23],
  [-193.13, 492.57],
  [-195.36, 495.78],
  [-199.87, 498.69],
  [-206.24, 499.14],
  [-209.83, 497.59],
  [-213.33, 498.69],
  [-216.27, 490.13],
  [-222.72, 491.77],
  [-229.91, 467.3],
  [-231.94, 467.77],
  [-245.15, 422.67],
  [-234.36, 419.55],
];
const FALLBACK_CENTROID = { x: -213.55, z: 463.16 };

interface AxisFrame {
  cx: number;
  cz: number;
  ux: number;
  uz: number;
  vx: number;
  vz: number;
  yaw: number;
}

function usablePolygon(raw: readonly [number, number][]): readonly [number, number][] {
  const finite = raw.filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z));
  return finite.length >= 3 ? finite : FALLBACK_POLYGON;
}

/** いちばん長い辺の向き（南が正）を長手に、重心を原点にした座標系 */
function frameFromPolygon(
  polygon: readonly [number, number][],
  centroid: { x: number; z: number },
): AxisFrame {
  let bestLen = 0;
  let ux = 0;
  let uz = 1;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len > bestLen) {
      bestLen = len;
      ux = dx / len;
      uz = dz / len;
    }
  }
  if (uz < 0) {
    ux = -ux;
    uz = -uz;
  }
  return { cx: centroid.x, cz: centroid.z, ux, uz, vx: uz, vz: -ux, yaw: Math.atan2(ux, uz) };
}

function toWorld(f: AxisFrame, s: number, t: number): [number, number] {
  return [f.cx + s * f.ux + t * f.vx, f.cz + s * f.uz + t * f.vz];
}

function standard(hex: string, roughness: number, metalness = 0.02): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
}

/** 円弧の帯の断面（中心 (cx, cy)、半径 r0〜r1、真上から左右に halfAngle） */
function arcBandShape(cx: number, cy: number, r0: number, r1: number, halfAngle: number): THREE.Shape {
  const a0 = Math.PI / 2 + halfAngle;
  const a1 = Math.PI / 2 - halfAngle;
  const shape = new THREE.Shape();
  shape.moveTo(cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1);
  shape.absarc(cx, cy, r1, a0, a1, true);
  shape.lineTo(cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0);
  shape.absarc(cx, cy, r0, a1, a0, false);
  shape.closePath();
  return shape;
}

export const buildCentenary: HeroBuilder = (ctx) => {
  const polygon = usablePolygon(ctx.building.polygon);
  const centroid =
    Number.isFinite(ctx.building.centroid?.x) && Number.isFinite(ctx.building.centroid?.z)
      ? ctx.building.centroid
      : FALLBACK_CENTROID;
  const frame = frameFromPolygon(polygon, centroid);
  const groundAt = (s: number, t: number): number => {
    const [x, z] = toWorld(frame, s, t);
    return ctx.sampleGroundVisualY(x, z);
  };
  const toWorldPolygon = (pts: readonly ST[]): [number, number][] =>
    pts.map(([s, t]) => toWorld(frame, s, t));

  const group = new THREE.Group();
  /** ローカルの座標の入れ物（x = t 東、z = s 南、y はワールドのまま） */
  const local = new THREE.Group();
  local.position.set(frame.cx, 0, frame.cz);
  local.rotation.y = frame.yaw;
  group.add(local);

  const brickMat = standard(BRICK_HEX, 0.84);
  const patinaMat = standard(PATINA_HEX, 0.6, 0.1);
  const wingRoofMat = standard(WING_ROOF_HEX, 0.92);
  const baseRoofMat = standard(BASE_ROOF_HEX, 0.92);
  const glassMat = standard(GLASS_HEX, 0.4, 0.05);
  const soffitMat = standard(SOFFIT_HEX, 0.8);
  soffitMat.side = THREE.DoubleSide;
  const bronzeMat = standard(BRONZE_HEX, 0.45, 0.3);
  const trimMat = standard(TRIM_HEX, 0.7);
  const darkMat = standard(DARK_HEX, 0.8);
  const ovalGlassMat = standard(OVAL_GLASS_HEX, 0.35, 0.05);

  const bottom = minGroundUnder(ctx, polygon) - FOOTING_BELOW_LOWEST_GROUND_M;
  const hallFaceGround = groundAt(HALL_NORTH_S, HALL_CENTER_T);
  const refY = Math.max(hallFaceGround, groundAt(-48.0, -12.4), groundAt(-48.5, 15.3));

  // 低い基壇（輪郭全体）。南東・西の細い棟と、南の端の曲面の張り出しはこの高さ。
  // 上に載る各部は基壇の上面のすぐ下から立ち上げる（輪郭の辺と各部の辺が同じ面で重なってちらつかないように）
  const baseTop = refY + BASE_TOP_ABOVE_REF_M;
  const partBottom = Math.max(bottom, baseTop - 0.05);
  const addPrism = (
    footprint: readonly [number, number][],
    topY: number,
    lidMat: THREE.MeshStandardMaterial,
    castShadow: boolean,
    whole = false,
  ): void => {
    const baseY = whole ? bottom : partBottom;
    const mesh = new THREE.Mesh(extrudePolygonXZ(footprint, baseY, topY - baseY), [lidMat, brickMat]);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  addPrism(polygon, baseTop, baseRoofMat, true, true);
  addPrism(toWorldPolygon(SOUTH_BLOCK), refY + SOUTH_BLOCK_TOP_ABOVE_REF_M, patinaMat, true);
  addPrism(toWorldPolygon(CROSS_WING), refY + CROSS_WING_TOP_ABOVE_REF_M, patinaMat, true);
  for (const wing of [WEST_WING_NORTH, WEST_WING_SOUTH, EAST_WING_NORTH, EAST_WING_SOUTH]) {
    addPrism(toWorldPolygon(wing), refY + WING_TOP_ABOVE_REF_M, wingRoofMat, true);
  }
  const springY = refY + HALL_WALL_TOP_ABOVE_REF_M;
  addPrism(toWorldPolygon(HALL), springY, brickMat, true);

  // ホールのかまぼこ屋根: レンガの妻壁（弓形）＋緑青色の円筒の殻（軒を出す）
  const hallHalfSpan = (HALL_T1 - HALL_T0) / 2;
  const vaultRadius = (hallHalfSpan * hallHalfSpan + VAULT_RISE_M * VAULT_RISE_M) / (2 * VAULT_RISE_M);
  const vaultCenterY = VAULT_RISE_M - vaultRadius;
  const tympanumShape = new THREE.Shape();
  const tympanumHalfAngle = Math.asin(hallHalfSpan / vaultRadius);
  tympanumShape.moveTo(HALL_CENTER_T - hallHalfSpan, 0);
  tympanumShape.absarc(
    HALL_CENTER_T,
    vaultCenterY,
    vaultRadius,
    Math.PI / 2 + tympanumHalfAngle,
    Math.PI / 2 - tympanumHalfAngle,
    true,
  );
  tympanumShape.closePath();
  const hallLength = HALL_SOUTH_S - HALL_NORTH_S;
  const tympanum = new THREE.Mesh(
    new THREE.ExtrudeGeometry(tympanumShape, { depth: hallLength, bevelEnabled: false, curveSegments: 24 }),
    brickMat,
  );
  tympanum.position.set(0, springY, HALL_NORTH_S);
  tympanum.castShadow = true;
  local.add(tympanum);

  const shellInner = vaultRadius + 0.02;
  const shellHalfAngle = Math.asin((hallHalfSpan + VAULT_EAVE_SIDE_M) / shellInner);
  const shellLength = hallLength + VAULT_EAVE_NORTH_M + VAULT_EAVE_SOUTH_M;
  const shell = new THREE.Mesh(
    new THREE.ExtrudeGeometry(
      arcBandShape(HALL_CENTER_T, vaultCenterY, shellInner, shellInner + VAULT_SHELL_THICKNESS_M, shellHalfAngle),
      { depth: shellLength, bevelEnabled: false, curveSegments: 28 },
    ),
    patinaMat,
  );
  shell.position.set(0, springY, HALL_NORTH_S - VAULT_EAVE_NORTH_M);
  shell.castShadow = true;
  shell.receiveShadow = true;
  local.add(shell);

  // 屋根の頂部の天窓（空中写真でホールの屋根の中央やや西に暗い四角）
  const crownOuter = shellInner + VAULT_SHELL_THICKNESS_M;
  const skylightT = HALL_CENTER_T - 3.0;
  const skylightSurfaceY = springY + vaultCenterY + Math.sqrt(crownOuter ** 2 - (skylightT - HALL_CENTER_T) ** 2);
  const skylight = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 5), darkMat);
  skylight.position.set(skylightT, skylightSurfaceY, -16.8);
  local.add(skylight);

  // 妻面の楕円の窓と石の枠
  const ovalY = springY - OVAL_CENTER_BELOW_SPRING_M;
  const discGeo = new THREE.CylinderGeometry(1, 1, 0.12, 36);
  discGeo.rotateX(Math.PI / 2);
  const ovalFrame = new THREE.Mesh(discGeo, trimMat);
  ovalFrame.scale.set(OVAL_WIDTH_M / 2 + 0.3, OVAL_HEIGHT_M / 2 + 0.3, 1);
  ovalFrame.position.set(HALL_CENTER_T, ovalY, HALL_NORTH_S - 0.06);
  local.add(ovalFrame);
  const ovalGlass = new THREE.Mesh(discGeo, ovalGlassMat);
  ovalGlass.scale.set(OVAL_WIDTH_M / 2, OVAL_HEIGHT_M / 2, 1);
  ovalGlass.position.set(HALL_CENTER_T, ovalY, HALL_NORTH_S - 0.12);
  local.add(ovalGlass);

  // 入口の上の白い弓形の庇と、入口のガラス
  // 写真（関西大学100周年記念会館.JPG）で弓形の頂部は、入口の地面から起拱点までの約 55% の高さ
  const archTopY = Math.min(
    hallFaceGround + ENTRANCE_ARCH_TOP_RATIO * (springY - hallFaceGround),
    ovalY - OVAL_HEIGHT_M / 2 - 0.6,
  );
  const archSpringY = archTopY - ENTRANCE_ARCH_RISE_M;
  const archRadius =
    (ENTRANCE_ARCH_HALF_CHORD_M ** 2 + ENTRANCE_ARCH_RISE_M ** 2) / (2 * ENTRANCE_ARCH_RISE_M);
  const archAngle = 2 * Math.asin(ENTRANCE_ARCH_HALF_CHORD_M / archRadius);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(archRadius, 0.28, 6, 32, archAngle), trimMat);
  arch.rotation.z = Math.PI / 2 - archAngle / 2;
  arch.position.set(HALL_CENTER_T, archTopY - archRadius, HALL_NORTH_S - 0.3);
  local.add(arch);
  const entranceTop = Math.max(hallFaceGround + 2.5, archSpringY - 0.1);
  const entranceBottom = hallFaceGround - 0.3;
  const entrance = new THREE.Mesh(
    new THREE.BoxGeometry(ENTRANCE_GLASS_HALF_WIDTH_M * 2, entranceTop - entranceBottom, 0.12),
    glassMat,
  );
  entrance.position.set(HALL_CENTER_T, (entranceTop + entranceBottom) / 2, HALL_NORTH_S - 0.08);
  local.add(entrance);

  // 中庭に面する翼のガラス。写真は北から南を見ているので左が東: 2014 年の写真で左（東の翼の西面）は
  // 全面のガラス、右（西の翼の東面）は 1 階がガラスで上はレンガ
  const addFaceGlass = (from: ST, to: ST, outward: number, y0: number, y1: number): void => {
    const ds = to[0] - from[0];
    const dt = to[1] - from[1];
    const len = Math.hypot(ds, dt);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.12, y1 - y0, len), glassMat);
    glass.rotation.y = Math.atan2(dt, ds);
    glass.position.set((from[1] + to[1]) / 2 + outward, (y0 + y1) / 2, (from[0] + to[0]) / 2);
    local.add(glass);
  };
  const westCourtGround = groundAt(-38, -6.85);
  addFaceGlass([-45.6, -6.73], [-30.6, -6.99], 0.08, westCourtGround - 0.3, westCourtGround + 3.2);
  const eastCourtGround = groundAt(-39, 9.95);
  addFaceGlass([-47.0, 9.57], [-31.0, 10.36], -0.08, eastCourtGround - 0.3, refY + WING_TOP_ABOVE_REF_M - 0.8);

  // 横長の帯の上の暗い帯
  const crossTop = refY + CROSS_WING_TOP_ABOVE_REF_M;
  const darkStrip = new THREE.Mesh(
    new THREE.BoxGeometry(HALL_T1 - HALL_T0, 0.6, DARK_STRIP_S1 - DARK_STRIP_S0),
    darkMat,
  );
  darkStrip.position.set(HALL_CENTER_T, crossTop + 0.25, (DARK_STRIP_S0 + DARK_STRIP_S1) / 2);
  local.add(darkStrip);

  // 車寄せ: 断面が円弧の金属の屋根（上は緑青色、下は白い天井）を、地面の傾きに沿わせて置く
  const canopyDs = CANOPY_SOUTH[0] - CANOPY_NORTH[0];
  const canopyDt = CANOPY_SOUTH[1] - CANOPY_NORTH[1];
  const canopyLength = Math.hypot(canopyDs, canopyDt);
  const northY = groundAt(CANOPY_NORTH[0], CANOPY_NORTH[1]) + CANOPY_CLEARANCE_M;
  const southY = groundAt(CANOPY_SOUTH[0], CANOPY_SOUTH[1]) + CANOPY_CLEARANCE_M;
  const pitch = Math.atan2(northY - southY, canopyLength);
  const canopy = new THREE.Group();
  canopy.position.set(CANOPY_NORTH[1], northY, CANOPY_NORTH[0]);
  canopy.rotation.set(pitch, Math.atan2(canopyDt, canopyDs), 0, 'YXZ');
  local.add(canopy);
  const canopyHalf = CANOPY_WIDTH_M / 2;
  const canopyRadius = (canopyHalf ** 2 + CANOPY_ARC_RISE_M ** 2) / (2 * CANOPY_ARC_RISE_M);
  const canopyCenterY = CANOPY_ARC_RISE_M - canopyRadius;
  const canopyHalfAngle = Math.asin(canopyHalf / canopyRadius);
  const canopyShell = new THREE.Mesh(
    new THREE.ExtrudeGeometry(
      arcBandShape(0, canopyCenterY, canopyRadius, canopyRadius + CANOPY_SHELL_THICKNESS_M, canopyHalfAngle),
      { depth: canopyLength, bevelEnabled: false, curveSegments: 16 },
    ),
    patinaMat,
  );
  canopyShell.castShadow = true;
  canopy.add(canopyShell);
  const soffit = new THREE.Mesh(
    new THREE.ExtrudeGeometry(
      arcBandShape(0, canopyCenterY, canopyRadius - 0.04, canopyRadius - 0.005, canopyHalfAngle),
      { depth: canopyLength - 0.1, bevelEnabled: false, curveSegments: 16 },
    ),
    soffitMat,
  );
  soffit.position.z = 0.05;
  canopy.add(soffit);

  // 真鍮色の細い柱（2 列）。屋根の下面まで
  const columnGeo = new THREE.CylinderGeometry(CANOPY_COLUMN_RADIUS_M, CANOPY_COLUMN_RADIUS_M, 1, 10);
  const columns = new THREE.InstancedMesh(columnGeo, bronzeMat, CANOPY_COLUMN_STATIONS_M.length * 2);
  const soffitRiseAtColumn =
    canopyCenterY + Math.sqrt(canopyRadius ** 2 - CANOPY_COLUMN_OFFSET_M ** 2) - 0.04;
  const dirS = canopyDs / canopyLength;
  const dirT = canopyDt / canopyLength;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let ci = 0;
  for (const station of CANOPY_COLUMN_STATIONS_M) {
    const along = station * Math.cos(pitch);
    const topY = northY - station * Math.sin(pitch) + soffitRiseAtColumn;
    for (const side of [-1, 1]) {
      // 車寄せの幅の向き（ローカルの x = t を正に近い向き）: (dirS, dirT) を 90° 回した (−dirT, dirS) の t・s
      const s = CANOPY_NORTH[0] + dirS * along - dirT * side * CANOPY_COLUMN_OFFSET_M;
      const t = CANOPY_NORTH[1] + dirT * along + dirS * side * CANOPY_COLUMN_OFFSET_M;
      const footY = groundAt(s, t) - FOOTING_BELOW_LOWEST_GROUND_M;
      const h = Math.max(0.5, topY - footY);
      pos.set(t, footY + h / 2, s);
      scl.set(1, h, 1);
      columns.setMatrixAt(ci++, m.compose(pos, q, scl));
    }
  }
  columns.instanceMatrix.needsUpdate = true;
  local.add(columns);

  return {
    group,
    primaryMaterials: [
      { mat: brickMat, baseHex: BRICK_HEX },
      { mat: patinaMat, baseHex: PATINA_HEX },
    ],
    animated: [],
  };
};
