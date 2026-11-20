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

/**
 * 本体・塔・テラス・擁壁・段の底を、輪郭と階段まわりで引いた地面のいちばん低い所からさらに下ろす深さ (m)。
 * どこから見ても足元が浮かないようにする
 */
const FOOTING_BELOW_LOWEST_GROUND_M = 0.5;

/**
 * 入口のテラス（1 階の床）を、正面の壁の前の地面（と groundVisualY の大きい方）より上げる高さ (m)。
 * 写真（Wikimedia Commons の正面 2 枚）では、大階段は道から 1 階分ほど上がり、上がりきったテラスは
 * 建物の前の地面とほぼ同じ高さ（右手の植え込みの斜面がテラスの高さまで上がっている）。
 * 階段の高さは「テラス − 階段の下端の地面」で決まり、斜面の下り分を階段が受け持つ
 */
const TERRACE_ABOVE_GROUND_M = 0.6;

/** 段の高さの目安（0.15〜0.2m）。総高をこの範囲の段に割る */
const STAIR_RISER_MAX_M = 0.2;
const STAIR_RISER_MIN_M = 0.15;
/** 段の数がこれ以下（総高 1.6m 以下）なら踊り場の無い 1 段構えにする */
const SINGLE_FLIGHT_MAX_RISERS = 8;
/** 1 段構えのときの踏み面の奥行き */
const SINGLE_FLIGHT_TREAD_M = 0.4;
/** 擁壁の段々の高さを決めたときの、1 つの段の高さ（写真から作った 1 回目の 2.4m）。擁壁はこれとの比で伸び縮みさせる */
const WALL_REFERENCE_FLIGHT_HEIGHT_M = 2.4;

/**
 * 本体 3 階建ての階高・総高と、左右の塔の高さ。
 * 写真では屋根の線が塔で一段上がり、右の塔は左より少し高い（左 +1.5m、右 +2.5m）。
 * 地面が平らなとき、最高部（右の塔）は groundVisualY + 0.6 + 14.4 + 2.5 = groundVisualY + 17.5m。
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

/** 2 段構えの大階段（下の段が広く、上の段が狭い）。段の数・踏み面・踊り場の長さは総高と総延長から決める */
const STAIR_UPPER_WIDTH_M = 26.0;
const STAIR_LOWER_WIDTH_M = 40.0;
/** 踏み面の奥行きの上限と、2 段構えの踊り場の最短の長さ。余った長さは水平な踊り場が受け持つ */
const STAIR_TREAD_MAX_M = 0.55;
const STAIR_TREAD_MIN_M = 0.25;
const STAIR_LANDING_MIN_M = 4.0;
/** 輪郭の辺の上で地面を引く間隔（地形の格子は約 8.5m おき） */
const OUTLINE_SAMPLE_STEP_M = 4.0;

/**
 * OSM に載っている総合図書館の大階段（steps の道 path_423060514）の上端（入口の前）と下端。
 * 下端はメインストリート（OSM の道 path_423060527）の中心線上の点（道と共有の点）。
 * 大階段の中心線をこの線に合わせ、下端の段をメインストリートの北の縁まで延ばす
 */
const OSM_STAIR_TOP: readonly [number, number] = [-52.9, 94.4];
const OSM_STAIR_BOTTOM: readonly [number, number] = [-69.4, 123.8];
/** 大階段の前のメインストリートの中心線（OSM の道 path_423060527 の一部）と、道の幅（4.2m）の半分 */
const MAIN_STREET_CENTERLINE: readonly (readonly [number, number])[] = [
  [-111.2, 120.4],
  [-89.7, 122.1],
  [-69.4, 123.8],
  [-50.2, 124.5],
  [-33.3, 126.5],
  [-19.2, 123.4],
];
const MAIN_STREET_HALF_WIDTH_M = 2.1;
/** 段・踊り場の前端を道の縁から道の側へかぶせる量（道との間にすき間を作らない） */
const STREET_OVERLAP_M = 0.15;
/** OSM の線がこの建物の正面から大きく外れているとき（別の輪郭）は、中央の引っ込みの正面に置く従来の割り付けにする */
const OSM_STAIR_MAX_LATERAL_OFFSET_M = 15;
const FALLBACK_STAIR_FOOT_W = 23;

