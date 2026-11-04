import * as THREE from 'three';
import { FIGURES, torsoAt } from './figure.js';

// The netball / tennis skirt and the hockey skort (COMING SOON item 10, 2026-10-29). Its own builder, kept apart from
// garment.js so a professional model can replace it: buildSkirt() returns what buildGarment() does (geometry with uv and
// shade colours, the flat print frame and outline, at / surface), plus `form` (the display hips and thighs under it,
// look 2).
//
// Made as the client's tile picture (media/showroom/garment-netball-skirt.webp): an A-line skirt on the female figure
// (figure.js), a gathered elastic waistband at the waist, the skirt gathered onto it and flaring in straight lines to
// a level hem at the upper thigh, wider than deep and a little fuller behind, over the seat. Its print is the skirt cut
// open down both sides: the front panel and the back panel, y the height above the hem (0) up to the waistband's top
// (SKIRT_LEN), x round the skirt from its middle (garment metres; +x the wearer's left on both panels, as on a top).

const FIG = FIGURES.female;
/** The waistband's top above the hem, the waistband's depth and where the skirt is gathered onto it (garment metres). */
export const SKIRT_LEN = 0.336;
export const SKIRT_BAND = 0.033;
export const SKIRT_SEAM = SKIRT_LEN - SKIRT_BAND;
/** The waistband's top on the figure (metres down from its shoulder line, figure.js): just above the waist. */
const WAIST_DROP = 0.395;
const dropAt = (y) => WAIST_DROP + SKIRT_LEN - y;
/** The elastic waistband's ease over the body, and the fabric's room below it (metres). */
const BAND_EASE = 0.004;
/** The waistband's rolled top edge and the hem's (their radii) and the hem turned up inside. */
const BAND_ROLL = 0.0022, HEM_ROLL = 0.0016, HEM_TURN = 0.02;
/** The stitched channels of the elastic (their rows, from the top): the band puffs a little between them. */
export const SKIRT_ROWS = [SKIRT_LEN - 0.0055, SKIRT_LEN - 0.011, SKIRT_SEAM + 0.0045];
/** Shown in the new look standing a little higher on its stand, so the thighs show below the hem; and a fifth larger
 *  than life (main.js `display`), so it fills the stage as the shorts do. */
const LIFT = 0.04, DISPLAY = 1.2;

const ramp = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** The figure at height y: its half-width, half-depth, centre's forward offset and the seat's fullness behind. */
function bodyAt(y) {
  const drop = dropAt(y), [a, b, fwd] = torsoAt(FIG, drop);
  const seat = FIG.seat * ramp(FIG.waist + 0.05, FIG.hip - 0.02, drop) * ramp(FIG.crotch + 0.04, FIG.hip, drop);
  return { a, b, fwd, seat };
}
/** The figure's surface at angle th round it (0 its front's middle, pi / 2 the wearer's left side): [x, z]. */
function bodyPoint(B, th) {
  const s = Math.sin(th), c = Math.cos(th);
  return [B.a * s, B.fwd + B.b * c - (c < 0 ? B.seat * -c * (0.75 + 0.25 * Math.abs(Math.sin(2 * th))) : 0)];
}

/**
 * The skirt below the waistband, as the tile picture: its half-width (to the sides), half-depth and the centre's
 * forward offset at height y. Straight A-line sides (the picture's 1 : 1.66 from waist to hem), curving in over the
 * last 5 cm to the waistband over the high hip; the back a little fuller (the centre moves back towards the hem).
 */
function profile(y) {
  const hip = Math.max(0, (y - 0.256) / 0.046) ** 2;
  return { a: (1 + 0.022 * Math.min(1, Math.max(0, (SKIRT_SEAM - y) / 0.04))) * (0.226 - 0.265 * y - 0.0091 * hip), b: 0.168 - 0.205 * y - 0.006 * hip, c: -0.016 + 0.05 * y };
}

