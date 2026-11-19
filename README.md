# 関西大学 千里山キャンパス 3Dジオラママップ

関西大学 千里山キャンパス（関大前駅〜正門〜全学舎・悠久の庭・グラウンド）を、実際の地形高低差と建物配置にもとづいて **ミニチュア・ジオラマ調のポップな3D空間** として再現した、スマートフォン対応・オープンソースの Web 3D 案内マップです。

Web ブラウザ上で動作するほか、単体の 3D アセット（`.glb` / `.obj`）として書き出して Unity・Blender・モバイルアプリへ組み込むこともできます。

---

## 主な機能

- **実測高低差 × ミニチュア・ジオラマ造形**:
  - 国土地理院 標高タイル（DEM5A / 5mメッシュ）から関大前駅（約25.6m）→ 正門（約37.1m）→ 第1学舎高台（約53.2m）の起伏を忠実に立体化。
  - 簡文館（村野藤吾設計の円形増築棟＆銅板風ドーム）、凜風館（段丘状屋上緑化・桜・回転する風車）、BIGホール100、総合図書館、正門、関大前駅と阪急マルーン電車など、特徴を捉えたポップな建築造形を搭載。
- **インクリメンタル検索 & エリア絞り込み**:
  - 建物名・ひらがな/カタカナ・学部名・施設タグ（学食・図書館・自習・博物館など）から即座に検索＆カメラ移動。
- **2モード徒歩ルート案内 & 標高プロフィール**:
  - 「最短ルート」と「坂・階段ひかえめルート」を切り替え、距離・所要時間・獲得標高・階段区間数・SVG標高断面図・3Dルートリボンを表示。
- **スマホ最適化 & ライト切替**:
  - ピンチ・スワイプ操作、画面上のラベル重複防止、昼 / 夕方のライティング切替、折りたたみ可能な詳細シートを搭載。
- **単体 3D モデル出力（`.glb` / `.obj`）**:
  - `npm run export:3d` により、地形台座・建物・樹木を含んだ `senriyama-campus.glb` / `.obj` を Node.js 単体で書き出し可能。

---

## セットアップと起動

前提: Node.js 22+（v24 動作確認済み）

```bash
npm install
npm run dev
```

開発サーバは `http://localhost:3240`（`npm run preview` は `3241`）で起動します。

### テスト・型チェック・ビルド

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

---

## オープンデータの再取得とビルド

リポジトリには変換済み軽量データ（`public/data/senriyama/`）を含めています。最新の OpenStreetMap / 国土地理院標高タイルから再構築する場合は以下を実行します。

```bash
# 1. Overpass API / GSI DEM5A / PLATEAU CKAN 状況を取得（.cache/raw/ へ保存）
npm run data:fetch

# 2. ローカル座標変換・DEM格子化・ランドマーク照合・歩行グラフ構築
npm run data:build
```

---

## 3Dモデル（GLB / OBJ）の書き出し

Blender・Unity・iOS/Android アプリ等で利用するための単体3Dアセットを `exports/` 配下に生成します。

```bash
npm run export:3d
# -> exports/senriyama-campus.glb
# -> exports/senriyama-campus.obj
```

---

## 他キャンパスへの拡張ガイド

将来的に高槻・高槻ミューズ・堺・吹田みらい・梅田キャンパスを追加する場合は、`src/domain/types.ts` の `CampusId` を拡張し、`src/data/campuses/<campusId>/`（`config.ts`, `landmarks.ts`）を追加して `src/domain/campus-registry.ts` に登録してください。吹田市外（高槻市・堺市・大阪市など）では国土交通省 Project PLATEAU のオープンデータも併用できます。

---

## ライセンスとデータ出典

- **ソースコード・造形ロジック**: [MIT License](LICENSE)
- **地図・建物・歩道データ**: Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL v1.0)
- **標高データ**: 出典：国土地理院 地理院タイル（標高タイル DEM5A）を加工して作成（政府標準利用規約 第2.0版）
- **詳細・権利一覧**: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) および [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。

