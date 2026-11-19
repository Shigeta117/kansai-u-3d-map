import * as THREE from 'three';
import type { LabelsFrame, LabelsListener } from '../domain/labels';
import { computeVisualY } from '../domain/projection';
import type {
  BuildingCategory,
  BuildingFeature,
  CampusConfig,
  CampusDataset,
  LightingTheme,
  ProjectedLabel,
  RouteResult,
} from '../domain/types';
import { buildAccessCanopiesGroup } from './AccessWayBuilder';
import { buildStructuresBridgesGroup } from './BridgeBuilder';
import {
  applyBuildingVisualStates,
  buildBuildingsGroup,
  type BuildingMeshRecord,
} from './BuildingBuilder';
import { CameraRig, type CameraPose } from './CameraRig';
import { buildFoliageGroup } from './FoliageBuilder';
import { LightingRig } from './LightingRig';
import { RouteOverlay } from './RouteOverlay';
import { buildTerrainGroup } from './TerrainBuilder';
import { buildTransportGroup } from './TransportBuilder';

export interface CampusSceneCallbacks {
  onSelectBuilding: (buildingId: string | null) => void;
  onLabelsUpdate?: (labels: ProjectedLabel[]) => void;
}

export interface CampusSceneOptions {
  campusOnly?: boolean;
  initialTheme?: LightingTheme;
  initialPresetId?: string;
  initialCamera?: CameraPose;
}

export class CampusScene {
  private readonly container: HTMLElement;
  private readonly dataset: CampusDataset;
  private readonly config: CampusConfig;
  private readonly callbacks: CampusSceneCallbacks;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly cameraRig: CameraRig;
  private readonly lightingRig: LightingRig;
  private readonly routeOverlay: RouteOverlay;

  private readonly campusRecords: Map<string, BuildingMeshRecord>;
  private readonly interactiveMeshes: THREE.Object3D[];
  private readonly animatedRotors: THREE.Object3D[];
  private readonly transportCars: THREE.Object3D[];
  private readonly updateTransport: (elapsedSec: number) => boolean;
  private readonly labelTargets: BuildingFeature[];

  private readonly raycaster = new THREE.Raycaster();
  private readonly projVec = new THREE.Vector3();
  private readonly frustum = new THREE.Frustum();
  private readonly projScreenMatrix = new THREE.Matrix4();
  private readonly tempWorldPos = new THREE.Vector3();
  private readonly tempSphere = new THREE.Sphere();
  private readonly labelListeners = new Set<LabelsListener>();
  private lastLabelsFrame: LabelsFrame | null = null;

