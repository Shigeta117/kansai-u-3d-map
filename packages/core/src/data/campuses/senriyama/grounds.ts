/**
 * グラウンドの造形の作り方（scripts/build-campus-data.mjs が structures.json の grounds を作るのに使う）。
 *
 * - 位置と輪郭は OSM（leisure=track・pitch、sport=athletics・soccer・baseball・tennis）
 * - 線・レーン・コートの並び・野球場の本塁と両翼のポールの位置は、国土地理院の空中写真（2017 年 4 月、z18）と
 *   関西大学 広報課 CAMPUSMAP（2023 年 4 月）のイラストから読んだ。寸法は競技の標準の値で、どれも推定
 * - 面の色は空中写真の色（テニスコートは 2017 年の写真の色）
 * - 地面のグラウンドの面の高さは、輪郭の中の地形の中央値（データの生成が決める）。表示ではその高さに地形をならす
 * - 一高のグラウンド（千里山遊園の大運動場と観客席をそのまま使う。AR KANDAI）は OSM の way 484112544 で、
 *   ジオラマの範囲（南端 z=565）の外なので作らない
 */

export interface AthleticsTrackSpec {
  id: string;
  name: string;
  /** トラックの外周（OSM の relation 11114488 の outer） */
  outerWayId: number;
  /** 内側の人工芝のフィールド（OSM の leisure=pitch, sport=soccer） */
  pitchWayId: number;
  /** レーンの数（空中写真の西の直線の白線の数から。推定） */
  lanes: number;
  /** レーンの幅（m、標準） */
  laneWidthM: number;
  /** 400m のトラックの直線の長さと、内側の縁の曲線の半径（m、標準。推定） */
  straightM: number;
  innerRadiusM: number;
  /** サッカーのコートの線の長さと幅（m、標準。推定） */
  fieldLengthM: number;
  fieldWidthM: number;
}

export interface TrackStraightSpec {
  id: string;
  /** 直線の走路（OSM の leisure=track, sport=athletics の細長い四角） */
  wayId: number;
  /** レーンの数（推定。輪郭の幅 約 4.9m から） */
  lanes: number;
}

export interface BaseballFieldSpec {
  id: string;
  name: string;
  /** 野球場（OSM の leisure=pitch, sport=baseball） */
  wayId: number;
  /** 本塁と、左翼・右翼のポールの位置（ローカル座標。空中写真のファウルラインから読んだ。推定） */
  home: [number, number];
  leftPole: [number, number];
  rightPole: [number, number];
  /** 内野の土の範囲の半径（m、投手板を中心に。空中写真の暗い円から。推定） */
  infieldRadiusM: number;
  /** 本塁から投手板・塁間の距離（m、規則の値） */
  moundDistanceM: number;
  baseDistanceM: number;
  /** フェンスの手前の土の帯の幅と、外野のフェンスの高さ（m、推定） */
  warningTrackM: number;
  fenceHeightM: number;
}

export interface TennisCourtsSpec {
  id: string;
  /** コートの範囲（OSM の leisure=pitch, sport=tennis）。屋上のコートは建物の輪郭（OSM の way）を内側へ縮めて使う */
  wayId: number;
  /** 屋上のコート: 建物の id（屋根の上に置く）と、輪郭を縮める幅（m、屋上の手すりの分。推定） */
  roofOf?: { buildingId: string; insetM: number };
  /**
   * コートの面の数（空中写真から）。範囲の長い方向に並べ、コートの長い方向は範囲の短い方向にする。
   * centers を書いたときはその位置に置く
   */
  courts: number;
  centers?: [number, number][];
  /** コートの長い方向（centers を書いたときだけ。単位ベクトル） */
  courtAxis?: [number, number];
  /** まわりの面の色と、コートの中の色（空中写真の色） */
  surfaceHex: string;
  courtHex: string;
  /** 網の柵の高さ（m、推定） */
  fenceHeightM: number;
}

