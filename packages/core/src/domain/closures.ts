import type { BuildingFeature, WalkEdge, WalkGraph } from './types';

/**
 * 工事などで一時的に入れない範囲（public/data/<キャンパス>/closures.json）。
 *
 * - 範囲（area）の多角形・囲いの線（fences）・範囲の中の建物の扱い・通路の扱いを 1 か所に持つ。工事は動くので、
 *   範囲が変わったらこのファイルだけを直す。経路（walk-graph.json）は作り直さず、読み込み時に applyClosures で辺を外す
 * - 辺を外す決まり: 辺の上の点が範囲の中に、範囲の縁から toleranceM より深く入れば外す（縁ぎりぎりを通る辺は残す。
 *   手描きから起こした範囲は 1m 前後ずれるため）。passages の state で、範囲から決めずに通れる・通れないを上書きする
 */
export interface ClosureFence {
  id: string;
  /** drawn＝現地確認の手描きから起こした線、corrected＝言葉での訂正から引き直した線 */
  basis: 'drawn' | 'corrected';
  confidence?: 'low';
  points: [number, number][];
  note?: string;
}

export interface ClosureBuilding {
  id: string;
  /** closed＝建物ごと範囲の中で入れない、partial＝一部が範囲の中（行き先としては開いている） */
  state: 'closed' | 'partial';
  /** sheet＝灰色のシートで足場ごと覆われた姿で描く */
  look?: 'sheet';
  note?: string;
}

export interface ClosurePassage {
  id: string;
  name: string;
  /** open＝範囲にかかっていても通れる、closed＝範囲の外にはみ出していても通れない */
  state: 'open' | 'closed';
  /** 経路の辺（両端の節点の id） */
  edges: [string, string][];
  note?: string;
}

export interface ClosureEntrance {
  buildingId: string;
  walkNodeId: string | null;
  accessibleWalkNodeId: string | null;
  note?: string;
}

/** 封鎖のため、段差の無い経路が無くなった建物（画面に理由の一言を出す） */
export interface ClosureNoStepFree {
  buildingId: string;
  note?: string;
}

export interface CampusClosure {
  id: string;
  name: string;
  /** 建物シートに出す一言（例: 建て替え工事中） */
  label: string;
  /** 確認した日（YYYY-MM-DD） */
  asOf: string;
  /** 画面に出す時点（例: 2026 年 11 月時点） */
  asOfLabel: string;
  sources: string[];
  note?: string;
  /** 範囲（ローカル座標 x, z。閉じない） */
  area: [number, number][];
  fences: ClosureFence[];
  buildings: ClosureBuilding[];
  walk: {
    toleranceM: number;
    passages: ClosurePassage[];
    /** 封鎖で段差の無い経路が無くなった建物（行き先にすると段差フリーの理由に封鎖を出す） */
    noStepFree?: ClosureNoStepFree[];
    /** 範囲の中に入った入口の付け替え先 */
    entrances: ClosureEntrance[];
  };
}

export interface CampusClosuresData {
  closures: CampusClosure[];
}

/** 建物が工事の範囲にかかっていること（読み込み時に closures.json から付ける） */
export interface BuildingConstruction {
  closureId: string;
  state: ClosureBuilding['state'];
  label: string;
  asOfLabel: string;
  look?: ClosureBuilding['look'];
}

/** 段差フリーで経路が引けない理由が封鎖のとき、画面に出す一言。当てはまらなければ null */
export function stepFreeClosureMessage(
  closures: readonly CampusClosure[],
  buildingIds: readonly string[],
): string | null {
  for (const c of closures) {
    if (c.walk.noStepFree?.some((n) => buildingIds.includes(n.buildingId))) {
      return `工事のため、今は段差の無い経路がありません（${c.asOfLabel}）`;
    }
  }
  return null;
}

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function pointInPolygon(x: number, z: number, poly: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(x: number, z: number, a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2)) : 0;
  return Math.hypot(a[0] + t * dx - x, a[1] + t * dz - z);
}

export function distanceToPolygonEdge(x: number, z: number, poly: readonly [number, number][]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, distToSegment(x, z, poly[j]!, poly[i]!));
  }
  return best;
}

/** 辺（a→b）が範囲の中へ、縁から何 m まで入るか（入らなければ 0） */
export function edgeDepthInside(
  a: { x: number; z: number },
  b: { x: number; z: number },
  poly: readonly [number, number][],
  stepM = 0.25,
): number {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(2, Math.ceil(len / stepM) + 1);
  let depth = 0;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (pointInPolygon(x, z, poly)) depth = Math.max(depth, distanceToPolygonEdge(x, z, poly));
  }
  return depth;
}

