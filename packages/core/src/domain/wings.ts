import type { BuildingEntrance } from './indoor-types';
import type { BuildingFeature, LocalPoint2D } from './types';

/**
 * 建物の中の棟（建物の部品）。docs/indoor-plan.md 4 節・7 節。
 *
 * OSM の輪郭が 1 つの建物（屋外の入口も共有）の中に、号館・棟を部品として持たせる。第3学舎の 1〜4 号館 A〜D 棟のほか、
 * 号館ごとに輪郭が分かれていない学舎も同じ形で足せる。館内の地図（IMDF）に書き出すときは、棟ごとに building を分け、
 * venue でまとめる。
 *
 * 塊の範囲（region）は、建物の向きに沿った枠（u・v 軸）の帯や箱で表す。実際の塊は「建物の輪郭 ∩ region」で、
 * 地図の当たり判定（押した点がどの棟か）と、選んだ棟だけを光らせる殻は、この region で切り分ける
 */

/** 枠の座標。u = (x, z)・axisU、v = (x, z)・(−axisU[1], axisU[0])（u 軸を x から z の向きへ 90° 回した軸） */
export interface WingRegion {
  /** 枠の u 軸の向き（ローカル座標の x, z。長さ 1） */
  axisU: [number, number];
  /** u・v の下限と上限（m）。省くとその向きに限りなし */
  uMin?: number;
  uMax?: number;
  vMin?: number;
  vMax?: number;
}

export interface BuildingWing {
  /** 棟の id（建物の中で一意。例: 'c'） */
  id: string;
  /** 棟の名前（例: 'C棟'） */
  name: string;
  /** 号館の名前（例: '3号館'） */
  hallName?: string;
  /** 部屋のデータ（RoomEntry.wing）での棟の名前（例: '3号館 C棟'） */
  roomWing: string;
  /** 地上の階の数 */
  floorsAbove: number;
  /** 地下の階の数（資料に無ければ 0） */
  floorsBelow: number;
  /** 階高（m）。推定の値なら note に書く */
  floorHeightM: number;
  /** 塊の範囲 */
  region: WingRegion;
  /** 棟の入口（館内の案内の L1 で足す。今は空） */
  entrances: BuildingEntrance[];
  /** 検索で棟に当てる別名（号館・棟の名前の組み合わせは wingSearchAliases が作るので、それ以外だけ） */
  aliases?: string[];
  note?: string;
}

type P2 = [number, number];

function toFrame(region: WingRegion, x: number, z: number): P2 {
  const [ax, az] = region.axisU;
  return [x * ax + z * az, -x * az + z * ax];
}

/** ローカル座標の点 (x, z) が棟の塊の範囲に入るか（境目の上は両方に入る） */
export function wingRegionContains(region: WingRegion, x: number, z: number): boolean {
  const [u, v] = toFrame(region, x, z);
  if (region.uMin !== undefined && u < region.uMin) return false;
  if (region.uMax !== undefined && u > region.uMax) return false;
  if (region.vMin !== undefined && v < region.vMin) return false;
  if (region.vMax !== undefined && v > region.vMax) return false;
  return true;
}

/** 地図の当たり判定: 建物の上の点 (x, z) がどの棟か（棟の無い建物や、どの棟にも入らない点は null） */
export function findWingAt(building: Pick<BuildingFeature, 'wings'>, x: number, z: number): BuildingWing | null {
  for (const wing of building.wings ?? []) {
    if (wingRegionContains(wing.region, x, z)) return wing;
  }
  return null;
}

export function findWing(building: Pick<BuildingFeature, 'wings'> | null | undefined, wingId: string | null | undefined): BuildingWing | null {
  if (!building || !wingId) return null;
  return building.wings?.find((w) => w.id === wingId) ?? null;
}

/** 部屋のデータの棟の名前（RoomEntry.wing）から棟を引く */
export function findWingForRoom(building: Pick<BuildingFeature, 'wings'>, roomWing: string | undefined): BuildingWing | null {
  if (!roomWing) return null;
  return building.wings?.find((w) => w.roomWing === roomWing) ?? null;
}

/** 号館と棟の名前（例: '3号館 C棟'） */
export function wingLabel(wing: BuildingWing): string {
  return wing.hallName ? `${wing.hallName} ${wing.name}` : wing.name;
}

/** 見出しの名前（例: '第3学舎 3号館 C棟'） */
export function wingTitle(building: Pick<BuildingFeature, 'shortName'>, wing: BuildingWing): string {
  return `${building.shortName} ${wingLabel(wing)}`;
}

/** 階の数の表記（例: '地上 10 階'・'地下 1 階・地上 4 階'） */
export function wingFloorsText(wing: BuildingWing): string {
  const above = `地上 ${wing.floorsAbove} 階`;
  return wing.floorsBelow > 0 ? `地下 ${wing.floorsBelow} 階・${above}` : above;
}

