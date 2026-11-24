import type { BuildingConstruction, CampusClosure } from './closures';
import type { BuildingWing } from './wings';

export type CampusId = 'senriyama';

export type BuildingCategory =
  | 'area1'
  | 'area2'
  | 'area3'
  | 'area4'
  | 'shared'
  | 'heritage'
  | 'sports'
  | 'gate'
  | 'other'
  | 'surrounding';

export type LandmarkSculptStyle =
  | 'kanbunkan-rotunda'
  | 'enshinkan-piloti'
  | 'ibunkan-octagonal-domes'
  | 'shinkandaikaikan-cone'
  | 'rimpukan-green-roof'
  | 'bighall-auditorium'
  | 'library-brick-canopy'
  | 'iwasaki-tower'
  | 'area1-brick'
  | 'area2-modern'
  | 'area3-white-courtyard'
  | 'area4-white-lab'
  | 'gym-arena'
  | 'main-gate'
  | 'west-gate'
  | 'station-platform'
  /** グラウンド・広場など、地面そのものが目印の場所（目印の台を置かない） */
  | 'open-space'
  | 'standard';

export type FacilityTag =
  | 'cafeteria'
  | 'library'
  | 'study'
  | 'museum'
  | 'hall'
  | 'admin'
  | 'station'
  | 'gate'
  | 'gym'
  | 'architecture';

export interface LocalPoint2D {
  x: number;
  z: number;
}

export interface LocalPoint3D {
  x: number;
  y: number;
  z: number;
}

export interface GeoCoord {
  lat: number;
  lon: number;
}

export interface ProjectionOrigin {
  originLat: number;
  originLon: number;
  metersPerDegLat: number;
  metersPerDegLon: number;
}

export interface CameraPreset {
  id: string;
  label: string;
  description: string;
  position: [number, number, number];
  target: [number, number, number];
}

export interface LandmarkMeta {
  id: string;
  name: string;
  shortName: string;
  kana: string;
  englishName: string;
  category: BuildingCategory;
  faculties: string[];
  facilityTags: FacilityTag[];
  keywords: string[];
  approxCoord: GeoCoord;
  walkTargetCoord?: GeoCoord;
  osmNameAliases: string[];
  description: string;
  architectNote?: string;
  sculptStyle?: LandmarkSculptStyle;
  defaultLevels: number;
  labelPriority: number;
  isSpotOnly?: boolean;
  isQuickOrigin?: boolean;
}

export interface DioramaConfig {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  baseDepth: number;
}

export interface CampusConfig {
  id: CampusId;
  name: string;
  shortName: string;
  subtitle: string;
  prefectureCity: string;
  origin: ProjectionOrigin;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  diorama: DioramaConfig;
  verticalExaggeration: number;
  cameraPresets: CameraPreset[];
}

export interface TerrainGrid {
  cols: number;
  rows: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minElevation: number;
  maxElevation: number;
  elevations: number[];
}

/** 1 つの輪郭の中の、高さの違う塊（data/campuses/<キャンパス>/building-parts.ts から読み込み時に付ける） */
export interface BuildingPart {
  name: string;
  levels: number;
  /** 地面から屋根までの高さ（m） */
  height: number;
  polygon: [number, number][];
}

