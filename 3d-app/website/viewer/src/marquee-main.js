import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import gsap from 'gsap';
import { qualityTier, TIERS, stadiumEnvironment } from './render-quality.js';
import { ZONES, ZONE_LABEL, EAVE, RISE, wallsOf, buildMarquee, paintZone, zoneSize, defaultMarqueeDesign, layerBox, drawPattern, loadImage } from './marquee.js';

// The Marquee viewer (Signage & Marquees, 2026-11-02): media/viewer/marquee.html in the website, assets/viewer/
// marquee.html in the apps. The same host protocol as the kit viewer (index.html): window.viewer.receive({cmd, arg})
// or a postMessage string from the parent page; it answers with {type, ..., host} messages.
//   setDesign(marquee)  {size: '3x3'|'3x6', walls: 'none'|'back'|'full', halfWall, zones: {zone: {color, layers}}}
//   setView(view)       'Front' | 'Back' | 'Left' | 'Right' | '360°'
//   selectZone(zone)    outlines the zone and labels it (null: none)
//   selectLayer({zone, id})   the layer Move / Scale act on
//   tool(mode)          'move' | 'scale' | null: a drag on the selected zone moves / scales the selected layer
//   capture(view)       -> {type:'capture', view, data}
//   panelPrint({id, zone})    -> {type:'panelPrint', id, zone, data}: the zone's print at full size (PNG)
// It posts: ready, zonePick {zone}, panels {images: {zone: jpeg data URL}} after every repaint, layerChange
// {zone, id, x, y, w?, size?, final}, error.
// ?scene=showroom (the landing page): a feather flag, a pull-up banner and a table cover beside the marquee too.

const params = new URLSearchParams(location.search);
const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent) || params.has('mobile');
const SHOWROOM = params.get('scene') === 'showroom';
const HOST = params.get('host');
const post = (msg) => {
  const text = JSON.stringify({ ...msg, host: HOST });
  if (window.Viewer) window.Viewer.postMessage(text);
  else if (window.parent !== window) window.parent.postMessage(text, '*');
};

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 2 : 2.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const QUALITY = qualityTier(params, renderer);
const Q = TIERS[QUALITY] ?? TIERS.low;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03070c);
scene.fog = new THREE.FogExp2(0x06111d, 0.022);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(stadiumEnvironment({ softbox: true }), 0.03).texture;
scene.environmentIntensity = 0.9;

// The stadium photo behind, softly out of focus (as the kit viewer).
const environmentReady = new Promise((resolve) => {
  new THREE.TextureLoader().load(window.STADIUM || '../showroom/studio-backdrop.webp', (texture) => {
    const img = texture.image, blur = Math.max(2, Math.round(img.width / 200)), pad = blur * 3;
    const soft = document.createElement('canvas');
    soft.width = img.width; soft.height = img.height;
    const g = soft.getContext('2d');
    g.filter = `blur(${blur}px)`;
    g.drawImage(img, -pad, -pad, img.width + pad * 2, img.height + pad * 2);
    texture.dispose();
    // (Not brightened for the bloom as in the kit viewer: a floodlight behind the roof's peak would flare over it.)
    g.filter = 'none';
    g.fillStyle = 'rgba(2,8,16,.28)';
    g.fillRect(0, 0, soft.width, soft.height);
    const plain = new THREE.CanvasTexture(soft);
    plain.colorSpace = THREE.SRGBColorSpace;
    scene.background = plain;
    coverBackground();
    resolve();
  }, undefined, () => resolve());
});

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

