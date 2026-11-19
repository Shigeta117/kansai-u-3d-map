import * as THREE from 'three';
import type { HeroBuilder } from './types';

const COLORS = {
  bridgeStone: '#CFC3A6',
  bridgeJoint: '#BDB092',
  bridgeSoffit: '#A9A6A0',
  emblemRelief: '#B49E72',
  monumentStone: '#C8C2B7',
  planterRim: '#B8B2A6',
  foliage: '#5E8C4E',
  flowerPink: '#D46A7E',
  flagpoleWhite: '#F2F2F0',
  stainless: '#D9DEE2',
  clockFace: '#F5F5F2',
  paving: '#D8D2C6',
} as const;

interface ReedTubeSpec {
  angle: number;
  radius: number;
  points: [number, number][];
  castShadow: boolean;
}

/**
 * Builds a TubeGeometry along a CatmullRomCurve3 and smoothly tapers the upper
 * 40% toward the tip (never to zero radius, avoiding degenerate normals).
 */
function createTaperedReedTubeGeometry(
  curve: THREE.CatmullRomCurve3,
  tubularSegments: number,
  radius: number,
  radialSegments: number,
  tipScale: number,
): THREE.TubeGeometry {
  const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const pos = geo.getAttribute('position');
  if (!pos) return geo;

  const ringStride = radialSegments + 1;
  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    if (u <= 0.6) continue;

    const t = (u - 0.6) / 0.4;
    const smooth = t * t * (3 - 2 * t);
    const scale = 1 - (1 - tipScale) * smooth;

    const ringStart = i * ringStride;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let j = 0; j < radialSegments; j++) {
      const idx = ringStart + j;
      if (idx >= pos.count) break;
      cx += pos.getX(idx);
      cy += pos.getY(idx);
      cz += pos.getZ(idx);
    }
    cx /= radialSegments;
    cy /= radialSegments;
    cz /= radialSegments;

    for (let j = 0; j < ringStride; j++) {
      const idx = ringStart + j;
      if (idx >= pos.count) break;
      pos.setXYZ(
        idx,
        cx + (pos.getX(idx) - cx) * scale,
        cy + (pos.getY(idx) - cy) * scale,
        cz + (pos.getZ(idx) - cz) * scale,
      );
    }
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * 関西大学 千里山キャンパス 正門（秀麗橋・門標・旗竿・モニュメント時計・通路舗装）。
 * 独立した門柱・門扉は作らず、新関西大学会館の北棟・南棟 3 階を結ぶ石張り連絡橋「秀麗橋」と
 * 周辺のシンボル構成をワールド座標で組む。
 */
