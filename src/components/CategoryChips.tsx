import { CATEGORY_OPTIONS } from '@/domain/search';
import type { BuildingCategory } from '@/domain/types';

interface CategoryChipsProps {
  activeCategory: BuildingCategory | 'all';
  onChange: (cat: BuildingCategory | 'all') => void;
}

export function CategoryChips({ activeCategory, onChange }: CategoryChipsProps) {
  return (
    <div
      className="no-scrollbar flex items-center gap-1.5 overflow-x-auto py-0.5"
      role="tablist"
      aria-label="エリア・施設カテゴリ絞り込み"
    >
      {CATEGORY_OPTIONS.map((cat) => {
        const active = activeCategory === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(cat.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
              active
                ? 'border-[#1B365D] bg-[#1B365D] text-[#FAF7F2] shadow-sm'
                : 'border-[#DDD6C8] bg-[#FAF7F2]/92 text-[#333B47] hover:border-[#B8B0A0] hover:bg-[#F3EDE0]'
            }`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: active ? '#FAF7F2' : cat.color,
              }}
            />
            <span>{cat.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

