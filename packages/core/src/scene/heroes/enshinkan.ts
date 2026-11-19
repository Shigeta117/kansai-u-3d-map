import * as THREE from 'three';
import { extrudePolygonXZ, minGroundUnder } from './shared';
import type { HeroBuilder } from './types';

type Pt = [number, number];

/**
 * ITセンター（円神館）の専用モデル。
 *
 * 根拠にしたもの:
 * - 公式の記事: 村野藤吾の設計。16 本の円柱に支えられた円形の建物。もとは専門図書館で、いまは ITセンター。
 *   年史の村野建築のコース: 円柱はエンタシスつきで掻き落とし仕上げ、1 階はピロティ、円形部分から吊り下げたガラスの箱の事務室
 * - Commons の Kansai_University_IT_Center.jpg（CC0、2010-04-13）: 正面。太い丸柱が 2 層分の高さで円の上の階を支え、
 *   柱の間にガラスの箱（多角形に折れる 2 段）、上は灰色の曲面の壁（柱の上に縦の付け柱、その両脇に縦長窓、上端に小窓の列）、
 *   屋根の縁は緑青色の細い線。柱（地面〜上の階の下面）：上の階 ≒ 315px：240px
 * - Kansai_University_6.JPG（CC BY 3.0）: 1 階の入口。ガラス戸の上に白い帯、その上がガラスの箱（すりガラスと暗い腰板）
 * - 第2学舎4号館の写真の右端: 上の階の下端は丸く張り出す厚い帯で、柱はその縁より内側に立つ
 * - 航空写真（refs/aerial のタイル、ズーム 18）: 円の屋根は灰色で、中央に明るい四角（約 17×19m、北と西に影 → 低く盛り上がる）。
 *   北の張り出し（輪郭の四角）は暗い灰色の屋根
 *
 * 公式資料にも写真にも無い「青・緑・黄のモザイクの帯」は作らない。看板の文字・校章も描かない
 */

/** OSM の輪郭（way 423067230）の円弧 17 点に当てはめた円。各点のずれは 0.4m 以内 */
const CX = 35.57;
const CZ = 123.6;
const R = 18.43;
/** 円から外れる点（北の張り出し）とみなす、半径からのはみ出し (m) */
const OFF_CIRCLE_M = 1.5;

/** 高さ（円の中心の地面から, m）。柱：上の階 ≒ 315：240 を、遠近の縮みを見込んで 7.0：5.8 にする（計 12.8m = OSM） */
const PILOTI_TOP = 7.0;
/** 1 階のロビー（奥まった暗いガラス）と、吊られたガラスの箱の 2 段の境目 */
const LOBBY_TOP = 2.8;
const BOX_MID = 4.9;
/** 上の階: 下端の丸い帯（張り出し）・灰色の壁・緑青の縁 */
const LIP_TOP = 8.4;
const CORNICE_BOTTOM = 12.45;
const DRUM_TOP = 12.8;

const COLUMN_COUNT = 16;
/** 柱の中心の半径。写真では上の階の縁より 2m ほど内側。柱の間隔は約 6.4m */
const COLUMN_RING_R = 16.2;
/** エンタシス: 根元 0.55、下から 1/3 で 0.6、頂部 0.48（半径 m）。写真の太さ：高さ ≒ 1：6.5 */
const COLUMN_PROFILE: readonly Pt[] = [
  [0.55, 0],
  [0.6, 0.33],
  [0.57, 0.66],
  [0.48, 1],
];
const LOBBY_R = 13.0;
const BOX_LOWER_R = 15.2;
const BOX_UPPER_R = 14.6;
const DRUM_WALL_R = R - 0.48;
const CORNICE_R = R - 0.25;

/**
 * 屋上中央の四角い盛り上がり（航空写真の明るさの断面で測った値）。
 * - 大きさ: 東西 約 17.2m・南北 約 18.7m。中心は航空写真の屋根の円の中心とほぼ一致（ずれ 0.6m 以内）するので、円の中心に置く
 * - 向き: 東西の辺は南へ 12m で西へ約 2m、南北の辺は東へ 10m で南へ 1〜2m ずれる → 時計回りに約 9°（北の張り出しの向き 5〜8° に近い）
 * - 高さ: 北側に幅 約 4m・西側に幅 約 3m の暗い帯（影とみると、日の高さ 30°で 2m 強）。
 *   地上の写真では上の階の縁に隠れて見えない（4m 未満なら隠れる）ので矛盾しない。影でなく屋根の汚れの可能性もあり、高さは目安
 */
