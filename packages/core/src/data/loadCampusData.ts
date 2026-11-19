import type {
  BuildingFeature,
  CampusDataset,
  CampusDatasetMeta,
  CampusId,
  CampusStructuresData,
  LandcoverFeature,
  PathFeature,
  TerrainGrid,
  TransportData,
  WalkGraph,
} from '../domain/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url} (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function loadCampusDataset(campusId: CampusId): Promise<CampusDataset> {
  const base = `/data/${campusId}`;
  const [meta, terrain, buildings, landcover, paths, structures, walkGraph, transport] =
    await Promise.all([
      fetchJson<CampusDatasetMeta>(`${base}/meta.json`),
      fetchJson<TerrainGrid>(`${base}/terrain.json`),
      fetchJson<BuildingFeature[]>(`${base}/buildings.json`),
      fetchJson<LandcoverFeature[]>(`${base}/landcover.json`),
      fetchJson<PathFeature[]>(`${base}/paths.json`),
      fetchJson<CampusStructuresData>(`${base}/structures.json`),
      fetchJson<WalkGraph>(`${base}/walk-graph.json`),
      fetchJson<TransportData>(`${base}/transport.json`),
    ]);

  return {
    meta,
    terrain,
    buildings,
    landcover,
    paths,
    structures,
    walkGraph,
    transport,
  };
}

