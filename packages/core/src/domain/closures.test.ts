import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyClosures,
  edgeDepthInside,
  edgeKey,
  pointInPolygon,
  stepFreeClosureMessage,
  type CampusClosure,
  type CampusClosuresData,
} from './closures';
import { findRoute } from './routing';
import type { BuildingFeature, RouteMode, RouteResult, WalkGraph } from './types';

function readData<T>(file: string): T {
  const url = new URL(`../../../../public/data/senriyama/${file}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

describe('closures の辺の外し方（合成の経路）', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  const node = (id: string, x: number, z: number) => ({ id, x, z, y: 0 });
  const edge = (to: string, dist: number) => ({ to, dist, deltaY: 0, slope: 0, isSteps: false, isBridge: false, isEscalator: false });
  const graph: WalkGraph = {
    nodes: {
      a: node('a', -5, 5),
      b: node('b', 15, 5),
      c: node('c', -5, 0.5),
      d: node('d', 15, 0.5),
      e: node('e', -5, 20),
      f: node('f', 15, 20),
    },
    adjacency: {
      a: [edge('b', 20), edge('e', 15)],
      b: [edge('a', 20), edge('f', 15)],
      c: [edge('d', 20)],
      d: [edge('c', 20)],
      e: [edge('a', 15), edge('f', 20)],
      f: [edge('b', 15), edge('e', 20)],
    },
  };
  const closure = (passages: CampusClosure['walk']['passages'] = []): CampusClosure => ({
    id: 't',
    name: 't',
    label: '工事中',
    asOf: '2026-11-24',
    asOfLabel: '2026 年 11 月時点',
    sources: [],
    area: square,
    fences: [],
    buildings: [],
    walk: { toleranceM: 1, passages, entrances: [] },
  });

  it('removes an edge that crosses the area and keeps one that only grazes its edge', () => {
    expect(edgeDepthInside(graph.nodes.a!, graph.nodes.b!, square)).toBeCloseTo(5, 1);
    expect(edgeDepthInside(graph.nodes.c!, graph.nodes.d!, square)).toBeCloseTo(0.5, 1);
    const { removedEdges, walkGraph } = applyClosures(graph, [], [closure()]);
    expect(removedEdges).toEqual([edgeKey('a', 'b')]);
    expect(walkGraph.adjacency.a?.map((e) => e.to)).toEqual(['e']);
    expect(walkGraph.adjacency.c?.map((e) => e.to)).toEqual(['d']);
  });

  it('lets passages override the area in both directions', () => {
    const { removedEdges } = applyClosures(graph, [], [
      closure([
        { id: 'p1', name: 'open', state: 'open', edges: [['b', 'a']] },
        { id: 'p2', name: 'closed', state: 'closed', edges: [['e', 'f']] },
      ]),
    ]);
    expect(removedEdges).toEqual([edgeKey('e', 'f')]);
  });
});

describe('誠之館の建て替えの範囲（closures.json を実データに当てる）', () => {
  const rawGraph = readData<WalkGraph>('walk-graph.json');
  const rawBuildings = readData<BuildingFeature[]>('buildings.json');
  const { closures } = readData<CampusClosuresData>('closures.json');
  const closure = closures.find((c) => c.id === 'seishikan-rebuild');
  if (!closure) throw new Error('seishikan-rebuild missing');
  const { walkGraph, buildings, removedEdges } = applyClosures(rawGraph, rawBuildings, closures);
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const passage = (id: string) => closure.walk.passages.find((p) => p.id === id)!;
  const hasEdge = (a: string, b: string) => Boolean(walkGraph.adjacency[a]?.some((e) => e.to === b));
  const routeEdges = (r: RouteResult): string[] => {
    const ids = r.points.map((p) => Object.values(walkGraph.nodes).find((n) => n.x === p.x && n.z === p.z && n.y === p.y)!.id);
    return ids.slice(1).map((id, i) => edgeKey(ids[i]!, id));
  };
  const route = (from: string, to: string, mode: RouteMode = 'shortest'): RouteResult | null => {
    const a = byId.get(from)!;
    const b = byId.get(to)!;
    const s = mode === 'step-free' ? a.accessibleWalkNodeId : a.walkNodeId;
    const t = mode === 'step-free' ? b.accessibleWalkNodeId : b.walkNodeId;
    if (!s || !t) return null;
    return findRoute(walkGraph, s, t, mode, from, to);
  };

  it('takes 15 edges out of the walk graph (both directions)', () => {
    expect(removedEdges).toHaveLength(15);
    for (const key of removedEdges) {
      const [a, b] = key.split('|') as [string, string];
      expect(hasEdge(a, b)).toBe(false);
      expect(hasEdge(b, a)).toBe(false);
    }
  });

  it('leaves no edge going into the area except the passages that stay open', () => {
    const open = new Set(
      closure.walk.passages.filter((p) => p.state === 'open').flatMap((p) => p.edges.map(([a, b]) => edgeKey(a, b))),
    );
    for (const [from, edges] of Object.entries(walkGraph.adjacency)) {
      for (const e of edges) {
        if (open.has(edgeKey(from, e.to))) continue;
        expect(edgeDepthInside(walkGraph.nodes[from]!, walkGraph.nodes[e.to]!, closure.area)).toBeLessThanOrEqual(
          closure.walk.toleranceM,
        );
      }
    }
  });

  it('keeps the open passages (尚文館の外周・千里庵→簡文館の階段・有鄰館→新館→シンフォニー) and closes the 簡文館→有鄰館 stairs', () => {
    for (const id of ['shobunkan-perimeter', 'senrian-kanbunkan-stairs', 'yurin-shinkan-symphony']) {
      const p = passage(id);
      expect(p.state).toBe('open');
      for (const [a, b] of p.edges) expect(hasEdge(a, b) && hasEdge(b, a)).toBe(true);
    }
    const stairs = passage('kanbunkan-yurinkan-stairs');
    expect(stairs.state).toBe('closed');
    for (const [a, b] of stairs.edges) expect(hasEdge(a, b) || hasEdge(b, a)).toBe(false);
  });

  it('routes 尚文館 → KUシンフォニーホール through the open passages only', () => {
    const r = route('shobunkan', 'seishikan-4');
    expect(r).not.toBeNull();
    for (const p of r!.points) {
      // 通れる通路の節点は囲いの線の際（縁から 1.5m 以内）にある
      if (pointInPolygon(p.x, p.z, closure.area)) {
        expect(edgeDepthInside(p, p, closure.area)).toBeLessThan(1.5);
      }
    }
  });

  it('routes 簡文館 → 有鄰館 around the closed stairs, into the 有鄰館 door on the passage', () => {
    const yurin = byId.get('way_624590000')!;
    expect(yurin.walkNodeId).toBe('n_4227729232');
    expect(yurin.accessibleWalkNodeId).toBe('n_4227729232');
    const r = route('kanbunkan', 'way_624590000');
    expect(r).not.toBeNull();
    const closedStairs = passage('kanbunkan-yurinkan-stairs').edges.map(([a, b]) => edgeKey(a, b));
    expect(routeEdges(r!).some((k) => closedStairs.includes(k))).toBe(false);
    expect(route('main-gate', 'way_624590000', 'step-free')).not.toBeNull();
  });

  it('does not route into the buildings inside the area, and says why', () => {
    for (const id of ['way_624589997', 'way_624589994', 'way_819790904']) {
      const b = byId.get(id)!;
      expect(b.walkNodeId).toBeNull();
      expect(b.accessibleWalkNodeId).toBeNull();
      expect(b.construction?.state).toBe('closed');
      expect(b.construction?.label).toBe('建て替え工事中');
      expect(b.construction?.asOfLabel).toBe('2026 年 11 月時点');
    }
    expect(byId.get('way_624589997')?.construction?.look).toBe('sheet');
  });

  it('says the closure is the reason when 新館 has no step-free route, and only for the listed buildings', () => {
    const listed = closure.walk.noStepFree!.map((n) => n.buildingId);
    expect(listed).toContain('way_423067245');
    // データの一覧は、実際に段差の無い入口が外れた建物と食い違わない
    for (const id of listed) expect(byId.get(id)!.accessibleWalkNodeId).toBeNull();
    expect(route('main-gate', 'way_423067245', 'step-free')).toBeNull();
    const msg = '工事のため、今は段差の無い経路がありません（2026 年 11 月時点）';
    expect(stepFreeClosureMessage(closures, ['main-gate', 'way_423067245'])).toBe(msg);
    expect(stepFreeClosureMessage(closures, ['way_423067245', 'main-gate'])).toBe(msg);
    // 一覧に無い建物（範囲の中で行き先でない建物を含む）では出さない
    expect(stepFreeClosureMessage(closures, ['main-gate', 'kanbunkan'])).toBeNull();
    expect(stepFreeClosureMessage(closures, ['way_624589997'])).toBeNull();
    expect(stepFreeClosureMessage([], ['way_423067245'])).toBeNull();
  });

  it('keeps 悠久の庭 open (two thirds outside the area) and reachable from the open side', () => {
    const garden = byId.get('yukyu-garden')!;
    expect(garden.construction?.state).toBe('partial');
    expect(garden.walkNodeId).toBe('n_1986152549');
    const n = walkGraph.nodes[garden.walkNodeId!]!;
    expect(pointInPolygon(n.x, n.z, closure.area)).toBe(false);
    expect(route('library', 'yukyu-garden')).not.toBeNull();
    expect(route('library', 'yukyu-garden', 'step-free')).not.toBeNull();
    // 庭の目印（八角形）の半分ほどが範囲の外
    const outside = garden.polygon.filter(([x, z]) => !pointInPolygon(x, z, closure.area)).length;
    expect(outside).toBeGreaterThanOrEqual(4);
  });

  it('marks the fence line drawn from the owner correction as low confidence', () => {
    const corrected = closure.fences.filter((f) => f.basis === 'corrected');
    expect(corrected.map((f) => f.id)).toEqual(['F-yukyu']);
    expect(corrected[0]?.confidence).toBe('low');
  });
});
