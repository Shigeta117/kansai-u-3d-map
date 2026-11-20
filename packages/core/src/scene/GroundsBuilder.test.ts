import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SENRIYAMA_CONFIG } from '../data/campuses/senriyama/config';
import { computeVisualY, sampleElevation } from '../domain/projection';
import type { BuildingFeature, CampusStructuresData, GroundFeature, TerrainGrid } from '../domain/types';
import { buildGroundsGroup, carveTerrainForGrounds, groundPlateY } from './GroundsBuilder';
import { AREA43_ROOF_DECK_M, buildArea43 } from './heroes/area4-3';

/** グラウンド（public/data/senriyama の実データで確かめる） */
const dataDir = path.resolve(process.cwd(), 'public/data/senriyama');
const readJson = <T>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8')) as T;

const terrain = readJson<TerrainGrid>('terrain.json');
const structures = readJson<CampusStructuresData>('structures.json');
const buildings = readJson<BuildingFeature[]>('buildings.json');
const grounds = structures.grounds ?? [];
const byId = (id: string): GroundFeature => {
  const g = grounds.find((x) => x.id === id);
  if (!g) throw new Error(`${id} missing`);
  return g;
};
const exag = SENRIYAMA_CONFIG.verticalExaggeration;

type P2 = [number, number];
function inside(p: P2, poly: readonly P2[]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
const offset = (c: P2, u: P2, du: number, dv: number): P2 => [c[0] + u[0] * du - u[1] * dv, c[1] + u[1] * du + u[0] * dv];

describe('グラウンドのデータ', () => {
  it('has the track, the straight, the grandstand, the baseball field and three sets of tennis courts', () => {
    expect(grounds.map((g) => g.kind).sort()).toEqual(
      ['athletics-track', 'baseball', 'grandstand', 'tennis', 'tennis', 'tennis', 'track-straight'].sort(),
    );
  });

  it('slopes the grandstand up from the track side and drops its building box', () => {
    const st = byId('ground-central-stand').grandstand!;
    expect(st.backElevation - st.frontElevation).toBeGreaterThan(1.5);
    expect(st.frontElevation).toBeGreaterThan(byId('ground-central-track').elevation);
    expect(buildings.some((b) => b.osmId === 'way_805366951')).toBe(false);
  });

  it('fits the 8-lane 400m track inside the surface and the pitch inside the inner curb', () => {
    const g = byId('ground-central-track');
    const t = g.track!;
    const perp: P2 = [-t.axis[1], t.axis[0]];
    const outer = t.innerRadiusM + t.lanes * t.laneWidthM;
    for (const end of [1, -1]) {
      const c: P2 = [t.center[0] + t.axis[0] * (t.straightM / 2) * end, t.center[1] + t.axis[1] * (t.straightM / 2) * end];
      for (let k = 0; k <= 12; k++) {
        const a = -Math.PI / 2 + (k / 12) * Math.PI;
        const r = outer - 0.3;
        const p: P2 = [
          c[0] + (t.axis[0] * Math.cos(a) * end + perp[0] * Math.sin(a) * end) * r,
          c[1] + (t.axis[1] * Math.cos(a) * end + perp[1] * Math.sin(a) * end) * r,
        ];
        expect(inside(p, g.polygon)).toBe(true);
      }
    }
    // フィールドの角は内側の縁（直線の部分は中心から innerRadius）より内
    for (const corner of t.pitch) {
      const d = Math.abs((corner[0] - t.center[0]) * perp[0] + (corner[1] - t.center[1]) * perp[1]);
      expect(d).toBeLessThan(t.innerRadiusM);
    }
  });

  it('puts home plate at the north-east and opens the outfield to the south-west with foul lines at a right angle', () => {
    const b = byId('ground-kaisers').baseball!;
    const l: P2 = [b.leftPole[0] - b.home[0], b.leftPole[1] - b.home[1]];
    const r: P2 = [b.rightPole[0] - b.home[0], b.rightPole[1] - b.home[1]];
    const cos = (l[0] * r[0] + l[1] * r[1]) / (Math.hypot(...l) * Math.hypot(...r));
    expect(Math.abs(cos)).toBeLessThan(0.05);
    expect(Math.hypot(...l)).toBeGreaterThan(85);
    expect(Math.hypot(...r)).toBeGreaterThan(85);
    const g = byId('ground-kaisers');
    const cx = g.polygon.reduce((s, p) => s + p[0], 0) / g.polygon.length;
    const cz = g.polygon.reduce((s, p) => s + p[1], 0) / g.polygon.length;
    expect(b.home[0]).toBeGreaterThan(cx);
    expect(b.home[1]).toBeLessThan(cz);
    // フェンスは左翼のポールから右翼のポールまで
    expect(b.fence[0]).toEqual(b.leftPole);
    expect(b.fence[b.fence.length - 1]).toEqual(b.rightPole);
    expect(b.fence.length).toBeGreaterThan(4);
  });

  it('lays out 3, 3 and 4 tennis courts inside their areas', () => {
    for (const [id, n] of [
      ['tennis-parking', 3],
      ['tennis-jhs', 3],
      ['tennis-area4-3-roof', 4],
    ] as const) {
      const g = byId(id);
      expect(g.tennis!.courts).toHaveLength(n);
      for (const court of g.tennis!.courts) {
        for (const [du, dv] of [
          [-11.9, -5.5],
          [11.9, -5.5],
          [11.9, 5.5],
          [-11.9, 5.5],
        ] as const) {
          expect(inside(offset(court.center, court.axis, du, dv), g.polygon)).toBe(true);
        }
      }
    }
    expect(byId('tennis-area4-3-roof').tennis!.roofOf).toBe('area4-3');
  });

  it('keeps the grandstand clear of 第4学舎3号館 and the walkway in front of it (5m)', () => {
    const stand = byId('ground-central-stand').polygon as P2[];
    const hall = buildings.find((b) => b.id === 'area4-3')!.polygon as P2[];
    // 観客席の頂点は 3号館の中に無く、3号館の角も観客席の中に無い
    for (const p of stand) expect(inside(p, hall)).toBe(false);
    for (const p of hall) expect(inside(p, stand)).toBe(false);
    // 観客席の縁の上の点（0.5m おき）は、3号館の輪郭から 4.9m 以上離れている
    const distToHall = (p: P2): number => {
      let best = Infinity;
      for (let i = 0; i < hall.length; i++) {
        const a = hall[i]!;
        const b = hall[(i + 1) % hall.length]!;
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
        best = Math.min(best, Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]));
      }
      return best;
    };
    let nearest = Infinity;
    for (let i = 0; i < stand.length; i++) {
      const a = stand[i]!;
      const b = stand[(i + 1) % stand.length]!;
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5);
      for (let k = 0; k <= n; k++) {
        nearest = Math.min(nearest, distToHall([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]));
      }
    }
    expect(nearest).toBeGreaterThan(4.9);
    expect(nearest).toBeLessThan(5.5);
  });

  it('drops the roof penthouse of 第4学舎3号館 for the rooftop courts', () => {
    expect(buildings.find((b) => b.id === 'area4-3')?.sculptStyle).toBe('standard');
  });
});

