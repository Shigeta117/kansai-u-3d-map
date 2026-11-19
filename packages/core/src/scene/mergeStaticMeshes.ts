import * as THREE from 'three';

/**
 * 1 つの group（建物 1 棟）の中の動かない部品を、材質ごとに 1 つのメッシュにまとめて描画命令を減らす。
 *
 * - 同じ Material のインスタンス・同じ影の設定（castShadow / receiveShadow）・同じ属性の組の部品を 1 つにまとめる。
 *   各部品の行列は group を基準に焼き込むので、group 自体の移動（選択時に浮かせる等）はそのまま効く
 * - 複数の材質を持つメッシュ（geometry.groups）は材質ごとに切り分けてから振り分ける
 * - まとめない物: keep に渡した物とその子孫（回る物など）・InstancedMesh（すでに 1 回で描ける）・
 *   透明な材質（描く順が変わる）・ShaderMaterial・モーフ・drawRange を絞った物・非表示の物・
 *   position / normal / uv / color 以外の属性を持つ物
 * - 材質を共有する相手がいない部品は元のまま残す（描画命令が減らないので作り直さない）
 * - 材質は元のインスタンスをそのまま使う。選択の光らせ方・絞り込みの薄め方・色の切り替えは材質を書き換えるので、
 *   まとめた後も同じように効く
 */
export interface MergeStaticMeshesOptions {
  /** まとめずに残す物（回る物など）。この物とその子孫はまとめない */
  keep?: Iterable<THREE.Object3D>;
}

export interface MergeStaticMeshesResult {
  /** まとめて新しく作ったメッシュ（group の直下に置く） */
  merged: THREE.Mesh[];
  /** 取り除いた元のメッシュの数 */
  removedCount: number;
}

const ALLOWED_ATTRIBUTES = new Set(['position', 'normal', 'uv', 'uv1', 'uv2', 'uv3', 'color']);
const UV_ATTRIBUTES = new Set(['uv', 'uv1', 'uv2', 'uv3']);

interface Piece {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** index があれば index の範囲、無ければ頂点の範囲 */
  start: number;
  count: number;
  matrix: THREE.Matrix4;
  /** まとめた後に持たせる属性（名前と要素数） */
  attributes: readonly { name: string; itemSize: number }[];
}

function usesTextures(material: THREE.Material): boolean {
  for (const value of Object.values(material) as unknown[]) {
    if (value instanceof THREE.Texture) return true;
  }
  return false;
}

function isMergeableMaterial(material: THREE.Material | undefined): material is THREE.Material {
  if (!material) return false;
  if (material.transparent) return false;
  if ((material as THREE.ShaderMaterial).isShaderMaterial) return false;
  const transmission = (material as { transmission?: number }).transmission;
  if (typeof transmission === 'number' && transmission > 0) return false;
  return true;
}

/** 部品として持たせる属性の組。まとめられない属性があれば null */
function attributeSignature(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): { name: string; itemSize: number }[] | null {
  const needUv = usesTextures(material);
  const needColor = (material as THREE.MeshStandardMaterial).vertexColors === true;
  const out: { name: string; itemSize: number }[] = [];
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    if (!ALLOWED_ATTRIBUTES.has(name)) return null;
    if (UV_ATTRIBUTES.has(name) && !needUv) continue;
    if (name === 'color' && !needColor) continue;
    out.push({ name, itemSize: attr.itemSize });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function isVisibleWithin(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur && cur !== root) {
    if (!cur.visible) return false;
    cur = cur.parent;
  }
  return true;
}

function collectPieces(mesh: THREE.Mesh, matrix: THREE.Matrix4): Piece[] | null {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const position = geometry.getAttribute('position');
  if (!position || position.itemSize !== 3) return null;
  if (Object.keys(geometry.morphAttributes).length > 0) return null;
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return null;
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return null;

  const total = geometry.index ? geometry.index.count : position.count;
  const ranges: { material: THREE.Material | undefined; start: number; count: number }[] = [];
  if (Array.isArray(mesh.material)) {
    // 材質の配列なのに groups が無いと three は何も描かない。そのまま残す
    if (geometry.groups.length === 0) return null;
    for (const g of geometry.groups) {
      const start = g.start;
      const count = Math.min(g.count, total - start);
      ranges.push({ material: mesh.material[g.materialIndex ?? 0], start, count });
    }
  } else {
    ranges.push({ material: mesh.material, start: 0, count: total });
  }

  const pieces: Piece[] = [];
  for (const r of ranges) {
    if (!isMergeableMaterial(r.material)) return null;
    if (r.count <= 0) continue;
    const attributes = attributeSignature(geometry, r.material);
    if (!attributes) return null;
    pieces.push({ mesh, geometry, material: r.material, start: r.start, count: r.count, matrix, attributes });
  }
  return pieces;
}

