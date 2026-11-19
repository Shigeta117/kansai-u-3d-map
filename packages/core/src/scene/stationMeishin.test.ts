import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SENRIYAMA_CONFIG } from '../data/campuses/senriyama/config';
import { segmentIntersection } from '../domain/expressway';
import { computeVisualY, geoToLocal, sampleElevation } from '../domain/projection';
import type {
  CampusStructuresData,
  PathFeature,
  TerrainGrid,
  TransportData,
} from '../domain/types';
import { sampleTerrainMeshElevation } from './DioramaBaseBuilder';
import { buildExpresswayMesh, carveTerrainForExpressways } from './ExpresswayBuilder';
import { buildStationGroup, PLATFORM_HEIGHT_ABOVE_TRACK, TRACK_BED_LIFT } from './StationBuilder';

/**
 * 関大前駅と名神高速（高架・坑口）の検収。public/data/senriyama の実データで確かめる。
 * OSM のトンネルの端のノードの緯度経度は .cache/raw/osm-senriyama.json（Overpass の結果）から写した値
 */

const dataDir = path.resolve(process.cwd(), 'public/data/senriyama');
const readJson = <T>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8')) as T;

const terrain = readJson<TerrainGrid>('terrain.json');
const structures = readJson<CampusStructuresData>('structures.json');
const transport = readJson<TransportData>('transport.json');
const paths = readJson<PathFeature[]>('paths.json');
const origin = SENRIYAMA_CONFIG.origin;
const exag = SENRIYAMA_CONFIG.verticalExaggeration;
const vis = (e: number) => computeVisualY(e, terrain.minElevation, exag);
const local = (lat: number, lon: number) => geoToLocal({ lat, lon }, origin);

const carriageways = structures.expressways ?? [];
const piers = structures.expresswayPiers ?? [];
const facilities = transport.stationFacilities?.[0];

type P2 = [number, number];

function distToPolyline(x: number, z: number, pts: readonly P2[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
  }
  return best;
}

function pointInPolygon(x: number, z: number, poly: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (!pi || !pj) continue;
    if (pi[1] > z !== pj[1] > z && x < ((pj[0] - pi[0]) * (z - pi[1])) / (pj[1] - pi[1] + 1e-12) + pi[0]) {
      inside = !inside;
    }
  }
  return inside;
}

/** 高架の区間と相手の線の交点ごとに、桁の下面と地面の差（m、標高） */
function bridgeClearances(lines: readonly (readonly P2[])[]) {
  const out: { x: number; z: number; clearance: number }[] = [];
  for (const cw of carriageways) {
    for (let i = 0; i < cw.points.length - 1; i++) {
      if (cw.segmentKinds[i] !== 'bridge') continue;
      const a = cw.points[i];
      const b = cw.points[i + 1];
      if (!a || !b) continue;
      for (const line of lines) {
        for (let j = 0; j < line.length - 1; j++) {
          const c = line[j];
          const d = line[j + 1];
          if (!c || !d) continue;
          const hit = segmentIntersection([a[0], a[2]], [b[0], b[2]], c, d);
          if (!hit) continue;
          const x = a[0] + (b[0] - a[0]) * hit.t;
          const z = a[2] + (b[2] - a[2]) * hit.t;
          const deck = a[1] + (b[1] - a[1]) * hit.t;
          out.push({ x, z, clearance: deck - cw.structureDepth - sampleElevation(terrain, x, z) });
        }
      }
    }
  }
  return out;
}

