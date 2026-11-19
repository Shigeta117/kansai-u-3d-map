import {
  Accessibility,
  ArrowRight,
  Compass,
  DoorOpen,
  Layers,
  MapPin,
  Navigation,
  PlugZap,
  Route as RouteIcon,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  CATEGORY_OPTIONS,
  FACILITY_TAG_LABELS,
  getCategoryLabel,
  normalizeSearchText,
  type BuildingFeature,
  type BuildingFloorPlan,
} from '@kansai-u-3d/core';
import { ROOM_KIND_LABELS } from '../data/indoor/senriyama-indoor';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';

type SheetTab = 'overview' | 'floors' | 'access';

interface BuildingSheetProps {
  building: BuildingFeature | null;
  floorPlan?: BuildingFloorPlan;
  initialFloor?: number;
  allBuildings: BuildingFeature[];
  onClose: () => void;
  onFocusBuilding: (building: BuildingFeature) => void;
  onNavigateTo: (building: BuildingFeature) => void;
  onSetAsOrigin: (building: BuildingFeature) => void;
  onJumpToBuildingId: (buildingId: string) => void;
}

export function BuildingSheet({
  building,
  floorPlan,
  initialFloor,
  allBuildings,
  onClose,
  onFocusBuilding,
  onNavigateTo,
  onSetAsOrigin,
  onJumpToBuildingId,
}: BuildingSheetProps) {
  const { mounted, visible } = useAnimatedPresence(Boolean(building), 350);
  const [cachedBuilding, setCachedBuilding] = useState<BuildingFeature | null>(building);
  const [activeTab, setActiveTab] = useState<SheetTab>('overview');
  const [selectedFloor, setSelectedFloor] = useState<number | 'all'>('all');
  const [roomQuery, setRoomQuery] = useState('');

  useEffect(() => {
    if (building) {
      setCachedBuilding(building);
      if (initialFloor !== undefined) {
        setActiveTab('floors');
        setSelectedFloor(initialFloor);
      } else {
        setActiveTab('overview');
        setSelectedFloor('all');
      }
      setRoomQuery('');
    }
  }, [building, initialFloor]);

  const target = building ?? cachedBuilding;

  const filteredRooms = useMemo(() => {
    if (!floorPlan) return [];
    const nq = normalizeSearchText(roomQuery);
    return floorPlan.rooms.filter((r) => {
      if (selectedFloor !== 'all' && r.floor !== selectedFloor) return false;
      if (!nq) return true;
      return (
        normalizeSearchText(r.code).includes(nq) ||
        normalizeSearchText(r.name).includes(nq) ||
        normalizeSearchText(r.note ?? '').includes(nq)
      );
    });
  }, [floorPlan, selectedFloor, roomQuery]);

  if (!mounted || !target) return null;

  const catColor =
    CATEGORY_OPTIONS.find((c) => c.id === target.category)?.color ?? '#64748B';
  const state = visible ? 'open' : 'closed';

  const getBuildingShortName = (id: string) =>
    allBuildings.find((b) => b.id === id)?.shortName ?? id;

  return (
    <aside
      data-state={state}
      className="t-panel-right pointer-events-auto fixed bottom-0 left-0 right-0 z-20 mx-auto max-h-[60dvh] w-full max-w-lg rounded-t-2xl border border-[#DDD6C8] bg-[#FAF7F2]/96 p-4 shadow-2xl backdrop-blur-md sm:bottom-5 sm:left-auto sm:right-5 sm:mx-0 sm:max-h-[calc(100dvh-9.5rem)] sm:w-[376px] sm:rounded-2xl flex flex-col"
      aria-label="建物・施設の詳細情報"
    >
      <div className="mb-2 flex justify-center sm:hidden">
        <div className="h-1 w-10 rounded-full bg-[#D0C8B8]" />
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white"
              style={{ backgroundColor: catColor }}
            >
              {getCategoryLabel(target.category)}
            </span>
            <span className="tabular-nums rounded-full bg-[#ECE6DA] px-2 py-0.5 text-[10.5px] font-semibold text-[#4B5360]">
              標高 {target.groundY.toFixed(1)}m / {target.levels}階建相当
            </span>
            {target.accessibleWalkNodeId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E2F4F7] px-2 py-0.5 text-[10.5px] font-bold text-[#1F7A8C]">
                <Accessibility className="h-3 w-3" />
                段差フリー可
              </span>
            )}
          </div>
          <h2 className="mt-1.5 text-[16px] font-bold leading-snug text-[#1D2430]">
            {target.name}
          </h2>
          {target.englishName && (
            <p className="text-[11px] font-medium text-[#6C7582]">
              {target.englishName}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="詳細パネルを閉じる"
          className="t-interactive rounded-lg p-1.5 text-[#5F6875] hover:bg-[#EAE3D6] hover:text-[#1D2430]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 3 Symmetric Tabs */}
      <div
        role="tablist"
        aria-label="建物詳細タブ"
        className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-[#E5DEC9] bg-[#F1ECE1] p-1"
      >
        {(
          [
            { id: 'overview', label: '概要' },
            { id: 'floors', label: 'フロア・教室' },
            { id: 'access', label: '出入口・連絡' },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
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

      {/* Tab Body */}
      <div className="mt-2.5 flex-1 overflow-y-auto pr-0.5">
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
                '関西大学千里山キャンパスの施設です。ルート検索でここまでの徒歩ルートと高低差・段差フリー経路を確認できます。'}
            </p>

            {target.architectNote && (
              <div className="flex items-start gap-2 rounded-xl border border-[#E4D9C5] bg-[#F6EFE2] px-3 py-2 text-[11.5px] text-[#6B4C35]">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B86A38]" />
                <span>
                  <strong className="font-semibold">建築メモ：</strong>
                  {target.architectNote}
                </span>
              </div>
            )}

            {target.facilityTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {target.facilityTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[#E9E4D9] px-2.5 py-0.5 text-[10.5px] font-medium text-[#47505E]"
                  >
                    #{FACILITY_TAG_LABELS[tag]}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'floors' && (
          <div key="floors" className="t-tab-panel space-y-2.5">
            {floorPlan ? (
              <>
                {floorPlan.summaryNote && (
                  <p className="rounded-xl border border-[#E5DEC9] bg-[#F5F0E6] px-3 py-2 text-[11.5px] leading-relaxed text-[#434B58]">
                    {floorPlan.summaryNote}
                  </p>
                )}

                <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedFloor('all')}
                    className={`t-interactive shrink-0 rounded-lg border px-2 py-1 text-[11px] font-bold ${
                      selectedFloor === 'all'
                        ? 'border-[#1B365D] bg-[#1B365D] text-white'
                        : 'border-[#DCD4C5] bg-white text-[#47505E]'
                    }`}
                  >
                    全フロア
                  </button>
                  {floorPlan.floors.map((fl) => {
                    const active = selectedFloor === fl.floor;
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
                    placeholder="教室コード・名称で絞り込み"
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
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 rounded bg-[#1B365D]/10 px-1.5 py-0.5 text-[10.5px] font-bold text-[#1B365D]">
                              {room.floor < 0 ? `B${Math.abs(room.floor)}F` : `${room.floor}F`}
                            </span>
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
                          {room.capacity !== undefined && (
                            <span className="tabular-nums">定員約 {room.capacity}名</span>
                          )}
                          {room.accessible && (
                            <span className="inline-flex items-center gap-0.5 text-[#1F7A8C]">
                              <Accessibility className="h-3 w-3" />
                              車いす可
                            </span>
                          )}
                          {room.powerOutlets && (
                            <span className="inline-flex items-center gap-0.5 text-[#B86A38]">
                              <PlugZap className="h-3 w-3" />
                              電源あり
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
                  <span>階層・教室データは準備中（拡張スキーマ対応済）</span>
                </div>
                <p className="text-[11.5px] leading-relaxed">
                  この建物は推定 {target.levels}階建として3Dモデル化されています。
                  教室配置図データ（JSON）を追加すると、各階の教室検索・定員・電源情報が表示されます。
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'access' && (
          <div key="access" className="t-tab-panel space-y-2.5">
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
                        {ent.accessible && (
                          <span className="shrink-0 rounded-full bg-[#E2F4F7] px-2 py-0.5 text-[10px] font-bold text-[#1F7A8C]">
                            段差フリー
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
            ) : (
              <div className="rounded-xl border border-[#E6DFD1] bg-white px-3 py-2.5 text-[11.5px] text-[#5F6875]">
                最寄り歩行ネットワーク：
                {target.accessibleWalkNodeId
                  ? '段差フリーノード接続済（完全段差フリー案内に対応）'
                  : target.walkNodeId
                    ? '一般歩行ルート接続済'
                    : '外観表示専用スポット'}
              </div>
            )}

            {floorPlan && floorPlan.connectors.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-bold text-[#5F6875]">
                  棟間連絡デッキ・通路・エレベーター
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
                          {conn.accessible && (
                            <span className="shrink-0 rounded bg-[#E2F4F7] px-1.5 py-0.5 text-[9.5px] font-bold text-[#1F7A8C]">
                              段差なし
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
      </div>

      {/* Action Buttons */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-[#EAE3D6] pt-2.5">
        <button
          type="button"
          onClick={() => onFocusBuilding(target)}
          className="t-interactive flex items-center justify-center gap-1 rounded-xl border border-[#DDD6C8] bg-white px-2 py-2 text-[11.5px] font-semibold text-[#1D2430] hover:bg-[#F3EDE0]"
        >
          <Compass className="h-3.5 w-3.5 text-[#1B365D]" />
          <span>注視</span>
        </button>

        <button
          type="button"
          onClick={() => onSetAsOrigin(target)}
          disabled={!target.walkNodeId}
          className="t-interactive flex items-center justify-center gap-1 rounded-xl border border-[#DDD6C8] bg-white px-2 py-2 text-[11.5px] font-semibold text-[#1D2430] hover:bg-[#F3EDE0] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <MapPin className="h-3.5 w-3.5 text-[#2B8A6E]" />
          <span>ここを出発</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTo(target)}
          disabled={!target.walkNodeId}
          className="t-interactive flex items-center justify-center gap-1 rounded-xl bg-[#C85A3A] px-2 py-2 text-[11.5px] font-bold text-white shadow-sm hover:bg-[#B44D2F] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Navigation className="h-3.5 w-3.5" />
          <span>ここへ行く</span>
        </button>
      </div>

      {!target.walkNodeId && (
        <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-[#78808C]">
          <RouteIcon className="h-3 w-3" />
          <span>周辺建物のため歩道ルートノード未接続</span>
        </div>
      )}
    </aside>
  );
}
