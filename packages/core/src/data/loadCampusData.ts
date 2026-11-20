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
import { heightForLevels, SENRIYAMA_BUILDING_FACTS } from './campuses/senriyama/building-facts';
import { SENRIYAMA_BUILDING_WINGS } from './campuses/senriyama/wings';

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
    buildings: campusId === 'senriyama' ? applyBuildingWings(applyBuildingFacts(buildings)) : buildings,
    landcover,
    paths,
    structures,
    walkGraph,
    transport,
  };
}

/** 公式の資料で確かめた階数を当てる（OSM の階数より多いときだけ。building-facts.ts の注を参照） */
export function applyBuildingFacts(buildings: BuildingFeature[]): BuildingFeature[] {
  const facts = new Map(SENRIYAMA_BUILDING_FACTS.map((f) => [f.id, f]));
  return buildings.map((b) => {
    const fact = facts.get(b.id);
    if (!fact || fact.levelsAbove <= b.levels) return b;
    return { ...b, levels: fact.levelsAbove, height: Math.max(b.height, heightForLevels(fact.levelsAbove)) };
  });
}

/** 建物の中の棟（第3学舎の A〜D棟など。wings.ts）を付ける */
export function applyBuildingWings(buildings: BuildingFeature[]): BuildingFeature[] {
  return buildings.map((b) => {
    const wings = SENRIYAMA_BUILDING_WINGS[b.id];
    return wings && wings.length > 0 ? { ...b, wings: [...wings] } : b;
  });
}
