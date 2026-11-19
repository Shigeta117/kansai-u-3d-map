/**
 * 公式の資料で確かめた建物の事実（読み込み時に buildings.json の値を直す）。
 *
 * - 階数は、関西大学の教務ガイド KAN-CAN! の学舎・教室一覧（部屋のある最上階）と、年史編纂室の
 *   CAMPUS GUIDE MAP に書いてある階数から。部屋の一覧は屋上階・塔屋を含まないことがあるので、
 *   **OSM の階数より多いときだけ**直す（少ない方へは直さない）
 * - 高さは今のデータと同じ式（階数 × 3.8m ＋ 1.4m）
 * - 調査の記録: docs/visual-research/official-buildings.md（2026-11-20）
 */
export interface BuildingFact {
  id: string;
  levelsAbove: number;
  source: string;
}

const KANCAN = 'KAN-CAN! 学舎・教室一覧（千里山）';
const NENSHI = '年史編纂室 CAMPUS GUIDE MAP';

export const SENRIYAMA_BUILDING_FACTS: readonly BuildingFact[] = [
  { id: 'area2-1', levelsAbove: 5, source: KANCAN },
  { id: 'area2-2', levelsAbove: 7, source: KANCAN },
  { id: 'keisho-kenkyu', levelsAbove: 6, source: NENSHI },
  { id: 'shobunkan', levelsAbove: 7, source: NENSHI },
  { id: 'east-gym', levelsAbove: 3, source: KANCAN },
  { id: 'way_624590000', levelsAbove: 5, source: KANCAN },
  { id: 'area1-3', levelsAbove: 5, source: KANCAN },
  { id: 'way_423067254', levelsAbove: 5, source: KANCAN },
];

const FLOOR_HEIGHT_M = 3.8;
const PARAPET_M = 1.4;

export function heightForLevels(levels: number): number {
  return Number((levels * FLOOR_HEIGHT_M + PARAPET_M).toFixed(2));
}
