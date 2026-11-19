import * as THREE from 'three';
import type { HeroBuildContext, HeroBuilder, HeroBuildResult } from './types';

/**
 * 正面の向き（外向き法線の方位角 rad。0 = +Z 南、-Math.PI/2 = -X 西）。
 * OSM 輪郭の南南西辺 [-77, 72] -> [-19, 105] の外向き法線 (-0.4945, 0, 0.8692) に合わせた値。
 * 正面の向きを変更したい場合はこの定数 1 つだけを変更する。
 */
const FRONT_FACING_ANGLE_RAD = Math.atan2(-33, 58);

/** 総合図書館の代表輪郭（入力ポリゴンが空または退化している場合のフォールバック） */
const FALLBACK_POLYGON: readonly [number, number][] = [
  [-77, 72],
  [-75, 68],
  [-83, 64],
  [-56, 13],
  [-47, 17],
  [-45, 13],
  [-3, 36],
  [3, 40],
  [1, 43],
  [30, 58],
  [-19, 105],
  [-31, 98],
  [-30, 96],
  [-49, 86],
  [-64, 78],
  [-65, 79],
];

const COLORS = {
  brick: '#A8634A',
  trim: '#E9E3D6',
  upperWindowGlass: '#5D7480',
  curtainGlass: '#4E6570',
  mullion: '#3A4248',
  canopy: '#EDEAE3',
  stairStone: '#B5B2AA',
  retainingStone: '#9E9A90',
  // 地面・階段のベージュと分けて、俯瞰で屋上がのっぺりしないように少し濃い灰色にする
  roof: '#8F8A84',
} as const;

/** 斜面でも足元が浮かないように地面の下へ伸ばす根入れ深さ (m) */
const SKIRT_DEPTH_M = 2.5;

/** 大階段の高さ（下段 2.4m + 上段 2.4m）。上がりきった所がテラス（1 階の床）になる */
const STAIR_LOWER_HEIGHT_M = 2.4;
const STAIR_UPPER_HEIGHT_M = 2.4;
const TERRACE_HEIGHT_M = STAIR_LOWER_HEIGHT_M + STAIR_UPPER_HEIGHT_M;

/**
 * 本体 3 階建ての階高・総高と、左右の塔の高さ。
 * 写真では屋根の線が塔で一段上がり、右の塔は左より少し高い（左 +1.5m、右 +2.5m）。
 * 最高部（右の塔）は groundVisualY + 4.8 + 14.4 + 2.5 = groundVisualY + 21.7m。
 */
const FLOOR_HEIGHT_M = 4.8;
const BODY_HEIGHT_M = FLOOR_HEIGHT_M * 3;
const LEFT_TOWER_EXTRA_HEIGHT_M = 1.5;
const RIGHT_TOWER_EXTRA_HEIGHT_M = 2.5;

/**
 * 正面の割り付け。写真の正面は「左の塔：中央：右の塔」がおよそ 1：1.8：2 で、塔が正面の 6 割を占める。
 * 正面の幅（約 67m）に対する比で決める（左 21%・右 40%・残りの 39% が中央）。
 */
const LEFT_TOWER_SPAN_RATIO = 0.21;
const RIGHT_TOWER_SPAN_RATIO = 0.4;
const TOWER_PROTRUSION_M = 4.0;
/** 塔の箱を本体の中へ食い込ませる奥行き（左端の袖との間に隙間を作らない） */
const TOWER_BACK_DEPTH_M = 4.5;

/** 中央 1・2 階: 正面から 3m 引っ込んだ 2 層分の高さのガラスのカーテンウォール */
const CURTAIN_RECESS_M = 3.0;
const CURTAIN_HEIGHT_M = 8.0;
const CURTAIN_MULLION_STEP_M = 2.5;
const CURTAIN_TRANSOM_ROWS = 7;

/**
 * 中央のカーテンウォールより上（テラスからの高さ）。写真の下から順に
 * 白い梁（8.0〜8.5m）→ レンガの帯 → 白い水切り → 3 階の横長窓の帯（1 段だけ）→ 白い帯 → レンガのパラペット
 */
const BEAM_HEIGHT_M = 0.5;
const UPPER_SILL_BOTTOM_M = 10.0;
const UPPER_SILL_HEIGHT_M = 0.15;
const UPPER_WINDOW_HEIGHT_M = 1.5;
const UPPER_HEAD_HEIGHT_M = 0.4;
/** 白い帯（梁・水切り・窓上の帯）が正面の面から出る量 */
const TRIM_PROUD_M = 0.2;

/** 中央で窓の帯とカーテンウォールを左右に分ける縦の柱（テラスからパラペットの少し下まで） */
const CENTER_PIER_WIDTH_M = 1.8;
const CENTER_PIER_HEIGHT_M = 13.0;
const CENTER_PIER_PROUD_M = 0.3;

/**
 * 逆さ扇の折板コンクリート庇。柱は無く、カーテンウォールから片持ちで出て、前へ行くほど高く開く。
 * 写真では前端の幅が中央の引っ込みの幅の約 7 割で、中央の柱より右（入口のある右の区画）に寄る。
 */
