// Vector core for the Artboard: every object can become real Bézier curves
// with editable nodes, as in CorelDRAW ("Convert to curves").
//
// Node model (page / world coordinates):
//   [{ closed, nodes: [{ x, y, hi, ho, type }] }]   one entry per subpath
//   hi / ho: the control handles into / out of the node (null = none)
//   type: 'cusp' | 'smooth' | 'symmetric'
// Shaping (weld, trim, …), contour and the knife/eraser use paper.js.

import { Point, util } from 'fabric';
import paper from 'paper';
import { PaperOffset } from 'paperjs-offset';
import { parse as parseFont } from 'opentype.js';
import { faceFor } from './fonts.mjs';

const KAPPA = 0.5522847498;
const r3 = (n) => Math.round(n * 1000) / 1000;
const same = (a, b, eps = 1e-4) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const node = (p) => ({ x: p.x, y: p.y, hi: null, ho: null, type: 'cusp' });

// ===================================================================
// Path commands <-> node model
// ===================================================================
/** Fabric/SVG path commands (absolute M L C Q Z) -> node model; `map` transforms each point. */
export function commandsToModel(cmds, map = (p) => p) {
  const subs = [];
  let cur = null, last = { x: 0, y: 0 }, start = { x: 0, y: 0 };
  const begin = (raw) => { cur = { closed: false, nodes: [node(map(raw))] }; subs.push(cur); start = raw; };
  for (const c of cmds) {
    const t = c[0];
    if (t === 'M') { begin({ x: c[1], y: c[2] }); last = { x: c[1], y: c[2] }; continue; }
    if (t === 'Z' || t === 'z') {
      if (cur) {
        cur.closed = true;
        const ns = cur.nodes;
        // A path that returns to its start before Z: merge the duplicate node.
        if (ns.length > 1 && same(ns[0], ns.at(-1))) { ns[0].hi = ns.at(-1).hi; ns.pop(); }
      }
      cur = null; last = start; continue;
    }
    if (!cur) begin(last);
    if (t === 'L') { const p = { x: c[1], y: c[2] }; cur.nodes.push(node(map(p))); last = p; }
    else if (t === 'C' || t === 'Q') {
      let c1, c2, p;
      if (t === 'C') { c1 = { x: c[1], y: c[2] }; c2 = { x: c[3], y: c[4] }; p = { x: c[5], y: c[6] }; }
      else { const q = { x: c[1], y: c[2] }; p = { x: c[3], y: c[4] }; c1 = lerp(last, q, 2 / 3); c2 = lerp(p, q, 2 / 3); }
      const prev = cur.nodes.at(-1), m1 = map(c1), m2 = map(c2), n = node(map(p));
      prev.ho = same(m1, prev) ? null : m1;
      n.hi = same(m2, n) ? null : m2;
      cur.nodes.push(n); last = p;
    }
  }
  for (const s of subs) for (const n of s.nodes) n.type = inferType(n);
  return subs.filter((s) => s.nodes.length);
}
function inferType(n) {
  if (!n.hi || !n.ho) return 'cusp';
  const a = { x: n.hi.x - n.x, y: n.hi.y - n.y }, b = { x: n.ho.x - n.x, y: n.ho.y - n.y };
  const la = Math.hypot(a.x, a.y), lb = Math.hypot(b.x, b.y);
  if (!la || !lb) return 'cusp';
  const cos = (a.x * b.x + a.y * b.y) / (la * lb);
  if (cos > -0.999) return 'cusp';
  return Math.abs(la - lb) / Math.max(la, lb) < 0.02 ? 'symmetric' : 'smooth';
}
/** Segment from node a to node b as an SVG command. */
function seg(a, b) {
  if (!a.ho && !b.hi) return ` L ${r3(b.x)} ${r3(b.y)}`;
  const c1 = a.ho ?? a, c2 = b.hi ?? b;
  return ` C ${r3(c1.x)} ${r3(c1.y)} ${r3(c2.x)} ${r3(c2.y)} ${r3(b.x)} ${r3(b.y)}`;
}
export function modelToD(model) {
  let d = '';
  for (const s of model) {
    const ns = s.nodes;
    if (!ns.length) continue;
    d += `${d ? ' ' : ''}M ${r3(ns[0].x)} ${r3(ns[0].y)}`;
    for (let i = 1; i < ns.length; i++) d += seg(ns[i - 1], ns[i]);
    if (s.closed && ns.length > 1) { d += seg(ns.at(-1), ns[0]); d += ' Z'; }
  }
  return d;
}
export const cloneModel = (m) => m.map((s) => ({ closed: s.closed, nodes: s.nodes.map((n) => ({ ...n, hi: n.hi && { ...n.hi }, ho: n.ho && { ...n.ho } })) }));
/** Any SVG path data (arcs, relative commands, …) -> node model, points mapped by `map`. */
export const dToModel = (d, map) => commandsToModel(util.makePathSimpler(util.parsePath(d)), map);
export const isClosedModel = (m) => m.length > 0 && m.every((s) => s.closed);

