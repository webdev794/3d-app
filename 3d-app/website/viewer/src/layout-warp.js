// A print layout put onto the garment: every panel's corners (neck, underarm, hem and cuff; on shorts the waist,
// crotch and side split) go to fixed points on the 3D garment's print panels, and everything between follows
// smoothly (mean value coordinates over matching outlines). The graphics card draws the result into the kit's
// print atlas. Fixed rules only, so the same layout always gives the same kit.
import * as THREE from 'three';
import Delaunator from 'delaunator';
import { cutBelow } from './layout.js';

const S = 64;   // samples along each side of a panel

// ---------- outlines (lists of [x, y], clockwise on screen) ----------
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const argMax = (pts, f) => pts.reduce((best, p, i) => (f(p) > f(pts[best]) ? i : best), 0);
/** The points from index i forward to index j round a closed outline, both included. */
function path(pts, i, j) {
  const out = [];
  for (let k = i; ; k = (k + 1) % pts.length) { out.push(pts[k]); if (k === j) break; }
  return out;
}
/** The index (into the outline) of the point on the path i → j farthest from the straight line i – j. */
function farthest(pts, i, j) {
  const a = pts[i], b = pts[j], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  let best = i, dist = -1;
  for (let k = i; k !== j; k = (k + 1) % pts.length) {
    const d = Math.abs((pts[k][0] - a[0]) * dy - (pts[k][1] - a[1]) * dx) / l;
    if (d > dist) { dist = d; best = k; }
  }
  return best;
}
const lineLength = (line) => line.reduce((s, p, i) => (i ? s + len(line[i - 1], p) : 0), 0);
/** The point a fraction t of the way along a line of points. */
function along(line, t) {
  const total = lineLength(line);
  let goal = t * total;
  for (let i = 1; i < line.length; i++) {
    const d = len(line[i - 1], line[i]);
    if (goal <= d || i === line.length - 1) {
      const f = d ? Math.min(1, goal / d) : 0;
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * f, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * f];
    }
    goal -= d;
  }
  return line[line.length - 1];
}
/** A line cut at a fraction of its length: [first part, second part], sharing the cut point. */
function cut(line, t) {
  const total = lineLength(line), at = along(line, t), goal = t * total;
  let run = 0, i = 1;
  for (; i < line.length; i++) { run += len(line[i - 1], line[i]); if (run >= goal) break; }
  return [[...line.slice(0, i), at], [at, ...line.slice(i)]];
}
/** n + 1 evenly spaced points from the start of a line to its end. */
const resample = (line, n) => Array.from({ length: n + 1 }, (_, k) => along(line, k / n));

/** Convex hull (indices into the outline, clockwise on screen). */
function hull(pts) {
  const idx = pts.map((_, i) => i).sort((a, b) => pts[a][0] - pts[b][0] || pts[a][1] - pts[b][1]);
  const cross = (o, a, b) => (pts[a][0] - pts[o][0]) * (pts[b][1] - pts[o][1]) - (pts[a][1] - pts[o][1]) * (pts[b][0] - pts[o][0]);
  const lower = [], upper = [];
  for (const i of idx) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), i) <= 0) lower.pop(); lower.push(i); }
  for (const i of [...idx].reverse()) { while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), i) <= 0) upper.pop(); upper.push(i); }
  const ring = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  // Order them as they come round the outline.
  return ring.sort((a, b) => a - b);
}
/** The outline's inward dips (a neck scoop, a side split notch): pairs of hull points with the path between. */
function pockets(pts) {
  const h = hull(pts);
  const out = [];
  for (let k = 0; k < h.length; k++) {
    const i = h[k], j = h[(k + 1) % h.length];
    const deep = farthest(pts, i, j);
    const a = pts[i], b = pts[j], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const depth = Math.abs((pts[deep][0] - a[0]) * dy - (pts[deep][1] - a[1]) * dx) / l;
    out.push({ i, j, deep, depth, midY: (a[1] + b[1]) / 2, midX: (a[0] + b[0]) / 2 });
  }
  return out;
}

