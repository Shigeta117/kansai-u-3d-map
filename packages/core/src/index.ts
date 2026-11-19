// Domain types & schemas
export * from './domain/types';
export * from './domain/indoor-types';

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

// 3D scene builders & orchestration
export { SCENE_PALETTE } from './scene/palette';
export { buildTerrainGroup, mergeSimpleGeometries } from './scene/TerrainBuilder';
export {
  buildBuildingsGroup,
  applyBuildingVisualStates,
  isBuildingWithinDiorama,
  type BuildingMeshRecord,
  type BuildingsBuildResult,
  type MaterialColorEntry,
  type RoofColorMode,
} from './scene/BuildingBuilder';
export {
  buildDioramaBaseGroup,
  createDioramaClippingPlanes,
  sampleTerrainMeshElevation,
} from './scene/DioramaBaseBuilder';
export { buildStructuresBridgesGroup } from './scene/BridgeBuilder';
export { buildAccessCanopiesGroup } from './scene/AccessWayBuilder';
export { sculptLandmarkDetails, type SculptExtraResult } from './scene/LandmarkSculptor';
export { buildFoliageGroup } from './scene/FoliageBuilder';
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
} from './scene/CampusScene';
