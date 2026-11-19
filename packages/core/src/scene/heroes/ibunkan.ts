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

const BRICK_HEX = '#B4623F';
const SLATE_HEX = '#4A5466';
const ROOF_TOP_HEX = '#7D766B';
const TRIM_HEX = '#DCD8CF';
const DOME_HEX = '#2F4170';
const WINDOW_BAND_HEX = '#5E6873';
const DORMER_HEX = '#E6E3DC';
const EQUIPMENT_HEX = '#AFAEA6';
const TOWER_GLASS_HEX = '#3E4A55';
const DOOR_HEX = '#343C44';
const ANTENNA_HEX = '#D6D6D2';

/** 底を、輪郭の下（と塔の下）のいちばん低い地面からさらに下ろす深さ (m) */
const FOOTING_BELOW_LOWEST_GROUND_M = 0.5;

/**
 * 軒の高さ（重心の地面の表示上の高さから）。公式の地上 4 階と、KansaiUV1.JPG の東の面に窓が 4 段
 * 並ぶことから 4 階分（約 3.4m × 4 + 基壇）とした。buildings.json の 12.8m（3 階）より少し高い
 */
const EAVE_ABOVE_GROUND_M = 14.0;
/**
 * 屋根の帯（濃い青灰のスレート調の低い勾配）の高さと、各辺から平らな面までの水平の幅。
 * 空中写真で東の帯が約 3.5m、西が約 1.8m、南北が約 3m。高さは Ibunkan.jpg の妻面で軒から約 1.5m
 */
const ROOF_RISE_M = 1.6;
const ROOF_INSET_EAST_M = 3.4;
const ROOF_INSET_WEST_M = 1.8;
const ROOF_INSET_END_M = 3.0;
/** 軒の白い見切り（Ibunkan.jpg・KansaiUV1.JPG で軒に白い線） */
const EAVE_FASCIA_HEIGHT_M = 0.35;
const EAVE_FASCIA_OVERHANG_M = 0.25;

/** 屋根の帯の上端に並ぶ白い小箱（KansaiUV1.JPG で窓 2 間ごと、約 6m おき） */
const DORMER_SPACING_M = 6.0;
const DORMER_SIZE_M = 0.9;
const DORMER_HEIGHT_M = 0.8;

/** 東の面の窓の段（細かい窓は描かず、階ごとの色の帯にする） */
const FLOOR_PITCH_M = 3.4;
const WINDOW_BAND_HEIGHT_M = 1.2;
const WINDOW_BAND_TOP_BELOW_EAVE_M = 1.0;
const WINDOW_BAND_COUNT = 4;

/**
 * 八角の塔。空中写真の外径約 8m（笠木の輪）。Ibunkan.jpg の妻面で、屋根の帯の高さとの比から
 * 笠木の下端は軒から約 3.8m、笠木の帯は約 1.5m、ドームは直径約 5.5m・高さ約 2.4m（低い）、
 * アンテナはドームの約 2 倍の高さ
 */
const TOWER_RADIUS_M = 3.75;
const TOWER_CORNICE_RADIUS_M = 4.15;
const TOWER_CORNICE_BOTTOM_ABOVE_EAVE_M = 3.8;
const TOWER_CORNICE_HEIGHT_M = 1.5;
const DOME_RADIUS_M = 2.75;
const DOME_HEIGHT_M = 2.4;
const ANTENNA_HEIGHT_M = 4.2;
/**
 * 塔の中心の位置。空中写真で、北の塔は北の端から約 1.5m、南の塔は南の端から約 2.5m 内側に中心があり、
 * 端の面から 2m ほど張り出す。東の側面は主棟の東の面とほぼそろう
 */
const TOWER_INSET_FROM_END_M = 1.9;
const TOWER_INSET_FROM_EAST_M = 3.5;
/** 塔の各面の縦長窓の列（灰色の枠）。上端は笠木の少し下、下端は軒から 10.5m 下まで */
const TOWER_STRIP_WIDTH_M = 1.0;
const TOWER_STRIP_GLASS_WIDTH_M = 0.55;
const TOWER_STRIP_TOP_ABOVE_EAVE_M = 3.1;
const TOWER_STRIP_BOTTOM_BELOW_EAVE_M = 10.5;

/**
 * 平らな屋根の上の設備の囲い（空中写真で北半分と南半分に 1 つずつ、東寄り）。[s0, s1, t0, t1]
 */
const EQUIPMENT_AREAS: readonly [number, number, number, number][] = [
  [-21, -4, -2, 8],
  [12, 28, -3, 8],
];
const EQUIPMENT_HEIGHT_M = 0.4;

/**
 * 入口。OSM の道が建物に着く点（paths.json）: 東の面の階段 path_490797560 の上端 (-74.9, -52.9)、
 * 東の面の歩道 path_490801256 の端 (-77.3, -35.0)、南の階段 path_490797561 の上端 (-86.9, -2.6)。
 * 南の階段は南東の塔の足元に着くので、塔の南の面に置く
 */
const EAST_ENTRANCES_XZ: readonly [number, number][] = [
  [-74.9, -52.9],
  [-77.3, -35.0],
];
const DOOR_WIDTH_M = 2.4;
const DOOR_HEIGHT_M = 2.8;

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

