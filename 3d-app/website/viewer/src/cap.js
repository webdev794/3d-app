import * as THREE from 'three';

// The team cap (garment 4, 2026-10-29). Its own builder, kept apart from garment.js so a professional model can
// replace it: buildCap() returns the same object buildGarment() does (geometry with uv and shade colours, the flat
// print frame and outline, at / surface), plus `form` (the display head under it, look 2) and `display` (shown a
// little larger than life, so it fills the stage as the other garments do).
//
// A structured five-panel cap (as the tile pictures): one wide front panel, two side and two back panels, meeting at the button, with piping along their seams; a pre-curved
// brim in front. Its print: the crown cut open down both sides (front half and back half, x round the band as on a
// top: +x the wearer's left on both, y up the panels from the band at CAP_BAND), the brim's top below the front half and
// its underside below the back half (y from 0 at its edge up to the band: the kit's patterns, drawn from y 0 up, cover it).

/** Shown at this size (main.js scales the part). */
export const CAP_DISPLAY = 1.6;
const FLOOR = -0.0662 / CAP_DISPLAY;   // the podium's top (studio.js), in the part's own metres
const BAND_Y = FLOOR + 0.27;           // the band's height on the display head
const A = 0.0905, B = 0.104;           // the band's half-widths: side to side, front to back (size 7 3/8)
const H = 0.128;                       // the crown's height
export const BRIM_ARC = 0.112;                // the brim runs this far round the band either side of the middle
export const BRIM_DEPTH = 0.082;              // and comes this far forward
const BRIM_T = 0.0032;                 // its thickness
export const BRIM_GAP = 0.004;                // on the print: the brim starts this far under the crown's band
/** The band's height on the print (the brim below it, from its edge at about 0). */
export const CAP_BAND = BRIM_GAP + BRIM_DEPTH + 0.004;

const ramp = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// The band's arc length from the centre front (φ 0, +x the wearer's left) round to φ, tabulated for both ways.
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
export const CAP_C = arcTab[TAB];
const arc = (f) => { const i = THREE.MathUtils.clamp((f / (2 * Math.PI)) * TAB, 0, TAB), k = Math.floor(i); return k >= TAB ? arcTab[TAB] : arcTab[k] + (arcTab[k + 1] - arcTab[k]) * (i - k); };
/** φ at an arc length s round the band from the centre front (0 to the girth). */
function phiAt(s) {
  s = ((s % CAP_C) + CAP_C) % CAP_C;
  let lo = 0, hi = TAB;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arcTab[m] < s) lo = m; else hi = m; }
  const t = arcTab[hi] > arcTab[lo] ? (s - arcTab[lo]) / (arcTab[hi] - arcTab[lo]) : 0;
  return ((lo + t) / TAB) * 2 * Math.PI;
}
/** The panels' seams, as arc round the band from the centre front: the wide front panel's sides (a sixth of the girth
 *  either side, where the brim ends), the side panels' backs (a third), the centre back (a half). */
export const CAP_SEAM_ARCS = [CAP_C / 6, CAP_C / 3, CAP_C / 2];
/** The seams on one half of the print (x). */
export const capSeams = (back) => (back ? [CAP_C / 6, -CAP_C / 6, 0] : [CAP_C / 6, -CAP_C / 6]);
/** Where s (arc from the centre front) is in its panel: its distance to the nearer seam, and the panel's width. */
function inPanel(s) {
  const a = Math.min(((s % CAP_C) + CAP_C) % CAP_C, CAP_C - (((s % CAP_C) + CAP_C) % CAP_C));
  const [s1, s2, s3] = CAP_SEAM_ARCS;
  if (a < s1) return { edge: s1 - a, width: 2 * s1 };
  if (a < s2) return { edge: Math.min(a - s1, s2 - a), width: s2 - s1 };
  return { edge: Math.min(a - s2, s3 - a), width: s3 - s2 };
}

/** The crown's profile at t (0 the band, 1 the button): how far out (of the band) and how high; the front panels
 *  stand up straighter (structured), the back rounds over. */
function profile(t, f) {
  const a = (t * Math.PI) / 2, front = Math.max(0, Math.cos(f)) ** 2;
  return { r: Math.cos(a) ** (0.85 - 0.3 * front), h: H * Math.sin(a) ** 0.85 };
}