const CANOPY_FRONT_WIDTH_RATIO = 0.7;
/** 前端の幅に対する、根元の幅と張り出し（正面の面からの距離）の比（1 回目の 14m・5.2m・6m の比を保つ） */
const CANOPY_BACK_WIDTH_RATIO = 5.2 / 14;
const CANOPY_PROTRUSION_RATIO = 6.0 / 14;
/** 中央の中心から右へずらす量（中央の幅に対する比） */
const CANOPY_OFFSET_RATIO = 0.18;
/** 根元（壁の取り付き）の高さと、前端がそこから上がる高さ */
const CANOPY_BACK_ELEVATION_M = 2.9;
const CANOPY_FRONT_RISE_M = 1.0;
const CANOPY_FOLD_COUNT = 14;
const CANOPY_THICKNESS_M = 0.14;
/** ひだの深さなどを決めたときの前端の幅（大きさに比例して深くする基準） */
const CANOPY_REFERENCE_FRONT_WIDTH_M = 14.0;

/** 2 段構えの大階段（中央の引っ込みの正面に置く） */
const STAIR_UPPER_WIDTH_M = 26.0;
const STAIR_UPPER_DEPTH_M = 7.0;
const STAIR_LANDING_DEPTH_M = 4.0;
const STAIR_LOWER_WIDTH_M = 40.0;
const STAIR_LOWER_DEPTH_M = 8.0;
const STAIR_STEPS_PER_FLIGHT = 12;

interface FrontFrame {
  facingAngleRad: number;
  originX: number;
  originZ: number;
  nx: number;
  nz: number;
  tx: number;
  tz: number;
  frontSpan: number;
}

function normalizePolygon(raw: readonly [number, number][]): [number, number][] {
  const source = raw.length >= 3 ? raw : FALLBACK_POLYGON;
  const cleaned: [number, number][] = [];
  for (const pt of source) {
    const prev = cleaned[cleaned.length - 1];
    // 5cm 未満の近い点は 1 つにまとめる（輪郭を切った後の近すぎる点があると、屋根の面を三角形に割れず欠ける）
    if (prev && Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) < 0.05) {
      continue;
    }
    cleaned.push([pt[0], pt[1]]);
  }
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (
    cleaned.length > 3 &&
    first &&
    last &&
    Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.05
  ) {
    cleaned.pop();
  }
  return cleaned.length >= 3 ? cleaned : FALLBACK_POLYGON.map(([x, z]) => [x, z]);
}

function computeFrontFrame(
  polygon: readonly [number, number][],
  facingAngleRad: number,
): FrontFrame {
  // Three.js の rotation.y = theta はローカル +Z を (sin θ, 0, cos θ)、+X を (cos θ, 0, -sin θ) へ写す
  const nx = Math.sin(facingAngleRad);
  const nz = Math.cos(facingAngleRad);
  const tx = Math.cos(facingAngleRad);
  const tz = -Math.sin(facingAngleRad);

  let maxW = -Infinity;
  const projected: { u: number; w: number }[] = [];
  for (const [x, z] of polygon) {
    const u = x * tx + z * tz;
    const w = x * nx + z * nz;
    projected.push({ u, w });
    if (w > maxW) maxW = w;
  }

  let frontWSum = 0;
  let frontWCount = 0;
  let minU = Infinity;
  let maxU = -Infinity;

  for (const p of projected) {
    if (p.w >= maxW - 0.5) {
      frontWSum += p.w;
      frontWCount += 1;
    }
    if (p.w >= maxW - 3.0) {
      if (p.u < minU) minU = p.u;
      if (p.u > maxU) maxU = p.u;
    }
  }

  const frontW = frontWCount > 0 ? frontWSum / frontWCount : maxW;
  if (!Number.isFinite(minU) || !Number.isFinite(maxU) || maxU - minU < 24) {
    minU = Infinity;
    maxU = -Infinity;
    for (const p of projected) {
      if (p.u < minU) minU = p.u;
      if (p.u > maxU) maxU = p.u;
    }
  }

  const midU = (minU + maxU) * 0.5;
  const frontSpan = Math.max(24, maxU - minU);

  return {
    facingAngleRad,
    originX: midU * tx + frontW * nx,
    originZ: midU * tz + frontW * nz,
    nx,
    nz,
    tx,
    tz,
    frontSpan,
  };
}

function clipPolygonByNormal(
  polygon: readonly [number, number][],
  originX: number,
  originZ: number,
  nx: number,
  nz: number,
  maxW: number,
): [number, number][] {
  const n = polygon.length;
  if (n < 3) return [];
  const out: [number, number][] = [];

  for (let i = 0; i < n; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];
    if (!curr || !next) continue;

    const wCurr = (curr[0] - originX) * nx + (curr[1] - originZ) * nz;
    const wNext = (next[0] - originX) * nx + (next[1] - originZ) * nz;
    const currIn = wCurr <= maxW;
    const nextIn = wNext <= maxW;

    if (currIn) {
      out.push([curr[0], curr[1]]);
    }
    if (currIn !== nextIn) {
      const denom = wNext - wCurr;
      const t = Math.abs(denom) > 1e-9 ? (maxW - wCurr) / denom : 0;
      const ix = curr[0] + (next[0] - curr[0]) * t;
      const iz = curr[1] + (next[1] - curr[1]) * t;
      out.push([ix, iz]);
    }
  }

  return out;
}

