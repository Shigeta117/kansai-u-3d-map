/**
 * グラウンド（陸上のトラック・直線の走路・野球場・テニスコート）のデータを OSM の輪郭から作る（build-campus-data.mjs から呼ぶ）。
 * 作り方の指定は packages/core/src/data/campuses/senriyama/grounds.ts。寸法・線の位置は推定
 */

const round2 = (v) => Number(v.toFixed(2));
const pt2 = (p) => [round2(p[0]), round2(p[1])];

function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function centroid(poly) {
  let sx = 0;
  let sz = 0;
  for (const [x, z] of poly) {
    sx += x;
    sz += z;
  }
  return [sx / poly.length, sz / poly.length];
}

/** 凸包（Andrew の単調連鎖） */
function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** 最小の面積の外接長方形（凸包の辺の向きを順に試す）。長い辺の向き L と短い辺の向き S、中心、長さ */
function minAreaRect(poly) {
  const hull = convexHull(poly);
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const v = [-u[1], u[0]];
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of hull) {
      const pu = p[0] * u[0] + p[1] * u[1];
      const pv = p[0] * v[0] + p[1] * v[1];
      minU = Math.min(minU, pu);
      maxU = Math.max(maxU, pu);
      minV = Math.min(minV, pv);
      maxV = Math.max(maxV, pv);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) best = { area, u, v, minU, maxU, minV, maxV };
  }
  const cu = (best.minU + best.maxU) / 2;
  const cv = (best.minV + best.maxV) / 2;
  const center = [best.u[0] * cu + best.v[0] * cv, best.u[1] * cu + best.v[1] * cv];
  const lenU = best.maxU - best.minU;
  const lenV = best.maxV - best.minV;
  return lenU >= lenV
    ? { center, L: best.u, S: best.v, longLen: lenU, shortLen: lenV }
    : { center, L: best.v, S: best.u, longLen: lenV, shortLen: lenU };
}

/** 凸の多角形を内側へ d だけ縮める（隣り合う辺を内側へずらした直線の交点） */
function insetConvex(poly, d) {
  const n = poly.length;
  // 反時計回りかどうか（符号付き面積）
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sign = area > 0 ? 1 : -1;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    // 内向きの法線（x 右・z 下の座標で、符号付き面積が正なら左手側が内側）
    const nIn = [-t[1] * sign, t[0] * sign];
    lines.push({ p: [a[0] + nIn[0] * d, a[1] + nIn[1] * d], t });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const den = l1.t[0] * l2.t[1] - l1.t[1] * l2.t[0];
    if (Math.abs(den) < 1e-9) {
      out.push(l2.p);
      continue;
    }
    const s = ((l2.p[0] - l1.p[0]) * l2.t[1] - (l2.p[1] - l1.p[1]) * l2.t[0]) / den;
    out.push([l1.p[0] + l1.t[0] * s, l1.p[1] + l1.t[1] * s]);
  }
  return out;
}

/** 線分 p→q と線分 a→b の交点（p→q の上の割合 t と点）。交わらなければ null */
function segmentHit(p, q, a, b) {
  const rx = q[0] - p[0];
  const rz = q[1] - p[1];
  const sx = b[0] - a[0];
  const sz = b[1] - a[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a[0] - p[0]) * sz - (a[1] - p[1]) * sx) / den;
  const u = ((a[0] - p[0]) * rz - (a[1] - p[1]) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, point: [p[0] + rx * t, p[1] + rz * t] };
}

/**
 * 単純な多角形 poly から凸の多角形 cut の中を引く（観客席の輪郭から建物の輪郭を外す）。
 * 輪郭どうしが 2 点で交わる場合（cut が poly の縁の一部をえぐる場合）だけを扱う:
 * poly の縁のうち cut の中に入る区間を、cut の縁（poly の中を通る側）に置き換える。
 * 交わらなければ poly をそのまま返す。それ以外の交わり方（cut が poly を分ける・中に収まる）は例外にする
 */
