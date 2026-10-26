const canvas = document.getElementById("scene");
const ui = {
  startPanel: document.getElementById("startPanel"),
  startBtn: document.getElementById("startBtn"),
  notice: document.getElementById("notice"),
  modeText: document.getElementById("modeText"),
  onlineText: document.getElementById("onlineText"),
  timeText: document.getElementById("timeText"),
  zoneText: document.getElementById("zoneText"),
  hintText: document.getElementById("hintText"),
  inventory: document.getElementById("inventory"),
  fishBtn: document.getElementById("fishBtn"),
  buildBtn: document.getElementById("buildBtn"),
  interactBtn: document.getElementById("interactBtn"),
  onlineBtn: document.getElementById("onlineBtn"),
  onlineBadge: document.getElementById("onlineBadge"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  closeModal: document.getElementById("closeModal"),
};

const itemMeta = {
  fish: ["Fresh fish", "Fsh"],
  driftwood: ["Driftwood", "Wod"],
  reed: ["Sea reed", "Red"],
  shell: ["Shell", "Shl"],
  stone: ["Tide stone", "Stn"],
  pearl: ["Pearl", "Prl"],
  coral: ["Coral", "Cor"],
};

const buildCatalog = {
  hut: {
    name: "Dream Hut",
    cost: { driftwood: 8, reed: 4, shell: 2 },
    size: [2.6, 2.4, 2.4],
    color: "#ffe1a6",
    roof: "#ca6954",
  },
  cottage: {
    name: "Cove Cottage",
    cost: { driftwood: 18, stone: 8, shell: 6, pearl: 1 },
    size: [3.4, 3.2, 3.0],
    color: "#fff0c9",
    roof: "#5c9bd3",
  },
  lamp: {
    name: "Glow Lamp",
    cost: { driftwood: 2, shell: 1 },
    size: [0.6, 2.0, 0.6],
    color: "#5a3c24",
    roof: "#ffd16a",
  },
  planter: {
    name: "Flower Planter",
    cost: { driftwood: 2, reed: 3, coral: 1 },
    size: [1.8, 0.7, 0.8],
    color: "#a16a40",
    roof: "#ff86a0",
  },
};

const lootTable = [
  { item: "fish", min: 1, max: 3, weight: 30 },
  { item: "driftwood", min: 1, max: 3, weight: 24 },
  { item: "reed", min: 1, max: 3, weight: 18 },
  { item: "shell", min: 1, max: 2, weight: 13 },
  { item: "stone", min: 1, max: 2, weight: 8 },
  { item: "coral", min: 1, max: 1, weight: 5 },
  { item: "pearl", min: 1, max: 1, weight: 2 },
];

const zones = [
  { id: "dock", name: "Moonlit Dock", x: -7, z: 12, r: 6, hint: "Press F to start fishing QTE" },
  { id: "build", name: "Free Build Meadow", x: -8, z: 1, r: 7, hint: "Press B to open build mode" },
  { id: "tavern", name: "Tiny Tavern", x: 8, z: 2, r: 4, hint: "Press E to talk and trade" },
  { id: "study", name: "Study Room", x: 2, z: -8, r: 4, hint: "Press E to study blueprints" },
  { id: "garden", name: "Pet Garden", x: -10, z: -7, r: 5, hint: "Press E to adopt a pet" },
  { id: "volley", name: "Volley Court", x: 11, z: -7, r: 5, hint: "Press E to play a QTE minigame" },
];

const state = {
  started: false,
  minute: 8 * 60,
  day: 1,
  mode: "explore",
  selectedBuild: "hut",
  buildRotation: 0,
  inv: { fish: 3, driftwood: 4, reed: 2, shell: 1, stone: 0, pearl: 0, coral: 0 },
  pets: [],
  buildings: [],
  player: {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name: `Fisher-${Math.floor(Math.random() * 900 + 100)}`,
    x: -4,
    z: 8,
    yaw: 0,
  },
  peers: new Map(),
};

let engine;
let scene;
let camera;
let player;
let playerBody;
let petRoot = null;
let ghost = null;
let socket = null;
let channel = null;
let lastNetSend = 0;
let noticeTimer = 0;
let mouseYaw = 0;
let mousePitch = 0.42;
let pointerLocked = false;
let currentQte = null;
let modelManifest = { root: "./assets/models/", assets: {} };
const keys = new Set();
const peerMeshes = new Map();
const buildMeshes = [];
const animated = [];

boot();

async function boot() {
  if (!window.BABYLON) {
    showFatal("Babylon.js did not load. Check internet access for https://cdn.babylonjs.com/babylon.js");
    return;
  }

  await loadModelManifest();
  engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true,
  });
  scene = createScene();
  wireEvents();
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    if (state.started) update(dt);
    animateWorld(dt);
    scene.render();
  });
  window.addEventListener("resize", () => engine.resize());
  updateUi();
}

async function loadModelManifest() {
  try {
    const response = await fetch("./assets/models/model-manifest.json", { cache: "no-store" });
    if (response.ok) modelManifest = await response.json();
  } catch {
    modelManifest = { root: "./assets/models/", assets: {} };
  }
}

function createScene() {
  const s = new BABYLON.Scene(engine);
  s.clearColor = new BABYLON.Color4(0.65, 0.91, 0.96, 1);
  s.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  s.fogColor = new BABYLON.Color3(0.72, 0.92, 0.92);
  s.fogDensity = 0.011;
  s.imageProcessingConfiguration.toneMappingEnabled = true;
  s.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  s.imageProcessingConfiguration.exposure = 1.08;
  s.imageProcessingConfiguration.contrast = 1.14;
  s.collisionsEnabled = true;

  camera = new BABYLON.FreeCamera("thirdPersonCamera", new BABYLON.Vector3(0, 7, -10), s);
  camera.minZ = 0.1;
  camera.maxZ = 180;

  const hemi = new BABYLON.HemisphericLight("skyLight", new BABYLON.Vector3(0, 1, 0), s);
  hemi.intensity = 0.82;
  hemi.diffuse = BABYLON.Color3.FromHexString("#fff4da");
  hemi.groundColor = BABYLON.Color3.FromHexString("#55755e");

  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.55, -0.86, -0.35), s);
  sun.position = new BABYLON.Vector3(28, 42, 22);
  sun.intensity = 3.2;
  const shadows = new BABYLON.ShadowGenerator(2048, sun);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 18;

  new BABYLON.GlowLayer("dreamGlow", s, { blurKernelSize: 48 }).intensity = 0.35;
  makeSky(s);
  makeWorld(s, shadows);
  makePlayer(s, shadows);
  return s;
}

