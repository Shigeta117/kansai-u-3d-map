import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getCampusConfig } from '../domain/campus-registry';
import type { RouteResult } from '../domain/types';
import { HIDDEN_ROUTE_OPACITY, RouteOverlay } from './RouteOverlay';

function route(): RouteResult {
  return {
    mode: 'gentle',
    fromId: 'a',
    toId: 'b',
    points: [
      { x: 0, y: 30, z: 0 },
      { x: 20, y: 30, z: 0 },
      { x: 40, y: 31, z: 10 },
    ],
    totalDistanceM: 45,
    estimatedMinutes: 1,
    elevationGainM: 1,
    elevationLossM: 0,
    stepsCount: 0,
    usesBridge: true,
    usesShureiBridge: true,
    usesEscalator: false,
    isStepFree: true,
    maxSlopeRatio: 0.02,
    steepSegmentsM: 0,
    profile: [],
  };
}

describe('RouteOverlay', () => {
  it('物に隠れた区間（秀麗橋の中など）を薄く描く管を、見えている管と同じ形で足す', () => {
    const overlay = new RouteOverlay();
    overlay.setRoute(route(), 14.1, getCampusConfig('senriyama'));
    const tube = overlay.group.getObjectByName('route-tube') as THREE.Mesh;
    const hidden = overlay.group.getObjectByName('route-tube-hidden') as THREE.Mesh;
    expect(hidden).toBeInstanceOf(THREE.Mesh);
    expect(hidden.geometry).toBe(tube.geometry);
    const mat = hidden.material as THREE.MeshBasicMaterial;
    expect(mat.depthFunc).toBe(THREE.GreaterDepth);
    expect(mat.depthWrite).toBe(false);
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBe(HIDDEN_ROUTE_OPACITY);
  });

  it('経路を消すと隠れた区間の管も消える', () => {
    const overlay = new RouteOverlay();
    overlay.setRoute(route(), 14.1, getCampusConfig('senriyama'));
    overlay.clear();
    expect(overlay.group.getObjectByName('route-tube-hidden')).toBeUndefined();
  });
});