export const buildMainGate: HeroBuilder = (ctx) => {
  const y0 = ctx.groundVisualY;
  const group = new THREE.Group();
  group.name = 'hero-main-gate';

  // Shared materials (reused across parts sharing the same color)
  const bridgeStoneMat = new THREE.MeshStandardMaterial({
    color: COLORS.bridgeStone,
    roughness: 0.82,
    metalness: 0.04,
  });
  const bridgeJointMat = new THREE.MeshStandardMaterial({
    color: COLORS.bridgeJoint,
    roughness: 0.86,
    metalness: 0.03,
  });
  const bridgeSoffitMat = new THREE.MeshStandardMaterial({
    color: COLORS.bridgeSoffit,
    roughness: 0.88,
    metalness: 0.02,
  });
  const emblemMat = new THREE.MeshStandardMaterial({
    color: COLORS.emblemRelief,
    roughness: 0.68,
    metalness: 0.08,
  });
  const monumentStoneMat = new THREE.MeshStandardMaterial({
    color: COLORS.monumentStone,
    roughness: 0.8,
    metalness: 0.04,
  });
  const planterRimMat = new THREE.MeshStandardMaterial({
    color: COLORS.planterRim,
    roughness: 0.84,
    metalness: 0.03,
  });
  const foliageMat = new THREE.MeshStandardMaterial({
    color: COLORS.foliage,
    roughness: 0.88,
    metalness: 0.0,
  });
  const flowerPinkMat = new THREE.MeshStandardMaterial({
    color: COLORS.flowerPink,
    roughness: 0.82,
    metalness: 0.0,
  });
  const flagpoleMat = new THREE.MeshStandardMaterial({
    color: COLORS.flagpoleWhite,
    roughness: 0.62,
    metalness: 0.08,
  });
  const stainlessMat = new THREE.MeshStandardMaterial({
    color: COLORS.stainless,
    roughness: 0.35,
    metalness: 0.3, // 環境マップの無いシーンでは金属度を上げると黒く沈むので、明るい銀に見える値に抑える
  });
  const clockFaceMat = new THREE.MeshStandardMaterial({
    color: COLORS.clockFace,
    roughness: 0.65,
    metalness: 0.02,
  });
  const pavingMat = new THREE.MeshStandardMaterial({
    color: COLORS.paving,
    roughness: 0.86,
    metalness: 0.02,
  });

  const dummy = new THREE.Object3D();

  // ---------------------------------------------------------------------------
  // 1. 秀麗橋（Shurei Bridge: z 108..137, center x -115, depth 14m, y 8..13.5m）
  // ---------------------------------------------------------------------------
  const bridgeCenterX = -115;
  const bridgeDepthX = 14;
  const bridgeZStart = 108;
  const bridgeZEnd = 137;
  const bridgeLengthZ = bridgeZEnd - bridgeZStart; // 29m
  const bridgeCenterZ = (bridgeZStart + bridgeZEnd) * 0.5; // 122.5
  const bridgeBottomY = y0 + 8.0;
  const bridgeTopY = y0 + 13.5;
  const soffitThickness = 0.08;
  const stoneBodyHeight = bridgeTopY - (bridgeBottomY + soffitThickness); // 5.42m

  const bridgeBody = new THREE.Mesh(
    new THREE.BoxGeometry(bridgeDepthX, stoneBodyHeight, bridgeLengthZ),
    bridgeStoneMat,
  );
  bridgeBody.name = 'shurei-bridge-body';
  bridgeBody.position.set(
    bridgeCenterX,
    bridgeBottomY + soffitThickness + stoneBodyHeight * 0.5,
    bridgeCenterZ,
  );
  bridgeBody.castShadow = true;
  bridgeBody.receiveShadow = true;
  group.add(bridgeBody);

  // 橋の下面（打ち放しコンクリート #A9A6A0）
  const bridgeSoffit = new THREE.Mesh(
    new THREE.BoxGeometry(bridgeDepthX, soffitThickness, bridgeLengthZ),
    bridgeSoffitMat,
  );
  bridgeSoffit.name = 'shurei-bridge-soffit';
  bridgeSoffit.position.set(
    bridgeCenterX,
    bridgeBottomY + soffitThickness * 0.5,
    bridgeCenterZ,
  );
  bridgeSoffit.castShadow = false;
  bridgeSoffit.receiveShadow = true;
  group.add(bridgeSoffit);

  // 石の横目地（高さ 0.1m の帯を 1.2m おきに西・東の両面に配置）
  const jointHeightsFromGround = [9.2, 10.4, 11.6, 12.8];
  const jointGeo = new THREE.BoxGeometry(0.06, 0.1, bridgeLengthZ - 0.04);
  const jointInst = new THREE.InstancedMesh(
    jointGeo,
    bridgeJointMat,
    jointHeightsFromGround.length * 2,
  );
  jointInst.name = 'shurei-bridge-joints';
  jointInst.castShadow = false;
  jointInst.receiveShadow = true;

  const westFaceX = bridgeCenterX - bridgeDepthX * 0.5; // -122
  const eastFaceX = bridgeCenterX + bridgeDepthX * 0.5; // -108
  let jointIdx = 0;
  for (const h of jointHeightsFromGround) {
    // West face
    dummy.position.set(westFaceX - 0.01, y0 + h, bridgeCenterZ);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    jointInst.setMatrixAt(jointIdx++, dummy.matrix);

    // East face
    dummy.position.set(eastFaceX + 0.01, y0 + h, bridgeCenterZ);
    dummy.updateMatrix();
    jointInst.setMatrixAt(jointIdx++, dummy.matrix);
  }
  jointInst.instanceMatrix.needsUpdate = true;
  jointInst.computeBoundingBox();
  jointInst.computeBoundingSphere();
  group.add(jointInst);

  // ---------------------------------------------------------------------------
  // 2. 秀麗橋 西・東の面中央の無地の丸い浮き彫り（直径 2.6m・厚さ 0.25m）
  // ---------------------------------------------------------------------------
  const emblemCenterY = (bridgeBottomY + bridgeTopY) * 0.5; // y0 + 10.75
  const emblemEmbed = 0.02;
  const emblemThickness = 0.25;
  const emblemGeo = new THREE.CylinderGeometry(1.3, 1.3, emblemThickness + emblemEmbed, 24);

  const westEmblem = new THREE.Mesh(emblemGeo, emblemMat);
  westEmblem.name = 'shurei-bridge-relief-west';
  westEmblem.rotation.z = Math.PI * 0.5;
  westEmblem.position.set(
    westFaceX - (emblemThickness - emblemEmbed) * 0.5,
    emblemCenterY,
    bridgeCenterZ,
  );
  westEmblem.castShadow = false;
  westEmblem.receiveShadow = true;
  group.add(westEmblem);

  const eastEmblem = new THREE.Mesh(emblemGeo, emblemMat);
  eastEmblem.name = 'shurei-bridge-relief-east';
  eastEmblem.rotation.z = Math.PI * 0.5;
  eastEmblem.position.set(
    eastFaceX + (emblemThickness - emblemEmbed) * 0.5,
    emblemCenterY,
    bridgeCenterZ,
  );
  eastEmblem.castShadow = false;
  eastEmblem.receiveShadow = true;
  group.add(eastEmblem);

  // ---------------------------------------------------------------------------
  // 3. 門標（x -142, z 111、長さ 9m × 高さ 1.9m × 厚さ 1.4m、正面凹み・足元植え込み）
  // ---------------------------------------------------------------------------
  const signCenterX = -142;
  const signCenterZ = 111;
  const signLengthZ = 9.0;
  const signHeightY = 1.9;
  const signThicknessX = 1.4;
  const recessDepth = 0.08;
  const signBackThickness = signThicknessX - recessDepth; // 1.32m
  const signWestFaceX = signCenterX - signThicknessX * 0.5; // -142.7
  const signFrameCenterX = signWestFaceX + recessDepth * 0.5; // -142.66

  // 門標の主石塊
  const signBody = new THREE.Mesh(
    new THREE.BoxGeometry(signBackThickness, signHeightY, signLengthZ),
    monumentStoneMat,
  );
  signBody.name = 'monument-sign-body';
  signBody.position.set(
    signWestFaceX + recessDepth + signBackThickness * 0.5,
    y0 + signHeightY * 0.5,
    signCenterZ,
  );
  signBody.castShadow = true;
  signBody.receiveShadow = true;
  group.add(signBody);

  // 西面（正面）に少し凹んだ横長の面を作る周囲の石枠（植え込み高さ 0.8m より上に配置）
  const recessBottomH = 0.88;
  const recessTopH = 1.62;
  const recessOpeningH = recessTopH - recessBottomH; // 0.74m
  const recessSideMargin = 0.7;
  const recessOpeningZ = signLengthZ - recessSideMargin * 2; // 7.6m

  const signBottomBar = new THREE.Mesh(
    new THREE.BoxGeometry(recessDepth, recessBottomH, signLengthZ),
    monumentStoneMat,
  );
  signBottomBar.name = 'monument-sign-frame-bottom';
  signBottomBar.position.set(signFrameCenterX, y0 + recessBottomH * 0.5, signCenterZ);
  signBottomBar.receiveShadow = true;
  group.add(signBottomBar);

  const topBarH = signHeightY - recessTopH; // 0.28m
  const signTopBar = new THREE.Mesh(
    new THREE.BoxGeometry(recessDepth, topBarH, signLengthZ),
    monumentStoneMat,
  );
  signTopBar.name = 'monument-sign-frame-top';
  signTopBar.position.set(signFrameCenterX, y0 + recessTopH + topBarH * 0.5, signCenterZ);
  signTopBar.receiveShadow = true;
  group.add(signTopBar);

  const sideBarGeo = new THREE.BoxGeometry(recessDepth, recessOpeningH, recessSideMargin);
  const recessMidY = y0 + (recessBottomH + recessTopH) * 0.5;
  const sideBarOffsetZ = (signLengthZ - recessSideMargin) * 0.5;

  const signNorthBar = new THREE.Mesh(sideBarGeo, monumentStoneMat);
  signNorthBar.name = 'monument-sign-frame-north';
  signNorthBar.position.set(signFrameCenterX, recessMidY, signCenterZ - sideBarOffsetZ);
  signNorthBar.receiveShadow = true;
  group.add(signNorthBar);

  const signSouthBar = new THREE.Mesh(sideBarGeo, monumentStoneMat);
  signSouthBar.name = 'monument-sign-frame-south';
  signSouthBar.position.set(signFrameCenterX, recessMidY, signCenterZ + sideBarOffsetZ);
  signSouthBar.receiveShadow = true;
  group.add(signSouthBar);

  // 凹んだ横長の無地面（文字なし）
  const signRecessPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, recessOpeningH, recessOpeningZ),
    planterRimMat,
  );
  signRecessPanel.name = 'monument-sign-recess';
  signRecessPanel.position.set(signWestFaceX + recessDepth - 0.01, recessMidY, signCenterZ);
  signRecessPanel.receiveShadow = true;
  group.add(signRecessPanel);

  // 門標足元の植え込み（高さ 0.8m、#5E8C4E）
  const signHedgeHeight = 0.8;
  const signHedge = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, signHedgeHeight, 10.0),
    foliageMat,
  );
  signHedge.name = 'monument-sign-hedge';
  signHedge.position.set(-142.3, y0 + signHedgeHeight * 0.5, signCenterZ);
  signHedge.castShadow = false;
  signHedge.receiveShadow = true;
  group.add(signHedge);

  // ---------------------------------------------------------------------------
  // 4. 旗竿 3 本（門標の後ろ、x -139、z 106・109・112、白・太さ 0.2m・高さ 15m）
  // ---------------------------------------------------------------------------
  const flagpoleHeight = 15.0;
  const flagpoleGeo = new THREE.CylinderGeometry(0.1, 0.1, flagpoleHeight, 8);
  const flagpoleZs = [106, 109, 112];
  for (let i = 0; i < flagpoleZs.length; i++) {
    const zPos = flagpoleZs[i];
    if (zPos === undefined) continue;
    const pole = new THREE.Mesh(flagpoleGeo, flagpoleMat);
    pole.name = `flagpole-${i + 1}`;
    pole.position.set(-139, y0 + flagpoleHeight * 0.5, zPos);
    pole.castShadow = false;
    pole.receiveShadow = true;
    group.add(pole);
  }

  // ---------------------------------------------------------------------------
  // 5. モニュメント時計（x -95, z 121: 四角い花壇＋葦の葉ステンレス塔＋時計 3 面）
  // ---------------------------------------------------------------------------
  const clockX = -95;
  const clockZ = 121;
  const pavingTopY = y0 + 0.05;

  // 5A. 四角い花壇（4.5m 角、高さ 0.7m、縁 #B8B2A6、中は #D46A7E と #5E8C4E をまだらに）
  const planterSize = 4.5;
  const planterTopY = y0 + 0.7;
  const planterRimThickness = 0.35;
  const planterRimLipH = 0.1;
  const planterBaseH = planterTopY - planterRimLipH - pavingTopY; // 0.55m

  const planterBase = new THREE.Mesh(
    new THREE.BoxGeometry(planterSize, planterBaseH, planterSize),
    planterRimMat,
  );
  planterBase.name = 'clock-planter-base';
  planterBase.position.set(clockX, pavingTopY + planterBaseH * 0.5, clockZ);
  planterBase.castShadow = true;
  planterBase.receiveShadow = true;
  group.add(planterBase);

  const rimY = planterTopY - planterRimLipH * 0.5;
  const rimOffset = (planterSize - planterRimThickness) * 0.5;
  const innerSpan = planterSize - planterRimThickness * 2; // 3.8m
  const rimNsGeo = new THREE.BoxGeometry(planterSize, planterRimLipH, planterRimThickness);
  const rimEwGeo = new THREE.BoxGeometry(planterRimThickness, planterRimLipH, innerSpan);

  const rimNorth = new THREE.Mesh(rimNsGeo, planterRimMat);
  rimNorth.name = 'clock-planter-rim-north';
  rimNorth.position.set(clockX, rimY, clockZ - rimOffset);
  rimNorth.receiveShadow = true;
  group.add(rimNorth);

  const rimSouth = new THREE.Mesh(rimNsGeo, planterRimMat);
  rimSouth.name = 'clock-planter-rim-south';
  rimSouth.position.set(clockX, rimY, clockZ + rimOffset);
  rimSouth.receiveShadow = true;
  group.add(rimSouth);

  const rimWest = new THREE.Mesh(rimEwGeo, planterRimMat);
  rimWest.name = 'clock-planter-rim-west';
  rimWest.position.set(clockX - rimOffset, rimY, clockZ);
  rimWest.receiveShadow = true;
  group.add(rimWest);

  const rimEast = new THREE.Mesh(rimEwGeo, planterRimMat);
  rimEast.name = 'clock-planter-rim-east';
  rimEast.position.set(clockX + rimOffset, rimY, clockZ);
  rimEast.receiveShadow = true;
  group.add(rimEast);

  // 花壇のベース緑
  const bedBaseH = 0.08;
  const bedBase = new THREE.Mesh(
    new THREE.BoxGeometry(innerSpan, bedBaseH, innerSpan),
    foliageMat,
  );
  bedBase.name = 'clock-planter-bed';
  bedBase.position.set(clockX, planterTopY - planterRimLipH + bedBaseH * 0.5, clockZ);
  bedBase.receiveShadow = true;
  group.add(bedBase);

  // 花壇内のまだら模様（ピンクの花 #D46A7E と緑 #5E8C4E を InstancedMesh で配置）
  const pinkCells: [number, number, number][] = [];
  const greenCells: [number, number, number][] = [];
  const gridN = 6;
  const cellStep = innerSpan / gridN; // ~0.633m
  const tuftBaseY = planterTopY - planterRimLipH + bedBaseH;

  for (let gx = 0; gx < gridN; gx++) {
    for (let gz = 0; gz < gridN; gz++) {
      // 中央 2x2 はステンレス管の根元の束が立つためスキップ
      if ((gx === 2 || gx === 3) && (gz === 2 || gz === 3)) continue;
      const lx = -innerSpan * 0.5 + (gx + 0.5) * cellStep;
      const lz = -innerSpan * 0.5 + (gz + 0.5) * cellStep;
      const hash = (gx * 7 + gz * 13 + gx * gz * 3) % 5;
      const h = 0.08 + (hash % 3) * 0.03;
      if (hash === 0 || hash === 2 || hash === 4) {
        pinkCells.push([clockX + lx, lz + clockZ, h]);
      } else {
        greenCells.push([clockX + lx, lz + clockZ, h]);
      }
    }
  }

  const tuftGeo = new THREE.BoxGeometry(cellStep * 0.9, 1, cellStep * 0.9);

  if (pinkCells.length > 0) {
    const pinkInst = new THREE.InstancedMesh(tuftGeo, flowerPinkMat, pinkCells.length);
    pinkInst.name = 'clock-planter-flowers';
    pinkInst.castShadow = false;
    pinkInst.receiveShadow = true;
    let idx = 0;
    for (const [px, pz, ph] of pinkCells) {
      dummy.position.set(px, tuftBaseY + ph * 0.5, pz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, ph, 1);
      dummy.updateMatrix();
      pinkInst.setMatrixAt(idx++, dummy.matrix);
    }
    pinkInst.instanceMatrix.needsUpdate = true;
    pinkInst.computeBoundingBox();
    pinkInst.computeBoundingSphere();
    group.add(pinkInst);
  }

  if (greenCells.length > 0) {
    const greenInst = new THREE.InstancedMesh(tuftGeo, foliageMat, greenCells.length);
    greenInst.name = 'clock-planter-foliage';
    greenInst.castShadow = false;
    greenInst.receiveShadow = true;
    let idx = 0;
    for (const [gxPos, gzPos, gh] of greenCells) {
      dummy.position.set(gxPos, tuftBaseY + gh * 0.5, gzPos);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, gh, 1);
      dummy.updateMatrix();
      greenInst.setMatrixAt(idx++, dummy.matrix);
    }
    greenInst.instanceMatrix.needsUpdate = true;
    greenInst.computeBoundingBox();
    greenInst.computeBoundingSphere();
    group.add(greenInst);
  }

  // 5B. ステンレス管 18 本を根元で束ねて葦の葉のように広げた背の高い塔（高さ約 17m）
  const towerBaseY = y0 + 0.65;
  const reedSpecs: ReedTubeSpec[] = [];

  // 内側コア 6 本（時計の背骨となり、上端で葉のように外へ開く）
  for (let k = 0; k < 6; k++) {
    const angle = (k * Math.PI) / 3;
    const isBehindClock = k % 2 === 1; // 60°, 180°, 300°
    if (isBehindClock) {
      reedSpecs.push({
        angle,
        radius: 0.16, // 直径 0.32m
        castShadow: true,
        points: [
          [0.28, 0.0],
          [0.42, 5.2],
          [0.58, 10.6],
          [0.64, 13.6],
          [1.22, 16.4],
        ],
      });
    } else {
      reedSpecs.push({
        angle,
        radius: 0.17, // 直径 0.34m
        castShadow: true,
        points: [
          [0.28, 0.0],
          [0.45, 5.6],
          [0.66, 11.2],
          [0.92, 14.8],
          [1.45, 17.0],
        ],
      });
    }
  }

  // 外側リング 12 本（30° おきに葦の葉のように大きく外へしなる）
  for (let j = 0; j < 12; j++) {
    const angle = (j * Math.PI) / 6;
    if (j % 4 === 2) {
      // 時計正面の 60°・180°・300°: 文字盤の下で外へ開く
      reedSpecs.push({
        angle,
        radius: 0.13, // 直径 0.26m
        castShadow: false,
        points: [
          [0.58, 0.0],
          [0.76, 3.8],
          [1.12, 7.6],
          [1.68, 10.6],
          [2.18, 11.3],
        ],
      });
    } else if (j % 2 === 1) {
      // 時計左右 ±30° の 6 本: 文字盤の両脇を彩るように外へ広がる
      reedSpecs.push({
        angle,
        radius: 0.135, // 直径 0.27m
        castShadow: false,
        points: [
          [0.58, 0.0],
          [0.8, 4.6],
          [1.24, 9.2],
          [1.88, 12.8],
          [2.4, 14.1],
        ],
      });
    } else {
      // 時計間の 0°・120°・240° の 3 本: 高く伸びて外へしなる
      reedSpecs.push({
        angle,
        radius: 0.145, // 直径 0.29m
        castShadow: false,
        points: [
          [0.58, 0.0],
          [0.82, 5.2],
          [1.22, 10.6],
          [1.76, 14.4],
          [2.3, 15.9],
        ],
      });
    }
  }

  for (let i = 0; i < reedSpecs.length; i++) {
    const spec = reedSpecs[i];
    if (!spec) continue;
    const cos = Math.cos(spec.angle);
    const sin = Math.sin(spec.angle);
    const curvePts = spec.points.map(
      ([r, dy]) => new THREE.Vector3(clockX + cos * r, towerBaseY + dy, clockZ + sin * r),
    );
    const curve = new THREE.CatmullRomCurve3(curvePts, false, 'centripetal');
    const tubeGeo = createTaperedReedTubeGeometry(curve, 14, spec.radius, 6, 0.18);
    const tube = new THREE.Mesh(tubeGeo, stainlessMat);
    tube.name = `clock-reed-tube-${i + 1}`;
    tube.castShadow = spec.castShadow;
    tube.receiveShadow = true;
    group.add(tube);
  }

  // 5C. 上部の白い時計の円盤 3 面（高さ 14m、直径 1.4m、#F5F5F2、縁 #D9DEE2、針なし）
  const clockDialY = y0 + 14.0;
  const clockDialOffsetR = 0.88;
  const clockBezelGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.2, 20);
  const clockFaceGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.04, 20);
  const clockAngles = [Math.PI, -Math.PI / 3, Math.PI / 3]; // 西・北東・南東

  for (let i = 0; i < clockAngles.length; i++) {
    const angle = clockAngles[i];
    if (angle === undefined) continue;
    const dialGroup = new THREE.Group();
    dialGroup.name = `clock-dial-${i + 1}`;
    dialGroup.position.set(
      clockX + Math.cos(angle) * clockDialOffsetR,
      clockDialY,
      clockZ + Math.sin(angle) * clockDialOffsetR,
    );
    // ローカル +X が外向き (cos(angle), 0, sin(angle)) になるように Y 回転
    dialGroup.rotation.y = -angle;

    const bezel = new THREE.Mesh(clockBezelGeo, stainlessMat);
    bezel.name = `clock-dial-bezel-${i + 1}`;
    bezel.rotation.z = -Math.PI * 0.5;
    bezel.castShadow = true;
    bezel.receiveShadow = true;
    dialGroup.add(bezel);

    const face = new THREE.Mesh(clockFaceGeo, clockFaceMat);
    face.name = `clock-dial-face-${i + 1}`;
    face.rotation.z = -Math.PI * 0.5;
    face.position.x = 0.1; // 縁から 0.02m だけ外側へ出す
    face.castShadow = false;
    face.receiveShadow = true;
    dialGroup.add(face);

    group.add(dialGroup);
  }

  // ---------------------------------------------------------------------------
  // 6. 通路の舗装（橋の下から東の広場まで、幅 14m、#D8D2C6、地面から 0.05m 上）
  // ---------------------------------------------------------------------------
  const pavingXStart = -130;
  const pavingXEnd = -88;
  const pavingLengthX = pavingXEnd - pavingXStart; // 42m
  const pavingWidthZ = 14.0;
  const pavingCenterZ = 123.0;
  const pavingThickness = 0.05;

  const paving = new THREE.Mesh(
    new THREE.BoxGeometry(pavingLengthX, pavingThickness, pavingWidthZ),
    pavingMat,
  );
  paving.name = 'main-gate-paving';
  paving.position.set(
    (pavingXStart + pavingXEnd) * 0.5,
    y0 + pavingThickness * 0.5,
    pavingCenterZ,
  );
  paving.castShadow = false;
  paving.receiveShadow = true;
  group.add(paving);

  return {
    group,
    primaryMaterials: [
      { mat: bridgeStoneMat, baseHex: COLORS.bridgeStone },
      { mat: monumentStoneMat, baseHex: COLORS.monumentStone },
    ],
    animated: [],
  };
};
