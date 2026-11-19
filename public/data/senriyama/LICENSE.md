# データライセンス・出典（`public/data/senriyama/`）

このフォルダに含まれる JSON データファイルは、リポジトリのソースコード（ルートディレクトリの [`LICENSE`](../../../LICENSE) に記載の **MIT License**）とは **別のライセンス・利用規約** で提供されます。

## 1. OpenStreetMap 由来のデータベース（ODbL v1.0）

対象ファイル: `buildings.json`, `landcover.json`, `paths.json`, `structures.json`, `walk-graph.json`, `transport.json`, `meta.json`

- **ライセンス**: **Open Database License (ODbL) v1.0**
  - ライセンス本文: https://opendatacommons.org/licenses/odbl/1-0/
- **出典表記**: `© OpenStreetMap contributors`（https://www.openstreetmap.org/copyright ）
- **位置づけ**: これらの JSON は OpenStreetMap から抜き出して加工したデータベース（ODbL 上の **Derivative Database**）であり、ODbL v1.0 の条件のもとで提供します。これらの JSON を再配布・改変・公開する場合は、ODbL v1.0 に従い出典表記とライセンス条件（Share-Alike）を維持してください。

## 2. 標高データ（国土地理院）

対象: `terrain.json` および各 JSON データ内に含まれる標高値

- **出典表記**: 出典：国土地理院 地理院タイル（標高タイル）を加工して作成
- **利用規約**: 国土地理院コンテンツ利用規約（政府標準利用規約 第2.0版 / CC BY 4.0 互換）
  - https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html

## 3. ソースコードおよび 3D モデル出力との区別

- **ソースコード**（`packages/`・`apps/`・`scripts/`）: MIT License
- **本フォルダの JSON**（`public/data/senriyama/*.json`）: ODbL v1.0（Derivative Database）＋国土地理院の出典表記
- **3D モデル書き出し**（`npm run export:3d` により生成される `.glb`/`.obj`、Git 管理外）: ODbL 上の Produced Work として、上記の出典表記を付けて配布
