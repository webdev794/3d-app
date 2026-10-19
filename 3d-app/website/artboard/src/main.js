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
//   Designs in the account, templates and Send to 3D Studio linked to the design: see projects.js
//     (host {docs, signedIn, …}, docsReply, openDoc; {type:'docs'}, {type:'signin'}, artwork with target).

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
import * as C from './connect.js';
import { autosave, createProjects, loadLocal, saveNow } from './projects.js';

// ===================================================================
// Setup
// ===================================================================
const params = new URLSearchParams(location.search);
const HOST = params.get('host');
// The Flutter web app names each Artboard it opens 3deezi-artboard-0, -1 …: one store for all of them, so the design
// comes back every time (it was kept under the first name before).
const STORE = `3deezi.artboard.${/^3deezi-artboard-\d+$/.test(HOST ?? '') ? 'app' : HOST || 'web'}`;
const OLD_STORE = STORE === '3deezi.artboard.app' ? '3deezi.artboard.3deezi-artboard-0' : null;
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
const LINE_NORMAL = 1.16; // Fabric's normal line height: shown as 100 % line spacing

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
  tool: 'select', fill: '#12E1F0', stroke: '#000000', strokeWidth: 0, dash: 'solid', opacity: 1, target: 'fill', snap: true, grid: false, recent: [], saved: [], palettes: [], palette: '', gradients: [], gradient: null, pattern: null, units: 'mm',
  // What Snap snaps to (the Snap tick-box in the status bar switches snapping on and off).
  snapTo: { grid: true, guides: true, objects: true, nodes: true, page: true },
  // Text settings: used for the next text, and edited from the text bar.
  text: { fontFamily: 'Rajdhani', fontWeight: 700, fontStyle: 'normal', underline: false, textAlign: 'center', fontSize: 40, charSpacing: 0, lineHeight: 1.16 },
  // Tool settings from the context property bars.
  shape: { sides: 6, points: 5, sharp: 53, cpoints: 9, csharp: 2, revs: 4, log: false, expand: 50, cols: 4, rows: 3, set: 'basic', item: 'triangle', radius: 8, eraser: 6, tRows: 4, tCols: 3, twirl: 'cw', impactStyle: 'radial', impactLines: 36, impactInner: 45, impactSeed: 1, ftMode: 'rotate', ftDup: false },
  // Artistic Media: used for the next stroke, and edited from its property bar (a selected stroke is redrawn).
  // Smart Drawing, LiveSketch and Painterly Brush settings (their property bars).
  smart: { level: 'medium', smooth: 50 },
  live: { timer: 1, near: 15, smooth: 50 },
  paint: { brush: 'oil', size: 10, flow: 80 },
  conn: { radius: 5, arrows: 'none' },
  media: { mode: 'preset', width: 6, smooth: 50, preset: 'taper', brush: 'dry', spray: 'stars', spacing: 12, sizeVar: 30, rotate: 'random', angle: 45 },
  fx: {
    blendSteps: 8, contourDir: 'outside', contourSteps: 1, contourOffset: 3, contourColour: '#000000', shadowX: 2, shadowY: 2, shadowBlur: 4, shadowColour: '#000000', shadowOpacity: 50, transp: 'uniform', transpValue: 50, transpAngle: 0, transpMerge: 'normal',
    distort: 'zipper', zipSize: 2, zipTeeth: 30, twist: 90, push: 40, envelope: 'arcUp', envAmount: 20,
    extX: 6, extY: 6, extColour: '#1E7BFF', blockX: 3, blockY: 3, blockColour: '#000000', meshSize: 40, meshStrength: 85,
    innerX: 2, innerY: 2, innerBlur: 3, innerOpacity: 60, innerColour: '#000000', innerMerge: 'multiply',
  },
};
try { const p = JSON.parse(localStorage.getItem(`${STORE}.prefs`) || (OLD_STORE && localStorage.getItem(`${OLD_STORE}.prefs`)) || '{}'); Object.assign(state, { ...p, shape: { ...state.shape, ...p.shape }, fx: { ...state.fx, ...p.fx }, media: { ...state.media, ...p.media }, smart: { ...state.smart, ...p.smart }, live: { ...state.live, ...p.live }, paint: { ...state.paint, ...p.paint }, conn: { ...state.conn, ...p.conn }, snapTo: { ...state.snapTo, ...p.snapTo } }); } catch { /* fresh */ }
const savePrefs = () => { try { localStorage.setItem(`${STORE}.prefs`, JSON.stringify({ recent: state.recent, saved: state.saved, palettes: state.palettes, palette: state.palette, gradients: state.gradients, snap: state.snap, snapTo: state.snapTo, grid: state.grid, units: state.units, shape: state.shape, fx: state.fx, media: state.media, smart: state.smart, live: state.live, paint: state.paint, conn: state.conn, ui: state.ui, quick: state.quick })); } catch { /* private mode */ } };

