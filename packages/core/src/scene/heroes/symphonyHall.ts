import * as THREE from 'three';
import {
  TriBucket,
  addBucketMesh,
  createLocalGroup,
  frameToWorld,
  makeFrame,
  pushBox,
  pushWallStrip,
} from './localFrame';
import { minGroundUnder } from './shared';
import type { HeroBuilder } from './types';

/**
 * KUシンフォニーホール（誠之館4号館、旧特別講堂。1962 年、2006 年に改修）の専用モデル。
 * 調べた事と出典は docs/visual-research/symphony-hall.md。
 *
 * 根拠にしたもの:
 * - AR KANDAI（関西大学 なにわ大阪研究センター）の村野藤吾の建築の地図: 小山に荒々しく建物を挿入したような配置。
 *   打放しの粗野な意匠だったが 2006 年に改修。側面の調光室の凸部の意匠がポイント
 * - 持ち主の 2023 年の映像（凜風館の裏の大階段 IMG_6413・6414）: 道から南東へ上る茶色のタイルの幅広い大階段。
 *   中ほどに花壇の箱が段々に並び、階段は左右 2 列に分かれる。ホールの側は斜めに上るベージュの手すり壁と、
 *   その奥のツタの土手（小山）。土手の上にベージュの平らな壁（小さな窓）が建ち、上端に厚い庇が深く張り出す
 *   （IMG_6413_004 の左上）。反対の側は凜風館の茶色の縦縞の壁
 * - 持ち主の写真（夜、凜風館の裏の階段から。未保存。docs/visual-research/symphony-hall.md の初めの記録）:
 *   上に深い梁が並ぶ厚いコンクリートの庇が大きく張り出す。壁はベージュ
 * - 国土地理院の空中写真（2017 年 4 月）: 屋根は明るい灰色の長方形で、長手の向きに細い筋（約 3.2m おき）が並ぶ。
 *   北西の端から約 7.5m の所に横切る段（北西の区画が低い）。屋根の縁は OSM の輪郭とほぼ一致し、北西へ約 2.3m 出る
 * - 公式の地図（2023 年 4 月）と KAN-CAN! の誠之館の図のイラスト（形の手がかりだけ）: 道の側に低い箱、
 *   その奥に高いホールの箱。屋根に平行な筋。階段は凜風館との間を上る
 *
 * 座標: OSM の輪郭（way 423067246）の北の角を原点に、北東の辺の向き（南東へ）を u、それに直角に南西へ v。
 * 輪郭は u 0〜32.1・v 0〜22.7 の長方形に、北西の面の張り出し（u −4〜0、v 7.3〜13.9）が付く。
 * 高さは道（北西の面の前）の地面からの m（建物の高さは強調しない）
 */

/** 輪郭の北の角（原点）と、北東の辺の向き（北の角 → 東の角） */
const ORIGIN_X = 150.64;
const ORIGIN_Z = -63.52;
const AXIS_DX = 172.99 - 150.64;
const AXIS_DZ = -40.48 - -63.52;

/** 輪郭の長方形の長さ（u）と幅（v） */
const LENGTH_M = 32.1;
const DEPTH_M = 22.7;

/** 壁を輪郭（＝屋根の縁）から内へ下げる量。庇が「大きく張り出す」（推定 2.0m） */
const WALL_INSET_M = 2.0;
const WALL_V0 = WALL_INSET_M;
const WALL_V1 = DEPTH_M - WALL_INSET_M;

