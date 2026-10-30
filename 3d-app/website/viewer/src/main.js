import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import gsap from 'gsap';
import { buildGarment, buildCollar, buildDrawstring, SPECS } from './garment.js';
import { buildLabel, paintLabel, mainColour } from './label.js';
import { KitPainter, knitNormalMap } from './texture.js';
import { createStudio } from './studio.js';
import { qualityTier, TIERS, stadiumEnvironment, dressFabric, fabricInk, hdrBackdrop } from './render-quality.js';
import { buildSocks } from './socks.js';
import { buildBballShorts } from './bballshorts.js';
import { buildSkirt } from './skirt.js';
import { SKIRT_LIGHT } from './skirtprint.js';
import { buildCap } from './cap.js';
import { buildBucketHat } from './bucket.js';
import { buildMannequin, mannequinMaterial, buildStand } from './mannequin.js';
import { hqWanted, loadHQ, hqJersey } from './hq.js';
import { createBoard } from './board.js';
import { processImage } from './imagetools.js';
import { zoneAt, partAt } from './zones.js';
import { colourFor } from './colourpick.js';
import { buildWingCollar, paintWingCollar } from './wingcollar.js';
import { buildHoodCords, ribNormalMap, tubeAlong } from './hoodie.js';
import { buildSnaps, varsityRibMap, quiltMap, finishMap, varsityColour } from './varsity.js';
import { readLayout, findPanels, confirmPanels, hemFold, joinLines, drawPockets, ROLE_NAMES } from './layout.js';
import { regionsFor, warpLayout, panelColour, panelSides, DRAWN, drawingSides, orderDrawing, lineColour, drawnCut, drawnSleeves, sleevedShape, unprojectPhoto } from './layout-warp.js';

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
// The render tier (render-quality.js): 'high' on computers, 'low' on phones and the apps, 'flat' = as before
// (?quality=flat, for checks). Q: the tier's settings, null when flat.
const QUALITY = qualityTier(params, renderer);
const Q = TIERS[QUALITY] ?? null;
document.body.dataset.quality = QUALITY;
// The tiers: Khronos PBR Neutral tone mapping, which keeps the print's colours true (ACES shifts and pales them); its
// exposure set so a print's lit front matches the design's colours.
if (Q) { renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.3; }
// The 3D look (2026-10-23). '2' = step 2 on top of the tiers: folds and drape, the display mannequin, fuller trims,
// the studio softbox. '1' = the tiers exactly as before step 2. The website sends ?look=2 only for a device that asked
// for the preview (?look=2 on any page, until ?look=1); the apps never send it. When the client approves, LOOK_DEFAULT
// becomes '2' and everyone gets step 2 (the one-line switch; then the next VIEWER_VERSION).
// 2026-10-26: the user approved the new look for everyone; ?look=1 = the old look.
const LOOK_DEFAULT = '2';
const LOOK2 = !!Q && (params.get('look') ?? LOOK_DEFAULT) === '2';
document.body.dataset.look = LOOK2 ? '2' : '1';
// The "High quality" jersey (hq.js), a professional garment model, only with ?hq=1 for now (the jersey alone).
const HQ = hqWanted(params);

const scene = new THREE.Scene();
scene.background = backdrop();
const pmrem = new THREE.PMREMGenerator(renderer);
// The tiers: the stadium's own light (floodlights, a warm key, cool rims) in every reflection and sheen.
scene.environment = pmrem.fromScene(Q ? stadiumEnvironment({ softbox: LOOK2 }) : new RoomEnvironment(), Q ? 0.03 : 0.04).texture;
scene.environmentIntensity = Q ? 1.3 : 0.3;

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
    if (Q) {
      // The tiers: its floodlights brighter than white, so they bloom.
      texture = hdrBackdrop(soft, Q.backdropScale);
    } else {
      texture = new THREE.CanvasTexture(soft);
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    scene.background = texture;
    coverBackground();
    resolve();
  }, undefined, () => resolve());
});

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);

const { podium, ringMat, outerRing, pool, shadow, mirror } = createStudio(scene, renderer, mobile, Q);
// Look 2, the showroom: the floodlights behind trace the kit's edges more strongly, and the kit sits in a deeper, wider
// soft contact shadow on the podium.
if (LOOK2) {
  scene.traverse((o) => { if (o.isDirectionalLight && o.position.z < 0) o.intensity *= 1.35; });
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), fade = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  fade.addColorStop(0, 'rgba(0,0,0,.9)'); fade.addColorStop(.55, 'rgba(0,0,0,.42)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade; g.fillRect(0, 0, 128, 128);
  shadow.material.map.dispose();
  shadow.material.map = new THREE.CanvasTexture(c);
  shadow.geometry.dispose();
  shadow.geometry = new THREE.PlaneGeometry(.8, .52);
}