/** Cubic Bézier point and split (de Casteljau). */
export function segmentPoints(a, b) { return [a, a.ho ?? a, b.hi ?? b, b]; }
export function bezierAt([p0, p1, p2, p3], t) {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
}
export function splitBezier([p0, p1, p2, p3], t) {
  const a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t), d = lerp(a, b, t), e = lerp(b, c, t), f = lerp(d, e, t);
  return [[p0, a, d, f], [f, e, c, p3]];
}
/** Nearest point on a segment: { t, dist, point } (sampled, then refined). */
export function nearestOnSegment(pts, p, straight) {
  let best = { t: 0, dist: Infinity, point: pts[0] };
  const steps = straight ? 1 : 40;
  if (straight) {
    const [a, , , b] = pts, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    return { t, dist: Math.hypot(p.x - q.x, p.y - q.y), point: q };
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, q = bezierAt(pts, t), d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.dist) best = { t, dist: d, point: q };
  }
  for (let h = 1 / steps / 2; h > 1e-4; h /= 2) {
    for (const t of [best.t - h, best.t + h]) {
      if (t < 0 || t > 1) continue;
      const q = bezierAt(pts, t), d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < best.dist) best = { t, dist: d, point: q };
    }
  }
  return best;
}

// ===================================================================
// Objects -> world path data
// ===================================================================
const local = (o, d) => { const m = o.calcTransformMatrix(); return dToModel(d, (p) => util.transformPoint(new Point(p.x, p.y), m)); };
/** World-space node model of any vector object (null for images). */
export function objectModel(o) {
  const t = o.type;
  if (t === 'path') {
    const m = o.calcTransformMatrix(), off = o.pathOffset;
    return commandsToModel(o.path, (p) => util.transformPoint(new Point(p.x - off.x, p.y - off.y), m));
  }
  if (t === 'rect') {
    const w = o.width, h = o.height, rx = Math.min(o.rx || 0, w / 2), ry = Math.min(o.ry || o.rx || 0, h / 2);
    const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
    if (!rx || !ry) return local(o, `M ${x0} ${y0} H ${x1} V ${y1} H ${x0} Z`);
    const kx = rx * KAPPA, ky = ry * KAPPA;
    return local(o, `M ${x0 + rx} ${y0} H ${x1 - rx} C ${x1 - rx + kx} ${y0} ${x1} ${y0 + ry - ky} ${x1} ${y0 + ry} V ${y1 - ry} C ${x1} ${y1 - ry + ky} ${x1 - rx + kx} ${y1} ${x1 - rx} ${y1} H ${x0 + rx} C ${x0 + rx - kx} ${y1} ${x0} ${y1 - ry + ky} ${x0} ${y1 - ry} V ${y0 + ry} C ${x0} ${y0 + ry - ky} ${x0 + rx - kx} ${y0} ${x0 + rx} ${y0} Z`);
  }
  if (t === 'ellipse' || t === 'circle') {
    const rx = t === 'circle' ? o.radius : o.rx, ry = t === 'circle' ? o.radius : o.ry, kx = rx * KAPPA, ky = ry * KAPPA;
    return local(o, `M ${rx} 0 C ${rx} ${ky} ${kx} ${ry} 0 ${ry} C ${-kx} ${ry} ${-rx} ${ky} ${-rx} 0 C ${-rx} ${-ky} ${-kx} ${-ry} 0 ${-ry} C ${kx} ${-ry} ${rx} ${-ky} ${rx} 0 Z`);
  }
  if (t === 'polygon' || t === 'polyline') {
    const off = o.pathOffset, pts = o.points.map((p) => `${p.x - off.x} ${p.y - off.y}`);
    return local(o, `M ${pts.join(' L ')}${t === 'polygon' ? ' Z' : ''}`);
  }
  if (t === 'line') { const p = o.calcLinePoints(); return local(o, `M ${p.x1} ${p.y1} L ${p.x2} ${p.y2}`); }
  if (t === 'triangle') { const w = o.width / 2, h = o.height / 2; return local(o, `M 0 ${-h} L ${w} ${h} L ${-w} ${h} Z`); }
  if (t === 'i-text' || t === 'text' || t === 'textbox') return textModel(o);
  return null;
}
export const canConvert = (o) => ['path', 'rect', 'ellipse', 'circle', 'polygon', 'polyline', 'line', 'triangle', 'i-text', 'text', 'textbox'].includes(o.type);

