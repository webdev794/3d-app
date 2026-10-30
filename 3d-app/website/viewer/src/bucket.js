import * as THREE from 'three';

// The bucket hat (garment 5, 2026-10-29). Its own builder, kept apart from garment.js so a professional model can
// replace it: buildBucketHat() returns the same object buildGarment() does (geometry with uv and shade colours, the flat
// print frame and outline, at / surface), plus `form` (the display head under it, look 2) and `display` (shown a
// little larger than life, as the cap).
//
// A soft cotton bucket hat: a crown of soft cloth narrowing a little to a gently domed oval top, and a wide brim all
// round sloping down, its edge bound. Its print, in garment metres (+x the wearer's left on both halves):
//   front half: the brim's top (front; y 0 at its edge up to the band at HAT_BRIM), the crown's front above it (y up
//     its side from HAT_SIDE), the top above that (seen from above, its front edge at the bottom);
//   back half: the brim's top (back), the crown's back, then the brim's underside in two strips (its front half and
//     its back half), each from its edge (bottom) up to the band.

/** Shown at this size (main.js scales the part). */
export const HAT_DISPLAY = 1.6;
const FLOOR = -0.0662 / HAT_DISPLAY;    // the podium's top (studio.js), in the part's own metres
const HEAD_Y = FLOOR + 0.27;            // the display head's band line (as under the cap)
const BAND_Y = HEAD_Y - 0.012;          // a bucket hat sits a little lower on the head
const A = 0.0905, B = 0.104;            // the band's half-widths: side to side, front to back
const CH = 0.088;                       // the crown's height
const TAPER = 0.24;                     // it narrows this much (of the band) to its top
const DOME = 0.008;                     // the top domes up this much
/** The brim's width (out from the band) and its edge's binding on the print. */
export const HAT_BRIM = 0.05;
export const HAT_EDGE = 0.0045;
const BRIM_T = 0.0026;

const ramp = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// The band's arc length from the centre front (φ 0, +x the wearer's left) round to φ, tabulated.
const TAB = 2048;
const arcTab = (() => {
  const out = new Float64Array(TAB + 1);
  let prev = new THREE.Vector2(0, B);
  for (let i = 1; i <= TAB; i++) {
    const f = (i / TAB) * 2 * Math.PI, p = new THREE.Vector2(A * Math.sin(f), B * Math.cos(f));
    out[i] = out[i - 1] + p.distanceTo(prev);
    prev = p;
  }
  return out;
})();
/** The band's girth. */
export const HAT_C = arcTab[TAB];
function phiAt(s) {
  s = ((s % HAT_C) + HAT_C) % HAT_C;
  let lo = 0, hi = TAB;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arcTab[m] < s) lo = m; else hi = m; }
  const t = arcTab[hi] > arcTab[lo] ? (s - arcTab[lo]) / (arcTab[hi] - arcTab[lo]) : 0;
  return ((lo + t) / TAB) * 2 * Math.PI;
}
const k = (v) => 1 - TAPER * v + 0.035 * Math.sin(Math.PI * v);
const A1 = A * k(1), B1 = B * k(1);

/** The crown's side at (arc s round the band, v up it). `plain`: without the cloth's soft waves (the head under it). */
function sideAt(s, v, plain = false) {
  const f = phiAt(s), sin = Math.sin(f), cos = Math.cos(f), n = new THREE.Vector2(sin / A, cos / B).normalize();
  let d = 0;
  if (!plain) {
    // Soft cloth: slow waves round the crown, the seams' rolled edges at its top and at the brim.
    d = (0.0011 * Math.sin(4 * f + 1.3) + 0.0005 * Math.sin(9 * f + 0.4)) * Math.sin(Math.PI * v)
      + 0.0013 * Math.exp(-((((1 - v) * CH) / 0.0035) ** 2)) + 0.0008 * Math.exp(-(((v * CH) / 0.003) ** 2));
  }
  return new THREE.Vector3(A * sin * k(v) + n.x * d, BAND_Y + CH * v, B * cos * k(v) + n.y * d);
}
/** The top at (x, z) across it (inside its oval), gently domed and rounding down into the seam. */
function topAt(x, z) {
  const r2 = Math.min(1, (x / A1) ** 2 + (z / B1) ** 2);
  return new THREE.Vector3(x, BAND_Y + CH + DOME * (1 - r2) - 0.0014 * ramp(0.88, 1, Math.sqrt(r2)) + 0.0013 * Math.exp(-((((1 - Math.sqrt(r2)) * 0.09) / 0.0035) ** 2)), z);
}
/** The brim's middle surface at (arc s round the band, d out from it). */
function brimMid(s, d) {
  const f = phiAt(s), sin = Math.sin(f), cos = Math.cos(f), n = new THREE.Vector2(sin / A, cos / B).normalize();
  const w = d / HAT_BRIM;
  return new THREE.Vector3(A * sin + n.x * (d - 0.002), BAND_Y - 0.95 * d - 2 * d * d + 0.0018 * Math.sin(3 * f + 0.6) * w * w, B * cos + n.y * (d - 0.002));
}

