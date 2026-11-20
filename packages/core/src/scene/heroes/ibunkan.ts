import * as THREE from 'three';
import { minGroundUnder } from './shared';
import type { HeroBuilder } from './types';

/**
 * 以文館（2003 年に南半分、2006 年に北側が完成。地上 4・地下 1）の専用モデル。
 *
 * 根拠にした資料（docs/visual-research/official-buildings.md・commons-buildings.md）と写真:
 * - Wikimedia Commons の Ibunkan.jpg（南の妻面と、その右＝南東の角の塔）・Ibunkan-2.JPG（塔の近景）・
 *   KansaiUV1.JPG（東の長い面と、右奥＝北東の角の塔）
 * - 国土地理院の空中写真（全国最新写真〈シームレス〉z18）: 八角の塔は 2 つ。どちらも東の面の端
 *   （北東の角と南東の角）にあり、外径はどちらも約 8m。主棟の屋根は上が平らで、周りに低い勾配の帯。
 *   東の帯には白い小箱が並ぶ。平らな面には設備の囲いが 2 か所
 * - 年史の「両端に八角形のドーム」と数・位置が合う
 *
 * 輪郭（OSM）はほぼ長方形（約 92m × 23.6m、南北から約 8° 傾く）なので、いちばん長い辺の向きで
 * ローカルの座標（s: 長手で南が正、t: 短手で東が正）を作り、その中で組む。
 */

/**
 * 壁はくすんだ茶のレンガ。Ibunkan.jpg の塔の日向が #9F7060、Ibunkan-2.JPG の塔が #906448〜#A07151 前後
 * （写真の中央値）なので、その間を取った。前の #B4623F は橙に寄りすぎていた
 */
const BRICK_HEX = '#98654F';
/** 紺のマンサード屋根（Ibunkan.jpg の屋根の帯の中央値 #343F60） */
const SLATE_HEX = '#3A4560';
const ROOF_TOP_HEX = '#7D766B';
const TRIM_HEX = '#E2DED6';
const DOME_HEX = '#2F4170';
const WINDOW_GLASS_HEX = '#4E5B66';
const DORMER_HEX = '#ECEAE4';
const EQUIPMENT_HEX = '#AFAEA6';
/** 塔の縦長窓のガラス。Ibunkan-2.JPG では空を映して明るい青灰（中央値 #597584） */
const TOWER_GLASS_HEX = '#62778A';
/**
 * 塔の縦長窓の枠（石張りの縁と、階ごとのガラスの間の板・上のアーチ）。Ibunkan-2.JPG で塔の笠木と同じ灰色の石
 * （日向で #A9A7A2 前後）。白（軒の見切りの色）にすると、塔に白い太い縦帯が立って見えた（2 回目のレビュー）
 */
const TOWER_STRIP_STONE_HEX = '#A8A59F';
const ANTENNA_HEX = '#D6D6D2';

/** 底を、輪郭の下（と塔の下）のいちばん低い地面からさらに下ろす深さ (m) */
const FOOTING_BELOW_LOWEST_GROUND_M = 0.5;

/**
 * 軒の高さ（重心の地面の表示上の高さから）。公式の地上 4 階と、KansaiUV1.JPG の東の面に窓が 4 段
 * 並ぶこと、Ibunkan.jpg の妻面で窓の段の間隔が約 3.3m・いちばん上の段の中心が軒から約 1.5m 下なので、
 * 4 段目の窓の下端（軒から約 12.2m）＋腰の高さで約 13.2m とした
 */
const EAVE_ABOVE_GROUND_M = 13.2;
/**
 * 屋根の帯（紺のマンサード）の高さと、各辺から平らな面までの水平の幅。
 * 空中写真で東の帯が約 3.5m、西が約 1.8m、南北が約 3m。高さは、同じ向きの撮影で見かけの帯の厚さと
 * 床の間隔の比が写真（Ibunkan.jpg で約 0.4、KansaiUV1.JPG で約 0.7）とそろう 1.5m にした
 * （1.8m では撮影で 0.54・0.8 と厚すぎた）
 */
const ROOF_RISE_M = 1.5;
const ROOF_INSET_EAST_M = 3.4;
const ROOF_INSET_WEST_M = 1.8;
const ROOF_INSET_END_M = 3.0;
/** 軒の白い見切り（Ibunkan.jpg・KansaiUV1.JPG で軒に白い線） */
const EAVE_FASCIA_HEIGHT_M = 0.35;
const EAVE_FASCIA_OVERHANG_M = 0.25;

/**
 * 東の面の窓。KansaiUV1.JPG で、レンガの壁に白い枠の窓が 1 つずつ独立して 4 段並ぶ（帯にはならない）。
 * 窓 1 つは幅約 1.2m・高さ約 1.6m、柱間は約 2.8m（床の高さ約 3.3m との比で読んだ）。
 * いちばん上の段の中心は軒から約 1.5m 下（Ibunkan.jpg の妻面で計測）
 */
const WINDOW_WIDTH_M = 1.2;
const WINDOW_HEIGHT_M = 1.6;
/**
 * 窓の白い枠の見付け。KansaiUV1.JPG の東の面で、枠は窓の幅の 1 割に満たない細い線（約 0.08m と読んだ。推定）。
 * 前の 0.18m は太かった（2 回目のレビュー）
 */
const WINDOW_FRAME_M = 0.08;
const WINDOW_BAY_M = 2.8;
const WINDOW_ROW_COUNT = 4;
const FLOOR_PITCH_M = 3.3;
const WINDOW_TOP_ROW_BELOW_EAVE_M = 1.5;
/**
 * 南の妻面の窓。Ibunkan.jpg で、妻面の中央に 2 列（t ≈ −1.7m と +1.3m）。
 * 西寄りの部分は無地のレンガ。北の妻面は写真が無いので窓を置かない
 */
const SOUTH_GABLE_WINDOW_T: readonly number[] = [-1.7, 1.3];