// ---------- garment
/** Relief of the sewing (stitches, seams, hem edges) per garment shape, made once. */
const reliefs = new Map();
/** Adds the sewing relief on top of the fabric weave (both are normal maps, blended in the shader). */
function addRelief(target, painter) {
  // A garment cut like a drawing has its own (only the latest such is kept).
  // (The crew-neck jersey, FN6: its own, its neck sewn round.)
  const key = `${painter.cut ? `cut:${painter.cut}:` : ''}${painter.kind}${painter.crewNeck ? ':crew' : ''}:${painter.canvas.width}${LOOK2 ? ':pucker' : ''}`;
  if (painter.cut && !reliefs.has(key)) {
    for (const [k, old] of reliefs) if (k.startsWith('cut:')) { old.dispose(); reliefs.delete(k); }
  }
  if (!reliefs.has(key)) {
    // Look 2: the seams pucker a little more (texture.js), as sewn polyester does.
    const relief = new THREE.CanvasTexture(painter.reliefMap(LOOK2 ? { pucker: true } : undefined));
    relief.anisotropy = renderer.capabilities.getMaxAnisotropy();
    reliefs.set(key, relief);
  }
  const relief = reliefs.get(key);
  // The skirt's own light (skirtprint.js SKIRT_LIGHT: its black neutral and even, its panels clean), on the tiers.
  // (FN1 2026-10-30: the bucket hat too: its black neutral, as its pictures', not navy from the stage's cool light.)
  const skirtLight = (painter.kind === 'skirt' || painter.kind === 'bucket-hat') && !!Q;
  target.customProgramCacheKey = () => (LOOK2 ? 'sewing-relief-2' : 'sewing-relief') + (skirtLight ? '-skirt' : '');
  target.onBeforeCompile = (shader) => {
    if (skirtLight) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `${SKIRT_LIGHT}\n#include <opaque_fragment>`);
    shader.uniforms.reliefMap = { value: relief };
    // Look 2: the stitches and seams stand out a little more (the relief's slopes scaled up).
    const slopes = LOOK2 ? 'relief.xy * 1.7' : 'relief.xy';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normalmap_pars_fragment>', '#include <normalmap_pars_fragment>\nuniform sampler2D reliefMap;')
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(
        'mapN.xy *= normalScale;',
        `mapN.xy *= normalScale;\n\tvec3 relief = texture2D( reliefMap, vMapUv ).xyz * 2.0 - 1.0;\n\tmapN = normalize( vec3( mapN.xy + ${slopes}, mapN.z * relief.z ) );`,
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
  // The American football jersey (tasks.md 9.113): shoulder-pad cut, cap sleeves (garment.js SPECS.nfljersey).
  nfljersey: ['nfljersey'],
  // The compression top (NFL base layer): skin-tight long sleeves (garment.js SPECS.compression).
  compression: ['compression'],
  tee: ['tee'],
  // The basketball shooting shirt: a loose raglan V-neck warm-up tee (shootingshirt.js).
  'shooting-shirt': ['shooting-shirt'],
  raglan: ['raglan'],
  polo: ['polo'],
  pocketpolo: ['pocketpolo'],
  hoodie: ['hoodie'],
  ziphoodie: ['ziphoodie'],
  trackjacket: ['trackjacket'],
  varsity: ['varsity'],
  singlet: ['singlet'],
  // The netball dress (tasks.md 9.126): a women's fitted dress on the female figure (figure.js).
  'netball-dress': ['netball-dress'],
  // Knee-high team socks (garment 3): their own builder (socks.js) and print (sockprint.js).
  socks: ['socks'],
  // The basketball shorts: their own cut (bballshorts.js) and print (bballprint.js).
  bballshorts: ['bballshorts'],
  // The netball / tennis skirt and hockey skort (COMING SOON 10): its own builder (skirt.js) and print (skirtprint.js).
  skirt: ['skirt'],
  // The team cap (garment 4): its own builder (cap.js) and print (capprint.js).
  cap: ['cap'],
  // The bucket hat (garment 5): its own builder (bucket.js) and print (hatprint.js).
  'bucket-hat': ['bucket-hat'],
  shorts: ['shorts'],
  fullkit: ['shorts', 'jersey'],
};

const HEX6 = /^#[0-9a-f]{6}$/i;
function buildKit(kind) {
  // A print layout brings its own parts (a raglan top, shorts or both); the garment chosen shows its top, its
  // shorts or the full kit.
  let list = PARTS[PARTS[kind] ? kind : 'jersey'];
  // The basketball shorts (the Basketball shorts tile, FN3 2026-10-30): the shorts with the royal blue band across their
  // side panels (design.zoneColors.bballBand) are cut long and loose as that picture, with its own print (bballshorts.js).
  if (kind === 'shorts' && !layout && /^#[0-9a-f]{6}$/i.test(design.zoneColors?.bballBand ?? '')) list = PARTS.bballshorts;
  if (layout && kind !== 'socks' && kind !== 'skirt' && kind !== 'cap' && kind !== 'bucket-hat') {
    // A garment drawing is of one top (the one it was checked as).
    const own = layout.drawing ? [layout.garment] : layoutParts(layout.panels);
    const pick = kind === 'fullkit' ? own : kind === 'shorts' || kind === 'bballshorts' ? own.filter((p) => p === 'shorts') : own.filter((p) => p !== 'shorts');
    list = pick.length ? pick : own;
  }
  // A layout's shorts are training shorts (cut like its leg pieces), so the key says which; a drawing's top is the
  // garment itself, cut like the drawing when it can be (drawnCut).
  const cut = layout?.drawing ? layout.cut : null;
  // The track jacket's style (design.trackStyle: its stand-up collar or a hood) is part of its cut.
  const trackHood = design.trackStyle === 'hood';
  // The Full kit picture (FN6 2026-10-30): its jersey with a round crew neck, shown by its look (design.zoneColors.crewNeck).
  const crewKit = !layout && list.includes('jersey') && HEX6.test(design.zoneColors?.crewNeck ?? '');
  // The polo pictures (FN6 2026-10-30): a black stand-up mock collar over a quarter zip, shown by its look
  // (design.zoneColors.quarterZip, the zip's colour).
  const zipPolo = !layout && /^#[0-9a-f]{6}$/i.test(design.zoneColors?.quarterZip ?? '');
  // The Rugby League socks (FN7 2026-10-30, user: a real split toe, as the client's picture): the socks with the toe
  // line (design.zoneColors.sockToeLine) have the big toe in its own pocket (socks.js split).
  const splitToe = list.includes('socks') && HEX6.test(design.zoneColors?.sockToeLine ?? '');
  const key = (splitToe ? 'split:' : '') + (zipPolo && (list.includes('polo') || list.includes('pocketpolo')) ? 'zip:' : '') + (layout && !layout.drawing ? 'layout:' : '') + list.join('+') + (cut ? `:cut:${layout.key}` : '') + (list.includes('trackjacket') && trackHood ? ':hood' : '') + (crewKit ? ':crew' : '');
  if (key === currentKind) return;
  currentKind = key;
  const geometries = new Set();
  // (The mannequin's finishes are kept: made once, so their shaders are not compiled again on every change.)
  kit.traverse((o) => { if (o.isMesh) { geometries.add(o.geometry); [o.material].flat().forEach((m) => { if (m.userData.keep) return; m.map?.dispose(); if (m.normalMap?.userData.own) m.normalMap.dispose(); m.dispose(); }); } });
  geometries.forEach((geometry) => geometry.dispose());
  parts.forEach((part) => { part.texture.dispose(); part.varsity?.finish.dispose(); });
  kit.clear();
  parts = [];
  let base = 0;
  for (const partKind of list) {
    const own = cut && partKind === layout.garment ? cut : null;
    // A layout's tee over its shorts (shown bigger, below) hangs a little fuller at the hem, over their waistband.
    const over = partKind === 'raglan' && layout && list.includes('shorts') ? { ...SPECS.raglan, hemFlare: 0.09 } : null;
    // (The crew-neck jersey: the tee's neck on the jersey's raglan body; its fabric lies smoother, fewer creases and less
    // relief, as the Full kit picture's matt knit.)
    const style = (partKind === 'polo' || partKind === 'pocketpolo') && zipPolo ? { ...SPECS[partKind], rim: { ...SPECS[partKind].rim, width: 0.03, stand: 0.021 }, crease: 0.45, relief: 0.6 } : partKind === 'trackjacket' && trackHood ? SPECS.trackjacketHood : partKind === 'jersey' && crewKit ? { ...SPECS.jersey, half: SPECS.tee.half, neck: SPECS.tee.neck, rim: SPECS.tee.rim, crew: true, crease: 0.45, relief: 0.6 } : null;
    // Look 2: the drape and wrinkles of worn cloth (otherwise the garment as before).
    const garment = partKind === 'socks' ? buildSocks({ detail: LOOK2, split: splitToe }) : partKind === 'bballshorts' ? buildBballShorts({ detail: LOOK2 }) : partKind === 'skirt' ? buildSkirt({ detail: LOOK2 }) : partKind === 'cap' ? buildCap({ detail: LOOK2 }) : partKind === 'bucket-hat' ? buildBucketHat({ detail: LOOK2 }) : buildGarment(partKind === 'shorts' && layout ? 'trainingShorts' : partKind, { spec: own ?? over ?? style, detail: LOOK2 });
    const painter = new KitPainter(garment.frame, garment.outline, printSize(partKind), partKind);
    if (own) painter.cut = layout.key;
    if (partKind === 'jersey' && crewKit) painter.crewNeck = true;
    // The finished edges (the hem follows a leg's side split), the waistband's width and the places a print
    // layout's pieces are matched to.
    painter.edgeMask = garment.edges;
    painter.rimWidth = garment.rimWidth;
    painter.points = garment.points;
    // The fabric as worn: a garment drawing keeps its shapes on it (layout-warp.js).
    painter.surface = garment.surface;
    // ?hq=1: the jersey's fabric is the HQ model, printed from this jersey's atlas (hq.js).
    let hq = null;
    if (HQ && partKind === 'jersey' && window.HQ_JERSEY) {
      // (A cut it cannot be laid onto keeps our own jersey.)
      try { hq = hqJersey(garment, own ?? SPECS.jersey); } catch (error) { console.warn('HQ jersey:', error); }
    }
    const shape = hq?.geometry ?? garment.geometry;
    const texture = new THREE.CanvasTexture(painter.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const partMaterial = material.clone();
    partMaterial.map = texture;
    // The netball dress (ND1): its print lifted a little by its own light, so its blues read as bright as the client's
    // evenly lit picture even on the side away from the studio's key light (its black stays black).
    if (garment.kind === 'netball-dress') {
      partMaterial.emissiveMap = texture;
      partMaterial.emissive.setRGB(1, 1, 1);
      partMaterial.emissiveIntensity = 0.24;
      // (ND2: almost no grey sheen on it, so its strips stay saturated from the side too.)
      partMaterial.sheen = 0.08;
    }
    // The compression top (FM print 2026-10-30): its print lifted by its own light too, so its azure panels, piping and
    // the chest logo read as deep and as bright as on the client's evenly lit picture on both sides (its black stays a
    // neutral black, 19-28 as the picture's).
    if (partKind === 'compression') {
      partMaterial.emissiveMap = texture;
      partMaterial.emissive.setRGB(1, 1, 1);
      partMaterial.emissiveIntensity = 0.45;
    }
    addRelief(partMaterial, painter);
    const group = new THREE.Group();
    // The inside of the fabric, seen through the neck, hem and cuffs: the garment's own colour in shade (paintAll).
    const inside = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.95, vertexColors: true, side: THREE.BackSide });
    group.add(new THREE.Mesh(shape, inside));
    // A part's glow (a tap, the part chosen in the host's part panel, a drag over it): the same surface, lit through
    // the part's mask (KitPainter.partMask), drawn over the fabric; hidden until used, never picked or captured.
    const glow = new THREE.Mesh(shape, new THREE.MeshBasicMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    glow.userData.glow = true;
    glow.visible = false;
    glow.renderOrder = 5;
    const fabric = new THREE.Mesh(shape, partMaterial);
    fabric.userData.part = parts.length;
    fabric.castShadow = true;
    fabric.receiveShadow = true;
    group.add(fabric);
    // The pocket polo's chest pocket: its own piece of the same printed fabric, standing off the front.
    if (garment.pocket) {
      const pocket = new THREE.Mesh(garment.pocket, partMaterial);
      pocket.userData.part = parts.length;
      pocket.castShadow = true;
      pocket.receiveShadow = true;
      group.add(pocket);
    }
    // Hoodies: heavy brushed fleece (matt, a soft sheen, hardly any knit showing), the lined hood, the kangaroo pocket,
    // rib cuffs and waistband, the zip and the hood's drawstring (hoodie.js).
    let hoodie = null;
    if (garment.hoodie) {
      const h = garment.hoodie;
      partMaterial.roughness = 0.88;
      partMaterial.sheen = 0.3;
      partMaterial.sheenRoughness = 0.8;
      partMaterial.normalScale.set(0.14, 0.14);
      const add = (mesh, pick = false) => { if (pick) mesh.userData.part = parts.length; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh; };
      // The hood: printed outside (its atlas piece), its lining inside.
      const liningFront = new THREE.MeshStandardMaterial({ roughness: 0.92, vertexColors: true });
      const liningBack = liningFront.clone();
      liningBack.side = THREE.BackSide;
      const outerBack = partMaterial.clone();
      outerBack.side = THREE.BackSide;
      addRelief(outerBack, painter);
      // Stand and roll: lining towards the neck, outer fabric outside; the fall: outer fabric outside, lining under.
      add(new THREE.Mesh(h.hood.geometry, [liningFront, partMaterial]), true);
      add(new THREE.Mesh(h.hood.geometry, [outerBack, liningBack]), true);
      const channel = add(new THREE.Mesh(tubeAlong(h.hood.channel, 0.0042), new THREE.MeshStandardMaterial({ roughness: 0.9 })));
      add(new THREE.Mesh(h.pocket, partMaterial), true);
      ribMap ??= ribNormalMap();
      // (FN5 2026-10-30: the body fabric's cool sheen, so the black rib stays a neutral black under the warm key light, as
      // the pictures: it showed brown.)
      const rib = new THREE.MeshPhysicalMaterial({ roughness: 0.92, sheen: 0.2, sheenRoughness: 0.8, sheenColor: 0x9fb4c6, side: THREE.DoubleSide, normalMap: ribMap, normalScale: new THREE.Vector2(0.85, 0.85) });
      h.ribs.forEach((g) => add(new THREE.Mesh(g, rib)));
      if (h.zip) group.add(h.zip.group);
      const cords = buildHoodCords({ sampleFront: h.sampleFront }, h.hood.eyelets);
      group.add(cords.group);
      painter.pieces = [{ back: true, outline: h.hood.piece }];
      hoodie = { lining: [liningFront, liningBack], channel: channel.material, rib, zip: h.zip, cords };
    }
    // The track jacket: smooth polyester (a little gloss, a fine knit), its stand-up collar (printed outside, lined) or
    // the zip hoodie's hood and drawstring, rib cuffs and hem band, the front zip and its garage, the pocket zips.
    let track = null;
    if (garment.track) {
      const t = garment.track;
      partMaterial.roughness = 0.55;
      partMaterial.sheen = 0.5;
      partMaterial.sheenRoughness = 0.5;
      partMaterial.normalScale.set(0.2, 0.2);
      const add = (mesh, pick = false) => { if (pick) mesh.userData.part = parts.length; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh; };
      const liningFront = new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true });
      const liningBack = liningFront.clone();
      liningBack.side = THREE.BackSide;
      let channel = null, cords = null, garage = null;
      if (t.collar) {
        add(new THREE.Mesh(t.collar.geometry, [partMaterial, liningFront]), true);
        add(new THREE.Mesh(t.collar.geometry, [liningBack, liningBack]));
        painter.pieces = [{ back: true, outline: t.collar.piece }];
      } else {
        const outerBack = partMaterial.clone();
        outerBack.side = THREE.BackSide;
        addRelief(outerBack, painter);
        add(new THREE.Mesh(t.hood.geometry, [liningFront, partMaterial]), true);
        add(new THREE.Mesh(t.hood.geometry, [outerBack, liningBack]), true);
        channel = add(new THREE.Mesh(tubeAlong(t.hood.channel, 0.0042), new THREE.MeshStandardMaterial({ roughness: 0.75 }))).material;
        cords = buildHoodCords({ sampleFront: t.sampleFront }, t.hood.eyelets);
        group.add(cords.group);
        painter.pieces = [{ back: true, outline: t.hood.piece }];
      }
      painter.trackHood = !t.collar;
      ribMap ??= ribNormalMap();
      const rib = new THREE.MeshPhysicalMaterial({ roughness: 0.85, sheen: 0.3, sheenRoughness: 0.7, side: THREE.DoubleSide, normalMap: ribMap, normalScale: new THREE.Vector2(0.7, 0.7) });
      t.ribs.forEach((g) => add(new THREE.Mesh(g, rib)));
      group.add(t.zip.group);
      t.pocketZips.forEach((z) => group.add(z.group));
      if (t.garage) {
        garage = add(new THREE.Mesh(t.garage.geometry, new THREE.MeshPhysicalMaterial({ roughness: 0.55, sheen: 0.5, sheenRoughness: 0.5 })));
        garage.position.copy(t.garage.position);
        garage.quaternion.copy(t.garage.quaternion);
        garage = garage.material;
      }
      track = { lining: [liningFront, liningBack], rib, zips: [t.zip, ...t.pocketZips], garage, channel, cords };
    }
    // The varsity jacket (varsity.js): a wool body and leather sleeves (one fabric, its finish map making the sleeves
    // and welts smoother, with a clear coat), the placket and welt pockets, rib collar, cuffs and waistband printed
    // from their own atlas pieces (with their stripes), the snaps and the quilted lining inside.
    let varsity = null;
    if (garment.varsity) {
      const v = garment.varsity;
      const finish = finishMap(painter);
      partMaterial.roughness = 1;
      partMaterial.roughnessMap = finish;
      partMaterial.clearcoat = 0.4;
      partMaterial.clearcoatRoughness = 0.38;
      partMaterial.clearcoatMap = finish;
      partMaterial.sheen = 0.3;
      partMaterial.sheenRoughness = 0.75;
      partMaterial.normalScale.set(0.12, 0.12);
      const add = (mesh) => { mesh.userData.part = parts.length; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh; };
      add(new THREE.Mesh(v.placket, partMaterial));
      v.welts.forEach((w) => add(new THREE.Mesh(w, partMaterial)));
      varsityRib ??= varsityRibMap();
      const rib = new THREE.MeshPhysicalMaterial({ map: texture, roughness: 0.92, sheen: 0.2, sheenRoughness: 0.8, side: THREE.DoubleSide, normalMap: varsityRib, normalScale: new THREE.Vector2(0.85, 0.85) });
      v.ribs.forEach((g) => add(new THREE.Mesh(g, rib)));
      const snaps = new THREE.MeshStandardMaterial({ roughness: 0.26, metalness: 0.55 });
      group.add(buildSnaps(v.snaps, snaps));
      painter.pieces = v.pieces;
      painter.ribPieces = v.pieces;
      inside.map = quiltMap();
      inside.needsUpdate = true;
      varsity = { rib, snaps, finish };
    }
    // Collar rib or waistband along the top opening (a hoodie's neck is under its hood).
    const rim = new THREE.Mesh(
      // (A flat band of the body's fabric, the compression top's, lies almost flat: a thin fold, no rib's fullness.)
      buildCollar(garment.neck, partKind === 'shorts' || !!garment.bball, garment.rimWidth, garment.rimFlat ? 0.4 : LOOK2 ? 1.6 : 1, garment.rimStand, garment.rimOne),
      new THREE.MeshPhysicalMaterial({ roughness: 0.9, reflectivity: .2, sheen: 0.15, side: THREE.DoubleSide, sheenColor: new THREE.Color(0x7092a4), normalMap: knit, normalScale: new THREE.Vector2(.17, .17) }),
    );
    group.add(rim);
    // Look 2: the rib's soft sheen catches the studio's light along the collar (or waistband), and its knit shows as
    // fine ribs across the band (about 3 mm apart round the neck).
    if (garment.rimFlat) Object.assign(rim.material, { roughness: 0.84, sheen: 0.28, sheenRoughness: 0.7 });
    else if (LOOK2) {
      Object.assign(rim.material, { roughness: 0.78, sheen: 0.38, sheenRoughness: 0.5 });
      ribMap ??= ribNormalMap();
      const ribs = ribMap.clone();
      ribs.userData.own = true;   // this collar's own copy, freed with the kit
      ribs.repeat.set(partKind === 'shorts' || garment.bball ? 260 : 150, 1);
      ribs.needsUpdate = true;
      rim.material.normalMap = ribs;
      rim.material.normalScale.set(0.75, 0.75);
    }
    // (The netball dress's scoop neck is bound and rolled as its armholes are: no collar rib.)
    rim.visible = !hoodie && !track && !varsity && !garment.socks && !garment.skirt && !garment.cap && !garment.hat && garment.kind !== 'netball-dress';
    // The HQ jersey's own collar piece, in the collar rib's material.
    if (hq?.collar) { rim.geometry.dispose(); rim.geometry = hq.collar; }
    // Tops: the 3DEEZI neck label inside the back neck (label.js).
    // (No size label in the shooting shirt's neck: its picture has none; FN5, tester DT8.)
    const label = partKind === 'shorts' || partKind === 'shooting-shirt' || garment.socks || garment.bball || garment.skirt || garment.cap || garment.hat ? null : buildLabel(garment);
    // Shorts: the drawstring out of the front of the waistband.
    const cord = garment.drawstring ? buildDrawstring(garment) : null;
    if (cord) group.add(cord.group);
    // The cap's eyelets: metal grommets round its air holes (cap.js).
    if (garment.trims) group.add(garment.trims);
    // A layout's training shorts are shown longer than their flat pattern (as on the client's mock-ups), and as much
    // wider and deeper: the same proportions, only bigger.
    // The cap is shown a little larger than life (cap.js CAP_DISPLAY), so it fills the stage as the others do.
    const stretch = partKind === 'shorts' && layout ? 1.12 : garment.display ?? 1;
    group.scale.setScalar(stretch);
    // In a full kit the jersey sits over the shorts' waistband.
    // Look 2: a garment shown on a form with legs (the netball dress) stands a little higher (garment.js lift).
    group.position.y = base + (LOOK2 ? garment.lift : 0);
    base += partKind === 'shorts' ? garment.frame.maxY * stretch - 0.06 : 0;
    kit.add(group);
    group.add(glow);
    parts.push({ painter, texture, rim, cord, garment, material: partMaterial, inside, label, hoodie, track, varsity, hq, glow });
  }
  dressParts(true);
  frameKit();
  // The labels after framing (the camera frames the kit as it is without them).
  parts.forEach((part) => { if (part.label) part.rim.parent.add(part.label); });
  // The football / hockey jersey's wing collar (wingcollar.js), shown by its look (design.zoneColors.wingCollar).
  parts.forEach((part) => { if (part.painter.kind === 'jersey' && !layout && !part.hq) { part.wing = buildWingCollar(part.garment.neck); part.rim.parent.add(part.wing.group); } });
  // Look 2: the mannequin under the kit and its stand into the podium, also after framing (never picked).
  if (LOOK2) dressMannequin(list);
}

