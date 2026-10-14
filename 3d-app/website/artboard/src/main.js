// 3DEEZI Artboard: a CorelDRAW-style vector editor for logos, badges and
// kit graphics, built on Fabric.js. Everything drawn is vector: shapes and
// text convert to curves (Ctrl+Q) and every curve has editable nodes (F10).
// One self-contained page shared by the React website (iframe) and the
// Flutter apps (WebView). "Send to 3D Studio" puts the artwork on the kit.
//
// Host bridge (same shape as the 3D viewer):
//   host -> artboard: window.artboard.receive({cmd, arg})
//     setAssets [{name, src}]   addImage {src, name}   load <json>   clear
//   artboard -> host: {type:'ready'} {type:'artwork', data, name}
//     {type:'saved', json} {type:'export', data, name}

import {
  Canvas, Rect, Ellipse, Path, IText, FabricImage, PencilBrush,
  ActiveSelection, Group, Gradient, Pattern, Point, Shadow, util, loadSVGFromString,
} from 'fabric';
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { ICONS } from './icons.js';
import { FONTS } from './fonts.mjs';
import * as V from './vector.js';
import { createNodeEditor } from './nodes.js';
import { createGuides } from './guides.js';
import * as B from './bitmaps.js';

// ===================================================================
// Setup
// ===================================================================
const params = new URLSearchParams(location.search);
const HOST = params.get('host');
const STORE = `3deezi.artboard.${HOST || 'web'}`;
const MM = 2;                       // world units per millimetre
const BRAND = ['#12E1F0', '#1E7BFF', '#7B4DFF', '#E8EDF2', '#5D6B7B', '#000000'];
const ISO = { A5: [148, 210], A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841] };
const PAGES = { '500 x 400 mm': [500, 400] };
for (const [k, [w, h]] of Object.entries(ISO)) { PAGES[`${k} portrait`] = [w, h]; PAGES[`${k} landscape`] = [h, w]; }
Object.assign(PAGES, { '300 x 300 mm': [300, 300], 'Chest logo 120 x 120 mm': [120, 120], 'Custom size': null });
// Document units: the rulers, X / Y / W / H, page size and dimensions use them
// (pixels at the 300 DPI export resolution). Tool settings stay in mm, as labelled.
const UNITS = { mm: { mm: 1, dp: 1, name: 'mm' }, cm: { mm: 10, dp: 2, name: 'cm' }, in: { mm: 25.4, dp: 3, name: 'in' }, px: { mm: 25.4 / 300, dp: 0, name: 'px' } };
const unit = () => UNITS[state.units] ?? UNITS.mm;
/** A world length as text in the document units. */
const inUnits = (world) => (world / MM / unit().mm).toFixed(unit().dp);
/** A number typed in the document units, as a world length. */
const fromUnits = (v) => Number(v) * unit().mm * MM;
const $ = (id) => document.getElementById(id);
const icon = (name) => `<svg class="i" viewBox="0 0 24 24">${ICONS[name] ?? ''}</svg>`;
const isText = (o) => ['i-text', 'text', 'textbox'].includes(o?.type);

// Embedded fonts: one copy, used by the canvas (FontFace) and Convert to curves (opentype.js).
const fontLoads = [];
for (const f of FONTS) for (const [file, range] of f.faces) {
  const b64 = window.__ABFONTS?.[file];
  if (!b64) continue;
  const face = new FontFace(f.family, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, { weight: range ?? '1 1000' });
  document.fonts.add(face);
  fontLoads.push(face.load().catch(() => null));
}

const post = (msg) => {
  const text = JSON.stringify({ ...msg, host: HOST });
  if (window.Artboard) window.Artboard.postMessage(text);
  else if (window.parent !== window) window.parent.postMessage(text, '*');
};
const embedded = () => !!window.Artboard || window.parent !== window;

document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));

const wrap = $('canvasWrap');
const canvas = new Canvas($('board'), {
  preserveObjectStacking: true,
  backgroundColor: '#0b1520',
  selectionColor: 'rgba(18,225,240,0.12)',
  selectionBorderColor: '#12E1F0',
  selectionLineWidth: 1.2,
  fireRightClick: false,
  stopContextMenu: true,
  enableRetinaScaling: true,
});
const handleStyle = { borderColor: '#1E7BFF', cornerColor: '#ffffff', cornerStrokeColor: '#1E7BFF', cornerStyle: 'rect', cornerSize: 9, transparentCorners: false, borderScaleFactor: 1.2, padding: 2 };

let pageSize = [500, 400];
const page = new Rect({ left: 0, top: 0, width: pageSize[0] * MM, height: pageSize[1] * MM, fill: '#ffffff', selectable: false, evented: false, excludeFromExport: true, hoverCursor: 'default', shadow: { color: 'rgba(0,0,0,.55)', blur: 30, offsetX: 0, offsetY: 8 } });
page.isPage = true;
canvas.add(page);

const state = {
  tool: 'select', fill: '#12E1F0', stroke: '#000000', strokeWidth: 0, dash: 'solid', opacity: 1, target: 'fill', snap: true, grid: false, recent: [], saved: [], gradient: null, pattern: null, units: 'mm',
  // What Snap snaps to (the Snap tick-box in the status bar switches snapping on and off).
  snapTo: { grid: true, guides: true, objects: true, nodes: true, page: true },
  // Text settings: used for the next text, and edited from the text bar.
  text: { fontFamily: 'Rajdhani', fontWeight: 700, fontStyle: 'normal', underline: false, textAlign: 'center', fontSize: 40 },
  // Tool settings from the context property bars.
  shape: { sides: 6, points: 5, sharp: 53, cpoints: 9, csharp: 2, revs: 4, log: false, expand: 50, cols: 4, rows: 3, set: 'basic', item: 'triangle', radius: 8, eraser: 6, tRows: 4, tCols: 3 },
  fx: {
    blendSteps: 8, contourDir: 'outside', contourSteps: 1, contourOffset: 3, contourColour: '#000000', shadowX: 2, shadowY: 2, shadowBlur: 4, shadowColour: '#000000', shadowOpacity: 50, transp: 'uniform', transpValue: 50, transpAngle: 0,
    distort: 'zipper', zipSize: 2, zipTeeth: 30, twist: 90, push: 40, envelope: 'arcUp', envAmount: 20,
    extX: 6, extY: 6, extColour: '#1E7BFF', blockX: 3, blockY: 3, blockColour: '#000000', meshSize: 40, meshStrength: 85,
  },
};
try { const p = JSON.parse(localStorage.getItem(`${STORE}.prefs`) || '{}'); Object.assign(state, { ...p, shape: { ...state.shape, ...p.shape }, fx: { ...state.fx, ...p.fx }, snapTo: { ...state.snapTo, ...p.snapTo } }); } catch { /* fresh */ }
const savePrefs = () => { try { localStorage.setItem(`${STORE}.prefs`, JSON.stringify({ recent: state.recent, saved: state.saved, snap: state.snap, snapTo: state.snapTo, grid: state.grid, units: state.units, shape: state.shape, fx: state.fx })); } catch { /* private mode */ } };

const toast = (text) => { const t = $('toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800); };
const hint = (text) => { const h = $('hint'); h.textContent = text || ''; h.classList.toggle('show', !!text); };

// ===================================================================
// Viewport: fit, zoom, pan, rulers, grid
// ===================================================================
function resize() {
  canvas.setDimensions({ width: wrap.clientWidth, height: wrap.clientHeight });
  drawRulers();
  // Resizing clears the canvas: draw it again straight away.
  canvas.renderAll();
}
function fit() {
  const pad = 40, w = wrap.clientWidth - pad * 2, h = wrap.clientHeight - pad * 2;
  const z = Math.min(w / page.width, h / page.height);
  canvas.setViewportTransform([z, 0, 0, z, (wrap.clientWidth - page.width * z) / 2, (wrap.clientHeight - page.height * z) / 2]);
  afterZoom();
}
function zoomAt(z, point) {
  z = Math.min(40, Math.max(0.05, z));
  canvas.zoomToPoint(point ?? new Point(wrap.clientWidth / 2, wrap.clientHeight / 2), z);
  afterZoom();
}
function afterZoom() {
  const pct = Math.round(canvas.getZoom() * 100 / baseZoom());
  $('zoomPct').value = String([25, 50, 75, 100, 150, 200, 400].includes(pct) ? pct : 'fit');
  $('zoomRange').value = String(Math.round(Math.log2(canvas.getZoom() / baseZoom()) * 100));
  $('zoomLabel').textContent = `${pct}%`;
  drawRulers();
  canvas.requestRenderAll();
}
/** Zoom at which the page is shown at "100%" (fits the window). */
const baseZoom = () => Math.min((wrap.clientWidth - 80) / page.width, (wrap.clientHeight - 80) / page.height);
const screenDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * canvas.getZoom();

canvas.on('mouse:wheel', (opt) => {
  const e = opt.e;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey || state.tool === 'zoom' || !e.shiftKey) {
    zoomAt(canvas.getZoom() * 0.999 ** e.deltaY, new Point(e.offsetX, e.offsetY));
  } else {
    const vpt = canvas.viewportTransform; vpt[4] -= e.deltaX || e.deltaY; canvas.setViewportTransform(vpt); drawRulers();
  }
});
// Pan: Pan tool (H), middle mouse, space + drag, or two fingers.
let panning = null, spaceDown = false;
const touches = new Map();
wrap.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (e.button === 1 || spaceDown || touches.size === 2 || (state.tool === 'pan' && e.button === 0)) {
    panning = { x: e.clientX, y: e.clientY, dist: touches.size === 2 ? pinchDist() : 0, zoom: canvas.getZoom() };
    canvas.selection = false;
    if (touches.size === 2) { canvas.discardActiveObject(); cancelDrag(); }
    e.preventDefault();
  }
}, true);
const pinchDist = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!panning) return;
  const vpt = canvas.viewportTransform;
  if (touches.size === 2) {
    const [a, b] = [...touches.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const r = wrap.getBoundingClientRect();
    zoomAt(panning.zoom * pinchDist() / panning.dist, new Point(mid.x - r.left, mid.y - r.top));
    vpt[4] += mid.x - panning.x; vpt[5] += mid.y - panning.y;
    panning.x = mid.x; panning.y = mid.y;
  } else {
    vpt[4] += e.clientX - panning.x; vpt[5] += e.clientY - panning.y;
    panning.x = e.clientX; panning.y = e.clientY;
  }
  canvas.setViewportTransform(vpt);
  drawRulers();
});
const endPan = (e) => { touches.delete(e.pointerId); if (panning && touches.size < 2) { panning = null; canvas.selection = PICK_LIKE.has(state.tool); } };
addEventListener('pointerup', endPan);
addEventListener('pointercancel', endPan);

function drawRulers() {
  for (const [id, horizontal] of [['rulerH', true], ['rulerV', false]]) {
    const c = $(id), r = c.getBoundingClientRect(), d = devicePixelRatio || 1;
    if (!r.width) continue;
    c.width = r.width * d; c.height = r.height * d;
    const g = c.getContext('2d');
    g.scale(d, d);
    g.fillStyle = '#0a141e'; g.fillRect(0, 0, r.width, r.height);
    g.strokeStyle = '#3a5568'; g.fillStyle = '#7f93a6'; g.font = '10px Inter, sans-serif';
    const z = canvas.getZoom(), off = horizontal ? canvas.viewportTransform[4] : canvas.viewportTransform[5];
    // Numbers in the document units, with labelled ticks at least 40 px apart.
    const pxPerUnit = z * MM * unit().mm;
    const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000].find((s) => s * pxPerUnit >= 40) ?? 25000;
    const len = horizontal ? r.width : r.height;
    const first = Math.floor(-off / pxPerUnit / step) * step * 5;
    for (let i = first / step; i * (step / 5) * pxPerUnit + off < len; i++) {
      const v = i * (step / 5), p = v * pxPerUnit + off, major = i % 5 === 0;
      g.beginPath();
      if (horizontal) { g.moveTo(p, 24); g.lineTo(p, major ? 10 : 18); } else { g.moveTo(24, p); g.lineTo(major ? 10 : 18, p); }
      g.stroke();
      if (major) {
        const label = String(+v.toFixed(2));
        if (horizontal) g.fillText(label, p + 3, 10);
        else { g.save(); g.translate(10, p - 3); g.rotate(-Math.PI / 2); g.fillText(label, 0, 0); g.restore(); }
      }
    }
  }
}
const GRID = 5 * MM;  // grid step: Snap to grid and the drawn grid
let exporting = false;  // exports must not include the grid, guidelines or tool overlays
// Optional grid: drawn as part of the white page, so it sits on the page and under the
// artwork, and can't be clicked. 5 mm steps (what Snap to grid uses), stronger every 10 mm.
page.objectCaching = false;
const renderPage = page._render.bind(page);
page._render = (ctx) => {
  renderPage(ctx);
  if (!state.grid || exporting) return;
  const z = canvas.getZoom(), w = page.width, h = page.height, fine = GRID * z >= 4;
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1 / z;
  ctx.translate(-w / 2, -h / 2);
  for (const [vertical, len, across] of [[true, w, h], [false, h, w]]) {
    for (let i = 0, v = 0; v <= len + 0.01; i++, v += GRID) {
      if (i % 2 && !fine) continue;
      ctx.strokeStyle = i % 2 ? 'rgba(20,40,60,.10)' : 'rgba(20,40,60,.22)';
      ctx.beginPath();
      if (vertical) { ctx.moveTo(v, 0); ctx.lineTo(v, across); } else { ctx.moveTo(0, v); ctx.lineTo(across, v); }
      ctx.stroke();
    }
  }
  ctx.restore();
};

// ===================================================================
// Objects: styling, naming, snapping, replacing
// ===================================================================
const userObjects = () => canvas.getObjects().filter((o) => !o.isPage && !o.isHelper);
let counter = 0;
function style(o, extra = {}) {
  o.set({ ...handleStyle, ...extra });
  o.name ??= `${o.toolName || o.type} ${++counter}`;
  return o;
}
function strokeDash(width) {
  return state.dash === 'dashed' ? [width * 4, width * 3] : state.dash === 'dotted' ? [width, width * 2] : null;
}
function paint(o) {
  const w = state.strokeWidth * MM;
  o.set({ fill: state.fill, stroke: w ? state.stroke : null, strokeWidth: w, strokeDashArray: w ? strokeDash(w) : null, opacity: state.opacity, strokeUniform: true });
  if (state.gradient) { o.gradSpec = { ...state.gradient }; o.set('fill', gradientFor(o)); }
  else if (state.pattern) { o.patSpec = { ...state.pattern, ink: state.fill }; o.set('fill', patternFor(o.patSpec)); }
  return o;
}
/** Two-colour sportswear prints (stripes, hoops, dots …) as a repeating tile. */
const PATTERNS = {
  stripes: (g, s) => g.fillRect(0, 0, s / 2, s),
  hoops: (g, s) => g.fillRect(0, 0, s, s / 2),
  diagonal: (g, s) => { g.beginPath(); for (const o of [-s, 0, s]) { g.moveTo(o, s); g.lineTo(o + s / 2, s); g.lineTo(o + s * 1.5, 0); g.lineTo(o + s, 0); g.closePath(); } g.fill(); },
  dots: (g, s) => { g.beginPath(); g.arc(s / 2, s / 2, s / 4, 0, Math.PI * 2); g.fill(); },
  checks: (g, s) => { g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2); },
  chevron: (g, s) => { g.beginPath(); g.moveTo(0, s * 0.25); g.lineTo(s / 2, s * 0.75); g.lineTo(s, s * 0.25); g.lineTo(s, s * 0.55); g.lineTo(s / 2, s * 1.05); g.lineTo(0, s * 0.55); g.closePath(); g.fill(); },
};
function patternFor({ kind = 'stripes', size = 10, bg = '#FFFFFF', ink = '#000000' }) {
  const s = Math.max(4, Math.round(size * MM)), tile = document.createElement('canvas');
  tile.width = tile.height = s;
  const g = tile.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, s, s);
  g.fillStyle = ink; (PATTERNS[kind] ?? PATTERNS.stripes)(g, s);
  return new Pattern({ source: tile, repeat: 'repeat' });
}
/** Open curves: an outline in the outline colour (or the fill colour when there's no outline). */
function paintLine(o) {
  o.set({ fill: null, stroke: state.strokeWidth ? state.stroke : state.fill, strokeWidth: Math.max(0.25, state.strokeWidth || 1.5) * MM, strokeDashArray: null, opacity: state.opacity, strokeUniform: true, strokeLineCap: 'round', strokeLineJoin: 'round' });
  return o;
}
function gradientFor(o, spec = o.gradSpec ?? state.gradient) {
  const { from, to, angle, type } = spec;
  const w = o.width || 100, h = o.height || 100;
  if (type === 'radial') return new Gradient({ type: 'radial', gradientUnits: 'pixels', coords: { x1: w / 2, y1: h / 2, r1: 0, x2: w / 2, y2: h / 2, r2: Math.max(w, h) / 2 }, colorStops: [{ offset: 0, color: from }, { offset: 1, color: to }] });
  const a = (angle * Math.PI) / 180;
  return new Gradient({ type: 'linear', gradientUnits: 'pixels', coords: { x1: w / 2 - (Math.sin(a) * w) / 2, y1: h / 2 - (Math.cos(a) * h) / 2, x2: w / 2 + (Math.sin(a) * w) / 2, y2: h / 2 + (Math.cos(a) * h) / 2 }, colorStops: [{ offset: 0, color: from }, { offset: 1, color: to }] });
}
const refill = (o) => { if (o.gradSpec && o.fill && typeof o.fill === 'object') o.set('fill', gradientFor(o)); };
const STYLE_KEYS = ['fill', 'stroke', 'strokeWidth', 'strokeDashArray', 'strokeLineCap', 'strokeLineJoin', 'opacity', 'shadow', 'gradSpec', 'visible'];
function copyStyle(from, to) {
  for (const k of STYLE_KEYS) if (from[k] !== undefined) to[k] = from[k];
  to.strokeUniform = true;
  if (isText(from)) to.strokeWidth = from.stroke ? from.strokeWidth : 0;
  return to;
}
// Snap: to guidelines, the page and other objects when close, otherwise to a 5 mm grid.
canvas.on('object:moving', (e) => {
  if (!state.snap) return;
  const o = e.target, s = GRID, hit = guides.snapObject(o);
  if (!state.snapTo.grid) return;
  if (!hit.x) o.set('left', Math.round(o.left / s) * s);
  if (!hit.y) o.set('top', Math.round(o.top / s) * s);
});

// ===================================================================
// History (undo / redo) and autosave
// ===================================================================
const EXTRA = ['name', 'toolName', 'lockMovementX', 'lockMovementY', 'lockScalingX', 'lockScalingY', 'lockRotation', 'hasControls', 'selectable', 'gradSpec', 'patSpec', 'shapeSpec', 'powerClip', 'locked', 'fxSweep', 'fxPart', 'fxMesh', 'tableSpec', 'cell'];
let history = [], future = [], restoring = false, muted = 0, saveTimer = null;
const snapshot = () => JSON.stringify({ page: pageSize, guides: guides.get(), objects: userObjects().map((o) => o.toObject(EXTRA)) });
function record() {
  if (restoring || muted) return;
  const snap = snapshot();
  if (history.at(-1) === snap) return;
  history.push(snap);
  if (history.length > 80) history.shift();
  future = [];
  syncHistory();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, snap); } catch { /* too big for storage */ } }, 600);
}
/** Several canvas changes as one undo step. */
function batch(fn) {
  muted++;
  try { return fn(); } finally { muted--; if (!muted) { refreshLayers(); record(); } }
}
async function restore(snap) {
  restoring = true;
  nodes.end(); toolTargets = [];
  const data = JSON.parse(snap);
  for (const o of userObjects()) canvas.remove(o);
  setPage(data.page ?? pageSize, false);
  guides.set(data.guides);
  const objects = await util.enlivenObjects(data.objects ?? []);
  for (const o of objects) { pruneEmptyParts(o); style(o); canvas.add(o); }
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  restoring = false;
  applyToolFlags();
  refreshLayers();
  syncProps();
}
/** Older builds left empty paths at the page corner inside bent tables, stretching the selection box: drop them. */
function pruneEmptyParts(o) {
  if (o.type !== 'group') return;
  for (const k of o.getObjects()) { if (k.type === 'path' && k.path.length <= 1) o.remove(k); else pruneEmptyParts(k); }
}
function syncHistory() {
  $('undo').disabled = history.length < 2;
  $('redo').disabled = !future.length;
}
async function undo() { if (history.length < 2) return; future.push(history.pop()); await restore(history.at(-1)); syncHistory(); }
async function redo() { if (!future.length) return; const s = future.pop(); history.push(s); await restore(s); syncHistory(); }
for (const ev of ['object:added', 'object:removed', 'object:modified']) canvas.on(ev, () => { if (muted) return; refreshLayers(); record(); });

const guides = createGuides({
  canvas, wrap, rulerH: $('rulerH'), rulerV: $('rulerV'), page,
  objects: () => userObjects(),
  canEdit: () => state.tool === 'select',
  changed: () => record(),
  options: () => state.snapTo,
});

