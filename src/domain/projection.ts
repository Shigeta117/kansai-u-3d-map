import type { GeoCoord, LocalPoint2D, ProjectionOrigin, TerrainGrid } from './types';

export const DEFAULT_METERS_PER_DEG_LAT = 110940;
export const DEFAULT_METERS_PER_DEG_LON_AT_EQUATOR = 111320;

export function createProjectionOrigin(
  originLat: number,
  originLon: number,
): ProjectionOrigin {
  const metersPerDegLon =
    DEFAULT_METERS_PER_DEG_LON_AT_EQUATOR *
    Math.cos((originLat * Math.PI) / 180);
  return {
    originLat,
    originLon,
    metersPerDegLat: DEFAULT_METERS_PER_DEG_LAT,
    metersPerDegLon,
  };
}

/**
 * Right-handed Y-up projection:
 *   +X = East, -X = West
 *   -Z = North, +Z = South
 */
export function geoToLocal(
  coord: GeoCoord,
  origin: ProjectionOrigin,
): LocalPoint2D {
  const x = (coord.lon - origin.originLon) * origin.metersPerDegLon;
  const z = -(coord.lat - origin.originLat) * origin.metersPerDegLat;
  return { x, z };
}

export function localToGeo(
  point: LocalPoint2D,
  origin: ProjectionOrigin,
): GeoCoord {
  const lon = origin.originLon + point.x / origin.metersPerDegLon;
  const lat = origin.originLat - point.z / origin.metersPerDegLat;
  return { lat, lon };
}

/**
 * Bilinearly samples terrain elevation (in meters) at local (x, z).
 * Coordinates outside the grid are safely clamped to edge cells.
 */
export function sampleElevation(
  terrain: TerrainGrid,
  x: number,
  z: number,
): number {
  const { cols, rows, minX, maxX, minZ, maxZ, elevations } = terrain;
  if (cols < 2 || rows < 2 || elevations.length === 0) {
    return terrain.minElevation ?? 0;
  }

  const uRaw = (x - minX) / (maxX - minX);
  const vRaw = (z - minZ) / (maxZ - minZ);
  const u = Math.max(0, Math.min(1, uRaw));
  const v = Math.max(0, Math.min(1, vRaw));

  const fx = u * (cols - 1);
  const fz = v * (rows - 1);
  const ix0 = Math.min(cols - 2, Math.floor(fx));
  const iz0 = Math.min(rows - 2, Math.floor(fz));
  const ix1 = ix0 + 1;
  const iz1 = iz0 + 1;

  const tx = fx - ix0;
  const tz = fz - iz0;

  const e00 = elevations[iz0 * cols + ix0] ?? terrain.minElevation;
  const e10 = elevations[iz0 * cols + ix1] ?? e00;
  const e01 = elevations[iz1 * cols + ix0] ?? e00;
  const e11 = elevations[iz1 * cols + ix1] ?? e00;

  const top = e00 * (1 - tx) + e10 * tx;
  const bottom = e01 * (1 - tx) + e11 * tx;
  return top * (1 - tz) + bottom * tz;
}

export function computeVisualY(
  elevationM: number,
  minElevationM: number,
  verticalExaggeration: number,
): number {
  return (elevationM - minElevationM) * verticalExaggeration;
}