describe('グラウンドの造形', () => {
  const carved = carveTerrainForGrounds(terrain, structures);
  const group = buildGroundsGroup(structures, buildings, carved, SENRIYAMA_CONFIG);
  group.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  const surface = group.getObjectByName('grounds-surface') as THREE.Mesh | undefined;
  const buildingsById = new Map(buildings.map((b) => [b.id, b]));

  it('draws all the grounds with three meshes (surface, net fences, outfield fence)', () => {
    expect(meshes.map((m) => m.name).sort()).toEqual(
      ['grounds-net-fences', 'grounds-outfield-fence', 'grounds-surface'].sort(),
    );
  });

  it('flattens the terrain under each ground to the surface height', () => {
    for (const g of grounds.filter((x) => !x.tennis?.roofOf && x.kind !== 'grandstand')) {
      const cx = g.polygon.reduce((s, p) => s + p[0], 0) / g.polygon.length;
      const cz = g.polygon.reduce((s, p) => s + p[1], 0) / g.polygon.length;
      expect(sampleElevation(carved, cx, cz)).toBeCloseTo(g.elevation, 5);
      // 輪郭の頂点の真下も
      for (const p of g.polygon) {
        expect(Math.abs(sampleElevation(carved, p[0], p[1]) - g.elevation)).toBeLessThan(0.01);
      }
    }
    // 遠くの地形と、観客席の後ろ（斜面の上）の地形は変えない
    expect(sampleElevation(carved, -300, 300)).toBe(sampleElevation(terrain, -300, 300));
    const stand = byId('ground-central-stand');
    const back = stand.polygon.reduce((best, p) => (p[0] < best[0] ? p : best));
    expect(sampleElevation(carved, back[0] - 6, back[1])).toBe(sampleElevation(terrain, back[0] - 6, back[1]));
  });

  it('keeps the terrain below the sloped seats of the grandstand', () => {
    const g = byId('ground-central-stand');
    const st = g.grandstand!;
    const xs = g.polygon.map((p) => p[0]);
    const zs = g.polygon.map((p) => p[1]);
    let checked = 0;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2) {
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += 2) {
        if (!inside([x, z], g.polygon)) continue;
        const v = -st.axis[1] * x + st.axis[0] * z;
        const t = Math.max(0, Math.min(1, (v - st.vFront) / (st.vBack - st.vFront)));
        const top = st.frontElevation + (st.backElevation - st.frontElevation) * t;
        expect(sampleElevation(carved, x, z)).toBeLessThan(top);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('lays each surface just above the flattened ground, and the rooftop courts on the hero roof deck of 第4学舎3号館', () => {
    if (!surface) throw new Error('surface missing');
    for (const g of grounds) {
      const y = groundPlateY(g, buildingsById, terrain.minElevation, exag);
      expect(y).not.toBeNull();
      // 輪郭の中の点（頂点どうしの中点のうち中にある物）の真上から
      let probe: P2 | null = null;
      for (let i = 0; i < g.polygon.length && !probe; i++) {
        for (let j = i + 2; j < g.polygon.length && !probe; j++) {
          const a = g.polygon[i]!;
          const b = g.polygon[j]!;
          const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          if (inside(m, g.polygon)) probe = m;
        }
      }
      if (!probe) throw new Error(`no inner point for ${g.id}`);
      const hits = new THREE.Raycaster(new THREE.Vector3(probe[0], 500, probe[1]), new THREE.Vector3(0, -1, 0)).intersectObject(surface);
      expect(hits.length).toBeGreaterThan(0);
      if (!g.tennis?.roofOf && !g.grandstand) {
        expect(Math.abs(hits[0]!.point.y - y!)).toBeLessThan(0.3);
        const groundY = computeVisualY(g.elevation, terrain.minElevation, exag);
        expect(y! - groundY).toBeGreaterThan(0.05);
        expect(y! - groundY).toBeLessThan(0.3);
      }
    }
    // 3号館は主役の形（heroes/area4-3.ts）の屋上の面の上に置く（データの高さ b.height ではない）
    const roof = byId('tennis-area4-3-roof');
    const b = buildingsById.get('area4-3')!;
    const deckY = computeVisualY(b.groundY, terrain.minElevation, exag) + AREA43_ROOF_DECK_M;
    const y = groundPlateY(roof, buildingsById, terrain.minElevation, exag)!;
    expect(y - deckY).toBeGreaterThan(0.02);
    expect(y - deckY).toBeLessThan(0.1);
  });

  it('stands 第4学舎3号館 on the ground next to the grandstand: the wall reaches below the seats and the ground at its foot', () => {
    const b = buildingsById.get('area4-3')!;
    const sample = (x: number, z: number): number => computeVisualY(sampleElevation(carved, x, z), terrain.minElevation, exag);
    const hero = buildArea43({
      building: b,
      groundVisualY: computeVisualY(b.groundY, terrain.minElevation, exag),
      sampleGroundVisualY: sample,
    });
    hero.group.updateMatrixWorld(true);
    const body = hero.group.getObjectByName('area4-3-body') as THREE.Mesh;
    const bottom = new THREE.Box3().setFromObject(body).min.y;
    // 観客席の座席の面のいちばん高い所（後ろの縁）より下まで壁がある
    const st = byId('ground-central-stand').grandstand!;
    expect(bottom).toBeLessThan(computeVisualY(st.backElevation, terrain.minElevation, exag));
    // 輪郭の辺の上（1m おき）の、表示の地面（ならした地形）より下まで壁がある（壁の下にすき間が無い）
    const poly = b.polygon as P2[];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]));
      for (let k = 0; k <= n; k++) {
        expect(bottom).toBeLessThan(sample(p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n));
      }
    }
  });

  it('does not put a net fence on the roof of 第4学舎3号館 (the hero model has its own translucent screen)', () => {
    const nets = group.getObjectByName('grounds-net-fences') as THREE.Mesh;
    const roof = byId('tennis-area4-3-roof');
    const pos = nets.geometry.getAttribute('position');
    // 屋上の輪郭を少し広げた範囲に、網の柵の頂点が 1 つも無い
    const cx = roof.polygon.reduce((s2, p) => s2 + p[0], 0) / roof.polygon.length;
    const cz = roof.polygon.reduce((s2, p) => s2 + p[1], 0) / roof.polygon.length;
    const grown = roof.polygon.map(([x, z]) => [cx + (x - cx) * 1.1, cz + (z - cz) * 1.1] as P2);
    let onRoof = 0;
    for (let i = 0; i < pos.count; i++) {
      if (inside([pos.getX(i), pos.getZ(i)], grown)) onRoof++;
    }
    expect(onRoof).toBe(0);
    // ほかの 2 か所のテニスコートの網の柵は残る
    expect(pos.count).toBeGreaterThan(0);
  });

  it('raises the outfield fence and the tennis net fences', () => {
    const fence = group.getObjectByName('grounds-outfield-fence') as THREE.Mesh;
    const nets = group.getObjectByName('grounds-net-fences') as THREE.Mesh;
    const fBox = new THREE.Box3().setFromObject(fence);
    const kaisers = byId('ground-kaisers');
    const kY = groundPlateY(kaisers, buildingsById, terrain.minElevation, exag)!;
    expect(fBox.max.y - kY).toBeCloseTo(kaisers.baseball!.fenceHeightM, 1);
    const netMat = nets.material as THREE.MeshStandardMaterial;
    expect(netMat.transparent).toBe(true);
    expect(netMat.opacity).toBeLessThan(0.6);
  });
});