const DENSE = 720;
const smax = (r, m, k) => 0.5 * (r + m + Math.sqrt((r - m) ** 2 + k * k));
/** The smooth ring at height y (DENSE points by angle): the waistband round the body, the skirt's A-line below. */
function shapeAt(y) {
  const B = bodyAt(y), pts = [];
  const band = ramp(SKIRT_SEAM - 0.003, SKIRT_SEAM + 0.001, y);
  // Under the waistband the skirt never comes nearer the body than this (a soft limit; the A-line keeps well clear).
  const room = 0.002 + 0.004 * ramp(SKIRT_SEAM, SKIRT_SEAM - 0.03, y);
  const P = profile(Math.min(y, SKIRT_SEAM));
  for (let i = 0; i < DENSE; i++) {
    const th = (i / DENSE) * 2 * Math.PI;
    const [bx, bz] = bodyPoint(B, th), bdz = bz - B.fwd, bl = Math.hypot(bx, bdz) || 1;
    // The waistband: the body's own shape, a little eased.
    const wx = bx * (1 + BAND_EASE / bl), wz = B.fwd + bdz * (1 + BAND_EASE / bl);
    if (band >= 1) { pts.push([wx, wz]); continue; }
    // The skirt: its ellipse, pushed out where the body would come too near (round the body's centre).
    let sx = P.a * Math.sin(th), sz = P.c + P.b * Math.cos(th);
    const dz = sz - B.fwd, r = Math.hypot(sx, dz) || 1;
    // The body's own radius in this direction (its shape is near an ellipse round the same centre: the angle that
    // points this way on it).
    const phi = Math.atan2(sx, dz), [px, pz] = bodyPoint(B, Math.atan2(B.b * Math.sin(phi), B.a * Math.cos(phi)));
    const need = Math.hypot(px, pz - B.fwd) + room;
    const k = smax(r, need, 0.003) / r;
    if (k > 1.0005) { sx *= k; sz = B.fwd + dz * k; }
    pts.push(band > 0 ? [lerp(sx, wx, band), lerp(sz, wz, band)] : [sx, sz]);
  }
  return pts;
}

/** A ring round the skirt at height y, by its length: at(q) (0 the front's middle, 0.25 the wearer's left side, 0.5
 *  the back's middle) and its girth. Cached. */
const rings = new Map();
function ring(y) {
  const key = Math.round(y * 1e5);
  if (rings.has(key)) return rings.get(key);
  const pts = shapeAt(key / 1e5), cum = new Float64Array(DENSE + 1);
  for (let i = 1; i <= DENSE; i++) { const [x0, z0] = pts[i - 1], [x1, z1] = pts[i % DENSE]; cum[i] = cum[i - 1] + Math.hypot(x1 - x0, z1 - z0); }
  const len = cum[DENSE];
  const r = {
    girth: len,
    at(q) {
      const w = (((q % 1) + 1) % 1) * len;
      let lo = 0, hi = DENSE;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= w) lo = mid; else hi = mid; }
      const t = cum[hi] > cum[lo] ? (w - cum[lo]) / (cum[hi] - cum[lo]) : 0, [x0, z0] = pts[lo], [x1, z1] = pts[hi % DENSE];
      return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
    },
  };
  if (rings.size > 4000) rings.clear();
  rings.set(key, r);
  return r;
}
/** The skirt's girth (metres round) at height y: the print's width there is half of it on each panel. */
export const skirtGirth = (y) => ring(THREE.MathUtils.clamp(y, 0, SKIRT_LEN)).girth;

/**
 * How far the cloth stands off its smooth shape at (y, q) (metres along its normal): the skirt gathered onto the
 * elastic (soft folds about a centimetre apart, deepest under the waistband, gone some 8 cm down), the A-line's broad
 * flutes towards the hem, and the elastic puffing a little between its stitched rows. `detail`: look 2's fuller folds.
 */
