import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

const STORAGE_KEY = "particle-preview-project";
const EMBED_LIMIT_BYTES = 512 * 1024;
const TICK_RATE = 20;
const MAX_GLOBAL_PARTICLES = 5000;

const viewport = document.querySelector("#viewport");
const statusText = document.querySelector("#status");
const particleCountText = document.querySelector("#particle-count");

const inputs = {
  projectInput: document.querySelector("#project-input"),
  spriteInput: document.querySelector("#sprite-input"),
  emitterName: document.querySelector("#emitter-name"),
  emitterEnabled: document.querySelector("#emitter-enabled"),
  frameCount: document.querySelector("#frame-count"),
  frameMode: document.querySelector("#frame-mode"),
  fixedFrame: document.querySelector("#fixed-frame"),
  pixelated: document.querySelector("#pixelated"),
  shape: document.querySelector("#shape"),
  spawnRate: document.querySelector("#spawn-rate"),
  burstCount: document.querySelector("#burst-count"),
  maxParticles: document.querySelector("#max-particles"),
  posX: document.querySelector("#pos-x"),
  posY: document.querySelector("#pos-y"),
  posZ: document.querySelector("#pos-z"),
  sizeX: document.querySelector("#size-x"),
  sizeY: document.querySelector("#size-y"),
  sizeZ: document.querySelector("#size-z"),
  dirX: document.querySelector("#dir-x"),
  dirY: document.querySelector("#dir-y"),
  dirZ: document.querySelector("#dir-z"),
  speed: document.querySelector("#speed"),
  speedVariance: document.querySelector("#speed-variance"),
  spread: document.querySelector("#spread"),
  coneAngle: document.querySelector("#cone-angle"),
  lifetime: document.querySelector("#lifetime"),
  minecraftBehavior: document.querySelector("#minecraft-behavior"),
  lifetimeVariance: document.querySelector("#lifetime-variance"),
  gravity: document.querySelector("#gravity"),
  friction: document.querySelector("#friction"),
  particleSize: document.querySelector("#particle-size"),
  endSize: document.querySelector("#end-size"),
  roll: document.querySelector("#roll"),
  rollSpeed: document.querySelector("#roll-speed"),
  color: document.querySelector("#color"),
  alpha: document.querySelector("#alpha"),
  fadeColor: document.querySelector("#fade-color"),
  fadeEnabled: document.querySelector("#fade-enabled"),
  physics: document.querySelector("#physics"),
  speedUpBlocked: document.querySelector("#speed-up-blocked"),
  renderMode: document.querySelector("#render-mode"),
  billboardMode: document.querySelector("#billboard-mode"),
  backgroundMode: document.querySelector("#background-mode"),
  backgroundColor: document.querySelector("#background-color"),
  floorEnabled: document.querySelector("#floor-enabled"),
  floorY: document.querySelector("#floor-y"),
  backgroundInput: document.querySelector("#background-input"),
  groundInput: document.querySelector("#ground-input"),
  timeScale: document.querySelector("#time-scale"),
  timeScaleLabel: document.querySelector("#time-scale-label"),
  seed: document.querySelector("#seed"),
  spriteStatus: document.querySelector("#sprite-status"),
  backgroundStatus: document.querySelector("#background-status"),
  groundStatus: document.querySelector("#ground-status"),
};

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.width = "100%";
renderer.domElement.style.height = "100%";
viewport.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
const clock = new THREE.Clock();
const particleRoot = new THREE.Group();
const environmentRoot = new THREE.Group();
scene.add(environmentRoot, particleRoot);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.65);
directionalLight.position.set(3, 5, 4);
scene.add(ambientLight, directionalLight);

const planeGeometry = new THREE.PlaneGeometry(1, 1);
const floorGeometry = new THREE.PlaneGeometry(24, 24);
let floorMesh = null;
let backgroundPlane = null;
let selectedEmitterId = "";
let paused = false;
let accumulator = 0;
let orbit = { yaw: 45, pitch: 20, distance: 9, dragging: false, x: 0, y: 0 };
let particles = [];
let textureCache = new Map();
let frameCache = new Map();
let defaultFrames = [];
let random = mulberry32(1);

const state = makeInitialState();

function makeInitialState() {
  return {
    version: 1,
    playback: {
      seed: 1337,
      timeScale: 1,
    },
    scene: {
      backgroundMode: "color",
      backgroundColor: "#ffffff",
      floorEnabled: false,
      floorY: 0,
      backgroundImage: emptyAsset(),
      groundTexture: emptyAsset(),
    },
    emitters: [presetSmoke()],
  };
}

function emptyAsset() {
  return {
    name: "",
    dataUrl: "",
    omitted: false,
  };
}

function baseEmitter() {
  return {
    id: crypto.randomUUID(),
    name: "Emitter",
    enabled: true,
    sprite: emptyAsset(),
    frameCount: 1,
    frameMode: "age",
    fixedFrame: 0,
    pixelated: true,
    minecraftTextures: [],
    minecraftBehavior: "generic",
    shape: "point",
    spawnRate: 24,
    burstCount: 0,
    maxParticles: 500,
    position: { x: 0, y: 1, z: 0 },
    size: { x: 1, y: 1, z: 1 },
    direction: { x: 0, y: 1, z: 0 },
    speed: 0.04,
    speedVariance: 0.015,
    spread: 25,
    coneAngle: 30,
    lifetime: 32,
    lifetimeVariance: 10,
    gravity: -0.04,
    friction: 0.96,
    particleSize: 0.32,
    endSize: 0.55,
    roll: 0,
    rollSpeed: 0,
    color: "#787878",
    alpha: 0.85,
    fadeColor: "#444444",
    fadeEnabled: true,
    physics: true,
    speedUpBlocked: true,
    renderMode: "translucent",
    billboardMode: "xyz",
    spawnCarry: 0,
  };
}

function particleTexture(name) {
  return `assets/minecraft/particle/${name}.png`;
}

