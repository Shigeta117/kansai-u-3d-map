import { buildArea3 } from './area3';
import { buildArea43 } from './area4-3';
import { buildCentenary } from './centenary';
import { buildCentralGym } from './centralGym';
import { buildEnshinkan } from './enshinkan';
import { buildIbunkan } from './ibunkan';
import { buildInnovation } from './innovation';
import { buildKanbunkan } from './kanbunkan';
import { buildLibrary } from './library';
import { buildMainGate } from './mainGate';
import { buildRimpukan } from './rimpukan';
import { buildSymphonyHall } from './symphonyHall';
import { buildTakamatsuzuka } from './takamatsuzuka';
import type { HeroBuilder } from './types';

export type { HeroBuildContext, HeroBuildResult, HeroBuilder } from './types';

/**
 * 建物の id → 専用の形を組む関数。ここに載った建物は、OSM の輪郭の押し出しと
 * LandmarkSculptor の飾りの代わりに、専用の形で描かれる（写真で確かめた主役の建物だけ）。
 */
export const HERO_BUILDERS: Readonly<Record<string, HeroBuilder>> = {
  area3: buildArea3,
  'area4-3': buildArea43,
  centenary: buildCentenary,
  'central-gym': buildCentralGym,
  enshinkan: buildEnshinkan,
  ibunkan: buildIbunkan,
  innovation: buildInnovation,
  kanbunkan: buildKanbunkan,
  library: buildLibrary,
  'main-gate': buildMainGate,
  rimpukan: buildRimpukan,
  'seishikan-4': buildSymphonyHall,
  // 高松塚古墳壁画再現展示室（目印ではなく、輪郭の名前の上書きで名前を付けた OSM の輪郭なので id は way の番号）
  way_819790896: buildTakamatsuzuka,
};
