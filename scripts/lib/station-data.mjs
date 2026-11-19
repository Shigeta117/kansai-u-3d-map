/**
 * 駅のホーム・駅舎・上屋のデータを OSM の輪郭から作る（build-campus-data.mjs から呼ぶ）。
 * 作り方の指定は packages/core/src/data/campuses/senriyama/station.ts。
 */

/** 半平面 (p - origin)·dir >= 0 で多角形を切る（Sutherland–Hodgman） */
function clipByHalfPlane(poly, origin, dir) {
  const side = (p) => (p[0] - origin[0]) * dir[0] + (p[1] - origin[1]) * dir[1];
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** 建物の長い方向（いちばん離れた 2 点を結ぶ向き）と、その向きでの範囲 */
function longAxisRange(poly) {
  let best = 0;
  let a = poly[0];
  let b = poly[0];
  for (let i = 0; i < poly.length; i++) {
    for (let j = i + 1; j < poly.length; j++) {
      const d = Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]);
      if (d > best) {
        best = d;
        a = poly[i];
        b = poly[j];
      }
    }
  }
  const len = best || 1;
  const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const t = (p[0] - a[0]) * dir[0] + (p[1] - a[1]) * dir[1];
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return { origin: a, dir, min, max };
}

const round2 = (v) => Number(v.toFixed(2));

/**
 * @param {object} spec StationFacilitiesSpec
 * @param {(wayId:number)=>[number,number][]} ringOf OSM の way の輪郭（ローカル座標、閉じない）
 */
export function buildStationFacilities(spec, ringOf) {
  const platforms = spec.platforms.map((p) => {
    const polygon = ringOf(p.osmWayId);
    if (polygon.length < 3) throw new Error(`station: platform way ${p.osmWayId} not found`);
    return { id: p.id, ref: p.ref, polygon };
  });
  const buildings = spec.buildings.map((b) => {
    const polygon = ringOf(b.osmWayId);
    if (polygon.length < 3) throw new Error(`station: building way ${b.osmWayId} not found`);
    return { id: b.id, name: b.name, polygon, heightM: b.heightM, roofHex: b.roofHex };
  });
  const canopies = spec.canopies.map((c) => {
    const platformSpec = spec.platforms.find((p) => p.osmWayId === c.platformWayId);
    const platform = ringOf(c.platformWayId);
    const along = ringOf(c.alongBuildingWayId);
    const axis = longAxisRange(along);
    // 建物の長さの範囲 [min, max] だけを残す
    const start = [axis.origin[0] + axis.dir[0] * axis.min, axis.origin[1] + axis.dir[1] * axis.min];
    const end = [axis.origin[0] + axis.dir[0] * axis.max, axis.origin[1] + axis.dir[1] * axis.max];
    let poly = clipByHalfPlane(platform, start, axis.dir);
    poly = clipByHalfPlane(poly, end, [-axis.dir[0], -axis.dir[1]]);
    return {
      id: c.id,
      platformId: platformSpec?.id ?? String(c.platformWayId),
      polygon: poly.map(([x, z]) => [round2(x), round2(z)]),
      clearHeightM: c.clearHeightM,
    };
  });
  return { stationId: spec.stationId, platforms, buildings, canopies };
}
