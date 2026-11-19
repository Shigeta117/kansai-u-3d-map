import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../domain/types';
import { applyBuildingFacts } from './loadCampusData';
import { heightForLevels } from './campuses/senriyama/building-facts';

const make = (id: string, levels: number, height: number): BuildingFeature =>
  ({ id, levels, height }) as unknown as BuildingFeature;

describe('applyBuildingFacts', () => {
  it('raises levels and height when the official floor count is higher', () => {
    const [b] = applyBuildingFacts([make('area2-2', 4, 16.6)]);
    expect(b?.levels).toBe(7);
    expect(b?.height).toBe(heightForLevels(7));
  });
  it('never lowers the OSM floor count', () => {
    const [b] = applyBuildingFacts([make('area2-2', 9, 35.6)]);
    expect(b?.levels).toBe(9);
    expect(b?.height).toBe(35.6);
  });
  it('leaves buildings without facts untouched', () => {
    const input = make('library', 2, 9);
    const [b] = applyBuildingFacts([input]);
    expect(b).toBe(input);
  });
});
