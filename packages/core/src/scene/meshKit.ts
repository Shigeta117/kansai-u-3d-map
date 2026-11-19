import * as THREE from 'three';

/**
 * 頂点色つきの静的なメッシュを 1 つのジオメトリに積み上げる道具（描画命令を増やさないため）。
 * 面ごとに法線を付ける（角のはっきりした模型の見た目）。面の向きは、表から見て反時計回り。
 */
export class ColoredMeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly va = new THREE.Vector3();
  private readonly vb = new THREE.Vector3();
  private readonly vn = new THREE.Vector3();

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  addTri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color): void {
    this.va.subVectors(b, a);
    this.vb.subVectors(c, a);
    this.vn.crossVectors(this.va, this.vb);
    if (this.vn.lengthSq() < 1e-12) return;
    this.vn.normalize();
    for (const p of [a, b, c]) {
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(this.vn.x, this.vn.y, this.vn.z);
      this.colors.push(color.r, color.g, color.b);
    }
  }

  /** a→b→c→d が表から見て反時計回りの四角形 */
  addQuad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    color: THREE.Color,
  ): void {
    this.addTri(a, b, c, color);
    this.addTri(a, c, d, color);
  }

  /**
   * 向きのある箱。center を中心に、ローカル軸 ux（長さ方向）・uz（幅方向、水平）に沿って sx・sz、
   * 縦に yBottom〜yTop。ux と uz は水平で直交していること
   */
  addOrientedBox(
    cx: number,
    cz: number,
    ux: { x: number; z: number },
    sx: number,
    sz: number,
    yBottom: number,
    yTop: number,
    color: THREE.Color,
    options: { skipBottom?: boolean; skipTop?: boolean } = {},
  ): void {
    // ux を前、uz を ux の左（上から見て反時計回りに 90 度）とする
    const fx = ux.x;
    const fz = ux.z;
    const lx = fz;
    const lz = -fx;
    const hx = sx / 2;
    const hz = sz / 2;
    const corner = (u: number, v: number, y: number) =>
      new THREE.Vector3(cx + fx * u + lx * v, y, cz + fz * u + lz * v);
    const b0 = corner(-hx, -hz, yBottom);
    const b1 = corner(hx, -hz, yBottom);
    const b2 = corner(hx, hz, yBottom);
    const b3 = corner(-hx, hz, yBottom);
    const t0 = corner(-hx, -hz, yTop);
    const t1 = corner(hx, -hz, yTop);
    const t2 = corner(hx, hz, yTop);
    const t3 = corner(-hx, hz, yTop);
    this.addFacingQuad([t0, t1, t2, t3], new THREE.Vector3(0, 1, 0), color, options.skipTop);
    this.addFacingQuad([b0, b1, b2, b3], new THREE.Vector3(0, -1, 0), color, options.skipBottom);
    this.addFacingQuad([b0, b1, t1, t0], new THREE.Vector3(-lx, 0, -lz), color);
    this.addFacingQuad([b1, b2, t2, t1], new THREE.Vector3(fx, 0, fz), color);
    this.addFacingQuad([b2, b3, t3, t2], new THREE.Vector3(lx, 0, lz), color);
    this.addFacingQuad([b3, b0, t0, t3], new THREE.Vector3(-fx, 0, -fz), color);
  }

  /** 4 点を、法線が outward を向くように巻いて足す（点の順は周に沿っていればよい） */
  addFacingQuad(
    pts: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
    outward: THREE.Vector3,
    color: THREE.Color,
    skip = false,
  ): void {
    if (skip) return;
    const [a, b, c, d] = pts;
    this.va.subVectors(b, a);
    this.vb.subVectors(c, a);
    this.vn.crossVectors(this.va, this.vb);
    if (this.vn.dot(outward) >= 0) this.addQuad(a, b, c, d, color);
    else this.addQuad(a, d, c, b, color);
  }

  /** 3 点を、法線が outward を向くように巻いて足す */
  addFacingTri(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    outward: THREE.Vector3,
    color: THREE.Color,
  ): void {
    this.va.subVectors(b, a);
    this.vb.subVectors(c, a);
    this.vn.crossVectors(this.va, this.vb);
    if (this.vn.dot(outward) >= 0) this.addTri(a, b, c, color);
    else this.addTri(a, c, b, color);
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.computeBoundingSphere();
    return geo;
  }
}

/** 多角形の辺を maxLen ごとに分割する（高さを点ごとに変えるとき、面がたわまないように） */
export function densifyRing(ring: readonly [number, number][], maxLen: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(d / maxLen));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * 多角形の上面（高さは点ごとに yAt で決める）を三角形に分けて足す。上向きの面
 */
export function addPolygonTop(
  builder: ColoredMeshBuilder,
  ring: readonly [number, number][],
  yAt: (x: number, z: number) => number,
  color: THREE.Color,
  facing: 1 | -1 = 1,
): void {
  const pts2 = ring.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = THREE.ShapeUtils.triangulateShape(pts2, []);
  const up = new THREE.Vector3(0, facing, 0);
  for (const [ia, ib, ic] of tris) {
    const a = ring[ia ?? -1];
    const b = ring[ib ?? -1];
    const c = ring[ic ?? -1];
    if (!a || !b || !c) continue;
    builder.addFacingTri(
      new THREE.Vector3(a[0], yAt(a[0], a[1]), a[1]),
      new THREE.Vector3(b[0], yAt(b[0], b[1]), b[1]),
      new THREE.Vector3(c[0], yAt(c[0], c[1]), c[1]),
      up,
      color,
    );
  }
}

/**
 * 多角形の側面（上の高さ topAt、下の高さ bottomAt）を外向きに足す
 */
export function addPolygonWalls(
  builder: ColoredMeshBuilder,
  ring: readonly [number, number][],
  topAt: (x: number, z: number) => number,
  bottomAt: (x: number, z: number) => number,
  color: THREE.Color,
): void {
  // 周の向き（上から見て、+X 東・+Z 南）。符号付き面積で外向きの法線の側を決める
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sign = area >= 0 ? 1 : -1;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    // 面積が正の周（x-z 平面で反時計回り）では、辺の (ez, -ex) の側が外側
    const outward = new THREE.Vector3(ez * sign, 0, -ex * sign);
    builder.addFacingQuad(
      [
        new THREE.Vector3(a[0], bottomAt(a[0], a[1]), a[1]),
        new THREE.Vector3(b[0], bottomAt(b[0], b[1]), b[1]),
        new THREE.Vector3(b[0], topAt(b[0], b[1]), b[1]),
        new THREE.Vector3(a[0], topAt(a[0], a[1]), a[1]),
      ],
      outward,
      color,
    );
  }
}
