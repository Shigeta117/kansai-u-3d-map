import * as THREE from 'three';
import {
  TriBucket,
  addBucketMesh,
  createLocalGroup,
  frameToWorld,
  makeFrame,
  pushBox,
} from './localFrame';
import { minGroundUnder } from './shared';
import type { HeroBuilder } from './types';

/**
 * 千里山中央体育館（1994 年、地上 3 階）の専用モデル。調べた事と出典は docs/visual-research/central-gym.md。
 *
 * 根拠にしたもの:
 * - 公式の地図（2023 年 4 月）と KAN-CAN! の誠之館の図のイラスト（形の手がかりだけ）: 金属のかまぼこ形の大屋根。
 *   円筒の軸は建物の長手（北西 − 南東）で、北西の端に弓形の妻面と、その前に低い箱（南東の端はイラストに写らない）
 * - 持ち主の 2023 年の映像 IMG_6421（入口の「中央体育館」の看板）・IMG_6420_022（南の道から）:
 *   入口は南東の面。明るい灰色のタイルの高い壁の下に、白い箱形の庇（正面に「中央体育館」の文字）とガラスの戸。
 *   高い壁の上端は濃い灰色のパネルの帯で、北東の端へ向かってまっすぐ下がる（庇の線との傾きの差から、水平の線の
 *   見え方ではなく本当に下がっている）。高い壁は庇の北東の端から約 1.7m で終わり、その先は低い壁（暗い窓）と
 *   運動場へ上る階段。帯の上の奥に、かまぼこ屋根の明るい曲面がのぞく。右奥（北東）に養心館
 * - 国土地理院の空中写真（2017 年 4 月）: 白い大屋根が輪郭の長方形（約 66×55m）を覆う。南東の面の前に濃い灰色の
 *   屋根の付属棟（v 11〜42）。その南東の面の中ほど（v 20.7〜31.3）に、白い枠の小さな屋根（約 4×11m）＝入口の庇。
 *   大屋根と付属棟の間は影の帯。北西の面の前の細長い張り出し（OSM の輪郭で奥行き 6.8m）は濃い色の屋根
 * - 持ち主の写真（2026-11-24）IMG_3393〜3395（北西の道から裏側）: 北西の張り出しは明るい灰色のタイルの高い箱
 *   （約 11m。裏側の凸状の出っ張り）。北西の面の南西寄りの高い所に横長の小さな窓、北東寄りに奥まった戸口。
 *   その上の妻面は縦の筋の入った明るい灰色の金属の板で、縁に濃い灰色の帯
 *
 * 座標: OSM の輪郭（way 423067235）の北の角 (109.85, −220.9) を原点に、北東の辺の向き（南東へ）を u、
 * それに直角に南西へ v。大屋根の長方形は u 0〜65.9・v 0〜54.6。高さは入口の前の広場の地面からの m（強調しない）
 */

const ORIGIN_X = 109.85;
const ORIGIN_Z = -220.9;
const AXIS_DX = 159.26 - 109.85;
const AXIS_DZ = -177.27 - -220.9;

const LENGTH_M = 65.9;
const WIDTH_M = 54.6;

/** 長い壁の上端（軒）と、かまぼこ屋根の上がり（どちらも推定。地上 3 階・イラストの比） */
const EAVE_M = 12.0;
const VAULT_RISE_M = 7.0;
/** 屋根の殻の厚さ・軒の出（長い辺）・妻の出 */
const SHELL_THICKNESS_M = 0.45;
const SHELL_SIDE_OVERHANG_M = 0.8;
const SHELL_END_OVERHANG_M = 0.7;
/**
 * 南東の端で円弧を軒の高さまで下げる長さ（推定）。映像 IMG_6420_022・IMG_6421_000・003 では、南東の付属棟の
 * 帯の北東の半分の上は空で、垂直な弓形の妻面が見えない。帯の上の奥に明るい曲面だけがのぞく
 */
const SE_HIP_LENGTH_M = 10.0;
/** 北西の妻の縁の濃い灰色の帯（南東の付属棟の上端の帯と同じ太さとした。壁から 0.25〜0.7m 出る） */
const VERGE_DEPTH_M = 1.2;
const VERGE_PROJECTION_M = 0.45;

