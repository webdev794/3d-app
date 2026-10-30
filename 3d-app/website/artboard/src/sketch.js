// Smart Drawing and LiveSketch (CorelDRAW). Smart Drawing recognises a freehand sketch as a clean shape (line,
// rectangle or square, ellipse or circle, triangle, diamond, polygon) or leaves it a smooth curve. LiveSketch
// joins strokes whose ends meet and reshapes a curve where a stroke runs along it. Pure geometry: page points in.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const DEG = Math.PI / 180;
/** Recognition levels: how far a sketch may be from a shape and still count as it. */
export const LEVELS = { off: 0, low: 0.65, medium: 1, high: 1.45 };

function clean(pts, min) {
  const out = [];
  for (const p of pts) if (Number.isFinite(p?.x) && Number.isFinite(p?.y) && (!out.length || dist(p, out.at(-1)) >= min)) out.push({ x: p.x, y: p.y });
  return out;
}
const length = (pts) => pts.reduce((s, p, i) => (i ? s + dist(p, pts[i - 1]) : 0), 0);
/** n points evenly spaced round the closed loop. */
function resampleLoop(pts, n) {
  const loop = [...pts, pts[0]], L = length(loop), step = L / n, out = [loop[0]];
  let want = step, acc = 0;
  for (let i = 1; i < loop.length && out.length < n; i++) {
    const a = loop[i - 1], b = loop[i], l = dist(a, b);
    while (acc + l >= want && l > 0 && out.length < n) { const t = (want - acc) / l; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); want += step; }
    acc += l;
  }
  return out;
}
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
/** The ellipse the loop is closest to (principal axes, extents) and how far off it is (0 = exact). */
function fitEllipse(ring) {
  const n = ring.length, cx = ring.reduce((s, p) => s + p.x, 0) / n, cy = ring.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of ring) { const x = p.x - cx, y = p.y - cy; sxx += x * x; syy += y * y; sxy += x * y; }
  const phi = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(phi), uy = Math.sin(phi);
  const u = ring.map((p) => (p.x - cx) * ux + (p.y - cy) * uy), v = ring.map((p) => -(p.x - cx) * uy + (p.y - cy) * ux);
  const u0 = Math.min(...u), u1 = Math.max(...u), v0 = Math.min(...v), v1 = Math.max(...v);
  const a = (u1 - u0) / 2, b = (v1 - v0) / 2, mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
  if (a < 1 || b < 1) return { err: Infinity };
  const err = u.reduce((s, x, i) => s + Math.abs(Math.hypot((x - mu) / a, (v[i] - mv) / b) - 1), 0) / n;
  return { err, cx: cx + mu * ux - mv * uy, cy: cy + mu * uy + mv * ux, a, b, angle: phi / DEG };
}
/** Indexes of the loop's corners: sharp turns (local maxima over ~50°). */
function corners(ring) {
  const n = ring.length, k = Math.max(2, Math.round(n / 18)), turn = ring.map((b, i) => {
    const a = ring[(i - k + n) % n], c = ring[(i + k) % n], ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1))));
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    if (turn[i] < 50 * DEG) continue;
    let best = true;
    for (let d = 1; d <= k && best; d++) if (turn[(i + d) % n] > turn[i] || turn[(i - d + n) % n] >= turn[i]) best = false;
    if (best) out.push(i);
  }
  return out;
}
const straightBetween = (ring, idx, tol) => idx.every((i, j) => {
  const k = idx[(j + 1) % idx.length], a = ring[i], b = ring[k], L = dist(a, b) || 1;
  for (let m = (i + 1) % ring.length; m !== k; m = (m + 1) % ring.length) if (segDist(ring[m], a, b) / L > tol) return false;
  return true;
});
const angleAt = (q, i) => {
  const a = q[(i - 1 + q.length) % q.length], b = q[i], c = q[(i + 1) % q.length];
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1)))) / DEG;
};
/** Angles near 0° / 90° / 180° snap to them (within 6°). */
function snapAngle(deg) {
  const r = ((deg % 180) + 180) % 180;
  for (const s of [0, 90, 180]) if (Math.abs(r - s) <= 6) return s % 180;
  return r;
}

/**
 * What a freehand sketch is. Returns one of:
 *   { kind: 'line', a, b }  { kind: 'rect', cx, cy, w, h, angle }  { kind: 'ellipse', cx, cy, rx, ry, angle }
 *   { kind: 'triangle' | 'diamond' | 'polygon', pts }  { kind: 'curve', closed, pts }
 * zoom: the page zoom (tolerances in screen pixels).
 */
