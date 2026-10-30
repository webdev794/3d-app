import * as THREE from 'three';

// Knee-high team socks (garment 3, 2026-10-29). Their own builder, kept apart from garment.js so a professional model
// can replace it: buildSocks() returns the same object buildGarment() does (geometry with uv and shade colours, the
// flat print frame and outline, at / surface), plus `form` (the display leg forms under them, look 2).
//
// One sock is a knitted tube along a centreline: straight down the leg from the welt under the knee to the ankle,
// round the heel, then forward along the foot to a rounded toe. Its print is the tube cut open down both sides: the
// front panel (shin, the top of the foot and the toe's top) and the back panel (calf, heel and sole), y along the
// centreline from the toe's tip (0) up to the welt's top (SOCK_LEN), x round the tube (garment metres, as on a top:
// +x the wearer's left on both panels). The pair stands on the podium, toes forward; both socks are the same.

const TOP = 0.48;          // the welt's top above the sole
const ANKLE = 0.095;       // where the leg's straight run ends (the heel's bend starts)
const BEND = 0.06;         // the heel's bend radius (centreline)
const FOOT = 0.12;         // the foot's run from the heel's bend to the toes (SK1: a real foot's length)
const TOE = 0.055;         // the toes' rounded end
const LEG = TOP - ANKLE;
const ARC = (BEND * Math.PI) / 2;
/** The sock's length along its centreline (its print's height). */
export const SOCK_LEN = LEG + ARC + FOOT + TOE;
/** Where the heel's bend runs on the print (y), for the heel's reinforcement patch. */
export const SOCK_HEEL = { y0: TOE + FOOT - 0.02, y1: TOE + FOOT + ARC + 0.035 };
/** The welt (the doubled top band) on the print, from the top down. */
export const SOCK_WELT = 0.045;
/** Where the foot's parts sit on the print (y from the toe's tip): the toes' end, the heel's bend. */
export const SOCK_FOOT = { toe: TOE, heel: TOE + FOOT, ankle: TOE + FOOT + ARC };
/** Below this (print y from the toe's tip) the second sock's front print is mirrored (its big toe is on the other side). */
export const TOE_MIRROR = 0.04;
/** The toes turn a little outwards (radians, each sock its own way), so the foot shows from the front. */
const SPLAY = 0.14;
/** FN7 2026-10-30 (user: a real foot in a sock): the toe's end is oblique, the big toe the longest. Each ring from the
 *  ball on is sheared in plan, its medial side forward (TOE_SHEAR metres forward per metre medial of the middle), and
 *  the toe's end moves a little medially (TOE_SHIFT), so the big toe is the forward-most, roundest point and the
 *  outline slopes back to the little toe. `med` is the medial side (-1: x < 0, the first sock; +1 the second). */
const TOE_SHEAR = 0.5, TOE_SHIFT = 0.007;
function toeShear(s) { const d = s - LEG - ARC; return d <= 0 ? 0 : TOE_SHEAR * ramp(FOOT - 0.03, FOOT + TOE * 0.6, d); }
function toeShift(s) { const d = s - LEG - ARC; return d <= FOOT ? 0 : TOE_SHIFT * ramp(FOOT, FOOT + TOE, d); }
/** Each leg's centre (x) and the sole's height on the podium (studio.js: the podium's top at -0.0675). */
const LEG_X = 0.095, FLOOR = -0.0662;

const ramp = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// The leg's girth (metres round) down from the welt: gripped a little at the top, the calf's fullness, the ankle.
const GIRTH = [[0, 0.352], [0.045, 0.354], [0.08, 0.36], [0.15, 0.39], [0.23, 0.36], [0.31, 0.27], [LEG, 0.244]];
function girth(s) {
  for (let i = 1; i < GIRTH.length; i++) {
    const [s0, c0] = GIRTH[i - 1], [s1, c1] = GIRTH[i];
    if (s <= s1) { const t = (s - s0) / (s1 - s0); return lerp(c0, c1, (1 - Math.cos(Math.PI * t)) / 2); }
  }
  return GIRTH.at(-1)[1];
}

