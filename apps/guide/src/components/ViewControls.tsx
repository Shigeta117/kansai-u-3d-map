import { Check, Compass, Eye } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CameraPreset } from '@kansai-u-3d/core';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';

interface MapSideControlsProps {
  presets: CameraPreset[];
  activePresetId: string;
  hasBottomSheet: boolean;
  onResetNorth: () => void;
  onSelectPreset: (id: string) => void;
}

export function MapSideControls({
  presets,
  activePresetId,
  hasBottomSheet,
  onResetNorth,
  onSelectPreset,
}: MapSideControlsProps) {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { mounted, visible } = useAnimatedPresence(presetsOpen, 150);

  useEffect(() => {
    if (!presetsOpen) return;

    const handlePointerDown = (ev: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) {
        setPresetsOpen(false);
      }
    };

    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setPresetsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [presetsOpen]);

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none fixed right-3 z-[25] flex flex-col items-end gap-2 sm:right-5 sm:top-4 ${
        hasBottomSheet
          ? 'top-[calc(max(0.75rem,env(safe-area-inset-top))_+_3.5rem)]'
          : 'top-[calc(max(0.75rem,env(safe-area-inset-top))_+_3.75rem)]'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          setPresetsOpen(false);
          onResetNorth();
        }}
        aria-label="北を上にする"
        title="北を上にする"
        className="t-interactive pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-[#DDD6C8] bg-[#FAF7F2]/95 text-[#333B47] shadow-md backdrop-blur-md hover:bg-[#EFE9DC] hover:text-[#1B365D]"
      >
        <Compass className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      <div className="pointer-events-auto relative">
        <button
          type="button"
          onClick={() => setPresetsOpen((prev) => !prev)}
          aria-expanded={presetsOpen}
          aria-haspopup="menu"
          aria-label="視点を切り替え"
          title="視点"
          className={`t-interactive flex h-10 w-10 items-center justify-center rounded-full border shadow-md backdrop-blur-md ${
            presetsOpen
              ? 'border-[#1B365D] bg-[#1B365D] text-[#FAF7F2]'
              : 'border-[#DDD6C8] bg-[#FAF7F2]/95 text-[#333B47] hover:bg-[#EFE9DC] hover:text-[#1B365D]'
          }`}
        >
          <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>

        {mounted && (
          <div
            role="menu"
            aria-label="視点プリセット"
            data-state={visible ? 'open' : 'closed'}
            className="t-picker-popover absolute right-12 top-0 w-48 rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2]/98 p-1.5 shadow-xl backdrop-blur-md"
          >
            <div className="px-2.5 py-1 text-[10.5px] font-bold text-[#666F7B]">
              視点を選ぶ
            </div>
            <div className="flex flex-col gap-0.5">
              {presets.map((p) => {
                const active = p.id === activePresetId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    title={p.description}
                    onClick={() => {
                      onSelectPreset(p.id);
                      setPresetsOpen(false);
                    }}
                    className={`t-interactive flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[12px] font-semibold ${
                      active
                        ? 'bg-[#1B365D] text-[#FAF7F2]'
                        : 'text-[#2E3643] hover:bg-[#EAE3D6]'
                    }`}
                  >
                    <span className="truncate">{p.label}</span>
                    {active && (
                      <Check
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
