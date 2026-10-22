import * as THREE from 'three';
import Delaunator from 'delaunator';
import { wornTop, wornShorts } from './worn.js';
import { POCKET, isHoodie, isTrack } from './zones.js';
import { panelSampler, buildHood, buildKangaroo, buildRib, buildZip } from './hoodie.js';
import { buildTrackParts } from './trackjacket.js';
import { buildVarsityParts } from './varsity.js';

// Garment outlines (right half, metres, y up, hem at 0). The left half is
// mirrored. Each garment is a sewn front + back panel "inflated" into a
// volume, so its texture layout is the flat print pattern itself.
const TOP_BODY = [
  [0.19, 0.716], [0.258, 0.688], [0.33, 0.636], [0.418, 0.566], [0.398, 0.522],
  [0.372, 0.476], [0.31, 0.505], [0.258, 0.53], [0.25, 0.42], [0.244, 0.3],
  [0.25, 0.16], [0.258, 0.03], [0.2, 0.012], [0.1, 0.002], [0, 0],
];
const CUFF = [[0.418, 0.566], [0.372, 0.476]];

/**
 * Per garment: outline, which edges stay open (neck/waist, hem or legs,
 * cuffs, armholes), the rim tube (collar or waistband) and inflation depth.
 */
export const SPECS = {
  jersey: {
    half: [[0, 0.672], [0.05, 0.712], [0.088, 0.738], ...TOP_BODY],
    neck: { drop: 0.072, half: 0.092 },
    rim: { drop: 0.08, half: 0.11, radius: 0.009 },
    cuff: CUFF,
    depth: 0.2,
    chest: true,
  },
  tee: {
    half: [[0, 0.7], [0.05, 0.722], [0.086, 0.738], ...TOP_BODY],
    neck: { drop: 0.045, half: 0.09 },
    rim: { drop: 0.05, half: 0.11, radius: 0.0085 },
    cuff: CUFF,
    depth: 0.2,
    chest: true,
    crew: true,
  },
  polo: {
    half: [[0, 0.712], [0.05, 0.73], [0.082, 0.742], ...TOP_BODY],
    neck: { drop: 0.035, half: 0.086 },
    rim: { drop: 0.04, half: 0.11, radius: 0.017 },
    cuff: CUFF,
    depth: 0.2,
    chest: true,
    crew: true,
  },
  singlet: {
    half: [
      [0, 0.64], [0.06, 0.69], [0.095, 0.738], [0.152, 0.738], [0.165, 0.66],
      [0.19, 0.58], [0.236, 0.505], [0.246, 0.42], [0.24, 0.3], [0.246, 0.16],
      [0.254, 0.03], [0.2, 0.012], [0.1, 0.002], [0, 0],
    ],
    neck: { drop: 0.1, half: 0.095 },
    rim: { drop: 0.1, half: 0.11, radius: 0.009 },
    armholes: true,
    depth: 0.175,
    chest: true,
  },
  shorts: {
    half: [
      [0, 0.42], [0.215, 0.42], [0.232, 0.32], [0.25, 0.16], [0.272, 0.02],
      [0.15, 0], [0.05, 0.02], [0.012, 0.15], [0, 0.17],
    ],
    neck: { drop: 0.012, half: 0.4 },
    rim: { drop: 0.015, half: 0.4, radius: 0.012 },
    legs: true,
    depth: 0.16,
    chest: false,
  },
};

// The places on the shorts a print layout's leg pieces are matched to (layout-warp.js): the waist at the centre
// and at the side, the side seam's lower end (the top of the split, or the hem's outer corner), the inner hem
// corner and the crotch.
SPECS.shorts.points = { CF: [0, 0.42], OT: [0.215, 0.42], ST: [0.272, 0.02], IB: [0.05, 0.02], CR: [0, 0.17] };

/**
 * Training shorts, as factory print layouts cut them (the proportions of the Leopards pattern): a short inside
 * leg, legs that flare loosely from the hips, a split at each side of the hem (the hem curves up into it) and a
 * deep elastic waistband with a drawstring.
 */
SPECS.trainingShorts = {
  // The split as the pattern's notch: about 4 cm high, curving into the hem over about 3 cm.
  half: [
    [0, 0.35], [0.215, 0.35], [0.236, 0.27], [0.262, 0.17], [0.286, 0.095], [0.3, 0.04],
    [0.296, 0.025], [0.286, 0.012], [0.27, 0.004], [0.2, 0], [0.12, 0.001], [0.045, 0.01],
    [0.022, 0.035], [0.008, 0.06], [0, 0.072],
  ],
  neck: { drop: 0.012, half: 0.4 },
  rim: { drop: 0.015, half: 0.4, radius: 0.012, width: 0.04 },
  legs: true,
  loose: true,
  // The side seam stops at the top of the split; below it the edge is finished like the hem.
  split: { x: 0.3, top: 0.04 },
  depth: 0.16,
  chest: false,
  // SH: where the split's edge meets the hem.
  points: { CF: [0, 0.35], OT: [0.215, 0.35], ST: [0.3, 0.04], SH: [0.27, 0.004], IB: [0.045, 0.01], CR: [0, 0.072] },
  // How they are worn (worn.js): roomy hips that flare to the hem, short wide legs.
  worn: {
    sideSeam: [[0, 0.302], [0.04, 0.3], [0.095, 0.286], [0.17, 0.262], [0.27, 0.236], [0.35, 0.215]],
    inner: [[0.01, 0.045], [0.035, 0.022], [0.06, 0.008], [0.072, 0]],
    crotch: 0.072,
    blend: [0.05, 0.17],
    hipDepth: 0.62,
    legIn: [0.01, 0.002],
    legOut: [0.25, 0.228],
    // Flatter behind than a round tube (the client's shorts hang flat over the seat).
    legDepth: [0.078, 0.086],
    relief: 0.45,
    // Loose behind: they hang straight down from the waistband over the seat.
    seat: 0.1,
  },
};

// The pocket polo (pool and darts shirts): the polo with a stitched patch pocket on the wearer's left chest (zones.js
// POCKET), modelled as its own raised piece of fabric (buildPocket).
SPECS.pocketpolo = { ...SPECS.polo, pocket: POCKET };

/**
 * Hoodies (fleece): long set-in sleeves angled down to the wrist (the cuff's corners CT / CB; worn.js `long`: the arm's
 * radius from the upper arm to the wrist, and the top seam's length), a lined hood lying down behind the neck
 * (hoodie.js), a kangaroo pocket, rib cuffs and a rib waistband (the hem gathered into it: `fleece.hemIn`). The zip
 * hoodie adds the full-length front zip, its pocket split either side of it.
 */
const HOOD_SLEEVE = [[0.258, 0.688], [0.3, 0.65], [0.47, 0.476], [0.682, 0.264], [0.615, 0.197], [0.44, 0.36], [0.31, 0.485], [0.258, 0.53]];
SPECS.hoodie = {
  half: [[0, 0.69], [0.055, 0.716], [0.098, 0.738], [0.19, 0.716], ...HOOD_SLEEVE, [0.25, 0.42], [0.244, 0.3], [0.25, 0.16], [0.258, 0.03], [0.2, 0.012], [0.1, 0.002], [0, 0]],
  neck: { drop: 0.055, half: 0.1 },
  rim: { drop: 0.06, half: 0.11, radius: 0.009 },
  cuff: [[0.682, 0.264], [0.615, 0.197]],
  points: { CT: [0.682, 0.264], CB: [0.615, 0.197] },
  depth: 0.2,
  chest: true,
  crew: true,
  long: { upper: 0.054, wrist: 0.039, length: 0.6 },
  fleece: { hemIn: 0.05 },
  hood: true,
};
SPECS.ziphoodie = { ...SPECS.hoodie, zip: true };

/**
 * The track suit jacket (trackjacket.js): the hoodie's long set-in sleeves and fuller body gathered a little into a rib
 * hem band, smooth polyester, a full front zip, zipped side pockets and a stand-up collar (`track.style` 'collar') or
 * the zip hoodie's hood ('hood': design.trackStyle).
 */
