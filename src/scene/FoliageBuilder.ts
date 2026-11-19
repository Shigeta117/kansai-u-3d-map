import * as THREE from 'three';
import { computeVisualY, sampleElevation } from '@/domain/projection';
import type {
  BuildingFeature,
  CampusConfig,
  LandcoverFeature,
  PathFeature,
  TerrainGrid,
} from '@/domain/types';
import { SCENE_PALETTE } from './palette';

function createPrng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointInPolygon(x: number, z: number, poly: [number, number][]): boolean {
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

interface TreePlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  isSakura: boolean;
  greenIdx: number;
}

export function buildFoliageGroup(
  terrain: TerrainGrid,
  landcover: LandcoverFeature[],
  buildings: BuildingFeature[],
  paths: PathFeature[],
  config: CampusConfig,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'campus-foliage';

  const rand = createPrng(20261119);
  const exag = config.verticalExaggeration;

  // Build spatial exclusion boxes for buildings
  const buildingBoxes = buildings
    .filter((b) => !b.isSpotOnly)
    .map((b) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of b.polygon) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      return {
        minX: minX - 3.0,
        maxX: maxX + 3.0,
        minZ: minZ - 3.0,
        maxZ: maxZ + 3.0,
        polygon: b.polygon,
      };
    });

  // Sample path points to avoid placing trees right on roads
  const pathClearPts: [number, number, number][] = [];
  for (const p of paths) {
    const minDist = p.width * 0.5 + 2.2;
    for (let i = 0; i < p.points.length; i++) {
      const pt = p.points[i];
      if (!pt) continue;
      pathClearPts.push([pt[0], pt[1], minDist]);
    }
  }

  const isClear = (x: number, z: number): boolean => {
    if (
      x < config.bounds.minX + 12 ||
      x > config.bounds.maxX - 12 ||
      z < config.bounds.minZ + 12 ||
      z > config.bounds.maxZ - 12
    ) {
      return false;
    }
    for (const box of buildingBoxes) {
      if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) {
        if (pointInPolygon(x, z, box.polygon)) return false;
        // Also avoid tight wall perimeter
        return false;
      }
    }
    for (const [px, pz, minDist] of pathClearPts) {
      const dx = x - px;
      const dz = z - pz;
      if (dx * dx + dz * dz < minDist * minDist) return false;
    }
    return true;
  };

  const placements: TreePlacement[] = [];
  const maxTrees = 380;

  const isNearCampusHeart = (x: number, z: number) =>
    x > -150 && x < 240 && z > -240 && z < 230;

  for (const lc of landcover) {
    if (placements.length >= maxTrees) break;
    if (lc.kind !== 'forest' && lc.kind !== 'lawn') continue;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of lc.polygon) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const approxArea = (maxX - minX) * (maxZ - minZ);
    const targetCount =
      lc.kind === 'forest'
        ? Math.min(28, Math.max(4, Math.floor(approxArea / 220)))
        : Math.min(10, Math.max(2, Math.floor(approxArea / 750)));

    let placed = 0;
    let attempts = 0;
    while (placed < targetCount && attempts < targetCount * 8 && placements.length < maxTrees) {
      attempts++;
      const x = minX + rand() * (maxX - minX);
      const z = minZ + rand() * (maxZ - minZ);
      if (!pointInPolygon(x, z, lc.polygon)) continue;
      if (!isClear(x, z)) continue;

      const elev = sampleElevation(terrain, x, z);
      const y = computeVisualY(elev, terrain.minElevation, exag);
      const nearSakuraZone = x > 5 && x < 185 && z > -60 && z < 80;
      const isSakura = nearSakuraZone && rand() < 0.38;

      placements.push({
        x,
        y,
        z,
        scale: 0.78 + rand() * 0.62,
        isSakura,
        greenIdx: Math.floor(rand() * SCENE_PALETTE.foliage.canopies.length),
      });
      placed++;
    }
  }

  // Add curated campus avenue trees near campus walks inside heart of Senriyama
  for (const p of paths) {
    if (placements.length >= maxTrees) break;
    if (p.kind !== 'campus-walk') continue;
    for (let i = 0; i < p.points.length && placements.length < maxTrees; i += 2) {
      const pt = p.points[i];
      if (!pt || !isNearCampusHeart(pt[0], pt[1])) continue;
      if (rand() > 0.34) continue;
      const angle = rand() * Math.PI * 2;
      const dist = p.width * 0.5 + 3.4 + rand() * 2.5;
      const tx = pt[0] + Math.cos(angle) * dist;
      const tz = pt[1] + Math.sin(angle) * dist;
      if (!isClear(tx, tz)) continue;

      const elev = sampleElevation(terrain, tx, tz);
      const y = computeVisualY(elev, terrain.minElevation, exag);
      const nearSakura = tx > 0 && tx < 180 && tz > -90 && tz < 90;

      placements.push({
        x: tx,
        y,
        z: tz,
        scale: 0.72 + rand() * 0.45,
        isSakura: nearSakura && rand() < 0.25,
        greenIdx: Math.floor(rand() * SCENE_PALETTE.foliage.canopies.length),
      });
    }
  }

  if (placements.length === 0) return group;

  const trunkGeo = new THREE.CylinderGeometry(0.42, 0.62, 2.8, 6);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.foliage.trunk,
    roughness: 0.92,
  });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, placements.length);
  trunks.name = 'foliage-trunks';
  trunks.castShadow = true;
  trunks.receiveShadow = true;

  const crownGeo = new THREE.IcosahedronGeometry(2.3, 1);
  const crownMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    roughness: 0.88,
    metalness: 0.02,
  });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, placements.length);
  crowns.name = 'foliage-crowns';
  crowns.castShadow = true;
  crowns.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const greenColors = SCENE_PALETTE.foliage.canopies.map((hex) => new THREE.Color(hex));
  const sakuraColor = new THREE.Color(SCENE_PALETTE.foliage.sakuraCanopy);

  for (let i = 0; i < placements.length; i++) {
    const t = placements[i];
    if (!t) continue;

    dummy.position.set(t.x, t.y + 1.2 * t.scale, t.z);
    dummy.scale.set(t.scale, t.scale, t.scale);
    dummy.rotation.set(0, (i * 1.17) % (Math.PI * 2), 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    dummy.position.set(t.x, t.y + 3.5 * t.scale, t.z);
    dummy.scale.set(t.scale, t.scale * 1.08, t.scale);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);

    const col = t.isSakura
      ? sakuraColor
      : (greenColors[t.greenIdx] ?? greenColors[0] ?? sakuraColor);
    crowns.setColorAt(i, col);
  }

  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;

  group.add(trunks, crowns);
  return group;
}

