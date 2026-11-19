import type { BuildingCategory, GeoCoord } from './types';

export type RoomKind =
  | 'lecture'
  | 'hall'
  | 'lab'
  | 'seminar'
  | 'office'
  | 'cafeteria'
  | 'library'
  | 'lounge'
  | 'restroom'
  | 'other';

export interface BuildingEntrance {
  id: string;
  label: string;
  floor: number;
  coord?: GeoCoord;
  walkNodeId?: string;
  accessible: boolean;
  note?: string;
}

export type ConnectorKind =
  | 'skybridge'
  | 'indoor-corridor'
  | 'underground'
  | 'elevator-shaft';

export interface BuildingConnector {
  id: string;
  fromBuildingId: string;
  fromFloor: number;
  toBuildingId: string;
  toFloor: number;
  kind: ConnectorKind;
  accessible: boolean;
  label: string;
  note?: string;
}

export interface RoomEntry {
  id: string;
  code: string;
  name: string;
  floor: number;
  kind: RoomKind;
  capacity?: number;
  accessible?: boolean;
  powerOutlets?: boolean;
  note?: string;
}

export interface FloorMeta {
  floor: number;
  label: string;
  groundAccess?: boolean;
  hasElevator?: boolean;
  hasAccessibleRestroom?: boolean;
  floorMapImage?: string;
}

export interface BuildingFloorPlan {
  buildingId: string;
  summaryNote?: string;
  floors: FloorMeta[];
  entrances: BuildingEntrance[];
  connectors: BuildingConnector[];
  rooms: RoomEntry[];
}

export interface LocationSearchItem {
  key: string;
  kind: 'building' | 'room';
  buildingId: string;
  title: string;
  subtitle: string;
  category: BuildingCategory;
  floor?: number;
  roomCode?: string;
  groundY: number;
  walkNodeId: string | null;
  accessibleWalkNodeId: string | null;
}

