import * as THREE from 'three';
import { SPECS } from './garment.js';

// The football jersey's ready-made model (Tripo, 2026-11-13; tripomesh.js, data file tripo-football-jersey.js): a raglan
// match shirt with a round crew neck band. It is the jersey of the Rugby League > Jersey tile only (the user: the booklet's
// "Rugby jersey", Yellow Images 15814), chosen by its look's flag design.zoneColors.fbJersey (config/catalog.php rlJersey,
// lib/sports_catalog.dart); every other jersey keeps its own made shape. Printed through the made crew-neck jersey's flat
// pattern (its painter, colour areas, marks and layers), with raglan sleeves up to the neck along the model's own raglan
// seams (zones.js useRaglanJersey) and its neck band in the Neck trim colour (tripomesh.js bands). Every rugby collar is
// made on it: its neck cut in the model (tripomesh.js cutNeck) or the model's own band, and its own pieces: a fold-down
// polo collar or a wing collar (below), buttons (rugbycollars.js on the model's surface).

/** The model's name (tripo-<name>.js). */
export const FB_JERSEY = 'football-jersey';

/** Whether a design is the Football jersey (its look's flag). */
export const isFbJersey = (design) => /^#[0-9a-f]{6}$/i.test(design?.zoneColors?.fbJersey ?? '');

/**
 * The made jersey under the model (its painter and its flat pattern): the Full kit's crew-neck jersey (main.js crewKit),
 * the tee's round neck on the jersey's raglan body. The converter (viewer/tripo-football-jersey.mjs) maps the model onto
 * it, so it must not change without converting the model again.
 */
export const FB_SPEC = { ...SPECS.jersey, half: SPECS.tee.half, neck: SPECS.tee.neck, rim: SPECS.tee.rim, crew: true, crease: 0.45, relief: 0.6 };

/**
 * The Football jersey's look (zoneColors.cuffStripe): its cuffs in the sleeve's own colour, no trim band at their edge.
 * (The picture's thin yellow stripe on the navy cuffs could not be printed cleanly on the model's few, large triangles
 * round its rolled cuffs: it broke into patches. To be made when the model has a finer cuff.)
 */
export const FB_CUFF_STRIPE = null;

/**
 * Where on the flat pattern (front half, garment metres) the jersey's painter puts the neck band's plain colour (the Neck
 * trim colour), which the model's band is printed from (tripomesh.js, the data's `swatch`): outside the outline, high
 * beside the shoulder, so nothing else is printed there.
 */
export const FB_SWATCH = [[0.33, 0.8]];

/**
 * The model's cloth near a place (for a collar piece sewn on it): its nearest points' place and outward normal, averaged
 * over 1.5 cm (its own small folds smoothed out). `geometry`: the model's printed shape (tripomesh.js tripoShape).
 */
