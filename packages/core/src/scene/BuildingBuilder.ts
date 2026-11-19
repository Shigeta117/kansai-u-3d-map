import * as THREE from 'three';
import { computeVisualY } from '../domain/projection';
import type { BuildingCategory, BuildingFeature, CampusConfig } from '../domain/types';
import { sculptLandmarkDetails } from './LandmarkSculptor';
import { SCENE_PALETTE } from './palette';
import { mergeSimpleGeometries } from './TerrainBuilder';

export interface MaterialColorEntry {
  mat: THREE.MeshStandardMaterial;
  baseHex: string;
}

export interface BuildingMeshRecord {
  building: BuildingFeature;
  group: THREE.Group;
  primaryMaterials: MaterialColorEntry[];
  baseY: number;
}

export interface BuildingsBuildResult {
  root: THREE.Group;
  campusRecords: Map<string, BuildingMeshRecord>;
  interactiveMeshes: THREE.Object3D[];
  animatedRotors: THREE.Object3D[];
}

function toShapeInXZ(
  outer: [number, number][],
  holes?: [number, number][][],
): THREE.Shape {
  const shapePts = outer.map(([x, z]) => new THREE.Vector2(x, -z));
  if (THREE.ShapeUtils.isClockWise(shapePts)) {
    shapePts.reverse();
  }
  const shape = new THREE.Shape(shapePts);

  if (holes) {
    for (const hole of holes) {
      if (hole.length < 3) continue;
      const holePts = hole.map(([x, z]) => new THREE.Vector2(x, -z));
      if (!THREE.ShapeUtils.isClockWise(holePts)) {
        holePts.reverse();
      }
      shape.holes.push(new THREE.Path(holePts));
    }
  }
  return shape;
}

function createExtrudedBuildingGeometry(
  b: BuildingFeature,
  minElevation: number,
  exag: number,
  bevel: boolean,
): { geometry: THREE.BufferGeometry; roofVisualY: number; groundVisualY: number } {
  const isPiloti = b.sculptStyle === 'enshinkan-piloti';
  const skirtDepth = isPiloti ? -3.4 : 5.0; // lift Enshinkan drum 3.4m off ground for 16 piloti columns
  const groundVisualY = computeVisualY(b.groundY, minElevation, exag);
  const minVisualY = isPiloti
    ? groundVisualY + 3.4
    : computeVisualY(b.minGroundY, minElevation, exag) - skirtDepth;
  const roofVisualY = groundVisualY + b.height;
  const totalDepth = Math.max(2.5, roofVisualY - minVisualY);

  const shape = toShapeInXZ(b.polygon, b.holes);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: totalDepth,
    bevelEnabled: bevel,
    bevelThickness: bevel ? 0.25 : 0,
    bevelSize: bevel ? 0.2 : 0,
    bevelSegments: bevel ? 1 : 0,
    curveSegments: 4,
  });

  geo.rotateX(-Math.PI / 2);
  geo.translate(0, minVisualY, 0);
  geo.computeVertexNormals();

  return { geometry: geo, roofVisualY, groundVisualY };
}

function createFacadeBandTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const w = 128;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(34, 42, 56, 0.12)';
  for (let row = 0; row < 4; row++) {
    const y = row * 32 + 9;
    for (let col = 0; col < 4; col++) {
      const x = col * 32 + 6;
      ctx.fillRect(x, y, 20, 14);
    }
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  for (let row = 0; row < 4; row++) {
    ctx.fillRect(0, row * 32, w, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.07, 0.07);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getShadeVariant(baseHex: string, id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const offset = (((h >>> 0) % 100) / 100 - 0.5) * 0.05;
  const c = new THREE.Color(baseHex);
  c.offsetHSL(0, 0, offset);
  return `#${c.getHexString()}`;
}

export function buildBuildingsGroup(
  buildings: BuildingFeature[],
  minElevation: number,
  config: CampusConfig,
  options: { forExport?: boolean; campusOnly?: boolean } = {},
): BuildingsBuildResult {
  const root = new THREE.Group();
  root.name = 'campus-buildings-root';

  const exag = config.verticalExaggeration;
  const campusRecords = new Map<string, BuildingMeshRecord>();
  const interactiveMeshes: THREE.Object3D[] = [];
  const animatedRotors: THREE.Object3D[] = [];
  const facadeTex = options.forExport ? null : createFacadeBandTexture();

  const surroundingGeos: THREE.BufferGeometry[] = [];
  const baseSurroundingColor = new THREE.Color(SCENE_PALETTE.buildings.surrounding);

  for (const b of buildings) {
    if (!b.inCampus && b.category === 'surrounding') {
      if (options.campusOnly) continue;

      const { geometry } = createExtrudedBuildingGeometry(b, minElevation, exag, false);
      const posCount = geometry.getAttribute('position').count;
      const colorArr = new Float32Array(posCount * 3);
      const c = baseSurroundingColor.clone().offsetHSL(
        0,
        0,
        ((b.id.charCodeAt(b.id.length - 1) % 7) - 3) * 0.012,
      );
      for (let i = 0; i < posCount; i++) {
        colorArr[i * 3] = c.r;
        colorArr[i * 3 + 1] = c.g;
        colorArr[i * 3 + 2] = c.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
      surroundingGeos.push(geometry);
      continue;
    }

    if (b.isSpotOnly) {
      const spotGroup = new THREE.Group();
      spotGroup.name = `building-${b.id}`;
      spotGroup.userData = { buildingId: b.id };
      const groundVisualY = computeVisualY(b.groundY, minElevation, exag);
      const roofVisualY = groundVisualY + b.height;

      const sculpted = sculptLandmarkDetails(
        b,
        roofVisualY,
        groundVisualY,
        SCENE_PALETTE.buildings[b.category],
      );
      if (sculpted.meshes.length > 0) {
        for (const m of sculpted.meshes) {
          m.traverse((obj) => {
            obj.userData = { buildingId: b.id };
            if (obj instanceof THREE.Mesh) {
              interactiveMeshes.push(obj);
            }
          });
          spotGroup.add(m);
        }
        animatedRotors.push(...sculpted.animatedRotors);
      } else {
        const padMat = new THREE.MeshStandardMaterial({
          color:
            b.id === 'yukyu-garden'
              ? SCENE_PALETTE.landcover.lawn
              : SCENE_PALETTE.buildings.gate,
          roughness: 0.78,
        });
        const pad = new THREE.Mesh(
          new THREE.CylinderGeometry(b.id === 'yukyu-garden' ? 6.5 : 3.2, 3.6, 1.2, 12),
          padMat,
        );
        pad.position.set(b.centroid.x, groundVisualY + 0.6, b.centroid.z);
        pad.userData = { buildingId: b.id };
        pad.castShadow = true;
        spotGroup.add(pad);
        interactiveMeshes.push(pad);
      }

      root.add(spotGroup);
      campusRecords.set(b.id, {
        building: b,
        group: spotGroup,
        primaryMaterials: [],
        baseY: 0,
      });
      continue;
    }

    const bGroup = new THREE.Group();
    bGroup.name = `building-${b.id}`;
    bGroup.userData = { buildingId: b.id };

    const wallHex = getShadeVariant(SCENE_PALETTE.buildings[b.category], b.id);
    const roofOverride = SCENE_PALETTE.roofOverrides[b.category];
    const roofHex = roofOverride
      ? roofOverride
      : `#${new THREE.Color(wallHex).offsetHSL(0, -0.04, 0.04).getHexString()}`;

    const { geometry, roofVisualY, groundVisualY } = createExtrudedBuildingGeometry(
      b,
      minElevation,
      exag,
      true,
    );

    const roofMat = new THREE.MeshStandardMaterial({
      color: roofHex,
      roughness: 0.82,
      metalness: 0.03,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: wallHex,
      roughness: 0.78,
      metalness: 0.04,
      ...(facadeTex ? { map: facadeTex } : {}),
    });

    const bodyMaterials = options.forExport ? wallMat : [roofMat, wallMat];
    const bodyMesh = new THREE.Mesh(geometry, bodyMaterials);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.userData = { buildingId: b.id };
    bGroup.add(bodyMesh);
    interactiveMeshes.push(bodyMesh);

    const sculpted = sculptLandmarkDetails(b, roofVisualY, groundVisualY, wallHex);
    for (const m of sculpted.meshes) {
      m.traverse((obj) => {
        obj.userData = { buildingId: b.id };
        if (obj instanceof THREE.Mesh) {
          interactiveMeshes.push(obj);
        }
      });
      bGroup.add(m);
    }
    animatedRotors.push(...sculpted.animatedRotors);

    root.add(bGroup);
    campusRecords.set(b.id, {
      building: b,
      group: bGroup,
      primaryMaterials: options.forExport
        ? [{ mat: wallMat, baseHex: wallHex }]
        : [
            { mat: roofMat, baseHex: roofHex },
            { mat: wallMat, baseHex: wallHex },
          ],
      baseY: 0,
    });
  }

  if (surroundingGeos.length > 0 && !options.campusOnly) {
    const mergedSurrounding = mergeSimpleGeometries(surroundingGeos);
    for (const g of surroundingGeos) g.dispose();
    const surrMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.02,
    });
    const surrMesh = new THREE.Mesh(mergedSurrounding, surrMat);
    surrMesh.name = 'surrounding-buildings';
    surrMesh.castShadow = true;
    surrMesh.receiveShadow = true;
    root.add(surrMesh);
  }

  return {
    root,
    campusRecords,
    interactiveMeshes,
    animatedRotors,
  };
}

export function applyBuildingVisualStates(
  records: Map<string, BuildingMeshRecord>,
  selectedId: string | null,
  activeCategory: BuildingCategory | 'all',
): void {
  const highlightColor = new THREE.Color(SCENE_PALETTE.accents.highlight);

  for (const [id, rec] of records.entries()) {
    const isSelected = id === selectedId;
    const isDimmed =
      activeCategory !== 'all' && rec.building.category !== activeCategory && !isSelected;

    for (const entry of rec.primaryMaterials) {
      entry.mat.color.set(entry.baseHex);
      if (isDimmed) {
        entry.mat.color.lerp(new THREE.Color('#DDD8CE'), 0.65);
        entry.mat.emissive.set('#000000');
        entry.mat.emissiveIntensity = 0;
      } else if (isSelected) {
        entry.mat.emissive.copy(highlightColor);
        entry.mat.emissiveIntensity = 0.26;
      } else {
        entry.mat.emissive.set('#000000');
        entry.mat.emissiveIntensity = 0;
      }
    }

    rec.group.position.y = isSelected ? 1.4 : 0;
  }
}

