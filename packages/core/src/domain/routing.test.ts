import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STEEP_SLOPE_RATIO,
  escalatorDirection,
  findNearestWalkNode,
  findRoute,
  usesRushHourDownEscalator,
} from './routing';
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

    expect(shortest).not.toBeNull();
    expect(gentle).not.toBeNull();
    expect(stepFree).not.toBeNull();
    if (!shortest || !gentle || !stepFree) {
      throw new Error('Expected synthetic routes to exist for all modes');
    }

    expect(shortest.stepsCount).toBe(1);
    expect(gentle.usesEscalator).toBe(true);
    expect(gentle.stepsCount).toBe(0);
    expect(stepFree.isStepFree).toBe(true);
    expect(stepFree.stepsCount).toBe(0);
    expect(stepFree.usesEscalator).toBe(false);
    expect(stepFree.usesBridge).toBe(true);
    expect(stepFree.usesShureiBridge).toBe(false);
    expect(stepFree.steepSegmentsM).toBe(0);
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

  it('heavily penalizes slopes over 1/12 in step-free without disconnecting, and sums steepSegmentsM', () => {
    const detourGraph: WalkGraph = {
      nodes: {
        start: { id: 'start', x: 0, z: 0, y: 10 },
        mid: { id: 'mid', x: 40, z: 69, y: 13 },
        goal: { id: 'goal', x: 40, z: 0, y: 16 },
      },
      adjacency: {
        start: [
          { to: 'goal', dist: 40, deltaY: 6, slope: 0.15, isSteps: false, isBridge: false, isEscalator: false },
          { to: 'mid', dist: 80, deltaY: 3, slope: 0.0375, isSteps: false, isBridge: false, isEscalator: false },
        ],
        mid: [
          { to: 'start', dist: 80, deltaY: -3, slope: -0.0375, isSteps: false, isBridge: false, isEscalator: false },
          { to: 'goal', dist: 80, deltaY: 3, slope: 0.0375, isSteps: false, isBridge: false, isEscalator: false },
        ],
        goal: [
          { to: 'start', dist: 40, deltaY: -6, slope: -0.15, isSteps: false, isBridge: false, isEscalator: false },
          { to: 'mid', dist: 80, deltaY: -3, slope: -0.0375, isSteps: false, isBridge: false, isEscalator: false },
        ],
      },
    };

    const shortRoute = findRoute(detourGraph, 'start', 'goal', 'shortest', 'start', 'goal');
    const stepFreeRoute = findRoute(detourGraph, 'start', 'goal', 'step-free', 'start', 'goal');
    expect(shortRoute).not.toBeNull();
    expect(stepFreeRoute).not.toBeNull();
    if (!shortRoute || !stepFreeRoute) {
      throw new Error('Expected detourGraph routes to exist');
    }

    expect(shortRoute.totalDistanceM).toBe(40);
    expect(shortRoute.steepSegmentsM).toBe(40);
    expect(stepFreeRoute.totalDistanceM).toBe(160);
    expect(stepFreeRoute.steepSegmentsM).toBe(0);
    expect(stepFreeRoute.maxSlopeRatio).toBeLessThanOrEqual(STEEP_SLOPE_RATIO);

    const steepOnlyGraph: WalkGraph = {
      nodes: {
        p1: { id: 'p1', x: 0, z: 0, y: 10 },
        p2: { id: 'p2', x: 30, z: 0, y: 14.5 },
        p3: { id: 'p3', x: 50, z: 0, y: 12.1 },
      },
      adjacency: {
        p1: [
          { to: 'p2', dist: 30, deltaY: 4.5, slope: 0.15, isSteps: false, isBridge: false, isEscalator: false },
        ],
        p2: [
          { to: 'p1', dist: 30, deltaY: -4.5, slope: -0.15, isSteps: false, isBridge: false, isEscalator: false },
          { to: 'p3', dist: 20, deltaY: -2.4, slope: -0.12, isSteps: false, isBridge: false, isEscalator: false },
        ],
        p3: [
          { to: 'p2', dist: 20, deltaY: 2.4, slope: 0.12, isSteps: false, isBridge: false, isEscalator: false },
        ],
      },
    };

    const steepOnly = findRoute(steepOnlyGraph, 'p1', 'p3', 'step-free', 'p1', 'p3');
    expect(steepOnly).not.toBeNull();
    if (!steepOnly) {
      throw new Error('Expected steep-only step-free route to remain connected');
    }
    expect(steepOnly.isStepFree).toBe(true);
    expect(steepOnly.steepSegmentsM).toBe(50);
    expect(steepOnly.maxSlopeRatio).toBe(0.15);
  });

  it('tracks usesShureiBridge separately from other bridges and handles same-node routes', () => {
    const bridgeGraph: WalkGraph = {
      nodes: {
        s: { id: 's', x: 0, z: 0, y: 42 },
        m: { id: 'm', x: 40, z: 0, y: 42.5 },
        e: { id: 'e', x: 80, z: 0, y: 43 },
      },
      adjacency: {
        s: [
          {
            to: 'm',
            dist: 40,
            deltaY: 0.5,
            slope: 0.0125,
            isSteps: false,
            isBridge: true,
            isShureiBridge: true,
            isEscalator: false,
          },
        ],
        m: [
          {
            to: 's',
            dist: 40,
            deltaY: -0.5,
            slope: -0.0125,
            isSteps: false,
            isBridge: true,
            isShureiBridge: true,
            isEscalator: false,
          },
          {
            to: 'e',
            dist: 40,
            deltaY: 0.5,
            slope: 0.0125,
            isSteps: false,
            isBridge: true,
            isEscalator: false,
          },
        ],
        e: [
          {
            to: 'm',
            dist: 40,
            deltaY: -0.5,
            slope: -0.0125,
            isSteps: false,
            isBridge: true,
            isEscalator: false,
          },
        ],
      },
    };

    const viaShurei = findRoute(bridgeGraph, 's', 'm', 'step-free', 's', 'm');
    const viaOther = findRoute(bridgeGraph, 'm', 'e', 'step-free', 'm', 'e');
    const sameNode = findRoute(bridgeGraph, 's', 's', 'step-free', 'station', 'west-gate');

    expect(viaShurei).not.toBeNull();
    expect(viaOther).not.toBeNull();
    expect(sameNode).not.toBeNull();
    if (!viaShurei || !viaOther || !sameNode) {
      throw new Error('Expected bridgeGraph routes to exist');
    }

    expect(viaShurei.usesBridge).toBe(true);
    expect(viaShurei.usesShureiBridge).toBe(true);
    expect(viaOther.usesBridge).toBe(true);
    expect(viaOther.usesShureiBridge).toBe(false);
    expect(sameNode.totalDistanceM).toBe(0);
    expect(sameNode.estimatedMinutes).toBe(0);
    expect(sameNode.steepSegmentsM).toBe(0);
    expect(sameNode.usesBridge).toBe(false);
    expect(sameNode.usesShureiBridge).toBe(false);
    expect(sameNode.isStepFree).toBe(true);
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
    expect(station?.walkNodeId).toBeTruthy();
    expect(station?.accessibleWalkNodeId).toBeTruthy();
    expect(mainGate?.walkNodeId).toBeTruthy();
    expect(area3?.walkNodeId).toBeTruthy();
    expect(area3?.accessibleWalkNodeId).toBeTruthy();
    expect(area1?.accessibleWalkNodeId).toBeTruthy();

    if (
      !station?.walkNodeId ||
      !station.accessibleWalkNodeId ||
      !mainGate?.walkNodeId ||
      !area3?.walkNodeId ||
      !area3.accessibleWalkNodeId ||
      !area1?.accessibleWalkNodeId
    ) {
      throw new Error('Required Senriyama landmarks or walk nodes are missing');
    }

    expect(findNearestWalkNode(graph, mainGate.centroid.x, mainGate.centroid.z)).toBe(
      mainGate.walkNodeId,
    );

    const a3ToA1 = findRoute(
      graph,
      area3.accessibleWalkNodeId,
      area1.accessibleWalkNodeId,
      'step-free',
      area3.id,
      area1.id,
    );
    expect(a3ToA1).not.toBeNull();
    if (!a3ToA1) {
      throw new Error('Expected step-free route from area3 to area1-1');
    }
    expect(a3ToA1.usesBridge).toBe(true);
    expect(a3ToA1.usesShureiBridge).toBe(true);
    expect(a3ToA1.isStepFree).toBe(true);
    expect(a3ToA1.stepsCount).toBe(0);
    expect(a3ToA1.usesEscalator).toBe(false);
    expect(a3ToA1.maxSlopeRatio).toBeLessThanOrEqual(1.0);

    const stToA3Short = findRoute(
      graph,
      station.walkNodeId,
      area3.walkNodeId,
      'shortest',
      station.id,
      area3.id,
    );
    const stToA3Gentle = findRoute(
      graph,
      station.walkNodeId,
      area3.walkNodeId,
      'gentle',
      station.id,
      area3.id,
    );
    const stToA3StepFree = findRoute(
      graph,
      station.accessibleWalkNodeId,
      area3.accessibleWalkNodeId,
      'step-free',
      station.id,
      area3.id,
    );

    expect(stToA3Short).not.toBeNull();
    expect(stToA3Gentle).not.toBeNull();
    expect(stToA3StepFree).not.toBeNull();
    if (!stToA3Short || !stToA3Gentle || !stToA3StepFree) {
      throw new Error('Expected station -> area3 routes for all 3 modes');
    }

    expect(stToA3Gentle.usesEscalator).toBe(true);
    expect(stToA3StepFree.isStepFree).toBe(true);
    expect(stToA3StepFree.stepsCount).toBe(0);
    expect(stToA3StepFree.usesEscalator).toBe(false);
    expect(stToA3StepFree.totalDistanceM).toBeGreaterThan(stToA3Short.totalDistanceM);
  });

  it('ensures all landmark step-free routes contain no steps or escalator edges on live Senriyama dataset', () => {
    const dataDir = path.resolve(process.cwd(), 'public/data/senriyama');
    const buildings = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'buildings.json'), 'utf8'),
    ) as BuildingFeature[];
    const graph = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'walk-graph.json'), 'utf8'),
    ) as WalkGraph;

    const landmarks = buildings.filter(
      (b) => Boolean(b.landmarkId) && Boolean(b.accessibleWalkNodeId),
    );
    expect(landmarks.length).toBeGreaterThan(0);

    let checkedPairs = 0;
    for (const from of landmarks) {
      if (!from.accessibleWalkNodeId) continue;
      for (const to of landmarks) {
        if (!to.accessibleWalkNodeId || from.id === to.id) continue;
        const route = findRoute(
          graph,
          from.accessibleWalkNodeId,
          to.accessibleWalkNodeId,
          'step-free',
          from.id,
          to.id,
        );
        expect(route).not.toBeNull();
        if (!route) continue;
        expect(route.isStepFree).toBe(true);
        expect(route.stepsCount).toBe(0);
        expect(route.usesEscalator).toBe(false);
        expect(route.profile.every((s) => !s.isSteps && !s.isEscalator)).toBe(true);
        checkedPairs += 1;
      }
    }
    expect(checkedPairs).toBeGreaterThan(0);
  });
  describe('エスカレーターの向き（朝のラッシュ時の注意 #31）', () => {
    const live = () => {
      const dataDir = path.resolve(process.cwd(), 'public/data/senriyama');
      const buildings = JSON.parse(
        fs.readFileSync(path.join(dataDir, 'buildings.json'), 'utf8'),
      ) as BuildingFeature[];
      const graph = JSON.parse(
        fs.readFileSync(path.join(dataDir, 'walk-graph.json'), 'utf8'),
      ) as WalkGraph;
      const node = (id: string) => {
        const b = buildings.find((x) => x.id === id);
        if (!b?.walkNodeId) throw new Error(`no walk node: ${id}`);
        return b.walkNodeId;
      };
      return { graph, node };
    };

    it('向きは辺の両端の高さの差で決まる（0.05m 未満は向きを言えない）', () => {
      expect(escalatorDirection(8.58)).toBe('up');
      expect(escalatorDirection(-8.58)).toBe('down');
      expect(escalatorDirection(0.02)).toBe('flat');
      expect(escalatorDirection(-0.04)).toBe('flat');
    });

    it('合成グラフ: 下りの向きと、ラッシュ時に上りだけになる印を結果に出す', () => {
      const edge = (to: string, deltaY: number, rush: boolean) => ({
        to,
        dist: 30,
        deltaY,
        slope: deltaY / 30,
        isSteps: false,
        isBridge: false,
        isEscalator: true,
        ...(rush ? { rushHourUpOnly: true } : {}),
      });
      const g = (rush: boolean): WalkGraph => ({
        nodes: {
          lo: { id: 'lo', x: 0, z: 0, y: 20 },
          hi: { id: 'hi', x: 30, z: 0, y: 28 },
        },
        adjacency: { lo: [edge('hi', 8, rush)], hi: [edge('lo', -8, rush)] },
      });
      const down = findRoute(g(true), 'hi', 'lo', 'gentle', 'hi', 'lo');
      const up = findRoute(g(true), 'lo', 'hi', 'gentle', 'lo', 'hi');
      const downOther = findRoute(g(false), 'hi', 'lo', 'gentle', 'hi', 'lo');
      if (!down || !up || !downOther) throw new Error('routes expected');
      expect(down.escalatorUses).toEqual([{ edgeIndex: 0, direction: 'down', rushHourUpOnly: true }]);
      expect(up.escalatorUses).toEqual([{ edgeIndex: 0, direction: 'up', rushHourUpOnly: true }]);
      expect(usesRushHourDownEscalator(down)).toBe(true);
      expect(usesRushHourDownEscalator(up)).toBe(false);
      expect(usesRushHourDownEscalator(downOther)).toBe(false);
    });

    it('実データ: 第3学舎 → 関大前駅の坂ひかえめは下りで新アクセス路のエスカレーターを通り、逆は上りだけで注意が出ない', () => {
      const { graph, node } = live();
      const down = findRoute(graph, node('area3'), node('kandaimae-station'), 'gentle', 'area3', 'kandaimae-station');
      const up = findRoute(graph, node('kandaimae-station'), node('area3'), 'gentle', 'kandaimae-station', 'area3');
      if (!down || !up) throw new Error('routes expected');
      expect(down.escalatorUses.some((u) => u.direction === 'down' && u.rushHourUpOnly)).toBe(true);
      expect(usesRushHourDownEscalator(down)).toBe(true);
      expect(up.escalatorUses.length).toBeGreaterThan(0);
      expect(up.escalatorUses.every((u) => u.direction === 'up')).toBe(true);
      expect(usesRushHourDownEscalator(up)).toBe(false);
    });

    it('実データ: 段差フリーはエスカレーターを通さない（注意も出ない）', () => {
      const { graph, node } = live();
      const route = findRoute(graph, node('area3'), node('kandaimae-station'), 'step-free', 'area3', 'kandaimae-station');
      if (!route) throw new Error('route expected');
      expect(route.escalatorUses).toEqual([]);
      expect(usesRushHourDownEscalator(route)).toBe(false);
    });
  });
});

