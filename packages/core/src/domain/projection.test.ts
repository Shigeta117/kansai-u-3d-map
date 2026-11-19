import { describe, expect, it } from 'vitest';
import {
  computeVisualY,
  createProjectionOrigin,
  geoToLocal,
  localToGeo,
  sampleElevation,
} from './projection';
import type { TerrainGrid } from './types';

describe('projection', () => {
  const origin = createProjectionOrigin(34.7745, 135.5105);

  it('places Kandai-mae Station southwest (+Z south, -X west) of origin', () => {
    const station = geoToLocal({ lat: 34.77109, lon: 135.506038 }, origin);
    expect(station.x).toBeLessThan(-350);
    expect(station.z).toBeGreaterThan(300);
  });

  it('roundtrips geoToLocal and localToGeo accurately', () => {
    const input = { lat: 34.776301, lon: 135.510467 };
    const local = geoToLocal(input, origin);
    const back = localToGeo(local, origin);
    expect(back.lat).toBeCloseTo(input.lat, 6);
    expect(back.lon).toBeCloseTo(input.lon, 6);
  });

  it('bilinearly interpolates and clamps TerrainGrid elevation', () => {
    const grid: TerrainGrid = {
      cols: 2,
      rows: 2,
      minX: 0,
      maxX: 10,
      minZ: 0,
      maxZ: 10,
      minElevation: 20,
      maxElevation: 40,
      elevations: [20, 30, 30, 40],
    };

    expect(sampleElevation(grid, 0, 0)).toBeCloseTo(20, 4);
    expect(sampleElevation(grid, 10, 10)).toBeCloseTo(40, 4);
    expect(sampleElevation(grid, 5, 5)).toBeCloseTo(30, 4);
    expect(sampleElevation(grid, -20, -20)).toBeCloseTo(20, 4);
    expect(sampleElevation(grid, 50, 50)).toBeCloseTo(40, 4);
  });

  it('computes visual Y with vertical exaggeration', () => {
    expect(computeVisualY(45, 25, 1.35)).toBeCloseTo(27, 4);
  });
});

