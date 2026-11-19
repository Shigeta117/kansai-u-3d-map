import {
  Accessibility,
  AlertCircle,
  ArrowUpDown,
  Footprints,
  Mountain,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import type {
  BuildingFeature,
  BuildingFloorPlan,
  RouteMode,
  RouteResult,
} from '@kansai-u-3d/core';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { ElevationSparkline } from './ElevationSparkline';
import { LocationPicker, type RouteEndpointSelection } from './LocationPicker';

interface RoutePanelProps {
  open: boolean;
  buildings: BuildingFeature[];
  floorPlans: Record<string, BuildingFloorPlan>;
  originSelection: RouteEndpointSelection;
  destSelection: RouteEndpointSelection;
  mode: RouteMode;
  pickingTarget: 'origin' | 'dest' | null;
  route: RouteResult | null;
  onChangeOrigin: (next: RouteEndpointSelection) => void;
  onChangeDest: (next: RouteEndpointSelection) => void;
  onSwap: () => void;
  onChangeMode: (mode: RouteMode) => void;
  onStartMapPick: (target: 'origin' | 'dest') => void;
  onCancelMapPick: () => void;
  onClose: () => void;
}

const MODE_OPTIONS: {
  id: RouteMode;
  label: string;
  desc: string;
  activeClass: string;
}[] = [
  {
    id: 'shortest',
    label: '最短',
    desc: '距離優先',
    activeClass: 'bg-[#C85A3A] text-white shadow-xs',
  },
  {
    id: 'gentle',
    label: '坂ひかえめ',
    desc: 'ｴｽｶﾚｰﾀｰ・橋優先',
    activeClass: 'bg-[#2B8A6E] text-white shadow-xs',
  },
  {
    id: 'step-free',
    label: '段差フリー',
    desc: '階段・エスカレータ無し',
    activeClass: 'bg-[#1F7A8C] text-white shadow-xs',
  },
];

export function RoutePanel({
  open,
  buildings,
  floorPlans,
  originSelection,
  destSelection,
  mode,
  pickingTarget,
  route,
  onChangeOrigin,
  onChangeDest,
  onSwap,
  onChangeMode,
  onStartMapPick,
  onCancelMapPick,
  onClose,
}: RoutePanelProps) {
  const { mounted, visible } = useAnimatedPresence(open, 350);

  if (!mounted) return null;

  const state = visible ? 'open' : 'closed';
  const routePopKey = route
    ? `${route.mode}:${route.fromId}:${route.toId}:${route.totalDistanceM.toFixed(1)}`
    : 'none';

  return (
    <aside
      data-state={state}
      className="t-panel-left pointer-events-auto fixed bottom-0 left-0 right-0 z-20 mx-auto max-h-[66dvh] w-full max-w-lg rounded-t-2xl border border-[#DDD6C8] bg-[#FAF7F2]/96 p-4 shadow-2xl backdrop-blur-md sm:bottom-5 sm:left-5 sm:right-auto sm:mx-0 sm:max-h-[calc(100dvh-9.5rem)] sm:w-[374px] sm:rounded-2xl flex flex-col"
      aria-label="キャンパス内徒歩ルート案内"
    >
      <div className="mb-2 flex justify-center sm:hidden">
        <div className="h-1 w-10 rounded-full bg-[#D0C8B8]" />
      </div>

      <div className="flex items-center justify-between border-b border-[#EAE3D6] pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1B365D] text-white">
            <RouteIcon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-[#1D2430]">
              キャンパスルート案内
            </h2>
            <p className="text-[10.5px] text-[#666F7B]">
              高架デッキ（秀麗橋）・坂・段差フリーを考慮
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ルートパネルを閉じる"
          className="t-interactive rounded-lg p-1.5 text-[#5F6875] hover:bg-[#EAE3D6] hover:text-[#1D2430]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex-1 space-y-2.5 overflow-y-auto pr-0.5">
        {/* Map pick banner */}
        {pickingTarget && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[#C85A3A] bg-[#FDECE7] px-3 py-2 text-[11.5px] font-semibold text-[#943B21]">
            <span>
              3Dマップ上で「{pickingTarget === 'origin' ? '出発地' : '目的地'}」の建物をタップしてください
            </span>
            <button
              type="button"
              onClick={onCancelMapPick}
              className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[10.5px] font-bold text-[#943B21]"
            >
              取消
            </button>
          </div>
        )}

        {/* Origin / Swap / Dest Pickers */}
        <div className="space-y-1.5">
          <LocationPicker
            roleLabel="出発"
            badgeColor="#2B8A6E"
            selection={originSelection}
            buildings={buildings}
            floorPlans={floorPlans}
            pickingActive={pickingTarget === 'origin'}
            onSelect={onChangeOrigin}
            onStartMapPick={() => onStartMapPick('origin')}
          />

          <div className="flex justify-center">
            <button
              type="button"
              onClick={onSwap}
              aria-label="出発地と目的地を入れ替える"
              className="t-interactive flex items-center gap-1 rounded-full border border-[#DCD4C5] bg-white px-2.5 py-0.5 text-[10.5px] font-semibold text-[#4B5360] hover:bg-[#F3EDE0]"
            >
              <ArrowUpDown className="h-3 w-3" />
              <span>入れ替え</span>
            </button>
          </div>

          <LocationPicker
            roleLabel="到着"
            badgeColor="#C85A3A"
            selection={destSelection}
            buildings={buildings}
            floorPlans={floorPlans}
            pickingActive={pickingTarget === 'dest'}
            onSelect={onChangeDest}
            onStartMapPick={() => onStartMapPick('dest')}
          />
        </div>

        {/* 3 Mode Switcher */}
        <div
          className="grid grid-cols-3 gap-1 rounded-xl border border-[#DCD4C5] bg-[#F1ECE1] p-1"
          role="radiogroup"
          aria-label="ルート探索モード"
        >
          {MODE_OPTIONS.map((opt) => {
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChangeMode(opt.id)}
                className={`t-interactive rounded-lg px-1.5 py-1.5 text-center ${
                  active
                    ? opt.activeClass
                    : 'text-[#4B5360] hover:bg-white/60 hover:text-[#1D2430]'
                }`}
              >
                <div className="flex items-center justify-center gap-1 text-[11.5px] font-bold">
                  {opt.id === 'step-free' && <Accessibility className="h-3 w-3" />}
                  {opt.id === 'gentle' && <Mountain className="h-3 w-3" />}
                  {opt.id === 'shortest' && <Footprints className="h-3 w-3" />}
                  <span>{opt.label}</span>
                </div>
                <div
                  className={`mt-0.5 text-[9.5px] ${
                    active ? 'text-white/90' : 'text-[#6A727E]'
                  }`}
                >
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </div>

        {/* Curated Quick Presets */}
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="shrink-0 text-[10px] font-semibold text-[#666F7B]">
            おすすめ試走:
          </span>
          <button
            type="button"
            onClick={() => {
              onChangeOrigin({ buildingId: 'kandaimae-station' });
              onChangeDest({ buildingId: 'area3' });
            }}
            className="t-interactive shrink-0 rounded-full border border-[#DFD8CA] bg-white px-2 py-0.5 text-[10.5px] font-semibold text-[#2E3643] hover:bg-[#EFE9DC]"
          >
            関大前→第3学舎
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeOrigin({ buildingId: 'area3' });
              onChangeDest({ buildingId: 'area1-1' });
            }}
            className="t-interactive shrink-0 rounded-full border border-[#DFD8CA] bg-white px-2 py-0.5 text-[10.5px] font-semibold text-[#2E3654] hover:bg-[#EFE9DC]"
          >
            第3学舎→第1学舎（秀麗橋）
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeOrigin({ buildingId: 'main-gate' });
              onChangeDest({ buildingId: 'rimpukan' });
            }}
            className="t-interactive shrink-0 rounded-full border border-[#DFD8CA] bg-white px-2 py-0.5 text-[10.5px] font-semibold text-[#2E3643] hover:bg-[#EFE9DC]"
          >
            正門→凜風館
          </button>
        </div>

        {/* Route Result Card or Unreachable Banner */}
        {route ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {route.isStepFree && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E2F4F7] px-2.5 py-0.5 text-[10.5px] font-bold text-[#1F7A8C]">
                  <ShieldCheck className="h-3 w-3" />
                  完全段差フリー
                </span>
              )}
              {route.usesBridge && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E9EEF8] px-2.5 py-0.5 text-[10.5px] font-bold text-[#1B365D]">
                  <Sparkles className="h-3 w-3" />
                  秀麗橋（高架デッキ）経由
                </span>
              )}
              {route.usesEscalator && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E5F6EE] px-2.5 py-0.5 text-[10.5px] font-bold text-[#217058]">
                  <TrendingUp className="h-3 w-3" />
                  屋外エスカレーター利用
                </span>
              )}
            </div>

            <div
              key={routePopKey}
              className="t-number-pop grid grid-cols-[0.88fr_0.82fr_1.3fr] gap-2 rounded-xl border border-[#E3DDD1] bg-white px-3 py-2.5"
            >
              <div>
                <div className="text-[10.5px] text-[#666F7B]">徒歩目安</div>
                <div className="tabular-nums whitespace-nowrap text-[16px] font-bold text-[#1D2430]">
                  約 {route.estimatedMinutes}分
                </div>
              </div>
              <div>
                <div className="text-[10.5px] text-[#666F7B]">距離</div>
                <div className="tabular-nums whitespace-nowrap text-[16px] font-bold text-[#1D2430]">
                  {route.totalDistanceM.toFixed(0)}m
                </div>
              </div>
              <div>
                <div className="text-[10.5px] text-[#666F7B]">累積上り / 階段</div>
                <div className="tabular-nums flex flex-wrap items-baseline gap-x-1 text-[12.5px] font-bold text-[#1D2430]">
                  <span className="whitespace-nowrap">+{route.elevationGainM.toFixed(1)}m</span>
                  <span className="text-[#B8B0A0]">/</span>
                  {route.stepsCount > 0 ? (
                    <span className="whitespace-nowrap text-[#C85A3A]">
                      階段{route.stepsCount}
                    </span>
                  ) : (
                    <span className="whitespace-nowrap text-[#2B8A6E]">階段なし</span>
                  )}
                </div>
              </div>
            </div>

            <ElevationSparkline
              profile={route.profile}
              totalDistanceM={route.totalDistanceM}
              mode={route.mode}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-[#E9D1C7] bg-[#FDF5F1] px-3 py-2.5 text-[11.5px] leading-relaxed text-[#7F341D]">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#C85A3A]" />
              <div>
                {mode === 'step-free' ? (
                  <>
                    <p className="font-semibold">
                      この組み合わせでは階段・屋外エスカレーターを使わない段差フリー経路が見つかりませんでした。
                    </p>
                    <p className="mt-1 text-[11px] text-[#964932]">
                      新アクセス路のエスカレーターを利用する「坂ひかえめ」をお試しください。
                    </p>
                    <button
                      type="button"
                      onClick={() => onChangeMode('gentle')}
                      className="t-interactive mt-2 rounded-lg bg-[#2B8A6E] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#23745B]"
                    >
                      「坂ひかえめ」に切り替える
                    </button>
                  </>
                ) : (
                  <span>
                    同じ地点または歩道ネットワーク未接続の建物が選択されています。別の建物を選んでください。
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
