import { Building2, DoorOpen, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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

interface SearchBarProps {
  buildings: BuildingFeature[];
  floorPlans: Record<string, BuildingFloorPlan>;
  activeCategory: BuildingCategory | 'all';
  onSelectLocation: (item: LocationSearchItem) => void;
}

export function SearchBar({
  buildings,
  floorPlans,
  activeCategory,
  onSelectLocation,
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => searchLocationItems(buildings, floorPlans, query, activeCategory).slice(0, 12),
    [buildings, floorPlans, query, activeCategory],
  );

  const dropdownOpen = open && results.length > 0;
  const { mounted, visible } = useAnimatedPresence(dropdownOpen, 120);

  useEffect(() => {
    const handleOutside = (ev: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const getColor = (cat: BuildingCategory) =>
    CATEGORY_OPTIONS.find((c) => c.id === cat)?.color ?? '#64748B';

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="t-interactive flex h-10 items-center gap-2 rounded-xl border border-[#DDD6C8] bg-[#FAF7F2]/95 px-3 shadow-sm backdrop-blur-md focus-within:border-[#1B365D] focus-within:ring-2 focus-within:ring-[#1B365D]/15">
        <Search className="h-4 w-4 shrink-0 text-[#5F6875]" />
        <input
          type="search"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="建物・教室番号・オフィス検索（例: D112 / 2205 / 法文オフィス / 凜風館）"
          aria-label="建物や教室を検索"
          className="w-full bg-transparent text-[13px] font-medium text-[#1D2430] placeholder:text-[#7D8591] focus:outline-none"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setOpen(true);
            }}
            aria-label="検索語句をクリア"
            className="t-interactive rounded-full p-1 text-[#6A727E] hover:bg-[#EAE3D6] hover:text-[#1D2430]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {mounted && (
        <div
          role="listbox"
          data-state={visible ? 'open' : 'closed'}
          aria-label="検索結果"
          className="t-dropdown absolute left-0 right-0 top-11 z-40 max-h-[340px] overflow-y-auto rounded-xl border border-[#DDD6C8] bg-[#FAF7F2]/98 p-1.5 shadow-xl backdrop-blur-md"
        >
          {results.map((item, idx) => (
            <button
              key={item.key}
              type="button"
              role="option"
              style={{ '--stagger-index': Math.min(idx, 10) } as React.CSSProperties}
              onClick={() => {
                onSelectLocation(item);
                setOpen(false);
                if (item.kind === 'room') {
                  setQuery(item.roomCode ?? item.title);
                } else {
                  setQuery(item.title);
                }
              }}
              className="t-stagger-item t-interactive flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[#EFE9DC]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {item.kind === 'room' ? (
                  <DoorOpen className="h-3.5 w-3.5 shrink-0 text-[#C85A3A]" />
                ) : (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: getColor(item.category) }}
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
                  <Building2 className="h-3 w-3 opacity-60" />
                )}
                <span className="tabular-nums">{item.groundY.toFixed(0)}m</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

