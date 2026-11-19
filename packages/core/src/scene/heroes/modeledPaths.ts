/**
 * 主役の建物の専用モデルが自分で形を作っている OSM の道（階段など）。
 * 地面に道の帯を描くと、モデルの階段の上に帯が重なって見えるので、帯は描かない。
 * 経路の計算（walk-graph）には今までどおり使う。
 */
export const HERO_MODELED_PATH_IDS: ReadonlySet<string> = new Set([
  'path_490803027', // 凜風館の正面の大階段（Y 字路へ下りる）
  'path_423060514', // 総合図書館の正面の大階段
]);
