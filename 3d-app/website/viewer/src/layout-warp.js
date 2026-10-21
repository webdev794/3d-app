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

// ---------- garment drawings (the finished garment's front and back drawn flat, layout.js findPanels `drawing`)
/**
 * The point on the outline path a → b (indices) where it turns most sharply outwards (a corner of the shape: the
 * outline runs clockwise on screen), at least `margin` pixels from the path's ends; each turn is measured from the
 * direction `reach` pixels before the point to the direction `reach` pixels after it.
 */
function corner(o, a, b, reach, margin, keep = () => true) {
  const line = path(o, a, b), cum = [0];
  for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + len(line[k - 1], line[k]));
  const total = cum.at(-1);
  let best = -1, most = -Infinity;
  for (let k = 1; k < line.length - 1; k++) {
    if (cum[k] < margin || total - cum[k] < margin || !keep(line[k])) continue;
    const p = along(line, Math.max(0, cum[k] - reach) / total), q = line[k], r = along(line, Math.min(total, cum[k] + reach) / total);
    const ax = q[0] - p[0], ay = q[1] - p[1], bx = r[0] - q[0], by = r[1] - q[1];
    const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    if (turn > most) { most = turn; best = k; }
  }
  return best < 0 ? farthest(o, a, b) : (a + best) % o.length;
}

/**
 * Where each corner of a garment drawing goes on the 3D garment (garment metres, the wearer's left side; the right is
 * mirrored). A singlet: the neck's end at the top of the strap (N), the strap's outer top corner (S), the underarm
 * (U) and the hem's corner (H), as garment.js draws it.
 */
export const DRAWN = {
  singlet: { N: [0.095, 0.738], S: [0.152, 0.738], U: [0.236, 0.505], H: [0.254, 0.03], T: [0, 0.64] },
  // Sleeved tops (garment.js TOP_BODY): the neck's end (N) and tip (T), the cuff's top and bottom corners (CT, CB),
  // the underarm (U) and the hem's corner (H).
  jersey: { N: [0.088, 0.738], T: [0, 0.672], CT: [0.418, 0.566], CB: [0.372, 0.476], U: [0.258, 0.53], H: [0.258, 0.03] },
  tee: { N: [0.086, 0.738], T: [0, 0.7], CT: [0.418, 0.566], CB: [0.372, 0.476], U: [0.258, 0.53], H: [0.258, 0.03] },
  polo: { N: [0.082, 0.742], T: [0, 0.712], CT: [0.418, 0.566], CB: [0.372, 0.476], U: [0.258, 0.53], H: [0.258, 0.03] },
};
// The pocket polo is the polo's body with a chest pocket sewn on (garment.js SPECS.pocketpolo): the same corners.
DRAWN.pocketpolo = DRAWN.polo;

/** Whether a garment drawing's shape has sleeves: much wider across its top part than near its hem. */
export function sleevedShape(o) {
  const ys = o.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), H = y1 - y0;
  // The shape's width at a height: from its leftmost to its rightmost crossing of that line (the outline's points are
  // sparse along straight edges, so its edges are crossed, not its points taken).
  const width = (f) => {
    const y = y0 + f * H;
    let lo = Infinity, hi = -Infinity;
    o.forEach((a, i) => {
      const b = o[(i + 1) % o.length];
      if ((a[1] <= y) === (b[1] <= y)) return;
      const x = a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      lo = Math.min(lo, x); hi = Math.max(hi, x);
    });
    return hi > lo ? hi - lo : 0;
  };
  return Math.max(...[0.15, 0.2, 0.25, 0.3, 0.35, 0.4].map(width)) > 1.2 * Math.max(width(0.8), width(0.85));
}

/**
 * A sleeveless top drawn flat (a singlet's front or back, as seen from that side), outline clockwise on screen: its
 * corners on the viewer's left and right ({Nl, Nr, Sl, Sr, Ul, Ur, Hl, Hr}: indices into the outline; see DRAWN) and
 * its eight sides clockwise from the left end of the neck: neck, right strap top, right armhole, right side, hem,
 * left side, left armhole, left strap top. Corners that cannot be told apart fall back to the singlet's own places in
 * the drawing's box.
 */
export function drawingSides(o, sleeved = false) {
  // A photo mock-up laid flat keeps the corners found on it as photographed (unprojectPhoto).
  if (o.corners) {
    const { c, found, neckDepth, sleeved: own } = o.corners;
    const order = own ? ['Nl', 'Nr', 'CTr', 'CBr', 'Ur', 'Hr', 'Hl', 'Ul', 'CBl', 'CTl'] : ['Nl', 'Nr', 'Sr', 'Ur', 'Hr', 'Hl', 'Ul', 'Sl'];
    return { corners: c, sides: order.map((k, i) => path(o, c[k], c[order[(i + 1) % order.length]])), found, neckDepth };
  }
  if (sleeved) return sleevedSides(o);
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]), n = o.length;
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = x1 - x0, H = y1 - y0, cx = (x0 + x1) / 2;
  const on = (k, a, b) => (k - a + n) % n <= (b - a + n) % n;   // index k is on the path a → b
  const dips = pockets(o);
  const c = {};
  // The neck: the dip at the top nearest the middle; its ends are the top of the straps. Level strap tops lie on the
  // line the dip spans (from one strap's outer corner to the other's): the neck starts where the outline drops away.
  const neck = dips.filter((p) => p.depth > 0.008 * H && p.midY < y0 + 0.3 * H && Math.abs(p.midX - cx) < 0.25 * W).sort((a, b) => Math.abs(a.midX - cx) - Math.abs(b.midX - cx))[0];
  if (neck) {
    const [a, b] = [o[neck.i], o[neck.j]], l = len(a, b) || 1;
    const below = (k) => Math.abs((o[k][0] - a[0]) * (b[1] - a[1]) - (o[k][1] - a[1]) * (b[0] - a[0])) / l;
    c.Nl = neck.i; c.Nr = neck.j;
    for (let k = neck.i; k !== neck.deep && below(k) <= 0.012 * H; k = (k + 1) % n) c.Nl = k;
    for (let k = neck.j; k !== neck.deep && below(k) <= 0.012 * H; k = (k - 1 + n) % n) c.Nr = k;
  }
  c.Hr = argMax(o, (p) => p[0] + p[1]);
  c.Hl = argMax(o, (p) => -p[0] + p[1]);
  if (neck) {
    // The armholes: the deepest dip down each side. A strap's outer corner is the sharpest outward turn between the
    // neck and the armhole's deepest point; the underarm is the sharpest between the strap and the hem.
    const deepest = (a, b) => dips.filter((p) => p !== neck && on(p.i, a, b) && on(p.j, a, b)).sort((m, q) => q.depth - m.depth)[0];
    const right = deepest(c.Nr, c.Hr), left = deepest(c.Hl, c.Nl);
    const reach = 0.025 * H, margin = 0.03 * H;
    if (right && left) {
      c.Sr = corner(o, c.Nr, right.deep, reach, margin);
      c.Sl = corner(o, left.deep, c.Nl, reach, margin);
      // The underarm is in the upper part of the garment (a gently drawn one turns less than the hem's corners).
      const upper = (p) => p[1] > y0 + 0.15 * H && p[1] < y0 + 0.6 * H;
      c.Ur = corner(o, c.Sr, c.Hr, reach, margin, upper);
      c.Ul = corner(o, c.Hl, c.Sl, reach, margin, upper);
    }
  }
  const order = ['Nl', 'Nr', 'Sr', 'Ur', 'Hr', 'Hl', 'Ul', 'Sl'];
  // Each corner where a garment's is: in order round the outline, the neck and straps at the top, the underarms
  // between, the hem's corners at the bottom, the left ones left of the right ones.
  const at = (k, f, lo, hi) => (o[c[k]][f] - (f ? y0 : x0)) / (f ? H : W) >= lo && (o[c[k]][f] - (f ? y0 : x0)) / (f ? H : W) <= hi;
  const inOrder = order.every((k) => c[k] != null) && order.every((k, i) => i === 0 || (c[k] - c.Nl + n) % n > (c[order[i - 1]] - c.Nl + n) % n)
    && ['Nl', 'Nr'].every((k) => at(k, 1, 0, 0.2)) && ['Sl', 'Sr'].every((k) => at(k, 1, 0, 0.35)) && ['Ul', 'Ur'].every((k) => at(k, 1, 0.15, 0.65))
    && ['Hl', 'Hr'].every((k) => at(k, 1, 0.8, 1)) && at('Sl', 0, 0, 0.5) && at('Sr', 0, 0.5, 1) && at('Ul', 0, 0, 0.35) && at('Ur', 0, 0.65, 1);
  if (!inOrder) {
    // The singlet's own corners in the drawing's box, each at the nearest point of the outline.
    const at = DRAWN.singlet, half = at.H[0], top = at.N[1];
    const near = ([gx, gy], dir) => argMax(o, (p) => -Math.hypot(p[0] - (cx + (dir * gx * W) / (2 * half)), p[1] - (y0 + ((top - gy) / top) * H)));
    Object.assign(c, { Nl: near(at.N, -1), Nr: near(at.N, 1), Sr: near(at.S, 1), Ur: near(at.U, 1), Hr: near(at.H, 1), Hl: near(at.H, -1), Ul: near(at.U, -1), Sl: near(at.S, -1) });
  }
  // The neck's tip: its deepest point (a V's point).
  c.T = farthest(o, c.Nl, c.Nr);
  const sides = order.map((k, i) => path(o, c[k], c[order[(i + 1) % order.length]]));
  return { corners: c, sides, found: inOrder, neckDepth: neck ? neck.depth / H : 0 };
}

