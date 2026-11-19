import * as THREE from 'three';
import { computeVisualY } from '../domain/projection';
import type {
  CampusConfig,
  CampusStructuresData,
  ExpresswayCarriagewayFeature,
  TerrainGrid,
  TunnelPortalFeature,
} from '../domain/types';
import { sampleTerrainMeshElevation } from './DioramaBaseBuilder';
import { ColoredMeshBuilder } from './meshKit';

/**
 * 名神高速道路（structures.expressways）を描く: 路面・高欄・高架の桁と橋脚・橋台・盛土の法面・坑口。
 * 同じ材質の静的な部品なので、頂点色つきの 1 つのメッシュにまとめる（描画命令 1 回）。
 * 寸法はデータ（推定値）から。見た目だけの値（色・坑口の奥の暗がりの深さ）はこのファイルの定数。
 */

const COLORS = {
  asphalt: '#6E7277',
  parapet: '#DAD6CC',
  concrete: '#C8C2B6',
  girder: '#B9B3A8',
  pier: '#C4BEB2',
  slope: '#A2AE8C',
  retainingWall: '#C2BCB0',
  portal: '#CFC9BD',
  /** 坑門の後ろの土の覆い（地形の斜面の色に近い） */
  earth: '#CDBFA6',
  dark: '#1E2329',
} as const;

/** 坑門の壁の厚み（m）。推定 */
const PORTAL_WALL_THICKNESS = 1.5;

/** 坑口の開口の奥行き（見た目だけ。奥は黒い壁でふさぐ） */
const OPENING_RECESS = 2.5;
/** 地形を路面より下げる量（m）。路面が地形に埋もれないように */
const CARVE_DEPTH_M = 0.3;
/** 地形を下げる範囲の、車道の縁より外の余白（m） */
const CARVE_MARGIN = 0.8;

interface FramePoint {
  x: number;
  z: number;
  /** 路面の高さ（表示の高さ） */
  y: number;
  /** 路面の標高（m） */
  elevM: number;
  /** 進む向き（単位） */
  tx: number;
  tz: number;
  /** 左（進む向きに対して）の単位ベクトル */
  lx: number;
  lz: number;
}

function buildFrames(
  cw: ExpresswayCarriagewayFeature,
  minElev: number,
  exag: number,
): FramePoint[] {
  const pts = cw.points;
  return pts.map(([x, e, z], i) => {
    const prev = pts[Math.max(0, i - 1)] ?? pts[i];
    const next = pts[Math.min(pts.length - 1, i + 1)] ?? pts[i];
    let tx = (next?.[0] ?? x) - (prev?.[0] ?? x);
    let tz = (next?.[2] ?? z) - (prev?.[2] ?? z);
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    return { x, z, y: computeVisualY(e, minElev, exag), elevM: e, tx, tz, lx: tz, lz: -tx };
  });
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * 地形の格子の点を、地上の区間の路面より CARVE_DEPTH_M だけ低くなるまで下げた地形を返す（表示だけ。データは変えない）。
 * DEM の格子（約 9m）は粗く、坑口の前の切り通しや地上の区間の路面が地形に埋もれるので、
 * 路面の下にかかる格子の升の 4 隅を下げる。下げるだけで上げない
 */
export function carveTerrainForExpressways(
  terrain: TerrainGrid,
  structures: CampusStructuresData,
): TerrainGrid {
  const carriageways = structures.expressways ?? [];
  if (carriageways.length === 0) return terrain;
  const { cols, rows, minX, maxX, minZ, maxZ } = terrain;
  if (cols < 2 || rows < 2) return terrain;
  const dx = (maxX - minX) / (cols - 1);
  const dz = (maxZ - minZ) / (rows - 1);
  const elev = terrain.elevations.slice();
  let changed = false;

  const lowerCell = (px: number, pz: number, target: number) => {
    const ix = Math.floor((px - minX) / dx);
    const iz = Math.floor((pz - minZ) / dz);
    if (ix < 0 || iz < 0 || ix >= cols - 1 || iz >= rows - 1) return;
    for (const [c, r] of [
      [ix, iz],
      [ix + 1, iz],
      [ix, iz + 1],
      [ix + 1, iz + 1],
    ] as const) {
      const idx = r * cols + c;
      const cur = elev[idx];
      if (cur !== undefined && cur > target) {
        elev[idx] = target;
        changed = true;
      }
    }
  };

  for (const cw of carriageways) {
    const half = cw.width / 2 + CARVE_MARGIN;
    for (let i = 0; i < cw.points.length - 1; i++) {
      if (cw.segmentKinds[i] !== 'ground') continue;
      const a = cw.points[i];
      const b = cw.points[i + 1];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (len < 1e-6) continue;
      const tx = (b[0] - a[0]) / len;
      const tz = (b[2] - a[2]) / len;
      const lx = tz;
      const lz = -tx;
      const n = Math.max(1, Math.ceil(len / 2));
      const m = Math.max(1, Math.ceil((half * 2) / 2));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const cx = a[0] + (b[0] - a[0]) * t;
        const cz = a[2] + (b[2] - a[2]) * t;
        const target = a[1] + (b[1] - a[1]) * t - CARVE_DEPTH_M;
        for (let j = 0; j <= m; j++) {
          const v = -half + (2 * half * j) / m;
          lowerCell(cx + lx * v, cz + lz * v, target);
        }
      }
    }
  }
  return changed ? { ...terrain, elevations: elev } : terrain;
}