/** Rewrite a Path with new world-space data, dropping its transform (as CorelDRAW does). */
export function setWorldPath(o, d) {
  o.set({ angle: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, flipX: false, flipY: false });
  o._setPath(d || 'M 0 0', true);
  o.setCoords();
  o.dirty = true;
}

// ===================================================================
// Text -> curves (opentype.js, laid out exactly like Fabric draws it)
// ===================================================================
const fontCache = new Map();
export function getFont(family, weight) {
  const file = faceFor(family, weight);
  const data = file && window.__ABFONTS?.[file];
  if (!data) return null;
  if (!fontCache.has(file)) {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    fontCache.set(file, parseFont(bytes.buffer));
  }
  return fontCache.get(file);
}
export const fontAvailable = (family) => !!faceFor(family, 400);

function textModel(o) {
  const m = o.calcTransformMatrix(), W = (p) => util.transformPoint(new Point(p.x, p.y), m);
  const out = [];
  const left = o._getLeftOffset(), top = o._getTopOffset();
  const onPath = !!o.path;
  let lineTop = 0;
  for (let li = 0; li < o._textLines.length; li++) {
    const line = o._textLines[li], bounds = o.__charBounds[li];
    const hImpl = o.getHeightOfLineImpl(li);
    const baseline = top + lineTop + hImpl - hImpl * o._fontSizeFraction;
    let x = left + o._getLineLeftOffset(li);
    for (let ci = 0; ci < line.length; ci++) {
      const box = bounds[ci], ch = line[ci];
      const style = o.getCompleteStyleDeclaration(li, ci);
      x += box.kernedWidth - box.width;
      if (ch.trim()) {
        const font = getFont(style.fontFamily, style.fontWeight);
        if (!font) throw new Error(`The font “${style.fontFamily}” can't be converted to curves. Choose a font from the Artboard list.`);
        const size = style.fontSize, italic = style.fontStyle === 'italic' && !/italic/i.test(style.fontFamily);
        // Glyph outline at the origin (baseline y = 0), then placed like Fabric.
        const place = onPath
          ? (p) => { const a = box.angle, px = p.x - box.width / 2, c = Math.cos(a), s = Math.sin(a); return W({ x: box.renderLeft + px * c - p.y * s, y: box.renderTop + px * s + p.y * c }); }
          : (p) => W({ x: x + p.x, y: baseline + p.y });
        const shear = italic ? (p) => ({ x: p.x - 0.25 * p.y, y: p.y }) : (p) => p;
        const cmds = font.charToGlyph(ch).getPath(0, 0, size).commands.map((c) => {
          if (c.type === 'Z') return ['Z'];
          const pts = c.type === 'C' ? [[c.x1, c.y1], [c.x2, c.y2], [c.x, c.y]] : c.type === 'Q' ? [[c.x1, c.y1], [c.x, c.y]] : [[c.x, c.y]];
          return [c.type, ...pts.flatMap(([px, py]) => { const q = shear({ x: px, y: py }); return [q.x, q.y]; })];
        });
        out.push(...commandsToModel(cmds, place));
      }
      x += box.width;
    }
    // Underline (same geometry as Fabric's text decoration).
    if (o.underline && line.length && !onPath) {
      const size = o.fontSize, thick = (o.fontSize * (o.textDecorationThickness ?? 66.667)) / 1000;
      const y = baseline + o.offsets.underline * size, x0 = left + o._getLineLeftOffset(li);
      const width = bounds.slice(0, line.length).reduce((a, b, i) => a + (i ? b.kernedWidth : b.width), 0) - o._getWidthOfCharSpacing();
      out.push(...dToModel(`M ${x0} ${y} H ${x0 + width} V ${y + thick} H ${x0} Z`, W));
    }
    lineTop += o.getHeightOfLine(li);
  }
  return out;
}