/**
 * A sleeved top drawn flat (a jersey's, tee's or polo's front or back, as seen from that side): its corners ({Nl, Nr,
 * T, CTr, CBr, Ur, Hr, Hl, Ul, CBl, CTl}: indices into the outline; see DRAWN) and its ten sides clockwise from the left
 * end of the neck: neck, right shoulder and sleeve top, right cuff, right sleeve's underside, right side, hem, left
 * side, left sleeve's underside, left cuff, left shoulder and sleeve top. The underarm is the deepest dip down each
 * side; the cuff's corners are the two sharpest outward turns between the neck and the underarm. Corners that cannot
 * be told apart fall back to the tee's own places in the drawing's box.
 */
function sleevedSides(o) {
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]), n = o.length;
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = x1 - x0, H = y1 - y0, cx = (x0 + x1) / 2;
  const on = (k, a, b) => (k - a + n) % n <= (b - a + n) % n;
  const dips = pockets(o);
  const c = {};
  const neck = dips.filter((p) => p.depth > 0.008 * H && p.midY < y0 + 0.3 * H && Math.abs(p.midX - cx) < 0.2 * W).sort((a, b) => Math.abs(a.midX - cx) - Math.abs(b.midX - cx))[0];
  if (neck) {
    const [a, b] = [o[neck.i], o[neck.j]], l = len(a, b) || 1;
    const below = (k) => Math.abs((o[k][0] - a[0]) * (b[1] - a[1]) - (o[k][1] - a[1]) * (b[0] - a[0])) / l;
    c.Nl = neck.i; c.Nr = neck.j;
    for (let k = neck.i; k !== neck.deep && below(k) <= 0.012 * H; k = (k + 1) % n) c.Nl = k;
    for (let k = neck.j; k !== neck.deep && below(k) <= 0.012 * H; k = (k - 1 + n) % n) c.Nr = k;
  }
  c.Hr = argMax(o, (p) => p[0] + p[1]);
  c.Hl = argMax(o, (p) => -p[0] + p[1]);
  if (neck) {
    const deepest = (a, b) => dips.filter((p) => p !== neck && on(p.i, a, b) && on(p.j, a, b)).sort((m, q) => q.depth - m.depth)[0];
    const right = deepest(c.Nr, c.Hr), left = deepest(c.Hl, c.Nl);
    if (right && left) {
      c.Ur = right.deep;
      c.Ul = left.deep;
      const reach = 0.02 * H, margin = 0.03 * H;
      const two = (a, b) => {
        const k1 = corner(o, a, b, reach, margin);
        const k2 = corner(o, a, b, reach, margin, (p) => len(p, o[k1]) > 0.06 * H);
        return [k1, k2].sort((m, q) => ((m - a + n) % n) - ((q - a + n) % n));
      };
      [c.CTr, c.CBr] = two(c.Nr, c.Ur);
      [c.CBl, c.CTl] = two(c.Ul, c.Nl);
    }
  }
  const order = ['Nl', 'Nr', 'CTr', 'CBr', 'Ur', 'Hr', 'Hl', 'Ul', 'CBl', 'CTl'];
  const at = (k, f, lo, hi) => (o[c[k]][f] - (f ? y0 : x0)) / (f ? H : W) >= lo && (o[c[k]][f] - (f ? y0 : x0)) / (f ? H : W) <= hi;
  const found = order.every((k) => c[k] != null) && order.every((k, i) => i === 0 || (c[k] - c.Nl + n) % n > (c[order[i - 1]] - c.Nl + n) % n)
    && ['Nl', 'Nr'].every((k) => at(k, 1, 0, 0.2)) && ['Hl', 'Hr'].every((k) => at(k, 1, 0.8, 1)) && ['Ul', 'Ur'].every((k) => at(k, 1, 0.1, 0.6))
    && ['CTl', 'CBl', 'CTr', 'CBr'].every((k) => at(k, 1, 0.02, 0.65)) && at('Ur', 0, 0.55, 0.95) && at('Ul', 0, 0.05, 0.45)
    && o[c.CTr][0] > o[c.Ur][0] && o[c.CBr][0] > o[c.Ur][0] && o[c.CTl][0] < o[c.Ul][0] && o[c.CBl][0] < o[c.Ul][0];
  if (!found) {
    const g = DRAWN.tee, half = g.CT[0], top = g.N[1];
    const near = ([gx, gy], dir) => argMax(o, (p) => -Math.hypot(p[0] - (cx + (dir * gx * W) / (2 * half)), p[1] - (y0 + ((top - gy) / top) * H)));
    Object.assign(c, { Nl: near(g.N, -1), Nr: near(g.N, 1), CTr: near(g.CT, 1), CBr: near(g.CB, 1), Ur: near(g.U, 1), Hr: near(g.H, 1), Hl: near(g.H, -1), Ul: near(g.U, -1), CBl: near(g.CB, -1), CTl: near(g.CT, -1) });
  }
  c.T = farthest(o, c.Nl, c.Nr);
  const sides = order.map((k, i) => path(o, c[k], c[order[(i + 1) % order.length]]));
  return { corners: c, sides, found, neckDepth: neck ? neck.depth / H : 0 };
}

/**
 * A singlet cut like a garment drawing (`panel`: its front): its straps, armholes and sides as drawn (left and right
 * averaged), at the 3D singlet's size (the neck's ends at the top of its straps, the hem's corners where its are),
 * with the singlet's own neck and hem (`base`: garment.js SPECS.singlet). Returns that spec with where its corners
 * are (`points`, for regionsFor), or null when the drawing's corners were not found or its cut is far from a
 * singlet's (the 3D singlet keeps its own cut then).
 */
