import * as THREE from 'three';
import { computeVisualY, sampleElevation } from '../domain/projection';
import type {
  CampusConfig,
  CampusStructuresData,
  TerrainGrid,
} from '../domain/types';
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

  // Meishin Expressway Tunnel Portals
  const portalMat = new THREE.MeshStandardMaterial({
    color: '#C7BEB0',
    roughness: 0.85,
  });
  const voidMat = new THREE.MeshStandardMaterial({
    color: '#282E36',
    roughness: 0.95,
  });

  for (const portal of structures.tunnelPortals) {
    const pGroup = new THREE.Group();
    pGroup.name = portal.id;
    const baseY = computeVisualY(portal.y, minElev, exag);
    pGroup.position.set(portal.x, baseY, portal.z);
    pGroup.rotation.y = portal.angleRad;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 7.2, portal.width),
      portalMat,
    );
    frame.position.y = 3.2;
    frame.castShadow = true;
    pGroup.add(frame);

    const darkMouth = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 5.2, portal.width * 0.78),
      voidMat,
    );
    darkMouth.position.y = 2.4;
    pGroup.add(darkMouth);

    group.add(pGroup);
  }

  return group;
}

