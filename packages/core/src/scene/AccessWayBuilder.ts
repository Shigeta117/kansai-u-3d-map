import * as THREE from 'three';
import { computeVisualY, sampleElevation } from '../domain/projection';
import type {
  CampusConfig,
  CampusStructuresData,
  TerrainGrid,
} from '../domain/types';
import { SCENE_PALETTE } from './palette';

function subdivide3D(
  pts: [number, number, number][],
  terrain: TerrainGrid,
  minElev: number,
  exag: number,
  maxSegLen = 8,
): THREE.Vector3[] {
  if (pts.length < 2) return [];
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const dist = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const steps = Math.max(1, Math.ceil(dist / maxSegLen));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[2] + (b[2] - a[2]) * t;
      const y = computeVisualY(sampleElevation(terrain, x, z), minElev, exag);
      out.push(new THREE.Vector3(x, y, z));
    }
  }
  const last = pts[pts.length - 1];
  if (last) {
    const y = computeVisualY(sampleElevation(terrain, last[0], last[2]), minElev, exag);
    out.push(new THREE.Vector3(last[0], y, last[2]));
  }
  return out;
}

function buildSlopedStrip(
  pts: THREE.Vector3[],
  width: number,
  liftY: number,
  thickness = 0.2,
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
    const topY = cur.y + liftY;
    const botY = topY - thickness;

    positions.push(lx, topY, lz, rx, topY, rz, rx, botY, rz, lx, botY, lz);

    if (i < pts.length - 1) {
      const a = i * 4;
      const b = (i + 1) * 4;
      indices.push(a + 0, b + 0, a + 1, a + 1, b + 0, b + 1);
      indices.push(a + 3, a + 2, b + 3, a + 2, b + 2, b + 3);
      indices.push(a + 3, b + 3, a + 0, a + 0, b + 3, b + 0);
      indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildAccessCanopiesGroup(
  structures: CampusStructuresData,
  terrain: TerrainGrid,
  config: CampusConfig,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'campus-access-canopies';

  const exag = config.verticalExaggeration;
  const minElev = terrain.minElevation;

  const walkwayMat = new THREE.MeshStandardMaterial({
    color: '#EFE7D6',
    roughness: 0.88,
  });
  const escMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.accents.escalatorMetal,
    roughness: 0.45,
    metalness: 0.35,
  });
  const roofGlassMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.accents.canopyGlass,
    roughness: 0.22,
    metalness: 0.12,
    transparent: true,
    opacity: 0.56,
    side: THREE.DoubleSide,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#3A4656',
    roughness: 0.52,
    metalness: 0.28,
  });
  const sakuraMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.accents.sakura,
    roughness: 0.86,
  });
  const trunkMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.foliage.trunk,
    roughness: 0.92,
  });

  for (const canopy of structures.accessCanopies) {
    const cGroup = new THREE.Group();
    cGroup.name = canopy.id;
    cGroup.userData = { buildingId: 'west-gate' };

    const dense = subdivide3D(canopy.spine, terrain, minElev, exag, 7);
    if (dense.length < 2) continue;

    // 1. Sloped paved terrace walkway
    const walkMesh = new THREE.Mesh(
      buildSlopedStrip(dense, canopy.width, 0.25, 0.3),
      walkwayMat,
    );
    walkMesh.receiveShadow = true;
    cGroup.add(walkMesh);

    // 2. Outdoor Escalator dual lane strip
    if (canopy.escalatorRange && canopy.escalatorRange.length >= 2) {
      const escDense = subdivide3D(canopy.escalatorRange, terrain, minElev, exag, 5);
      if (escDense.length >= 2) {
        const escDeck = new THREE.Mesh(
          buildSlopedStrip(escDense, 2.2, 0.58, 0.35),
          escMat,
        );
        escDeck.castShadow = true;
        cGroup.add(escDeck);
      }
    }

    // 3. Slim elevated translucent glass roof + steel ribs + slender support columns
    const roofMesh = new THREE.Mesh(
      buildSlopedStrip(dense, canopy.width * 0.82, 3.85, 0.16),
      roofGlassMat,
    );
    roofMesh.castShadow = true;
    cGroup.add(roofMesh);

    let distAcc = 0;
    for (let i = 0; i < dense.length; i++) {
      const cur = dense[i];
      if (!cur) continue;
      if (i > 0) {
        const prev = dense[i - 1];
        if (prev) distAcc += cur.distanceTo(prev);
      }
      if (i === 0 || i === dense.length - 1 || distAcc >= 11) {
        distAcc = 0;
        const prev = dense[Math.max(0, i - 1)] ?? cur;
        const next = dense[Math.min(dense.length - 1, i + 1)] ?? cur;
        let tx = next.x - prev.x;
        let tz = next.z - prev.z;
        const len = Math.hypot(tx, tz) || 1;
        tx /= len;
        tz /= len;
        const nx = -tz;
        const nz = tx;

        const postOffset = canopy.width * 0.38;
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.18, 3.8, 6),
            steelMat,
          );
          post.position.set(
            cur.x + nx * postOffset * side,
            cur.y + 1.9,
            cur.z + nz * postOffset * side,
          );
          post.castShadow = true;
          cGroup.add(post);
        }

        // Overhead transverse steel rib
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(canopy.width * 0.84, 0.22, 0.24),
          steelMat,
        );
        rib.position.set(cur.x, cur.y + 3.72, cur.z);
        rib.rotation.y = Math.atan2(tx, tz);
        cGroup.add(rib);

        // Sakura trees flanking the New Access promenade
        if (i % 2 === 1) {
          for (const side of [-1, 1]) {
            const sx = cur.x + nx * (canopy.width * 0.72) * side;
            const sz = cur.z + nz * (canopy.width * 0.72) * side;
            const sy = computeVisualY(sampleElevation(terrain, sx, sz), minElev, exag);
            const trunk = new THREE.Mesh(
              new THREE.CylinderGeometry(0.28, 0.4, 2.1, 6),
              trunkMat,
            );
            trunk.position.set(sx, sy + 1.0, sz);
            const crown = new THREE.Mesh(
              new THREE.IcosahedronGeometry(1.75, 1),
              sakuraMat,
            );
            crown.position.set(sx, sy + 2.8, sz);
            crown.castShadow = true;
            cGroup.add(trunk, crown);
          }
        }
      }
    }

    group.add(cGroup);
  }

  return group;
}

