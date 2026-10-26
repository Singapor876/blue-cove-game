const fs = require("fs");
const path = require("path");

const outRoot = path.resolve(__dirname, "..", "assets", "models");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function v3(x, y, z) {
  return [x, y, z];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(a) {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

function transformPoint(p, t = {}) {
  let [x, y, z] = p;
  const sx = t.scale?.[0] ?? 1;
  const sy = t.scale?.[1] ?? 1;
  const sz = t.scale?.[2] ?? 1;
  x *= sx;
  y *= sy;
  z *= sz;
  const ry = t.ry || 0;
  const cy = Math.cos(ry);
  const syv = Math.sin(ry);
  const rx = x * cy + z * syv;
  const rz = -x * syv + z * cy;
  return [rx + (t.pos?.[0] || 0), y + (t.pos?.[1] || 0), rz + (t.pos?.[2] || 0)];
}

function makeBox(w, h, d, t = {}) {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const faces = [
    [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]],
    [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]],
    [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], [1, 0, 0]],
    [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], [-1, 0, 0]],
    [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [0, 1, 0]],
    [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0]],
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  for (const face of faces) {
    const base = positions.length / 3;
    for (let i = 0; i < 4; i++) {
      positions.push(...transformPoint(face[i], t));
      normals.push(...face[4]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

function makeCylinder(radiusTop, radiusBottom, height, segments, t = {}) {
  const positions = [];
  const normals = [];
  const indices = [];
  const half = height / 2;

  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const top = [ca * radiusTop, half, sa * radiusTop];
    const bottom = [ca * radiusBottom, -half, sa * radiusBottom];
    const normal = normalize([ca, (radiusBottom - radiusTop) / height, sa]);
    positions.push(...transformPoint(top, t), ...transformPoint(bottom, t));
    normals.push(...normal, ...normal);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const topCenter = positions.length / 3;
  positions.push(...transformPoint([0, half, 0], t));
  normals.push(0, 1, 0);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(...transformPoint([Math.cos(a) * radiusTop, half, Math.sin(a) * radiusTop], t));
    normals.push(0, 1, 0);
  }
  for (let i = 0; i < segments; i++) indices.push(topCenter, topCenter + 1 + i, topCenter + 1 + ((i + 1) % segments));

  const bottomCenter = positions.length / 3;
  positions.push(...transformPoint([0, -half, 0], t));
  normals.push(0, -1, 0);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(...transformPoint([Math.cos(a) * radiusBottom, -half, Math.sin(a) * radiusBottom], t));
    normals.push(0, -1, 0);
  }
  for (let i = 0; i < segments; i++) indices.push(bottomCenter, bottomCenter + 1 + ((i + 1) % segments), bottomCenter + 1 + i);

  return { positions, normals, indices };
}

function makeSphere(radius, rings, segments, t = {}) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const theta = v * Math.PI;
    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const phi = u * Math.PI * 2;
      const n = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      positions.push(...transformPoint([n[0] * radius, n[1] * radius, n[2] * radius], t));
      normals.push(...n);
    }
  }
  const row = segments + 1;
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segments; x++) {
      const a = y * row + x;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

function makeDisc(radius, segments, t = {}) {
  const positions = [0, 0, 0];
  const normals = [0, 1, 0];
  const indices = [];
  positions.splice(0, 3, ...transformPoint([0, 0, 0], t));
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(...transformPoint([Math.cos(a) * radius, 0, Math.sin(a) * radius], t));
    normals.push(0, 1, 0);
  }
  for (let i = 0; i < segments; i++) indices.push(0, 1 + i, 1 + ((i + 1) % segments));
  return { positions, normals, indices };
}

function mergeParts(parts) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (const part of parts) {
    const base = positions.length / 3;
    positions.push(...part.positions);
    normals.push(...part.normals);
    indices.push(...part.indices.map((i) => i + base));
  }
  return { positions, normals, indices };
}

function bounds(values) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < values.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], values[i + k]);
      max[k] = Math.max(max[k], values[i + k]);
    }
  }
  return { min, max };
}

