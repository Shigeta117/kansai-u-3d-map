import {
  ArrowUpDown,
  Footprints,
  Mountain,
  Route as RouteIcon,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import type { BuildingFeature, RouteMode, RouteResult } from '@/domain/types';
import { ElevationSparkline } from './ElevationSparkline';

interface RoutePanelProps {
  landmarks: BuildingFeature[];
  fromId: string;
  toId: string;
  mode: RouteMode;
  route: RouteResult | null;
  onChangeFrom: (id: string) => void;
  onChangeTo: (id: string) => void;
  onSwap: () => void;
  onChangeMode: (mode: RouteMode) => void;
  onClose: () => void;
}

export function RoutePanel({
  landmarks,
  fromId,
  toId,
  mode,
  route,
  onChangeFrom,
  onChangeTo,
  onSwap,
  onChangeMode,
  onClose,
}: RoutePanelProps) {
  const routable = landmarks.filter((b) => Boolean(b.walkNodeId));
  const quickOrigins = routable.filter((b) => b.isQuickOrigin);

  return (
    <aside
      aria-label="キャンパス徒歩ルート案内"
      className="fixed bottom-3 left-3 right-3 z-30 flex max-h-[60dvh] flex-col overflow-hidden rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2]/96 shadow-xl backdrop-blur-md md:bottom-auto md:left-auto md:right-4 md:top-28 md:max-h-[calc(100dvh-8.5rem)] md:w-[364px]"
    >
      <div className="flex items-center justify-between border-b border-[#EAE3D6] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#1B365D] text-white">
            <RouteIcon className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-[14px] font-bold text-[#1D2430]">
              キャンパス徒歩ルート案内
            </h2>
            <p className="text-[10.5px] text-[#666F7B]">
              DEM5A標高 × OpenStreetMap歩道網
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ルート案内を閉じる"
          className="rounded-lg p-1.5 text-[#5F6875] hover:bg-[#EAE3D6] hover:text-[#1D2430]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2.5 overflow-y-auto px-4 py-3">
        {/* Quick origin buttons */}
        {quickOrigins.length > 0 && (
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="shrink-0 text-[10.5px] font-semibold text-[#666F7B]">
              定番出発:
            </span>
            {quickOrigins.map((o) => {
              const active = o.id === fromId;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onChangeFrom(o.id)}
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
                    active
                      ? 'border-[#2B8A6E] bg-[#2B8A6E] text-white'
                      : 'border-[#DDD6C8] bg-[#F3EDE0] text-[#323A46] hover:bg-[#E8E0CF]'
                  }`}
                >
                  {o.shortName}
                </button>
              );
            })}
          </div>
        )}

        {/* Origin / Destination selectors */}
        <div className="relative space-y-1.5 rounded-xl border border-[#E3DDD1] bg-[#F5F1E8]/80 p-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#2B8A6E]" />
            <select
              value={fromId}
              onChange={(e) => onChangeFrom(e.target.value)}
              aria-label="出発地"
              className="w-full rounded-lg border border-[#DDD6C8] bg-[#FAF7F2] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#1D2430] focus:border-[#1B365D] focus:outline-none"
            >
              {routable.map((b) => (
                <option key={b.id} value={b.id}>
                  出発: {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#C85A3A]" />
            <select
              value={toId}
              onChange={(e) => onChangeTo(e.target.value)}
              aria-label="目的地"
              className="w-full rounded-lg border border-[#DDD6C8] bg-[#FAF7F2] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#1D2430] focus:border-[#1B365D] focus:outline-none"
            >
              {routable.map((b) => (
                <option key={b.id} value={b.id}>
                  到着: {b.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onSwap}
            aria-label="出発地と目的地を入れ替え"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-[#D8D0C1] bg-[#FAF7F2] p-1.5 text-[#515965] shadow-sm transition hover:bg-[#EAE3D6]"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Route Mode Switch */}
        <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#EAE3D6] p-1">
          <button
            type="button"
            onClick={() => onChangeMode('shortest')}
            className={`rounded-lg py-1.5 text-[12px] font-bold transition ${
              mode === 'shortest'
                ? 'bg-[#C85A3A] text-white shadow-sm'
                : 'text-[#4B5360] hover:text-[#1D2430]'
            }`}
          >
            最短ルート
          </button>
          <button
            type="button"
            onClick={() => onChangeMode('gentle')}
            className={`rounded-lg py-1.5 text-[12px] font-bold transition ${
              mode === 'gentle'
                ? 'bg-[#2B8A6E] text-white shadow-sm'
                : 'text-[#4B5360] hover:text-[#1D2430]'
            }`}
          >
            坂・階段ひかえめ
          </button>
        </div>

        {/* Route summary */}
        {route ? (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              <div className="rounded-xl border border-[#E3DDD1] bg-[#F5F1E8]/80 px-2 py-2 text-center">
                <div className="text-[10px] font-medium text-[#666F7B]">距離</div>
                <div className="tabular-nums mt-0.5 text-[13px] font-bold text-[#1D2430]">
                  {Math.round(route.totalDistanceM)}m
                </div>
              </div>
              <div className="rounded-xl border border-[#E3DDD1] bg-[#F5F1E8]/80 px-2 py-2 text-center">
                <div className="text-[10px] font-medium text-[#666F7B]">徒歩目安</div>
                <div className="tabular-nums mt-0.5 flex items-center justify-center gap-0.5 text-[13px] font-bold text-[#1B365D]">
                  <Footprints className="h-3 w-3" />
                  <span>{route.estimatedMinutes}分</span>
                </div>
              </div>
              <div className="rounded-xl border border-[#E3DDD1] bg-[#F5F1E8]/80 px-2 py-2 text-center">
                <div className="text-[10px] font-medium text-[#666F7B]">上り/下り</div>
                <div className="tabular-nums mt-0.5 flex items-center justify-center gap-1 text-[11px] font-bold">
                  <span className="inline-flex items-center text-[#C85A3A]">
                    <TrendingUp className="h-3 w-3" />
                    {Math.round(route.elevationGainM)}
                  </span>
                  <span className="inline-flex items-center text-[#2B8A6E]">
                    <TrendingDown className="h-3 w-3" />
                    {Math.round(route.elevationLossM)}
                  </span>
                </div>
              </div>
              <div className="rounded-xl border border-[#E3DDD1] bg-[#F5F1E8]/80 px-2 py-2 text-center">
                <div className="text-[10px] font-medium text-[#666F7B]">階段区間</div>
                <div className="tabular-nums mt-0.5 flex items-center justify-center gap-0.5 text-[13px] font-bold text-[#1D2430]">
                  <Mountain className="h-3 w-3 text-[#8E5316]" />
                  <span>{route.stepsCount}</span>
                </div>
              </div>
            </div>

            <ElevationSparkline
              profile={route.profile}
              totalDistanceM={route.totalDistanceM}
              mode={mode}
            />
          </>
        ) : (
          <div className="rounded-xl border border-[#E6C7A3] bg-[#FFF5E8] px-3 py-3 text-center text-[12px] text-[#8E5316]">
            選択された2地点間の歩行経路が見つかりませんでした
          </div>
        )}
      </div>
    </aside>
  );
}

