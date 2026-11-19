import { useEffect, useRef, useState } from 'react';
import type {
  BuildingCategory,
  CampusConfig,
  CampusDataset,
  LightingTheme,
  ProjectedLabel,
  RouteResult,
} from '@/domain/types';
import { CampusScene } from '@/scene/CampusScene';

interface CampusViewportProps {
  dataset: CampusDataset;
  config: CampusConfig;
  selectedId: string | null;
  activeCategory: BuildingCategory | 'all';
  activeRoute: RouteResult | null;
  lighting: LightingTheme;
  onSelectBuilding: (buildingId: string | null) => void;
  onLabelsUpdate: (labels: ProjectedLabel[]) => void;
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
  onSelectBuilding,
  onLabelsUpdate,
  sceneRef,
}: CampusViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = useState(false);

  const onSelectRef = useRef(onSelectBuilding);
  const onLabelsRef = useRef(onLabelsUpdate);
  onSelectRef.current = onSelectBuilding;
  onLabelsRef.current = onLabelsUpdate;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!isWebGLSupported()) {
      setWebglError(true);
      return;
    }

    const scene = new CampusScene(el, dataset, config, {
      onSelectBuilding: (id) => onSelectRef.current(id),
      onLabelsUpdate: (labels) => onLabelsRef.current(labels),
    });
    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [dataset, config, sceneRef]);

  useEffect(() => {
    sceneRef.current?.setHighlightState(selectedId, activeCategory);
  }, [selectedId, activeCategory, sceneRef]);

  useEffect(() => {
    sceneRef.current?.setRoute(activeRoute);
  }, [activeRoute, sceneRef]);

  useEffect(() => {
    sceneRef.current?.setLightingTheme(lighting);
  }, [lighting, sceneRef]);

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
      className="h-[100dvh] w-full touch-none select-none overflow-hidden"
      aria-label="関西大学 千里山キャンパス 3Dマップビューポート"
    />
  );
}
