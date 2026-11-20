import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AREA3_AXIS_U, AREA3_WING_IDS } from '../data/campuses/senriyama/wings';
import { applyBuildingWings } from '../data/loadCampusData';
import { getCampusConfig } from '../domain/campus-registry';
import type { BuildingFeature, TerrainGrid } from '../domain/types';
import { wingFootprintCentroid, wingRegionContains } from '../domain/wings';
import { applyBuildingVisualStates, buildBuildingsGroup } from './BuildingBuilder';
import { buildWingShells, resolveBuildingPick, WingHighlighter } from './wingSelection';

function readData<T>(file: string): T {
  const url = new URL(`../../../../public/data/senriyama/${file}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

const config = getCampusConfig('senriyama');
const terrain = readData<TerrainGrid>('terrain.json');
const area3 = applyBuildingWings(readData<BuildingFeature[]>('buildings.json')).find((b) => b.id === 'area3');
if (!area3) throw new Error('area3 missing');
const wings = area3.wings ?? [];
const { a: A, b: B, c: C, d: D } = AREA3_WING_IDS;

// 本番と同じく、部品を材質ごとにまとめた建物で確かめる
const built = buildBuildingsGroup([area3], terrain.minElevation, config, { terrain, campusOnly: true });
const record = built.campusRecords.get('area3');
if (!record) throw new Error('record missing');
const group = record.group;
const shells = record.wingShells ?? new Map<string, THREE.BufferGeometry>();

function shellArea(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let sum = 0;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1).sub(a);
    c.fromBufferAttribute(pos, i + 2).sub(a);
    sum += b.cross(c).length() / 2;
  }
  return sum;
}

/** 枠の (u, v) からローカル座標 (x, z) */
function worldOf(u: number, v: number): [number, number] {
  const [ax, az] = AREA3_AXIS_U;
  return [u * ax - v * az, u * az + v * ax];
}

function pickAt(origin: THREE.Vector3, dir: THREE.Vector3): ReturnType<typeof resolveBuildingPick> {
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(origin, dir.normalize());
  const hits = ray.intersectObjects(built.interactiveMeshes, false);
  return resolveBuildingPick(hits[0], ray, (id) => (id === 'area3' ? record : undefined));
}

describe('地図で棟を押す（当たり判定の棟の印）', () => {
  it.each([A, B, C, D])('picks %s when the roof above its centroid is clicked', (wingId) => {
    const wing = wings.find((w) => w.id === wingId);
    const fc = wing ? wingFootprintCentroid(area3, wing) : null;
    if (!fc) throw new Error('no footprint');
    expect(pickAt(new THREE.Vector3(fc.centroid.x, 500, fc.centroid.z), new THREE.Vector3(0, -1, 0))).toEqual({
      buildingId: 'area3',
      wingId,
    });
  });

  it('picks C (not B) on the east fins of the tower, which hang over the B/D roofs', () => {
    // 東の面のフィンは u = -284.3〜-282.9（B・D の範囲）の上、8〜10 階。B・D の屋上より 12m 上を東から水平に当てる
    const y = (shells.get(B)?.boundingBox?.max.y ?? 0) + 12;
    const [x0, z0] = worldOf(-270, 165);
    const [x1, z1] = worldOf(-284, 165);
    const origin = new THREE.Vector3(x0, y, z0);
    const hit = pickAt(origin, new THREE.Vector3(x1, y, z1).sub(origin));
    expect(hit).toEqual({ buildingId: 'area3', wingId: C });
  });

  it('picks the building only (no wing) for a building without wings, and nothing for empty ground', () => {
    const obj = new THREE.Mesh();
    obj.userData = { buildingId: 'library' };
    const hit = { object: obj, point: new THREE.Vector3(), distance: 1 } as THREE.Intersection;
    const ray = new THREE.Raycaster();
    expect(resolveBuildingPick(hit, ray, () => ({ building: {}, group: new THREE.Group() }))).toEqual({
      buildingId: 'library',
      wingId: null,
    });
    const bare = { object: new THREE.Mesh(), point: new THREE.Vector3(), distance: 1 } as THREE.Intersection;
    expect(resolveBuildingPick(bare, ray, () => undefined)).toBeNull();
    expect(resolveBuildingPick(undefined, ray, () => undefined)).toBeNull();
  });
});

describe('選んだ棟だけを光らせる殻', () => {
  it('cuts one shell per wing before the parts are merged', () => {
    expect([...shells.keys()]).toEqual([A, B, C, D]);
    for (const geo of shells.values()) expect(geo.getAttribute('position').count).toBeGreaterThan(30);
  });

  it('keeps untagged parts inside their wing region (B and D split at the courtyard)', () => {
    for (const id of [B, D]) {
      const w = wings.find((x) => x.id === id);
      const geo = shells.get(id);
      if (!w || !geo) throw new Error(id);
      const pos = geo.getAttribute('position');
      const p = new THREE.Vector3();
      const [ax, az] = AREA3_AXIS_U;
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        const inside =
          wingRegionContains(w.region, p.x, p.z) ||
          [-0.01, 0.01].some(
            (d) => wingRegionContains(w.region, p.x + ax * d, p.z + az * d) || wingRegionContains(w.region, p.x - az * d, p.z + ax * d),
          );
        expect(inside, `${id} vertex ${i}`).toBe(true);
      }
    }
  });

  it('covers the whole building surface exactly once across the 4 wings', () => {
    // 4 棟の殻の面積の和 = 建物の（透明でない）面の面積（境目の壁も 1 つの棟にだけ入る）
    const whole = buildWingShells(group, [{ id: 'all' }]).get('all');
    if (!whole) throw new Error('whole missing');
    const total = [...shells.values()].reduce((s, g) => s + shellArea(g), 0);
    expect(total).toBeCloseTo(shellArea(whole), 0);
  });

  it('makes the C (10-storey tower) shell much taller than the 5-storey B and D', () => {
    const top = (id: string): number => shells.get(id)?.boundingBox?.max.y ?? NaN;
    expect(top(C)).toBeGreaterThan(top(B) + 15);
    // B棟の屋上には機械室が 2 つ載る（屋上より 3m 上まで）。D棟の屋上には無い
    expect(top(B) - top(D)).toBeCloseTo(3.0, 1);
    // A棟の範囲には、B と D を結ぶ 5 階の通路（A棟の屋上）が入るので、上端は D とそろう
    expect(top(A)).toBeCloseTo(top(D), 1);
  });

  it('shows one shell mesh on the selected wing only, and none when nothing is selected', () => {
    const hl = new WingHighlighter();
    hl.show(group, shells.get(C));
    expect(hl.isShown()).toBe(true);
    expect(hl.mesh.parent).toBe(group);
    let shellMeshes = 0;
    group.traverse((o) => {
      if (o.userData?.wingShell) shellMeshes++;
    });
    expect(shellMeshes).toBe(1);
    // 殻は材質 1 つ（描画命令 +1）、影を落とさない、押しても当たらない
    expect(Array.isArray(hl.mesh.material)).toBe(false);
    expect(hl.mesh.castShadow).toBe(false);
    const hits: THREE.Intersection[] = [];
    hl.mesh.raycast(new THREE.Raycaster(), hits);
    expect(hits).toHaveLength(0);
    hl.show(group, shells.get(B));
    expect(hl.mesh.geometry).toBe(shells.get(B));
    hl.show(group, null);
    expect(hl.isShown()).toBe(false);
    hl.dispose();
  });

  it('keeps the whole building unlit when a wing is selected (only the shell glows), and lifts it', () => {
    const records = new Map([['area3', record]]);
    applyBuildingVisualStates(records, 'area3', 'all', C);
    for (const e of record.primaryMaterials) expect(e.mat.emissiveIntensity).toBe(0);
    expect(group.position.y).toBeCloseTo(1.4, 6);
    applyBuildingVisualStates(records, 'area3', 'all', null);
    for (const e of record.primaryMaterials) expect(e.mat.emissiveIntensity).toBeGreaterThan(0);
    applyBuildingVisualStates(records, null, 'all');
    expect(group.position.y).toBe(0);
  });
});