export function drawnCut(panel, base) {
  const o = panel.outline, d = drawingSides(o), at = DRAWN.singlet;
  if (!d.found || !base) return null;
  const c = d.corners, P = (k) => o[c[k]];
  const top = (P('Nl')[1] + P('Nr')[1]) / 2, bottom = (P('Hl')[1] + P('Hr')[1]) / 2;
  if (bottom - top < 1) return null;
  const s = (at.N[1] - at.H[1]) / (bottom - top), cx = (P('Hl')[0] + P('Hr')[0] + P('Ul')[0] + P('Ur')[0]) / 4;
  const part = (a, b, n, mirror) => resample(path(o, c[a], c[b]), n).map(([x, y]) => [(mirror ? cx - x : x - cx) * s, at.N[1] - (y - top) * s]);
  const mean = (a, b) => a.map((p, i) => [(p[0] + b[i][0]) / 2, (p[1] + b[i][1]) / 2]);
  const arm = mean(part('Sr', 'Ur', 6, false), part('Ul', 'Sl', 6, true).reverse());
  const side = mean(part('Ur', 'Hr', 5, false), part('Hl', 'Ul', 5, true).reverse());
  const S = arm[0], U = arm.at(-1), H = [side.at(-1)[0], at.H[1]];
  const ok = S[0] > 0.11 && S[0] < 0.2 && S[1] > 0.64 && S[1] < at.N[1] + 0.005 && U[0] > 0.2 && U[0] < 0.3 && U[1] > 0.38 && U[1] < 0.6 && H[0] > 0.2 && H[0] < 0.31
    && arm.every(([x, y], i) => i === 0 || (y < arm[i - 1][1] + 0.002 && x > S[0] - 0.02)) && side.every(([, y], i) => i === 0 || y < side[i - 1][1]);
  if (!ok) return null;
  S[1] = Math.min(S[1], at.N[1]);
  const hem = base.half.slice(-3).map(([x, y]) => [(x * H[0]) / at.H[0], y]);
  const half = [...base.half.slice(0, 3), ...arm, ...side.slice(1, -1), H, ...hem];
  return { ...base, half, armhole: { x0: S[0] - 0.003, y0: U[1] - 0.005, x1: U[0] + 0.004 }, pit: [...U], points: { N: at.N, S: [...S], U: [...U], H, T: at.T } };
}

/** A sleeved top's arm (worn.js): from the middle of its armhole towards the middle of its cuff (garment metres). */
const ARMHOLE = [0.258, 0.609];

/**
 * A sleeved top (`base`: its garment.js spec, `kind`: jersey, tee or polo) with sleeves `f` times as long: each sleeve
 * point moved along the arm by its distance from the armhole, so the cuff keeps its width and slant. With where its
 * corners are (`points`, for regionsFor and texture.js).
 */
export function sleeveCut(base, kind, f) {
  const at = DRAWN[kind], mid = [(at.CT[0] + at.CB[0]) / 2, (at.CT[1] + at.CB[1]) / 2];
  const l = Math.hypot(mid[0] - ARMHOLE[0], mid[1] - ARMHOLE[1]), dx = (mid[0] - ARMHOLE[0]) / l, dy = (mid[1] - ARMHOLE[1]) / l;
  const move = ([x, y]) => {
    if (x <= at.U[0] + 1e-6) return [x, y];
    const t = (x - ARMHOLE[0]) * dx + (y - ARMHOLE[1]) * dy;
    return [x + (f - 1) * t * dx, y + (f - 1) * t * dy];
  };
  const CT = move(at.CT), CB = move(at.CB);
  return { ...base, half: base.half.map(move), cuff: [CT, CB], points: { ...at, CT, CB } };
}

/**
 * A sleeved top cut like a garment drawing (`panel`: its front): its sleeves as long as drawn, measured along the 3D
 * sleeve's arm at the garment's size (the neck's ends at the top, the hem's corners at the bottom), within what the
 * 3D arm takes (half to 1.3 times its own). Null when the drawing's sleeves are its own length (within 6 %) or its
 * corners were not found: the 3D garment stays as it is. `sleeve`: {drawn, made} lengths, as parts of the 3D one's.
 */
export function drawnSleeves(panel, kind, base) {
  const at = DRAWN[kind];
  if (!at?.CT || !base) return null;
  const o = panel.outline, d = drawingSides(o, true);
  if (!d.found) return null;
  const c = d.corners, P = (k) => o[c[k]];
  const top = (P('Nl')[1] + P('Nr')[1]) / 2, bottom = (P('Hl')[1] + P('Hr')[1]) / 2;
  if (bottom - top < 1) return null;
  const s = (at.N[1] - at.H[1]) / (bottom - top), centre = (P('Hl')[0] + P('Hr')[0] + P('Ul')[0] + P('Ur')[0]) / 4;
  const toG = ([x, y], mirror) => [(mirror ? centre - x : x - centre) * s, at.N[1] - (y - top) * s];
  const cuffMid = (a, b, mirror) => toG([(P(a)[0] + P(b)[0]) / 2, (P(a)[1] + P(b)[1]) / 2], mirror);
  const mid = [(at.CT[0] + at.CB[0]) / 2, (at.CT[1] + at.CB[1]) / 2];
  const l = Math.hypot(mid[0] - ARMHOLE[0], mid[1] - ARMHOLE[1]), dx = (mid[0] - ARMHOLE[0]) / l, dy = (mid[1] - ARMHOLE[1]) / l;
  const along = ([x, y]) => (x - ARMHOLE[0]) * dx + (y - ARMHOLE[1]) * dy;
  const f = (along(cuffMid('CTr', 'CBr', false)) + along(cuffMid('CTl', 'CBl', true))) / (2 * l);
  if (!(f > 0) || Math.abs(f - 1) < 0.06) return null;
  const made = Math.max(0.5, Math.min(1.3, f));
  return { ...sleeveCut(base, kind, made), sleeve: { drawn: f, made } };
}

/**
 * A photo mock-up's garments laid flat. A photo shows each garment round a body, turned a little: its centre line
 * (from the neck's tip down) is off the middle, and a point a part t of the way from it to a side shows only
 * sin(t·90°) of the way (the far side most foreshortened). Row by row, each side is taken back to flat between the
 * centre line and that side's edge at the body (above the underarms, the underarms' width), so the centre line runs
 * straight down and the print sits where it does on the garment. The panels' outlines move with it, keeping the
 * corners found on the photo (straps, armholes, neck). Returns the page laid flat; the panels are changed in place.
 */
