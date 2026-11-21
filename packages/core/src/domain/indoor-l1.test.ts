import { describe, expect, it } from 'vitest';
import {
  alignL1Tiers,
  buildL1Graph,
  connectorMouthId,
  connectorStepFree,
  entranceStepFree,
  floorLabel,
  tierOf,
  wingOrdinals,
  type BarrierFreeBuilding,
  type IndoorConnector,
  type IndoorSource,
} from './indoor-l1';
import type { Wing } from './wings';

const SOURCE: IndoorSource = {
  id: 'test-source',
  name: 'テストの資料',
  url: 'https://example.invalid/',
  edition: '2025年12月現在',
  checkedAt: '2026-11-20',
  kind: 'university-public',
};
const verified = { sourceId: SOURCE.id, checkedAt: SOURCE.checkedAt };

function wing(id: string, floorsAbove: number, floorsBelow = 0): Wing {
  return { id, school: 'テスト学舎', name: id, floorsAbove, floorsBelow, entrances: [] };
}

function connector(id: string, a: [string, number], b: [string, number], extra: Partial<IndoorConnector> = {}): IndoorConnector {
  return {
    id,
    from: { buildingId: `b-${a[0]}`, wingId: a[0], floor: a[1], door: 'swing' },
    to: { buildingId: `b-${b[0]}`, wingId: b[0], floor: b[1], door: 'swing' },
    exists: 'yes',
    verified,
    ...extra,
  };
}

describe('段差なしの判定（docs/indoor-plan.md 7 節）', () => {
  it('reads the legend: auto door = yes, swing door = unknown, steps or any obstacle = no', () => {
    expect(entranceStepFree({ door: 'auto' })).toBe('yes');
    expect(entranceStepFree({ door: 'swing' })).toBe('unknown');
    expect(entranceStepFree({ door: 'steps' })).toBe('no');
    expect(entranceStepFree({ door: 'swing', obstacle: 'stairs-outside' })).toBe('no');
    expect(entranceStepFree({ door: 'auto', sourceConflict: true })).toBe('unknown');
  });

  it('never says yes for a connector (the corridor between the doors is not described)', () => {
    const base = connector('c', ['a', 1], ['b', 1]);
    expect(connectorStepFree(base)).toBe('unknown');
    expect(connectorStepFree({ ...base, from: { ...base.from, door: 'auto' }, to: { ...base.to, door: 'auto' } })).toBe('unknown');
    expect(connectorStepFree({ ...base, to: { ...base.to, door: 'steps' } })).toBe('no');
    expect(connectorStepFree({ ...base, obstacle: 'stairs-midway' })).toBe('no');
  });
});

