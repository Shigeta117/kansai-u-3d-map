# 建物内・教室・出入口データスキーマ（`Indoor Data Schema`）

本プロジェクトでは、外観の 3Dジオラマ（`packages/core`）とは別に、各建物の**階層構成・教室一覧・出入口位置・棟間連絡（高架デッキ / 屋内連絡廊下 / EVシャフト）**を型安全に扱えるスキーマを定義しています。

定義場所: [`packages/core/src/domain/indoor-types.ts`](../packages/core/src/domain/indoor-types.ts)  
現在の千里山サンプル収録ファイル: [`apps/guide/src/data/indoor/senriyama-indoor.ts`](../apps/guide/src/data/indoor/senriyama-indoor.ts)

---

## 1. 型定義一覧

### `BuildingFloorPlan`（建物単位のルートオブジェクト）

| フィールド | 型 | 説明 |
|---|---|---|
| `buildingId` | `string` | `public/data/senriyama/buildings.json` または `landmarks.ts` の `id` と一致（例: `'area3'`, `'bighall-100'`, `'shinkandaikaikan-south'`） |
| `summaryNote` | `string?` | 建物の高低差事情や利用案内サマリー |
| `floors` | `FloorMeta[]` | 地下階〜地上階の階層メタ一覧 |
| `entrances` | `BuildingEntrance[]` | 出入口一覧（地表接続階・車いす対応可否・注記） |
| `connectors` | `BuildingConnector[]` | 秀麗橋や屋内連絡通路など他棟/他階への接続関係 |
| `rooms` | `RoomEntry[]` | 教室・大ホール・事務室・ラウンジ等の一覧 |

### `FloorMeta`（階層メタ）

```ts
export interface FloorMeta {
  floor: number;                  // 例: 1, 2, -1 (= B1F)
  label: string;                  // 例: '1F', '2F', 'B1F'
  groundAccess?: boolean;         // その階が外の地面と段差なく接しているか
  hasElevator?: boolean;          // エレベーター停止階か
  hasAccessibleRestroom?: boolean;// 多機能トイレ有無
  floorMapImage?: string;         // 配置図画像パス（将来対応用）
}
```

### `BuildingEntrance` & `BuildingConnector`

傾斜地の多い千里山キャンパスでは「西側からは1F、東側・秀麗橋側からは2Fが地表/デッキに接続している」ケースが多いため、複数の出入口と棟間連絡を分離して表現します。

- `BuildingEntrance`: `id`, `label`, `floor`, `coord?` (`{ lat, lon }`), `walkNodeId?`, `accessible`, `note?`
- `BuildingConnector`: `id`, `fromBuildingId`, `fromFloor`, `toBuildingId`, `toFloor`, `kind` (`'skybridge' | 'indoor-corridor' | 'underground' | 'elevator-shaft'`), `accessible`, `label`, `note?`

### `RoomEntry`（教室・室別データ）

```ts
export interface RoomEntry {
  id: string;
  code: string;        // 教室番号（例: 'A401', '3201', 'BIGホール100'）
  name: string;        // 表示名
  floor: number;       // 階（負値は地下）
  kind: RoomKind;      // 'lecture' | 'hall' | 'lab' | 'seminar' | 'office' | 'cafeteria' | 'library' | 'lounge' | 'restroom' | 'other'
  capacity?: number;   // 収容人数
  accessible?: boolean;// 車いす席・段差フリー入室可否
  powerOutlets?: boolean; // 電源コンセント有無
  note?: string;
}
```

---

## 2. 新規教室データの追加方法

手元の配置図データ（PDF・表・JSON等）をアプリに組み込む手順は以下のとおりです。

1. 建物の `id` を [`packages/core/src/data/campuses/senriyama/landmarks.ts`](../packages/core/src/data/campuses/senriyama/landmarks.ts) で確認する（例: 第1学舎は `area1-1`、第3学舎は `area3`）。
2. [`apps/guide/src/data/indoor/senriyama-indoor.ts`](../apps/guide/src/data/indoor/senriyama-indoor.ts) の `SENRIYAMA_FLOOR_PLANS` に該当エントリを追加・追記する（または外部 JSON ファイル化して `fetch` 読み込みに切り替える）。
3. 追加後は以下を実行して型と検索動作を確認する：
   ```bash
   npm run typecheck
   npm run lint
   npm run test
   ```

検索バー（`SearchBar`）・ルート地点ピッカー（`LocationPicker`）・詳細シート3タブ（`BuildingSheet`）は `SENRIYAMA_FLOOR_PLANS` を自動参照するため、データ追記のみでそのまま教室名検索やフロアジャンプに対応します。