function pbr(name, color, roughness = 0.75, metallic = 0, emissive = null) {
  const m = new BABYLON.PBRMaterial(name, scene);
  m.albedoColor = BABYLON.Color3.FromHexString(color);
  m.roughness = roughness;
  m.metallic = metallic;
  if (emissive) {
    m.emissiveColor = BABYLON.Color3.FromHexString(emissive);
    m.emissiveIntensity = 0.65;
  }
  return m;
}

function assetDef(assetId) {
  return modelManifest.assets?.[assetId] || { fallback: "marker", file: "" };
}

function spawnAsset(assetId, options = {}) {
  const def = assetDef(assetId);
  const root = new BABYLON.TransformNode(options.name || assetId, scene);
  const position = options.position || def.position || [0, 0, 0];
  const scale = options.scale || def.scale || [1, 1, 1];
  root.position.set(position[0], position[1], position[2]);
  root.scaling.set(scale[0], scale[1], scale[2]);
  root.rotation.y = options.rotationY || 0;
  root.metadata = { assetId, source: "glb", def };

  const fallback = createAssetFallback(def.fallback, assetId, options);
  fallback.parent = root;
  fallback.metadata = { fallbackFor: assetId };
  applyAssetFlags(root, def, options);

  if (def.file && !options.preview) {
    const url = `${modelManifest.root || "./assets/models/"}${def.file}`;
    BABYLON.SceneLoader.ImportMeshAsync("", "", url, scene)
      .then((result) => {
        fallback.dispose();
        const importedRoot = new BABYLON.TransformNode(`${assetId}-glbRoot`, scene);
        importedRoot.parent = root;
        for (const mesh of result.meshes) {
          mesh.parent = importedRoot;
          mesh.isPickable = options.pickable ?? true;
          mesh.checkCollisions = Boolean(options.collidable ?? def.collidable);
          mesh.receiveShadows = Boolean(options.receivesShadows ?? def.receivesShadows);
          if (options.alpha !== undefined && mesh.material) mesh.material.alpha = options.alpha;
        }
        root.metadata.loaded = true;
        root.metadata.animations = result.animationGroups || [];
      })
      .catch(() => {
        root.metadata.loaded = false;
        root.metadata.missing = url;
      });
  }

  return root;
}

function applyAssetFlags(root, def, options) {
  const collidable = Boolean(options.collidable ?? def.collidable);
  const pickable = options.pickable ?? true;
  for (const mesh of root.getChildMeshes()) {
    mesh.isPickable = pickable;
    mesh.checkCollisions = collidable;
    mesh.receiveShadows = Boolean(options.receivesShadows ?? def.receivesShadows);
    if (options.alpha !== undefined && mesh.material) {
      mesh.material.alpha = options.alpha;
      mesh.visibility = options.alpha;
    }
  }
}

function createAssetFallback(kind, assetId, options) {
  if (kind === "terrain") return fallbackTerrain(assetId);
  if (kind === "water") return fallbackWater(assetId);
  if (kind === "house") return fallbackHouse(assetId, options);
  if (kind === "buildHouse") return fallbackBuildHouse(assetId, options);
  if (kind === "dock") return fallbackDock(assetId);
  if (kind === "garden") return fallbackGarden(assetId);
  if (kind === "volley") return fallbackVolley(assetId);
  if (kind === "tree") return fallbackTree(assetId, options);
  if (kind === "flowers") return fallbackFlowers(assetId);
  if (kind === "character") return fallbackCharacter(assetId, options);
  if (kind === "pet") return fallbackPet(assetId);
  if (kind === "lamp") return fallbackLamp(assetId, options);
  if (kind === "planter") return fallbackPlanter(assetId, options);
  return fallbackMarker(assetId);
}

function fallbackMarker(assetId) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  const mesh = BABYLON.MeshBuilder.CreateBox(`${assetId}-marker`, { size: 1 }, scene);
  mesh.parent = root;
  mesh.position.y = 0.5;
  mesh.material = pbr(`${assetId}-markerMat`, "#ff75a0", 0.7);
  return root;
}

function fallbackWater(assetId) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  const water = BABYLON.MeshBuilder.CreateGround(`${assetId}-water`, { width: 220, height: 220, subdivisions: 80 }, scene);
  water.parent = root;
  water.material = pbr(`${assetId}-waterMat`, "#4fc5d7", 0.28, 0, "#167f9f");
  water.material.alpha = 0.82;
  water.isPickable = false;
  animated.push({ type: "water", node: water });
  return root;
}

function fallbackTerrain(assetId) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  const beach = BABYLON.MeshBuilder.CreateCylinder(`${assetId}-beach`, { diameterTop: 43, diameterBottom: 47, height: 0.22, tessellation: 128 }, scene);
  beach.parent = root;
  beach.position.y = 0.1;
  beach.scaling.z = 0.78;
  beach.material = pbr(`${assetId}-sandMat`, "#f0cf8e", 0.88);
  const island = BABYLON.MeshBuilder.CreateCylinder(`${assetId}-island`, { diameterTop: 38, diameterBottom: 42, height: 0.82, tessellation: 128 }, scene);
  island.parent = root;
  island.position.y = 0.58;
  island.scaling.z = 0.78;
  island.material = pbr(`${assetId}-grassMat`, "#74c878", 0.92);
  return root;
}

function fallbackHouse(assetId, options = {}) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  const color = options.color || "#fff0c9";
  const roofColor = options.roof || "#cf6756";
  const body = BABYLON.MeshBuilder.CreateBox(`${assetId}-body`, { width: 3.6, height: 3, depth: 3.6 }, scene);
  body.parent = root;
  body.position.y = 2.55;
  body.material = pbr(`${assetId}-bodyMat`, color, 0.72);
  const roof = BABYLON.MeshBuilder.CreateCylinder(`${assetId}-roof`, { diameterTop: 0, diameterBottom: 4.8, height: 1.7, tessellation: 4 }, scene);
  roof.parent = root;
  roof.position.y = 4.9;
  roof.rotation.y = Math.PI / 4;
  roof.material = pbr(`${assetId}-roofMat`, roofColor, 0.62);
  const door = BABYLON.MeshBuilder.CreateBox(`${assetId}-door`, { width: 0.8, height: 1.3, depth: 0.08 }, scene);
  door.parent = root;
  door.position.set(0, 1.75, 1.85);
  door.material = pbr(`${assetId}-doorMat`, "#5f3d27", 0.76);
  return root;
}