// ---------- the corners of each kind of print panel ----------
/** Front or back body: [neck left, neck right, underarm right, hem right, hem left, underarm left] and the sides. */
function bodyPanel(o) {
  const pk = pockets(o).filter((p) => p.depth > 0).sort((a, b) => a.midY - b.midY)[0];
  const NL = pk.i, NR = pk.j;
  const HR = argMax(o, (p) => p[0] + p[1]), HL = argMax(o, (p) => -p[0] + p[1]);
  const UR = farthest(o, NR, HR), UL = farthest(o, HL, NL);
  return [path(o, NL, NR), path(o, NR, UR), path(o, UR, HR), path(o, HR, HL), path(o, HL, UL), path(o, UL, NL)];
}
/** Raglan sleeve: its two halves (left on screen, right on screen), each as five sides. */
function sleevePanel(o) {
  const pk = pockets(o).filter((p) => p.depth > 0).sort((a, b) => a.midY - b.midY)[0];
  const TL = pk.i, TR = pk.j;
  const CR = argMax(o, (p) => p[0] + p[1]), CL = argMax(o, (p) => -p[0] + p[1]);
  const UR = farthest(o, TR, CR), UL = farthest(o, CL, TL);
  const [neckL, neckR] = cut(path(o, TL, TR), 0.5);   // the neck edge, split at its middle
  const [cuffR, cuffL] = cut(path(o, CR, CL), 0.5);   // the cuff, split at its middle
  const M = neckL.at(-1), D = cuffR.at(-1);
  return {
    // TL → M → D → CL → UL → TL
    left: [neckL, [M, D], cuffL, path(o, CL, UL), path(o, UL, TL)],
    // M → TR → UR → CR → D → M
    right: [neckR, path(o, TR, UR), path(o, UR, CR), cuffR, [D, M]],
  };
}
/** Shorts leg (one piece round the leg, the side split notch in its hem): its two halves, each as five sides. */
function legPanel(o) {
  const WL = argMax(o, (p) => -p[0] - p[1]), WR = argMax(o, (p) => p[0] - p[1]);
  const HR = argMax(o, (p) => p[0] + p[1]), HL = argMax(o, (p) => -p[0] + p[1]);
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  // The side split: the deepest dip in the lower half of the outline, away from the ends.
  const notch = pockets(o).filter((p) => p.midY > midY && p.midX > x0 + (x1 - x0) * 0.2 && p.midX < x0 + (x1 - x0) * 0.8).sort((a, b) => b.depth - a.depth)[0];
  const NA = notch ? notch.deep : farthest(o, HR, HL);
  const waist = path(o, WL, WR);
  // The waist point straight above the split.
  let best = 0;
  waist.forEach((p, k) => { if (Math.abs(p[0] - o[NA][0]) < Math.abs(waist[best][0] - o[NA][0])) best = k; });
  const CT = waist[best];
  const CRL = farthest(o, HL, WL), CRR = farthest(o, WR, HR);
  const waistL = waist.slice(0, best + 1), waistR = waist.slice(best);
  // Where the split's edge meets the hem on each side of the notch (its knee).
  const KL = farthest(o, NA, HL), KR = farthest(o, HR, NA);
  return {
    // WL → CT → NA → KL → HL → CRL → WL
    left: [waistL, [CT, o[NA]], path(o, NA, KL), path(o, KL, HL), path(o, HL, CRL), path(o, CRL, WL)],
    // CT → WR → CRR → HR → KR → NA → CT
    right: [waistR, path(o, WR, CRR), path(o, CRR, HR), path(o, HR, KR), path(o, KR, NA), [o[NA], CT]],
  };
}

/** A panel's sides as matched to the garment (for checking the corners by eye). */
export function panelSides(panel) {
  if (panel.role === 'front' || panel.role === 'back') return { body: bodyPanel(panel.outline) };
  if (panel.role === 'sleeveL' || panel.role === 'sleeveR') return sleevePanel(panel.outline);
  if (panel.role === 'legL' || panel.role === 'legR') return legPanel(panel.outline);
  return {};
}

// ---------- the same places on the 3D garment (garment metres, y up) ----------
// Raglan seams run from the neckline (6 cm out from the centre) down to the underarm, and are sewn in the
// painter (texture.js) along the same curve.
export const RAGLAN = { neck: 0.06, control: [0.17, 0.645], underarm: [0.258, 0.53] };
/** The raglan seam on one side (dir 1: the wearer's left), from the neck down to the underarm. */
export function raglanSeam(neck, dir, steps = 24, under = [dir * RAGLAN.underarm[0], RAGLAN.underarm[1]]) {
  const [cx, cy] = RAGLAN.control, [ux, uy] = [under[0] * dir, under[1]];
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = k / steps, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    return [a * neck[0] + b * dir * cx + c * dir * ux, a * neck[1] + b * cy + c * uy];
  });
}