interface StairStep {
  /** 段の上面の高さ */
  topY: number;
  /** 段の前端（道寄り）の、正面からの距離 w */
  frontW: number;
  depth: number;
  width: number;
}

interface StairPlan {
  steps: StairStep[];
  /** 踊り場（1 段構え・段なしのときはテラスの高さの平らな床）の範囲と上面 */
  landingStartW: number;
  landingEndW: number;
  landingWidth: number;
  landingY: number;
  /** 擁壁の段々を合わせる基準（2 段構えなら踊り場の高さと上の段の高さ。それ以外は テラスの高さと 0） */
  wallBaseY: number;
  wallUpperRise: number;
}

/**
 * 階段の上端 w.top（テラスの高さ terraceY）から下端 w.foot（地面 footY）までを、0.15〜0.2m の段に割る。
 * 段が 8 つを超えれば上の段・水平な踊り場・下の段の 2 段構え（段の数は上下でほぼ半分ずつ。
 * 踏み面は STAIR_TREAD_MAX_M までにして、余った長さを踊り場にする）。以下なら道寄りに段を寄せた 1 段構えにする
 */
function planGrandStairs(
  footY: number,
  terraceY: number,
  w: { top: number; foot: number },
): StairPlan {
  const rise = terraceY - footY;
  const riserCount = rise >= STAIR_RISER_MIN_M ? Math.ceil(rise / STAIR_RISER_MAX_M - 1e-6) : 0;
  const run = Math.max(0, w.foot - w.top);

  if (riserCount > SINGLE_FLIGHT_MAX_RISERS) {
    const riser = rise / riserCount;
    const upperRisers = Math.floor(riserCount / 2);
    const lowerRisers = riserCount - upperRisers;
    const treadCount = riserCount - 2;
    const tread = Math.max(
      STAIR_TREAD_MIN_M,
      Math.min(STAIR_TREAD_MAX_M, (run - STAIR_LANDING_MIN_M) / treadCount),
    );
    const upperEndW = w.top + (upperRisers - 1) * tread;
    const landingEndW = Math.max(upperEndW + 0.5, w.foot - (lowerRisers - 1) * tread);
    const landingY = footY + lowerRisers * riser;
    const steps: StairStep[] = [];

    for (let i = 0; i < upperRisers - 1; i++) {
      steps.push({
        topY: terraceY - (i + 1) * riser,
        frontW: w.top + (i + 1) * tread,
        depth: tread + 0.02,
        width: STAIR_UPPER_WIDTH_M,
      });
    }
    for (let i = 0; i < lowerRisers - 1; i++) {
      steps.push({
        topY: landingY - (i + 1) * riser,
        frontW: landingEndW + (i + 1) * tread,
        depth: tread + 0.02,
        width: STAIR_LOWER_WIDTH_M,
      });
    }
    return {
      steps,
      landingStartW: upperEndW,
      landingEndW,
      landingWidth: STAIR_LOWER_WIDTH_M,
      landingY,
      wallBaseY: landingY,
      wallUpperRise: terraceY - landingY,
    };
  }

  const steps: StairStep[] = [];
  if (riserCount > 0) {
    const riser = rise / riserCount;
    for (let i = 0; i < riserCount - 1; i++) {
      steps.push({
        topY: footY + (i + 1) * riser,
        frontW: w.foot - i * SINGLE_FLIGHT_TREAD_M,
        depth: SINGLE_FLIGHT_TREAD_M + 0.02,
        width: STAIR_LOWER_WIDTH_M,
      });
    }
  }
  const stepsDepth = Math.max(0, riserCount - 1) * SINGLE_FLIGHT_TREAD_M;
  return {
    steps,
    landingStartW: w.top,
    landingEndW: Math.max(w.top + 0.1, w.foot - stepsDepth),
    landingWidth: STAIR_LOWER_WIDTH_M,
    landingY: terraceY,
    wallBaseY: terraceY,
    wallUpperRise: 0,
  };
}

