import {
  Building2,
  ChevronDown,
  ChevronRight,
  Crosshair,
  DoorOpen,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORY_OPTIONS,
  searchLocationItems,
  type BuildingCategory,
  type BuildingFeature,
  type BuildingFloorPlan,
  type LocationSearchItem,
} from '@kansai-u-3d/core';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';

export interface RouteEndpointSelection {
  buildingId: string;
  floor?: number;
  roomTitle?: string;
}

interface LocationPickerProps {
  roleLabel: '出発' | '到着';
  badgeColor: string;
  selection: RouteEndpointSelection;
  buildings: BuildingFeature[];
  floorPlans: Record<string, BuildingFloorPlan>;
  pickingActive: boolean;
  onSelect: (next: RouteEndpointSelection) => void;
  onStartMapPick: () => void;
}

const HUB_IDS = ['kandaimae-station', 'main-gate', 'west-gate', 'rimpukan', 'library'];

const GROUP_ORDER: BuildingCategory[] = [
  'gate',
  'area1',
  'area2',
  'area3',
  'area4',
  'shared',
  'heritage',
  'sports',
  'other',
];

export function LocationPicker({
  roleLabel,
  badgeColor,
  selection,
  buildings,
  floorPlans,
  pickingActive,
  onSelect,
  onStartMapPick,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<BuildingCategory>>(
    () => new Set(['gate', 'area3', 'shared']),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { mounted, visible } = useAnimatedPresence(open, 150);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const routableBuildings = useMemo(
    () =>
      buildings
        .filter((b) => b.walkNodeId && (b.landmarkId || b.inCampus))
        .sort((a, b) => a.labelPriority - b.labelPriority),
    [buildings],
  );

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === selection.buildingId) ?? routableBuildings[0],
    [buildings, selection.buildingId, routableBuildings],
  );

  const hubs = useMemo(
    () =>
      HUB_IDS.map((id) => routableBuildings.find((b) => b.id === id)).filter(
        (b): b is BuildingFeature => Boolean(b),
      ),
    [routableBuildings],
  );

  const grouped = useMemo(() => {
    const map = new Map<BuildingCategory, BuildingFeature[]>();
    for (const b of routableBuildings) {
      const arr = map.get(b.category) ?? [];
      arr.push(b);
      map.set(b.category, arr);
    }
    return GROUP_ORDER.map((cat) => {
      const meta = CATEGORY_OPTIONS.find((c) => c.id === cat);
      return {
        category: cat,
        label: meta?.label ?? 'その他施設',
        color: meta?.color ?? '#64748B',
        items: map.get(cat) ?? [],
      };
    }).filter((g) => g.items.length > 0);
  }, [routableBuildings]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return searchLocationItems(routableBuildings, floorPlans, query).slice(0, 14);
  }, [routableBuildings, floorPlans, query]);

  const toggleGroup = (cat: BuildingCategory) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleChooseSearchItem = (item: LocationSearchItem) => {
    onSelect({
      buildingId: item.buildingId,
      floor: item.floor,
      roomTitle: item.kind === 'room' ? item.title : undefined,
    });
    setOpen(false);
    setQuery('');
  };

  const catColor =
    CATEGORY_OPTIONS.find((c) => c.id === selectedBuilding?.category)?.color ?? badgeColor;

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${roleLabel}地点を選択: ${selectedBuilding?.name ?? ''}`}
          className={`t-interactive flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left ${
            open
              ? 'border-[#1B365D] bg-white ring-2 ring-[#1B365D]/15'
              : 'border-[#DCD4C5] bg-white hover:border-[#BDB3A2]'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: badgeColor }}
            >
              {roleLabel}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: catColor }}
                />
                <span className="truncate text-[12.5px] font-bold text-[#1D2430]">
                  {selectedBuilding?.shortName || selectedBuilding?.name || '場所を選択'}
                </span>
                {selection.roomTitle && (
                  <span className="truncate rounded bg-[#F0EAE0] px-1.5 py-0.5 text-[10px] font-semibold text-[#6E4934]">
                    {selection.roomTitle}
                  </span>
                )}
              </div>
              <div className="truncate text-[10.5px] text-[#666F7B]">
                {selectedBuilding?.accessibleWalkNodeId
                  ? '段差フリー経路接続 ・ エリア/教室から選択'
                  : '歩行ネットワーク接続'}
              </div>
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[#5F6875] transition-transform duration-150 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onStartMapPick();
          }}
          title={`3Dマップ上で${roleLabel}地点をタップ指定`}
          aria-label={`3Dマップ上で${roleLabel}地点を選択`}
          aria-pressed={pickingActive}
          className={`t-interactive flex shrink-0 items-center justify-center rounded-xl border px-2.5 ${
            pickingActive
              ? 'border-[#C85A3A] bg-[#C85A3A] text-white'
              : 'border-[#DCD4C5] bg-white text-[#4A5362] hover:bg-[#F3EDE0] hover:text-[#1D2430]'
          }`}
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>

      {mounted && (
        <div
          data-state={visible ? 'open' : 'closed'}
          role="dialog"
          aria-label={`${roleLabel}地点ピッカー`}
          className="t-picker-popover absolute left-0 right-0 top-[54px] z-40 flex max-h-[360px] flex-col overflow-hidden rounded-xl border border-[#D8D0C1] bg-[#FAF7F2]/98 shadow-2xl backdrop-blur-md"
        >
          <div className="border-b border-[#EAE3D6] p-2">
            <div className="flex items-center gap-2 rounded-lg border border-[#DCD4C5] bg-white px-2.5 py-1.5 focus-within:border-[#1B365D]">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#666F7B]" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="建物・教室番号・オフィス（例: D112 / 2205 / 経商オフィス）"
                className="w-full bg-transparent text-[12px] font-medium text-[#1D2430] placeholder:text-[#8A929E] focus:outline-none"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="絞り込みクリア"
                  className="rounded p-0.5 text-[#6A727E] hover:bg-[#EFE9DC]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {query.trim().length === 0 && hubs.length > 0 && (
              <div className="no-scrollbar mt-1.5 flex items-center gap-1 overflow-x-auto">
                <span className="shrink-0 text-[10px] font-semibold text-[#6A727E]">
                  定番:
                </span>
                {hubs.map((hub) => (
                  <button
                    key={hub.id}
                    type="button"
                    onClick={() => {
                      onSelect({ buildingId: hub.id });
                      setOpen(false);
                    }}
                    className={`t-interactive shrink-0 rounded-md border px-2 py-0.5 text-[10.5px] font-semibold ${
                      hub.id === selection.buildingId
                        ? 'border-[#1B365D] bg-[#1B365D] text-white'
                        : 'border-[#E2DACB] bg-white text-[#2F3744] hover:bg-[#EFE9DC]'
                    }`}
                  >
                    {hub.shortName}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-1.5">
            {query.trim().length > 0 ? (
              searchResults.length > 0 ? (
                <div className="space-y-0.5">
                  {searchResults.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleChooseSearchItem(item)}
                      className="t-interactive flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[#EFE9DC]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {item.kind === 'room' ? (
                          <DoorOpen className="h-3.5 w-3.5 shrink-0 text-[#C85A3A]" />
                        ) : (
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-[#1B365D]" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-[#1D2430]">
                            {item.title}
                          </div>
                          <div className="truncate text-[10.5px] text-[#666F7B]">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>
                      {item.accessibleWalkNodeId && (
                        <span className="shrink-0 rounded bg-[#E4F4F7] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#1F7A8C]">
                          段差フリー可
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-6 text-center text-[11.5px] text-[#6A727E]">
                  一致する建物・教室が見つかりませんでした
                </div>
              )
            ) : (
              <div className="space-y-1">
                {grouped.map((g) => {
                  const expanded = openGroups.has(g.category);
                  return (
                    <div
                      key={g.category}
                      className="overflow-hidden rounded-lg border border-[#EAE3D6] bg-white/75"
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.category)}
                        className="t-interactive flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-[#F3EDE0]"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: g.color }}
                          />
                          <span className="text-[11.5px] font-bold text-[#1D2430]">
                            {g.label}
                          </span>
                          <span className="tabular-nums text-[10px] text-[#78808C]">
                            ({g.items.length})
                          </span>
                        </div>
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-[#6A727E]" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-[#6A727E]" />
                        )}
                      </button>

                      {expanded && (
                        <div className="border-t border-[#F0EAE0] p-1 space-y-0.5">
                          {g.items.map((b) => {
                            const isSel = b.id === selection.buildingId;
                            const plan = floorPlans[b.id];
                            const topRooms = plan?.rooms.slice(0, 2) ?? [];
                            return (
                              <div
                                key={b.id}
                                className={`rounded-md ${
                                  isSel ? 'bg-[#E9EEF7]' : 'hover:bg-[#F6F1E8]'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelect({ buildingId: b.id });
                                    setOpen(false);
                                  }}
                                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                                >
                                  <span
                                    className={`truncate text-[12px] ${
                                      isSel
                                        ? 'font-bold text-[#1B365D]'
                                        : 'font-medium text-[#1D2430]'
                                    }`}
                                  >
                                    {b.name}
                                  </span>
                                  <div className="flex shrink-0 items-center gap-1">
                                    {plan?.wingLabel && (
                                      <span className="rounded bg-[#F1ECE1] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#5C4938]">
                                        {plan.wingLabel.split('（')[0]}
                                      </span>
                                    )}
                                    {b.accessibleWalkNodeId && (
                                      <Sparkles
                                        className="h-3 w-3 shrink-0 text-[#1F7A8C]"
                                        aria-label="段差フリー接続"
                                      />
                                    )}
                                  </div>
                                </button>
                                {topRooms.length > 0 && (
                                  <div className="flex flex-wrap gap-1 px-2 pb-1.5">
                                    {topRooms.map((room) => (
                                      <button
                                        key={room.id}
                                        type="button"
                                        onClick={() => {
                                          onSelect({
                                            buildingId: b.id,
                                            floor: room.floor,
                                            roomTitle: `${room.code} ${room.name}`.trim(),
                                          });
                                          setOpen(false);
                                        }}
                                        className="t-interactive rounded border border-[#E5DEC9] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#4D5663] hover:border-[#C85A3A] hover:text-[#C85A3A]"
                                      >
                                        {room.code}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[#EAE3D6] bg-[#F3EDE0]/80 px-2.5 py-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onStartMapPick();
              }}
              className="t-interactive flex items-center gap-1 text-[11px] font-bold text-[#C85A3A] hover:underline"
            >
              <Crosshair className="h-3.5 w-3.5" />
              <span>3Dマップ上から建物を選ぶ</span>
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] font-semibold text-[#5F6875] hover:text-[#1D2430]"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

