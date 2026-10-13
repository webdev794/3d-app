import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gsap from 'gsap';
import { buildGarment } from './garment.js';
import { KitPainter, knitNormalMap } from './texture.js';

const params = new URLSearchParams(location.search);
const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent) || params.has('mobile');
const CENTER = new THREE.Vector3(0, 0.37, 0);
const HOME = { radius: 2.15, theta: 0, phi: Math.PI * 0.47 };

// Messages to Flutter: its JavaScript channel in the mobile WebView, or the
// parent page when the viewer runs in an iframe (Flutter web).
const HOST = params.get('host');
const post = (msg) => {
  const text = JSON.stringify({ ...msg, host: HOST });
  if (window.Viewer) window.Viewer.postMessage(text);
  else if (window.parent !== window) window.parent.postMessage(text, '*');
};

const DEFAULT_DESIGN = {
  garment: 'jersey',
  main: '#0b1016',
  secondary: '#00c2cc',
  accent: '#36e3ee',
  pattern: 'Chevron',
  logoText: 'MANTIS',
  number: '23',
  patternImage: window.DEFAULT_PATTERN ?? null,
  patternColor: '#0b6f78',
  patternBody: 0.06,
};

// ---------- renderer, scene, camera
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 2 : 2.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = backdrop();
// The floodlit stadium (inlined by build.mjs) replaces the plain glow once decoded.
if (window.STADIUM) {
  new THREE.TextureLoader().load(window.STADIUM, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
    coverBackground();
  });
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.16;

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);

// Studio lights: soft key, cool fill, strong cyan rim from behind.
const key = new THREE.DirectionalLight(0xffffff, 1.7);
key.position.set(-1.6, 2.2, 2.4);
const fill = new THREE.DirectionalLight(0x6fa8ff, 0.3);
fill.position.set(2, 0.6, 1.5);
const rimR = new THREE.DirectionalLight(0xc8f4ff, 1.9);
rimR.position.set(1.8, 1.4, -2.2);
const rimL = new THREE.DirectionalLight(0xa9c4ff, 1.2);
rimL.position.set(-1.9, 1.0, -2.0);
scene.add(key, fill, rimR, rimL, new THREE.AmbientLight(0x0a1a2a, 0.6));