/**
 * 天端が傾いた壁（長さ方向 +X に length、厚み方向 +Z に thickness、底は bottomY、天端は x = 0 で topStartY・
 * x = length で topEndY）の 6 面の立体。8 つの頂点から 12 枚の三角形を直に組む。
 * three r175 の ExtrudeGeometry が蓋（この壁の大きな 2 面）を作らなかったころに作った物だが、押し出しに蓋を
 * 足した物ではなく、これだけで閉じた立体なので面は重ならない（r176 でも組み直さずに残す）
 */
function buildSlopedWallGeometry(
  length: number,
  bottomY: number,
  topStartY: number,
  topEndY: number,
  thickness: number,
): THREE.BufferGeometry {
  type V = readonly [number, number, number];
  const a0: V = [0, bottomY, 0];
  const b0: V = [length, bottomY, 0];
  const b1: V = [length, topEndY, 0];
  const a1: V = [0, topStartY, 0];
  const a0i: V = [0, bottomY, thickness];
  const b0i: V = [length, bottomY, thickness];
  const b1i: V = [length, topEndY, thickness];
  const a1i: V = [0, topStartY, thickness];
  // どの三角形も外向きの面が表になる順（-Z 面・+Z 面・天端・底・x = 0 の端・x = length の端）
  const tris: V[] = [
    a0, a1, b0, b0, a1, b1,
    a0i, b0i, a1i, b0i, b1i, a1i,
    a1, a1i, b1, b1, a1i, b1i,
    a0, b0, a0i, b0, b0i, a0i,
    a0, a0i, a1, a1, a0i, a1i,
    b0, b1, b0i, b1, b1i, b0i,
  ];
  const positions = new Float32Array(tris.length * 3);
  tris.forEach((v, i) => positions.set(v, i * 3));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/** 点 (x, z) からメインストリートの中心線（折れ線）までの距離 */
function distanceToMainStreet(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < MAIN_STREET_CENTERLINE.length; i++) {
    const a = MAIN_STREET_CENTERLINE[i];
    const b = MAIN_STREET_CENTERLINE[i + 1];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
  }
  return best;
}

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
  return geo;
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
  const sampleGround = ctx.sampleGroundVisualY;

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

  const upperHalfW = STAIR_UPPER_WIDTH_M * 0.5; // 13.0
  const lowerHalfW = STAIR_LOWER_WIDTH_M * 0.5; // 20.0
  const outerWallThickness = 2.0;
  const innerCheekThickness = 1.6;

  // --- 正面のローカル座標 (u, w) とワールド (x, z) の変換と、地面の高さ ---
  const toWorldX = (u: number, w: number): number =>
    frame.originX + u * frame.tx + w * frame.nx;
  const toWorldZ = (u: number, w: number): number =>
    frame.originZ + u * frame.tz + w * frame.nz;
  const toLocal = (x: number, z: number): [number, number] => {
    const dx = x - frame.originX;
    const dz = z - frame.originZ;
    return [dx * frame.tx + dz * frame.tz, dx * frame.nx + dz * frame.nz];
  };
  const groundAt = (u: number, w: number): number => sampleGround(toWorldX(u, w), toWorldZ(u, w));

  // --- 大階段の割り付け（正面からの距離 w。テラスの前端 → 上端の床 → 上の段 → 踊り場 → 下の段 → 道の縁） ---
  // 中心線と上端は OSM の steps の線に合わせ、下端の段はその線がメインストリートの北の縁に当たる所まで延ばす
  const [osmTopU, osmTopW] = toLocal(OSM_STAIR_TOP[0], OSM_STAIR_TOP[1]);
  const [osmBottomU] = toLocal(OSM_STAIR_BOTTOM[0], OSM_STAIR_BOTTOM[1]);
  const osmAxisU = (osmTopU + osmBottomU) * 0.5;
  const useOsmStairs = Math.abs(osmAxisU - centerU) <= OSM_STAIR_MAX_LATERAL_OFFSET_M;
  const stairAxisU = useOsmStairs ? osmAxisU : centerU;
  const stairTopW = useOsmStairs ? Math.max(TOWER_PROTRUSION_M, osmTopW) : TOWER_PROTRUSION_M;

  /** u の線の上で、正面から道の側へ進んで最初にメインストリートの縁に当たる w（当たらなければ Infinity） */
  const streetEdgeW = (u: number): number => {
    const inStreet = (w: number): boolean =>
      distanceToMainStreet(toWorldX(u, w), toWorldZ(u, w)) <= MAIN_STREET_HALF_WIDTH_M;
    if (inStreet(stairTopW)) return stairTopW;
    let prev = stairTopW;
    for (let w = stairTopW + 0.5; w <= stairTopW + 80; w += 0.5) {
      if (inStreet(w)) {
        let lo = prev;
        let hi = w;
        for (let k = 0; k < 20; k++) {
          const mid = (lo + hi) * 0.5;
          if (inStreet(mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prev = w;
    }
    return Infinity;
  };
  const axisStreetW = useOsmStairs ? streetEdgeW(stairAxisU) : Infinity;
  const stairFootW = Number.isFinite(axisStreetW)
    ? axisStreetW + STREET_OVERLAP_M
    : FALLBACK_STAIR_FOOT_W;

  /**
   * 前端が frontW の段・床（u の範囲 [uMin, uMax]）を、道の縁（＋かぶせ量）より道の側へ出ない範囲に切り詰める。
   * 道は正面に対して斜めに通るので、道に近い側の端だけが削られる（全部が道の上なら null）
   */
  const clipToStreet = (uMin: number, uMax: number, frontW: number): [number, number] | null => {
    const fits = (u: number): boolean => streetEdgeW(u) + STREET_OVERLAP_M >= frontW - 1e-6;
    const fitsMin = fits(uMin);
    const fitsMax = fits(uMax);
    if (fitsMin && fitsMax) return [uMin, uMax];
    if (!fitsMin && !fitsMax) return null;
    let good = fitsMin ? uMin : uMax;
    let bad = fitsMin ? uMax : uMin;
    for (let k = 0; k < 24; k++) {
      const mid = (good + bad) * 0.5;
      if (fits(mid)) good = mid;
      else bad = mid;
    }
    return fitsMin ? [uMin, good] : [good, uMax];
  };

  // 階段の下端: 下端の段の前の線（道で切り詰めた範囲）に沿って引いた地面のいちばん低い所。
  // 横に傾いた斜面でも、どこにも段の前の段差（浮き）が出ない（高い側は段が地面に入る）
  const footSpan = clipToStreet(stairAxisU - lowerHalfW, stairAxisU + lowerHalfW, stairFootW) ?? [
    stairAxisU - 0.5,
    stairAxisU + 0.5,
  ];
  const footSampleCount = 9;
  let stairFootY = Infinity;
  for (let i = 0; i < footSampleCount; i++) {
    const u = footSpan[0] + ((footSpan[1] - footSpan[0]) * i) / (footSampleCount - 1);
    stairFootY = Math.min(stairFootY, groundAt(u, stairFootW));
  }

  // 入口のテラス: 正面の壁の前（中央の引っ込みの前、壁の面〜テラスの前端）の地面と groundVisualY の大きい方から上げる
  let frontGroundY = -Infinity;
  for (const u of [centerLeftU, centerU, centerRightU]) {
    for (const w of [0, TOWER_PROTRUSION_M]) {
      frontGroundY = Math.max(frontGroundY, groundAt(u, w));
    }
  }
  const floor1Y = Math.max(frontGroundY, gY) + TERRACE_ABOVE_GROUND_M;
  const bodyTopY = floor1Y + BODY_HEIGHT_M;

  // 底: 輪郭の各点（辺の上も OUTLINE_SAMPLE_STEP_M おき）と、テラス・階段・擁壁の範囲で引いた地面の
  // いちばん低い所より FOOTING_BELOW_LOWEST_GROUND_M 下
  let lowestGroundY = Math.min(stairFootY, frontGroundY);
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    const segments = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / OUTLINE_SAMPLE_STEP_M));
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      lowestGroundY = Math.min(
        lowestGroundY,
        sampleGround(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t),
      );
    }
  }
  // 階段・擁壁の範囲（道の上は除く）
  const stairOuterHalfW = lowerHalfW + outerWallThickness;
  const stairGridU = 9;
  const stairGridW = 13;
  for (let iu = 0; iu < stairGridU; iu++) {
    const u = stairAxisU - stairOuterHalfW + (stairOuterHalfW * 2 * iu) / (stairGridU - 1);
    const edgeW = streetEdgeW(u) + STREET_OVERLAP_M;
    for (let iw = 0; iw < stairGridW; iw++) {
      const w = -CURTAIN_RECESS_M + ((stairFootW + CURTAIN_RECESS_M) * iw) / (stairGridW - 1);
      if (w > edgeW) continue;
      lowestGroundY = Math.min(lowestGroundY, groundAt(u, w));
    }
  }
  const footBottomY = lowestGroundY - FOOTING_BELOW_LOWEST_GROUND_M;

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

  // --- 8. 大階段（InstancedMesh）＋踊り場。中心線は OSM の steps の線、下端はメインストリートの北の縁 ---
  // 上端（OSM の上端）はテラスの高さ、下端は道寄りの段の前の地面。総高から段の数と踊り場の高さを決める
  const stairPlan = planGrandStairs(stairFootY, floor1Y, { top: stairTopW, foot: stairFootW });

  // 上端の床: テラスの前端（塔の前面と同じ線）から OSM の上端まで、テラスの高さのまま前へ延ばす。
  // 上の段の上端がテラスとつながり、塔の前に出た上の段の端も床の上に収まる
  if (stairTopW - TOWER_PROTRUSION_M > 0.05) {
    const platformUMin = Math.min(centerLeftU, stairAxisU - upperHalfW);
    const platformUMax = Math.max(centerRightU, stairAxisU + upperHalfW);
    const platformH = floor1Y - footBottomY;
    const platformDepth = stairTopW - TOWER_PROTRUSION_M + 0.04;
    const platformMesh = new THREE.Mesh(
      new THREE.BoxGeometry(platformUMax - platformUMin, platformH, platformDepth),
      stairStoneMat,
    );
    platformMesh.name = 'library-stair-top-platform';
    platformMesh.position.set(
      (platformUMin + platformUMax) * 0.5,
      footBottomY + platformH * 0.5,
      TOWER_PROTRUSION_M - 0.02 + platformDepth * 0.5,
    );
    platformMesh.castShadow = true;
    platformMesh.receiveShadow = true;
    frontGroup.add(platformMesh);
  }

  // 段: 道は正面に対して斜めに通るので、道に近い側の端を道の縁で切り詰める（道の上に段を載せない）
  const stepMatrices: THREE.Matrix4[] = [];
  for (const step of stairPlan.steps) {
    const span = clipToStreet(
      stairAxisU - step.width * 0.5,
      stairAxisU + step.width * 0.5,
      step.frontW,
    );
    if (!span || span[1] - span[0] < 0.3) continue;
    // 段は底まで埋めた箱にする（斜面の低い側でも段の下にすき間ができない）
    const stepH = step.topY - footBottomY;
    dummy.position.set(
      (span[0] + span[1]) * 0.5,
      footBottomY + stepH * 0.5,
      step.frontW - step.depth * 0.5,
    );
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(span[1] - span[0], stepH, step.depth);
    dummy.updateMatrix();
    stepMatrices.push(dummy.matrix.clone());
  }
  if (stepMatrices.length > 0) {
    const stairsMesh = new THREE.InstancedMesh(unitBoxGeo, stairStoneMat, stepMatrices.length);
    stairsMesh.name = 'library-grand-stairs';
    stairsMesh.castShadow = true;
    stairsMesh.receiveShadow = true;
    stepMatrices.forEach((m, i) => stairsMesh.setMatrixAt(i, m));
    stairsMesh.instanceMatrix.needsUpdate = true;
    stairsMesh.computeBoundingBox();
    stairsMesh.computeBoundingSphere();
    frontGroup.add(stairsMesh);
  }

  // 踊り場（2 段構えのとき。水平。1 段構え・段なしのときはテラスの高さの平らな床）。道に近い側は道の縁で切り詰める
  const landingH = stairPlan.landingY - footBottomY;
  const landingDepth = Math.max(0.1, stairPlan.landingEndW - stairPlan.landingStartW);
  const landingSpan = clipToStreet(
    stairAxisU - stairPlan.landingWidth * 0.5,
    stairAxisU + stairPlan.landingWidth * 0.5,
    stairPlan.landingEndW,
  ) ?? [stairAxisU - 0.5, stairAxisU + 0.5];
  const landingMesh = new THREE.Mesh(
    new THREE.BoxGeometry(landingSpan[1] - landingSpan[0], landingH, landingDepth + 0.04),
    stairStoneMat,
  );
  landingMesh.name = 'library-stair-landing';
  landingMesh.position.set(
    (landingSpan[0] + landingSpan[1]) * 0.5,
    footBottomY + landingH * 0.5,
    stairPlan.landingStartW + landingDepth * 0.5,
  );
  landingMesh.castShadow = true;
  landingMesh.receiveShadow = true;
  frontGroup.add(landingMesh);

  // 道で切り詰めた側（東）の下の段の端に、天端が段に沿って下る斜めの袖壁を立てる。
  // 段の端が道の縁に沿ってのこぎりの歯のように並ぶのを隠す（写真でも下の段の右端は斜めに下る石積みの壁）
  const lowerEastAtLanding = clipToStreet(
    stairAxisU - lowerHalfW,
    stairAxisU + lowerHalfW,
    stairPlan.landingEndW,
  );
  const lowerEastAtFoot = clipToStreet(stairAxisU - lowerHalfW, stairAxisU + lowerHalfW, stairFootW);
  if (
    stairPlan.wallUpperRise > 0 &&
    lowerEastAtLanding &&
    lowerEastAtFoot &&
    lowerEastAtFoot[1] < stairAxisU + lowerHalfW - 0.3
  ) {
    const u1 = lowerEastAtLanding[1];
    const w1 = stairPlan.landingEndW;
    const u2 = lowerEastAtFoot[1];
    const w2 = stairFootW;
    const cheekLen = Math.hypot(u2 - u1, w2 - w1);
    const cheekThickness = 1.3; // 歯の奥行き（踏み面 ÷ 道の傾き ≒ 1.1m）を覆う
    const cheekCap = 0.4;
    // 壁の内側（道から離れる側）ほど段は高い。内側の縁でも段より上に天端が来るよう、下端側を
    // 「壁の厚みぶん奥の段の高さ（下の段の勾配 × 厚み）＋ 1 段」だけ上げる（踊り場の側は水平なので不要）
    const lowerSlope =
      (stairPlan.landingY - stairFootY) / Math.max(0.1, stairFootW - stairPlan.landingEndW);
    const riserNow = stairPlan.steps.length > 1
      ? Math.abs((stairPlan.steps[0]?.topY ?? 0) - (stairPlan.steps[1]?.topY ?? 0))
      : 0;
    const footCapExtra = cheekThickness * lowerSlope + riserNow;
    const cheekGeo = buildSlopedWallGeometry(
      cheekLen,
      footBottomY,
      stairPlan.landingY + cheekCap,
      stairFootY + cheekCap + footCapExtra,
      cheekThickness,
    );
    const cheekMesh = new THREE.Mesh(cheekGeo, retainingStoneMat);
    cheekMesh.name = 'library-stair-street-cheek';
    // 壁の +X を (u1, w1) → (u2, w2) の向きに、厚みの +Z を階段の内側（西・建物の側）に向ける
    cheekMesh.position.set(u1, 0, w1);
    cheekMesh.rotation.y = Math.atan2(-(w2 - w1), u2 - u1);
    cheekMesh.castShadow = true;
    cheekMesh.receiveShadow = true;
    frontGroup.add(cheekMesh);
  }

  // --- 9. 階段の左右: 石積みの擁壁（段々の壁。石積みはここだけ） ---
  // 高さは 1 回目（下段 2.4m・上段 2.4m）の割り付けを、踊り場の高さと上の段の高さに合わせて伸び縮みさせる。
  // levelAboveLanding = 0 が踊り場の高さ、2.4 がテラスの高さ。道の側の端は道の縁で止める
  interface WallSpec {
    uMin: number;
    uMax: number;
    wMin: number;
    wMax: number;
    levelAboveLanding: number;
  }

  const wallStartW = TOWER_PROTRUSION_M; // 塔の前面・テラスの前端の線
  const upperEndW = Math.max(stairTopW, stairPlan.landingStartW);
  const upperMidW = (stairTopW + upperEndW) * 0.5;
  const landingEndW = stairPlan.landingEndW;
  const lowerMidW = (landingEndW + stairFootW) * 0.5;

  const oneSideWalls: WallSpec[] = [
    // 上段脇の内側袖壁（テラスの高さ -> 踊り場 + 1.4）
    {
      uMin: upperHalfW,
      uMax: upperHalfW + innerCheekThickness,
      wMin: wallStartW,
      wMax: upperMidW,
      levelAboveLanding: 2.4,
    },
    {
      uMin: upperHalfW,
      uMax: upperHalfW + innerCheekThickness,
      wMin: upperMidW,
      wMax: upperEndW,
      levelAboveLanding: 1.4,
    },
    // 上段と外側擁壁をつなぐ段状テラス擁壁（踊り場 + 1.0）
    {
      uMin: upperHalfW + innerCheekThickness,
      uMax: lowerHalfW,
      wMin: wallStartW,
      wMax: upperEndW,
      levelAboveLanding: 1.0,
    },
    // 外側の段々擁壁（奥 テラス -> 踊り場 + 1.6 -> 踊り場脇 + 1.0 -> 下段奥 + 0.5 -> 下段前 踊り場の高さ）
    {
      uMin: lowerHalfW,
      uMax: lowerHalfW + outerWallThickness,
      wMin: wallStartW,
      wMax: upperMidW,
      levelAboveLanding: 2.4,
    },
    {
      uMin: lowerHalfW,
      uMax: lowerHalfW + outerWallThickness,
      wMin: upperMidW,
      wMax: upperEndW,
      levelAboveLanding: 1.6,
    },
    {
      uMin: lowerHalfW,
      uMax: lowerHalfW + outerWallThickness,
      wMin: upperEndW,
      wMax: landingEndW,
      levelAboveLanding: 1.0,
    },
    {
      uMin: lowerHalfW,
      uMax: lowerHalfW + outerWallThickness,
      wMin: landingEndW,
      wMax: lowerMidW,
      levelAboveLanding: 0.5,
    },
    {
      uMin: lowerHalfW,
      uMax: lowerHalfW + outerWallThickness,
      wMin: lowerMidW,
      wMax: stairFootW,
      levelAboveLanding: 0,
    },
  ];

  const wallMatrices: THREE.Matrix4[] = [];
  for (const side of [-1, 1] as const) {
    for (const w of oneSideWalls) {
      const uA = stairAxisU + side * w.uMin;
      const uB = stairAxisU + side * w.uMax;
      // 道の縁より道の側へは出さない（壁の幅の両端で縁までの距離を見る）
      const wMax = Math.min(w.wMax, streetEdgeW(uA), streetEdgeW(uB));
      const depth = wMax - w.wMin;
      if (depth < 0.3) continue;
      const width = w.uMax - w.uMin;
      const topY =
        stairPlan.wallBaseY +
        (w.levelAboveLanding / WALL_REFERENCE_FLIGHT_HEIGHT_M) * stairPlan.wallUpperRise;
      const height = topY - footBottomY;
      dummy.position.set((uA + uB) * 0.5, footBottomY + height * 0.5, (w.wMin + wMax) * 0.5);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(width, height, depth);
      dummy.updateMatrix();
      wallMatrices.push(dummy.matrix.clone());
    }
  }
  if (wallMatrices.length > 0) {
    const retainingWallsMesh = new THREE.InstancedMesh(
      unitBoxGeo,
      retainingStoneMat,
      wallMatrices.length,
    );
    retainingWallsMesh.name = 'library-retaining-walls';
    retainingWallsMesh.castShadow = true;
    retainingWallsMesh.receiveShadow = true;
    wallMatrices.forEach((m, i) => retainingWallsMesh.setMatrixAt(i, m));
    retainingWallsMesh.instanceMatrix.needsUpdate = true;
    retainingWallsMesh.computeBoundingBox();
    retainingWallsMesh.computeBoundingSphere();
    frontGroup.add(retainingWallsMesh);
  }

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
