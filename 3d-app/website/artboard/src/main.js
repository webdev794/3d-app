// 3DEEZI Artboard: a focused, CorelDRAW-style artwork editor for logos,
// badges and graphics, built on Fabric.js. One self-contained page shared by
// the React website (iframe) and the Flutter apps (WebView). Finished
// artwork goes to the 3D studio with "Send to 3D Studio".
//
// Host bridge (same shape as the 3D viewer):
//   host -> artboard: window.artboard.receive({cmd, arg})
//     setAssets [{name, src}]   addImage {src, name}   load <json>   clear
//   artboard -> host: {type:'ready'} {type:'artwork', data, name}
//     {type:'saved', json} {type:'export', data, format}

import {
  Canvas, Rect, Ellipse, Polygon, Polyline, Line, Path, IText, FabricImage, PencilBrush,
  ActiveSelection, Group, Gradient, Point, util, controlsUtils,
} from 'fabric';
import { ICONS } from './icons.js';

// ===================================================================
// Setup
// ===================================================================
const params = new URLSearchParams(location.search);
const HOST = params.get('host');
const STORE = `3deezi.artboard.${HOST || 'web'}`;
const MM = 2;                       // world units per millimetre
const BRAND = ['#12E1F0', '#1E7BFF', '#7B4DFF', '#E8EDF2', '#5D6B7B', '#000000'];
const PAGES = { '500 x 400 mm': [500, 400], 'A4 landscape': [297, 210], 'A4 portrait': [210, 297], '300 x 300 mm': [300, 300], 'Chest logo 120 x 120 mm': [120, 120] };
const $ = (id) => document.getElementById(id);
const icon = (name) => `<svg class="i" viewBox="0 0 24 24">${ICONS[name] ?? ''}</svg>`;

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
// Selection handles in the 3DEEZI style.
Object.assign(Rect.prototype, {});
const handleStyle = { borderColor: '#1E7BFF', cornerColor: '#ffffff', cornerStrokeColor: '#1E7BFF', cornerStyle: 'rect', cornerSize: 9, transparentCorners: false, borderScaleFactor: 1.2, padding: 2 };

let pageSize = [500, 400];
const page = new Rect({ left: 0, top: 0, width: pageSize[0] * MM, height: pageSize[1] * MM, fill: '#ffffff', selectable: false, evented: false, excludeFromExport: true, hoverCursor: 'default', shadow: { color: 'rgba(0,0,0,.55)', blur: 30, offsetX: 0, offsetY: 8 } });
page.isPage = true;
canvas.add(page);

const state = { tool: 'select', fill: '#12E1F0', stroke: '#ffffff', strokeWidth: 0, dash: 'solid', opacity: 1, target: 'fill', polySides: 6, star: false, snap: true, grid: false, recent: [], saved: [], gradient: null, drawKind: 'freehand' };
try { Object.assign(state, JSON.parse(localStorage.getItem(`${STORE}.prefs`) || '{}')); } catch { /* fresh */ }
const savePrefs = () => { try { localStorage.setItem(`${STORE}.prefs`, JSON.stringify({ recent: state.recent, saved: state.saved, snap: state.snap, grid: state.grid })); } catch { /* private mode */ } };

const toast = (text) => { const t = $('toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400); };
const hint = (text) => { const h = $('hint'); h.textContent = text || ''; h.classList.toggle('show', !!text); };

// ===================================================================
// Viewport: fit, zoom, pan, rulers, grid
// ===================================================================
function resize() {
  canvas.setDimensions({ width: wrap.clientWidth, height: wrap.clientHeight });
  drawRulers();
}
function fit() {
  const pad = 40, w = wrap.clientWidth - pad * 2, h = wrap.clientHeight - pad * 2;
  const z = Math.min(w / page.width, h / page.height);
  canvas.setViewportTransform([z, 0, 0, z, (wrap.clientWidth - page.width * z) / 2, (wrap.clientHeight - page.height * z) / 2]);
  afterZoom();
}
function zoomAt(z, point) {
  z = Math.min(20, Math.max(0.05, z));
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

canvas.on('mouse:wheel', (opt) => {
  const e = opt.e;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey || state.tool === 'zoom' || !e.shiftKey) {
    zoomAt(canvas.getZoom() * 0.999 ** e.deltaY, new Point(e.offsetX, e.offsetY));
  } else {
    const vpt = canvas.viewportTransform; vpt[4] -= e.deltaX || e.deltaY; canvas.setViewportTransform(vpt); drawRulers();
  }
});
// Pan: middle mouse, space + drag, or two fingers.
let panning = null, spaceDown = false;
const touches = new Map();
wrap.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (e.button === 1 || spaceDown || touches.size === 2) {
    panning = { x: e.clientX, y: e.clientY, dist: touches.size === 2 ? pinchDist() : 0, zoom: canvas.getZoom() };
    canvas.selection = false;
    if (touches.size === 2) canvas.discardActiveObject();
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
const endPan = (e) => { touches.delete(e.pointerId); if (panning && touches.size < 2) { panning = null; canvas.selection = state.tool === 'select'; } };
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
    const pxPerMm = z * MM;
    const step = [1, 2, 5, 10, 25, 50, 100, 250].find((s) => s * pxPerMm >= 40) ?? 500;
    const len = horizontal ? r.width : r.height;
    const start = Math.floor(-off / pxPerMm / step) * step;
    for (let mm = start; mm * pxPerMm + off < len; mm += step / 5) {
      const p = mm * pxPerMm + off;
      const major = Math.abs(mm % step) < 1e-6;
      g.beginPath();
      if (horizontal) { g.moveTo(p, 24); g.lineTo(p, major ? 10 : 18); } else { g.moveTo(24, p); g.lineTo(major ? 10 : 18, p); }
      g.stroke();
      if (major) {
        if (horizontal) g.fillText(String(Math.round(mm)), p + 3, 10);
        else { g.save(); g.translate(10, p - 3); g.rotate(-Math.PI / 2); g.fillText(String(Math.round(mm)), 0, 0); g.restore(); }
      }
    }
  }
}
// Optional grid (every 10 mm) drawn under the objects.
canvas.on('before:render', () => {
  if (!state.grid) return;
  const g = canvas.getContext(), vpt = canvas.viewportTransform;
  g.save();
  g.setTransform(vpt[0] * canvas.getRetinaScaling(), 0, 0, vpt[3] * canvas.getRetinaScaling(), vpt[4] * canvas.getRetinaScaling(), vpt[5] * canvas.getRetinaScaling());
  g.strokeStyle = 'rgba(30,123,255,.14)'; g.lineWidth = 1 / vpt[0];
  for (let x = 0; x <= page.width; x += 10 * MM) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, page.height); g.stroke(); }
  for (let y = 0; y <= page.height; y += 10 * MM) { g.beginPath(); g.moveTo(0, y); g.lineTo(page.width, y); g.stroke(); }
  g.restore();
});
canvas.on('after:render', () => {
  if (!state.grid) return;
});

