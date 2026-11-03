import * as THREE from 'three';

// The beanie (CP1 2026-11-02, the client's HEADWEAR mockup images/296.jpg). Its own builder, kept apart from garment.js
// as the cap's and the bucket hat's: buildBeanie() returns the same object buildGarment() does (geometry with uv and
// shade colours, the flat print frame and outline, at / surface), plus `form` (the display head under it) and `display`.
//
// A rib-knit beanie: a soft dome over the head, a folded cuff round its foot standing a little proud, and a pom-pom on
// top. Its print, in garment metres (+x the wearer's left on both halves):
//   front half: the cuff (y 0 at its foot up to BEANIE_CUFF), the crown's front above it (from BEANIE_CROWN up
//     BEANIE_CROWN_LEN to the top), then the pom-pom (the whole ball, round it across, from its foot up);
//   back half: the cuff's back and the crown's back.

/** Shown at this size (main.js scales the part, as the cap and the bucket hat). */
export const BEANIE_DISPLAY = 1.6;
const FLOOR = -0.0662 / BEANIE_DISPLAY;  // the podium's top (studio.js), in the part's own metres
const HEAD_Y = FLOOR + 0.27;             // the display head's band line (as under the cap)
const A = 0.0905 * 1.18, B = 0.104 * 1.12; // (FN13, DT11: wider)             // the head band's half-widths: side to side, front to back
const LOOSE = 0.0055;                    // the knit sits this far off the head
const FOOT_Y = HEAD_Y - 0.042;           // the cuff's foot, low over the ears
/** The cuff's height and how far it stands proud of the crown. */
const CUFF_H = 0.072, PROUD = 0.0032;
const CROWN_H = 0.135; // (FN13, DT11: h/w 1.35)
// was 0.165;  // (FN11, DT10: tall, not a squat dome)                   // the crown above the cuff's top (a little slouch over the head)
const POM_R = 0.058;                     // the pom-pom's radius
/** The print: the cuff from 0 to BEANIE_CUFF; the crown from BEANIE_CROWN up BEANIE_CROWN_LEN; the pom-pom above. */
export const BEANIE_CUFF = CUFF_H + 0.006;

const ramp = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// The band's arc length from the centre front (φ 0, +x the wearer's left) round to φ, tabulated (as the bucket hat).
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
/** The band's girth (print x runs round it). */
export const BEANIE_C = arcTab[TAB];
function phiAt(s) {
  s = ((s % BEANIE_C) + BEANIE_C) % BEANIE_C;
  let lo = 0, hi = TAB;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arcTab[m] < s) lo = m; else hi = m; }
  const t = arcTab[hi] > arcTab[lo] ? (s - arcTab[lo]) / (arcTab[hi] - arcTab[lo]) : 0;
  return ((lo + t) / TAB) * 2 * Math.PI;
}
const ring = (f) => new THREE.Vector2(Math.sin(f) / A, Math.cos(f) / B).normalize();