export interface BuildingFeature {
  id: string;
  osmId?: string;
  landmarkId?: string;
  name: string;
  shortName: string;
  kana: string;
  englishName: string;
  category: BuildingCategory;
  inCampus: boolean;
  faculties: string[];
  facilityTags: FacilityTag[];
  keywords: string[];
  description: string;
  /** 'name-only' なら名称のほかの情報（階数・設備・出入口・経路）を出さない（中学校・高等学校・幼稚園の施設） */
  infoPolicy?: 'name-only';
  architectNote?: string;
  sculptStyle: LandmarkSculptStyle;
  labelPriority: number;
  isSpotOnly?: boolean;
  isQuickOrigin?: boolean;
  polygon: [number, number][];
  holes?: [number, number][][];
  centroid: LocalPoint2D;
  groundY: number;
  minGroundY: number;
  maxGroundY: number;
  height: number;
  levels: number;
  walkNodeId: string | null;
  accessibleWalkNodeId: string | null;
  /**
   * 建物の中の棟（号館・棟。docs/indoor-plan.md 4 節）。輪郭が 1 つの建物を、棟ごとに選べるようにする。
   * 読み込み時に data/campuses/<キャンパス>/wings.ts から付ける（buildings.json には無い）
   */
  wings?: BuildingWing[];
  /** 地図では別の輪郭の棟で、この建物のシートにも棟のボタンとして並べる棟（WingBuildingLink.alsoListedIn） */
  sheetWings?: BuildingWing[];
  /**
   * 高さの違う塊（無ければ輪郭全体を height で押し出す）。あるときの levels・height は最も高い塊の値。
   * 読み込み時に building-parts.ts から付ける（buildings.json には無い）
   */
  parts?: BuildingPart[];
  /** 工事の範囲にかかっていること（読み込み時に closures.json から付ける。domain/closures.ts） */
  construction?: BuildingConstruction;
}

export type LandcoverKind =
  | 'campus-ground'
  | 'lawn'
  | 'sports-pitch'
  | 'forest'
  | 'water';

export interface LandcoverFeature {
  id: string;
  kind: LandcoverKind;
  name?: string;
  polygon: [number, number][];
}

export type PathKind =
  | 'campus-walk'
  | 'steps'
  | 'road-major'
  | 'road-minor';

export interface PathFeature {
  id: string;
  kind: PathKind;
  name?: string;
  points: [number, number][];
  width: number;
}

export interface ElevatedBridgeFeature {
  id: string;
  name: string;
  kind: 'skybridge' | 'overpass';
  /** (x, deckElevM, z) */
  points: [number, number, number][];
  width: number;
}

export interface AccessCanopyFeature {
  id: string;
  name: string;
  /** (x, groundElevM, z) */
  spine: [number, number, number][];
  /** (x, groundElevM, z) sub-range where outdoor escalator sits */
  escalatorRange?: [number, number, number][];
  width: number;
}

export interface TunnelPortalFeature {
  id: string;
  name: string;
  x: number;
  /** 開口の床（路面）の標高（m） */
  y: number;
  z: number;
  /** rotation.y。坑門のローカル +X がトンネルの外（坑口が面する側）を向き、ローカル Z が坑門の幅の方向 */
  angleRad: number;
  /** 坑門の全幅（m） */
  width: number;
  /** expressway＝高速道路の坑口、culvert＝高速道路の下をくぐる道の通路の口 */
  kind?: 'expressway' | 'culvert';
  /** 開口（坑門の中心からの幅の方向のずれと、開口の幅）。無ければ全幅の 78% の開口 1 つ */
  openings?: { offset: number; width: number }[];
  /** 開口の高さ（m） */
  openingHeight?: number;
  /** 坑門の壁の高さ（m、路面から） */
  wallHeight?: number;
  /** 坑門の奥行き（トンネルの中へ向かう覆いの長さ、m） */
  hoodDepth?: number;
}

export type ExpresswaySegmentKind = 'bridge' | 'ground';

/** 高速道路の片側の車道（OSM の way をつないだ線と、推定した路面の高さ） */
export interface ExpresswayCarriagewayFeature {
  id: string;
  name: string;
  lanes: number;
  osmWayIds: number[];
  /** (x, 路面の標高 m（推定）, z)。西→東 */
  points: [number, number, number][];
  /** i 番目の点から i+1 番目の点までの区間の種類（points.length - 1 個） */
  segmentKinds: ExpresswaySegmentKind[];
  /** 車道の幅（高欄の外側まで、m） */
  width: number;
  /** 床版＋桁の厚み（m） */
  structureDepth: number;
  slabThickness: number;
  parapetHeight: number;
  parapetThickness: number;
  /** 地上の区間の側面。0＝擁壁（縦の壁）、正＝盛土の法面の勾配（水平 / 鉛直） */
  embankmentSlope: number;
}

