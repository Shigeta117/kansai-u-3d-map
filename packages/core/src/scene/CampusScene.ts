import * as THREE from 'three';
import type { LabelsFrame, LabelsListener } from '../domain/labels';
import { computeVisualY } from '../domain/projection';
import { findWing, wingFootprintCentroid } from '../domain/wings';
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
  applyRoofColorMode,
  type RoofColorMode,
  buildBuildingsGroup,
  type BuildingMeshRecord,
} from './BuildingBuilder';
import { CameraRig, type CameraPose } from './CameraRig';
import {
  buildDioramaBaseGroup,
  createDioramaClippingPlanes,
} from './DioramaBaseBuilder';
import { carveTerrainForExpressways } from './ExpresswayBuilder';
import { buildFoliageGroup } from './FoliageBuilder';
import { buildGroundsGroup, carveTerrainForGrounds } from './GroundsBuilder';
import { LightingRig } from './LightingRig';
import { buildStaticBatches, type StaticBatchSource, type StaticBatches } from './staticBatches';
import { RouteOverlay } from './RouteOverlay';
import { DEFAULT_SELECTION_LOOK, SelectionHighlighter, type SelectionLook } from './selectionHighlight';
import { buildTerrainGroup, TERRAIN_PATHS_GROUP_NAME } from './TerrainBuilder';
import { buildTransportGroup } from './TransportBuilder';
import { resolveBuildingPick } from './wingSelection';

export interface CampusSceneCallbacks {
  /** 建物を押したとき（何も無い所なら null）。建物の中の棟（第3学舎の A〜D棟など）を押したら wingId も渡す */
  onSelectBuilding: (buildingId: string | null, wingId?: string | null) => void;
  onLabelsUpdate?: (labels: ProjectedLabel[]) => void;
}

/**
 * 1 回の描画の重さ（`renderer.info.render` の値）。calls と triangles は画面の描画だけの数で、
 * 影の地図の描画は含まない（three は影の地図を描いた後に info を数え直すため。r175・r176 で同じ）。
 * 影の地図は組み立て時とテーマ切り替え時だけ描き直すので、その回の数を shadowCalls / shadowTriangles に残す
 */
export interface RenderStats {
  /** 画面の描画の描画命令の数（この 1 回分） */
  calls: number;
  /** 画面の描画の三角形の数（この 1 回分） */
  triangles: number;
  /** 最後に影の地図を描き直したときの描画命令の数（まだ描いていなければ 0） */
  shadowCalls: number;
  /** 最後に影の地図を描き直したときの三角形の数 */
  shadowTriangles: number;
  /** これまでに描いた回数（値が 1 回分ずつ入れ替わっているかの確かめ用） */
  renders: number;
}

export interface CampusSceneOptions {
  campusOnly?: boolean;
  initialTheme?: LightingTheme;
  initialPresetId?: string;
  initialCamera?: CameraPose;
  /** 撮影・検収用に、カメラの寄りと傾きの制限を外す（URL の free=1） */
  freeCamera?: boolean;
  /** 描画のたびに重さを受け取る（開発時と URL の stats=1 のときだけ渡す） */
  onRenderStats?: (stats: RenderStats) => void;
  /** 選んだ建物の見た目（輪郭・塗り・持ち上げ・周りを薄く）。比べるときは URL の sel= から渡す。無ければ既定 */
  selectionLook?: SelectionLook;
}

/** 棟に寄るときの距離（建物は水平 165m・上 128m。棟は塊が小さいので近くまで寄る） */
const WING_FOCUS_HORIZ_M = 120;
const WING_FOCUS_HEIGHT_M = 94;

export class CampusScene {
  private readonly container: HTMLElement;
  private lastSelectedId: string | null = null;
  private lastActiveCategory: BuildingCategory | 'all' = 'all';
  private readonly dataset: CampusDataset;
  private readonly config: CampusConfig;
  private readonly callbacks: CampusSceneCallbacks;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly clippingPlanes: THREE.Plane[];
  private readonly cameraRig: CameraRig;
  private readonly lightingRig: LightingRig;
  private readonly routeOverlay: RouteOverlay;
  /** 選んだ建物（か棟）の殻に重ねる輪郭と塗り（選んでいる間だけ描く。重ねる物の描画命令は +2 まで） */
  private readonly selectionHighlighter: SelectionHighlighter;
  private readonly selectionLook: SelectionLook;