const toast = (text, ms = 2800) => { const t = $('toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms); };
const hint = (text) => { const h = $('hint'); h.textContent = text || ''; h.classList.toggle('show', !!text); };

// ===================================================================
// Drawing safety: one broken object must never stop the whole page drawing. A failure part-way through an object
// (a gradient or picture with bad numbers) would also leave the drawing transformed, so everything after it looks
// zoomed in and the page stops answering Zoom, Pan and Pick (until the object is fixed: even after a reload, since
// the page is saved). Broken fills draw as their first colour; any other failure skips just that object.
// ===================================================================
let brokenToast = 0;
function reportBroken(o, err) {
  if (o) o.__broken = true;
  console.warn('Artboard: an object could not be drawn', o?.num, o?.name, err);
  if (Date.now() - brokenToast < 8000) return;
  brokenToast = Date.now();
  setTimeout(() => toast(`${o?.num != null ? `#${o.num} ` : ''}${o?.name ?? 'An object'} could not be drawn and was skipped: delete it or press Undo (Help > Save page for support sends it to us)`, 7000));
}
for (const K of [Gradient, Pattern]) {
  const live = K.prototype.toLive;
  K.prototype.toLive = function (ctx) {
    try { return live.call(this, ctx); } catch (err) { console.warn('Artboard: a fill could not be drawn', err); return this.colorStops?.[0]?.color ?? 'rgba(0,0,0,0)'; }
  };
}
{
  const base = Object.getPrototypeOf(Rect.prototype), render = base.render;
  base.render = function (ctx) {
    const m = ctx.getTransform();
    try { render.call(this, ctx); }
    catch (err) {
      // Undo whatever the broken drawing left behind (unmatched saves), then carry on with the next object.
      for (let i = 0; i < 12; i++) { const t = ctx.getTransform(); if (t.a === m.a && t.b === m.b && t.c === m.c && t.d === m.d && t.e === m.e && t.f === m.f) break; ctx.restore(); }
      reportBroken(this, err);
    }
  };
}
/** A page being opened: fills with bad numbers are made again from their settings (or become a plain colour). */
function repairObject(o) {
  let fixed = 0;
  const walk = (x) => {
    if (x.gradSpec && (x.gradSpec instanceof Gradient || ('type' in x.gradSpec && !x.gradSpec.kind)) && x.fill?.colorStops?.length >= 2) x.gradSpec = specFromFill(x.fill, x.width, x.height);
    const g = x.fill;
    if (g && typeof g === 'object' && g.coords && !Object.values(g.coords).every((v) => v == null || Number.isFinite(v))) {
      try { x.set('fill', x.gradSpec ? gradientFor(x) : g.colorStops?.[0]?.color ?? '#999999'); } catch { x.set('fill', g.colorStops?.[0]?.color ?? '#999999'); }
      if (x.fill?.coords && !Object.values(x.fill.coords).every((v) => v == null || Number.isFinite(v))) x.set('fill', x.gradSpec?.from ?? '#999999');
      fixed++;
    }
    for (const k of ['left', 'top', 'scaleX', 'scaleY', 'angle']) if (x[k] != null && !Number.isFinite(x[k])) { x[k] = k.startsWith('scale') ? 1 : 0; fixed++; }
    if (x.type === 'group') x.getObjects().forEach(walk);
  };
  walk(o);
  return fixed;
}

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
  if (w < 20 || h < 20) return; // no room yet (the page area is being laid out)
  const z = Math.min(w / page.width, h / page.height);
  canvas.setViewportTransform([z, 0, 0, z, (wrap.clientWidth - page.width * z) / 2, (wrap.clientHeight - page.height * z) / 2]);
  afterZoom();
}
function zoomAt(z, point) {
  // A view holding a bad number (it would stick for good) shows the whole page again; a bad zoom alone (0 / 0 from
  // a pinch whose fingers start together) is ignored.
  if (!canvas.viewportTransform.every(Number.isFinite) || !(canvas.getZoom() > 0)) { canvas.setViewportTransform([1, 0, 0, 1, 0, 0]); fit(); return; }
  if (!Number.isFinite(z) || z <= 0) return;
  z = Math.min(40, Math.max(0.05, z));
  canvas.zoomToPoint(point ?? new Point(wrap.clientWidth / 2, wrap.clientHeight / 2), z);
  afterZoom();
}
function afterZoom() {
  // Should the view ever hold a bad number, show the whole page again instead of a broken view.
  if (!canvas.viewportTransform.every(Number.isFinite) || !(canvas.getZoom() > 0)) { canvas.setViewportTransform([1, 0, 0, 1, 0, 0]); fit(); return; }
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
  // The mouse button was let go where the page didn't hear it (outside the window): stop panning.
  if (e.pointerType === 'mouse' && e.buttons === 0 && !spaceDown && state.tool !== 'pan') { panning = null; canvas.selection = PICK_LIKE.has(state.tool); return; }
  const vpt = canvas.viewportTransform;
  if (touches.size === 2) {
    const [a, b] = [...touches.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const r = wrap.getBoundingClientRect();
    if (panning.dist > 0) zoomAt(panning.zoom * pinchDist() / panning.dist, new Point(mid.x - r.left, mid.y - r.top));
    else panning.dist = pinchDist(); // a second finger joined a pan: pinch from here
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
    if (!(pxPerUnit > 0) || !Number.isFinite(off)) continue;
    const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000].find((s) => s * pxPerUnit >= 40) ?? 25000;
    const len = horizontal ? r.width : r.height;
    const first = Math.floor(-off / pxPerUnit / step) * step * 5;
    for (let i = first / step, n = 0; i * (step / 5) * pxPerUnit + off < len && n < 5000; i++, n++) {
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
let previewState = null; // Full-page preview (F9): set while only the page is shown
// Optional grid: drawn as part of the white page, so it sits on the page and under the
// artwork, and can't be clicked. 5 mm steps (what Snap to grid uses), stronger every 10 mm.
page.objectCaching = false;
const renderPage = page._render.bind(page);
page._render = (ctx) => {
  renderPage(ctx);
  if (!state.grid || exporting || previewState) return;
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
  if (state.gradient) { o.gradSpec = cloneGrad(state.gradient); o.set('fill', gradientFor(o)); }
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
// Gradient settings (gradSpec) say linear or radial as "kind": saved as "type", Fabric would take them for one of its
// own gradients when a page opens (or on Undo) and make them empty. Pages saved before are put right as they open.
const gradKind = (spec) => ((spec?.kind ?? spec?.type) === 'radial' ? 'radial' : 'linear');
/** Gradient settings worked out from the fill itself (settings saved before, made empty when the page opened). */
function specFromFill(fill, w = 100, h = 100) {
  const stops = fill.colorStops.map((s) => ({ offset: Number(s.offset) || 0, color: s.color })).sort((a, b) => a.offset - b.offset), c = fill.coords ?? {};
  const kind = fill.type === 'radial' ? 'radial' : 'linear', fade = stops.length === 2 && /^rgba\(/i.test(stops[1].color) && !/^rgba\(/i.test(stops[0].color);
  const angle = kind === 'linear' && w && h ? Math.round((Math.atan2((c.x2 - c.x1) / w, (c.y2 - c.y1) / h) * 180) / Math.PI) || 0 : 0;
  return { from: stops[0].color, to: stops.at(-1).color, ...(fade ? {} : { stops }), angle, kind, ...(fade ? { fade: true } : {}) };
}
/** Saved objects (a page opening, Undo, another page): gradient settings saved with "type" get "kind" before the objects are made. */
function fixGradJSON(list) {
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    const g = o.gradSpec;
    if (g && typeof g === 'object') {
      const f = o.fill;
      if (Array.isArray(g.colorStops) && f && typeof f === 'object' && Array.isArray(f.colorStops) && f.colorStops.length >= 2) o.gradSpec = specFromFill(f, o.width, o.height);
      else if ('type' in g) { g.kind ??= g.type === 'radial' ? 'radial' : 'linear'; delete g.type; }
    }
    if (Array.isArray(o.objects)) o.objects.forEach(walk);
    if (o.clipPath) walk(o.clipPath);
  };
  (list ?? []).forEach(walk);
  return list ?? [];
}
/** A gradient's colours as stops in order (offset 0 = start, 1 = end); gradients from before have just from and to. */
function gradStops(spec) {
  const s = Array.isArray(spec?.stops) && spec.stops.length >= 2 ? spec.stops : [{ offset: 0, color: spec?.from ?? '#000000' }, { offset: 1, color: spec?.to ?? '#FFFFFF' }];
  return s.map((x) => ({ offset: Math.min(1, Math.max(0, Number(x.offset) || 0)), color: x.color })).sort((a, b) => a.offset - b.offset);
}
/** A copy of a gradient's settings with its own stops, so changing one object's gradient never changes another's. */
function cloneGrad(spec) { return spec ? { ...spec, ...(Array.isArray(spec.stops) ? { stops: spec.stops.map((x) => ({ ...x })) } : {}) } : spec; }
/** The stops as CSS ("#E10600 0%, #000000 100%"), for the gradient bar and chips. */
const cssStops = (spec) => gradStops(spec).map((s) => `${s.color} ${+(s.offset * 100).toFixed(1)}%`).join(', ');
/** A gradient in words for the assistant: "#E10600 0% → #FFB81C 40% → #000000 100%, 90°". */
const gradText = (spec) => `${gradStops(spec).map((s) => `${hexOf(s.color) ?? s.color} ${Math.round(s.offset * 100)}%`).join(' → ')}${gradKind(spec) === 'radial' ? '' : `, ${spec.angle ?? 0}°`}`;
function gradientFor(o, spec = o.gradSpec ?? state.gradient) {
  const angle = spec.angle ?? 0, type = gradKind(spec), colorStops = gradStops(spec);
  const w = o.width || 100, h = o.height || 100;
  if (type === 'radial') return new Gradient({ type: 'radial', gradientUnits: 'pixels', coords: { x1: w / 2, y1: h / 2, r1: 0, x2: w / 2, y2: h / 2, r2: Math.max(w, h) / 2 }, colorStops });
  const a = (angle * Math.PI) / 180;
  return new Gradient({ type: 'linear', gradientUnits: 'pixels', coords: { x1: w / 2 - (Math.sin(a) * w) / 2, y1: h / 2 - (Math.cos(a) * h) / 2, x2: w / 2 + (Math.sin(a) * w) / 2, y2: h / 2 + (Math.cos(a) * h) / 2 }, colorStops });
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
const EXTRA = ['textOutlines', 'pathGuide', 'pathDist', 'name', 'toolName', 'lockMovementX', 'lockMovementY', 'lockScalingX', 'lockScalingY', 'lockRotation', 'hasControls', 'selectable', 'gradSpec', 'patSpec', 'shapeSpec', 'powerClip', 'locked', 'fxSweep', 'fxPart', 'fxMesh', 'tableSpec', 'cell', 'pcFrame', 'mediaSpec', 'liveSpec', 'paintSpec', 'uid', 'connSpec', 'anchors', 'varSpec', 'num', 'fxInner', 'fxContour', 'fxStep', 'nodeTypes'];
let history = [], future = [], restoring = false, muted = 0;
let pages = [{ name: 'Page 1', objects: null }], pageIndex = 0, otherNums = new Set(); // see Pages below
// objects: the page on screen; with more pages, pages holds every page's name and the others' objects.
const snapshot = () => JSON.stringify({ page: pageSize, guides: guides.get(), objects: userObjects().map((o) => o.toObject(EXTRA)), ...(pages.length > 1 ? { pages: pages.map((p, i) => ({ name: p.name, objects: i === pageIndex ? null : p.objects })), current: pageIndex } : pages[0].name !== 'Page 1' ? { pageName: pages[0].name } : {}) });
function record() {
  if (restoring || muted) return;
  syncConnectors(); // connectors follow objects moved by any command
  const snap = snapshot();
  if (history.at(-1) === snap) return;
  history.push(snap);
  if (history.length > 80) history.shift();
  future = [];
  syncHistory();
  autosave(STORE, snap); // kept on this device a moment later (projects.js)
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
  // The selected objects stay selected (as in CorelDRAW), so the Colour and Properties tabs show them as they are now.
  const keep = state.tool === 'select' ? canvas.getActiveObjects().map((o) => o.num).filter((n) => n != null) : [];
  for (const o of userObjects()) canvas.remove(o);
  pages = Array.isArray(data.pages) && data.pages.length ? data.pages.map((p, i) => ({ name: String(p?.name || `Page ${i + 1}`), objects: p?.objects ?? [] })) : [{ name: data.pageName || 'Page 1', objects: null }];
  pageIndex = Math.max(0, Math.min(pages.length - 1, Number(data.current) || 0));
  pages[pageIndex].objects = null; // it is the page on screen
  updateOtherNums(); renderPageTabs();
  setPage(data.page ?? pageSize, false);
  guides.set(data.guides);
  const objects = await util.enlivenObjects(fixGradJSON(data.objects));
  let repaired = 0;
  for (const o of objects) { pruneEmptyParts(o); fitPowerClips(o); repaired += repairObject(o); style(o); canvas.add(o); }
  if (repaired) setTimeout(() => toast(`${repaired} broken setting${repaired > 1 ? 's were' : ' was'} repaired on this page (a fill or position with bad numbers)`, 6000));
  canvas.discardActiveObject();
  checkFonts();
  const again = keep.length ? userObjects().filter((o) => keep.includes(o.num) && o.selectable !== false && o.visible) : [];
  if (again.length) canvas.setActiveObject(again.length > 1 ? new ActiveSelection(again, { canvas }) : again[0]);
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
async function undo() { if (pcEdit) { await cancelPowerClipEdit(); return; } if (history.length < 2) return; future.push(history.pop()); await restore(history.at(-1)); syncHistory(); autosave(STORE, history.at(-1)); }
async function redo() { if (pcEdit) { finishPowerClipEdit(); return; } if (!future.length) return; const s = future.pop(); history.push(s); await restore(s); syncHistory(); autosave(STORE, s); }
for (const ev of ['object:added', 'object:removed', 'object:modified']) canvas.on(ev, (e) => { if (ev === 'object:added' && e?.target) ownCopies(e.target); if (muted) return; refreshLayers(); record(); });

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
  // The object that takes its place keeps its ID (#12) and stays attached to its connectors.
  if (neu[0] && neu[0] !== old) { if (old.num != null && neu[0].num == null) neu[0].num = old.num; if (old.uid && !neu[0].uid) neu[0].uid = old.uid; }
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
  if (isText(o) && o.textOutlines?.length) { const g = outlinedTextCurves(o, d); batch(() => replaceObject(o, g)); return g; }
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
  // Edited nodes make a shape a plain curve (a connector too: it no longer follows its objects).
  commit: (o) => { delete o.shapeSpec; delete o.connSpec; canvas.fire('object:modified', { target: o }); },
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
  ['art', [['media', 'Artistic Media', 'media'], ['paint', 'Painterly Brush', 'paintbrush'], ['varline', 'Variable Outline', 'varline']]],
  ['smart', [['smartfill', 'Smart Fill', 'smartfill']]],
  ['rect', [['rect', 'Rectangle', 'rect', 'F6'], ['rect3', '3-Point Rectangle', 'rect3']]],
  ['ellipse', [['ellipse', 'Ellipse', 'ellipse', 'F7'], ['ellipse3', '3-Point Ellipse', 'ellipse3']]],
  ['object', [['polygon', 'Polygon', 'polygon', 'Y'], ['star', 'Star', 'star', 'S'], ['cstar', 'Complex Star', 'cstar'], ['graph', 'Graph Paper', 'graph', 'D'], ['spiral', 'Spiral', 'spiral', 'A'], ['impact', 'Impact', 'impact']]],
  ['shapes', [['shape:basic', 'Basic Shapes', 'shapes'], ['shape:arrow', 'Arrow Shapes', 'arrowshape'], ['shape:banner', 'Banner Shapes', 'banner'], ['shape:callout', 'Callout Shapes', 'callout'], ['shape:badge', 'Sport Badges', 'badge']]],
  ['text', [['text', 'Text', 'text', 'F8'], ['ptext', 'Paragraph Text', 'ptext']]],
  ['dim', [['dimP', 'Parallel Dimension', 'dimension'], ['dimHV', 'Horizontal or Vertical Dimension', 'dimhv'], ['dimA', 'Angular Dimension', 'dimangle'], ['dimS', 'Segment Dimension', 'dimseg'], ['callout2', '2-Leg Callout', 'callout2']]],
  ['conn', [['connS', 'Straight Line Connector', 'connstraight'], ['connR', 'Right-Angle Connector', 'connright'], ['connRR', 'Rounded Right-Angle Connector', 'connround'], ['anchor', 'Anchor Editing', 'anchoredit']]],
  ['table', [['table', 'Table', 'table']]],
  // Each effect has its own always-visible button (client spec: Transparency and Contour must be visible).
  ['transparency', [['transparency', 'Transparency', 'transparency']]],
  ['contour', [['contour', 'Contour', 'contour']]],
  ['blend', [['blend', 'Blend', 'blend']]],
  ['shadow', [['shadow', 'Drop Shadow', 'shadow'], ['inner', 'Inner Shadow', 'innershadow']]],
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
const SHORT_LABEL = { dimP: 'Dimension', dimHV: 'H / V Dimension', eyedropper: 'Eyedropper', attrdrop: 'Attr. Eyedropper', lasso: 'Freehand Pick', rect3: '3-Point Rect.', ellipse3: '3-Point Ellipse', ptext: 'Paragraph Text', freetx: 'Free Transform', vsd: 'Segment Delete', dimA: 'Angular Dim.', dimS: 'Segment Dim.', callout2: '2-Leg Callout', connS: 'Connector', connR: 'Right-Angle', connRR: 'Rounded Conn.', anchor: 'Anchor Editing', varline: 'Var. Outline' };
/** Toolbox sections, top to bottom (groups with several tools open a flyout). */
const TOOL_SECTIONS = [
  // Artistic Media right below Pan (user 2026-10-15).
  ['Select', ['pick', 'pan', 'art', 'shape', 'crop', 'zoom']],
  ['Draw', ['curve', 'smart']],
  ['Shapes & text', ['rect', 'ellipse', 'object', 'shapes', 'text', 'table', 'dim', 'conn', 'import']],
  ['Effects', ['fill', 'meshfill', 'transparency', 'contour', 'blend', 'shadow', 'blockshadow', 'extrude', 'distort', 'envelope', 'eyedrop']],
];
const TOOLS = {};
for (const [group, tools] of TOOL_GROUPS) for (const [id, label, ic, key] of tools) TOOLS[id] = { id, label, icon: ic, key, group };
const groupCurrent = {};
const PICK_LIKE = new Set(['select', 'blend', 'contour', 'shadow', 'inner', 'transparency', 'distort', 'envelope', 'extrude', 'blockshadow']);
const SCULPT = new Set(['smoothb', 'smear', 'twirl', 'roughen', 'attract', 'repel']);
const CONN_TOOLS = { connS: 'straight', connR: 'right', connRR: 'rounded' };
const CONN_ALL = new Set([...Object.keys(CONN_TOOLS), 'anchor']);
const OWN_MOUSE = new Set(['node', 'pan', 'knife', 'eraser', 'smudge', 'lasso', 'freetx', 'vsd', 'media', 'smartdraw', 'livesketch', 'paint', 'varline', ...SCULPT, ...CONN_ALL]);
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
  shadow: 'Select objects, set the shadow, then Apply', inner: 'Select objects, set the inner shadow (X, Y = which way it falls, Feather, Opacity, Colour), then Apply', transparency: 'Select objects, choose the transparency type and amount',
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
  varline: 'Press on the outline of a shape or line and drag away from it to widen it there, towards it to narrow it · each press adds a width point · double-click a point to delete it · profiles on the property bar',
  connS: 'Drag from an anchor of one object (the small diamonds) to another: the line stays attached when they move · ends off an anchor stay where you drop them',
  connR: 'Drag from an anchor of one object to another: a line with right-angle bends that stays attached when they move',
  connRR: 'Drag from an anchor of one object to another: right-angle bends with rounded corners (Corner radius on the property bar)',
  anchor: 'Drag an anchor (diamond) to move it · double-click an object to add an anchor, an anchor to delete it · click a connector, then drag its purple end onto another anchor to re-attach it',
};
for (const k of ['shape:arrow', 'shape:banner', 'shape:callout', 'shape:badge']) TOOL_HINTS[k] = TOOL_HINTS['shape:basic'];

function renderToolbox() {
  // Pick and Pan are also on the property bar (after Keep proportions), always in reach.
  $('quickPick').classList.toggle('on', state.tool === 'select'); $('quickPan').classList.toggle('on', state.tool === 'pan');
  renderQuick();
  const nav = $('tools'), groups = new Map(TOOL_GROUPS);
  nav.innerHTML = '';
  for (const [section, gids] of TOOL_SECTIONS) {
    const h = document.createElement('div');
    h.className = 'tsec'; h.textContent = section;
    nav.append(h);
    for (const gid of gids) nav.append(toolButton(gid, groups.get(gid)));
  }
}
// Full-page preview (CorelDRAW's Full-Screen Preview, F9): everything else hidden, the page fitted to the whole
// screen; a click or any key brings the menus and settings back as they were.
let previewEnding = 0;
function startPreview() {
  if (previewState) return;
  closeMenus(); $('quickPop').hidden = true;
  canvas.discardActiveObject();
  previewState = { vpt: canvas.viewportTransform.slice() };
  document.body.classList.add('previewing');
  canvas.selection = false; canvas.skipTargetFind = true;
  drawTop();
  setTimeout(() => { resize(); fit(); }, 30);
  // The whole screen where the browser allows it (the website's frame does; elsewhere the window is used).
  document.documentElement.requestFullscreen?.().catch(() => {});
  toast('Full-page preview · click anywhere or press any key to come back', 2600);
}
function endPreview() {
  if (!previewState) return;
  const s = previewState;
  previewState = null;
  previewEnding = Date.now();
  document.body.classList.remove('previewing');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  applyToolFlags();
  setTimeout(() => { resize(); canvas.setViewportTransform(s.vpt); afterZoom(); canvas.requestRenderAll(); }, 30);
}
// A click while previewing only ends the preview (it doesn't reach the tools); so does the rest of that click.
for (const ev of ['pointerdown', 'mousedown', 'click', 'touchstart']) document.addEventListener(ev, (e) => {
  if (previewState) { e.preventDefault(); e.stopPropagation(); if (ev !== 'click') endPreview(); return; }
  if (Date.now() - previewEnding < 500 && ev === 'click' && !e.target.closest?.('.top, .props, .tools, .side, .foot')) { e.preventDefault(); e.stopPropagation(); }
}, true);
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && previewState) endPreview(); });

// Your buttons: tools and commands added to the property bar next to Pick and Pan (remembered).
const QUICK_CMDS = [
  ['undo', 'Undo', 'undo'], ['redo', 'Redo', 'redo'], ['save', 'Save', 'save'], ['duplicate', 'Duplicate', 'dup'], ['delete', 'Delete', 'trash'],
  ['group', 'Group', 'group'], ['ungroup', 'Ungroup', 'breakapart'], ['combine', 'Combine', 'combine'], ['breakApart', 'Break apart', 'breakapart'], ['curves', 'Convert to curves', 'tocurves'],
  ['weld', 'Weld', 'weld'], ['trim', 'Trim', 'trim'], ['intersect', 'Intersect', 'intersect'], ['alignC', 'Align centres horizontally', 'alC'], ['alignM', 'Align centres vertically', 'alM'],
  ['layout', 'Centre to page', 'fit'], ['front', 'To front', 'front'], ['back', 'To back', 'back'], ['flipH', 'Mirror horizontally', 'flipH'], ['flipV', 'Mirror vertically', 'flipV'],
  ['lock', 'Lock / unlock', 'lock'], ['fit', 'Fit page', 'fit'], ['zoomIn', 'Zoom in', 'plus'], ['zoomOut', 'Zoom out', 'minus'], ['grid', 'Grid on / off', 'grid'],
  ['bitmap', 'Convert to bitmap', 'image'], ['exportPdf', 'Export PDF', 'export'], ['send', 'Send to 3D Studio', 'shirt'],
];
const QUICK_CMD = Object.fromEntries(QUICK_CMDS.map(([id, label, ic]) => [id, { label, icon: ic }]));
function quickDef(key) {
  const [kind, id] = key.split(':');
  if (kind === 'tool') return TOOLS[id] && id !== 'image' ? { label: TOOLS[id].label, icon: TOOLS[id].icon, run: () => setTool(id), tool: id } : null;
  return QUICK_CMD[id] ? { ...QUICK_CMD[id], run: () => ACTIONS[id]?.() } : null;
}
function renderQuick() {
  const box = $('quickPins');
  box.innerHTML = '';
  for (const key of state.quick ?? []) {
    const d = quickDef(key);
    if (!d) continue;
    const b = document.createElement('button');
    b.className = `ibtn${d.tool && state.tool === d.tool ? ' on' : ''}`;
    b.title = `${d.label} (your button: remove it with +)`;
    b.innerHTML = icon(d.icon);
    b.onclick = () => { closeMenus(); d.run(); };
    box.append(b);
  }
}
function openQuickPop() {
  const pop = $('quickPop');
  if (!pop.hidden) { pop.hidden = true; return; }
  closeMenus();
  const pinned = new Set(state.quick ?? []);
  const row = (key, label, ic) => `<label class="qp-row"><input type="checkbox" data-key="${key}"${pinned.has(key) ? ' checked' : ''}>${icon(ic)}<span>${label}</span></label>`;
  const tools = [];
  for (const [, gids] of TOOL_SECTIONS) for (const gid of gids) for (const [id, label, ic] of TOOL_GROUPS.find(([g]) => g === gid)[1]) if (id !== 'image' && id !== 'select' && id !== 'pan') tools.push(row(`tool:${id}`, label, ic));
  $('qpTools').innerHTML = tools.join('');
  $('qpCmds').innerHTML = QUICK_CMDS.map(([id, label, ic]) => row(`cmd:${id}`, label, ic)).join('');
  pop.querySelectorAll('input[data-key]').forEach((cb) => (cb.onchange = () => {
    const list = (state.quick ?? []).filter((k) => k !== cb.dataset.key);
    if (cb.checked) list.push(cb.dataset.key);
    state.quick = list; savePrefs(); renderQuick();
  }));
  const r = $('quickAdd').getBoundingClientRect();
  pop.hidden = false;
  pop.style.left = `${Math.max(12, Math.min(r.left, innerWidth - pop.offsetWidth - 12))}px`;
  pop.style.top = `${r.bottom + 6}px`;
}
$('quickAdd').onclick = (e) => { e.stopPropagation(); openQuickPop(); };
$('quickPreview').onclick = () => startPreview();
document.addEventListener('pointerdown', (e) => { if (!$('quickPop').hidden && !e.target.closest('#quickPop, #quickAdd')) $('quickPop').hidden = true; });
$('propsHide').onclick = () => toggleUi('props', false);
$('propsShow').onclick = () => toggleUi('props', true);
$('quickPick').onclick = () => { closeMenus(); setTool('select'); };
$('quickPan').onclick = () => { closeMenus(); setTool('pan'); };
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
  finishPath(); cancelCurve3(); cancelTp(); cancelMulti(); cancelConn(); cancelVar(); dropVsdHover(); topSegment = null; if (tool !== 'livesketch') finishLive(); attrSample = null; pickFrame = null;
  if (tool === 'image') { $('fileImage').click(); return; }
  const prev = state.tool;
  // Brushes, knife and eraser work on the objects selected when the tool is picked.
  if (OWN_MOUSE.has(tool) && !OWN_MOUSE.has(prev)) toolTargets = canvas.getActiveObjects().slice();
  if (!OWN_MOUSE.has(tool)) toolTargets = [];
  const editFirst = tool === 'node' ? one() : null;
  if (prev === 'node' && tool !== 'node') nodes.end();
  state.tool = tool;
  connView = CONN_ALL.has(tool) ? { hover: null, sel: null } : null;
  groupCurrent[TOOLS[tool].group] = tool;
  canvas.isDrawingMode = tool === 'draw';
  if (canvas.isDrawingMode) {
    canvas.freeDrawingBrush = new PencilBrush(canvas);
    canvas.freeDrawingBrush.color = state.strokeWidth ? state.stroke : state.fill;
    canvas.freeDrawingBrush.width = Math.max(0.5, state.strokeWidth || 1.5) * MM;
  }
  if (!PICK_LIKE.has(tool)) canvas.discardActiveObject();
  applyToolFlags();
  syncProps(); // what counts as selected depends on the tool (Shape, Variable Outline)
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
  inner: 'Select an item on the Artboard first, then set the inner shadow and click Apply',
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
  if (CONN_ALL.has(tool)) { connDown(tool, p); return; }
  if (tool === 'varline') { varDown(p); return; }
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
  if (CONN_ALL.has(tool)) { connMove(p); return; }
  if (tool === 'varline') { varMove(p); return; }
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
  if (connDrag) { connUp(p); return; }
  if (varDrag) { varUp(); return; }
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
  if (state.tool === 'anchor') { anchorDblclick(canvas.getScenePoint(opt.e)); return; }
  if (state.tool === 'varline') { varDblclick(canvas.getScenePoint(opt.e)); return; }
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
  if (exporting || previewState) return;
  if (ctx === canvas.contextTop) { if (topDrawn) drawTop(); return; }
  guides.draw(ctx); nodes.draw(ctx); drawToolOverlay(ctx);
  if (topDrawn) drawTop();
});

// The brush ring and the stroke being drawn (Smudge, Eraser, Freehand Pick) are drawn on Fabric's top canvas:
// moving them doesn't redraw the page, so brushes stay smooth on pages with heavy artwork.
let topStroke = null, brushRing = null, topSegment = null, topDrawn = false, livePending = [], liveTimer = 0, connDrag = null, connView = null, varEdit = null, varDrag = null, varView = null;
function setBrushRing(ring) { brushRing = ring; drawTop(); }
/** Adds a point to a stroke being drawn (closer than a screen pixel to the last one: skipped) and redraws it. */
function addStrokePoint(points, p) {
  if (screenDist(p, points.at(-1)) >= 1) points.push(p);
  drawTop();
}
function drawTop() {
  const ctx = canvas.contextTop;
  if (!ctx) return;
  if (previewState) { if (topDrawn) { canvas.clearContext(ctx); topDrawn = false; } return; }
  const ring = brushRing?.at ? brushRing : null;
  if (!topStroke && !ring && !topSegment && !livePending.length && !connView && !varView && !varEdit) { if (topDrawn) { canvas.clearContext(ctx); topDrawn = false; } return; }
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
  if (connView) drawAnchors(ctx, r, v);
  if (varView || varEdit) drawVar(ctx, r, v);
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
  if (toolTargets.length && OWN_MOUSE.has(state.tool) && state.tool !== 'node' && !CONN_ALL.has(state.tool)) {
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

// ===================================================================
// Connectors (CorelDRAW): Straight Line, Right-Angle and Rounded Right-Angle connectors join anchor points of
// objects and stay attached when the objects move, turn or change size. Anchor Editing moves, adds and deletes
// anchors and re-attaches connector ends. An end dropped away from an anchor stays where it is.
// ===================================================================
const CONN_LABEL = { straight: 'straight connector', right: 'right-angle connector', rounded: 'rounded right-angle connector' };
const STUB = 5; // mm an attached right-angle connector runs straight out of its anchor
const newUid = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const uidOf = (o) => (o.uid ??= newUid());
const connectable = (o) => o.visible && !o.connSpec && !o.isPage && !o.isHelper;
const eachPart = (o, fn) => { fn(o); if (o.type === 'group') o.getObjects().forEach((k) => eachPart(k, fn)); };
/** An object by its id, also inside groups (connectors stay attached to grouped objects). */
function findUid(uid) {
  let hit = null;
  if (uid) for (const o of userObjects()) { eachPart(o, (x) => { if (!hit && x.uid === uid) hit = x; }); if (hit) break; }
  return hit;
}
/**
 * Each item on the page has a short ID in the order items were made (#1, #2 …: the status bar shows it, the chat can
 * use it). An item keeps its ID when an effect is added to it or it is grouped (the group takes the ID of what it was
 * made from); a copy (duplicate, paste) gets the next ID, its own connector id while the original is on the page,
 * and its own connector and anchor settings.
 */
function ownCopies(target) {
  if (target.isHelper || target.isPage) return;
  const inside = new Set(), nums = new Set();
  let taken = null;
  eachPart(target, (x) => inside.add(x));
  for (const o of userObjects()) eachPart(o, (y) => { if (!inside.has(y) && y.num != null) nums.add(y.num); });
  for (const n of otherNums) nums.add(n); // IDs on the other pages
  if (target.num == null || nums.has(target.num)) {
    let inherit = null, max = 0;
    eachPart(target, (x) => { if (x === target || x.num == null) return; if (inherit == null && !nums.has(x.num)) inherit = x.num; max = Math.max(max, x.num); });
    for (const n of nums) max = Math.max(max, n);
    target.num = inherit ?? max + 1;
  }
  eachPart(target, (x) => {
    // A connector is picked on its line only, not its whole box (which covers the objects it joins).
    if (x.connSpec) { x.connSpec = { ...x.connSpec, ends: (x.connSpec.ends ?? [{}, {}]).map((e) => ({ ...e })) }; x.perPixelTargetFind = true; }
    if (x.anchors) x.anchors = x.anchors.map((a) => ({ ...a }));
    if (!x.uid) return;
    if (!taken) { taken = new Set(); for (const o of userObjects()) eachPart(o, (y) => { if (!inside.has(y) && y.uid) taken.add(y.uid); }); }
    if (taken.has(x.uid)) x.uid = newUid();
  });
}

const anchorCache = new WeakMap();
/**
 * An object's anchors in its own units (centre at 0, 0): its own (Anchor Editing), or the four defaults, where
 * its outline meets lines from the centre towards the middle of each side (the box sides for text, pictures
 * and groups).
 */
function localAnchors(o) {
  const w = o.width || 0, h = o.height || 0;
  if (o.anchors) return o.anchors.map((a) => ({ id: a.id, x: a.u * w, y: a.v * h, side: null }));
  const ref = o.path ?? o.points ?? null, key = `${o.type}|${w}|${h}|${o.rx}|${o.ry}|${ref?.length}`, hit = anchorCache.get(o);
  if (hit && hit.key === key && hit.ref === ref) return hit.list;
  let pts = null;
  if (!isText(o) && o.type !== 'image' && o.type !== 'group' && V.canConvert(o)) {
    try {
      const inv = util.invertTransform(o.calcTransformMatrix()), loc = (q) => util.transformPoint(new Point(q.x, q.y), inv);
      const polys = V.objectModel(o).map((sp) => {
        const ns = sp.nodes, out = ns.length ? [loc(ns[0])] : [];
        for (let i = 0; i < (sp.closed ? ns.length : ns.length - 1); i++) {
          const A = ns[i], B = ns[(i + 1) % ns.length];
          if (!A.ho && !B.hi) out.push(loc(B));
          else { const seg = V.segmentPoints(A, B); for (let k = 1; k <= 8; k++) out.push(loc(V.bezierAt(seg, k / 8))); }
        }
        return out;
      });
      pts = C.outlineAnchors(polys, w, h);
    } catch { pts = null; }
  }
  pts ??= { t: { x: 0, y: -h / 2 }, r: { x: w / 2, y: 0 }, b: { x: 0, y: h / 2 }, l: { x: -w / 2, y: 0 } };
  const list = Object.entries(pts).map(([id, q]) => ({ id, x: q.x, y: q.y, side: id }));
  anchorCache.set(o, { key, ref, list });
  return list;
}
/** The anchors on the page, each with the way a line leaves it (outwards; none for one in the middle). */
function worldAnchors(o) {
  const m = o.calcTransformMatrix(), w = o.width || 1, h = o.height || 1;
  return localAnchors(o).map((a) => {
    const p = util.transformPoint(new Point(a.x, a.y), m);
    const ld = a.side ? C.SIDES[a.side] : Math.hypot(a.x / w, a.y / h) < 0.08 ? null : C.snapAxis({ x: a.x / w, y: a.y / h });
    return { id: a.id, o, x: p.x, y: p.y, dir: ld && C.snapAxis({ x: m[0] * ld.x + m[2] * ld.y, y: m[1] * ld.x + m[3] * ld.y }) };
  });
}
const nearestAnchor = (list, p) => list.reduce((m, a) => (!m || Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(m.x - p.x, m.y - p.y) ? a : m), null);
const pageAnchors = () => userObjects().filter(connectable).flatMap(worldAnchors);
/** The anchor within a few screen pixels of the page point, or null. */
function anchorAt(p, tol = 10) {
  let best = null, bd = tol;
  for (const a of pageAnchors()) { const d = screenDist(p, a); if (d <= bd) { bd = d; best = a; } }
  return best;
}
/** Where a connector end at p attaches: the anchor near the pointer, else the nearest anchor of the object under it. */
function attachAt(p) {
  const a = anchorAt(p);
  if (a) return a;
  const o = userObjects().filter(connectable).reverse().find((x) => x.containsPoint(new Point(p.x, p.y)));
  return o ? nearestAnchor(worldAnchors(o), p) : null;
}

/** The first or last point of a connector's line (the first part of its path; arrowheads come after it), on the page. */
function lineEnd(c, i) {
  let first = null, last = null;
  for (const [j, cmd] of c.path.entries()) {
    if (j > 0 && cmd[0] === 'M') break;
    const n = cmd.length;
    if (n >= 3) { const q = { x: cmd[n - 2], y: cmd[n - 1] }; first ??= q; last = q; }
  }
  const q = (i === 0 ? first : last) ?? { x: c.pathOffset.x, y: c.pathOffset.y };
  return util.transformPoint(new Point(q.x - c.pathOffset.x, q.y - c.pathOffset.y), c.calcTransformMatrix());
}
const asEnd = (a, p) => (a ? { x: a.x, y: a.y, dir: a.dir, attached: true } : { x: p.x, y: p.y, dir: null, attached: false });
/** Where a connector end is now: on its anchor (a deleted anchor: the nearest one left), or where the line ends when it is free. */
function connEnd(c, i) {
  const e = c.connSpec.ends?.[i], o = e?.uid ? findUid(e.uid) : null;
  if (o) {
    const list = worldAnchors(o), a = list.find((x) => x.id === e.anchor) ?? nearestAnchor(list, lineEnd(c, i));
    if (a) return asEnd(a);
  }
  return asEnd(null, lineEnd(c, i));
}
/** Path data of a connector of this kind between two ends. */
function routeD(kind, a, b, { radius = state.conn.radius, arrows = 'none', arrowSize = 2.4 * MM } = {}) {
  const pts = kind === 'straight' ? [a, b] : C.orthoRoute(a, a.attached ? a.dir : null, b, b.attached ? b.dir : null, a.attached ? STUB * MM : 0, b.attached ? STUB * MM : 0);
  return C.connectorD(pts, { rounded: kind === 'rounded', radius: radius * MM, arrows, arrowSize });
}
/** Redraws a connector between its ends (`at`: one end given instead, while it is dragged). False when nothing changed. */
function routeConnector(c, at = null) {
  if (!c?.connSpec || c.group) return false;
  const s = c.connSpec, [a, b] = [0, 1].map((i) => (at && at.i === i ? at.end : connEnd(c, i)));
  const d = routeD(s.kind, a, b, { radius: s.radius ?? state.conn.radius, arrows: s.arrows ?? 'none', arrowSize: Math.max(2.4 * MM, (c.strokeWidth || MM) * 4) });
  const plain = !c.angle && c.scaleX === 1 && c.scaleY === 1 && !c.skewX && !c.skewY && !c.flipX && !c.flipY;
  if (!d || (plain && d === c.connD)) return false;
  c.set({ angle: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, flipX: false, flipY: false });
  setLive(c, d);
  c.connD = d;
  c.dirty = true;
  return true;
}
/** Connectors attached to the changed object (to anything, when none is given) follow it. */
function syncConnectors(changed) {
  const conns = userObjects().filter((o) => o.connSpec);
  if (!conns.length) return;
  let ids = null;
  if (changed) { ids = new Set(); const walk = (o) => { if (o.uid) ids.add(o.uid); if (o.type === 'group' || o.type === 'activeselection') o.getObjects().forEach(walk); }; walk(changed); }
  let moved = false;
  for (const c of conns) {
    if (ids && c !== changed && !c.connSpec.ends?.some((e) => e?.uid && ids.has(e.uid))) continue;
    if (routeConnector(c)) moved = true;
  }
  if (moved) canvas.requestRenderAll();
}
for (const ev of ['object:moving', 'object:scaling', 'object:rotating', 'object:skewing']) canvas.on(ev, (e) => syncConnectors(e.target));
canvas.setTargetFindTolerance(5); // thin lines (connectors) are easier to click (also sizes Fabric's hit canvas)
// Connectors selected together with other objects move with the selection; when it ends they join their anchors again.
for (const ev of ['selection:cleared', 'selection:updated']) canvas.on(ev, () => syncConnectors());

const connEndSpec = (a) => (a?.o ? { uid: uidOf(a.o), anchor: a.id } : {});
function addConnector(kind, a, b) {
  const c = new Path(`M ${a.x} ${a.y} L ${b.x} ${b.y}`, { fill: null, stroke: state.strokeWidth ? state.stroke : '#111827', strokeWidth: Math.max(0.25, state.strokeWidth || 0.5) * MM, strokeUniform: true, strokeLineCap: 'round', strokeLineJoin: 'round', opacity: state.opacity });
  c.connSpec = { kind, radius: state.conn.radius, arrows: state.conn.arrows, ends: [connEndSpec(a), connEndSpec(b)] };
  style(c, { toolName: 'Connector' });
  routeConnector(c);
  canvas.add(c);
  canvas.requestRenderAll();
  return c;
}
/** Joins two objects between their nearest anchors (the chat's "connect"). */
function connectObjects(kind, o1, o2) {
  let best = null;
  for (const a of worldAnchors(o1)) for (const b of worldAnchors(o2)) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (!best || d < best.d) best = { a, b, d }; }
  canvas.discardActiveObject();
  return addConnector(kind, best.a, best.b);
}
const lineConns = () => userObjects().filter((o) => o.connSpec && !o.group && o.visible);
const attachedEnd = (c, i) => !!(c.connSpec.ends?.[i]?.uid && findUid(c.connSpec.ends[i].uid));
/** A connector end within a few screen pixels of p ({ c, i }): any end of the picked connector, free ends of the
 *  others (their attached ends sit on anchors, which are dragged first). */
function connEndAt(p, picked = null, tol = 9) {
  for (const c of lineConns().reverse()) for (const i of [0, 1]) {
    if (c !== picked && attachedEnd(c, i)) continue;
    if (screenDist(p, lineEnd(c, i)) <= tol) return { c, i };
  }
  return null;
}
/** Is p on the line of connector c (within a few screen pixels)? */
function onConnector(c, p, tol = 6) {
  const q = util.transformPoint(new Point(p.x, p.y), util.invertTransform(c.calcTransformMatrix()));
  const x = q.x + c.pathOffset.x, y = q.y + c.pathOffset.y, lim = tol / canvas.getZoom();
  const near = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0; return Math.hypot(ax + dx * t - x, ay + dy * t - y) <= lim; };
  let px = 0, py = 0;
  for (const cmd of c.path) {
    if (cmd[0] === 'M') { [px, py] = [cmd[1], cmd[2]]; continue; }
    if (cmd[0] === 'L') { if (near(px, py, cmd[1], cmd[2])) return true; [px, py] = [cmd[1], cmd[2]]; continue; }
    if (cmd[0] !== 'C') continue;
    let ax = px, ay = py;
    for (let k = 1; k <= 8; k++) {
      const t = k / 8, u = 1 - t, bx = u * u * u * px + 3 * u * u * t * cmd[1] + 3 * u * t * t * cmd[3] + t * t * t * cmd[5], by = u * u * u * py + 3 * u * u * t * cmd[2] + 3 * u * t * t * cmd[4] + t * t * t * cmd[6];
      if (near(ax, ay, bx, by)) return true;
      ax = bx; ay = by;
    }
    [px, py] = [cmd[5], cmd[6]];
  }
  return false;
}
/** The object's own anchor list (Anchor Editing), started from its default anchors the first time. */
function ownAnchors(o) {
  if (!o.anchors) o.anchors = localAnchors(o).map((a) => ({ id: a.id, u: o.width ? a.x / o.width : 0, v: o.height ? a.y / o.height : 0 }));
  return o.anchors;
}
/** Connector ends on anchors of o that no longer exist move to its nearest anchor (free when it has none left). */
function reattachEnds(o) {
  const list = worldAnchors(o);
  for (const c of userObjects().filter((x) => x.connSpec)) c.connSpec.ends.forEach((e, k) => {
    if (!o.uid || e?.uid !== o.uid || list.some((a) => a.id === e.anchor)) return;
    const near = nearestAnchor(list, lineEnd(c, k));
    c.connSpec.ends[k] = near ? { uid: o.uid, anchor: near.id } : {};
  });
}

// Connector tools: drag from an anchor of one object to another. Anchor Editing: drag anchors and connector ends.
function connDown(tool, p) {
  if (tool === 'anchor') {
    // The picked connector's ends first, then anchors, then free connector ends; a click on a connector picks it.
    const picked = connView.conn && lineConns().includes(connView.conn) ? connView.conn : null;
    const mine = picked && connEndAt(p, picked);
    const end = mine?.c === picked ? mine : null;
    if (end) { connDrag = { mode: 'end', ...end, orig: connEnd(end.c, end.i) }; connView.sel = null; syncContext(); drawTop(); return; }
    const a = anchorAt(p);
    if (a) { connView.sel = { o: a.o, id: a.id }; connView.conn = null; connDrag = { mode: 'anchor', o: a.o, id: a.id, moved: false }; syncContext(); drawTop(); return; }
    const free = connEndAt(p);
    if (free) { connView.conn = free.c; connView.sel = null; connDrag = { mode: 'end', ...free, orig: connEnd(free.c, free.i) }; syncContext(); drawTop(); return; }
    const c = lineConns().reverse().find((k) => onConnector(k, p)) ?? null;
    connView.sel = null; connView.conn = c;
    if (c) toast('Connector picked: drag one of its purple ends onto another anchor to re-attach it (or anywhere to leave it free)', 5000);
    syncContext(); drawTop();
    return;
  }
  const start = attachAt(p);
  connDrag = { mode: 'new', kind: CONN_TOOLS[tool], a: start ?? { x: p.x, y: p.y }, helper: helperPath('', { strokeDashArray: null, stroke: '#12E1F0' }) };
  connView.hover = start;
  drawTop();
}
function connMove(p) {
  const d = connDrag;
  if (!d) {
    connView.hover = state.tool === 'anchor' ? anchorAt(p) : attachAt(p);
    drawTop();
    return;
  }
  if (d.mode === 'new') {
    const target = attachAt(p);
    connView.hover = target;
    setLive(d.helper, routeD(d.kind, asEnd(d.a.o ? d.a : null, d.a), asEnd(target, p), { arrows: state.conn.arrows }));
    canvas.requestRenderAll(); drawTop();
  } else if (d.mode === 'end') {
    const target = attachAt(p);
    connView.hover = target;
    routeConnector(d.c, { i: d.i, end: asEnd(target, p) });
    canvas.requestRenderAll(); drawTop();
  } else if (d.mode === 'anchor') {
    const o = d.o, a = ownAnchors(o).find((x) => x.id === d.id);
    if (!a) return;
    const q = util.transformPoint(new Point(p.x, p.y), util.invertTransform(o.calcTransformMatrix())), clamp = (x) => Math.max(-0.75, Math.min(0.75, x));
    a.u = o.width ? clamp(q.x / o.width) : 0; a.v = o.height ? clamp(q.y / o.height) : 0;
    d.moved = true;
    syncConnectors(o);
    canvas.requestRenderAll(); drawTop();
  }
}
function connUp(p) {
  const d = connDrag;
  connDrag = null;
  if (d.mode === 'new') {
    dropHelper(d.helper);
    const target = attachAt(p), b = target ?? { x: p.x, y: p.y };
    if (screenDist(d.a, b) < 6 || (d.a.o && target && d.a.o === target.o && d.a.id === target.id)) { toast('Drag from an anchor of one object (the small diamonds) to an anchor of another to join them', 4500); drawTop(); return; }
    addConnector(d.kind, d.a, b);
    connView.hover = null; drawTop();
    return;
  }
  if (d.mode === 'end') {
    const target = attachAt(p);
    d.c.connSpec.ends[d.i] = connEndSpec(target);
    routeConnector(d.c, { i: d.i, end: asEnd(target, p) });
    canvas.fire('object:modified', { target: d.c });
    toast(target ? 'Connector end attached' : 'Connector end left free here: drop it on an anchor to attach it');
    drawTop();
    return;
  }
  if (d.mode === 'anchor' && d.moved) canvas.fire('object:modified', { target: d.o });
  syncContext(); drawTop();
}
function cancelConn() {
  const d = connDrag;
  connDrag = null;
  if (!d) return;
  dropHelper(d.helper);
  if (d.mode === 'end') routeConnector(d.c, { i: d.i, end: d.orig });
}
function anchorDblclick(p) {
  const a = anchorAt(p);
  if (a) { deleteAnchor({ o: a.o, id: a.id }); return; }
  const o = userObjects().filter(connectable).reverse().find((x) => x.containsPoint(new Point(p.x, p.y)));
  if (!o) { toast('Double-click an object to add an anchor there'); return; }
  const q = util.transformPoint(new Point(p.x, p.y), util.invertTransform(o.calcTransformMatrix())), id = `a${Date.now().toString(36)}`;
  ownAnchors(o).push({ id, u: o.width ? q.x / o.width : 0, v: o.height ? q.y / o.height : 0 });
  connView.sel = { o, id };
  canvas.fire('object:modified', { target: o });
  syncContext(); drawTop();
  toast('Anchor added: connectors can attach here now');
}
function deleteAnchor(sel) {
  const list = ownAnchors(sel.o), i = list.findIndex((a) => a.id === sel.id);
  if (i < 0) return;
  list.splice(i, 1);
  reattachEnds(sel.o);
  connView.sel = null;
  canvas.fire('object:modified', { target: sel.o });
  syncContext(); drawTop();
  toast(list.length ? 'Anchor deleted (connectors on it moved to the nearest anchor left)' : 'Anchor deleted: this object has no anchors left (Reset anchors brings back the four)', 4500);
}
/** Anchors on the top layer while a connector tool is on: hovered cyan, picked (Anchor Editing) pink; connector ends purple. */
function drawAnchors(ctx, r, v) {
  const S = (q) => ({ x: q.x * v[0] + v[4], y: q.y * v[3] + v[5] }), hov = connView.hover, sel = connView.sel;
  ctx.save(); ctx.setTransform(r, 0, 0, r, 0, 0);
  for (const a of pageAnchors()) {
    const q = S(a), on = hov && hov.o === a.o && hov.id === a.id, picked = sel && sel.o === a.o && sel.id === a.id, s = on || picked ? 6 : 4;
    ctx.beginPath(); ctx.moveTo(q.x, q.y - s); ctx.lineTo(q.x + s, q.y); ctx.lineTo(q.x, q.y + s); ctx.lineTo(q.x - s, q.y); ctx.closePath();
    ctx.fillStyle = picked ? '#E6007E' : on ? '#12E1F0' : '#ffffff'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#1E7BFF'; ctx.stroke();
  }
  if (state.tool === 'anchor') {
    // The picked connector's ends (big) and free ends of the others: purple dots.
    for (const c of lineConns()) for (const i of [0, 1]) {
      const big = c === connView.conn;
      if (!big && attachedEnd(c, i)) continue;
      const q = S(lineEnd(c, i));
      ctx.beginPath(); ctx.arc(q.x, q.y, big ? 6 : 4.5, 0, Math.PI * 2); ctx.fillStyle = '#7B4DFF'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    }
  }
  ctx.restore();
}
/** Property bar: the settings of the selected connectors (Pick tool), else the ones for new connectors. */
function setConn(change) {
  const sel = state.tool === 'select' ? canvas.getActiveObjects().filter((o) => o.connSpec) : [];
  if (sel.length) {
    for (const c of sel) { Object.assign(c.connSpec, change); c.connD = null; routeConnector(c); }
    canvas.requestRenderAll();
    canvas.fire('object:modified', { target: sel[0] });
  } else { Object.assign(state.conn, change); savePrefs(); }
  syncContext();
}
$('connType').onchange = (e) => setConn({ kind: e.target.value });
$('connRadius').onchange = (e) => setConn({ radius: Math.max(0, Math.min(100, Number(e.target.value) || 0)) });
$('connArrows').onchange = (e) => setConn({ arrows: e.target.value });
$('anchorDel').onclick = () => { if (connView?.sel) deleteAnchor(connView.sel); };
// ===================================================================
// Variable Outline (CorelDRAW): an outline whose width changes along the line. The object keeps its shape; its
// outline becomes a filled shape built along it, grouped with it, and the group keeps the widths (varSpec), so
// they can be changed again: drag on the outline to set the width there, or pick a profile on the property bar.
// Widths are in mm at the object's size when the outline was made, and grow or shrink with the object.
// ===================================================================
const VAR_PROFILES = {
  uniform: () => [],
  taper: (W) => [{ t: 0, w: 0 }, { t: 0.3, w: W }, { t: 0.7, w: W }, { t: 1, w: 0 }],
  'taper-start': (W) => [{ t: 0, w: 0 }, { t: 0.45, w: W }],
  'taper-end': (W) => [{ t: 0.55, w: W }, { t: 1, w: 0 }],
  bulge: (W) => [{ t: 0, w: W * 0.35 }, { t: 0.5, w: W * 1.8 }, { t: 1, w: W * 0.35 }],
  pinch: (W) => [{ t: 0, w: W * 1.6 }, { t: 0.5, w: W * 0.25 }, { t: 1, w: W * 1.6 }],
  wave: (W) => Array.from({ length: 9 }, (_, i) => ({ t: i / 8, w: i % 2 ? W * 0.35 : W * 1.4 })),
};
const VAR_NAMES = { uniform: 'uniform', taper: 'tapered at both ends', 'taper-start': 'tapered at the start', 'taper-end': 'tapered at the end', bulge: 'bulging in the middle', pinch: 'pinched in the middle', wave: 'wavy', custom: 'custom' };
// The curve the outline follows: the object itself, or for a picture the invisible outline of its visible shape.
const varBase = (g) => g.getObjects().find((k) => k.fxPart === 'varbase') ?? g.getObjects().find((k) => k.fxPart !== 'varline') ?? g.getObjects()[0];
const varPart = (g) => g.getObjects().find((k) => k.fxPart === 'varline');
const varOk = (o) => !!o && (o.varSpec || o.type === 'image' || (o.type !== 'group' && !isText(o) && !o.connSpec && !o.isPage && !o.isHelper && V.canConvert(o)));
const avgScale = (o) => { const m = o.calcTransformMatrix(); return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1; };

const runsCache = new WeakMap();
/**
 * An object's outline as runs of points (page coordinates) about 1 mm apart: { pts, closed, len } per subpath,
 * each point with its distance along the run (s) and direction (tx, ty); where the line turns sharply the point
 * also has the incoming direction (tin), for a round join.
 */
function outlineRuns(o) {
  const m = o.calcTransformMatrix(), ref = o.path ?? o.points ?? null, key = `${m.map((x) => x.toFixed(3)).join()}|${o.type}|${o.width}|${o.height}|${o.rx}|${o.ry}|${ref?.length}`;
  const hit = runsCache.get(o);
  if (hit && hit.key === key && hit.ref === ref) return hit.runs;
  const step = MM, runs = [];
  const at = (sg, t) => (sg.straight ? { x: sg.seg[0].x + (sg.seg[3].x - sg.seg[0].x) * t, y: sg.seg[0].y + (sg.seg[3].y - sg.seg[0].y) * t } : V.bezierAt(sg.seg, t));
  const tan = (sg, t) => { const a = at(sg, Math.max(0, t - 0.01)), b = at(sg, Math.min(1, t + 0.01)), L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }; };
  for (const sp of V.objectModel(o)) {
    const ns = sp.nodes, count = sp.closed ? ns.length : ns.length - 1, segs = [];
    for (let i = 0; i < count; i++) {
      const A = ns[i], B = ns[(i + 1) % ns.length], sg = { seg: V.segmentPoints(A, B), straight: !A.ho && !B.hi, len: 0 };
      let prev = A;
      for (let k = 1; k <= 16; k++) { const q = at(sg, k / 16); sg.len += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; }
      if (sg.len > 1e-6) segs.push(sg);
    }
    if (!segs.length) continue;
    const pts = [];
    let s = 0;
    segs.forEach((sg, i) => {
      const n = Math.max(1, Math.ceil(sg.len / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, p = at(sg, t), tg = tan(sg, t), e = { x: p.x, y: p.y, s: s + sg.len * t, tx: tg.x, ty: tg.y };
        if (k === 0 && (i > 0 || sp.closed)) { const tin = tan(segs[(i - 1 + segs.length) % segs.length], 1); if (tin.x * tg.x + tin.y * tg.y < 0.978) e.tin = tin; }
        pts.push(e);
      }
      s += sg.len;
    });
    if (!sp.closed) { const sg = segs.at(-1), p = at(sg, 1), tg = tan(sg, 1); pts.push({ x: p.x, y: p.y, s, tx: tg.x, ty: tg.y }); }
    runs.push({ pts, closed: !!sp.closed, len: s });
  }
  runsCache.set(o, { key, ref, runs });
  return runs;
}
/** The width (mm) at t (0 to 1 along the whole outline): smooth between the width points; on one closed outline it also runs across the start. */
function varWidthAt(pts, W, t, cyclic) {
  if (!pts.length) return W;
  if (pts.length === 1) return pts[0].w;
  const sm = (a, b, u) => a + (b - a) * u * u * (3 - 2 * u), first = pts[0], last = pts.at(-1), span = 1 - last.t + first.t;
  if (t <= first.t) return cyclic && span > 1e-6 ? sm(last.w, first.w, (t + 1 - last.t) / span) : first.w;
  if (t >= last.t) return cyclic && span > 1e-6 ? sm(last.w, first.w, (t - last.t) / span) : last.w;
  for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1]; if (t <= b.t) return b.t > a.t ? sm(a.w, b.w, (t - a.t) / (b.t - a.t)) : b.w; }
  return last.w;
}
/** Path data of the variable outline along the runs (page coordinates). */
function varOutlineD(runs, spec, scale) {
  const total = runs.reduce((a, r) => a + r.len, 0) || 1, cyclic = runs.length === 1 && runs[0].closed, pts = [...spec.pts].sort((a, b) => a.t - b.t);
  const half = (t) => (Math.max(0, varWidthAt(pts, spec.width, t, cyclic)) * MM * scale) / 2, f = (n) => +n.toFixed(2);
  const fan = (tin, tg) => {
    const a0 = Math.atan2(tin.x, -tin.y), a1 = Math.atan2(tg.x, -tg.y);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(da) / 0.26));
    return Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (da * i) / n; return { x: Math.cos(a), y: Math.sin(a) }; });
  };
  const arc = (c, from, h, dir) => {
    // half a circle from the side `from` (a unit normal) round the end, on the side the line points to (dir)
    const a0 = Math.atan2(from.y, from.x), sign = Math.sign(from.x * dir.y - from.y * dir.x) || 1, out = [];
    for (let i = 1; i < 8; i++) { const a = a0 + (sign * Math.PI * i) / 8; out.push({ x: c.x + Math.cos(a) * h, y: c.y + Math.sin(a) * h }); }
    return out;
  };
  const loop = (q) => ` M ${q.map((z) => `${f(z.x)} ${f(z.y)}`).join(' L ')} Z`;
  let d = '', off = 0;
  for (const run of runs) {
    const L = [], R = [];
    for (const p of run.pts) {
      const h = half((off + p.s) / total), normals = p.tin ? fan(p.tin, { x: p.tx, y: p.ty }) : [{ x: -p.ty, y: p.tx }];
      for (const nn of normals) { L.push({ x: p.x + nn.x * h, y: p.y + nn.y * h }); R.push({ x: p.x - nn.x * h, y: p.y - nn.y * h }); }
    }
    off += run.len;
    if (run.closed) { d += loop(L) + loop(R.reverse()); continue; }
    const s0 = run.pts[0], s1 = run.pts.at(-1), h0 = half((off - run.len) / total), h1 = half(off / total);
    const endCap = spec.cap === 'round' && h1 > 0 ? arc(s1, { x: -s1.ty, y: s1.tx }, h1, { x: s1.tx, y: s1.ty }) : [];
    const startCap = spec.cap === 'round' && h0 > 0 ? arc(s0, { x: s0.ty, y: -s0.tx }, h0, { x: -s0.tx, y: -s0.ty }) : [];
    d += loop([...L, ...endCap, ...R.reverse(), ...startCap]);
  }
  return d.trim();
}
/** The outline shape of a variable outline group's object (page coordinates). */
function varShape(base, spec) {
  // Made without an outline from the start: changing the outline width afterwards would shift it.
  const p = style(new Path(varOutlineD(outlineRuns(base), spec, avgScale(base) / (spec.unit || 1)) || 'M 0 0', { fill: spec.colour, stroke: null, strokeWidth: 0 }), { toolName: 'Variable outline' });
  p.fxPart = 'varline';
  return p;
}
/**
 * A picture's visible shape (its solid pixels) as an invisible curve over it, in page coordinates: a photo gives its
 * frame, a brush stroke or a cut-out logo its silhouette (holes included). Null when nothing in it is solid.
 */
