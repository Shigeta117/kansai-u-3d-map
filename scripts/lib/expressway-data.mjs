/**
 * 名神高速道路の車道・橋脚・坑口のデータを OSM と DEM から作る（build-campus-data.mjs から呼ぶ）。
 *
 * - 線の位置は OSM の way。路面の高さは OSM に無いので DEM から推定する（packages/core/src/domain/expressway.ts）
 * - 上下線は同じ x で同じ高さにそろえる（並んだ 2 本の高架の高さが食い違わないように）
 * - 高架の区間は、線路・道路と交わる所で桁の下に minClearance 以上の空きを取る（足りなければ路面を持ち上げる）
 * - 橋脚は、線路・ホーム・道路・建物の上を避けて置く
 */

const DENSIFY_STEP = 4;
const PROFILE_GRID_STEP = 2;

const ROAD_HALF_WIDTH = {
  primary: 3.6,
  secondary: 3.2,
  tertiary: 3.2,
  unclassified: 2.1,
  residential: 2.1,
  living_street: 2.1,
  service: 2.1,
};
const FOOT_HALF_WIDTH = 1.3;
const FOOT_HIGHWAYS = new Set(['footway', 'pedestrian', 'path', 'steps', 'cycleway']);
/** 線路の中心から構造物までの最低の距離（建築限界の半分 約 1.9m に余裕を足した値）。推定 */
const RAIL_HALF_CLEARANCE = 2.6;

function wayPoints(way, nodeMap, toLocal) {
  const pts = [];
  for (const nid of way.nodes ?? []) {
    const nd = nodeMap.get(nid);
    if (!nd) continue;
    const { x, z } = toLocal(nd.lat, nd.lon);
    pts.push([x, z]);
  }
  return pts;
}

/** OSM の way を西→東につないだ線。segBridge[i] は i 番目の点から i+1 番目の点までが高架か */
function chainCarriageway(spec, wayMap, nodeMap, toLocal) {
  const pts = [];
  const segBridge = [];
  const osmWayIds = [];
  for (const ref of spec.ways) {
    const way = wayMap.get(ref.wayId);
    if (!way) throw new Error(`expressway: OSM way ${ref.wayId} not found`);
    osmWayIds.push(ref.wayId);
    let wp = wayPoints(way, nodeMap, toLocal);
    if (ref.reverse) wp = wp.reverse();
    const isBridge = way.tags?.bridge === 'yes';
    for (let i = 0; i < wp.length; i++) {
      const p = wp[i];
      const prev = pts[pts.length - 1];
      if (prev && i === 0 && Math.hypot(prev[0] - p[0], prev[1] - p[1]) < 0.5) continue;
      if (prev) segBridge.push(isBridge);
      pts.push(p);
    }
  }
  return { pts, segBridge, osmWayIds };
}

function densify(pts, segBridge, step) {
  const out = [];
  const outSeg = [];
  const s = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      s.push(acc + d * t);
      outSeg.push(segBridge[i]);
    }
    acc += d;
  }
  out.push(pts[pts.length - 1]);
  s.push(acc);
  return { pts: out, s, segBridge: outSeg };
}

function pointSegDist(px, pz, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}

