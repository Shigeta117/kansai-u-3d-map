import type { Wing, WingBuildingLink } from '../../../domain/wings';

/**
 * 千里山キャンパスの棟（館内の単位）の表と、建物との対応の表（docs/indoor-plan.md 5 節・12 節・17 節）。
 * 棟の id の決め方は domain/wings.ts の WING_ID_RULE。単位は KAN-CAN! の学舎・教室一覧（2026.10.5 更新）の見出しで、
 * 部屋のデータ（apps/guide/src/data/indoor/senriyama-indoor.ts）にある学舎（第1〜第4学舎・岩崎記念館・尚文館・以文館）の全部。
 * 体育館・図書館・学生会館などの学舎でない建物は館内の案内の範囲の外（docs/indoor-plan.md 1 節）なので、まだ載せない。
 *
 * 読み込み時に BuildingFeature.wings に付くのは、地図で棟を押して選べる建物だけ（domain/wings.ts の pickableWingBuildingIds。
 * 今は第3学舎だけ）。ほかの建物の棟は表に載るだけで、地図・シート・検索の動きは変えない。
 *
 * 第3学舎（area3）: OSM の輪郭は 1 つ（屋外の入口も共有）なので建物は 1 つのまま、1〜4 号館 A〜D 棟を部品にする。
 * 棟の割り当てと階の数は KAN-CAN! の学舎・教室一覧と第3学舎エリアの図（持ち主の手書きの割り当て 2026-11-20 で確かめた）。
 * 塊の範囲は主役のモデル（scene/heroes/area3.ts）と同じ枠と境目で切る:
 * - 枠: 南の長い辺（輪郭の点 7→8）の向きを u（東北東が +）、それに直交する v（南南東が +）
 * - C棟（3号館）= 塔の塊（u ≤ -284.3）、A棟（1号館）= 東（u ≥ -240.3）、その間の中庭の南の帯が B棟（2号館）、北の帯が D棟（4号館）
 * - 地階は A棟だけ（カフェソシオ）。B・C・D棟に地階は無い（持ち主の確認 2026-11-20）
 *
 * ほかの学舎（P0b、2026-11-21）:
 * - 階の数: 建物に棟が 1 つなら部屋のデータの階（buildStandardFloors）と同じ。1 つの建物に棟が複数なら、KAN-CAN! のその見出しで
 *   部屋のある最上階と地階（屋上階・塔屋は含まないので下限）
 * - 塊の範囲: 1 つの建物に棟が複数ある所（第2学舎 1号館・3号館、第4学舎 1号館・2号館）は、資料（バリアフリーマップの図は模式図）
 *   から OSM の輪郭の上の境目を決められないので書かない。押して選ぶのは第3学舎だけのまま
 * - 第4学舎の第1〜第6実験棟は、OSM に実験棟ごとの輪郭がある（名前は公式の地図で直した。docs/DATA_SOURCES.md 5 節）ので、
 *   その輪郭に対応させる。部屋のデータは 6 棟の部屋をハイテク・リサーチ・コア（hitech-core）の建物にまとめている
 */

/** 第3学舎の枠の u 軸（南の長い辺の向き） */
export const AREA3_AXIS_U: [number, number] = [0.94101, -0.33837];

export const AREA3_WING_BOUNDS = {
  /** 塔の塊（C棟）と雁行する棟の境目（輪郭の点 8・9 の u） */
  towerEastU: -284.3,
  /**
   * A棟の西の端。輪郭の北の面の段（点 33・34、u = -240.3）と中庭の東の端（u ≈ -240.7）にそろえる
   * （南の面の切れ込み u = -239.4〜-236.9 もこの近く）
   */
  aWestU: -240.3,
  /**
   * B棟（南）と D棟（北）の境目。中庭（v = 152.3〜163.7）の南北の中ほど（推定。この切り分けでよいと持ち主の確認 2026-11-20）。
   * 中庭は塔から A棟までほぼいっぱいに延びるので、B と D がつながるのは中庭の西と東の端の幅 0.5〜2m だけ
   */
  bdSplitV: 158.0,
} as const;