/**
 * 北西の張り出し（OSM の輪郭。u −6.8〜0、v 4.3〜48.3）。体育館の裏側の凸状の出っ張り。
 * 持ち主の写真（2026-11-24、IMG_3393〜3395。北西の道から）で、アリーナと同じ明るい灰色のタイル（れんが形）の高い箱。
 * 高さ 11.0m は、壁ぎわのトラック（高さ 約 1.9m）を物差しに撮影の位置と向きを合わせて読んだ推定（10.7〜11.8m）。
 * それまではイラストの低い箱から 7.0m としていた。調べた事は docs/visual-research/central-gym.md の 7 節
 */
const NW_ANNEX = { u0: -6.8, v0: 4.3, v1: 48.3, height: 11.0 } as const;
/** 北西の張り出しの北西の面の、横長の小さな窓（IMG_3393〜3395。位置と大きさは推定） */
const NW_WINDOW = { v0: 39.0, v1: 41.3, bottom: 6.9, top: 8.1 } as const;
/** 北西の張り出しの北西の面の、北東寄りの奥まった戸口（IMG_3393。位置と大きさは推定） */
const NW_DOORWAY = { v0: 30.0, v1: 31.8, top: 3.6 } as const;

/**
 * 南東の付属棟（OSM の輪郭の段々の張り出し。空中写真の濃い灰色の屋根）。
 * 映像と空中写真を合わせると、庇のある高い壁は付属棟の南西の側（v 18.3〜41.8）で、上端は北東の端の 10.0m から
 * 南西の端の 15.5m へまっすぐ上る（片流れ。高さは庇との比から推定）。北東の側（v 11.9〜18.3）と北東のわき
 * （v 4.8〜11.9）は低い（映像で高い壁の先に低い壁。高さ 3.6m は推定）。南西のわき（v 41.8〜50.2）は
 * 高い壁の左の一段下がった高い面（IMG_6421_015。高さ 14.0m は推定）
 */
const SE_TALL = { u1: 80.3, v0: 18.3, v1: 41.8, lowTop: 10.0, highTop: 15.5 } as const;
/** 高い壁の上端の濃い灰色の帯の太さ（映像で庇の厚さほど） */
const SE_BAND_M = 1.6;
const SE_LOW_PARTS = [
  { u1: 80.3, v0: 11.9, v1: SE_TALL.v0, top: 3.6 },
  { u1: 71.5, v0: 4.8, v1: 11.9, top: 3.6 },
  { u1: 72.9, v0: 41.8, v1: 50.2, top: 14.0 },
] as const;

/** 入口の庇（空中写真の白い枠: u 80.3〜84.3、v 20〜31）。高さは映像（ガラスの戸の上に厚い箱）から推定 */
const CANOPY = { u1: 84.3, v0: 20.0, v1: 31.0, soffit: 3.3, top: 4.6 } as const;
const DOORS = { v0: 20.6, v1: 30.4, top: 3.2 } as const;

const COLORS = {
  wall: '#DAD9D3',
  vault: '#D8DBD9',
  dark: '#7E8488',
  canopy: '#ECEBE6',
  glass: '#2D3A44',
  signText: '#1F2A4A',
} as const;

/** 円弧（中心 (vc, yc)、半径 r）の v における高さ */
function arcY(vc: number, yc: number, r: number, v: number): number {
  return yc + Math.sqrt(Math.max(0, r * r - (v - vc) * (v - vc)));
}

interface Vault {
  /** 円の中心（v と高さ）と半径 */
  vc: number;
  yc: number;
  r: number;
}

/** 幅 v0〜v1、軒の高さ spring、頂の高さ crown の円弧 */
function vaultFor(v0: number, v1: number, spring: number, crown: number): Vault {
  const half = (v1 - v0) / 2;
  const rise = crown - spring;
  const r = (half * half + rise * rise) / (2 * rise);
  return { vc: (v0 + v1) / 2, yc: crown - r, r };
}

/** 弓形の妻面（軒の線より上の部分）を u の位置に張る。facing は面の向き（±u） */
function pushTympanum(bucket: TriBucket, vault: Vault, v0: number, v1: number, base: number, u: number, facing: 1 | -1): void {
  const n = 32;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const v = v0 + ((v1 - v0) * i) / n;
    pts.push([v, Math.max(base, arcY(vault.vc, vault.yc, vault.r, v))]);
  }
  const first = pts[0];
  if (!first) return;
  for (let i = 1; i + 1 < pts.length; i++) {
    const b = pts[i];
    const c = pts[i + 1];
    if (!b || !c) continue;
    // 弓形（円弧と軒の線で囲む凸の形）を、左端の軒の点からの扇で割る
    bucket.tri([u, base, first[0]], [u, b[1], b[0]], [u, c[1], c[0]], [facing, 0, 0]);
  }
}

