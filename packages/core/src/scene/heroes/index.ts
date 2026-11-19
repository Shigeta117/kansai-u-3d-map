import { buildLibrary } from './library';
import { buildMainGate } from './mainGate';
import { buildRimpukan } from './rimpukan';
import type { HeroBuilder } from './types';

export type { HeroBuildContext, HeroBuildResult, HeroBuilder } from './types';

/**
 * 建物の id → 専用の形を組む関数。ここに載った建物は、OSM の輪郭の押し出しと
 * LandmarkSculptor の飾りの代わりに、専用の形で描かれる（写真で確かめた主役の建物だけ）。
 */
export const HERO_BUILDERS: Readonly<Record<string, HeroBuilder>> = {
  library: buildLibrary,
  'main-gate': buildMainGate,
  rimpukan: buildRimpukan,
};