/** Garment helpers over the painter's outline (garment metres). */
function garment(painter) {
  const o = painter.outline.map((p) => [p.x, p.y]);
  const near = (x, y) => argMax(o, (p) => -Math.hypot(p[0] - x, p[1] - y));
  const nearNeck = (x) => argMax(o, (p) => (p[1] > 0.66 ? -Math.abs(p[0] - x) : -Infinity));
  /** The shorter way round the outline from one point to the other. */
  const edge = (i, j) => {
    const f = path(o, i, j), b = path(o, j, i).reverse();
    return lineLength(f) <= lineLength(b) ? f : b;
  };
  return { o, near, nearNeck, edge };
}

/**
 * The regions of the garment's print atlas each print panel goes to: for each, the garment's side lines (in atlas
 * pixels) and the panel's matching side lines (in page pixels).
 */
export function regionsFor(painter, panels, image = null) {
  const g = garment(painter), out = [];
  const px = (back) => (line) => line.map(([x, y]) => { const c = painter.toCanvas(back, x, y); return [c.x, c.y]; });
  const byRole = Object.fromEntries(panels.filter((p) => p.role !== 'none').map((p) => [p.role, p]));
  if (painter.kind === 'shorts') {
    const pt = (x, y) => g.near(x, y);
    // CF / OT: the waist at the centre and at the side; ST: the side seam's lower end (the top of the split on
    // training shorts); IB: the inner hem corner; CR: the crotch (garment.js points).
    const P = painter.points ?? { CF: [0, 0.42], OT: [0.215, 0.42], ST: [0.272, 0.02], IB: [0.05, 0.02], CR: [0, 0.17] };
    for (const dir of [1, -1]) {
      const panel = byRole[dir > 0 ? 'legL' : 'legR'];
      if (!panel) continue;
      const halves = legPanel(panel.outline);
      const CF = pt(0, P.CF[1]), OT = pt(dir * P.OT[0], P.OT[1]), OB = pt(dir * P.ST[0], P.ST[1]), IB = pt(dir * P.IB[0], P.IB[1]), CR = pt(0, P.CR[1]);
      // The split's edge (from its top down to the hem) goes with the notch's edge, the hem with the hem, so the
      // band round the split is the same on both sides; shorts without a split have the notch closed up.
      const SH = P.SH ? pt(dir * P.SH[0], P.SH[1]) : OB;
      const centre = [g.o[CR], g.o[CF]];
      // The front of the wearer's left leg is the left half of its piece (laid out outside up); of the right leg, the right half.
      const outward = [g.edge(CF, OT), g.edge(OT, OB), g.edge(OB, SH), g.edge(SH, IB), g.edge(IB, CR), centre];
      const inward = [g.edge(OT, CF), [g.o[CF], g.o[CR]], g.edge(CR, IB), g.edge(IB, SH), g.edge(SH, OB), g.edge(OB, OT)];
      const closed = SH === OB;
      const left = closed ? [halves.left[0], halves.left[1], [...halves.left[2], ...halves.left[3].slice(1)], ...halves.left.slice(4)] : halves.left;
      const right = closed ? [...halves.right.slice(0, 3), [...halves.right[3], ...halves.right[4].slice(1)], halves.right[5]] : halves.right;
      const out6 = closed ? [outward[0], outward[1], outward[3], outward[4], outward[5]] : outward;
      const in6 = closed ? [inward[0], inward[1], inward[2], inward[3], inward[5]] : inward;
      // The leg's hem band keeps one height: both halves share the outside line (the piece's middle) and its scale.
      const shared = halves.left[1], sideG = g.edge(OT, OB);
      const band = { scale: lineLength(px(false)(sideG)) / lineLength(shared), zone: 0.6 * Math.min(lineLength(halves.left[4]), lineLength(halves.right[2])) };
      // A factory piece's hem often dips lower on one half (the back leg is longer), so its band is deeper there;
      // the mock-ups show it the same height all round: each half's band is drawn at their average depth.
      const pieceMiddle = centroid([panel.outline]);
      const depthL = image ? bandDepth(image, halves.left[3], pieceMiddle) : null, depthR = image ? bandDepth(image, halves.right[3], pieceMiddle) : null;
      const even = depthL && depthR ? (depthL + depthR) / 2 : null;
      const stripL = even ? band.scale * (even / depthL) : band.scale, stripR = even ? band.scale * (even / depthR) : band.scale;
      // Next to the hem the inside-leg seam meets it at another angle on the garment than on the piece: the band's
      // depth is measured square to the hem there; next to the split, along its edge.
      // The hem itself (not the split's edge) is mapped as a strip: every point near it keeps its distance from it at
      // the band's scale, so the band is the same height all along, front and back (the piece's two halves differ).
      // (Strip mapping of the hem, stripMap below, is off for now: it bent the band; to be redone.)
      // The hem itself (not the split's edge) is mapped as a strip (hemStripMap): the band the same height all
      // along, front and back.
      const hemL = closed ? { side: 2, last: 2, straight: 'after', hemStrip: 2 } : { side: 2, last: 3, straight: 'after', hemStrip: 3 };
      const hemR = closed ? { side: 3, last: 3, straight: 'before', hemStrip: 3 } : { side: 3, last: 4, straight: 'before', hemStrip: 3 };
      // Front of the wearer's left leg: the piece's left half on the outward-drawn sides; back: its right half.
      const regions = dir > 0
        ? [[false, out6, left, { ...hemL, stripScale: stripL }], [true, in6, right, { ...hemR, stripScale: stripR }]]
        : [[false, in6, right, { ...hemR, stripScale: stripR }], [true, out6, left, { ...hemL, stripScale: stripL }]];
      for (const [back, sides, target, edge] of regions) out.push({ back, sides: sides.map(px(back)), target, band: { ...band, ...edge } });
    }
    return out;
  }
  // Raglan top.
  const N = { 1: g.nearNeck(RAGLAN.neck), [-1]: g.nearNeck(-RAGLAN.neck) };
  // A: the top of the arm at the neck; CT / CB: the cuff's corners; U: the underarm; H: the hem's side (garment.js
  // points; the tee's places when the garment has none).
  const Q = { A: [0.086, 0.738], CT: [0.418, 0.566], CB: [0.372, 0.476], U: [0.258, 0.53], H: [0.258, 0.03], ...painter.points };
  const both = ([x, y]) => ({ 1: g.near(x, y), [-1]: g.near(-x, y) });
  const A = both(Q.A), CT = both(Q.CT), CB = both(Q.CB), U = both(Q.U), H = both(Q.H);
  const seam = (dir) => raglanSeam(g.o[N[dir]], dir, 24, g.o[U[dir]]);   // neck → underarm
  // Body panels, from the viewer's left: front seen from the front, back seen from behind.
  const body = (left, right) => [g.edge(N[left], N[right]), seam(right), g.edge(U[right], H[right]), g.edge(H[right], H[left]), g.edge(H[left], U[left]), [...seam(left)].reverse()];
  // A hem fold strip (layout.js hemFold) is sewn inside: the visible body ends at its top.
  const bodyOutline = (panel) => (panel.hemFold != null ? cutBelow(panel.outline, panel.hemFold) : panel.outline);
  const bodies = [[byRole.front, false, body(-1, 1)], [byRole.back, true, body(1, -1)]].filter(([panel]) => panel).map(([panel, back, sides]) => ({ back, sides: sides.map(px(back)), target: bodyPanel(bodyOutline(panel)) }));
  if (bodies.length) {
    const ratios = bodies.flatMap((r) => [2, 4].map((k) => lineLength(r.sides[k]) / lineLength(r.target[k])));
    const scale = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const zone = 0.15 * Math.min(...bodies.flatMap((r) => [2, 4].map((k) => lineLength(r.target[k]))));
    for (const r of bodies) out.push({ ...r, band: { side: 3, scale, zone, straight: true } });
  }
  // Sleeves: laid out outside up, the front of the left sleeve is its left half, of the right sleeve its right half.
  // One half (neck end, top of the arm, cuff, underside, raglan seam) …
  const half1 = (dir) => [g.edge(N[dir], A[dir]), g.edge(A[dir], CT[dir]), g.edge(CT[dir], CB[dir]), g.edge(CB[dir], U[dir]), [...seam(dir)].reverse()];
  // … and the other, starting at the top of the arm.
  const half2 = (dir) => [g.edge(A[dir], N[dir]), seam(dir), g.edge(U[dir], CB[dir]), g.edge(CB[dir], CT[dir]), g.edge(CT[dir], A[dir])];
  for (const [role, dir] of [['sleeveL', 1], ['sleeveR', -1]]) {
    const panel = byRole[role];
    if (!panel) continue;
    const halves = sleevePanel(panel.outline);
    // The cuff band keeps one height all round: both halves share the top of the arm (the piece's middle line)
    // and its scale, over a zone at the cuff end as deep as most of the short underside.
    const cuffChord = [halves.left[2][0], halves.right[3][0]], centre = halves.left[1][0];
    const band = {
      straight: true,
      scale: lineLength(px(false)(half1(dir)[1])) / lineLength(halves.left[1]),
      zone: 0.85 * Math.min(depth(halves.left[3].at(-1), cuffChord, centre), depth(halves.right[2][0], cuffChord, centre)),
    };
    // The cuff band's rows run straight round the arm: the cuff is straight (garment.js) and the band rule keeps its
    // depth. (Mapping it as a strip, stripMap with band.strip, tore its rows: off until redone.)
    if (dir > 0) {
      out.push({ back: false, sides: half1(dir).map(px(false)), target: halves.left, band: { ...band, side: 2 } });
      out.push({ back: true, sides: half2(dir).map(px(true)), target: halves.right, band: { ...band, side: 3 } });
    } else {
      out.push({ back: false, sides: half2(dir).map(px(false)), target: halves.right, band: { ...band, side: 3 } });
      out.push({ back: true, sides: half1(dir).map(px(true)), target: halves.left, band: { ...band, side: 2 } });
    }
  }
  return out;
}