export function unprojectPhoto(image, panels) {
  const W = image.width, H = image.height, out = document.createElement('canvas');
  out.width = W; out.height = H;
  const sd = image.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const g = out.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0);
  const od = g.getImageData(0, 0, W, H);
  const crossing = (o, y) => {
    let lo = Infinity, hi = -Infinity;
    o.forEach((a, i) => {
      const b = o[(i + 1) % o.length];
      if ((a[1] <= y) === (b[1] <= y)) return;
      const x = a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      lo = Math.min(lo, x); hi = Math.max(hi, x);
    });
    return hi > lo ? [lo, hi] : null;
  };
  for (const p of panels) {
    // The front (photographed turned, for a hero view); a back is shown straight on.
    if (p.frame || (p.role !== 'front' && p.role !== 'back')) continue;
    // The back: photographed straight on (its sides foreshortened alike), no turn to find.
    const back = p.role === 'back';
    const sleeved = sleevedShape(p.outline), d = drawingSides(p.outline, sleeved);
    if (!d.found) continue;
    const o = p.outline, c = { ...d.corners }, at = (k) => o[c[k]];
    // A turned garment's V: its tip is the neck's lowest point (the point farthest from the slanted line between the
    // neck's ends lies on the inside of the neck seen through it).
    for (let k = c.Nl, best = -Infinity; ; k = (k + 1) % o.length) {
      if (o[k][1] > best) { best = o[k][1]; c.T = k; }
      if (k === c.Nr) break;
    }
    const uy = (at('Ul')[1] + at('Ur')[1]) / 2;
    // Per row: the body's middle and half-width (the underarms' above them).
    const row = (y) => {
      const span = y > uy ? crossing(o, y) : null;
      const left = span ? span[0] : at('Ul')[0], right = span ? span[1] : at('Ur')[0];
      return { mid: (left + right) / 2, half: (right - left) / 2 };
    };
    // The garment round the body turned by an angle: a point at angle θ round the body shows at middle + half·sin(θ + turn).
    // The turn is the one that makes the print mirror itself best about the centre line (θ and -θ alike) on the rows below
    // the underarms (the logos are higher up), measured on three bands down the body that should agree.
    const hy = (at('Hl')[1] + at('Hr')[1]) / 2, rows = [];
    for (let k = 0; k < 36; k++) {
      const y = uy + (hy - uy) * (0.06 + (0.88 * k) / 35), r = row(y);
      if (r.half > 8) rows.push({ y: Math.round(y), ...r });
    }
    // Each band's print profile across the body (the colour's strength from the cloth's own, averaged down the band, so
    // fine detail and the photo's light matter little), compared with its mirror image.
    const ink = (x, y) => {
      let v = 0;
      for (let d = -1; d <= 1; d++) {
        const i = (y * W + Math.max(0, Math.min(W - 1, Math.round(x) + d))) * 4;
        v += Math.max(sd[i], sd[i + 1], sd[i + 2]) - Math.min(sd[i], sd[i + 1], sd[i + 2]) + 0.5 * (sd[i] + sd[i + 1] + sd[i + 2]) / 3;
      }
      return v / 3;
    };
    const mismatch = (turn, list) => {
      let sum = 0, n = 0;
      for (let j = 0; j <= 40; j++) {
        const f = 0.02 + (0.73 * j) / 40, ap = (f * Math.PI) / 2 + turn, an = (-f * Math.PI) / 2 + turn;
        if (Math.abs(ap) > 1.45 || Math.abs(an) > 1.45) continue;
        let u = 0, v = 0;
        for (const r of list) { u += ink(r.mid + r.half * Math.sin(ap), r.y); v += ink(r.mid + r.half * Math.sin(an), r.y); }
        sum += Math.abs(u - v) / list.length; n++;
      }
      return n > 20 ? sum / n : Infinity;
    };
    const best = (list) => {
      let at0 = mismatch(0, list), t = 0, m = at0;
      for (let d = -30; d <= 30; d++) { const v = mismatch((d * Math.PI) / 180, list); if (v < m) { m = v; t = (d * Math.PI) / 180; } }
      for (let d = -0.9; d <= 0.9; d += 0.1) { const v = mismatch(t + (d * Math.PI) / 180, list); if (v < m - 1e-9) { m = v; t += (d * Math.PI) / 180; } }
      return { t, m, at0 };
    };
    const bands = [0, 1, 2].map((k) => best(rows.slice(Math.round((k * rows.length) / 3), Math.round(((k + 1) * rows.length) / 3))));
    const ts = bands.map((b) => b.t).sort((a, b) => a - b);
    // A plain or one-sided print gives no clear answer (or bands that disagree): then the photo is taken as straight on.
    const clear = rows.length >= 12 && ts[2] - ts[0] < 0.105 && bands.every((b) => b.m < 0.9 * b.at0);
    const turn = clear && !back ? ts[1] : 0, s = Math.sign(turn) || 1;
    // The receding side's last strip (its side seam) is out of sight: the flat row is the visible one, its last part
    // (past the knee) spread over the hidden strip; the same map for the page's pixels and the outline.
    const fE = 1 - Math.abs(turn) / (Math.PI / 2), fK = Math.min(0.5, fE - 0.25);
    const toTrue = (f) => (s * f > fK ? s * (fK + ((s * f - fK) * (fE - fK)) / (1 - fK)) : f);
    const toFlat = (f) => (s * f > fK ? s * (fK + ((s * f - fK) * (1 - fK)) / (fE - fK)) : f);
    // Photo to flat (the outline's points), and flat to photo (the page's pixels): the flat row runs θ from -90° to 90°.
    const flat = (x, r) => {
      const t = (x - r.mid) / r.half;
      if (!(r.half > 4) || Math.abs(t) > 1) return x;
      const f = Math.max(s > 0 ? -1 : -fE, Math.min(s > 0 ? fE : 1, (Math.asin(t) - turn) / (Math.PI / 2)));
      return r.mid + r.half * toFlat(f);
    };
    const y0 = Math.max(0, Math.floor(p.y0)), y1 = Math.min(H - 1, Math.ceil(p.y1));
    for (let y = y0; y <= y1; y++) {
      const r = row(y + 0.5);
      if (!(r.half > 4)) continue;
      for (let x = Math.max(0, Math.floor(r.mid - r.half)); x <= Math.min(W - 2, Math.ceil(r.mid + r.half)); x++) {
        const f = (x - r.mid) / r.half;
        if (Math.abs(f) >= 1) continue;
        const xo = r.mid + r.half * Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, (toTrue(f) * Math.PI) / 2 + turn)));
        const xa = Math.max(0, Math.min(W - 2, Math.floor(xo))), fr = xo - xa;
        const i = (y * W + x) * 4, a = (y * W + xa) * 4;
        for (let k = 0; k < 4; k++) od.data[i + k] = sd[a + k] * (1 - fr) + sd[a + 4 + k] * fr;
      }
    }
    let moved = o.map(([x, y]) => [flat(x, row(y)), y]), mc = c;
    // A garment is cut the same both sides, but the photo's receding side (its strap, the neck seen through the V) and
    // the V's tip (hidden by the inside of the back) are unreliable: the flat outline is its near half, mirrored about
    // the centre line, with the V's tip on that line where the inside seen through the neck ends.
    if (!sleeved) {
      const cm = (y) => row(y).mid, mirror = ([x, y]) => [2 * cm(y) - x, y], near = s > 0 ? moved : moved.map(mirror);
      const grey = (x, y) => { const i = (y * W + Math.round(x)) * 4, l = (sd[i] + sd[i + 1] + sd[i + 2]) / 3; return l > 120 && Math.max(sd[i], sd[i + 1], sd[i + 2]) - Math.min(sd[i], sd[i + 1], sd[i + 2]) < 40; };
      let yT = null, seen = false;
      for (let y = Math.round(Math.min(at('Nl')[1], at('Nr')[1])), miss = 0; !back && y < uy; y++) {
        const r = row(y), g = grey(r.mid + r.half * Math.sin(turn), y);
        if (g) { seen = true; miss = 0; } else if (seen && ++miss >= 3) { yT = y - 2; break; }
      }
      const Ty = Math.max(at('T')[1], yT ?? at('T')[1]);
      const fwd = (a, b) => { const out = []; for (let k = a; ; k = (k + 1) % o.length) { out.push(k); if (k === b) break; } return out; };
      // The near half, forwards from the hem's middle (left of the centre line) to the neck, up to the V's tip.
      const NL = s > 0 ? 'Nl' : 'Nr', HL = s > 0 ? 'Hl' : 'Hr', HR = s > 0 ? 'Hr' : 'Hl';
      const step = s > 0 ? fwd : (a, b) => fwd(b, a).reverse();
      const hem = step(c[HR], c[HL]), start = hem.findIndex((k) => near[k][0] < cm(near[k][1]));
      const keys = [...hem.slice(Math.max(0, start)), ...step(c[HL], c[NL]).slice(1), ...step(c[NL], c.T).slice(1)]
        .filter((k, i, all) => all.indexOf(k) === i && (i < 2 || near[k][0] < cm(near[k][1]) - 1));
      if (start >= 0 && keys.length > 12 && Ty > at('T')[1] - 1) {
        const L = keys.map((k) => near[k]), n = L.length, tip = [cm(Ty), Ty];
        const half = [...L, tip, ...L.slice().reverse().map(mirror)];
        const idx = (key) => keys.indexOf(c[key]);
        const sideL = s > 0 ? ['Nl', 'Sl', 'Ul', 'Hl'] : ['Nr', 'Sr', 'Ur', 'Hr'], sideR = s > 0 ? ['Nr', 'Sr', 'Ur', 'Hr'] : ['Nl', 'Sl', 'Ul', 'Hl'];
        if (sideL.every((k) => idx(k) >= 0)) {
          mc = { ...c, T: n };
          sideL.forEach((k, j) => { mc[k] = idx(k); mc[sideR[j]] = 2 * n - idx(k); });
          const was = moved;
          moved = s > 0 ? half : half.map(mirror).reverse();
          // What the mirrored outline takes in beyond the photo's own (the receding strap is narrower in the photo): the
          // near side's print, mirrored.
          for (let y = Math.max(0, Math.floor(p.y0)); y <= Math.min(H - 1, Math.ceil(p.y1)); y++) {
            const r = row(y + 0.5);
            if (!(r.half > 4)) continue;
            for (let x = Math.max(0, Math.floor(r.mid - r.half - 4)); x <= Math.min(W - 1, Math.ceil(r.mid + r.half + 4)); x++) {
              if (s * (x - r.mid) <= 0 || insidePoly(was, x + 0.5, y + 0.5) || !insidePoly(moved, x + 0.5, y + 0.5)) continue;
              const xm = Math.max(0, Math.min(W - 1, Math.round(2 * r.mid - x))), i = (y * W + x) * 4, j = (y * W + xm) * 4;
              for (let k = 0; k < 4; k++) od.data[i + k] = od.data[j + k];
            }
          }
          if (s < 0) for (const k of Object.keys(mc)) mc[k] = moved.length - 1 - mc[k];
        }
      }
    }
    if (back && !sleeved && mc !== c) {
      // Its almost level top edge has no clear corners: the neck's ends and the straps' outer tops are taken where the
      // garment has them (DRAWN), as parts of the underarms' half-width, on the top edge of the (mirrored) outline.
      const n = mc.T, at2 = DRAWN.singlet, cx0 = moved[n][0], ux = moved[mc.Ul][0] - cx0, top0 = Math.min(...moved.map((q) => q[1]));
      const band = top0 + 0.25 * (moved[mc.Ul][1] - top0);
      const pick = (f) => {
        let bi = -1, bd = Infinity;
        // The top edge there: the highest point near that x (the armhole below it reaches the same x).
        for (let i = mc.Ul; i < n; i++) if (moved[i][1] < band) { const dd = Math.max(0, Math.abs(moved[i][0] - (cx0 + f * ux)) - 6) * 100 + moved[i][1]; if (dd < bd) { bd = dd; bi = i; } }
        return bi;
      };
      const iS = pick(at2.S[0] / at2.U[0]), iN = pick(at2.N[0] / at2.U[0]);
      if (iS > mc.Ul && iN > iS && iN < n) Object.assign(mc, { Sl: iS, Nl: iN, Sr: 2 * n - iS, Nr: 2 * n - iN });
    }
    if (back && !sleeved && mc !== c) {
      // The photo's straps end level with its back neck; the 3D back's straps rise about 0.09 of its height (neck to
      // hem) above the neck's middle. What is above a line just under the straps' tops moves up by that, a short band
      // under it drawn out to meet it (the page and the outline alike), so the print below keeps its place under the neck.
      const hem = (moved[mc.Hl][1] + moved[mc.Hr][1]) / 2, sy = Math.max(moved[mc.Sl][1], moved[mc.Sr][1]);
      const L = hem - sy, yN = sy + 0.02 * L, band = 0.04 * L, lift = Math.min(0.09 * L, Math.min(...moved.map((q) => q[1])) - 1);
      if (lift > 2 && L > 50) {
        const up = (y) => (y >= yN ? y : y >= yN - band ? yN - ((yN - y) * (band + lift)) / band : y - lift);
        const down = (y) => (y >= yN ? y : y >= yN - band - lift ? yN - ((yN - y) * band) / (band + lift) : y + lift);
        const xs = moved.map((q) => q[0]), x0 = Math.max(0, Math.floor(Math.min(...xs)) - 2), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)) + 2);
        const y0 = Math.max(0, Math.floor(Math.min(...moved.map((q) => q[1])) - lift - 1));
        for (let y = y0; y <= Math.floor(yN); y++) {
          const ys = Math.max(0, Math.min(H - 1, Math.round(down(y))));
          for (let x = x0; x <= x1; x++) { const i = (y * W + x) * 4, j = (ys * W + x) * 4; for (let q = 0; q < 4; q++) od.data[i + q] = od.data[j + q]; }
        }
        moved = moved.map(([x, y]) => [x, up(y)]);
        p.y0 = Math.min(p.y0, y0);
      }
    }
    moved.corners = { c: mc, found: d.found, neckDepth: d.neckDepth, sleeved };
    p.outline = moved;
  }
  g.putImageData(od, 0, 0);
  return out;
}

