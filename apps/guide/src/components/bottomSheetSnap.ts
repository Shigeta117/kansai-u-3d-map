/**
 * スマホの下から出るシートの「段」（スナップ）の計算。DOM に触らない純粋な関数だけを置く。
 *
 * - peek: 低い段。つまみ・見出し・下のボタンだけ（地図がほぼ見える）
 * - half: 中の段。画面の半分
 * - full: 高い段。上の検索バーの下まで
 */
export type SheetSnap = 'peek' | 'half' | 'full';

export const SHEET_SNAPS: readonly SheetSnap[] = ['peek', 'half', 'full'];

export interface SnapHeights {
  peek: number;
  half: number;
  full: number;
}

/** 下へ払ったときの勢いを、何 ms 先の位置として見込むか */
export const FLING_PROJECTION_MS = 200;
/** 低い段からこれ以上下へ引いて離すと閉じる */
export const DISMISS_MARGIN_PX = 48;
/** 高い段より上へ引いたときの抵抗（指の移動の何割だけ伸びるか）と、伸びの上限 */
export const OVERDRAG_RATIO = 0.2;
export const OVERDRAG_MAX_PX = 24;

/**
 * 画面の高さ・上に残す帯（検索バーの下端まで）・低い段の高さ（見出しと下のボタンの実測）から
 * 3 段の高さを決める。どの段も peek 以上 full 以下に収める。
 */
export function computeSnapHeights(
  viewportHeight: number,
  topReserve: number,
  peekHeight: number,
): SnapHeights {
  const full = Math.max(Math.round(peekHeight), Math.round(viewportHeight - topReserve));
  const peek = Math.min(Math.round(peekHeight), full);
  const half = Math.min(full, Math.max(peek, Math.round(viewportHeight * 0.5)));
  return { peek, half, full };
}

/**
 * ドラッグ中のシートの見た目。dy は指の移動（下が正）。
 * 低い段より下では高さを保ったまま下へずらし（offset）、高い段より上では抵抗をつけて少しだけ伸ばす。
 */
export function dragFrame(
  startHeight: number,
  dy: number,
  heights: SnapHeights,
): { height: number; offset: number } {
  const raw = startHeight - dy;
  if (raw > heights.full) {
    const over = Math.min(OVERDRAG_MAX_PX, (raw - heights.full) * OVERDRAG_RATIO);
    return { height: heights.full + over, offset: 0 };
  }
  if (raw < heights.peek) {
    return { height: heights.peek, offset: heights.peek - raw };
  }
  return { height: raw, offset: 0 };
}

/**
 * 指を離したときの行き先。velocity は px/ms（下が正）。
 * 勢いを見込んだ位置に一番近い段へ寄せる。見込んだ位置が低い段より十分下なら閉じる。
 */
export function resolveRelease(opts: {
  visibleHeight: number;
  velocity: number;
  heights: SnapHeights;
  dismissible: boolean;
}): SheetSnap | 'dismiss' {
  const projected = opts.visibleHeight - opts.velocity * FLING_PROJECTION_MS;
  if (opts.dismissible && projected < opts.heights.peek - DISMISS_MARGIN_PX) {
    return 'dismiss';
  }
  let best: SheetSnap = 'peek';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const snap of SHEET_SNAPS) {
    const distance = Math.abs(opts.heights[snap] - projected);
    if (distance < bestDistance) {
      best = snap;
      bestDistance = distance;
    }
  }
  return best;
}

/** つまみを押したとき: 低い → 中 → 高い → 低い */
export function cycleSnap(current: SheetSnap): SheetSnap {
  if (current === 'peek') return 'half';
  if (current === 'half') return 'full';
  return 'peek';
}

/** 矢印キー: 1 段ずつ上げ下げ（端で止まる） */
export function stepSnap(current: SheetSnap, direction: 1 | -1): SheetSnap {
  const index = SHEET_SNAPS.indexOf(current);
  const next = Math.min(SHEET_SNAPS.length - 1, Math.max(0, index + direction));
  return SHEET_SNAPS[next] ?? current;
}

/** 見出しを押したとき: 低い段なら中へ上げ、それ以外は低い段へ下げて地図を見せる */
export function toggleSnap(current: SheetSnap): SheetSnap {
  return current === 'peek' ? 'half' : 'peek';
}

/** 指の動きの直近の記録から速さ（px/ms、下が正）を出す。止めてから離したときは 0 */
export function releaseVelocity(
  samples: readonly { y: number; t: number }[],
  releaseTime: number,
  windowMs = 100,
): number {
  const last = samples[samples.length - 1];
  if (!last || releaseTime - last.t > 80) return 0;
  const recent = samples.filter((s) => last.t - s.t <= windowMs);
  const first = recent[0];
  if (!first || last.t - first.t < 8) return 0;
  return (last.y - first.y) / (last.t - first.t);
}
