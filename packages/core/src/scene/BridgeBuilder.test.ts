import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SENRIYAMA_CONFIG } from '../data/campuses/senriyama/config';
import { computeVisualY } from '../domain/projection';
import type { CampusStructuresData, PathFeature, TerrainGrid } from '../domain/types';
import {
  buildStructuresBridgesGroup,
  DECK_ROOF_CROWN_M,
  DECK_ROOF_SECTIONS,
  DECK_WALL_HEIGHT_M,
} from './BridgeBuilder';

/**
 * 第3学舎連絡デッキの屋根と壁（public/data/senriyama の実データで確かめる）。
 * 屋根と壁は南棟のデッキとの合流点から道路（path_158856536）の上をまたいで第3学舎の側の端まで続き、
 * 階段の合流点で屋根が途切れて南の壁が開く。第3学舎へ入る短い橋の口では南の壁だけが開く（持ち主の 2023 年の映像）
 */
const dataDir = path.resolve(process.cwd(), 'public/data/senriyama');
const readJson = <T>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8')) as T;

const terrain = readJson<TerrainGrid>('terrain.json');
const structures = readJson<CampusStructuresData>('structures.json');
const paths = readJson<PathFeature[]>('paths.json');
const vis = (e: number): number => computeVisualY(e, terrain.minElevation, SENRIYAMA_CONFIG.verticalExaggeration);

type P2 = [number, number];

function crossing(a: P2, b: P2, c: P2, d: P2): P2 | null {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0]! * s[1]! - r[1]! * s[0]!;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1]! - (c[1] - a[1]) * s[0]!) / den;
  const u = ((c[0] - a[0]) * r[1]! - (c[1] - a[1]) * r[0]!) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + r[0]! * t, a[1] + r[1]! * t];
}

