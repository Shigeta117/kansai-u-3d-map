import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';
import { buildExpresswayData } from './lib/expressway-data.mjs';
import { buildGroundsData } from './lib/grounds-data.mjs';
import { buildStationFacilities } from './lib/station-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CACHE_RAW_DIR = path.join(ROOT_DIR, '.cache', 'raw');
const DEM_DIR = path.join(CACHE_RAW_DIR, 'gsi-dem');
const OUT_DIR = path.join(ROOT_DIR, 'public', 'data', 'senriyama');

const GRID_COLS = 129;
const GRID_ROWS = 129;

// OSM way IDs representing roofed walkway structures rather than solid buildings
const EXCLUDED_CANOPY_BUILDING_IDS = new Set([
  624590002,
  1100978545,
  1493876596,
]);

// 建物の箱にせず、GroundsBuilder がグラウンドの一部として描く OSM の建物（千里山中央グラウンドの観客席）
const GROUND_STRUCTURE_BUILDING_IDS = new Set([805366951]);
// 取り壊された建物（OSM にはまだ残っている）。輪郭を描かず、名前・検索・経路の行き先からも外す
// - 624589992: 誠之館3号館（別棟）。誠之館の建て替えで取り壊し済み（持ち主の現地確認 2026-11-24。docs/DATA_SOURCES.md 5 節）
const DEMOLISHED_BUILDING_IDS = new Set([624589992]);

