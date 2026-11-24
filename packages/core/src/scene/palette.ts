import type { BuildingCategory, LandcoverKind, PathKind } from '../domain/types';

export const SCENE_PALETTE = {
  background: {
    day: '#EFECE4',
    golden: '#F3D8BE',
  },
  fog: {
    day: '#EFECE4',
    golden: '#F1D4BA',
  },
  terrain: {
    surroundingGround: '#E6E0D4',
    campusPlaza: '#EFE8DA',
    slopeRock: '#B5A38C',
    plinthRim: '#D6C9B3',
    plinthBody: '#C4B399',
    plinthFoot: '#3D444E',
  },
  diorama: {
    rim: '#EFE7D8',
    topsoil: '#6B4F3A',
    subsoil: '#9C7B5B',
    deepSoil: '#5A4334',
    bottom: '#4A382B',
  },
  landcover: {
    'campus-ground': '#EFE8DA',
    lawn: '#89B468',
    // 塗り分けのまま残るグラウンド（千里山北広場・一中の北の運動場）は、空中写真では人工芝の緑。
    // トラック・野球場・テニスコートは GroundsBuilder が上に面を描く
    'sports-pitch': '#5F9150',
    forest: '#639257',
    water: '#6DA7BA',
  } satisfies Record<LandcoverKind, string>,
  paths: {
    'campus-walk': '#F7F1E3',
    steps: '#D97B50',
    'road-major': '#9A9FA6',
    'road-minor': '#CBC6BC',
  } satisfies Record<PathKind, string>,
  buildings: {
    area1: '#BC5D42',      // Red-brown brick tile
    area2: '#D9A760',      // Warm sandstone
    area3: '#F2EEE5',      // Bright white tile (teal roof trim)
    area4: '#ECEFF3',      // Large white tile + concrete frame (cobalt roof trim)
    shared: '#F2EBDC',     // Warm cream / limestone
    heritage: '#9E4B39',   // Deep heritage brick (Kanbunkan / Library)
    sports: '#EAE5DA',     // Light body (arena green roof)
    gate: '#6B2336',       // Hankyu maroon / gate
    other: '#E9DFCE',
    surrounding: '#DFD8CC',
  } satisfies Record<BuildingCategory, string>,
  roofOverrides: {
    area3: '#438990',
    area4: '#3E6FA8',
    sports: '#5D8E6D',
  } as Partial<Record<BuildingCategory, string>>,
  accents: {
    roofTrim: '#FAF6EE',
    copperPatina: '#5B8A7E',
    slateRoof: '#587082',
    glass: '#8EC5D6',
    canopyGlass: '#A7D7EA',
    bridgeGlass: '#9ED0E0',
    bridgeDeck: '#ECE4D4',
    bridgeGirder: '#D8CEBD',
    escalatorMetal: '#85909B',
    sakura: '#F3AFC0',
    hankyuMaroon: '#6B2336',
    kandaiNavy: '#1B365D',
    routeMain: '#C85A3A',
    routeGentle: '#2B8A6E',
    routeStepFree: '#1F7A8C',
    routePulse: '#FFF8EB',
  },
  /**
   * 選んだ建物の見た目（selectionHighlight.ts）。輪郭は経路の線と選んだ名札のピン（どちらも routeMain の赤茶）と
   * 見分けられるよう、黄みの強い琥珀か墨にする。塗りは下の色に掛けて明るくする色（暖かい白）。薄める色は台の色に寄せた灰色
   */
  selection: {
    outlineAmber: '#E8960C',
    outlineInk: '#1D2430',
    fill: '#FFF0D8',
    dimTarget: '#DDD8CE',
  },
  foliage: {
    trunk: '#785B46',
    canopies: ['#699E57', '#7BB063', '#56854B'],
    sakuraCanopy: '#F4B2C2',
  },
} as const;
