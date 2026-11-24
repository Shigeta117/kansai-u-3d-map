import { describe, expect, it } from 'vitest';
import type { BuildingFeature } from '../domain/types';
import { applyBuildingFacts } from './loadCampusData';
import { heightForLevels, SENRIYAMA_BUILDING_FACTS } from './campuses/senriyama/building-facts';

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
  it('lowers 誠之館2号館 to the 2 storeys counted on site (the one exception)', () => {
    const [b] = applyBuildingFacts([make('way_624589994', 4, 16.6)]);
    expect(b?.levels).toBe(2);
    expect(b?.height).toBe(heightForLevels(2));
    expect(heightForLevels(2)).toBe(9);
  });
  it('allows lowering only for floor counts observed on site', () => {
    const lowering = SENRIYAMA_BUILDING_FACTS.filter((f) => f.observedOnSite);
    expect(lowering.map((f) => f.id)).toEqual(['way_624589994']);
    for (const f of lowering) expect(f.source).toMatch(/現地/);
  });
  it('leaves buildings without facts untouched', () => {
    const input = make('rimpukan', 4, 16.6);
    const [b] = applyBuildingFacts([input]);
    expect(b).toBe(input);
  });
});
