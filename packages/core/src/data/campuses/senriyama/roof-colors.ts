/**
 * 国土地理院の空中写真（地理院タイル 全国最新写真〈シームレス〉、2017 年 4 月の簡易空中写真）から読み取った
 * キャンパスの建物の屋根の色。写真の色は彩度を 6 割に落とし、明るさを 0.42〜0.82 に収めてある
 * （ポップな地図の中で浮かないように）。確度が中以上の物だけ。
 * 出典の表記: 出典：国土地理院 地理院タイル（全国最新写真〈シームレス〉）を加工して作成
 * 読み取りの記録: docs/visual-research/aerial.md（2026-11-20）
 */
export const SENRIYAMA_AERIAL_ROOF_HEX: Readonly<Record<string, string>> = {
  'area3': '#CAC8C1', // 写真 #cdcabe（flat、確度 medium）
  'rimpukan': '#78726E', // 写真 #7c726a（flat、確度 medium）
  'area2-1': '#999996', // 写真 #9a9a95（flat、確度 high）
  'way_423067212': '#DADAC8', // 写真 #eeeedd（flat、確度 high）
  'keisho-kenkyu': '#696D6D', // 写真 #5d6262（flat、確度 medium）
  'area2-3': '#D9D7C9', // 写真 #e8e5d5（flat、確度 high）
  'area2-2': '#B1B0AA', // 写真 #b4b1a7（flat、確度 medium）
  'area2-bighall': '#D1CFC9', // 写真 #d4d0c6（flat、確度 high）
  'way_423067217': '#D0CEC7', // 写真 #d3cfc4（flat、確度 high）
  'area4-1': '#929595', // 写真 #919696（flat、確度 high）
  'area4-2': '#D7D4CB', // 写真 #dfdbce（flat、確度 high）
  'ibunkan': '#837E78', // 写真 #877e74（flat、確度 high）
  'iwasaki': '#BEC0BE', // 写真 #bec1bd（flat、確度 medium）
  'area1-1': '#8B8883', // 写真 #8d8881（flat、確度 medium）
  'area1-4': '#696D6C', // 写真 #4a4f4d（flat、確度 high）
  'area1-2': '#DAD7C8', // 写真 #e8e5d3（flat、確度 high）
  'hobunken': '#DBDAC8', // 写真 #edecda（flat、確度 high）
  'shobunkan': '#CBCAC5', // 写真 #cdcbc3（other、確度 high）
  'library': '#6E6C68', // 写真 #62605a（flat、確度 high）
  'enshinkan': '#B4B1AD', // 写真 #b6b1ab（flat、確度 high）
  'area4-3': '#68756C', // 写真 #637a6a（flat、確度 medium）
  'shinkandaikaikan-n': '#686E6A', // 写真 #474d49（flat、確度 high）
  'shinkandaikaikan-s': '#6B6D69', // 写真 #555752（flat、確度 medium）
  'kanbunkan': '#859382', // 写真 #82997c（other、確度 high）
  'way_423067245': '#D7D5CB', // 写真 #e2dfd1（flat、確度 high）
  'way_423067247': '#B5B2AD', // 写真 #b7b3ab（flat、確度 medium）
  'way_423067248': '#D7D5CB', // 写真 #e2dfd2（flat、確度 high）
  'way_423067249': '#D8D7CA', // 写真 #e7e6d6（flat、確度 high）
  'way_423067250': '#CED2CD', // 写真 #cdd3cc（flat、確度 high）
  'way_423067251': '#6E6B68', // 写真 #6c6863（flat、確度 medium）
  'way_423067252': '#71716D', // 写真 #73726b（flat、確度 medium）
  'hitech-core': '#74726E', // 写真 #76726c（flat、確度 medium）
  'way_423067254': '#8D857D', // 写真 #928578（flat、確度 high）
  'innovation': '#DDDDC5', // 写真 #f2f2de（flat、確度 high）
  'way_423067257': '#A2A19E', // 写真 #a3a19d（flat、確度 medium）
  'way_423067258': '#8F8C87', // 写真 #928c84（flat、確度 medium）
  'kandaikaikan': '#827672', // 写真 #88736c（flat、確度 high）
  'way_423067260': '#D6D7CB', // 写真 #e6e7d9（flat、確度 high）
  'centenary': '#91A19D', // 写真 #8ca69f（other、確度 medium）
  'kojima': '#6E6B68', // 写真 #6c6762（flat、確度 high）
  'way_602359988': '#C9CCCA', // 写真 #c8cdc9（flat、確度 medium）
  'way_624589988': '#CFD4CC', // 写真 #cfd6ca（flat、確度 medium）
  'way_624589992': '#DAD8C8', // 写真 #ebe9d8（flat、確度 medium）
  'way_624589994': '#D9D4C9', // 写真 #e5dfd0（flat、確度 medium）
  'way_624589997': '#DBDAC7', // 写真 #efeedc（flat、確度 medium）
  'way_624590000': '#6A6D6B', // 写真 #515553（flat、確度 medium）
  'way_624663824': '#E3DDBF', // 写真 #f7f2d8（flat、確度 medium）
  'area1-5': '#83807B', // 写真 #868178（flat、確度 medium）
  'way_624663827': '#D5D3CD', // 写真 #d8d5ca（flat、確度 medium）
  'way_624663829': '#AFAEAB', // 写真 #b0afaa（flat、確度 medium）
  'area4-4': '#DEDAC4', // 写真 #f0ecd5（flat、確度 high）
  'way_624663832': '#67706B', // 写真 #3c4540（flat、確度 medium）
  'way_805366951': '#636B73', // 写真 #5b6876（other、確度 medium）
  'way_1421260136': '#696D6B', // 写真 #474c49（flat、確度 medium）
  'way_1421265055': '#C6C2B6', // 写真 #ccc4b0（flat、確度 medium）
  'way_1421267647': '#ACB3B1', // 写真 #aab5b2（flat、確度 medium）
  'way_1421267648': '#A3ABAB', // 写真 #a0aeae（flat、確度 medium）
  'way_1421442035': '#6B6D6C', // 写真 #6a6e6c（flat、確度 medium）
  'way_1421442038': '#ADA8A3', // 写真 #b0a8a0（flat、確度 medium）
  'way_1421442039': '#777776', // 写真 #777875（flat、確度 medium）
  'way_1421442040': '#667170', // 写真 #353f3e（flat、確度 medium）
};
