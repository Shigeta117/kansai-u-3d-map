import * as THREE from 'three';
import { extrudePolygonXZ, minGroundUnder } from './shared';
import type { HeroBuildContext, HeroBuilder, HeroBuildResult } from './types';

/**
 * 第4学舎3号館の専用モデル（段 A: 塊・屋根・外壁の色・目印 2 つまで。作り込みはしない）。
 *
 * 資料: docs/visual-research/area4-3.md（2017 年 4 月の空中写真、KAN-CAN! の第4学舎の図の⑥、
 * 持ち主の 2023 年の映像〈凜風館の屋上から〉、Commons の東体育館の写真〈2019 年〉、KAN-CAN! の部屋の一覧）。
 *
 * - 塊: OSM の輪郭（角 4 つ、約 62m × 45m）どおりの 1 つの白い箱。空中写真の屋上の縁と 0.3〜1.5m で重なる
 * - 屋上: 緑の面と北西の縁の灰色の帯。テニスコート 4 面（空中写真で読んだ位置）は GroundsBuilder が
 *   structures.json の `tennis-area4-3-roof` から、この屋上の高さ（HERO_ROOF_DECKS）に置く。網の柵は描かせない
 *   （写真の囲いはこの形の半透明の板）
 * - 目印 1: 屋上を囲む 2 段の半透明の板と白い枠（映像・イラスト）
 * - 目印 2: 西の角だけ囲いの上端まで立ち上がる白い無地の塊（空中写真・映像・Commons）
 * - 写真に無い物は作らない: 窓（見えている面は窓がごく少ない）、入口、校章と文字、北西の帯の上の物。
 *   北東・南東の面は資料が無いので無地
 *
 * 座標は、西の角（輪郭の点 3）を原点に、北西の辺に沿って北東へ u、それに直交して南東へ v の枠で組む。
 */

type P2 = [number, number];

/** 西の角（輪郭の点 3） */
const ORIGIN: P2 = [185.14, -65.3];
/** 北西の辺（点 3 → 点 0）の向き＝u 軸（北東）。v 軸（南東）はそれに直交する */
const AXIS_U: P2 = [0.73329, -0.6799];
const AXIS_V: P2 = [0.6799, 0.73329];
/** 枠の group の回転。ローカルの +X が AXIS_U、+Z が AXIS_V になる角度 */
const FRAME_ROT_Y = Math.atan2(-AXIS_U[1], AXIS_U[0]);

function toUV(x: number, z: number): P2 {
  const dx = x - ORIGIN[0];
  const dz = z - ORIGIN[1];
  return [dx * AXIS_U[0] + dz * AXIS_U[1], dx * AXIS_V[0] + dz * AXIS_V[1]];
}

// --- 高さ（1 階の床＝重心の地面からの m）。すべて推定（資料は「地上 4 階」だけ） ---
/** 1 階（推定。KAN-CAN! の 1 階は 3101 教室） */
const GROUND_FLOOR_M = 4.6;
/** 2〜4 階（推定。デザインルームと教室） */
const UPPER_FLOOR_M = 4.1;
const UPPER_FLOORS = 3;
/** 屋上（テニスコートの面）の高さ（推定）。GroundsBuilder の屋上のコートもこの高さに置く（heroes/roofDecks.ts） */
export const AREA43_ROOF_DECK_M = GROUND_FLOOR_M + UPPER_FLOOR_M * UPPER_FLOORS + 0.3; // 17.2
/** パラペット（囲いの下の白い無地の帯）の高さ（推定） */
const PARAPET_M = 1.1;
/** 囲いの板 2 段の高さ（推定。映像 2 コマの板の幅との比で 4.7〜6.0m の中ほど） */
const SCREEN_M = 5.2;
/** 囲いと西の角の塊の上端（映像で両者の上端がそろう） */
export const AREA43_SCREEN_TOP_M = AREA43_ROOF_DECK_M + PARAPET_M + SCREEN_M; // 23.5
const PARAPET_THICKNESS_M = 0.35;
/** 囲いの板はパラペットの上、外の面から少し内側に立てる（推定） */
const SCREEN_INSET_M = 0.2;
/** 枠の縦の材の間隔（映像の南西の面で 9 列ほど＝約 4.3m） */
const MULLION_PITCH_M = 4.3;
const FRAME_BAR_M = 0.18;

