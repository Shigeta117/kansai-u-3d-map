import {
  AREA1_WING_IDS,
  SENRIYAMA_WINGS,
  alignL1Tiers,
  buildL1Graph,
  connectorMouthId,
  type L1Graph,
  type L1TierLayout,
  type LocalPoint2D,
} from '@kansai-u-3d/core';
import { BARRIER_FREE_SOURCE, SENRIYAMA_BARRIER_FREE, SENRIYAMA_BF_CONNECTORS } from '../barrier-free/senriyama';

/**
 * 第1学舎（A〜E 棟）の館内の L1 のグラフの試し（docs/indoor-plan.md 6 節・11 節・16 節の P1）。
 * 資料はバリアフリーマップだけ（大学が公開している物）。現地調査の記録はここに入れない（公開の版に入れない。3 節）。
 * 区画は分からない（zone: null）、エレベーターの止まる階も分からない（stops: null）まま。経路の探索（9 節）にはまだ使わない。
 */

const { a: A, b: B, c: C, d: D, e: E } = AREA1_WING_IDS;

/**
 * L1 の画面の棟の並び（左から）。連絡路は A–D・A–E・D–E が三角につながるので、どの並びでも 1 組は隣り合わない。
 * B・C・A・E・D（おおよそ西から東。E は北の奥で A と D の間に掛かる）にすると、隣り合わないのは A–D の 2 本
 * （1 階どうし〈途中に階段〉と A 2 階–D 3 階）だけになる。画面ではその 2 本を E の列をまたぐ弧で描く
 */
export const AREA1_L1_WING_ORDER: readonly string[] = [B, C, A, E, D];

/**
 * 平面の点（ローカル m、+X 東・+Z 南）。位置合わせの推定（2026-11-21）:
 * - バリアフリーマップの第1学舎の図は建物を軸にそろえた長方形で描いた模式図で、建物ごとに縦横の縮尺が違う
 *   （1m あたりの図の長さが、横 4.9〜10.4・縦 3.2〜6.7 で建物ごとにばらばら）。図全体を 1 つの変換で合わせると、建物の角 20 点の残差は相似変換で 平均二乗 12.8m・最大 28.9m、
 *   affine で 8.9m・16.1m と大きい
 * - そこで建物ごとに、図の長方形の 4 つの角を OSM の輪郭の 4 つの角（北西・北東・南東・南西）に affine で合わせた（残差は
 *   A棟 0.57m・D棟 0.22m、ほかは 0.01m 未満。4 点に 6 つの数を合わせるので、残差が小さいことは正しさの証拠にはならない）
 * - 印の中心を移した点を、その建物の輪郭のいちばん近い所に寄せた（寄せた長さ 0.9〜4.0m。印は壁の外側に描かれている）
 * - 連絡路の口は、図の通路の帯が建物の枠に接する所を、それぞれの建物の変換で移した（1 つの通路の上下の階の口は同じ点）
 * - 確かめ（OSM の別の手がかりとの差）: A–E の通路は OSM の輪郭（施設棟）の両端から 3.9m・4.4m、A–D の D棟側の口は
 *   D棟の西の壁の入口の点から 1.4m、外からの入口は同じ壁の OSM の入口の点から 1.7・4.6・5.0・6.7・6.8・9.1m。
 *   誤差は 5m 前後と見ておく（区画の中の推定の距離には十分。入口を屋外の歩道につなぐときは近くのノードを探して確かめる）
 */
const MOUTH = {
  ad: { [A]: { x: 28.7, z: -195.7 }, [D]: { x: 38.4, z: -181.7 } },
  ae: { [A]: { x: 3.9, z: -213.7 }, [E]: { x: 13.9, z: -228.5 } },
  bc: { [B]: { x: -51.7, z: -231.0 }, [C]: { x: -54.8, z: -226.5 } },
  de: { [D]: { x: 48.7, z: -218.9 }, [E]: { x: 52.6, z: -224.2 } },
} as const satisfies Record<string, Record<string, LocalPoint2D>>;

const MOUTH_OF_CONNECTOR: Readonly<Record<string, keyof typeof MOUTH>> = {
  'bf-area1-ad-1f': 'ad',
  'bf-area1-ad-2f3f': 'ad',
  'bf-area1-ae-2f': 'ae',
  'bf-area1-ae-3f': 'ae',
  'bf-area1-ae-4f': 'ae',
  'bf-area1-bc-2f': 'bc',
  'bf-area1-de': 'de',
  'bf-area1-de-3f2f': 'de',
  'bf-area1-de-4f3f': 'de',
};

/** 外からの入口（バリアフリーマップの印の id → 平面の点） */
const ENTRANCE_POINTS: Readonly<Record<string, LocalPoint2D>> = {
  'bf-1-1': { x: -9.4, z: -173.2 }, // A棟 2 階（南の壁、あすかの庭の側）
  'bf-1-2': { x: -32.4, z: -175.7 }, // A棟 1 階（南の壁の西寄り）
  'bf-1-3': { x: -39.8, z: -200.8 }, // A棟 1 階（西の壁。自動扉）
  'bf-1-4': { x: -26.1, z: -217.0 }, // A棟 1 階（北の壁の西寄り）
  'bf-1-5': { x: -51.2, z: -226.1 }, // C棟 1 階（北の壁）
  'bf-1-6': { x: -52.7, z: -188.2 }, // C棟 1 階（東の壁。約 18cm の段差）
  'bf-1-7': { x: 34.0, z: -141.1 }, // D棟 3 階（西の壁の南寄り）
  'bf-1-8': { x: 55.3, z: -191.6 }, // D棟 1 階（東の壁。約 7cm の段差）
  'bf-1-9': { x: 39.4, z: -129.8 }, // D棟 1 階（南の壁）
  'bf-1-10': { x: 8.8, z: -229.1 }, // E棟 1 階（南の壁、A–E の通路の西）
  'bf-1-11': { x: 23.5, z: -253.0 }, // E棟 1 階（北の壁、北門の側）
  'bf-1-12': { x: 60.7, z: -230.4 }, // E棟 1 階（東の壁。手前に階段）
};

export const AREA1_L1_POINTS: Readonly<Record<string, LocalPoint2D>> = {
  ...ENTRANCE_POINTS,
  ...Object.fromEntries(
    Object.entries(MOUTH_OF_CONNECTOR).flatMap(([connectorId, key]) =>
      Object.entries(MOUTH[key]).map(([wingId, point]) => [connectorMouthId(connectorId, wingId), point] as const),
    ),
  ),
};

const AREA1_WINGS = AREA1_L1_WING_ORDER.map((id) => {
  const wing = SENRIYAMA_WINGS.find((w) => w.id === id);
  if (!wing) throw new Error(`wing ${id} missing`);
  return wing;
});

export const AREA1_L1: L1Graph = buildL1Graph({
  wings: AREA1_WINGS,
  facts: SENRIYAMA_BARRIER_FREE,
  connectors: SENRIYAMA_BF_CONNECTORS,
  source: BARRIER_FREE_SOURCE,
  points: AREA1_L1_POINTS,
});

/** L1 の画面の「同じ高さの段」（11 節）。斜めになる連絡路と食い違いは検証のテストで確かめる */
export const AREA1_L1_TIERS: L1TierLayout = alignL1Tiers(AREA1_L1_WING_ORDER, AREA1_L1.edges, AREA1_L1.nodes);