// 公式の地図（関西大学 広報課 CAMPUSMAP、2023 年 4 月）の番号つきの一覧で名前を確かめた建物（OSM の osmId → 名前など）。
// OSM の輪郭と地図のイラストの位置・形が合う物だけ（突き合わせの記録は docs/DATA_SOURCES.md 5 節）。
// 目印（landmarks.ts）に一致した建物は目印の名前が優先する。keywords は名前に足す検索語（OSM の名前など）
// - inCampus: 地図に番号つきで載る関連施設（一中・一高・秀麗館・秀麗寮）を、キャンパスの建物として扱う（ラベル・検索）
// - levels: 階数の推定（OSM に無く、既定の 4 階では明らかに高すぎる物だけ）
// - heightM: 高さ（m）。階数からの推定（1 階 3.8m）では写真と合わない小さな建物だけ（levels より優先）
const OFFICIAL_MAP_BUILDINGS = new Map([
  // 2-1: 第2学舎1号館は A棟・B棟。B棟は A棟（円い天窓の棟）の北東の端に付く箱
  ['way_423067212', { name: '第2学舎 1号館 B棟', keywords: ['第2学舎1号館', 'B棟'] }],
  // 実-1〜6: 第4学舎第1〜6実験棟（OSM の名前は「第N実験棟」）
  ['way_423067247', { name: '第4学舎 第1実験棟', keywords: ['第1実験棟', '実験棟'] }],
  ['way_423067250', { name: '第4学舎 第2実験棟', keywords: ['第2実験棟', '実験棟'] }],
  ['way_423067248', { name: '第4学舎 第3実験棟', keywords: ['第3実験棟', '実験棟'] }],
  ['way_423067249', { name: '第4学舎 第4実験棟', keywords: ['第4実験棟', '実験棟'] }],
  ['way_423067251', { name: '第4学舎 第5実験棟', keywords: ['第5実験棟', '実験棟'] }],
  ['way_423067254', { name: '第4学舎 第6実験棟', keywords: ['第6実験棟', '実験棟'] }],
  // 24: 弓道場。OSM は sport=archery の名前の無い建物（芝の矢道を囲む L 字の屋根）。地図・空中写真とも低い屋根なので平屋（推定）
  ['way_490258123', { name: '弓道場', keywords: ['弓道', 'Kyudo Range'], levels: 1 }],
  // 26: 誠之館の群（4 つの箱と茶室）。KAN-CAN! の誠之館の鳥瞰図（公開）の札と輪郭を突き合わせて名前を決めた（2026-11-24。
  // docs/DATA_SOURCES.md 5 節）。OSM の名前は 2 号館と 3 号館が入れ替わり、2 棟は「関西大学 施設棟」のままだった
  // - 3号館（新館）= 最も東の南西に開くコの字。3号館（旧館）= 2号館の北西に平行。3号館（別棟、way 624589992）= 6号館（有鄰館）の南東。
  //   別棟は取り壊し済みなので DEMOLISHED_BUILDING_IDS で外す（2026-11-24）
  // - 2号館 = 最も南東の長い棟（約 61m）。千里庵 = 3号館和室（茶室）。図では平屋の小さな建物なので levels 1（高さは推定）
  // - 関西大学共済会事務局: CAMPUSMAP の 26 の番号が載るのは OSM の「誠之館　2号館旧館」（way 624589997）。
  //   どの館に事務局があるかは資料で確かめられていないので、番号が載る輪郭（今の 3号館（旧館））に付けたまま。要確認
  ['way_423067245', { name: '誠之館3号館（新館）', keywords: ['誠之館3号館', '誠之館3号館新館', '3号館新館'] }],
  ['way_624589997', { name: '誠之館3号館（旧館）', keywords: ['誠之館3号館', '誠之館3号館旧館', '3号館旧館', '誠之館2号館旧館', '関西大学共済会事務局', '関西大学共済会'] }],
  ['way_624589994', { name: '誠之館2号館', keywords: ['誠之館2号館'] }],
  ['way_819790904', { name: '千里庵（誠之館3号館和室）', keywords: ['千里庵', '誠之館3号館和室', '3号館和室', '茶室'], levels: 1 }],
  // 第4学舎2号館の研究棟別館（KAN-CAN! ⑤）。OSM は名前の無い building=university で、2号館の中庭に建つ別の輪郭
  // （docs/DATA_SOURCES.md 5 節）。部屋の一覧が B1F〜1F だけで、鳥瞰イラストでも中庭の低い別棟なので levels 1（地上 1 階）。
  // 高さ 5.2m は levels 1 から出る推定の値（周りの 2号館の 1 階ぶん程度）
  ['way_624663829', { name: '第4学舎2号館 研究棟別館', keywords: ['研究棟別館', '2号館別館'], levels: 1 }],
  // 34: 高松塚古墳壁画再現展示室。OSM は名前の無い building=university（「関西大学 施設棟」と 4 階の高さで出ていた）。
  // あすかの庭の南東の角の、簡文館の北の翼の西の小さな輪郭。持ち主の写真（2026-11-24、IMG_3385・3386・3388）で、
  // ガラスの箱にアーチの屋根を載せた平屋（扉とアーチは西の面）。高さ 3.4m はアーチの頂（写真の扉の取っ手の高さから
  // 割り出した推定）。形は専用モデル（scene/heroes/takamatsuzuka.ts）が描く（docs/DATA_SOURCES.md 5 節）
  ['way_819790896', { name: '高松塚古墳壁画再現展示室', keywords: ['高松塚', '壁画', '再現展示室'], levels: 1, heightM: 3.4 }],
  // あすかの庭の南西の、道の角の小さな輪郭（OSM は名前の無い building=university）。持ち主の写真（2026-11-24、
  // IMG_3388・3389）で、赤い瓦の切妻屋根の平屋のトイレ（車いすの印あり）。キャンパスに独立したトイレの建物は
  // ほかに無いので、近くの目印（あすかの庭）を名前に添える。高さ 4.0m は平屋の瓦屋根の棟の高さの推定
  ['way_755790029', { name: 'あすかの庭のトイレ', keywords: ['トイレ', 'お手洗い', '化粧室', 'WC'], levels: 1, heightM: 4.0 }],
  // 39〜41・19: 名前は OSM のままで地図と同じ
  // 中学校・高等学校・幼稚園の施設は名称だけを出す（nameOnly。持ち主の決め、2026-11-20）
  ['way_497645752', { name: '関西大学第一高等学校', keywords: ['一高', '関大一高'], inCampus: true, nameOnly: true }],
  ['way_497645756', { name: '関西大学第一中学校', keywords: ['一中', '関大一中'], inCampus: true, nameOnly: true }],
  ['way_497645754', { name: '秀麗館', keywords: [], inCampus: true, nameOnly: true }],
  ['way_497645761', { name: '関西大学幼稚園', keywords: [], inCampus: true, nameOnly: true }],
  ['rel_10704520', { name: '学生国際交流館・秀麗寮', keywords: ['秀麗寮', '留学生', '寮'], inCampus: true }],
]);

// OSM way IDs forming the Shurei Bridge / Area 3 elevated pedestrian deck
// 第3学舎〜新関西大学会館〜法文坂の高架デッキ（OSM の bridge=yes の歩道）
const SHUREI_BRIDGE_WAY_IDS = new Set([423060539, 423060540, 423060541]);
// 「秀麗橋」は新関西大学会館の南棟と北棟を結ぶ、正門の上の連絡路の名前（持ち主の確認 2026-11-19）。
// デッキのうち正門の上をまたぐのは way 423060541（南棟〜北棟〜法文坂）。423060539 は第3学舎側、423060540 は南棟側のデッキ
const SHUREI_BRIDGE_PROPER_WAY_ID = 423060541;
const MINOR_BRIDGE_WAY_IDS = new Set([490790149, 490793070, 490942384]);

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