function writeGlb(file, sceneName, meshes, materials) {
  const json = {
    asset: { version: "2.0", generator: "Blue Cove procedural GLB generator" },
    scene: 0,
    scenes: [{ name: sceneName, nodes: [] }],
    nodes: [],
    meshes: [],
    materials: materials.map((m) => ({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: m.color,
        metallicFactor: m.metallic || 0,
        roughnessFactor: m.roughness ?? 0.8,
      },
      emissiveFactor: m.emissive || [0, 0, 0],
    })),
    buffers: [{ byteLength: 0 }],
    bufferViews: [],
    accessors: [],
  };
  const chunks = [];
  const pushBuffer = (buffer, target) => {
    const padding = (4 - (chunks.reduce((n, b) => n + b.length, 0) % 4)) % 4;
    if (padding) chunks.push(Buffer.alloc(padding));
    const byteOffset = chunks.reduce((n, b) => n + b.length, 0);
    chunks.push(buffer);
    const view = { buffer: 0, byteOffset, byteLength: buffer.length };
    if (target) view.target = target;
    json.bufferViews.push(view);
    return json.bufferViews.length - 1;
  };
  const pushAccessor = (buffer, componentType, type, count, target, minMax) => {
    const view = pushBuffer(buffer, target);
    const accessor = { bufferView: view, byteOffset: 0, componentType, count, type };
    if (minMax) {
      accessor.min = minMax.min;
      accessor.max = minMax.max;
    }
    json.accessors.push(accessor);
    return json.accessors.length - 1;
  };

  meshes.forEach((mesh, meshIndex) => {
    const pos = Buffer.alloc(mesh.positions.length * 4);
    mesh.positions.forEach((v, i) => pos.writeFloatLE(v, i * 4));
    const nor = Buffer.alloc(mesh.normals.length * 4);
    mesh.normals.forEach((v, i) => nor.writeFloatLE(v, i * 4));
    const idx = Buffer.alloc(mesh.indices.length * 4);
    mesh.indices.forEach((v, i) => idx.writeUInt32LE(v, i * 4));
    const posAccessor = pushAccessor(pos, 5126, "VEC3", mesh.positions.length / 3, 34962, bounds(mesh.positions));
    const norAccessor = pushAccessor(nor, 5126, "VEC3", mesh.normals.length / 3, 34962);
    const idxAccessor = pushAccessor(idx, 5125, "SCALAR", mesh.indices.length, 34963);
    json.meshes.push({
      name: mesh.name,
      primitives: [{
        attributes: { POSITION: posAccessor, NORMAL: norAccessor },
        indices: idxAccessor,
        material: mesh.material,
      }],
    });
    json.nodes.push({ name: mesh.name, mesh: meshIndex });
    json.scenes[0].nodes.push(json.nodes.length - 1);
  });

  const bin = Buffer.concat(chunks);
  json.buffers[0].byteLength = bin.length;
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const binBuf = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuf.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binBuf]));
  console.log(`wrote ${file}`);
}

const MAT = {
  skin: { name: "warm_skin", color: [0.95, 0.62, 0.38, 1], roughness: 0.72 },
  blue: { name: "cove_blue_coat", color: [0.16, 0.38, 0.78, 1], roughness: 0.7 },
  cream: { name: "warm_plaster", color: [1.0, 0.88, 0.64, 1], roughness: 0.82 },
  redRoof: { name: "sunset_roof", color: [0.78, 0.28, 0.22, 1], roughness: 0.65 },
  wood: { name: "weathered_wood", color: [0.48, 0.29, 0.14, 1], roughness: 0.76 },
  darkWood: { name: "dark_beam_wood", color: [0.28, 0.17, 0.1, 1], roughness: 0.78 },
  glass: { name: "glowing_blue_glass", color: [0.45, 0.85, 1.0, 1], roughness: 0.28, emissive: [0.08, 0.28, 0.42] },
  grass: { name: "dream_grass", color: [0.36, 0.78, 0.38, 1], roughness: 0.92 },
  sand: { name: "soft_sand", color: [0.92, 0.73, 0.42, 1], roughness: 0.9 },
  path: { name: "golden_path", color: [0.75, 0.55, 0.28, 1], roughness: 0.86 },
  flower: { name: "flower_pink", color: [1.0, 0.36, 0.54, 1], roughness: 0.75 },
};

function character() {
  const materials = [MAT.blue, MAT.skin, MAT.wood, { name: "straw_hat", color: [0.88, 0.68, 0.27, 1], roughness: 0.72 }, { name: "dark_hair", color: [0.17, 0.1, 0.06, 1], roughness: 0.75 }];
  const meshes = [
    { name: "body_coat", material: 0, ...mergeParts([makeCylinder(0.34, 0.42, 1.15, 20, { pos: [0, 0.55, 0], scale: [0.85, 1, 0.72] })]) },
    { name: "head", material: 1, ...makeSphere(0.28, 10, 20, { pos: [0, 1.33, 0] }) },
    { name: "hair_cap", material: 4, ...makeSphere(0.29, 8, 18, { pos: [0, 1.42, -0.03], scale: [1.05, 0.48, 1] }) },
    { name: "straw_hat", material: 3, ...mergeParts([
      makeCylinder(0.52, 0.52, 0.04, 28, { pos: [0, 1.58, 0] }),
      makeCylinder(0.02, 0.44, 0.32, 28, { pos: [0, 1.76, 0] }),
    ]) },
    { name: "arms_and_rod", material: 2, ...mergeParts([
      makeCylinder(0.06, 0.07, 0.58, 12, { pos: [-0.43, 0.62, 0.03], ry: -0.25 }),
      makeCylinder(0.06, 0.07, 0.58, 12, { pos: [0.43, 0.62, 0.03], ry: 0.25 }),
      makeBox(0.04, 0.04, 1.55, { pos: [0.55, 0.75, 0.62], ry: -0.45 }),
    ]) },
    { name: "boots", material: 4, ...mergeParts([
      makeBox(0.22, 0.12, 0.32, { pos: [-0.15, 0.02, 0.08] }),
      makeBox(0.22, 0.12, 0.32, { pos: [0.15, 0.02, 0.08] }),
    ]) },
  ];
  writeGlb(path.join(outRoot, "characters", "player_base_character.glb"), "player_base_character", meshes, materials);
}

