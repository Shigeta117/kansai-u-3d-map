import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getCampusConfig } from '../../domain/campus-registry';
import type { BuildingFeature } from '../../domain/types';
import {
  buildMainGate,
  SHUREI_BODY_BELOW_DECK_M,
  SHUREI_PARAPET_HEIGHT_M,
  SHUREI_WALK_DECK_ABOVE_GROUND_M,
} from './mainGate';

function createMainGateBuilding(): BuildingFeature {
  const cx = -127.7;
  const cz = 119.2;
  const radius = 4.5;
  const polygon: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    polygon.push([cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius]);
  }

  return {
    id: 'main-gate',
    landmarkId: 'main-gate',
    name: '関西大学 正門',
    shortName: '正門',
    kana: 'せいもん',
    englishName: 'Main Gate',
    category: 'gate',
    inCampus: true,
    faculties: ['メインエントランス'],
    facilityTags: ['gate'],
    keywords: ['正門'],
    description: '',
    sculptStyle: 'main-gate',
    labelPriority: 1,
    isSpotOnly: true,
    polygon,
    centroid: { x: cx, z: cz },
    groundY: 37.08,
    minGroundY: 37.08,
    maxGroundY: 37.08,
    height: 5.2,
    levels: 1,
    walkNodeId: null,
    accessibleWalkNodeId: null,
  };
}

describe('buildMainGate', () => {
  const groundVisualY = 12.5;
  const building = createMainGateBuilding();
  const flat = (): number => groundVisualY;

  it('builds a group with at least one mesh and stays lightweight', () => {
    const result = buildMainGate({ building, groundVisualY, sampleGroundVisualY: flat });
    let meshCount = 0;
    result.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshCount += 1;
      }
    });

    expect(meshCount).toBeGreaterThanOrEqual(1);
    expect(meshCount).toBeLessThanOrEqual(150);
  });

  it('produces only finite vertex coordinates (no NaN or Infinity)', () => {
    const result = buildMainGate({ building, groundVisualY, sampleGroundVisualY: flat });
    let checkedVertices = 0;

    result.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const pos = obj.geometry.getAttribute('position');
      expect(pos).toBeDefined();
      if (!pos) return;

      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i))).toBe(true);
        expect(Number.isFinite(pos.getY(i))).toBe(true);
        expect(Number.isFinite(pos.getZ(i))).toBe(true);
        checkedVertices += 1;
      }

      if (obj instanceof THREE.InstancedMesh) {
        for (const value of obj.instanceMatrix.array) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    });

    expect(checkedVertices).toBeGreaterThan(0);
  });

  it('fits its world bounding box within the specified main-gate bounds', () => {
    const result = buildMainGate({ building, groundVisualY, sampleGroundVisualY: flat });
    result.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(result.group);

    expect(box.isEmpty()).toBe(false);
    expect(box.min.x).toBeGreaterThanOrEqual(-150);
    expect(box.max.x).toBeLessThanOrEqual(-80);
    expect(box.min.z).toBeGreaterThanOrEqual(95);
    expect(box.max.z).toBeLessThanOrEqual(145);
    expect(box.min.y).toBeGreaterThanOrEqual(groundVisualY - 1);
    expect(box.max.y).toBeLessThanOrEqual(groundVisualY + 22);
  });

  it('returns bridge and monument stone as primaryMaterials and empty animated array', () => {
    const result = buildMainGate({ building, groundVisualY, sampleGroundVisualY: flat });

    expect(result.primaryMaterials.length).toBeGreaterThanOrEqual(1);
    expect(result.primaryMaterials).toHaveLength(2);
    expect(result.primaryMaterials.map((entry) => entry.baseHex)).toEqual([
      '#CFC3A6',
      '#C8C2B7',
    ]);
    expect(result.animated).toEqual([]);
  });

  describe('on the slope that rises east from the gate (about 0.1m per m)', () => {
    // 実データでは正門（x≈-128）から時計（x≈-95）まで約 3.6m 上り、門標（x≈-142）は約 1.8m 下がる
    const ground = (x: number, z: number): number =>
      groundVisualY + 0.1 * (x + 127.7) - 0.02 * (z - 119);
    const result = buildMainGate({ building, groundVisualY, sampleGroundVisualY: ground });
    result.group.updateMatrixWorld(true);

    /** 名前の物の、ワールドの箱と、その箱の底面の 4 隅で引いた地面の最低・最高 */
    const footprint = (name: string) => {
      const obj = result.group.getObjectByName(name);
      if (!obj) throw new Error(`${name} missing`);
      const box = new THREE.Box3().setFromObject(obj);
      const grounds = [
        ground(box.min.x, box.min.z),
        ground(box.min.x, box.max.z),
        ground(box.max.x, box.min.z),
        ground(box.max.x, box.max.z),
      ];
      return { box, minGround: Math.min(...grounds), maxGround: Math.max(...grounds) };
    };

    it('秀麗橋は上を歩く: 本体の上面（歩く面）が地面から 8m、両側に手すりの壁、本体は歩く面より下', () => {
      const body = footprint('shurei-bridge-body').box;
      expect(body.max.y).toBeCloseTo(groundVisualY + SHUREI_WALK_DECK_ABOVE_GROUND_M, 5);
      for (const side of ['west', 'east']) {
        const parapet = footprint(`shurei-bridge-parapet-${side}`).box;
        expect(parapet.min.y).toBeCloseTo(body.max.y, 5);
        expect(parapet.max.y).toBeCloseTo(body.max.y + SHUREI_PARAPET_HEIGHT_M, 5);
      }
      const soffit = footprint('shurei-bridge-soffit').box;
      expect(soffit.min.y).toBeCloseTo(body.max.y - SHUREI_BODY_BELOW_DECK_M, 5);
    });

    it('stands the monument sign, hedge, flagpoles and clock planter on their own ground', () => {
      for (const name of [
        'monument-sign-body',
        'monument-sign-hedge',
        'flagpole-1',
        'flagpole-2',
        'flagpole-3',
        'clock-planter-base',
      ]) {
        const { box, minGround, maxGround } = footprint(name);
        // 底は範囲のいちばん低い地面より下（浮かない）
        expect(box.min.y).toBeLessThan(minGround);
        // 上は範囲のいちばん高い地面より上（埋まらない）
        expect(box.max.y).toBeGreaterThan(maxGround + 0.25);
      }
      const sign = footprint('monument-sign-body');
      expect(sign.box.max.y - ground(-142, 111)).toBeCloseTo(1.9, 5);
      const pole = footprint('flagpole-1');
      expect(pole.box.max.y - ground(-139, 106)).toBeCloseTo(15, 5);
    });

    it('roots each tree trunk in the ground at the tree', () => {
      for (let i = 1; i <= 5; i++) {
        const tree = result.group.getObjectByName(`main-gate-tree-${i}`);
        if (!tree) throw new Error(`tree ${i} missing`);
        const trunk = tree.children[0];
        if (!trunk) throw new Error(`trunk ${i} missing`);
        const box = new THREE.Box3().setFromObject(trunk);
        const cx = (box.min.x + box.max.x) * 0.5;
        const cz = (box.min.z + box.max.z) * 0.5;
        expect(box.min.y).toBeLessThan(ground(cx, cz));
        expect(box.min.y).toBeGreaterThan(ground(cx, cz) - 1);
      }
    });

    it('lays the paving on the ground surface instead of a flat slab', () => {
      const paving = result.group.getObjectByName('main-gate-paving');
      if (!(paving instanceof THREE.Mesh)) throw new Error('paving missing');
      const pos = paving.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const lift = pos.getY(i) - ground(pos.getX(i), pos.getZ(i));
        expect(lift).toBeGreaterThan(0.05);
        expect(lift).toBeLessThan(0.14);
      }
    });
  });
});

