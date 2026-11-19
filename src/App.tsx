import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BuildingSheet } from './components/BuildingSheet';
import { CampusViewport } from './components/CampusViewport';
import { CategoryChips } from './components/CategoryChips';
import { CreditsModal } from './components/CreditsModal';
import { LandmarkLabelsOverlay } from './components/LandmarkLabelsOverlay';
import { RoutePanel } from './components/RoutePanel';
import { SearchBar } from './components/SearchBar';
import { PresetStrip, TopActionButtons } from './components/ViewControls';
import { loadCampusDataset } from './data/loadCampusData';
import { getCampusConfig } from './domain/campus-registry';
import { findRoute } from './domain/routing';
import { searchBuildings } from './domain/search';
import type {
  BuildingCategory,
  BuildingFeature,
  CampusDataset,
  LightingTheme,
  ProjectedLabel,
  RouteMode,
} from './domain/types';
import type { CampusScene } from './scene/CampusScene';

export function App() {
  const config = useMemo(() => getCampusConfig('senriyama'), []);
  const sceneRef = useRef<CampusScene | null>(null);

  const [dataset, setDataset] = useState<CampusDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<BuildingCategory | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lighting, setLighting] = useState<LightingTheme>('day');
  const [showLabels, setShowLabels] = useState(true);
  const [activePresetId, setActivePresetId] = useState<string>('overview');
  const [creditsOpen, setCreditsOpen] = useState(false);

  const [routeOpen, setRouteOpen] = useState(false);
  const [routeFromId, setRouteFromId] = useState('kandaimae-station');
  const [routeToId, setRouteToId] = useState('area1-1');
  const [routeMode, setRouteMode] = useState<RouteMode>('shortest');

  const [projectedLabels, setProjectedLabels] = useState<ProjectedLabel[]>([]);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  useEffect(() => {
    let active = true;
    loadCampusDataset('senriyama')
      .then((data) => {
        if (!active) return;
        setDataset(data);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const buildingMap = useMemo(() => {
    const map = new Map<string, BuildingFeature>();
    if (!dataset) return map;
    for (const b of dataset.buildings) {
      map.set(b.id, b);
    }
    return map;
  }, [dataset]);

  const searchResults = useMemo(() => {
    if (!dataset) return [];
    return searchBuildings(dataset.buildings, query, activeCategory);
  }, [dataset, query, activeCategory]);

  const landmarkList = useMemo(() => {
    if (!dataset) return [];
    return dataset.buildings
      .filter((b) => Boolean(b.landmarkId))
      .sort((a, b) => a.labelPriority - b.labelPriority);
  }, [dataset]);

  const selectedBuilding = useMemo(
    () => (selectedId ? buildingMap.get(selectedId) ?? null : null),
    [selectedId, buildingMap],
  );

  const activeRoute = useMemo(() => {
    if (!routeOpen || !dataset) return null;
    const fromB = buildingMap.get(routeFromId);
    const toB = buildingMap.get(routeToId);
    if (!fromB?.walkNodeId || !toB?.walkNodeId) return null;
    return findRoute(
      dataset.walkGraph,
      fromB.walkNodeId,
      toB.walkNodeId,
      routeMode,
      fromB.id,
      toB.id,
    );
  }, [routeOpen, dataset, buildingMap, routeFromId, routeToId, routeMode]);

  const handleSelectBuildingById = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id) {
        const b = buildingMap.get(id);
        if (b) {
          sceneRef.current?.focusBuilding(b);
        }
      }
    },
    [buildingMap],
  );

  const handleSelectBuilding = useCallback((b: BuildingFeature) => {
    setSelectedId(b.id);
    sceneRef.current?.focusBuilding(b);
  }, []);

  const handleRouteTo = useCallback((b: BuildingFeature) => {
    setRouteToId(b.id);
    if (b.id === routeFromId) {
      setRouteFromId(b.id === 'kandaimae-station' ? 'main-gate' : 'kandaimae-station');
    }
    setRouteOpen(true);
    // On mobile, close BuildingSheet so RoutePanel has clean view
    if (window.innerWidth < 768) {
      setSelectedId(null);
    }
  }, [routeFromId]);

  const handleRouteFrom = useCallback((b: BuildingFeature) => {
    setRouteFromId(b.id);
    if (b.id === routeToId) {
      setRouteToId(b.id === 'area1-1' ? 'rimpukan' : 'area1-1');
    }
    setRouteOpen(true);
    if (window.innerWidth < 768) {
      setSelectedId(null);
    }
  }, [routeToId]);

  const handleSwapRoute = useCallback(() => {
    setRouteFromId(routeToId);
    setRouteToId(routeFromId);
  }, [routeFromId, routeToId]);

  const handleSelectPreset = useCallback((presetId: string) => {
    setActivePresetId(presetId);
    sceneRef.current?.flyToPreset(presetId);
  }, []);

  const handleToggleRoute = useCallback(() => {
    setRouteOpen((prev) => {
      const next = !prev;
      if (next && window.innerWidth < 768) {
        setSelectedId(null);
      }
      return next;
    });
  }, []);

  const isMobile = viewportSize.width < 768;
  const showBuildingSheet = Boolean(selectedBuilding) && !(isMobile && routeOpen);

  if (loadError) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-[#EFECE4] p-6">
        <div className="max-w-md rounded-2xl border border-[#E6C7A3] bg-[#FAF7F2] p-6 shadow-md">
          <h1 className="text-base font-bold text-[#8E3A24]">
            キャンパスデータの読み込みに失敗しました
          </h1>
          <p className="mt-2 text-xs text-[#5F6875]">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-3 bg-[#EFECE4]">
        <div className="h-9 w-9 animate-spin rounded-full border-3 border-[#1B365D]/20 border-t-[#1B365D]" />
        <div className="text-center">
          <p className="text-sm font-bold text-[#1B365D]">
            関西大学 千里山キャンパス 3Dジオラマ
          </p>
          <p className="mt-0.5 text-xs text-[#666F7B]">
            DEM5A標高地形と建物モデルを読み込み中…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <CampusViewport
        dataset={dataset}
        config={config}
        selectedId={selectedId}
        activeCategory={activeCategory}
        activeRoute={activeRoute}
        lighting={lighting}
        onSelectBuilding={handleSelectBuildingById}
        onLabelsUpdate={setProjectedLabels}
        sceneRef={sceneRef}
      />

      {/* Interactive 3D->2D Landmark Pins */}
      <LandmarkLabelsOverlay
        labels={projectedLabels}
        visible={showLabels}
        selectedId={selectedId}
        routeEndpointIds={routeOpen ? [routeFromId, routeToId] : []}
        viewportWidth={viewportSize.width}
        viewportHeight={viewportSize.height}
        hasLeftCard={showBuildingSheet}
        hasRightCard={routeOpen}
        onSelect={handleSelectBuildingById}
      />

      {/* Top Navigation & Search Header */}
      <header className="pointer-events-none fixed inset-x-3 top-3 z-20 flex flex-col gap-2 md:inset-x-4">
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-initial">
            <div className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[#DDD6C8] bg-[#1B365D] px-3 text-[#FAF7F2] shadow-sm">
              <span className="h-2.5 w-2.5 rounded-full bg-[#E8A54B]" />
              <div className="leading-none">
                <div className="text-[12.5px] font-bold tracking-tight">
                  関大 千里山 3D
                </div>
                <div className="hidden text-[9.5px] font-medium text-[#D6DFEC] sm:block">
                  Kansai Univ. Diorama Map
                </div>
              </div>
            </div>

            <div className="hidden md:block">
              <SearchBar
                query={query}
                onQueryChange={setQuery}
                results={searchResults}
                onSelectBuilding={handleSelectBuilding}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden xl:block">
              <PresetStrip
                presets={config.cameraPresets}
                activePresetId={activePresetId}
                onSelectPreset={handleSelectPreset}
              />
            </div>
            <TopActionButtons
              lighting={lighting}
              showLabels={showLabels}
              routeOpen={routeOpen}
              onToggleLighting={() =>
                setLighting((prev) => (prev === 'day' ? 'golden' : 'day'))
              }
              onToggleLabels={() => setShowLabels((prev) => !prev)}
              onToggleRoute={handleToggleRoute}
              onOpenCredits={() => setCreditsOpen(true)}
            />
          </div>
        </div>

        {/* Mobile SearchRow */}
        <div className="pointer-events-auto md:hidden">
          <SearchBar
            query={query}
            onQueryChange={setQuery}
            results={searchResults}
            onSelectBuilding={handleSelectBuilding}
          />
        </div>

        {/* Category Filter Strip */}
        <div className="pointer-events-auto">
          <CategoryChips
            activeCategory={activeCategory}
            onChange={(cat) => setActiveCategory(cat)}
          />
        </div>
      </header>

      {/* Bottom Camera Presets Dock (when not covered by mobile sheet, and on <xl screens) */}
      {!(isMobile && (showBuildingSheet || routeOpen)) && (
        <div className="pointer-events-none fixed bottom-3 inset-x-3 z-20 flex justify-center xl:hidden">
          <div className="pointer-events-auto max-w-full">
            <PresetStrip
              presets={config.cameraPresets}
              activePresetId={activePresetId}
              onSelectPreset={handleSelectPreset}
            />
          </div>
        </div>
      )}

      {/* Building Detail Card / Sheet */}
      {showBuildingSheet && selectedBuilding && (
        <BuildingSheet
          building={selectedBuilding}
          onClose={() => setSelectedId(null)}
          onFocus={(b) => sceneRef.current?.focusBuilding(b)}
          onRouteTo={handleRouteTo}
          onRouteFrom={handleRouteFrom}
        />
      )}

      {/* Route Navigation Panel */}
      {routeOpen && (
        <RoutePanel
          landmarks={landmarkList}
          fromId={routeFromId}
          toId={routeToId}
          mode={routeMode}
          route={activeRoute}
          onChangeFrom={setRouteFromId}
          onChangeTo={setRouteToId}
          onSwap={handleSwapRoute}
          onChangeMode={setRouteMode}
          onClose={() => setRouteOpen(false)}
        />
      )}

      {/* OSS Attribution & Data Sources Modal */}
      <CreditsModal
        open={creditsOpen}
        meta={dataset.meta}
        onClose={() => setCreditsOpen(false)}
      />
    </div>
  );
}

export default App;
