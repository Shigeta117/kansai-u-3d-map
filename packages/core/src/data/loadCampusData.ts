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
import { SENRIYAMA_BUILDING_PARTS } from './campuses/senriyama/building-parts';
import { joinBuildingWings, joinSheetWings, pickableWingBuildingIds } from '../domain/wings';
import { SENRIYAMA_WING_BUILDINGS, SENRIYAMA_WINGS } from './campuses/senriyama/wings';

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
    buildings:
      campusId === 'senriyama'
        ? applyBuildingWings(applyBuildingParts(applyBuildingFacts(buildings)))
        : buildings,
    landcover,
    paths,
    structures,
    walkGraph,
    transport,
  };
}

/**
 * 公式の資料で確かめた階数を当てる（OSM の階数より多いときだけ。building-facts.ts の注を参照）。
 * 現地で数えた階数（observedOnSite）だけは少ない方へも直し、高さを今の式（階数 × 3.8m ＋ 1.4m）にそろえる
 */
export function applyBuildingFacts(buildings: BuildingFeature[]): BuildingFeature[] {
  const facts = new Map(SENRIYAMA_BUILDING_FACTS.map((f) => [f.id, f]));
  return buildings.map((b) => {
    const fact = facts.get(b.id);
    if (!fact) return b;
    if (fact.observedOnSite) {
      if (fact.levelsAbove === b.levels) return b;
      return { ...b, levels: fact.levelsAbove, height: heightForLevels(fact.levelsAbove) };
    }
    if (fact.levelsAbove <= b.levels) return b;
    return { ...b, levels: fact.levelsAbove, height: Math.max(b.height, heightForLevels(fact.levelsAbove)) };
  });
}

/**
 * 高さの違う塊に分かれる建物（building-parts.ts）に塊を付ける。建物の levels・height は最も高い塊の値にする
 * （ラベルの高さ・カメラの寄り方・建物シートの階数に使う）
 */
export function applyBuildingParts(buildings: BuildingFeature[]): BuildingFeature[] {
  const specs = new Map(SENRIYAMA_BUILDING_PARTS.map((s) => [s.buildingId, s]));
  return buildings.map((b) => {
    const spec = specs.get(b.id);
    if (!spec) return b;
    const parts = spec.parts.map((p) => ({
      name: p.name,
      levels: p.levels,
      height: heightForLevels(p.levels),
      polygon: p.polygon,
    }));
    const top = parts.reduce((a, p) => (p.height > a.height ? p : a));
    return { ...b, parts, levels: top.levels, height: top.height };
  });
}

/**
 * 棟の表と建物との対応の表（wings.ts）を合わせて、地図で棟を押して選べる建物（今は第3学舎の A〜D棟と第4学舎2号館の教室棟・研究棟、入れない棟の輪郭の研究棟別館）に棟を付ける。
 * 棟が 1 つの建物（入れない棟の輪郭を除く）と、塊の範囲の無い棟がある建物には付けない（pickableWingBuildingIds）。別の輪郭の棟をシートに並べる棟は sheetWings に付ける。地図・シート・検索の棟の扱いは
 * BuildingFeature.wings で決まるので、表に棟を足しても、範囲を書くまでは今の画面の動きは変わらない
 */
export function applyBuildingWings(buildings: BuildingFeature[]): BuildingFeature[] {
  const pickable = pickableWingBuildingIds(SENRIYAMA_WING_BUILDINGS, SENRIYAMA_WINGS);
  const byBuilding = joinBuildingWings(
    SENRIYAMA_WINGS,
    SENRIYAMA_WING_BUILDINGS.filter((l) => pickable.has(l.buildingId)),
  );
  const sheetWings = joinSheetWings(SENRIYAMA_WINGS, SENRIYAMA_WING_BUILDINGS);
  return buildings.map((b) => {
    const wings = byBuilding.get(b.id);
    const listed = sheetWings.get(b.id);
    return {
      ...b,
      ...(wings && wings.length > 0 ? { wings } : {}),
      ...(listed && listed.length > 0 ? { sheetWings: listed } : {}),
    };
  });
}