// The crown's print runs up its panels by length (so a crest keeps its shape): t at a fraction v of the way up, from
// the profile's lengths tabulated for the front's upright cut through to the back's rounder one.
const VT = (() => {
  const R = (A + B) / 2, N = 400, tabs = [];
  for (const w of [0, 0.25, 0.5, 0.75, 1]) {
    const p = 0.85 - 0.3 * w, cum = [0];
    let prev = [R, 0];
    for (let i = 1; i <= N; i++) {
      const a = ((i / N) * Math.PI) / 2, q = [R * Math.cos(a) ** p, H * Math.sin(a) ** 0.85];
      cum.push(cum[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1]));
      prev = q;
    }
    tabs.push(cum.map((c) => c / cum[N]));
  }
  return tabs;
})();
function tOfV(v, f) {
  v = THREE.MathUtils.clamp(v, 0, 1);
  const at = (tab) => {
    let lo = 0, hi = tab.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m] < v) lo = m; else hi = m; }
    return (lo + (tab[hi] > tab[lo] ? (v - tab[lo]) / (tab[hi] - tab[lo]) : 0)) / (tab.length - 1);
  };
  const w = Math.max(0, Math.cos(f)) ** 2 * 4, k = Math.min(3, Math.floor(w)), m = w - k;
  return at(VT[k]) * (1 - m) + at(VT[k + 1]) * m;
}
/** The crown's point at (arc s round the band, v of the way up it by length). */
const crownByLength = (s, v) => crownAt(s, tOfV(v, phiAt(s)));

/** The crown's point at (arc s round the band, t up it). `form`: the plain shell (for the head under it). */
function crownAt(s, t, form = false) {
  const f = phiAt(s), { r, h } = profile(t, f);
  const sin = Math.sin(f), cos = Math.cos(f);
  const n = new THREE.Vector2(sin / A, cos / B).normalize();
  let d = 0;
  if (!form) {
    // Each panel puffs out a little between its seams; the piping stands proud along them.
    const { edge: e0, width } = inPanel(s), edge = e0 * r;
    const fade = Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.6;
    d = 0.0034 * Math.sin((Math.PI * e0) / width) ** 0.8 * fade + 0.0011 * Math.exp(-((edge / 0.0017) ** 2)) * ramp(0.99, 0.9, t);
    // Soft wrinkles: a few shallow ripples across each panel, fullest low on the crown and fading out at the seams.
    const along = Math.sin((Math.PI * e0) / width) * ramp(0.02, 0.12, t) * ramp(0.95, 0.6, t);
    d += along * (0.00045 * Math.sin(s * 97 + t * 7.3) * Math.sin(t * 19 + s * 23) + 0.0003 * Math.sin(s * 211 - t * 31));
    // The band's top-stitched edge sits in a touch.
    d -= 0.0006 * ramp(0.06, 0.0, t);
  }
  const a = (t * Math.PI) / 2, lean = -0.012 * (h / H) ** 2;
  // The band dips at the back (a cap sits lower over the back of the head).
  const dip = -0.016 * ((1 - cos) / 2) ** 1.5 * (1 - t);
  return new THREE.Vector3(A * sin * r + n.x * d * Math.cos(a), BAND_Y + h + dip + d * Math.sin(a), B * cos * r + n.y * d * Math.cos(a) + lean);
}

/** The eyelets (air holes): one high on each side and back panel and two on the wide front one, as the tile pictures. Print x on its half, v of the
 *  way up the crown (capprint.js paints their stitched ring there; buildCap sets a metal grommet on each). */
export const CAP_EYELETS = (() => [
  // (The wide front panel has one each side of the crest, high and near its seams, as on the pictures.)
  ...[-1, 1].map((k) => ({ back: false, x: k * (CAP_C / 6 - 0.028), v: 0.72 })),
  ...[-1, 1].map((k) => ({ back: false, x: k * (CAP_C / 4 - 0.012), v: 0.7 })),
  ...[-1, 1].map((k) => ({ back: true, x: k * (CAP_C / 12), v: 0.7 })),
])();

/** The crown's height on the print (its panels' length from the band to the button, front and back averaged). */
const LM = (() => {
  let total = 0;
  for (const s of [0, CAP_C / 2]) { let p = crownAt(s, 0, true); for (let i = 1; i <= 200; i++) { const q = crownAt(s, i / 200, true); total += q.distanceTo(p); p = q; } }
  return total / 2;
})();
export const CAP_TOP = LM;