// ===================================================================
// Objects: styling, naming, snapping
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
  o.set({ fill: state.gradient ? gradientFor(o) : state.fill, stroke: w ? state.stroke : null, strokeWidth: w, strokeDashArray: w ? strokeDash(w) : null, opacity: state.opacity, strokeUniform: true });
  return o;
}
function gradientFor(o) {
  const { from, to, angle } = state.gradient;
  const a = (angle * Math.PI) / 180, w = o.width || 100, h = o.height || 100;
  return new Gradient({ type: 'linear', gradientUnits: 'pixels', coords: { x1: w / 2 - (Math.sin(a) * w) / 2, y1: h / 2 - (Math.cos(a) * h) / 2, x2: w / 2 + (Math.sin(a) * w) / 2, y2: h / 2 + (Math.cos(a) * h) / 2 }, colorStops: [{ offset: 0, color: from }, { offset: 1, color: to }] });
}
canvas.on('object:moving', (e) => {
  if (!state.snap) return;
  const o = e.target, s = 5 * MM;
  o.set({ left: Math.round(o.left / s) * s, top: Math.round(o.top / s) * s });
});

// ===================================================================
// History (undo / redo) and autosave
// ===================================================================
const EXTRA = ['name', 'toolName', 'lockMovementX', 'lockMovementY', 'lockScalingX', 'lockScalingY', 'lockRotation', 'hasControls', 'selectable'];
let history = [], future = [], restoring = false, saveTimer = null;
const snapshot = () => JSON.stringify({ page: pageSize, objects: userObjects().map((o) => o.toObject(EXTRA)) });
function record() {
  if (restoring) return;
  const snap = snapshot();
  if (history.at(-1) === snap) return;
  history.push(snap);
  if (history.length > 80) history.shift();
  future = [];
  syncHistory();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, snap); } catch { /* too big for storage */ } }, 600);
}
async function restore(snap) {
  restoring = true;
  const data = JSON.parse(snap);
  for (const o of userObjects()) canvas.remove(o);
  setPage(data.page ?? pageSize, false);
  const objects = await util.enlivenObjects(data.objects ?? []);
  for (const o of objects) { style(o); canvas.add(o); }
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  restoring = false;
  refreshLayers();
  syncProps();
}
function syncHistory() {
  $('undo').disabled = history.length < 2;
  $('redo').disabled = !future.length;
}
async function undo() { if (history.length < 2) return; future.push(history.pop()); await restore(history.at(-1)); syncHistory(); }
async function redo() { if (!future.length) return; const s = future.pop(); history.push(s); await restore(s); syncHistory(); }
for (const ev of ['object:added', 'object:removed', 'object:modified']) canvas.on(ev, () => { refreshLayers(); record(); });

// ===================================================================
// Tools
// ===================================================================
const TOOL_HINTS = {
  select: '', node: 'Select a line, polygon or pen shape, then drag its points',
  crop: 'Select an image, then drag over the part to keep', zoom: 'Click to zoom in · Alt+click to zoom out',
  draw: 'Freehand: drag to draw', line: 'Drag to draw a straight line', bezier: 'Click to add points · double-click to finish (smooth curve)',
  pen: 'Click to add points · click the first point to close · double-click to finish', polyline: 'Click to add points · double-click to finish',
  rect: 'Drag to draw a rectangle (Shift = square)', ellipse: 'Drag to draw an ellipse (Shift = circle)', polygon: 'Drag to draw a polygon',
  text: 'Click on the page to add text', fill: 'Click an object to fill it with the current colour', eyedropper: 'Click an object to pick its colour',
};
function setTool(tool) {
  finishPath();
  state.tool = tool;
  for (const b of document.querySelectorAll('.tool[data-tool]')) b.classList.toggle('on', b.dataset.tool === tool || (tool in DRAW_KINDS && b.dataset.tool === 'draw-menu'));
  canvas.isDrawingMode = tool === 'draw';
  if (canvas.isDrawingMode) {
    canvas.freeDrawingBrush = new PencilBrush(canvas);
    canvas.freeDrawingBrush.color = state.stroke === '#ffffff' && !state.strokeWidth ? state.fill : state.stroke;
    canvas.freeDrawingBrush.width = Math.max(1, state.strokeWidth || 2) * MM;
  }
  const drawing = tool !== 'select' && tool !== 'node';
  canvas.selection = !drawing;
  canvas.defaultCursor = tool === 'zoom' ? 'zoom-in' : drawing ? 'crosshair' : 'default';
  for (const o of userObjects()) o.selectable = !drawing && !o.locked;
  if (tool !== 'node') endNodeEdit();
  if (drawing) canvas.discardActiveObject();
  canvas.requestRenderAll();
  hint(TOOL_HINTS[tool] ?? '');
  if (tool === 'image') { $('fileImage').click(); setTool('select'); }
}
const DRAW_KINDS = { draw: 'Freehand', line: '2-Point Line', bezier: 'Bézier', pen: 'Pen', polyline: 'Polyline' };