// ===================================================================
// Curves: convert, replace, world path data
// ===================================================================
function replaceObject(old, ...neu) {
  const i = canvas.getObjects().indexOf(old);
  canvas.remove(old);
  canvas.insertAt(Math.max(1, i), ...neu);
}
/** World-space path data of an object or group (empty for bitmaps). */
function worldD(o) {
  if (o.type === 'group' || o.type === 'activeselection') return o.getObjects().map(worldD).filter(Boolean).join(' ');
  if (!V.canConvert(o)) return '';
  return V.modelToD(V.objectModel(o));
}
function makePath(d, from, extra = {}) {
  const p = new Path(d || 'M 0 0');
  if (from) copyStyle(from, p);
  style(p, { toolName: 'Curve', ...extra });
  refill(p);
  return p;
}
/** Replace an object with its curves (CorelDRAW "Convert to curves"). Returns the Path. */
function toPathObject(o, { quiet = false } = {}) {
  if (o.type === 'path') return o;
  if (o.type === 'group') { if (!quiet) toast('Ungroup first (Ctrl+U) to edit the nodes of a group'); return null; }
  if (!V.canConvert(o)) { if (!quiet) toast('Bitmap images have no nodes. Use vector shapes or import an SVG.'); return null; }
  let d;
  try { d = V.modelToD(V.objectModel(o)); } catch (err) { toast(err.message); return null; }
  if (!d) { if (!quiet) toast('Nothing to convert: the text is empty'); return null; }
  const p = makePath(d, o);
  p.name = isText(o) ? `“${o.text.slice(0, 18)}” curves` : `${o.name} curves`;
  if (['line', 'polyline'].includes(o.type)) p.set('fill', null);
  batch(() => replaceObject(o, p));
  return p;
}
async function convertToCurves(objs = active()) {
  if (!objs.length) { toast('Select objects to convert to curves'); return; }
  canvas.discardActiveObject();
  const out = [];
  batch(() => {
    for (const o of objs) {
      if (o.type === 'group') {
        const kids = o.removeAll().filter((k) => !(isText(k) && !k.text.trim()));
        const conv = kids.map((k) => { canvas.add(k); return V.canConvert(k) ? toPathObject(k, { quiet: true }) ?? k : k; });
        for (const k of conv) canvas.remove(k);
        const g = style(new Group(conv), { toolName: 'Group' });
        g.name = o.name;
        replaceObject(o, g); out.push(g);
      } else { const p = toPathObject(o, { quiet: false }); if (p) out.push(p); }
    }
  });
  select(out);
  if (out.length) toast('Converted to curves: use the Shape tool (F10) to edit the nodes');
}
function select(objs) {
  objs = objs.filter((o) => canvas.getObjects().includes(o));
  if (!objs.length) { canvas.discardActiveObject(); canvas.requestRenderAll(); return; }
  canvas.setActiveObject(objs.length > 1 ? new ActiveSelection(objs, { canvas }) : objs[0]);
  canvas.requestRenderAll();
}
const byZ = (objs) => objs.slice().sort((a, b) => canvas.getObjects().indexOf(a) - canvas.getObjects().indexOf(b));
const shapeable = (o) => V.canConvert(o) || o.type === 'group';

// ===================================================================
// Shape tool (node editing) and sculpting brushes
// ===================================================================
const nodes = createNodeEditor({
  canvas,
  toast,
  toPath: (o) => { const p = toPathObject(o); if (p) delete p.shapeSpec; return p; },
  objectAt: (p) => objectAt(p),
  commit: (o) => { delete o.shapeSpec; canvas.fire('object:modified', { target: o }); },
  remove: (o) => canvas.remove(o),
  refill,
  extract: (o, d) => { const p = makePath(d, o); p.name = `${o.name} part`; batch(() => canvas.insertAt(canvas.getObjects().indexOf(o) + 1, p)); },
  changed: () => { syncContext(); syncProps(); },
});
/** Topmost visible, unlocked object under a page point. */
function objectAt(p) {
  const pt = new Point(p.x, p.y);
  return userObjects().slice().reverse().find((o) => o.visible && !o.locked && o.containsPoint(pt));
}

// ===================================================================
// Tools: CorelDRAW toolbox groups and flyouts
// ===================================================================
const TOOL_GROUPS = [
  ['pick', [['select', 'Pick', 'select', 'V']]],
  ['shape', [['node', 'Shape', 'node', 'F10'], ['smoothb', 'Smooth', 'smoothb'], ['roughen', 'Roughen', 'roughen'], ['attract', 'Attract', 'attract'], ['repel', 'Repel', 'repel']]],
  ['crop', [['crop', 'Crop', 'crop'], ['knife', 'Knife', 'knife'], ['eraser', 'Eraser', 'eraser', 'X']]],
  ['zoom', [['zoom', 'Zoom', 'zoom', 'Z'], ['pan', 'Pan', 'pan', 'H']]],
  ['curve', [['draw', 'Freehand', 'freehand', 'F5'], ['line', '2-Point Line', 'line'], ['bezier', 'Bézier', 'bezier'], ['pen', 'Pen', 'pen'], ['bspline', 'B-Spline', 'bspline'], ['polyline', 'Polyline', 'polyline'], ['curve3', '3-Point Curve', 'curve3']]],
  ['smart', [['smartfill', 'Smart Fill', 'smartfill']]],
  ['rect', [['rect', 'Rectangle', 'rect', 'F6']]],
  ['ellipse', [['ellipse', 'Ellipse', 'ellipse', 'F7']]],
  ['object', [['polygon', 'Polygon', 'polygon', 'Y'], ['star', 'Star', 'star', 'S'], ['cstar', 'Complex Star', 'cstar'], ['graph', 'Graph Paper', 'graph', 'D'], ['spiral', 'Spiral', 'spiral', 'A']]],
  ['shapes', [['shape:basic', 'Basic Shapes', 'shapes'], ['shape:arrow', 'Arrow Shapes', 'arrowshape'], ['shape:banner', 'Banner Shapes', 'banner'], ['shape:callout', 'Callout Shapes', 'callout'], ['shape:badge', 'Sport Badges', 'badge']]],
  ['text', [['text', 'Text', 'text', 'F8']]],
  ['dim', [['dimP', 'Parallel Dimension', 'dimension'], ['dimHV', 'Horizontal or Vertical Dimension', 'dimhv']]],
  ['table', [['table', 'Table', 'table']]],
  // Each effect has its own always-visible button (client spec: Transparency and Contour must be visible).
  ['transparency', [['transparency', 'Transparency', 'transparency']]],
  ['contour', [['contour', 'Contour', 'contour']]],
  ['blend', [['blend', 'Blend', 'blend']]],
  ['shadow', [['shadow', 'Drop Shadow', 'shadow']]],
  ['distort', [['distort', 'Distort', 'distort']]],
  ['envelope', [['envelope', 'Envelope', 'envelope']]],
  ['extrude', [['extrude', 'Extrude', 'extrude']]],
  ['blockshadow', [['blockshadow', 'Block Shadow', 'blockshadow']]],
  ['eyedrop', [['eyedropper', 'Color Eyedropper', 'eyedropper', 'I'], ['attrdrop', 'Attributes Eyedropper', 'attrdrop']]],
  ['fill', [['fill', 'Interactive Fill', 'fill', 'G']]],
  ['meshfill', [['meshfill', 'Mesh Fill', 'meshfill', 'M']]],
  ['import', [['image', 'Import Image', 'image', 'Ctrl+I']]],
];
/** Shorter names where the full one doesn't fit the toolbox (flyouts show the full name). */
const SHORT_LABEL = { dimP: 'Dimension', dimHV: 'H / V Dimension', eyedropper: 'Eyedropper', attrdrop: 'Attr. Eyedropper' };
/** Toolbox sections, top to bottom (groups with several tools open a flyout). */
const TOOL_SECTIONS = [
  ['Select', ['pick', 'shape', 'crop', 'zoom']],
  ['Draw', ['curve', 'smart']],
  ['Shapes & text', ['rect', 'ellipse', 'object', 'shapes', 'text', 'table', 'dim', 'import']],
  ['Effects', ['fill', 'meshfill', 'transparency', 'contour', 'blend', 'shadow', 'blockshadow', 'extrude', 'distort', 'envelope', 'eyedrop']],
];
const TOOLS = {};
for (const [group, tools] of TOOL_GROUPS) for (const [id, label, ic, key] of tools) TOOLS[id] = { id, label, icon: ic, key, group };
const groupCurrent = {};
const PICK_LIKE = new Set(['select', 'blend', 'contour', 'shadow', 'transparency', 'distort', 'envelope', 'extrude', 'blockshadow']);
const SCULPT = new Set(['smoothb', 'roughen', 'attract', 'repel']);
const OWN_MOUSE = new Set(['node', 'pan', 'knife', 'eraser', ...SCULPT]);
const PATH_TOOLS = new Set(['bezier', 'pen', 'polyline', 'bspline']);
const BOX_TOOLS = new Set(['rect', 'ellipse', 'polygon', 'star', 'cstar', 'spiral', 'graph', 'table', 'line', 'crop', 'dimP', 'dimHV']);
const TOOL_HINTS = {
  select: '', node: 'Click a curve to see its nodes · drag nodes, handles or segments · double-click a curve to add a node, a node to delete it · drag a box to select nodes',
  smoothb: 'Drag along the outline of the selected objects to smooth it', roughen: 'Drag across the outline of the selected objects to roughen it',
  attract: 'Hold and drag near the selected objects to pull nodes in', repel: 'Hold and drag near the selected objects to push nodes away',
  crop: 'Drag over the area to keep: vectors outside are removed, a selected image is cropped', knife: 'Drag a straight line across objects to cut them (the selected objects, or everything the line crosses)',
  eraser: 'Drag over objects to erase: shapes are cut, images lose those pixels (the selected objects, or anything under the eraser)', zoom: 'Click to zoom in · Alt+click to zoom out', pan: 'Drag to move around the page',
  draw: 'Freehand: drag to draw', line: 'Drag to draw a straight line (Shift = 15° steps)',
  bezier: 'Click for a corner node · click and drag for a smooth node · double-click or Enter to finish · click the first node to close',
  pen: 'Click for a corner node · click and drag for a smooth node · click the first node to close · double-click or Enter to finish',
  bspline: 'Click control points: the curve is pulled towards them · double-click or Enter to finish', polyline: 'Click to add points · double-click or Enter to finish',
  curve3: 'Drag from the start to the end point, release, then move to bend the curve and click',
  smartfill: 'Click inside an area enclosed by overlapping shapes to make it a new filled object',
  rect: 'Drag to draw a rectangle (Shift = square)', ellipse: 'Drag to draw an ellipse (Shift = circle)', polygon: 'Drag to draw a polygon (Shift = equal sides)',
  star: 'Drag to draw a star (Shift = equal sides)', cstar: 'Drag to draw a complex star', graph: 'Drag to draw graph paper (a group of rectangles)', spiral: 'Drag to draw a spiral',
  text: 'Click on the page to add text', dimP: 'Drag between two points to measure them', dimHV: 'Drag to add a horizontal or vertical dimension',
  blend: 'Select two shapes, set the steps, then Apply blend', contour: 'Select a shape or text, set the contour, then Apply contour',
  shadow: 'Select objects, set the shadow, then Apply', transparency: 'Select objects, choose the transparency type and amount',
  eyedropper: 'Click any colour on the page to pick it (shapes, text or images), then click objects to fill them', attrdrop: 'Click an object to copy its fill, outline and effects, then click other objects to apply them · Esc to stop',
  fill: 'Click an object to fill it with the current colour or gradient', 'shape:basic': 'Pick a shape on the property bar, then drag on the page',
  table: 'Drag to draw a table (rows and columns on the property bar) · type the cell text in Properties',
  distort: 'Select shapes or text, choose Zipper, Twister or Push and pull, then Apply distortion',
  envelope: 'Select shapes or text, choose an envelope (arch, bridge, bulge …), then Apply envelope',
  extrude: 'Select shapes or text, set the depth (X, Y) and side colour, then Apply extrude',
  blockshadow: 'Select shapes or text, set the depth (X, Y) and colour, then Apply block shadow',
  meshfill: 'Click inside a shape or text to add a soft spot of the current colour · click again for more spots',
};
for (const k of ['shape:arrow', 'shape:banner', 'shape:callout', 'shape:badge']) TOOL_HINTS[k] = TOOL_HINTS['shape:basic'];

function renderToolbox() {
  const nav = $('tools'), groups = new Map(TOOL_GROUPS);
  nav.innerHTML = '';
  for (const [section, gids] of TOOL_SECTIONS) {
    const h = document.createElement('div');
    h.className = 'tsec'; h.textContent = section;
    nav.append(h);
    for (const gid of gids) nav.append(toolButton(gid, groups.get(gid)));
  }
}
function toolButton(gid, tools) {
  const cur = groupCurrent[gid] ?? tools[0][0], t = TOOLS[cur];
  const b = document.createElement('button');
  b.className = `tool${tools.some(([id]) => id === state.tool) ? ' on' : ''}`;
  b.dataset.group = gid;
  b.title = `${t.label}${t.key ? ` (${t.key})` : ''}${tools.length > 1 ? ' · click again for more tools' : ''}`;
  b.innerHTML = `${icon(t.icon)}<span class="tl">${SHORT_LABEL[cur] ?? t.label}</span>${tools.length > 1 ? '<i class="corner"></i>' : ''}`;
  b.onclick = (e) => {
    e.stopPropagation();
    if (tools.length > 1 && (state.tool === cur || e.target.closest('.corner'))) openToolFly(gid, b);
    else { closeMenus(); setTool(cur); }
  };
  b.oncontextmenu = (e) => { e.preventDefault(); if (tools.length > 1) openToolFly(gid, b); };
  return b;
}
function openToolFly(gid, b) {
  const fly = $('toolFly'), tools = TOOL_GROUPS.find(([g]) => g === gid)[1], r = b.getBoundingClientRect();
  const open = !(fly.classList.contains('open') && fly.dataset.group === gid);
  closeMenus();
  if (!open) return;
  fly.dataset.group = gid;
  fly.innerHTML = tools.map(([id, label, ic, key]) => `<button data-tool="${id}" class="${state.tool === id ? 'on' : ''}">${icon(ic)}${label}${key ? `<small>${key}</small>` : ''}</button>`).join('');
  fly.querySelectorAll('[data-tool]').forEach((x) => (x.onclick = () => { closeMenus(); setTool(x.dataset.tool); }));
  Object.assign(fly.style, innerWidth > 900 ? { left: `${r.right + 6}px`, top: `${Math.min(r.top, innerHeight - tools.length * 40 - 20)}px`, bottom: 'auto' } : { left: `${Math.max(6, Math.min(r.left, innerWidth - 250))}px`, top: 'auto', bottom: `${innerHeight - r.top + 6}px` });
  fly.classList.add('open');
}

// Tool cursors: an eyedropper while picking a colour, a paint bucket while filling.
const svgCursor = (body, x, y, fallback) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#fff" stroke-width="4">${body}</g><g stroke="#000" stroke-width="1.6">${body}</g></svg>`)}") ${x} ${y}, ${fallback}`;
const CURSORS = { pick: svgCursor(ICONS.eyedropper, 2, 22, 'crosshair'), bucket: svgCursor(ICONS.fill, 20, 22, 'copy') };
function toolCursor(tool) {
  if (tool === 'zoom') return 'zoom-in';
  if (tool === 'pan') return 'grab';
  if (tool === 'eyedropper') return eye.mode === 'apply' ? CURSORS.bucket : CURSORS.pick;
  if (tool === 'fill') return CURSORS.bucket;
  return PICK_LIKE.has(tool) ? 'default' : 'crosshair';
}

let toolTargets = [];
function applyToolFlags() {
  const tool = state.tool, pickLike = PICK_LIKE.has(tool), own = OWN_MOUSE.has(tool);
  canvas.selection = pickLike;
  canvas.skipTargetFind = own;
  for (const o of userObjects()) { o.selectable = pickLike && !o.locked; o.evented = !own; }
}
function setTool(tool) {
  if (!TOOLS[tool]) return;
  finishPath(); cancelCurve3(); attrSample = null; pickFrame = null;
  if (tool === 'image') { $('fileImage').click(); return; }
  const prev = state.tool;
  // Brushes, knife and eraser work on the objects selected when the tool is picked.
  if (OWN_MOUSE.has(tool) && !OWN_MOUSE.has(prev)) toolTargets = canvas.getActiveObjects().slice();
  if (!OWN_MOUSE.has(tool)) toolTargets = [];
  const editFirst = tool === 'node' ? one() : null;
  if (prev === 'node' && tool !== 'node') nodes.end();
  state.tool = tool;
  groupCurrent[TOOLS[tool].group] = tool;
  canvas.isDrawingMode = tool === 'draw';
  if (canvas.isDrawingMode) {
    canvas.freeDrawingBrush = new PencilBrush(canvas);
    canvas.freeDrawingBrush.color = state.strokeWidth ? state.stroke : state.fill;
    canvas.freeDrawingBrush.width = Math.max(0.5, state.strokeWidth || 1.5) * MM;
  }
  if (!PICK_LIKE.has(tool)) canvas.discardActiveObject();
  applyToolFlags();
  if (tool === 'node' && editFirst) nodes.start(editFirst);
  if (tool === 'eyedropper') eye.mode = 'pick';
  canvas.defaultCursor = toolCursor(tool);
  // Over objects the cursor still shows the tool (Pick-like tools show "move").
  canvas.hoverCursor = PICK_LIKE.has(tool) ? 'move' : canvas.defaultCursor;
  nodes.setBrush(SCULPT.has(tool) ? { radius: state.shape.radius * MM } : tool === 'eraser' ? { radius: (state.shape.eraser * MM) / 2 } : null);
  if (tool.startsWith('shape:')) state.shape.set = tool.split(':')[1];
  renderToolbox();
  syncContext();
  syncTextBar();
  canvas.requestRenderAll();
  hint(TOOL_HINTS[tool] ?? '');
}

// ===================================================================
// Drawing with the mouse
// ===================================================================
let drag = null, path = null, curve3 = null, erase = null, knife = null, attrSample = null, pickFrame = null;
function helperPath(d, extra = {}) {
  const h = new Path(d || 'M 0 0', { fill: null, stroke: '#12E1F0', strokeWidth: 1.5 / canvas.getZoom(), strokeDashArray: [6 / canvas.getZoom(), 4 / canvas.getZoom()], selectable: false, evented: false, excludeFromExport: true, objectCaching: false, ...extra });
  h.isHelper = true;
  muted++; canvas.add(h); muted--;
  return h;
}
const setLive = (o, d) => { o._setPath(d || 'M 0 0', true); o.setCoords(); };
const dropHelper = (h) => { if (h) { muted++; canvas.remove(h); muted--; } };
function cancelDrag() { if (drag?.o && drag.live) { muted++; canvas.remove(drag.o); muted--; } dropHelper(drag?.helper); drag = null; }

const unitFor = (tool) => {
  const s = state.shape;
  if (tool === 'polygon') return V.polygonUnit(s.sides);
  if (tool === 'star') return V.starUnit(s.points, s.sharp);
  if (tool === 'cstar') return V.complexStarUnit(s.cpoints, s.csharp);
  if (tool === 'spiral') return V.spiralUnit(s.revs, s.log, s.expand);
  if (tool.startsWith('shape:')) { const set = V.SHAPE_SETS[s.set]; return (set.items.find(([id]) => id === s.item) ?? set.items[0])[2]; }
  return null;
};
const specFor = (tool) => { const s = state.shape; return tool === 'polygon' ? { tool, sides: s.sides } : tool === 'star' ? { tool, points: s.points, sharp: s.sharp } : tool === 'cstar' ? { tool, cpoints: s.cpoints, csharp: s.csharp } : tool === 'spiral' ? { tool, revs: s.revs, log: s.log, expand: s.expand } : { tool, set: s.set, item: s.item }; };

/** Drawing clicks and dragged nodes snap to nodes, edges and guidelines when Snap is on. */
const SNAP_TOOLS = new Set([...PATH_TOOLS, ...BOX_TOOLS, 'curve3', 'text']);
function pointer(opt, tool) {
  const p = canvas.getScenePoint(opt.e);
  if (!state.snap) return p;
  if (tool === 'node') return nodes.target ? guides.snapPoint(p, [nodes.target]) : p;
  if (!SNAP_TOOLS.has(tool) && !tool.startsWith('shape:')) return p;
  const q = guides.snapPoint(p);
  // Nothing close to snap to: drawing follows the grid when Snap to grid is on.
  if (q.x === p.x && q.y === p.y && state.snapTo.grid) return new Point(Math.round(p.x / GRID) * GRID, Math.round(p.y / GRID) * GRID);
  return q;
}

