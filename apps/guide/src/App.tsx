import { MapPinned } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CampusScene,
  findRoute,
  getCampusConfig,
  loadCampusDataset,
  parseCameraParam,
  type BuildingCategory,
  type BuildingFeature,
  type CameraPose,
  type CampusDataset,
  type LightingTheme,
  type LocationSearchItem,
  type ProjectedLabel,
  type RouteMode,
} from '@kansai-u-3d/core';
import { BuildingSheet } from './components/BuildingSheet';
import { CampusViewport } from './components/CampusViewport';
import { CategoryChips } from './components/CategoryChips';
import { CreditsModal } from './components/CreditsModal';
import { LandmarkLabelsOverlay } from './components/LandmarkLabelsOverlay';
import type { RouteEndpointSelection } from './components/LocationPicker';
import { RoutePanel } from './components/RoutePanel';
import { SearchBar } from './components/SearchBar';
import { PresetStrip, TopActionButtons } from './components/ViewControls';
import { SENRIYAMA_FLOOR_PLANS } from './data/indoor/senriyama-indoor';

interface GuideUrlParams {
  initialCamera?: CameraPose;
  hideUi: boolean;
}

function parseGuideUrlParams(): GuideUrlParams {
  if (typeof window === 'undefined') {
    return { hideUi: false };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    initialCamera: parseCameraParam(params.get('cam')),
    hideUi: params.get('ui') === '0',
  };
}

