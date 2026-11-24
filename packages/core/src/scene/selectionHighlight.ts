import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { SCENE_PALETTE } from './palette';

/**
 * 選んだ建物（か建物の中の棟）の見た目。
 *
 * - 光らせる範囲は形から決める: 建物を組んだ直後（部品をまとめる前）に、建物の group の全部の見えるメッシュから
 *   面の形（殻）を切り出して取っておく（BuildingBuilder の selectionShell。棟は wingSelection.ts の棟の殻）。
 *   材質の一覧から決めないので、部品の多い主役の建物でもまだらにならない
 * - 殻の上に、輪郭と薄い塗りを重ねる（SelectionHighlighter）。輪郭は、殻を画面の上で外へ太らせた形を裏面で描き、
 *   殻が描かれた所（ステンシル）を抜いて、外周にだけ線を残す。中の部品（屋上の機械室・フィン）の線は出ない
 * - 既定は、輪郭（琥珀）＋薄い塗り＋持ち上げ（持ち主が 2026-11-24 に 6 案を見比べて選んだ）
 * - 描画命令: 塗り（か塗りを描かないステンシルだけの描画）+1、輪郭 +1。持ち上げると、その建物をまとめたメッシュから
 *   外して元のメッシュで描くので、建物の部品の分も増える（第3学舎・総合図書館で合わせて +15）。持ち上げなければ +2
 * - 見た目の要素は URL の sel= で入れ替えて比べられる（parseSelectionLook。URL を付けたときだけ効く）
 */

/** 輪郭の描き方。hull＝殻を太らせた外周の線、edges＝角の線（LineSegments2）、none＝描かない */
export type SelectionOutline = 'hull' | 'edges' | 'none';

export interface SelectionLook {
  outline: SelectionOutline;
  /** 輪郭の色（palette の selection.outlineAmber / outlineInk） */
  outlineColor: 'amber' | 'ink';
  /** 殻に薄い塗りを重ねる */
  fill: boolean;
  /** 選んだ建物を 1.4m 持ち上げる（持ち上げている間は、その建物をまとめたメッシュから外して描く） */
  lift: boolean;
  /** 選んでいない建物を、台の色に寄せて薄くする */
  dimOthers: boolean;
}

/**
 * 既定: 輪郭（琥珀）＋薄い塗り＋持ち上げ。持ち主が 2026-11-24 に選んだ（「持ち上げ気持ちよかった」）。
 * 選ばなかった案: 輪郭を墨にする・持ち上げない・選んでいない建物を薄くする（sel= で今も比べられる）
 */
export const DEFAULT_SELECTION_LOOK: Readonly<SelectionLook> = {
  outline: 'hull',
  outlineColor: 'amber',
  fill: true,
  lift: true,
  dimOthers: false,
};

/** 持ち上げる高さ（m） */
export const SELECTION_LIFT_M = 1.4;

/**
 * URL の sel= を読む（比べるための仕組み）。カンマ区切りで、書いた要素だけを入れる:
 * outline（殻を太らせた輪郭）・edges（角の線の輪郭）・fill・lift・dim・ink（輪郭を墨に。無ければ琥珀）。
 * 例: sel=outline,fill,lift。指定が無い（null）か空なら既定
 */