/**
 * The tiers: each part's fabric woven into its printed materials (render-quality.js): the design's fabric type
 * (design.fabric: Mesh, Pro or Eco), else the garment's own (mesh, piqué, fleece...). On a new kit (`built`), and again
 * whenever the fabric type changes (only the material: the print, names and numbers stay exactly where they are).
 */
function dressParts(built) {
  if (!Q) return;
  for (const part of parts) {
    // (FN4 2026-10-30: the Rugby jersey and kit tile pictures' smooth matt fabric with their look, design.zoneColors.sweep,
    // while the fabric type is the Standard one.)
    // (And the shorts pictures' and Rugby League picture's: their looks set zoneColors.cordTips.)
    // (FN6: and the Full kit picture's, with its shorts' blades, design.zoneColors.kitBlade; and the polo pictures', zoneColors.quarterZip.)
    const smooth = (!design.fabric || design.fabric === 'Standard') && (/^#[0-9a-f]{6}$/i.test(design.zoneColors?.sweep ?? '') || /^#[0-9a-f]{6}$/i.test(design.zoneColors?.cordTips ?? '') || /^#[0-9a-f]{6}$/i.test(design.zoneColors?.kitBlade ?? '') || /^#[0-9a-f]{6}$/i.test(design.zoneColors?.flow ?? '') || /^#[0-9a-f]{6}$/i.test(design.zoneColors?.quarterZip ?? '') || /^#[0-9a-f]{6}$/i.test(design.zoneColors?.bballBand ?? ''));
    const dressed = dressFabric(part.rim.parent, part, knit, renderer.capabilities.getMaxAnisotropy(), smooth ? 'Smooth' : design.fabric);
    // Look 2: the knit's relief a quarter deeper, so the mesh and its sheen read up close.
    if (LOOK2 && (built || dressed)) part.material.normalScale.multiplyScalar(1.25);
  }
}

/** The mannequin under each part (mannequin.js), and one stand from the lowest of them into the podium. */
/**
 * The print atlas's size: 4096 on computers; on phones 3072 when the graphics allow it (sharper lines and lettering;
 * painted once, so frame time is the same), else 2048 as before.
 */
function printSize(kind) {
  if (!mobile) return 4096;
  // The compression top on a computer's browser (the website sends ?mobile too): the full size, so its chest logo is as
  // crisp as on the client's picture (FM print 2026-10-30; phones and the apps keep the smaller print).
  if (kind === 'compression' && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) && renderer.capabilities.maxTextureSize >= 4096 && (navigator.deviceMemory ?? 4) >= 8) return 4096;
  return renderer.capabilities.maxTextureSize >= 4096 && (navigator.deviceMemory ?? 4) >= 3 ? 3072 : 2048;
}