let drag = null, path = null;
canvas.on('mouse:down', (opt) => {
  if (panning || spaceDown) return;
  const p = canvas.getScenePoint(opt.e);
  const tool = state.tool;
  if (tool === 'zoom') { zoomAt(canvas.getZoom() * (opt.e.altKey ? 0.6 : 1.6), canvas.getViewportPoint(opt.e)); return; }
  if (tool === 'fill' || tool === 'eyedropper') {
    const target = opt.target && !opt.target.isPage ? opt.target : null;
    if (!target) return;
    if (tool === 'fill') { target.set(state.target === 'fill' ? { fill: state.gradient ? gradientFor(target) : state.fill } : { stroke: state.stroke }); canvas.fire('object:modified', { target }); canvas.requestRenderAll(); }
    else { const c = typeof target.fill === 'string' ? target.fill : target.stroke; if (c) { setColour(c); toast(`Picked ${c.toUpperCase()}`); } }
    return;
  }
  if (tool === 'text') {
    const t = style(paint(new IText('Your text', { left: p.x, top: p.y, fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 40 * MM, originX: 'center', originY: 'center' })), { toolName: 'Text' });
    t.set({ strokeWidth: 0, stroke: null });
    canvas.add(t); canvas.setActiveObject(t); setTool('select'); t.enterEditing(); t.selectAll();
    return;
  }
  if (['bezier', 'pen', 'polyline'].includes(tool)) { addPathPoint(p); return; }
  if (tool === 'crop') { const img = canvas.getActiveObject(); if (img?.type !== 'image') { toast('Select an image first'); return; } drag = { tool, start: p, img, rect: helperRect(p) }; return; }
  if (!['rect', 'ellipse', 'polygon', 'line'].includes(tool)) return;
  let o;
  if (tool === 'rect') o = new Rect({ left: p.x, top: p.y, width: 1, height: 1, toolName: 'Rectangle' });
  if (tool === 'ellipse') o = new Ellipse({ left: p.x, top: p.y, rx: 1, ry: 1, toolName: 'Ellipse' });
  if (tool === 'polygon') o = new Polygon(polyPoints(1, 1), { left: p.x, top: p.y, toolName: state.star ? 'Star' : 'Polygon' });
  if (tool === 'line') { o = new Line([p.x, p.y, p.x, p.y], { toolName: 'Line' }); }
  paint(o);
  if (tool === 'line') o.set({ stroke: state.strokeWidth ? state.stroke : state.fill, strokeWidth: Math.max(1, state.strokeWidth || 1.5) * MM, fill: null });
  style(o);
  o.selectable = false;
  canvas.add(o);
  drag = { tool, start: p, o };
});
canvas.on('mouse:move', (opt) => {
  const p = canvas.getScenePoint(opt.e);
  if (path) { path.preview?.set({ x2: p.x, y2: p.y }); canvas.requestRenderAll(); }
  if (!drag) return;
  let w = p.x - drag.start.x, h = p.y - drag.start.y;
  if (opt.e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
  const left = Math.min(drag.start.x, drag.start.x + w), top = Math.min(drag.start.y, drag.start.y + h);
  const o = drag.o;
  if (drag.tool === 'rect') o.set({ left, top, width: Math.abs(w), height: Math.abs(h) });
  else if (drag.tool === 'ellipse') o.set({ left, top, rx: Math.abs(w) / 2, ry: Math.abs(h) / 2 });
  else if (drag.tool === 'polygon') { const pts = polyPoints(Math.abs(w), Math.abs(h)); o.set({ points: pts, left, top }); o.setDimensions?.(); o._setPositionDimensions?.({}); o.set({ left, top }); }
  else if (drag.tool === 'line') o.set({ x2: p.x, y2: p.y });
  else if (drag.tool === 'crop') drag.rect.set({ left, top, width: Math.abs(w), height: Math.abs(h) });
  o?.setCoords();
  canvas.requestRenderAll();
});
canvas.on('mouse:up', () => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.tool === 'crop') return applyCrop(d);
  const o = d.o;
  if ((o.width ?? 0) < 2 && (o.height ?? 0) < 2 && d.tool !== 'line') {
    // A click without dragging: drop a default-sized shape.
    if (d.tool === 'rect') o.set({ width: 60 * MM, height: 40 * MM });
    if (d.tool === 'ellipse') o.set({ rx: 30 * MM, ry: 30 * MM });
    if (d.tool === 'polygon') { o.set({ points: polyPoints(60 * MM, 60 * MM) }); o._setPositionDimensions?.({}); }
  }
  o.selectable = true;
  o.setCoords();
  canvas.setActiveObject(o);
  canvas.fire('object:modified', { target: o });
  setTool('select');
});
canvas.on('path:created', (e) => { style(e.path, { toolName: 'Freehand' }); e.path.name = `Freehand ${++counter}`; record(); refreshLayers(); });

