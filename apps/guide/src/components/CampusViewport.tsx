import { useEffect, useRef, useState } from 'react';
import {
  CampusScene,
  type BuildingCategory,
  type CameraPose,
  type CampusConfig,
  type CampusDataset,
  type LightingTheme,
  type RoofColorMode,
  type RouteResult,
} from '@kansai-u-3d/core';

type KumWindow = Window & {
  __kum?: {
    getCameraParam: () => string;
  };
};

interface CampusViewportProps {
  dataset: CampusDataset;
  config: CampusConfig;
  selectedId: string | null;
  activeCategory: BuildingCategory | 'all';
  activeRoute: RouteResult | null;
  lighting: LightingTheme;
  roofColorMode: RoofColorMode;
  initialCamera?: CameraPose;
  freeCamera?: boolean;
  onSelectBuilding: (buildingId: string | null) => void;
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
  activeCategory,
  activeRoute,
  lighting,
  roofColorMode,
  initialCamera,
  freeCamera,
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

    const scene = new CampusScene(
      el,
      dataset,
      config,
      {
        onSelectBuilding: (id) => onSelectRef.current(id),
      },
      {
        initialCamera,
        freeCamera,
      },
    );
    sceneRef.current = scene;
    onSceneChangeRef.current(scene);

    if (import.meta.env.DEV) {
      (window as KumWindow).__kum = {
        getCameraParam: () => scene.getCameraParam(),
      };
    }

    return () => {
      if (import.meta.env.DEV) {
        delete (window as KumWindow).__kum;
      }
      onSceneChangeRef.current(null);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [dataset, config, sceneRef, initialCamera, freeCamera]);

  useEffect(() => {
    sceneRef.current?.setHighlightState(selectedId, activeCategory);
  }, [selectedId, activeCategory, sceneRef]);

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