SPECS.trackjacket = { ...SPECS.hoodie, hood: false, zip: true, fleece: { hemIn: 0.03 }, track: { style: 'collar' } };
SPECS.trackjacketHood = { ...SPECS.trackjacket, track: { style: 'hood' } };

/**
 * The varsity (letterman) jacket: the hoodie's long set-in sleeves (leather) on a wool body bloused into a rib
 * waistband, a deeper round neck for its rib collar, rib cuffs, a snap front and welt pockets (varsity.js).
 */
SPECS.varsity = {
  ...SPECS.hoodie,
  half: [[0, 0.665], [0.05, 0.7], [0.095, 0.736], [0.19, 0.716], ...HOOD_SLEEVE, [0.25, 0.42], [0.244, 0.3], [0.25, 0.16], [0.258, 0.03], [0.2, 0.012], [0.1, 0.002], [0, 0]],
  neck: { drop: 0.08, half: 0.1 },
  rim: { drop: 0.085, half: 0.11, radius: 0.009 },
  hood: false,
  varsity: true,
};

// A raglan top has the tee's shape; only its sewing differs (raglan seams from the neck to the underarms instead of
// set-in sleeves). Print layouts use it (layout-warp.js), as a loose training tee: it hangs from the chest in soft
// folds instead of fitting the waist.
SPECS.raglan = { ...SPECS.tee, loose: true, cuffKeep: 0.07 };

/** Smooth closed outline of a garment spec sampled every `step` metres. */
function outline(spec, step) {
  const half = spec.half;
  const pts = [
    ...half.map(([x, y]) => new THREE.Vector2(x, y)),
    ...half
      .slice(1, -1)
      .reverse()
      .map(([x, y]) => new THREE.Vector2(-x, y)),
  ];
  const curve = new THREE.SplineCurve([...pts, pts[0]]);
  const length = curve.getLength();
  return curve.getSpacedPoints(Math.round(length / step)).slice(0, -1);
}

function inside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function distanceToOutline(p, poly, seam) {
  let best = Infinity;
  const ab = new THREE.Vector2(), ap = new THREE.Vector2();
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (seam && !(seam[i] && seam[(i + 1) % poly.length])) continue;
    ab.subVectors(b, a);
    ap.subVectors(p, a);
    const t = THREE.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
    best = Math.min(best, ap.addScaledVector(ab, -t).length());
  }
  return best;
}

/**
 * Builds the garment mesh. Returns the geometry plus the 2D frame the texture
 * compositor needs to paint in garment coordinates.
 */
