import { Compass, Info, Moon, Route as RouteIcon, Sun, Tag } from 'lucide-react';
import type { CameraPreset, LightingTheme } from '@kansai-u-3d/core';

interface TopActionButtonsProps {
  lighting: LightingTheme;
  showLabels: boolean;
  routeOpen: boolean;
  onToggleLighting: () => void;
  onToggleLabels: () => void;
  onToggleRoute: () => void;
  onResetNorth: () => void;
  onOpenCredits: () => void;
}

export function TopActionButtons({
  lighting,
  showLabels,
  routeOpen,
  onToggleLighting,
  onToggleLabels,
  onToggleRoute,
  onResetNorth,
  onOpenCredits,
}: TopActionButtonsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleRoute}
        aria-pressed={routeOpen}
        aria-label="ルート案内を開く"
        className={`t-interactive flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[12px] font-bold shadow-sm backdrop-blur-md ${
          routeOpen
            ? 'border-[#C85A3A] bg-[#C85A3A] text-white'
            : 'border-[#DDD6C8] bg-[#FAF7F2]/95 text-[#1B365D] hover:bg-[#EFE9DC]'
        }`}
      >
        <RouteIcon className="h-3.5 w-3.5" />
        <span>ルート</span>
      </button>

      <button
        type="button"
        onClick={onToggleLighting}
        aria-label={lighting === 'day' ? '夕方ライトへ切替' : '昼ライトへ切替'}
        title={lighting === 'day' ? '夕方モードへ' : '昼モードへ'}
        className={`t-interactive flex h-9 items-center gap-1 rounded-xl border px-2.5 text-[12px] font-semibold shadow-sm backdrop-blur-md ${
          lighting === 'golden'
            ? 'border-[#D98245] bg-[#FCEBD9] text-[#8E4313]'
            : 'border-[#DDD6C8] bg-[#FAF7F2]/95 text-[#333B47] hover:bg-[#EFE9DC]'
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
        onClick={onToggleLabels}
        aria-pressed={showLabels}
        aria-label="建物ピン表示切替"
        title="建物ラベル表示切替"
        className={`t-interactive flex h-9 items-center gap-1 rounded-xl border px-2.5 text-[12px] font-semibold shadow-sm backdrop-blur-md ${
          showLabels
            ? 'border-[#1B365D] bg-[#1B365D] text-white'
            : 'border-[#DDD6C8] bg-[#FAF7F2]/95 text-[#4B5360] hover:bg-[#EFE9DC]'
        }`}
      >
        <Tag className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">ピン</span>
      </button>

      <button
        type="button"
        onClick={onResetNorth}
        aria-label="北を上にする"
        title="北を上にする"
        className="t-interactive flex h-9 w-9 items-center justify-center rounded-xl border border-[#DDD6C8] bg-[#FAF7F2]/95 text-[#4B5360] shadow-sm backdrop-blur-md hover:bg-[#EFE9DC] hover:text-[#1B365D]"
      >
        <Compass className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onOpenCredits}
        aria-label="データ出典・OSSライセンスを表示"
        title="データ出典・OSSライセンス"
        className="t-interactive flex h-9 w-9 items-center justify-center rounded-xl border border-[#DDD6C8] bg-[#FAF7F2]/95 text-[#4B5360] shadow-sm backdrop-blur-md hover:bg-[#EFE9DC] hover:text-[#1D2430]"
      >
        <Info className="h-4 w-4" />
      </button>
    </div>
  );
}

interface PresetStripProps {
  presets: CameraPreset[];
  activePresetId: string;
  onSelectPreset: (id: string) => void;
}

export function PresetStrip({
  presets,
  activePresetId,
  onSelectPreset,
}: PresetStripProps) {
  return (
    <div
      className="no-scrollbar flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2]/94 p-1.5 shadow-lg backdrop-blur-md"
      aria-label="カメラ視点プリセット"
    >
      {presets.map((p) => {
        const active = p.id === activePresetId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectPreset(p.id)}
            title={p.description}
            className={`t-interactive shrink-0 rounded-xl px-2.5 py-1.5 text-[11.5px] font-semibold ${
              active
                ? 'bg-[#1B365D] text-white shadow-sm'
                : 'text-[#3D4552] hover:bg-[#EAE3D6]'
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

