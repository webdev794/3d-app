// Model Painter (admin tool, 2026-11-26; remove with REMOVE.md): paint a garment tile's colour areas on its ready-made
// model by hand. Runs in its own page (media/model-painter/index.html) inside Admin > Model Painter, which sends it the
// tiles and the sign-in. Saves through the admin API to media/model-maps/, which the live viewer reads (its MODEL-PAINTER
// hook) for designs from that tile only. Never changes a model's shape.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RECIPE_MODELS } from '../viewer/src/recipemodels.js';
import { AreaMap, decodeModel, MAXD } from './engine.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const VIEWER = params.get('viewer') ?? '../viewer/';
let ctx = null; // { tiles, token, api, viewerVersion }

// ---------- areas: their names and preview colours
const AREA_NAMES = [
  ['', 'Body (main cloth)'], ['area:leftSleeve', 'Left sleeve'], ['area:rightSleeve', 'Right sleeve'], ['area:sides', 'Side panels'],
  ['zone:sideBlade|print', 'Side blade'], ['collar', 'Collar / neck band'], ['part:leftCuff', 'Left cuff / armhole band'], ['part:rightCuff', 'Right cuff / armhole band'],
  ['trim', 'Trim'], ['accent', 'Accent'], ['waistband', 'Waistband'], ['part:hem', 'Hem band'], ['part:yoke', 'Yoke'], ['inside', 'Inside'],
];
const nameOf = (key) => AREA_NAMES.find(([k]) => k === key)?.[1] ?? key.replace(/^(plain:)?(zone|area|part):/, '').replace(/\|.*/, '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const MIRROR_KEY = (k) => k.replace(/left(Sleeve|Cuff)/, 'TMP$1').replace(/right(Sleeve|Cuff)/, 'left$1').replace(/TMP(Sleeve|Cuff)/, 'right$1');
const PAINT_COLOURS = ['#d9d4c7', '#e4572e', '#29a8ab', '#f3a712', '#6a4c93', '#2e86de', '#8ac926', '#ff595e', '#1982c4', '#ffca3a', '#6d6875', '#00b894', '#fd79a8', '#636e72', '#a29bfe', '#fab1a0'];
const NOT_OFFERED = new Set(['basketball-shorts', 'netball-dress', 'rugby-shorts']); // accepted and final (AGENT-RULES 5)
const SPECIAL_FLAGS = { bballSinglet: 'basketball-singlet', netballBib: 'netball-bib', rlSocks: 'rugby-socks' };

/** The ready-made models a tile shows (its look's model flags; a wide model on its garment). */
function modelsOfTile(t) {
  const zc = t.design?.zoneColors ?? {}, out = [];
  for (const [f, m] of Object.entries(SPECIAL_FLAGS)) if (typeof zc[f] === 'string') out.push(m);
  for (const [name, m] of Object.entries(RECIPE_MODELS)) if (typeof zc[m.flag] === 'string' || (m.flag === 'rugbyJersey' && typeof zc.fbJersey === 'string')) out.push(name);
  if (!out.length) for (const [name, m] of Object.entries(RECIPE_MODELS)) if (m.wide && m.part === t.garment && !(m.except ?? []).some((f) => typeof zc[f] === 'string')) out.push(name);
  return [...new Set(out)].filter((m) => !NOT_OFFERED.has(m));
}

// ---------- the page
document.body.innerHTML = `
<aside id="side">
  <h1>Model Painter <small>admin</small></h1>
  <label>Sport<select id="sport"></select></label>
  <label>Tile<select id="tile"></select></label>
  <label>Model<select id="model"></select></label>
  <p id="share" class="note"></p>
  <h2>Area</h2><div id="areas"></div>
  <div class="row"><select id="addArea"></select><button id="addBtn" title="Add this area to the model">Add</button></div>
  <h2>Tool</h2>
  <div class="tools" id="tools">
    <button data-tool="move" title="Turn the model (also: right mouse button, any tool)">Turn</button>
    <button data-tool="brush" class="on">Brush</button>
    <button data-tool="line" title="Click the start, then the end: a straight band">Line</button>
    <button data-tool="lasso" title="Click points round an outline (or drag freehand); close on the first point or double-click; then Fill">Outline</button>
    <button data-tool="fill" title="Click inside a closed outline: the whole area there takes the picked area">Fill</button>
    <button data-tool="erase" title="Paint the model's own Tripo areas back">Eraser</button>
  </div>
  <label>Width <b id="wv"></b><input id="width" type="range" min="0" max="1000" value="380"></label>
  <label class="check"><input id="mirror" type="checkbox" checked> Mirror left / right</label>
  <div class="row" id="lassoRow" hidden><button id="lassoFill" class="primary">Fill outline</button><button id="lassoCancel">Cancel</button></div>
  <div class="row"><button id="undo" title="Ctrl+Z">Undo</button><button id="redo" title="Ctrl+Y">Redo</button></div>
  <h2>Preview</h2>
  <div class="tools" id="looks"></div>
  <label class="check"><input id="edges" type="checkbox"> Show area edges</label>
  <button id="real">Check in the real viewer</button>
  <h2>Save</h2>
  <p id="status" class="note"></p>
  <button id="save" class="primary">Save map for this tile</button>
  <button id="copy">Copy this map to other tiles…</button>
  <button id="reset">Start again from the Tripo areas</button>
  <button id="remove">Remove the saved map (back to Tripo areas)</button>
</aside>
<main id="stage"><canvas id="c"></canvas><canvas id="over"></canvas>
  <div id="views"><button data-view="front">Front</button><button data-view="back">Back</button><button data-view="left">Left</button><button data-view="right">Right</button><button data-view="top">Top</button></div>
  <div id="busy" hidden>Loading…</div>
  <div id="realBox" hidden><div class="bar"><span>Real viewer, with this map</span><button data-rv="Front">Front</button><button data-rv="Back">Back</button><button id="realClose">Close</button></div><iframe id="realFrame"></iframe></div>
  <dialog id="copyDlg"><form method="dialog"><h3>Copy this map to</h3><div id="copyList"></div><menu><button value="cancel">Cancel</button><button id="copyGo" value="ok" class="primary">Copy</button></menu></form></dialog>
</main>`;

// ---------- 3D
const canvas = $('#c'), over = $('#over'), octx = over.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1b1f24');
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false; controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.addEventListener('change', () => { depthDirty = true; draw(); });
const PAL = 16;
const material = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: { pal: { value: Array.from({ length: PAL }, () => new THREE.Color()) }, edges: { value: 0 } },
  vertexShader: `attribute vec3 piece; varying vec3 vP; varying vec3 vN; varying vec3 vV;
    void main() { vP = piece; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 pal[${PAL}]; uniform float edges; varying vec3 vP; varying vec3 vN; varying vec3 vV;
    void main() {
      int a = int(vP.x + 0.5), b = int(vP.y + 0.5);
      float w = max(fwidth(vP.z), 1e-4), side = a == b ? 1.0 : clamp(0.5 + vP.z / w, 0.0, 1.0);
      vec3 col = mix(pal[min(b, ${PAL - 1})], pal[min(a, ${PAL - 1})], side);
      if (edges > 0.5 && a != b) col = mix(col, vec3(0.05), 1.0 - smoothstep(0.6, 1.6, abs(vP.z) / w));
      vec3 n = normalize(vN), v = normalize(vV); if (!gl_FrontFacing) n = -n;
      float l = 0.38 + 0.62 * max(dot(n, normalize(v + vec3(0.25, 0.5, 0.0))), 0.0);
      gl_FragColor = vec4(col * (gl_FrontFacing ? l : l * 0.55), 1.0);
    }`,
});
// (a depth pass for "what the camera sees": the view distance packed in 24 bits; 0xffffff nothing)
const depthMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: 'varying float vZ; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }',
  fragmentShader: `varying float vZ; void main() { float d = clamp(vZ / 20.0, 0.0, 0.99999); float x = floor(d * 16777215.0);
    gl_FragColor = vec4(floor(x / 65536.0) / 255.0, mod(floor(x / 256.0), 256.0) / 255.0, mod(x, 256.0) / 255.0, 1.0); }`,
});
let mesh = null, M = null, map = null, model = null, tile = null, sport = null, look = 'areas', tool = 'brush';
let geo = null, pieceAttr = null, depth = null, depthDirty = true, dirty = false;