function blockTexture(name) {
  return `assets/minecraft/block/${name}.png`;
}

function genericParticleFrames() {
  return [
    particleTexture("generic_7"),
    particleTexture("generic_6"),
    particleTexture("generic_5"),
    particleTexture("generic_4"),
    particleTexture("generic_3"),
    particleTexture("generic_2"),
    particleTexture("generic_1"),
    particleTexture("generic_0"),
  ];
}

function presetSmoke() {
  return {
    ...baseEmitter(),
    id: crypto.randomUUID(),
    name: "Smoke puff",
    minecraftBehavior: "smoke",
    minecraftTextures: genericParticleFrames(),
    frameCount: 8,
    shape: "box",
    spawnRate: 22,
    maxParticles: 600,
    position: { x: 0, y: 0.2, z: 0 },
    size: { x: 0.4, y: 0.1, z: 0.4 },
    direction: { x: 0, y: 1, z: 0 },
    speed: 0.02,
    speedVariance: 0.01,
    spread: 20,
    lifetime: 8,
    lifetimeVariance: 0,
    gravity: -0.1,
    friction: 0.96,
    particleSize: 0.16,
    endSize: 0.16,
    color: "#303030",
    fadeColor: "#303030",
    alpha: 1,
    fadeEnabled: false,
    renderMode: "opaque",
  };
}

function presetFlame() {
  return {
    ...baseEmitter(),
    id: crypto.randomUUID(),
    name: "Flame",
    minecraftBehavior: "flame",
    minecraftTextures: [particleTexture("flame")],
    frameCount: 1,
    shape: "cone",
    spawnRate: 38,
    maxParticles: 700,
    position: { x: 0, y: 0.05, z: 0 },
    direction: { x: 0, y: 1, z: 0 },
    speed: 0.055,
    speedVariance: 0.015,
    spread: 18,
    coneAngle: 24,
    lifetime: 8,
    lifetimeVariance: 0,
    gravity: 0,
    friction: 0.96,
    particleSize: 0.16,
    endSize: 0.16,
    color: "#ffffff",
    fadeColor: "#ffffff",
    alpha: 1,
    fadeEnabled: false,
    renderMode: "lit",
  };
}

function presetCrit() {
  return {
    ...baseEmitter(),
    id: crypto.randomUUID(),
    name: "Crit sparkle",
    minecraftBehavior: "crit",
    minecraftTextures: [particleTexture("critical_hit")],
    frameCount: 1,
    shape: "sphere",
    spawnRate: 0,
    burstCount: 28,
    maxParticles: 300,
    position: { x: 0, y: 1.2, z: 0 },
    size: { x: 0.5, y: 0.5, z: 0.5 },
    direction: { x: 0, y: 1, z: 0 },
    speed: 0.18,
    speedVariance: 0.06,
    spread: 90,
    lifetime: 6,
    lifetimeVariance: 0,
    gravity: 0.5,
    friction: 0.7,
    particleSize: 0.12,
    endSize: 0.12,
    color: "#bdbdbd",
    fadeColor: "#bdbdbd",
    alpha: 1,
    fadeEnabled: false,
    physics: false,
    renderMode: "opaque",
  };
}

function presetDust() {
  return {
    ...baseEmitter(),
    id: crypto.randomUUID(),
    name: "Ground dust",
    minecraftBehavior: "dust",
    minecraftTextures: genericParticleFrames(),
    frameCount: 8,
    shape: "disc",
    spawnRate: 26,
    maxParticles: 600,
    position: { x: 0, y: 0.05, z: 0 },
    size: { x: 1.6, y: 0, z: 1.6 },
    direction: { x: 0, y: 0.35, z: 0 },
    speed: 0.045,
    speedVariance: 0.02,
    spread: 80,
    lifetime: 8,
    lifetimeVariance: 0,
    gravity: 0,
    friction: 0.96,
    particleSize: 0.18,
    endSize: 0.18,
    color: "#9a8062",
    fadeColor: "#9a8062",
    alpha: 1,
    fadeEnabled: false,
    renderMode: "opaque",
  };
}

function presetDrip() {
  return {
    ...baseEmitter(),
    id: crypto.randomUUID(),
    name: "Falling drip",
    minecraftBehavior: "fallingWater",
    minecraftTextures: [particleTexture("drip_fall")],
    frameCount: 1,
    shape: "line",
    spawnRate: 8,
    maxParticles: 350,
    position: { x: 0, y: 2.6, z: 0 },
    size: { x: 1.2, y: 0, z: 0 },
    direction: { x: 0, y: -1, z: 0 },
    speed: 0,
    speedVariance: 0,
    spread: 6,
    lifetime: 64,
    lifetimeVariance: 0,
    gravity: 0.06,
    friction: 0.98,
    particleSize: 0.08,
    endSize: 0.08,
    color: "#334cff",
    fadeColor: "#334cff",
    alpha: 1,
    fadeEnabled: false,
    physics: true,
    speedUpBlocked: false,
    renderMode: "translucent",
    billboardMode: "y",
  };
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function setStatus(message) {
  statusText.textContent = message;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min, max) {
  return min + random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}

function randomUnitVector() {
  const z = randomRange(-1, 1);
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(1 - z * z);
  return new THREE.Vector3(Math.cos(angle) * radius, z, Math.sin(angle) * radius);
}

function normaliseVector(vector, fallback = new THREE.Vector3(0, 1, 0)) {
  const result = vector.clone();
  if (result.lengthSq() < 0.000001) {
    return fallback.clone();
  }
  return result.normalize();
}

function directionWithSpread(direction, spreadDegrees) {
  const base = normaliseVector(direction);
  const spread = THREE.MathUtils.degToRad(spreadDegrees);
  if (spread <= 0) {
    return base;
  }

  const tangent = randomUnitVector().cross(base);
  if (tangent.lengthSq() < 0.000001) {
    tangent.set(1, 0, 0);
  }
  tangent.normalize();

  const bitangent = base.clone().cross(tangent).normalize();
  const angle = randomRange(0, spread);
  const around = random() * Math.PI * 2;
  return base
    .multiplyScalar(Math.cos(angle))
    .add(tangent.multiplyScalar(Math.sin(angle) * Math.cos(around)))
    .add(bitangent.multiplyScalar(Math.sin(angle) * Math.sin(around)))
    .normalize();
}

function makeDefaultFrames() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(16, 16, 1, 16, 16, 15);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.72)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return [texture];
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function loadTexture(src, pixelated) {
  if (!src) {
    return Promise.resolve(null);
  }

  const key = `${src}|${pixelated ? "px" : "linear"}`;
  if (textureCache.has(key)) {
    return textureCache.get(key);
  }

  const promise = new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(src, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter;
      texture.minFilter = pixelated ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
      texture.needsUpdate = true;
      resolve(texture);
    }, undefined, reject);
  });
  textureCache.set(key, promise);
  return promise;
}

