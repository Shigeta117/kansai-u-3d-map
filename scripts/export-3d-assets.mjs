import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { tsImport } from 'tsx/esm/api';
import { normalizeSceneForExport, serializeObjectToGlb } from './lib/glb-writer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'public', 'data', 'senriyama');
const EXPORTS_DIR = path.join(ROOT_DIR, 'exports');

function parseGlbJson(glbBuffer) {
  const magic = glbBuffer.subarray(0, 4).toString('ascii');
  if (magic !== 'glTF') {
    throw new Error(`Invalid GLB header magic: ${magic}`);
  }
  const jsonLen = glbBuffer.readUInt32LE(12);
  const chunkType = glbBuffer.subarray(16, 20).toString('ascii');
  if (chunkType !== 'JSON') {
    throw new Error(`Expected JSON chunk in GLB, got: ${chunkType}`);
  }
  return JSON.parse(glbBuffer.subarray(20, 20 + jsonLen).toString('utf8'));
}

async function exportVariant({
  variantName,
  campusOnly,
  builders,
  datasets,
  config,
}) {
  const { terrain, buildings, landcover, paths, structures, transport } = datasets;
  const exportRoot = new THREE.Group();
  exportRoot.name = `KansaiUniversity_Senriyama_${campusOnly ? 'CampusOnly' : 'Full'}`;

  exportRoot.add(
    builders.buildTerrainGroup(terrain, landcover, paths, config, { forExport: true }),
  );
  const bRes = builders.buildBuildingsGroup(buildings, terrain.minElevation, config, {
    forExport: true,
    campusOnly,
  });
  exportRoot.add(bRes.root);
  exportRoot.add(builders.buildStructuresBridgesGroup(structures, terrain, config));
  exportRoot.add(builders.buildAccessCanopiesGroup(structures, terrain, config));
  exportRoot.add(
    builders.buildFoliageGroup(terrain, landcover, buildings, paths, config, structures, {
      campusOnly,
    }),
  );

  if (!campusOnly) {
    exportRoot.add(builders.buildTransportGroup(transport, terrain, config).group);
  }

  normalizeSceneForExport(exportRoot);

  const glbBuffer = serializeObjectToGlb(exportRoot);
  const glbPath = path.join(EXPORTS_DIR, `${variantName}.glb`);
  await fs.writeFile(glbPath, glbBuffer);

  const objExporter = new OBJExporter();
  const objText = objExporter.parse(exportRoot);
  const objPath = path.join(EXPORTS_DIR, `${variantName}.obj`);
  await fs.writeFile(objPath, objText, 'utf8');

  const gltfJson = parseGlbJson(glbBuffer);
  const nodeNames = (gltfJson.nodes ?? []).map((n) => n.name ?? '');
  const hasRimpukan = nodeNames.some((n) => n === 'building-rimpukan');
  const hasShurei = nodeNames.some((n) => n.startsWith('bridge-shurei-'));
  if (!hasRimpukan) {
    throw new Error(`${variantName}: expected GLB node "building-rimpukan" not found`);
  }
  if (!hasShurei) {
    throw new Error(`${variantName}: expected GLB node "bridge-shurei-*" not found`);
  }

  const vLines = (objText.match(/^v /gm) ?? []).length;
  const fLines = (objText.match(/^f /gm) ?? []).length;
  if (vLines < 10000 || fLines < 10000) {
    throw new Error(`${variantName}: unexpectedly small OBJ export: v=${vLines}, f=${fLines}`);
  }

  console.log(
    `Exported GLB: ${path.relative(ROOT_DIR, glbPath)} (${(glbBuffer.length / 1024 / 1024).toFixed(2)} MB, nodes=${nodeNames.length})`,
  );
  console.log(
    `Exported OBJ: ${path.relative(ROOT_DIR, objPath)} (${(Buffer.byteLength(objText) / 1024 / 1024).toFixed(2)} MB, v=${vLines}, f=${fLines})`,
  );

  return { glbSize: glbBuffer.length, objSize: Buffer.byteLength(objText), nodeCount: nodeNames.length };
}

async function main() {
  const [{ SENRIYAMA_CONFIG }, terrainB, buildingB, bridgeB, accessB, foliageB, transportB] =
    await Promise.all([
      tsImport('../packages/core/src/data/campuses/senriyama/config.ts', import.meta.url),
      tsImport('../packages/core/src/scene/TerrainBuilder.ts', import.meta.url),
      tsImport('../packages/core/src/scene/BuildingBuilder.ts', import.meta.url),
      tsImport('../packages/core/src/scene/BridgeBuilder.ts', import.meta.url),
      tsImport('../packages/core/src/scene/AccessWayBuilder.ts', import.meta.url),
      tsImport('../packages/core/src/scene/FoliageBuilder.ts', import.meta.url),
      tsImport('../packages/core/src/scene/TransportBuilder.ts', import.meta.url),
    ]);

  const builders = {
    buildTerrainGroup: terrainB.buildTerrainGroup,
    buildBuildingsGroup: buildingB.buildBuildingsGroup,
    buildStructuresBridgesGroup: bridgeB.buildStructuresBridgesGroup,
    buildAccessCanopiesGroup: accessB.buildAccessCanopiesGroup,
    buildFoliageGroup: foliageB.buildFoliageGroup,
    buildTransportGroup: transportB.buildTransportGroup,
  };

  const [terrain, buildings, landcover, paths, structures, transport] = await Promise.all([
    fs.readFile(path.join(DATA_DIR, 'terrain.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(DATA_DIR, 'buildings.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(DATA_DIR, 'landcover.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(DATA_DIR, 'paths.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(DATA_DIR, 'structures.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(DATA_DIR, 'transport.json'), 'utf8').then(JSON.parse),
  ]);

  const datasets = { terrain, buildings, landcover, paths, structures, transport };
  await fs.mkdir(EXPORTS_DIR, { recursive: true });

  const campusStats = await exportVariant({
    variantName: 'senriyama-campus-only',
    campusOnly: true,
    builders,
    datasets,
    config: SENRIYAMA_CONFIG,
  });

  const fullStats = await exportVariant({
    variantName: 'senriyama-full',
    campusOnly: false,
    builders,
    datasets,
    config: SENRIYAMA_CONFIG,
  });

  if (campusStats.glbSize >= fullStats.glbSize) {
    throw new Error(
      `Expected campus-only GLB (${campusStats.glbSize}) to be smaller than full GLB (${fullStats.glbSize})`,
    );
  }
  console.log(
    `Size check passed: campus-only=${(campusStats.glbSize / 1024 / 1024).toFixed(2)}MB < full=${(fullStats.glbSize / 1024 / 1024).toFixed(2)}MB`,
  );
}

main().catch((err) => {
  console.error('export-3d-assets failed:', err);
  process.exit(1);
});
