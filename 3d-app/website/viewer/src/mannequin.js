import * as THREE from 'three';
import { FIGURES, torsoAt } from './figure.js';

// The mannequin under a garment (render tiers, 2026-10-23): a display form shaped from the made garment itself, so the
// cloth reads as worn rather than floating. A torso (a top), or hips and thighs (shorts), the neck and the upper arms,
// each taken slice by slice from the fabric's own points and set a few millimetres inside them, so the garment never
// shows it except through its openings (the neck, the sleeves, below the hem). It is never picked and never framed:
// main.js adds it after framing, outside the printed meshes. Inside the garment it is in the garment's shade (each
// ring's occlusion: dark there, fully lit where it shows), so an opening such as a singlet's armhole looks into shadow.

const BINS = 40;
const ramp = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** How much light reaches the form inside the garment (1 = where it shows). */
const INSIDE = 0.28;

/** Closes the gaps in a ring of radii (null = no fabric point in that direction), then smooths it. */
function fillRing(r) {
  const n = r.length, known = r.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  if (!known.length) return null;
  const out = r.slice();
  for (let i = 0; i < n; i++) {
    if (out[i] != null) continue;
    let a = i, b = i, da = 0, db = 0;
    while (r[a] == null) { a = (a - 1 + n) % n; da++; }
    while (r[b] == null) { b = (b + 1) % n; db++; }
    out[i] = (r[a] * db + r[b] * da) / (da + db);
  }
  for (let pass = 0; pass < 2; pass++) {
    const s = out.slice();
    for (let i = 0; i < n; i++) out[i] = Math.min(s[i], (s[(i - 1 + n) % n] + 2 * s[i] + s[(i + 1) % n]) / 4 + 0.001);
  }
  return out;
}

/**
 * The innermost fabric point in each direction round a slice. `pts`: [u, v] offsets in the slice's plane from its
 * centre. Returns the radii (BINS of them) or null.
 */
function sliceRadii(pts) {
  const r = new Array(BINS).fill(null);
  for (const [u, v] of pts) {
    const k = Math.floor(((Math.atan2(v, u) / (2 * Math.PI)) + 1) * BINS) % BINS, d = Math.hypot(u, v);
    if (r[k] == null || d < r[k]) r[k] = d;
  }
  return fillRing(r);
}