function polyPoints(w, h) {
  const n = Math.max(3, state.polySides), pts = [];
  const count = state.star ? n * 2 : n;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const r = state.star && i % 2 ? 0.45 : 1;
    pts.push({ x: w / 2 + (Math.cos(a) * w / 2) * r, y: h / 2 + (Math.sin(a) * h / 2) * r });
  }
  return pts;
}

// Pen, Bézier and polyline: click points, double-click (or Enter) to finish.
function addPathPoint(p) {
  if (!path) {
    path = { kind: state.tool, points: [p], marks: [] };
  } else {
    const first = path.points[0];
    if (path.kind === 'pen' && path.points.length > 2 && Math.hypot(p.x - first.x, p.y - first.y) < 10 / canvas.getZoom()) { finishPath(true); return; }
    path.points.push(p);
  }
  const mark = new Ellipse({ left: p.x, top: p.y, rx: 4 / canvas.getZoom(), ry: 4 / canvas.getZoom(), originX: 'center', originY: 'center', fill: '#12E1F0', selectable: false, evented: false, excludeFromExport: true });
  mark.isHelper = true;
  path.marks.push(mark);
  canvas.add(mark);
  if (path.preview) canvas.remove(path.preview);
  path.preview = new Line([p.x, p.y, p.x, p.y], { stroke: '#12E1F0', strokeWidth: 1.5 / canvas.getZoom(), strokeDashArray: [5, 4], selectable: false, evented: false, excludeFromExport: true });
  path.preview.isHelper = true;
  canvas.add(path.preview);
  if (path.points.length > 1) {
    const [a, b] = path.points.slice(-2);
    const seg = new Line([a.x, a.y, b.x, b.y], { stroke: '#12E1F0', strokeWidth: 1.5 / canvas.getZoom(), selectable: false, evented: false, excludeFromExport: true });
    seg.isHelper = true; path.marks.push(seg); canvas.add(seg);
  }
  canvas.requestRenderAll();
}
canvas.on('mouse:dblclick', () => { if (path) finishPath(); });
function finishPath(close = false) {
  if (!path) return;
  const { kind, marks, preview } = path;
  // A double-click adds one extra point; drop exact duplicates.
  const pts = path.points.filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) > 0.5);
  for (const m of [...marks, preview]) if (m) canvas.remove(m);
  path = null;
  if (pts.length < 2) { canvas.requestRenderAll(); return; }
  let o;
  if (kind === 'bezier') {
    // Smooth Catmull-Rom curve through the points, as cubic Béziers.
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
      d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
    }
    o = new Path(d, { toolName: 'Curve' });
    o.set({ fill: null, stroke: state.strokeWidth ? state.stroke : state.fill, strokeWidth: Math.max(1, state.strokeWidth || 1.5) * MM, strokeUniform: true });
  } else if (close) {
    o = paint(new Polygon(pts, { toolName: 'Pen shape' }));
  } else {
    o = new Polyline(pts, { toolName: kind === 'pen' ? 'Pen line' : 'Polyline' });
    o.set({ fill: null, stroke: state.strokeWidth ? state.stroke : state.fill, strokeWidth: Math.max(1, state.strokeWidth || 1.5) * MM, strokeUniform: true });
  }
  style(o);
  canvas.add(o);
  canvas.setActiveObject(o);
  setTool('select');
}

// Node editing for lines, polygons and pen shapes.
let nodeTarget = null;
function startNodeEdit(o) {
  if (!o || !['polygon', 'polyline'].includes(o.type)) { toast('Node editing works on pen shapes, polylines and polygons'); return; }
  endNodeEdit();
  nodeTarget = o;
  o.cornerStyle = 'circle';
  o.cornerColor = '#12E1F0';
  o.hasBorders = false;
  o.controls = controlsUtils.createPolyControls(o);
  canvas.setActiveObject(o);
  canvas.requestRenderAll();
}
function endNodeEdit() {
  if (!nodeTarget) return;
  const o = nodeTarget; nodeTarget = null;
  o.cornerStyle = 'rect'; o.cornerColor = '#ffffff'; o.hasBorders = true;
  o.controls = controlsUtils.createObjectDefaultControls();
  canvas.requestRenderAll();
}
canvas.on('selection:created', (e) => { if (state.tool === 'node') startNodeEdit(e.selected?.[0]); });

// Crop an image to a dragged rectangle.
function helperRect(p) {
  const r = new Rect({ left: p.x, top: p.y, width: 1, height: 1, fill: 'rgba(18,225,240,.15)', stroke: '#12E1F0', strokeDashArray: [6, 4], strokeWidth: 1.5 / canvas.getZoom(), selectable: false, evented: false, excludeFromExport: true });
  r.isHelper = true; canvas.add(r); return r;
}
function applyCrop({ img, rect }) {
  canvas.remove(rect);
  const inv = util.invertTransform(img.calcTransformMatrix());
  const a = util.transformPoint(new Point(rect.left, rect.top), inv), b = util.transformPoint(new Point(rect.left + rect.width, rect.top + rect.height), inv);
  // Local coordinates are centred; convert to the image's own pixel space.
  const x0 = Math.max(0, Math.min(a.x, b.x) + img.width / 2), y0 = Math.max(0, Math.min(a.y, b.y) + img.height / 2);
  const x1 = Math.min(img.width, Math.max(a.x, b.x) + img.width / 2), y1 = Math.min(img.height, Math.max(a.y, b.y) + img.height / 2);
  if (x1 - x0 < 4 || y1 - y0 < 4) { setTool('select'); return; }
  const centre = util.transformPoint(new Point((x0 + x1) / 2 - img.width / 2, (y0 + y1) / 2 - img.height / 2), img.calcTransformMatrix());
  img.set({ cropX: (img.cropX || 0) + x0, cropY: (img.cropY || 0) + y0, width: x1 - x0, height: y1 - y0 });
  img.setPositionByOrigin(centre, 'center', 'center');
  img.setCoords();
  canvas.fire('object:modified', { target: img });
  setTool('select');
  toast('Image cropped · Undo restores it');
}

