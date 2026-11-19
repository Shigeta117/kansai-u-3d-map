import * as THREE from 'three';
import type { HeroBuildContext, HeroBuildResult } from './types';

/**
 * 主役の建物で共通に使う小道具。
 * - extrudePolygonXZ: OSM の輪郭（[x, z][]）を baseY から height だけ上に押し出す。
 *   three r175 の ExtrudeGeometry が輪郭によって屋根と床の面を作らないことがあるので、そのときは自前で補う
 * - minGroundUnder: 輪郭の各点（と辺の途中）で地面の高さを引き、いちばん低い値を返す（底を下ろして浮かせないため）
 * - buildStubHero: 製作前の仮の形（輪郭の押し出しだけ）
 */
export function extrudePolygonXZ(
  polygon: readonly [number, number][],
  baseY: number,
  height: number,
): THREE.BufferGeometry {
  const pts = polygon.map(([x, z]) => new THREE.Vector2(x, -z));
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, baseY, 0);
  geo.computeVertexNormals();
  const lid = geo.groups[0];
  if (lid && lid.count > 0) return geo;

  const pts2d = polygon.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = THREE.ShapeUtils.triangulateShape(pts2d, []);
  const lidPos: number[] = [];
  const topY = baseY + height;
  for (const tri of tris) {
    const [a, b, c] = tri;
    if (a === undefined || b === undefined || c === undefined) continue;
    const pa = polygon[a];
    const pb = polygon[b];
    const pc = polygon[c];
    if (!pa || !pb || !pc) continue;
    const cross = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
    const [p1, p2, p3] = cross < 0 ? [pa, pb, pc] : [pa, pc, pb];
    lidPos.push(p1[0], topY, p1[1], p2[0], topY, p2[1], p3[0], topY, p3[1]);
    lidPos.push(p1[0], baseY, p1[1], p3[0], baseY, p3[1], p2[0], baseY, p2[1]);
  }
  const wall = geo.index ? geo.toNonIndexed() : geo;
  const wp = wall.getAttribute('position');
  const positions = new Float32Array(lidPos.length + wp.count * 3);
  positions.set(lidPos, 0);
  for (let i = 0; i < wp.count; i++) {
    positions[lidPos.length + i * 3] = wp.getX(i);
    positions[lidPos.length + i * 3 + 1] = wp.getY(i);
    positions[lidPos.length + i * 3 + 2] = wp.getZ(i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.addGroup(0, lidPos.length / 3, 0);
  out.addGroup(lidPos.length / 3, wp.count, 1);
  out.computeVertexNormals();
  geo.dispose();
  if (wall !== geo) wall.dispose();
  return out;
}

export function minGroundUnder(
  ctx: HeroBuildContext,
  polygon: readonly [number, number][],
  stepM = 4,
): number {
  let minY = ctx.groundVisualY;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(len / stepM));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      minY = Math.min(minY, ctx.sampleGroundVisualY(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
    }
  }
  return minY;
}

export function buildStubHero(ctx: HeroBuildContext, wallHex: string, roofHex: string): HeroBuildResult {
  const group = new THREE.Group();
  const polygon = ctx.building.polygon;
  const bottom = minGroundUnder(ctx, polygon) - 0.5;
  const top = ctx.groundVisualY + ctx.building.height;
  const wallMat = new THREE.MeshStandardMaterial({ color: wallHex, roughness: 0.82, metalness: 0.03 });
  const roofMat = new THREE.MeshStandardMaterial({ color: roofHex, roughness: 0.86, metalness: 0.02 });
  const mesh = new THREE.Mesh(extrudePolygonXZ(polygon, bottom, top - bottom), [roofMat, wallMat]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return {
    group,
    primaryMaterials: [
      { mat: wallMat, baseHex: wallHex },
      { mat: roofMat, baseHex: roofHex },
    ],
    animated: [],
  };
}
