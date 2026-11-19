import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CACHE_RAW_DIR = path.join(ROOT_DIR, '.cache', 'raw');
const DEM_DIR = path.join(CACHE_RAW_DIR, 'gsi-dem');
const OUT_DIR = path.join(ROOT_DIR, 'public', 'data', 'senriyama');

const GRID_COLS = 129;
const GRID_ROWS = 129;

function geoToLocal(lat, lon, origin) {
  return {
    x: (lon - origin.originLon) * origin.metersPerDegLon,
    z: -(lat - origin.originLat) * origin.metersPerDegLat,
  };
}

function localToGeo(x, z, origin) {
  return {
    lon: origin.originLon + x / origin.metersPerDegLon,
    lat: origin.originLat - z / origin.metersPerDegLat,
  };
}

function lonToTileFrac(lon, z) {
  return ((lon + 180) / 360) * Math.pow(2, z);
}

function latToTileFrac(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    Math.pow(2, z)
  );
}

function decodeGsiPixel(png, px, py) {
  const cx = Math.max(0, Math.min(png.width - 1, px));
  const cy = Math.max(0, Math.min(png.height - 1, py));
  const idx = (cy * png.width + cx) * 4;
  const r = png.data[idx] ?? 0;
  const g = png.data[idx + 1] ?? 0;
  const b = png.data[idx + 2] ?? 0;
  const x = r * 65536 + g * 256 + b;
  if (x === 8388608) return null; // invalid (128, 0, 0)
  return x < 8388608 ? x * 0.01 : (x - 16777216) * 0.01;
}

function sampleTileBilinear(tileMap, layer, z, lat, lon) {
  const txFrac = lonToTileFrac(lon, z);
  const tyFrac = latToTileFrac(lat, z);
  const tx = Math.floor(txFrac);
  const ty = Math.floor(tyFrac);
  const png = tileMap.get(`${layer}_${z}_${tx}_${ty}`);
  if (!png) return null;

  const pxF = (txFrac - tx) * 256 - 0.5;
  const pyF = (tyFrac - ty) * 256 - 0.5;
  const x0 = Math.max(0, Math.min(255, Math.floor(pxF)));
  const y0 = Math.max(0, Math.min(255, Math.floor(pyF)));
  const x1 = Math.min(255, x0 + 1);
  const y1 = Math.min(255, y0 + 1);
  const wx = Math.max(0, Math.min(1, pxF - x0));
  const wy = Math.max(0, Math.min(1, pyF - y0));

  const v00 = decodeGsiPixel(png, x0, y0);
  const v10 = decodeGsiPixel(png, x1, y0);
  const v01 = decodeGsiPixel(png, x0, y1);
  const v11 = decodeGsiPixel(png, x1, y1);

  const valid = [v00, v10, v01, v11].filter((v) => v !== null);
  if (valid.length === 0) return null;
  if (valid.length < 4) {
    return valid.reduce((a, b) => a + b, 0) / valid.length;
  }
  const top = v00 * (1 - wx) + v10 * wx;
  const bottom = v01 * (1 - wx) + v11 * wx;
  return top * (1 - wy) + bottom * wy;
}