function size() {
  const r = $('#stage').getBoundingClientRect();
  renderer.setSize(r.width, r.height, false); canvas.style.width = over.style.width = r.width + 'px'; canvas.style.height = over.style.height = r.height + 'px';
  over.width = r.width; over.height = r.height;
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); depthDirty = true; draw();
}
addEventListener('resize', size);
let drawQueued = false;
function draw() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; renderer.render(scene, camera); overlay(); }); }

// ---------- the mesh: one triangle soup, each corner's piece (the triangle's own line where the map gives one)
function buildMesh() {
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
  const { T, idx, pos, nor } = M, P = new Float32Array(T * 9), N = new Float32Array(T * 9);
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const v = idx[t * 3 + k]; for (let c = 0; c < 3; c++) { P[t * 9 + k * 3 + c] = pos[v * 3 + c]; N[t * 9 + k * 3 + c] = nor[v * 3 + c]; } }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  pieceAttr = new THREE.BufferAttribute(new Float32Array(T * 9), 3); geo.setAttribute('piece', pieceAttr);
  geo.computeBoundingSphere();
  mesh = new THREE.Mesh(geo, material); scene.add(mesh);
  refresh();
}
/** The map's current areas onto the mesh (the same output the viewer gets). */
function refresh() {
  const out = map.output(), pc = out._piece, tri = out._tri, A = pieceAttr.array, { T, idx } = M;
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const v = idx[t * 3 + k], o = t * 9 + k * 3; A[o] = pc[v * 3]; A[o + 1] = pc[v * 3 + 1]; A[o + 2] = (pc[v * 3 + 2] - 128) * 0.4; }
  for (let e = 0; e + 7 < tri.length; e += 8) { const t = tri[e] | (tri[e + 1] << 8) | (tri[e + 2] << 16); for (let k = 0; k < 3; k++) { const o = t * 9 + k * 3; A[o] = tri[e + 3]; A[o + 1] = tri[e + 4]; A[o + 2] = (tri[e + 5 + k] - 128) * 0.4; } }
  pieceAttr.needsUpdate = true; colours(); draw();
}
let refreshQueued = false;
const refreshSoon = () => { if (refreshQueued) return; refreshQueued = true; requestAnimationFrame(() => { refreshQueued = false; refresh(); }); };