/** A closed tube through rings (each BINS points), with a cap at each end; `shades`: each ring's occlusion. */
function tubeGeometry(rings, shades) {
  const pos = [], idx = [], occ = [];
  const K = BINS;
  rings.forEach((ring, r) => { for (const p of ring) { pos.push(p.x, p.y, p.z); occ.push(shades[r]); } });
  for (let a = 0; a < rings.length - 1; a++) for (let k = 0; k < K; k++) {
    const i0 = a * K + k, i1 = a * K + ((k + 1) % K), j0 = i0 + K, j1 = i1 + K;
    idx.push(i0, j0, i1, i1, j0, j1);
  }
  // Caps: a fan to each end ring's centre.
  for (const [ring, flip] of [[0, true], [rings.length - 1, false]]) {
    const c = new THREE.Vector3();
    rings[ring].forEach((p) => c.add(p));
    c.divideScalar(K);
    const ci = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    occ.push(shades[ring]);
    for (let k = 0; k < K; k++) {
      const a = ring * K + k, b = ring * K + ((k + 1) % K);
      if (flip) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('occlusion', new THREE.Float32BufferAttribute(occ, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Orients a tube so its faces point outwards (the winding depends on the rings' direction). */
function outward(g, rings) {
  const a = rings[Math.floor(rings.length / 2)], c = new THREE.Vector3();
  a.forEach((p) => c.add(p));
  c.divideScalar(a.length);
  const n = g.getAttribute('normal'), pos = g.getAttribute('position'), i = Math.floor(rings.length / 2) * BINS;
  const out = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(c);
  if (out.dot(new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i))) < 0) {
    const index = g.index.array;
    for (let k = 0; k < index.length; k += 3) { const t = index[k + 1]; index[k + 1] = index[k + 2]; index[k + 2] = t; }
    g.index.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

/** Rounds a tube's end: rings shrinking towards `dir` from the last one. */
function roundEnd(rings, dir, depth) {
  const last = rings.at(-1), c = new THREE.Vector3();
  last.forEach((p) => c.add(p));
  c.divideScalar(last.length);
  for (const [s, d] of [[0.88, 0.45], [0.6, 0.85], [0.25, 1]]) {
    rings.push(last.map((p) => p.clone().sub(c).multiplyScalar(s).add(c).addScaledVector(dir, depth * d)));
  }
}

/** Horizontal rings of a torso / hips (or one leg: `pick` filters the points) from fabric points. */
function horizontalRings(points, y0, y1, ease, pick = () => true, dy = 0.01) {
  const rings = [];
  // The points by height (dy bands), so each slice looks only at its own and the neighbouring bands.
  const bands = new Map();
  for (const p of points) { const k = Math.floor(p.y / dy); if (!bands.has(k)) bands.set(k, []); bands.get(k).push(p); }
  for (let y = y0; y <= y1 + 1e-6; y += dy) {
    const k = Math.floor(y / dy), near = [];
    for (let b = k - 1; b <= k + 1; b++) for (const p of bands.get(b) ?? []) if (Math.abs(p.y - y) < dy * 0.8 && pick(p)) near.push(p);
    if (near.length < 8) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of near) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const r = sliceRadii(near.map((p) => [p.x - cx, p.z - cz]));
    if (!r) continue;
    rings.push({ y, cx, cz, r: r.map((v) => Math.max(0.004, v - ease)) });
  }
  // Smooth up and down (never outwards past the slices' own fabric).
  return rings.map((ring, i) => {
    const near = [rings[i - 1], ring, rings[i + 1]].filter(Boolean);
    const r = ring.r.map((v, k) => Math.min(v + 0.0015, near.reduce((s, q) => s + q.r[k], 0) / near.length));
    return r.map((v, k) => {
      const th = (2 * Math.PI * (k + 0.5)) / BINS;
      return new THREE.Vector3(ring.cx + v * Math.cos(th), ring.y, ring.cz + v * Math.sin(th));
    });
  });
}

/** Extends a tube past its last ring along `dir`, narrowing by `taper` over `length`. */
function extend(rings, dir, length, taper, steps = 4) {
  const last = rings.at(-1), c = new THREE.Vector3();
  last.forEach((p) => c.add(p));
  c.divideScalar(last.length);
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    rings.push(last.map((p) => p.clone().sub(c).multiplyScalar(1 - taper * t).add(c).addScaledVector(dir, length * t)));
  }
}

/**
 * The innermost fabric point in each direction round a level slice centred on (cx, cz) (BINS radii, null where there is
 * none), from points within `dy` of the height y.
 */
function fabricRadii(points, y, cx, cz, dy = 0.008) {
  const r = new Array(BINS).fill(null);
  for (const p of points) {
    if (Math.abs(p.y - y) > dy) continue;
    const u = p.x - cx, v = p.z - cz, k = Math.floor(((Math.atan2(v, u) / (2 * Math.PI)) + 1) * BINS) % BINS, d = Math.hypot(u, v);
    if (r[k] == null || d < r[k]) r[k] = d;
  }
  return r;
}

/** A level ring of the female figure's own shape (figure.js): an ellipse, fuller behind over the seat. */
function figureRing(figure, top, y, kept) {
  const drop = top - y, [a, b, fwd] = torsoAt(figure, drop);
  const seat = figure.seat * ramp(figure.waist + 0.05, figure.hip - 0.02, drop) * ramp(figure.crotch + 0.04, figure.hip, drop);
  return Array.from({ length: BINS }, (_, k) => {
    const th = (2 * Math.PI * (k + 0.5)) / BINS, c = Math.cos(th), s = Math.sin(th);
    // Behind (s < 0) the seat: two rounded cheeks either side of the middle.
    const z = fwd + b * s - (s < 0 ? seat * Math.abs(s) * (0.75 + 0.25 * Math.abs(Math.sin(2 * th))) : 0);
    const p = new THREE.Vector3(a * c, y, z), r = Math.hypot(p.x, p.z);
    // Never outside the fabric (a fitted skirt over the hips): kept a few millimetres inside it.
    const lim = kept?.[k];
    if (lim != null && r > lim) p.multiplyScalar(lim / r).setY(y);
    return p;
  });
}

/**
 * A shoulder of the female form (sg: +1 the wearer's left), seen through a sleeveless garment's armhole: from beside the
 * neck out to a rounded arm plate, level slices across it (each an ellipse in its own up / forward plane) kept inside
 * the fabric round it (the straps over it, the bodice in front and behind). Its rings, inner end first.
 */
function shoulderRings(trunk, figure, top, sg) {
  const S = figure.shoulder, rings = [];
  for (let x = S.from; x <= S.to + 1e-6; x += 0.01) {
    // The shoulder's top slopes down from beside the neck to the arm plate (under the strap); its foot is level.
    const t = (x - S.from) / (S.to - S.from), yTop = top - 0.008 - S.slope * Math.max(0, x - 0.09), yFoot = top - S.drop - S.height;
    const ry = (yTop - yFoot) / 2, rz = S.depth * (1 - 0.15 * t), yc = (yTop + yFoot) / 2, zc = -0.004;
    const near = trunk.filter((p) => Math.sign(p.x) === sg && Math.abs(Math.abs(p.x) - x) < 0.006 && p.y > yc - ry - 0.03);
    const lim = new Array(BINS).fill(null);
    for (const p of near) {
      const u = p.z - zc, v = p.y - yc, k = Math.floor(((Math.atan2(v, u) / (2 * Math.PI)) + 1) * BINS) % BINS, d = Math.hypot(u, v);
      if (lim[k] == null || d < lim[k]) lim[k] = d;
    }
    rings.push(Array.from({ length: BINS }, (_, k) => {
      const th = (2 * Math.PI * (k + 0.5)) / BINS, c = Math.cos(th), s = Math.sin(th);
      const ra = 1 / Math.hypot(c / rz, s / ry), r = lim[k] != null ? Math.min(ra, lim[k] - 0.006) : ra;
      return new THREE.Vector3(sg * x, yc + Math.max(0.01, r) * s, zc + Math.max(0.01, r) * c);
    }));
  }
  return rings;
}

/**
 * A female form (figure.js): the bodice from the made garment (fitted: its own shape), then the hips from the figure
 * (a skirt stands away from them) down to the crotch, closed there, and the thighs from inside the hips on past the
 * hem, where they end, rounded; the stand goes up into the wearer's left one. Returns the torso's rings (top down) and
 * the thighs' (each top down), or null.
 */
function femaleForm(trunk, body, figure, openingFoot, minY) {
  const top = body.top, waistY = top - figure.waist, crotchY = top - figure.crotch;
  const bodice = horizontalRings(trunk, waistY, openingFoot - 0.004, 0.007).reverse();
  if (bodice.length < 4) return null;
  // The hips: each ring the figure's, kept inside the fabric round it.
  const hips = [];
  for (let y = waistY - 0.012; y >= crotchY + 0.015; y -= 0.012) {
    const kept = fabricRadii(trunk, y, 0, 0).map((r) => (r == null ? null : r - 0.006));
    hips.push(figureRing(figure, top, y, kept));
  }
  // Where the bodice meets the hips the two are blended over a few rings.
  const last = bodice.at(-1), first = hips[0];
  if (last && first) for (let k = 1; k <= 2; k++) hips[k - 1] = first.map((p, i) => p.clone().lerp(last[i], 0.35 / k).setY(p.y));
  const torso = [...bodice, ...hips];
  const thighs = [];
  const T = figure.thigh;
  for (const sg of [1, -1]) {
    const rings = [];
    // On past the hem (further when the garment stands higher on its stand: body.lift), well above the podium.
    // (The netball dress: the thighs end inside the skirt, so no stubs show under its hem, as on the client's picture.)
    const y0 = crotchY + 0.06, y1 = minY + 0.05;
    for (let y = y0; y >= y1 - 1e-6; y -= 0.012) {
      // Rounder and narrower down the leg, a little forward at the top.
      const t = THREE.MathUtils.clamp((y0 - y) / (y0 - (top - 0.9)), 0, 1.3), r = T.top + (T.mid - T.top) * t, cz = 0.006 * (1 - t);
      const cx = sg * (T.x - 0.006 * t);
      const kept = fabricRadii(trunk, y, cx, cz).map((v) => (v == null ? null : v - 0.006));
      rings.push(Array.from({ length: BINS }, (_, k) => {
        const th = (2 * Math.PI * (k + 0.5)) / BINS, lim = kept[k];
        const rr = lim != null ? Math.min(r * (k < BINS / 2 ? 0.96 : 1), lim) : r;
        return new THREE.Vector3(cx + rr * Math.cos(th), y, cz + rr * 0.95 * Math.sin(th));
      }));
    }
    thighs.push(rings);
  }
  return { torso, thighs, shoulders: [1, -1].map((sg) => shoulderRings(trunk, figure, top, sg)) };
}

/** The neck: rising from inside the torso through the neck opening, a little forward at the top, cut level. */
function addNeck(garment, add) {
  const neck = garment.neck ?? [], up = new THREE.Vector3(0, 1, 0);
  if (neck.length > 4) {
    const zs = neck.map((p) => p.z), back = Math.min(...zs), ny = Math.min(...neck.map((p) => p.y)), top = Math.max(...neck.map((p) => p.y));
    const cz = back + 0.064, room = Math.min(...neck.map((p) => Math.hypot(p.x, p.z - cz)));
    const R = Math.min(0.056, room * 0.86);
    const rings = [];
    // Cut level low in the opening (a display form's neck block), so the neck label inside the back, with its
    // size, still shows above it.
    const cutY = ny + 0.18 * (top - ny);
    for (const [y, s, lean] of [[ny - 0.06, 1.45, -0.004], [ny - 0.02, 1.16, 0], [cutY - 0.012, 1.03, 0.003], [cutY, 1, 0.004]]) {
      rings.push(Array.from({ length: BINS }, (_, k) => {
        const th = (2 * Math.PI * (k + 0.5)) / BINS;
        return new THREE.Vector3(R * s * Math.cos(th), y, cz + lean + R * s * 0.92 * Math.sin(th));
      }));
    }
    roundEnd(rings, up, 0.004);
    // Seen through the neck opening, in the collar's shade.
    add(rings, () => 0.55);
  }
}

/**
 * The mannequin for one garment part (garment.body from buildGarment with detail on). `over`: a top worn over shorts
 * (the shorts' own form carries the hips). Returns a group in the garment's coordinates, or null.
 */
export function buildMannequin(garment, material, { over = false } = {}) {
  const body = garment.body;
  if (!body) return null;
  const { n, positions, sleeve } = body;
  const all = [];
  for (let j = 0; j < 2 * n; j++) all.push(Object.assign(new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]), { l: sleeve[j % n] }));
  const trunk = all.filter((p) => p.l < 0);
  const group = new THREE.Group();
  group.name = 'mannequin';
  // Each tube with its rings' occlusion: shade(ring, index) -> 0..1.
  const add = (rings, shade) => {
    if (rings.length < 2) return;
    const mesh = new THREE.Mesh(outward(tubeGeometry(rings, rings.map((ring, i) => shade(ring, i))), rings), material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
  };
  let minY = Infinity, maxY = -Infinity;
  for (const p of trunk) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const down = new THREE.Vector3(0, -1, 0), up = new THREE.Vector3(0, 1, 0);
  /** Dark inside the garment, lit from just above its lower edge (the hem or a leg opening at `edge`) downwards. */
  const below = (edge) => (ring) => INSIDE + (1 - INSIDE) * ramp(edge + 0.02, edge - 0.012, ring[0].y);
  group.userData.feet = [];

  if (body.legs) {
    // Shorts: the hips from the crotch to the waist, then each thigh, on past the leg opening.
    const hips = horizontalRings(trunk, body.crotch + 0.01, maxY - 0.008, 0.007);
    if (hips.length) { roundEnd(hips, up, 0.02); add(hips, () => INSIDE); }
    for (const sg of [1, -1]) {
      const leg = horizontalRings(trunk, minY + 0.004, body.crotch + 0.03, 0.007, (p) => Math.sign(p.x) === sg).reverse();
      if (leg.length < 2) continue;
      // The thighs end about 4 cm below the leg openings, well above the podium; the stand goes into one of them.
      extend(leg, down, 0.035, 0.05, 3);
      roundEnd(leg, down, 0.01);
      add(leg, below(minY));
      group.userData.feet.push(leg.at(-1).reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(BINS));
    }
  } else if (FIGURES[body.form]) {
    // A women's garment (the netball dress): the female form, its bodice from the garment, its hips and thighs its own.
    const openingFoot = garment.neck?.length ? Math.min(...garment.neck.map((p) => p.y)) : maxY;
    const form = femaleForm(trunk, body, FIGURES[body.form], Math.min(maxY, openingFoot), minY);
    if (!form) return null;
    const { torso, thighs, shoulders } = form;
    const top = torso[0], c = new THREE.Vector3();
    top.forEach((p) => c.add(p));
    c.divideScalar(top.length);
    const cap = [[0.82, 0.008], [0.55, 0.013]].map(([s, d]) => top.map((p) => p.clone().sub(c).multiplyScalar(s).add(c).addScaledVector(up, d)));
    torso.unshift(...cap.reverse());
    roundEnd(torso, down, 0.03);
    // All inside the dress: in its shade.
    add(torso, () => INSIDE);
    for (const leg of thighs) {
      if (leg.length < 2) continue;
      roundEnd(leg, down, 0.012);
      add(leg, below(minY));
      group.userData.feet.push(leg.at(-1).reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(BINS));
    }
    // The shoulders, rounded off at the arm plates: in shade inside, lit towards the armholes.
    shoulders.forEach((rings, i) => {
      if (rings.length < 3) return;
      const inner = rings.length;
      roundEnd(rings, new THREE.Vector3(i ? -1 : 1, 0, 0), 0.018);
      add(rings, (ring, k) => INSIDE + (0.6 - INSIDE) * ramp(inner - 5, inner + 1, k));
    });
    addNeck(garment, add);
  } else {
    // A top: the torso from the hem (below it when the top is worn alone: the hips) to the shoulders.
    // Up to the foot of the neck opening (above it the shoulders stay hollow, so the neck label inside the back
    // still shows through the opening, as before).
    const openingFoot = garment.neck?.length ? Math.min(...garment.neck.map((p) => p.y)) : maxY;
    const torso = horizontalRings(trunk, minY + 0.004, Math.min(maxY, openingFoot) - 0.004, 0.007).reverse();
    if (torso.length < 4) return null;
    // Over the shoulders: closed towards the neck.
    const top = torso[0], c = new THREE.Vector3();
    top.forEach((p) => c.add(p));
    c.divideScalar(top.length);
    const cap = [[0.82, 0.008], [0.55, 0.013]].map(([s, d]) => top.map((p) => p.clone().sub(c).multiplyScalar(s).add(c).addScaledVector(up, d)));
    torso.unshift(...cap.reverse());
    // (Not under a skin-tight top: the client's compression top shows no form below its hem; CF1 2026-10-29.)
    if (!over && !body.tight) extend(torso, down, 0.05, 0.045, 3);
    roundEnd(torso, down, 0.008);
    add(torso, below(minY));

    addNeck(garment, add);

    // Upper arms: along each sleeve, from just inside the armhole on past a short sleeve's end.
    for (const sg of [1, -1]) {
      const arm = all.filter((p) => p.l >= 0 && Math.sign(p.x) === sg);
      if (arm.length < 30) continue;
      // A long sleeve's arm stops about 5 cm inside it: its rib cuff is drawn in narrower than the arm, and a rounded
      // end there would show below the cuff. Through the cuff the opening then looks into shade.
      const lMax = arm.reduce((m, p) => Math.max(m, p.l), 0), lEnd = body.long ? lMax - 0.05 : body.pads ? lMax - 0.03 : lMax - 0.004, bins = [];
      for (let l = 0.035; l <= lEnd; l += 0.012) {
        const near = arm.filter((p) => Math.abs(p.l - l) < 0.008);
        if (near.length < 8) continue;
        const c = near.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(near.length);
        bins.push({ c, near });
      }
      if (bins.length < 3) continue;
      const rings = bins.map(({ c, near }, i) => {
        const d = bins[Math.min(bins.length - 1, i + 1)].c.clone().sub(bins[Math.max(0, i - 1)].c).normalize();
        const u = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 0, 1)).normalize(), v = new THREE.Vector3().crossVectors(d, u);
        const r = sliceRadii(near.map((p) => { const o = p.clone().sub(c); return [o.dot(u), o.dot(v)]; }));
        return r.map((rad, k) => {
          const th = (2 * Math.PI * (k + 0.5)) / BINS;
          // A long sleeve bends and narrows to the wrist: the arm kept well inside it (only its cuff shows it).
          // A shoulder-pad sleeve (the American football jersey) stands well off the arm: the arm stays thin, inside it.
          const in_ = body.long ? Math.max(0.01, 0.8 * rad - 0.01) : body.pads ? Math.max(0.01, Math.min(rad - 0.012, 0.042)) : Math.max(0.01, rad - 0.006);
          return c.clone().addScaledVector(u, in_ * Math.cos(th)).addScaledVector(v, in_ * Math.sin(th));
        });
      });
      const dir = bins.at(-1).c.clone().sub(bins.at(-3).c).normalize();
      // A short sleeve: the arm ends just past it, rounded off; a long one well inside it (above), its end kept short.
      const inSleeve = rings.length;
      if (!body.long && !body.pads) extend(rings, dir, 0.006, 0.03, 1);
      roundEnd(rings, dir, body.long ? 0.006 : 0.01);
      // Dark up the sleeve, lighter towards a short sleeve's end, where the opening lets the light in; a long sleeve's
      // arm is in the sleeve's shade all along.
      add(rings, (ring, i) => (body.long || body.pads || i < inSleeve - 2 ? INSIDE : i < inSleeve ? 0.5 : 0.85));
    }
  }
  return group.children.length ? group : null;
}

/**
 * The mannequin's finish: a dark satin display form, catching the stadium's light along its edges. Its occlusion
 * (per vertex) scales all the light it sends back, reflections included, so inside the garment it stays in shade.
 */
export function mannequinMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x1c2129, roughness: 0.56, metalness: 0, clearcoat: 0.22, clearcoatRoughness: 0.45, sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x8fb4d0) });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float occlusion;\nvarying float vOcclusion;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvOcclusion = occlusion;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vOcclusion;')
      .replace('#include <opaque_fragment>', 'outgoingLight *= vOcclusion;\n\t#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'mannequin-occlusion';
  return m;
}

/** The stand under the mannequin: a polished rod from its lowest point into the podium (kit coordinates). */
let chrome = null;
export function buildStand(fromY, toY, x = 0, z = 0) {
  const length = fromY - toY;
  if (!(length > 0.004)) return null;
  // Made once and kept (main.js leaves materials marked keep when it clears the kit).
  chrome ??= new THREE.MeshStandardMaterial({ color: 0xc4ccd4, metalness: 1, roughness: 0.2, userData: { keep: true } });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, length, 32), chrome);
  rod.position.set(x, (fromY + toY) / 2, z);
  rod.castShadow = true;
  rod.name = 'mannequin-stand';
  return rod;
}