/**
 * 屋根窓（白い小箱）。KansaiUV1.JPG で、紺の屋根の帯の上端（平らな面との折れ目）に、窓 2 つ（約 5.6m）ごとに並び、
 * 屋根の線から上に頭が出る。大きさは窓の幅の 0.8〜0.9 倍（約 1.1m 角）。Ibunkan.jpg では南の妻面の
 * 屋根の両隅と中央にも見えるので、西の長辺と南の端にも置く
 */
const DORMER_SPACING_M = WINDOW_BAY_M * 2;
const DORMER_WIDTH_M = 1.2;
const DORMER_HEIGHT_M = 1.3;
const DORMER_DEPTH_M = 1.5;
/** 屋根の平らな面より上に出る高さ */
const DORMER_ABOVE_TOP_M = 0.6;

/**
 * 八角の塔。空中写真の外径約 8.3m（笠木の輪）。Ibunkan.jpg の妻面（約 35px/m に拡大して計測）で、
 * 笠木の下端は軒から約 2.5m（屋根の帯の上端より 1m ほど上）、笠木の帯は約 1.3m、ドームは直径約 4.5m・
 * 高さ約 1.8m、アンテナは約 3.9m。
 * 塔の胴は笠木とほぼ同じ太さ（Ibunkan-2.JPG）
 */
const TOWER_RADIUS_M = 4.0;
const TOWER_CORNICE_RADIUS_M = 4.2;
const TOWER_CORNICE_BOTTOM_ABOVE_EAVE_M = 2.6;
const TOWER_CORNICE_HEIGHT_M = 1.3;
const DOME_RADIUS_M = 2.25;
const DOME_HEIGHT_M = 1.9;
const ANTENNA_HEIGHT_M = 3.6;
/**
 * 塔の中心の位置。空中写真で、北の塔は北の端から約 1.5m、南の塔は南の端から約 2.5m 内側に中心があり、
 * 端の面から 2m ほど張り出す。東の側面は主棟の東の面とほぼそろう
 */
const TOWER_INSET_FROM_END_M = 1.9;
const TOWER_INSET_FROM_EAST_M = 3.5;
/**
 * 塔の各面の縦長窓の列。Ibunkan.jpg・Ibunkan-2.JPG で、灰色の石の縦枠の中に、明るい青灰のガラスが階ごとに
 * 区切られて縦に並び、上端に小さな半円のアーチ。上端は笠木の少し下、下は足元まで。
 * 幅は Ibunkan-2.JPG の正面の面（約 3.1m に 265px）で枠が約 70px・ガラスが約 45px なので、枠 0.8m・ガラス 0.52m
 * （前は 1.1m・0.6m で、枠の縁が太く見えた）
 */
const TOWER_STRIP_WIDTH_M = 0.8;
const TOWER_STRIP_GLASS_WIDTH_M = 0.52;
const TOWER_STRIP_TOP_BELOW_CORNICE_M = 0.5;
const TOWER_PANE_HEIGHT_M = 2.3;

/**
 * 平らな屋根の上の設備の囲い（空中写真で北半分と南半分に 1 つずつ、東寄り）。[s0, s1, t0, t1]
 */
const EQUIPMENT_AREAS: readonly [number, number, number, number][] = [
  [-21, -4, -2, 8],
  [12, 28, -3, 8],
];
const EQUIPMENT_HEIGHT_M = 0.4;

/**
 * 入口。OSM の道が建物に着く点（paths.json）: 東の面の階段 path_490797560 の上端 (-74.9, -52.9)。
 * 東の面の歩道 path_490801256 の端 (-77.3, -35.0) は戸ではなく、下の連絡通路の東の口。
 * （南の階段 path_490797561 の上端は南東の塔の足元に着くが、写真で戸が確かめられないので塔には置かない）
 */
const EAST_ENTRANCES_XZ: readonly [number, number][] = [[-74.9, -52.9]];
const DOOR_WIDTH_M = 2.4;
const DOOR_HEIGHT_M = 2.8;

/**
 * 連絡通路（建物を西＝関大前駅の側から東＝尚文館の側へ貫くアーチの通路）。
 * 位置は OSM の way 490801252（highway=footway・tunnel=yes・layer=-1）の両端で、持ち主のスクショの矢印とも合う。
 * 両側の道（paths.json の path_423060577・path_490801256）はこの 2 点で終わり、walk-graph.json でも
 * 2 点（n_4829911549・n_4829911548）が 23.9m の辺でつながっている。
 *
 * 形は持ち主の映像（2023-11-25、西から東へ歩いた 1 本と、東の口から両方向を撮った 1 本）から:
 * - 天井は浅い円弧のヴォールト（明るい灰色のコンクリート）に、細い暗い横の目地が数 m ごと
 * - 壁は下が白っぽいタイルの腰壁、その上がレンガで、レンガの帯に窓と黒い壁付けの灯具が交互に並ぶ。
 *   腰壁の上端と、レンガとヴォールトの境の明るい帯は水平で、床は東へ上る坂（西の端ほど腰壁が高い）
 * - 両方の口に、白い石張りの柱が内側へ張り出す（口は中より少し狭い）
 * 寸法はすべて推定（映像の中の比と、東の口の外を歩く人の背丈から）:
 * 東の口で床から迫り元まで約 3.0m・幅は中で約 10m（幅÷迫り元の高さ ≈ 3.3〜3.4）・ヴォールトの上がりは幅の 7% ほど、
 * レンガの帯は東の口で腰壁の約 1.2 倍。坂の高さは地形（両端の地面）に合わせる
 */
