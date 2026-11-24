import type { L1Graph, L1TierLayout } from '@kansai-u-3d/core';

/** 館内の L1 の画面（`?l1=<id>`）で開く 1 つの学舎ぶん */
export interface L1AreaDef {
  id: string;
  title: string;
  graph: L1Graph;
  tiers: L1TierLayout;
  order: readonly string[];
  /** 図に描けない事（階段・台数・注意書きなど）を図の下に短く並べる */
  notes?: readonly string[];
  /** 手元だけの置き場（private.local）から読んだ物。画面に「手元だけ」と出す */
  localOnly?: boolean;
}

function isAreaDef(m: Partial<L1AreaDef>): m is L1AreaDef {
  return (
    typeof m.id === 'string' &&
    m.id.length > 0 &&
    typeof m.title === 'string' &&
    typeof m.graph === 'object' &&
    m.graph !== null &&
    typeof m.tiers === 'object' &&
    m.tiers !== null &&
    Array.isArray(m.order)
  );
}

/**
 * 公開の学舎の表に、手元だけの置き場のモジュール（`l1-*.ts` が id・title・graph・tiers・order〈と notes〉を export する）を足す。
 * 形の合わないモジュールは無視する。同じ id は手元の物で上書きする（公開の版に足す前の試し）
 */
export function mergeL1Areas(
  publicAreas: readonly L1AreaDef[],
  localModules: Readonly<Record<string, Partial<L1AreaDef>>>,
): Record<string, L1AreaDef> {
  const out: Record<string, L1AreaDef> = {};
  for (const a of publicAreas) out[a.id] = a;
  for (const path of Object.keys(localModules).sort()) {
    const m = localModules[path];
    if (!m || !isAreaDef(m)) continue;
    out[m.id] = {
      id: m.id,
      title: m.title,
      graph: m.graph,
      tiers: m.tiers,
      order: m.order,
      ...(m.notes ? { notes: m.notes } : {}),
      localOnly: true,
    };
  }
  return out;
}
