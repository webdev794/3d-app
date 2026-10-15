// Heavy shape maths for Smudge and Eraser strokes: the area the brush covers and the boolean operations with
// the shapes under it. It runs in a worker (geom.worker.js), so a slow or stuck calculation can't freeze the
// Artboard (the page stops the worker after a time limit); where workers aren't available the page runs it
// itself.

import paper from 'paper';

let ready = false;
function P() {
  if (!ready) { if (!paper.project) paper.setup(new paper.Size(1, 1)); ready = true; }
  return paper;
}
const toPaper = (d, fillRule = 'nonzero') => {
  const item = new (P().CompoundPath)({ pathData: d, insert: false });
  item.fillRule = fillRule;
  return item;
};
const pathData = (item) => (item && !item.isEmpty() ? item.pathData : '');
const closedItem = (item) => (item.children ? item.children.every((c) => c.closed) : item.closed);

/**
 * Stroke points thinned to at least `spacing` apart, measured from the last point kept (a slow stroke still
 * keeps its points); the end is kept; at most `max` points (evenly spread) so a long stroke stays quick.
 */
export function thinStroke(points, spacing, max = 80) {
  const pts = points.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  if (pts.length < 2) return pts;
  const out = [pts[0]];
  for (const p of pts) { const q = out.at(-1); if (Math.hypot(p.x - q.x, p.y - q.y) >= spacing) out.push(p); }
  const end = pts.at(-1), q = out.at(-1);
  if (q !== end && Math.hypot(end.x - q.x, end.y - q.y) >= spacing / 3) out.push(end);
  if (out.length <= max) return out;
  const step = (out.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => out[Math.round(i * step)]);
}

/** The area a round brush covers along the points (width = its diameter); taper 0-1 narrows it towards the end. */
export function strokeRegion(points, width, taper = 0) {
  const s = P(), R = Math.max(width / 2, 0.01), last = Math.max(1, points.length - 1);
  const rAt = (i) => R * (1 - Math.min(0.85, Math.max(0, taper)) * (i / last));
  let pieces = points.map((p, i) => {
    const r = rAt(i);
    let piece = new s.Path.Circle({ center: [p.x, p.y], radius: r, insert: false });
    if (i) {
      const q = points[i - 1], dx = p.x - q.x, dy = p.y - q.y, l = Math.hypot(dx, dy), rq = rAt(i - 1);
      if (l > 1e-6) {
        const nx = -dy / l, ny = dx / l;
        const quad = new s.Path({ segments: [[q.x + nx * rq, q.y + ny * rq], [p.x + nx * r, p.y + ny * r], [p.x - nx * r, p.y - ny * r], [q.x - nx * rq, q.y - ny * rq]], closed: true, insert: false });
        piece = piece.unite(quad, { insert: false });
      }
    }
    return piece;
  });
  // Neighbours are united pair by pair, so no single union grows long.
  while (pieces.length > 1) {
    const next = [];
    for (let i = 0; i < pieces.length; i += 2) next.push(pieces[i + 1] ? pieces[i].unite(pieces[i + 1], { insert: false }) : pieces[i]);
    pieces = next;
  }
  return pathData(pieces[0]);
}

/** unite | subtract of two path data strings (an open first path is split, not filled). */
export function booleanD(kind, aD, bD) {
  const a = toPaper(aD), b = toPaper(bD);
  if (!closedItem(b)) return aD;
  return pathData(a[kind](b, { insert: false, trace: closedItem(a) }));
}

/** Smart Fill: the enclosed area at point p among the given closed shapes ('' when p is not enclosed). */
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

/**
 * One job. Smart Fill: { op: 'smartfill', shapes: [path data], p } -> { d }.
 * A stroke: { points, width, taper, kind ('unite' | 'subtract'), targets: [path data] } -> { region, out }.
 */
export function runGeom(job) {
  if (job.op === 'smartfill') return { d: smartFillD(job.shapes ?? [], job.p) };
  const { points, width, taper = 0, kind, targets = [] } = job;
  const region = strokeRegion(points, width, taper);
  const out = targets.map((d) => { try { return d ? booleanD(kind, d, region) : null; } catch { return null; } });
  return { region, out };
}