const PASSAGE_WEST_XZ: readonly [number, number] = [-101.11, -36.93];
const PASSAGE_EAST_XZ: readonly [number, number] = [-77.3, -34.96];
/** 中の幅（推定） */
const PASSAGE_WIDTH_M = 10.0;
/** 高い方（東）の床から迫り元（ヴォールトの付け根）まで（推定） */
const PASSAGE_SPRING_ABOVE_HIGH_FLOOR_M = 3.0;
/** ヴォールトの上がり（推定） */
const PASSAGE_VAULT_RISE_M = 0.7;
/** 迫り元から下のレンガの帯の高さ。その下が腰壁のタイル（推定） */
const PASSAGE_BRICK_BAND_M = 1.7;
/** 口の石張りの柱: 内側への張り出しと、通路の向きの厚み（推定） */
const PASSAGE_PIER_WIDTH_M = 1.0;
const PASSAGE_PIER_DEPTH_M = 1.2;
/** 壁の窓と灯具の間隔（窓 1 つと灯具 1 つで 1 区画。推定） */
const PASSAGE_BAY_M = 4.0;
const PASSAGE_WINDOW_WIDTH_M = 1.0;
/** 南の壁の西寄りにある戸（映像で、西を向いて左の壁の西の口の近く）。西の端からの距離（推定） */
const PASSAGE_DOOR_FROM_WEST_M = 4.5;
const PASSAGE_DOOR_WIDTH_M = 1.1;
/** 横の目地（暗い細い帯）の数 */
const PASSAGE_RIB_COUNT = 5;
/** 床の高さを地面から引く点の数（通路の向き） */
const PASSAGE_FLOOR_SAMPLES = 9;

/** 輪郭が使えないときの代わり（buildings.json の ibunkan） */
const FALLBACK_POLYGON: readonly [number, number][] = [
  [-105.52, -5.29],
  [-92.5, -96.3],
  [-69.15, -92.98],
  [-74.87, -52.93],
  [-79.84, -18.18],
  [-82.17, -1.97],
  [-86.88, -2.65],
];

interface AxisFrame {
  /** 長方形の中心 */
  cx: number;
  cz: number;
  /** 長手（南が正）の単位ベクトル */
  ux: number;
  uz: number;
  /** 短手（東が正）の単位ベクトル。(uz, -ux) */
  vx: number;
  vz: number;
  /** ローカルの +z を長手に、+x を短手に向ける Y 軸まわりの回転 */
  yaw: number;
  halfLength: number;
  halfWidth: number;
}

function usablePolygon(raw: readonly [number, number][]): readonly [number, number][] {
  const finite = raw.filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z));
  return finite.length >= 3 ? finite : FALLBACK_POLYGON;
}

/** いちばん長い辺の向きを長手にした、輪郭を囲む長方形の座標系 */
function frameFromPolygon(polygon: readonly [number, number][]): AxisFrame {
  let bestLen = 0;
  let ux = 0;
  let uz = 1;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len > bestLen) {
      bestLen = len;
      ux = dx / len;
      uz = dz / len;
    }
  }
  if (uz < 0) {
    ux = -ux;
    uz = -uz;
  }
  const vx = uz;
  const vz = -ux;
  let sMin = Infinity;
  let sMax = -Infinity;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const [x, z] of polygon) {
    const s = x * ux + z * uz;
    const t = x * vx + z * vz;
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }
  const sc = (sMin + sMax) / 2;
  const tc = (tMin + tMax) / 2;
  return {
    cx: sc * ux + tc * vx,
    cz: sc * uz + tc * vz,
    ux,
    uz,
    vx,
    vz,
    yaw: Math.atan2(ux, uz),
    halfLength: (sMax - sMin) / 2,
    halfWidth: (tMax - tMin) / 2,
  };
}

function toWorld(f: AxisFrame, s: number, t: number): [number, number] {
  return [f.cx + s * f.ux + t * f.vx, f.cz + s * f.uz + t * f.vz];
}

function toLocal(f: AxisFrame, x: number, z: number): [number, number] {
  const dx = x - f.cx;
  const dz = z - f.cz;
  return [dx * f.ux + dz * f.uz, dx * f.vx + dz * f.vz];
}

/** 四角形 1 枚（三角形 2 枚）を、外向きの目安 hint と法線がそろう巻き順で積む */
function pushQuad(
  out: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  hint: THREE.Vector3,
): void {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  const [p, q, r, s] = n.dot(hint) >= 0 ? [a, b, c, d] : [a, d, c, b];
  out.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  out.push(p.x, p.y, p.z, r.x, r.y, r.z, s.x, s.y, s.z);
}

/**
 * 寄棟の低い屋根の帯（ローカル座標。x が短手、z が長手、y=0 が軒）。
 * group 0 = 勾配の 4 面（スレート）、group 1 = 上の平らな面
 */
function createRoofGeometry(halfWidth: number, halfLength: number): THREE.BufferGeometry {
  const w0 = -halfWidth;
  const w1 = halfWidth;
  const l0 = -halfLength;
  const l1 = halfLength;
  const tw0 = w0 + ROOF_INSET_WEST_M;
  const tw1 = w1 - ROOF_INSET_EAST_M;
  const tl0 = l0 + ROOF_INSET_END_M;
  const tl1 = l1 - ROOF_INSET_END_M;
  const h = ROOF_RISE_M;
  const b0 = new THREE.Vector3(w0, 0, l0);
  const b1 = new THREE.Vector3(w1, 0, l0);
  const b2 = new THREE.Vector3(w1, 0, l1);
  const b3 = new THREE.Vector3(w0, 0, l1);
  const t0 = new THREE.Vector3(tw0, h, tl0);
  const t1 = new THREE.Vector3(tw1, h, tl0);
  const t2 = new THREE.Vector3(tw1, h, tl1);
  const t3 = new THREE.Vector3(tw0, h, tl1);
  const slopes: number[] = [];
  pushQuad(slopes, b0, b1, t1, t0, new THREE.Vector3(0, 1, -1));
  pushQuad(slopes, b1, b2, t2, t1, new THREE.Vector3(1, 1, 0));
  pushQuad(slopes, b2, b3, t3, t2, new THREE.Vector3(0, 1, 1));
  pushQuad(slopes, b3, b0, t0, t3, new THREE.Vector3(-1, 1, 0));
  const top: number[] = [];
  pushQuad(top, t0, t1, t2, t3, new THREE.Vector3(0, 1, 0));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...slopes, ...top], 3));
  geo.addGroup(0, slopes.length / 3, 0);
  geo.addGroup(slopes.length / 3, top.length / 3, 1);
  geo.computeVertexNormals();
  return geo;
}

function standard(hex: string, roughness: number, metalness = 0.02): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
}