function fallbackBuildHouse(assetId, options = {}) {
  const catalog = options.catalog || buildCatalog[options.buildType || "hut"] || buildCatalog.hut;
  return fallbackHouse(assetId, { color: catalog.color, roof: catalog.roof });
}

function fallbackDock(assetId) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  const wood = pbr(`${assetId}-wood`, "#8b6239", 0.72);
  const dark = pbr(`${assetId}-darkWood`, "#5d3b25", 0.78);
  for (let i = 0; i < 9; i++) {
    const plank = BABYLON.MeshBuilder.CreateBox(`${assetId}-plank`, { width: 1.25, height: 0.22, depth: 1.1 }, scene);
    plank.parent = root;
    plank.position.set(-2.75 + i * 0.85, 1.05 + Math.sin(i) * 0.012, 0);
    plank.rotation.z = i % 2 ? 0.02 : -0.02;
    plank.material = wood;
  }
  for (let i = 0; i < 4; i++) {
    for (const z of [-1.5, 1.9]) {
      const post = BABYLON.MeshBuilder.CreateCylinder(`${assetId}-post`, { diameterTop: 0.22, diameterBottom: 0.28, height: 1.4, tessellation: 10 }, scene);
      post.parent = root;
      post.position.set(-2.5 + i * 2.4, 0.8, z);
      post.material = dark;
    }
  }
  return root;
}

function fallbackGarden(assetId) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  const disc = BABYLON.MeshBuilder.CreateCylinder(`${assetId}-disc`, { diameter: 8.6, height: 0.13, tessellation: 64 }, scene);
  disc.parent = root;
  disc.position.y = 1.18;
  disc.material = pbr(`${assetId}-mat`, "#7bd17d", 0.9);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const flower = BABYLON.MeshBuilder.CreateCylinder(`${assetId}-flower`, { diameterTop: 0.32, diameterBottom: 0.18, height: 0.25, tessellation: 10 }, scene);
    flower.parent = root;
    flower.position.set(Math.cos(a) * 3.5, 1.45, Math.sin(a) * 3.5);
    flower.material = pbr(`${assetId}-flowerMat-${i}`, i % 2 ? "#ff8aa5" : "#ffd76b", 0.8);
  }
  return root;
}

function fallbackVolley(assetId) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  const court = BABYLON.MeshBuilder.CreateBox(`${assetId}-court`, { width: 7.4, height: 0.08, depth: 5.2 }, scene);
  court.parent = root;
  court.position.y = 1.2;
  court.material = pbr(`${assetId}-sand`, "#dcb970", 0.86);
  const net = BABYLON.MeshBuilder.CreatePlane(`${assetId}-net`, { width: 5.5, height: 1.55 }, scene);
  net.parent = root;
  net.position.y = 2.1;
  net.rotation.y = Math.PI / 2;
  net.material = pbr(`${assetId}-netMat`, "#eef8f4", 0.55);
  net.material.alpha = 0.45;
  const ball = BABYLON.MeshBuilder.CreateSphere(`${assetId}-ball`, { diameter: 0.75, segments: 24 }, scene);
  ball.parent = root;
  ball.position.set(-2, 1.75, 0.6);
  ball.material = pbr(`${assetId}-ballMat`, "#ffffff", 0.45);
  animated.push({ type: "ball", node: ball, seed: 1 });
  return root;
}

function fallbackTree(assetId, options = {}) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  const trunk = BABYLON.MeshBuilder.CreateCylinder(`${assetId}-trunk`, { diameterTop: 0.28, diameterBottom: 0.42, height: 1.9, tessellation: 10 }, scene);
  trunk.parent = root;
  trunk.position.y = 1.0;
  trunk.material = pbr(`${assetId}-trunkMat`, "#7a5534", 0.82);
  const crown = BABYLON.MeshBuilder.CreateSphere(`${assetId}-crown`, { diameter: options.large ? 2.6 : 2.1, segments: 14 }, scene);
  crown.parent = root;
  crown.position.y = options.large ? 2.8 : 2.45;
  crown.scaling.set(1.15, 0.82, 1.05);
  crown.material = pbr(`${assetId}-crownMat`, options.color || "#66bd69", 0.9);
  return root;
}

function fallbackFlowers(assetId) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  for (let i = 0; i < 6; i++) {
    const flower = BABYLON.MeshBuilder.CreateSphere(`${assetId}-flower`, { diameter: 0.18, segments: 8 }, scene);
    flower.parent = root;
    flower.position.set(-0.5 + i * 0.2, 0.16 + Math.sin(i) * 0.03, Math.cos(i) * 0.18);
    flower.material = pbr(`${assetId}-mat-${i}`, i % 2 ? "#ff86a0" : "#ffd76b", 0.8);
  }
  return root;
}

function fallbackCharacter(assetId, options = {}) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  const color = options.color || "#3772b8";
  const body = BABYLON.MeshBuilder.CreateCapsule(`${assetId}-body`, { radius: 0.34, height: 1.18, tessellation: 12 }, scene);
  body.parent = root;
  body.position.y = 0.25;
  body.material = pbr(`${assetId}-bodyMat`, color, 0.68);
  const head = BABYLON.MeshBuilder.CreateSphere(`${assetId}-head`, { diameter: 0.52, segments: 18 }, scene);
  head.parent = root;
  head.position.y = 1.08;
  head.material = pbr(`${assetId}-skin`, "#f0b989", 0.68);
  const hat = BABYLON.MeshBuilder.CreateCylinder(`${assetId}-hat`, { diameterTop: 0, diameterBottom: 0.96, height: 0.28, tessellation: 24 }, scene);
  hat.parent = root;
  hat.position.y = 1.38;
  hat.material = pbr(`${assetId}-hatMat`, "#e7c66e", 0.68);
  const rod = BABYLON.MeshBuilder.CreateBox(`${assetId}-rod`, { width: 0.045, height: 0.045, depth: 1.25 }, scene);
  rod.parent = root;
  rod.position.set(0.42, 0.42, 0.38);
  rod.rotation.x = -0.72;
  rod.material = pbr(`${assetId}-rodMat`, "#5f3b22", 0.7);
  return root;
}