function clothNear(geometry) {
  const P = geometry.getAttribute('position').array, N = geometry.getAttribute('normal').array, G = 0.015, grid = new Map();
  for (let i = 0; i < P.length / 3; i++) {
    const k = `${Math.floor(P[i * 3] / G)},${Math.floor(P[i * 3 + 1] / G)},${Math.floor(P[i * 3 + 2] / G)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  return (q) => {
    const at = new THREE.Vector3(), n = new THREE.Vector3();
    let w = 0, best = null, bd = Infinity;
    const [cx, cy, cz] = [q.x, q.y, q.z].map((v) => Math.floor(v / G));
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const i of grid.get(`${cx + a},${cy + b},${cz + c}`) ?? []) {
      const d = Math.hypot(P[i * 3] - q.x, P[i * 3 + 1] - q.y, P[i * 3 + 2] - q.z);
      if (d < bd) { bd = d; best = i; }
      if (d > G) continue;
      const k = 1 - d / G;
      at.x += P[i * 3] * k; at.y += P[i * 3 + 1] * k; at.z += P[i * 3 + 2] * k;
      n.x += N[i * 3] * k; n.y += N[i * 3 + 1] * k; n.z += N[i * 3 + 2] * k;
      w += k;
    }
    if (!w) return best == null ? null : { at: new THREE.Vector3(P[best * 3], P[best * 3 + 1], P[best * 3 + 2]), n: new THREE.Vector3(N[best * 3], N[best * 3 + 1], N[best * 3 + 2]).normalize() };
    return { at: at.divideScalar(w), n: n.normalize() };
  };
}

/** A strip of columns (each a list of points, all as long) as a shape: two-sided cloth, uv along (u) and across (v). */
function stripGeometry(cols) {
  const R = cols[0].length, pos = new Float32Array(cols.length * R * 3), uv = [], idx = [];
  cols.forEach((col, c) => col.forEach((p, r) => { pos.set([p.x, p.y, p.z], (c * R + r) * 3); uv.push(c / (cols.length - 1), r / (R - 1)); }));
  for (let c = 0; c + 1 < cols.length; c++) for (let r = 0; r + 1 < R; r++) { const a = c * R + r, b = a + 1, d = a + R, e = d + 1; idx.push(a, d, b, b, d, e); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The neck opening's loop (`neck`, points round it) evenly every `step` metres, closed. */
function evenLoop(neck, step = 0.006) {
  const curve = new THREE.CatmullRomCurve3(neck.map((p) => p.clone()), true, 'centripetal');
  return curve.getSpacedPoints(Math.max(24, Math.round(curve.getLength() / step))).slice(0, -1);
}

/**
 * A fold-down polo collar on the model (rugby collars RC008, RC009, RC010): sewn on at the foot of the model's neck band
 * (the band left off: tripomesh.js dropBand; `neck` the opening's rim there), a stand rising from it (1.5 cm at the front
 * ends, 2.6 cm at the back), folded over at its top and its fall lying back down over the shoulders, its outer edge kept
 * 3 mm off the cloth all the way (never into it), its front ends spreading into points over the chest. The front stays open
 * `gap` metres either side of the middle (a placket's half width). Returns { group, fold, pipe }.
 */
export function buildModelFoldCollar(tripo, collar, gap = 0.004) {
  const near = clothNear(tripo.geometry), loop = evenLoop(tripo.neck);
  const C = loop.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(loop.length), up = new THREE.Vector3(0, 1, 0);
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  // From the front's middle round the back and on to the other side, without the front's gap.
  const start = loop.reduce((b, p, k) => (p.z > 0 && Math.abs(p.x) < Math.abs(loop[b].x) ? k : b), 0);
  const ring = [...loop.slice(start), ...loop.slice(0, start)].filter((p) => p.z < C.z || Math.abs(p.x) >= gap);
  const cut = ring.findIndex((p, k) => k && p.z > C.z && Math.abs(p.x) < 0.03 && Math.sign(p.x) !== Math.sign(ring[k - 1].x));
  const cols0 = cut > 0 ? [...ring.slice(cut), ...ring.slice(0, cut)] : ring;
  const zFront = Math.max(...loop.map((p) => p.z)), zBack = Math.min(...loop.map((p) => p.z));
  const STAND = 7, FOLD = 4, FALL = 14;
  const lands = cols0.map((p) => {
    const back = smooth(zFront, zBack, p.z), O = new THREE.Vector3(p.x - C.x, 0, p.z - C.z).normalize();
    // How far its fall lies out (4.5 cm at the back, 5.5 cm towards the front points) and down (the points over the chest).
    const front = 1 - back, W = 0.045 + 0.012 * front, drop = 0.018 + 0.03 * front * front;
    const q = near(p.clone().addScaledVector(O, W).addScaledVector(up, -drop));
    return q ? q.at.addScaledVector(q.n, 0.004) : p.clone().addScaledVector(O, W);
  });
  // (Its fall's edge smoothed along, so the model's small folds under it never kink it.)
  const landS = lands.map((_, k) => { const s = new THREE.Vector3(); let m = 0; for (let d = -3; d <= 3; d++) { const q = lands[k + d]; if (q) { s.add(q); m++; } } return s.divideScalar(m); });
  const cols = cols0.map((p, c) => {
    const back = smooth(zFront, zBack, p.z), H = 0.015 + 0.011 * back, O = new THREE.Vector3(p.x - C.x, 0, p.z - C.z).normalize(), col = [];
    for (let k = 0; k < STAND; k++) col.push(p.clone().addScaledVector(O, 0.0015).addScaledVector(up, -0.005 + ((H + 0.005) * k) / (STAND - 1)));
    const top = col.at(-1), L = landS[c];
    const ctrl = top.clone().addScaledVector(O, 0.02).addScaledVector(up, 0.004);
    for (let k = 1; k <= FOLD; k++) { const t = k / (FOLD + 1); col.push(top.clone().addScaledVector(O, 0.004 * Math.sin(Math.PI * t * 0.5)).addScaledVector(up, 0.003 * Math.sin(Math.PI * t))); }
    const first = col.at(-1);
    for (let k = 0; k < FALL; k++) {
      const t = (k + 1) / FALL, u = 1 - t, q = first.clone().multiplyScalar(u * u).addScaledVector(ctrl, 2 * u * t).addScaledVector(L, t * t);
      // (Never into the cloth: at least 3 mm off it.)
      const c2 = near(q);
      if (c2) { const off = q.clone().sub(c2.at).dot(c2.n); if (off < 0.003) q.addScaledVector(c2.n, 0.003 - off); }
      col.push(q);
    }
    return col;
  });
  const fold = new THREE.MeshPhysicalMaterial({ roughness: 0.82, sheen: 0.3, sheenRoughness: 0.6, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.name = 'rugby-collar';
  const mesh = new THREE.Mesh(stripGeometry(cols), fold);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.raycast = () => {};
  group.add(mesh);
  let pipe = null;
  if (collar.piping) {
    pipe = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const edge = cols.map((col) => col.at(-1));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), edge.length * 2, 0.0013, 6, false), pipe);
    tube.raycast = () => {};
    group.add(tube);
  }
  return { group, fold, pipe };
}

/**
 * A wing collar on the model (rugby collar RC004): a stand collar of the cloth along the neck's rim (the model's own band's
 * top round the back, our binding along its V in front), standing straight up at the back and sides (1.8 cm) and, down the
 * V, out of the cloth instead (along its normal, so it never lies over the V's opening), lower towards the V's point
 * (6 mm), its top edge rolled a little outwards. Returns { group, outer, inner } as wingcollar.js's.
 */
export function buildModelWing(tripo) {
  // (The rim without back-tracks: where the band's rim and the V's edge meet, a point that turns back on the way round (a
  // zigzag there) is left out, or the strip would fold up into a flap.)
  let rim = tripo.neck.map((p) => p.clone());
  for (let pass = 0; pass < 4; pass++) rim = rim.filter((p, k) => { const a = rim[(k - 1 + rim.length) % rim.length], b = rim[(k + 1) % rim.length]; return p.clone().sub(a).setY(0).dot(b.clone().sub(p).setY(0)) > 0; });
  const near = clothNear(tripo.geometry), raw = evenLoop(rim);
  // (The rim's heights smoothed along (over 4 cm), so a corner where the band meets the V never throws the collar up in a
  // flap; then level on both sides: each place as high as its mirror image across the middle, the lower of the two.)
  const loop = raw.map((p, k) => { let y = 0; for (let d = -3; d <= 3; d++) y += raw[(k + d + raw.length) % raw.length].y; return p.clone().setY(Math.min(p.y, y / 7)); });
  const up = new THREE.Vector3(0, 1, 0), C = loop.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(loop.length);
  for (const p of loop) { const m = loop.reduce((b, q) => (Math.hypot(q.x + p.x, q.z - p.z) < Math.hypot(b.x + p.x, b.z - p.z) ? q : b), loop[0]); p.y = Math.min(p.y, m.y + 0.002); }
  const ys = loop.map((p) => p.y).sort((a, b) => a - b), minY = ys[0], maxY = ys[Math.floor(ys.length * 0.9)];
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const R = 8;
  const cols = [...loop, loop[0]].map((p) => {
    const k = smooth(minY, maxY - 0.02, p.y), q = near(p), n = q ? q.n.clone().setY(0).normalize() : new THREE.Vector3(p.x - C.x, 0, p.z - C.z).normalize();
    const dir = up.clone().multiplyScalar(k).addScaledVector(n, 1 - k).normalize(), h = 0.006 + 0.01 * k, O = new THREE.Vector3(p.x - C.x, 0, p.z - C.z).normalize();
    const col = [];
    for (let r = 0; r <= R; r++) { const s = r / R; col.push(p.clone().addScaledVector(dir, -0.004 + (h + 0.004) * s).addScaledVector(O, 0.0015 + 0.004 * s * s)); }
    return col;
  });
  // (One cloth, the collar's colour on both sides: a darker inside showed through as a grey band from behind. `inner` is
  // kept for main.js's colouring, unused.)
  const outer = new THREE.MeshPhysicalMaterial({ roughness: 0.85, sheen: 0.25, sheenRoughness: 0.6, side: THREE.DoubleSide });
  const inner = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const g = stripGeometry(cols), group = new THREE.Group();
  group.name = 'wing-collar';
  const mesh = new THREE.Mesh(g, outer);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.raycast = () => {};
  group.add(mesh);
  return { group, outer, inner };
}