/** 三角形を積むだけの入れ物（材質ごとに 1 つのジオメトリにまとめる） */
class TriangleSoup {
  readonly pos: number[] = [];

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hint: THREE.Vector3): void {
    pushQuad(this.pos, a, b, c, d, hint);
  }

  /** 軸にそろった箱（ローカルの x = t、z = s）。[x0, x1] × [y0, y1] × [z0, z1] */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
    this.quad(v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0), v(0, 0, -1));
    this.quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1), v(0, 0, 1));
    this.quad(v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0), v(-1, 0, 0));
    this.quad(v(x1, y0, z0), v(x1, y0, z1), v(x1, y1, z1), v(x1, y1, z0), v(1, 0, 0));
    this.quad(v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1), v(0, 1, 0));
    this.quad(v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1), v(0, -1, 0));
  }

  toGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.computeVertexNormals();
    return geo;
  }
}

interface PassagePlan {
  /** 通路の中心と両側の壁の s（ローカル） */
  sc: number;
  s0: number;
  s1: number;
  /** 床の高さ（t の昇順。両端は西と東の面） */
  floor: { t: number; y: number }[];
  minFloorY: number;
  springY: number;
  crownY: number;
  tileCapY: number;
}

/**
 * 連絡通路の寸法を決める。床は両端の地面を結ぶまっすぐな坂にし、途中で地形が床より高い所だけ持ち上げる
 * （地形の面が床から突き出さないように）。迫り元は高い方の床から一定の高さで水平
 */
function planPassage(sc: number, hw: number, groundAt: (s: number, t: number) => number): PassagePlan {
  const s0 = sc - PASSAGE_WIDTH_M / 2;
  const s1 = sc + PASSAGE_WIDTH_M / 2;
  const acrossS = [s0, (s0 + sc) / 2, sc, (sc + s1) / 2, s1];
  const highestGround = (t: number): number => Math.max(...acrossS.map((s) => groundAt(s, t)));
  const yWest = groundAt(sc, -hw - 0.5);
  const yEast = groundAt(sc, hw + 0.5);
  const floor: { t: number; y: number }[] = [];
  for (let i = 0; i < PASSAGE_FLOOR_SAMPLES; i++) {
    const f = i / (PASSAGE_FLOOR_SAMPLES - 1);
    const t = -hw + 2 * hw * f;
    const ramp = yWest + (yEast - yWest) * f;
    floor.push({ t, y: Math.max(ramp, highestGround(t) + 0.05) });
  }
  const ys = floor.map((p) => p.y);
  const springY = Math.max(...ys) + PASSAGE_SPRING_ABOVE_HIGH_FLOOR_M;
  return {
    sc,
    s0,
    s1,
    floor,
    minFloorY: Math.min(...ys),
    springY,
    crownY: springY + PASSAGE_VAULT_RISE_M,
    tileCapY: springY - PASSAGE_BRICK_BAND_M,
  };
}

function passageFloorAt(plan: PassagePlan, t: number): number {
  const pts = plan.floor;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return plan.minFloorY;
  if (t <= first.t) return first.y;
  if (t >= last.t) return last.y;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a && b && t >= a.t && t <= b.t) return a.y + ((b.y - a.y) * (t - a.t)) / (b.t - a.t);
  }
  return last.y;
}

/**
 * 連絡通路の中身（ローカルの座標で組む。x = t、z = s）。材質ごとに 1 つのジオメトリにまとめて返す。
 * - trim: 腰壁のタイル・腰壁の笠木・迫り元の明るい帯・口の石張りの柱
 * - brick: 両方の口の、ヴォールトの上の三角の壁（スパンドレル）
 * - vault: ヴォールトの下面
 * - floor: 床（坂）と、両方の口の外へ少し出した敷き
 * - dark: レンガの帯の窓・灯具・戸・ヴォールトの横の目地
 */