function addCarriageway(
  mb: ColoredMeshBuilder,
  cw: ExpresswayCarriagewayFeature,
  terrain: TerrainGrid,
  exag: number,
  extendEnd: boolean,
  extendStart: boolean,
): void {
  const minElev = terrain.minElevation;
  const frames = buildFrames(cw, minElev, exag);
  if (frames.length < 2) return;
  // 坑口に入る端は、開口の中まで少し延ばす（坑門の面とのすき間を出さない）
  const extendBy = 1.0;
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (extendStart && first) {
    first.x -= first.tx * extendBy;
    first.z -= first.tz * extendBy;
  }
  if (extendEnd && last) {
    last.x += last.tx * extendBy;
    last.z += last.tz * extendBy;
  }

  const hw = cw.width / 2;
  const slab = cw.slabThickness;
  const depth = cw.structureDepth;
  const ph = cw.parapetHeight;
  const pt = cw.parapetThickness;
  // 桁は床版の縁から少しだけ内側（張り出しを大きくすると、その影の縁が影の地図の粗さで縞になる）
  const girderHalf = Math.max(1, hw - 0.4);
  const cAsphalt = new THREE.Color(COLORS.asphalt);
  const cParapet = new THREE.Color(COLORS.parapet);
  const cConcrete = new THREE.Color(COLORS.concrete);
  const cGirder = new THREE.Color(COLORS.girder);
  const cSlope = new THREE.Color(cw.embankmentSlope > 0 ? COLORS.slope : COLORS.retainingWall);
  const up = v3(0, 1, 0);
  const down = v3(0, -1, 0);

  const at = (f: FramePoint, offset: number, y: number) =>
    v3(f.x + f.lx * offset, y, f.z + f.lz * offset);
  const groundY = (x: number, z: number) =>
    computeVisualY(sampleTerrainMeshElevation(terrain, x, z), minElev, exag);

  // 側面の足。擁壁（embankmentSlope 0）は縦に地面まで、盛土は法面の足（法尻）まで。
  // 路面が地形より低ければ短い壁だけ（地形は carve で路面より下げてある）
  const isWall = cw.embankmentSlope <= 0;
  const toeOf = (f: FramePoint, side: 1 | -1) => {
    const ex = f.x + f.lx * hw * side;
    const ez = f.z + f.lz * hw * side;
    const groundM = sampleTerrainMeshElevation(terrain, ex, ez);
    const h = f.elevM - groundM;
    if (h <= 0.2) {
      return { x: ex, z: ez, y: f.y - slab - 0.8 };
    }
    if (isWall) {
      return { x: ex, z: ez, y: groundY(ex, ez) - 0.5 };
    }
    const off = h * cw.embankmentSlope;
    const tx = ex + f.lx * off * side;
    const tz = ez + f.lz * off * side;
    return { x: tx, z: tz, y: groundY(tx, tz) - 0.3 };
  };

  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (!a || !b) continue;
    const kind = cw.segmentKinds[i] ?? 'ground';
    const segOut = (side: 1 | -1) =>
      v3(((a.lx + b.lx) / 2) * side, 0, ((a.lz + b.lz) / 2) * side);

    // 路面（高欄の内側）
    mb.addFacingQuad(
      [at(a, hw - pt, a.y), at(a, -(hw - pt), a.y), at(b, -(hw - pt), b.y), at(b, hw - pt, b.y)],
      up,
      cAsphalt,
    );

    for (const side of [1, -1] as const) {
      const out = segOut(side);
      const inward = out.clone().multiplyScalar(-1);
      const oEdge = hw * side;
      const iEdge = (hw - pt) * side;
      // 高欄の天端・内面・外面（外面は床版の下面まで）
      mb.addFacingQuad(
        [at(a, iEdge, a.y + ph), at(a, oEdge, a.y + ph), at(b, oEdge, b.y + ph), at(b, iEdge, b.y + ph)],
        up,
        cParapet,
      );
      mb.addFacingQuad(
        [at(a, iEdge, a.y), at(b, iEdge, b.y), at(b, iEdge, b.y + ph), at(a, iEdge, a.y + ph)],
        inward,
        cParapet,
      );
      mb.addFacingQuad(
        [at(a, oEdge, a.y - slab), at(b, oEdge, b.y - slab), at(b, oEdge, b.y + ph), at(a, oEdge, a.y + ph)],
        out,
        cParapet,
      );

      if (kind === 'bridge') {
        // 桁の側面
        const gEdge = girderHalf * side;
        mb.addFacingQuad(
          [
            at(a, gEdge, a.y - depth),
            at(b, gEdge, b.y - depth),
            at(b, gEdge, b.y - slab),
            at(a, gEdge, a.y - slab),
          ],
          out,
          cGirder,
        );
      } else {
        // 盛土の法面・擁壁（または地形との間をふさぐ短い壁）
        const ta = toeOf(a, side);
        const tb = toeOf(b, side);
        const slopeOut = isWall ? out : out.clone().add(v3(0, 0.6, 0));
        mb.addFacingQuad(
          [at(a, oEdge, a.y - slab), at(b, oEdge, b.y - slab), v3(tb.x, tb.y, tb.z), v3(ta.x, ta.y, ta.z)],
          slopeOut,
          cSlope,
        );
      }
    }

    if (kind === 'bridge') {
      // 床版の下面と桁の下面
      mb.addFacingQuad(
        [at(a, hw, a.y - slab), at(b, hw, b.y - slab), at(b, -hw, b.y - slab), at(a, -hw, a.y - slab)],
        down,
        cConcrete,
      );
      mb.addFacingQuad(
        [
          at(a, girderHalf, a.y - depth),
          at(b, girderHalf, b.y - depth),
          at(b, -girderHalf, b.y - depth),
          at(a, -girderHalf, a.y - depth),
        ],
        down,
        cGirder,
      );
    }
  }

  // 両端の断面（ジオラマの縁で切れた所・坑口の中）
  const capAt = (f: FramePoint, kind: 'bridge' | 'ground', dir: 1 | -1) => {
    const outward = v3(f.tx * dir, 0, f.tz * dir);
    const bottom = kind === 'bridge' ? f.y - depth : f.y - slab - 0.8;
    mb.addFacingQuad(
      [at(f, hw, bottom), at(f, -hw, bottom), at(f, -hw, f.y + ph), at(f, hw, f.y + ph)],
      outward,
      cConcrete,
    );
  };
  if (first) capAt(first, cw.segmentKinds[0] ?? 'ground', -1);
  if (last) capAt(last, cw.segmentKinds[cw.segmentKinds.length - 1] ?? 'ground', 1);

  // 橋台（高架と地上の区間の境）
  for (let i = 1; i < frames.length - 1; i++) {
    const before = cw.segmentKinds[i - 1];
    const after = cw.segmentKinds[i];
    if (before === after) continue;
    const f = frames[i];
    if (!f) continue;
    const dir = after === 'ground' ? 1 : -1;
    const len = 2.2;
    const cx = f.x + f.tx * dir * (len / 2);
    const cz = f.z + f.tz * dir * (len / 2);
    const bottom = Math.min(groundY(cx, cz), f.y - depth) - 0.6;
    mb.addOrientedBox(
      cx,
      cz,
      { x: f.tx, z: f.tz },
      len,
      cw.width + 0.4,
      bottom,
      f.y - slab,
      cConcrete,
      { skipTop: true },
    );
  }
}