/**
 * 円筒の屋根の殻（u0〜u1 に伸びる。内側の半径 r + 0.02、厚さ thickness）。
 * 半幅 + overhang まで円弧を延ばし、上面・下面・両側の小口を積む（妻の小口は帯で覆う）。
 * hipFrom を渡すと、u が hipFrom から u1 へ進むにつれて円弧の高さを軒の線まで縮める（端が寄棟のように下がる）
 */
function pushShell(
  bucket: TriBucket,
  vault: Vault,
  halfWidth: number,
  overhang: number,
  thickness: number,
  u0: number,
  u1: number,
  hipFrom?: number,
): { edgeV: number; edgeY: number }[] {
  const rIn = vault.r + 0.02;
  const rOut = rIn + thickness;
  const thetaMax = Math.asin(Math.min(0.999, (halfWidth + overhang) / rIn));
  const n = 48;
  const at = (r: number, th: number): [number, number] => [vault.vc + r * Math.sin(th), vault.yc + r * Math.cos(th)];
  const edgeOutY = at(rOut, thetaMax)[1];
  const edgeInY = at(rIn, thetaMax)[1];
  const us = [u0];
  if (hipFrom !== undefined && hipFrom > u0 && hipFrom < u1) {
    const steps = 8;
    for (let k = 0; k <= steps; k++) us.push(hipFrom + ((u1 - hipFrom) * k) / steps);
  } else {
    us.push(u1);
  }
  const scale = (u: number): number =>
    hipFrom === undefined || u <= hipFrom ? 1 : Math.max(0, 1 - (u - hipFrom) / (u1 - hipFrom));
  /** 殻の点（外側か内側か・角度・u）。端へ向かって軒の線まで縮める */
  const point = (outer: boolean, th: number, u: number): [number, number, number] => {
    const [v, y] = at(outer ? rOut : rIn, th);
    const edgeY = outer ? edgeOutY : edgeInY;
    return [u, edgeY + (y - edgeY) * scale(u), v];
  };
  for (let k = 0; k + 1 < us.length; k++) {
    const ua = us[k] ?? u0;
    const ub = us[k + 1] ?? u1;
    for (let i = 0; i < n; i++) {
      const a = -thetaMax + (2 * thetaMax * i) / n;
      const b = -thetaMax + (2 * thetaMax * (i + 1)) / n;
      const mid = (a + b) / 2;
      bucket.quad(point(true, a, ua), point(true, a, ub), point(true, b, ub), point(true, b, ua), [0, Math.cos(mid), Math.sin(mid)]);
      bucket.quad(point(false, a, ua), point(false, a, ub), point(false, b, ub), point(false, b, ua), [0, -Math.cos(mid), -Math.sin(mid)]);
    }
    for (const th of [-thetaMax, thetaMax]) {
      bucket.quad(point(false, th, ua), point(false, th, ub), point(true, th, ub), point(true, th, ua), [0, 0, Math.sign(th)]);
    }
  }
  if (hipFrom !== undefined) {
    // 縮めきった端の小口（軒の高さの薄い帯）
    for (let i = 0; i < n; i++) {
      const a = -thetaMax + (2 * thetaMax * i) / n;
      const b = -thetaMax + (2 * thetaMax * (i + 1)) / n;
      bucket.quad(point(false, a, u1), point(false, b, u1), point(true, b, u1), point(true, a, u1), [1, 0, 0]);
    }
  }
  return [-thetaMax, thetaMax].map((th) => {
    const [vo, yo] = at(rOut, th);
    return { edgeV: vo, edgeY: yo };
  });
}

