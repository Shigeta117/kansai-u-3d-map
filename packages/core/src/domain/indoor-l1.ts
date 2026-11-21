import type { AccessStatus } from './indoor-types';
import type { LocalPoint2D } from './types';
import type { Wing } from './wings';

/**
 * 館内の L1（平面図が無くても作れる館内の道）の試しの形（docs/indoor-plan.md 5〜7 節・11 節、P1）。
 * P2 の型の移行（17 節）で固めるまでは、ここの形は変わってよい。経路の探索（9 節）はまだ使わない。
 *
 * - 資料の事実（バリアフリーマップ）は建物ごとの表（BarrierFreeBuilding）と、キャンパスで 1 本の連絡路の表（IndoorConnector）に持つ
 * - L1 のグラフ（ノード・連絡路のエッジ・エレベーターの群）は buildL1Graph で事実の表から作る。平面の点は位置合わせの結果を別に渡す
 * - 1 つの値に意味を混ぜない（7 節）: 存在（exists）・段差なしで通れるか（stepFree）・出典（verified）を分ける
 */

// ---------- 出典 ----------

/** 出典の種類（docs/indoor-plan.md 3 節の表）。公開の版に入れてよいのは university-public だけ */
export type IndoorSourceKind = 'university-public' | 'field-survey' | 'university-permitted';

export interface IndoorSource {
  id: string;
  name: string;
  url: string;
  /** 資料の版（例: '2025年12月現在'） */
  edition: string;
  /** 資料をもう一度見て中身が変わっていないと確かめた日（7 節。版の日付とは別） */
  checkedAt: string;
  kind: IndoorSourceKind;
}

/** 確かめの記録（どの出典で・いつ確かめたか） */
export interface Verification {
  sourceId: string;
  checkedAt: string;
}

// ---------- 資料の事実（バリアフリーマップ） ----------

/** 入口・連絡口の扉の種類（資料の凡例の 3 種: 自動扉／開き戸など〈車いすは勧めない〉／階段など〈車いすは使えない〉） */
export type DoorKind = 'auto' | 'swing' | 'steps';

/** 段差の手がかり（資料の説明を自前の分類にした物） */
export type PassageObstacle =
  | 'stairs-outside' // 入口の手前に階段
  | 'stairs-inside' // 入ってすぐ階段
  | 'stairs-midway' // 連絡通路の途中に階段
  | 'step' // 入口に段差（stepCm）
  | 'step-inside' // 入った先に段差（stepCm）
  | 'groove'; // 通路に溝（grooveCm）

/** 外からの入口（資料の印 1 つ。連絡通路の口は IndoorConnector に持つ） */
export interface EntranceFact {
  /** 'bf-<図の番号>-<印の番号>'（資料の印の番号。確かめ直すときの手がかり） */
  id: string;
  /** 棟（建物に棟が複数あって資料から決まらないときは無し。学舎でない建物も無し） */
  wingId?: string;
  /** 入れる階（1 つの印が複数の階の入口を指すことがある） */
  floors: number[];
  door: DoorKind;
  obstacle?: PassageObstacle;
  stepCm?: number;
  /** 手前に階段があるが、車いすで通れる迂回路がある（資料の説明） */
  wheelchairDetour?: boolean;
  /** 資料の中で図の印と説明が食い違う（第2学舎 B棟の 1 か所: 印は自動扉、説明は開き戸） */
  sourceConflict?: boolean;
}

export type RestroomKind = 'standalone' | 'in-both' | 'in-mens' | 'in-womens';

/** 多機能トイレ（資料の印 1 つ・種類 1 つ） */
export interface RestroomFact {
  id: string;
  wingId?: string;
  /** 建物の中の部分の呼び名（総合図書館の南側・北側・書庫） */
  part?: string;
  floors: number[];
  /** standalone = 単独の多機能トイレ、in-both / in-mens / in-womens = 男女別のトイレの中にある多機能トイレ */
  kind: RestroomKind;
  ostomate?: boolean;
  /** 登録の要る区画の中（案内に出さない。docs/indoor-plan.md 9 節） */
  restricted?: boolean;
}

