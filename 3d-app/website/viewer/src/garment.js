import * as THREE from 'three';
import Delaunator from 'delaunator';
import { wornTop, wornShorts } from './worn.js';

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

/** Smooth closed outline sampled every `step` metres. */
function outline(kind, step) {
  const half = (SPECS[kind] ?? SPECS.jersey).half;
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
export function buildGarment(kind = 'jersey', { step = 0.0085 } = {}) {
  const spec = SPECS[kind] ?? SPECS.jersey;
  const poly = outline(kind, step);
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
    if (spec.armholes && ax > 0.15 && p.y > 0.5 && ax < 0.24) return true;
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
  const fineZone = (p) => {
    const ax = Math.abs(p.x);
    if (spec.legs) return (ax > 0.14 && p.y < 0.37) || p.y > 0.31 || Math.hypot(ax, p.y - 0.17) < 0.13;
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
    : wornShorts();
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
    if (spec.legs) return 0;
    const ax = Math.abs(p.x), ph = back ? 2.1 : 0;
    const band = ramp(0.02, 0.036, hemDist[i]);   // the hem band itself stays smooth and even
    const drape = Math.sin(p.x * 66 + ph + 1.3 * Math.sin(p.x * 17 + ph)) * ramp(0.2, 0, p.y);
    const slant = Math.sin((p.y + 0.45 * p.x) * 150 + ph + 1.8 * Math.sin(p.x * 11 + ph)) * ramp(0.11, 0.04, p.y) * (0.45 + 0.55 * ramp(0.04, 0.2, ax));
    return band * (0.0024 * drape + 0.0016 * slant);
  };
  /** Faint, wide stretch ripples along the sides (or the shorts' legs). */
  const sideRipple = (p, back) => {
    const ax = Math.abs(p.x), ph = back ? 2.6 : 0;
    const sides = spec.chest
      ? ramp(0.17, 0.22, ax) * ramp(0.5, 0.42, p.y) * ramp(0.03, 0.08, p.y)
      : spec.legs ? ramp(0.14, 0.2, ax) * ramp(0.37, 0.3, p.y) : 0;
    return 0.0005 * sides * Math.sin((p.y * 0.86 + ax * 0.5) * 160 + ph + 1.6 * Math.sin(p.y * 23 + ax * 9));
  };
  /** The back of a worn top: soft folds where the fabric gathers over the small of the back,
   *  rising from the middle towards the sides. */
  const backFolds = (p, back) => {
    if (!back || !spec.chest) return 0;
    const ax = Math.abs(p.x);
    const rise = Math.sin((p.y - 0.42 * ax) * 105 + 1.2 * Math.sin(ax * 14)) * ramp(0.32, 0.12, p.y) * ramp(0.03, 0.07, p.y);
    return 0.0028 * rise * (0.5 + 0.5 * ramp(0.02, 0.12, ax));
  };
  /** Shorts: drag folds where they pull between the legs, fanning from the crotch sideways and
   *  down across the thighs in front, under and beside the seat behind; and the fabric gathered
   *  by the elastic just under the waistband. */
  const shortsFolds = (p, back) => {
    if (!spec.legs) return 0;
    const ax = Math.abs(p.x), vy = p.y - 0.17, rho = Math.hypot(ax, vy), ang = Math.atan2(vy, ax), ph = back ? 1.3 : 0;
    const fan = back ? ramp(-0.9, -0.3, ang) * ramp(0.95, 0.4, ang) : ramp(-1.15, -0.8, ang) * ramp(0.3, 0.02, ang);
    const drag = rho > 0.17 ? 0 : fan * ramp(0.012, 0.04, rho) * ramp(0.17, 0.07, rho) * Math.sin(ang * 10 + ph + 0.6 * Math.sin(rho * 40));
    const gather = Math.sin(p.x * 300 + ph + 1.5 * Math.sin(p.x * 31)) * (0.6 + 0.4 * Math.sin(p.x * 23 + 0.7)) * ramp(0.33, 0.386, p.y) * ramp(0.396, 0.388, p.y);
    return 0.003 * drag + 0.0013 * gather;
  };
  const seamDist = points.map((p, i) => (i < nb && seam[i] ? 0 : distanceToOutline(p, poly, seam)));
  /** Crease height in metres (+ out, - in), pushed out along the body's surface. */
  const crease = (p, back, i) => ramp(0, 0.015, seamDist[i]) * (pitFolds(p, back, i) + hemFolds(p, back, i) + sideRipple(p, back) + backFolds(p, back) + shortsFolds(p, back));
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
    const valley = 1 - 0.16 * Math.min(1, Math.max(0, -crease(p, back, i) / 0.003));
    const muscles = 1 - 0.5 * THREE.MathUtils.clamp(hollow(p, back) / 0.006, 0, 1);
    let under = 1;
    if (worn.pit) {
      const sl = sleeveAt[i], near = Math.exp(-((Math.abs(p.x) - worn.pit.x) ** 2 + (p.y - worn.pit.y + 0.012) ** 2) / 0.0022);
      under = 1 - 0.3 * near - (sl ? 0.2 * ramp(-0.2, -1, Math.sin(sl.phi)) * ramp(0.08, 0, sl.l) : 0);
    }
    const collar = 1 - 0.24 * Math.exp(-(Math.max(0, nearNeck(p) - (spec.legs ? 0.024 : 0)) ** 2) / 0.0004);
    return THREE.MathUtils.clamp(valley * muscles * under * collar * (worn.shade?.(p, back) ?? 1), 0.4, 1);
  };
  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const colours = new Float32Array(n * 2 * 3);
  const backHeight = (p) => {
    if (!spec.chest || Math.abs(p.x) > .112 || p.y < .62) return p.y;
    const neckLine = kind === 'tee' || kind === 'polo' ? .707 + Math.abs(p.x) * .42 : .672 + Math.abs(p.x) * .76;
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
  return {
    kind,
    geometry,
    frame: { minX, maxX, minY, maxY, span },
    outline: poly,
    neck,
    rimRadius: spec.rim.radius,
  };
}

/**
 * Rib-knit collar (or waistband): an even band sewn round the opening and folded inwards,
 * so its rounded top edge shows outside and, through the opening, its inside face.
 */
export function buildCollar(neck, shorts = false) {
  const curve = new THREE.CatmullRomCurve3(neck, true);
  const points = curve.getSpacedPoints(160);
  const positions = [], uvs = [], indices = [];
  const width = shorts ? 0.026 : 0.011, fold = shorts ? 0.0026 : 0.0019, top = width * 0.25;
  // Cross-section from the outside face, over the folded top edge, down the inside face:
  // [outward, up] in metres from the neck edge.
  const profile = [];
  for (let r = 0; r <= 5; r++) { const s = r / 5; profile.push([0.0012 + 0.0011 * Math.sin(Math.PI * s), -width + (width + top) * s]); }
  for (let r = 1; r <= 6; r++) { const a = (Math.PI * r) / 6; profile.push([0.0012 - fold + fold * Math.cos(a), top + fold * Math.sin(a)]); }
  for (let r = 1; r <= 3; r++) { const s = r / 3; profile.push([0.0012 - 2 * fold - 0.001 * s, top - width * 0.95 * s]); }
  const rows = profile.length - 1;
  points.forEach((point, index) => {
    const out = new THREE.Vector3(point.x * 0.35, 0, point.z).normalize();
    profile.forEach(([o, h], r) => {
      positions.push(point.x + out.x * o, point.y + h, point.z + out.z * o);
      uvs.push(index / 160, r / rows);
    });
    if (index < 160) for (let r = 0; r < rows; r++) {
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
