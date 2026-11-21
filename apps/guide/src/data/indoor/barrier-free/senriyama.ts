import type { BarrierFreeBuilding, IndoorConnector, IndoorSource } from '@kansai-u-3d/core';

/**
 * 大学のバリアフリーマップから取った、建物ごとの入口・エレベーター・多機能トイレと、棟の間の連絡路（事実だけ）。
 *
 * - 出典の種類は「大学が自分で公開している物」（docs/indoor-plan.md 3 節の 1 行目）。公開の版に入れてよい
 * - 置き場所は public/data/（OSM 由来・ODbL）とは別。資料の画像・文章・図の上の位置（px）は入れず、事実を自前の形に直した
 *   （扉の種類は資料の凡例の 3 種、段差の手がかりは PassageObstacle の分類と cm）
 * - 読み取りの記録: docs/visual-research/barrier-free-map.md（2026-11-20）。機械で読む元の表はリポジトリの外
 * - 印が無いことは「無い」の証拠にしない（docs/indoor-plan.md 7 節）。エレベーターの印が無い建物は unknown
 * - 学舎でない建物は棟（wingId）を持たない。棟が複数ある建物で資料から棟が決まらない印も持たない
 * - 第2学舎 C棟と F棟の間の 1 階の口（資料では両方の棟の入口の印）は、連絡路として connectors に入れ、入口には入れない
 */

export const BARRIER_FREE_SOURCE: IndoorSource = {
  id: 'kansai-u-sscc-barrier-free-senriyama',
  name: '関西大学 学生相談・支援センター「バリアフリーマップ 千里山キャンパス施設一覧」',
  url: 'https://www.kansai-u.ac.jp/sscc/access/senriyama/',
  edition: '2025年12月現在',
  checkedAt: '2026-11-20',
  kind: 'university-public',
};