// ---------- mapping and drawing ----------
/** Mean value coordinates of point q in polygon P (with q strictly inside). */
function mvc(P, q) {
  const n = P.length, w = new Float64Array(n);
  const d = P.map((p) => [p[0] - q[0], p[1] - q[1]]);
  const r = d.map((v) => Math.hypot(v[0], v[1]));
  const tanHalf = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, cr = d[i][0] * d[j][1] - d[i][1] * d[j][0], dt = d[i][0] * d[j][0] + d[i][1] * d[j][1];
    const ang = Math.atan2(cr, dt);
    tanHalf[i] = Math.tan(ang / 2);
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    w[i] = (tanHalf[(i - 1 + n) % n] + tanHalf[i]) / (r[i] || 1e-9);
    sum += w[i];
  }
  for (let i = 0; i < n; i++) w[i] /= sum;
  return w;
}
const insidePoly = (P, x, y) => {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};

/** How far point p is from the straight line through `chord` ([a, b]), on the side where `inside` is. */
function depth(p, [a, b], inside) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  let nx = -dy / l, ny = dx / l;
  if ((inside[0] - a[0]) * nx + (inside[1] - a[1]) * ny < 0) { nx = -nx; ny = -ny; }
  return (p[0] - a[0]) * nx + (p[1] - a[1]) * ny;
}
/** The distance along a line (from its start) where it first reaches depth d from the chord (its end if never). */
function lengthAtDepth(line, chord, inside, d) {
  let run = 0, prev = depth(line[0], chord, inside);
  for (let i = 1; i < line.length; i++) {
    const seg = len(line[i - 1], line[i]), cur = depth(line[i], chord, inside);
    if (cur >= d && cur !== prev) return run + seg * Math.max(0, Math.min(1, (d - prev) / (cur - prev)));
    run += seg;
    prev = cur;
  }
  return run;
}
const centroid = (sides) => { const pts = sides.flat(); return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]; };
/** Points moved `d` pixels towards a centre point. */
const inset = (pts, c, d) => pts.map(([x, y]) => { const l = Math.hypot(c[0] - x, c[1] - y) || 1; return [x + ((c[0] - x) * d) / l, y + ((c[1] - y) * d) / l]; });

