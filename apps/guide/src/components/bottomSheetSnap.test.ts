import { describe, expect, it } from 'vitest';
import {
  DISMISS_MARGIN_PX,
  OVERDRAG_MAX_PX,
  computeSnapHeights,
  cycleSnap,
  dragFrame,
  releaseVelocity,
  resolveRelease,
  stepSnap,
  toggleSnap,
} from './bottomSheetSnap';

// iPhone 15 相当（852px）・検索バーの下まで 68px・低い段 130px
const heights = computeSnapHeights(852, 68, 130);

describe('computeSnapHeights', () => {
  it('低い段・中（画面の半分）・高い段（検索バーの下まで）', () => {
    expect(heights).toEqual({ peek: 130, half: 426, full: 784 });
  });

  it('画面が低くても peek ≤ half ≤ full を保つ', () => {
    const h = computeSnapHeights(300, 68, 200);
    expect(h.peek).toBeLessThanOrEqual(h.half);
    expect(h.half).toBeLessThanOrEqual(h.full);
    expect(h.full).toBe(232);
  });
});

describe('dragFrame', () => {
  it('段の間では指に合わせて高さが変わる', () => {
    expect(dragFrame(426, -100, heights)).toEqual({ height: 526, offset: 0 });
  });

  it('低い段より下では高さを保って下へずれる', () => {
    expect(dragFrame(130, 50, heights)).toEqual({ height: 130, offset: 50 });
  });

  it('高い段より上は抵抗がつき、上限で止まる', () => {
    const f = dragFrame(784, -1000, heights);
    expect(f.height).toBe(784 + OVERDRAG_MAX_PX);
  });
});

describe('resolveRelease', () => {
  const base = { heights, dismissible: true };

  it('ゆっくり離すと近い段へ寄る', () => {
    expect(resolveRelease({ ...base, visibleHeight: 470, velocity: 0 })).toBe('half');
    expect(resolveRelease({ ...base, visibleHeight: 700, velocity: 0 })).toBe('full');
    expect(resolveRelease({ ...base, visibleHeight: 200, velocity: 0 })).toBe('peek');
  });

  it('低い段から少し下げただけなら低い段に戻る', () => {
    expect(
      resolveRelease({ ...base, visibleHeight: 130 - DISMISS_MARGIN_PX + 10, velocity: 0 }),
    ).toBe('peek');
  });

  it('低い段からさらに下へ引いて離すと閉じる', () => {
    expect(
      resolveRelease({ ...base, visibleHeight: 130 - DISMISS_MARGIN_PX - 10, velocity: 0 }),
    ).toBe('dismiss');
  });

  it('中の段から下へ強く払うと閉じ、弱く払うと低い段', () => {
    expect(resolveRelease({ ...base, visibleHeight: 426, velocity: 2.5 })).toBe('dismiss');
    expect(resolveRelease({ ...base, visibleHeight: 426, velocity: 1.2 })).toBe('peek');
  });

  it('上へ払うと上の段へ', () => {
    expect(resolveRelease({ ...base, visibleHeight: 140, velocity: -1 })).toBe('half');
  });

  it('閉じられないシートは低い段で止まる', () => {
    expect(
      resolveRelease({ heights, dismissible: false, visibleHeight: 20, velocity: 3 }),
    ).toBe('peek');
  });
});

describe('段の切り替え', () => {
  it('つまみ: 低い → 中 → 高い → 低い', () => {
    expect(cycleSnap('peek')).toBe('half');
    expect(cycleSnap('half')).toBe('full');
    expect(cycleSnap('full')).toBe('peek');
  });

  it('矢印キーは端で止まる', () => {
    expect(stepSnap('full', 1)).toBe('full');
    expect(stepSnap('peek', -1)).toBe('peek');
    expect(stepSnap('half', 1)).toBe('full');
  });

  it('見出し: 低い段なら中へ、それ以外は低い段へ', () => {
    expect(toggleSnap('peek')).toBe('half');
    expect(toggleSnap('half')).toBe('peek');
    expect(toggleSnap('full')).toBe('peek');
  });
});

describe('releaseVelocity', () => {
  it('直近 100ms の動きから速さを出す', () => {
    const samples = [
      { y: 0, t: 0 },
      { y: 50, t: 50 },
      { y: 150, t: 100 },
    ];
    expect(releaseVelocity(samples, 105)).toBeCloseTo(1.5);
  });

  it('止めてから離したら 0', () => {
    expect(releaseVelocity([{ y: 0, t: 0 }, { y: 100, t: 40 }], 300)).toBe(0);
  });
});
