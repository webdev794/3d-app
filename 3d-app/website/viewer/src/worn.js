import * as THREE from 'three';
import { FIGURES, figureOf } from './figure.js';

// The worn shape: flat front / back panels wrapped round an athletic body, so a
// garment looks like someone is wearing it (round torso, round sleeves round the
// arms, legs in shorts) instead of a flat shirt puffed up. The flat panel layout
// (and so every print, logo and number) is unchanged: only where each point sits
// in 3D changes. Garment metres, y up (hem at 0), front +z.

const ramp = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Half the perimeter of an ellipse with semi-axes a and k·a is (π a / 2) · ellipseF(k) (Ramanujan). */
const ellipseF = (k) => 3 * (1 + k) - Math.sqrt((3 + k) * (1 + 3 * k));
/** Piecewise-linear value at `key` through [key, value] pairs sorted by key. */
function along(pairs, y) {
  if (y <= pairs[0][0]) return pairs[0][1];
  for (let i = 1; i < pairs.length; i++) {
    if (y <= pairs[i][0]) { const [y0, x0] = pairs[i - 1], [y1, x1] = pairs[i]; return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0); }
  }
  return pairs.at(-1)[1];
}
/**
 * Wraps a panel point round an ellipse whose front half is exactly as wide as the
 * panel at that height (half-width `half`), so the fabric fits without stretching.
 */
function wrap(x, half, k, back, box = 2) {
  const a = (4 * half) / (Math.PI * ellipseF(k)), th = (THREE.MathUtils.clamp(Math.abs(x) / half, 0, 1) * Math.PI) / 2;
  if (box <= 2.001) return { x: Math.sign(x) * a * Math.sin(th), z: (back ? -1 : 1) * k * a * Math.cos(th), a, th };
  // `box` > 2: a squarer section (a superellipse of that power), as wide and as deep, flatter in front and behind with
  // fuller corners at the sides (the football jersey hanging boxy over its pads). The panel is laid round it evenly
  // along its edge, so the print keeps its proportions across the flat front.
  const [px, pz] = boxPoint(k, box, THREE.MathUtils.clamp(Math.abs(x) / half, 0, 1));
  return { x: Math.sign(x) * a * px, z: (back ? -1 : 1) * a * pz, a, th };
}
/** A superellipse quarter (half-width 1, depth k, power p) at the share s (0 front middle .. 1 side) of its length. */
const boxTables = new Map();
function boxPoint(k, p, s) {
  const key = `${k.toFixed(3)}|${p.toFixed(2)}`;
  let t = boxTables.get(key);
  if (!t) {
    const N = 96, e = 2 / p, pts = [];
    for (let i = 0; i <= N; i++) { const f = (i / N) * (Math.PI / 2); pts.push([Math.sin(f) ** e, k * Math.cos(f) ** e]); }
    const len = [0];
    for (let i = 1; i <= N; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    t = { pts, len: len.map((l) => l / len[N]) };
    if (boxTables.size > 400) boxTables.clear();
    boxTables.set(key, t);
  }
  let lo = 0, hi = t.len.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t.len[mid] <= s) lo = mid; else hi = mid; }
  const f = (s - t.len[lo]) / (t.len[hi] - t.len[lo] || 1);
  return [t.pts[lo][0] + (t.pts[hi][0] - t.pts[lo][0]) * f, t.pts[lo][1] + (t.pts[hi][1] - t.pts[lo][1]) * f];
}
/** max(0, x) with its corner rounded over about `k`. */
const softPlus = (x, k) => (x > 8 * k ? x : x < -8 * k ? 0 : k * Math.log1p(Math.exp(x / k)));
/** A rounded swelling: 1 in the middle, easing to 0 at radius 1 (u, v in radii). */
const pillow = (u, v, inner) => { const r = Math.hypot(u, v); return r >= 1 ? 0 : 1 - ramp(inner, 1, r); };
/** A rounded block (a stomach muscle): 1 over its middle, easing to 0 at its squarish edge (u, v in half-sizes). */
const block = (u, v, inner) => { const r = (Math.abs(u) ** 3 + Math.abs(v) ** 3) ** (1 / 3); return r >= 1 ? 0 : 1 - ramp(inner, 1, r); };
const groove = (d, w) => Math.exp(-(d * d) / (2 * w * w));
/** Signed distance (+ above) from (x, y) to the line a→b, and how far along it (0..1). */
function line(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), qx = x - ax, qy = y - ay;
  return { d: (qy * dx - qx * dy) / len, t: (qx * dx + qy * dy) / (len * len) };
}

// A sleeved top's armpit and shoulder-point heights, and its side seam.
const PIT = 0.53, TOP = 0.688;
const SIDE = [[0.03, 0.258], [0.16, 0.25], [0.3, 0.244], [0.42, 0.25], [PIT, 0.258]];
/** Half-width of a sleeved top's body panel: side seam, armhole edge (the printed armhole seam), shoulder line. */
function bodyHalf(y, neck) {
  if (y <= PIT) return along(SIDE, y);
  if (y <= TOP) { const t = (y - PIT) / (TOP - PIT); return 0.258 + 0.03 * t * (1 - t); }
  return along([[TOP, 0.258], [0.716, 0.19], [neck[1], neck[0]]], y);
}

/**
 * Tops (jersey, tee, polo, singlet). `topSeam(p)`: distance from a panel point to the
 * shoulder seam (front and back meet there, on top of the shoulders). `outline`: the
 * panel outline, so the sleeves' seams land exactly on the top and underside of the arms.
 * `hemDist(p)`: distance to the hem, so the hem band is even all the way round.
 */