/**
 * Matching points along one side of a region: on the garment (`g`) and on the print panel (`t`), evenly along
 * each. Next to a band edge (a cuff or hem; `zone` page pixels from the band's corner, at `scale` atlas pixels to
 * the page pixel) the garment side is measured at the band's own scale instead, the same on both sides of the
 * band, so a band printed along that edge stays one height all the way round; the rest of the side takes up the
 * difference. `fromEnd`: the band corner is at the side's end.
 */
function sideSamples(g, t, band, fromEnd) {
  if (!band) return [resample(g, S), resample(t, S)];
  const G = fromEnd ? [...g].reverse() : g, T = fromEnd ? [...t].reverse() : t;
  const Lg = lineLength(G), Lt = lineLength(T);
  // A straight band edge (a cuff, a body hem): the band's depth is measured square to that edge on both sides,
  // as the sides can meet it at different angles on the print and on the garment. Otherwise along the sides.
  const square = band.straight === true || band.straight === (fromEnd ? 'before' : 'after');
  const chords = band.chords?.[fromEnd ? 'before' : 'after'];
  const deep = square ? (line, which) => (d) => lengthAtDepth(line, chords[which], band.inside[which], d) : null;
  const zt = square ? Math.min(deep(T, 't')(band.zone), 0.8 * Lt) : Math.min(band.zone, 0.8 * Lt);
  const zg = square ? Math.min(deep(G, 'g')(band.zone * band.scale), 0.8 * Lg) : Math.min(zt * band.scale, 0.8 * Lg);
  const a = [], b = [];
  for (let k = 0; k <= S; k++) {
    const dt = (k / S) * Lt;
    let dg;
    if (dt > zt) dg = zg + ((dt - zt) * (Lg - zg)) / (Lt - zt);
    else if (square) dg = Math.min(zg, deep(G, 'g')(Math.max(0, depth(along(T, dt / Lt), chords.t, band.inside.t)) * band.scale));
    else dg = (dt * zg) / zt;
    a.push(along(G, dg / Lg));
    b.push(along(T, dt / Lt));
  }
  return fromEnd ? [a.reverse(), b.reverse()] : [a, b];
}

