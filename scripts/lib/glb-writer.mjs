import * as THREE from 'three';

function align4(n) {
  return (n + 3) & ~3;
}

/**
 * Expands any InstancedMesh children into a merged colored Mesh so both
 * OBJExporter and GLB export preserve foliage instances and instance colors.
 */
export function normalizeSceneForExport(root) {
  root.updateMatrixWorld(true);
  const replacements = [];

  root.traverse((obj) => {
    if (obj.isInstancedMesh && obj.parent) {
      const count = obj.count;
      const srcGeo = obj.geometry;
      const srcPos = srcGeo.getAttribute('position');
      const srcNorm = srcGeo.getAttribute('normal');
      const srcIdx = srcGeo.index;
      if (!srcPos) return;

      const vPerInst = srcPos.count;
      const iPerInst = srcIdx ? srcIdx.count : vPerInst;

      const positions = new Float32Array(count * vPerInst * 3);
      const normals = new Float32Array(count * vPerInst * 3);
      const colors = new Float32Array(count * vPerInst * 3);
      const indices = new Uint32Array(count * iPerInst);

      const mat = obj.material;
      const baseColor =
        mat && 'color' in mat && mat.color && typeof mat.color.r === 'number'
          ? mat.color
          : new THREE.Color('#ffffff');
      const instMat = new THREE.Matrix4();
      const normalMat = new THREE.Matrix3();
      const vTmp = new THREE.Vector3();
      const nTmp = new THREE.Vector3();
      const cTmp = new THREE.Color();

      for (let i = 0; i < count; i++) {
        obj.getMatrixAt(i, instMat);
        normalMat.getNormalMatrix(instMat);
        if (obj.instanceColor) {
          obj.getColorAt(i, cTmp);
        } else {
          cTmp.copy(baseColor);
        }

        const vBase = i * vPerInst;
        for (let v = 0; v < vPerInst; v++) {
          vTmp.set(srcPos.getX(v), srcPos.getY(v), srcPos.getZ(v)).applyMatrix4(instMat);
          const dst = (vBase + v) * 3;
          positions[dst] = vTmp.x;
          positions[dst + 1] = vTmp.y;
          positions[dst + 2] = vTmp.z;

          if (srcNorm) {
            nTmp
              .set(srcNorm.getX(v), srcNorm.getY(v), srcNorm.getZ(v))
              .applyMatrix3(normalMat)
              .normalize();
            normals[dst] = nTmp.x;
            normals[dst + 1] = nTmp.y;
            normals[dst + 2] = nTmp.z;
          }

          colors[dst] = cTmp.r;
          colors[dst + 1] = cTmp.g;
          colors[dst + 2] = cTmp.b;
        }

        const iBase = i * iPerInst;
        for (let k = 0; k < iPerInst; k++) {
          indices[iBase + k] = (srcIdx ? srcIdx.getX(k) : k) + vBase;
        }
      }

      const mergedGeo = new THREE.BufferGeometry();
      mergedGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      mergedGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      mergedGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      mergedGeo.setIndex(new THREE.BufferAttribute(indices, 1));

      const mergedMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: mat && 'roughness' in mat ? mat.roughness : 0.88,
        metalness: mat && 'metalness' in mat ? mat.metalness : 0.02,
      });

      const baked = new THREE.Mesh(mergedGeo, mergedMat);
      baked.name = obj.name || 'instanced-baked';
      replacements.push({ parent: obj.parent, oldObj: obj, newObj: baked });
    }
  });

  for (const r of replacements) {
    r.parent.remove(r.oldObj);
    r.parent.add(r.newObj);
  }
  root.updateMatrixWorld(true);
}

/**
 * Serializes a Three.js Object3D tree into a spec-compliant binary glTF 2.0 (.glb) Buffer.
 * Runs purely in Node.js without browser DOM / FileReader dependencies.
 */
