import { describe, expect, it } from 'vitest';
import type { ProjectedLabel } from './types';
import {
  getMaxLabelPriorityForDistance,
  selectVisibleLabels,
  type LabelsFrame,
} from './labels';

function makeLabel(partial: Partial<ProjectedLabel> & { id: string }): ProjectedLabel {
  return {
    name: partial.id,
    shortName: partial.id,
    category: 'shared',
    screenX: 200,
    screenY: 200,
    distanceToCamera: 300,
    priority: 1,
    visible: true,
    ...partial,
  };
}

describe('label density and overlap culling', () => {
  it('reduces max priority when zoomed out and increases it when zoomed in', () => {
    expect(getMaxLabelPriorityForDistance(870)).toBe(1);
    expect(getMaxLabelPriorityForDistance(400)).toBe(3);
    expect(getMaxLabelPriorityForDistance(200)).toBe(7);
  });

  it('shows only priority 1 landmarks at far camera distance, except pinned labels', () => {
    const frame: LabelsFrame = {
      cameraDistance: 870,
      viewportWidth: 390,
      viewportHeight: 844,
      labels: [
        makeLabel({ id: 'p1', shortName: '凜風館', priority: 1, screenX: 120, screenY: 200 }),
        makeLabel({ id: 'p2', shortName: '第3学舎', priority: 2, screenX: 260, screenY: 200 }),
        makeLabel({ id: 'p6', shortName: '尚文館', priority: 6, screenX: 180, screenY: 340 }),
        makeLabel({ id: 'p7', shortName: '第1学舎3号館', priority: 7, screenX: 200, screenY: 460 }),
      ],
    };

    const result = selectVisibleLabels(frame, {
      selectedId: 'p6',
      routeEndpointIds: ['p7'],
      topSafe: 76,
      bottomSafe: 800,
      maxLabels: 6,
    });

    expect(result.map((l) => l.id)).toEqual(['p6', 'p7', 'p1']);
  });

  it('keeps higher-priority or closer label when two labels overlap', () => {
    const frame: LabelsFrame = {
      cameraDistance: 200,
      viewportWidth: 800,
      viewportHeight: 600,
      labels: [
        makeLabel({
          id: 'low',
          shortName: '低い優先度',
          priority: 4,
          distanceToCamera: 120,
          screenX: 300,
          screenY: 300,
        }),
        makeLabel({
          id: 'high-far',
          shortName: '高優先・奥',
          priority: 1,
          distanceToCamera: 260,
          screenX: 305,
          screenY: 300,
        }),
        makeLabel({
          id: 'high-near',
          shortName: '高優先・手前',
          priority: 1,
          distanceToCamera: 180,
          screenX: 302,
          screenY: 302,
        }),
      ],
    };

    const result = selectVisibleLabels(frame, {
      selectedId: null,
      topSafe: 76,
      bottomSafe: 560,
      maxLabels: 10,
    });

    expect(result.map((l) => l.id)).toEqual(['high-near']);
  });

  it('always keeps selected and route endpoint labels even when overlapping or exceeding maxLabels', () => {
    const frame: LabelsFrame = {
      cameraDistance: 200,
      viewportWidth: 390,
      viewportHeight: 844,
      labels: [
        makeLabel({ id: 'sel', shortName: '選択棟', priority: 7, screenX: 200, screenY: 200 }),
        makeLabel({ id: 'start', shortName: '出発棟', priority: 5, screenX: 202, screenY: 202 }),
        makeLabel({ id: 'goal', shortName: '到着棟', priority: 6, screenX: 204, screenY: 204 }),
        makeLabel({ id: 'normal', shortName: '通常棟', priority: 1, screenX: 200, screenY: 200 }),
      ],
    };

    const result = selectVisibleLabels(frame, {
      selectedId: 'sel',
      routeEndpointIds: ['start', 'goal'],
      topSafe: 76,
      bottomSafe: 800,
      maxLabels: 2,
    });

    expect(result.map((l) => l.id)).toEqual(['sel', 'start', 'goal']);
  });
});
