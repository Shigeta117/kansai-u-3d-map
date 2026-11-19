import { buildArea3 } from './area3';
import { buildCentenary } from './centenary';
import { buildEnshinkan } from './enshinkan';
import { buildIbunkan } from './ibunkan';
import { buildInnovation } from './innovation';
import { buildKanbunkan } from './kanbunkan';
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
  area3: buildArea3,
  centenary: buildCentenary,
  enshinkan: buildEnshinkan,
  ibunkan: buildIbunkan,
  innovation: buildInnovation,
  kanbunkan: buildKanbunkan,
  library: buildLibrary,
  'main-gate': buildMainGate,
  rimpukan: buildRimpukan,
};
