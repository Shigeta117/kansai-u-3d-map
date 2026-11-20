import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CampusScene,
  findRoute,
  findWing,
  getCampusConfig,
  loadCampusDataset,
  parseCameraParam,
  type BuildingCategory,
  type BuildingFeature,
  type CameraPose,
  type CampusDataset,
  type LightingTheme,
  type RoofColorMode,
  type LocationSearchItem,
  type RouteMode,
} from '@kansai-u-3d/core';
import { BuildingSheet } from './components/BuildingSheet';
import type { SheetSnap } from './components/bottomSheetSnap';
import { CampusViewport } from './components/CampusViewport';
import { CreditsModal } from './components/CreditsModal';
import { LandmarkLabelsOverlay } from './components/LandmarkLabelsOverlay';
import type { RouteEndpointSelection } from './components/LocationPicker';
import { MenuPanel } from './components/MenuPanel';
import { RoutePanel } from './components/RoutePanel';
import { SearchBar } from './components/SearchBar';
import { MapSideControls } from './components/ViewControls';
import { SENRIYAMA_FLOOR_PLANS } from './data/indoor/senriyama-indoor';

interface GuideUrlParams {
  initialCamera?: CameraPose;
  hideUi: boolean;
  freeCamera: boolean;
  roofColorMode: RoofColorMode;
  /** 描画の重さ（描画命令・三角形）を DOM に出す（URL の stats=1） */
  renderStats: boolean;
}

function parseGuideUrlParams(): GuideUrlParams {
  if (typeof window === 'undefined') {
    return { hideUi: false, freeCamera: false, roofColorMode: 'aerial', renderStats: false };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    initialCamera: parseCameraParam(params.get('cam')),
    hideUi: params.get('ui') === '0',
    freeCamera: params.get('free') === '1',
    roofColorMode: params.get('roof') === 'area' ? 'area' : 'aerial',
    renderStats: params.get('stats') === '1',
  };
}

