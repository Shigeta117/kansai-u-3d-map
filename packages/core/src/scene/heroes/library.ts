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
  plinthStone: '#9E9A90',
  roof: '#B9AFA0',
} as const;

/** 斜面でも足元が浮かないように地面の下へ伸ばす根入れ深さ (m) */
const SKIRT_DEPTH_M = 2.5;

/** 大階段・基壇の高さ（下段 2.4m + 上段 2.4m = 4.8m） */
const STAIR_LOWER_HEIGHT_M = 2.4;
const STAIR_UPPER_HEIGHT_M = 2.4;
const PLINTH_HEIGHT_M = STAIR_LOWER_HEIGHT_M + STAIR_UPPER_HEIGHT_M;

/**
 * 本体 3 階建ての階高・総高と左右の塔状張り出しの高さ。
 * 基壇 4.8m の上に 3 階建て（4.8m × 3 = 14.4m）と塔（+0.6m = 15.0m）を載せ、
 * 最高部を groundVisualY + 19.8m（許容外接箱上限 groundVisualY + 20m 以内）に収める。
 */
const FLOOR_HEIGHT_M = 4.8;
const BODY_HEIGHT_M = FLOOR_HEIGHT_M * 3;
const TOWER_EXTRA_HEIGHT_M = 0.6;
const TOWER_HEIGHT_M = BODY_HEIGHT_M + TOWER_EXTRA_HEIGHT_M;
const FLOOR_BAND_HEIGHT_M = 0.3;

/** 正面構成（左右の塔状張り出し・1F カーテンウォールの後退） */
const TOWER_WIDTH_M = 10.0;
const TOWER_PROTRUSION_M = 2.5;
const CURTAIN_RECESS_M = 3.0;
const CURTAIN_HEIGHT_M = 4.5;
const CURTAIN_MULLION_STEP_M = 2.5;

/** 上階（2F・3F）横長窓の帯 */
const UPPER_WINDOW_HEIGHT_M = 1.4;
const UPPER_WINDOW_FRAME_M = 0.2;
const CENTER_PIER_WIDTH_M = 1.8;

/** 逆さ扇の折板コンクリート庇 */
const CANOPY_ELEVATION_M = 3.6;
const CANOPY_FRONT_WIDTH_M = 14.0;
const CANOPY_BACK_WIDTH_M = 5.2;
const CANOPY_PROTRUSION_M = 6.0;
const CANOPY_FOLD_COUNT = 14;
const CANOPY_THICKNESS_M = 0.14;

/** 2 段構えの大階段 */
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

interface BandSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  nx: number;
  nz: number;
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

function computePolygonSignedAreaXZ(polygon: readonly [number, number][]): number {
  let area2 = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (!a || !b) continue;
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  return area2;
}