// ---------- preview colours: paint colours, or a kit's
const KITS = [
  ['areas', 'Area colours'], ['tile', "Tile's colours"], ['rw', 'Red / white'], ['navy', 'Navy / gold / sky'], ['black', 'Black / cyan / pink'], ['green', 'Green / yellow / white'],
];
const KIT_COLOURS = { rw: ['#d7263d', '#ffffff', '#ffffff'], navy: ['#14213d', '#fca311', '#7cc6fe'], black: ['#111111', '#00e5ff', '#ff4fa3'], green: ['#0b6e4f', '#ffd400', '#ffffff'] };
function kitColourFor(key, [main, second, acc]) {
  if (!key) return main;
  if (key === 'lip') return main; if (key === 'inside') return new THREE.Color(main).multiplyScalar(0.9).getStyle();
  const chain = key.replace(/^plain:/, '').split('@')[0].split('|');
  if (/^#[0-9a-f]{6}$/i.test(key)) return key;
  if (key.includes('Sleeve')) return acc;
  if (key === 'area:sides' || key.includes('sideBlade') || key.includes('accent') || key === 'accent') return key.includes('sideBlade') ? main : acc;
  for (const c of chain.slice(1)) { if (c === 'main') return main; if (c === 'secondary' || c === 'trim') return second; if (c === 'accent') return acc; if (/^#[0-9a-f]{6}$/i.test(c)) return c; }
  return second;
}
function colours() {
  const pal = material.uniforms.pal.value, keys = map?.keys ?? [];
  const kit = look === 'tile' ? [tile?.design?.main ?? '#ffffff', tile?.design?.secondary ?? '#222222', tile?.design?.accent ?? '#888888'] : KIT_COLOURS[look];
  for (let i = 0; i < PAL; i++) pal[i].set(look === 'areas' || !kit ? PAINT_COLOURS[i] : kitColourFor(i ? keys[i - 1] : '', kit));
  material.uniforms.edges.value = $('#edges').checked ? 1 : 0;
}

// ---------- what the camera sees (depth), and a screen point on the model
function readDepth() {
  if (!depthDirty && depth) return depth;
  const w = renderer.domElement.width, h = renderer.domElement.height;
  const rt = new THREE.WebGLRenderTarget(w, h);
  const bg = scene.background; scene.background = new THREE.Color(1, 1, 1); scene.overrideMaterial = depthMat;
  renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
  scene.overrideMaterial = null; scene.background = bg;
  const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px); rt.dispose();
  const z = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const x = px[i * 4] * 65536 + px[i * 4 + 1] * 256 + px[i * 4 + 2]; z[i] = x >= 16777000 ? Infinity : (x / 16777215) * 20; }
  depth = { w, h, z, sx: w / over.width, sy: h / over.height };
  depthDirty = false; draw();
  return depth;
}
const tmp = new THREE.Vector3();
/** A model point's place on the screen (css px) and its distance along the view; null behind the camera. */
function toScreen(x, y, z) {
  tmp.set(x, y, z).applyMatrix4(camera.matrixWorldInverse); const vz = -tmp.z; if (vz <= 0) return null;
  tmp.applyMatrix4(camera.projectionMatrix);
  return [(tmp.x * 0.5 + 0.5) * over.width, (0.5 - tmp.y * 0.5) * over.height, vz];
}
/** The mirrored side (its own cloth is out of view): only whether the mirrored point faces the camera, as its partner does. */
function facing(x, y, z, nx, ny, nz) { const cp = camera.position; return (cp.x - x) * nx + (cp.y - y) * ny + (cp.z - z) * nz > 0; }
/** Whether a point (with its normal) is seen: facing the camera and not behind other cloth. */
function seen(x, y, z, nx, ny, nz, slack = 0.004) {
  const cp = camera.position; if ((cp.x - x) * nx + (cp.y - y) * ny + (cp.z - z) * nz < 0) return false;
  const s = toScreen(x, y, z); if (!s) return false;
  const D = depth, px = Math.round(s[0] * D.sx), py = D.h - 1 - Math.round(s[1] * D.sy);
  let m = Infinity;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const X = px + a, Y = py + b; if (X >= 0 && Y >= 0 && X < D.w && Y < D.h) m = Math.min(m, D.z[Y * D.w + X]); }
  return s[2] <= m + slack + s[2] * 0.003;
}
/** The model point under a screen point (css px), from the depth pass; null off the model. */
function pick(cx, cy) {
  const D = readDepth(), px = Math.round(cx * D.sx), py = D.h - 1 - Math.round(cy * D.sy);
  if (px < 0 || py < 0 || px >= D.w || py >= D.h) return null;
  const vz = D.z[py * D.w + px]; if (!isFinite(vz)) return null;
  const ndc = new THREE.Vector3((cx / over.width) * 2 - 1, 1 - (cy / over.height) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  return camera.position.clone().addScaledVector(ndc, vz / ndc.dot(fwd));
}
const worldPerPx = (vz) => (2 * vz * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / over.height;

// ---------- painting
const widthMm = () => { const t = +$('#width').value / 1000; return Math.round(2 * Math.pow(400 / 2, t) * 10) / 10; }; // 2 mm .. 400 mm
const showWidth = () => { $('#wv').textContent = `${widthMm()} mm`; };
let area = 0; // the picked area's number (0 the body)
const mirrorOn = () => $('#mirror').checked;
const mirrorLabel = (L) => { if (L <= 0) return L; const k = map.keys[L - 1], m = MIRROR_KEY(k); return m === k ? L : map.keyIndex(m); };

/** A shape op from a distance function f(x, y, z, nx, ny, nz) -> mm (+ inside, -Infinity unseen): every point near it. */
function shapeOp(label, f, box) {
  const { n, pos, nor } = M, idx = [], s = [];
  const each = (mx, ml) => {
    for (let i = 0; i < n; i++) {
      const x = mx * pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (box && (x < box[0] || y < box[1] || z < box[2] || x > box[3] || y > box[4] || z > box[5])) continue;
      const d = f(x, y, z, mx * nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2], mx < 0);
      if (d > -MAXD) { idx.push(i); s.push(d); }
    }
    return { type: 'shape', label: ml, idx: Int32Array.from(idx.splice(0)), s: Float32Array.from(s.splice(0)) };
  };
  const ops = [each(1, label)];
  if (mirrorOn()) ops.push(each(-1, label < 0 ? label : mirrorLabel(label)));
  return ops;
}
/** A stroke's distance: within half the width of its path (3D), on cloth the camera sees. */
function strokeField(pts, r) {
  return (x, y, z, nx, ny, nz, mirrored) => {
    let best = Infinity;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[Math.min(k + 1, pts.length - 1)];
      const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, L2 = ex * ex + ey * ey + ez * ez;
      let t = L2 ? ((x - a.x) * ex + (y - a.y) * ey + (z - a.z) * ez) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const dx = x - a.x - ex * t, dy = y - a.y - ey * t, dz = z - a.z - ez * t, d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
    const mm = r - Math.sqrt(best) * 1000;
    if (mm <= -MAXD) return -Infinity;
    return (mirrored ? facing(x, y, z, nx, ny, nz) : seen(x, y, z, nx, ny, nz)) ? mm : -Infinity;
  };
}
const boxOf = (pts, pad) => { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const p of pts) { b[0] = Math.min(b[0], p.x); b[1] = Math.min(b[1], p.y); b[2] = Math.min(b[2], p.z); b[3] = Math.max(b[3], p.x); b[4] = Math.max(b[4], p.y); b[5] = Math.max(b[5], p.z); } const m = [b[0] - pad, b[1] - pad, b[2] - pad, b[3] + pad, b[4] + pad, b[5] + pad]; return m; };
const mirrorBox = (b) => b && [Math.min(b[0], -b[3]), b[1], b[2], Math.max(b[3], -b[0]), b[4], b[5]];

