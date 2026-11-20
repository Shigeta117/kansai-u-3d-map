import * as THREE from 'three';
import type { BuildingFeature } from '../domain/types';
import { findWingAt, type BuildingWing, type WingRegion } from '../domain/wings';
import { SCENE_PALETTE } from './palette';

/**
 * 建物の中の棟を選ぶ（docs/indoor-plan.md 12 節）。
 *
 * - 殻: 建物を組んだ直後（部品を材質ごとにまとめる前）に、棟ごとに「その棟の面だけ」の形を切り出して取っておく
 *   （buildWingShells）。部品に棟の印（userData.wingId）があれば印で、無ければ棟の塊の範囲で三角形を切って分ける
 * - 光らせ方: 棟ごとに材質を分けると描画命令が棟の数だけ増えるので、選んだ棟の殻を薄い光として 1 つのメッシュで重ねる
 *   （WingHighlighter）。選んでいない間は描かない（描画命令 0）、選ぶと +1
 * - 当たり判定: まとめた後のメッシュには棟の印が残らないので、同じ光線を棟の殻に当て直して棟を決める（resolveBuildingPick）。
 *   殻が無い建物は、押した点の (x, z) が入る塊の範囲で決める
 */

interface HalfPlane {
  nx: number;
  nz: number;
  c: number;
}

/** 塊の範囲の箱を、xz の半平面 (x, z)・n ≥ c の組にする */
function regionHalfPlanes(region: WingRegion | undefined): HalfPlane[] {
  if (!region) return [];
  const [ax, az] = region.axisU;
  const out: HalfPlane[] = [];
  if (region.uMin !== undefined) out.push({ nx: ax, nz: az, c: region.uMin });
  if (region.uMax !== undefined) out.push({ nx: -ax, nz: -az, c: -region.uMax });
  if (region.vMin !== undefined) out.push({ nx: -az, nz: ax, c: region.vMin });
  if (region.vMax !== undefined) out.push({ nx: az, nz: -ax, c: -region.vMax });
  return out;
}

const ON_PLANE_M = 1e-4;

/** 凸の多角形を半平面で切る（Sutherland–Hodgman。点は [x, y, z]） */
function clipPolygon(poly: THREE.Vector3[], hp: HalfPlane): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const side = (p: THREE.Vector3): number => p.x * hp.nx + p.z * hp.nz - hp.c;
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    if (!cur || !prev) continue;
    const sc = side(cur);
    const sp = side(prev);
    if (sc >= 0 !== sp >= 0) out.push(prev.clone().lerp(cur, sp / (sp - sc)));
    if (sc >= 0) out.push(cur);
  }
  return out;
}

/**
 * 三角形を塊の範囲で切る。境目の平面にぴったり載る壁（隣の棟との境の壁）は、外を向く側の棟だけに入れる
 * （両方の棟に入れると、選んでいない棟の側にも光が漏れる）
 */
function clipTriangleToRegion(tri: THREE.Vector3[], planes: readonly HalfPlane[], normal: THREE.Vector3): THREE.Vector3[] {
  let poly = tri;
  for (const hp of planes) {
    const onPlane = poly.every((p) => Math.abs(p.x * hp.nx + p.z * hp.nz - hp.c) < ON_PLANE_M);
    if (onPlane) {
      if (normal.x * hp.nx + normal.z * hp.nz >= 0) return [];
      continue;
    }
    poly = clipPolygon(poly, hp);
    if (poly.length < 3) return [];
  }
  return poly;
}

function isDrawnOpaque(material: THREE.Material | undefined): boolean {
  return Boolean(material && material.visible && !material.transparent);
}

/** 部品（かその親で、root より下）に付いた棟の印 */
function wingTagOf(obj: THREE.Object3D, root: THREE.Object3D): string | undefined {
  for (let cur: THREE.Object3D | null = obj; cur && cur !== root; cur = cur.parent) {
    const tag: unknown = cur.userData?.wingId;
    if (typeof tag === 'string') return tag;
  }
  return undefined;
}