const ROOF_BLOCK_W = 17.2;
const ROOF_BLOCK_D = 18.7;
const ROOF_BLOCK_H = 2.0;
const ROOF_BLOCK_ROT = (9 * Math.PI) / 180;

const COLORS = {
  drum: '#ADA9A6',
  column: '#C3BEB6',
  roof: '#9C9B95',
  roofBlock: '#BDB5AC',
  verdigris: '#7FA595',
  lobbyGlass: '#2F3843',
  boxGlass: '#6F7E8A',
  boxUpperGlass: '#46525E',
  spandrel: '#36404B',
  frame: '#E8E7E2',
  annexRoof: '#737B7A',
} as const;

const TAU = Math.PI * 2;

/** CanvasTexture を作る。document が無い環境（テスト）では null */
function makeCanvasTexture(
  w: number,
  h: number,
  repeatX: number,
  draw: (g: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return null;
  draw(g);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 上の階の灰色の壁（material.color に掛け合わせる明暗）。1 区画 = 柱 1 本分。
 * 区画の両端（柱の真上）に明るい付け柱、その両脇に縦長窓、上端に小窓の列
 */
function createDrumTexture(): THREE.CanvasTexture | null {
  const w = 128;
  const h = 72;
  return makeCanvasTexture(w, h, COLUMN_COUNT, (g) => {
    g.fillStyle = '#EEEEEE';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, 4, h);
    g.fillRect(w - 4, 0, 4, h);
    g.fillRect(0, h - 4, w, 3);
    g.fillStyle = '#5A646F';
    g.fillRect(8, 20, 13, 40);
    g.fillRect(w - 21, 20, 13, 40);
    for (let x = 30; x + 6 <= w - 30; x += 9) {
      g.fillRect(x, 8, 6, 6);
    }
  });
}

/** 吊られたガラスの箱の下の段（Kansai_University_6.JPG: 白い枠・すりガラス・暗い腰板）。1 区画 = 柱の間の 1 面 */
function createBoxLowerTexture(): THREE.CanvasTexture | null {
  const w = 64;
  const h = 32;
  return makeCanvasTexture(w, h, COLUMN_COUNT, (g) => {
    g.fillStyle = COLORS.boxGlass;
    g.fillRect(0, 0, w, h);
    g.fillStyle = COLORS.spandrel;
    g.fillRect(0, 20, w, 9);
    g.fillStyle = COLORS.frame;
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, h - 3, w, 3);
    g.fillRect(0, 18, w, 2);
    for (const x of [0, 21, 42, w - 2]) g.fillRect(x, 0, 2, h);
  });
}

/** ガラスの箱の上の段（暗いガラスに白い縦枠、下端に白い梁） */
function createBoxUpperTexture(): THREE.CanvasTexture | null {
  const w = 64;
  const h = 32;
  return makeCanvasTexture(w, h, COLUMN_COUNT, (g) => {
    g.fillStyle = COLORS.boxUpperGlass;
    g.fillRect(0, 0, w, h);
    g.fillStyle = COLORS.frame;
    g.fillRect(0, h - 4, w, 4);
    for (const x of [0, 16, 32, 48, w - 2]) g.fillRect(x, 0, 2, h);
  });
}

/** 角度 φ（atan2(z, x)）を CylinderGeometry / LatheGeometry の θ（x = sinθ, z = cosθ）に直す */
function phiToTheta(phi: number): number {
  return Math.PI / 2 - phi;
}

/** 輪郭から、円に乗らない点の連なり（北の張り出し）を、両隣の円の上の点つきで取り出す */
function findAnnex(polygon: readonly Pt[]): Pt[] | null {
  const n = polygon.length;
  const off = polygon.map(([x, z]) => Math.hypot(x - CX, z - CZ) > R + OFF_CIRCLE_M);
  let first = -1;
  for (let i = 0; i < n; i++) {
    if (off[i] && !off[(i - 1 + n) % n]) {
      first = i;
      break;
    }
  }
  if (first < 0) return null;
  const out: Pt[] = [];
  const prev = polygon[(first - 1 + n) % n];
  if (prev) out.push([prev[0], prev[1]]);
  for (let k = 0; k < n; k++) {
    const idx = (first + k) % n;
    const p = polygon[idx];
    if (!p) continue;
    out.push([p[0], p[1]]);
    if (!off[idx]) break;
  }
  return out.length >= 3 ? out : null;
}