// a brush stroke in progress: applied on the state as it was when it began (so it is one undo step). Each point's nearest
// distance to the path so far is kept (own side and mirrored), so a new bit of path only looks at the points near it.
let stroke = null;
function strokeBegin(label, p) {
  const n = M.n;
  stroke = { label, pts: [p], snap: map.snapshot(), best: new Float32Array(n).fill(Infinity), bestM: mirrorOn() ? new Float32Array(n).fill(Infinity) : null, vis: new Int8Array(n).fill(-1), visM: new Int8Array(n).fill(-1), ops: [] };
  strokeSegment(p, p);
}
function strokeSegment(a, b) {
  const { n, pos, nor } = M, r = widthMm() / 2000, reach = r + MAXD / 1000;
  const lo = [Math.min(a.x, b.x) - reach, Math.min(a.y, b.y) - reach, Math.min(a.z, b.z) - reach], hi = [Math.max(a.x, b.x) + reach, Math.max(a.y, b.y) + reach, Math.max(a.z, b.z) + reach];
  const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, L2 = ex * ex + ey * ey + ez * ez;
  const run = (mx, best, vis) => {
    for (let i = 0; i < n; i++) {
      const x = mx * pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (x < lo[0] || y < lo[1] || z < lo[2] || x > hi[0] || y > hi[1] || z > hi[2]) continue;
      let t = L2 ? ((x - a.x) * ex + (y - a.y) * ey + (z - a.z) * ez) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const d = (x - a.x - ex * t) ** 2 + (y - a.y - ey * t) ** 2 + (z - a.z - ez * t) ** 2;
      if (d >= best[i]) continue;
      if (vis[i] < 0) vis[i] = (mx < 0 ? facing(x, y, z, -nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) : seen(x, y, z, nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2])) ? 1 : 0;
      if (vis[i]) best[i] = d;
    }
  };
  run(1, stroke.best, stroke.vis);
  if (stroke.bestM) run(-1, stroke.bestM, stroke.visM);
  strokeApply();
}
function strokeApply() {
  const r = widthMm() / 2, mk = (best, label) => {
    const idx = [], s = [];
    for (let i = 0; i < best.length; i++) if (best[i] < Infinity) { const mm = r - Math.sqrt(best[i]) * 1000; if (mm > -MAXD) { idx.push(i); s.push(mm); } }
    return { type: 'shape', label, idx: Int32Array.from(idx), s: Float32Array.from(s) };
  };
  stroke.ops = [mk(stroke.best, stroke.label)];
  if (stroke.bestM) stroke.ops.push(mk(stroke.bestM, stroke.label < 0 ? stroke.label : mirrorLabel(stroke.label)));
  map.restore(stroke.snap); for (const op of stroke.ops) map.applyOp(op);
  refreshSoon();
}
// the line tool's start; the outline's points (css px)
let lineStart = null, lasso = null, hover = null;

