import * as THREE from 'three';
import { collectMeshPieces, detachMesh, isVisibleWithin, mergeMeshPieces, type MeshPiece } from './mergeStaticMeshes';

/**
 * 建物をまたいで、動かない部品を 1 つのメッシュにまとめる（描画命令を減らす。docs/quality-plan.md 4 節）。
 *
 * - 材質の色・明るさ（emissive）・粗さ・金属感は部品ごとに違ってよい。材質（と建物）ごとに番号（slot）を振り、
 *   頂点に番号の属性（kumSlot）を持たせ、値はデータテクスチャから shader で引く（onBeforeCompile）。
 *   それ以外の設定（テクスチャ・両面・flatShading・影の設定など）が同じ部品どうしを 1 つのメッシュにまとめる
 * - 元の材質が値の正本。選択の光らせ方・カテゴリの薄め方・屋根の色の切り替えは今までどおり元の材質を書き換え、
 *   sync() でテクスチャへ写す（描く前に毎回呼ぶ。変わっていなければ写さない）
 * - 当たり判定は元のメッシュで行う（pickable のとき、元のメッシュを見えないまま残す。three の当たり判定は
 *   visible を見ない）。棟の殻・回る物・透明な物は元の group に残って描かれる
 * - movable（選んだ建物を浮かせる group）が組んだ時の位置から動いている間は、その建物の分をまとめたメッシュから
 *   消し（shader で三角形を潰す。影の地図も同じ）、見えないまま残した元のメッシュを描く。動かした建物は前と
 *   同じ描き方になる（描画命令はその建物の分だけ増える）
 * - まとめない物: keep とその子孫・透明な材質・MeshStandardMaterial 以外・onBeforeCompile を持つ材質・
 *   instanceColor のある InstancedMesh・大きすぎる InstancedMesh・mergeStaticMeshes がまとめない物（モーフ・drawRange など）
 */

export interface StaticBatchSource {
  /** まとめる物の根（建物の group など） */
  root: THREE.Object3D;
  /** まとめずに残す物（回る物など）。この物とその子孫はまとめない */
  keep?: Iterable<THREE.Object3D>;
  /**
   * true: 元のメッシュを見えないまま残す（当たり判定・棟の殻・動かした間の描画に使う）。
   * false: 元のメッシュを取り除く（当たり判定が要らず、動かない物）
   */
  pickable: boolean;
  /**
   * 動かす group（選んだ建物を浮かせるなど。pickable のときだけ）。組んだ時の位置から動いている間は、
   * この根の部品を元のメッシュで描く
   */
  movable?: THREE.Object3D;
}

export interface StaticBatches {
  /** まとめたメッシュを入れた group（シーンの直下に置く。座標はワールド） */
  group: THREE.Group;
  meshes: THREE.Mesh[];
  /** 材質の番号の数 */
  slotCount: number;
  /** まとめた元のメッシュの数 */
  sourceMeshCount: number;
  /** 元の材質の値と、動かした group の切り替えを反映する（描く前に呼ぶ）。テクスチャが変われば true */
  sync(): boolean;
  /** 番号の値（テクスチャの中身。テスト用）。[r, g, b, 粗さ, 明るさ r, g, b, 金属感, 描くか(1/0)] */
  slotValues(slot: number): number[];
  /** 元の材質に振った番号（テスト用。建物ごとに別の番号になる） */
  slotsOf(material: THREE.Material): number[];
  dispose(): void;
}

export const SLOT_ATTRIBUTE = 'kumSlot';
/** 1 つの番号に使うテクセルの数（色と粗さ・明るさと金属感・描くか） */
const TEXELS_PER_SLOT = 3;
const TEXTURE_WIDTH = 1024;
/** InstancedMesh を展開してまとめる上限（1 つの InstancedMesh の頂点の数の合計） */
const MAX_BAKED_INSTANCE_VERTICES = 60_000;
/** 動いたとみなす位置の差（m） */
const MOVED_EPS_M = 1e-6;

interface MovableState {
  object: THREE.Object3D;
  base: THREE.Vector3;
  /** まとめた元のメッシュ（動いている間だけ見せる） */
  originals: THREE.Mesh[];
  moved: boolean;
}

interface Slot {
  material: THREE.MeshStandardMaterial;
  movable: MovableState | null;
}

const defaultOnBeforeCompile = THREE.Material.prototype.onBeforeCompile;
const defaultCustomProgramCacheKey = THREE.Material.prototype.customProgramCacheKey;

