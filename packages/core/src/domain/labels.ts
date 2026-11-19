import type { ProjectedLabel } from './types';

export interface LabelsFrame {
  labels: ProjectedLabel[];
  cameraDistance: number;
  viewportWidth: number;
  viewportHeight: number;
}

export type LabelsListener = (frame: LabelsFrame) => void;

export interface LabelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SelectVisibleLabelsOptions {
  selectedId: string | null;
  routeEndpointIds?: readonly string[];
  topSafe: number;
  bottomSafe: number;
  maxLabels: number;
  avoidRects?: readonly LabelRect[];
}

/** Distance thresholds between camera and orbit target for label density. */
export const LABEL_DISTANCE_FAR = 540;
export const LABEL_DISTANCE_MID = 260;

export function getMaxLabelPriorityForDistance(cameraDistance: number): number {
  if (cameraDistance > LABEL_DISTANCE_FAR) return 1;
  if (cameraDistance > LABEL_DISTANCE_MID) return 3;
  return 7;
}

function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}

function estimateLabelHalfWidth(shortName: string): number {
  let textW = 0;
  for (let i = 0; i < shortName.length; i++) {
    const code = shortName.charCodeAt(i);
    textW += code <= 0x7f ? 7 : 11.5;
  }
  const width = Math.max(68, textW + 40);
  return width * 0.5 + 4;
}

export function selectVisibleLabels(
  frame: LabelsFrame,
  options: SelectVisibleLabelsOptions,
): ProjectedLabel[] {
  const { labels, cameraDistance, viewportWidth, viewportHeight } = frame;
  if (labels.length === 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return [];
  }

  const {
    selectedId,
    routeEndpointIds = [],
    topSafe,
    bottomSafe,
    maxLabels,
    avoidRects = [],
  } = options;

  const endpointSet = new Set(routeEndpointIds);
  const maxPriority = getMaxLabelPriorityForDistance(cameraDistance);

  const candidates = labels.filter((lbl) => {
    if (lbl.id === selectedId || endpointSet.has(lbl.id)) {
      return true;
    }
    return lbl.priority <= maxPriority;
  });

  candidates.sort((a, b) => {
    const aRank = a.id === selectedId ? 0 : endpointSet.has(a.id) ? 1 : 2;
    const bRank = b.id === selectedId ? 0 : endpointSet.has(b.id) ? 1 : 2;
    if (aRank !== bRank) return aRank - bRank;
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.distanceToCamera !== b.distanceToCamera) {
      return a.distanceToCamera - b.distanceToCamera;
    }
    return a.id.localeCompare(b.id);
  });

  const placedBoxes: LabelRect[] = [];
  const accepted: ProjectedLabel[] = [];

  for (const lbl of candidates) {
    const isPinned = lbl.id === selectedId || endpointSet.has(lbl.id);
    const halfW = estimateLabelHalfWidth(lbl.shortName);
    const box: LabelRect = {
      left: lbl.screenX - halfW,
      right: lbl.screenX + halfW,
      top: lbl.screenY - 30,
      bottom: lbl.screenY + 4,
    };

    if (isPinned) {
      placedBoxes.push(box);
      accepted.push(lbl);
      continue;
    }

    if (accepted.length >= maxLabels) break;
    if (lbl.screenY < topSafe || lbl.screenY > bottomSafe) continue;
    if (box.left < 8 || box.right > viewportWidth - 8) continue;
    if (avoidRects.some((r) => rectsOverlap(box, r))) continue;
    if (placedBoxes.some((other) => rectsOverlap(box, other))) continue;

    placedBoxes.push(box);
    accepted.push(lbl);
  }

  return accepted;
}
