import * as THREE from 'three';
import { computeVisualY, sampleElevation } from '../domain/projection';
import type {
  CampusConfig,
  LandcoverFeature,
  PathFeature,
  PathKind,
  TerrainGrid,
} from '../domain/types';
import { SCENE_PALETTE } from './palette';

function pointInPolygon2D(x: number, z: number, poly: [number, number][]): boolean {
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

interface LandcoverWithBox extends LandcoverFeature {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function withBoundingBoxes(items: LandcoverFeature[]): LandcoverWithBox[] {
  return items.map((item) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of item.polygon) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    return { ...item, minX, maxX, minZ, maxZ };
  });
}

function hash2D(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function createPlasterGrainTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = hash2D(i % size, Math.floor(i / size));
    const v = Math.round(236 + (n - 0.5) * 28);
    const idx = i * 4;
    img.data[idx] = v;
    img.data[idx + 1] = v;
    img.data[idx + 2] = v;
    img.data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function mergeSimpleGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geometries.length === 0) {
    return new THREE.BufferGeometry();
  }
  let totalVerts = 0;
  let totalIndices = 0;
  let hasColor = true;
  let hasUv = true;

  for (const g of geometries) {
    const pos = g.getAttribute('position');
    if (!pos) continue;
    totalVerts += pos.count;
    totalIndices += g.index ? g.index.count : pos.count;
    if (!g.getAttribute('color')) hasColor = false;
    if (!g.getAttribute('uv')) hasUv = false;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const colors = hasColor ? new Float32Array(totalVerts * 3) : null;
  const uvs = hasUv ? new Float32Array(totalVerts * 2) : null;
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;

  for (const g of geometries) {
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    if (!pos) continue;

    for (let i = 0; i < pos.count; i++) {
      const dst = (vOffset + i) * 3;
      positions[dst] = pos.getX(i);
      positions[dst + 1] = pos.getY(i);
      positions[dst + 2] = pos.getZ(i);
      if (norm) {
        normals[dst] = norm.getX(i);
        normals[dst + 1] = norm.getY(i);
        normals[dst + 2] = norm.getZ(i);
      }
      if (colors) {
        const c = g.getAttribute('color');
        colors[dst] = c.getX(i);
        colors[dst + 1] = c.getY(i);
        colors[dst + 2] = c.getZ(i);
      }
      if (uvs) {
        const uv = g.getAttribute('uv');
        const uDst = (vOffset + i) * 2;
        uvs[uDst] = uv.getX(i);
        uvs[uDst + 1] = uv.getY(i);
      }
    }

    if (g.index) {
      for (let i = 0; i < g.index.count; i++) {
        indices[iOffset + i] = (g.index.getX(i) ?? 0) + vOffset;
      }
      iOffset += g.index.count;
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices[iOffset + i] = vOffset + i;
      }
      iOffset += pos.count;
    }

    vOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (colors) merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (uvs) merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

export function buildTerrainGroup(
  terrain: TerrainGrid,
  landcover: LandcoverFeature[],
  paths: PathFeature[],
  config: CampusConfig,
  options: { forExport?: boolean } = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'terrain-diorama';

  const { minX, maxX, minZ, maxZ, cols, rows, minElevation } = terrain;
  const exag = config.verticalExaggeration;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;

  const topGeo = new THREE.PlaneGeometry(width, depth, cols - 1, rows - 1);
  topGeo.rotateX(-Math.PI / 2);
  topGeo.translate(centerX, 0, centerZ);

  const posAttr = topGeo.getAttribute('position');
  const vertCount = posAttr.count;

  for (let i = 0; i < vertCount; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const col = Math.max(0, Math.min(cols - 1, Math.round(((vx - minX) / width) * (cols - 1))));
    const row = Math.max(0, Math.min(rows - 1, Math.round(((vz - minZ) / depth) * (rows - 1))));
    const elev = terrain.elevations[row * cols + col] ?? minElevation;
    posAttr.setY(i, computeVisualY(elev, minElevation, exag));
  }
  posAttr.needsUpdate = true;
  topGeo.computeVertexNormals();

  const lcBoxes = withBoundingBoxes(landcover);
  const lcPriority: Record<LandcoverFeature['kind'], number> = {
    'campus-ground': 1,
    lawn: 2,
    'sports-pitch': 3,
    forest: 4,
    water: 5,
  };
  lcBoxes.sort((a, b) => lcPriority[a.kind] - lcPriority[b.kind]);

  const cGround = new THREE.Color(SCENE_PALETTE.terrain.surroundingGround);
  const cSlope = new THREE.Color(SCENE_PALETTE.terrain.slopeRock);
  const lcColors = {
    'campus-ground': new THREE.Color(SCENE_PALETTE.landcover['campus-ground']),
    lawn: new THREE.Color(SCENE_PALETTE.landcover.lawn),
    'sports-pitch': new THREE.Color(SCENE_PALETTE.landcover['sports-pitch']),
    forest: new THREE.Color(SCENE_PALETTE.landcover.forest),
    water: new THREE.Color(SCENE_PALETTE.landcover.water),
  };

  const normAttr = topGeo.getAttribute('normal');
  const colors = new Float32Array(vertCount * 3);
  const tempColor = new THREE.Color();

  for (let i = 0; i < vertCount; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const ny = normAttr.getY(i);

    tempColor.copy(cGround);
    for (let k = 0; k < lcBoxes.length; k++) {
      const lc = lcBoxes[k];
      if (!lc) continue;
      if (vx < lc.minX || vx > lc.maxX || vz < lc.minZ || vz > lc.maxZ) continue;
      if (pointInPolygon2D(vx, vz, lc.polygon)) {
        tempColor.copy(lcColors[lc.kind]);
      }
    }

    if (ny < 0.91) {
      const slopeBlend = Math.min(0.75, ((0.91 - ny) / 0.28) * 0.75);
      tempColor.lerp(cSlope, slopeBlend);
    }

    const n = (hash2D(vx * 0.25, vz * 0.25) - 0.5) * 0.045;
    colors[i * 3] = Math.max(0, Math.min(1, tempColor.r + n));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, tempColor.g + n));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, tempColor.b + n));
  }
  topGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const grainTex = options.forExport ? null : createPlasterGrainTexture();
  const topMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    ...(grainTex ? { map: grainTex } : {}),
  });

  const topMesh = new THREE.Mesh(topGeo, topMat);
  topMesh.name = 'terrain-surface';
  topMesh.receiveShadow = true;
  topMesh.castShadow = false;
  group.add(topMesh);

  const plinthMesh = buildDioramaPlinth(terrain, exag);
  group.add(plinthMesh);

  const pathsGroup = buildPathsOverlay(paths, terrain, minElevation, exag);
  group.add(pathsGroup);

  return group;
}