export function buildGarment(kind = 'jersey', { step = 0.0085, spec: cut = null } = {}) {
  // `cut`: a spec of this kind cut otherwise (a singlet cut like a garment drawing, layout-warp.js drawnCut).
  const spec = cut ?? SPECS[kind] ?? SPECS.jersey;
  const poly = outline(spec, step);
  const minX = Math.min(...poly.map((p) => p.x)), maxX = -minX;
  const minY = Math.min(...poly.map((p) => p.y));
  const maxY = Math.max(...poly.map((p) => p.y));
  const span = Math.max(maxX - minX, maxY - minY) * 1.02;

  // Hem (or leg openings), cuffs, armholes and neck (or waist) stay open;
  // only true seams join front to back.
  const cuff = spec.cuff?.map(([x, y]) => new THREE.Vector2(x, y));
  const open = (p) => {
    const ax = Math.abs(p.x);
    if (p.y < minY + 0.03 && (!spec.legs || ax > 0.035)) return true;
    if (p.y > maxY - spec.neck.drop && ax < spec.neck.half) return true;
    // The armhole edge: between the strap's outer corner and the underarm (the singlet's own, unless cut otherwise).
    const hole = spec.armhole ?? { x0: 0.15, y0: 0.5, x1: 0.24 };
    if (spec.armholes && ax > hole.x0 && p.y > hole.y0 && ax < hole.x1) return true;
    if (spec.split && ax > spec.split.x - 0.075 && p.y < spec.split.top - 0.001) return true;
    if (cuff) {
      const a = cuff[0], b = cuff[1], q = new THREE.Vector2(ax, p.y);
      const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(q.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      if (q.distanceTo(a.clone().addScaledVector(ab, t)) < 0.012) return true;
    }
    return false;
  };
  const seam = poly.map((p) => !open(p));

  // Boundary first (shared seam), then an even interior grid, twice as dense
  // where small creases form (the sides, round the armpits and the armholes).
  const fine = step * 0.5;
  // Shorts: the crotch and the waist (the drawn outline bulges a little above the waist at its corners).
  const crotchY = spec.points?.CR?.[1] ?? 0.17, waist = spec.points?.CF?.[1] ?? maxY;
  const fineZone = (p) => {
    const ax = Math.abs(p.x);
    if (spec.legs) return (ax > 0.14 && p.y < waist - 0.05) || p.y > waist - 0.11 || Math.hypot(ax, p.y - crotchY) < 0.13;
    return spec.chest && ((ax > 0.15 && ax < 0.3 && p.y > 0.02 && p.y < 0.58) || Math.hypot(ax - 0.255, p.y - 0.53) < 0.11);
  };
  const points = [...poly];
  const nb = points.length;
  for (const [grid, inZone] of [[step, false], [fine, true]]) {
    for (let y = minY + grid / 2; y < maxY; y += grid * 0.866) {
      const shift = (Math.round((y - minY) / (grid * 0.866)) % 2) * grid * 0.5;
      for (let x = minX + shift; x < maxX; x += grid) {
        const p = new THREE.Vector2(x, y);
        if (fineZone(p) === inZone && inside(p, poly) && distanceToOutline(p, poly) > step * 0.55) points.push(p);
      }
    }
  }
  const tri = Delaunator.from(points, (p) => p.x, (p) => p.y).triangles;
  const faces = [];
  for (let i = 0; i < tri.length; i += 3) {
    const [a, b, c] = [points[tri[i]], points[tri[i + 1]], points[tri[i + 2]]];
    const centroid = new THREE.Vector2((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3);
    if (!inside(centroid, poly)) continue;
    const ccw = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
    faces.push(ccw ? [tri[i], tri[i + 1], tri[i + 2]] : [tri[i], tri[i + 2], tri[i + 1]]);
  }

  // Worn shape: the panels wrapped round an athletic body (worn.js), with only the
  // creases a body makes: drape folds fanning out from the armpits (down the sides
  // and onto the sleeves' undersides), soft folds just above the hem and faint
  // ripples along the sides. Front and back crease differently.
  const n = points.length;
  const ramp = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // Front and back meet on top of the shoulders along the shoulder seam.
  const topMask = poly.map((q, i) => seam[i] && q.y > 0.64 && Math.abs(q.x) < (spec.cuff ? 0.262 : 0.2));
  // The hem, so its band and folds sit an even distance from it all the way round.
  const hemMask = poly.map((q, i) => !seam[i] && q.y < minY + 0.03);
  const hemDistance = (p) => distanceToOutline(p, poly, hemMask);
  const worn = spec.chest
    ? wornTop(spec, { topSeam: (p) => distanceToOutline(p, poly, topMask), outline: poly, hemDist: hemDistance })
    : wornShorts(spec);
  const hemDist = points.map(hemDistance);
  const sleeveAt = points.map((p) => worn.sleeve(p));
  /** Drape folds fanning out from the armpit along rays, about 3 cm apart. */
  const pitFolds = (p, back, i) => {
    if (!worn.pit) return 0;
    const vx = Math.abs(p.x) - worn.pit.x, vy = p.y - worn.pit.y, rho = Math.hypot(vx, vy);
    if (rho > 0.15) return 0;
    const sl = sleeveAt[i], ph = back ? 1.7 : 0;
    // Below the armpit on the body; on the sleeve, its underside.
    const where = sl ? ramp(-0.15, -0.75, Math.sin(sl.phi)) : ramp(0.01, -0.02, vy);
    const reach = ramp(0.006, 0.03, rho) * ramp(0.15, 0.05, rho);
    return 0.0032 * where * reach * Math.sin(Math.atan2(vy, vx) * 12 + ph + 0.7 * Math.sin(rho * 55 + ph));
  };
  /** Soft folds just above the hem band: gentle waves where it hangs, and a few slanted folds
   *  a few centimetres apart that fade out upwards, more towards the sides. */
  const hemFolds = (p, back, i) => {
    if (spec.legs || sleeveAt[i]) return 0;
    // Fleece: no hem band; the body gathers into its rib waistband in soft upright folds just above it.
    if (spec.fleece) {
      const ph = back ? 1.9 : 0.3;
      return 0.0034 * Math.sin(p.x * 70 + ph + 1.4 * Math.sin(p.x * 19 + ph)) * ramp(0.1, 0.02, p.y) * ramp(0, 0.012, hemDist[i]);
    }
    const ax = Math.abs(p.x), ph = back ? 2.1 : 0;
    const band = ramp(0.02, 0.036, hemDist[i]);   // the hem band itself stays smooth and even
    // Not on a loose tee: the client's photo shows no upright waves above its hem.
    const drape = spec.loose ? 0 : Math.sin(p.x * 66 + ph + 1.3 * Math.sin(p.x * 17 + ph)) * ramp(0.2, 0, p.y);
    const slant = Math.sin((p.y + 0.45 * p.x) * 150 + ph + 1.8 * Math.sin(p.x * 11 + ph)) * ramp(0.11, 0.04, p.y) * (0.45 + 0.55 * ramp(0.04, 0.2, ax));
    return band * (0.0024 * drape + 0.0016 * slant);
  };
  /** Faint, wide stretch ripples along the sides (or the shorts' legs). */
  const sideRipple = (p, back) => {
    if (spec.fleece) return 0;
    const ax = Math.abs(p.x), ph = back ? 2.6 : 0;
    const sides = spec.chest
      ? ramp(0.17, 0.22, ax) * ramp(0.5, 0.42, p.y) * ramp(0.03, 0.08, p.y)
      : spec.legs ? ramp(0.14, 0.2, ax) * ramp(0.37, 0.3, p.y) : 0;
    return 0.0005 * sides * Math.sin((p.y * 0.86 + ax * 0.5) * 160 + ph + 1.6 * Math.sin(p.y * 23 + ax * 9));
  };
  /** The back of a worn top: soft folds where the fabric gathers over the small of the back,
   *  rising from the middle towards the sides. */
  const backFolds = (p, back, i) => {
    if (!back || !spec.chest || sleeveAt[i]) return 0;
    const ax = Math.abs(p.x);
    // Fleece: a few broad soft folds over the small of the back.
    if (spec.fleece) return 0.0026 * Math.sin((p.y - 0.25 * ax) * 55 + 1.1 * Math.sin(ax * 9)) * ramp(0.3, 0.12, p.y) * ramp(0.04, 0.08, p.y);
    const rise = Math.sin((p.y - 0.42 * ax) * 105 + 1.2 * Math.sin(ax * 14)) * ramp(0.32, 0.12, p.y) * ramp(0.03, 0.07, p.y);
    return 0.0028 * rise * (0.5 + 0.5 * ramp(0.02, 0.12, ax));
  };
  /** Shorts: drag folds where they pull between the legs, fanning from the crotch sideways and
   *  down across the thighs in front, under and beside the seat behind; and the fabric gathered
   *  by the elastic just under the waistband. */
  const band = spec.rim.width ?? 0.026;
  const shortsFolds = (p, back) => {
    if (!spec.legs) return 0;
    const ax = Math.abs(p.x), vy = p.y - crotchY, rho = Math.hypot(ax, vy), ang = Math.atan2(vy, ax), ph = back ? 1.3 : 0;
    const fan = back ? ramp(-0.9, -0.3, ang) * ramp(0.95, 0.4, ang) : ramp(-1.15, -0.8, ang) * ramp(0.3, 0.02, ang);
    // Loose shorts pull in longer drag folds, fanning from the crotch out to the hips.
    const reach = spec.loose ? 0.24 : 0.17;
    const drag = rho > reach ? 0 : fan * ramp(0.012, 0.04, rho) * ramp(reach, reach * 0.42, rho) * Math.sin(ang * 10 + ph + 0.6 * Math.sin(rho * 40));
    // The fabric gathered by the elastic just under the waistband.
    const under = waist - band;
    const gather = Math.sin(p.x * 300 + ph + 1.5 * Math.sin(p.x * 31)) * (0.6 + 0.4 * Math.sin(p.x * 23 + 0.7)) * ramp(under - 0.064, under - 0.008, p.y) * ramp(under + 0.002, under - 0.006, p.y);
    // Under a deep gathered waistband (training shorts) the cloth falls from the elastic in many soft folds, about
    // 2.5 cm apart, deepest just under the band and fading out over about 6 cm in front, 4.5 cm behind.
    const fall = spec.loose
      ? Math.sin(p.x * 250 + ph + 1.6 * Math.sin(p.x * 37 + ph)) * (0.65 + 0.35 * Math.sin(p.x * 19 + 0.4)) * ramp(under - (back ? 0.045 : 0.065), under - 0.006, p.y) * ramp(under + 0.002, under - 0.003, p.y)
      : 0;
    // Loose shorts: the drag folds fade out above the hem band too, and there are none behind (the client's shorts
    // are smooth there).
    return (spec.loose ? (back ? 0 : 0.0038) * ramp(0.035, 0.07, p.y) : 0.003) * drag + (spec.loose ? 0 : 0.0013) * gather + 0.0055 * fall;
  };
  /**
   * Loose garments hang in soft folds: on a training tee from under the chest down to the hem, fuller towards the
   * sides; on loose shorts down the legs from the hips to the hem. Slow waves that wander a little, so they read
   * as cloth rather than ribs.
   */
  const drapeFolds = (p, back, i) => {
    if (!spec.loose || sleeveAt[i]) return 0;
    const ax = Math.abs(p.x), ph = back ? 2.2 : 0.5;
    if (spec.legs) {
      // Only the folds the client's shorts show (front and back differ). The hem band stays smooth and straight (it is
      // stiffer): the folds fade out above it.
      const hang = ramp(waist - 0.055, 0.04, p.y) * ramp(0.03, 0.065, hemDist[i]);
      const lean = p.x * (1 + 0.6 * ramp(0.2, 0.02, p.y));
      const broad = Math.sin(lean * 72 + ph + 1.3 * Math.sin(p.x * 17 + p.y * 11 + ph));
      if (!back) {
        // In front, as on the client's shorts: only a few short folds down each leg (every other broad fold, over
        // the thigh only), and a few short creases across the thighs, rising a little to the side, that cut them.
        const few = Math.max(0, Math.sin(p.x * 36 + 0.9)) ** 2;
        const short = ramp(0.045, 0.09, p.y) * ramp(0.22, 0.15, p.y);
        const across = Math.sin((p.y - 0.2 * ax) * 95 + 1.2 * Math.sin(ax * 21)) * (0.6 + 0.4 * Math.sin(ax * 31 + p.y * 20))
          * ramp(0.03, 0.07, ax) * ramp(0.2, 0.14, ax) * ramp(0.075, 0.11, p.y) * ramp(0.24, 0.18, p.y);
        return hang * 0.0058 * few * short * broad + 0.0065 * across;
      }
      // Behind, as on the client's shorts: a few soft upright folds near the middle (the seat's fullness either side
      // of the centre seam) and short level creases at the sides, with their shadows; the rest smooth.
      const keep = ramp(0.03, 0.065, hemDist[i]);
      // The upright fold: thin, widest under the waistband and narrowing to nothing towards the crotch (no round end).
      const upper = ramp(0.09, waist - 0.06, p.y);
      const foldW = 0.005 + 0.013 * upper, foldX = 0.028 + 0.012 * upper;
      const middle = Math.exp(-(((ax - foldX) / foldW) ** 2)) * upper ** 0.8 * ramp(waist - 0.045, waist - 0.08, p.y);
      const sides = Math.sin(p.y * 80 + 0.7 * Math.sin(ax * 23)) * (0.65 + 0.35 * Math.sin(ax * 40 + p.y * 9))
        * ramp(0.15, 0.19, ax) * ramp(0.12, 0.16, p.y) * ramp(waist - 0.055, waist - 0.09, p.y);
      return keep * (0.0052 * middle + 0.006 * sides);
    }
    // Only the folds the client's photo shows. In front: under the chest a fold each side runs down and out to the
    // side, and a few soft horizontal folds sag across the stomach from the sides towards the middle. Behind: folds
    // run in and down from the sides (under the lettering, from the raglan seams) towards the middle. Each is a ridge
    // with its shadowed valley just below. As in the photo a fold is widest and deepest where it starts (its first
    // point: a seam, or under the chest) and narrows and shallows along its length to a point: no round ends.
    // Lines: right half [|x|, y].
    const lines = back
      ? [[[0.25, 0.56], [0.235, 0.55], [0.17, 0.515], [0.09, 0.47], [0.04, 0.44]], [[0.25, 0.52], [0.235, 0.51], [0.16, 0.46], [0.08, 0.41], [0.035, 0.385]],
        [[0.25, 0.31], [0.235, 0.3], [0.15, 0.24], [0.06, 0.195], [0.03, 0.18]], [[0.25, 0.21], [0.235, 0.2], [0.14, 0.145], [0.05, 0.115], [0.025, 0.105]],
        [[0.25, 0.104], [0.22, 0.1], [0.1, 0.075], [0, 0.07]]]
      : [[[0.095, 0.42], [0.15, 0.33], [0.2, 0.25]], [[0.07, 0.36], [0.1, 0.24], [0.16, 0.19], [0.23, 0.165]],
        [[0.25, 0.152], [0.23, 0.15], [0.17, 0.14], [0.09, 0.13], [0.04, 0.155]], [[0.25, 0.092], [0.23, 0.09], [0.14, 0.08], [0.07, 0.055], [0, 0.06]]];
    let h = 0;
    for (const pts of lines) {
      let total = 0, run = 0, best = Infinity, sd = 0, along = 0;
      for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      for (let k = 1; k < pts.length; k++) {
        const [x0, y0] = pts[k - 1], dx = pts[k][0] - x0, dy = pts[k][1] - y0, len = Math.hypot(dx, dy);
        // Before its start the line runs on (the fold fades in there), so it has no round end at either end.
        const t = THREE.MathUtils.clamp(((ax - x0) * dx + (p.y - y0) * dy) / (len * len), k === 1 ? -Infinity : 0, 1);
        const qx = x0 + dx * t, qy = y0 + dy * t, d = Math.hypot(ax - qx, p.y - qy);
        // Signed: + on the upper side of the line.
        if (d < best) { const s = dx < 0 ? -1 : 1; best = d; sd = s * ((ax - qx) * -dy + (p.y - qy) * dx) / len; along = run + t * len; }
        run += len;
      }
      // From start to end: half-width 2 cm narrowing to 0.6 cm, the depth fading to nothing.
      // Long thin ridges, as in the photo: 1.3 to 1.5 cm wide where they start, thinning to a point.
      const f = THREE.MathUtils.clamp(along / total, 0, 1), w = (back ? 0.013 : 0.015) * (1 - 0.62 * f), g = (u) => Math.exp(-((u / w) ** 2));
      h += ramp(-0.015, 0.02, along) * (1 - f) ** 0.8 * (g(sd) - 0.85 * g(sd + 1.2 * w));
    }
    // The front's folds are deeper (the photo's stomach folds stand out more than the back's).
    // The upper back's V folds (under the lettering) are the deepest, as clear as in the photo.
    return (back ? 0.0034 * (1 + 0.3 * ramp(0.33, 0.4, p.y)) : 0.0042) * h * ramp(0.012, 0.03, hemDist[i]);
  };
  /**
   * Long sleeves (hoodies): the fleece bunches in soft rings above the rib cuff, folds across the inside of the elbow,
   * and lies in long soft twists down the arm.
   */
  const cuffA = spec.long ? new THREE.Vector2(...spec.cuff[0]) : null, cuffB = spec.long ? new THREE.Vector2(...spec.cuff[1]) : null;
  const sleeveFolds = (p, back, i) => {
    const sl = sleeveAt[i];
    if (!spec.long || !sl) return 0;
    const q = new THREE.Vector2(Math.abs(p.x), p.y), ab = cuffB.clone().sub(cuffA);
    const t = THREE.MathUtils.clamp(q.clone().sub(cuffA).dot(ab) / ab.lengthSq(), 0, 1), d = q.distanceTo(cuffA.clone().addScaledVector(ab, t));
    const ph = back ? 1.7 : 0;
    const bunch = Math.sin(d * 190 + ph + 1.6 * Math.sin(sl.phi * 2.3 + ph)) * ramp(0.16, 0.04, d) * ramp(0.006, 0.02, d);
    const elbow = Math.sin((d - 0.26) * 120 + 2.2 * sl.phi + ph) * Math.exp(-(((d - 0.27) / 0.05) ** 2)) * ramp(0.4, -0.6, Math.sin(sl.phi));
    const twist = Math.sin(sl.l * 22 + sl.phi * 1.6 + ph) * ramp(0.06, 0.15, sl.l) * ramp(0.06, 0.18, d);
    return 0.0036 * bunch + 0.0032 * elbow + 0.0014 * twist;
  };
  const seamDist = points.map((p, i) => (i < nb && seam[i] ? 0 : distanceToOutline(p, poly, seam)));
  /** Crease height in metres (+ out, - in), pushed out along the body's surface. */
  const crease = (p, back, i) => ramp(0, 0.015, seamDist[i]) * (pitFolds(p, back, i) + hemFolds(p, back, i) + sideRipple(p, back) + backFolds(p, back, i) + shortsFolds(p, back) + drapeFolds(p, back, i) + sleeveFolds(p, back, i));
  const neckEdge = poly.filter((q, i) => !seam[i] && q.y > maxY - spec.neck.drop && Math.abs(q.x) < spec.neck.half);
  const nearNeck = (p) => neckEdge.reduce((d, q) => Math.min(d, Math.hypot(p.x - q.x, p.y - q.y)), Infinity);
  /** The body under the fabric (worn.js), kept off the seams and the neckline so those stay even. */
  const muscle = (p, back, i) => worn.relief(p, back) * ramp(0, 0.015, seamDist[i]) * ramp(0, 0.02, nearNeck(p));
  /** How much lower the body's relief is than all round it (+ in a hollow). */
  const hollow = (p, back) => {
    let around = 0;
    for (let k = 0; k < 8; k++) around += worn.relief(new THREE.Vector2(p.x + 0.018 * Math.cos((k * Math.PI) / 4), p.y + 0.018 * Math.sin((k * Math.PI) / 4)), back);
    return around / 8 - worn.relief(p, back);
  };
  // Soft shadow, baked so it costs nothing to draw: crease valleys, hollows in the body
  // (under the chest, beside the shoulder blades),
  // round the armpit (the body just below it and the sleeve's underside facing it) and just
  // under the collar (or the shorts' waistband).
  const shade = (p, i, back) => {
    // A loose tee's back: soft valleys (a gentle shadow, not a dark cut).
    const valley = 1 - (spec.loose ? (spec.legs ? 0.3 : back ? 0.18 : 0.22) : 0.16) * Math.min(1, Math.max(0, -crease(p, back, i) / (spec.loose ? (back && !spec.legs ? 0.007 : 0.004) : 0.003)));
    // A loose top's fold ridges catch the light, as in the client's photo (the only shading above 1).
    const ridge = spec.loose && !spec.legs ? 1 + (back ? 0.26 : 0.14) * Math.min(1, Math.max(0, crease(p, back, i) / 0.004)) : 1;
    const muscles = 1 - 0.5 * THREE.MathUtils.clamp(hollow(p, back) / 0.006, 0, 1);
    let under = 1;
    if (worn.pit) {
      const sl = sleeveAt[i], near = Math.exp(-((Math.abs(p.x) - worn.pit.x) ** 2 + (p.y - worn.pit.y + 0.012) ** 2) / 0.0022);
      under = 1 - 0.3 * near - (sl ? 0.2 * ramp(-0.2, -1, Math.sin(sl.phi)) * ramp(0.08, 0, sl.l) : 0);
    }
    const collar = 1 - 0.24 * Math.exp(-(Math.max(0, nearNeck(p) - (spec.legs ? band - 0.002 : 0)) ** 2) / 0.0004);
    return THREE.MathUtils.clamp(valley * ridge * muscles * under * collar * (worn.shade?.(p, back) ?? 1), 0.4, ridge);
  };
  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const colours = new Float32Array(n * 2 * 3);
  const backHeight = (p) => {
    if (!spec.chest || Math.abs(p.x) > .112 || p.y < .62) return p.y;
    const neckLine = kind === 'tee' || kind === 'raglan' || kind === 'polo' || kind === 'pocketpolo' || isHoodie(kind) || isTrack(kind) ? .707 + Math.abs(p.x) * .42 : .672 + Math.abs(p.x) * .76;
    const weight = Math.exp(-((p.y - neckLine) ** 2) / .00072) * Math.max(0, 1 - Math.abs(p.x) / .12);
    return p.y + Math.max(0, .752 - p.y) * weight;
  };
  for (let i = 0; i < n; i++) {
    const p = points[i], f = worn.at(p, false), b = worn.at(p, true);
    positions.set([f.x, f.y, f.z], i * 3);
    positions.set([b.x, b.y + backHeight(p) - p.y, b.z], (n + i) * 3);
    const front = shade(p, i, false), back = shade(p, i, true);
    colours.set([front, front, front], i * 3);
    colours.set([back, back, back], (n + i) * 3);
    uvs.set([(0.5 * (p.x - minX)) / span, (p.y - minY) / span], i * 2);
    uvs.set([0.5 + (0.5 * (maxX - p.x)) / span, (p.y - minY) / span], (n + i) * 2);
  }
  // Front and back are sewn together: every seam point is shared exactly, and so are edge
  // points where the two already meet (the ends of the sleeve seams at the cuff).
  const gap = (i) => Math.hypot(...[0, 1, 2].map((k) => positions[i * 3 + k] - positions[(n + i) * 3 + k]));
  const closed = poly.map((q, i) => (seam[i] && gap(i) < 0.015) || gap(i) < 0.0025);
  for (let i = 0; i < nb; i++) {
    if (closed[i]) for (let k = 0; k < 3; k++) positions[i * 3 + k] = positions[(n + i) * 3 + k] = (positions[i * 3 + k] + positions[(n + i) * 3 + k]) / 2;
  }
  const index = [];
  for (const [a, b, c] of faces) index.push(a, b, c);
  for (const [a, b, c] of faces) index.push(n + a, n + c, n + b);

  // Normals from a welded copy so the seams shade smoothly: first on the bare body, to push
  // the creases out along its surface, then again on the final shape.
  const weld = (i) => (i >= n && i - n < nb && closed[i - n] ? i - n : i);
  const weldedNormals = () => {
    const welded = new THREE.BufferGeometry();
    welded.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    welded.setIndex(index.map(weld));
    welded.computeVertexNormals();
    const out = welded.getAttribute('normal').array.slice();
    for (let i = 0; i < nb; i++) if (closed[i]) out.set(out.slice(i * 3, i * 3 + 3), (n + i) * 3);
    return out;
  };
  const bare = weldedNormals();
  for (let j = 0; j < 2 * n; j++) {
    const i = j % n, h = crease(points[i], j >= n, i) + muscle(points[i], j >= n, i);
    for (let c = 0; c < 3; c++) positions[j * 3 + c] += bare[j * 3 + c] * h;
  }
  const normals = weldedNormals();

  // Finished edges: the hem, sleeve ends and leg openings are turned inside in a small
  // rounded roll (2 - 2.5 mm), so they look thick and sewn rather than paper-thin.
  const isNeck = (p) => p.y > maxY - spec.neck.drop && Math.abs(p.x) < spec.neck.half;
  const edge = poly.map((p, i) => !seam[i] && !isNeck(p));
  const runs = [], first = edge.findIndex((e, i) => e && !edge[(i - 1 + nb) % nb]);
  for (let i = first, seen = 0; first >= 0 && seen < nb;) {
    if (!edge[i]) { i = (i + 1) % nb; seen++; continue; }
    const run = [];
    while (edge[i] && seen < nb) { run.push(i); i = (i + 1) % nb; seen++; }
    // Carry the roll on to the seam at each end, so front and back meet in one even band.
    const before = (run[0] - 1 + nb) % nb, after = (run.at(-1) + 1) % nb;
    if (run.length > 1) runs.push([...(seam[before] ? [before] : []), ...run, ...(seam[after] ? [after] : [])]);
  }
  const roll = { pos: [], uv: [], col: [], idx: [] }, K = 6, cols = K + 2;
  for (const run of runs) for (const back of [false, true]) {
    const base = roll.pos.length / 3;
    let firstNormal = null;
    for (const [k, i] of run.entries()) {
      // Along the edge; at a seam corner (a run's end) along the band's own edge, not round the corner.
      const p = poly[i], prev = seam[i] && k === 0 ? p : poly[(i - 1 + nb) % nb], next = seam[i] && k === run.length - 1 ? p : poly[(i + 1) % nb];
      const tx = next.x - prev.x, ty = next.y - prev.y, tl = Math.hypot(tx, ty) || 1;
      let ox = ty / tl, oy = -tx / tl;   // outward across the edge, in the garment plane
      if (inside(new THREE.Vector2(p.x + ox * 0.004, p.y + oy * 0.004), poly)) { ox = -ox; oy = -oy; }
      const j = back ? n + i : i, q = new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
      const N = new THREE.Vector3(normals[j * 3], normals[j * 3 + 1], normals[j * 3 + 2]).normalize();
      // Outward across the edge in 3D: where the worn shape would continue past the edge.
      const T = worn.at(new THREE.Vector2(p.x + ox * 0.004, p.y + oy * 0.004), back).sub(worn.at(p, back));
      T.addScaledVector(N, -T.dot(N)).normalize();
      firstNormal ??= N;
      const r = p.y < minY + 0.05 ? 0.0024 : 0.002;
      // Colour from just inside the edge, so the roll shows the edge band, not a blend with the outside.
      const ix = p.x - ox * 0.005, iy = p.y - oy * 0.005;
      const ru = back ? 0.5 + (0.5 * (maxX - ix)) / span : (0.5 * (ix - minX)) / span, rv = (iy - minY) / span;
      for (let k = 0; k <= K; k++) {
        const th = (Math.PI * k) / K, c = colours[j * 3] * (1 - 0.3 * (k / K));
        const o = q.clone().addScaledVector(T, r * Math.sin(th)).addScaledVector(N, -r * (1 - Math.cos(th)));
        roll.pos.push(o.x, o.y, o.z);
        roll.uv.push(ru, rv);
        roll.col.push(c, c, c);
      }
      // The hem allowance, folded up inside the garment.
      const inner = q.clone().addScaledVector(T, -0.012).addScaledVector(N, -2 * r);
      roll.pos.push(inner.x, inner.y, inner.z);
      roll.uv.push(ru, rv);
      roll.col.push(0.5, 0.5, 0.5);
    }
    // Wind the strip so its outside faces away from the body.
    const P = (k) => new THREE.Vector3(roll.pos[k * 3], roll.pos[k * 3 + 1], roll.pos[k * 3 + 2]);
    const flip = P(base + cols).sub(P(base)).cross(P(base + 1).sub(P(base))).dot(firstNormal) < 0;
    for (let a = 0; a < run.length - 1; a++) for (let k = 0; k < cols - 1; k++) {
      const i0 = base + a * cols + k, i1 = i0 + 1, j0 = i0 + cols, j1 = j0 + 1;
      if (flip) roll.idx.push(i0, i1, j0, i1, j1, j0); else roll.idx.push(i0, j0, i1, i1, j0, j1);
    }
  }
  const rollGeometry = new THREE.BufferGeometry();
  rollGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roll.pos, 3));
  rollGeometry.setIndex(roll.idx);
  rollGeometry.computeVertexNormals();
  const join = (main, extra, size) => { const out = new Float32Array(main.length + extra.length); out.set(main); out.set(extra, main.length); return new THREE.BufferAttribute(out, size); };

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', join(positions, roll.pos, 3));
  geometry.setAttribute('normal', join(normals, rollGeometry.getAttribute('normal').array, 3));
  geometry.setAttribute('uv', join(uvs, roll.uv, 2));
  geometry.setAttribute('color', join(colours, roll.col, 3));
  geometry.setIndex([...index, ...roll.idx.map((k) => k + 2 * n)]);
  geometry.computeBoundingBox();

  // Rim (collar or waistband): along the front opening, then back round
  // the rear one.
  const neckIdx = poly
    .map((p, i) => i)
    .filter((i) => !seam[i] && poly[i].y > maxY - spec.rim.drop && Math.abs(poly[i].x) < spec.rim.half);
  neckIdx.sort((a, b) => poly[a].x - poly[b].x);
  const vertex = (j) => new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
  const neck = [...neckIdx.map((i) => vertex(i)), ...neckIdx.slice().reverse().map((i) => vertex(n + i))];
  const uvAt = (x, y) => [(0.5 * (x - minX)) / span, (y - minY) / span];
  const partsCtx = () => ({ poly, seam, points, faces, positions, normals, colours, n, nb, maxY, minY, neck: spec.neck, uvAt,
    uvBack: (x, y) => [0.5 + (0.5 * (maxX - x)) / span, (y - minY) / span],
    surface: (x, y, back) => { const p = new THREE.Vector2(x, y), v = worn.at(p, back); if (back) v.y += backHeight(p) - p.y; return v; },
    at: (x, y, back) => worn.at(new THREE.Vector2(x, y), back) });
  const hoodie = spec.hood ? buildHoodieParts(spec, partsCtx()) : null;
  // The varsity jacket: its rib collar, cuffs and waistband, placket, welt pockets and snaps (varsity.js).
  const varsity = spec.varsity ? buildVarsityParts(spec, partsCtx()) : null;
  return {
    // The track jacket: its collar or hood (and that piece on the atlas), rib cuffs and hem band, zips (trackjacket.js).
    track: spec.track ? buildTrackParts(spec, partsCtx()) : null,
    // Hoodies: the hood (and its atlas piece), kangaroo pocket, rib cuffs and waistband, zip (hoodie.js).
    hoodie,
    varsity,
    kind,
    geometry,
    // The chest pocket's own mesh, on the front panel as made (its creases), printed from the same atlas.
    pocket: spec.pocket ? buildPocket(spec.pocket, { points, faces, positions, normals, colours, uvAt }) : null,
    frame: { minX, maxX, minY, maxY, span },
    outline: poly,
    // Which outline points are finished edges (hems, leg openings with their splits, sleeve ends).
    edges: edge,
    points: spec.points,
    neck,
    rimRadius: spec.rim.radius,
    rimWidth: spec.rim.width ?? (spec.legs ? 0.026 : 0.011),
    drawstring: !!spec.legs,
    /** Where a flat panel point sits on the worn garment (before creases). */
    at: (x, y, back = false) => worn.at(new THREE.Vector2(x, y), back),
    /** The same with the back's raised neckline: the fabric's shape as worn (a garment drawing's map keeps shapes on it). */
    surface: (x, y, back = false) => {
      const p = new THREE.Vector2(x, y), v = worn.at(p, back);
      if (back) v.y += backHeight(p) - p.y;
      return v;
    },
  };
}