export const buildIbunkan: HeroBuilder = (ctx) => {
  const polygon = usablePolygon(ctx.building.polygon);
  const frame = frameFromPolygon(polygon);
  const hw = frame.halfWidth;
  const hl = frame.halfLength;

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
  const windowMat = standard(WINDOW_BAND_HEX, 0.55, 0.05);
  const dormerMat = standard(DORMER_HEX, 0.75);
  const equipmentMat = standard(EQUIPMENT_HEX, 0.85);
  const towerGlassMat = standard(TOWER_GLASS_HEX, 0.45, 0.05);
  const doorMat = standard(DOOR_HEX, 0.5, 0.05);
  const antennaMat = standard(ANTENNA_HEX, 0.5, 0.3);

  const eaveY = ctx.groundVisualY + EAVE_ABOVE_GROUND_M;
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
      const [x, z] = toWorld(
        frame,
        tw.s + Math.cos(ang) * TOWER_CORNICE_RADIUS_M,
        tw.t + Math.sin(ang) * TOWER_CORNICE_RADIUS_M,
      );
      bottom = Math.min(bottom, ctx.sampleGroundVisualY(x, z) - FOOTING_BELOW_LOWEST_GROUND_M);
    }
  }

  // 主棟（レンガの箱）
  const bodyHeight = eaveY - bottom;
  const body = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, bodyHeight, hl * 2), brickMat);
  body.position.set(0, bottom + bodyHeight / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  local.add(body);

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

  // 低い勾配の屋根の帯と、上の平らな面
  const roof = new THREE.Mesh(createRoofGeometry(hw, hl), [slateMat, roofTopMat]);
  roof.position.y = eaveY + EAVE_FASCIA_HEIGHT_M - 0.05;
  roof.castShadow = true;
  roof.receiveShadow = true;
  local.add(roof);
  const roofTopY = roof.position.y + ROOF_RISE_M;

  // 屋根の帯の上端に並ぶ白い小箱（東と西の長い辺。塔のある端は外す）
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const dormerLines = [hw - ROOF_INSET_EAST_M, -hw + ROOF_INSET_WEST_M];
  const dormerSpan = hl - TOWER_INSET_FROM_END_M - TOWER_CORNICE_RADIUS_M - 1.0;
  const dormerCountPerLine = Math.max(1, Math.floor((dormerSpan * 2) / DORMER_SPACING_M) + 1);
  const dormerStart = -((dormerCountPerLine - 1) * DORMER_SPACING_M) / 2;
  const dormers = new THREE.InstancedMesh(unitBox, dormerMat, dormerCountPerLine * dormerLines.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let di = 0;
  for (const lineT of dormerLines) {
    for (let i = 0; i < dormerCountPerLine; i++) {
      pos.set(lineT, roofTopY - 0.1 + DORMER_HEIGHT_M / 2, dormerStart + i * DORMER_SPACING_M);
      scl.set(DORMER_SIZE_M, DORMER_HEIGHT_M, DORMER_SIZE_M);
      dormers.setMatrixAt(di++, m.compose(pos, q.identity(), scl));
    }
  }
  dormers.instanceMatrix.needsUpdate = true;
  local.add(dormers);

  // 平らな面の上の設備の囲い
  const equipment = new THREE.InstancedMesh(unitBox, equipmentMat, EQUIPMENT_AREAS.length);
  EQUIPMENT_AREAS.forEach(([s0, s1, t0, t1], i) => {
    const tMax = hw - ROOF_INSET_EAST_M - 0.3;
    const tMin = -hw + ROOF_INSET_WEST_M + 0.3;
    const a = Math.max(t0, tMin);
    const b = Math.min(t1, tMax);
    pos.set((a + b) / 2, roofTopY + EQUIPMENT_HEIGHT_M / 2 - 0.05, (s0 + s1) / 2);
    scl.set(Math.max(0.5, b - a), EQUIPMENT_HEIGHT_M, s1 - s0);
    equipment.setMatrixAt(i, m.compose(pos, q.identity(), scl));
  });
  equipment.instanceMatrix.needsUpdate = true;
  local.add(equipment);

  // 東の面の窓の段（色の帯）。両端の塔の幅を外す
  const bandS0 = -hl + TOWER_INSET_FROM_END_M + TOWER_RADIUS_M + 0.4;
  const bandS1 = hl - TOWER_INSET_FROM_END_M - TOWER_RADIUS_M - 0.4;
  const bands = new THREE.InstancedMesh(unitBox, windowMat, WINDOW_BAND_COUNT);
  for (let k = 0; k < WINDOW_BAND_COUNT; k++) {
    const cy = eaveY - WINDOW_BAND_TOP_BELOW_EAVE_M - WINDOW_BAND_HEIGHT_M / 2 - k * FLOOR_PITCH_M;
    pos.set(hw + 0.04, cy, (bandS0 + bandS1) / 2);
    scl.set(0.1, WINDOW_BAND_HEIGHT_M, bandS1 - bandS0);
    bands.setMatrixAt(k, m.compose(pos, q.identity(), scl));
  }
  bands.instanceMatrix.needsUpdate = true;
  local.add(bands);

  // 八角の塔（2 つ）。平らな面を長手・短手に向けるため 22.5° 回す
  const octagonTurn = Math.PI / 8;
  const corniceBottomY = eaveY + TOWER_CORNICE_BOTTOM_ABOVE_EAVE_M;
  const corniceTopY = corniceBottomY + TOWER_CORNICE_HEIGHT_M;
  const stripTopY = eaveY + TOWER_STRIP_TOP_ABOVE_EAVE_M;
  const stripBottomY = Math.max(bottom, eaveY - TOWER_STRIP_BOTTOM_BELOW_EAVE_M);
  const stripHeight = stripTopY - stripBottomY;
  const flatRadius = TOWER_RADIUS_M * Math.cos(Math.PI / 8);
  const stripCount = towers.length * 8;
  const stripFrames = new THREE.InstancedMesh(unitBox, trimMat, stripCount);
  const stripGlass = new THREE.InstancedMesh(unitBox, towerGlassMat, stripCount);
  // 縦長窓の上の半円のアーチ（灰色）。円柱を倒して上半分だけ使う
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
  const arches = new THREE.InstancedMesh(archGeo, trimMat, stripCount);
  const yAxis = new THREE.Vector3(0, 1, 0);
  let si = 0;
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
    local.add(cornice);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      domeMat,
    );
    dome.scale.set(DOME_RADIUS_M, DOME_HEIGHT_M, DOME_RADIUS_M);
    dome.position.set(tw.t, corniceTopY - 0.2, tw.s);
    dome.castShadow = true;
    local.add(dome);

    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, ANTENNA_HEIGHT_M, 6),
      antennaMat,
    );
    antenna.position.set(
      tw.t,
      corniceTopY - 0.2 + DOME_HEIGHT_M + ANTENNA_HEIGHT_M / 2 - 0.1,
      tw.s,
    );
    local.add(antenna);

    for (let k = 0; k < 8; k++) {
      const phi = (k / 8) * Math.PI * 2;
      const nx = Math.sin(phi);
      const nz = Math.cos(phi);
      q.setFromAxisAngle(yAxis, phi);
      pos.set(
        tw.t + nx * (flatRadius + 0.06),
        stripBottomY + stripHeight / 2,
        tw.s + nz * (flatRadius + 0.06),
      );
      scl.set(TOWER_STRIP_WIDTH_M, stripHeight, 0.12);
      stripFrames.setMatrixAt(si, m.compose(pos, q, scl));
      pos.set(
        tw.t + nx * (flatRadius + 0.1),
        stripBottomY + stripHeight / 2 - 0.2,
        tw.s + nz * (flatRadius + 0.1),
      );
      scl.set(TOWER_STRIP_GLASS_WIDTH_M, stripHeight - 0.8, 0.1);
      stripGlass.setMatrixAt(si, m.compose(pos, q, scl));
      pos.set(tw.t + nx * (flatRadius + 0.06), stripTopY, tw.s + nz * (flatRadius + 0.06));
      scl.set(1, 1, 1);
      arches.setMatrixAt(si, m.compose(pos, q, scl));
      si++;
    }
  }
  stripFrames.instanceMatrix.needsUpdate = true;
  stripGlass.instanceMatrix.needsUpdate = true;
  arches.instanceMatrix.needsUpdate = true;
  local.add(stripFrames, stripGlass, arches);

  // 入口（OSM の道が建物に着く点）。東の面に 2 つ、南東の塔の南の面に 1 つ
  const doors = new THREE.InstancedMesh(unitBox, doorMat, EAST_ENTRANCES_XZ.length + 1);
  let doorIndex = 0;
  for (const [x, z] of EAST_ENTRANCES_XZ) {
    const [s] = toLocal(frame, x, z);
    const sClamped = Math.max(-hl + 2, Math.min(hl - 2, s));
    const [wx, wz] = toWorld(frame, sClamped, hw);
    const gy = ctx.sampleGroundVisualY(wx, wz);
    pos.set(hw + 0.08, gy - 0.3 + (DOOR_HEIGHT_M + 0.3) / 2, sClamped);
    scl.set(0.12, DOOR_HEIGHT_M + 0.3, DOOR_WIDTH_M);
    doors.setMatrixAt(doorIndex++, m.compose(pos, q.identity(), scl));
  }
  const southTower = towers[1];
  if (southTower) {
    const faceS = southTower.s + flatRadius + 0.12;
    const [wx, wz] = toWorld(frame, faceS, southTower.t);
    const gy = ctx.sampleGroundVisualY(wx, wz);
    pos.set(southTower.t, gy - 0.3 + (DOOR_HEIGHT_M + 0.3) / 2, faceS + 0.02);
    scl.set(DOOR_WIDTH_M, DOOR_HEIGHT_M + 0.3, 0.12);
    doors.setMatrixAt(doorIndex++, m.compose(pos, q.identity(), scl));
  }
  doors.count = doorIndex;
  doors.instanceMatrix.needsUpdate = true;
  local.add(doors);

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
