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
 * - Commons の Kansai_University_IT_Center.jpg（CC0、2010-04-13。北西の道から入口の面を撮ったもの）:
 *   太い丸柱が 2 層分の高さで円の上の階を支え、柱の間にガラスの箱（多角形に折れる 2 段）。
 *   柱は上の階の縁のすぐ内側に立つ（隣り合う 2 本の間隔 264px に対して太さ 40〜44px、上の階の高さ 233px）。
 *   上の階は灰色の曲面の壁: 上端に厚い軒の帯（約 1.25m）、その下に区画をまたいで続く横長の窓の帯（高さ 約 0.4m、白い枠）、
 *   柱の真上に付け柱（幅 約 0.45m）と、その両脇に白い枠の縦長窓（幅 約 0.85m）。下端は丸い帯（約 0.8m）
 *   左端に写るガラスの塔（白い床の帯で区切られる）は、位置（入口の面から見て左＝北）から北の張り出し（エレベーターの棟）と判断した
 * - Kansai_University_6.JPG（CC BY 3.0）: 1 階の入口。ガラス戸の上に白い帯、その上がガラスの箱（すりガラスと暗い腰板）
 * - 第2学舎4号館の写真の右端: 上の階の下端は丸く張り出す厚い帯で、柱はその縁のすぐ内側に立つ
 * - 航空写真（refs/aerial のタイル、ズーム 18）: 円の屋根は灰色で縁が明るい（緑の縁は写っていない）。
 *   中央に明るい四角（約 17.5×18.8m）。北の張り出しは明るい灰色の屋根
 * - 学生相談・支援センターのバリアフリーマップ: エレベーターは円から突き出た部分。多機能トイレは 1 階と 4 階
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
/**
 * 上の階の縦の割り付け（写真の上の階 233px のうち、軒の帯 51px・壁 146px・下端の丸い帯 32px）:
 * 下端の丸い帯 0.8m・壁 3.75m・軒の帯 1.25m（軒は 0.85m の帯と、その上に少し出る 0.4m の笠木）
 */
const LIP_TOP = 7.8;
const FASCIA_BOTTOM = 11.55;
const COPING_BOTTOM = 12.4;
const DRUM_TOP = 12.8;

const COLUMN_COUNT = 16;
/**
 * 柱の中心の半径。写真では柱は上の階の縁のすぐ内側に立ち、下の丸い帯の出は柱の太さの半分ほど。
 * 柱の外の面（17.35 + 0.6 = 17.95m）から縁（18.43m）までの出は約 0.5m。柱の間隔は約 6.8m
 */
const COLUMN_RING_R = 17.35;
/**
 * エンタシス（半径 m）: 根元 0.56、下から 1/3 で 0.6、頂部 0.55。写真の太さは 隣の柱との間隔の 0.16 倍・
 * 上の階の高さの 0.18 倍（どちらも約 1.05〜1.1m）。それより細くならないよう、頂部も細めない
 */
const COLUMN_PROFILE: readonly Pt[] = [
  [0.56, 0],
  [0.6, 0.33],
  [0.59, 0.66],
  [0.55, 1],
];
/** ガラスの箱の角（柱の角度）は柱の内側の面のすぐ内側。1 階のロビーは奥まる */
const LOBBY_R = 14.0;
const BOX_LOWER_R = 16.7;
const BOX_UPPER_R = 16.4;
const DRUM_WALL_R = R - 0.35;
const FASCIA_R = R - 0.15;
const COPING_R = R - 0.02;

/**
 * 屋上中央の四角い盛り上がり（航空写真の明るさの断面で測った値）。
 * - 大きさ: 明るい平らな面が 東西 約 17.5m（z=124〜132 の 4 本の断面）・南北 約 18.8m（x=31〜41 の 3 本）。
 *   中心は航空写真の屋根の円の中心とほぼ一致（ずれ 0.5m 以内）するので、円の中心に置く
 * - 向き: 北の辺は東へ 10m で南へ約 1.7m、西の辺は南へ 12m で西へ約 1.5m ずれる → 時計回りに約 9°
 * - 高さ: 地上の写真（北西の道から）では上の階の縁の上に何も見えない。四角の北西の角は縁から約 6m 奥にあり、
 *   目の高さからの見通しでは 1.7m を超えると角がのぞくので、1.2m にとどめる（航空写真の北と西の暗い帯は高さの根拠にしない）
 */