export function App() {
  const config = useMemo(() => getCampusConfig('senriyama'), []);
  const urlParams = useMemo(() => parseGuideUrlParams(), []);
  const sceneRef = useRef<CampusScene | null>(null);

  const [dataset, setDataset] = useState<CampusDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [initialSheetFloor, setInitialSheetFloor] = useState<number | undefined>(
    undefined,
  );
  const [activeCategory, setActiveCategory] = useState<BuildingCategory | 'all'>(
    'all',
  );
  const [lighting, setLighting] = useState<LightingTheme>('day');
  const [showLabels, setShowLabels] = useState(true);
  const [activePresetId, setActivePresetId] = useState(
    config.cameraPresets[0]?.id ?? 'overview',
  );
  const [creditsOpen, setCreditsOpen] = useState(false);

  const [routeOpen, setRouteOpen] = useState(false);
  const [originSelection, setOriginSelection] = useState<RouteEndpointSelection>({
    buildingId: 'kandaimae-station',
  });
  const [destSelection, setDestSelection] = useState<RouteEndpointSelection>({
    buildingId: 'rimpukan',
  });
  const [routeMode, setRouteMode] = useState<RouteMode>('gentle');
  const [pickingTarget, setPickingTarget] = useState<'origin' | 'dest' | null>(
    null,
  );

  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const [viewport, setViewport] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  });

  useEffect(() => {
    let cancelled = false;
    loadCampusDataset('senriyama')
      .then((data) => {
        if (!cancelled) setDataset(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'データの読み込みに失敗しました',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const buildingMap = useMemo(() => {
    const map = new Map<string, BuildingFeature>();
    if (dataset) {
      for (const b of dataset.buildings) {
        map.set(b.id, b);
      }
    }
    return map;
  }, [dataset]);

  const selectedBuilding = useMemo(
    () => (selectedId ? (buildingMap.get(selectedId) ?? null) : null),
    [buildingMap, selectedId],
  );

  const activeRoute = useMemo(() => {
    if (!dataset || !routeOpen) return null;
    const fromB = buildingMap.get(originSelection.buildingId);
    const toB = buildingMap.get(destSelection.buildingId);
    if (!fromB || !toB || fromB.id === toB.id) return null;

    const fromNodeId =
      routeMode === 'step-free' ? fromB.accessibleWalkNodeId : fromB.walkNodeId;
    const toNodeId =
      routeMode === 'step-free' ? toB.accessibleWalkNodeId : toB.walkNodeId;

    if (!fromNodeId || !toNodeId) return null;

    return findRoute(
      dataset.walkGraph,
      fromNodeId,
      toNodeId,
      routeMode,
      fromB.id,
      toB.id,
    );
  }, [dataset, buildingMap, routeOpen, originSelection, destSelection, routeMode]);

  const handleSelectBuilding = useCallback(
    (buildingId: string | null) => {
      if (pickingTarget && buildingId) {
        const picked = buildingMap.get(buildingId);
        if (picked?.walkNodeId) {
          if (pickingTarget === 'origin') {
            setOriginSelection({ buildingId });
          } else {
            setDestSelection({ buildingId });
          }
          setPickingTarget(null);
          return;
        }
      }

      setInitialSheetFloor(undefined);
      setSelectedId(buildingId);
      if (buildingId) {
        const b = buildingMap.get(buildingId);
        if (b) {
          sceneRef.current?.focusBuilding(b);
        }
      }
    },
    [buildingMap, pickingTarget],
  );

  const handleSelectSearchLocation = useCallback(
    (item: LocationSearchItem) => {
      setSelectedId(item.buildingId);
      setInitialSheetFloor(item.floor);
      const b = buildingMap.get(item.buildingId);
      if (b) {
        sceneRef.current?.focusBuilding(b);
      }
    },
    [buildingMap],
  );

  const handleSelectPreset = useCallback((presetId: string) => {
    setActivePresetId(presetId);
    sceneRef.current?.flyToPreset(presetId);
  }, []);

  const handleNavigateTo = useCallback((b: BuildingFeature) => {
    setDestSelection({ buildingId: b.id });
    setRouteOpen(true);
    setPickingTarget(null);
    if (window.innerWidth < 768) {
      setSelectedId(null);
    }
  }, []);

  const handleSetAsOrigin = useCallback((b: BuildingFeature) => {
    setOriginSelection({ buildingId: b.id });
    setRouteOpen(true);
    setPickingTarget(null);
    if (window.innerWidth < 768) {
      setSelectedId(null);
    }
  }, []);

  const handleSwapRouteEndpoints = useCallback(() => {
    setOriginSelection((prevOrigin) => {
      setDestSelection(prevOrigin);
      return destSelection;
    });
  }, [destSelection]);

  const handleJumpToBuilding = useCallback(
    (targetId: string) => {
      setInitialSheetFloor(undefined);
      setSelectedId(targetId);
      const b = buildingMap.get(targetId);
      if (b) {
        sceneRef.current?.focusBuilding(b);
      }
    },
    [buildingMap],
  );

  if (loadError) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#EFECE4] p-6">
        <div className="max-w-md rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2] p-6 text-center shadow-lg">
          <h1 className="text-base font-bold text-[#1D2430]">
            キャンパスデータの読込に失敗しました
          </h1>
          <p className="mt-2 text-xs text-[#666F7B]">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#EFECE4] select-none">
      {dataset ? (
        <CampusViewport
          dataset={dataset}
          config={config}
          selectedId={selectedId}
          activeCategory={activeCategory}
          activeRoute={activeRoute}
          lighting={lighting}
          initialCamera={urlParams.initialCamera}
          onSelectBuilding={handleSelectBuilding}
          onLabelsUpdate={setLabels}
          sceneRef={sceneRef}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-3 border-[#DDD6C8] border-t-[#1B365D]" />
          <p className="text-[13px] font-semibold text-[#4B5360]">
            千里山キャンパスの標高地形と3D校舎を読み込み中…
          </p>
        </div>
      )}

      {!urlParams.hideUi && (
        <>
        {dataset && (
          <LandmarkLabelsOverlay
            labels={labels}
            visible={showLabels}
            selectedId={selectedId}
            routeEndpointIds={
              routeOpen ? [originSelection.buildingId, destSelection.buildingId] : []
            }
            viewportWidth={viewport.width}
            viewportHeight={viewport.height}
            hasLeftCard={routeOpen}
            hasRightCard={Boolean(selectedBuilding)}
            onSelect={handleSelectBuilding}
          />
        )}

        {/* Top HUD */}
        <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex flex-col gap-2 px-3 pt-3 sm:px-5 sm:pt-4">
          <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2]/94 px-3 py-1.5 shadow-sm backdrop-blur-md">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1B365D] text-[#FAF7F2]">
                <MapPinned className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <h1 className="text-[13.5px] font-bold leading-tight text-[#1D2430]">
                    {config.name} 3D
                  </h1>
                  <span className="text-[10px] font-medium text-[#666F7B]">
                    非公式
                  </span>
                </div>
                <p className="hidden text-[10px] font-medium text-[#666F7B] sm:block">
                  {config.subtitle}
                </p>
              </div>
            </div>

            {dataset && (
              <div className="order-3 w-full sm:order-2 sm:w-auto sm:min-w-[290px] sm:flex-1 sm:max-w-md">
                <SearchBar
                  buildings={dataset.buildings}
                  floorPlans={SENRIYAMA_FLOOR_PLANS}
                  activeCategory={activeCategory}
                  onSelectLocation={handleSelectSearchLocation}
                />
              </div>
            )}

            <div className="order-2 sm:order-3">
              <TopActionButtons
                lighting={lighting}
                showLabels={showLabels}
                routeOpen={routeOpen}
                onToggleLighting={() =>
                  setLighting((prev) => (prev === 'day' ? 'golden' : 'day'))
                }
                onToggleLabels={() => setShowLabels((prev) => !prev)}
                onToggleRoute={() => {
                  setRouteOpen((prev) => !prev);
                  setPickingTarget(null);
                }}
                onResetNorth={() => sceneRef.current?.resetNorth()}
                onOpenCredits={() => setCreditsOpen(true)}
              />
            </div>
          </div>

          <div className="pointer-events-auto">
            <CategoryChips
              activeCategory={activeCategory}
              onChange={(cat) => setActiveCategory(cat)}
            />
          </div>
        </header>

        {/* Bottom Camera Presets */}
        {!selectedBuilding && !routeOpen && (
          <div className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex justify-center px-3 sm:bottom-5">
            <div className="pointer-events-auto max-w-full">
              <PresetStrip
                presets={config.cameraPresets}
                activePresetId={activePresetId}
                onSelectPreset={handleSelectPreset}
              />
            </div>
          </div>
        )}

        {dataset && (
          <RoutePanel
            open={routeOpen}
            buildings={dataset.buildings}
            floorPlans={SENRIYAMA_FLOOR_PLANS}
            originSelection={originSelection}
            destSelection={destSelection}
            mode={routeMode}
            pickingTarget={pickingTarget}
            route={activeRoute}
            onChangeOrigin={setOriginSelection}
            onChangeDest={setDestSelection}
            onSwap={handleSwapRouteEndpoints}
            onChangeMode={setRouteMode}
            onStartMapPick={(target) => setPickingTarget(target)}
            onCancelMapPick={() => setPickingTarget(null)}
            onClose={() => {
              setRouteOpen(false);
              setPickingTarget(null);
            }}
          />
        )}

        {dataset && (
          <BuildingSheet
            building={selectedBuilding}
            floorPlan={
              selectedBuilding ? SENRIYAMA_FLOOR_PLANS[selectedBuilding.id] : undefined
            }
            initialFloor={initialSheetFloor}
            allBuildings={dataset.buildings}
            onClose={() => setSelectedId(null)}
            onFocusBuilding={(b) => sceneRef.current?.focusBuilding(b)}
            onNavigateTo={handleNavigateTo}
            onSetAsOrigin={handleSetAsOrigin}
            onJumpToBuildingId={handleJumpToBuilding}
          />
        )}

        <CreditsModal
          open={creditsOpen}
          meta={dataset?.meta ?? null}
          onClose={() => setCreditsOpen(false)}
        />
        </>
      )}
    </div>
  );
}