/** A garment drawing's front and back the right way round: the front's neck opening is the deeper one. */
export function orderDrawing(panels) {
  const front = panels.find((p) => p.role === 'front'), back = panels.find((p) => p.role === 'back');
  if (front && back && drawingSides(back.outline).neckDepth > 1.5 * drawingSides(front.outline).neckDepth + 0.02) {
    front.role = 'back';
    back.role = 'front';
  }
  return panels;
}

/** The colour along a line of the page (the middle value of each channel), each point taken `inset` pixels in towards `towards`. */
export function lineColour(image, line, towards, inset) {
  const pts = resample(line, 48).map(([x, y]) => {
    const l = Math.hypot(towards[0] - x, towards[1] - y) || 1;
    return [Math.round(x + ((towards[0] - x) * inset) / l), Math.round(y + ((towards[1] - y) * inset) / l)];
  });
  const x0 = Math.max(0, Math.min(...pts.map((p) => p[0]))), y0 = Math.max(0, Math.min(...pts.map((p) => p[1])));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.min(image.width, Math.max(...pts.map((p) => p[0])) + 1) - x0);
  c.height = Math.max(1, Math.min(image.height, Math.max(...pts.map((p) => p[1])) + 1) - y0);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const channels = [[], [], []];
  for (const [x, y] of pts) {
    const i = (Math.min(c.height - 1, Math.max(0, y - y0)) * c.width + Math.min(c.width - 1, Math.max(0, x - x0))) * 4;
    for (let k = 0; k < 3; k++) channels[k].push(d[i + k]);
  }
  return `#${channels.map((v) => v.sort((a, b) => a - b)[v.length >> 1].toString(16).padStart(2, '0')).join('')}`;
}

