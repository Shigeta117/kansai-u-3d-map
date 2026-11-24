import * as THREE from 'three';
import type { CampusClosure } from '../domain/closures';
import { computeVisualY, sampleElevation } from '../domain/projection';
import type { CampusConfig, TerrainGrid } from '../domain/types';
import { sampleTerrainMeshElevation } from './DioramaBaseBuilder';

/**
 * 工事の範囲（closures.json）の見せ方: 囲いの線に沿った白い仮囲い（工事用の白いパネル）と、範囲の地面の薄い斜線。
 *
 * - 仮囲い: 高さ 3m（推定。工事用の仮囲いの一般的な高さ）の白い板を両面に貼る。支柱を 3.6m おきに。
 *   不透明で動かないので、建物などとまとめて描く（staticBatches。描き方の設定が同じなら描画命令は増えない）
 * - 斜線: 範囲の外接の矩形に 1 枚の canvas で斜線と縁取りを描き、地形に沿わせた格子に貼る（透明なので 1 回の描画命令）
 * - 範囲の中の建物を薄くする・灰色のシートで覆うのは BuildingBuilder（BuildingFeature.construction）
 */
export const FENCE_HEIGHT_M = 3.0;
const FENCE_SINK_M = 0.6;
const FENCE_STEP_M = 2.0;
const POST_SPACING_M = 3.6;
const POST_SIZE_M = 0.12;
const HATCH_CELL_M = 2.0;
/** 斜線の面を地形の上に浮かせる高さ（道の帯は最大 0.28m 浮く） */
const HATCH_LIFT_M = 0.42;
const HATCH_SPACING_M = 2.6;
const HATCH_LINE_M = 0.42;
const HATCH_TEXTURE_MAX_PX = 1024;

export const FENCE_PANEL_HEX = '#FAFAF7';
export const FENCE_POST_HEX = '#BFC2BD';

export interface ConstructionBuildResult {
  group: THREE.Group;
  /** 仮囲い（不透明。まとめて描く元） */
  fences: THREE.Group;
  /** 範囲の地面の斜線（透明。まとめない） */
  hatch: THREE.Mesh[];
}

interface Sampler {
  ground(x: number, z: number): number;
  top(x: number, z: number): number;
}

function makeSampler(terrain: TerrainGrid, config: CampusConfig): Sampler {
  const exag = config.verticalExaggeration;
  const min = terrain.minElevation;
  return {
    // 地形のメッシュの面そのものの高さ（三角形の分け方まで同じ）
    ground: (x, z) => computeVisualY(sampleTerrainMeshElevation(terrain, x, z), min, exag),
    // 道の帯は双一次の高さに浮かせて描くので、斜線はその両方より上に置く
    top: (x, z) =>
      Math.max(
        computeVisualY(sampleTerrainMeshElevation(terrain, x, z), min, exag),
        computeVisualY(sampleElevation(terrain, x, z), min, exag),
      ),
  };
}

function resample(points: readonly [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i]!;
    const [x1, z1] = points[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  const last = points[points.length - 1];
  if (last) out.push([last[0], last[1]]);
  return out;
}

/** 囲いの線 1 本の板（両面。面ごとに外向きの法線） */
function buildFencePanels(points: readonly [number, number][], s: Sampler): THREE.BufferGeometry {
  const pts = resample(points, FENCE_STEP_M);
  const pos: number[] = [];
  const nor: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i]!;
    const [x1, z1] = pts[i + 1]!;
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-6) continue;
    const nx = (z1 - z0) / len;
    const nz = -(x1 - x0) / len;
    const g0 = s.ground(x0, z0);
    const g1 = s.ground(x1, z1);
    const b0 = g0 - FENCE_SINK_M;
    const b1 = g1 - FENCE_SINK_M;
    const t0 = g0 + FENCE_HEIGHT_M;
    const t1 = g1 + FENCE_HEIGHT_M;
    // 表
    pos.push(x0, b0, z0, x1, b1, z1, x1, t1, z1, x0, b0, z0, x1, t1, z1, x0, t0, z0);
    for (let k = 0; k < 6; k++) nor.push(nx, 0, nz);
    // 裏
    pos.push(x0, b0, z0, x1, t1, z1, x1, b1, z1, x0, b0, z0, x0, t0, z0, x1, t1, z1);
    for (let k = 0; k < 6; k++) nor.push(-nx, 0, -nz);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

/** 支柱（線に沿って POST_SPACING_M おき。両端にも） */
function buildFencePosts(points: readonly [number, number][], s: Sampler): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = [];
  const at: [number, number][] = [];
  let carry = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i]!;
    const [x1, z1] = points[i + 1]!;
    const len = Math.hypot(x1 - x0, z1 - z0);
    let d = carry;
    while (d <= len) {
      at.push([x0 + ((x1 - x0) * d) / len, z0 + ((z1 - z0) * d) / len]);
      d += POST_SPACING_M;
    }
    carry = d - len;
  }
  const last = points[points.length - 1];
  if (last) at.push(last);
  for (const [x, z] of at) {
    const g = s.ground(x, z);
    const h = FENCE_HEIGHT_M + FENCE_SINK_M + 0.05;
    const box = new THREE.BoxGeometry(POST_SIZE_M, h, POST_SIZE_M);
    box.translate(x, g - FENCE_SINK_M + h / 2, z);
    geos.push(box.index ? box.toNonIndexed() : box);
    box.dispose();
  }
  return geos;
}

function mergePlain(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const g of geos) count += g.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.set([p.getX(i), p.getY(i), p.getZ(i)], (o + i) * 3);
      nor.set([n.getX(i), n.getY(i), n.getZ(i)], (o + i) * 3);
    }
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