canvas.on('mouse:down', (opt) => {
  if (panning || spaceDown || opt.e.button === 1) return;
  guides.forget();
  const tool = state.tool, p = tool === 'node' ? canvas.getScenePoint(opt.e) : pointer(opt, tool), target = opt.target && !opt.target.isPage && !opt.target.isHelper ? opt.target : null;
  if (pickFrame) { placeInFrame(target); return; }
  if (tool === 'node') { nodes.down(p, opt.e); return; }
  if (SCULPT.has(tool)) { nodes.brushDown(tool === 'smoothb' ? 'smooth' : tool, toolTargets.filter((o) => canvas.getObjects().includes(o)), p, state.shape.radius * MM); return; }
  if (tool === 'eraser') { erase = { points: [p], helper: helperPath(`M ${p.x} ${p.y}`, { stroke: 'rgba(255,80,80,.35)', strokeWidth: state.shape.eraser * MM, strokeDashArray: null, strokeLineCap: 'round', strokeLineJoin: 'round' }) }; return; }
  if (tool === 'knife') { knife = { a: p, b: p, helper: helperPath(`M ${p.x} ${p.y} L ${p.x} ${p.y}`, { stroke: '#ff4d6d' }) }; return; }
  if (tool === 'zoom') { zoomAt(canvas.getZoom() * (opt.e.altKey ? 0.6 : 1.6), canvas.getViewportPoint(opt.e)); return; }
  if (tool === 'eyedropper') { eyedropClick(opt, target, p); return; }
  if (tool === 'meshfill') { meshFillAt(target, p); return; }
  if (tool === 'fill' || tool === 'attrdrop') { if (target) clickTool(tool, target); return; }
  if (tool === 'smartfill') { smartFill(p); return; }
  if (tool === 'text') {
    const t = style(paint(new IText('Your text', { left: p.x, top: p.y, ...state.text, fontSize: state.text.fontSize * MM, originX: 'center', originY: 'center' })), { toolName: 'Text' });
    t.set({ strokeWidth: 0, stroke: null });
    canvas.add(t); setTool('select'); canvas.setActiveObject(t); t.enterEditing(); t.selectAll();
    return;
  }
  if (PATH_TOOLS.has(tool)) { penDown(p); return; }
  if (tool === 'curve3') { curve3Down(p); return; }
  if (!BOX_TOOLS.has(tool) && !tool.startsWith('shape:')) return;
  let o = null;
  const box = { x: p.x, y: p.y, w: 1, h: 1 };
  if (tool === 'rect') o = paint(new Rect({ left: p.x, top: p.y, width: 1, height: 1, rx: state.shape.radiusRect ?? 0, ry: state.shape.radiusRect ?? 0, toolName: 'Rectangle' }));
  else if (tool === 'ellipse') o = paint(new Ellipse({ left: p.x, top: p.y, rx: 1, ry: 1, toolName: 'Ellipse' }));
  else if (tool === 'line' || tool === 'dimP' || tool === 'dimHV') o = paintLine(new Path(`M ${p.x} ${p.y} L ${p.x} ${p.y}`, { toolName: '2-Point Line' }));
  else if (tool === 'crop' || tool === 'graph' || tool === 'table') { drag = { tool, start: p, helper: helperPath(`M ${p.x} ${p.y}`, { fill: 'rgba(18,225,240,.10)' }) }; return; }
  else {
    o = new Path(V.boxD(unitFor(tool), box), { toolName: TOOLS[tool].label });
    if (tool === 'spiral') paintLine(o); else paint(o);
    if (tool === 'cstar') o.set('fillRule', 'evenodd');
  }
  if (tool === 'dimP' || tool === 'dimHV') o.set({ stroke: '#12E1F0', strokeWidth: 1.5 / canvas.getZoom(), strokeDashArray: [6, 4] });
  style(o);
  o.selectable = false;
  muted++; canvas.add(o); muted--;
  drag = { tool, start: p, o, live: true };
});
canvas.on('mouse:move', (opt) => {
  const tool = state.tool, p = pointer(opt, tool);
  if (tool === 'node') { nodes.move(p, opt.e); return; }
  if (SCULPT.has(tool) || tool === 'eraser') { nodes.setBrush({ radius: tool === 'eraser' ? (state.shape.eraser * MM) / 2 : state.shape.radius * MM, at: p }); }
  if (SCULPT.has(tool)) { if (opt.e.buttons & 1) nodes.brushStep(p); return; }
  if (erase) { erase.points.push(p); setLive(erase.helper, `M ${erase.points.map((q) => `${q.x} ${q.y}`).join(' L ')}`); canvas.requestRenderAll(); return; }
  if (knife) { knife.b = p; setLive(knife.helper, `M ${knife.a.x} ${knife.a.y} L ${p.x} ${p.y}`); canvas.requestRenderAll(); return; }
  if (path) { penMove(p, opt.e); return; }
  if (curve3) { curve3Move(p); return; }
  if (!drag) return;
  let w = p.x - drag.start.x, h = p.y - drag.start.y;
  const shift = opt.e.shiftKey;
  if (shift && drag.tool !== 'line' && !drag.tool.startsWith('dim')) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
  const left = Math.min(drag.start.x, drag.start.x + w), top = Math.min(drag.start.y, drag.start.y + h), box = { x: left, y: top, w: Math.max(1, Math.abs(w)), h: Math.max(1, Math.abs(h)) };
  const o = drag.o;
  if (drag.tool === 'rect') o.set({ left, top, width: box.w, height: box.h });
  else if (drag.tool === 'ellipse') o.set({ left, top, rx: box.w / 2, ry: box.h / 2 });
  else if (drag.tool === 'line' || drag.tool === 'dimP' || drag.tool === 'dimHV') {
    let q = p;
    if (shift || drag.tool === 'dimHV') {
      const a = Math.atan2(h, w), step = drag.tool === 'dimHV' ? Math.PI / 2 : Math.PI / 12, r = Math.hypot(w, h), s = Math.round(a / step) * step;
      q = { x: drag.start.x + Math.cos(s) * r, y: drag.start.y + Math.sin(s) * r };
    }
    drag.end = q;
    setLive(o, `M ${drag.start.x} ${drag.start.y} L ${q.x} ${q.y}`);
  } else if (drag.tool === 'crop' || drag.tool === 'graph' || drag.tool === 'table') setLive(drag.helper, `M ${box.x} ${box.y} h ${box.w} v ${box.h} h ${-box.w} Z`);
  else setLive(o, V.boxD(unitFor(drag.tool), box));
  drag.box = box;
  o?.setCoords();
  canvas.requestRenderAll();
});
canvas.on('mouse:up', (opt) => {
  const tool = state.tool, p = pointer(opt, tool);
  guides.forget();
  if (tool === 'node') { nodes.up(p); return; }
  if (SCULPT.has(tool)) { nodes.brushUp(); return; }
  if (erase) { const e = erase; erase = null; dropHelper(e.helper); applyEraser(e.points); return; }
  if (knife) { const k = knife; knife = null; dropHelper(k.helper); applyKnife(k.a, k.b); return; }
  if (path) { path.pressing = false; return; }
  if (curve3) { curve3Up(p); return; }
  if (!drag) return;
  const d = drag; drag = null;
  if (d.tool === 'crop') { dropHelper(d.helper); applyCrop(d.box); return; }
  if (d.tool === 'graph') { dropHelper(d.helper); addGraph(d.box ?? { x: d.start.x - 40 * MM, y: d.start.y - 30 * MM, w: 80 * MM, h: 60 * MM }); return; }
  if (d.tool === 'table') { dropHelper(d.helper); addTable(d.box ?? { x: d.start.x - 60 * MM, y: d.start.y - 40 * MM, w: 0, h: 0 }); return; }
  const o = d.o;
  muted++; canvas.remove(o); muted--;
  if (d.tool === 'dimP' || d.tool === 'dimHV') { if (d.end && screenDist(d.start, d.end) > 6) addDimension(d.start, d.end, d.tool === 'dimHV'); setTool('select'); return; }
  if (!d.box || (d.box.w < 3 && d.box.h < 3)) {
    // A click without dragging: drop a default-sized shape.
    if (d.tool === 'line') { setTool('select'); return; }
    const box = { x: d.start.x - 30 * MM, y: d.start.y - 30 * MM, w: 60 * MM, h: 60 * MM };
    if (d.tool === 'rect') o.set({ left: box.x, top: box.y, width: box.w, height: box.h * (2 / 3) });
    else if (d.tool === 'ellipse') o.set({ left: box.x, top: box.y, rx: box.w / 2, ry: box.h / 2 });
    else setLive(o, V.boxD(unitFor(d.tool), box));
  }
  if (!['rect', 'ellipse', 'line'].includes(d.tool)) o.shapeSpec = specFor(d.tool);
  o.selectable = true;
  o.setCoords();
  canvas.add(o);
  setTool('select');
  canvas.setActiveObject(o);
  canvas.requestRenderAll();
});
canvas.on('mouse:dblclick', (opt) => {
  if (state.tool === 'node') { nodes.dblclick(canvas.getScenePoint(opt.e)); return; }
  if (path) finishPath();
});
canvas.on('path:created', (e) => { style(e.path, { toolName: 'Freehand', strokeUniform: true }); e.path.name = `Freehand ${++counter}`; record(); refreshLayers(); });
canvas.on('after:render', ({ ctx }) => { if (exporting) return; guides.draw(ctx); nodes.draw(ctx); drawToolOverlay(ctx); });

/** Pen / Bézier nodes being drawn, and the objects a brush or cut works on. */
function drawToolOverlay(ctx) {
  const r = canvas.getRetinaScaling(), v = canvas.viewportTransform, S = (q) => ({ x: q.x * v[0] + v[4], y: q.y * v[3] + v[5] });
  ctx.save(); ctx.setTransform(r, 0, 0, r, 0, 0);
  if (path) {
    for (const [i, n] of path.nodes.entries()) {
      const q = S(n);
      if (n.ho && path.kind !== 'bspline') { const a = S(n.hi ?? n), b = S(n.ho); ctx.strokeStyle = '#7B4DFF'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.fillStyle = '#7B4DFF'; for (const z of [a, b]) { ctx.beginPath(); ctx.arc(z.x, z.y, 3, 0, 7); ctx.fill(); } }
      ctx.fillStyle = i === 0 ? '#12E1F0' : '#ffffff'; ctx.strokeStyle = '#1E7BFF';
      ctx.fillRect(q.x - 4, q.y - 4, 8, 8); ctx.strokeRect(q.x - 4, q.y - 4, 8, 8);
    }
  }
  if (toolTargets.length && OWN_MOUSE.has(state.tool) && state.tool !== 'node') {
    ctx.setLineDash([5, 4]); ctx.strokeStyle = '#7B4DFF';
    for (const o of toolTargets) { if (!canvas.getObjects().includes(o)) continue; const b = o.getBoundingRect(), a = S({ x: b.left, y: b.top }); ctx.strokeRect(a.x, a.y, b.width * v[0], b.height * v[3]); }
  }
  ctx.restore();
}

// Bézier / Pen / Polyline / B-spline: click (or click-drag for smooth nodes).
const newNode = (p) => ({ x: p.x, y: p.y, hi: null, ho: null, type: 'cusp' });
function penDown(p) {
  if (!path) path = { kind: state.tool, nodes: [], pressing: false, cursor: p, helper: helperPath('') };
  const ns = path.nodes;
  if (['bezier', 'pen', 'polyline'].includes(path.kind) && ns.length > 2 && screenDist(p, ns[0]) < 10) { finishPath(true); return; }
  // The second click of a double-click lands on the last node: ignore it.
  if (ns.length && screenDist(p, ns.at(-1)) < 3) return;
  ns.push(newNode(p));
  path.pressing = path.kind === 'bezier' || path.kind === 'pen';
  updatePenPreview();
}
function penMove(p, e) {
  path.cursor = p;
  const last = path.nodes.at(-1);
  if (path.pressing && (e.buttons & 1) && last && screenDist(p, last) > 3) {
    last.ho = { x: p.x, y: p.y };
    last.hi = { x: 2 * last.x - p.x, y: 2 * last.y - p.y };
    last.type = 'symmetric';
  }
  updatePenPreview();
}
function penModel(withCursor) {
  const ns = path.nodes.map((n) => ({ ...n }));
  if (withCursor && !path.pressing && path.cursor) ns.push(newNode(path.cursor));
  if (ns.length) { ns[0].hi = null; }
  return ns;
}
function updatePenPreview() {
  if (!path) return;
  const ns = penModel(true);
  let d;
  if (path.kind === 'bspline') d = ns.length > 1 ? `${bsplinePath(ns)} M ${ns.map((n) => `${n.x} ${n.y}`).join(' L ')}` : '';
  else d = V.modelToD([{ closed: false, nodes: ns }]);
  setLive(path.helper, d);
  path.helper.set({ strokeWidth: 1.5 / canvas.getZoom() });
  canvas.requestRenderAll();
}
function finishPath(close = false) {
  if (!path) return;
  const { kind, helper } = path;
  const ns = penModel(false);
  dropHelper(helper);
  path = null;
  canvas.requestRenderAll();
  if (ns.length < 2) return;
  let o;
  if (kind === 'bspline') o = paintLine(new Path(bsplinePath(ns), { toolName: 'B-Spline' }));
  else {
    if (close) ns[0].hi = ns[0].hi ?? null;
    const d = V.modelToD([{ closed: close, nodes: ns }]);
    o = new Path(d, { toolName: kind === 'polyline' ? 'Polyline' : close ? 'Curve shape' : 'Curve' });
    if (close) paint(o); else paintLine(o);
  }
  style(o);
  canvas.add(o);
  setTool('select');
  canvas.setActiveObject(o);
}
/** Clamped uniform cubic B-spline (starts and ends on the end points), as cubic Bézier segments. */
function bsplinePath(pts) {
  if (pts.length < 3) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  const P = [pts[0], pts[0], ...pts, pts.at(-1), pts.at(-1)];
  const at = (a, b, c, wa, wb, wc) => ({ x: (a.x * wa + b.x * wb + c.x * wc) / (wa + wb + wc), y: (a.y * wa + b.y * wb + c.y * wc) / (wa + wb + wc) });
  let d = '';
  for (let i = 0; i + 3 < P.length; i++) {
    const [p0, p1, p2, p3] = [P[i], P[i + 1], P[i + 2], P[i + 3]];
    const b0 = at(p0, p1, p2, 1, 4, 1), b1 = at(p1, p2, p2, 2, 1, 0), b2 = at(p1, p2, p2, 1, 2, 0), b3 = at(p1, p2, p3, 1, 4, 1);
    if (!d) d = `M ${b0.x} ${b0.y}`;
    d += ` C ${b1.x} ${b1.y} ${b2.x} ${b2.y} ${b3.x} ${b3.y}`;
  }
  return d;
}

// 3-point curve: drag start -> end, then move to bend and click.
function curve3Down(p) {
  if (!curve3) { curve3 = { a: p, b: p, phase: 1, helper: helperPath(`M ${p.x} ${p.y}`) }; return; }
  if (curve3.phase === 2) {
    const { a, b, c } = curve3;
    dropHelper(curve3.helper); curve3 = null;
    const c1 = V.lerp(a, c ?? V.lerp(a, b, 0.5), 2 / 3), c2 = V.lerp(b, c ?? V.lerp(a, b, 0.5), 2 / 3);
    const o = style(paintLine(new Path(`M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`, { toolName: '3-Point Curve' })));
    canvas.add(o); setTool('select'); canvas.setActiveObject(o);
  }
}
function curve3Move(p) {
  if (curve3.phase === 1) { curve3.b = p; setLive(curve3.helper, `M ${curve3.a.x} ${curve3.a.y} L ${p.x} ${p.y}`); }
  else {
    const { a, b } = curve3, m = V.lerp(a, b, 0.5);
    curve3.c = { x: 2 * p.x - m.x, y: 2 * p.y - m.y };
    setLive(curve3.helper, `M ${a.x} ${a.y} Q ${curve3.c.x} ${curve3.c.y} ${b.x} ${b.y}`);
  }
  canvas.requestRenderAll();
}
function curve3Up(p) {
  if (curve3.phase !== 1) return;
  if (screenDist(curve3.a, p) < 6) { cancelCurve3(); return; }
  curve3.b = p; curve3.phase = 2;
  hint('Move to bend the curve, then click');
}
function cancelCurve3() { if (curve3) { dropHelper(curve3.helper); curve3 = null; } }

