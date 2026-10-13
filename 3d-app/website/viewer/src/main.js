import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gsap from 'gsap';
import { buildGarment, buildCollar } from './garment.js';
import { KitPainter, knitNormalMap } from './texture.js';
import { createStudio } from './studio.js';
import { createBoard } from './board.js';
import { processImage } from './imagetools.js';
import { zoneAt } from './zones.js';

const params = new URLSearchParams(location.search);
const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent) || params.has('mobile');
const CENTER = new THREE.Vector3(0, 0.37, 0);
const HOME = { radius: 2.05, theta: -.15, phi: Math.PI * 0.47 };

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
  logoText: '3DEEZI',
  number: '23',
  patternImage: null,
  patternColor: '#0b6f78',
  patternBody: 0.06,
};

// ---------- renderer, scene, camera
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 2 : 2.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = backdrop();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;

// A photographic stadium plate supplies the distant architecture. The editable
// garment, stage, lighting, shadows and floor reflection are rendered in 3D.
const environmentReady = new Promise((resolve) => {
  new THREE.TextureLoader().load(window.STADIUM || '../showroom/studio-backdrop.webp', (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
    coverBackground();
    resolve();
  }, undefined, () => resolve());
});

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);

const { podium, ringMat, outerRing, pool, shadow } = createStudio(scene, renderer, mobile);

// ---------- garment
const kit = new THREE.Group();
scene.add(kit);
/** Garment parts on the podium: { painter, texture, rim, material }. */
let parts = [];
const material = new THREE.MeshPhysicalMaterial({
  roughness: 0.82,
  reflectivity: 0.2,
  metalness: 0,
  sheen: 0.12,
  sheenRoughness: 0.72,
  sheenColor: new THREE.Color(0x7192a7),
  side: THREE.FrontSide,
});
const innerMaterial = new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 0.9, side: THREE.BackSide });
const knit = new THREE.CanvasTexture(knitNormalMap());
knit.wrapS = knit.wrapT = THREE.RepeatWrapping;
knit.repeat.set(22, 11);
material.normalMap = knit;
material.normalScale.set(0.17, 0.17);

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
    const fabric = new THREE.Mesh(garment.geometry, partMaterial);
    fabric.userData.part = parts.length;
    fabric.castShadow = true;
    fabric.receiveShadow = true;
    group.add(fabric);
    // Collar rib or waistband along the top opening.
    const rim = new THREE.Mesh(
      buildCollar(garment.neck, partKind === 'shorts'),
      new THREE.MeshPhysicalMaterial({ roughness: 0.9, reflectivity: .2, sheen: 0.15, side: THREE.DoubleSide, sheenColor: new THREE.Color(0x7092a4), normalMap: knit, normalScale: new THREE.Vector2(.17, .17) }),
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
  HOME.radius = Math.max(2.05, Math.max(height, width * 0.8) * 2.65);
  controls.maxDistance = Math.max(3.4, HOME.radius * 1.6);
  controls.target.copy(CENTER);
  setCamera({ ...HOME, theta: new THREE.Spherical().setFromVector3(camera.position.clone().sub(CENTER)).theta || 0 });
}

/** Repaints every part's print from the current design. */
async function paintAll() {
  buildKit(design.garment);
  await document.fonts.load('700 100px Rajdhani').catch(() => {});
  for (const part of parts) {
    await part.painter.paint(design);
    part.texture.needsUpdate = true;
    part.rim.material.color.set(design.secondary);
  }
  ringMat.color.set(design.secondary).multiplyScalar(4);
  pool.material.color.set(design.secondary);
  await board.refresh();
}

/** A design from the host (website or app). */
async function applyDesign(next) {
  design = { ...design, ...next };
  await paintAll();
  post({ type: 'designApplied' });
}

// ---------- design board (2D print panels) and picking
let boardPaint = null, boardPending = false;
const board = createBoard({
  getParts: () => parts,
  getDesign: () => design,
  // Board edits repaint locally (throttled) and are reported to the host on release.
  onLayers: (layers, final) => {
    design.layers = layers;
    if (final) post({ type: 'layers', layers });
    if (boardPaint) { boardPending = true; return; }
    boardPaint = paintAll().finally(() => {
      boardPaint = null;
      if (boardPending) { boardPending = false; paintAll(); }
    });
  },
});

const raycaster = new THREE.Raycaster();
/** Normalised screen point (0..1) -> where it lands on the kit. */
function pickAt(nx, ny) {
  const onBoard = board.pick(nx, ny);
  if (onBoard) return { hit: true, ...onBoard, zone: zoneAt(onBoard.kind, onBoard.x, onBoard.y) };
  if (board.visible) return { hit: false };
  raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), camera);
  const meshes = [];
  kit.traverse((o) => { if (o.isMesh && o.userData.part !== undefined) meshes.push(o); });
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (!hit?.uv) return { hit: false };
  const painter = parts[hit.object.userData.part].painter;
  const at = painter.fromCanvas(hit.uv.x * painter.canvas.width, (1 - hit.uv.y) * painter.canvas.height);
  return { hit: true, part: painter.partName, kind: painter.kind, ...at, zone: zoneAt(painter.kind, at.x, at.y) };
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
  const angles = { Front: -.15, Side: Math.PI / 2, Back: Math.PI, '360°': null };
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
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), mobile ? 0.42 : 0.5, 0.42, 1.65);
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
  kit.position.y = 0.0025 * Math.sin(t * .7);
  shadow.scale.set(1.15 - kit.position.y * 3, 0.55 - kit.position.y * 1.5, 1);
  // The architectural stage stays still while the garment turns.
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
  /** {id, x, y} normalised -> posts {type:'pick', id, hit, part, side, x, y, zone}. */
  pick: ({ id, x, y }) => post({ type: 'pick', id, ...pickAt(x, y) }),
  /** {id, src, removeBg, tint, maxSize} -> posts {type:'image', id, data | error}. */
  processImage: ({ id, src, ...options }) =>
    processImage(src, options).then(
      (data) => post({ type: 'image', id, data }),
      (e) => post({ type: 'image', id, error: e.message }),
    ),
  /** Shows or hides the 2D design board. */
  board: (on) => {
    board.show(on);
    canvas.style.visibility = on ? 'hidden' : 'visible';
    if (on) controls.autoRotate = false;
    post({ type: 'board', on: !!on });
  },
  select: (id) => board.select(id),
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
  await environmentReady;
  await applyDesign(design);
  reveal();
  setTimeout(() => (controls.autoRotate = !params.has('still')), 1600);
  frame();
  document.body.classList.add('ready');
  post({ type: 'ready' });
})();