/** 高架の橋脚（柱と梁） */
export interface ExpresswayPierFeature {
  carriagewayId: string;
  x: number;
  z: number;
  /** 桁の下面（梁の上面）の標高（m） */
  topElevM: number;
  /** 道路の進む向き（rotation.y でローカル +X が進む向きになる角度） */
  angleRad: number;
  /** 梁の長さ（車道の幅の方向、m） */
  capLength: number;
  /** 柱の太さ（m） */
  columnSize: number;
}

export interface CampusStructuresData {
  bridges: ElevatedBridgeFeature[];
  accessCanopies: AccessCanopyFeature[];
  tunnelPortals: TunnelPortalFeature[];
  expressways?: ExpresswayCarriagewayFeature[];
  expresswayPiers?: ExpresswayPierFeature[];
  grounds?: GroundFeature[];
}

/** 陸上のトラック: 標準の 400m のトラック（直線と半円）を内側のフィールドの向きに合わせたもの（推定） */
export interface GroundTrackDetail {
  /** トラックの中心と、直線の向き（単位ベクトル） */
  center: [number, number];
  axis: [number, number];
  straightM: number;
  innerRadiusM: number;
  lanes: number;
  laneWidthM: number;
  /** 内側の人工芝のフィールドの輪郭（OSM） */
  pitch: [number, number][];
  /** サッカーのコートの線の長さと幅（m） */
  fieldLengthM: number;
  fieldWidthM: number;
}

/** 野球場: 本塁・両翼のポール・外野のフェンスの位置と寸法（推定） */
export interface GroundBaseballDetail {
  home: [number, number];
  leftPole: [number, number];
  rightPole: [number, number];
  /** 外野のフェンス（左翼のポールから右翼のポールへ） */
  fence: [number, number][];
  infieldRadiusM: number;
  moundDistanceM: number;
  baseDistanceM: number;
  warningTrackM: number;
  fenceHeightM: number;
}

/** 観客席: 後ろから前へ下がる座席の面（前の縁・後ろの縁は axis に直角な向きの座標 v。高さは推定） */
export interface GroundGrandstandDetail {
  axis: [number, number];
  vFront: number;
  vBack: number;
  frontElevation: number;
  backElevation: number;
  /** 側面の壁の下端（地面の下に隠れる高さ） */
  bottomElevation: number;
  seatHex: string;
  aisleHex: string;
}

/** テニスコート: コートの中心と長い方向、面の色、網の柵の高さ（推定） */
export interface GroundTennisDetail {
  courts: { center: [number, number]; axis: [number, number] }[];
  surfaceHex: string;
  courtHex: string;
  fenceHeightM: number;
  /** 屋上のコートの建物の id（建物の屋根の上に置く） */
  roofOf?: string;
}

/**
 * グラウンドの平らな面 1 つ（OSM の輪郭から。線・寸法は推定）。
 * 地面のグラウンドは elevation の高さの平らな面で、表示ではその高さに地形をならす
 */
export interface GroundFeature {
  id: string;
  name?: string;
  kind: 'athletics-track' | 'track-straight' | 'grandstand' | 'baseball' | 'tennis';
  /** 面の輪郭（ローカル座標、閉じない） */
  polygon: [number, number][];
  /** 面の標高（m）。輪郭の中の地形の中央値。屋上のコートでは使わない */
  elevation: number;
  track?: GroundTrackDetail;
  straight?: { lanes: number };
  grandstand?: GroundGrandstandDetail;
  baseball?: GroundBaseballDetail;
  tennis?: GroundTennisDetail;
}

/** 駅のホーム・駅舎・上屋（OSM の輪郭。高さは推定） */
export interface StationFacilitiesFeature {
  stationId: string;
  platforms: { id: string; ref: string; polygon: [number, number][] }[];
  buildings: {
    id: string;
    name: string;
    polygon: [number, number][];
    /** 地面から屋根までの高さ（m、推定） */
    heightM: number;
    roofHex: string;
  }[];
  canopies: {
    id: string;
    platformId: string;
    polygon: [number, number][];
    /** ホームの上面から屋根の下面までの高さ（m、推定） */
    clearHeightM: number;
  }[];
}