/** 番号で引く値（色・明るさ・粗さ・金属感）と、描き方に関わらない値 */
const SLOT_PROPERTIES = new Set([
  'uuid',
  'id',
  'name',
  'version',
  'userData',
  'color',
  'emissive',
  'emissiveIntensity',
  'roughness',
  'metalness',
  '_listeners',
]);

function valueKey(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return String(value);
  if (value instanceof THREE.Texture) return `tex:${value.uuid}`;
  if (value instanceof THREE.Color) return `c:${value.r},${value.g},${value.b}`;
  if (value instanceof THREE.Vector2) return `v2:${value.x},${value.y}`;
  if (value instanceof THREE.Euler) return `e:${value.x},${value.y},${value.z},${value.order}`;
  if (value instanceof THREE.Plane) return `p:${value.normal.x},${value.normal.y},${value.normal.z},${value.constant}`;
  if (Array.isArray(value)) return `[${value.map(valueKey).join(';')}]`;
  if (typeof value === 'function') return 'fn';
  try {
    return JSON.stringify(value);
  } catch {
    return 'obj';
  }
}

/** 材質の描き方の鍵。番号で引く値（色・明るさ・粗さ・金属感）以外がすべて同じなら同じ鍵になる */
export function shadingKey(material: THREE.MeshStandardMaterial): string {
  const parts: string[] = [material.type];
  for (const [k, v] of Object.entries(material).sort(([a], [b]) => a.localeCompare(b))) {
    if (SLOT_PROPERTIES.has(k)) continue;
    parts.push(`${k}=${valueKey(v)}`);
  }
  return parts.join('|');
}

function isBatchableMaterial(material: THREE.Material): material is THREE.MeshStandardMaterial {
  return (
    material.type === 'MeshStandardMaterial' &&
    material.visible &&
    !material.transparent &&
    material.onBeforeCompile === defaultOnBeforeCompile &&
    material.customProgramCacheKey === defaultCustomProgramCacheKey
  );
}

const VERTEX_PARS = /* glsl */ `
attribute float ${SLOT_ATTRIBUTE};
uniform highp sampler2D kumSlotTex;
vec4 kumSlotTexel(int i) {
  return texelFetch(kumSlotTex, ivec2(i % ${TEXTURE_WIDTH}, i / ${TEXTURE_WIDTH}), 0);
}
`;

// 描かない番号（動かした建物の分）は、頂点を 1 点に集めて三角形を潰す
const VERTEX_HIDE = /* glsl */ `
int kumBase = int(${SLOT_ATTRIBUTE} + 0.5) * ${TEXELS_PER_SLOT};
if (kumSlotTexel(kumBase + 2).x < 0.5) transformed = vec3(0.0);
`;

/** from がちょうど 1 回だけ出てくることを確かめて置き換える（three を上げて shader の文が変わったら止める） */
function replaceOnce(source: string, from: string, to: string): string {
  const at = source.indexOf(from);
  if (at < 0 || source.indexOf(from, at + from.length) >= 0) {
    throw new Error(`staticBatches: shader の「${from}」が 1 回だけ見つからない（three の版を確かめる）`);
  }
  return source.slice(0, at) + to + source.slice(at + from.length);
}

export function patchStandardShader(
  shader: Pick<THREE.WebGLProgramParametersWithUniforms, 'uniforms' | 'vertexShader' | 'fragmentShader'>,
  texture: THREE.DataTexture,
): void {
  shader.uniforms.kumSlotTex = { value: texture };
  let vs = shader.vertexShader;
  vs = replaceOnce(
    vs,
    '#include <common>',
    `#include <common>\n${VERTEX_PARS}\nflat varying vec4 vKumSlotA;\nflat varying vec4 vKumSlotB;`,
  );
  vs = replaceOnce(
    vs,
    '#include <begin_vertex>',
    `#include <begin_vertex>\n${VERTEX_HIDE}\nvKumSlotA = kumSlotTexel(kumBase);\nvKumSlotB = kumSlotTexel(kumBase + 1);`,
  );
  let fs = shader.fragmentShader;
  fs = replaceOnce(fs, '#include <common>', '#include <common>\nflat varying vec4 vKumSlotA;\nflat varying vec4 vKumSlotB;');
  fs = replaceOnce(fs, 'vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vKumSlotA.rgb, opacity );');
  fs = replaceOnce(fs, 'vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = vKumSlotB.rgb;');
  fs = replaceOnce(
    fs,
    '#include <roughnessmap_fragment>',
    replaceOnce(THREE.ShaderChunk.roughnessmap_fragment, '= roughness;', '= vKumSlotA.a;'),
  );
  fs = replaceOnce(
    fs,
    '#include <metalnessmap_fragment>',
    replaceOnce(THREE.ShaderChunk.metalnessmap_fragment, '= metalness;', '= vKumSlotB.a;'),
  );
  shader.vertexShader = vs;
  shader.fragmentShader = fs;
}

