import * as THREE from 'three';
import { computeVisualY } from '../domain/projection';
import type { CampusConfig, RouteMode, RouteResult } from '../domain/types';
import { SCENE_PALETTE } from './palette';

const ROUTE_COLORS: Record<RouteMode, string> = {
  shortest: SCENE_PALETTE.accents.routeMain,
  gentle: SCENE_PALETTE.accents.routeGentle,
  'step-free': SCENE_PALETTE.accents.routeStepFree,
};

/** 物に隠れた区間の線の不透明度（見えている区間との区別がつき、経路の続きは追える濃さ） */
export const HIDDEN_ROUTE_OPACITY = 0.45;

export class RouteOverlay {
  readonly group = new THREE.Group();
  private curve: THREE.CatmullRomCurve3 | null = null;
  private pulseSpheres: THREE.Mesh[] = [];
  private pinGroup = new THREE.Group();

  constructor() {
    this.group.name = 'route-overlay';
    this.group.add(this.pinGroup);
  }

  setRoute(
    route: RouteResult | null,
    minElevation: number,
    config: CampusConfig,
  ): void {
    this.clear();
    if (!route || route.points.length < 2) return;

    const exag = config.verticalExaggeration;
    const pts3D = route.points.map(
      (p) =>
        new THREE.Vector3(
          p.x,
          computeVisualY(p.y, minElevation, exag) + 1.05,
          p.z,
        ),
    );

    const cleanPts: THREE.Vector3[] = [];
    for (const pt of pts3D) {
      const prev = cleanPts[cleanPts.length - 1];
      if (!prev || prev.distanceTo(pt) > 0.8) {
        cleanPts.push(pt);
      }
    }
    if (cleanPts.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(cleanPts, false, 'centripetal', 0.25);
    this.curve = curve;

    const colorHex = ROUTE_COLORS[route.mode];
    const segments = Math.min(260, Math.max(40, Math.round(route.totalDistanceM / 3)));
    const tubeGeo = new THREE.TubeGeometry(curve, segments, 1.35, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.24,
      roughness: 0.45,
      metalness: 0.08,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.castShadow = false;
    tubeMesh.name = 'route-tube';
    this.group.add(tubeMesh);

    // 秀麗橋（中の詰まった箱）・屋根付きの通路・建物の陰を通る区間は、線が手前の物に隠れて消える。
    // 隠れた部分だけを薄く描く: 奥行きが「すでに描かれた物より奥」のときだけ描き、奥行きは書かない。
    // 見えている部分は上の管と同じ奥行きなので（GreaterDepth は等しいと描かない）重ならない
    const hiddenMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: HIDDEN_ROUTE_OPACITY,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
    });
    const hiddenMesh = new THREE.Mesh(tubeGeo, hiddenMat);
    hiddenMesh.name = 'route-tube-hidden';
    hiddenMesh.renderOrder = 10;
    this.group.add(hiddenMesh);

    const baseGeo = new THREE.TubeGeometry(curve, segments, 1.9, 6, false);
    baseGeo.scale(1, 0.35, 1);
    const baseMat = new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: 0.76,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.35;
    this.group.add(baseMesh);

    const pulseCount = 4;
    const pulseGeo = new THREE.SphereGeometry(1.75, 10, 10);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: SCENE_PALETTE.accents.routePulse,
    });
    for (let i = 0; i < pulseCount; i++) {
      const sphere = new THREE.Mesh(pulseGeo, pulseMat);
      const t = (i + 0.5) / pulseCount;
      const pt = curve.getPointAt(t);
      sphere.position.set(pt.x, pt.y + 0.55, pt.z);
      this.group.add(sphere);
      this.pulseSpheres.push(sphere);
    }

    const startPt = cleanPts[0];
    const endPt = cleanPts[cleanPts.length - 1];
    if (startPt) this.addEndpointPin(startPt, '#2B8A6E');
    if (endPt) this.addEndpointPin(endPt, colorHex);
  }

  private addEndpointPin(pos: THREE.Vector3, colorHex: string): void {
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.25,
      roughness: 0.4,
    });
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.4 }),
    );
    stem.position.set(pos.x, pos.y + 5, pos.z);
    this.pinGroup.add(stem);

    const head = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 16), mat);
    head.position.set(pos.x, pos.y + 11, pos.z);
    head.castShadow = true;
    this.pinGroup.add(head);
  }

  hasActiveRoute(): boolean {
    return this.curve !== null && this.pulseSpheres.length > 0;
  }

  update(elapsedSec: number, reducedMotion = false): void {
    if (!this.curve || this.pulseSpheres.length === 0) return;
    if (reducedMotion) {
      this.pinGroup.position.y = 0;
      return;
    }
    const speed = 0.16;
    const count = this.pulseSpheres.length;
    for (let i = 0; i < count; i++) {
      const sphere = this.pulseSpheres[i];
      if (!sphere) continue;
      const t = (elapsedSec * speed + i / count) % 1;
      const pt = this.curve.getPointAt(t);
      sphere.position.set(pt.x, pt.y + 0.55, pt.z);
    }
    this.pinGroup.position.y = Math.sin(elapsedSec * 2.6) * 0.7;
  }

  clear(): void {
    this.curve = null;
    this.pulseSpheres = [];
    const toRemove = [...this.group.children];
    for (const child of toRemove) {
      if (child === this.pinGroup) continue;
      this.group.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }
    const pinChildren = [...this.pinGroup.children];
    for (const child of pinChildren) {
      this.pinGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    this.pinGroup.position.set(0, 0, 0);
  }
}