const ROOF_BLOCK_W = 17.5;
const ROOF_BLOCK_D = 18.8;
const ROOF_BLOCK_H = 1.2;
const ROOF_BLOCK_ROT = (9 * Math.PI) / 180;

/**
 * 北の張り出し（エレベーターの棟）。写真の左端のガラスの塔は、上端が上の階の下から 3 割ほどの高さ
 * （上の階の正面の縮尺 40px/m と、張り出しの手前の角が正面より約 5% 遠いことから 地面から約 9.1m）で、
 * 白い床の帯が 2 本（約 3.5m・6.2m）。上の階の下面（7.0m）より高く、エレベーターが上の階まで行くことと合う
 */
const ANNEX_TOP = 9.1;
const ANNEX_SLAB_TOPS = [3.5, 6.2] as const;
const ANNEX_SLAB_H = 0.35;
/** 床の帯をガラスの面から外へ出す倍率（輪郭の重心から。張り出しは 9m 角なので約 0.1m） */
const ANNEX_SLAB_SCALE = 1.025;

/**
 * 上の階の色。Commons の観察は #AAA6A4（日の当たる正面）だが、場面の日は南西から当たるので、写真の正面（北西）は
 * 半ば陰になり、その色をそのまま使うと暗い茶灰色に沈んだ（2 回目のレビュー「上のドラムが暗い」）。
 * 陰の面でも写真の明るい灰色に見えるよう、地の色を明るく、わずかに青みに寄せる（暖色の空の光で茶色に寄るのを打ち消す）。
 * 日の当たる南西の面は写真の観察の色に近い明るい灰色になる。自己発光は選択の光らせ方が上書きするので使わない
 */