async function framesForEmitter(emitter) {
  const src = emitter.sprite.dataUrl || emitter.sprite.runtimeDataUrl;
  if (src) {
    const cacheKey = `${emitter.id}|${src}|${emitter.frameCount}|${emitter.pixelated ? "px" : "linear"}`;
    if (frameCache.has(cacheKey)) {
      return frameCache.get(cacheKey);
    }

    const texture = await loadTexture(src, emitter.pixelated);
    const count = clamp(Math.round(emitter.frameCount) || 1, 1, 64);
    const frames = [];

    for (let index = 0; index < count; index += 1) {
      const frame = texture.clone();
      frame.colorSpace = THREE.SRGBColorSpace;
      frame.magFilter = texture.magFilter;
      frame.minFilter = texture.minFilter;
      frame.wrapS = THREE.ClampToEdgeWrapping;
      frame.wrapT = THREE.ClampToEdgeWrapping;
      frame.repeat.set(1, 1 / count);
      frame.offset.set(0, 1 - (index + 1) / count);
      frame.needsUpdate = true;
      frames.push(frame);
    }

    frameCache.set(cacheKey, frames);
    return frames;
  }

  if (Array.isArray(emitter.minecraftTextures) && emitter.minecraftTextures.length > 0) {
    const cacheKey = `${emitter.id}|minecraft|${emitter.minecraftTextures.join(",")}|${emitter.pixelated ? "px" : "linear"}`;
    if (frameCache.has(cacheKey)) {
      return frameCache.get(cacheKey);
    }

    const frames = await Promise.all(emitter.minecraftTextures.map((textureSrc) => loadTexture(textureSrc, emitter.pixelated)));
    frameCache.set(cacheKey, frames);
    return frames;
  }

  return defaultFrames;
}

function hexToColor(hex) {
  return new THREE.Color(hex || "#ffffff");
}

function emitterById(id) {
  return state.emitters.find((emitter) => emitter.id === id) || state.emitters[0];
}

function selectedEmitter() {
  return emitterById(selectedEmitterId);
}

function resetRuntime() {
  for (const particle of particles) {
    particleRoot.remove(particle.mesh);
    particle.material.dispose();
  }
  particles = [];
  random = mulberry32(Number(state.playback.seed) || 1);
  for (const emitter of state.emitters) {
    emitter.spawnCarry = emitter.burstCount || 0;
  }
  updateParticleCount();
}

function particleCountForEmitter(id) {
  return particles.filter((particle) => particle.emitterId === id).length;
}

function spawnPosition(emitter) {
  const position = new THREE.Vector3(emitter.position.x, emitter.position.y, emitter.position.z);
  const size = emitter.size;

  if (emitter.shape === "box") {
    position.x += randomRange(-size.x / 2, size.x / 2);
    position.y += randomRange(-size.y / 2, size.y / 2);
    position.z += randomRange(-size.z / 2, size.z / 2);
  } else if (emitter.shape === "sphere") {
    const radius = Math.max(size.x, size.y, size.z) / 2;
    position.add(randomUnitVector().multiplyScalar(radius * Math.cbrt(random())));
  } else if (emitter.shape === "disc") {
    const radius = Math.max(size.x, size.z) / 2;
    const r = radius * Math.sqrt(random());
    const angle = random() * Math.PI * 2;
    position.x += Math.cos(angle) * r;
    position.z += Math.sin(angle) * r;
  } else if (emitter.shape === "line") {
    position.x += randomRange(-size.x / 2, size.x / 2);
    position.y += randomRange(-size.y / 2, size.y / 2);
    position.z += randomRange(-size.z / 2, size.z / 2);
  }

  return position;
}