/** The cuff at (arc s round, v 0 at its foot .. 1 at its folded top): rolled round at both edges. */
function cuffAt(s, v) {
  const f = phiAt(s), n = ring(f);
  // Out from the head: loose, plus the fold's thickness, rounding in at the foot and over the fold at the top.
  // (FN13, DT11: square at the foot; only the folded top rounds over.)
  const round = v < 0.5 ? 0 : 0.0024 * (Math.sqrt(Math.max(0, 1 - ((v - 0.5) / 0.5) ** 8)) - 1);
  const d = LOOSE + PROUD + round + 0.0009 * Math.abs(Math.sin(36 * f));
  // (FN13, DT11: the cuff flares a little to its foot, not curling in.)
  const foot = SHAPE.w * 1;
  return new THREE.Vector3((A * Math.sin(f) + n.x * d) * foot, FOOT_Y + v * CUFF_H, (B * Math.cos(f) + n.y * d) * foot);
}
/** The crown at (arc s round its foot, v 0 at the cuff's top .. 1 at the top): a full dome (a superellipse). */
const Y0 = FOOT_Y + CUFF_H - 0.004;
// (FN13, DT11 on -225: the pom-pom beanie fuller up top and 5% wider; the NFL beanie (no pom-pom) narrower with a
// taller, rounder dome.)
const POM_SHAPE = { exp: 2.3, w: 1.05, h: 1.03, top: 4 }, PLAIN_SHAPE = { exp: 2.2, w: 0.995, h: 1.19 };
let SHAPE = POM_SHAPE;
function crownAt(s, v, plain = false) {
  const f = phiAt(s), n = ring(f), a = (v * Math.PI) / 2;
  // (FN13, DT11 on -233: the pom-pom beanie's crown fuller just under the pom-pom: a squarer curve high up.)
  const e = SHAPE.exp + (SHAPE.top ?? 0) * Math.max(0, Math.min(1, (v - 0.45) / 0.4)), r = Math.cos(a) ** (2 / e), h = Math.sin(a) ** (2 / SHAPE.exp); // (FN13, DT11: domed, was 3.4)
  // Soft knit: slow waves round it, gone towards the top.
  const wave = plain ? 0 : 0.0007 * Math.sin(5 * f + 0.7) * Math.sin(Math.PI * v) * (1 - v);
  // (FN11: clear vertical knit ribs, fading over the top.)
  const rib = plain ? 0 : 0.0011 * Math.abs(Math.sin(36 * f)) * (1 - v) ** 0.6;
  const d = LOOSE + wave + rib;
  return new THREE.Vector3((A * Math.sin(f) + n.x * d) * r * SHAPE.w, Y0 + CROWN_H * SHAPE.h * h, (B * Math.cos(f) + n.y * d) * r * SHAPE.w);
}
const TOP = crownAt(0, 1, true);
const POM_C = new THREE.Vector3(0, TOP.y + POM_R * 0.82, 0);
/** The pom-pom at (longitude u 0..1 round, latitude w 0 at its foot .. 1 at its top): a ball of fluffy yarn. */
function pomAt(u, w, plain = false) {
  const lon = u * 2 * Math.PI, lat = -Math.PI / 2 + w * Math.PI;
  const fluff = plain ? 0 : 0.11 * Math.sin(23 * lon + 7 * lat) * Math.sin(17 * lat + 3 * lon) + 0.06 * Math.sin(41 * lon - 29 * lat);
  const r = POM_R * (1 + fluff * Math.cos(lat) ** 0.3);
  return new THREE.Vector3(r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon)).add(POM_C);
}

/** The crown's length on the print (the cuff's top to the top), front and side averaged. */
const LS = (() => {
  let total = 0;
  for (const s of [0, BEANIE_C / 4]) { let p = crownAt(s, 0, true); for (let i = 1; i <= 120; i++) { const q = crownAt(s, i / 120, true); total += q.distanceTo(p); p = q; } }
  return total / 2;
})();
export const BEANIE_CROWN = BEANIE_CUFF + 0.004;
export const BEANIE_CROWN_LEN = LS;
/** The pom-pom on the print (front half only): from POM0 up POM_LEN, across the whole half. */
export const BEANIE_POM = { y: BEANIE_CROWN + LS + 0.008, h: Math.PI * POM_R };

function normalOf(fn, a, b, da, db, out) {
  const p = fn(a, b), n = fn(a + da, b).sub(fn(a - da, b)).cross(fn(a, b + db).sub(fn(a, b - db)));
  if (!Number.isFinite(n.x) || n.lengthSq() < 1e-16) return { p, n: out(p, null) };
  n.normalize();
  if (out(p, n) < 0) n.negate();
  return { p, n };
}