  private rafId: number | null = null;
  private startTimeMs = performance.now();
  private isDisposed = false;
  private isVisible = true;
  private needsRender = true;
  private labelsDirty = true;
  private frustumDirty = true;
  private wasTransportVisible = false;
  private prefersReducedMotion = false;
  private motionMediaQuery: MediaQueryList | null = null;
  private pointerDownInfo: { x: number; y: number; time: number } | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    container: HTMLElement,
    dataset: CampusDataset,
    config: CampusConfig,
    callbacks: CampusSceneCallbacks,
    options: CampusSceneOptions = {},
  ) {
    this.container = container;
    this.dataset = dataset;
    this.config = config;
    this.callbacks = callbacks;

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.prefersReducedMotion = this.motionMediaQuery.matches;
    }

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const isMobile = width < 768;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.lightingRig = new LightingRig(isMobile);
    this.scene.add(this.lightingRig.group);
    this.lightingRig.applyTheme(options.initialTheme ?? 'day', this.scene);

    this.cameraRig = new CameraRig(
      width / height,
      this.renderer.domElement,
      config,
      options.initialPresetId,
      this.prefersReducedMotion,
      options.initialCamera,
    );

    const terrainGroup = buildTerrainGroup(
      dataset.terrain,
      dataset.landcover,
      dataset.paths,
      config,
    );
    this.scene.add(terrainGroup);

    const buildingsResult = buildBuildingsGroup(
      dataset.buildings,
      dataset.terrain.minElevation,
      config,
      { campusOnly: options.campusOnly },
    );
    this.scene.add(buildingsResult.root);
    this.campusRecords = buildingsResult.campusRecords;
    this.interactiveMeshes = buildingsResult.interactiveMeshes;
    this.animatedRotors = buildingsResult.animatedRotors;

    const bridgesGroup = buildStructuresBridgesGroup(
      dataset.structures,
      dataset.terrain,
      config,
    );
    this.scene.add(bridgesGroup);

    const canopiesGroup = buildAccessCanopiesGroup(
      dataset.structures,
      dataset.terrain,
      config,
    );
    this.scene.add(canopiesGroup);

    const foliageGroup = buildFoliageGroup(
      dataset.terrain,
      dataset.landcover,
      dataset.buildings,
      dataset.paths,
      config,
      dataset.structures,
      { campusOnly: options.campusOnly },
    );
    this.scene.add(foliageGroup);

    if (options.campusOnly) {
      this.transportCars = [];
      this.updateTransport = () => false;
    } else {
      const transportResult = buildTransportGroup(
        dataset.transport,
        dataset.terrain,
        config,
      );
      this.scene.add(transportResult.group);
      this.transportCars = transportResult.cars;
      this.updateTransport = transportResult.update;
    }

    this.routeOverlay = new RouteOverlay();
    this.scene.add(this.routeOverlay.group);

    this.scene.updateMatrixWorld(true);
    this.renderer.shadowMap.needsUpdate = true;

    this.labelTargets = dataset.buildings
      .filter(
        (b) =>
          Boolean(b.landmarkId) || (b.inCampus && b.shortName.trim().length > 0),
      )
      .sort((a, b) => a.labelPriority - b.labelPriority);

    this.bindEvents();
    this.startLoop();
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;

    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointerup', this.handlePointerUp);
    this.cameraRig.controls.addEventListener('change', this.handleControlsChange);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.motionMediaQuery?.addEventListener('change', this.handleMotionChange);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', this.handleResize);
    }
  }

  private handleControlsChange = (): void => {
    this.needsRender = true;
    this.labelsDirty = true;
    this.frustumDirty = true;
  };

  private handleMotionChange = (ev: MediaQueryListEvent): void => {
    this.prefersReducedMotion = ev.matches;
    this.cameraRig.setReducedMotion(ev.matches);
    this.routeOverlay.update(
      (performance.now() - this.startTimeMs) * 0.001,
      this.prefersReducedMotion,
    );
    this.needsRender = true;
    this.labelsDirty = true;
    this.frustumDirty = true;
  };

  private handlePointerDown = (ev: PointerEvent): void => {
    this.pointerDownInfo = {
      x: ev.clientX,
      y: ev.clientY,
      time: performance.now(),
    };
  };

  private handlePointerUp = (ev: PointerEvent): void => {
    if (!this.pointerDownInfo) return;
    const dx = ev.clientX - this.pointerDownInfo.x;
    const dy = ev.clientY - this.pointerDownInfo.y;
    const dt = performance.now() - this.pointerDownInfo.time;
    this.pointerDownInfo = null;

    if (Math.hypot(dx, dy) > 8 || dt > 380) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cameraRig.camera);
    const hits = this.raycaster.intersectObjects(this.interactiveMeshes, false);

    if (hits.length > 0) {
      const hitId = hits[0]?.object.userData?.buildingId;
      if (typeof hitId === 'string') {
        this.callbacks.onSelectBuilding(hitId);
        return;
      }
    }
    this.callbacks.onSelectBuilding(null);
  };

  private handleVisibilityChange = (): void => {
    this.isVisible = document.visibilityState !== 'hidden';
    if (this.isVisible && !this.isDisposed) {
      this.needsRender = true;
      if (this.rafId === null) {
        this.startLoop();
      }
    }
  };

  private handleResize = (): void => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.cameraRig.setAspect(w, h);
    this.renderer.setSize(w, h);
    this.needsRender = true;
    this.labelsDirty = true;
    this.frustumDirty = true;
  };

  private startLoop(): void {
    const tick = (nowMs: number) => {
      if (this.isDisposed || !this.isVisible) {
        this.rafId = null;
        return;
      }
      this.rafId = requestAnimationFrame(tick);

      const elapsedSec = (nowMs - this.startTimeMs) * 0.001;
      const didFly = this.cameraRig.update(nowMs);
      if (didFly) {
        this.needsRender = true;
        this.labelsDirty = true;
        this.frustumDirty = true;
      }

      if (this.frustumDirty) {
        this.cameraRig.camera.updateMatrixWorld();
        this.projScreenMatrix.multiplyMatrices(
          this.cameraRig.camera.projectionMatrix,
          this.cameraRig.camera.matrixWorldInverse,
        );
        this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
        this.frustumDirty = false;
      }

      if (!this.prefersReducedMotion) {
        if (this.transportCars.length > 0) {
          const trainMoved = this.updateTransport(elapsedSec);
          let anyCarVisible = false;
          for (const car of this.transportCars) {
            this.tempSphere.set(car.position, 10);
            if (this.frustum.intersectsSphere(this.tempSphere)) {
              anyCarVisible = true;
              break;
            }
          }
          if (trainMoved && (anyCarVisible || this.wasTransportVisible)) {
            this.needsRender = true;
          }
          this.wasTransportVisible = anyCarVisible;
        }

        for (const rotor of this.animatedRotors) {
          rotor.getWorldPosition(this.tempWorldPos);
          this.tempSphere.set(this.tempWorldPos, 6);
          if (this.frustum.intersectsSphere(this.tempSphere)) {
            rotor.rotation.y = elapsedSec * 1.6;
            this.needsRender = true;
          }
        }

        if (this.routeOverlay.hasActiveRoute()) {
          this.routeOverlay.update(elapsedSec, false);
          this.needsRender = true;
        }
      }

      if (this.needsRender) {
        this.needsRender = false;
        this.renderer.render(this.scene, this.cameraRig.camera);
        if (this.labelsDirty) {
          this.labelsDirty = false;
          this.emitProjectedLabels();
        }
      } else if (this.labelsDirty) {
        this.labelsDirty = false;
        this.emitProjectedLabels();
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private emitProjectedLabels(): void {
    if (this.labelListeners.size === 0 && !this.callbacks.onLabelsUpdate) {
      this.lastLabelsFrame = null;
      return;
    }

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;

    const minElev = this.dataset.terrain.minElevation;
    const exag = this.config.verticalExaggeration;
    const camPos = this.cameraRig.camera.position;
    const cameraDistance = camPos.distanceTo(this.cameraRig.controls.target);

    const labels: ProjectedLabel[] = [];
    for (const b of this.labelTargets) {
      const topY =
        computeVisualY(b.groundY, minElev, exag) + b.height + (b.isSpotOnly ? 8 : 5);
      this.projVec.set(b.centroid.x, topY, b.centroid.z);
      const distanceToCamera = camPos.distanceTo(this.projVec);

      this.projVec.project(this.cameraRig.camera);
      const visible =
        this.projVec.z >= -1 &&
        this.projVec.z <= 1 &&
        this.projVec.x >= -0.94 &&
        this.projVec.x <= 0.94 &&
        this.projVec.y >= -0.9 &&
        this.projVec.y <= 0.88;

      if (!visible) continue;

      const screenX = (this.projVec.x * 0.5 + 0.5) * width;
      const screenY = (-this.projVec.y * 0.5 + 0.5) * height;

      labels.push({
        id: b.id,
        name: b.name,
        shortName: b.shortName,
        category: b.category,
        screenX,
        screenY,
        distanceToCamera,
        priority: b.landmarkId ? b.labelPriority : 99,
        visible,
      });
    }

    const frame: LabelsFrame = {
      labels,
      cameraDistance,
      viewportWidth: width,
      viewportHeight: height,
    };
    this.lastLabelsFrame = frame;

    this.callbacks.onLabelsUpdate?.(labels);
    for (const listener of this.labelListeners) {
      listener(frame);
    }
  }

  subscribeLabels(listener: LabelsListener): () => void {
    this.labelListeners.add(listener);
    if (this.lastLabelsFrame && !this.labelsDirty) {
      listener(this.lastLabelsFrame);
    } else {
      this.labelsDirty = true;
    }
    return () => {
      this.labelListeners.delete(listener);
    };
  }

  requestRender(): void {
    this.needsRender = true;
  }

  setHighlightState(
    selectedId: string | null,
    activeCategory: BuildingCategory | 'all',
  ): void {
    applyBuildingVisualStates(this.campusRecords, selectedId, activeCategory);
    this.needsRender = true;
  }

  focusBuilding(building: BuildingFeature): void {
    this.cameraRig.focusBuilding(
      building,
      this.dataset.terrain.minElevation,
      this.config.verticalExaggeration,
    );
    this.needsRender = true;
    this.labelsDirty = true;
    this.frustumDirty = true;
  }

  flyToPreset(presetId: string): void {
    const preset = this.config.cameraPresets.find((p) => p.id === presetId);
    if (!preset) return;
    this.cameraRig.flyTo(preset.position, preset.target);
    this.needsRender = true;
    this.labelsDirty = true;
    this.frustumDirty = true;
  }

  resetNorth(): void {
    this.cameraRig.resetNorth();
    this.needsRender = true;
    this.labelsDirty = true;
    this.frustumDirty = true;
  }

  getCameraParam(): string {
    return this.cameraRig.getCameraParam();
  }

  setRoute(route: RouteResult | null): void {
    this.routeOverlay.setRoute(
      route,
      this.dataset.terrain.minElevation,
      this.config,
    );
    this.needsRender = true;
    if (route) {
      this.cameraRig.frameRoute(
        route,
        this.dataset.terrain.minElevation,
        this.config.verticalExaggeration,
      );
      this.labelsDirty = true;
      this.frustumDirty = true;
    }
  }

  setLightingTheme(theme: LightingTheme): void {
    this.lightingRig.applyTheme(theme, this.scene);
    this.renderer.shadowMap.needsUpdate = true;
    this.needsRender = true;
  }

  dispose(): void {
    this.isDisposed = true;
    this.labelListeners.clear();
    this.lastLabelsFrame = null;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('pointerup', this.handlePointerUp);
    this.cameraRig.controls.removeEventListener('change', this.handleControlsChange);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.motionMediaQuery?.removeEventListener('change', this.handleMotionChange);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', this.handleResize);
    }

    this.routeOverlay.clear();
    this.cameraRig.dispose();

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m) continue;
          if ('map' in m && m.map instanceof THREE.Texture) {
            m.map.dispose();
          }
          m.dispose();
        }
      }
    });

    this.renderer.dispose();
    if (dom.parentNode) {
      dom.parentNode.removeChild(dom);
    }
  }
}

