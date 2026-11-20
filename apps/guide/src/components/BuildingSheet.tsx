import {
  Accessibility,
  ArrowRight,
  Building2,
  Compass,
  DoorOpen,
  ExternalLink,
  Layers,
  MapPin,
  Navigation,
  PlugZap,
  Route as RouteIcon,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORY_OPTIONS,
  findWing,
  getCategoryLabel,
  normalizeSearchText,
  wingHasFloor,
  wingTitle,
  type BuildingFeature,
  type BuildingWing,
  type AccessStatus,
  type BuildingFloorPlan,
} from '@kansai-u-3d/core';
import { ROOM_KIND_LABELS } from '../data/indoor/senriyama-indoor';
import { OFFICIAL_ACCESS_SOURCE, SENRIYAMA_OFFICIAL_ACCESS } from '../data/indoor/senriyama-official-access';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { useIsSheetLayout } from '../hooks/useMediaQuery';
import { BottomSheet } from './BottomSheet';
import type { SheetSnap } from './bottomSheetSnap';

type SheetTab = 'overview' | 'floors' | 'access';

interface BuildingSheetProps {
  building: BuildingFeature | null;
  floorPlan?: BuildingFloorPlan;
  /** 選んでいる建物の中の棟（第3学舎の A〜D棟など）。見出しを棟の名前にし、「フロア・教室」をその棟に絞る */
  wing?: BuildingWing | null;
  initialFloor?: number;
  /** 開いたときのタブ（棟の名前で検索したら「フロア・教室」）。initialFloor があれば「フロア・教室」 */
  initialTab?: 'floors';
  /** スマホで開いたときの段（地図で選んだら低い段、検索から来たら中の段など） */
  initialSnap?: SheetSnap;
  allBuildings: BuildingFeature[];
  onClose: () => void;
  onFocusBuilding: (building: BuildingFeature) => void;
  onNavigateTo: (building: BuildingFeature) => void;
  onSetAsOrigin: (building: BuildingFeature) => void;
  onJumpToBuildingId: (buildingId: string) => void;
  /** 棟を選び直す（null は建物全体）。地図の光らせ方も替わる */
  onSelectWing?: (wingId: string | null) => void;
  /** スマホで、シートが地図を覆っている高さ（閉じると 0） */
  onSheetHeightChange?: (height: number) => void;
}

const ACCESS_LABEL: Record<AccessStatus, string> = { yes: 'あり', no: 'なし', unknown: '印なし（未確認）' };