function toShapeInXZ(outer: readonly [number, number][]): THREE.Shape {
  const shapePts = outer.map(([x, z]) => new THREE.Vector2(x, -z));
  if (THREE.ShapeUtils.isClockWise(shapePts)) {
    shapePts.reverse();
  }
  return new THREE.Shape(shapePts);
}

function createExtrudedPolygonGeometry(
  polygon: readonly [number, number][],
  baseY: number,
  height: number,
): THREE.BufferGeometry {
  const shape = toShapeInXZ(polygon);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, baseY, 0);
  geo.computeVertexNormals();
  const lidGroup = geo.groups[0];
  if (lidGroup && lidGroup.count > 0) {
    return geo;
  }
  // 輪郭によっては ExtrudeGeometry が屋根と床の面を作らない（three r175 で、切り取った後の輪郭で再現）。
  // そのときは輪郭を自前で三角形に割り、屋根（上）と床（下）の面を足して組み直す
  return addLidsManually(geo, polygon, baseY, height);
}

function addLidsManually(
  wallGeo: THREE.BufferGeometry,
  polygon: readonly [number, number][],
  baseY: number,
  height: number,
): THREE.BufferGeometry {
  const pts2d = polygon.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = THREE.ShapeUtils.triangulateShape(pts2d, []);
  const lidPositions: number[] = [];
  const topY = baseY + height;
  for (const tri of tris) {
    const [a, b, c] = tri;
    if (a === undefined || b === undefined || c === undefined) continue;
    const pa = polygon[a];
    const pb = polygon[b];
    const pc = polygon[c];
    if (!pa || !pb || !pc) continue;
    // 上面は上向き（+Y）になるよう、xz 平面での向きに合わせて頂点の順を決める
    const cross = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
    const [p1, p2, p3] = cross < 0 ? [pa, pb, pc] : [pa, pc, pb];
    lidPositions.push(p1[0], topY, p1[1], p2[0], topY, p2[1], p3[0], topY, p3[1]);
    lidPositions.push(p1[0], baseY, p1[1], p3[0], baseY, p3[1], p2[0], baseY, p2[1]);
  }
  const wall = wallGeo.index ? wallGeo.toNonIndexed() : wallGeo;
  const wallPos = wall.getAttribute('position');
  const positions = new Float32Array(lidPositions.length + wallPos.count * 3);
  positions.set(lidPositions, 0);
  for (let i = 0; i < wallPos.count; i++) {
    positions[lidPositions.length + i * 3] = wallPos.getX(i);
    positions[lidPositions.length + i * 3 + 1] = wallPos.getY(i);
    positions[lidPositions.length + i * 3 + 2] = wallPos.getZ(i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.addGroup(0, lidPositions.length / 3, 0);
  out.addGroup(lidPositions.length / 3, wallPos.count, 1);
  out.computeVertexNormals();
  wallGeo.dispose();
  if (wall !== wallGeo) wall.dispose();
  return out;
}

interface CanopySpec {
  /** 根元（後端）の下面の高さ */
  baseY: number;
  frontWidth: number;
  backWidth: number;
  /** 後端（ローカル w = 0）から前端の中央までの張り出し */
  protrusion: number;
  /** 前端が後端より上がる高さ（前へ行くほど開く逆さ扇の傾き） */
  frontRise: number;
}

/**
 * 扇を逆さにしたような、ひだ（折板）付きコンクリート庇の立体ジオメトリ。
 * 根元は狭く低く、前端は広く高い。ローカル原点は後端の中央（+Z が正面の外向き）。
 * 折り目ごとに頂点を独立させてフラット法線を立て、ギザギザの陰影をはっきり見せる。
 */
function buildFoldedCanopyGeometry(spec: CanopySpec): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];

  type Vec3 = readonly [number, number, number];

  const pushTri = (a: Vec3, b: Vec3, c: Vec3): void => {
    const e1x = b[0] - a[0];
    const e1y = b[1] - a[1];
    const e1z = b[2] - a[2];
    const e2x = c[0] - a[0];
    const e2y = c[1] - a[1];
    const e2z = c[2] - a[2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-9) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = 0;
      ny = 1;
      nz = 0;
    }
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  };

  interface Station {
    u: number;
    w: number;
    yBot: number;
    yTop: number;
  }

  const backStations: Station[] = [];
  const frontStations: Station[] = [];
  const stripCount = CANOPY_FOLD_COUNT * 2;
  // ひだの深さと前端の反りは、庇の大きさに比例させる
  const scale = spec.frontWidth / CANOPY_REFERENCE_FRONT_WIDTH_M;
  const backAmplitude = 0.16 * scale;
  const frontAmplitude = 0.56 * scale;
  const frontCurve = 0.7 * scale;

  for (let i = 0; i <= stripCount; i++) {
    const s = (i / stripCount) * 2 - 1; // -1 .. +1
    const isPeak = i % 2 === 1;

    const bYBot = spec.baseY + (isPeak ? backAmplitude : 0);
    backStations.push({
      u: s * (spec.backWidth * 0.5),
      w: 0,
      yBot: bYBot,
      yTop: bYBot + CANOPY_THICKNESS_M,
    });

    const fYBot = spec.baseY + spec.frontRise + (isPeak ? frontAmplitude : 0);
    frontStations.push({
      u: s * (spec.frontWidth * 0.5),
      w: spec.protrusion - frontCurve * s * s,
      yBot: fYBot,
      yTop: fYBot + CANOPY_THICKNESS_M,
    });
  }

  for (let i = 0; i < stripCount; i++) {
    const b0 = backStations[i];
    const b1 = backStations[i + 1];
    const f0 = frontStations[i];
    const f1 = frontStations[i + 1];
    if (!b0 || !b1 || !f0 || !f1) continue;

    const blTop: Vec3 = [b0.u, b0.yTop, b0.w];
    const brTop: Vec3 = [b1.u, b1.yTop, b1.w];
    const flTop: Vec3 = [f0.u, f0.yTop, f0.w];
    const frTop: Vec3 = [f1.u, f1.yTop, f1.w];

    const blBot: Vec3 = [b0.u, b0.yBot, b0.w];
    const brBot: Vec3 = [b1.u, b1.yBot, b1.w];
    const flBot: Vec3 = [f0.u, f0.yBot, f0.w];
    const frBot: Vec3 = [f1.u, f1.yBot, f1.w];

    // 上面 (+Y)
    pushTri(blTop, flTop, frTop);
    pushTri(blTop, frTop, brTop);

    // 下面 (-Y)
    pushTri(blBot, frBot, flBot);
    pushTri(blBot, brBot, frBot);

    // 正面のギザギザ縁 (+Z)
    pushTri(flTop, flBot, frBot);
    pushTri(flTop, frBot, frTop);

    // 建物側の後端 (-Z)
    pushTri(blTop, brTop, brBot);
    pushTri(blTop, brBot, blBot);
  }

  // 左端 (-X)
  const firstB = backStations[0];
  const firstF = frontStations[0];
  if (firstB && firstF) {
    const blTop: Vec3 = [firstB.u, firstB.yTop, firstB.w];
    const blBot: Vec3 = [firstB.u, firstB.yBot, firstB.w];
    const flBot: Vec3 = [firstF.u, firstF.yBot, firstF.w];
    const flTop: Vec3 = [firstF.u, firstF.yTop, firstF.w];
    pushTri(blTop, blBot, flBot);
    pushTri(blTop, flBot, flTop);
  }

  // 右端 (+X)
  const lastB = backStations[stripCount];
  const lastF = frontStations[stripCount];
  if (lastB && lastF) {
    const brTop: Vec3 = [lastB.u, lastB.yTop, lastB.w];
    const brBot: Vec3 = [lastB.u, lastB.yBot, lastB.w];
    const frBot: Vec3 = [lastF.u, lastF.yBot, lastF.w];
    const frTop: Vec3 = [lastF.u, lastF.yTop, lastF.w];
    pushTri(brTop, frTop, frBot);
    pushTri(brTop, frBot, brBot);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export const buildLibrary: HeroBuilder = (ctx: HeroBuildContext): HeroBuildResult => {
  const group = new THREE.Group();
  group.name = 'hero-library';

  const gY = ctx.groundVisualY;
  const footBottomY = gY - SKIRT_DEPTH_M;
  const floor1Y = gY + TERRACE_HEIGHT_M;
  const bodyTopY = floor1Y + BODY_HEIGHT_M;

  const polygon = normalizePolygon(ctx.building.polygon);
  const frame = computeFrontFrame(polygon, FRONT_FACING_ANGLE_RAD);
  const halfSpan = frame.frontSpan * 0.5;

  // 正面の割り付け（ローカル u: -halfSpan = 正面の左端、+halfSpan = 右端）
  const leftTowerWidth = frame.frontSpan * LEFT_TOWER_SPAN_RATIO;
  const rightTowerWidth = frame.frontSpan * RIGHT_TOWER_SPAN_RATIO;
  const centerLeftU = -halfSpan + leftTowerWidth;
  const centerRightU = halfSpan - rightTowerWidth;
  const centerWidth = centerRightU - centerLeftU;
  const centerU = (centerLeftU + centerRightU) * 0.5;
  const pierHalfW = CENTER_PIER_WIDTH_M * 0.5;

  const clippedRaw = clipPolygonByNormal(
    polygon,
    frame.originX,
    frame.originZ,
    frame.nx,
    frame.nz,
    -CURTAIN_RECESS_M,
  );
  const clippedClean = clippedRaw.length >= 3 ? normalizePolygon(clippedRaw) : [];
  const clippedPoly = clippedClean.length >= 3 ? clippedClean : polygon;

  // --- 材質（同じ色は使い回す。roughness 0.6〜0.9、非金属の metalness 0〜0.1） ---
  const brickMat = new THREE.MeshStandardMaterial({
    color: COLORS.brick,
    roughness: 0.84,
    metalness: 0.04,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: COLORS.trim,
    roughness: 0.76,
    metalness: 0.03,
  });
  const upperWindowGlassMat = new THREE.MeshStandardMaterial({
    color: COLORS.upperWindowGlass,
    roughness: 0.62,
    metalness: 0.08,
  });
  const curtainGlassMat = new THREE.MeshStandardMaterial({
    color: COLORS.curtainGlass,
    roughness: 0.6,
    metalness: 0.1,
  });
  const mullionMat = new THREE.MeshStandardMaterial({
    color: COLORS.mullion,
    roughness: 0.62,
    metalness: 0.2,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: COLORS.canopy,
    roughness: 0.74,
    metalness: 0.03,
  });
  const stairStoneMat = new THREE.MeshStandardMaterial({
    color: COLORS.stairStone,
    roughness: 0.86,
    metalness: 0.02,
  });
  const retainingStoneMat = new THREE.MeshStandardMaterial({
    color: COLORS.retainingStone,
    roughness: 0.88,
    metalness: 0.02,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: COLORS.roof,
    roughness: 0.88,
    metalness: 0.02,
  });

  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();

  // --- 1. 本体（3 階建てのレンガ外壁＋陸屋根。正面 1 階の後退面までクリップして押し出し） ---
  // 写真ではレンガがテラス・地面まで下りていて、石積みの基壇の帯は無い。外壁は足元までレンガにする
  const mainBodyMesh = new THREE.Mesh(
    createExtrudedPolygonGeometry(clippedPoly, footBottomY, bodyTopY - footBottomY),
    [roofMat, brickMat],
  );
  mainBodyMesh.name = 'library-main-body';
  mainBodyMesh.castShadow = true;
  mainBodyMesh.receiveShadow = true;
  group.add(mainBodyMesh);

  // 床の高さの白い横線は写真の塔・袖に無いので回さない（白い線は中央の窓の帯まわりだけ。5. で作る）

  // --- 正面構成グループ（ローカル +X = 正面右、+Y = 上、+Z = 正面外向き） ---
  const frontGroup = new THREE.Group();
  frontGroup.name = 'library-front-assembly';
  frontGroup.position.set(frame.originX, 0, frame.originZ);
  frontGroup.rotation.y = frame.facingAngleRad;
  group.add(frontGroup);

  // --- 2. 入口のテラス（大階段を上がりきった床。中央の引っ込みの前だけ。塔の下は塔のレンガ） ---
  const terraceH = floor1Y - footBottomY;
  const terraceDepth = CURTAIN_RECESS_M + TOWER_PROTRUSION_M;
  const terraceMesh = new THREE.Mesh(
    new THREE.BoxGeometry(centerWidth, terraceH, terraceDepth),
    stairStoneMat,
  );
  terraceMesh.name = 'library-entrance-terrace';
  terraceMesh.position.set(
    centerU,
    footBottomY + terraceH * 0.5,
    (TOWER_PROTRUSION_M - CURTAIN_RECESS_M) * 0.5,
  );
  terraceMesh.castShadow = true;
  terraceMesh.receiveShadow = true;
  frontGroup.add(terraceMesh);

  // --- 3. 左右の塔（正面から 4m 出る窓の無いレンガの箱。右の塔が広く、少し高い。足元まで地面に下ろす） ---
  const towerMats = [brickMat, brickMat, roofMat, brickMat, brickMat, brickMat];
  const towerDepth = TOWER_BACK_DEPTH_M + TOWER_PROTRUSION_M;
  const towerCenterW = (TOWER_PROTRUSION_M - TOWER_BACK_DEPTH_M) * 0.5;
  const towerSpecs = [
    {
      name: 'library-tower-left',
      width: leftTowerWidth,
      centerU: -halfSpan + leftTowerWidth * 0.5,
      topY: bodyTopY + LEFT_TOWER_EXTRA_HEIGHT_M,
    },
    {
      name: 'library-tower-right',
      width: rightTowerWidth,
      centerU: halfSpan - rightTowerWidth * 0.5,
      topY: bodyTopY + RIGHT_TOWER_EXTRA_HEIGHT_M,
    },
  ];
  for (const spec of towerSpecs) {
    const towerH = spec.topY - footBottomY;
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width, towerH, towerDepth),
      towerMats,
    );
    tower.name = spec.name;
    tower.position.set(spec.centerU, footBottomY + towerH * 0.5, towerCenterW);
    tower.castShadow = true;
    tower.receiveShadow = true;
    frontGroup.add(tower);
  }

  // --- 4. 中央の上部（カーテンウォールの上の張り出し。下面は白い軒天） ---
  const overhangBottomY = floor1Y + CURTAIN_HEIGHT_M;
  const overhangH = bodyTopY - overhangBottomY;
  const overhangMesh = new THREE.Mesh(
    new THREE.BoxGeometry(centerWidth, overhangH, CURTAIN_RECESS_M),
    [brickMat, brickMat, roofMat, trimMat, brickMat, brickMat],
  );
  overhangMesh.name = 'library-upper-overhang';
  overhangMesh.position.set(centerU, overhangBottomY + overhangH * 0.5, -CURTAIN_RECESS_M * 0.5);
  overhangMesh.castShadow = true;
  overhangMesh.receiveShadow = true;
  frontGroup.add(overhangMesh);

  // 中央の縦の柱（テラスからパラペットの少し下まで。窓の帯とカーテンウォールを左右に分ける）
  const pierDepth = CURTAIN_RECESS_M + CENTER_PIER_PROUD_M;
  const centerPier = new THREE.Mesh(
    new THREE.BoxGeometry(CENTER_PIER_WIDTH_M, CENTER_PIER_HEIGHT_M, pierDepth),
    brickMat,
  );
  centerPier.name = 'library-center-pier';
  centerPier.position.set(
    centerU,
    floor1Y + CENTER_PIER_HEIGHT_M * 0.5,
    CENTER_PIER_PROUD_M - pierDepth * 0.5,
  );
  centerPier.castShadow = true;
  centerPier.receiveShadow = true;
  frontGroup.add(centerPier);

  // --- 5. 3 階の横長窓の帯（1 段だけ、柱で左右 2 本）と白い帯（梁・水切り・窓上の帯） ---
  const bays = [
    { u0: centerLeftU, u1: centerU - pierHalfW },
    { u0: centerU + pierHalfW, u1: centerRightU },
  ];
  const sillCenterY = floor1Y + UPPER_SILL_BOTTOM_M + UPPER_SILL_HEIGHT_M * 0.5;
  const windowCenterY =
    floor1Y + UPPER_SILL_BOTTOM_M + UPPER_SILL_HEIGHT_M + UPPER_WINDOW_HEIGHT_M * 0.5;
  const headCenterY =
    floor1Y +
    UPPER_SILL_BOTTOM_M +
    UPPER_SILL_HEIGHT_M +
    UPPER_WINDOW_HEIGHT_M +
    UPPER_HEAD_HEIGHT_M * 0.5;
  const trimBands = [
    { centerY: overhangBottomY + BEAM_HEIGHT_M * 0.5, height: BEAM_HEIGHT_M },
    { centerY: sillCenterY, height: UPPER_SILL_HEIGHT_M },
    { centerY: headCenterY, height: UPPER_HEAD_HEIGHT_M },
  ];

  const windowGlassMesh = new THREE.InstancedMesh(unitBoxGeo, upperWindowGlassMat, bays.length);
  windowGlassMesh.name = 'library-upper-windows-glass';
  windowGlassMesh.castShadow = false;
  windowGlassMesh.receiveShadow = false;

  const trimMesh = new THREE.InstancedMesh(unitBoxGeo, trimMat, bays.length * trimBands.length);
  trimMesh.name = 'library-center-trim-bands';
  trimMesh.castShadow = false;
  trimMesh.receiveShadow = true;

  let glassIdx = 0;
  let trimIdx = 0;
  for (const bay of bays) {
    const bayW = bay.u1 - bay.u0;
    const bayU = (bay.u0 + bay.u1) * 0.5;
    dummy.position.set(bayU, windowCenterY, 0.04);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(Math.max(0.5, bayW - 0.1), UPPER_WINDOW_HEIGHT_M, 0.12);
    dummy.updateMatrix();
    windowGlassMesh.setMatrixAt(glassIdx, dummy.matrix);
    glassIdx += 1;

    for (const band of trimBands) {
      // 正面の面（w = 0）の少し奥から TRIM_PROUD_M だけ前へ出す。柱（0.3m 出る）より手前には出さない
      dummy.position.set(bayU, band.centerY, TRIM_PROUD_M * 0.5 - 0.1);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(bayW, band.height, TRIM_PROUD_M + 0.2);
      dummy.updateMatrix();
      trimMesh.setMatrixAt(trimIdx, dummy.matrix);
      trimIdx += 1;
    }
  }
  windowGlassMesh.instanceMatrix.needsUpdate = true;
  windowGlassMesh.computeBoundingBox();
  windowGlassMesh.computeBoundingSphere();
  frontGroup.add(windowGlassMesh);

  trimMesh.instanceMatrix.needsUpdate = true;
  trimMesh.computeBoundingBox();
  trimMesh.computeBoundingSphere();
  frontGroup.add(trimMesh);

  // --- 6. 中央 1・2 階: 正面から 3m 引っ込んだ 2 層分のガラスのカーテンウォール＋格子の方立て ---
  const curtainW = Math.max(6, centerWidth - 0.1);
  const curtainGlassMesh = new THREE.Mesh(
    new THREE.BoxGeometry(curtainW, CURTAIN_HEIGHT_M, 0.16),
    curtainGlassMat,
  );
  curtainGlassMesh.name = 'library-curtain-wall-glass';
  curtainGlassMesh.position.set(
    centerU,
    floor1Y + CURTAIN_HEIGHT_M * 0.5,
    -CURTAIN_RECESS_M + 0.08,
  );
  curtainGlassMesh.castShadow = false;
  curtainGlassMesh.receiveShadow = true;
  frontGroup.add(curtainGlassMesh);

  const verticalMullionCount = Math.max(2, Math.floor(curtainW / CURTAIN_MULLION_STEP_M) + 1);
  const transomCount = CURTAIN_TRANSOM_ROWS + 1;
  const totalMullions = verticalMullionCount + transomCount;
  const mullionMesh = new THREE.InstancedMesh(unitBoxGeo, mullionMat, totalMullions);
  mullionMesh.name = 'library-curtain-wall-mullions';
  mullionMesh.castShadow = false;
  mullionMesh.receiveShadow = false;

  const mullionZ = -CURTAIN_RECESS_M + 0.18;
  let mIdx = 0;
  for (let i = 0; i < verticalMullionCount; i++) {
    const t = verticalMullionCount > 1 ? i / (verticalMullionCount - 1) : 0.5;
    const u = centerU + (t - 0.5) * (curtainW - 0.16);
    dummy.position.set(u, floor1Y + CURTAIN_HEIGHT_M * 0.5, mullionZ);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.12, CURTAIN_HEIGHT_M, 0.14);
    dummy.updateMatrix();
    mullionMesh.setMatrixAt(mIdx, dummy.matrix);
    mIdx += 1;
  }
  for (let i = 0; i < transomCount; i++) {
    const ty = 0.08 + (i / CURTAIN_TRANSOM_ROWS) * (CURTAIN_HEIGHT_M - 0.16);
    dummy.position.set(centerU, floor1Y + ty, mullionZ);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(curtainW, 0.12, 0.12);
    dummy.updateMatrix();
    mullionMesh.setMatrixAt(mIdx, dummy.matrix);
    mIdx += 1;
  }
  mullionMesh.instanceMatrix.needsUpdate = true;
  mullionMesh.computeBoundingBox();
  mullionMesh.computeBoundingSphere();
  frontGroup.add(mullionMesh);

  // --- 7. 入口の庇（逆さ扇・折板の白いコンクリート庇。柱は無く、カーテンウォールから片持ち） ---
  const canopyFrontWidth = centerWidth * CANOPY_FRONT_WIDTH_RATIO;
  const canopyBackWidth = canopyFrontWidth * CANOPY_BACK_WIDTH_RATIO;
  const canopyU = centerU + centerWidth * CANOPY_OFFSET_RATIO;
  const canopyBaseY = floor1Y + CANOPY_BACK_ELEVATION_M;
  const canopyMesh = new THREE.Mesh(
    buildFoldedCanopyGeometry({
      baseY: canopyBaseY,
      frontWidth: canopyFrontWidth,
      backWidth: canopyBackWidth,
      protrusion: canopyFrontWidth * CANOPY_PROTRUSION_RATIO,
      frontRise: CANOPY_FRONT_RISE_M,
    }),
    canopyMat,
  );
  canopyMesh.name = 'library-entrance-canopy';
  canopyMesh.position.set(canopyU, 0, 0);
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;
  frontGroup.add(canopyMesh);

  // 折板庇の根元をカーテンウォールへつなぐ片持ちの接続スラブ
  const canopyNeckDepth = CURTAIN_RECESS_M - 0.16;
  const canopyNeck = new THREE.Mesh(
    new THREE.BoxGeometry(canopyBackWidth, 0.34, canopyNeckDepth),
    canopyMat,
  );
  canopyNeck.name = 'library-entrance-canopy-neck';
  canopyNeck.position.set(canopyU, canopyBaseY + 0.17, -canopyNeckDepth * 0.5);
  canopyNeck.castShadow = false;
  canopyNeck.receiveShadow = true;
  frontGroup.add(canopyNeck);

  // --- 8. 2 段構えの大階段（InstancedMesh）＋踊り場。中央の引っ込みの正面に置く ---
  const upperFlightStartW = TOWER_PROTRUSION_M; // 入口テラス前端
  const upperFlightEndW = upperFlightStartW + STAIR_UPPER_DEPTH_M;
  const landingEndW = upperFlightEndW + STAIR_LANDING_DEPTH_M;
  const lowerFlightEndW = landingEndW + STAIR_LOWER_DEPTH_M;

  const totalSteps = STAIR_STEPS_PER_FLIGHT * 2;
  const stairsMesh = new THREE.InstancedMesh(unitBoxGeo, stairStoneMat, totalSteps);
  stairsMesh.name = 'library-grand-stairs';
  stairsMesh.castShadow = true;
  stairsMesh.receiveShadow = true;

  let stepIdx = 0;

  // 下の段（幅 40m・奥行 8m・高さ 2.4m）
  const lowerTread = STAIR_LOWER_DEPTH_M / STAIR_STEPS_PER_FLIGHT;
  const lowerRiser = STAIR_LOWER_HEIGHT_M / (STAIR_STEPS_PER_FLIGHT + 1);
  for (let i = 0; i < STAIR_STEPS_PER_FLIGHT; i++) {
    const stepTopY = gY + (i + 1) * lowerRiser;
    const stepH = stepTopY - footBottomY;
    const frontW = lowerFlightEndW - i * lowerTread;
    const depth = lowerTread + 0.02;
    dummy.position.set(centerU, footBottomY + stepH * 0.5, frontW - depth * 0.5);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(STAIR_LOWER_WIDTH_M, stepH, depth);
    dummy.updateMatrix();
    stairsMesh.setMatrixAt(stepIdx, dummy.matrix);
    stepIdx += 1;
  }

  // 上の段（幅 26m・奥行 7m・高さ 2.4m）
  const upperTread = STAIR_UPPER_DEPTH_M / STAIR_STEPS_PER_FLIGHT;
  const upperRiser = STAIR_UPPER_HEIGHT_M / (STAIR_STEPS_PER_FLIGHT + 1);
  for (let i = 0; i < STAIR_STEPS_PER_FLIGHT; i++) {
    const stepTopY = gY + STAIR_LOWER_HEIGHT_M + (i + 1) * upperRiser;
    const stepH = stepTopY - footBottomY;
    const frontW = upperFlightEndW - i * upperTread;
    const depth = upperTread + 0.02;
    dummy.position.set(centerU, footBottomY + stepH * 0.5, frontW - depth * 0.5);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(STAIR_UPPER_WIDTH_M, stepH, depth);
    dummy.updateMatrix();
    stairsMesh.setMatrixAt(stepIdx, dummy.matrix);
    stepIdx += 1;
  }

  stairsMesh.instanceMatrix.needsUpdate = true;
  stairsMesh.computeBoundingBox();
  stairsMesh.computeBoundingSphere();
  frontGroup.add(stairsMesh);

  // 踊り場（幅 40m・奥行 4m・高さ 2.4m）
  const landingH = STAIR_LOWER_HEIGHT_M + SKIRT_DEPTH_M;
  const landingMesh = new THREE.Mesh(
    new THREE.BoxGeometry(STAIR_LOWER_WIDTH_M, landingH, STAIR_LANDING_DEPTH_M + 0.04),
    stairStoneMat,
  );
  landingMesh.name = 'library-stair-landing';
  landingMesh.position.set(
    centerU,
    footBottomY + landingH * 0.5,
    (upperFlightEndW + landingEndW) * 0.5,
  );
  landingMesh.castShadow = true;
  landingMesh.receiveShadow = true;
  frontGroup.add(landingMesh);

  // --- 9. 階段の左右: 石積みの擁壁（高さ 2.4〜4.8m の段々の壁。石積みはここだけ） ---
  interface WallSpec {
    uMin: number;
    uMax: number;
    wMin: number;
    wMax: number;
    topOffsetFromGround: number;
  }

  const upperHalfW = STAIR_UPPER_WIDTH_M * 0.5; // 13.0
  const lowerHalfW = STAIR_LOWER_WIDTH_M * 0.5; // 20.0
  const outerWallThickness = 2.0;
  const innerCheekThickness = 1.6;
  const upperMidW = (upperFlightStartW + upperFlightEndW) * 0.5;
  const lowerMidW = (landingEndW + lowerFlightEndW) * 0.5;

  const oneSideWalls: WallSpec[] = [
    // 上段脇の内側袖壁（4.8m -> 3.8m）
    {
      uMin: upperHalfW,
      uMax: upperHalfW + innerCheekThickness,
      wMin: upperFlightStartW,
      wMax: upperMidW,
      topOffsetFromGround: 4.8,
    },
    {
      uMin: upperHalfW,
      uMax: upperHalfW + innerCheekThickness,
      wMin: upperMidW,
      wMax: upperFlightEndW,
      topOffsetFromGround: 3.8,
    },
    // 上段と外側擁壁をつなぐ段状テラス擁壁（高さ 3.4m）
    {
      uMin: upperHalfW + innerCheekThickness,
      uMax: lowerHalfW,
      wMin: upperFlightStartW,
      wMax: upperFlightEndW,
      topOffsetFromGround: 3.4,
    },
    // 外側の段々擁壁（奥 4.8m -> 4.0m -> 踊り場脇 3.4m -> 下段奥 2.9m -> 下段前 2.4m）
    {
      uMin: lowerHalfW,
      uMax: lowerHalfW + outerWallThickness,
      wMin: upperFlightStartW,
      wMax: upperMidW,
      topOffsetFromGround: 4.8,
    },
    {
      uMin: lowerHalfW,
      uMax: lowerHalfW + outerWallThickness,
      wMin: upperMidW,
      wMax: upperFlightEndW,
      topOffsetFromGround: 4.0,
    },
    {
      uMin: lowerHalfW,
      uMax: lowerHalfW + outerWallThickness,
      wMin: upperFlightEndW,
      wMax: landingEndW,
      topOffsetFromGround: 3.4,
    },
    {
      uMin: lowerHalfW,
      uMax: lowerHalfW + outerWallThickness,
      wMin: landingEndW,
      wMax: lowerMidW,
      topOffsetFromGround: 2.9,
    },
    {
      uMin: lowerHalfW,
      uMax: lowerHalfW + outerWallThickness,
      wMin: lowerMidW,
      wMax: lowerFlightEndW,
      topOffsetFromGround: 2.4,
    },
  ];

  const retainingWallsMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    retainingStoneMat,
    oneSideWalls.length * 2,
  );
  retainingWallsMesh.name = 'library-retaining-walls';
  retainingWallsMesh.castShadow = true;
  retainingWallsMesh.receiveShadow = true;

  let wallIdx = 0;
  for (const side of [-1, 1] as const) {
    for (const w of oneSideWalls) {
      const width = w.uMax - w.uMin;
      const depth = w.wMax - w.wMin;
      const topY = gY + w.topOffsetFromGround;
      const height = topY - footBottomY;
      const wallU = centerU + side * ((w.uMin + w.uMax) * 0.5);
      const wallW = (w.wMin + w.wMax) * 0.5;
      dummy.position.set(wallU, footBottomY + height * 0.5, wallW);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(width, height, depth);
      dummy.updateMatrix();
      retainingWallsMesh.setMatrixAt(wallIdx, dummy.matrix);
      wallIdx += 1;
    }
  }
  retainingWallsMesh.instanceMatrix.needsUpdate = true;
  retainingWallsMesh.computeBoundingBox();
  retainingWallsMesh.computeBoundingSphere();
  frontGroup.add(retainingWallsMesh);

  // 陸屋根の上には物を置かない（屋上中央の明かり取りの箱は写真に無いため作らない）

  return {
    group,
    primaryMaterials: [
      { mat: brickMat, baseHex: COLORS.brick },
      { mat: curtainGlassMat, baseHex: COLORS.curtainGlass },
    ],
    animated: [],
  };
};