/** The centreline at s: point, and the frame round it (`f` the front, `x` the side). */
function centre(s) {
  if (s <= LEG) return { p: new THREE.Vector3(0, TOP - s, 0), f: new THREE.Vector3(0, 0, 1) };
  if (s <= LEG + ARC) {
    const a = (s - LEG) / BEND;
    return { p: new THREE.Vector3(0, ANKLE - BEND * Math.sin(a), BEND - BEND * Math.cos(a)), f: new THREE.Vector3(0, Math.sin(a), Math.cos(a)) };
  }
  const d = s - LEG - ARC;
  // The foot runs forward, its middle sloping down to the toes (the instep high by the ankle, the toes low).
  return { p: new THREE.Vector3(0, ANKLE - BEND - 0.011 * ramp(0, FOOT + TOE, d), BEND + d), f: new THREE.Vector3(0, 1, 0) };
}

/** The cross-section's half-widths at s: `a` to the sides, `bf` to the front, `bb` to the back. */
function section(s) {
  if (s <= LEG) {
    const r = girth(s) / (2 * Math.PI), calf = ramp(0.33, 0.12, s);
    // A shin flatter in front, the calf full behind; round at the ankle.
    return { a: r * (0.985 - 0.02 * calf), bf: r * (0.97 - 0.06 * calf), bb: r * (1.03 + 0.1 * calf) };
  }
  const ankle = section(LEG);
  if (s <= LEG + ARC) {
    const k = ramp(0, 1, (s - LEG) / ARC);
    // Round the heel: the heel pushes out behind and below (most at the middle of the bend).
    const heel = 0.03 * Math.sin(Math.PI * Math.min(1, (s - LEG) / ARC * 1.1)) ** 1.4;
    return { a: lerp(ankle.a, 0.043, k), bf: lerp(ankle.bf, 0.04, k) + 0.004 * Math.sin(Math.PI * k), bb: lerp(ankle.bb, 0.033, k) + heel };
  }
  const d = s - LEG - ARC, t = Math.max(0, (d - FOOT) / TOE);
  // A foot: narrow at the heel, widest over the ball, the instep high by the ankle and sloping down to the toes; the
  // toes round off in plan, their top curving down to a tip near the sole (the sole stays flat to the end).
  const ball = Math.exp(-(((d - FOOT * 0.85) / 0.07) ** 2));
  // (FN7: a blunt, rounded toe box, its top coming down round to the toe's end, not to a point.)
  const side = Math.max(0, 1 - t ** 2.6) ** 0.42, top = Math.max(0, 1 - t ** 2.4) ** 0.5, under = Math.max(0, 1 - t ** 8) ** 0.3;
  const cy = ANKLE - BEND - 0.011 * ramp(0, FOOT + TOE, d);
  return {
    a: (0.042 + 0.008 * ball - 0.004 * t) * side,
    bf: lerp(0.04, 0.02, ramp(0, FOOT * 0.9, d)) * top + 0.0015,
    bb: (cy - 0.0015) * under + 0.0015,
  };
}

/** FN7: where the big toe's groove runs on the first sock's front print ([x, y] points, the toe's tip end first): on the
 *  top of the toes, `u` metres medial of the foot's middle, from 3.3 cm back to where it runs over the toe's end. The
 *  big toe (medial of it) holds the toe's forward-most point. (The second sock's toe print is mirrored: TOE_MIRROR.) */
export function sockToeGroove() {
  const pts = [];
  for (let y = 0.033; y > 0.009; y -= 0.0015) {
    const s = SOCK_LEN - y, r = ring(s, -1, true), u = SPLIT_U + toeShift(s);
    // The front half's point where x = -u (x rises with q there).
    let lo = -0.25, hi = 0.25;
    if (r.at(lo).x > -u) break;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (r.at(m).x < -u) lo = m; else hi = m; }
    pts.push([lo * r.girth, y]);
  }
  return pts.reverse();
}

/** FN7 2026-10-30 (user, client pictures 265/290): the Rugby League socks' toe is one neat round toe box with a
 *  shallow, even split between the big toe and the others (not separate bulbs): along SPLIT_U metres medial of the
 *  foot's middle the top dips a little and the toe's end has a small notch. Its end closes on a seam line across the
 *  foot (as a knitted toe), so the knit's ribs run straight to it. */
const SPLIT_U = 0.009, SPLIT_W = 0.0075;
const DENSE = 192;
/** One ring round the sock at s, resampled evenly by length: position at q (0 the front's middle, 0.25 the wearer's
 *  left side, 0.5 the back's middle), and its girth. Cached. */
