import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gsap from 'gsap';
import { buildGarment, buildCollar, buildDrawstring, SPECS } from './garment.js';
import { KitPainter, knitNormalMap } from './texture.js';
import { createStudio } from './studio.js';
import { createBoard } from './board.js';
import { processImage } from './imagetools.js';
import { zoneAt } from './zones.js';
import { readLayout, findPanels, confirmPanels, hemFold, joinLines, drawPockets, ROLE_NAMES } from './layout.js';
import { regionsFor, warpLayout, panelColour, panelSides, DRAWN, drawingSides, orderDrawing, lineColour, drawnCut, sleevedShape } from './layout-warp.js';

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
  layers: [],
  zones: {},
  gradient: null,
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
scene.environmentIntensity = 0.3;

// A photographic stadium plate supplies the distant architecture. The editable
// garment, stage, lighting, shadows and floor reflection are rendered in 3D.
const environmentReady = new Promise((resolve) => {
  new THREE.TextureLoader().load(window.STADIUM || '../showroom/studio-backdrop.webp', (texture) => {
    // Shallow depth of field: the stadium is softly out of focus behind the sharp kit.
    const img = texture.image, blur = Math.max(2, Math.round(img.width / 240)), pad = blur * 3;
    const soft = document.createElement('canvas');
    soft.width = img.width; soft.height = img.height;
    const g = soft.getContext('2d');
    g.filter = `blur(${blur}px)`;
    g.drawImage(img, -pad, -pad, img.width + pad * 2, img.height + pad * 2);
    texture.dispose();
    texture = new THREE.CanvasTexture(soft);
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
    coverBackground();
    resolve();
  }, undefined, () => resolve());
});

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);

const { podium, ringMat, outerRing, pool, shadow } = createStudio(scene, renderer, mobile);

// ---------- garment
/** Relief of the sewing (stitches, seams, hem edges) per garment shape, made once. */
const reliefs = new Map();
/** Adds the sewing relief on top of the fabric weave (both are normal maps, blended in the shader). */
function addRelief(target, painter) {
  // A garment cut like a drawing has its own (only the latest such is kept).
  const key = `${painter.cut ? `cut:${painter.cut}:` : ''}${painter.kind}:${painter.canvas.width}`;
  if (painter.cut && !reliefs.has(key)) {
    for (const [k, old] of reliefs) if (k.startsWith('cut:')) { old.dispose(); reliefs.delete(k); }
  }
  if (!reliefs.has(key)) {
    const relief = new THREE.CanvasTexture(painter.reliefMap());
    relief.anisotropy = renderer.capabilities.getMaxAnisotropy();
    reliefs.set(key, relief);
  }
  const relief = reliefs.get(key);
  target.customProgramCacheKey = () => 'sewing-relief';
  target.onBeforeCompile = (shader) => {
    shader.uniforms.reliefMap = { value: relief };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normalmap_pars_fragment>', '#include <normalmap_pars_fragment>\nuniform sampler2D reliefMap;')
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(
        'mapN.xy *= normalScale;',
        'mapN.xy *= normalScale;\n\tvec3 relief = texture2D( reliefMap, vMapUv ).xyz * 2.0 - 1.0;\n\tmapN = normalize( vec3( mapN.xy + relief.xy, mapN.z * relief.z ) );',
      ));
  };
}

const kit = new THREE.Group();
scene.add(kit);
/** Garment parts on the podium: { painter, texture, rim, material }. */
let parts = [];
const material = new THREE.MeshPhysicalMaterial({
  roughness: 0.64,
  reflectivity: 0.2,
  metalness: 0,
  // Polyester's soft gloss, caught by the raised threads of the weave.
  sheen: 0.45,
  sheenRoughness: 0.42,
  sheenColor: new THREE.Color(0x9fb4c6),
  side: THREE.FrontSide,
  // Baked crease shading from the garment geometry (fold valleys, under the arms).
  vertexColors: true,
});
const knit = new THREE.CanvasTexture(knitNormalMap());
knit.wrapS = knit.wrapT = THREE.RepeatWrapping;
// Twill ridges about 3 mm apart on the garment (u spans front + back, v one panel).
knit.repeat.set(18, 9);
knit.anisotropy = renderer.capabilities.getMaxAnisotropy();
material.normalMap = knit;
material.normalScale.set(0.42, 0.42);