describe('名神高速道路（高架・地上の区間・坑口）', () => {
  it('has both carriageways on each side of the tunnel, with a bridge over the station', () => {
    expect(carriageways.map((c) => c.id).sort()).toEqual([
      'meishin-east-eb',
      'meishin-east-wb',
      'meishin-west-eb',
      'meishin-west-wb',
    ]);
    const west = carriageways.filter((c) => c.id.startsWith('meishin-west'));
    for (const cw of west) {
      expect(cw.segmentKinds).toContain('bridge');
      expect(cw.segmentKinds).toContain('ground');
    }
  });

  it('keeps 5.5m or more under the girders above the railway', () => {
    const rails = transport.railways.map((r) => r.points);
    const crossings = bridgeClearances(rails);
    // 上下線 × 上下の線路
    expect(crossings.length).toBeGreaterThanOrEqual(4);
    for (const c of crossings) expect(c.clearance).toBeGreaterThanOrEqual(5.5);
  });

  it('keeps 5.5m or more under the girders above the roads', () => {
    const roads = paths.filter((p) => p.kind === 'road-major' || p.kind === 'road-minor').map((p) => p.points);
    const crossings = bridgeClearances(roads);
    expect(crossings.length).toBeGreaterThan(0);
    for (const c of crossings) expect(c.clearance).toBeGreaterThanOrEqual(5.5);
  });

  it('does not change the road height abruptly (grade within a few percent)', () => {
    for (const cw of carriageways) {
      for (let i = 0; i < cw.points.length - 1; i++) {
        const a = cw.points[i];
        const b = cw.points[i + 1];
        if (!a || !b) continue;
        const run = Math.hypot(b[0] - a[0], b[2] - a[2]);
        if (run < 0.5) continue;
        expect(Math.abs(b[1] - a[1]) / run).toBeLessThan(0.04);
      }
    }
  });

  it('places each tunnel portal within 3m of the OSM tunnel ends, square to the tunnel and facing away from the hill', () => {
    const cases = [
      {
        id: 'meishin-portal-west',
        ends: [local(34.7719297, 135.5074966), local(34.7718175, 135.5075097)],
        inside: [local(34.7719544, 135.5079966), local(34.7718414, 135.5080022)],
      },
      {
        id: 'meishin-portal-east',
        ends: [local(34.7726099, 135.512959), local(34.7725057, 135.5129909)],
        inside: [local(34.7724272, 135.5122331), local(34.7723172, 135.5122631)],
      },
    ];
    for (const c of cases) {
      const portal = structures.tunnelPortals.find((p) => p.id === c.id);
      expect(portal).toBeDefined();
      if (!portal) continue;
      // トンネルの名前「千里山トンネル」は持ち主の確認による（2026-11-20）
      expect(portal.name).toContain('千里山トンネル');
      const [e0, e1] = c.ends;
      const [i0, i1] = c.inside;
      if (!e0 || !e1 || !i0 || !i1) throw new Error('missing OSM points');
      const mid = { x: (e0.x + e1.x) / 2, z: (e0.z + e1.z) / 2 };
      expect(Math.hypot(portal.x - mid.x, portal.z - mid.z)).toBeLessThanOrEqual(3);

      const out = { x: Math.cos(portal.angleRad), z: -Math.sin(portal.angleRad) };
      const inX = (i0.x + i1.x) / 2 - mid.x;
      const inZ = (i0.z + i1.z) / 2 - mid.z;
      const inLen = Math.hypot(inX, inZ);
      // 坑門の外向きがトンネルの奥の向きのほぼ逆（坑門の面がトンネルに直角）
      expect((out.x * inX + out.z * inZ) / inLen).toBeLessThan(-0.98);
      // 坑門の後ろ（トンネルの側）の地面が前より高い（山の斜面に向いている）
      const behind = sampleElevation(terrain, portal.x - out.x * 15, portal.z - out.z * 15);
      const front = sampleElevation(terrain, portal.x + out.x * 15, portal.z + out.z * 15);
      expect(behind - front).toBeGreaterThan(2);
      // 開口の床と、坑口に入る車道の端の高さがそろう
      const endElevs = carriageways
        .flatMap((cw) => [cw.points[0], cw.points[cw.points.length - 1]])
        .filter((p): p is [number, number, number] => Boolean(p))
        .filter((p) => Math.hypot(p[0] - portal.x, p[2] - portal.z) < 10)
        .map((p) => p[1]);
      expect(endElevs.length).toBe(2);
      for (const e of endElevs) expect(Math.abs(e - portal.y)).toBeLessThan(0.05);
    }
  });

  it('does not stand piers on the tracks, platforms or roads', () => {
    expect(piers.length).toBeGreaterThan(0);
    const rails = transport.railways.map((r) => r.points);
    const roads = paths.filter((p) => p.kind === 'road-major' || p.kind === 'road-minor');
    for (const p of piers) {
      for (const r of rails) expect(distToPolyline(p.x, p.z, r)).toBeGreaterThan(2.6 + p.columnSize / 2);
      for (const pf of facilities?.platforms ?? []) expect(pointInPolygon(p.x, p.z, pf.polygon)).toBe(false);
      for (const road of roads) {
        expect(distToPolyline(p.x, p.z, road.points)).toBeGreaterThan(road.width / 2 + p.columnSize / 2 - 0.01);
      }
    }
  });

  it('builds the expressway as a single mesh whose deck sits on the estimated profile', () => {
    const carved = carveTerrainForExpressways(terrain, structures);
    const mesh = buildExpresswayMesh(structures, carved, SENRIYAMA_CONFIG);
    expect(mesh).not.toBeNull();
    if (!mesh) return;
    // 高架の上で真上から当てると、路面（表示の高さ）に当たる
    const cw = carriageways.find((c) => c.id === 'meishin-west-eb');
    const i = cw?.segmentKinds.indexOf('bridge') ?? -1;
    const p = cw?.points[i + 5];
    expect(p).toBeDefined();
    if (!p) return;
    const ray = new THREE.Raycaster(new THREE.Vector3(p[0], 500, p[2]), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh)[0];
    expect(hit?.point.y ?? NaN).toBeCloseTo(vis(p[1]), 1);
  });

  it('lowers the displayed terrain under the ground sections only (never raises it)', () => {
    const carved = carveTerrainForExpressways(terrain, structures);
    for (let k = 0; k < terrain.elevations.length; k++) {
      expect(carved.elevations[k] ?? 0).toBeLessThanOrEqual((terrain.elevations[k] ?? 0) + 1e-9);
    }
    for (const cw of carriageways) {
      for (let i = 0; i < cw.points.length - 1; i++) {
        if (cw.segmentKinds[i] !== 'ground') continue;
        const p = cw.points[i];
        if (!p) continue;
        expect(sampleTerrainMeshElevation(carved, p[0], p[2])).toBeLessThanOrEqual(p[1] - 0.29);
      }
    }
    // 名神から離れた所（キャンパスの中心）は変わらない
    const far = sampleTerrainMeshElevation(terrain, 0, 0);
    expect(sampleTerrainMeshElevation(carved, 0, 0)).toBeCloseTo(far, 6);
  });
});

