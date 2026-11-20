import type { Wing, WingBuildingLink } from '../../../domain/wings';

/**
 * 千里山キャンパスの棟（館内の単位）の表と、建物との対応の表（docs/indoor-plan.md 5 節・12 節・17 節）。
 * 読み込み時に合わせて BuildingFeature.wings に付ける。棟の id の決め方は domain/wings.ts の WING_ID_RULE。
 *
 * 第3学舎（area3）: OSM の輪郭は 1 つ（屋外の入口も共有）なので建物は 1 つのまま、1〜4 号館 A〜D 棟を部品にする。
 * 棟の割り当てと階の数は KAN-CAN! の学舎・教室一覧と第3学舎エリアの図（持ち主の手書きの割り当て 2026-11-20 で確かめた）。
 * 塊の範囲は主役のモデル（scene/heroes/area3.ts）と同じ枠と境目で切る:
 * - 枠: 南の長い辺（輪郭の点 7→8）の向きを u（東北東が +）、それに直交する v（南南東が +）
 * - C棟（3号館）= 塔の塊（u ≤ -284.3）、A棟（1号館）= 東（u ≥ -240.3）、その間の中庭の南の帯が B棟（2号館）、北の帯が D棟（4号館）
 * - 地階は A棟だけ資料にある（カフェソシオ）。B・C・D棟は資料に無いので 0 にしている
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
   * B棟（南）と D棟（北）の境目。中庭（v = 152.3〜163.7）の南北の中ほど（推定）。
   * 中庭は塔から A棟までほぼいっぱいに延びるので、B と D がつながるのは中庭の西と東の端の幅 0.5〜2m だけ
   */
  bdSplitV: 158.0,
} as const;

/** 階高（推定。主役のモデルの FLOOR_HEIGHT_M と同じ） */
const AREA3_FLOOR_HEIGHT_M = 3.9;

/** 第3学舎の棟の id（部屋のデータ RoomEntry.wingId と主役のモデルの部品の印に使う） */
export const AREA3_WING_IDS = { a: 'area3-a', b: 'area3-b', c: 'area3-c', d: 'area3-d' } as const;

/** 棟の表 */
export const SENRIYAMA_WINGS: readonly Wing[] = [
  {
    id: AREA3_WING_IDS.a,
    school: '第3学舎',
    hallName: '1号館',
    name: 'A棟',
    floorsAbove: 4,
    floorsBelow: 1,
    floorHeightM: AREA3_FLOOR_HEIGHT_M,
    entrances: [],
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
    entrances: [],
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
    entrances: [],
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
    entrances: [],
    note: '中庭の北の帯（第3学舎連絡デッキの側）。1〜2 階にソシオAV大ホール、4 階に屋上広場（位置は未確認）',
  },
];

/** 建物と棟の対応の表（第3学舎は 1 つの建物に 4 棟。塊の範囲は上の枠と境目で切る） */
export const SENRIYAMA_WING_BUILDINGS: readonly WingBuildingLink[] = [
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
];