/** 階高（推定。主役のモデルの FLOOR_HEIGHT_M と同じ） */
const AREA3_FLOOR_HEIGHT_M = 3.9;

/** 第3学舎の棟の id（部屋のデータ RoomEntry.wingId と主役のモデルの部品の印に使う） */
export const AREA3_WING_IDS = { a: 'area3-a', b: 'area3-b', c: 'area3-c', d: 'area3-d' } as const;

/** 第1学舎の棟の id（館内の L1 のグラフの試し〈P1〉に使う） */
export const AREA1_WING_IDS = {
  a: 'area1-a',
  b: 'area1-b',
  c: 'area1-c',
  d: 'area1-d',
  e: 'area1-e',
} as const;

type WingRow = Omit<Wing, 'entrances'>;

/** 第3学舎の棟（P0c） */
const AREA3_WINGS: readonly WingRow[] = [
  {
    id: AREA3_WING_IDS.a,
    school: '第3学舎',
    hallName: '1号館',
    name: 'A棟',
    floorsAbove: 4,
    floorsBelow: 1,
    floorHeightM: AREA3_FLOOR_HEIGHT_M,
    note: '東の奥（新関西大学会館の側）。地階にカフェソシオ。B棟と D棟を結ぶ 5 階の通路はこの棟の屋上に載る（地図では A棟の範囲に入る）',
  },
  {
    id: AREA3_WING_IDS.b,
    school: '第3学舎',
    hallName: '2号館',
    name: 'B棟',
    floorsAbove: 5,
    floorsBelow: 0,
    floorHeightM: AREA3_FLOOR_HEIGHT_M,
    note: '中庭の南の帯（関西大学会館の側の手前）',
  },
  {
    id: AREA3_WING_IDS.c,
    school: '第3学舎',
    hallName: '3号館',
    name: 'C棟',
    floorsAbove: 10,
    floorsBelow: 0,
    floorHeightM: AREA3_FLOOR_HEIGHT_M,
    note: '西端の塔（縦のフィンと「関西大学」の文字）。西門の新アクセス路の到着点。6〜10 階は研究室',
  },
  {
    id: AREA3_WING_IDS.d,
    school: '第3学舎',
    hallName: '4号館',
    name: 'D棟',
    floorsAbove: 5,
    floorsBelow: 0,
    floorHeightM: AREA3_FLOOR_HEIGHT_M,
    note: '中庭の北の帯（第3学舎連絡デッキの側）。1〜2 階にソシオAV大ホール、4 階に屋上広場（位置は未確認）',
  },
];

/** 第1学舎（号館ごとに別の建物）・岩崎記念館・大学院学舎（尚文館・以文館） */
const AREA1_AND_GRADUATE_WINGS: readonly WingRow[] = [
  { id: AREA1_WING_IDS.a, school: '第1学舎', hallName: '1号館', name: 'A棟', floorsAbove: 6, floorsBelow: 0 },
  { id: AREA1_WING_IDS.b, school: '第1学舎', hallName: '2号館', name: 'B棟', floorsAbove: 3, floorsBelow: 0 },
  { id: AREA1_WING_IDS.c, school: '第1学舎', hallName: '3号館', name: 'C棟', floorsAbove: 5, floorsBelow: 0 },
  { id: AREA1_WING_IDS.d, school: '第1学舎', hallName: '4号館', name: 'D棟', floorsAbove: 4, floorsBelow: 0 },
  { id: AREA1_WING_IDS.e, school: '第1学舎', hallName: '5号館', name: 'E棟', floorsAbove: 6, floorsBelow: 0 },
  {
    id: 'iwasaki-f',
    school: '岩崎記念館',
    name: 'F棟',
    floorsAbove: 8,
    floorsBelow: 0,
    note: 'KAN-CAN! の見出しは「岩崎記念館 F棟」（部屋の番号は F203 など）。部屋は 4 階まで。地上の階の数は部屋のデータ（OSM）の 8 階',
  },
  {
    id: 'shobunkan-main',
    school: '大学院学舎',
    name: '尚文館',
    floorsAbove: 7,
    floorsBelow: 1,
    note: '地階はバリアフリーマップのエレベーター 1 基とリフトの添え書き（B1〜1 階）から。部屋のデータの階には地階が無い',
  },
  { id: 'ibunkan-main', school: '大学院学舎', name: '以文館', floorsAbove: 4, floorsBelow: 1 },
];