describe('秀麗橋の歩く面と経路のデータの床', () => {
  it('walk-graph の秀麗橋の床の高さ（表示）と、モデルの歩く面の高さが 0.3m 以内でそろう', () => {
    const read = <T,>(f: string): T =>
      JSON.parse(readFileSync(new URL(`../../../../../public/data/senriyama/${f}`, import.meta.url), 'utf8')) as T;
    const buildings = read<BuildingFeature[]>('buildings.json');
    const structures = read<{ bridges: { id: string; points: [number, number, number][] }[] }>('structures.json');
    const gate = buildings.find((b) => b.id === 'main-gate');
    const shurei = structures.bridges.find((b) => b.id === 'bridge-shurei-north');
    expect(gate).toBeDefined();
    expect(shurei).toBeDefined();
    if (!gate || !shurei) return;
    // 橋の上（z 108〜137）の床のノード
    const onBridge = shurei.points.filter(([, , z]) => z > 108 && z < 137);
    expect(onBridge.length).toBeGreaterThan(0);
    const exag = getCampusConfig('senriyama').verticalExaggeration;
    for (const [, deckElev] of onBridge) {
      const deckAboveGateVisual = (deckElev - gate.groundY) * exag;
      expect(Math.abs(deckAboveGateVisual - SHUREI_WALK_DECK_ABOVE_GROUND_M)).toBeLessThan(0.3);
    }
  });
});