export function subtractConvex(poly, cut) {
  const hits = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    for (let j = 0; j < cut.length; j++) {
      const h = segmentHit(p, q, cut[j], cut[(j + 1) % cut.length]);
      if (h) hits.push({ i, t: h.t, j, point: h.point });
    }
  }
  if (hits.length === 0) {
    if (cut.some((c) => pointInPolygon(c[0], c[1], poly))) {
      throw new Error('subtractConvex: the cut lies inside the polygon');
    }
    return poly;
  }
  if (hits.length !== 2) throw new Error(`subtractConvex: expected 2 crossings, got ${hits.length}`);
  hits.sort((a, b) => a.i - b.i || a.t - b.t);
  const [h1, h2] = hits;
  // poly を h1 から h2 へたどる区間の途中の点が cut の中なら、その区間を捨てて h2 → … → h1 を残す
  const mid =
    h1.i === h2.i
      ? [
          poly[h1.i][0] + (poly[(h1.i + 1) % poly.length][0] - poly[h1.i][0]) * ((h1.t + h2.t) / 2),
          poly[h1.i][1] + (poly[(h1.i + 1) % poly.length][1] - poly[h1.i][1]) * ((h1.t + h2.t) / 2),
        ]
      : poly[(h1.i + 1) % poly.length];
  const [from, to] = pointInPolygon(mid[0], mid[1], cut) ? [h2, h1] : [h1, h2];
  const kept = [from.point];
  // from と to が同じ辺の上で from が手前なら、間に角は無い
  if (!(from.i === to.i && from.t < to.t)) {
    for (let k = (from.i + 1) % poly.length; ; k = (k + 1) % poly.length) {
      kept.push(poly[k]);
      if (k === to.i) break;
    }
  }
  kept.push(to.point);
  // to から from へ cut の縁でつなぐ。前向き（to.j+1 … from.j）と後ろ向き（to.j … from.j+1）のうち、
  // 角が全部 poly の中にある方
  const n = cut.length;
  const forward = [];
  const backward = [];
  if (to.j !== from.j) {
    for (let j = (to.j + 1) % n; ; j = (j + 1) % n) {
      forward.push(cut[j]);
      if (j === from.j) break;
    }
    for (let j = to.j; ; j = (j - 1 + n) % n) {
      backward.push(cut[j]);
      if (j === (from.j + 1) % n) break;
    }
  }
  const allInside = (pts) => pts.every((c) => pointInPolygon(c[0], c[1], poly));
  const bridge = to.j === from.j ? [] : allInside(forward) ? forward : allInside(backward) ? backward : null;
  if (bridge === null) throw new Error('subtractConvex: no side of the cut runs inside the polygon');
  return [...kept, ...bridge];
}

/** 輪郭の中の地形の標高の中央値（2m ごとに調べる） */
function medianElevationInside(poly, sampleElevation) {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const vals = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += 2) {
      if (pointInPolygon(x, z, poly)) vals.push(sampleElevation(x, z));
    }
  }
  if (vals.length === 0) return sampleElevation(...centroid(poly));
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

/** 400m のトラックの外周（直線と半円）の点の並び */
function stadiumRing(center, axis, straight, radius, step = Math.PI / 24) {
  const perp = [-axis[1], axis[0]];
  const pts = [];
  for (const end of [1, -1]) {
    const c = [center[0] + axis[0] * (straight / 2) * end, center[1] + axis[1] * (straight / 2) * end];
    for (let a = -Math.PI / 2; a <= Math.PI / 2 + 1e-9; a += step) {
      const ca = Math.cos(a) * end;
      const sa = Math.sin(a) * end;
      pts.push([c[0] + (axis[0] * ca + perp[0] * sa) * radius, c[1] + (axis[1] * ca + perp[1] * sa) * radius]);
    }
  }
  return pts;
}

/**
 * @param {object} args
 * @param {import('../../packages/core/src/data/campuses/senriyama/grounds').GroundsSpec} args.spec
 * @param {(wayId:number)=>[number,number][]} args.ringOf OSM の way の輪郭（ローカル座標、閉じない）
 * @param {(x:number,z:number)=>number} args.sampleElevation
 */
