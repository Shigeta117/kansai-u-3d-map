import * as THREE from 'three';
import { computeVisualY, sampleElevation } from '../domain/projection';
import type {
  CampusConfig,
  CampusStructuresData,
  TerrainGrid,
} from '../domain/types';
import { buildExpresswayMesh } from './ExpresswayBuilder';
import { SCENE_PALETTE } from './palette';

function buildDeckStripGeometry(
  pts: THREE.Vector3[],
  width: number,
  thickness: number,
): THREE.BufferGeometry {
  const halfW = width * 0.5;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    if (!cur) continue;
    const prev = pts[Math.max(0, i - 1)] ?? cur;
    const next = pts[Math.min(pts.length - 1, i + 1)] ?? cur;
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const nx = -tz;
    const nz = tx;

    const lx = cur.x + nx * halfW;
    const lz = cur.z + nz * halfW;
    const rx = cur.x - nx * halfW;
    const rz = cur.z - nz * halfW;

    // 4 vertices per cross-section: top-L, top-R, bot-R, bot-L
    positions.push(
      lx, cur.y, lz,
      rx, cur.y, rz,
      rx, cur.y - thickness, rz,
      lx, cur.y - thickness, lz,
    );

    if (i < pts.length - 1) {
      const a = i * 4;
      const b = (i + 1) * 4;
      // Top (+Y)
      indices.push(a + 0, b + 0, a + 1, a + 1, b + 0, b + 1);
      // Bottom (-Y)
      indices.push(a + 3, a + 2, b + 3, a + 2, b + 2, b + 3);
      // Left side
      indices.push(a + 3, b + 3, a + 0, a + 0, b + 3, b + 0);
      // Right side
      indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }

  // End caps
  if (pts.length >= 2) {
    indices.push(0, 1, 2, 0, 2, 3);
    const last = (pts.length - 1) * 4;
    indices.push(last + 0, last + 2, last + 1, last + 0, last + 3, last + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildRailStrip(
  pts: THREE.Vector3[],
  offsetSide: number,
  railHeight: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    if (!cur) continue;
    const prev = pts[Math.max(0, i - 1)] ?? cur;
    const next = pts[Math.min(pts.length - 1, i + 1)] ?? cur;
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const nx = -tz;
    const nz = tx;

    const px = cur.x + nx * offsetSide;
    const pz = cur.z + nz * offsetSide;

    positions.push(px, cur.y, pz, px, cur.y + railHeight, pz);
    if (i < pts.length - 1) {
      const a = i * 2;
      const b = (i + 1) * 2;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** 屋根と壁の区間の中で、屋根が途切れる所 */
export interface DeckRoofGap {
  /** 合流点（OSM のノードの位置） */
  at: readonly [number, number];
  /** 合流点の前後にこの長さ（m）ずつ途切れる（推定） */
  halfLength: number;
}

/** 屋根と壁の区間の中で、片側の壁が開く所（枝分かれする道の口） */
export interface DeckWallOpening extends DeckRoofGap {
  /** 枝分かれする道の次の点。デッキのどちら側の壁が開くかをこれで決める */
  toward: readonly [number, number];
}

export interface DeckRoofSection {
  bridgeId: string;
  /** 区間の両端（OSM のノードの位置。デッキの頂点のうちいちばん近いものを使う） */
  from: readonly [number, number];
  to: readonly [number, number];
  roofGaps: readonly DeckRoofGap[];
  wallOpenings: readonly DeckWallOpening[];
}

/**
 * 屋根と高い壁のある区間（第3学舎連絡デッキ）。
 * 2023 年の持ち主の映像（新関西大学会館 南棟の側から第3学舎へ歩いた IMG_6436 と、折り返した IMG_6437）では、
 * デッキの両側が高いコンクリートの壁で、上を網状の金属のアーチの屋根（暗い灰色の鉄のアーチと、透けて見える網）が覆う。
 * 屋根と壁は、南棟のデッキ（way 423060540）につながる点から、道路（way 158856536、paths.json の path_158856536）の
 * 上をまたぎ、第3学舎の側の端（way 423060539 の西の端。地上の道 way 233078244 へ続く）まで続く
 * （IMG_6436_007〜025、IMG_6437_000〜006）。
 * - 地上へ下りる階段（way 490793066）の合流点で屋根が途切れ、南の壁が開く（IMG_6436_014〜016、IMG_6437_006）
 * - 第3学舎へ入る短い橋（way 490793070）の口で南の壁が開く（白い穴あきの扉）。屋根は続く（IMG_6436_023〜025、IMG_6437_000〜004）
 * - 北の壁は途切れない
 * 途切れる・開く長さは映像から読んだ推定
 */
export const DECK_ROOF_SECTIONS: readonly DeckRoofSection[] = [
  {
    bridgeId: 'bridge-shurei-west',
    from: [-125.72, 162.33],
    to: [-188.12, 187.51],
    roofGaps: [{ at: [-144.28, 171.99], halfLength: 1.8 }],
    wallOpenings: [
      { at: [-144.28, 171.99], toward: [-138.7, 184.5], halfLength: 1.8 },
      { at: [-163.33, 178.7], toward: [-160.88, 186.14], halfLength: 1.3 },
    ],
  },
];

/** 壁の高さ（デッキの面から）。映像の中の比と目の高さから（推定） */
export const DECK_WALL_HEIGHT_M = 1.9;
/** 壁の厚み（推定） */
const DECK_WALL_THICKNESS_M = 0.25;
/** アーチの足（壁の上から縦に立ち上がる部分）の上端と、頂部の高さ（デッキの面から。推定） */
const DECK_ROOF_SPRING_M = 2.15;
export const DECK_ROOF_CROWN_M = 2.75;
/** 鉄のアーチの間隔（映像で、壁のパネル 1 枚におよそ 1 本。推定） */
const DECK_ROOF_RIB_SPACING_M = 1.6;
const DECK_ROOF_ARC_SEGMENTS = 12;
/** 屋根の網の色（ガラスの水色にせず、金属の灰色）と、鉄のアーチの色 */
const DECK_ROOF_MESH_HEX = '#80858B';
const DECK_ROOF_RIB_HEX = '#454A50';
const DECK_WALL_HEX = '#CFC8B8';
/** これより短い屋根・壁の切れ端は作らない（m） */
const MIN_PIECE_M = 0.3;

function closestIndex(pts: readonly THREE.Vector3[], x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** 区間の端の点（OSM のノード）にいちばん近い頂点どうしの間の折れ線 */
function sectionPolyline(
  pts: readonly THREE.Vector3[],
  from: readonly [number, number],
  to: readonly [number, number],
): THREE.Vector3[] {
  const a = closestIndex(pts, from[0], from[1]);
  const b = closestIndex(pts, to[0], to[1]);
  const [i0, i1] = a <= b ? [a, b] : [b, a];
  return pts.slice(i0, i1 + 1).map((p) => p.clone());
}

/** 折れ線の各点での左向きの水平の法線（buildDeckStripGeometry と同じ向き） */
function leftNormals(pts: readonly THREE.Vector3[]): [number, number][] {
  return pts.map((cur, i) => {
    const prev = pts[Math.max(0, i - 1)] ?? cur;
    const next = pts[Math.min(pts.length - 1, i + 1)] ?? cur;
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    return [-tz / len, tx / len];
  });
}

/** 屋根と壁の区間の折れ線と、各頂点の法線・始点からの水平の距離 */
interface DeckFrame {
  pts: THREE.Vector3[];
  normals: [number, number][];
  cum: number[];
}

function makeDeckFrame(pts: THREE.Vector3[]): DeckFrame {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as THREE.Vector3;
    const b = pts[i] as THREE.Vector3;
    cum.push((cum[i - 1] as number) + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { pts, normals: leftNormals(pts), cum };
}

function frameLength(f: DeckFrame): number {
  return f.cum[f.cum.length - 1] ?? 0;
}

/** 折れ線の上で点 (x, z) にいちばん近い所の、始点からの距離 */
function distanceAlong(f: DeckFrame, x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < f.pts.length - 1; i++) {
    const a = f.pts[i] as THREE.Vector3;
    const b = f.pts[i + 1] as THREE.Vector3;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
    if (d < bestD) {
      bestD = d;
      best = (f.cum[i] as number) + t * ((f.cum[i + 1] as number) - (f.cum[i] as number));
    }
  }
  return best;
}

/** 距離 s の所の点と法線（頂点の間は線形に補間） */
function sampleFrame(f: DeckFrame, s: number): { p: THREE.Vector3; n: [number, number] } {
  const last = f.pts.length - 1;
  let i = 0;
  while (i < last - 1 && (f.cum[i + 1] as number) < s) i++;
  const c0 = f.cum[i] as number;
  const c1 = f.cum[i + 1] as number;
  const t = c1 > c0 ? Math.max(0, Math.min(1, (s - c0) / (c1 - c0))) : 0;
  const a = f.pts[i] as THREE.Vector3;
  const b = f.pts[i + 1] as THREE.Vector3;
  const na = f.normals[i] as [number, number];
  const nb = f.normals[i + 1] as [number, number];
  const nx = na[0] + (nb[0] - na[0]) * t;
  const nz = na[1] + (nb[1] - na[1]) * t;
  const nl = Math.hypot(nx, nz) || 1;
  return { p: a.clone().lerp(b, t), n: [nx / nl, nz / nl] };
}

/** 距離 a〜b の部分の折れ線（両端は補間した点、間は元の頂点） */
function sliceFrame(f: DeckFrame, a: number, b: number): { pts: THREE.Vector3[]; normals: [number, number][] } {
  const start = sampleFrame(f, a);
  const end = sampleFrame(f, b);
  const pts = [start.p];
  const normals = [start.n];
  for (let i = 0; i < f.pts.length; i++) {
    const c = f.cum[i] as number;
    if (c > a + 1e-6 && c < b - 1e-6) {
      pts.push((f.pts[i] as THREE.Vector3).clone());
      normals.push(f.normals[i] as [number, number]);
    }
  }
  pts.push(end.p);
  normals.push(end.n);
  return { pts, normals };
}

/** [0, total] から穴（中心 ± 半分の長さ）を除いた区間の並び。短すぎる切れ端は捨てる */
function subtractRanges(total: number, holes: readonly { s: number; halfLength: number }[]): [number, number][] {
  const sorted = holes
    .map((h) => [Math.max(0, h.s - h.halfLength), Math.min(total, h.s + h.halfLength)] as const)
    .sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  let cursor = 0;
  for (const [h0, h1] of sorted) {
    if (h0 - cursor >= MIN_PIECE_M) out.push([cursor, h0]);
    cursor = Math.max(cursor, h1);
  }
  if (total - cursor >= MIN_PIECE_M) out.push([cursor, total]);
  return out;
}

/** 区間の中の屋根の部分と、両側（+1＝左、−1＝右）の壁の部分 */
function deckRoofPieces(
  f: DeckFrame,
  section: DeckRoofSection,
): { roof: [number, number][]; walls: { side: 1 | -1; ranges: [number, number][] }[] } {
  const total = frameLength(f);
  const roof = subtractRanges(
    total,
    section.roofGaps.map((g) => ({ s: distanceAlong(f, g.at[0], g.at[1]), halfLength: g.halfLength })),
  );
  const openings = section.wallOpenings.map((o) => {
    const s = distanceAlong(f, o.at[0], o.at[1]);
    const { p, n } = sampleFrame(f, s);
    const side: 1 | -1 = n[0] * (o.toward[0] - p.x) + n[1] * (o.toward[1] - p.z) >= 0 ? 1 : -1;
    return { s, halfLength: o.halfLength, side };
  });
  const walls = ([1, -1] as const).map((side) => ({
    side,
    ranges: subtractRanges(
      total,
      openings.filter((o) => o.side === side),
    ),
  }));
  return { roof, walls };
}

/**
 * デッキの両側の高い壁（1 つのジオメトリ）。外の面・内の面・上の面・切れ目ごとの小口
 */
function buildDeckWallsGeometry(
  f: DeckFrame,
  width: number,
  sides: readonly { side: 1 | -1; ranges: readonly [number, number][] }[],
): THREE.BufferGeometry {
  const pos: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hint: THREE.Vector3): void => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const [p, q, r, t] = n.dot(hint) >= 0 ? [a, b, c, d] : [a, d, c, b];
    pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z, p.x, p.y, p.z, r.x, r.y, r.z, t.x, t.y, t.z);
  };
  const outer = width / 2;
  const inner = width / 2 - DECK_WALL_THICKNESS_M;
  for (const { side, ranges } of sides) {
    for (const [s0, s1] of ranges) {
      const { pts, normals } = sliceFrame(f, s0, s1);
      const at = (i: number, off: number, dy: number): THREE.Vector3 => {
        const p = pts[i] as THREE.Vector3;
        const n = normals[i] as [number, number];
        return new THREE.Vector3(p.x + n[0] * off * side, p.y + dy, p.z + n[1] * off * side);
      };
      for (let i = 0; i < pts.length - 1; i++) {
        const n = normals[i] as [number, number];
        const out = new THREE.Vector3(n[0] * side, 0, n[1] * side);
        const inward = out.clone().negate();
        quad(at(i, outer, -0.35), at(i + 1, outer, -0.35), at(i + 1, outer, DECK_WALL_HEIGHT_M), at(i, outer, DECK_WALL_HEIGHT_M), out);
        quad(at(i, inner, 0), at(i + 1, inner, 0), at(i + 1, inner, DECK_WALL_HEIGHT_M), at(i, inner, DECK_WALL_HEIGHT_M), inward);
        quad(at(i, inner, DECK_WALL_HEIGHT_M), at(i + 1, inner, DECK_WALL_HEIGHT_M), at(i + 1, outer, DECK_WALL_HEIGHT_M), at(i, outer, DECK_WALL_HEIGHT_M), new THREE.Vector3(0, 1, 0));
      }
      // 切れ目の小口
      for (const [i, j] of [
        [0, 1],
        [pts.length - 1, pts.length - 2],
      ] as const) {
        const p = pts[i] as THREE.Vector3;
        const q = pts[j] as THREE.Vector3;
        const hint = new THREE.Vector3(p.x - q.x, 0, p.z - q.z);
        quad(at(i, inner, 0), at(i, outer, 0), at(i, outer, DECK_WALL_HEIGHT_M), at(i, inner, DECK_WALL_HEIGHT_M), hint);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * 網状の金属のアーチの屋根（1 つのジオメトリ。途切れる所ごとに分かれた部分をまとめる）。断面は、壁の上から縦に立ち上がる足と、
 * 頂部へ向かう楕円の弧。UV の u は、部分ごとに長さをアーチの間隔の整数倍に割った値（両端に鉄のアーチが来る）、
 * v は断面に沿った位置（0〜1）
 */
function buildDeckRoofGeometry(f: DeckFrame, width: number, ranges: readonly [number, number][]): THREE.BufferGeometry {
  const half = width / 2 - DECK_WALL_THICKNESS_M / 2;
  // 断面の点（横の位置 off、デッキの面からの高さ h）。左の壁の上 → 足 → 弧 → 右の足 → 右の壁の上
  const section: { off: number; h: number }[] = [{ off: half, h: DECK_WALL_HEIGHT_M }];
  for (let k = 0; k <= DECK_ROOF_ARC_SEGMENTS; k++) {
    const ang = (k / DECK_ROOF_ARC_SEGMENTS) * Math.PI;
    section.push({
      off: half * Math.cos(ang),
      h: DECK_ROOF_SPRING_M + (DECK_ROOF_CROWN_M - DECK_ROOF_SPRING_M) * Math.sin(ang),
    });
  }
  section.push({ off: -half, h: DECK_WALL_HEIGHT_M });
  const sectionLen: number[] = [0];
  for (let k = 1; k < section.length; k++) {
    const a = section[k - 1] as { off: number; h: number };
    const b = section[k] as { off: number; h: number };
    sectionLen.push((sectionLen[k - 1] as number) + Math.hypot(b.off - a.off, b.h - a.h));
  }
  const total = sectionLen[sectionLen.length - 1] || 1;
  const m = section.length;

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const [s0, s1] of ranges) {
    const { pts, normals } = sliceFrame(f, s0, s1);
    const periods = Math.max(1, Math.round((s1 - s0) / DECK_ROOF_RIB_SPACING_M));
    const base = pos.length / 3;
    let dist = 0;
    pts.forEach((p, i) => {
      if (i > 0) {
        const q = pts[i - 1] as THREE.Vector3;
        dist += Math.hypot(p.x - q.x, p.z - q.z);
      }
      const n = normals[i] as [number, number];
      section.forEach((c, k) => {
        pos.push(p.x + n[0] * c.off, p.y + c.h, p.z + n[1] * c.off);
        uv.push((dist / (s1 - s0 || 1)) * periods, (sectionLen[k] as number) / total);
      });
    });
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 0; k < m - 1; k++) {
        const a = base + i * m + k;
        const b = base + (i + 1) * m + k;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 屋根の模様（1 本のアーチの間隔ぶん。横が u＝デッキの向き、縦が v＝断面）。透明の地に、網（灰色の菱形の格子、半透明）と、
 * 端の鉄のアーチ（暗い灰色、不透明）と、頂部と肩の縦の通り材。Node（document が無い）では null
 */
function createDeckRoofTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const w = 128;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.clearRect(0, 0, w, h);
  // 網の菱形は 1 本のアーチの間隔に 8 つ（実物の網目はもっと細かいが、地図の縮尺で網と分かる粗さにする）
  g.strokeStyle = 'rgba(128, 133, 139, 0.6)';
  g.lineWidth = 1.5;
  const cell = 16;
  for (let d = -h; d < w + h; d += cell) {
    g.beginPath();
    g.moveTo(d, 0);
    g.lineTo(d + h, h);
    g.stroke();
    g.beginPath();
    g.moveTo(d, h);
    g.lineTo(d + h, 0);
    g.stroke();
  }
  g.fillStyle = DECK_ROOF_RIB_HEX;
  // 鉄のアーチは u の整数の所（模様の左右の端）に半分ずつ描く。屋根の部分の両端にアーチが来る
  g.fillRect(0, 0, 5, h);
  g.fillRect(w - 5, 0, 5, h);
  for (const v of [0.22, 0.5, 0.78]) g.fillRect(0, Math.round(v * h) - 3, w, 6);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function buildStructuresBridgesGroup(
  structures: CampusStructuresData,
  terrain: TerrainGrid,
  config: CampusConfig,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'campus-bridges-and-portals';

  const exag = config.verticalExaggeration;
  const minElev = terrain.minElevation;

  const deckMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.accents.bridgeDeck,
    roughness: 0.78,
    metalness: 0.04,
  });
  const girderMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.accents.bridgeGirder,
    roughness: 0.85,
  });
  const glassRailMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.accents.bridgeGlass,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  const pierMat = new THREE.MeshStandardMaterial({
    color: '#CFC5B4',
    roughness: 0.82,
  });
  // 屋根のある区間の材質（使う区間があるときだけ作る）
  const hasRoof = structures.bridges.some((b) => DECK_ROOF_SECTIONS.some((r) => r.bridgeId === b.id));
  const roofTex = hasRoof ? createDeckRoofTexture() : null;
  const deckRoofMat = hasRoof
    ? new THREE.MeshStandardMaterial(
        roofTex
          ? {
              color: '#FFFFFF',
              map: roofTex,
              transparent: true,
              depthWrite: false,
              side: THREE.DoubleSide,
              // 透明の両面は既定で裏と表の 2 回に分けて描かれる。網なので 1 回で描く（描画命令を 1 回に）
              forceSinglePass: true,
              roughness: 0.55,
              metalness: 0.45,
            }
          : {
              color: DECK_ROOF_MESH_HEX,
              transparent: true,
              opacity: 0.4,
              depthWrite: false,
              side: THREE.DoubleSide,
              forceSinglePass: true,
              roughness: 0.55,
              metalness: 0.45,
            },
      )
    : null;
  const deckWallMat = hasRoof
    ? new THREE.MeshStandardMaterial({ color: DECK_WALL_HEX, roughness: 0.88, metalness: 0.02 })
    : null;

  for (const bridge of structures.bridges) {
    if (bridge.points.length < 2) continue;

    const bGroup = new THREE.Group();
    bGroup.name = bridge.id;

    const pts3D = bridge.points.map(
      ([x, yM, z]) =>
        new THREE.Vector3(x, computeVisualY(yM, minElev, exag), z),
    );

    const deckMesh = new THREE.Mesh(
      buildDeckStripGeometry(pts3D, bridge.width, 0.35),
      deckMat,
    );
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    bGroup.add(deckMesh);

    const girderPts = pts3D.map((p) => new THREE.Vector3(p.x, p.y - 0.35, p.z));
    const girderMesh = new THREE.Mesh(
      buildDeckStripGeometry(girderPts, bridge.width * 0.86, 0.9),
      girderMat,
    );
    girderMesh.castShadow = true;
    bGroup.add(girderMesh);

    const railOffset = bridge.width * 0.48;
    const leftRail = new THREE.Mesh(buildRailStrip(pts3D, railOffset, 1.15), glassRailMat);
    const rightRail = new THREE.Mesh(buildRailStrip(pts3D, -railOffset, 1.15), glassRailMat);
    bGroup.add(leftRail, rightRail);

    // 屋根と高い壁のある区間（途切れる所があっても、壁 1 つ・屋根 1 つのメッシュ）
    for (const section of DECK_ROOF_SECTIONS) {
      if (section.bridgeId !== bridge.id || !deckRoofMat || !deckWallMat) continue;
      const covered = sectionPolyline(pts3D, section.from, section.to);
      if (covered.length < 2) continue;
      const frame = makeDeckFrame(covered);
      const pieces = deckRoofPieces(frame, section);
      const walls = new THREE.Mesh(buildDeckWallsGeometry(frame, bridge.width, pieces.walls), deckWallMat);
      walls.name = 'deck-roof-walls';
      walls.castShadow = true;
      walls.receiveShadow = true;
      const roof = new THREE.Mesh(buildDeckRoofGeometry(frame, bridge.width, pieces.roof), deckRoofMat);
      roof.name = 'deck-roof';
      bGroup.add(walls, roof);
    }

    // Support piers where deck is > 1.8m above terrain
    let distAcc = 0;
    for (let i = 0; i < pts3D.length; i++) {
      const p = pts3D[i];
      if (!p) continue;
      if (i > 0) {
        const prev = pts3D[i - 1];
        if (prev) distAcc += p.distanceTo(prev);
      }
      if (i === 0 || i === pts3D.length - 1 || distAcc >= 22) {
        distAcc = 0;
        const groundVisualY = computeVisualY(
          sampleElevation(terrain, p.x, p.z),
          minElev,
          exag,
        );
        const clearance = p.y - 1.1 - groundVisualY;
        if (clearance > 1.2) {
          const h = clearance + 2.2;
          const pier = new THREE.Mesh(
            new THREE.CylinderGeometry(0.55, 0.72, h, 10),
            pierMat,
          );
          pier.position.set(p.x, groundVisualY + h * 0.5 - 1.5, p.z);
          pier.castShadow = true;
          bGroup.add(pier);
        }
      }
    }

    group.add(bGroup);
  }

  // 名神高速道路（高架・地上の区間・橋脚・坑口）。頂点色つきの 1 つのメッシュ
  const expressway = buildExpresswayMesh(structures, terrain, config);
  if (expressway) group.add(expressway);

  return group;
}