// ---------- lights: a stage at night, a warm key from the front left, cool floodlights behind
const key = new THREE.DirectionalLight(0xffe8d0, 2.4);
key.position.set(-6, 9, 7);
key.castShadow = true;
key.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -3, near: 1, far: 30 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = Q.shadowRadius;
const fill = new THREE.DirectionalLight(0xc8dcf0, 0.55);
fill.position.set(6, 4, 8);
const rimL = new THREE.DirectionalLight(0x9fd4ff, 2.2);
rimL.position.set(-7, 6, -8);
const rimR = new THREE.DirectionalLight(0x9fd4ff, 2.2);
rimR.position.set(7, 6, -8);
// Light under the roof, so the inside and the back wall read (a marquee at an event is lit).
const inside = new THREE.PointLight(0xdbe9ff, 3.2, 9, 1.6);
inside.position.set(0, 1.95, 0.2);
scene.add(key, fill, rimL, rimR, inside, new THREE.HemisphereLight(0x7aadd3, 0x071017, 0.45));

// ---------- the floor: a dark, softly reflecting stage floor, fading into the photo, and the glowing outline
const FLOOR = 16;
const floor = new Reflector(new THREE.CircleGeometry(FLOOR, 96), { clipBias: 0.003, textureWidth: mobile ? 512 : 1024, textureHeight: mobile ? 512 : 1024, color: 0x2a3036, multisample: 0 });
floor.rotation.x = -Math.PI / 2;
floor.material.transparent = true;
floor.material.vertexShader = floor.material.vertexShader
  .replace('varying vec4 vUv;', 'varying vec4 vUv;\nvarying vec2 vStage;')
  .replace('vUv = textureMatrix * vec4( position, 1.0 );', 'vUv = textureMatrix * vec4( position, 1.0 );\nvStage = position.xy;');
floor.material.fragmentShader = floor.material.fragmentShader
  .replace('varying vec4 vUv;', 'varying vec4 vUv;\nvarying vec2 vStage;')
  .replace('vec4 base = texture2DProj( tDiffuse, vUv );', `vec2 uv = vUv.xy / vUv.w;
     float blur = .0025;
     vec4 base = texture2D(tDiffuse, uv) * .28;
     base += texture2D(tDiffuse, uv + vec2(blur, 0.0)) * .18;
     base += texture2D(tDiffuse, uv - vec2(blur, 0.0)) * .18;
     base += texture2D(tDiffuse, uv + vec2(0.0, blur * 1.5)) * .18;
     base += texture2D(tDiffuse, uv - vec2(0.0, blur * 1.5)) * .18;`)
  .replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );', `gl_FragColor = vec4( blendOverlay( base.rgb, color ) * .5, 1.0 - smoothstep(${(FLOOR * 0.45).toFixed(2)}, ${FLOOR.toFixed(2)}, length(vStage)) );`);
scene.add(floor);
// (The selection outline and label are not mirrored in the floor.)
const reflect = floor.onBeforeRender;
floor.onBeforeRender = function (...args) {
  const shown = [zoneLine.visible, layerLine.visible];
  zoneLine.visible = layerLine.visible = false;
  reflect.apply(this, args);
  [zoneLine.visible, layerLine.visible] = shown;
};
// A matt layer over the mirror that takes the shadows.
const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR * 1.4, FLOOR * 1.4), new THREE.ShadowMaterial({ opacity: 0.55 }));
shadowFloor.rotation.x = -Math.PI / 2;
shadowFloor.position.y = 0.002;
shadowFloor.receiveShadow = true;
scene.add(shadowFloor);
const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x14c8ff).multiplyScalar(2.6), toneMapped: false });
const outline = new THREE.Group();
scene.add(outline);
/** The cyan outline on the floor round the marquee's footprint (as the mockups). */
function floorOutline(w, d) {
  outline.children.forEach((c) => c.geometry.dispose());
  outline.clear();
  const pad = 1.1, hw = w / 2 + pad, hd = d / 2 + pad, t = 0.025;
  for (const [x, z, sx, sz] of [[0, hd, hw * 2, t], [0, -hd, hw * 2, t], [hw, 0, t, hd * 2], [-hw, 0, t, hd * 2]]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), glowMat);
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(x, 0.006, z);
    outline.add(bar);
  }
  // A soft pool of light round it.
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,150,230,.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(hw * 3.2, hd * 3.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.004;
  outline.add(pool);
}