/** Builds the beanie. Returns what buildGarment does (main.js treats it as a garment), with `form(material)`. */
export function buildBeanie({ detail = false, pom = true } = {}) { // eslint-disable-line no-unused-vars
  SHAPE = pom ? POM_SHAPE : PLAIN_SHAPE;
  const C = BEANIE_C, half = (C / 4) * 1.04;
  const minX = -half - 0.006, maxX = half + 0.006, minY = -0.004, maxY = BEANIE_POM.y + BEANIE_POM.h + 0.008;
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
    const axis = new THREE.Vector3(0, Math.min(p.y, Y0), 0);
    if (!n) return p.distanceTo(axis) < 0.004 ? new THREE.Vector3(0, 1, 0) : p.clone().sub(axis).normalize();
    return n.dot(p.clone().sub(axis));
  };
  const M = 128;
  const col2 = (back, j) => { const x = -C / 4 + (j / M) * (C / 2); return { x, s: back ? C / 2 - x : x }; };
  for (const back of [false, true]) {
    const flat = back ? uvBack : uvFront;
    // The cuff: in the shade of its fold just under the top, and a little at its foot.
    grid(24, M, (i, j) => {
      const v = i / 24, { x, s } = col2(back, j);
      const { p, n } = normalOf((a, b) => cuffAt(a, THREE.MathUtils.clamp(b, 0, 1)), s, v, 0.0008, 0.01, away);
      push(p, n, flat(x, 0.003 + v * CUFF_H), 1 - 0.1 * ramp(0.1, 0, v) - 0.06 * ramp(0.9, 1, v));
    });
    // The crown: darker just above the cuff (in its shadow).
    grid(48, M, (i, j) => {
      const v = i / 48, { x, s } = col2(back, j);
      const { p, n } = normalOf((a, b) => crownAt(a, THREE.MathUtils.clamp(b, 0, 1)), s, Math.min(v, 0.995), 0.0008, 0.004, away);
      push(p, n, flat(x, BEANIE_CROWN + v * LS), 1 - 0.16 * ramp(0.07, 0, v));
    });
  }
  // The pom-pom (on the front half's print, above the crown); the NFL beanie has none.
  if (pom) grid(32, 96, (i, j) => {
    const w = i / 32, u = j / 96;
    const { p, n } = normalOf((a, b) => pomAt(a, THREE.MathUtils.clamp(b, 0.0001, 0.9999)), u, THREE.MathUtils.clamp(w, 0.002, 0.998), 0.002, 0.004, (q, nn) => (nn ? nn.dot(q.clone().sub(POM_C)) : q.clone().sub(POM_C).normalize()));
    push(p, n, uvFront(-C / 4 + u * (C / 2), BEANIE_POM.y + w * BEANIE_POM.h), 0.82 + 0.2 * w);
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
    if (y < BEANIE_CUFF) return cuffAt(s, THREE.MathUtils.clamp((y - 0.003) / CUFF_H, 0, 1));
    if (y < BEANIE_POM.y - 0.004 || back) return crownAt(s, THREE.MathUtils.clamp((y - BEANIE_CROWN) / LS, 0, 1));
    return pomAt(THREE.MathUtils.clamp((x + C / 4) / (C / 2), 0, 1), THREE.MathUtils.clamp((y - BEANIE_POM.y) / BEANIE_POM.h, 0, 1));
  };
  const neck = Array.from({ length: 48 }, (_, j) => cuffAt((j / 48) * C, 0));
  return {
    kind: 'beanie',
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
    display: BEANIE_DISPLAY,
    at: flatTo3D,
    surface: flatTo3D,
    /** Look 2: the display head under the beanie (in `material`, the mannequin's). */
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
 * The display head (look 2), as under the cap and the bucket hat: a smooth form inside the beanie, on to the jaw, a
 * neck and a round foot on the podium. In the mannequin's material, with its occlusion: dark under the beanie, lit below.
 */
function buildHeadForm(material) {
  const group = new THREE.Group();
  group.name = 'mannequin';
  const K = 64, rows = [], occ = [];
  const round = (fn) => Array.from({ length: K }, (_, j) => fn(phiAt((j / K) * BEANIE_C)));
  for (let i = 15; i >= 0; i--) {
    const a = ((i / 15) * Math.PI) / 2, r = Math.cos(a) ** 0.7, h = 0.084 * Math.sin(a);
    rows.push(round((f) => new THREE.Vector3((A - 0.0045) * r * Math.sin(f), HEAD_Y + h, (B - 0.0045) * r * Math.cos(f))));
    occ.push(0.3);
  }
  const below = [[-0.008, 0.955, 0.4], [-0.035, 0.95, 0.7], [-0.075, 0.9, 1], [-0.105, 0.78, 1], [-0.13, 0.6, 1], [-0.15, 0.5, 1], [-0.2, 0.47, 1], [-0.245, 0.52, 1], [-0.252, 0.78, 1], [-0.269, 0.8, 0.8]];
  for (const [dy, f0] of below) rows.push(round((f) => new THREE.Vector3(A * f0 * Math.sin(f), HEAD_Y + dy, B * f0 * Math.cos(f) * (f0 < 0.6 ? 0.88 : 1))));
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