// 短い橋でも地面に沿った帯で描く車道（歩道の橋は BridgeBuilder などが描くので含めない）
const SHORT_BRIDGE_ROAD_HIGHWAYS = new Set([
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'service',
]);

// Ordered OSM ways along the New Access Road (West Gate -> Area 3)
const NEW_ACCESS_WAY_IDS = [
  1259556101,
  1100978549,
  482027185,
  1100978547,
  923172460,
  1493876602,
  923172458, // conveying=yes escalator
  1493876595,
  1493876603,
  1259556104,
];

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
  if (x === 8388608) return null;
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
        }
      }
      raw[row * GRID_COLS + col] = elev;
    }
  }

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
    `Terrain built (${GRID_COLS}x${GRID_ROWS}): DEM5A=${dem5aHits}, elevation=${minElevation.toFixed(2)}m .. ${maxElevation.toFixed(2)}m`,
  );

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

function buildStructuresData(nodeMap, wayMap, terrain, origin) {
  const bridges = [];
  const bridgeNodeElevOverrides = new Map();

  // Nodes belonging to non-bridge ground walkways (excluding steps/escalators that descend from elevated decks)
  const groundWalkWayNodes = new Set();
  for (const w of wayMap.values()) {
    const hw = w.tags?.highway;
    if (!hw || !WALKABLE_HIGHWAYS.has(hw) || w.tags.foot === 'no') continue;
    const isBridgeWay =
      w.tags.bridge === 'yes' ||
      SHUREI_BRIDGE_WAY_IDS.has(w.id) ||
      MINOR_BRIDGE_WAY_IDS.has(w.id);
    if (isBridgeWay) continue;
    const isEscalator = w.tags.conveying === 'yes';
    const isSteps = hw === 'steps' && !isEscalator;
    if (isSteps || isEscalator) continue;
    for (const nid of w.nodes ?? []) {
      groundWalkWayNodes.add(nid);
    }
  }

  // Compute deck elevations for Shurei Bridge (Area 3 -> New Kandaikaikan -> Hobunzaka)
  // West abutment: node 4227729266 ([-188, 188])
  // North abutment: node 4227729267 ([-107, 48])
  const westNode = nodeMap.get(4227729266);
  const northNode = nodeMap.get(4227729267);
  const westLoc = westNode ? geoToLocal(westNode.lat, westNode.lon, origin) : { x: -188, z: 188 };
  const northLoc = northNode ? geoToLocal(northNode.lat, northNode.lon, origin) : { x: -107, z: 48 };
  const westGround = sampleElevation(terrain, westLoc.x, westLoc.z);
  const northGround = sampleElevation(terrain, northLoc.x, northLoc.z);
  const zSpan = westLoc.z - northLoc.z;

  // 第3学舎連絡デッキの幅は推定: 持ち主の 2023 年の映像（IMG_6436_018）で、壁の内側の床の幅がカメラの高さの約 2.8 倍
  // （カメラの高さ 1.4〜1.6m → 3.9〜4.5m、壁の高さ 1.9m との比からは約 4.1m）。内側 4.1m ＋ 両側の壁の厚み 0.25m
  const shureiDefs = [
    { wayId: 423060539, id: 'bridge-shurei-west', name: '第3学舎連絡デッキ', width: 4.6 },
    { wayId: 423060540, id: 'bridge-shurei-south', name: '新関西大学会館 南棟デッキ', width: 3.6 },
    { wayId: 423060541, id: 'bridge-shurei-north', name: '秀麗橋（南棟〜北棟・法文坂方面）', width: 3.6 },
  ];

  for (const def of shureiDefs) {
    const w = wayMap.get(def.wayId);
    if (!w) continue;
    const nodeIds = w.nodes ?? [];
    const pts = [];
    for (let i = 0; i < nodeIds.length; i++) {
      const nid = nodeIds[i];
      const nd = nodeMap.get(nid);
      if (!nd) continue;
      const { x, z } = geoToLocal(nd.lat, nd.lon, origin);
      const ground = sampleElevation(terrain, x, z);
      const isEnd = i === 0 || i === nodeIds.length - 1;
      if (isEnd && groundWalkWayNodes.has(nid)) {
        // Ground-connected bridge abutment uses ground elevation directly (no override)
        pts.push([Number(x.toFixed(2)), Number(ground.toFixed(2)), Number(z.toFixed(2))]);
        continue;
      }
      // Interior deck node: max of linear line between both abutments and >= 4.4m above ground
      const tNorth =
        zSpan !== 0 ? Math.max(0, Math.min(1, (westLoc.z - z) / zSpan)) : 0;
      const lineElev = westGround * (1 - tNorth) + northGround * tNorth;
      const deckY = Number(Math.max(lineElev, ground + 4.4).toFixed(2));
      bridgeNodeElevOverrides.set(nid, deckY);
      pts.push([Number(x.toFixed(2)), deckY, Number(z.toFixed(2))]);
    }
    if (pts.length >= 2) {
      bridges.push({
        id: def.id,
        name: def.name,
        kind: 'skybridge',
        points: pts,
        width: def.width,
      });
    }
  }

  for (const wid of MINOR_BRIDGE_WAY_IDS) {
    const w = wayMap.get(wid);
    if (!w) continue;
    const nodeIds = w.nodes ?? [];
    const pts = [];
    for (let i = 0; i < nodeIds.length; i++) {
      const nid = nodeIds[i];
      const nd = nodeMap.get(nid);
      if (!nd) continue;
      const { x, z } = geoToLocal(nd.lat, nd.lon, origin);
      // Preserve elevation if node already belongs to Shurei Bridge
      const existingY = bridgeNodeElevOverrides.get(nid);
      if (existingY !== undefined) {
        pts.push([Number(x.toFixed(2)), existingY, Number(z.toFixed(2))]);
        continue;
      }
      const ground = sampleElevation(terrain, x, z);
      const isEnd = i === 0 || i === nodeIds.length - 1;
      if (isEnd && groundWalkWayNodes.has(nid)) {
        pts.push([Number(x.toFixed(2)), Number(ground.toFixed(2)), Number(z.toFixed(2))]);
        continue;
      }
      const y = Number((ground + 1.6).toFixed(2));
      bridgeNodeElevOverrides.set(nid, y);
      pts.push([Number(x.toFixed(2)), y, Number(z.toFixed(2))]);
    }
    if (pts.length >= 2) {
      bridges.push({
        id: `bridge-${wid}`,
        name: '構内連絡デッキ',
        kind: 'overpass',
        points: pts,
        width: 3.0,
      });
    }
  }

  // Build New Access Road canopy spine
  const accessSpine = [];
  const escalatorRange = [];
  for (const wid of NEW_ACCESS_WAY_IDS) {
    const w = wayMap.get(wid);
    if (!w) continue;
    const isEsc = w.tags?.conveying === 'yes';
    for (const nid of w.nodes ?? []) {
      const nd = nodeMap.get(nid);
      if (!nd) continue;
      const { x, z } = geoToLocal(nd.lat, nd.lon, origin);
      const y = Number(sampleElevation(terrain, x, z).toFixed(2));
      const pt = [Number(x.toFixed(2)), y, Number(z.toFixed(2))];
      const prev = accessSpine[accessSpine.length - 1];
      if (!prev || Math.hypot(pt[0] - prev[0], pt[2] - prev[2]) > 0.8) {
        accessSpine.push(pt);
      }
      if (isEsc) {
        escalatorRange.push(pt);
      }
    }
  }

  const accessCanopies =
    accessSpine.length >= 2
      ? [
          {
            id: 'access-west-canopy',
            name: '新アクセス道（西門〜第3学舎屋根付き歩道・エスカレーター）',
            spine: accessSpine,
            escalatorRange: escalatorRange.length >= 2 ? escalatorRange : undefined,
            width: 5.2,
          },
        ]
      : [];

  // 名神高速の坑口は buildExpresswayData（scripts/lib/expressway-data.mjs）が OSM のトンネルの端から作る
  const tunnelPortals = [];

  return {
    structures: { bridges, accessCanopies, tunnelPortals },
    bridgeNodeElevOverrides,
  };
}