async function buildTerrainGrid(config) {
  const manifest = JSON.parse(
    await fs.readFile(path.join(DEM_DIR, 'manifest.json'), 'utf8'),
  );
  const tileMap = new Map();
  for (const t of manifest.tiles) {
    if (!t.available || !t.filename) continue;
    const buf = await fs.readFile(path.join(DEM_DIR, t.filename));
    const png = PNG.sync.read(buf);
    tileMap.set(`${t.layer}_${t.z}_${t.x}_${t.y}`, png);
  }

  const { bounds, origin } = config;
  const raw = new Array(GRID_COLS * GRID_ROWS).fill(null);
  let dem5aHits = 0;
  let dem10Hits = 0;

  for (let row = 0; row < GRID_ROWS; row++) {
    const vz = row / (GRID_ROWS - 1);
    const z = bounds.minZ + vz * (bounds.maxZ - bounds.minZ);
    for (let col = 0; col < GRID_COLS; col++) {
      const ux = col / (GRID_COLS - 1);
      const x = bounds.minX + ux * (bounds.maxX - bounds.minX);
      const { lat, lon } = localToGeo(x, z, origin);

      let elev = sampleTileBilinear(tileMap, 'dem5a_png', 15, lat, lon);
      if (elev !== null) {
        dem5aHits++;
      } else {
        elev = sampleTileBilinear(tileMap, 'dem5b_png', 15, lat, lon);
        if (elev === null) {
          elev = sampleTileBilinear(tileMap, 'dem_png', 14, lat, lon);
          if (elev !== null) dem10Hits++;
        }
      }
      raw[row * GRID_COLS + col] = elev;
    }
  }

  // Nearest-neighbor fill for any remaining nulls
  const validVals = raw.filter((v) => v !== null);
  const fallbackMean =
    validVals.length > 0
      ? validVals.reduce((a, b) => a + b, 0) / validVals.length
      : 35;

  const filled = raw.map((val, idx) => {
    if (val !== null) return val;
    const r = Math.floor(idx / GRID_COLS);
    const c = idx % GRID_COLS;
    for (let radius = 1; radius <= 12; radius++) {
      let sum = 0;
      let count = 0;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
          const nv = raw[nr * GRID_COLS + nc];
          if (nv !== null) {
            sum += nv;
            count++;
          }
        }
      }
      if (count > 0) return sum / count;
    }
    return fallbackMean;
  });

  // Gentle 1-pass Gaussian smoothing to soften 5m quantization steps while preserving hill relief
  const smoothed = new Array(GRID_COLS * GRID_ROWS);
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      let sum = 0;
      let wSum = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = Math.max(0, Math.min(GRID_ROWS - 1, row + dr));
          const nc = Math.max(0, Math.min(GRID_COLS - 1, col + dc));
          const w = (dr === 0 ? 2 : 1) * (dc === 0 ? 2 : 1);
          sum += filled[nr * GRID_COLS + nc] * w;
          wSum += w;
        }
      }
      smoothed[row * GRID_COLS + col] = Number((sum / wSum).toFixed(2));
    }
  }

  let minElevation = Infinity;
  let maxElevation = -Infinity;
  for (const e of smoothed) {
    if (e < minElevation) minElevation = e;
    if (e > maxElevation) maxElevation = e;
  }

  console.log(
    `Terrain built (${GRID_COLS}x${GRID_ROWS}): DEM5A=${dem5aHits}, DEM10B=${dem10Hits}, elevation=${minElevation.toFixed(2)}m .. ${maxElevation.toFixed(2)}m`,
  );
  if (maxElevation - minElevation < 10) {
    throw new Error(
      `Terrain relief unexpectedly flat: ${minElevation}..${maxElevation}`,
    );
  }

  return {
    cols: GRID_COLS,
    rows: GRID_ROWS,
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    minElevation: Number(minElevation.toFixed(2)),
    maxElevation: Number(maxElevation.toFixed(2)),
    elevations: smoothed,
  };
}

function sampleElevation(terrain, x, z) {
  const { cols, rows, minX, maxX, minZ, maxZ, elevations } = terrain;
  const u = Math.max(0, Math.min(1, (x - minX) / (maxX - minX)));
  const v = Math.max(0, Math.min(1, (z - minZ) / (maxZ - minZ)));
  const fx = u * (cols - 1);
  const fz = v * (rows - 1);
  const ix0 = Math.min(cols - 2, Math.floor(fx));
  const iz0 = Math.min(rows - 2, Math.floor(fz));
  const tx = fx - ix0;
  const tz = fz - iz0;
  const e00 = elevations[iz0 * cols + ix0];
  const e10 = elevations[iz0 * cols + ix0 + 1];
  const e01 = elevations[(iz0 + 1) * cols + ix0];
  const e11 = elevations[(iz0 + 1) * cols + ix0 + 1];
  return (e00 * (1 - tx) + e10 * tx) * (1 - tz) + (e01 * (1 - tx) + e11 * tx) * tz;
}

function polygonArea(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    area += x1 * z2 - x2 * z1;
  }
  return Math.abs(area) * 0.5;
}

function polygonCentroid(pts) {
  let sx = 0;
  let sz = 0;
  for (const [x, z] of pts) {
    sx += x;
    sz += z;
  }
  return { x: sx / pts.length, z: sz / pts.length };
}