let mannequinMat = null;
function dressMannequin(list) {
  mannequinMat ??= Object.assign(mannequinMaterial(), { userData: { keep: true } });
  let low = Infinity, foot = null;
  for (const part of parts) {
    const group = part.rim.parent;
    // The HQ jersey: the body it was made on (hq.js), else our form made for the garment.
    const form = part.garment.form ? part.garment.form(mannequinMat) : part.hq?.avatar ? new THREE.Group().add(new THREE.Mesh(part.hq.avatar, mannequinMat))
      : buildMannequin(part.garment, mannequinMat, { over: list.includes('shorts') && part.painter.kind !== 'shorts' });
    if (!form) continue;
    group.add(form);
    const s = group.scale.y;
    form.children.forEach((m) => { m.geometry.computeBoundingBox(); low = Math.min(low, group.position.y + s * m.geometry.boundingBox.min.y); });
    // Shorts (alone or in a full kit): the stand goes up into the wearer's left thigh, as on a shop's leg form.
    const tip = form.userData.feet?.find((p) => p.x > 0);
    if (tip) foot = { x: tip.x * s, y: group.position.y + s * tip.y, z: tip.z * s };
    // Its points are no longer needed (the garment object lives as long as the kit).
    part.garment.body = null;
  }
  // The podium's top is at y -0.0675 (studio.js); the rod goes a little into it, so the kit's gentle bob never lifts it off.
  const stand = foot ? buildStand(foot.y + 0.012, -0.075, foot.x, foot.z) : Number.isFinite(low) ? buildStand(low + 0.012, -0.075) : null;
  if (stand) kit.add(stand);
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

/** The rib knit's normal map (hoodies' cuffs and waistband), made once. */
let ribMap = null;
const HEX = /^#[0-9a-f]{6}$/i;
/**
 * A hoodie's colour zones (design.zoneColors): the hood lining, the rib cuffs and waistband, the zip and the drawstring
 * (the hood's outer and the pocket are printed: texture.js). Unset, a preset colours them sensibly: the lining and zip
 * in the kit's secondary colour, the rib in the body's colour (a little deeper, as rib looks), the cord as the lining.
 */
function paintHoodie(part) {
  const own = (key, fallback) => (HEX.test(design.zoneColors?.[key] ?? '') ? design.zoneColors[key] : fallback);
  const h = part.hoodie, lining = own('lining', design.secondary);
  h.lining.forEach((m) => m.color.set(lining));
  h.channel.color.set(own('hood', design.main));
  h.rib.color.set(own('rib', design.main)).multiplyScalar(0.9);
  // (FN5 2026-10-30, the client's hoodie picture: black cords as the rib, their tips in the lining's colour.)
  h.cords.cord.color.set(own('rib', design.main)).multiplyScalar(0.8);
  h.cords.metal.color.set(lining);
  if (h.zip) {
    const zip = own('zip', design.secondary);
    h.zip.tape.color.set(zip).multiplyScalar(0.85);
    h.zip.teeth.color.set(zip);
  }
}

/**
 * The track jacket's colour areas on its 3D parts (design.zoneColors): the collar's (or hood's) lining a little deeper
 * than the collar, the rib cuffs and hem band ('cuffs', default the body's colour, a little deeper), the zips ('zip',
 * default Secondary), the zip garage as the collar and the hood's drawstring in Secondary. The body, panels, stripe and
 * the collar's outside are printed (texture.js paintTrack).
 */
function paintTrack(part) {
  const own = (key, fallback) => (HEX.test(design.zoneColors?.[key] ?? '') ? design.zoneColors[key] : fallback);
  const t = part.track, body = own('body', design.main), collar = own('collar', body);
  t.lining.forEach((m) => m.color.set(collar).multiplyScalar(0.85));
  t.rib.color.set(own('cuffs', body)).multiplyScalar(0.9);
  const zip = own('zip', design.secondary);
  for (const z of t.zips) { z.tape.color.set(zip).multiplyScalar(0.85); z.teeth.color.set(zip); }
  if (t.garage) t.garage.color.set(collar);
  if (t.channel) t.channel.color.set(collar);
  if (t.cords) t.cords.cord.color.set(design.secondary).multiplyScalar(0.95);
}

/** The varsity's rib normal map (read from uv1), made once. */
let varsityRib = null;
/**
 * The varsity jacket's colour zones on its own 3D parts (design.zoneColors): the snaps and the quilted lining; its
 * body, sleeves, rib, rib stripes and welt trim are printed (varsity.js paintVarsity).
 */
function paintVarsityPart(part) {
  const v = part.varsity;
  v.rib.color.setScalar(0.94);
  v.snaps.color.set(varsityColour(design, 'snaps'));
  part.inside.color.set(varsityColour(design, 'lining')).multiplyScalar(0.85);
}

/** Repaints every part's print from the current design. */
/**
 * A stripe along the collar rib's inner edge (the V's opening: the top of its outside face and the fold), in `colour`;
 * the rest keeps the rib's own colour. null: the rib all one colour, as before.
 */
// `to`: how far round the band it reaches (the polo's piping runs on over the top and down the inside: FN6).
function collarStripe(rim, colour, to = 0.62) {
  const m = rim.material, geo = rim.geometry, uv = geo.getAttribute('uv');
  if (!colour) { if (m.vertexColors) { m.vertexColors = false; m.needsUpdate = true; } return; }
  const base = m.color.clone(), own = new THREE.Color(colour), col = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) { const v = uv.getY(i), c = v > (to > 1 ? 0.4 : 0.34) && v < to ? own : base; col.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.color.set(0xffffff);
  if (!m.vertexColors) { m.vertexColors = true; m.needsUpdate = true; }
}

async function paintAll() {
  await prepareLayout();
  buildKit(design.garment);
  // A new fabric type on the same kit.
  dressParts(false);
  warpParts();
  await document.fonts.load('700 100px Rajdhani').catch(() => {});
  // The football jersey's square block numerals (texture.js NFL_FONT).
  // (Also a text object's own font: texture.js LAYER_FONTS.)
  if (design.garment === 'nfljersey' || (design.layers ?? []).some((l) => l?.font === 'JerseyBlock')) await document.fonts.load('700 100px JerseyBlock').catch(() => {});
  for (const part of parts) {
    await part.painter.paint(design);
    part.texture.needsUpdate = true;
    // (The football jersey: its print solid over the mesh, render-quality.js.)
    if (Q) fabricInk(part, layout ? null : design.main);
    const ribOwn = part.painter.partStyle(design, part.painter.partName === 'shorts' ? 'waistband' : 'collar')?.own;
    // (The compression top's crew neck: the body's colour.)
    part.rim.material.color.set(layout && part.layoutRim ? part.layoutRim : ribOwn ?? (part.painter.kind === 'compression' ? design.main : design[part.garment?.rimColour ?? 'secondary']));
    // The football jersey's collar: a stripe of its own along the V's inner edge (design.zoneColors.collarStripe).
    // (The polo pictures' mock collar: a thin piping along its top edge, design.zoneColors.collarPiping: FN6.)
    const nfl = part.painter.kind === 'nfljersey', piping = !layout && !nfl && /^#[0-9a-f]{6}$/i.test(design.zoneColors?.collarPiping ?? '') ? design.zoneColors.collarPiping : null;
    const stripe = piping ?? (nfl && !layout && /^#[0-9a-f]{6}$/i.test(design.zoneColors?.collarStripe ?? '') ? design.zoneColors.collarStripe : null);
    collarStripe(part.rim, stripe, piping ? 1.01 : 0.62);
    paintWingCollar(part.wing, design);
    // The inside: the print's (or the kit's) main colour, a little darker for shade; the label shows the kit's size.
    // The football jersey's wide sleeves show their inside from below: kept in shade (darker, little reflected light).
    part.inside.color.set(layout ? part.layoutInside ?? part.painter.layoutFill ?? design.main : design.main).multiplyScalar(nfl ? 0.45 : 0.72);
    part.inside.envMapIntensity = nfl ? 0.3 : 1;
    // (The compression top: a black label with the cyan "3", as its picture.)
    if (part.label) paintLabel(part.label, design.size || 'L', part.painter.kind === 'compression' ? 'mark' : 'word');
    if (part.hoodie) paintHoodie(part);
    if (part.track) paintTrack(part);
    if (part.varsity) paintVarsityPart(part);
    // The drawstring: the cord darker than the waistband it comes out of, eyelets and tips in the trim colour.
    if (part.cord) {
      part.cord.cord.color.set(layout && part.layoutRim ? part.layoutRim : design.main).multiplyScalar(0.82);
      // (A tile's own colour for the eyelets and tips, design.zoneColors.cordTips: the Rugby League kit's black, RF1.)
      const tips = /^#[0-9a-f]{6}$/i.test(design.zoneColors?.cordTips ?? '') ? design.zoneColors.cordTips : design.accent;
      part.cord.metal.color.set(layout && part.layoutAccent ? part.layoutAccent : tips);
      // (FN6: the Full kit picture's shorts show no drawstring: hidden with its blades, design.zoneColors.kitBlade.)
      part.cord.group.visible = !!layout || !HEX6.test(design.zoneColors?.kitBlade ?? '');
    }
  }
  ringMat.color.set(design.secondary).multiplyScalar(4);
  pool.material.color.set(design.secondary);
  await board.refresh();
  // Not while the user types or slides in the bar (the host's echo would take the focus away).
  // The bar is built once per selection (a repaint only moves the outline), so typing and sliding are never cut off.
  if (selected) { outlineSelected(); if (barPending && !dragObj && !bar.contains(document.activeElement)) { barPending = false; drawBar(); } }
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
  const read = await readLayout(String(src ?? ''), { long });
  let image = read.image;
  const found = findPanels(image, read.labels, { drawing });
  if (!found.length) throw new Error(drawing ? 'No garment was found in this picture: it needs the garment on a plain background.' : 'No garment panels were found in this file.');
  if (drawing) orderDrawing(found);
  // A photo mock-up: its garments laid flat (their sides are foreshortened in the photo, the garment a little turned).
  if (drawing && found.plain === false) image = unprojectPhoto(image, found);
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
const DRAWN_NAMES = { singlet: 'Singlet', 'netball-dress': 'Netball dress', jersey: 'Jersey', tee: 'Training Tee', polo: 'Polo', pocketpolo: 'Polo with pocket', nfljersey: 'Football jersey', 'shooting-shirt': 'Shooting shirt' };
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
    // A jersey, tee or polo takes the drawing's sleeve length.
    const cut = !front ? null : garment === 'singlet' ? drawnCut(front, SPECS.singlet) : DRAWN[garment]?.CT ? drawnSleeves(front, garment, SPECS[garment]) : null;
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
    if (part.painter.layoutBase || part.garment.socks || part.garment.skirt || part.garment.cap || part.garment.hat) continue;
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
    // The inside's colour: the print's commonest colour (label.js).
    part.layoutInside = main ? mainColour(layout.image, main) : null;
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
async function checkLayout({ id, src, name = 'Print layout', asset = null, drawing = false, garment = null, known = false } = {}) {
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
      // A picture from the host's own AI (`known`: task 9.116) with no garment shape to read: said at once, with no
      // check screen that could only be cancelled (the host keeps the design's colours, crest and lettering).
      if (known && !usable.some(Boolean)) {
        post({ type: 'modal', open: false });
        throw new Error('its garment shapes could not be read');
      }
      file.found.forEach((p, i) => { if (!usable[i]) p.role = 'none'; });
      const big = Math.max(0, ...file.found.filter((_, i) => usable[i]).map((p) => (p.x1 - p.x0) * (p.y1 - p.y0)));
      const many = file.found.filter((p, i) => usable[i] && (p.x1 - p.x0) * (p.y1 - p.y0) > 0.5 * big).length > 2;
      const named = file.found.filter((p) => p.role === 'front' || p.role === 'back').length;
      // The garment it is: the one asked for when the host knows it (`known`: a 3DEEZI TEAM request names it), else from
      // its shape: sleeves make it a jersey, tee or polo (the one asked for, else a jersey). The person can still change it.
      const main = file.found.find((p) => p.role === 'front') ?? file.found.find((p) => p.role === 'back');
      const sleeved = main ? sleevedShape(main.outline) : false;
      const guess = known && Object.hasOwn(DRAWN, garment) ? garment : sleeved ? (['jersey', 'nfljersey', 'shooting-shirt', 'tee', 'polo', 'pocketpolo'].includes(garment) ? garment : ['jersey', 'nfljersey', 'shooting-shirt', 'tee', 'polo', 'pocketpolo'].includes(design.garment) ? design.garment : 'jersey') : [garment, design.garment].includes('netball-dress') ? 'netball-dress' : 'singlet';
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
  if (onBoard) { const zone = zoneAt(onBoard.kind, onBoard.x, onBoard.y, onBoard.side); return { hit: true, ...onBoard, zone, partKey: partAt(onBoard.kind, zone, onBoard.side, onBoard.x, onBoard.y) }; }
  if (board.visible) return { hit: false };
  raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), camera);
  const meshes = [];
  kit.traverse((o) => { if (o.isMesh && o.userData.part !== undefined) meshes.push(o); });
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (!hit?.uv) return { hit: false };
  const painter = parts[hit.object.userData.part].painter;
  const at = painter.fromCanvas(hit.uv.x * painter.canvas.width, (1 - hit.uv.y) * painter.canvas.height);
  const zone = zoneAt(painter.kind, at.x, at.y, at.side);
  return { hit: true, part: painter.partName, kind: painter.kind, ...at, zone, partKey: partAt(painter.kind, zone, at.side, at.x, at.y) };
}

// ---------- tap the kit to pick a colour (the Colours panel: host command colourPick on / off)
let colourPicking = false;
/** Tap the kit to choose a part (the host's part panel: command partPick on / off). */
let partPicking = false;
/** Which part of a kit group a mesh is: 'fabric', 'rim', 'rib', 'zip', 'cords', 'snaps', 'welt', 'inside', 'label', 'cord', 'metal'. */
function partOf(o, part) {
  const inGroup = (g) => { for (let x = o; x; x = x.parent) if (x === g) return true; return false; };
  if (o === part.rim) return 'rim';
  if (o.material === part.inside) return 'inside';
  if (part.label && inGroup(part.label)) return 'label';
  if (part.cord && inGroup(part.cord.group)) return o.material === part.cord.metal ? 'metal' : 'cord';
  const h = part.hoodie, t = part.track, v = part.varsity;
  if (h?.zip && inGroup(h.zip.group)) return 'zip';
  if (h?.cords && inGroup(h.cords.group)) return 'cords';
  if (h && o.material === h.rib) return 'rib';
  if (h && o.material === h.channel) return 'channel';
  if (t) {
    if (t.zips.some((z) => inGroup(z.group))) return 'zip';
    if (t.cords && inGroup(t.cords.group)) return 'cords';
    if (o.material === t.rib) return 'rib';
    if (o.material === t.garage || o.material === t.channel) return 'collarTrim';
  }
  if (v && o.material === v.snaps) return 'snaps';
  if (v && o.material === v.rib) return 'vrib';
  return 'fabric';
}
/** A tap at a normalised screen point -> {hit, slot, area, zone, part} and the 3D hit (for the glow). */
function colourAt(nx, ny) {
  if (board.visible) return { hit: false };
  raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), camera);
  const meshes = [];
  parts.forEach((part) => part.rim.parent.traverse((o) => { if (o.isMesh && o.visible && !o.userData.glow) meshes.push(o); }));
  const hit = raycaster.intersectObjects(meshes, false).find((h) => h.object.visible);
  if (!hit) return { hit: false };
  const part = parts.find((p) => { for (let x = hit.object; x; x = x.parent) if (x === p.rim.parent) return true; return false; });
  if (!part) return { hit: false };
  const painter = part.painter, kind = painter.kind;
  let piece = partOf(hit.object, part);
  const mat = Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex ?? 0] : hit.object.material;
  if ((part.hoodie?.lining ?? part.track?.lining ?? []).includes(mat)) piece = 'lining';
  let zone = null, pixel = null, at = null;
  if ((piece === 'fabric' || piece === 'vrib') && hit.uv) {
    const px = hit.uv.x * painter.canvas.width, py = (1 - hit.uv.y) * painter.canvas.height;
    at = painter.fromCanvas(px, py);
    zone = zoneAt(kind, at.x, at.y, at.side);
    try { const d = painter.ctx.getImageData(Math.floor(px), Math.floor(py), 1, 1).data; pixel = [d[0], d[1], d[2]]; } catch { /* no pixel */ }
  }
  const areaBy = { lining: part.track ? 'collar' : part.varsity ? null : 'lining', rib: part.track ? 'cuffs' : 'rib', zip: 'zip', channel: 'hood', collarTrim: 'collar', snaps: 'snaps', cords: part.hoodie ? 'lining' : null };
  const fixedBy = { rim: 'secondary', cord: 'main', metal: 'accent', cords: part.track ? 'secondary' : null, label: 'main' };
  let area = areaBy[piece] ?? null, fixed = fixedBy[piece] ?? null;
  if (piece === 'inside') { if (part.varsity) area = 'lining'; else fixed = 'main'; }
  if (piece === 'vrib' && zone !== 'body') area = null;
  // A print layout's own colours are not the kit's: the zone decides.
  const result = colourFor(design, { kind, zone: zone ?? (piece === 'rim' ? 'collar' : 'trim'), pixel: layout ? null : pixel, area, fixed, fullPrint: fullPrintAt(painter, zone) });
  // The part (task 9.134): the print's part there, the collar or waistband rib; none on the jackets' own trims.
  const partKey = piece === 'rim' ? (painter.partName === 'shorts' ? 'waistband' : 'collar') : piece === 'fabric' && at ? partAt(kind, zone, at.side, at.x, at.y) : null;
  const where = at ? { side: at.side, x: at.x, y: at.y } : {};
  return { hit: true, ...result, pixel, zone: zone ?? (piece === 'rim' ? 'collar' : 'trim'), part: painter.partName, partKey, ...where, garment: design.garment, point: hit.point, normal: hit.face?.normal ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null, object: hit.object, material: piece === 'fabric' ? null : mat, piece: part };
}
/** Whether the pattern where `zone` is, is a full-colour uploaded print (its own colours, not the kit's). */
function fullPrintAt(painter, zone) {
  const picture = zone ? design.zones?.[zone] : null;
  const tile = typeof picture === 'string' && picture !== 'None' ? painter.zoneTile(design, picture) : null;
  return tile ? !!tile.fullColour : !!painter._print;
}
/**
 * A whole part lights up (task 9.134): a flash, or held (the part chosen in the host's panel, a drag over it) until
 * cleared; the collar and the waistband (3D rib) glow on their own. False when the part is not on this piece.
 */
