# Third-Party Notices & Data Attributions

本プロジェクトのソースコードおよびオリジナル3D造形ロジックは MIT License で公開されています。
一方で、生成・描画に利用している地理空間データおよび外部OSSライブラリ・デザインリソースには、以下のライセンス・利用規約が適用されます。

---

## Geospatial Data Sources

### 1. OpenStreetMap (建物輪郭・道路/歩道ネットワーク・高架橋・施設名称・緑地情報)
- **Attribution**: Map data © OpenStreetMap contributors
- **License**: Open Database License (ODbL) v1.0
  - https://opendatacommons.org/licenses/odbl/1-0/
- **Note**:
  - 本リポジトリのアプリコードおよびデータ生成スクリプトは MIT License です。
  - OpenStreetMap から取得した生の地理データは `.cache/` にローカル保持され（Git管理外）、ビルドスクリプトにより Web 表示用の軽量ジオラマデータ（Produced Work）へ変換されます。
  - 再配布・公開時は上記の出典表記（`© OpenStreetMap contributors (ODbL)`）を必ず維持してください。

### 2. 国土地理院 地理院タイル（標高タイル DEM5A / DEM5B / DEM10B）
- **Attribution**: 出典：国土地理院 地理院タイル（標高タイル）を加工して作成
- **Terms of Use**: 国土地理院コンテンツ利用規約（政府標準利用規約（第2.0版）準拠 / CC BY 4.0 互換）
  - https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html
- **Note**: 標高データの生値をもとに、ジオラマ用のメッシュ・スロープ・段差表現へ加工して利用しています。

### 3. 国土交通省 Project PLATEAU の調査結果について
- 2026年11月時点で、G空間情報センター CKAN API を用いて吹田市（全国地方公共団体コード `27205`）の PLATEAU 3D都市モデルの公開有無を照会し、未公開（0件）であることを確認しています。
- 調査・照会結果の詳細は `docs/DATA_SOURCES.md` を参照してください。

---

## Motion Tokens & UI Patterns

- **transitions.style** — MIT License © Jakub Antalík (https://transitions.style)
  - 5軸モーショントークン（duration / ease / distance / scale / blur）および非対称トランジション、`prefers-reduced-motion` 設計を CSS トークンとして採用しています。

---

## Software Libraries

- **Three.js** — MIT License (https://github.com/mrdoob/three.js)
- **React / React DOM** — MIT License (https://github.com/facebook/react)
- **Vite** — MIT License (https://github.com/vitejs/vite)
- **Tailwind CSS** — MIT License (https://github.com/tailwindlabs/tailwindcss)
- **Lucide Icons** — ISC License (https://github.com/lucide-icons/lucide)
- **pngjs** — MIT License (https://github.com/pngjs/pngjs)
