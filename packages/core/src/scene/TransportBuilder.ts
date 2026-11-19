import * as THREE from 'three';
import { computeVisualY, sampleElevation } from '../domain/projection';
import type { CampusConfig, TerrainGrid, TransportData } from '../domain/types';
import { SCENE_PALETTE } from './palette';
import { buildStationGroup, TRACK_BED_LIFT } from './StationBuilder';
import { mergeSimpleGeometries } from './TerrainBuilder';

export interface TransportBuildResult {
  group: THREE.Group;
  cars: THREE.Object3D[];
  update: (elapsedSec: number) => boolean;
  /** 駅のホーム・駅舎など、選択の当たり判定に使うメッシュ（userData.buildingId に駅の id） */
  interactive: THREE.Object3D[];
}

function buildRailStrip(
  points: THREE.Vector3[],
  width: number,
  liftY: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const halfW = width * 0.5;

  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    if (!cur) continue;
    const prev = points[Math.max(0, i - 1)] ?? cur;
    const next = points[Math.min(points.length - 1, i + 1)] ?? cur;
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    const nx = -tz / len;
    const nz = tx / len;

    positions.push(
      cur.x + nx * halfW,
      cur.y + liftY,
      cur.z + nz * halfW,
      cur.x - nx * halfW,
      cur.y + liftY,
      cur.z - nz * halfW,
    );

    if (i < points.length - 1) {
      const b = i * 2;
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildTransportGroup(
  transport: TransportData,
  terrain: TerrainGrid,
  config: CampusConfig,
): TransportBuildResult {
  const group = new THREE.Group();
  group.name = 'campus-transport';

  const exag = config.verticalExaggeration;
  const minElev = terrain.minElevation;

  const ballastGeos: THREE.BufferGeometry[] = [];
  const trackCurves: THREE.CatmullRomCurve3[] = [];

  for (const rail of transport.railways) {
    if (rail.points.length < 2) continue;

    const sampled: THREE.Vector3[] = [];
    for (let i = 0; i < rail.points.length - 1; i++) {
      const a = rail.points[i];
      const b = rail.points[i + 1];
      if (!a || !b) continue;
      const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(dist / 12));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        const y = computeVisualY(sampleElevation(terrain, x, z), minElev, exag);
        sampled.push(new THREE.Vector3(x, y, z));
      }
    }
    const last = rail.points[rail.points.length - 1];
    if (last) {
      const y = computeVisualY(sampleElevation(terrain, last[0], last[1]), minElev, exag);
      sampled.push(new THREE.Vector3(last[0], y, last[1]));
    }

    if (sampled.length >= 2) {
      ballastGeos.push(buildRailStrip(sampled, 4.4, TRACK_BED_LIFT));
      trackCurves.push(new THREE.CatmullRomCurve3(sampled));
    }
  }

  if (ballastGeos.length > 0) {
    const mergedBallast = mergeSimpleGeometries(ballastGeos);
    for (const g of ballastGeos) g.dispose();
    const ballastMesh = new THREE.Mesh(
      mergedBallast,
      new THREE.MeshStandardMaterial({
        color: '#6E6964',
        roughness: 0.94,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
    );
    ballastMesh.name = 'hankyu-track-bed';
    ballastMesh.receiveShadow = true;
    group.add(ballastMesh);
  }

  // 駅のホーム・駅舎・上屋（OSM の輪郭から）
  const stationBuild = buildStationGroup(transport.stationFacilities ?? [], terrain, config);
  group.add(stationBuild.group);

  let primaryCurve: THREE.CatmullRomCurve3 | null = null;
  let maxLen = 0;
  for (const curve of trackCurves) {
    const len = curve.getLength();
    if (len > maxLen) {
      maxLen = len;
      primaryCurve = curve;
    }
  }

  const cars: THREE.Group[] = [];
  if (primaryCurve && maxLen > 80) {
    const maroonMat = new THREE.MeshStandardMaterial({
      color: SCENE_PALETTE.accents.hankyuMaroon,
      roughness: 0.42,
      metalness: 0.14,
    });
    const creamMat = new THREE.MeshStandardMaterial({
      color: '#F5EFE2',
      roughness: 0.5,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: '#C7CCD1',
      roughness: 0.6,
      metalness: 0.15,
    });

    for (let i = 0; i < 3; i++) {
      const car = new THREE.Group();
      car.name = `hankyu-car-${i + 1}`;
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.7, 13.5), maroonMat);
      body.position.y = 1.65;
      body.castShadow = true;
      car.add(body);

      const band = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.85, 13.55), creamMat);
      band.position.y = 1.95;
      car.add(band);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.4, 13.2), roofMat);
      roof.position.y = 3.15;
      car.add(roof);

      group.add(car);
      cars.push(car);
    }
  }

  let stationStopT = 0.25;
  const station = transport.stations[0];
  if (primaryCurve && station) {
    let bestDist = Infinity;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const pt = primaryCurve.getPointAt(t);
      const d = Math.hypot(pt.x - station.x, pt.z - station.z);
      if (d < bestDist) {
        bestDist = d;
        stationStopT = t;
      }
    }
  }

  const positionTrainAt = (baseT: number) => {
    if (!primaryCurve || cars.length === 0) return;
    const carStepT = 15.2 / Math.max(1, maxLen);
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (!car) continue;
      const t = Math.max(0.02, Math.min(0.98, baseT - i * carStepT));
      const pos = primaryCurve.getPointAt(t);
      const lookT = Math.min(0.995, t + 0.01);
      const lookPos = primaryCurve.getPointAt(lookT);
      car.position.set(pos.x, pos.y + 0.3, pos.z);
      car.lookAt(lookPos.x, lookPos.y + 0.3, lookPos.z);
    }
  };

  let lastT = Math.min(0.92, Math.max(0.08, stationStopT));
  positionTrainAt(lastT);

  const update = (elapsedSec: number): boolean => {
    if (!primaryCurve || cars.length === 0) return false;
    const cycle = 26;
    const phase = (elapsedSec % cycle) / cycle;
    const stopStart = 0.32;
    const stopEnd = 0.45;
    let t: number;
    if (phase < stopStart) {
      const local = phase / stopStart;
      const eased = local * local * (3 - 2 * local);
      t = 0.08 + eased * (stationStopT - 0.08);
    } else if (phase < stopEnd) {
      t = stationStopT;
    } else {
      const local = (phase - stopEnd) / (1 - stopEnd);
      const eased = local * local * (3 - 2 * local);
      t = stationStopT + eased * (0.92 - stationStopT);
    }
    if (Math.abs(t - lastT) < 1e-6) {
      return false;
    }
    lastT = t;
    positionTrainAt(t);
    return true;
  };

  return { group, cars, update, interactive: stationBuild.interactive };
}

