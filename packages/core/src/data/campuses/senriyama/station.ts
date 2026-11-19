/**
 * 阪急 関大前駅の作り方（scripts/build-campus-data.mjs が transport.json の stationFacilities を作るのに使う）。
 *
 * - ホーム: OSM の railway=platform（ref 1・2、出典タグ GSImaps/ort）。線路の両側の相対式ホーム
 * - 駅舎: OSM の building=train_station 3 棟（北端は名神の高架の下、南端は線路の両側）
 * - 上屋（ホームの屋根）: 国土地理院の空中写真（seamlessphoto, z18）で白い屋根が見える範囲だけ。
 *   1 番線（西側）の南端で、南の駅舎（668430804）に沿う部分。ほかの部分は写真で屋根を確かめられないので作らない
 * - 屋根の色は空中写真から読んだ色。壁の色・高さ・上屋の高さは推定
 */

export interface StationPlatformSpec {
  id: string;
  ref: string;
  osmWayId: number;
}

export interface StationBuildingSpec {
  id: string;
  name: string;
  osmWayId: number;
  /** 地面から屋根までの高さ（m）。推定（平屋） */
  heightM: number;
  /** 屋根の色（空中写真の色） */
  roofHex: string;
}

export interface StationCanopySpec {
  id: string;
  /** 屋根を架けるホーム */
  platformWayId: number;
  /** この建物の長さの範囲（線路の方向）だけホームに屋根を架ける */
  alongBuildingWayId: number;
  /** ホームの上面から屋根の下面までの高さ（m）。推定 */
  clearHeightM: number;
}

export interface StationFacilitiesSpec {
  stationId: string;
  platforms: StationPlatformSpec[];
  buildings: StationBuildingSpec[];
  canopies: StationCanopySpec[];
}

export const KANDAIMAE_STATION_SPEC: StationFacilitiesSpec = {
  stationId: 'kandaimae-station',
  platforms: [
    { id: 'kandaimae-platform-1', ref: '1', osmWayId: 467581838 },
    { id: 'kandaimae-platform-2', ref: '2', osmWayId: 467581839 },
  ],
  buildings: [
    {
      id: 'kandaimae-station-north',
      name: '関大前駅 北の駅舎',
      osmWayId: 529826319,
      heightM: 4.5,
      // 空中写真: 高架の北側に緑の屋根の端が見える（残りは高架の下で見えない）
      roofHex: '#6A8A78',
    },
    {
      id: 'kandaimae-station-south-east',
      name: '関大前駅 南の駅舎（東側）',
      osmWayId: 668430803,
      heightM: 4.0,
      roofHex: '#769280',
    },
    {
      id: 'kandaimae-station-south-west',
      name: '関大前駅 南の駅舎（西側）',
      osmWayId: 668430804,
      heightM: 4.5,
      // 空中写真: 大部分が白い屋根（北の端だけ緑）
      roofHex: '#C8CABD',
    },
  ],
  canopies: [
    {
      id: 'kandaimae-canopy-platform-1-south',
      platformWayId: 467581838,
      alongBuildingWayId: 668430804,
      clearHeightM: 3.0,
    },
  ],
};
