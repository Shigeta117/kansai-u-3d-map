/**
 * 名神高速道路（E1）のうち、ジオラマの範囲にかかる部分の作り方（scripts/build-campus-data.mjs が使う）。
 *
 * - 線の位置は OSM の way（上下線が別の way）。向きは西→東にそろえる
 * - 高架の区間は OSM の bridge=yes（関大前駅の北端の上）。トンネル（tunnel=yes）は描かず、坑口だけ置く
 * - OSM に高さの情報は無い。路面の高さは国土地理院の DEM から推定する（地上の区間の DEM をならし、
 *   高架の区間は両端の間を直線でつなぎ、線路・道路の上に桁の下の空きを確保する）
 * - 寸法の値はすべて推定（現地で確かめたい値）。報告と docs に一覧を出す
 */

export interface ExpresswayWayRef {
  wayId: number;
  /** OSM の way の向きを逆にして西→東にそろえるか */
  reverse: boolean;
}

export interface ExpresswayCarriagewaySpec {
  id: string;
  name: string;
  lanes: number;
  /** 西→東の順に並べた OSM の way（トンネルの way は含めない） */
  ways: ExpresswayWayRef[];
}

export interface ExpresswaySectionSpec {
  id: string;
  /**
   * 地上の区間で路面が地形より高いときの側面。0 は擁壁（縦の壁）、正の値は盛土の法面の勾配（水平 / 鉛直）。推定
   */
  embankmentSlope: number;
  /** 上下線（路面の高さは同じ x で同じにそろえる） */
  carriageways: ExpresswayCarriagewaySpec[];
}

export interface ExpresswayPortalSpec {
  id: string;
  name: string;
  /** トンネルの端の OSM ノード（上下線の 2 本）。坑口はこの中点に置く */
  endNodeIds: [number, number];
  /** トンネルの way（トンネルの奥へ向かう方向を取るため） */
  tunnelWayIds: [number, number];
  /** 坑口が面する側（トンネルの外）の路面がある区間 */
  sectionId: string;
}

// 上り・下りの呼び方は確かめていないので、OSM の oneway の向きで「東行き」「西行き」と書く
export const MEISHIN_SECTIONS: ExpresswaySectionSpec[] = [
  {
    // 関大前駅の上の高架（425625711・425625712）と、西坑口までの地上の区間（425625709・425625710）
    id: 'west',
    // 空中写真: 地上の区間の両側に細い明るい帯（壁）が見え、広い法面は見えない → 擁壁とする（推定）
    embankmentSlope: 0,
    carriageways: [
      {
        id: 'meishin-west-eb',
        name: '名神高速道路（東行き）',
        lanes: 3,
        ways: [
          { wayId: 152794467, reverse: false },
          { wayId: 425625711, reverse: false },
          { wayId: 425625710, reverse: false },
        ],
      },
      {
        id: 'meishin-west-wb',
        name: '名神高速道路（西行き）',
        lanes: 3,
        ways: [
          { wayId: 27555336, reverse: true },
          { wayId: 425625712, reverse: true },
          { wayId: 425625709, reverse: true },
        ],
      },
    ],
  },
  {
    // 東坑口から東（27555334・374333007）
    id: 'east',
    // 下をくぐる道（OSM の tunnel=yes）の口が車道の縁から 8〜12m 外にある → 盛土の法面とする（推定）
    embankmentSlope: 1.5,
    carriageways: [
      {
        id: 'meishin-east-eb',
        name: '名神高速道路（東行き）',
        lanes: 2,
        ways: [{ wayId: 27555334, reverse: false }],
      },
      {
        id: 'meishin-east-wb',
        name: '名神高速道路（西行き）',
        lanes: 3,
        ways: [{ wayId: 374333007, reverse: true }],
      },
    ],
  },
];

// トンネルの名前「千里山トンネル」の出典: 持ち主の確認（2026-11-20）
export const MEISHIN_PORTALS: ExpresswayPortalSpec[] = [
  {
    id: 'meishin-portal-west',
    name: '名神高速道路 千里山トンネル西坑口',
    endNodeIds: [302504758, 291498118],
    tunnelWayIds: [27555333, 27555339],
    sectionId: 'west',
  },
  {
    id: 'meishin-portal-east',
    name: '名神高速道路 千里山トンネル東坑口',
    endNodeIds: [302504755, 291498053],
    tunnelWayIds: [27555333, 27555339],
    sectionId: 'east',
  },
];

/** 寸法（m）。特記の無いものはすべて推定 */
export const EXPRESSWAY_DIMENSIONS = {
  /** 片側の車道の幅。推定（空中写真で上下線を合わせた幅が約 22〜23m、OSM の上下線の間隔が約 12m） */
  carriagewayWidth: 11.0,
  /** 床版＋桁の厚み。推定（径間 30m 前後の桁の一般的な値） */
  structureDepth: 2.0,
  /** 床版の厚み。推定 */
  slabThickness: 0.4,
  /** 高欄（壁）の高さ・厚み。推定 */
  parapetHeight: 1.1,
  parapetThickness: 0.35,
  /** 橋脚の間隔の目安と許す範囲。推定（空中写真で見える桁の継ぎ目の間隔が 26〜50m） */
  pierSpacing: 30,
  pierSpacingMin: 18,
  pierSpacingMax: 40,
  /** 橋脚の柱の太さ。推定 */
  pierColumnSize: 2.2,
  /** 桁の下の空きの最低値（線路・道路の上）。依頼の条件 */
  minClearance: 5.5,
  /** 空きの余裕 */
  clearanceMargin: 0.3,
  /** 坑門: 開口の高さ・壁の高さ・奥行き（坑門の後ろの土の覆いまで）・袖の幅。推定 */
  portalOpeningHeight: 7.0,
  portalWallHeight: 8.5,
  portalHoodDepth: 14,
  portalWingWidth: 6,
  /** 高速道路の下をくぐる道の箱型の通路（カルバート）の開口。推定 */
  culvertWidth: 5.5,
  culvertHeight: 4.5,
} as const;

/** 路面の高さを DEM から作るときの窓（m）。地上の区間の DEM の中央値をとる幅と、ならす幅 */
export const EXPRESSWAY_PROFILE_WINDOWS = {
  median: 30,
  smooth: 25,
  /** 下をくぐる道（tunnel=yes）の前後で DEM を使わない幅（片側） */
  underpassExclusion: 22,
  /** 桁の下の空きが足りないときに路面を持ち上げる山の半分の長さ */
  clearanceBumpHalfLength: 60,
} as const;