/** 屋根の区画（空中写真）: 北西の低い区画は u −2.3〜7.5、高い区画は 7.5〜33.0（南東へ 0.9m 出る。推定） */
const ROOF_U0 = -2.3;
const ROOF_STEP_U = 7.5;
const ROOF_U1 = 33.0;
/** 屋根の上面の高さ（推定。道から 3 階建てほど）と、厚い庇の厚さ（推定） */
const MAIN_TOP_M = 10.6;
const FRONT_TOP_M = 9.6;
const SLAB_THICKNESS_M = 1.2;
/** 庇の下の深い梁（持ち主の写真）。間隔は空中写真の筋と同じ 3.2m、深さ 0.9m（どちらも推定） */
const BEAM_PITCH_M = 3.2;
const BEAM_DEPTH_M = 0.9;
const BEAM_WIDTH_M = 0.4;
/** 屋上の筋（空中写真で長手の向きに約 3.2m おき） */
const RIB_VS = [3.4, 6.6, 9.8, 13.0, 16.2, 19.4] as const;
const RIB_HEIGHT_M = 0.25;
const RIB_WIDTH_M = 0.45;

/** 北西の面の張り出し（OSM の輪郭。AR KANDAI の「側面の調光室の凸部」と推定）。上端は推定 */
const BAY = { u0: -4.0, u1: 0.05, v0: 7.26, v1: 13.88, top: 7.6 } as const;
/** 入口（公式の地図のイラストで道の側の面の階段寄りに暗い戸口。位置と大きさは推定） */
const DOOR = { v0: 15.6, v1: 19.2, top: 2.6 } as const;
/** 南西の面の小さな窓（映像 IMG_6414_000 で西の角の近くの高い所） */
const WINDOW = { u0: 1.0, u1: 2.0, y0: 5.0, y1: 5.8 } as const;

/**
 * 大階段（OSM の steps way 1259556097: 下端 (128.37, −41.37)・上端 (154.06, −13.7)。ローカルで u 0.4 → 38.1、v 約 31.4〜32.2）。
 * 凜風館の側の縁は凜風館の輪郭の北東の辺（u 0.4 で v 37.9、u 38.1 で v 34.3）、ホールの側の縁は手すり壁。
 * 段: 1 段 0.15m・踏み面 0.38m の 8 段を 5 回、間に 4.6m の踊り場（段の数・高さは推定。映像で数えた約 30 段より上が
 * 写っていないので、凜風館の 2 階の高さほどの 6.0m とした）
 */
const STAIR_U0 = 0.4;
const STAIR_U_END = 38.7;
const STAIR_FLIGHTS = 5;
const STEPS_PER_FLIGHT = 8;
const RISER_M = 0.15;
const TREAD_M = 0.38;
const LANDING_M = 4.6;
const PARAPET_V = 25.2;
const PARAPET_HALF_M = 0.15;
const PARAPET_ABOVE_STEP_M = 1.0;
const STAIR_V0 = PARAPET_V + PARAPET_HALF_M;
/** 凜風館の輪郭の北東の辺（ローカル）から 0.2m 手前 */
function stairOuterV(u: number): number {
  return 37.9 - ((u - 0.4) * (37.9 - 34.3)) / (38.1 - 0.4) - 0.2;
}
/** 花壇の箱（映像）: 幅 2.4m、段の上 0.6〜0.85m。列の中心は階段の中ほどより少しホール寄り（推定） */
const PLANTER_HALF_M = 1.2;

/** ツタの土手（小山）: 壁ぎわの高さは段の高さ +1.8m（西の角でも 2.4m 以上）、手すり壁の側は段 +0.9m（推定） */
const BANK_MIN_M = 2.4;
const BANK_ABOVE_STAIR_M = 1.8;
const BANK_AT_PARAPET_M = 0.9;
/** 西の角の外で土手が道へ下りきる位置（映像 IMG_6414_000・6413_000） */
const BANK_FADE_U = -4.0;
/** 南東の端の小山（ホールと凜風館の北東の棟の間）。v 6 で地面まで下りる（推定） */
const HILL_V0 = 6.0;
const HILL_U0 = 31.6;
const HILL_U1 = 44.0;

const COLORS = {
  wall: '#D9CFBE',
  slab: '#BEB8AD',
  roofTop: '#AFAAA3',
  stair: '#6E4A3D',
  brick: '#8A5A47',
  ivy: '#4A6340',
  dark: '#2F3539',
} as const;