// ===================================================================
// paper.js: shaping, offsets, splitting
// ===================================================================
let ready = false;
function P() { if (!ready) { paper.setup(new paper.Size(1, 1)); ready = true; } return paper; }
export function toPaper(d, fillRule = 'nonzero') {
  const item = new (P().CompoundPath)({ pathData: d, insert: false });
  item.fillRule = fillRule;
  return item;
}
export const pathData = (item) => (item && !item.isEmpty() ? item.pathData : '');
const closedItem = (item) => item.children ? item.children.every((c) => c.closed) : item.closed;

/** Boolean ops on world path data. kind: unite | subtract | intersect | exclude */
export function boolean(kind, aD, bD, { aRule, bRule } = {}) {
  const a = toPaper(aD, aRule), b = toPaper(bD, bRule);
  const open = !closedItem(a);
  if (!closedItem(b)) return aD; // can't cut with an open line
  const r = a[kind](b, { insert: false, trace: !open });
  return pathData(r);
}
export const isClosedD = (d) => closedItem(toPaper(d));
/** Split a compound result into separate shapes, keeping holes with their outer shape. */
export function components(d) {
  const item = toPaper(d), kids = item.children ? item.children.slice() : [item];
  if (kids.length < 2) return [d];
  const depth = kids.map((k) => kids.filter((o) => o !== k && o.closed && Math.abs(o.area) > Math.abs(k.area) && o.contains(k.interiorPoint ?? k.firstSegment.point)).length);
  const outers = kids.filter((_, i) => depth[i] % 2 === 0);
  return outers.map((outer) => {
    const holes = kids.filter((k, i) => depth[i] % 2 === 1 && outer.contains(k.interiorPoint ?? k.firstSegment.point) && depth[i] === depth[kids.indexOf(outer)] + 1);
    return [outer, ...holes].map((k) => k.pathData).join(' ');
  });
}
/** Contour / offset (outside: +, inside: -) with round joins. */
export function offsetD(d, distance, join = 'round') {
  const r = PaperOffset.offset(toPaper(d), distance, { join, insert: false });
  return pathData(r);
}
/** An outline turned into a filled shape ("Convert outline to object"). */
export function strokeOutlineD(d, width, { join = 'round', cap = 'round' } = {}) {
  const item = toPaper(d), parts = item.children ? item.children : [item];
  let out = null;
  for (const part of parts) {
    const s = PaperOffset.offsetStroke(part.clone({ insert: false }), width / 2, { join, cap, insert: false });
    out = out ? out.unite(s, { insert: false }) : s;
  }
  return pathData(out);
}
/** Thin region along a polyline (knife cut) or a round brush (eraser). */
export function strokeRegionD(points, width) {
  const s = P();
  let region = null;
  const r = Math.max(width / 2, 0.01);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    let piece = new s.Path.Circle({ center: [p.x, p.y], radius: r, insert: false });
    if (i) {
      const q = points[i - 1], dx = p.x - q.x, dy = p.y - q.y, l = Math.hypot(dx, dy);
      if (l > 1e-6) {
        const nx = (-dy / l) * r, ny = (dx / l) * r;
        const quad = new s.Path({ segments: [[q.x + nx, q.y + ny], [p.x + nx, p.y + ny], [p.x - nx, p.y - ny], [q.x - nx, q.y - ny]], closed: true, insert: false });
        piece = piece.unite(quad, { insert: false });
      }
    }
    region = region ? region.unite(piece, { insert: false }) : piece;
  }
  return pathData(region);
}
/** Knife: a straight cut through a shape -> pieces (closed shapes) or split lines (open paths). */
export function knifeD(d, a, b) {
  const s = P(), item = toPaper(d);
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, ex = (dx / l) * 1e5, ey = (dy / l) * 1e5;
  const cut = new s.Path({ segments: [[a.x - ex, a.y - ey], [b.x + ex, b.y + ey]], insert: false });
  if (closedItem(item)) {
    // Cut along the infinite line through a-b with a hair-thin gap.
    const nx = (-dy / l) * 0.02, ny = (dx / l) * 0.02;
    const slab = new s.Path({ segments: [[a.x - ex + nx, a.y - ey + ny], [b.x + ex + nx, b.y + ey + ny], [b.x + ex - nx, b.y + ey - ny], [a.x - ex - nx, a.y - ey - ny]], closed: true, insert: false });
    if (!item.intersects(cut)) return null;
    return components(pathData(item.subtract(slab, { insert: false })));
  }
  const pieces = [];
  for (const part of item.children ?? [item]) {
    const p = part.clone({ insert: false });
    const hits = p.getIntersections(cut).map((x) => x.offset).sort((u, v) => v - u);
    if (!hits.length) { pieces.push(p.pathData); continue; }
    let rest = p;
    for (const off of hits) { const tail = rest.splitAt(off); if (tail) pieces.push(tail.pathData); }
    pieces.push(rest.pathData);
  }
  return pieces.length > 1 ? pieces : null;
}
/** Smart fill: the enclosed region at point p among the given closed shapes. */
export function smartFillD(shapeDs, p) {
  const s = P(), at = new s.Point(p.x, p.y);
  const items = shapeDs.map((d) => toPaper(d)).filter((i) => closedItem(i));
  const inside = items.filter((i) => i.contains(at)), outside = items.filter((i) => !i.contains(at));
  if (!inside.length) return '';
  let region = inside[0];
  for (const i of inside.slice(1)) region = region.intersect(i, { insert: false });
  for (const o of outside) if (o.bounds.intersects(region.bounds)) region = region.subtract(o, { insert: false });
  return region.contains(at) ? pathData(region) : '';
}
/** Blend: n in-between outlines morphing a -> b (outer outlines, resampled). */
export function blendDs(aD, bD, steps, samples = 96) {
  const s = P();
  const outer = (d) => { const i = toPaper(d), kids = i.children ?? [i]; return kids.reduce((x, y) => (Math.abs(y.area) > Math.abs(x.area) ? y : x)); };
  const sample = (path) => { const L = path.length, pts = []; for (let i = 0; i < samples; i++) pts.push(path.getPointAt((L * i) / samples)); return pts; };
  const pa = outer(aD).clone({ insert: false }), pb = outer(bD).clone({ insert: false });
  if (pa.clockwise !== pb.clockwise) pb.reverse();
  const A = sample(pa); let B = sample(pb);
  // Rotate B's start so the points line up with A's.
  let best = 0, bestCost = Infinity;
  for (let k = 0; k < samples; k++) { let c = 0; for (let i = 0; i < samples; i += 4) c += A[i].getDistance(B[(i + k) % samples]); if (c < bestCost) { bestCost = c; best = k; } }
  B = B.map((_, i) => B[(i + best) % samples]);
  const out = [];
  for (let st = 1; st <= steps; st++) {
    const t = st / (steps + 1);
    const path = new s.Path({ segments: A.map((p, i) => p.add(B[i].subtract(p).multiply(t))), closed: pa.closed, insert: false });
    path.smooth({ type: 'catmull-rom' });
    out.push(path.pathData);
  }
  return out;
}
export const dBounds = (d) => { const b = toPaper(d).bounds; return { left: b.x, top: b.y, width: b.width, height: b.height }; };