function fallbackPet(assetId) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  const mat = pbr(`${assetId}-petMat`, "#f2d36f", 0.78);
  const body = BABYLON.MeshBuilder.CreateSphere(`${assetId}-body`, { diameter: 0.7, segments: 16 }, scene);
  body.parent = root;
  body.scaling.set(1.1, 0.82, 1);
  body.material = mat;
  const head = BABYLON.MeshBuilder.CreateSphere(`${assetId}-head`, { diameter: 0.48, segments: 16 }, scene);
  head.parent = root;
  head.position.set(0, 0.32, 0.28);
  head.material = mat;
  return root;
}

function fallbackLamp(assetId, options = {}) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  const pole = BABYLON.MeshBuilder.CreateCylinder(`${assetId}-pole`, { diameter: 0.12, height: 1.8, tessellation: 8 }, scene);
  pole.parent = root;
  pole.position.y = 0.95;
  pole.material = pbr(`${assetId}-poleMat`, "#5a3c24", 0.74);
  const orb = BABYLON.MeshBuilder.CreateSphere(`${assetId}-orb`, { diameter: 0.34, segments: 16 }, scene);
  orb.parent = root;
  orb.position.y = 1.9;
  orb.material = pbr(`${assetId}-orbMat`, "#ffd16a", 0.35, 0, "#ffa13d");
  return root;
}

function fallbackPlanter(assetId, options = {}) {
  const root = new BABYLON.TransformNode(`${assetId}-fallback`, scene);
  const base = BABYLON.MeshBuilder.CreateBox(`${assetId}-base`, { width: 1.8, height: 0.45, depth: 0.8 }, scene);
  base.parent = root;
  base.position.y = 0.28;
  base.material = pbr(`${assetId}-baseMat`, "#a16a40", 0.75);
  for (let i = 0; i < 5; i++) {
    const flower = BABYLON.MeshBuilder.CreateSphere(`${assetId}-flower`, { diameter: 0.18, segments: 8 }, scene);
    flower.parent = root;
    flower.position.set(-0.65 + i * 0.32, 0.65, Math.sin(i) * 0.16);
    flower.material = pbr(`${assetId}-flowerMat-${i}`, i % 2 ? "#ff86a0" : "#ffd76b", 0.8);
  }
  return root;
}

function makeSky(s) {
  const dome = BABYLON.MeshBuilder.CreateSphere("gradientSky", { diameter: 180, segments: 32 }, s);
  dome.material = pbr("skyMat", "#9ee8fb", 1, 0, "#7dd7ef");
  dome.material.backFaceCulling = false;
  dome.isPickable = false;

  const sun = BABYLON.MeshBuilder.CreateSphere("sunDisk", { diameter: 5.5, segments: 24 }, s);
  sun.position.set(34, 42, -26);
  sun.material = pbr("sunDiskMat", "#ffe79c", 0.45, 0, "#ffd676");
  sun.isPickable = false;

  for (let i = 0; i < 9; i++) {
    const cloud = new BABYLON.TransformNode(`cloud-${i}`, s);
    const mat = pbr(`cloudMat-${i}`, "#ffffff", 0.9);
    mat.alpha = 0.78;
    const parts = [
      [-1.3, 0, 0, 1.4, 0.52, 0.8],
      [-0.2, 0.2, 0, 1.55, 0.7, 0.9],
      [1.1, 0.05, 0, 1.2, 0.5, 0.75],
    ];
    for (const [x, y, z, sx, sy, sz] of parts) {
      const puff = BABYLON.MeshBuilder.CreateSphere("cloudPuff", { diameter: 2, segments: 12 }, s);
      puff.parent = cloud;
      puff.position.set(x, y, z);
      puff.scaling.set(sx, sy, sz);
      puff.material = mat;
      puff.isPickable = false;
    }
    const a = (i / 9) * Math.PI * 2;
    cloud.position.set(Math.cos(a) * (34 + (i % 3) * 8), 19 + (i % 4), Math.sin(a) * (28 + (i % 2) * 8));
    cloud.rotation.y = -a;
    animated.push({ type: "cloud", node: cloud, seed: i });
  }
}

function makeWorld(s, shadows) {
  spawnAsset("water.stylizedBay", { pickable: false });
  spawnAsset("terrain.dreamBay", { collidable: true, receivesShadows: true });

  makePath(0, 1.08, 1.2, 17, 2.1, 0.08);
  makePath(1.8, 1.1, -1.6, 2.2, 19, -0.18);
  makeTerrainPatches();
  makeCoastDetails();
  makeDock(shadows);
  makeTown(shadows);
  makeGarden(shadows);
  makeVolley(shadows);
  makeBuildMeadow(shadows);
  makeTrees(shadows);
  makeLights();
}

function makePath(x, y, z, w, d, rot) {
  const path = BABYLON.MeshBuilder.CreateBox("stonePath", { width: w, height: 0.08, depth: d }, scene);
  path.position.set(x, y, z);
  path.rotation.y = rot;
  path.material = pbr(`pathMat-${x}-${z}`, "#d7b56f", 0.86);
  path.receiveShadows = true;
}

function makeTerrainPatches() {
  const mat = pbr("patchMat", "#91db8c", 0.95);
  [
    [-4, -5.5, 6.2, 2.2, 0.1],
    [7.2, 7.5, 5.2, 1.6, -0.35],
    [-11, 5.8, 4.3, 1.5, 0.42],
    [9.8, -3.8, 3.4, 1.3, -0.25],
  ].forEach(([x, z, sx, sz, r]) => {
    const disc = BABYLON.MeshBuilder.CreateDisc("grassPatch", { radius: 1, tessellation: 36 }, scene);
    disc.rotation.x = Math.PI / 2;
    disc.rotation.z = r;
    disc.scaling.set(sx, sz, 1);
    disc.position.set(x, 1.14, z);
    disc.material = mat;
  });
}

function makeCoastDetails() {
  for (let i = 0; i < 56; i++) {
    const a = (i / 56) * Math.PI * 2;
    const x = Math.cos(a) * (22 + Math.sin(i * 3.1) * 0.9);
    const z = Math.sin(a) * (16.5 + Math.cos(i * 2.7) * 0.8);
    if (i % 4 === 0) makeStone(x, z, i);
    if (i % 5 === 0) makeCoral(x, z, i);
    if (i % 3 === 0) makeShell(x, z, i);
  }
}