/** How far the toe's middle comes down towards the sole at s (FN7: a flat sole, the toe closing low). */
function toeLow(s) { const t = (s - LEG - ARC - FOOT) / TOE; return t <= 0 ? 0 : (centre(s).p.y - 0.006) * ramp(0.35, 1, t); }
/** The ring's middle at s (the centreline, lowered at the toe). */
function middle(s) { const p = centre(s).p; p.y -= toeLow(s); return p; }

function ring(s, med = -1, split = false) {
  const { p, f } = centre(s), side = new THREE.Vector3(1, 0, 0);
  let { a, bf, bb } = section(s);
  const sh = toeShear(s), shift = toeShift(s);
  // (FN7, user: the toes press on the floor: the sole stays flat to the toe's end, only the top and the front round
  // off. The toe's middle comes down towards the sole over its last part, so it closes low, by the floor.)
  const t = Math.max(0, (s - LEG - ARC - FOOT) / TOE);
  if (t > 0) {
    const sole = p.y - bb;
    p.y -= toeLow(s);
    bb = Math.max(0.0015, (p.y - Math.max(sole, 0.0015)) * Math.max(0, 1 - t ** 8) ** 0.3 + 0.0015 * (1 - ramp(0.9, 1, t)));
    // The Rugby League toe: its end a seam line across the foot (a narrower toe box, never a point).
    if (split) a = section(LEG + ARC + FOOT).a * (1 - 0.1 * t) * (0.4 + 0.6 * Math.max(0, 1 - t ** 2.6) ** 0.42);
  }
  const pts = [], cum = [0];
  for (let i = 0; i <= DENSE; i++) {
    const th = (i / DENSE) * 2 * Math.PI, c = Math.cos(th);
    const v = p.clone().addScaledVector(side, a * Math.sin(th)).addScaledVector(f, (c >= 0 ? bf : bb) * c);
    if (split && t > 0) {
      // The shallow split: the top dips a little along it, and the end has a small notch there.
      const k = Math.exp(-(((med * v.x - SPLIT_U) / SPLIT_W) ** 2));
      if (c > 0) v.y -= (v.y - p.y) * 0.28 * ramp(0.3, 1, t) * k;
      v.z -= 0.0045 * ramp(0.6, 1, t) * k;
    }
    // The oblique toe (FN7): the big toe a little fuller on top (a soft dome over it), the medial side forward, the
    // end towards the big toe.
    if (sh && c > 0) v.y += 0.0032 * (sh / TOE_SHEAR) * c * Math.exp(-(((med * v.x - 0.022) / 0.013) ** 2));
    v.z += sh * med * v.x;
    v.x += med * shift;
    pts.push(v);
    if (i) cum.push(cum[i - 1] + v.distanceTo(pts[i - 1]));
  }
  const len = cum[DENSE];
  return {
    girth: len,
    at(q) {
      const w = ((((q % 1) + 1) % 1)) * len;
      let i = 1;
      while (i < DENSE && cum[i] < w) i++;
      const t = cum[i] > cum[i - 1] ? (w - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
      return pts[i - 1].clone().lerp(pts[i], t);
    },
  };
}

/** The knit's small creases (metres along the surface's normal): the leg bunching softly over the ankle and the
 *  instep, the welt standing a touch proud. `k`: which sock (their folds differ a little); `detail`: look 2's fuller folds. */
function crease(s, q, k, detail) {
  const g = detail ? 1 : 0.6, ph = k * 2.3;
  const frontish = ramp(-0.35, 0.2, Math.cos(2 * Math.PI * q));
  const ankle = ramp(LEG - 0.1, LEG - 0.03, s) * ramp(LEG + 0.045, LEG + 0.01, s);
  const wave = Math.sin(((s - LEG) * 2 * Math.PI) / 0.012 + ph + 0.9 * Math.sin(q * 13 + ph));
  const calf = 0.00025 * Math.sin(q * 2 * Math.PI * 9 + s * 40 + ph) * ramp(0.05, 0.15, s) * ramp(0.32, 0.22, s);
  const welt = 0.0006 * ramp(SOCK_WELT + 0.004, SOCK_WELT - 0.002, s);
  return g * (0.0011 * frontish * ankle * wave + calf) + welt;
}

/** The made sock's surface point at (s, q) (before it is set on its leg). */
function surfaceAt(s, q, k, detail, rings) {
  const med = k ? 1 : -1;
  const r = rings(s), p = r.at(q);
  const e = 0.0012, n = r.at(q + e).sub(r.at(q - e)).cross(rings(Math.min(SOCK_LEN, s + e)).at(q).sub(rings(Math.max(0, s - e)).at(q))).normalize();
  // (The tube's outward normal: the frame's tangent points along s, round the tube q.)
  // At the toe's very tip the ring is a point: its normal is straight forward.
  if (!Number.isFinite(n.x) || n.lengthSq() < 0.5) n.set(0, 0, -1);
  // (FN7: the tube's own winding gives the outward side (its rings run round, s runs down the leg and along the foot):
  // a test against the middle fails in the toe's split notch.)
  n.negate();
  // The last millimetres of the toe close to a point: their normal eases to straight forward (no glint at the tip).
  const tip = THREE.MathUtils.clamp((s - (SOCK_LEN - 0.006)) / 0.006, 0, 1);
  // (FN7: the end's normal as the shear turns it.)
  if (tip > 0) n.lerp(new THREE.Vector3(-toeShear(s) * med, 0.15, 1).normalize(), tip).normalize();
  return { p: p.addScaledVector(n, crease(s, q, k, detail)), n };
}

/**
 * Builds the pair. Returns what buildGarment does (main.js treats it as a garment), with `form(material)` for the leg
 * forms under it.
 */
export function buildSocks({ detail = false, split = false } = {}) {
  const cache = new Map();
  // (FN7: each sock its own rings, the big toe on its inner side; `rings` the first sock's.)
  const ringsOf = (med) => (s) => { const key = Math.round(s * 1e5) * 4 + med; if (!cache.has(key)) cache.set(key, ring(s, med, split)); return cache.get(key); };
  const ringsK = [ringsOf(-1), ringsOf(1)], rings = ringsK[0];
  // Rings along the sock: closer under the welt and round the heel, where the shape turns.
  const S = [];
  for (let s = 0; s < SOCK_LEN; ) { S.push(s); s += s < 0.05 || (s > LEG - 0.05 && s < LEG + ARC + 0.02) || s > SOCK_LEN - TOE ? 0.0022 : 0.0034; }
  S.push(SOCK_LEN);
  const M = 56;   // points across each panel
  const surf = (s, q, k) => surfaceAt(s, q, k, detail, ringsK[k]);
  const P = S.map((s) => rings(s).girth);
  const maxW = Math.max(...P) / 4;
  const minX = -maxW * 1.04, maxX = -minX, minY = 0, maxY = SOCK_LEN;
  const span = Math.max(maxX - minX, maxY - minY) * 1.02;
  const uvFront = (x, y) => [(0.5 * (x - minX)) / span, (y - minY) / span];
  const uvBack = (x, y) => [0.5 + (0.5 * (maxX - x)) / span, (y - minY) / span];

  const pos = [], nrm = [], uv = [], col = [], idx = [];
  for (let k = 0; k < 2; k++) {
    const dx = k ? -LEG_X : LEG_X;
    for (const back of [false, true]) {
      const base = pos.length / 3;
      S.forEach((s, i) => {
        const y = SOCK_LEN - s;
        for (let j = 0; j <= M; j++) {
          const t = j / M, q = back ? 0.25 + 0.5 * t : -0.25 + 0.5 * t;
          // Flat x round the tube: the front from -girth/4 to +girth/4, the back from +girth/4 (its wearer's left) over.
          const x = back ? (0.5 - q) * P[i] : q * P[i];
          const { p, n } = surf(s, q, k);
          // The sole pressed flat on the podium.
          p.y = Math.max(p.y, 0.0004);
          turn(p, k); turn(n, k);
          pos.push(p.x + dx, p.y + FLOOR, p.z);
          nrm.push(n.x, n.y, n.z);
          // (FN4 2026-10-30: the second sock's toe takes the print mirrored, so a big toe's groove painted on the medial
          // side of the first (sockprint.js) falls on the medial side of both; the toe's print is otherwise symmetric.)
          uv.push(...(back ? uvBack(x, y) : uvFront(k && y < TOE_MIRROR ? -x : x, y)));
          // Baked shade: the ankle's crease valleys a touch darker, the sole and the heel's underside in shadow.
          const c = crease(s, q, k, detail) - 0.0006 * ramp(SOCK_WELT + 0.004, SOCK_WELT - 0.002, s);
          const under = ramp(0.03, 0.002, p.y) * 0.25;
          // (FN4 2026-10-30: the top of the foot faces the overhead light; a black knit there still reads black in the
          // pictures, not grey: its upward faces darker.)
          const up = Math.max(0, n.y) * ramp(LEG - 0.03, LEG + 0.02, s);
          // (FN7, DT8: still grey on the stage: darker, as black as the shin.)
          const v = THREE.MathUtils.clamp(1 + c * 70 - under, 0.6, 1.05) * (1 - 0.78 * up);
          col.push(v, v, v);
        }
      });
      for (let i = 0; i < S.length - 1; i++) for (let j = 0; j < M; j++) {
        const a = base + i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      // The welt's turned-in inside: up over its rolled top edge and down inside the sock, printed as the welt.
      const fold = pos.length / 3, rolls = [];
      const R = 0.0032;   // the folded cuff's thickness (half): a thick, doubled top
      for (let r = 0; r <= 6; r++) rolls.push({ s: 0, off: R - R * Math.cos((Math.PI * r) / 6), up: R * Math.sin((Math.PI * r) / 6) });
      for (let d = 1; d <= 8; d++) rolls.push({ s: (SOCK_WELT * d) / 8, off: 2 * R, up: 0 });
      rolls.forEach(({ s, off, up }) => {
        for (let j = 0; j <= M; j++) {
          const t = j / M, q = back ? 0.25 + 0.5 * t : -0.25 + 0.5 * t;
          const x = back ? (0.5 - q) * P[0] : q * P[0];
          const { p, n } = surf(s, q, k);
          p.addScaledVector(n, -off);
          p.y += up;
          turn(p, k); turn(n, k);
          pos.push(p.x + dx, p.y + FLOOR, p.z);
          // Inward on the inside layer (its rolled edge turns over from outwards).
          const inward = off > R ? -1 : Math.cos((Math.PI * Math.min(6, Math.round((off / R) * 3))) / 6);
          nrm.push(n.x * inward, n.y * inward + (up > 0 ? 0.3 : 0), n.z * inward);
          uv.push(...(back ? uvBack(x, SOCK_LEN - s) : uvFront(x, SOCK_LEN - s)));
          const v = off > R ? 0.62 - 6 * s : 0.95;
          col.push(v, v, v);
        }
      });
      // The roll joins the outside's top ring; its rows run on from there.
      const top = base;
      for (let j = 0; j < M; j++) { const a = top + j, b = a + 1, c = fold + j, d = c + 1; idx.push(a, c, b, b, c, d); }
      for (let r = 0; r < rolls.length - 1; r++) for (let j = 0; j < M; j++) {
        const a = fold + r * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  orient(geometry);
  geometry.computeBoundingBox();

  // The flat outline (both halves): half the girth either side of the middle, from the welt's top down to the toe.
  // (A few millimetres wider than the panel, so the print runs on past the side seams: no hairline there.)
  const right = S.map((s, i) => new THREE.Vector2(P[i] / 4 + 0.004, SOCK_LEN - s));
  // (And on past the toe's tip, so the print covers it.)
  right.push(new THREE.Vector2(0.03, -0.012));
  const outline = [new THREE.Vector2(0, SOCK_LEN), ...right, ...right.slice(0, -1).reverse().map((p) => new THREE.Vector2(-p.x, p.y))];
  const flatTo3D = (x, y, back) => {
    const s = THREE.MathUtils.clamp(SOCK_LEN - y, 0, SOCK_LEN), g = rings(s).girth;
    const q = back ? 0.5 - x / g : x / g;
    const p = turn(surf(s, q, 0).p, 0);
    return new THREE.Vector3(p.x + LEG_X, Math.max(p.y, 0.0004) + FLOOR, p.z);
  };
  // The top's ring (the rim's path; main.js hides the rim, the welt is the sock's own).
  const neck = Array.from({ length: 48 }, (_, j) => turn(rings(0).at(j / 48), 0).add(new THREE.Vector3(LEG_X, FLOOR, 0)));
  return {
    kind: 'socks',
    geometry,
    track: null, hoodie: null, varsity: null, pocket: null, body: null,
    frame: { minX, maxX, minY, maxY, span },
    outline,
    edges: outline.map(() => false),
    points: null,
    neck,
    rimRadius: 0.006,
    rimWidth: 0.011,
    lift: 0,
    drawstring: false,
    socks: true,
    at: flatTo3D,
    surface: flatTo3D,
    /** Look 2: the display leg forms under the pair (in `material`, the mannequin's), and where each foot is. */
    form: (material) => buildLegForms(ringsK, material, split ? LEG + ARC + FOOT + 0.25 * TOE : SOCK_LEN - 0.004),
  };
}

/** Turns a point (or normal) of sock `k` round its leg's upright axis: the toes a little outwards. */
function turn(v, k) {
  const a = k ? -SPLAY : SPLAY, c = Math.cos(a), sn = Math.sin(a), x = v.x, z = v.z;
  v.x = x * c + z * sn;
  v.z = -x * sn + z * c;
  return v;
}

/** Faces outwards: flips the winding where it disagrees with the normals given. */
function orient(g) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), ix = g.index.array;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i < ix.length; i += 3) {
    A.fromBufferAttribute(p, ix[i]); B.fromBufferAttribute(p, ix[i + 1]); C.fromBufferAttribute(p, ix[i + 2]);
    const face = B.clone().sub(A).cross(C.clone().sub(A));
    N.fromBufferAttribute(n, ix[i]).add(new THREE.Vector3().fromBufferAttribute(n, ix[i + 1])).add(new THREE.Vector3().fromBufferAttribute(n, ix[i + 2]));
    if (face.dot(N) < 0) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  g.index.needsUpdate = true;
}

/**
 * The leg forms (look 2): each a lower leg and foot a few millimetres inside its sock (so the sock never shows it but
 * at its top), going on about 7 cm above the welt to a softly rounded cut, as a shop's sock form. In the mannequin's
 * material, with its occlusion: dark inside the sock, lit where it shows.
 */
function buildLegForms(ringsK, material, end) {
  const group = new THREE.Group();
  group.name = 'mannequin';
  const K = 48, INSET = 0.0042;
  group.userData.feet = [];
  for (const dx of [LEG_X, -LEG_X]) {
    const rows = [], occ = [];
    // SK1: the form stops inside the sock, its flat top a little under the welt's edge (the sock stands open, as in
    // the tile picture: the turned-in cuff, then the dark inside). Near the top it keeps clear of the welt's inside.
    const START = 0.022, rings = ringsK[dx > 0 ? 0 : 1];
    // (FN7: it stops short of the Rugby toe's split, so it never shows through it.)
    for (let s = START; s <= end; s += 0.006) {
      const r = rings(s), c = middle(s), inset = s < SOCK_WELT + 0.01 ? 0.0095 : INSET;
      rows.push(Array.from({ length: K }, (_, j) => { const p = r.at(j / K), d = p.clone().sub(c), L = d.length(); return L > inset * 1.5 ? c.clone().addScaledVector(d, (L - inset) / L) : c.clone(); }));
      occ.push(s < START + 0.01 ? 0.12 : 0.28);
    }
    const k = dx > 0 ? 0 : 1;
    for (const row of rows) for (const p of row) { p.y = Math.max(p.y, 0.002); turn(p, k); p.x += dx; p.y += FLOOR; }
    const pos = [], o = [], idx = [];
    rows.forEach((row, r) => row.forEach((p) => { pos.push(p.x, p.y, p.z); o.push(occ[r]); }));
    for (let r = 0; r < rows.length - 1; r++) for (let j = 0; j < K; j++) {
      const a = r * K + j, b = r * K + ((j + 1) % K), c = a + K, d = b + K;
      idx.push(a, c, b, b, c, d);
    }
    // The flat top's cap and the toe's end.
    for (const [r, flip] of [[0, true], [rows.length - 1, false]]) {
      const ci = pos.length / 3, m = new THREE.Vector3();
      rows[r].forEach((p) => m.add(p));
      m.divideScalar(K);
      pos.push(m.x, m.y, m.z); o.push(occ[r]);
      for (let j = 0; j < K; j++) { const a = r * K + j, b = r * K + ((j + 1) % K); if (flip) idx.push(ci, a, b); else idx.push(ci, b, a); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('occlusion', new THREE.Float32BufferAttribute(o, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Outwards: check one point on the calf.
    const n = g.getAttribute('normal'), i = 30 * K, out = new THREE.Vector3(pos[i * 3] - dx, 0, pos[i * 3 + 2]);
    if (out.dot(new THREE.Vector3(n.getX(i), 0, n.getZ(i))) < 0) {
      const ix = g.index.array;
      for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; }
      g.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // The stand goes up into the wearer's left foot (hidden in it).
    if (dx > 0) { const f = turn(centre(LEG + ARC + 0.04).p, 0); group.userData.feet.push(new THREE.Vector3(f.x + dx, f.y + FLOOR, f.z)); }
  }
  return group;
}