function addPiers(
  mb: ColoredMeshBuilder,
  structures: CampusStructuresData,
  terrain: TerrainGrid,
  exag: number,
): void {
  const minElev = terrain.minElevation;
  const byId = new Map((structures.expressways ?? []).map((cw) => [cw.id, cw]));
  const cPier = new THREE.Color(COLORS.pier);
  for (const p of structures.expresswayPiers ?? []) {
    const cw = byId.get(p.carriagewayId);
    if (!cw) continue;
    const depth = cw.structureDepth;
    // 桁の下面（表示）。路面の表示の高さから、縦に誇張しない桁の厚みを引く
    const girderBottom = computeVisualY(p.topElevM + depth, minElev, exag) - depth;
    const capDepth = 1.3;
    const dir = { x: Math.cos(p.angleRad), z: -Math.sin(p.angleRad) };
    mb.addOrientedBox(p.x, p.z, dir, 1.8, p.capLength, girderBottom - capDepth, girderBottom, cPier);
    const ground = computeVisualY(sampleTerrainMeshElevation(terrain, p.x, p.z), minElev, exag);
    mb.addOrientedBox(
      p.x,
      p.z,
      dir,
      p.columnSize,
      p.columnSize,
      ground - 1.0,
      girderBottom - capDepth,
      cPier,
      { skipBottom: true, skipTop: true },
    );
  }
}