const BAND_EDGES = [SKIRT_SEAM, ...[...SKIRT_ROWS].reverse(), SKIRT_LEN];
function folds(y, q, detail) {
  const g = detail ? 1 : 0.6, t = 2 * Math.PI * q;
  if (y >= SKIRT_SEAM) {
    // The waistband's channels: each puffs out between its rows of stitching.
    for (let i = 0; i < BAND_EDGES.length - 1; i++) {
      const [a, b] = [BAND_EDGES[i], BAND_EDGES[i + 1]];
      if (y >= a && y <= b) return { band: 0.0007 * g * Math.sin((Math.PI * (y - a)) / (b - a)) ** 0.7, gathers: 0, flutes: 0 };
    }
    return { band: 0, gathers: 0, flutes: 0 };
  }
  const under = SKIRT_SEAM - y;
  // Soft gathers about 1.6 cm apart (uneven, as gathered cloth falls; as deep as the picture's, DT4), and the cloth
  // bunched tight right at the seam.
  const soft = Math.sin(46 * t + 1.3 * Math.sin(5 * t + 0.4) + 0.7 * Math.sin(11 * t + 2.1)) * (0.65 + 0.35 * Math.sin(4 * t + 1.3));
  const tight = Math.sin(100 * t + 0.8 * Math.sin(9 * t + 1.7));
  const gathers = (0.0035 * Math.exp(-under / 0.035) * soft + 0.0007 * Math.exp(-under / 0.007) * tight) * ramp(0, 0.0012, under);
  // The flutes the same on both sides of the middle (DT4: the side panels showed unevenly from the front).
  const flutes = 0.0026 * ramp(0.24, 0.01, y) * Math.cos(9 * t + 0.5 * Math.sin(3 * t));
  // The drape (CF1 2026-10-29, the tile picture): broad soft folds falling the whole length from under the gathers to
  // the hem, fuller towards it, each leaning a little (some one way, some the other: long diagonal highlights), a
  // mirror image either side of the middle so the side panels stay even.
  // (FM 2026-10-30: deeper and leaning more, so their long soft highlights show as on the picture; nearly as deep in
  // the standard look as in look 2.)
  // (FM round 3: the front's folds run round from the front's middle and the back's from the back's middle, each a
  // mirror image about its own middle, blended over the sides. One phase from the front only stood still round the
  // back's middle, so there the folds changed only with height: rings like a target on the upper back.)
  const fall = (under - 0.02) / 0.28, front = ramp(-0.3, 0.3, Math.cos(t));
  const pf = midPhase(t), pb = midPhase(t - Math.PI);
  const drapeAt = (mt, s) => 0.6 * Math.cos(11 * mt + 3 * fall + 0.6 + s) + 0.4 * Math.cos(17 * mt - 2.4 * fall + 2.1 + s);
  const drape = (detail ? 1 : 0.85) * (0.003 + 0.0046 * ramp(0.25, 0.03, y)) * ramp(0.015, 0.07, under)
    * (front * drapeAt(pf, 0) + (1 - front) * drapeAt(pb, 1.3)) * DRAPE_LOW;
  // The hanging folds (FM round 2, 2026-10-30, the tile picture): the gathers run on down as soft folds. Broad rounded
  // ridges and narrow creases between them, as hanging cloth folds. `hang` (-1 crease .. 1 ridge, times its strength)
  // also lightens the ridges in the baked shade.
  // (FM round 3, the picture: many short folds right under the gathers, gone some 7 cm down; below them only a few
  // long, uneven folds, some stronger than others, clear over the top third and fading on down, not an even curtain.)
  const hangAt = (mt, s) => {
    const short = ramp(0.004, 0.014, under) * (1 - ramp(0.03, 0.075, under)) * foldProfile(30 * mt + 1.2 * fall + 0.3 + s);
    const strength = 0.6 + 0.4 * Math.cos(4.7 * mt + 1.1 + s);
    const long = ramp(0.01, 0.04, under) * (HANG_LOW + (1 - HANG_LOW) * (1 - ramp(0.08, 0.24, under))) * strength
      * foldProfile(16 * mt + 1.0 * Math.sin(3.3 * mt + 0.4 + s) - 1.2 * fall + 0.9 + s);
    return HANG_SHORT * short + HANG_LONG * long;
  };
  const hang = front * hangAt(pf, 0) + (1 - front) * hangAt(pb, 1.7);
  // (Shallower over the sides, so the side panels' edges and the outline stay straight, as on the picture.)
  const hangDepth = (detail ? 1 : 0.9) * HANG_DEPTH * hang * (1 - 0.8 * ramp(0.7, 0.92, Math.abs(Math.sin(t))));
  return { band: 0, gathers: g * gathers, flutes: g * flutes + drape + hangDepth, drape, hang };
}
/** How far round from a middle (t its angle from there): the same both ways, smooth across the middle, and moving on
 *  steadily round to the sides (0 at the middle, 1.41 at the sides). */