function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    const intersect =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function cleanRing(ring) {
  if (ring.length < 3) return [];
  const out = [...ring];
  const first = out[0];
  const last = out[out.length - 1];
  if (
    first &&
    last &&
    Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.01
  ) {
    out.pop();
  }
  // Remove duplicate consecutive vertices
  const dedup = [];
  for (const pt of out) {
    const prev = dedup[dedup.length - 1];
    if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 0.15) {
      dedup.push([Number(pt[0].toFixed(2)), Number(pt[1].toFixed(2))]);
    }
  }
  return dedup.length >= 3 ? dedup : [];
}

function deterministicHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function inferCampusCategory(tags, centroid) {
  if (tags.leisure === 'sports_centre' || tags.sport) return 'sports';
  if (tags.amenity === 'library') return 'heritage';
  if (tags.faculty === 'business and commerce') return 'area2';
  const { x, z } = centroid;
  if (z < -110 && x > -160 && x < 120) return 'area1';
  if (z > 120 && z < 260 && x > -110 && x < 80) return 'area2';
  if (z > 100 && z < 250 && x >= -240 && x <= -110) return 'area3';
  if (x >= 55 && x < 310 && z >= -110 && z < 220) return 'area4';
  return 'other';
}

function parseLevels(tags, fallback) {
  const rawLevels = Number.parseFloat(tags['building:levels'] ?? '');
  if (Number.isFinite(rawLevels) && rawLevels > 0 && rawLevels < 40) {
    return rawLevels;
  }
  return fallback;
}

function computeBuildingHeight(tags, levels, inCampus, osmId) {
  const explicitH = Number.parseFloat(tags.height ?? '');
  if (Number.isFinite(explicitH) && explicitH > 1.5 && explicitH < 120) {
    return Number(explicitH.toFixed(2));
  }
  if (inCampus) {
    return Number((levels * 3.8 + 1.4).toFixed(2));
  }
  if (tags['building:levels']) {
    return Number((levels * 3.2 + 1.0).toFixed(2));
  }
  const jitter = deterministicHash(osmId);
  if (tags.building === 'apartments') return Number((11 + jitter * 9).toFixed(2));
  if (tags.building === 'retail' || tags.building === 'commercial') {
    return Number((7.5 + jitter * 4.5).toFixed(2));
  }
  if (tags.building === 'school') return Number((12 + jitter * 3).toFixed(2));
  return Number((5.8 + jitter * 3.2).toFixed(2));
}