/** 第2学舎（1号館に A棟と B棟、3号館に D棟と E棟） */
const AREA2_WINGS: readonly WingRow[] = [
  { id: 'area2-a', school: '第2学舎', hallName: '1号館', name: 'A棟', floorsAbove: 5, floorsBelow: 0 },
  { id: 'area2-b', school: '第2学舎', hallName: '1号館', name: 'B棟', floorsAbove: 4, floorsBelow: 0 },
  { id: 'area2-c', school: '第2学舎', hallName: '2号館', name: 'C棟', floorsAbove: 7, floorsBelow: 0 },
  { id: 'area2-d', school: '第2学舎', hallName: '3号館', name: 'D棟', floorsAbove: 3, floorsBelow: 0 },
  { id: 'area2-e', school: '第2学舎', hallName: '3号館', name: 'E棟', floorsAbove: 3, floorsBelow: 0 },
  {
    id: 'area2-f',
    school: '第2学舎',
    hallName: '4号館',
    name: 'F棟',
    floorsAbove: 4,
    floorsBelow: 0,
    aliases: ['BIGホール100'],
  },
];

/** 第4学舎（KAN-CAN! の見出しの丸数字 ①〜⑬ を note に残す） */
const AREA4_WINGS: readonly WingRow[] = [
  { id: 'area4-h1', school: '第4学舎', name: '1号館', floorsAbove: 4, floorsBelow: 0, note: 'KAN-CAN! ①' },
  { id: 'area4-h1p', school: '第4学舎', hallName: '1号館', name: '教授棟', floorsAbove: 5, floorsBelow: 0, note: 'KAN-CAN! ②' },
  { id: 'area4-h2', school: '第4学舎', hallName: '2号館', name: '教室棟', floorsAbove: 5, floorsBelow: 1, note: 'KAN-CAN! ③' },
  {
    id: 'area4-h2r',
    school: '第4学舎',
    hallName: '2号館',
    name: '研究棟',
    floorsAbove: 5,
    floorsBelow: 1,
    restricted: true,
    note: 'KAN-CAN! ④。部外者・学部生は入れないので、館内の情報（部屋の一覧など）は載せない（持ち主の決め 2026-11-24）',
  },
  { id: 'area4-h2a', school: '第4学舎', hallName: '2号館', name: '研究棟別館', floorsAbove: 1, floorsBelow: 1, note: 'KAN-CAN! ⑤' },
  { id: 'area4-h3', school: '第4学舎', name: '3号館', floorsAbove: 4, floorsBelow: 0, note: 'KAN-CAN! ⑥' },
  { id: 'area4-h4', school: '第4学舎', name: '4号館', floorsAbove: 3, floorsBelow: 1, note: 'KAN-CAN! ⑦' },
  { id: 'area4-x1', school: '第4学舎', name: '第1実験棟', floorsAbove: 4, floorsBelow: 0, note: 'KAN-CAN! ⑧' },
  { id: 'area4-x2', school: '第4学舎', name: '第2実験棟', floorsAbove: 4, floorsBelow: 1, note: 'KAN-CAN! ⑨' },
  { id: 'area4-x3', school: '第4学舎', name: '第3実験棟', floorsAbove: 4, floorsBelow: 1, note: 'KAN-CAN! ⑩' },
  { id: 'area4-x4', school: '第4学舎', name: '第4実験棟', floorsAbove: 4, floorsBelow: 1, note: 'KAN-CAN! ⑪' },
  { id: 'area4-x5', school: '第4学舎', name: '第5実験棟', floorsAbove: 4, floorsBelow: 1, note: 'KAN-CAN! ⑫' },
  {
    id: 'area4-x6',
    school: '第4学舎',
    name: '第6実験棟',
    floorsAbove: 3,
    floorsBelow: 0,
    note: 'KAN-CAN! ⑬。部屋は 3 階まで（building-facts.ts は同じ輪郭を 5 階にしている。どちらが正しいかは未確認）',
  },
];