/** A hoodie's extra pieces on the made garment (hoodie.js). */
function buildHoodieParts(spec, ctx) {
  const { poly, seam, positions, n, minY } = ctx;
  const sampleFront = panelSampler(ctx, false);
  const full = { ...ctx, sampleFront };
  const hood = buildHood(full, { zip: !!spec.zip });
  const vtx = (j) => new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
  // The waistband along the hem (split at the zip), the cuffs along each sleeve end.
  const hemIdx = poly.map((_, i) => i).filter((i) => !seam[i] && poly[i].y < minY + 0.03);
  const byX = (a, b) => poly[a].x - poly[b].x;
  let hemLoop, hemOpen = false;
  if (spec.zip) {
    const g = 0.0125;
    const right = hemIdx.filter((i) => poly[i].x >= g).sort(byX), left = hemIdx.filter((i) => poly[i].x <= -g).sort(byX);
    hemLoop = [...right.map(vtx), ...hemIdx.slice().sort(byX).reverse().map((i) => vtx(n + i)), ...left.map(vtx)];
    hemOpen = true;
  } else {
    hemLoop = [...hemIdx.slice().sort(byX).map(vtx), ...hemIdx.slice().sort(byX).reverse().map((i) => vtx(n + i))];
  }
  const ribs = [buildRib(hemLoop, { dir: new THREE.Vector3(0, -1, 0), length: 0.065, squeeze: 0.03, open: hemOpen })];
  const [ca, cb] = spec.cuff.map(([x, y]) => new THREE.Vector2(x, y)), ab = cb.clone().sub(ca);
  const mid = ca.clone().lerp(cb, 0.5), inward = new THREE.Vector2(ab.y, -ab.x).normalize();
  if (inward.dot(new THREE.Vector2(0.258, 0.61).sub(mid)) < 0) inward.negate();
  for (const sgn of [1, -1]) {
    const idx = poly.map((_, i) => i).filter((i) => {
      if (seam[i] || Math.sign(poly[i].x) !== sgn) return false;
      const q = new THREE.Vector2(Math.abs(poly[i].x), poly[i].y), t = THREE.MathUtils.clamp(q.clone().sub(ca).dot(ab) / ab.lengthSq(), 0, 1);
      return q.distanceTo(ca.clone().addScaledVector(ab, t)) < 0.012;
    });
    const along = (i) => new THREE.Vector2(Math.abs(poly[i].x), poly[i].y).sub(ca).dot(ab);
    idx.sort((a, b) => along(a) - along(b));
    const loop = [...idx.map(vtx), ...idx.slice().reverse().map((i) => vtx(n + i))];
    const m = new THREE.Vector2(sgn * mid.x, mid.y), inn = new THREE.Vector2(sgn * inward.x, inward.y);
    const dir = ctx.at(m.x, m.y, false).sub(ctx.at(m.x + inn.x * 0.03, m.y + inn.y * 0.03, false)).normalize();
    ribs.push(buildRib(loop, { dir, length: 0.062, squeeze: 0.12 }));
  }
  const pocket = buildKangaroo(full, { zip: !!spec.zip });
  // The zip: down the centre front from the waistband's foot to the neck.
  let zip = null;
  if (spec.zip) {
    const top = spec.half[0][1] - 0.003, base = sampleFront(0, 0.004);
    const path = (y) => {
      if (y >= 0.004) { const s = sampleFront(0, Math.min(y, top)); return { p: s.p.clone().addScaledVector(s.n, 0.0004), n: s.n }; }
      // Over the waistband: its face, drawn in a little towards its foot.
      const k = (0.004 - y) / 0.069, p = base.p.clone();
      p.y += y - 0.004;
      p.z = base.p.z * (1 - 0.03 * k) + 0.0016;
      return { p, n: new THREE.Vector3(0, 0, 1) };
    };
    zip = buildZip(path, { bottom: -0.062, top });
  }
  return { hood, ribs, pocket, zip, sampleFront };
}