/** The crown side's length on the print (band to top), at the side and at the front averaged. */
const LS = (() => {
  let total = 0;
  for (const s of [0, HAT_C / 4]) { let p = sideAt(s, 0, true); for (let i = 1; i <= 100; i++) { const q = sideAt(s, i / 100, true); total += q.distanceTo(p); p = q; } }
  return total / 2;
})();
/** Where things are on the print: the crown's side from HAT_SIDE up HAT_SIDE_LEN; the top's middle; the underside's strips. */
export const HAT_SIDE = HAT_BRIM + 0.004;
export const HAT_SIDE_LEN = LS;
export const HAT_TOP = { y: HAT_SIDE + LS + 0.006 + B1, a: A1, b: B1 };
export const HAT_UNDER = [HAT_SIDE + LS + 0.006, HAT_SIDE + LS + 0.012 + HAT_BRIM];

function normalOf(fn, a, b, da, db, out) {
  const p = fn(a, b), n = fn(a + da, b).sub(fn(a - da, b)).cross(fn(a, b + db).sub(fn(a, b - db)));
  if (!Number.isFinite(n.x) || n.lengthSq() < 1e-16) return { p, n: out(p, null) };
  n.normalize();
  if (out(p, n) < 0) n.negate();
  return { p, n };
}