/** エレベーター（とリフト）の印 1 つ。止まる階は資料に添え書きがあるときだけ（無ければ未確認。7 節） */
export interface ElevatorGroupFact {
  kind: 'elevator' | 'lift';
  /** 棟（決まらなければ空。候補が複数なら wingUncertain） */
  wingIds: string[];
  wingUncertain?: boolean;
  stops?: number[];
}

/** 建物ごとの事実 */
export interface BarrierFreeBuilding {
  buildingId: string;
  /** 資料の施設一覧に載っているか（載っていなければ何も分からない） */
  listed: boolean;
  /** exists: 印があれば yes、無ければ unknown（「無い」とは書かれていない） */
  elevator: { exists: AccessStatus; groups: ElevatorGroupFact[] };
  entrances: EntranceFact[];
  restrooms: RestroomFact[];
}

/** 連絡路の端 */
export interface ConnectorEnd {
  buildingId: string;
  /** 棟（建物に棟が複数あって資料から決まらなければ null） */
  wingId: string | null;
  floor: number;
  /** その端の口の扉（資料の印が通路に 1 つだけなら無し） */
  door?: DoorKind;
}

/** 棟 ↔ 棟の連絡路（屋内の渡り廊下）。1 本 1 件・1 id（5 節）。向きは無い（両向きに通る） */
export interface IndoorConnector {
  id: string;
  from: ConnectorEnd;
  to: ConnectorEnd;
  exists: AccessStatus;
  obstacle?: PassageObstacle;
  grooveCm?: number;
  verified: Verification;
}

/**
 * 入口の段差なし（7 節の stepFree）: 凡例の「階段など」か段差・階段の手がかりがあれば no、自動扉で手がかりが無ければ yes、
 * 開き戸（車いすには勧めないとだけ書かれている）と、図と説明が食い違う印は unknown
 */
export function entranceStepFree(e: Pick<EntranceFact, 'door' | 'obstacle' | 'sourceConflict'>): AccessStatus {
  if (e.door === 'steps' || e.obstacle) return 'no';
  if (e.sourceConflict) return 'unknown';
  return e.door === 'auto' ? 'yes' : 'unknown';
}

/**
 * 連絡路の段差なし: どちらかの口が「階段など」か、途中に階段・溝があれば no。両方の口が自動扉でも、通路の中の段差は
 * 資料に無いので unknown（yes にはしない）
 */
export function connectorStepFree(c: Pick<IndoorConnector, 'from' | 'to' | 'obstacle'>): AccessStatus {
  if (c.obstacle || c.from.door === 'steps' || c.to.door === 'steps') return 'no';
  return 'unknown';
}

// ---------- L1 のグラフ ----------

export type L1NodeKind = 'entrance' | 'connector-mouth';

/** L1 のノード（6 節）: 棟・階・区画・平面の点 */
export interface L1Node {
  id: string;
  kind: L1NodeKind;
  wingId: string;
  floor: number;
  /** 区画。null = 分からない（資料だけで作った階は区画を決めない。6 節） */
  zone: string | null;
  /** 平面の点（ローカル m）。位置合わせの推定。合わせていない学舎は null */
  point: LocalPoint2D | null;
  exists: AccessStatus;
  stepFree: AccessStatus;
  door?: DoorKind;
  obstacle?: PassageObstacle;
  stepCm?: number;
  /** 連絡路の口なら、その連絡路 */
  connectorId?: string;
  verified: Verification;
}

/** 連絡路のエッジ（両端は連絡路の口のノード） */
export interface L1ConnectorEdge {
  id: string;
  from: string;
  to: string;
  exists: AccessStatus;
  stepFree: AccessStatus;
  obstacle?: PassageObstacle;
  grooveCm?: number;
  verified: Verification;
}

/** エレベーターの群。止まる階が分からなければ stops は null（経路には使わない。7 節） */
export interface L1ElevatorGroup {
  id: string;
  kind: 'elevator' | 'lift';
  wingIds: string[];
  wingUncertain: boolean;
  stops: number[] | null;
  verified: Verification;
}

/** 棟ごとの階（5 節: 並び順と表示の名前。高さは持たない） */
export interface L1WingFloors {
  wingId: string;
  /** 下から順 */
  floors: { ordinal: number; label: string }[];
  /** エレベーターの有無（資料の印。無ければ unknown） */
  elevator: AccessStatus;
}

