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

async function main() {
  const { SENRIYAMA_CONFIG } = await tsImport(
    '../src/data/campuses/senriyama/config.ts',
    import.meta.url,
  );
  const { buildTerrainGroup } = await tsImport(
    '../src/scene/TerrainBuilder.ts',
    import.meta.url,
  );
  const { buildBuildingsGroup } = await tsImport(
    '../src/scene/BuildingBuilder.ts',
    import.meta.url,
  );
  const { buildFoliageGroup } = await tsImport(
    '../src/scene/FoliageBuilder.ts',
    import.meta.url,
  );
  const { buildTransportGroup } = await tsImport(
    '../src/scene/TransportBuilder.ts',
    import.meta.url,
  );

  const [terrain, buildings, landcover, paths, transport] = await Promise.all([
    fs.readFile(path.join(DATA_DIR, 'terrain.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(DATA_DIR, 'buildings.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(DATA_DIR, 'landcover.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(DATA_DIR, 'paths.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(DATA_DIR, 'transport.json'), 'utf8').then(JSON.parse),
  ]);

  const exportRoot = new THREE.Group();
  exportRoot.name = 'KansaiUniversity_Senriyama_3DMap';

  exportRoot.add(buildTerrainGroup(terrain, landcover, paths, SENRIYAMA_CONFIG));
  const bRes = buildBuildingsGroup(
    buildings,
    terrain.minElevation,
    SENRIYAMA_CONFIG,
    { forExport: true },
  );
  exportRoot.add(bRes.root);
  exportRoot.add(buildFoliageGroup(terrain, landcover, buildings, paths, SENRIYAMA_CONFIG));
  exportRoot.add(buildTransportGroup(transport, terrain, SENRIYAMA_CONFIG).group);

  normalizeSceneForExport(exportRoot);

  await fs.mkdir(EXPORTS_DIR, { recursive: true });

  const glbBuffer = serializeObjectToGlb(exportRoot);
  const glbPath = path.join(EXPORTS_DIR, 'senriyama-campus.glb');
  await fs.writeFile(glbPath, glbBuffer);

  const objExporter = new OBJExporter();
  const objText = objExporter.parse(exportRoot);
  const objPath = path.join(EXPORTS_DIR, 'senriyama-campus.obj');
  await fs.writeFile(objPath, objText, 'utf8');

  const glbMagic = glbBuffer.subarray(0, 4).toString('ascii');
  const vLines = (objText.match(/^v /gm) ?? []).length;
  const fLines = (objText.match(/^f /gm) ?? []).length;

  console.log(`Exported GLB: ${path.relative(ROOT_DIR, glbPath)} (${(glbBuffer.length / 1024 / 1024).toFixed(2)} MB, magic=${glbMagic})`);
  console.log(`Exported OBJ: ${path.relative(ROOT_DIR, objPath)} (${(Buffer.byteLength(objText) / 1024 / 1024).toFixed(2)} MB, v=${vLines}, f=${fLines})`);

  if (glbMagic !== 'glTF') {
    throw new Error(`Invalid GLB header magic: ${glbMagic}`);
  }
  if (vLines < 10000 || fLines < 10000) {
    throw new Error(`Unexpectedly small OBJ export: v=${vLines}, f=${fLines}`);
  }
}

main().catch((err) => {
  console.error('export-3d-assets failed:', err);
  process.exit(1);
});