function overlay() {
  octx.clearRect(0, 0, over.width, over.height);
  octx.lineWidth = 1.5;
  if (lineStart && hover) { octx.strokeStyle = '#ffffff'; octx.setLineDash([6, 4]); octx.beginPath(); octx.moveTo(lineStart.sx, lineStart.sy); octx.lineTo(hover[0], hover[1]); octx.stroke(); octx.setLineDash([]); }
  if (lasso?.pts.length) {
    octx.strokeStyle = '#ffffff'; octx.fillStyle = 'rgba(255,255,255,0.12)'; octx.setLineDash(lasso.closed ? [5, 4] : []);
    octx.beginPath(); lasso.pts.forEach(([x, y], k) => (k ? octx.lineTo(x, y) : octx.moveTo(x, y)));
    if (lasso.closed) { octx.closePath(); octx.fill(); } else if (hover) octx.lineTo(hover[0], hover[1]);
    octx.stroke(); octx.setLineDash([]);
    if (!lasso.closed) { octx.fillStyle = '#ffffff'; octx.beginPath(); octx.arc(lasso.pts[0][0], lasso.pts[0][1], 5, 0, 7); octx.fill(); }
  }
  if (hover && (tool === 'brush' || tool === 'erase' || tool === 'line')) {
    const p = pick(hover[0], hover[1]);
    if (p) { const s = toScreen(p.x, p.y, p.z), rp = widthMm() / 2 / 1000 / worldPerPx(s[2]); octx.strokeStyle = 'rgba(255,255,255,0.8)'; octx.beginPath(); octx.arc(hover[0], hover[1], Math.max(2, rp), 0, 7); octx.stroke(); }
  }
}

/** The outline's distance (screen px -> mm at the point), + inside, on cloth the camera sees. */
function lassoField(poly) {
  return (x, y, z, nx, ny, nz, mirrored) => {
    const s = toScreen(x, y, z); if (!s) return -Infinity;
    const [px, py] = s; let inside = false, best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [bx, by] = poly[i];
      if ((ay > py) !== (by > py) && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
      const ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey; let t = L2 ? ((px - ax) * ex + (py - ay) * ey) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const d = (px - ax - ex * t) ** 2 + (py - ay - ey * t) ** 2; if (d < best) best = d;
    }
    const mm = Math.sqrt(best) * worldPerPx(s[2]) * 1000 * (inside ? 1 : -1);
    if (mm <= -MAXD) return -Infinity;
    return (mirrored ? facing(x, y, z, nx, ny, nz) : seen(x, y, z, nx, ny, nz, 0.006)) ? mm : -Infinity;
  };
}
function lassoFill() {
  if (!lasso?.closed || lasso.pts.length < 3) return;
  readDepth();
  const ops = shapeOp(area, lassoField(lasso.pts.map((p) => [...p])), null);
  for (const op of ops) map.push(op);
  lasso = null; $('#lassoRow').hidden = true; changed(); refresh();
}

