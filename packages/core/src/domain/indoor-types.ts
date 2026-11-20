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
  /** 棟の表示の名前（自由な文字列。例: '3号館 C棟'） */
  wing?: string;
  /**
   * 棟の id（docs/indoor-plan.md 17 節の移行の先。建物との対応は棟の対応の表）。今は第3学舎の部屋だけが持つ。
   * ほかの部屋は wing の文字列のまま（P2 で移す）
   */
  wingId?: string;
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
  /** 建物の中の棟（BuildingWing.id）。棟の名前の検索と、棟を持つ部屋で入る。選ぶとその棟を選んだ状態で開く */
  wingId?: string;
  roomCode?: string;
  groundY: number;
  walkNodeId: string | null;
  accessibleWalkNodeId: string | null;
}