export function wornTop(spec, { topSeam, outline = [], hemDist = (p) => p.y }) {
  const sleeved = !!spec.cuff;
  let half, pit;
  if (sleeved) {
    const neck = spec.half[2];   // where the neck opening meets the shoulder seam
    // A skin-tight top (the compression top) is cut narrower than the shared body below the armpit: wrapped on its own
    // side seam, so front and back meet right at the side and the seam closes down to the hem (on the shared one they
    // stopped some 8 degrees short, left open from the hem up to the waist, and the side panels thinned there: FM 2026-10-30).
    const ownSide = spec.tight
      ? outline.filter((q) => q.x > 0.2 && q.x < 0.259 && q.y > 0.075 && q.y < PIT).map((q) => [q.y, q.x]).sort((a, b) => a[0] - b[0])
      : [];
    half = ownSide.length > 1 ? (y) => (y <= PIT ? along(ownSide, y) : bodyHalf(y, neck)) : (y) => bodyHalf(y, neck);
    pit = new THREE.Vector2(0.258, PIT);
  } else {
    // Sleeveless: worn on the same body. Below the armholes the panel's own side seam;
    // above, the armholes open round the arms instead of narrowing the body.
    const pairs = spec.half.filter(([x, y]) => x > 0.12 && y < 0.745).map(([x, y]) => [y, x]).sort((p, q) => p[0] - q[0]);
    // The underarm: the spec's own (a cut from a drawing says where), else the highest point out at the side.
    const [pitY, pitX] = spec.pit ? [spec.pit[1], spec.pit[0]] : pairs.filter(([, x]) => x >= 0.23).at(-1);
    half = (y) => {
      const own = along(pairs, y);
      return y <= pitY ? own : THREE.MathUtils.lerp(own, Math.max(bodyHalf(y, [0.088, 0.738]), own + 0.006), ramp(pitY, pitY + 0.06, y));
    };
    pit = new THREE.Vector2(pitX, pitY);
  }
  // A long sleeve (hoodies) runs down past the body's side: below the armpit a point is on the sleeve past halfway
  // across the gap between the body's side and the sleeve's underside (the line from the armpit to the cuff's lower
  // corner).
  const longCut = spec.long ? spec.cuff[1] : null;
  const underX = (y) => 0.258 + ((PIT - y) * (longCut[0] - 0.258)) / (PIT - longCut[1]);
  const inSleeve = spec.long
    ? (p) => p.y < 0.7 && (p.y >= PIT ? half(p.y) - Math.abs(p.x) < 0 : Math.abs(p.x) > (half(p.y) + underX(p.y)) / 2)
    : (p) => sleeved && half(p.y) - Math.abs(p.x) < 0 && p.y > 0.44 && p.y < 0.7;
  // Depth / width of the body: fuller at the chest, a little less at the waist, thin
  // across the shoulders (wide but shallow). A loose top hangs straight down from the chest,
  // standing off the stomach instead of following it in.
  // Fleece (hoodies): a fuller, rounder body (the heavy fabric stands off it).
  const depthRatio = spec.fleece
    ? (y) => 0.72 + 0.04 * ramp(0.25, 0.45, y) - 0.2 * ramp(0.56, 0.74, y)
    : spec.loose
    ? (y) => 0.715 + 0.01 * ramp(0.25, 0.45, y) - 0.2 * ramp(0.56, 0.74, y)
    : (y) => 0.66 + 0.06 * ramp(0.25, 0.45, y) - 0.2 * ramp(0.56, 0.74, y);
  // Over the shoulders the panel narrows fast towards the neck. Wrapping each height on its
  // own would drag the shoulder seam in towards the neck, so the shoulders keep most of the
  // width below them (the seam stays on top: see topSeam).
  const wrapHalf = (y) => (y <= TOP ? half(y) : half(TOP) - 0.75 * (half(TOP) - half(y)));
  // A slight athletic V: the waist a little narrower than the chest. Loose: no waist, a little
  // fuller towards the hem (`hemFlare`: fuller still, as when it hangs over a full kit's shorts).
  // Fleece: straight down, a little fuller over the waistband, then gathered into it (its rib pulls the hem in).
  const taper = spec.fleece
    ? (y) => 1 + 0.025 * ramp(0.3, 0.1, y) - spec.fleece.hemIn * ramp(0.06, 0, y)
    : spec.tight
    // Skin-tight: the athletic V (`chest` broader over the chest and shoulders, `waist` narrower at the waist, a little
    // fuller again over the hips to the hem).
    ? (y) => spec.tight.fit * (1 + (spec.tight.chest ?? 0) * ramp(0.4, 0.56, y) - (spec.tight.waist ?? 0.08) * ramp(0.5, 0.3, y) * (1 - 0.3 * ramp(0.24, 0.06, y)))
    : spec.loose
    ? (y) => 1 + (spec.hemFlare ?? 0.03) * ramp(0.34, 0.04, y)
    : (y) => 1 - 0.045 * ramp(0.5, 0.3, y) + 0.015 * ramp(0.25, 0.05, y);
  // Crew necks: the front neckline is a round U (the flat pattern's is nearly straight-sided).
  const neckCurve = spec.half.slice(0, 3), [neckX, neckTop] = neckCurve[2], neckLow = neckCurve[0][1];
  const neckDrop = (ax) => (ax >= neckX ? 0 : neckTop - (neckTop - neckLow) * Math.sqrt(1 - (ax / neckX) ** 2) - along(neckCurve, ax));

  // The flat pattern's hem rises a little towards the sides; worn, it hangs level all round.
  // Near the hem the height is the distance from it, so the hem band is the same height all round.
  const hemCurve = outline.filter((q) => q.x >= 0 && q.y < 0.035).map((q) => [q.x, q.y]).sort((a, b) => a[0] - b[0]);
  const level = (p) => {
    if (hemCurve.length < 2) return p.y;
    const edge = along(hemCurve, Math.abs(p.x)), d = (p.y < edge ? -1 : 1) * hemDist(p);
    return THREE.MathUtils.lerp(p.y - edge * (1 - ramp(0, 0.22, p.y)), d, ramp(0.05, 0.02, Math.abs(d)));
  };

  const torso = (p, back) => {
    const w = wrap(p.x, wrapHalf(p.y), depthRatio(p.y), back, spec.boxy ? THREE.MathUtils.lerp(2, spec.boxy, ramp(0.7, 0.55, p.y)) : 2), ax = Math.abs(p.x);
    let z = w.z * Math.sqrt(ramp(0, 0.075, topSeam(p)));              // round over the shoulders to the seam
    z *= 1 - (back ? 0.36 : 0.3) * Math.exp(-(p.x ** 2) / 0.006) * ramp(back ? 0.6 : 0.58, back ? 0.7 : 0.68, p.y); // neck opening
    const s = taper(p.y) * (1 + 0.012 * ramp(0.019, 0.015, hemDist(p))); // the hem band, a little proud of the body
    // (`tight.trap`: a skin-tight top's shoulders slope down from the collar over the trapezius, as the picture's athlete,
    // instead of lying level out to the shoulder point; most halfway out, none at the collar or the arm: FM 2026-10-30.)
    const trap = spec.tight?.trap ? spec.tight.trap * ramp(0.09, 0.15, ax) * ramp(0.24, 0.17, ax) * ramp(0.64, 0.7, p.y) : 0;
    const y = level(p) - trap + (spec.crew && !back ? neckDrop(ax) * ramp(0.05, 0, along(neckCurve, ax) - p.y) : 0);
    // Shoulder pads (the American football jersey): the shoulders stand up and out over them, the chest a little deeper.
    if (spec.pads) {
      const up = ramp(0.5, 0.69, p.y), side = ramp(0.06, 0.2, ax);
      return new THREE.Vector3(w.x * s * (1 + 0.5 * spec.pads * up), y + 0.2 * spec.pads * up * side, z * s * (1 + spec.pads * up));
    }
    // A skin-tight top's own breadth across (`tight.wide`: [height, factor] pairs, side to side only): the client's
    // compression top is worn by a broad athlete, wide across the chest, the lats and the hips (FM 2026-10-30).
    return new THREE.Vector3(w.x * s * (spec.tight?.wide ? along(spec.tight.wide, p.y) : 1), y, z * s);
  };

  /**
   * The body under the fabric (metres, + out): a soft chest and a faint hint of abs in front;
   * behind, the shoulder blades and a shallow hollow down the spine. Kept minor: a fit body,
   * not a muscle suit.
   * Sleeves: none (the arm's own shape).
   */
  const relief = (p, back) => {
    if (inSleeve(p)) return 0;
    const ax = Math.abs(p.x), y = p.y;
    // A skin-tight top's sculpted front (`tight.sculpt`; in metres as made, so taken back out of `tight.relief`, which
    // scales the back's): the client's athlete, broad chest
    // muscles with a clear lower edge rising towards the armpits, the groove down the middle, and six blocks of the
    // stomach in three rows with grooves between, a softer lower belly (FM 2026-10-30, from the picture).
    if (!back && spec.tight?.sculpt) {
      const edge = 0.462 + 3.2 * Math.max(0, ax - 0.06) ** 2;   // the chest muscles' lower edge
      let h = 0.015 * ramp(edge - 0.004, edge + 0.045, y) * ramp(0.69, 0.56, y) * ramp(0.215, 0.16, ax) * (0.55 + 0.45 * ramp(0.004, 0.035, ax));
      h -= 0.003 * groove(y - edge, 0.006) * ramp(0.2, 0.14, ax);
      // (FN3 2026-10-30, the user: the full six-pack down to the lower abs, and the V-lines above the hem, as the
      // picture's: the rows a little lower and deeper, the lower abs a wide soft pad under them, and the two V-lines
      // running from the hips down and in towards the hem, a groove with the pad standing inside it.)
      for (const [row, k] of [[0.36, 1.1], [0.29, 1.15], [0.22, 1]]) h += 0.015 * k * block((ax - 0.048) / 0.05, (y - row) / 0.034, 0.05);
      h += 0.01 * pillow(ax / 0.1, (y - 0.135) / 0.06, 0.25);
      const vLine = (ax - 0.055) - 0.55 * (y - 0.03);   // across the V-line: 0 on it, + towards the hip
      h -= 0.006 * groove(vLine, 0.009) * ramp(0.01, 0.05, y) * ramp(0.2, 0.15, y);
      h += 0.002 * groove(vLine + 0.022, 0.012) * ramp(0.02, 0.06, y) * ramp(0.19, 0.14, y);
      // The obliques beside the stomach, and the groove down its middle.
      h += 0.0035 * pillow((ax - 0.15) / 0.035, (y - 0.3) / 0.11, 0.3);
      return (h - 0.0035 * groove(ax, 0.006) * ramp(0.2, 0.26, y) * ramp(edge + 0.02, edge - 0.01, y)) / (spec.tight.relief ?? 1);
    }
    if (!back) {
      const v = y - 0.565 - 0.1 * (ax - 0.09);
      let h = 0.006 * pillow((ax - 0.09) / 0.1, v / (v > 0 ? 0.075 : 0.06), 0.15);
      // A loose top falls from the chest: none of the stomach shows through. Heavy fleece hides the body more.
      if (spec.fleece) return 0.5 * h;
      if (spec.loose) return 0.7 * h;
      // A faint hint of abs: three soft bands, just enough for a little shadow between them.
      for (const row of [0.447, 0.372, 0.297]) h += 0.0026 * pillow(ax / 0.082, (y - row) / 0.036, 0.3);
      return h - 0.0011 * groove(ax, 0.006) * ramp(0.26, 0.3, y) * ramp(0.49, 0.46, y);
    }
    return (spec.fleece ? 0.5 : 1) * 0.004 * pillow((ax - 0.095) / 0.07, (y - 0.555) / 0.09, 0.2)
      - 0.0018 * groove(ax, 0.012) * ramp(0.1, 0.2, y) * ramp(0.66, 0.56, y);
  };
  if (!sleeved) return { at: torso, sleeve: () => null, relief, pit };

  // Sleeves. In the flat pattern a sleeve runs from the armhole edge (x ≈ 0.258) to the
  // cuff: s along it, t across it (+ towards the top seam).
  // m1: the middle of the cuff (a cut with its own cuff corners, as the raglan's, says where).
  const own = spec.points?.CT && spec.points?.CB ? [(spec.points.CT[0] + spec.points.CB[0]) / 2, (spec.points.CT[1] + spec.points.CB[1]) / 2] : [0.395, 0.521];
  const m0 = new THREE.Vector2(0.258, (PIT + TOP) / 2), m1 = new THREE.Vector2(own[0], own[1]);
  const d2 = m1.clone().sub(m0).normalize(), n2 = new THREE.Vector2(-d2.y, d2.x);
  const flat = (x, y) => { const qx = x - m0.x, qy = y - m0.y; return [qx * d2.x + qy * d2.y, qx * n2.x + qy * n2.y]; };
  const c = -d2.y / n2.y;                       // s + c·t = 0 along the armhole edge
  const hw0 = ((TOP - PIT) / 2) * n2.y;         // half the armhole edge, across the sleeve
  // The sleeve's top seam and underarm seam (t at each s), taken from the outline itself so
  // front and back meet exactly on the top and the underside of the arm, right up to the cuff.
  const [ca, cb] = spec.cuff.map(([x, y]) => new THREE.Vector2(x, y)), cuffDir = cb.clone().sub(ca);
  const offCuff = (q) => {
    const k = THREE.MathUtils.clamp(q.clone().sub(ca).dot(cuffDir) / cuffDir.lengthSq(), 0, 1);
    return q.distanceTo(ca.clone().addScaledVector(cuffDir, k)) > 0.012;
  };
  const edges = { top: [flat(0.258, TOP), flat(ca.x, ca.y)], under: [flat(0.258, PIT), flat(cb.x, cb.y)] };
  outline.forEach((q) => {
    if (q.x < 0.26 || !offCuff(q)) return;
    // A long sleeve's outline only (not the hem's corner below it).
    if (spec.long && !inSleeve(q)) return;
    const st = flat(q.x, q.y);
    (st[1] > 0 ? edges.top : edges.under).push(st);
  });
  for (const list of Object.values(edges)) list.sort((a, b) => a[0] - b[0]);
  const lookup = (list, s) => {
    let i = 1;
    while (i < list.length - 1 && list[i][0] < s) i++;
    const [s0, t0] = list[i - 1], [s1, t1] = list[i];
    return t0 + ((t1 - t0) * (s - s0)) / (s1 - s0 || 1);
  };
  /** Angle round the arm: -π/2 underneath, 0 at the front (back panel: the back), π/2 on top. */
  const phiAt = (s, t) => {
    const top = lookup(edges.top, s), under = lookup(edges.under, s);
    return Math.PI * (THREE.MathUtils.clamp((t - under) / (top - under), 0, 1) - 0.5);
  };

  // The arms hang down at the sides. Each sleeve leaves its armhole (the loop where the arm
  // meets the body, from the armpit up to the shoulder point) heading out over the shoulder,
  // then bends down along the arm, a little forward. Round the top it is fuller: the deltoid.
  const xP = torso(new THREE.Vector2(0.258, PIT), false).x, xS = torso(new THREE.Vector2(0.258, TOP), false).x;
  // (`armIn`: the arm set this much nearer the neck, the shoulders narrower: the compression top, FM 2026-10-30.)
  const C0 = new THREE.Vector2((xP + xS) / 2 - (spec.armIn ?? 0), (PIT + TOP) / 2), lean = (xS - xP) / (TOP - PIT);
  // (`armDrop`: a top's own hang, the compression top's arms a little out from the body.)
  const th0 = THREE.MathUtils.degToRad(25), th1 = THREE.MathUtils.degToRad(spec.armDrop ?? 80), R = spec.pads ? 0.03 : 0.085, Lb = R * (th1 - th0);
  const rB0 = 0.056;   // arm depth at the armhole
  // The arm's radius down the sleeve; a long sleeve (spec.long) narrows from the upper arm to the wrist.
  // A skin-tight sleeve (`long.shape`: [a, radius] pairs) follows the arm's muscles: the upper arm, narrower at the elbow,
  // the forearm's fullness below it, slim at the wrist (the client's compression top, FM 2026-10-30).
  // A loose short sleeve (the shooting shirt) widens from the arm towards the cuff (spec.looseSleeve.cuff).
  const r1 = spec.pads ? () => 0.05 + spec.pads * 0.2 : spec.long?.shape ? (a) => along(spec.long.shape, a) : spec.long ? (a) => THREE.MathUtils.lerp(spec.long.upper, spec.long.wrist, ramp(0.1, spec.long.length, a)) : spec.looseSleeve ? (a) => THREE.MathUtils.lerp(0.052, spec.looseSleeve.cuff, ramp(0.02, 0.2, a)) : () => 0.05;
  let rN0 = 0.075;                 // arm height at the armhole (solved below)
  // (`elbow`: the forearm turned this many degrees further out from the elbow, `at` metres down the arm: the client's
  // compression top hangs its arms close to the body, a little bent out at the elbows; FM 2026-10-30.)
  const elbow = spec.elbow ? { at: spec.elbow.at, bend: THREE.MathUtils.degToRad(spec.elbow.bend) } : null;
  const angle = (a) => THREE.MathUtils.clamp(th0 + a / R, th0, th1) - (elbow ? elbow.bend * ramp(elbow.at - 0.04, elbow.at + 0.04, a) : 0);
  // Past the bend (Lb) the axis runs straight on; with an elbow it follows its angle (summed in 2 mm steps).
  const bent = elbow ? [] : null;
  if (bent) for (let a = Lb, x = 0, y = 0; a < 1.5; a += 0.002) { bent.push([x, y]); const th = angle(a + 0.001); x += 0.002 * Math.cos(th); y -= 0.002 * Math.sin(th); }
  /** Point on the arm's axis, a metres along it from the armhole. */
  const axis = (a) => {
    if (a <= 0) return new THREE.Vector2(C0.x + Math.cos(th0) * a, C0.y - Math.sin(th0) * a);
    const th = Math.min(angle(a), th1), out = new THREE.Vector2(C0.x + R * (Math.sin(th) - Math.sin(th0)), C0.y + R * (Math.cos(th) - Math.cos(th0)));
    if (a <= Lb) return out;
    if (!bent) return out.add(new THREE.Vector2(Math.cos(th1), -Math.sin(th1)).multiplyScalar(a - Lb));
    const f = Math.min((a - Lb) / 0.002, bent.length - 1.001), k = Math.floor(f), [x0, y0] = bent[k], [x1, y1] = bent[k + 1];
    return out.add(new THREE.Vector2(x0 + (x1 - x0) * (f - k), y0 + (y1 - y0) * (f - k)));
  };
  // (`long.deltoid`: how full, 1 as the hoodies'.)
  const deltoid = (a) => (spec.long?.deltoid ?? 1) * Math.sin(Math.PI * THREE.MathUtils.clamp((a + 0.02) / 0.12, 0, 1));
  // A skin-tight sleeve's muscles (`long.muscles`, metres out): the deltoid's cap round the shoulder with a soft dip
  // where it ends on the outer arm, the biceps in front and the triceps behind the upper arm, and the forearm's
  // fullness below the elbow on its outer front, as the client's compression top (FN3 2026-10-30, the user). Round
  // the arm psi: 0 its front, pi/2 its outer side, pi its back; smooth bumps along it and round it.
  const muscle = (a, phi, sg) => {
    const k = spec.long?.muscles;
    if (!k) return 0;
    const psi = sg > 0 ? phi : Math.PI - phi;
    const near = (to, w) => { const d = Math.atan2(Math.sin(psi - to), Math.cos(psi - to)); return Math.exp(-(d * d) / (2 * w * w)); };
    const hump = (a0, a1) => (a <= a0 || a >= a1 ? 0 : Math.sin((Math.PI * (a - a0)) / (a1 - a0)) ** 2);
    return k * (0.009 * hump(0.03, 0.2) * near(Math.PI / 2, 0.9)       // the deltoid's cap
      - 0.004 * hump(0.17, 0.25) * near(Math.PI / 2, 0.5)              // the dip under it
      + 0.011 * hump(0.08, 0.28) * near(0.15, 0.6)                     // the biceps
      + 0.009 * hump(0.06, 0.27) * near(Math.PI - 0.35, 0.65)           // the triceps
      + 0.008 * hump(0.32, 0.5) * near(0.75, 0.7));                     // the forearm
  };
  /** Point on a sleeve: a along the arm, phi round it, sg +1 front / -1 back, band: hem band thickness. */
  const surface = (a, phi, sg, band = 0) => {
    const th = angle(a), A = axis(a), sin = Math.sin(phi), mus = muscle(a, phi, sg);
    const rN = THREE.MathUtils.lerp(rN0, r1(a), ramp(-0.01, 0.07, a)) + 0.007 * Math.max(0, sin) * deltoid(a) + band + mus;
    const rB = THREE.MathUtils.lerp(rB0, r1(a), ramp(0, 0.08, a)) + 0.004 * deltoid(a) + band + mus;
    const y = A.y + Math.cos(th) * rN * sin;
    // Below the armpit the arm comes a little forward: eased in (a sharp start would put a kink in every ring
    // round a sleeve end at that height, bending its bands and stripes).
    return new THREE.Vector3(A.x + Math.sin(th) * rN * sin, y, sg * rB * Math.cos(phi) + 0.08 * softPlus(PIT - y, 0.02));
  };
  /** Where along the arm the armhole is at angle phi: the arm cut by the body's side. */
  const cut = (phi, sg) => {
    let lo = -0.12, hi = 0.12;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2, X = surface(mid, phi, sg);
      if (X.x - C0.x - lean * (X.y - C0.y) > 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  };
  for (let lo = 0.04, hi = 0.084, k = 0; k < 30; k++) {   // the armhole spans armpit to shoulder point
    rN0 = (lo + hi) / 2;
    if (surface(cut(Math.PI / 2, 1), Math.PI / 2, 1).y > TOP) hi = rN0; else lo = rN0;
  }
  const STEPS = 48, roots = [1, -1].map((sg) => Array.from({ length: STEPS + 1 }, (_, k) => cut(-Math.PI / 2 + (Math.PI * k) / STEPS, sg)));
  const rootAt = (phi, sg) => {
    const f = ((phi + Math.PI / 2) / Math.PI) * STEPS, k = THREE.MathUtils.clamp(Math.floor(f), 0, STEPS - 1), list = roots[sg > 0 ? 0 : 1];
    return list[k] + (list[k + 1] - list[k]) * (f - k);
  };
  // The cuff in the flat pattern (its distance from the armhole round the arm), and where it
  // sits on the arm: square to it, with the top seam's length kept (a little stretched); the
  // underside, shorter, gathers at the armpit.
  const onCuffEdge = (q) => {
    const k = q.clone().sub(ca).dot(cuffDir) / cuffDir.lengthSq();
    return k > 0 && k < 1 && q.distanceTo(ca.clone().addScaledVector(cuffDir, k)) < 0.006;
  };
  // Taken along the straight line between the cuff's corners (the drawn outline bows a little off it), so lines
  // parallel to the cuff, such as a printed band's edges, go round the arm as flat rings.
  const cuffLine = Array.from({ length: 25 }, (_, k) => ca.clone().lerp(cb, k / 24));
  const cuffAt = cuffLine.map((q) => {
    const [s, t] = flat(q.x, q.y), phi = phiAt(s, t);
    return [phi, s + c * hw0 * ((2 * phi) / Math.PI)];
  }).sort((p, q) => p[0] - q[0]);
  const cuffL = (phi) => along(cuffAt, phi);
  let aCuff = rootAt(Math.PI / 2, 1);
  // Short sleeves sit a little stretched over the arm; a long sleeve keeps its length (to the wrist).
  for (let walked = 0, prev = surface(aCuff, Math.PI / 2, 1); walked < cuffL(Math.PI / 2) * (spec.long ? 1 : 1.15) && aCuff < (spec.long ? 1 : 0.5);) {
    aCuff += 0.001;
    const next = surface(aCuff, Math.PI / 2, 1);
    walked += next.distanceTo(prev);
    prev = next;
  }
  const tubeRaw = (p, back) => {
    const sg = back ? -1 : 1, [s, t] = flat(Math.abs(p.x), p.y), phi = phiAt(s, t);
    const l = s + c * hw0 * ((2 * phi) / Math.PI);  // distance from the armhole along the sleeve
    // The last few centimetres (the hem band) keep their flat length, so the band is even all
    // round; the rest of the sleeve takes up the difference between top and underside. Printed
    // cuff bands (print layouts) can be taller: up to 7 cm is kept.
    const a0 = rootAt(phi, sg), lc = cuffL(phi);
    const keep = spec.cuffKeep ? Math.min(spec.cuffKeep, lc * 0.6, Math.max(0.035, (aCuff - a0) * 0.7)) : Math.min(0.035, lc * 0.4);
    // A printed cuff band (cuffKeep cuts) keeps its depth as printed, square to the cuff's line, so each of its rows
    // goes round the arm as one ring; eased back to the depth along the sleeve over the top fifth of the kept part.
    let D = lc - l;
    if (spec.cuffKeep && D < keep) {
      // Signed: + towards the armhole (m0's side of the cuff's line), - past the line (where the drawn edge bows out).
      const cross = (v) => v.x * cuffDir.y - v.y * cuffDir.x, inSide = Math.sign(cross(m0.clone().sub(ca))) || 1;
      const q = new THREE.Vector2(Math.abs(p.x), p.y).sub(ca), square = (inSide * cross(q)) / cuffDir.length();
      // The drawn edge's bow past the line (the smooth outline overshoots it either side of each corner) is pressed
      // almost onto the cuff's ring, so the sleeve ends level, with no notch where front and back meet.
      const level = square < 0 ? 0.15 * square : square;
      D = level + (D - level) * ramp(0.92 * keep, keep, D) * ramp(0.05, 0.065, D);
    }
    const a = D < keep ? aCuff - D : a0 + ((aCuff - keep - a0) * l) / (lc - keep);
    const out = surface(a, phi, sg, 0.0016 * ramp(lc - 0.021, lc - 0.017, l));
    if (p.x < 0) out.x = -out.x;
    return { out, phi, l };
  };
  // A skin-tight top (`tight.pitLift`): round the lower half of the armhole the sleeve's root reached up to 4 cm under the
  // body's armpit and 3 cm inside it, and the body's side, drawn down and in onto it, was pinched into a fold there (the
  // "pinch point", the raglan piping lost in it). Instead the sleeve is drawn onto the body there, fading out over
  // `pitLift` down the arm, so the body keeps its shape (FM 2026-10-30). Per panel: [phi, offset] round the armhole.
  const pitFix = spec.tight?.pitLift ? [false, true].map((back) => Array.from({ length: 41 }, (_, k) => {
    const y = PIT + ((TOP - PIT) * k) / 40, e = new THREE.Vector2(half(y), y), r = tubeRaw(e, back);
    return [r.phi, torso(e, back).sub(r.out).multiplyScalar(ramp(0.5, -0.2, Math.sin(r.phi)))];
  }).sort((a, b) => a[0] - b[0])) : null;
  const fixAt = (list, phi) => {
    if (phi <= list[0][0]) return list[0][1].clone();
    for (let i = 1; i < list.length; i++) if (phi <= list[i][0]) { const [p0, v0] = list[i - 1], [p1, v1] = list[i]; return v0.clone().lerp(v1, (phi - p0) / (p1 - p0 || 1)); }
    return list.at(-1)[1].clone();
  };
  const tube = (p, back) => {
    const r = tubeRaw(p, back);
    if (!pitFix) return r;
    const d = fixAt(pitFix[back ? 1 : 0], r.phi).multiplyScalar(ramp(spec.tight.pitLift, 0, r.l));
    r.out.add(d.setX(p.x < 0 ? -d.x : d.x));
    return r;
  };
  // Near the armhole the body panel curves forward (back panel: backward) onto the loop,
  // fading out over 11 cm towards the chest.
  const loopShift = (y, back) => {
    const ye = THREE.MathUtils.clamp(y, PIT, TOP), e = new THREE.Vector2(half(ye), ye);
    return tube(e, back).out.sub(torso(e, back)).multiplyScalar(ramp(PIT - 0.05, PIT, y) * ramp(TOP + 0.03, TOP, y));
  };
  return {
    at(p, back) {
      if (inSleeve(p)) return tube(p, back).out;
      const out = torso(p, back), w = ramp(0.11, 0, half(p.y) - Math.abs(p.x));
      if (w > 0 && p.y > PIT - 0.05 && p.y < TOP + 0.03) {
        const d = loopShift(p.y, back);
        out.addScaledVector(d.setX(Math.sign(p.x || 1) * d.x), w);
      }
      return out;
    },
    /** Where a sleeve point sits round the arm ({ phi, l }), or null on the body. */
    sleeve: (p) => (inSleeve(p) ? tube(p, false) : null),
    relief,
    pit,
  };
}

/**
 * Shorts, worn: hips round an ellipse, each leg round a thigh, fuller towards the top, the two
 * meeting at the crotch; above it the front scoops in between the legs (the V) and rises to the
 * hips. Behind, the seat is rounded and the waistband rises a little over it. `spec.worn` gives a
 * cut its own measurements (training shorts: roomy hips flaring to short, wide legs).
 */
export function wornShorts(spec = {}) {
  const m = spec.worn ?? {};
  const sideSeam = m.sideSeam ?? [[0.02, 0.272], [0.16, 0.25], [0.32, 0.232], [0.42, 0.215]];
  const inner = m.inner ?? [[0.02, 0.05], [0.15, 0.012], [0.17, 0]];
  const CROTCH = m.crotch ?? 0.17, TOP = sideSeam.at(-1)[0];
  const [blendLo, blendHi] = m.blend ?? [0.16, 0.3];
  const [inLo, inHi] = m.legIn ?? [0.03, 0.004], [outLo, outHi] = m.legOut ?? [0.202, 0.184], [depthLo, depthHi] = m.legDepth ?? [0.064, 0.097];
  // How much of the body shows through (loose cuts: little; behind, the seat hardly at all).
  const reliefScale = m.relief ?? 1, seatScale = m.seat ?? reliefScale;
  const hips = (p, back) => { const w = wrap(p.x, along(sideSeam, p.y), m.hipDepth ?? 0.72, back); return new THREE.Vector3(w.x, p.y, w.z); };
  const leg = (p, back) => {
    const xi = along(inner, p.y), xo = along(sideSeam, p.y);
    const u = THREE.MathUtils.clamp((Math.abs(p.x) - xi) / (xo - xi), 0, 1), phi = (u - 0.5) * Math.PI;
    // Loose athletic shorts, not skin tight: each leg roomy, the two close together on the inside
    // and flaring a little from the hips to a wide opening; fuller towards the crotch (thigh and
    // seat), where the legs meet in the middle.
    const top = ramp(0.02, CROTCH, p.y);
    const xIn = THREE.MathUtils.lerp(inLo, inHi, top), xOut = THREE.MathUtils.lerp(outLo, outHi, top);
    const rx = (xOut - xIn) / 2, xc = (xOut + xIn) / 2, rz = THREE.MathUtils.lerp(depthLo, depthHi, top), zc = 0.012 * top;
    // Evenly spaced round the oval, so prints on the legs keep their proportions.
    const e = (rx - rz) / (rx + rz), psi = phi, at = psi - (e / 2) * Math.sin(2 * psi);
    return new THREE.Vector3(Math.sign(p.x || 1) * (xc + rx * Math.sin(at)), p.y, zc + (back ? -1 : 1) * rz * Math.cos(at));
  };
  /** Behind, the waistband rises a little towards the middle, over the seat. */
  const rise = (p, back) => (back ? 0.012 * ramp(TOP - 0.17, TOP, p.y) * Math.cos((Math.PI / 2) * Math.min(1, Math.abs(p.x) / 0.2)) ** 2 : 0);
  /**
   * The body under the fabric (metres, + out). In front, a soft fullness above the crotch and the
   * creases where the thighs meet it, running from the crotch up and out to the hips. Behind, the
   * seat: two rounded glutes either side of the centre seam, a crease under each. Loose cuts show
   * less of it.
   */
  const relief = (p, back) => {
    const ax = Math.abs(p.x), y = p.y;
    if (!back) {
      const v = line(ax, y, [0.01, CROTCH + 0.008], [0.17, CROTCH + 0.11]);
      return reliefScale * (0.0035 * pillow(ax / 0.07, (y - CROTCH - 0.08) / 0.07, 0.3)
        - 0.0018 * groove(v.d, 0.012) * ramp(-0.05, 0.15, v.t) * ramp(1.1, 0.7, v.t));
    }
    const fold = y - (CROTCH - 0.005 + 0.035 * ramp(0.04, 0.2, ax));
    return seatScale * (0.013 * pillow((ax - 0.095) / 0.105, (y - CROTCH - 0.085) / 0.1, 0.2)
      - 0.004 * groove(ax, 0.009) * ramp(CROTCH, CROTCH + 0.05, y) * ramp(CROTCH + 0.23, CROTCH + 0.13, y)
      - 0.0025 * groove(fold, 0.01) * ramp(0.02, 0.06, ax) * ramp(0.22, 0.17, ax));
  };
  /** Baked shadow: deep in the crotch, and the inner thighs where they face each other. */
  const shade = (p) => {
    const ax = Math.abs(p.x), y = p.y;
    const crotch = Math.exp(-(ax ** 2 + (y - CROTCH - 0.008) ** 2) / 0.0016);
    const inside = y < CROTCH + 0.03 ? Math.exp(-((ax - along(inner, y)) ** 2) / 0.0014) * ramp(0, CROTCH - 0.04, y) : 0;
    // Loose cuts (training shorts) hang away from the body: a lighter, smaller shadow there.
    const deep = Math.min(1, reliefScale + 0.2);
    return 1 - 0.34 * deep * crotch ** (2 - deep) - 0.22 * deep * inside * (1 - crotch);
  };
  return {
    at(p, back) {
      const t = ramp(blendLo, blendHi, p.y);
      const out = t >= 1 ? hips(p, back) : t <= 0 ? leg(p, back) : leg(p, back).lerp(hips(p, back), t);
      out.y += rise(p, back);
      return out;
    },
    sleeve: () => null,
    relief,
    shade,
    pit: null,
  };
}

/**
 * A women's fitted dress (the netball dress, figure.js 'female'): the bodice wrapped round the figure as a top is round
 * the athletic body (each height round an ellipse as wide as the panel there, so the print does not stretch), with the
 * bust's fullness in front (the fabric bridging across between), the straps over the shoulders to the shoulder seam on
 * top, and below the waist the skirt over the hips (fuller behind, over the seat), flaring out to the hem. Its soft
 * flutes are folds on top (garment.js dressFolds). `half(y)`: the panel's half-width at a height (for the flutes).
 */
export function wornDress(spec, { topSeam, outline = [], hemDist = (p) => p.y }) {
  const fig = figureOf(spec) ?? FIGURES.female;
  const top = Math.max(...spec.half.map(([, y]) => y));
  const D = (y) => top - y;   // how far below the shoulder line
  // (The side seam only, down to its foot at the hem's corner (points.H): the hem's own points made the skirt narrow
  // sharply over its last 3.5 cm, so the hem tucked under in a dark band: ND1 / DT6.)
  const footY = spec.points?.H?.[1] ?? 0;
  const pairs = spec.half.filter(([x, y]) => x > 0.12 && y < top - 0.004 && y >= footY).map(([x, y]) => [y, x]).sort((p, q) => p[0] - q[0]);
  const [pitX, pitY] = spec.pit;
  const own = (y) => along(pairs, y);
  // Above the underarms the body goes on to the shoulders (the armholes open round the arms), narrowing to the neck.
  // The straps lie over broad shoulders (the client's dress, ND1): the body under them stays nearly as wide as at the
  // underarm right up to the shoulder line, so the straps face forward over the upper chest rather than wrapping round
  // a narrow neck (they show their full width from the front, wide apart, as in the picture).
  // (From the underarm's own width, narrowing steadily upwards: no dip at the underarm, so the upper chest runs smoothly
  // into the bust, as on the client's dress: ND1.)
  const shoulder = (y) => along([[pitY, pitX], [top - 0.07, pitX - 0.016], [top - 0.03, pitX - 0.03], [top, pitX - 0.05]], y);
  // (Quickly above the underarm, so the armhole is round at its foot, as the arm fills it.)
  const half = (y) => (y <= pitY ? own(y) : THREE.MathUtils.lerp(own(y), Math.max(shoulder(y), own(y) + 0.006), ramp(pitY - 0.004, pitY + 0.035, y)));
  // Over the shoulders most of the width below is kept (the seam stays on top), as on a top (wornTop).
  const SH = top - 0.05;
  // (The width the cloth wraps round, eased over 4 cm up and down the top: no shelf or hollow where the underarm meets
  // the bust, the front running smoothly from the straps onto the bust: ND1 / DT6.)
  const eased = (y) => (y < 0.5 ? half(y) : (half(y - 0.02) + 2 * half(y) + half(Math.min(top, y + 0.02))) / 4);
  const wrapHalf = (y) => (y <= SH ? eased(y) : eased(SH) - 0.75 * (eased(SH) - eased(y)));
  // Depth / width round the body: thin across the shoulders, the chest, a rounder waist, the hips, and the skirt
  // hanging rounder still towards the hem.
  const depth = (d) => along([[0, 0.52], [0.1, 0.62], [0.16, 0.665], [0.22, 0.68], [0.3, 0.68], [fig.waist, 0.74], [fig.hip, 0.7], [0.88, 0.78]], d);
  const B = spec.bust ?? fig.bust;
  /** The bust's fullness in front (metres, + out): rising from the upper chest, falling under it; across the middle
   *  the fabric bridges between (a little less there), out to nothing at the sides. */
  const bust = (ax, y) => {
    const d = D(y);
    // (`under`: how far below its apex the bust ends; the dress's ends just above its bib, which then lies flat: ND1.)
    return B.depth * ramp(B.drop - 0.14, B.drop - 0.005, d) * ramp(B.drop + (B.under ?? 0.11), B.drop + 0.01, d) * ramp(B.x + 0.1, B.x, ax) * (0.9 + 0.1 * ramp(0, 0.8 * B.x, ax));
  };
  /** Behind, the seat's fullness: from below the waist, the skirt then falling from it. */
  const seat = (ax, y) => {
    const d = D(y);
    return fig.seat * ramp(fig.waist + 0.05, fig.hip - 0.02, d) * (1 - 0.25 * ramp(fig.hip + 0.02, 0.85, d)) * ramp(0.2, 0.08, ax);
  };
  // The flat pattern's hem rises a little towards the sides; worn, it hangs level all round (as wornTop).
  const hemCurve = outline.filter((q) => q.x >= 0 && q.y < 0.035).map((q) => [q.x, q.y]).sort((a, b) => a[0] - b[0]);
  const level = (p) => {
    if (hemCurve.length < 2) return p.y;
    const edge = along(hemCurve, Math.abs(p.x)), d = (p.y < edge ? -1 : 1) * hemDist(p);
    return THREE.MathUtils.lerp(p.y - edge * (1 - ramp(0, 0.22, p.y)), d, ramp(0.05, 0.02, Math.abs(d)));
  };
  const torso = (p, back) => {
    const w = wrap(p.x, wrapHalf(p.y), depth(D(p.y)), back), ax = Math.abs(p.x);
    // (Over the shoulders in 4 cm: the straps lie flat over them, not puffed: ND1.)
    let z = w.z * Math.sqrt(ramp(0, 0.04, topSeam(p)));               // round over the shoulders to the seam
    // (The neck opening's foot 0.138 below the shoulder line: garment.js points.T.)
    const nd = top - (spec.points?.T?.[1] ?? top - 0.115) - 0.115;
    // (The front of a scoop neck is not drawn in: the cloth runs smoothly from the straps over the upper chest onto the
    // bust, as on the client's dress; drawn in, it made a dent above the bust: ND1. The high back neck still is.)
    if (back) z *= 1 - 0.36 * Math.exp(-(p.x ** 2) / 0.006) * ramp(top - 0.138 - nd, top - 0.038 - nd, p.y); // neck opening
    z += back ? -seat(ax, p.y) : bust(ax, p.y);
    // (The hem band a touch proud only: the client's dress has a flat turned hem, ND1.)
    const s = 1;                                                     // the hem band flat (no rim showing under it)
    return new THREE.Vector3(w.x * s, level(p), z * s);
  };
  /** The body under the fabric behind (metres, + out): the shoulder blades and a shallow hollow down the spine. */
  const relief = (p, back) => {
    if (!back) return 0;
    const ax = Math.abs(p.x), d = D(p.y);
    // (No shoulder-blade pillows: they stood as a ridge across the upper back: DT6.)
    return -0.0015 * groove(ax, 0.012) * ramp(0.08, 0.16, d) * ramp(fig.waist + 0.06, fig.waist - 0.04, d);
  };
  /** Baked shade: a soft shadow under the bust. */
  const shade = (p, back) => {
    if (back) return 1;
    // (A bust ending sooner (B.under) has its soft shade higher up and broader, fainter: no dark line at its foot: ND1.)
    const d = D(p.y) - (B.drop + (B.under ? B.under * 0.5 : 0.08));
    return 1 - (B.under ? 0.07 : 0.13) * ramp(0.19, 0.1, Math.abs(p.x)) * Math.exp(-(d * d) / (B.under ? 0.0022 : 0.0012));
  };
  return { at: torso, sleeve: () => null, relief, shade, pit: new THREE.Vector2(pitX, pitY), half, top, figure: fig };
}
