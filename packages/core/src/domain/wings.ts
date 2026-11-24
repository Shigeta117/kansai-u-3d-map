import type { BuildingEntrance, BuildingFloorPlan } from './indoor-types';
import type { BuildingFeature, LocalPoint2D } from './types';

/**
 * 棟（館内の単位）と、建物（OSM の輪郭）との対応。docs/indoor-plan.md 5 節・12 節・17 節。
 *
 * - 館内の単位は棟。棟の id はキャンパスで一意（WING_ID_RULE）
 * - 建物と棟の対応は別の表（WingBuildingLink）に持つ。学舎ごとに建物の分け方がばらばらなため
 *   （第3学舎は 1 つの建物に A〜D 棟、第1学舎は号館ごとに別の建物、第2学舎は 1 つの建物に A棟と B棟 など）
 * - 1 つの建物に複数の棟があるときは、対応の表に塊の範囲（region）を書く。region は建物の向きに沿った枠（u・v 軸）の
 *   帯や箱で、実際の塊は「建物の輪郭 ∩ region」。地図の当たり判定と、選んだ棟だけを光らせる殻の切り分けに使う
 * - 読み込み時に 2 つの表を合わせ、BuildingFeature.wings（BuildingWing の並び）にする
 */

/**
 * 棟の id の決め方（P0b）: 「学舎の鍵」＋「-」＋「棟の記号」。単位は KAN-CAN! の学舎・教室一覧の見出し（1 見出し = 1 棟）。
 *
 * - 学舎の鍵: 第1〜第4学舎は学舎の id（BuildingCategory。'area1'〜'area4'）。第1〜第4学舎に入らない建物
 *   （岩崎記念館・尚文館・以文館）は建物の id（'iwasaki' など）
 * - 棟の記号:
 *   1. 英字の棟の記号（KAN-CAN! の部屋の番号の頭の文字。C301 の C）がある棟は、その小文字。例 'area1-a'・'area2-f'・'area3-c'・'iwasaki-f'
 *   2. 記号の無い号館（第4学舎）は h ＋号館の数字。KAN-CAN! が 1 つの号館を役割で分けている見出しは、役割の頭文字を足す
 *      （p = 教授棟、r = 研究棟、a = 別館）。例 'area4-h3'（3号館）・'area4-h1p'（1号館 教授棟）・'area4-h2a'（2号館 研究棟別館）
 *   3. 実験棟は x ＋番号。例 'area4-x1'（第1実験棟）
 *   4. 号館にも棟にも分かれない建物は main。例 'shobunkan-main'
 * - 建物の id（'area3'・'area1-1'・'area4-2' など、数字か名前で終わる）とは重ならない（棟の記号は a〜f か h・x ＋数字か main）
 */
export const WING_ID_RULE = /^[a-z][a-z0-9]*-(?:[a-f]|h[1-9][pra]?|x[1-9]|main)$/;

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

/** 棟（館内の単位） */
export interface Wing {
  /** 棟の id（キャンパスで一意。WING_ID_RULE） */
  id: string;
  /** 学舎の名前（例: '第3学舎'） */
  school: string;
  /** 号館の名前（例: '3号館'） */
  hallName?: string;
  /** 棟の名前（例: 'C棟'） */
  name: string;
  /** 地上の階の数 */
  floorsAbove: number;
  /** 地下の階の数（資料に無ければ 0） */
  floorsBelow: number;
  /**
   * 階高（m）。地図で棟に寄るときのカメラの高さにだけ使う（無ければ建物の高さ ÷ 階の数）。推定の値なら note に書く。
   * 館内の案内の L1 は階の高さを使わない（docs/indoor-plan.md 5 節）ので、棟を押して選べない建物の棟には入れない
   */
  floorHeightM?: number;
  /**
   * 棟の入口（今は空）。L1 の入口は館内の L1 のグラフのノード（apps/guide/src/data/indoor/l1/）に試しの形で持つ。
   * どちらに寄せるかは P2 の型の移行（docs/indoor-plan.md 17 節）で決める
   */
  entrances: BuildingEntrance[];
  /** 検索で棟に当てる別名（学舎・号館・棟の名前の組み合わせは wingSearchAliases が作るので、それ以外だけ） */
  aliases?: string[];
  /**
   * 部外者・学部生が入れない棟（第4学舎2号館の研究棟と研究棟別館）。KAN-CAN! にある情報（部屋の名前など）だけ載せ、
   * 現地・冊子での調査はしない（docs/indoor-plan.md 3 節）。建物シートは部屋の一覧の上に短い一言を出す
   */
  restricted?: boolean;
  note?: string;
}

