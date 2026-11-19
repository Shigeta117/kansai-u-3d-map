import * as THREE from 'three';
import { computeVisualY, sampleElevation } from '../domain/projection';
import type {
  BuildingCategory,
  BuildingFeature,
  CampusConfig,
  DioramaConfig,
  TerrainGrid,
} from '../domain/types';
import { SENRIYAMA_AERIAL_ROOF_HEX } from '../data/campuses/senriyama/roof-colors';
import { ensureExtrudeLids } from './extrudeLids';
import { HERO_BUILDERS } from './heroes';
import { sculptLandmarkDetails } from './LandmarkSculptor';
import { mergeStaticMeshes } from './mergeStaticMeshes';
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
  /** 屋根の色の切り替え用（主役の建物以外）。aerial は空中写真の色、area はエリアごとの塗り分け */
  roofColors?: { entry: MaterialColorEntry; area: string; aerial?: string };
}

/** 屋根の色の決め方。aerial＝空中写真から読み取った色（無い建物はエリアの色）、area＝エリアごとの塗り分け */
export type RoofColorMode = 'aerial' | 'area';

export function applyRoofColorMode(
  records: Map<string, BuildingMeshRecord>,
  mode: RoofColorMode,
): void {
  for (const rec of records.values()) {
    const rc = rec.roofColors;
    if (!rc) continue;
    rc.entry.baseHex = mode === 'aerial' && rc.aerial ? rc.aerial : rc.area;
    rc.entry.mat.color.set(rc.entry.baseHex);
  }
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
  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth: totalDepth,
    bevelEnabled: bevel,
    bevelThickness: bevel ? 0.25 : 0,
    bevelSize: bevel ? 0.2 : 0,
    bevelSegments: bevel ? 1 : 0,
    curveSegments: 4,
  });
  // 面取りなし（周辺の建物）だと three r175 は屋根を作らないので補う。底は地面の下に隠れるので張らない
  const geo = bevel
    ? extruded
    : ensureExtrudeLids(extruded, shape, totalDepth, { curveSegments: 4, bottom: false });

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

/**
 * 建物 1 棟の group を仕上げる。動かない部品を材質ごとにまとめ（mergeParts のとき。回る物は残す）、
 * まとめた後のメッシュに buildingId を付けて選択の当たり判定の対象に入れる
 */
function finalizeBuildingGroup(
  group: THREE.Group,
  buildingId: string,
  animated: readonly THREE.Object3D[],
  mergeParts: boolean,
  interactiveMeshes: THREE.Object3D[],
): void {
  if (mergeParts) {
    mergeStaticMeshes(group, { keep: animated });
  }
  group.traverse((obj) => {
    obj.userData = { ...obj.userData, buildingId };
    if (obj instanceof THREE.Mesh) {
      interactiveMeshes.push(obj);
    }
  });
}

export function isBuildingWithinDiorama(
  building: Pick<BuildingFeature, 'polygon' | 'centroid'>,
  diorama: DioramaConfig,
): boolean {
  if (building.polygon.length === 0) {
    return (
      building.centroid.x >= diorama.minX &&
      building.centroid.x <= diorama.maxX &&
      building.centroid.z >= diorama.minZ &&
      building.centroid.z <= diorama.maxZ
    );
  }
  for (const [x, z] of building.polygon) {
    if (
      x < diorama.minX ||
      x > diorama.maxX ||
      z < diorama.minZ ||
      z > diorama.maxZ
    ) {
      return false;
    }
  }
  return true;
}

export function buildBuildingsGroup(
  buildings: BuildingFeature[],
  minElevation: number,
  config: CampusConfig,
  options: {
    forExport?: boolean;
    campusOnly?: boolean;
    terrain?: TerrainGrid;
    roofColorMode?: RoofColorMode;
    /**
     * 建物ごとに、動かない部品を材質ごとに 1 つのメッシュにまとめる（既定 true。描画命令を減らす）。
     * 3D の書き出し（forExport）ではまとめない。テストで部品ごとのメッシュを調べるときは false にする
     */
    mergeStaticParts?: boolean;
  } = {},
): BuildingsBuildResult {
  const root = new THREE.Group();
  root.name = 'campus-buildings-root';

  const exag = config.verticalExaggeration;
  const campusRecords = new Map<string, BuildingMeshRecord>();
  const interactiveMeshes: THREE.Object3D[] = [];
  const animatedRotors: THREE.Object3D[] = [];
  const facadeTex = options.forExport ? null : createFacadeBandTexture();
  const mergeParts = !options.forExport && (options.mergeStaticParts ?? true);

  const surroundingGeos: THREE.BufferGeometry[] = [];
  const baseSurroundingColor = new THREE.Color(SCENE_PALETTE.buildings.surrounding);

  for (const b of buildings) {
    if (!options.forExport && !isBuildingWithinDiorama(b, config.diorama)) {
      continue;
    }

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

    // 写真で確かめた主役の建物は、OSM の押し出しの代わりに専用の形で組む（3D の書き出しは従来どおり）
    const heroBuilder = options.forExport ? undefined : HERO_BUILDERS[b.id];
    if (heroBuilder) {
      const groundVisualY = computeVisualY(b.groundY, minElevation, exag);
      // 地形があれば任意の地点の地面の高さを引けるようにする（無ければ重心の高さで代用）
      const terrain = options.terrain;
      const sampleGroundVisualY = terrain
        ? (x: number, z: number): number =>
            computeVisualY(sampleElevation(terrain, x, z), minElevation, exag)
        : (): number => groundVisualY;
      const hero = heroBuilder({ building: b, groundVisualY, sampleGroundVisualY });
      hero.group.name = `building-${b.id}`;
      hero.group.userData = { buildingId: b.id };
      finalizeBuildingGroup(hero.group, b.id, hero.animated, mergeParts, interactiveMeshes);
      animatedRotors.push(...hero.animated);
      root.add(hero.group);
      campusRecords.set(b.id, {
        building: b,
        group: hero.group,
        primaryMaterials: hero.primaryMaterials,
        baseY: 0,
      });
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
          spotGroup.add(m);
        }
        finalizeBuildingGroup(spotGroup, b.id, sculpted.animatedRotors, mergeParts, interactiveMeshes);
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
    const areaRoofHex = roofOverride
      ? roofOverride
      : `#${new THREE.Color(wallHex).offsetHSL(0, -0.04, 0.04).getHexString()}`;
    const aerialRoofHex = SENRIYAMA_AERIAL_ROOF_HEX[b.id];
    const roofHex =
      (options.roofColorMode ?? 'aerial') === 'aerial' && aerialRoofHex ? aerialRoofHex : areaRoofHex;

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
    const roofEntry: MaterialColorEntry = { mat: roofMat, baseHex: roofHex };
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

    const sculpted = sculptLandmarkDetails(b, roofVisualY, groundVisualY, wallHex);
    for (const m of sculpted.meshes) {
      bGroup.add(m);
    }
    finalizeBuildingGroup(bGroup, b.id, sculpted.animatedRotors, mergeParts, interactiveMeshes);
    animatedRotors.push(...sculpted.animatedRotors);

    root.add(bGroup);
    campusRecords.set(b.id, {
      building: b,
      group: bGroup,
      primaryMaterials: options.forExport
        ? [{ mat: wallMat, baseHex: wallHex }]
        : [roofEntry, { mat: wallMat, baseHex: wallHex }],
      baseY: 0,
      roofColors: { entry: roofEntry, area: areaRoofHex, aerial: aerialRoofHex },
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