function pieceKey(p: Piece): string {
  const m = p.mesh;
  const attrs = p.attributes.map((a) => `${a.name}:${a.itemSize}`).join(',');
  return [
    p.material.uuid,
    m.castShadow ? 1 : 0,
    m.receiveShadow ? 1 : 0,
    m.layers.mask,
    m.renderOrder,
    attrs,
  ].join('|');
}

function mergePieces(pieces: Piece[]): THREE.BufferGeometry {
  const first = pieces[0];
  if (!first) return new THREE.BufferGeometry();
  const attrDefs = first.attributes;

  // 頂点の数を先に数える（index があれば使っている頂点だけを詰めて持つ）
  const remaps: (Int32Array | null)[] = [];
  let vertexTotal = 0;
  let indexTotal = 0;
  for (const p of pieces) {
    indexTotal += p.count;
    const index = p.geometry.index;
    if (index) {
      const remap = new Int32Array(p.geometry.getAttribute('position').count).fill(-1);
      let used = 0;
      for (let i = p.start; i < p.start + p.count; i++) {
        const v = index.getX(i);
        if (remap[v] === -1) {
          remap[v] = used;
          used += 1;
        }
      }
      remaps.push(remap);
      vertexTotal += used;
    } else {
      remaps.push(null);
      vertexTotal += p.count;
    }
  }

  const outArrays = attrDefs.map((a) => new Float32Array(vertexTotal * a.itemSize));
  const indices = vertexTotal > 65535 ? new Uint32Array(indexTotal) : new Uint16Array(indexTotal);
  const v3 = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  let vertexOffset = 0;
  let indexOffset = 0;
  pieces.forEach((p, pi) => {
    const remap = remaps[pi] ?? null;
    normalMatrix.getNormalMatrix(p.matrix);
    const flip = p.matrix.determinant() < 0;

    // 頂点: 元の頂点番号 → まとめた後の番号の順に書く
    const writeVertex = (src: number, dst: number): void => {
      attrDefs.forEach((def, ai) => {
        const attr = p.geometry.getAttribute(def.name);
        const out = outArrays[ai];
        if (!out) return;
        const o = dst * def.itemSize;
        if (def.name === 'position') {
          v3.fromBufferAttribute(attr, src).applyMatrix4(p.matrix);
          out[o] = v3.x;
          out[o + 1] = v3.y;
          out[o + 2] = v3.z;
        } else if (def.name === 'normal') {
          v3.fromBufferAttribute(attr, src).applyMatrix3(normalMatrix).normalize();
          out[o] = v3.x;
          out[o + 1] = v3.y;
          out[o + 2] = v3.z;
        } else {
          for (let k = 0; k < def.itemSize; k++) out[o + k] = attr.getComponent(src, k);
        }
      });
    };

    const index = p.geometry.index;
    let used = 0;
    if (index && remap) {
      for (let v = 0; v < remap.length; v++) {
        const dst = remap[v] ?? -1;
        if (dst >= 0) {
          writeVertex(v, vertexOffset + dst);
          used += 1;
        }
      }
      for (let i = 0; i < p.count; i += 3) {
        const a = vertexOffset + (remap[index.getX(p.start + i)] ?? 0);
        const b = vertexOffset + (remap[index.getX(p.start + i + 1)] ?? 0);
        const c = vertexOffset + (remap[index.getX(p.start + i + 2)] ?? 0);
        indices[indexOffset + i] = a;
        // 鏡に映した行列（行列式が負）では、表と裏が入れ替わらないように三角形の向きを戻す
        indices[indexOffset + i + 1] = flip ? c : b;
        indices[indexOffset + i + 2] = flip ? b : c;
      }
    } else {
      for (let i = 0; i < p.count; i++) writeVertex(p.start + i, vertexOffset + i);
      used = p.count;
      for (let i = 0; i < p.count; i += 3) {
        indices[indexOffset + i] = vertexOffset + i;
        indices[indexOffset + i + 1] = vertexOffset + (flip ? i + 2 : i + 1);
        indices[indexOffset + i + 2] = vertexOffset + (flip ? i + 1 : i + 2);
      }
    }
    vertexOffset += used;
    indexOffset += p.count;
  });

  const merged = new THREE.BufferGeometry();
  attrDefs.forEach((def, ai) => {
    const arr = outArrays[ai];
    if (arr) merged.setAttribute(def.name, new THREE.BufferAttribute(arr, def.itemSize));
  });
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** 取り除くメッシュに子があれば、同じ位置の空の Group に子を移して差し替える */
function detachMesh(mesh: THREE.Mesh): void {
  const parent = mesh.parent;
  if (!parent) return;
  if (mesh.children.length === 0) {
    parent.remove(mesh);
    return;
  }
  const holder = new THREE.Group();
  holder.name = mesh.name;
  holder.position.copy(mesh.position);
  holder.quaternion.copy(mesh.quaternion);
  holder.scale.copy(mesh.scale);
  holder.matrixAutoUpdate = mesh.matrixAutoUpdate;
  holder.matrix.copy(mesh.matrix);
  holder.visible = mesh.visible;
  holder.userData = { ...mesh.userData };
  for (const child of [...mesh.children]) holder.add(child);
  const at = parent.children.indexOf(mesh);
  parent.children[at] = holder;
  holder.parent = parent;
  mesh.parent = null;
}

/** 部品を取り除いて空になった入れ物（Group / Object3D）を片づける */
function pruneEmptyContainers(obj: THREE.Object3D, root: THREE.Object3D, keep: Set<THREE.Object3D>): void {
  for (const child of [...obj.children]) pruneEmptyContainers(child, root, keep);
  if (obj === root || keep.has(obj)) return;
  if ((obj.type === 'Group' || obj.type === 'Object3D') && obj.children.length === 0) {
    obj.parent?.remove(obj);
  }
}

export function mergeStaticMeshes(
  root: THREE.Object3D,
  options: MergeStaticMeshesOptions = {},
): MergeStaticMeshesResult {
  const keep = new Set<THREE.Object3D>(options.keep ?? []);
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();

  const buckets = new Map<string, Piece[]>();
  const piecesByMesh = new Map<THREE.Mesh, Piece[]>();

  const visit = (obj: THREE.Object3D): void => {
    if (keep.has(obj)) return;
    if (
      obj instanceof THREE.Mesh &&
      !(obj instanceof THREE.InstancedMesh) &&
      !(obj instanceof THREE.SkinnedMesh) &&
      !(obj as THREE.Mesh & { isBatchedMesh?: boolean }).isBatchedMesh &&
      !obj.morphTargetInfluences &&
      isVisibleWithin(obj, root)
    ) {
      const matrix = rootInverse.clone().multiply(obj.matrixWorld);
      const pieces = collectPieces(obj, matrix);
      if (pieces && pieces.length > 0) {
        piecesByMesh.set(obj, pieces);
        for (const p of pieces) {
          const key = pieceKey(p);
          const list = buckets.get(key);
          if (list) list.push(p);
          else buckets.set(key, [p]);
        }
      }
    }
    for (const child of obj.children) visit(child);
  };
  visit(root);

  // 2 つ以上の部品が集まった組があるメッシュだけを作り直す
  const replaced = new Set<THREE.Mesh>();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    for (const p of list) replaced.add(p.mesh);
  }
  if (replaced.size === 0) return { merged: [], removedCount: 0 };

  const merged: THREE.Mesh[] = [];
  for (const list of buckets.values()) {
    const first = list[0];
    if (!first || !replaced.has(first.mesh)) continue;
    const geometry = mergePieces(list);
    const mesh = new THREE.Mesh(geometry, first.material);
    mesh.name = `${root.name || 'group'}:merged-${merged.length}`;
    mesh.castShadow = first.mesh.castShadow;
    mesh.receiveShadow = first.mesh.receiveShadow;
    mesh.layers.mask = first.mesh.layers.mask;
    mesh.renderOrder = first.mesh.renderOrder;
    mesh.frustumCulled = list.every((p) => p.mesh.frustumCulled);
    mesh.userData = { mergedFrom: new Set(list.map((p) => p.mesh)).size };
    merged.push(mesh);
  }

  for (const mesh of replaced) detachMesh(mesh);
  pruneEmptyContainers(root, root, keep);
  for (const mesh of merged) root.add(mesh);

  return { merged, removedCount: replaced.size };
}
