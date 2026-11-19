import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getCampusConfig } from '../domain/campus-registry';
import type { BuildingFeature, TerrainGrid } from '../domain/types';
import { buildBuildingsGroup } from './BuildingBuilder';
import { mergeStaticMeshes } from './mergeStaticMeshes';

function readData<T>(file: string): T {
  const url = new URL(`../../../../public/data/senriyama/${file}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) out.push(obj);
  });
  return out;
}

/** 描画命令の数（材質の配列なら groups の数） */
function drawCalls(root: THREE.Object3D): number {
  return meshesOf(root).reduce(
    (sum, m) => sum + (Array.isArray(m.material) ? m.geometry.groups.length : 1),
    0,
  );
}

function triangleCount(root: THREE.Object3D): number {
  return meshesOf(root).reduce((sum, m) => {
    const g = m.geometry;
    const n = g.index ? g.index.count : g.getAttribute('position').count;
    return sum + (n / 3) * (m instanceof THREE.InstancedMesh ? m.count : 1);
  }, 0);
}

/** ワールド座標の外接箱（InstancedMesh は対象外） */
function worldBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const m of meshesOf(root)) {
    if (m instanceof THREE.InstancedMesh) continue;
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox;
    if (b) box.union(b.clone().applyMatrix4(m.matrixWorld));
  }
  return box;
}

function box(mat: THREE.Material, x: number, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

describe('mergeStaticMeshes', () => {
  it('同じ材質の部品は 1 つのメッシュになり、形と位置は変わらない', () => {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#888888' });
    const sub = new THREE.Group();
    sub.position.set(5, 2, 0);
    sub.rotation.y = 0.7;
    sub.add(box(mat, 1), box(mat, 2, 1));
    group.add(box(mat, 0), sub);
    group.position.set(10, 0, -4);
    const trisBefore = triangleCount(group);
    const boxBefore = worldBox(group);

    const result = mergeStaticMeshes(group);

    const meshes = meshesOf(group);
    expect(meshes).toHaveLength(1);
    expect(result.merged).toHaveLength(1);
    expect(result.removedCount).toBe(3);
    expect(meshes[0]?.material).toBe(mat);
    expect(meshes[0]?.castShadow).toBe(true);
    expect(meshes[0]?.parent).toBe(group);
    expect(triangleCount(group)).toBe(trisBefore);
    const boxAfter = worldBox(group);
    expect(boxAfter.min.distanceTo(boxBefore.min)).toBeLessThan(1e-4);
    expect(boxAfter.max.distanceTo(boxBefore.max)).toBeLessThan(1e-4);
    // 部品を取り除いて空になった入れ物は残さない
    expect(group.children).toHaveLength(1);
  });

  it('違う材質・違う影の設定の部品は別のまま', () => {
    const group = new THREE.Group();
    const a = new THREE.MeshStandardMaterial({ color: '#aa0000' });
    const b = new THREE.MeshStandardMaterial({ color: '#aa0000' });
    const noShadow = box(a, 3);
    noShadow.castShadow = false;
    group.add(box(a, 0), box(a, 1), box(b, 2), box(b, 4), noShadow);

    mergeStaticMeshes(group);

    const meshes = meshesOf(group);
    // a（影あり）・b（影あり）・a（影なし）の 3 つ
    expect(meshes).toHaveLength(3);
    expect(meshes.filter((m) => m.material === a)).toHaveLength(2);
    expect(meshes.filter((m) => m.material === b)).toHaveLength(1);
    // 相手のいない部品は作り直さずに元のまま残る
    expect(meshes).toContain(noShadow);
  });

  it('回る物（keep）・InstancedMesh・透明な材質はまとめない', () => {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial();
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });
    const rotor = new THREE.Group();
    const blade = box(mat, 0, 3);
    rotor.add(blade);
    const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, 4);
    const glassA = box(glass, 5);
    const glassB = box(glass, 6);
    group.add(box(mat, 0), box(mat, 1), rotor, instanced, glassA, glassB);

    mergeStaticMeshes(group, { keep: [rotor] });

    const meshes = meshesOf(group);
    expect(rotor.parent).toBe(group);
    expect(blade.parent).toBe(rotor);
    expect(instanced.parent).toBe(group);
    expect(glassA.parent).toBe(group);
    expect(glassB.parent).toBe(group);
    // まとめた 1 つ＋羽根＋InstancedMesh＋ガラス 2 つ
    expect(meshes).toHaveLength(5);
    expect(meshes.filter((m) => m.material === mat && m !== blade && m !== instanced)).toHaveLength(1);
  });

  it('材質の配列を持つメッシュは材質ごとに切り分けて振り分ける', () => {
    const group = new THREE.Group();
    const roof = new THREE.MeshStandardMaterial({ color: '#333333' });
    const wall = new THREE.MeshStandardMaterial({ color: '#eeeeee' });
    const geo = new THREE.BoxGeometry(2, 2, 2);
    geo.clearGroups();
    geo.addGroup(0, 12, 0);
    geo.addGroup(12, Infinity, 1);
    const body = new THREE.Mesh(geo, [roof, wall]);
    body.castShadow = true;
    group.add(body, box(roof, 4));
    const trisBefore = triangleCount(group);

    mergeStaticMeshes(group);

    const meshes = meshesOf(group);
    expect(meshes).toHaveLength(2);
    expect(meshes.every((m) => !Array.isArray(m.material))).toBe(true);
    expect(meshes.filter((m) => m.material === roof)).toHaveLength(1);
    expect(meshes.filter((m) => m.material === wall)).toHaveLength(1);
    expect(drawCalls(group)).toBe(2);
    expect(triangleCount(group)).toBe(trisBefore);
  });

  it('鏡に映した部品（行列式が負）は三角形の向きを戻して表を外に向ける', () => {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial();
    const mirrored = box(mat, 3);
    mirrored.scale.set(-1, 1, 1);
    group.add(box(mat, 0), mirrored);

    mergeStaticMeshes(group);

    const mesh = meshesOf(group)[0];
    expect(mesh).toBeDefined();
    const g = (mesh as THREE.Mesh).geometry;
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const idx = g.index;
    expect(idx).not.toBeNull();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    let agree = 0;
    const total = (idx as THREE.BufferAttribute).count / 3;
    for (let i = 0; i < (idx as THREE.BufferAttribute).count; i += 3) {
      const ia = (idx as THREE.BufferAttribute).getX(i);
      a.fromBufferAttribute(pos, ia);
      b.fromBufferAttribute(pos, (idx as THREE.BufferAttribute).getX(i + 1));
      c.fromBufferAttribute(pos, (idx as THREE.BufferAttribute).getX(i + 2));
      const face = b.sub(a).cross(c.sub(a));
      n.fromBufferAttribute(nrm, ia);
      if (face.dot(n) > 0) agree += 1;
    }
    expect(agree).toBe(total);
  });
});

describe('建物の group のまとめ（buildBuildingsGroup）', () => {
  const terrain = readData<TerrainGrid>('terrain.json');
  const buildings = readData<BuildingFeature[]>('buildings.json');
  const config = getCampusConfig('senriyama');
  const separate = buildBuildingsGroup(buildings, terrain.minElevation, config, {
    terrain,
    mergeStaticParts: false,
  });
  const merged = buildBuildingsGroup(buildings, terrain.minElevation, config, { terrain });

  it('主役の建物の描画命令が減り、三角形の数は変わらない', () => {
    for (const id of ['main-gate', 'innovation', 'library', 'centenary', 'area3']) {
      const before = separate.campusRecords.get(id);
      const after = merged.campusRecords.get(id);
      expect(before && after).toBeTruthy();
      if (!before || !after) continue;
      expect(drawCalls(after.group)).toBeLessThan(drawCalls(before.group));
      expect(triangleCount(after.group)).toBe(triangleCount(before.group));
    }
  });

  it('まとめた後のメッシュがすべて当たり判定の対象で、その建物の buildingId を持つ', () => {
    const interactive = new Set(merged.interactiveMeshes);
    for (const [id, rec] of merged.campusRecords) {
      for (const m of meshesOf(rec.group)) {
        expect(interactive.has(m)).toBe(true);
        expect(m.userData.buildingId).toBe(id);
      }
    }
    // 取り除いた元のメッシュは当たり判定に残っていない
    for (const obj of merged.interactiveMeshes) {
      let cur: THREE.Object3D | null = obj;
      while (cur && cur.parent) cur = cur.parent;
      expect(cur).toBe(merged.root);
    }
  });

  it('建物をまたいでまとめない（材質は 1 棟の中だけで使われる）', () => {
    const owner = new Map<THREE.Material, string>();
    for (const [id, rec] of merged.campusRecords) {
      for (const m of meshesOf(rec.group)) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          const prev = owner.get(mat);
          if (prev !== undefined) expect(prev).toBe(id);
          owner.set(mat, id);
        }
      }
    }
  });

  it('光らせる材質（primaryMaterials）は、まとめた後も group の中のメッシュが使っている', () => {
    for (const rec of merged.campusRecords.values()) {
      const used = new Set<THREE.Material>();
      for (const m of meshesOf(rec.group)) {
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) used.add(mat);
      }
      for (const entry of rec.primaryMaterials) {
        expect(used.has(entry.mat)).toBe(true);
      }
    }
  });

  it('真上から当てると、まとめた後もその建物が選ばれる', () => {
    merged.root.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    for (const id of ['innovation', 'library', 'rimpukan', 'kanbunkan', 'enshinkan']) {
      const b = buildings.find((x) => x.id === id);
      expect(b).toBeDefined();
      if (!b) continue;
      raycaster.set(new THREE.Vector3(b.centroid.x, 500, b.centroid.z), new THREE.Vector3(0, -1, 0));
      const hits = raycaster.intersectObjects(merged.interactiveMeshes, false);
      expect(hits[0]?.object.userData.buildingId).toBe(id);
    }
  });
});