/** Builds the hat. Returns what buildGarment does (main.js treats it as a garment), with `form(material)`. */
export function buildBucketHat({ detail = false } = {}) {
  const C = HAT_C, half = (C / 4) * 1.04;
  const minX = -half - 0.006, maxX = half + 0.006, minY = -0.004, maxY = Math.max(HAT_TOP.y + B1, HAT_UNDER[1] + HAT_BRIM) + 0.006;
  const span = Math.max(maxX - minX, maxY - minY) * 1.02;
  const uvFront = (x, y) => [(0.5 * (x - minX)) / span, (y - minY) / span];
  const uvBack = (x, y) => [0.5 + (0.5 * (maxX - x)) / span, (y - minY) / span];
  const pos = [], nrm = [], uv = [], col = [], idx = [];
  const push = (p, n, u, c) => { pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uv.push(...u); col.push(c, c, c); };
  const grid = (rows, cols, at, flip = false) => {
    const base = pos.length / 3;
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) at(i, j);
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = base + i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  };
  const away = (p, n) => {
    const axis = new THREE.Vector3(0, p.y, 0);
    if (!n) return p.distanceTo(axis) < 0.004 ? new THREE.Vector3(0, 1, 0) : p.clone().sub(axis).normalize();
    return n.dot(p.clone().sub(axis));
  };
  const M = 120;
  // Each half's columns: arc s round the band (front: -C/4..C/4; back: C/4..3C/4), and its print x.
  const col2 = (back, j) => { const x = -C / 4 + (j / M) * (C / 2); return { x, s: back ? C / 2 - x : x }; };

  for (const back of [false, true]) {
    const flat = back ? uvBack : uvFront;
    // The crown's side.
    grid(40, M, (i, j) => {
      const v = i / 40, { x, s } = col2(back, j);
      const { p, n } = normalOf((a, b) => sideAt(a, THREE.MathUtils.clamp(b, 0, 1)), s, v, 0.0008, 0.004, away);
      // Baked shade: under the top's seam and down into the brim's join a touch darker.
      const c = 1 - 0.1 * ramp(0.12, 0, v) - 0.05 * ramp(0.9, 1, v);
      push(p, n, flat(x, HAT_SIDE + v * LS), c);
    });
    // The brim's top.
    grid(16, M, (i, j) => {
      const d = (i / 16) * HAT_BRIM, { x, s } = col2(back, j);
      const { p, n } = normalOf((a, b) => brimMid(a, THREE.MathUtils.clamp(b, 0, HAT_BRIM)).add(new THREE.Vector3(0, BRIM_T / 2, 0)), s, d, 0.0008, 0.002, (q, nn) => (nn ? nn.y : new THREE.Vector3(0, 1, 0)));
      push(p, n, flat(x, HAT_BRIM - d), 1 - 0.12 * ramp(0.012, 0, d));
    }, true);
    // The brim's underside (on the back half's strips) and its bound edge (on the binding).
    grid(16, M, (i, j) => {
      const d = (i / 16) * HAT_BRIM, { x, s } = col2(back, j);
      const { p, n } = normalOf((a, b) => brimMid(a, THREE.MathUtils.clamp(b, 0, HAT_BRIM)).add(new THREE.Vector3(0, -BRIM_T / 2, 0)), s, d, 0.0008, 0.002, (q, nn) => (nn ? -nn.y : new THREE.Vector3(0, -1, 0)));
      push(p, n, uvBack(x, HAT_UNDER[back ? 1 : 0] + HAT_BRIM - d), 0.72 + 0.1 * (d / HAT_BRIM));
    });
    grid(4, M, (i, j) => {
      const { x, s } = col2(back, j), a = Math.PI * (0.5 - i / 4);
      const mid = brimMid(s, HAT_BRIM), out = mid.clone().sub(brimMid(s, HAT_BRIM - 0.002)).setY(0).normalize();
      const p = mid.clone().addScaledVector(out, 0.0012 * Math.cos(a)).add(new THREE.Vector3(0, (BRIM_T / 2) * Math.sin(a), 0));
      const n = out.clone().multiplyScalar(Math.cos(a)).add(new THREE.Vector3(0, Math.sin(a), 0)).normalize();
      push(p, n, flat(x, 0.0015), 0.95);
    });
  }
  // The top (on the front half, above the crown's front; its front edge at the bottom).
  grid(24, 96, (i, j) => {
    const r = i / 24, f = phiAt((j / 96) * C), x = A1 * r * Math.sin(f), z = B1 * r * Math.cos(f);
    const p = topAt(x, z), e = 0.0008;
    const n = topAt(x + e, z).sub(topAt(x - e, z)).cross(topAt(x, z - e).sub(topAt(x, z + e)));
    if (!Number.isFinite(n.x) || n.lengthSq() < 1e-16 || n.y < 0) n.set(0, 1, 0);
    push(p, n.normalize(), uvFront(x, HAT_TOP.y - z), 1.02);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  orient(geometry);
  geometry.computeBoundingBox();

  const outline = [new THREE.Vector2(-half - 0.004, maxY), new THREE.Vector2(half + 0.004, maxY), new THREE.Vector2(half + 0.004, minY), new THREE.Vector2(-half - 0.004, minY)];
  const flatTo3D = (x, y, back) => {
    const s = back ? C / 2 - x : x;
    if (y < HAT_BRIM) return brimMid(s, THREE.MathUtils.clamp(HAT_BRIM - y, 0, HAT_BRIM)).add(new THREE.Vector3(0, BRIM_T / 2, 0));
    if (y < HAT_SIDE + LS + 0.003) return sideAt(s, THREE.MathUtils.clamp((y - HAT_SIDE) / LS, 0, 1));
    if (!back) return topAt(THREE.MathUtils.clamp(x, -A1, A1), THREE.MathUtils.clamp(HAT_TOP.y - y, -B1, B1));
    const strip = y < HAT_UNDER[1] ? 0 : 1, d = THREE.MathUtils.clamp(HAT_UNDER[strip] + HAT_BRIM - y, 0, HAT_BRIM);
    return brimMid(strip ? C / 2 - x : x, d).add(new THREE.Vector3(0, -BRIM_T / 2, 0));
  };
  const neck = Array.from({ length: 48 }, (_, j) => sideAt((j / 48) * C, 0, true));
  return {
    kind: 'bucket-hat',
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
    hat: true,
    display: HAT_DISPLAY,
    at: flatTo3D,
    surface: flatTo3D,
    /** Look 2: the display head under the hat (in `material`, the mannequin's). */
    form: (material) => buildHeadForm(material),
  };
}

/** Faces outwards: flips the winding where it disagrees with the normals given. */
function orient(g) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), ix = g.index.array;
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), R = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i < ix.length; i += 3) {
    P.fromBufferAttribute(p, ix[i]); Q.fromBufferAttribute(p, ix[i + 1]); R.fromBufferAttribute(p, ix[i + 2]);
    const face = Q.clone().sub(P).cross(R.clone().sub(P));
    N.fromBufferAttribute(n, ix[i]).add(new THREE.Vector3().fromBufferAttribute(n, ix[i + 1])).add(new THREE.Vector3().fromBufferAttribute(n, ix[i + 2]));
    if (face.dot(N) < 0) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  g.index.needsUpdate = true;
}