let heldGlow = null;
function partGlow(piece, key, { hold = false } = {}) {
  if (!piece || !key) return false;
  if (key === 'collar' || key === 'waistband') {
    const m = piece.rim.material;
    if (!piece.rim.visible || !m.emissive) return false;
    gsap.killTweensOf(m.emissive);
    const e = { v: hold ? 0.3 : 0.5 };
    m.emissive.setScalar(e.v);
    if (!hold) gsap.to(e, { v: 0, duration: 0.9, ease: 'power2.out', onUpdate: () => m.emissive.setScalar(e.v) });
    if (hold) heldGlow = { piece, key };
    return true;
  }
  const mask = piece.painter.partMask(key);
  if (!mask) return false;
  const mat = piece.glow.material;
  if (!mat.map) { mat.map = new THREE.CanvasTexture(mask); mat.needsUpdate = true; } else mat.map.image = mask;
  mat.map.needsUpdate = true;
  piece.glow.visible = true;
  gsap.killTweensOf(mat);
  if (hold) { heldGlow = { piece, key }; gsap.to(mat, { opacity: 0.42, duration: 0.2 }); }
  else { mat.opacity = 0.75; gsap.to(mat, { opacity: 0, duration: 1, ease: 'power2.out', onComplete: () => { if (heldGlow?.piece !== piece) piece.glow.visible = false; } }); }
  return true;
}
/** The pattern's pixels (those near the tapped ink colour) flash. False when none is found. */
function patternGlow(piece, ink) {
  const src = piece.painter.canvas, W = Math.round(src.width / 4), H = Math.round(src.height / 4);
  const m = document.createElement('canvas'); m.width = W; m.height = H;
  const g = m.getContext('2d'); g.drawImage(src, 0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const on = Math.abs(d[i] - ink[0]) + Math.abs(d[i + 1] - ink[1]) + Math.abs(d[i + 2] - ink[2]) < 60;
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = on ? 255 : 0; if (on) n++;
  }
  if (!n) return false;
  g.putImageData(img, 0, 0);
  const mat = piece.glow.material;
  if (!mat.map) { mat.map = new THREE.CanvasTexture(m); mat.needsUpdate = true; } else mat.map.image = m;
  mat.map.needsUpdate = true;
  piece.glow.visible = true;
  gsap.killTweensOf(mat);
  mat.opacity = 0.75;
  gsap.to(mat, { opacity: 0, duration: 1, ease: 'power2.out', onComplete: () => { if (heldGlow?.piece !== piece) piece.glow.visible = false; } });
  return true;
}
/** The held glow goes out. */
function clearGlow() {
  const held = heldGlow;
  heldGlow = null;
  if (!held) return;
  if (held.key === 'collar' || held.key === 'waistband') { held.piece.rim.material.emissive?.setScalar(0); return; }
  const mat = held.piece.glow.material;
  gsap.killTweensOf(mat);
  gsap.to(mat, { opacity: 0, duration: 0.2, onComplete: () => { if (!heldGlow) held.piece.glow.visible = false; } });
}
/** The host's part panel: light up a part ({part: 'top' | 'shorts', key, hold}) or clear the held glow (null). */
function glowPart(arg) {
  if (!arg || !(arg.key || arg.keys?.length)) { clearGlow(); return; }
  if (arg.hold) clearGlow();
  // keys (task 9.137): several parts at once (every part a kit colour covers), on whichever piece each is.
  const pieceOf = (key) => (/^shorts|^waistband/.test(key) ? 'shorts' : 'top');
  const keys = arg.keys ?? [arg.key];
  for (const piece of parts) {
    const mine = keys.filter((key) => (arg.keys ? pieceOf(key) : arg.part ?? pieceOf(key)) === piece.painter.partName);
    for (const rib of mine.filter((key) => key === 'collar' || key === 'waistband')) partGlow(piece, rib, { hold: !!arg.hold });
    const printed = mine.filter((key) => key !== 'collar' && key !== 'waistband');
    if (printed.length) partGlow(piece, printed.length === 1 ? printed[0] : printed, { hold: !!arg.hold });
  }
}
/** The tapped part glows briefly: the whole part (task 9.134), else a bright ring where it was tapped and a separate trim's own glow. */
function glowAt({ point, normal, material, piece, partKey, slot, pixel }) {
  // A tap on the pattern (task 9.137): only the pattern's own pixels (the tapped ink colour) light up.
  if ((slot === 'pattern' || slot === 'pattern-image') && pixel && piece && patternGlow(piece, pixel)) return;
  if (partKey && partGlow(piece, partKey)) return;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.028, 0.044, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false, side: THREE.DoubleSide }));
  ring.renderOrder = 999;
  ring.position.copy(point);
  if (normal) ring.lookAt(point.clone().add(normal)); else ring.lookAt(camera.position);
  scene.add(ring);
  const s = { k: 0.6, o: 0.95 };
  gsap.to(s, { k: 2.2, o: 0, duration: 0.7, ease: 'power2.out', onUpdate: () => { ring.scale.setScalar(s.k); ring.material.opacity = s.o; }, onComplete: () => { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); } });
  if (material?.emissive) {
    const was = material.emissive.clone(), e = { v: 0.45 };
    gsap.to(e, { v: 0, duration: 0.7, ease: 'power2.out', onUpdate: () => material.emissive.copy(was).lerp(new THREE.Color(0xffffff), e.v), onComplete: () => material.emissive.copy(was) });
  }
}
/** Drag to kit: the part under the pointer glows while something is dragged over the kit (host command dragHover). */
let hoverRing = null;
function dragHover(arg) {
  const at = arg && Number.isFinite(arg.x) && Number.isFinite(arg.y) ? arg : null;
  const found = at ? colourAt(at.x, at.y) : { hit: false };
  if (!found.hit) {
    if (hoverRing) hoverRing.visible = false;
    clearGlow();
    if (at) post({ type: 'dragHover', hit: false });
    return;
  }
  if (found.partKey) {
    if (hoverRing) hoverRing.visible = false;
    if (heldGlow?.piece !== found.piece || heldGlow?.key !== found.partKey) { clearGlow(); partGlow(found.piece, found.partKey, { hold: true }); }
    const where = pickAt(at.x, at.y);
    post({ type: 'dragHover', ...where, hit: where.hit !== false });
    return;
  }
  clearGlow();
  if (!hoverRing) {
    hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.05, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false, side: THREE.DoubleSide }));
    hoverRing.renderOrder = 999;
    scene.add(hoverRing);
  }
  hoverRing.visible = true;
  hoverRing.position.copy(found.point);
  if (found.normal) hoverRing.lookAt(found.point.clone().add(found.normal)); else hoverRing.lookAt(camera.position);
  const where = pickAt(at.x, at.y);
  post({ type: 'dragHover', ...where, hit: where.hit !== false });
}
// ---------- objects on the 3D kit (task 9.144): tap the crest, a word, the name, the number or a logo to select it;
// drag to move, pinch or the bar to resize, turn, change the crest's shape, edit the words, remove. A tap on an empty
// chest spot offers "Add logo here" / "Add text here". The host turns it on (command objectEdit) in its Studio; the
// changes reach it as the board's do ({type:'marks'} / {type:'layers'}), words as {type:'markText', field, value}.
let barPending = false;
let objectEditing = false, selected = null, addSpot = null, hostImages = false, dragObj = null;
const MARK_LABEL = { wordmark: 'Team name', sponsor: 'Sponsor', crest: 'Crest', name: 'Back name', number: 'Number', frontNumber: 'Front number' };
const MARK_FIELD = { wordmark: 'logoText', name: 'backName', number: 'number', frontNumber: 'number' };
const SHAPE_LABEL = { shield: 'Shield', circle: 'Circle', square: 'Square', rounded: 'Rounded', diamond: 'Diamond' };
const pieceFor = (part) => parts.find((p) => p.painter.partName === part);
/** Every object drawn on a piece: its layers (on top) first, then the fixed marks. */
function objectsOn(painter) {
  return [
    ...[...(painter.layerBoxes ?? [])].reverse().map((b) => ({ ...b, kind: 'layer' })),
    ...(painter.marks ?? []).map((m) => ({ ...m, kind: 'mark' })),
  ];
}
function inBox(o, side, x, y, pad = 0.012) {
  if (o.side !== side || !Number.isFinite(o.w) || !Number.isFinite(o.h)) return false;
  const back = side === 'back', t = (-(o.rot ?? 0) * Math.PI) / 180;
  const vx = (x - o.x) * (back ? -1 : 1), vy = -(y - o.y);
  const lx = vx * Math.cos(t) - vy * Math.sin(t), ly = vx * Math.sin(t) + vy * Math.cos(t);
  return Math.abs(lx) <= o.w / 2 + pad && Math.abs(ly) <= o.h / 2 + pad;
}
function objectAt(found) {
  if (!found?.hit || !Number.isFinite(found.x) || !Number.isFinite(found.y)) return null;
  const piece = pieceFor(found.part);
  if (!piece) return null;
  const hits = objectsOn(piece.painter).filter((o) => inBox(o, found.side, found.x, found.y));
  // The smallest one under the finger (a logo on top of a big word).
  hits.sort((a, b) => a.w * a.h - b.w * b.h);
  const o = hits[0];
  return o ? { part: found.part, kind: o.kind, key: o.key, id: o.id, name: o.name } : null;
}
/** The selected object as drawn now. */
function selectedBox() {
  if (!selected) return null;
  const piece = pieceFor(selected.part);
  return piece ? objectsOn(piece.painter).find((o) => o.kind === selected.kind && (o.kind === 'mark' ? o.key === selected.key : o.id === selected.id)) ?? null : null;
}
const layerOf = (id) => (design.layers ?? []).find((l) => l.id === id);
function markOf(key) { design.marks = { ...(design.marks ?? {}) }; return (design.marks[key] = { ...(design.marks[key] ?? {}) }); }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const turn = (r) => ((((r + 180) % 360) + 360) % 360) - 180;
function sendObjects(kind) {
  if (kind === 'mark') post({ type: 'marks', marks: design.marks ?? {} });
  else post({ type: 'layers', layers: design.layers ?? [] });
}
/** Change the selected object: {x, y} | {scaleBy} | {scale} (marks: absolute; layers: times the base) | {rotBy} | {shape} | {color} | {text} | {remove}. */
function changeSelected(change, final = true) {
  // A text layer emptied while typing is not drawn, but stays selected and editable.
  const box = selectedBox() ?? (selected?.kind === 'layer' && layerOf(selected.id) ? { kind: 'layer' } : null);
  if (!box) return;
  if (selected.kind === 'mark') {
    const o = markOf(selected.key);
    if ('x' in change) { o.x = clamp(change.x, -1, 1); o.y = clamp(change.y, -0.5, 1.5); }
    if (change.scaleBy) o.scale = clamp((o.scale ?? 1) * change.scaleBy, 0.1, 6);
    if (change.scale) o.scale = clamp(change.scale, 0.1, 6);
    if (change.rotBy) o.rot = turn((o.rot ?? box.rot ?? 0) + change.rotBy);
    if (change.shape) o.shape = change.shape;
    if (change.color) o.color = change.color;
    if (change.remove) o.hidden = true;
  } else {
    design.layers = (design.layers ?? []).map((l) => ({ ...l }));
    const l = layerOf(selected.id);
    if (!l) return;
    if ('x' in change) { l.x = clamp(change.x, -1, 1); l.y = clamp(change.y, -0.5, 1.5); }
    if (change.scaleBy || change.scale) {
      const b = change.scale ? selected.base ?? {} : {}, k = change.scaleBy ?? change.scale;
      if (l.type === 'text') l.size = clamp((b.size ?? l.size ?? 0.06) * k, 0.005, 0.4);
      else { l.w = clamp((b.w ?? l.w ?? 0.1) * k, 0.005, 1); if (l.h != null) l.h = clamp((b.h ?? l.h) * k, 0.005, 1); }
    }
    if (change.rotBy) l.rot = turn((l.rot ?? 0) + change.rotBy);
    if (change.color) l.color = change.color;
    if ('text' in change) l.text = String(change.text).slice(0, 120);
    if (change.remove) design.layers = design.layers.filter((x) => x.id !== selected.id);
  }
  const kind = box.kind;
  if (change.remove) select(null);
  repaintSoon();
  if (final) sendObjects(kind);
}
function setMarkText(name, value) {
  const field = MARK_FIELD[name];
  if (!field) return;
  value = name === 'number' || name === 'frontNumber' ? String(value).replace(/\D/g, '').slice(0, 3) : String(value).slice(0, 40);
  design[field] = value;
  repaintSoon();
  markTextPending[field] = value;
  clearTimeout(markTextTimer);
  markTextTimer = setTimeout(flushMarkText, 700);
}
let markTextTimer, markTextPending = {};
function flushMarkText() {
  clearTimeout(markTextTimer);
  const all = markTextPending; markTextPending = {};
  for (const [field, value] of Object.entries(all)) post({ type: 'markText', field, value });
}