function buildWalkGraphAndPaths(elements, terrain, config) {
  const nodeMap = new Map();
  for (const el of elements) {
    if (el.type === 'node') nodeMap.set(el.id, el);
  }

  const { bounds, origin } = config;
  const margin = 35;
  const inExtendedBounds = (x, z) =>
    x >= bounds.minX - margin &&
    x <= bounds.maxX + margin &&
    z >= bounds.minZ - margin &&
    z <= bounds.maxZ + margin;

  const inStrictBounds = (x, z) =>
    x >= bounds.minX + 1 &&
    x <= bounds.maxX - 1 &&
    z >= bounds.minZ + 1 &&
    z <= bounds.maxZ - 1;

  const WALKABLE_HIGHWAYS = new Set([
    'footway',
    'pedestrian',
    'path',
    'steps',
    'living_street',
    'residential',
    'unclassified',
    'service',
    'tertiary',
    'secondary',
  ]);

  const nodes = {};
  const adjacency = {};
  const paths = [];

  const ensureNode = (osmNodeId, lat, lon) => {
    const id = `n_${osmNodeId}`;
    if (!nodes[id]) {
      const { x, z } = geoToLocal(lat, lon, origin);
      const y = Number(sampleElevation(terrain, x, z).toFixed(2));
      nodes[id] = {
        id,
        x: Number(x.toFixed(2)),
        z: Number(z.toFixed(2)),
        y,
      };
      adjacency[id] = [];
    }
    return nodes[id];
  };

  const addEdge = (aId, bId, isSteps) => {
    const a = nodes[aId];
    const b = nodes[bId];
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.2) return;
    const deltaAB = b.y - a.y;
    adjacency[aId].push({
      to: bId,
      dist: Number(dist.toFixed(2)),
      deltaY: Number(deltaAB.toFixed(2)),
      slope: Number((deltaAB / dist).toFixed(4)),
      isSteps,
    });
    adjacency[bId].push({
      to: aId,
      dist: Number(dist.toFixed(2)),
      deltaY: Number((-deltaAB).toFixed(2)),
      slope: Number((-deltaAB / dist).toFixed(4)),
      isSteps,
    });
  };

  for (const el of elements) {
    if (el.type !== 'way' || !el.tags?.highway || !Array.isArray(el.nodes)) continue;
    const hw = el.tags.highway;
    const isWalkable = WALKABLE_HIGHWAYS.has(hw) && el.tags.foot !== 'no';
    const isSteps = hw === 'steps';

    const ptsLocal = [];
    const wayNodeIds = [];
    for (const nid of el.nodes) {
      const nd = nodeMap.get(nid);
      if (!nd) continue;
      const { x, z } = geoToLocal(nd.lat, nd.lon, origin);
      if (inExtendedBounds(x, z)) {
        wayNodeIds.push({ nid, lat: nd.lat, lon: nd.lon, x, z });
      }
      if (inStrictBounds(x, z)) {
        ptsLocal.push([Number(x.toFixed(2)), Number(z.toFixed(2))]);
      }
    }

    if (isWalkable && wayNodeIds.length >= 2) {
      for (let i = 0; i < wayNodeIds.length - 1; i++) {
        const cur = wayNodeIds[i];
        const nxt = wayNodeIds[i + 1];
        const na = ensureNode(cur.nid, cur.lat, cur.lon);
        const nb = ensureNode(nxt.nid, nxt.lat, nxt.lon);
        addEdge(na.id, nb.id, isSteps);
      }
    }

    // Visual path ribbon within diorama bounds
    if (ptsLocal.length >= 2 && hw !== 'motorway_link') {
      let kind = 'road-minor';
      let width = 4.2;
      if (isSteps) {
        kind = 'steps';
        width = 2.8;
      } else if (hw === 'footway' || hw === 'pedestrian' || hw === 'path') {
        kind = 'campus-walk';
        width = 2.6;
      } else if (hw === 'motorway' || hw === 'primary' || hw === 'secondary' || hw === 'tertiary') {
        kind = 'road-major';
        width = hw === 'motorway' ? 8.5 : 6.4;
      }
      paths.push({
        id: `path_${el.id}`,
        kind,
        name: el.tags.name,
        points: ptsLocal,
        width,
      });
    }
  }

  // Extract largest connected component to guarantee routability across campus + station
  const visited = new Set();
  const components = [];
  for (const id of Object.keys(nodes)) {
    if (visited.has(id)) continue;
    const queue = [id];
    visited.add(id);
    const comp = [];
    while (queue.length > 0) {
      const cur = queue.pop();
      comp.push(cur);
      for (const edge of adjacency[cur] ?? []) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    components.push(comp);
  }
  components.sort((a, b) => b.length - a.length);
  const mainComp = new Set(components[0] ?? []);
  const prunedNodes = {};
  const prunedAdj = {};
  let edgeCount = 0;
  for (const id of mainComp) {
    prunedNodes[id] = nodes[id];
    prunedAdj[id] = (adjacency[id] ?? []).filter((e) => mainComp.has(e.to));
    edgeCount += prunedAdj[id].length;
  }

  console.log(
    `Walk graph: ${Object.keys(nodes).length} raw nodes -> ${mainComp.size} main component nodes, ${edgeCount / 2} undirected edges (${components.length} total components).`,
  );

  return {
    walkGraph: { nodes: prunedNodes, adjacency: prunedAdj },
    paths,
  };
}

function findNearestWalkNodeId(walkGraph, x, z) {
  let bestId = null;
  let bestDistSq = Infinity;
  for (const [id, node] of Object.entries(walkGraph.nodes)) {
    const dSq = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestId = id;
    }
  }
  return bestId;
}

