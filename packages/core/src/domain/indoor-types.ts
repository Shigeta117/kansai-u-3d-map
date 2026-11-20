import type { BuildingCategory, GeoCoord } from './types';

export type AccessStatus = 'yes' | 'no' | 'unknown';

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
  access: AccessStatus;
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
  access: AccessStatus;
  label: string;
  note?: string;
  /** 出典（資料の名前と版）。出典の無い連絡は持たない（docs/indoor-plan.md の P0a） */
  source?: string;
}

export interface RoomEntry {
  id: string;
  code: string;
  name: string;
  floor: number;
  kind: RoomKind;
  wing?: string;
  searchableCodes?: string[];
  capacity?: number;
  access?: AccessStatus;
  powerOutlets?: boolean;
  note?: string;
}

export interface FloorMeta {
  floor: number;
  label: string;
  groundAccess?: boolean;
  elevator?: AccessStatus;
  accessibleRestroom?: AccessStatus;
  floorMapImage?: string;
}

export interface BuildingFloorPlan {
  buildingId: string;
  wingLabel?: string;
  numberingRule?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceUpdatedAt?: string;
  accessibilitySource?: string;
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
  wing?: string;
  roomCode?: string;
  groundY: number;
  walkNodeId: string | null;
  accessibleWalkNodeId: string | null;
}