// Graph paper: a group of rectangles.
function addGraph(box) {
  const { cols, rows } = state.shape, w = box.w / cols, h = box.h / rows, cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cell = new Path(`M ${box.x + c * w} ${box.y + r * h} h ${w} v ${h} h ${-w} Z`);
    cell.set({ fill: state.fill, stroke: state.strokeWidth ? state.stroke : '#1E7BFF', strokeWidth: Math.max(0.25, state.strokeWidth || 0.35) * MM, strokeUniform: true, opacity: state.opacity });
    cells.push(style(cell, { toolName: 'Cell' }));
  }
  const g = style(new Group(cells), { toolName: 'Graph paper' });
  canvas.add(g); setTool('select'); canvas.setActiveObject(g);
}
// Dimension lines: line with end ticks, arrowheads and the measurement in mm.
function addDimension(a, b, hv) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const tick = 3 * MM, arrow = 2.2 * MM, col = '#111827';
  const value = hv ? (Math.abs(dx) >= Math.abs(dy) ? Math.abs(dx) : Math.abs(dy)) : L;
  const parts = [
    `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
    `M ${a.x + nx * tick} ${a.y + ny * tick} L ${a.x - nx * tick} ${a.y - ny * tick}`,
    `M ${b.x + nx * tick} ${b.y + ny * tick} L ${b.x - nx * tick} ${b.y - ny * tick}`,
  ].map((d) => new Path(d, { stroke: col, strokeWidth: 0.3 * MM, fill: null, strokeUniform: true }));
  const head = (p, s) => new Path(`M ${p.x} ${p.y} L ${p.x + s * ux * arrow + nx * arrow * 0.45} ${p.y + s * uy * arrow + ny * arrow * 0.45} L ${p.x + s * ux * arrow - nx * arrow * 0.45} ${p.y + s * uy * arrow - ny * arrow * 0.45} Z`, { fill: col, stroke: null });
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  const label = new IText(`${inUnits(value)} ${unit().name}`, { fontFamily: 'Inter', fontWeight: 400, fontSize: 6 * MM, fill: col, originX: 'center', originY: 'bottom', angle, left: (a.x + b.x) / 2 - nx * 1.2 * MM * Math.sign(ny || 1), top: (a.y + b.y) / 2 - ny * 1.2 * MM * Math.sign(ny || 1) });
  const g = style(new Group([...parts, head(a, 1), head(b, -1), label]), { toolName: 'Dimension' });
  g.name = `Dimension ${inUnits(value)} ${unit().name}`;
  canvas.add(g); canvas.setActiveObject(g);
}

// Fill, colour eyedropper, attributes eyedropper.
const ATTR_KEYS = ['fill', 'stroke', 'strokeWidth', 'strokeDashArray', 'opacity', 'shadow', 'gradSpec'];
function clickTool(tool, target) {
  if (tool === 'fill') {
    applyProps(target, (o) => {
      if (state.target !== 'fill') return { stroke: state.stroke, strokeWidth: o.strokeWidth || MM, strokeUniform: true };
      if (state.gradient) { o.gradSpec = { ...state.gradient }; return { fill: gradientFor(o, state.gradient) }; }
      delete o.gradSpec;
      return { fill: state.fill };
    });
    canvas.fire('object:modified', { target }); canvas.requestRenderAll();
  } else if (!attrSample) {
    attrSample = Object.fromEntries(ATTR_KEYS.map((k) => [k, target[k]]));
    if (isText(target)) Object.assign(attrSample, { fontFamily: target.fontFamily, fontWeight: target.fontWeight, fontStyle: target.fontStyle });
    toast('Attributes copied: click objects to apply them (Esc to stop)');
  } else {
    const { gradSpec, ...sample } = attrSample;
    applyProps(target, (o) => {
      const props = { ...sample };
      if (!isText(o)) { delete props.fontFamily; delete props.fontWeight; delete props.fontStyle; }
      if (gradSpec) o.gradSpec = { ...gradSpec }; else delete o.gradSpec;
      return props;
    });
    for (const o of paintParts(target)) refill(o);
    canvas.fire('object:modified', { target }); canvas.requestRenderAll();
  }
}

// ===================================================================
// Shaping, cutting, effects
// ===================================================================
const closedish = (o) => o.type !== 'line' && o.type !== 'polyline' && !(o.type === 'path' && !o.fill);
function shaping(kind) {
  const objs = byZ(active().filter(shapeable));
  if (objs.length < 2) { toast('Select two or more shapes (Shift+click)'); return; }
  const ds = objs.map(worldD), target = objs[0], top = objs.at(-1);
  const uniteAll = (list) => list.reduce((acc, d) => (acc ? V.boolean('unite', acc, d) : d), '');
  canvas.discardActiveObject();
  let result = [];
  try {
    batch(() => {
      if (kind === 'weld') {
        const p = makePath(uniteAll(ds), target); p.name = 'Weld';
        replaceObject(target, p); for (const o of objs.slice(1)) canvas.remove(o); result = [p];
      } else if (kind === 'trim') {
        const p = makePath(V.boolean('subtract', ds[0], uniteAll(ds.slice(1))), target); p.name = `${target.name} trimmed`;
        replaceObject(target, p); result = [p];
      } else if (kind === 'intersect') {
        let d = ds[0]; for (const x of ds.slice(1)) d = V.boolean('intersect', d, x);
        if (!d) throw new Error('These shapes do not overlap');
        const p = makePath(d, target); p.name = 'Intersection';
        canvas.insertAt(canvas.getObjects().indexOf(top) + 1, p); result = [p];
      } else if (kind === 'simplify') {
        result = objs.map((o, i) => {
          const above = ds.slice(i + 1);
          if (!above.length || !V.canConvert(o) && o.type !== 'group') return o;
          const d = V.boolean('subtract', ds[i], uniteAll(above));
          if (!d) { canvas.remove(o); return null; }
          const p = makePath(d, o); p.name = o.name; replaceObject(o, p); return p;
        }).filter(Boolean);
      } else if (kind === 'fmb' || kind === 'bmf') {
        const keep = kind === 'fmb' ? objs.length - 1 : 0, rest = ds.filter((_, i) => i !== keep);
        const d = V.boolean('subtract', ds[keep], uniteAll(rest));
        if (!d) throw new Error('Nothing is left after subtracting');
        const p = makePath(d, objs[keep]); p.name = kind === 'fmb' ? 'Front minus back' : 'Back minus front';
        replaceObject(objs[keep], p); for (const o of objs) if (o !== objs[keep]) canvas.remove(o); result = [p];
      }
    });
  } catch (err) { toast(err.message || 'That shaping operation did not work on these objects'); return; }
  select(result);
  toast({ weld: 'Welded into one shape', trim: 'Trimmed', intersect: 'Intersection created', simplify: 'Simplified', fmb: 'Front minus back', bmf: 'Back minus front' }[kind]);
}
function combine() {
  const objs = byZ(active().filter(shapeable));
  if (objs.length < 2) { toast('Select two or more objects to combine'); return; }
  const p = makePath(objs.map(worldD).join(' '), objs[0], { fillRule: 'evenodd' });
  p.name = 'Combined curve';
  canvas.discardActiveObject();
  batch(() => { replaceObject(objs[0], p); for (const o of objs.slice(1)) canvas.remove(o); });
  select([p]); toast('Combined (Ctrl+K breaks it apart again)');
}
function breakApart() {
  const objs = active().filter(shapeable);
  if (!objs.length) { toast('Select a combined curve or text converted to curves'); return; }
  canvas.discardActiveObject();
  const out = [];
  batch(() => {
    for (const o of objs) {
      const model = o.type === 'group' ? null : V.objectModel(o);
      if (!model || model.length < 2) { out.push(o); continue; }
      const parts = model.map((s) => { const p = makePath(V.modelToD([s]), o); p.set('fillRule', 'nonzero'); p.name = `${o.name} part`; return p; });
      replaceObject(o, ...parts); out.push(...parts);
    }
  });
  select(out);
}
function outlineToObject() {
  const objs = active().filter((o) => V.canConvert(o) && o.stroke && o.strokeWidth);
  if (!objs.length) { toast('Select objects that have an outline'); return; }
  canvas.discardActiveObject();
  const out = [];
  batch(() => {
    for (const o of objs) {
      const w = o.strokeWidth * (o.strokeUniform ? 1 : Math.max(o.scaleX, o.scaleY));
      const d = V.strokeOutlineD(worldD(o), w, { join: o.strokeLineJoin === 'miter' ? 'miter' : 'round', cap: o.strokeLineCap === 'butt' ? 'butt' : 'round' });
      if (!d) continue;
      const p = makePath(d, null, { toolName: 'Outline' });
      p.set({ fill: o.stroke, stroke: null, strokeWidth: 0, opacity: o.opacity });
      p.name = `${o.name} outline`;
      canvas.insertAt(canvas.getObjects().indexOf(o) + 1, p);
      o.set({ stroke: null, strokeWidth: 0 });
      if (!o.fill) canvas.remove(o);
      out.push(p);
    }
  });
  select(out); toast('Outline converted to a filled object');
}
function smartFill(p) {
  const shapes = userObjects().filter((o) => o.visible && V.canConvert(o) && closedish(o));
  let d = '';
  try { d = V.smartFillD(shapes.map(worldD), p); } catch { d = ''; }
  if (!d) { toast('Click inside an area enclosed by shapes'); return; }
  const o = makePath(d, null, { toolName: 'Smart fill' });
  o.set({ fill: state.gradient ? null : state.fill, stroke: state.strokeWidth ? state.stroke : null, strokeWidth: state.strokeWidth * MM, strokeUniform: true });
  if (state.gradient) { o.gradSpec = { ...state.gradient }; o.set('fill', gradientFor(o)); }
  canvas.add(o);
}
function cutTargets(bounds) {
  const live = toolTargets.filter((o) => canvas.getObjects().includes(o));
  const list = live.length ? live : userObjects().filter((o) => o.visible && !o.locked);
  return list.filter((o) => { const b = o.getBoundingRect(); return !(b.left > bounds.right || b.left + b.width < bounds.left || b.top > bounds.bottom || b.top + b.height < bounds.top); });
}
function applyKnife(a, b) {
  if (screenDist(a, b) < 6) return;
  const targets = cutTargets({ left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) }).filter(shapeable);
  let cuts = 0;
  const pieces = [];
  batch(() => {
    for (const o of targets) {
      let res = null;
      try { res = V.knifeD(worldD(o), a, b); } catch { res = null; }
      if (!res || res.length < 2) continue;
      const parts = res.map((d, i) => { const p = makePath(d, o); p.name = `${o.name} ${i + 1}`; if (!closedish(o)) p.set('fill', null); return p; });
      replaceObject(o, ...parts); pieces.push(...parts); cuts++;
    }
  });
  toolTargets = toolTargets.filter((o) => canvas.getObjects().includes(o)).concat(toolTargets.length ? pieces : []);
  toast(cuts ? `Cut ${cuts} object${cuts > 1 ? 's' : ''} into ${pieces.length} pieces` : 'Drag the knife right across a shape to cut it');
}
function applyEraser(points) {
  if (points.length < 1) return;
  const w = state.shape.eraser * MM;
  let region;
  try { region = V.strokeRegionD(points.filter((q, i) => i === 0 || Math.hypot(q.x - points[i - 1].x, q.y - points[i - 1].y) > w / 6), w); } catch { return; }
  const b = V.dBounds(region);
  const targets = cutTargets({ left: b.left, top: b.top, right: b.left + b.width, bottom: b.top + b.height }).filter(shapeable);
  const changed = [];
  batch(() => {
    for (const o of targets) {
      let d;
      try { d = V.boolean('subtract', worldD(o), region); } catch { continue; }
      if (d === worldD(o)) continue;
      if (!d) { canvas.remove(o); continue; }
      const p = makePath(d, o); p.name = o.name; if (!closedish(o)) p.set('fill', null);
      replaceObject(o, p); changed.push([o, p]);
    }
  });
  toolTargets = toolTargets.map((o) => changed.find(([a]) => a === o)?.[1] ?? o).filter((o) => canvas.getObjects().includes(o));
  // Images under the eraser lose those pixels (vectors above are cut as shapes).
  for (const o of cutTargets({ left: b.left, top: b.top, right: b.left + b.width, bottom: b.top + b.height }).filter((x) => x.type === 'image')) erasePixels(o, points, w);
}
/** Erases a stroke (page points, width in page units) from an image's pixels. */
async function erasePixels(o, points, width) {
  const pic = B.imagePixels(o, 4096), inv = util.invertTransform(o.calcTransformMatrix());
  const px = (p) => { const q = util.transformPoint(new Point(p.x, p.y), inv); return [(q.x + o.width / 2) * pic.kx, (q.y + o.height / 2) * pic.ky]; };
  const g = pic.ctx;
  g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = (width / ((Math.abs(o.scaleX) + Math.abs(o.scaleY)) / 2)) * pic.kx;
  g.beginPath();
  points.forEach((p, i) => { const [x, y] = px(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  if (points.length === 1) { const [x, y] = px(points[0]); g.lineTo(x + 0.01, y); }
  g.stroke();
  await replacePixels(o, pic);
}
function applyCrop(box) {
  if (!box || box.w < 4 || box.h < 4) return;
  const sel = one();
  if (sel?.type === 'image' && canvas.getObjects().includes(sel)) { cropImage(sel, box); return; }
  const rectD = `M ${box.x} ${box.y} h ${box.w} v ${box.h} h ${-box.w} Z`;
  const targets = userObjects().filter((o) => o.visible && !o.locked);
  let n = 0;
  batch(() => {
    for (const o of targets) {
      const b = o.getBoundingRect();
      const inside = b.left >= box.x && b.top >= box.y && b.left + b.width <= box.x + box.w && b.top + b.height <= box.y + box.h;
      if (inside) continue;
      const outside = b.left > box.x + box.w || b.left + b.width < box.x || b.top > box.y + box.h || b.top + b.height < box.y;
      if (outside) { canvas.remove(o); n++; continue; }
      if (o.type === 'image') { cropImage(o, box, true); n++; continue; }
      if (!shapeable(o)) continue;
      let d;
      try { d = V.boolean('intersect', worldD(o), rectD); } catch { continue; }
      if (!d) { canvas.remove(o); n++; continue; }
      const p = makePath(d, o); p.name = o.name; if (!closedish(o)) p.set('fill', null);
      replaceObject(o, p); n++;
    }
  });
  setTool('select');
  toast(n ? 'Cropped to the box · Undo restores it' : 'Everything is already inside the box');
}
function cropImage(img, box, quiet) {
  const inv = util.invertTransform(img.calcTransformMatrix());
  const a = util.transformPoint(new Point(box.x, box.y), inv), b = util.transformPoint(new Point(box.x + box.w, box.y + box.h), inv);
  const x0 = Math.max(0, Math.min(a.x, b.x) + img.width / 2), y0 = Math.max(0, Math.min(a.y, b.y) + img.height / 2);
  const x1 = Math.min(img.width, Math.max(a.x, b.x) + img.width / 2), y1 = Math.min(img.height, Math.max(a.y, b.y) + img.height / 2);
  if (x1 - x0 < 4 || y1 - y0 < 4) return;
  const centre = util.transformPoint(new Point((x0 + x1) / 2 - img.width / 2, (y0 + y1) / 2 - img.height / 2), img.calcTransformMatrix());
  img.set({ cropX: (img.cropX || 0) + x0, cropY: (img.cropY || 0) + y0, width: x1 - x0, height: y1 - y0 });
  img.setPositionByOrigin(centre, 'center', 'center');
  img.setCoords();
  if (!quiet) { canvas.fire('object:modified', { target: img }); setTool('select'); toast('Image cropped · Undo restores it'); }
}
const hexToRgb = (hex) => { const n = parseInt(String(hex).replace('#', ''), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return `#${A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join('')}`; };
const solid = (o) => (typeof o.fill === 'string' && o.fill.startsWith('#') ? o.fill : typeof o.stroke === 'string' && o.stroke.startsWith('#') ? o.stroke : '#888888');
function applyBlend() {
  const objs = byZ(active().filter(shapeable));
  if (objs.length !== 2) { toast('Select exactly two shapes to blend'); return; }
  const [a, b] = objs, steps = Math.max(1, Math.min(60, state.fx.blendSteps));
  let ds;
  try { ds = V.blendDs(worldD(a), worldD(b), steps); } catch { toast('Those objects can\'t be blended'); return; }
  const mids = ds.map((d, i) => {
    const t = (i + 1) / (steps + 1), p = makePath(d, a, { toolName: 'Blend step' });
    p.set({ fill: a.fill ? mix(solid(a), solid(b), t) : null, stroke: a.stroke || b.stroke ? mix(a.stroke || solid(a), b.stroke || solid(b), t) : null, opacity: a.opacity + (b.opacity - a.opacity) * t });
    delete p.gradSpec;
    return p;
  });
  canvas.discardActiveObject();
  let g;
  batch(() => { for (const o of objs) canvas.remove(o); g = style(new Group([a, ...mids, b]), { toolName: 'Blend group' }); canvas.add(g); });
  select([g]); toast(`Blended in ${steps} steps (Ctrl+U ungroups)`);
}
function applyContour() {
  const objs = active().filter(shapeable);
  if (!objs.length) { toast('Select a shape or text to contour'); return; }
  const fx = state.fx, outside = fx.contourDir === 'outside', steps = Math.max(1, Math.min(20, fx.contourSteps));
  canvas.discardActiveObject();
  const out = [];
  try {
    batch(() => {
      for (const o of objs) {
        const base = worldD(o), contours = [];
        for (let i = 1; i <= steps; i++) {
          const d = V.offsetD(base, (outside ? 1 : -1) * fx.contourOffset * MM * i);
          if (!d) break;
          const p = makePath(d, null, { toolName: 'Contour' });
          p.set({ fill: mix(solid(o), fx.contourColour, i / steps), stroke: null, strokeWidth: 0, opacity: o.opacity });
          contours.push(p);
        }
        if (!contours.length) continue;
        canvas.remove(o);
        const g = style(new Group(outside ? [...contours.reverse(), o] : [o, ...contours]), { toolName: 'Contour group' });
        g.name = `${o.name} contour`;
        canvas.add(g); out.push(g);
      }
    });
  } catch { toast('That object could not be contoured'); return; }
  select(out);
  if (out.length) toast(`Contour ${outside ? 'outside' : 'inside'} added (Ctrl+U ungroups)`);
}
function applyShadow(remove = false) {
  const objs = active();
  if (!objs.length) { toast('Select objects for the shadow'); return; }
  const fx = state.fx, [r, g, b] = hexToRgb(fx.shadowColour);
  applyToSelection(remove ? { shadow: null } : { shadow: new Shadow({ color: `rgba(${r},${g},${b},${fx.shadowOpacity / 100})`, blur: fx.shadowBlur * MM, offsetX: fx.shadowX * MM, offsetY: fx.shadowY * MM }) }, remove ? 'Shadow removed' : 'Drop shadow applied');
}
function applyTransparency() {
  const fx = state.fx;
  if (!active().length) { toast('Select objects first'); return; }
  if (fx.transp === 'none') applyToSelection((o) => { if (o.gradSpec?.fade) { const c = o.gradSpec.from; delete o.gradSpec; return { opacity: 1, fill: c }; } return { opacity: 1 }; }, 'Transparency removed');
  else if (fx.transp === 'uniform') applyToSelection({ opacity: 1 - fx.transpValue / 100 }, `Transparency ${fx.transpValue}%`);
  else applyToSelection((o) => {
    const c = o.gradSpec?.fade ? o.gradSpec.from : solid(o), [r, g, b] = hexToRgb(c);
    o.gradSpec = { from: c, to: `rgba(${r},${g},${b},${1 - fx.transpValue / 100})`, angle: fx.transpAngle, type: 'linear', fade: true };
    return { fill: gradientFor(o), opacity: 1 };
  }, 'Linear transparency applied');
}

/** The area an object covers on the page, outline included (block shadows and extrusions follow it). */
function regionD(o) {
  if (o.type === 'group') return o.getObjects().map(regionD).filter(Boolean).reduce((a, d) => (a ? V.boolean('unite', a, d) : d), '');
  if (o.type === 'image') return `M ${o.getCoords().map((q) => `${q.x} ${q.y}`).join(' L ')} Z`;
  if (!V.canConvert(o)) return '';
  const d = worldD(o), w = o.stroke && o.strokeWidth ? o.strokeWidth * (o.strokeUniform ? 1 : Math.max(Math.abs(o.scaleX), Math.abs(o.scaleY))) : 0;
  if (!o.fill || !V.isClosedD(d)) return w ? V.strokeOutlineD(d, w) : '';
  return w ? V.offsetD(d, w / 2) : d;
}
/** The filled area only (mesh fill colours stay inside it). */
function fillD(o) {
  if (o.type === 'group') return o.getObjects().map(fillD).filter(Boolean).reduce((a, d) => (a ? V.boolean('unite', a, d) : d), '');
  return V.canConvert(o) && o.fill ? worldD(o) : '';
}

// Distort and Envelope: the selected shapes and text become curves, bent as one piece per object.
function bend(o, fn, box) {
  if (o.type === 'group' && !o.powerClip) {
    const g = style(new Group(o.removeAll().map((k) => bend(k, fn, box)).filter(Boolean)), { toolName: o.toolName || 'Group' });
    for (const k of ['name', 'fxSweep', 'fxMesh']) if (o[k] !== undefined) g[k] = o[k];
    return g;
  }
  if (o.type === 'group' || !V.canConvert(o)) return o;
  // Empty text (a blank table cell) has nothing to bend: leave it out.
  const d = worldD(o), bent = d && fn(d, box);
  if (!bent) return isText(o) ? null : o;
  const p = makePath(bent, o);
  if (o.fxPart) p.fxPart = o.fxPart;
  if (!o.fill) p.set('fill', null);
  return p;
}
function reshapeSelection(fn, label) {
  const objs = active().filter(shapeable);
  if (!objs.length) { toast('Select shapes or text first (bitmaps can\'t be bent)'); return; }
  canvas.discardActiveObject();
  const out = [];
  try {
    batch(() => {
      for (const o of objs) {
        const n = bend(o, fn, V.dBounds(worldD(o)));
        if (!n) continue;
        n.name = isText(o) ? `“${o.text.slice(0, 18)}” ${label.toLowerCase()}` : o.name;
        replaceObject(o, n); out.push(n);
      }
    });
  } catch (err) { console.warn(err); toast('Those objects could not be bent'); return; }
  select(out);
  toast(`${label} applied: the result is curves (F10 edits the nodes, Undo restores the original)`);
}
const DISTORT_LABEL = { zipper: 'Zipper distortion', twister: 'Twister distortion', push: 'Push and pull distortion' };
function applyDistort() {
  const fx = state.fx, mode = fx.distort, amount = mode === 'zipper' ? fx.zipSize * MM : mode === 'twister' ? fx.twist : fx.push;
  reshapeSelection((d, box) => V.distortD(d, mode, amount, { teeth: fx.zipTeeth, box }), DISTORT_LABEL[mode] ?? 'Distortion');
}
function applyEnvelope() {
  const fx = state.fx;
  reshapeSelection((d, box) => V.envelopeD(d, fx.envelope, fx.envAmount * MM, { box }), 'Envelope');
}

// Block shadow and Extrude: a solid sweep of the object's outline, grouped behind it.
const SWEEP_LABEL = { blockshadow: 'Block shadow', extrude: 'Extrusion' };
function sweepParts(kind, region, d, dx, dy) {
  const fx = state.fx, p = makePath(d, null, { toolName: SWEEP_LABEL[kind] });
  p.fxPart = kind;
  if (kind === 'blockshadow') { p.set({ fill: fx.blockColour, stroke: null, strokeWidth: 0 }); return [p]; }
  // Extrude: the sides shade from the side colour (front) to dark (back), with the corner edges drawn in.
  const w = p.width, h = p.height, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, e = (Math.abs(ux) * w + Math.abs(uy) * h) / 2;
  p.set({ stroke: null, strokeWidth: 0, fill: new Gradient({ type: 'linear', gradientUnits: 'pixels', coords: { x1: w / 2 - ux * e, y1: h / 2 - uy * e, x2: w / 2 + ux * e, y2: h / 2 + uy * e }, colorStops: [{ offset: 0, color: fx.extColour }, { offset: 1, color: mix(fx.extColour, '#000000', 0.6) }] }) });
  const edges = V.sweepEdgesD(region, dx, dy);
  if (!edges) return [p];
  const lines = makePath(edges, null, { toolName: 'Extrusion edges' });
  lines.set({ fill: null, stroke: mix(fx.extColour, '#000000', 0.65), strokeWidth: 0.25 * MM, strokeUniform: true, strokeLineCap: 'round' });
  lines.fxPart = kind;
  return [p, lines];
}
function applySweep(kind, remove = false) {
  const objs = active(), label = SWEEP_LABEL[kind];
  if (!objs.length) { toast('Select shapes, text or images first'); return; }
  const fx = state.fx, [x, y] = kind === 'extrude' ? [fx.extX * MM, fx.extY * MM] : [fx.blockX * MM, fx.blockY * MM];
  canvas.discardActiveObject();
  const out = [];
  try {
    batch(() => {
      for (let o of objs) {
        // Applying again replaces the old block shadow / extrusion instead of stacking another one.
        if (o.fxSweep) { const kids = o.removeAll(), keep = kids.find((k) => !k.fxPart) ?? kids.at(-1); replaceObject(o, keep); o = keep; }
        if (remove) { out.push(o); continue; }
        const region = regionD(o), d = region && V.sweepD(region, x, y);
        if (!d) { out.push(o); continue; }
        const parts = sweepParts(kind, region, d, x, y), i = canvas.getObjects().indexOf(o);
        canvas.remove(o);
        const g = style(new Group([...parts, o]), { toolName: `${label} group` });
        g.fxSweep = kind; g.name = `${o.name} ${label.toLowerCase()}`;
        canvas.insertAt(Math.max(1, i), g);
        out.push(g);
      }
    });
  } catch (err) { console.warn(err); toast(`Could not add the ${label.toLowerCase()} to that object`); return; }
  select(out);
  toast(remove ? `${label} removed` : `${label} added · Apply again to change it · Ctrl+U ungroups`);
}

// Mesh fill: soft spots of colour inside a shape. Each spot is a copy of the shape with a
// radial fade, so it stays inside the outline and exports as vectors.
let meshTarget = null;
function meshFillAt(target, p) {
  if (!target) { toast('Click inside a shape or text'); return; }
  if (target.type === 'image') { toast('Mesh fill works on shapes and text'); return; }
  const mesh = target.fxMesh ? target : null, d = fillD(mesh ? mesh.getObjects()[0] : target);
  if (!d) { toast('Mesh fill needs a filled shape or text'); return; }
  const fx = state.fx, spot = makePath(d, null, { toolName: 'Mesh colour' }), c = spot.getCenterPoint();
  const x = p.x - c.x + spot.width / 2, y = p.y - c.y + spot.height / 2, k = Math.max(0, Math.min(100, fx.meshStrength)) / 100;
  spot.set({ stroke: null, strokeWidth: 0, fill: new Gradient({ type: 'radial', gradientUnits: 'pixels', coords: { x1: x, y1: y, r1: 0, x2: x, y2: y, r2: Math.max(1, fx.meshSize) * MM / 2 }, colorStops: [{ offset: 0, color: state.fill, opacity: k }, { offset: 1, color: state.fill, opacity: 0 }] }) });
  spot.fxPart = 'mesh';
  batch(() => {
    if (mesh) { mesh.add(spot); mesh.set('dirty', true); mesh.setCoords(); meshTarget = mesh; return; }
    const i = canvas.getObjects().indexOf(target);
    canvas.remove(target);
    const g = style(new Group([target, spot]), { toolName: 'Mesh fill' });
    g.fxMesh = true; g.name = `${target.name} mesh fill`;
    canvas.insertAt(Math.max(1, i), g);
    meshTarget = g;
  });
  applyToolFlags();
  canvas.requestRenderAll();
}
function removeMesh() {
  const g = one()?.fxMesh ? one() : canvas.getObjects().includes(meshTarget) ? meshTarget : null;
  if (!g) { toast('Click a shape with the Mesh Fill tool first, or select a mesh-filled object'); return; }
  canvas.discardActiveObject();
  let base;
  batch(() => { const kids = g.removeAll(); base = kids.find((k) => k.fxPart !== 'mesh') ?? kids[0]; replaceObject(g, base); });
  meshTarget = null;
  applyToolFlags();
  if (PICK_LIKE.has(state.tool)) select([base]);
  toast('Mesh fill colours removed');
}

// Table (CorelDRAW Table tool): cells with centred text, grouped; the text is typed in Properties.
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v) || lo));
function fitCell(t, cw, rh, size) {
  t.set('fontSize', size); t.initDimensions();
  const k = Math.min(1, (cw * 0.9) / (t.width || 1), (rh * 0.9) / (t.height || 1));
  if (k < 1) t.set('fontSize', size * k);
}
function buildTable({ rows, cols, w, h, texts = [], size, line = MM / 2, colour = '#000000', ink = '#000000', font = state.text.fontFamily }) {
  const cw = w / cols, rh = h / rows, cells = [], words = [];
  size ??= Math.min(rh * 0.45, 10 * MM);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    cells.push(new Rect({ left: c * cw - w / 2, top: r * rh - h / 2, width: cw, height: rh, fill: null, stroke: colour, strokeWidth: line, strokeUniform: true, cell: [r, c] }));
    const t = new IText(texts[r]?.[c] ?? '', { left: (c + 0.5) * cw - w / 2, top: (r + 0.5) * rh - h / 2, originX: 'center', originY: 'center', fontFamily: font, fontWeight: r === 0 && fontInfo(font).bold ? 700 : 400, fill: ink, textAlign: 'center', cell: [r, c] });
    fitCell(t, cw, rh, size);
    words.push(t);
  }
  const g = style(new Group([...cells, ...words]), { toolName: 'Table' });
  g.tableSpec = { rows, cols, size };
  return g;
}
function addTable(box) {
  const s = state.shape, ok = box && box.w > 8 * MM && box.h > 6 * MM;
  const b = ok ? box : { x: box?.x ?? page.width / 2, y: box?.y ?? page.height / 2, w: 120 * MM, h: 80 * MM };
  const g = buildTable({ rows: clampInt(s.tRows, 1, 30), cols: clampInt(s.tCols, 1, 12), w: b.w, h: b.h, line: Math.max(0.25, state.strokeWidth || 0.5) * MM, colour: state.stroke });
  g.setPositionByOrigin(new Point(b.x + b.w / 2, b.y + b.h / 2), 'center', 'center');
  canvas.add(g);
  setTool('select');
  canvas.setActiveObject(g);
  openTab('props');
  syncProps();
  toast('Table added: type the cell text in Properties · Ctrl+U ungroups it');
}
const tableCell = (g, t) => g.getObjects().find((o) => o.type === 'rect' && o.cell?.[0] === t.cell[0] && o.cell?.[1] === t.cell[1]);
function setCellText(g, t, value, commit) {
  const cell = tableCell(g, t);
  t.set('text', value);
  if (cell) fitCell(t, cell.width, cell.height, g.tableSpec.size);
  g.set('dirty', true);
  canvas.requestRenderAll();
  if (commit) canvas.fire('object:modified', { target: g });
}
function rebuildTable(g, change) {
  const spec = { ...g.tableSpec, ...change }, texts = [], kids = g.getObjects(), cell = kids.find((o) => o.type === 'rect'), word = kids.find(isText);
  for (const t of kids.filter(isText)) (texts[t.cell[0]] ??= [])[t.cell[1]] = t.text;
  const n = buildTable({ rows: spec.rows, cols: spec.cols, w: (cell?.width ?? 20) * g.tableSpec.cols, h: (cell?.height ?? 10) * g.tableSpec.rows, texts, size: spec.size, line: cell?.strokeWidth ?? MM / 2, colour: cell?.stroke ?? '#000000', ink: word?.fill ?? '#000000', font: word?.fontFamily });
  n.set({ scaleX: g.scaleX, scaleY: g.scaleY, angle: g.angle, flipX: g.flipX, flipY: g.flipY });
  n.setPositionByOrigin(g.getCenterPoint(), 'center', 'center');
  n.name = g.name;
  batch(() => replaceObject(g, n));
  canvas.setActiveObject(n);
  syncProps();
}
/** Properties tab: one box per cell, laid out like the table. */
function showTableCells(g) {
  const { rows, cols, size } = g.tableSpec, box = $('tbCells');
  for (const [id, v] of [['tbRows', rows], ['tbCols', cols], ['tbSize', +(size / MM).toFixed(1)]]) if (document.activeElement !== $(id)) $(id).value = String(v);
  const texts = g.getObjects().filter(isText);
  const word = texts[0];
  if (word && document.activeElement !== $('tbInk')) $('tbInk').value = hexOf(word.fill) ?? '#000000';
  if (word) $('tbFont').value = word.fontFamily;
  if (box._table === g && box.children.length === texts.length) {
    texts.forEach((t, i) => { if (document.activeElement !== box.children[i]) box.children[i].value = t.text; });
    return;
  }
  box._table = g;
  box.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  box.innerHTML = '';
  for (const t of texts) {
    const input = document.createElement('input');
    input.value = t.text; input.title = `Row ${t.cell[0] + 1}, column ${t.cell[1] + 1}`; input.placeholder = t.cell[0] === 0 ? 'Heading' : '';
    input.oninput = () => setCellText(g, t, input.value, false);
    input.onchange = () => setCellText(g, t, input.value, true);
    box.append(input);
  }
}

