# 関西大学 千里山キャンパス 3Dマップ（v0.2 モノレポ）

※ 関西大学の公式サービスではありません（個人のオープンソース・プロジェクト）。  
※ コードとデータの多くは AI（Gemini・Claude）が生成したもので、建物の外観・室内情報には人の確認が済んでいない部分があります。バリアフリー情報は未確認です。

関西大学 千里山キャンパス（関大前駅〜西門新アクセス路〜正門〜秀麗橋高架〜全学舎・悠久の庭・グラウンド）を、実測の地形高低差と建築特徴にもとづく **ポップなミニチュア・ジオラマ 3D空間** として再現した、オープンソースのマルチパッケージ・プロジェクトです（ソースコード: MIT License／`public/data/` 以下のデータ: ODbL v1.0・国土地理院出典表記）。

用途に応じて以下の 2形態＋共通コアで並行開発・配布できます。

- `packages/core` (`@kansai-u-3d/core`): 座標投影・3モード歩行探索・建物/教室検索・Three.js ジオラマ造形エンジン（秀麗橋高架デッキ・新アクセス上屋＆エスカレーター・各種ランドマーク造形を含む）
- `apps/lite` (`@kansai-u-3d/lite`): **軽量3Dビューア＆GLB/OBJアセット確認版**（Web/ブログへの iframe 埋込パラメータ `?embed=1&preset=...&theme=...&scope=...` 対応）
- `apps/guide` (`@kansai-u-3d/guide`): **高機能キャンパス＆教室案内アプリ**（階層/キーワード地点ピッカー・最短/坂ひかえめ/段差フリー（参考）の3モード案内・建物別3タブシート・教室/出入口/棟間連絡表示）

---

## 主な機能（v0.2）

### 1. 実測高低差 × 忠実化したポップ建築造形
- **実測地形**: 国土地理院 標高タイル（DEM5A / 5mメッシュ）から関大前駅（約25.6m）→ 正門（約37.1m）→ 第1学舎高台（約53.2m）の起伏を立体化。
- **インフラ造形改善**:
  - **西門・新アクセス路**: 関大前駅北口から第3学舎へ上る屋外エスカレーターと水色ガラス風斜面上屋・並木桜を再現（OSM屋根タグの誤壁化を解消）。
  - **秀麗橋（高架歩道デッキ）**: 第3学舎〜新関西大学会館南棟〜法文坂方面へ昇降なしで渡れる高架歩行ルートと橋脚・ガラス手すりを立体化。
  - **名神高速道路トンネル**: 地表の道路重複を取り除き、東西のトンネル坑口ポータルで地下通過を表現。
- **建築ランドマーク**: 円神館（16本円柱ピロティ）、以文館（大小2つの八角ドーム）、新関西大学会館南棟（円錐屋根）、総合図書館（レンガ＋大庇）、簡文館（円形ドラム＋銅板風ドーム）、凜風館（段丘屋上緑化＋回転風車）、第3学舎（白タイル＋ティール屋根枠）、第4学舎（大判白タイル＋コバルト屋根枠）、岩崎記念館（8Fタワー＋ガラス低層エントランス）ほか。

### 2. 3モード徒歩ルート案内 & 階層ピッカー（`apps/guide`）
- **地点ピッカー**: `出発` / `到着` ともエリア・カテゴリ別の折りたたみ一覧、キーワード検索、教室名ダイレクト選択、3Dマップ上の建物タップ指定に対応。
- **3モード切替**:
  - **最短（レッド `#C85A3A`）**: 距離最短の歩行ルート
  - **坂ひかえめ（グリーン `#2B8A6E`）**: 階段や急登坂を抑え、西門新アクセスエスカレーターや秀麗橋を積極利用
  - **段差フリー（ティール `#1F7A8C`）**: 階段およびエスカレーターのタグを除外した `accessibleWalkNodeId` 接続ルートを探索（非接続ペアでは「坂ひかえめ」への切替案内を表示）。OpenStreetMap の階段・エスカレーターの情報に基づく参考で、実際の段差やエレベーターの運用は保証しません。

### 3. 教室・出入口・棟間連絡情報スキーマ
- `BuildingFloorPlan` スキーマにより、各建物の階層別教室リスト・出入口・棟間連絡・バリアフリー状態（`yes` / `no` / `unknown`）などを格納可能。現在は **28 棟** を収録しており、教室番号は関西大学教務ガイド KAN-CAN! の公開ページにもとづいています。一方、**バリアフリー情報（段差・エレベーター・多機能トイレ）・定員・設備（電源等）は未確認**（全件 `unknown` または未設定）です（詳細は [docs/INDOOR_DATA_SCHEMA.md](docs/INDOOR_DATA_SCHEMA.md)）。

### 4. 単体 3Dアセット配布（`.glb` / `.obj`）
- `npm run export:3d` により、用途別の 2種類の 3Dモデルファイルを書き出し可能。
  - `exports/senriyama-campus-only.glb` / `.obj`: キャンパス主要棟・高架橋・上屋・地形・緑地のみの軽量版
  - `exports/senriyama-full.glb` / `.obj`: 周辺街区約2,300棟・阪急千里線まで含むフルシーン版

---

## セットアップと起動

前提: Node.js 22+（v24 動作確認済み）

```bash
npm install

# 案内機能版 (http://localhost:3240 / preview: 3241)
npm run dev:guide

# 軽量ビューア版 (http://localhost:3242 / preview: 3243)
npm run dev:lite
```

### 軽量版の iframe 埋込 URL 例
```text
http://localhost:3242/?embed=1&preset=west-access&theme=golden&scope=campus
```
- `embed=1`: ヘッダー・モーダル操作を省いたコンパクト表示
- `preset`: `overview` | `west-access` | `approach` | `hobunzaka` | `yukyu` | `area4`
- `theme`: `day` | `golden`
- `scope`: `campus`（キャンパス内のみ） | `full`（周辺含む）

---

## テスト・Lint・ビルド・書き出し

```bash
npm run typecheck   # packages/core, apps/guide, apps/lite の厳格型チェック
npm run lint        # ESLint（no-explicit-any: error / 警告0確認）
npm run test        # Vitest ユニットテスト（投影・検索・3モードルーティング）
npm run build       # 両アプリの Vite プロダクションビルド
npm run export:3d   # GLB / OBJ 2バリエーション書き出し + ノード/サイズ検証
```

---

## オープンデータの再取得とビルド

```bash
# 1. Overpass API / GSI DEM5A / PLATEAU CKAN 照会結果を .cache/raw/ に取得
npm run data:fetch

# 2. 投影変換・DEM格子化・高架/上屋/トンネル抽出・歩行ネットワーク構築
npm run data:build
```

---

## ライセンスとデータ出典

- **ソースコード**: [MIT License](LICENSE)（`packages/`・`apps/`・`scripts/`）
- **`public/data/` 以下のデータ**: [ODbL v1.0](public/data/senriyama/LICENSE.md)（Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors、Derivative Database）＋国土地理院の出典表記（出典：国土地理院 地理院タイル（標高タイル DEM5A）を加工して作成／政府標準利用規約 第2.0版）
- **3Dモデル書き出し（`exports/`、Git 管理外）**: ODbL の Produced Work として上記の出典表記を付けて配布
- **UIモーショントークン**: [transitions.dev](https://transitions.dev)（GitHub: `Jakubantalik/transitions.dev`、MIT © Jakub Antalík）パターン準拠
- **詳細・権利分離**: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) および [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
