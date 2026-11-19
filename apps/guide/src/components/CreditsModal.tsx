import { ExternalLink, X } from 'lucide-react';
import type { CampusDatasetMeta } from '@kansai-u-3d/core';
import { getIndoorDataStats } from '../data/indoor/senriyama-indoor';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';

interface CreditsModalProps {
  open: boolean;
  meta: CampusDatasetMeta | null;
  onClose: () => void;
}

export function CreditsModal({ open, meta, onClose }: CreditsModalProps) {
  const { mounted, visible } = useAnimatedPresence(open, 150);
  if (!mounted) return null;

  const state = visible ? 'open' : 'closed';
  const indoorStats = getIndoorDataStats();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-title"
      data-state={state}
      className="t-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[#1D2430]/45 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        data-state={state}
        className="t-modal-card max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#DDD6C8] bg-[#FAF7F2] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#EAE3D6] pb-3">
          <div>
            <h2 id="credits-title" className="text-[16px] font-bold text-[#1D2430]">
              データ出典・OSSライセンス
            </h2>
            <p className="mt-0.5 text-[11.5px] text-[#666F7B]">
              関西大学 千里山キャンパス 3D案内マップ（MIT License）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="モーダルを閉じる"
            className="t-interactive rounded-lg p-1.5 text-[#5F6875] hover:bg-[#EAE3D6]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-[#343C48]">
          <section className="rounded-xl border border-[#E3DDD1] bg-[#F4EFE5] p-3">
            <h3 className="font-bold text-[#1B365D]">1. 地形標高データ（国土地理院）</h3>
            <p className="mt-1">
              出典：国土地理院 地理院タイル（標高タイル DEM5A）を加工して作成。
              政府標準利用規約（第2.0版 / CC BY 4.0 互換）に基づき利用しています。
            </p>
          </section>

          <section className="rounded-xl border border-[#E3DDD1] bg-[#F4EFE5] p-3">
            <h3 className="font-bold text-[#1B365D]">
              2. 建物輪郭・歩道・高架デッキ・鉄道（OpenStreetMap）
            </h3>
            <p className="mt-1">
              Map data © OpenStreetMap contributors (ODbL v1.0).
              建物配置・歩道・秀麗橋高架デッキ・西門新アクセス上屋・階段・阪急千里線の形状は OpenStreetMap Overpass API から取得・変換しています。
            </p>
          </section>

          <section className="rounded-xl border border-[#E3DDD1] bg-[#F4EFE5] p-3">
            <h3 className="font-bold text-[#1B365D]">
              3. Project PLATEAU 調査・UIモーション規約
            </h3>
            <p className="mt-1">
              G空間情報センター CKAN API で吹田市の 3D都市モデル公開状況を確認したところ未公開のため、GSI DEM5A ＋ OSM ＋ キャンパス造形（および MIT License の transitions.style モーショントークン）を組み合わせて構築しています。
            </p>
          </section>

          {meta && (
            <section className="rounded-xl border border-[#E3DDD1] bg-white/75 p-3">
              <h3 className="font-bold text-[#1D2430]">実測ビルド統計（千里山）</h3>
              <dl className="tabular-nums mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px]">
                <div className="flex justify-between">
                  <dt className="text-[#666F7B]">総建物数</dt>
                  <dd className="font-semibold">{meta.stats.totalBuildings.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#666F7B]">キャンパス棟</dt>
                  <dd className="font-semibold">{meta.stats.campusBuildings}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#666F7B]">標高レンジ</dt>
                  <dd className="font-semibold">
                    {meta.stats.minElevation.toFixed(1)}〜{meta.stats.maxElevation.toFixed(1)}m
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#666F7B]">歩行/段差フリー</dt>
                  <dd className="font-semibold">
                    {meta.stats.walkNodes.toLocaleString()} /{' '}
                    {meta.stats.accessibleWalkNodes.toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#666F7B]">高架橋・上屋</dt>
                  <dd className="font-semibold">
                    {meta.stats.bridges} / {meta.stats.accessCanopies}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#666F7B]">サンプル館内情報</dt>
                  <dd className="font-semibold">
                    {indoorStats.buildingCount}棟・{indoorStats.roomCount}枠
                  </dd>
                </div>
              </dl>
            </section>
          )}

          <div className="flex items-center justify-between pt-1 text-[11px] text-[#666F7B]">
            <span>Google Earth / Street View 等は規約順守のため不使用</span>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-[#1B365D] hover:underline"
            >
              <span>OSM ODbL</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