async function spawnParticle(emitter) {
  if (particles.length >= MAX_GLOBAL_PARTICLES || particleCountForEmitter(emitter.id) >= emitter.maxParticles) {
    return;
  }

  const frames = await framesForEmitter(emitter);
  const behavior = emitter.minecraftBehavior || "generic";
  let lifetime = Math.max(1, Math.round(emitter.lifetime + randomRange(-emitter.lifetimeVariance, emitter.lifetimeVariance)));
  if (behavior === "crit") {
    lifetime = Math.max(Math.floor(6 / (random() * 0.8 + 0.6)), 1);
  } else if (behavior === "flame") {
    lifetime = Math.floor(8 / (random() * 0.8 + 0.2)) + 4;
  } else if (behavior === "smoke") {
    lifetime = Math.max(Math.floor(8 / (random() * 0.8 + 0.2)), 1);
  } else if (behavior === "dust") {
    lifetime = Math.max(Math.floor(8 / (random() * 0.8 + 0.2)), 1);
  } else if (behavior === "fallingWater") {
    lifetime = Math.floor(64 / (random() * 0.8 + 0.2));
  }

  const direction = new THREE.Vector3(emitter.direction.x, emitter.direction.y, emitter.direction.z);
  const spread = emitter.shape === "cone" ? emitter.coneAngle : emitter.spread;
  const speed = Math.max(0, emitter.speed + randomRange(-emitter.speedVariance, emitter.speedVariance));
  const velocity = directionWithSpread(direction, spread).multiplyScalar(speed);
  if (behavior === "crit") {
    velocity.multiplyScalar(0.4);
  } else if (behavior === "dust") {
    velocity.multiplyScalar(0.1);
  }

  const frameIndex = emitter.frameMode === "random"
    ? randomInt(0, frames.length - 1)
    : clamp(Math.round(emitter.fixedFrame), 0, frames.length - 1);
  let color = hexToColor(emitter.color);
  let size = emitter.particleSize;
  if (behavior === "crit") {
    const shade = random() * 0.3 + 0.6;
    color = new THREE.Color(shade, shade, shade);
    size *= 0.75 * randomRange(0.75, 1.5);
  } else if (behavior === "smoke") {
    const shade = random() * 0.3;
    color = new THREE.Color(shade, shade, shade);
    size *= 0.75 * randomRange(0.75, 1.5);
  } else if (behavior === "dust") {
    const colorRandom = random() * 0.4 + 0.6;
    color.multiplyScalar((random() * 0.2 + 0.8) * colorRandom);
    size *= 0.75 * randomRange(0.75, 1.5);
  } else if (behavior === "flame") {
    size *= randomRange(0.75, 1.5);
  }

  const material = new THREE.MeshBasicMaterial({
    map: frames[frameIndex] || defaultFrames[0],
    color,
    transparent: true,
    alphaTest: emitter.renderMode === "opaque" ? 0.01 : 0,
    opacity: clamp(emitter.alpha, 0, 1),
    depthWrite: emitter.renderMode === "opaque",
    blending: emitter.renderMode === "lit" ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(planeGeometry, material);
  const position = spawnPosition(emitter);
  mesh.position.copy(position);
  particleRoot.add(mesh);

  particles.push({
    emitterId: emitter.id,
    mesh,
    material,
    frames,
    age: 0,
    lifetime,
    position,
    previousY: position.y,
    velocity,
    color,
    fadeColor: hexToColor(emitter.fadeColor),
    alpha: emitter.alpha,
    size,
    endSize: emitter.endSize,
    roll: THREE.MathUtils.degToRad(emitter.roll),
    rollSpeed: THREE.MathUtils.degToRad(emitter.rollSpeed),
    frameMode: emitter.frameMode,
    fixedFrame: emitter.fixedFrame,
  });
}

async function tickEmitters(dtTicks) {
  const spawnJobs = [];
  for (const emitter of state.emitters) {
    if (!emitter.enabled) {
      continue;
    }

    emitter.spawnCarry += (emitter.spawnRate / TICK_RATE) * dtTicks;
    const spawnCount = Math.floor(emitter.spawnCarry);
    emitter.spawnCarry -= spawnCount;

    for (let index = 0; index < spawnCount; index += 1) {
      spawnJobs.push(spawnParticle(emitter));
    }
  }

  await Promise.all(spawnJobs);
}

function tickParticles(dtTicks) {
  const floorY = state.scene.floorY;
  const keep = [];

  for (const particle of particles) {
    const emitter = emitterById(particle.emitterId);
    if (!emitter) {
      particleRoot.remove(particle.mesh);
      particle.material.dispose();
      continue;
    }

    particle.age += dtTicks;
    if (particle.age >= particle.lifetime) {
      particleRoot.remove(particle.mesh);
      particle.material.dispose();
      continue;
    }

    const behavior = emitter.minecraftBehavior || "generic";
    particle.previousY = particle.position.y;
    particle.velocity.y -= (behavior === "fallingWater" ? emitter.gravity : 0.04 * emitter.gravity) * dtTicks;
    particle.position.addScaledVector(particle.velocity, dtTicks);

    let onGround = false;
    if (state.scene.floorEnabled && emitter.physics && particle.position.y <= floorY) {
      particle.position.y = floorY;
      if (behavior === "fallingWater") {
        particleRoot.remove(particle.mesh);
        particle.material.dispose();
        continue;
      }
      if (particle.velocity.y < 0) {
        particle.velocity.y = 0;
      }
      onGround = true;
    }

    if (emitter.speedUpBlocked && Math.abs(particle.position.y - particle.previousY) < 0.00001) {
      particle.velocity.x *= 1.1;
      particle.velocity.z *= 1.1;
    }

    particle.velocity.multiplyScalar(Math.pow(emitter.friction, dtTicks));
    if (onGround) {
      particle.velocity.x *= Math.pow(0.7, dtTicks);
      particle.velocity.z *= Math.pow(0.7, dtTicks);
    }

    const normalAge = clamp(particle.age / particle.lifetime, 0, 1);
    let currentSize = THREE.MathUtils.lerp(particle.size, particle.endSize, normalAge);
    let currentAlpha = particle.alpha;
    const currentColor = particle.color.clone();

    if (behavior === "crit" || behavior === "smoke" || behavior === "dust") {
      currentSize = particle.size * clamp((particle.age / particle.lifetime) * 32, 0, 1);
    } else if (behavior === "flame") {
      currentSize = particle.size * (1 - normalAge * normalAge * 0.5);
    }

    if (emitter.fadeEnabled && particle.age > particle.lifetime / 2) {
      currentAlpha = particle.alpha * (1 - (particle.age - particle.lifetime / 2) / particle.lifetime);
      currentColor.lerp(particle.fadeColor, 0.2);
      particle.color.copy(currentColor);
    }

    if (behavior === "crit") {
      particle.color.g *= Math.pow(0.96, dtTicks);
      particle.color.b *= Math.pow(0.9, dtTicks);
      currentColor.copy(particle.color);
    }

    if (particle.frameMode === "age") {
      // FIX: ensure all frames are reachable before particle death
      const frameIndex = Math.min(
        Math.floor((particle.age / particle.lifetime) * particle.frames.length),
        particle.frames.length - 1
      );
      particle.material.map = particle.frames[frameIndex] || defaultFrames[0];
    }

    particle.roll += particle.rollSpeed * dtTicks;
    particle.mesh.position.copy(particle.position);
    particle.mesh.scale.set(currentSize, currentSize, currentSize);
    particle.material.opacity = clamp(currentAlpha, 0, 1);
    particle.material.color.copy(currentColor);
    particle.material.transparent = true;
    particle.material.alphaTest = emitter.renderMode === "opaque" ? 0.01 : 0;
    particle.material.depthWrite = emitter.renderMode === "opaque";
    particle.material.blending = emitter.renderMode === "lit" ? THREE.AdditiveBlending : THREE.NormalBlending;
    updateBillboard(particle, emitter);
    keep.push(particle);
  }

  particles = keep;
}

function updateBillboard(particle, emitter) {
  if (emitter.billboardMode === "y") {
    const dx = camera.position.x - particle.mesh.position.x;
    const dz = camera.position.z - particle.mesh.position.z;
    const yaw = Math.atan2(dx, dz);
    particle.mesh.rotation.set(0, yaw, particle.roll);
    return;
  }

  particle.mesh.quaternion.copy(camera.quaternion);
  particle.mesh.rotateZ(particle.roll);
}

function updateParticleCount() {
  particleCountText.textContent = `${particles.length} particle${particles.length === 1 ? "" : "s"}`;
}

function updateCamera() {
  const yaw = THREE.MathUtils.degToRad(orbit.yaw);
  const pitch = THREE.MathUtils.degToRad(orbit.pitch);
  const distance = orbit.distance;
  camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * distance,
    Math.sin(pitch) * distance + 1.2,
    Math.cos(yaw) * Math.cos(pitch) * distance
  );
  camera.lookAt(0, 1, 0);
}

function makeCheckerTexture(colorA, colorB) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.fillStyle = colorA;
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = colorB;
  context.fillRect(0, 0, 32, 32);
  context.fillRect(32, 32, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

async function rebuildScene() {
  environmentRoot.clear();
  backgroundPlane = null;

  if (state.scene.backgroundMode === "checker") {
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
  } else if (state.scene.backgroundMode === "dark-concrete") {
    scene.background = new THREE.Color("#111317");
    renderer.setClearColor(0x111317, 1);
  } else if (state.scene.backgroundMode === "color") {
    scene.background = new THREE.Color(state.scene.backgroundColor);
    renderer.setClearColor(state.scene.backgroundColor, 1);
  } else if (state.scene.backgroundMode === "custom" && (state.scene.backgroundImage.dataUrl || state.scene.backgroundImage.runtimeDataUrl)) {
    scene.background = null;
    renderer.setClearColor(0x000000, 1);
    const texture = await loadTexture(state.scene.backgroundImage.dataUrl || state.scene.backgroundImage.runtimeDataUrl, false);
    const material = new THREE.MeshBasicMaterial({ map: texture, depthWrite: false, depthTest: false });
    backgroundPlane = new THREE.Mesh(new THREE.PlaneGeometry(24, 13.5), material);
    backgroundPlane.position.set(0, 5, -8);
    environmentRoot.add(backgroundPlane);
  } else {
    scene.background = new THREE.Color("#7fb8ff");
    renderer.setClearColor(0x7fb8ff, 1);
  }

  if (state.scene.floorEnabled) {
    let floorTexture;
    let useGrassTint = false;

    if (state.scene.groundTexture.dataUrl || state.scene.groundTexture.runtimeDataUrl) {
      floorTexture = await loadTexture(state.scene.groundTexture.dataUrl || state.scene.groundTexture.runtimeDataUrl, true);
      floorTexture.wrapS = THREE.RepeatWrapping;
      floorTexture.wrapT = THREE.RepeatWrapping;
      floorTexture.repeat.set(12, 12);
    } else if (state.scene.backgroundMode === "dark-concrete") {
      floorTexture = await loadTexture(blockTexture("black_concrete"), true);
      floorTexture.wrapS = THREE.RepeatWrapping;
      floorTexture.wrapT = THREE.RepeatWrapping;
      floorTexture.repeat.set(24, 24);
    } else {
      floorTexture = await loadTexture(blockTexture("grass_block_top"), true);
      floorTexture.wrapS = THREE.RepeatWrapping;
      floorTexture.wrapT = THREE.RepeatWrapping;
      floorTexture.repeat.set(24, 24);
      useGrassTint = true;
    }

    const floorMaterial = new THREE.MeshBasicMaterial({ map: floorTexture, side: THREE.DoubleSide });
    if (useGrassTint) {
      floorMaterial.color.set("#8baa4a"); // green tint only for original grass
    }

    floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = state.scene.floorY;
    environmentRoot.add(floorMesh);
  }
}

function resize() {
  const rect = viewport.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

async function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(0.1, clock.getDelta());
  const timeScale = Number(state.playback.timeScale) || 1;

  if (!paused) {
    accumulator += delta * timeScale * TICK_RATE;
    while (accumulator >= 1) {
      await tickEmitters(1);
      tickParticles(1);
      accumulator -= 1;
    }
  }

  updateCamera();
  for (const particle of particles) {
    const emitter = emitterById(particle.emitterId);
    if (emitter) {
      updateBillboard(particle, emitter);
    }
  }
  updateParticleCount();
  renderer.render(scene, camera);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportState() {
  const clean = JSON.parse(JSON.stringify(state));
  for (const emitter of clean.emitters) {
    delete emitter.spawnCarry;
    delete emitter.sprite.runtimeDataUrl;
  }
  delete clean.scene.backgroundImage.runtimeDataUrl;
  delete clean.scene.groundTexture.runtimeDataUrl;
  return clean;
}

function saveProject() {
  const blob = new Blob([JSON.stringify(exportState(), null, 2)], { type: "application/json" });
  downloadBlob(blob, "particle-preview-project.json");
  const omitted = state.emitters.filter((emitter) => emitter.sprite.omitted).length;
  setStatus(omitted ? `${omitted} sprite image(s) were too large to embed and must be reimported.` : "Project exported.");
}

function saveAutosave() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(exportState()));
  } catch (error) {
    setStatus("Autosave skipped because the project is too large for browser storage.");
  }
}