describe('関大前駅（ホーム・駅舎・上屋）', () => {
  it('has the two OSM platforms on opposite sides of both tracks', () => {
    expect(facilities?.stationId).toBe('kandaimae-station');
    const platforms = facilities?.platforms ?? [];
    expect(platforms.map((p) => p.ref).sort()).toEqual(['1', '2']);
    const sideOf = (poly: readonly P2[], line: readonly P2[]) => {
      const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length;
      const cz = poly.reduce((s, q) => s + q[1], 0) / poly.length;
      let best = Infinity;
      let side = 0;
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i];
        const b = line[i + 1];
        if (!a || !b) continue;
        const d = distToPolyline(cx, cz, [a, b]);
        if (d < best) {
          best = d;
          side = Math.sign((b[0] - a[0]) * (cz - a[1]) - (b[1] - a[1]) * (cx - a[0]));
        }
      }
      return { side, dist: best };
    };
    const nearRails = transport.railways.filter((r) =>
      platforms.every((pf) => sideOf(pf.polygon, r.points).dist < 15),
    );
    expect(nearRails.length).toBe(2);
    for (const r of nearRails) {
      const sides = platforms.map((pf) => sideOf(pf.polygon, r.points).side);
      expect(sides[0]).not.toBe(0);
      expect(sides[0]).toBe(-(sides[1] ?? 0));
    }
    // ホームが線路の中心線の上にかからない
    for (const pf of platforms) {
      for (const r of nearRails) {
        for (const q of r.points) expect(pointInPolygon(q[0], q[1], pf.polygon)).toBe(false);
      }
    }
  });

  it('keeps the station building under the viaduct lower than the girders', () => {
    for (const b of facilities?.buildings ?? []) {
      const cx = b.polygon.reduce((s, q) => s + q[0], 0) / b.polygon.length;
      const cz = b.polygon.reduce((s, q) => s + q[1], 0) / b.polygon.length;
      const roofVis = vis(sampleElevation(terrain, cx, cz)) + b.heightM;
      for (const cw of carriageways) {
        const line = cw.points.map(([x, , z]) => [x, z] as P2);
        for (const [x, z] of b.polygon) {
          if (distToPolyline(x, z, line) > cw.width / 2) continue;
          // 真上の路面の高さ（最も近い点）
          let nearest = cw.points[0];
          let bestD = Infinity;
          for (const p of cw.points) {
            const d = Math.hypot(p[0] - x, p[2] - z);
            if (d < bestD) {
              bestD = d;
              nearest = p;
            }
          }
          if (!nearest) continue;
          expect(vis(nearest[1]) - cw.structureDepth - roofVis).toBeGreaterThan(1);
        }
      }
    }
  });

  it('draws the platforms about 1m above the track and registers the station for picking', () => {
    const result = buildStationGroup(transport.stationFacilities ?? [], terrain, SENRIYAMA_CONFIG);
    expect(result.interactive).toHaveLength(1);
    expect(result.interactive[0]?.userData.buildingId).toBe('kandaimae-station');
    result.group.updateMatrixWorld(true);
    // 1 番線の長さの 3 割の所（上屋・駅名標の無い所）を真上から当てる
    const pf = facilities?.platforms.find((p) => p.ref === '1');
    expect(pf).toBeDefined();
    if (!pf) return;
    let a = pf.polygon[0] as P2;
    let b = a;
    let best = 0;
    for (const p of pf.polygon) {
      for (const q of pf.polygon) {
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d > best) {
          best = d;
          a = p;
          b = q;
        }
      }
    }
    const tx = a[0] + (b[0] - a[0]) * 0.3;
    const tz = a[1] + (b[1] - a[1]) * 0.3;
    // 長い方向に直角な線の上で、輪郭の中に入る点を探す
    const nx = -(b[1] - a[1]) / best;
    const nz = (b[0] - a[0]) / best;
    let probe: P2 | null = null;
    for (let s = -6; s <= 6; s += 0.25) {
      if (pointInPolygon(tx + nx * s, tz + nz * s, pf.polygon)) {
        probe = [tx + nx * s, tz + nz * s];
        break;
      }
    }
    expect(probe).not.toBeNull();
    if (!probe) return;
    const ray = new THREE.Raycaster(new THREE.Vector3(probe[0], 500, probe[1]), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(result.interactive)[0];
    const trackTop = vis(sampleElevation(terrain, probe[0], probe[1])) + TRACK_BED_LIFT;
    // 上面は輪郭の点ごとの高さを三角形でつなぐので、内側では数 cm ずれる（約 1m であればよい）
    const above = (hit?.point.y ?? NaN) - trackTop;
    expect(Math.abs(above - PLATFORM_HEIGHT_ABOVE_TRACK)).toBeLessThan(0.15);
  });
});