// --- 屋上の配置（空中写真を u・v に描き直して測った値。誤差は ±0.5m） ---
/** 西の角の白い塊（空中写真の白い面 u 0〜10.2・v 0.7〜5.8。外の面は輪郭にそろえる） */
export const AREA43_CORNER_BLOCK = { u0: 0, u1: 10.2, v0: 0, v1: 5.8 } as const;
/** 北西の縁の灰色の帯（u 10.2〜61.5・v 0.6〜5.8）。北東の端はパラペットの内側まで */
export const AREA43_STRIP = { u0: AREA43_CORNER_BLOCK.u1, u1: 61.8, v1: 5.8 } as const;
/**
 * 帯の厚み（推定）。屋上のコートの面（輪郭を 1.2m 縮めた範囲、屋上の 0.05m 上で奥行きを手前へずらして描く）が
 * 帯の範囲にもかかるので、帯はその面より十分高くする（空中写真では帯はコートの面より下がっていない）
 */
const STRIP_THICK_M = 0.45;

const FOOTING_BELOW_LOWEST_GROUND_M = 0.5;

const COLORS = {
  wall: '#E8E6DC', // 白い外壁（映像の日なた #eae8db）。パラペット・囲いの枠・角の塊も同じ
  deck: '#56805A', // コートの周りの緑（GroundsBuilder の屋上の面 surfaceHex と同じ。空中写真 #627d66）
  strip: '#959A96', // 北西の縁の帯（空中写真の明るい灰 #acb0ac と濃い列 #666b68 の間。推定）
  screen: '#A9B8BE', // 半透明の板（映像では空と奥が透けて灰色、イラストでは水色。推定）
} as const;
const SCREEN_OPACITY = 0.6;

interface EdgeFrame {
  a: P2;
  dir: P2;
  /** 輪郭の内側を向く法線 */
  inward: P2;
  length: number;
}

function edgeFrames(polygon: readonly [number, number][]): EdgeFrame[] {
  let area2 = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    if (!p || !q) continue;
    area2 += p[0] * q[1] - q[0] * p[1];
  }
  // (x, z) の面積の符号で内側の向きを決める（+Z が南なので、符号は画面の見た目と逆になる）
  const sign = area2 > 0 ? 1 : -1;
  const out: EdgeFrame[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) continue;
    const dir: P2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    out.push({ a: [a[0], a[1]], dir, inward: [-dir[1] * sign, dir[0] * sign], length });
  }
  return out;
}

