import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CACHE_RAW_DIR = path.join(ROOT_DIR, '.cache', 'raw');
const DEM_DIR = path.join(CACHE_RAW_DIR, 'gsi-dem');

const BBOX = {
  south: 34.7685,
  west: 135.5040,
  north: 34.7805,
  east: 135.5180,
};

const USER_AGENT = 'kansai-u-3d-map/0.1.0 (+OSS campus map builder)';

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, z),
  );
}

function getTilesForBbox(bbox, z) {
  const minX = lonToTileX(bbox.west, z);
  const maxX = lonToTileX(bbox.east, z);
  const minY = latToTileY(bbox.north, z);
  const maxY = latToTileY(bbox.south, z);
  const tiles = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`);
  }
  return res.json();
}

async function checkPlateauSuita() {
  console.log('=== [1/3] Checking Project PLATEAU (Suita City / 27205) on G-Spatial CKAN API ===');
  const queries = [
    'https://www.geospatial.jp/ckan/api/3/action/package_search?q=plateau+%E5%90%B9%E7%94%B0',
    'https://www.geospatial.jp/ckan/api/3/action/package_search?q=27205',
    'https://www.geospatial.jp/ckan/api/3/action/package_search?q=plateau+suita',
  ];

  const results = [];
  for (const url of queries) {
    try {
      const data = await fetchJson(url);
      const pkgs = Array.isArray(data?.result?.results) ? data.result.results : [];
      results.push({
        url,
        success: Boolean(data?.success),
        count: data?.result?.count ?? 0,
        datasets: pkgs.map((p) => ({
          id: p.id,
          name: p.name,
          title: p.title,
          organization: p.organization?.title ?? p.organization?.name ?? null,
          metadata_modified: p.metadata_modified,
        })),
      });
    } catch (err) {
      results.push({
        url,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        count: 0,
        datasets: [],
      });
    }
  }

  const allDatasets = results.flatMap((r) => r.datasets);
  const suitaPlateauMatches = allDatasets.filter((d) => {
    const text = `${d.name ?? ''} ${d.title ?? ''}`.toLowerCase();
    return (
      (text.includes('plateau') || text.includes('3d都市モデル')) &&
      (text.includes('吹田') || text.includes('suita') || text.includes('27205'))
    );
  });

  const summary = {
    checkedAt: new Date().toISOString(),
    suitaCityCode: '27205',
    hasOfficialSuitaPlateau: suitaPlateauMatches.length > 0,
    suitaPlateauMatches,
    queries: results,
  };

  const outPath = path.join(CACHE_RAW_DIR, 'plateau-check.json');
  await fs.writeFile(outPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(
    `PLATEAU Suita(27205) match count: ${suitaPlateauMatches.length} (saved to ${path.relative(ROOT_DIR, outPath)})`,
  );
  if (suitaPlateauMatches.length > 0) {
    console.log('FOUND PLATEAU SUITA DATASETS:', suitaPlateauMatches);
  }
  return summary;
}

async function fetchOsmSenriyama() {
  console.log('=== [2/3] Fetching OpenStreetMap data via Overpass API ===');
  const { south, west, north, east } = BBOX;
  const bboxStr = `${south},${west},${north},${east}`;
  const query = `
[out:json][timeout:60];
(
  nwr["amenity"="university"](${bboxStr});
  nwr["building"](${bboxStr});
  way["highway"](${bboxStr});
  way["railway"](${bboxStr});
  node["railway"="station"](${bboxStr});
  nwr["public_transport"](${bboxStr});
  nwr["leisure"](${bboxStr});
  nwr["landuse"](${bboxStr});
  nwr["natural"](${bboxStr});
  node["barrier"="gate"](${bboxStr});
  node["entrance"](${bboxStr});
  nwr["name"~"関西大学|関大|簡文館|凜風館|以文館|尚文館|学舎|図書館|門|悠久|法文坂"](${bboxStr});
);
out body;
>;
out skel qt;
`.trim();

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      console.log(`Querying ${endpoint} ...`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const json = await res.json();
      if (!json || !Array.isArray(json.elements) || json.elements.length === 0) {
        throw new Error('Overpass returned empty elements array');
      }
      const outPath = path.join(CACHE_RAW_DIR, 'osm-senriyama.json');
      await fs.writeFile(
        outPath,
        JSON.stringify(
          {
            fetchedAt: new Date().toISOString(),
            endpoint,
            bbox: BBOX,
            elements: json.elements,
          },
          null,
          2,
        ),
        'utf8',
      );
      console.log(
        `Saved ${json.elements.length} OSM elements from ${endpoint} -> ${path.relative(ROOT_DIR, outPath)}`,
      );
      return json;
    } catch (err) {
      lastError = err;
      console.warn(
        `Overpass endpoint failed (${endpoint}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  throw new Error(
    `All Overpass API endpoints failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function fetchGsiDemTiles() {
  console.log('=== [3/3] Fetching GSI Elevation PNG Tiles (DEM5A / DEM5B / DEM10B) ===');
  await fs.mkdir(DEM_DIR, { recursive: true });

  const layers = [
    { name: 'dem5a_png', z: 15, tiles: getTilesForBbox(BBOX, 15) },
    { name: 'dem5b_png', z: 15, tiles: getTilesForBbox(BBOX, 15) },
    { name: 'dem_png', z: 14, tiles: getTilesForBbox(BBOX, 14) },
  ];

  const manifest = {
    fetchedAt: new Date().toISOString(),
    bbox: BBOX,
    tiles: [],
  };

  for (const layer of layers) {
    for (const tile of layer.tiles) {
      const url = `https://cyberjapandata.gsi.go.jp/xyz/${layer.name}/${tile.z}/${tile.x}/${tile.y}.png`;
      const filename = `${layer.name}_${tile.z}_${tile.x}_${tile.y}.png`;
      const outPath = path.join(DEM_DIR, filename);

      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
        });
        if (res.status === 404) {
          console.log(`  [404] ${layer.name}/${tile.z}/${tile.x}/${tile.y}.png`);
          manifest.tiles.push({
            layer: layer.name,
            ...tile,
            available: false,
            status: 404,
            filename: null,
          });
          continue;
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(outPath, buf);
        console.log(
          `  [OK]  ${layer.name}/${tile.z}/${tile.x}/${tile.y}.png (${buf.length} bytes)`,
        );
        manifest.tiles.push({
          layer: layer.name,
          ...tile,
          available: true,
          status: res.status,
          bytes: buf.length,
          filename,
        });
      } catch (err) {
        console.warn(
          `  [ERR] ${url}: ${err instanceof Error ? err.message : String(err)}`,
        );
        manifest.tiles.push({
          layer: layer.name,
          ...tile,
          available: false,
          error: err instanceof Error ? err.message : String(err),
          filename: null,
        });
      }
    }
  }

  const available5a = manifest.tiles.filter((t) => t.layer === 'dem5a_png' && t.available);
  const availableAny = manifest.tiles.filter((t) => t.available);
  if (availableAny.length === 0) {
    throw new Error('Failed to fetch any GSI elevation tiles.');
  }

  await fs.writeFile(
    path.join(DEM_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
  console.log(
    `GSI DEM fetch complete: ${available5a.length} DEM5A tiles, ${availableAny.length} total tiles available.`,
  );
  return manifest;
}

async function main() {
  await fs.mkdir(CACHE_RAW_DIR, { recursive: true });
  await checkPlateauSuita();
  await fetchOsmSenriyama();
  await fetchGsiDemTiles();
  console.log('\nAll open data fetched successfully.');
}

main().catch((err) => {
  console.error('fetch-open-data failed:', err);
  process.exit(1);
});