async function loadProjectData(data) {
  if (!data || !Array.isArray(data.emitters)) {
    throw new Error("Invalid project file.");
  }

  state.version = 1;
  state.playback = { ...state.playback, ...(data.playback || {}) };
  state.scene = { ...state.scene, ...(data.scene || {}) };
  state.emitters = data.emitters.map((emitter) => normaliseEmitter(emitter));
  frameCache = new Map();
  if (state.emitters.length === 0) {
    state.emitters.push(presetSmoke());
  }
  selectedEmitterId = state.emitters[0].id;
  syncUi();
  await rebuildScene();
  resetRuntime();
  saveAutosave();
  setStatus("Project loaded.");
}

function normaliseEmitter(raw) {
  const migrated = migrateLegacyPreset(raw);
  return {
    ...baseEmitter(),
    ...migrated,
    id: migrated.id || crypto.randomUUID(),
    position: { ...baseEmitter().position, ...(migrated.position || {}) },
    size: { ...baseEmitter().size, ...(migrated.size || {}) },
    direction: { ...baseEmitter().direction, ...(migrated.direction || {}) },
    sprite: { ...emptyAsset(), ...(migrated.sprite || {}) },
    minecraftTextures: Array.isArray(migrated.minecraftTextures) ? migrated.minecraftTextures : [],
    minecraftBehavior: migrated.minecraftBehavior || "generic",
    spawnCarry: 0,
  };
}