function makeStone(x, z, seed) {
  const stone = BABYLON.MeshBuilder.CreateSphere("shoreStone", { diameter: 0.55 + (seed % 4) * 0.08, segments: 10 }, scene);
  stone.position.set(x, 1.02, z);
  stone.scaling.set(1.3, 0.42, 0.88);
  stone.rotation.y = seed;
  stone.material = pbr(`stone-${seed}`, seed % 2 ? "#b2ad9f" : "#8f9890", 0.8);
  stone.receiveShadows = true;
}

function makeCoral(x, z, seed) {
  const root = new BABYLON.TransformNode(`coral-${seed}`, scene);
  root.position.set(x, 1.04, z);
  const mat = pbr(`coralMat-${seed}`, seed % 2 ? "#f06f80" : "#ffa65c", 0.68);
  for (let i = 0; i < 4; i++) {
    const branch = BABYLON.MeshBuilder.CreateCylinder("coralBranch", { diameterTop: 0.06, diameterBottom: 0.12, height: 0.5 + i * 0.05, tessellation: 7 }, scene);
    branch.parent = root;
    branch.position.set((i - 1.5) * 0.11, 0.22 + i * 0.04, Math.sin(i + seed) * 0.08);
    branch.rotation.z = (i - 1.4) * 0.38;
    branch.material = mat;
  }
}

function makeShell(x, z, seed) {
  const shell = BABYLON.MeshBuilder.CreateSphere("shell", { diameter: 0.38, segments: 12 }, scene);
  shell.position.set(x, 1.03, z);
  shell.scaling.set(1, 0.25, 0.68);
  shell.rotation.y = seed;
  shell.material = pbr(`shell-${seed}`, seed % 2 ? "#ffe1cf" : "#f5f0df", 0.58);
}

function makeDock(shadows) {
  spawnAsset("prop.dock", { position: [-4.5, 0, 13.8], collidable: true });
}

function makeTown(shadows) {
  spawnAsset("building.tavern", { position: [8, 0, 2], color: "#fff0c9", roof: "#cf6756", collidable: true });
  spawnAsset("building.study", { position: [2, 0, -8], color: "#fff7dc", roof: "#5f92c7", collidable: true });
  spawnAsset("building.home", { position: [-8, 0, 1], color: "#ffe1a6", roof: "#c98054", collidable: true });
  spawnAsset("character.npcMayor", { position: [-1, 1.43, 1.8], color: "#b85858", collidable: true });
  spawnAsset("character.npcTavern", { position: [6.4, 1.43, 3.4], color: "#527ea8", collidable: true });
  makeLabel("Tavern", 8, 6.5, 2);
  makeLabel("Study", 2, 6.2, -8);
  makeLabel("Home", -8, 5.8, 1);
  makeFountain();
  makeStall(-4.5, 5.7, "#f3c15e", shadows);
  makeStall(4.7, 6.2, "#6cc3de", shadows);
}

