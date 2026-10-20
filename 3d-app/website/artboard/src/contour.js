// Contour (CorelDRAW Contour tool): each step is the object's area grown (outside) or shrunk (inside, to centre) by
// a distance, with miter, round or bevel corners.
//
// Every closed outline (loop) is grown or shrunk on its own and the pieces are joined with booleans:
//   outside = U (outer loop grown - its holes shrunk)  U  open lines widened
//   inside  = U (outer loop shrunk - its holes grown)
// so overlapping letters, holes (O, A, 8), islands inside holes and open lines all come out right. paperjs-offset is
// quick and exact while a loop keeps its shape, but where a loop (or part of it) collapses it can leave junk; so each
// result is checked against its distances to the loop and, when the check fails, made exactly from the loop and a
// band of round-ended strips along it.

import paper from 'paper';
import { PaperOffset } from 'paperjs-offset';

const MITER = 4;                      // miter corners longer than this many distances are bevelled (SVG's default)
const MITER_REACH = Math.hypot(1, MITER);
const TURN = 15;                      // curves are split until each turns at most 15°: offsets within ~0.2 % of the distance
let ready = false;
const P = () => { if (!ready) { if (!paper.project) paper.setup(new paper.Size(1, 1)); ready = true; } return paper; };
const nonEmpty = (x) => !!x && !x.isEmpty() && Math.abs(x.area) > 1e-9;

/** Unites a list of areas, neighbours first, so no single union grows long. */
function uniteAll(list) {
  let items = list.filter(nonEmpty);
  while (items.length > 1) {
    const next = [];
    for (let i = 0; i < items.length; i += 2) next.push(items[i + 1] ? items[i].unite(items[i + 1], { insert: false }) : items[i]);
    items = next;
  }
  return items[0] ?? null;
}
/** Splits curves until each turns at most TURN degrees (paperjs-offset is exact on gently turning curves). */
function splitCurves(item) {
  for (const p of item.children ?? [item]) {
    for (let i = 0, guard = 0; i < p.curves.length && guard < 20000; i++, guard++) {
      const c = p.curves[i];
      if (!c.hasHandles() || c.length < 1e-3) continue;
      let turn = 0, prev = c.getTangentAtTime(0);
      for (let k = 1; k <= 8; k++) { const t = c.getTangentAtTime(k / 8); if (!prev.isZero() && !t.isZero()) turn += Math.abs(prev.getDirectedAngle(t)); prev = t; }
      if (turn > TURN && c.divideAtTime(0.5)) i--;
    }
  }
  return item;
}