/** The brim at (u -1..1 across, w 0 at the band .. 1 at its edge), its middle surface. */
function brimMid(u, w) {
  const s = u * BRIM_ARC, f = phiAt(s);
  const base = new THREE.Vector3(A * Math.sin(f), 0, B * Math.cos(f));
  const n = new THREE.Vector3(Math.sin(f) / A, 0, Math.cos(f) / B).normalize();
  const dir = n.clone().lerp(new THREE.Vector3(0, 0, 1), 0.55).normalize();
  const depth = brimDepth(u);
  // Tucked a few millimetres up under the crown's band; angled down, its sides curved down (pre-curved).
  const out = base.addScaledVector(n, -0.003).addScaledVector(dir, (depth + 0.003) * w);
  // (Its inner edge follows the band, which dips a little towards the back.)
  const dip = -0.016 * ((1 - Math.cos(f)) / 2) ** 1.5;
  // (FN2 2026-10-30: curved as the pictures: the sides bend well down, and the whole brim arches down a little to its edge.)
  out.y = BAND_Y + dip + 0.0012 - w * depth * 0.3 - 1.7 * u * u * w * depth - 0.006 * w * w;
  return out;
}
function brimDepth(u) { return BRIM_DEPTH * Math.max(0, 1 - u * u) ** 0.5; }
/** The brim's print point (the top's on the front half; the underside's the same x and y on the back half). */
const brimFlat = (u, w) => [u * BRIM_ARC, CAP_BAND - BRIM_GAP - w * brimDepth(u)];

/** Surface normal by finite differences of `fn(a, b)` (pointing the way `out(p, n)` says). */
function normalOf(fn, a, b, da, db, out) {
  const p = fn(a, b), n = fn(a + da, b).sub(fn(a - da, b)).cross(fn(a, b + db).sub(fn(a, b - db)));
  if (!Number.isFinite(n.x) || n.lengthSq() < 1e-14) return { p, n: out(p, null) };
  n.normalize();
  if (out(p, n) < 0) n.negate();
  return { p, n };
}