// Colour eyedropper (CorelDRAW): click to pick a colour, then the cursor becomes a paint bucket
// and each click fills an object with it. Shift+click (or Pick on the property bar) picks again.
const eye = { mode: 'pick', colour: null };
const inPage = (p) => p.x >= 0 && p.y >= 0 && p.x <= page.width && p.y <= page.height;
function setEyeMode(mode) {
  eye.mode = mode;
  $('eyePick').classList.toggle('on', mode === 'pick'); $('eyeApply').classList.toggle('on', mode === 'apply');
  if (state.tool !== 'eyedropper') return;
  canvas.defaultCursor = canvas.hoverCursor = toolCursor('eyedropper');
  canvas.setCursor(canvas.defaultCursor);
  hint(mode === 'apply' ? `Click objects to fill them with ${eye.colour} · Shift+click picks another colour · Esc to stop` : TOOL_HINTS.eyedropper);
}
/** The colour under the pointer: an object's exact fill or outline when it matches what's on screen, else the screen pixel. */
function colourAt(e, target) {
  let px = null;
  try {
    const r = canvas.getRetinaScaling(), v = canvas.getViewportPoint(e);
    const [R, G, Bl, A] = canvas.getContext().getImageData(Math.floor(v.x * r), Math.floor(v.y * r), 1, 1).data;
    if (A) px = rgbHex([R, G, Bl]);
  } catch { /* a bitmap from another site can't be read */ }
  const own = [target?.fill, target?.stroke].filter((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)).map((c) => c.toUpperCase());
  if (!px) return own[0] ?? null;
  const rgb = hexToRgb(px);
  return own.find((c) => hexToRgb(c).reduce((s, x, i) => s + Math.abs(x - rgb[i]), 0) < 30) ?? px;
}
function eyedropClick(opt, target, p) {
  if (eye.mode === 'pick' || opt.e.shiftKey || !eye.colour) {
    if (!target && !inPage(p)) { toast('Click a colour on the page'); return; }
    const c = colourAt(opt.e, target);
    if (!c) return;
    eye.colour = c;
    setColour(c, { apply: false });
    $('eyeChip').style.background = c;
    setEyeMode('apply');
    toast(`Picked ${c}: now click objects to fill them`);
    return;
  }
  if (!target) return;
  if (target.type === 'image') { toast('Bitmaps can\'t be filled: click shapes or text'); return; }
  paintObject(target, eye.colour, state.target === 'stroke');
  target.setCoords();
  canvas.fire('object:modified', { target });
  canvas.requestRenderAll();
}

// PowerClip: put objects inside a frame shape.
function startPowerClip() {
  const contents = active();
  if (!contents.length) { toast('Select the objects to place inside a frame first'); return; }
  pickFrame = contents;
  canvas.discardActiveObject();
  hint('Click the frame shape to place the objects inside it');
  canvas.defaultCursor = 'copy';
}
async function placeInFrame(frame) {
  const contents = pickFrame; pickFrame = null; hint(TOOL_HINTS[state.tool] ?? ''); canvas.defaultCursor = 'default';
  if (!frame || contents.includes(frame) || !shapeable(frame)) { toast('PowerClip cancelled: click a shape that is not one of the contents'); return; }
  const clip = makePath(worldD(frame), null);
  let pc;
  batch(() => {
    for (const o of contents) canvas.remove(o);
    const inner = new Group(contents);
    const c = clip.getCenterPoint(), local = util.transformPoint(c, util.invertTransform(inner.calcTransformMatrix()));
    clip.set({ originX: 'center', originY: 'center', left: local.x, top: local.y, fill: '#000', stroke: null });
    inner.clipPath = clip;
    const i = canvas.getObjects().indexOf(frame);
    canvas.remove(frame);
    pc = style(new Group([frame, inner]), { toolName: 'PowerClip' });
    pc.powerClip = true; pc.name = `PowerClip ${++counter}`;
    canvas.insertAt(Math.max(1, i), pc);
  });
  select([pc]); toast('Placed inside the frame (Object > PowerClip > Extract contents to undo)');
}
function extractPowerClip() {
  const pc = one();
  if (!pc?.powerClip) { toast('Select a PowerClip object'); return; }
  canvas.discardActiveObject();
  const out = [];
  batch(() => {
    const [frame, inner] = pc.removeAll();
    canvas.remove(pc);
    canvas.add(frame); out.push(frame);
    inner.clipPath = null;
    for (const o of inner.removeAll()) { canvas.add(o); out.push(o); }
  });
  select(out);
}

// Text on a path.
function fitTextToPath() {
  const sel = active(), text = sel.find(isText), curve = sel.find((o) => o !== text && shapeable(o));
  if (sel.length !== 2 || !text || !curve) { toast('Select one text and one curve or shape (Shift+click), then Fit text to path'); return; }
  let model = V.dToModel(worldD(curve), (p) => p).slice(0, 1);
  const sp = model[0];
  if (sp.closed) {
    // Run clockwise from the left so the text sits on top, as in CorelDRAW.
    let area = 0; for (let i = 0; i < sp.nodes.length; i++) { const a = sp.nodes[i], b = sp.nodes[(i + 1) % sp.nodes.length]; area += a.x * b.y - b.x * a.y; }
    if (area < 0) { sp.nodes.reverse(); for (const n of sp.nodes) [n.hi, n.ho] = [n.ho, n.hi]; }
    const k = sp.nodes.reduce((best, n, i) => (n.x < sp.nodes[best].x ? i : best), 0);
    sp.nodes = [...sp.nodes.slice(k), ...sp.nodes.slice(0, k)];
  }
  // Positions are page coordinates: leave the multi-selection first.
  canvas.discardActiveObject();
  const d = V.modelToD(model), guide = new Path(d, { fill: null, stroke: null });
  const length = V.toPaper(d).length, tw = text.calcTextWidth();
  text.set({ path: guide, angle: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, originX: 'center', originY: 'center', pathAlign: 'baseline', textAlign: 'left',
    pathStartOffset: Math.max(0, sp.closed ? length / 4 - tw / 2 : (length - tw) / 2) });
  text.initDimensions();
  text.setPositionByOrigin(guide.getCenterPoint(), 'center', 'center');
  text.setCoords();
  canvas.setActiveObject(text);
  canvas.fire('object:modified', { target: text }); canvas.requestRenderAll();
  toast('Text fitted to the path (Text > Straighten text undoes it)');
}
function straightenText() {
  const t = active().filter(isText).filter((o) => o.path);
  if (!t.length) { toast('Select text that is on a path'); return; }
  applyToSelection((o) => (isText(o) ? { path: null, pathStartOffset: 0 } : {}), 'Text straightened');
  for (const o of t) { o.initDimensions(); o.setCoords(); }
  canvas.requestRenderAll();
}

// ===================================================================
// Images, SVG and assets
// ===================================================================
const readFile = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
let assets = [];
async function addImage(src, name = 'Image', at) {
  if (/^data:image\/svg\+xml/.test(src) || /\.svg(\?|$)/i.test(src)) return addSvg(await (await fetch(src)).text(), name, at);
  const img = await FabricImage.fromURL(src, { crossOrigin: 'anonymous' });
  const k = Math.min((page.width * 0.6) / img.width, (page.height * 0.6) / img.height, 1 * MM * 4);
  img.set({ scaleX: k, scaleY: k, originX: 'center', originY: 'center', left: at?.x ?? page.width / 2, top: at?.y ?? page.height / 2, toolName: 'Image' });
  img.name = name.replace(/\.[a-z]+$/i, '') || 'Image';
  style(img);
  canvas.add(img);
  setTool('select');
  canvas.setActiveObject(img);
  canvas.requestRenderAll();
}
/** SVG files come in as editable vector objects (grouped), not a bitmap. */
async function addSvg(text, name = 'Vector', at) {
  const { objects, options } = await loadSVGFromString(text);
  const parts = objects.filter(Boolean);
  if (!parts.length) { toast('That SVG has no shapes the Artboard can use'); return; }
  const g = parts.length > 1 ? new Group(parts) : parts[0];
  const k = Math.min((page.width * 0.6) / (g.width || options.width || 100), (page.height * 0.6) / (g.height || options.height || 100));
  g.set({ scaleX: (g.scaleX || 1) * k, scaleY: (g.scaleY || 1) * k, originX: 'center', originY: 'center', left: at?.x ?? page.width / 2, top: at?.y ?? page.height / 2 });
  style(g, { toolName: 'SVG' });
  g.name = name.replace(/\.[a-z]+$/i, '') || 'Vector';
  canvas.add(g);
  setTool('select');
  canvas.setActiveObject(g);
  canvas.requestRenderAll();
  toast('SVG imported as vectors: Ctrl+U ungroups, F10 edits nodes');
}
function addAsset(src, name) {
  if (assets.some((a) => a.src === src)) return;
  assets.unshift({ src, name });
  renderAssets();
}
function renderAssets() {
  const box = $('assetGrid');
  box.innerHTML = '';
  $('assetsEmpty').style.display = assets.length ? 'none' : 'block';
  for (const a of assets) {
    const b = document.createElement('button');
    b.className = 'asset'; b.title = `${a.name} · click or drag onto the page`;
    b.style.backgroundImage = `url("${a.src}")`;
    b.draggable = true;
    b.ondragstart = (e) => e.dataTransfer.setData('text/x-asset', a.src);
    b.onclick = () => addImage(a.src, a.name);
    box.append(b);
  }
}
/** CorelDRAW files are converted to SVG by the website's server, then come back through addImage as vectors. */
async function importCorel(file) {
  if (HOST !== 'web' || !embedded()) { toast('CorelDRAW files can be imported on the 3DEEZI website · or export SVG from CorelDRAW'); return; }
  if (file.size > 20 * 1024 * 1024) { toast('Use CorelDRAW files under 20 MB'); return; }
  post({ type: 'convertFile', format: 'cdr', name: file.name, data: await readFile(file) });
  toast('Converting your CorelDRAW file…');
}
async function importFiles(files, at) {
  for (const file of files) {
    if (/\.cdr$/i.test(file.name)) { await importCorel(file); continue; }
    if (file.size > 8 * 1024 * 1024) { toast('Use files under 8 MB'); continue; }
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) { await addSvg(await file.text(), file.name, at); continue; }
    if (!file.type.startsWith('image/')) continue;
    const src = await readFile(file);
    addAsset(src, file.name);
    await addImage(src, file.name, at);
  }
}
$('fileImage').onchange = async (e) => { await importFiles([...e.target.files]); e.target.value = ''; };
$('assetUpload').onclick = () => $('fileImage').click();
wrap.addEventListener('dragover', (e) => e.preventDefault());
wrap.addEventListener('drop', async (e) => {
  e.preventDefault();
  const r = wrap.getBoundingClientRect();
  const at = util.transformPoint(new Point(e.clientX - r.left, e.clientY - r.top), util.invertTransform(canvas.viewportTransform));
  const colour = e.dataTransfer.getData('text/x-colour');
  if (colour) {
    const o = objectAt(at);
    if (!o) { toast('Drop the colour onto an object to fill it'); return; }
    paintObject(o, colour, false); canvas.fire('object:modified', { target: o }); canvas.requestRenderAll();
    return;
  }
  const src = e.dataTransfer.getData('text/x-asset');
  if (src) return addImage(src, 'Asset', at);
  await importFiles([...e.dataTransfer.files], at);
});

// ===================================================================
// Property bar and Properties tab
// ===================================================================
const active = () => (state.tool === 'node' && nodes.target ? [nodes.target] : canvas.getActiveObjects());
const one = () => (active().length === 1 ? active()[0] : null);
function applyToSelection(props, label) {
  const objs = active();
  if (!objs.length) return false;
  for (const o of objs) { applyProps(o, props); o.setCoords(); }
  canvas.requestRenderAll();
  canvas.fire('object:modified', { target: objs[0] });
  if (label) toast(label);
  return true;
}
// Fill and outline settings on a group go to its parts (as CorelDRAW): a table's cells and
// lines (not its text), a PowerClip's frame, the object under a block shadow / extrusion / mesh.
const PAINT_KEYS = new Set(['fill', 'stroke', 'strokeWidth', 'strokeDashArray', 'strokeLineCap', 'strokeLineJoin', 'strokeUniform']);
function paintParts(o) {
  if (o.type !== 'group') return o.type === 'image' ? [] : [o];
  if (o.powerClip) return paintParts(o.getObjects()[0]);
  const kids = o.getObjects().filter((k) => !k.fxPart && !(o.tableSpec && isText(k)));
  return kids.flatMap(paintParts);
}
function applyProps(o, props) {
  const p = typeof props === 'function' ? props(o) : props;
  if (o.type !== 'group' || !Object.keys(p).some((k) => PAINT_KEYS.has(k))) { o.set(p); return; }
  for (const part of paintParts(o)) {
    const q = typeof props === 'function' ? props(part) : props;
    part.set(Object.fromEntries(Object.entries(q).filter(([k]) => PAINT_KEYS.has(k))));
  }
  o.set({ ...Object.fromEntries(Object.entries(p).filter(([k]) => !PAINT_KEYS.has(k))), dirty: true });
}
/** A solid fill or outline colour (eyedropper, palette): outlines for open lines. */
function paintObject(o, hex, outline) {
  applyProps(o, (x) => {
    if (outline || x.type === 'line' || x.type === 'polyline' || (x.type === 'path' && !x.fill && x.stroke)) return { stroke: hex, strokeWidth: x.strokeWidth || MM / 2, strokeUniform: true };
    delete x.gradSpec; delete x.patSpec;
    return { fill: hex };
  });
}
function syncProps() {
  const o = one();
  const has = active().length > 0;
  for (const id of ['del', 'dup', 'front', 'back', 'lock', 'alL', 'alC', 'alR', 'alT', 'alM', 'alB', 'flipH', 'flipV']) $(id).disabled = !has;
  $('group').disabled = active().length < 2 && one()?.type !== 'group';
  // A group shows the colours of its parts (a table: its cells and lines).
  const p = o?.type === 'group' ? paintParts(o)[0] ?? o : o;
  const fill = p && typeof p.fill === 'string' ? p.fill : state.fill;
  $('fillChip').style.background = (p ? p.fill : state.fill) ? (typeof (p?.fill ?? state.fill) === 'string' ? fill : 'linear-gradient(110deg,#12E1F0,#1E7BFF)') : '';
  $('fillChip').classList.toggle('none', !!p && !p.fill);
  const stroke = p ? p.stroke : state.strokeWidth ? state.stroke : null;
  $('strokeChip').style.background = stroke || '';
  $('strokeChip').classList.toggle('none', !stroke || !(p ? p.strokeWidth : state.strokeWidth));
  $('strokeWidth').value = String(p ? +(p.strokeWidth / MM).toFixed(2) : state.strokeWidth);
  if (!$('strokeWidth').value) $('strokeWidth').value = '0';
  $('opacity').value = String(Math.round((o ? o.opacity : state.opacity) * 100));
  $('lock').classList.toggle('on', !!o?.locked);
  if (o) {
    const b = o.getBoundingRect();
    $('posX').value = inUnits(b.left); $('posY').value = inUnits(b.top);
    $('sizeW').value = inUnits(b.width); $('sizeH').value = inUnits(b.height);
  } else for (const id of ['posX', 'posY', 'sizeW', 'sizeH']) $(id).value = '';
  // Properties tab.
  $('propsEmpty').style.display = o ? 'none' : 'block';
  $('propsBody').style.display = o ? 'flex' : 'none';
  $('textProps').style.display = o && isText(o) ? 'flex' : 'none';
  $('rectProps').style.display = o && o.type === 'rect' ? 'flex' : 'none';
  $('outlineProps').style.display = o && o.type !== 'image' ? 'flex' : 'none';
  $('imgProps').style.display = o && o.type === 'image' ? 'flex' : 'none';
  if (o?.type === 'image') showAdjust(B.readAdjust(o));
  $('tableProps').style.display = o?.tableSpec ? 'flex' : 'none';
  if (o?.tableSpec) showTableCells(o);
  if (o) {
    $('pName').value = o.name ?? '';
    $('pAngle').value = String(Math.round(o.angle || 0));
    if (isText(o)) { $('pFont').value = o.fontFamily; $('pSize').value = String(Math.round(o.fontSize / MM)); $('pWeight').value = String(o.fontWeight); $('pSpacing').value = String(o.charSpacing || 0); }
    if (o.type === 'rect') $('pRadius').value = String(+((o.rx || 0) / MM).toFixed(1));
    $('pCap').value = p.strokeLineCap || 'butt'; $('pJoin').value = p.strokeLineJoin || 'miter';
    const ow = p.stroke ? p.strokeWidth || 0 : 0, da = p.strokeDashArray;
    $('pOW').value = String(+(ow / MM).toFixed(2));
    $('pODash').value = !da?.length ? 'solid' : da[0] > da[1] ? 'dashed' : 'dotted';
    $('pOC').value = typeof p.stroke === 'string' && /^#[0-9a-f]{6}$/i.test(p.stroke) ? p.stroke : state.stroke;
    $('pONote').hidden = ow > 0;
  }
  refreshLayers();
  syncTextBar();
  syncContext();
}
for (const ev of ['selection:created', 'selection:updated', 'selection:cleared', 'object:modified', 'object:scaling', 'object:moving', 'object:rotating']) canvas.on(ev, () => { if (state.tool === 'node' && ev === 'object:modified') nodes.refresh(); syncProps(); });

$('strokeWidth').onchange = (e) => {
  state.strokeWidth = Number(e.target.value);
  applyToSelection((o) => { const w = state.strokeWidth * MM; return { strokeWidth: w, stroke: w ? (o.stroke || state.stroke) : null, strokeDashArray: w ? strokeDash(w) : null, strokeUniform: true }; });
};
$('dash').onchange = (e) => { state.dash = e.target.value; applyToSelection((o) => ({ strokeDashArray: o.strokeWidth ? strokeDash(o.strokeWidth) : null })); };
$('opacity').onchange = (e) => { state.opacity = Math.max(0, Math.min(100, Number(e.target.value))) / 100; applyToSelection({ opacity: state.opacity }); };
$('fillChip').onclick = () => { openTab('colour'); setTarget('fill'); };
$('strokeChip').onclick = () => { openTab('colour'); setTarget('stroke'); if (!state.strokeWidth) { state.strokeWidth = 1; $('strokeWidth').value = '1'; applyToSelection({ strokeWidth: MM, stroke: state.stroke, strokeUniform: true }); } };
$('noFill').onclick = () => applyToSelection({ fill: null }, 'Fill removed');
$('noStroke').onclick = () => applyToSelection({ stroke: null, strokeWidth: 0 }, 'Outline removed');
for (const [id, key] of [['posX', 'left'], ['posY', 'top']]) $(id).onchange = (e) => { const o = one(); if (!o) return; const b = o.getBoundingRect(); o.set(key, o[key] + fromUnits(e.target.value) - (key === 'left' ? b.left : b.top)); o.setCoords(); canvas.fire('object:modified', { target: o }); canvas.requestRenderAll(); };
for (const [id, axis] of [['sizeW', 'x'], ['sizeH', 'y']]) $(id).onchange = (e) => {
  const o = one(); if (!o) return;
  const b = o.getBoundingRect(), want = fromUnits(e.target.value), have = axis === 'x' ? b.width : b.height;
  if (want > 0 && have > 0) { const k = want / have; if ($('ratio').classList.contains('on')) o.scale(o.scaleX * k); else o.set(axis === 'x' ? { scaleX: o.scaleX * k } : { scaleY: o.scaleY * k }); }
  o.setCoords(); canvas.fire('object:modified', { target: o }); canvas.requestRenderAll();
};
$('ratio').onclick = (e) => e.currentTarget.classList.toggle('on');
$('pName').onchange = (e) => { const o = one(); if (o) { o.name = e.target.value || o.name; refreshLayers(); record(); } };
$('pAngle').onchange = (e) => applyToSelection({ angle: Number(e.target.value) });
$('pFont').onchange = (e) => applyToSelection({ fontFamily: e.target.value });
$('pSize').onchange = (e) => applyToSelection({ fontSize: Number(e.target.value) * MM });
$('pWeight').onchange = (e) => applyToSelection({ fontWeight: Number(e.target.value) });
$('pSpacing').onchange = (e) => applyToSelection({ charSpacing: Number(e.target.value) });
$('pRadius').onchange = (e) => applyToSelection({ rx: Number(e.target.value) * MM, ry: Number(e.target.value) * MM });
// Outline pen: width, style and colour sit next to caps and corners (which only show on an outline).
const needsOutline = () => { if (!active().some((o) => o.stroke && o.strokeWidth)) toast('Caps and corners show on the outline: set an outline width first'); };
$('pCap').onchange = (e) => { applyToSelection({ strokeLineCap: e.target.value }); needsOutline(); };
$('pJoin').onchange = (e) => { applyToSelection({ strokeLineJoin: e.target.value }); needsOutline(); };
$('pOW').onchange = (e) => {
  const w = Math.max(0, Number(e.target.value) || 0) * MM;
  applyToSelection((o) => ({ strokeWidth: w, stroke: w ? (o.stroke || $('pOC').value) : null, strokeDashArray: w ? (o.strokeDashArray?.length ? strokeDash(w) : null) : null, strokeUniform: true }));
};
$('pODash').onchange = (e) => { state.dash = e.target.value; applyToSelection((o) => ({ strokeDashArray: o.strokeWidth ? strokeDash(o.strokeWidth) : null })); };
$('pOC').onchange = (e) => applyToSelection((o) => ({ stroke: e.target.value, strokeWidth: o.strokeWidth || MM, strokeUniform: true }));

