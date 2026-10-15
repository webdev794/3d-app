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
  Canvas, Rect, Ellipse, Path, IText, Textbox, FabricImage, PencilBrush,
  ActiveSelection, Group, Gradient, Pattern, Point, Shadow, util, loadSVGFromString,
  FitContentLayout, LayoutManager, classRegistry,
} from 'fabric';
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { ICONS } from './icons.js';
import { FONTS } from './fonts.mjs';
import * as V from './vector.js';
import { createNodeEditor } from './nodes.js';
import { createGuides } from './guides.js';
import * as B from './bitmaps.js';
import * as G from './geomcore.js';
import * as AM from './media.js';
import * as SK from './sketch.js';
import * as PB from './paint.js';

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
  shape: { sides: 6, points: 5, sharp: 53, cpoints: 9, csharp: 2, revs: 4, log: false, expand: 50, cols: 4, rows: 3, set: 'basic', item: 'triangle', radius: 8, eraser: 6, tRows: 4, tCols: 3, twirl: 'cw', impactStyle: 'radial', impactLines: 36, impactInner: 45, impactSeed: 1, ftMode: 'rotate', ftDup: false },
  // Artistic Media: used for the next stroke, and edited from its property bar (a selected stroke is redrawn).
  // Smart Drawing, LiveSketch and Painterly Brush settings (their property bars).
  smart: { level: 'medium', smooth: 50 },
  live: { timer: 1, near: 15, smooth: 50 },
  paint: { brush: 'oil', size: 10, flow: 80 },
  media: { mode: 'preset', width: 6, smooth: 50, preset: 'taper', brush: 'dry', spray: 'stars', spacing: 12, sizeVar: 30, rotate: 'random', angle: 45 },
  fx: {
    blendSteps: 8, contourDir: 'outside', contourSteps: 1, contourOffset: 3, contourColour: '#000000', shadowX: 2, shadowY: 2, shadowBlur: 4, shadowColour: '#000000', shadowOpacity: 50, transp: 'uniform', transpValue: 50, transpAngle: 0,
    distort: 'zipper', zipSize: 2, zipTeeth: 30, twist: 90, push: 40, envelope: 'arcUp', envAmount: 20,
    extX: 6, extY: 6, extColour: '#1E7BFF', blockX: 3, blockY: 3, blockColour: '#000000', meshSize: 40, meshStrength: 85,
  },
};
try { const p = JSON.parse(localStorage.getItem(`${STORE}.prefs`) || '{}'); Object.assign(state, { ...p, shape: { ...state.shape, ...p.shape }, fx: { ...state.fx, ...p.fx }, media: { ...state.media, ...p.media }, smart: { ...state.smart, ...p.smart }, live: { ...state.live, ...p.live }, paint: { ...state.paint, ...p.paint }, snapTo: { ...state.snapTo, ...p.snapTo } }); } catch { /* fresh */ }
const savePrefs = () => { try { localStorage.setItem(`${STORE}.prefs`, JSON.stringify({ recent: state.recent, saved: state.saved, snap: state.snap, snapTo: state.snapTo, grid: state.grid, units: state.units, shape: state.shape, fx: state.fx, media: state.media, smart: state.smart, live: state.live, paint: state.paint })); } catch { /* private mode */ } };

const toast = (text, ms = 2800) => { const t = $('toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms); };
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
const EXTRA = ['name', 'toolName', 'lockMovementX', 'lockMovementY', 'lockScalingX', 'lockScalingY', 'lockRotation', 'hasControls', 'selectable', 'gradSpec', 'patSpec', 'shapeSpec', 'powerClip', 'locked', 'fxSweep', 'fxPart', 'fxMesh', 'tableSpec', 'cell', 'pcFrame', 'mediaSpec', 'liveSpec', 'paintSpec'];
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
  for (const o of objects) { pruneEmptyParts(o); fitPowerClips(o); style(o); canvas.add(o); }
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
async function undo() { if (pcEdit) { await cancelPowerClipEdit(); return; } if (history.length < 2) return; future.push(history.pop()); await restore(history.at(-1)); syncHistory(); }
async function redo() { if (pcEdit) { finishPowerClipEdit(); return; } if (!future.length) return; const s = future.pop(); history.push(s); await restore(s); syncHistory(); }
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
        if (o.powerClip) g.powerClip = true;
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
  ['pick', [['select', 'Pick', 'select', 'V'], ['lasso', 'Freehand Pick', 'lasso'], ['freetx', 'Free Transform', 'freetx']]],
  // Pan has its own button below Pick (it moves the view, not the artwork).
  ['pan', [['pan', 'Pan', 'pan', 'H']]],
  ['shape', [['node', 'Shape', 'node', 'F10'], ['smoothb', 'Smooth', 'smoothb'], ['smear', 'Smear', 'smear'], ['twirl', 'Twirl', 'twirl'], ['attract', 'Attract', 'attract'], ['repel', 'Repel', 'repel'], ['smudge', 'Smudge', 'smudge'], ['roughen', 'Roughen', 'roughen']]],
  ['crop', [['crop', 'Crop', 'crop'], ['knife', 'Knife', 'knife'], ['vsd', 'Virtual Segment Delete', 'vsd'], ['eraser', 'Eraser', 'eraser', 'X']]],
  ['zoom', [['zoom', 'Zoom', 'zoom', 'Z']]],
  ['curve', [['draw', 'Freehand', 'freehand', 'F5'], ['line', '2-Point Line', 'line'], ['bezier', 'Bézier', 'bezier'], ['pen', 'Pen', 'pen'], ['bspline', 'B-Spline', 'bspline'], ['polyline', 'Polyline', 'polyline'], ['curve3', '3-Point Curve', 'curve3'], ['smartdraw', 'Smart Drawing', 'smartdraw'], ['livesketch', 'LiveSketch', 'livesketch']]],
  ['art', [['media', 'Artistic Media', 'media'], ['paint', 'Painterly Brush', 'paintbrush']]],
  ['smart', [['smartfill', 'Smart Fill', 'smartfill']]],
  ['rect', [['rect', 'Rectangle', 'rect', 'F6'], ['rect3', '3-Point Rectangle', 'rect3']]],
  ['ellipse', [['ellipse', 'Ellipse', 'ellipse', 'F7'], ['ellipse3', '3-Point Ellipse', 'ellipse3']]],
  ['object', [['polygon', 'Polygon', 'polygon', 'Y'], ['star', 'Star', 'star', 'S'], ['cstar', 'Complex Star', 'cstar'], ['graph', 'Graph Paper', 'graph', 'D'], ['spiral', 'Spiral', 'spiral', 'A'], ['impact', 'Impact', 'impact']]],
  ['shapes', [['shape:basic', 'Basic Shapes', 'shapes'], ['shape:arrow', 'Arrow Shapes', 'arrowshape'], ['shape:banner', 'Banner Shapes', 'banner'], ['shape:callout', 'Callout Shapes', 'callout'], ['shape:badge', 'Sport Badges', 'badge']]],
  ['text', [['text', 'Text', 'text', 'F8'], ['ptext', 'Paragraph Text', 'ptext']]],
  ['dim', [['dimP', 'Parallel Dimension', 'dimension'], ['dimHV', 'Horizontal or Vertical Dimension', 'dimhv'], ['dimA', 'Angular Dimension', 'dimangle'], ['dimS', 'Segment Dimension', 'dimseg'], ['callout2', '2-Leg Callout', 'callout2']]],
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
const SHORT_LABEL = { dimP: 'Dimension', dimHV: 'H / V Dimension', eyedropper: 'Eyedropper', attrdrop: 'Attr. Eyedropper', lasso: 'Freehand Pick', rect3: '3-Point Rect.', ellipse3: '3-Point Ellipse', ptext: 'Paragraph Text', freetx: 'Free Transform', vsd: 'Segment Delete', dimA: 'Angular Dim.', dimS: 'Segment Dim.', callout2: '2-Leg Callout' };
/** Toolbox sections, top to bottom (groups with several tools open a flyout). */
const TOOL_SECTIONS = [
  // Artistic Media right below Pan (user 2026-10-15).
  ['Select', ['pick', 'pan', 'art', 'shape', 'crop', 'zoom']],
  ['Draw', ['curve', 'smart']],
  ['Shapes & text', ['rect', 'ellipse', 'object', 'shapes', 'text', 'table', 'dim', 'import']],
  ['Effects', ['fill', 'meshfill', 'transparency', 'contour', 'blend', 'shadow', 'blockshadow', 'extrude', 'distort', 'envelope', 'eyedrop']],
];
const TOOLS = {};
for (const [group, tools] of TOOL_GROUPS) for (const [id, label, ic, key] of tools) TOOLS[id] = { id, label, icon: ic, key, group };
const groupCurrent = {};
const PICK_LIKE = new Set(['select', 'blend', 'contour', 'shadow', 'transparency', 'distort', 'envelope', 'extrude', 'blockshadow']);
const SCULPT = new Set(['smoothb', 'smear', 'twirl', 'roughen', 'attract', 'repel']);
const OWN_MOUSE = new Set(['node', 'pan', 'knife', 'eraser', 'smudge', 'lasso', 'freetx', 'vsd', 'media', 'smartdraw', 'livesketch', 'paint', ...SCULPT]);
const PATH_TOOLS = new Set(['bezier', 'pen', 'polyline', 'bspline']);
const BOX_TOOLS = new Set(['rect', 'ellipse', 'polygon', 'star', 'cstar', 'spiral', 'impact', 'graph', 'table', 'line', 'crop', 'dimP', 'dimHV', 'ptext']);
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
  lasso: 'Freehand Pick: draw a loop round the objects to select them (those whose centre is inside the loop)',
  smear: 'Select an item first, then drag across its outline to push it out or pull it in along your stroke',
  twirl: 'Select an item first, then hold the mouse down on its outline to twirl it (longer = more turns) · Direction on the property bar',
  smudge: 'Drag from inside a selected shape outwards to pull its outline out, or from outside inwards to press it in',
  rect3: 'Drag to draw the base line (any angle), release, then move to set the height and click',
  ellipse3: 'Drag to draw the centre line (any angle), release, then move to set the width and click',
  ptext: 'Drag a frame on the page, then type: the text wraps inside the frame (drag its side handles to reflow)',
  impact: 'Drag to draw comic-style action lines (radial burst or parallel speed lines) · settings on the property bar',
  smartdraw: 'Sketch a shape freehand: it becomes a clean line, rectangle, ellipse, triangle, diamond or polygon (recognition and smoothing on the property bar)',
  livesketch: 'Sketch with several strokes: when you pause they become one smooth curve · start at the end of a LiveSketch curve to extend it, draw along it to reshape it',
  paint: 'Paint with realistic brushes (Oil, Watercolour, Charcoal, Airbrush, Marker) in the fill colour · the stroke is a picture (bitmap)',
  media: 'Draw freehand: the stroke becomes a shape (Preset, Brush, Sprayer, Calligraphic or Expression on the property bar) · with a stroke selected, changing the settings redraws it',
  freetx: 'Press where the pivot goes and drag: Rotate, Reflect, Scale or Skew (property bar) · Shift = 15° steps / even scaling',
  vsd: 'Point at a line: the part between two crossings turns red · click to delete just that part',
  dimA: 'Click the corner of the angle, then a point on each of its two sides',
  dimS: 'Point at a side of a shape or a line: it lights up with its length · click to add the measurement (straight from node to node)',
  callout2: 'Click the point to label, click where the line bends, click where the text goes, then type',
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
  if (pcEdit && tool !== 'select') finishPowerClipEdit();
  finishPath(); cancelCurve3(); cancelTp(); cancelMulti(); dropVsdHover(); topSegment = null; if (tool !== 'livesketch') finishLive(); attrSample = null; pickFrame = null;
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
  setBrushRing(SCULPT.has(tool) || tool === 'smudge' ? { radius: state.shape.radius * MM } : tool === 'eraser' ? { radius: (state.shape.eraser * MM) / 2 } : null);
  if (tool.startsWith('shape:')) state.shape.set = tool.split(':')[1];
  renderToolbox();
  syncContext();
  syncTextBar();
  canvas.requestRenderAll();
  hint(TOOL_HINTS[tool] ?? '');
  // Tools that work on selected items say so straight away when nothing (or too little) is selected, so the
  // Artboard never seems to have stopped working.
  const notice = selectionNotice(tool);
  if (notice) toast(notice, 5000);
}
/** What to select first, when the tool works on a selection and there is none (or too little). */
function selectionNotice(tool) {
  if (tool === 'freetx' && !toolTargets.length) return 'Select an item on the Artboard first (Pick tool), then choose Free Transform again';
  if (SCULPT.has(tool) && !toolTargets.length) return `Select an item on the Artboard first (Pick tool), then choose ${TOOLS[tool].label} again`;
  if (SCULPT.has(tool) && toolTargets.every((o) => o.type === 'image')) return `Images have no outline to bend. Trace the image to vectors first (select it, Properties tab > Trace bitmap), then use ${TOOLS[tool].label} on the result`;
  if (NEEDS_SELECTION[tool] && canvas.getActiveObjects().length < (tool === 'blend' ? 2 : 1)) return NEEDS_SELECTION[tool];
  return '';
}
const NEEDS_SELECTION = {
  blend: 'Select two shapes on the Artboard first (click one, Shift+click the other), then set the steps and click Apply blend',
  contour: 'Select a shape or text on the Artboard first, then set the contour and click Apply contour',
  shadow: 'Select an item on the Artboard first, then set the shadow and click Apply',
  transparency: 'Select an item on the Artboard first, then choose the transparency type and amount',
  distort: 'Select a shape or text on the Artboard first, then choose the distortion and click Apply distortion',
  envelope: 'Select a shape or text on the Artboard first, then choose an envelope and click Apply envelope',
  extrude: 'Select a shape or text on the Artboard first, then set the depth and click Apply extrude',
  blockshadow: 'Select a shape or text on the Artboard first, then set the depth and click Apply block shadow',
};

// ===================================================================
// Drawing with the mouse
// ===================================================================
let drag = null, path = null, curve3 = null, erase = null, knife = null, attrSample = null, pickFrame = null, tp = null, lasso = null, smudge = null, ft = null, multi = null, vsdHover = null, media = null, sketchStroke = null;
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
  if (tool === 'impact') return V.impactUnit(s.impactStyle, s.impactLines, s.impactInner, s.impactSeed);
  if (tool.startsWith('shape:')) { const set = V.SHAPE_SETS[s.set]; return (set.items.find(([id]) => id === s.item) ?? set.items[0])[2]; }
  return null;
};
const specFor = (tool) => { const s = state.shape; return tool === 'polygon' ? { tool, sides: s.sides } : tool === 'star' ? { tool, points: s.points, sharp: s.sharp } : tool === 'cstar' ? { tool, cpoints: s.cpoints, csharp: s.csharp } : tool === 'spiral' ? { tool, revs: s.revs, log: s.log, expand: s.expand } : tool === 'impact' ? { tool, style: s.impactStyle, lines: s.impactLines, inner: s.impactInner, seed: s.impactSeed } : { tool, set: s.set, item: s.item }; };