/**
 * A stitched patch pocket on the front panel (`P`: zones.js POCKET, garment metres): a second layer of fabric that
 * follows the made front (its creases and the body under it, from the panel's own triangles), standing off it about
 * 2 mm, a little fuller in the middle, with a doubled top hem (a soft ridge where it is turned in), rounded bottom
 * corners and its cut edges turned under in a small rounded wall down to the shirt. Its top stays open: a shadowed
 * gap. Its UVs are those of the front under it, so its print is the atlas's pocket area (texture.js).
 */
function buildPocket(P, { points, faces, positions, normals, colours, uvAt }) {
  // The made front at a panel point: position, normal and shade, from the front triangle it falls in.
  const near = faces.filter((f) => f.some((i) => points[i].x > P.x0 - 0.03 && points[i].x < P.x1 + 0.03 && points[i].y > P.bottom - 0.03 && points[i].y < P.top + 0.03));
  const sample = (x, y) => {
    let best = null;
    for (const [a, b, c] of near) {
      const A = points[a], B = points[b], C = points[c];
      const d = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y);
      const wa = ((B.y - C.y) * (x - C.x) + (C.x - B.x) * (y - C.y)) / d, wb = ((C.y - A.y) * (x - C.x) + (A.x - C.x) * (y - C.y)) / d;
      const w = [[a, wa], [b, wb], [c, 1 - wa - wb]], worst = Math.min(wa, wb, 1 - wa - wb);
      if (!best || worst > best.worst) best = { worst, w };
      if (worst >= 0) break;
    }
    const p = new THREE.Vector3(), nrm = new THREE.Vector3();
    let shade = 0;
    for (const [i, w] of best.w) {
      p.x += positions[i * 3] * w; p.y += positions[i * 3 + 1] * w; p.z += positions[i * 3 + 2] * w;
      nrm.x += normals[i * 3] * w; nrm.y += normals[i * 3 + 1] * w; nrm.z += normals[i * 3 + 2] * w;
      shade += colours[i * 3] * w;
    }
    return { p, n: nrm.normalize(), shade };
  };
  const r = P.corner, W = P.x1 - P.x0, H = P.top - P.bottom, cols = 34, rows = 40;
  const ramp = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // Row j from the top (0) to the bottom; across, the rounded corners pull the bottom rows in.
  const rowY = (j) => P.top - (H * j) / rows;
  const inset = (y) => (y < P.bottom + r ? r - Math.sqrt(Math.max(0, r * r - (P.bottom + r - y) ** 2)) : 0);
  const at = (i, j) => { const y = rowY(j), a = P.x0 + inset(y), b = P.x1 - inset(y); return [a + ((b - a) * i) / cols, y]; };
  // How far the pocket stands off the shirt: 0.7 mm at its sewn edges rising to about 2 mm inside, fuller in the
  // middle; the top hem doubled (a little higher, with a soft ridge where it is turned in).
  const lift = (x, y) => {
    const edge = Math.min(x - P.x0 - inset(y), P.x1 - inset(y) - x, y - P.bottom);
    const fill = 0.0007 + 0.0013 * ramp(0, 0.006, edge) + 0.0009 * Math.sin((Math.PI * (x - P.x0)) / W) * Math.sin((Math.PI * (y - P.bottom)) / H);
    const hem = 0.0005 * ramp(P.top - P.hem - 0.002, P.top - P.hem + 0.001, y) + 0.0004 * Math.exp(-(((y - (P.top - 0.002)) / 0.0025) ** 2));
    return fill + hem;
  };
  const pos = [], uv = [], col = [], idx = [];
  const put = (v, x, y, c) => { pos.push(v.x, v.y, v.z); uv.push(...uvAt(x, y)); col.push(c, c, c); return pos.length / 3 - 1; };
  const grid = [], under = new Map();
  for (let j = 0; j <= rows; j++) {
    const row = [];
    for (let i = 0; i <= cols; i++) {
      const [x, y] = at(i, j), s = sample(x, y);
      // The turned-in top hem's foot a touch darker.
      const c = s.shade * (1 - 0.08 * Math.exp(-(((y - (P.top - P.hem)) / 0.002) ** 2)));
      const k = put(s.p.clone().addScaledVector(s.n, lift(x, y)), x, y, c);
      if (j === 0 || j === rows || i === 0 || i === cols) under.set(k, { s, x, y });
      row.push(k);
    }
    grid.push(row);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
    idx.push(a, c, b, b, c, d);
  }
  // Walls from the pocket's edge down into the shirt: the turned-under sides and bottom (shaded towards the shirt),
  // and at the open top the inside of the pocket in deep shadow. `list` runs so the wall faces outwards.
  const wall = (list, foot, depth) => {
    const feet = list.map((k) => {
      const { s, x, y } = under.get(k), f = s.p.clone().addScaledVector(s.n, -depth);
      return put(f, x, y, s.shade * foot);
    });
    for (let k = 0; k < list.length - 1; k++) idx.push(list[k], feet[k], list[k + 1], list[k + 1], feet[k], feet[k + 1]);
  };
  // Clockwise seen from the front: down the outer side, along the bottom, up the inner side.
  wall([...grid.map((row) => row[cols]), ...grid[rows].slice(0, cols).reverse(), ...grid.slice(0, rows).reverse().map((row) => row[0])], 0.55, 0.0004);
  wall(grid[0].slice(), 0.2, 0.0002);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