// Image adjustments, background removal and Trace bitmap (Properties tab, image selected).
const ADJUST_IDS = { brightness: 'aBright', contrast: 'aContrast', saturation: 'aSat', blur: 'aBlur' };
function showAdjust(a) {
  for (const [k, id] of Object.entries(ADJUST_IDS)) { $(id).value = String(a[k]); $(`${id}V`).textContent = String(a[k]); }
  $('aGray').checked = a.grayscale;
}
const readAdjustInputs = () => ({ ...Object.fromEntries(Object.entries(ADJUST_IDS).map(([k, id]) => [k, Number($(id).value)])), grayscale: $('aGray').checked });
function adjustImage(commit) {
  const o = one(); if (o?.type !== 'image') return;
  const a = readAdjustInputs();
  for (const id of Object.values(ADJUST_IDS)) $(`${id}V`).textContent = $(id).value;
  o.filters = B.adjustFilters(a); o.applyFilters(); canvas.requestRenderAll();
  if (commit) canvas.fire('object:modified', { target: o });
}
for (const id of Object.values(ADJUST_IDS)) { $(id).oninput = () => adjustImage(false); $(id).onchange = () => adjustImage(true); }
$('aGray').onchange = () => adjustImage(true);
$('aReset').onclick = () => { showAdjust({ brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: false }); adjustImage(true); };

/** Replaces an image's pixels, keeping its size, position and adjustments on the page. */
async function replacePixels(o, pic) {
  const w = o.width * o.scaleX, h = o.height * o.scaleY, keep = o.filters;
  await o.setSrc(pic.canvas.toDataURL('image/png'));
  o.set({ cropX: 0, cropY: 0, scaleX: w / o.width, scaleY: h / o.height });
  o.filters = keep; o.applyFilters(); o.setCoords();
  canvas.requestRenderAll();
  canvas.fire('object:modified', { target: o });
}
$('bgRemove').onclick = async () => {
  const o = one(); if (o?.type !== 'image') return;
  const pic = B.imagePixels(o, 2048);
  if (!B.removeBackground(pic.ctx, pic.canvas.width, pic.canvas.height)) { toast('No plain background found around the edges of this image'); return; }
  await replacePixels(o, pic);
  toast('Background removed: it is now transparent, so the page or shapes behind show through (Undo restores it)');
};
$('trApply').onclick = async () => {
  const o = one(); if (o?.type !== 'image') return;
  const detail = $('trDetail').value, pic = B.imagePixels(o, B.TRACE_DETAIL[detail].max);
  const w = pic.canvas.width, h = pic.canvas.height, bg = $('trNoBg').checked ? B.borderColour(pic.ctx, w, h) : null;
  toast('Tracing…');
  await new Promise((r) => setTimeout(r, 30));
  const { objects } = await loadSVGFromString(B.traceSvg(pic.ctx, w, h, { colours: Number($('trColours').value), detail }));
  const parts = objects.filter((p) => p && (p.opacity ?? 1) > 0.05 && p.fill && !(bg && B.nearColour(p.fill, bg)));
  if (!parts.length) { toast('Nothing to trace: try more colours or keep the background'); return; }
  const g = new Group(parts);
  // Place the vectors exactly over the image: trace pixels -> image pixels -> page.
  const c = g.getCenterPoint(), at = util.transformPoint(new Point(c.x / pic.kx - o.width / 2, c.y / pic.ky - o.height / 2), o.calcTransformMatrix());
  g.set({ scaleX: o.scaleX / pic.kx, scaleY: o.scaleY / pic.ky, angle: o.angle, flipX: o.flipX, flipY: o.flipY });
  g.setPositionByOrigin(at, 'center', 'center');
  style(g, { toolName: 'Traced bitmap' });
  g.name = `${o.name || 'Image'} traced`;
  batch(() => canvas.insertAt(canvas.getObjects().indexOf(o) + 1, g));
  select([g]);
  toast(`Traced into ${parts.length} vector shapes · Ctrl+U ungroups, F10 edits nodes`);
};

// Arrange, align, distribute, flip, group, lock, duplicate, delete.
function align(how) {
  const objs = active(); if (!objs.length) return;
  // One object aligns to the page; several align to each other (as CorelDRAW).
  const rects = objs.map((o) => o.getBoundingRect());
  const ref = objs.length > 1
    ? { left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)), right: Math.max(...rects.map((r) => r.left + r.width)), bottom: Math.max(...rects.map((r) => r.top + r.height)) }
    : { left: 0, top: 0, right: page.width, bottom: page.height };
  if (how === 'P') { ref.left = 0; ref.top = 0; ref.right = page.width; ref.bottom = page.height; }
  const sel = canvas.getActiveObject();
  const list = objs.length > 1 && how !== 'P' ? objs : [objs.length > 1 ? sel : objs[0]];
  if (objs.length > 1 && how !== 'P') canvas.discardActiveObject();
  for (const o of list) {
    const b = o.getBoundingRect();
    const dx = how === 'L' ? ref.left - b.left : how === 'C' || how === 'P' ? (ref.left + ref.right) / 2 - (b.left + b.width / 2) : how === 'R' ? ref.right - (b.left + b.width) : 0;
    const dy = how === 'T' ? ref.top - b.top : how === 'M' || how === 'P' ? (ref.top + ref.bottom) / 2 - (b.top + b.height / 2) : how === 'B' ? ref.bottom - (b.top + b.height) : 0;
    o.set({ left: o.left + dx, top: o.top + dy }); o.setCoords();
  }
  if (objs.length > 1 && how !== 'P') select(objs);
  canvas.fire('object:modified', { target: objs[0] }); canvas.requestRenderAll();
}
function distribute(axis) {
  const objs = active();
  if (objs.length < 3) { toast('Select three or more objects to distribute'); return; }
  canvas.discardActiveObject();
  const centre = (o) => { const b = o.getBoundingRect(); return axis === 'x' ? b.left + b.width / 2 : b.top + b.height / 2; };
  const sorted = objs.slice().sort((a, b) => centre(a) - centre(b)), first = centre(sorted[0]), step = (centre(sorted.at(-1)) - first) / (sorted.length - 1);
  sorted.forEach((o, i) => { const d = first + step * i - centre(o); o.set(axis === 'x' ? { left: o.left + d } : { top: o.top + d }); o.setCoords(); });
  select(objs);
  canvas.fire('object:modified', { target: objs[0] }); canvas.requestRenderAll();
}
for (const k of ['L', 'C', 'R', 'T', 'M', 'B']) $(`al${k}`).onclick = () => align(k);
$('flipH').onclick = () => applyToSelection((o) => ({ flipX: !o.flipX }));
$('flipV').onclick = () => applyToSelection((o) => ({ flipY: !o.flipY }));
function order(how) {
  const objs = byZ(active());
  if (!objs.length) return;
  if (how === 'front') for (const o of objs) canvas.bringObjectToFront(o);
  else if (how === 'back') for (const o of objs.slice().reverse()) { canvas.sendObjectToBack(o); canvas.bringObjectForward(o); }
  else if (how === 'forward') for (const o of objs.slice().reverse()) canvas.bringObjectForward(o);
  else for (const o of objs) { if (canvas.getObjects().indexOf(o) > 1) canvas.sendObjectBackwards(o); }
  canvas.fire('object:modified', {});
}
$('front').onclick = () => order('front');
$('back').onclick = () => order('back');
$('del').onclick = () => removeSelection();
$('dup').onclick = () => duplicate();
$('lock').onclick = () => { const o = one(); if (!o) return; setLocked(o, !o.locked); syncProps(); };
$('group').onclick = () => groupToggle();
function removeSelection() {
  if (state.tool === 'node' && nodes.target) { nodes.op('delete'); return; }
  const objs = canvas.getActiveObjects(); if (!objs.length) return;
  canvas.discardActiveObject(); batch(() => { for (const o of objs) canvas.remove(o); }); canvas.requestRenderAll();
}
async function duplicate(offset = 10 * MM, source = active()) {
  if (!source.length) return;
  canvas.discardActiveObject();
  const clones = [];
  muted++;
  for (const o of source) { const c = await o.clone(EXTRA); c.set({ left: c.left + offset, top: c.top + offset }); c.name = `${o.name} copy`; style(c); canvas.add(c); clones.push(c); }
  muted--; refreshLayers(); record();
  select(clones);
}
let clipboard = [];
async function copy(cut = false) {
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  clipboard = await Promise.all(objs.map((o) => o.clone(EXTRA)));
  if (cut) removeSelection();
  toast(cut ? 'Cut' : 'Copied');
}
async function paste() { if (clipboard.length) await duplicate(10 * MM, clipboard); }
function setLocked(o, locked) {
  o.locked = locked;
  o.set({ lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, hasControls: !locked });
  canvas.fire('object:modified', { target: o });
}
function groupToggle(mode) {
  const sel = canvas.getActiveObject();
  if (!sel) return;
  if (sel.type === 'activeselection' && mode !== 'ungroup') {
    const objs = byZ(sel.getObjects());
    canvas.discardActiveObject();
    let g;
    batch(() => { for (const o of objs) canvas.remove(o); g = style(new Group(objs), { toolName: 'Group' }); canvas.add(g); });
    canvas.setActiveObject(g);
  } else if (sel.type === 'group' && mode !== 'group') {
    if (sel.powerClip) { extractPowerClip(); return; }
    const objs = sel.removeAll();
    batch(() => { canvas.remove(sel); for (const o of objs) { style(o); canvas.add(o); } });
    canvas.setActiveObject(new ActiveSelection(objs, { canvas }));
  }
  canvas.requestRenderAll();
}

// ===================================================================
// Context property bars (change with the tool and selection)
// ===================================================================
const show = (id, on) => { const el = $(id); if (el) el.hidden = !on; };
function syncContext() {
  const t = state.tool, sel = canvas.getActiveObjects(), n = sel.length, o = n === 1 ? sel[0] : null;
  const pick = t === 'select';
  show('ctx-node', t === 'node');
  show('ctx-shaping', pick && n >= 2);
  show('ctx-curves', pick && n >= 1 && sel.some(shapeable));
  show('ctx-brush', SCULPT.has(t) || t === 'eraser');
  const polyTool = ['polygon', 'star', 'cstar'].includes(t) ? t : pick && o?.shapeSpec && ['polygon', 'star', 'cstar'].includes(o.shapeSpec.tool) ? o.shapeSpec.tool : null;
  show('ctx-poly', !!polyTool);
  show('ctx-spiral', t === 'spiral' || (pick && o?.shapeSpec?.tool === 'spiral'));
  show('ctx-graph', t === 'graph');
  show('ctx-shapes', t.startsWith('shape:') || (pick && o?.shapeSpec?.tool?.startsWith('shape:')));
  show('ctx-rect', t === 'rect' || (pick && o?.type === 'rect'));
  show('ctx-blend', t === 'blend'); show('ctx-contour', t === 'contour'); show('ctx-shadow', t === 'shadow'); show('ctx-transp', t === 'transparency');
  show('ctx-distort', t === 'distort'); show('ctx-envelope', t === 'envelope'); show('ctx-extrude', t === 'extrude'); show('ctx-block', t === 'blockshadow');
  show('ctx-mesh', t === 'meshfill' || (pick && !!o?.fxMesh)); show('ctx-table', t === 'table'); show('ctx-eyedrop', t === 'eyedropper');
  if (t === 'distort') { const m = state.fx.distort; show('fxDZipWrap', m === 'zipper'); show('fxDTwistWrap', m === 'twister'); show('fxDPushWrap', m === 'push'); }
  if (t === 'eyedropper') { $('eyeTo').value = state.target; $('eyeChip').style.background = eye.colour ?? current(); $('eyePick').classList.toggle('on', eye.mode === 'pick'); $('eyeApply').classList.toggle('on', eye.mode === 'apply'); }
  $('meshChip').style.background = state.fill;
  if (polyTool) {
    const s = state.shape, star = polyTool !== 'polygon';
    $('cPoints').value = String(polyTool === 'polygon' ? s.sides : polyTool === 'star' ? s.points : s.cpoints);
    $('cSharpWrap').hidden = !star;
    $('cSharp').max = polyTool === 'cstar' ? '10' : '99';
    $('cSharp').value = String(polyTool === 'star' ? s.sharp : s.csharp);
    $('ctx-poly').dataset.tool = polyTool;
  }
  if (t === 'node') {
    $('nodeInfo').textContent = nodes.target ? `${nodes.selectedCount} of ${nodes.nodeCount} nodes selected` : 'Click a curve or shape';
    const type = nodes.selectedType();
    for (const k of ['cusp', 'smooth', 'symmetric']) $(`n-${k}`).classList.toggle('on', type === k);
  }
  if (t.startsWith('shape:') || o?.shapeSpec?.tool?.startsWith('shape:')) renderShapeGallery();
  $('rectRadius').value = String(o?.type === 'rect' ? +((o.rx || 0) / MM).toFixed(1) : state.shape.radiusRect ?? 0);
}
function renderShapeGallery() {
  const set = V.SHAPE_SETS[state.shape.set] ?? V.SHAPE_SETS.basic, box = $('shapeGallery');
  if (box.dataset.set === state.shape.set && box.dataset.item === state.shape.item) return;
  box.dataset.set = state.shape.set; box.dataset.item = state.shape.item;
  box.innerHTML = `<label>${set.label}</label>${set.items.map(([id, label, d]) => `<button class="ibtn shape-pick${state.shape.item === id ? ' on' : ''}" data-shape="${id}" title="${label}"><svg viewBox="-6 -6 112 112"><path d="${d}" fill-rule="evenodd"/></svg></button>`).join('')}`;
  box.querySelectorAll('[data-shape]').forEach((b) => (b.onclick = () => {
    state.shape.item = b.dataset.shape; savePrefs(); renderShapeGallery();
    regenerateSelected();
  }));
}
/** Shapes drawn with the Object and Basic-shape tools follow their bar settings until node-edited. */
function regenerateSelected() {
  const objs = canvas.getActiveObjects().filter((o) => o.shapeSpec && o.type === 'path');
  if (!objs.length) return;
  for (const o of objs) {
    const tool = o.shapeSpec.tool, b = V.dBounds(worldD(o));
    if (tool.startsWith('shape:')) state.shape.set = o.shapeSpec.set ?? state.shape.set;
    V.setWorldPath(o, V.boxD(unitFor(tool), { x: b.left, y: b.top, w: b.width, h: b.height }));
    o.shapeSpec = specFor(tool);
    refill(o);
  }
  canvas.requestRenderAll();
  canvas.fire('object:modified', { target: objs[0] });
}
function bindNumber(id, fn) { $(id).onchange = (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) { fn(v); savePrefs(); } }; }
bindNumber('cPoints', (v) => { const t = $('ctx-poly').dataset.tool, s = state.shape; if (t === 'polygon') s.sides = Math.max(3, Math.min(60, Math.round(v))); else if (t === 'star') s.points = Math.max(3, Math.min(60, Math.round(v))); else s.cpoints = Math.max(5, Math.min(60, Math.round(v))); regenerateSelected(); });
bindNumber('cSharp', (v) => { const t = $('ctx-poly').dataset.tool; if (t === 'star') state.shape.sharp = Math.max(1, Math.min(99, v)); else state.shape.csharp = Math.max(1, Math.min(10, Math.round(v))); regenerateSelected(); });
bindNumber('cRevs', (v) => { state.shape.revs = Math.max(1, Math.min(40, Math.round(v))); regenerateSelected(); });
$('cSpiralType').onchange = (e) => { state.shape.log = e.target.value === 'log'; $('cExpandWrap').hidden = !state.shape.log; savePrefs(); regenerateSelected(); };
bindNumber('cExpand', (v) => { state.shape.expand = Math.max(1, Math.min(100, v)); regenerateSelected(); });
bindNumber('cCols', (v) => { state.shape.cols = Math.max(1, Math.min(50, Math.round(v))); });
bindNumber('cRows', (v) => { state.shape.rows = Math.max(1, Math.min(50, Math.round(v))); });
bindNumber('cRadius', (v) => { state.shape.radius = Math.max(1, Math.min(200, v)); state.shape.eraser = state.tool === 'eraser' ? Math.max(0.5, Math.min(200, v)) : state.shape.eraser; nodes.setBrush({ radius: (state.tool === 'eraser' ? state.shape.eraser / 2 : state.shape.radius) * MM }); });
bindNumber('rectRadius', (v) => { state.shape.radiusRect = Math.max(0, v); const o = one(); if (o?.type === 'rect') applyToSelection({ rx: v * MM, ry: v * MM }); });
bindNumber('fxSteps', (v) => { state.fx.blendSteps = Math.max(1, Math.min(60, Math.round(v))); });
bindNumber('fxCSteps', (v) => { state.fx.contourSteps = Math.max(1, Math.min(20, Math.round(v))); });
bindNumber('fxCOffset', (v) => { state.fx.contourOffset = Math.max(0.1, Math.min(100, v)); });
$('fxCDir').onchange = (e) => { state.fx.contourDir = e.target.value; savePrefs(); };
$('fxCColour').oninput = (e) => { state.fx.contourColour = e.target.value; savePrefs(); };
for (const [id, k] of [['fxSX', 'shadowX'], ['fxSY', 'shadowY'], ['fxSBlur', 'shadowBlur'], ['fxSOpacity', 'shadowOpacity']]) bindNumber(id, (v) => { state.fx[k] = v; });
$('fxSColour').oninput = (e) => { state.fx.shadowColour = e.target.value; savePrefs(); };
$('fxTType').onchange = (e) => { state.fx.transp = e.target.value; $('fxTAngleWrap').hidden = e.target.value !== 'linear'; savePrefs(); };
bindNumber('fxTValue', (v) => { state.fx.transpValue = Math.max(0, Math.min(100, v)); });
bindNumber('fxTAngle', (v) => { state.fx.transpAngle = v; });
$('fxDMode').onchange = (e) => { state.fx.distort = e.target.value; savePrefs(); syncContext(); };
bindNumber('fxDZip', (v) => { state.fx.zipSize = Math.max(-50, Math.min(50, v)); });
bindNumber('fxDTeeth', (v) => { state.fx.zipTeeth = clampInt(v, 2, 300); });
bindNumber('fxDTwist', (v) => { state.fx.twist = Math.max(-1440, Math.min(1440, v)); });
bindNumber('fxDPush', (v) => { state.fx.push = Math.max(-100, Math.min(100, v)); });
$('fxEPreset').onchange = (e) => { state.fx.envelope = e.target.value; savePrefs(); };
bindNumber('fxEAmount', (v) => { state.fx.envAmount = Math.max(-500, Math.min(500, v)); });
for (const [id, k] of [['fxXX', 'extX'], ['fxXY', 'extY'], ['fxBX', 'blockX'], ['fxBY', 'blockY']]) bindNumber(id, (v) => { state.fx[k] = Math.max(-200, Math.min(200, v)); });
$('fxXColour').oninput = (e) => { state.fx.extColour = e.target.value; savePrefs(); };
$('fxBColour').oninput = (e) => { state.fx.blockColour = e.target.value; savePrefs(); };
bindNumber('fxMSize', (v) => { state.fx.meshSize = Math.max(1, Math.min(1000, v)); });
bindNumber('fxMStrength', (v) => { state.fx.meshStrength = Math.max(0, Math.min(100, v)); });
bindNumber('tRows', (v) => { state.shape.tRows = clampInt(v, 1, 30); });
bindNumber('tCols', (v) => { state.shape.tCols = clampInt(v, 1, 12); });
$('fxDistort').onclick = applyDistort; $('fxEnvelope').onclick = applyEnvelope;
$('fxExtrude').onclick = () => applySweep('extrude'); $('fxExtrudeOff').onclick = () => applySweep('extrude', true);
$('fxBlock').onclick = () => applySweep('blockshadow'); $('fxBlockOff').onclick = () => applySweep('blockshadow', true);
$('fxMeshClear').onclick = removeMesh;
$('meshChip').onclick = () => { openTab('colour'); setTarget('fill'); };
$('eyePick').onclick = () => setEyeMode('pick');
$('eyeApply').onclick = () => { if (!eye.colour) { toast('Pick a colour first: click any colour on the page'); return; } setEyeMode('apply'); };
$('eyeTo').onchange = (e) => setTarget(e.target.value);
// Table card (Properties tab): rows, columns and text size rebuild the table; each box edits one cell.
for (const [id, key, lo, hi] of [['tbRows', 'rows', 1, 30], ['tbCols', 'cols', 1, 12]]) $(id).onchange = (e) => { const g = one(); if (g?.tableSpec) rebuildTable(g, { [key]: clampInt(Number(e.target.value), lo, hi) }); };
$('tbSize').onchange = (e) => { const g = one(), mm = Number(e.target.value); if (g?.tableSpec && mm > 0) rebuildTable(g, { size: Math.min(200, mm) * MM }); };
$('fxBlend').onclick = applyBlend; $('fxContour').onclick = applyContour;
$('fxShadow').onclick = () => applyShadow(false); $('fxShadowOff').onclick = () => applyShadow(true);
$('fxTransp').onclick = applyTransparency;
document.querySelectorAll('[data-node]').forEach((b) => (b.onclick = () => nodes.op(b.dataset.node)));
document.querySelectorAll('[data-shaping]').forEach((b) => (b.onclick = () => shaping(b.dataset.shaping)));
function initContextValues() {
  const s = state.shape, f = state.fx;
  $('cRevs').value = String(s.revs); $('cSpiralType').value = s.log ? 'log' : 'sym'; $('cExpand').value = String(s.expand); $('cExpandWrap').hidden = !s.log;
  $('cCols').value = String(s.cols); $('cRows').value = String(s.rows); $('cRadius').value = String(s.radius);
  $('fxSteps').value = String(f.blendSteps); $('fxCDir').value = f.contourDir; $('fxCSteps').value = String(f.contourSteps); $('fxCOffset').value = String(f.contourOffset); $('fxCColour').value = f.contourColour;
  $('fxSX').value = String(f.shadowX); $('fxSY').value = String(f.shadowY); $('fxSBlur').value = String(f.shadowBlur); $('fxSOpacity').value = String(f.shadowOpacity); $('fxSColour').value = f.shadowColour;
  $('fxTType').value = f.transp; $('fxTValue').value = String(f.transpValue); $('fxTAngle').value = String(f.transpAngle); $('fxTAngleWrap').hidden = f.transp !== 'linear';
  $('fxDMode').value = f.distort; $('fxDZip').value = String(f.zipSize); $('fxDTeeth').value = String(f.zipTeeth); $('fxDTwist').value = String(f.twist); $('fxDPush').value = String(f.push);
  $('fxEPreset').value = f.envelope; $('fxEAmount').value = String(f.envAmount);
  $('fxXX').value = String(f.extX); $('fxXY').value = String(f.extY); $('fxXColour').value = f.extColour;
  $('fxBX').value = String(f.blockX); $('fxBY').value = String(f.blockY); $('fxBColour').value = f.blockColour;
  $('fxMSize').value = String(f.meshSize); $('fxMStrength').value = String(f.meshStrength);
  $('tRows').value = String(s.tRows); $('tCols').value = String(s.tCols);
}

