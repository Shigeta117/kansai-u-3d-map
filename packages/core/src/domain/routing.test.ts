import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findNearestWalkNode, findRoute } from './routing';
import type { BuildingFeature, WalkGraph } from './types';

describe('routing (3-mode + bridges + step-free)', () => {
  const syntheticGraph: WalkGraph = {
    nodes: {
      a: { id: 'a', x: 0, z: 0, y: 20 },
      b: { id: 'b', x: 50, z: 0, y: 35 }, // stairs
      esc: { id: 'esc', x: 50, z: 20, y: 35 }, // escalator
      c: { id: 'c', x: 0, z: 50, y: 22.5 },
      d: { id: 'd', x: 100, z: 50, y: 27.5 },
      goal: { id: 'goal', x: 100, z: 0, y: 30 },
    },
    adjacency: {
      a: [
        { to: 'b', dist: 50, deltaY: 15, slope: 0.3, isSteps: true, isBridge: false, isEscalator: false },
        { to: 'esc', dist: 54, deltaY: 15, slope: 0.27, isSteps: false, isBridge: false, isEscalator: true },
        { to: 'c', dist: 50, deltaY: 2.5, slope: 0.05, isSteps: false, isBridge: false, isEscalator: false },
      ],
      b: [
        { to: 'a', dist: 50, deltaY: -15, slope: -0.3, isSteps: true, isBridge: false, isEscalator: false },
        { to: 'goal', dist: 50, deltaY: -5, slope: -0.1, isSteps: false, isBridge: false, isEscalator: false },
      ],
      esc: [
        { to: 'a', dist: 54, deltaY: -15, slope: -0.27, isSteps: false, isBridge: false, isEscalator: true },
        { to: 'goal', dist: 54, deltaY: -5, slope: -0.09, isSteps: false, isBridge: false, isEscalator: false },
      ],
      c: [
        { to: 'a', dist: 50, deltaY: -2.5, slope: -0.05, isSteps: false, isBridge: false, isEscalator: false },
        { to: 'd', dist: 100, deltaY: 5, slope: 0.05, isSteps: false, isBridge: true, isEscalator: false },
      ],
      d: [
        { to: 'c', dist: 100, deltaY: -5, slope: -0.05, isSteps: false, isBridge: true, isEscalator: false },
        { to: 'goal', dist: 50, deltaY: 2.5, slope: 0.05, isSteps: false, isBridge: false, isEscalator: false },
      ],
      goal: [
        { to: 'b', dist: 50, deltaY: 5, slope: 0.1, isSteps: false, isBridge: false, isEscalator: false },
        { to: 'esc', dist: 54, deltaY: 5, slope: 0.09, isSteps: false, isBridge: false, isEscalator: false },
        { to: 'd', dist: 50, deltaY: -2.5, slope: -0.05, isSteps: false, isBridge: true, isEscalator: false },
      ],
    },
  };

  it('picks stairs in shortest, prefers escalator in gentle, and enforces zero steps/escalators in step-free', () => {
    const shortest = findRoute(syntheticGraph, 'a', 'goal', 'shortest', 'a', 'goal');
    const gentle = findRoute(syntheticGraph, 'a', 'goal', 'gentle', 'a', 'goal');
    const stepFree = findRoute(syntheticGraph, 'a', 'goal', 'step-free', 'a', 'goal');

    expect(shortest?.stepsCount).toBe(1);
    expect(gentle?.usesEscalator).toBe(true);
    expect(gentle?.stepsCount).toBe(0);
    expect(stepFree?.isStepFree).toBe(true);
    expect(stepFree?.stepsCount).toBe(0);
    expect(stepFree?.usesEscalator).toBe(false);
    expect(stepFree?.usesBridge).toBe(true);
  });

  it('returns null when step-free path is blocked by stairs/escalators', () => {
    const stairOnly: WalkGraph = {
      nodes: {
        x: { id: 'x', x: 0, z: 0, y: 10 },
        y: { id: 'y', x: 20, z: 0, y: 14 },
      },
      adjacency: {
        x: [{ to: 'y', dist: 20, deltaY: 4, slope: 0.2, isSteps: true, isBridge: false, isEscalator: false }],
        y: [{ to: 'x', dist: 20, deltaY: -4, slope: -0.2, isSteps: true, isBridge: false, isEscalator: false }],
      },
    };
    expect(findRoute(stairOnly, 'x', 'y', 'shortest', 'x', 'y')).not.toBeNull();
    expect(findRoute(stairOnly, 'x', 'y', 'step-free', 'x', 'y')).toBeNull();
  });

  it('routes across Shurei Bridge and supports 3 modes on live Senriyama dataset', () => {
    const dataDir = path.resolve(process.cwd(), 'public/data/senriyama');
    const buildings = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'buildings.json'), 'utf8'),
    ) as BuildingFeature[];
    const graph = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'walk-graph.json'), 'utf8'),
    ) as WalkGraph;

    const station = buildings.find((b) => b.id === 'kandaimae-station');
    const mainGate = buildings.find((b) => b.id === 'main-gate');
    const area3 = buildings.find((b) => b.id === 'area3');
    const area1 = buildings.find((b) => b.id === 'area1-1');
    expect(station?.accessibleWalkNodeId).toBeTruthy();
    expect(mainGate?.walkNodeId).toBeTruthy();
    expect(area3?.walkNodeId).toBeTruthy();
    expect(area1?.accessibleWalkNodeId).toBeTruthy();

    if (!station || !mainGate || !area3 || !area1) return;

    expect(findNearestWalkNode(graph, mainGate.centroid.x, mainGate.centroid.z)).toBe(
      mainGate.walkNodeId,
    );

    const a3ToA1 = findRoute(
      graph,
      area3.accessibleWalkNodeId!,
      area1.accessibleWalkNodeId!,
      'step-free',
      area3.id,
      area1.id,
    );
    expect(a3ToA1?.usesBridge).toBe(true);
    expect(a3ToA1?.isStepFree).toBe(true);
    expect(a3ToA1?.stepsCount).toBe(0);

    const stToA3Short = findRoute(
      graph,
      station.walkNodeId!,
      area3.walkNodeId!,
      'shortest',
      station.id,
      area3.id,
    );
    const stToA3Gentle = findRoute(
      graph,
      station.walkNodeId!,
      area3.walkNodeId!,
      'gentle',
      station.id,
      area3.id,
    );
    const stToA3StepFree = findRoute(
      graph,
      station.accessibleWalkNodeId!,
      area3.accessibleWalkNodeId!,
      'step-free',
      station.id,
      area3.id,
    );

    expect(stToA3Gentle?.usesEscalator).toBe(true);
    expect(stToA3StepFree?.isStepFree).toBe(true);
    expect(stToA3StepFree?.stepsCount).toBe(0);
    expect(stToA3StepFree?.usesEscalator).toBe(false);
    expect((stToA3StepFree?.totalDistanceM ?? 0) > (stToA3Short?.totalDistanceM ?? 0)).toBe(true);
  });
});

