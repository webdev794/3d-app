// Connectors (CorelDRAW Connector tools): the route between two points (straight, right-angle or rounded
// right-angle), its path data with optional arrowheads, and the default anchor points of a shape: where the
// outline meets lines from its centre towards the middle of each side.

/** The four default anchors: top, right, bottom, left, and the way a line leaves each. */
export const SIDES = { t: { x: 0, y: -1 }, r: { x: 1, y: 0 }, b: { x: 0, y: 1 }, l: { x: -1, y: 0 } };
const KAPPA = 0.5523;

/** The axis direction (right, left, down or up) nearest a direction; null for none. */
export function snapAxis(d) {
  if (!d || (Math.abs(d.x) < 1e-9 && Math.abs(d.y) < 1e-9)) return null;
  return Math.abs(d.x) >= Math.abs(d.y) ? { x: Math.sign(d.x), y: 0 } : { x: 0, y: Math.sign(d.y) };
}

/** Drops repeated points and points in the middle of a straight run. */
function tidy(pts) {
  const out = [];
  for (const p of pts) {
    const q = out.at(-1);
    if (q && Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6) continue;
    out.push({ x: p.x, y: p.y });
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x), dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
      if (Math.abs(cross) < 1e-6 && dot >= 0) out.splice(-2, 1); else break;
    }
  }
  return out;
}

/**
 * The points of a right-angle route from a to b. da, db: the way the line leaves a and b (outwards from their
 * shapes, axis directions), or null for a free end, which faces the other end. An attached end first runs
 * straight out by its stub, so the line never runs along the side of its shape.
 */
export function orthoRoute(a, da, b, db, stubA, stubB) {
  const dx = b.x - a.x, dy = b.y - a.y;
  da = da ?? snapAxis({ x: dx, y: dy }) ?? { x: 1, y: 0 };
  db = db ?? snapAxis({ x: -dx, y: -dy }) ?? { x: -1, y: 0 };
  const a1 = { x: a.x + da.x * stubA, y: a.y + da.y * stubA }, b1 = { x: b.x + db.x * stubB, y: b.y + db.y * stubB };
  const ha = da.x !== 0, hb = db.x !== 0;
  let mid;
  if (ha && hb) {
    if (da.x === -db.x && (b1.x - a1.x) * da.x >= 0) { const mx = (a1.x + b1.x) / 2; mid = [{ x: mx, y: a1.y }, { x: mx, y: b1.y }]; }
    else if (da.x === db.x) { const x = da.x > 0 ? Math.max(a1.x, b1.x) : Math.min(a1.x, b1.x); mid = [{ x, y: a1.y }, { x, y: b1.y }]; }
    else { const my = (a1.y + b1.y) / 2; mid = [{ x: a1.x, y: my }, { x: b1.x, y: my }]; }
  } else if (!ha && !hb) {
    if (da.y === -db.y && (b1.y - a1.y) * da.y >= 0) { const my = (a1.y + b1.y) / 2; mid = [{ x: a1.x, y: my }, { x: b1.x, y: my }]; }
    else if (da.y === db.y) { const y = da.y > 0 ? Math.max(a1.y, b1.y) : Math.min(a1.y, b1.y); mid = [{ x: a1.x, y }, { x: b1.x, y }]; }
    else { const mx = (a1.x + b1.x) / 2; mid = [{ x: mx, y: a1.y }, { x: mx, y: b1.y }]; }
  } else if (ha) {
    // Leaves a sideways, arrives at b up or down: one corner when it lies ahead of both ends.
    const c = { x: b1.x, y: a1.y };
    mid = (c.x - a1.x) * da.x >= 0 && (c.y - b1.y) * db.y >= 0 ? [c] : [{ x: a1.x, y: b1.y }];
  } else {
    const c = { x: a1.x, y: b1.y };
    mid = (c.y - a1.y) * da.y >= 0 && (c.x - b1.x) * db.x >= 0 ? [c] : [{ x: b1.x, y: a1.y }];
  }
  return tidy([a, a1, ...mid, b1, b]);
}

const f = (n) => +n.toFixed(2);
/**
 * Path data of a connector through the points: straight runs, or rounded corners (radius, at most half of
 * each run). Arrowheads ('none' | 'end' | 'start' | 'both') are open chevrons of the given size, added after
 * the line, so the line itself stays the first part of the path.
 */
export function connectorD(pts, { rounded = false, radius = 0, arrows = 'none', arrowSize = 6 } = {}) {
  if (pts.length < 2) return '';
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], p = pts[i], c = pts[i + 1];
    const lin = Math.hypot(p.x - a.x, p.y - a.y), lout = Math.hypot(c.x - p.x, c.y - p.y);
    const r = rounded ? Math.min(radius, lin / 2, lout / 2) : 0;
    if (r < 1e-3) { d += ` L ${f(p.x)} ${f(p.y)}`; continue; }
    const ui = { x: (p.x - a.x) / lin, y: (p.y - a.y) / lin }, uo = { x: (c.x - p.x) / lout, y: (c.y - p.y) / lout };
    const p1 = { x: p.x - ui.x * r, y: p.y - ui.y * r }, p2 = { x: p.x + uo.x * r, y: p.y + uo.y * r };
    d += ` L ${f(p1.x)} ${f(p1.y)} C ${f(p1.x + ui.x * r * KAPPA)} ${f(p1.y + ui.y * r * KAPPA)} ${f(p2.x - uo.x * r * KAPPA)} ${f(p2.y - uo.y * r * KAPPA)} ${f(p2.x)} ${f(p2.y)}`;
  }
  const last = pts.at(-1);
  d += ` L ${f(last.x)} ${f(last.y)}`;
  const head = (tip, from) => {
    const L = Math.hypot(tip.x - from.x, tip.y - from.y);
    if (L < 1e-6) return '';
    const ux = (tip.x - from.x) / L, uy = (tip.y - from.y) / L, s = arrowSize, w = s * 0.5;
    return ` M ${f(tip.x - ux * s - uy * w)} ${f(tip.y - uy * s + ux * w)} L ${f(tip.x)} ${f(tip.y)} L ${f(tip.x - ux * s + uy * w)} ${f(tip.y - uy * s - ux * w)}`;
  };
  if (arrows === 'end' || arrows === 'both') d += head(last, pts.at(-2));
  if (arrows === 'start' || arrows === 'both') d += head(pts[0], pts[1]);
  return d;
}

/** Where the ray from (0, 0) along d crosses the segment p-q (distance along d), or null. */
function rayHit(d, p, q) {
  const ex = q.x - p.x, ey = q.y - p.y, den = d.x * ey - d.y * ex;
  if (Math.abs(den) < 1e-12) return null;
  const t = (p.x * ey - p.y * ex) / den, s = (p.x * d.y - p.y * d.x) / den;
  return t >= 0 && s >= -1e-9 && s <= 1 + 1e-9 ? t : null;
}
/**
 * The default anchors of a shape from its outline (polylines in its own units, centre at 0, 0): where lines
 * from the centre towards the middle of each side of its w x h box last cross the outline. A line that
 * crosses nothing (an open curve) ends at the middle of that side of the box.
 */
export function outlineAnchors(polys, w, h) {
  const out = {};
  for (const [id, d] of Object.entries(SIDES)) {
    let best = -1;
    for (const poly of polys) for (let i = 0; i + 1 < poly.length; i++) { const t = rayHit(d, poly[i], poly[i + 1]); if (t !== null && t > best) best = t; }
    out[id] = best > 1e-6 ? { x: d.x * best, y: d.y * best } : { x: (d.x * w) / 2, y: (d.y * h) / 2 };
  }
  return out;
}