  private readonly campusRecords: Map<string, BuildingMeshRecord>;
  /** 建物・上屋・橋の動かない部品を、建物をまたいで材質の設定ごとにまとめたメッシュ（staticBatches.ts） */
  private readonly staticBatches: StaticBatches;
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
  private readonly onRenderStats: ((stats: RenderStats) => void) | null;
  private readonly shadowPassStats = { calls: 0, triangles: 0 };
  private renderCount = 0;

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
    this.onRenderStats = options.onRenderStats ?? null;
    this.selectionLook = { ...(options.selectionLook ?? DEFAULT_SELECTION_LOOK) };

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
      // 選んだ建物の輪郭を外周だけに残すのに使う（selectionHighlight.ts）
      stencil: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);
    if (this.onRenderStats) {
      this.trackShadowPassStats();
    }

    this.scene = new THREE.Scene();
    this.clippingPlanes = createDioramaClippingPlanes(config.diorama);
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
      options.freeCamera ?? false,
    );

    // 表示用の地形: 名神高速の地上の区間の路面の下にかかる格子を下げ、グラウンドの下をグラウンドの面の高さにならす
    // （データの地形は変えない）
    const terrain = carveTerrainForGrounds(
      carveTerrainForExpressways(dataset.terrain, dataset.structures),
      dataset.structures,
    );

    const terrainGroup = buildTerrainGroup(
      terrain,
      dataset.landcover,
      dataset.paths,
      config,
    );
    this.scene.add(terrainGroup);

    const buildingsResult = buildBuildingsGroup(
      dataset.buildings,
      dataset.terrain.minElevation,
      config,
      { campusOnly: options.campusOnly, terrain },
    );
    this.scene.add(buildingsResult.root);
    this.campusRecords = buildingsResult.campusRecords;
    this.interactiveMeshes = buildingsResult.interactiveMeshes;
    this.animatedRotors = buildingsResult.animatedRotors;

    // グラウンド（陸上のトラック・野球場・テニスコート）。面・網の柵・外野のフェンスの 3 つのメッシュ
    const groundsGroup = buildGroundsGroup(dataset.structures, dataset.buildings, terrain, config);
    this.scene.add(groundsGroup);

    const bridgesGroup = buildStructuresBridgesGroup(
      dataset.structures,
      terrain,
      config,
    );
    this.scene.add(bridgesGroup);

    const canopiesGroup = buildAccessCanopiesGroup(
      dataset.structures,
      terrain,
      config,
    );
    this.scene.add(canopiesGroup);

    const foliageGroup = buildFoliageGroup(
      terrain,
      dataset.landcover,
      dataset.buildings,
      dataset.paths,
      config,
      dataset.structures,
      { campusOnly: options.campusOnly },
    );
    this.scene.add(foliageGroup);

    // 建物（選択で薄める・持ち上げる・当たり判定がある）・新アクセス路の上屋・橋・道の帯・駅（動かない）の部品を、
    // 建物をまたいで描き方の設定ごとに 1 つのメッシュにまとめる（staticBatches.ts）。建物と駅の元のメッシュは
    // 当たり判定に、建物の元のメッシュは選んで持ち上げている間の描画にも使うので、見えないまま残す
    const batchSources: StaticBatchSource[] = [
      ...[...this.campusRecords.values()].map((rec) => ({
        root: rec.group,
        keep: this.animatedRotors,
        movable: rec.group,
        pickable: true,
      })),
      { root: canopiesGroup, pickable: false },
      { root: bridgesGroup, pickable: false },
    ];
    const pathsGroup = terrainGroup.getObjectByName(TERRAIN_PATHS_GROUP_NAME);
    if (pathsGroup) batchSources.push({ root: pathsGroup, pickable: false });

    if (options.campusOnly) {
      this.transportCars = [];
      this.updateTransport = () => false;
    } else {
      const transportResult = buildTransportGroup(
        dataset.transport,
        terrain,
        config,
      );
      this.scene.add(transportResult.group);
      // 駅のホーム・駅舎を押すと駅（kandaimae-station）を選ぶ
      this.interactiveMeshes.push(...transportResult.interactive);
      this.transportCars = transportResult.cars;
      this.updateTransport = transportResult.update;
      // 走る電車はまとめない
      batchSources.push({ root: transportResult.group, keep: transportResult.cars, pickable: true });
    }

    this.staticBatches = buildStaticBatches(batchSources);
    this.scene.add(this.staticBatches.group);

    this.routeOverlay = new RouteOverlay();
    this.scene.add(this.routeOverlay.group);

    this.applyClippingPlanes(this.scene);
    this.selectionHighlighter = new SelectionHighlighter(this.selectionLook, this.clippingPlanes);
    this.selectionHighlighter.setResolution(width, height);

    const dioramaBaseGroup = buildDioramaBaseGroup(terrain, config);
    this.scene.add(dioramaBaseGroup);

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

  /**
   * 影の地図の描画命令を数える。info は影の地図を描いた後に数え直される（autoReset）ので、
   * 影の地図の描画の前後の差を取る。影の地図を描き直さない回（autoUpdate=false で needsUpdate も false）は数えない
   */
  private trackShadowPassStats(): void {
    const shadowMap = this.renderer.shadowMap;
    const info = this.renderer.info;
    const renderShadows = shadowMap.render.bind(shadowMap);
    shadowMap.render = (lights, scene, camera) => {
      const willUpdate =
        shadowMap.enabled && (shadowMap.autoUpdate || shadowMap.needsUpdate) && lights.length > 0;
      const calls0 = info.render.calls;
      const triangles0 = info.render.triangles;
      renderShadows(lights, scene, camera);
      if (willUpdate) {
        this.shadowPassStats.calls = info.render.calls - calls0;
        this.shadowPassStats.triangles = info.render.triangles - triangles0;
      }
    };
  }

  private emitRenderStats(): void {
    if (!this.onRenderStats) return;
    this.renderCount += 1;
    const { calls, triangles } = this.renderer.info.render;
    this.onRenderStats({
      calls,
      triangles,
      shadowCalls: this.shadowPassStats.calls,
      shadowTriangles: this.shadowPassStats.triangles,
      renders: this.renderCount,
    });
  }

  private applyClippingPlanes(root: THREE.Object3D): void {
    root.traverse((obj) => {
      let cur: THREE.Object3D | null = obj;
      while (cur) {
        if (cur.userData?.excludeFromClipping === true) {
          return;
        }
        cur = cur.parent;
      }
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.Line ||
        obj instanceof THREE.Points
      ) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m instanceof THREE.Material) {
            m.clippingPlanes = this.clippingPlanes;
            m.clipShadows = true;
          }
        }
      }
    });
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

    // 建物の部品は材質ごとにまとめてあるので、棟は同じ光線を棟の殻に当て直して決める（wingSelection.ts）
    const pick = resolveBuildingPick(hits[0], this.raycaster, (id) => this.campusRecords.get(id));
    if (pick) {
      this.callbacks.onSelectBuilding(pick.buildingId, pick.wingId);
      return;
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
    this.selectionHighlighter.setResolution(w, h);
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
        // 材質の色・選んだ建物の持ち上げ方を、まとめたメッシュへ写してから描く
        this.staticBatches.sync();
        this.renderer.render(this.scene, this.cameraRig.camera);
        this.emitRenderStats();
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

  /**
   * 選択とカテゴリの絞り込みの見た目。選んだ建物の殻に輪郭と塗りを重ねる。selectedWingId（建物の中の棟）を渡すと、
   * 建物全体ではなくその棟の殻に重ねる（棟の無い建物や、無い棟の id なら建物全体）
   */
  setHighlightState(
    selectedId: string | null,
    activeCategory: BuildingCategory | 'all',
    selectedWingId: string | null = null,
  ): void {
    const rec = selectedId ? this.campusRecords.get(selectedId) : undefined;
    const wing = rec ? findWing(rec.building, selectedWingId) : null;
    this.lastSelectedId = selectedId;
    this.lastActiveCategory = activeCategory;
    applyBuildingVisualStates(this.campusRecords, selectedId, activeCategory, this.selectionLook);
    this.selectionHighlighter.show(rec?.group, wing ? rec?.wingShells?.get(wing.id) : rec?.selectionShell);
    this.needsRender = true;
  }

  /** 建物に寄る。wingId（建物の中の棟）を渡すと、その棟の塊の重心へ建物より近くまで寄る */
  focusBuilding(building: BuildingFeature, wingId: string | null = null): void {
    const wing = findWing(building, wingId);
    const footprint = wing ? wingFootprintCentroid(building, wing) : null;
    if (wing && footprint) {
      const groundY = computeVisualY(
        building.groundY,
        this.dataset.terrain.minElevation,
        this.config.verticalExaggeration,
      );
      const floorHeightM = wing.floorHeightM ?? building.height / Math.max(1, building.levels);
      const ty = groundY + wing.floorsAbove * floorHeightM * 0.45;
      this.cameraRig.focusOn(
        [footprint.centroid.x, ty, footprint.centroid.z],
        WING_FOCUS_HORIZ_M,
        WING_FOCUS_HEIGHT_M,
      );
    } else {
      this.cameraRig.focusBuilding(
        building,
        this.dataset.terrain.minElevation,
        this.config.verticalExaggeration,
      );
    }
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
    this.applyClippingPlanes(this.routeOverlay.group);
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

  /** 主役の建物以外の屋根の色を、空中写真の色（aerial）とエリアの塗り分け（area）で切り替える */
  setRoofColorMode(mode: RoofColorMode): void {
    applyRoofColorMode(this.campusRecords, mode);
    applyBuildingVisualStates(this.campusRecords, this.lastSelectedId, this.lastActiveCategory, this.selectionLook);
    this.needsRender = true;
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
    this.selectionHighlighter.dispose();
    this.staticBatches.dispose();
    for (const rec of this.campusRecords.values()) {
      for (const shell of rec.wingShells?.values() ?? []) shell.dispose();
      rec.selectionShell?.dispose();
    }
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