/** 建物と棟の対応（別の表）。1 つの建物に複数の棟があるときは region で塊を分ける（無ければ建物の全体） */
export interface WingBuildingLink {
  wingId: string;
  buildingId: string;
  region?: WingRegion;
  /**
   * 地図では別の輪郭（buildingId）の棟を、この建物のシートにも棟のボタンとして並べる（第4学舎2号館のシートに、
   * 中庭の別の輪郭の研究棟別館を並べる）。ボタンはシートの中だけの絞り込みで、地図の棟の選択は変えない
   */
  alsoListedIn?: string;
}

/** 建物に付けた棟（棟と、その建物の中の塊の範囲） */
export interface BuildingWing extends Wing {
  region?: WingRegion;
}

/**
 * 地図で棟を押して選べる建物（BuildingFeature.wings を付ける建物）: 棟が 2 つ以上対応し、そのすべてに塊の範囲がある建物。
 * 棟が 1 つの建物は建物を選べば棟を選んだことになり、範囲の無い棟がある建物は押した所の棟を決められないので、
 * どちらも付けない（棟の表と対応の表には載る）
 */
export function pickableWingBuildingIds(
  links: readonly WingBuildingLink[],
  wings: readonly Pick<Wing, 'id' | 'restricted'>[] = [],
): Set<string> {
  const restricted = new Set(wings.filter((w) => w.restricted).map((w) => w.id));
  const byBuilding = new Map<string, WingBuildingLink[]>();
  for (const link of links) byBuilding.set(link.buildingId, [...(byBuilding.get(link.buildingId) ?? []), link]);
  const out = new Set<string>();
  for (const [buildingId, list] of byBuilding) {
    if (list.length >= 2 && list.every((l) => l.region)) out.add(buildingId);
    // 棟が 1 つでも、部外者・学部生が入れない棟（第4学舎2号館の研究棟別館）の輪郭は棟を付け、押したときに一言を出す
    else if (list.length === 1 && list.every((l) => restricted.has(l.wingId))) out.add(buildingId);
  }
  return out;
}

/** 棟の表と対応の表を合わせて、建物ごとの棟の並びにする（対応の表の順） */
export function joinBuildingWings(
  wings: readonly Wing[],
  links: readonly WingBuildingLink[],
): Map<string, BuildingWing[]> {
  const byId = new Map(wings.map((w) => [w.id, w]));
  const out = new Map<string, BuildingWing[]>();
  for (const link of links) {
    const wing = byId.get(link.wingId);
    if (!wing) continue;
    const list = out.get(link.buildingId) ?? [];
    list.push(link.region ? { ...wing, region: link.region } : { ...wing });
    out.set(link.buildingId, list);
  }
  return out;
}

/** 別の輪郭の棟をシートに並べる表（alsoListedIn の建物ごとの棟の並び。対応の表の順） */
export function joinSheetWings(wings: readonly Wing[], links: readonly WingBuildingLink[]): Map<string, Wing[]> {
  const byId = new Map(wings.map((w) => [w.id, w]));
  const out = new Map<string, Wing[]>();
  for (const link of links) {
    const wing = byId.get(link.wingId);
    if (!wing || !link.alsoListedIn) continue;
    out.set(link.alsoListedIn, [...(out.get(link.alsoListedIn) ?? []), { ...wing }]);
  }
  return out;
}

type P2 = [number, number];

function toFrame(region: WingRegion, x: number, z: number): P2 {
  const [ax, az] = region.axisU;
  return [x * ax + z * az, -x * az + z * ax];
}