/** A panel's sides as matched to the garment (for checking the corners by eye). */
export function panelSides(panel, drawing = false) {
  if (drawing && (panel.role === 'front' || panel.role === 'back')) return { body: drawingSides(panel.outline).sides };
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
export function regionsFor(painter, panels, image = null, { drawing = false } = {}) {
  const g = garment(painter), out = [];
  const px = (back) => (line) => line.map(([x, y]) => { const c = painter.toCanvas(back, x, y); return [c.x, c.y]; });
  const byRole = Object.fromEntries(panels.filter((p) => p.role !== 'none').map((p) => [p.role, p]));
  if (drawing) {
    // A garment drawing: its front onto the garment's front, its back onto the back, corner to corner (the corners of
    // a singlet cut like the drawing, drawnCut, else DRAWN).
    const at = painter.points?.N ? painter.points : DRAWN[painter.kind];
    if (!at) return out;
    const both = ([x, y]) => ({ 1: g.near(x, y), [-1]: g.near(-x, y) });
    // Shapes are kept round on the front as worn (chest logos, seen as you turn to them), and on the back as laid flat:
    // the wrap is made so flat widths come back in the back view, where a big crest or number is looked at straight on.
    // A back point where it shows as worn: the back's neckline is raised (garment.js backHeight), so the print is placed
    // by that height and a crest just under the drawn neckline is not cut off.
    const raised = painter.surface ? ([x, y]) => {
      const q = painter.fromCanvas(x, y), up = q.y > 0.5 ? painter.surface(q.x, q.y, true).y - q.y : 0, c = painter.toCanvas(true, q.x, q.y + up);
      return [c.x, c.y];
    } : null;
    const shape = (back) => (painter.surface && !back ? ([x, y]) => { const p = painter.fromCanvas(x, y); return painter.surface(p.x, p.y, back); } : null);
    if (at.CT) {
      // A sleeved top: neck, shoulder and sleeve top, cuff, sleeve's underside, side and hem, corner to corner (all held).
      const N = both(at.N), CT = both(at.CT), CB = both(at.CB), U = both(at.U), H = both(at.H), T = g.near(...at.T);
      const sides = (l, r) => [g.edge(N[l], N[r]), g.edge(N[r], CT[r]), g.edge(CT[r], CB[r]), g.edge(CB[r], U[r]), g.edge(U[r], H[r]), g.edge(H[r], H[l]), g.edge(H[l], U[l]), g.edge(U[l], CB[l]), g.edge(CB[l], CT[l]), g.edge(CT[l], N[l])];
      for (const [role, back, l, r] of [['front', false, -1, 1], ['back', true, 1, -1]]) {
        const panel = byRole[role];
        if (!panel) continue;
        const drawn = drawingSides(panel.outline, true), o = panel.outline, c = drawn.corners;
        const region = { back, inset: Math.max(3, 0.005 * (panel.x1 - panel.x0)), conform: true, surface: shape(back) };
        if (back) out.push({ ...region, sides: sides(l, r).map(px(back)), target: drawn.sides, loose: [0] });
        else out.push({ ...region, sides: [g.edge(N[l], T), g.edge(T, N[r]), ...sides(l, r).slice(1)].map(px(back)), target: [path(o, c.Nl, c.T), path(o, c.T, c.Nr), ...drawn.sides.slice(1)] });
      }
      return out;
    }
    const N = both(at.N), S = both(at.S), U = both(at.U), H = both(at.H), T = g.near(...at.T);
    // From the viewer's left: the front as seen from the front (the wearer's right, x < 0, first), the back from behind.
    const sides = (l, r) => [g.edge(N[l], N[r]), g.edge(N[r], S[r]), g.edge(S[r], U[r]), g.edge(U[r], H[r]), g.edge(H[r], H[l]), g.edge(H[l], U[l]), g.edge(U[l], S[l]), g.edge(S[l], N[l])];
    for (const [role, back, l, r] of [['front', false, -1, 1], ['back', true, 1, -1]]) {
      const panel = byRole[role];
      if (!panel) continue;
      const drawn = drawingSides(panel.outline), o = panel.outline, c = drawn.corners;
      // Sampled a little in from the drawing's edge, past the outline drawn round it. The map keeps shapes (conform)
      // with the underarms and the hem's corners held, the other edge points sliding along the drawing's edge.
      // Shapes are kept on the fabric as worn (`surface`: atlas pixels to 3D), as they are seen on the 3D kit.
      const region = { back, inset: Math.max(3, 0.005 * (panel.x1 - panel.x0)), conform: true, surface: shape(back) };
      if (back) {
        // The garment's back neck is cut as deep as its front (its 3D back neckline is raised, garment.js): it cuts
        // into a drawing's shallower back neck instead of squeezing the print under it.
        out.push({ ...region, sides: sides(l, r).map(px(back)), target: drawn.sides, loose: [0], pins: [3, 4, 5, 6], lift: raised });
      } else {
        // The front's neck in two at its tip, held there and at its ends too, so a V's trim stays where it is.
        const gs = sides(l, r);
        out.push({ ...region, sides: [g.edge(N[l], T), g.edge(T, N[r]), ...gs.slice(1)].map(px(back)), target: [path(o, c.Nl, c.T), path(o, c.T, c.Nr), ...drawn.sides.slice(1)], pins: [0, 1, 2, 4, 5, 6, 7] });
      }
    }
    return out;
  }
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
      // Every row of the printed band at its own depth from the cuff, square to it, at the band's scale (regionMesh).
      cuffDepth: true,
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

/** The closest point to `q` on a line of points with its running lengths `cum`: its distance along the line. */
function project(line, cum, q) {
  let best = Infinity, at = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2));
    const d = Math.hypot(q[0] - a[0] - dx * k, q[1] - a[1] - dy * k);
    if (d < best) { best = d; at = cum[i - 1] + k * (cum[i] - cum[i - 1]); }
  }
  return at;
}
/** The point a distance `s` along a line of points with its running lengths `cum`, and the line's direction there. */
function pointAt(line, cum, s) {
  let i = 1;
  while (i < line.length - 1 && cum[i] < s) i++;
  const a = line[i - 1], b = line[i], l = cum[i] - cum[i - 1] || 1, f = Math.max(0, Math.min(1, (s - cum[i - 1]) / l));
  return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
}

/**
 * A garment drawing's mesh made as near to conformal as it can be: everywhere only turned and evenly scaled, never
 * sheared, so a round logo stays round and lettering keeps its proportions, while the edge stays on the drawing's
 * edge. Least squares of the Cauchy–Riemann equations over the triangles (the mesh's page positions as unknowns), the
 * edge points free to slide along their side of the drawing (each a few times: solved along its direction there,
 * then put back on the side, in order), the corners and `fixed` points held. Starts from `targets` (the mean value
 * map) and refines them in place; left as they were if any triangle would turn over.
 * `points`: atlas positions, the first `edge.length` the edge in order round it; `edge[i]`: {side, fixed};
 * `sides[k]`: the page line its points slide on. `surface` (atlas point to its 3D place on the worn garment): shapes
 * are kept there instead of on the flat atlas (each triangle measured in its own plane).
 */