export function patchDepthShader(
  shader: Pick<THREE.WebGLProgramParametersWithUniforms, 'uniforms' | 'vertexShader' | 'fragmentShader'>,
  texture: THREE.DataTexture,
): void {
  shader.uniforms.kumSlotTex = { value: texture };
  let vs = shader.vertexShader;
  vs = replaceOnce(vs, '#include <common>', `#include <common>\n${VERTEX_PARS}`);
  vs = replaceOnce(vs, '#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_HIDE}`);
  shader.vertexShader = vs;
}

interface BatchPiece extends MeshPiece {
  slot: number;
}

export function buildStaticBatches(sources: readonly StaticBatchSource[], name = 'static-batches'): StaticBatches {
  const group = new THREE.Group();
  group.name = name;

  const slots: Slot[] = [];
  const slotIndex = new Map<string, number>();
  const buckets = new Map<string, BatchPiece[]>();
  const replaced: { mesh: THREE.Mesh; pickable: boolean }[] = [];
  const movables: MovableState[] = [];

  const slotOf = (material: THREE.MeshStandardMaterial, movable: MovableState | null, sourceIndex: number): number => {
    const key = `${material.uuid}|${movable ? sourceIndex : -1}`;
    const found = slotIndex.get(key);
    if (found !== undefined) return found;
    slots.push({ material, movable });
    slotIndex.set(key, slots.length - 1);
    return slots.length - 1;
  };

  const instanceMatrix = new THREE.Matrix4();
  sources.forEach((source, sourceIndex) => {
    source.root.updateWorldMatrix(true, true);
    const keep = new Set<THREE.Object3D>(source.keep ?? []);
    let movable: MovableState | null = null;
    if (source.movable && source.pickable) {
      movable = {
        object: source.movable,
        base: new THREE.Vector3().setFromMatrixPosition(source.movable.matrixWorld),
        originals: [],
        moved: false,
      };
      movables.push(movable);
    }
    const meshes: THREE.Mesh[] = [];
    const visit = (obj: THREE.Object3D): void => {
      if (keep.has(obj)) return;
      if (
        obj instanceof THREE.Mesh &&
        !(obj instanceof THREE.SkinnedMesh) &&
        !(obj as THREE.Mesh & { isBatchedMesh?: boolean }).isBatchedMesh &&
        !obj.userData?.wingShell &&
        obj.visible &&
        isVisibleWithin(obj, source.root)
      ) {
        meshes.push(obj);
      }
      for (const child of obj.children) visit(child);
    };
    visit(source.root);

    for (const mesh of meshes) {
      const pieces = collectMeshPieces(mesh, mesh.matrixWorld.clone());
      if (!pieces || pieces.length === 0) continue;
      if (!pieces.every((p) => isBatchableMaterial(p.material))) continue;
      let instances: THREE.Matrix4[] | null = null;
      if (mesh instanceof THREE.InstancedMesh) {
        if (mesh.instanceColor || mesh.count === 0) continue;
        const vertices = mesh.geometry.getAttribute('position').count * mesh.count;
        if (vertices > MAX_BAKED_INSTANCE_VERTICES) continue;
        instances = [];
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, instanceMatrix);
          instances.push(mesh.matrixWorld.clone().multiply(instanceMatrix));
        }
      }
      for (const p of pieces) {
        const material = p.material as THREE.MeshStandardMaterial;
        const slot = slotOf(material, movable, sourceIndex);
        const attrs = p.attributes.map((a) => `${a.name}:${a.itemSize}`).join(',');
        const key = [
          shadingKey(material),
          mesh.castShadow ? 1 : 0,
          mesh.receiveShadow ? 1 : 0,
          mesh.layers.mask,
          mesh.renderOrder,
          attrs,
        ].join('#');
        const list = buckets.get(key) ?? [];
        buckets.set(key, list);
        for (const matrix of instances ?? [p.matrix]) list.push({ ...p, matrix, slot });
      }
      replaced.push({ mesh, pickable: source.pickable });
      movable?.originals.push(mesh);
    }
  });

  const texelCount = Math.max(1, slots.length * TEXELS_PER_SLOT);
  const height = Math.ceil(texelCount / TEXTURE_WIDTH);
  const data = new Float32Array(TEXTURE_WIDTH * height * 4);
  const texture = new THREE.DataTexture(data, TEXTURE_WIDTH, height, THREE.RGBAFormat, THREE.FloatType);
  texture.name = `${name}:slots`;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const position = new THREE.Vector3();
  const sync = (): boolean => {
    for (const m of movables) {
      m.object.updateWorldMatrix(true, false);
      position.setFromMatrixPosition(m.object.matrixWorld);
      const moved = position.distanceToSquared(m.base) > MOVED_EPS_M * MOVED_EPS_M;
      if (moved === m.moved) continue;
      m.moved = moved;
      for (const mesh of m.originals) mesh.visible = moved;
    }
    let changed = false;
    // three が uniform に渡すのと同じ値（float32）にしてから比べる
    const write = (i: number, v: number): void => {
      const f = Math.fround(v);
      if (data[i] !== f) {
        data[i] = f;
        changed = true;
      }
    };
    slots.forEach((s, i) => {
      const o = i * TEXELS_PER_SLOT * 4;
      const m = s.material;
      write(o, m.color.r);
      write(o + 1, m.color.g);
      write(o + 2, m.color.b);
      write(o + 3, m.roughness);
      write(o + 4, m.emissive.r * m.emissiveIntensity);
      write(o + 5, m.emissive.g * m.emissiveIntensity);
      write(o + 6, m.emissive.b * m.emissiveIntensity);
      write(o + 7, m.metalness);
      write(o + 8, s.movable?.moved ? 0 : 1);
    });
    if (changed) texture.needsUpdate = true;
    return changed;
  };

  // three は不透明な物を材質の id の順に描く（同じ深さの面は後に描いた方が勝つ）。まとめた後も描く順が
  // 元に近くなるよう、部品は元の材質の id の順に並べ、まとめたメッシュも元の材質の id の小さい順に作る
  const ordered = [...buckets.values()]
    .map((list) => list.slice().sort((a, b) => a.material.id - b.material.id || a.mesh.id - b.mesh.id))
    .sort((a, b) => (a[0]?.material.id ?? 0) - (b[0]?.material.id ?? 0));

  const meshes: THREE.Mesh[] = [];
  for (const list of ordered) {
    const first = list[0];
    if (!first) continue;
    const geometry = mergeMeshPieces(list, { name: SLOT_ATTRIBUTE, values: list.map((p) => p.slot) });
    const material = (first.material as THREE.MeshStandardMaterial).clone();
    material.name = `${name}:material`;
    material.onBeforeCompile = (shader) => patchStandardShader(shader, texture);
    material.customProgramCacheKey = () => 'kum-static-batch-1';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (shader) => patchDepthShader(shader, texture);
    depth.customProgramCacheKey = () => 'kum-static-batch-depth-1';

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}:${meshes.length}`;
    mesh.castShadow = first.mesh.castShadow;
    mesh.receiveShadow = first.mesh.receiveShadow;
    mesh.layers.mask = first.mesh.layers.mask;
    mesh.renderOrder = first.mesh.renderOrder;
    mesh.frustumCulled = list.every((p) => p.mesh.frustumCulled);
    mesh.customDepthMaterial = depth;
    mesh.userData = { staticBatch: true, mergedFrom: new Set(list.map((p) => p.mesh)).size };
    // 当たり判定は元のメッシュで行う
    mesh.raycast = () => {};
    group.add(mesh);
    meshes.push(mesh);
  }

  // 元のメッシュを隠す（当たり判定・動かした間の描画に使う物）か取り除く。子（回る物・透明な物など）があれば、
  // 子は同じ位置の空の group に移して描き続ける
  for (const { mesh, pickable } of replaced) {
    const parent = mesh.parent;
    if (mesh.children.length > 0) {
      detachMesh(mesh);
      if (pickable && parent) parent.add(mesh);
    } else if (!pickable) {
      mesh.removeFromParent();
    }
    if (pickable) mesh.visible = false;
  }
  sync();

  return {
    group,
    meshes,
    slotCount: slots.length,
    sourceMeshCount: replaced.length,
    sync,
    slotValues: (slot) => {
      const o = slot * TEXELS_PER_SLOT * 4;
      return Array.from(data.subarray(o, o + 9));
    },
    slotsOf: (material) => slots.flatMap((s, i) => (s.material === material ? [i] : [])),
    dispose: () => {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.customDepthMaterial?.dispose();
      }
      texture.dispose();
    },
  };
}