describe('第3学舎連絡デッキの屋根と壁', () => {
  const group = buildStructuresBridgesGroup(structures, terrain, SENRIYAMA_CONFIG);
  group.updateMatrixWorld(true);
  const deck = group.getObjectByName('bridge-shurei-west');
  const bridge = structures.bridges.find((b) => b.id === 'bridge-shurei-west');
  if (!deck || !bridge) throw new Error('bridge-shurei-west missing');
  const roof = deck.getObjectByName('deck-roof');
  const walls = deck.getObjectByName('deck-roof-walls');

  // 道路がデッキの下をくぐる点（デッキの折れ線と道路の折れ線の交点）
  const road = paths.find((p) => p.id === 'path_158856536');
  let under: P2 | null = null;
  let deckY = 0;
  if (road) {
    for (let i = 0; i < bridge.points.length - 1 && !under; i++) {
      const a = bridge.points[i]!;
      const b = bridge.points[i + 1]!;
      for (let j = 0; j < road.points.length - 1 && !under; j++) {
        const hit = crossing([a[0], a[2]], [b[0], b[2]], road.points[j]!, road.points[j + 1]!);
        if (hit) {
          under = hit;
          deckY = vis((a[1] + b[1]) / 2);
        }
      }
    }
  }

  const hitsAt = (obj: THREE.Object3D, x: number, z: number): number =>
    new THREE.Raycaster(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0)).intersectObject(obj).length;
  /** デッキの頂点 i と i+1 の間の点（t は 0〜1）と、その所の南向き・北向きの横の向き */
  const along = (i: number, t: number): { p: P2; south: P2 } => {
    const a = bridge.points[i]!;
    const b = bridge.points[i + 1]!;
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dz);
    // デッキは東西に延びるので、横の向きのうち z が正の方が南
    const n: P2 = [-dz / len, dx / len];
    const south: P2 = n[1] > 0 ? n : [-n[0], -n[1]];
    return { p: [a[0] + dx * t, a[2] + dz * t], south };
  };
  /** 壁の厚みの真ん中（デッキの中心線から横へ） */
  const wallOffset = bridge.width / 2 - 0.12;

  it('finds the road crossing under the deck', () => {
    expect(under).not.toBeNull();
  });

  it('adds one roof mesh and one wall mesh (not one per rib)', () => {
    expect(roof).toBeInstanceOf(THREE.Mesh);
    expect(walls).toBeInstanceOf(THREE.Mesh);
    let roofs = 0;
    deck.traverse((o) => {
      if (o.name === 'deck-roof' || o.name === 'deck-roof-walls') roofs++;
    });
    expect(roofs).toBe(2);
    expect(DECK_ROOF_SECTIONS.filter((s) => s.bridgeId === 'bridge-shurei-west')).toHaveLength(1);
  });

  it('covers the section above the road, with the crown above head height', () => {
    if (!under || !(roof instanceof THREE.Mesh)) throw new Error('missing');
    const ray = new THREE.Raycaster(new THREE.Vector3(under[0], deckY + 30, under[1]), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(roof);
    expect(hits.length).toBeGreaterThan(0);
    const crownY = hits[0]!.point.y;
    expect(crownY - deckY).toBeGreaterThan(2.3);
    expect(crownY - deckY).toBeLessThan(DECK_ROOF_CROWN_M + 0.2);
  });

  it('is metal grey, not the light-blue glass colour, and lets the sky through', () => {
    if (!(roof instanceof THREE.Mesh)) throw new Error('missing');
    const mat = roof.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    // Node では模様（canvas）が作れないので、灰色の半透明
    expect(mat.opacity).toBeLessThan(0.6);
    expect(Math.abs(mat.color.r - mat.color.b)).toBeLessThan(0.08);
    expect(`#${mat.color.getHexString()}`).not.toBe('#9ed0e0');
  });

  it('raises tall concrete walls on both sides of the deck above the road', () => {
    if (!under || !(walls instanceof THREE.Mesh)) throw new Error('missing');
    const { south } = along(2, 0.5);
    for (const sign of [1, -1]) {
      const x = under[0] + south[0] * wallOffset * sign;
      const z = under[1] + south[1] * wallOffset * sign;
      const hits = new THREE.Raycaster(new THREE.Vector3(x, deckY + 30, z), new THREE.Vector3(0, -1, 0)).intersectObject(walls);
      expect(hits.length).toBeGreaterThan(0);
      const top = hits[0]!.point.y - deckY;
      expect(top).toBeGreaterThan(DECK_WALL_HEIGHT_M - 0.3);
      expect(top).toBeLessThan(DECK_WALL_HEIGHT_M + 0.3);
    }
  });


  it('continues the roof and walls to the area3 end of the deck', () => {
    if (!(roof instanceof THREE.Mesh) || !(walls instanceof THREE.Mesh)) throw new Error('missing');
    const { p, south } = along(0, 0.5);
    expect(hitsAt(roof, p[0], p[1])).toBeGreaterThan(0);
    expect(hitsAt(walls, p[0] + south[0] * wallOffset, p[1] + south[1] * wallOffset)).toBeGreaterThan(0);
    expect(hitsAt(walls, p[0] - south[0] * wallOffset, p[1] - south[1] * wallOffset)).toBeGreaterThan(0);
  });

  it('breaks the roof and opens the south wall where the stairs join, keeping the north wall', () => {
    if (!(roof instanceof THREE.Mesh) || !(walls instanceof THREE.Mesh)) throw new Error('missing');
    const stairs = DECK_ROOF_SECTIONS[0]!.roofGaps[0]!.at;
    const { south } = along(1, 1);
    expect(hitsAt(roof, stairs[0], stairs[1])).toBe(0);
    expect(hitsAt(walls, stairs[0] + south[0] * wallOffset, stairs[1] + south[1] * wallOffset)).toBe(0);
    expect(hitsAt(walls, stairs[0] - south[0] * wallOffset, stairs[1] - south[1] * wallOffset)).toBeGreaterThan(0);
  });

  it('opens the south wall at the bridge into area3 but keeps the roof over it', () => {
    if (!(roof instanceof THREE.Mesh) || !(walls instanceof THREE.Mesh)) throw new Error('missing');
    const intoArea3 = structures.bridges.find((b) => b.id === 'bridge-490793070');
    if (!intoArea3) throw new Error('bridge-490793070 missing');
    const joint = intoArea3.points[intoArea3.points.length - 1]!;
    const { south } = along(0, 1);
    expect(hitsAt(roof, joint[0], joint[2])).toBeGreaterThan(0);
    expect(hitsAt(walls, joint[0] + south[0] * wallOffset, joint[2] + south[1] * wallOffset)).toBe(0);
    expect(hitsAt(walls, joint[0] - south[0] * wallOffset, joint[2] - south[1] * wallOffset)).toBeGreaterThan(0);
  });
});
