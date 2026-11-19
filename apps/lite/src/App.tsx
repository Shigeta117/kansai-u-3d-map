import { Box, Compass, ExternalLink, Layers, MapPinned, Moon, Package, Sun, Tag, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORY_OPTIONS,
  CampusScene,
  getCampusConfig,
  getCategoryLabel,
  loadCampusDataset,
  type BuildingFeature,
  type CampusDataset,
  type CampusDatasetMeta,
  type LightingTheme,
  type ProjectedLabel,
} from '@kansai-u-3d/core';

interface LiteUrlParams {
  embed: boolean;
  initialPresetId: string;
  initialTheme: LightingTheme;
  initialCampusOnly: boolean;
}

function parseUrlParams(defaultPresetId: string): LiteUrlParams {
  if (typeof window === 'undefined') {
    return {
      embed: false,
      initialPresetId: defaultPresetId,
      initialTheme: 'day',
      initialCampusOnly: false,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const embed = params.get('embed') === '1' || params.get('embed') === 'true';
  const preset = params.get('preset') || defaultPresetId;
  const theme: LightingTheme = params.get('theme') === 'golden' ? 'golden' : 'day';
  const initialCampusOnly = params.get('scope') === 'campus';
  return {
    embed,
    initialPresetId: preset,
    initialTheme: theme,
    initialCampusOnly,
  };
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

function useAnimatedModalPresence(open: boolean, exitMs = 150) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (open) {
      setMounted(true);
      if (reduced) {
        setVisible(true);
        return;
      }
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    setVisible(false);
    if (!mounted) return;
    if (reduced) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs, mounted]);

  return { mounted, visible };
}

interface AssetSpecModalProps {
  open: boolean;
  meta: CampusDatasetMeta | null;
  onClose: () => void;
}

function AssetSpecModal({ open, meta, onClose }: AssetSpecModalProps) {
  const { mounted, visible } = useAnimatedModalPresence(open, 150);
  if (!mounted) return null;

  const state = visible ? 'open' : 'closed';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lite-asset-title"
      data-state={state}
      className="t-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[#1D2430]/45 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        data-state={state}
        className="t-modal-card max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#EAE3D6] pb-3">
          <div>
            <h2 id="lite-asset-title" className="text-[16px] font-bold text-[#1D2430]">
              3Dアセット仕様・iframe埋込・出典
            </h2>
            <p className="mt-0.5 text-[11.5px] text-[#666F7B]">
              軽量ビューア・GLB / OBJ モデル配布パック（非公式 / コード: MIT・地図データ: ODbL v1.0）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="モーダルを閉じる"
            className="t-interactive rounded-lg p-1.5 text-[#5F6875] hover:bg-[#EAE3D6]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 space-y-3 text-[12px] leading-relaxed text-[#343C48]">
          <section className="rounded-xl border border-[#DFD5C3] bg-[#FBF6EC] p-3 text-[#2B3340]">
            <p className="font-semibold">
              このアプリは関西大学の公式サービスではありません。関西大学とは関係のない個人が作ったオープンソースのプロジェクトです。
            </p>
          </section>

          <section className="rounded-xl border border-[#E3DDD1] bg-[#F4EFE5] p-3">
            <h3 className="flex items-center gap-1.5 font-bold text-[#1B365D]">
              <Box className="h-4 w-4" />
              <span>配布 3Dファイル（npm run export:3d）</span>
            </h3>
            <ul className="mt-1.5 space-y-1.5 text-[11.5px]">
              <li>
                <code className="rounded bg-white px-1.5 py-0.5 font-semibold text-[#1B365D]">
                  exports/senriyama-campus-only.{'{glb,obj}'}
                </code>
                <span className="ml-1.5 text-[#4B5360]">
                  キャンパス75棟・秀麗橋・新アクセス上屋・地形・緑地のみを収めた軽量版
                </span>
              </li>
              <li>
                <code className="rounded bg-white px-1.5 py-0.5 font-semibold text-[#1B365D]">
                  exports/senriyama-full.{'{glb,obj}'}
                </code>
                <span className="ml-1.5 text-[#4B5360]">
                  周辺街区約2,300棟・阪急千里線まで含めたフルシーン版
                </span>
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-[#5F6875]">
              ノード識別名（例: <code>building-rimpukan</code>、<code>bridge-shurei-west</code>）を保持しているため、Blender・Unity・Three.js 等で建物単位の選択や色変更が容易です。
            </p>
          </section>

          <section className="rounded-xl border border-[#E3DDD1] bg-[#F4EFE5] p-3">
            <h3 className="font-bold text-[#1B365D]">iframe 埋込URLパラメータ</h3>
            <code className="mt-1.5 block overflow-x-auto rounded-lg bg-white px-2.5 py-2 text-[11px] text-[#1D2430]">
              /?embed=1&amp;preset=west-access&amp;theme=golden&amp;scope=campus
            </code>
            <p className="mt-1.5 text-[11px] text-[#5F6875]">
              <code>embed=1</code> でタイトル・モーダルボタンを省略した省スペース表示に切り替わります。
            </p>
          </section>

          <section className="rounded-xl border border-[#E3DDD1] bg-white/75 p-3">
            <h3 className="font-bold text-[#1D2430]">データ出典・ライセンス</h3>
            <p className="mt-1 text-[11.5px]">
              出典：国土地理院 地理院タイル（標高タイル DEM5A）を加工して作成 ／
              Map data © OpenStreetMap contributors (ODbL v1.0) ／{' '}
              <a
                href="https://transitions.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#1B365D] hover:underline"
              >
                transitions.dev
              </a>{' '}
              (GitHub: Jakubantalik/transitions.dev, MIT © Jakub Antalík)
            </p>
            {meta && (
              <div className="tabular-nums mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#5F6875]">
                <span>キャンパス棟: {meta.stats.campusBuildings}</span>
                <span>高架橋: {meta.stats.bridges}</span>
                <span>標高: {meta.stats.minElevation.toFixed(1)}〜{meta.stats.maxElevation.toFixed(1)}m</span>
              </div>
            )}
          </section>

          <div className="flex items-center justify-between pt-1 text-[11px] text-[#666F7B]">
            <span>Google Earth / Street View 等は規約順守のため不使用</span>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-[#1B365D] hover:underline"
            >
              <span>OSM ODbL</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const config = useMemo(() => getCampusConfig('senriyama'), []);
  const urlParams = useMemo(
    () => parseUrlParams(config.cameraPresets[0]?.id ?? 'overview'),
    [config.cameraPresets],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CampusScene | null>(null);

  const [dataset, setDataset] = useState<CampusDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [webglError, setWebglError] = useState(false);

  const [campusOnly, setCampusOnly] = useState(urlParams.initialCampusOnly);
  const [lighting, setLighting] = useState<LightingTheme>(urlParams.initialTheme);
  const [activePresetId, setActivePresetId] = useState(urlParams.initialPresetId);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [specOpen, setSpecOpen] = useState(false);
  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280,
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

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const buildingMap = useMemo(() => {
    const map = new Map<string, BuildingFeature>();
    if (dataset) {
      for (const b of dataset.buildings) map.set(b.id, b);
    }
    return map;
  }, [dataset]);

  const handleSelectBuilding = useCallback(
    (buildingId: string | null) => {
      setSelectedId(buildingId);
      if (buildingId) {
        const b = buildingMap.get(buildingId);
        if (b) sceneRef.current?.focusBuilding(b);
      }
    },
    [buildingMap],
  );

  const onSelectRef = useRef(handleSelectBuilding);
  onSelectRef.current = handleSelectBuilding;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !dataset) return;
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
        onLabelsUpdate: (nextLabels) => setLabels(nextLabels),
      },
      {
        campusOnly,
        initialTheme: lighting,
        initialPresetId: activePresetId,
      },
    );
    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // Intentionally rebuild scene only when dataset, config, or campusOnly changes; lighting/preset update imperatively
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, config, campusOnly]);

  useEffect(() => {
    sceneRef.current?.setLightingTheme(lighting);
  }, [lighting]);

  useEffect(() => {
    sceneRef.current?.setHighlightState(selectedId, 'all');
  }, [selectedId]);

  const selectedBuilding = useMemo(
    () => (selectedId ? (buildingMap.get(selectedId) ?? null) : null),
    [buildingMap, selectedId],
  );

  const visibleLabels = useMemo(() => {
    if (!showLabels || viewportWidth <= 0) return [];
    const maxCount = viewportWidth < 768 ? 5 : 10;
    return [...labels]
      .filter((l) => l.screenY > 72)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, maxCount);
  }, [labels, showLabels, viewportWidth]);

  if (loadError) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#EFECE4] p-6">
        <div className="max-w-md rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2] p-6 text-center shadow-lg">
          <h1 className="text-base font-bold text-[#1D2430]">データ読込エラー</h1>
          <p className="mt-2 text-xs text-[#666F7B]">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#EFECE4] select-none">
      {webglError ? (
        <div className="flex h-full items-center justify-center p-6 text-center">
          <div className="max-w-sm rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2] p-5 shadow-md">
            <p className="text-sm font-bold text-[#1D2430]">
              WebGL が利用できません
            </p>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-full w-full cursor-grab active:cursor-grabbing"
        />
      )}

      {!dataset && !webglError && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#DDD6C8] border-t-[#1B365D]" />
          <p className="text-[12.5px] font-semibold text-[#4B5360]">
            軽量 3Dアセット読み込み中…
          </p>
        </div>
      )}

      {/* Lightweight Projected Labels */}
      {showLabels && visibleLabels.length > 0 && (
        <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
          {visibleLabels.map((lbl) => {
            const isSel = lbl.id === selectedId;
            const dotColor =
              CATEGORY_OPTIONS.find((c) => c.id === lbl.category)?.color ?? '#1B365D';
            return (
              <button
                key={lbl.id}
                type="button"
                onClick={() => handleSelectBuilding(lbl.id)}
                style={{
                  transform: `translate3d(${lbl.screenX.toFixed(1)}px, ${lbl.screenY.toFixed(1)}px, 0) translate(-50%, -100%)`,
                }}
                className={`pointer-events-auto absolute left-0 top-0 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold shadow-sm transition-colors duration-150 ${
                  isSel
                    ? 'border-[#C85A3A] bg-[#C85A3A] text-white'
                    : 'border-[#DDD6C8] bg-[#FAF7F2]/90 text-[#1D2430] hover:bg-white'
                }`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: isSel ? '#FFFFFF' : dotColor }}
                />
                <span className="whitespace-nowrap">{lbl.shortName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Minimal Top Bar */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-3 pt-3 sm:px-5 sm:pt-4">
        {!urlParams.embed ? (
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2]/94 px-3 py-1.5 shadow-sm backdrop-blur-md">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#1B365D] text-white">
              <MapPinned className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <h1 className="text-[13px] font-bold leading-tight text-[#1D2430]">
                  千里山キャンパス 3Dビューア（簡易版）
                </h1>
                <span className="text-[10px] font-medium text-[#666F7B]">
                  非公式
                </span>
              </div>
              <p className="hidden text-[10px] text-[#666F7B] sm:block">
                軽量埋込 &amp; GLB / OBJ 3Dアセット確認モデル
              </p>
            </div>
          </div>
        ) : (
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#DDD6C8] bg-[#FAF7F2]/90 px-2.5 py-1 text-[10.5px] font-bold text-[#1B365D] shadow-xs backdrop-blur-md">
            <MapPinned className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>千里山キャンパス 3D</span>
            <span className="font-medium text-[#666F7B]">非公式</span>
          </div>
        )}

        <div className="pointer-events-auto flex items-center gap-1.5">
          {!urlParams.embed && (
            <button
              type="button"
              onClick={() => setCampusOnly((prev) => !prev)}
              aria-pressed={campusOnly}
              className={`t-interactive flex h-8 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-semibold shadow-sm backdrop-blur-md ${
                campusOnly
                  ? 'border-[#1B365D] bg-[#1B365D] text-white'
                  : 'border-[#DDD6C8] bg-[#FAF7F2]/94 text-[#333B47] hover:bg-[#EFE9DC]'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>{campusOnly ? 'キャンパスのみ' : '周辺含む'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              setLighting((prev) => (prev === 'day' ? 'golden' : 'day'))
            }
            aria-label="照明モード切替"
            className={`t-interactive flex h-8 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-semibold shadow-sm backdrop-blur-md ${
              lighting === 'golden'
                ? 'border-[#D98245] bg-[#FCEBD9] text-[#8E4313]'
                : 'border-[#DDD6C8] bg-[#FAF7F2]/94 text-[#333B47] hover:bg-[#EFE9DC]'
            }`}
          >
            {lighting === 'day' ? (
              <Sun className="h-3.5 w-3.5 text-[#D4882A]" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-[#A85224]" />
            )}
            <span className="hidden sm:inline">{lighting === 'day' ? '昼' : '夕方'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLabels((prev) => !prev)}
            aria-pressed={showLabels}
            aria-label="ピン表示切替"
            className={`t-interactive flex h-8 items-center gap-1 rounded-xl border px-2 text-[11px] font-semibold shadow-sm backdrop-blur-md ${
              showLabels
                ? 'border-[#1B365D] bg-[#1B365D] text-white'
                : 'border-[#DDD6C8] bg-[#FAF7F2]/94 text-[#4B5360] hover:bg-[#EFE9DC]'
            }`}
          >
            <Tag className="h-3.5 w-3.5" />
          </button>

          {!urlParams.embed && (
            <button
              type="button"
              onClick={() => setSpecOpen(true)}
              className="t-interactive flex h-8 items-center gap-1 rounded-xl border border-[#DDD6C8] bg-[#FAF7F2]/94 px-2.5 text-[11px] font-semibold text-[#1B365D] shadow-sm backdrop-blur-md hover:bg-[#EFE9DC]"
            >
              <Package className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">3Dアセット・出典</span>
            </button>
          )}
        </div>
      </header>

      {/* Compact Selected Building Pill */}
      {selectedBuilding && (
        <div
          className={`pointer-events-none fixed inset-x-0 z-20 flex justify-center px-3 ${
            urlParams.embed ? 'bottom-20 sm:bottom-24' : 'bottom-16 sm:bottom-18'
          }`}
        >
          <div className="t-pill pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2]/96 px-3.5 py-2 shadow-xl backdrop-blur-md">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#5F6875]">
                <span>{getCategoryLabel(selectedBuilding.category)}</span>
                <span className="tabular-nums">・標高 {selectedBuilding.groundY.toFixed(1)}m</span>
              </div>
              <div className="truncate text-[13px] font-bold text-[#1D2430]">
                {selectedBuilding.name}
              </div>
            </div>
            <button
              type="button"
              onClick={() => sceneRef.current?.focusBuilding(selectedBuilding)}
              aria-label="この建物を注視"
              className="t-interactive rounded-lg border border-[#DDD6C8] bg-white p-1.5 text-[#1B365D] hover:bg-[#EFE9DC]"
            >
              <Compass className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="選択を解除"
              className="t-interactive rounded-lg p-1 text-[#5F6875] hover:bg-[#EAE3D6]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Camera Presets */}
      <div
        className={`pointer-events-none fixed inset-x-0 z-20 flex justify-center px-3 ${
          urlParams.embed ? 'bottom-8 sm:bottom-9' : 'bottom-3 sm:bottom-4'
        }`}
      >
        <div
          className="no-scrollbar pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2]/94 p-1.5 shadow-lg backdrop-blur-md"
          aria-label="視点プリセット"
        >
          {config.cameraPresets.map((p) => {
            const active = p.id === activePresetId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setActivePresetId(p.id);
                  sceneRef.current?.flyToPreset(p.id);
                }}
                className={`t-interactive shrink-0 rounded-xl px-2.5 py-1 text-[11px] font-semibold ${
                  active
                    ? 'bg-[#1B365D] text-white shadow-xs'
                    : 'text-[#3D4552] hover:bg-[#EAE3D6]'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {urlParams.embed && (
        <div className="pointer-events-auto fixed bottom-1.5 right-2.5 z-20 rounded-md border border-[#DDD6C8]/80 bg-[#FAF7F2]/90 px-2 py-0.5 text-[10px] font-medium text-[#5F6875] backdrop-blur-xs">
          <span>非公式・</span>
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

      <AssetSpecModal
        open={specOpen}
        meta={dataset?.meta ?? null}
        onClose={() => setSpecOpen(false)}
      />
    </div>
  );
}

