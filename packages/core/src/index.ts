// Domain types & schemas
export * from './domain/types';
export * from './domain/indoor-types';
export * from './domain/wings';
export * from './domain/indoor-l1';

// Domain logic
export * from './domain/campus-registry';
export * from './domain/labels';
export * from './domain/projection';
export * from './domain/routing';
export * from './domain/search';

// Campus data & loader
export * from './data/loadCampusData';
export { SENRIYAMA_CONFIG } from './data/campuses/senriyama/config';
export { SENRIYAMA_LANDMARKS } from './data/campuses/senriyama/landmarks';
export {
  AREA1_WING_IDS,
  AREA3_WING_IDS,
  SENRIYAMA_WING_BUILDINGS,
  SENRIYAMA_WINGS,
} from './data/campuses/senriyama/wings';

// 3D scene builders & orchestration
export { SCENE_PALETTE } from './scene/palette';
export { buildTerrainGroup, mergeSimpleGeometries } from './scene/TerrainBuilder';
export {
  buildBuildingsGroup,
  applyBuildingVisualStates,
  isBuildingWithinDiorama,
  type BuildingMeshRecord,
  type BuildingsBuildResult,
  type BuildingVisualOptions,
  type MaterialColorEntry,
  type RoofColorMode,
} from './scene/BuildingBuilder';
export {
  DEFAULT_SELECTION_LOOK,
  parseSelectionLook,
  SelectionHighlighter,
  type SelectionLook,
  type SelectionOutline,
} from './scene/selectionHighlight';
export {
  buildDioramaBaseGroup,
  createDioramaClippingPlanes,
  sampleTerrainMeshElevation,
} from './scene/DioramaBaseBuilder';
export { buildStructuresBridgesGroup } from './scene/BridgeBuilder';
export { buildExpresswayMesh, carveTerrainForExpressways } from './scene/ExpresswayBuilder';
export { buildStationGroup, type StationBuildResult } from './scene/StationBuilder';
export { buildAccessCanopiesGroup } from './scene/AccessWayBuilder';
export { sculptLandmarkDetails, type SculptExtraResult } from './scene/LandmarkSculptor';
export { buildFoliageGroup } from './scene/FoliageBuilder';
export { buildGroundsGroup, carveTerrainForGrounds } from './scene/GroundsBuilder';
export { buildTransportGroup, type TransportBuildResult } from './scene/TransportBuilder';
export { RouteOverlay } from './scene/RouteOverlay';
export {
  CameraRig,
  clampTargetToDiorama,
  formatCameraParam,
  parseCameraParam,
  type CameraPose,
} from './scene/CameraRig';
export { LightingRig } from './scene/LightingRig';
export {
  CampusScene,
  type CampusSceneCallbacks,
  type CampusSceneOptions,
  type RenderStats,
} from './scene/CampusScene';