/** 階段の段と踊り場（u の区間と上面の高さ。高さは階段の下端の地面から） */
interface StairTread {
  u0: number;
  u1: number;
  top: number;
  kind: 'step' | 'landing';
}

function stairTreads(): StairTread[] {
  const out: StairTread[] = [];
  let u = STAIR_U0;
  let level = 0;
  for (let f = 0; f < STAIR_FLIGHTS; f++) {
    for (let s = 0; s < STEPS_PER_FLIGHT; s++) {
      out.push({ u0: u, u1: u + TREAD_M, top: level + RISER_M * (s + 1), kind: 'step' });
      u += TREAD_M;
    }
    level += RISER_M * STEPS_PER_FLIGHT;
    const end = f < STAIR_FLIGHTS - 1 ? u + LANDING_M : STAIR_U_END;
    out.push({ u0: u, u1: end, top: level, kind: 'landing' });
    u = end;
  }
  return out;
}

/** 階段の上り（段の鼻を結んだ線。踊り場は平ら）。u の範囲の外は端の高さ */
function stairLevelAt(treads: readonly StairTread[], u: number): number {
  if (u <= STAIR_U0) return 0;
  let prevTop = 0;
  for (const t of treads) {
    if (u < t.u1) {
      if (t.kind === 'landing') return t.top;
      // 段: 踏み面の中は前の段の高さから自分の高さへ線形に（土手と手すり壁をなめらかにする）
      const k = (u - t.u0) / (t.u1 - t.u0);
      return prevTop + (t.top - prevTop) * k;
    }
    prevTop = t.top;
  }
  return prevTop;
}