const COLORS = {
  drum: '#D4D3D4',
  /** 上の階の壁（テクスチャの壁の明るさ #E2 を掛けて drum の色に近くなる値。白い窓枠と付け柱はこの色で出る） */
  drumWall: '#F4F5F8',
  column: '#C3BEB6',
  roof: '#9C9B95',
  roofBlock: '#BDB5AC',
  /** 1 階のロビーのガラス（Node の無地の代わり。ブラウザでは白い枠と戸の模様を描く） */
  lobbyGlass: '#5E6A75',
  /** ロビーの室内の明かり（上の階の陰で日も空の光も届かず、黒い帯に見えたので、ごく弱い自己発光で持ち上げる） */
  lobbyGlow: '#22272C',
  boxGlass: '#6F7E8A',
  /** 上の段のガラス（写真では木と空を映す中くらいの灰青。前の #46525E は陰で黒い帯に見えた） */
  boxUpperGlass: '#5C6874',
  /** 下の段の腰板（Kansai_University_6.JPG で暗い灰色のすりガラス。陰で黒く潰れないよう少し明るく） */
  spandrel: '#4C5660',
  frame: '#E8E7E2',
  annexGlass: '#A3B0BA',
  annexRoof: '#8A9396',
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
 * 上の階の灰色の壁（material.color に掛け合わせる明暗）。1 区画 = 柱 1 本分（約 7.1m × 3.75m、27px/m）。
 * IT_Center.jpg の正面の区画: 両端（柱の真上）に付け柱、壁の上端に区画をまたいで続く横長の窓の帯（白い枠と方立て）、
 * 付け柱の両脇に、帯の高さから下へ伸びる白い枠の縦長窓。ガラスは空を映して壁より少し暗い灰青（黒くはない）
 */
function createDrumTexture(): THREE.CanvasTexture | null {
  const w = 192;
  const h = 100;
  const glass = '#A0ADBA';
  const frame = '#FFFFFF';
  /** 横長の窓の帯（上端から 2px 下、高さ 12px ≒ 0.45m）と縦長窓（幅 23px ≒ 0.85m、高さ 70px ≒ 2.6m） */
  const bandTop = 2;
  const bandH = 12;
  const tallW = 23;
  const tallH = 70;
  const tallInset = 9;
  return makeCanvasTexture(w, h, COLUMN_COUNT, (g) => {
    g.fillStyle = '#E2E2E2';
    g.fillRect(0, 0, w, h);
    // 付け柱（幅 12px ≒ 0.45m を区画の両端に半分ずつ）と、その脇の陰の線
    g.fillStyle = frame;
    g.fillRect(0, 0, 6, h);
    g.fillRect(w - 6, 0, 6, h);
    g.fillStyle = '#C4C4C4';
    g.fillRect(6, 0, 1, h);
    g.fillRect(w - 7, 0, 1, h);
    // 横長の窓の帯（縦長窓の間をつなぐ）
    const bandX0 = tallInset + tallW;
    const bandX1 = w - tallInset - tallW;
    g.fillStyle = frame;
    g.fillRect(bandX0, bandTop, bandX1 - bandX0, bandH);
    g.fillStyle = glass;
    g.fillRect(bandX0, bandTop + 2, bandX1 - bandX0, bandH - 4);
    g.fillStyle = frame;
    for (let x = bandX0 + 30; x < bandX1 - 8; x += 32) g.fillRect(x, bandTop + 2, 2, bandH - 4);
    // 付け柱の両脇の縦長窓（上の段は帯と同じ高さ。帯の下端の高さに横の桟）
    for (const x0 of [tallInset, w - tallInset - tallW]) {
      g.fillStyle = frame;
      g.fillRect(x0, bandTop, tallW, tallH);
      g.fillStyle = glass;
      g.fillRect(x0 + 2, bandTop + 2, tallW - 4, tallH - 4);
      g.fillStyle = frame;
      g.fillRect(x0 + 2, bandTop + bandH - 2, tallW - 4, 2);
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

/**
 * 1 階のロビーのガラス（Kansai_University_6.JPG: 白い枠の大きなガラスと両開きの戸、上に白い無目、
 * ガラスの奥に明るい室内）。1 区画 = 柱の間の 1 面（約 5.5m）。黒い帯に見えないよう、ガラスは室内の明るさを描く
 */
function createLobbyTexture(): THREE.CanvasTexture | null {
  const w = 64;
  const h = 32;
  return makeCanvasTexture(w, h, COLUMN_COUNT, (g) => {
    const glass = g.createLinearGradient(0, 0, 0, h);
    glass.addColorStop(0, '#8A939B');
    glass.addColorStop(0.55, '#6C7782');
    glass.addColorStop(1, '#4A535C');
    g.fillStyle = glass;
    g.fillRect(0, 0, w, h);
    g.fillStyle = COLORS.frame;
    // 上の無目と、足元の框
    g.fillRect(0, 0, w, 4);
    g.fillRect(0, h - 2, w, 2);
    // 方立て（1 区画に 4 枚。戸の高さに横の桟）
    for (const x of [0, 16, 32, 48, w - 2]) g.fillRect(x, 0, 2, h);
    g.fillRect(0, 9, w, 1);
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
  const drumWallHex = drumTex ? COLORS.drumWall : COLORS.drum;
  const drumWallMat = new THREE.MeshStandardMaterial({
    color: drumWallHex,
    map: drumTex,
    roughness: 0.86,
    metalness: 0.02,
  });
  const drumMat = new THREE.MeshStandardMaterial({ color: COLORS.drum, roughness: 0.86, metalness: 0.02 });
  const columnMat = new THREE.MeshStandardMaterial({ color: COLORS.column, roughness: 0.9, metalness: 0.02 });
  const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.92, metalness: 0.02 });
  const roofBlockMat = new THREE.MeshStandardMaterial({ color: COLORS.roofBlock, roughness: 0.9, metalness: 0.02 });
  const frameMat = new THREE.MeshStandardMaterial({ color: COLORS.frame, roughness: 0.8, metalness: 0.02 });
  const annexGlassMat = new THREE.MeshStandardMaterial({ color: COLORS.annexGlass, roughness: 0.4, metalness: 0.05 });
  const lobbyTex = createLobbyTexture();
  const lobbyMat = new THREE.MeshStandardMaterial({
    color: lobbyTex ? '#FFFFFF' : COLORS.lobbyGlass,
    map: lobbyTex,
    emissive: COLORS.lobbyGlow,
    roughness: 0.35,
    metalness: 0.05,
  });
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

  // ── 上の階: 下面（ピロティの天井）と下端の丸い帯（壁から 0.35m、柱の外の面から 0.5m 出る） ──
  const lipProfile = [
    new THREE.Vector2(0.01, PILOTI_TOP),
    new THREE.Vector2(R - 0.45, PILOTI_TOP),
    new THREE.Vector2(R - 0.12, PILOTI_TOP + 0.1),
    new THREE.Vector2(R, PILOTI_TOP + 0.38),
    new THREE.Vector2(R - 0.04, LIP_TOP - 0.1),
    new THREE.Vector2(R - 0.15, LIP_TOP),
    new THREE.Vector2(DRUM_WALL_R, LIP_TOP),
  ];
  const lip = new THREE.Mesh(new THREE.LatheGeometry(lipProfile, 96), drumMat);
  lip.name = 'enshinkan-drum-lip';
  lip.position.set(CX, baseY, CZ);
  lip.castShadow = true;
  lip.receiveShadow = true;
  group.add(lip);

  // 灰色の曲面の壁（付け柱が柱の真上に来るよう、テクスチャの区画の端を柱の角度にそろえる）
  addCylinder('enshinkan-drum-wall', DRUM_WALL_R, baseY + LIP_TOP, baseY + FASCIA_BOTTOM, drumWallMat, {
    segments: 96,
    open: true,
    thetaStart: theta0,
    shadow: true,
  });
  // 上端の厚い軒の帯と、その上に少し出る笠木（どちらも壁と同じ灰色。写真・航空写真に緑の縁は無い）
  addCylinder('enshinkan-fascia', FASCIA_R, baseY + FASCIA_BOTTOM, baseY + COPING_BOTTOM, drumMat, {
    segments: 96,
    shadow: true,
  });
  addCylinder('enshinkan-coping', COPING_R, baseY + COPING_BOTTOM, baseY + DRUM_TOP, drumMat, {
    segments: 96,
    shadow: true,
  });
  // 屋根（航空写真では縁が明るく、内側が灰色。笠木の上面が縁の明るい輪になる）
  addCylinder('enshinkan-roof', R - 0.5, baseY + DRUM_TOP, baseY + DRUM_TOP + 0.06, roofMat, { segments: 96 });

  // 屋上中央の四角い低い盛り上がり（航空写真）
  const block = new THREE.Mesh(new THREE.BoxGeometry(ROOF_BLOCK_W, ROOF_BLOCK_H, ROOF_BLOCK_D), roofBlockMat);
  block.name = 'enshinkan-roof-block';
  block.position.set(CX, baseY + DRUM_TOP + ROOF_BLOCK_H / 2, CZ);
  // rotation.y = -α で、局所の +X（東）が +Z（南）の側へ α だけ回る（北を上にした地図で時計回り）
  block.rotation.y = -ROOF_BLOCK_ROT;
  block.castShadow = true;
  block.receiveShadow = true;
  group.add(block);

  // ── 北の張り出し（輪郭の四角、エレベーターの棟）。写真の左端のガラスの塔: 上端は上の階の下面より高く、白い床の帯が 2 本 ──
  if (annex) {
    const annexBottom = minGroundUnder(ctx, annex) - 0.5;
    const annexMesh = new THREE.Mesh(
      extrudePolygonXZ(annex, annexBottom, baseY + ANNEX_TOP - annexBottom),
      [annexRoofMat, annexGlassMat],
    );
    annexMesh.name = 'enshinkan-annex';
    annexMesh.castShadow = true;
    annexMesh.receiveShadow = true;
    group.add(annexMesh);

    const acx = annex.reduce((s, p) => s + p[0], 0) / annex.length;
    const acz = annex.reduce((s, p) => s + p[1], 0) / annex.length;
    const slabOutline: Pt[] = annex.map(([x, z]) => [
      acx + (x - acx) * ANNEX_SLAB_SCALE,
      acz + (z - acz) * ANNEX_SLAB_SCALE,
    ]);
    // 最上部の帯は屋根の面より少し下で止める（帯の上面が屋根を覆わず、屋根のまわりの白い縁になる）
    const slabTops = [...ANNEX_SLAB_TOPS, ANNEX_TOP - 0.05];
    slabTops.forEach((top, i) => {
      const slab = new THREE.Mesh(
        extrudePolygonXZ(slabOutline, baseY + top - ANNEX_SLAB_H, ANNEX_SLAB_H),
        frameMat,
      );
      slab.name = `enshinkan-annex-slab-${i}`;
      slab.receiveShadow = true;
      group.add(slab);
    });
  }

  return {
    group,
    primaryMaterials: [
      { mat: drumWallMat, baseHex: drumWallHex },
      { mat: drumMat, baseHex: COLORS.drum },
      { mat: columnMat, baseHex: COLORS.column },
    ],
    animated: [],
  };
};
