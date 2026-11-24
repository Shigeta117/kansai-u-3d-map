import { useEffect, useRef, useState } from 'react';
import {
  CampusScene,
  type BuildingCategory,
  type CameraPose,
  type CampusConfig,
  type CampusDataset,
  type LightingTheme,
  type RenderStats,
  type RoofColorMode,
  type RouteResult,
  type SelectionLook,
} from '@kansai-u-3d/core';

type KumWindow = Window & {
  __kum?: {
    getCameraParam: () => string;
    /** 最後の描画の重さ（開発時か URL の stats=1 のときだけ入る） */
    renderStats?: RenderStats;
  };
};

/** 描画の重さを body の data-kum-* と window.__kum.renderStats に出す（撮影の --dump-dom や E2E から読む） */
function publishRenderStats(stats: RenderStats): void {
  const ds = document.body.dataset;
  ds.kumCalls = String(stats.calls);
  ds.kumTriangles = String(stats.triangles);
  ds.kumShadowCalls = String(stats.shadowCalls);
  ds.kumShadowTriangles = String(stats.shadowTriangles);
  ds.kumRenders = String(stats.renders);
  const kum = (window as KumWindow).__kum;
  if (kum) kum.renderStats = stats;
}

function clearRenderStats(): void {
  const ds = document.body.dataset;
  delete ds.kumCalls;
  delete ds.kumTriangles;
  delete ds.kumShadowCalls;
  delete ds.kumShadowTriangles;
  delete ds.kumRenders;
}

interface CampusViewportProps {
  dataset: CampusDataset;
  config: CampusConfig;
  selectedId: string | null;
  /** 建物の中の棟（選んでいれば、その棟だけを光らせる） */
  selectedWingId?: string | null;
  activeCategory: BuildingCategory | 'all';
  activeRoute: RouteResult | null;
  lighting: LightingTheme;
  roofColorMode: RoofColorMode;
  initialCamera?: CameraPose;
  freeCamera?: boolean;
  /** URL の stats=1。開発時は指定が無くても出す */
  renderStats?: boolean;
  /** 選んだ建物の見た目（URL の sel=）。無ければ既定 */
  selectionLook?: SelectionLook;
  onSelectBuilding: (buildingId: string | null, wingId?: string | null) => void;
  onSceneChange: (scene: CampusScene | null) => void;
  sceneRef: React.MutableRefObject<CampusScene | null>;
}

function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    );
  } catch {
    return false;
  }
}

export function CampusViewport({
  dataset,
  config,
  selectedId,
  selectedWingId = null,
  activeCategory,
  activeRoute,
  lighting,
  roofColorMode,
  initialCamera,
  freeCamera,
  renderStats,
  selectionLook,
  onSelectBuilding,
  onSceneChange,
  sceneRef,
}: CampusViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = useState(false);

  const onSelectRef = useRef(onSelectBuilding);
  const onSceneChangeRef = useRef(onSceneChange);
  onSelectRef.current = onSelectBuilding;
  onSceneChangeRef.current = onSceneChange;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!isWebGLSupported()) {
      setWebglError(true);
      return;
    }

    const statsEnabled = import.meta.env.DEV || Boolean(renderStats);
    const scene = new CampusScene(
      el,
      dataset,
      config,
      {
        onSelectBuilding: (id, wingId) => onSelectRef.current(id, wingId),
      },
      {
        initialCamera,
        freeCamera,
        ...(selectionLook ? { selectionLook } : {}),
        ...(statsEnabled ? { onRenderStats: publishRenderStats } : {}),
      },
    );
    sceneRef.current = scene;
    onSceneChangeRef.current(scene);

    // 最初の描画は次のフレーム（requestAnimationFrame）なので、ここで置けば描画の重さも受け取れる
    if (statsEnabled) {
      (window as KumWindow).__kum = {
        getCameraParam: () => scene.getCameraParam(),
      };
    }

    return () => {
      if (statsEnabled) {
        delete (window as KumWindow).__kum;
        clearRenderStats();
      }
      onSceneChangeRef.current(null);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [dataset, config, sceneRef, initialCamera, freeCamera, renderStats, selectionLook]);

  useEffect(() => {
    sceneRef.current?.setHighlightState(selectedId, activeCategory, selectedWingId);
  }, [selectedId, selectedWingId, activeCategory, sceneRef]);

  useEffect(() => {
    sceneRef.current?.setRoute(activeRoute);
  }, [activeRoute, sceneRef]);

  useEffect(() => {
    sceneRef.current?.setLightingTheme(lighting);
  }, [lighting, sceneRef]);

  useEffect(() => {
    sceneRef.current?.setRoofColorMode(roofColorMode);
  }, [roofColorMode, sceneRef, dataset]);

  if (webglError) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-[#EFECE4] p-6 text-center">
        <div className="max-w-md rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2] p-6 shadow-md">
          <h2 className="text-base font-bold text-[#1D2430]">
            3D表示（WebGL）を利用できません
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-[#5F6875]">
            お使いのブラウザ環境で WebGL が無効になっているようです。別のブラウザでお試しいただくか、ハードウェアアクセラレーションを有効にしてください。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[100dvh] w-full touch-none cursor-grab active:cursor-grabbing"
    />
  );
}