// ===================================================================
// Images and assets
// ===================================================================
const readFile = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
let assets = [];
async function addImage(src, name = 'Image', at) {
  const img = await FabricImage.fromURL(src, { crossOrigin: 'anonymous' });
  const k = Math.min((page.width * 0.6) / img.width, (page.height * 0.6) / img.height, 1 * MM * 4);
  img.set({ scaleX: k, scaleY: k, originX: 'center', originY: 'center', left: at?.x ?? page.width / 2, top: at?.y ?? page.height / 2, toolName: 'Image' });
  img.name = name.replace(/\.[a-z]+$/i, '') || 'Image';
  style(img);
  canvas.add(img);
  canvas.setActiveObject(img);
  canvas.requestRenderAll();
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
$('fileImage').onchange = async (e) => {
  for (const file of e.target.files) {
    if (file.size > 8 * 1024 * 1024) { toast('Use images under 8 MB'); continue; }
    const src = await readFile(file);
    addAsset(src, file.name);
    await addImage(src, file.name);
  }
  e.target.value = '';
};
$('assetUpload').onclick = () => $('fileImage').click();
wrap.addEventListener('dragover', (e) => e.preventDefault());
wrap.addEventListener('drop', async (e) => {
  e.preventDefault();
  const r = wrap.getBoundingClientRect();
  const at = util.transformPoint(new Point(e.clientX - r.left, e.clientY - r.top), util.invertTransform(canvas.viewportTransform));
  const src = e.dataTransfer.getData('text/x-asset');
  if (src) return addImage(src, 'Asset', at);
  for (const file of e.dataTransfer.files) if (file.type.startsWith('image/')) { const s = await readFile(file); addAsset(s, file.name); await addImage(s, file.name, at); }
});

// ===================================================================
// Property bar and Properties tab
// ===================================================================
const active = () => canvas.getActiveObjects();
const one = () => (active().length === 1 ? active()[0] : null);
function applyToSelection(props, label) {
  const objs = active();
  if (!objs.length) return false;
  for (const o of objs) { o.set(typeof props === 'function' ? props(o) : props); o.setCoords(); }
  canvas.requestRenderAll();
  canvas.fire('object:modified', { target: objs[0] });
  if (label) toast(label);
  return true;
}
function syncProps() {
  const o = one();
  const has = active().length > 0;
  for (const id of ['del', 'dup', 'front', 'back', 'lock', 'alL', 'alC', 'alR', 'alT', 'alM', 'alB', 'flipH', 'flipV']) $(id).disabled = !has;
  $('group').disabled = active().length < 2 && one()?.type !== 'group';
  const fill = o && typeof o.fill === 'string' ? o.fill : state.fill;
  $('fillChip').style.background = (o ? o.fill : state.fill) ? (typeof (o?.fill ?? state.fill) === 'string' ? fill : 'linear-gradient(110deg,#12E1F0,#1E7BFF)') : '';
  $('fillChip').classList.toggle('none', !!o && !o.fill);
  const stroke = o ? o.stroke : state.strokeWidth ? state.stroke : null;
  $('strokeChip').style.background = stroke || '';
  $('strokeChip').classList.toggle('none', !stroke || !(o ? o.strokeWidth : state.strokeWidth));
  $('strokeWidth').value = String(o ? +(o.strokeWidth / MM).toFixed(1) : state.strokeWidth);
  $('opacity').value = String(Math.round((o ? o.opacity : state.opacity) * 100));
  $('lock').classList.toggle('on', !!o?.locked);
  if (o) {
    const b = o.getBoundingRect();
    $('posX').value = (b.left / MM).toFixed(1); $('posY').value = (b.top / MM).toFixed(1);
    $('sizeW').value = (b.width / MM).toFixed(1); $('sizeH').value = (b.height / MM).toFixed(1);
  } else for (const id of ['posX', 'posY', 'sizeW', 'sizeH']) $(id).value = '';
  // Properties tab.
  $('propsEmpty').style.display = o ? 'none' : 'block';
  $('propsBody').style.display = o ? 'flex' : 'none';
  $('textProps').style.display = o && o.type === 'i-text' ? 'flex' : 'none';
  $('rectProps').style.display = o && o.type === 'rect' ? 'flex' : 'none';
  if (o) {
    $('pName').value = o.name ?? '';
    $('pAngle').value = String(Math.round(o.angle || 0));
    if (o.type === 'i-text') { $('pFont').value = o.fontFamily; $('pSize').value = String(Math.round(o.fontSize / MM)); $('pWeight').value = String(o.fontWeight); $('pSpacing').value = String(o.charSpacing || 0); }
    if (o.type === 'rect') $('pRadius').value = String(+((o.rx || 0) / MM).toFixed(1));
  }
  refreshLayers();
}
for (const ev of ['selection:created', 'selection:updated', 'selection:cleared', 'object:modified', 'object:scaling', 'object:moving', 'object:rotating']) canvas.on(ev, syncProps);

$('strokeWidth').onchange = (e) => {
  state.strokeWidth = Number(e.target.value);
  applyToSelection((o) => { const w = state.strokeWidth * MM; return { strokeWidth: w, stroke: w ? (o.stroke || state.stroke) : null, strokeDashArray: w ? strokeDash(w) : null }; });
};
$('dash').onchange = (e) => { state.dash = e.target.value; applyToSelection((o) => ({ strokeDashArray: o.strokeWidth ? strokeDash(o.strokeWidth) : null })); };
$('opacity').onchange = (e) => { state.opacity = Math.max(0, Math.min(100, Number(e.target.value))) / 100; applyToSelection({ opacity: state.opacity }); };
$('fillChip').onclick = () => { openTab('colour'); setTarget('fill'); };
$('strokeChip').onclick = () => { openTab('colour'); setTarget('stroke'); if (!state.strokeWidth) { state.strokeWidth = 1; $('strokeWidth').value = '1'; applyToSelection({ strokeWidth: MM, stroke: state.stroke }); } };
$('noFill').onclick = () => applyToSelection({ fill: null }, 'Fill removed');
$('noStroke').onclick = () => applyToSelection({ stroke: null, strokeWidth: 0 }, 'Outline removed');
for (const [id, key] of [['posX', 'left'], ['posY', 'top']]) $(id).onchange = (e) => { const o = one(); if (!o) return; const b = o.getBoundingRect(); o.set(key, o[key] + Number(e.target.value) * MM - (key === 'left' ? b.left : b.top)); o.setCoords(); canvas.fire('object:modified', { target: o }); canvas.requestRenderAll(); };
for (const [id, axis] of [['sizeW', 'x'], ['sizeH', 'y']]) $(id).onchange = (e) => {
  const o = one(); if (!o) return;
  const b = o.getBoundingRect(), want = Number(e.target.value) * MM, have = axis === 'x' ? b.width : b.height;
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
$('pSides').onchange = (e) => { state.polySides = Math.max(3, Math.min(24, Number(e.target.value))); };
$('pStar').onchange = (e) => { state.star = e.target.checked; };

// Arrange, align, flip, group, lock, duplicate, delete.
function align(how) {
  const objs = active(); if (!objs.length) return;
  for (const o of objs.length > 1 ? [canvas.getActiveObject()] : objs) {
    const b = o.getBoundingRect();
    const dx = how === 'L' ? -b.left : how === 'C' ? page.width / 2 - (b.left + b.width / 2) : how === 'R' ? page.width - (b.left + b.width) : 0;
    const dy = how === 'T' ? -b.top : how === 'M' ? page.height / 2 - (b.top + b.height / 2) : how === 'B' ? page.height - (b.top + b.height) : 0;
    o.set({ left: o.left + dx, top: o.top + dy }); o.setCoords();
  }
  canvas.fire('object:modified', { target: objs[0] }); canvas.requestRenderAll();
}
for (const k of ['L', 'C', 'R', 'T', 'M', 'B']) $(`al${k}`).onclick = () => align(k);
$('flipH').onclick = () => applyToSelection((o) => ({ flipX: !o.flipX }));
$('flipV').onclick = () => applyToSelection((o) => ({ flipY: !o.flipY }));
$('front').onclick = () => { for (const o of active()) canvas.bringObjectToFront(o); canvas.fire('object:modified', {}); };
$('back').onclick = () => { for (const o of active()) { canvas.sendObjectToBack(o); canvas.bringObjectForward(o); } canvas.fire('object:modified', {}); };
$('del').onclick = () => removeSelection();
$('dup').onclick = () => duplicate();
$('lock').onclick = () => { const o = one(); if (!o) return; setLocked(o, !o.locked); syncProps(); };
$('group').onclick = () => groupToggle();
function removeSelection() { const objs = active(); if (!objs.length) return; canvas.discardActiveObject(); for (const o of objs) canvas.remove(o); canvas.requestRenderAll(); }
async function duplicate() {
  const objs = active(); if (!objs.length) return;
  canvas.discardActiveObject();
  const clones = [];
  for (const o of objs) { const c = await o.clone(EXTRA); c.set({ left: c.left + 10 * MM, top: c.top + 10 * MM }); c.name = `${o.name} copy`; style(c); canvas.add(c); clones.push(c); }
  canvas.setActiveObject(clones.length > 1 ? new ActiveSelection(clones, { canvas }) : clones[0]);
  canvas.requestRenderAll();
}
function setLocked(o, locked) {
  o.locked = locked;
  o.set({ lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, hasControls: !locked });
  canvas.fire('object:modified', { target: o });
}
function groupToggle() {
  const sel = canvas.getActiveObject();
  if (!sel) return;
  if (sel.type === 'activeselection') {
    const objs = sel.getObjects();
    canvas.discardActiveObject();
    for (const o of objs) canvas.remove(o);
    const g = style(new Group(objs), { toolName: 'Group' });
    canvas.add(g); canvas.setActiveObject(g);
  } else if (sel.type === 'group') {
    const objs = sel.removeAll();
    canvas.remove(sel);
    for (const o of objs) { style(o); canvas.add(o); }
    canvas.setActiveObject(new ActiveSelection(objs, { canvas }));
  }
  canvas.requestRenderAll();
  canvas.fire('object:modified', {});
}

// ===================================================================
// Layers tab
// ===================================================================
function refreshLayers() {
  const list = $('layerList');
  if (!list || restoring) return;
  const objs = userObjects().slice().reverse();
  $('layersEmpty').style.display = objs.length ? 'none' : 'block';
  $('layerCount').textContent = String(objs.length);
  const selected = new Set(active());
  list.innerHTML = '';
  for (const o of objs) {
    const row = document.createElement('div');
    row.className = `layer ${selected.has(o) ? 'on' : ''}`;
    const thumb = o.type === 'image' ? `<img src="${o.getSrc()}" alt="">` : o.type === 'i-text' ? '<b style="color:#000">T</b>' : `<span style="width:16px;height:16px;border-radius:${o.type === 'ellipse' ? '50%' : '3px'};background:${typeof o.fill === 'string' ? o.fill : o.stroke || '#12E1F0'}"></span>`;
    row.innerHTML = `<span class="thumb">${thumb}</span><span class="name"></span><span class="acts"><button data-a="up" title="Bring forward">${icon('up')}</button><button data-a="down" title="Send backward">${icon('down')}</button><button data-a="vis" title="Show / hide">${icon(o.visible ? 'eye' : 'eyeOff')}</button><button data-a="lock" title="Lock">${icon(o.locked ? 'lock' : 'unlock')}</button><button data-a="del" title="Delete">${icon('trash')}</button></span>`;
    row.querySelector('.name').textContent = o.type === 'i-text' ? `“${o.text}”` : o.name;
    row.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'up') canvas.bringObjectForward(o);
      else if (a === 'down') { if (canvas.getObjects().indexOf(o) > 1) canvas.sendObjectBackwards(o); }
      else if (a === 'vis') o.visible = !o.visible;
      else if (a === 'lock') setLocked(o, !o.locked);
      else if (a === 'del') { canvas.remove(o); return; }
      else { if (o.visible && !o.locked) canvas.setActiveObject(o); }
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
  $('hexIn').value = hex; $('hexChip').style.background = hex;
  drawPicker(); drawHarmony();
  if (apply) {
    if (state.target === 'fill') applyToSelection((o) => (o.type === 'line' || o.type === 'polyline' || (o.type === 'path' && !o.fill) ? { stroke: hex } : { fill: state.gradient ? gradientFor(o) : hex }));
    else applyToSelection((o) => ({ stroke: hex, strokeWidth: o.strokeWidth || MM }));
  }
  if (canvas.isDrawingMode) canvas.freeDrawingBrush.color = hex;
  if (recent) { state.recent = [hex, ...state.recent.filter((c) => c !== hex)].slice(0, 7); renderSwatches(); savePrefs(); }
  syncProps();
}
function setTarget(t) {
  state.target = t;
  for (const b of document.querySelectorAll('[data-target]')) b.classList.toggle('on', b.dataset.target === t);
  const hex = current(); hsv = hexToHsv(hex); $('hexIn').value = hex; $('hexChip').style.background = hex; drawPicker(); drawHarmony();
}
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
$('fillMode').onchange = (e) => {
  state.gradient = e.target.value === 'solid' ? null : { from: state.fill, to: $('gradTo').value, angle: Number($('gradAngle').value) };
  $('gradRow').style.display = state.gradient ? 'grid' : 'none';
  applyToSelection((o) => ({ fill: state.gradient ? gradientFor(o) : state.fill }));
};
for (const id of ['gradTo', 'gradAngle']) $(id).oninput = () => { if (!state.gradient) return; state.gradient = { from: state.fill, to: $('gradTo').value, angle: Number($('gradAngle').value) }; applyToSelection((o) => ({ fill: gradientFor(o) })); };

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
  const data = canvas.toDataURL({ format: 'png', left: box.left, top: box.top, width: box.width, height: box.height, multiplier, enableRetinaScaling: false });
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
function exportSvg() {
  canvas.discardActiveObject();
  const svg = canvas.toSVG({ width: `${pageSize[0]}mm`, height: `${pageSize[1]}mm`, viewBox: { x: 0, y: 0, width: page.width, height: page.height } });
  download(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, '3deezi-artwork.svg');
  toast('SVG exported (vector, editable in CorelDRAW or Illustrator)');
}
function sendToStudio() {
  const data = renderPng({ maxPx: 2048 });
  if (!data) { toast('Add some artwork first'); return; }
  const name = (userObjects().find((o) => o.type === 'i-text')?.text || 'Artboard design').slice(0, 40);
  if (embedded()) { post({ type: 'artwork', data, name }); toast('Sent to the 3D studio'); }
  else download(data, '3deezi-artwork.png');
}
function setPage([w, h], record_ = true) {
  pageSize = [w, h];
  page.set({ width: w * MM, height: h * MM });
  $('pageInfo').textContent = `${w} x ${h} mm`;
  fit();
  if (record_) record();
}
$('pageSize').innerHTML = Object.keys(PAGES).map((k) => `<option>${k}</option>`).join('');
$('pageSize').onchange = (e) => setPage(PAGES[e.target.value]);

// ===================================================================
// Menus, toolbar wiring, keyboard
// ===================================================================
const ACTIONS = {
  new: async () => { if (userObjects().length && !confirm('Start a new page? Unsaved artwork will be cleared (Undo can restore it).')) return; for (const o of userObjects()) canvas.remove(o); canvas.requestRenderAll(); },
  open: () => $('fileImage').click(),
  exportPng: () => exportPng(false), exportPage: () => exportPng(true), exportSvg,
  send: sendToStudio,
  undo, redo, duplicate, delete: removeSelection,
  selectAll: () => { setTool('select'); const objs = userObjects().filter((o) => o.visible && !o.locked); if (objs.length) canvas.setActiveObject(new ActiveSelection(objs, { canvas })); canvas.requestRenderAll(); },
  zoomIn: () => zoomAt(canvas.getZoom() * 1.25), zoomOut: () => zoomAt(canvas.getZoom() / 1.25), fit,
  rulers: () => document.body.classList.toggle('no-rulers') || setTimeout(resize),
  grid: () => { state.grid = !state.grid; $('gridToggle').checked = state.grid; savePrefs(); canvas.requestRenderAll(); },
  group: groupToggle, front: () => $('front').click(), back: () => $('back').click(), flipH: () => $('flipH').click(), flipV: () => $('flipV').click(),
  text: () => setTool('text'), layout: () => align('C'),
  help: () => toast('Drag to draw · Space+drag pans · Ctrl+wheel zooms · Delete removes · Ctrl+D duplicates'),
};
document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => { closeMenus(); ACTIONS[b.dataset.action]?.(); }));
function closeMenus() { document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); $('drawFly').classList.remove('open'); }
document.querySelectorAll('.menu>button').forEach((b) => b.addEventListener('click', (e) => { const m = b.parentElement, open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); e.stopPropagation(); }));
addEventListener('click', (e) => { if (!e.target.closest('.menu,.fly,[data-tool="draw-menu"]')) closeMenus(); });
document.querySelectorAll('.tool[data-tool]').forEach((b) => b.addEventListener('click', (e) => {
  const t = b.dataset.tool;
  if (t === 'draw-menu') {
    const fly = $('drawFly'), r = b.getBoundingClientRect();
    const open = fly.classList.toggle('open');
    if (open) Object.assign(fly.style, innerWidth > 900 ? { left: `${r.right + 6}px`, top: `${r.top}px`, bottom: 'auto' } : { left: `${Math.min(r.left, innerWidth - 220)}px`, top: 'auto', bottom: `${innerHeight - r.top + 6}px` });
    e.stopPropagation();
    return;
  }
  if (t === 'node') { setTool('node'); const o = one(); if (o) startNodeEdit(o); return; }
  setTool(t);
}));
$('drawFly').querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { closeMenus(); setTool(b.dataset.kind); $('drawLabel').textContent = DRAW_KINDS[b.dataset.kind]; }));
$('undo').onclick = undo; $('redo').onclick = redo;
$('save').onclick = () => { try { localStorage.setItem(STORE, snapshot()); } catch { /* storage full */ } post({ type: 'saved', json: snapshot() }); toast('Artboard saved on this device'); };
$('sendBtn').onclick = sendToStudio;
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
addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea') || canvas.getActiveObject()?.isEditing) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (k === ' ') { spaceDown = true; canvas.defaultCursor = 'grab'; e.preventDefault(); return; }
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && k === 'y') { e.preventDefault(); redo(); }
  else if (mod && k === 'd') { e.preventDefault(); duplicate(); }
  else if (mod && k === 'a') { e.preventDefault(); ACTIONS.selectAll(); }
  else if (mod && k === 'g') { e.preventDefault(); groupToggle(); }
  else if (k === 'delete' || k === 'backspace') removeSelection();
  else if (k === 'escape') { finishPath(); setTool('select'); canvas.discardActiveObject(); canvas.requestRenderAll(); }
  else if (k === 'enter') finishPath();
  else if (!mod && { v: 'select', n: 'node', c: 'crop', z: 'zoom', f5: 'draw', b: 'bezier', p: 'pen', r: 'rect', e: 'ellipse', y: 'polygon', t: 'text', i: 'eyedropper', g: 'fill' }[k]) setTool({ v: 'select', n: 'node', c: 'crop', z: 'zoom', f5: 'draw', b: 'bezier', p: 'pen', r: 'rect', e: 'ellipse', y: 'polygon', t: 'text', i: 'eyedropper', g: 'fill' }[k]);
  else if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k) && active().length) {
    e.preventDefault();
    const s = (e.shiftKey ? 10 : 1) * MM;
    applyToSelection((o) => ({ left: o.left + (k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0), top: o.top + (k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0) }));
  }
});
addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; canvas.defaultCursor = 'default'; } });
addEventListener('resize', () => { resize(); });

// ===================================================================
// Host bridge
// ===================================================================
window.artboard = {
  setAssets: (list) => { for (const a of list ?? []) addAsset(a.src, a.name || 'Asset'); },
  addImage: ({ src, name }) => { addAsset(src, name || 'Image'); return addImage(src, name || 'Image'); },
  load: (json) => restore(typeof json === 'string' ? json : JSON.stringify(json)),
  clear: () => ACTIONS.new(),
  receive: (msg) => {
    const m = typeof msg === 'string' ? JSON.parse(msg) : msg;
    if (m && m.cmd !== 'receive' && typeof window.artboard[m.cmd] === 'function') window.artboard[m.cmd](m.arg);
  },
};
addEventListener('message', (e) => { if (e.source === window.parent && typeof e.data === 'string') { try { window.artboard.receive(e.data); } catch { /* not for us */ } } });

// ===================================================================
// Start
// ===================================================================
(async () => {
  await document.fonts.ready;
  resize();
  setTarget('fill');
  renderSwatches();
  renderAssets();
  $('pageInfo').textContent = `${pageSize[0]} x ${pageSize[1]} mm`;
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
