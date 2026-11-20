import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SENRIYAMA_WALL_HEX } from '../data/campuses/senriyama/wall-colors';
import { getCampusConfig } from '../domain/campus-registry';
import type { BuildingFeature, TerrainGrid } from '../domain/types';
import { applyRoofColorMode, buildBuildingsGroup } from './BuildingBuilder';

function readData<T>(file: string): T {
  const url = new URL(`../../../../public/data/senriyama/${file}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

/** 主役ではない一般の建物の壁の色を、写真で確かめた建物だけ上書きする（wall-colors.ts） */
describe('建物ごとの壁の色の上書き', () => {
  const terrain = readData<TerrainGrid>('terrain.json');
  const buildings = readData<BuildingFeature[]>('buildings.json');
  const config = getCampusConfig('senriyama');
  const built = buildBuildingsGroup(buildings, terrain.minElevation, config, { terrain });

  const wallEntry = (id: string): { mat: THREE.MeshStandardMaterial; baseHex: string } => {
    const rec = built.campusRecords.get(id);
    if (!rec) throw new Error(`${id} missing`);
    // 一般の建物の primaryMaterials は [屋根, 壁]
    const entry = rec.primaryMaterials[rec.primaryMaterials.length - 1];
    if (!entry) throw new Error(`${id} has no wall`);
    return entry;
  };

  it('paints 尚文館 in the brick colour from the photos, not the area colour', () => {
    const wall = wallEntry('shobunkan');
    expect(wall.baseHex).toBe(SENRIYAMA_WALL_HEX.shobunkan);
    expect(`#${wall.mat.color.getHexString().toUpperCase()}`).toBe(SENRIYAMA_WALL_HEX.shobunkan);
    // れんがは赤みのある色（赤 > 青）
    expect(wall.mat.color.r).toBeGreaterThan(wall.mat.color.b + 0.08);
  });

  it('keeps other general buildings of the same area in the area colour', () => {
    const other = buildings.find(
      (b) => b.inCampus && b.category === 'shared' && b.id !== 'shobunkan' && built.campusRecords.get(b.id)?.roofColors,
    );
    if (!other) throw new Error('no other shared building');
    expect(wallEntry(other.id).baseHex).not.toBe(SENRIYAMA_WALL_HEX.shobunkan);
  });

  it('keeps the area roof colour derived from the area wall colour (not from the brick)', () => {
    const rec = built.campusRecords.get('shobunkan');
    if (!rec?.roofColors) throw new Error('shobunkan roof colours missing');
    applyRoofColorMode(built.campusRecords, 'area');
    const roof = new THREE.Color(rec.roofColors.area);
    // エリア（shared）の壁の色はクリーム色なので、エリアの屋根も明るい
    expect(roof.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(0.7);
    applyRoofColorMode(built.campusRecords, 'aerial');
  });
});