const midPhase = (t) => { const m = 2 * Math.abs(Math.sin(t / 2)); return Math.sqrt(m * m + 0.0025) - 0.05; };
/** The broad drape's share left (FM round 2: the hanging folds carry the picture's folds now; the hem waved too much). */
const DRAPE_LOW = 0.7;
/** The hanging folds: their depth (metres), what is left of the long ones lower down, the short and long folds'
 *  shares (FM round 3), and the baked shade's ridge light and crease dark. */
const HANG_DEPTH = 0.0032, HANG_LOW = 0.4, HANG_SHORT = 0.6, HANG_LONG = 1.25, HANG_LIGHT = 2.4, HANG_DARK = 0.35;
/** A hanging fold's profile over one turn of phase p: 1 on the broad rounded ridge, -1 in the narrow crease, mean 0. */
const foldProfile = (p) => 1 - 2 * ((1 - Math.cos(p)) / 2) ** 1.7 - 0.26;
/** The hem rising towards the sides (metres, at the sides; FM round 3: the picture's hem curves up more towards its
 *  corners), and how far up the skirt the rise reaches. */
/** How much the waistband's top edge is shaded, and the cloth under the band (FM round 3). */
const EDGE_SHADE = 0.5, UNDER_SHADE = 0.2;
const HEM_RISE = 0.0035, HEM_RISE_TOP = 0.16;
/** The baked shade's tint (red, green; blue 1). Neutral since FM 2026-10-30: the skirt's light (skirtprint.js SKIRT_LIGHT)
 *  keeps its black neutral under the stage's warm key and cool fill; the cool tint here turned the far side blue. */
const SKIRT_COOL = [1, 1];
function standOff(y, q, detail) {
  const f = folds(y, q, detail);
  return f.band + f.gathers + f.flutes;
}

/** The cloth's smooth surface point at (y, q) and its horizontal outward normal. */
function smoothAt(y, q) {
  const r = ring(y), [x, z] = r.at(q), e = 0.0008, [x0, z0] = r.at(q - e), [x1, z1] = r.at(q + e);
  // Round the ring the tangent runs (x1 - x0, z1 - z0); its outward normal is that turned a quarter (q runs anticlockwise
  // seen from above: front, wearer's left, back).
  const tx = x1 - x0, tz = z1 - z0, l = Math.hypot(tx, tz) || 1;
  return { x, z, nx: -tz / l, nz: tx / l };
}

/** The made skirt's point at (y, q): the smooth shape and its folds. */
function clothAt(y, q, detail) {
  const s = smoothAt(y, q), d = standOff(y, q, detail);
  const rise = HEM_RISE * Math.abs(Math.sin(2 * Math.PI * q)) ** 1.5 * (1 - ramp(0, HEM_RISE_TOP, y));
  return new THREE.Vector3(s.x + s.nx * d, y + rise, s.z + s.nz * d);
}

