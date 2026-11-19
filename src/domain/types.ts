export type CampusId = 'senriyama';

export type BuildingCategory =
  | 'area1'      // 第1学舎（法・文）
  | 'area2'      // 第2学舎（経・商）
  | 'area3'      // 第3学舎（社会）
  | 'area4'      // 第4学舎（理工）
  | 'shared'     // 共用・学生施設（凜風館・以文館等）
  | 'heritage'   // 歴史・文化（簡文館・総合図書館等）
  | 'sports'     // 体育・スポーツ・グラウンド施設
  | 'gate'       // 門・駅・交通結節点
  | 'other'      // その他キャンパス施設
  | 'surrounding'; // 周辺街区（非キャンパス）

export type LandmarkSculptStyle =
  | 'kanbunkan-rotunda'
  | 'rimpukan-green-roof'
  | 'bighall-auditorium'
  | 'library-crown'
  | 'area1-brick'
  | 'area4-lab'
  | 'main-gate'
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
  /** Search keywords for instant matching */
  keywords: string[];
  /** Approximate WGS84 coordinates for matching & fallback pin */
  approxCoord: GeoCoord;
  /** Optional entrance / turnstile coordinate for snapping walk graph node */
  walkTargetCoord?: GeoCoord;
  /** Possible OSM name substrings used during data build matching */
  osmNameAliases: string[];
  /** Architectural / campus trivia shown in detail sheet */
  description: string;
  architectNote?: string;
  sculptStyle?: LandmarkSculptStyle;
  /** Default floors if OSM building:levels is missing */
  defaultLevels: number;
  /** Label importance rank (1 = always prioritized) */
  labelPriority: number;
  /** Can be used as a point-only landmark (e.g. gate / garden / hill) if no polygon */
  isSpotOnly?: boolean;
  /** Quick preset departure candidate */
  isQuickOrigin?: boolean;
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
  /** Row-major (z-major from minZ to maxZ, x from minX to maxX) elevation in meters */
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
  /** Outer footprint ring in local (x, z) meters */
  polygon: [number, number][];
  /** Optional inner holes */
  holes?: [number, number][][];
  centroid: LocalPoint2D;
  /** Elevation at centroid (meters) */
  groundY: number;
  /** Lowest terrain elevation across polygon vertices (meters) */
  minGroundY: number;
  /** Highest terrain elevation across polygon vertices (meters) */
  maxGroundY: number;
  /** Building extrusion height in meters */
  height: number;
  levels: number;
  walkNodeId: string | null;
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
    walkEdges: number;
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
  walkGraph: WalkGraph;
  transport: TransportData;
}

export type RouteMode = 'shortest' | 'gentle';

export interface ElevationSample {
  distanceM: number;
  elevationM: number;
  isSteps: boolean;
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
  maxSlopeRatio: number;
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
