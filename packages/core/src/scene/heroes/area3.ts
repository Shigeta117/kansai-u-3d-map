import { buildStubHero } from './shared';
import type { HeroBuilder } from './types';

/** 第3学舎（塔と雁行する棟） の専用モデル（製作前の仮の形。輪郭の押し出しだけ） */
export const buildArea3: HeroBuilder = (ctx) => buildStubHero(ctx, '#D9D2C4', '#A8A39A');