/** 妻面の上端の帯（弓形の縁。半径 r − depth 〜 r + 0.05 + thickness、u0〜u1） */
function pushVerge(
  bucket: TriBucket,
  vault: Vault,
  halfWidth: number,
  overhang: number,
  depth: number,
  thickness: number,
  u0: number,
  u1: number,
  facing: 1 | -1,
): void {
  const rOut = vault.r + 0.07 + thickness;
  const rIn = vault.r - depth;
  const thetaMax = Math.asin(Math.min(0.999, (halfWidth + overhang) / (vault.r + 0.02)));
  const n = 40;
  const at = (r: number, th: number): [number, number] => [vault.vc + r * Math.sin(th), vault.yc + r * Math.cos(th)];
  const uf = facing > 0 ? u1 : u0;
  const ub = facing > 0 ? u0 : u1;
  for (let i = 0; i < n; i++) {
    const a = -thetaMax + (2 * thetaMax * i) / n;
    const b = -thetaMax + (2 * thetaMax * (i + 1)) / n;
    const [oa, oya] = at(rOut, a);
    const [ob, oyb] = at(rOut, b);
    const [ia, iya] = at(rIn, a);
    const [ib, iyb] = at(rIn, b);
    const mid = (a + b) / 2;
    // 正面（外へ向く面）と裏（壁の側）
    bucket.quad([uf, iya, ia], [uf, iyb, ib], [uf, oyb, ob], [uf, oya, oa], [facing, 0, 0]);
    bucket.quad([ub, iya, ia], [ub, iyb, ib], [ub, oyb, ob], [ub, oya, oa], [-facing, 0, 0]);
    // 上（屋根の側）と下（見上げる側）
    bucket.quad([u0, oya, oa], [u1, oya, oa], [u1, oyb, ob], [u0, oyb, ob], [0, Math.cos(mid), Math.sin(mid)]);
    bucket.quad([u0, iya, ia], [u1, iya, ia], [u1, iyb, ib], [u0, iyb, ib], [0, -Math.cos(mid), -Math.sin(mid)]);
  }
}