/** Drawing clicks and dragged nodes snap to nodes, edges and guidelines when Snap is on. */
const SNAP_TOOLS = new Set([...PATH_TOOLS, ...BOX_TOOLS, 'curve3', 'rect3', 'ellipse3', 'text', 'freetx', 'dimA', 'callout2']);
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
  // Place inside: the frame can sit under the contents (a picture over text), so skip them.
  if (pickFrame) { placeInFrame(userObjects().slice().reverse().find((o) => !pickFrame.includes(o) && o.visible && !o.locked && o.containsPoint(new Point(p.x, p.y)))); return; }
  if (tool === 'node') { nodes.down(p, opt.e); return; }
  if (SCULPT.has(tool)) { sculptDown(tool, p); return; }
  if (tool === 'smudge') { smudgeDown(p); return; }
  if (tool === 'smartdraw' || tool === 'livesketch' || tool === 'paint') {
    sketchStroke = { tool, points: [{ x: p.x, y: p.y }] };
    if (tool === 'livesketch') clearTimeout(liveTimer);
    topStroke = { points: sketchStroke.points, width: tool === 'paint' ? Math.max(0.5, state.paint.size) * MM : 1.6 / canvas.getZoom(), colour: tool === 'paint' ? 'rgba(18,225,240,.35)' : '#12E1F0' };
    drawTop(); return;
  }
  if (tool === 'media') {
    media = { points: [{ x: p.x, y: p.y, t: performance.now(), pr: opt.e.pressure ?? 0.5, pen: opt.e.pointerType === 'pen' }] };
    topStroke = { points: media.points, width: Math.max(0.5, state.media.width) * MM, colour: 'rgba(18,225,240,.45)' }; drawTop(); return;
  }
  if (tool === 'lasso') { lasso = { points: [p] }; topStroke = { points: lasso.points, loop: true }; drawTop(); return; }
  if (tool === 'rect3' || tool === 'ellipse3') { tpDown(p); return; }
  if (tool === 'freetx') { ftDown(p); return; }
  if (tool === 'vsd') { vsdClick(p); return; }
  if (tool === 'dimA' || tool === 'callout2') { multiDown(tool, p); return; }
  if (tool === 'dimS') { segmentDimension(p); return; }
  if (tool === 'eraser') {
    if (geomBusy) { toast('Still working out the last stroke: one moment'); return; }
    erase = { points: [p] }; topStroke = { points: erase.points, width: state.shape.eraser * MM, colour: 'rgba(255,80,80,.35)' }; drawTop(); return;
  }
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
  else if (tool === 'crop' || tool === 'graph' || tool === 'table' || tool === 'ptext') { drag = { tool, start: p, helper: helperPath(`M ${p.x} ${p.y}`, { fill: 'rgba(18,225,240,.10)' }) }; return; }
  else {
    // Each new Impact gets its own random line lengths.
    if (tool === 'impact') state.shape.impactSeed = (state.shape.impactSeed % 99991) + 1;
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
  if (SCULPT.has(tool) || tool === 'eraser' || tool === 'smudge') setBrushRing({ radius: tool === 'eraser' ? (state.shape.eraser * MM) / 2 : state.shape.radius * MM, at: p });
  if (SCULPT.has(tool)) { if (opt.e.buttons & 1) nodes.brushStep(p); return; }
  if (erase) { addStrokePoint(erase.points, p); return; }
  if (knife) { knife.b = p; setLive(knife.helper, `M ${knife.a.x} ${knife.a.y} L ${p.x} ${p.y}`); canvas.requestRenderAll(); return; }
  if (path) { penMove(p, opt.e); return; }
  if (curve3) { curve3Move(p); return; }
  if (ft) { ftMove(p, opt.e); return; }
  if (multi) { multiMove(p); return; }
  if (tool === 'vsd') { vsdHoverAt(p); return; }
  if (tool === 'dimS') { segmentHover(p); return; }
  if (tp) { tpMove(p); return; }
  if (lasso || smudge) { addStrokePoint((lasso ?? smudge).points, p); return; }
  if (sketchStroke) { addStrokePoint(sketchStroke.points, p); return; }
  if (media) { addStrokePoint(media.points, { x: p.x, y: p.y, t: performance.now(), pr: opt.e.pressure ?? 0.5, pen: opt.e.pointerType === 'pen' }); return; }
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
  } else if (drag.tool === 'crop' || drag.tool === 'graph' || drag.tool === 'table' || drag.tool === 'ptext') setLive(drag.helper, `M ${box.x} ${box.y} h ${box.w} v ${box.h} h ${-box.w} Z`);
  else setLive(o, V.boxD(unitFor(drag.tool), box));
  drag.box = box;
  o?.setCoords();
  canvas.requestRenderAll();
});
canvas.on('mouse:up', (opt) => {
  const tool = state.tool, p = pointer(opt, tool);
  guides.forget();
  if (tool === 'node') { nodes.up(p); return; }
  if (SCULPT.has(tool)) { sculptUp(tool); return; }
  if (erase) { const e = erase; erase = null; topStroke = null; drawTop(); applyEraser(e.points); return; }
  if (knife) { const k = knife; knife = null; dropHelper(k.helper); applyKnife(k.a, k.b); return; }
  if (path) { path.pressing = false; return; }
  if (curve3) { curve3Up(p); return; }
  if (ft) { ftUp(); return; }
  if (tp) { tpUp(p); return; }
  if (lasso) { const l = lasso; lasso = null; topStroke = null; drawTop(); lassoSelect(l.points); return; }
  if (smudge) { const sm = smudge; smudge = null; topStroke = null; drawTop(); applySmudge(sm); return; }
  if (media) { const m = media; media = null; topStroke = null; drawTop(); finishMedia(m.points); return; }
  if (sketchStroke) {
    const st = sketchStroke; sketchStroke = null; topStroke = null;
    if (st.tool === 'smartdraw') { drawTop(); finishSmart(st.points); }
    else if (st.tool === 'paint') { drawTop(); finishPaint(st.points); }
    else { livePending.push(st.points); drawTop(); clearTimeout(liveTimer); liveTimer = setTimeout(finishLive, Math.max(0, state.live.timer) * 1000); }
    return;
  }
  if (!drag) return;
  const d = drag; drag = null;
  if (d.tool === 'crop') { dropHelper(d.helper); applyCrop(d.box); return; }
  if (d.tool === 'graph') { dropHelper(d.helper); addGraph(d.box ?? { x: d.start.x - 40 * MM, y: d.start.y - 30 * MM, w: 80 * MM, h: 60 * MM }); return; }
  if (d.tool === 'table') { dropHelper(d.helper); addTable(d.box ?? { x: d.start.x - 60 * MM, y: d.start.y - 40 * MM, w: 0, h: 0 }); return; }
  if (d.tool === 'ptext') { dropHelper(d.helper); addParagraph(d.box && d.box.w >= 3 ? d.box : { x: d.start.x, y: d.start.y, w: 0, h: 0 }); return; }
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
  // PowerClip: double-click to move the contents; double-click outside them to finish.
  if (state.tool === 'select' && opt.target?.powerClip) { editPowerClip(opt.target); return; }
  // A callout: double-click to change its text.
  if (state.tool === 'select' && opt.target?.toolName === 'Callout') { editCallout(opt.target); return; }
  if (pcEdit && !opt.target) { finishPowerClipEdit(); return; }
  if (path) finishPath();
});
canvas.on('path:created', (e) => { style(e.path, { toolName: 'Freehand', strokeUniform: true }); e.path.name = `Freehand ${++counter}`; record(); refreshLayers(); });
// Overlays go on the main canvas only: Fabric fires after:render for its top layer too, which it does not clear
// afterwards, so anything drawn there would stay on screen (a stale tool box after switching tools).
canvas.on('after:render', ({ ctx }) => {
  if (exporting) return;
  if (ctx === canvas.contextTop) { if (topDrawn) drawTop(); return; }
  guides.draw(ctx); nodes.draw(ctx); drawToolOverlay(ctx);
  if (topDrawn) drawTop();
});