/** 建物ごとの事実（資料の 12 区画の図の 24 棟と、施設一覧に載っていない 4 件） */
export const SENRIYAMA_BARRIER_FREE: readonly BarrierFreeBuilding[] = [
  {
    buildingId: 'area1-1',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['area1-a'] },
      ],
    },
    entrances: [
      { id: 'bf-1-1', wingId: 'area1-a', floors: [2], door: 'swing' },
      { id: 'bf-1-2', wingId: 'area1-a', floors: [1], door: 'swing' },
      { id: 'bf-1-3', wingId: 'area1-a', floors: [1], door: 'auto' },
      { id: 'bf-1-4', wingId: 'area1-a', floors: [1], door: 'swing' },
    ],
    restrooms: [
      { id: 'bf-wc-1-24', wingId: 'area1-a', floors: [1], kind: 'standalone' },
      { id: 'bf-wc-1-25', wingId: 'area1-a', floors: [2, 3, 4, 5, 6], kind: 'in-both' },
    ],
  },
  {
    buildingId: 'area1-2',
    listed: true,
    elevator: { exists: 'unknown', groups: [] },
    entrances: [],
    restrooms: [
      { id: 'bf-wc-1-26', wingId: 'area1-b', floors: [1, 2], kind: 'standalone' },
    ],
  },
  {
    buildingId: 'area1-3',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['area1-c'] },
      ],
    },
    entrances: [
      { id: 'bf-1-5', wingId: 'area1-c', floors: [1], door: 'swing' },
      { id: 'bf-1-6', wingId: 'area1-c', floors: [1], door: 'steps', obstacle: 'step', stepCm: 18 },
    ],
    restrooms: [],
  },
  {
    buildingId: 'area1-4',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['area1-d'] },
      ],
    },
    entrances: [
      { id: 'bf-1-7', wingId: 'area1-d', floors: [3], door: 'swing' },
      { id: 'bf-1-8', wingId: 'area1-d', floors: [1], door: 'steps', obstacle: 'step', stepCm: 7 },
      { id: 'bf-1-9', wingId: 'area1-d', floors: [1], door: 'swing' },
    ],
    restrooms: [
      { id: 'bf-wc-1-27', wingId: 'area1-d', floors: [1, 2, 3], kind: 'standalone' },
    ],
  },
  {
    buildingId: 'area1-5',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['area1-e'] },
      ],
    },
    entrances: [
      { id: 'bf-1-10', wingId: 'area1-e', floors: [1], door: 'swing' },
      { id: 'bf-1-11', wingId: 'area1-e', floors: [1], door: 'swing' },
      { id: 'bf-1-12', wingId: 'area1-e', floors: [1], door: 'steps', obstacle: 'stairs-outside' },
    ],
    restrooms: [
      { id: 'bf-wc-1-28', wingId: 'area1-e', floors: [1], kind: 'standalone' },
      { id: 'bf-wc-1-29', wingId: 'area1-e', floors: [1, 2, 3, 4, 5], kind: 'in-both' },
    ],
  },
  {
    buildingId: 'area2-1',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['area2-a'] },
        { kind: 'elevator', wingIds: ['area2-b'] },
      ],
    },
    entrances: [
      { id: 'bf-2-1', wingId: 'area2-a', floors: [1], door: 'auto' },
      { id: 'bf-2-2', wingId: 'area2-a', floors: [1], door: 'auto' },
      { id: 'bf-2-3', wingId: 'area2-a', floors: [1], door: 'auto' },
      { id: 'bf-2-4', wingId: 'area2-b', floors: [1], door: 'auto' },
      { id: 'bf-2-5', wingId: 'area2-b', floors: [1], door: 'auto', sourceConflict: true },
    ],
    restrooms: [
      { id: 'bf-wc-2-17', wingId: 'area2-a', floors: [1, 3], kind: 'standalone' },
      { id: 'bf-wc-2-18', wingId: 'area2-b', floors: [1], kind: 'standalone' },
    ],
  },
  {
    buildingId: 'area2-2',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['area2-c'] },
      ],
    },
    entrances: [
      { id: 'bf-2-6', wingId: 'area2-c', floors: [1], door: 'auto' },
      { id: 'bf-2-7', wingId: 'area2-c', floors: [1], door: 'swing' },
      { id: 'bf-2-8', wingId: 'area2-c', floors: [1], door: 'swing' },
      { id: 'bf-2-9', wingId: 'area2-c', floors: [1], door: 'steps', obstacle: 'step', stepCm: 6 },
    ],
    restrooms: [
      { id: 'bf-wc-2-19', wingId: 'area2-c', floors: [1, 2, 3, 4, 5, 6, 7], kind: 'in-both' },
    ],
  },
  {
    buildingId: 'area2-3',
    listed: true,
    elevator: { exists: 'unknown', groups: [] },
    entrances: [
      { id: 'bf-2-11', wingId: 'area2-d', floors: [1], door: 'swing' },
      { id: 'bf-2-12', wingId: 'area2-e', floors: [1], door: 'swing' },
      { id: 'bf-2-13', wingId: 'area2-e', floors: [1], door: 'auto' },
    ],
    restrooms: [],
  },
  {
    buildingId: 'area2-bighall',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['area2-f'] },
      ],
    },
    entrances: [
      { id: 'bf-2-14', wingId: 'area2-f', floors: [1], door: 'swing' },
      { id: 'bf-2-15', wingId: 'area2-f', floors: [1], door: 'swing' },
    ],
    restrooms: [
      { id: 'bf-wc-2-20', wingId: 'area2-f', floors: [1, 4], kind: 'standalone' },
    ],
  },
  {
    buildingId: 'area3',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['area3-a'] },
        { kind: 'elevator', wingIds: ['area3-d'] },
        { kind: 'elevator', wingIds: ['area3-b'] },
        { kind: 'elevator', wingIds: ['area3-b', 'area3-c'], wingUncertain: true },
      ],
    },
    entrances: [
      { id: 'bf-3-1', wingId: 'area3-a', floors: [1], door: 'auto' },
      { id: 'bf-3-2', wingId: 'area3-a', floors: [-1], door: 'swing', obstacle: 'stairs-outside', wheelchairDetour: true },
      { id: 'bf-3-3', wingId: 'area3-a', floors: [-1], door: 'steps', obstacle: 'step', stepCm: 13 },
      { id: 'bf-3-4', wingId: 'area3-d', floors: [1], door: 'auto' },
      { id: 'bf-3-5', wingId: 'area3-b', floors: [1], door: 'auto' },
      { id: 'bf-3-6', wingId: 'area3-a', floors: [2], door: 'steps', obstacle: 'stairs-outside' },
      { id: 'bf-3-7', wingId: 'area3-b', floors: [1], door: 'auto' },
      { id: 'bf-3-8', wingId: 'area3-b', floors: [1], door: 'auto' },
      { id: 'bf-3-9', wingId: 'area3-b', floors: [1], door: 'auto' },
      { id: 'bf-3-10', wingId: 'area3-b', floors: [1], door: 'auto' },
      { id: 'bf-3-11', wingId: 'area3-b', floors: [1], door: 'auto' },
      { id: 'bf-3-12', wingId: 'area3-c', floors: [2], door: 'steps', obstacle: 'stairs-inside' },
      { id: 'bf-3-13', wingId: 'area3-c', floors: [2], door: 'auto' },
    ],
    restrooms: [
      { id: 'bf-wc-3-14', wingId: 'area3-a', floors: [1], kind: 'standalone', ostomate: true },
      { id: 'bf-wc-3-15', wingId: 'area3-a', floors: [1, 2], kind: 'in-womens' },
      { id: 'bf-wc-3-16', wingId: 'area3-a', floors: [2, 3, 4], kind: 'in-mens' },
      { id: 'bf-wc-3-17', wingId: 'area3-b', floors: [1], kind: 'standalone' },
      { id: 'bf-wc-3-18-1', wingId: 'area3-b', floors: [2, 3], kind: 'in-mens' },
      { id: 'bf-wc-3-18-2', wingId: 'area3-b', floors: [4, 5], kind: 'in-both' },
    ],
  },
  {
    buildingId: 'area4-1',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: [] },
      ],
    },
    entrances: [
      { id: 'bf-4-1', floors: [1], door: 'steps', obstacle: 'stairs-outside' },
      { id: 'bf-4-2', floors: [1], door: 'auto' },
      { id: 'bf-4-3', floors: [1], door: 'steps', obstacle: 'stairs-outside' },
      { id: 'bf-4-4', floors: [1], door: 'auto' },
    ],
    restrooms: [
      { id: 'bf-wc-4-30', floors: [1], kind: 'standalone', ostomate: true },
    ],
  },
  {
    buildingId: 'area4-2',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: [] },
        { kind: 'elevator', wingIds: [] },
      ],
    },
    entrances: [
      { id: 'bf-4-5', floors: [1], door: 'auto' },
      { id: 'bf-4-6', floors: [2, 3], door: 'swing' },
      { id: 'bf-4-7', floors: [1, 2, 3], door: 'swing' },
      { id: 'bf-4-8', floors: [1], door: 'auto' },
      { id: 'bf-4-9', floors: [1], door: 'steps', obstacle: 'stairs-outside' },
      { id: 'bf-4-10', floors: [1], door: 'auto' },
      { id: 'bf-4-11', floors: [1], door: 'auto' },
    ],
    restrooms: [
      { id: 'bf-wc-4-31', floors: [-1, 1, 2, 3, 4, 5], kind: 'standalone' },
    ],
  },
  {
    buildingId: 'area4-3',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['area4-h3'] },
      ],
    },
    entrances: [
      { id: 'bf-4-16', wingId: 'area4-h3', floors: [1], door: 'swing' },
      { id: 'bf-4-17', wingId: 'area4-h3', floors: [1], door: 'swing' },
      { id: 'bf-4-18', wingId: 'area4-h3', floors: [1], door: 'swing' },
    ],
    restrooms: [
      { id: 'bf-wc-4-32', wingId: 'area4-h3', floors: [1, 2, 3, 4], kind: 'standalone' },
    ],
  },
  {
    buildingId: 'area4-4',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['area4-h4'] },
      ],
    },
    entrances: [],
    restrooms: [
      { id: 'bf-wc-4-33', wingId: 'area4-h4', floors: [-1, 2, 3], kind: 'standalone' },
      { id: 'bf-wc-4-41', wingId: 'area4-h4', floors: [1], kind: 'standalone', ostomate: true },
    ],
  },
  {
    buildingId: 'hitech-core',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['area4-x1'] },
        { kind: 'elevator', wingIds: ['area4-x2'] },
        { kind: 'elevator', wingIds: ['area4-x3'] },
        { kind: 'elevator', wingIds: ['area4-x4'] },
        { kind: 'elevator', wingIds: ['area4-x5'] },
        { kind: 'elevator', wingIds: ['area4-x6'] },
      ],
    },
    entrances: [
      { id: 'bf-4-19', wingId: 'area4-x1', floors: [1], door: 'auto' },
      { id: 'bf-4-20', wingId: 'area4-x2', floors: [1], door: 'auto' },
      { id: 'bf-4-21', wingId: 'area4-x2', floors: [1], door: 'auto' },
      { id: 'bf-4-22', wingId: 'area4-x3', floors: [1], door: 'auto' },
      { id: 'bf-4-23', wingId: 'area4-x3', floors: [1], door: 'swing' },
      { id: 'bf-4-24', wingId: 'area4-x4', floors: [1], door: 'swing' },
      { id: 'bf-4-25', wingId: 'area4-x4', floors: [1], door: 'swing' },
      { id: 'bf-4-26', wingId: 'area4-x5', floors: [1], door: 'auto' },
      { id: 'bf-4-27', wingId: 'area4-x5', floors: [1], door: 'auto' },
      { id: 'bf-4-28', wingId: 'area4-x5', floors: [1], door: 'auto' },
      { id: 'bf-4-29', wingId: 'area4-x6', floors: [2], door: 'auto' },
    ],
    restrooms: [
      { id: 'bf-wc-4-34', wingId: 'area4-x1', floors: [1], kind: 'standalone' },
      { id: 'bf-wc-4-35', wingId: 'area4-x2', floors: [1], kind: 'standalone', ostomate: true },
      { id: 'bf-wc-4-36', wingId: 'area4-x2', floors: [1], kind: 'in-womens' },
      { id: 'bf-wc-4-37', wingId: 'area4-x3', floors: [-1], kind: 'standalone' },
      { id: 'bf-wc-4-38', wingId: 'area4-x4', floors: [1], kind: 'standalone' },
      { id: 'bf-wc-4-39', wingId: 'area4-x5', floors: [1], kind: 'standalone' },
      { id: 'bf-wc-4-40', wingId: 'area4-x6', floors: [3], kind: 'standalone' },
    ],
  },
  {
    buildingId: 'shobunkan',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['shobunkan-main'] },
        { kind: 'elevator', wingIds: ['shobunkan-main'], stops: [-1, 1] },
        { kind: 'elevator', wingIds: ['shobunkan-main'] },
        { kind: 'lift', wingIds: ['shobunkan-main'], stops: [-1, 1] },
      ],
    },
    entrances: [
      { id: 'bf-5-1', wingId: 'shobunkan-main', floors: [3], door: 'auto' },
      { id: 'bf-5-2', wingId: 'shobunkan-main', floors: [1], door: 'auto' },
      { id: 'bf-5-3', wingId: 'shobunkan-main', floors: [1], door: 'auto' },
    ],
    restrooms: [
      { id: 'bf-wc-5-4-1', wingId: 'shobunkan-main', floors: [1, 3], kind: 'standalone' },
      { id: 'bf-wc-5-4-2', wingId: 'shobunkan-main', floors: [7], kind: 'standalone', restricted: true },
    ],
  },
  {
    buildingId: 'iwasaki',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: ['iwasaki-f'] },
      ],
    },
    entrances: [
      { id: 'bf-6-1', wingId: 'iwasaki-f', floors: [1], door: 'auto' },
      { id: 'bf-6-1b', wingId: 'iwasaki-f', floors: [1], door: 'auto' },
    ],
    restrooms: [
      { id: 'bf-wc-6-2', wingId: 'iwasaki-f', floors: [1], kind: 'standalone' },
    ],
  },
  {
    buildingId: 'library',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: [] },
      ],
    },
    entrances: [
      { id: 'bf-7-1', floors: [1], door: 'auto' },
      { id: 'bf-7-2', floors: [1], door: 'auto' },
    ],
    restrooms: [
      { id: 'bf-wc-7-3', part: '南側', floors: [1, 2, 3], kind: 'standalone', ostomate: true },
      { id: 'bf-wc-7-4', part: '北側', floors: [2], kind: 'standalone' },
      { id: 'bf-wc-7-5', part: '書庫', floors: [-2], kind: 'standalone', restricted: true },
    ],
  },
  {
    buildingId: 'enshinkan',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: [] },
      ],
    },
    entrances: [
      { id: 'bf-8-1', floors: [1], door: 'auto' },
    ],
    restrooms: [
      { id: 'bf-wc-8-2', floors: [1, 4], kind: 'standalone' },
    ],
  },
  {
    buildingId: 'shinkandaikaikan-n',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: [] },
      ],
    },
    entrances: [
      { id: 'bf-9-1', floors: [1], door: 'auto' },
      { id: 'bf-9-2', floors: [3], door: 'auto' },
    ],
    restrooms: [
      { id: 'bf-wc-9-5', floors: [1, 3], kind: 'standalone' },
    ],
  },
  {
    buildingId: 'shinkandaikaikan-s',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: [] },
      ],
    },
    entrances: [
      { id: 'bf-9-3', floors: [1], door: 'auto' },
      { id: 'bf-9-4', floors: [3], door: 'auto' },
    ],
    restrooms: [
      { id: 'bf-wc-9-6', floors: [3], kind: 'standalone' },
    ],
  },
  {
    buildingId: 'rimpukan',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: [] },
      ],
    },
    entrances: [
      { id: 'bf-10-1', floors: [1], door: 'swing' },
      { id: 'bf-10-2', floors: [1], door: 'swing' },
      { id: 'bf-10-3', floors: [1], door: 'swing' },
      { id: 'bf-10-4', floors: [1], door: 'auto' },
      { id: 'bf-10-5', floors: [1], door: 'swing' },
      { id: 'bf-10-6', floors: [2, 3, 4], door: 'steps', obstacle: 'stairs-outside' },
      { id: 'bf-10-7', floors: [2], door: 'steps', obstacle: 'stairs-outside' },
      { id: 'bf-10-8', floors: [3], door: 'steps', obstacle: 'stairs-outside' },
      { id: 'bf-10-8b', floors: [3], door: 'steps', obstacle: 'stairs-outside' },
    ],
    restrooms: [
      { id: 'bf-wc-10-9', floors: [1], kind: 'in-both' },
    ],
  },
  {
    buildingId: 'east-gym',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: [] },
      ],
    },
    entrances: [
      { id: 'bf-11-1', floors: [1], door: 'auto' },
      { id: 'bf-11-2', floors: [2], door: 'auto' },
      { id: 'bf-11-3', floors: [1], door: 'steps', obstacle: 'step-inside', stepCm: 6 },
    ],
    restrooms: [
      { id: 'bf-wc-11-4', floors: [1], kind: 'standalone', ostomate: true },
      { id: 'bf-wc-11-5', floors: [1], kind: 'in-both' },
      { id: 'bf-wc-11-6', floors: [2, 3], kind: 'standalone' },
    ],
  },
  {
    buildingId: 'central-gym',
    listed: true,
    elevator: {
      exists: 'yes',
      groups: [
        { kind: 'elevator', wingIds: [] },
      ],
    },
    entrances: [
      { id: 'bf-12-1', floors: [1], door: 'swing' },
    ],
    restrooms: [
      { id: 'bf-wc-12-2', floors: [1], kind: 'standalone', ostomate: true },
    ],
  },
  {
    buildingId: 'ibunkan',
    listed: false,
    elevator: { exists: 'unknown', groups: [] },
    entrances: [],
    restrooms: [],
  },
  {
    buildingId: 'gaifukan',
    listed: false,
    elevator: { exists: 'unknown', groups: [] },
    entrances: [],
    restrooms: [],
  },
  {
    buildingId: 'seishikan-4',
    listed: false,
    elevator: { exists: 'unknown', groups: [] },
    entrances: [],
    restrooms: [],
  },
  {
    buildingId: 'kanbunkan',
    listed: false,
    elevator: { exists: 'unknown', groups: [] },
    entrances: [],
    restrooms: [],
  },
];

