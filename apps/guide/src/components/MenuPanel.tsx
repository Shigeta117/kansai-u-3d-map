import { ChevronRight, Home, Info, Moon, Sun, Tag, X } from 'lucide-react';
import { useEffect } from 'react';
import type { LightingTheme, RoofColorMode } from '@kansai-u-3d/core';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';

interface MenuPanelProps {
  open: boolean;
  campusName: string;
  lighting: LightingTheme;
  showLabels: boolean;
  onChangeLighting: (next: LightingTheme) => void;
  roofColorMode: RoofColorMode;
  onChangeRoofColorMode: (next: RoofColorMode) => void;
  onToggleLabels: () => void;
  onOpenCredits: () => void;
  onClose: () => void;
}

export function MenuPanel({
  open,
  campusName,
  lighting,
  showLabels,
  onChangeLighting,
  roofColorMode,
  onChangeRoofColorMode,
  onToggleLabels,
  onOpenCredits,
  onClose,
}: MenuPanelProps) {
  const { mounted, visible } = useAnimatedPresence(open, 150);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!mounted) return null;

  const state = visible ? 'open' : 'closed';

  return (
    <div
      data-state={state}
      className="t-modal-backdrop fixed inset-0 z-40 bg-[#1D2430]/35"
      onClick={onClose}
    >
      <div
        id="guide-menu-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-menu-title"
        data-state={state}
        onClick={(e) => e.stopPropagation()}
        className="t-picker-popover fixed left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2] p-4 shadow-xl sm:left-5 sm:right-auto sm:top-4 sm:w-[320px]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2
              id="guide-menu-title"
              className="text-[15px] font-bold leading-snug text-[#1D2430]"
            >
              {campusName} 3D
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#5F6875]">
              <span className="mr-1.5 inline-block rounded bg-[#EAE3D6] px-1.5 py-0.5 text-[10px] font-semibold text-[#4B5360]">
                非公式
              </span>
              関西大学の公式サービスではありません
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="メニューを閉じる"
            className="t-interactive shrink-0 rounded-lg p-1.5 text-[#5F6875] hover:bg-[#EAE3D6] hover:text-[#1D2430]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 space-y-2 border-t border-[#EAE3D6] pt-3">
          <button
            type="button"
            role="switch"
            aria-checked={showLabels}
            onClick={onToggleLabels}
            className="t-interactive flex w-full items-center justify-between rounded-xl border border-[#E5DEC9] bg-white px-3 py-2.5 text-left hover:bg-[#F4EFE5]"
          >
            <span className="flex items-center gap-2.5 text-[13px] font-semibold text-[#1D2430]">
              <Tag className="h-4 w-4 text-[#1B365D]" aria-hidden="true" />
              <span>建物ラベル</span>
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                showLabels
                  ? 'bg-[#1B365D] text-[#FAF7F2]'
                  : 'bg-[#EAE3D6] text-[#5F6875]'
              }`}
            >
              {showLabels ? '表示' : '非表示'}
            </span>
          </button>

          <div className="flex items-center justify-between rounded-xl border border-[#E5DEC9] bg-white px-3 py-2">
            <span className="flex items-center gap-2.5 text-[13px] font-semibold text-[#1D2430]">
              {lighting === 'day' ? (
                <Sun className="h-4 w-4 text-[#D4882A]" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4 text-[#A85224]" aria-hidden="true" />
              )}
              <span>時間帯</span>
            </span>
            <div
              role="radiogroup"
              aria-label="時間帯の切り替え"
              className="flex items-center gap-1 rounded-lg bg-[#F1ECE1] p-0.5"
            >
              <button
                type="button"
                role="radio"
                aria-checked={lighting === 'day'}
                onClick={() => onChangeLighting('day')}
                className={`t-interactive rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                  lighting === 'day'
                    ? 'bg-[#1B365D] text-[#FAF7F2]'
                    : 'text-[#4B5360] hover:text-[#1D2430]'
                }`}
              >
                昼
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={lighting === 'golden'}
                onClick={() => onChangeLighting('golden')}
                className={`t-interactive rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                  lighting === 'golden'
                    ? 'bg-[#C85A3A] text-white'
                    : 'text-[#4B5360] hover:text-[#1D2430]'
                }`}
              >
                夕方
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#E5DEC9] bg-white px-3 py-2">
            <span className="flex items-center gap-2.5 text-[13px] font-semibold text-[#1D2430]">
              <Home className="h-4 w-4 text-[#5F6875]" aria-hidden="true" />
              <span>屋根の色</span>
            </span>
            <div
              role="radiogroup"
              aria-label="屋根の色の切り替え"
              className="flex items-center gap-1 rounded-lg bg-[#F1ECE1] p-0.5"
            >
              <button
                type="button"
                role="radio"
                aria-checked={roofColorMode === 'aerial'}
                onClick={() => onChangeRoofColorMode('aerial')}
                className={`t-interactive rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                  roofColorMode === 'aerial'
                    ? 'bg-[#1B365D] text-[#FAF7F2]'
                    : 'text-[#4B5360] hover:text-[#1D2430]'
                }`}
              >
                写真の色
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={roofColorMode === 'area'}
                onClick={() => onChangeRoofColorMode('area')}
                className={`t-interactive rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                  roofColorMode === 'area'
                    ? 'bg-[#1B365D] text-[#FAF7F2]'
                    : 'text-[#4B5360] hover:text-[#1D2430]'
                }`}
              >
                エリア別
              </button>
            </div>
          </div>
        </div>

        <div className="mt-2 border-t border-[#EAE3D6] pt-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCredits();
            }}
            className="t-interactive flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-[#1D2430] hover:bg-[#EFE9DC]"
          >
            <span className="flex items-center gap-2.5">
              <Info className="h-4 w-4 text-[#5F6875]" aria-hidden="true" />
              <span>データ出典・ライセンス</span>
            </span>
            <ChevronRight
              className="h-4 w-4 text-[#7D8591]"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