/**
 * The shorts' drawstring: two eyelets in the front of the waistband, either side of the middle, and the cord's two
 * ends coming out of them and hanging down over the front, each finished with a tip. Returns the parts and their
 * two materials (cord; eyelets and tips), coloured by the kit.
 */
export function buildDrawstring(garment) {
  const front = garment.neck.filter((p) => p.z > 0).sort((a, b) => a.x - b.x);
  const near = (x) => front.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best), front[0]);
  const width = garment.rimWidth, edge = near(0).y;
  // How far in front of the body the cord hangs: clear of the fabric and its folds.
  const surface = (x, y) => garment.at(x * 0.9, y, false).z + 0.0065;
  const cord = new THREE.MeshStandardMaterial({ color: 0x1d2346, roughness: 0.82 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x00a5c8, roughness: 0.32, metalness: 0.35 });
  const group = new THREE.Group();
  // Where the cord lies: just in front of the fabric under the band (k = 0: at the eyelet itself).
  const at = (x, y, lift = 0) => new THREE.Vector3(x, y, Math.max(near(x).z + 0.004, surface(x, y)) + lift);
  const rope = (points) => {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.0023, 8, false), cord);
    tube.castShadow = true;
    group.add(tube);
    return tube.geometry.parameters.path;
  };
  const y = edge - width * 0.5, knot = at(0, y - 0.024, 0.004);
  // On a deep gathered band the face stands further out (its bulge and its flare at that height).
  const face = width >= 0.035 ? 0.0012 + 0.0026 + width * 0.5 * 0.26 + 0.0012 : 0.0034;
  for (const dir of [-1, 1]) {
    const x = dir * 0.014, z = near(x).z + face;
    // Eyelet: a ring set in the band, facing out.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0042, 0.0012, 8, 24), metal);
    ring.position.set(x, y, z);
    ring.lookAt(x * 1.3, y, z + 1);
    group.add(ring);
    // Out through the eyelet and down to the knot.
    rope([new THREE.Vector3(x, y, z + 0.0012), at(x * 0.8, y - 0.01, 0.002), at(dir * 0.004, y - 0.02, 0.004), knot]);
    // A loop of the bow, out to the side and back.
    rope([knot, at(dir * 0.014, y - 0.028, 0.004), at(dir * 0.024, y - 0.042, 0.003), at(dir * 0.016, y - 0.056, 0.003), at(dir * 0.005, y - 0.04, 0.004), knot]);
    // An end hanging down, finished with a tip.
    const path = rope([knot, at(dir * 0.004, y - 0.05, 0.003), at(dir * 0.007, y - 0.085, 0.002), at(dir * 0.006, y - 0.115, 0.002)]);
    const end = path.getPoint(1), dirEnd = path.getTangent(1).normalize();
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0031, 0.0028, 0.017, 14), metal);
    tip.position.copy(end).addScaledVector(dirEnd, 0.0075);
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirEnd);
    tip.castShadow = true;
    group.add(tip);
  }
  // The knot.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0048, 16, 12), cord);
  ball.position.copy(knot);
  ball.scale.set(1.25, 0.9, 0.8);
  group.add(ball);
  return { group, cord, metal };
}

