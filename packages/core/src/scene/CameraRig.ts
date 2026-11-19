import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { computeVisualY } from '../domain/projection';
import type { BuildingFeature, CampusConfig, RouteResult } from '../domain/types';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

export function parseCameraParam(raw: string | null): CameraPose | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',');
  if (parts.length !== 6) return undefined;

  const values: number[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length === 0) return undefined;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return undefined;
    values.push(n);
  }

  const [px, py, pz, tx, ty, tz] = values;
  if (
    px === undefined ||
    py === undefined ||
    pz === undefined ||
    tx === undefined ||
    ty === undefined ||
    tz === undefined
  ) {
    return undefined;
  }

  if (Math.hypot(px - tx, py - ty, pz - tz) < 0.1) {
    return undefined;
  }

  return {
    position: [px, py, pz],
    target: [tx, ty, tz],
  };
}

export function formatCameraParam(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
): string {
  const fmt = (v: number): string => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1);
  return `cam=${[...position, ...target].map(fmt).join(',')}`;
}

interface SphericalFlight {
  startRadius: number;
  endRadius: number;
  startPhi: number;
  endPhi: number;
  startTheta: number;
  deltaTheta: number;
}

interface FlightState {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  startTimeMs: number;
  durationMs: number;
  spherical?: SphericalFlight;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: MapControls;
  private readonly bounds: CampusConfig['bounds'];
  private readonly tempSpherical = new THREE.Spherical();
  private readonly tempOffset = new THREE.Vector3();
  private flight: FlightState | null = null;
  private reducedMotion = false;

  constructor(
    aspect: number,
    domElement: HTMLElement,
    config: CampusConfig,
    initialPresetId?: string,
    reducedMotion = false,
    initialCamera?: CameraPose,
  ) {
    this.bounds = config.bounds;
    this.reducedMotion = reducedMotion;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 2, 4000);

    const initial =
      config.cameraPresets.find((p) => p.id === initialPresetId) ??
      config.cameraPresets[0];
    if (initialCamera) {
      this.camera.position.set(...initialCamera.position);
    } else if (initial) {
      this.camera.position.set(...initial.position);
    } else {
      this.camera.position.set(-430, 420, 540);
    }

    this.controls = new MapControls(this.camera, domElement);
    this.controls.enableDamping = !reducedMotion;
    this.controls.dampingFactor = 0.16;
    this.controls.rotateSpeed = 0.72;
    this.controls.panSpeed = 1.0;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 35;
    this.controls.maxDistance = 1180;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = 1.28;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;

    if (initialCamera) {
      this.controls.target.set(...initialCamera.target);
    } else if (initial) {
      this.controls.target.set(...initial.target);
    } else {
      this.controls.target.set(25, 38, 25);
    }
    this.controls.update();