export interface GrandstandSpec {
  id: string;
  /**
   * 観客席（OSM の building=yes, layer=1 の細長い輪郭。空中写真では青い座席の列）。建物の箱にせず、
   * 後ろ（斜面の上の道の側）から前（トラックの側）へ下がる座席の面として描く
   */
  wayId: number;
  /** 前の縁の高さ（トラックの面から）と、後ろの縁の高さ（後ろの地面から）。m、推定 */
  frontRiseM: number;
  backRiseM: number;
  /** 座席の色と通路の色（空中写真の色） */
  seatHex: string;
  aisleHex: string;
  /**
   * 観客席の輪郭から外す建物（OSM の way）と、建物の輪郭から空ける幅（m）。輪郭を幅だけ外へ広げた範囲を
   * 観客席の輪郭から引く（データの生成 scripts/lib/grounds-data.mjs の subtractConvex）
   */
  keepClearOf?: { wayId: number; clearanceM: number }[];
}

export interface GroundsSpec {
  track: AthleticsTrackSpec;
  straight: TrackStraightSpec;
  grandstand: GrandstandSpec;
  baseball: BaseballFieldSpec;
  tennis: TennisCourtsSpec[];
}

export const SENRIYAMA_GROUNDS_SPEC: GroundsSpec = {
  // 公式の地図の 22 番
  track: {
    id: 'ground-central-track',
    name: '千里山中央グラウンド',
    outerWayId: 491574942,
    pitchWayId: 805366949,
    lanes: 8,
    laneWidthM: 1.22,
    straightM: 84.39,
    innerRadiusM: 36.5,
    fieldLengthM: 105,
    fieldWidthM: 68,
  },
  // 中央グラウンドの北東の直線の走路（公式の地図では赤地に白線の帯）
  straight: { id: 'ground-central-straight', wayId: 805817744, lanes: 4 },
  // 中央グラウンドの西の直線に沿う観客席（空中写真で青い座席の列。後ろは新凱風館の側の高い地面）
  grandstand: {
    id: 'ground-central-stand',
    wayId: 805366951,
    frontRiseM: 1.0,
    backRiseM: 0.6,
    seatHex: '#4A6696',
    aisleHex: '#A3A39E',
    // OSM の観客席の輪郭は第4学舎3号館（way 423067232）の東の角の下に入っている。空中写真（2017 年 4 月）では、
    // 3号館の南東の辺の外に暗い帯と明るい通路があり、座席の列は辺から 5.5〜6.5m で始まる。辺から 5m（推定）を空ける
    keepClearOf: [{ wayId: 423067232, clearanceM: 5 }],
  },
  // 公式の地図の 23 番。本塁は北東の角で、外野は南西へ開く（空中写真の暗い内野とフェンスの手前の赤茶の帯）
  baseball: {
    id: 'ground-kaisers',
    name: 'KAISERS BASEBALL FIELD',
    wayId: 423067262,
    home: [442.1, -263.1],
    leftPole: [355.5, -232.2],
    rightPole: [475.6, -176.0],
    infieldRadiusM: 28,
    moundDistanceM: 18.44,
    baseDistanceM: 27.43,
    warningTrackM: 4.5,
    fenceHeightM: 3,
  },
  tennis: [
    // 東の駐車場の西（公式の地図では駐車場の門の横）。2017 年の写真では砂色の面に 3 面
    { id: 'tennis-parking', wayId: 497645766, courts: 3, surfaceHex: '#CBBE92', courtHex: '#B8B183', fenceHeightM: 4 },
    // 関西大学第一中学校の北。緑の面に 3 面
    { id: 'tennis-jhs', wayId: 497645758, courts: 3, surfaceHex: '#97B26C', courtHex: '#749B5A', fenceHeightM: 4 },
    // 第4学舎3号館の屋上（空中写真で緑の面に青い 4 面、公式の地図でも屋上にコート）。位置は写真から読んだ推定
    {
      id: 'tennis-area4-3-roof',
      wayId: 423067232,
      roofOf: { buildingId: 'area4-3', insetM: 1.2 },
      courts: 4,
      centers: [
        [208.9, -53.5],
        [219.4, -63.4],
        [230.5, -73.1],
        [241.1, -83.7],
      ],
      courtAxis: [0.672, 0.741],
      surfaceHex: '#56805A',
      courtHex: '#3D5C8E',
      fenceHeightM: 4,
    },
  ],
};