function addPortal(
  mb: ColoredMeshBuilder,
  portal: TunnelPortalFeature,
  terrain: TerrainGrid,
  exag: number,
): void {
  const base = computeVisualY(portal.y, terrain.minElevation, exag);
  const theta = portal.angleRad;
  // ローカル +X（トンネルの外）と、ローカル Z（坑門の幅の方向）
  const ax = { x: Math.cos(theta), z: -Math.sin(theta) };
  const az = { x: Math.sin(theta), z: Math.cos(theta) };
  const W = portal.width;
  const hood = portal.hoodDepth ?? 3.2;
  const openH = portal.openingHeight ?? 5.2;
  const top = base + (portal.wallHeight ?? openH + 2);
  const bottom = base - 1.0;
  const openings = (portal.openings ?? [{ offset: 0, width: W * 0.78 }])
    .map((o) => ({ start: Math.max(-W / 2, o.offset - o.width / 2), end: Math.min(W / 2, o.offset + o.width / 2) }))
    .sort((a, b) => a.start - b.start);
  const P = (u: number, v: number, y: number) =>
    v3(portal.x + ax.x * u + az.x * v, y, portal.z + ax.z * u + az.z * v);
  const outX = v3(ax.x, 0, ax.z);
  const inX = v3(-ax.x, 0, -ax.z);
  const outZ = v3(az.x, 0, az.z);
  const inZ = v3(-az.x, 0, -az.z);
  const cWall = new THREE.Color(COLORS.portal);
  const cDark = new THREE.Color(COLORS.dark);

  // 坑門の壁（厚み PORTAL_WALL_THICKNESS）と、その後ろの土の覆い（上面は壁の天端から後ろの地面へ下がる）。
  // 覆いの後端の高さは表示用の地形から引く。下をくぐる道の口（culvert）の覆いは盛土の色
  const tw = Math.min(PORTAL_WALL_THICKNESS, hood);
  const cCover = new THREE.Color((portal.kind ?? 'expressway') === 'culvert' ? COLORS.slope : COLORS.earth);
  const backTop = (v: number) => {
    const p = P(-hood, v, 0);
    const g = computeVisualY(sampleTerrainMeshElevation(terrain, p.x, p.z), terrain.minElevation, exag);
    return Math.max(bottom + 0.5, Math.min(top, g - 0.2));
  };
  const btL = backTop(-W / 2);
  const btR = backTop(W / 2);
  mb.addFacingQuad([P(0, -W / 2, top), P(0, W / 2, top), P(-tw, W / 2, top), P(-tw, -W / 2, top)], v3(0, 1, 0), cWall);
  mb.addFacingQuad([P(0, W / 2, bottom), P(-tw, W / 2, bottom), P(-tw, W / 2, top), P(0, W / 2, top)], outZ, cWall);
  mb.addFacingQuad([P(0, -W / 2, bottom), P(-tw, -W / 2, bottom), P(-tw, -W / 2, top), P(0, -W / 2, top)], inZ, cWall);
  if (hood > tw + 0.1) {
    mb.addFacingQuad([P(-tw, -W / 2, top), P(-tw, W / 2, top), P(-hood, W / 2, btR), P(-hood, -W / 2, btL)], v3(0, 1, 0), cCover);
    mb.addFacingQuad([P(-tw, W / 2, bottom), P(-hood, W / 2, bottom), P(-hood, W / 2, btR), P(-tw, W / 2, top)], outZ, cCover);
    mb.addFacingQuad([P(-tw, -W / 2, bottom), P(-hood, -W / 2, bottom), P(-hood, -W / 2, btL), P(-tw, -W / 2, top)], inZ, cCover);
    mb.addFacingQuad([P(-hood, -W / 2, bottom), P(-hood, W / 2, bottom), P(-hood, W / 2, btR), P(-hood, -W / 2, btL)], inX, cCover);
  } else {
    mb.addFacingQuad([P(-tw, -W / 2, bottom), P(-tw, W / 2, bottom), P(-tw, W / 2, top), P(-tw, -W / 2, top)], inX, cWall);
  }

  // 前面（開口を抜く）
  const frontQuad = (v0: number, v1: number, y0: number, y1: number) => {
    if (v1 - v0 < 1e-3 || y1 - y0 < 1e-3) return;
    mb.addFacingQuad([P(0, v0, y0), P(0, v1, y0), P(0, v1, y1), P(0, v0, y1)], outX, cWall);
  };
  frontQuad(-W / 2, W / 2, base + openH, top);
  let cursor = -W / 2;
  for (const o of openings) {
    frontQuad(cursor, o.start, bottom, base + openH);
    frontQuad(o.start, o.end, bottom, base);
    cursor = o.end;
  }
  frontQuad(cursor, W / 2, bottom, base + openH);

  // 開口の中（暗がり）
  const R = Math.min(OPENING_RECESS, hood - 0.2);
  for (const o of openings) {
    mb.addFacingQuad([P(0, o.start, base), P(-R, o.start, base), P(-R, o.start, base + openH), P(0, o.start, base + openH)], outZ, cDark);
    mb.addFacingQuad([P(0, o.end, base), P(-R, o.end, base), P(-R, o.end, base + openH), P(0, o.end, base + openH)], inZ, cDark);
    mb.addFacingQuad([P(0, o.start, base + openH), P(0, o.end, base + openH), P(-R, o.end, base + openH), P(-R, o.start, base + openH)], v3(0, -1, 0), cDark);
    mb.addFacingQuad([P(0, o.start, base + 0.03), P(0, o.end, base + 0.03), P(-R, o.end, base + 0.03), P(-R, o.start, base + 0.03)], v3(0, 1, 0), cDark);
    mb.addFacingQuad([P(-R, o.start, base), P(-R, o.end, base), P(-R, o.end, base + openH), P(-R, o.start, base + openH)], outX, cDark);
  }
}