// The brush ring and the stroke being drawn (Smudge, Eraser, Freehand Pick) are drawn on Fabric's top canvas:
// moving them doesn't redraw the page, so brushes stay smooth on pages with heavy artwork.
let topStroke = null, brushRing = null, topSegment = null, topDrawn = false, livePending = [], liveTimer = 0;
function setBrushRing(ring) { brushRing = ring; drawTop(); }
/** Adds a point to a stroke being drawn (closer than a screen pixel to the last one: skipped) and redraws it. */
function addStrokePoint(points, p) {
  if (screenDist(p, points.at(-1)) >= 1) points.push(p);
  drawTop();
}
function drawTop() {
  const ctx = canvas.contextTop;
  if (!ctx) return;
  const ring = brushRing?.at ? brushRing : null;
  if (!topStroke && !ring && !topSegment && !livePending.length) { if (topDrawn) { canvas.clearContext(ctx); topDrawn = false; } return; }
  canvas.clearContext(ctx);
  topDrawn = true;
  const r = canvas.getRetinaScaling(), v = canvas.viewportTransform, s = topStroke;
  if (livePending.length) {
    // LiveSketch strokes waiting for the pause, thin and cyan.
    ctx.save(); ctx.setTransform(r * v[0], 0, 0, r * v[3], r * v[4], r * v[5]);
    ctx.lineWidth = 1.6 / v[0]; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#12E1F0';
    for (const q of livePending) { ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); }
    ctx.restore();
  }
  if (s?.points.length) {
    ctx.save();
    ctx.setTransform(r * v[0], 0, 0, r * v[3], r * v[4], r * v[5]);
    ctx.beginPath();
    s.points.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    if (s.loop) {
      ctx.closePath(); ctx.fillStyle = 'rgba(18,225,240,.08)'; ctx.fill();
      ctx.setLineDash([6 / v[0], 4 / v[0]]); ctx.lineWidth = 1.5 / v[0]; ctx.strokeStyle = '#12E1F0';
    } else {
      if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.01, s.points[0].y);
      ctx.lineWidth = s.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.colour;
    }
    ctx.stroke();
    ctx.restore();
  }
  if (topSegment) {
    // The side a Segment dimension would measure, with its length.
    const [a, b, c2, d] = topSegment.pts.map((q) => ({ x: q.x * v[0] + v[4], y: q.y * v[3] + v[5] }));
    ctx.save(); ctx.setTransform(r, 0, 0, r, 0, 0);
    // A dark edge under the cyan line, so it shows on any fill colour.
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.bezierCurveTo(b.x, b.y, c2.x, c2.y, d.x, d.y);
    ctx.strokeStyle = '#05121c'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = '#12E1F0'; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = '600 12px Inter, sans-serif';
    const mid = { x: (a.x + d.x) / 2, y: (a.y + d.y) / 2 }, w = ctx.measureText(topSegment.label).width + 12;
    ctx.fillStyle = '#05121ce6'; ctx.fillRect(mid.x - w / 2, mid.y - 30, w, 20);
    ctx.fillStyle = '#12E1F0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(topSegment.label, mid.x, mid.y - 20);
    ctx.restore();
  }
  if (ring) {
    ctx.save(); ctx.setTransform(r, 0, 0, r, 0, 0);
    const c = { x: ring.at.x * v[0] + v[4], y: ring.at.y * v[3] + v[5] };
    ctx.strokeStyle = '#12E1F0'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(c.x, c.y, ring.radius * v[0], 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// Smudge and Eraser strokes: the shape maths runs in a worker with a time limit, so a slow or stuck calculation
// can never freeze the Artboard: it is stopped with a message instead. Without workers it runs on the page.
let geomWorker = null, geomSeq = 0, geomBusy = 0, geomStarted = false, GEOM_LIMIT = 6000;
const geomJobs = new Map();
function stopGeom(err) {
  if (geomWorker) geomWorker.terminate();
  geomWorker = null;
  for (const j of geomJobs.values()) { clearTimeout(j.timer); j.reject(err); }
  geomJobs.clear();
}
function geomRun(job) {
  if (geomWorker === null) {
    try {
      if (!window.__ABGEOM || typeof Worker !== 'function') throw new Error('no worker');
      const w = new Worker(URL.createObjectURL(new Blob([window.__ABGEOM], { type: 'text/javascript' })));
      w.onmessage = ({ data }) => {
        geomStarted = true;
        const j = geomJobs.get(data.id);
        if (!j) return;
        geomJobs.delete(data.id); clearTimeout(j.timer);
        if (data.error) j.reject(new Error(data.error)); else j.resolve(data);
      };
      // The worker could not start here (a strict browser setting): run the jobs on the page from now on. A worker
      // that worked before and then failed (out of memory on a huge job) is dropped with the job, never re-run on
      // the page, which would freeze it; the next job starts a fresh worker.
      w.onerror = (e) => {
        e.preventDefault?.();
        if (geomStarted) { stopGeom(new Error('failed')); return; }
        w.terminate(); geomWorker = false;
        for (const j of geomJobs.values()) { clearTimeout(j.timer); try { j.resolve(G.runGeom(j.job)); } catch (err) { j.reject(err); } }
        geomJobs.clear();
      };
      geomWorker = w;
    } catch { geomWorker = false; }
  }
  if (!geomWorker) { try { return Promise.resolve(G.runGeom(job)); } catch (e) { return Promise.reject(e); } }
  return new Promise((resolve, reject) => {
    const id = ++geomSeq, timer = setTimeout(() => stopGeom(new Error('timeout')), GEOM_LIMIT);
    geomJobs.set(id, { resolve, reject, timer, job });
    geomWorker.postMessage({ id, ...job });
  });
}
const TOO_SLOW = (what) => `That ${what} took too long to work out, so it was stopped and nothing changed. Try a shorter stroke or a smaller Nib size, or simplify the shape first (Object > Simplify)`;
/** Is the page point inside the filled area of the object (the browser's own test, quick on any shape)? */
let hitCtx = null;
function insideShape(o, p) {
  const b = o.getBoundingRect();
  if (p.x < b.left || p.x > b.left + b.width || p.y < b.top || p.y > b.top + b.height) return false;
  try {
    const d = worldD(o);
    hitCtx ??= document.createElement('canvas').getContext('2d');
    return !!d && hitCtx.isPointInPath(new Path2D(d), p.x, p.y, o.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
  } catch { return false; }
}

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
  for (const o of userObjects()) {
    if (!o.pcFrame || !o.visible) continue;
    const b = o.getBoundingRect(), a = S({ x: b.left, y: b.top }), w = b.width * v[0], h = b.height * v[3];
    ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(30,123,255,.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + w, a.y + h); ctx.moveTo(a.x + w, a.y); ctx.lineTo(a.x, a.y + h); ctx.stroke();
    ctx.setLineDash([]);
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

// 3-Point Rectangle / 3-Point Ellipse (CorelDRAW): drag the base line (the ellipse's centre line) at any
// angle, release, then move to set the height (width) and click.
function tpDown(p) {
  if (!tp) { tp = { tool: state.tool, a: p, b: p, phase: 1, helper: helperPath(`M ${p.x} ${p.y}`) }; return; }
  if (tp.phase === 2) finishTp(p);
}
function tpGeometry(t, p) {
  const dx = t.b.x - t.a.x, dy = t.b.y - t.a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  return { L, ux, uy, nx, ny, h: (p.x - t.a.x) * nx + (p.y - t.a.y) * ny, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}
function tpOutline(t, p) {
  const g = tpGeometry(t, p), { a, b } = t;
  if (t.tool === 'rect3') return `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${b.x + g.nx * g.h} ${b.y + g.ny * g.h} L ${a.x + g.nx * g.h} ${a.y + g.ny * g.h} Z`;
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, rx = g.L / 2, ry = Math.abs(g.h);
  let d = '';
  for (let i = 0; i <= 48; i++) {
    const u = (i / 48) * Math.PI * 2, c = Math.cos(u) * rx, s = Math.sin(u) * ry;
    d += `${i ? ' L' : 'M'} ${m.x + g.ux * c + g.nx * s} ${m.y + g.uy * c + g.ny * s}`;
  }
  return `${d} Z`;
}
function tpMove(p) {
  if (tp.phase === 1) { tp.b = p; setLive(tp.helper, `M ${tp.a.x} ${tp.a.y} L ${p.x} ${p.y}`); }
  else setLive(tp.helper, tpOutline(tp, p));
  canvas.requestRenderAll();
}
function tpUp(p) {
  if (tp.phase !== 1) return;
  if (screenDist(tp.a, p) < 6) { cancelTp(); return; }
  tp.b = p; tp.phase = 2;
}
function finishTp(p) {
  const t = tp, g = tpGeometry(t, p);
  dropHelper(t.helper); tp = null;
  // A click right on the line: a sensible height instead of a flat shape.
  const h = Math.abs(g.h) < 2 ? g.L * (t.tool === 'rect3' ? 0.5 : 0.3) : Math.abs(g.h), side = g.h < 0 ? -1 : 1;
  const mid = { x: (t.a.x + t.b.x) / 2, y: (t.a.y + t.b.y) / 2 };
  const o = t.tool === 'rect3'
    ? paint(new Rect({ left: mid.x + (g.nx * h * side) / 2, top: mid.y + (g.ny * h * side) / 2, width: g.L, height: h, angle: g.angle, originX: 'center', originY: 'center', rx: state.shape.radiusRect ?? 0, ry: state.shape.radiusRect ?? 0, toolName: 'Rectangle' }))
    : paint(new Ellipse({ left: mid.x, top: mid.y, rx: g.L / 2, ry: h, angle: g.angle, originX: 'center', originY: 'center', toolName: 'Ellipse' }));
  // Keep the usual top-left origin (as every other shape), without moving it.
  const c = o.getCenterPoint();
  o.set({ originX: 'left', originY: 'top' });
  o.setPositionByOrigin(c, 'center', 'center');
  style(o);
  canvas.add(o);
  setTool('select');
  canvas.setActiveObject(o);
  canvas.requestRenderAll();
}
function cancelTp() { if (tp) { dropHelper(tp.helper); tp = null; } }

// Shaping brushes (Smooth, Smear, Twirl, Attract, Repel, Roughen) on the selected items. A group (text with a
// contour, a block shadow …) is split for the stroke and grouped again afterwards, so all its parts bend
// together; images have no outline to bend. Each stroke is one undo step.
let sculptGroups = [], sculpting = false;
function sculptDown(tool, p) {
  const label = TOOLS[tool].label, live = toolTargets.filter((o) => canvas.getObjects().includes(o));
  if (!live.length) { toast(`Select an item on the Artboard first (Pick tool), then choose ${label} again`, 5000); return; }
  if (live.every((o) => o.type === 'image')) { toast(`Images have no outline to bend. Trace the image to vectors first (select it, Properties tab > Trace bitmap), then use ${label} on the result`, 6500); return; }
  const targets = [];
  sculptGroups = [];
  muted++;
  try {
    for (const o of live) {
      if (o.type === 'group' && !o.powerClip) {
        const meta = {};
        for (const k of [...EXTRA, 'opacity', 'shadow']) if (o[k] !== undefined && o[k] !== null) meta[k] = o[k];
        const at = canvas.getObjects().indexOf(o), kids = o.removeAll();
        canvas.remove(o);
        kids.forEach((k, i) => canvas.insertAt(at + i, k));
        sculptGroups.push({ group: o, meta, at, kids });
        targets.push(...kids.filter((k) => k.type !== 'image' && V.canConvert(k)));
      } else if (o.type !== 'image' && V.canConvert(o)) targets.push(o);
    }
    sculpting = targets.length > 0 && nodes.brushDown(tool === 'smoothb' ? 'smooth' : tool, targets, p, state.shape.radius * MM, { dir: state.shape.twirl });
  } finally { muted--; }
  if (!sculpting) { regroupAfterSculpt(new Map()); toast(`${label} works on shapes and text (for a PowerClip, double-click it and edit its contents)`, 5000); }
}
function sculptUp(tool) {
  if (!sculpting) return;
  sculpting = false;
  muted++;
  let res;
  try { res = nodes.brushUp(); } finally { muted--; }
  const swap = new Map(res?.pairs ?? []);
  batch(() => regroupAfterSculpt(swap));
  // The next stroke works on the curves (and regrouped groups) this one made.
  toolTargets = toolTargets.map((o) => swap.get(o) ?? o).filter((o) => canvas.getObjects().includes(o));
  if (res && !res.changed) toast(`${TOOLS[tool].label} works on the outline: put the brush circle over the edge of the shape or letters (a bigger Nib size on the top bar helps)`, 5000);
}
function regroupAfterSculpt(swap) {
  for (const g of sculptGroups) {
    const parts = g.kids.map((k) => {
      const n = swap.get(k) ?? k;
      if (n !== k) for (const key of ['fxPart', 'toolName']) if (k[key] !== undefined) n[key] = k[key];
      return n;
    }).filter((n) => canvas.getObjects().includes(n));
    if (!parts.length) continue;
    muted++;
    try {
      for (const n of parts) canvas.remove(n);
      const grp = new Group(parts);
      grp.set(g.meta);
      style(grp);
      canvas.insertAt(Math.min(Math.max(1, g.at), canvas.getObjects().length), grp);
      swap.set(g.group, grp);
    } finally { muted--; }
  }
  sculptGroups = [];
  canvas.requestRenderAll();
}

// Free Transform (CorelDRAW): press where the pivot goes, then drag. Rotate (by the drag's angle), Reflect
// (across the drag line), Scale (the corner farthest from the pivot follows the pointer) or Skew (along the
// drag); Shift = 15° steps or even scaling. Apply to duplicate transforms a copy and keeps the original.
function ftDown(p) {
  const objs = toolTargets.filter((o) => canvas.getObjects().includes(o) && !o.locked);
  if (!objs.length) { toast('Select an item on the Artboard first (Pick tool), then choose Free Transform again', 5000); return; }
  const rs = objs.map((o) => o.getBoundingRect());
  const r = { left: Math.min(...rs.map((b) => b.left)), top: Math.min(...rs.map((b) => b.top)), right: Math.max(...rs.map((b) => b.left + b.width)), bottom: Math.max(...rs.map((b) => b.top + b.height)) };
  ft = { p0: p, objs, base: objs.map((o) => o.calcTransformMatrix()), r, moved: false, helper: helperPath(`M ${p.x} ${p.y}`) };
}
function ftMove(p, e) {
  const { p0, r } = ft, mode = state.shape.ftMode, dx = p.x - p0.x, dy = p.y - p0.y;
  if (screenDist(p, p0) < 3) return;
  const step = Math.PI / 12, snapA = (t) => (e.shiftKey ? Math.round(t / step) * step : t);
  let a = 1, b = 0, c = 0, d = 1;
  if (mode === 'rotate') { const t = snapA(Math.atan2(dy, dx)); a = Math.cos(t); b = Math.sin(t); c = -b; d = a; }
  else if (mode === 'reflect') { const t = snapA(Math.atan2(dy, dx)); a = Math.cos(2 * t); b = Math.sin(2 * t); c = b; d = -a; }
  else if (mode === 'scale') {
    const corners = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]];
    const far = corners.reduce((m, q) => (Math.hypot(q[0] - p0.x, q[1] - p0.y) > Math.hypot(m[0] - p0.x, m[1] - p0.y) ? q : m));
    const rx = far[0] - p0.x, ry = far[1] - p0.y;
    let sx = Math.abs(rx) > 1 ? (rx + dx) / rx : 1, sy = Math.abs(ry) > 1 ? (ry + dy) / ry : 1;
    if (e.shiftKey) { const k = Math.abs(sx) > Math.abs(sy) ? sx : sy; sx = k; sy = k; }
    a = sx || 0.01; d = sy || 0.01;
  } else if (Math.abs(dx) >= Math.abs(dy)) c = dx / Math.max(1, r.bottom - r.top);
  else b = dy / Math.max(1, r.right - r.left);
  const T = [a, b, c, d, p0.x - a * p0.x - c * p0.y, p0.y - b * p0.x - d * p0.y];
  ft.objs.forEach((o, i) => { util.applyTransformToObject(o, util.multiplyTransformMatrices(T, ft.base[i])); o.setCoords(); });
  const k = 6 / canvas.getZoom();
  setLive(ft.helper, `M ${p0.x} ${p0.y} L ${p.x} ${p.y} M ${p0.x - k} ${p0.y} L ${p0.x + k} ${p0.y} M ${p0.x} ${p0.y - k} L ${p0.x} ${p0.y + k}`);
  ft.moved = true;
  canvas.requestRenderAll();
}
async function ftUp() {
  const f = ft;
  ft = null;
  dropHelper(f.helper);
  if (!f.moved) return;
  if (!state.shape.ftDup) { batch(() => {}); return; }
  const copies = await Promise.all(f.objs.map((o) => o.clone(EXTRA)));
  batch(() => {
    f.objs.forEach((o, i) => { util.applyTransformToObject(o, f.base[i]); o.setCoords(); });
    copies.forEach((c, i) => { c.name = `${f.objs[i].name ?? 'Object'} copy`; style(c); canvas.add(c); });
  });
  // The next drag transforms the copies, as in CorelDRAW.
  toolTargets = copies;
  canvas.requestRenderAll();
}

// Virtual Segment Delete (CorelDRAW): the part of a line between two crossings (with itself or another object)
// turns red under the pointer; a click deletes just that part. What is left is an open line.
let vsdTime = 0;
function vsdFind(p) {
  const tol = 8 / canvas.getZoom(), objs = userObjects().filter((o) => o.visible && !o.locked && o.type !== 'image' && o.type !== 'group' && V.canConvert(o));
  const near = (b, q) => q.x >= b.left - tol && q.x <= b.left + b.width + tol && q.y >= b.top - tol && q.y <= b.top + b.height + tol;
  const touch = (a, b) => !(a.left > b.left + b.width || a.left + a.width < b.left || a.top > b.top + b.height || a.top + a.height < b.top);
  for (const o of objs.slice().reverse()) {
    const box = o.getBoundingRect();
    if (!near(box, p)) continue;
    let d;
    try { d = worldD(o); } catch { continue; }
    if (!d) continue;
    const others = objs.filter((x) => x !== o && touch(x.getBoundingRect(), box)).map((x) => { try { return worldD(x); } catch { return ''; } }).filter(Boolean);
    let res = null;
    try { res = V.virtualSegment(d, others, p, tol); } catch { res = null; }
    if (res) return { o, ...res };
  }
  return null;
}
function dropVsdHover() { if (vsdHover) { dropHelper(vsdHover); vsdHover = null; canvas.requestRenderAll(); } }
function vsdHoverAt(p) {
  const now = performance.now();
  if (now - vsdTime < 60) return;
  vsdTime = now;
  const hit = vsdFind(p);
  if (!hit) { dropVsdHover(); return; }
  if (!vsdHover) vsdHover = helperPath(hit.cut, { stroke: '#ff4d6d', strokeWidth: 3 / canvas.getZoom(), strokeDashArray: null });
  else setLive(vsdHover, hit.cut);
  canvas.requestRenderAll();
}
function vsdClick(p) {
  const hit = vsdFind(p);
  dropVsdHover();
  if (!hit) { toast('Click right on a line or outline: the part between two crossings is deleted', 4000); return; }
  const { o, keep } = hit;
  batch(() => {
    if (!keep) { canvas.remove(o); return; }
    const n = makePath(keep, o);
    n.name = o.name;
    // Open now: no fill, and an outline so it stays visible.
    const lined = o.stroke && o.strokeWidth;
    n.set({ fill: null, stroke: lined ? o.stroke : solid(o), strokeWidth: lined ? o.strokeWidth : Math.max(0.5 * MM, 1) });
    replaceObject(o, n);
  });
}

// Angular dimension and 2-Leg Callout: three clicks.
function multiDown(tool, p) {
  if (!multi) { multi = { tool, pts: [p], helper: helperPath(`M ${p.x} ${p.y}`) }; return; }
  if (screenDist(p, multi.pts.at(-1)) < 4) return; // the second click of a double-click
  multi.pts.push(p);
  if (multi.pts.length < 3) return;
  const m = multi;
  multi = null;
  dropHelper(m.helper);
  if (m.tool === 'dimA') addAngular(...m.pts); else addCallout(...m.pts);
}
function multiMove(p) {
  const q = [...multi.pts, p];
  const d = multi.tool === 'dimA' && q.length === 3 ? `M ${q[1].x} ${q[1].y} L ${q[0].x} ${q[0].y} L ${q[2].x} ${q[2].y}` : `M ${q.map((z) => `${z.x} ${z.y}`).join(' L ')}`;
  setLive(multi.helper, d);
  canvas.requestRenderAll();
}
function cancelMulti() { if (multi) { dropHelper(multi.helper); multi = null; } }
function addAngular(v, a, b) {
  const t1 = Math.atan2(a.y - v.y, a.x - v.x), t2 = Math.atan2(b.y - v.y, b.x - v.x);
  let sweep = t2 - t1;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const deg = (Math.abs(sweep) * 180) / Math.PI, col = '#111827', arrow = 2.2 * MM;
  const R = Math.max(8 * MM, 0.55 * Math.min(Math.hypot(a.x - v.x, a.y - v.y), Math.hypot(b.x - v.x, b.y - v.y)));
  const at = (t, r) => ({ x: v.x + Math.cos(t) * r, y: v.y + Math.sin(t) * r });
  const s0 = at(t1, R), s1 = at(t1 + sweep, R), dir = Math.sign(sweep) || 1;
  const line = (d) => new Path(d, { stroke: col, strokeWidth: 0.3 * MM, fill: null, strokeUniform: true });
  // Arrows at the ends of the arc, pointing along it to the sides.
  const head = (q, t, s) => {
    const tx = -Math.sin(t) * dir * s, ty = Math.cos(t) * dir * s, nx = -ty, ny = tx;
    return new Path(`M ${q.x} ${q.y} L ${q.x - tx * arrow + nx * arrow * 0.45} ${q.y - ty * arrow + ny * arrow * 0.45} L ${q.x - tx * arrow - nx * arrow * 0.45} ${q.y - ty * arrow - ny * arrow * 0.45} Z`, { fill: col, stroke: null });
  };
  const mid = at(t1 + sweep / 2, R + 6 * MM);
  const label = new IText(`${deg.toFixed(1)}°`, { fontFamily: 'Inter', fontWeight: 400, fontSize: 6 * MM, fill: col, originX: 'center', originY: 'center', left: mid.x, top: mid.y });
  const g = style(new Group([
    line(`M ${v.x} ${v.y} L ${a.x} ${a.y}`), line(`M ${v.x} ${v.y} L ${b.x} ${b.y}`),
    line(`M ${s0.x} ${s0.y} A ${R} ${R} 0 0 ${sweep > 0 ? 1 : 0} ${s1.x} ${s1.y}`),
    head(s0, t1, -1), head(s1, t1 + sweep, 1), label,
  ]), { toolName: 'Dimension' });
  g.name = `Angle ${deg.toFixed(1)}°`;
  canvas.add(g);
  setTool('select');
  canvas.setActiveObject(g);
}
// Segment dimension (CorelDRAW): the straight distance between the end nodes of the side under the pointer,
// set off from the object. Pointing at a side shows it with its length first. Text is not measured (convert it to
// curves first).
/** The side (node to node) of a shape or line nearest the page point, within a few screen pixels: the nearest of all
 *  objects, and on a tie the one in front. */
function segmentAt(p) {
  const tol = 10 / canvas.getZoom();
  const objs = userObjects().filter((o) => o.visible && !o.locked && !isText(o) && o.type !== 'image' && o.type !== 'group' && V.canConvert(o));
  let best = null;
  objs.forEach((o, z) => {
    const b = o.getBoundingRect();
    if (p.x < b.left - tol || p.x > b.left + b.width + tol || p.y < b.top - tol || p.y > b.top + b.height + tol) return;
    let model;
    try { model = V.objectModel(o); } catch { return; }
    for (const sp of model) {
      const n = sp.nodes.length, segs = sp.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const A = sp.nodes[i], B = sp.nodes[(i + 1) % n];
        if (Math.hypot(B.x - A.x, B.y - A.y) < 1) continue;
        const straight = !A.ho && !B.hi, hit = V.nearestOnSegment(V.segmentPoints(A, B), p, straight);
        if (hit.dist > tol) continue;
        if (!best || hit.dist < best.dist - 1e-6 || (hit.dist <= best.dist + 1e-6 && z > best.z)) best = { dist: hit.dist, z, o, A, B, straight };
      }
    }
  });
  return best;
}
let segHoverTime = 0;
function segmentHover(p) {
  const now = performance.now();
  if (now - segHoverTime < 50) return;
  segHoverTime = now;
  const s = segmentAt(p);
  topSegment = s ? { pts: V.segmentPoints(s.A, s.B), label: `${inUnits(Math.hypot(s.B.x - s.A.x, s.B.y - s.A.y))} ${unit().name}` } : null;
  drawTop();
}
function segmentDimension(p) {
  const s = segmentAt(p);
  topSegment = null; drawTop();
  if (!s) { toast('Point at a side of a shape or a line: it lights up with its length, then click to measure it', 4500); return; }
  const { o, A, B } = s, c = o.getCenterPoint(), L = Math.hypot(B.x - A.x, B.y - A.y);
  const nx = -(B.y - A.y) / L, ny = (B.x - A.x) / L, mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const away = (mx - c.x) * nx + (my - c.y) * ny >= 0 ? 1 : -1;
  // A curved side: the measurement line goes beyond its bulge.
  let bulge = 0;
  if (!s.straight) { const pts = V.segmentPoints(A, B); for (let k = 1; k < 16; k++) { const q = V.bezierAt(pts, k / 16); bulge = Math.max(bulge, ((q.x - A.x) * nx + (q.y - A.y) * ny) * away); } }
  addDimension({ x: A.x, y: A.y }, { x: B.x, y: B.y }, false, away * (8 * MM + bulge));
}
// 2-Leg Callout: a leader with an arrow and the text, kept together as one item; double-click it to change the text.
function addCallout(t, e, n) {
  const col = '#111827', arrow = 2.6 * MM, L = Math.hypot(t.x - e.x, t.y - e.y) || 1, ux = (t.x - e.x) / L, uy = (t.y - e.y) / L;
  const leader = new Path(`M ${t.x} ${t.y} L ${e.x} ${e.y} L ${n.x} ${n.y}`, { stroke: col, strokeWidth: 0.35 * MM, fill: null, strokeUniform: true, strokeLineJoin: 'round', toolName: 'Callout line' });
  const head = new Path(`M ${t.x} ${t.y} L ${t.x - ux * arrow - uy * arrow * 0.45} ${t.y - uy * arrow + ux * arrow * 0.45} L ${t.x - ux * arrow + uy * arrow * 0.45} ${t.y - uy * arrow - ux * arrow * 0.45} Z`, { fill: col, stroke: null, toolName: 'Callout arrow' });
  const right = n.x >= e.x;
  const label = new IText('Callout text', { fontFamily: 'Inter', fontWeight: 500, fontSize: 6 * MM, fill: col, originX: right ? 'left' : 'right', originY: 'center', left: n.x + (right ? 1.5 : -1.5) * MM, top: n.y, toolName: 'Callout text' });
  const id = `callout-${Date.now().toString(36)}`;
  for (const o of [leader, head, label]) { o.calloutId = id; style(o); }
  batch(() => canvas.add(leader, head, label));
  setTool('select');
  canvas.setActiveObject(label);
  label.enterEditing(); label.selectAll();
  canvas.requestRenderAll();
}
function groupCallout(id) {
  const parts = userObjects().filter((o) => o.calloutId === id);
  if (parts.length < 2) return;
  const text = parts.find(isText)?.text ?? '';
  let g;
  batch(() => {
    for (const o of parts) { canvas.remove(o); delete o.calloutId; }
    g = style(new Group(parts), { toolName: 'Callout' });
    g.name = `Callout “${text.slice(0, 24)}”`;
    canvas.add(g);
  });
  canvas.setActiveObject(g);
  canvas.requestRenderAll();
}
function editCallout(g) {
  const id = `callout-${Date.now().toString(36)}`;
  let label;
  muted++;
  try {
    const at = canvas.getObjects().indexOf(g), kids = g.removeAll();
    canvas.remove(g);
    kids.forEach((k, i) => { k.calloutId = id; canvas.insertAt(at + i, k); });
    label = kids.find(isText);
  } finally { muted--; }
  if (!label) return;
  canvas.setActiveObject(label);
  label.enterEditing(); label.selectAll();
  canvas.requestRenderAll();
}
canvas.on('text:editing:exited', ({ target }) => { if (target?.calloutId) setTimeout(() => groupCallout(target.calloutId)); });

// Smart Drawing (CorelDRAW): a freehand sketch becomes the clean shape it looks like (see sketch.js), or a smooth
// curve when it is not one of them. The new shape is drawn with the current fill and outline, like the shape tools.
const SMART_NAMES = { line: 'a line', rect: 'a rectangle', ellipse: 'an ellipse', triangle: 'a triangle', diamond: 'a diamond', polygon: 'a polygon', curve: 'a smooth curve' };
function smoothTol(level) { return (0.6 + (Math.max(0, Math.min(100, level)) / 100) * 7) / canvas.getZoom(); }
function finishSmart(raw) {
  const r = SK.recognize(raw, state.smart.level, canvas.getZoom());
  if (!r || (r.kind === 'curve' && r.pts.length < 3)) { toast('Sketch a shape: drag to draw it'); return; }
  let o;
  if (r.kind === 'rect' || r.kind === 'ellipse') {
    o = r.kind === 'rect'
      ? paint(new Rect({ left: r.cx, top: r.cy, width: r.w, height: r.h, angle: r.angle, originX: 'center', originY: 'center', rx: state.shape.radiusRect ?? 0, ry: state.shape.radiusRect ?? 0, toolName: 'Rectangle' }))
      : paint(new Ellipse({ left: r.cx, top: r.cy, rx: r.rx, ry: r.ry, angle: r.angle, originX: 'center', originY: 'center', toolName: 'Ellipse' }));
    const c = o.getCenterPoint();
    o.set({ originX: 'left', originY: 'top' });
    o.setPositionByOrigin(c, 'center', 'center');
    if (r.kind === 'rect' && r.w === r.h) o.toolName = 'Rectangle';
  } else if (r.kind === 'line') o = paintLine(new Path(`M ${r.a.x} ${r.a.y} L ${r.b.x} ${r.b.y}`, { toolName: '2-Point Line' }));
  else if (r.kind === 'curve') {
    const d = V.fitPartsD([{ closed: r.closed, pts: SK.thin(r.pts, 1 / canvas.getZoom()) }], smoothTol(state.smart.smooth));
    o = new Path(d, { toolName: 'Curve' });
    if (r.closed) paint(o); else paintLine(o);
  } else o = paint(new Path(`M ${r.pts.map((q) => `${q.x} ${q.y}`).join(' L ')} Z`, { toolName: r.kind === 'triangle' ? 'Triangle' : r.kind === 'diamond' ? 'Diamond' : 'Polygon' }));
  style(o);
  canvas.add(o);
  canvas.setActiveObject(o);
  canvas.requestRenderAll();
  const what = r.kind === 'ellipse' && r.rx === r.ry ? 'a circle' : r.kind === 'rect' && r.w === r.h ? 'a square' : SMART_NAMES[r.kind];
  toast(`Smart Drawing: ${what}`);
}

// LiveSketch (CorelDRAW): strokes become one smooth curve after a pause (the Timer); a stroke that starts or ends
// at the end of a LiveSketch curve extends it, and one drawn along a curve reshapes that stretch. Each curve keeps
// its sketched points (liveSpec) so later strokes can join it.
function finishLive() {
  clearTimeout(liveTimer);
  if (!livePending.length) return;
  const strokes = livePending.map((q) => SK.thin(q, 1.2 / canvas.getZoom())).filter((q) => q.length > 1);
  livePending = [];
  drawTop();
  if (!strokes.length) return;
  const near = Math.max(4, state.live.near) / canvas.getZoom(), tol = smoothTol(state.live.smooth);
  // Chains: the LiveSketch curves already on the page (each may be extended or reshaped) and new ones.
  const chains = userObjects().filter((o) => o.liveSpec?.pts && o.visible && !o.locked).map((o) => ({ o, pts: o.liveSpec.pts.map(([x, y]) => ({ x, y })), changed: false }));
  for (const st of strokes) {
    let done = false;
    for (const c of chains) {
      const j = SK.retrace(c.pts, st, near) ?? SK.joinEnds(c.pts, st, near);
      if (j) { c.pts = j; c.changed = true; done = true; break; }
    }
    if (!done) chains.push({ o: null, pts: st, changed: true });
  }
  const made = [];
  batch(() => {
    for (const c of chains) {
      if (!c.changed) continue;
      const pts = SK.thin(c.pts, 1.2 / canvas.getZoom());
      const closed = pts.length > 8 && Math.hypot(pts[0].x - pts.at(-1).x, pts[0].y - pts.at(-1).y) <= near;
      const d = V.fitPartsD([{ closed, pts: closed ? pts.slice(0, -1) : pts }], tol);
      const o = new Path(d, { toolName: 'LiveSketch' });
      if (c.o) { copyStyle(c.o, o); if (closed && !c.o.fill) paint(o); o.name = c.o.name; replaceObject(c.o, o); }
      else { if (closed) paint(o); else paintLine(o); o.name = `LiveSketch ${++counter}`; style(o); canvas.add(o); }
      o.liveSpec = { pts: pts.map((q) => [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10]) };
      made.push(o);
    }
  });
  if (made.length) { canvas.setActiveObject(made.at(-1)); canvas.requestRenderAll(); }
}

// Painterly Brush (CorelDRAW): a realistic brush stroke painted as a picture (see paint.js), placed on the page as an
// image. The stroke and settings are kept (paintSpec), so a new brush, size, flow or fill colour repaints it.
function paintedImage(spec) {
  const out = PB.paintStroke(spec.pts.map(([x, y]) => ({ x, y })), { ...spec, pxPerUnit: 1.6 });
  if (!out) return null;
  return { el: out.canvas, left: out.left, top: out.top, scale: out.scale };
}
function finishPaint(raw) {
  const pts = SK.thin(raw, 0.8 / canvas.getZoom(), 500);
  if (pts.length < 2) { toast('Drag to paint a stroke'); return; }
  const spec = { brush: state.paint.brush, size: Math.max(0.5, state.paint.size) * MM, flow: state.paint.flow / 100, colour: typeof state.fill === 'string' ? state.fill : '#000000', seed: Math.floor(Math.random() * 1e9) + 1, pts: pts.map((q) => [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10]) };
  const r = paintedImage(spec);
  if (!r) return;
  const img = new FabricImage(r.el, { left: r.left, top: r.top, scaleX: r.scale, scaleY: r.scale, originX: 'left', originY: 'top' });
  img.paintSpec = spec;
  style(img, { toolName: 'Painterly brush' });
  img.name = `Painterly stroke ${++counter}`;
  canvas.add(img);
  canvas.setActiveObject(img);
  syncContext();
  canvas.requestRenderAll();
}
/** Repaints a painterly stroke with changed settings, keeping its place. */
function repaint(o, changes) {
  const spec = { ...o.paintSpec, ...changes }, r = paintedImage(spec);
  if (!r) return;
  o.setElement(r.el);
  o.set({ left: r.left, top: r.top, scaleX: r.scale, scaleY: r.scale, angle: 0, flipX: false, flipY: false, cropX: 0, cropY: 0 });
  o.paintSpec = spec;
  o.setCoords();
  canvas.requestRenderAll();
}

// Artistic Media (CorelDRAW): a freehand stroke becomes a filled shape (see media.js). The centre line is kept with
// the stroke (mediaSpec), so it can be redrawn with other settings; the Sprayer makes a group of shapes.
function mediaObject(spec, fill, from) {
  const built = AM.buildMedia(spec), colour = fill || state.fill;
  let o;
  if (built.items) {
    if (!built.items.length) return null;
    o = new Group(built.items.map((it) => new Path(it.d, { fill: it.fill ?? colour, stroke: null, strokeWidth: 0, objectCaching: false })));
  } else {
    if (!built.d) return null;
    o = new Path(built.d, { fill: colour, stroke: null, strokeWidth: 0, fillRule: 'nonzero' });
  }
  o.mediaSpec = spec;
  style(o, { toolName: 'Artistic media' });
  if (from) { o.name = from.name; o.set({ opacity: from.opacity, shadow: from.shadow ?? null }); } else o.name = `Artistic media ${++counter}`;
  return o;
}
function finishMedia(raw) {
  const m = state.media, W = Math.max(0.5, m.width) * MM;
  if (raw.length < 2 || raw.every((q) => screenDist(q, raw[0]) < 2)) { toast('Drag to draw a stroke'); return; }
  const spec = { ...mediaSettings(m), seed: Math.floor(Math.random() * 1e9) + 1, pts: AM.captureStroke(raw, canvas.getZoom(), Math.max(0.6, W / 6)) };
  const o = mediaObject(spec, state.fill);
  if (!o) { toast('That stroke is too short: drag a little further'); return; }
  canvas.add(o);
  canvas.setActiveObject(o);
  syncContext();
  canvas.requestRenderAll();
}

// Freehand Pick (CorelDRAW): a loop round the objects selects them (those whose centre is inside it).
function lassoSelect(points) {
  if (points.length < 3) { setTool('select'); return; }
  const inside = (q) => {
    let c = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const hit = userObjects().filter((o) => o.visible && !o.locked && inside(o.getCenterPoint()));
  setTool('select');
  if (!hit.length) { toast('Nothing inside the loop: draw it round the objects to select them'); return; }
  canvas.setActiveObject(hit.length === 1 ? hit[0] : new ActiveSelection(hit, { canvas }));
  canvas.requestRenderAll();
  toast(`${hit.length} object${hit.length > 1 ? 's' : ''} selected`);
}

// Smudge (CorelDRAW): drag from inside a selected shape outwards to pull its outline out along the stroke,
// or from outside inwards to press it in. The stroke is the nib wide and narrows towards its end.
function smudgeDown(p) {
  if (geomBusy) { toast('Still working out the last stroke: one moment'); return; }
  const live = toolTargets.filter((o) => canvas.getObjects().includes(o));
  const pool = (live.length ? live : userObjects().filter((o) => o.visible && !o.locked)).filter((o) => V.canConvert(o) && o.type !== 'image' && closedish(o));
  // Inside the shape itself (its outline, not its bounding box): pull out; otherwise press in.
  const grow = pool.slice().reverse().find((o) => insideShape(o, p));
  smudge = { points: [p], grow, pool };
  topStroke = { points: smudge.points, width: state.shape.radius * MM * 2, colour: grow ? 'rgba(18,225,240,.35)' : 'rgba(255,80,80,.35)' };
  drawTop();
}
async function applySmudge(sm) {
  const w = state.shape.radius * MM * 2, pts = G.thinStroke(sm.points, w / 3);
  const missed = 'Drag across the outline: from inside a selected shape to pull it out, from outside to press it in';
  if (pts.length < 2) { toast(missed); return; }
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const box = { left: Math.min(...xs) - w / 2, top: Math.min(...ys) - w / 2, right: Math.max(...xs) + w / 2, bottom: Math.max(...ys) + w / 2 };
  const targets = (sm.grow ? [sm.grow] : sm.pool.filter((o) => { const r = o.getBoundingRect(); return !(r.left > box.right || r.left + r.width < box.left || r.top > box.bottom || r.top + r.height < box.top); }))
    .filter((o) => canvas.getObjects().includes(o));
  if (!targets.length) { toast(missed); return; }
  const ds = targets.map((o) => { try { return worldD(o); } catch { return ''; } });
  let res;
  geomBusy++;
  try { res = await geomRun({ points: pts, width: w, taper: 0.7, kind: sm.grow ? 'unite' : 'subtract', targets: ds }); }
  catch (e) { toast(e.message === 'timeout' ? TOO_SLOW('smudge') : 'That smudge could not be worked out: please try again', 6500); return; }
  finally { geomBusy--; }
  const changed = [];
  batch(() => {
    targets.forEach((o, i) => {
      const d = res.out[i];
      if (d == null || !canvas.getObjects().includes(o)) return;
      if (!d) { canvas.remove(o); return; }
      const p = makePath(d, o, { toolName: 'Curve' }); p.name = o.name;
      replaceObject(o, p); changed.push([o, p]);
    });
  });
  toolTargets = toolTargets.map((o) => changed.find(([a]) => a === o)?.[1] ?? o).filter((o) => canvas.getObjects().includes(o));
  if (!changed.length) toast(sm.grow ? 'Drag from inside the shape out across its outline' : 'Drag from outside a selected shape in across its outline');
}
// Paragraph text (CorelDRAW): text in a frame; it wraps at the frame's width.
function addParagraph(box) {
  const w = Math.max(box.w || 0, 60 * MM);
  const t = style(paint(new Textbox('Type your paragraph text here. It wraps inside the frame: drag the side handles to change the width.', {
    left: box.x, top: box.y, width: w, ...state.text, fontSize: Math.min(state.text.fontSize, 12) * MM, textAlign: 'left',
  })), { toolName: 'Paragraph text' });
  t.set({ strokeWidth: 0, stroke: null });
  canvas.add(t);
  setTool('select');
  canvas.setActiveObject(t);
  t.enterEditing(); t.selectAll();
  canvas.requestRenderAll();
}

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
function addDimension(a, b, hv, offset = 0) {
  const tick = 3 * MM, arrow = 2.2 * MM, col = '#111827';
  let dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const value = hv ? (Math.abs(dx) >= Math.abs(dy) ? Math.abs(dx) : Math.abs(dy)) : L;
  // Away from the measured edge (segment dimension): extension lines out to the dimension line.
  const ext = [];
  if (offset) {
    const a2 = { x: a.x + nx * offset, y: a.y + ny * offset }, b2 = { x: b.x + nx * offset, y: b.y + ny * offset }, over = Math.sign(offset) * 1.5 * MM;
    ext.push(`M ${a.x} ${a.y} L ${a2.x + nx * over} ${a2.y + ny * over}`, `M ${b.x} ${b.y} L ${b2.x + nx * over} ${b2.y + ny * over}`);
    a = a2; b = b2;
  }
  const parts = [
    `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
    ...(offset ? ext : [`M ${a.x + nx * tick} ${a.y + ny * tick} L ${a.x - nx * tick} ${a.y - ny * tick}`, `M ${b.x + nx * tick} ${b.y + ny * tick} L ${b.x - nx * tick} ${b.y - ny * tick}`]),
  ].map((d) => new Path(d, { stroke: col, strokeWidth: 0.3 * MM, fill: null, strokeUniform: true }));
  const head = (p, s) => new Path(`M ${p.x} ${p.y} L ${p.x + s * ux * arrow + nx * arrow * 0.45} ${p.y + s * uy * arrow + ny * arrow * 0.45} L ${p.x + s * ux * arrow - nx * arrow * 0.45} ${p.y + s * uy * arrow - ny * arrow * 0.45} Z`, { fill: col, stroke: null });
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  // The label sits just above the dimension line; set off from an edge (segment dimension), on the far side.
  const label = offset
    ? new IText(`${inUnits(value)} ${unit().name}`, { fontFamily: 'Inter', fontWeight: 400, fontSize: 6 * MM, fill: col, originX: 'center', originY: 'center', angle, left: (a.x + b.x) / 2 + Math.sign(offset) * nx * 4.2 * MM, top: (a.y + b.y) / 2 + Math.sign(offset) * ny * 4.2 * MM })
    : new IText(`${inUnits(value)} ${unit().name}`, { fontFamily: 'Inter', fontWeight: 400, fontSize: 6 * MM, fill: col, originX: 'center', originY: 'bottom', angle, left: (a.x + b.x) / 2 - nx * 1.2 * MM * Math.sign(ny || 1), top: (a.y + b.y) / 2 - ny * 1.2 * MM * Math.sign(ny || 1) });
  const g = style(new Group([...parts, head(a, 1), head(b, -1), label]), { toolName: 'Dimension' });
  g.name = `Dimension ${inUnits(value)} ${unit().name}`;
  canvas.add(g); canvas.setActiveObject(g);
  return g;
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
/**
 * Smart Fill (CorelDRAW): a new filled object from the area enclosed round the click. The area is worked out in the
 * shape worker with a time limit, like Smudge and the Eraser, so very detailed artwork can't freeze the page. Earlier
 * Smart Fill results are left out (their edges are copies of the shapes' own edges), and only shapes near the click
 * are sent.
 */
async function smartFill(p) {
  if (geomBusy) { toast('Still working out the last area: one moment'); return; }
  const shapes = userObjects().filter((o) => o.visible && o.toolName !== 'Smart fill' && V.canConvert(o) && closedish(o));
  const rect = (o) => o.getBoundingRect(), has = (b, q) => q.x >= b.left && q.x <= b.left + b.width && q.y >= b.top && q.y <= b.top + b.height;
  const around = shapes.filter((o) => has(rect(o), p));
  if (!around.length) { toast('Click inside an area enclosed by shapes'); return; }
  // Only shapes overlapping the area the enclosing shapes share can cut into it.
  const box = around.map(rect).reduce((a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.left + b.width), bottom: Math.min(a.bottom, b.top + b.height) }), { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity });
  const near = shapes.filter((o) => { const b = rect(o); return has(b, p) || !(b.left > box.right || b.left + b.width < box.left || b.top > box.bottom || b.top + b.height < box.top); });
  const ds = near.map((o) => { try { return worldD(o); } catch { return ''; } }).filter(Boolean);
  let d = '';
  geomBusy++;
  try { d = (await geomRun({ op: 'smartfill', shapes: ds, p: { x: p.x, y: p.y } })).d; }
  catch (e) { toast(e.message === 'timeout' ? 'That area took too long to work out (the artwork round it is very detailed), so nothing was added. Try a simpler area, or simplify the shapes first (Object > Simplify)' : 'That area could not be worked out: please try again', 6500); return; }
  finally { geomBusy--; }
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
async function applyEraser(points) {
  if (points.length < 1) return;
  const w = state.shape.eraser * MM, pts = G.thinStroke(points, w / 4), xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const bounds = { left: Math.min(...xs) - w / 2, top: Math.min(...ys) - w / 2, right: Math.max(...xs) + w / 2, bottom: Math.max(...ys) + w / 2 };
  const targets = cutTargets(bounds).filter(shapeable), images = cutTargets(bounds).filter((x) => x.type === 'image');
  if (targets.length) {
    const ds = targets.map((o) => { try { return worldD(o); } catch { return ''; } });
    let res = null;
    geomBusy++;
    try { res = await geomRun({ points: pts, width: w, kind: 'subtract', targets: ds }); }
    catch (e) { toast(e.message === 'timeout' ? TOO_SLOW('erase') : 'That erase could not be worked out: please try again', 6500); }
    finally { geomBusy--; }
    if (res) {
      const changed = [];
      batch(() => {
        targets.forEach((o, i) => {
          const d = res.out[i];
          if (d == null || !canvas.getObjects().includes(o)) return;
          if (!d) { canvas.remove(o); return; }
          const p = makePath(d, o); p.name = o.name; if (!closedish(o)) p.set('fill', null);
          replaceObject(o, p); changed.push([o, p]);
        });
      });
      toolTargets = toolTargets.map((o) => changed.find(([a]) => a === o)?.[1] ?? o).filter((o) => canvas.getObjects().includes(o));
    }
  }
  // Images under the eraser lose those pixels (vectors above are cut as shapes).
  for (const o of images) if (canvas.getObjects().includes(o)) erasePixels(o, points, w);
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
  if (o.powerClip) return regionD(o.getObjects()[0]);
  if (o.type === 'group') return o.getObjects().map(regionD).filter(Boolean).reduce((a, d) => (a ? V.boolean('unite', a, d) : d), '');
  if (o.type === 'image') return `M ${o.getCoords().map((q) => `${q.x} ${q.y}`).join(' L ')} Z`;
  if (!V.canConvert(o)) return '';
  const d = worldD(o), w = o.stroke && o.strokeWidth ? o.strokeWidth * (o.strokeUniform ? 1 : Math.max(Math.abs(o.scaleX), Math.abs(o.scaleY))) : 0;
  if (!o.fill || !V.isClosedD(d)) return w ? V.strokeOutlineD(d, w) : '';
  return w ? V.offsetD(d, w / 2) : d;
}
/** The filled area only (mesh fill colours stay inside it). */
function fillD(o) {
  if (o.powerClip) return fillD(o.getObjects()[0]);
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

// ===================================================================
// PowerClip (CorelDRAW): objects shown only inside a frame shape. A PowerClip is
// Group([frame, contents]) where the contents group is clipped to the frame's outline.
// ===================================================================
/** A PowerClip's box is its frame's box: hidden contents don't make the selection bigger. */
class FrameLayout extends FitContentLayout {
  static type = 'powerclip-frame';
  calcBoundingBox(objects, context) { return super.calcBoundingBox(objects.slice(0, 1), context); }
}
classRegistry.setClass(FrameLayout);
/** PowerClips saved before FrameLayout get it when loaded. */
function fitPowerClips(o) {
  if (o.type !== 'group') return;
  o.getObjects().forEach(fitPowerClips);
  if (o.powerClip && !(o.layoutManager?.strategy instanceof FrameLayout)) { o.layoutManager = new LayoutManager(new FrameLayout()); o.triggerLayout(); }
}
/** Frame + contents -> PowerClip at the frame's place in the stacking order. */
function buildPowerClip(frame, contents, { name, index } = {}) {
  const at = index ?? canvas.getObjects().indexOf(frame);
  for (const o of [frame, ...contents]) if (canvas.getObjects().includes(o)) canvas.remove(o);
  const clip = makePath(worldD(frame), null), inner = new Group(contents);
  const c = clip.getCenterPoint(), local = util.transformPoint(c, util.invertTransform(inner.calcTransformMatrix()));
  clip.set({ originX: 'center', originY: 'center', left: local.x, top: local.y, fill: '#000', stroke: null });
  inner.clipPath = clip;
  delete frame.pcFrame;
  frame.set({ selectable: true, evented: true });
  const pc = style(new Group([frame, inner], { layoutManager: new LayoutManager(new FrameLayout()) }), { toolName: 'PowerClip' });
  pc.powerClip = true; pc.name = name ?? `PowerClip ${++counter}`;
  canvas.insertAt(Math.max(1, at < 0 ? canvas.getObjects().length : at), pc);
  return pc;
}
/** PowerClip -> its frame and contents (page positions), removed from the page. */
function openPowerClip(pc) {
  const index = canvas.getObjects().indexOf(pc), [frame, inner] = pc.removeAll();
  canvas.remove(pc);
  inner.clipPath = null;
  return { frame, contents: inner.removeAll(), index, name: pc.name };
}
/** Move (and for fit / fill, scale) the contents to the frame: centre, fit inside, or fill the frame. */
function placeContents(contents, frame, mode) {
  const f = V.dBounds(worldD(frame)), rs = contents.map((o) => { o.setCoords(); return o.getBoundingRect(); });
  const b = { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)) };
  b.width = Math.max(...rs.map((r) => r.left + r.width)) - b.left; b.height = Math.max(...rs.map((r) => r.top + r.height)) - b.top;
  const k = mode === 'fit' ? Math.min(f.width / b.width, f.height / b.height) : mode === 'fill' ? Math.max(f.width / b.width, f.height / b.height) : 1;
  const bc = new Point(b.left + b.width / 2, b.top + b.height / 2), fc = new Point(f.left + f.width / 2, f.top + f.height / 2);
  for (const o of contents) {
    const c = o.getCenterPoint();
    o.set({ scaleX: o.scaleX * k, scaleY: o.scaleY * k });
    o.setPositionByOrigin(new Point(fc.x + (c.x - bc.x) * k, fc.y + (c.y - bc.y) * k), 'center', 'center');
    o.setCoords();
  }
}
const overlaps = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

// Place inside: select the contents, choose PowerClip inside, then click the frame.
function startPowerClip() {
  const contents = active();
  if (!contents.length) { toast('Select the objects to place inside a frame first'); return; }
  pickFrame = contents;
  canvas.discardActiveObject();
  hint('Click the frame shape (or text) to place the objects inside it · Esc cancels');
  canvas.defaultCursor = 'copy';
}
async function placeInFrame(frame) {
  const contents = pickFrame; pickFrame = null; hint(TOOL_HINTS[state.tool] ?? ''); canvas.defaultCursor = toolCursor(state.tool);
  if (!frame || contents.includes(frame) || !(shapeable(frame) || frame.powerClip)) { toast('PowerClip cancelled: click a shape or text that is not one of the contents'); return; }
  let pc;
  batch(() => {
    // Placing into a PowerClip adds to what is already inside it.
    const open = frame.powerClip ? openPowerClip(frame) : null, base = open?.frame ?? frame;
    // Contents that would be hidden (nowhere over the frame) are centred in it, as CorelDRAW does.
    const f = V.dBounds(worldD(base));
    if (!contents.some((o) => overlaps(o.getBoundingRect(), f))) placeContents(contents, base, 'centre');
    pc = buildPowerClip(base, [...(open?.contents ?? []), ...contents], { name: open?.name, index: open?.index });
  });
  select([pc]);
  toast('Placed inside the frame · double-click it to move the contents · right-click for more');
}
function extractPowerClip(pc = one()) {
  if (pcEdit) finishPowerClipEdit();
  pc = pc?.powerClip ? pc : one();
  if (!pc?.powerClip) { toast('Select a PowerClip object'); return; }
  canvas.discardActiveObject();
  const out = [];
  batch(() => {
    const { frame, contents, index } = openPowerClip(pc);
    canvas.insertAt(Math.max(1, index), frame, ...contents);
    out.push(frame, ...contents);
  });
  select(out);
  toast('Contents taken out of the frame');
}
/** Centre the contents in the frame, fit them inside it, or scale them to fill it. */
function arrangePowerClip(mode) {
  if (pcEdit) {
    const live = pcEdit.contents.filter((o) => canvas.getObjects().includes(o));
    if (!live.length) return;
    canvas.discardActiveObject(); placeContents(live, pcEdit.frame, mode); select(live);
    canvas.requestRenderAll();
    return;
  }
  const pc = one();
  if (!pc?.powerClip) { toast('Select a PowerClip object'); return; }
  let n;
  batch(() => { const open = openPowerClip(pc); placeContents(open.contents, open.frame, mode); n = buildPowerClip(open.frame, open.contents, open); });
  select([n]);
  toast({ centre: 'Contents centred in the frame', fit: 'Contents fitted inside the frame', fill: 'Contents scaled to fill the frame' }[mode]);
}

// Edit contents (CorelDRAW "Edit PowerClip"): the contents come out, unclipped, to be moved
// and resized while the frame's outline shows; Finish puts them back. One undo step.
let pcEdit = null;
function editPowerClip(pc = one()) {
  if (pcEdit) finishPowerClipEdit();
  if (!pc?.powerClip) { toast('Select a PowerClip object'); return; }
  if (state.tool !== 'select') setTool('select');
  canvas.discardActiveObject();
  muted++;
  const { frame, contents, index, name } = openPowerClip(pc);
  canvas.insertAt(Math.max(1, index), frame, ...contents);
  frame.set({ selectable: false, evented: false });
  const helper = helperPath(worldD(frame), { stroke: '#12E1F0', strokeWidth: 2 / canvas.getZoom(), strokeDashArray: [8 / canvas.getZoom(), 5 / canvas.getZoom()] });
  pcEdit = { frame, contents, helper, name };
  select(contents);
  hint('Editing PowerClip contents: move or resize them · the dashed line is the frame · Finish editing (or Esc) when done');
  syncContext();
}
function finishPowerClipEdit() {
  if (!pcEdit) return;
  const { frame, contents, helper, name } = pcEdit;
  pcEdit = null;
  dropHelper(helper);
  canvas.discardActiveObject();
  const live = contents.filter((o) => canvas.getObjects().includes(o));
  const pc = canvas.getObjects().includes(frame) && live.length ? buildPowerClip(frame, live, { name }) : null;
  if (!pc) frame.set({ selectable: true, evented: true });
  muted = Math.max(0, muted - 1);
  refreshLayers(); record();
  hint(TOOL_HINTS[state.tool] ?? '');
  select([pc ?? frame].filter((o) => canvas.getObjects().includes(o)));
}
/** Undo while editing: put everything back as it was before Edit. */
async function cancelPowerClipEdit() {
  if (!pcEdit) return;
  dropHelper(pcEdit.helper);
  pcEdit = null;
  muted = Math.max(0, muted - 1);
  hint(TOOL_HINTS[state.tool] ?? '');
  await restore(history.at(-1));
}

// Empty PowerClip frame (CorelDRAW): a shape waiting for contents; drop an image on it to fill it.
function togglePowerClipFrame() {
  const o = one();
  if (!o || o.powerClip || !shapeable(o) || o.type === 'group') { toast('Select one shape or text to use as a frame'); return; }
  if (o.pcFrame) { delete o.pcFrame; toast('No longer an empty PowerClip frame'); }
  else { o.pcFrame = true; toast('Empty PowerClip frame: drag an image or logo from Assets (or a file) onto it'); }
  canvas.fire('object:modified', { target: o }); canvas.requestRenderAll();
}
/** Images dropped onto a frame fill it; dropped onto a PowerClip they replace its contents. */
function dropIntoFrame(frame, added) {
  if (!canvas.getObjects().includes(frame)) return;
  let pc;
  batch(() => {
    const open = frame.powerClip ? openPowerClip(frame) : null, base = open?.frame ?? frame;
    placeContents(added, base, 'fill');
    pc = buildPowerClip(base, added, { name: open?.name, index: open?.index });
  });
  setTool('select');
  select([pc]);
  toast(frame.powerClip ? 'Contents replaced (Undo brings the old ones back) · double-click to move them' : 'Placed inside the frame · double-click to move it');
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
  return img;
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
  return g;
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
/** CorelDRAW (.cdr) files can't be read here: show how to export them from CorelDRAW as SVG or PNG, with a button to pick that file. Nothing is uploaded. */
function corelHelp(names) {
  $('corelName').textContent = names.length > 1 ? `${names.length} files` : names[0];
  if (!$('corelDialog').open) $('corelDialog').showModal();
}
$('corelPick').onclick = () => { $('corelDialog').close(); $('fileExported').click(); };
$('fileExported').onchange = async (e) => { await importFiles([...e.target.files]); e.target.value = ''; };
async function importFiles(files, at) {
  const added = [];
  const corel = files.filter((file) => /\.cdr$/i.test(file.name)).map((file) => file.name);
  if (corel.length) corelHelp(corel);
  for (const file of files) {
    if (/\.cdr$/i.test(file.name)) continue;
    if (file.size > 8 * 1024 * 1024) { toast('Use files under 8 MB'); continue; }
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) { added.push(await addSvg(await file.text(), file.name, at)); continue; }
    if (!file.type.startsWith('image/')) continue;
    const src = await readFile(file);
    addAsset(src, file.name);
    added.push(await addImage(src, file.name, at));
  }
  return added.filter(Boolean);
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
  // An image dropped onto an empty PowerClip frame (or a PowerClip) goes inside it.
  const under = objectAt(at), frame = under?.pcFrame || under?.powerClip ? under : null;
  const src = e.dataTransfer.getData('text/x-asset');
  const added = src ? [await addImage(src, 'Asset', at)].filter(Boolean) : await importFiles([...e.dataTransfer.files], at);
  if (frame && added.length) dropIntoFrame(frame, added);
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
  if (o.paintSpec && typeof p.fill === 'string') { repaint(o, { colour: p.fill }); return; }
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
  delete o.paintSpec; // edited pixels: no longer repainted from its stroke
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
  // Leave out the background: background-coloured areas touching the image edge only,
  // so white (or other background-coloured) details inside the logo stay.
  const atEdge = (p) => { const r = p.getBoundingRect(); return r.left <= 2 || r.top <= 2 || r.left + r.width >= w - 2 || r.top + r.height >= h - 2; };
  const parts = objects.filter((p) => p && (p.opacity ?? 1) > 0.05 && p.fill && !(bg && B.nearColour(p.fill, bg) && atEdge(p)));
  if (!parts.length) { toast('Nothing to trace: try more colours or keep the background'); return; }
  const g = new Group(parts);
  // Place the vectors exactly over the image: trace pixels -> image pixels -> page.
  const c = g.getCenterPoint(), at = util.transformPoint(new Point(c.x / pic.kx - o.width / 2, c.y / pic.ky - o.height / 2), o.calcTransformMatrix());
  g.set({ scaleX: o.scaleX / pic.kx, scaleY: o.scaleY / pic.ky, angle: o.angle, flipX: o.flipX, flipY: o.flipY });
  g.setPositionByOrigin(at, 'center', 'center');
  style(g, { toolName: 'Traced bitmap' });
  g.name = `${o.name || 'Image'} traced`;
  // The vectors replace the image (as CorelDRAW's "Delete original image"), or sit next to it to compare.
  const replace = $('trDelete').checked;
  if (!replace) { const b = o.getBoundingRect(); g.set({ left: g.left + b.width + 10 * MM }); g.setCoords(); }
  batch(() => { canvas.insertAt(canvas.getObjects().indexOf(o) + 1, g); if (replace) canvas.remove(o); });
  select([g]);
  toast(replace ? `Traced into ${parts.length} vector shapes, in place of the image · Undo brings the image back` : `Traced into ${parts.length} vector shapes, placed next to the image to compare · Ctrl+U ungroups, F10 edits nodes`);
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
  show('ctx-brush', SCULPT.has(t) || t === 'eraser' || t === 'smudge');
  show('twirlWrap', t === 'twirl'); $('cTwirlDir').value = state.shape.twirl;
  show('ctx-freetx', t === 'freetx');
  show('ctx-smart', t === 'smartdraw'); show('ctx-live', t === 'livesketch');
  if (t === 'smartdraw') { $('sdLevel').value = state.smart.level; $('sdSmooth').value = String(state.smart.smooth); }
  if (t === 'livesketch') { $('lsTimer').value = String(state.live.timer); $('lsNear').value = String(state.live.near); $('lsSmooth').value = String(state.live.smooth); }
  const paintOn = t === 'paint' || (pick && n >= 1 && sel.every((x) => x.paintSpec));
  show('ctx-paint', paintOn);
  if (paintOn) { const ps = sel.find((x) => x.paintSpec)?.paintSpec, m = ps ? { brush: ps.brush, size: ps.size / MM, flow: Math.round(ps.flow * 100) } : state.paint; $('pbBrush').value = m.brush; $('pbSize').value = String(+m.size.toFixed(1)); $('pbFlow').value = String(m.flow); }
  const mediaOn = t === 'media' || (pick && n >= 1 && sel.every((x) => x.mediaSpec));
  show('ctx-media', mediaOn);
  if (mediaOn) syncMediaBar(sel.find((x) => x.mediaSpec)?.mediaSpec);
  document.querySelectorAll('[data-ft]').forEach((b) => b.classList.toggle('on', b.dataset.ft === state.shape.ftMode)); $('ftDup').checked = !!state.shape.ftDup;
  const impactOn = t === 'impact' || (pick && o?.shapeSpec?.tool === 'impact');
  show('ctx-impact', impactOn);
  if (impactOn) {
    const sp = pick && o?.shapeSpec?.tool === 'impact' ? o.shapeSpec : { style: state.shape.impactStyle, lines: state.shape.impactLines, inner: state.shape.impactInner };
    $('cImpactStyle').value = sp.style; $('cImpactLines').value = String(sp.lines); $('cImpactInner').value = String(sp.inner);
    $('cImpactInnerLabel').textContent = sp.style === 'parallel' ? 'Reach in' : 'Empty centre';
  }
  const polyTool = ['polygon', 'star', 'cstar'].includes(t) ? t : pick && o?.shapeSpec && ['polygon', 'star', 'cstar'].includes(o.shapeSpec.tool) ? o.shapeSpec.tool : null;
  show('ctx-poly', !!polyTool);
  show('ctx-spiral', t === 'spiral' || (pick && o?.shapeSpec?.tool === 'spiral'));
  show('ctx-graph', t === 'graph');
  show('ctx-shapes', t.startsWith('shape:') || (pick && o?.shapeSpec?.tool?.startsWith('shape:')));
  show('ctx-rect', t === 'rect' || (pick && o?.type === 'rect'));
  show('ctx-blend', t === 'blend'); show('ctx-contour', t === 'contour'); show('ctx-shadow', t === 'shadow'); show('ctx-transp', t === 'transparency');
  show('ctx-distort', t === 'distort'); show('ctx-envelope', t === 'envelope'); show('ctx-extrude', t === 'extrude'); show('ctx-block', t === 'blockshadow');
  show('ctx-mesh', t === 'meshfill' || (pick && !!o?.fxMesh));
  show('ctx-powerclip', !!pcEdit || (pick && !!o?.powerClip)); show('pcEditBtn', !pcEdit); show('pcFinishBtn', !!pcEdit); show('pcExtractBtn', !pcEdit); show('ctx-table', t === 'table'); show('ctx-eyedrop', t === 'eyedropper');
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
    if (tool === 'impact') state.shape.impactSeed = o.shapeSpec.seed ?? state.shape.impactSeed;
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
$('cTwirlDir').onchange = (e) => { state.shape.twirl = e.target.value; savePrefs(); };
// Artistic Media property bar: the settings for the next stroke; a selected stroke is redrawn with them.
$('mPreset').innerHTML = Object.entries(AM.PRESET_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('mBrush').innerHTML = Object.entries(AM.BRUSH_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('mSpray').innerHTML = Object.entries(AM.SPRAY_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
function syncMediaBar(spec) {
  const m = spec ? { ...state.media, ...spec, width: spec.width / MM, spacing: spec.spacing / MM } : state.media;
  document.querySelectorAll('[data-media]').forEach((b) => b.classList.toggle('on', b.dataset.media === m.mode));
  $('mWidth').value = String(+m.width.toFixed(1)); $('mSmooth').value = String(m.smooth);
  $('mPreset').value = m.preset; $('mBrush').value = m.brush; $('mSpray').value = m.spray;
  $('mSpacing').value = String(+m.spacing.toFixed(1)); $('mSizeVar').value = String(m.sizeVar); $('mRotate').value = m.rotate; $('mAngle').value = String(m.angle);
  $('mWidthLabel').textContent = m.mode === 'spray' ? 'Size' : 'Width';
  show('mPresetWrap', m.mode === 'preset'); show('mBrushWrap', m.mode === 'brush'); show('mSprayWrap', m.mode === 'spray'); show('mAngleWrap', m.mode === 'calli');
}
function setMedia(changes) {
  Object.assign(state.media, changes);
  savePrefs();
  const objs = canvas.getActiveObjects().filter((o) => o.mediaSpec);
  if (objs.length) {
    const out = [];
    batch(() => { for (const o of objs) { const n = mediaObject({ ...o.mediaSpec, ...mediaSettings(changes) }, solid(o), o); replaceObject(o, n); out.push(n); } });
    select(out);
  }
  syncContext();
  if (changes.mode === 'expr') toast('Expression: with a pen, pressing harder makes the stroke wider; with a mouse, drawing faster makes it thinner', 5000);
}
/** Settings in page units, as stored with a stroke. */
const mediaSettings = (m) => { const out = { ...m }; if (m.width !== undefined) out.width = Math.max(0.5, m.width) * MM; if (m.spacing !== undefined) out.spacing = Math.max(1, m.spacing) * MM; return out; };
document.querySelectorAll('[data-media]').forEach((b) => (b.onclick = () => setMedia({ mode: b.dataset.media })));
bindNumber('mWidth', (v) => setMedia({ width: Math.max(0.5, Math.min(200, v)) }));
bindNumber('mSmooth', (v) => setMedia({ smooth: Math.max(0, Math.min(100, v)) }));
bindNumber('mSpacing', (v) => setMedia({ spacing: Math.max(1, Math.min(200, v)) }));
bindNumber('mSizeVar', (v) => setMedia({ sizeVar: Math.max(0, Math.min(90, v)) }));
bindNumber('mAngle', (v) => setMedia({ angle: Math.max(-90, Math.min(90, v)) }));
for (const [id, key] of [['mPreset', 'preset'], ['mBrush', 'brush'], ['mSpray', 'spray'], ['mRotate', 'rotate']]) $(id).onchange = (e) => setMedia({ [key]: e.target.value });
// Smart Drawing, LiveSketch and Painterly Brush bars.
$('sdLevel').onchange = (e) => { state.smart.level = e.target.value; savePrefs(); };
bindNumber('sdSmooth', (v) => { state.smart.smooth = Math.max(0, Math.min(100, v)); });
bindNumber('lsTimer', (v) => { state.live.timer = Math.max(0, Math.min(5, v)); });
bindNumber('lsNear', (v) => { state.live.near = Math.max(4, Math.min(60, v)); });
bindNumber('lsSmooth', (v) => { state.live.smooth = Math.max(0, Math.min(100, v)); });
$('pbBrush').innerHTML = Object.entries(PB.PAINT_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
function setPaint(changes) {
  Object.assign(state.paint, changes); savePrefs();
  const objs = canvas.getActiveObjects().filter((o) => o.paintSpec);
  for (const o of objs) repaint(o, { ...(changes.brush ? { brush: changes.brush } : {}), ...(changes.size !== undefined ? { size: Math.max(0.5, changes.size) * MM } : {}), ...(changes.flow !== undefined ? { flow: changes.flow / 100 } : {}) });
  if (objs.length) canvas.fire('object:modified', { target: objs[0] });
}
$('pbBrush').onchange = (e) => setPaint({ brush: e.target.value });
bindNumber('pbSize', (v) => setPaint({ size: Math.max(0.5, Math.min(200, v)) }));
bindNumber('pbFlow', (v) => setPaint({ flow: Math.max(5, Math.min(100, v)) }));
document.querySelectorAll('[data-ft]').forEach((b) => (b.onclick = () => { state.shape.ftMode = b.dataset.ft; savePrefs(); syncContext(); }));
$('ftDup').onchange = (e) => { state.shape.ftDup = e.target.checked; savePrefs(); };
$('cImpactStyle').onchange = (e) => { state.shape.impactStyle = e.target.value; savePrefs(); regenerateSelected(); syncContext(); };
bindNumber('cImpactLines', (v) => { state.shape.impactLines = Math.max(3, Math.min(200, Math.round(v))); regenerateSelected(); });
bindNumber('cImpactInner', (v) => { state.shape.impactInner = Math.max(0, Math.min(95, v)); regenerateSelected(); });
$('cImpactShuffle').onclick = () => {
  const objs = canvas.getActiveObjects().filter((o) => o.shapeSpec?.tool === 'impact');
  for (const o of objs) o.shapeSpec.seed = state.shape.impactSeed = (state.shape.impactSeed % 99991) + 1;
  if (objs.length) regenerateSelected(); else { state.shape.impactSeed = (state.shape.impactSeed % 99991) + 1; toast('The next Impact gets new line lengths'); }
  savePrefs();
};
bindNumber('cRows', (v) => { state.shape.rows = Math.max(1, Math.min(50, Math.round(v))); });
bindNumber('cRadius', (v) => { state.shape.radius = Math.max(1, Math.min(200, v)); state.shape.eraser = state.tool === 'eraser' ? Math.max(0.5, Math.min(200, v)) : state.shape.eraser; setBrushRing({ radius: (state.tool === 'eraser' ? state.shape.eraser / 2 : state.shape.radius) * MM, at: brushRing?.at }); });
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
$('pcEditBtn').onclick = () => editPowerClip(); $('pcFinishBtn').onclick = () => finishPowerClipEdit(); $('pcExtractBtn').onclick = () => extractPowerClip();
for (const m of ['centre', 'fit', 'fill']) $(`pc-${m}`).onclick = () => arrangePowerClip(m);
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
  finishPowerClipEdit();
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
  finishPowerClipEdit();
  download(`data:image/svg+xml;base64,${b64(await pageSvg())}`, '3deezi-artwork.svg');
  toast('SVG exported: vector curves, editable in CorelDRAW or Illustrator');
}
async function exportPdf() {
  finishPowerClipEdit();
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
  finishPowerClipEdit();
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
  new: async () => { finishPowerClipEdit(); if (userObjects().length && !confirm('Start a new page? Unsaved artwork will be cleared (Undo can restore it).')) return; batch(() => { for (const o of userObjects()) canvas.remove(o); }); canvas.requestRenderAll(); },
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
  powerclip: startPowerClip, extract: () => extractPowerClip(), pcEdit: () => editPowerClip(), pcFinish: () => finishPowerClipEdit(),
  pcCentre: () => arrangePowerClip('centre'), pcFit: () => arrangePowerClip('fit'), pcFill: () => arrangePowerClip('fill'), pcFrame: togglePowerClipFrame,
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
$('save').onclick = () => { finishPowerClipEdit(); try { localStorage.setItem(STORE, snapshot()); } catch { /* storage full */ } post({ type: 'saved', json: snapshot() }); toast('Artboard saved on this device'); };
$('sendBtn').onclick = sendToStudio;
// Right-click menu: order (to front / back), duplicate, curves, lock, delete for the object under the pointer.
const CTX_ITEMS = [
  ['front', 'To front', 'Shift+PgUp'], ['forward', 'Forward one', 'Ctrl+PgUp'], ['backward', 'Back one', 'Ctrl+PgDn'], ['back', 'To back', 'Shift+PgDn'], null,
  ['duplicate', 'Duplicate', 'Ctrl+D'], ['curves', 'Convert to curves', 'Ctrl+Q'], ['lock', 'Lock / unlock', ''], null, ['delete', 'Delete', 'Del'],
];
/** Right-click menu: PowerClip commands for what is selected, then the usual commands. */
function ctxItems() {
  const o = one(), items = [];
  if (pcEdit) items.push(['pcFinish', 'Finish editing PowerClip', 'Esc'], null);
  else if (o?.powerClip) items.push(['pcEdit', 'Edit PowerClip contents', 'double-click'], ['pcFit', 'Fit contents inside', ''], ['pcFill', 'Fill frame with contents', ''], ['pcCentre', 'Centre contents', ''], ['extract', 'Extract contents', ''], null);
  else if (active().length) {
    items.push(['powerclip', 'PowerClip inside frame…', '']);
    if (o && shapeable(o) && o.type !== 'group') items.push(['pcFrame', o.pcFrame ? 'Not an empty PowerClip frame' : 'Make empty PowerClip frame', '']);
    items.push(null);
  }
  return [...items, ...CTX_ITEMS];
}
wrap.addEventListener('contextmenu', (e) => {
  e.preventDefault(); e.stopPropagation();
  const target = objectAt(canvas.getScenePoint(e));
  if (target && !canvas.getActiveObjects().includes(target)) { setTool('select'); canvas.setActiveObject(target); canvas.requestRenderAll(); syncProps(); }
  const menu = $('ctxMenu');
  if (!active().length) { closeMenus(); return; }
  menu.innerHTML = ctxItems().map((it) => (it ? `<button data-ctx="${it[0]}">${it[1]}${it[2] ? `<small>${it[2]}</small>` : ''}</button>` : '<hr>')).join('');
  menu.querySelectorAll('[data-ctx]').forEach((b) => (b.onclick = () => { closeMenus(); ACTIONS[b.dataset.ctx]?.(); }));
  closeMenus();
  Object.assign(menu.style, { left: `${Math.min(e.clientX, innerWidth - 230)}px`, top: `${e.clientY}px`, bottom: 'auto' });
  menu.classList.add('open');
  menu.style.top = `${Math.max(8, Math.min(e.clientY, innerHeight - menu.offsetHeight - 8))}px`;
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
// The website passes the build as ?v=; the app's copy has it built in.
const BUILD = params.get('v') || window.__ABBUILD;
if (BUILD) $('buildInfo').textContent = `Build ${BUILD}`;
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
    if (pcEdit) { finishPowerClipEdit(); return; }
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
// 3DEEZI ASSIST, the website's help chat, can do simple things for the user: view settings, picking
// a tool, selecting objects, arranging the selection (order, align, mirror, group, duplicate), zoom,
// page size, units and the right-panel tabs. Nothing deletes artwork, and Undo reverses the rest.
// Each command returns what it did (also shown as a toast), or throws why it can't.
const onOff = (v) => { if (v !== 'on' && v !== 'off') throw new Error('Say "on" or "off".'); return v === 'on'; };
/** The text an object shows: its own, the text it was made from (effects and Convert to curves
 *  name the result after it: “YOUR TEAM” curves), or the text inside a group (contour, envelope …). */
const textOf = (o) => {
  if (isText(o)) return String(o.text ?? '');
  const quoted = /^“(.+?)”/.exec(String(o.name ?? ''));
  if (quoted) return quoted[1];
  return o.type === 'group' ? o.getObjects().map(textOf).filter(Boolean).join(' ') : '';
};
/** What kind of object it is, in words the visitor might use ("rectangle", "logo", "line" …). */
const KIND_WORDS = {
  rectangle: ['rectangle', 'rect'], square: ['rectangle', 'rect'], circle: ['ellipse'], oval: ['ellipse'], ellipse: ['ellipse'],
  line: ['line', 'curve', 'freehand', 'bézier', 'bezier', 'pen', 'polyline', 'spline'], curve: ['curve', 'freehand', 'bézier', 'bezier', 'spline', 'path'],
  image: ['image', 'svg', 'traced'], picture: ['image'], photo: ['image'], logo: ['image', 'svg', 'traced'],
  star: ['star'], polygon: ['polygon'], triangle: ['polygon', 'triangle'], spiral: ['spiral'], table: ['table'], group: ['group'],
  shadow: ['shadow'], contour: ['contour'], powerclip: ['powerclip'], badge: ['badge', 'shape'],
};
/** Everything an object shows or is called, including the parts inside a group. */
const describe = (o) => [textOf(o), o.name, o.toolName, o.type, ...(o.type === 'group' ? o.getObjects().map(describe) : [])].filter(Boolean).join(' ').toLowerCase();
/** Whether the object is what the visitor named ("rectangle", "logo", "your team" …). */
const matches = (o, words) => {
  const want = words.replace(/s$/, ''), d = describe(o);
  return d.includes(words) || (KIND_WORDS[want] ?? [want]).some((n) => d.includes(n));
};
/** A length such as 20mm, 3cm, 1.5in, 300px or 4grid (grid steps of 5 mm), in canvas units. */
const LENGTH_UNITS = { mm: 1, cm: 10, in: 25.4, px: 25.4 / 300, grid: GRID / MM };
function lengthOf(text) {
  const m = /^(-?\d+(?:\.\d+)?)\s*(mm|cm|in|px|grid)?$/.exec(String(text).trim());
  if (!m) throw new Error('Give a distance like 20mm, 3cm or 4grid (grid steps of 5 mm).');
  return Number(m[1]) * LENGTH_UNITS[m[2] ?? 'mm'] * MM;
}
/** A colour (#hex, rgb(), or a name such as "dark blue" or "navy blue") as #rrggbb. */
const COLOUR_NAMES = { 'navy blue': 'navy', 'sky blue': 'skyblue', 'royal blue': 'royalblue', 'baby blue': 'lightblue', 'neon green': 'lime', 'bottle green': '#006a4e', 'maroon red': 'maroon', 'off white': '#f4f1ea' };
function colourOf(text) {
  const g = document.createElement('canvas').getContext('2d'), name = String(text).trim().toLowerCase();
  for (const tryName of [COLOUR_NAMES[name], name, name.replace(/[\s-]+/g, '')]) {
    if (!tryName) continue;
    g.fillStyle = '#010203'; g.fillStyle = tryName; const a = g.fillStyle;
    g.fillStyle = '#040506'; g.fillStyle = tryName;
    if (a === g.fillStyle) return a;   // both probes replaced: a real colour
  }
  throw new Error(`"${text}" is not a colour I know.`);
}
/** The selected object (or the multi-selection): moved, turned or resized as one. */
const target = () => { needSelection(); return canvas.getActiveObject(); };
const changed = (o) => { o.setCoords(); canvas.requestRenderAll(); canvas.fire('object:modified', { target: o }); syncProps(); };
/** Menu items the assistant can run (File > Import needs the visitor's own click). */
const menuLabel = (id) => {
  // The item's own words, without its shortcut hint (Export PDF, not "Export PDF vector · Ctrl+E").
  const b = document.querySelector(`.menus [data-action="${id}"]`);
  return (b ? [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('') : id).replace(/[\s…]+/g, ' ').trim() || id;
};
const needSelection = () => { if (!active().length) throw new Error('Nothing is selected: select something first (for example "select the text").'); };
/**
 * Effects the assistant can apply: it fills in the effect's settings on the property bar (the same
 * boxes the visitor sees at the top) and presses Apply, or Remove.
 */
const EFFECTS = {
  shadow: { label: 'Drop shadow', tool: 'shadow', apply: 'fxShadow', remove: 'fxShadowOff', inputs: { x: 'fxSX', y: 'fxSY', blur: 'fxSBlur', opacity: 'fxSOpacity', colour: 'fxSColour' } },
  contour: { label: 'Contour', tool: 'contour', apply: 'fxContour', inputs: { dir: 'fxCDir', steps: 'fxCSteps', offset: 'fxCOffset', colour: 'fxCColour' } },
  blockshadow: { label: 'Block shadow', tool: 'blockshadow', apply: 'fxBlock', remove: 'fxBlockOff', inputs: { x: 'fxBX', y: 'fxBY', colour: 'fxBColour' } },
  extrude: { label: 'Extrude', tool: 'extrude', apply: 'fxExtrude', remove: 'fxExtrudeOff', inputs: { x: 'fxXX', y: 'fxXY', colour: 'fxXColour' } },
  envelope: { label: 'Envelope', tool: 'envelope', apply: 'fxEnvelope', inputs: { preset: 'fxEPreset', amount: 'fxEAmount' } },
  distort: { label: 'Distortion', tool: 'distort', apply: 'fxDistort', inputs: { mode: 'fxDMode', tooth: 'fxDZip', teeth: 'fxDTeeth', turn: 'fxDTwist', amount: 'fxDPush' } },
  transparency: { label: 'Transparency', tool: 'transparency', apply: 'fxTransp', inputs: { type: 'fxTType', amount: 'fxTValue', angle: 'fxTAngle' } },
  blend: { label: 'Blend', tool: 'blend', apply: 'fxBlend', inputs: { steps: 'fxSteps' } },
  mesh: { label: 'Mesh fill', tool: 'meshfill', remove: 'fxMeshClear', inputs: {} },
};

/** The effects an object has, in words (for the assistant), e.g. "drop shadow x 5 mm, y 0 mm". */
const mmOf = (n) => Math.round((n / MM) * 10) / 10;
function effectsOf(o) {
  const name = `${o.name ?? ''} ${o.toolName ?? ''}`.toLowerCase(), out = [];
  if (o.shadow) out.push(`drop shadow x ${mmOf(o.shadow.offsetX)} mm, y ${mmOf(o.shadow.offsetY)} mm, blur ${mmOf(o.shadow.blur)} mm`);
  if (o.fxSweep === 'blockshadow') out.push('block shadow');
  if (o.fxSweep === 'extrude') out.push('extrude');
  if (o.fxMesh) out.push('mesh fill');
  if (/contour/.test(name)) out.push('contour');
  if (/blend group/.test(name)) out.push('blend');
  if (/envelope/.test(name)) out.push('envelope');
  if (/distortion/.test(name)) out.push('distortion');
  if (o.opacity < 1 || o.gradSpec?.fade) out.push(o.gradSpec?.fade ? 'transparency (fade)' : `transparency ${Math.round((1 - o.opacity) * 100)}%`);
  return out;
}
/** Whether an object already has the effect the assistant was asked to apply. */
const HAS_EFFECT = {
  shadow: (o) => !!o.shadow, blockshadow: (o) => o.fxSweep === 'blockshadow', extrude: (o) => o.fxSweep === 'extrude',
  contour: (o) => /contour/i.test(`${o.name} ${o.toolName}`), envelope: (o) => /envelope/i.test(o.name ?? ''),
  distort: (o) => /distortion/i.test(o.name ?? ''), transparency: (o) => o.opacity < 1 || !!o.gradSpec?.fade, blend: () => false,
};
const objLabel = (o) => (textOf(o) ? `text “${textOf(o).slice(0, 30)}”` : o.name || o.toolName || o.type);

/** The left toolbox as it is now, numbered from the top (each button shows the last tool used from its flyout). */
function toolboxReport() {
  let n = 0;
  const parts = TOOL_SECTIONS.map(([section, gids]) => `${section}: ${gids.map((g) => {
    const first = TOOLS[TOOL_GROUPS.find(([id]) => id === g)[1][0][0]], t = TOOLS[groupCurrent[g] ?? first.id];
    // A button showing a flyout tool: name the flyout it belongs to (the first tool in it).
    return `${++n} ${SHORT_LABEL[t.id] ?? t.label}${t !== first ? ` (${first.label} flyout)` : ''}`;
  }).join(', ')}`);
  return matchMedia('(max-width: 900px)').matches
    ? `Toolbox buttons along the bottom now (phone layout), left to right: ${parts.join('; ')}.`
    : `Toolbox buttons on the left now, top to bottom: ${parts.join('; ')}.`;
}
const ASSIST = {
  /** What is on the page and selected (sent with each question, so answers fit the page). */
  describe: () => {
    // Size and position in mm (from the page's top left), so answers can use them ("half its width").
    const where = (o) => { const r = o.getBoundingRect(); return ` (${mmOf(r.width)} x ${mmOf(r.height)} mm at X ${mmOf(r.left)}, Y ${mmOf(r.top)})`; };
    const line = (o) => { const fx = effectsOf(o); return `${objLabel(o)}${where(o)}${fx.length ? ` [${fx.join('; ')}]` : ''}${o.locked ? ' (locked)' : ''}${o.visible ? '' : ' (hidden)'}`; };
    const objs = userObjects(), sel = active();
    return `Selected: ${sel.length ? sel.map(line).join(' | ') : 'nothing'}. On the page (${objs.length}, top first): ${objs.slice().reverse().slice(0, 15).map(line).join(' | ')}${objs.length > 15 ? ' | …' : ''}. Tool: ${TOOLS[state.tool]?.label ?? state.tool}. Grid ${state.grid ? 'on' : 'off'}, snap ${state.snap ? 'on' : 'off'}. ${toolboxReport()}`;
  },
  grid: (v) => { state.grid = onOff(v); $('gridToggle').checked = state.grid; savePrefs(); canvas.requestRenderAll(); return `Grid ${v}`; },
  snap: (v) => { state.snap = onOff(v); $('snapToggle').checked = state.snap; savePrefs(); return `Snap ${v}`; },
  rulers: (v) => { document.body.classList.toggle('no-rulers', !onOff(v)); setTimeout(resize); return `Rulers ${v}`; },
  snapTo: (v) => {
    const [k, on] = v.split(':');
    if (!SNAP_LABELS[k]) throw new Error(`Snap to can be: ${Object.keys(SNAP_LABELS).join(', ')}.`);
    if (state.snapTo[k] !== onOff(on)) toggleSnapTo(k);
    return `Snap to ${SNAP_LABELS[k].toLowerCase()} ${on}`;
  },
  tool: (v) => {
    if (!TOOLS[v] || v === 'image') throw new Error(`There is no "${v}" tool here.`);
    setTool(v);
    const b = document.querySelector(`.tool[data-group="${TOOLS[v].group}"]`);
    if (b) { b.scrollIntoView({ block: 'nearest' }); b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 2400); }
    const n = [...document.querySelectorAll('#tools .tool')].indexOf(b) + 1;
    const notice = selectionNotice(v);
    const where = matchMedia('(max-width: 900px)').matches ? 'from the left along the bottom' : 'from the top on the left';
    return `${TOOLS[v].label} tool selected${n ? ` (button ${n} ${where})` : ''}${notice ? `. ${notice}` : ''}`;
  },
  select: (v) => {
    const [kind, ...rest] = v.split(':'), words = rest.join(':').trim().toLowerCase();
    const shown = userObjects().filter((o) => o.visible), all = shown.filter((o) => !o.locked);
    const kinds = { all: () => all, text: () => all.filter((o) => textOf(o)), images: () => all.filter((o) => o.type === 'image'), shapes: () => all.filter((o) => !textOf(o) && o.type !== 'image'), none: () => [], type: () => all };
    if (!kinds[kind]) throw new Error('Select can be: all, text, images, shapes, none, or type:<kind of object>.');
    let objs = kinds[kind]();
    if (kind === 'type') objs = objs.filter((o) => !isText(o) && matches(o, words));
    else if (words) objs = objs.filter((o) => matches(o, words));
    // "The text": editable text (on its own or inside an effect) comes before curves that were made
    // from text earlier (convert to curves, envelope …), which are only picked when there is nothing else.
    if (kind === 'text') {
      const live = (o) => isText(o) || (o.type === 'group' && o.getObjects().some(live));
      if (objs.some(live)) objs = objs.filter(live);
    }
    if (kind !== 'none' && !objs.length) {
      // Say so when the only match is locked (locked objects can't be selected).
      if (shown.some((o) => o.locked && (!words || matches(o, words)))) throw new Error(`The ${words || kind} is locked: unlock it first (Object > Lock / unlock).`);
      throw new Error(words ? `Nothing on the page matches "${words}".` : `There is no ${kind === 'all' ? 'artwork' : kind} on the page.`);
    }
    setTool('select');
    select(objs);
    const what = kind === 'text' ? 'text' : kind === 'all' ? 'object' : kind === 'type' ? words.replace(/s$/, '') : kind.replace(/s$/, '');
    // Name what was selected, so it is clear which objects the next command will change.
    const names = objs.slice(0, 3).map((o) => (textOf(o) ? `“${textOf(o).slice(0, 24)}”` : o.name || o.toolName || o.type)).join(', ');
    return kind === 'none' ? 'Selection cleared' : `Selected ${objs.length} ${what}${objs.length > 1 && kind !== 'text' ? 's' : ''}: ${names}${objs.length > 3 ? ' …' : ''}`;
  },
  arrange: (v) => {
    const labels = { front: 'Moved to the front', back: 'Moved to the back', forward: 'Moved forward one', backward: 'Moved back one' };
    if (!labels[v]) throw new Error('Arrange can be front, back, forward or backward.');
    needSelection(); order(v);
    return labels[v];
  },
  align: (v) => {
    const how = { left: 'L', right: 'R', top: 'T', bottom: 'B', centre: 'C', middle: 'M', page: 'P' }[v];
    if (!how) throw new Error('Align can be left, right, top, bottom, centre, middle or page.');
    needSelection(); align(how);
    const single = active().length === 1 && v !== 'page';
    return v === 'page' ? 'Centred on the page' : `Aligned ${v === 'centre' ? 'centres horizontally' : v === 'middle' ? 'centres vertically' : v}${single ? ' to the page' : ''}`;
  },
  mirror: (v) => {
    if (v !== 'horizontal' && v !== 'vertical') throw new Error('Mirror can be horizontal or vertical.');
    needSelection(); $(v === 'horizontal' ? 'flipH' : 'flipV').click();
    return `Mirrored ${v}ly`;
  },
  group: (v) => {
    const sel = canvas.getActiveObject();
    if (v === 'group') { if (sel?.type !== 'activeselection') throw new Error('Select two or more objects to group them.'); groupToggle('group'); return 'Grouped'; }
    if (v === 'ungroup') { if (sel?.type !== 'group') throw new Error('Select a group to ungroup it.'); groupToggle('ungroup'); return 'Ungrouped'; }
    throw new Error('Group can be group or ungroup.');
  },
  duplicate: () => { needSelection(); const n = active().length; duplicate(); return `Duplicated ${n} object${n > 1 ? 's' : ''}`; },
  move: (v) => {
    const [dir, amount = ''] = v.split(':'), d = lengthOf(amount);
    const step = { left: [-d, 0], right: [d, 0], up: [0, -d], down: [0, d] }[dir];
    if (!step) throw new Error('Move can be up, down, left or right, with a distance (for example up:20mm).');
    const o = target();
    o.set({ left: o.left + step[0], top: o.top + step[1] }); changed(o);
    return `Moved ${dir} ${amount.replace(/grid$/, ' grid steps')}`;
  },
  rotate: (v) => {
    const deg = Number(v); if (!Number.isFinite(deg)) throw new Error('Rotate needs an angle in degrees.');
    const o = target(), c = o.getCenterPoint();
    o.rotate(((o.angle || 0) + deg) % 360); o.setPositionByOrigin(c, 'center', 'center'); changed(o);
    return `Rotated ${deg}°`;
  },
  scale: (v) => {
    const pct = Number(v); if (!(pct > 0 && pct <= 2000)) throw new Error('Scale needs a size in % (for example 150 = 1.5 times bigger).');
    const o = target(), c = o.getCenterPoint();
    o.set({ scaleX: o.scaleX * pct / 100, scaleY: o.scaleY * pct / 100 }); o.setPositionByOrigin(c, 'center', 'center'); changed(o);
    return `Resized to ${pct}%`;
  },
  size: (v) => {
    const [side, amount = ''] = v.split(':'), want = lengthOf(amount);
    if (side !== 'width' && side !== 'height') throw new Error('Size can be width or height, for example width:120mm.');
    const o = target(), c = o.getCenterPoint(), now = side === 'width' ? o.getScaledWidth() : o.getScaledHeight();
    if (!(want > 0) || !now) throw new Error('That size is not possible.');
    const k = want / now;
    o.set({ scaleX: o.scaleX * k, scaleY: o.scaleY * k }); o.setPositionByOrigin(c, 'center', 'center'); changed(o);
    return `${side === 'width' ? 'Width' : 'Height'} ${amount} (in proportion)`;
  },
  fill: (v) => {
    needSelection();
    if (v === 'none') { applyToSelection((o) => { delete o.gradSpec; delete o.patSpec; return { fill: null }; }); return 'Fill removed'; }
    const hex = colourOf(v);
    for (const o of active()) paintObject(o, hex, false);
    changed(canvas.getActiveObject());
    return `Fill ${hex}`;
  },
  /**
   * Adds an object by name: "rectangle", "circle", "star", "heart", "text" … Half the page by default
   * (round shapes: half its shorter side), at its centre; or size=30% / width=120mm / height=…, at=top-left
   * (or x / y = the centre in mm), fill / outline colours, text=…, sides / points. It ends up selected.
   */
  add: (v) => {
    const i = v.indexOf(':'), kind = (i < 0 ? v : v.slice(0, i)).trim().toLowerCase();
    const opts = Object.fromEntries((i < 0 ? '' : v.slice(i + 1)).split(',').map((x) => x.trim()).filter(Boolean)
      .map((p) => { const k = p.indexOf('='); return k < 0 ? [p.toLowerCase(), ''] : [p.slice(0, k).trim().toLowerCase(), p.slice(k + 1).trim()]; }));
    const SIDES = { triangle: 3, pentagon: 5, hexagon: 6, octagon: 8, polygon: Number(opts.sides) || state.shape.sides };
    const shapeItem = Object.entries(V.SHAPE_SETS).flatMap(([set, s]) => s.items.map(([id, name]) => ({ set, id, name: name.toLowerCase() })))
      .find((s) => s.id === kind || s.name === kind);
    const known = ['rectangle', 'rect', 'square', 'ellipse', 'oval', 'circle', 'line', 'text', 'paragraph', 'table', 'graph', 'grid', 'star', 'spiral', 'impact', ...Object.keys(SIDES)];
    if (!known.includes(kind) && !shapeItem) throw new Error(`I can add: rectangle, square, ellipse, circle, triangle, polygon, star, spiral, impact, line, text, paragraph, table, graph paper, or a shape such as heart, shield, crest, ribbon (asked for "${kind}").`);
    // Size: half the page; round and regular shapes square, half the page's shorter side.
    const pw = page.width, ph = page.height, even = ['square', 'circle', 'star', 'spiral', 'impact', ...Object.keys(SIDES)].includes(kind) || !!shapeItem;
    let w = even ? Math.min(pw, ph) / 2 : pw / 2, h = even ? w : ph / 2;
    if (opts.size) {
      if (/%$/.test(opts.size)) { const k = parseFloat(opts.size) / 100; w = (even ? Math.min(pw, ph) : pw) * k; h = even ? w : ph * k; }
      else w = h = lengthOf(opts.size);
    }
    if (opts.width) { w = lengthOf(opts.width); if (even && !opts.height) h = w; }
    if (opts.height) { h = lengthOf(opts.height); if (even && !opts.width) w = h; }
    if (kind === 'line') h = 0;
    if (!(w > 0) || (!(h > 0) && kind !== 'line')) throw new Error('That size is not possible.');
    // Position: the page's centre, or at=top-left …, or x / y (the centre, in mm from the page's top left).
    const AT = { center: [0.5, 0.5], centre: [0.5, 0.5], middle: [0.5, 0.5], top: [0.5, 0], bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5], 'top-left': [0, 0], 'top-right': [1, 0], 'bottom-left': [0, 1], 'bottom-right': [1, 1] };
    const at = AT[(opts.at || 'center').toLowerCase().replace(/[\s_]+/g, '-')];
    if (!at) throw new Error(`at can be: ${Object.keys(AT).join(', ')}.`);
    const margin = Math.min(pw, ph) * 0.05;
    let cx = margin + w / 2 + (pw - 2 * margin - w) * at[0], cy = margin + h / 2 + (ph - 2 * margin - h) * at[1];
    if (opts.x) cx = lengthOf(opts.x);
    if (opts.y) cy = lengthOf(opts.y);
    const box = { x: cx - w / 2, y: cy - h / 2, w, h };
    let o = null, label = kind;
    if (kind === 'table') { addTable(box); o = canvas.getActiveObject(); label = 'table'; }
    else if (kind === 'paragraph') {
      addParagraph(box); o = canvas.getActiveObject(); o.exitEditing?.();
      if (opts.text) { o.set('text', opts.text); o.initDimensions?.(); }
      label = 'paragraph text';
    }
    else if (kind === 'graph' || kind === 'grid') { addGraph(box); o = canvas.getActiveObject(); label = 'graph paper'; }
    else {
      if (['rectangle', 'rect', 'square'].includes(kind)) { o = paint(new Rect({ left: box.x, top: box.y, width: w, height: h, rx: state.shape.radiusRect ?? 0, ry: state.shape.radiusRect ?? 0, toolName: 'Rectangle' })); label = kind === 'square' ? 'square' : 'rectangle'; }
      else if (['ellipse', 'oval', 'circle'].includes(kind)) { o = paint(new Ellipse({ left: box.x, top: box.y, rx: w / 2, ry: h / 2, toolName: 'Ellipse' })); label = kind === 'circle' ? 'circle' : 'ellipse'; }
      else if (kind === 'line') o = paintLine(new Path(`M ${box.x} ${cy} L ${box.x + w} ${cy}`, { toolName: '2-Point Line' }));
      else if (kind === 'text') {
        // Text as wide as asked (half the page by default), but no taller than the box.
        o = style(paint(new IText(opts.text || 'Your text', { left: cx, top: cy, ...state.text, fontSize: 20 * MM, originX: 'center', originY: 'center' })), { toolName: 'Text' });
        o.set({ strokeWidth: 0, stroke: null });
        o.set('fontSize', Math.max(2 * MM, Math.min(o.fontSize * (w / (o.width || 1)), (opts.height || opts.size ? h : ph * 0.3))));
        o.initDimensions?.();
        label = `text “${o.text}”`;
      } else {
        // Polygons, stars, spirals and the built-in shapes: drawn as by their tool, then kept editable.
        const saved = { ...state.shape }, tool = shapeItem ? `shape:${shapeItem.set}` : SIDES[kind] ? 'polygon' : kind;
        if (shapeItem) Object.assign(state.shape, { set: shapeItem.set, item: shapeItem.id });
        if (tool === 'polygon') state.shape.sides = Math.max(3, Math.min(40, SIDES[kind]));
        if (tool === 'star' && Number(opts.points)) state.shape.points = Math.max(3, Math.min(40, Number(opts.points)));
        if (tool === 'impact') {
          if (['radial', 'parallel'].includes(opts.style)) state.shape.impactStyle = opts.style;
          if (Number(opts.lines)) state.shape.impactLines = Math.max(3, Math.min(200, Math.round(Number(opts.lines))));
          state.shape.impactSeed = (state.shape.impactSeed % 99991) + 1; saved.impactSeed = state.shape.impactSeed;
        }
        try {
          o = new Path(V.boxD(unitFor(tool), box), { toolName: TOOLS[tool].label });
          if (tool === 'spiral') paintLine(o); else paint(o);
          o.shapeSpec = specFor(tool);
        } finally { Object.assign(state.shape, saved); }
        label = shapeItem ? shapeItem.name : kind;
      }
      if (kind !== 'text') style(o);
      canvas.add(o);
      setTool('select');
      canvas.setActiveObject(o);
    }
    if (opts.fill) paintObject(o, colourOf(opts.fill), false);
    if (opts.outline) paintObject(o, colourOf(opts.outline), true);
    if (opts.fill || opts.outline) changed(o);
    canvas.requestRenderAll();
    const r = o.getBoundingRect();
    return `Added ${label} (${mmOf(r.width)} x ${mmOf(r.height)} mm at X ${mmOf(r.left)}, Y ${mmOf(r.top)}), selected`;
  },
  outline: (v) => {
    needSelection();
    if (v === 'none') { applyToSelection({ stroke: null, strokeWidth: 0 }); return 'Outline removed'; }
    const hex = colourOf(v);
    for (const o of active()) paintObject(o, hex, true);
    changed(canvas.getActiveObject());
    return `Outline ${hex}`;
  },
  effect: (v) => {
    const [name, args = ''] = v.split(':'), fx = EFFECTS[name];
    if (!fx) throw new Error(`Effects are: ${Object.keys(EFFECTS).join(', ')}.`);
    needSelection();
    const keep = active().slice(), remove = args.trim() === 'remove';
    // Already there: keep it and say so, unless the visitor asked to change it (replace=yes) or gave
    // new values (numbers, such as x=10): then those settings replace the old ones.
    const replace = /(^|,)\s*replace\s*=\s*yes/i.test(args) || /=\s*-?\d/.test(args);
    if (!remove && !replace && keep.every((o) => HAS_EFFECT[name]?.(o))) {
      const details = keep.flatMap(effectsOf).filter((e) => e.startsWith(fx.label.toLowerCase().split(' ')[0])).join('; ');
      throw new Error(`ALREADY: ${keep.map(objLabel).join(', ')} already ${keep.length > 1 ? 'have' : 'has'} ${details || fx.label.toLowerCase()}, so I left it as it is. Ask me to change it to use new settings.`);
    }
    setTool(fx.tool);
    if (!active().length) select(keep);
    // Direction words instead of distances ("a shadow to the right"): a clearly visible 20 mm (never more
    // than the object's own size, so a small object's shadow stays with it); "auto" softness about 5 %.
    const b = canvas.getActiveObject().getBoundingRect(), size = Math.max(b.width, b.height) / MM;
    const step = Math.min(20, Math.max(2, Math.round(size * 2) / 2)), soft = Math.min(15, Math.max(1, Math.round(size * 0.1) / 2));
    const WORDS = { right: step, left: -step, down: step, up: -step, none: 0, auto: soft };
    // Changing a shadow keeps the settings that weren't mentioned (blur, opacity, colour …).
    const old = name === 'shadow' && keep.length === 1 ? keep[0].shadow : null;
    if (!remove && old) {
      const m = /rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)(?:\D+([\d.]+))?/.exec(String(old.color)) ?? [];
      const hex = m[1] ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : null;
      const current = { fxSX: mmOf(old.offsetX), fxSY: mmOf(old.offsetY), fxSBlur: mmOf(old.blur), fxSOpacity: m[4] !== undefined ? Math.round(Number(m[4]) * 100) : null, fxSColour: hex };
      for (const [id, value] of Object.entries(current)) {
        if (value === null || value === undefined) continue;
        $(id).value = String(value);
        $(id).dispatchEvent(new Event('input'));
        $(id).dispatchEvent(new Event('change'));
      }
    }
    if (!remove) {
      for (const pair of args.split(',').map((x) => x.trim()).filter(Boolean)) {
        // "x+=20" / "x-=5": more or less than now (the current settings are on the property bar).
        const [rawKey, raw = ''] = pair.split('=').map((x) => x.trim()), delta = /[+-]$/.exec(rawKey)?.[0];
        const key = delta ? rawKey.slice(0, -1).trim() : rawKey, id = fx.inputs[key];
        if (key === 'replace') continue;
        if (!id) throw new Error(`${fx.label} has no "${key}" setting (it has ${Object.keys(fx.inputs).join(', ') || 'none'}).`);
        const el = $(id);
        if (delta) {
          const now = Number(el.value) || 0, by = Number(raw);
          if (!Number.isFinite(by) || el.type === 'color' || el.tagName === 'SELECT') throw new Error(`${key} can't be increased by "${raw}".`);
          el.value = String(Math.round((delta === '+' ? now + by : now - by) * 10) / 10);
          el.dispatchEvent(new Event('input'));
          el.dispatchEvent(new Event('change'));
          continue;
        }
        let value = raw;
        if (el.type === 'color') value = colourOf(raw);
        else if (el.tagName === 'SELECT') {
          const opt = [...el.options].find((o) => o.value.toLowerCase() === raw.toLowerCase() || o.textContent.toLowerCase().startsWith(raw.toLowerCase()));
          if (!opt) throw new Error(`${key} can be: ${[...el.options].map((o) => o.value).join(', ')}.`);
          value = opt.value;
        } else if (Object.hasOwn(WORDS, raw.toLowerCase())) value = String(WORDS[raw.toLowerCase()]);
        else if (/^-?\d+(\.\d+)?%$/.test(raw) && (key === 'x' || key === 'y')) {
          // A share of the selection: x of its width, y of its height (x=50% is half the width).
          value = String(Math.round((parseFloat(raw) / 100) * (key === 'x' ? b.width : b.height) / MM * 2) / 2);
        }
        else if (!Number.isFinite(Number(raw)) || raw === '') throw new Error(`${key} needs a number.`);
        el.value = value;
        el.dispatchEvent(new Event('input'));
        el.dispatchEvent(new Event('change'));
      }
    }
    const button = remove ? fx.remove : fx.apply;
    if (!button) throw new Error(remove ? `${fx.label} can't be removed this way.` : `${fx.label} is added by clicking on the object with its tool.`);
    // The effect reports problems in its own message (for example "Select two objects to blend").
    const before = snapshot();
    $('toast').textContent = '';
    $(button).click();
    const said = $('toast').textContent;
    if (snapshot() === before) {
      // Nothing changed: a problem ("Select … first"), or it was already exactly like that.
      if (!said || /select|first|can.?t|cannot|could not|not |no /i.test(said)) throw new Error(said || `${fx.label} could not be applied to the selection.`);
      return remove ? `${fx.label}: there was none to remove` : `${fx.label} was already applied with these settings (nothing changed)`;
    }
    const used = Object.entries(fx.inputs).filter(([k]) => new RegExp(`(^|,)\\s*${k}\\s*[+-]?=`).test(args)).map(([k, id]) => `${k} ${$(id).value}`).join(', ');
    return remove ? `${fx.label} removed` : `${fx.label} applied${used ? ` (${used})` : ''}: its settings are on the property bar at the top`;
  },
  menu: (v) => {
    if (v === 'open') throw new Error('File > Import needs your own click: choose File > Import.');
    if (!Object.hasOwn(ACTIONS, v)) throw new Error(`There is no "${v}" menu item.`);
    const label = menuLabel(v);
    ACTIONS[v]();
    return label;
  },
  zoom: (v) => {
    if (v === 'in') ACTIONS.zoomIn(); else if (v === 'out') ACTIONS.zoomOut(); else if (v === 'fit') fit();
    else { const pct = Number(v); if (!(pct >= 10 && pct <= 800)) throw new Error('Zoom can be in, out, fit or 10 to 800 (%).'); zoomAt(baseZoom() * pct / 100); }
    return v === 'fit' ? 'Fit page' : /^\d/.test(v) ? `Zoom ${v}%` : `Zoomed ${v}`;
  },
  pageSize: (v) => {
    const key = Object.keys(PAGES).find((k) => k.toLowerCase() === v.toLowerCase());
    if (!key || !PAGES[key]) throw new Error(`Page size can be: ${Object.keys(PAGES).filter((k) => PAGES[k]).join(', ')}.`);
    setPage(PAGES[key]);
    return `Page size ${key}`;
  },
  units: (v) => {
    if (!UNITS[v]) throw new Error('Units can be mm, cm, in or px.');
    $('units').value = v; $('units').onchange({ target: $('units') });
    return `Units ${UNITS[v].name}`;
  },
  tab: (v) => {
    const names = { colour: 'Colour', props: 'Properties', layers: 'Layers', assets: 'Assets' };
    if (!names[v]) throw new Error('The tabs are colour, props, layers and assets.');
    openTab(v);
    return `${names[v]} tab open`;
  },
  help: () => { ACTIONS.help(); return 'Tools and shortcuts open'; },
};