// ===================================================================
// Layers tab
// ===================================================================
function refreshLayers() {
  const list = $('layerList');
  if (!list || restoring || muted) return;
  renderDocPalette();
  const objs = userObjects().slice().reverse();
  $('layersEmpty').style.display = objs.length ? 'none' : 'block';
  $('layerCount').textContent = String(objs.length);
  const selected = new Set(active());
  list.innerHTML = '';
  for (const o of objs) {
    const row = document.createElement('div');
    row.className = `layer ${selected.has(o) ? 'on' : ''}`;
    const thumb = o.type === 'image' ? `<img src="${o.getSrc()}" alt="">` : isText(o) ? '<b style="color:#000">T</b>' : `<span style="width:16px;height:16px;border-radius:${o.type === 'ellipse' ? '50%' : '3px'};background:${typeof o.fill === 'string' ? o.fill : o.stroke || '#12E1F0'}"></span>`;
    row.innerHTML = `<span class="thumb">${thumb}</span><span class="name"></span><span class="acts"><button data-a="up" title="Bring forward">${icon('up')}</button><button data-a="down" title="Send backward">${icon('down')}</button><button data-a="vis" title="Show / hide">${icon(o.visible ? 'eye' : 'eyeOff')}</button><button data-a="lock" title="Lock">${icon(o.locked ? 'lock' : 'unlock')}</button><button data-a="del" title="Delete">${icon('trash')}</button></span>`;
    row.querySelector('.name').textContent = isText(o) ? `“${o.text}”` : o.name;
    row.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'up') canvas.bringObjectForward(o);
      else if (a === 'down') { if (canvas.getObjects().indexOf(o) > 1) canvas.sendObjectBackwards(o); }
      else if (a === 'vis') o.visible = !o.visible;
      else if (a === 'lock') setLocked(o, !o.locked);
      else if (a === 'del') { canvas.remove(o); return; }
      else if (o.visible && !o.locked) { if (state.tool === 'node') nodes.start(o); else { if (!PICK_LIKE.has(state.tool)) setTool('select'); canvas.setActiveObject(o); } }
      canvas.requestRenderAll();
      if (a) canvas.fire('object:modified', { target: o });
      refreshLayers();
    };
    list.append(row);
  }
}

