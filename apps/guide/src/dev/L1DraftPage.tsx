import { useMemo, type ReactNode } from 'react';
import {
  SENRIYAMA_WINGS,
  tierOf,
  type AccessStatus,
  type L1Graph,
  type L1Node,
  type L1TierLayout,
} from '@kansai-u-3d/core';
import { AREA1_L1, AREA1_L1_TIERS, AREA1_L1_WING_ORDER } from '../data/indoor/l1/area1';

/**
 * 館内の L1 の画面の下書き（docs/indoor-plan.md 11 節、P1）。開発用の入口 `?l1=area1` だけで開き、アプリの画面からはまだリンクしない。
 * 棟を横、「同じ高さの段」を縦に並べた 2D の図（SVG）。連絡路は横線（段が食い違う物は斜め、隣り合わない棟は弧）、
 * 入口は外向きの印、エレベーターは縦の点線（止まる階は未確認）。ある・無い・分からないを描き分ける
 */

const AREAS: Record<string, { title: string; graph: L1Graph; tiers: L1TierLayout; order: readonly string[] }> = {
  area1: { title: '第1学舎 棟と階のつながり', graph: AREA1_L1, tiers: AREA1_L1_TIERS, order: AREA1_L1_WING_ORDER },
};

const COLOR = {
  navy: '#1B365D',
  ink: '#1D2430',
  muted: '#5F6875',
  line: '#47505E',
  faint: '#CFC7B8',
  yes: '#1F7A8C',
  no: '#C85A3A',
  paper: '#FFFFFF',
} as const;

/** 図の寸法（viewBox の単位。393px 幅の画面で 1 単位 ≒ 1px） */
const W = 361;
const PAD_X = 40;
const TOP = 52;
const ROW_H = 40;
const BOTTOM = 30;
const NODE_W = 26;
const NODE_H = 18;
const TRI = 7;

function stateFill(state: AccessStatus): string {
  if (state === 'yes') return COLOR.yes;
  if (state === 'no') return COLOR.no;
  return COLOR.paper;
}

function wingShortName(wingId: string): string {
  return SENRIYAMA_WINGS.find((w) => w.id === wingId)?.name ?? wingId;
}

interface DiagramProps {
  graph: L1Graph;
  tiers: L1TierLayout;
  order: readonly string[];
  title: string;
}