export function recognize(raw, level = 'medium', zoom = 1) {
  const pts = clean(raw, 0.5 / zoom);
  if (pts.length < 2) return null;
  const T = LEVELS[level] ?? 1, L = length(pts), gap = dist(pts[0], pts.at(-1));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const closed = gap < Math.max(0.2 * diag, 14 / zoom) && L > 2.5 * gap && L > 40 / zoom;
  if (!T) return { kind: 'curve', closed, pts };
  if (!closed) {
    const a = pts[0], b = pts.at(-1), chord = dist(a, b) || 1;
    const dev = Math.max(...pts.map((p) => segDist(p, a, b)));
    if (dev / chord < 0.06 * T && chord > 6 / zoom) {
      // Nearly level or upright: made exactly so.
      const ang = Math.atan2(b.y - a.y, b.x - a.x) / DEG, snapped = snapAngle(ang);
      if (snapped !== ((ang % 180) + 180) % 180) {
        const dir = { x: Math.cos(snapped * DEG), y: Math.sin(snapped * DEG) }, proj = (b.x - a.x) * dir.x + (b.y - a.y) * dir.y;
        return { kind: 'line', a, b: { x: a.x + dir.x * proj, y: a.y + dir.y * proj } };
      }
      return { kind: 'line', a, b };
    }
    return { kind: 'curve', closed: false, pts };
  }
  const ring = resampleLoop(pts, 72), e = fitEllipse(ring);
  const ellipse = () => {
    let { a, b } = e, angle = snapAngle(e.angle);
    if (angle === 90) { [a, b] = [b, a]; angle = 0; }
    if (Math.abs(a - b) / Math.max(a, b) < 0.1 * T) a = b = (a + b) / 2;
    return { kind: 'ellipse', cx: e.cx, cy: e.cy, rx: a, ry: b, angle };
  };
  if (e.err < 0.085 * T) return ellipse();
  const idx = corners(ring), q = idx.map((i) => ring[i]);
  if (idx.length >= 3 && idx.length <= 8 && straightBetween(ring, idx, 0.1 * T)) {
    if (idx.length === 3) return { kind: 'triangle', pts: q };
    if (idx.length === 4) {
      const sides = q.map((p, i) => dist(p, q[(i + 1) % 4])), even = Math.max(...sides) / Math.min(...sides) < 1 + 0.18 * T;
      const tilt = Math.abs(((Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x) / DEG) % 90 + 90) % 90 - 45);
      // Even sides standing on a point (tilted 25-65°): a diamond, made exactly upright when nearly so.
      if (even && tilt < 20) {
        const xs4 = q.map((p) => p.x), ys4 = q.map((p) => p.y), cx = (Math.min(...xs4) + Math.max(...xs4)) / 2, cy = (Math.min(...ys4) + Math.max(...ys4)) / 2;
        const upright = q.some((p) => Math.abs(Math.atan2(p.y - cy, p.x - cx) / DEG + 90) < 10);
        return { kind: 'diamond', pts: upright ? [{ x: cx, y: Math.min(...ys4) }, { x: Math.max(...xs4), y: cy }, { x: cx, y: Math.max(...ys4) }, { x: Math.min(...xs4), y: cy }] : q };
      }
      if ([0, 1, 2, 3].every((i) => Math.abs(angleAt(q, i) - 90) < 18 * T)) {
        // A rectangle: its sides follow the first edge's direction.
        let angle = snapAngle(Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x) / DEG);
        if (angle === 90) angle = 0;
        const c = Math.cos(angle * DEG), s = Math.sin(angle * DEG), u = q.map((p) => p.x * c + p.y * s), v = q.map((p) => -p.x * s + p.y * c);
        let w = Math.max(...u) - Math.min(...u), h = Math.max(...v) - Math.min(...v);
        const mu = (Math.max(...u) + Math.min(...u)) / 2, mv = (Math.max(...v) + Math.min(...v)) / 2;
        if (Math.abs(w - h) / Math.max(w, h) < 0.08 * T) w = h = (w + h) / 2;
        return { kind: 'rect', cx: mu * c - mv * s, cy: mu * s + mv * c, w, h, angle };
      }
      if (even) return { kind: 'diamond', pts: q };
    }
    return { kind: 'polygon', pts: q };
  }
  if (e.err < 0.13 * T) return ellipse();
  return { kind: 'curve', closed: true, pts };
}

/** LiveSketch: the chain with the stroke joined on where an end is within `near`, or null. */
export function joinEnds(chain, stroke, near) {
  const cs = chain[0], ce = chain.at(-1), ss = stroke[0], se = stroke.at(-1);
  if (dist(ce, ss) <= near) return [...chain, ...stroke];
  if (dist(ce, se) <= near) return [...chain, ...stroke.slice().reverse()];
  if (dist(cs, se) <= near) return [...stroke, ...chain];
  if (dist(cs, ss) <= near) return [...stroke.slice().reverse(), ...chain];
  return null;
}
/** LiveSketch: a stroke drawn along most of its length close to the chain replaces that stretch of it, or null. */
export function retrace(chain, stroke, near) {
  if (chain.length < 4 || stroke.length < 3) return null;
  const nearest = (p) => { let bi = 0, bd = Infinity; chain.forEach((c, i) => { const d = dist(c, p); if (d < bd) { bd = d; bi = i; } }); return [bi, bd]; };
  const hits = stroke.map(nearest);
  if (hits.filter(([, d]) => d <= near).length < stroke.length * 0.7) return null;
  let i0 = hits[0][0], i1 = hits.at(-1)[0], s = stroke;
  if (i1 < i0) { [i0, i1] = [i1, i0]; s = stroke.slice().reverse(); }
  if (i1 - i0 < 2) return null;
  return [...chain.slice(0, i0), ...s, ...chain.slice(i1 + 1)];
}
/** Points thinned to at least `min` apart (the end kept), at most `max`. */
export function thin(pts, min, max = 600) {
  const out = [];
  for (const p of pts) if (!out.length || dist(p, out.at(-1)) >= min) out.push({ x: p.x, y: p.y });
  const end = pts.at(-1);
  if (end && out.at(-1) !== end && dist(end, out.at(-1)) > min / 3) out.push({ x: end.x, y: end.y });
  if (out.length <= max) return out;
  const step = (out.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => out[Math.round(i * step)]);
}