function AccessibilityNotice({ buildingId }: { buildingId?: string }) {
  const official = buildingId ? SENRIYAMA_OFFICIAL_ACCESS[buildingId] : undefined;
  return (
    <div className="rounded-xl border border-[#E3DDD1] bg-[#F5F1E8] px-3 py-2 text-[11px] leading-relaxed text-[#4B5360]">
      {official ? (
        <>
          <ul className="space-y-0.5">
            <li>エレベーター: {ACCESS_LABEL[official.elevator]}</li>
            <li>自動扉の入口: {ACCESS_LABEL[official.autoDoorEntrance]}</li>
            <li>
              多機能トイレ: {ACCESS_LABEL[official.accessibleRestroom]}
              {official.restroomFloors ? ` — ${official.restroomFloors}` : ''}
            </li>
          </ul>
        </>
      ) : (
        <p>バリアフリーの情報はありません</p>
      )}
      <a
        href={OFFICIAL_ACCESS_SOURCE.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1 font-semibold text-[#1B365D] hover:underline"
      >
        <span>大学のバリアフリーマップ</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    </div>
  );
}

const TABS = [
  { id: 'overview', label: '概要' },
  { id: 'floors', label: 'フロア・教室' },
  { id: 'access', label: '出入口・連絡' },
] as const;

/** sm 以上の右に浮くパネル（従来のまま） */
const DESKTOP_CLASS =
  't-panel-right pointer-events-auto fixed bottom-0 left-0 right-0 z-20 mx-auto max-h-[60dvh] w-full max-w-lg rounded-t-2xl border border-[#DDD6C8] bg-[#FAF7F2]/96 p-4 shadow-2xl backdrop-blur-md sm:bottom-5 sm:left-auto sm:right-5 sm:mx-0 sm:max-h-[calc(100dvh-9.5rem)] sm:w-[376px] sm:rounded-2xl flex flex-col';

export function BuildingSheet({
  building,
  floorPlan,
  wing = null,
  initialFloor,
  initialTab,
  initialSnap = 'half',
  allBuildings,
  onClose,
  onFocusBuilding,
  onNavigateTo,
  onSetAsOrigin,
  onJumpToBuildingId,
  onSelectWing,
  onSheetHeightChange,
}: BuildingSheetProps) {
  const { mounted, visible } = useAnimatedPresence(Boolean(building), 350);
  const isSheet = useIsSheetLayout();
  const [cachedBuilding, setCachedBuilding] = useState<BuildingFeature | null>(building);
  const [activeTab, setActiveTab] = useState<SheetTab>('overview');
  const [selectedWing, setSelectedWing] = useState<string | 'all'>('all');
  const [selectedFloor, setSelectedFloor] = useState<number | 'all'>('all');
  const [roomQuery, setRoomQuery] = useState('');
  const [snap, setSnap] = useState<SheetSnap>(initialSnap);
  const contentRef = useRef<HTMLDivElement>(null);
  const tabsAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (building) {
      setCachedBuilding(building);
      if (initialFloor !== undefined) {
        setActiveTab('floors');
        setSelectedFloor(initialFloor);
      } else {
        setActiveTab(initialTab === 'floors' ? 'floors' : 'overview');
        setSelectedFloor('all');
      }
      setSelectedWing('all');
      setRoomQuery('');
      setSnap(initialSnap);
      contentRef.current?.scrollTo({ top: 0 });
    }
  }, [building, initialFloor, initialTab, initialSnap]);

  const target = building ?? cachedBuilding;

  // 建物が棟を持てば（第3学舎）、棟の絞り込みは選んでいる棟（地図の光らせ方と同じ）に従う。持たなければシートの中だけの絞り込み
  const wingControlled = Boolean(onSelectWing) && (target?.wings?.length ?? 0) > 0;
  const activeWing = wingControlled ? findWing(target, wing?.id) : null;
  const wingFilter: string | 'all' = wingControlled ? (activeWing?.id ?? 'all') : selectedWing;
  // 選んでいる階がその棟に無ければ（棟を替えたとき）、全フロアに戻して見せる
  const floorFilter: number | 'all' =
    selectedFloor !== 'all' && activeWing && !wingHasFloor(activeWing, selectedFloor) ? 'all' : selectedFloor;

  /** 部屋の棟の絞り込みの鍵: 棟の id があれば id、無ければ棟の表示の名前 */
  const availableWings = useMemo(() => {
    if (!floorPlan) return [];
    const seen = new Map<string, string>();
    for (const r of floorPlan.rooms) {
      const key = r.wingId ?? r.wing;
      if (key && !seen.has(key)) seen.set(key, r.wing ?? key);
    }
    return [...seen].map(([key, label]) => ({ key, label }));
  }, [floorPlan]);

  // 階のボタンは、棟を選んでいればその棟の階だけ
  const floorChips = (floorPlan?.floors ?? []).filter((fl) => !activeWing || wingHasFloor(activeWing, fl.floor));

  const chooseWing = (key: string | 'all') => {
    if (wingControlled && onSelectWing && (key === 'all' || findWing(target, key))) {
      onSelectWing(key === 'all' ? null : key);
    } else {
      setSelectedWing(key);
    }
  };

  const filteredRooms = useMemo(() => {
    if (!floorPlan) return [];
    const nq = normalizeSearchText(roomQuery);
    return floorPlan.rooms.filter((r) => {
      if (wingFilter !== 'all' && (r.wingId ?? r.wing) !== wingFilter) return false;
      if (floorFilter !== 'all' && r.floor !== floorFilter) return false;
      if (!nq) return true;
      if (
        normalizeSearchText(r.code).includes(nq) ||
        normalizeSearchText(r.name).includes(nq) ||
        normalizeSearchText(r.wing ?? '').includes(nq) ||
        normalizeSearchText(r.note ?? '').includes(nq)
      ) {
        return true;
      }
      return Boolean(
        r.searchableCodes?.some((c) => normalizeSearchText(c).includes(nq)),
      );
    });
  }, [floorPlan, wingFilter, floorFilter, roomQuery]);

  if (!mounted || !target) return null;

  // 中学校・高等学校・幼稚園の施設は、名称のほかの情報（階数・設備・出入口・経路）を出さない（持ち主の決め、2026-11-20）
  const nameOnly = target.infoPolicy === 'name-only';
  const nameOnlyNote = (
    <p className="mt-2 rounded-xl border border-[#E6DFD2] bg-white px-3 py-2.5 text-[12px] leading-relaxed text-[#4B5360]">
      中学校・高等学校などの施設のため、名称だけを表示しています。
    </p>
  );

  const catColor =
    CATEGORY_OPTIONS.find((c) => c.id === target.category)?.color ?? '#64748B';
  const state = visible ? 'open' : 'closed';

  const getBuildingShortName = (id: string) =>
    allBuildings.find((b) => b.id === id)?.shortName ?? id;

  const selectTab = (id: SheetTab) => {
    setActiveTab(id);
    // スマホでは、下へ読み進めた所でタブを替えたら新しいタブの先頭から見せる
    const content = contentRef.current;
    const anchor = tabsAnchorRef.current;
    if (!isSheet || !content || !anchor) return;
    const anchorTop =
      anchor.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop;
    if (content.scrollTop > anchorTop) content.scrollTop = anchorTop;
  };

  const chips = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white"
        style={{ backgroundColor: catColor }}
      >
        {getCategoryLabel(target.category)}
      </span>
    </div>
  );

  // 見出し: 棟を選んでいれば棟の名前（例: 第3学舎 3号館 C棟）
  const title = activeWing ? wingTitle(activeWing) : target.name;
  const wholeBuildingRow = activeWing ? (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#5F6875]">
      <span className="min-w-0">{target.name}の棟</span>
      <button
        type="button"
        onClick={() => chooseWing('all')}
        className="t-interactive inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#D4CCB8] bg-white px-2 py-0.5 text-[10.5px] font-bold text-[#1B365D] hover:bg-[#EFE9DC]"
      >
        <Building2 className="h-3 w-3" />
        <span>建物全体を見る</span>
      </button>
    </div>
  ) : null;

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label="詳細パネルを閉じる"
      className={`t-interactive rounded-lg text-[#5F6875] hover:bg-[#EAE3D6] hover:text-[#1D2430] ${
        isSheet ? '-mr-2 flex h-9 w-9 shrink-0 items-center justify-center' : 'p-1.5'
      }`}
    >
      <X className="h-4 w-4" />
    </button>
  );

  const tabList = (className: string) => (
    <div role="tablist" aria-label="建物詳細タブ" className={className}>
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => selectTab(tab.id)}
            className={`t-interactive rounded-lg px-2 py-1.5 text-[11.5px] font-bold ${
              active
                ? 'bg-white text-[#1B365D] shadow-xs'
                : 'text-[#5F6875] hover:text-[#1D2430]'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
  const TAB_LIST_BOX = 'grid grid-cols-3 gap-1 rounded-xl border border-[#E5DEC9] bg-[#F1ECE1] p-1';

  const tabBody = (
    <>
      {activeTab === 'overview' && (
        <div key="overview" className="t-tab-panel space-y-2.5">
          {target.faculties.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {target.faculties.map((f) => (
                <span
                  key={f}
                  className="rounded-md border border-[#E2DACB] bg-[#F4EFE5] px-2 py-0.5 text-[11px] font-semibold text-[#3B4350]"
                >
                  {f}
                </span>
              ))}
            </div>
          )}

          <p className="text-[12.5px] leading-relaxed text-[#38404D]">
            {target.description ||
              '関西大学千里山キャンパスの施設です。ルート検索でここまでの徒歩ルートと高低差・段差なし参考経路を確認できます。'}
          </p>

        </div>
      )}

      {activeTab === 'floors' && (
        <div key="floors" className="t-tab-panel space-y-2">
          {floorPlan ? (
            <>
              {floorPlan.numberingRule && (
                <div className="rounded-xl border border-[#E5DEC9] bg-[#F5F0E6] px-3 py-2 text-[11px] font-bold leading-relaxed text-[#1B365D]">
                  番号規則: {floorPlan.numberingRule}
                </div>
              )}

              {availableWings.length > 1 && (
                <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    onClick={() => chooseWing('all')}
                    aria-pressed={wingFilter === 'all'}
                    className={`t-interactive shrink-0 rounded-lg border px-2 py-0.5 text-[10.5px] font-bold ${
                      wingFilter === 'all'
                        ? 'border-[#C85A3A] bg-[#C85A3A] text-white'
                        : 'border-[#DCD4C5] bg-white text-[#47505E]'
                    }`}
                  >
                    全棟
                  </button>
                  {availableWings.map((w) => {
                    const active = wingFilter === w.key;
                    return (
                      <button
                        key={w.key}
                        type="button"
                        onClick={() => chooseWing(w.key)}
                        aria-pressed={active}
                        className={`t-interactive shrink-0 rounded-lg border px-2 py-0.5 text-[10.5px] font-bold ${
                          active
                            ? 'border-[#C85A3A] bg-[#C85A3A] text-white'
                            : 'border-[#DCD4C5] bg-white text-[#47505E]'
                        }`}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedFloor('all')}
                  className={`t-interactive shrink-0 rounded-lg border px-2 py-1 text-[11px] font-bold ${
                    floorFilter === 'all'
                      ? 'border-[#1B365D] bg-[#1B365D] text-white'
                      : 'border-[#DCD4C5] bg-white text-[#47505E]'
                  }`}
                >
                  全フロア
                </button>
                {floorChips.map((fl) => {
                  const active = floorFilter === fl.floor;
                  return (
                    <button
                      key={fl.floor}
                      type="button"
                      onClick={() => setSelectedFloor(fl.floor)}
                      className={`t-interactive flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold ${
                        active
                          ? 'border-[#1B365D] bg-[#1B365D] text-white'
                          : 'border-[#DCD4C5] bg-white text-[#47505E]'
                      }`}
                    >
                      <span>{fl.label}</span>
                      {fl.groundAccess && (
                        <span
                          className={`text-[9px] font-semibold ${
                            active ? 'text-[#A7D7EA]' : 'text-[#2B8A6E]'
                          }`}
                        >
                          地表
                        </span>
                      )}
                      {fl.elevator === 'yes' && (
                        <span
                          className={`text-[9px] font-semibold ${
                            active ? 'text-[#D7E6F5]' : 'text-[#1B365D]'
                          }`}
                        >
                          エレベーター
                        </span>
                      )}
                      {fl.accessibleRestroom === 'yes' && (
                        <span
                          className={`text-[9px] font-semibold ${
                            active ? 'text-[#A7D7EA]' : 'text-[#1F7A8C]'
                          }`}
                        >
                          多機能トイレ
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-[#DCD4C5] bg-white px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-[#666F7B]" />
                <input
                  type="search"
                  value={roomQuery}
                  onChange={(e) => setRoomQuery(e.target.value)}
                  placeholder="教室番号・名前で絞り込み"
                  className="w-full bg-transparent text-[11.5px] text-[#1D2430] placeholder:text-[#8A929E] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                {filteredRooms.length > 0 ? (
                  filteredRooms.map((room) => (
                    <div
                      key={room.id}
                      className="rounded-xl border border-[#E6DFD1] bg-white px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 rounded bg-[#1B365D]/10 px-1.5 py-0.5 text-[10.5px] font-bold text-[#1B365D]">
                            {room.floor < 0 ? `B${Math.abs(room.floor)}F` : `${room.floor}F`}
                          </span>
                          {room.wing && (
                            <span className="shrink-0 rounded border border-[#E2DACB] bg-[#F7F3EB] px-1.5 py-0.5 text-[10px] font-semibold text-[#5C4938]">
                              {room.wing}
                            </span>
                          )}
                          <span className="truncate text-[12px] font-bold text-[#1D2430]">
                            {room.code}
                          </span>
                        </div>
                        <span className="shrink-0 rounded-full bg-[#F1ECE1] px-2 py-0.5 text-[10px] font-semibold text-[#5A6270]">
                          {ROOM_KIND_LABELS[room.kind]}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] font-medium text-[#37404E]">
                        {room.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[#666F7B]">
                        {room.searchableCodes && room.searchableCodes.length > 1 && (
                          <span className="tabular-nums text-[#1B365D]">
                            対象 {room.searchableCodes.length}室
                          </span>
                        )}
                        {room.capacity !== undefined && (
                          <span className="tabular-nums">定員約 {room.capacity}名</span>
                        )}
                        {room.access === 'yes' && (
                          <span className="inline-flex items-center gap-0.5 text-[#1F7A8C]">
                            <Accessibility className="h-3 w-3" />
                            バリアフリー
                          </span>
                        )}
                        {room.access === 'no' && (
                          <span className="inline-flex items-center gap-0.5 font-semibold text-[#9A4A2E]">
                            段差あり
                          </span>
                        )}
                        {room.powerOutlets && (
                          <span className="inline-flex items-center gap-0.5 text-[#B86A38]">
                            <PlugZap className="h-3 w-3" />
                            PC・電源設備
                          </span>
                        )}
                        {room.note && <span>{room.note}</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[#D8D0C1] px-3 py-4 text-center text-[11.5px] text-[#666F7B]">
                    選択中のフロア・条件に該当する教室登録はありません。
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-2 rounded-xl border border-[#E5DEC9] bg-[#F5F0E6] p-3 text-[12px] text-[#434B58]">
              <div className="flex items-center gap-1.5 font-bold text-[#1B365D]">
                <Layers className="h-4 w-4" />
                <span>一般教室一覧の対象外施設（フロア図は保留）</span>
              </div>
              <p className="text-[11.5px] leading-relaxed">
                この建物は推定 {target.levels}階建として3Dモデル化されています。
                教務ガイド KAN-CAN! の一般教室一覧対象外の施設（研究棟・本部等）です。
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'access' && (
        <div key="access" className="t-tab-panel space-y-2.5">
          <AccessibilityNotice buildingId={building?.id} />
          {floorPlan && floorPlan.entrances.length > 0 ? (
            <div>
              <div className="mb-1.5 text-[11px] font-bold text-[#5F6875]">
                出入口（エントランス）
              </div>
              <div className="space-y-1.5">
                {floorPlan.entrances.map((ent) => (
                  <div
                    key={ent.id}
                    className="rounded-xl border border-[#E6DFD1] bg-white px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#1D2430]">
                        <DoorOpen className="h-3.5 w-3.5 text-[#1B365D]" />
                        <span>{ent.label}</span>
                      </div>
                      {ent.access === 'yes' && (
                        <span className="shrink-0 rounded-full bg-[#E2F4F7] px-2 py-0.5 text-[10px] font-bold text-[#1F7A8C]">
                          段差フリー
                        </span>
                      )}
                      {ent.access === 'no' && (
                        <span className="shrink-0 rounded-full bg-[#FCECE7] px-2 py-0.5 text-[10px] font-bold text-[#9A4A2E]">
                          段差あり
                        </span>
                      )}
                    </div>
                    {ent.note && (
                      <p className="mt-1 text-[11px] text-[#5F6875]">{ent.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {floorPlan && floorPlan.connectors.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold text-[#5F6875]">
                棟間の連絡通路
              </div>
              <div className="space-y-1.5">
                {floorPlan.connectors.map((conn) => {
                  const otherId =
                    conn.toBuildingId !== target.id
                      ? conn.toBuildingId
                      : conn.fromBuildingId;
                  const canJump = otherId !== target.id;
                  return (
                    <div
                      key={conn.id}
                      className="rounded-xl border border-[#DFD8CA] bg-[#F5F1E8] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-bold text-[#1D2430]">
                          {conn.label}
                        </span>
                        {conn.access === 'yes' && (
                          <span className="shrink-0 rounded bg-[#E2F4F7] px-1.5 py-0.5 text-[9.5px] font-bold text-[#1F7A8C]">
                            段差なし
                          </span>
                        )}
                        {conn.access === 'no' && (
                          <span className="shrink-0 rounded bg-[#FCECE7] px-1.5 py-0.5 text-[9.5px] font-bold text-[#9A4A2E]">
                            段差あり
                          </span>
                        )}
                      </div>
                      {conn.note && (
                        <p className="mt-1 text-[11px] text-[#535C69]">{conn.note}</p>
                      )}
                      {canJump && (
                        <button
                          type="button"
                          onClick={() => onJumpToBuildingId(otherId)}
                          className="t-interactive mt-1.5 inline-flex items-center gap-1 rounded-lg border border-[#D4CCB8] bg-white px-2 py-1 text-[10.5px] font-bold text-[#1B365D] hover:bg-[#EFE9DC]"
                        >
                          <span>連絡先: {getBuildingShortName(otherId)}を見る</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  const actionButtonSize = isSheet ? 'py-2.5' : 'py-2';
  const actions = (
    <div className={`grid ${nameOnly ? 'grid-cols-1' : 'grid-cols-3'} gap-1.5 ${isSheet ? '' : 'mt-3 border-t border-[#EAE3D6] pt-2.5'}`}>
      <button
        type="button"
        onClick={() => onFocusBuilding(target)}
        className={`t-interactive flex items-center justify-center gap-1 rounded-xl border border-[#DDD6C8] bg-white px-2 ${actionButtonSize} text-[11.5px] font-semibold text-[#1D2430] hover:bg-[#F3EDE0]`}
      >
        <Compass className="h-3.5 w-3.5 text-[#1B365D]" />
        <span>注視</span>
      </button>

      {!nameOnly && (
      <button
        type="button"
        onClick={() => onSetAsOrigin(target)}
        disabled={!target.walkNodeId}
        className={`t-interactive flex items-center justify-center gap-1 rounded-xl border border-[#DDD6C8] bg-white px-2 ${actionButtonSize} text-[11.5px] font-semibold text-[#1D2430] hover:bg-[#F3EDE0] disabled:cursor-not-allowed disabled:opacity-45`}
      >
        <MapPin className="h-3.5 w-3.5 text-[#2B8A6E]" />
        <span>ここを出発</span>
      </button>
      )}

      {!nameOnly && (
      <button
        type="button"
        onClick={() => onNavigateTo(target)}
        disabled={!target.walkNodeId}
        className={`t-interactive flex items-center justify-center gap-1 rounded-xl bg-[#C85A3A] px-2 ${actionButtonSize} text-[11.5px] font-bold text-white shadow-sm hover:bg-[#B44D2F] disabled:cursor-not-allowed disabled:opacity-45`}
      >
        <Navigation className="h-3.5 w-3.5" />
        <span>ここへ行く</span>
      </button>
      )}
    </div>
  );

  const unroutableNote = !target.walkNodeId && !nameOnly ? (
    <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-[#78808C]">
      <RouteIcon className="h-3 w-3" />
      <span>周辺建物のため歩道ルートノード未接続</span>
    </div>
  ) : null;

  if (!isSheet) {
    return (
      <BottomSheet
        state={state}
        ariaLabel="建物・施設の詳細情報"
        desktopClassName={DESKTOP_CLASS}
        desktopContentClassName="mt-2.5 flex-1 overflow-y-auto pr-0.5"
        snap={snap}
        onSnapChange={setSnap}
        onClose={onClose}
        onSheetHeightChange={onSheetHeightChange}
        contentRef={contentRef}
        header={
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {!nameOnly && chips}
                <h2 className="mt-1.5 text-[16px] font-bold leading-snug text-[#1D2430]">
                  {title}
                </h2>
                {wholeBuildingRow && <div className="mt-1">{wholeBuildingRow}</div>}
              </div>
              {closeButton}
            </div>
            {!nameOnly && tabList(`mt-3 ${TAB_LIST_BOX}`)}
          </>
        }
        footer={
          <>
            {actions}
            {unroutableNote}
          </>
        }
      >
        {nameOnly ? nameOnlyNote : tabBody}
      </BottomSheet>
    );
  }

  // スマホ: 固定するのはつまみ・建物名（1 行）・下のボタンだけ。チップ・英語名・タブは中身と一緒に流れる（タブは上に貼り付く）
  return (
    <BottomSheet
      state={state}
      ariaLabel="建物・施設の詳細情報"
      desktopClassName={DESKTOP_CLASS}
      desktopContentClassName=""
      snap={snap}
      onSnapChange={setSnap}
      onClose={onClose}
      onSheetHeightChange={onSheetHeightChange}
      contentRef={contentRef}
      header={
        <div className="flex items-center justify-between gap-2 pb-2">
          <h2 className="min-w-0 truncate text-[16px] font-bold leading-snug text-[#1D2430]">
            {title}
          </h2>
          {closeButton}
        </div>
      }
      footer={
        <div className="border-t border-[#EAE3D6] pt-2.5">
          {actions}
          {unroutableNote}
        </div>
      }
    >
      {nameOnly ? (
        <div className="pb-3">{nameOnlyNote}</div>
      ) : (
      <div className="pb-3">
        {wholeBuildingRow && <div className="mb-2">{wholeBuildingRow}</div>}
        {chips}
        <div ref={tabsAnchorRef} />
        <div className="sticky top-0 z-10 bg-[#FAF7F2] pb-2.5 pt-2.5">
          {tabList(TAB_LIST_BOX)}
        </div>
        {tabBody}
      </div>
      )}
    </BottomSheet>
  );
}