    this.controls.addEventListener('start', this.handleControlStart);
  }

  private handleControlStart = (): void => {
    this.flight = null;
  };

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.controls.enableDamping = !reduced;
    if (reduced && this.flight) {
      this.camera.position.copy(this.flight.endPos);
      this.controls.target.copy(this.flight.endTarget);
      this.flight = null;
      this.controls.update();
    }
  }

  setAspect(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  flyTo(
    position: [number, number, number],
    target: [number, number, number],
    durationMs = 780,
  ): void {
    if (this.reducedMotion || durationMs <= 0) {
      this.flight = null;
      this.camera.position.set(...position);
      this.controls.target.set(...target);
      this.controls.update();
      return;
    }

    const startPos = this.camera.position.clone();
    const endPos = new THREE.Vector3(...position);
    const startTarget = this.controls.target.clone();
    const endTarget = new THREE.Vector3(...target);

    let spherical: SphericalFlight | undefined;
    if (startTarget.distanceToSquared(endTarget) < 1e-6) {
      const startOffset = startPos.clone().sub(startTarget);
      const endOffset = endPos.clone().sub(endTarget);
      if (startOffset.lengthSq() > 1e-4 && endOffset.lengthSq() > 1e-4) {
        const startSph = new THREE.Spherical().setFromVector3(startOffset);
        const endSph = new THREE.Spherical().setFromVector3(endOffset);
        let deltaTheta = endSph.theta - startSph.theta;
        while (deltaTheta > Math.PI) deltaTheta -= Math.PI * 2;
        while (deltaTheta < -Math.PI) deltaTheta += Math.PI * 2;
        spherical = {
          startRadius: startSph.radius,
          endRadius: endSph.radius,
          startPhi: startSph.phi,
          endPhi: endSph.phi,
          startTheta: startSph.theta,
          deltaTheta,
        };
      }
    }

    this.flight = {
      startPos,
      endPos,
      startTarget,
      endTarget,
      startTimeMs: performance.now(),
      durationMs,
      spherical,
    };
  }

  resetNorth(): void {
    this.flight = null;
    const offset = this.tempOffset.subVectors(
      this.camera.position,
      this.controls.target,
    );
    const sph = this.tempSpherical.setFromVector3(offset);
    if (Math.abs(sph.theta) < 1e-4) {
      return;
    }
    sph.theta = 0;
    sph.phi = Math.max(
      this.controls.minPolarAngle,
      Math.min(this.controls.maxPolarAngle, sph.phi),
    );
    sph.makeSafe();
    offset.setFromSpherical(sph);

    const target = this.controls.target;
    this.flyTo(
      [target.x + offset.x, target.y + offset.y, target.z + offset.z],
      [target.x, target.y, target.z],
      400,
    );
  }

  getCameraParam(): string {
    const p = this.camera.position;
    const t = this.controls.target;
    return formatCameraParam([p.x, p.y, p.z], [t.x, t.y, t.z]);
  }

  focusBuilding(
    building: BuildingFeature,
    minElevation: number,
    exag: number,
  ): void {
    const ty = computeVisualY(building.groundY, minElevation, exag) + building.height * 0.45;
    const target: [number, number, number] = [
      building.centroid.x,
      ty,
      building.centroid.z,
    ];

    const currentDir = new THREE.Vector3().subVectors(
      this.camera.position,
      this.controls.target,
    );
    currentDir.y = 0;
    if (currentDir.lengthSq() < 1) {
      currentDir.set(-0.7, 0, 0.7);
    } else {
      currentDir.normalize();
    }

    const horizDist = building.isSpotOnly ? 135 : 165;
    const heightOffset = building.isSpotOnly ? 105 : 128;
    const pos: [number, number, number] = [
      building.centroid.x + currentDir.x * horizDist,
      ty + heightOffset,
      building.centroid.z + currentDir.z * horizDist,
    ];

    this.flyTo(pos, target, 720);
  }

  frameRoute(route: RouteResult, minElevation: number, exag: number): void {
    if (route.points.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const p of route.points) {
      const y = computeVisualY(p.y, minElevation, exag);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const span = Math.max(220, Math.hypot(maxX - minX, maxZ - minZ));

    this.flyTo(
      [cx - span * 0.52, cy + span * 0.62, cz + span * 0.66],
      [cx, cy, cz],
      850,
    );
  }

  update(nowMs: number): boolean {
    let didFly = false;
    if (this.flight) {
      didFly = true;
      const elapsed = nowMs - this.flight.startTimeMs;
      const t = Math.min(1, Math.max(0, elapsed / this.flight.durationMs));
      const eased = easeInOutCubic(t);
      if (this.flight.spherical) {
        const s = this.flight.spherical;
        const radius = s.startRadius + (s.endRadius - s.startRadius) * eased;
        const phi = s.startPhi + (s.endPhi - s.startPhi) * eased;
        const theta = s.startTheta + s.deltaTheta * eased;
        this.tempSpherical.set(radius, phi, theta);
        this.tempOffset.setFromSpherical(this.tempSpherical);
        this.controls.target.copy(this.flight.endTarget);
        this.camera.position.copy(this.flight.endTarget).add(this.tempOffset);
      } else {
        this.camera.position.lerpVectors(
          this.flight.startPos,
          this.flight.endPos,
          eased,
        );
        this.controls.target.lerpVectors(
          this.flight.startTarget,
          this.flight.endTarget,
          eased,
        );
      }
      if (t >= 1) {
        this.camera.position.copy(this.flight.endPos);
        this.controls.target.copy(this.flight.endTarget);
        this.flight = null;
      }
    }

    this.controls.target.x = Math.max(
      this.bounds.minX + 30,
      Math.min(this.bounds.maxX - 30, this.controls.target.x),
    );
    this.controls.target.z = Math.max(
      this.bounds.minZ + 30,
      Math.min(this.bounds.maxZ - 30, this.controls.target.z),
    );
    this.controls.target.y = Math.max(-5, Math.min(140, this.controls.target.y));

    this.controls.update();
    return didFly;
  }

  dispose(): void {
    this.controls.removeEventListener('start', this.handleControlStart);
    this.controls.dispose();
  }
}