function tavern() {
  const materials = [MAT.cream, MAT.redRoof, MAT.wood, MAT.darkWood, MAT.glass, { name: "sign_gold", color: [0.95, 0.73, 0.28, 1], roughness: 0.55, emissive: [0.18, 0.12, 0.02] }];
  const meshes = [
    { name: "main_walls", material: 0, ...makeBox(4.2, 3.2, 4.4, { pos: [0, 1.6, 0] }) },
    { name: "roof", material: 1, ...makeCylinder(0, 3.25, 1.75, 4, { pos: [0, 4.35, 0], ry: Math.PI / 4, scale: [1.1, 1, 0.95] }) },
    { name: "wood_beams", material: 3, ...mergeParts([
      makeBox(4.55, 0.18, 0.18, { pos: [0, 3.22, 2.28] }),
      makeBox(4.55, 0.18, 0.18, { pos: [0, 3.22, -2.28] }),
      makeBox(0.18, 3.1, 0.18, { pos: [-1.95, 1.65, 2.28] }),
      makeBox(0.18, 3.1, 0.18, { pos: [1.95, 1.65, 2.28] }),
      makeBox(4.7, 0.18, 0.8, { pos: [0, 0.16, 2.55] }),
    ]) },
    { name: "door", material: 2, ...makeBox(0.9, 1.45, 0.1, { pos: [0, 0.88, 2.26] }) },
    { name: "windows", material: 4, ...mergeParts([
      makeBox(0.72, 0.58, 0.1, { pos: [-1.25, 1.9, 2.3] }),
      makeBox(0.72, 0.58, 0.1, { pos: [1.25, 1.9, 2.3] }),
      makeBox(0.65, 0.5, 0.1, { pos: [-2.15, 1.8, 0.8], ry: Math.PI / 2 }),
    ]) },
    { name: "chimney_and_sign", material: 5, ...mergeParts([
      makeCylinder(0.16, 0.2, 0.95, 12, { pos: [1.15, 5.2, -0.6] }),
      makeBox(2.0, 0.55, 0.12, { pos: [0, 3.15, 2.64] }),
    ]) },
    { name: "porch_props", material: 2, ...mergeParts([
      makeCylinder(0.08, 0.1, 1.2, 10, { pos: [-1.85, 0.78, 2.85] }),
      makeCylinder(0.08, 0.1, 1.2, 10, { pos: [1.85, 0.78, 2.85] }),
      makeBox(4.2, 0.16, 1.05, { pos: [0, 0.28, 2.8] }),
    ]) },
  ];
  writeGlb(path.join(outRoot, "buildings", "seaside_tavern.glb"), "seaside_tavern", meshes, materials);
}

function terrain() {
  const materials = [MAT.sand, MAT.grass, MAT.path, MAT.flower, { name: "shore_stone", color: [0.55, 0.58, 0.54, 1], roughness: 0.82 }];
  const flowerParts = [];
  const stoneParts = [];
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    if (i % 4 === 0) stoneParts.push(makeSphere(0.24, 5, 10, { pos: [Math.cos(a) * 21.5, 0.25, Math.sin(a) * 15.8], scale: [1.4, 0.45, 1] }));
  }
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    flowerParts.push(makeCylinder(0.11, 0.06, 0.24, 8, { pos: [-10 + Math.cos(a) * 3.4, 0.62, -7 + Math.sin(a) * 3.4] }));
  }
  const meshes = [
    { name: "sand_beach_ellipse", material: 0, ...makeCylinder(21.5, 23.5, 0.24, 128, { pos: [0, 0.12, 0], scale: [1, 1, 0.78] }) },
    { name: "grass_island_ellipse", material: 1, ...makeCylinder(18.5, 20.5, 0.82, 128, { pos: [0, 0.56, 0], scale: [1, 1, 0.78] }) },
    { name: "stone_paths", material: 2, ...mergeParts([
      makeBox(17, 0.08, 2.1, { pos: [0, 1.02, 1.2], ry: 0.08 }),
      makeBox(2.2, 0.08, 19, { pos: [1.8, 1.04, -1.6], ry: -0.18 }),
      makeBox(7.0, 0.08, 1.4, { pos: [-7.0, 1.05, 7.4], ry: 0.45 }),
    ]) },
    { name: "garden_flowers", material: 3, ...mergeParts(flowerParts) },
    { name: "shore_stones", material: 4, ...mergeParts(stoneParts) },
  ];
  writeGlb(path.join(outRoot, "environment", "dream_bay_terrain.glb"), "dream_bay_terrain", meshes, materials);
}

character();
tavern();
terrain();