/**
 * How deep a hem's band is on the print (page pixels): the distance in from the hem line to the first white line
 * (its piping), the middle value over the hem's middle. Null when there is no such line.
 */
function bandDepth(image, hem, inside) {
  const xs = hem.map((p) => p[0]), ys = hem.map((p) => p[1]), pad = 260;
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad)), y0 = Math.max(0, Math.floor(Math.min(...ys) - pad));
  const x1 = Math.min(image.width, Math.ceil(Math.max(...xs) + pad)), y1 = Math.min(image.height, Math.ceil(Math.max(...ys) + pad));
  const c = document.createElement('canvas');
  c.width = x1 - x0; c.height = y1 - y0;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const found = [];
  for (const t of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
    const a = along(hem, t - 0.01), b = along(hem, t + 0.01), q = along(hem, t);
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    if ((inside[0] - q[0]) * nx + (inside[1] - q[1]) * ny < 0) { nx = -nx; ny = -ny; }
    for (let k = 4; k < pad - 4; k++) {
      const x = Math.round(q[0] + nx * k) - x0, y = Math.round(q[1] + ny * k) - y0;
      if (x < 0 || y < 0 || x >= c.width || y >= c.height) break;
      const i = (y * c.width + x) * 4;
      if (d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225) { found.push(k); break; }
    }
  }
  if (found.length < 4) return null;
  found.sort((m, n) => m - n);
  return found[Math.floor(found.length / 2)];
}

/**
 * A band along one side mapped as a strip: a garment point within `zoneG` of side `g` goes to the point on the
 * print side `t` at the same fraction along it, moved in from it by its distance over `scale`. Eased into the
 * general mapping (`base`) towards the top of the zone and at the side's two ends.
 */
function stripMap(g, t, scale, zoneG, inside) {
  const Lg = lineLength(g);
  // Cumulative lengths along the garment side, for the fraction of a point's nearest place on it.
  const cum = [0];
  for (let i = 1; i < g.length; i++) cum.push(cum[i - 1] + len(g[i - 1], g[i]));
  let nx = -(t.at(-1)[1] - t[0][1]), ny = t.at(-1)[0] - t[0][0];
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl; ny /= nl;
  const mid = along(t, 0.5);
  if ((inside[0] - mid[0]) * nx + (inside[1] - mid[1]) * ny < 0) { nx = -nx; ny = -ny; }
  return (q, base) => {
    let best = Infinity, at = 0;
    for (let i = 1; i < g.length; i++) {
      const a = g[i - 1], b = g[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2));
      const d = Math.hypot(q[0] - a[0] - dx * k, q[1] - a[1] - dy * k);
      if (d < best) { best = d; at = cum[i - 1] + k * Math.sqrt(l2); }
    }
    const u = at / Lg;
    const ease = (e0, e1, v) => { const s = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return s * s * (3 - 2 * s); };
    const weight = (1 - ease(0.6 * zoneG, zoneG, best)) * ease(0, 0.1, Math.min(u, 1 - u));
    if (weight <= 0) return base;
    // The print side's point at that fraction, moved in square to the side's overall line (a straight cuff; the
    // traced edge is a little jagged), from the same 6 pixels in as the region's own edge samples.
    const p = along(t, u), dist = 6 + best / scale;
    const sx = p[0] + nx * dist, sy = p[1] + ny * dist;
    return [base[0] + (sx - base[0]) * weight, base[1] + (sy - base[1]) * weight];
  };
}