/**
 * Builds the skirt. Returns what buildGarment does (main.js treats it as a garment), with `form(material)` for the
 * display hips and thighs under it.
 */
export function buildSkirt({ detail = false } = {}) {
  // Rows from the waistband's top down to the hem: close in the waistband and the gathers under it, and at the hem.
  const Y = [];
  for (let y = SKIRT_LEN; y > 1e-6; ) {
    Y.push(y);
    y -= y > SKIRT_SEAM - 0.001 ? 0.001 : y > SKIRT_SEAM - 0.08 ? 0.002 : y < HEM_TURN + 0.006 ? 0.002 : 0.0035;
  }
  Y.push(0);
  const M = 220, N = 2 * M;   // columns across each panel; round the whole skirt
  const R = Y.length, girth = Y.map((y) => ring(y).girth);
  // The cloth all round (q = j / N from the front's middle), then its normals from its neighbours (seamless at the sides).
  const grid = Y.map((y) => Array.from({ length: N }, (_, j) => clothAt(y, j / N, detail)));
  const normals = grid.map((row, i) => row.map((p, j) => {
    const dq = row[(j + 1) % N].clone().sub(row[(j - 1 + N) % N]);
    const dy = grid[Math.max(0, i - 1)][j].clone().sub(grid[Math.min(R - 1, i + 1)][j]);
    return new THREE.Vector3().crossVectors(dq, dy).normalize();
  }));

  const maxW = Math.max(...girth) / 4 + 0.006;
  const minX = -maxW * 1.02, maxX = -minX, minY = -0.012, maxY = SKIRT_LEN + 0.01;
  const span = Math.max(maxX - minX, maxY - minY) * 1.02;
  const uvFront = (x, y) => [(0.5 * (x - minX)) / span, (y - minY) / span];
  const uvBack = (x, y) => [0.5 + (0.5 * (maxX - x)) / span, (y - minY) / span];

  const pos = [], nrm = [], uv = [], col = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const back of [false, true]) {
    // The panel's columns: the front from the wearer's right side (q -0.25) round to the left (0.25), the back on from
    // the left side (0.25) round to the right (0.75).
    const cols = Array.from({ length: M + 1 }, (_, k) => (back ? M / 2 + k : -M / 2 + k));
    const flat = (i, j) => {
      const q = j / N, x = back ? (0.5 - q) * girth[i] : q * girth[i];
      return back ? uvBack(x, Y[i]) : uvFront(x, Y[i]);
    };
    // (FM 2026-10-30: the baked shade a touch cool, so under the stage's warm key light the black stays the picture's
    // neutral black, not brown.)
    // (`light`: the folds' ridge light, added untinted so the ridges stay a neutral grey, FM round 2.)
    const put = (p, n, t, shade, light = 0) => { pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uv.push(...t); col.push(shade * SKIRT_COOL[0] + light, shade * SKIRT_COOL[1] + light, shade + light); };
    const strip = (start, rows) => {
      for (let r = 0; r < rows - 1; r++) for (let k = 0; k < M; k++) {
        const a = start + r * (M + 1) + k, b = a + 1, c = a + M + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    };
    // The outside.
    const base = pos.length / 3;
    for (let i = 0; i < R; i++) {
      const y = Y[i];
      for (const j of cols) {
        const jj = ((j % N) + N) % N, f = folds(y, j / N, detail);
        // Baked shade: the folds' valleys a touch darker, a soft shadow in the gathers right under the waistband.
        // (FM round 3: and a broader soft shade some 5 cm down under the band, where the picture's black is darkest.)
        const shadow = y < SKIRT_SEAM ? 0.16 * ramp(SKIRT_SEAM - 0.007, SKIRT_SEAM, y) + UNDER_SHADE * ramp(SKIRT_SEAM - 0.055, SKIRT_SEAM - 0.004, y) : 0;
        // (FM 2026-10-30: the drape's ridges a little lighter and its valleys darker, as the picture's long soft highlights.)
        // (FM round 2: the hanging folds' ridges lit much lighter, the picture's soft highlights on the black, and their
        // creases darker; the light kept off the cyan side panels, which would wash out.)
        const h = f.hang ?? 0, s = Math.abs(Math.sin((2 * Math.PI * j) / N)), body = 1 - ramp(0.8, 0.9, s);
        const lit = HANG_LIGHT * body * Math.max(0, h) ** 1.3;
        // (FM round 3: the waistband's top few millimetres, just under its rolled edge, in soft shade: the picture's edge is
        // a dull round, about 40 bright, not a hard light line.)
        const crest = 1 - EDGE_SHADE * ramp(SKIRT_LEN - 0.0055, SKIRT_LEN - 0.0012, y);
        const v = crest * THREE.MathUtils.clamp(1 + 70 * f.band + 85 * f.gathers + 25 * f.flutes + 40 * (f.drape ?? 0) - shadow, 0.62, 1.15) - HANG_DARK * Math.max(0, -h);
        put(grid[i][jj], normals[i][jj], flat(i, j), v, lit);
      }
    }
    strip(base, R);
    // The waistband's rolled top edge and its inside, down to the seam (printed as the waistband).
    const inBand = Y.map((y, i) => i).filter((i) => Y[i] >= SKIRT_SEAM + 0.0005);
    const fold = pos.length / 3;
    const bandRows = [];
    for (let r = 0; r <= 6; r++) bandRows.push({ i: 0, a: (Math.PI * r) / 6 });
    for (const i of inBand.slice(1)) bandRows.push({ i, a: Math.PI });
    for (const { i, a } of bandRows) {
      for (const j of cols) {
        const jj = ((j % N) + N) % N, p0 = grid[i][jj], n0 = normals[i][jj];
        const h = new THREE.Vector3(n0.x, 0, n0.z).normalize();
        const p = p0.clone().addScaledVector(h, -BAND_ROLL * (1 - Math.cos(a))).addScaledVector(up, a < Math.PI ? BAND_ROLL * Math.sin(a) : 0);
        const n = h.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a)).normalize();
        // (FM round 3: the roll's top a soft dark round, not a hard light line: the picture's 42 against our 71.)
        put(p, n, flat(i, j), a < Math.PI ? 0.97 - 0.42 * Math.sin(a) - 0.25 * (a / Math.PI) : 0.5 + 0.12 * ramp(SKIRT_LEN - 0.01, SKIRT_LEN, Y[i]));
      }
    }
    for (let k = 0; k < M; k++) { const a = base + k, b = a + 1, c = fold + k, d = c + 1; idx.push(a, c, b, b, c, d); }
    strip(fold, bandRows.length);
    // The hem: rolled under and turned up inside (printed as the hem).
    const hemRows = [];
    for (let r = 0; r <= 6; r++) hemRows.push({ i: R - 1, a: (Math.PI * r) / 6 });
    for (let i = R - 2; i >= 0 && Y[i] <= HEM_TURN; i--) hemRows.push({ i, a: Math.PI });
    const hem = pos.length / 3;
    for (const { i, a } of hemRows) {
      for (const j of cols) {
        const jj = ((j % N) + N) % N, p0 = grid[i][jj], n0 = normals[i][jj];
        const p = p0.clone().addScaledVector(n0, -HEM_ROLL * (1 - Math.cos(a))).addScaledVector(up, a < Math.PI ? -HEM_ROLL * Math.sin(a) : 0);
        const n = n0.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, -Math.sin(a)).normalize();
        put(p, n, flat(i, j), a < Math.PI ? 0.95 - 0.3 * (a / Math.PI) : 0.6);
      }
    }
    const last = base + (R - 1) * (M + 1);
    for (let k = 0; k < M; k++) { const a = last + k, b = a + 1, c = hem + k, d = c + 1; idx.push(a, c, b, b, c, d); }
    strip(hem, hemRows.length);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  orient(geometry);
  geometry.computeBoundingBox();

  // The flat outline (both panels): a quarter of the girth either side of the middle, from the waistband's top down to
  // the hem; a few millimetres wider (and past the top and hem), so the print runs on past the sides: no hairline there.
  const right = [new THREE.Vector2(girth[0] / 4 + 0.004, SKIRT_LEN + 0.005), ...Y.map((y, i) => new THREE.Vector2(girth[i] / 4 + 0.004, y)), new THREE.Vector2(girth[R - 1] / 4 + 0.004, -0.008)];
  const outline = [...right, ...right.slice().reverse().map((p) => new THREE.Vector2(-p.x, p.y))];
  const flatTo3D = (x, y, back) => {
    const h = THREE.MathUtils.clamp(y, 0, SKIRT_LEN), g = ring(h).girth;
    return clothAt(h, back ? 0.5 - x / g : x / g, detail);
  };
  // The top's ring (the rim's path; main.js hides the rim, the waistband is the skirt's own).
  const neck = Array.from({ length: 48 }, (_, j) => clothAt(SKIRT_LEN, j / 48, detail));
  return {
    kind: 'skirt',
    geometry,
    track: null, hoodie: null, varsity: null, pocket: null, body: null,
    frame: { minX, maxX, minY, maxY, span },
    outline,
    edges: outline.map(() => false),
    points: null,
    neck,
    rimRadius: 0.006,
    rimWidth: 0.011,
    lift: LIFT,
    display: DISPLAY,
    drawstring: false,
    skirt: true,
    at: flatTo3D,
    surface: flatTo3D,
    /** Look 2: the display hips and thighs under the skirt (in `material`, the mannequin's), and where the stand goes. */
    form: (material) => buildForm(material),
  };
}