function buildDioramaPlinth(terrain: TerrainGrid, exag: number): THREE.Mesh {
  const { cols, rows, minX, maxX, minZ, maxZ, minElevation, elevations } = terrain;
  const bottomY = -20;
  const footY = bottomY + 5;

  const rimColor = new THREE.Color(SCENE_PALETTE.terrain.plinthRim);
  const bodyColor = new THREE.Color(SCENE_PALETTE.terrain.plinthBody);
  const footColor = new THREE.Color(SCENE_PALETTE.terrain.plinthFoot);

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const pushVert = (x: number, y: number, z: number, c: THREE.Color) => {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    colors.push(c.r, c.g, c.b);
    return idx;
  };

  const addSideStrip = (pts: [number, number, number][]) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;
      const i0 = pushVert(a[0], a[1], a[2], rimColor);
      const i1 = pushVert(b[0], b[1], b[2], rimColor);
      const i2 = pushVert(b[0], footY, b[2], bodyColor);
      const i3 = pushVert(a[0], footY, a[2], bodyColor);
      indices.push(i0, i3, i2, i0, i2, i1);

      const f0 = pushVert(a[0], footY, a[2], footColor);
      const f1 = pushVert(b[0], footY, b[2], footColor);
      const f2 = pushVert(b[0], bottomY, b[2], footColor);
      const f3 = pushVert(a[0], bottomY, a[2], footColor);
      indices.push(f0, f3, f2, f0, f2, f1);
    }
  };

  const getEdgePoint = (row: number, col: number): [number, number, number] => {
    const x = minX + (col / (cols - 1)) * (maxX - minX);
    const z = minZ + (row / (rows - 1)) * (maxZ - minZ);
    const elev = elevations[row * cols + col] ?? minElevation;
    return [x, computeVisualY(elev, minElevation, exag), z];
  };

  const south: [number, number, number][] = [];
  for (let c = 0; c < cols; c++) south.push(getEdgePoint(rows - 1, c));
  addSideStrip(south);

  const east: [number, number, number][] = [];
  for (let r = rows - 1; r >= 0; r--) east.push(getEdgePoint(r, cols - 1));
  addSideStrip(east);

  const north: [number, number, number][] = [];
  for (let c = cols - 1; c >= 0; c--) north.push(getEdgePoint(0, c));
  addSideStrip(north);

  const west: [number, number, number][] = [];
  for (let r = 0; r < rows; r++) west.push(getEdgePoint(r, 0));
  addSideStrip(west);

  const b0 = pushVert(minX, bottomY, minZ, footColor);
  const b1 = pushVert(maxX, bottomY, minZ, footColor);
  const b2 = pushVert(maxX, bottomY, maxZ, footColor);
  const b3 = pushVert(minX, bottomY, maxZ, footColor);
  indices.push(b0, b1, b2, b0, b2, b3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.04,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain-plinth';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

function subdividePathPoints(points: [number, number][], maxSegLen = 8): [number, number][] {
  if (points.length < 2) return points;
  const out: [number, number][] = [points[0] as [number, number]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(dist / maxSegLen));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function buildRibbonGeometry(
  points: [number, number][],
  width: number,
  liftY: number,
  terrain: TerrainGrid,
  minElev: number,
  exag: number,
): THREE.BufferGeometry | null {
  const dense = subdividePathPoints(points, 7);
  if (dense.length < 2) return null;

  const halfW = width * 0.5;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < dense.length; i++) {
    const cur = dense[i];
    if (!cur) continue;
    const prev = dense[Math.max(0, i - 1)] ?? cur;
    const next = dense[Math.min(dense.length - 1, i + 1)] ?? cur;

    let tx = next[0] - prev[0];
    let tz = next[1] - prev[1];
    const len = Math.hypot(tx, tz);
    if (len < 1e-4) {
      tx = 1;
      tz = 0;
    } else {
      tx /= len;
      tz /= len;
    }

    const nx = -tz;
    const nz = tx;

    const lx = cur[0] + nx * halfW;
    const lz = cur[1] + nz * halfW;
    const rx = cur[0] - nx * halfW;
    const rz = cur[1] - nz * halfW;

    const ly = computeVisualY(sampleElevation(terrain, lx, lz), minElev, exag) + liftY;
    const ry = computeVisualY(sampleElevation(terrain, rx, rz), minElev, exag) + liftY;

    positions.push(lx, ly, lz, rx, ry, rz);

    if (i < dense.length - 1) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildPathsOverlay(
  paths: PathFeature[],
  terrain: TerrainGrid,
  minElev: number,
  exag: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'terrain-paths';

  const byKind: Record<PathKind, THREE.BufferGeometry[]> = {
    'road-minor': [],
    'road-major': [],
    'campus-walk': [],
    steps: [],
  };

  const liftByKind: Record<PathKind, number> = {
    'road-minor': 0.14,
    'road-major': 0.18,
    'campus-walk': 0.22,
    steps: 0.28,
  };

  for (const p of paths) {
    const geo = buildRibbonGeometry(
      p.points,
      p.width,
      liftByKind[p.kind],
      terrain,
      minElev,
      exag,
    );
    if (geo) byKind[p.kind].push(geo);
  }

  const order: PathKind[] = ['road-minor', 'road-major', 'campus-walk', 'steps'];
  for (const kind of order) {
    const list = byKind[kind];
    if (list.length === 0) continue;
    const merged = mergeSimpleGeometries(list);
    for (const g of list) g.dispose();

    const mat = new THREE.MeshStandardMaterial({
      color: SCENE_PALETTE.paths[kind],
      roughness: 0.94,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `paths-${kind}`;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