// ===================================================================
// Colour tab: picker, palettes, recent, harmony, gradient
// ===================================================================
let hsv = { h: 186, s: 0.92, v: 0.94 };
const hsvToHex = ({ h, s, v }) => {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
};
const hexToHsv = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16) || 0, r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
};
function drawPicker() {
  const sv = $('svCanvas'), hue = $('hueCanvas');
  for (const c of [sv, hue]) { c.width = c.clientWidth || 260; c.height = c.clientHeight || 180; }
  const g = sv.getContext('2d');
  g.fillStyle = `hsl(${hsv.h},100%,50%)`; g.fillRect(0, 0, sv.width, sv.height);
  const w = g.createLinearGradient(0, 0, sv.width, 0); w.addColorStop(0, '#fff'); w.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = w; g.fillRect(0, 0, sv.width, sv.height);
  const k = g.createLinearGradient(0, 0, 0, sv.height); k.addColorStop(0, 'rgba(0,0,0,0)'); k.addColorStop(1, '#000'); g.fillStyle = k; g.fillRect(0, 0, sv.width, sv.height);
  const hg = hue.getContext('2d'), hgrad = hg.createLinearGradient(0, 0, 0, hue.height);
  [0, 60, 120, 180, 240, 300, 360].forEach((d, i) => hgrad.addColorStop(i / 6, `hsl(${d},100%,50%)`));
  hg.fillStyle = hgrad; hg.fillRect(0, 0, hue.width, hue.height);
  Object.assign($('svDot').style, { left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) });
  Object.assign($('hueDot').style, { top: `${(hsv.h / 360) * 100}%` });
}
function current() { return state.target === 'fill' ? state.fill : state.stroke; }
function setColour(hex, { recent = true, apply = true } = {}) {
  hex = hex.toUpperCase();
  if (state.target === 'fill') state.fill = hex; else state.stroke = hex;
  hsv = hexToHsv(hex);
  $('hexIn').value = hex; $('hexChip').style.background = hex; showValues(hex);
  drawPicker(); drawHarmony();
  if (state.gradient && state.target === 'fill') state.gradient.from = hex;
  if (apply) {
    if (state.target === 'fill') applyToSelection((o) => {
      if (o.type === 'line' || o.type === 'polyline' || (o.type === 'path' && !o.fill && o.stroke)) return { stroke: hex };
      if (state.gradient) { o.gradSpec = { ...state.gradient }; delete o.patSpec; return { fill: gradientFor(o) }; }
      if (state.pattern) { o.patSpec = { ...state.pattern, ink: hex }; delete o.gradSpec; return { fill: patternFor(o.patSpec) }; }
      delete o.gradSpec; delete o.patSpec;
      return { fill: hex };
    });
    else applyToSelection((o) => ({ stroke: hex, strokeWidth: o.strokeWidth || MM, strokeUniform: true }));
  }
  if (canvas.isDrawingMode) canvas.freeDrawingBrush.color = hex;
  if (recent) { state.recent = [hex, ...state.recent.filter((c) => c !== hex)].slice(0, 7); renderSwatches(); savePrefs(); }
  syncProps();
}
function setTarget(t) {
  state.target = t;
  for (const b of document.querySelectorAll('[data-target]')) b.classList.toggle('on', b.dataset.target === t);
  const hex = current(); hsv = hexToHsv(hex); $('hexIn').value = hex; $('hexChip').style.background = hex; showValues(hex); drawPicker(); drawHarmony();
}
// RGB and CMYK values for the current colour (CMYK is a plain conversion, no print profile).
const toCmyk = ([r, g, b]) => { const k = 1 - Math.max(r, g, b) / 255; return k >= 1 ? [0, 0, 0, 100] : [r, g, b].map((v) => Math.round(((1 - v / 255 - k) / (1 - k)) * 100)).concat(Math.round(k * 100)); };
const fromCmyk = ([c, m, y, k]) => [c, m, y].map((v) => Math.round(255 * (1 - v / 100) * (1 - k / 100)));
const rgbHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const RGB_IDS = ['cR', 'cG', 'cB'], CMYK_IDS = ['cC', 'cM', 'cY', 'cK'];
function showValues(hex) {
  const rgb = hexToRgb(hex), cmyk = toCmyk(rgb);
  RGB_IDS.forEach((id, i) => { $(id).value = String(rgb[i]); });
  CMYK_IDS.forEach((id, i) => { $(id).value = String(cmyk[i]); });
}
const readNums = (ids, max) => ids.map((id) => Math.max(0, Math.min(max, Number($(id).value) || 0)));
for (const id of RGB_IDS) $(id).onchange = () => setColour(rgbHex(readNums(RGB_IDS, 255)));
for (const id of CMYK_IDS) $(id).onchange = () => setColour(rgbHex(fromCmyk(readNums(CMYK_IDS, 100))));
for (const b of document.querySelectorAll('[data-target]')) b.onclick = () => setTarget(b.dataset.target);
function pickDrag(el, onMove) {
  const handle = (e) => { const r = el.getBoundingClientRect(); onMove(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))); };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId); handle(e);
    const move = (ev) => handle(ev);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); setColour(hsvToHex(hsv)); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  });
}
pickDrag($('sv'), (x, y) => { hsv.s = x; hsv.v = 1 - y; setColour(hsvToHex(hsv), { recent: false }); });
pickDrag($('hue'), (_, y) => { hsv.h = y * 360; setColour(hsvToHex(hsv), { recent: false }); });
$('hexIn').onchange = (e) => { const v = e.target.value.trim().replace(/^#?/, '#'); if (/^#[0-9a-f]{6}$/i.test(v)) setColour(v); };
function renderSwatches() {
  const make = (box, colours, add) => {
    box.innerHTML = '';
    for (const c of colours) { const b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.title = c; b.onclick = () => setColour(c); box.append(b); }
    if (add) { const b = document.createElement('button'); b.className = 'sw add'; b.title = 'Save current colour'; b.innerHTML = icon('plus'); b.onclick = () => { state.saved = [current(), ...state.saved.filter((c) => c !== current())].slice(0, 12); savePrefs(); renderSwatches(); }; box.append(b); }
  };
  make($('brandSw'), [...BRAND, ...state.saved], true);
  make($('recentSw'), state.recent.length ? state.recent : ['#12E1F0', '#1E7BFF', '#7B4DFF', '#5D6B7B', '#000000', '#FFFFFF']);
}
// ===================================================================
// Bottom colour palette (CorelDRAW): click = fill, right-click = outline, X = none,
// drag a colour onto an object to fill it. "Document" shows the colours in use.
// ===================================================================
const PALETTE = [
  ['White', '#FFFFFF'], ['10% black', '#E6E6E6'], ['20% black', '#CCCCCC'], ['40% black', '#999999'], ['60% black', '#666666'], ['80% black', '#333333'], ['Black', '#000000'],
  ['Cream', '#F3E9D2'], ['Vegas gold', '#C5B358'], ['Athletic gold', '#FFB81C'], ['Yellow', '#FFE100'], ['Orange', '#FF6A13'], ['Burnt orange', '#CC5500'],
  ['Red', '#E10600'], ['Cardinal', '#9D2235'], ['Maroon', '#6A1F2B'], ['Pink', '#F59BBB'], ['Hot pink', '#E6007E'], ['Purple', '#5B2C8F'], ['Lavender', '#B4A7D6'],
  ['Navy', '#0B1F41'], ['Royal blue', '#1E4FD8'], ['Sky blue', '#4AB3E6'], ['Columbia blue', '#9BCBEB'], ['Teal', '#00827F'], ['Aqua', '#00B5AD'],
  ['Kelly green', '#00843D'], ['Forest green', '#1F4D2B'], ['Lime', '#9ACD32'], ['Olive', '#6B7B2C'], ['Brown', '#5C3A21'], ['Tan', '#C8A27A'], ['Charcoal', '#36454F'],
  ['Process cyan', '#00AEEF'], ['Process magenta', '#EC008C'], ['Process yellow', '#FFF200'],
  ['3DEEZI cyan', '#12E1F0'], ['3DEEZI blue', '#1E7BFF'], ['3DEEZI violet', '#7B4DFF'], ['3DEEZI grey', '#5D6B7B'],
];
/** #rgb, #rrggbb or rgb(r, g, b) as #RRGGBB (other colour values: null). */
function hexOf(c) {
  if (typeof c !== 'string') return null;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${[...c.slice(1)].map((x) => x + x).join('')}`.toUpperCase();
  const m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
  return m && (m[4] === undefined || Number(m[4]) > 0) ? rgbHex([m[1], m[2], m[3]].map(Number)) : null;
}
function paletteSwatch(name, hex) {
  const b = document.createElement('button');
  b.className = 'pc'; b.style.background = hex; b.draggable = true; b.dataset.colour = hex;
  b.title = `${name} ${hex} · click: fill · right-click: outline · or drag onto an object`;
  b.onclick = () => paletteApply(hex, false);
  b.oncontextmenu = (e) => { e.preventDefault(); paletteApply(hex, true); };
  b.ondragstart = (e) => { e.dataTransfer.setData('text/x-colour', hex); e.dataTransfer.effectAllowed = 'copy'; };
  return b;
}
function paletteApply(hex, outline) {
  const objs = active();
  if (state.target !== (outline ? 'stroke' : 'fill')) setTarget(outline ? 'stroke' : 'fill');
  setColour(hex, { apply: false });   // also the colour for new objects, shown in the Colour tab
  if (!objs.length) { toast(`${outline ? 'Outline' : 'Fill'} colour for new objects: ${hex} (select objects to colour them)`); return; }
  for (const o of objs) { paintObject(o, hex, outline); o.setCoords(); }
  canvas.requestRenderAll();
  canvas.fire('object:modified', { target: objs[0] });
}
$('palNone').onclick = () => applyToSelection((o) => { delete o.gradSpec; delete o.patSpec; return { fill: null }; }, 'Fill removed') || toast('Select objects first');
$('palNone').oncontextmenu = (e) => { e.preventDefault(); applyToSelection({ stroke: null, strokeWidth: 0 }, 'Outline removed') || toast('Select objects first'); };
$('palette').addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { $('palette').scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
for (const [name, hex] of PALETTE) $('palMain').append(paletteSwatch(name, hex));
let docColours = '';
/** "Document" swatches: every solid fill and outline colour used on the page. */
function renderDocPalette() {
  const found = new Set();
  const walk = (o) => {
    if (o.type === 'group') { o.getObjects().forEach(walk); return; }
    for (const c of [o.fill, o.strokeWidth ? o.stroke : null]) { const h = hexOf(c); if (h) found.add(h); }
  };
  userObjects().forEach(walk);
  const list = [...found].slice(0, 40), key = list.join();
  if (key === docColours) return;
  docColours = key;
  const box = $('palDoc');
  box.querySelectorAll('.pc').forEach((b) => b.remove());
  for (const c of list) box.append(paletteSwatch('Used in this design:', c));
  box.hidden = !list.length;
}

// Units (status bar): rulers, X / Y / W / H, page size and new dimension labels.
function showPageInfo() {
  $('pageInfo').textContent = `${+inUnits(pageSize[0] * MM)} x ${+inUnits(pageSize[1] * MM)} ${unit().name}`;
  $('pageUnit').textContent = unit().name;
  if (!$('customSize').hidden) { $('pageW').value = String(+inUnits(pageSize[0] * MM)); $('pageH').value = String(+inUnits(pageSize[1] * MM)); }
  for (const [id, label] of [['posX', 'X'], ['posY', 'Y'], ['sizeW', 'Width'], ['sizeH', 'Height']]) $(id).title = `${label} (${unit().name})`;
}
$('units').value = state.units in UNITS ? state.units : 'mm';
$('units').onchange = (e) => { state.units = e.target.value; savePrefs(); showPageInfo(); drawRulers(); syncProps(); toast(`Units: ${e.target.selectedOptions[0].textContent} (rulers, position, size and page)`); };

// Table card: text colour and font for every cell.
$('tbFont').innerHTML = FONTS.map((x) => `<option>${x.family}</option>`).join('');
$('tbInk').oninput = (e) => { const g = one(); if (!g?.tableSpec) return; for (const t of g.getObjects().filter(isText)) t.set('fill', e.target.value); g.set('dirty', true); canvas.requestRenderAll(); };
$('tbInk').onchange = () => { const g = one(); if (g?.tableSpec) canvas.fire('object:modified', { target: g }); };
$('tbFont').onchange = (e) => {
  const g = one(); if (!g?.tableSpec) return;
  const bold = fontInfo(e.target.value).bold;
  for (const t of g.getObjects().filter(isText)) {
    t.set({ fontFamily: e.target.value, fontWeight: t.cell[0] === 0 && bold ? 700 : 400 });
    const c = tableCell(g, t); if (c) fitCell(t, c.width, c.height, g.tableSpec.size);
  }
  g.set('dirty', true); canvas.requestRenderAll();
  canvas.fire('object:modified', { target: g });
};

function drawHarmony() {
  const base = hexToHsv(current()), box = $('harmony');
  const mode = $('harmonyMode').value;
  const shifts = { analogous: [-30, -15, 0, 15, 30], complementary: [0, 0, 180, 180, 0], triadic: [0, 120, 240, 120, 0], shades: [0, 0, 0, 0, 0] }[mode];
  box.innerHTML = '';
  shifts.forEach((d, i) => {
    const c = mode === 'shades' ? hsvToHex({ ...base, v: Math.max(0.12, Math.min(1, 0.3 + i * 0.17)) }) : hsvToHex({ ...base, h: (base.h + d + 360) % 360, v: mode === 'complementary' && i % 2 ? base.v * 0.7 : base.v });
    const b = document.createElement('button'); b.style.background = c; b.title = c; b.onclick = () => setColour(c); box.append(b);
  });
}
$('harmonyMode').onchange = drawHarmony;
const gradientSpec = () => ({ from: state.fill, to: $('gradTo').value, angle: Number($('gradAngle').value), type: $('fillMode').value === 'radial' ? 'radial' : 'linear' });
const patternSpec = () => ({ kind: $('patKind').value, size: Math.max(2, Math.min(100, Number($('patSize').value) || 10)), bg: $('patBg').value });
/** Fill for one object in the current fill mode (uniform, gradient or pattern). */
function modeFill(o) {
  delete o.gradSpec; delete o.patSpec;
  if (state.gradient) { o.gradSpec = { ...state.gradient }; return { fill: gradientFor(o) }; }
  if (state.pattern) { o.patSpec = { ...state.pattern, ink: state.fill }; return { fill: patternFor(o.patSpec) }; }
  return { fill: state.fill };
}
const fillable = (o) => !(o.type === 'line' || o.type === 'polyline' || (o.type === 'path' && !o.fill && o.stroke));
$('fillMode').onchange = (e) => {
  const mode = e.target.value;
  state.gradient = mode === 'gradient' || mode === 'radial' ? gradientSpec() : null;
  state.pattern = mode === 'pattern' ? patternSpec() : null;
  $('gradRow').style.display = state.gradient ? 'grid' : 'none';
  $('patRow').style.display = state.pattern ? 'grid' : 'none';
  applyToSelection((o) => (fillable(o) ? modeFill(o) : {}));
};
for (const id of ['gradTo', 'gradAngle']) $(id).oninput = () => { if (!state.gradient) return; state.gradient = gradientSpec(); applyToSelection((o) => { o.gradSpec = { ...state.gradient }; return { fill: gradientFor(o) }; }); };
for (const id of ['patKind', 'patSize', 'patBg']) $(id).onchange = () => { if (!state.pattern) return; state.pattern = patternSpec(); applyToSelection((o) => (fillable(o) ? modeFill(o) : {})); };

// ===================================================================
// Export, send to studio, pages
// ===================================================================
function contentBounds() {
  const objs = userObjects().filter((o) => o.visible);
  if (!objs.length) return null;
  const rects = objs.map((o) => o.getBoundingRect());
  const left = Math.min(...rects.map((r) => r.left)), top = Math.min(...rects.map((r) => r.top));
  return { left, top, width: Math.max(...rects.map((r) => r.left + r.width)) - left, height: Math.max(...rects.map((r) => r.top + r.height)) - top };
}
/** PNG of the artwork. `whole` = the full page at 300 DPI (capped), otherwise trimmed to the artwork. */
function renderPng({ whole = false, maxPx = 2048, background = null } = {}) {
  canvas.discardActiveObject();
  const box = whole ? { left: 0, top: 0, width: page.width, height: page.height } : contentBounds();
  if (!box) return null;
  const dpiPx = (box.width / MM / 25.4) * 300; // 300 DPI width in pixels
  const multiplier = Math.min(dpiPx, maxPx) / box.width;
  const vpt = canvas.viewportTransform.slice();
  const bg = canvas.backgroundColor;
  canvas.backgroundColor = background;
  page.visible = !!background && whole;
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  let data;
  exporting = true;
  try { data = canvas.toDataURL({ format: 'png', left: box.left, top: box.top, width: box.width, height: box.height, multiplier, enableRetinaScaling: false }); } finally { exporting = false; }
  canvas.setViewportTransform(vpt);
  canvas.backgroundColor = bg;
  page.visible = true;
  canvas.requestRenderAll();
  return data;
}
function download(data, name) {
  if (embedded()) { post({ type: 'export', data, name }); return; }
  const a = document.createElement('a'); a.href = data; a.download = name; a.click();
}
function exportPng(whole) {
  const data = renderPng({ whole, maxPx: whole ? 4096 : 3000, background: whole ? '#ffffff' : null });
  if (!data) { toast('The page is empty'); return; }
  download(data, whole ? '3deezi-artboard-page.png' : '3deezi-artwork.png');
  toast(whole ? 'Page exported (white background, 300 DPI up to 4096 px)' : 'Artwork exported (transparent PNG)');
}
/** Does an object (or anything inside a group) contain live text? */
const hasText = (o) => isText(o) || (o.type === 'group' && o.getObjects().some(hasText));
/** A page-space copy of an object with every text turned into curves. */
async function curvesCopy(o) {
  if (isText(o)) return makePath(worldD(o), o);
  if (o.type === 'group' && hasText(o)) {
    const g = new Group(await Promise.all(o.getObjects().map(curvesCopy)));
    g.set({ opacity: o.opacity, shadow: o.shadow, visible: o.visible });
    return g;
  }
  const c = await o.clone(EXTRA);
  if (o.group) util.addTransformToObject(c, o.group.calcTransformMatrix());
  return c;
}
/** The page as SVG, with text as curves so it prints the same everywhere. */
async function pageSvg() {
  canvas.discardActiveObject();
  const swaps = [];
  for (const o of userObjects()) if (o.visible && hasText(o)) { try { swaps.push([o, await curvesCopy(o)]); } catch { /* keep live text */ } }
  const bg = canvas.backgroundColor;
  muted++;
  try {
    for (const [o, p] of swaps) { const i = canvas.getObjects().indexOf(o); canvas.remove(o); canvas.insertAt(i, p); }
    canvas.backgroundColor = null;
    return canvas.toSVG({ width: `${pageSize[0]}mm`, height: `${pageSize[1]}mm`, viewBox: { x: 0, y: 0, width: page.width, height: page.height } });
  } finally {
    canvas.backgroundColor = bg;
    for (const [o, p] of swaps.reverse()) { const i = canvas.getObjects().indexOf(p); canvas.remove(p); canvas.insertAt(i, o); }
    muted--;
    canvas.requestRenderAll();
  }
}
const b64 = (text) => btoa(unescape(encodeURIComponent(text)));
async function exportSvg() {
  download(`data:image/svg+xml;base64,${b64(await pageSvg())}`, '3deezi-artwork.svg');
  toast('SVG exported: vector curves, editable in CorelDRAW or Illustrator');
}
async function exportPdf() {
  const [w, h] = pageSize;
  toast('Making the PDF…');
  const el = new DOMParser().parseFromString(await pageSvg(), 'image/svg+xml').documentElement;
  el.style.position = 'fixed'; el.style.left = '-99999px';
  document.body.append(el);
  try {
    const doc = new jsPDF({ unit: 'mm', format: [w, h], orientation: w > h ? 'landscape' : 'portrait' });
    await svg2pdf(el, doc, { x: 0, y: 0, width: w, height: h });
    download(doc.output('datauristring'), '3deezi-artwork.pdf');
    toast('Vector PDF exported (opens in CorelDRAW, Illustrator and print shops)');
  } catch (err) { toast(`PDF export failed: ${err.message}`); } finally { el.remove(); }
}
function sendToStudio() {
  const data = renderPng({ maxPx: 2048 });
  if (!data) { toast('Add some artwork first'); return; }
  const name = (userObjects().find(isText)?.text || 'Artboard design').slice(0, 40);
  if (embedded()) { post({ type: 'artwork', data, name }); toast('Sent to the 3D studio'); }
  else download(data, '3deezi-artwork.png');
}
function setPage([w, h], record_ = true) {
  pageSize = [w, h];
  // Show the size's name (A3 landscape, …) when it matches a preset.
  const known = Object.entries(PAGES).find(([, v]) => v && v[0] === w && v[1] === h);
  if ($('pageSize').options.length) $('pageSize').value = known ? known[0] : 'Custom size';
  $('customSize').hidden = !!known;
  page.set({ width: w * MM, height: h * MM });
  showPageInfo();
  fit();
  if (record_) record();
}
$('pageSize').innerHTML = Object.keys(PAGES).map((k) => `<option>${k}</option>`).join('');
$('pageSize').onchange = (e) => {
  const size = PAGES[e.target.value];
  $('customSize').hidden = !!size;
  if (size) setPage(size);
  else { showPageInfo(); $('pageW').focus(); }
};
for (const id of ['pageW', 'pageH']) $(id).onchange = () => {
  // Typed in the document units; kept in mm to 0.1 mm.
  const w = Math.round(fromUnits($('pageW').value) / MM * 10) / 10, h = Math.round(fromUnits($('pageH').value) / MM * 10) / 10;
  if (w >= 20 && h >= 20 && w <= 2000 && h <= 2000) setPage([w, h]); else toast(`Use a size between ${+inUnits(20 * MM)} and ${+inUnits(2000 * MM)} ${unit().name}`);
};

// ===================================================================
// Menus, toolbar wiring, keyboard
// ===================================================================
/** View > Snap to: each target can be switched on or off; the status-bar Snap box switches all snapping. */
const SNAP_LABELS = { grid: 'Grid (5 mm)', guides: 'Guidelines', objects: 'Objects', nodes: 'Nodes', page: 'Page' };
const ACTIONS = {
  fonts: () => { if ($('textBar').hidden) setTool('text'); setTimeout(() => $('tFont').click()); },
  new: async () => { if (userObjects().length && !confirm('Start a new page? Unsaved artwork will be cleared (Undo can restore it).')) return; batch(() => { for (const o of userObjects()) canvas.remove(o); }); canvas.requestRenderAll(); },
  open: () => $('fileImage').click(),
  exportPng: () => exportPng(false), exportPage: () => exportPng(true), exportSvg, exportPdf,
  send: sendToStudio,
  undo, redo, duplicate: () => duplicate(), delete: removeSelection, copy: () => copy(false), cut: () => copy(true), paste,
  selectAll: () => { if (state.tool === 'node' && nodes.target) { nodes.op('selectAll'); return; } setTool('select'); select(userObjects().filter((o) => o.visible && !o.locked)); },
  zoomIn: () => zoomAt(canvas.getZoom() * 1.25), zoomOut: () => zoomAt(canvas.getZoom() / 1.25), fit,
  rulers: () => document.body.classList.toggle('no-rulers') || setTimeout(resize),
  grid: () => { state.grid = !state.grid; $('gridToggle').checked = state.grid; savePrefs(); canvas.requestRenderAll(); },
  clearGuides: () => guides.clear(),
  ...Object.fromEntries(Object.keys(SNAP_LABELS).map((k) => [`snap_${k}`, () => toggleSnapTo(k)])),
  group: () => groupToggle('group'), ungroup: () => groupToggle('ungroup'),
  front: () => order('front'), back: () => order('back'), forward: () => order('forward'), backward: () => order('backward'),
  flipH: () => $('flipH').click(), flipV: () => $('flipV').click(),
  alignL: () => align('L'), alignR: () => align('R'), alignT: () => align('T'), alignB: () => align('B'), alignC: () => align('C'), alignM: () => align('M'), layout: () => align('P'),
  distH: () => distribute('x'), distV: () => distribute('y'),
  curves: () => convertToCurves(), combine, breakApart, outline: outlineToObject,
  weld: () => shaping('weld'), trim: () => shaping('trim'), intersect: () => shaping('intersect'), simplify: () => shaping('simplify'), fmb: () => shaping('fmb'), bmf: () => shaping('bmf'),
  powerclip: startPowerClip, extract: extractPowerClip,
  lock: () => { const o = one(); if (o) { setLocked(o, !o.locked); syncProps(); } },
  text: () => setTool('text'), fitPath: fitTextToPath, straighten: straightenText,
  blend: () => setTool('blend'), contour: () => setTool('contour'), shadow: () => setTool('shadow'), transparency: () => setTool('transparency'),
  distort: () => setTool('distort'), envelope: () => setTool('envelope'), extrude: () => setTool('extrude'), blockshadow: () => setTool('blockshadow'), meshfill: () => setTool('meshfill'),
  table: () => setTool('table'),
  help: () => { $('helpDialog').showModal(); },
};
document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => { closeMenus(); ACTIONS[b.dataset.action]?.(); }));
function closeMenus() { document.querySelectorAll('.menu.open, .fly.open').forEach((m) => m.classList.remove('open')); endFontPreview(); }
document.querySelectorAll('.menu>button').forEach((b) => b.addEventListener('click', (e) => { const m = b.parentElement, open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); e.stopPropagation(); }));
addEventListener('click', (e) => { if (!e.target.closest('.menu,.fly,.tool')) closeMenus(); });
$('undo').onclick = undo; $('redo').onclick = redo;
$('save').onclick = () => { try { localStorage.setItem(STORE, snapshot()); } catch { /* storage full */ } post({ type: 'saved', json: snapshot() }); toast('Artboard saved on this device'); };
$('sendBtn').onclick = sendToStudio;
// Right-click menu: order (to front / back), duplicate, curves, lock, delete for the object under the pointer.
const CTX_ITEMS = [
  ['front', 'To front', 'Shift+PgUp'], ['forward', 'Forward one', 'Ctrl+PgUp'], ['backward', 'Back one', 'Ctrl+PgDn'], ['back', 'To back', 'Shift+PgDn'], null,
  ['duplicate', 'Duplicate', 'Ctrl+D'], ['curves', 'Convert to curves', 'Ctrl+Q'], ['lock', 'Lock / unlock', ''], null, ['delete', 'Delete', 'Del'],
];
wrap.addEventListener('contextmenu', (e) => {
  e.preventDefault(); e.stopPropagation();
  const target = objectAt(canvas.getScenePoint(e));
  if (target && !canvas.getActiveObjects().includes(target)) { setTool('select'); canvas.setActiveObject(target); canvas.requestRenderAll(); syncProps(); }
  const menu = $('ctxMenu');
  if (!active().length) { closeMenus(); return; }
  menu.innerHTML = CTX_ITEMS.map((it) => (it ? `<button data-ctx="${it[0]}">${it[1]}${it[2] ? `<small>${it[2]}</small>` : ''}</button>` : '<hr>')).join('');
  menu.querySelectorAll('[data-ctx]').forEach((b) => (b.onclick = () => { closeMenus(); ACTIONS[b.dataset.ctx]?.(); }));
  closeMenus();
  Object.assign(menu.style, { left: `${Math.min(e.clientX, innerWidth - 230)}px`, top: `${Math.min(e.clientY, innerHeight - 330)}px`, bottom: 'auto' });
  menu.classList.add('open');
}, true);
const SNAP_HELP = {
  grid: 'objects and drawing move in 5 mm steps (View > Grid on / off shows the grid)',
  guides: 'edges and centres stick to guidelines',
  objects: 'edges and centres stick to other objects',
  nodes: 'points stick to other shapes\' nodes',
  page: 'edges and centres stick to the page edges and centre',
};
function toggleSnapTo(k) {
  state.snapTo[k] = !state.snapTo[k];
  // Turning an option on also turns snapping on (the Snap box in the status bar).
  if (state.snapTo[k] && !state.snap) { state.snap = true; $('snapToggle').checked = true; }
  savePrefs(); showSnapMenu();
  toast(state.snapTo[k] ? `Snap to ${SNAP_LABELS[k].toLowerCase()} on: ${SNAP_HELP[k]}` : `Snap to ${SNAP_LABELS[k].toLowerCase()} off`);
}
function showSnapMenu() {
  for (const [k, label] of Object.entries(SNAP_LABELS)) {
    const b = document.querySelector(`[data-action="snap_${k}"]`);
    if (b) b.innerHTML = `${state.snapTo[k] ? '✓' : '<span style="visibility:hidden">✓</span>'} Snap to ${label}`;
  }
}
showSnapMenu();
// The website passes ?v=<build>: shown in the status bar so testers can see they have the latest Artboard.
if (params.get('v')) $('buildInfo').textContent = `Build ${params.get('v')}`;
$('snapToggle').checked = state.snap; $('gridToggle').checked = state.grid;
$('snapToggle').onchange = (e) => { state.snap = e.target.checked; savePrefs(); };
$('gridToggle').onchange = (e) => { state.grid = e.target.checked; savePrefs(); canvas.requestRenderAll(); };
$('zoomPct').onchange = (e) => (e.target.value === 'fit' ? fit() : zoomAt(baseZoom() * Number(e.target.value) / 100));
$('zoomRange').oninput = (e) => zoomAt(baseZoom() * 2 ** (Number(e.target.value) / 100));
$('zoomMinus').onclick = ACTIONS.zoomOut; $('zoomPlus').onclick = ACTIONS.zoomIn; $('fitBtn').onclick = fit;
function openTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === `pane-${name}`));
  if (name === 'colour') requestAnimationFrame(drawPicker);
  $('side').classList.add('open');
}
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => openTab(b.dataset.tab)));
$('panelBtn').onclick = () => $('side').classList.toggle('open');
$('closeSide').onclick = () => $('side').classList.remove('open');

// ===================================================================
// Text bar (CorelDRAW-style): font, size, bold, italic, underline, alignment.
// Shown while text is selected or the Text tool is active.
// ===================================================================
$('pFont').innerHTML = FONTS.map((x) => `<option>${x.family}</option>`).join('');
function fontInfo(family) { return FONTS.find((x) => x.family === family) ?? { family, bold: false }; }
/** The selected text objects, when the selection is only text. */
function textTarget() { const all = canvas.getActiveObjects(), t = all.filter(isText); return t.length && t.length === all.length ? t : null; }
function setText(props, label) {
  Object.assign(state.text, props);
  if (textTarget()) applyToSelection(props, label);
  syncTextBar();
}
function syncTextBar() {
  const t = textTarget(), bar = $('textBar');
  bar.hidden = !t && state.tool !== 'text';
  if (bar.hidden) return;
  const o = t?.[0];
  const v = o ? { fontFamily: o.fontFamily, fontWeight: o.fontWeight, fontStyle: o.fontStyle, underline: o.underline, textAlign: o.textAlign, fontSize: (o.fontSize * (o.scaleY || 1)) / MM } : state.text;
  $('tFontName').textContent = v.fontFamily; $('tFontName').style.fontFamily = `'${v.fontFamily}'`;
  if (document.activeElement !== $('tSize')) $('tSize').value = String(Math.round(v.fontSize * 10) / 10);
  const canBold = fontInfo(v.fontFamily).bold;
  $('tBold').disabled = !canBold; $('tBold').title = canBold ? 'Bold (Ctrl+B)' : 'This font has one weight';
  $('tBold').classList.toggle('on', canBold && Number(v.fontWeight) >= 600);
  $('tItalic').classList.toggle('on', v.fontStyle === 'italic');
  $('tUnder').classList.toggle('on', !!v.underline);
  for (const a of ['left', 'center', 'right']) $(`tAlign-${a}`).classList.toggle('on', v.textAlign === a);
}
function renderFontList(filter = '') {
  const q = filter.trim().toLowerCase(), cur = textTarget()?.[0].fontFamily ?? state.text.fontFamily;
  let html = '', group = '';
  for (const x of FONTS.filter((x) => x.family.toLowerCase().includes(q))) {
    if (x.group !== group) { group = x.group; html += `<h4>${group}</h4>`; }
    html += `<button data-font="${x.family}" class="${x.family === cur ? 'on' : ''}" style="font-family:'${x.family}'">${x.family}</button>`;
  }
  $('fontList').innerHTML = html || '<p class="empty">No fonts match</p>';
}
function chooseFont(family) { endFontPreview(); closeMenus(); setText({ fontFamily: family }); }
// Hovering a font previews it on the selected text, as in CorelDRAW.
let previewFrom = null;
function endFontPreview() {
  if (!previewFrom) return;
  for (const [o, family] of previewFrom) o.set('fontFamily', family);
  previewFrom = null; canvas.requestRenderAll();
}
$('tFont').onclick = (e) => {
  const fly = $('fontFly'), r = e.currentTarget.getBoundingClientRect();
  const open = !fly.classList.contains('open');
  closeMenus();
  if (!open) return;
  renderFontList(); $('fontSearch').value = '';
  Object.assign(fly.style, { left: `${Math.max(8, Math.min(r.left, innerWidth - 296))}px`, top: `${r.bottom + 6}px`, bottom: 'auto' });
  fly.classList.add('open');
  fly.querySelector('.on')?.scrollIntoView({ block: 'center' });
  if (matchMedia('(pointer: fine)').matches) $('fontSearch').focus();
  e.stopPropagation();
};
$('fontSearch').oninput = (e) => renderFontList(e.target.value);
$('fontSearch').onkeydown = (e) => {
  if (e.key === 'Enter') { const b = $('fontList').querySelector('[data-font]'); if (b) chooseFont(b.dataset.font); }
  if (e.key === 'Escape') closeMenus();
};
$('fontList').addEventListener('mouseover', (e) => {
  const b = e.target.closest('[data-font]'), t = textTarget();
  if (!b || !t) return;
  previewFrom ??= t.map((o) => [o, o.fontFamily]);
  for (const o of t) o.set('fontFamily', b.dataset.font);
  canvas.requestRenderAll();
});
$('fontList').addEventListener('mouseleave', endFontPreview);
$('fontList').addEventListener('click', (e) => { const b = e.target.closest('[data-font]'); if (b) chooseFont(b.dataset.font); });
$('tSize').onchange = (e) => {
  const mm = Number(e.target.value);
  if (!(mm >= 1 && mm <= 1000)) { toast('Use a size between 1 and 1000 mm'); syncTextBar(); return; }
  state.text.fontSize = mm;
  if (textTarget()) applyToSelection((o) => ({ fontSize: (mm * MM) / (o.scaleY || 1) }));
};
$('tBold').onclick = () => setText({ fontWeight: $('tBold').classList.contains('on') ? 400 : 700 });
$('tItalic').onclick = () => setText({ fontStyle: $('tItalic').classList.contains('on') ? 'normal' : 'italic' });
$('tUnder').onclick = () => setText({ underline: !$('tUnder').classList.contains('on') });
for (const a of ['left', 'center', 'right']) $(`tAlign-${a}`).onclick = () => setText({ textAlign: a });

// Keyboard: CorelDRAW shortcuts.
const KEY_TOOLS = { f10: 'node', f5: 'draw', f6: 'rect', f7: 'ellipse', f8: 'text', y: 'polygon', s: 'star', d: 'graph', a: 'spiral', x: 'eraser', z: 'zoom', h: 'pan', g: 'fill', m: 'meshfill', i: 'eyedropper', v: 'select' };
const KEY_ALIGN = { l: 'L', r: 'R', t: 'T', b: 'B', e: 'C', c: 'M', p: 'P' };
addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  const editing = canvas.getActiveObject()?.isEditing;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && textTarget() && !e.shiftKey && ['b', 'i', 'u'].includes(k)) {
    const id = { b: 'tBold', i: 'tItalic', u: 'tUnder' }[k];
    if (!$(id).disabled) { e.preventDefault(); $(id).click(); }
    return;
  }
  if (editing) return;
  if (k === ' ') { spaceDown = true; canvas.defaultCursor = 'grab'; e.preventDefault(); return; }
  if (/^f\d+$/.test(k)) e.preventDefault();
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && k === 'y') { e.preventDefault(); redo(); }
  else if (mod && k === 'd') { e.preventDefault(); duplicate(); }
  else if (mod && k === 'c') { e.preventDefault(); copy(false); }
  else if (mod && k === 'x') { e.preventDefault(); copy(true); }
  else if (mod && k === 'v') { e.preventDefault(); paste(); }
  else if (mod && k === 'a') { e.preventDefault(); ACTIONS.selectAll(); }
  else if (mod && k === 'g') { e.preventDefault(); groupToggle('group'); }
  else if (mod && k === 'u') { e.preventDefault(); groupToggle('ungroup'); }
  else if (mod && k === 'q') { e.preventDefault(); if (e.shiftKey) outlineToObject(); else convertToCurves(); }
  else if (mod && k === 'l') { e.preventDefault(); combine(); }
  else if (mod && k === 'k') { e.preventDefault(); breakApart(); }
  else if (mod && k === 'i') { e.preventDefault(); $('fileImage').click(); }
  else if (mod && k === 'e') { e.preventDefault(); exportPdf(); }
  else if (k === 'pageup' || k === 'pagedown') { e.preventDefault(); order(k === 'pageup' ? (e.shiftKey ? 'front' : 'forward') : (e.shiftKey ? 'back' : 'backward')); }
  else if (k === 'delete' || k === 'backspace') removeSelection();
  else if (k === 'escape') {
    if (pickFrame) { pickFrame = null; hint(''); canvas.defaultCursor = 'default'; return; }
    if (path) { finishPath(); return; }
    cancelCurve3(); attrSample = null;
    if (state.tool !== 'select') setTool('select'); else { canvas.discardActiveObject(); canvas.requestRenderAll(); }
  }
  else if (k === 'enter') finishPath();
  else if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) {
    const s = (e.shiftKey ? 10 : 1) * MM, dx = k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, dy = k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0;
    if (state.tool === 'node' && nodes.nudge(dx, dy)) { e.preventDefault(); return; }
    if (active().length) { e.preventDefault(); applyToSelection((o) => ({ left: o.left + dx, top: o.top + dy })); }
  }
  else if (!mod && !e.altKey && KEY_ALIGN[k] && canvas.getActiveObjects().length && state.tool === 'select') align(KEY_ALIGN[k]);
  else if (!mod && !e.altKey && KEY_TOOLS[k]) setTool(KEY_TOOLS[k]);
});
addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; canvas.defaultCursor = toolCursor(state.tool); } });
addEventListener('resize', () => { resize(); });
// The canvas also follows the property bar growing to two rows.
new ResizeObserver(() => resize()).observe(wrap);

// ===================================================================
// Host bridge
// ===================================================================
window.artboard = {
  setAssets: (list) => { for (const a of list ?? []) addAsset(a.src, a.name || 'Asset'); },
  addImage: ({ src, name }) => { addAsset(src, name || 'Image'); return addImage(src, name || 'Image'); },
  load: (json) => restore(typeof json === 'string' ? json : JSON.stringify(json)),
  clear: () => ACTIONS.new(),
  toast: (text) => toast(String(text ?? '')),
  receive: (msg) => {
    const m = typeof msg === 'string' ? JSON.parse(msg) : msg;
    if (m && m.cmd !== 'receive' && typeof window.artboard[m.cmd] === 'function') window.artboard[m.cmd](m.arg);
  },
};
// Automated tests only (?debug): reach the canvas from the browser.
if (params.has('debug')) window.__ab = { canvas, nodes, state, setTool, V, F: { Rect, IText, FabricImage, Group, Path } };
addEventListener('message', (e) => { if (e.source === window.parent && typeof e.data === 'string') { try { window.artboard.receive(e.data); } catch { /* not for us */ } } });

// ===================================================================
// Start
// ===================================================================
(async () => {
  // Load the embedded fonts before any text is measured.
  await Promise.all(fontLoads);
  await document.fonts.ready;
  resize();
  setTarget('fill');
  renderSwatches();
  renderAssets();
  initContextValues();
  renderToolbox();
  showPageInfo();
  let saved = null;
  try { saved = localStorage.getItem(STORE); } catch { /* none */ }
  if (saved) await restore(saved).catch(() => {});
  if (!userObjects().length) {
    // A starter so the page isn't blank: editable 3DEEZI-style badge text.
    const t = style(new IText('YOUR TEAM', { left: page.width / 2, top: page.height / 2, originX: 'center', originY: 'center', fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 70 * MM, fill: '#1E7BFF', toolName: 'Text' }));
    canvas.add(t);
  }
  history = [snapshot()];
  syncHistory();
  fit();
  syncProps();
  setTool('select');
  document.body.classList.add('ready');
  post({ type: 'ready' });
})();
