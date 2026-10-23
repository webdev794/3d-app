import * as THREE from 'three';

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
    if (!over) extend(torso, down, 0.05, 0.045, 3);
    roundEnd(torso, down, 0.008);
    add(torso, below(minY));

    // The neck: rising from inside the torso through the neck opening, a little forward at the top, cut level.
    const neck = garment.neck ?? [];
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

    // Upper arms: along each sleeve, from just inside the armhole on past a short sleeve's end.
    for (const sg of [1, -1]) {
      const arm = all.filter((p) => p.l >= 0 && Math.sign(p.x) === sg);
      if (arm.length < 30) continue;
      const lMax = arm.reduce((m, p) => Math.max(m, p.l), 0), bins = [];
      for (let l = 0.035; l <= lMax - 0.004; l += 0.012) {
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
          const in_ = body.long ? Math.max(0.01, 0.8 * rad - 0.01) : Math.max(0.01, rad - 0.006);
          return c.clone().addScaledVector(u, in_ * Math.cos(th)).addScaledVector(v, in_ * Math.sin(th));
        });
      });
      const dir = bins.at(-1).c.clone().sub(bins.at(-3).c).normalize();
      // A short sleeve: the arm ends just past it, rounded off; a long one ends just inside its cuff.
      const inSleeve = rings.length;
      if (!body.long) extend(rings, dir, 0.006, 0.03, 1);
      roundEnd(rings, dir, 0.01);
      // Dark up the sleeve, lighter towards its end, where the opening lets the light in.
      add(rings, (ring, i) => (i < inSleeve - 2 ? INSIDE : i < inSleeve ? 0.5 : body.long ? 0.5 : 0.85));
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