// ---------- the marquee
let design = defaultMarqueeDesign();
let model = null, modelKey = '';
const textures = {};
const canvases = {};
const painted = {};
const marquee = new THREE.Group();
scene.add(marquee);

function rebuild() {
  const key = `${design.size}:${design.walls}:${!!design.halfWall}`;
  if (key === modelKey) return false;
  modelKey = key;
  if (model) {
    model.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); [o.material].flat().forEach((m) => m.dispose()); } });
    marquee.remove(model.group);
  }
  model = buildMarquee(design);
  marquee.add(model.group);
  for (const [zone, mesh] of Object.entries(model.zones)) {
    canvases[zone] ??= document.createElement('canvas');
    textures[zone]?.dispose();
    const texture = new THREE.CanvasTexture(canvases[zone]);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    textures[zone] = texture;
    mesh.material.map = texture;
    mesh.userData.through.material.map = texture;
    mesh.userData.through.material.needsUpdate = true;
    mesh.material.needsUpdate = true;
  }
  floorOutline(model.size.w, model.size.d);
  for (const k of Object.keys(painted)) delete painted[k];
  frameModel();
  outlineZone();
  return true;
}

/** Paints the zones whose design changed; posts their small previews. */
async function paint() {
  const previews = {};
  await document.fonts?.load?.('700 40px Rajdhani').catch(() => null);
  for (const zone of ZONES) {
    const size = zoneSize(zone, design);
    if (!size || !model.zones[zone]) continue;
    const zd = design.zones?.[zone] ?? { color: '#05080c', layers: [] };
    const sig = JSON.stringify([zd, design.size, design.walls, design.halfWall]);
    if (painted[zone] === sig) continue;
    painted[zone] = sig;
    await paintZone(canvases[zone], zone, zd, size);
    textures[zone].needsUpdate = true;
    previews[zone] = preview(zone);
  }
  if (Object.keys(previews).length) post({ type: 'panels', images: previews, sizes: Object.fromEntries(ZONES.map((z) => [z, zoneSize(z, design)])) });
  outlineLayer();
}
/** A zone's print, small (the Studio's panel preview and 2D layout). */
function preview(zone, long = 640) {
  const src = canvases[zone], k = Math.min(1, long / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

let queue = Promise.resolve();
function applyDesign(next) {
  if (next && typeof next === 'object') {
    const base = defaultMarqueeDesign();
    design = { ...base, ...next, zones: { ...base.zones, ...(next.zones ?? {}) } };
  }
  queue = queue.then(() => { rebuild(); return paint(); }).catch((error) => post({ type: 'error', message: error.message }));
  return queue;
}

// ---------- the showroom extras (the landing page): a feather flag, a pull-up banner and a table cover
const extras = new THREE.Group();
scene.add(extras);
async function buildExtras() {
  if (!SHOWROOM) return;
  const print = async (w, h, { logo = true, vertical = false } = {}) => {
    const c = document.createElement('canvas');
    c.width = Math.round(w * 300); c.height = Math.round(h * 300);
    const g = c.getContext('2d');
    g.fillStyle = '#05080c'; g.fillRect(0, 0, c.width, c.height);
    drawPattern(g, 'Blades', c.width, c.height, { ink: '#00c8ff', accent: '#1560ff' });
    if (logo) {
      const emblem = await loadImage('3deezi:logo'), word = await loadImage('3deezi:wordmark');
      g.save();
      g.translate(c.width / 2, c.height * (vertical ? 0.42 : 0.45));
      if (vertical) g.rotate(-Math.PI / 2);
      const span = vertical ? c.height * 0.55 : c.width * 0.5;
      if (emblem) { const ew = span * 0.32, eh = ew * (emblem.naturalHeight / emblem.naturalWidth); g.drawImage(emblem, -ew / 2, -eh - span * 0.04, ew, eh); }
      if (word) { const ww = span * 0.8; g.drawImage(word, -ww / 2, span * 0.03, ww, ww * (word.naturalHeight / word.naturalWidth)); }
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide });
  };
  const metal = new THREE.MeshStandardMaterial({ color: 0x1d2228, metalness: 0.85, roughness: 0.3 });
  // The feather flag: a curved sail on a bent pole, a cross base.
  const flag = new THREE.Group();
  const H = 3.1, W = 0.75;
  const sail = new THREE.BufferGeometry(), pos = [], uv = [], idx = [];
  const C = 10, R = 30;
  for (let j = 0; j <= R; j++) for (let i = 0; i <= C; i++) {
    const v = j / R, u = i / C;
    // Wide at the top, narrowing to the foot; the top bends over like a feather.
    const width = W * (0.55 + 0.45 * Math.sin(Math.min(1, v * 1.25) * Math.PI / 2)) * (v > 0.9 ? 1 - (v - 0.9) * 4 : 1);
    pos.push(u * width, 0.5 + v * (H - 0.5) - (v > 0.85 ? u * (v - 0.85) * 2.2 : 0), Math.sin(u * Math.PI) * 0.05);
    uv.push(u, v);
  }
  for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) { const a = j * (C + 1) + i; idx.push(a, a + 1, a + C + 2, a, a + C + 2, a + C + 1); }
  sail.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sail.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  sail.setIndex(idx);
  sail.computeVertexNormals();
  flag.add(new THREE.Mesh(sail, await print(W, H - 0.5, { vertical: true })));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, H, 8), metal);
  pole.position.y = H / 2;
  flag.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.06, 24), metal);
  base.position.y = 0.03;
  flag.add(base);
  flag.traverse((o) => { o.castShadow = true; });
  // The pull-up banner: a tall print in a cassette base.
  const banner = new THREE.Group();
  const bannerMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.0), await print(0.85, 2.0));
  bannerMesh.position.y = 1.1;
  const cassette = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.18), metal);
  cassette.position.y = 0.05;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.025, 0.025), metal);
  bar.position.y = 2.1;
  banner.add(bannerMesh, cassette, bar);
  banner.traverse((o) => { o.castShadow = true; });
  // The table cover: a fitted throw over a 1.8 m table.
  const table = new THREE.Group();
  const top = await print(1.8, 0.75, { logo: true });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.74), top);
  front.position.set(0, 0.38, 0.38);
  const plain = new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 0.85, side: THREE.DoubleSide });
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.02, 0.78), plain);
  lid.position.y = 0.75;
  const sides = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.74, 0.76), plain);
  sides.position.y = 0.37;
  sides.position.z = -0.005;
  table.add(sides, front, lid);
  table.traverse((o) => { o.castShadow = true; });
  extras.add(flag, banner, table);
  layoutExtras();
}
function layoutExtras() {
  const [flag, banner, table] = extras.children;
  if (!flag || !model) return;
  const w = model.size.w;
  flag.position.set(-w / 2 - 1.5, 0, 0.9);
  flag.rotation.y = 0.35;
  banner.position.set(w / 2 + 3.0, 0, -0.2);
  banner.rotation.y = -0.35;
  table.position.set(w / 2 + 1.8, 0, 0.9);
  table.rotation.y = -0.25;
}

