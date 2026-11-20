import { AREA43_ROOF_DECK_M } from './area4-3';

/**
 * 主役の形が屋上の面の高さを自分で決めている建物。屋上に置くグラウンド（GroundsBuilder の屋上のテニスコート）は、
 * データの建物の高さ（building.height）ではなく、ここの高さ（1 階の床＝重心の地面から、m）に置く。
 * enclosure が true の建物は、主役の形が屋上の囲いを作っているので、GroundsBuilder は網の柵を描かない
 */
export const HERO_ROOF_DECKS: Readonly<Record<string, { deckM: number; enclosure: boolean }>> = {
  'area4-3': { deckM: AREA43_ROOF_DECK_M, enclosure: true },
};