export interface L1Graph {
  wings: L1WingFloors[];
  nodes: L1Node[];
  edges: L1ConnectorEdge[];
  elevators: L1ElevatorGroup[];
}

/** 階の表示の名前（地下は B1、地上は数字だけ） */
export function floorLabel(ordinal: number): string {
  return ordinal < 0 ? `B${-ordinal}` : String(ordinal);
}

/** 棟の階の並び（地下〜地上） */
export function wingOrdinals(wing: Pick<Wing, 'floorsAbove' | 'floorsBelow'>): number[] {
  const out: number[] = [];
  for (let b = wing.floorsBelow; b >= 1; b--) out.push(-b);
  for (let f = 1; f <= wing.floorsAbove; f++) out.push(f);
  return out;
}

export interface BuildL1GraphInput {
  /** 対象の棟（この順で wings を返す） */
  wings: readonly Wing[];
  facts: readonly BarrierFreeBuilding[];
  connectors: readonly IndoorConnector[];
  source: IndoorSource;
  /** ノードの id → 平面の点（位置合わせの結果）。無いノードは point: null */
  points?: Readonly<Record<string, LocalPoint2D>>;
}

/** 連絡路の口のノードの id */
export function connectorMouthId(connectorId: string, wingId: string): string {
  return `${connectorId}@${wingId}`;
}

/** 入口のノードの id（1 つの印が複数の階を指すときは階ごとに分ける） */
export function entranceNodeId(entranceId: string, floor: number, floorsOfEntrance: number): string {
  return floorsOfEntrance > 1 ? `${entranceId}@${floorLabel(floor)}` : entranceId;
}

/** 資料の事実から、対象の棟の L1 のグラフを作る（両端が対象の棟の連絡路だけ） */
export function buildL1Graph(input: BuildL1GraphInput): L1Graph {
  const wingIds = new Set(input.wings.map((w) => w.id));
  const verified: Verification = { sourceId: input.source.id, checkedAt: input.source.checkedAt };
  const pointOf = (id: string): LocalPoint2D | null => input.points?.[id] ?? null;

  const elevatorByWing = new Map<string, AccessStatus>();
  const elevators: L1ElevatorGroup[] = [];
  const nodes: L1Node[] = [];
  for (const b of input.facts) {
    b.elevator.groups.forEach((g, i) => {
      if (!g.wingIds.some((id) => wingIds.has(id))) return;
      if (!g.wingUncertain) for (const id of g.wingIds) elevatorByWing.set(id, 'yes');
      elevators.push({
        id: `${b.buildingId}-ev${i + 1}`,
        kind: g.kind,
        wingIds: [...g.wingIds],
        wingUncertain: Boolean(g.wingUncertain),
        stops: g.stops ? [...g.stops] : null,
        verified,
      });
    });
    for (const e of b.entrances) {
      if (!e.wingId || !wingIds.has(e.wingId)) continue;
      for (const floor of e.floors) {
        const id = entranceNodeId(e.id, floor, e.floors.length);
        nodes.push({
          id,
          kind: 'entrance',
          wingId: e.wingId,
          floor,
          zone: null,
          point: pointOf(id),
          exists: 'yes',
          stepFree: entranceStepFree(e),
          door: e.door,
          ...(e.obstacle ? { obstacle: e.obstacle } : {}),
          ...(e.stepCm !== undefined ? { stepCm: e.stepCm } : {}),
          verified,
        });
      }
    }
  }

  const edges: L1ConnectorEdge[] = [];
  for (const c of input.connectors) {
    const a = c.from.wingId;
    const z = c.to.wingId;
    if (!a || !z || !wingIds.has(a) || !wingIds.has(z)) continue;
    const mouth = (end: ConnectorEnd, wingId: string): L1Node => {
      const id = connectorMouthId(c.id, wingId);
      // 口の段差なし: 口の扉で決める（扉の印が無い通路は、通路の手がかりで決める）
      const stepFree = end.door ? entranceStepFree({ door: end.door }) : connectorStepFree(c);
      return {
        id,
        kind: 'connector-mouth',
        wingId,
        floor: end.floor,
        zone: null,
        point: pointOf(id),
        exists: c.exists,
        stepFree,
        ...(end.door ? { door: end.door } : {}),
        connectorId: c.id,
        verified,
      };
    };
    const from = mouth(c.from, a);
    const to = mouth(c.to, z);
    nodes.push(from, to);
    edges.push({
      id: c.id,
      from: from.id,
      to: to.id,
      exists: c.exists,
      stepFree: connectorStepFree(c),
      ...(c.obstacle ? { obstacle: c.obstacle } : {}),
      ...(c.grooveCm !== undefined ? { grooveCm: c.grooveCm } : {}),
      verified,
    });
  }

  const wings: L1WingFloors[] = input.wings.map((w) => ({
    wingId: w.id,
    floors: wingOrdinals(w).map((ordinal) => ({ ordinal, label: floorLabel(ordinal) })),
    elevator: elevatorByWing.get(w.id) ?? 'unknown',
  }));
  return { wings, nodes, edges, elevators };
}

