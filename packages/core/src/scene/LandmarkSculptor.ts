import * as THREE from 'three';
import type { BuildingFeature } from '../domain/types';
import { SCENE_PALETTE } from './palette';

export interface SculptExtraResult {
  meshes: THREE.Object3D[];
  animatedRotors: THREE.Object3D[];
}

interface OrientedFootprint {
  angle: number;
  width: number;
  depth: number;
  radius: number;
}

function analyzeFootprint(
  polygon: [number, number][],
  cx: number,
  cz: number,
): OrientedFootprint {
  let longestLenSq = 0;
  let angle = 0;
  let maxR = 4;

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a) continue;
    const d = Math.hypot(a[0] - cx, a[1] - cz);
    if (d > maxR) maxR = d;
    if (!b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lenSq = dx * dx + dz * dz;
    if (lenSq > longestLenSq) {
      longestLenSq = lenSq;
      angle = Math.atan2(dz, dx);
    }
  }

  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (const [x, z] of polygon) {
    const rx = x - cx;
    const rz = z - cz;
    const u = rx * cos - rz * sin;
    const v = rx * sin + rz * cos;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  return {
    angle: -angle,
    width: Math.max(6, maxU - minU),
    depth: Math.max(6, maxV - minV),
    radius: maxR,
  };
}

