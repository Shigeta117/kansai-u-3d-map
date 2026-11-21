# 建物内・教室・出入口データスキーマ（`Indoor Data Schema`）

本プロジェクトでは、外観の 3Dジオラマ（`packages/core`）とは別に、各建物の**棟記号（A〜F棟 / 1xxx〜4xxx番台）・ナンバリング規則・階層構成・教室一覧・オフィス・出入口・棟間連絡**を型安全に扱えるスキーマを定義しています。

定義場所: [`packages/core/src/domain/indoor-types.ts`](../packages/core/src/domain/indoor-types.ts)  
千里山キャンパス収録ファイル: [`apps/guide/src/data/indoor/senriyama-indoor.ts`](../apps/guide/src/data/indoor/senriyama-indoor.ts)

> **出典とフロア平面図・バリアフリー情報の扱いについて**  
> 各学舎の棟区分・教室番号・オフィスおよび学生支援施設の階数配置は、関西大学教務ガイド **「KAN-CAN! 千里山キャンパス 学舎・教室（一覧）」（2026.10.5 更新）** の公開テーブルをもとに収録しています。防犯・管理上の配慮から詳細なフロア平面図画像は同梱せず保留としています。  
> 一方、**バリアフリー情報（段差・エレベーター・多機能トイレ）・定員・設備（電源等）は KAN-CAN! に記載が無いため未確認**です。現在の千里山データ（28棟）ではバリアフリー系フィールドはすべて `'unknown'` とし、出典の無い `powerOutlets`・`capacity` は入れていません。

---

## 1. 千里山キャンパスの教室ナンバリング体系

| エリア | 棟コード / 号館対応 | 教室番号の規則と例 |
|---|---|---|
| **第1学舎・岩崎記念館** | `1号館=A棟`, `2号館=B棟`, `3号館=C棟`, `4号館=D棟`, `5号館=E棟`, `岩崎記念館=F棟` | `[棟 A〜F] + [階 1〜6] + [室番 01〜19]`（例: `A401` = 1号館A棟4階、`D112` = 4号館D棟1階、`F203` = 岩崎記念館2階） |
| **第2学舎** | `1号館=A棟・B棟`, `2号館=C棟`, `3号館=D棟・E棟`, `4号館=F棟(BIGホール100)` | `[棟 A〜F] + [階 1〜6] + [室番 01〜12]`（第1・第3学舎と同じ A〜F を使うため学舎名の確認が重要） |
| **第3学舎** | `1号館=A棟`, `2号館=B棟`, `3号館=C棟`, `4号館=D棟` | `[棟 A〜D] + [階 1〜5] + [室番 01〜07]`（例: `D101` = 4号館D棟 関大ソシオAV大ホール） |
| **第4学舎** | `1号館(①・②教授棟)`, `2号館(③教室棟・④研究棟・⑤別館)`, `3号館(⑥)`, `4号館(⑦)`, `第1〜第6実験棟(⑧〜⑬)` | **4桁数字** `[号館 1〜4] + [階 0=地階, 1〜5] + [室番 01〜08]`（例: `2205` = 2号館2階、`4001` = 4号館地階） |
| **尚文館（大学院）** | 尚文館（1F〜7F） | **3桁数字** `[階 2〜5] + [室番 01〜22]`（例: `405` = 4階05演習室） |
| **以文館（大学院）** | 以文館（B1F〜4F） | 地階 `B1講義室` / 2階 **2桁数字** `21〜28`（例: `24講義室`） |

---

## 2. 型定義一覧

### `BuildingFloorPlan`

| フィールド | 型 | 説明 |
|---|---|---|
| `buildingId` | `string` | `landmarks.ts` の `id` と一致（例: `'area1-4'`, `'area2-bighall'`, `'area3'`, `'area4-2'`） |
| `wingLabel` | `string?` | 棟ラベル（例: `'D棟（4号館）'`, `'A〜D棟（第3学舎1〜4号館）'`） |
| `numberingRule` | `string?` | その建物の教室番号の読み方解説 |
| `sourceName` / `sourceUrl` / `sourceUpdatedAt` | `string?` | 公開データ出典メタ情報 |
| `accessibilitySource` | `string?` | バリアフリー系フィールド（`access` / `elevator` / `accessibleRestroom`）に出典つきで確認済みの値を入れる場合の出典名・URL |
| `summaryNote` | `string?` | 建物の利用・オフィス配置サマリー |
| `floors` | `FloorMeta[]` | 地下階〜地上階の階層メタ一覧 |
| `entrances` | `BuildingEntrance[]` | 出入口一覧 |
| `connectors` | `BuildingConnector[]` | 秀麗橋や連絡通路など他棟への接続関係 |
| `rooms` | `RoomEntry[]` | 教室・オフィス・ホール等の一覧 |

### バリアフリー状態の 3 値表現（`AccessStatus`）

```ts
export type AccessStatus = 'yes' | 'no' | 'unknown';
```

バリアフリーに関わるフィールドは真偽値（`boolean`）ではなく 3 値の `AccessStatus` を使用します。

| 型・フィールド | 型 | 省略時の扱い |
|---|---|---|
| `BuildingEntrance.access` | `AccessStatus` | 必須 |
| `BuildingConnector.access` | `AccessStatus` | 必須 |
| `RoomEntry.access` | `AccessStatus?` | `'unknown'` 扱い |
| `FloorMeta.elevator` | `AccessStatus?` | `'unknown'` 扱い |
| `FloorMeta.accessibleRestroom` | `AccessStatus?` | `'unknown'` 扱い |

**データ入力ルール**:
- バリアフリー系の値は、信頼できる出典（大学の公式バリアフリーマップや現地確認記録など）があるときだけ `'yes'` または `'no'` を入れ、`BuildingFloorPlan.accessibilitySource` に出典を記録します。
- 出典が無い場合は推測で `'yes'` や `'no'` にせず、必ず `'unknown'`（未確認）にします。
- UI では `'yes'` のときのみ肯定バッジを表示し、`'no'` のときは「段差あり」、`'unknown'` のときは個別バッジを出さず未確認である旨の注意と大学公式アクセスマップへの案内を表示します。

### 棟の id とバリアフリーマップの事実（2026-11-21）

- `RoomEntry.wingId`: 学舎（第1〜第4学舎・岩崎記念館・尚文館・以文館）の部屋はすべて棟の id を持つ。棟の表と建物との対応の表は `packages/core/src/data/campuses/senriyama/wings.ts`、決め方は `WING_ID_RULE`（`docs/indoor-plan.md` 16 節の P0b）
- 入口ごとの階・扉の種類・段差、エレベーターの印、多機能トイレの階、棟の間の連絡路は、`BuildingFloorPlan` ではなく `apps/guide/src/data/indoor/barrier-free/senriyama.ts`（型は `packages/core/src/domain/indoor-l1.ts`）に出典と版つきで持つ。上の表のバリアフリー系の欄（`unknown` のまま）を移すのは P2 の型の移行

### `RoomEntry` とレンジ展開検索（`searchableCodes`）

KAN-CAN! 上で `D101〜D119教室` や `2201〜2208教室` のように連番表記されている教室群は、`expandRoomRange('D', 101, 119)` により `searchableCodes` へ個別教室番号を展開しています。これにより、検索バーや地点ピッカーで **`D112`** や **`2205`** のような単一教室番号を入力しても該当建物の該当階が即座にヒットします。