// Distances are measured on a polyline along each loop or line (flat [x0, y0, x1, y1 …]): quick in plain JS.
function polyOf(path, step) {
  const pts = [];
  for (const c of path.curves) {
    const n = c.hasHandles() ? Math.max(2, Math.min(256, Math.ceil(c.length / step))) : 1;
    for (let i = 0; i < n; i++) { const q = c.getPointAtTime(i / n); pts.push(q.x, q.y); }
  }
  if (!path.closed && path.lastSegment) pts.push(path.lastSegment.point.x, path.lastSegment.point.y);
  return pts;
}
function distTo(x, y, pts, closed) {
  const n = pts.length / 2;
  if (n === 1) return Math.hypot(x - pts[0], y - pts[1]);
  let best = Infinity;
  for (let i = 0, last = closed ? n : n - 1; i < last; i++) {
    const j = (i + 1) % n, ax = pts[2 * i], ay = pts[2 * i + 1], dx = pts[2 * j] - ax, dy = pts[2 * j + 1] - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - x, ey = ay + dy * t - y, d2 = ex * ex + ey * ey;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}
function insidePoly(x, y, pts) {
  let inside = false;
  for (let i = 0, n = pts.length / 2, j = n - 1; i < n; j = i++) {
    const xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** The area within r of a polyline: a disc at each point and a strip along each side, united. */
function strips(pts, r, closed) {
  const s = P(), n = pts.length / 2, pieces = [];
  for (let i = 0; i < n; i++) {
    const x = pts[2 * i], y = pts[2 * i + 1];
    pieces.push(new s.Path.Circle({ center: [x, y], radius: r, insert: false }));
    if (i === n - 1 && !closed) break;
    const j = (i + 1) % n, x2 = pts[2 * j], y2 = pts[2 * j + 1], l = Math.hypot(x2 - x, y2 - y);
    if (l < 1e-9) continue;
    const nx = (-(y2 - y) / l) * r, ny = ((x2 - x) / l) * r;
    pieces.push(new s.Path({ segments: [[x + nx, y + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x - nx, y - ny]], closed: true, insert: false }));
  }
  return uniteAll(pieces);
}

/** A loop (clockwise) or an open line, with its polyline for measuring. */
function partOf(path, closed) {
  const p = closed ? new (P().Path)({ segments: path.segments.map((x) => x.clone()), closed: true, insert: false }) : path.clone({ insert: false });
  if (closed && !p.clockwise) p.reverse();
  const b = p.bounds, step = Math.min(2, Math.max(0.05, Math.max(b.width, b.height) / 150));
  return { path: p, bounds: b, step, sag: step * 0.04, poly: polyOf(p, step), closed, grid: null };
}
/** Points inside a loop on a grid, each with its depth (distance to the outline): how deep the loop is. */
function gridOf(L) {
  if (L.grid) return L.grid;
  const b = L.bounds, side = Math.max(b.width, b.height) / 28, nx = Math.max(1, Math.ceil(b.width / side)), ny = Math.max(1, Math.ceil(b.height / side));
  const pts = [];
  let max = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = b.x + ((i + 0.5) * b.width) / nx, y = b.y + ((j + 0.5) * b.height) / ny;
    if (!insidePoly(x, y, L.poly)) continue;
    const depth = distTo(x, y, L.poly, true);
    if (depth > max) max = depth;
    pts.push({ x, y, depth });
  }
  return (L.grid = { pts, max, cell: Math.hypot(b.width / nx, b.height / ny) });
}
/** Is every outline point of r between lo and hi from the part, on the expected side (and nothing deep missing)? */
function check(L, r, w, join, side) {
  const tol = Math.max(0.05, w * 0.02) + L.sag;
  const lo = join === 'bevel' ? w * 0.25 : w - tol, hi = join === 'miter' ? w * MITER_REACH + tol : w + tol;
  const parts = nonEmpty(r) ? r.children ?? [r] : [];
  if (side !== 'in' && !parts.length) return false;
  for (const c of parts) {
    const len = c.length, n = Math.min(1200, Math.max(12, Math.ceil(len / Math.max(0.5, w / 2))));
    for (let k = 0; k < n; k++) {
      const q = c.getPointAt((len * k) / n);
      if (!q) continue;
      if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return false;
      const dd = distTo(q.x, q.y, L.poly, L.closed);
      if (dd < lo || dd > hi) return false;
      if (L.closed && insidePoly(q.x, q.y, L.poly) !== (side === 'in')) return false;
    }
  }
  if (side === 'in') {
    // Nothing deep inside the loop may be missing (with miter corners the corner zones may be).
    const g = gridOf(L), deep = w * (join === 'miter' ? MITER_REACH : 1) + tol + g.cell * 0.05;
    for (const p of g.pts) if (p.depth > deep && !(parts.length && r.contains(new (P().Point)(p.x, p.y)))) return false;
  }
  return true;
}
const exactBand = (L, w) => strips(polyOf(L.path, Math.max(L.step, w / 2)), w, L.closed);
/** The loop's area eroded by w (null when nothing is left). */
function shrink(L, w, join) {
  const g = gridOf(L);
  if (g.max + g.cell / 2 < w) return null; // the deepest point inside is nearer the outline than w
  let r;
  try { r = PaperOffset.offset(L.path.clone({ insert: false }), -w, { join, limit: MITER, insert: false }); } catch { r = undefined; }
  if (r !== undefined && check(L, r, w, join, 'in')) return nonEmpty(r) ? r : null;
  const band = exactBand(L, w), out = band ? L.path.subtract(band, { insert: false }) : L.path.clone({ insert: false });
  return nonEmpty(out) ? out : null;
}
/** The loop's area grown by w. */
function grow(L, w, join) {
  let r;
  try { r = PaperOffset.offset(L.path.clone({ insert: false }), w, { join, limit: MITER, insert: false }); } catch { r = null; }
  if (r && check(L, r, w, join, 'out')) return r;
  const band = exactBand(L, w);
  return band ? L.path.unite(band, { insert: false }) : L.path.clone({ insert: false });
}
/** The area within w of an open line (round ends). */
function widen(L, w, join) {
  let r;
  try { r = PaperOffset.offsetStroke(L.path.clone({ insert: false }), w, { join, cap: 'round', limit: MITER, insert: false }); } catch { r = null; }
  if (r && check(L, r, w, join, 'band')) {
    let covered = true;
    for (let i = 0; i < L.poly.length && covered; i += 16) covered = r.contains(new (P().Point)(L.poly[i], L.poly[i + 1]));
    if (covered) return r;
  }
  return exactBand(L, w);
}

/**
 * Prepares an object's outline for contour steps. parts: [{ d, rule }] in page units, each with its own fill rule
 * (the parts of a group); closed outlines become one area (overlaps resolved), open ones stay lines.
 */
export function contourPrep(parts) {
  const s = P(), regions = [], lines = [];
  for (const { d, rule = 'nonzero' } of parts) {
    if (!d) continue;
    const item = new s.CompoundPath({ pathData: d, insert: false });
    item.fillRule = rule === 'evenodd' ? 'evenodd' : 'nonzero';
    for (const k of item.children.slice()) {
      if (k.closed) continue;
      if (k.segments.length > 1 && k.length > 1e-6) lines.push(splitCurves(k.clone({ insert: false })));
      k.remove();
    }
    if (!item.isEmpty()) { const r = item.unite(item, { insert: false }); if (nonEmpty(r)) regions.push(r); }
  }
  const region = uniteAll(regions);
  const comps = [];
  if (region) {
    splitCurves(region);
    const loops = (region.children ?? [region]).filter((k) => k.closed && Math.abs(k.area) > 1e-9).map((k) => ({ k, b: k.bounds, a: Math.abs(k.area), pt: k.interiorPoint }));
    const within = (x, y) => x !== y && y.a > x.a && y.b.contains(x.b) && y.k.contains(x.pt);
    for (const x of loops) x.depth = loops.filter((y) => within(x, y)).length;
    for (const o of loops) {
      if (o.depth % 2) continue;
      comps.push({ outer: partOf(o.k, true), holes: loops.filter((h) => h.depth === o.depth + 1 && within(h, o)).map((h) => partOf(h.k, true)) });
    }
  }
  return { comps, lines: lines.map((l) => partOf(l, false)) };
}
/** One contour step distance away (page units; > 0 outside, < 0 inside) as path data ('' when nothing is left). */
export function contourStep(prep, distance, join = 'round') {
  const w = Math.abs(distance), out = [];
  if (!(w > 0)) return '';
  if (distance > 0) {
    for (const c of prep.comps) {
      let r = grow(c.outer, w, join);
      const holes = uniteAll(c.holes.map((h) => shrink(h, w, join)));
      if (holes && nonEmpty(r)) r = r.subtract(holes, { insert: false });
      out.push(r);
    }
    for (const l of prep.lines) out.push(widen(l, w, join));
  } else {
    for (const c of prep.comps) {
      let r = shrink(c.outer, w, join);
      if (!r) continue;
      const holes = uniteAll(c.holes.map((h) => grow(h, w, join)));
      if (holes) r = r.subtract(holes, { insert: false });
      out.push(r);
    }
  }
  const r = uniteAll(out);
  const d = r ? r.pathData : '';
  return /NaN|Infinity/.test(d) ? '' : d;
}