/**
 * 名神高速道路の 1 つのメッシュ（無ければ null）
 */
export function buildExpresswayMesh(
  structures: CampusStructuresData,
  terrain: TerrainGrid,
  config: CampusConfig,
): THREE.Mesh | null {
  const carriageways = structures.expressways ?? [];
  const portals = structures.tunnelPortals ?? [];
  if (carriageways.length === 0 && portals.length === 0) return null;
  const exag = config.verticalExaggeration;
  const mb = new ColoredMeshBuilder();
  const expresswayPortals = portals.filter((p) => (p.kind ?? 'expressway') === 'expressway');
  const nearPortal = (pt: [number, number, number] | undefined) =>
    Boolean(pt) && expresswayPortals.some((p) => Math.hypot(p.x - (pt?.[0] ?? 0), p.z - (pt?.[2] ?? 0)) < 15);

  for (const cw of carriageways) {
    addCarriageway(
      mb,
      cw,
      terrain,
      exag,
      nearPortal(cw.points[cw.points.length - 1]),
      nearPortal(cw.points[0]),
    );
  }
  addPiers(mb, structures, terrain, exag);
  for (const portal of portals) addPortal(mb, portal, terrain, exag);
  if (mb.vertexCount === 0) return null;

  const mesh = new THREE.Mesh(
    mb.build(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 }),
  );
  mesh.name = 'meishin-expressway';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