/** 「中央体育館」の看板（白地に紺の文字）。document が無い環境（テスト）では null */
function createSignTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = COLORS.signText;
  g.font = 'bold 76px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const text = '中央体育館';
  // 映像では文字が庇の正面いっぱいに間をあけて並ぶ
  const chars = [...text];
  chars.forEach((ch, i) => {
    g.fillText(ch, canvas.width * ((i + 0.5) / chars.length) * 0.84 + canvas.width * 0.08, canvas.height / 2 + 4);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export const buildCentralGym: HeroBuilder = (ctx) => {
  const frame = makeFrame(ORIGIN_X, ORIGIN_Z, AXIS_DX, AXIS_DZ);
  const groundAt = (u: number, v: number): number => {
    const [x, z] = frameToWorld(frame, u, v);
    return ctx.sampleGroundVisualY(x, z);
  };

  const group = new THREE.Group();
  group.name = 'central-gym';
  const local = createLocalGroup(frame);
  group.add(local);

  const polygon = ctx.building.polygon.length >= 3 ? ctx.building.polygon : [];
  const lowest = polygon.length >= 3 ? minGroundUnder(ctx, polygon) : ctx.groundVisualY;
  const bottom = Math.min(lowest, groundAt(CANOPY.u1, (CANOPY.v0 + CANOPY.v1) / 2)) - 0.5;
  /** 入口の前の広場の地面（建物の高さの基準） */
  const ref = groundAt(83.0, (DOORS.v0 + DOORS.v1) / 2);

  const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.84, metalness: 0.02 });
  const vaultMat = new THREE.MeshStandardMaterial({ color: COLORS.vault, roughness: 0.55, metalness: 0.15 });
  const darkMat = new THREE.MeshStandardMaterial({ color: COLORS.dark, roughness: 0.6, metalness: 0.15 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: COLORS.canopy, roughness: 0.75, metalness: 0.02 });
  const glassMat = new THREE.MeshStandardMaterial({ color: COLORS.glass, roughness: 0.3, metalness: 0.1 });
  const signTex = createSignTexture();
  const signMat = new THREE.MeshStandardMaterial({
    color: signTex ? '#FFFFFF' : COLORS.canopy,
    map: signTex,
    roughness: 0.7,
    metalness: 0.02,
  });

  const wall = new TriBucket();
  const vault = new TriBucket();
  const dark = new TriBucket();
  const canopy = new TriBucket();
  const glass = new TriBucket();

  // ── アリーナの箱（明るい灰色のタイルの壁）と、北西の端の弓形の妻面 ──
  const eaveY = ref + EAVE_M;
  pushBox({ sides: wall, top: null }, 0, LENGTH_M, bottom, eaveY - 0.02, 0, WIDTH_M);
  const main = vaultFor(0, WIDTH_M, eaveY, eaveY + VAULT_RISE_M);
  // 妻面は屋根と同じ金属（IMG_3393・3394 で縦の筋の入った明るい灰色の板。タイルではない）
  pushTympanum(vault, main, 0, WIDTH_M, eaveY - 0.02, 0, -1);

  // ── かまぼこ屋根（金属の殻）。南東の端は軒の高さまで下げる。北西の妻の縁の濃い灰色の帯、軒の帯 ──
  const shellU0 = -SHELL_END_OVERHANG_M;
  const shellU1 = LENGTH_M + SHELL_END_OVERHANG_M;
  const edges = pushShell(vault, main, WIDTH_M / 2, SHELL_SIDE_OVERHANG_M, SHELL_THICKNESS_M, shellU0, shellU1, LENGTH_M - SE_HIP_LENGTH_M);
  pushVerge(dark, main, WIDTH_M / 2, SHELL_SIDE_OVERHANG_M, VERGE_DEPTH_M, SHELL_THICKNESS_M, shellU0, shellU0 + VERGE_PROJECTION_M, -1);
  const edgeY = Math.min(...edges.map((e) => e.edgeY));
  for (const e of edges) {
    const out = e.edgeV < WIDTH_M / 2 ? -1 : 1;
    const v0 = out < 0 ? e.edgeV - 0.12 : e.edgeV - 0.25;
    const v1 = out < 0 ? e.edgeV + 0.25 : e.edgeV + 0.12;
    pushBox({ sides: dark, top: dark, bottom: dark }, shellU0, shellU1 + 0.12, e.edgeY - 0.75, e.edgeY + 0.08, v0, v1);
  }
  const firstEdge = edges[0];
  const lastEdge = edges[edges.length - 1];
  if (firstEdge && lastEdge) {
    // 南東の端の軒の帯（長い辺の帯と角でつながる）
    pushBox({ sides: dark, top: dark, bottom: dark }, shellU1 - 0.25, shellU1 + 0.12, edgeY - 0.75, edgeY + 0.08, firstEdge.edgeV - 0.12, lastEdge.edgeV + 0.12);
  }

  // ── 北西の張り出し（裏側の凸。タイルの高い箱、濃い色の陸屋根）と、北西の面の小さな窓・奥まった戸口 ──
  const nwGround = groundAt((NW_ANNEX.u0 + 0) / 2, (NW_ANNEX.v0 + NW_ANNEX.v1) / 2);
  const nwTop = nwGround + NW_ANNEX.height;
  pushBox({ sides: wall, top: dark, skip: ['+u'] }, NW_ANNEX.u0, 0.05, bottom, nwTop, NW_ANNEX.v0, NW_ANNEX.v1);
  const nwFace = NW_ANNEX.u0 - 0.03;
  glass.quad(
    [nwFace, nwGround + NW_WINDOW.bottom, NW_WINDOW.v0],
    [nwFace, nwGround + NW_WINDOW.bottom, NW_WINDOW.v1],
    [nwFace, nwGround + NW_WINDOW.top, NW_WINDOW.v1],
    [nwFace, nwGround + NW_WINDOW.top, NW_WINDOW.v0],
    [-1, 0, 0],
  );
  glass.quad(
    [nwFace, nwGround - 0.05, NW_DOORWAY.v0],
    [nwFace, nwGround - 0.05, NW_DOORWAY.v1],
    [nwFace, nwGround + NW_DOORWAY.top, NW_DOORWAY.v1],
    [nwFace, nwGround + NW_DOORWAY.top, NW_DOORWAY.v0],
    [-1, 0, 0],
  );

  // ── 南東の付属棟: 庇のある高い壁（上端は北東へ下がる片流れ）と、低い部分・南西のわきの高い面 ──
  const tallTop = (v: number): number =>
    ref + SE_TALL.lowTop + ((v - SE_TALL.v0) * (SE_TALL.highTop - SE_TALL.lowTop)) / (SE_TALL.v1 - SE_TALL.v0);
  const tu0 = LENGTH_M - 0.05;
  const tu1 = SE_TALL.u1;
  const tv0 = SE_TALL.v0;
  const tv1 = SE_TALL.v1;
  const y0 = tallTop(tv0);
  const y1 = tallTop(tv1);
  // 正面・北東の面・南西の面（上端は傾く）
  wall.quad([tu1, bottom, tv0], [tu1, bottom, tv1], [tu1, y1, tv1], [tu1, y0, tv0], [1, 0, 0]);
  wall.quad([tu0, bottom, tv0], [tu1, bottom, tv0], [tu1, y0, tv0], [tu0, y0, tv0], [0, 0, -1]);
  wall.quad([tu0, bottom, tv1], [tu1, bottom, tv1], [tu1, y1, tv1], [tu0, y1, tv1], [0, 0, 1]);
  // 片流れの屋根（濃い灰色）と、正面の上端の帯（壁から少し出す）
  dark.quad([tu0, y0, tv0], [tu1 + 0.3, y0, tv0], [tu1 + 0.3, y1, tv1], [tu0, y1, tv1], [0, 1, 0]);
  const bu = tu1 + 0.3;
  dark.quad([bu, y0 - SE_BAND_M, tv0], [bu, y1 - SE_BAND_M, tv1], [bu, y1 + 0.02, tv1], [bu, y0 + 0.02, tv0], [1, 0, 0]);
  dark.quad([tu1, y0 - SE_BAND_M, tv0], [bu, y0 - SE_BAND_M, tv0], [bu, y1 - SE_BAND_M, tv1], [tu1, y1 - SE_BAND_M, tv1], [0, -1, 0]);
  dark.quad([tu1, y0 - SE_BAND_M, tv0], [bu, y0 - SE_BAND_M, tv0], [bu, y0 + 0.02, tv0], [tu1, y0 + 0.02, tv0], [0, 0, -1]);
  dark.quad([tu1, y1 - SE_BAND_M, tv1], [bu, y1 - SE_BAND_M, tv1], [bu, y1 + 0.02, tv1], [tu1, y1 + 0.02, tv1], [0, 0, 1]);
  for (const p of SE_LOW_PARTS) {
    pushBox({ sides: wall, top: dark, skip: ['-u'] }, LENGTH_M - 0.05, p.u1, bottom, ref + p.top, p.v0, p.v1);
  }

  // ── 入口: 白い箱形の庇（正面に看板）とガラスの戸 ──
  pushBox(
    { sides: canopy, top: canopy, bottom: canopy, skip: ['-u'] },
    SE_TALL.u1,
    CANOPY.u1,
    ref + CANOPY.soffit,
    ref + CANOPY.top,
    CANOPY.v0,
    CANOPY.v1,
  );
  glass.quad(
    [SE_TALL.u1 + 0.03, ref - 0.05, DOORS.v0],
    [SE_TALL.u1 + 0.03, ref - 0.05, DOORS.v1],
    [SE_TALL.u1 + 0.03, ref + DOORS.top, DOORS.v1],
    [SE_TALL.u1 + 0.03, ref + DOORS.top, DOORS.v0],
    [1, 0, 0],
  );
  // 看板（庇の正面。文字は南東から見て左 → 右に読める向き = −v の向き）
  const signW = CANOPY.v1 - CANOPY.v0 - 1.0;
  const signH = CANOPY.top - CANOPY.soffit - 0.3;
  const signGeo = new THREE.PlaneGeometry(signW, signH);
  signGeo.rotateY(Math.PI / 2);
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.name = 'central-gym-sign';
  sign.position.set(CANOPY.u1 + 0.02, ref + (CANOPY.soffit + CANOPY.top) / 2, (CANOPY.v0 + CANOPY.v1) / 2);
  sign.receiveShadow = true;
  local.add(sign);

  addBucketMesh(local, wall, wallMat, 'central-gym-walls', true);
  addBucketMesh(local, vault, vaultMat, 'central-gym-vault', true);
  addBucketMesh(local, dark, darkMat, 'central-gym-dark-metal', true);
  addBucketMesh(local, canopy, canopyMat, 'central-gym-canopy', false);
  addBucketMesh(local, glass, glassMat, 'central-gym-glass', false);

  return {
    group,
    primaryMaterials: [
      { mat: wallMat, baseHex: COLORS.wall },
      { mat: vaultMat, baseHex: COLORS.vault },
    ],
    animated: [],
  };
};
