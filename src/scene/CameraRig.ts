import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { computeVisualY } from '@/domain/projection';
import type { BuildingFeature, CampusConfig, RouteResult } from '@/domain/types';

interface FlightState {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  startTimeMs: number;
  durationMs: number;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly bounds: CampusConfig['bounds'];
  private flight: FlightState | null = null;

  constructor(
    aspect: number,
    domElement: HTMLElement,
    config: CampusConfig,
  ) {
    this.bounds = config.bounds;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 2, 4000);

    const initial = config.cameraPresets[0];
    if (initial) {
      this.camera.position.set(...initial.position);
    } else {
      this.camera.position.set(-430, 420, 540);
    }

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.72;
    this.controls.panSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 95;
    this.controls.maxDistance = 1180;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = 1.28;
    this.controls.screenSpacePanning = false;

    if (initial) {
      this.controls.target.set(...initial.target);
    } else {
      this.controls.target.set(25, 38, 25);
    }
    this.controls.update();

    this.controls.addEventListener('start', () => {
      this.flight = null;
    });
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
    this.flight = {
      startPos: this.camera.position.clone(),
      endPos: new THREE.Vector3(...position),
      startTarget: this.controls.target.clone(),
      endTarget: new THREE.Vector3(...target),
      startTimeMs: performance.now(),
      durationMs,
    };
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

    // Maintain current horizontal azimuth if comfortable, otherwise gentle SW approach
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

  update(nowMs: number): void {
    if (this.flight) {
      const elapsed = nowMs - this.flight.startTimeMs;
      const t = Math.min(1, elapsed / this.flight.durationMs);
      const eased = easeInOutCubic(t);
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
      if (t >= 1) {
        this.flight = null;
      }
    }

    // Clamp pan target inside diorama perimeter
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
  }

  dispose(): void {
    this.controls.dispose();
  }
}