function imageSilhouette(img) {
  const pic = B.imagePixels(img, 600), w = pic.canvas.width, h = pic.canvas.height, pad = 2;
  const src = pic.ctx.getImageData(0, 0, w, h).data, mask = document.createElement('canvas');
  mask.width = w + pad * 2; mask.height = h + pad * 2;
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  mctx.fillStyle = '#ffffff'; mctx.fillRect(0, 0, mask.width, mask.height);
  const out = mctx.getImageData(pad, pad, w, h);
  for (let i = 0; i < src.length; i += 4) { const v = src[i + 3] >= 128 ? 0 : 255; out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255; }
  mctx.putImageData(out, pad, pad);
  const svg = new DOMParser().parseFromString(B.traceSvg(mctx, mask.width, mask.height, { colours: 2, detail: 'medium' }), 'image/svg+xml');
  const dark = (c) => { const m = String(c ?? '').match(/\d+/g); return !!m && m.length >= 3 && +m[0] + +m[1] + +m[2] < 384; };
  const d = [...svg.querySelectorAll('path')].filter((el) => dark(el.getAttribute('fill')) && el.getAttribute('opacity') !== '0').map((el) => el.getAttribute('d')).join(' ').trim();
  if (!d) return null;
  // Trace pixels -> picture pixels -> page (as Trace bitmap places its result).
  const p = new Path(d, { fill: null, stroke: null, strokeWidth: 0, objectCaching: false });
  const c = p.getCenterPoint(), at = util.transformPoint(new Point((c.x - pad) / pic.kx - img.width / 2, (c.y - pad) / pic.ky - img.height / 2), img.calcTransformMatrix());
  p.set({ scaleX: img.scaleX / pic.kx, scaleY: img.scaleY / pic.ky, angle: img.angle, flipX: img.flipX, flipY: img.flipY, skewX: img.skewX, skewY: img.skewY });
  p.setPositionByOrigin(at, 'center', 'center'); p.setCoords();
  p.fxPart = 'varbase';
  return p;
}
/** A picture with a variable outline round its visible shape: the picture, that shape (invisible) and the outline. */
function makeVarImageGroup(img) {
  const sil = imageSilhouette(img);
  if (!sil) return null;
  const i = canvas.getObjects().indexOf(img);
  const spec = { pts: [], width: Math.max(0.5, state.strokeWidth || 1), profile: 'uniform', cap: 'butt', unit: avgScale(sil), colour: (state.strokeWidth ? state.stroke : null) ?? '#000000', orig: null, picture: true };
  const part = varShape(sil, spec);
  canvas.remove(img);
  const g = style(new Group([img, sil, part]), { toolName: 'Variable outline group' });
  g.varSpec = spec; g.name = `${img.name || 'Image'} outlined`;
  canvas.insertAt(Math.max(1, i), g);
  return g;
}
/** Makes the object a variable outline group (its own outline off, the outline shape over it). */
function makeVarGroup(o) {
  if (o.type === 'image') return makeVarImageGroup(o);
  const i = canvas.getObjects().indexOf(o), closed = V.objectModel(o).every((sp) => sp.closed);
  const width = Math.max(0.5, o.strokeWidth ? (o.strokeWidth / MM) * (o.strokeUniform ? 1 : avgScale(o)) : state.strokeWidth || 1);
  const spec = {
    pts: [], width, profile: 'uniform', cap: closed ? 'butt' : 'round', unit: avgScale(o),
    colour: (typeof o.stroke === 'string' && o.strokeWidth ? o.stroke : null) ?? (state.strokeWidth ? state.stroke : null) ?? '#000000',
    orig: { stroke: o.stroke ?? null, strokeWidth: o.strokeWidth ?? 0, strokeDashArray: o.strokeDashArray ?? null, strokeLineCap: o.strokeLineCap, strokeLineJoin: o.strokeLineJoin },
  };
  // Its own outline goes; it keeps its centre (Fabric places shapes by their box including the outline).
  const c = o.getCenterPoint();
  o.set({ stroke: null, strokeWidth: 0, strokeDashArray: null });
  o.setPositionByOrigin(c, 'center', 'center'); o.setCoords();
  const part = varShape(o, spec);
  canvas.remove(o);
  const g = style(new Group([o, part]), { toolName: 'Variable outline group' });
  g.varSpec = spec; g.name = `${o.name} variable outline`;
  canvas.insertAt(Math.max(1, i), g);
  return g;
}
/** Builds the outline shape again from the group's settings. */
function refreshVar(g) {
  const old = varPart(g), part = varShape(varBase(g), g.varSpec);
  if (old) g.remove(old);
  g.add(part);
  g.setCoords(); g.dirty = true;
}
/** Back to an ordinary outline: the object on its own with the outline it had before. */
function removeVar(g) {
  const i = canvas.getObjects().indexOf(g), kids = g.removeAll();
  if (g.varSpec.picture) {
    // A picture: just the picture again (its outline and the shape it followed go).
    const img = kids.find((k) => k.type === 'image') ?? kids[0];
    canvas.remove(g); canvas.insertAt(Math.max(1, i), img);
    return img;
  }
  const base = kids.find((k) => k.fxPart !== 'varline') ?? kids[0];
  const c = base.getCenterPoint();
  base.set({ ...g.varSpec.orig, stroke: g.varSpec.orig.stroke ?? g.varSpec.colour, strokeWidth: g.varSpec.orig.strokeWidth || g.varSpec.width * MM });
  base.setPositionByOrigin(c, 'center', 'center'); base.setCoords();
  canvas.remove(g);
  canvas.insertAt(Math.max(1, i), base);
  return base;
}

/** The nearest point on an outline to p: { d, t (0 to 1 along the whole outline), x, y, nx, ny }. */
function nearestOnRuns(runs, p) {
  const total = runs.reduce((a, r) => a + r.len, 0) || 1;
  let best = null, off = 0;
  for (const run of runs) {
    const ps = run.pts, n = ps.length, segs = run.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = ps[i], b = ps[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const u = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0, x = a.x + dx * u, y = a.y + dy * u, d = Math.hypot(p.x - x, p.y - y);
      if (best && d >= best.d) continue;
      const sb = i + 1 < n ? b.s : run.len, L = Math.sqrt(L2) || 1;
      best = { d, t: (off + a.s + (sb - a.s) * u) / total, x, y, nx: -dy / L, ny: dx / L };
    }
    off += run.len;
  }
  return best;
}
/** The point at t along the outline, with its normal. */
function pointOnRuns(runs, t) {
  const total = runs.reduce((a, r) => a + r.len, 0) || 1;
  let want = Math.max(0, Math.min(1, t)) * total;
  for (const run of runs) {
    if (want > run.len + 1e-9) { want -= run.len; continue; }
    const ps = run.pts, n = ps.length;
    for (let i = 0; i < (run.closed ? n : n - 1); i++) {
      const a = ps[i], b = ps[(i + 1) % n], sb = i + 1 < n ? b.s : run.len;
      if (want <= sb + 1e-9) { const u = sb > a.s ? (want - a.s) / (sb - a.s) : 0, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return { x: a.x + dx * u, y: a.y + dy * u, nx: -dy / L, ny: dx / L }; }
    }
    const z = ps.at(-1);
    return { x: z.x, y: z.y, nx: -z.ty, ny: z.tx };
  }
  const z = runs.at(-1).pts.at(-1);
  return { x: z.x, y: z.y, nx: -z.ty, ny: z.tx };
}
/** The outline under p (within a few screen pixels), top object first: { o, base, ...nearest point }. */
function outlineAt(p, tol = 9) {
  const lim = tol / canvas.getZoom();
  for (const o of userObjects().slice().reverse()) {
    if (!o.visible || o.locked || !varOk(o)) continue;
    const b = o.getBoundingRect();
    if (p.x < b.left - lim || p.x > b.left + b.width + lim || p.y < b.top - lim || p.y > b.top + b.height + lim) continue;
    const base = o.varSpec ? varBase(o) : o;
    let hit = null;
    try { hit = nearestOnRuns(outlineRuns(base), p); } catch { hit = null; }
    // On a variable outline anywhere across its width counts.
    const reach = o.varSpec ? Math.max(lim, (varWidthAt([...o.varSpec.pts].sort((x, y) => x.t - y.t), o.varSpec.width, hit?.t ?? 0, false) * MM * avgScale(base)) / (o.varSpec.unit || 1) / 2 + lim) : lim;
    if (hit && hit.d <= reach) return { o, base, ...hit };
  }
  return null;
}
/** The width point of the group under p (its middle or either end of its bar), or -1. */
function varPointAt(g, p) {
  const base = varBase(g), runs = outlineRuns(base), k = (avgScale(base) / (g.varSpec.unit || 1)) * MM;
  const pts = g.varSpec.pts;
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pointOnRuns(runs, pts[i].t), h = (pts[i].w * k) / 2;
    for (const z of [q, { x: q.x + q.nx * h, y: q.y + q.ny * h }, { x: q.x - q.nx * h, y: q.y - q.ny * h }]) if (screenDist(p, z) <= 9) return i;
  }
  return -1;
}
const sortVar = (g, keep) => { const pts = g.varSpec.pts; pts.sort((a, b) => a.t - b.t); return keep ? pts.indexOf(keep) : -1; };