function isVisibleWithin(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = obj; cur && cur !== root; cur = cur.parent) {
    if (!cur.visible) return false;
  }
  return true;
}

/**
 * 建物の group から、棟ごとの面の形（group の座標）を切り出す。透明な物（文字の板など）と殻自身（userData.wingShell）は含めない。
 * InstancedMesh は 1 つずつ展開する。棟の印のある部品はその棟だけに、印の無い部品は塊の範囲で切って入れる
 * （棟の範囲は平面を分け尽くすので、どの面もちょうど 1 つの棟に入る）
 */
export function buildWingShells(
  root: THREE.Object3D,
  wings: readonly Pick<BuildingWing, 'id' | 'region'>[],
): Map<string, THREE.BufferGeometry> {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const planesByWing = wings.map((w) => ({ id: w.id, planes: regionHalfPlanes(w.region) }));
  const wingIds = new Set(wings.map((w) => w.id));
  const out = new Map<string, number[]>(wings.map((w) => [w.id, []]));
  const m = new THREE.Matrix4();
  const inst = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();

  const push = (target: number[] | undefined, poly: THREE.Vector3[]): void => {
    const first = poly[0];
    if (!target || !first) return;
    for (let i = 1; i + 1 < poly.length; i++) {
      const q1 = poly[i];
      const q2 = poly[i + 1];
      if (!q1 || !q2) continue;
      target.push(first.x, first.y, first.z, q1.x, q1.y, q1.z, q2.x, q2.y, q2.z);
    }
  };

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj.userData?.wingShell || !isVisibleWithin(obj, root)) return;
    const geometry = obj.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    if (!position) return;
    const index = geometry.index;
    const total = index ? index.count : position.count;
    const ranges: { start: number; count: number }[] = [];
    if (Array.isArray(obj.material)) {
      for (const g of geometry.groups) {
        if (isDrawnOpaque(obj.material[g.materialIndex ?? 0])) {
          ranges.push({ start: g.start, count: Math.min(g.count, total - g.start) });
        }
      }
    } else if (isDrawnOpaque(obj.material)) {
      ranges.push({ start: 0, count: total });
    }
    if (ranges.length === 0) return;

    const tag = wingTagOf(obj, root);
    const tagged = tag !== undefined && wingIds.has(tag) ? tag : undefined;
    const base = toRoot.clone().multiply(obj.matrixWorld);
    const instances = obj instanceof THREE.InstancedMesh ? obj.count : 1;
    for (let k = 0; k < instances; k++) {
      if (obj instanceof THREE.InstancedMesh) {
        obj.getMatrixAt(k, inst);
        m.multiplyMatrices(base, inst);
      } else {
        m.copy(base);
      }
      for (const r of ranges) {
        for (let i = r.start; i + 2 < r.start + r.count; i += 3) {
          a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(m);
          b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(m);
          c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(m);
          if (tagged) {
            push(out.get(tagged), [a, b, c]);
            continue;
          }
          normal.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
          for (const w of planesByWing) {
            const poly = clipTriangleToRegion([a.clone(), b.clone(), c.clone()], w.planes, normal);
            if (poly.length >= 3) push(out.get(w.id), poly);
          }
        }
      }
    }
  });

  const shells = new Map<string, THREE.BufferGeometry>();
  for (const [id, arr] of out) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    shells.set(id, geo);
  }
  return shells;
}

export interface BuildingPick {
  buildingId: string;
  /** 押した所の棟（棟の無い建物は null） */
  wingId: string | null;
}

export interface PickableBuilding {
  building: Pick<BuildingFeature, 'wings'>;
  group: THREE.Object3D;
  wingShells?: ReadonlyMap<string, THREE.BufferGeometry>;
}