let design = { ...DEFAULT_DESIGN };
let currentKind = null;

// The app's garment names map to one or more 3D parts.
const PARTS = {
  jersey: ['jersey'],
  tee: ['tee'],
  raglan: ['raglan'],
  polo: ['polo'],
  singlet: ['singlet'],
  shorts: ['shorts'],
  fullkit: ['shorts', 'jersey'],
};

function buildKit(kind) {
  // A print layout brings its own parts (a raglan top, shorts or both); the garment chosen shows its top, its
  // shorts or the full kit.
  let list = PARTS[PARTS[kind] ? kind : 'jersey'];
  if (layout) {
    // A garment drawing is of one top (the one it was checked as).
    const own = layout.drawing ? [layout.garment] : layoutParts(layout.panels);
    const pick = kind === 'fullkit' ? own : kind === 'shorts' ? own.filter((p) => p === 'shorts') : own.filter((p) => p !== 'shorts');
    list = pick.length ? pick : own;
  }
  // A layout's shorts are training shorts (cut like its leg pieces), so the key says which; a drawing's top is the
  // garment itself, cut like the drawing when it can be (drawnCut).
  const cut = layout?.drawing ? layout.cut : null;
  const key = (layout && !layout.drawing ? 'layout:' : '') + list.join('+') + (cut ? `:cut:${layout.key}` : '');
  if (key === currentKind) return;
  currentKind = key;
  const geometries = new Set();
  kit.traverse((o) => { if (o.isMesh) { geometries.add(o.geometry); o.material.dispose(); } });
  geometries.forEach((geometry) => geometry.dispose());
  parts.forEach((part) => part.texture.dispose());
  kit.clear();
  parts = [];
  let base = 0;
  for (const partKind of list) {
    const own = cut && partKind === layout.garment ? cut : null;
    // A layout's tee over its shorts (shown bigger, below) hangs a little fuller at the hem, over their waistband.
    const over = partKind === 'raglan' && layout && list.includes('shorts') ? { ...SPECS.raglan, hemFlare: 0.09 } : null;
    const garment = buildGarment(partKind === 'shorts' && layout ? 'trainingShorts' : partKind, { spec: own ?? over });
    const painter = new KitPainter(garment.frame, garment.outline, mobile ? 2048 : 4096, partKind);
    if (own) painter.cut = layout.key;
    // The finished edges (the hem follows a leg's side split), the waistband's width and the places a print
    // layout's pieces are matched to.
    painter.edgeMask = garment.edges;
    painter.rimWidth = garment.rimWidth;
    painter.points = garment.points;
    // The fabric as worn: a garment drawing keeps its shapes on it (layout-warp.js).
    painter.surface = garment.surface;
    const texture = new THREE.CanvasTexture(painter.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const partMaterial = material.clone();
    partMaterial.map = texture;
    addRelief(partMaterial, painter);
    const group = new THREE.Group();
    // The inside of the fabric, seen through the neck, hem and cuffs: the same print in
    // shade (sublimated prints show through), not a black hole.
    group.add(new THREE.Mesh(garment.geometry, new THREE.MeshStandardMaterial({ map: texture, color: 0x5a6068, roughness: 0.95, vertexColors: true, side: THREE.BackSide })));
    const fabric = new THREE.Mesh(garment.geometry, partMaterial);
    fabric.userData.part = parts.length;
    fabric.castShadow = true;
    fabric.receiveShadow = true;
    group.add(fabric);
    // Collar rib or waistband along the top opening.
    const rim = new THREE.Mesh(
      buildCollar(garment.neck, partKind === 'shorts', garment.rimWidth),
      new THREE.MeshPhysicalMaterial({ roughness: 0.9, reflectivity: .2, sheen: 0.15, side: THREE.DoubleSide, sheenColor: new THREE.Color(0x7092a4), normalMap: knit, normalScale: new THREE.Vector2(.17, .17) }),
    );
    group.add(rim);
    // Shorts: the drawstring out of the front of the waistband.
    const cord = garment.drawstring ? buildDrawstring(garment) : null;
    if (cord) group.add(cord.group);
    // A layout's training shorts are shown longer than their flat pattern (as on the client's mock-ups), and as much
    // wider and deeper: the same proportions, only bigger.
    const stretch = partKind === 'shorts' && layout ? 1.12 : 1;
    group.scale.setScalar(stretch);
    // In a full kit the jersey sits over the shorts' waistband.
    group.position.y = base;
    base += partKind === 'shorts' ? garment.frame.maxY * stretch - 0.06 : 0;
    kit.add(group);
    parts.push({ painter, texture, rim, cord, garment, material: partMaterial });
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
  await prepareLayout();
  buildKit(design.garment);
  warpParts();
  await document.fonts.load('700 100px Rajdhani').catch(() => {});
  for (const part of parts) {
    await part.painter.paint(design);
    part.texture.needsUpdate = true;
    part.rim.material.color.set(layout && part.layoutRim ? part.layoutRim : design.secondary);
    // The drawstring: the cord darker than the waistband it comes out of, eyelets and tips in the trim colour.
    if (part.cord) {
      part.cord.cord.color.set(layout && part.layoutRim ? part.layoutRim : design.main).multiplyScalar(0.82);
      part.cord.metal.color.set(layout && part.layoutAccent ? part.layoutAccent : design.accent);
    }
  }
  ringMat.color.set(design.secondary).multiplyScalar(4);
  pool.material.color.set(design.secondary);
  await board.refresh();
}

/** A design from the host (website or app). */
let paintQueue = Promise.resolve();
const enqueuePaint = (work) => {
  const task = paintQueue.then(work);
  paintQueue = task.catch((error) => post({ type: 'error', command: 'setDesign', message: error.message }));
  return task;
};
function applyDesign(next) {
  return enqueuePaint(async () => {
    if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('A design object is required.');
    design = { ...design, ...next };
    await paintAll();
    post({ type: 'designApplied' });
  });
}

// ---------- print layouts (layout.js reads them, layout-warp.js puts them on the garment)
// A design's print layout is {asset: the host's id for the file, name, roles: each panel's name in the order found,
// hemFold: the hem fold strips are cut off, joinLines: white lines across the sleeves are joined up, parts: what the
// panels make}. Files read are kept by asset (the last two,
// for undo and redo); a file the viewer has not read is asked of the host ({type: 'layoutWanted'}, answered with
// layoutFile) when the host says it can.
// A garment drawing (the finished design's front and back drawn flat, as on a tech sheet or a mock-up) is a layout
// with kind: 'drawing' and parts: [the garment it is: a key of DRAWN, such as 'singlet']; its roles name the front
// and the back. It goes onto that garment edge to edge, its pattern and logos as drawn.
const layoutFiles = new Map();
const layoutMissing = new Set();   // files the host could not give: those kits are shown without them
let layout = null;                 // the layout on the kit: {key, image, panels}
let layoutAsked = null;            // {asset, resolve, reject} while the host fetches a file
// Hosts that can send files say so: &layouts in the address (website) or features({layouts: true}) (the apps).
let hostLayouts = params.has('layouts');
function dropLayout() {
  layout = null;
  parts.forEach((p) => { p.painter.layoutBase = null; });
  delete document.body.dataset.layout;
}
function keepFile(asset, file) {
  layoutFiles.delete(asset);
  layoutFiles.set(asset, file);
  while (layoutFiles.size > 2) layoutFiles.delete(layoutFiles.keys().next().value);
}
/**
 * A print layout file (data URL of a PDF, SVG or picture) read into its panels, each named from its label; a garment
 * drawing (`drawing`) into its front and back.
 */
async function readLayoutFile(src, drawing = false) {
  const long = Math.min(mobile ? 3000 : 4800, renderer.capabilities.maxTextureSize);
  const { image, labels } = await readLayout(String(src ?? ''), { long });
  const found = findPanels(image, labels, { drawing });
  if (!found.length) throw new Error(drawing ? 'No garment was found in this picture: it needs the garment on a plain background.' : 'No garment panels were found in this file.');
  if (drawing) orderDrawing(found);
  return { image, found };
}
/** A drawing's shape is a garment: not a detail panel or photo (frame), upright, its neck, straps and underarms found. */
function garmentShape(p) {
  const w = p.x1 - p.x0, h = p.y1 - p.y0, sleeved = sleevedShape(p.outline);
  return !p.frame && h > (sleeved ? 0.5 : 0.75) * w && h < 2.4 * w && drawingSides(p.outline, sleeved).found;
}
/** The key a file read is kept by (a drawing is read differently from a print layout). */
const fileKey = (asset, drawing) => (drawing ? `drawing:${asset}` : asset);
/** The garments a drawing can go on, as the hosts name them. */
const DRAWN_NAMES = { singlet: 'Singlet', jersey: 'Jersey', tee: 'Training Tee', polo: 'Polo' };
/** The garment a drawing goes on: the one it was checked as (its parts), else the design's own top, else a singlet. */
const drawnGarment = (...choices) => choices.find((g) => typeof g === 'string' && Object.hasOwn(DRAWN, g)) ?? 'singlet';
/** The parts a layout's panels make: a raglan top, shorts, or both. */
function layoutParts(panels) {
  const roles = new Set(panels.map((p) => p.role));
  const top = ['front', 'back', 'sleeveL', 'sleeveR'].some((r) => roles.has(r));
  const legs = roles.has('legL') || roles.has('legR');
  return top && legs ? ['shorts', 'raglan'] : legs ? ['shorts'] : ['raglan'];
}
/** The panels used (roles in the order found; 'none' left out), each body panel without its hem fold strip when fold is on. */
function namePanels(image, found, roles, fold) {
  return found.map((p, i) => {
    const role = Object.hasOwn(ROLE_NAMES, roles[i]) ? roles[i] : 'none';
    return { ...p, role, hemFold: fold && (role === 'front' || role === 'back') ? hemFold(image, p) : null };
  }).filter((p) => p.role !== 'none');
}
/** The design's print layout ready to put on the kit (its file asked of the host when the viewer has not read it). */
async function prepareLayout() {
  const want = design.layout;
  if (!want || want.asset == null) { if (layout) dropLayout(); return; }
  const drawing = want.kind === 'drawing';
  // Joined unless the layout says not (layouts saved before the choice existed join too, as the mock-ups show).
  const fold = !drawing && want.hemFold !== false, join = !drawing && want.joinLines !== false;
  const garment = drawing ? drawnGarment(want.parts?.[0], design.garment) : null;
  const key = JSON.stringify([want.asset, want.roles ?? null, fold, join, garment]);
  if (layout?.key === key) return;
  dropLayout();
  if (layoutMissing.has(want.asset)) return;
  let file = layoutFiles.get(fileKey(want.asset, drawing));
  if (!file) {
    // Other hosts (older versions) are never asked: the kit is shown without it.
    if (!hostLayouts) return;
    try {
      const src = await new Promise((resolve, reject) => {
        layoutAsked = { asset: want.asset, resolve, reject };
        setTimeout(() => reject(new Error('The print layout file did not arrive.')), 180000);
        post({ type: 'layoutWanted', asset: want.asset, name: want.name ?? '' });
      });
      file = await readLayoutFile(src, drawing);
      keepFile(fileKey(want.asset, drawing), file);
    } catch (error) {
      layoutMissing.add(want.asset);
      post({ type: 'layoutError', asset: want.asset, message: error.message });
      return;
    } finally { layoutAsked = null; }
  }
  // The same file gives the same panels; if it ever gave a different number, they are named by their labels.
  const roles = Array.isArray(want.roles) && want.roles.length === file.found.length ? want.roles : file.found.map((p) => p.role);
  const panels = namePanels(file.image, file.found, roles, fold);
  if (drawing) {
    // A singlet is cut like the drawing (its straps, armholes and sides), so the print goes on with its shapes kept.
    const front = panels.find((p) => p.role === 'front') ?? panels.find((p) => p.role === 'back');
    const cut = garment === 'singlet' && front ? drawnCut(front, SPECS.singlet) : null;
    layout = { key, image: file.image, panels, drawing: true, garment, cut };
    document.body.dataset.layout = String(want.asset);
    return;
  }
  // The white line between a sleeve's band and the sleeve, left out when the layout says so (as in the mock-ups).
  const sleeves = panels.filter((p) => p.role === 'sleeveL' || p.role === 'sleeveR');
  let image = join && sleeves.length ? joinLines(file.image, sleeves) : file.image;
  // The pocket marks on the leg pieces become pocket openings, as on the made shorts.
  const legs = panels.filter((p) => p.role === 'legL' || p.role === 'legR');
  // Each with its side line (where the 3D side seam goes), so the openings face the front with their lip as made.
  if (legs.length) image = drawPockets(image, legs.map((p) => ({ ...p, side: panelSides(p).left?.[1] })));
  layout = { key, image, panels };
  // Which file is on the kit (for checks from outside, such as automated tests).
  document.body.dataset.layout = String(want.asset);
}
/** The host's answer to layoutWanted: {asset, src} or {asset, error}. */
function layoutFile({ asset, src, error } = {}) {
  if (!layoutAsked || layoutAsked.asset !== asset) return;
  if (src) layoutAsked.resolve(src); else layoutAsked.reject(new Error(error || 'The print layout file could not be loaded.'));
}
/** Each part's print, drawn from the layout's panels (once per part), and its collar or waistband colour. */
function warpParts() {
  if (!layout) return;
  const byRole = Object.fromEntries(layout.panels.map((p) => [p.role, p]));
  for (const part of parts) {
    if (part.painter.layoutBase) continue;
    const { painter } = part, shorts = painter.kind === 'shorts';
    painter.layoutBase = warpLayout(renderer, layout.image, regionsFor(painter, layout.panels, layout.image, { drawing: !!layout.drawing }), painter.canvas.width, painter.canvas.height);
    const main = shorts ? byRole.legL ?? byRole.legR : byRole.front ?? byRole.back;
    painter.layoutFill = main ? panelColour(layout.image, main, 0.45, 0.8) : design.main;
    part.layoutRim = shorts ? (main ? panelColour(layout.image, main, 0, 0.06) : null) : byRole.neck ? panelColour(layout.image, byRole.neck) : painter.layoutFill;
    // A drawing's collar: the colour of its neckline's trim, just in from the edge.
    if (layout.drawing && main) {
      const w = main.x1 - main.x0, middle = [(main.x0 + main.x1) / 2, (main.y0 + main.y1) / 2];
      part.layoutRim = lineColour(layout.image, drawingSides(main.outline, !!DRAWN[layout.garment]?.CT).sides[0], middle, Math.max(4, 0.012 * w));
    }
    // The trim colour (the neck trim's), for the shorts' eyelets and cord tips.
    part.layoutAccent = byRole.neck ? panelColour(layout.image, byRole.neck) : null;
  }
}
/**
 * A new print layout from the host ({id, src: data URL of a PDF, SVG or picture, name, asset: the host's id for the
 * file}): its panels found, named from their labels and shown for checking. Posts {type: 'layout', id, roles, hemFold,
 * parts, panels} (the host then puts it on with setDesign({layout: {asset, name, roles, hemFold, parts}})),
 * {type: 'layout', id, cancelled: true} or {type: 'layout', id, error}.
 * A garment drawing (`drawing: true`; `garment`: the host's guess of what it is): its front and back found and shown
 * for checking with the garment; posts {type: 'layout', id, kind: 'drawing', roles, parts: [garment], panels} (put on
 * with setDesign({garment, layout: {asset, name, roles, kind: 'drawing', parts}})).
 */
async function checkLayout({ id, src, name = 'Print layout', asset = null, drawing = false, garment = null } = {}) {
  try {
    const file = await readLayoutFile(src, drawing);
    if (asset != null) { keepFile(fileKey(asset, drawing), file); layoutMissing.delete(asset); }
    // The host hides its own buttons over the 3D view while the check screen is open.
    post({ type: 'modal', open: true });
    let options = {};
    if (drawing) {
      // Only garment shapes are named front and back (a mock-up's detail panels, a photo's shapes are not); with no
      // clean pair the person is told, and chooses (the check screen will not put a non-garment shape on the kit).
      const usable = file.found.map(garmentShape);
      file.found.forEach((p, i) => { if (!usable[i]) p.role = 'none'; });
      const big = Math.max(0, ...file.found.filter((_, i) => usable[i]).map((p) => (p.x1 - p.x0) * (p.y1 - p.y0)));
      const many = file.found.filter((p, i) => usable[i] && (p.x1 - p.x0) * (p.y1 - p.y0) > 0.5 * big).length > 2;
      const named = file.found.filter((p) => p.role === 'front' || p.role === 'back').length;
      // The garment it is, from its shape: sleeves make it a jersey, tee or polo (the one asked for, else a jersey).
      const main = file.found.find((p) => p.role === 'front') ?? file.found.find((p) => p.role === 'back');
      const sleeved = main ? sleevedShape(main.outline) : false;
      const guess = sleeved ? (['jersey', 'tee', 'polo'].includes(garment) ? garment : ['jersey', 'tee', 'polo'].includes(design.garment) ? design.garment : 'jersey') : 'singlet';
      options = {
        drawing: true,
        garments: Object.fromEntries(Object.keys(DRAWN).map((g) => [g, DRAWN_NAMES[g] ?? g])),
        garment: guess,
        dots: file.found.map((p, i) => (usable[i] ? Object.values(drawingSides(p.outline, sleevedShape(p.outline)).corners).map((k) => p.outline[k]) : [])),
        usable,
        warning: !named || many ? 'This looks like a photo or presentation mockup. Use your flat design (front and back drawn side by side), or choose the front and back below.' : '',
        remark: file.found.plain === false ? 'This picture is a photo mockup: its lighting and folds are printed onto the 3D kit as they are (a flat drawing gives the cleanest kit).' : '',
      };
    }
    const choice = await confirmPanels(file.image, file.found, name, options).finally(() => post({ type: 'modal', open: false }));
    if (!choice) { post({ type: 'layout', id, cancelled: true }); return; }
    const used = namePanels(file.image, file.found, choice.roles, !drawing && choice.fold);
    const panels = used.map((p) => ({ role: p.role, label: p.label }));
    if (drawing) post({ type: 'layout', id, kind: 'drawing', roles: choice.roles, parts: [drawnGarment(choice.garment)], panels });
    else post({ type: 'layout', id, roles: choice.roles, hemFold: choice.fold, joinLines: choice.join, parts: layoutParts(used), panels });
  } catch (error) {
    post({ type: 'layout', id, error: error.message });
  }
}

// ---------- design board (2D print panels) and picking
let boardPending = false;
const board = createBoard({
  getParts: () => parts,
  getDesign: () => design,
  onSelect: (id) => post({ type: 'selection', id }),
  // Board edits repaint locally (throttled) and are reported to the host on release.
  onLayers: (layers, final) => {
    design.layers = layers;
    if (final) post({ type: 'layers', layers });
    repaintSoon();
  },
  // The fixed marks (wordmark, crest, sponsor, name, number) moved, resized, turned or hidden.
  onMarks: (marks, final) => {
    design.marks = marks;
    if (final) post({ type: 'marks', marks });
    repaintSoon();
  },
});
function repaintSoon() {
  if (boardPending) return;
  boardPending = true;
  enqueuePaint(async () => { boardPending = false; await paintAll(); }).catch(() => {});
}

const raycaster = new THREE.Raycaster();
/** Normalised screen point (0..1) -> where it lands on the kit. */
function pickAt(nx, ny) {
  if (![nx, ny].every(Number.isFinite) || nx < 0 || nx > 1 || ny < 0 || ny > 1) return { hit: false };
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
// Automated tests only (?debug): reach the camera for close-ups.
if (new URLSearchParams(location.search).has('debug')) window.__v = { camera, controls, scene, kit, setCamera, get parts() { return parts; }, get layout() { return layout; }, panelSides, regionsFor };

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
    processImage(src, { ...options, ...options.options }).then(
      (data) => post({ type: 'image', id, data }),
      (e) => post({ type: 'image', id, error: e.message }),
    ),
  /** Shows or hides the 2D design board. */
  board: async (on) => {
    await paintQueue;
    await board.show(on);
    canvas.style.visibility = on ? 'hidden' : 'visible';
    if (on) controls.autoRotate = false;
    post({ type: 'board', on: !!on });
  },
  select: (id) => board.select(id),
  /** Zooms the design board: 'in', 'out' or 'fit'. */
  boardZoom: (how) => board.zoom(how),
  /** {id, src, name, asset, drawing?, garment?}: a new factory print layout or garment drawing, checked on screen; see checkLayout. */
  checkLayout,
  /** {asset, src | error}: the file the viewer asked for (layoutWanted). */
  layoutFile,
  /** What the host can do: {layouts: true} = it answers layoutWanted. */
  features: (what = {}) => { if (what?.layouts) hostLayouts = true; },
  /** The design board's items and zoom (read only, for automated checks; not a host command). */
  boardItems: () => board.inspect(),
  captureBoard: async ({ id } = {}) => {
    try { await paintQueue; post({ type: 'captureBoard', id, data: await board.capture() }); }
    catch (error) { post({ type: 'captureBoard', id, error: error.message }); }
  },
  // One entry point for both hosts: {cmd, arg}.
  receive: (msg) => {
    try {
      const m = typeof msg === 'string' ? JSON.parse(msg) : msg;
      const allowed = ['setDesign', 'setView', 'capture', 'reset', 'pick', 'processImage', 'board', 'select', 'boardZoom', 'captureBoard', 'checkLayout', 'layoutFile', 'features'];
      if (m && allowed.includes(m.cmd)) Promise.resolve(window.viewer[m.cmd](m.arg)).catch((error) => post({ type: 'error', command: m.cmd, message: error.message }));
    } catch (error) { post({ type: 'error', message: error.message }); }
  },
};
addEventListener('message', (e) => {
  if (e.source === window.parent && e.origin === location.origin && typeof e.data === 'string') window.viewer.receive(e.data);
});

(async () => {
  await environmentReady;
  await applyDesign(design);
  reveal();
  setTimeout(() => (controls.autoRotate = !params.has('still')), 1600);
  frame();
  document.body.classList.add('ready');
  post({ type: 'ready' });
})().catch((error) => post({ type: 'error', message: error.message }));