function local(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (!map || e.button !== 0 || tool === 'move') return;
  const [cx, cy] = local(e);
  if (tool === 'lasso') {
    if (lasso?.closed) { lassoFill(); return; }
    lasso ??= { pts: [], closed: false, free: false, down: true };
    const f = lasso.pts[0];
    if (f && lasso.pts.length > 2 && Math.hypot(f[0] - cx, f[1] - cy) < 9) { lasso.closed = true; $('#lassoRow').hidden = false; draw(); return; }
    lasso.pts.push([cx, cy]); lasso.down = true; lasso.downAt = [cx, cy]; draw(); return;
  }
  const p = pick(cx, cy); if (!p) return;
  if (tool === 'fill') {
    const v = map.nearest(p.x, p.y, p.z); if (v < 0) return;
    const add = (v0, L) => { const region = map.region(v0); map.push({ type: 'fill', region, from: map.sh[v0], label: L }); };
    const vm = mirrorOn() ? map.nearest(-p.x, p.y, p.z) : -1;
    const fromM = vm >= 0 ? map.sh[vm] : -1, regionHasM = vm >= 0 && map.region(v).includes(vm);
    add(v, area);
    if (vm >= 0 && !regionHasM && map.sh[vm] === fromM && fromM !== mirrorLabel(area)) add(vm, mirrorLabel(area));
    changed(); refresh(); return;
  }
  if (tool === 'line') {
    if (!lineStart) { lineStart = { p, sx: cx, sy: cy }; draw(); return; }
    // the line on the cloth: the straight screen line between the clicks, read off the model
    const pts = [];
    for (let k = 0; k <= 160; k++) { const t = k / 160, q = pick(lineStart.sx + (cx - lineStart.sx) * t, lineStart.sy + (cy - lineStart.sy) * t); if (q) pts.push(q); }
    lineStart = null;
    if (pts.length) { const r = widthMm() / 2, b = boxOf(pts, r / 1000 + MAXD / 1000); for (const op of shapeOp(area, strokeField(pts, r), mirrorOn() ? mirrorBox(b) : b)) map.push(op); changed(); refresh(); }
    draw(); return;
  }
  // brush / eraser
  readDepth();
  strokeBegin(tool === 'erase' ? -1 : area, p);
});
canvas.addEventListener('pointermove', (e) => {
  hover = local(e);
  if (stroke) { const p = pick(...hover); const last = stroke.pts[stroke.pts.length - 1]; if (p && p.distanceTo(last) > Math.max(0.0015, widthMm() / 1000 / 8)) { stroke.pts.push(p); strokeSegment(last, p); } }
  if (lasso?.down && !lasso.closed && lasso.downAt && Math.hypot(hover[0] - lasso.downAt[0], hover[1] - lasso.downAt[1]) > 6) { lasso.free = true; const l = lasso.pts[lasso.pts.length - 1]; if (Math.hypot(hover[0] - l[0], hover[1] - l[1]) > 4) lasso.pts.push([...hover]); }
  draw();
});
canvas.addEventListener('pointerup', () => {
  if (stroke) { map.restore(stroke.snap); for (const op of stroke.ops) map.push(op); stroke = null; changed(); refresh(); }
  if (lasso?.down) { lasso.down = false; if (lasso.free && lasso.pts.length > 2) { lasso.closed = true; $('#lassoRow').hidden = false; } lasso.free = false; draw(); }
});
canvas.addEventListener('dblclick', () => { if (lasso && !lasso.closed && lasso.pts.length > 2) { lasso.closed = true; $('#lassoRow').hidden = false; draw(); } });
canvas.addEventListener('pointerleave', () => { hover = null; draw(); });

addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  if (e.key === 'Escape') { lineStart = null; lasso = null; $('#lassoRow').hidden = true; draw(); }
  if (e.key === 'Enter' && lasso?.closed) lassoFill();
});
function undo() { if (map?.undo()) { changed(); refresh(); } }
function redo() { if (map?.redo()) { changed(); refresh(); } }
$('#undo').onclick = undo; $('#redo').onclick = redo;
$('#lassoFill').onclick = lassoFill; $('#lassoCancel').onclick = () => { lasso = null; $('#lassoRow').hidden = true; draw(); };
$('#tools').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tool = b.dataset.tool; for (const x of $('#tools').children) x.classList.toggle('on', x === b); lineStart = null; if (tool !== 'lasso') { lasso = null; $('#lassoRow').hidden = true; } canvas.style.cursor = tool === 'move' ? 'grab' : 'crosshair'; controls.mouseButtons.LEFT = tool === 'move' ? THREE.MOUSE.ROTATE : null; draw(); };
$('#width').oninput = () => { showWidth(); draw(); }; showWidth();
$('#edges').onchange = () => { colours(); draw(); };
$('#views').onclick = (e) => { const v = e.target.dataset.view; if (v) setView(v); };
function setView(v) {
  const s = geo.boundingSphere, c = s.center, d = s.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
  const dir = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0], top: [0, 1, 0.0001] }[v];
  controls.target.copy(c); camera.position.set(c.x + dir[0] * d, c.y + dir[1] * d, c.z + dir[2] * d); camera.up.set(0, 1, 0); camera.lookAt(c); controls.update();
}