export function parseSelectionLook(param: string | null | undefined): SelectionLook {
  if (param === null || param === undefined || param.trim() === '') return { ...DEFAULT_SELECTION_LOOK };
  const tokens = new Set(
    param
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
  return {
    outline: tokens.has('outline') ? 'hull' : tokens.has('edges') ? 'edges' : 'none',
    outlineColor: tokens.has('ink') ? 'ink' : 'amber',
    fill: tokens.has('fill'),
    lift: tokens.has('lift'),
    dimOthers: tokens.has('dim'),
  };
}

/** 輪郭の太さ（CSS px） */
const OUTLINE_WIDTH_PX = 3;
/** 角の線の太さ（CSS px）と、角とみなす面の折れの角度 */
const EDGE_WIDTH_PX = 2;
const EDGE_THRESHOLD_DEG = 40;
/**
 * 塗りの強さ。塗りは下の色に掛けて明るくする（結果 = 下の色 ×（1 ＋ 塗りの色 × FILL_GAIN））。色を混ぜると
 * 赤茶のレンガが桃色に、クリームの壁が黄土色に寄るので、色相を変えずに明るさだけを上げる
 */
const FILL_GAIN = 0.16;
const STENCIL_REF = 1;
/** 頂点を同じ点とみなす格子（m） */
const WELD_GRID_M = 1e-3;

/**
 * 殻（三角形の羅列）から、輪郭用の形を作る。同じ位置の頂点をつなぎ、頂点の法線を「その頂点に接する面の向き
 * （同じ向きは 1 回だけ数える）の和」にする。面の大きさで重みを付けないので、広い屋根と細い壁の角でも外へ斜めに向く。
 * 頂点を共有するので、太らせても角で割れない
 */
export function buildOutlineHullGeometry(shell: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = shell.getAttribute('position');
  const keyToIndex = new Map<string, number>();
  const positions: number[] = [];
  const normalLists: THREE.Vector3[][] = [];
  const indices: number[] = [];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const vertexOf = (p: THREE.Vector3): number => {
    const key = `${Math.round(p.x / WELD_GRID_M)},${Math.round(p.y / WELD_GRID_M)},${Math.round(p.z / WELD_GRID_M)}`;
    const found = keyToIndex.get(key);
    if (found !== undefined) return found;
    const i = positions.length / 3;
    positions.push(p.x, p.y, p.z);
    normalLists.push([]);
    keyToIndex.set(key, i);
    return i;
  };
  const triCount = Math.floor((shell.index ? shell.index.count : pos.count) / 3);
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const vi = shell.index ? shell.index.getX(t * 3 + k) : t * 3 + k;
      v[k]?.fromBufferAttribute(pos, vi);
    }
    const [a, b, c] = v as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    const ia = vertexOf(a);
    const ib = vertexOf(b);
    const ic = vertexOf(c);
    if (ia === ib || ib === ic || ia === ic) continue;
    indices.push(ia, ib, ic);
    for (const i of [ia, ib, ic]) {
      const list = normalLists[i];
      if (list && !list.some((m) => m.dot(n) > 0.98)) list.push(n.clone());
    }
  }
  const normals = new Float32Array(positions.length);
  const sum = new THREE.Vector3();
  normalLists.forEach((list, i) => {
    sum.set(0, 0, 0);
    for (const m of list) sum.add(m);
    if (sum.lengthSq() > 1e-12) sum.normalize();
    else sum.set(0, 0, 0);
    normals[i * 3] = sum.x;
    normals[i * 3 + 1] = sum.y;
    normals[i * 3 + 2] = sum.z;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// 頂点を画面の上で法線の向きへ一定の px だけ押し出す（遠くでも近くでも同じ太さ）。法線の向きは、頂点と
// 法線の先の点を画面に写した差で決める。法線の無い頂点（向きの打ち消し合う薄い板）は動かさない
const HULL_VERTEX = /* glsl */ `
#include <project_vertex>
{
  vec3 kumN = normalMatrix * normal;
  if ( dot( kumN, kumN ) > 1e-12 && gl_Position.w > 0.0 ) {
    vec4 kumTip = projectionMatrix * vec4( mvPosition.xyz + normalize( kumN ) * 0.5, 1.0 );
    if ( kumTip.w > 0.0 ) {
      vec2 kumDir = ( kumTip.xy / kumTip.w - gl_Position.xy / gl_Position.w ) * kumResolution;
      float kumLen = length( kumDir );
      if ( kumLen > 1e-6 ) {
        gl_Position.xy += ( kumDir / kumLen ) * ( 2.0 * kumOutlineWidth / kumResolution ) * gl_Position.w;
      }
    }
  }
}
`;

function createOutlineHullMaterial(
  color: string,
  clippingPlanes: THREE.Plane[],
  resolution: THREE.Vector2,
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    clippingPlanes,
    // 殻の塗り（かステンシルだけの描画）が描いた所には描かない＝建物の外周にだけ残る
    stencilWrite: true,
    stencilWriteMask: 0,
    stencilRef: STENCIL_REF,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.KeepStencilOp,
  });
  material.name = 'selection-outline';
  const uniforms = {
    kumOutlineWidth: { value: OUTLINE_WIDTH_PX },
    kumResolution: { value: resolution },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float kumOutlineWidth;\nuniform vec2 kumResolution;')
      .replace('#include <project_vertex>', HULL_VERTEX);
  };
  material.customProgramCacheKey = () => 'kum-selection-outline-1';
  return material;
}

/**
 * 殻の薄い塗り。下の色を少し明るくする（FILL_GAIN）。殻の面は下の建物とちょうど同じ所にあるので、少し手前に寄せて勝たせる。
 * ステンシルに印を付け（輪郭が建物の中に入らないように）、印のある所には 2 度塗らない（部品の重なる所が濃くならない）。
 * 塗りを描かない（輪郭だけの）ときは、色を書かずに印だけ付ける
 */