function buildPassageGeometries(
  plan: PassagePlan,
  hw: number,
): Record<'trim' | 'brick' | 'vault' | 'floor' | 'dark', THREE.BufferGeometry> {
  const { s0, s1, sc, springY, crownY, tileCapY } = plan;
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const trim = new TriangleSoup();
  const brick = new TriangleSoup();
  const vault = new TriangleSoup();
  const floor = new TriangleSoup();
  const dark = new TriangleSoup();
  const floorAt = (t: number): number => passageFloorAt(plan, t);

  // 床。両方の口の外へ 0.6m 出して、外の道と隙間ができないようにする
  const pts = plan.floor;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    floor.quad(v(a.t, a.y, s0), v(b.t, b.y, s0), v(b.t, b.y, s1), v(a.t, a.y, s1), v(0, 1, 0));
  }
  for (const [tFace, tOut] of [
    [-hw, -hw - 0.6],
    [hw, hw + 0.6],
  ] as const) {
    const y = floorAt(tFace);
    floor.quad(v(tFace, y, s0), v(tOut, y, s0), v(tOut, y, s1), v(tFace, y, s1), v(0, 1, 0));
    // 敷きの端から下へ垂らす縁（地面が少し低い所で、床の下が見えないように）
    floor.quad(v(tOut, y - 1.5, s0), v(tOut, y - 1.5, s1), v(tOut, y, s1), v(tOut, y, s0), v(Math.sign(tOut), 0, 0));
  }

  // 腰壁のタイル（両側の壁の手前 3cm）。上端は水平、下端は床に沿う
  for (const [z, nz] of [
    [s0 + 0.03, 1],
    [s1 - 0.03, -1],
  ] as const) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b || Math.max(a.y, b.y) >= tileCapY) continue;
      trim.quad(v(a.t, a.y - 0.05, z), v(b.t, b.y - 0.05, z), v(b.t, tileCapY, z), v(a.t, tileCapY, z), v(0, 0, nz));
    }
  }
  // 腰壁の笠木と、迫り元の明るい帯
  trim.box(-hw, hw, tileCapY, tileCapY + 0.12, s0, s0 + 0.16);
  trim.box(-hw, hw, tileCapY, tileCapY + 0.12, s1 - 0.16, s1);
  trim.box(-hw, hw, springY - 0.28, springY, s0, s0 + 0.12);
  trim.box(-hw, hw, springY - 0.28, springY, s1 - 0.12, s1);
  // 口の石張りの柱（両方の口の両側）
  for (const [t0, t1] of [
    [-hw, -hw + PASSAGE_PIER_DEPTH_M],
    [hw - PASSAGE_PIER_DEPTH_M, hw],
  ] as const) {
    const yBase = Math.min(floorAt(t0), floorAt(t1)) - 0.3;
    trim.box(t0, t1, yBase, springY, s0, s0 + PASSAGE_PIER_WIDTH_M);
    trim.box(t0, t1, yBase, springY, s1 - PASSAGE_PIER_WIDTH_M, s1);
  }

  // ヴォールト（円弧）。弦 = 幅、上がり = PASSAGE_VAULT_RISE_M
  const chord = s1 - s0;
  const rise = PASSAGE_VAULT_RISE_M;
  const radius = (chord * chord) / (8 * rise) + rise / 2;
  const centerY = crownY - radius;
  const half = Math.asin(chord / 2 / radius);
  const arcN = 16;
  const arc: { z: number; y: number }[] = [];
  for (let i = 0; i <= arcN; i++) {
    const ang = -half + (2 * half * i) / arcN;
    arc.push({ z: sc + radius * Math.sin(ang), y: centerY + radius * Math.cos(ang) });
  }
  for (let i = 0; i < arcN; i++) {
    const a = arc[i];
    const b = arc[i + 1];
    if (!a || !b) continue;
    const mid = v(0, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const toCenter = v(0, centerY - mid.y, sc - mid.z);
    vault.quad(v(-hw, a.y, a.z), v(hw, a.y, a.z), v(hw, b.y, b.z), v(-hw, b.y, b.z), toCenter);
    // 両方の口のスパンドレル（円弧の上から頂部の高さまで）
    for (const [x, nx] of [
      [-hw, -1],
      [hw, 1],
    ] as const) {
      brick.quad(v(x, a.y, a.z), v(x, b.y, b.z), v(x, crownY + 0.02, b.z), v(x, crownY + 0.02, a.z), v(nx, 0, 0));
    }
    // 横の目地（ヴォールトの面より 3cm 下の、幅 15cm の暗い帯）
    for (let k = 0; k < PASSAGE_RIB_COUNT; k++) {
      const t = -hw + ((k + 1) * 2 * hw) / (PASSAGE_RIB_COUNT + 1);
      const inset = (p: { z: number; y: number }): { z: number; y: number } => {
        const dz = sc - p.z;
        const dy = centerY - p.y;
        const len = Math.hypot(dz, dy) || 1;
        return { z: p.z + (dz / len) * 0.03, y: p.y + (dy / len) * 0.03 };
      };
      const ia = inset(a);
      const ib = inset(b);
      dark.quad(v(t - 0.075, ia.y, ia.z), v(t + 0.075, ia.y, ia.z), v(t + 0.075, ib.y, ib.z), v(t - 0.075, ib.y, ib.z), toCenter);
    }
  }

  // レンガの帯の窓と灯具（区画ごとに交互）。両側の壁
  const bandLow = tileCapY + 0.12;
  const usable = 2 * (hw - PASSAGE_PIER_DEPTH_M);
  const bayCount = Math.max(1, Math.floor(usable / PASSAGE_BAY_M));
  const bayStart = -((bayCount - 1) * PASSAGE_BAY_M) / 2;
  const windowH = Math.max(0.6, Math.min(1.3, springY - 0.28 - bandLow - 0.3));
  const windowY = (bandLow + springY - 0.28) / 2;
  for (const [zWall, dir] of [
    [s0, 1],
    [s1, -1],
  ] as const) {
    for (let i = 0; i < bayCount; i++) {
      const t = bayStart + i * PASSAGE_BAY_M;
      const zIn = zWall + dir * 0.05;
      dark.box(
        t - PASSAGE_WINDOW_WIDTH_M / 2,
        t + PASSAGE_WINDOW_WIDTH_M / 2,
        windowY - windowH / 2,
        windowY + windowH / 2,
        Math.min(zWall, zIn),
        Math.max(zWall, zIn),
      );
      // 灯具は窓と窓の間（区画の境）、腰壁の笠木の少し上
      const tl = t + PASSAGE_BAY_M / 2;
      if (tl < hw - PASSAGE_PIER_DEPTH_M - 0.5) {
        const zOut = zWall + dir * 0.24;
        dark.box(tl - 0.14, tl + 0.14, bandLow + 0.45, bandLow + 1.0, Math.min(zWall, zOut), Math.max(zWall, zOut));
      }
    }
  }
  // 南の壁の西寄りの戸（上端は腰壁の笠木）
  const tDoor = -hw + PASSAGE_DOOR_FROM_WEST_M;
  const yDoor = floorAt(tDoor);
  if (tileCapY - yDoor > 1.8) {
    dark.box(tDoor - PASSAGE_DOOR_WIDTH_M / 2, tDoor + PASSAGE_DOOR_WIDTH_M / 2, yDoor, tileCapY, s1 - 0.08, s1 - 0.02);
  }

  return {
    trim: trim.toGeometry(),
    brick: brick.toGeometry(),
    vault: vault.toGeometry(),
    floor: floor.toGeometry(),
    dark: dark.toGeometry(),
  };
}