/** その棟にある階か（地下は負の数。0 階は無い） */
export function wingHasFloor(wing: BuildingWing, floor: number): boolean {
  if (floor === 0) return false;
  return floor >= -wing.floorsBelow && floor <= wing.floorsAbove;
}

/**
 * 検索で棟に当てる名前。号館・棟の名前の組み合わせ（'C棟'・'3号館'・'3号館C棟'・'C棟（3号館）'・
 * '第3学舎C棟'・'第3学舎3号館'・'第3学舎3号館C棟'）と、棟の別名
 */
export function wingSearchAliases(building: Pick<BuildingFeature, 'shortName'>, wing: BuildingWing): string[] {
  const out = new Set<string>();
  const add = (s: string): void => {
    if (s.trim()) out.add(s);
  };
  const parts = wing.hallName ? [wing.name, wing.hallName, `${wing.hallName}${wing.name}`] : [wing.name];
  for (const p of parts) {
    add(p);
    add(`${building.shortName}${p}`);
  }
  if (wing.hallName) add(`${wing.name}（${wing.hallName}）`);
  for (const a of wing.aliases ?? []) add(a);
  return [...out];
}

// --- 塊の範囲の面積と重心（カメラを寄せる先） ---

/** 多角形を半平面 (u, v)・n ≥ c で切る（Sutherland–Hodgman。凹んだ多角形では切り口に幅 0 の辺が残るが、面積と重心は正しい） */
function clipByHalfPlane(ring: readonly P2[], n: P2, c: number): P2[] {
  const out: P2[] = [];
  const side = (p: P2): number => p[0] * n[0] + p[1] * n[1] - c;
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i];
    const prev = ring[(i + ring.length - 1) % ring.length];
    if (!cur || !prev) continue;
    const sc = side(cur);
    const sp = side(prev);
    if (sc >= 0 !== sp >= 0) {
      const t = sp / (sp - sc);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (sc >= 0) out.push(cur);
  }
  return out;
}

/** 枠の座標の輪郭を region の箱で切る */
function clipRingToRegion(ringFrame: readonly P2[], region: WingRegion): P2[] {
  let ring: P2[] = [...ringFrame];
  if (region.uMin !== undefined) ring = clipByHalfPlane(ring, [1, 0], region.uMin);
  if (region.uMax !== undefined) ring = clipByHalfPlane(ring, [-1, 0], -region.uMax);
  if (region.vMin !== undefined) ring = clipByHalfPlane(ring, [0, 1], region.vMin);
  if (region.vMax !== undefined) ring = clipByHalfPlane(ring, [0, -1], -region.vMax);
  return ring;
}

function areaAndCentroid(ring: readonly P2[]): { area: number; cx: number; cy: number } {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    if (!p || !q) continue;
    const cross = p[0] * q[1] - q[0] * p[1];
    a2 += cross;
    cx += (p[0] + q[0]) * cross;
    cy += (p[1] + q[1]) * cross;
  }
  if (Math.abs(a2) < 1e-9) return { area: 0, cx: 0, cy: 0 };
  // 向きによらず面積は正、重心は符号付きの面積で割れば同じ
  return { area: Math.abs(a2) / 2, cx: cx / (3 * a2), cy: cy / (3 * a2) };
}

/**
 * 棟の塊（建物の輪郭 ∩ 塊の範囲、中庭などの穴は除く）の面積（m²）と重心（ローカル座標）。
 * 輪郭が範囲に掛からなければ null
 */
export function wingFootprintCentroid(
  building: Pick<BuildingFeature, 'polygon' | 'holes'>,
  wing: Pick<BuildingWing, 'region'>,
): { area: number; centroid: LocalPoint2D } | null {
  const region = wing.region;
  const [ax, az] = region.axisU;
  const frameRing = (ring: readonly P2[]): P2[] => ring.map(([x, z]) => toFrame(region, x, z));
  const outer = areaAndCentroid(clipRingToRegion(frameRing(building.polygon), region));
  let area = outer.area;
  let mu = outer.area * outer.cx;
  let mv = outer.area * outer.cy;
  for (const hole of building.holes ?? []) {
    if (hole.length < 3) continue;
    const h = areaAndCentroid(clipRingToRegion(frameRing(hole), region));
    area -= h.area;
    mu -= h.area * h.cx;
    mv -= h.area * h.cy;
  }
  if (area < 1e-6) return null;
  const u = mu / area;
  const v = mv / area;
  // 枠の座標からローカル座標へ（x = u·ax − v·az、z = u·az + v·ax）
  return { area, centroid: { x: u * ax - v * az, z: u * az + v * ax } };
}