/**
 * The display head (look 2), as under the cap: a smooth hat form a few millimetres inside the crown, on to the jaw,
 * a neck and a round foot on the podium. In the mannequin's material, with its occlusion: dark under the hat, lit below.
 */
function buildHeadForm(material) {
  const group = new THREE.Group();
  group.name = 'mannequin';
  const K = 64, rows = [], occ = [];
  const ring = (fn) => Array.from({ length: K }, (_, j) => fn(phiAt((j / K) * HAT_C)));
  // The head's dome from its band line up (4.5 mm in from the band, 8.4 cm high, well inside the crown).
  for (let i = 15; i >= 0; i--) {
    const a = ((i / 15) * Math.PI) / 2, r = Math.cos(a) ** 0.7, h = 0.084 * Math.sin(a);
    rows.push(ring((f) => new THREE.Vector3((A - 0.0045) * r * Math.sin(f), HEAD_Y + h, (B - 0.0045) * r * Math.cos(f))));
    occ.push(0.3);
  }
  // Below the band line: the head, jaw, neck and foot (fractions of the band's half-widths).
  const below = [[-0.008, 0.955, 0.6], [-0.035, 0.95, 1], [-0.075, 0.9, 1], [-0.105, 0.78, 1], [-0.13, 0.6, 1], [-0.15, 0.5, 1], [-0.2, 0.47, 1], [-0.245, 0.52, 1], [-0.252, 0.78, 1], [-0.269, 0.8, 0.8]];
  for (const [dy, f0] of below) rows.push(ring((f) => new THREE.Vector3(A * f0 * Math.sin(f), HEAD_Y + dy, B * f0 * Math.cos(f) * (f0 < 0.6 ? 0.88 : 1))));
  below.forEach(([, , o]) => occ.push(o));
  const pos = [], o = [], idx = [];
  rows.forEach((row, r) => row.forEach((p) => { pos.push(p.x, p.y, p.z); o.push(occ[r]); }));
  for (let r = 0; r < rows.length - 1; r++) for (let j = 0; j < K; j++) {
    const a = r * K + j, b = r * K + ((j + 1) % K), c = a + K, d = b + K;
    idx.push(a, c, b, b, c, d);
  }
  for (const [r, flip] of [[0, true], [rows.length - 1, false]]) {
    const ci = pos.length / 3, m = new THREE.Vector3();
    rows[r].forEach((p) => m.add(p));
    m.divideScalar(K);
    if (r === 0) m.y += 0.001;
    pos.push(m.x, m.y, m.z); o.push(occ[r]);
    for (let j = 0; j < K; j++) { const a = r * K + j, b = r * K + ((j + 1) % K); if (flip) idx.push(ci, a, b); else idx.push(ci, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('occlusion', new THREE.Float32BufferAttribute(o, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.getAttribute('normal'), i = 17 * K + K / 4;
  if (pos[i * 3] * n.getX(i) < 0) {
    const ix = g.index.array;
    for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
    g.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
