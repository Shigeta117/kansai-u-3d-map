import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findNearestWalkNode, findRoute } from './routing';
import type { BuildingFeature, WalkGraph } from './types';

describe('routing', () => {
  const syntheticGraph: WalkGraph = {
    nodes: {
      a: { id: 'a', x: 0, z: 0, y: 20 },
      b: { id: 'b', x: 50, z: 0, y: 35 }, // steep climb + steps
      c: { id: 'c', x: 0, z: 50, y: 22.5 },
      d: { id: 'd', x: 100, z: 50, y: 27.5 },
      goal: { id: 'goal', x: 100, z: 0, y: 30 },
    },
    adjacency: {
      a: [
        { to: 'b', dist: 50, deltaY: 15, slope: 0.3, isSteps: true },
        { to: 'c', dist: 50, deltaY: 2.5, slope: 0.05, isSteps: false },
      ],
      b: [
        { to: 'a', dist: 50, deltaY: -15, slope: -0.3, isSteps: true },
        { to: 'goal', dist: 50, deltaY: -5, slope: -0.1, isSteps: false },
      ],
      c: [
        { to: 'a', dist: 50, deltaY: -2.5, slope: -0.05, isSteps: false },
        { to: 'd', dist: 100, deltaY: 5, slope: 0.05, isSteps: false },
      ],
      d: [
        { to: 'c', dist: 100, deltaY: -5, slope: -0.05, isSteps: false },
        { to: 'goal', dist: 50, deltaY: 2.5, slope: 0.05, isSteps: false },
      ],
      goal: [
        { to: 'b', dist: 50, deltaY: 5, slope: 0.1, isSteps: false },
        { to: 'd', dist: 50, deltaY: -2.5, slope: -0.05, isSteps: false },
      ],
    },
  };

  it('picks shortest path in shortest mode and avoids stairs in gentle mode', () => {
    const shortest = findRoute(syntheticGraph, 'a', 'goal', 'shortest', 'a', 'goal');
    const gentle = findRoute(syntheticGraph, 'a', 'goal', 'gentle', 'a', 'goal');

    expect(shortest).not.toBeNull();
    expect(gentle).not.toBeNull();
    expect(shortest?.totalDistanceM).toBeCloseTo(100, 1);
    expect(shortest?.stepsCount).toBe(1);
    expect(gentle?.stepsCount).toBe(0);
    expect(gentle?.totalDistanceM).toBeGreaterThan(shortest?.totalDistanceM ?? 0);
  });

  it('returns null for unreachable destination', () => {
    const isolated: WalkGraph = {
      nodes: {
        ...syntheticGraph.nodes,
        island: { id: 'island', x: 500, z: 500, y: 20 },
      },
      adjacency: {
        ...syntheticGraph.adjacency,
        island: [],
      },
    };
    expect(findRoute(isolated, 'a', 'island', 'shortest', 'a', 'island')).toBeNull();
  });

  it('finds valid nearest walk node and routes from Kandai-mae Station to Area 1 on live dataset', () => {
    const dataDir = path.resolve(process.cwd(), 'public/data/senriyama');
    const buildings = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'buildings.json'), 'utf8'),
    ) as BuildingFeature[];
    const graph = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'walk-graph.json'), 'utf8'),
    ) as WalkGraph;

    const station = buildings.find((b) => b.id === 'kandaimae-station');
    const mainGate = buildings.find((b) => b.id === 'main-gate');
    const area1 = buildings.find((b) => b.id === 'area1-1');
    expect(station?.walkNodeId).toBeTruthy();
    expect(mainGate?.walkNodeId).toBeTruthy();
    expect(area1?.walkNodeId).toBeTruthy();

    if (!station?.walkNodeId || !mainGate?.walkNodeId || !area1?.walkNodeId) return;

    const nearest = findNearestWalkNode(graph, mainGate.centroid.x, mainGate.centroid.z);
    expect(nearest).toBe(mainGate.walkNodeId);

    const rShort = findRoute(
      graph,
      station.walkNodeId,
      area1.walkNodeId,
      'shortest',
      station.id,
      area1.id,
    );
    const rGentle = findRoute(
      graph,
      station.walkNodeId,
      area1.walkNodeId,
      'gentle',
      station.id,
      area1.id,
    );

    expect(rShort).not.toBeNull();
    expect(rGentle).not.toBeNull();
    expect(rShort?.totalDistanceM).toBeGreaterThan(500);
    expect(rShort?.elevationGainM).toBeGreaterThan(15);
    expect((rGentle?.stepsCount ?? 999) < (rShort?.stepsCount ?? 0)).toBe(true);
  });
});