function conformalTargets(points, targets, index, edge, sides, surface = null) {
  const n = points.length, nb = edge.length, ni = n - nb;
  const lines = sides.map((line) => { const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + len(line[i - 1], line[i])); return { line, cum }; });
  const worn = surface ? points.map(surface) : null;
  // Each triangle's basis gradients (atlas pixels, or metres on the worn fabric laid in the triangle's plane, the
  // same way round as on the atlas), weighted by the square root of its area. Slivers (three edge points in a row
  // along a curve) are left out: they have no shape to keep.
  const tris = [];
  for (let t = 0; t < index.length; t += 3) {
    const v = [index[t], index[t + 1], index[t + 2]];
    let [p0, p1, p2] = v.map((i) => points[i]);
    const flat = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    if (worn && flat) {
      const [a, b, c] = v.map((i) => worn[i]), e1 = b.clone().sub(a), e2 = c.clone().sub(a), l1 = e1.length();
      const u = e1.clone().divideScalar(l1 || 1), x2 = e2.dot(u), y2 = Math.sqrt(Math.max(0, e2.lengthSq() - x2 * x2));
      const q = [[0, 0], [l1, 0], [x2, flat < 0 ? -y2 : y2]];
      // How much the worn shape differs from the flat one (long / short axis of flat to worn): the body's wrap is
      // kept; where the fabric turns sharply (over the shoulder, the raised back neck) the flat shape is.
      const f1 = [p1[0] - p0[0], p1[1] - p0[1]], f2 = [p2[0] - p0[0], p2[1] - p0[1]];
      const m = [[(q[1][0] * f2[1] - q[2][0] * f1[1]) / flat, (q[2][0] * f1[0] - q[1][0] * f2[0]) / flat], [(q[1][1] * f2[1] - q[2][1] * f1[1]) / flat, (q[2][1] * f1[0] - q[1][1] * f2[0]) / flat]];
      const tr = m[0][0] ** 2 + m[0][1] ** 2 + m[1][0] ** 2 + m[1][1] ** 2, det = Math.abs(m[0][0] * m[1][1] - m[0][1] * m[1][0]);
      const big = Math.sqrt((tr + Math.sqrt(Math.max(0, tr * tr - 4 * det * det))) / 2);
      if (det && big * big / det < 1.3) [p0, p1, p2] = q;
    }
    const a2 = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const longest = Math.max(len(p0, p1), len(p1, p2), len(p2, p0));
    if (Math.abs(a2) < 0.1 * longest * longest || Math.sign(a2) !== Math.sign(flat)) continue;
    const w = Math.sqrt(Math.abs(a2) / 2) / a2;
    tris.push({ v, gx: [(p1[1] - p2[1]) * w, (p2[1] - p0[1]) * w, (p0[1] - p1[1]) * w], gy: [(p2[0] - p1[0]) * w, (p0[0] - p2[0]) * w, (p1[0] - p0[0]) * w] });
  }
  const slot = new Int32Array(nb).fill(-1);
  let slides = 0;
  edge.forEach((e, i) => { if (!e.fixed) slot[i] = 2 * ni + slides++; });
  const m = 2 * ni + slides, damping = Math.sqrt(0.05);
  const at = targets.map((p) => [...p]);
  const along = new Float64Array(nb);
  edge.forEach((e, i) => { if (!e.fixed) along[i] = project(lines[e.side].line, lines[e.side].cum, at[i]); });
  const iterations = [];
  // Rows: two per triangle (u_x - v_y, u_y + v_x; up to six terms each), then one per sliding point (damping).
  const R = 2 * tris.length, rowStart = new Int32Array(R + 1), cols = new Int32Array(6 * R), vals = new Float64Array(6 * R);
  const rhs = new Float64Array(R + slides), z = new Float64Array(m), g = new Float64Array(m), p = new Float64Array(m);
  const r = new Float64Array(R + slides), q = new Float64Array(R + slides);
  const times = (x, out) => {
    for (let i = 0; i < R; i++) { let s = 0; for (let k = rowStart[i]; k < rowStart[i + 1]; k++) s += vals[k] * x[cols[k]]; out[i] = s; }
    for (let s = 0; s < slides; s++) out[R + s] = damping * x[2 * ni + s];
  };
  const timesT = (y, out) => {
    out.fill(0);
    for (let i = 0; i < R; i++) { const v = y[i]; if (v) for (let k = rowStart[i]; k < rowStart[i + 1]; k++) out[cols[k]] += vals[k] * v; }
    for (let s = 0; s < slides; s++) out[2 * ni + s] += damping * y[R + s];
  };
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  for (let round = 0; round < 3; round++) {
    // Each edge point's direction along its line.
    const dir = edge.map((e, i) => (e.fixed ? null : pointAt(lines[e.side].line, lines[e.side].cum, along[i]).t));
    let nz = 0;
    tris.forEach(({ v, gx, gy }, t) => {
      const r1 = 2 * t, r2 = r1 + 1;
      let b1 = 0, b2 = 0;
      const one = [], two = [];
      v.forEach((j, s) => {
        if (j >= nb) { const cu = 2 * (j - nb); one.push(cu, gx[s], cu + 1, -gy[s]); two.push(cu, gy[s], cu + 1, gx[s]); return; }
        const at0 = at[j];
        b1 += gx[s] * at0[0] - gy[s] * at0[1];
        b2 += gy[s] * at0[0] + gx[s] * at0[1];
        if (slot[j] >= 0) { const [tx, ty] = dir[j]; one.push(slot[j], gx[s] * tx - gy[s] * ty); two.push(slot[j], gy[s] * tx + gx[s] * ty); }
      });
      rowStart[r1] = nz;
      for (let k = 0; k < one.length; k += 2) { cols[nz] = one[k]; vals[nz++] = one[k + 1]; }
      rowStart[r2] = nz;
      for (let k = 0; k < two.length; k += 2) { cols[nz] = two[k]; vals[nz++] = two[k + 1]; }
      rhs[r1] = -b1; rhs[r2] = -b2;
    });
    rowStart[R] = nz;
    // Least squares (CGLS) from where the points are now.
    z.fill(0);
    for (let i = 0; i < ni; i++) { z[2 * i] = at[nb + i][0]; z[2 * i + 1] = at[nb + i][1]; }
    times(z, q);
    for (let i = 0; i < r.length; i++) r[i] = rhs[i] - q[i];
    timesT(r, g);
    p.set(g);
    let gamma = dot(g, g), it = 0;
    const stop = gamma * 1e-12;
    for (; it < 2000 && gamma > stop; it++) {
      times(p, q);
      const qq = dot(q, q);
      if (!qq) break;
      const alpha = gamma / qq;
      for (let i = 0; i < m; i++) z[i] += alpha * p[i];
      for (let i = 0; i < r.length; i++) r[i] -= alpha * q[i];
      timesT(r, g);
      const next = dot(g, g), beta = next / gamma;
      gamma = next;
      for (let i = 0; i < m; i++) p[i] = g[i] + beta * p[i];
    }
    iterations.push(it);
    for (let i = 0; i < ni; i++) at[nb + i] = [z[2 * i], z[2 * i + 1]];
    // The edge points moved along their lines, back onto them, still in order along each: each run of sliding
    // points from the held point before it (the start of its line) to the end of its line (the next held point).
    edge.forEach((e, i) => {
      if (e.fixed) return;
      const d = z[slot[i]], q0 = at[i];
      along[i] = project(lines[e.side].line, lines[e.side].cum, [q0[0] + dir[i][0] * d, q0[1] + dir[i][1] * d]);
    });
    const start = edge.findIndex((e) => e.fixed);
    for (let s = 1; start >= 0 && s <= nb;) {
      const i = (start + s) % nb;
      if (edge[i].fixed) { s++; continue; }
      const run = [];
      while (s <= nb && !edge[(start + s) % nb].fixed && edge[(start + s) % nb].side === edge[i].side) run.push((start + s++) % nb);
      const { line, cum } = lines[edge[i].side], before = (run[0] - 1 + nb) % nb, gap = cum.at(-1) / (8 * (run.length + 2));
      let lo = edge[before].side === edge[i].side ? project(line, cum, at[before]) : 0;
      for (const k of run) { along[k] = Math.max(along[k], lo + gap); lo = along[k]; }
      let hi = cum.at(-1);
      for (let k = run.length - 1; k >= 0; k--) { along[run[k]] = Math.min(along[run[k]], hi - gap); hi = along[run[k]]; }
      for (const k of run) at[k] = pointAt(line, cum, along[k]).p;
    }
  }
  // Every triangle the same way round as on the garment, or the mean value map is kept (three edge points in a row
  // round a corner make a sliver too small to see).
  const flipped = tris.filter(({ v }) => v.some((i) => i >= nb)).filter(({ v }) => {
    const [a, b, c] = v.map((i) => points[i]), [A, B, C] = v.map((i) => at[i]);
    return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) !== Math.sign((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]));
  });
  if (!flipped.length) at.forEach((p, i) => { targets[i] = p; });
  return { kept: !flipped.length, flipped: flipped.length, iterations };
}

