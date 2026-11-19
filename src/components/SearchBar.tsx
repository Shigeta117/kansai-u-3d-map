import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CATEGORY_OPTIONS, getCategoryLabel } from '@/domain/search';
import type { BuildingFeature } from '@/domain/types';

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  results: BuildingFeature[];
  onSelectBuilding: (b: BuildingFeature) => void;
}

export function SearchBar({
  query,
  onQueryChange,
  results,
  onSelectBuilding,
}: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, []);

  const visibleResults = results.slice(0, 8);
  const getCatColor = (catId: string) =>
    CATEGORY_OPTIONS.find((c) => c.id === catId)?.color ?? '#7E8691';

  return (
    <div ref={containerRef} className="relative w-full md:w-[320px]">
      <div className="flex h-10 items-center gap-2 rounded-xl border border-[#DDD6C8] bg-[#FAF7F2]/95 px-3 shadow-sm backdrop-blur-md transition focus-within:border-[#1B365D] focus-within:ring-2 focus-within:ring-[#1B365D]/15">
        <Search className="h-4 w-4 shrink-0 text-[#5F6875]" />
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          placeholder="建物・学部・学食・図書館を検索…"
          aria-label="キャンパスの建物を検索"
          className="w-full bg-transparent text-[13px] font-medium text-[#1D2430] placeholder:text-[#8A919C] focus:outline-none"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onQueryChange('');
              setOpen(false);
            }}
            aria-label="検索をクリア"
            className="rounded-md p-1 text-[#6F7682] hover:bg-[#EAE4D7] hover:text-[#1D2430]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-12 z-40 max-h-[55dvh] overflow-y-auto rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2]/98 p-1.5 shadow-xl backdrop-blur-md">
          {visibleResults.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-[#6F7682]">
              該当する施設が見つかりませんでした
            </div>
          ) : (
            visibleResults.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  onSelectBuilding(b);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-[#EFE9DC]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getCatColor(b.category) }}
                    />
                    <span className="truncate text-[13px] font-semibold text-[#1D2430]">
                      {b.name}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate pl-4.5 text-[11px] text-[#666F7B]">
                    {getCategoryLabel(b.category)}
                    {b.faculties.length > 0 ? ` ・ ${b.faculties.join(' / ')}` : ''}
                  </div>
                </div>
                <span className="tabular-nums shrink-0 rounded-md bg-[#EFE9DC] px-1.5 py-0.5 text-[10px] font-medium text-[#545D69]">
                  {Math.round(b.groundY)}m
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