/** Builds the cap. Returns what buildGarment does (main.js treats it as a garment), with `form(material)`. */
export function buildCap({ detail = false } = {}) {
  const half = (CAP_C / 4) * 1.04;
  const minX = -half - 0.006, maxX = half + 0.006, minY = -0.004, maxY = CAP_BAND + LM + 0.012;
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

  // The crown: both halves, rows up from the band (closer near it and the button).
  const T = 64, M = 120;
  const outward = (p, n) => {
    const axis = new THREE.Vector3(0, p.y, -0.012 * ((p.y - BAND_Y) / H) ** 2);
    if (!n) return p.distanceTo(axis) < 0.004 ? new THREE.Vector3(0, 1, 0) : p.clone().sub(axis).normalize();
    return n.dot(p.clone().sub(axis)) + 0.2 * n.y;
  };
  for (const back of [false, true]) {
    grid(T, M, (i, j) => {
      const v = i / T, x = -CAP_C / 4 + (j / M) * (CAP_C / 2);
      const s = back ? CAP_C / 2 - x : x, t = tOfV(v, phiAt(s));
      const { p, n } = normalOf(crownByLength, s, v, 0.0008, 0.002, outward);
      const y = CAP_BAND + v * LM;
      // Baked shade: the seams' valleys beside the piping, the band in the brim's shadow at the front.
      const { edge } = inPanel(s);
      const valley = Math.exp(-(((edge - 0.0035) / 0.0018) ** 2)) * 0.1 * ramp(0.95, 0.8, t);
      const brimShade = back ? 0 : 0.18 * ramp(0.12, 0, t) * ramp(BRIM_ARC + 0.02, BRIM_ARC - 0.03, Math.abs(x));
      push(p, n, back ? uvBack(x, y) : uvFront(x, y), THREE.MathUtils.clamp(1 - valley - brimShade, 0.6, 1.05));
    });
  }

  // The brim: its top (printed below the crown's front), its underside (below the back) and the piped edge round it.
  const U = 72, W = 24;
  const brimAt = (top) => (u, w) => { const p = brimMid(u, w); p.y += top ? BRIM_T / 2 : -BRIM_T / 2; return p; };
  for (const top of [true, false]) {
    grid(W, U, (i, j) => {
      const u = -1 + (2 * j) / U, w = i / W, uu = THREE.MathUtils.clamp(u, -0.999, 0.999);
      const { p, n } = normalOf(brimAt(top), uu, w, 0.002, 0.004, (q, nn) => (nn ? (top ? nn.y : -nn.y) : new THREE.Vector3(0, top ? 1 : -1, 0)));
      const [x, y] = brimFlat(uu, w);
      // The underside in shade, darker towards the band.
      const c = top ? 1 - 0.08 * ramp(0.15, 0, w) : 0.72 + 0.12 * w;
      push(p, n, top ? uvFront(x, y) : uvBack(-x, y), c);
    }, !top);
  }
  // The edge: from the top's edge over to the underside's, printed in the piping band.
  grid(4, U, (i, j) => {
    const u = THREE.MathUtils.clamp(-1 + (2 * j) / U, -0.999, 0.999), k = i / 4;
    const mid = brimMid(u, 1), inner = brimMid(u, 0.97);
    const out = mid.clone().sub(inner).setY(0).normalize();
    const a = Math.PI * (0.5 - k);
    const p = mid.clone().addScaledVector(out, 0.0012 * Math.cos(a)).add(new THREE.Vector3(0, (BRIM_T / 2) * Math.sin(a), 0));
    const n = out.clone().multiplyScalar(Math.cos(a)).add(new THREE.Vector3(0, Math.sin(a), 0)).normalize();
    const [x, y] = brimFlat(u, 1);
    push(p, n, uvFront(x, y + 0.0015), 0.95);
  });

  // The button on top: a small covered dome, printed as the crown's top.
  const top = crownAt(0, 1, false);
  grid(6, 24, (i, j) => {
    const a = (i / 6) * (Math.PI / 2), b = (j / 24) * 2 * Math.PI;
    const n = new THREE.Vector3(Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b));
    const p = top.clone().add(new THREE.Vector3(n.x * 0.0075, -0.001 + n.y * 0.0055, n.z * 0.0075));
    push(p, n, uvFront(0, CAP_BAND + LM - 0.004), 0.92 + 0.08 * Math.sin(a));
  }, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  orient(geometry);
  geometry.computeBoundingBox();

  // The print's outline: the whole crown half and the brim under it (a rectangle; the seams' piping runs on past
  // the halves' edges a little, so no hairline shows there).
  const outline = [new THREE.Vector2(-half - 0.004, maxY), new THREE.Vector2(half + 0.004, maxY), new THREE.Vector2(half + 0.004, minY), new THREE.Vector2(-half - 0.004, minY)];
  const flatTo3D = (x, y, back) => {
    if (y < CAP_BAND) {
      const u = THREE.MathUtils.clamp((back ? -x : x) / BRIM_ARC, -0.999, 0.999), w = THREE.MathUtils.clamp((CAP_BAND - y - BRIM_GAP) / Math.max(1e-4, brimDepth(u)), 0, 1);
      return brimAt(!back)(u, w);
    }
    return crownByLength(back ? CAP_C / 2 - x : x, (y - CAP_BAND) / LM);
  };
  const neck = Array.from({ length: 48 }, (_, j) => crownAt((j / 48) * CAP_C, 0, true));
  return {
    kind: 'cap',
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
    cap: true,
    display: CAP_DISPLAY,
    at: flatTo3D,
    surface: flatTo3D,
    /** The eyelets' metal grommets (main.js adds them to the cap's group; never picked). */
    trims: buildEyelets(),
    /** Look 2: the display head under the cap (in `material`, the mannequin's). */
    form: (material) => buildHeadForm(material),
  };
}

let eyeletParts = null;
/**
 * The eyelets: on each a metal grommet (a rolled ring, shiny) round a dark hole, set on the panel facing out along
 * its surface. Shared geometry and materials (made once).
 */
function buildEyelets() {
  eyeletParts ??= (() => {
    // The grommet's ring: its profile (across the ring, out from the hole) swept round; rolled over, about 10 mm across.
    const prof = [];
    for (let i = 0; i <= 12; i++) { const a = Math.PI * (i / 12); prof.push(new THREE.Vector2(0.0023 + 0.00135 * (1 - Math.cos(a)), 0.0007 * Math.sin(a) + 0.0001)); }
    prof.unshift(new THREE.Vector2(0.0023, -0.0006));
    prof.push(new THREE.Vector2(0.0052, -0.0003));
    const ring = new THREE.LatheGeometry(prof, 32).rotateX(Math.PI / 2);
    // The hole: a short dark tube into the crown and its bottom.
    const hole = new THREE.CylinderGeometry(0.0023, 0.0023, 0.002, 24, 1, false).rotateX(Math.PI / 2).translate(0, 0, -0.0008);
    // (A little light of its own, so the ring reads as polished metal even where the stage behind it is dark.)
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.6, roughness: 0.35, envMapIntensity: 1.6, emissive: 0x4a4f56 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 1, side: THREE.DoubleSide });
    return { ring, hole, metal, dark };
  })();
  const { ring, hole, metal, dark } = eyeletParts;
  const group = new THREE.Group();
  group.name = 'eyelets';
  const outward = (p) => new THREE.Vector3(p.x, 0, p.z + 0.012 * ((p.y - BAND_Y) / H) ** 2).normalize().lerp(new THREE.Vector3(0, 1, 0), 0.5 * Math.max(0, (p.y - BAND_Y) / H) ** 3);
  for (const { back, x, v } of CAP_EYELETS) {
    const s = back ? CAP_C / 2 - x : x;
    const { p, n } = normalOf(crownByLength, s, v, 0.0008, 0.002, (q, nn) => (nn ? nn.dot(outward(q)) : outward(q)));
    for (const [geometry, material] of [[ring, metal], [hole, dark]]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.setScalar(1.3);   // (FN2: as big as the pictures' eyelets)
      mesh.position.copy(p).addScaledVector(n, 0.0007);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      mesh.castShadow = material === metal;
      mesh.raycast = () => {};   // never picked: a tap goes to the fabric round it
      group.add(mesh);
    }
  }
  return group;
}