export function App() {
  const config = useMemo(() => getCampusConfig('senriyama'), []);
  const urlParams = useMemo(() => parseGuideUrlParams(), []);
  const sceneRef = useRef<CampusScene | null>(null);
  const [scene, setScene] = useState<CampusScene | null>(null);

  const [dataset, setDataset] = useState<CampusDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 建物の中の棟（第3学舎の A〜D棟など）。選んでいれば、その棟だけを光らせ、建物シートをその棟に絞る
  const [selectedWingId, setSelectedWingId] = useState<string | null>(null);
  const [initialSheetFloor, setInitialSheetFloor] = useState<number | undefined>(
    undefined,
  );
  // 建物シートを開いたときのタブ（棟の名前で検索したら「フロア・教室」）
  const [initialSheetTab, setInitialSheetTab] = useState<'floors' | undefined>(undefined);
  // スマホのシートを開いたときの段。地図で選んだら低い段（地図を見せたまま）、検索や「ここへ行く」以外は中の段
  const [buildingSheetSnap, setBuildingSheetSnap] = useState<SheetSnap>('half');
  const [routeSheetSnap, setRouteSheetSnap] = useState<SheetSnap>('half');
  // スマホのシートが地図を覆っている高さ（ラベルをその上だけに出す）
  const [buildingSheetHeight, setBuildingSheetHeight] = useState(0);
  const [routeSheetHeight, setRouteSheetHeight] = useState(0);
  const [activeCategory, setActiveCategory] = useState<BuildingCategory | 'all'>(
    'all',
  );
  const [lighting, setLighting] = useState<LightingTheme>('day');
  const [roofColorMode, setRoofColorMode] = useState<RoofColorMode>(urlParams.roofColorMode);
  const [showLabels, setShowLabels] = useState(true);
  const [activePresetId, setActivePresetId] = useState(
    config.cameraPresets[0]?.id ?? 'overview',
  );
  const [menuOpen, setMenuOpen] = useState(false);
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
  const selectedWing = useMemo(
    () => findWing(selectedBuilding, selectedWingId),
    [selectedBuilding, selectedWingId],
  );

  const routeEndpointIds = useMemo(
    () =>
      routeOpen ? [originSelection.buildingId, destSelection.buildingId] : [],
    [routeOpen, originSelection.buildingId, destSelection.buildingId],
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
    (buildingId: string | null, wingId?: string | null) => {
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
      setInitialSheetTab(undefined);
      setBuildingSheetSnap('peek');
      setSelectedId(buildingId);
      setSelectedWingId(wingId ?? null);
      if (buildingId) {
        const b = buildingMap.get(buildingId);
        if (b) {
          sceneRef.current?.focusBuilding(b, wingId ?? null);
        }
      }
    },
    [buildingMap, pickingTarget],
  );

  const handleSelectSearchLocation = useCallback(
    (item: LocationSearchItem) => {
      setSelectedId(item.buildingId);
      setSelectedWingId(item.wingId ?? null);
      setInitialSheetFloor(item.floor);
      setInitialSheetTab(item.kind === 'building' && item.wingId ? 'floors' : undefined);
      setBuildingSheetSnap('half');
      const b = buildingMap.get(item.buildingId);
      if (b) {
        sceneRef.current?.focusBuilding(b, item.wingId ?? null);
      }
    },
    [buildingMap],
  );

  const handleSelectPreset = useCallback((presetId: string) => {
    setActivePresetId(presetId);
    sceneRef.current?.flyToPreset(presetId);
  }, []);

  // 経路は建物の入口まで（棟を選んでいても建物の入口へ。棟ごとの入口は館内の計画の L1 で足す）
  const handleNavigateTo = useCallback((b: BuildingFeature) => {
    setDestSelection({ buildingId: b.id });
    setRouteSheetSnap('peek');
    setRouteOpen(true);
    setPickingTarget(null);
    if (window.innerWidth < 768) {
      setSelectedId(null);
      setSelectedWingId(null);
    }
  }, []);

  const handleSetAsOrigin = useCallback((b: BuildingFeature) => {
    setOriginSelection({ buildingId: b.id });
    setRouteSheetSnap('half');
    setRouteOpen(true);
    setPickingTarget(null);
    if (window.innerWidth < 768) {
      setSelectedId(null);
      setSelectedWingId(null);
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
      setInitialSheetTab(undefined);
      setBuildingSheetSnap('half');
      setSelectedId(targetId);
      setSelectedWingId(null);
      const b = buildingMap.get(targetId);
      if (b) {
        sceneRef.current?.focusBuilding(b);
      }
    },
    [buildingMap],
  );

  const handleCloseMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

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

  const hasBottomSheet = Boolean(selectedBuilding) || routeOpen;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#EFECE4] select-none">
      {dataset ? (
        <CampusViewport
          dataset={dataset}
          config={config}
          selectedId={selectedId}
          selectedWingId={selectedWing?.id ?? null}
          activeCategory={activeCategory}
          activeRoute={activeRoute}
          lighting={lighting}
          roofColorMode={roofColorMode}
          initialCamera={urlParams.initialCamera}
          freeCamera={urlParams.freeCamera}
          renderStats={urlParams.renderStats}
          onSelectBuilding={handleSelectBuilding}
          onSceneChange={setScene}
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
          <LandmarkLabelsOverlay
            scene={scene}
            visible={showLabels}
            selectedId={selectedId}
            routeEndpointIds={routeEndpointIds}
            hasLeftCard={routeOpen}
            hasRightCard={Boolean(selectedBuilding)}
            sheetInset={Math.max(buildingSheetHeight, routeSheetHeight)}
            onSelect={handleSelectBuilding}
          />

          {/* Floating Search Bar */}
          <div className="pointer-events-none fixed inset-x-0 top-0 z-30 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:pt-4">
            <div className="pointer-events-auto w-full sm:max-w-[400px]">
              <SearchBar
                buildings={dataset?.buildings ?? []}
                floorPlans={SENRIYAMA_FLOOR_PLANS}
                activeCategory={activeCategory}
                routeOpen={routeOpen}
                menuOpen={menuOpen}
                onChangeCategory={setActiveCategory}
                onSelectLocation={handleSelectSearchLocation}
                onOpenMenu={() => setMenuOpen(true)}
                onToggleRoute={() => {
                  setRouteSheetSnap('half');
                  setRouteOpen((prev) => !prev);
                  setPickingTarget(null);
                }}
              />
            </div>
          </div>

          {/* Right-side vertical round controls */}
          <MapSideControls
            presets={config.cameraPresets}
            activePresetId={activePresetId}
            hasBottomSheet={hasBottomSheet}
            onResetNorth={() => sceneRef.current?.resetNorth()}
            onSelectPreset={handleSelectPreset}
          />

          {/* Bottom-left compact attribution */}
          {!routeOpen && (
            <div
              className={`pointer-events-auto fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-20 rounded-md border border-[#DDD6C8]/75 bg-[#FAF7F2]/80 px-2 py-0.5 text-[10px] font-medium text-[#5F6875] backdrop-blur-xs sm:bottom-4 sm:left-5 ${
                selectedBuilding ? 'hidden sm:block' : ''
              }`}
            >
              <span>非公式 ・ </span>
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#1B365D] hover:underline"
              >
                © OpenStreetMap contributors
              </a>
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
              initialSnap={routeSheetSnap}
              onSheetHeightChange={setRouteSheetHeight}
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
                selectedBuilding
                  ? SENRIYAMA_FLOOR_PLANS[selectedBuilding.id]
                  : undefined
              }
              wing={selectedWing}
              initialFloor={initialSheetFloor}
              initialTab={initialSheetTab}
              initialSnap={buildingSheetSnap}
              onSheetHeightChange={setBuildingSheetHeight}
              allBuildings={dataset.buildings}
              onClose={() => {
                setSelectedId(null);
                setSelectedWingId(null);
              }}
              onSelectWing={setSelectedWingId}
              onFocusBuilding={(b) => sceneRef.current?.focusBuilding(b, selectedWing?.id ?? null)}
              onNavigateTo={handleNavigateTo}
              onSetAsOrigin={handleSetAsOrigin}
              onJumpToBuildingId={handleJumpToBuilding}
            />
          )}

          <MenuPanel
            open={menuOpen}
            campusName={config.name}
            lighting={lighting}
            showLabels={showLabels}
            onChangeLighting={setLighting}
            roofColorMode={roofColorMode}
            onChangeRoofColorMode={setRoofColorMode}
            onToggleLabels={() => setShowLabels((prev) => !prev)}
            onOpenCredits={() => setCreditsOpen(true)}
            onClose={handleCloseMenu}
          />

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
