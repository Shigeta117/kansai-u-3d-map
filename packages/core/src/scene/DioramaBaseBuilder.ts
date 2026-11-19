import * as THREE from 'three';
import { computeVisualY, sampleElevation } from '../domain/projection';
import type { CampusConfig, DioramaConfig, TerrainGrid } from '../domain/types';
import { SCENE_PALETTE } from './palette';

const EDGE_SAMPLE_STEP_M = 4;
const TOPSOIL_THICKNESS_M = 1.2;
const DEEP_SOIL_RATIO = 0.32;
const DEEP_SOIL_MAX_M = 7.5;
const RIM_WIDTH_M = 0.65;
const RIM_LIFT_M = 0.15;
const RIM_DROP_M = 0.3;
const SHADOW_DROP_OFFSET_M = 4;
const SHADOW_SPREAD_M = 110;
const SHADOW_CORE_INSET_M = 10;
const SHADOW_OPACITY = 0.18;

interface EdgePoint {
  x: number;
  y: number;
  z: number;
  outX: number;
  outZ: number;
}

interface EdgeSpec {
  points: EdgePoint[];
  normal: [number, number, number];
}

/**
 * Create the 4 inward-facing clipping planes defining the diorama slab:
 * x >= minX, x <= maxX, z >= minZ, z <= maxZ.
 */
export function createDioramaClippingPlanes(diorama: DioramaConfig): THREE.Plane[] {
  return [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -diorama.minX),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), diorama.maxX),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -diorama.minZ),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), diorama.maxZ),
  ];
}

/**
 * Sample terrain elevation matching Three.js PlaneGeometry triangulation used in TerrainBuilder
 * so the diorama side walls seal tightly against the clipped terrain surface.
 */
export function sampleTerrainMeshElevation(
  terrain: TerrainGrid,
  x: number,
  z: number,
): number {
  const { cols, rows, minX, maxX, minZ, maxZ, elevations } = terrain;
  if (cols < 2 || rows < 2 || elevations.length === 0) {
    return sampleElevation(terrain, x, z);
  }
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  if (spanX <= 0 || spanZ <= 0) {
    return terrain.minElevation;
  }

  const u = Math.max(0, Math.min(1, (x - minX) / spanX));
  const v = Math.max(0, Math.min(1, (z - minZ) / spanZ));

  const fx = u * (cols - 1);
  const fz = v * (rows - 1);
  const ix0 = Math.min(cols - 2, Math.floor(fx));
  const iz0 = Math.min(rows - 2, Math.floor(fz));
  const ix1 = ix0 + 1;
  const iz1 = iz0 + 1;

  const tx = fx - ix0;
  const tz = fz - iz0;

  const e00 = elevations[iz0 * cols + ix0] ?? terrain.minElevation;
  const e10 = elevations[iz0 * cols + ix1] ?? e00;
  const e01 = elevations[iz1 * cols + ix0] ?? e00;
  const e11 = elevations[iz1 * cols + ix1] ?? e00;

  if (tx + tz <= 1) {
    return e00 + tx * (e10 - e00) + tz * (e01 - e00);
  }
  return e11 + (1 - tx) * (e01 - e11) + (1 - tz) * (e10 - e11);
}

function sampleEdge(
  terrain: TerrainGrid,
  exag: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  nx: number,
  nz: number,
): EdgeSpec {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  const segments = Math.max(1, Math.ceil(length / EDGE_SAMPLE_STEP_M));
  const tx = length > 0 ? dx / length : 0;
  const tz = length > 0 ? dz / length : 0;

  const points: EdgePoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = x0 + dx * t;
    const z = z0 + dz * t;
    const elev = sampleTerrainMeshElevation(terrain, x, z);
    const y = computeVisualY(elev, terrain.minElevation, exag);

    let outX = x + nx * RIM_WIDTH_M;
    let outZ = z + nz * RIM_WIDTH_M;
    if (i === 0) {
      outX = x + (nx - tx) * RIM_WIDTH_M;
      outZ = z + (nz - tz) * RIM_WIDTH_M;
    } else if (i === segments) {
      outX = x + (nx + tx) * RIM_WIDTH_M;
      outZ = z + (nz + tz) * RIM_WIDTH_M;
    }

    points.push({ x, y, z, outX, outZ });
  }

  return { points, normal: [nx, 0, nz] };
}

