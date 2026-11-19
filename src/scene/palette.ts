import type { BuildingCategory, LandcoverKind, PathKind } from '@/domain/types';

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
  landcover: {
    'campus-ground': '#EFE8DA',
    lawn: '#89B468',
    'sports-pitch': '#CC8A60',
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
    area1: '#C86D51',
    area2: '#D99B4E',
    area3: '#56949B',
    area4: '#4B7BB5',
    shared: '#F2EBDC',
    heritage: '#A85440',
    sports: '#6D9C7A',
    gate: '#6B2336',
    other: '#E9DFCE',
    surrounding: '#DFD8CC',
  } satisfies Record<BuildingCategory, string>,
  accents: {
    roofTrim: '#FAF6EE',
    copperPatina: '#638C82',
    glass: '#8EC5D6',
    sakura: '#F3AFC0',
    hankyuMaroon: '#6B2336',
    kandaiNavy: '#1B365D',
    routeMain: '#C85A3A',
    routeGentle: '#2B8A6E',
    routePulse: '#FFF8EB',
    highlight: '#FF9B42',
  },
  foliage: {
    trunk: '#785B46',
    canopies: ['#699E57', '#7BB063', '#56854B'],
    sakuraCanopy: '#F4B2C2',
  },
} as const;