/** ローカル座標の点 (x, z) が棟の塊の範囲に入るか（境目の上は両方に入る。範囲が無ければ建物の全体） */
export function wingRegionContains(region: WingRegion | undefined, x: number, z: number): boolean {
  if (!region) return true;
  const [u, v] = toFrame(region, x, z);
  if (region.uMin !== undefined && u < region.uMin) return false;
  if (region.uMax !== undefined && u > region.uMax) return false;
  if (region.vMin !== undefined && v < region.vMin) return false;
  if (region.vMax !== undefined && v > region.vMax) return false;
  return true;
}

/** 地図の当たり判定の予備: 建物の上の点 (x, z) がどの棟の範囲か（棟の無い建物や、どの棟にも入らない点は null） */
export function findWingAt(building: Pick<BuildingFeature, 'wings'>, x: number, z: number): BuildingWing | null {
  for (const wing of building.wings ?? []) {
    if (wingRegionContains(wing.region, x, z)) return wing;
  }
  return null;
}

export function findWing(
  building: Pick<BuildingFeature, 'wings'> | null | undefined,
  wingId: string | null | undefined,
): BuildingWing | null {
  if (!building || !wingId) return null;
  return building.wings?.find((w) => w.id === wingId) ?? null;
}

/** 号館と棟の名前（例: '3号館 C棟'） */
export function wingLabel(wing: Wing): string {
  return wing.hallName ? `${wing.hallName} ${wing.name}` : wing.name;
}

/** 見出しの名前（例: '第3学舎 3号館 C棟'） */
export function wingTitle(wing: Wing): string {
  return `${wing.school} ${wingLabel(wing)}`;
}

/** 階の数の表記（例: '地上 10 階'・'地下 1 階・地上 4 階'） */
export function wingFloorsText(wing: Wing): string {
  const above = `地上 ${wing.floorsAbove} 階`;
  return wing.floorsBelow > 0 ? `地下 ${wing.floorsBelow} 階・${above}` : above;
}

/** その棟にある階か（地下は負の数。0 階は無い） */
export function wingHasFloor(wing: Wing, floor: number): boolean {
  if (floor === 0) return false;
  return floor >= -wing.floorsBelow && floor <= wing.floorsAbove;
}

/**
 * 検索で棟に当てる名前。学舎・号館・棟の名前の組み合わせ（'C棟'・'第3学舎C棟'・'3号館'・'第3学舎3号館'・
 * '3号館C棟'・'第3学舎3号館C棟'・'C棟（3号館）'）と、棟の別名
 */
export function wingSearchAliases(wing: Wing): string[] {
  const out = new Set<string>();
  const add = (s: string): void => {
    if (s.trim()) out.add(s);
  };
  const parts = wing.hallName ? [wing.name, wing.hallName, `${wing.hallName}${wing.name}`] : [wing.name];
  for (const p of parts) {
    add(p);
    add(`${wing.school}${p}`);
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
  const region: WingRegion = wing.region ?? { axisU: [1, 0] };
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

/**
 * 地図では別の輪郭の棟（研究棟別館）を押したときの、その棟の部屋の図。部屋は、シートに棟を並べる建物（2号館）の図から
 * その棟の部屋と階だけを取る（入口・連絡は建物のものなので持たない）。対応する図が無ければ undefined
 */
export function sheetWingFloorPlan(
  building: Pick<BuildingFeature, 'id' | 'wings'>,
  allBuildings: readonly Pick<BuildingFeature, 'wings' | 'sheetWings' | 'id'>[],
  plans: Record<string, BuildingFloorPlan>,
): BuildingFloorPlan | undefined {
  const wing = building.wings?.length === 1 ? building.wings[0] : undefined;
  if (!wing) return undefined;
  const host = allBuildings.find((h) => h.sheetWings?.some((w) => w.id === wing.id));
  const plan = host ? plans[host.id] : undefined;
  if (!plan) return undefined;
  const rooms = plan.rooms.filter((r) => r.wingId === wing.id);
  if (rooms.length === 0) return undefined;
  return {
    ...plan,
    buildingId: building.id,
    floors: plan.floors.filter((f) => wingHasFloor(wing, f.floor)),
    rooms,
    entrances: [],
    connectors: [],
  };
}
