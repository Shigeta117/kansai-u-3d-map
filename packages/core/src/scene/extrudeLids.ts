import * as THREE from 'three';

/**
 * ExtrudeGeometry の底の蓋（z = 0 の、−z 向きの面）を外したジオメトリを返す。
 * three r176 の ExtrudeGeometry は面取りなしでも上下の蓋を作る（r175 は蓋を作らず、#12 で自前で補っていた）。
 * いつも地面の下に隠れる押し出し（周辺の建物）では、底を外して三角形を減らす。
 *
 * - 呼ぶのは rotate・translate の前（シェイプの面が XY、押し出しが +Z の 0〜depth の状態）
 * - 外すのは蓋のグループ（materialIndex 0）の中で、3 つの頂点がすべて z = 0 の三角形だけ。側面と上の蓋はそのまま
 * - グループは three と同じ並び（0 = 蓋、1 = 側面）で、蓋は上だけになる。uv など position 以外の属性も同じ頂点を残す
 * - index のあるジオメトリ・蓋の無いジオメトリはそのまま返す。外したときは元のジオメトリを dispose する
 */
export function dropExtrudeBottomLid(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geo.index) return geo;
  const lid = geo.groups.find((g) => g.materialIndex === 0);
  if (!lid || lid.count === 0) return geo;

  const pos = geo.getAttribute('position');
  const lidEnd = lid.start + lid.count;
  const isBottom = (i: number): boolean =>
    i >= lid.start && i < lidEnd && pos.getZ(i) === 0 && pos.getZ(i + 1) === 0 && pos.getZ(i + 2) === 0;

  // 残す三角形の先頭の頂点の番号と、グループごとに残る頂点の数（three のグループは頂点の順に並ぶ）
  const kept: number[] = [];
  const groupCounts = geo.groups.map(() => 0);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    if (isBottom(i)) continue;
    kept.push(i);
    const gi = geo.groups.findIndex((g) => i >= g.start && i < g.start + g.count);
    if (gi >= 0) groupCounts[gi] = (groupCounts[gi] ?? 0) + 3;
  }
  if (kept.length * 3 === pos.count) return geo;

  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const size = attr.itemSize;
    const src = attr.array;
    const dst = new Float32Array(kept.length * 3 * size);
    kept.forEach((first, t) => {
      for (let k = 0; k < 3 * size; k++) dst[t * 3 * size + k] = src[first * size + k] ?? 0;
    });
    out.setAttribute(name, new THREE.BufferAttribute(dst, size));
  }
  let start = 0;
  geo.groups.forEach((g, gi) => {
    const count = groupCounts[gi] ?? 0;
    out.addGroup(start, count, g.materialIndex);
    start += count;
  });
  geo.dispose();
  return out;
}
