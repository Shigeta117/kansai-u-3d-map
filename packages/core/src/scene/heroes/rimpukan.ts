import * as THREE from 'three';
import type { HeroBuilder } from './types';

// Palette from visual research and project brief
const WALL_HEX = '#8A5641';
const GLASS_HEX = '#4F6670';
const SOFFIT_HEX = '#C9A57E';
const COLUMN_HEX = '#B9B1A5';
const SOLAR_HEX = '#3A3F47';
const SOIL_HEX = '#8C7A58';
const RAILING_HEX = '#E8E8E4';
const TRUNK_HEX = '#6B5444';
const SAKURA_HEX = '#F1B9C7';
const POLE_HEX = '#F4F4F4';
const UPPER_HEX = '#D9CCB3';
const STAIR_HEX = '#8E5848';
const OPENING_HEX = '#2E3438';
const PLAQUE_FRAME_HEX = '#CFC5B0';
const PLAQUE_INNER_HEX = '#B9A983';
const WINDOW_HEX = '#3E4A52';

// Approximate outward facing direction of the west drum front (WSW toward Main Street)
const FRONT_DIR_RAW_X = -0.92;
const FRONT_DIR_RAW_Z = 0.4;

type Point2D = [number, number];

interface PerimeterSample {
  x: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
}

interface WallHit {
  worldX: number;
  worldZ: number;
  localZ: number;
  nx: number;
  nz: number;
}

function signedAreaXZ(ring: Point2D[]): number {
  let area2 = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (!a || !b) continue;
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  return area2 * 0.5;
}

/**
 * Normalizes a 2D (x, z) polygon ring to clockwise orientation when viewed from +Y.
 * For CW-from-+Y rings, edge a->b has outward normal (dz/len, -dx/len)
 * and inward normal (-dz/len, dx/len).
 */
function normalizeRingCW(polygon: Point2D[], cx: number, cz: number): Point2D[] {
  const cleaned: Point2D[] = [];
  for (const pt of polygon) {
    const prev = cleaned[cleaned.length - 1];
    if (prev && Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) < 1e-4) {
      continue;
    }
    cleaned.push([pt[0], pt[1]]);
  }
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (
    cleaned.length > 1 &&
    first &&
    last &&
    Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-4
  ) {
    cleaned.pop();
  }
  if (cleaned.length < 3) {
    return [
      [cx - 10, cz + 10],
      [cx - 10, cz - 10],
      [cx + 10, cz - 10],
      [cx + 10, cz + 10],
    ];
  }
  if (signedAreaXZ(cleaned) < 0) {
    cleaned.reverse();
  }
  return cleaned;
}

/**
 * Offsets each vertex inward by `dist` meters using clamped edge-normal miters.
 * Handles concave corners cleanly without poking vertices outside the footprint.
 */
function insetPolygon(ringCW: Point2D[], dist: number): Point2D[] {
  const n = ringCW.length;
  if (n < 3) return ringCW;
  const out: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ringCW[(i - 1 + n) % n];
    const curr = ringCW[i];
    const next = ringCW[(i + 1) % n];
    if (!prev || !curr || !next) continue;

    const dx1 = curr[0] - prev[0];
    const dz1 = curr[1] - prev[1];
    const len1 = Math.hypot(dx1, dz1);
    const dx2 = next[0] - curr[0];
    const dz2 = next[1] - curr[1];
    const len2 = Math.hypot(dx2, dz2);

    if (len1 < 1e-6 || len2 < 1e-6) {
      out.push([curr[0], curr[1]]);
      continue;
    }

    const n1x = -dz1 / len1;
    const n1z = dx1 / len1;
    const n2x = -dz2 / len2;
    const n2z = dx2 / len2;

    const bx = n1x + n2x;
    const bz = n1z + n2z;
    const bLen = Math.hypot(bx, bz);
    if (bLen < 1e-4) {
      out.push([curr[0] + n1x * dist, curr[1] + n1z * dist]);
      continue;
    }

    const ux = bx / bLen;
    const uz = bz / bLen;
    const cosHalf = ux * n1x + uz * n1z;
    const miterScale = cosHalf > 0.45 ? Math.min(2.2, 1 / cosHalf) : 2.2;
    out.push([curr[0] + ux * dist * miterScale, curr[1] + uz * dist * miterScale]);
  }
  return out;
}