export function sculptLandmarkDetails(
  building: BuildingFeature,
  roofY: number,
  groundVisualY: number,
  baseMatColor: string,
): SculptExtraResult {
  const meshes: THREE.Object3D[] = [];
  const animatedRotors: THREE.Object3D[] = [];
  const { x: cx, z: cz } = building.centroid;
  const fp = analyzeFootprint(building.polygon, cx, cz);

  const trimMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.accents.roofTrim,
    roughness: 0.72,
    metalness: 0.04,
  });

  switch (building.sculptStyle) {
    case 'kanbunkan-rotunda': {
      const drumRadius = Math.max(7.2, Math.min(10.5, fp.radius * 0.4));
      const drumX = cx + 4.5;
      const drumZ = cz + 2.0;

      const drumMat = new THREE.MeshStandardMaterial({
        color: SCENE_PALETTE.buildings.heritage,
        roughness: 0.76,
        metalness: 0.05,
      });
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(drumRadius, drumRadius * 1.03, 7.8, 24),
        drumMat,
      );
      drum.position.set(drumX, roofY + 1.1, drumZ);
      drum.castShadow = true;
      drum.receiveShadow = true;
      meshes.push(drum);

      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(drumRadius + 0.55, drumRadius + 0.55, 0.75, 24),
        trimMat,
      );
      ring.position.set(drumX, roofY + 5.1, drumZ);
      ring.castShadow = true;
      meshes.push(ring);

      const ribGeo = new THREE.BoxGeometry(0.45, 4.8, 0.7);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const rib = new THREE.Mesh(ribGeo, trimMat);
        rib.position.set(
          drumX + Math.cos(a) * (drumRadius + 0.15),
          roofY + 2.5,
          drumZ + Math.sin(a) * (drumRadius + 0.15),
        );
        rib.rotation.y = -a;
        meshes.push(rib);
      }

      const domeMat = new THREE.MeshStandardMaterial({
        color: SCENE_PALETTE.accents.copperPatina,
        roughness: 0.65,
        metalness: 0.12,
      });
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(drumRadius * 0.94, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45),
        domeMat,
      );
      dome.scale.set(1, 0.38, 1);
      dome.position.set(drumX, roofY + 5.2, drumZ);
      dome.castShadow = true;
      meshes.push(dome);
      break;
    }

    case 'enshinkan-piloti': {
      // Murano Togo's iconic circular building supported by 16 piloti columns & mosaic tile ring
      const pilotiR = Math.max(7.0, Math.min(11.5, fp.radius * 0.78));
      const colMat = new THREE.MeshStandardMaterial({
        color: '#E7E0D2',
        roughness: 0.72,
      });
      const colGeo = new THREE.CylinderGeometry(0.55, 0.6, 4.2, 10);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(
          cx + Math.cos(a) * pilotiR,
          groundVisualY + 1.9,
          cz + Math.sin(a) * pilotiR,
        );
        col.castShadow = true;
        meshes.push(col);
      }

      // Blue/green/ochre mosaic accent tiles around upper perimeter
      const mosaicColors = ['#3B82B6', '#4BA378', '#E6B84C', '#EAE4D8'];
      const tileGeo = new THREE.BoxGeometry(2.1, 1.35, 0.45);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const tile = new THREE.Mesh(
          tileGeo,
          new THREE.MeshStandardMaterial({
            color: mosaicColors[i % mosaicColors.length] ?? '#3B82B6',
            roughness: 0.6,
          }),
        );
        tile.position.set(
          cx + Math.cos(a) * (pilotiR + 1.4),
          roofY - 2.6,
          cz + Math.sin(a) * (pilotiR + 1.4),
        );
        tile.rotation.y = -a + Math.PI / 2;
        meshes.push(tile);
      }

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(pilotiR * 0.85, pilotiR * 0.95, 1.2, 24),
        trimMat,
      );
      cap.position.set(cx, roofY + 0.6, cz);
      cap.castShadow = true;
      meshes.push(cap);
      break;
    }

    case 'ibunkan-octagonal-domes': {
      // Twin octagonal domes honoring the pre-war Main Hall at opposite ends
      const anchor = new THREE.Group();
      anchor.position.set(cx, roofY, cz);
      anchor.rotation.y = fp.angle;

      const domeBodyMat = new THREE.MeshStandardMaterial({
        color: '#E7DEC9',
        roughness: 0.72,
      });
      const domeRoofMat = new THREE.MeshStandardMaterial({
        color: SCENE_PALETTE.accents.copperPatina,
        roughness: 0.62,
        metalness: 0.14,
      });

      const domeR = Math.max(3.6, Math.min(5.2, fp.depth * 0.34));
      for (const side of [-1, 1]) {
        const ox = side * Math.max(6, fp.width * 0.32);
        const octBase = new THREE.Mesh(
          new THREE.CylinderGeometry(domeR, domeR * 1.04, 2.8, 8),
          domeBodyMat,
        );
        octBase.position.set(ox, 1.4, 0);
        octBase.castShadow = true;
        anchor.add(octBase);

        const octRoof = new THREE.Mesh(
          new THREE.ConeGeometry(domeR * 1.05, 3.2, 8),
          domeRoofMat,
        );
        octRoof.position.set(ox, 4.3, 0);
        octRoof.castShadow = true;
        anchor.add(octRoof);
      }

      meshes.push(anchor);
      break;
    }

    case 'shinkandaikaikan-cone': {
      // Iconic circular New Kandaikaikan South Wing with conical roof
      const coneR = Math.max(9.5, Math.min(14.5, fp.radius * 0.72));
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(coneR * 0.96, coneR * 1.0, 1.4, 24),
        new THREE.MeshStandardMaterial({
          color: SCENE_PALETTE.accents.glass,
          roughness: 0.3,
          metalness: 0.18,
        }),
      );
      collar.position.set(cx, roofY + 0.7, cz);
      meshes.push(collar);

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(coneR * 1.04, 6.2, 24),
        new THREE.MeshStandardMaterial({
          color: SCENE_PALETTE.accents.slateRoof,
          roughness: 0.62,
          metalness: 0.14,
        }),
      );
      cone.position.set(cx, roofY + 4.4, cz);
      cone.castShadow = true;
      meshes.push(cone);
      break;
    }

    case 'library-brick-canopy': {
      // Kito Azusa General Library: warm brick + broad horizontal cantilevered entrance canopy + skylight
      const roofAnchor = new THREE.Group();
      roofAnchor.position.set(cx, roofY, cz);
      roofAnchor.rotation.y = fp.angle;

      const lW = fp.width * 0.52;
      const lD = fp.depth * 0.44;
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(lW, 2.0, lD), trimMat);
      lantern.position.set(0, 1.0, 0);
      lantern.castShadow = true;
      roofAnchor.add(lantern);

      // Broad front entrance canopy overhang near ground/1F level
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(fp.width * 0.56, 0.9, 6.2),
        trimMat,
      );
      canopy.position.set(0, -(building.height - 5.2), fp.depth * 0.45);
      canopy.castShadow = true;
      roofAnchor.add(canopy);

      meshes.push(roofAnchor);
      break;
    }

    case 'rimpukan-green-roof': {
      // 3-stepped rooftop green garden + glass atrium + sakura + Savonius wind turbine
      const roofAnchor = new THREE.Group();
      roofAnchor.position.set(cx, roofY, cz);
      roofAnchor.rotation.y = fp.angle;

      const tW = fp.width * 0.72;
      const tD = fp.depth * 0.64;

      const grassMat = new THREE.MeshStandardMaterial({
        color: '#84B85F',
        roughness: 0.92,
        metalness: 0.02,
      });

      for (let s = 0; s < 3; s++) {
        const scaleF = 1 - s * 0.22;
        const stepPad = new THREE.Mesh(
          new THREE.BoxGeometry(tW * scaleF, 0.75, tD * scaleF),
          grassMat,
        );
        stepPad.position.set(s * 2.5, 0.35 + s * 0.72, 0);
        stepPad.receiveShadow = true;
        roofAnchor.add(stepPad);
      }

      const pavilion = new THREE.Mesh(
        new THREE.BoxGeometry(tW * 0.38, 2.8, tD * 0.42),
        new THREE.MeshStandardMaterial({
          color: SCENE_PALETTE.accents.glass,
          roughness: 0.28,
          metalness: 0.16,
        }),
      );
      pavilion.position.set(-tW * 0.2, 2.1, -tD * 0.06);
      pavilion.castShadow = true;
      roofAnchor.add(pavilion);

      const sakuraMat = new THREE.MeshStandardMaterial({
        color: SCENE_PALETTE.accents.sakura,
        roughness: 0.85,
      });
      const sakuraOffsets: [number, number, number][] = [
        [0.14, 1.8, -0.22],
        [0.28, 1.5, 0.04],
        [0.16, 2.2, 0.22],
        [-0.08, 1.9, 0.26],
        [-0.28, 1.5, 0.22],
      ];
      for (const [ox, sy, oz] of sakuraOffsets) {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 1), sakuraMat);
        crown.position.set(ox * tW, sy, oz * tD);
        crown.castShadow = true;
        roofAnchor.add(crown);
      }

      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.35, 5.4, 8),
        new THREE.MeshStandardMaterial({ color: '#8E99A4', metalness: 0.4, roughness: 0.5 }),
      );
      mast.position.set(tW * 0.32, 2.7, -tD * 0.22);
      roofAnchor.add(mast);

      const rotorGroup = new THREE.Group();
      rotorGroup.position.set(tW * 0.32, 5.7, -tD * 0.22);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: '#FAF6EE',
        roughness: 0.4,
        metalness: 0.2,
      });
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 0.26), bladeMat);
        const angle = (i / 3) * Math.PI * 2;
        blade.rotation.y = angle;
        blade.position.x = Math.cos(angle) * 0.75;
        blade.position.z = Math.sin(angle) * 0.75;
        rotorGroup.add(blade);
      }
      roofAnchor.add(rotorGroup);
      animatedRotors.push(rotorGroup);
      meshes.push(roofAnchor);
      break;
    }

    case 'iwasaki-tower': {
      const roofAnchor = new THREE.Group();
      roofAnchor.position.set(cx, roofY, cz);
      roofAnchor.rotation.y = fp.angle;

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(fp.width * 0.78, 1.4, fp.depth * 0.72),
        trimMat,
      );
      cap.position.set(0, 0.7, 0);
      cap.castShadow = true;
      roofAnchor.add(cap);

      // Low-eaved glass box entrance at base
      const glassBox = new THREE.Mesh(
        new THREE.BoxGeometry(fp.width * 0.48, 3.6, 5.5),
        new THREE.MeshStandardMaterial({
          color: SCENE_PALETTE.accents.glass,
          roughness: 0.3,
          metalness: 0.16,
        }),
      );
      glassBox.position.set(0, -(building.height - 1.8), fp.depth * 0.52);
      glassBox.castShadow = true;
      roofAnchor.add(glassBox);

      meshes.push(roofAnchor);
      break;
    }

    case 'bighall-auditorium': {
      const roofAnchor = new THREE.Group();
      roofAnchor.position.set(cx, roofY, cz);
      roofAnchor.rotation.y = fp.angle;

      const crownMat = new THREE.MeshStandardMaterial({
        color: '#E7B05C',
        roughness: 0.72,
        metalness: 0.05,
      });
      const sW = Math.min(fp.width * 0.56, 22);
      const sD = Math.min(fp.depth * 0.52, 16);
      const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(sD * 0.48, sD * 0.54, 3.2, 8),
        crownMat,
      );
      shell.scale.set(sW / Math.max(1, sD), 1, 1);
      shell.position.set(0, 1.6, 0);
      shell.castShadow = true;
      roofAnchor.add(shell);

      const skylight = new THREE.Mesh(
        new THREE.BoxGeometry(sW * 0.62, 0.75, sD * 0.45),
        trimMat,
      );
      skylight.position.set(0, 3.4, 0);
      roofAnchor.add(skylight);
      meshes.push(roofAnchor);
      break;
    }

    case 'area1-brick': {
      const roofAnchor = new THREE.Group();
      roofAnchor.position.set(cx, roofY, cz);
      roofAnchor.rotation.y = fp.angle;

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(fp.width * 0.55, 1.1, fp.depth * 0.42),
        new THREE.MeshStandardMaterial({
          color: baseMatColor,
          roughness: 0.78,
        }),
      );
      cap.position.set(0, 0.55, 0);
      cap.castShadow = true;
      roofAnchor.add(cap);

      if (building.id === 'area1-1') {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(5.2, 5.8, 5.2), trimMat);
        tower.position.set(0, 2.9, 0);
        tower.castShadow = true;
        roofAnchor.add(tower);

        const spire = new THREE.Mesh(
          new THREE.ConeGeometry(4.0, 3.4, 4),
          new THREE.MeshStandardMaterial({
            color: SCENE_PALETTE.buildings.area1,
            roughness: 0.75,
          }),
        );
        spire.rotation.y = Math.PI / 4;
        spire.position.set(0, 7.4, 0);
        spire.castShadow = true;
        roofAnchor.add(spire);
      }
      meshes.push(roofAnchor);
      break;
    }

    case 'area3-white-courtyard': {
      const roofAnchor = new THREE.Group();
      roofAnchor.position.set(cx, roofY, cz);
      roofAnchor.rotation.y = fp.angle;

      // Rooftop plaza green patch & pergola accent on Sociology complex
      const greenPatch = new THREE.Mesh(
        new THREE.BoxGeometry(fp.width * 0.22, 0.5, fp.depth * 0.28),
        new THREE.MeshStandardMaterial({ color: '#83B462', roughness: 0.9 }),
      );
      greenPatch.position.set(fp.width * 0.24, 0.25, 0);
      roofAnchor.add(greenPatch);
      meshes.push(roofAnchor);
      break;
    }

    case 'area4-white-lab': {
      const roofAnchor = new THREE.Group();
      roofAnchor.position.set(cx, roofY, cz);
      roofAnchor.rotation.y = fp.angle;

      const pW = Math.min(fp.width * 0.46, 17);
      const pD = Math.min(fp.depth * 0.4, 10.5);
      const penthouse = new THREE.Mesh(new THREE.BoxGeometry(pW, 1.8, pD), trimMat);
      penthouse.position.set(0, 0.9, 0);
      penthouse.castShadow = true;
      roofAnchor.add(penthouse);

      const accent = new THREE.Mesh(
        new THREE.BoxGeometry(pW * 0.65, 0.65, pD * 0.6),
        new THREE.MeshStandardMaterial({
          color: '#3E6FA8',
          roughness: 0.65,
        }),
      );
      accent.position.set(0, 2.1, 0);
      roofAnchor.add(accent);
      meshes.push(roofAnchor);
      break;
    }

    case 'gym-arena': {
      const roofAnchor = new THREE.Group();
      roofAnchor.position.set(cx, roofY, cz);
      roofAnchor.rotation.y = fp.angle;

      const vault = new THREE.Mesh(
        new THREE.BoxGeometry(fp.width * 0.72, 2.2, fp.depth * 0.68),
        new THREE.MeshStandardMaterial({
          color: '#5D8E6D',
          roughness: 0.75,
        }),
      );
      vault.position.set(0, 1.1, 0);
      vault.castShadow = true;
      roofAnchor.add(vault);
      meshes.push(roofAnchor);
      break;
    }

    case 'main-gate': {
      const pillarMat = new THREE.MeshStandardMaterial({
        color: '#E5DBC7',
        roughness: 0.78,
      });
      const navyMat = new THREE.MeshStandardMaterial({
        color: SCENE_PALETTE.accents.kandaiNavy,
        roughness: 0.55,
      });
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 8.4, 2.6), pillarMat);
        pillar.position.set(cx + side * 4.5, roofY - 2.9, cz - side * 2.2);
        pillar.castShadow = true;
        meshes.push(pillar);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.9, 3.1), navyMat);
        cap.position.set(cx + side * 4.5, roofY + 1.5, cz - side * 2.2);
        meshes.push(cap);
      }
      break;
    }

    case 'west-gate': {
      // Modern steel & glass arch marking the West Gate entrance to the New Access route
      const postMat = new THREE.MeshStandardMaterial({
        color: SCENE_PALETTE.accents.kandaiNavy,
        roughness: 0.5,
        metalness: 0.25,
      });
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(1.1, 6.2, 1.1), postMat);
        post.position.set(cx, roofY - 2.1, cz + side * 3.4);
        post.castShadow = true;
        meshes.push(post);
      }
      const transom = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.9, 8.2),
        new THREE.MeshStandardMaterial({
          color: SCENE_PALETTE.accents.canopyGlass,
          roughness: 0.25,
        }),
      );
      transom.position.set(cx, roofY + 1.0, cz);
      meshes.push(transom);
      break;
    }

    case 'station-platform': {
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(10, 1.4, 34),
        new THREE.MeshStandardMaterial({
          color: '#F3ECE0',
          roughness: 0.7,
        }),
      );
      canopy.position.set(cx, roofY - 1.5, cz);
      canopy.rotation.y = 0.08;
      canopy.castShadow = true;
      meshes.push(canopy);

      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(10.4, 0.75, 34.4),
        new THREE.MeshStandardMaterial({
          color: SCENE_PALETTE.accents.hankyuMaroon,
          roughness: 0.6,
        }),
      );
      stripe.position.set(cx, roofY - 0.6, cz);
      stripe.rotation.y = 0.08;
      meshes.push(stripe);
      break;
    }

    default:
      break;
  }

  return { meshes, animatedRotors };
}