function makeLabel(text, x, y, z) {
  const plane = BABYLON.MeshBuilder.CreatePlane(`label-${text}`, { width: 3.6, height: 0.7 }, scene);
  plane.position.set(x, y, z);
  plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  const tex = new BABYLON.DynamicTexture(`tex-${text}`, { width: 512, height: 128 }, scene, true);
  tex.drawText(text, null, 78, "bold 58px Arial", "#fff4c8", "rgba(17,24,22,0.65)", true);
  const mat = new BABYLON.StandardMaterial(`labelMat-${text}`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.disableLighting = true;
  plane.material = mat;
  plane.isPickable = false;
}

function makeFountain() {
  const base = BABYLON.MeshBuilder.CreateCylinder("fountainBase", { diameter: 2.35, height: 0.3, tessellation: 36 }, scene);
  base.position.set(-0.6, 1.24, 0.25);
  base.material = pbr("fountainStone", "#b9b2a0", 0.75);
  const water = BABYLON.MeshBuilder.CreateCylinder("fountainWater", { diameter: 1.8, height: 0.08, tessellation: 36 }, scene);
  water.position.set(-0.6, 1.44, 0.25);
  water.material = pbr("fountainWaterMat", "#8ee7f5", 0.22, 0, "#2bb5d1");
  water.material.alpha = 0.72;
  animated.push({ type: "bob", node: water, seed: 3 });
}

function makeStall(x, z, color, shadows) {
  const base = BABYLON.MeshBuilder.CreateBox("stall", { width: 2.1, height: 0.25, depth: 1.15 }, scene);
  base.position.set(x, 1.35, z);
  base.material = pbr("stallWood", "#8f623b", 0.72);
  const awning = BABYLON.MeshBuilder.CreateBox("awning", { width: 2.4, height: 0.2, depth: 1.55 }, scene);
  awning.position.set(x, 2.22, z);
  awning.material = pbr(`awning-${x}`, color, 0.58);
  shadows.addShadowCaster(base);
  shadows.addShadowCaster(awning);
}

function makeGarden(shadows) {
  spawnAsset("prop.garden", { position: [-10, 0, -7], collidable: false });
}

function makeVolley(shadows) {
  spawnAsset("prop.volley", { position: [11, 0, -7], collidable: true });
}

function makeBuildMeadow(shadows) {
  const marker = BABYLON.MeshBuilder.CreateTorus("buildRing", { majorRadius: 4.3, minorRadius: 0.025, tessellation: 80 }, scene);
  marker.position.set(-8, 1.22, 1);
  marker.rotation.x = Math.PI / 2;
  marker.material = pbr("buildRingMat", "#fff1a4", 0.45, 0, "#ffc95a");
  animated.push({ type: "spin", node: marker, seed: 2 });
}

function makeTrees(shadows) {
  const points = [
    [-15, -4], [-13, -11], [-5, -12], [8, -12], [15, -2], [15, 8],
    [3, 10], [-13, 10], [-17, 2], [5, 6], [-4, -7], [12, 11],
  ];
  points.forEach(([x, z], i) => {
    spawnAsset("foliage.treeA", {
      position: [x, 0, z],
      scale: [i % 3 ? 1 : 1.18, i % 3 ? 1 : 1.18, i % 3 ? 1 : 1.18],
      rotationY: i * 0.71,
      color: i % 2 ? "#4ba25d" : "#66bd69",
      large: i % 3 === 0,
      collidable: true,
    });
  });
}

function makeLights() {
  [[-3.8, 3.4], [4.8, 3.2], [1.4, -3.2], [7.6, -5.3], [-7.1, -3.6]].forEach(([x, z], i) => {
    const pole = BABYLON.MeshBuilder.CreateCylinder("lampPole", { diameter: 0.12, height: 1.5, tessellation: 8 }, scene);
    pole.position.set(x, 1.85, z);
    pole.material = pbr("lampPoleMat", "#5d3b25", 0.75);
    const orb = BABYLON.MeshBuilder.CreateSphere("lampOrb", { diameter: 0.32, segments: 16 }, scene);
    orb.position.set(x, 2.65, z);
    orb.material = pbr(`lampOrb-${i}`, "#ffd16a", 0.38, 0, "#ffa13d");
    const light = new BABYLON.PointLight(`lampLight-${i}`, new BABYLON.Vector3(x, 2.55, z), scene);
    light.diffuse = BABYLON.Color3.FromHexString("#ffbb6c");
    light.intensity = 0.45;
    light.range = 6;
    animated.push({ type: "glow", node: orb, seed: i });
  });
}

function makePlayer(s, shadows) {
  player = new BABYLON.TransformNode("playerRoot", s);
  player.position.set(state.player.x, 1.43, state.player.z);
  playerBody = spawnAsset("character.player", { name: "playerAsset", position: [0, 0, 0], color: "#3772b8", collidable: true });
  playerBody.parent = player;
  playerBody.getChildMeshes().forEach((mesh) => shadows.addShadowCaster(mesh));
}

function wireEvents() {
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
    keys.add(key);
    if (!state.started) return;
    if (key === "f") startFishing();
    if (key === "b") openBuildMenu();
    if (key === "e" || key === " ") interact();
    if (key === "r" && state.mode === "build") state.buildRotation += Math.PI / 2;
    if (key === "escape") exitBuildMode();
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  canvas.addEventListener("click", () => {
    if (!pointerLocked && state.started) canvas.requestPointerLock?.();
    if (state.mode === "build" && ghost) placeBuild();
  });
  document.addEventListener("pointerlockchange", () => {
    pointerLocked = document.pointerLockElement === canvas;
  });
  document.addEventListener("mousemove", (event) => {
    if (!pointerLocked || !state.started) return;
    mouseYaw -= event.movementX * 0.0022;
    mousePitch = clamp(mousePitch - event.movementY * 0.0018, 0.18, 0.9);
  });
  ui.startBtn.addEventListener("click", startGame);
  ui.fishBtn.addEventListener("click", startFishing);
  ui.buildBtn.addEventListener("click", openBuildMenu);
  ui.interactBtn.addEventListener("click", interact);
  ui.onlineBtn.addEventListener("click", connectOnline);
  ui.closeModal.addEventListener("click", closeModal);
  ui.modal.addEventListener("click", (event) => {
    if (event.target === ui.modal) closeModal();
  });
}

function startGame() {
  state.started = true;
  ui.startPanel.classList.add("hidden");
  showNotice("Third-person Babylon.js prototype. WASD move, mouse look, F fish, B build.");
}

function update(dt) {
  updatePlayer(dt);
  updateCamera();
  updateBuildGhost();
  updateTime(dt);
  updateNetwork(dt);
  updateUi();
  if (noticeTimer > 0) {
    noticeTimer -= dt;
    if (noticeTimer <= 0) ui.notice.classList.remove("show");
  }
}

function updatePlayer(dt) {
  let mx = 0;
  let mz = 0;
  if (keys.has("w") || keys.has("arrowup")) mz += 1;
  if (keys.has("s") || keys.has("arrowdown")) mz -= 1;
  if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
  if (keys.has("d") || keys.has("arrowright")) mx += 1;
  if (mx || mz) {
    const len = Math.hypot(mx, mz);
    mx /= len;
    mz /= len;
    const forward = new BABYLON.Vector3(Math.sin(mouseYaw), 0, Math.cos(mouseYaw));
    const right = new BABYLON.Vector3(Math.cos(mouseYaw), 0, -Math.sin(mouseYaw));
    const move = forward.scale(mz).add(right.scale(mx)).normalize().scale(5.2 * dt);
    const nx = state.player.x + move.x;
    const nz = state.player.z + move.z;
    if (insideIsland(nx, nz)) {
      state.player.x = nx;
      state.player.z = nz;
      state.player.yaw = Math.atan2(move.x, move.z);
    }
  }
  player.position.x = state.player.x;
  player.position.z = state.player.z;
  player.rotation.y = state.player.yaw;
  if (petRoot) {
    petRoot.position.x += (state.player.x - Math.sin(state.player.yaw) * 1.15 - petRoot.position.x) * Math.min(1, dt * 4);
    petRoot.position.z += (state.player.z - Math.cos(state.player.yaw) * 1.15 - petRoot.position.z) * Math.min(1, dt * 4);
    petRoot.position.y = 1.25 + Math.sin(performance.now() * 0.006) * 0.08;
  }
}

function updateCamera() {
  const distance = 9;
  const height = 4.2 + mousePitch * 5.5;
  const target = new BABYLON.Vector3(state.player.x, 2.0, state.player.z);
  const behind = new BABYLON.Vector3(Math.sin(mouseYaw) * -distance, height, Math.cos(mouseYaw) * -distance);
  camera.position = BABYLON.Vector3.Lerp(camera.position, target.add(behind), 0.12);
  camera.setTarget(target);
}

function updateTime(dt) {
  state.minute += dt * 6;
  if (state.minute >= 24 * 60) {
    state.minute -= 24 * 60;
    state.day += 1;
  }
}

function animateWorld(dt) {
  const t = performance.now() * 0.001;
  for (const item of animated) {
    if (item.type === "cloud") item.node.position.x += Math.sin(t * 0.15 + item.seed) * dt * 0.25;
    if (item.type === "water") {
      const positions = item.node.getVerticesData(BABYLON.VertexBuffer.PositionKind);
      if (!positions) continue;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 2];
        positions[i + 1] = Math.sin(x * 0.12 + t) * 0.08 + Math.cos(z * 0.15 + t * 1.2) * 0.05;
      }
      item.node.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
    }
    if (item.type === "ball") item.node.position.y = 1.75 + Math.abs(Math.sin(t * 2.2)) * 0.8;
    if (item.type === "spin") item.node.rotation.z += dt * 0.55;
    if (item.type === "glow") item.node.scaling.setAll(1 + Math.sin(t * 2 + item.seed) * 0.08);
    if (item.type === "bob") item.node.position.y = 1.44 + Math.sin(t * 1.5 + item.seed) * 0.04;
  }
}