function createFillMaterial(clippingPlanes: THREE.Plane[]): THREE.MeshBasicMaterial {
  // 画面への書き出しは shader の中で sRGB にしてから混ぜるので、掛ける値は sRGB の値で決める
  const tint = new THREE.Color(SCENE_PALETTE.selection.fill).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  const gain = new THREE.Color().setRGB(tint.r * FILL_GAIN, tint.g * FILL_GAIN, tint.b * FILL_GAIN, THREE.SRGBColorSpace);
  const material = new THREE.MeshBasicMaterial({
    color: gain,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.OneFactor,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
    // 透明な両面は既定で 2 回に分けて描く。1 回で描く（描画命令 +1 のまま）
    forceSinglePass: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    clippingPlanes,
    stencilWrite: true,
    stencilRef: STENCIL_REF,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  material.name = 'selection-fill';
  return material;
}

function noRaycast(): void {}

/**
 * 選んだ建物（か棟）の殻に、輪郭と薄い塗りを重ねる。重ねる物は建物の group の子にするので、持ち上げると一緒に動く。
 * 当たり判定・影・部品のまとめ（userData.selectionOverlay）には入れない。殻（引数の形）は持ち主が片づける。
 * 輪郭用の形（太らせる形・角の線）は殻ごとに初めて使うときに作って取っておき、dispose で片づける
 */
export class SelectionHighlighter {
  readonly root = new THREE.Group();
  private readonly fill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly hull: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly edges: LineSegments2;
  private readonly edgeMaterial: LineMaterial;
  private readonly emptyGeometry = new THREE.BufferGeometry();
  private readonly emptyEdges = new LineSegmentsGeometry();
  private readonly hullCache = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  private readonly edgeCache = new Map<THREE.BufferGeometry, LineSegmentsGeometry>();
  private readonly resolution = new THREE.Vector2(1, 1);
  private look: SelectionLook;

  constructor(look: SelectionLook = DEFAULT_SELECTION_LOOK, clippingPlanes: THREE.Plane[] = []) {
    this.look = { ...look };
    this.root.name = 'selection-highlight';
    this.root.userData = { selectionOverlay: true };
    const color = SCENE_PALETTE.selection[look.outlineColor === 'ink' ? 'outlineInk' : 'outlineAmber'];

    this.fill = new THREE.Mesh(this.emptyGeometry, createFillMaterial(clippingPlanes));
    this.fill.name = 'selection-fill';
    this.fill.renderOrder = -2;

    this.hull = new THREE.Mesh(this.emptyGeometry, createOutlineHullMaterial(color, clippingPlanes, this.resolution));
    this.hull.name = 'selection-outline';
    this.hull.renderOrder = -1;

    this.edgeMaterial = new LineMaterial({
      color,
      linewidth: EDGE_WIDTH_PX,
      worldUnits: false,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -8,
    });
    this.edgeMaterial.clippingPlanes = clippingPlanes;
    this.edges = new LineSegments2(this.emptyEdges, this.edgeMaterial);
    this.edges.name = 'selection-edges';
    this.edges.renderOrder = -1;

    for (const obj of [this.fill, this.hull, this.edges]) {
      obj.userData = { selectionOverlay: true };
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.raycast = noRaycast;
    }
    this.applyLook();
  }

  /** 描く物を look に合わせる。塗りは、塗るときと殻を太らせた輪郭のステンシルが要るときに描く */
  private applyLook(): void {
    const { outline, fill } = this.look;
    this.root.clear();
    if (fill || outline === 'hull') {
      this.fill.material.colorWrite = fill;
      this.root.add(this.fill);
    }
    if (outline === 'hull') this.root.add(this.hull);
    if (outline === 'edges') this.root.add(this.edges);
  }

  getLook(): Readonly<SelectionLook> {
    return this.look;
  }

  /** 描く所の大きさ（CSS px）。輪郭の太さを px でそろえるのに使う */
  setResolution(width: number, height: number): void {
    this.resolution.set(Math.max(1, width), Math.max(1, height));
    // LineMaterial は値を写して持つ
    this.edgeMaterial.resolution = this.resolution;
  }

  /** 殻を建物の group に重ねる。group か shell が無ければ消す */
  show(group: THREE.Object3D | null | undefined, shell: THREE.BufferGeometry | null | undefined): void {
    this.root.removeFromParent();
    if (!group || !shell || shell.getAttribute('position').count === 0) {
      this.fill.geometry = this.emptyGeometry;
      this.hull.geometry = this.emptyGeometry;
      this.edges.geometry = this.emptyEdges;
      return;
    }
    this.fill.geometry = shell;
    if (this.look.outline === 'hull') this.hull.geometry = this.hullOf(shell);
    if (this.look.outline === 'edges') this.edges.geometry = this.edgesOf(shell);
    group.add(this.root);
  }

  isShown(): boolean {
    return this.root.parent !== null;
  }

  /** 選んでいる間に描く物の数（描画命令の数） */
  drawnObjectCount(): number {
    return this.isShown() ? this.root.children.length : 0;
  }

  private hullOf(shell: THREE.BufferGeometry): THREE.BufferGeometry {
    let geo = this.hullCache.get(shell);
    if (!geo) {
      geo = buildOutlineHullGeometry(shell);
      this.hullCache.set(shell, geo);
    }
    return geo;
  }

  private edgesOf(shell: THREE.BufferGeometry): LineSegmentsGeometry {
    let geo = this.edgeCache.get(shell);
    if (!geo) {
      const edges = new THREE.EdgesGeometry(shell, EDGE_THRESHOLD_DEG);
      geo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
      edges.dispose();
      this.edgeCache.set(shell, geo);
    }
    return geo;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const geo of this.hullCache.values()) geo.dispose();
    for (const geo of this.edgeCache.values()) geo.dispose();
    this.hullCache.clear();
    this.edgeCache.clear();
    this.emptyGeometry.dispose();
    this.emptyEdges.dispose();
    this.fill.material.dispose();
    this.hull.material.dispose();
    this.edgeMaterial.dispose();
  }
}
