import {
  ChevronDown,
  ChevronUp,
  Compass,
  Flag,
  MapPin,
  Mountain,
  Navigation,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  CATEGORY_OPTIONS,
  FACILITY_TAG_LABELS,
  getCategoryLabel,
} from '@/domain/search';
import type { BuildingFeature } from '@/domain/types';

interface BuildingSheetProps {
  building: BuildingFeature;
  onClose: () => void;
  onFocus: (b: BuildingFeature) => void;
  onRouteTo: (b: BuildingFeature) => void;
  onRouteFrom: (b: BuildingFeature) => void;
}

export function BuildingSheet({
  building,
  onClose,
  onFocus,
  onRouteTo,
  onRouteFrom,
}: BuildingSheetProps) {
  const [collapsedMobile, setCollapsedMobile] = useState(false);
  const catColor =
    CATEGORY_OPTIONS.find((c) => c.id === building.category)?.color ?? '#1B365D';

  return (
    <aside
      aria-label={`${building.name}の詳細`}
      className="fixed bottom-3 left-3 right-3 z-30 flex flex-col overflow-hidden rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2]/96 shadow-xl backdrop-blur-md md:bottom-auto md:left-4 md:right-auto md:top-28 md:max-h-[calc(100dvh-8.5rem)] md:w-[352px]"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[#EAE3D6] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: catColor }}
            >
              {getCategoryLabel(building.category)}
            </span>
            <span className="tabular-nums inline-flex items-center gap-1 rounded-full bg-[#EFE9DC] px-2 py-0.5 text-[10px] font-semibold text-[#4E5663]">
              <Mountain className="h-3 w-3" />
              標高 {building.groundY.toFixed(1)}m
            </span>
          </div>
          <h2 className="mt-1.5 truncate text-[16px] font-bold leading-snug text-[#1D2430]">
            {building.name}
          </h2>
          {building.englishName && (
            <p className="truncate text-[11px] font-medium text-[#6B7380]">
              {building.englishName}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsedMobile((v) => !v)}
            aria-label={collapsedMobile ? '詳細を広げる' : '詳細を折りたたむ'}
            className="rounded-lg p-1.5 text-[#5F6875] hover:bg-[#EAE3D6] md:hidden"
          >
            {collapsedMobile ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded-lg p-1.5 text-[#5F6875] hover:bg-[#EAE3D6] hover:text-[#1D2430]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className={`${collapsedMobile ? 'hidden md:block' : 'block'} max-h-[38dvh] overflow-y-auto px-4 py-3 md:max-h-none`}
      >
        {(building.faculties.length > 0 || building.facilityTags.length > 0) && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {building.faculties.map((f) => (
              <span
                key={f}
                className="rounded-md border border-[#DDD6C8] bg-[#F3EDE0] px-2 py-0.5 text-[11px] font-semibold text-[#1B365D]"
              >
                {f}
              </span>
            ))}
            {building.facilityTags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-[#EAE4D8] px-2 py-0.5 text-[11px] font-medium text-[#4B5360]"
              >
                {FACILITY_TAG_LABELS[tag]}
              </span>
            ))}
          </div>
        )}

        {building.architectNote && (
          <div className="mb-2.5 rounded-xl border border-[#E4D6C4] bg-[#F7EFE4] px-3 py-2 text-[11px] font-medium text-[#844129]">
            <span className="font-bold">造形・建築ポイント：</span>
            {building.architectNote}
          </div>
        )}

        <p className="text-[12.5px] leading-relaxed text-[#38404D]">
          {building.description}
        </p>

        {!building.isSpotOnly && (
          <div className="mt-2.5 flex items-center gap-3 text-[11px] text-[#666E7A] tabular-nums">
            <span>階数目安: {building.levels}F</span>
            <span>模型高さ: {building.height.toFixed(1)}m</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-[#EAE3D6] bg-[#F5F1E8]/90 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onRouteTo(building)}
          disabled={!building.walkNodeId}
          className="flex items-center justify-center gap-1 rounded-xl bg-[#C85A3A] px-2.5 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#B24C2F] disabled:opacity-40"
        >
          <Navigation className="h-3.5 w-3.5" />
          <span>ここへ行く</span>
        </button>
        <button
          type="button"
          onClick={() => onRouteFrom(building)}
          disabled={!building.walkNodeId}
          className="flex items-center justify-center gap-1 rounded-xl border border-[#D4CCB9] bg-[#FAF7F2] px-2.5 py-2 text-[12px] font-semibold text-[#1D2430] transition hover:bg-[#EAE3D6] disabled:opacity-40"
        >
          <Flag className="h-3.5 w-3.5 text-[#2B8A6E]" />
          <span>出発地に</span>
        </button>
        <button
          type="button"
          onClick={() => onFocus(building)}
          className="flex items-center justify-center gap-1 rounded-xl border border-[#D4CCB9] bg-[#FAF7F2] px-2.5 py-2 text-[12px] font-semibold text-[#1B365D] transition hover:bg-[#EAE3D6]"
        >
          <Compass className="h-3.5 w-3.5" />
          <span>ズーム</span>
        </button>
      </div>

      {!building.walkNodeId && (
        <div className="flex items-center gap-1.5 bg-[#FFF4E5] px-3 py-1.5 text-[11px] text-[#8E5316]">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span>歩行ネットワーク接続情報が未登録の施設です</span>
        </div>
      )}
    </aside>
  );
}