function startFishing() {
  if (!state.started) return;
  if (!canFishHere()) return showNotice("Move to the dock or shoreline first.");
  if (currentQte) return;
  const qte = { phase: "wait", cursor: 0, dir: 1, tension: 50, power: 0, start: performance.now() };
  currentQte = qte;
  openModal("Fishing QTE", `
    <div class="minigame">
      <p id="qteText">Casting line... wait for the bite.</p>
      <div class="timing-track">
        <div class="timing-window"></div>
        <div id="timingCursor" class="timing-cursor"></div>
      </div>
      <button id="qteBtn" type="button">Hook</button>
    </div>
  `);
  const cursor = document.getElementById("timingCursor");
  const text = document.getElementById("qteText");
  const button = document.getElementById("qteBtn");
  button.disabled = true;
  const loop = () => {
    if (currentQte !== qte || ui.modal.classList.contains("hidden")) {
      currentQte = null;
      return;
    }
    const elapsed = performance.now() - qte.start;
    if (qte.phase === "wait" && elapsed > 900 + Math.random() * 900) {
      qte.phase = "hook";
      text.textContent = "Bite! Hit Hook when the marker enters the green zone.";
      button.disabled = false;
    }
    qte.cursor += qte.dir * 1.7;
    if (qte.cursor > 98 || qte.cursor < 0) qte.dir *= -1;
    cursor.style.left = `${qte.cursor}%`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  button.addEventListener("click", () => finishFishing(qte));
}

function finishFishing(qte) {
  const hit = qte.cursor >= 42 && qte.cursor <= 58;
  const luck = hit ? 3 : 0;
  const loot = pickLoot(luck);
  const amount = hit ? randInt(loot.min, loot.max) : 1;
  state.inv[loot.item] += amount;
  closeModal();
  currentQte = null;
  showNotice(hit ? `Perfect catch: ${amount} ${itemMeta[loot.item][0]}.` : `Messy catch: 1 ${itemMeta[loot.item][0]}.`);
}

function openBuildMenu() {
  if (!state.started) return;
  const cards = Object.entries(buildCatalog).map(([key, item]) => `
    <button class="choice" data-build="${key}" ${hasCost(item.cost) ? "" : "disabled"}>
      <strong>${item.name}</strong>
      <small>${formatCost(item.cost)}<br>Free placement. Press R to rotate, click to place, Esc to cancel.</small>
    </button>
  `).join("");
  openModal("Free Build", `<div class="choice-grid">${cards}</div>`);
  for (const button of ui.modalBody.querySelectorAll("[data-build]")) {
    button.addEventListener("click", () => {
      state.selectedBuild = button.dataset.build;
      enterBuildMode();
      closeModal();
    });
  }
}

function enterBuildMode() {
  state.mode = "build";
  ui.modeText.textContent = "Build mode";
  createGhost();
  showNotice("Build mode: move mouse, click to place, R rotate, Esc cancel.");
}

function exitBuildMode() {
  state.mode = "explore";
  ui.modeText.textContent = "Explore the bay";
  if (ghost) {
    ghost.dispose();
    ghost = null;
  }
}

function createGhost() {
  if (ghost) ghost.dispose();
  ghost = makeBuildMesh(state.selectedBuild, new BABYLON.Vector3(0, 0, 0), true);
}

function updateBuildGhost() {
  if (state.mode !== "build" || !ghost) return;
  const pick = scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh.name !== "water");
  const point = pick?.pickedPoint || new BABYLON.Vector3(state.player.x + Math.sin(mouseYaw) * 3, 1.18, state.player.z + Math.cos(mouseYaw) * 3);
  ghost.position.x = clamp(point.x, -17, 17);
  ghost.position.z = clamp(point.z, -12, 12);
  ghost.position.y = 1.15;
  ghost.rotation.y = state.buildRotation;
}

function placeBuild() {
  const item = buildCatalog[state.selectedBuild];
  if (!item || !ghost || !hasCost(item.cost)) return showNotice("Not enough fishing resources.");
  payCost(item.cost);
  const pos = ghost.position.clone();
  const mesh = makeBuildMesh(state.selectedBuild, pos, false);
  mesh.rotation.y = state.buildRotation;
  buildMeshes.push(mesh);
  state.buildings.push({ type: state.selectedBuild, x: pos.x, z: pos.z, rot: state.buildRotation });
  showNotice(`${item.name} placed.`);
}

function makeBuildMesh(type, pos, preview) {
  const item = buildCatalog[type];
  const assetId = `building.${type}`;
  const root = spawnAsset(assetId, {
    name: `${preview ? "ghost" : "build"}-${type}`,
    position: [pos.x, pos.y, pos.z],
    preview,
    alpha: preview ? 0.45 : 1,
    buildType: type,
    catalog: item,
    color: item.color,
    roof: item.roof,
    pickable: !preview,
    collidable: !preview,
  });
  if (type === "lamp" && !preview) {
    const light = new BABYLON.PointLight(`placedLamp-${Date.now()}`, root.position.add(new BABYLON.Vector3(0, 1.8, 0)), scene);
    light.diffuse = BABYLON.Color3.FromHexString("#ffbb6c");
    light.intensity = 0.45;
    light.range = 6;
  }
  return root;
}

function interact() {
  if (!state.started) return;
  const zone = nearestZone();
  if (!zone) return showNotice("No town interaction nearby.");
  if (zone.id === "dock") return startFishing();
  if (zone.id === "build") return openBuildMenu();
  if (zone.id === "garden") return adoptPet();
  if (zone.id === "volley") return openVolleyQte();
  if (zone.id === "tavern") return openModal("Tiny Tavern", "<p>Phase 2: player trading and fish market will live here.</p>");
  if (zone.id === "study") return openModal("Study Room", "<p>Phase 2: blueprint research and rare rod upgrades will live here.</p>");
}

function adoptPet() {
  if (state.pets.length) return showNotice("Your pet is already following you.");
  if (!hasCost({ fish: 2, shell: 1 })) return showNotice("Need 2 Fresh fish and 1 Shell to attract a pet.");
  payCost({ fish: 2, shell: 1 });
  petRoot = spawnAsset("pet.saltPuff", { name: "petRoot", position: [state.player.x - 1, 1.25, state.player.z - 1] });
  state.pets.push("Salt Puff");
  showNotice("Salt Puff joined you.");
}