/**
 * Rib-knit collar (or waistband): an even band sewn round the opening and folded inwards,
 * so its rounded top edge shows outside and, through the opening, its inside face.
 */
export function buildCollar(neck, shorts = false, width = shorts ? 0.026 : 0.011) {
  // A deep elastic waistband (training shorts): three gathered channels (gatheredBand).
  if (shorts && width >= 0.035) return gatheredBand(neck, width);
  const curve = new THREE.CatmullRomCurve3(neck, true);
  const gathered = false, count = 160;
  const points = curve.getSpacedPoints(count);
  const along = curve.getLength();
  const positions = [], uvs = [], indices = [];
  const fold = shorts ? 0.0026 : 0.0019, top = width * 0.25;
  // Cross-section from the outside face, over the folded top edge, down the inside face:
  // [outward, up] in metres from the neck edge. Gathered: each channel bulges between its stitch lines.
  const profile = [];
  for (let r = 0; r <= 5; r++) { const s = r / 5; profile.push([0.0012 + (gathered ? 0.0026 : 0.0011) * Math.sin(Math.PI * s), -width + (width + top) * s]); }
  for (let r = 1; r <= 6; r++) { const a = (Math.PI * r) / 6; profile.push([0.0012 - fold + fold * Math.cos(a), top + fold * Math.sin(a)]); }
  for (let r = 1; r <= 3; r++) { const s = r / 3; profile.push([0.0012 - 2 * fold - 0.001 * s, top - width * 0.95 * s]); }
  const rows = profile.length - 1;
  points.forEach((point, index) => {
    const out = new THREE.Vector3(point.x * 0.35, 0, point.z).normalize();
    // Gathered: the outside face ripples in and out (deepest across the middle of the band), as elastic does.
    // Only ever outwards, so the gathers never dip into the shorts under the band.
    const ripple = gathered ? 0.0018 * (0.5 + 0.5 * Math.sin((index / count) * along * ((2 * Math.PI) / 0.011))) * (0.7 + 0.3 * Math.sin(index * 0.37)) : 0;
    profile.forEach(([o, h], r) => {
      const face = r <= 5 ? Math.sin((Math.PI * r) / 5) : 0;
      // Three channels, stitched between: the face dips in at a third and two thirds of the band.
      const channel = gathered && (r === 2 || r === 4) ? -0.0026 : 0;
      // A deep band follows the shorts as they widen below the waist (else their fabric shows through at its foot).
      const flare = gathered && r <= 5 && h < 0 ? -h * 0.26 : 0;
      positions.push(point.x + out.x * (o + ripple * face + channel + flare), point.y + h, point.z + out.z * (o + ripple * face + channel + flare));
      uvs.push(index / count, r / rows);
    });
    if (index < count) for (let r = 0; r < rows; r++) {
      const a = index * (rows + 1) + r, c = a + rows + 1;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A deep elastic waistband (training shorts), as factories sew them: three channels stitched across it (about 27 %,
 * 46 % and 27 % of its height from the foot; the drawstring's eyelets sit in the wide middle one), each puffing out a
 * little and tightly gathered into small upright folds about 5 mm apart that the stitch lines pinch flat; rounded over
 * at the top, its foot on the waist's stitching. It widens with the shorts below the waist, so they never show through.
 */
function gatheredBand(neck, width) {
  const curve = new THREE.CatmullRomCurve3(neck, true), along = curve.getLength();
  const count = Math.round(along / 0.00085), points = curve.getSpacedPoints(count), step = along / count;
  // The waist edge bulges a little at the corners: the band's top follows it smoothed, its foot the edge's lowest
  // line nearby (the shorts are stitched 1.2 mm under that, texture.js), so no shorts fabric shows above the stitching.
  const at = (i) => points[((i % count) + count) % count];
  const reach = (d) => Math.round(d / step);
  const topY = [], footY = [];
  for (let i = 0; i <= count; i++) {
    let sum = 0, low = Infinity;
    for (let k = -reach(0.04); k <= reach(0.04); k++) sum += at(i + k).y;
    for (let k = -reach(0.06); k <= reach(0.06); k++) low = Math.min(low, at(i + k).y);
    topY.push(sum / (2 * reach(0.04) + 1) + width * 0.25);
    footY.push(low - width - 0.0016);
  }
  // The foot's line smoothed too (no steps where the lowest point changes).
  const footLine = footY.slice(0, count);
  for (let i = 0; i <= count; i++) {
    let sum = 0;
    for (let k = -reach(0.03); k <= reach(0.03); k++) sum += footLine[(((i + k) % count) + count) % count];
    footY[i] = sum / (2 * reach(0.03) + 1);
  }
  // Folds all round (a whole number, so they meet where the loop closes), wandering a little; each channel its own.
  const folds = Math.round(along / 0.005);
  const gather = (i, c) => {
    const t = i / count, w = 2 * Math.PI * t;
    const phase = t * folds + 0.42 * Math.sin(w * 7 + c * 2.1) + 0.27 * Math.sin(w * 19 + c * 1.3) + c * 0.37;
    const f = phase - Math.floor(phase);
    // Rounded crests, sharp creases between them.
    return Math.pow(Math.sin(Math.PI * f), 0.6) * (0.8 + 0.2 * Math.sin(w * 31 + c * 4.1));
  };
  // Cross-section rows: up the outside (per channel: [from, to] as parts of the band's height, rows, puff, folds
  // depth), over the rounded top, down the inside.
  const channels = [[0, 0.27, 9, 0.0016, 0.0015], [0.27, 0.73, 13, 0.0022, 0.0017], [0.73, 1, 9, 0.0018, 0.0015]];
  const rows = [];
  channels.forEach(([from, to, n, puff, depth], c) => {
    for (let k = c ? 1 : 0; k <= n; k++) rows.push({ c, part: from + ((to - from) * k) / n, s: k / n, puff, depth });
  });
  const outside = rows.length, fold = 0.0026;
  for (let r = 1; r <= 6; r++) rows.push({ a: (Math.PI * r) / 6 });
  for (let r = 1; r <= 3; r++) rows.push({ inside: r / 3 });
  const total = rows.length - 1;
  const positions = [], uvs = [], indices = [];
  points.forEach((point, index) => {
    const out = new THREE.Vector3(point.x * 0.35, 0, point.z).normalize();
    const y0 = footY[index], y1 = topY[index];
    const topFolds = gather(index, 2);
    rows.forEach((row, r) => {
      let o, y;
      if (r < outside) {
        y = y0 + (y1 - y0) * row.part;
        const h = y - point.y;
        // Follows the shorts widening below the waist (a little more at the foot, over their side seams).
        const flare = Math.max(0, -h) * 0.26 + 0.0014 * THREE.MathUtils.clamp((-h - 0.03) / 0.012, 0, 1);
        const across = Math.sin(Math.PI * row.s);
        o = 0.0012 + flare + row.puff * Math.pow(across, 0.7) + row.depth * Math.pow(across, 0.45) * gather(index, row.c);
      } else if (row.a !== undefined) {
        // The rounded top: the top channel's folds carry on over it.
        o = 0.0012 - fold + fold * Math.cos(row.a) + 0.0011 * topFolds * Math.max(0, Math.cos(row.a * 0.5));
        y = y1 + fold * Math.sin(row.a);
      } else {
        o = 0.0012 - 2 * fold - 0.001 * row.inside;
        y = y1 - width * 0.95 * row.inside;
      }
      positions.push(point.x + out.x * o, y, point.z + out.z * o);
      uvs.push(index / count, r / total);
    });
    if (index < count) for (let r = 0; r < total; r++) {
      const a = index * (total + 1) + r, c = a + total + 1;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