// ---------- camera and controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.8;
controls.enablePan = false;
controls.minPolarAngle = Math.PI * 0.18;
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotateSpeed = 0.8;
let home = { radius: 11, theta: 0.32, phi: Math.PI * 0.44 };
function frameModel() {
  const w = model.size.w;
  const fit = camera.aspect < 0.85 ? 1.12 : 1;
  const radius = (SHOWROOM ? 13.5 : w > 4 ? 15.5 : 9.6) * fit;
  home = { radius, theta: SHOWROOM ? 0 : -0.42, phi: Math.PI * (SHOWROOM ? 0.455 : 0.44) };
  controls.target.set(0, SHOWROOM ? (camera.aspect < 0.85 ? 1.6 : 1.85) : 1.55, 0);
  controls.minDistance = radius * 0.45;
  controls.maxDistance = radius * 1.6;
  gsap.killTweensOf(snap);
  setCamera(home);
  layoutExtras();
}
function setCamera({ radius, theta, phi }) {
  camera.position.setFromSpherical(new THREE.Spherical(radius, phi, theta)).add(controls.target);
  camera.lookAt(controls.target);
}
let idle;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idle); gsap.killTweensOf(snap); });
const snap = { radius: 0, theta: 0, phi: 0 };
function setView(view) {
  const angles = { Front: 0, Right: Math.PI / 2, Back: Math.PI, Left: -Math.PI / 2, Side: Math.PI / 2, '360°': null };
  controls.autoRotate = view === '360°';
  clearTimeout(idle);
  if (angles[view] == null) return;
  const s = new THREE.Spherical().setFromVector3(new THREE.Vector3().subVectors(camera.position, controls.target));
  let goal = angles[view] + (view === 'Front' ? home.theta * 0.5 : 0);
  while (goal - s.theta > Math.PI) goal -= Math.PI * 2;
  while (goal - s.theta < -Math.PI) goal += Math.PI * 2;
  Object.assign(snap, { radius: s.radius, theta: s.theta, phi: s.phi });
  gsap.killTweensOf(snap);
  gsap.to(snap, { radius: home.radius, theta: goal, phi: home.phi, duration: 0.9, ease: 'power3.inOut', onUpdate: () => setCamera(snap) });
}