export const buildEnshinkan: HeroBuilder = (ctx) => {
  const group = new THREE.Group();
  group.name = 'enshinkan';
  const polygon = ctx.building.polygon;
  const baseY = ctx.sampleGroundVisualY(CX, CZ);
  const bottom = minGroundUnder(ctx, polygon) - 0.5;
  const annex = findAnnex(polygon);

  // 柱の並びの基準: 北の張り出しの向きを挟んで左右対称に 16 本
  let annexPhi = -Math.PI / 2;
  if (annex) {
    const ax = annex.reduce((s, p) => s + p[0], 0) / annex.length;
    const az = annex.reduce((s, p) => s + p[1], 0) / annex.length;
    annexPhi = Math.atan2(az - CZ, ax - CX);
  }
  const phi0 = annexPhi + Math.PI / COLUMN_COUNT;
  const columnPhis = Array.from({ length: COLUMN_COUNT }, (_, k) => phi0 + (k * TAU) / COLUMN_COUNT);
  const theta0 = phiToTheta(phi0);

  const drumTex = createDrumTexture();
  const drumWallMat = new THREE.MeshStandardMaterial({
    color: COLORS.drum,
    map: drumTex,
    roughness: 0.86,
    metalness: 0.02,
  });
  const drumMat = new THREE.MeshStandardMaterial({ color: COLORS.drum, roughness: 0.86, metalness: 0.02 });
  const columnMat = new THREE.MeshStandardMaterial({ color: COLORS.column, roughness: 0.9, metalness: 0.02 });
  const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.92, metalness: 0.02 });
  const roofBlockMat = new THREE.MeshStandardMaterial({ color: COLORS.roofBlock, roughness: 0.9, metalness: 0.02 });
  const verdigrisMat = new THREE.MeshStandardMaterial({ color: COLORS.verdigris, roughness: 0.7, metalness: 0.08 });
  const lobbyMat = new THREE.MeshStandardMaterial({ color: COLORS.lobbyGlass, roughness: 0.35, metalness: 0.05 });
  const boxLowerTex = createBoxLowerTexture();
  const boxLowerMat = new THREE.MeshStandardMaterial({
    color: boxLowerTex ? '#FFFFFF' : COLORS.boxGlass,
    map: boxLowerTex,
    roughness: 0.35,
    metalness: 0.05,
  });
  const boxUpperTex = createBoxUpperTexture();
  const boxUpperMat = new THREE.MeshStandardMaterial({
    color: boxUpperTex ? '#FFFFFF' : COLORS.boxUpperGlass,
    map: boxUpperTex,
    roughness: 0.35,
    metalness: 0.05,
  });
  const annexRoofMat = new THREE.MeshStandardMaterial({ color: COLORS.annexRoof, roughness: 0.9, metalness: 0.02 });

  const addCylinder = (
    name: string,
    radius: number,
    y0: number,
    y1: number,
    mat: THREE.Material,
    opts: { segments?: number; open?: boolean; thetaStart?: number; shadow?: boolean } = {},
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, y1 - y0, opts.segments ?? 72, 1, opts.open ?? false, opts.thetaStart ?? 0),
      mat,
    );
    mesh.name = name;
    mesh.position.set(CX, (y0 + y1) / 2, CZ);
    mesh.castShadow = opts.shadow ?? false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // ── 1 階・2 階: ピロティの奥のロビーと、吊られたガラスの箱（柱の間で折れる 16 面） ──
  addCylinder('enshinkan-lobby', LOBBY_R, bottom, baseY + LOBBY_TOP, lobbyMat, {
    segments: COLUMN_COUNT,
    thetaStart: theta0,
  });
  addCylinder('enshinkan-glass-lower', BOX_LOWER_R, baseY + LOBBY_TOP, baseY + BOX_MID, boxLowerMat, {
    segments: COLUMN_COUNT,
    thetaStart: theta0,
  });
  addCylinder('enshinkan-glass-upper', BOX_UPPER_R, baseY + BOX_MID, baseY + PILOTI_TOP, boxUpperMat, {
    segments: COLUMN_COUNT,
    thetaStart: theta0,
  });

  // ── 16 本の円柱（エンタシス。地面の 0.5m 下から上の階の下面まで） ──
  const columnGeo = new THREE.LatheGeometry(
    COLUMN_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
    14,
  );
  const columns = new THREE.InstancedMesh(columnGeo, columnMat, COLUMN_COUNT);
  columns.name = 'enshinkan-columns';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  columnPhis.forEach((phi, i) => {
    const x = CX + Math.cos(phi) * COLUMN_RING_R;
    const z = CZ + Math.sin(phi) * COLUMN_RING_R;
    const colBottom = ctx.sampleGroundVisualY(x, z) - 0.5;
    m.compose(new THREE.Vector3(x, colBottom, z), q, new THREE.Vector3(1, baseY + PILOTI_TOP - colBottom, 1));
    columns.setMatrixAt(i, m);
  });
  columns.instanceMatrix.needsUpdate = true;
  columns.receiveShadow = true;
  group.add(columns);

  // ── 上の階: 下面（ピロティの天井）と下端の丸く張り出す帯 ──
  const lipProfile = [
    new THREE.Vector2(0.01, PILOTI_TOP),
    new THREE.Vector2(R - 0.6, PILOTI_TOP),
    new THREE.Vector2(R - 0.15, PILOTI_TOP + 0.15),
    new THREE.Vector2(R, PILOTI_TOP + 0.55),
    new THREE.Vector2(R, LIP_TOP - 0.1),
    new THREE.Vector2(R - 0.1, LIP_TOP),
    new THREE.Vector2(DRUM_WALL_R, LIP_TOP),
  ];
  const lip = new THREE.Mesh(new THREE.LatheGeometry(lipProfile, 96), drumMat);
  lip.name = 'enshinkan-drum-lip';
  lip.position.set(CX, baseY, CZ);
  lip.castShadow = true;
  lip.receiveShadow = true;
  group.add(lip);

  // 灰色の曲面の壁（付け柱が柱の真上に来るよう、テクスチャの区画の端を柱の角度にそろえる）
  addCylinder('enshinkan-drum-wall', DRUM_WALL_R, baseY + LIP_TOP, baseY + CORNICE_BOTTOM, drumWallMat, {
    segments: 96,
    open: true,
    thetaStart: theta0,
    shadow: true,
  });
  // 緑青色の細い縁と屋根（灰色。縁の上面が 0.25m ほど見える）
  addCylinder('enshinkan-cornice', CORNICE_R, baseY + CORNICE_BOTTOM, baseY + DRUM_TOP, verdigrisMat, {
    segments: 96,
    shadow: true,
  });
  addCylinder('enshinkan-roof', R - 0.5, baseY + DRUM_TOP, baseY + DRUM_TOP + 0.06, roofMat, { segments: 96 });

  // 屋上中央の四角い盛り上がり（航空写真）
  const block = new THREE.Mesh(new THREE.BoxGeometry(ROOF_BLOCK_W, ROOF_BLOCK_H, ROOF_BLOCK_D), roofBlockMat);
  block.name = 'enshinkan-roof-block';
  block.position.set(CX, baseY + DRUM_TOP + ROOF_BLOCK_H / 2, CZ);
  // rotation.y = -α で、局所の +X（東）が +Z（南）の側へ α だけ回る（北を上にした地図で時計回り）
  block.rotation.y = -ROOF_BLOCK_ROT;
  block.castShadow = true;
  block.receiveShadow = true;
  group.add(block);

  // ── 北の張り出し（輪郭の四角）。写真が無いので無地の箱。航空写真で円の屋根の縁が切れずに続くので、上の階の下面までの高さにする ──
  if (annex) {
    const annexBottom = minGroundUnder(ctx, annex) - 0.5;
    const annexMesh = new THREE.Mesh(
      extrudePolygonXZ(annex, annexBottom, baseY + PILOTI_TOP - annexBottom),
      [annexRoofMat, drumMat],
    );
    annexMesh.name = 'enshinkan-annex';
    annexMesh.castShadow = true;
    annexMesh.receiveShadow = true;
    group.add(annexMesh);
  }

  return {
    group,
    primaryMaterials: [
      { mat: drumWallMat, baseHex: COLORS.drum },
      { mat: drumMat, baseHex: COLORS.drum },
      { mat: columnMat, baseHex: COLORS.column },
    ],
    animated: [],
  };
};