const emptyPickGeometry = new THREE.BufferGeometry();
const pickMesh = new THREE.Mesh(emptyPickGeometry, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
pickMesh.matrixAutoUpdate = false;

/**
 * 当たり判定の結果から建物と棟を決める。棟の殻があれば同じ光線を殻に当て直し、建物に当たった所に
 * いちばん近い殻の棟にする。殻が無い（か当たらない）ときは、押した点の (x, z) が入る塊の範囲で決める
 */
export function resolveBuildingPick(
  hit: THREE.Intersection | undefined,
  raycaster: THREE.Raycaster,
  recordOf: (buildingId: string) => PickableBuilding | undefined,
): BuildingPick | null {
  const buildingId: unknown = hit?.object.userData?.buildingId;
  if (!hit || typeof buildingId !== 'string') return null;
  const rec = recordOf(buildingId);
  if (!rec || !rec.building.wings || rec.building.wings.length === 0) return { buildingId, wingId: null };

  if (rec.wingShells && rec.wingShells.size > 0) {
    rec.group.updateMatrixWorld(true);
    pickMesh.matrixWorld.copy(rec.group.matrixWorld);
    let best: { id: string; gap: number } | null = null;
    for (const [id, geometry] of rec.wingShells) {
      pickMesh.geometry = geometry;
      const shellHits = raycaster.intersectObject(pickMesh, false);
      const first = shellHits[0];
      if (!first) continue;
      const gap = Math.abs(first.distance - hit.distance);
      if (!best || gap < best.gap) best = { id, gap };
    }
    pickMesh.geometry = emptyPickGeometry;
    // 建物の面と殻はほぼ同じ所にある。0.5m より離れていれば、建物の別の所（殻に入らない透明な物の奥など）に当たっている
    if (best && best.gap < 0.5) return { buildingId, wingId: best.id };
  }
  const wing = findWingAt(rec.building, hit.point.x, hit.point.z);
  return { buildingId, wingId: wing?.id ?? null };
}

/**
 * 選んだ棟に重ねる薄い光の殻。下の色を 30% 薄めて、選んだ建物を光らせる色（accents.highlight）の暗めの光を足す
 * （結果 = 光 ＋ 下の色 × 0.7）。加算だけだと明るいタイルの壁が白く飛び、半透明で重ねるだけだと塗ったように暗くなるので、
 * 両方を混ぜて建物全体を選んだときの光らせ方（同じ色の emissive）に近い色味にする。
 * 下の面と同じ位置に描くので、少し手前に寄せて勝たせる
 */
export function createWingShellMaterial(clippingPlanes: THREE.Plane[] = []): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(SCENE_PALETTE.accents.highlight).multiplyScalar(0.2),
    transparent: true,
    opacity: 0.3,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    clippingPlanes,
  });
}

/**
 * 選んだ棟の光の殻を出し入れする（メッシュは 1 つで、形を差し替える）。殻は建物の group の子にするので、
 * 選んだ建物を浮かせると一緒に動く。当たり判定と影には入れない。形（buildWingShells の結果）は持ち主が片づける
 */
export class WingHighlighter {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly emptyGeometry = new THREE.BufferGeometry();

  constructor(clippingPlanes: THREE.Plane[] = []) {
    this.mesh = new THREE.Mesh(this.emptyGeometry, createWingShellMaterial(clippingPlanes));
    this.mesh.name = 'wing-shell';
    this.mesh.userData = { wingShell: true };
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 1;
    // 殻を押しても当たらない（下の建物に当てる）
    this.mesh.raycast = () => {};
  }

  /** 棟の殻を建物の group に重ねる。group か shell が無ければ消す */
  show(group: THREE.Object3D | null | undefined, shell: THREE.BufferGeometry | null | undefined): void {
    this.mesh.removeFromParent();
    if (!group || !shell) {
      this.mesh.geometry = this.emptyGeometry;
      return;
    }
    this.mesh.geometry = shell;
    group.add(this.mesh);
  }

  isShown(): boolean {
    return this.mesh.parent !== null;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry = this.emptyGeometry;
    this.emptyGeometry.dispose();
    this.mesh.material.dispose();
  }
}