// ---------- podium, glow ring, light pool and contact shadow
const podium = new THREE.Group();
podium.position.y = -0.17;
const base = new THREE.Mesh(
  new THREE.CylinderGeometry(0.46, 0.5, 0.07, 96),
  new THREE.MeshPhysicalMaterial({ color: 0x05080d, metalness: 0.1, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.6 }),
);
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00e5ff).multiplyScalar(4), toneMapped: false });
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.463, 0.0045, 12, 160), ringMat);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.036;
const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.0022, 8, 180), ringMat.clone());
outerRing.material.color = new THREE.Color(0x1f7bff).multiplyScalar(2.2);
outerRing.rotation.x = Math.PI / 2;
outerRing.position.y = -0.03;
const pool = new THREE.Mesh(
  new THREE.CircleGeometry(0.46, 64),
  new THREE.MeshBasicMaterial({ map: radial('rgba(255,255,255,0.3)', 'rgba(255,255,255,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
);
pool.rotation.x = -Math.PI / 2;
pool.position.y = 0.0365;
const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.3, 48),
  new THREE.MeshBasicMaterial({ map: radial('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
);
shadow.rotation.x = -Math.PI / 2;
shadow.scale.set(1.15, 0.55, 1);
shadow.position.y = 0.037;
podium.add(base, ring, outerRing, pool, shadow);
scene.add(podium);

// ---------- garment
const kit = new THREE.Group();
scene.add(kit);
/** Garment parts on the podium: { painter, texture, rim, material }. */
let parts = [];
const material = new THREE.MeshPhysicalMaterial({
  roughness: 0.78,
  metalness: 0,
  sheen: 0.08,
  sheenRoughness: 0.5,
  sheenColor: new THREE.Color(0xd8ecff),
  side: THREE.FrontSide,
});
const innerMaterial = new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 0.9, side: THREE.BackSide });
const knit = new THREE.CanvasTexture(knitNormalMap());
knit.wrapS = knit.wrapT = THREE.RepeatWrapping;
knit.repeat.set(44, 22);
material.normalMap = knit;
material.normalScale.set(0.32, 0.32);

let design = { ...DEFAULT_DESIGN };
let currentKind = null;

// The app's garment names map to one or more 3D parts.
const PARTS = {
  jersey: ['jersey'],
  tee: ['tee'],
  polo: ['polo'],
  singlet: ['singlet'],
  shorts: ['shorts'],
  fullkit: ['shorts', 'jersey'],
};

function buildKit(kind) {
  const key = PARTS[kind] ? kind : 'jersey';
  if (key === currentKind) return;
  currentKind = key;
  kit.clear();
  parts = [];
  let base = 0;
  for (const partKind of PARTS[key]) {
    const garment = buildGarment(partKind);
    const painter = new KitPainter(garment.frame, garment.outline, mobile ? 2048 : 4096, partKind);
    const texture = new THREE.CanvasTexture(painter.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const partMaterial = material.clone();
    partMaterial.map = texture;
    const group = new THREE.Group();
    // The inside of the fabric, seen through the neck, hem and cuffs.
    group.add(new THREE.Mesh(garment.geometry, innerMaterial));
    group.add(new THREE.Mesh(garment.geometry, partMaterial));
    // Collar rib or waistband along the top opening.
    const rim = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(garment.neck, true), 96, garment.rimRadius, 12, true),
      new THREE.MeshPhysicalMaterial({ roughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color(0xffffff) }),
    );
    group.add(rim);
    // In a full kit the jersey sits over the shorts' waistband.
    group.position.y = base;
    base += partKind === 'shorts' ? 0.36 : 0;
    kit.add(group);
    parts.push({ painter, texture, rim, material: partMaterial });
  }
  frameKit();
}

/** Re-centres the camera on whatever is on the podium. */
function frameKit() {
  const box = new THREE.Box3().setFromObject(kit);
  const height = box.max.y - box.min.y, width = box.max.x - box.min.x;
  CENTER.set(0, (box.min.y + box.max.y) / 2, 0);
  // Fit the taller of height and (narrow-screen) width, never closer than a jersey.
  HOME.radius = Math.max(2.15, Math.max(height, width * 0.8) * 2.85);
  controls.maxDistance = Math.max(3.4, HOME.radius * 1.6);
  controls.target.copy(CENTER);
  setCamera({ ...HOME, theta: new THREE.Spherical().setFromVector3(camera.position.clone().sub(CENTER)).theta || 0 });
}

async function applyDesign(next) {
  design = { ...design, ...next };
  buildKit(design.garment);
  await document.fonts.load('700 100px Rajdhani').catch(() => {});
  for (const part of parts) {
    await part.painter.paint(design);
    part.texture.needsUpdate = true;
    part.rim.material.color.set(design.secondary);
  }
  ringMat.color.set(design.secondary).multiplyScalar(4);
  pool.material.color.set(design.secondary);
  post({ type: 'designApplied' });
}

// ---------- controls
const controls = new OrbitControls(camera, canvas);
controls.target.copy(CENTER);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.rotateSpeed = 0.75;
controls.zoomSpeed = 0.8;
controls.panSpeed = 0.5;
controls.minDistance = 0.75;
controls.maxDistance = 3.4;
controls.minPolarAngle = Math.PI * 0.3;
controls.maxPolarAngle = Math.PI * 0.6;
controls.autoRotateSpeed = 1.1;
setCamera(HOME);

let idle;
controls.addEventListener('start', () => {
  controls.autoRotate = false;
  clearTimeout(idle);
  gsap.killTweensOf(snap);
});
controls.addEventListener('end', () => {
  clearTimeout(idle);
  idle = setTimeout(() => (controls.autoRotate = true), 6000);
});
controls.addEventListener('change', () => {
  // Keep panning near the garment.
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, -0.35, 0.35);
  controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0.05, 0.7);
  controls.target.z = THREE.MathUtils.clamp(controls.target.z, -0.2, 0.2);
});

// Double-tap resets the camera.
let lastTap = 0;
canvas.addEventListener('pointerup', () => {
  const now = performance.now();
  if (now - lastTap < 300) setView('Front');
  lastTap = now;
});

const snap = { radius: 0, theta: 0, phi: 0 };
function setCamera({ radius, theta, phi }) {
  camera.position.setFromSpherical(new THREE.Spherical(radius, phi, theta)).add(controls.target);
  camera.lookAt(controls.target);
}