/** Faces outwards: flips the winding where it disagrees with the normals given. */
function orient(g) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), ix = g.index.array;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i < ix.length; i += 3) {
    A.fromBufferAttribute(p, ix[i]); B.fromBufferAttribute(p, ix[i + 1]); C.fromBufferAttribute(p, ix[i + 2]);
    const face = B.clone().sub(A).cross(C.clone().sub(A));
    N.fromBufferAttribute(n, ix[i]).add(t.fromBufferAttribute(n, ix[i + 1])).add(t.fromBufferAttribute(n, ix[i + 2]));
    if (face.dot(N) < 0) { const s = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = s; }
  }
  g.index.needsUpdate = true;
}

/**
 * The display form (look 2): the female figure's hips from just inside the waistband's top (its flat top a few
 * millimetres under the edge, so the waistband's inside shows above it, as the tile picture's open waist) down to the
 * crotch, and the thighs on to a few centimetres below the hem, rounded off there; 3 mm inside the figure, so the
 * waistband sits on it and the skirt stands away from it. In the mannequin's material, with its occlusion: dark under
 * the skirt, lit below the hem. The stand goes up into the wearer's left thigh.
 */
function buildForm(material) {
  const group = new THREE.Group();
  group.name = 'mannequin';
  group.userData.feet = [];
  const K = 64, INSIDE = 0.28, down = new THREE.Vector3(0, -1, 0);
  const crotchY = SKIRT_LEN + WAIST_DROP - FIG.crotch;
  const hipRing = (y, inset) => {
    const B = bodyAt(y);
    return Array.from({ length: K }, (_, k) => {
      const [x, z] = bodyPoint(B, (2 * Math.PI * (k + 0.5)) / K), dz = z - B.fwd, l = Math.hypot(x, dz) || 1, s = Math.max(0, l - inset) / l;
      return new THREE.Vector3(x * s, y, B.fwd + dz * s);
    });
  };
  const hips = [];
  for (let y = SKIRT_LEN - 0.007; y >= crotchY + 0.012; y -= 0.006) hips.push(hipRing(y, 0.003));
  roundEnd(hips, down, 0.028);
  group.add(tube(hips, hips.map(() => INSIDE), material, { top: true }));
  // (CF1 2026-10-29: the thighs end inside the skirt, 3 cm above its hem: the client's picture shows no form below it.)
  const T = FIG.thigh, y0 = crotchY + 0.06, yMid = SKIRT_LEN + WAIST_DROP - 0.9, y1 = 0.03;
  for (const sg of [1, -1]) {
    const legs = [], occ = [];
    for (let y = y0; y >= y1 - 1e-6; y -= 0.008) {
      // Rounder and narrower down the leg, a little forward at the top (as the netball dress's form, mannequin.js).
      const t = THREE.MathUtils.clamp((y0 - y) / (y0 - yMid), 0, 1.3), r = T.top + (T.mid - T.top) * t, cz = 0.006 * (1 - t), cx = sg * (T.x - 0.006 * t);
      legs.push(Array.from({ length: K }, (_, k) => {
        const th = (2 * Math.PI * (k + 0.5)) / K, rr = r * (Math.sin(th) > 0 ? 0.96 : 1);
        return new THREE.Vector3(cx + rr * Math.cos(th), y, cz + rr * 0.95 * Math.sin(th));
      }));
    }
    roundEnd(legs, down, 0.012);
    // Dark under the skirt, lit from just above the hem down.
    legs.forEach((row) => occ.push(INSIDE + (1 - INSIDE) * ramp(0.03, -0.012, row[0].y)));
    group.add(tube(legs, occ, material));
    if (sg > 0) group.userData.feet.push(legs.at(-1).reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(K));
  }
  return group;
}