// ===================================================================
// Shape generators (CorelDRAW Object and Basic-shape tools)
// ===================================================================
/** Unit-box (0-100) path data -> world path data in a dragged box. */
export function boxD(unitD, { x, y, w, h }) {
  return modelToD(dToModel(unitD, (p) => ({ x: x + (p.x / 100) * w, y: y + (p.y / 100) * h })));
}
function ringPoints(count, radius) {
  const pts = [];
  for (let i = 0; i < count; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / count, r = radius(i); pts.push([50 + Math.cos(a) * 50 * r, 50 + Math.sin(a) * 50 * r]); }
  return pts;
}
const poly = (pts) => `M ${pts.map(([x, y]) => `${r3(x)} ${r3(y)}`).join(' L ')} Z`;
export function polygonUnit(sides) { return poly(ringPoints(sides, () => 1)); }
/** Star: sharpness 1-99 (CorelDRAW): higher = thinner points. */
export function starUnit(points, sharpness) { const inner = Math.max(0.05, 1 - sharpness / 100); return poly(ringPoints(points * 2, (i) => (i % 2 ? inner : 1))); }
/** Complex star: lines joining every k-th point, so the sides cross. */
export function complexStarUnit(points, sharpness) {
  const n = Math.max(5, points), maxK = Math.floor((n - 1) / 2), k = Math.max(2, Math.min(maxK, 1 + Math.round(sharpness)));
  const v = ringPoints(n, () => 1), seen = new Set();
  let d = '';
  for (let s = 0; s < n; s++) {
    if (seen.has(s)) continue;
    const loop = [];
    for (let i = s; !seen.has(i); i = (i + k) % n) { seen.add(i); loop.push(v[i]); }
    d += `${d ? ' ' : ''}${poly(loop)}`;
  }
  return d;
}
/** Spiral: symmetric (even spacing) or logarithmic (expansion %). */
export function spiralUnit(revolutions, logarithmic, expansion = 50) {
  const per = 16, total = Math.max(1, revolutions) * per, pts = [];
  const growth = 1 + Math.max(1, expansion) / 100;
  for (let i = 0; i <= total; i++) {
    const turns = i / per, a = turns * 2 * Math.PI - Math.PI / 2;
    const r = logarithmic ? growth ** turns - 1 : turns;
    pts.push({ a, r });
  }
  const maxR = pts.at(-1).r || 1;
  const P2 = pts.map(({ a, r }) => ({ x: 50 + (Math.cos(a) * 50 * r) / maxR, y: 50 + (Math.sin(a) * 50 * r) / maxR }));
  return catmullD(P2, false);
}
/** Smooth curve through points (Catmull-Rom as cubic Béziers). */
export function catmullD(pts, closed) {
  if (pts.length < 2) return '';
  const at = (i) => (closed ? pts[(i + pts.length) % pts.length] : pts[Math.max(0, Math.min(pts.length - 1, i))]);
  let d = `M ${r3(pts[0].x)} ${r3(pts[0].y)}`;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += ` C ${r3(p1.x + (p2.x - p0.x) / 6)} ${r3(p1.y + (p2.y - p0.y) / 6)} ${r3(p2.x - (p3.x - p1.x) / 6)} ${r3(p2.y - (p3.y - p1.y) / 6)} ${r3(p2.x)} ${r3(p2.y)}`;
  }
  return closed ? `${d} Z` : d;
}
const burst = (n, rs) => poly(ringPoints(n * 2, (i) => (i % 2 ? rs[(i >> 1) % rs.length] : 1)));
const seal = () => { const pts = ringPoints(96, (i) => 0.92 + 0.08 * Math.cos((i * 2 * Math.PI * 24) / 96)); return catmullD(pts.map(([x, y]) => ({ x, y })), true); };