// ---------- the selected zone: a cyan outline with corner handles and its name
const zoneLine = new THREE.Group();
scene.add(zoneLine);
const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0x3fe0ff).multiplyScalar(2.2), toneMapped: false, depthTest: false, transparent: true });
const handleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3fe0ff).multiplyScalar(1.6), toneMapped: false, depthTest: false });
let selectedZone = null, selectedLayer = null, toolMode = null;
const label = document.createElement('div');
label.style.cssText = 'position:fixed;left:0;top:0;transform:translate(-50%,-130%);padding:6px 14px;border-radius:9px;border:1px solid rgba(80,220,255,.75);background:rgba(4,14,24,.86);color:#e8f8ff;font:600 14px Rajdhani,system-ui,sans-serif;letter-spacing:.02em;pointer-events:none;white-space:nowrap;display:none;box-shadow:0 0 18px rgba(0,200,255,.35)';
document.body.append(label);
let labelAt = null;
function outlineZone() {
  zoneLine.children.forEach((c) => c.geometry.dispose());
  zoneLine.clear();
  labelAt = null;
  label.style.display = 'none';
  const corners = selectedZone && model?.outlines[selectedZone];
  if (!corners) return;
  const pts = corners.map((c) => new THREE.Vector3(...c));
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
  line.renderOrder = 10;
  zoneLine.add(line);
  // Handles at the corners and the middles of the edges.
  const s = selectedZone.startsWith('valance') ? 0.05 : 0.08;
  for (let i = 0; i < 4; i++) {
    for (const p of [pts[i], pts[i].clone().lerp(pts[(i + 1) % 4], 0.5)]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), handleMat);
      h.position.copy(p);
      h.renderOrder = 11;
      zoneLine.add(h);
    }
  }
  labelAt = selectedZone === 'roof' ? new THREE.Vector3(0, EAVE + RISE + 0.1, 0) : pts[0].clone().lerp(pts[1], 0.5).add(new THREE.Vector3(0, 0.05, 0));
  label.textContent = selectedZone === 'wallLeft' && wallsOf(design).wallLeft === 'half' ? 'Left half wall' : ZONE_LABEL[selectedZone];
  label.style.display = params.has('nolabel') ? 'none' : 'block';
}
/** The selected layer's box, outlined on its panel's print (a dashed frame drawn into the canvas copy). */
const layerLine = new THREE.Group();
scene.add(layerLine);
async function outlineLayer() {
  layerLine.children.forEach((c) => c.geometry.dispose());
  layerLine.clear();
  const zone = selectedLayer?.zone, mesh = zone && model?.zones[zone];
  const layer = mesh && design.zones?.[zone]?.layers?.find((l) => l.id === selectedLayer.id);
  if (!layer || layer.type === 'pattern' || layer.visible === false || !toolMode) return;
  const box = await layerBox(layer, zoneSize(zone, design));
  // The box's corners in uv, found on the mesh by its uv grid (nearest vertex).
  const uv = mesh.geometry.attributes.uv, pos = mesh.geometry.attributes.position;
  const at = (u, v) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < uv.count; i++) { const d = (uv.getX(i) - u) ** 2 + (uv.getY(i) - v) ** 2; if (d < bd) { bd = d; best = i; } }
    return new THREE.Vector3(pos.getX(best), pos.getY(best), pos.getZ(best));
  };
  const x0 = box.x - box.w / 2, x1 = box.x + box.w / 2, y0 = 1 - (box.y - box.h / 2), y1 = 1 - (box.y + box.h / 2);
  const pts = [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)];
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }));
  line.renderOrder = 12;
  layerLine.add(line);
}

