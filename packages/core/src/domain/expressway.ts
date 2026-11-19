/**
 * 高速道路の路面の高さと橋脚の位置を決める純粋な計算（データの生成 scripts/build-campus-data.mjs とテストが使う）。
 * OSM に高さの情報が無いので、ここで決める高さはすべて推定。
 */

export interface ProfileSample {
  /** 線に沿った距離（m） */
  s: number;
  /** その点の DEM の標高（m） */
  dem: number;
  /** DEM を路面の高さに使わない点（高架の区間・下をくぐる道の前後） */
  excluded: boolean;
}

export interface ProfileWindows {
  /** 中央値をとる窓の半分の長さ（m） */
  median: number;
  /** ならす（移動平均）窓の半分の長さ（m） */
  smooth: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * 路面の高さ（推定）。
 * 1. 使える点（excluded でない）は、前後 median m の DEM の中央値（建物・小さな谷の影響を消す）
 * 2. 使えない点（高架など）は、前後の使える点の値を距離で直線につなぐ（片側しか無ければその値）
 * 3. 前後 smooth m の移動平均でならす（道の高さは急に上下しない）
 */
export function computeRoadProfile(samples: ProfileSample[], windows: ProfileWindows): number[] {
  const n = samples.length;
  if (n === 0) return [];
  const base: (number | null)[] = samples.map((p) => {
    if (p.excluded) return null;
    const win: number[] = [];
    for (const q of samples) {
      if (!q.excluded && Math.abs(q.s - p.s) <= windows.median) win.push(q.dem);
    }
    return win.length > 0 ? median(win) : null;
  });

  const anyDefined = base.some((v) => v !== null);
  const filled: number[] = base.map((v, i) => {
    if (v !== null) return v;
    if (!anyDefined) return samples[i]?.dem ?? 0;
    let a = i - 1;
    while (a >= 0 && base[a] === null) a--;
    let b = i + 1;
    while (b < n && base[b] === null) b++;
    const va = a >= 0 ? base[a] : null;
    const vb = b < n ? base[b] : null;
    if (va === null || va === undefined) return vb ?? 0;
    if (vb === null || vb === undefined) return va;
    const sa = samples[a]?.s ?? 0;
    const sb = samples[b]?.s ?? 0;
    const si = samples[i]?.s ?? 0;
    const t = sb > sa ? (si - sa) / (sb - sa) : 0;
    return va + (vb - va) * t;
  });

  return samples.map((p) => {
    let sum = 0;
    let count = 0;
    for (let j = 0; j < n; j++) {
      const q = samples[j];
      if (!q || Math.abs(q.s - p.s) > windows.smooth) continue;
      sum += filled[j] ?? 0;
      count++;
    }
    return count > 0 ? sum / count : (filled[0] ?? 0);
  });
}

/**
 * 線分 ab と cd の交点。ab 上の位置 t（0〜1）と cd 上の位置 u を返す。交わらなければ null
 */
export function segmentIntersection(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number],
): { t: number; u: number } | null {
  const rx = b[0] - a[0];
  const rz = b[1] - a[1];
  const sx = d[0] - c[0];
  const sz = d[1] - c[1];
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const qx = c[0] - a[0];
  const qz = c[1] - a[1];
  const t = (qx * sz - qz * sx) / denom;
  const u = (qx * rz - qz * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

export interface ClearanceRequirement {
  /** 線に沿った距離（m） */
  s: number;
  /** その位置で路面が少なくともこの標高であること（m） */
  minElev: number;
}

/**
 * 路面が requirement より低いところを、なめらかな山（余弦の形、半分の長さ halfLength）で持ち上げる。
 * 山どうしは足さずに大きい方をとる
 */
export function applyClearanceBumps(
  s: readonly number[],
  elev: readonly number[],
  requirements: readonly ClearanceRequirement[],
  halfLength: number,
): number[] {
  const lift = new Array<number>(elev.length).fill(0);
  for (const req of requirements) {
    // 要求の位置での今の高さ（線形補間）
    let cur = elev[0] ?? 0;
    for (let i = 0; i < s.length - 1; i++) {
      const s0 = s[i] ?? 0;
      const s1 = s[i + 1] ?? 0;
      if (req.s >= s0 && req.s <= s1) {
        const t = s1 > s0 ? (req.s - s0) / (s1 - s0) : 0;
        cur = (elev[i] ?? 0) + ((elev[i + 1] ?? 0) - (elev[i] ?? 0)) * t;
        break;
      }
    }
    const need = req.minElev - cur;
    if (need <= 0) continue;
    for (let i = 0; i < s.length; i++) {
      const d = Math.abs((s[i] ?? 0) - req.s);
      if (d >= halfLength) continue;
      const w = 0.5 * (1 + Math.cos((Math.PI * d) / halfLength));
      lift[i] = Math.max(lift[i] ?? 0, need * w);
    }
  }
  return elev.map((e, i) => e + (lift[i] ?? 0));
}

export interface PierSpacingRule {
  target: number;
  min: number;
  max: number;
  /** 橋の端（橋台）から最初の橋脚までの最低の距離 */
  endClearance: number;
}

/**
 * 高架の区間 [s0, s1] に橋脚を置く位置（線に沿った距離）を選ぶ。
 * isAllowed(s) が false の位置（線路・ホーム・道路・建物の上）には置かない。
 * 前の橋脚（または橋の端）から target に近い位置を、min〜max の範囲で選ぶ。範囲に置ける所が無ければ、
 * その先で最初に置ける所に置く
 */
export function choosePierStations(
  s0: number,
  s1: number,
  rule: PierSpacingRule,
  isAllowed: (s: number) => boolean,
  step = 0.5,
): number[] {
  const out: number[] = [];
  let prev = s0;
  const lastAllowed = s1 - rule.endClearance;
  let guard = 0;
  while (guard++ < 1000) {
    const remaining = s1 - prev;
    // 残りが max 以下なら、橋の端までもう置かなくてよい
    if (remaining <= rule.max) break;
    const lo = prev === s0 ? Math.max(prev + rule.min, s0 + rule.endClearance) : prev + rule.min;
    const hi = Math.min(prev + rule.max, lastAllowed);
    let best: number | null = null;
    let bestDist = Infinity;
    for (let s = lo; s <= hi + 1e-9; s += step) {
      if (!isAllowed(s)) continue;
      const d = Math.abs(s - (prev + rule.target));
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    if (best === null) {
      for (let s = hi + step; s <= lastAllowed; s += step) {
        if (isAllowed(s)) {
          best = s;
          break;
        }
      }
    }
    if (best === null) break;
    out.push(Number(best.toFixed(2)));
    prev = best;
  }
  return out;
}
