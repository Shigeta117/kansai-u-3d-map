import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CATEGORY_OPTIONS,
  selectVisibleLabels,
  type BuildingCategory,
  type CampusScene,
  type LabelRect,
  type LabelsFrame,
} from '@kansai-u-3d/core';

interface LandmarkLabelsOverlayProps {
  scene: CampusScene | null;
  visible: boolean;
  selectedId: string | null;
  routeEndpointIds: readonly string[];
  hasLeftCard: boolean;
  hasRightCard: boolean;
  /** スマホで下のシートが覆っている高さ（px）。0 なら従来の目安（画面の 4 割より上） */
  sheetInset?: number;
  onSelect: (buildingId: string) => void;
}

interface DisplayedLabel {
  id: string;
  shortName: string;
  category: BuildingCategory;
}

interface LabelPosition {
  x: number;
  y: number;
}

const CATEGORY_COLOR_MAP = new Map<string, string>(
  CATEGORY_OPTIONS.map((c) => [c.id, c.color]),
);

function formatLabelTransform(x: number, y: number): string {
  return `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
}

export function LandmarkLabelsOverlay({
  scene,
  visible,
  selectedId,
  routeEndpointIds,
  hasLeftCard,
  hasRightCard,
  sheetInset = 0,
  onSelect,
}: LandmarkLabelsOverlayProps) {
  const [displayedLabels, setDisplayedLabels] = useState<DisplayedLabel[]>([]);

  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const refCallbacksRef = useRef<
    Map<string, (el: HTMLButtonElement | null) => void>
  >(new Map());
  const latestPosRef = useRef<Map<string, LabelPosition>>(new Map());
  const displayedKeyRef = useRef<string>('');
  const latestFrameRef = useRef<LabelsFrame | null>(null);
  const optionsRef = useRef({
    visible,
    selectedId,
    routeEndpointIds,
    hasLeftCard,
    hasRightCard,
    sheetInset,
  });

  const applyFrame = useCallback((frame: LabelsFrame) => {
    latestFrameRef.current = frame;
    const opts = optionsRef.current;

    if (!opts.visible) {
      if (displayedKeyRef.current !== '') {
        displayedKeyRef.current = '';
        latestPosRef.current.clear();
        setDisplayedLabels([]);
      }
      return;
    }

    const { viewportWidth, viewportHeight } = frame;
    const isMobile = viewportWidth < 640;
    const isCompact = viewportWidth < 768;

    const topSafe = 76;
    const bottomSafe = isMobile
      ? opts.sheetInset > 0
        ? viewportHeight - opts.sheetInset - 8
        : opts.hasLeftCard || opts.hasRightCard
          ? viewportHeight * 0.4
          : viewportHeight - 36
      : viewportHeight - 28;

    const avoidRects: LabelRect[] = [];
    if (isMobile) {
      avoidRects.push({
        left: viewportWidth - 64,
        top: 64,
        right: viewportWidth,
        bottom: 176,
      });
    } else {
      avoidRects.push({
        left: viewportWidth - 72,
        top: 0,
        right: viewportWidth,
        bottom: 118,
      });
      if (opts.hasLeftCard) {
        avoidRects.push({
          left: 0,
          top: 80,
          right: 405,
          bottom: viewportHeight,
        });
      }
      if (opts.hasRightCard) {
        avoidRects.push({
          left: viewportWidth - 405,
          top: 100,
          right: viewportWidth,
          bottom: viewportHeight,
        });
      }
    }

    const accepted = selectVisibleLabels(frame, {
      selectedId: opts.selectedId,
      routeEndpointIds: opts.routeEndpointIds,
      topSafe,
      bottomSafe,
      maxLabels: isCompact ? 6 : 12,
      avoidRects,
    });

    const nextPosMap = latestPosRef.current;
    nextPosMap.clear();

    const ids: string[] = [];
    for (const lbl of accepted) {
      ids.push(lbl.id);
      nextPosMap.set(lbl.id, { x: lbl.screenX, y: lbl.screenY });
      const el = buttonRefs.current.get(lbl.id);
      if (el) {
        el.style.transform = formatLabelTransform(lbl.screenX, lbl.screenY);
      }
    }

    ids.sort();
    const nextKey = ids.join('|');
    if (nextKey !== displayedKeyRef.current) {
      displayedKeyRef.current = nextKey;
      setDisplayedLabels(
        accepted.map((lbl) => ({
          id: lbl.id,
          shortName: lbl.shortName,
          category: lbl.category,
        })),
      );
    }
  }, []);

  // Keep latest option props synced before subscription effect runs
  useEffect(() => {
    optionsRef.current = {
      visible,
      selectedId,
      routeEndpointIds,
      hasLeftCard,
      hasRightCard,
      sheetInset,
    };
    if (visible && latestFrameRef.current) {
      applyFrame(latestFrameRef.current);
    }
  }, [
    visible,
    selectedId,
    routeEndpointIds,
    hasLeftCard,
    hasRightCard,
    sheetInset,
    applyFrame,
  ]);

  useEffect(() => {
    if (!scene || !visible) {
      if (displayedKeyRef.current !== '') {
        displayedKeyRef.current = '';
        latestPosRef.current.clear();
        setDisplayedLabels([]);
      }
      return;
    }
    return scene.subscribeLabels(applyFrame);
  }, [scene, visible, applyFrame]);

  useLayoutEffect(() => {
    for (const lbl of displayedLabels) {
      const el = buttonRefs.current.get(lbl.id);
      const pos = latestPosRef.current.get(lbl.id);
      if (el && pos) {
        el.style.transform = formatLabelTransform(pos.x, pos.y);
      }
    }
  }, [displayedLabels]);

  const getButtonRef = useCallback((id: string) => {
    let cb = refCallbacksRef.current.get(id);
    if (!cb) {
      cb = (el: HTMLButtonElement | null) => {
        if (el) {
          buttonRefs.current.set(id, el);
          const pos = latestPosRef.current.get(id);
          if (pos) {
            el.style.transform = formatLabelTransform(pos.x, pos.y);
          }
        } else {
          buttonRefs.current.delete(id);
          refCallbacksRef.current.delete(id);
        }
      };
      refCallbacksRef.current.set(id, cb);
    }
    return cb;
  }, []);

  if (!visible || displayedLabels.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {displayedLabels.map((lbl) => {
        const isSelected = lbl.id === selectedId;
        const isEndpoint = routeEndpointIds.includes(lbl.id);
        const dotColor = CATEGORY_COLOR_MAP.get(lbl.category) ?? '#1B365D';

        return (
          <button
            key={lbl.id}
            ref={getButtonRef(lbl.id)}
            type="button"
            onClick={() => onSelect(lbl.id)}
            className={`pointer-events-auto absolute left-0 top-0 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-md transition-colors duration-150 will-change-transform ${
              isSelected
                ? 'z-20 border-[#C85A3A] bg-[#C85A3A] text-white'
                : isEndpoint
                  ? 'z-20 border-[#1B365D] bg-[#1B365D] text-white'
                  : 'border-[#DDD6C8] bg-[#FAF7F2]/92 text-[#1D2430] hover:border-[#1B365D] hover:bg-white'
            }`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: isSelected || isEndpoint ? '#FFFFFF' : dotColor,
              }}
            />
            <span className="whitespace-nowrap">{lbl.shortName}</span>
          </button>
        );
      })}
    </div>
  );
}