export const buildSymphonyHall: HeroBuilder = (ctx) => {
  const frame = makeFrame(ORIGIN_X, ORIGIN_Z, AXIS_DX, AXIS_DZ);
  const groundAt = (u: number, v: number): number => {
    const [x, z] = frameToWorld(frame, u, v);
    return ctx.sampleGroundVisualY(x, z);
  };

  const group = new THREE.Group();
  group.name = 'seishikan-4';
  const local = createLocalGroup(frame);
  group.add(local);

  const polygon = ctx.building.polygon.length >= 3 ? ctx.building.polygon : [];
  const lowest = polygon.length >= 3 ? minGroundUnder(ctx, polygon) : ctx.groundVisualY;
  const bottom = Math.min(lowest, groundAt(-4, 31.4), groundAt(STAIR_U_END, 33)) - 0.5;
  /** 道（北西の面の前）の地面。建物の高さの基準 */
  const ref = groundAt(-1.0, DEPTH_M / 2);
  /** 階段の下端の地面。段・手すり壁・土手の高さの基準 */
  const stairRef = groundAt(STAIR_U0, 31.4);

  const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.86, metalness: 0.02 });
  const slabMat = new THREE.MeshStandardMaterial({ color: COLORS.slab, roughness: 0.9, metalness: 0.02 });
  const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.roofTop, roughness: 0.92, metalness: 0.02 });
  const stairMat = new THREE.MeshStandardMaterial({ color: COLORS.stair, roughness: 0.85, metalness: 0.02 });
  const brickMat = new THREE.MeshStandardMaterial({ color: COLORS.brick, roughness: 0.88, metalness: 0.02 });
  const ivyMat = new THREE.MeshStandardMaterial({ color: COLORS.ivy, roughness: 0.95, metalness: 0 });
  const darkMat = new THREE.MeshStandardMaterial({ color: COLORS.dark, roughness: 0.5, metalness: 0.05 });

  const wall = new TriBucket();
  const slab = new TriBucket();
  const roof = new TriBucket();
  const stair = new TriBucket();
  const brick = new TriBucket();
  const ivy = new TriBucket();
  const dark = new TriBucket();

  // ── ホールの壁（ベージュの平らな壁。庇の下へ下げる）。北西の低い区画と高い区画で上端を変える ──
  const frontUnder = ref + FRONT_TOP_M - SLAB_THICKNESS_M;
  const mainUnder = ref + MAIN_TOP_M - SLAB_THICKNESS_M;
  pushBox({ sides: wall, top: null, skip: ['+u'] }, 0, ROOF_STEP_U, bottom, frontUnder + 0.05, WALL_V0, WALL_V1);
  pushBox({ sides: wall, top: null, skip: ['-u'] }, ROOF_STEP_U, LENGTH_M, bottom, mainUnder + 0.05, WALL_V0, WALL_V1);
  // 高い区画の北西の面のうち、低い区画の屋根より上の部分（屋根の段）
  wall.quad(
    [ROOF_STEP_U, frontUnder, WALL_V0],
    [ROOF_STEP_U, frontUnder, WALL_V1],
    [ROOF_STEP_U, mainUnder + 0.05, WALL_V1],
    [ROOF_STEP_U, mainUnder + 0.05, WALL_V0],
    [-1, 0, 0],
  );

  // ── 厚い庇（屋根の板）: 上面は空中写真の明るい灰色、縁と下面はコンクリート ──
  const frontTop = ref + FRONT_TOP_M;
  const mainTop = ref + MAIN_TOP_M;
  pushBox({ sides: slab, top: roof, bottom: slab, skip: ['+u'] }, ROOF_U0, ROOF_STEP_U, frontUnder, frontTop, 0, DEPTH_M);
  pushBox({ sides: slab, top: roof, bottom: slab }, ROOF_STEP_U, ROOF_U1, mainUnder, mainTop, 0, DEPTH_M);
  // 屋上の筋（長手の向き）
  for (const v of RIB_VS) {
    pushBox({ sides: roof, top: roof }, ROOF_U0 + 0.3, ROOF_STEP_U - 0.2, frontTop, frontTop + RIB_HEIGHT_M, v - RIB_WIDTH_M / 2, v + RIB_WIDTH_M / 2);
    pushBox({ sides: roof, top: roof }, ROOF_STEP_U + 0.2, ROOF_U1 - 0.3, mainTop, mainTop + RIB_HEIGHT_M, v - RIB_WIDTH_M / 2, v + RIB_WIDTH_M / 2);
  }
  // 庇の下の深い梁（南西の面。壁から庇の縁まで）。北東の面は写真が無いので付けない
  for (let u = 1.2; u < LENGTH_M - 0.4; u += BEAM_PITCH_M) {
    const under = u < ROOF_STEP_U ? frontUnder : mainUnder;
    pushBox(
      { sides: slab, top: null, bottom: slab, skip: ['-v'] },
      u - BEAM_WIDTH_M / 2,
      u + BEAM_WIDTH_M / 2,
      under - BEAM_DEPTH_M,
      under + 0.02,
      WALL_V1 - 0.02,
      DEPTH_M - 0.05,
    );
  }

  // ── 北西の面の張り出し（調光室の凸部と推定） ──
  pushBox({ sides: wall, top: roof, skip: ['+u'] }, BAY.u0, BAY.u1, bottom, ref + BAY.top, BAY.v0, BAY.v1);

  // ── 入口の戸口と小さな窓（暗い面を壁から少し浮かせる） ──
  dark.quad(
    [-0.03, ref - 0.05, DOOR.v0],
    [-0.03, ref - 0.05, DOOR.v1],
    [-0.03, ref + DOOR.top, DOOR.v1],
    [-0.03, ref + DOOR.top, DOOR.v0],
    [-1, 0, 0],
  );
  dark.quad(
    [WINDOW.u0, ref + WINDOW.y0, WALL_V1 + 0.03],
    [WINDOW.u1, ref + WINDOW.y0, WALL_V1 + 0.03],
    [WINDOW.u1, ref + WINDOW.y1, WALL_V1 + 0.03],
    [WINDOW.u0, ref + WINDOW.y1, WALL_V1 + 0.03],
    [0, 0, 1],
  );

  // ── 大階段（段・踊り場は地面の下から立ち上げる箱。凜風館の側は凜風館の壁に接する） ──
  const treads = stairTreads();
  for (const t of treads) {
    const v1 = stairOuterV((t.u0 + t.u1) / 2);
    const base =
      Math.min(groundAt(t.u0, STAIR_V0), groundAt(t.u1, STAIR_V0), groundAt(t.u0, v1), groundAt(t.u1, v1)) - 0.3;
    pushBox({ sides: stair, top: stair, skip: ['-v', '+v'] }, t.u0, t.u1 + 0.01, base, stairRef + t.top, STAIR_V0, v1);
  }

  // 手すり壁（ホールの側。段の鼻の線 +1.0m で斜めに上る）
  const parapetPts: [number, number, number][] = [];
  const breaks = [STAIR_U0, ...treads.filter((t) => t.kind === 'landing').flatMap((t) => [t.u0, t.u1])];
  for (const u of breaks) {
    const top = stairRef + stairLevelAt(treads, u) + PARAPET_ABOVE_STEP_M;
    parapetPts.push([u, top, groundAt(u, PARAPET_V) - 0.3]);
  }
  pushWallStrip(wall, parapetPts, PARAPET_V - PARAPET_HALF_M, PARAPET_V + PARAPET_HALF_M);

  // 花壇の箱（階段の中ほどに段々に並ぶ。上面は緑）
  for (const t of treads) {
    if (t.kind !== 'landing' || t.u1 - t.u0 < 2) continue;
    const mid = (t.u0 + t.u1) / 2;
    const vc = (STAIR_V0 + stairOuterV(mid)) / 2 - 0.6;
    pushBox(
      { sides: brick, top: ivy },
      t.u0 + 0.4,
      t.u1 - 0.4,
      stairRef + t.top - 0.2,
      stairRef + t.top + 0.85,
      vc - PLANTER_HALF_M,
      vc + PLANTER_HALF_M,
    );
  }
  // 段の上の花壇（1 回の上りを前後 2 つに分け、それぞれ上り切った段の高さ +0.6m）
  const steps = treads.filter((t) => t.kind === 'step');
  for (let i = 0; i + 3 < steps.length; i += 4) {
    const a = steps[i];
    const b = steps[i + 3];
    if (!a || !b) continue;
    const mid = (a.u0 + b.u1) / 2;
    const vc = (STAIR_V0 + stairOuterV(mid)) / 2 - 0.6;
    pushBox(
      { sides: brick, top: ivy },
      a.u0 + 0.05,
      b.u1 - 0.05,
      stairRef + a.top - RISER_M - 0.2,
      stairRef + b.top + 0.6,
      vc - PLANTER_HALF_M,
      vc + PLANTER_HALF_M,
    );
  }

  // ── ツタの土手（小山）。地面の高さの格子で張り、下りきった所は地面の下へ隠す ──
  const wallSide = (u: number): number => {
    if (u < STAIR_U0) return BANK_MIN_M * Math.max(0, Math.min(1, (u - BANK_FADE_U) / (STAIR_U0 - BANK_FADE_U)));
    return Math.max(BANK_MIN_M, stairLevelAt(treads, u) + BANK_ABOVE_STAIR_M);
  };
  const parapetSide = (u: number): number => {
    if (u < STAIR_U0) return BANK_AT_PARAPET_M * Math.max(0, Math.min(1, (u - BANK_FADE_U) / (STAIR_U0 - BANK_FADE_U)));
    return stairLevelAt(treads, u) + BANK_AT_PARAPET_M;
  };
  const bankY = (u: number, v: number, h: number): number => {
    const g = groundAt(u, v);
    if (h < 0.05) return g - 0.15;
    return Math.max(stairRef + h, g + 0.03);
  };
  const heightfield = (
    us: readonly number[],
    vs: readonly number[],
    height: (u: number, v: number) => number,
  ): number[][] => {
    const ys = us.map((u) => vs.map((v) => bankY(u, v, height(u, v))));
    for (let i = 0; i + 1 < us.length; i++) {
      for (let j = 0; j + 1 < vs.length; j++) {
        const u0 = us[i] ?? 0;
        const u1 = us[i + 1] ?? 0;
        const v0 = vs[j] ?? 0;
        const v1 = vs[j + 1] ?? 0;
        ivy.quad(
          [u0, ys[i]?.[j] ?? 0, v0],
          [u1, ys[i + 1]?.[j] ?? 0, v0],
          [u1, ys[i + 1]?.[j + 1] ?? 0, v1],
          [u0, ys[i]?.[j + 1] ?? 0, v1],
          [0, 1, 0],
        );
      }
    }
    return ys;
  };
  const range = (a: number, b: number, step: number): number[] => {
    const n = Math.max(1, Math.ceil((b - a) / step));
    return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  };

  // A: 南西の壁ぎわから手すり壁まで（西の角の外から凜風館の北東の棟まで）
  const bankUs = range(BANK_FADE_U, 38.5, 0.8);
  const bankVs = [WALL_V1 - 0.5, WALL_V1, 22.2, 23.7, PARAPET_V];
  const bankH = (u: number, v: number): number => {
    const k = Math.max(0, Math.min(1, (v - WALL_V1) / (PARAPET_V - WALL_V1)));
    return wallSide(u) + (parapetSide(u) - wallSide(u)) * k;
  };
  const bankYs = heightfield(bankUs, bankVs, bankH);
  // 西の角の外で見える土手の縁（壁の側と手すり壁より手前の道の側）を地面の下まで垂らす
  for (let i = 0; i + 1 < bankUs.length; i++) {
    const u0 = bankUs[i] ?? 0;
    const u1 = bankUs[i + 1] ?? 0;
    if (u0 < 0) {
      const ya = bankYs[i]?.[0] ?? 0;
      const yb = bankYs[i + 1]?.[0] ?? 0;
      const v = bankVs[0] ?? 0;
      ivy.quad([u0, groundAt(u0, v) - 0.3, v], [u1, groundAt(u1, v) - 0.3, v], [u1, yb, v], [u0, ya, v], [0, 0, -1]);
    }
    if (u0 < STAIR_U0) {
      const last = bankVs.length - 1;
      const ya = bankYs[i]?.[last] ?? 0;
      const yb = bankYs[i + 1]?.[last] ?? 0;
      ivy.quad(
        [u0, groundAt(u0, PARAPET_V) - 0.3, PARAPET_V],
        [u1, groundAt(u1, PARAPET_V) - 0.3, PARAPET_V],
        [u1, yb, PARAPET_V],
        [u0, ya, PARAPET_V],
        [0, 0, 1],
      );
    }
  }
  // B: 南東の端の小山（ホールの南東の面から凜風館の北東の棟まで。北東へ地面まで下りる）
  heightfield(range(HILL_U0, HILL_U1, 1.0), range(HILL_V0, WALL_V1 - 0.5, 1.2), (u, v) => {
    const k = Math.max(0, Math.min(1, (v - HILL_V0) / (WALL_V1 - 0.5 - HILL_V0)));
    return wallSide(Math.min(u, 38.5)) * k;
  });

  addBucketMesh(local, wall, wallMat, 'seishikan-4-walls', true);
  addBucketMesh(local, slab, slabMat, 'seishikan-4-slab', true);
  addBucketMesh(local, roof, roofMat, 'seishikan-4-roof', false);
  addBucketMesh(local, stair, stairMat, 'seishikan-4-stairs', false);
  addBucketMesh(local, brick, brickMat, 'seishikan-4-planters', false);
  addBucketMesh(local, ivy, ivyMat, 'seishikan-4-bank', false);
  addBucketMesh(local, dark, darkMat, 'seishikan-4-openings', false);

  return {
    group,
    primaryMaterials: [
      { mat: wallMat, baseHex: COLORS.wall },
      { mat: slabMat, baseHex: COLORS.slab },
      { mat: roofMat, baseHex: COLORS.roofTop },
    ],
    animated: [],
  };
};
