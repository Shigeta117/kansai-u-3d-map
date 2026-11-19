import type { AccessStatus } from '@kansai-u-3d/core';

/**
 * 関西大学 学生相談・支援センター「バリアフリーマップ 千里山キャンパス施設一覧」から読み取った、建物ごとの設備の概要。
 * - elevator: 図の建物の中にエレベーターの印がある＝yes。印が無い建物は「無い」とは書かれていないので unknown
 * - autoDoorEntrance: 外からの入口に自動扉の印が 1 つ以上＝yes。入口の印がすべて「開き戸等（車椅子は非推奨）」か
 *   「階段等（車椅子は不可）」＝no。入口の印が無い＝unknown
 * - accessibleRestroom: 多機能トイレの印がある＝yes
 * 資料の注記: 学生支援スタッフ企画委員の作成。設備は改修されている可能性がある。キャンパスマップは 2025年12月現在。
 * 読み取りの記録: docs/visual-research/barrier-free-map.md（2026-11-20）
 */
export interface OfficialBuildingAccess {
  elevator: AccessStatus;
  autoDoorEntrance: AccessStatus;
  accessibleRestroom: AccessStatus;
  restroomFloors?: string;
}

export const OFFICIAL_ACCESS_SOURCE = {
  name: '関西大学 学生相談・支援センター「バリアフリーマップ 千里山キャンパス施設一覧」',
  url: 'https://www.kansai-u.ac.jp/sscc/access/senriyama/',
  asOf: '2025年12月現在',
} as const;

export const SENRIYAMA_OFFICIAL_ACCESS: Readonly<Record<string, OfficialBuildingAccess>> = {
  'area1-1': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: 'A棟1階、A棟2～6階' },
  'area1-2': { elevator: 'unknown', autoDoorEntrance: 'unknown', accessibleRestroom: 'yes', restroomFloors: 'B棟1階、B棟2階' },
  'area1-3': { elevator: 'yes', autoDoorEntrance: 'no', accessibleRestroom: 'unknown' },
  'area1-4': { elevator: 'yes', autoDoorEntrance: 'no', accessibleRestroom: 'yes', restroomFloors: 'D棟1～3階' },
  'area1-5': { elevator: 'yes', autoDoorEntrance: 'no', accessibleRestroom: 'yes', restroomFloors: 'E棟1階、E棟1～5階' },
  'area2-1': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: 'A棟1階、A棟3階、B棟1階' },
  'area2-2': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: 'C棟1～7階' },
  'area2-3': { elevator: 'unknown', autoDoorEntrance: 'yes', accessibleRestroom: 'unknown' },
  'area2-bighall': { elevator: 'yes', autoDoorEntrance: 'no', accessibleRestroom: 'yes', restroomFloors: 'F棟1階・4階' },
  'area3': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: 'A棟1階、A棟2階、A棟2～4階、B棟1階、B棟2階・3階、B棟4階、B棟5階' },
  'area4-1': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: '1階' },
  'area4-2': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: 'B1階・1階、2～5階' },
  'area4-3': { elevator: 'yes', autoDoorEntrance: 'no', accessibleRestroom: 'yes', restroomFloors: '1階・2階、3階、4階' },
  'area4-4': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: 'B1階・2階、3階、1階' },
  'hitech-core': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: '第1実験棟1階、第2実験棟1階、第3実験棟B1階、第4実験棟1階、第5実験棟1階、第6実験棟3階' },
  'shobunkan': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: '1階、3階、7階' },
  'iwasaki': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: '1階' },
  'library': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: '(南側)1～3階、(北側)2階、(書庫)B2階' },
  'enshinkan': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: '1階、4階' },
  'shinkandaikaikan-n': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: '北棟1階、北棟3階' },
  'shinkandaikaikan-s': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: '南棟3階' },
  'rimpukan': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: '1階' },
  'east-gym': { elevator: 'yes', autoDoorEntrance: 'yes', accessibleRestroom: 'yes', restroomFloors: '1階、2階・3階' },
  'central-gym': { elevator: 'yes', autoDoorEntrance: 'no', accessibleRestroom: 'yes', restroomFloors: '1階' },
};