// ---------- picking: a tap on a zone selects it; a drag with Move / Scale changes the selected layer
const raycaster = new THREE.Raycaster();
function hitAt(e) {
  const r = canvas.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const meshes = Object.values(model?.zones ?? {});
  return raycaster.intersectObjects([...meshes, ...model.group.children.filter((o) => !meshes.includes(o))], false).find((h) => h.object.userData.zone) ?? null;
}
let down = null, drag = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (!toolMode || !selectedLayer) return;
  const hit = hitAt(e);
  const layer = design.zones?.[selectedLayer.zone]?.layers?.find((l) => l.id === selectedLayer.id);
  if (!hit || hit.object.userData.zone !== selectedLayer.zone || !layer || layer.type === 'pattern') return;
  controls.enabled = false;
  canvas.setPointerCapture(e.pointerId);
  drag = { layer, startY: e.clientY, w: Number(layer.w) || 0.3, size: Number(layer.size) || 0.15, offset: [layer.x - hit.uv.x, layer.y - (1 - hit.uv.y)] };
});
let dragPost = 0;
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const { layer } = drag;
  if (toolMode === 'move') {
    const hit = hitAt(e);
    if (!hit || hit.object.userData.zone !== selectedLayer.zone) return;
    layer.x = Math.min(1, Math.max(0, hit.uv.x + drag.offset[0]));
    layer.y = Math.min(1, Math.max(0, 1 - hit.uv.y + drag.offset[1]));
  } else {
    const k = Math.exp((drag.startY - e.clientY) / 160);
    if (layer.type === 'image') layer.w = Math.min(1, Math.max(0.02, drag.w * k));
    else layer.size = Math.min(1, Math.max(0.02, drag.size * k));
  }
  delete painted[selectedLayer.zone];
  applyDesign();
  if (performance.now() - dragPost > 120) { dragPost = performance.now(); sendLayer(layer, false); }
});
const endDrag = () => {
  if (!drag) return;
  sendLayer(drag.layer, true);
  drag = null;
  controls.enabled = true;
};
const sendLayer = (layer, final) => post({ type: 'layerChange', zone: selectedLayer.zone, id: layer.id, x: layer.x, y: layer.y, ...(layer.type === 'image' ? { w: layer.w } : { size: layer.size }), final });
canvas.addEventListener('pointerup', (e) => {
  const wasDrag = !!drag;
  endDrag();
  if (wasDrag || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 600) return;
  const hit = hitAt(e);
  if (hit) post({ type: 'zonePick', zone: hit.object.userData.zone });
});
canvas.addEventListener('pointercancel', endDrag);

// ---------- rendering
const composer = new EffectComposer(renderer);
if (Q.msaa) composer.renderTarget1.samples = composer.renderTarget2.samples = Q.msaa;
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 1.55);
composer.addPass(bloom);
composer.addPass(new OutputPass());
if (Q.fxaa) composer.addPass(new FXAAPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w / h < 0.75 ? 38 : 30;
  camera.updateProjectionMatrix();
  coverBackground();
  if (model) frameModel();
}
function coverBackground() {
  const tex = scene.background;
  if (!tex?.image?.width) return;
  const view = innerWidth / innerHeight, image = tex.image.width / tex.image.height;
  if (view > image) { tex.repeat.set(1, image / view); tex.offset.set(0, (1 - image / view) * 0.55); }
  else { tex.repeat.set(view / image, 1); tex.offset.set((1 - view / image) / 2, 0); }
}
addEventListener('resize', resize);

