import { CATEGORY_OPTIONS, type ProjectedLabel } from '@kansai-u-3d/core';

interface LandmarkLabelsOverlayProps {
  labels: ProjectedLabel[];
  visible: boolean;
  selectedId: string | null;
  routeEndpointIds: string[];
  viewportWidth: number;
  viewportHeight: number;
  hasLeftCard: boolean;
  hasRightCard: boolean;
  onSelect: (buildingId: string) => void;
}

interface Box2D {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlaps(a: Box2D, b: Box2D): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export function LandmarkLabelsOverlay({
  labels,
  visible,
  selectedId,
  routeEndpointIds,
  viewportWidth,
  viewportHeight,
  hasLeftCard,
  hasRightCard,
  onSelect,
}: LandmarkLabelsOverlayProps) {
  if (!visible || labels.length === 0 || viewportWidth <= 0) return null;

  const isMobile = viewportWidth < 768;
  const maxLabels = isMobile ? 7 : 13;

  const sorted = [...labels].sort((a, b) => {
    const aSel = a.id === selectedId ? 0 : routeEndpointIds.includes(a.id) ? 1 : 2;
    const bSel = b.id === selectedId ? 0 : routeEndpointIds.includes(b.id) ? 1 : 2;
    if (aSel !== bSel) return aSel - bSel;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.distanceToCamera - b.distanceToCamera;
  });

  const topSafe = isMobile ? 162 : 112;
  const bottomSafe = isMobile
    ? hasLeftCard || hasRightCard
      ? viewportHeight * 0.54
      : viewportHeight - 88
    : viewportHeight - 28;

  const placedBoxes: Box2D[] = [];
  const accepted: ProjectedLabel[] = [];

  for (const lbl of sorted) {
    if (accepted.length >= maxLabels) break;
    if (lbl.screenY < topSafe || lbl.screenY > bottomSafe) continue;
    if (!isMobile && hasLeftCard && lbl.screenX < 405 && lbl.screenY > 100) continue;
    if (!isMobile && hasRightCard && lbl.screenX > viewportWidth - 405 && lbl.screenY > 100) {
      continue;
    }

    const halfW = Math.max(36, lbl.shortName.length * 6.5 + 16);
    if (lbl.screenX - halfW < 8 || lbl.screenX + halfW > viewportWidth - 8) continue;
    const box: Box2D = {
      left: lbl.screenX - halfW,
      right: lbl.screenX + halfW,
      top: lbl.screenY - 28,
      bottom: lbl.screenY + 4,
    };

    if (placedBoxes.some((other) => overlaps(box, other))) continue;
    placedBoxes.push(box);
    accepted.push(lbl);
  }

  const getColor = (catId: string) =>
    CATEGORY_OPTIONS.find((c) => c.id === catId)?.color ?? '#1B365D';

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {accepted.map((lbl) => {
        const isSelected = lbl.id === selectedId;
        const isEndpoint = routeEndpointIds.includes(lbl.id);
        const dotColor = getColor(lbl.category);

        return (
          <button
            key={lbl.id}
            type="button"
            onClick={() => onSelect(lbl.id)}
            style={{
              transform: `translate3d(${lbl.screenX.toFixed(1)}px, ${lbl.screenY.toFixed(1)}px, 0) translate(-50%, -100%)`,
            }}
            className={`pointer-events-auto absolute left-0 top-0 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-md transition-colors duration-150 ${
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

