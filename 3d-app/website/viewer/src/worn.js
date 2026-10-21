import * as THREE from 'three';

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
function wrap(x, half, k, back) {
  const a = (4 * half) / (Math.PI * ellipseF(k)), th = (THREE.MathUtils.clamp(Math.abs(x) / half, 0, 1) * Math.PI) / 2;
  return { x: Math.sign(x) * a * Math.sin(th), z: (back ? -1 : 1) * k * a * Math.cos(th), a, th };
}
/** max(0, x) with its corner rounded over about `k`. */
const softPlus = (x, k) => (x > 8 * k ? x : x < -8 * k ? 0 : k * Math.log1p(Math.exp(x / k)));
/** A rounded swelling: 1 in the middle, easing to 0 at radius 1 (u, v in radii). */
const pillow = (u, v, inner) => { const r = Math.hypot(u, v); return r >= 1 ? 0 : 1 - ramp(inner, 1, r); };
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
    half = (y) => bodyHalf(y, neck);
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
  const inSleeve = (p) => sleeved && half(p.y) - Math.abs(p.x) < 0 && p.y > 0.44 && p.y < 0.7;
  // Depth / width of the body: fuller at the chest, a little less at the waist, thin
  // across the shoulders (wide but shallow). A loose top hangs straight down from the chest,
  // standing off the stomach instead of following it in.
  const depthRatio = spec.loose
    ? (y) => 0.715 + 0.01 * ramp(0.25, 0.45, y) - 0.2 * ramp(0.56, 0.74, y)
    : (y) => 0.66 + 0.06 * ramp(0.25, 0.45, y) - 0.2 * ramp(0.56, 0.74, y);
  // Over the shoulders the panel narrows fast towards the neck. Wrapping each height on its
  // own would drag the shoulder seam in towards the neck, so the shoulders keep most of the
  // width below them (the seam stays on top: see topSeam).
  const wrapHalf = (y) => (y <= TOP ? half(y) : half(TOP) - 0.75 * (half(TOP) - half(y)));
  // A slight athletic V: the waist a little narrower than the chest. Loose: no waist, a little
  // fuller towards the hem (`hemFlare`: fuller still, as when it hangs over a full kit's shorts).
  const taper = spec.loose
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
    const w = wrap(p.x, wrapHalf(p.y), depthRatio(p.y), back), ax = Math.abs(p.x);
    let z = w.z * Math.sqrt(ramp(0, 0.075, topSeam(p)));              // round over the shoulders to the seam
    z *= 1 - (back ? 0.36 : 0.3) * Math.exp(-(p.x ** 2) / 0.006) * ramp(back ? 0.6 : 0.58, back ? 0.7 : 0.68, p.y); // neck opening
    const s = taper(p.y) * (1 + 0.012 * ramp(0.019, 0.015, hemDist(p))); // the hem band, a little proud of the body
    const y = level(p) + (spec.crew && !back ? neckDrop(ax) * ramp(0.05, 0, along(neckCurve, ax) - p.y) : 0);
    return new THREE.Vector3(w.x * s, y, z * s);
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
    if (!back) {
      const v = y - 0.565 - 0.1 * (ax - 0.09);
      let h = 0.006 * pillow((ax - 0.09) / 0.1, v / (v > 0 ? 0.075 : 0.06), 0.15);
      // A loose top falls from the chest: none of the stomach shows through.
      if (spec.loose) return 0.7 * h;
      // A faint hint of abs: three soft bands, just enough for a little shadow between them.
      for (const row of [0.447, 0.372, 0.297]) h += 0.0026 * pillow(ax / 0.082, (y - row) / 0.036, 0.3);
      return h - 0.0011 * groove(ax, 0.006) * ramp(0.26, 0.3, y) * ramp(0.49, 0.46, y);
    }
    return 0.004 * pillow((ax - 0.095) / 0.07, (y - 0.555) / 0.09, 0.2)
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
  const C0 = new THREE.Vector2((xP + xS) / 2, (PIT + TOP) / 2), lean = (xS - xP) / (TOP - PIT);
  const th0 = THREE.MathUtils.degToRad(25), th1 = THREE.MathUtils.degToRad(80), R = 0.085, Lb = R * (th1 - th0);
  const rB0 = 0.056, r1 = 0.05;   // arm depth at the armhole; arm radius down the sleeve
  let rN0 = 0.075;                 // arm height at the armhole (solved below)
  const angle = (a) => THREE.MathUtils.clamp(th0 + a / R, th0, th1);
  /** Point on the arm's axis, a metres along it from the armhole. */
  const axis = (a) => {
    if (a <= 0) return new THREE.Vector2(C0.x + Math.cos(th0) * a, C0.y - Math.sin(th0) * a);
    const th = angle(a), out = new THREE.Vector2(C0.x + R * (Math.sin(th) - Math.sin(th0)), C0.y + R * (Math.cos(th) - Math.cos(th0)));
    return a > Lb ? out.add(new THREE.Vector2(Math.cos(th1), -Math.sin(th1)).multiplyScalar(a - Lb)) : out;
  };
  const deltoid = (a) => Math.sin(Math.PI * THREE.MathUtils.clamp((a + 0.02) / 0.12, 0, 1));
  /** Point on a sleeve: a along the arm, phi round it, sg +1 front / -1 back, band: hem band thickness. */
  const surface = (a, phi, sg, band = 0) => {
    const th = angle(a), A = axis(a), sin = Math.sin(phi);
    const rN = THREE.MathUtils.lerp(rN0, r1, ramp(-0.01, 0.07, a)) + 0.007 * Math.max(0, sin) * deltoid(a) + band;
    const rB = THREE.MathUtils.lerp(rB0, r1, ramp(0, 0.08, a)) + 0.004 * deltoid(a) + band;
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
  for (let walked = 0, prev = surface(aCuff, Math.PI / 2, 1); walked < cuffL(Math.PI / 2) * 1.15 && aCuff < 0.5;) {
    aCuff += 0.001;
    const next = surface(aCuff, Math.PI / 2, 1);
    walked += next.distanceTo(prev);
    prev = next;
  }
  const tube = (p, back) => {
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