function buildPerimeterBandSegments(
  clippedPoly: readonly [number, number][],
  frame: FrontFrame,
  halfSpan: number,
  centerHalfW: number,
): BandSegment[] {
  const segments: BandSegment[] = [];
  const signedArea = computePolygonSignedAreaXZ(clippedPoly);
  const n = clippedPoly.length;

  for (let i = 0; i < n; i++) {
    const a = clippedPoly[i];
    const b = clippedPoly[(i + 1) % n];
    if (!a || !b) continue;

    const wa = (a[0] - frame.originX) * frame.nx + (a[1] - frame.originZ) * frame.nz;
    const wb = (b[0] - frame.originX) * frame.nx + (b[1] - frame.originZ) * frame.nz;
    // クリップで生じた建物内部側の直線（w = -CURTAIN_RECESS）は見切り帯から除く
    if (
      Math.abs(wa + CURTAIN_RECESS_M) < 0.05 &&
      Math.abs(wb + CURTAIN_RECESS_M) < 0.05
    ) {
      continue;
    }

    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;

    const nx = signedArea >= 0 ? dz / len : -dz / len;
    const nz = signedArea >= 0 ? -dx / len : dx / len;
    segments.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], nx, nz });
  }

  // 正面側（左右の塔状張り出し＋中央ファサード）の外周線分をワールド座標へ変換して追加
  const localToWorld = (u: number, w: number): [number, number] => [
    frame.originX + u * frame.tx + w * frame.nx,
    frame.originZ + u * frame.tz + w * frame.nz,
  ];
  const localDirToWorld = (du: number, dw: number): [number, number] => [
    du * frame.tx + dw * frame.nx,
    du * frame.tz + dw * frame.nz,
  ];

  const frontLocalEdges: {
    u0: number;
    w0: number;
    u1: number;
    w1: number;
    nu: number;
    nw: number;
  }[] = [
    { u0: -halfSpan, w0: -CURTAIN_RECESS_M, u1: -halfSpan, w1: TOWER_PROTRUSION_M, nu: -1, nw: 0 },
    { u0: -halfSpan, w0: TOWER_PROTRUSION_M, u1: -centerHalfW, w1: TOWER_PROTRUSION_M, nu: 0, nw: 1 },
    { u0: -centerHalfW, w0: TOWER_PROTRUSION_M, u1: -centerHalfW, w1: 0, nu: 1, nw: 0 },
    { u0: -centerHalfW, w0: 0, u1: centerHalfW, w1: 0, nu: 0, nw: 1 },
    { u0: centerHalfW, w0: 0, u1: centerHalfW, w1: TOWER_PROTRUSION_M, nu: -1, nw: 0 },
    { u0: centerHalfW, w0: TOWER_PROTRUSION_M, u1: halfSpan, w1: TOWER_PROTRUSION_M, nu: 0, nw: 1 },
    { u0: halfSpan, w0: TOWER_PROTRUSION_M, u1: halfSpan, w1: -CURTAIN_RECESS_M, nu: 1, nw: 0 },
  ];

  for (const e of frontLocalEdges) {
    const [ax, az] = localToWorld(e.u0, e.w0);
    const [bx, bz] = localToWorld(e.u1, e.w1);
    const [nx, nz] = localDirToWorld(e.nu, e.nw);
    segments.push({ ax, az, bx, bz, nx, nz });
  }

  return segments;
}

/**
 * 扇を逆さにしたようなひだ（折板）付きコンクリート庇の立体ジオメトリ。
 * 折り目ごとに頂点を独立させてフラット法線を立て、ギザギザの陰影をはっきり見せる。
 */