export const SHAPE_SETS = {
  basic: { label: 'Basic shapes', items: [
    ['triangle', 'Triangle', 'M50 0 L100 100 L0 100 Z'], ['right-triangle', 'Right triangle', 'M0 0 L100 100 L0 100 Z'],
    ['diamond', 'Diamond', 'M50 0 L100 50 L50 100 L0 50 Z'], ['trapezoid', 'Trapezoid', 'M20 0 H80 L100 100 H0 Z'],
    ['parallelogram', 'Parallelogram', 'M25 0 H100 L75 100 H0 Z'], ['cross', 'Cross', 'M35 0 H65 V35 H100 V65 H65 V100 H35 V65 H0 V35 H35 Z'],
    ['heart', 'Heart', 'M50 100 C20 76 0 56 0 31 C0 13 13 0 28 0 C39 0 46 6 50 15 C54 6 61 0 72 0 C87 0 100 13 100 31 C100 56 80 76 50 100 Z'],
    ['ring', 'Ring', 'M100 50 A50 50 0 1 1 0 50 A50 50 0 1 1 100 50 Z M80 50 A30 30 0 1 0 20 50 A30 30 0 1 0 80 50 Z'],
    ['moon', 'Moon', 'M65 0 A50 50 0 0 0 65 100 A26 50 0 0 1 65 0 Z'], ['bolt', 'Lightning', 'M58 0 L16 58 H46 L36 100 L84 38 H54 L68 0 Z'],
    ['frame', 'Frame', 'M0 0 H100 V100 H0 Z M15 15 V85 H85 V15 Z'], ['drop', 'Drop', 'M50 0 C62 22 88 46 88 64 C88 85 71 100 50 100 C29 100 12 85 12 64 C12 46 38 22 50 0 Z'],
  ] },
  arrow: { label: 'Arrow shapes', items: [
    ['arrow-right', 'Right arrow', 'M0 30 H60 V5 L100 50 L60 95 V70 H0 Z'], ['arrow-left', 'Left arrow', 'M100 30 H40 V5 L0 50 L40 95 V70 H100 Z'],
    ['arrow-up', 'Up arrow', 'M50 0 L95 40 H70 V100 H30 V40 H5 Z'], ['arrow-both', 'Two-way arrow', 'M0 50 L25 15 V35 H75 V15 L100 50 L75 85 V65 H25 V85 Z'],
    ['arrow-4', 'Four-way arrow', 'M50 0 L68 18 H58 V42 H82 V32 L100 50 L82 68 V58 H58 V82 H68 L50 100 L32 82 H42 V58 H18 V68 L0 50 L18 32 V42 H42 V18 H32 Z'],
    ['chevron', 'Chevron', 'M0 0 H60 L100 50 L60 100 H0 L40 50 Z'], ['pentagon-arrow', 'Tag arrow', 'M0 0 H72 L100 50 L72 100 H0 Z'],
    ['arrow-curve', 'Curved arrow', 'M10 100 V55 C10 25 35 15 62 15 V0 L100 30 L62 60 V45 C45 45 35 50 35 62 V100 Z'],
  ] },
  banner: { label: 'Banner shapes', items: [
    ['ribbon', 'Ribbon', 'M15 15 H85 V65 H15 Z M0 30 H15 V80 H0 L9 55 Z M100 30 H85 V80 H100 L91 55 Z'],
    ['wave', 'Wave flag', 'M0 10 C30 0 40 25 70 15 C85 10 95 8 100 10 V80 C70 90 60 65 30 75 C15 80 5 82 0 80 Z'],
    ['swallowtail', 'Swallowtail', 'M0 0 H100 L80 50 L100 100 H0 Z'], ['pennant', 'Pennant', 'M0 0 L100 45 L0 100 Z'],
    ['burst', 'Explosion', burst(12, [0.62, 0.7, 0.55, 0.68])], ['burst-2', 'Starburst', burst(18, [0.78])],
  ] },
  callout: { label: 'Callout shapes', items: [
    ['callout-rect', 'Rectangle callout', 'M0 0 H100 V70 H45 L25 100 L30 70 H0 Z'],
    ['callout-round', 'Rounded callout', 'M10 0 H90 Q100 0 100 10 V60 Q100 70 90 70 H45 L25 100 L30 70 H10 Q0 70 0 60 V10 Q0 0 10 0 Z'],
    ['callout-oval', 'Oval callout', 'M33 68 L15 100 L18 62 A50 35 0 1 1 33 68 Z'],
    ['callout-line', 'Line callout', 'M30 0 H100 V50 H30 Z M30 40 L0 100 L4 100 L34 40 Z'],
  ] },
  badge: { label: 'Sport badges', items: [
    ['shield', 'Shield', 'M50 0 L100 12 V45 C100 75 78 92 50 100 C22 92 0 75 0 45 V12 Z'],
    ['crest', 'Crest', 'M0 0 H100 V55 C100 80 75 95 50 100 C25 95 0 80 0 55 Z'],
    ['heater', 'Heater shield', 'M0 0 Q50 10 100 0 V50 Q95 85 50 100 Q5 85 0 50 Z'],
    ['seal', 'Seal', seal()], ['stripe', 'Chevron stripe', 'M0 40 L50 0 L100 40 V70 L50 30 L0 70 Z'],
    ['plate', 'Name plate', 'M10 0 H90 L100 50 L90 100 H10 L0 50 Z'], ['hex-badge', 'Hex badge', polygonUnit(6)],
    ['banner-badge', 'Badge with ribbon', 'M50 0 A38 38 0 1 1 49.9 0 Z M18 55 L8 100 L30 88 L42 100 L45 70 Z M82 55 L92 100 L70 88 L58 100 L55 70 Z'],
  ] },
};
