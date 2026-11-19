import { buildStubHero } from './shared';
import type { HeroBuilder } from './types';

/** イノベーション創生センター の専用モデル（製作前の仮の形。輪郭の押し出しだけ） */
export const buildInnovation: HeroBuilder = (ctx) => buildStubHero(ctx, '#D9D2C4', '#A8A39A');