window.artboard = {
  /** 3DEEZI ASSIST: runs one command (see ASSIST); returns what was done or throws why not. */
  assist: (action, value) => {
    if (!Object.hasOwn(ASSIST, action)) throw new Error(`Unknown command "${action}".`);
    const done = ASSIST[action](String(value ?? '').trim());
    // The page report is for the assistant only; everything else is shown as it happens.
    if (action !== 'describe') toast(done);
    return done;
  },
  /** The same over messages (the phone app): {id, action, value}; replies {type: 'assist', id, ok, text}. */
  assistMsg: ({ id, action, value } = {}) => {
    try { post({ type: 'assist', id, ok: true, text: window.artboard.assist(action, value) }); }
    catch (e) { post({ type: 'assist', id, ok: false, text: e.message }); }
  },
  setAssets: (list) => { for (const a of list ?? []) addAsset(a.src, a.name || 'Asset'); },
  addImage: ({ src, name }) => { addAsset(src, name || 'Image'); return addImage(src, name || 'Image'); },
  load: (json) => { if (pcEdit) { dropHelper(pcEdit.helper); pcEdit = null; muted = Math.max(0, muted - 1); } return restore(typeof json === 'string' ? json : JSON.stringify(json)); },
  clear: () => ACTIONS.new(),
  toast: (text) => toast(String(text ?? '')),
  receive: (msg) => {
    const m = typeof msg === 'string' ? JSON.parse(msg) : msg;
    if (m && m.cmd !== 'receive' && typeof window.artboard[m.cmd] === 'function') window.artboard[m.cmd](m.arg);
  },
};
// Automated tests only (?debug): reach the canvas from the browser.
if (params.has('debug')) window.__ab = { canvas, nodes, state, setTool, V, B, F: { Rect, IText, FabricImage, Group, Path }, geom: { mode: () => (geomWorker ? 'worker' : geomWorker === false ? 'page' : 'not started'), limit: (ms) => { GEOM_LIMIT = ms; }, stop: () => stopGeom(new Error('stopped')) } };
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
  window.artboard.ready = true;
  post({ type: 'ready' });
})();