function buildSidesMesh(
  edges: EdgeSpec[],
  bottomY: number,
  deepBandHeight: number,
): THREE.Mesh {
  const topsoilColor = new THREE.Color(SCENE_PALETTE.diorama.topsoil);
  const subsoilColor = new THREE.Color(SCENE_PALETTE.diorama.subsoil);
  const deepSoilColor = new THREE.Color(SCENE_PALETTE.diorama.deepSoil);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const pushVert = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    color: THREE.Color,
  ): number => {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    colors.push(color.r, color.g, color.b);
    return idx;
  };

  const pushBandQuad = (
    ax: number,
    az: number,
    ayTop: number,
    ayBot: number,
    bx: number,
    bz: number,
    byTop: number,
    byBot: number,
    nx: number,
    nz: number,
    color: THREE.Color,
  ): void => {
    if (ayTop <= ayBot && byTop <= byBot) return;
    const i0 = pushVert(ax, ayTop, az, nx, 0, nz, color);
    const i1 = pushVert(bx, byTop, bz, nx, 0, nz, color);
    const i2 = pushVert(bx, byBot, bz, nx, 0, nz, color);
    const i3 = pushVert(ax, ayBot, az, nx, 0, nz, color);
    indices.push(i0, i3, i2, i0, i2, i1);
  };

  // Topsoil extends RIM_DROP_M behind the rim molding so a full 1.2m band stays visible below it.
  const topsoilDrop = RIM_DROP_M + TOPSOIL_THICKNESS_M;

  for (const edge of edges) {
    const [nx, , nz] = edge.normal;
    const pts = edge.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;

      const aTopsoilBot = Math.max(bottomY, a.y - topsoilDrop);
      const bTopsoilBot = Math.max(bottomY, b.y - topsoilDrop);
      const aDeepTop = Math.min(aTopsoilBot, bottomY + deepBandHeight);
      const bDeepTop = Math.min(bTopsoilBot, bottomY + deepBandHeight);

      pushBandQuad(a.x, a.z, a.y, aTopsoilBot, b.x, b.z, b.y, bTopsoilBot, nx, nz, topsoilColor);
      pushBandQuad(a.x, a.z, aTopsoilBot, aDeepTop, b.x, b.z, bTopsoilBot, bDeepTop, nx, nz, subsoilColor);
      pushBandQuad(a.x, a.z, aDeepTop, bottomY, b.x, b.z, bDeepTop, bottomY, nx, nz, deepSoilColor);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0.02,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'diorama-sides';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData = { excludeFromClipping: true };
  return mesh;
}

function buildRimMesh(edges: EdgeSpec[]): THREE.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  const pushVert = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
  ): number => {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    return idx;
  };

  const pushQuad = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    nx: number,
    ny: number,
    nz: number,
  ): void => {
    const i0 = pushVert(p0[0], p0[1], p0[2], nx, ny, nz);
    const i1 = pushVert(p1[0], p1[1], p1[2], nx, ny, nz);
    const i2 = pushVert(p2[0], p2[1], p2[2], nx, ny, nz);
    const i3 = pushVert(p3[0], p3[1], p3[2], nx, ny, nz);
    indices.push(i0, i1, i2, i0, i2, i3);
  };

  for (const edge of edges) {
    const [nx, , nz] = edge.normal;
    const pts = edge.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;

      const ayTop = a.y + RIM_LIFT_M;
      const ayBot = a.y - RIM_DROP_M;
      const byTop = b.y + RIM_LIFT_M;
      const byBot = b.y - RIM_DROP_M;

      // Top lip (+Y)
      pushQuad(
        [a.x, ayTop, a.z],
        [a.outX, ayTop, a.outZ],
        [b.outX, byTop, b.outZ],
        [b.x, byTop, b.z],
        0,
        1,
        0,
      );

      // Outer vertical trim (outward normal)
      pushQuad(
        [a.outX, ayTop, a.outZ],
        [a.outX, ayBot, a.outZ],
        [b.outX, byBot, b.outZ],
        [b.outX, byTop, b.outZ],
        nx,
        0,
        nz,
      );

      // Underside lip (-Y)
      pushQuad(
        [a.x, ayBot, a.z],
        [b.x, byBot, b.z],
        [b.outX, byBot, b.outZ],
        [a.outX, ayBot, a.outZ],
        0,
        -1,
        0,
      );

      // Inner vertical face (inward normal, seals the lifted top edge cleanly)
      pushQuad(
        [a.x, ayTop, a.z],
        [b.x, byTop, b.z],
        [b.x, byBot, b.z],
        [a.x, ayBot, a.z],
        -nx,
        0,
        -nz,
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);

  const mat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.diorama.rim,
    emissive: SCENE_PALETTE.diorama.rim,
    emissiveIntensity: 0.1,
    roughness: 0.72,
    metalness: 0.02,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'diorama-rim';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData = { excludeFromClipping: true };
  return mesh;
}

