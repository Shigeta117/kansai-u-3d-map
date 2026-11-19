import * as THREE from 'three';

export interface ExtrudeLidOptions {
  /** ExtrudeGeometry に渡したのと同じ値（曲線の分割数）。既定は three と同じ 12 */
  curveSegments?: number;
  /** 底（z = 0、−z 向き）の蓋を張るか。地面の下に隠れる押し出しでは false にして三角形を減らす */
  bottom?: boolean;
}

/**
 * three r175 の ExtrudeGeometry は `bevelEnabled: false` のとき蓋（シェイプの面。建物なら屋根と床）を作らない。
 * 面取りの段の数が 0 のとき、三角形に割る輪郭が空のままになるため（r176 で直った）。
 * 蓋の無いジオメトリに、シェイプを三角形に割った蓋を足したジオメトリを返す。
 *
 * - 呼ぶのは rotate・translate の前（シェイプの面が XY、押し出しが +Z の 0〜depth の状態）。法線は呼んだ側で計算し直す
 * - グループは three と同じく 0 = 蓋、1 = 側面。uv も three（WorldUVGenerator）と同じく、蓋は (x, y)
 * - 蓋がすでにある（面取りあり・three を上げた後）ならそのまま返す。足したときは元のジオメトリを dispose する
 */
export function ensureExtrudeLids(
  geo: THREE.BufferGeometry,
  shape: THREE.Shape,
  depth: number,
  options: ExtrudeLidOptions = {},
): THREE.BufferGeometry {
  const lidGroup = geo.groups.find((g) => g.materialIndex === 0);
  if (lidGroup && lidGroup.count > 0) return geo;

  const { contour, holes } = extractCleanPoints(shape, options.curveSegments ?? 12);
  if (contour.length < 3) return geo;
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  // 添え字は「外周 → 穴の順につないだ点の並び」を指す（triangulateShape が重複する終点を外した後の並び）
  const vertices = [contour, ...holes].flat();

  const lidPos: number[] = [];
  const lidUv: number[] = [];
  const pushVertex = (p: THREE.Vector2, z: number): void => {
    lidPos.push(p.x, p.y, z);
    lidUv.push(p.x, p.y);
  };
  const pushFaces = (z: number, facing: 1 | -1): void => {
    for (const [ia, ib, ic] of faces) {
      const pa = vertices[ia ?? -1];
      const pb = vertices[ib ?? -1];
      const pc = vertices[ic ?? -1];
      if (!pa || !pb || !pc) continue;
      // 表（法線の向き）から見て反時計回りにする。+z 向きなら XY で反時計回り
      const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
      const [p1, p2, p3] = cross > 0 === facing > 0 ? [pa, pb, pc] : [pa, pc, pb];
      pushVertex(p1, z);
      pushVertex(p2, z);
      pushVertex(p3, z);
    }
  };
  if (options.bottom !== false) pushFaces(0, -1);
  pushFaces(depth, 1);

  const sides = geo.index ? geo.toNonIndexed() : geo;
  const sidePos = sides.getAttribute('position');
  const sideUv = sides.getAttribute('uv');
  const lidCount = lidPos.length / 3;
  const total = lidCount + sidePos.count;

  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  positions.set(lidPos, 0);
  uvs.set(lidUv, 0);
  for (let i = 0; i < sidePos.count; i++) {
    const dst = lidCount + i;
    positions[dst * 3] = sidePos.getX(i);
    positions[dst * 3 + 1] = sidePos.getY(i);
    positions[dst * 3 + 2] = sidePos.getZ(i);
    if (sideUv) {
      uvs[dst * 2] = sideUv.getX(i);
      uvs[dst * 2 + 1] = sideUv.getY(i);
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.addGroup(0, lidCount, 0);
  out.addGroup(lidCount, sidePos.count, 1);
  if (sides !== geo) sides.dispose();
  geo.dispose();
  return out;
}

/** 外周は反時計回り・穴は時計回りにそろえ、閉じた輪郭の重複する終点を外す */
function extractCleanPoints(
  shape: THREE.Shape,
  curveSegments: number,
): { contour: THREE.Vector2[]; holes: THREE.Vector2[][] } {
  const extracted = shape.extractPoints(curveSegments);
  const contour = dropClosingPoint(extracted.shape);
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const holes = extracted.holes
    .map(dropClosingPoint)
    .filter((h) => h.length >= 3)
    .map((h) => (THREE.ShapeUtils.isClockWise(h) ? h : h.reverse()));
  return { contour, holes };
}

function dropClosingPoint(points: THREE.Vector2[]): THREE.Vector2[] {
  const out = points.slice();
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first && last && first.distanceTo(last) < 1e-9) out.pop();
  return out;
}
