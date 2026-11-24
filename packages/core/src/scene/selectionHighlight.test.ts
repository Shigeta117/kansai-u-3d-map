import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyBuildingWings } from '../data/loadCampusData';
import { getCampusConfig } from '../domain/campus-registry';
import type { BuildingFeature, TerrainGrid } from '../domain/types';
import { applyBuildingVisualStates, applyRoofColorMode, buildBuildingsGroup } from './BuildingBuilder';
import { HERO_BUILDERS } from './heroes';
import { SCENE_PALETTE } from './palette';
import {
  buildOutlineHullGeometry,
  DEFAULT_SELECTION_LOOK,
  parseSelectionLook,
  SelectionHighlighter,
} from './selectionHighlight';

function readData<T>(file: string): T {
  const url = new URL(`../../../../public/data/senriyama/${file}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

const config = getCampusConfig('senriyama');
const terrain = readData<TerrainGrid>('terrain.json');
const buildings = applyBuildingWings(readData<BuildingFeature[]>('buildings.json'));
// 部品ごとのメッシュのまま（まとめない）で組み、部品ごとに殻に入っているかを調べる
const parts = buildBuildingsGroup(buildings, terrain.minElevation, config, {
  terrain,
  campusOnly: true,
  mergeStaticParts: false,
});
// 本番と同じく部品をまとめた組み方
const merged = buildBuildingsGroup(buildings, terrain.minElevation, config, { terrain, campusOnly: true });

function recordOf(built: typeof parts, id: string) {
  const rec = built.campusRecords.get(id);
  if (!rec) throw new Error(`${id} missing`);
  return rec;
}

/** メッシュの見える不透明な三角形（group の座標。InstancedMesh は 1 つずつ展開） */
function opaqueTriangles(mesh: THREE.Mesh, root: THREE.Object3D): THREE.Triangle[] {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const pos = geometry.getAttribute('position');
  const index = geometry.index;
  const total = index ? index.count : pos.count;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const ranges = Array.isArray(mesh.material)
    ? geometry.groups.filter((g) => {
        const m = mats[g.materialIndex ?? 0];
        return m && m.visible && !m.transparent;
      })
    : mats[0] && mats[0].visible && !mats[0].transparent
      ? [{ start: 0, count: total }]
      : [];
  root.updateMatrixWorld(true);
  const base = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const instances: THREE.Matrix4[] = [];
  if (mesh instanceof THREE.InstancedMesh) {
    for (let k = 0; k < mesh.count; k++) {
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(k, m);
      instances.push(base.clone().multiply(m));
    }
  } else {
    instances.push(base);
  }
  const out: THREE.Triangle[] = [];
  for (const m of instances) {
    for (const r of ranges) {
      for (let i = r.start; i + 2 < Math.min(r.start + r.count, total); i += 3) {
        const v = [0, 1, 2].map((k) =>
          new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(m),
        ) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
        out.push(new THREE.Triangle(...v));
      }
    }
  }
  return out;
}

function isShown(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = obj; cur && cur !== root; cur = cur.parent) {
    if (!cur.visible) return false;
  }
  return true;
}

const key = (p: THREE.Vector3): string => `${Math.round(p.x * 100)},${Math.round(p.y * 100)},${Math.round(p.z * 100)}`;

function shellTriangles(shell: THREE.BufferGeometry): THREE.Triangle[] {
  const pos = shell.getAttribute('position');
  const out: THREE.Triangle[] = [];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    out.push(
      new THREE.Triangle(
        new THREE.Vector3().fromBufferAttribute(pos, i),
        new THREE.Vector3().fromBufferAttribute(pos, i + 1),
        new THREE.Vector3().fromBufferAttribute(pos, i + 2),
      ),
    );
  }
  return out;
}

const areaOf = (tris: THREE.Triangle[]): number => tris.reduce((s, t) => s + t.getArea(), 0);

describe('URL の sel=（選んだ建物の見た目を比べる）', () => {
  it('reads the default chosen by the owner (amber outline + fill + lift) when sel is missing or empty', () => {
    expect(parseSelectionLook(null)).toEqual(DEFAULT_SELECTION_LOOK);
    expect(parseSelectionLook('')).toEqual(DEFAULT_SELECTION_LOOK);
    expect(DEFAULT_SELECTION_LOOK).toEqual({ outline: 'hull', outlineColor: 'amber', fill: true, lift: true, dimOthers: false });
  });

  it('turns on only the listed elements', () => {
    expect(parseSelectionLook('outline,fill,lift')).toEqual({
      outline: 'hull',
      outlineColor: 'amber',
      fill: true,
      lift: true,
      dimOthers: false,
    });
    expect(parseSelectionLook(' outline , ink ,dim')).toMatchObject({ outline: 'hull', outlineColor: 'ink', fill: false, dimOthers: true });
    expect(parseSelectionLook('edges')).toMatchObject({ outline: 'edges', fill: false });
    expect(parseSelectionLook('lift')).toMatchObject({ outline: 'none', fill: false, lift: true });
  });
});

describe('建物全体の殻（光らせる範囲を形から決める）', () => {
  it('covers every visible opaque part of 第3学舎, not just the primary materials', () => {
    // 再発防止: 以前は primaryMaterials（塔の壁・棟の壁・屋根）だけを光らせ、フィン・ガラス・タイル・機械室・庇が元の色のままだった
    const rec = recordOf(parts, 'area3');
    const shell = rec.selectionShell;
    expect(shell).toBeDefined();
    if (!shell) return;
    const inShell = new Set(shellTriangles(shell).map((t) => key(t.getMidpoint(new THREE.Vector3()))));
    const primary = new Set<THREE.Material>(rec.primaryMaterials.map((e) => e.mat));
    let checked = 0;
    let nonPrimaryArea = 0;
    let totalArea = 0;
    rec.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !isShown(obj, rec.group)) return;
      const tris = opaqueTriangles(obj, rec.group);
      if (tris.length === 0) return;
      checked++;
      for (const t of tris) {
        expect(inShell.has(key(t.getMidpoint(new THREE.Vector3()))), `${obj.name} の三角形が殻に無い`).toBe(true);
      }
      const area = areaOf(tris);
      totalArea += area;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (!mats.some((m) => primary.has(m))) nonPrimaryArea += area;
    });
    expect(checked).toBeGreaterThan(10);
    // 主な材質でない部品が面の 5% 以上ある（以前はここが光らなかった）
    expect(nonPrimaryArea / totalArea).toBeGreaterThan(0.05);
    expect(areaOf(shellTriangles(shell))).toBeCloseTo(totalArea, 0);
  });

  it('matches the visible opaque surface of every hero building (the next hero gets it for free)', () => {
    for (const id of Object.keys(HERO_BUILDERS)) {
      if (!parts.campusRecords.has(id)) continue;
      const rec = recordOf(parts, id);
      const shell = rec.selectionShell;
      expect(shell, id).toBeDefined();
      if (!shell) continue;
      let area = 0;
      rec.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && isShown(obj, rec.group)) area += areaOf(opaqueTriangles(obj, rec.group));
      });
      expect(areaOf(shellTriangles(shell)), id).toBeCloseTo(area, 0);
    }
  });

  it('is cut before the parts are merged (same shape as the unmerged build) for every building with meshes', () => {
    for (const [id, rec] of merged.campusRecords) {
      const hasMesh = rec.group.children.length > 0;
      if (!hasMesh) continue;
      expect(rec.selectionShell, id).toBeDefined();
      const a = areaOf(shellTriangles(rec.selectionShell ?? new THREE.BufferGeometry()));
      const b = areaOf(shellTriangles(recordOf(parts, id).selectionShell ?? new THREE.BufferGeometry()));
      expect(a, id).toBeCloseTo(b, 0);
    }
  });
});

describe('輪郭の形（殻を画面の上で太らせる）', () => {
  it('welds the triangle soup and points corner normals outward diagonally (no cracks at corners)', () => {
    const box = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    const hull = buildOutlineHullGeometry(box);
    expect(hull.getAttribute('position').count).toBe(8);
    expect(hull.index?.count).toBe(36);
    const pos = hull.getAttribute('position');
    const nrm = hull.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
      const n = new THREE.Vector3().fromBufferAttribute(nrm, i);
      expect(n.length()).toBeCloseTo(1, 5);
      expect(n.dot(p)).toBeCloseTo(1, 5);
    }
  });

  it('counts a split face once, so a wide roof does not pull the corner normal upward', () => {
    // 屋根を 4 枚に割っても、角の法線は (1, 1, 1) の向き（面の数や広さで重みを付けない）
    const geo = new THREE.BoxGeometry(20, 2, 2, 4, 1, 1).toNonIndexed();
    const hull = buildOutlineHullGeometry(geo);
    const pos = hull.getAttribute('position');
    const nrm = hull.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i);
      if (Math.abs(p.x) < 9.99) continue;
      const n = new THREE.Vector3().fromBufferAttribute(nrm, i);
      expect(Math.abs(n.x)).toBeCloseTo(1 / Math.sqrt(3), 5);
      expect(Math.abs(n.y)).toBeCloseTo(1 / Math.sqrt(3), 5);
    }
  });
});

describe('選んだ建物に重ねる物', () => {
  const rec = recordOf(merged, 'area3');

  it.each([
    ['outline,fill', 2],
    ['outline', 2],
    ['fill', 1],
    ['edges', 1],
    ['edges,fill', 2],
    ['lift', 0],
  ])('sel=%s draws %i extra objects on the whole-building shell', (sel, count) => {
    const hl = new SelectionHighlighter(parseSelectionLook(sel));
    hl.show(rec.group, rec.selectionShell);
    expect(hl.drawnObjectCount()).toBe(count);
    const fill = hl.root.getObjectByName('selection-fill') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    if (fill) {
      expect(fill.geometry).toBe(rec.selectionShell);
      // 輪郭だけのときは色を書かずに、輪郭を外周に残すための印（ステンシル）だけ付ける
      expect(fill.material.colorWrite).toBe(sel.includes('fill'));
    }
    hl.dispose();
    expect(hl.isShown()).toBe(false);
  });
});

describe('薄める（カテゴリの絞り込み・選んでいない建物）', () => {
  const records = new Map([
    ['area3', recordOf(merged, 'area3')],
    ['library', recordOf(merged, 'library')],
    ['enshinkan', recordOf(merged, 'enshinkan')],
    ['area1-1', recordOf(merged, 'area1-1')],
  ]);
  const dimTarget = new THREE.Color(SCENE_PALETTE.selection.dimTarget);
  const expectDimmed = (id: string, dimmed: boolean): void => {
    const rec = records.get(id);
    if (!rec) throw new Error(id);
    for (const e of rec.allMaterials) {
      const want = new THREE.Color(e.baseHex);
      if (dimmed) want.lerp(dimTarget, 0.65);
      expect(e.mat.color.getHex(), `${id} ${e.mat.name || e.baseHex}`).toBe(want.getHex());
    }
  };

  it('lists every material used in the group (after merging)', () => {
    for (const [id, rec] of merged.campusRecords) {
      const listed = new Set(rec.allMaterials.map((e) => e.mat));
      rec.group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
          if (m instanceof THREE.MeshStandardMaterial) expect(listed.has(m), id).toBe(true);
        }
      });
    }
  });

  it('dims every part of the filtered-out buildings (heroes included), and restores them', () => {
    applyBuildingVisualStates(records, null, 'area3');
    expectDimmed('area3', false);
    expectDimmed('library', true);
    expectDimmed('enshinkan', true);
    applyBuildingVisualStates(records, null, 'all');
    for (const id of records.keys()) expectDimmed(id, false);
  });

  it('dims the buildings other than the selected one only with sel=dim', () => {
    applyBuildingVisualStates(records, 'library', 'all');
    for (const id of records.keys()) expectDimmed(id, false);
    applyBuildingVisualStates(records, 'library', 'all', { dimOthers: true });
    expectDimmed('library', false);
    expectDimmed('area3', true);
    expectDimmed('area1-1', true);
    applyBuildingVisualStates(records, null, 'all', { dimOthers: true });
    for (const id of records.keys()) expectDimmed(id, false);
  });

  it('lowers the glow of lit windows by the same amount when dimmed, and keeps it otherwise', () => {
    const rec = records.get('enshinkan');
    const lit = rec?.allMaterials.find((e) => (e.baseEmissiveIntensity ?? 0) > 0 && e.mat.emissive.getHex() !== 0);
    expect(lit).toBeDefined();
    if (!lit) return;
    const base = lit.baseEmissiveIntensity ?? 0;
    applyBuildingVisualStates(records, 'enshinkan', 'all');
    expect(lit.mat.emissiveIntensity).toBe(base);
    applyBuildingVisualStates(records, null, 'area3');
    expect(lit.mat.emissiveIntensity).toBeCloseTo(base * 0.35, 6);
    applyBuildingVisualStates(records, null, 'all');
    expect(lit.mat.emissiveIntensity).toBe(base);
  });

  it('keeps the roof color switch working through the shared roof entry', () => {
    const rec = records.get('area1-1');
    const roof = rec?.roofColors?.entry;
    expect(roof && rec?.allMaterials.includes(roof)).toBe(true);
    if (!roof) return;
    applyRoofColorMode(records, 'area');
    applyBuildingVisualStates(records, null, 'all');
    expect(roof.mat.color.getHex()).toBe(new THREE.Color(roof.baseHex).getHex());
    applyRoofColorMode(records, 'aerial');
    applyBuildingVisualStates(records, null, 'all');
  });
});