function migrateLegacyPreset(raw) {
  if (raw.minecraftBehavior || (Array.isArray(raw.minecraftTextures) && raw.minecraftTextures.length > 0) || raw.sprite?.dataUrl) {
    return raw;
  }

  const presets = {
    "Smoke puff": presetSmoke,
    Flame: presetFlame,
    "Crit sparkle": presetCrit,
    "Ground dust": presetDust,
    "Falling drip": presetDrip,
  };
  const presetFactory = presets[raw.name];
  if (!presetFactory) {
    return raw;
  }

  return {
    ...raw,
    ...presetFactory(),
    id: raw.id || crypto.randomUUID(),
    name: raw.name,
    enabled: raw.enabled ?? true,
  };
}

async function restoreAutosave() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return;
  }

  try {
    await loadProjectData(JSON.parse(saved));
    setStatus("Autosave restored.");
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function setNumber(input, value) {
  input.value = Number.isFinite(value) ? String(value) : "0";
}

function readNumber(input, fallback = 0) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function syncUi() {
  renderEmitterList();
  const emitter = selectedEmitter();
  if (!emitter) {
    return;
  }

  inputs.emitterName.value = emitter.name;
  inputs.emitterEnabled.checked = emitter.enabled;
  setNumber(inputs.frameCount, emitter.frameCount);
  inputs.frameMode.value = emitter.frameMode;
  setNumber(inputs.fixedFrame, emitter.fixedFrame);
  inputs.pixelated.checked = emitter.pixelated;
  inputs.minecraftBehavior.value = emitter.minecraftBehavior || "generic";
  inputs.shape.value = emitter.shape;
  setNumber(inputs.spawnRate, emitter.spawnRate);
  setNumber(inputs.burstCount, emitter.burstCount);
  setNumber(inputs.maxParticles, emitter.maxParticles);
  setNumber(inputs.posX, emitter.position.x);
  setNumber(inputs.posY, emitter.position.y);
  setNumber(inputs.posZ, emitter.position.z);
  setNumber(inputs.sizeX, emitter.size.x);
  setNumber(inputs.sizeY, emitter.size.y);
  setNumber(inputs.sizeZ, emitter.size.z);
  setNumber(inputs.dirX, emitter.direction.x);
  setNumber(inputs.dirY, emitter.direction.y);
  setNumber(inputs.dirZ, emitter.direction.z);
  setNumber(inputs.speed, emitter.speed);
  setNumber(inputs.speedVariance, emitter.speedVariance);
  setNumber(inputs.spread, emitter.spread);
  setNumber(inputs.coneAngle, emitter.coneAngle);
  setNumber(inputs.lifetime, emitter.lifetime);
  setNumber(inputs.lifetimeVariance, emitter.lifetimeVariance);
  setNumber(inputs.gravity, emitter.gravity);
  setNumber(inputs.friction, emitter.friction);
  setNumber(inputs.particleSize, emitter.particleSize);
  setNumber(inputs.endSize, emitter.endSize);
  setNumber(inputs.roll, emitter.roll);
  setNumber(inputs.rollSpeed, emitter.rollSpeed);
  inputs.color.value = emitter.color;
  setNumber(inputs.alpha, emitter.alpha);
  inputs.fadeColor.value = emitter.fadeColor;
  inputs.fadeEnabled.checked = emitter.fadeEnabled;
  inputs.physics.checked = emitter.physics;
  inputs.speedUpBlocked.checked = emitter.speedUpBlocked;
  inputs.renderMode.value = emitter.renderMode;
  inputs.billboardMode.value = emitter.billboardMode;

  inputs.backgroundMode.value = state.scene.backgroundMode;
  inputs.backgroundColor.value = state.scene.backgroundColor;
  inputs.floorEnabled.checked = state.scene.floorEnabled;
  setNumber(inputs.floorY, state.scene.floorY);
  inputs.timeScale.value = String(state.playback.timeScale);
  inputs.timeScaleLabel.textContent = `${Number(state.playback.timeScale).toFixed(2)}x`;
  inputs.seed.value = String(state.playback.seed);
  inputs.spriteStatus.textContent = emitterSpriteStatusText(emitter);
  inputs.backgroundStatus.textContent = assetStatusText(state.scene.backgroundImage, "No custom background selected.");
  inputs.groundStatus.textContent = assetStatusText(state.scene.groundTexture, "No custom ground texture selected.");
}

function assetStatusText(asset, fallback) {
  if (!asset || !asset.name) {
    return fallback;
  }

  return asset.omitted
    ? `${asset.name} loaded for preview only; too large for JSON export.`
    : `${asset.name} selected.`;
}

function emitterSpriteStatusText(emitter) {
  if (emitter.sprite?.name) {
    return assetStatusText(emitter.sprite, "No sprite sheet selected.");
  }

  if (Array.isArray(emitter.minecraftTextures) && emitter.minecraftTextures.length > 0) {
    return `Using Minecraft texture${emitter.minecraftTextures.length === 1 ? "" : "s"}: ${emitter.minecraftTextures
      .map((src) => src.split("/").pop())
      .join(", ")}.`;
  }

  return "No sprite sheet selected.";
}

function renderEmitterList() {
  const list = document.querySelector("#emitter-list");
  list.textContent = "";

  for (const emitter of state.emitters) {
    const item = document.createElement("div");
    item.className = `emitter-item${emitter.id === selectedEmitterId ? " active" : ""}`;

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = emitter.enabled;
    toggle.addEventListener("change", () => {
      emitter.enabled = toggle.checked;
      saveAutosave();
    });

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = emitter.name;
    button.addEventListener("click", () => {
      selectedEmitterId = emitter.id;
      syncUi();
    });

    item.append(toggle, button);
    list.append(item);
  }
}

function updateSelectedFromUi() {
  const emitter = selectedEmitter();
  if (!emitter) {
    return;
  }

  emitter.name = inputs.emitterName.value || "Emitter";
  emitter.enabled = inputs.emitterEnabled.checked;
  emitter.frameCount = clamp(Math.round(readNumber(inputs.frameCount, 1)), 1, 64);
  emitter.frameMode = inputs.frameMode.value;
  emitter.fixedFrame = clamp(Math.round(readNumber(inputs.fixedFrame, 0)), 0, 63);
  emitter.pixelated = inputs.pixelated.checked;
  emitter.minecraftBehavior = inputs.minecraftBehavior.value;
  emitter.shape = inputs.shape.value;
  emitter.spawnRate = Math.max(0, readNumber(inputs.spawnRate, 0));
  emitter.burstCount = Math.max(0, Math.round(readNumber(inputs.burstCount, 0)));
  emitter.maxParticles = clamp(Math.round(readNumber(inputs.maxParticles, 500)), 1, 5000);
  emitter.position = { x: readNumber(inputs.posX), y: readNumber(inputs.posY), z: readNumber(inputs.posZ) };
  emitter.size = {
    x: Math.max(0, readNumber(inputs.sizeX)),
    y: Math.max(0, readNumber(inputs.sizeY)),
    z: Math.max(0, readNumber(inputs.sizeZ)),
  };
  emitter.direction = { x: readNumber(inputs.dirX), y: readNumber(inputs.dirY), z: readNumber(inputs.dirZ) };
  emitter.speed = Math.max(0, readNumber(inputs.speed));
  emitter.speedVariance = Math.max(0, readNumber(inputs.speedVariance));
  emitter.spread = clamp(readNumber(inputs.spread), 0, 180);
  emitter.coneAngle = clamp(readNumber(inputs.coneAngle), 0, 180);
  emitter.lifetime = Math.max(1, Math.round(readNumber(inputs.lifetime, 1)));
  emitter.lifetimeVariance = Math.max(0, Math.round(readNumber(inputs.lifetimeVariance, 0)));
  emitter.gravity = readNumber(inputs.gravity);
  emitter.friction = clamp(readNumber(inputs.friction, 0.98), 0, 1.5);
  emitter.particleSize = Math.max(0.01, readNumber(inputs.particleSize, 0.1));
  emitter.endSize = Math.max(0.01, readNumber(inputs.endSize, 0.1));
  emitter.roll = readNumber(inputs.roll);
  emitter.rollSpeed = readNumber(inputs.rollSpeed);
  emitter.color = inputs.color.value;
  emitter.alpha = clamp(readNumber(inputs.alpha, 1), 0, 1);
  emitter.fadeColor = inputs.fadeColor.value;
  emitter.fadeEnabled = inputs.fadeEnabled.checked;
  emitter.physics = inputs.physics.checked;
  emitter.speedUpBlocked = inputs.speedUpBlocked.checked;
  emitter.renderMode = inputs.renderMode.value;
  emitter.billboardMode = inputs.billboardMode.value;
  saveAutosave();
  renderEmitterList();
}

async function updateSceneFromUi() {
  state.scene.backgroundMode = inputs.backgroundMode.value;
  state.scene.backgroundColor = inputs.backgroundColor.value;
  state.scene.floorEnabled = inputs.floorEnabled.checked;
  state.scene.floorY = readNumber(inputs.floorY);
  saveAutosave();
  await rebuildScene();
}

async function setAssetFromFile(asset, file) {
  const dataUrl = await fileToDataUrl(file);
  asset.name = file.name;
  asset.omitted = dataUrl.length > EMBED_LIMIT_BYTES;
  if (asset.omitted) {
    asset.dataUrl = "";
    asset.runtimeDataUrl = dataUrl;
    setStatus(`${file.name} is too large to embed in JSON and must be reimported after load.`);
  } else {
    asset.dataUrl = dataUrl;
    asset.runtimeDataUrl = "";
    setStatus(`${file.name} loaded.`);
  }
}

function replaceEmitters(emitters) {
  state.emitters = emitters;
  selectedEmitterId = state.emitters[0].id;
  syncUi();
  resetRuntime();
  saveAutosave();
}

function bindEvents() {
  document.querySelector("#export-project").addEventListener("click", saveProject);
  document.querySelector("#add-emitter").addEventListener("click", () => {
    const emitter = { ...baseEmitter(), id: crypto.randomUUID(), name: `Emitter ${state.emitters.length + 1}` };
    state.emitters.push(emitter);
    selectedEmitterId = emitter.id;
    syncUi();
    saveAutosave();
  });
  document.querySelector("#duplicate-emitter").addEventListener("click", () => {
    const clone = JSON.parse(JSON.stringify(selectedEmitter()));
    clone.id = crypto.randomUUID();
    clone.name = `${clone.name} copy`;
    clone.spawnCarry = 0;
    state.emitters.push(clone);
    selectedEmitterId = clone.id;
    syncUi();
    resetRuntime();
    saveAutosave();
  });
  document.querySelector("#delete-emitter").addEventListener("click", () => {
    if (state.emitters.length <= 1) {
      setStatus("At least one emitter is required.");
      return;
    }
    state.emitters = state.emitters.filter((emitter) => emitter.id !== selectedEmitterId);
    selectedEmitterId = state.emitters[0].id;
    syncUi();
    resetRuntime();
    saveAutosave();
  });

  document.querySelector("#load-preset-smoke").addEventListener("click", () => replaceEmitters([presetSmoke()]));
  document.querySelector("#load-preset-flame").addEventListener("click", () => replaceEmitters([presetFlame()]));
  document.querySelector("#load-preset-crit").addEventListener("click", () => replaceEmitters([presetCrit()]));
  document.querySelector("#load-preset-dust").addEventListener("click", () => replaceEmitters([presetDust()]));
  document.querySelector("#load-preset-drip").addEventListener("click", () => replaceEmitters([presetDrip()]));

  for (const element of document.querySelectorAll("input, select")) {
    if (["project-input", "sprite-input", "background-input", "ground-input", "time-scale", "seed"].includes(element.id)) {
      continue;
    }
    element.addEventListener("input", () => {
      updateSelectedFromUi();
      if (element.closest(".panel")?.querySelector("h2")?.textContent === "Scene") {
        updateSceneFromUi();
      }
    });
    element.addEventListener("change", () => {
      updateSelectedFromUi();
      if (element.closest(".panel")?.querySelector("h2")?.textContent === "Scene") {
        updateSceneFromUi();
      }
    });
  }

  inputs.projectInput.addEventListener("change", async () => {
    try {
      if (inputs.projectInput.files.length > 0) {
        await loadProjectData(JSON.parse(await inputs.projectInput.files[0].text()));
      }
    } catch (error) {
      setStatus("Project import failed.");
    } finally {
      inputs.projectInput.value = "";
    }
  });

  inputs.spriteInput.addEventListener("change", async () => {
    const emitter = selectedEmitter();
    if (!emitter || inputs.spriteInput.files.length === 0) {
      return;
    }
    try {
      await setAssetFromFile(emitter.sprite, inputs.spriteInput.files[0]);
      textureCache = new Map();
      frameCache = new Map();
      syncUi();
      resetRuntime();
      saveAutosave();
    } finally {
      inputs.spriteInput.value = "";
    }
  });

  inputs.backgroundInput.addEventListener("change", async () => {
    if (inputs.backgroundInput.files.length === 0) {
      return;
    }
    await setAssetFromFile(state.scene.backgroundImage, inputs.backgroundInput.files[0]);
    state.scene.backgroundMode = "custom";
    inputs.backgroundMode.value = "custom";
    textureCache = new Map();
    frameCache = new Map();
    await rebuildScene();
    syncUi();
    saveAutosave();
    inputs.backgroundInput.value = "";
  });

  inputs.groundInput.addEventListener("change", async () => {
    if (inputs.groundInput.files.length === 0) {
      return;
    }
    await setAssetFromFile(state.scene.groundTexture, inputs.groundInput.files[0]);
    textureCache = new Map();
    frameCache = new Map();
    await rebuildScene();
    syncUi();
    saveAutosave();
    inputs.groundInput.value = "";
  });

  document.querySelector("#play-pause").addEventListener("click", (event) => {
    paused = !paused;
    event.currentTarget.textContent = paused ? "Play" : "Pause";
  });
  document.querySelector("#step-frame").addEventListener("click", async () => {
    await tickEmitters(1);
    tickParticles(1);
  });
  document.querySelector("#reset-preview").addEventListener("click", resetRuntime);
  inputs.timeScale.addEventListener("input", () => {
    state.playback.timeScale = readNumber(inputs.timeScale, 1);
    inputs.timeScaleLabel.textContent = `${state.playback.timeScale.toFixed(2)}x`;
    saveAutosave();
  });
  inputs.seed.addEventListener("change", () => {
    state.playback.seed = Math.max(1, Math.round(readNumber(inputs.seed, 1)));
    resetRuntime();
    saveAutosave();
  });

  renderer.domElement.addEventListener("pointerdown", (event) => {
    orbit.dragging = true;
    orbit.x = event.clientX;
    orbit.y = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!orbit.dragging) {
      return;
    }
    orbit.yaw -= (event.clientX - orbit.x) * 0.3;
    orbit.pitch = clamp(orbit.pitch + (event.clientY - orbit.y) * 0.25, -10, 75);
    orbit.x = event.clientX;
    orbit.y = event.clientY;
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    orbit.dragging = false;
    renderer.domElement.releasePointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener("wheel", (event) => {
    event.preventDefault();
    orbit.distance = clamp(orbit.distance + Math.sign(event.deltaY) * 0.5, 3, 22);
  }, { passive: false });
  window.addEventListener("resize", resize);
}

async function init() {
  defaultFrames = makeDefaultFrames();
  selectedEmitterId = state.emitters[0].id;
  bindEvents();
  syncUi();
  resize();
  await rebuildScene();
  await restoreAutosave();
  resetRuntime();
  animate();
}

init();