function varDown(p) {
  if (varEdit && !canvas.getObjects().includes(varEdit.g)) varEdit = null;
  // A width point of the outline being edited: drag it.
  const own = varEdit ? varPointAt(varEdit.g, p) : -1;
  if (own >= 0) { varEdit.sel = own; startVarDrag(varEdit.g, own); return; }
  const hit = outlineAt(p);
  if (!hit) {
    varEdit = null; syncContext(); syncProps(); drawTop();
    const o = userObjects().slice().reverse().find((x) => x.visible && x.containsPoint(new Point(p.x, p.y)));
    if (o && isText(o)) toast('Text has no outline to vary here: convert it to curves first (Ctrl+Q), then drag on its outline');
    else if (o?.type === 'image') {
      // A picture: first an outline round its visible shape (a photo: its frame); then drag on it like any outline.
      let g = null;
      batch(() => { g = makeVarImageGroup(o); });
      if (!g) { toast('This picture is see-through all over: there is no shape to outline'); return; }
      varEdit = { g, sel: null };
      canvas.requestRenderAll(); syncProps(); syncContext(); drawTop();
      toast('Outline added round the shape of the picture: now press on that outline and drag to change its width there (profiles on the property bar)', 6000);
    }
    else if (o?.type === 'group' && !o.varSpec) toast('This is a group (objects grouped or merged together): ungroup it first (Ctrl+U), then press on the outline of the part you want', 5000);
    else if (o) toast('Press on the outline (the edge) of the shape or line, then drag away from it to make it wider');
    return;
  }
  let g = hit.o;
  if (!g.varSpec) { batch(() => { g = makeVarGroup(hit.o); }); toast('Variable outline: drag away from the line to widen it, towards it to narrow it · more points: press elsewhere on the outline', 5000); }
  const i = varPointAt(g, p);
  varEdit = { g, sel: i };
  syncProps();
  if (i >= 0) { startVarDrag(g, i); return; }
  // A new width point where the outline was pressed, starting at the width it has there.
  const spec = g.varSpec, sorted = [...spec.pts].sort((a, b) => a.t - b.t), runs = outlineRuns(varBase(g)), cyclic = runs.length === 1 && runs[0].closed;
  const pt = { t: hit.t, w: varWidthAt(sorted, spec.width, hit.t, cyclic) };
  // On an even outline the first drag changes the width round that spot only (as in CorelDRAW): two points at the
  // normal width either side keep the rest as it was.
  if (!spec.pts.length) {
    const r = 0.18, near = [hit.t - r, hit.t + r].map((t) => (cyclic ? (t + 1) % 1 : t)).filter((t) => t > 0.001 && t < 0.999);
    for (const t of near) spec.pts.push({ t, w: spec.width });
  }
  spec.pts.push(pt);
  varEdit.sel = sortVar(g, pt);
  startVarDrag(g, varEdit.sel, true);
}
function startVarDrag(g, i, added = false) {
  const part = varPart(g);
  if (part) { part.visible = false; g.dirty = true; }
  varDrag = { g, i, added, moved: false };
  varPreview();
  canvas.requestRenderAll(); syncContext();
}
function varPreview() {
  const g = varDrag?.g;
  if (!g) return;
  const base = varBase(g);
  varView = { preview: varOutlineD(outlineRuns(base), g.varSpec, avgScale(base) / (g.varSpec.unit || 1)), colour: g.varSpec.colour };
  drawTop();
}
function varMove(p) {
  if (!varDrag) {
    // Hover: where a press would set the width
    const hit = outlineAt(p);
    varView = hit ? { hover: hit } : null;
    drawTop();
    return;
  }
  const { g, i } = varDrag, base = varBase(g), runs = outlineRuns(base), pt = g.varSpec.pts[i], q = pointOnRuns(runs, pt.t);
  const k = (avgScale(base) / (g.varSpec.unit || 1)) * MM;
  pt.w = Math.min(150, Math.max(0, (2 * Math.abs((p.x - q.x) * q.nx + (p.y - q.y) * q.ny)) / k));
  g.varSpec.profile = 'custom';
  varDrag.moved = true;
  varPreview();
  syncVarBar();
}
function varUp() {
  const d = varDrag;
  varDrag = null; varView = null;
  if (!d) return;
  refreshVar(d.g);
  canvas.requestRenderAll();
  canvas.fire('object:modified', { target: d.g });
  syncContext(); drawTop();
}
function cancelVar() {
  if (varDrag) { const g = varDrag.g; varDrag = null; refreshVar(g); canvas.requestRenderAll(); }
  const had = !!varEdit;
  varEdit = null; varView = null;
  if (had) syncProps();
}
function varDblclick(p) {
  if (!varEdit) return;
  const i = varPointAt(varEdit.g, p);
  if (i >= 0) deleteVarPoint(i);
}
function deleteVarPoint(i = varEdit?.sel) {
  const g = varEdit?.g;
  if (!g || i == null || i < 0 || i >= g.varSpec.pts.length) return;
  g.varSpec.pts.splice(i, 1);
  g.varSpec.profile = g.varSpec.pts.length ? 'custom' : 'uniform';
  varEdit.sel = null;
  refreshVar(g);
  canvas.requestRenderAll();
  canvas.fire('object:modified', { target: g });
  syncContext(); drawTop();
  toast('Width point deleted');
}
/** The width points of the outline being edited (cyan, the picked one pink), a hover mark, and the outline while it is dragged. */
function drawVar(ctx, r, v) {
  const S = (q) => ({ x: q.x * v[0] + v[4], y: q.y * v[3] + v[5] });
  if (varView?.preview) {
    ctx.save(); ctx.setTransform(r * v[0], 0, 0, r * v[3], r * v[4], r * v[5]);
    ctx.globalAlpha = 0.85; ctx.fillStyle = typeof varView.colour === 'string' ? varView.colour : '#000000';
    ctx.fill(new Path2D(varView.preview));
    ctx.restore();
  }
  ctx.save(); ctx.setTransform(r, 0, 0, r, 0, 0);
  const g = varEdit?.g;
  if (g && canvas.getObjects().includes(g)) {
    const base = varBase(g), runs = outlineRuns(base), k = (avgScale(base) / (g.varSpec.unit || 1)) * MM;
    g.varSpec.pts.forEach((pt, i) => {
      const q = pointOnRuns(runs, pt.t), h = (pt.w * k) / 2, a = S({ x: q.x + q.nx * h, y: q.y + q.ny * h }), b = S({ x: q.x - q.nx * h, y: q.y - q.ny * h }), c = S(q), on = i === varEdit.sel;
      ctx.strokeStyle = '#05121c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = on ? '#E6007E' : '#12E1F0'; ctx.lineWidth = 2; ctx.stroke();
      for (const z of [a, b]) { ctx.beginPath(); ctx.arc(z.x, z.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = on ? '#E6007E' : '#1E7BFF'; ctx.lineWidth = 1.2; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(c.x, c.y, on ? 5.5 : 4.5, 0, Math.PI * 2); ctx.fillStyle = on ? '#E6007E' : '#12E1F0'; ctx.fill(); ctx.strokeStyle = '#05121c'; ctx.lineWidth = 1.2; ctx.stroke();
    });
  }
  const hov = varView?.hover;
  if (hov) {
    const c = S(hov), a = S({ x: hov.x + hov.nx * 6 / v[0], y: hov.y + hov.ny * 6 / v[0] }), b = S({ x: hov.x - hov.nx * 6 / v[0], y: hov.y - hov.ny * 6 / v[0] });
    ctx.strokeStyle = '#12E1F0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#1E7BFF'; ctx.stroke();
  }
  ctx.restore();
}
/** Variable outlines the property bar and the chat change: the one being edited, else the selected objects. */
function varTargets() {
  if (varEdit?.g && canvas.getObjects().includes(varEdit.g)) return [varEdit.g];
  const sel = state.tool === 'varline' ? toolTargets.filter((o) => canvas.getObjects().includes(o)) : active();
  return sel.filter(varOk);
}
/** A profile for the targets (made variable outlines first); width in mm (the widest part), or keep it. */
function setVarProfile(name, width) {
  const objs = varTargets();
  if (!objs.length) throw new Error('Select shapes or lines first (or click an outline with the Variable Outline tool)');
  const out = [];
  canvas.discardActiveObject();
  batch(() => {
    for (const o of objs) {
      if (name === 'remove') { out.push(o.varSpec ? removeVar(o) : o); continue; }
      const g = o.varSpec ? o : makeVarGroup(o);
      if (width > 0) g.varSpec.width = width;
      g.varSpec.pts = VAR_PROFILES[name](g.varSpec.width);
      g.varSpec.profile = name;
      refreshVar(g);
      out.push(g);
    }
  });
  if (varEdit) { varEdit = name === 'remove' ? null : { g: out[0], sel: null }; }
  if (state.tool === 'select') select(out);
  canvas.requestRenderAll(); syncContext(); syncProps(); drawTop();
  return out;
}
/** The width box: the picked width point's width, else the outline's width (all points change in proportion). */
function setVarWidth(mm) {
  const objs = varTargets().filter((o) => o.varSpec);
  if (!objs.length) return;
  for (const g of objs) {
    const s = g.varSpec;
    if (varEdit?.g === g && varEdit.sel != null && s.pts[varEdit.sel]) { s.pts[varEdit.sel].w = mm; s.profile = 'custom'; }
    else { const f = s.width ? mm / s.width : 1; s.pts = s.pts.map((q) => ({ ...q, w: q.w * f })); s.width = mm; }
    refreshVar(g);
  }
  canvas.requestRenderAll();
  canvas.fire('object:modified', { target: objs[0] });
  syncContext(); drawTop();
}
function syncVarBar() {
  const g = varTargets().find((o) => o.varSpec), s = g?.varSpec, sel = g && varEdit?.g === g && varEdit.sel != null ? s.pts[varEdit.sel] : null;
  $('varProfile').value = s ? (s.profile ?? 'custom') : 'uniform';
  $('varWidthLabel').textContent = sel ? 'Point width' : 'Width';
  $('varWidth').value = String(+(sel ? sel.w : s ? s.width : Math.max(0.5, state.strokeWidth || 1)).toFixed(2));
  $('varCap').value = s?.cap ?? 'round';
  $('varDelPoint').disabled = !sel; $('varRemove').disabled = !s;
}
$('varProfile').onchange = (e) => { if (e.target.value === 'custom') return; try { setVarProfile(e.target.value); } catch (err) { toast(err.message); syncContext(); } };
$('varWidth').onchange = (e) => { const mm = Math.max(0, Math.min(150, Number(e.target.value) || 0)); setVarWidth(mm); };
$('varCap').onchange = (e) => { const objs = varTargets().filter((o) => o.varSpec); for (const g of objs) { g.varSpec.cap = e.target.value; refreshVar(g); } if (objs.length) { canvas.requestRenderAll(); canvas.fire('object:modified', { target: objs[0] }); } };
$('varDelPoint').onclick = () => deleteVarPoint();
$('varRemove').onclick = () => { try { setVarProfile('remove'); toast('Back to an ordinary outline'); } catch (err) { toast(err.message); } };
$('anchorReset').onclick = () => {
  const sel = connView?.sel;
  if (!sel) return;
  delete sel.o.anchors;
  reattachEnds(sel.o);
  connView.sel = null;
  canvas.fire('object:modified', { target: sel.o });
  syncContext(); drawTop();
  toast('Anchors back to the four defaults');
};

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
      if (state.gradient) { o.gradSpec = cloneGrad(state.gradient); return { fill: gradientFor(o, state.gradient) }; }
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
      if (gradSpec) o.gradSpec = cloneGrad(gradSpec); else delete o.gradSpec;
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
  if (state.gradient) { o.gradSpec = cloneGrad(state.gradient); o.set('fill', gradientFor(o)); }
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
// Contour (CorelDRAW): steps outside, inside or to the centre of the object, grouped with it. Applying again changes
// the contour (it is made again from the original object, never stacked); Remove gives the original back; Break
// apart leaves the object and its steps as separate shapes.
const isContourGroup = (o) => o?.type === 'group' && (!!o.fxContour || o.toolName === 'Contour group');
const contourBase = (g) => g.getObjects().find((k) => k.fxPart !== 'contour' && k.toolName !== 'Contour') ?? g.getObjects()[0];
function applyContour(mode = 'apply') {
  const objs = active().filter((o) => shapeable(o) || isContourGroup(o));
  if (!objs.length) { toast('Select a shape or text to contour'); return; }
  const fx = state.fx, dir = fx.contourDir, outside = dir === 'outside', centre = dir === 'centre', steps = Math.max(1, Math.min(20, fx.contourSteps));
  canvas.discardActiveObject();
  const out = [];
  try {
    batch(() => {
      for (let o of objs) {
        if (isContourGroup(o)) {
          if (mode === 'break') {
            // The steps and the object stay where they are, each a shape of its own.
            const i = canvas.getObjects().indexOf(o), kids = o.removeAll();
            canvas.remove(o);
            kids.forEach((k, j) => { delete k.fxPart; if (k.toolName === 'Contour') k.name ??= `Contour step ${j + 1}`; canvas.insertAt(Math.max(1, i + j), k); out.push(k); });
            continue;
          }
          const kids = o.removeAll(), keep = contourBase({ getObjects: () => kids }) ?? kids[0];
          replaceObject(o, keep); o = keep;
        }
        if (mode !== 'apply') { out.push(o); continue; }
        const base = worldD(o), ds = [];
        // To centre: inside steps until the shape is filled (at most 100).
        for (let i = 1; i <= (centre ? 100 : steps); i++) {
          const d = V.offsetD(base, (outside ? 1 : -1) * fx.contourOffset * MM * i);
          if (!d) break;
          ds.push(d);
        }
        if (!ds.length) { out.push(o); continue; }
        const contours = ds.map((d, i) => {
          const p = makePath(d, null, { toolName: 'Contour' });
          p.set({ fill: mix(solid(o), fx.contourColour, (i + 1) / ds.length), stroke: null, strokeWidth: 0, opacity: o.opacity });
          p.fxPart = 'contour'; p.fxStep = i + 1; // its place from the object outwards (inwards), for re-colouring
          return p;
        });
        const i = canvas.getObjects().indexOf(o);
        canvas.remove(o);
        const g = style(new Group(outside ? [...contours.reverse(), o] : [o, ...contours]), { toolName: 'Contour group' });
        g.name = `${o.name} contour`;
        g.fxContour = { dir, steps: ds.length, offset: fx.contourOffset, colour: fx.contourColour };
        canvas.insertAt(Math.max(1, i), g); out.push(g);
      }
    });
  } catch { toast('That object could not be contoured'); return; }
  select(out);
  if (mode === 'remove') toast('Contour removed: the original object again');
  else if (mode === 'break') toast('Contour broken apart: the object and each step are separate shapes now');
  else if (out.length) toast(`Contour ${centre ? 'to the centre' : outside ? 'outside' : 'inside'} added · change the settings and Apply again to adjust it · Remove takes it off`);
}
function applyShadow(remove = false) {
  const objs = active();
  if (!objs.length) { toast('Select objects for the shadow'); return; }
  const fx = state.fx, [r, g, b] = hexToRgb(fx.shadowColour);
  applyToSelection(remove ? { shadow: null } : { shadow: new Shadow({ color: `rgba(${r},${g},${b},${fx.shadowOpacity / 100})`, blur: fx.shadowBlur * MM, offsetX: fx.shadowX * MM, offsetY: fx.shadowY * MM }) }, remove ? 'Shadow removed' : 'Drop shadow applied');
}
// Inner Shadow (CorelDRAW): a soft shadow inside the object, along the edges the offset points away from, as if
// the object were pressed into the page. Like CorelDRAW's it is a picture, made from the object's own shape and
// kept inside it, grouped over the object (Multiply darkens the colours under it). Apply again changes it; Remove
// takes it off. Works on shapes, text, groups and pictures (their visible pixels).
function innerShadowImage(o, fx) {
  const b = o.getBoundingRect(), k = Math.min(4, 2400 / (Math.max(b.width, b.height) || 1)); // pixels per page unit
  const mask = o.toCanvasElement({ multiplier: k, enableRetinaScaling: false, withoutShadow: true });
  const W = mask.width, H = mask.height;
  if (!W || !H) return null;
  const blur = Math.max(0, fx.innerBlur * MM * k), dx = fx.innerX * MM * k, dy = fx.innerY * MM * k;
  const pad = Math.ceil(blur * 2 + Math.abs(dx) + Math.abs(dy)) + 2;
  // 1. The shadow colour everywhere except under the object moved by the offset (where light gets in).
  const s = document.createElement('canvas');
  s.width = W + pad * 2; s.height = H + pad * 2;
  const sc = s.getContext('2d');
  sc.fillStyle = fx.innerColour; sc.fillRect(0, 0, s.width, s.height);
  sc.globalCompositeOperation = 'destination-out'; sc.drawImage(mask, pad + dx, pad + dy);
  // 2. Softened (drawn as the shadow of a copy far off to the left, which works in every browser), then 3. kept
  // to the object's own shape.
  const t = document.createElement('canvas');
  t.width = W; t.height = H;
  const tc = t.getContext('2d');
  if (blur >= 0.5) { tc.shadowColor = fx.innerColour; tc.shadowBlur = blur; tc.shadowOffsetX = s.width + 20; tc.drawImage(s, -pad - s.width - 20, -pad); tc.shadowColor = 'transparent'; }
  else tc.drawImage(s, -pad, -pad);
  tc.globalCompositeOperation = 'destination-in'; tc.drawImage(mask, 0, 0);
  const c = o.getCenterPoint();
  const img = new FabricImage(t, { originX: 'center', originY: 'center', left: c.x, top: c.y, scaleX: b.width / W, scaleY: b.height / H, opacity: Math.max(0, Math.min(100, fx.innerOpacity)) / 100, globalCompositeOperation: fx.innerMerge === 'normal' ? 'source-over' : 'multiply' });
  // toCanvasElement draws the object in the middle of a canvas of its box (rounded up), k pixels per unit.
  img.set({ scaleX: 1 / k, scaleY: 1 / k });
  style(img, { toolName: 'Inner shadow' });
  img.fxPart = 'inner';
  return img;
}
function applyInner(remove = false) {
  const objs = active();
  if (!objs.length) { toast(NEEDS_SELECTION.inner); return; }
  const fx = state.fx, out = [];
  canvas.discardActiveObject();
  try {
    batch(() => {
      for (let o of objs) {
        // Applying again replaces the old inner shadow instead of stacking another one.
        if (o.fxInner) { const kids = o.removeAll(), keep = kids.find((x) => x.fxPart !== 'inner') ?? kids[0]; replaceObject(o, keep); o = keep; }
        if (remove) { out.push(o); continue; }
        const img = innerShadowImage(o, fx);
        if (!img) { out.push(o); continue; }
        const i = canvas.getObjects().indexOf(o);
        canvas.remove(o);
        const g = style(new Group([o, img]), { toolName: 'Inner shadow group' });
        g.fxInner = { x: fx.innerX, y: fx.innerY, blur: fx.innerBlur, opacity: fx.innerOpacity, colour: fx.innerColour, merge: fx.innerMerge };
        g.name = `${o.name} inner shadow`;
        canvas.insertAt(Math.max(1, i), g);
        out.push(g);
      }
    });
  } catch (err) { console.warn(err); toast('Could not add the inner shadow to that object'); return; }
  select(out);
  toast(remove ? 'Inner shadow removed' : 'Inner shadow added · change the settings and Apply again to adjust it · Remove takes it off');
}
function applyTransparency() {
  const fx = state.fx;
  if (!active().length) { toast('Select objects first'); return; }
  if (fx.transp === 'none') applyToSelection((o) => { if (o.gradSpec?.fade) { const c = o.gradSpec.from; delete o.gradSpec; return { opacity: 1, fill: c }; } return { opacity: 1 }; }, 'Transparency removed');
  else if (fx.transp === 'uniform') applyToSelection({ opacity: 1 - fx.transpValue / 100 }, `Transparency ${fx.transpValue}%`);
  else applyToSelection((o) => {
    // Linear: a fade along the angle; radial: solid in the middle, fading out to the edges.
    const c = o.gradSpec?.fade ? o.gradSpec.from : o.gradSpec && o.fill && typeof o.fill === 'object' ? hexOf(gradStops(o.gradSpec)[0].color) ?? solid(o) : solid(o), [r, g, b] = hexToRgb(c);
    o.gradSpec = { from: c, to: `rgba(${r},${g},${b},${1 - fx.transpValue / 100})`, angle: fx.transpAngle, kind: fx.transp === 'radial' ? 'radial' : 'linear', fade: true };
    return { fill: gradientFor(o), opacity: 1 };
  }, fx.transp === 'radial' ? 'Radial transparency applied' : 'Linear transparency applied');
  // Merge mode: how the objects mix with what is under them (CorelDRAW's transparency merge modes).
  const merge = fx.transpMerge === 'normal' || !fx.transpMerge ? 'source-over' : fx.transpMerge;
  for (const o of active()) o.set('globalCompositeOperation', merge);
  canvas.requestRenderAll();
  if (merge !== 'source-over') canvas.fire('object:modified', { target: active()[0] });
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
  text.pathGuide = d; text.pathDist = 0;
  // A text resized with its handles keeps its size: the scale goes into the font size before it is reset.
  const k = Math.abs(text.scaleY) || 1;
  if (k !== 1) text.set({ fontSize: text.fontSize * k });
  text.set({ path: guide, angle: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, originX: 'center', originY: 'center', pathAlign: 'baseline', pathSide: 'left', textAlign: 'left',
    pathStartOffset: Math.max(0, sp.closed ? length / 4 - tw / 2 : (length - tw) / 2) });
  text.initDimensions();
  if (text.textOutlines?.length) setTextOutlines(text, text.textOutlines);
  text.setPositionByOrigin(guide.getCenterPoint(), 'center', 'center');
  text.setCoords();
  canvas.setActiveObject(text);
  canvas.fire('object:modified', { target: text }); canvas.requestRenderAll();
  toast('Text fitted to the path (Text > Straighten text undoes it)');
}
function straightenText() {
  const t = active().filter(isText).filter((o) => o.path);
  if (!t.length) { toast('Select text that is on a path'); return; }
  for (const o of t) { delete o.pathGuide; delete o.pathDist; }
  applyToSelection((o) => (isText(o) ? { path: null, pathStartOffset: 0, pathSide: 'left', pathAlign: 'baseline' } : {}), 'Text straightened');
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
// The Shape tool's curve and the Variable Outline tool's outline count as selected (colours, outline width, Properties).
const active = () => (state.tool === 'node' && nodes.target ? [nodes.target] : state.tool === 'varline' && varEdit?.g && canvas.getObjects().includes(varEdit.g) ? [varEdit.g] : canvas.getActiveObjects());
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
  if (o.textOutlines?.length && Object.keys(p).some((k) => k.startsWith('stroke'))) {
    if (typeof p.stroke === 'string') setTextOutlines(o, [{ ...o.textOutlines[0], c: p.stroke }, ...o.textOutlines.slice(1)]);
    else if (p.stroke === null) setTextOutlines(o, []);
    const rest = Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('stroke')));
    if (Object.keys(rest).length) applyProps(o, rest);
    return;
  }
  if (o.varSpec && (p.stroke !== undefined || p.strokeWidth !== undefined)) {
    // A variable outline: the outline colour is its outline shape's fill; a new width scales all its widths.
    const s = o.varSpec, part = varPart(o);
    if (p.stroke !== undefined) { s.colour = typeof p.stroke === 'string' ? p.stroke : null; part?.set('fill', s.colour); o.dirty = true; }
    else if (p.strokeWidth > 0 && Math.abs(p.strokeWidth / MM - s.width) > 1e-6) { const f = p.strokeWidth / MM / s.width; s.pts = s.pts.map((q) => ({ ...q, w: q.w * f })); s.width = p.strokeWidth / MM; refreshVar(o); }
    const rest = Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('stroke')));
    if (Object.keys(rest).length) applyProps(o, rest);
    return;
  }
  if (o.paintSpec && typeof p.fill === 'string') { repaint(o, { colour: p.fill }); return; }
  if (o.type !== 'group' || !Object.keys(p).some((k) => PAINT_KEYS.has(k))) { o.set(p); return; }
  const done = new Set();
  for (const part of paintParts(o)) {
    const q = typeof props === 'function' ? props(part) : props;
    // A variable outline inside the group (grouped or merged with other objects) takes the settings itself, so a new
    // outline colour colours its outline shape instead of giving the object under it an ordinary outline.
    const vg = part.parent?.varSpec && part.parent !== o ? part.parent : null;
    if (vg) { if (!done.has(vg)) { done.add(vg); applyProps(vg, q); } continue; }
    part.set(Object.fromEntries(Object.entries(q).filter(([k]) => PAINT_KEYS.has(k))));
  }
  // A contour group: a new fill colour for the object blends its steps again, from that colour to the contour colour.
  if (o.fxContour && typeof p.fill === 'string') for (const k of o.getObjects()) if (k.fxPart === 'contour') k.set('fill', k.fxStep ? mix(p.fill, o.fxContour.colour, k.fxStep / o.fxContour.steps) : p.fill);
  o.set({ ...Object.fromEntries(Object.entries(p).filter(([k]) => !PAINT_KEYS.has(k))), dirty: true });
}
/**
 * A picture "filled" with a colour (palette, chat, eyedropper): it has no fill, so it is tinted in that colour, keeping
 * its light and shade (dark stays dark, highlights stay light), like a one-ink duotone in CorelDRAW. Undo restores it.
 */
