import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../../domain/types';
import { buildLibrary } from './library';

/** 1 段構えになる段の数の上限（段が 8 つ以下 → 踏み面は 7 つ以下） */
const SINGLE_FLIGHT_STEP_LIMIT = 7;

const LIBRARY_POLYGON: [number, number][] = [
  [-77, 72],
  [-75, 68],
  [-83, 64],
  [-56, 13],
  [-47, 17],
  [-45, 13],
  [-3, 36],
  [3, 40],
  [1, 43],
  [30, 58],
  [-19, 105],
  [-31, 98],
  [-30, 96],
  [-49, 86],
  [-64, 78],
  [-65, 79],
];

/** どこでも同じ高さの地面 */
function flatGround(y: number): (x: number, z: number) => number {
  return () => y;
}

/** 南（+Z、正面の道の側）へ 1m あたり slope だけ下る斜面。z = 60（重心付近）で groundVisualY */
function slopedGround(groundVisualY: number, slope: number): (x: number, z: number) => number {
  return (_x, z) => groundVisualY - slope * (z - 60);
}

/** InstancedMesh の各インスタンスの単位箱（±0.5）の 8 隅をワールド座標で返す */
function instanceCorners(mesh: THREE.InstancedMesh): THREE.Vector3[][] {
  const out: THREE.Vector3[][] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    m.premultiply(mesh.matrixWorld);
    const corners: THREE.Vector3[] = [];
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [-0.5, 0.5]) {
        for (const sz of [-0.5, 0.5]) {
          corners.push(new THREE.Vector3(sx, sy, sz).applyMatrix4(m));
        }
      }
    }
    out.push(corners);
  }
  return out;
}

/** group の正確な外形（InstancedMesh は各インスタンスの隅から。three の setFromObject は回転した group で膨らむ） */
function preciseBox(group: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  group.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) {
      for (const corners of instanceCorners(obj)) {
        for (const p of corners) box.expandByPoint(p);
      }
    } else if (obj instanceof THREE.Mesh) {
      box.union(new THREE.Box3().setFromObject(obj, true));
    }
  });
  return box;
}

/** OSM の大階段（steps の道 path_423060514）の上端・下端と、メインストリート（path_423060527）の中心線 */
const OSM_STAIR_TOP = new THREE.Vector2(-52.9, 94.4);
const OSM_STAIR_BOTTOM = new THREE.Vector2(-69.4, 123.8);
const MAIN_STREET: [number, number][] = [
  [-111.2, 120.4],
  [-89.7, 122.1],
  [-69.4, 123.8],
  [-50.2, 124.5],
  [-33.3, 126.5],
  [-19.2, 123.4],
];
const MAIN_STREET_HALF_WIDTH = 2.1;

function distanceToStreet(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < MAIN_STREET.length; i++) {
    const a = MAIN_STREET[i];
    const b = MAIN_STREET[i + 1];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
  }
  return best;
}

/** 底面の 4 隅（xz）で囲まれた長方形から点 p までの距離（中なら 0） */
function distanceToFootprint(corners: THREE.Vector3[], p: THREE.Vector2): number {
  const bottom = Math.min(...corners.map((c) => c.y));
  const quad = corners.filter((c) => c.y < bottom + 1e-6).map((c) => new THREE.Vector2(c.x, c.z));
  const [a, b, c, d] = quad;
  if (!a || !b || !c || !d) return Infinity;
  // 箱の底面の隅は (-,-), (-,+), (+,-), (+,+) の順（instanceCorners の並び）。周回の順に並べ替える
  const ring = [a, b, d, c];
  let inside = true;
  let minEdge = Infinity;
  for (let i = 0; i < 4; i++) {
    const p0 = ring[i] as THREE.Vector2;
    const p1 = ring[(i + 1) % 4] as THREE.Vector2;
    const e = p1.clone().sub(p0);
    const cross = e.x * (p.y - p0.y) - e.y * (p.x - p0.x);
    const ref = ring[(i + 2) % 4] as THREE.Vector2;
    const refCross = e.x * (ref.y - p0.y) - e.y * (ref.x - p0.x);
    if (Math.sign(cross) !== Math.sign(refCross) && Math.abs(cross) > 1e-9) inside = false;
    const t = Math.max(0, Math.min(1, p.clone().sub(p0).dot(e) / e.lengthSq()));
    minEdge = Math.min(minEdge, p0.clone().addScaledVector(e, t).distanceTo(p));
  }
  return inside ? 0 : minEdge;
}