// The outline: the selected object's box drawn on the part's glow layer (it follows the kit's shape).
function outlineSelected() {
  const box = selectedBox();
  // (A word emptied while typing keeps its selection and the box being typed in.)
  if (!box) { if (selected && !dragObj && !bar.contains(document.activeElement)) select(null); else if (heldGlow?.key === 'object') clearGlow(); return; }
  const piece = pieceFor(selected.part), P = piece.painter, q = 0.5;
  const m = document.createElement('canvas'); m.width = Math.round(P.canvas.width * q); m.height = Math.round(P.canvas.height * q);
  const g = m.getContext('2d'), c = P.toCanvas(box.side === 'back', box.x, box.y);
  g.scale(q, q); g.translate(c.x, c.y); g.scale(c.s, c.s); g.rotate(((box.rot ?? 0) * Math.PI) / 180);
  const pad = 0.008, w = box.w + 2 * pad, h = box.h + 2 * pad, px = 1 / (c.s * q);
  g.strokeStyle = '#fff'; g.lineWidth = 3 * px; g.setLineDash([10 * px, 6 * px]);
  g.strokeRect(-w / 2, -h / 2, w, h);
  g.setLineDash([]); g.fillStyle = '#fff';
  const hs = 10 * px;
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.fillRect((x * w) / 2 - hs / 2, (y * h) / 2 - hs / 2, hs, hs);
  if (heldGlow && heldGlow.key !== 'object') clearGlow();
  for (const p of parts) if (p !== piece && p.glow) p.glow.visible = false;
  const mat = piece.glow.material;
  if (!mat.map) { mat.map = new THREE.CanvasTexture(m); mat.needsUpdate = true; } else mat.map.image = m;
  mat.map.needsUpdate = true;
  piece.glow.visible = true;
  gsap.killTweensOf(mat);
  mat.opacity = 0.95;
  heldGlow = { piece, key: 'object' };
}
function select(obj) {
  flushMarkText();
  selected = obj;
  addSpot = null;
  if (obj) outlineSelected();
  else if (heldGlow?.key === 'object') clearGlow();
  drawBar();
  post({ type: 'objectSelected', on: !!obj, kind: obj?.kind ?? null, key: obj?.key ?? null, id: obj?.id ?? null });
}