export function buildGroundsData({ spec, ringOf, sampleElevation }) {
  const grounds = [];
  const need = (wayId, what) => {
    const ring = ringOf(wayId);
    if (ring.length < 3) throw new Error(`grounds: ${what} way ${wayId} not found`);
    return ring;
  };

  // 陸上のトラック: 外周の輪郭と、内側のフィールドの向きに合わせた標準のトラックの外周を合わせた凸包を面にする
  {
    const t = spec.track;
    const outer = need(t.outerWayId, 'track outer');
    const pitch = need(t.pitchWayId, 'track pitch');
    const center = centroid(pitch);
    const rect = minAreaRect(pitch);
    const axis = rect.L;
    const outerRadius = t.innerRadiusM + t.lanes * t.laneWidthM;
    const polygon = convexHull([...outer, ...stadiumRing(center, axis, t.straightM, outerRadius)]);
    grounds.push({
      id: t.id,
      name: t.name,
      kind: 'athletics-track',
      polygon: polygon.map(pt2),
      elevation: round2(medianElevationInside(pitch, sampleElevation)),
      track: {
        center: pt2(center),
        axis: [Number(axis[0].toFixed(5)), Number(axis[1].toFixed(5))],
        straightM: t.straightM,
        innerRadiusM: t.innerRadiusM,
        lanes: t.lanes,
        laneWidthM: t.laneWidthM,
        pitch: pitch.map(pt2),
        fieldLengthM: t.fieldLengthM,
        fieldWidthM: t.fieldWidthM,
      },
    });
  }

  // 直線の走路（中央グラウンドの一部なので、トラックと同じ高さ。ならす地形の升がトラックと重なる）
  {
    const s = spec.straight;
    const polygon = need(s.wayId, 'track straight');
    grounds.push({
      id: s.id,
      kind: 'track-straight',
      polygon: polygon.map(pt2),
      elevation: grounds[0].elevation,
      straight: { lanes: s.lanes },
    });
  }

  // 観客席: 前の縁（トラックにいちばん近い辺）から後ろへ上がる座席の面。前の縁の高さはトラックの面から、
  // 後ろの縁の高さは後ろの縁の下の地面のいちばん高い所から
  {
    const st = spec.grandstand;
    // 隣の建物の輪郭（空中写真の通路の幅だけ外へ広げた物）にかかる部分は切る（OSM の観客席の輪郭は
    // 第4学舎3号館の東の角の下に入っている）
    let polygon = need(st.wayId, 'grandstand');
    for (const clear of st.keepClearOf ?? []) {
      const building = convexHull(need(clear.wayId, 'grandstand clearance'));
      polygon = subtractConvex(polygon, insetConvex(building, -clear.clearanceM));
    }
    const track = grounds[0];
    const axis = track.track.axis;
    const vdir = [-axis[1], axis[0]];
    const vOf = (p) => p[0] * vdir[0] + p[1] * vdir[1];
    const vs = polygon.map(vOf);
    // トラックの中心の側が前
    const towardTrack = vOf(track.track.center) > (Math.min(...vs) + Math.max(...vs)) / 2 ? 1 : -1;
    const vFront = towardTrack > 0 ? Math.max(...vs) : Math.min(...vs);
    const vBack = towardTrack > 0 ? Math.min(...vs) : Math.max(...vs);
    const backPts = polygon.filter((p) => Math.abs(vOf(p) - vBack) < Math.abs(vFront - vBack) * 0.5);
    const backGround = Math.max(...backPts.map((p) => sampleElevation(p[0], p[1])));
    const lowGround = Math.min(...polygon.map((p) => sampleElevation(p[0], p[1])), track.elevation);
    grounds.push({
      id: st.id,
      kind: 'grandstand',
      polygon: polygon.map(pt2),
      elevation: track.elevation,
      grandstand: {
        axis,
        vFront: round2(vFront),
        vBack: round2(vBack),
        frontElevation: round2(track.elevation + st.frontRiseM),
        backElevation: round2(backGround + st.backRiseM),
        bottomElevation: round2(lowGround - 1),
        seatHex: st.seatHex,
        aisleHex: st.aisleHex,
      },
    });
  }

  // 野球場: 外野のフェンスは、輪郭の点のうちフェアの範囲で本塁から遠い点を、左翼のポールから右翼のポールへ並べたもの
  {
    const b = spec.baseball;
    const polygon = need(b.wayId, 'baseball');
    const ang = (p) => Math.atan2(p[1] - b.home[1], p[0] - b.home[0]);
    const aL = ang(b.leftPole);
    const aR = ang(b.rightPole);
    // 左翼から右翼へ回る向きの角度（0〜span）
    let span = aR - aL;
    while (span <= -Math.PI) span += Math.PI * 2;
    while (span > Math.PI) span -= Math.PI * 2;
    const rel = (p) => {
      let d = ang(p) - aL;
      while (d <= -Math.PI) d += Math.PI * 2;
      while (d > Math.PI) d -= Math.PI * 2;
      return d / span;
    };
    const minPoleDist = Math.min(
      Math.hypot(b.leftPole[0] - b.home[0], b.leftPole[1] - b.home[1]),
      Math.hypot(b.rightPole[0] - b.home[0], b.rightPole[1] - b.home[1]),
    );
    const arc = polygon
      .filter((p) => {
        const r = rel(p);
        return r > 0.02 && r < 0.98 && Math.hypot(p[0] - b.home[0], p[1] - b.home[1]) > minPoleDist * 0.85;
      })
      .sort((p, q) => rel(p) - rel(q));
    const fence = [b.leftPole, ...arc, b.rightPole];
    grounds.push({
      id: b.id,
      name: b.name,
      kind: 'baseball',
      polygon: polygon.map(pt2),
      elevation: round2(medianElevationInside(polygon, sampleElevation)),
      baseball: {
        home: pt2(b.home),
        leftPole: pt2(b.leftPole),
        rightPole: pt2(b.rightPole),
        fence: fence.map(pt2),
        infieldRadiusM: b.infieldRadiusM,
        moundDistanceM: b.moundDistanceM,
        baseDistanceM: b.baseDistanceM,
        warningTrackM: b.warningTrackM,
        fenceHeightM: b.fenceHeightM,
      },
    });
  }

  // テニスコート
  for (const t of spec.tennis) {
    const ring = need(t.wayId, 'tennis');
    const polygon = t.roofOf ? insetConvex(convexHull(ring), t.roofOf.insetM) : ring;
    let courts;
    if (t.centers && t.courtAxis) {
      const len = Math.hypot(t.courtAxis[0], t.courtAxis[1]) || 1;
      const axis = [t.courtAxis[0] / len, t.courtAxis[1] / len];
      courts = t.centers.map((c) => ({ center: pt2(c), axis: [Number(axis[0].toFixed(5)), Number(axis[1].toFixed(5))] }));
    } else {
      // 範囲の長い方向に等しい間隔で並べ、コートの長い方向は範囲の短い方向
      const rect = minAreaRect(polygon);
      const spacing = rect.longLen / t.courts;
      courts = Array.from({ length: t.courts }, (_, k) => {
        const off = (k + 0.5) * spacing - rect.longLen / 2;
        return {
          center: pt2([rect.center[0] + rect.L[0] * off, rect.center[1] + rect.L[1] * off]),
          axis: [Number(rect.S[0].toFixed(5)), Number(rect.S[1].toFixed(5))],
        };
      });
    }
    grounds.push({
      id: t.id,
      kind: 'tennis',
      polygon: polygon.map(pt2),
      elevation: round2(medianElevationInside(polygon, sampleElevation)),
      tennis: {
        courts,
        surfaceHex: t.surfaceHex,
        courtHex: t.courtHex,
        fenceHeightM: t.fenceHeightM,
        ...(t.roofOf ? { roofOf: t.roofOf.buildingId } : {}),
      },
    });
  }

  return grounds;
}