/**
 * A shorts hem's band mapped as a strip: a garment point near the hem goes to the hem of the print at the same
 * fraction along it, moved in from it (square to the hem's overall line, which is steady where the traced edge is
 * jagged) by its distance over `scale`, starting the same 6 pixels in as the region's own edge samples. Eased into
 * the general mapping (`base`) over the top quarter of the zone and at the hem's two ends.
 */
function hemStripMap(g, t, scale, zoneG, inside) {
  const Lg = lineLength(g);
  const cum = [0];
  for (let i = 1; i < g.length; i++) cum.push(cum[i - 1] + len(g[i - 1], g[i]));
  let nx = -(t.at(-1)[1] - t[0][1]), ny = t.at(-1)[0] - t[0][0];
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl; ny /= nl;
  const mid = along(t, 0.5);
  if ((inside[0] - mid[0]) * nx + (inside[1] - mid[1]) * ny < 0) { nx = -nx; ny = -ny; }
  const ease = (e0, e1, v) => { const k = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
  return (q, base) => {
    let best = Infinity, at = 0;
    for (let i = 1; i < g.length; i++) {
      const a = g[i - 1], b = g[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2));
      const d = Math.hypot(q[0] - a[0] - dx * k, q[1] - a[1] - dy * k);
      if (d < best) { best = d; at = cum[i - 1] + k * Math.sqrt(l2); }
    }
    const u = at / Lg;
    const weight = (1 - ease(0.75 * zoneG, zoneG, best)) * ease(0, 0.06, Math.min(u, 1 - u));
    if (weight <= 0) return base;
    const p = along(t, u), dist = 6 + best / scale;
    const sx = p[0] + nx * dist, sy = p[1] + ny * dist;
    return [base[0] + (sx - base[0]) * weight, base[1] + (sy - base[1]) * weight];
  };
}

/** A triangle mesh over one region: atlas positions, page coordinates for each. */
function regionMesh(region, spacing) {
  const P = [], T = [], n = region.sides.length;
  let band = region.band;
  if (band?.straight) {
    // The chord of the band edge each neighbouring side touches (the first band side before it, the last after it),
    // on the garment and on the print, and which side of it the region is.
    const chord = (k) => ({ g: [region.sides[k][0], region.sides[k].at(-1)], t: [region.target[k][0], region.target[k].at(-1)] });
    band = { ...band, chords: { before: chord(band.side), after: chord(band.last ?? band.side) }, inside: { g: centroid(region.sides), t: centroid(region.target) } };
  }
  region.sides.forEach((side, k) => {
    const before = band && k === (band.side - 1 + n) % n, after = band && k === ((band.last ?? band.side) + 1) % n;
    const [a, b] = sideSamples(side, region.target[k], before || after ? band : null, before);
    P.push(...a.slice(0, -1));
    // Along a piece's cut edge, sample a few pixels in from it, so the white page round the piece never shows
    // at a seam (the straight lines between a piece's halves are inside it and stay as they are).
    T.push(...(region.target[k].length > 2 ? inset(b, centroid(region.target), 6) : b).slice(0, -1));
  });
  const points = [...P], targets = [...T];
  const strip = band?.strip != null ? stripMap(region.sides[band.strip], region.target[band.strip], band.stripScale ?? band.scale, band.zone * band.scale, centroid(region.target)) : null;
  const hemStrip = band?.hemStrip != null ? hemStripMap(region.sides[band.hemStrip], region.target[band.hemStrip], band.stripScale ?? band.scale, band.zone * band.scale, centroid(region.target)) : null;
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let y = y0 + spacing / 2; y < y1; y += spacing * 0.866) {
    const shift = (Math.round((y - y0) / (spacing * 0.866)) % 2) * spacing * 0.5;
    for (let x = x0 + shift; x < x1; x += spacing) {
      if (!insidePoly(P, x, y)) continue;
      if (P.some((p) => Math.hypot(p[0] - x, p[1] - y) < spacing * 0.45)) continue;
      const w = mvc(P, [x, y]);
      let tx = 0, ty = 0;
      for (let i = 0; i < T.length; i++) { tx += w[i] * T[i][0]; ty += w[i] * T[i][1]; }
      if (strip) [tx, ty] = strip([x, y], [tx, ty]);
      if (hemStrip) [tx, ty] = hemStrip([x, y], [tx, ty]);
      points.push([x, y]);
      targets.push([tx, ty]);
    }
  }
  const tri = Delaunator.from(points).triangles;
  const index = [];
  for (let i = 0; i < tri.length; i += 3) {
    const a = points[tri[i]], b = points[tri[i + 1]], c = points[tri[i + 2]];
    if (insidePoly(P, (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3)) index.push(tri[i], tri[i + 1], tri[i + 2]);
  }
  return { points, targets, index };
}