const verified = { sourceId: BARRIER_FREE_SOURCE.id, checkedAt: BARRIER_FREE_SOURCE.checkedAt };

/**
 * 棟の間の連絡路（キャンパスで 1 本の表。1 本の連絡路は 1 件・1 id、階ごとに分ける）。
 * id は建物シートの連絡（senriyama-indoor.ts、P0a）と同じ物はそろえた（bf-area1-ad-1f・bf-area1-bc-2f・bf-area1-de・bf-area4-24-*）。
 * シートの方には、第1学舎の A棟 2 階–D棟 3 階・A棟–E棟（2〜4 階）・D棟 3〜4 階–E棟 2〜3 階と第2学舎 C棟–F棟がまだ無い
 */
export const SENRIYAMA_BF_CONNECTORS: readonly IndoorConnector[] = [
  // ===== 第1学舎 =====
  {
    id: 'bf-area1-ad-1f',
    from: { buildingId: 'area1-1', wingId: 'area1-a', floor: 1 },
    to: { buildingId: 'area1-4', wingId: 'area1-d', floor: 1 },
    exists: 'yes',
    obstacle: 'stairs-midway',
    verified,
  },
  {
    id: 'bf-area1-ad-2f3f',
    from: { buildingId: 'area1-1', wingId: 'area1-a', floor: 2, door: 'swing' },
    to: { buildingId: 'area1-4', wingId: 'area1-d', floor: 3, door: 'swing' },
    exists: 'yes',
    verified,
  },
  ...[2, 3, 4].map(
    (floor): IndoorConnector => ({
      id: `bf-area1-ae-${floor}f`,
      from: { buildingId: 'area1-1', wingId: 'area1-a', floor, door: 'swing' },
      to: { buildingId: 'area1-5', wingId: 'area1-e', floor, door: 'swing' },
      exists: 'yes',
      verified,
    }),
  ),
  {
    id: 'bf-area1-bc-2f',
    from: { buildingId: 'area1-2', wingId: 'area1-b', floor: 2, door: 'swing' },
    to: { buildingId: 'area1-3', wingId: 'area1-c', floor: 2, door: 'auto' },
    exists: 'yes',
    verified,
  },
  {
    // D棟 2 階 ↔ E棟 1 階。D棟側の口は凡例の「階段など」で、説明は通路の溝
    id: 'bf-area1-de',
    from: { buildingId: 'area1-4', wingId: 'area1-d', floor: 2, door: 'steps' },
    to: { buildingId: 'area1-5', wingId: 'area1-e', floor: 1, door: 'swing' },
    exists: 'yes',
    obstacle: 'groove',
    grooveCm: 10,
    verified,
  },
  ...[
    [3, 2],
    [4, 3],
  ].map(
    ([d, e]): IndoorConnector => ({
      id: `bf-area1-de-${d}f${e}f`,
      from: { buildingId: 'area1-4', wingId: 'area1-d', floor: d as number, door: 'swing' },
      to: { buildingId: 'area1-5', wingId: 'area1-e', floor: e as number, door: 'swing' },
      exists: 'yes',
      verified,
    }),
  ),
  // ===== 第2学舎 =====
  {
    id: 'bf-area2-cf-1f',
    from: { buildingId: 'area2-2', wingId: 'area2-c', floor: 1, door: 'swing' },
    to: { buildingId: 'area2-bighall', wingId: 'area2-f', floor: 1, door: 'swing' },
    exists: 'yes',
    verified,
  },
  // ===== 第4学舎（2号館側の棟は教室棟・研究棟・別館のどれか資料から決まらない） =====
  {
    id: 'bf-area4-24-b1',
    from: { buildingId: 'area4-2', wingId: null, floor: -1, door: 'swing' },
    to: { buildingId: 'area4-4', wingId: 'area4-h4', floor: -1, door: 'auto' },
    exists: 'yes',
    verified,
  },
  ...[1, 2, 3].map(
    (floor): IndoorConnector => ({
      id: `bf-area4-24-${floor}f`,
      from: { buildingId: 'area4-2', wingId: null, floor, door: 'auto' },
      to: { buildingId: 'area4-4', wingId: 'area4-h4', floor, door: 'auto' },
      exists: 'yes',
      verified,
    }),
  ),
];