function pointInPolygon(x: number, z: number, poly: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToPolygon(x: number, z: number, poly: readonly [number, number][]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j]!;
    const [bx, bz] = poly[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx - x, az + t * dz - z));
  }
  return best;
}

interface Box {
  minX: number;
  minZ: number;
  w: number;
  h: number;
}

function hatchTexture(area: readonly [number, number][], box: Box): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const scale = HATCH_TEXTURE_MAX_PX / Math.max(box.w, box.h);
  const W = Math.max(2, Math.round(box.w * scale));
  const H = Math.max(2, Math.round(box.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const px = (x: number) => (x - box.minX) * scale;
  const pz = (z: number) => (z - box.minZ) * scale;
  ctx.beginPath();
  area.forEach(([x, z], i) => (i === 0 ? ctx.moveTo(px(x), pz(z)) : ctx.lineTo(px(x), pz(z))));
  ctx.closePath();
  ctx.fillStyle = 'rgba(214, 138, 86, 0.10)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(196, 98, 52, 0.50)';
  ctx.lineWidth = HATCH_LINE_M * scale;
  const step = HATCH_SPACING_M * scale;
  for (let d = -H; d < W + H; d += step) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + H, H);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(196, 98, 52, 0.62)';
  ctx.lineWidth = 0.5 * scale;
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 範囲の外接の矩形を HATCH_CELL_M の格子に切り、範囲にかかる升だけを地形に沿わせて張る */
function buildHatchGeometry(area: readonly [number, number][], box: Box, s: Sampler): THREE.BufferGeometry {
  const nx = Math.max(1, Math.ceil(box.w / HATCH_CELL_M));
  const nz = Math.max(1, Math.ceil(box.h / HATCH_CELL_M));
  const cellW = box.w / nx;
  const cellH = box.h / nz;
  const reach = Math.hypot(cellW, cellH) / 2 + 0.5;
  const index = new Map<number, number>();
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const vert = (i: number, k: number): number => {
    const key = k * (nx + 1) + i;
    const got = index.get(key);
    if (got !== undefined) return got;
    const x = box.minX + i * cellW;
    const z = box.minZ + k * cellH;
    const id = pos.length / 3;
    pos.push(x, s.top(x, z) + HATCH_LIFT_M, z);
    uv.push((x - box.minX) / box.w, 1 - (z - box.minZ) / box.h);
    index.set(key, id);
    return id;
  };
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const cx = box.minX + (i + 0.5) * cellW;
      const cz = box.minZ + (k + 0.5) * cellH;
      if (!pointInPolygon(cx, cz, area) && distToPolygon(cx, cz, area) > reach) continue;
      const a = vert(i, k);
      const b = vert(i + 1, k);
      const c = vert(i + 1, k + 1);
      const d = vert(i, k + 1);
      idx.push(a, d, b, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function buildConstructionGroup(
  closures: readonly CampusClosure[],
  terrain: TerrainGrid,
  config: CampusConfig,
): ConstructionBuildResult {
  const group = new THREE.Group();
  group.name = 'construction-closures';
  const fences = new THREE.Group();
  fences.name = 'construction-fences';
  group.add(fences);
  const hatch: THREE.Mesh[] = [];
  if (closures.length === 0) return { group, fences, hatch };
  const s = makeSampler(terrain, config);

  const panelGeos: THREE.BufferGeometry[] = [];
  const postGeos: THREE.BufferGeometry[] = [];
  for (const c of closures) {
    for (const f of c.fences) {
      if (f.points.length < 2) continue;
      panelGeos.push(buildFencePanels(f.points, s));
      postGeos.push(...buildFencePosts(f.points, s));
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of c.area) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const pad = 1;
    const box: Box = { minX: minX - pad, minZ: minZ - pad, w: maxX - minX + pad * 2, h: maxZ - minZ + pad * 2 };
    // canvas の無い所（テスト）でも形は作る（模様だけ無し）
    const tex = hatchTexture(c.area, box);
    {
      const mesh = new THREE.Mesh(
        buildHatchGeometry(c.area, box, s),
        new THREE.MeshStandardMaterial({
          map: tex,
          ...(tex ? {} : { color: '#D68A56', opacity: 0.25 }),
          transparent: true,
          depthWrite: false,
          roughness: 1,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        }),
      );
      mesh.name = `construction-hatch-${c.id}`;
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      group.add(mesh);
      hatch.push(mesh);
    }
  }

  if (panelGeos.length > 0) {
    const panels = new THREE.Mesh(
      mergePlain(panelGeos),
      // 日の当たらない面でも白い板に見えるよう、少しだけ自ら光らせる
      new THREE.MeshStandardMaterial({
        color: FENCE_PANEL_HEX,
        roughness: 0.82,
        metalness: 0,
        emissive: FENCE_PANEL_HEX,
        emissiveIntensity: 0.16,
      }),
    );
    panels.name = 'construction-fence-panels';
    panels.castShadow = true;
    panels.receiveShadow = true;
    fences.add(panels);
    for (const g of panelGeos) g.dispose();
  }
  if (postGeos.length > 0) {
    const posts = new THREE.Mesh(
      mergePlain(postGeos),
      new THREE.MeshStandardMaterial({ color: FENCE_POST_HEX, roughness: 0.7, metalness: 0.1 }),
    );
    posts.name = 'construction-fence-posts';
    posts.castShadow = true;
    posts.receiveShadow = true;
    fences.add(posts);
    for (const g of postGeos) g.dispose();
  }
  return { group, fences, hatch };
}