export const buildArea43: HeroBuilder = (ctx: HeroBuildContext): HeroBuildResult => {
  const group = new THREE.Group();
  group.name = 'area4-3-hero';
  const frame = new THREE.Group();
  frame.name = 'area4-3-frame';
  frame.position.set(ORIGIN[0], 0, ORIGIN[1]);
  frame.rotation.y = FRAME_ROT_Y;
  group.add(frame);

  const polygon = ctx.building.polygon;
  const floorY = ctx.groundVisualY;
  const bottomY = minGroundUnder(ctx, polygon) - FOOTING_BELOW_LOWEST_GROUND_M;
  const deckY = floorY + AREA43_ROOF_DECK_M;
  const parapetTopY = deckY + PARAPET_M;
  const screenTopY = floorY + AREA43_SCREEN_TOP_M;

  // --- 材質（白い部分は 1 つの材質にまとめ、描画命令を 1 回にする） ---
  const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.8, metalness: 0.03 });
  const deckMat = new THREE.MeshStandardMaterial({ color: COLORS.deck, roughness: 0.9, metalness: 0.0 });
  const stripMat = new THREE.MeshStandardMaterial({ color: COLORS.strip, roughness: 0.88, metalness: 0.02 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: COLORS.screen,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: SCREEN_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const addWhite = (mesh: THREE.Mesh, name: string): void => {
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  // --- 1. 箱（輪郭どおり。蓋＝屋上の緑の面、側面＝白い外壁） ---
  const body = new THREE.Mesh(extrudePolygonXZ(polygon, bottomY, deckY - bottomY), [deckMat, wallMat]);
  addWhite(body, 'area4-3-body');

  // --- 2. パラペットと囲い（輪郭の辺ごと）。西の角の塊にかかる部分は囲いを付けない ---
  const edges = edgeFrames(polygon);
  const screenPositions: number[] = [];
  const pushQuad = (p0: P2, p1: P2, y0: number, y1: number): void => {
    screenPositions.push(p0[0], y0, p0[1], p1[0], y0, p1[1], p1[0], y1, p1[1]);
    screenPositions.push(p0[0], y0, p0[1], p1[0], y1, p1[1], p0[0], y1, p0[1]);
  };
  edges.forEach((e, i) => {
    const angle = Math.atan2(-e.dir[1], e.dir[0]);
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(e.length, PARAPET_M, PARAPET_THICKNESS_M), wallMat);
    parapet.position.set(
      e.a[0] + (e.dir[0] * e.length) / 2 + (e.inward[0] * PARAPET_THICKNESS_M) / 2,
      deckY + PARAPET_M / 2,
      e.a[1] + (e.dir[1] * e.length) / 2 + (e.inward[1] * PARAPET_THICKNESS_M) / 2,
    );
    parapet.rotation.y = angle;
    addWhite(parapet, `area4-3-parapet-${i}`);

    // 辺の両端のうち西の角に当たる側は、塊の幅だけ囲いを短くする
    const [ua, va] = toUV(e.a[0], e.a[1]);
    const bEnd: P2 = [e.a[0] + e.dir[0] * e.length, e.a[1] + e.dir[1] * e.length];
    const [ub, vb] = toUV(bEnd[0], bEnd[1]);
    const alongU = Math.abs(e.dir[0] * AXIS_U[0] + e.dir[1] * AXIS_U[1]) > 0.7;
    const cut = alongU ? AREA43_CORNER_BLOCK.u1 : AREA43_CORNER_BLOCK.v1;
    // 囲いは外の面から SCREEN_INSET_M 内側の線の上。角では隣の辺の囲いとその線の上で出会う
    const off = SCREEN_INSET_M;
    let t0 = off;
    let t1 = e.length - off;
    if (Math.hypot(ua, va) < 1.0) t0 = cut;
    if (Math.hypot(ub, vb) < 1.0) t1 = e.length - cut;
    if (t1 - t0 < 1) return;

    const at = (t: number): P2 => [
      e.a[0] + e.dir[0] * t + e.inward[0] * off,
      e.a[1] + e.dir[1] * t + e.inward[1] * off,
    ];
    pushQuad(at(t0), at(t1), parapetTopY, screenTopY);

    // 枠: 縦の材（約 4.3m 間隔）と、下・中・上の横の材
    const segLen = t1 - t0;
    const bays = Math.max(1, Math.round(segLen / MULLION_PITCH_M));
    for (let k = 0; k <= bays; k++) {
      const p = at(t0 + (segLen * k) / bays);
      const post = new THREE.Mesh(new THREE.BoxGeometry(FRAME_BAR_M, SCREEN_M, FRAME_BAR_M), wallMat);
      post.position.set(p[0], (parapetTopY + screenTopY) / 2, p[1]);
      post.rotation.y = angle;
      addWhite(post, `area4-3-screen-post-${i}-${k}`);
    }
    const mid = at((t0 + t1) / 2);
    for (const [k, y] of [parapetTopY, (parapetTopY + screenTopY) / 2, screenTopY - FRAME_BAR_M / 2].entries()) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(segLen, FRAME_BAR_M, FRAME_BAR_M), wallMat);
      rail.position.set(mid[0], y, mid[1]);
      rail.rotation.y = angle;
      addWhite(rail, `area4-3-screen-rail-${i}-${k}`);
    }
  });

  const screenGeo = new THREE.BufferGeometry();
  screenGeo.setAttribute('position', new THREE.Float32BufferAttribute(screenPositions, 3));
  screenGeo.computeVertexNormals();
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.name = 'area4-3-screen';
  screen.renderOrder = 1;
  group.add(screen);

  // --- 3. 西の角の白い塊（屋上から囲いの上端まで） ---
  const cb = AREA43_CORNER_BLOCK;
  const cornerBlock = new THREE.Mesh(new THREE.BoxGeometry(cb.u1 - cb.u0, screenTopY - deckY, cb.v1 - cb.v0), wallMat);
  cornerBlock.position.set((cb.u0 + cb.u1) / 2, (deckY + screenTopY) / 2, (cb.v0 + cb.v1) / 2);
  cornerBlock.name = 'area4-3-corner-block';
  cornerBlock.castShadow = true;
  cornerBlock.receiveShadow = true;
  frame.add(cornerBlock);

  // --- 4. 北西の縁の灰色の帯（パラペットの内側から v 5.8 まで） ---
  const st = AREA43_STRIP;
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(st.u1 - st.u0, STRIP_THICK_M, st.v1 - PARAPET_THICKNESS_M),
    stripMat,
  );
  strip.position.set((st.u0 + st.u1) / 2, deckY + STRIP_THICK_M / 2, (PARAPET_THICKNESS_M + st.v1) / 2);
  strip.name = 'area4-3-strip';
  strip.receiveShadow = true;
  frame.add(strip);

  return {
    group,
    primaryMaterials: [
      { mat: wallMat, baseHex: COLORS.wall },
      { mat: deckMat, baseHex: COLORS.deck },
    ],
    animated: [],
  };
};