async function tintImage(o, hex) {
  const pic = B.imagePixels(o, 2048), w = pic.canvas.width, h = pic.canvas.height, d = pic.ctx.getImageData(0, 0, w, h), px = d.data, [r, g, b] = hexToRgb(hex);
  for (let i = 0; i < px.length; i += 4) {
    const L = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
    if (L < 0.5) { const t = L * 2; px[i] = r * t; px[i + 1] = g * t; px[i + 2] = b * t; }
    else { const t = (L - 0.5) * 2; px[i] = r + (255 - r) * t; px[i + 1] = g + (255 - g) * t; px[i + 2] = b + (255 - b) * t; }
  }
  pic.ctx.putImageData(d, 0, 0);
  await replacePixels(o, pic);
}
/** The pictures a fill colour tints: the picture itself, or those in a group with nothing else to fill. */
const tintTargets = (o) => {
  if (o.type === 'image') return o.paintSpec ? [] : [o];
  const out = [];
  if (o.type === 'group' && !paintParts(o).length) eachPart(o, (x) => { if (x.type === 'image' && !x.paintSpec) out.push(x); });
  return out;
};
/** A solid fill or outline colour (eyedropper, palette): outlines for open lines; pictures are tinted. */
function paintObject(o, hex, outline) {
  if (!outline) { const pics = tintTargets(o); if (pics.length) { for (const x of pics) tintImage(x, hex); return; } }
  applyProps(o, (x) => {
    if (outline || x.type === 'line' || x.type === 'polyline' || (x.type === 'path' && !x.fill && x.stroke)) return { stroke: hex, strokeWidth: x.strokeWidth || MM / 2, strokeUniform: true };
    delete x.gradSpec; delete x.patSpec;
    return { fill: hex };
  });
}
/** The status bar shows the selection's IDs (#12; the name on hover): click to copy them for 3DEEZI ASSIST. */
function syncSelInfo() {
  const el = $('selInfo'), objs = active().filter((o) => o.num != null);
  el.hidden = !objs.length;
  if (!objs.length) return;
  const label = (o) => (isText(o) ? `“${String(o.text).slice(0, 30)}”` : o.name || o.toolName || o.type);
  el.textContent = `${objs.length > 1 ? 'IDs' : 'ID'}: ${objs.slice(0, 5).map((o) => `#${o.num}`).join(' ')}${objs.length > 5 ? ' …' : ''}`;
  el.title = `${objs.slice(0, 5).map((o) => `#${o.num} ${label(o)}`).join(', ')}${objs.length > 5 ? ' …' : ''} · click to copy, then use it in 3DEEZI ASSIST (e.g. "make #${objs[0].num} red")`;
}
/** Pages with big ID numbers (made before IDs were tidied, or after many edits) get #1, #2 … again, in the same order. */
function compactNums() {
  if (pages.length > 1) return; // pages came after IDs were tidied: nothing to close up
  const objs = userObjects(), withNum = objs.filter((o) => o.num != null).sort((a, b) => a.num - b.num), without = objs.filter((o) => o.num == null);
  const max = withNum.reduce((m, o) => Math.max(m, o.num), 0);
  if (!without.length && max <= objs.length * 1.5 + 10) return;
  let n = 0;
  for (const o of [...withNum, ...without]) {
    const old = o.num;
    o.num = ++n;
    // Inside a group, the part it was made from shares its ID; other parts' old numbers go.
    if (o.type === 'group') eachPart(o, (x) => { if (x === o) return; if (old != null && x.num === old) x.num = o.num; else delete x.num; });
  }
}
$('selInfo').onclick = () => {
  const list = active().filter((o) => o.num != null).map((o) => `#${o.num}`), ids = list.join(' ');
  if (!ids) return;
  navigator.clipboard?.writeText(ids).catch(() => {});
  toast(`Copied ${list.length > 1 ? 'IDs' : 'ID'} ${ids}`);
};
function syncProps() {
  const o = one();
  const has = active().length > 0;
  for (const id of ['del', 'dup', 'front', 'back', 'lock', 'alL', 'alC', 'alR', 'alT', 'alM', 'alB', 'flipH', 'flipV']) $(id).disabled = !has;
  $('group').disabled = active().length < 2 && one()?.type !== 'group';
  // A group shows the colours of its parts (a table: its cells and lines).
  const p = o?.type === 'group' ? paintParts(o)[0] ?? o : o;
  const fill = p && typeof p.fill === 'string' ? p.fill : state.fill;
  const gs = p ? (p.gradSpec && p.fill && typeof p.fill === 'object' ? p.gradSpec : null) : state.gradient;
  $('fillChip').style.background = gs ? `linear-gradient(90deg, ${cssStops(gs)})` : (p ? p.fill : state.fill) ? (typeof (p?.fill ?? state.fill) === 'string' ? fill : 'linear-gradient(110deg,#12E1F0,#1E7BFF)') : '';
  $('fillChip').classList.toggle('none', !!p && !p.fill);
  syncSelInfo();
  const vs = o?.varSpec ?? p?.parent?.varSpec, stroke = vs ? vs.colour : p ? p.stroke : state.strokeWidth ? state.stroke : null;
  $('strokeChip').style.background = stroke || '';
  $('strokeChip').classList.toggle('none', !stroke || !(vs ? vs.width : p ? p.strokeWidth : state.strokeWidth));
  $('strokeWidth').value = String(vs ? +vs.width.toFixed(2) : p ? +(p.strokeWidth / MM).toFixed(2) : state.strokeWidth);
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
  if (o && isText(o)) syncOutlineFly();
  $('rectProps').style.display = o && o.type === 'rect' ? 'flex' : 'none';
  $('outlineProps').style.display = o && o.type !== 'image' && !o.textOutlines?.length ? 'flex' : 'none';
  $('imgProps').style.display = o && o.type === 'image' ? 'flex' : 'none';
  if (o?.type === 'image') showAdjust(B.readAdjust(o));
  $('tableProps').style.display = o?.tableSpec ? 'flex' : 'none';
  if (o?.tableSpec) showTableCells(o);
  if (o) {
    $('pName').value = o.name ?? '';
    $('pAngle').value = String(Math.round(o.angle || 0));
    if (isText(o)) { $('pFont').value = o.fontFamily; $('pSize').value = String(Math.round(o.fontSize / MM)); syncWeights(o.fontFamily, Number(o.fontWeight) || 400); $('pSpacing').value = String(Math.round((o.charSpacing || 0) / 10)); $('pLine').value = String(Math.round(((o.lineHeight || LINE_NORMAL) / LINE_NORMAL) * 100)); }
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
$('pSpacing').onchange = (e) => applyToSelection({ charSpacing: Math.max(-50, Math.min(500, Number(e.target.value) || 0)) * 10 });
$('pLine').onchange = (e) => applyToSelection({ lineHeight: (Math.max(50, Math.min(400, Number(e.target.value) || 100)) / 100) * LINE_NORMAL });
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
  // Connectors copied together with their objects join the copies.
  const copyOf = new Map(source.map((o, i) => [o.uid, clones[i].uid]).filter(([a, b]) => a && b && a !== b));
  for (const c of clones) if (c.connSpec) c.connSpec.ends = c.connSpec.ends.map((e) => (e?.uid && copyOf.has(e.uid) ? { ...e, uid: copyOf.get(e.uid) } : e));
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
  const connSel = pick && n >= 1 && sel.every((x) => x.connSpec), connOn = !!CONN_TOOLS[t] || connSel;
  show('ctx-conn', connOn);
  if (connOn) {
    const cs = connSel ? sel[0].connSpec : { kind: CONN_TOOLS[t], radius: state.conn.radius, arrows: state.conn.arrows };
    show('connTypeWrap', connSel); $('connType').value = cs.kind;
    show('connRadiusWrap', cs.kind === 'rounded'); $('connRadius').value = String(cs.radius ?? state.conn.radius); $('connArrows').value = cs.arrows ?? 'none';
  }
  show('ctx-anchor', t === 'anchor');
  const varOn = t === 'varline' || (pick && n === 1 && !!o?.varSpec);
  show('ctx-var', varOn);
  if (varOn) syncVarBar();
  if (t === 'anchor') { $('anchorDel').disabled = !connView?.sel; $('anchorReset').disabled = !connView?.sel; }
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
  show('ctx-blend', t === 'blend'); show('ctx-contour', t === 'contour'); show('ctx-shadow', t === 'shadow'); show('ctx-inner', t === 'inner'); show('ctx-transp', t === 'transparency');
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
$('fxCDir').onchange = (e) => { state.fx.contourDir = e.target.value; $('fxCStepsWrap').hidden = e.target.value === 'centre'; savePrefs(); };
$('fxCColour').oninput = (e) => { state.fx.contourColour = e.target.value; savePrefs(); };
for (const [id, k] of [['fxSX', 'shadowX'], ['fxSY', 'shadowY'], ['fxSBlur', 'shadowBlur'], ['fxSOpacity', 'shadowOpacity']]) bindNumber(id, (v) => { state.fx[k] = v; });
$('fxSColour').oninput = (e) => { state.fx.shadowColour = e.target.value; savePrefs(); };
$('fxTType').onchange = (e) => { state.fx.transp = e.target.value; $('fxTAngleWrap').hidden = e.target.value !== 'linear'; savePrefs(); };
$('fxTMerge').onchange = (e) => { state.fx.transpMerge = e.target.value; savePrefs(); };
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
$('fxBlend').onclick = applyBlend; $('fxContour').onclick = () => applyContour('apply'); $('fxContourOff').onclick = () => applyContour('remove'); $('fxContourBreak').onclick = () => applyContour('break');
$('fxShadow').onclick = () => applyShadow(false); $('fxShadowOff').onclick = () => applyShadow(true);
$('fxInner').onclick = () => applyInner(false); $('fxInnerOff').onclick = () => applyInner(true);
for (const [id, key] of [['fxIX', 'innerX'], ['fxIY', 'innerY'], ['fxIBlur', 'innerBlur'], ['fxIOpacity', 'innerOpacity']]) bindNumber(id, (v) => { state.fx[key] = key === 'innerBlur' ? Math.max(0, v) : key === 'innerOpacity' ? Math.max(0, Math.min(100, v)) : v; });
$('fxIColour').oninput = (e) => { state.fx.innerColour = e.target.value; savePrefs(); };
$('fxIMerge').onchange = (e) => { state.fx.innerMerge = e.target.value; savePrefs(); };
$('fxTransp').onclick = applyTransparency;
document.querySelectorAll('[data-node]').forEach((b) => (b.onclick = () => nodes.op(b.dataset.node)));
document.querySelectorAll('[data-shaping]').forEach((b) => (b.onclick = () => shaping(b.dataset.shaping)));
function initContextValues() {
  const s = state.shape, f = state.fx;
  $('cRevs').value = String(s.revs); $('cSpiralType').value = s.log ? 'log' : 'sym'; $('cExpand').value = String(s.expand); $('cExpandWrap').hidden = !s.log;
  $('cCols').value = String(s.cols); $('cRows').value = String(s.rows); $('cRadius').value = String(s.radius);
  $('fxSteps').value = String(f.blendSteps); $('fxCDir').value = f.contourDir; $('fxCStepsWrap').hidden = f.contourDir === 'centre'; $('fxCSteps').value = String(f.contourSteps); $('fxCOffset').value = String(f.contourOffset); $('fxCColour').value = f.contourColour;
  $('fxSX').value = String(f.shadowX); $('fxSY').value = String(f.shadowY); $('fxSBlur').value = String(f.shadowBlur); $('fxSOpacity').value = String(f.shadowOpacity); $('fxSColour').value = f.shadowColour;
  $('fxIX').value = String(f.innerX); $('fxIY').value = String(f.innerY); $('fxIBlur').value = String(f.innerBlur); $('fxIOpacity').value = String(f.innerOpacity); $('fxIColour').value = f.innerColour; $('fxIMerge').value = f.innerMerge;
  $('fxTType').value = f.transp; $('fxTValue').value = String(f.transpValue); $('fxTAngle').value = String(f.transpAngle); $('fxTAngleWrap').hidden = f.transp !== 'linear'; $('fxTMerge').value = f.transpMerge ?? 'normal';
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
  if (state.gradient && state.target === 'fill') gradStopColour(hex);
  if (apply) {
    if (state.target === 'fill') applyToSelection((o) => {
      if (o.type === 'line' || o.type === 'polyline' || (o.type === 'path' && !o.fill && o.stroke)) return { stroke: hex };
      if (state.gradient) { o.gradSpec = cloneGrad(state.gradient); delete o.patSpec; return { fill: gradientFor(o) }; }
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
/** Briefly rings a colour in the Colour tab's palette: the one just added, or the one already there. */
function flashSwatch(c) {
  const b = [...$('brandSw').querySelectorAll('.sw[data-c]')].reverse().find((x) => x.dataset.c === c);
  if (!b) return;
  b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
  b.scrollIntoView({ block: 'nearest' });
}
/** The colour the picker shows (its hex box): what + adds. */
const shownColour = () => { const v = $('hexIn').value.trim().toUpperCase(); return /^#[0-9A-F]{6}$/.test(v) ? v : current(); };
function renderSwatches() {
  const sw = (box, c, remove) => {
    const b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.dataset.c = c; b.title = remove ? `${c} · right-click: remove it from this palette` : c; b.onclick = () => setColour(c);
    if (remove) b.oncontextmenu = (e) => { e.preventDefault(); remove(c); };
    box.append(b);
  };
  const addBtn = (box, title, fn) => { const b = document.createElement('button'); b.className = 'sw add'; b.title = title; b.innerHTML = icon('plus'); b.onclick = fn; box.append(b); };
  const brand = $('brandSw'), pal = currentPalette();
  brand.innerHTML = '';
  if (pal) {
    for (const c of pal.colours) sw(brand, c, (x) => paletteRemoveColour(pal, x));
    addBtn(brand, `Add the colour shown in the picker to ${pal.name} (it goes at the end)`, () => {
      const c = shownColour(), had = pal.colours.includes(c);
      if (!had && pal.colours.length >= 40) { toast('A palette holds up to 40 colours: right-click one to remove it first'); return; }
      if (!had) paletteAddColours(pal, [c]);
      flashSwatch(c);
      toast(had ? `${c} is already in ${pal.name}` : `${c} added at the end of ${pal.name} (saved on this device)`);
    });
  } else {
    for (const c of BRAND) sw(brand, c);
    for (const c of state.saved) sw(brand, c, (x) => { state.saved = state.saved.filter((y) => y !== x); savePrefs(); renderSwatches(); toast(`${x} removed from your colours`); });
    addBtn(brand, 'Save the colour shown in the picker (it goes at the end)', () => {
      const c = shownColour(), had = BRAND.includes(c) || state.saved.includes(c);
      if (!had) { state.saved = [...state.saved, c].slice(-24); savePrefs(); renderSwatches(); }
      flashSwatch(c);
      toast(had ? `${c} is already in this palette` : `${c} added at the end of your colours (saved on this device)`);
    });
  }
  const recent = $('recentSw');
  recent.innerHTML = '';
  for (const c of state.recent.length ? state.recent : ['#12E1F0', '#1E7BFF', '#7B4DFF', '#5D6B7B', '#000000', '#FFFFFF']) sw(recent, c);
}
// ===================================================================
// Saved palettes (brand / team colours): named lists of colours, kept on this device for every design. The one
// picked shows in the Colour tab and at the start of the bottom palette. Made from the current colour, the
// selection's colours or every colour in the design; + adds a colour, right-click removes one.
// ===================================================================
state.palettes = (Array.isArray(state.palettes) ? state.palettes : []).filter((p) => p && typeof p.name === 'string' && p.name.trim() && Array.isArray(p.colours))
  .map((p) => ({ name: p.name.trim().slice(0, 40), colours: [...new Set(p.colours.map(hexOf).filter(Boolean))] }));
state.gradients = (Array.isArray(state.gradients) ? state.gradients : []).filter((g) => g && Array.isArray(g.stops) && g.stops.length >= 2);
const findPalette = (name) => state.palettes.find((p) => p.name.toLowerCase() === String(name).trim().toLowerCase()) ?? null;
const currentPalette = () => (state.palette ? findPalette(state.palette) : null);
/** The fill (or gradient) and outline colours some objects use, most used first. */
function coloursOf(objs) {
  const count = new Map(), add = (c) => { const h = hexOf(c); if (h) count.set(h, (count.get(h) ?? 0) + 1); };
  const walk = (o) => {
    if (o.type === 'group') { o.getObjects().forEach(walk); return; }
    if (o.type === 'image') return;
    if (o.gradSpec && !o.gradSpec.fade && o.fill && typeof o.fill === 'object') gradStops(o.gradSpec).forEach((s) => add(s.color)); else add(o.fill);
    if (o.strokeWidth) add(o.stroke);
  };
  objs.forEach(walk);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
function usePalette(name) { state.palette = name ? findPalette(name)?.name ?? '' : ''; savePrefs(); renderPalettes(); }
/** Saves a palette under that name (a palette with the same name is replaced) and shows it. */
function savePalette(name, colours) {
  name = String(name).trim().slice(0, 40);
  const cols = [...new Set(colours.map(hexOf).filter(Boolean))].slice(0, 40);
  let p = findPalette(name);
  if (p) p.colours = cols; else { p = { name, colours: cols }; state.palettes.push(p); }
  state.palette = p.name; savePrefs(); renderPalettes();
  return p;
}
function paletteAddColours(p, colours) { p.colours = [...new Set([...p.colours, ...colours.map(hexOf).filter(Boolean)])].slice(0, 40); savePrefs(); renderPalettes(); }
function paletteRemoveColour(p, c) { p.colours = p.colours.filter((x) => x !== c); savePrefs(); renderPalettes(); toast(`${c} removed from ${p.name}`); }
function renderPalPick() {
  const sel = $('palPick'), cur = currentPalette();
  sel.innerHTML = '';
  const opt = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; sel.append(o); };
  opt('', '3DEEZI + my colours');
  for (const p of state.palettes) opt(`p:${p.name}`, `${p.name} (${p.colours.length})`);
  opt('new', 'New palette…'); opt('doc', 'New palette from this design');
  sel.value = cur ? `p:${cur.name}` : '';
  $('palRename').hidden = $('palDelete').hidden = !cur;
  $('palAsk').hidden = true;
}
/** The picked palette at the start of the bottom palette, with its name. */
function renderBrandBar() {
  const box = $('palBrand'), p = currentPalette();
  box.querySelectorAll('.pc').forEach((b) => b.remove());
  box.hidden = !p?.colours.length;
  if (!p) return;
  $('palBrandName').textContent = p.name;
  for (const c of p.colours) box.append(paletteSwatch(`${p.name}:`, c));
}
function renderPalettes() { renderPalPick(); renderSwatches(); renderBrandBar(); }
let palNaming = null;
function askPalName(value) { $('palAsk').hidden = true; $('palNameRow').hidden = false; $('palNameRow').scrollIntoView({ block: 'nearest' }); const i = $('palName'); i.value = value; i.focus({ preventScroll: true }); i.select(); }
function endPalName(ok) {
  const n = palNaming, name = $('palName').value.trim().slice(0, 40);
  palNaming = null; $('palNameRow').hidden = true;
  if (ok && n && name) {
    const p = currentPalette(), clash = findPalette(name);
    if (n.mode === 'rename') {
      if (clash && clash !== p) toast(`There is already a palette called ${clash.name}`);
      else if (p) { p.name = name; state.palette = name; savePrefs(); toast(`Palette renamed ${name}`); }
    } else {
      const q = savePalette(name, n.colours);
      toast(`${clash ? 'Palette replaced' : 'Palette saved'}: ${q.name}, ${q.colours.length} colour${q.colours.length > 1 ? 's' : ''} (also at the start of the bottom palette)`);
    }
  }
  renderPalettes();
}
$('palPick').onchange = (e) => {
  const v = e.target.value;
  if (v === 'new' || v === 'doc') {
    const cols = v === 'doc' ? coloursOf(userObjects()) : active().length ? coloursOf(active()) : [shownColour()];
    if (!cols.length) { toast('There are no colours in this design yet'); renderPalPick(); return; }
    palNaming = { mode: 'new', colours: cols };
    let k = state.palettes.length + 1;
    while (findPalette(`Palette ${k}`)) k++;
    askPalName(v === 'doc' ? 'Design colours' : `Palette ${k}`);
    return;
  }
  usePalette(v.startsWith('p:') ? v.slice(2) : '');
};
$('palName').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') endPalName(true); else if (e.key === 'Escape') endPalName(false); };
$('palNameOk').onclick = () => endPalName(true);
$('palNameCancel').onclick = () => endPalName(false);
$('palRename').onclick = () => { if (!currentPalette()) return; palNaming = { mode: 'rename' }; askPalName(currentPalette().name); };
// Delete asks first in the panel, with Delete / Cancel (pop-up dialogs don't show in the phone app).
$('palDelete').onclick = () => {
  const p = currentPalette();
  if (!p) return;
  $('palNameRow').hidden = true; palNaming = null;
  $('palAskText').textContent = `Delete the palette ${p.name}? Its colours stay on your objects.`;
  $('palAsk').hidden = false;
  $('palAsk').scrollIntoView({ block: 'nearest' });
};
$('palAskNo').onclick = () => { $('palAsk').hidden = true; };
$('palAskYes').onclick = () => {
  const p = currentPalette();
  $('palAsk').hidden = true;
  if (!p) return;
  state.palettes = state.palettes.filter((x) => x !== p); state.palette = ''; savePrefs(); renderPalettes(); toast(`Palette ${p.name} deleted`);
};
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
    if (o.gradSpec && !o.gradSpec.fade && o.fill && typeof o.fill === 'object') for (const s of gradStops(o.gradSpec)) { const h = hexOf(s.color); if (h) found.add(h); }
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
  const base = hexToHsv(shownColour()), box = $('harmony'); // the colour the picker shows
  const at = (dh, v = base.v) => hsvToHex({ ...base, h: (base.h + dh + 360) % 360, v: Math.max(0, Math.min(1, v)) });
  const other = base.v < 0.5 ? base.v + (1 - base.v) * 0.55 : base.v * 0.65; // a lighter (dark colours) or darker version
  const shades = [0, 1, 2, 3, 4].map((i) => hsvToHex({ ...base, v: Math.max(0.12, Math.min(1, 0.3 + i * 0.17)) }));
  let mode = $('harmonyMode').value;
  if (base.s < 0.08 && mode !== 'shades') mode = 'grey'; // grey, black and white have no hue to turn
  const list = {
    analogous: [-30, -15, 0, 15, 30].map((d) => at(d)), // neighbours on the colour wheel
    complementary: [at(0), at(0, other), at(180), at(180, other)], // the colour and its opposite, each with a lighter or darker version
    triadic: [at(0), at(120), at(240)], // three colours evenly spaced around the colour wheel
    shades, grey: shades,
  }[mode];
  box.innerHTML = '';
  box.title = mode === 'grey' ? 'Grey, black and white have no hue: these are its shades' : '';
  for (const c of list) { const b = document.createElement('button'); b.style.background = c; b.title = c; b.onclick = () => setColour(c); box.append(b); }
}
$('harmonyMode').onchange = drawHarmony;
// ===================================================================
// Gradients (Colour tab) with any number of colours. Click the bar to add a colour, drag a marker to move it, drag it
// off the bar or double-click it to remove it; the colour picker colours the picked marker. Selecting an object with a
// gradient shows its gradient here to edit (anything else, or nothing, puts back the fill mode you had). Ready-made
// and saved gradients under the bar.
// ===================================================================
const GRAD_PRESETS = [
  ['3DEEZI', ['#12E1F0', '#1E7BFF', '#7B4DFF']], ['Fire', ['#FFE100', '#FF6A13', '#E10600']], ['Ocean', ['#4AB3E6', '#1E4FD8', '#0B1F41']],
  ['Sunset', ['#FFB81C', '#E6007E', '#5B2C8F']], ['Forest', ['#9ACD32', '#00843D', '#1F4D2B']],
  ['Chrome', [['#36454F', 0], ['#E6E6E6', 0.4], ['#FFFFFF', 0.5], ['#999999', 0.62], ['#36454F', 1]]],
  ['Gold', [['#7A5C12', 0], ['#FFE58A', 0.45], ['#C5B358', 0.6], ['#7A5C12', 1]]],
  ['Rainbow', ['#E10600', '#FF6A13', '#FFE100', '#00843D', '#1E4FD8', '#5B2C8F']],
];
const evenStops = (cols) => cols.map((c, i) => (Array.isArray(c) ? { color: c[0], offset: c[1] } : { color: c, offset: cols.length > 1 ? i / (cols.length - 1) : 0 }));
let gradActive = 0, gradDraft = null, gradHeld = null, gradDrag = null, gradLastDown = { t: 0 };
/** The gradient for the fill mode chosen (its colours: the gradient being edited, or the last one). */
const gradientSpec = () => {
  const stops = gradStops(state.gradient ?? { stops: gradDraft ?? [{ offset: 0, color: state.fill }, { offset: 1, color: '#7B4DFF' }] });
  return { from: stops[0].color, to: stops.at(-1).color, stops, angle: Number($('gradAngle').value) || 0, kind: $('fillMode').value === 'radial' ? 'radial' : 'linear' };
};
const gradAt = (e) => { const r = $('gradTrack').getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
/** The colour the gradient has at a point (a new marker takes it, so the gradient looks the same). */
function gradColourAt(stops, t) {
  const j = stops.findIndex((s) => s.offset >= t);
  if (j <= 0) return stops[j < 0 ? stops.length - 1 : 0].color;
  const a = stops[j - 1], b = stops[j], A = hexOf(a.color), B = hexOf(b.color);
  return A && B ? mix(A, B, b.offset > a.offset ? (t - a.offset) / (b.offset - a.offset) : 0).toUpperCase() : b.color;
}
function renderGradEditor() {
  const g = state.gradient;
  if (!g) return;
  const d = gradDrag, stops = d?.stops ?? gradStops(g), on = d ? d.i : Math.max(0, Math.min(gradActive, stops.length - 1)), focused = document.activeElement?.classList.contains('grad-stop');
  if (!d) gradActive = on;
  $('gradTrack').style.background = `linear-gradient(90deg, ${cssStops(g)})`;
  $('gradStops').replaceChildren(...stops.map((s, i) => {
    const b = document.createElement('button'), hex = hexOf(s.color) ?? s.color, at = Math.round(s.offset * 100);
    b.className = `grad-stop${i === on ? ' on' : ''}${d?.off && i === on ? ' off' : ''}`;
    b.style.left = `${s.offset * 100}%`; b.style.setProperty('--c', s.color); b.dataset.i = String(i);
    b.title = `Colour ${hex} at ${at}% · click to pick it · drag sideways to move it · double-click (or Delete) to remove it`;
    b.setAttribute('aria-label', `Gradient colour ${i + 1} of ${stops.length}: ${hex} at ${at}%`);
    return b;
  }));
  if (focused || d) $('gradStops').children[on]?.focus({ preventScroll: true });
  if (document.activeElement !== $('gradPos')) $('gradPos').value = String(Math.round(stops[on].offset * 100));
  if (document.activeElement !== $('gradAngle')) $('gradAngle').value = String(g.angle ?? 0);
  $('gradDel').disabled = stops.length <= 2;
  $('gradAngleBox').hidden = g.kind === 'radial';
}
/** The editor's gradient on the selected objects: only redrawn while dragging, one Undo step when it is let go. */
function gradApply(commit) {
  const objs = active();
  if (!objs.length || !state.gradient) return;
  for (const o of objs) { applyProps(o, (x) => { if (!fillable(x) || x.type === 'image') return {}; delete x.patSpec; x.gradSpec = cloneGrad(state.gradient); return { fill: gradientFor(x) }; }); o.setCoords(); }
  canvas.requestRenderAll();
  if (commit) canvas.fire('object:modified', { target: objs[0] });
}
/** New gradient colours (any order): sorted, shown, put on the selection; the colour at index `pick` stays picked. */
function gradSet(stops, pick = gradActive, commit = true) {
  const list = stops.map((s) => ({ offset: Math.round(Math.min(1, Math.max(0, s.offset)) * 1000) / 1000, color: s.color })), keep = list[pick];
  list.sort((a, b) => a.offset - b.offset);
  gradActive = Math.max(0, list.indexOf(keep));
  state.gradient = { ...state.gradient, stops: list, from: list[0].color, to: list.at(-1).color };
  gradDraft = list;
  renderGradEditor();
  gradApply(commit);
}
/** The picker colours the picked marker. */
function gradStopColour(hex) {
  const st = gradStops(state.gradient);
  st[Math.min(gradActive, st.length - 1)].color = hex;
  state.gradient = { ...state.gradient, stops: st, from: st[0].color, to: st.at(-1).color };
  gradDraft = st;
  renderGradEditor();
}
/** A colour shown in the picker only (the current colour stays as it is). */
function showPicker(hex) { hsv = hexToHsv(hex); $('hexIn').value = hex; $('hexChip').style.background = hex; showValues(hex); drawPicker(); drawHarmony(); }
/** Picks a marker: its colour shows in the picker (Fill), ready to change. */
function pickStop(i) {
  gradActive = i;
  if (state.target !== 'fill') setTarget('fill');
  const hex = hexOf(gradStops(state.gradient)[i]?.color);
  if (hex) showPicker(hex);
  renderGradEditor();
}
function gradRemove(i = gradActive) {
  const st = gradStops(state.gradient);
  if (st.length <= 2) { toast('A gradient needs at least two colours'); return; }
  st.splice(i, 1);
  gradSet(st, Math.min(i, st.length - 1));
  pickStop(gradActive);
  toast('Colour removed from the gradient');
}
// After a click on the colour strip (a colour square picked), Delete removes that colour, not the object, until you
// click outside the Colour tab or select something else.
let gradKeys = false;
document.addEventListener('pointerdown', (e) => { const t = e.target; gradKeys = t.closest?.('#gradBar') ? true : t.closest?.('#pane-colour') ? gradKeys : false; }, true);
$('gradBar').addEventListener('pointerdown', (e) => {
  if (!state.gradient || e.button > 0) return;
  e.preventDefault();
  const hit = e.target.closest('.grad-stop'), stops = gradStops(state.gradient), now = Date.now();
  let i;
  if (hit) {
    i = Number(hit.dataset.i);
    // A second click on the same spot soon after (a double-click): remove that colour.
    if (!gradLastDown.added && now - gradLastDown.t < 550 && Math.hypot(e.clientX - gradLastDown.x, e.clientY - gradLastDown.y) < 8) { gradLastDown = { t: 0 }; gradRemove(i); return; }
    gradActive = i;
  } else {
    const t = gradAt(e), s = { offset: t, color: gradColourAt(stops, t) };
    stops.push(s); stops.sort((a, b) => a.offset - b.offset); i = stops.indexOf(s);
    gradSet(stops, i, false);
  }
  gradLastDown = { t: now, x: e.clientX, y: e.clientY, added: !hit };
  pickStop(gradActive);
  gradDrag = { stops: gradStops(state.gradient), i: gradActive, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, off: false, added: !hit };
  $('gradBar').setPointerCapture(e.pointerId);
  renderGradEditor();
});
$('gradBar').addEventListener('pointermove', (e) => {
  const d = gradDrag;
  if (!d || e.pointerId !== d.id || (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3)) return;
  d.moved = true;
  const r = $('gradBar').getBoundingClientRect(), s = d.stops[d.i];
  d.off = d.stops.length > 2 && (e.clientY < r.top - 28 || e.clientY > r.bottom + 28);
  s.offset = gradAt(e);
  d.stops.sort((a, b) => a.offset - b.offset); d.i = d.stops.indexOf(s);
  const list = d.off ? d.stops.filter((x) => x !== s) : d.stops;
  state.gradient = { ...state.gradient, stops: list.map((x) => ({ ...x })), from: list[0].color, to: list.at(-1).color };
  gradActive = d.i;
  renderGradEditor(); gradApply(false);
  hint(d.off ? 'Let go to remove this colour from the gradient' : `Gradient colour at ${Math.round(s.offset * 100)}%`);
});
const gradUp = (e) => {
  const d = gradDrag;
  if (!d || e.pointerId !== d.id) return;
  gradDrag = null; hint('');
  if (d.off) { gradSet(d.stops, d.i, false); gradRemove(d.i); return; }
  gradSet(d.stops, d.i, d.moved || d.added);
};
$('gradBar').addEventListener('pointerup', gradUp);
$('gradBar').addEventListener('pointercancel', gradUp);
$('gradStops').addEventListener('keydown', (e) => {
  const b = e.target.closest('.grad-stop');
  if (!b || !state.gradient) return;
  const i = Number(b.dataset.i);
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); gradRemove(i); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault(); e.stopPropagation();
    const st = gradStops(state.gradient);
    st[i].offset += (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.1 : 0.01);
    gradSet(st, i);
  }
});
$('gradPos').onchange = () => { if (!state.gradient) return; const st = gradStops(state.gradient); st[Math.min(gradActive, st.length - 1)].offset = Math.min(100, Math.max(0, Number($('gradPos').value) || 0)) / 100; gradSet(st); };
$('gradAngle').oninput = () => { if (!state.gradient) return; state.gradient = { ...state.gradient, angle: Number($('gradAngle').value) || 0 }; gradApply(false); };
$('gradAngle').onchange = () => { if (state.gradient) gradApply(true); };
for (const id of ['gradPos', 'gradAngle']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
$('gradRev').onclick = () => { if (!state.gradient) return; const st = gradStops(state.gradient).map((s) => ({ ...s, offset: 1 - s.offset })).reverse(); gradSet(st, st.length - 1 - Math.min(gradActive, st.length - 1)); pickStop(gradActive); toast('Gradient reversed'); };
$('gradEven').onclick = () => { if (!state.gradient) return; const st = gradStops(state.gradient); st.forEach((s, k) => { s.offset = k / (st.length - 1); }); gradSet(st); toast('Colours spaced evenly'); };
$('gradDel').onclick = () => gradRemove();
/** A ready-made or saved gradient: used for the selection and new objects. */
function useGradient(stops, name) {
  if (!state.gradient) { $('fillMode').value = 'gradient'; state.gradient = gradientSpec(); state.pattern = null; gradHeld = null; showFillRows(); }
  gradSet(stops.map((s) => ({ ...s })), 0);
  pickStop(0);
  toast(`Gradient: ${name}`);
}
function renderGradPresets() {
  const box = $('gradPresets');
  box.innerHTML = '';
  const chip = (name, stops, saved) => {
    const b = document.createElement('button');
    b.style.background = `linear-gradient(90deg, ${cssStops({ stops })})`;
    b.title = `${name} · click: use this gradient${saved ? ' · double-click or right-click: remove it' : ''}`;
    b.onclick = () => useGradient(stops, name);
    if (saved) b.oncontextmenu = b.ondblclick = (e) => { e.preventDefault(); state.gradients = state.gradients.filter((g) => g !== saved); savePrefs(); renderGradPresets(); toast(`${name} removed from your gradients (+ saves the gradient again)`); };
    box.append(b);
  };
  for (const [name, cols] of GRAD_PRESETS) chip(name, evenStops(cols));
  for (const g of state.gradients) chip(g.name, g.stops, g);
  const add = document.createElement('button');
  add.className = 'add'; add.innerHTML = icon('plus'); add.title = 'Save this gradient (double-click a saved one to remove it)';
  add.onclick = () => {
    if (!state.gradient) return;
    let k = 1;
    while (state.gradients.some((g) => g.name === `My gradient ${k}`)) k++;
    state.gradients = [...state.gradients, { name: `My gradient ${k}`, stops: gradStops(state.gradient) }].slice(-12);
    savePrefs(); renderGradPresets(); toast(`Saved as My gradient ${k}: it is with the ready-made gradients`);
  };
  box.append(add);
}
function showFillRows() {
  $('gradRow').style.display = state.gradient ? 'flex' : 'none';
  $('patRow').style.display = state.pattern ? 'grid' : 'none';
  renderGradEditor();
}
/** The gradient of the (first) selected object, when it has one (not a transparency fade). */
function selGradient() {
  const o = active()[0], p = o ? (o.type === 'group' ? paintParts(o)[0] : o) : null;
  return p?.gradSpec && !p.gradSpec.fade && p.fill && typeof p.fill === 'object' && p.fill.colorStops ? p.gradSpec : null;
}
function syncGradFromSelection() {
  if (gradDrag) return;
  gradKeys = false;
  const spec = selGradient();
  if (spec) {
    gradHeld ??= { mode: $('fillMode').value, gradient: state.gradient, pattern: state.pattern, active: gradActive };
    state.gradient = { ...cloneGrad(spec), stops: gradStops(spec), kind: gradKind(spec), angle: spec.angle ?? 0 };
    delete state.gradient.type;
    state.pattern = null; gradDraft = state.gradient.stops;
    $('fillMode').value = state.gradient.kind === 'radial' ? 'radial' : 'gradient';
    showFillRows();
    const hex = state.target === 'fill' && hexOf(state.gradient.stops[gradActive]?.color);
    if (hex) showPicker(hex);
  } else if (gradHeld) {
    const h = gradHeld;
    gradHeld = null;
    $('fillMode').value = h.mode; state.gradient = h.gradient; state.pattern = h.pattern; gradActive = h.active;
    if (state.gradient) gradDraft = gradStops(state.gradient);
    showFillRows();
    showPicker(current());
  }
}
for (const ev of ['selection:created', 'selection:updated', 'selection:cleared']) canvas.on(ev, syncGradFromSelection);
const patternSpec = () => ({ kind: $('patKind').value, size: Math.max(2, Math.min(100, Number($('patSize').value) || 10)), bg: $('patBg').value });
/** Fill for one object in the current fill mode (uniform, gradient or pattern). */
function modeFill(o) {
  delete o.gradSpec; delete o.patSpec;
  if (state.gradient) { o.gradSpec = cloneGrad(state.gradient); return { fill: gradientFor(o) }; }
  if (state.pattern) { o.patSpec = { ...state.pattern, ink: state.fill }; return { fill: patternFor(o.patSpec) }; }
  return { fill: state.fill };
}
const fillable = (o) => !(o.type === 'line' || o.type === 'polyline' || (o.type === 'path' && !o.fill && o.stroke));
$('fillMode').onchange = (e) => {
  const mode = e.target.value;
  gradHeld = null; // chosen here: it stays when the selection changes
  if (state.gradient) gradDraft = gradStops(state.gradient);
  state.gradient = mode === 'gradient' || mode === 'radial' ? gradientSpec() : null;
  state.pattern = mode === 'pattern' ? patternSpec() : null;
  if (state.gradient) gradActive = Math.min(gradActive, state.gradient.stops.length - 1);
  showFillRows();
  applyToSelection((o) => (fillable(o) ? modeFill(o) : {}));
};
for (const id of ['patKind', 'patSize', 'patBg']) $(id).onchange = () => { if (!state.pattern) return; state.pattern = patternSpec(); applyToSelection((o) => (fillable(o) ? modeFill(o) : {})); };

// ===================================================================
// Export, send to studio, pages
// ===================================================================
/**
 * The box around the artwork. `onPage`: only what is on the page, cut at its edges (drawings left on the work
 * area around it are not part of the design).
 */
function contentBounds({ onPage = false } = {}) {
  let rects = userObjects().filter((o) => o.visible).map((o) => o.getBoundingRect());
  if (onPage) {
    rects = rects.map((r) => {
      const left = Math.max(0, r.left), top = Math.max(0, r.top);
      const right = Math.min(page.width, r.left + r.width), bottom = Math.min(page.height, r.top + r.height);
      return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
    }).filter(Boolean);
  }
  if (!rects.length) return null;
  const left = Math.min(...rects.map((r) => r.left)), top = Math.min(...rects.map((r) => r.top));
  return { left, top, width: Math.max(...rects.map((r) => r.left + r.width)) - left, height: Math.max(...rects.map((r) => r.top + r.height)) - top };
}
/** Why there is nothing to export or send: an empty page, or artwork only on the work area around it. */
const nothingOnPage = (empty) => (contentBounds() ? 'Nothing is on the page: move the artwork onto the white page first' : empty);
/** PNG of the artwork. `whole` = the full page at 300 DPI (capped), otherwise trimmed to the artwork on the page. */
function renderPng({ whole = false, maxPx = 2048, background = null } = {}) {
  canvas.discardActiveObject();
  const box = whole ? { left: 0, top: 0, width: page.width, height: page.height } : contentBounds({ onPage: true });
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
  if (!data) { toast(nothingOnPage('The page is empty')); return; }
  download(data, whole ? '3deezi-artboard-page.png' : '3deezi-artwork.png');
  toast(whole ? 'Page exported (white background, 300 DPI up to 4096 px)' : 'Artwork exported (transparent PNG)');
}
/** Does an object (or anything inside a group) contain live text? */
const hasText = (o) => isText(o) || (o.type === 'group' && o.getObjects().some(hasText));
/** A page-space copy of an object with every text turned into curves. */
async function curvesCopy(o) {
  if (isText(o)) return o.textOutlines?.length ? outlinedTextCurves(o, worldD(o)) : makePath(worldD(o), o);
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
/**
 * Vector PDF. A design with several pages asks first: the page that is open, or every page (one PDF page each).
 * `which`: 'this' | 'all' (from that question).
 */
async function exportPdf(which) {
  finishPowerClipEdit();
  const mode = which === 'this' || which === 'all' ? which : null;
  if (pages.length > 1 && !mode) {
    $('pdfThis').textContent = `This page only (${pages[pageIndex].name})`;
    $('pdfAll').textContent = `All pages (${pages.length})`;
    $('pdfDialog').showModal();
    return;
  }
  const [w, h] = pageSize, start = pageIndex, orientation = w > h ? 'landscape' : 'portrait';
  const list = mode === 'all' ? pages.map((_, i) => i) : [pageIndex], many = list.length > 1;
  toast(many ? `Making the PDF (${list.length} pages)…` : 'Making the PDF…');
  const doc = new jsPDF({ unit: 'mm', format: [w, h], orientation });
  try {
    for (const [k, i] of list.entries()) {
      if (i !== pageIndex) await gotoPage(i, { quiet: true });
      const el = new DOMParser().parseFromString(await pageSvg(), 'image/svg+xml').documentElement;
      el.style.position = 'fixed'; el.style.left = '-99999px';
      document.body.append(el);
      try { if (k > 0) doc.addPage([w, h], orientation); await svg2pdf(el, doc, { x: 0, y: 0, width: w, height: h }); } finally { el.remove(); }
    }
    const name = pages.length > 1 && !many ? `3deezi-${pages[start].name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'page'}.pdf` : '3deezi-artwork.pdf';
    download(doc.output('datauristring'), name);
    toast(many ? `Vector PDF exported: all ${list.length} pages (opens in CorelDRAW, Illustrator and print shops)` : `Vector PDF exported${pages.length > 1 ? `: ${pages[start].name} only` : ''} (opens in CorelDRAW, Illustrator and print shops)`);
  } catch (err) { toast(`PDF export failed: ${err.message}`); } finally { if (pageIndex !== start) await gotoPage(start, { quiet: true }); }
}
$('pdfThis').onclick = () => { $('pdfDialog').close(); exportPdf('this'); };
$('pdfAll').onclick = () => { $('pdfDialog').close(); exportPdf('all'); };
function sendToStudio() {
  finishPowerClipEdit();
  const data = renderPng({ maxPx: 2048 });
  if (!data) { toast(nothingOnPage('Add some artwork first')); return; }
  const name = (userObjects().find(isText)?.text || 'Artboard design').slice(0, 40);
  // The website and the app ask where it goes and keep the design with it (projects.js); other hosts get the picture.
  if (projects.hosted()) projects.send(data, name);
  else if (embedded()) { post({ type: 'artwork', data, name }); toast('Sent to the 3D studio'); }
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
// Pages (CorelDRAW): a design can have several pages, all the same size. The page on screen lives on the canvas;
// the others are kept as saved objects. Tabs in the status bar switch pages, the Layout menu inserts, duplicates,
// renames and deletes them, PgUp / PgDn go to the previous / next page. Undo, the autosave and Export PDF cover every
// page. IDs (#12) stay unique across the pages.
// ===================================================================
let pageBusy = false;
const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** The IDs used on the pages not on screen. */
function updateOtherNums() {
  otherNums = new Set();
  const walk = (o) => { if (o?.num != null) otherNums.add(o.num); (o?.objects ?? []).forEach(walk); };
  pages.forEach((p, i) => { if (i !== pageIndex) (p.objects ?? []).forEach(walk); });
}
const saveSoon = () => autosave(STORE, snapshot, false); // another page opened: kept, but nothing in the design changed
function nextPageName() { let n = pages.length + 1; while (pages.some((p) => p.name === `Page ${n}`)) n++; return `Page ${n}`; }
/** Shows another page (it is not an undo step; the autosave keeps it open). */
async function gotoPage(i, { quiet = false } = {}) {
  if (!pages[i] || i === pageIndex || pageBusy) return;
  pageBusy = true;
  try {
    finishPowerClipEdit(); nodes.end(); cancelConn(); cancelVar();
    canvas.discardActiveObject();
    pages[pageIndex].objects = userObjects().map((o) => o.toObject(EXTRA));
    muted++;
    try {
      for (const o of userObjects()) canvas.remove(o);
      pageIndex = i;
      updateOtherNums();
      const objs = await util.enlivenObjects(fixGradJSON(pages[i].objects));
      pages[i].objects = null;
      for (const o of objs) { pruneEmptyParts(o); fitPowerClips(o); repairObject(o); style(o); canvas.add(o); }
    } finally { muted--; }
    applyToolFlags(); refreshLayers(); syncProps(); renderPageTabs();
    canvas.requestRenderAll();
    saveSoon();
    if (!quiet) toast(`${pages[i].name} (page ${i + 1} of ${pages.length})`, 1600);
  } finally { pageBusy = false; }
}
async function insertPage() {
  pages.splice(pageIndex + 1, 0, { name: nextPageName(), objects: [] });
  await gotoPage(pageIndex + 1, { quiet: true });
  record();
  toast(`${pages[pageIndex].name} added after the page you were on`);
}
async function duplicatePage() {
  pages.splice(pageIndex + 1, 0, { name: `${pages[pageIndex].name} copy`, objects: userObjects().map((o) => o.toObject(EXTRA)) });
  await gotoPage(pageIndex + 1, { quiet: true }); // the copies get IDs of their own as they are added
  record();
  toast(`${pages[pageIndex].name}: a copy of the page, with everything on it`);
}
async function deletePage(i = pageIndex) {
  if (pages.length < 2) { toast('A design has at least one page (File > New document clears it)'); return; }
  const name = pages[i].name;
  if (i === pageIndex) await gotoPage(i > 0 ? i - 1 : 1, { quiet: true });
  pages.splice(i, 1);
  if (pageIndex > i) pageIndex--;
  updateOtherNums(); renderPageTabs(); record();
  toast(`${name} deleted · Undo brings it back`);
}
function renamePage(i = pageIndex, name) {
  const t = String(name ?? '').trim().slice(0, 40);
  if (!t || !pages[i]) return;
  pages[i].name = t;
  renderPageTabs(); record();
}
/** Status bar tabs: click to open a page, double-click to rename it, right-click for more; + adds a page. */
function renderPageTabs() {
  const box = $('pageTabs');
  box.innerHTML = pages.map((p, i) => `<button class="ptab${i === pageIndex ? ' on' : ''}" data-page="${i}" title="${escHtml(p.name)} · click to open · double-click to rename · right-click for more">${escHtml(p.name)}</button>`).join('');
  box.querySelectorAll('[data-page]').forEach((b) => {
    const i = Number(b.dataset.page);
    b.onclick = () => gotoPage(i);
    b.ondblclick = () => startRename(b, i);
    b.oncontextmenu = (e) => { e.preventDefault(); openPageMenu(b, i); };
  });
  box.querySelector('.ptab.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  requestAnimationFrame(syncTabArrows);
}
/** ‹ › show when the tabs don't fit; + is always there. The mouse wheel over the tabs scrolls them too. */
function syncTabArrows() {
  const box = $('pageTabs'), over = box.scrollWidth > box.clientWidth + 1;
  $('pageLeft').hidden = $('pageRight').hidden = !over;
  $('pageLeft').disabled = box.scrollLeft <= 1;
  $('pageRight').disabled = box.scrollLeft + box.clientWidth >= box.scrollWidth - 1;
}
$('pageAddBtn').onclick = () => insertPage();
$('pageLeft').onclick = () => $('pageTabs').scrollBy({ left: -160, behavior: 'smooth' });
$('pageRight').onclick = () => $('pageTabs').scrollBy({ left: 160, behavior: 'smooth' });
$('pageTabs').addEventListener('scroll', syncTabArrows);
$('pageTabs').addEventListener('wheel', (e) => { const b = $('pageTabs'); if (b.scrollWidth <= b.clientWidth) return; b.scrollLeft += e.deltaY || e.deltaX; e.preventDefault(); }, { passive: false });
addEventListener('resize', () => syncTabArrows());
function startRename(b, i) {
  const input = document.createElement('input');
  input.className = 'ptab-edit'; input.value = pages[i].name; input.maxLength = 40;
  b.replaceWith(input); input.focus(); input.select();
  let done = false;
  const finish = (save) => { if (done) return; done = true; if (save) renamePage(i, input.value); renderPageTabs(); };
  input.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); };
  input.onblur = () => finish(true);
}
function openPageMenu(b, i) {
  const m = $('pageMenu'), r = b.getBoundingClientRect();
  m.innerHTML = `<button data-pm="open">Open ${escHtml(pages[i].name)}</button><button data-pm="rename">Rename…</button><button data-pm="dup">Duplicate page</button><button data-pm="add">Insert page after</button><button data-pm="delete"${pages.length < 2 ? ' disabled' : ''}>Delete page</button>`;
  m.hidden = false;
  m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8))}px`;
  m.style.top = `${Math.max(8, r.top - m.offsetHeight - 6)}px`;
  m.querySelectorAll('[data-pm]').forEach((x) => (x.onclick = async () => {
    m.hidden = true;
    const act = x.dataset.pm;
    if (act === 'open') gotoPage(i);
    else if (act === 'rename') { await gotoPage(i, { quiet: true }); const tab = $('pageTabs').querySelector(`[data-page="${i}"]`); if (tab) startRename(tab, i); }
    else if (act === 'dup') { await gotoPage(i, { quiet: true }); duplicatePage(); }
    else if (act === 'add') { await gotoPage(i, { quiet: true }); insertPage(); }
    else if (act === 'delete') deletePage(i);
  }));
}
document.addEventListener('pointerdown', (e) => { const m = $('pageMenu'); if (!m.hidden && !e.target.closest('#pageMenu')) m.hidden = true; });

// ===================================================================
// Menus, toolbar wiring, keyboard
// ===================================================================
/** View > Snap to: each target can be switched on or off; the status-bar Snap box switches all snapping. */
const SNAP_LABELS = { grid: 'Grid (5 mm)', guides: 'Guidelines', objects: 'Objects', nodes: 'Nodes', page: 'Page' };
const ACTIONS = {
  fonts: () => { if ($('textBar').hidden) setTool('text'); setTimeout(() => $('tFont').click()); },
  new: async () => { finishPowerClipEdit(); if ((userObjects().length || pages.length > 1) && !confirm('Start a new document? Every page is cleared (Undo can restore it).')) return; pages = [{ name: 'Page 1', objects: null }]; pageIndex = 0; updateOtherNums(); renderPageTabs(); batch(() => { for (const o of userObjects()) canvas.remove(o); }); canvas.requestRenderAll(); projects.cleared(); },
  pageAdd: () => insertPage(), pageDup: () => duplicatePage(), pageDelete: () => deletePage(), pagePrev: () => gotoPage(pageIndex - 1), pageNext: () => gotoPage(pageIndex + 1),
  pageRename: () => { const tab = $('pageTabs').querySelector(`[data-page="${pageIndex}"]`); if (tab) startRename(tab, pageIndex); },
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
  // A copy of the page as a file, to send to 3DEEZI when something on it doesn't work.
  supportFile: () => { download(`data:application/json;charset=utf-8,${encodeURIComponent(snapshot())}`, `3deezi-artboard-page-${new Date().toISOString().slice(0, 10)}.json`); toast('Page saved as a file: send it to 3DEEZI support if something on it does not work'); },
};
// Bitmaps, Tools and Window menus (CorelDRAW). Bitmaps work on the selected picture (imported images, Painterly
// strokes, converted bitmaps); Window shows the dockers and shows or hides the parts of the screen (remembered).
function needPicture() {
  const o = one();
  if (o?.type === 'image') return o;
  toast('Select a picture first (an imported image, a Painterly stroke or a converted bitmap)');
  return null;
}
/** Bitmaps > Convert to bitmap: the selection becomes one picture at 300 DPI in its place (Undo brings it back). */
function convertToBitmap() {
  const objs = canvas.getActiveObjects(), sel = canvas.getActiveObject();
  if (!objs.length || !sel) { toast('Select the objects to turn into a picture first'); return; }
  const b = sel.getBoundingRect(), k = Math.min(300 / 25.4 / MM, 4096 / (Math.max(b.width, b.height) || 1)); // pixels per page unit
  const el = sel.toCanvasElement({ multiplier: k, enableRetinaScaling: false });
  const c = sel.getCenterPoint();
  const img = new FabricImage(el, { originX: 'center', originY: 'center', left: c.x, top: c.y, scaleX: 1 / k, scaleY: 1 / k });
  style(img, { toolName: 'Bitmap' });
  img.name = objs.length === 1 ? `${objs[0].name} bitmap` : `Bitmap of ${objs.length} objects`;
  if (objs.length === 1) { img.num = objs[0].num; img.uid = objs[0].uid; } // it takes the object's place and ID
  const at = Math.min(...objs.map((o) => canvas.getObjects().indexOf(o)));
  canvas.discardActiveObject();
  batch(() => { for (const o of objs) canvas.remove(o); canvas.insertAt(Math.max(1, at), img); });
  select([img]);
  toast(`Converted to a picture (300 DPI) · Undo brings back the ${objs.length > 1 ? 'objects' : 'object'}`);
}
const UI_PARTS = { tools: 'hide-tools', side: 'hide-side', props: 'hide-props', foot: 'hide-foot', palette: 'hide-palette' };
const UI_LABELS = { tools: 'Toolbox', props: 'Property bar', side: 'Dockers <small>right panel</small>', palette: 'Colour palette', foot: 'Status bar' };
const UNIT_LABELS = { mm: 'Millimetres', cm: 'Centimetres', in: 'Inches', px: 'Pixels <small>300 DPI</small>' };
function toggleUi(part, show) {
  const cls = UI_PARTS[part], hide = show === undefined ? !document.body.classList.contains(cls) : !show;
  document.body.classList.toggle(cls, hide);
  state.ui = { ...(state.ui ?? {}), [part]: !hide };
  savePrefs(); syncMenus();
  setTimeout(resize);
}
function showDocker(tab) { if (document.body.classList.contains('hide-side')) toggleUi('side', true); openTab(tab); }
const tick = (on, html) => `${on ? '✓' : '<span style="visibility:hidden">✓</span>'} ${html}`;
/** Tick marks on the Tools and Window menus. */
function syncMenus() {
  for (const [part, cls] of Object.entries(UI_PARTS)) { const b = document.querySelector(`[data-action="win_${part}"]`); if (b) b.innerHTML = tick(!document.body.classList.contains(cls), UI_LABELS[part]); }
  for (const [u, label] of Object.entries(UNIT_LABELS)) { const b = document.querySelector(`[data-action="units_${u}"]`); if (b) b.innerHTML = tick(state.units === u, label); }
  const sn = document.querySelector('[data-action="snapToggle"]');
  if (sn) sn.innerHTML = tick(state.snap, 'Snap on / off');
}
function setUnits(u) { $('units').value = u; $('units').dispatchEvent(new Event('change')); syncMenus(); }
for (const [part, cls] of Object.entries(UI_PARTS)) document.body.classList.toggle(cls, state.ui?.[part] === false);
Object.assign(ACTIONS, {
  bitmap: convertToBitmap,
  bmAdjust: () => { if (needPicture()) { showDocker('props'); setTimeout(() => $('imgProps').scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); } },
  bmGray: () => { if (needPicture()) $('aGray').click(); },
  bmTint: () => { const o = needPicture(); if (o) { const hex = typeof state.fill === 'string' ? state.fill : '#000000'; tintImage(o, hex); toast(`Picture tinted ${hex} (the fill colour), keeping its light and shade · Undo restores it`); } },
  bmReset: () => { if (needPicture()) $('aReset').click(); },
  bmBg: () => { if (needPicture()) $('bgRemove').click(); },
  bmTrace: () => { if (needPicture()) $('trApply').click(); },
  bmCrop: () => setTool('crop'),
  units_mm: () => setUnits('mm'), units_cm: () => setUnits('cm'), units_in: () => setUnits('in'), units_px: () => setUnits('px'),
  snapToggle: () => { $('snapToggle').click(); syncMenus(); },
  dock_colour: () => showDocker('colour'), dock_props: () => showDocker('props'), dock_layers: () => showDocker('layers'), dock_assets: () => showDocker('assets'),
  win_tools: () => toggleUi('tools'), win_props: () => toggleUi('props'), win_side: () => toggleUi('side'), win_palette: () => toggleUi('palette'), win_foot: () => toggleUi('foot'),
  preview: () => startPreview(),
  save: () => $('save').click(),
  fullscreen: () => { const d = document; if (d.fullscreenElement) d.exitFullscreen?.(); else (d.documentElement.requestFullscreen?.() ?? Promise.reject()).catch(() => toast('Full screen is not allowed here: use your browser\'s full screen (F11)')); },
});
syncMenus();
document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => { closeMenus(); ACTIONS[b.dataset.action]?.(); }));
function closeMenus() { document.querySelectorAll('.menu.open, .fly.open').forEach((m) => m.classList.remove('open')); endFontPreview(); }
document.querySelectorAll('.menu>button').forEach((b) => b.addEventListener('click', (e) => { const m = b.parentElement, open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); e.stopPropagation(); }));
addEventListener('click', (e) => { if (!e.target.closest('.menu,.fly,.tool')) closeMenus(); });
$('undo').onclick = undo; $('redo').onclick = redo;
$('save').onclick = () => projects.saveButton(); // on this device, and in the account when signed in
$('sendBtn').onclick = sendToStudio;
// AI / DYO quick access: save the artwork here first, then the website or app opens AI Powered Sportswear or
// Design Your Own. Opened on its own (no 3DEEZI around it), go to the website's page instead.
const startKit = (mode) => {
  finishPowerClipEdit();
  saveNow(STORE, snapshot());
  if (embedded()) post({ type: 'start', mode });
  else location.href = new URL(mode === 'ai' ? '../../create/ai' : '../../create/sport', location.href).href;
};
$('goAi').onclick = () => startKit('ai');
$('goDyo').onclick = () => startKit('dyo');
// Projects (projects.js): the design kept on this device and in the account (File > Save to my account, Open from my
// account), templates, and Send to 3D Studio with the design linked to the artwork on the kit.
/** Opens a whole design in place of the one on the page (from the account or a template): its own Undo starts. */
async function openDocument(json) {
  await window.artboard.load(json);
  history = [snapshot()]; future = []; syncHistory();
  saveNow(STORE, history[0]);
}
/** A picture of the page on screen (white page), for the account's lists; the selection stays selected. */
function pagePreview() {
  const keep = canvas.getActiveObjects(), editing = canvas.getActiveObject()?.isEditing;
  const data = renderPng({ whole: true, maxPx: 480, background: '#ffffff' });
  if (keep.length && !editing) select(keep);
  return data;
}
let starter = null; // the YOUR TEAM text a new page starts with (see Start): untouched, the page counts as blank
const projects = createProjects({
  $, toast, post, icon, escHtml, store: STORE, snapshot, open: openDocument, preview: pagePreview,
  blank: () => (!userObjects().length || (history.length < 2 && userObjects().length === 1 && userObjects()[0] === starter)) && pages.every((p, i) => i === pageIndex || !p.objects?.length),
  firstText: () => String(userObjects().find(isText)?.text ?? '').trim().slice(0, 60),
  finish: () => finishPowerClipEdit(), sendAgain: () => sendToStudio(),
});
Object.assign(ACTIONS, projects.actions);
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
/** The right-click menu for the selection, at (x, y); `above` puts it above that point (the ⋯ button). */
function showObjectMenu(x, y, above = false) {
  const menu = $('ctxMenu');
  menu.innerHTML = ctxItems().map((it) => (it ? `<button data-ctx="${it[0]}">${it[1]}${it[2] ? `<small>${it[2]}</small>` : ''}</button>` : '<hr>')).join('');
  menu.querySelectorAll('[data-ctx]').forEach((b) => (b.onclick = () => { closeMenus(); ACTIONS[b.dataset.ctx]?.(); }));
  closeMenus();
  Object.assign(menu.style, { left: `${Math.max(8, Math.min(x, innerWidth - 230))}px`, top: `${y}px`, bottom: 'auto' });
  menu.classList.add('open');
  const top = above ? y - menu.offsetHeight - 6 : y;
  menu.style.top = `${Math.max(8, Math.min(top, innerHeight - menu.offsetHeight - 8))}px`;
}
/** Somewhere on the screen, for menus that open next to an element. */
const pointAnchor = (x, y) => ({ getBoundingClientRect: () => ({ left: x, top: y, right: x, bottom: y, width: 0, height: 0 }) });
wrap.addEventListener('contextmenu', (e) => {
  e.preventDefault(); e.stopPropagation();
  const target = objectAt(canvas.getScenePoint(e));
  if (target && !canvas.getActiveObjects().includes(target)) { setTool('select'); canvas.setActiveObject(target); canvas.requestRenderAll(); syncProps(); }
  // Nothing selected: the page's own menu (open, rename, duplicate, insert, delete).
  if (!active().length) { closeMenus(); openPageMenu(pointAnchor(e.clientX, e.clientY), pageIndex); return; }
  showObjectMenu(e.clientX, e.clientY);
}, true);

// ---------- right-click on touch screens (they have no right mouse button)
// The ⋯ button at the end of the colour palette: tap it (it lights up and a tooltip says what to do), then tap an
// item: an object on the page, a page tab, a tool or a colour. That tap opens the item's right-click menu instead of
// its usual action (on an empty part of the page: the page's menu). Tap ⋯ again to cancel. A finger held still on an
// item (long press) does the same in one go, but on the page only with the Pick tool, and never with a pen or a
// mouse, so drawing and writing are not interrupted.
let rightTap = false, swallowClick = false, swallowPointer = null, press = null, pressedAt = 0, pressOpened = null;
/** The nearest element (from `el` up) that has a right-click action. */
const rightClickable = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) if (n.oncontextmenu) return n; return null; };
function rightClickAt(el, x, y) {
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2, buttons: 2 });
  el.dispatchEvent(ev);
  return ev.defaultPrevented;
}
function placeRightTip() {
  // At the top of the work area, clear of the chat buttons (website and app) and of the colours, tools and page
  // tabs that the next tap is for.
  const tip = $('rcTip'), st = $('stage').getBoundingClientRect();
  tip.style.left = `${Math.max(8, Math.min(st.left + (st.width - tip.offsetWidth) / 2, innerWidth - tip.offsetWidth - 8))}px`;
  tip.style.top = `${st.top + 10}px`;
}
function setRightTap(on) {
  rightTap = on;
  $('palMore').classList.toggle('on', on);
  document.body.classList.toggle('right-tap', on);
  $('rcTip').hidden = !on;
  if (on) placeRightTip();
}
$('palMore').addEventListener('click', (e) => { e.stopPropagation(); closeMenus(); $('pageMenu').hidden = true; setRightTap(!rightTap); });
$('rcCancel').onclick = () => setRightTap(false);
addEventListener('resize', () => { if (rightTap) placeRightTip(); });
addEventListener('keydown', (e) => { if (rightTap && e.key === 'Escape') setRightTap(false); });
const cancelPress = () => { if (press) { clearTimeout(press.timer); press = null; } };
document.addEventListener('pointerdown', (e) => {
  swallowClick = false;
  cancelPress();
  const t = e.target;
  if (t.closest('#palMore')) return;
  if (rightTap) {
    if (t.closest('#rcTip')) return;
    // This tap is the right-click: the page, the tool or the colour under it does not also get a normal tap.
    e.preventDefault(); e.stopImmediatePropagation();
    swallowPointer = e.pointerId; swallowClick = true;
    setRightTap(false);
    const onPage = !!t.closest('#canvasWrap');
    const el = onPage ? t : rightClickable(t);
    if (!el || !rightClickAt(el, e.clientX, e.clientY)) toast('That has no right-click menu: tap ⋯, then an object, a page tab, a tool or a colour', 4000);
    return;
  }
  if (t.closest('#ctxMenu, #pageMenu, .fly')) return;
  // Long press: a finger only, held still; on the page only with the Pick tool.
  const onPage = !!t.closest('#canvasWrap'), el = onPage ? t : rightClickable(t);
  if (e.pointerType !== 'touch' || !e.isPrimary || !el || (onPage && state.tool !== 'select')) return;
  if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
  // A colour that can be dragged onto an object (a phone starts that drag with a long press too) acts only when the
  // finger lifts without moving; anything else opens its menu while the finger is still down.
  press = { x: e.clientX, y: e.clientY, el, onLift: el.draggable === true, timer: setTimeout(() => {
    if (!press) return;
    press.held = true;
    if (!press.onLift) longPress();
  }, 550) };
}, true);
function longPress() {
  const p = press;
  press = null;
  swallowClick = true;
  pressedAt = performance.now();
  pressOpened = { x: p.x, y: p.y };
  rightClickAt(p.el, p.x, p.y);
}
document.addEventListener('pointermove', (e) => {
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress();
  // Holding an object, then dragging it: the menu that opened closes again and the drag goes on as usual.
  if (pressOpened && Math.hypot(e.clientX - pressOpened.x, e.clientY - pressOpened.y) > 12) {
    pressOpened = null;
    closeMenus();
    $('pageMenu').hidden = true;
  }
}, true);
for (const type of ['pointerup', 'pointercancel']) {
  document.addEventListener(type, (e) => {
    if (type === 'pointerup' && press?.held && press.onLift) longPress();
    cancelPress();
    pressOpened = null;
    if (e.pointerId === swallowPointer) { swallowPointer = null; e.stopImmediatePropagation(); }
  }, true);
}
// Android also sends its own long-press menu event: keep only one of the two.
document.addEventListener('contextmenu', (e) => {
  if (!e.isTrusted) return;
  if (performance.now() - pressedAt < 1200) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  if (press) { cancelPress(); swallowClick = true; pressedAt = performance.now(); }
}, true);
// A tap outside the right-click menu closes it, and a tap on the page closes any open menu (a finger on the page gives
// no click event, which is what closes them for a mouse).
document.addEventListener('pointerdown', (e) => {
  const m = $('ctxMenu');
  if (m.classList.contains('open') && !e.target.closest('#ctxMenu')) m.classList.remove('open');
  if (e.target.closest('#canvasWrap')) closeMenus();
});
// The finger lifting after a long press, or the tap that was a right-click, is not also a normal tap.
document.addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
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
    for (const b of document.querySelectorAll(`[data-action="snap_${k}"]`)) b.innerHTML = `${state.snapTo[k] ? '✓' : '<span style="visibility:hidden">✓</span>'} Snap to ${label}`;
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
// ===================================================================
// Outlines for names and numbers: one or two outlines drawn behind the letters (outline 1 next to them, outline 2
// around it), while the text stays editable. o.textOutlines = [{ w: mm, c: colour }, …]; the text's strokeWidth holds
// twice their total (in its own units) and its stroke stays empty, so its box, alignment, snapping and exports
// include the outlines.
// ===================================================================
{
  let proto = IText.prototype;
  while (proto && !Object.prototype.hasOwnProperty.call(proto, '_renderText')) proto = Object.getPrototypeOf(proto);
  const base = proto._renderText;
  proto._renderText = function (ctx) {
    const outs = this.textOutlines;
    if (!outs?.length || !this.strokeWidth) { base.call(this, ctx); return; }
    let acc = 0;
    const reach = outs.map((x) => (acc += x.w)), perMm = this.strokeWidth / 2 / acc;
    const keep = [this.stroke, this.strokeWidth, this.strokeLineJoin, this.strokeDashArray], affect = this.shadow?.affectStroke;
    try {
      this.strokeLineJoin = 'round'; this.strokeDashArray = null;
      if (this.shadow) this.shadow.affectStroke = true; // the shadow falls from the outer outline only
      for (let i = outs.length - 1; i >= 0; i--) {
        this.stroke = outs[i].c; this.strokeWidth = 2 * reach[i] * perMm;
        this._renderTextStroke(ctx);
        if (this.shadow) this._removeShadow(ctx);
      }
    } finally {
      [this.stroke, this.strokeWidth, this.strokeLineJoin, this.strokeDashArray] = keep;
      if (this.shadow) this.shadow.affectStroke = affect;
    }
    this._renderTextFill(ctx);
  };
}
/** Gives a text its outlines (list of { w: mm, c }; widths 0 are left out); keeps its centre in place. */
function setTextOutlines(o, list) {
  const outs = (list ?? []).filter((x) => x && Number(x.w) > 0 && x.c).slice(0, 2).map((x) => ({ w: Math.min(50, Number(x.w)), c: String(x.c).toUpperCase() }));
  const centre = o.getCenterPoint();
  if (outs.length) {
    o.textOutlines = outs;
    o.set({ stroke: null, strokeWidth: (2 * outs.reduce((a, x) => a + x.w, 0) * MM) / avgScale(o), strokeUniform: false, strokeDashArray: null });
  } else {
    delete o.textOutlines;
    o.set({ stroke: null, strokeWidth: 0 });
  }
  o.setPositionByOrigin(centre, 'center', 'center');
  o.dirty = true; o.setCoords();
}
/** An outlined text as curves (Convert to curves, SVG / PDF): its outlines as outlined paths behind the letters, in a group. */
function outlinedTextCurves(o, d) {
  let acc = 0;
  const reach = o.textOutlines.map((x) => (acc += x.w)), perMm = ((o.strokeWidth / 2) * avgScale(o)) / acc;
  const parts = [];
  for (let i = reach.length - 1; i >= 0; i--) parts.push(style(new Path(d, { fill: null, stroke: o.textOutlines[i].c, strokeWidth: 2 * reach[i] * perMm, strokeLineJoin: 'round', strokeUniform: true }), { toolName: 'Curve' }));
  const letters = makePath(d, o);
  letters.set({ stroke: null, strokeWidth: 0 });
  parts.push(letters);
  const g = style(new Group(parts), { toolName: 'Group' });
  g.name = `“${String(o.text).slice(0, 18)}” curves with outlines`;
  return g;
}
const outlineTexts = () => (textTarget() ?? []);
/** The outlines of the selected text in both places they are set: the Outlines panel (text bar) and the Properties tab. */
function syncOutlineFly() {
  const o = outlineTexts()[0], outs = o?.textOutlines ?? [];
  for (const p of ['ol', 'pol']) {
    for (const i of [1, 2]) {
      const w = $(`${p}${i}w`), c = $(`${p}${i}c`);
      if (document.activeElement !== w) w.value = String(outs[i - 1]?.w ?? 0);
      if (outs[i - 1] && document.activeElement !== c) c.value = outs[i - 1].c.toLowerCase();
    }
  }
  $('tOutlineBtn').classList.toggle('on', !!outs.length);
}
function applyOutlineFly(commit, p = 'ol') {
  const texts = outlineTexts();
  if (!texts.length) return;
  const list = [{ w: $(`${p}1w`).value, c: $(`${p}1c`).value }, { w: $(`${p}2w`).value, c: $(`${p}2c`).value }];
  // An outer outline with no inner one: it becomes the first.
  const use = Number(list[0].w) > 0 ? list : [list[1]];
  for (const o of texts) setTextOutlines(o, use);
  canvas.requestRenderAll(); syncOutlineFly();
  if (commit) canvas.fire('object:modified', { target: texts[0] });
}
$('tOutlineBtn').onclick = (e) => {
  const fly = $('outlineFly'), r = e.currentTarget.getBoundingClientRect(), open = !fly.classList.contains('open');
  closeMenus();
  if (!open) return;
  if (!outlineTexts().length) { toast('Select a text first'); return; }
  syncOutlineFly();
  Object.assign(fly.style, { left: `${Math.max(8, Math.min(r.left, innerWidth - 310))}px`, top: `${r.bottom + 6}px`, bottom: 'auto' });
  fly.classList.add('open');
  e.stopPropagation();
};
for (const id of ['ol1w', 'ol2w']) { $(id).onchange = () => applyOutlineFly(true); $(id).onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') closeMenus(); }; }
for (const id of ['ol1c', 'ol2c']) { $(id).oninput = () => applyOutlineFly(false); $(id).onchange = () => applyOutlineFly(true); }
for (const id of ['pol1w', 'pol2w']) $(id).onchange = () => applyOutlineFly(true, 'pol');
for (const id of ['pol1c', 'pol2c']) { $(id).oninput = () => applyOutlineFly(false, 'pol'); $(id).onchange = () => applyOutlineFly(true, 'pol'); }
$('polNone').onclick = () => $('olNone').onclick();
$('olNone').onclick = () => { const texts = outlineTexts(); for (const o of texts) setTextOutlines(o, []); canvas.requestRenderAll(); syncOutlineFly(); if (texts[0]) canvas.fire('object:modified', { target: texts[0] }); closeMenus(); toast('Outlines removed'); };

// Text on a path: settings on the text bar (along, distance, which part of the letters sits on it, side, centre).
const pathText = () => { const t = textTarget(); return t?.length === 1 && t[0].path ? t[0] : null; };
/** paper.js reads path data as a compound path: the measurements are on its (first) path. */
const firstPath = (d) => { const p = V.toPaper(d); return p.children?.length ? p.children[0] : p; };
/** The guide at a distance from the path, on the text's side (the original guide is kept with the text). */
function guideAt(o, dist) {
  const d0 = o.pathGuide;
  if (!d0 || !dist) return d0;
  const item = firstPath(d0), L = item.length, mid = item.getPointAt(L / 2), n = item.getNormalAt(L / 2);
  // Fabric puts the letters on the left of the path's direction (above a path drawn left to right); "right": the other side.
  const side = o.pathSide === 'right' ? -1 : 1, want = { x: n.x * side, y: n.y * side }; // paper's normal points to the letters' side
  const toward = (d) => { const p = firstPath(d).getNearestPoint(mid); return (p.x - mid.x) * want.x + (p.y - mid.y) * want.y; };
  const a = V.offsetD(d0, dist), b = V.offsetD(d0, -dist);
  return (toward(a) > 0) === (dist > 0) ? a : b;
}
/** A new guide for a text on a path, keeping the letters where they are on the page. */
function setGuide(o, d) {
  const old = o.path.getCenterPoint(), g = new Path(d, { fill: null, stroke: null }), now = g.getCenterPoint();
  const m = o.calcTransformMatrix(), shift = util.transformPoint(new Point(now.x - old.x, now.y - old.y), [m[0], m[1], m[2], m[3], 0, 0]);
  const c = o.getCenterPoint();
  o.set({ path: g });
  o.initDimensions();
  o.setPositionByOrigin(new Point(c.x + shift.x, c.y + shift.y), 'center', 'center');
  o.setCoords();
}
function syncPathBar() {
  const o = pathText(), sel = canvas.getActiveObjects();
  $('pathBar').hidden = !o;
  $('fitBar').hidden = !(sel.length === 2 && sel.filter(isText).length === 1 && sel.some((x) => !isText(x) && shapeable(x)));
  if (!o) return;
  if (document.activeElement !== $('tpOffset')) $('tpOffset').value = String(+((o.pathStartOffset || 0) / MM).toFixed(1));
  if (document.activeElement !== $('tpDist')) $('tpDist').value = String(+(o.pathDist || 0).toFixed(1));
  $('tpAlign').value = o.pathAlign || 'baseline';
  $('tpSide').classList.toggle('on', o.pathSide === 'right');
}
function pathChange(fn, label) {
  const o = pathText();
  if (!o) return;
  fn(o);
  o.dirty = true; o.setCoords(); canvas.requestRenderAll();
  canvas.fire('object:modified', { target: o }); syncPathBar();
  if (label) toast(label);
}
$('tpOffset').onchange = (e) => pathChange((o) => { o.set({ pathStartOffset: Math.max(0, Number(e.target.value) || 0) * MM }); o.initDimensions(); });
$('tpDist').onchange = (e) => pathChange((o) => {
  if (!o.pathGuide) { toast('Fit the text to the path again to set its distance (it was fitted before this setting existed)'); return; }
  const dist = Math.max(-200, Math.min(200, Number(e.target.value) || 0));
  try { setGuide(o, guideAt(o, dist * MM) || o.pathGuide); o.pathDist = dist; } catch { toast('That distance does not work for this path'); }
});
$('tpAlign').onchange = (e) => pathChange((o) => { o.set({ pathAlign: e.target.value }); o.initDimensions(); });
$('tpSide').onclick = () => pathChange((o) => {
  o.set({ pathSide: o.pathSide === 'right' ? 'left' : 'right' });
  if (o.pathGuide && o.pathDist) setGuide(o, guideAt(o, o.pathDist * MM));
  o.initDimensions();
}, 'Text placed on the other side of the path');
$('tpCentre').onclick = () => pathChange((o) => {
  const L = firstPath(o.pathGuide && o.pathDist ? guideAt(o, o.pathDist * MM) : o.pathGuide ?? V.modelToD(V.objectModel(o.path))).length;
  const closed = /z\s*$/i.test((o.pathGuide ?? '').trim());
  o.set({ pathStartOffset: Math.max(0, closed ? L / 4 - o.calcTextWidth() / 2 : (L - o.calcTextWidth()) / 2) }); o.initDimensions();
}, 'Text centred along the path');
$('tpStraight').onclick = () => straightenText();
$('tpFit').onclick = () => fitTextToPath();

function setText(props, label) {
  Object.assign(state.text, props);
  if (textTarget()) applyToSelection(props, label);
  syncTextBar();
}
function syncTextBar() {
  const t = textTarget(), bar = $('textBar');
  bar.hidden = !t && state.tool !== 'text';
  if (bar.hidden) { syncPathBar(); return; }
  const o = t?.[0];
  const v = o ? { fontFamily: o.fontFamily, fontWeight: o.fontWeight, fontStyle: o.fontStyle, underline: o.underline, textAlign: o.textAlign, fontSize: (o.fontSize * (o.scaleY || 1)) / MM, charSpacing: o.charSpacing || 0, lineHeight: o.lineHeight || LINE_NORMAL } : state.text;
  $('tFontName').textContent = v.fontFamily; $('tFontName').style.fontFamily = `'${v.fontFamily}'`;
  if (document.activeElement !== $('tSize')) $('tSize').value = String(Math.round(v.fontSize * 10) / 10);
  const canBold = fontInfo(v.fontFamily).bold;
  $('tBold').disabled = !canBold; $('tBold').title = canBold ? 'Bold (Ctrl+B)' : 'This font has one weight';
  $('tBold').classList.toggle('on', canBold && Number(v.fontWeight) >= 600);
  $('tItalic').classList.toggle('on', v.fontStyle === 'italic');
  $('tUnder').classList.toggle('on', !!v.underline);
  for (const a of ['left', 'center', 'right', 'justify']) $(`tAlign-${a}`).classList.toggle('on', v.textAlign === a);
  syncPathBar(); $('tOutlineBtn').classList.toggle('on', !!o?.textOutlines?.length);
  if (document.activeElement !== $('tLetter')) $('tLetter').value = String(Math.round((v.charSpacing || 0) / 10));
  if (document.activeElement !== $('tLine')) $('tLine').value = String(Math.round(((v.lineHeight || LINE_NORMAL) / LINE_NORMAL) * 100));
}
function renderFontList(filter = '') {
  const q = filter.trim().toLowerCase(), cur = textTarget()?.[0].fontFamily ?? state.text.fontFamily;
  let html = '', group = '';
  // Your own fonts first ("My fonts"), each with a button to remove it from this device.
  for (const x of [...FONTS.filter((f) => f.mine), ...FONTS.filter((f) => !f.mine)].filter((f) => f.family.toLowerCase().includes(q))) {
    if (x.group !== group) { group = x.group; html += `<h4>${esc(group)}</h4>`; }
    const btn = `<button data-font="${esc(x.family)}" class="${x.family === cur ? 'on' : ''}" style="font-family:'${esc(x.family)}'">${esc(x.family)}</button>`;
    html += x.mine ? `<div class="font-row">${btn}<button class="font-del" data-del="${esc(x.family)}" title="Remove ${esc(x.family)} from this device" aria-label="Remove ${esc(x.family)}">×</button></div>` : btn;
  }
  $('fontList').innerHTML = html || '<p class="empty">No fonts match</p>';
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// ===================================================================
// Your own fonts (font list > Upload a font): TTF, OTF or WOFF, kept on this device (in the browser, or in the app)
// and listed under My fonts. They work like the built-in fonts: on the page, in Convert to curves and in the PDF.
// ===================================================================
function fontsTx(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('3deezi-artboard-fonts', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('fonts', { keyPath: 'family' });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('fonts', mode), req = fn(tx.objectStore('fonts'));
      tx.oncomplete = () => { open.result.close(); resolve(req?.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
    };
  });
}
const myFaces = new Map(); // family -> its FontFace objects
function toB64(buffer) { const bytes = new Uint8Array(buffer); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
const WEIGHT_NAMES = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
/** Weights from style names, most specific first ("ExtraLight" before "Light", "SemiBold" before "Bold"). */
const NAME_WEIGHTS = [[/thin|hairline/i, 100], [/(extra|ultra)[\s-]*light/i, 200], [/light/i, 300], [/medium/i, 500], [/(semi|demi)[\s-]*bold/i, 600], [/(extra|ultra)[\s-]*bold/i, 800], [/black|heavy/i, 900], [/bold/i, 700], [/regular|normal|book|roman|italic|oblique/i, 400]];
/** One font file: its family (the typographic family when the file has one), weight, italic, and a variable font's weight range. */
function readFace({ name, buffer }) {
  const font = V.parseFontFile(buffer.slice(0)), n = font.names ?? {}, os2 = font.tables?.os2;
  const pick = (x) => (x ? x.en ?? Object.values(x)[0] ?? '' : '');
  const family = String(pick(n.preferredFamily) || pick(n.fontFamily) || name.replace(/\.[^.]+$/, '')).replace(/[^\w\s().&-]/g, '').trim().slice(0, 60) || 'My font';
  const sub = String(pick(n.preferredSubfamily) || pick(n.fontSubfamily));
  const axis = font.tables?.fvar?.axes?.find((a) => a.tag === 'wght');
  // The style's name gives the weight: the number in the file can't be trusted for light weights (DM Sans gives Thin and
  // ExtraLight both 250, an old Windows workaround).
  const named = NAME_WEIGHTS.find(([re]) => re.test(sub))?.[1];
  return {
    name, buffer, family, variable: !!axis, italic: !!(os2 && os2.fsSelection & 1) || /italic|oblique/i.test(sub),
    weight: axis ? [Math.max(1, Math.round(axis.minValue)), Math.min(1000, Math.round(axis.maxValue))] : [named ?? Math.max(1, Math.min(1000, os2?.usWeightClass || 400))],
  };
}
/** The font files in a .zip (stored or deflated; unpacked with the browser's own DecompressionStream). */
async function unzipFonts(buffer) {
  const u8 = new Uint8Array(buffer), v = new DataView(buffer), out = [];
  let end = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('not a zip file');
  let p = v.getUint32(end + 16, true);
  const count = v.getUint16(end + 10, true), names = new TextDecoder();
  for (let k = 0; k < count && v.getUint32(p, true) === 0x02014b50; k++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), at = v.getUint32(p + 42, true);
    const name = names.decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (!/\.(ttf|otf|woff)$/i.test(name) || /(^|\/)(__MACOSX\/|\._)/.test(name) || out.length >= 300) continue;
    const start = at + 30 + v.getUint16(at + 26, true) + v.getUint16(at + 28, true), data = u8.subarray(start, start + size);
    let bytes;
    if (method === 0) bytes = data.slice();
    else if (method === 8) bytes = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    out.push({ name: name.split('/').pop(), buffer: bytes.buffer });
  }
  return out;
}
/** Files grouped by family: one per weight and style; a family's separate files rather than its variable file (Convert to curves needs them). */
function groupFaces(faces) {
  const fams = new Map();
  for (const f of faces) { if (!fams.has(f.family)) fams.set(f.family, []); fams.get(f.family).push(f); }
  for (const [fam, list] of fams) {
    const statics = list.filter((f) => !f.variable), seen = new Set();
    fams.set(fam, (statics.length ? statics : list).filter((f) => { const k = `${f.italic}:${f.weight.join('-')}`; if (seen.has(k)) return false; seen.add(k); return true; }));
  }
  return fams;
}
/** Weight ranges that cover 1–1000 without overlapping, so the canvas and Convert to curves always pick the same file. */
function rangesFor(list) {
  const s = [...list].sort((a, b) => a.weight[0] - b.weight[0]);
  return s.map((f, i) => [f, f.variable ? `${f.weight[0]} ${f.weight[1]}` : `${i ? Math.floor((s[i - 1].weight[0] + f.weight[0]) / 2) + 1 : 1} ${i < s.length - 1 ? Math.floor((f.weight[0] + s[i + 1].weight[0]) / 2) : 1000}`]);
}
/** A family's files (base64, weight range, style) for the canvas, Convert to curves (opentype.js) and the font lists. */
async function registerMyFamily(family, stored) {
  window.__ABFONTS = window.__ABFONTS ?? {};
  const tag = Math.random().toString(36).slice(2, 8), faces = [], italics = [], loaded = [];
  for (const [i, f] of stored.entries()) {
    const key = `my:${family}:${tag}:${i}`;
    window.__ABFONTS[key] = f.data;
    (f.style === 'italic' ? italics : faces).push([key, f.range]);
    const face = new FontFace(family, Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0)).buffer, { weight: f.range, style: f.style });
    await face.load();
    document.fonts.add(face); loaded.push(face);
  }
  myFaces.set(family, loaded);
  const all = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const weights = [...new Set(stored.filter((f) => f.style !== 'italic' || !faces.length).flatMap((f) => (f.variable ? all.filter((w) => w >= f.weight[0] && w <= f.weight[1]) : [f.weight[0]])))].sort((a, b) => a - b);
  const entry = { family, group: 'My fonts', faces: faces.length ? faces : italics, italics, weights, bold: weights.some((w) => w >= 600), mine: true };
  const at = FONTS.findIndex((x) => x.family === family && x.mine);
  if (at >= 0) FONTS[at] = entry; else FONTS.push(entry);
  refreshFontSelects();
}
/** Takes a family off the page's fonts (before it is uploaded again, or removed). */
function forgetFamily(family) {
  for (const face of myFaces.get(family) ?? []) document.fonts.delete(face);
  myFaces.delete(family);
  const i = FONTS.findIndex((f) => f.family === family && f.mine);
  if (i >= 0) { for (const [key] of [...FONTS[i].faces, ...(FONTS[i].italics ?? [])]) delete window.__ABFONTS?.[key]; FONTS.splice(i, 1); }
}
async function addFamily(name, faces) {
  const family = FONTS.some((f) => f.family === name && !f.mine) ? `${name} (mine)` : name;
  const stored = [];
  for (const style of ['normal', 'italic']) {
    for (const [f, range] of rangesFor(faces.filter((x) => (x.italic ? 'italic' : 'normal') === style))) stored.push({ data: toB64(f.buffer), style, range, weight: f.weight, variable: f.variable, file: f.name });
  }
  if (myFaces.has(family)) forgetFamily(family); // an earlier upload of the same family is replaced
  await registerMyFamily(family, stored);
  let kept = true;
  try { await fontsTx('readwrite', (st) => st.put({ family, faces: stored, added: Date.now() })); } catch { kept = false; }
  return { family, kept, styles: stored.length };
}
async function loadMyFonts() {
  let all = [];
  try { all = (await fontsTx('readonly', (st) => st.getAll())) ?? []; } catch { return; } // private window: none kept
  for (const f of all) {
    const stored = f.faces ?? (f.data ? [{ data: f.data, style: 'normal', range: '1 1000', weight: [400], variable: false }] : []);
    try { if (stored.length) await registerMyFamily(f.family, stored); } catch { /* a damaged file: skipped */ }
  }
}
function refreshFontSelects() {
  const opts = FONTS.map((x) => `<option>${esc(x.family)}</option>`).join('');
  for (const id of ['pFont', 'tbFont']) { const el = $(id), v = el.value; el.innerHTML = opts; if (v) el.value = v; }
  if ($('fontFly').classList.contains('open')) renderFontList($('fontSearch').value);
}
/** The Properties tab's Weight list: every weight an uploaded font has (Thin … Black); the built-in fonts: Regular, Bold, Black. */
function syncWeights(family, weight) {
  const f = FONTS.find((x) => x.family === family), list = f?.weights?.length > 1 ? f.weights : [400, 700, 900], el = $('pWeight');
  if (el.dataset.list !== list.join()) { el.innerHTML = list.map((w) => `<option value="${w}">${WEIGHT_NAMES[w] ?? w}</option>`).join(''); el.dataset.list = list.join(); }
  el.value = String(list.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a), list[0]));
}
/** When the files hold several families (Google's DM Sans zip: DM Sans and its 18 / 24 / 36 pt versions): which ones to add. */
function chooseFamilies(fams) {
  return new Promise((resolve) => {
    const names = [...fams.keys()].sort((a, b) => a.length - b.length || a.localeCompare(b)), dlg = $('fontDialog');
    $('fontChoices').innerHTML = names.map((n, i) => { const k = fams.get(n).length; return `<label><input type="checkbox" value="${esc(n)}"${i === 0 ? ' checked' : ''}><span>${esc(n)}</span><small>${k} style${k > 1 ? 's' : ''}</small></label>`; }).join('');
    let answer = [];
    $('fontDialogAdd').onclick = () => { answer = [...$('fontChoices').querySelectorAll('input:checked')].map((x) => x.value); dlg.close(); };
    dlg.onclose = () => resolve(answer);
    dlg.showModal();
  });
}
$('fontUpload').onclick = () => $('fontFile').click();
$('fontFile').onchange = async (e) => {
  const files = [...(e.target.files ?? [])];
  e.target.value = '';
  if (!files.length) return;
  try {
    const entries = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        if (f.size > 60 * 1024 * 1024) throw new Error(`${f.name} is over 60 MB`);
        try { entries.push(...(await unzipFonts(await f.arrayBuffer()))); } catch (err) { throw new Error(`${f.name} could not be opened (${err.message}): unzip it and choose its .ttf files`); }
      } else if (/\.(ttf|otf|woff)$/i.test(f.name) && f.size <= 8 * 1024 * 1024) entries.push({ name: f.name, buffer: await f.arrayBuffer() });
    }
    if (!entries.length) throw new Error('There are no TTF, OTF or WOFF fonts in what you chose (a WOFF2 font: convert it to TTF first)');
    const faces = [], bad = [];
    for (const en of entries) { try { faces.push(readFace(en)); } catch { bad.push(en.name); } }
    if (!faces.length) throw new Error('These files are not fonts the Artboard can read');
    const fams = groupFaces(faces), chosen = fams.size > 1 ? await chooseFamilies(fams) : [...fams.keys()];
    if (!chosen.length) return;
    toast(`Adding ${chosen.length > 1 ? `${chosen.length} fonts` : `“${chosen[0]}”`}…`);
    const added = [];
    for (const fam of chosen) added.push(await addFamily(fam, fams.get(fam)));
    const had = !!textTarget();
    chooseFont(added[0].family);
    toast(`${added.map((a) => `“${a.family}” (${a.styles} style${a.styles > 1 ? 's' : ''})`).join(', ')} added under My fonts${had ? `; the selected text uses “${added[0].family}”` : ''}${added.every((a) => a.kept) ? ' (kept on this device)' : ' (for now: this browser cannot keep fonts)'}${bad.length ? `; ${bad.length} file${bad.length > 1 ? 's' : ''} could not be read` : ''}`, 6000);
  } catch (err) { toast(err.message, 6000); }
};
let fontAsk = null;
$('fontAskNo').onclick = () => { fontAsk = null; $('fontAsk').hidden = true; };
$('fontAskYes').onclick = async () => {
  const family = fontAsk;
  fontAsk = null; $('fontAsk').hidden = true;
  if (!family) return;
  try { await fontsTx('readwrite', (st) => st.delete(family)); } catch { /* not kept anyway */ }
  forgetFamily(family);
  refreshFontSelects(); renderFontList($('fontSearch').value);
  canvas.getObjects().forEach((o) => { o.dirty = true; }); canvas.requestRenderAll();
  toast(`Font “${family}” removed from this device: text that used it shows a standard font until you upload it again`, 5000);
};
/** A design using a font that isn't on this device (an uploaded font from another device): say so, once per font. */
const fontsTold = new Set();
function checkFonts() {
  const missing = new Set();
  const walk = (o) => { if (isText(o) && !FONTS.some((f) => f.family === o.fontFamily)) missing.add(o.fontFamily); if (o.type === 'group') o.getObjects().forEach(walk); };
  userObjects().forEach(walk);
  const news = [...missing].filter((f) => f && !fontsTold.has(f));
  if (!news.length) return;
  news.forEach((f) => fontsTold.add(f));
  setTimeout(() => toast(`This design uses the font${news.length > 1 ? 's' : ''} ${news.map((f) => `“${f}”`).join(', ')}, not on this device: upload ${news.length > 1 ? 'them' : 'it'} (font list > Upload a font) to see ${news.length > 1 ? 'them' : 'it'}`, 7000), 300);
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
$('fontList').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) { fontAsk = del.dataset.del; $('fontAskText').textContent = `Remove “${fontAsk}” from this device?`; $('fontAsk').hidden = false; return; }
  const b = e.target.closest('[data-font]'); if (b) chooseFont(b.dataset.font);
});
$('tSize').onchange = (e) => {
  const mm = Number(e.target.value);
  if (!(mm >= 1 && mm <= 1000)) { toast('Use a size between 1 and 1000 mm'); syncTextBar(); return; }
  state.text.fontSize = mm;
  if (textTarget()) applyToSelection((o) => ({ fontSize: (mm * MM) / (o.scaleY || 1) }));
};
$('tBold').onclick = () => setText({ fontWeight: $('tBold').classList.contains('on') ? 400 : 700 });
$('tItalic').onclick = () => setText({ fontStyle: $('tItalic').classList.contains('on') ? 'normal' : 'italic' });
$('tUnder').onclick = () => setText({ underline: !$('tUnder').classList.contains('on') });
for (const a of ['left', 'center', 'right', 'justify']) $(`tAlign-${a}`).onclick = () => setText({ textAlign: a });
/** Letter spacing in % of the font size (Fabric: thousandths of an em); line spacing in % of normal. */
$('tLetter').onchange = (e) => { const n = Math.max(-50, Math.min(500, Number(e.target.value) || 0)); setText({ charSpacing: n * 10 }); };
$('tLine').onchange = (e) => { const n = Math.max(50, Math.min(400, Number(e.target.value) || 100)); setText({ lineHeight: (n / 100) * LINE_NORMAL }); };

// Keyboard: CorelDRAW shortcuts.
const KEY_TOOLS = { f10: 'node', f5: 'draw', f6: 'rect', f7: 'ellipse', f8: 'text', y: 'polygon', s: 'star', d: 'graph', a: 'spiral', x: 'eraser', z: 'zoom', h: 'pan', g: 'fill', m: 'meshfill', i: 'eyedropper', v: 'select' };
const KEY_ALIGN = { l: 'L', r: 'R', t: 'T', b: 'B', e: 'C', c: 'M', p: 'P' };
addEventListener('keydown', (e) => {
  if (previewState) { e.preventDefault(); endPreview(); return; }
  if (e.key === 'F9') { e.preventDefault(); startPreview(); return; }
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
  else if (k === 'pageup' || k === 'pagedown') {
    e.preventDefault();
    // As in CorelDRAW: PgUp / PgDn change page; Ctrl moves the selection one step, Shift to the front / back.
    if (e.shiftKey || mod) {
      // The stacking order often changes nothing you can see (the object is already on top, or overlaps nothing): say what happened.
      if (!active().length) { toast('Select something first: Shift+PgUp / PgDn put it in front of or behind everything, Ctrl+PgUp / PgDn one step'); return; }
      const how = e.shiftKey ? (k === 'pageup' ? 'front' : 'back') : (k === 'pageup' ? 'forward' : 'backward');
      order(how);
      toast({ front: 'To the front of the page (Shift+PgUp)', back: 'To the back of the page (Shift+PgDn)', forward: 'Forward one (Ctrl+PgUp)', backward: 'Back one (Ctrl+PgDn)' }[how], 1800);
    } else gotoPage(pageIndex + (k === 'pageup' ? -1 : 1));
  }
  else if (k === 'delete' || k === 'backspace') { if (gradKeys && state.gradient) gradRemove(); else if (state.tool === 'anchor' && connView?.sel) deleteAnchor(connView.sel); else if (state.tool === 'varline' && varEdit) { if (varEdit.sel != null) deleteVarPoint(); else toast('Click a width point (it turns pink) to delete it; switch to Pick to delete the whole object'); } else removeSelection(); }
  else if (k === 'escape') {
    if (document.querySelector('.menu.open, .fly.open')) { closeMenus(); return; } // an open menu or list closes first
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
  inner: { label: 'Inner shadow', tool: 'inner', apply: 'fxInner', remove: 'fxInnerOff', inputs: { x: 'fxIX', y: 'fxIY', blur: 'fxIBlur', opacity: 'fxIOpacity', colour: 'fxIColour', merge: 'fxIMerge' } },
  contour: { label: 'Contour', tool: 'contour', apply: 'fxContour', remove: 'fxContourOff', inputs: { dir: 'fxCDir', steps: 'fxCSteps', offset: 'fxCOffset', colour: 'fxCColour' } },
  blockshadow: { label: 'Block shadow', tool: 'blockshadow', apply: 'fxBlock', remove: 'fxBlockOff', inputs: { x: 'fxBX', y: 'fxBY', colour: 'fxBColour' } },
  extrude: { label: 'Extrude', tool: 'extrude', apply: 'fxExtrude', remove: 'fxExtrudeOff', inputs: { x: 'fxXX', y: 'fxXY', colour: 'fxXColour' } },
  envelope: { label: 'Envelope', tool: 'envelope', apply: 'fxEnvelope', inputs: { preset: 'fxEPreset', amount: 'fxEAmount' } },
  distort: { label: 'Distortion', tool: 'distort', apply: 'fxDistort', inputs: { mode: 'fxDMode', tooth: 'fxDZip', teeth: 'fxDTeeth', turn: 'fxDTwist', amount: 'fxDPush' } },
  transparency: { label: 'Transparency', tool: 'transparency', apply: 'fxTransp', inputs: { type: 'fxTType', amount: 'fxTValue', angle: 'fxTAngle', merge: 'fxTMerge' } },
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
  if (o.globalCompositeOperation && o.globalCompositeOperation !== 'source-over') out.push(`merge mode ${o.globalCompositeOperation}`);
  if (o.fxInner) out.push(`inner shadow x ${o.fxInner.x} mm, y ${o.fxInner.y} mm, feather ${o.fxInner.blur} mm, ${o.fxInner.opacity}%`);
  const gp = o.type === 'group' ? paintParts(o)[0] : o;
  if (gp?.gradSpec && !gp.gradSpec.fade && gp.fill && typeof gp.fill === 'object') out.push(`${gradKind(gp.gradSpec)} gradient fill ${gradText(gp.gradSpec)}`);
  if (o.textOutlines?.length) out.push(`name / number outlines ${o.textOutlines.map((x) => `${x.w} mm ${x.c}`).join(' + ')}`);
  if (isText(o) && o.path) out.push(`on a path${o.pathDist ? `, ${o.pathDist} mm from it` : ''}`);
  if (o.varSpec) out.push(`variable outline (${VAR_NAMES[o.varSpec.profile] ?? 'custom'}, ${+o.varSpec.width.toFixed(1)} mm)`);
  if (/contour/.test(name)) out.push('contour');
  if (/blend group/.test(name)) out.push('blend');
  if (/envelope/.test(name)) out.push('envelope');
  if (/distortion/.test(name)) out.push('distortion');
  if (o.opacity < 1 || o.gradSpec?.fade) out.push(o.gradSpec?.fade ? 'transparency (fade)' : `transparency ${Math.round((1 - o.opacity) * 100)}%`);
  return out;
}
/** Whether an object already has the effect the assistant was asked to apply. */
const HAS_EFFECT = {
  shadow: (o) => !!o.shadow, inner: (o) => !!o.fxInner, blockshadow: (o) => o.fxSweep === 'blockshadow', extrude: (o) => o.fxSweep === 'extrude',
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
    const line = (o) => { const fx = effectsOf(o); return `${o.num != null ? `#${o.num} ` : ''}${objLabel(o)}${where(o)}${fx.length ? ` [${fx.join('; ')}]` : ''}${o.locked ? ' (locked)' : ''}${o.visible ? '' : ' (hidden)'}`; };
    const objs = userObjects(), sel = active();
    const pg = pages.length > 1 ? `Page ${pageIndex + 1} of ${pages.length} is open (${pages.map((p, i) => `${i + 1} “${p.name}”`).join(', ')}). ` : '';
    return `${projects.describe()}${pg}Selected: ${sel.length ? sel.map(line).join(' | ') : 'nothing'}. On the page (${objs.length}, top first): ${objs.slice().reverse().slice(0, 15).map(line).join(' | ')}${objs.length > 15 ? ' | …' : ''}. Tool: ${TOOLS[state.tool]?.label ?? state.tool}. Grid ${state.grid ? 'on' : 'off'}, snap ${state.snap ? 'on' : 'off'}. ${toolboxReport()}`;
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
  /** Pages: add, duplicate, delete, next, previous, a page number, or rename:<name>. */
  page: (v) => {
    const s = String(v || '').trim(), n = Number(s);
    if (s === 'add') { insertPage(); return `Page added after page ${pageIndex + 1}: it is open now (the tabs at the bottom left switch pages)`; }
    if (s === 'duplicate') { duplicatePage(); return `Page ${pageIndex + 1} duplicated: the copy is open now`; }
    if (s === 'delete') { if (pages.length < 2) throw new Error('The design has only one page: it cannot be deleted (File > New document clears it).'); deletePage(); return `Deleted ${pages[pageIndex].name} (Undo brings it back)`; }
    if (s === 'next' || s === 'previous') { const i = pageIndex + (s === 'next' ? 1 : -1); if (!pages[i]) throw new Error(`There is no ${s} page (this is page ${pageIndex + 1} of ${pages.length}).`); gotoPage(i); return `Opened ${pages[i].name} (page ${i + 1} of ${pages.length})`; }
    if (s.startsWith('rename:')) { renamePage(pageIndex, s.slice(7)); return `This page is now called ${pages[pageIndex].name}`; }
    if (Number.isInteger(n) && n >= 1) { if (!pages[n - 1]) throw new Error(`There are ${pages.length} pages: there is no page ${n}.`); gotoPage(n - 1); return `Opened ${pages[n - 1].name} (page ${n} of ${pages.length})`; }
    throw new Error('Page can be add, duplicate, delete, next, previous, a page number, or rename:<name>.');
  },
  /** A variable outline profile (optionally :width in mm) for the selected shapes and lines, or remove. */
  varline: (v) => {
    const [name, w] = String(v || '').split(':'), width = w ? parseFloat(w) : 0;
    if (!VAR_PROFILES[name] && name !== 'remove') throw new Error('Variable outline can be uniform, taper, taper-start, taper-end, bulge, pinch, wave or remove, optionally with a width in mm (taper:4).');
    const out = setVarProfile(name, width), n = `${out.length} object${out.length > 1 ? 's' : ''}`;
    if (name === 'remove') return `Back to an ordinary outline on ${n}`;
    return `Variable outline ${VAR_NAMES[name]}${width ? `, ${width} mm wide` : ''} on ${n}. Fine-tune it with the Variable Outline tool (button 3, Artistic Media flyout): drag on the outline to set the width there`;
  },
  /** Joins the two selected objects with a connector between their nearest anchors. */
  connect: (v) => {
    const kind = { straight: 'straight', right: 'right', 'right-angle': 'right', rounded: 'rounded' }[v || 'right'];
    if (!kind) throw new Error('Connect can be straight, right-angle or rounded.');
    const objs = canvas.getActiveObjects().filter(connectable);
    if (objs.length !== 2) throw new Error('Select the two objects to connect first (click one, Shift+click the other), then ask again.');
    const c = connectObjects(kind, objs[0], objs[1]);
    return `Joined ${objLabel(objs[0])} and ${objLabel(objs[1])} with a ${CONN_LABEL[kind]} (${c.name}). It stays attached when they move; change it on the property bar (Pick tool) or with Anchor Editing`;
  },
  select: (v) => {
    const [kind, ...rest] = v.split(':'), words = rest.join(':').trim().toLowerCase();
    const shown = userObjects().filter((o) => o.visible), all = shown.filter((o) => !o.locked);
    if (kind === 'id') {
      // By ID (#12, shown in the status bar): an object inside a group selects its group.
      const want = (words.match(/\d+/g) ?? []).map(Number), found = [], inside = [];
      if (!want.length) throw new Error('Give the ID number, e.g. id:12 (the status bar at the bottom shows the ID of the selected object).');
      for (const n of want) {
        const top = shown.find((o) => { let hit = false; eachPart(o, (x) => { if (x.num === n) hit = true; }); return hit; });
        if (!top) {
          const on = pages.findIndex((p, i) => i !== pageIndex && new RegExp(`.num.:${n}[,}]`).test(JSON.stringify(p.objects ?? [])));
          throw new Error(on >= 0 ? `#${n} is on ${pages[on].name} (page ${on + 1}): open that page first.` : `There is no #${n} on the page.`);
        }
        if (top.locked) throw new Error(`#${n} is locked: unlock it first (Object > Lock / unlock).`);
        if (top.num !== n) inside.push(`#${n} is part of #${top.num}`);
        if (!found.includes(top)) found.push(top);
      }
      setTool('select');
      select(found);
      return `Selected ${found.map((o) => `#${o.num} ${objLabel(o)}`).join(', ')}${inside.length ? ` (${inside.join('; ')}, so all of it is selected)` : ''}`;
    }
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
    const hex = colourOf(v), objs = active();
    const pics = objs.filter((o) => tintTargets(o).length), none = objs.filter((o) => !tintTargets(o).length && o.type === 'group' && !paintParts(o).length);
    if (none.length === objs.length) throw new Error(`${objs.map((o) => (o.num != null ? `#${o.num}` : objLabel(o))).join(', ')} has nothing that takes a fill colour.`);
    for (const o of objs) paintObject(o, hex, false);
    changed(canvas.getActiveObject());
    return pics.length === objs.length ? `Tinted ${pics.map((o) => `#${o.num}`).join(', ')} ${hex}: a picture has no fill, so it is recoloured in that colour, keeping its light and shade (Undo restores it)` : `Fill ${hex}${pics.length ? ` (the picture${pics.length > 1 ? 's are' : ' is'} tinted)` : ''}`;
  },
  /**
   * A gradient fill with any number of colours: "linear:red,gold 40%,black,angle=90" (colours spread evenly unless a %
   * is given), "radial:white,navy", a ready-made or saved gradient by name ("fire"), or none (a uniform fill again).
   */
  gradient: (v) => {
    needSelection();
    const raw = String(v).trim(), low = raw.toLowerCase(), objs = active();
    const ids = objs.map((o) => (o.num != null ? `#${o.num}` : objLabel(o))).join(', ');
    if (low === 'none') {
      for (const o of objs) applyProps(o, (x) => { if (!x.gradSpec || x.gradSpec.fade) return {}; const c = hexOf(gradStops(x.gradSpec)[0].color) ?? '#888888'; delete x.gradSpec; return { fill: c }; });
      changed(canvas.getActiveObject()); syncGradFromSelection();
      return `Gradient removed from ${ids}: a uniform fill in its first colour`;
    }
    const preset = GRAD_PRESETS.find(([n]) => n.toLowerCase() === low), saved = state.gradients.find((g) => g.name.toLowerCase() === low);
    let type = state.gradient ? gradKind(state.gradient) : 'linear', angle = state.gradient?.angle ?? 0, stops;
    if (preset || saved) stops = preset ? evenStops(preset[1]) : saved.stops.map((s) => ({ ...s }));
    else {
      const m = raw.match(/^(linear|radial)\s*:\s*(.+)$/i);
      if (!m) throw new Error(`A gradient is linear:<colours> or radial:<colours> (e.g. linear:red,gold 40%,black,angle=90), a ready-made one (${GRAD_PRESETS.map(([n]) => n).join(', ')}${state.gradients.length ? `, or saved: ${state.gradients.map((g) => g.name).join(', ')}` : ''}), or none.`);
      type = m[1].toLowerCase();
      const cols = [];
      for (const it of m[2].split(',').map((x) => x.trim()).filter(Boolean)) {
        const a = it.match(/^angle\s*=\s*(-?\d+(\.\d+)?)$/i);
        if (a) { angle = Number(a[1]); continue; }
        const p = it.match(/^(.*?)\s+(\d{1,3}(\.\d+)?)\s*%$/);
        cols.push({ color: colourOf(p ? p[1] : it).toUpperCase(), at: p ? Math.min(100, Number(p[2])) / 100 : null });
      }
      if (cols.length < 2) throw new Error('A gradient needs at least two colours, e.g. linear:red,black.');
      stops = cols.map((c, i) => ({ color: c.color, offset: c.at ?? i / (cols.length - 1) }));
    }
    const pics = objs.filter((o) => o.type === 'image' || (o.type === 'group' && !paintParts(o).length));
    if (pics.length === objs.length) throw new Error(`${ids} ${objs.length > 1 ? 'are pictures' : 'is a picture'}: a picture has no fill to take a gradient (a uniform colour tints it).`);
    const spec = { from: '', to: '', stops: gradStops({ stops }), angle, kind: type };
    spec.from = spec.stops[0].color; spec.to = spec.stops.at(-1).color;
    for (const o of objs) applyProps(o, (x) => { if (!fillable(x) || x.type === 'image') return {}; delete x.patSpec; x.gradSpec = cloneGrad(spec); return { fill: gradientFor(x) }; });
    changed(canvas.getActiveObject()); syncGradFromSelection();
    return `${type === 'radial' ? 'Radial' : 'Linear'} gradient on ${ids}: ${gradText(spec)}${pics.length ? ' (pictures have no fill and were left as they are)' : ''}`;
  },
  /**
   * Saved colour palettes (Colour tab and the start of the bottom palette): list, use:<name> (use:3deezi for the
   * built-in colours), save:<name>=<colours> (no colours: the selection's, or every colour in the design),
   * add:<name>=<colours>, remove:<name>=<colours>, rename:<old>=<new>, delete:<name>.
   */
  palette: (v) => {
    const raw = String(v).trim(), c = raw.indexOf(':'), op = (c < 0 ? raw : raw.slice(0, c)).trim().toLowerCase(), rest = c < 0 ? '' : raw.slice(c + 1).trim();
    const eq = rest.indexOf('='), name = (eq < 0 ? rest : rest.slice(0, eq)).trim(), after = eq < 0 ? '' : rest.slice(eq + 1).trim();
    const colours = () => after.split(',').map((x) => x.trim()).filter(Boolean).map((x) => colourOf(x).toUpperCase());
    const list = (p) => `${p.name} (${p.colours.join(', ') || 'no colours'})`;
    if (op === 'list') return state.palettes.length ? `Saved palettes: ${state.palettes.map(list).join('; ')}. Shown now: ${currentPalette()?.name ?? '3DEEZI + my colours'}.` : 'No saved palettes yet: the Colour tab shows the 3DEEZI colours and your saved colours.';
    if (!['use', 'save', 'add', 'remove', 'rename', 'delete'].includes(op)) throw new Error('Palette commands: list, use:<name>, save:<name>=<colours>, add:<name>=<colours>, remove:<name>=<colours>, rename:<old>=<new>, delete:<name>.');
    if (!name) throw new Error('Name the palette, e.g. save:Lions FC=navy,gold,white.');
    if (op === 'use' && /^(3deezi|default|my colours|built-in)/i.test(name)) { usePalette(''); return 'The Colour tab shows the 3DEEZI colours and your saved colours again'; }
    if (op === 'save') {
      const cols = after ? colours() : coloursOf(active().length ? active() : userObjects());
      if (!cols.length) throw new Error('There are no colours to save: name them, e.g. save:Lions FC=navy,gold,white.');
      const had = !!findPalette(name), p = savePalette(name, cols);
      return `${had ? 'Replaced' : 'Saved'} the palette ${list(p)}: it is shown in the Colour tab and at the start of the bottom palette`;
    }
    const p = findPalette(name);
    if (!p) throw new Error(`There is no palette called “${name}”${state.palettes.length ? ` (saved: ${state.palettes.map((x) => x.name).join(', ')})` : ' (none saved yet)'}.`);
    if (op === 'use') { usePalette(p.name); return `Showing the palette ${list(p)} in the Colour tab and at the start of the bottom palette`; }
    if (op === 'add') { const cols = colours(); if (!cols.length) throw new Error('Name the colours to add, e.g. add:Lions FC=silver.'); paletteAddColours(p, cols); return `Added ${cols.join(', ')}: ${list(p)}`; }
    if (op === 'remove') { const cols = colours(); p.colours = p.colours.filter((x) => !cols.includes(x)); savePrefs(); renderPalettes(); return `Removed ${cols.join(', ')}: ${list(p)}`; }
    if (op === 'rename') {
      const to = after.slice(0, 40);
      if (!to) throw new Error('Give the new name, e.g. rename:Lions FC=Lions 2027.');
      if (findPalette(to) && findPalette(to) !== p) throw new Error(`There is already a palette called ${to}.`);
      const was = p.name; p.name = to; if (state.palette === was) state.palette = to; savePrefs(); renderPalettes();
      return `Palette ${was} renamed ${to}`;
    }
    state.palettes = state.palettes.filter((x) => x !== p); if (state.palette === p.name) state.palette = ''; savePrefs(); renderPalettes();
    return `Palette ${p.name} deleted (its colours stay on your objects)`;
  },
  /**
   * Text settings for the selected text: font=<name>, size=<mm>, letter=<% of the font size>, line=<% of normal>,
   * align=left|center|right|justify, bold / italic / underline=on|off.
   */
  textStyle: (v) => {
    needSelection();
    const texts = active().flatMap((o) => (isText(o) ? [o] : o.type === 'group' ? o.getObjects().filter(isText) : []));
    if (!texts.length) {
      const o = active()[0], what = o ? `${o.num != null ? `#${o.num} ` : ''}${objLabel(o)}` : 'it';
      // Text converted to curves looks like text but is a shape now: say so.
      if (o && (/curves/i.test(o.name ?? '') || o.type === 'path')) throw new Error(`${o.num != null ? `#${o.num} ` : ''}${o.name || 'The selected shape'} is not text any more (it was converted to curves), so text settings and name outlines don't apply to it. Type the text again with the Text tool (or ask me to add it), or give the curves an outline with the Outline pen.`);
      throw new Error(`Select a text first (the Text tool or the Pick tool)${o ? `: ${what} is not a text` : ''}.`);
    }
    const opts = Object.fromEntries(String(v).split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const k = x.indexOf('='); return k < 0 ? [x.toLowerCase(), ''] : [x.slice(0, k).trim().toLowerCase(), x.slice(k + 1).trim()]; }));
    const props = {}, said = [], onOff = (x) => /^(on|yes|true|1)$/i.test(x);
    if (opts.font != null) {
      const f = FONTS.find((x) => x.family.toLowerCase() === opts.font.toLowerCase()) ?? FONTS.find((x) => x.family.toLowerCase().startsWith(opts.font.toLowerCase()));
      if (!f) throw new Error(`There is no font “${opts.font}” here. Fonts: ${FONTS.map((x) => x.family).join(', ')} (or upload one: font list > Upload a font).`);
      props.fontFamily = f.family; said.push(`font ${f.family}`);
    }
    if (opts.letter != null) { const n = Math.max(-50, Math.min(500, parseFloat(opts.letter) || 0)); props.charSpacing = n * 10; said.push(`letter spacing ${n}%`); }
    if (opts.line != null) { const n = Math.max(50, Math.min(400, parseFloat(opts.line) || 100)); props.lineHeight = (n / 100) * LINE_NORMAL; said.push(`line spacing ${n}%`); }
    if (opts.align != null) {
      const a = { centre: 'center', middle: 'center' }[opts.align.toLowerCase()] ?? opts.align.toLowerCase();
      if (!['left', 'center', 'right', 'justify'].includes(a)) throw new Error('align can be left, center, right or justify.');
      props.textAlign = a; said.push(a === 'justify' ? 'justified' : `aligned ${a}`);
    }
    if (opts.bold != null) { props.fontWeight = onOff(opts.bold) ? 700 : 400; said.push(onOff(opts.bold) ? 'bold' : 'not bold'); }
    if (opts.italic != null) { props.fontStyle = onOff(opts.italic) ? 'italic' : 'normal'; said.push(onOff(opts.italic) ? 'italic' : 'not italic'); }
    if (opts.underline != null) { props.underline = onOff(opts.underline); said.push(onOff(opts.underline) ? 'underlined' : 'not underlined'); }
    let outlines = null;
    if (opts.outline != null || opts.outline2 != null) {
      const read = (v) => { if (v == null) return null; if (/^(none|off|0)$/i.test(v)) return { w: 0 }; const m = v.match(/^\s*([\d.]+)\s*(?:mm)?\s*[:\s]\s*(.+)$/i); if (!m) throw new Error('An outline is <mm>:<colour>, e.g. outline=2:navy (or outline=none).'); return { w: Math.min(50, parseFloat(m[1])), c: colourOf(m[2]).toUpperCase() }; };
      outlines = [read(opts.outline), read(opts.outline2)];
      said.push(outlines[0]?.w === 0 && !outlines[1]?.w ? 'outlines removed' : `outlines ${outlines.filter((x) => x?.w).map((x) => `${x.w} mm ${x.c}`).join(' + ')}`);
    }
    const mm = opts.size != null ? parseFloat(opts.size) : null;
    if (mm != null && !(mm >= 1 && mm <= 1000)) throw new Error('size is in mm, between 1 and 1000.');
    if (!Object.keys(props).length && mm == null && !outlines) throw new Error('Say what to change: font, size, letter, line, align, bold, italic, underline, outline or outline2.');
    for (const t of texts) {
      t.set({ ...props, ...(mm != null ? { fontSize: (mm * MM) / (t.scaleY || 1) } : {}) }); t.initDimensions?.(); t.setCoords(); t.group?.set('dirty', true);
      if (outlines) { const cur = t.textOutlines ?? []; const next = [0, 1].map((i) => outlines[i] ?? cur[i]).filter((x) => x?.w > 0); setTextOutlines(t, outlines[0]?.w === 0 && !outlines[1] ? [] : next); }
    }
    if (mm != null) said.push(`${mm} mm`);
    Object.assign(state.text, props);
    changed(canvas.getActiveObject()); syncTextBar();
    return `Text ${texts.map((t) => (t.num != null ? `#${t.num}` : `“${String(t.text).slice(0, 20)}”`)).join(', ')}: ${said.join(', ')}`;
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
    const label = menuLabel(v).replace(/^✓\s*/, '');
    ACTIONS[v]();
    // Show / hide items say what they did (the tick on the menu shows the state before the click).
    const part = v.startsWith('win_') ? v.slice(4) : null;
    if (part && UI_PARTS[part]) return `${label} ${document.body.classList.contains(UI_PARTS[part]) ? 'hidden' : 'shown'}`;
    if (v === 'snapToggle') return `Snap ${state.snap ? 'on' : 'off'}`;
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
  load: (json) => { if (pcEdit) { dropHelper(pcEdit.helper); pcEdit = null; muted = Math.max(0, muted - 1); } return restore(typeof json === 'string' ? json : JSON.stringify(json)).then((r) => { compactNums(); syncProps(); return r; }); },
  clear: () => ACTIONS.new(),
  toast: (text) => toast(String(text ?? '')),
  receive: (msg) => {
    const m = typeof msg === 'string' ? JSON.parse(msg) : msg;
    if (m && m.cmd !== 'receive' && typeof window.artboard[m.cmd] === 'function') window.artboard[m.cmd](m.arg);
  },
};
// The account (projects.js): host {docs, signedIn, kit, garments, placements}, docsReply {id, ok, data}, openDoc {id}.
Object.assign(window.artboard, projects.bridge);
// Automated tests only (?debug): reach the canvas from the browser.
if (params.has('debug')) window.__ab = { canvas, nodes, state, setTool, V, B, F: { Rect, IText, FabricImage, Group, Path }, geom: { mode: () => (geomWorker ? 'worker' : geomWorker === false ? 'page' : 'not started'), limit: (ms) => { GEOM_LIMIT = ms; }, stop: () => stopGeom(new Error('stopped')) }, projects };
addEventListener('message', (e) => { if (e.source === window.parent && typeof e.data === 'string') { try { window.artboard.receive(e.data); } catch { /* not for us */ } } });

// ===================================================================
// Start
// ===================================================================
(async () => {
  // Load the embedded fonts before any text is measured.
  await Promise.all(fontLoads);
  await loadMyFonts();
  await document.fonts.ready;
  resize();
  setTarget('fill');
  renderPalettes();
  renderGradPresets();
  renderAssets();
  initContextValues();
  renderToolbox();
  showPageInfo();
  // The design kept on this device (projects.js: a big one is in the browser's database).
  const saved = await loadLocal(STORE, OLD_STORE);
  if (saved) await restore(saved).catch(() => {});
  projects.started(!!saved);
  compactNums();
  if (!userObjects().length) {
    // A starter so the page isn't blank: editable 3DEEZI-style badge text.
    const t = style(new IText('YOUR TEAM', { left: page.width / 2, top: page.height / 2, originX: 'center', originY: 'center', fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 70 * MM, fill: '#1E7BFF', toolName: 'Text' }));
    canvas.add(t);
    starter = t;
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