// The small bar over the kit.
const bar = document.createElement('div');
bar.id = 'object-bar';
bar.setAttribute('role', 'toolbar');
const barCss = document.createElement('style');
barCss.textContent = `#object-bar{position:fixed;left:50%;bottom:78px;transform:translateX(-50%);z-index:30;display:none;flex-direction:column;gap:6px;align-items:stretch;width:max-content;max-width:calc(100vw - 16px);box-sizing:border-box;padding:8px 10px;border-radius:14px;background:rgba(14,18,26,.92);color:#fff;font:600 13px Inter,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)}
#object-bar.on{display:flex}#object-bar b{margin-right:2px}#object-bar button{min-height:34px;min-width:34px;padding:0 10px;border:1px solid rgba(255,255,255,.25);border-radius:9px;background:rgba(255,255,255,.08);color:#fff;font:inherit;cursor:pointer}
#object-bar button:hover{background:rgba(255,255,255,.18)}#object-bar button[aria-pressed=true]{background:#2fd0e0;color:#071018;border-color:#2fd0e0}#object-bar button.danger{border-color:#ff7a7a;color:#ffb3b3}
#object-bar input[type=range]{width:100px}#object-bar input[type=text]{width:130px;min-height:32px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:#0b0f16;color:#fff;padding:0 8px;font:inherit}
#object-bar input[type=color]{width:36px;height:32px;border:0;background:none;padding:0}#object-bar .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;justify-content:center;max-width:100%}
@media (max-width:640px){#object-bar{left:28px;right:28px;transform:none;width:auto;bottom:74px;padding:6px;flex-direction:column;align-items:stretch;gap:5px}#object-bar .row{flex-wrap:wrap;max-width:100%;justify-content:center;gap:5px}#object-bar span,#object-bar b{white-space:nowrap}#object-bar button{min-height:36px;padding:0 8px}#object-bar input[type=range]{width:80px}}`;
document.head.append(barCss);
document.body.append(bar);
for (const t of ['pointerdown', 'pointerup', 'click', 'wheel', 'touchstart']) bar.addEventListener(t, (e) => e.stopPropagation());
function el(tag, props = {}, ...kids) { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k.startsWith('aria') || k === 'title' || k === 'role') e.setAttribute(k === 'ariaLabel' ? 'aria-label' : k === 'ariaPressed' ? 'aria-pressed' : k, v); else e[k] = v; } e.append(...kids); return e; }
function btn(label, onclick, extra = {}) { return el('button', { type: 'button', textContent: label, onclick, ...extra }); }
function drawBar() {
  bar.replaceChildren();
  if (addSpot) {
    bar.append(el('div', { className: 'row' }, el('b', { textContent: 'Empty spot' }),
      btn('Add logo here', () => addHere('logo')),
      btn('Add text here', () => addHere('text')),
      btn('Upload picture here', () => addHere('upload')),
      btn('✕', () => { addSpot = null; drawBar(); }, { ariaLabel: 'Close', title: 'Close' })));
    bar.classList.add('on'); bar.scrollLeft = 0; requestAnimationFrame(() => { bar.scrollLeft = 0; });
    return;
  }
  const box = selectedBox();
  if (!selected || !box) { bar.classList.remove('on'); return; }
  const l = selected.kind === 'layer' ? layerOf(selected.id) : null;
  const name = selected.kind === 'mark' ? MARK_LABEL[selected.name] ?? selected.name : l?.type === 'text' ? 'Text' : l?.name || 'Logo';
  const size = el('input', { type: 'range', min: '0.3', max: '3', step: '0.05', title: 'Size', ariaLabel: 'Size' });
  if (selected.kind === 'mark') size.value = String(design.marks?.[selected.key]?.scale ?? 1);
  else { size.value = '1'; selected.base = { size: l?.size, w: l?.w, h: l?.h }; }
  size.oninput = () => changeSelected({ scale: Number(size.value) }, false);
  size.onchange = () => sendObjects(selected.kind);
  bar.append(el('div', { className: 'row' }, el('b', { textContent: name }),
    btn('−', () => changeSelected({ scaleBy: 1 / 1.12 }), { title: 'Smaller', ariaLabel: 'Smaller' }), size,
    btn('+', () => changeSelected({ scaleBy: 1.12 }), { title: 'Bigger', ariaLabel: 'Bigger' }),
    btn('⟲', () => changeSelected({ rotBy: -15 }), { title: 'Turn left', ariaLabel: 'Turn left' }),
    btn('⟳', () => changeSelected({ rotBy: 15 }), { title: 'Turn right', ariaLabel: 'Turn right' }),
    btn('Remove', () => changeSelected({ remove: true }), { className: 'danger' }),
    btn('Done', () => select(null))));
  if (selected.kind === 'mark' && selected.name === 'crest') {
    const now = design.marks?.[selected.key]?.shape ?? 'shield';
    bar.append(el('div', { className: 'row' }, el('span', { textContent: 'Shape' }),
      ...Object.entries(SHAPE_LABEL).map(([k, v]) => btn(v, () => { changeSelected({ shape: k }); setTimeout(drawBar, 0); }, { ariaPressed: String(now === k) })),
      btn('Copy to other chest', () => copyCrest(box))));
  }
  const text = selected.kind === 'mark' ? (MARK_FIELD[selected.name] ? String(design[MARK_FIELD[selected.name]] ?? '') : null) : l?.type === 'text' ? String(l.text ?? '') : null;
  if (text !== null || l?.type === 'shape') {
    const row = el('div', { className: 'row' });
    if (text !== null) {
      const input = el('input', { type: 'text', value: text, ariaLabel: 'Words', maxLength: selected.name === 'number' || selected.name === 'frontNumber' ? 3 : 40 });
      input.oninput = () => (selected.kind === 'mark' ? setMarkText(selected.name, input.value) : changeSelected({ text: input.value }, false));
      input.onchange = () => { if (selected?.kind === 'layer') sendObjects('layer'); else flushMarkText(); };
      input.addEventListener('keydown', (e) => e.stopPropagation());
      row.append(el('span', { textContent: 'Words' }), input);
    }
    const now = selected.kind === 'mark' ? design.marks?.[selected.key]?.color ?? design.accent : l?.color ?? design.accent;
    const colour = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(now ?? '') ? now : '#ffffff', ariaLabel: 'Colour', title: 'Colour' });
    colour.oninput = () => changeSelected({ color: colour.value }, false);
    colour.onchange = () => sendObjects(selected.kind);
    row.append(el('span', { textContent: 'Colour' }), colour);
    bar.append(row);
  }
  bar.classList.add('on'); bar.scrollLeft = 0; requestAnimationFrame(() => { bar.scrollLeft = 0; });
}
const newId = (what) => `kit-${what}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function addLayer(layer) {
  design.layers = [...(design.layers ?? []), layer];
  post({ type: 'layers', layers: design.layers });
  addSpot = null;
  selected = { part: layer.part, kind: 'layer', id: layer.id };
  barPending = true;
  repaintSoon();
}
/** The club's logo, or the 3DEEZI shield drawn as a picture (a copy of the crest elsewhere is an ordinary logo layer). */
/** The crest as a picture, in its chosen badge shape (task 9.144): the club's logo or the 3DEEZI "3D" (a copy of the
 * crest elsewhere is an ordinary logo layer). */
async function crestPicture(shape = design.marks?.top_crest?.shape ?? design.marks?.front_crest?.shape) {
  const round = shape && shape !== 'shield';
  if (design.logoImage && !round) return design.logoImage;
  const logo = design.logoImage ? await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = design.logoImage; }) : null;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), k = 256 / 0.074;
  g.translate(128, 128); g.scale(k, k);
  g.beginPath();
  const s = 0.066;
  if (shape === 'circle') g.ellipse(0, 0, s / 2, s / 2, 0, 0, Math.PI * 2);
  else if (shape === 'square') g.rect(-s / 2, -s / 2, s, s);
  else if (shape === 'rounded') g.roundRect(-s / 2, -s / 2, s, s, s * 0.22);
  else if (shape === 'diamond') { g.moveTo(0, -s / 2); g.lineTo(s / 2, 0); g.lineTo(0, s / 2); g.lineTo(-s / 2, 0); g.closePath(); }
  else { [[0, 0.034], [0.028, 0.018], [0.022, -0.02], [0, -0.036], [-0.022, -0.02], [-0.028, 0.018]].forEach(([x, y], i) => (i ? g.lineTo(x, -y) : g.moveTo(x, -y))); g.closePath(); }
  g.fillStyle = design.accent; g.fill();
  if (logo) { g.save(); g.clip(); const f = Math.min((s * 0.8) / logo.width, (s * 0.8) / logo.height); g.drawImage(logo, (-logo.width * f) / 2, (-logo.height * f) / 2, logo.width * f, logo.height * f); g.restore(); }
  else { g.fillStyle = design.main; g.font = '700 0.03px Rajdhani, Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('3D', 0, 0.002); }
  return c.toDataURL('image/png');
}
async function copyCrest(box) {
  // The same shape and size, the turn mirrored, on the other chest.
  const part = selected.part;
  addLayer({ id: newId('logo'), name: 'Crest copy', type: 'image', part, side: box.side, x: clamp(-box.x, -1, 1), y: box.y, w: clamp(Math.max(box.w, 0.03), 0.005, 1), rot: turn(-(box.rot ?? 0)), src: await crestPicture(design.marks?.[selected.key]?.shape ?? 'shield') });
}
async function addHere(what) {
  const at = addSpot;
  if (!at) return;
  const base = { part: at.part, side: at.side, x: at.x, y: at.y, rot: 0 };
  if (what === 'text') return addLayer({ ...base, id: newId('text'), name: 'Text', type: 'text', text: 'TEXT', size: 0.035, color: design.accent });
  if (what === 'logo') return addLayer({ ...base, id: newId('logo'), name: 'Logo', type: 'image', w: 0.07, src: await crestPicture() });
  const id = newId('img');
  const got = await choosePicture(id);
  if (!got) return;
  const data = await processImage(got, { maxSize: 600 }).catch(() => null);
  if (data) addLayer({ ...base, id, name: 'Logo', type: 'image', w: 0.07, src: data });
}
const pictureWaits = new Map();
/** A picture from the device: the app's own picker (feature images), else a file input here. */
function choosePicture(id) {
  if (hostImages) return new Promise((resolve) => { pictureWaits.set(id, resolve); post({ type: 'wantImage', id }); });
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => resolve(null); r.readAsDataURL(f);
    };
    input.click();
  });
}
function imageChosen({ id, data } = {}) { const w = pictureWaits.get(id); pictureWaits.delete(id); w?.(typeof data === 'string' && data ? data : null); }
/** An empty spot on either chest (where a crest sits), on the front of a top. */
function chestSpot(found) {
  if (!found?.hit || found.part !== 'top' || found.side !== 'front') return false;
  const crest = (pieceFor('top')?.painter.marks ?? []).find((m) => m.name === 'crest')?.def ?? { x: 0.105, y: 0.6 };
  return Math.abs(Math.abs(found.x) - Math.abs(crest.x)) < 0.07 && Math.abs(found.y - crest.y) < 0.07;
}
/** A tap (task 9.144): an object wins over a part or colour tap. True when the tap was taken. */
function objectTap(nx, ny) {
  if (!objectEditing || board.visible) return false;
  const found = pickAt(nx, ny);
  const obj = objectAt(found);
  if (obj) { select(obj); return true; }
  if (selected) select(null);
  if (chestSpot(found)) { addSpot = { part: found.part, side: found.side, x: found.x, y: found.y }; drawBar(); }
  else if (addSpot) { addSpot = null; drawBar(); }
  return false;
}
// Drag the selected object; a second finger resizes it (pinch).
const fingers = new Map();
const norm = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
const scaleNow = () => (selected?.kind === 'mark' ? design.marks?.[selected.key]?.scale ?? 1 : 1);
canvas.addEventListener('pointerdown', (e) => {
  if (!objectEditing || !selected || board.visible) return;
  if (dragObj) {
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size === 2) {
      const [a, b] = [...fingers.values()], l = layerOf(selected.id);
      dragObj.pinch = { d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s0: scaleNow() };
      if (l) selected.base = { size: l.size, w: l.w, h: l.h };
    }
    e.stopImmediatePropagation(); e.preventDefault(); return;
  }
  const found = pickAt(...norm(e)), obj = objectAt(found), box = selectedBox();
  if (!obj || !box || obj.kind !== selected.kind || (obj.key ?? obj.id) !== (selected.key ?? selected.id)) return;
  fingers.clear(); fingers.set(e.pointerId, [e.clientX, e.clientY]);
  dragObj = { dx: box.x - found.x, dy: box.y - found.y, side: found.side, moved: false };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* fine */ }
  e.stopImmediatePropagation(); e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragObj) return;
  e.stopImmediatePropagation();
  if (fingers.has(e.pointerId)) fingers.set(e.pointerId, [e.clientX, e.clientY]);
  if (dragObj.pinch && fingers.size >= 2) {
    const [a, b] = [...fingers.values()], k = Math.hypot(a[0] - b[0], a[1] - b[1]) / dragObj.pinch.d0;
    changeSelected({ scale: selected.kind === 'mark' ? dragObj.pinch.s0 * k : k }, false);
    dragObj.moved = true; return;
  }
  const at = pickAt(...norm(e));
  if (!at.hit || at.part !== selected.part || at.side !== dragObj.side) return;
  dragObj.moved = true;
  changeSelected({ x: at.x + dragObj.dx, y: at.y + dragObj.dy }, false);
}, true);
const endDrag = (e) => {
  if (!dragObj) return;
  fingers.delete(e.pointerId);
  e.stopImmediatePropagation();
  if (fingers.size) { dragObj.pinch = null; return; }
  const moved = dragObj.moved;
  dragObj = null;
  if (moved) { sendObjects(selected.kind); drawBar(); }
};
canvas.addEventListener('pointerup', endDrag, true);
canvas.addEventListener('pointercancel', endDrag, true);
let tapDown = null;
// Only a press that starts and ends on the 3D canvas itself (the main button, one finger) counts as a tap.
canvas.addEventListener('pointerdown', (e) => { tapDown = e.isPrimary && e.button === 0 && e.target === canvas ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
canvas.addEventListener('pointercancel', () => { tapDown = null; });
canvas.addEventListener('pointerup', (e) => {
  const down = tapDown;
  tapDown = null;
  if (!down || e.target !== canvas || performance.now() - down.t > 300 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  // An object on the kit (task 9.144) wins over a part or colour tap.
  { const r0 = canvas.getBoundingClientRect(); if (objectTap((e.clientX - r0.left) / r0.width, (e.clientY - r0.top) / r0.height)) { setTimeout(() => { clearTimeout(idle); controls.autoRotate = false; }, 0); return; } }
  if (!(colourPicking || partPicking)) return;
  // A colour tap is not a turn: the kit stays where it is (no idle auto-turn 6 s later, which made the host's
  // Front / Back / Side buttons seem dead when that view was already chosen).
  setTimeout(() => { clearTimeout(idle); controls.autoRotate = false; }, 0);
  const r = canvas.getBoundingClientRect();
  let found = colourAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  // A finger on a thin pattern stripe often lands just beside it: a pattern within ~8 px wins (task 9.137).
  if (found.hit && found.slot !== 'pattern' && found.slot !== 'pattern-image') {
    near: for (const d of [4, 8]) for (const [dx, dy] of [[0, d], [0, -d], [d, 0], [-d, 0], [d, d], [-d, -d], [d, -d], [-d, d]]) {
      const m = colourAt((e.clientX + dx - r.left) / r.width, (e.clientY + dy - r.top) / r.height);
      if (m.hit && (m.slot === 'pattern' || m.slot === 'pattern-image') && m.part === found.part) { found = m; break near; }
    }
  }
  if (!found.hit) {
    if (colourPicking) post({ type: 'colourPick', hit: false });
    if (partPicking) post({ type: 'partPick', hit: false });
    return;
  }
  // (A part chosen in the panel stays lit until the host says otherwise; the tap's flash is on top.)
  glowAt(found);
  const { point, normal, object, material, piece, ...msg } = found;
  if (colourPicking) post({ type: 'colourPick', ...msg });
  if (partPicking) post({ type: 'partPick', ...msg });
});

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
  // (Not while tapping the kit to pick colours: two quick taps there are two picks.)
  if (now - lastTap < 300 && !colourPicking) setView('Front');
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
  // A chosen view stays: no idle auto-turn left over from an earlier drag.
  clearTimeout(idle);
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
// The tiers' edges: high multisamples the scene (both buffers, as they take turns), low smooths them with FXAA.
if (Q?.msaa) composer.renderTarget1.samples = composer.renderTarget2.samples = Q.msaa;
composer.addPass(new RenderPass(scene, camera));
// High threshold: only the emissive rings glow, never the fabric (in the tiers also the stadium's floodlights).
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), mobile ? 0.42 : 0.5, 0.42, 1.65);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// FXAA: on in the low tier; on high, ready for when a slow graphics card makes it step down (stepDown).
const fxaa = Q ? new FXAAPass() : null;
if (fxaa) { fxaa.enabled = !!Q.fxaa; composer.addPass(fxaa); }
/**
 * The high tier on a graphics card too slow for it (found from the frame times while it runs, only when the tier was
 * detected rather than asked for with ?quality): first the multisampling gives way to FXAA, then the podium's mirror
 * goes. It never steps back up, so the picture does not flicker between the two.
 */
let steps = 0, speedFrom = Infinity, speed = [];
const adaptive = QUALITY === 'high' && !params.has('quality');
function stepDown() {
  if (steps === 0 && composer.renderTarget1.samples) {
    composer.renderTarget1.samples = composer.renderTarget2.samples = 0;
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
    fxaa.enabled = true;
  } else if (mirror) mirror.visible = false;
  steps++;
  document.body.dataset.quality = `high-${steps}`;
}
function watchSpeed(dt) {
  if (!adaptive || steps >= 2 || performance.now() < speedFrom || document.hidden || canvas.style.visibility === 'hidden') return;
  speed.push(dt);
  if (speed.length < 90) return;
  const average = speed.reduce((a, b) => a + b, 0) / speed.length;
  speed = [];
  // Slower than about 26 frames a second.
  if (average > 0.038) stepDown();
}

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
/** Set when the page has given its graphics back (pagehide, below): nothing is drawn after that. */
let released = false;
function frame() {
  // A frame drawn after the release would try to rebuild the freed materials on the lost context.
  if (released) return;
  const dt = clock.getDelta(), t = clock.elapsedTime;
  kit.position.y = 0.0025 * Math.sin(t * .7);
  shadow.scale.set(1.15 - kit.position.y * 3, 0.55 - kit.position.y * 1.5, 1);
  // The architectural stage stays still while the garment turns.
  controls.update(dt);
  watchSpeed(dt);
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
  // (No glow in a picture: a part lit in the part panel, a drag's ring, a rib's glow.)
  const lit = parts.filter((p) => p.glow?.visible), ring = hoverRing?.visible ? hoverRing : null;
  const ribs = parts.map((p) => [p.rim.material.emissive, p.rim.material.emissive?.clone()]).filter(([e]) => e);
  lit.forEach((p) => (p.glow.visible = false));
  if (ring) ring.visible = false;
  ribs.forEach(([e]) => e.setScalar(0));
  composer.render();
  const data = renderer.domElement.toDataURL('image/png');
  lit.forEach((p) => (p.glow.visible = true));
  if (ring) ring.visible = true;
  ribs.forEach(([e, was]) => e.copy(was));
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
if (new URLSearchParams(location.search).has('debug')) {
  window.__v = {
    camera, controls, scene, kit, setCamera, get parts() { return parts; }, get layout() { return layout; }, panelSides, regionsFor, quality: QUALITY, renderer, composer, stepDown,
    /** The cost of a frame (ms, the graphics card waited for): the median of `n` frames as the kit turns. */
    bench: (n = 30) => {
      const gl = renderer.getContext(), px = new Uint8Array(4), turn = kit.rotation.y, times = [];
      for (let i = -3; i < n; i++) {
        const t0 = performance.now();
        kit.rotation.y = turn + i * 0.07;
        composer.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        if (i >= 0) times.push(performance.now() - t0);
      }
      kit.rotation.y = turn;
      return times.sort((a, b) => a - b)[times.length >> 1];
    },
  };
}

window.viewer = {
  setDesign: (json) => applyDesign(typeof json === 'string' ? JSON.parse(json) : json),
  setView,
  capture: (view) => post({ type: 'capture', view, data: capture(view) }),
  captureDataUrl: capture,
  textureDataUrl: () => parts[0].painter.canvas.toDataURL('image/jpeg', 0.8),
  reset: () => setView('Front'),
  /** {id, x, y} normalised -> posts {type:'pick', id, hit, part, side, x, y, zone}. */
  pick: ({ id, x, y }) => post({ type: 'pick', id, ...pickAt(x, y) }),
  /** Tap the kit to pick a colour: on (the Colours panel is open) or off. A short tap then posts {type:'colourPick', hit, slot, area, zone, part, garment}. */
  colourPick: (on) => { colourPicking = !!on; },
  /** Tap the kit to choose a part (task 9.134): a short tap posts {type:'partPick', hit, partKey, part, side, x, y, zone, slot, area} and lights the whole part. */
  partPick: (on) => { partPicking = !!on; },
  /** Objects on the 3D kit (task 9.144): on in the host's Studio (a tap selects the crest, words, logos). */
  objectEdit: (on) => { objectEditing = !!on; if (!on) { addSpot = null; if (selected) select(null); else drawBar(); } },
  /** The app's answer to {type:'wantImage', id}: {id, data} (a data URL, or null when cancelled). */
  imageChosen,
  /** Lights up a whole part: {part: 'top' | 'shorts', key, hold?} (hold: until glowPart null). */
  glowPart,
  /** Drag to kit: {x, y} normalised glows the part there and posts {type:'dragHover', hit, part, side, x, y, zone}; null clears it. */
  dragHover,
  /** For automated checks: what a tap at a normalised point would pick (no glow, nothing posted). */
  colourAt: (x, y) => { const { point, normal, object, material, piece, ...msg } = colourAt(x, y); return msg; },
  /** {id, src, removeBg, tint, maxSize} -> posts {type:'image', id, data | error}. */
  processImage: ({ id, src, ...options }) =>
    // A PDF (Artwork to 3D, task 9.153: a vector logo from the app) is drawn as a picture first, sharp at full size.
    (/^data:application\/pdf/i.test(String(src ?? '').slice(0, 48)) ? readLayout(src, { long: Math.min(2048, Number(options.maxSize) || 1024) }).then((r) => r.image.toDataURL('image/png')) : Promise.resolve(src))
      .then((s) => processImage(s, { ...options, ...options.options })).then(
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
  /** {id, src, name, asset, drawing?, garment?, known?}: a new factory print layout or garment drawing, checked on screen; see checkLayout. */
  checkLayout,
  /** {asset, src | error}: the file the viewer asked for (layoutWanted). */
  layoutFile,
  /** What the host can do: {layouts: true} = it answers layoutWanted. */
  features: (what = {}) => { if (what?.layouts) hostLayouts = true; if (what?.images) hostImages = true; },
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
      const allowed = ['setDesign', 'setView', 'capture', 'reset', 'pick', 'processImage', 'board', 'select', 'boardZoom', 'captureBoard', 'checkLayout', 'layoutFile', 'features', 'colourPick', 'dragHover', 'partPick', 'glowPart', 'objectEdit', 'imageChosen'];
      if (m && allowed.includes(m.cmd)) Promise.resolve(window.viewer[m.cmd](m.arg)).catch((error) => post({ type: 'error', command: m.cmd, message: error.message }));
    } catch (error) { post({ type: 'error', message: error.message }); }
  },
};
addEventListener('message', (e) => {
  if (e.source === window.parent && e.origin === location.origin && typeof e.data === 'string') window.viewer.receive(e.data);
});

// ---------- leaving
/**
 * When the page really goes (the host removed the viewer's frame: the website's pages, the app leaving the Studio), the
 * graphics card is freed at once: every geometry, texture and render target, then the WebGL context itself. Otherwise
 * a removed frame's context is freed only when the browser collects it, and a long session that opens the Studio many
 * times can run out of WebGL contexts or graphics memory. A page kept in the back/forward cache (persisted) keeps all.
 */
addEventListener('pagehide', (event) => {
  if (event.persisted || released) return;
  released = true;
  try {
    const textures = new Set([...reliefs.values()]);
    scene.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [o.material ?? []].flat()) {
        for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
        m.dispose();
      }
    });
    if (scene.background?.isTexture) textures.add(scene.background);
    if (scene.environment) textures.add(scene.environment);
    textures.forEach((t) => t.dispose());
    // The podium's mirror and floor reflections, the post-processing buffers and the environment's prefilter.
    scene.traverse((o) => { if (o.isReflector) o.getRenderTarget().dispose(); });
    composer.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  } catch { /* leaving anyway */ }
});

(async () => {
  await environmentReady;
  if (HQ) await loadHQ();
  await applyDesign(design);
  reveal();
  setTimeout(() => (controls.autoRotate = !params.has('still')), 1600);
  frame();
  document.body.classList.add('ready');
  speedFrom = performance.now() + 3000;
  post({ type: 'ready' });
})().catch((error) => post({ type: 'error', message: error.message }));