function buildWalkGraphAndPaths(
  elements,
  terrain,
  config,
  bridgeNodeElevOverrides,
) {
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

  const nodes = {};
  const adjacency = {};
  const paths = [];
  const bridgeNodeIds = new Set();
  const shureiNodeIds = new Set();

  const ensureNode = (osmNodeId, lat, lon) => {
    const id = `n_${osmNodeId}`;
    if (!nodes[id]) {
      const { x, z } = geoToLocal(lat, lon, origin);
      const overrideY = bridgeNodeElevOverrides.get(osmNodeId);
      const y = Number(
        (overrideY !== undefined ? overrideY : sampleElevation(terrain, x, z)).toFixed(2),
      );
      if (overrideY !== undefined) {
        bridgeNodeIds.add(id);
      }
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

  const addEdge = (aId, bId, flags) => {
    const a = nodes[aId];
    const b = nodes[bId];
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.2) return;
    const deltaAB = b.y - a.y;
    const shureiFlag = flags.isShureiBridge ? { isShureiBridge: true } : {};
    const rushFlag = flags.rushHourUpOnly ? { rushHourUpOnly: true } : {};
    adjacency[aId].push({
      to: bId,
      dist: Number(dist.toFixed(2)),
      deltaY: Number(deltaAB.toFixed(2)),
      slope: Number((deltaAB / dist).toFixed(4)),
      isSteps: flags.isSteps,
      isBridge: flags.isBridge,
      ...shureiFlag,
      isEscalator: flags.isEscalator,
      ...rushFlag,
    });
    adjacency[bId].push({
      to: aId,
      dist: Number(dist.toFixed(2)),
      deltaY: Number((-deltaAB).toFixed(2)),
      slope: Number((-deltaAB / dist).toFixed(4)),
      isSteps: flags.isSteps,
      isBridge: flags.isBridge,
      ...shureiFlag,
      isEscalator: flags.isEscalator,
      ...rushFlag,
    });
  };

  for (const el of elements) {
    if (el.type !== 'way' || !el.tags?.highway || !Array.isArray(el.nodes)) continue;
    const hw = el.tags.highway;
    const isEscalator = el.tags.conveying === 'yes';
    const isSteps = hw === 'steps' && !isEscalator;
    const isShureiBridge = el.id === SHUREI_BRIDGE_PROPER_WAY_ID;
    const isBridge =
      el.tags.bridge === 'yes' ||
      SHUREI_BRIDGE_WAY_IDS.has(el.id) ||
      MINOR_BRIDGE_WAY_IDS.has(el.id);
    const isTunnel = el.tags.tunnel === 'yes';
    const isWalkable = WALKABLE_HIGHWAYS.has(hw) && el.tags.foot !== 'no';

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
        if (isShureiBridge) {
          shureiNodeIds.add(na.id);
          shureiNodeIds.add(nb.id);
        }
        addEdge(na.id, nb.id, {
          isSteps,
          isBridge,
          isShureiBridge,
          isEscalator,
          // 新アクセス路のエスカレーター 2 台は授業日の 8:00〜11:00 に全機上りになる（大学のバリアフリーマップの冊子、2019〜2021 年。今も続くことは持ち主の確認 2026-11-20）。
          // OSM では 1 本の way（923172458）に載っている。ほかのエスカレーターの運用は未確認
          rushHourUpOnly: isEscalator && NEW_ACCESS_WAY_IDS.includes(el.id),
        });
      }
    }

    // 車道の短い橋（bridge=yes で長さ 15m 未満。水路などをまたぐ暗渠の上）は地面に沿った帯で描く。
    // 描かないと道の帯が数 m 途切れる（関大前駅の西の吹田箕面線など）
    let wayLength = 0;
    for (let i = 1; i < ptsLocal.length; i++) {
      wayLength += Math.hypot(ptsLocal[i][0] - ptsLocal[i - 1][0], ptsLocal[i][1] - ptsLocal[i - 1][1]);
    }
    const isShortRoadBridge =
      el.tags.bridge === 'yes' && SHORT_BRIDGE_ROAD_HIGHWAYS.has(hw) && wayLength < 15;

    // Do not draw surface road ribbons for tunnels or elevated bridges (drawn by BridgeBuilder).
    // 名神高速（motorway）は高架・地上・坑口を ExpresswayBuilder が structures.expressways から描く
    if (
      ptsLocal.length >= 2 &&
      hw !== 'motorway' &&
      hw !== 'motorway_link' &&
      !isTunnel &&
      (!isBridge || isShortRoadBridge)
    ) {
      let kind = 'road-minor';
      let width = 4.2;
      if (isSteps || isEscalator) {
        kind = 'steps';
        width = 2.8;
      } else if (hw === 'footway' || hw === 'pedestrian' || hw === 'path') {
        kind = 'campus-walk';
        width = 2.6;
      } else if (hw === 'primary' || hw === 'secondary' || hw === 'tertiary') {
        kind = 'road-major';
        width = 6.4;
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

  // Bridge node micro-gap snapping (OSM Shurei Bridge segments have 2m/3m unmerged node gaps)
  const shureiNodes = [...bridgeNodeIds]
    .map((id) => nodes[id])
    .filter((n) => Boolean(n));
  let bridgeSnaps = 0;
  for (let i = 0; i < shureiNodes.length; i++) {
    for (let j = i + 1; j < shureiNodes.length; j++) {
      const a = shureiNodes[i];
      const b = shureiNodes[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 0.2 && d <= 4.5) {
        const already = (adjacency[a.id] ?? []).some((e) => e.to === b.id);
        if (!already) {
          const isShureiSnap = shureiNodeIds.has(a.id) && shureiNodeIds.has(b.id);
          addEdge(a.id, b.id, {
            isSteps: false,
            isBridge: true,
            isShureiBridge: isShureiSnap,
            isEscalator: false,
          });
          bridgeSnaps++;
        }
      }
    }
  }
  console.log(`Bridge micro-gap snaps applied: ${bridgeSnaps}`);

  // Main connected component
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

  // Step-free connected component (edges with !isSteps && !isEscalator)
  const sfVisited = new Set();
  const sfComponents = [];
  for (const id of Object.keys(prunedNodes)) {
    if (sfVisited.has(id)) continue;
    const queue = [id];
    sfVisited.add(id);
    const comp = [];
    while (queue.length > 0) {
      const cur = queue.pop();
      comp.push(cur);
      for (const edge of prunedAdj[cur] ?? []) {
        if (!edge.isSteps && !edge.isEscalator && !sfVisited.has(edge.to)) {
          sfVisited.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    sfComponents.push(comp);
  }
  sfComponents.sort((a, b) => b.length - a.length);
  const stepFreeComp = new Set(sfComponents[0] ?? []);

  console.log(
    `Walk graph: ${mainComp.size} main nodes, ${edgeCount / 2} edges; step-free main component: ${stepFreeComp.size} nodes.`,
  );

  return {
    walkGraph: { nodes: prunedNodes, adjacency: prunedAdj },
    stepFreeComp,
    paths,
  };
}

function findNearestNodeInSet(walkGraph, x, z, allowedSet = null) {
  let bestId = null;
  let bestDistSq = Infinity;
  for (const [id, node] of Object.entries(walkGraph.nodes)) {
    if (allowedSet && !allowedSet.has(id)) continue;
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
    '../packages/core/src/data/campuses/senriyama/config.ts',
    import.meta.url,
  );
  const { SENRIYAMA_LANDMARKS } = await tsImport(
    '../packages/core/src/data/campuses/senriyama/landmarks.ts',
    import.meta.url,
  );
  const { KANDAIMAE_STATION_SPEC } = await tsImport(
    '../packages/core/src/data/campuses/senriyama/station.ts',
    import.meta.url,
  );
  const {
    MEISHIN_SECTIONS,
    MEISHIN_PORTALS,
    EXPRESSWAY_DIMENSIONS,
    EXPRESSWAY_PROFILE_WINDOWS,
  } = await tsImport('../packages/core/src/data/campuses/senriyama/expressway.ts', import.meta.url);
  const expresswayMath = await tsImport('../packages/core/src/domain/expressway.ts', import.meta.url);
  const { SENRIYAMA_GROUNDS_SPEC } = await tsImport(
    '../packages/core/src/data/campuses/senriyama/grounds.ts',
    import.meta.url,
  );
  // 駅舎は TransportBuilder（StationBuilder）が駅の一部として描くので、周辺の建物から外す
  const stationBuildingWayIds = new Set(KANDAIMAE_STATION_SPEC.buildings.map((b) => b.osmWayId));

  const osmPath = path.join(CACHE_RAW_DIR, 'osm-senriyama.json');
  const osmRaw = JSON.parse(await fs.readFile(osmPath, 'utf8'));
  const elements = osmRaw.elements;

  const stationCheck = geoToLocal(34.77109, 135.506038, SENRIYAMA_CONFIG.origin);
  if (!(stationCheck.x < 0 && stationCheck.z > 0)) {
    throw new Error('Projection coordinate check failed');
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

  const universityPolys = [];
  for (const el of elements) {
    if (el.type === 'way' && el.tags?.amenity === 'university') {
      const ring = wayToRing(el);
      if (ring.length >= 3) universityPolys.push(ring);
    }
  }

  const { structures, bridgeNodeElevOverrides } = buildStructuresData(
    nodeMap,
    wayMap,
    terrain,
    SENRIYAMA_CONFIG.origin,
  );

  const { walkGraph, stepFreeComp, paths } = buildWalkGraphAndPaths(
    elements,
    terrain,
    SENRIYAMA_CONFIG,
    bridgeNodeElevOverrides,
  );

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
    if (
      EXCLUDED_CANOPY_BUILDING_IDS.has(el.id) ||
      GROUND_STRUCTURE_BUILDING_IDS.has(el.id) ||
      DEMOLISHED_BUILDING_IDS.has(el.id) ||
      stationBuildingWayIds.has(el.id) ||
      el.tags.building === 'roof'
    ) {
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

  const candidateBuildings = [];
  for (const rb of rawBuildings) {
    if (polygonArea(rb.polygon) < 14) continue;
    const centroid = polygonCentroid(rb.polygon);
    if (!insideDiorama(centroid.x, centroid.z)) continue;
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

    const osmInCampus =
      (inUnivPoly ||
        rb.tags.building === 'university' ||
        rb.tags.operator === 'Kansai University') &&
      !isSchoolSouth;
    // 公式の地図でキャンパスの建物として扱う物も、高さは OSM から決めた扱いのまま（形を変えない）
    const official = OFFICIAL_MAP_BUILDINGS.get(rb.osmId);

    candidateBuildings.push({
      ...rb,
      centroid,
      inCampus: official?.inCampus ?? osmInCampus,
      osmInCampus,
      official,
    });
  }

  const landmarkMatches = new Map();
  const usedOsmIds = new Set();
  let nameMatchedCount = 0;
  let proximityMatchedCount = 0;

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
    }
  }

  const buildings = [];
  let campusCount = 0;

  for (const cb of candidateBuildings) {
    const lm = landmarkMatches.get(cb.osmId);
    const inCampus = Boolean(lm) || cb.inCampus;
    if (inCampus) campusCount++;

    const rawName =
      lm?.name ??
      cb.official?.name ??
      cb.tags.name ??
      cb.tags['name:ja'] ??
      cb.tags['name:en'] ??
      (inCampus ? '関西大学 施設棟' : '');

    const category = lm
      ? lm.category
      : inCampus
        ? inferCampusCategory(cb.tags, cb.centroid)
        : 'surrounding';

    const shapeInCampus = Boolean(lm) || cb.osmInCampus;
    const levels = cb.official?.levels ?? parseLevels(cb.tags, lm?.defaultLevels ?? (shapeInCampus ? 4 : 2));
    const height = cb.official?.heightM ?? computeBuildingHeight(cb.tags, levels, shapeInCampus, cb.osmId);

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

    const walkAnchor = lm?.walkTargetCoord
      ? geoToLocal(lm.walkTargetCoord.lat, lm.walkTargetCoord.lon, origin)
      : cb.centroid;
    const needWalk = Boolean(lm) || (inCampus && rawName);
    const walkNodeId = needWalk
      ? findNearestNodeInSet(walkGraph, walkAnchor.x, walkAnchor.z)
      : null;
    const accessibleWalkNodeId = needWalk
      ? findNearestNodeInSet(walkGraph, walkAnchor.x, walkAnchor.z, stepFreeComp)
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
      keywords:
        lm?.keywords ??
        (cb.official ? [rawName, ...cb.official.keywords] : rawName ? [rawName] : []),
      description: cb.official?.nameOnly
        ? ''
        : lm?.description ?? (inCampus ? `${rawName}（千里山キャンパス内施設）` : ''),
      ...(cb.official?.nameOnly ? { infoPolicy: 'name-only' } : {}),
      architectNote: lm?.architectNote,
      sculptStyle: lm?.sculptStyle ?? 'standard',
      labelPriority: lm?.labelPriority ?? (inCampus && (cb.tags.name || cb.official) ? 7 : 99),
      isQuickOrigin: lm?.isQuickOrigin ?? false,
      polygon: cb.polygon,
      holes: cb.holes,
      centroid: {
        x: Number(cb.centroid.x.toFixed(2)),
        z: Number(cb.centroid.z.toFixed(2)),
      },
      groundY,
      minGroundY: Number(minGroundY.toFixed(2)),
      maxGroundY: Number(maxGroundY.toFixed(2)),
      height,
      levels,
      walkNodeId,
      accessibleWalkNodeId,
    });
  }

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
    const walkNodeId = findNearestNodeInSet(walkGraph, walkLoc.x, walkLoc.z);
    const accessibleWalkNodeId = findNearestNodeInSet(
      walkGraph,
      walkLoc.x,
      walkLoc.z,
      stepFreeComp,
    );

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
      height:
        lm.id === 'main-gate'
          ? 5.2
          : lm.id === 'west-gate'
            ? 4.6
            : lm.id === 'kandaimae-station'
              ? 6.5
              : 2.0,
      levels: lm.defaultLevels,
      walkNodeId,
      accessibleWalkNodeId,
    });
  }

  // Verify step-free distances for landmarks (from walkTargetCoord if provided)
  const landmarkMetaById = new Map(SENRIYAMA_LANDMARKS.map((lm) => [lm.id, lm]));
  for (const b of buildings) {
    if (!b.landmarkId || !b.accessibleWalkNodeId) continue;
    const lm = landmarkMetaById.get(b.landmarkId);
    const anchor = lm?.walkTargetCoord
      ? geoToLocal(lm.walkTargetCoord.lat, lm.walkTargetCoord.lon, origin)
      : b.centroid;
    const sfNode = walkGraph.nodes[b.accessibleWalkNodeId];
    if (sfNode) {
      const dist = Math.hypot(sfNode.x - anchor.x, sfNode.z - anchor.z);
      if (dist > 52) {
        console.warn(`  [WARN] Landmark ${b.id} step-free node is ${dist.toFixed(1)}m away`);
      }
    }
  }

  const landcover = [];
  for (const poly of universityPolys) {
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
      t.landuse === 'recreation_ground'
    ) {
      // leisure=sports_centre（千里山中央グラウンドの敷地の全体。観客席・斜面・木を含む）は塗らない。
      // トラックとフィールドは GroundsBuilder が structures.grounds から描く
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

  // 駅のホーム・駅舎・上屋（OSM の輪郭）
  const stationFacilities = [buildStationFacilities(KANDAIMAE_STATION_SPEC, (wayId) => wayToRing(wayMap.get(wayId)))];

  // 名神高速の車道・橋脚・坑口（路面の高さは DEM から推定）
  const expressway = buildExpresswayData({
    nodeMap,
    wayMap,
    elements,
    terrain,
    sampleElevation: (x, z) => sampleElevation(terrain, x, z),
    toLocal: (lat, lon) => geoToLocal(lat, lon, origin),
    diorama: SENRIYAMA_CONFIG.diorama,
    buildingPolygons: [
      ...rawBuildings.map((rb) => rb.polygon),
      ...stationFacilities.flatMap((f) => f.buildings.map((b) => b.polygon)),
    ],
    platformPolygons: stationFacilities.flatMap((f) => f.platforms.map((p) => p.polygon)),
    spec: {
      sections: MEISHIN_SECTIONS,
      portals: MEISHIN_PORTALS,
      dims: EXPRESSWAY_DIMENSIONS,
      windows: EXPRESSWAY_PROFILE_WINDOWS,
    },
    math: expresswayMath,
  });
  // グラウンド（陸上のトラック・直線の走路・野球場・テニスコート）。寸法・線の位置は推定
  structures.grounds = buildGroundsData({
    spec: SENRIYAMA_GROUNDS_SPEC,
    ringOf: (wayId) => wayToRing(wayMap.get(wayId)),
    sampleElevation: (x, z) => sampleElevation(terrain, x, z),
  });
  console.log(
    `Grounds: ${structures.grounds.map((g) => `${g.id}(${g.kind}, ${g.elevation}m)`).join(', ')}`,
  );

  structures.tunnelPortals = expressway.portals;
  structures.expressways = expressway.carriageways;
  structures.expresswayPiers = expressway.piers;
  console.log(
    `Expressway: carriageways=${expressway.carriageways.length}, piers=${expressway.piers.length}, portals=${expressway.portals.length}, clearance=${JSON.stringify(expressway.report.clearance)}`,
  );

  const stations = [
    {
      id: 'kandaimae-station',
      name: '関大前駅',
      x: Number(stationCheck.x.toFixed(2)),
      z: Number(stationCheck.z.toFixed(2)),
      y: Number(sampleElevation(terrain, stationCheck.x, stationCheck.z).toFixed(2)),
      walkNodeId: findNearestNodeInSet(walkGraph, -402, 265),
    },
  ];

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
      accessibleWalkNodes: stepFreeComp.size,
      walkEdges:
        Object.values(walkGraph.adjacency).reduce((s, arr) => s + arr.length, 0) / 2,
      bridges: structures.bridges.length,
      accessCanopies: structures.accessCanopies.length,
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
    fs.writeFile(
      path.join(OUT_DIR, 'structures.json'),
      JSON.stringify(structures, null, 2),
    ),
    fs.writeFile(path.join(OUT_DIR, 'walk-graph.json'), JSON.stringify(walkGraph)),
    fs.writeFile(
      path.join(OUT_DIR, 'transport.json'),
      JSON.stringify({ railways, stations, stationFacilities }, null, 2),
    ),
  ]);

  console.log(
    `Data build complete -> ${path.relative(ROOT_DIR, OUT_DIR)} (buildings=${buildings.length}, campus=${campusCount}, matched=${meta.stats.matchedLandmarks}, bridges=${structures.bridges.length}, canopies=${structures.accessCanopies.length}, portals=${structures.tunnelPortals.length})`,
  );
}

main().catch((err) => {
  console.error('build-campus-data failed:', err);
  process.exit(1);
});
