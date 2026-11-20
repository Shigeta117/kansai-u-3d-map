import * as THREE from 'three';

/**
 * 建物の辺にそろえたローカルの座標（u: 長手、v: 短手）で部品を組むための小道具。
 * KUシンフォニーホール・中央体育館の専用モデルで使う。
 *
 * - フレームは原点（輪郭の角）と u の向き（輪郭の辺の向き）で決める。v は u を +90°（+X → +Z の向き）回した向き
 * - local の group は「ローカルの x = u、z = v、y = ワールドの高さ」になるよう回してある。部品はこの中に置く
 * - TriBucket は材質ごとに三角形を積む入れ物。最後に 1 つのメッシュにする（部品を材質ごとに 1 回で描く）
 */
export interface LocalFrame {
  ox: number;
  oz: number;
  ux: number;
  uz: number;
  vx: number;
  vz: number;
}

export function makeFrame(ox: number, oz: number, dirX: number, dirZ: number): LocalFrame {
  const len = Math.hypot(dirX, dirZ) || 1;
  const ux = dirX / len;
  const uz = dirZ / len;
  return { ox, oz, ux, uz, vx: -uz, vz: ux };
}

export function frameToWorld(f: LocalFrame, u: number, v: number): [number, number] {
  return [f.ox + u * f.ux + v * f.vx, f.oz + u * f.uz + v * f.vz];
}

export function frameToLocal(f: LocalFrame, x: number, z: number): [number, number] {
  const dx = x - f.ox;
  const dz = z - f.oz;
  return [dx * f.ux + dz * f.uz, dx * f.vx + dz * f.vz];
}

/** ローカルの x を u、z を v に向けた group（原点はフレームの原点、高さはワールドのまま） */
export function createLocalGroup(f: LocalFrame): THREE.Group {
  const g = new THREE.Group();
  g.position.set(f.ox, 0, f.oz);
  // rotation.y = θ でローカルの +X は (cosθ, −sinθ)、+Z は (sinθ, cosθ) に向く。+X を u に合わせる
  g.rotation.y = Math.atan2(-f.uz, f.ux);
  return g;
}

type V3 = readonly [number, number, number];

/** 材質 1 つ分の三角形の入れ物（ローカル座標。x = u、y = 高さ、z = v） */
export class TriBucket {
  readonly pos: number[] = [];

  /** 三角形 1 枚。法線が hint の向きになる巻き順で積む */
  tri(a: V3, b: V3, c: V3, hint: V3): void {
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abz = b[2] - a[2];
    const acx = c[0] - a[0];
    const acy = c[1] - a[1];
    const acz = c[2] - a[2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const dot = nx * hint[0] + ny * hint[1] + nz * hint[2];
    const [p, q, r] = dot >= 0 ? [a, b, c] : [a, c, b];
    this.pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
  }

  /** 四角形 1 枚（a → b → c → d の順に外周をたどる点）。法線が hint の向きになる */
  quad(a: V3, b: V3, c: V3, d: V3, hint: V3): void {
    this.tri(a, b, c, hint);
    this.tri(a, c, d, hint);
  }

  get isEmpty(): boolean {
    return this.pos.length === 0;
  }

  toGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.computeVertexNormals();
    return geo;
  }
}

export interface BoxFaces {
  /** 側面（±u・±v の 4 面）の入れ物 */
  sides: TriBucket;
  /** 上面の入れ物（省くときは null） */
  top: TriBucket | null;
  /** 下面の入れ物（省くときは null。地面に埋まる物は省く） */
  bottom?: TriBucket | null;
  /** 側面のうち省く面（他の部品に接して見えない面） */
  skip?: readonly ('-u' | '+u' | '-v' | '+v')[];
}

/** u0〜u1・v0〜v1・y0〜y1 の箱を、面ごとの入れ物に積む */
export function pushBox(
  faces: BoxFaces,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  v0: number,
  v1: number,
): void {
  if (!(u1 > u0) || !(v1 > v0) || !(y1 > y0)) return;
  const skip = new Set(faces.skip ?? []);
  const { sides } = faces;
  if (!skip.has('-u')) sides.quad([u0, y0, v0], [u0, y0, v1], [u0, y1, v1], [u0, y1, v0], [-1, 0, 0]);
  if (!skip.has('+u')) sides.quad([u1, y0, v0], [u1, y0, v1], [u1, y1, v1], [u1, y1, v0], [1, 0, 0]);
  if (!skip.has('-v')) sides.quad([u0, y0, v0], [u1, y0, v0], [u1, y1, v0], [u0, y1, v0], [0, 0, -1]);
  if (!skip.has('+v')) sides.quad([u0, y0, v1], [u1, y0, v1], [u1, y1, v1], [u0, y1, v1], [0, 0, 1]);
  if (faces.top) faces.top.quad([u0, y1, v0], [u1, y1, v0], [u1, y1, v1], [u0, y1, v1], [0, 1, 0]);
  if (faces.bottom) faces.bottom.quad([u0, y0, v0], [u1, y0, v0], [u1, y0, v1], [u0, y0, v1], [0, -1, 0]);
}

/**
 * u の向きに伸びる壁の帯（厚さは v0〜v1）。上端の高さは点ごとに変えられる（階段に沿う手すり壁など）。
 * pts は [u, 上端の y, 下端の y] の並び（u の昇順）。両端は小口の面で閉じる
 */
export function pushWallStrip(
  bucket: TriBucket,
  pts: readonly (readonly [number, number, number])[],
  v0: number,
  v1: number,
  top: TriBucket = bucket,
): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b || !(b[0] > a[0])) continue;
    const [ua, ta, ba] = a;
    const [ub, tb, bb] = b;
    bucket.quad([ua, ba, v0], [ub, bb, v0], [ub, tb, v0], [ua, ta, v0], [0, 0, -1]);
    bucket.quad([ua, ba, v1], [ub, bb, v1], [ub, tb, v1], [ua, ta, v1], [0, 0, 1]);
    top.quad([ua, ta, v0], [ub, tb, v0], [ub, tb, v1], [ua, ta, v1], [0, 1, 0]);
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first) {
    bucket.quad([first[0], first[2], v0], [first[0], first[2], v1], [first[0], first[1], v1], [first[0], first[1], v0], [-1, 0, 0]);
  }
  if (last && last !== first) {
    bucket.quad([last[0], last[2], v0], [last[0], last[2], v1], [last[0], last[1], v1], [last[0], last[1], v0], [1, 0, 0]);
  }
}

/** 入れ物を 1 つのメッシュにして group に足す（空なら何もしない） */
export function addBucketMesh(
  group: THREE.Object3D,
  bucket: TriBucket,
  material: THREE.Material,
  name: string,
  castShadow: boolean,
): THREE.Mesh | null {
  if (bucket.isEmpty) return null;
  const mesh = new THREE.Mesh(bucket.toGeometry(), material);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