// ---------- L1 の画面の「同じ高さの段」（11 節） ----------

export interface L1TierLayout {
  /** 棟ごとの段のずれ: 段 = 階の並び（ordinal）＋ずれ（地下の階は ordinal + 1 して数える） */
  offsets: Map<string, number>;
  /** 連絡路でつながる棟の組（最初の組が基準。ほかの組は 1 階どうしをそろえただけ） */
  components: string[][];
  /** 段がそろわない連絡路（輪の食い違い・途中に階段）。画面では斜めの線で描く */
  slanted: string[];
  /** 段を決める連絡路どうしが食い違った物（データの誤りの疑い。検証で 0 件を確かめる） */
  conflicts: string[];
}

/** 段の番号（1 階 = 段 1 を基準に、地下 1 階 = 段 0） */
export function tierOf(layout: Pick<L1TierLayout, 'offsets'>, wingId: string, ordinal: number): number {
  const base = ordinal < 0 ? ordinal + 1 : ordinal;
  return base + (layout.offsets.get(wingId) ?? 0);
}

/**
 * 連絡路の両端を同じ段に置いて、棟ごとの段のずれを決める（高さの数値は使わない）。途中に階段のある連絡路は段を決めるのに使わない。
 * 連絡路でつながらない棟の組は、組の最初の棟の 1 階を段 1 に置く
 */
export function alignL1Tiers(wingOrder: readonly string[], edges: readonly L1ConnectorEdge[], nodes: readonly L1Node[]): L1TierLayout {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const base = (ordinal: number): number => (ordinal < 0 ? ordinal + 1 : ordinal);
  type Link = { edge: L1ConnectorEdge; a: L1Node; b: L1Node };
  const links: Link[] = [];
  for (const edge of edges) {
    const a = nodeById.get(edge.from);
    const b = nodeById.get(edge.to);
    if (a && b && edge.exists === 'yes') links.push({ edge, a, b });
  }
  const levelLinks = links.filter((l) => l.edge.obstacle !== 'stairs-midway');
  const offsets = new Map<string, number>();
  const components: string[][] = [];
  const conflicts: string[] = [];
  for (const start of wingOrder) {
    if (offsets.has(start)) continue;
    offsets.set(start, 0);
    const comp = [start];
    const queue = [start];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const l of levelLinks) {
        const pairs: [L1Node, L1Node][] = [
          [l.a, l.b],
          [l.b, l.a],
        ];
        for (const [p, q] of pairs) {
          if (p.wingId !== cur) continue;
          const want = base(p.floor) + (offsets.get(cur) ?? 0) - base(q.floor);
          const have = offsets.get(q.wingId);
          if (have === undefined) {
            offsets.set(q.wingId, want);
            comp.push(q.wingId);
            queue.push(q.wingId);
          } else if (have !== want && !conflicts.includes(l.edge.id)) {
            conflicts.push(l.edge.id);
          }
        }
      }
    }
    components.push(comp.sort((x, y) => wingOrder.indexOf(x) - wingOrder.indexOf(y)));
  }
  const layout = { offsets };
  const slanted = links
    .filter((l) => tierOf(layout, l.a.wingId, l.a.floor) !== tierOf(layout, l.b.wingId, l.b.floor))
    .map((l) => l.edge.id);
  return { offsets, components, slanted, conflicts };
}
