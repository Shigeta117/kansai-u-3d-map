import {
  Building2,
  DoorOpen,
  Menu,
  Route as RouteIcon,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  CATEGORY_OPTIONS,
  getCategoryLabel,
  searchLocationItems,
  type BuildingCategory,
  type BuildingFeature,
  type BuildingFloorPlan,
  type LocationSearchItem,
} from '@kansai-u-3d/core';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { CategoryChips } from './CategoryChips';

interface SearchBarProps {
  buildings: BuildingFeature[];
  floorPlans: Record<string, BuildingFloorPlan>;
  activeCategory: BuildingCategory | 'all';
  routeOpen: boolean;
  menuOpen: boolean;
  onChangeCategory: (cat: BuildingCategory | 'all') => void;
  onSelectLocation: (item: LocationSearchItem) => void;
  onOpenMenu: () => void;
  onToggleRoute: () => void;
}

const CATEGORY_COLOR_MAP = new Map<string, string>(
  CATEGORY_OPTIONS.map((c) => [c.id, c.color]),
);

export function SearchBar({
  buildings,
  floorPlans,
  activeCategory,
  routeOpen,
  menuOpen,
  onChangeCategory,
  onSelectLocation,
  onOpenMenu,
  onToggleRoute,
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeCategoryOption = useMemo(
    () =>
      activeCategory === 'all'
        ? null
        : (CATEGORY_OPTIONS.find((c) => c.id === activeCategory) ?? null),
    [activeCategory],
  );

  const results = useMemo(
    () =>
      searchLocationItems(buildings, floorPlans, query, activeCategory).slice(
        0,
        12,
      ),
    [buildings, floorPlans, query, activeCategory],
  );

  const { mounted, visible } = useAnimatedPresence(open, 120);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (ev: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) {
        setOpen(false);
        inputRef.current?.blur();
      }
    };

    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="t-interactive flex h-12 w-full flex-nowrap items-center gap-1 rounded-full border border-[#DDD6C8] bg-[#FAF7F2]/96 px-1.5 shadow-md backdrop-blur-md focus-within:border-[#1B365D]">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            inputRef.current?.blur();
            onOpenMenu();
          }}
          aria-label="メニューを開く"
          aria-expanded={menuOpen}
          aria-controls="guide-menu-panel"
          className="t-interactive flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#333B47] hover:bg-[#EAE3D6] hover:text-[#1D2430]"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        {activeCategoryOption && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#1B365D] py-0.5 pl-2 pr-1 text-[11px] font-semibold text-[#FAF7F2]">
            <span className="max-w-[5.5rem] truncate">
              {activeCategoryOption.shortLabel}
            </span>
            <button
              type="button"
              onClick={() => onChangeCategory('all')}
              aria-label={`${activeCategoryOption.shortLabel}の絞り込みを解除`}
              className="t-interactive flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/20"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        )}

        <input
          ref={inputRef}
          type="search"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={
            activeCategoryOption ? '施設を検索' : '千里山キャンパスを検索'
          }
          aria-label="千里山キャンパスを検索"
          className="min-w-0 flex-1 bg-transparent px-1 text-[16px] font-medium text-[#1D2430] placeholder:text-[#7D8591] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />

        {query.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              if (open) {
                inputRef.current?.focus();
              }
            }}
            aria-label="検索語句をクリア"
            className="t-interactive flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#6A727E] hover:bg-[#EAE3D6] hover:text-[#1D2430]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            inputRef.current?.blur();
            onToggleRoute();
          }}
          aria-pressed={routeOpen}
          aria-label="ルート案内"
          title="ルート案内"
          className={`t-interactive flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            routeOpen
              ? 'bg-[#C85A3A] text-white'
              : 'text-[#1B365D] hover:bg-[#EAE3D6]'
          }`}
        >
          <RouteIcon className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>

      {mounted && (
        <div
          data-state={visible ? 'open' : 'closed'}
          className="t-dropdown absolute left-0 right-0 top-[3.375rem] z-40 flex flex-col gap-1.5"
        >
          <CategoryChips
            activeCategory={activeCategory}
            onChange={onChangeCategory}
          />

          {buildings.length > 0 && (
            <div
              role="listbox"
              aria-label="検索結果"
              className="max-h-[min(320px,calc(100dvh_-_10.5rem))] overflow-y-auto rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2]/98 p-1.5 shadow-xl backdrop-blur-md"
            >
              {results.length > 0 ? (
                results.map((item, idx) => (
                  <button
                    key={item.key}
                    type="button"
                    role="option"
                    aria-selected={false}
                    style={
                      { '--stagger-index': Math.min(idx, 10) } as CSSProperties
                    }
                    onClick={() => {
                      onSelectLocation(item);
                      setOpen(false);
                      inputRef.current?.blur();
                      if (item.kind === 'room') {
                        setQuery(item.roomCode ?? item.title);
                      } else {
                        setQuery(item.title);
                      }
                    }}
                    className="t-stagger-item t-interactive flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-[#EFE9DC]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {item.kind === 'room' ? (
                        <DoorOpen
                          className="h-3.5 w-3.5 shrink-0 text-[#C85A3A]"
                          aria-hidden="true"
                        />
                      ) : (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              CATEGORY_COLOR_MAP.get(item.category) ?? '#64748B',
                          }}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-[#1D2430]">
                          {item.title}
                        </div>
                        <div className="truncate text-[11px] text-[#5F6875]">
                          {item.subtitle || getCategoryLabel(item.category)}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-[#6C7582]">
                      {item.kind === 'building' && (
                        <Building2
                          className="h-3 w-3 opacity-60"
                          aria-hidden="true"
                        />
                      )}
                      <span className="tabular-nums">
                        {item.groundY.toFixed(0)}m
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-[12px] text-[#666F7B]">
                  一致する建物・教室が見つかりません
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