export const buildIbunkan: HeroBuilder = (ctx) => {
  const polygon = usablePolygon(ctx.building.polygon);
  const frame = frameFromPolygon(polygon);
  const hw = frame.halfWidth;
  const hl = frame.halfLength;
  const groundAt = (s: number, t: number): number => {
    const [x, z] = toWorld(frame, s, t);
    return ctx.sampleGroundVisualY(x, z);
  };

  const group = new THREE.Group();
  /** ローカルの座標の入れ物（x = t 東、z = s 南、y はワールドのまま） */
  const local = new THREE.Group();
  local.position.set(frame.cx, 0, frame.cz);
  local.rotation.y = frame.yaw;
  group.add(local);

  const brickMat = standard(BRICK_HEX, 0.84);
  const slateMat = standard(SLATE_HEX, 0.7, 0.05);
  const roofTopMat = standard(ROOF_TOP_HEX, 0.9);
  const trimMat = standard(TRIM_HEX, 0.7);
  const domeMat = standard(DOME_HEX, 0.5, 0.1);
  const windowGlassMat = standard(WINDOW_GLASS_HEX, 0.5, 0.05);
  const dormerMat = standard(DORMER_HEX, 0.75);
  const equipmentMat = standard(EQUIPMENT_HEX, 0.85);
  const towerGlassMat = standard(TOWER_GLASS_HEX, 0.45, 0.05);
  // 塔の縦枠とアーチだけの材質（どちらもインスタンスなので、材質を分けても描画命令は増えない）
  const towerStoneMat = standard(TOWER_STRIP_STONE_HEX, 0.8);
  const antennaMat = standard(ANTENNA_HEX, 0.5, 0.3);

  // 軒の高さの基準は、重心の地面と東の面の中ほどの地面の高い方。KansaiUV1.JPG で東の面に窓が 4 段見えるので、
  // 地形の強調で東の面の地面が上がっても、いちばん下の段が埋まらないようにする
  const eaveY = Math.max(ctx.groundVisualY, groundAt(0, hw)) + EAVE_ABOVE_GROUND_M;
  const outlineBottom = minGroundUnder(ctx, polygon) - FOOTING_BELOW_LOWEST_GROUND_M;

  // 塔の中心（ローカル）。北東・南東の角
  const towerT = hw - TOWER_INSET_FROM_EAST_M;
  const towers: { s: number; t: number }[] = [
    { s: -hl + TOWER_INSET_FROM_END_M, t: towerT },
    { s: hl - TOWER_INSET_FROM_END_M, t: towerT },
  ];
  // 塔は輪郭から張り出すので、塔の周りの地面も引いて底を決める
  let bottom = outlineBottom;
  for (const tw of towers) {
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const g = groundAt(
        tw.s + Math.cos(ang) * TOWER_CORNICE_RADIUS_M,
        tw.t + Math.sin(ang) * TOWER_CORNICE_RADIUS_M,
      );
      bottom = Math.min(bottom, g - FOOTING_BELOW_LOWEST_GROUND_M);
    }
  }

  // 連絡通路の位置（ローカル）。通路は短手（t）に沿わせ、中心の s は OSM の両端の平均
  const passageS = (toLocal(frame, ...PASSAGE_WEST_XZ)[0] + toLocal(frame, ...PASSAGE_EAST_XZ)[0]) / 2;
  const passage = planPassage(passageS, hw, groundAt);

  // 主棟（レンガの箱）。通路の所だけ、通路の北・南・上・下（床の下）の 4 つの箱に分ける
  const addBodyBox = (s0: number, s1: number, y0: number, y1: number): void => {
    if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
    const box = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, y1 - y0, s1 - s0), brickMat);
    box.name = 'ibunkan-body';
    box.position.set(0, (y0 + y1) / 2, (s0 + s1) / 2);
    box.castShadow = true;
    box.receiveShadow = true;
    local.add(box);
  };
  addBodyBox(-hl, passage.s0, bottom, eaveY);
  addBodyBox(passage.s1, hl, bottom, eaveY);
  addBodyBox(passage.s0, passage.s1, passage.crownY, eaveY);
  addBodyBox(passage.s0, passage.s1, bottom, passage.minFloorY - 0.3);

  // 連絡通路の中身。描画命令を増やさないよう、建物の既存の材質に割り当てる（建物ごとに材質でまとめられる）:
  // 腰壁のタイル・石張りの柱・ヴォールトは白い見切りと同じ材質（ヴォールトは下向きの面なので暗く写る）、
  // 床は屋根の平らな面と同じ灰色、窓・灯具・目地は紺のスレートと同じ暗い色
  const passageGeos = buildPassageGeometries(passage, hw);
  const passageParts: [THREE.BufferGeometry, THREE.MeshStandardMaterial, string][] = [
    [passageGeos.trim, trimMat, 'ibunkan-passage-trim'],
    [passageGeos.vault, trimMat, 'ibunkan-passage-vault'],
    [passageGeos.brick, brickMat, 'ibunkan-passage-spandrel'],
    [passageGeos.floor, roofTopMat, 'ibunkan-passage-floor'],
    [passageGeos.dark, slateMat, 'ibunkan-passage-fixtures'],
  ];
  for (const [geo, mat, name] of passageParts) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    // 影の設定を建物の他の部品（主棟・屋根・塔の笠木）とそろえて、同じ材質どうしでまとまるようにする
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    local.add(mesh);
  }

  // 軒の白い見切り
  const fascia = new THREE.Mesh(
    new THREE.BoxGeometry(
      hw * 2 + EAVE_FASCIA_OVERHANG_M * 2,
      EAVE_FASCIA_HEIGHT_M,
      hl * 2 + EAVE_FASCIA_OVERHANG_M * 2,
    ),
    trimMat,
  );
  fascia.position.set(0, eaveY + EAVE_FASCIA_HEIGHT_M / 2 - 0.05, 0);
  local.add(fascia);

  // 紺のマンサードの屋根の帯と、上の平らな面
  const roof = new THREE.Mesh(createRoofGeometry(hw, hl), [slateMat, roofTopMat]);
  roof.position.y = eaveY + EAVE_FASCIA_HEIGHT_M - 0.05;
  roof.castShadow = true;
  roof.receiveShadow = true;
  local.add(roof);
  const roofTopY = roof.position.y + ROOF_RISE_M;

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  // 東の面の窓の柱間（両端の塔の幅を外す）
  const windowSpanHalf = hl - TOWER_INSET_FROM_END_M - TOWER_RADIUS_M - 1.0;
  const bayCount = Math.max(1, Math.floor((windowSpanHalf * 2) / WINDOW_BAY_M));
  const bayStart = -((bayCount - 1) * WINDOW_BAY_M) / 2;

  // 屋根窓（白い小箱）。帯の上端（平らな面との折れ目）にまたがって置き、屋根の線から頭を出す
  const dormerPlacements: { s: number; t: number; alongS: boolean }[] = [];
  const dormerCount = Math.max(1, Math.floor((bayCount - 1) / 2) + 1);
  const dormerStart = -((dormerCount - 1) * DORMER_SPACING_M) / 2;
  for (const lineT of [hw - ROOF_INSET_EAST_M, -hw + ROOF_INSET_WEST_M]) {
    for (let i = 0; i < dormerCount; i++) {
      dormerPlacements.push({ s: dormerStart + i * DORMER_SPACING_M, t: lineT, alongS: true });
    }
  }
  dormerPlacements.push({ s: hl - ROOF_INSET_END_M, t: 0, alongS: false });
  const dormers = new THREE.InstancedMesh(unitBox, dormerMat, dormerPlacements.length);
  const dormerCenterY = roofTopY + DORMER_ABOVE_TOP_M - DORMER_HEIGHT_M / 2;
  dormerPlacements.forEach((d, i) => {
    pos.set(d.t, dormerCenterY, d.s);
    if (d.alongS) scl.set(DORMER_DEPTH_M, DORMER_HEIGHT_M, DORMER_WIDTH_M);
    else scl.set(DORMER_WIDTH_M, DORMER_HEIGHT_M, DORMER_DEPTH_M);
    dormers.setMatrixAt(i, m.compose(pos, q.identity(), scl));
  });
  dormers.instanceMatrix.needsUpdate = true;
  dormers.castShadow = true;
  local.add(dormers);

  // 平らな面の上の設備の囲い
  const equipment = new THREE.InstancedMesh(unitBox, equipmentMat, EQUIPMENT_AREAS.length);
  EQUIPMENT_AREAS.forEach(([s0, s1, t0, t1], i) => {
    const tMax = hw - ROOF_INSET_EAST_M - DORMER_DEPTH_M / 2 - 0.3;
    const tMin = -hw + ROOF_INSET_WEST_M + DORMER_DEPTH_M / 2 + 0.3;
    const a = Math.max(t0, tMin);
    const b = Math.min(t1, tMax);
    pos.set((a + b) / 2, roofTopY + EQUIPMENT_HEIGHT_M / 2 - 0.05, (s0 + s1) / 2);
    scl.set(Math.max(0.5, b - a), EQUIPMENT_HEIGHT_M, s1 - s0);
    equipment.setMatrixAt(i, m.compose(pos, q.identity(), scl));
  });
  equipment.instanceMatrix.needsUpdate = true;
  local.add(equipment);

  // 入口（OSM の道が建物に着く点）。東の面に 1 つ。窓と同じ白い枠のガラス戸にする
  const doorS = EAST_ENTRANCES_XZ.map(([x, z]) => {
    const [s] = toLocal(frame, x, z);
    return Math.max(-hl + 2, Math.min(hl - 2, s));
  });

  // 独立した窓（白い枠＋ガラス）。東の面は柱間ごと、南の妻面は中央の 2 列。
  // 地面より下に沈む窓と、入口・連絡通路の口に重なる窓は置かない
  const windows: { s: number; t: number; y: number; w: number; h: number; face: 'east' | 'south' }[] = [];
  const keepWindow = (s: number, t: number, y: number): boolean =>
    y - WINDOW_HEIGHT_M / 2 - WINDOW_FRAME_M > groundAt(s, t) + 0.4;
  for (let row = 0; row < WINDOW_ROW_COUNT; row++) {
    const y = eaveY - WINDOW_TOP_ROW_BELOW_EAVE_M - row * FLOOR_PITCH_M;
    for (let i = 0; i < bayCount; i++) {
      const s = bayStart + i * WINDOW_BAY_M;
      const nearDoor = doorS.some((ds) => Math.abs(ds - s) < (DOOR_WIDTH_M + WINDOW_WIDTH_M) / 2 + 0.3);
      if (nearDoor && y - WINDOW_HEIGHT_M / 2 < groundAt(s, hw) + DOOR_HEIGHT_M + 0.3) continue;
      const overPassage =
        Math.abs(s - passage.sc) < (PASSAGE_WIDTH_M + WINDOW_WIDTH_M) / 2 + WINDOW_FRAME_M + 0.3;
      if (overPassage && y - WINDOW_HEIGHT_M / 2 - WINDOW_FRAME_M < passage.crownY + 0.3) continue;
      if (keepWindow(s, hw, y)) {
        windows.push({ s, t: hw, y, w: WINDOW_WIDTH_M, h: WINDOW_HEIGHT_M, face: 'east' });
      }
    }
    for (const t of SOUTH_GABLE_WINDOW_T) {
      if (keepWindow(hl, t, y)) {
        windows.push({ s: hl, t, y, w: WINDOW_WIDTH_M, h: WINDOW_HEIGHT_M, face: 'south' });
      }
    }
  }
  for (const s of doorS) {
    const gy = groundAt(s, hw);
    windows.push({ s, t: hw, y: gy - 0.3 + DOOR_HEIGHT_M / 2, w: DOOR_WIDTH_M, h: DOOR_HEIGHT_M, face: 'east' });
  }
  const windowFrames = new THREE.InstancedMesh(unitBox, trimMat, Math.max(1, windows.length));
  const windowGlass = new THREE.InstancedMesh(unitBox, windowGlassMat, Math.max(1, windows.length));
  windows.forEach((w, i) => {
    const frameW = w.w + WINDOW_FRAME_M * 2;
    const frameH = w.h + WINDOW_FRAME_M * 2;
    if (w.face === 'east') {
      pos.set(w.t + 0.05, w.y, w.s);
      scl.set(0.1, frameH, frameW);
      windowFrames.setMatrixAt(i, m.compose(pos, q.identity(), scl));
      pos.set(w.t + 0.09, w.y, w.s);
      scl.set(0.1, w.h, w.w);
      windowGlass.setMatrixAt(i, m.compose(pos, q.identity(), scl));
    } else {
      pos.set(w.t, w.y, w.s + 0.05);
      scl.set(frameW, frameH, 0.1);
      windowFrames.setMatrixAt(i, m.compose(pos, q.identity(), scl));
      pos.set(w.t, w.y, w.s + 0.09);
      scl.set(w.w, w.h, 0.1);
      windowGlass.setMatrixAt(i, m.compose(pos, q.identity(), scl));
    }
  });
  windowFrames.count = windows.length;
  windowGlass.count = windows.length;
  windowFrames.instanceMatrix.needsUpdate = true;
  windowGlass.instanceMatrix.needsUpdate = true;
  local.add(windowFrames, windowGlass);

  // 八角の塔（2 つ）。平らな面を長手・短手に向けるため 22.5° 回す
  const octagonTurn = Math.PI / 8;
  const corniceBottomY = eaveY + TOWER_CORNICE_BOTTOM_ABOVE_EAVE_M;
  const corniceTopY = corniceBottomY + TOWER_CORNICE_HEIGHT_M;
  const stripTopY = corniceBottomY - TOWER_STRIP_TOP_BELOW_CORNICE_M;
  const flatRadius = TOWER_RADIUS_M * Math.cos(Math.PI / 8);
  // 縦枠（灰色の石）は各面に 1 本ずつ。ガラスは階ごとに区切る（上から、床の高さの間隔で）
  const stripFrames = new THREE.InstancedMesh(unitBox, towerStoneMat, towers.length * 8);
  const paneSlots: number[] = [];
  for (let y = stripTopY - 0.3 - TOWER_PANE_HEIGHT_M / 2; y > bottom; y -= FLOOR_PITCH_M) paneSlots.push(y);
  const stripGlass = new THREE.InstancedMesh(
    unitBox,
    towerGlassMat,
    Math.max(1, towers.length * 8 * paneSlots.length),
  );
  // 縦枠の上の半円のアーチ（灰色の石）。円柱を倒して上半分だけ使う
  const archGeo = new THREE.CylinderGeometry(
    TOWER_STRIP_WIDTH_M / 2,
    TOWER_STRIP_WIDTH_M / 2,
    0.12,
    12,
    1,
    false,
    Math.PI / 2,
    Math.PI,
  );
  archGeo.rotateX(Math.PI / 2);
  const arches = new THREE.InstancedMesh(archGeo, towerStoneMat, towers.length * 8);
  const yAxis = new THREE.Vector3(0, 1, 0);
  let si = 0;
  let pi = 0;
  for (const tw of towers) {
    const shaftHeight = corniceBottomY - bottom;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(TOWER_RADIUS_M, TOWER_RADIUS_M, shaftHeight, 8),
      brickMat,
    );
    shaft.rotation.y = octagonTurn;
    shaft.position.set(tw.t, bottom + shaftHeight / 2, tw.s);
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    local.add(shaft);

    const cornice = new THREE.Mesh(
      new THREE.CylinderGeometry(
        TOWER_CORNICE_RADIUS_M,
        TOWER_CORNICE_RADIUS_M,
        TOWER_CORNICE_HEIGHT_M,
        8,
      ),
      trimMat,
    );
    cornice.rotation.y = octagonTurn;
    cornice.position.set(tw.t, corniceBottomY + TOWER_CORNICE_HEIGHT_M / 2, tw.s);
    cornice.castShadow = true;
    cornice.receiveShadow = true;
    local.add(cornice);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      domeMat,
    );
    dome.scale.set(DOME_RADIUS_M, DOME_HEIGHT_M, DOME_RADIUS_M);
    dome.position.set(tw.t, corniceTopY - 0.1, tw.s);
    dome.castShadow = true;
    local.add(dome);

    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, ANTENNA_HEIGHT_M, 6),
      antennaMat,
    );
    antenna.position.set(
      tw.t,
      corniceTopY - 0.1 + DOME_HEIGHT_M + ANTENNA_HEIGHT_M / 2 - 0.1,
      tw.s,
    );
    local.add(antenna);

    for (let k = 0; k < 8; k++) {
      const phi = (k / 8) * Math.PI * 2;
      const nx = Math.sin(phi);
      const nz = Math.cos(phi);
      // この面の足元の地面（縦枠とガラスはここまで）
      const faceGround = groundAt(tw.s + nz * flatRadius, tw.t + nx * flatRadius);
      const stripBottomY = Math.max(bottom, faceGround - 0.3);
      const stripHeight = stripTopY - stripBottomY;
      q.setFromAxisAngle(yAxis, phi);
      pos.set(
        tw.t + nx * (flatRadius + 0.06),
        stripBottomY + stripHeight / 2,
        tw.s + nz * (flatRadius + 0.06),
      );
      scl.set(TOWER_STRIP_WIDTH_M, stripHeight, 0.12);
      stripFrames.setMatrixAt(si, m.compose(pos, q, scl));
      pos.set(tw.t + nx * (flatRadius + 0.06), stripTopY, tw.s + nz * (flatRadius + 0.06));
      scl.set(1, 1, 1);
      arches.setMatrixAt(si, m.compose(pos, q, scl));
      si++;
      for (const cy of paneSlots) {
        const y0 = Math.max(cy - TOWER_PANE_HEIGHT_M / 2, faceGround + 0.3);
        const y1 = cy + TOWER_PANE_HEIGHT_M / 2;
        if (y1 - y0 < 0.8) continue;
        pos.set(
          tw.t + nx * (flatRadius + 0.1),
          (y0 + y1) / 2,
          tw.s + nz * (flatRadius + 0.1),
        );
        scl.set(TOWER_STRIP_GLASS_WIDTH_M, y1 - y0, 0.1);
        stripGlass.setMatrixAt(pi++, m.compose(pos, q, scl));
      }
    }
  }
  stripGlass.count = pi;
  stripFrames.instanceMatrix.needsUpdate = true;
  stripGlass.instanceMatrix.needsUpdate = true;
  arches.instanceMatrix.needsUpdate = true;
  local.add(stripFrames, stripGlass, arches);

  return {
    group,
    primaryMaterials: [
      { mat: brickMat, baseHex: BRICK_HEX },
      { mat: slateMat, baseHex: SLATE_HEX },
      { mat: domeMat, baseHex: DOME_HEX },
    ],
    animated: [],
  };
};
