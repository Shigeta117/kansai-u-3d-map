import {
  Accessibility,
  ArrowRight,
  Compass,
  DoorOpen,
  ExternalLink,
  Hash,
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
  type AccessStatus,
  type BuildingFloorPlan,
} from '@kansai-u-3d/core';
import { ROOM_KIND_LABELS } from '../data/indoor/senriyama-indoor';
import { OFFICIAL_ACCESS_SOURCE, SENRIYAMA_OFFICIAL_ACCESS } from '../data/indoor/senriyama-official-access';
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

const ACCESS_LABEL: Record<AccessStatus, string> = { yes: 'あり', no: 'なし', unknown: '印なし（未確認）' };

function AccessibilityNotice({ buildingId }: { buildingId?: string }) {
  const official = buildingId ? SENRIYAMA_OFFICIAL_ACCESS[buildingId] : undefined;
  return (
    <div className="rounded-xl border border-[#E3DDD1] bg-[#F5F1E8] px-3 py-2 text-[11px] leading-relaxed text-[#4B5360]">
      {official ? (
        <>
          <p className="font-semibold text-[#1D2430]">大学のバリアフリーマップ（{OFFICIAL_ACCESS_SOURCE.asOf}）による</p>
          <ul className="mt-1 space-y-0.5">
            <li>エレベーター: {ACCESS_LABEL[official.elevator]}</li>
            <li>
              自動扉の入口:{' '}
              {official.autoDoorEntrance === 'no'
                ? 'なし（開き戸か段差のある入口のみ。地図では車椅子は非推奨・不可の印）'
                : ACCESS_LABEL[official.autoDoorEntrance]}
            </li>
            <li>
              多機能トイレ: {ACCESS_LABEL[official.accessibleRestroom]}
              {official.restroomFloors ? ` — ${official.restroomFloors}` : ''}
            </li>
          </ul>
          <p className="mt-1">設備は改修されている可能性があります。移動の前に大学のページで確かめてください。下の出入口・連絡の一覧は未確認です。</p>
        </>
      ) : (
        <p>
          バリアフリー情報（段差・エレベーター・多機能トイレ）は未確認です。移動の前に大学の公式情報で確かめてください。
        </p>
      )}
      <a
        href={OFFICIAL_ACCESS_SOURCE.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1 font-semibold text-[#1B365D] hover:underline"
      >
        <span>関西大学 バリアフリーマップ（千里山キャンパス）</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    </div>
  );
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
  const [selectedWing, setSelectedWing] = useState<string | 'all'>('all');
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
      setSelectedWing('all');
      setRoomQuery('');
    }
  }, [building, initialFloor]);

  const target = building ?? cachedBuilding;

  const availableWings = useMemo(() => {
    if (!floorPlan) return [];
    const seen = new Set<string>();
    for (const r of floorPlan.rooms) {
      if (r.wing) seen.add(r.wing);
    }
    return [...seen];
  }, [floorPlan]);

  const filteredRooms = useMemo(() => {
    if (!floorPlan) return [];
    const nq = normalizeSearchText(roomQuery);
    return floorPlan.rooms.filter((r) => {
      if (selectedWing !== 'all' && r.wing !== selectedWing) return false;
      if (selectedFloor !== 'all' && r.floor !== selectedFloor) return false;
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
  }, [floorPlan, selectedWing, selectedFloor, roomQuery]);

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
            {floorPlan?.wingLabel && (
              <span className="rounded-full border border-[#D8CFC0] bg-white px-2 py-0.5 text-[10.5px] font-bold text-[#1B365D]">
                {floorPlan.wingLabel}
              </span>
            )}
            <span className="tabular-nums rounded-full bg-[#ECE6DA] px-2 py-0.5 text-[10.5px] font-semibold text-[#4B5360]">
              標高 {target.groundY.toFixed(1)}m / {target.levels}階建相当
            </span>
            {target.accessibleWalkNodeId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E2F4F7] px-2 py-0.5 text-[10.5px] font-bold text-[#1F7A8C]">
                <Accessibility className="h-3 w-3" />
                段差なし経路の候補あり（参考）
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
                '関西大学千里山キャンパスの施設です。ルート検索でここまでの徒歩ルートと高低差・段差なし参考経路を確認できます。'}
            </p>

            {floorPlan?.numberingRule && (
              <div className="flex items-start gap-2 rounded-xl border border-[#DCE3EE] bg-[#F3F6FA] px-3 py-2 text-[11px] text-[#283B5B]">
                <Hash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1B365D]" />
                <div>
                  <div className="font-bold">教室番号・ナンバリング規則</div>
                  <div className="mt-0.5 text-[#3F4E68]">{floorPlan.numberingRule}</div>
                </div>
              </div>
            )}

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
          <div key="floors" className="t-tab-panel space-y-2">
            <AccessibilityNotice buildingId={building?.id} />
            {floorPlan ? (
              <>
                {(floorPlan.numberingRule || floorPlan.summaryNote) && (
                  <div className="rounded-xl border border-[#E5DEC9] bg-[#F5F0E6] px-3 py-2 text-[11px] leading-relaxed text-[#434B58]">
                    {floorPlan.numberingRule && (
                      <div className="font-bold text-[#1B365D]">
                        番号規則: {floorPlan.numberingRule}
                      </div>
                    )}
                    {floorPlan.summaryNote && (
                      <p className="mt-0.5">{floorPlan.summaryNote}</p>
                    )}
                    {floorPlan.sourceUpdatedAt && (
                      <div className="mt-1 text-[10px] text-[#6A727E]">
                        出典: 関西大学教務ガイド KAN-CAN!（{floorPlan.sourceUpdatedAt} 更新・フロア平面図は保留）
                      </div>
                    )}
                  </div>
                )}

                {availableWings.length > 1 && (
                  <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-0.5">
                    <button
                      type="button"
                      onClick={() => setSelectedWing('all')}
                      className={`t-interactive shrink-0 rounded-lg border px-2 py-0.5 text-[10.5px] font-bold ${
                        selectedWing === 'all'
                          ? 'border-[#C85A3A] bg-[#C85A3A] text-white'
                          : 'border-[#DCD4C5] bg-white text-[#47505E]'
                      }`}
                    >
                      全棟
                    </button>
                    {availableWings.map((w) => {
                      const active = selectedWing === w;
                      return (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setSelectedWing(w)}
                          className={`t-interactive shrink-0 rounded-lg border px-2 py-0.5 text-[10.5px] font-bold ${
                            active
                              ? 'border-[#C85A3A] bg-[#C85A3A] text-white'
                              : 'border-[#DCD4C5] bg-white text-[#47505E]'
                          }`}
                        >
                          {w}
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
                    placeholder="教室番号・オフィス名で絞り込み（例: D112 / 2205）"
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
            ) : (
              <div className="rounded-xl border border-[#E6DFD1] bg-white px-3 py-2.5 text-[11.5px] text-[#5F6875]">
                最寄り歩行ネットワーク：
                {target.accessibleWalkNodeId
                  ? '段差なし経路の候補あり（OSM 歩道データに基づく参考）'
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