function createLibraryBuilding(): BuildingFeature {
  return {
    id: 'library',
    name: '総合図書館',
    shortName: '総合図書館',
    kana: 'そうごうとしょかん',
    englishName: 'Kansai University General Library',
    category: 'heritage',
    inCampus: true,
    faculties: [],
    facilityTags: ['library'],
    keywords: [],
    description: '',
    sculptStyle: 'library-brick-canopy',
    labelPriority: 1,
    polygon: LIBRARY_POLYGON.map(([x, z]) => [x, z]),
    centroid: { x: -38.1, z: 60.4 },
    groundY: 45.55,
    minGroundY: 43.73,
    maxGroundY: 45.55,
    height: 9,
    levels: 2,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

describe('buildLibrary', () => {
  it('builds meshes within budget with primaryMaterials and empty animated list', () => {
    const result = buildLibrary({
      building: createLibraryBuilding(),
      groundVisualY: 25,
      sampleGroundVisualY: flatGround(25),
    });

    const meshes: THREE.Mesh[] = [];
    result.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshes.push(obj);
      }
    });

    expect(meshes.length).toBeGreaterThanOrEqual(1);
    expect(meshes.length).toBeLessThanOrEqual(150);

    expect(result.primaryMaterials.length).toBeGreaterThanOrEqual(1);
    expect(result.primaryMaterials).toHaveLength(2);
    expect(result.primaryMaterials.map((entry) => entry.baseHex)).toEqual([
      '#A8634A',
      '#4E6570',
    ]);
    for (const entry of result.primaryMaterials) {
      expect(entry.mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    }

    expect(result.animated).toEqual([]);
  });

  it('produces only finite vertex coordinates, normals, and instance matrices', () => {
    const result = buildLibrary({
      building: createLibraryBuilding(),
      groundVisualY: 25,
      sampleGroundVisualY: flatGround(25),
    });

    let totalVertices = 0;
    const instanceMat = new THREE.Matrix4();

    result.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;

      const posAttr = obj.geometry.getAttribute('position');
      expect(posAttr).toBeDefined();
      if (!posAttr) return;

      expect(posAttr.count).toBeGreaterThan(0);
      totalVertices += posAttr.count;
      for (let i = 0; i < posAttr.count; i++) {
        expect(Number.isFinite(posAttr.getX(i))).toBe(true);
        expect(Number.isFinite(posAttr.getY(i))).toBe(true);
        expect(Number.isFinite(posAttr.getZ(i))).toBe(true);
      }

      const normAttr = obj.geometry.getAttribute('normal');
      if (normAttr) {
        for (let i = 0; i < normAttr.count; i++) {
          expect(Number.isFinite(normAttr.getX(i))).toBe(true);
          expect(Number.isFinite(normAttr.getY(i))).toBe(true);
          expect(Number.isFinite(normAttr.getZ(i))).toBe(true);
        }
      }

      if (obj instanceof THREE.InstancedMesh) {
        expect(obj.count).toBeGreaterThan(0);
        for (let i = 0; i < obj.count; i++) {
          obj.getMatrixAt(i, instanceMat);
          for (const v of instanceMat.elements) {
            expect(Number.isFinite(v)).toBe(true);
          }
        }
      }
    });

    expect(totalVertices).toBeGreaterThan(0);
  });

  it.each([0, 25])(
    'fits within the expected bounding box for groundVisualY = %d',
    (groundVisualY) => {
      const result = buildLibrary({
        building: createLibraryBuilding(),
        groundVisualY,
        sampleGroundVisualY: flatGround(groundVisualY),
      });

      result.group.updateMatrixWorld(true);
      const box = preciseBox(result.group);

      expect(box.isEmpty()).toBe(false);
      expect(box.min.x).toBeGreaterThanOrEqual(-95);
      expect(box.max.x).toBeLessThanOrEqual(40);
      expect(box.min.z).toBeGreaterThanOrEqual(0);
      // 大階段の下端はメインストリート（中心線 z≈124）の北の縁まで。道の上・道の向こうへは出ない
      expect(box.max.z).toBeLessThanOrEqual(124);
      // 平らな地面では、底は地面より 0.5m 下
      expect(box.min.y).toBeCloseTo(groundVisualY - 0.5, 5);
      // 右の塔はテラス 0.6m + 本体 14.4m + 2.5m = 17.5m（左の塔は +1.5m）
      expect(box.max.y).toBeLessThanOrEqual(groundVisualY + 22);
      // 3 階建てとして、誤った OSM 高さ（9m）より十分に高いことを確認
      expect(box.max.y).toBeGreaterThan(groundVisualY + 15);
    },
  );

  it('uses a single flight on flat ground (terrace only 0.6m above the ground)', () => {
    const result = buildLibrary({
      building: createLibraryBuilding(),
      groundVisualY: 25,
      sampleGroundVisualY: flatGround(25),
    });
    result.group.updateMatrixWorld(true);
    const landing = result.group.getObjectByName('library-stair-landing');
    expect(landing).toBeInstanceOf(THREE.Mesh);
    if (!(landing instanceof THREE.Mesh)) return;
    const landingBox = new THREE.Box3().setFromObject(landing);
    // 1 段構え: 踊り場の代わりにテラスの高さの床が続く
    expect(landingBox.max.y).toBeCloseTo(25.6, 5);
    expect(landingBox.min.y).toBeCloseTo(24.5, 5);
  });

  describe('on a slope that falls toward the street', () => {
    const groundVisualY = 42;
    const ground = slopedGround(groundVisualY, 0.2);
    const result = buildLibrary({
      building: createLibraryBuilding(),
      groundVisualY,
      sampleGroundVisualY: ground,
    });
    result.group.updateMatrixWorld(true);

    const stairs = result.group.getObjectByName('library-grand-stairs');
    const steps = stairs instanceof THREE.InstancedMesh ? instanceCorners(stairs) : [];
    const stepTops = steps.map((c) => Math.max(...c.map((p) => p.y)));

    it('splits the rise into two flights of 0.15-0.2m risers', () => {
      expect(stairs).toBeInstanceOf(THREE.InstancedMesh);
      expect(steps.length).toBeGreaterThan(SINGLE_FLIGHT_STEP_LIMIT);
      const uniqueTops = [...new Set(stepTops.map((y) => Math.round(y * 1000) / 1000))].sort(
        (a, b) => a - b,
      );
      const landing = result.group.getObjectByName('library-stair-landing');
      if (!(landing instanceof THREE.Mesh)) throw new Error('landing missing');
      const landingTop = new THREE.Box3().setFromObject(landing).max.y;
      const terrace = result.group.getObjectByName('library-entrance-terrace');
      if (!(terrace instanceof THREE.Mesh)) throw new Error('terrace missing');
      const terraceTop = new THREE.Box3().setFromObject(terrace).max.y;
      // 踊り場は下端とテラスの間（2 段構え）
      expect(landingTop).toBeGreaterThan(Math.min(...uniqueTops) + 1);
      expect(landingTop).toBeLessThan(terraceTop - 1);
      // 段の高さ（下の段の上面どうし・最後の段から踊り場・テラスまで）はどれも 0.15〜0.2m
      const levels = [...uniqueTops, landingTop, terraceTop].sort((a, b) => a - b);
      for (let i = 1; i < levels.length; i++) {
        const riser = (levels[i] ?? 0) - (levels[i - 1] ?? 0);
        expect(riser).toBeGreaterThanOrEqual(0.149);
        expect(riser).toBeLessThanOrEqual(0.201);
      }
    });

    it('starts the lowest step on the ground with no step-up or gap at the foot', () => {
      const lowestIdx = stepTops.indexOf(Math.min(...stepTops));
      const lowest = steps[lowestIdx];
      expect(lowest).toBeDefined();
      if (!lowest) return;
      const lowestTop = Math.max(...lowest.map((p) => p.y));
      const bottom = Math.min(...lowest.map((p) => p.y));
      // 段の底面の 4 隅すべてで、地面より下まで埋まっている（すき間なし）
      const bottomCorners = lowest.filter((p) => p.y < bottom + 1e-6);
      for (const p of bottomCorners) {
        expect(bottom).toBeLessThan(ground(p.x, p.z));
      }
      // 道寄りの前の縁でいちばん低い地面から、上面まで 1 段（0.2m 以下）。それ以上の段差（浮き）が無い
      const minGroundUnderLowest = Math.min(...bottomCorners.map((p) => ground(p.x, p.z)));
      expect(lowestTop - minGroundUnderLowest).toBeLessThanOrEqual(0.201);
      expect(lowestTop - minGroundUnderLowest).toBeGreaterThan(0);
    });

    it('sinks every step below the ground at its own corners', () => {
      for (const corners of steps) {
        const bottom = Math.min(...corners.map((p) => p.y));
        for (const p of corners) {
          expect(bottom).toBeLessThan(ground(p.x, p.z));
        }
      }
    });

    it('drops the footing 0.5m below the lowest ground under the outline and stairs', () => {
      const box = new THREE.Box3().setFromObject(result.group);
      let lowestOutline = Infinity;
      for (const [x, z] of LIBRARY_POLYGON) {
        lowestOutline = Math.min(lowestOutline, ground(x, z));
      }
      expect(box.min.y).toBeLessThanOrEqual(lowestOutline - 0.5 + 1e-6);
      const body = result.group.getObjectByName('library-main-body');
      if (!(body instanceof THREE.Mesh)) throw new Error('body missing');
      expect(new THREE.Box3().setFromObject(body).min.y).toBeLessThanOrEqual(
        lowestOutline - 0.5 + 1e-6,
      );
    });

    it('runs the stair centerline along the OSM steps from the entrance down to the main street', () => {
      // 上端の段（いちばん高い段）の中心は OSM の上端の近く
      const topIdx = stepTops.indexOf(Math.max(...stepTops));
      const top = steps[topIdx];
      if (!top) throw new Error('steps empty');
      const topCenter = new THREE.Vector2(
        top.reduce((acc, p) => acc + p.x, 0) / top.length,
        top.reduce((acc, p) => acc + p.z, 0) / top.length,
      );
      expect(topCenter.distanceTo(OSM_STAIR_TOP)).toBeLessThan(1.5);

      // OSM の下端は道の中心線上の点。OSM の線が道の北の縁に当たる点（縁石）まで、いちばん低い段が届く
      let curb = OSM_STAIR_BOTTOM.clone();
      for (let t = 0; t <= 1; t += 0.001) {
        const p = OSM_STAIR_TOP.clone().lerp(OSM_STAIR_BOTTOM, t);
        if (distanceToStreet(p.x, p.y) <= MAIN_STREET_HALF_WIDTH) {
          curb = p;
          break;
        }
      }
      const lowestIdx = stepTops.indexOf(Math.min(...stepTops));
      const lowest = steps[lowestIdx];
      if (!lowest) throw new Error('steps empty');
      expect(distanceToFootprint(lowest, curb)).toBeLessThan(0.3);
      // 道の中心線上の OSM の下端からは、道の幅の半分（2.1m）＋かぶせ量ほど
      const nearestToBottom = steps
        .map((c, i) => ({ i, d: distanceToFootprint(c, OSM_STAIR_BOTTOM) }))
        .sort((a, b) => a.d - b.d)[0];
      expect(nearestToBottom?.i).toBe(lowestIdx);
      expect(nearestToBottom?.d ?? Infinity).toBeLessThan(MAIN_STREET_HALF_WIDTH + 0.5);
    });

    it('never puts steps, the landing or the retaining walls on the main street', () => {
      const footprints: THREE.Vector3[][] = [...steps];
      const walls = result.group.getObjectByName('library-retaining-walls');
      if (walls instanceof THREE.InstancedMesh) footprints.push(...instanceCorners(walls));
      const landing = result.group.getObjectByName('library-stair-landing');
      if (!(landing instanceof THREE.Mesh)) throw new Error('landing missing');
      const lb = new THREE.Box3().setFromObject(landing, true);
      const landingPos = landing.geometry.getAttribute('position');
      const v = new THREE.Vector3();
      for (let i = 0; i < landingPos.count; i++) {
        v.fromBufferAttribute(landingPos, i).applyMatrix4(landing.matrixWorld);
        // 前端は道の縁から 0.15m だけ道にかぶせる
        expect(distanceToStreet(v.x, v.z)).toBeGreaterThan(MAIN_STREET_HALF_WIDTH - 0.2);
      }
      expect(lb.isEmpty()).toBe(false);
      for (const corners of footprints) {
        for (const p of corners) {
          expect(distanceToStreet(p.x, p.z)).toBeGreaterThan(MAIN_STREET_HALF_WIDTH - 0.2);
        }
      }
    });

    it('closes the street side of the clipped lower flight with a sloped cheek wall along the curb', () => {
      const cheek = result.group.getObjectByName('library-stair-street-cheek');
      if (!(cheek instanceof THREE.Mesh)) throw new Error('cheek missing');
      const pos = cheek.geometry.getAttribute('position');
      // 6 面（12 の三角形）すべてがある閉じた立体（道の側の大きな面が欠けない）
      expect(pos.count).toBe(36);
      const v = new THREE.Vector3();
      let maxY = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(cheek.matrixWorld);
        maxY = Math.max(maxY, v.y);
        // 道の縁に沿う（縁から 0.15m のかぶせ量＋折れ線と直線の差のぶんまで）
        expect(distanceToStreet(v.x, v.z)).toBeGreaterThan(MAIN_STREET_HALF_WIDTH - 0.35);
      }
      const landing = result.group.getObjectByName('library-stair-landing');
      if (!(landing instanceof THREE.Mesh)) throw new Error('landing missing');
      expect(maxY).toBeGreaterThan(new THREE.Box3().setFromObject(landing, true).max.y);
    });

    it('extends the terrace level forward to the top of the stairs (top step meets it)', () => {
      const platform = result.group.getObjectByName('library-stair-top-platform');
      const terrace = result.group.getObjectByName('library-entrance-terrace');
      if (!(platform instanceof THREE.Mesh) || !(terrace instanceof THREE.Mesh)) {
        throw new Error('platform or terrace missing');
      }
      const pb = new THREE.Box3().setFromObject(platform, true);
      const tb = new THREE.Box3().setFromObject(terrace, true);
      expect(pb.max.y).toBeCloseTo(tb.max.y, 5);
      // 上端の床の前端は OSM の上端を通る（床の箱のローカル座標で、OSM の上端が前端の縁の上にある）
      const geo = platform.geometry;
      if (!(geo instanceof THREE.BoxGeometry)) throw new Error('platform is not a box');
      const { width, depth } = geo.parameters;
      const local = new THREE.Vector3(OSM_STAIR_TOP.x, pb.max.y, OSM_STAIR_TOP.y).applyMatrix4(
        platform.matrixWorld.clone().invert(),
      );
      expect(Math.abs(local.x)).toBeLessThan(width * 0.5);
      expect(Math.abs(local.z - depth * 0.5)).toBeLessThan(0.1);
    });
  });
});
