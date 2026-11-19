import type { BuildingFloorPlan, RoomEntry } from '@kansai-u-3d/core';

function buildStandardFloors(
  levels: number,
  groundFloor: number,
  basementCount = 0,
  hasElevator = true,
): BuildingFloorPlan['floors'] {
  const floors: BuildingFloorPlan['floors'] = [];
  for (let b = basementCount; b >= 1; b--) {
    const f = -b;
    floors.push({
      floor: f,
      label: `B${b}F`,
      groundAccess: f === groundFloor,
      hasElevator,
      hasAccessibleRestroom: b === 1,
    });
  }
  for (let f = 1; f <= levels; f++) {
    floors.push({
      floor: f,
      label: `${f}F`,
      groundAccess: f === groundFloor,
      hasElevator,
      hasAccessibleRestroom: f === 1 || f === groundFloor,
    });
  }
  return floors;
}

export const SENRIYAMA_FLOOR_PLANS: Record<string, BuildingFloorPlan> = {
  'area1-1': {
    buildingId: 'area1-1',
    summaryNote:
      '第1学舎（法・文・国際等）の1〜5号館およびA棟を含む中核エリア。法文坂沿いの高低差により、棟と階層によって地表接続階が異なります。',
    floors: buildStandardFloors(5, 1, 1, true),
    entrances: [
      {
        id: 'a1-hobunzaka-1f',
        label: 'A棟 正面ピロティ入口（1F）',
        floor: 1,
        accessible: true,
        note: '総合図書館・以文館方面からの緩斜面アプローチ',
      },
      {
        id: 'a1-north-court',
        label: '1号館 中庭側連絡口（1F/2F）',
        floor: 1,
        accessible: true,
        note: 'エレベーター経由で全階移動可能',
      },
    ],
    connectors: [
      {
        id: 'conn-a1-wings',
        fromBuildingId: 'area1-1',
        fromFloor: 2,
        toBuildingId: 'area1-1',
        toFloor: 2,
        kind: 'indoor-corridor',
        accessible: true,
        label: 'A棟・1〜5号館 屋内連絡廊下（2F）',
        note: '天候に左右されず各号館へ横断可能（一部スロープ併用）',
      },
    ],
    rooms: [
      {
        id: 'a1-a401',
        code: 'A401',
        name: '第1学舎A棟 大講義室',
        floor: 4,
        kind: 'lecture',
        capacity: 300,
        accessible: true,
      },
      {
        id: 'a1-101',
        code: '1-101',
        name: '1号館 大教室',
        floor: 1,
        kind: 'lecture',
        capacity: 220,
        accessible: true,
      },
      {
        id: 'a1-office',
        code: '1F 事務室',
        name: '法・文学部オフィス（証明書発行コーナー）',
        floor: 1,
        kind: 'office',
        accessible: true,
        note: '詳細室番号データは配置図ファイル読込で拡張可能',
      },
      {
        id: 'a1-lounge',
        code: '2F ラウンジ',
        name: '学生ラウンジ・自習スペース',
        floor: 2,
        kind: 'lounge',
        powerOutlets: true,
        accessible: true,
      },
    ],
  },

  'area2-1': {
    buildingId: 'area2-1',
    summaryNote:
      '経済学部・商学部が集う第2学舎群。1〜3号館と北西側の新棟が複数フロアで連絡しています。',
    floors: buildStandardFloors(5, 1, 1, true),
    entrances: [
      {
        id: 'a2-south-1f',
        label: '第2学舎 南エントランス（1F）',
        floor: 1,
        accessible: true,
        note: '悠久の庭・簡文館前広場側から段差なく入館可能',
      },
      {
        id: 'a2-bridge-2f',
        label: '3号館側 テラス入口（2F）',
        floor: 2,
        accessible: true,
      },
    ],
    connectors: [
      {
        id: 'conn-a2-123',
        fromBuildingId: 'area2-1',
        fromFloor: 2,
        toBuildingId: 'area2-1',
        toFloor: 2,
        kind: 'indoor-corridor',
        accessible: true,
        label: '第2学舎1〜3号館 連絡デッキ（2F）',
        note: '階段を使わずEV・スロープ併用で各棟へ移動可能',
      },
    ],
    rooms: [
      {
        id: 'a2-2101',
        code: '2-201',
        name: '第2学舎 大講義室',
        floor: 2,
        kind: 'lecture',
        capacity: 260,
        accessible: true,
      },
      {
        id: 'a2-3b1',
        code: 'B1F 多目的',
        name: '地下演習室エリア',
        floor: -1,
        kind: 'seminar',
        accessible: true,
      },
      {
        id: 'a2-office',
        code: '1F 事務室',
        name: '経済・商学部オフィス（学修相談カウンター）',
        floor: 1,
        kind: 'office',
        accessible: true,
      },
    ],
  },

  area3: {
    buildingId: 'area3',
    summaryNote:
      '社会学部を中心とする西門・新アクセス路側の拠点。1Fは新アクセス坂側・2Fテラスは秀麗橋高架デッキへ直結しています。',
    floors: buildStandardFloors(5, 1, 0, true),
    entrances: [
      {
        id: 'a3-west-1f',
        label: '西門・新アクセス路側 1F入口',
        floor: 1,
        accessible: true,
        note: '屋外エスカレーター上り切り広場のすぐ正面',
      },
      {
        id: 'a3-shurei-2f',
        label: '秀麗橋連絡 2Fデッキ入口',
        floor: 2,
        accessible: true,
        note: '正門・新関西大学会館南棟まで高低差ゼロで往来可能',
      },
    ],
    connectors: [
      {
        id: 'conn-a3-shurei',
        fromBuildingId: 'area3',
        fromFloor: 2,
        toBuildingId: 'shinkandaikaikan-south',
        toFloor: 2,
        kind: 'skybridge',
        accessible: true,
        label: '秀麗橋（高架歩道橋）直結',
        note: '道路を渡らずそのままの高さで新関西大学会館南棟・正門方面へ接続',
      },
    ],
    rooms: [
      {
        id: 'a3-e101',
        code: 'E101',
        name: '第3学舎 E101 大教室',
        floor: 1,
        kind: 'lecture',
        capacity: 240,
        accessible: true,
      },
      {
        id: 'a3-3201',
        code: '3201',
        name: '第3学舎 2F 講義室',
        floor: 2,
        kind: 'lecture',
        capacity: 150,
        accessible: true,
      },
      {
        id: 'a3-studio',
        code: '2F メディア',
        name: '社会学部メディア実習・編集エリア',
        floor: 2,
        kind: 'lab',
        powerOutlets: true,
        accessible: true,
      },
      {
        id: 'a3-office',
        code: '1F 事務室',
        name: '社会学部オフィス・受付',
        floor: 1,
        kind: 'office',
        accessible: true,
      },
    ],
  },

  'area4-1': {
    buildingId: 'area4-1',
    summaryNote:
      'システム理工・環境都市工・化学生命工学部の理工系3学部が集まる東端エリア。実験棟群と高層講義棟が連なります。',
    floors: buildStandardFloors(6, 1, 1, true),
    entrances: [
      {
        id: 'a4-west-plaza',
        label: '第4学舎 西側メインエントランス（1F）',
        floor: 1,
        accessible: true,
        note: '総合図書館・体育館通り方面からのアクセス入口',
      },
      {
        id: 'a4-courtyard',
        label: '中庭スロープ連絡口（1F）',
        floor: 1,
        accessible: true,
      },
    ],
    connectors: [
      {
        id: 'conn-a4-labs',
        fromBuildingId: 'area4-1',
        fromFloor: 2,
        toBuildingId: 'area4-1',
        toFloor: 2,
        kind: 'indoor-corridor',
        accessible: true,
        label: '第4学舎 1・2・3号館 渡り廊下（2F/3F）',
        note: '実験棟・講義棟間を屋内移動可能',
      },
    ],
    rooms: [
      {
        id: 'a4-1101',
        code: '4-101',
        name: '第4学舎 1号館大教室',
        floor: 1,
        kind: 'lecture',
        capacity: 220,
        accessible: true,
      },
      {
        id: 'a4-lab-zone',
        code: '3F〜5F',
        name: '実験室・研究室フロア',
        floor: 3,
        kind: 'lab',
        powerOutlets: true,
        accessible: true,
      },
      {
        id: 'a4-office',
        code: '1F 事務室',
        name: '理工系3学部オフィス',
        floor: 1,
        kind: 'office',
        accessible: true,
      },
    ],
  },

  'bighall-100': {
    buildingId: 'bighall-100',
    summaryNote:
      '千里山キャンパス最大の多目的大ホール。オープンキャンパス全体説明会や講演会、大規模講義の会場となります。',
    floors: [
      { floor: -1, label: 'B1F', groundAccess: false, hasElevator: true, hasAccessibleRestroom: true },
      { floor: 1, label: '1F', groundAccess: true, hasElevator: true, hasAccessibleRestroom: true },
      { floor: 2, label: '2F', groundAccess: false, hasElevator: true },
    ],
    entrances: [
      {
        id: 'bh-front-1f',
        label: '正門東側 100周年記念会館 1F正面入口',
        floor: 1,
        accessible: true,
        note: '正門ロータリー側からスロープでそのまま入館可能',
      },
    ],
    connectors: [
      {
        id: 'conn-bh-100',
        fromBuildingId: 'bighall-100',
        fromFloor: 1,
        toBuildingId: 'shinkandaikaikan-south',
        toFloor: 1,
        kind: 'skybridge',
        accessible: true,
        label: '正門前・新関西大学会館南棟への平坦横断',
      },
    ],
    rooms: [
      {
        id: 'bh-main-hall',
        code: 'BIGホール100',
        name: '大ホール（メインアリーナ客席）',
        floor: 1,
        kind: 'hall',
        capacity: 900,
        accessible: true,
        note: '車いす観覧エリア・EV対応',
      },
      {
        id: 'bh-foyer',
        code: '1F ホワイエ',
        name: '100周年記念会館 ロビー・展示コーナー',
        floor: 1,
        kind: 'lounge',
        accessible: true,
      },
    ],
  },

  'shinkandaikaikan-south': {
    buildingId: 'shinkandaikaikan-south',
    summaryNote:
      '円錐屋根が特徴の新関西大学会館南棟。秀麗橋高架デッキの交差ハブで、正門前から段差なしで第3学舎方面・法文坂方面へ通り抜けられます。',
    floors: buildStandardFloors(4, 1, 0, true),
    entrances: [
      {
        id: 'sks-ground-1f',
        label: '正門ロータリー側 1F入口',
        floor: 1,
        accessible: true,
      },
      {
        id: 'sks-shurei-2f',
        label: '秀麗橋 2Fデッキ連絡口',
        floor: 2,
        accessible: true,
        note: 'エレベーターで1F正門・関大前通り側へ上下移動可能',
      },
    ],
    connectors: [
      {
        id: 'conn-sks-west',
        fromBuildingId: 'shinkandaikaikan-south',
        fromFloor: 2,
        toBuildingId: 'area3',
        toFloor: 2,
        kind: 'skybridge',
        accessible: true,
        label: '秀麗橋（第3学舎連絡デッキ）',
      },
      {
        id: 'conn-sks-north',
        fromBuildingId: 'shinkandaikaikan-south',
        fromFloor: 2,
        toBuildingId: 'shinkandaikaikan-north',
        toFloor: 2,
        kind: 'skybridge',
        accessible: true,
        label: '秀麗橋（北棟・法文坂合流デッキ）',
        note: 'そのままの高さで法文坂側（悠久の庭・簡文館方面）へ合流可能',
      },
    ],
    rooms: [
      {
        id: 'sks-hall',
        code: '南棟 ホール',
        name: '新関西大学会館 多目的ホール・会議室',
        floor: 2,
        kind: 'hall',
        accessible: true,
      },
      {
        id: 'sks-info',
        code: '1F 総合案内',
        name: 'インフォメーション・広報・校友会受付',
        floor: 1,
        kind: 'office',
        accessible: true,
      },
    ],
  },

  'shinkandaikaikan-north': {
    buildingId: 'shinkandaikaikan-north',
    summaryNote:
      'キャリアセンター・教務・入試関連サービスが集まる新関西大学会館北棟。正門側1Fから入り館内EVで高台の法文坂2Fレベルへ抜けるルートにも利用されます。',
    floors: buildStandardFloors(5, 1, 0, true),
    entrances: [
      {
        id: 'skn-1f',
        label: '正門北側 1Fエントランス',
        floor: 1,
        accessible: true,
      },
      {
        id: 'skn-2f-hobunzaka',
        label: '法文坂側 2Fデッキ出入口',
        floor: 2,
        accessible: true,
      },
    ],
    connectors: [
      {
        id: 'conn-skn-south',
        fromBuildingId: 'shinkandaikaikan-north',
        fromFloor: 2,
        toBuildingId: 'shinkandaikaikan-south',
        toFloor: 2,
        kind: 'skybridge',
        accessible: true,
        label: '秀麗橋・南棟連絡デッキ（2F）',
      },
    ],
    rooms: [
      {
        id: 'skn-kyomu',
        code: '1F 教務',
        name: '教務センター・資格取得・学籍相談デスク',
        floor: 1,
        kind: 'office',
        accessible: true,
      },
      {
        id: 'skn-career',
        code: '2F キャリア',
        name: 'キャリアセンター・進路相談室',
        floor: 2,
        kind: 'office',
        accessible: true,
      },
    ],
  },

  rimpukan: {
    buildingId: 'rimpukan',
    summaryNote:
      '段丘状の屋上緑化と風車が目印の学生会館「凜風館」。生協食堂・ブックセンター・カフェ・学生ラウンジが集まります。',
    floors: buildStandardFloors(4, 1, 0, true),
    entrances: [
      {
        id: 'rmp-west-1f',
        label: '悠久の庭側 1Fメインエントランス',
        floor: 1,
        accessible: true,
        note: '段差のない平坦な芝生広場側から入館',
      },
      {
        id: 'rmp-south-2f',
        label: '総合図書館側 2Fテラス入口',
        floor: 2,
        accessible: true,
      },
    ],
    connectors: [
      {
        id: 'conn-rmp-ev',
        fromBuildingId: 'rimpukan',
        fromFloor: 1,
        toBuildingId: 'rimpukan',
        toFloor: 3,
        kind: 'elevator-shaft',
        accessible: true,
        label: '館内エレベーター（1F食堂〜屋上庭園レベル）',
      },
    ],
    rooms: [
      {
        id: 'rmp-dining',
        code: '1F 生協食堂',
        name: '凜風館 Dining / カフェコーナー',
        floor: 1,
        kind: 'cafeteria',
        capacity: 750,
        accessible: true,
      },
      {
        id: 'rmp-book',
        code: '1F 書籍購買',
        name: '関大生協 ブックセンター・購買部',
        floor: 1,
        kind: 'other',
        accessible: true,
      },
      {
        id: 'rmp-coop-2f',
        code: '2F ラウンジ',
        name: 'コモンスペース・学生団体支援室',
        floor: 2,
        kind: 'lounge',
        powerOutlets: true,
        accessible: true,
      },
    ],
  },

  library: {
    buildingId: 'library',
    summaryNote:
      '赤褐色レンガ外観と張り出した正面大庇が特徴の総合図書館。全館EV・車いす対応閲覧席・グループラーニングエリアを備えます。',
    floors: buildStandardFloors(4, 1, 1, true),
    entrances: [
      {
        id: 'lib-front-1f',
        label: '正面大庇エントランス（1F・スロープ併用）',
        floor: 1,
        accessible: true,
        note: '正面階段の左手に段差フリーの進入スロープあり',
      },
    ],
    connectors: [
      {
        id: 'conn-lib-ev',
        fromBuildingId: 'library',
        fromFloor: -1,
        toBuildingId: 'library',
        toFloor: 4,
        kind: 'elevator-shaft',
        accessible: true,
        label: '図書館エレベーター（B1F〜4F）',
      },
    ],
    rooms: [
      {
        id: 'lib-1f-gate',
        code: '1F メイン',
        name: '入館ゲート・レファレンスデスク・新着図書',
        floor: 1,
        kind: 'library',
        accessible: true,
      },
      {
        id: 'lib-lc',
        code: 'B1F LC',
        name: 'ラーニング・コモンズ / AVコーナー',
        floor: -1,
        kind: 'lounge',
        powerOutlets: true,
        accessible: true,
      },
      {
        id: 'lib-2f-study',
        code: '2F〜3F 閲覧室',
        name: '個人学習席・研究個室エリア',
        floor: 2,
        kind: 'library',
        powerOutlets: true,
        accessible: true,
      },
    ],
  },

  kanbunkan: {
    buildingId: 'kanbunkan',
    summaryNote:
      '村野藤吾による円形増築と螺旋階段が美しい関西大学博物館。展示室とミュージアムショップ風の回廊があります。',
    floors: buildStandardFloors(3, 1, 0, true),
    entrances: [
      {
        id: 'kb-south-1f',
        label: '簡文館 南側入館口（1F）',
        floor: 1,
        accessible: true,
      },
    ],
    connectors: [],
    rooms: [
      {
        id: 'kb-1f-exhibit',
        code: '1F 展示室',
        name: '博物館 常設展示・特別展示ロビー',
        floor: 1,
        kind: 'other',
        accessible: true,
      },
      {
        id: 'kb-rotunda',
        code: '円形棟 螺旋階段',
        name: '村野藤吾設計 円形閲覧室（文化財空間）',
        floor: 2,
        kind: 'other',
      },
    ],
  },

  ibunkan: {
    buildingId: 'ibunkan',
    summaryNote:
      '大小2つの八角形ドームを持つ法文坂上の重厚な校舎。',
    floors: buildStandardFloors(4, 1, 0, true),
    entrances: [
      {
        id: 'ib-east-1f',
        label: '悠久の庭・簡文館側 1F入口',
        floor: 1,
        accessible: true,
      },
    ],
    connectors: [],
    rooms: [
      {
        id: 'ib-seminar',
        code: '1F〜3F',
        name: '大学院演習室・講義室群',
        floor: 2,
        kind: 'seminar',
        accessible: true,
      },
    ],
  },

  enshinkan: {
    buildingId: 'enshinkan',
    summaryNote:
      '16本の円柱ピロティに支えられた円筒状のモザイクタイル校舎。正門・尚文館付近のランドマークです。',
    floors: buildStandardFloors(4, 1, 0, true),
    entrances: [
      {
        id: 'en-piloti-1f',
        label: '1F ピロティ・エントランス',
        floor: 1,
        accessible: true,
      },
    ],
    connectors: [],
    rooms: [
      {
        id: 'en-2f-hall',
        code: '2F 円形講義室',
        name: '円神館 円形ホール・講義室',
        floor: 2,
        kind: 'lecture',
        capacity: 180,
        accessible: true,
      },
    ],
  },

  iwasaki: {
    buildingId: 'iwasaki',
    summaryNote:
      '8階建ての高層研究棟とガラスの低層エントランス棟からなる西側ランドマーク。',
    floors: buildStandardFloors(8, 1, 0, true),
    entrances: [
      {
        id: 'iw-glass-1f',
        label: '低層ガラス棟 メインエントランス（1F）',
        floor: 1,
        accessible: true,
      },
    ],
    connectors: [],
    rooms: [
      {
        id: 'iw-global',
        code: '2F 国際支援',
        name: '国際部・留学生サポートルーム',
        floor: 2,
        kind: 'office',
        accessible: true,
      },
      {
        id: 'iw-hall',
        code: '4F 会議ホール',
        name: '岩崎記念館 多目的ホール',
        floor: 4,
        kind: 'hall',
        accessible: true,
      },
    ],
  },
};

export const ROOM_KIND_LABELS: Record<RoomEntry['kind'], string> = {
  lecture: '講義室',
  hall: 'ホール・講堂',
  lab: '実験・実習',
  seminar: '演習室',
  office: '事務室・案内',
  cafeteria: '食堂・カフェ',
  library: '図書館エリア',
  lounge: 'ラウンジ・自習',
  restroom: '多機能トイレ',
  other: '展示・ショップ等',
};

export function getIndoorDataStats(): { buildingCount: number; roomCount: number } {
  const plans = Object.values(SENRIYAMA_FLOOR_PLANS);
  const roomCount = plans.reduce((acc, p) => acc + p.rooms.length, 0);
  return { buildingCount: plans.length, roomCount };
}

