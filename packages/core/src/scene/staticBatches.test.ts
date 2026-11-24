import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getCampusConfig } from '../domain/campus-registry';
import { findWingAt, wingRegionContains } from '../domain/wings';
import { applyBuildingWings } from '../data/loadCampusData';
import type { BuildingFeature, TerrainGrid } from '../domain/types';
import { applyBuildingVisualStates, applyRoofColorMode, buildBuildingsGroup } from './BuildingBuilder';
import { buildStaticBatches, patchDepthShader, patchStandardShader, SLOT_ATTRIBUTE } from './staticBatches';
import { resolveBuildingPick } from './wingSelection';

function readData<T>(file: string): T {
  const url = new URL(`../../../../public/data/senriyama/${file}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

/** 描かれるメッシュ（親を含めて visible のもの） */
function drawnMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const visit = (obj: THREE.Object3D): void => {
    if (!obj.visible) return;
    if (obj instanceof THREE.Mesh) out.push(obj);
    for (const c of obj.children) visit(c);
  };
  visit(root);
  return out;
}

function drawCalls(meshes: THREE.Mesh[]): number {
  return meshes.reduce((n, m) => n + (Array.isArray(m.material) ? m.geometry.groups.length : 1), 0);
}

function triangles(meshes: THREE.Mesh[]): number {
  return meshes.reduce((sum, m) => {
    const g = m.geometry;
    const total = g.index ? g.index.count : g.getAttribute('position').count;
    let count = total;
    if (Array.isArray(m.material)) {
      count = g.groups.reduce((s, gr) => s + Math.min(gr.count, total - gr.start), 0);
    }
    return sum + (count / 3) * (m instanceof THREE.InstancedMesh ? m.count : 1);
  }, 0);
}

const terrain = readData<TerrainGrid>('terrain.json');
// 本番と同じく、棟の表を付けた建物で組む（第3学舎の棟の殻が要る）
const buildings = applyBuildingWings(readData<BuildingFeature[]>('buildings.json'));
const config = getCampusConfig('senriyama');

function build() {
  const built = buildBuildingsGroup(buildings, terrain.minElevation, config, { terrain, campusOnly: true });
  const scene = new THREE.Scene();
  scene.add(built.root);
  const before = { calls: drawCalls(drawnMeshes(built.root)), triangles: triangles(drawnMeshes(built.root)) };
  const batches = buildStaticBatches(
    [...built.campusRecords.values()].map((rec) => ({
      root: rec.group,
      keep: built.animatedRotors,
      movable: rec.group,
      pickable: true,
    })),
  );
  scene.add(batches.group);
  return { built, scene, batches, before };
}

/** まとめたメッシュが使っている番号 */
function usedSlots(batches: ReturnType<typeof build>['batches']): Set<number> {
  const slots = new Set<number>();
  for (const mesh of batches.meshes) {
    const attr = mesh.geometry.getAttribute(SLOT_ATTRIBUTE);
    for (let i = 0; i < attr.count; i++) slots.add(attr.getX(i));
  }
  return slots;
}

function isUnder(obj: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) if (cur === ancestor) return true;
  return false;
}

describe('建物をまたいだまとめ（buildStaticBatches）', () => {
  const { built, scene, batches, before } = build();

  it('描画命令が大きく減り、描く三角形の数は変わらない', () => {
    const after = drawnMeshes(scene);
    expect(drawCalls(after)).toBeLessThan(before.calls / 5);
    expect(triangles(after)).toBe(before.triangles);
    expect(batches.meshes.length).toBeLessThanOrEqual(40);
    expect(usedSlots(batches).size).toBe(batches.slotCount);
  });

  it('まとめた元のメッシュは見えないまま当たり判定に残り、真上から当てるとその建物が選ばれる', () => {
    scene.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    for (const id of ['innovation', 'library', 'rimpukan', 'kanbunkan', 'enshinkan', 'area1-1', 'iwasaki']) {
      const b = buildings.find((x) => x.id === id);
      expect(b).toBeDefined();
      if (!b) continue;
      raycaster.set(new THREE.Vector3(b.centroid.x, 500, b.centroid.z), new THREE.Vector3(0, -1, 0));
      const hits = raycaster.intersectObjects(built.interactiveMeshes, false);
      expect(hits[0]?.object.userData.buildingId).toBe(id);
      expect(hits[0]?.object.visible).toBe(false);
    }
    // まとめたメッシュ自体には当たらない
    raycaster.set(new THREE.Vector3(0, 500, 0), new THREE.Vector3(0, -1, 0));
    expect(raycaster.intersectObject(batches.group, true)).toHaveLength(0);
  });

  it('第3学舎の棟は、まとめた後も押した所の棟に決まる', () => {
    const rec = built.campusRecords.get('area3');
    expect(rec?.wingShells?.size).toBeGreaterThan(0);
    if (!rec) return;
    scene.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    const found = new Set<string>();
    const box = new THREE.Box3().setFromObject(rec.group);
    for (let x = box.min.x; x <= box.max.x; x += 6) {
      for (let z = box.min.z; z <= box.max.z; z += 6) {
        raycaster.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
        const hit = raycaster.intersectObjects(built.interactiveMeshes, false)[0];
        if (hit?.object.userData.buildingId !== 'area3') continue;
        const pick = resolveBuildingPick(hit, raycaster, (id) => built.campusRecords.get(id));
        if (pick?.wingId) found.add(pick.wingId);
      }
    }
    expect([...found].sort()).toEqual(['area3-a', 'area3-b', 'area3-c', 'area3-d']);
  });

  it('第4学舎2号館は、屋根を真上から押した所が入る塊の範囲の棟（教室棟か研究棟）に決まる', () => {
    const rec = built.campusRecords.get('area4-2');
    expect([...(rec?.wingShells?.keys() ?? [])].sort()).toEqual(['area4-h2', 'area4-h2r']);
    if (!rec) return;
    scene.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    const counts = new Map<string, number>();
    const box = new THREE.Box3().setFromObject(rec.group);
    for (let x = box.min.x; x <= box.max.x; x += 3) {
      for (let z = box.min.z; z <= box.max.z; z += 3) {
        raycaster.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
        const hit = raycaster.intersectObjects(built.interactiveMeshes, false)[0];
        if (hit?.object.userData.buildingId !== 'area4-2') continue;
        const pick = resolveBuildingPick(hit, raycaster, (id) => built.campusRecords.get(id));
        const expected = findWingAt(rec.building, hit.point.x, hit.point.z)?.id;
        // 境目の線の上（両方の範囲に入る）は飛ばす
        const both = (rec.building.wings ?? []).filter((w) => wingRegionContains(w.region, hit.point.x, hit.point.z));
        if (both.length !== 1) continue;
        expect(pick?.wingId, `${x.toFixed(1)},${z.toFixed(1)}`).toBe(expected);
        if (pick?.wingId) counts.set(pick.wingId, (counts.get(pick.wingId) ?? 0) + 1);
      }
    }
    expect(counts.get('area4-h2') ?? 0).toBeGreaterThan(100);
    expect(counts.get('area4-h2r') ?? 0).toBeGreaterThan(100);
  });

  it('薄める・持ち上げる・屋根の色の切り替えは、元の材質の値がテクスチャに写る', () => {
    const rec = built.campusRecords.get('rimpukan');
    const other = built.campusRecords.get('area1-1');
    expect(rec && other).toBeTruthy();
    if (!rec || !other) return;
    const slotOf = (mat: THREE.Material): number => {
      const found = batches.slotsOf(mat);
      expect(found).toHaveLength(1);
      return found[0] ?? -1;
    };
    const primary = rec.primaryMaterials[0];
    const otherWall = other.primaryMaterials[other.primaryMaterials.length - 1];
    expect(primary && otherWall).toBeTruthy();
    if (!primary || !otherWall) return;
    const slot = slotOf(primary.mat);
    const otherSlot = slotOf(otherWall.mat);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(otherSlot).toBeGreaterThanOrEqual(0);

    // カテゴリで薄める（凜風館は shared。第1学舎だけを残す）
    applyBuildingVisualStates(built.campusRecords, null, 'area1');
    expect(batches.sync()).toBe(true);
    const dimmed = batches.slotValues(slot);
    expect(dimmed.slice(0, 3)).toEqual([primary.mat.color.r, primary.mat.color.g, primary.mat.color.b].map(Math.fround));
    expect(primary.mat.color.getHexString()).not.toBe(primary.baseHex.replace('#', '').toLowerCase());
    // 変わっていなければ写さない
    expect(batches.sync()).toBe(false);

    // 第1学舎1号館を選んで持ち上げる（sel=lift）: 持ち上げている間は、まとめた分を消して元のメッシュを描く。
    // 選んでも材質は光らせない（輪郭と塗りは殻で重ねる）
    applyBuildingVisualStates(built.campusRecords, 'area1-1', 'all', { lift: true });
    batches.sync();
    expect(batches.slotValues(otherSlot).slice(4, 7)).toEqual([0, 0, 0]);
    expect(batches.slotValues(otherSlot)[8]).toBe(0);
    expect(batches.slotValues(slot)[8]).toBe(1);
    const shown = drawnMeshes(other.group).filter((m) => m.userData.buildingId === 'area1-1');
    expect(shown.length).toBeGreaterThan(0);
    // 選びをやめると元に戻る
    applyBuildingVisualStates(built.campusRecords, null, 'all');
    batches.sync();
    expect(batches.slotValues(otherSlot)[8]).toBe(1);
    expect(batches.slotValues(otherSlot).slice(4, 7)).toEqual([0, 0, 0]);
    expect(drawnMeshes(other.group)).toHaveLength(0);

    // 持ち上げずに選ぶ（既定）と、まとめたメッシュのまま描く（元のメッシュを描かないので描画命令が増えない）
    applyBuildingVisualStates(built.campusRecords, 'area1-1', 'all');
    batches.sync();
    expect(batches.slotValues(otherSlot)[8]).toBe(1);
    expect(drawnMeshes(other.group)).toHaveLength(0);
    applyBuildingVisualStates(built.campusRecords, null, 'all');
    batches.sync();

    // 屋根の色（主役以外）を切り替えると、屋根の番号の色が変わる
    const roof = other.roofColors?.entry.mat;
    expect(roof).toBeDefined();
    if (!roof) return;
    const roofSlot = slotOf(roof);
    applyRoofColorMode(built.campusRecords, 'area');
    batches.sync();
    expect(batches.slotValues(roofSlot).slice(0, 3)).toEqual([roof.color.r, roof.color.g, roof.color.b].map(Math.fround));
    const areaColor = batches.slotValues(roofSlot).slice(0, 3);
    applyRoofColorMode(built.campusRecords, 'aerial');
    batches.sync();
    expect(batches.slotValues(roofSlot).slice(0, 3)).not.toEqual(areaColor);
  });

  it('回る物・透明な物はまとめず、元の group で描く', () => {
    for (const rotor of built.animatedRotors) {
      expect(rotor.visible).toBe(true);
      expect(isUnder(rotor, built.root)).toBe(true);
    }
    const left = drawnMeshes(built.root);
    for (const mesh of left) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const isRotorPart = built.animatedRotors.some((r) => isUnder(mesh, r));
      expect(isRotorPart || mats.some((m) => m.transparent)).toBe(true);
    }
    expect(left.length).toBeLessThan(15);
  });
});

describe('まとめたメッシュの shader（three の版を上げたときの確かめ）', () => {
  const texture = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);

  it('MeshStandardMaterial の色・明るさ・粗さ・金属感を番号の値に置き換える', () => {
    const lib = THREE.ShaderLib.physical;
    const shader = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader } as Parameters<
      typeof patchStandardShader
    >[0];
    patchStandardShader(shader, texture);
    expect(shader.vertexShader).toContain(`attribute float ${SLOT_ATTRIBUTE};`);
    expect(shader.vertexShader).toContain('transformed = vec3(0.0)');
    expect(shader.fragmentShader).toContain('vec4 diffuseColor = vec4( vKumSlotA.rgb, opacity );');
    expect(shader.fragmentShader).toContain('vec3 totalEmissiveRadiance = vKumSlotB.rgb;');
    expect(shader.fragmentShader).toContain('float roughnessFactor = vKumSlotA.a;');
    expect(shader.fragmentShader).toContain('float metalnessFactor = vKumSlotB.a;');
    expect(shader.fragmentShader).not.toContain('vec4( diffuse, opacity )');
    expect((shader.uniforms as Record<string, { value: unknown }>).kumSlotTex?.value).toBe(texture);
  });

  it('影の地図の shader でも、描かない番号の三角形を潰す', () => {
    const lib = THREE.ShaderLib.depth;
    const shader = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader } as Parameters<
      typeof patchDepthShader
    >[0];
    patchDepthShader(shader, texture);
    expect(shader.vertexShader).toContain('transformed = vec3(0.0)');
  });

  it('置き換える文が見つからなければ止める', () => {
    const shader = { uniforms: {}, vertexShader: 'void main() {}', fragmentShader: '' } as Parameters<
      typeof patchDepthShader
    >[0];
    expect(() => patchDepthShader(shader, texture)).toThrow(/three/);
  });
});