function openVolleyQte() {
  openModal("Volleyball QTE", `
    <div class="minigame">
      <p>Spike while the marker is in the green zone.</p>
      <div class="timing-track"><div class="timing-window"></div><div id="timingCursor" class="timing-cursor"></div></div>
      <button id="spikeBtn" type="button">Spike</button>
    </div>
  `);
  const cursor = document.getElementById("timingCursor");
  const start = performance.now();
  let active = true;
  function loop(now) {
    if (!active || ui.modal.classList.contains("hidden")) return;
    const p = (Math.sin((now - start) * 0.006) + 1) / 2;
    cursor.style.left = `${p * 98}%`;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  document.getElementById("spikeBtn").addEventListener("click", () => {
    const p = parseFloat(cursor.style.left || "0");
    active = false;
    closeModal();
    showNotice(p >= 42 && p <= 58 ? "Perfect spike." : "Missed timing.");
  });
}

function connectOnline() {
  if (socket?.readyState === WebSocket.OPEN) return showNotice("Already connected.");
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const host = location.host || "localhost:8787";
  try {
    socket = new WebSocket(`${protocol}//${host}/room`);
  } catch {
    startLocalChannel();
    return;
  }
  socket.addEventListener("open", () => {
    setOnline(true, "Online");
    socket.send(JSON.stringify({ type: "join", player: publicPlayer() }));
    showNotice("Connected. Phase 1 multiplayer: same-town presence.");
  });
  socket.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "players") msg.players.forEach((p) => p.id !== state.player.id && state.peers.set(p.id, p));
      if (msg.type === "player" && msg.player.id !== state.player.id) state.peers.set(msg.player.id, msg.player);
      if (msg.type === "leave") state.peers.delete(msg.id);
      renderPeers();
    } catch {
      // Ignore malformed packets.
    }
  });
  socket.addEventListener("close", () => {
    setOnline(false, "Offline");
    startLocalChannel();
  });
  socket.addEventListener("error", startLocalChannel);
}

function startLocalChannel() {
  if (channel) return;
  channel = new BroadcastChannel("blue-cove-babylon-room");
  channel.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "player" && msg.player.id !== state.player.id) {
      state.peers.set(msg.player.id, msg.player);
      renderPeers();
    }
  });
  setOnline(true, "Local");
  showNotice("WebSocket unavailable. Local multi-tab sync is active.");
}

function updateNetwork(dt) {
  lastNetSend += dt;
  if (lastNetSend < 0.14) return;
  lastNetSend = 0;
  const msg = { type: "player", player: publicPlayer() };
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  if (channel) channel.postMessage(msg);
}

function publicPlayer() {
  return { id: state.player.id, name: state.player.name, x: state.player.x, z: state.player.z, yaw: state.player.yaw };
}

function renderPeers() {
  for (const [id, data] of state.peers) {
    if (!peerMeshes.has(id)) {
      const root = spawnAsset("character.player", { name: `peer-${id}`, position: [0, 0, 0], color: "#7b68c4", collidable: false });
      peerMeshes.set(id, root);
    }
    const root = peerMeshes.get(id);
    root.position.set(data.x, 1.43, data.z);
    root.rotation.y = data.yaw || 0;
  }
  for (const [id, mesh] of peerMeshes) {
    if (!state.peers.has(id)) {
      mesh.dispose();
      peerMeshes.delete(id);
    }
  }
}

function setOnline(online, label) {
  ui.onlineBadge.textContent = label;
  ui.onlineBadge.classList.toggle("online", online);
  ui.onlineBadge.classList.toggle("offline", !online);
  ui.onlineText.textContent = online ? "Presence sync active" : "Multiplayer room is optional";
}

function nearestZone() {
  let best = null;
  let bestDist = Infinity;
  for (const zone of zones) {
    const dist = Math.hypot(zone.x - state.player.x, zone.z - state.player.z);
    if (dist < zone.r && dist < bestDist) {
      best = zone;
      bestDist = dist;
    }
  }
  return best;
}

function canFishHere() {
  const zone = nearestZone();
  if (zone?.id === "dock") return true;
  const nx = state.player.x / 21.5;
  const nz = state.player.z / 16.2;
  return nx * nx + nz * nz > 0.72;
}

function insideIsland(x, z) {
  const nx = x / 21.5;
  const nz = z / 16.2;
  return nx * nx + nz * nz < 1;
}

function pickLoot(luck) {
  const table = lootTable.map((entry) => {
    const rare = entry.item === "pearl" || entry.item === "coral";
    return { ...entry, weight: entry.weight + (rare ? luck : 0) };
  });
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return table[0];
}

function updateUi() {
  const hour = Math.floor(state.minute / 60) % 24;
  const minute = Math.floor(state.minute % 60);
  ui.timeText.textContent = `Day ${state.day} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const zone = nearestZone();
  ui.zoneText.textContent = zone ? zone.name : "Dream Bay";
  ui.hintText.textContent = state.mode === "build" ? "Build: click place, R rotate, Esc cancel" : zone ? zone.hint : "WASD move, mouse look, E interact";
  ui.modeText.textContent = state.mode === "build" ? `Build: ${buildCatalog[state.selectedBuild].name}` : "Explore the bay";
  ui.inventory.innerHTML = Object.entries(itemMeta)
    .map(([key, [name, short]]) => `<div class="slot" title="${name}"><span>${short}</span><b>${state.inv[key]}</b></div>`)
    .join("");
}

function openModal(title, body) {
  ui.modalTitle.textContent = title;
  ui.modalBody.innerHTML = body;
  ui.modal.classList.remove("hidden");
}

function closeModal() {
  ui.modal.classList.add("hidden");
  ui.modalBody.innerHTML = "";
}

function showNotice(text) {
  ui.notice.textContent = text;
  ui.notice.classList.add("show");
  noticeTimer = 3;
}

function showFatal(text) {
  ui.notice.textContent = text;
  ui.notice.classList.add("show");
}

function hasCost(cost) {
  return Object.entries(cost).every(([item, amount]) => state.inv[item] >= amount);
}

function payCost(cost) {
  if (!hasCost(cost)) return false;
  for (const [item, amount] of Object.entries(cost)) state.inv[item] -= amount;
  updateUi();
  return true;
}

function formatCost(cost) {
  return Object.entries(cost).map(([item, amount]) => `${itemMeta[item][0]} x${amount}`).join(", ");
}

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