// ---------- areas list
function areasUI() {
  const box = $('#areas'); box.innerHTML = '';
  const items = [[0, '']].concat(map.keys.map((k, i) => [i + 1, k])).filter(([, k]) => k !== 'lip');
  for (const [L, k] of items) {
    const b = document.createElement('button'); b.className = 'area' + (L === area ? ' on' : '');
    b.innerHTML = `<i style="background:${PAINT_COLOURS[L] ?? '#999'}"></i>${nameOf(k)}<small>${k || 'print'}</small>`;
    b.onclick = () => { area = L; areasUI(); }; box.appendChild(b);
  }
  const add = $('#addArea'); add.innerHTML = '';
  for (const [k, nm] of AREA_NAMES) if (k && !map.keys.includes(k)) add.add(new Option(nm, k));
  $('#addBtn').disabled = map.keys.filter((k) => k).length >= 8;
  $('#addBtn').title = $('#addBtn').disabled ? 'A model can have at most 8 areas besides the body' : 'Add this area to the model';
}
$('#addBtn').onclick = () => { const k = $('#addArea').value; if (!k || map.keys.length >= 8) return; area = map.keyIndex(k); areasUI(); colours(); draw(); };
$('#looks').innerHTML = KITS.map(([id, nm]) => `<button data-look="${id}" class="${id === look ? 'on' : ''}">${nm}</button>`).join('');
$('#looks').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; look = b.dataset.look; for (const x of $('#looks').children) x.classList.toggle('on', x === b); colours(); draw(); };

// ---------- tiles, models, saved maps
const status = (t, bad = false) => { $('#status').textContent = t; $('#status').classList.toggle('bad', bad); };
const changed = () => { dirty = true; status('Not saved yet.'); };
let saved = {}; // key -> file
const keyOfTile = () => `${model}|${tile?.name ?? ''}`;
async function api(path, init = {}) {
  const r = await fetch(`${ctx.api}${path}`, { ...init, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(ctx.token ? { Authorization: `Bearer ${ctx.token}` } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `The server said ${r.status}.`);
  return j.data ?? j;
}
async function loadSaved() { try { saved = (await api('/admin/model-maps')).maps ?? {}; } catch (e) { saved = {}; status(e.message, true); } }
function tilesWith(m) { return ctx.tiles.filter((t) => t.models.includes(m)); }
function fillSports() {
  const sports = [...new Map(ctx.tiles.filter((t) => t.models.length).map((t) => [t.sport, t.sportName])).entries()];
  $('#sport').innerHTML = sports.map(([id, nm]) => `<option value="${id}">${nm}</option>`).join('');
}
function fillTiles() {
  const list = ctx.tiles.filter((t) => t.sport === $('#sport').value && t.models.length);
  $('#tile').innerHTML = list.map((t, i) => `<option value="${ctx.tiles.indexOf(t)}">${t.name}${t.models.some((m) => saved[`${m}|${t.name}`]) ? '  (map saved)' : ''}</option>`).join('');
}
function fillModels() {
  tile = ctx.tiles[+$('#tile').value];
  $('#model').innerHTML = (tile?.models ?? []).map((m) => `<option>${m}</option>`).join('');
}
async function pickModel() {
  if (dirty && !confirm('This map is not saved. Leave it?')) return false;
  tile = ctx.tiles[+$('#tile').value]; model = $('#model').value; sport = $('#sport').value;
  if (!model) return;
  $('#busy').hidden = false;
  try {
    const D = await loadModelData(model);
    M = decodeModel(D);
    let start = M.own, file = saved[keyOfTile()];
    if (file) { const j = await fetch(`${mapsBase()}${encodeURI(file)}`, { cache: 'no-cache' }).then((r) => r.json()).catch(() => null); if (j && j.count === M.n) start = j; }
    map = new AreaMap(M, start); area = 0; dirty = false;
    buildMesh(); setView('front'); areasUI(); colours();
    status(file ? 'Showing the saved map of this tile.' : "Showing the model's own Tripo areas (no map saved for this tile).");
    const others = ctx.tiles.filter((t) => t.name === tile.name && t.models.includes(model) && t.sport !== tile.sport).map((t) => t.sportName);
    $('#share').textContent = others.length ? `The map is kept per model and tile name, so it also shows on "${tile.name}" in: ${others.join(', ')}.` : '';
  } catch (e) { status(e.message, true); }
  $('#busy').hidden = true;
  return true;
}
const mapsBase = () => new URL(params.get('maps') ?? '../model-maps/', location.href).href;
function loadModelData(name) {
  if (window.TRIPO_MESHES?.[name]) return Promise.resolve(window.TRIPO_MESHES[name]);
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = `${VIEWER}tripo-${name}.js?v=${encodeURIComponent(ctx.viewerVersion ?? '')}`;
    s.onload = () => (window.TRIPO_MESHES?.[name] ? res(window.TRIPO_MESHES[name]) : rej(new Error(`The model ${name} did not load.`)));
    s.onerror = () => rej(new Error(`The model ${name} did not load.`)); document.head.appendChild(s);
  });
}
$('#sport').onchange = async () => { fillTiles(); fillModels(); await pickModel(); };
$('#tile').onchange = async () => { fillModels(); await pickModel(); };
$('#model').onchange = pickModel;