describe('L1 のグラフ', () => {
  const wings = [wing('w-a', 3), wing('w-b', 2, 1), wing('w-c', 2)];
  const facts: BarrierFreeBuilding[] = [
    {
      buildingId: 'b-a',
      listed: true,
      elevator: { exists: 'yes', groups: [{ kind: 'elevator', wingIds: ['w-a'] }] },
      entrances: [
        { id: 'e1', wingId: 'w-a', floors: [1], door: 'auto' },
        { id: 'e2', wingId: 'w-a', floors: [2, 3], door: 'steps', obstacle: 'stairs-outside' },
        { id: 'e-other', wingId: 'w-z', floors: [1], door: 'auto' },
        { id: 'e-nowing', floors: [1], door: 'auto' },
      ],
      restrooms: [],
    },
    {
      buildingId: 'b-b',
      listed: true,
      elevator: { exists: 'yes', groups: [{ kind: 'elevator', wingIds: ['w-b', 'w-c'], wingUncertain: true }] },
      entrances: [],
      restrooms: [],
    },
  ];
  const connectors = [
    connector('ab', ['w-a', 2], ['w-b', 1]),
    connector('ab-low', ['w-a', 1], ['w-b', -1], { obstacle: 'stairs-midway', from: { buildingId: 'b-a', wingId: 'w-a', floor: 1 }, to: { buildingId: 'b-b', wingId: 'w-b', floor: -1 } }),
    connector('outside', ['w-a', 1], ['w-z', 1]),
    { ...connector('unknown-wing', ['w-a', 1], ['w-b', 1]), to: { buildingId: 'b-b', wingId: null, floor: 1 } },
  ];
  const graph = buildL1Graph({
    wings,
    facts,
    connectors,
    source: SOURCE,
    points: { e1: { x: 1, z: 2 }, [connectorMouthId('ab', 'w-a')]: { x: 3, z: 4 } },
  });

  it('makes one node per entrance and floor, and two mouths per connector, only inside the given wings', () => {
    expect(graph.nodes.map((n) => n.id)).toEqual(['e1', 'e2@2', 'e2@3', 'ab@w-a', 'ab@w-b', 'ab-low@w-a', 'ab-low@w-b']);
    expect(graph.edges.map((e) => e.id)).toEqual(['ab', 'ab-low']);
    const e1 = graph.nodes.find((n) => n.id === 'e1');
    expect(e1).toMatchObject({ kind: 'entrance', wingId: 'w-a', floor: 1, zone: null, point: { x: 1, z: 2 }, exists: 'yes', stepFree: 'yes' });
    expect(graph.nodes.find((n) => n.id === 'e2@3')).toMatchObject({ stepFree: 'no', point: null, obstacle: 'stairs-outside' });
    expect(graph.nodes.find((n) => n.id === 'ab@w-a')).toMatchObject({ kind: 'connector-mouth', connectorId: 'ab', point: { x: 3, z: 4 } });
    // 扉の印の無い通路（途中に階段）の口は、通路の手がかりで決める
    expect(graph.nodes.find((n) => n.id === 'ab-low@w-b')?.stepFree).toBe('no');
    expect(graph.edges.find((e) => e.id === 'ab-low')).toMatchObject({ stepFree: 'no', obstacle: 'stairs-midway' });
  });

  it('keeps elevator stops unknown and does not assign an uncertain group to a wing', () => {
    expect(graph.elevators).toEqual([
      { id: 'b-a-ev1', kind: 'elevator', wingIds: ['w-a'], wingUncertain: false, stops: null, verified },
      { id: 'b-b-ev1', kind: 'elevator', wingIds: ['w-b', 'w-c'], wingUncertain: true, stops: null, verified },
    ]);
    expect(graph.wings.map((w) => [w.wingId, w.elevator])).toEqual([
      ['w-a', 'yes'],
      ['w-b', 'unknown'],
      ['w-c', 'unknown'],
    ]);
    expect(graph.wings[1]?.floors.map((f) => f.label)).toEqual(['B1', '1', '2']);
  });

  it('aligns floors by level connectors and slants the one with stairs on the way (11 節)', () => {
    const layout = alignL1Tiers(['w-a', 'w-b', 'w-c'], graph.edges, graph.nodes);
    // w-a の 2 階 = w-b の 1 階 → w-b は段が 1 つ上にずれる
    expect(layout.offsets.get('w-a')).toBe(0);
    expect(layout.offsets.get('w-b')).toBe(1);
    expect(tierOf(layout, 'w-b', 1)).toBe(2);
    expect(tierOf(layout, 'w-b', -1)).toBe(1);
    expect(layout.components).toEqual([['w-a', 'w-b'], ['w-c']]);
    expect(layout.conflicts).toEqual([]);
    // 途中に階段のある連絡路は a 1 階（段 1）と b 地下 1 階（段 1）で、たまたま同じ段なので斜めにならない
    expect(layout.slanted).toEqual([]);
  });

  it('reports a loop of level connectors that does not close as a conflict', () => {
    const loop = buildL1Graph({
      wings,
      facts: [],
      source: SOURCE,
      connectors: [connector('ab', ['w-a', 1], ['w-b', 1]), connector('bc', ['w-b', 1], ['w-c', 1]), connector('ca', ['w-c', 1], ['w-a', 2])],
    });
    const layout = alignL1Tiers(['w-a', 'w-b', 'w-c'], loop.edges, loop.nodes);
    // どの 1 本を食い違いとするかはたどる順で決まる（ここでは a から先にたどった ab・ca が段を決め、bc が食い違う）
    expect(layout.conflicts).toHaveLength(1);
    expect(['ab', 'bc', 'ca']).toContain(layout.conflicts[0]);
    expect(layout.slanted).toEqual(layout.conflicts);
  });

  it('labels floors without heights', () => {
    expect(wingOrdinals({ floorsAbove: 2, floorsBelow: 2 })).toEqual([-2, -1, 1, 2]);
    expect([floorLabel(-1), floorLabel(1), floorLabel(10)]).toEqual(['B1', '1', '10']);
  });
});
