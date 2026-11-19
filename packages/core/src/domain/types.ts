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
  walkGraph: WalkGraph;
  transport: TransportData;
}

export type RouteMode = 'shortest' | 'gentle' | 'step-free';

export interface ElevationSample {
  distanceM: number;
  elevationM: number;
  isSteps: boolean;
  isBridge: boolean;
  isEscalator: boolean;
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