function ringPerimeter(ringCW: Point2D[]): number {
  let total = 0;
  const n = ringCW.length;
  for (let i = 0; i < n; i++) {
    const a = ringCW[i];
    const b = ringCW[(i + 1) % n];
    if (!a || !b) continue;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

function pointInPolygon(x: number, z: number, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (!pi || !pj) continue;
    const [xi, zi] = pi;
    const [xj, zj] = pj;
    const intersect =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function samplePerimeter(ringCW: Point2D[], approxStep: number): PerimeterSample[] {
  const total = ringPerimeter(ringCW);
  if (total < 1e-4) return [];
  const count = Math.max(4, Math.round(total / approxStep));
  const step = total / count;
  const samples: PerimeterSample[] = [];

  const n = ringCW.length;
  let edgeIdx = 0;
  let edgeStartDist = 0;
  let nextSampleDist = step * 0.5;

  while (edgeIdx < n && samples.length < count) {
    const a = ringCW[edgeIdx];
    const b = ringCW[(edgeIdx + 1) % n];
    if (!a || !b) {
      edgeIdx++;
      continue;
    }
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) {
      edgeIdx++;
      continue;
    }
    const edgeEndDist = edgeStartDist + len;
    const tx = dx / len;
    const tz = dz / len;
    const nx = tz;
    const nz = -tx;

    while (nextSampleDist <= edgeEndDist && samples.length < count) {
      const t = (nextSampleDist - edgeStartDist) / len;
      samples.push({
        x: a[0] + dx * t,
        z: a[1] + dz * t,
        tx,
        tz,
        nx,
        nz,
      });
      nextSampleDist += step;
    }
    edgeStartDist = edgeEndDist;
    edgeIdx++;
  }

  return samples;
}

/**
 * Builds vertical side wall geometry along `ringCW` from `yBottom` to `yTop`.
 * U advances continuously by arc length divided by `uvUnitU` so vertical stripes
 * match wall length seamlessly around curves and angled edges.
 */
function buildSideWallGeometry(
  ringCW: Point2D[],
  yBottom: number,
  yTop: number,
  uvUnitU: number,
  uvUnitV: number,
  flipInward = false,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const n = ringCW.length;
  const h = yTop - yBottom;
  const vTop = h / uvUnitV;
  let cumDist = 0;

  for (let i = 0; i < n; i++) {
    const a = ringCW[i];
    const b = ringCW[(i + 1) % n];
    if (!a || !b) continue;

    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;

    const sign = flipInward ? -1 : 1;
    const nx = (dz / len) * sign;
    const nz = (-dx / len) * sign;

    const u0 = cumDist / uvUnitU;
    const u1 = (cumDist + len) / uvUnitU;
    const base = positions.length / 3;

    positions.push(
      a[0], yBottom, a[1],
      b[0], yBottom, b[1],
      b[0], yTop, b[1],
      a[0], yTop, a[1],
    );
    normals.push(
      nx, 0, nz,
      nx, 0, nz,
      nx, 0, nz,
      nx, 0, nz,
    );
    uvs.push(u0, 0, u1, 0, u1, vTop, u0, vTop);

    if (flipInward) {
      indices.push(base, base + 2, base + 3, base, base + 1, base + 2);
    } else {
      indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }

    cumDist += len;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function buildCapGeometry(
  ringCW: Point2D[],
  y: number,
  facing: 'up' | 'down',
): THREE.BufferGeometry {
  const shapePts = ringCW.map(([x, z]) => new THREE.Vector2(x, -z));
  if (THREE.ShapeUtils.isClockWise(shapePts)) {
    shapePts.reverse();
  }
  const shape = new THREE.Shape(shapePts);
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);

  if (facing === 'down') {
    const idx = geo.getIndex();
    if (idx) {
      for (let i = 0; i + 2 < idx.count; i += 3) {
        const i1 = idx.getX(i + 1);
        const i2 = idx.getX(i + 2);
        idx.setX(i + 1, i2);
        idx.setX(i + 2, i1);
      }
      idx.needsUpdate = true;
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a single closed thin perimeter wall (outer face, inner face, top rim)
 * between `outerRingCW` and `innerRingCW` of matching vertex count.
 */
function buildThinPerimeterWallGeometry(
  outerRingCW: Point2D[],
  innerRingCW: Point2D[],
  yBottom: number,
  yTop: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const n = Math.min(outerRingCW.length, innerRingCW.length);

  for (let i = 0; i < n; i++) {
    const oA = outerRingCW[i];
    const oB = outerRingCW[(i + 1) % n];
    const iA = innerRingCW[i];
    const iB = innerRingCW[(i + 1) % n];
    if (!oA || !oB || !iA || !iB) continue;

    const odx = oB[0] - oA[0];
    const odz = oB[1] - oA[1];
    const oLen = Math.hypot(odx, odz);
    if (oLen > 1e-6) {
      const nx = odz / oLen;
      const nz = -odx / oLen;
      const base = positions.length / 3;
      positions.push(
        oA[0], yBottom, oA[1],
        oB[0], yBottom, oB[1],
        oB[0], yTop, oB[1],
        oA[0], yTop, oA[1],
      );
      normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
      indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }

    const idx = iB[0] - iA[0];
    const idz = iB[1] - iA[1];
    const iLen = Math.hypot(idx, idz);
    if (iLen > 1e-6) {
      const nx = -idz / iLen;
      const nz = idx / iLen;
      const base = positions.length / 3;
      positions.push(
        iA[0], yBottom, iA[1],
        iB[0], yBottom, iB[1],
        iB[0], yTop, iB[1],
        iA[0], yTop, iA[1],
      );
      normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
      indices.push(base, base + 2, base + 3, base, base + 1, base + 2);
    }

    // Top rim quad facing +Y
    const topBase = positions.length / 3;
    positions.push(
      oA[0], yTop, oA[1],
      oB[0], yTop, oB[1],
      iB[0], yTop, iB[1],
      iA[0], yTop, iA[1],
    );
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    indices.push(topBase, topBase + 3, topBase + 2, topBase, topBase + 2, topBase + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

/**
 * Creates a multiplicative vertical stripe CanvasTexture.
 * Paired with material.color = '#8A5641':
 * - #FFFFFF stripe renders as #8A5641
 * - #DCDCE7 stripe renders as ~#76493A in sRGB after linear multiplication
 * Returns null in headless Node environments where `document` is unavailable.
 */
function createVerticalStripeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const w = 64;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w / 2, h);
  ctx.fillStyle = '#DCDCE7';
  ctx.fillRect(w / 2, 0, w / 2, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Intersects a vertical plane at `targetLx` (in front-group local X) with `ringCW`
 * and returns the front-most outward-facing hit on the west drum facade.
 */
function sampleFrontWallAt(
  ringCW: Point2D[],
  anchorX: number,
  anchorZ: number,
  fx: number,
  fz: number,
  targetLx: number,
): WallHit | null {
  let best: WallHit | null = null;
  const n = ringCW.length;

  for (let i = 0; i < n; i++) {
    const a = ringCW[i];
    const b = ringCW[(i + 1) % n];
    if (!a || !b) continue;

    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;

    const nx = dz / len;
    const nz = -dx / len;
    if (nx * fx + nz * fz < 0.15) continue;

    const lxA = (a[0] - anchorX) * fz + (a[1] - anchorZ) * -fx;
    const lzA = (a[0] - anchorX) * fx + (a[1] - anchorZ) * fz;
    const lxB = (b[0] - anchorX) * fz + (b[1] - anchorZ) * -fx;
    const lzB = (b[0] - anchorX) * fx + (b[1] - anchorZ) * fz;

    const minLx = Math.min(lxA, lxB);
    const maxLx = Math.max(lxA, lxB);
    if (targetLx < minLx - 1e-4 || targetLx > maxLx + 1e-4) continue;

    const span = lxB - lxA;
    const t = Math.abs(span) > 1e-6 ? Math.max(0, Math.min(1, (targetLx - lxA) / span)) : 0.5;
    const localZ = lzA + (lzB - lzA) * t;
    if (!best || localZ > best.localZ) {
      best = {
        worldX: a[0] + dx * t,
        worldZ: a[1] + dz * t,
        localZ,
        nx,
        nz,
      };
    }
  }

  return best;
}

function deterministicHash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

interface EastWingFrame {
  midX: number;
  midZ: number;
  uNEx: number;
  uNEz: number;
  nInX: number;
  nInZ: number;
  edgeLen: number;
}

function findEastWingFrame(ringCW: Point2D[], cx: number, cz: number): EastWingFrame {
  let bestLen = -1;
  let bestA: Point2D | null = null;
  let bestB: Point2D | null = null;

  const n = ringCW.length;
  // Prefer the longest SE-facing edge on the eastern side (P10 -> P11 on Rimpukan)
  for (let i = 0; i < n; i++) {
    const a = ringCW[i];
    const b = ringCW[(i + 1) % n];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const mx = (a[0] + b[0]) * 0.5;
    const nx = dz / len;
    const nz = -dx / len;
    if (mx >= cx && nx > 0 && nz > 0 && len > bestLen) {
      bestLen = len;
      bestA = a;
      bestB = b;
    }
  }

  // Fallback to longest overall edge if polygon is non-standard
  if (!bestA || !bestB) {
    for (let i = 0; i < n; i++) {
      const a = ringCW[i];
      const b = ringCW[(i + 1) % n];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > bestLen) {
        bestLen = len;
        bestA = a;
        bestB = b;
      }
    }
  }

  if (!bestA || !bestB || bestLen < 1e-4) {
    return {
      midX: cx + 20,
      midZ: cz,
      uNEx: 1,
      uNEz: 0,
      nInX: 0,
      nInZ: -1,
      edgeLen: 20,
    };
  }

  const dx = bestB[0] - bestA[0];
  const dz = bestB[1] - bestA[1];
  return {
    midX: (bestA[0] + bestB[0]) * 0.5,
    midZ: (bestA[1] + bestB[1]) * 0.5,
    uNEx: -dx / bestLen,
    uNEz: -dz / bestLen,
    nInX: -dz / bestLen,
    nInZ: dx / bestLen,
    edgeLen: bestLen,
  };
}

export const buildRimpukan: HeroBuilder = (ctx) => {
  const { building, groundVisualY } = ctx;
  const cx = building.centroid.x;
  const cz = building.centroid.z;

  const totalH = building.height > 6 ? building.height : 16.6;
  const floor1H = 4.2;
  const solarBandH = 2.5; // photo: dark panel band is ~1/6 of the brown wall band, clearly heavier than the white fence
  const bodyTopH = Math.max(floor1H + 4, totalH - solarBandH);
  const roofH = bodyTopH + solarBandH; // 16.6m for default height 16.6

  const ringCW = normalizeRingCW(building.polygon, cx, cz);
  const ring1F = insetPolygon(ringCW, 2.5);
  const ringRoofSoil = insetPolygon(ringCW, 1.0);
  const ringColumns = insetPolygon(ringCW, 0.95);
  const ringRailingOuter = insetPolygon(ringCW, 0.2);
  const ringRailingInner = insetPolygon(ringCW, 0.32);
  const ringPoles = insetPolygon(ringCW, 0.8);
  const ringSakuraBounds = insetPolygon(ringCW, 2.0);

  const group = new THREE.Group();
  group.name = 'hero-rimpukan';

  // --- Shared materials ---
  const stripeTex = createVerticalStripeTexture();
  const wallMat = new THREE.MeshStandardMaterial({
    color: WALL_HEX,
    roughness: 0.78,
    metalness: 0.04,
    ...(stripeTex ? { map: stripeTex } : {}),
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: GLASS_HEX,
    roughness: 0.62,
    metalness: 0.08,
  });
  const soffitMat = new THREE.MeshStandardMaterial({
    color: SOFFIT_HEX,
    roughness: 0.78,
    metalness: 0.03,
  });
  const columnMat = new THREE.MeshStandardMaterial({
    color: COLUMN_HEX,
    roughness: 0.8,
    metalness: 0.03,
  });
  const solarMat = new THREE.MeshStandardMaterial({
    color: SOLAR_HEX,
    roughness: 0.64,
    metalness: 0.1,
  });
  const soilMat = new THREE.MeshStandardMaterial({
    color: SOIL_HEX,
    roughness: 0.9,
    metalness: 0.02,
  });
  const railingMat = new THREE.MeshStandardMaterial({
    color: RAILING_HEX,
    roughness: 0.65,
    metalness: 0.25,
  });
  const trunkMat = new THREE.MeshStandardMaterial({
    color: TRUNK_HEX,
    roughness: 0.88,
    metalness: 0.02,
  });
  const sakuraMat = new THREE.MeshStandardMaterial({
    color: SAKURA_HEX,
    roughness: 0.84,
    metalness: 0.02,
  });
  const poleMat = new THREE.MeshStandardMaterial({
    color: POLE_HEX,
    roughness: 0.65,
    metalness: 0.2,
  });
  const upperMat = new THREE.MeshStandardMaterial({
    color: UPPER_HEX,
    roughness: 0.76,
    metalness: 0.04,
  });
  const stairMat = new THREE.MeshStandardMaterial({
    color: STAIR_HEX,
    roughness: 0.8,
    metalness: 0.04,
  });
  const openingMat = new THREE.MeshStandardMaterial({
    color: OPENING_HEX,
    roughness: 0.85,
    metalness: 0.04,
  });
  const plaqueFrameMat = new THREE.MeshStandardMaterial({
    color: PLAQUE_FRAME_HEX,
    roughness: 0.74,
    metalness: 0.06,
  });
  const plaqueInnerMat = new THREE.MeshStandardMaterial({
    color: PLAQUE_INNER_HEX,
    roughness: 0.72,
    metalness: 0.08,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: WINDOW_HEX,
    roughness: 0.62,
    metalness: 0.08,
  });

  // --- West drum front frame (local +Z points WSW outward, local +X points SSE) ---
  const frontDirLen = Math.hypot(FRONT_DIR_RAW_X, FRONT_DIR_RAW_Z);
  const fx = FRONT_DIR_RAW_X / frontDirLen;
  const fz = FRONT_DIR_RAW_Z / frontDirLen;

  let maxProj = -Infinity;
  for (const [x, z] of ringCW) {
    const p = x * fx + z * fz;
    if (p > maxProj) maxProj = p;
  }

  let minFrontLx = Infinity;
  let maxFrontLx = -Infinity;
  for (const [x, z] of ringCW) {
    const p = x * fx + z * fz;
    if (p >= maxProj - 4.5) {
      const lx = x * fz + z * -fx;
      if (lx < minFrontLx) minFrontLx = lx;
      if (lx > maxFrontLx) maxFrontLx = lx;
    }
  }
  const frontCenterLx = Number.isFinite(minFrontLx)
    ? (minFrontLx + maxFrontLx) * 0.5
    : cx * fz + cz * -fx;

  // Initial point along front center ray to sample exact rim intersection
  const probeAnchorX = frontCenterLx * fz + maxProj * fx;
  const probeAnchorZ = frontCenterLx * -fx + maxProj * fz;
  const centerRimHit = sampleFrontWallAt(ringCW, probeAnchorX, probeAnchorZ, fx, fz, 0);
  const anchorX = centerRimHit ? centerRimHit.worldX : probeAnchorX;
  const anchorZ = centerRimHit ? centerRimHit.worldZ : probeAnchorZ;

  const toFrontLocal = (x: number, z: number): [number, number] => {
    const dx = x - anchorX;
    const dz = z - anchorZ;
    return [dx * fz + dz * -fx, dx * fx + dz * fz];
  };

  // --- 1. Main 2F-4F body (4.2m - 15.2m) with vertical stripes ---
  const perim = ringPerimeter(ringCW);
  const stripePairCount = Math.max(1, Math.round(perim / 1.2));
  const stripePairWidth = perim / stripePairCount; // ~1.2m per pair = ~0.6m per stripe

  const bodyWallGeo = buildSideWallGeometry(
    ringCW,
    groundVisualY + floor1H,
    groundVisualY + bodyTopH,
    stripePairWidth,
    1.2,
  );
  const bodyWallMesh = new THREE.Mesh(bodyWallGeo, wallMat);
  bodyWallMesh.name = 'rimpukan-body-walls';
  bodyWallMesh.castShadow = true;
  bodyWallMesh.receiveShadow = true;
  group.add(bodyWallMesh);

  // Overhang soffit (light wood tone on the underside of the 2F-4F projection)
  const soffitGeo = buildCapGeometry(ringCW, groundVisualY + floor1H, 'down');
  const soffitMesh = new THREE.Mesh(soffitGeo, soffitMat);
  soffitMesh.name = 'rimpukan-body-soffit';
  soffitMesh.receiveShadow = true;
  group.add(soffitMesh);

  // --- 2. 1F recessed dark glass volume (0 - 4.2m) ---
  const glassWallGeo = buildSideWallGeometry(
    ring1F,
    groundVisualY,
    groundVisualY + floor1H,
    4.0,
    4.0,
  );
  const glassMesh = new THREE.Mesh(glassWallGeo, glassMat);
  glassMesh.name = 'rimpukan-floor1-glass';
  glassMesh.castShadow = true;
  glassMesh.receiveShadow = true;
  group.add(glassMesh);

  // --- 3. 1F stone columns (square colonnade + 2 front round columns) ---
  const denseColSamples = samplePerimeter(ringColumns, 0.6);
  let roundColNorth: PerimeterSample | null = null;
  let roundColNorthLz = -Infinity;
  let roundColSouth: PerimeterSample | null = null;
  let roundColSouthLz = -Infinity;

  for (const s of denseColSamples) {
    const [lx, lz] = toFrontLocal(s.x, s.z);
    if (lz <= -4.6 && lz >= -11.0) {
      if (lx < -3.0 && lz > roundColNorthLz) {
        roundColNorthLz = lz;
        roundColNorth = s;
      } else if (lx > 3.0 && lz > roundColSouthLz) {
        roundColSouthLz = lz;
        roundColSouth = s;
      }
    }
  }

  const roundCols: PerimeterSample[] = [];
  if (roundColNorth) roundCols.push(roundColNorth);
  if (roundColSouth) roundCols.push(roundColSouth);

  const dummy = new THREE.Object3D();

  if (roundCols.length > 0) {
    const roundColGeo = new THREE.CylinderGeometry(0.46, 0.46, floor1H, 14);
    roundColGeo.translate(0, floor1H * 0.5, 0);
    const roundColInst = new THREE.InstancedMesh(roundColGeo, columnMat, roundCols.length);
    roundColInst.name = 'rimpukan-columns-round';
    roundColInst.receiveShadow = true;
    for (let i = 0; i < roundCols.length; i++) {
      const c = roundCols[i];
      if (!c) continue;
      dummy.position.set(c.x, groundVisualY, c.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      roundColInst.setMatrixAt(i, dummy.matrix);
    }
    roundColInst.instanceMatrix.needsUpdate = true;
    roundColInst.computeBoundingBox();
    roundColInst.computeBoundingSphere();
    group.add(roundColInst);
  }

  const rawSquareCols = samplePerimeter(ringColumns, 9.0);
  const squareCols = rawSquareCols.filter((s) => {
    const [lx, lz] = toFrontLocal(s.x, s.z);
    // Exclude columns inside the front grand staircase footprint
    if (Math.abs(lx) < 9.8 && lz > -4.4) return false;
    // Avoid duplicating near the two front round columns
    for (const rc of roundCols) {
      if (Math.hypot(s.x - rc.x, s.z - rc.z) < 4.0) return false;
    }
    return true;
  });

  if (squareCols.length > 0) {
    const squareColGeo = new THREE.BoxGeometry(0.9, floor1H, 0.9);
    squareColGeo.translate(0, floor1H * 0.5, 0);
    const squareColInst = new THREE.InstancedMesh(squareColGeo, columnMat, squareCols.length);
    squareColInst.name = 'rimpukan-columns-square';
    squareColInst.receiveShadow = true;
    for (let i = 0; i < squareCols.length; i++) {
      const c = squareCols[i];
      if (!c) continue;
      dummy.position.set(c.x, groundVisualY, c.z);
      dummy.rotation.set(0, Math.atan2(c.nx, c.nz), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      squareColInst.setMatrixAt(i, dummy.matrix);
    }
    squareColInst.instanceMatrix.needsUpdate = true;
    squareColInst.computeBoundingBox();
    squareColInst.computeBoundingSphere();
    group.add(squareColInst);
  }

  // --- 4. Top band (15.2m - 16.6m): dark grey solar fence ---
  const solarWallGeo = buildSideWallGeometry(
    ringCW,
    groundVisualY + bodyTopH,
    groundVisualY + roofH,
    4.0,
    solarBandH,
  );
  const solarWallMesh = new THREE.Mesh(solarWallGeo, solarMat);
  solarWallMesh.name = 'rimpukan-solar-band';
  solarWallMesh.castShadow = true;
  solarWallMesh.receiveShadow = true;
  group.add(solarWallMesh);

  const solarTopGeo = buildCapGeometry(ringCW, groundVisualY + roofH, 'up');
  const solarTopMesh = new THREE.Mesh(solarTopGeo, solarMat);
  solarTopMesh.name = 'rimpukan-solar-cap';
  solarTopMesh.receiveShadow = true;
  group.add(solarTopMesh);

  // --- 6. Upper eastern layer (placed before sakura so trees exclude its footprint) ---
  const wing = findEastWingFrame(ringCW, cx, cz);
  const upperMinS = -10.0;
  const upperMaxS = Math.min(16.0, wing.edgeLen * 0.42);
  const upperLen = Math.max(12.0, upperMaxS - upperMinS);
  const upperCenterS = (upperMinS + upperMaxS) * 0.5;
  const upperWidth = 7.0; // nIn in [1.0, 8.0] -> localZ in [-8.0, -1.0]
  const upperH = 3.5;

  const upperGroup = new THREE.Group();
  upperGroup.name = 'rimpukan-upper-group';
  upperGroup.position.set(wing.midX, groundVisualY + roofH, wing.midZ);
  // Maps local +X -> uNE, local +Z -> -nIn (SE outward)
  upperGroup.rotation.y = Math.atan2(-wing.uNEz, wing.uNEx);

  const upperCanopyThick = 0.4;
  const upperBodyH = upperH - upperCanopyThick; // 3.1m body + 0.4m roof/canopy slab = 3.5m total
  const upperBlockGeo = new THREE.BoxGeometry(upperLen, upperBodyH, upperWidth);
  upperBlockGeo.translate(0, upperBodyH * 0.5, 0);
  const upperBlockMesh = new THREE.Mesh(upperBlockGeo, upperMat);
  upperBlockMesh.name = 'rimpukan-upper-layer';
  upperBlockMesh.position.set(upperCenterS, 0, -4.5);
  upperBlockMesh.castShadow = true;
  upperBlockMesh.receiveShadow = true;
  upperGroup.add(upperBlockMesh);

  // Thin cantilevered beige eaves (0.4m thick, 1.5m projection on SE and SW edges)
  const canopyMinX = upperMinS - 1.5;
  const canopyMaxX = upperMaxS;
  const canopyMinSy = -0.5; // maps to localZ = +0.5 (1.5m SE overhang beyond localZ = -1.0)
  const canopyMaxSy = 8.0; // maps to localZ = -8.0

  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(canopyMinX + 2.5, canopyMinSy);
  canopyShape.lineTo(canopyMaxX - 1.5, canopyMinSy);
  canopyShape.quadraticCurveTo(canopyMaxX, canopyMinSy, canopyMaxX, canopyMinSy + 1.5);
  canopyShape.lineTo(canopyMaxX, canopyMaxSy);
  canopyShape.lineTo(canopyMinX, canopyMaxSy);
  canopyShape.lineTo(canopyMinX, canopyMinSy + 2.5);
  canopyShape.quadraticCurveTo(canopyMinX, canopyMinSy, canopyMinX + 2.5, canopyMinSy);

  const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, {
    depth: upperCanopyThick,
    bevelEnabled: false,
    curveSegments: 8,
  });
  canopyGeo.rotateX(-Math.PI / 2);
  canopyGeo.translate(0, upperBodyH, 0);
  canopyGeo.computeVertexNormals();

  const canopyMesh = new THREE.Mesh(canopyGeo, upperMat);
  canopyMesh.name = 'rimpukan-upper-canopy';
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;
  upperGroup.add(canopyMesh);

  group.add(upperGroup);

  // --- 5. Rooftop garden: soil pad, white metal railing, sakura grid, west white poles ---
  const roofSoilY = groundVisualY + roofH + 0.04;
  const soilGeo = buildCapGeometry(ringRoofSoil, roofSoilY, 'up');
  const soilMesh = new THREE.Mesh(soilGeo, soilMat);
  soilMesh.name = 'rimpukan-roof-soil';
  soilMesh.receiveShadow = true;
  group.add(soilMesh);

  const railingGeo = buildThinPerimeterWallGeometry(
    ringRailingOuter,
    ringRailingInner,
    groundVisualY + roofH,
    groundVisualY + roofH + 1.1,
  );
  const railingMesh = new THREE.Mesh(railingGeo, railingMat);
  railingMesh.name = 'rimpukan-roof-railing';
  railingMesh.receiveShadow = true;
  group.add(railingMesh);

  // Grid-planted sakura trees (~5m spacing aligned with building axis, avoiding upper layer)
  let minS = Infinity;
  let maxS = -Infinity;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const [x, z] of ringSakuraBounds) {
    const dx = x - wing.midX;
    const dz = z - wing.midZ;
    const s = dx * wing.uNEx + dz * wing.uNEz;
    const t = dx * wing.nInX + dz * wing.nInZ;
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }

  interface SakuraPlacement {
    x: number;
    z: number;
    totalH: number;
    rotY: number;
  }

  const sakuraPlacements: SakuraPlacement[] = [];
  const gridSpacing = 5.0;
  const sStart = Math.floor(minS / gridSpacing) * gridSpacing;
  const tStart = Math.floor(minT / gridSpacing) * gridSpacing;

  for (let s = sStart; s <= maxS; s += gridSpacing) {
    for (let t = tStart; t <= maxT; t += gridSpacing) {
      // Exclude the upper eastern layer and its cantilevered eaves with margin
      if (s >= upperMinS - 2.6 && s <= upperMaxS + 2.2 && t >= -1.5 && t <= 10.6) {
        continue;
      }

      const h1 = deterministicHash(s, t);
      const h2 = deterministicHash(s + 37.3, t - 19.1);
      const h3 = deterministicHash(s - 11.7, t + 53.9);
      const js = s + (h1 - 0.5) * 0.45;
      const jt = t + (h2 - 0.5) * 0.45;

      const wx = wing.midX + js * wing.uNEx + jt * wing.nInX;
      const wz = wing.midZ + js * wing.uNEz + jt * wing.nInZ;
      if (!pointInPolygon(wx, wz, ringSakuraBounds)) continue;

      sakuraPlacements.push({
        x: wx,
        z: wz,
        totalH: 4.0 + h3 * 1.0, // 4.0m - 5.0m
        rotY: h1 * Math.PI * 2,
      });
    }
  }

  if (sakuraPlacements.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.19, 1.0, 6);
    trunkGeo.translate(0, 0.5, 0);
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, sakuraPlacements.length);
    trunkInst.name = 'rimpukan-sakura-trunks';
    trunkInst.receiveShadow = true;

    const crownGeo = new THREE.IcosahedronGeometry(1.0, 1);
    const crownInst = new THREE.InstancedMesh(crownGeo, sakuraMat, sakuraPlacements.length);
    crownInst.name = 'rimpukan-sakura-crowns';
    crownInst.receiveShadow = true;

    for (let i = 0; i < sakuraPlacements.length; i++) {
      const p = sakuraPlacements[i];
      if (!p) continue;
      const trunkH = p.totalH * 0.54;
      const rY = p.totalH * 0.34;
      const rXZ = rY * 1.22;

      dummy.position.set(p.x, roofSoilY, p.z);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.set(1, trunkH, 1);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(p.x, roofSoilY + p.totalH - rY, p.z);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.set(rXZ, rY, rXZ);
      dummy.updateMatrix();
      crownInst.setMatrixAt(i, dummy.matrix);
    }

    trunkInst.instanceMatrix.needsUpdate = true;
    trunkInst.computeBoundingBox();
    trunkInst.computeBoundingSphere();

    crownInst.instanceMatrix.needsUpdate = true;
    crownInst.computeBoundingBox();
    crownInst.computeBoundingSphere();

    group.add(trunkInst, crownInst);
  }

  // ~6 thin white poles (0.25m diameter, 3.0m height) along west rooftop edge, no blades
  const densePoleSamples = samplePerimeter(ringPoles, 0.6);
  const westEdgeSamples = densePoleSamples.filter((s) => {
    const [, lz] = toFrontLocal(s.x, s.z);
    return lz > -15.5;
  });

  const poleCount = 6;
  const chosenPoles: PerimeterSample[] = [];
  if (westEdgeSamples.length >= poleCount) {
    // Sort laterally along the west drum arc so poles space evenly end to end
    const sortedWest = [...westEdgeSamples].sort(
      (a, b) => toFrontLocal(a.x, a.z)[0] - toFrontLocal(b.x, b.z)[0],
    );
    for (let i = 0; i < poleCount; i++) {
      const idx = Math.floor(((i + 0.5) / poleCount) * sortedWest.length);
      const sample = sortedWest[Math.min(sortedWest.length - 1, idx)];
      if (sample) chosenPoles.push(sample);
    }
  } else {
    for (let i = 0; i < Math.min(poleCount, densePoleSamples.length); i++) {
      const sample = densePoleSamples[i];
      if (sample) chosenPoles.push(sample);
    }
  }

  if (chosenPoles.length > 0) {
    const poleGeo = new THREE.CylinderGeometry(0.125, 0.125, 3.0, 8);
    poleGeo.translate(0, 1.5, 0);
    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, chosenPoles.length);
    poleInst.name = 'rimpukan-roof-poles';
    for (let i = 0; i < chosenPoles.length; i++) {
      const p = chosenPoles[i];
      if (!p) continue;
      dummy.position.set(p.x, groundVisualY + roofH, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);
    }
    poleInst.instanceMatrix.needsUpdate = true;
    poleInst.computeBoundingBox();
    poleInst.computeBoundingSphere();
    group.add(poleInst);
  }

  // --- 7. West front grand staircase, entrances, and 8. 3F square plaque ---
  const frontGroup = new THREE.Group();
  frontGroup.name = 'rimpukan-front-group';
  frontGroup.position.set(anchorX, groundVisualY, anchorZ);
  // Maps local +Z -> (fx, 0, fz) outward WSW, local +X -> (fz, 0, -fx) SSE
  frontGroup.rotation.y = Math.atan2(fx, fz);

  const stairWidth = 18.0;
  const wingThick = 0.8;
  const stairBackZ = -3.0; // tucked into curved drum to close side gaps
  const landingFrontZ = 2.0;
  const stairFrontZ = 9.6; // ~12m depth from front curve; stays well within x >= 85
  const landingDepth = landingFrontZ - stairBackZ;
  const landingCenterZ = (stairBackZ + landingFrontZ) * 0.5;
  const landingDeckThickness = 1.2;
  const landingUndersideY = floor1H - landingDeckThickness;

  // 2F top landing bridge spanning between the two 0.8m wing walls (no coplanar overlap)
  const innerStairWidth = stairWidth - wingThick * 2; // 16.4m
  const landingGeo = new THREE.BoxGeometry(innerStairWidth, landingDeckThickness, landingDepth);
  const landingMesh = new THREE.Mesh(landingGeo, stairMat);
  landingMesh.name = 'rimpukan-stairs-landing';
  landingMesh.position.set(0, landingUndersideY + landingDeckThickness * 0.5, landingCenterZ);
  landingMesh.castShadow = true;
  landingMesh.receiveShadow = true;
  frontGroup.add(landingMesh);

  // One solid full-width mass under the landing (photo: a single unbroken staircase, no central gap)
  const supportGeo = new THREE.BoxGeometry(innerStairWidth, landingUndersideY, landingDepth);
  supportGeo.translate(0, landingUndersideY * 0.5, 0);
  const supportMesh = new THREE.Mesh(supportGeo, stairMat);
  supportMesh.name = 'rimpukan-stairs-support';
  supportMesh.position.set(0, 0, landingCenterZ);
  supportMesh.receiveShadow = true;
  frontGroup.add(supportMesh);

  // 12 crisp full-width steps, continuous from the bottom step to the landing
  const stepCount = 12;
  const runTotal = stairFrontZ - landingFrontZ;
  const stepRun = runTotal / stepCount;

  const stepGeo = new THREE.BoxGeometry(1, 1, 1);
  stepGeo.translate(0, 0.5, 0);
  const stepInst = new THREE.InstancedMesh(stepGeo, stairMat, stepCount);
  stepInst.name = 'rimpukan-stairs-steps';
  stepInst.receiveShadow = true;

  for (let i = 0; i < stepCount; i++) {
    const stepTop = floor1H * ((stepCount - i) / (stepCount + 1));
    const zBack = landingFrontZ + i * stepRun;
    const zFront = landingFrontZ + (i + 1) * stepRun;
    const zCenter = (zFront + zBack) * 0.5;
    const depth = zFront - zBack;

    dummy.position.set(0, 0, zCenter);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(innerStairWidth, stepTop, depth);
    dummy.updateMatrix();
    stepInst.setMatrixAt(i, dummy.matrix);
  }
  stepInst.instanceMatrix.needsUpdate = true;
  stepInst.computeBoundingBox();
  stepInst.computeBoundingSphere();
  frontGroup.add(stepInst);

  // Triangular wing walls flanking both outer sides of the staircase (0.8m thick)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(stairBackZ, 0);
  wingShape.lineTo(stairFrontZ, 0);
  wingShape.lineTo(stairFrontZ, 0.35);
  wingShape.lineTo(landingFrontZ, floor1H + 0.35);
  wingShape.lineTo(stairBackZ, floor1H + 0.35);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: wingThick,
    bevelEnabled: false,
  });
  wingGeo.translate(0, 0, -wingThick * 0.5);
  wingGeo.rotateY(-Math.PI / 2);
  wingGeo.computeVertexNormals();

  const wingOffsetX = stairWidth * 0.5 - wingThick * 0.5; // 8.6m
  const leftWingWall = new THREE.Mesh(wingGeo, stairMat);
  leftWingWall.name = 'rimpukan-stairs-wall-left';
  leftWingWall.position.set(-wingOffsetX, 0, 0);
  leftWingWall.castShadow = true;
  leftWingWall.receiveShadow = true;
  frontGroup.add(leftWingWall);

  const rightWingWall = new THREE.Mesh(wingGeo, stairMat);
  rightWingWall.name = 'rimpukan-stairs-wall-right';
  rightWingWall.position.set(wingOffsetX, 0, 0);
  rightWingWall.castShadow = true;
  rightWingWall.receiveShadow = true;
  frontGroup.add(rightWingWall);

  // Brown entrance box jutting out of the upper-middle of the staircase (photo: dark opening
  // sits in its front face, just above the step it stands on; no glass box on the wall above)
  const entranceBoxW = 4.6;
  const entranceBoxFrontZ = 4.5;
  const entranceBoxBackZ = -1.0;
  const entranceBoxH = 5.2; // top ~1m above the landing deck
  const entranceBoxGeo = new THREE.BoxGeometry(
    entranceBoxW,
    entranceBoxH,
    entranceBoxFrontZ - entranceBoxBackZ,
  );
  entranceBoxGeo.translate(0, entranceBoxH * 0.5, 0);
  const entranceBoxMesh = new THREE.Mesh(entranceBoxGeo, stairMat);
  entranceBoxMesh.name = 'rimpukan-entrance-box';
  entranceBoxMesh.position.set(0, 0, (entranceBoxFrontZ + entranceBoxBackZ) * 0.5);
  entranceBoxMesh.castShadow = true;
  entranceBoxMesh.receiveShadow = true;
  frontGroup.add(entranceBoxMesh);

  // Small dark opening on the box front (floor level = step tread at that depth, ~2.9m)
  const openingW = 3.0;
  const openingBottomY = 3.0;
  const openingTopY = 4.7;
  const openingGeo = new THREE.PlaneGeometry(openingW, openingTopY - openingBottomY);
  const openingMesh = new THREE.Mesh(openingGeo, openingMat);
  openingMesh.name = 'rimpukan-entrance-opening';
  openingMesh.position.set(0, (openingBottomY + openingTopY) * 0.5, entranceBoxFrontZ + 0.02);
  frontGroup.add(openingMesh);

  // --- 8. Plain square 3F plaque (3.5m x 3.5m, no emblem) ---
  const hitLeft = sampleFrontWallAt(ringCW, anchorX, anchorZ, fx, fz, -1.2);
  const hitCenter = sampleFrontWallAt(ringCW, anchorX, anchorZ, fx, fz, 0);
  const hitRight = sampleFrontWallAt(ringCW, anchorX, anchorZ, fx, fz, 1.2);
  const wallFrontZ = Math.max(
    hitLeft ? hitLeft.localZ : 0,
    hitCenter ? hitCenter.localZ : 0,
    hitRight ? hitRight.localZ : 0,
  );
  const plaqueSize = 3.5; // photo: ~1/3 of the brown wall band height
  const plaqueY = 10.6; // upper half of the brown wall band
  const plaqueFrameDepth = 0.72;
  const plaqueFrameFrontZ = wallFrontZ + 0.13;

  const plaqueFrameGeo = new THREE.BoxGeometry(plaqueSize, plaqueSize, plaqueFrameDepth);
  const plaqueFrameMesh = new THREE.Mesh(plaqueFrameGeo, plaqueFrameMat);
  plaqueFrameMesh.name = 'rimpukan-plaque-frame';
  plaqueFrameMesh.position.set(0, plaqueY, plaqueFrameFrontZ - plaqueFrameDepth * 0.5);
  frontGroup.add(plaqueFrameMesh);

  const plaqueInnerGeo = new THREE.BoxGeometry(plaqueSize * 0.82, plaqueSize * 0.82, 0.03);
  const plaqueInnerMesh = new THREE.Mesh(plaqueInnerGeo, plaqueInnerMat);
  plaqueInnerMesh.name = 'rimpukan-plaque-inner';
  plaqueInnerMesh.position.set(0, plaqueY, plaqueFrameFrontZ + 0.015);
  frontGroup.add(plaqueInnerMesh);

  group.add(frontGroup);

  // --- 9. Small vertical windows on the west front wall (4 windows, 0.9m x 1.8m) ---
  const windowSpecs: [number, number][] = [
    [-5.2, 10.4],
    [5.2, 10.4],
    [-3.6, 12.6],
    [3.6, 12.6],
  ];
  const windowHits: { hit: WallHit; y: number }[] = [];
  for (const [targetLx, wy] of windowSpecs) {
    const hit = sampleFrontWallAt(ringCW, anchorX, anchorZ, fx, fz, targetLx);
    if (hit) {
      windowHits.push({ hit, y: wy });
    }
  }

  if (windowHits.length > 0) {
    const winGeo = new THREE.BoxGeometry(0.9, 1.8, 0.2);
    const winInst = new THREE.InstancedMesh(winGeo, windowMat, windowHits.length);
    winInst.name = 'rimpukan-front-windows';
    for (let i = 0; i < windowHits.length; i++) {
      const entry = windowHits[i];
      if (!entry) continue;
      const { hit, y } = entry;
      dummy.position.set(
        hit.worldX + hit.nx * 0.02,
        groundVisualY + y,
        hit.worldZ + hit.nz * 0.02,
      );
      dummy.rotation.set(0, Math.atan2(hit.nx, hit.nz), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      winInst.setMatrixAt(i, dummy.matrix);
    }
    winInst.instanceMatrix.needsUpdate = true;
    winInst.computeBoundingBox();
    winInst.computeBoundingSphere();
    group.add(winInst);
  }

  return {
    group,
    primaryMaterials: [
      { mat: wallMat, baseHex: WALL_HEX },
      { mat: glassMat, baseHex: GLASS_HEX },
    ],
    animated: [],
  };
};