/** Faces outwards: flips the winding where it disagrees with the normals given. */
function orient(g) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), ix = g.index.array;
  const A3 = new THREE.Vector3(), B3 = new THREE.Vector3(), C3 = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i < ix.length; i += 3) {
    A3.fromBufferAttribute(p, ix[i]); B3.fromBufferAttribute(p, ix[i + 1]); C3.fromBufferAttribute(p, ix[i + 2]);
    const face = B3.clone().sub(A3).cross(C3.clone().sub(A3));
    N.fromBufferAttribute(n, ix[i]).add(new THREE.Vector3().fromBufferAttribute(n, ix[i + 1])).add(new THREE.Vector3().fromBufferAttribute(n, ix[i + 2]));
    if (face.dot(N) < 0) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  g.index.needsUpdate = true;
}

/**
 * The display head (look 2): a smooth hat form a few millimetres inside the crown (the structured front stands off
 * it, as a cap does), on to the jaw, a neck and a round foot on the podium. In the mannequin's material, with its
 * occlusion: dark under the crown, lit below the band.
 */
function buildHeadForm(material) {
  const group = new THREE.Group();
  group.name = 'mannequin';
  const K = 64, rows = [], occ = [];
  const ring = (fn) => Array.from({ length: K }, (_, j) => fn((j / K) * CAP_C));
  // Under the crown: its shell pulled in 4 mm and its height brought down to 82 %.
  for (let i = 15; i >= 0; i--) {
    const t = i / 15;
    rows.push(ring((s) => {
      const p = crownAt(s, Math.min(0.995, t), true), axis = new THREE.Vector3(0, p.y, -0.012 * ((p.y - BAND_Y) / H) ** 2);
      const out = p.clone().sub(axis), L = out.length();
      const q = L > 0.006 ? axis.addScaledVector(out, (L - 0.0045) / L) : axis;
      q.y = BAND_Y + (q.y - BAND_Y) * 0.82;
      return q;
    }));
    occ.push(0.3);
  }
  // Below the band: the head, jaw, neck and foot (fractions of the band's half-widths).
  const below = [[-0.008, 0.955, 0.6], [-0.035, 0.95, 1], [-0.075, 0.9, 1], [-0.105, 0.78, 1], [-0.13, 0.6, 1], [-0.15, 0.5, 1], [-0.2, 0.47, 1], [-0.245, 0.52, 1], [-0.252, 0.78, 1], [-0.269, 0.8, 0.8]];
  for (const [dy, k] of below) {
    rows.push(ring((s) => { const f = phiAt(s); return new THREE.Vector3(A * k * Math.sin(f), BAND_Y + dy, B * k * Math.cos(f) * (k < 0.6 ? 0.88 : 1)); }));
  }
  below.forEach(([, , o]) => occ.push(o));
  const pos = [], o = [], idx = [];
  rows.forEach((row, r) => row.forEach((p) => { pos.push(p.x, p.y, p.z); o.push(occ[r]); }));
  for (let r = 0; r < rows.length - 1; r++) for (let j = 0; j < K; j++) {
    const a = r * K + j, b = r * K + ((j + 1) % K), c = a + K, d = b + K;
    idx.push(a, c, b, b, c, d);
  }
  // The top's point and the foot's flat bottom.
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
  // Outwards: check one point on the side of the head.
  const n = g.getAttribute('normal'), i = 17 * K + K / 4;
  if (pos[i * 3] * n.getX(i) < 0) {
    const ix = g.index.array;
    for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; }
    g.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
