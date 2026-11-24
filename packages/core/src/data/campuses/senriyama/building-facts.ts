/**
 * 公式の資料で確かめた建物の事実（読み込み時に buildings.json の値を直す）。
 *
 * - 階数は、関西大学の教務ガイド KAN-CAN! の学舎・教室一覧（部屋のある最上階）と、年史編纂室の
 *   CAMPUS GUIDE MAP に書いてある階数から。部屋の一覧は屋上階・塔屋を含まないことがあるので、
 *   **OSM の階数より多いときだけ**直す（少ない方へは直さない）
 * - 例外: 持ち主が現地で数えた階数（observedOnSite）は、少ない方へも直す。誠之館2号館（OSM は 4 階）は
 *   2026-11-24 の現地確認で 2 階建（KAN-CAN! の部屋の一覧も地上 1 階までで、4 階の根拠が無い）
 * - 高さは今のデータと同じ式（階数 × 3.8m ＋ 1.4m）
 * - 調査の記録: docs/visual-research/official-buildings.md（2026-11-20）
 */
export interface BuildingFact {
  id: string;
  levelsAbove: number;
  source: string;
  /**
   * 現地で数えた階数（部屋の一覧の下限ではない）。OSM の階数より少なくても直す（「増やす向きだけ」の決まりの例外）。
   * 部屋の一覧と違って屋上階・塔屋の取りこぼしが無く、見た物そのものなので、少ない方へも直してよい
   */
  observedOnSite?: true;
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
  // 総合図書館: 地上 3 階・地下 2 階（docs/visual-research/library.md）。バリアフリーマップでも書庫が B2 階まで
  { id: 'library', levelsAbove: 3, source: '総合図書館の調査メモ・バリアフリーマップ' },
  // 誠之館2号館: 現地で 2 階建（持ち主の確認 2026-11-24。南側の道路からも 2 階建に見える。docs/visual-research/official-buildings.md）
  { id: 'way_624589994', levelsAbove: 2, source: '持ち主の現地確認（2026-11-24）', observedOnSite: true },
];

const FLOOR_HEIGHT_M = 3.8;
const PARAPET_M = 1.4;

export function heightForLevels(levels: number): number {
  return Number((levels * FLOOR_HEIGHT_M + PARAPET_M).toFixed(2));
}