function mapData() {
  const o = map.output();
  return { model, count: M.n, partKeys: o.partKeys, piece: o.piece, pieceTri: o.pieceTri, triPart: o.triPart, areas: Object.fromEntries(o.partKeys.map((k) => [k, nameOf(k)])) };
}
$('#save').onclick = async () => {
  if (!map) return;
  status('Saving…');
  try { await api('/admin/model-maps', { method: 'PUT', body: JSON.stringify({ model, tile: tile.name, sport: tile.sport, data: mapData() }) }); dirty = false; await loadSaved(); const i = $('#tile').value; fillTiles(); $('#tile').value = i; status(`Saved for "${tile.name}". The live viewer uses it for designs from this tile.`); }
  catch (e) { status(e.message, true); }
};
$('#remove').onclick = async () => {
  if (!saved[keyOfTile()]) { status('This tile has no saved map.'); return; }
  if (!confirm(`Remove the saved map of "${tile.name}"? It goes back to the Tripo areas.`)) return;
  try { await api('/admin/model-maps', { method: 'DELETE', body: JSON.stringify({ model, tile: tile.name }) }); await loadSaved(); dirty = false; await pickModel(); status('Removed: this tile shows the Tripo areas again.'); } catch (e) { status(e.message, true); }
};
$('#reset').onclick = () => { if (!map || !confirm("Start again from the model's own Tripo areas? (Nothing is saved until you press Save.)")) return; map.resetTo(M.own); area = 0; areasUI(); changed(); refresh(); };
$('#copy').onclick = () => {
  if (!saved[keyOfTile()]) { status('Save this map first, then copy it.', true); return; }
  const names = [...new Set(tilesWith(model).map((t) => t.name))].filter((nm) => nm !== tile.name);
  $('#copyList').innerHTML = names.length ? names.map((nm) => `<label class="check"><input type="checkbox" value="${nm.replace(/"/g, '&quot;')}"> ${nm}${saved[`${model}|${nm}`] ? ' <small>(replaces its map)</small>' : ''}</label>`).join('') : '<p>No other tile uses this model.</p>';
  $('#copyDlg').showModal();
};
$('#copyGo').onclick = async () => {
  const to = [...$('#copyList').querySelectorAll('input:checked')].map((x) => x.value); if (!to.length) return;
  try { await api('/admin/model-maps/copy', { method: 'POST', body: JSON.stringify({ model, tile: tile.name, to }) }); await loadSaved(); status(`Copied to: ${to.join(', ')}.`); } catch (e) { status(e.message, true); }
};

// ---------- the real viewer, with this map (not saved), the tile's own design
$('#real').onclick = () => {
  if (!map) return;
  const f = $('#realFrame'); $('#realBox').hidden = false;
  const send = () => { const w = f.contentWindow; w.__modelPainterPreview = { model, data: { ...mapData(), id: `preview${Date.now()}` } }; w.viewer?.setDesign(tile.design); };
  f.onload = () => { const w = f.contentWindow; w.__modelPainterPreview = { model, data: { ...mapData(), id: 'preview' } }; };
  if (!f.src) { f.src = `${VIEWER}index.html?host=modelpainter&still&v=${encodeURIComponent(ctx.viewerVersion ?? '')}`; addEventListener('message', (e) => { try { const m = JSON.parse(e.data); if (m.host === 'modelpainter' && m.type === 'ready') send(); } catch { /* not ours */ } }); }
  else send();
};
$('#realBox').onclick = (e) => { const v = e.target.dataset.rv; if (v) $('#realFrame').contentWindow.viewer?.setView(v); };
$('#realClose').onclick = () => { $('#realBox').hidden = true; const f = $('#realFrame'); f.removeAttribute('src'); f.src = ''; f.removeAttribute('src'); };
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- start: the admin page sends the tiles and the sign-in
async function start(c) {
  ctx = c;
  for (const t of ctx.tiles) t.models = modelsOfTile(t);
  await loadSaved(); fillSports(); fillTiles(); fillModels(); size(); await pickModel();
}
addEventListener('message', (e) => { if (e.origin !== location.origin) return; let m = e.data; if (typeof m === 'string') { try { m = JSON.parse(m); } catch { return; } } if (m?.type === 'modelpainter-init' && !ctx) start(m); });
if (window.parent !== window) window.parent.postMessage(JSON.stringify({ type: 'modelpainter-hello' }), location.origin);
window.__painter = { get map() { return map; }, setView, get M() { return M; }, refresh, pick, readDepth, toScreen, get model() { return model; } };
size();