function setView(view) {
  const angles = { Front: 0, Side: Math.PI / 2, Back: Math.PI, '360°': null };
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  const s = new THREE.Spherical().setFromVector3(offset);
  controls.autoRotate = view === '360°';
  if (angles[view] == null) return;
  let goal = angles[view];
  // Turn the short way round.
  while (goal - s.theta > Math.PI) goal -= Math.PI * 2;
  while (goal - s.theta < -Math.PI) goal += Math.PI * 2;
  Object.assign(snap, { radius: s.radius, theta: s.theta, phi: s.phi });
  gsap.killTweensOf(snap);
  gsap.to(controls.target, { x: CENTER.x, y: CENTER.y, z: CENTER.z, duration: 0.9, ease: 'power3.inOut' });
  gsap.to(snap, {
    radius: HOME.radius,
    theta: goal,
    phi: HOME.phi,
    duration: 0.9,
    ease: 'power3.inOut',
    onUpdate: () => setCamera(snap),
  });
}

// ---------- post-processing (bloom for the glow ring)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// High threshold: only the emissive rings glow, never the fabric.
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), mobile ? 0.5 : 0.65, 0.5, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  // Keep the whole kit in frame on tall phone screens.
  camera.fov = w / h < 0.75 ? 30 / Math.max(0.62, (w / h) / 0.75) : 30;
  camera.updateProjectionMatrix();
  coverBackground();
}

/** Crops the stadium photo like CSS background-size: cover, so it never stretches. */
function coverBackground() {
  const tex = scene.background;
  if (!tex?.image?.width) return;
  const view = innerWidth / innerHeight, image = tex.image.width / tex.image.height;
  if (view > image) { tex.repeat.set(1, image / view); tex.offset.set(0, (1 - image / view) * 0.55); }
  else { tex.repeat.set(view / image, 1); tex.offset.set((1 - view / image) / 2, 0); }
}
addEventListener('resize', resize);
resize();

// ---------- loop
const clock = new THREE.Clock();
function frame() {
  const dt = clock.getDelta(), t = clock.elapsedTime;
  kit.position.y = 0.012 * Math.sin(t * 1.3);
  shadow.scale.set(1.15 - kit.position.y * 3, 0.55 - kit.position.y * 1.5, 1);
  outerRing.rotation.z = t * 0.15;
  controls.update(dt);
  composer.render();
  requestAnimationFrame(frame);
}

function reveal() {
  kit.scale.setScalar(0.82);
  gsap.fromTo(kit.scale, { x: 0.82, y: 0.82, z: 0.82 }, { x: 1, y: 1, z: 1, duration: 1.2, ease: 'back.out(1.6)' });
  gsap.fromTo(kit.rotation, { y: -1.2 }, { y: 0, duration: 1.4, ease: 'power3.out' });
  gsap.fromTo(bloom, { strength: 2.2 }, { strength: bloom.strength, duration: 1.4, ease: 'power2.out' });
}

function capture(view) {
  // Render the requested view off-camera, then put the user's camera back.
  const saved = camera.position.clone(), target = controls.target.clone();
  if (view) {
    controls.target.copy(CENTER);
    setCamera({ ...HOME, theta: { Front: 0, Side: Math.PI / 2, Back: Math.PI }[view] ?? 0 });
  }
  composer.render();
  const data = renderer.domElement.toDataURL('image/png');
  controls.target.copy(target);
  camera.position.copy(saved);
  camera.lookAt(target);
  return data;
}

// ---------- helpers
function radial(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function backdrop() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#03060a';
  g.fillRect(0, 0, 512, 1024);
  const glow = g.createRadialGradient(256, 560, 20, 256, 560, 620);
  glow.addColorStop(0, 'rgba(0,110,190,0.42)');
  glow.addColorStop(0.45, 'rgba(0,40,90,0.22)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 512, 1024);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- public bridge (called from Flutter via runJavaScript)
window.viewer = {
  setDesign: (json) => applyDesign(typeof json === 'string' ? JSON.parse(json) : json),
  setView,
  capture: (view) => post({ type: 'capture', view, data: capture(view) }),
  captureDataUrl: capture,
  textureDataUrl: () => parts[0].painter.canvas.toDataURL('image/jpeg', 0.8),
  reset: () => setView('Front'),
  // One entry point for both hosts: {cmd, arg}.
  receive: (msg) => {
    const m = typeof msg === 'string' ? JSON.parse(msg) : msg;
    if (m && m.cmd !== 'receive' && typeof window.viewer[m.cmd] === 'function') window.viewer[m.cmd](m.arg);
  },
};
addEventListener('message', (e) => {
  if (e.source === window.parent && typeof e.data === 'string') window.viewer.receive(e.data);
});

(async () => {
  await applyDesign(design);
  reveal();
  setTimeout(() => (controls.autoRotate = !params.has('still')), 1600);
  frame();
  document.body.classList.add('ready');
  post({ type: 'ready' });
})();