function L1Diagram({ graph, tiers, order, title }: DiagramProps) {
  const layout = useMemo(() => {
    const allTiers = graph.wings.flatMap((w) => w.floors.map((f) => tierOf(tiers, w.wingId, f.ordinal)));
    const minTier = Math.min(...allTiers);
    const maxTier = Math.max(...allTiers);
    const colGap = (W - PAD_X * 2) / Math.max(1, order.length - 1);
    const colX = new Map(order.map((id, i) => [id, PAD_X + i * colGap]));
    const y = (tier: number) => TOP + (maxTier - tier) * ROW_H;
    const height = TOP + (maxTier - minTier) * ROW_H + BOTTOM;
    return { minTier, maxTier, colX, y, height, colGap };
  }, [graph, tiers, order]);

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const pos = (n: Pick<L1Node, 'wingId' | 'floor'>) => ({
    x: layout.colX.get(n.wingId) ?? 0,
    y: layout.y(tierOf(tiers, n.wingId, n.floor)),
  });

  // 連絡路の形と端の位置。同じ階の箱の同じ側に複数の端が付くときは、上下に少しずらす
  const edgeGeoms = useMemo(() => {
    const at = (n: Pick<L1Node, 'wingId' | 'floor'>) => ({
      x: layout.colX.get(n.wingId) ?? 0,
      y: layout.y(tierOf(tiers, n.wingId, n.floor)),
    });
    const geoms = graph.edges.flatMap((edge) => {
      const a = nodeById.get(edge.from);
      const b = nodeById.get(edge.to);
      if (!a || !b) return [];
      const [left, right] = (layout.colX.get(a.wingId) ?? 0) <= (layout.colX.get(b.wingId) ?? 0) ? [a, b] : [b, a];
      const p = at(left);
      const q = at(right);
      const skip = Math.abs(order.indexOf(right.wingId) - order.indexOf(left.wingId)) > 1;
      const shape: 'straight' | 'slanted' | 'arc' = skip ? 'arc' : p.y === q.y ? 'straight' : 'slanted';
      return [{ edge, left, right, p, q, shape, slanted: p.y !== q.y, dl: 0, dr: 0 }];
    });
    const sides = new Map<string, { g: (typeof geoms)[number]; end: 'l' | 'r' }[]>();
    for (const g of geoms) {
      const kl = `${g.left.wingId}:${g.left.floor}:right`;
      const kr = `${g.right.wingId}:${g.right.floor}:left`;
      sides.set(kl, [...(sides.get(kl) ?? []), { g, end: 'l' }]);
      sides.set(kr, [...(sides.get(kr) ?? []), { g, end: 'r' }]);
    }
    // 横の線（段がそろう隣の棟）は箱の中ほどのまま、弧と斜めの線を下へずらす（横の線を傾けない）
    for (const list of sides.values()) {
      if (list.length < 2) continue;
      const straight = list.filter((item) => item.g.shape === 'straight');
      const others = list.filter((item) => item.g.shape !== 'straight');
      const set = (item: (typeof list)[number], d: number) => {
        if (item.end === 'l') item.g.dl = d;
        else item.g.dr = d;
      };
      straight.forEach((item, i) => set(item, straight.length > 1 ? -4 + (8 * i) / (straight.length - 1) : 0));
      others.forEach((item, i) => set(item, straight.length > 0 ? 6.5 + i * 2 : -4 + (8 * i) / Math.max(1, others.length - 1)));
    }
    return { geoms, usedSides: new Set(sides.keys()) };
  }, [graph, nodeById, layout, tiers, order]);

  // 入口は棟・階ごとにまとめ、連絡路の端の無い側（まず左、だめなら右）へ外向きに並べる
  const entranceGroups = useMemo(() => {
    const groups = new Map<string, L1Node[]>();
    for (const n of graph.nodes) {
      if (n.kind !== 'entrance') continue;
      const key = `${n.wingId}:${n.floor}`;
      groups.set(key, [...(groups.get(key) ?? []), n]);
    }
    // 段差なし → 分からない → 段差ありの順（段差なしの入口を建物の近くに）
    const rank: Record<AccessStatus, number> = { yes: 0, unknown: 1, no: 2 };
    return [...groups].map(([key, list]) => {
      list.sort((a, b) => rank[a.stepFree] - rank[b.stepFree]);
      const leftBusy = edgeGeoms.usedSides.has(`${key}:left`);
      const rightBusy = edgeGeoms.usedSides.has(`${key}:right`);
      const side: 'left' | 'right' = leftBusy && !rightBusy ? 'right' : 'left';
      return { list, side };
    });
  }, [graph, edgeGeoms]);

  // 連絡路でつながらない組の境目（点線の区切り）
  const separators = useMemo(() => {
    const out: number[] = [];
    let prevComp = -1;
    order.forEach((id, i) => {
      const comp = tiers.components.findIndex((c) => c.includes(id));
      if (i > 0 && comp !== prevComp) {
        const a = layout.colX.get(order[i - 1] ?? '') ?? 0;
        const b = layout.colX.get(id) ?? 0;
        out.push((a + b) / 2);
      }
      prevComp = comp;
    });
    return out;
  }, [order, tiers, layout]);

  return (
    <svg
      viewBox={`0 0 ${W} ${layout.height}`}
      role="img"
      aria-label={title}
      data-testid="l1-diagram"
      className="block h-auto w-full"
      style={{ fontFamily: 'inherit' }}
    >
      {separators.map((x) => (
        <line
          key={x}
          x1={x}
          x2={x}
          y1={TOP - 30}
          y2={layout.height - 8}
          stroke={COLOR.muted}
          strokeWidth={1}
          strokeDasharray="2 3"
          data-separator=""
        />
      ))}

      {/* 棟の列: 見出し・縦の線（エレベーターの印があれば点線）・階の箱 */}
      {graph.wings.map((w) => {
        const x = layout.colX.get(w.wingId) ?? 0;
        const tiersOfWing = w.floors.map((f) => tierOf(tiers, w.wingId, f.ordinal));
        const top = layout.y(Math.max(...tiersOfWing));
        const bottom = layout.y(Math.min(...tiersOfWing));
        const hasElevator = w.elevator === 'yes';
        return (
          <g key={w.wingId} data-wing={w.wingId} data-elevator={w.elevator}>
            <text x={x} y={16} textAnchor="middle" fontSize={12} fontWeight={700} fill={COLOR.navy}>
              {wingShortName(w.wingId)}
            </text>
            {/* エレベーターの印（ある = 箱、印なし = ?） */}
            <g transform={`translate(${x - 6}, 23)`}>
              <rect
                width={12}
                height={12}
                rx={2}
                fill={hasElevator ? COLOR.navy : COLOR.paper}
                stroke={hasElevator ? COLOR.navy : COLOR.muted}
                strokeDasharray={hasElevator ? undefined : '2 1.5'}
              />
              {hasElevator ? (
                <path d="M6 2.5 L8.6 5.5 H3.4 Z M6 9.5 L3.4 6.5 H8.6 Z" fill={COLOR.paper} />
              ) : (
                <text x={6} y={9.6} textAnchor="middle" fontSize={9} fontWeight={700} fill={COLOR.muted}>
                  ?
                </text>
              )}
            </g>
            <line
              x1={x}
              x2={x}
              y1={top}
              y2={bottom}
              stroke={hasElevator ? COLOR.navy : COLOR.faint}
              strokeWidth={hasElevator ? 2 : 1.5}
              strokeDasharray={hasElevator ? '3 3' : undefined}
            />
            {w.floors.map((f) => {
              const fy = layout.y(tierOf(tiers, w.wingId, f.ordinal));
              return (
                <g key={f.ordinal} data-floor-node={`${w.wingId}:${f.ordinal}`}>
                  <rect
                    x={x - NODE_W / 2}
                    y={fy - NODE_H / 2}
                    width={NODE_W}
                    height={NODE_H}
                    rx={4}
                    fill={COLOR.paper}
                    stroke={COLOR.navy}
                    strokeWidth={1.2}
                  />
                  <text x={x} y={fy + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={COLOR.ink}>
                    {f.label}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* 連絡路 */}
      {edgeGeoms.geoms.map(({ edge, left, right, p, q, shape, slanted, dl, dr }) => {
        const sx = p.x + NODE_W / 2;
        const ex = q.x - NODE_W / 2;
        const sy = p.y + dl;
        const ey = q.y + dr;
        const d =
          shape === 'arc'
            ? `M${sx} ${sy} Q${(sx + ex) / 2} ${Math.max(sy, ey) + ROW_H * 0.62} ${ex} ${ey}`
            : `M${sx} ${sy} L${ex} ${ey}`;
        const color = edge.stepFree === 'yes' ? COLOR.yes : edge.stepFree === 'no' ? COLOR.no : COLOR.line;
        const dash = edge.exists === 'no' ? '4 3' : edge.exists === 'unknown' ? '1 3' : undefined;
        return (
          <g
            key={edge.id}
            data-edge-id={edge.id}
            data-shape={shape}
            data-slanted={slanted ? 'true' : 'false'}
            data-step-free={edge.stepFree}
          >
            {/* ほかの棟の列をまたぐ弧は、下の線を白く抜いて重なりを見せる */}
            {shape === 'arc' && <path d={d} fill="none" stroke={COLOR.paper} strokeWidth={6} />}
            <path d={d} fill="none" stroke={color} strokeWidth={2.4} strokeDasharray={dash} strokeLinecap="round" />
            {edge.exists === 'no' && (
              <text x={(sx + ex) / 2} y={(sy + ey) / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
                ×
              </text>
            )}
            {[
              { n: left, x: sx, y: sy },
              { n: right, x: ex, y: ey },
            ].map(({ n, x, y }) => (
              <circle key={n.id} cx={x} cy={y} r={3.2} fill={stateFill(n.stepFree)} stroke={color} strokeWidth={1.3} />
            ))}
          </g>
        );
      })}

      {/* 外からの入口（外向きの三角） */}
      {entranceGroups.map(({ list, side }) => {
        const first = list[0];
        if (!first) return null;
        const { x, y } = pos(first);
        const dir = side === 'left' ? -1 : 1;
        return list.map((n, i) => {
          const tip = x + dir * (NODE_W / 2 + 3 + i * (TRI + 2));
          const base = tip - dir * TRI;
          return (
            <path
              key={n.id}
              data-entrance-id={n.id}
              data-step-free={n.stepFree}
              data-side={side}
              d={`M${base} ${y - 5} L${tip} ${y} L${base} ${y + 5} Z`}
              fill={stateFill(n.stepFree)}
              stroke={n.stepFree === 'unknown' ? COLOR.line : stateFill(n.stepFree)}
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          );
        });
      })}
    </svg>
  );
}

function LegendRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <svg width={28} height={14} viewBox="0 0 28 14" aria-hidden className="shrink-0">
        {icon}
      </svg>
      <span>{label}</span>
    </li>
  );
}

function Legend() {
  const tri = (fill: string, stroke: string, x: number) => (
    <path d={`M${x + 7} 2 L${x} 7 L${x + 7} 12 Z`} fill={fill} stroke={stroke} strokeWidth={1.2} strokeLinejoin="round" />
  );
  return (
    <ul className="mt-3 grid grid-cols-1 gap-1.5 text-[11px] leading-snug text-[#38404D]">
      <LegendRow
        icon={
          <>
            <line x1={2} y1={7} x2={26} y2={7} stroke={COLOR.line} strokeWidth={2.4} />
          </>
        }
        label="連絡路（段差は分からない）"
      />
      <LegendRow icon={<line x1={2} y1={7} x2={26} y2={7} stroke={COLOR.no} strokeWidth={2.4} />} label="連絡路（段差あり）" />
      <LegendRow
        icon={
          <>
            {tri(COLOR.yes, COLOR.yes, 2)}
            {tri(COLOR.paper, COLOR.line, 11)}
            {tri(COLOR.no, COLOR.no, 20)}
          </>
        }
        label="入口（連絡路の口の丸も同じ）: 段差なし／分からない／段差あり"
      />
      <LegendRow
        icon={
          <>
            <line x1={14} y1={1} x2={14} y2={13} stroke={COLOR.navy} strokeWidth={2} strokeDasharray="3 3" />
          </>
        }
        label="エレベーター（止まる階は未確認）。? は印なし"
      />
      <LegendRow
        icon={
          <>
            <line x1={2} y1={7} x2={26} y2={7} stroke={COLOR.line} strokeWidth={2.4} strokeDasharray="4 3" />
            <text x={14} y={11} textAnchor="middle" fontSize={10} fontWeight={700} fill={COLOR.line}>
              ×
            </text>
          </>
        }
        label="連絡路が無い（調べた所だけ）"
      />
      <LegendRow
        icon={<line x1={14} y1={0} x2={14} y2={14} stroke={COLOR.muted} strokeWidth={1} strokeDasharray="2 3" />}
        label="区切りの左右をつなぐ連絡路は分からない（1 階でそろえた）"
      />
      <LegendRow icon={null} label="線の無い所と階段は未調査" />
    </ul>
  );
}

export default function L1DraftPage({ area }: { area: string }) {
  const data = AREAS[area];
  return (
    <div className="h-full overflow-y-auto bg-[#EFECE4]">
      <main className="mx-auto w-full max-w-[520px] px-4 py-4">
        <div className="mb-2 flex items-center gap-2">
          <h1 className="text-[15px] font-bold text-[#1B365D]">{data ? data.title : '館内の図'}</h1>
          <span className="rounded bg-[#E9E2D3] px-1.5 py-0.5 text-[10px] font-bold text-[#5F6875]">下書き</span>
        </div>
        {data ? (
          <>
            <div className="rounded-2xl border border-[#DFD8CA] bg-white px-2 py-3">
              <L1Diagram graph={data.graph} tiers={data.tiers} order={data.order} title={data.title} />
            </div>
            <Legend />
          </>
        ) : (
          <p className="text-[12px] text-[#5F6875]">この学舎の図はまだありません。</p>
        )}
      </main>
    </div>
  );
}