/** Rounds a tube's end: rings shrinking towards `dir` from the last one. */
function roundEnd(rows, dir, depth) {
  const last = rows.at(-1), c = last.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(last.length);
  for (const [s, d] of [[0.9, 0.42], [0.66, 0.8], [0.32, 0.97]]) rows.push(last.map((p) => p.clone().sub(c).multiplyScalar(s).add(c).addScaledVector(dir, depth * d)));
}

/** A tube through rows of points (closed at its last row; `top`: a flat cap on its first), facing outwards. */
function tube(rows, occ, material, { top = false } = {}) {
  const K = rows[0].length, pos = [], o = [], idx = [];
  rows.forEach((row, r) => row.forEach((p) => { pos.push(p.x, p.y, p.z); o.push(occ[Math.min(r, occ.length - 1)]); }));
  for (let r = 0; r < rows.length - 1; r++) for (let k = 0; k < K; k++) {
    const a = r * K + k, b = r * K + ((k + 1) % K), c = a + K, d = b + K;
    idx.push(a, c, b, b, c, d);
  }
  for (const [r, first] of [[0, true], [rows.length - 1, false]]) {
    if (first && !top) continue;
    const m = rows[r].reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(K), ci = pos.length / 3;
    pos.push(m.x, m.y, m.z); o.push(occ[Math.min(r, occ.length - 1)]);
    for (let k = 0; k < K; k++) { const a = r * K + k, b = r * K + ((k + 1) % K); if (first) idx.push(ci, a, b); else idx.push(ci, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('occlusion', new THREE.Float32BufferAttribute(o, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Outwards: check one point halfway along.
  const n = g.getAttribute('normal'), mid = Math.floor(rows.length / 2), i = mid * K;
  const c = rows[mid].reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(K);
  if (new THREE.Vector3(pos[i * 3] - c.x, 0, pos[i * 3 + 2] - c.z).dot(new THREE.Vector3(n.getX(i), 0, n.getZ(i))) < 0) {
    const ix = g.index.array;
    for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; }
    g.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