function buildFoldedCanopyGeometry(baseY: number): THREE.BufferGeometry {
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
  const backAmplitude = 0.16;
  const frontAmplitude = 0.56;
  const frontLift = 0.16;

  for (let i = 0; i <= stripCount; i++) {
    const s = (i / stripCount) * 2 - 1; // -1 .. +1
    const isPeak = i % 2 === 1;

    const bYBot = baseY + (isPeak ? backAmplitude : 0);
    backStations.push({
      u: s * (CANOPY_BACK_WIDTH_M * 0.5),
      w: 0,
      yBot: bYBot,
      yTop: bYBot + CANOPY_THICKNESS_M,
    });

    const fYBot = baseY + frontLift + (isPeak ? frontAmplitude : 0);
    frontStations.push({
      u: s * (CANOPY_FRONT_WIDTH_M * 0.5),
      w: CANOPY_PROTRUSION_M - 0.7 * s * s,
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
  const plinthBottomY = gY - SKIRT_DEPTH_M;
  const floor1Y = gY + PLINTH_HEIGHT_M;
  const floor2Y = floor1Y + FLOOR_HEIGHT_M;
  const floor3Y = floor1Y + FLOOR_HEIGHT_M * 2;

  const polygon = normalizePolygon(ctx.building.polygon);
  const frame = computeFrontFrame(polygon, FRONT_FACING_ANGLE_RAD);
  const halfSpan = frame.frontSpan * 0.5;
  const towerWidth = Math.min(TOWER_WIDTH_M, frame.frontSpan * 0.25);
  const centerWidth = Math.max(8, frame.frontSpan - towerWidth * 2);
  const centerHalfW = centerWidth * 0.5;

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
  const plinthStoneMat = new THREE.MeshStandardMaterial({
    color: COLORS.plinthStone,
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

  // --- 1. 石積みの基壇（本体輪郭の背面〜側面＋正面テラス・塔下部） ---
  const plinthTotalH = PLINTH_HEIGHT_M + SKIRT_DEPTH_M;
  const plinthBackMesh = new THREE.Mesh(
    createExtrudedPolygonGeometry(clippedPoly, plinthBottomY, plinthTotalH),
    plinthStoneMat,
  );
  plinthBackMesh.name = 'library-plinth-body';
  plinthBackMesh.castShadow = true;
  plinthBackMesh.receiveShadow = true;
  group.add(plinthBackMesh);

  // --- 2. 本体（3 階建てレンガ外壁＋陸屋根。正面 1F の後退面までクリップして押し出し） ---
  const mainBodyMesh = new THREE.Mesh(
    createExtrudedPolygonGeometry(clippedPoly, floor1Y, BODY_HEIGHT_M),
    [roofMat, brickMat],
  );
  mainBodyMesh.name = 'library-main-body';
  mainBodyMesh.castShadow = true;
  mainBodyMesh.receiveShadow = true;
  group.add(mainBodyMesh);

  // --- 3. 各階床高さ（2F・3F）の白い見切りの帯を外周に回す ---
  const bandSegments = buildPerimeterBandSegments(clippedPoly, frame, halfSpan, centerHalfW);
  const bandYs = [floor2Y, floor3Y];
  const bandInstanceCount = bandSegments.length * bandYs.length;
  if (bandInstanceCount > 0) {
    const bandMesh = new THREE.InstancedMesh(unitBoxGeo, trimMat, bandInstanceCount);
    bandMesh.name = 'library-floor-bands';
    bandMesh.castShadow = false;
    bandMesh.receiveShadow = true;

    let idx = 0;
    for (const bandY of bandYs) {
      for (const seg of bandSegments) {
        const dx = seg.bx - seg.ax;
        const dz = seg.bz - seg.az;
        const len = Math.hypot(dx, dz);
        const midX = (seg.ax + seg.bx) * 0.5 + seg.nx * 0.02;
        const midZ = (seg.az + seg.bz) * 0.5 + seg.nz * 0.02;
        dummy.position.set(midX, bandY, midZ);
        dummy.rotation.set(0, Math.atan2(-dz, dx), 0);
        dummy.scale.set(len + 0.14, FLOOR_BAND_HEIGHT_M, 0.14);
        dummy.updateMatrix();
        bandMesh.setMatrixAt(idx, dummy.matrix);
        idx += 1;
      }
    }
    bandMesh.instanceMatrix.needsUpdate = true;
    bandMesh.computeBoundingBox();
    bandMesh.computeBoundingSphere();
    group.add(bandMesh);
  }

  // --- 正面構成グループ（ローカル +X = 正面右、+Y = 上、+Z = 正面外向き） ---
  const frontGroup = new THREE.Group();
  frontGroup.name = 'library-front-assembly';
  frontGroup.position.set(frame.originX, 0, frame.originZ);
  frontGroup.rotation.y = frame.facingAngleRad;
  group.add(frontGroup);

  // 正面側基壇（入口テラス＋左右の塔の下を支える石積み）
  const frontPlinthDepth = CURTAIN_RECESS_M + TOWER_PROTRUSION_M;
  const frontPlinthMesh = new THREE.Mesh(
    new THREE.BoxGeometry(frame.frontSpan, plinthTotalH, frontPlinthDepth),
    plinthStoneMat,
  );
  frontPlinthMesh.name = 'library-plinth-front-terrace';
  frontPlinthMesh.position.set(
    0,
    plinthBottomY + plinthTotalH * 0.5,
    (TOWER_PROTRUSION_M - CURTAIN_RECESS_M) * 0.5,
  );
  frontPlinthMesh.castShadow = true;
  frontPlinthMesh.receiveShadow = true;
  frontGroup.add(frontPlinthMesh);

  // --- 4. 左右両端の塔状の張り出し（正面から 2.5m 出る、幅 10m、窓無しレンガ壁） ---
  const towerDepth = CURTAIN_RECESS_M + TOWER_PROTRUSION_M;
  const towerCenterW = (TOWER_PROTRUSION_M - CURTAIN_RECESS_M) * 0.5;
  const towerGeo = new THREE.BoxGeometry(towerWidth, TOWER_HEIGHT_M, towerDepth);
  const towerMats = [brickMat, brickMat, roofMat, brickMat, brickMat, brickMat];

  for (const side of [-1, 1] as const) {
    const tower = new THREE.Mesh(towerGeo, towerMats);
    tower.name = side < 0 ? 'library-tower-left' : 'library-tower-right';
    tower.position.set(
      side * (halfSpan - towerWidth * 0.5),
      floor1Y + TOWER_HEIGHT_M * 0.5,
      towerCenterW,
    );
    tower.castShadow = true;
    tower.receiveShadow = true;
    frontGroup.add(tower);
  }

  // --- 5. 中央の上の階（2F・3F のせり出し本体＋横長窓の帯 2 本） ---
  const upperOverhangH = BODY_HEIGHT_M - FLOOR_HEIGHT_M;
  const overhangMesh = new THREE.Mesh(
    new THREE.BoxGeometry(centerWidth, upperOverhangH, CURTAIN_RECESS_M),
    [brickMat, brickMat, roofMat, trimMat, brickMat, brickMat],
  );
  overhangMesh.name = 'library-upper-overhang';
  overhangMesh.position.set(0, floor2Y + upperOverhangH * 0.5, -CURTAIN_RECESS_M * 0.5);
  overhangMesh.castShadow = true;
  overhangMesh.receiveShadow = true;
  frontGroup.add(overhangMesh);

  // 1F カーテンウォール上端（4.5m）と 2F 床（4.8m）の間の軒天パネル
  const soffitThickness = FLOOR_HEIGHT_M - CURTAIN_HEIGHT_M;
  if (soffitThickness > 0.01) {
    const soffitMesh = new THREE.Mesh(
      new THREE.BoxGeometry(centerWidth, soffitThickness, CURTAIN_RECESS_M),
      trimMat,
    );
    soffitMesh.name = 'library-overhang-soffit';
    soffitMesh.position.set(
      0,
      floor1Y + CURTAIN_HEIGHT_M + soffitThickness * 0.5,
      -CURTAIN_RECESS_M * 0.5,
    );
    soffitMesh.castShadow = false;
    soffitMesh.receiveShadow = true;
    frontGroup.add(soffitMesh);
  }

  // 中央で横長窓の帯を 2 本に分ける縦の柱
  const centerPier = new THREE.Mesh(
    new THREE.BoxGeometry(CENTER_PIER_WIDTH_M, upperOverhangH, 0.22),
    brickMat,
  );
  centerPier.name = 'library-center-pier';
  centerPier.position.set(0, floor2Y + upperOverhangH * 0.5, 0.11);
  centerPier.castShadow = false;
  centerPier.receiveShadow = true;
  frontGroup.add(centerPier);

  // 2F・3F の横長窓の帯（各階 左右 2 本）と白い枠
  const baySideMargin = 0.8;
  const bayWidth = Math.max(2, centerHalfW - CENTER_PIER_WIDTH_M * 0.5 - baySideMargin);
  const glassWidth = Math.max(1.2, bayWidth - UPPER_WINDOW_FRAME_M * 2);
  const windowCenterOffsetsY = [floor2Y + 2.55, floor3Y + 2.55];
  const bayCenterOffsetsU = [
    -(CENTER_PIER_WIDTH_M * 0.5 + bayWidth * 0.5),
    CENTER_PIER_WIDTH_M * 0.5 + bayWidth * 0.5,
  ];

  const windowGlassMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    upperWindowGlassMat,
    windowCenterOffsetsY.length * bayCenterOffsetsU.length,
  );
  windowGlassMesh.name = 'library-upper-windows-glass';
  windowGlassMesh.castShadow = false;
  windowGlassMesh.receiveShadow = false;

  const windowFrameMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    trimMat,
    windowCenterOffsetsY.length * bayCenterOffsetsU.length * 4,
  );
  windowFrameMesh.name = 'library-upper-windows-frames';
  windowFrameMesh.castShadow = false;
  windowFrameMesh.receiveShadow = true;

  let glassIdx = 0;
  let frameIdx = 0;
  for (const wy of windowCenterOffsetsY) {
    for (const bu of bayCenterOffsetsU) {
      dummy.position.set(bu, wy, 0.08);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(glassWidth, UPPER_WINDOW_HEIGHT_M, 0.12);
      dummy.updateMatrix();
      windowGlassMesh.setMatrixAt(glassIdx, dummy.matrix);
      glassIdx += 1;

      const halfH = UPPER_WINDOW_HEIGHT_M * 0.5 + UPPER_WINDOW_FRAME_M * 0.5;
      // 上枠・下枠
      for (const vy of [-halfH, halfH]) {
        dummy.position.set(bu, wy + vy, 0.11);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(bayWidth, UPPER_WINDOW_FRAME_M, 0.22);
        dummy.updateMatrix();
        windowFrameMesh.setMatrixAt(frameIdx, dummy.matrix);
        frameIdx += 1;
      }
      // 左枠・右枠
      const halfBay = bayWidth * 0.5 - UPPER_WINDOW_FRAME_M * 0.5;
      for (const vx of [-halfBay, halfBay]) {
        dummy.position.set(bu + vx, wy, 0.1);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(UPPER_WINDOW_FRAME_M, UPPER_WINDOW_HEIGHT_M, 0.2);
        dummy.updateMatrix();
        windowFrameMesh.setMatrixAt(frameIdx, dummy.matrix);
        frameIdx += 1;
      }
    }
  }
  windowGlassMesh.instanceMatrix.needsUpdate = true;
  windowGlassMesh.computeBoundingBox();
  windowGlassMesh.computeBoundingSphere();
  frontGroup.add(windowGlassMesh);

  windowFrameMesh.instanceMatrix.needsUpdate = true;
  windowFrameMesh.computeBoundingBox();
  windowFrameMesh.computeBoundingSphere();
  frontGroup.add(windowFrameMesh);

  // --- 6. 中央 1 階: 正面から 3m 引っ込んだガラスのカーテンウォール＋格子の方立て ---
  const curtainW = Math.max(6, centerWidth - 0.1);
  const curtainGlassMesh = new THREE.Mesh(
    new THREE.BoxGeometry(curtainW, CURTAIN_HEIGHT_M, 0.16),
    curtainGlassMat,
  );
  curtainGlassMesh.name = 'library-curtain-wall-glass';
  curtainGlassMesh.position.set(0, floor1Y + CURTAIN_HEIGHT_M * 0.5, -CURTAIN_RECESS_M + 0.08);
  curtainGlassMesh.castShadow = false;
  curtainGlassMesh.receiveShadow = true;
  frontGroup.add(curtainGlassMesh);

  const verticalMullionCount = Math.max(2, Math.floor(curtainW / CURTAIN_MULLION_STEP_M) + 1);
  const transomHeights = [0.08, CURTAIN_HEIGHT_M * 0.5, CURTAIN_HEIGHT_M - 0.08];
  const totalMullions = verticalMullionCount + transomHeights.length;
  const mullionMesh = new THREE.InstancedMesh(unitBoxGeo, mullionMat, totalMullions);
  mullionMesh.name = 'library-curtain-wall-mullions';
  mullionMesh.castShadow = false;
  mullionMesh.receiveShadow = false;

  const mullionZ = -CURTAIN_RECESS_M + 0.18;
  let mIdx = 0;
  for (let i = 0; i < verticalMullionCount; i++) {
    const t = verticalMullionCount > 1 ? i / (verticalMullionCount - 1) : 0.5;
    const u = (t - 0.5) * (curtainW - 0.16);
    dummy.position.set(u, floor1Y + CURTAIN_HEIGHT_M * 0.5, mullionZ);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.12, CURTAIN_HEIGHT_M, 0.14);
    dummy.updateMatrix();
    mullionMesh.setMatrixAt(mIdx, dummy.matrix);
    mIdx += 1;
  }
  for (const ty of transomHeights) {
    dummy.position.set(0, floor1Y + ty, mullionZ);
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

  // --- 7. 入口の庇（逆さ扇・折板の白いコンクリート庇＋片持ち接続部＋中央支持柱） ---
  const canopyBaseY = floor1Y + CANOPY_ELEVATION_M;
  const canopyMesh = new THREE.Mesh(buildFoldedCanopyGeometry(canopyBaseY), canopyMat);
  canopyMesh.name = 'library-entrance-canopy';
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;
  frontGroup.add(canopyMesh);

  // 折板庇の根元を 1F 入口側へつなぐ梁状の接続スラブ
  const canopyNeckDepth = CURTAIN_RECESS_M - 0.16;
  const canopyNeck = new THREE.Mesh(
    new THREE.BoxGeometry(CANOPY_BACK_WIDTH_M, 0.34, canopyNeckDepth),
    canopyMat,
  );
  canopyNeck.name = 'library-entrance-canopy-neck';
  canopyNeck.position.set(0, canopyBaseY + 0.17, -canopyNeckDepth * 0.5);
  canopyNeck.castShadow = false;
  canopyNeck.receiveShadow = true;
  frontGroup.add(canopyNeck);

  // 入口の庇を中央で支える 1 本のコンクリート柱
  const canopyColumnH = CANOPY_ELEVATION_M + 0.06;
  const canopyColumn = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, canopyColumnH, 0.7),
    canopyMat,
  );
  canopyColumn.name = 'library-entrance-canopy-column';
  canopyColumn.position.set(0, floor1Y + canopyColumnH * 0.5, 0.25);
  canopyColumn.castShadow = true;
  canopyColumn.receiveShadow = true;
  frontGroup.add(canopyColumn);

  // --- 8. 2 段構えの大階段（InstancedMesh）＋踊り場 ---
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
    const stepH = stepTopY - plinthBottomY;
    const frontW = lowerFlightEndW - i * lowerTread;
    const depth = lowerTread + 0.02;
    dummy.position.set(0, plinthBottomY + stepH * 0.5, frontW - depth * 0.5);
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
    const stepH = stepTopY - plinthBottomY;
    const frontW = upperFlightEndW - i * upperTread;
    const depth = upperTread + 0.02;
    dummy.position.set(0, plinthBottomY + stepH * 0.5, frontW - depth * 0.5);
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
    0,
    plinthBottomY + landingH * 0.5,
    (upperFlightEndW + landingEndW) * 0.5,
  );
  landingMesh.castShadow = true;
  landingMesh.receiveShadow = true;
  frontGroup.add(landingMesh);

  // --- 9. 階段の左右: 石積みの擁壁（高さ 2.4〜4.8m の段々の壁） ---
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
    plinthStoneMat,
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
      const height = topY - plinthBottomY;
      const centerU = side * ((w.uMin + w.uMax) * 0.5);
      const centerW = (w.wMin + w.wMax) * 0.5;
      dummy.position.set(centerU, plinthBottomY + height * 0.5, centerW);
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