/**
 * Draws the print panels into a canvas the size of the painter's atlas (transparent elsewhere) with the graphics
 * card, from the layout page `image`.
 */
export function warpLayout(renderer, image, regions, width, height) {
  const tex = new THREE.CanvasTexture(image);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false });
  const geometries = [];
  for (const region of regions) {
    const mesh = regionMesh(region, Math.max(8, height / 90));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.points.flatMap(([x, y]) => [x, y, 0]), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.targets.flatMap(([x, y]) => [x / image.width, y / image.height]), 2));
    geo.setIndex(mesh.index);
    geometries.push(geo);
    scene.add(new THREE.Mesh(geo, material));
  }
  const camera = new THREE.OrthographicCamera(0, width, 0, height, -1, 1);
  const target = new THREE.WebGLRenderTarget(width, height, { samples: 4 });
  const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha(), was = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  const buf = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, buf);
  renderer.setRenderTarget(was);
  renderer.setClearColor(clear, alpha);
  target.dispose();
  tex.dispose();
  material.dispose();
  geometries.forEach((g) => g.dispose());
  // The rows come bottom first.
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const g = out.getContext('2d');
  const data = g.createImageData(width, height), row = width * 4;
  for (let y = 0; y < height; y++) data.data.set(buf.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  bleed(data.data, width, height);
  g.putImageData(data, 0, 0);
  return out;
}

/**
 * A panel's edge pixels are only partly covered, so they come back darkened (their colour times the part covered):
 * those are put back to the panel's own colour, and every panel is grown a few pixels past its edge. Otherwise the
 * 3D garment, sampling (and blurring) the print right at a seam, shows a dark line there, as where the two halves
 * of a sleeve meet on top of the arm.
 */
function bleed(px, width, height, passes = 4) {
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a > 0 && a < 255) for (let c = 0; c < 3; c++) px[i + c] = Math.min(255, Math.round((px[i + c] * 255) / a));
  }
  for (let pass = 0; pass < passes; pass++) {
    const src = px.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (src[i + 3] === 255) continue;
        // The most covered neighbour that is more covered than this pixel.
        let best = -1, cover = Math.max(src[i + 3], 96);
        if (x > 0 && src[i - 1] > cover) { cover = src[i - 1]; best = i - 4; }
        if (x < width - 1 && src[i + 7] > cover) { cover = src[i + 7]; best = i + 4; }
        if (y > 0 && src[i - width * 4 + 3] > cover) { cover = src[i - width * 4 + 3]; best = i - width * 4; }
        if (y < height - 1 && src[i + width * 4 + 3] > cover) { cover = src[i + width * 4 + 3]; best = i + width * 4; }
        if (best < 0) continue;
        px[i] = src[best]; px[i + 1] = src[best + 1]; px[i + 2] = src[best + 2]; px[i + 3] = 255;
      }
    }
  }
}

/** The average colour of a panel (or of a strip of it from `top` to `bottom`, as fractions of its height). */
export function panelColour(image, panel, top = 0, bottom = 1) {
  const w = 48, h = 48, c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  const y0 = panel.y0 + (panel.y1 - panel.y0) * top, y1 = panel.y0 + (panel.y1 - panel.y0) * bottom;
  g.drawImage(image, panel.x0, y0, panel.x1 - panel.x0, y1 - y0, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  // Inside the panel only (its outline, scaled to the little picture).
  g.setTransform(1, 0, 0, 1, 0, 0);
  const sx = w / (panel.x1 - panel.x0), sy = h / (y1 - y0);
  const P = panel.outline.map(([x, y]) => [(x - panel.x0) * sx, (y - y0) * sy]);
  let r = 0, gg = 0, b = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!insidePoly(P, x + 0.5, y + 0.5)) continue;
      const i = (y * w + x) * 4;
      r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
    }
  }
  if (!n) return '#808080';
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(gg)}${hex(b)}`;
}