/** 棟の表 */
export const SENRIYAMA_WINGS: readonly Wing[] = [
  ...AREA1_AND_GRADUATE_WINGS,
  ...AREA2_WINGS,
  ...AREA3_WINGS,
  ...AREA4_WINGS,
].map((w) => ({ ...w, entrances: [] }));

/** 建物と棟の対応の表（第3学舎は 1 つの建物に 4 棟。塊の範囲は上の枠と境目で切る） */
export const SENRIYAMA_WING_BUILDINGS: readonly WingBuildingLink[] = [
  // 第1学舎・岩崎記念館・大学院学舎（建物に棟が 1 つ）
  { wingId: AREA1_WING_IDS.a, buildingId: 'area1-1' },
  { wingId: AREA1_WING_IDS.b, buildingId: 'area1-2' },
  { wingId: AREA1_WING_IDS.c, buildingId: 'area1-3' },
  { wingId: AREA1_WING_IDS.d, buildingId: 'area1-4' },
  { wingId: AREA1_WING_IDS.e, buildingId: 'area1-5' },
  { wingId: 'iwasaki-f', buildingId: 'iwasaki' },
  { wingId: 'shobunkan-main', buildingId: 'shobunkan' },
  { wingId: 'ibunkan-main', buildingId: 'ibunkan' },
  // 第2学舎（1号館・3号館は棟が 2 つで、範囲は資料から決まらないので書かない）
  { wingId: 'area2-a', buildingId: 'area2-1' },
  { wingId: 'area2-b', buildingId: 'area2-1' },
  { wingId: 'area2-c', buildingId: 'area2-2' },
  { wingId: 'area2-d', buildingId: 'area2-3' },
  { wingId: 'area2-e', buildingId: 'area2-3' },
  { wingId: 'area2-f', buildingId: 'area2-bighall' },
  // 第3学舎
  {
    wingId: AREA3_WING_IDS.a,
    buildingId: 'area3',
    region: { axisU: AREA3_AXIS_U, uMin: AREA3_WING_BOUNDS.aWestU },
  },
  {
    wingId: AREA3_WING_IDS.b,
    buildingId: 'area3',
    region: {
      axisU: AREA3_AXIS_U,
      uMin: AREA3_WING_BOUNDS.towerEastU,
      uMax: AREA3_WING_BOUNDS.aWestU,
      vMin: AREA3_WING_BOUNDS.bdSplitV,
    },
  },
  {
    wingId: AREA3_WING_IDS.c,
    buildingId: 'area3',
    region: { axisU: AREA3_AXIS_U, uMax: AREA3_WING_BOUNDS.towerEastU },
  },
  {
    wingId: AREA3_WING_IDS.d,
    buildingId: 'area3',
    region: {
      axisU: AREA3_AXIS_U,
      uMin: AREA3_WING_BOUNDS.towerEastU,
      uMax: AREA3_WING_BOUNDS.aWestU,
      vMax: AREA3_WING_BOUNDS.bdSplitV,
    },
  },
  // 第4学舎（1号館・2号館は棟が複数で、範囲は書かない。教授棟・研究棟・別館の輪郭は OSM で分かれていない）
  { wingId: 'area4-h1', buildingId: 'area4-1' },
  { wingId: 'area4-h1p', buildingId: 'area4-1' },
  { wingId: 'area4-h2', buildingId: 'area4-2' },
  { wingId: 'area4-h2r', buildingId: 'area4-2' },
  { wingId: 'area4-h2a', buildingId: 'area4-2' },
  { wingId: 'area4-h3', buildingId: 'area4-3' },
  { wingId: 'area4-h4', buildingId: 'area4-4' },
  // 実験棟は OSM の実験棟ごとの輪郭（way の id）
  { wingId: 'area4-x1', buildingId: 'way_423067247' },
  { wingId: 'area4-x2', buildingId: 'way_423067250' },
  { wingId: 'area4-x3', buildingId: 'way_423067248' },
  { wingId: 'area4-x4', buildingId: 'way_423067249' },
  { wingId: 'area4-x5', buildingId: 'way_423067251' },
  { wingId: 'area4-x6', buildingId: 'way_423067254' },
];