function pointPolylineDist(px, pz, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = pointSegDist(px, pz, pts[i], pts[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function pointPolygonDist(px, pz, poly) {
  if (pointInPolygon(px, pz, poly)) return 0;
  return pointPolylineDist(px, pz, [...poly, poly[0]]);
}

/** x を単調に増える軸として、線形補間で値を引く（範囲外は端の値） */
function interpByX(xs, vs, x) {
  if (xs.length === 0) return 0;
  if (x <= xs[0]) return vs[0];
  if (x >= xs[xs.length - 1]) return vs[vs.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = xs[i + 1] > xs[i] ? (x - xs[i]) / (xs[i + 1] - xs[i]) : 0;
      return vs[i] + (vs[i + 1] - vs[i]) * t;
    }
  }
  return vs[vs.length - 1];
}

/** 線を矩形 [minX,maxX]×[minZ,maxZ] で切る（はみ出した部分を落とし、境界の点を補う）。区間の種類も切る */
function cropPolyline(pts, segKinds, box) {
  const outPts = [];
  const outKinds = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    // 線分を矩形でクリップ（Liang–Barsky）
    let t0 = 0;
    let t1 = 1;
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const clip = (p, q) => {
      if (Math.abs(p) < 1e-12) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    };
    if (
      !clip(-dx, a[0] - box.minX) ||
      !clip(dx, box.maxX - a[0]) ||
      !clip(-dz, a[2] - box.minZ) ||
      !clip(dz, box.maxZ - a[2])
    ) {
      continue;
    }
    const lerp = (t) => [a[0] + dx * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t];
    const p0 = t0 > 0 ? lerp(t0) : a;
    const p1 = t1 < 1 ? lerp(t1) : b;
    const last = outPts[outPts.length - 1];
    if (!last || Math.hypot(last[0] - p0[0], last[2] - p0[2]) > 0.05) {
      if (last) {
        // 一度矩形の外へ出て戻った線は扱わない（この範囲の名神では起きない）
        throw new Error('expressway: carriageway leaves and re-enters the diorama');
      }
      outPts.push(p0);
    }
    outPts.push(p1);
    outKinds.push(segKinds[i]);
  }
  return { pts: outPts, kinds: outKinds };
}

const round2 = (v) => Number(v.toFixed(2));

/**
 * @param {object} ctx
 * @param {Map<number, any>} ctx.nodeMap
 * @param {Map<number, any>} ctx.wayMap
 * @param {any[]} ctx.elements
 * @param {any} ctx.terrain
 * @param {(x:number,z:number)=>number} ctx.sampleElevation
 * @param {(lat:number,lon:number)=>{x:number,z:number}} ctx.toLocal
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} ctx.diorama
 * @param {[number, number][][]} ctx.buildingPolygons 橋脚を避ける建物の輪郭
 * @param {[number, number][][]} ctx.platformPolygons 橋脚を避けるホームの輪郭
 * @param {object} ctx.spec { sections, portals, dims, windows }
 * @param {object} ctx.math packages/core/src/domain/expressway.ts
 */
export function buildExpresswayData(ctx) {
  const { nodeMap, wayMap, elements, terrain, sampleElevation, toLocal, diorama, spec, math } = ctx;
  const { dims, windows } = spec;
  const inTerrain = ([x, z]) =>
    x >= terrain.minX && x <= terrain.maxX && z >= terrain.minZ && z <= terrain.maxZ;

  // 交わりを調べる相手（線路・道路・下をくぐる道）
  const railLines = [];
  const roadLines = [];
  const footLines = [];
  const underpassWays = [];
  for (const el of elements) {
    if (el.type !== 'way' || !el.tags) continue;
    if (el.tags.railway === 'rail') {
      railLines.push(wayPoints(el, nodeMap, toLocal));
      continue;
    }
    const hw = el.tags.highway;
    if (!hw || hw === 'motorway' || hw === 'motorway_link') continue;
    const pts = wayPoints(el, nodeMap, toLocal);
    if (pts.length < 2) continue;
    if (el.tags.tunnel === 'yes') {
      underpassWays.push({ id: el.id, pts, hw });
      continue;
    }
    if (ROAD_HALF_WIDTH[hw] !== undefined) roadLines.push({ pts, half: ROAD_HALF_WIDTH[hw] });
    else if (FOOT_HIGHWAYS.has(hw)) footLines.push(pts);
  }

  const carriageways = [];
  const piers = [];
  const portals = [];
  const sectionProfiles = new Map();
  const report = { clearance: [], piers: 0 };

  for (const section of spec.sections) {
    const chains = section.carriageways.map((cs) => {
      const raw = chainCarriageway(cs, wayMap, nodeMap, toLocal);
      const dense = densify(raw.pts, raw.segBridge, DENSIFY_STEP);
      return { cs, raw, dense };
    });

    // 1. 車道ごとに DEM から路面の高さ（推定）
    const perCarriageway = chains.map(({ dense }) => {
      const underpassS = [];
      for (const up of underpassWays) {
        for (let i = 0; i < dense.pts.length - 1; i++) {
          for (let j = 0; j < up.pts.length - 1; j++) {
            const hit = math.segmentIntersection(dense.pts[i], dense.pts[i + 1], up.pts[j], up.pts[j + 1]);
            if (hit) underpassS.push(dense.s[i] + (dense.s[i + 1] - dense.s[i]) * hit.t);
          }
        }
      }
      const samples = [];
      const xs = [];
      for (let i = 0; i < dense.pts.length; i++) {
        const p = dense.pts[i];
        if (!inTerrain(p)) continue;
        const nearBridge = Boolean(dense.segBridge[i] || dense.segBridge[i - 1]);
        const nearUnderpass = underpassS.some((s) => Math.abs(s - dense.s[i]) <= windows.underpassExclusion);
        samples.push({ s: dense.s[i], dem: sampleElevation(p[0], p[1]), excluded: nearBridge || nearUnderpass });
        xs.push(p[0]);
      }
      const elev = math.computeRoadProfile(samples, windows);
      return { xs, elev, underpassS };
    });

    // 2. 上下線を同じ x で同じ高さにそろえる（x の格子の上の 1 本の高さの線）
    const xMin = Math.max(...perCarriageway.map((c) => Math.min(...c.xs)));
    const xMax = Math.min(...perCarriageway.map((c) => Math.max(...c.xs)));
    const gridX = [];
    for (let x = xMin; x <= xMax + 1e-9; x += PROFILE_GRID_STEP) gridX.push(x);
    let gridE = gridX.map(
      (x) => perCarriageway.reduce((sum, c) => sum + interpByX(c.xs, c.elev, x), 0) / perCarriageway.length,
    );

    // 3. 高架が線路・道路と交わる所で、桁の下の空きを確保する
    const requirements = [];
    for (const { dense } of chains) {
      for (let i = 0; i < dense.pts.length - 1; i++) {
        if (!dense.segBridge[i]) continue;
        const a = dense.pts[i];
        const b = dense.pts[i + 1];
        const targets = [
          ...railLines.map((pts) => ({ pts, kind: 'rail' })),
          ...roadLines.map((r) => ({ pts: r.pts, kind: 'road' })),
        ];
        for (const tg of targets) {
          for (let j = 0; j < tg.pts.length - 1; j++) {
            const hit = math.segmentIntersection(a, b, tg.pts[j], tg.pts[j + 1]);
            if (!hit) continue;
            const x = a[0] + (b[0] - a[0]) * hit.t;
            const z = a[1] + (b[1] - a[1]) * hit.t;
            const ground = sampleElevation(x, z);
            requirements.push({
              s: x,
              minElev: ground + dims.minClearance + dims.structureDepth + dims.clearanceMargin,
              kind: tg.kind,
              x,
              z,
              ground,
            });
          }
        }
      }
    }
    if (requirements.length > 0) {
      const before = gridE;
      gridE = math.applyClearanceBumps(gridX, gridE, requirements, windows.clearanceBumpHalfLength);
      const maxLift = Math.max(...gridE.map((e, i) => e - before[i]));
      report.clearance.push({ section: section.id, crossings: requirements.length, maxLift: round2(maxLift) });
    }
    sectionProfiles.set(section.id, { gridX, gridE });
    const elevAt = (x) => interpByX(gridX, gridE, x);

    // 4. ジオラマの範囲で切って出力。高架の区間には橋脚を置く
    for (const { cs, raw, dense } of chains) {
      const pts3 = dense.pts.map(([x, z]) => [x, elevAt(x), z]);
      const kinds = dense.segBridge.map((b) => (b ? 'bridge' : 'ground'));
      const cropped = cropPolyline(pts3, kinds, diorama);
      if (cropped.pts.length < 2) continue;
      carriageways.push({
        id: cs.id,
        name: cs.name,
        lanes: cs.lanes,
        osmWayIds: raw.osmWayIds,
        points: cropped.pts.map(([x, y, z]) => [round2(x), round2(y), round2(z)]),
        segmentKinds: cropped.kinds,
        width: dims.carriagewayWidth,
        structureDepth: dims.structureDepth,
        slabThickness: dims.slabThickness,
        parapetHeight: dims.parapetHeight,
        parapetThickness: dims.parapetThickness,
        embankmentSlope: section.embankmentSlope,
      });

      // 高架の区間（連続した bridge）ごとに橋脚の位置を選ぶ（線全体の距離で）
      const pointAt = (s) => {
        for (let i = 0; i < dense.s.length - 1; i++) {
          if (s >= dense.s[i] && s <= dense.s[i + 1]) {
            const t = (s - dense.s[i]) / (dense.s[i + 1] - dense.s[i] || 1);
            const a = dense.pts[i];
            const b = dense.pts[i + 1];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
            return {
              x: a[0] + (b[0] - a[0]) * t,
              z: a[1] + (b[1] - a[1]) * t,
              dx: (b[0] - a[0]) / len,
              dz: (b[1] - a[1]) / len,
            };
          }
        }
        return null;
      };
      const half = dims.pierColumnSize / 2;
      const isAllowed = (s) => {
        const p = pointAt(s);
        if (!p) return false;
        // 柱の 4 隅と中心
        const nx = -p.dz;
        const nz = p.dx;
        const probes = [[p.x, p.z]];
        for (const [u, v] of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]) {
          probes.push([p.x + (p.dx * u + nx * v) * half, p.z + (p.dz * u + nz * v) * half]);
        }
        for (const [qx, qz] of probes) {
          for (const rl of railLines) if (pointPolylineDist(qx, qz, rl) < RAIL_HALF_CLEARANCE) return false;
          for (const r of roadLines) if (pointPolylineDist(qx, qz, r.pts) < r.half + 0.5) return false;
          for (const f of footLines) if (pointPolylineDist(qx, qz, f) < FOOT_HALF_WIDTH) return false;
          for (const poly of ctx.platformPolygons) if (pointPolygonDist(qx, qz, poly) < 0.5) return false;
          for (const poly of ctx.buildingPolygons) if (pointPolygonDist(qx, qz, poly) < 0.3) return false;
        }
        return true;
      };
      let runStart = null;
      for (let i = 0; i <= dense.segBridge.length; i++) {
        const isB = i < dense.segBridge.length && dense.segBridge[i];
        if (isB && runStart === null) runStart = i;
        if (!isB && runStart !== null) {
          const s0 = dense.s[runStart];
          const s1 = dense.s[i];
          const stations = math.choosePierStations(
            s0,
            s1,
            {
              target: dims.pierSpacing,
              min: dims.pierSpacingMin,
              max: dims.pierSpacingMax,
              endClearance: 10,
            },
            isAllowed,
          );
          for (const s of stations) {
            const p = pointAt(s);
            if (!p) continue;
            if (p.x < diorama.minX || p.x > diorama.maxX || p.z < diorama.minZ || p.z > diorama.maxZ) continue;
            piers.push({
              carriagewayId: cs.id,
              x: round2(p.x),
              z: round2(p.z),
              topElevM: round2(elevAt(p.x) - dims.structureDepth),
              angleRad: Number(Math.atan2(-p.dz, p.dx).toFixed(4)),
              capLength: round2(dims.carriagewayWidth - 1.0),
              columnSize: dims.pierColumnSize,
            });
          }
          runStart = null;
        }
      }
    }
  }
  report.piers = piers.length;

  // 5. 坑口: OSM のトンネルの端（上下線）の中点に、トンネルの方向に直角に置く
  for (const ps of spec.portals) {
    const ends = ps.endNodeIds.map((nid) => {
      const nd = nodeMap.get(nid);
      if (!nd) throw new Error(`expressway: portal node ${nid} not found`);
      return toLocal(nd.lat, nd.lon);
    });
    // トンネルの奥へ向かう向き（両方のトンネルの way で、端のノードの隣のノードへ向かう向きの平均）
    let ix = 0;
    let iz = 0;
    for (const wid of ps.tunnelWayIds) {
      const way = wayMap.get(wid);
      const nodes = way?.nodes ?? [];
      for (const nid of ps.endNodeIds) {
        const k = nodes.indexOf(nid);
        if (k < 0) continue;
        const nextId = k === 0 ? nodes[1] : nodes[k - 1];
        const a = nodeMap.get(nid);
        const b = nodeMap.get(nextId);
        if (!a || !b) continue;
        const pa = toLocal(a.lat, a.lon);
        const pb = toLocal(b.lat, b.lon);
        const len = Math.hypot(pb.x - pa.x, pb.z - pa.z) || 1;
        ix += (pb.x - pa.x) / len;
        iz += (pb.z - pa.z) / len;
      }
    }
    const ilen = Math.hypot(ix, iz) || 1;
    const outward = { x: -ix / ilen, z: -iz / ilen };
    const angleRad = Math.atan2(-outward.z, outward.x);
    const cx = (ends[0].x + ends[1].x) / 2;
    const cz = (ends[0].z + ends[1].z) / 2;
    // 坑門の幅の方向（ローカル Z の向き）= (sinθ, cosθ)
    const ax = Math.sin(angleRad);
    const az = Math.cos(angleRad);
    const offsets = ends.map((e) => (e.x - cx) * ax + (e.z - cz) * az);
    const spacing = Math.abs(offsets[0] - offsets[1]);
    const openingWidth = Math.min(dims.carriagewayWidth, spacing - 1.2);
    const prof = sectionProfiles.get(ps.sectionId);
    const y = prof ? interpByX(prof.gridX, prof.gridE, cx) : sampleElevation(cx, cz);
    portals.push({
      id: ps.id,
      name: ps.name,
      kind: 'expressway',
      x: round2(cx),
      y: round2(y),
      z: round2(cz),
      angleRad: Number(angleRad.toFixed(4)),
      width: round2(spacing + dims.carriagewayWidth + dims.portalWingWidth * 2),
      openings: offsets.map((o) => ({ offset: round2(o), width: round2(openingWidth) })),
      openingHeight: dims.portalOpeningHeight,
      wallHeight: dims.portalWallHeight,
      hoodDepth: dims.portalHoodDepth,
    });
  }

  // 6. 名神の下をくぐる道（tunnel=yes）の両端に、通路の口を置く
  for (const up of underpassWays) {
    const crosses = carriageways.some((cw) => {
      for (let i = 0; i < cw.points.length - 1; i++) {
        const a = [cw.points[i][0], cw.points[i][2]];
        const b = [cw.points[i + 1][0], cw.points[i + 1][2]];
        for (let j = 0; j < up.pts.length - 1; j++) {
          if (math.segmentIntersection(a, b, up.pts[j], up.pts[j + 1])) return true;
        }
      }
      return false;
    });
    if (!crosses) continue;
    const endsAt = [
      { p: up.pts[0], q: up.pts[1] },
      { p: up.pts[up.pts.length - 1], q: up.pts[up.pts.length - 2] },
    ];
    endsAt.forEach(({ p, q }, k) => {
      const len = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
      const outward = { x: (p[0] - q[0]) / len, z: (p[1] - q[1]) / len };
      // 口から道路の外側の縁まで（覆いの奥行き）: 名神の車道の線までの距離
      let toDeck = Infinity;
      for (const cw of carriageways) {
        const line = cw.points.map(([x, , z]) => [x, z]);
        const d = pointPolylineDist(p[0], p[1], line) - cw.width / 2;
        if (d < toDeck) toDeck = d;
      }
      portals.push({
        id: `underpass-${up.id}-${k === 0 ? 'a' : 'b'}`,
        name: '名神高速道路の下をくぐる道の口',
        kind: 'culvert',
        x: round2(p[0]),
        y: round2(sampleElevation(p[0], p[1])),
        z: round2(p[1]),
        angleRad: Number(Math.atan2(-outward.z, outward.x).toFixed(4)),
        width: round2(dims.culvertWidth + 1.6),
        openings: [{ offset: 0, width: dims.culvertWidth }],
        openingHeight: dims.culvertHeight,
        wallHeight: round2(dims.culvertHeight + 1.0),
        hoodDepth: round2(Math.max(2, toDeck + 1)),
      });
    });
  }

  return { carriageways, piers, portals, report };
}