let released = false;
const v3 = new THREE.Vector3();
function frame() {
  if (released) return;
  controls.update();
  composer.render();
  if (labelAt && label.style.display !== 'none') {
    v3.copy(labelAt).project(camera);
    label.style.left = `${((v3.x + 1) / 2) * innerWidth}px`;
    label.style.top = `${((1 - v3.y) / 2) * innerHeight}px`;
  }
  requestAnimationFrame(frame);
}

function capture(view) {
  const saved = camera.position.clone();
  const hidden = [zoneLine.visible, layerLine.visible, label.style.display];
  zoneLine.visible = layerLine.visible = false;
  if (view) setCamera({ ...home, theta: { Front: 0, Right: Math.PI / 2, Back: Math.PI, Left: -Math.PI / 2 }[view] ?? home.theta });
  composer.render();
  const data = renderer.domElement.toDataURL('image/png');
  [zoneLine.visible, layerLine.visible] = hidden;
  camera.position.copy(saved);
  camera.lookAt(controls.target);
  return data;
}

// ---------- the host bridge
if (params.has('debug')) window.__m = { scene, camera, controls, get model() { return model; }, get design() { return design; }, canvases };
window.viewer = {
  setDesign: (json) => applyDesign(typeof json === 'string' ? JSON.parse(json) : json),
  setView,
  reset: () => setView('Front'),
  selectZone: (zone) => { selectedZone = ZONES.includes(zone) ? zone : null; outlineZone(); },
  selectLayer: (arg) => { selectedLayer = arg && arg.zone && arg.id ? { zone: arg.zone, id: arg.id } : null; outlineLayer(); },
  tool: (mode) => { toolMode = mode === 'move' || mode === 'scale' ? mode : null; outlineLayer(); },
  capture: (view) => post({ type: 'capture', view, data: capture(view) }),
  captureDataUrl: capture,
  panelPrint: async ({ id, zone } = {}) => {
    await queue;
    if (!canvases[zone] || !model?.zones[zone]) { post({ type: 'panelPrint', id, zone, error: 'This marquee has no such panel.' }); return; }
    post({ type: 'panelPrint', id, zone, data: canvases[zone].toDataURL('image/png'), size: zoneSize(zone, design) });
  },
  receive: (msg) => {
    try {
      const m = typeof msg === 'string' ? JSON.parse(msg) : msg;
      const allowed = ['setDesign', 'setView', 'reset', 'selectZone', 'selectLayer', 'tool', 'capture', 'panelPrint'];
      if (m && allowed.includes(m.cmd)) Promise.resolve(window.viewer[m.cmd](m.arg)).catch((error) => post({ type: 'error', command: m.cmd, message: error.message }));
    } catch (error) { post({ type: 'error', message: error.message }); }
  },
};
addEventListener('message', (e) => {
  if (e.source === window.parent && e.origin === location.origin && typeof e.data === 'string') window.viewer.receive(e.data);
});
addEventListener('pagehide', (event) => {
  if (event.persisted || released) return;
  released = true;
  try {
    scene.traverse((o) => { o.geometry?.dispose(); [o.material ?? []].flat().forEach((m) => { m.map?.dispose(); m.dispose(); }); });
    floor.getRenderTarget().dispose();
    composer.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  } catch { /* leaving anyway */ }
});

(async () => {
  resize();
  await environmentReady;
  await applyDesign();
  await buildExtras();
  frame();
  document.body.classList.add('ready');
  if (SHOWROOM || params.has('spin')) controls.autoRotate = false;
  post({ type: 'ready' });
})().catch((error) => post({ type: 'error', message: error.message }));