/** The scale and shift (no turn) that best take points `a` onto points `b` (least squares), as a function of a point. */
function fitScale(a, b) {
  const mean = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const ma = mean(a), mb = mean(b);
  let num = 0, den = 0;
  a.forEach((p, i) => {
    const ax = p[0] - ma[0], ay = p[1] - ma[1];
    num += ax * (b[i][0] - mb[0]) + ay * (b[i][1] - mb[1]);
    den += ax * ax + ay * ay;
  });
  const s = den ? num / den : 1;
  return ([x, y]) => [mb[0] + s * (x - ma[0]), mb[1] + s * (y - ma[1])];
}

/** A triangle mesh over one region: atlas positions, page coordinates for each. */
export function regionMesh(region, spacing) {
  const P = [], T = [], n = region.sides.length;
  let band = region.band;
  if (band?.straight) {
    // The chord of the band edge each neighbouring side touches (the first band side before it, the last after it),
    // on the garment and on the print, and which side of it the region is.
    const chord = (k) => ({ g: [region.sides[k][0], region.sides[k].at(-1)], t: [region.target[k][0], region.target[k].at(-1)] });
    band = { ...band, chords: { before: chord(band.side), after: chord(band.last ?? band.side) }, inside: { g: centroid(region.sides), t: centroid(region.target) } };
  }
  const samples = region.sides.map((side, k) => {
    const before = band && k === (band.side - 1 + n) % n, after = band && k === ((band.last ?? band.side) + 1) % n;
    const [a, b] = sideSamples(side, region.target[k], before || after ? band : null, before);
    // Along a piece's cut edge, sample a few pixels in from it, so the white page round the piece never shows
    // at a seam (the straight lines between a piece's halves are inside it and stay as they are). A region with its
    // own `inset` (a garment drawing: every side is its edge) is sampled that far in all round.
    return [a, region.inset != null || region.target[k].length > 2 ? inset(b, centroid(region.target), region.inset ?? 6) : b];
  });
  // `loose` sides (a garment drawing's back neck: the garment's is deeper than drawn) are not stretched to the
  // drawing's edge where the drawing reaches past them: the garment's edge cuts into it there, at the scale that best
  // fits the corners (so the print under it keeps its shape), easing back to the corners over their ends.
  const held = new Set();
  if (region.loose?.length) {
    // Placed by where the garment's points show as worn (`lift`: a back's neckline is raised there), else as laid flat.
    const edge = samples.flatMap(([, t]) => t.slice(0, -1)), inside = (pts) => pts.every(([x, y]) => insidePoly(edge, x, y));
    const place = (lift) => { const fit = fitScale(region.sides.map((s) => lift(s[0])), region.target.map((t) => t[0])); return (p) => fit(lift(p)); };
    const rigids = region.lift ? [place(region.lift), place((p) => p)] : [place((p) => p)];
    for (const k of region.loose) {
      const [a, t] = samples[k], L = lineLength(a), r = rigids.map((rigid) => a.map(rigid)).find(inside);
      if (!r) continue;
      held.add(k);
      let run = 0;
      samples[k][1] = t.map((p, i) => {
        if (i) run += len(a[i - 1], a[i]);
        const e = Math.max(0, Math.min(1, Math.min(run, L - run) / (0.2 * L))), w = e * e * (3 - 2 * e);
        return [p[0] + (r[i][0] - p[0]) * w, p[1] + (r[i][1] - p[1]) * w];
      });
    }
  }
  for (const [a, t] of samples) { P.push(...a.slice(0, -1)); T.push(...t.slice(0, -1)); }
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
  // A sleeve's cuff band (band.cuffDepth): each point's print depth (square to the print's cuff line) set from its own
  // depth on the garment (square to the garment's cuff line) at the band's scale, from the same 6 pixels in as the edge
  // samples, so each row of the band is one straight line along the cuff at one height. Only the depth is moved (never
  // along the cuff), over the band and a little above it, easing back to the general mapping below the zone's top;
  // the cuff line's bulge past its chord keeps the general mapping.
  if (band?.cuffDepth) {
    const k = band.side, gc = [region.sides[k][0], region.sides[k].at(-1)], tc = [region.target[k][0], region.target[k].at(-1)];
    const inward = ([a, b], inside) => {
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      return (inside[0] - a[0]) * nx + (inside[1] - a[1]) * ny < 0 ? [-nx, -ny] : [nx, ny];
    };
    const ng = inward(gc, centroid(region.sides)), nt = inward(tc, centroid(region.target));
    const smooth = (e0, e1, v) => { const s = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return s * s * (3 - 2 * s); };
    const full = 0.66 * band.zone;
    for (let i = 0; i < points.length; i++) {
      const q = points[i], dg = ((q[0] - gc[0][0]) * ng[0] + (q[1] - gc[0][1]) * ng[1]) / band.scale;
      const w = smooth(-0.5, 3, dg) * (1 - smooth(full, band.zone, dg));
      if (w <= 0) continue;
      const p = targets[i], dt = (p[0] - tc[0][0]) * nt[0] + (p[1] - tc[0][1]) * nt[1], shift = (6 * Math.max(0, 1 - dg / band.zone) + dg - dt) * w;
      targets[i] = [p[0] + nt[0] * shift, p[1] + nt[1] * shift];
    }
  }
  const tri = Delaunator.from(points).triangles;
  const index = [];
  for (let i = 0; i < tri.length; i += 3) {
    const a = points[tri[i]], b = points[tri[i + 1]], c = points[tri[i + 2]];
    if (insidePoly(P, (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3)) index.push(tri[i], tri[i + 1], tri[i + 2]);
  }
  // A garment drawing: shapes kept (conformalTargets). Held: the corners in `pins` (each a side's first point; all
  // when not given), a loose side cut in, and the points next to it. Every other edge point slides along the
  // drawing's edge, past corners not held: from one held point to the next is one line on the page.
  if (region.conform) {
    const count = region.sides.length, pins = new Set(region.pins ?? region.sides.map((_, k) => k));
    const heldStart = (k) => pins.has(k) || held.has(k) || held.has((k - 1 + count) % count);
    const first = region.sides.findIndex((_, k) => heldStart(k));
    const group = [], lines = [], centre = centroid(region.target);
    for (let s = 0, gi = -1; s < count; s++) {
      const k = (Math.max(0, first) + s) % count;
      if (heldStart(k) || gi < 0) gi++;
      group[k] = gi;
      (lines[gi] ??= []).push(...inset(resample(region.target[k], 4 * S), centre, region.inset ?? 6));
    }
    const edge = samples.flatMap(([a], k) => a.slice(0, -1).map((_, i) => ({ side: group[k], fixed: held.has(k) || (i === 0 && heldStart(k)) })));
    // On the fabric as worn; if that would turn a triangle over, on the flat garment.
    let result = conformalTargets(points, targets, index, edge, lines, region.surface);
    if (!result.kept && region.surface) result = { ...conformalTargets(points, targets, index, edge, lines, null), flat: true };
    return { points, targets, index, conformal: result };
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
    // A garment drawing's map is smooth (conformal): a coarser mesh draws it as well, and is quicker to solve.
    const mesh = regionMesh(region, Math.max(8, height / (region.conform ? 64 : 90)));
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