export interface TransportData {
  railways: {
    id: string;
    name: string;
    points: [number, number][];
  }[];
  stations: {
    id: string;
    name: string;
    x: number;
    z: number;
    y: number;
    walkNodeId: string | null;
  }[];
  stationFacilities?: StationFacilitiesFeature[];
}

export interface WalkNode {
  id: string;
  x: number;
  z: number;
  y: number;
}

export interface WalkEdge {
  to: string;
  dist: number;
  deltaY: number;
  slope: number;
  isSteps: boolean;
  isBridge: boolean;
  isShureiBridge?: boolean;
  isEscalator: boolean;
  /**
   * 朝のラッシュ時に全機が上りになる運用があるエスカレーター（西門〜第3学舎の新アクセス路の 2 台。
   * 持ち主の確認、2026-11-20）。OSM にエスカレーターの向きの情報は無い。
   */
  rushHourUpOnly?: boolean;
}

export interface WalkGraph {
  nodes: Record<string, WalkNode>;
  adjacency: Record<string, WalkEdge[]>;
}

export interface CampusDatasetMeta {
  campusId: CampusId;
  generatedAt: string;
  origin: ProjectionOrigin;
  bounds: CampusConfig['bounds'];
  stats: {
    totalBuildings: number;
    campusBuildings: number;
    matchedLandmarks: number;
    walkNodes: number;
    accessibleWalkNodes: number;
    walkEdges: number;
    bridges: number;
    accessCanopies: number;
    minElevation: number;
    maxElevation: number;
  };
}

export interface CampusDataset {
  meta: CampusDatasetMeta;
  terrain: TerrainGrid;
  buildings: BuildingFeature[];
  landcover: LandcoverFeature[];
  paths: PathFeature[];
  structures: CampusStructuresData;
  /** 経路は読み込み時に closures を当てた後の物（範囲の中の辺を外してある） */
  walkGraph: WalkGraph;
  transport: TransportData;
  /** 工事などで一時的に入れない範囲（描くのと、建物シートの一言に使う） */
  closures: CampusClosure[];
}

export type RouteMode = 'shortest' | 'gentle' | 'step-free';

export interface ElevationSample {
  distanceM: number;
  elevationM: number;
  isSteps: boolean;
  isBridge: boolean;
  isEscalator: boolean;
}

/** 経路が通るエスカレーター 1 区間（向きは辺の両端の高さで決める） */
export interface EscalatorUse {
  /** `RouteResult.points` の区間の番号（points[index] → points[index + 1]） */
  edgeIndex: number;
  /** 'flat' は両端の高さの差が 0.05m 未満（向きを言えない） */
  direction: 'up' | 'down' | 'flat';
  /** 朝のラッシュ時に全機が上りになる運用がある（下りが階段になる） */
  rushHourUpOnly: boolean;
}

export interface RouteResult {
  mode: RouteMode;
  fromId: string;
  toId: string;
  points: LocalPoint3D[];
  totalDistanceM: number;
  estimatedMinutes: number;
  elevationGainM: number;
  elevationLossM: number;
  stepsCount: number;
  usesBridge: boolean;
  usesShureiBridge: boolean;
  usesEscalator: boolean;
  /** 通るエスカレーターの区間を、通る順に。無ければ空 */
  escalatorUses: EscalatorUse[];
  isStepFree: boolean;
  maxSlopeRatio: number;
  steepSegmentsM: number;
  profile: ElevationSample[];
}

export interface ProjectedLabel {
  id: string;
  name: string;
  shortName: string;
  category: BuildingCategory;
  screenX: number;
  screenY: number;
  distanceToCamera: number;
  priority: number;
  visible: boolean;
}

export type LightingTheme = 'day' | 'golden';