function buildBottomMesh(diorama: DioramaConfig, bottomY: number): THREE.Mesh {
  const { minX, maxX, minZ, maxZ } = diorama;
  const positions = new Float32Array([
    minX, bottomY, minZ,
    maxX, bottomY, minZ,
    maxX, bottomY, maxZ,
    minX, bottomY, maxZ,
  ]);
  const normals = new Float32Array([
    0, -1, 0,
    0, -1, 0,
    0, -1, 0,
    0, -1, 0,
  ]);
  const indices = [0, 1, 2, 0, 2, 3];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);

  const mat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.diorama.bottom,
    roughness: 0.95,
    metalness: 0.02,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'diorama-bottom';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData = { excludeFromClipping: true };
  return mesh;
}

function createRectShadowTexture(
  baseWidth: number,
  baseDepth: number,
  spread: number,
  inset: number,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const planeW = baseWidth + spread * 2;
  const planeD = baseDepth + spread * 2;
  const coreHalfW = Math.max(0, baseWidth * 0.5 - inset);
  const coreHalfD = Math.max(0, baseDepth * 0.5 - inset);
  const blurRadius = Math.max(1, spread + inset);

  const img = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    const wz = ((py + 0.5) / size - 0.5) * planeD;
    const dz = Math.max(0, Math.abs(wz) - coreHalfD);
    for (let px = 0; px < size; px++) {
      const wx = ((px + 0.5) / size - 0.5) * planeW;
      const dx = Math.max(0, Math.abs(wx) - coreHalfW);
      const dist = Math.hypot(dx, dz);
      const t = Math.min(1, dist / blurRadius);
      const inv = 1 - t;
      const smooth = inv * inv * (3 - 2 * inv);
      const alpha = Math.round(smooth * smooth * 255);

      const idx = (py * size + px) * 4;
      img.data[idx] = 0;
      img.data[idx + 1] = 0;
      img.data[idx + 2] = 0;
      img.data[idx + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function buildDropShadowMesh(
  diorama: DioramaConfig,
  bottomY: number,
): THREE.Mesh | null {
  const baseWidth = diorama.maxX - diorama.minX;
  const baseDepth = diorama.maxZ - diorama.minZ;
  if (baseWidth <= 0 || baseDepth <= 0) return null;

  const tex = createRectShadowTexture(
    baseWidth,
    baseDepth,
    SHADOW_SPREAD_M,
    SHADOW_CORE_INSET_M,
  );
  if (!tex) return null;

  const planeGeo = new THREE.PlaneGeometry(
    baseWidth + SHADOW_SPREAD_M * 2,
    baseDepth + SHADOW_SPREAD_M * 2,
  );
  planeGeo.rotateX(-Math.PI / 2);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(planeGeo, shadowMat);
  mesh.name = 'diorama-drop-shadow';
  mesh.position.set(
    (diorama.minX + diorama.maxX) * 0.5,
    bottomY - SHADOW_DROP_OFFSET_M,
    (diorama.minZ + diorama.maxZ) * 0.5,
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData = { excludeFromClipping: true };
  return mesh;
}

export function buildDioramaBaseGroup(
  terrain: TerrainGrid,
  config: CampusConfig,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'diorama-base';
  group.userData = { excludeFromClipping: true };

  const { diorama, verticalExaggeration: exag } = config;
  const { minX, maxX, minZ, maxZ, baseDepth } = diorama;

  const edges: EdgeSpec[] = [
    // South (z = maxZ, west -> east, outward +Z)
    sampleEdge(terrain, exag, minX, maxZ, maxX, maxZ, 0, 1),
    // East (x = maxX, south -> north, outward +X)
    sampleEdge(terrain, exag, maxX, maxZ, maxX, minZ, 1, 0),
    // North (z = minZ, east -> west, outward -Z)
    sampleEdge(terrain, exag, maxX, minZ, minX, minZ, 0, -1),
    // West (x = minX, north -> south, outward -X)
    sampleEdge(terrain, exag, minX, minZ, minX, maxZ, -1, 0),
  ];

  let lowestVisualY = computeVisualY(
    terrain.minElevation,
    terrain.minElevation,
    exag,
  );
  for (const edge of edges) {
    for (const pt of edge.points) {
      if (pt.y < lowestVisualY) {
        lowestVisualY = pt.y;
      }
    }
  }

  const bottomY = lowestVisualY - baseDepth;
  const deepBandHeight = Math.min(baseDepth * DEEP_SOIL_RATIO, DEEP_SOIL_MAX_M);

  group.add(buildSidesMesh(edges, bottomY, deepBandHeight));
  group.add(buildRimMesh(edges));
  group.add(buildBottomMesh(diorama, bottomY));

  const dropShadow = buildDropShadowMesh(diorama, bottomY);
  if (dropShadow) {
    group.add(dropShadow);
  }

  return group;
}