export function serializeObjectToGlb(root) {
  root.updateMatrixWorld(true);

  const bufferChunks = [];
  let byteOffset = 0;

  const bufferViews = [];
  const accessors = [];
  const materials = [];
  const materialKeyToIndex = new Map();
  const meshes = [];
  const nodes = [];

  const appendChunk = (typedArray, target) => {
    const rawBytes = Buffer.from(
      typedArray.buffer,
      typedArray.byteOffset,
      typedArray.byteLength,
    );
    const paddedLen = align4(rawBytes.length);
    const viewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: rawBytes.length,
      ...(target ? { target } : {}),
    });
    bufferChunks.push(rawBytes);
    if (paddedLen > rawBytes.length) {
      bufferChunks.push(Buffer.alloc(paddedLen - rawBytes.length));
    }
    byteOffset += paddedLen;
    return viewIndex;
  };

  const getMaterialIndex = (mat, hasVertexColor) => {
    const col =
      mat && 'color' in mat && mat.color && typeof mat.color.r === 'number'
        ? mat.color
        : new THREE.Color('#E0D8CA');
    const r = hasVertexColor ? 1 : Number(col.r.toFixed(4));
    const g = hasVertexColor ? 1 : Number(col.g.toFixed(4));
    const b = hasVertexColor ? 1 : Number(col.b.toFixed(4));
    const isBlend = Boolean(
      mat && mat.transparent && typeof mat.opacity === 'number' && mat.opacity < 0.99,
    );
    const alpha = isBlend ? Number(mat.opacity.toFixed(3)) : 1;
    const roughness = Number((mat && typeof mat.roughness === 'number' ? mat.roughness : 0.85).toFixed(3));
    const metalness = Number((mat && typeof mat.metalness === 'number' ? mat.metalness : 0.04).toFixed(3));
    const doubleSided = Boolean(mat?.side === THREE.DoubleSide);
    const key = `${r},${g},${b},${alpha},${roughness},${metalness},${doubleSided ? 1 : 0}`;
    const existing = materialKeyToIndex.get(key);
    if (existing !== undefined) return existing;

    const idx = materials.length;
    materials.push({
      name: mat?.name || `mat_${idx}`,
      pbrMetallicRoughness: {
        baseColorFactor: [r, g, b, alpha],
        metallicFactor: metalness,
        roughnessFactor: roughness,
      },
      ...(isBlend ? { alphaMode: 'BLEND' } : {}),
      doubleSided,
    });
    materialKeyToIndex.set(key, idx);
    return idx;
  };

  const vTmp = new THREE.Vector3();
  const nTmp = new THREE.Vector3();
  const normalMat = new THREE.Matrix3();
  const nameCounts = new Map();

  const resolveNodeName = (obj, meshIdx) => {
    let base = obj.name || '';
    if (!base) {
      let cur = obj.parent;
      while (cur && cur !== root) {
        if (cur.name && !cur.name.startsWith('campus-')) {
          base = cur.name;
          break;
        }
        cur = cur.parent;
      }
    }
    if (!base) base = `node_${meshIdx}`;
    const seen = nameCounts.get(base) ?? 0;
    nameCounts.set(base, seen + 1);
    return seen === 0 ? base : `${base}_part${seen}`;
  };

  root.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh) return;
    const geo = obj.geometry;
    const posAttr = geo.getAttribute('position');
    if (!posAttr || posAttr.count === 0) return;

    const normAttr = geo.getAttribute('normal');
    const colorAttr = geo.getAttribute('color');
    const vertCount = posAttr.count;

    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    normalMat.getNormalMatrix(obj.matrixWorld);

    for (let i = 0; i < vertCount; i++) {
      vTmp.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(obj.matrixWorld);
      const o = i * 3;
      positions[o] = vTmp.x;
      positions[o + 1] = vTmp.y;
      positions[o + 2] = vTmp.z;
      if (vTmp.x < minX) minX = vTmp.x;
      if (vTmp.y < minY) minY = vTmp.y;
      if (vTmp.z < minZ) minZ = vTmp.z;
      if (vTmp.x > maxX) maxX = vTmp.x;
      if (vTmp.y > maxY) maxY = vTmp.y;
      if (vTmp.z > maxZ) maxZ = vTmp.z;

      if (normAttr) {
        nTmp.set(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i)).applyMatrix3(normalMat).normalize();
        normals[o] = nTmp.x;
        normals[o + 1] = nTmp.y;
        normals[o + 2] = nTmp.z;
      } else {
        normals[o] = 0;
        normals[o + 1] = 1;
        normals[o + 2] = 0;
      }
    }

    const posView = appendChunk(positions, 34962);
    const posAccessor = accessors.length;
    accessors.push({
      bufferView: posView,
      componentType: 5126,
      count: vertCount,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    });

    const normView = appendChunk(normals, 34962);
    const normAccessor = accessors.length;
    accessors.push({
      bufferView: normView,
      componentType: 5126,
      count: vertCount,
      type: 'VEC3',
    });

    const baseAttributes = {
      POSITION: posAccessor,
      NORMAL: normAccessor,
    };

    if (colorAttr) {
      const colors = new Float32Array(vertCount * 3);
      for (let i = 0; i < vertCount; i++) {
        colors[i * 3] = colorAttr.getX(i);
        colors[i * 3 + 1] = colorAttr.getY(i);
        colors[i * 3 + 2] = colorAttr.getZ(i);
      }
      const colView = appendChunk(colors, 34962);
      const colAccessor = accessors.length;
      accessors.push({
        bufferView: colView,
        componentType: 5126,
        count: vertCount,
        type: 'VEC3',
      });
      baseAttributes.COLOR_0 = colAccessor;
    }

    const indexAttr = geo.index;
    const rawIndices = new Uint32Array(indexAttr ? indexAttr.count : vertCount);
    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i++) {
        rawIndices[i] = indexAttr.getX(i);
      }
    } else {
      for (let i = 0; i < vertCount; i++) {
        rawIndices[i] = i;
      }
    }

    const idxView = appendChunk(rawIndices, 34963);
    const idxAccessor = accessors.length;
    accessors.push({
      bufferView: idxView,
      componentType: 5125,
      count: rawIndices.length,
      type: 'SCALAR',
    });

    const primaryMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const matIdx = getMaterialIndex(primaryMat, Boolean(colorAttr));

    const resolvedName = resolveNodeName(obj, meshes.length);
    const meshIdx = meshes.length;
    meshes.push({
      name: resolvedName,
      primitives: [
        {
          attributes: baseAttributes,
          indices: idxAccessor,
          material: matIdx,
          mode: 4,
        },
      ],
    });

    nodes.push({
      name: resolvedName,
      mesh: meshIdx,
    });
  });

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'kansai-u-3d-map glb-writer',
      copyright: 'Map data (c) OpenStreetMap contributors (ODbL); Elevation: GSI Japan',
    },
    scene: 0,
    scenes: [
      {
        name: 'SenriyamaCampus',
        nodes: nodes.map((_, i) => i),
      },
    ],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  const jsonBytesRaw = Buffer.from(JSON.stringify(gltfJson), 'utf8');
  const jsonPaddedLen = align4(jsonBytesRaw.length);
  const jsonChunk = Buffer.alloc(jsonPaddedLen, 0x20);
  jsonBytesRaw.copy(jsonChunk);

  const binBuffer = Buffer.concat(bufferChunks);
  const totalLen = 12 + 8 + jsonChunk.length + 8 + binBuffer.length;

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.write('JSON', 4, 'ascii');

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuffer.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binBuffer]);
}