async function main() {
  const { SENRIYAMA_CONFIG } = await tsImport(
    '../src/data/campuses/senriyama/config.ts',
    import.meta.url,
  );
  const { SENRIYAMA_LANDMARKS } = await tsImport(
    '../src/data/campuses/senriyama/landmarks.ts',
    import.meta.url,
  );

  const osmPath = path.join(CACHE_RAW_DIR, 'osm-senriyama.json');
  const osmRaw = JSON.parse(await fs.readFile(osmPath, 'utf8'));
  const elements = osmRaw.elements;

  // Verify projection orientation: Kandai-mae station must be SW (x < 0, z > 0)
  const stationCheck = geoToLocal(34.77109, 135.506038, SENRIYAMA_CONFIG.origin);
  console.log(
    `Coordinate check - Kandai-mae Station local: x=${stationCheck.x.toFixed(1)}m, z=${stationCheck.z.toFixed(1)}m`,
  );
  if (!(stationCheck.x < 0 && stationCheck.z > 0)) {
    throw new Error('Projection coordinate check failed: station must be SW (x<0, z>0)');
  }

  const terrain = await buildTerrainGrid(SENRIYAMA_CONFIG);

  const nodeMap = new Map();
  const wayMap = new Map();
  for (const el of elements) {
    if (el.type === 'node') nodeMap.set(el.id, el);
    if (el.type === 'way') wayMap.set(el.id, el);
  }

  const wayToRing = (way) => {
    const pts = [];
    for (const nid of way?.nodes ?? []) {
      const nd = nodeMap.get(nid);
      if (!nd) continue;
      const { x, z } = geoToLocal(nd.lat, nd.lon, SENRIYAMA_CONFIG.origin);
      pts.push([x, z]);
    }
    return cleanRing(pts);
  };

  // University boundary polygons
  const universityPolys = [];
  for (const el of elements) {
    if (el.type === 'way' && el.tags?.amenity === 'university') {
      const ring = wayToRing(el);
      if (ring.length >= 3) universityPolys.push(ring);
    }
  }

  const { walkGraph, paths } = buildWalkGraphAndPaths(
    elements,
    terrain,
    SENRIYAMA_CONFIG,
  );

  // Collect relation outer ways so they aren't duplicated as standalone ways
  const relationMemberWayIds = new Set();
  const rawBuildings = [];

  for (const el of elements) {
    if (el.type === 'relation' && el.tags?.building && Array.isArray(el.members)) {
      const outers = [];
      const inners = [];
      for (const m of el.members) {
        if (m.type !== 'way') continue;
        relationMemberWayIds.add(m.ref);
        const w = wayMap.get(m.ref);
        if (!w) continue;
        const ring = wayToRing(w);
        if (ring.length < 3) continue;
        if (m.role === 'inner') inners.push(ring);
        else outers.push(ring);
      }
      if (outers.length > 0) {
        rawBuildings.push({
          osmId: `rel_${el.id}`,
          tags: el.tags,
          polygon: outers[0],
          holes: inners.length > 0 ? inners : undefined,
        });
      }
    }
  }

  for (const el of elements) {
    if (el.type !== 'way' || !el.tags?.building || relationMemberWayIds.has(el.id)) {
      continue;
    }
    const ring = wayToRing(el);
    if (ring.length < 3) continue;
    rawBuildings.push({
      osmId: `way_${el.id}`,
      tags: el.tags,
      polygon: ring,
    });
  }

  const { bounds, origin } = SENRIYAMA_CONFIG;
  const edgeMargin = 8;
  const insideDiorama = (x, z) =>
    x >= bounds.minX + edgeMargin &&
    x <= bounds.maxX - edgeMargin &&
    z >= bounds.minZ + edgeMargin &&
    z <= bounds.maxZ - edgeMargin;

  // Filter buildings inside diorama and >= 14 m^2
  const candidateBuildings = [];
  for (const rb of rawBuildings) {
    if (polygonArea(rb.polygon) < 14) continue;
    const centroid = polygonCentroid(rb.polygon);
    if (!insideDiorama(centroid.x, centroid.z)) continue;
    // Skip building footprint extending far outside diorama
    const anyFarOutside = rb.polygon.some(
      ([px, pz]) =>
        px < bounds.minX - 6 ||
        px > bounds.maxX + 6 ||
        pz < bounds.minZ - 6 ||
        pz > bounds.maxZ + 6,
    );
    if (anyFarOutside) continue;

    const geoCenter = localToGeo(centroid.x, centroid.z, origin);
    const inUnivPoly = universityPolys.some((poly) =>
      pointInPolygon(centroid.x, centroid.z, poly),
    );
    const isSchoolSouth =
      rb.tags.building === 'school' ||
      (geoCenter.lat < 34.7707 &&
        rb.tags.building !== 'university' &&
        !String(rb.tags.name ?? '').includes('関西大学'));

    const inCampus =
      (inUnivPoly ||
        rb.tags.building === 'university' ||
        rb.tags.operator === 'Kansai University') &&
      !isSchoolSouth;

    candidateBuildings.push({
      ...rb,
      centroid,
      inCampus,
    });
  }

  // Match landmarks to candidate buildings
  const landmarkMatches = new Map(); // osmId -> LandmarkMeta
  const usedOsmIds = new Set();
  let nameMatchedCount = 0;
  let proximityMatchedCount = 0;
  const unmatchedLandmarks = [];

  const polyLandmarks = SENRIYAMA_LANDMARKS.filter((lm) => !lm.isSpotOnly);
  const spotLandmarks = SENRIYAMA_LANDMARKS.filter((lm) => lm.isSpotOnly);

  for (const lm of polyLandmarks) {
    const lmLocal = geoToLocal(lm.approxCoord.lat, lm.approxCoord.lon, origin);
    let best = null;
    let bestDist = Infinity;

    for (const cb of candidateBuildings) {
      if (usedOsmIds.has(cb.osmId)) continue;
      const combinedName = `${cb.tags.name ?? ''} ${cb.tags['name:ja'] ?? ''} ${cb.tags['name:en'] ?? ''}`;
      if (!combinedName.trim()) continue;
      const matchesAlias = lm.osmNameAliases.some((alias) =>
        combinedName.includes(alias),
      );
      if (!matchesAlias) continue;
      const d = Math.hypot(cb.centroid.x - lmLocal.x, cb.centroid.z - lmLocal.z);
      if (d < 220 && d < bestDist) {
        best = cb;
        bestDist = d;
      }
    }

    if (best) {
      landmarkMatches.set(best.osmId, lm);
      usedOsmIds.add(best.osmId);
      nameMatchedCount++;
      continue;
    }

    // Proximity fallback
    for (const cb of candidateBuildings) {
      if (usedOsmIds.has(cb.osmId) || !cb.inCampus) continue;
      const d = Math.hypot(cb.centroid.x - lmLocal.x, cb.centroid.z - lmLocal.z);
      if (d < 35 && d < bestDist) {
        best = cb;
        bestDist = d;
      }
    }

    if (best) {
      landmarkMatches.set(best.osmId, lm);
      usedOsmIds.add(best.osmId);
      proximityMatchedCount++;
    } else {
      unmatchedLandmarks.push(lm.id);
    }
  }

  console.log(
    `Landmark matching: ${nameMatchedCount} by name, ${proximityMatchedCount} by proximity, ${unmatchedLandmarks.length} unmatched (${unmatchedLandmarks.join(', ') || 'none'}).`,
  );

  // Build final BuildingFeature array
  const buildings = [];
  let campusCount = 0;

  for (const cb of candidateBuildings) {
    const lm = landmarkMatches.get(cb.osmId);
    const inCampus = Boolean(lm) || cb.inCampus;
    if (inCampus) campusCount++;

    const rawName =
      lm?.name ??
      cb.tags.name ??
      cb.tags['name:ja'] ??
      cb.tags['name:en'] ??
      (inCampus ? '関西大学 施設棟' : '');

    const category = lm
      ? lm.category
      : inCampus
        ? inferCampusCategory(cb.tags, cb.centroid)
        : 'surrounding';

    const levels = parseLevels(cb.tags, lm?.defaultLevels ?? (inCampus ? 4 : 2));
    const height = computeBuildingHeight(cb.tags, levels, inCampus, cb.osmId);

    const groundY = Number(
      sampleElevation(terrain, cb.centroid.x, cb.centroid.z).toFixed(2),
    );
    let minGroundY = groundY;
    let maxGroundY = groundY;
    for (const [px, pz] of cb.polygon) {
      const gy = sampleElevation(terrain, px, pz);
      if (gy < minGroundY) minGroundY = gy;
      if (gy > maxGroundY) maxGroundY = gy;
    }
    minGroundY = Number(minGroundY.toFixed(2));
    maxGroundY = Number(maxGroundY.toFixed(2));

    const walkNodeId =
      lm || (inCampus && rawName)
        ? findNearestWalkNodeId(walkGraph, cb.centroid.x, cb.centroid.z)
        : null;

    buildings.push({
      id: lm ? lm.id : cb.osmId,
      osmId: cb.osmId,
      landmarkId: lm?.id,
      name: rawName,
      shortName: lm?.shortName ?? rawName,
      kana: lm?.kana ?? '',
      englishName: lm?.englishName ?? cb.tags['name:en'] ?? '',
      category,
      inCampus,
      faculties: lm?.faculties ?? [],
      facilityTags: lm?.facilityTags ?? [],
      keywords: lm?.keywords ?? (rawName ? [rawName] : []),
      description:
        lm?.description ??
        (inCampus
          ? `${rawName}（千里山キャンパス内施設）`
          : ''),
      architectNote: lm?.architectNote,
      sculptStyle: lm?.sculptStyle ?? 'standard',
      labelPriority: lm?.labelPriority ?? (inCampus && cb.tags.name ? 7 : 99),
      isQuickOrigin: lm?.isQuickOrigin ?? false,
      polygon: cb.polygon,
      holes: cb.holes,
      centroid: {
        x: Number(cb.centroid.x.toFixed(2)),
        z: Number(cb.centroid.z.toFixed(2)),
      },
      groundY,
      minGroundY,
      maxGroundY,
      height,
      levels,
      walkNodeId,
    });
  }

  // Add spot landmarks (station, gates, Yukyu-no-Niwa)
  for (const lm of spotLandmarks) {
    const loc = geoToLocal(lm.approxCoord.lat, lm.approxCoord.lon, origin);
    const walkLoc = lm.walkTargetCoord
      ? geoToLocal(lm.walkTargetCoord.lat, lm.walkTargetCoord.lon, origin)
      : loc;
    const groundY = Number(sampleElevation(terrain, loc.x, loc.z).toFixed(2));
    const r = lm.id === 'yukyu-garden' ? 10 : 4.5;
    const octagon = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      octagon.push([
        Number((loc.x + Math.cos(a) * r).toFixed(2)),
        Number((loc.z + Math.sin(a) * r).toFixed(2)),
      ]);
    }
    buildings.push({
      id: lm.id,
      landmarkId: lm.id,
      name: lm.name,
      shortName: lm.shortName,
      kana: lm.kana,
      englishName: lm.englishName,
      category: lm.category,
      inCampus: true,
      faculties: lm.faculties,
      facilityTags: lm.facilityTags,
      keywords: lm.keywords,
      description: lm.description,
      architectNote: lm.architectNote,
      sculptStyle: lm.sculptStyle ?? 'standard',
      labelPriority: lm.labelPriority,
      isSpotOnly: true,
      isQuickOrigin: lm.isQuickOrigin ?? false,
      polygon: octagon,
      centroid: { x: Number(loc.x.toFixed(2)), z: Number(loc.z.toFixed(2)) },
      groundY,
      minGroundY: groundY,
      maxGroundY: groundY,
      height: lm.id === 'main-gate' ? 5.2 : lm.id === 'kandaimae-station' ? 6.5 : 2.0,
      levels: lm.defaultLevels,
      walkNodeId: findNearestWalkNodeId(walkGraph, walkLoc.x, walkLoc.z),
    });
  }

  // Landcover extraction
  const landcover = [];
  for (const poly of universityPolys) {
    // Clip or keep campus base apron inside diorama
    const clipped = poly.map(([px, pz]) => [
      Number(Math.max(bounds.minX + 2, Math.min(bounds.maxX - 2, px)).toFixed(2)),
      Number(Math.max(bounds.minZ + 2, Math.min(bounds.maxZ - 2, pz)).toFixed(2)),
    ]);
    if (polygonArea(clipped) > 1000) {
      landcover.push({
        id: `campus_base_${landcover.length}`,
        kind: 'campus-ground',
        name: '千里山キャンパス敷地',
        polygon: clipped,
      });
    }
  }

  for (const el of elements) {
    if (el.type !== 'way' || !el.tags || el.tags.building) continue;
    const t = el.tags;
    let kind = null;
    if (t.natural === 'water') kind = 'water';
    else if (t.landuse === 'forest' || t.natural === 'wood' || t.natural === 'scrub') {
      kind = 'forest';
    } else if (
      t.leisure === 'pitch' ||
      t.leisure === 'track' ||
      t.leisure === 'sports_centre' ||
      t.landuse === 'recreation_ground'
    ) {
      kind = 'sports-pitch';
    } else if (
      t.landuse === 'grass' ||
      t.leisure === 'garden' ||
      t.leisure === 'park' ||
      t.leisure === 'playground' ||
      t.natural === 'grassland'
    ) {
      kind = 'lawn';
    }
    if (!kind) continue;
    const ring = wayToRing(el);
    if (ring.length < 3 || polygonArea(ring) < 35) continue;
    const c = polygonCentroid(ring);
    if (!insideDiorama(c.x, c.z)) continue;
    const clamped = ring.map(([px, pz]) => [
      Number(Math.max(bounds.minX + 2, Math.min(bounds.maxX - 2, px)).toFixed(2)),
      Number(Math.max(bounds.minZ + 2, Math.min(bounds.maxZ - 2, pz)).toFixed(2)),
    ]);
    landcover.push({
      id: `lc_${el.id}`,
      kind,
      name: t.name,
      polygon: clamped,
    });
  }

  // Transport (Hankyu Senri Line + Kandai-mae station)
  const railways = [];
  for (const el of elements) {
    if (el.type !== 'way' || el.tags?.railway !== 'rail' || !Array.isArray(el.nodes)) {
      continue;
    }
    const pts = [];
    for (const nid of el.nodes) {
      const nd = nodeMap.get(nid);
      if (!nd) continue;
      const { x, z } = geoToLocal(nd.lat, nd.lon, origin);
      if (
        x >= bounds.minX &&
        x <= bounds.maxX &&
        z >= bounds.minZ &&
        z <= bounds.maxZ
      ) {
        pts.push([Number(x.toFixed(2)), Number(z.toFixed(2))]);
      }
    }
    if (pts.length >= 2) {
      railways.push({
        id: `rail_${el.id}`,
        name: el.tags.name ?? '阪急電鉄千里線',
        points: pts,
      });
    }
  }

  const stations = [
    {
      id: 'kandaimae-station',
      name: '関大前駅',
      x: Number(stationCheck.x.toFixed(2)),
      z: Number(stationCheck.z.toFixed(2)),
      y: Number(sampleElevation(terrain, stationCheck.x, stationCheck.z).toFixed(2)),
      walkNodeId: findNearestWalkNodeId(walkGraph, stationCheck.x, stationCheck.z),
    },
  ];

  // Log elevation checkpoints
  const checkpoints = [
    ['関大前駅', 34.77109, 135.506038],
    ['正門', 34.773426, 135.509103],
    ['悠久の庭', 34.774469, 135.511151],
    ['第1学舎1号館', 34.776301, 135.510467],
  ];
  for (const [label, lat, lon] of checkpoints) {
    const p = geoToLocal(lat, lon, origin);
    const e = sampleElevation(terrain, p.x, p.z);
    console.log(`  Checkpoint [${label}]: x=${p.x.toFixed(1)}, z=${p.z.toFixed(1)}, elev=${e.toFixed(2)}m`);
  }

  const meta = {
    campusId: 'senriyama',
    generatedAt: new Date().toISOString(),
    origin,
    bounds,
    stats: {
      totalBuildings: buildings.length,
      campusBuildings: campusCount,
      matchedLandmarks: nameMatchedCount + proximityMatchedCount,
      walkNodes: Object.keys(walkGraph.nodes).length,
      walkEdges:
        Object.values(walkGraph.adjacency).reduce((s, arr) => s + arr.length, 0) / 2,
      minElevation: terrain.minElevation,
      maxElevation: terrain.maxElevation,
    },
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2)),
    fs.writeFile(path.join(OUT_DIR, 'terrain.json'), JSON.stringify(terrain)),
    fs.writeFile(path.join(OUT_DIR, 'buildings.json'), JSON.stringify(buildings)),
    fs.writeFile(path.join(OUT_DIR, 'landcover.json'), JSON.stringify(landcover)),
    fs.writeFile(path.join(OUT_DIR, 'paths.json'), JSON.stringify(paths)),
    fs.writeFile(path.join(OUT_DIR, 'walk-graph.json'), JSON.stringify(walkGraph)),
    fs.writeFile(
      path.join(OUT_DIR, 'transport.json'),
      JSON.stringify({ railways, stations }, null, 2),
    ),
  ]);

  console.log(
    `\nData build complete -> ${path.relative(ROOT_DIR, OUT_DIR)} (buildings=${buildings.length}, campus=${campusCount}, matched=${meta.stats.matchedLandmarks}, landcover=${landcover.length}, paths=${paths.length}, railways=${railways.length})`,
  );
}

main().catch((err) => {
  console.error('build-campus-data failed:', err);
  process.exit(1);
});