function bboxOf(poly: readonly [number, number][]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** 範囲で外す辺の鍵（edgeKey）。passages の上書きを含む */
export function closedEdgeKeys(graph: WalkGraph, closure: CampusClosure): Set<string> {
  const forcedOpen = new Set<string>();
  const forcedClosed = new Set<string>();
  for (const p of closure.walk.passages) {
    for (const [a, b] of p.edges) (p.state === 'open' ? forcedOpen : forcedClosed).add(edgeKey(a, b));
  }
  const box = bboxOf(closure.area);
  const out = new Set<string>(forcedClosed);
  for (const [from, edges] of Object.entries(graph.adjacency)) {
    const a = graph.nodes[from];
    if (!a) continue;
    for (const e of edges) {
      const key = edgeKey(from, e.to);
      if (out.has(key) || forcedOpen.has(key) || from > e.to) continue;
      const b = graph.nodes[e.to];
      if (!b) continue;
      if (Math.max(a.x, b.x) < box.minX || Math.min(a.x, b.x) > box.maxX) continue;
      if (Math.max(a.z, b.z) < box.minZ || Math.min(a.z, b.z) > box.maxZ) continue;
      if (edgeDepthInside(a, b, closure.area) > closure.walk.toleranceM) out.add(key);
    }
  }
  return out;
}

/** 辺のつながりの最も大きい成分（stepFree のときは階段・エスカレーターを通らない） */
export function mainComponent(graph: WalkGraph, stepFree: boolean): Set<string> {
  const seen = new Set<string>();
  let best = new Set<string>();
  for (const start of Object.keys(graph.nodes)) {
    if (seen.has(start)) continue;
    const comp = new Set<string>([start]);
    seen.add(start);
    const stack = [start];
    while (stack.length > 0) {
      const u = stack.pop()!;
      for (const e of graph.adjacency[u] ?? []) {
        if (stepFree && (e.isSteps || e.isEscalator)) continue;
        if (!seen.has(e.to)) {
          seen.add(e.to);
          comp.add(e.to);
          stack.push(e.to);
        }
      }
    }
    if (comp.size > best.size) best = comp;
  }
  return best;
}

export interface AppliedClosures {
  walkGraph: WalkGraph;
  buildings: BuildingFeature[];
  /** 外した辺の鍵（edgeKey） */
  removedEdges: string[];
}

/**
 * 範囲を経路と建物に当てる。
 * - 範囲で決まる辺と passages の closed の辺を外す（両向き）
 * - 範囲の中の建物（state closed）は経路の行き先にしない（walkNodeId・accessibleWalkNodeId を null）。construction を付ける
 * - entrances の建物は入口を付け替える
 * - それ以外で、辺を外したために主な成分から切り離された入口は null にする（経路が引けないことをそのまま見せる）
 */
export function applyClosures(
  walkGraph: WalkGraph,
  buildings: BuildingFeature[],
  closures: readonly CampusClosure[],
): AppliedClosures {
  if (closures.length === 0) return { walkGraph, buildings, removedEdges: [] };
  const removed = new Set<string>();
  for (const c of closures) for (const k of closedEdgeKeys(walkGraph, c)) removed.add(k);

  const adjacency: Record<string, WalkEdge[]> = {};
  for (const [from, edges] of Object.entries(walkGraph.adjacency)) {
    adjacency[from] = edges.filter((e) => !removed.has(edgeKey(from, e.to)));
  }
  const nextGraph: WalkGraph = { nodes: walkGraph.nodes, adjacency };

  const mainBefore = mainComponent(walkGraph, false);
  const stepFreeBefore = mainComponent(walkGraph, true);
  const mainAfter = mainComponent(nextGraph, false);
  const stepFreeAfter = mainComponent(nextGraph, true);

  const construction = new Map<string, BuildingConstruction>();
  const entrances = new Map<string, ClosureEntrance>();
  for (const c of closures) {
    for (const b of c.buildings) {
      construction.set(b.id, {
        closureId: c.id,
        state: b.state,
        label: c.label,
        asOfLabel: c.asOfLabel,
        ...(b.look ? { look: b.look } : {}),
      });
    }
    for (const e of c.walk.entrances) entrances.set(e.buildingId, e);
  }

  const nextBuildings = buildings.map((b) => {
    const info = construction.get(b.id);
    const entrance = entrances.get(b.id);
    if (info?.state === 'closed') {
      return { ...b, construction: info, walkNodeId: null, accessibleWalkNodeId: null };
    }
    let walkNodeId = entrance ? entrance.walkNodeId : b.walkNodeId;
    let accessibleWalkNodeId = entrance ? entrance.accessibleWalkNodeId : b.accessibleWalkNodeId;
    if (!entrance) {
      if (walkNodeId && mainBefore.has(walkNodeId) && !mainAfter.has(walkNodeId)) walkNodeId = null;
      if (accessibleWalkNodeId && stepFreeBefore.has(accessibleWalkNodeId) && !stepFreeAfter.has(accessibleWalkNodeId)) {
        accessibleWalkNodeId = null;
      }
    }
    if (!info && walkNodeId === b.walkNodeId && accessibleWalkNodeId === b.accessibleWalkNodeId) return b;
    return { ...b, ...(info ? { construction: info } : {}), walkNodeId, accessibleWalkNodeId };
  });

  return { walkGraph: nextGraph, buildings: nextBuildings, removedEdges: [...removed].sort() };
}
