import * as THREE from 'three';
import { RECIPE_MODELS } from './recipemodels.js';

/**
 * Ready-made garment models (Tripo, 2026-11-12): a garment's own 3D shape from a model file instead of the shape made
 * here (garment.js), printed exactly as the made garment is. Each lives in its own data file beside index.html,
 * tripo-<name>.js (a plain script, as the apps load the viewer from local files; made by viewer/tripo-convert.mjs),
 * loaded only when that garment is shown. It holds the model's points (placed on the made garment), normals and
 * triangles, and each point's place on the made garment's flat print pattern (garment metres, front or back), so the
 * made garment's atlas (its painter: colour areas, patterns, marks, layers) prints it unchanged; the made garment is
 * still built for its painter, picking, label and 2D panels. Until the file is there (or if it cannot be read), the made
 * shape is shown as before.
 */

const loading = new Map();
/** Every model file still loading (LAZY MODEL LOADING): main.js paintAll waits for them before setDesign answers. */
export const modelsSettled = () => Promise.all([...loading.values()]);
/**
 * A model's data. Since LIVEFIX L1 (2026-11-12) every model is in the viewer page itself (build.mjs puts each
 * tripo-<name>.js inline before the viewer's code), so it is there as soon as the viewer is: no second download that can
 * stall or fail, and the old made shape is never shown in its place (the client refused it). The file beside the page is
 * only read if a page was built without them; resolves null if it cannot be read (main.js then says so, never the old shape).
 */
export function loadTripo(name) {
  const have = window.TRIPO_MESHES?.[name];
  if (have) return Promise.resolve(have);
  if (!loading.has(name)) {
    loading.set(name, new Promise((resolve) => {
      const s = document.createElement('script');
      // (LAZY MODEL LOADING, RUGBYV 2026-11-20: the page's own version on the file, so no old model stays cached.)
      const ver = new URLSearchParams(location.search).get('v');
      s.src = `tripo-${name}.js${ver ? `?v=${encodeURIComponent(ver)}` : ''}`;
      s.onload = () => { if (!window.TRIPO_MESHES?.[name]) loading.delete(name); resolve(window.TRIPO_MESHES?.[name] ?? null); };
      s.onerror = () => { loading.delete(name); s.remove(); resolve(null); };
      document.head.appendChild(s);
    }));
  }
  return loading.get(name);
}

/** Whether a model's data is here (loaded). */
export const tripoReady = (name) => !!window.TRIPO_MESHES?.[name]?.pos;

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

/** The model decoded (once): positions, normals, flat places (garment metres), side (bit 1: on the back half of the
 *  atlas; bit 2: a trim on the cloth, such as a bib tab), shade, triangles. */
const decoded = new Map();
function decode(name) {
  if (decoded.has(name)) return decoded.get(name);
  const D = window.TRIPO_MESHES[name], n = D.count;
  const q = new Uint16Array(bytes(D.pos)), nn = new Int8Array(bytes(D.nor)), f = new Int16Array(bytes(D.flat));
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), flat = new Float32Array(n * 2);
  for (let i = 0; i < n * 3; i++) {
    const c = i % 3;
    pos[i] = D.lo[c] + (q[i] / 65535) * (D.hi[c] - D.lo[c]);
  }
  for (let i = 0; i < n; i++) {
    const x = nn[i * 3], y = nn[i * 3 + 1], z = nn[i * 3 + 2], l = Math.hypot(x, y, z) || 1;
    nor[i * 3] = x / l; nor[i * 3 + 1] = y / l; nor[i * 3 + 2] = z / l;
  }
  for (let i = 0; i < n * 2; i++) flat[i] = f[i] * D.flatUnit;
  const shade = Float32Array.from(new Uint8Array(bytes(D.shade)), (v) => v / 200);
  // (`band`: a model whose bindings are marked per point by its converter (the basketball singlet's: 1 the neck, 2 the
  // armholes, 3 the inside, printed plain), else null: found from its layout's runs (bands).)
  const out = { data: D, count: n, pos, nor, flat, side: new Uint8Array(bytes(D.side)), shade, idx: new Uint16Array(bytes(D.idx)), band: D.band ? new Uint8Array(bytes(D.band)) : null, across: D.across ? new Uint8Array(bytes(D.across)) : null };
  decoded.set(name, out);
  return out;
}

/**
 * The netball dress's V-neck (Garment style › Neck style, user 2026-11-13): the model exactly as it is, only its front
 * neck cut to a V and our own binding sewn along it (cutNeck). Seen from the front (the model's x and y, metres), the V
 * runs straight from its point, `tip` high (4.5 cm under the round neck's foot, clear of the chest logo), up each side to
 * where it meets the model's own neck edge (the line from the point that touches that edge); from there up the model's
 * own neck and binding go on. Our binding: `width` wide along the cloth (where it meets the model's own, as wide as
 * that), its top edge rolled over (`roll`, its radius), standing `lift` off the cloth (metres).
 */
export const DRESS_V = { tip: 0.712, width: 0.0095, roll: 0.0012, lift: 0.0009 };
/** The netball bib's V-neck (NBBIB 2026-11-13; its own neck is round): as the dress's, its point `tip` high. */
// (`pieces`: the model's piece colours kept on the cut shape (MODELQ6 2026-11-18); our band along the V as wide as the
// model's own rolled border it joins at the shoulders (was 9 mm, as the old wider printed border).)
export const BIB_V = { tip: 0.6, width: 0.005, roll: 0.0014, lift: 0.0009, key: 'v', wrap: 0.014, over: 0.006, pieces: true };

/**
 * The football jersey's V-necks (fbjersey.js, 2026-11-13), as the dress's: its point `depth` metres down the flat pattern
 * under the neck's shoulder point (the made jersey's: its own V 6.6 cm, Garment style's V-neck 10 cm, the shallow V 5 cm),
 * found on the model where its print has that place (tripoTip); our binding as wide as its own band in front. `trims`:
 * the model's strips on the cloth (its raglan piping) are cut with it.
 */
export const JERSEY_V = { own: 0.066, v: 0.1, shallow: 0.05 };
const JERSEY_CUT = { width: 0.011, roll: 0.0014, lift: 0.0009, trims: true };

/**
 * The model's height (its own y, metres) at the middle of its front where its print's place is `y` on the flat pattern
 * (garment metres, x 0): the points of its front within 1.5 cm of the middle on the pattern, nearest that height.
 */
function tripoTip(M, y) {
  let best = null;
  for (let i = 0; i < M.count; i++) {
    if (M.side[i] & 1 || Math.abs(M.flat[i * 2]) > 0.015 || M.pos[i * 3 + 2] <= 0) continue;
    const d = Math.abs(M.flat[i * 2 + 1] - y) + Math.abs(M.flat[i * 2]) * 0.2;
    if (!best || d < best.d) best = { d, y: M.pos[i * 3 + 1] + (y - M.flat[i * 2 + 1]) * 1 };
  }
  return best?.y ?? null;
}

/** A model's V-neck settings for a neck ('v', 'shallow' or, the jersey's own, 'own'): the dress's DRESS_V; else its
 *  point found from the pattern (JERSEY_V), or null. */
function vOf(name, neck) {
  // (A recipe model's other necks (viewer/models/<name>.json `necks`): a V cut `depth` down the pattern under the neck's
  // shoulder point, found on the model as the football jersey's; our binding `width` wide.)
  const own = RECIPE_MODELS[name]?.necks?.[neck];
  if (own) {
    if (!window.TRIPO_MESHES?.[name]) return null;
    const tip = tripoTip(decode(name), 0.738 - own.depth);
    // (A model split into pieces (the tee, tripo-hoodie.mjs): its pieces carried onto the cut shape, as the netball bib's.)
    return tip == null ? null : { width: own.width ?? 0.011, roll: 0.0014, lift: 0.0009, trims: false, tip, key: neck, ...(own.endOff != null ? { endOff: own.endOff } : {}), ...(decode(name).data.piece ? { pieces: true } : {}) };
  }
  if (name === 'netball-dress') return neck === 'v' || neck === 'shallow' ? DRESS_V : null;
  // (The soccer jersey, SCJERSEY: its V-neck is its own V; its round neck and shallow V are filled in: fillNeck.)
  // (The netball bib's V (user 2026-11-16): the cloth inside the V is only not drawn (the model's data untouched), our
  // yellow band laid along the V edge, joining its round border at the shoulders.)
  if (name === 'netball-bib') return neck === 'v' || neck === 'shallow' ? BIB_V : null;
  if (name !== 'football-jersey') return null;
  const depth = JERSEY_V[neck];
  if (!depth || !window.TRIPO_MESHES?.[name]) return null;
  const M = decode(name), tip = tripoTip(M, 0.738 - depth);
  return tip == null ? null : { ...JERSEY_CUT, tip, key: neck };
}


/**
 * The model with its front neck cut to the V (DRESS_V), made once: decode's fields for the cut shape, plus `collar` (our
 * binding along the V: { pos, idx, shade }) and `vEdge` (the V's edge, points from the wearer's right to left, x
 * rising). Every front triangle the V crosses is cut along it, so the cloth's new edge follows the V on the model's own
 * surface, and those inside it are dropped; the model's own binding is cut off straight across its band where the V meets
 * it, so ours goes on from there.
 */
function cutNeck(name, V = DRESS_V) {
  const cacheKey = `${name}:v${V === DRESS_V ? '' : `:${V.key}`}`;
  if (decoded.has(cacheKey)) return decoded.get(cacheKey);
  const M = decode(name), { tip, width, roll, lift } = V;
  // Each side's line (0 the wearer's right, x < 0; 1 the left): from the point, touching the model's neck edge (the
  // file's rim points round it, straight between them), so it meets that edge at one place, `x` out from the middle.
  const rim = M.data.neck, line = [null, null];
  for (let k = 0; k < rim.length; k++) {
    const a = rim[k], b = rim[(k + 1) % rim.length];
    if (a[2] <= 0 || b[2] <= 0) continue;
    for (let j = 0; j <= 20; j++) {
      const x = a[0] + ((b[0] - a[0]) * j) / 20, y = a[1] + ((b[1] - a[1]) * j) / 20;
      if (Math.abs(x) < 0.01) continue;
      const s = (y - tip) / Math.abs(x), w = x < 0 ? 0 : 1;
      if (!line[w] || s < line[w].s) line[w] = { s, x: Math.abs(x) };
    }
  }
  if (!line[0] || !line[1]) return null;
  const sideOf = (x) => (x < 0 ? 0 : 1);
  // The V's height at x.
  const L = (x) => tip + line[sideOf(x)].s * Math.abs(x);
  // Where each side meets the model's edge (J), the way up the V there (up) and across the band, into the cloth (into).
  const J = line.map((S, w) => [w ? S.x : -S.x, tip + S.s * S.x]);
  const up = line.map((S, w) => { const l = Math.hypot(1, S.s); return [(w ? 1 : -1) / l, S.s / l]; });
  const into = line.map((S, w) => { const l = Math.hypot(1, S.s); return [(w ? 1 : -1) * S.s / l, -1 / l]; });
  // The model's own neck binding: its triangles (bands: all their points on the neck's band).
  const own = bandsOf(M) ?? new Uint8Array(M.count);
  const pos = Array.from(M.pos), nor = Array.from(M.nor), flat = Array.from(M.flat), side = Array.from(M.side), shade = Array.from(M.shade);
  // (Where each new point and each triangle came from (V.pieces, MODELQ6 2026-11-18): the model's piece colours carried on
  // onto the cut shape, tripoShape.)
  const srcPt = [];
  const reach = Math.max(line[0].x, line[1].x) + 0.03;
  // The triangles the V may cross: in front of the middle (also the binding's rolled edge, printed from the back half of
  // the pattern), not a trim, near the neck. (Each triangle's corners are on one half of the pattern: the converter's
  // seam copies.)
  let tris = [];
  for (let t = 0; t < M.idx.length; t += 3) {
    const c = [M.idx[t], M.idx[t + 1], M.idx[t + 2]];
    const near = c.every((v) => (V.trims || !(side[v] & 2)) && pos[v * 3 + 2] > 0) && c.some((v) => pos[v * 3 + 1] > tip - 0.05 && Math.abs(pos[v * 3]) < reach);
    tris.push({ c, near, binding: near && c.every((v) => own[v] === 1), src: t / 3 });
  }
  // A new point where `value` is 0 on the edge a-b (the same point for both triangles on it).
  const point = (a, b, va, vb) => {
    const t = va / (va - vb), i = pos.length / 3;
    for (let k = 0; k < 3; k++) pos.push(pos[a * 3 + k] + (pos[b * 3 + k] - pos[a * 3 + k]) * t);
    const nx = nor[a * 3] + (nor[b * 3] - nor[a * 3]) * t, ny = nor[a * 3 + 1] + (nor[b * 3 + 1] - nor[a * 3 + 1]) * t, nz = nor[a * 3 + 2] + (nor[b * 3 + 2] - nor[a * 3 + 2]) * t, l = Math.hypot(nx, ny, nz) || 1;
    nor.push(nx / l, ny / l, nz / l);
    for (let k = 0; k < 2; k++) flat.push(flat[a * 2 + k] + (flat[b * 2 + k] - flat[a * 2 + k]) * t);
    side.push(side[a]);
    shade.push(shade[a] + (shade[b] - shade[a]) * t);
    srcPt.push([a, b, t]);
    return i;
  };
  // Every near triangle (of those `only` picks) split where `value` (per point) changes sign, then those on the side
  // `drop` (1 above 0, -1 under; 0 none) dropped.
  const split = (value, drop, only = () => true) => {
    const cache = new Map(), at = new Map(), out = [];
    const val = (v) => { if (!at.has(v)) at.set(v, value(v)); return at.get(v); };
    for (const tri of tris) {
      if (!tri.near || !only(tri)) { out.push(tri); continue; }
      const v = tri.c.map(val), sg = v.map((x) => (x > 1e-9 ? 1 : x < -1e-9 ? -1 : 0));
      if (!sg.includes(1) || !sg.includes(-1)) { if ((sg.includes(1) ? 1 : -1) !== drop) out.push(tri); continue; }
      const above = [], under = [];
      for (let k = 0; k < 3; k++) {
        const a = tri.c[k], b = tri.c[(k + 1) % 3];
        if (sg[k] >= 0) above.push(a);
        if (sg[k] <= 0) under.push(a);
        if (sg[k] * sg[(k + 1) % 3] < 0) {
          const key = a < b ? `${a},${b}` : `${b},${a}`;
          if (!cache.has(key)) cache.set(key, a < b ? point(a, b, v[k], v[(k + 1) % 3]) : point(b, a, v[(k + 1) % 3], v[k]));
          above.push(cache.get(key));
          under.push(cache.get(key));
        }
      }
      for (const keep of drop > 0 ? [under] : drop < 0 ? [above] : [above, under]) for (let k = 1; k + 1 < keep.length; k++) out.push({ ...tri, c: [keep[0], keep[k], keep[k + 1]] });
    }
    tris = out;
  };
  // 1. Down the middle near the point, so the V comes to a sharp point.
  split((v) => pos[v * 3], 0, (tri) => tri.c.some((v) => Math.abs(pos[v * 3 + 1] - tip) < 0.03));
  // 2. Straight across the neck where each side of the V meets the model's edge: past there all is as it was.
  const past = (v) => { const w = sideOf(pos[v * 3]); return (pos[v * 3] - J[w][0]) * up[w][0] + (pos[v * 3 + 1] - J[w][1]) * up[w][1]; };
  split(past, 0, (tri) => tri.c.every((v) => Math.abs(pos[v * 3]) > 0.02));
  for (const tri of tris) tri.inV = tri.near && tri.c.reduce((sum, v) => sum + past(v), 0) < 0;
  // 3. Along the V: the cloth inside it dropped.
  split((v) => pos[v * 3 + 1] - L(pos[v * 3]), 1, (tri) => tri.inV);
  // 4. The model's own binding there dropped (ours goes on from where it is cut off).
  tris = tris.filter((tri) => !(tri.inV && tri.binding));
  const idx = tris.flatMap((tri) => tri.c);

  // Our binding along the V. The cloth under a place (x, y) seen from the front: the outermost of the triangles there
  // (`cut`: of the cut shape, else of the model as it was), with its normal and shade; null where there is none.
  const front = (I, P) => {
    // (Kept in 4 mm squares seen from the front, each with the triangles over it.)
    const grid = new Map();
    for (let t = 0; t < I.length; t += 3) {
      const c = [I[t], I[t + 1], I[t + 2]];
      if (c.some((v) => !(P[v * 3 + 2] > 0) || side[v] & 2) || c.every((v) => P[v * 3 + 1] < tip - 0.04 || Math.abs(P[v * 3]) > reach)) continue;
      const xs = c.map((v) => P[v * 3]), ys = c.map((v) => P[v * 3 + 1]);
      for (let i = Math.floor(Math.min(...xs) / 0.004); i <= Math.floor(Math.max(...xs) / 0.004); i++) for (let j = Math.floor(Math.min(...ys) / 0.004); j <= Math.floor(Math.max(...ys) / 0.004); j++) {
        const k = `${i},${j}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(c);
      }
    }
    return grid;
  };
  const before = front(M.idx, M.pos), after = front(idx, pos);
  const clothAt = (x, y, cut) => {
    const P = cut ? pos : M.pos, N = cut ? nor : M.nor, H = cut ? shade : M.shade;
    let best = null;
    for (const [a, b, c] of (cut ? after : before).get(`${Math.floor(x / 0.004)},${Math.floor(y / 0.004)}`) ?? []) {
      const det = (P[b * 3 + 1] - P[c * 3 + 1]) * (P[a * 3] - P[c * 3]) + (P[c * 3] - P[b * 3]) * (P[a * 3 + 1] - P[c * 3 + 1]);
      if (Math.abs(det) < 1e-14) continue;
      const l1 = ((P[b * 3 + 1] - P[c * 3 + 1]) * (x - P[c * 3]) + (P[c * 3] - P[b * 3]) * (y - P[c * 3 + 1])) / det, l2 = ((P[c * 3 + 1] - P[a * 3 + 1]) * (x - P[c * 3]) + (P[a * 3] - P[c * 3]) * (y - P[c * 3 + 1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const z = l1 * P[a * 3 + 2] + l2 * P[b * 3 + 2] + l3 * P[c * 3 + 2];
      if (best && best.z >= z) continue;
      const n = [0, 1, 2].map((k2) => l1 * N[a * 3 + k2] + l2 * N[b * 3 + k2] + l3 * N[c * 3 + k2]), nl = Math.hypot(...n) || 1;
      best = { z, n: n.map((v) => v / nl), shade: l1 * H[a] + l2 * H[b] + l3 * H[c] };
    }
    return best;
  };
  // Its line seen from the front: from where it meets the model's binding on the wearer's right, down to the point and
  // up to the left, every 2.5 mm; across it (into the cloth) as each side's, at the point the mitre between them.
  const path = [];
  for (const w of [0, 1]) {
    const S = line[w], len = Math.hypot(S.x, S.s * S.x), n = Math.max(2, Math.round(len / 0.0025));
    for (let k = 0; k <= n; k++) {
      const f = w ? k / n : 1 - k / n, x = (w ? 1 : -1) * S.x * f;
      if (w && k === 0) continue;
      path.push({ x, y: tip + S.s * S.x * f, d: k === 0 || (w === 0 && k === n) ? null : into[w] });
    }
  }
  const tipK = path.findIndex((p) => !p.d && Math.abs(p.x) < 1e-9);
  if (tipK >= 0) {
    const m = [into[0][0] + into[1][0], into[0][1] + into[1][1]], ml = Math.hypot(...m), cos = (m[0] * into[0][0] + m[1] * into[0][1]) / ml;
    path[tipK].d = [m[0] / ml / cos, m[1] / ml / cos];
  }
  path[0].d = into[0];
  path.at(-1).d = into[1];
  // (Each end a little over the model's binding where it is cut off, so no line shows between them.)
  for (const [p, w] of [[path[0], 0], [path.at(-1), 1]]) { const o = V.over ?? 0.0015; p.x += up[w][0] * o; p.y += up[w][1] * o; }
  // Each place's way out of the cloth (its normal 1.5 cm into the cloth, where it is the body's own, smoothed along over
  // 3 cm) and its shade.
  for (const p of path) {
    const deep = clothAt(p.x + p.d[0] * 0.015, p.y + p.d[1] * 0.015, true) ?? clothAt(p.x, p.y, false);
    p.n = deep?.n ?? [0, 0.6, 0.8];
    p.shade = deep?.shade ?? 1;
  }
  const smoothAlong = (vals, span, ends = false) => vals.map((_, i) => {
    // (`ends`: the window narrowing to nothing at the two ends, so they keep their own values.)
    const w = ends ? Math.min(span, i, vals.length - 1 - i) : span;
    let sum = null, n = 0;
    for (let k = Math.max(0, i - w); k <= Math.min(vals.length - 1, i + w); k++) { sum = sum ? sum.map((s2, j) => s2 + vals[k][j]) : [...vals[k]]; n++; }
    return sum.map((v) => v / n);
  });
  smoothAlong(path.map((p) => p.n), 6).forEach((v, i) => { const l = Math.hypot(...v) || 1; path[i].n = v.map((c) => c / l); });
  smoothAlong(path.map((p) => [p.shade]), 6).forEach((v, i) => (path[i].shade = v[0]));
  // Its width across the V seen from the front: `width` along the cloth (the cloth's slope there taken out), and at its
  // ends that of the model's own binding it meets (seen from the front: how far its band reaches in from where it is cut
  // off), easing between over 1.5 cm.
  const ownWidth = [0, 0];
  for (let v = 0; v < M.count; v++) {
    if (own[v] !== 1 || !(M.pos[v * 3 + 2] > 0) || Math.abs(past(v)) > 0.004) continue;
    const w = sideOf(M.pos[v * 3]), d = (M.pos[v * 3] - J[w][0]) * into[w][0] + (M.pos[v * 3 + 1] - J[w][1]) * into[w][1];
    ownWidth[w] = Math.max(ownWidth[w], d);
  }
  const along = [0];
  for (let i = 1; i < path.length; i++) along.push(along[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  path.forEach((p, i) => {
    const N = p.n, dz = -(p.d[0] * N[0] + p.d[1] * N[1]) / (N[2] || 1), stretch = Math.hypot(p.d[0], p.d[1], dz) / Math.hypot(p.d[0], p.d[1]);
    p.end = Math.min(1, Math.min(along[i], along.at(-1) - along[i]) / 0.015);
    const atEnd = V.pieces ? width / stretch : ownWidth[along[i] < along.at(-1) / 2 ? 0 : 1] || width / stretch;
    p.w = atEnd + (width / stretch - atEnd) * p.end;
    p.stretch = stretch;
  });
  // Its cross-section, seen from the front across the V (into the cloth) and off the cloth: from its foot tucked into the
  // cloth, up its face, over the rolled top edge (out past the cloth's cut edge) and down the inside.
  const faceOf = (p) => [p.w, p.w - 0.0012 / p.stretch, p.w - 0.003 / p.stretch, p.w * 0.6, p.w * 0.3, 0.0025 / p.stretch];
  // (Face: how far off the cloth, as a share of `lift`; the roll and inside: off the face's top, metres.)
  const F = 6, lifts = [0, 0.45, 1, 1, 1, 1], centre = roll - 0.0004, rollProf = [];
  for (let k = 1; k <= 6; k++) { const t = Math.PI / 2 + (k * Math.PI) / 6; rollProf.push([centre + roll * Math.cos(t), roll * Math.sin(t) - roll]); }
  rollProf.push([centre + 0.002, -2 * roll - 0.0001], [centre + 0.005, -2 * roll - 0.0002]);
  // (A model with an inner layer close behind its front (the netball bib's, `wrap` metres): the binding wraps on down to it,
  // so both cut edges are inside it.)
  if (V.wrap) rollProf.push([centre + 0.004, -V.wrap * 0.5], [centre + 0.006, -V.wrap]);
  const R = F + rollProf.length;
  // Its face on the model's own surface there (the outermost cloth seen from the front: where the V meets the model's
  // binding, that binding's own face, so the two meet flush), with its shade, smoothed along (not at its ends), standing
  // `lift` off it, less towards its ends (there flush with the model's binding); and never under the cloth as it is cut.
  const under = path.map((p) => faceOf(p).flatMap((a) => {
    const c = clothAt(p.x + p.d[0] * a, p.y + p.d[1] * a, false);
    return c ? [c.z, c.shade] : [NaN, NaN];
  }));
  for (const row of under) for (let r = 0; r < row.length; r++) if (Number.isNaN(row[r])) row[r] = r > 1 ? row[r - 2] : r ? 1 : 0.06;
  const smoothed = smoothAlong(under, 4, true);
  const cpos = [], cshade = [], cidx = [];
  path.forEach((p, i) => {
    const N = p.n, up2 = lift * Math.max(0.35, p.end), nz = Math.max(0.3, N[2]);
    const at = faceOf(p).map((a, r) => {
      const x = p.x + p.d[0] * a, y = p.y + p.d[1] * a, cut = clothAt(x, y, true);
      let z = smoothed[i][r * 2] + (lifts[r] * up2) / nz;
      if (r === 0) z = (cut ? cut.z : smoothed[i][0]) - 0.0007;
      else if (cut) z = Math.max(z, cut.z + (0.0003 + 0.6 * lifts[r] * up2) / nz);
      return [x, y, z];
    });
    at.forEach((q, r) => { cpos.push(...q); cshade.push(smoothed[i][r * 2 + 1]); });
    // The rolled top: from the face's top over the edge, in the cloth's own plane there (its normal N; across: the way
    // into the cloth seen from the front, turned onto that plane).
    const D = [p.d[0], p.d[1], -(p.d[0] * N[0] + p.d[1] * N[1]) / (N[2] || 1)].map((v) => v / p.stretch), top = at.at(-1), a5 = 0.0025;
    const E = [top[0] - D[0] * a5, top[1] - D[1] * a5, top[2] - D[2] * a5], topShade = smoothed[i][(F - 1) * 2 + 1];
    rollProf.forEach(([a0, b0], k) => {
      // (past the roll: the turn down inside, eased out towards the band's ends when the model's border goes on there)
      const ease = V.pieces && k >= 6 ? Math.min(1, Math.min(along[i], along.at(-1) - along[i]) / 0.04) : 1, a = k >= 6 ? centre + (a0 - centre) * ease : a0, b = k >= 6 ? -2 * roll + (b0 + 2 * roll) * ease : b0;
      cpos.push(E[0] + D[0] * a + N[0] * b, E[1] + D[1] * a + N[1] * b, E[2] + D[2] * a + N[2] * b);
      cshade.push(topShade * (b < -roll ? 0.8 : 1));
    });
  });
  // (A model split into pieces (the tee): the band's last 8 mm at each end left off; there it would run on past the model's
  // own round band and stand off it (MODELQ8 2026-11-26). It ends on that band, which covers the place.)
  const endOff = V.pieces && !V.wrap ? V.endOff ?? 0.008 : 0;
  for (let i = 0; i + 1 < path.length; i++) for (let r = 0; r + 1 < R; r++) {
    if (endOff && (along[i] < endOff || along.at(-1) - along[i + 1] < endOff)) continue;
    const a = i * R + r, c = a + R;
    cidx.push(a, c, a + 1, a + 1, c, c + 1);
  }
  // The edge of the neck opening along the V (the binding's rolled top), every 1.2 cm and at the point.
  const vEdge = [];
  path.forEach((p, i) => {
    const k = i * R + F + 2, q = [cpos[k * 3], cpos[k * 3 + 1], cpos[k * 3 + 2]], last = vEdge.at(-1);
    if (!last || i === tipK || i === path.length - 1 || Math.hypot(q[0] - last[0], q[1] - last[1]) >= 0.012) vEdge.push(q);
  });
  // (The V's edge on the flat pattern, front, from the point out to the + x side's end: where the cut cloth under each
  // place of our binding's foot is printed from, for the made garment's outline (necks.js neckCut).)
  const flatAt = (x, y) => {
    let best = null;
    for (const [a, b, c] of after.get(`${Math.floor(x / 0.004)},${Math.floor(y / 0.004)}`) ?? []) {
      const P = pos, det = (P[b * 3 + 1] - P[c * 3 + 1]) * (P[a * 3] - P[c * 3]) + (P[c * 3] - P[b * 3]) * (P[a * 3 + 1] - P[c * 3 + 1]);
      if (Math.abs(det) < 1e-14 || side[a] & 1 || side[a] & 2) continue;
      const l1 = ((P[b * 3 + 1] - P[c * 3 + 1]) * (x - P[c * 3]) + (P[c * 3] - P[b * 3]) * (y - P[c * 3 + 1])) / det, l2 = ((P[c * 3 + 1] - P[a * 3 + 1]) * (x - P[c * 3]) + (P[a * 3] - P[c * 3]) * (y - P[c * 3 + 1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      const z = l1 * P[a * 3 + 2] + l2 * P[b * 3 + 2] + l3 * P[c * 3 + 2];
      if (best && best.z >= z) continue;
      best = { z, f: [0, 1].map((k) => l1 * flat[a * 2 + k] + l2 * flat[b * 2 + k] + l3 * flat[c * 2 + k]) };
    }
    return best?.f ?? null;
  };
  const vFlat = path.filter((p) => p.x >= -1e-9).map((p) => flatAt(p.x + p.d[0] * 0.002, p.y + p.d[1] * 0.002)).filter(Boolean);
  const out = {
    ...M, count: pos.length / 3, pos: Float32Array.from(pos), nor: Float32Array.from(nor), flat: Float32Array.from(flat), vFlat,
    side: Uint8Array.from(side), shade: Float32Array.from(shade), idx: pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx),
    collar: { pos: Float32Array.from(cpos), shade: Float32Array.from(cshade), idx: Uint16Array.from(cidx) }, vEdge,
    ...(V.pieces ? { srcPt, srcTri: Array.from({ length: idx.length / 3 }, (_, k) => tris[k]?.src ?? -1), n0: M.count } : {}),
  };
  decoded.set(cacheKey, out);
  return out;
}

/**
 * The model as the garment's printed shape: { geometry (position, normal, uv on the made garment's atlas, color: the
 * baked shade, index), points (its positions), side (per point, as decode's), data (the file's own fields), layout (its
 * seams and trims on the pattern, layoutOf) }. `frame`: the made garment's
 * (garment.js: minX, maxX, minY, span), whose atlas has the front on its left half and the back, seen from behind, on
 * its right. `neck`: 'v' for the dress's V-neck (cutNeck); then also `vEdge` (its edge's points) and `collar` (our
 * binding along it, collarGeometry).
 */
// (The garment's inside plain (RUGBYJ 2026-11-19, the coordinator: with no display form the inside shows, and no print or
// mark may show through it mirrored): a model's cloth wound inward (its facings, the collar's inside, a hem or cuff turned
// up) is a point on the back half facing forward or on the front half facing back (side, normal). Per final point (copies
// found by place) 1 there, else 0; islands of fewer than INNER_MIN triangles (a fold on the outside) left out. main.js
// addRelief draws it in the inside's colour.)
// (A model with its collar's foot line (data neckRing: the Rugby League jersey): also everything inside that line and below
// it (its neck facing, lying across under the neck, showed the back's print mirrored) and the collar's inner face (above
// the line's foot, facing the line's middle).)
const INNER_FACING = 0.5, INNER_MIN = 24;
function ringOf(R) {
  const c = R.c, n = c.length / 3, B = 72, r = new Float32Array(B), y = new Float32Array(B).fill(NaN);
  let cx = 0, cz = 0, ylo = Infinity;
  for (let i = 0; i < n; i++) { cx += c[i * 3] / n; cz += c[i * 3 + 2] / n; }
  for (let i = 0; i < n; i++) {
    const b = Math.floor(((Math.atan2(c[i * 3] - cx, c[i * 3 + 2] - cz) + Math.PI) / (2 * Math.PI)) * B) % B;
    r[b] = Math.max(r[b], Math.hypot(c[i * 3] - cx, c[i * 3 + 2] - cz)); y[b] = Number.isNaN(y[b]) ? c[i * 3 + 1] : Math.max(y[b], c[i * 3 + 1]); ylo = Math.min(ylo, c[i * 3 + 1]);
  }
  for (let k = 0; k < 3; k++) for (let b = 0; b < B; b++) if (!r[b]) { r[b] = r[(b + 1) % B] || r[(b + B - 1) % B]; if (Number.isNaN(y[b])) y[b] = y[(b + 1) % B]; }
  return { cx, cz, r, y, B, ylo };
}
function innerOf(M, pos, index) {
  const at = (P, i) => `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`;
  const own = new Map(), ring = M.data.neckRing?.c ? ringOf(M.data.neckRing) : null;
  // (MODELQ7 2026-11-24: a model's own inside marks (data `inner`, the headwear models: a ray along the normal meets the hat
  // again): used instead of the facing rule, which marked the beanie's rib grooves on the outside.)
  const ownInner = M.data.inner ? new Uint8Array(bytes(M.data.inner)) : null;
  const byRing = (i) => {
    if (!ring) return false;
    const P = M.pos, N = M.nor, dx = P[i * 3] - ring.cx, dz = P[i * 3 + 2] - ring.cz, y = P[i * 3 + 1], rr = Math.hypot(dx, dz);
    const b = Math.floor(((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI)) * ring.B) % ring.B, R = ring.r[b], Y = ring.y[b];
    if (y < Y + 0.003 && y > ring.ylo - 0.15 && rr < R - 0.008) return true;
    return y > Y - 0.01 && rr < R + 0.012 && (N[i * 3] * dx + N[i * 3 + 2] * dz) / (rr || 1) < -0.5;
  };
  for (let i = 0; i < M.count; i++) {
    const k = at(M.pos, i), nz = M.nor[i * 3 + 2];
    if (!own.has(k)) own.set(k, ownInner ? ownInner[i] === 1 : (M.side[i] & 1 ? nz > INNER_FACING : nz < -INNER_FACING) || byRing(i));
  }
  const n = pos.length / 3, flag = new Uint8Array(n), pid = new Int32Array(n), ids = new Map();
  for (let i = 0; i < n; i++) {
    const k = at(pos, i);
    flag[i] = own.get(k) ? 1 : 0;
    pid[i] = ids.get(k) ?? ids.set(k, ids.size).get(k);
  }
  const T = index.length / 3, tri = new Uint8Array(T), up = Int32Array.from({ length: ids.size }, (_, i) => i);
  const find = (a) => { while (up[a] !== a) a = up[a] = up[up[a]]; return a; };
  for (let t = 0; t < T; t++) {
    if (flag[index[t * 3]] + flag[index[t * 3 + 1]] + flag[index[t * 3 + 2]] < 2) continue;
    tri[t] = 1;
    for (let k = 1; k < 3; k++) { const a = find(pid[index[t * 3]]), b = find(pid[index[t * 3 + k]]); if (a !== b) up[b] = a; }
  }
  const size = new Map();
  for (let t = 0; t < T; t++) if (tri[t]) { const r = find(pid[index[t * 3]]); size.set(r, (size.get(r) ?? 0) + 1); }
  const out = new Float32Array(n);
  for (let t = 0; t < T; t++) {
    if (!tri[t] || size.get(find(pid[index[t * 3]])) < INNER_MIN) continue;
    for (let k = 0; k < 3; k++) { const v = index[t * 3 + k]; if (flag[v]) out[v] = 1; }
  }
  return out;
}

export function tripoShape(name, frame, neck = null, { dropBand = false } = {}) {
  // (Only the dress's V is cut (DRESS_V). The basketball singlet keeps its model's own V whatever is chosen: a round
  // neck cannot be cut from it, its binding is a 2-2.5 cm slab filling its straps' tops: BBSINGLET 2026-11-13.)
  // (The football jersey's V-necks too, FBJERSEY 2026-11-13: tripomesh.js vOf, JERSEY_V.)
  const fill = neck === 'round' || neck === 'shallow' ? FILL_NECKS[name]?.[neck] : null;
  const V = neck && !fill ? vOf(name, neck) : null, cut = fill ? fillNeck(name, neck, fill) : V ? cutNeck(name, V) : null;
  // (The basketball singlet's round neck: its V's band taken off and the V filled up to a round neck, our band on it.)
  const R = !cut && name === 'basketball-singlet' && neck === 'round' ? roundFill(name) : null;
  const M = cut ?? R ?? decode(name), { minX, maxX, minY, span } = frame, n = M.count;
  const uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = M.flat[i * 2], y = M.flat[i * 2 + 1];
    uv[i * 2] = M.side[i] & 1 ? 0.5 + (0.5 * (maxX - x)) / span : (0.5 * (x - minX)) / span;
    uv[i * 2 + 1] = (y - minY) / span;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = M.shade[i];
  }
  // (A model with both print places by its sleeves' seams (data flatB / flatS, RUGBYJ altUv): the body's place of every point
  // carried as `uvBody` (main.js prints the body's fragments from it) and a triangle across a sleeve's seam given the sleeve's
  // place as its uv, so each side of the seam prints from its own place: a straight seam under a design picture.)
  // (A neck cut on such a model (the tee's V, cutNeck V.pieces, MODELQ8 2026-11-26): the cut shape's new points given the
  // places of their edge's two ends (between them; the side of the nearer end), so its body still prints its marks.)
  const altCut = !!M.srcTri && M.data === decoded.get(name)?.data;
  const alt = (M === decoded.get(name) || altCut) && M.data.flatB && M.data.flatS ? ((a) => {
    if (!altCut) return a;
    const o = { fB: new Int16Array(n * 2), sB: new Uint8Array(n), fS: new Int16Array(n * 2), sS: new Uint8Array(n) };
    for (const k of ['fB', 'sB', 'fS', 'sS']) o[k].set(a[k].subarray(0, M.n0 * (k[0] === 'f' ? 2 : 1)));
    M.srcPt.forEach(([p, q, t], j) => {
      const i = M.n0 + j, e = t < 0.5 ? p : q;
      for (const [f, s] of [['fB', 'sB'], ['fS', 'sS']]) {
        o[s][i] = a[s][e];
        for (let c = 0; c < 2; c++) o[f][i * 2 + c] = a[s][p] === a[s][q] ? Math.round(a[f][p * 2 + c] + (a[f][q * 2 + c] - a[f][p * 2 + c]) * t) : a[f][e * 2 + c];
      }
    });
    return o;
  })({ fB: new Int16Array(bytes(M.data.flatB)), sB: new Uint8Array(bytes(M.data.sideB)), fS: new Int16Array(bytes(M.data.flatS)), sS: new Uint8Array(bytes(M.data.sideS)) }) : null;
  const uvAt = (fx, fy, half) => [half ? 0.5 + (0.5 * (maxX - fx)) / span : (0.5 * (fx - minX)) / span, (fy - minY) / span];
  const uvBOf = (i, half = alt.sB[i] & 1) => uvAt(alt.fB[i * 2] * M.data.flatUnit, alt.fB[i * 2 + 1] * M.data.flatUnit, half);
  const uvSOf = (i, half = alt.sS[i] & 1) => uvAt(alt.fS[i * 2] * M.data.flatUnit, alt.fS[i * 2 + 1] * M.data.flatUnit, half);
  const UB = alt ? Array.from({ length: n * 2 }, (_, k) => uvBOf(k >> 1)[k & 1]) : null, SRC = alt ? Array.from({ length: n }, (_, i) => i) : null;
  // A model's bindings (layout.runs: their free edges; or marked per point by its converter): each band printed from its
  // own swatch of the atlas (the model's `swatch`, else BAND_SWATCH; its painter's), so it is one even colour from its
  // free edge right to its seam, whatever the pattern does there.
  // (A model whose parts are given per triangle (its data's `triPart` / `partKeys`, MODELQ 2026-11-16, the direct approach):
  // no part printed from swatches; each part's triangles drawn in that part's flat colour by the cloth's own material
  // (main.js), so a trim's colour ends exactly on the model's own edge. Its cloth is printed as before.)
  // (The converter's own per-point bands that the parts replace (data `partBands`) are left off: printed as cloth, the part's
  // triangles drawn plain over them; the others (an edge binding, the inside) stay printed from their swatches.)
  // (A neck cut with the model's pieces kept (cutNeck V.pieces): its parts and pieces mapped from where it came from.)
  const carried = !!M.srcTri && M.data === decoded.get(name)?.data;
  const triPart = M.data.triPart && (M === decoded.get(name) || carried) ? (carried ? ((tp) => Uint8Array.from(M.srcTri, (t) => (t >= 0 ? tp[t] ?? 0 : 0)))(new Uint8Array(bytes(M.data.triPart))) : new Uint8Array(bytes(M.data.triPart))) : null;
  // (A model split into the pieces between its own lines (its data's `piece`, MODELQ4 2026-11-17): per point the pieces on
  // the two sides of its nearest line (0 the print, k the k-th of its partKeys) and how far it is from that line (mm, + on
  // the first's side): the shader colours each piece's cloth up to that smooth line (main.js addRelief, piece).)
  const pieceData = M.data.piece && (M === decoded.get(name) || carried) ? (carried ? ((pd) => {
    // (a new point on an edge: its two ends' pieces; the line's distance across it, else the nearer end's)
    const o = new Uint8Array(n * 3); o.set(pd.subarray(0, M.n0 * 3));
    M.srcPt.forEach(([a, b, t], k) => { const i = M.n0 + k, same = pd[a * 3] === pd[b * 3] && pd[a * 3 + 1] === pd[b * 3 + 1], e = t < 0.5 ? a : b; o[i * 3] = pd[e * 3]; o[i * 3 + 1] = pd[e * 3 + 1]; o[i * 3 + 2] = same ? Math.round(pd[a * 3 + 2] + (pd[b * 3 + 2] - pd[a * 3 + 2]) * t) : pd[e * 3 + 2]; });
    return o;
  })(new Uint8Array(bytes(M.data.piece))) : new Uint8Array(bytes(M.data.piece))) : null;
  const pieceOf = (i) => [pieceData[i * 3], pieceData[i * 3 + 1], (pieceData[i * 3 + 2] - 128) * 0.4];
  let PC = pieceData ? Array.from({ length: n * 3 }, (_, k) => pieceOf((k / 3) | 0)[k % 3]) : null;
  let band = bandsOf(M);
  if ((triPart || pieceData) && band) { const off = new Set(M.data.partBands ?? []); band = band.map((b) => (off.has(b) ? 0 : b)); if (!band.some(Boolean)) band = null; }
  // (A model split into pieces: its points still go through the half check below (a triangle with corners on both the front
  // and the back half printed all on one, never smeared across the print), even with none of its own bands printed.)
  if (pieceData && !band) band = new Array(n).fill(0);
  const SW = M.data.swatch ?? BAND_SWATCH, spread = M.data.swatchSpread ?? 0;
  let pos = M.pos, nor = M.nor, uvs = uv, cols = col, index = M.idx, insideGroup = null, partGroups = null;
  if (band) {
    // Each point's print: its band's swatch, else its own place on the front or back half. Over the straps' tops (the top
    // 8 cm) the half is the one the cloth faces (its normal forward or back), so the shoulder line there is clean.
    // (Not on a model whose converter cut its own halves (the football jersey's, its data's `halves`).)
    const top = M.data.hi[1], straps = !M.data.halves;
    const mode = Int8Array.from({ length: n }, (_, i) => (band[i] ? 1 + band[i] : straps && M.pos[i * 3 + 1] > top - 0.08 && !(M.side[i] & 2) ? (M.nor[i * 3 + 2] < 0 ? 1 : 0) : M.side[i] & 1));
    // (A model's neck band with its places across it (the football jersey's data `across`: 0 its foot, 1 its top fold): printed
    // from a strip of its swatch, up the strip across the band and along it by how far out it is, so a collar's stripes and
    // tips (texture.js, rugby collars) show on it: bandAt.)
    const uvOf = (i, m) => {
      if (m === 2 && M.across) { const [x, y] = bandAt(SW[0], M.pos[i * 3], (M.across[i] ?? 0) / 100); return [(0.5 * (x - minX)) / span, (y - minY) / span]; }
      // (A model's `swatchSpread` (the netball bib's): each point a little way round its swatch's middle, by its own flat
      // place, so the fabric's surface detail has a direction there and does not break up into noise.)
      if (m >= 2) { const [x, y] = SW[m - 2], k = spread; return [(0.5 * (x + k * M.flat[i * 2] - minX)) / span, (y + k * (M.flat[i * 2 + 1] - 0.4) - minY) / span]; }
      const x = M.flat[i * 2], y = M.flat[i * 2 + 1];
      return [m ? 0.5 + (0.5 * (maxX - x)) / span : (0.5 * (x - minX)) / span, (y - minY) / span];
    };
    for (let i = 0; i < n; i++) uv.set(uvOf(i, mode[i]), i * 2);
    // A triangle with corners printed differently: all its corners as most of them are (copies of the others), so none
    // smears across the atlas.
    // (`dropBand`: the model's own neck band left off (a fold-down or wing collar is sewn on at its foot instead: main.js).)
    // (A model's inside bands (its data's `inside`, else band 3) as modes.)
    const insideModes = new Set((M.data.inside ?? [3]).map((b) => b + 1));
    const all = Array.from(M.idx), idx = dropBand ? all.filter((_, k) => ![0, 1, 2].some((j) => band[all[k - (k % 3) + j]] === 1)) : all;
    const P = Array.from(M.pos), N = Array.from(M.nor), U = Array.from(uv), C = Array.from(col), copies = new Map();
    // (Each triangle's print, for a model whose inside is its own plain material: below.)
    const triMode = new Int8Array(idx.length / 3);
    for (let t = 0; t < idx.length; t += 3) {
      const tri = idx.slice(t, t + 3), on = tri.map((v) => mode[v]);
      triMode[t / 3] = on[0];
      if (on[0] === on[1] && on[1] === on[2]) continue;
      const count = new Map();
      on.forEach((m) => count.set(m, (count.get(m) ?? 0) + 1));
      // (A band only where all three corners are on it: its edge on the cloth then never juts out in teeth. The inside's
      // plain colours (a converter's inside bands: `inside`, else band 3) count as cloth here: the binding's inside edge clean too.)
      const cloth = [...count].filter(([m]) => m < 2 || insideModes.has(m));
      const want = (cloth.length ? cloth : [...count]).sort((p, q) => q[1] - p[1] || q[0] - p[0])[0][0];
      triMode[t / 3] = want;
      for (let k = 0; k < 3; k++) {
        const v = tri[k];
        if (mode[v] === want) continue;
        const ck = `${v}:${want}`;
        if (!copies.has(ck)) {
          copies.set(ck, P.length / 3);
          P.push(M.pos[v * 3], M.pos[v * 3 + 1], M.pos[v * 3 + 2]);
          N.push(M.nor[v * 3], M.nor[v * 3 + 1], M.nor[v * 3 + 2]);
          U.push(...uvOf(v, want));
          if (UB) { UB.push(...uvBOf(v, want < 2 ? want : alt.sB[v] & 1)); SRC.push(v); }
          C.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
          if (PC) PC.push(...pieceOf(v));
        }
        idx[t + k] = copies.get(ck);
      }
    }
    // (A model with its inside marked (its data's `inside`: the basketball singlet): the inside's triangles last, as a
    // group of their own, drawn in a plain material of one even colour (main.js): printed from one point of the pattern
    // they have no direction for the fabric's weave, which showed on them as blotches (user 2026-11-13, image 540).)
    if (M.data.inside && !triPart) {
      const clothTris = [], insideTris = [];
      for (let t = 0; t < idx.length; t += 3) (insideModes.has(triMode[t / 3]) ? insideTris : clothTris).push(idx[t], idx[t + 1], idx[t + 2]);
      idx.length = 0;
      idx.push(...clothTris, ...insideTris);
      insideGroup = [clothTris.length, insideTris.length];
    }
    pos = Float32Array.from(P); nor = Float32Array.from(N); uvs = Float32Array.from(U); cols = Float32Array.from(C);
    index = pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx);
  }
  // (The parts in the cloth's own material (MODELQ3 2026-11-16: separate plain materials showed the cloth see-through on a
  // real graphics card, user 560): each point carries its part (attribute `partKey`: 0 cloth, k the k-th key; a point shared
  // by triangles of different parts copied, so a part's colour ends exactly on the model's own edge); the print's shader
  // gives a part's triangles that part's flat colour (main.js addRelief, partTint). The triangles keep their order through
  // the bands' copies above; one the parts do not list (a data file changed after its parts were made) is cloth.)
  let partKey = null;
  if (triPart && !dropBand) {
    const idx = Array.from(index), P = Array.from(pos), N = Array.from(nor), U = Array.from(uvs), C = Array.from(cols);
    const key = new Array(P.length / 3).fill(-1), copies = new Map();
    for (let t = 0; t < idx.length / 3; t++) {
      const p = t < triPart.length ? triPart[t] : 0;
      for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k];
        if (key[v] === -1) key[v] = p;
        if (key[v] === p) continue;
        const ck = `${v}:${p}`;
        if (!copies.has(ck)) {
          copies.set(ck, P.length / 3);
          P.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); N.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
          U.push(U[v * 2], U[v * 2 + 1]); C.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]); key.push(p);
          if (PC) PC.push(PC[v * 3], PC[v * 3 + 1], PC[v * 3 + 2]);
          if (UB) { UB.push(UB[v * 2], UB[v * 2 + 1]); SRC.push(SRC[v]); }
        }
        idx[t * 3 + k] = copies.get(ck);
      }
    }
    pos = Float32Array.from(P); nor = Float32Array.from(N); uvs = Float32Array.from(U); cols = Float32Array.from(C);
    partKey = Float32Array.from(key, (p) => Math.max(0, p));
    index = pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx);
    partGroups = [];
  }
  // (A triangle whose corners lie by different lines (pieces meeting, a line's end): its corners copied with the one line
  // given for it (data `pieceTri`: triangle (3 bytes), the two pieces, each corner's distance), so the pieces' colours
  // inside it meet on that line and never mix into a third colour. The triangles are in the data's order here.)
  if (PC && M.data.pieceTri && !dropBand && index.length === M.idx.length) {
    let T = new Uint8Array(bytes(M.data.pieceTri));
    // (On a cut neck: each entry onto the triangles that came whole from that one.)
    if (carried) { const at = new Map(); M.srcTri.forEach((t, j) => { if (t >= 0 && [0, 1, 2].every((k) => M.idx[j * 3 + k] < M.n0)) (at.get(t) ?? at.set(t, []).get(t)).push(j); }); const o = []; for (let e = 0; e + 7 < T.length; e += 8) for (const j of at.get(T[e] | (T[e + 1] << 8) | (T[e + 2] << 16)) ?? []) o.push(j & 255, (j >> 8) & 255, (j >> 16) & 255, ...T.subarray(e + 3, e + 8)); T = Uint8Array.from(o); }
    const idx = Array.from(index), P = Array.from(pos), N = Array.from(nor), U = Array.from(uvs), C = Array.from(cols), K = partKey ? Array.from(partKey) : null;
    // (altUv: a triangle across a sleeve's seam (its two pieces a sleeve and the print) printed from the sleeve's place, all its
    // corners on one half)
    const sleeveK = alt ? new Set((M.data.partKeys ?? []).map((k, j) => (/^(part|area):(left|right)Sleeve/.test(k) ? j + 1 : 0)).filter(Boolean)) : null;
    for (let e = 0; e + 7 < T.length; e += 8) {
      const t = T[e] | (T[e + 1] << 8) | (T[e + 2] << 16);
      if (t * 3 + 2 >= idx.length) continue;
      const seamTri = alt && ((sleeveK.has(T[e + 3]) && T[e + 4] === 0) || (sleeveK.has(T[e + 4]) && T[e + 3] === 0)), half0 = seamTri ? alt.sS[SRC[idx[t * 3]]] & 1 : 0;
      for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k], c = P.length / 3;
        P.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); N.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); if (seamTri) U.push(...uvSOf(SRC[v], half0)); else U.push(U[v * 2], U[v * 2 + 1]); C.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]);
        if (UB) { UB.push(UB[v * 2], UB[v * 2 + 1]); SRC.push(SRC[v]); }
        if (K) K.push(K[v]);
        PC.push(T[e + 3], T[e + 4], (T[e + 5 + k] - 128) * 0.4);
        idx[t * 3 + k] = c;
      }
    }
    pos = Float32Array.from(P); nor = Float32Array.from(N); uvs = Float32Array.from(U); cols = Float32Array.from(C);
    if (K) partKey = Float32Array.from(K);
    index = pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos === M.pos ? M.pos.slice() : pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor === M.nor ? M.nor.slice() : nor, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (UB && UB.length === uvs.length) geometry.setAttribute('uvBody', new THREE.Float32BufferAttribute(UB, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geometry.setIndex(new THREE.BufferAttribute(index === M.idx ? M.idx.slice() : index, 1));
  if (insideGroup) { geometry.addGroup(0, insideGroup[0], 0); geometry.addGroup(insideGroup[0], insideGroup[1], 1); }
  if (partKey) geometry.setAttribute('partKey', new THREE.BufferAttribute(partKey, 1));
  if (PC && PC.length === (pos.length / 3) * 3) geometry.setAttribute('piece', new THREE.BufferAttribute(Float32Array.from(PC), 3));
  // (Its cloth wound inward drawn plain, in the inside's colour: innerOf, main.js addRelief.)
  geometry.setAttribute('inner', new THREE.BufferAttribute(innerOf(M, pos, index), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const points = geometry.getAttribute('position').array, side = new Uint8Array(points.length / 3);
  side.set(M.side);
  // (How far out the neck band reaches, for its tips: texture.js.)
  let bandReach = 0;
  if (band && M.across) for (let i = 0; i < n; i++) if (band[i] === 1) bandReach = Math.max(bandReach, Math.abs(M.pos[i * 3]));
  const collar = cut ? collarGeometry(cut.collar, frame, SW, !!M.across) : R ? collarGeometry(R.collar, frame, SW) : null;
  // (Our V band on a model split into pieces (the tee, MODELQ8 2026-11-26): drawn as the model's own collar piece, so it is
  // in the collar's colour (the trim colour) as the dress's V band; its body print place its own (uvBody).)
  const collarKey = PC && collar ? (M.data.partKeys ?? []).indexOf('collar') + 1 : 0;
  if (collarKey) {
    const m = collar.getAttribute('position').count;
    collar.setAttribute('piece', new THREE.BufferAttribute(Float32Array.from({ length: m * 3 }, (_, k) => (k % 3 === 2 ? 0 : collarKey)), 3));
    if (UB) collar.setAttribute('uvBody', new THREE.BufferAttribute(collar.getAttribute('uv').array.slice(), 2));
  }
  return { geometry, points, side, data: M.data, layout: layoutOf(M.data), vEdge: cut?.vEdge ?? R?.vEdge ?? null, neckRim: R?.neckRim ?? null, insideGroup: !!insideGroup, partKeys: partGroups || PC ? M.data.partKeys ?? [] : null, pieces: !!PC, collar, bandReach, filled: !!fill };
}

/**
 * The basketball singlet's round neck (BBSINGLET 2026-11-13; the client wants every neck style): its model is a V, and a
 * round neck is higher, so it cannot be cut from it. Our own neck piece, all the way round (user 2026-11-13, image 540:
 * one smooth round curve front to back, no corners at the shoulders): the model's whole neck band taken off (front, over
 * the straps and round the back), the V filled with our own cloth up to a round neck (BB_ROUND: its foot, an ellipse up
 * to the model's neck edge at the straps), shaped and printed as the chest round it, and ONE band of our own along the
 * whole neck: in front along the round neck, over the straps and round the back along the model's own neck edge, the
 * line smoothed all the way round, from that edge out to the cloth's edge where the model's band was sewn on (its
 * groove), its top rolled over and its inside turned down, printed in the neck binding's colour. Made once. Decode's
 * fields for the shape, plus `collar` (our band: { pos, idx, shade }), `vEdge` (the round neck's edge in front, x
 * rising) and `neckRim` (its edge all the way round, for the form and the neck label).
 */
export const BB_ROUND = { foot: 0.655, join: 0.705, width: 0.022, top: 0.0035, cell: 0.003 };
function roundFill(name) {
  const key = `${name}:round`;
  if (decoded.has(key)) return decoded.get(key);
  const M = decode(name), { foot, join, width, top, cell } = BB_ROUND, band = M.band, n0 = M.count;
  const P3 = (v) => [M.pos[v * 3], M.pos[v * 3 + 1], M.pos[v * 3 + 2]];
  const front = (v) => M.pos[v * 3 + 2] > 0.01;
  // 1. The model's V opening opened up for our fill: its neck band's triangles in front under the straps (all corners in
  // front, below `join`) taken off; everything else of the model kept as it is (user 2026-11-16: nothing of the model cut
  // outside the opening itself; our band lies ON its band over the straps and round the back, covering it). And the
  // cloth's edge along the band: the outside cloth's points joined to it (its groove, all the way round).
  const idx = [], grooveSet = new Set();
  for (let t = 0; t < M.idx.length; t += 3) {
    const c = [M.idx[t], M.idx[t + 1], M.idx[t + 2]], on = c.filter((v) => band[v] === 1).length;
    if (on) for (const v of c) if (band[v] === 0) grooveSet.add(v);
    if (!on || !c.every((v) => M.pos[v * 3 + 2] > 0.01 && M.pos[v * 3 + 1] < join)) idx.push(...c);
  }
  const groove = [...grooveSet];
  // 2. The model's own neck edge (the top of its band's roll): round the opening seen from above, every 3 degrees, the
  // band's highest point; over the straps and round the back (from `join` up).
  let cx = 0, cz = 0, nb = 0;
  for (let v = 0; v < n0; v++) if (band[v] === 1) { cx += M.pos[v * 3]; cz += M.pos[v * 3 + 2]; nb++; }
  cx /= nb || 1; cz /= nb || 1;
  const bins = new Map();
  for (let v = 0; v < n0; v++) {
    if (band[v] !== 1) continue;
    const a = Math.round((Math.atan2(M.pos[v * 3 + 2] - cz, M.pos[v * 3] - cx) * 180) / Math.PI / 3);
    if (!bins.has(a) || M.pos[v * 3 + 1] > M.pos[bins.get(a) * 3 + 1]) bins.set(a, v);
  }
  // (From the wearer's left strap in front (a small angle) back round to the right strap (near 180): angles falling.)
  const crest = [...bins.entries()].map(([a, v]) => ({ a: a * 3 > 100 ? a * 3 - 360 : a * 3, p: P3(v) })).filter((c) => c.p[1] >= join).sort((m, n) => n.a - m.a);
  // (The edge as the model has it, kept: the smoothed line is lifted back up to it over the straps, below.)
  const crestRaw = crest.map((c) => c.p.slice());
  // (Evened along itself: each point with its two neighbours either side, twice; its ends kept.)
  for (let pass = 0; pass < 2; pass++) {
    const was = crest.map((c) => c.p.slice());
    for (let k = 1; k + 1 < crest.length; k++) for (let q = 0; q < 3; q++) { let sum = 0, m = 0; for (let j = Math.max(0, k - 2); j <= Math.min(crest.length - 1, k + 2); j++) { sum += was[j][q]; m++; } crest[k].p[q] = sum / m; }
  }
  const JL = crest[0].p, JR = crest.at(-1).p, xJ = (Math.abs(JL[0]) + Math.abs(JR[0])) / 2, yJ = (JL[1] + JR[1]) / 2;
  // The round neck in front: an ellipse from its foot up to the model's edge at the straps (x out by height).
  const roundX = (y) => (y <= foot ? 0 : y >= yJ ? xJ : xJ * Math.sin(Math.acos(1 - (y - foot) / (yJ - foot))));
  const inside = (x, y) => y > foot && Math.abs(x) < roundX(y);
  // 3. What covers the front now, seen from the front (outermost outside cloth, z), on a `cell` grid round the neck.
  const X0 = -0.17, Y0 = 0.5, NX = Math.round(0.34 / cell) + 1, NY = Math.round((yJ + 0.035 - Y0) / cell) + 1;
  const depth = new Float32Array(NX * NY).fill(-Infinity), flatAt = new Float32Array(NX * NY * 2), shadeAt = new Float32Array(NX * NY);
  for (let t = 0; t < idx.length; t += 3) {
    const c = [idx[t], idx[t + 1], idx[t + 2]];
    if (!c.every(front) || c.some((v) => band[v] >= 3 || band[v] === 1)) continue;
    const P = c.map(P3);
    const x0 = Math.min(...P.map((p) => p[0])), x1 = Math.max(...P.map((p) => p[0])), y0 = Math.min(...P.map((p) => p[1])), y1 = Math.max(...P.map((p) => p[1]));
    const det = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]);
    if (Math.abs(det) < 1e-12) continue;
    for (let i = Math.max(0, Math.ceil((x0 - X0) / cell)); i <= Math.min(NX - 1, Math.floor((x1 - X0) / cell)); i++) for (let j = Math.max(0, Math.ceil((y0 - Y0) / cell)); j <= Math.min(NY - 1, Math.floor((y1 - Y0) / cell)); j++) {
      const x = X0 + i * cell, y = Y0 + j * cell;
      const l1 = ((P[1][1] - P[2][1]) * (x - P[2][0]) + (P[2][0] - P[1][0]) * (y - P[2][1])) / det, l2 = ((P[2][1] - P[0][1]) * (x - P[2][0]) + (P[0][0] - P[2][0]) * (y - P[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const z = l1 * P[0][2] + l2 * P[1][2] + l3 * P[2][2], g = j * NX + i;
      if (z <= depth[g]) continue;
      depth[g] = z;
      const w = [l1, l2, l3];
      for (const a of [0, 1]) flatAt[g * 2 + a] = c.reduce((m, v, k) => m + w[k] * M.flat[v * 2 + a], 0);
      shadeAt[g] = c.reduce((m, v, k) => m + w[k] * M.shade[v], 0);
    }
  }
  // 4. The chest's surface there: z = a quadratic in x and y, fitted (least squares) to the covered cells round the hole.
  const A = Array.from({ length: 6 }, () => new Float64Array(6)), bv = new Float64Array(6);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const g = j * NX + i;
    if (!Number.isFinite(depth[g]) || (i + j) % 2) continue;
    const x = X0 + i * cell, y = Y0 + j * cell, r = [1, x, y, x * x, x * y, y * y];
    for (let p2 = 0; p2 < 6; p2++) { bv[p2] += r[p2] * depth[g]; for (let q = 0; q < 6; q++) A[p2][q] += r[p2] * r[q]; }
  }
  for (let p2 = 0; p2 < 6; p2++) { const piv = A[p2][p2] || 1e-12; for (let q = p2 + 1; q < 6; q++) { const f = A[q][p2] / piv; for (let r2 = p2; r2 < 6; r2++) A[q][r2] -= f * A[p2][r2]; bv[q] -= f * bv[p2]; } }
  const cf = new Float64Array(6);
  for (let p2 = 5; p2 >= 0; p2--) { let v = bv[p2]; for (let q = p2 + 1; q < 6; q++) v -= A[p2][q] * cf[q]; cf[p2] = v / (A[p2][p2] || 1e-12); }
  const fit = (x, y) => cf[0] + cf[1] * x + cf[2] * y + cf[3] * x * x + cf[4] * x * y + cf[5] * y * y;
  // (Its print places: as the model's chest round it, the flat place's rate across and up there.)
  let sx = 0, sxx = 0, sy = 0, cnt = 0;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const g = j * NX + i, x = X0 + i * cell, y = Y0 + j * cell; if (Number.isFinite(depth[g]) && Math.abs(x) > 0.02 && Math.abs(x) < 0.12) { sx += flatAt[g * 2] * x; sxx += x * x; sy += flatAt[g * 2 + 1] - y; cnt++; } }
  const kx = sxx ? sx / sxx : 1, dy = cnt ? sy / cnt : 0;
  // The nearest covered cell (for the edge: the cloth's own depth, so the fill meets it).
  const near = (i, j, R) => { let best = null; for (let a = -R; a <= R; a++) for (let c2 = -R; c2 <= R; c2++) { const ii = i + a, jj = j + c2; if (ii < 0 || jj < 0 || ii >= NX || jj >= NY) continue; const g = jj * NX + ii; if (!Number.isFinite(depth[g])) continue; const d = Math.hypot(a, c2); if (!best || d < best.d) best = { d, g, x: X0 + ii * cell, y: Y0 + jj * cell }; } return best; };
  const zAt = (x, y) => {
    const i = Math.round((x - X0) / cell), j = Math.round((y - Y0) / cell), nbc = near(i, j, 6), f = fit(x, y);
    if (!nbc) return f;
    const w = Math.max(0, 1 - (nbc.d * cell) / 0.018);
    return f + (depth[nbc.g] - fit(nbc.x, nbc.y)) * w * w * (3 - 2 * w);
  };
  const nAt = (x, y) => { const e = 0.002, zx = (zAt(x + e, y) - zAt(x - e, y)) / (2 * e), zy = (zAt(x, y + e) - zAt(x, y - e)) / (2 * e), l = Math.hypot(zx, zy, 1); return [-zx / l, -zy / l, 1 / l]; };
  // 5. The fill: grid cells not covered, outside the round neck, up to the straps (and one cell under the cloth's edge).
  const pos = Array.from(M.pos), nor = Array.from(M.nor), flat = Array.from(M.flat), side = Array.from(M.side), shade = Array.from(M.shade), bands = Array.from(band);
  // (Only up to where the round neck meets the straps: higher, the chest's fitted surface no longer follows the strap as
  // it turns back over the shoulder, and the fill stood out through our band there as bits of cloth (user, image 550).)
  const id = new Int32Array(NX * NY).fill(-1), yTop = yJ + 0.004;
  const want = (i, j) => {
    const x = X0 + i * cell, y = Y0 + j * cell;
    if (y > yTop || y < 0.52 || inside(x, y) || Math.abs(x) > xJ + 0.035) return false;
    const g = j * NX + i;
    if (!Number.isFinite(depth[g])) return true;
    for (const [a, c2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + c2; if (ii >= 0 && jj >= 0 && ii < NX && jj < NY && !Number.isFinite(depth[jj * NX + ii]) && !inside(X0 + ii * cell, Y0 + jj * cell) && Y0 + jj * cell <= yTop) return true; }
    return false;
  };
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    if (!want(i, j)) continue;
    const x = X0 + i * cell, y = Y0 + j * cell, g = j * NX + i;
    id[g] = pos.length / 3;
    pos.push(x, y, Number.isFinite(depth[g]) ? depth[g] - 0.0008 : zAt(x, y)); nor.push(...nAt(x, y));
    flat.push(x * kx, y + dy); side.push(0); bands.push(0);
    const nbc = near(i, j, 8);
    shade.push(nbc ? shadeAt[nbc.g] : 1);
  }
  for (let j = 0; j + 1 < NY; j++) for (let i = 0; i + 1 < NX; i++) {
    const a = id[j * NX + i], b2 = id[j * NX + i + 1], c = id[(j + 1) * NX + i], d = id[(j + 1) * NX + i + 1];
    if (a >= 0 && b2 >= 0 && c >= 0) idx.push(a, b2, c);
    if (b2 >= 0 && d >= 0 && c >= 0) idx.push(b2, d, c);
    if (a >= 0 && b2 >= 0 && d >= 0 && c < 0) idx.push(a, b2, d);
    if (a >= 0 && d >= 0 && c >= 0 && b2 < 0) idx.push(a, d, c);
  }
  // 6. The neck's line all the way round: in front the round neck (the band's top, `top` off the fill), from the right
  // strap down through the foot up to the left strap; then the model's edge over the left strap, round the back and over
  // the right strap. Every 2.5 mm, smoothed along itself (2 cm either way, twice): one curve, no corner at the straps.
  const ctrl = [];
  const frontPt = (x, y) => { const n = nAt(x, y), z = zAt(x, y); return { p: [x + n[0] * top, y + n[1] * top, z + n[2] * top], f: 1 }; };
  for (let y = yJ - 0.0015; y > foot; y -= 0.0015) ctrl.push(frontPt(-roundX(y), y));
  ctrl.push(frontPt(0, foot));
  for (let y = foot + 0.0015; y < yJ; y += 0.0015) ctrl.push(frontPt(roundX(y), y));
  for (const c of crest) ctrl.push({ p: c.p, f: 0 });
  const STEP = 0.0025, loop = [];
  for (let k = 0, carry = 0; k < ctrl.length; k++) {
    const a = ctrl[k], b2 = ctrl[(k + 1) % ctrl.length], len = Math.hypot(b2.p[0] - a.p[0], b2.p[1] - a.p[1], b2.p[2] - a.p[2]);
    let s2 = carry;
    for (; s2 < len; s2 += STEP) { const t = s2 / (len || 1); loop.push({ p: a.p.map((v, j) => v + (b2.p[j] - v) * t), f: a.f + (b2.f - a.f) * t }); }
    carry = s2 - len;
  }
  const L = loop.length, at = (k) => loop[((k % L) + L) % L];
  const smoothLoop = (get, set, span, passes = 1) => {
    for (let pass = 0; pass < passes; pass++) {
      const vals = loop.map((_, k) => { const sum = get(at(k)).map(() => 0); for (let j = -span; j <= span; j++) get(at(k + j)).forEach((v, q) => (sum[q] += v)); return sum.map((v) => v / (2 * span + 1)); });
      vals.forEach((v, k) => set(loop[k], v));
    }
  };
  smoothLoop((o) => [...o.p, o.f], (o, v) => { o.p = v.slice(0, 3); o.f = v[3]; }, 8, 2);
  // 7. At each place along it: the cloth's edge the band reaches out to (G) and the way off the cloth there (N). Over the
  // straps and the back: the nearest point of the groove left by the model's band and the cloth's own normals round it;
  // in front: `width` out from the neck on the fill. Eased between the two by where the line comes from, and smoothed.
  const gp = groove.map(P3), gn = groove.map((v) => [M.nor[v * 3], M.nor[v * 3 + 1], M.nor[v * 3 + 2]]);
  loop.forEach((o, k) => {
    const a = at(k - 1).p, b2 = at(k + 1).p, T = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], tl = Math.hypot(...T) || 1;
    o.T = T.map((v) => v / tl);
    // Front: out of the opening in the front view (down and outwards), on the fill.
    let ox = o.T[1], oy = -o.T[0];
    const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol;
    if (oy > 0.2 || (Math.abs(oy) <= 0.2 && ox * o.p[0] < 0)) { ox = -ox; oy = -oy; }
    const fx = o.p[0] + ox * width, fy = o.p[1] + oy * width, Gf = [fx, fy, zAt(fx, fy) + 0.0004], Nf = nAt(o.p[0], o.p[1]);
    // Model: the nearest groove point, and the cloth's normals within 1.5 cm of it.
    let best = -1, bd = Infinity;
    for (let g = 0; g < gp.length; g++) { const d = Math.hypot(gp[g][0] - o.p[0], gp[g][1] - o.p[1], gp[g][2] - o.p[2]); if (d < bd) { bd = d; best = g; } }
    const Gm = best >= 0 ? gp[best] : Gf, Nm = [0, 0, 0];
    if (best >= 0) for (let g = 0; g < gp.length; g++) if (Math.hypot(gp[g][0] - Gm[0], gp[g][1] - Gm[1], gp[g][2] - Gm[2]) < 0.015) for (let q = 0; q < 3; q++) Nm[q] += gn[g][q];
    const nl = Math.hypot(...Nm) || 1, w = Math.max(0, Math.min(1, o.f));
    o.G = Gm.map((v, q) => v + (Gf[q] - v) * w);
    o.N = Nm.map((v, q) => v / nl + (Nf[q] - v / nl) * w);
  });
  smoothLoop((o) => [...o.G, ...o.N], (o, v) => { o.G = v.slice(0, 3); const l = Math.hypot(v[3], v[4], v[5]) || 1; o.N = [v[3] / l, v[4] / l, v[5] / l]; }, 6, 2);
  // (Over the straps and the back the smoothing pulled the line down under the strap tops' cloth, so the band was hidden
  // there and the cloth showed in its place (user 2026-11-13, image 550): each place lifted off the cloth again, as high
  // as the model's own edge within 2 cm of it and 1.5 mm more, and never lower than the cloth's edge beside it; eased
  // along the line, and none of it in front on the fill.)
  const lifts = loop.map((o) => {
    if (o.f > 0.95) return 0;
    let h = 0;
    for (const p of crestRaw) { const d = [p[0] - o.p[0], p[1] - o.p[1], p[2] - o.p[2]]; if (Math.hypot(...d) < 0.02) h = Math.max(h, d[0] * o.N[0] + d[1] * o.N[1] + d[2] * o.N[2]); }
    for (let g = 0; g < gp.length; g++) { const d = [gp[g][0] - o.p[0], gp[g][1] - o.p[1], gp[g][2] - o.p[2]]; if (Math.hypot(...d) < 0.03) h = Math.max(h, d[0] * o.N[0] + d[1] * o.N[1] + d[2] * o.N[2] + 0.002); }
    return (h + 0.0015) * (1 - Math.max(0, o.f));
  });
  loop.forEach((o, k) => { let m = 0; for (let j = -4; j <= 4; j++) m = Math.max(m, lifts[((k + j) % L + L) % L] * (1 - Math.abs(j) / 6)); o.p = o.p.map((v, q) => v + o.N[q] * m); });
  // 8. Our band: at each place a section from its foot on the cloth (just past G, tucked in) up its face to its top (the
  // line), rolled over towards the opening and turned down inside (6 mm in, 1.2 cm down).
  const FACE = [1, 0.85, 0.62, 0.38, 0.14], SHADE = [0.82, 1, 1, 1, 1, 1, 1, 0.9, 0.78, 0.7, 0.7], RN = SHADE.length;
  const cpos = [], cshade = [];
  for (const o of loop) {
    const C = o.p, N = o.N, d = [o.G[0] - C[0], o.G[1] - C[1], o.G[2] - C[2]], dn = d[0] * N[0] + d[1] * N[1] + d[2] * N[2];
    const vt = [d[0] - N[0] * dn, d[1] - N[1] * dn, d[2] - N[2] * dn], vl = Math.hypot(...vt) || 1, v = vt.map((x) => x / vl);
    o.v = v;
    const add = (base, a, h) => cpos.push(base[0] + v[0] * a + N[0] * h, base[1] + v[1] * a + N[1] * h, base[2] + v[2] * a + N[2] * h);
    // (Its foot tucked 6 mm under the cloth (was 1.2 mm): where the strap tops' cloth dips, the strip from the foot up to the
    // face's edge came out through it as dark ragged streaks along the band's lower edge (user 2026-11-16, image 558).)
    add(o.G, 0.007, -0.006);
    // (Its face a little fuller over the straps and the back, clear of the cloth's edge under it.)
    for (const f of FACE) add([C[0] + d[0] * f, C[1] + d[1] * f, C[2] + d[2] * f], 0, (0.0007 + 0.0022 * (1 - Math.max(0, Math.min(1, o.f)))) * Math.sin(Math.PI * Math.min(1, f + 0.12)));
    add(C, 0, 0);
    add(C, -0.0022, -0.0018);
    add(C, -0.0016, -0.0044);
    add(C, 0.004, -0.0062);
    add(C, 0.02, -0.0062);
    cshade.push(...SHADE);
  }
  // (Where the cloth under it stands higher than its face (over the straps' tops the model's cloth rises up to where its
  // band was), the face lifted clear of it there, its foot left tucked in, so no cloth shows through the band (user
  // 2026-11-16, image 551: yellow bits in the band's edge there).)
  // (The model's band points kept beyond our band's edge, on the cloth side (the model marks a few of the strap tops'
  // cloth as band): printed as the cloth round them, not as dark bits beside our band (user 2026-11-16, image 551).)
  for (let v = 0; v < n0; v++) {
    if (bands[v] !== 1 || pos[v * 3 + 1] < 0.66) continue;
    let bk = -1, bd = 0.03;
    for (let k = 0; k < L; k++) { const d = Math.hypot(loop[k].p[0] - pos[v * 3], loop[k].p[1] - pos[v * 3 + 1], loop[k].p[2] - pos[v * 3 + 2]); if (d < bd) { bd = d; bk = k; } }
    if (bk < 0) continue;
    const o = loop[bk], q = [0, 1, 2].map((j) => pos[v * 3 + j] - o.p[j]), qg = [0, 1, 2].map((j) => o.G[j] - o.p[j]);
    const a = q[0] * o.v[0] + q[1] * o.v[1] + q[2] * o.v[2], ag = qg[0] * o.v[0] + qg[1] * o.v[1] + qg[2] * o.v[2];
    // (Anything of it out past our band's face edge (G), not only 2 mm past it: its own edge showed there as a thin dark line
    // on the strap tops beside our band (user 2026-11-16, image 558). Colour only.)
    if (a > ag - 0.0005) bands[v] = 0;
  }
  {
    const W = [0, 1, 1, 0.85, 0.6, 0.3, 0], used = new Set(idx), cloth = [];
    // (The model's own band points under ours too (MODELQ6 2026-11-17, image 558: bits of its band and cloth came out
    // through our band's lower edge as dark flecks): our band's face is lifted clear of every point of the model there.)
    for (const i of used) if ((bands[i] === 0 || bands[i] === 1) && pos[i * 3 + 1] > 0.66) cloth.push(i);
    const need = loop.map((o, k) => {
      const C = o.p, rows = [];
      for (let r = 0; r <= 6; r++) { const q = [0, 1, 2].map((j) => cpos[(k * RN + r) * 3 + j] - C[j]); rows.push([q[0] * o.v[0] + q[1] * o.v[1] + q[2] * o.v[2], q[0] * o.N[0] + q[1] * o.N[1] + q[2] * o.N[2]]); }
      let m = 0;
      for (const i of cloth) {
        const q = [pos[i * 3] - C[0], pos[i * 3 + 1] - C[1], pos[i * 3 + 2] - C[2]];
        if (Math.abs(q[0] * o.T[0] + q[1] * o.T[1] + q[2] * o.T[2]) > 0.005) continue;
        const a = q[0] * o.v[0] + q[1] * o.v[1] + q[2] * o.v[2], h = q[0] * o.N[0] + q[1] * o.N[1] + q[2] * o.N[2];
        for (let r = 1; r < 6; r++) {
          const [a0, h0] = rows[r], [a1, h1] = rows[r + 1];
          if ((a - a0) * (a - a1) > 0 || a0 === a1) continue;
          const t = (a - a0) / (a1 - a0), w = W[r] + (W[r + 1] - W[r]) * t, over = h - (h0 + (h1 - h0) * t) + 0.0006;
          if (over > 0 && w > 0.25) m = Math.max(m, Math.min(0.004, over / w));
          break;
        }
      }
      return m;
    });
    loop.forEach((o, k) => {
      let m = 0;
      for (let j = -4; j <= 4; j++) m = Math.max(m, need[((k + j) % L + L) % L] * (1 - Math.abs(j) / 6));
      if (m) for (let r = 1; r <= 5; r++) for (let j = 0; j < 3; j++) cpos[(k * RN + r) * 3 + j] += o.N[j] * m * W[r];
    });
  }
  const cidx = [];
  for (let k = 0; k < L; k++) for (let r = 0; r + 1 < RN; r++) { const a = k * RN + r, c = ((k + 1) % L) * RN + r; cidx.push(a, c, a + 1, a + 1, c, c + 1); }
  // (Wound so its outside faces out: checked on its face at the first place, turned round if not.)
  {
    const q = (i) => [cpos[i * 3], cpos[i * 3 + 1], cpos[i * 3 + 2]], a = q(cidx[6]), b2 = q(cidx[7]), c = q(cidx[8]);
    const e1 = b2.map((x, j) => x - a[j]), e2 = c.map((x, j) => x - a[j]), fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (fn[0] * loop[0].N[0] + fn[1] * loop[0].N[1] + fn[2] * loop[0].N[2] < 0) for (let t = 0; t < cidx.length; t += 3) { const x = cidx[t + 1]; cidx[t + 1] = cidx[t + 2]; cidx[t + 2] = x; }
  }
  // 9. The cloth's edges left open where the model's band came off and our band does not reach (over the straps' tops
  // its band filled the strap from the neck right to the armhole binding, ours is narrower: a gap there you saw through,
  // user 2026-11-16, image 551): each such edge carried on as cloth up under our band's edge, printed on from the cloth
  // beside it, and the band's foot turned in under it there, so nothing shows through and nothing beside the band.
  bridgeGaps({ pos, nor, flat, side, shade, bands, idx, n0, M, cpos, cidx, RN, loop });
  const rimPts = loop.filter((_, k) => k % 5 === 0).map((o) => o.p);
  const count = pos.length / 3;
  const out = {
    ...M, count, pos: Float32Array.from(pos), nor: Float32Array.from(nor), flat: Float32Array.from(flat), side: Uint8Array.from(side), shade: Float32Array.from(shade),
    band: Uint8Array.from(bands), idx: count > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx),
    collar: { pos: Float32Array.from(cpos), shade: Float32Array.from(cshade), idx: cpos.length / 3 > 65535 ? Uint32Array.from(cidx) : Uint16Array.from(cidx) },
    vEdge: loop.filter((o, k) => o.f > 0.5 && k % 5 === 0).map((o) => o.p).sort((m, n) => m[0] - n[0]), neckRim: rimPts,
    roundFlat: Array.from({ length: Math.ceil((yJ - foot) / 0.0015) + 1 }, (_, k) => { const y = Math.min(yJ, foot + k * 0.0015); return [roundX(y) * kx, y + dy]; }),
  };
  decoded.set(key, out);
  return out;
}

/**
 * roundFill's step 9 (user 2026-11-16, image 551: a hole at the strap tops): the outside cloth's edges near the neck that
 * taking the model's band off left open (not open in the model) and that our band does not cover (more than 1.2 mm from
 * its foot and face, no fill over them; the armhole binding's too, carried on as cloth). Where they are, the band's foot
 * turned in steeply under its face's edge (so it does not show beside the band), and each such edge carried on by a strip
 * of cloth to just under the band's face at its edge. The strip's new edge points take their print on from the cloth's
 * triangle at the edge (its flat places carried on). (The inside's edges are left: the outside's strip closes the gap.)
 */
function bridgeGaps({ pos, nor, flat, side, shade, bands, idx, n0, M, cpos, cidx, RN, loop }) {
  // (Edges counted by place: the model's points sewn together where it has two at one place.)
  const P = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], first = new Map(), same = new Int32Array(n0);
  for (let v = 0; v < n0; v++) { if (pos[v * 3 + 1] < 0.6) { same[v] = v; continue; } const k = P(v).join(); if (!first.has(k)) first.set(k, v); same[v] = first.get(k); }
  const key = (a, b) => { const p = a < n0 ? same[a] : a, q = b < n0 ? same[b] : b; return p < q ? p * 1048576 + q : q * 1048576 + p; };
  // (Only round the neck: triangles with a corner above 0.62 m.)
  const high = (I, t) => pos[I[t] * 3 + 1] > 0.62 || pos[I[t + 1] * 3 + 1] > 0.62 || pos[I[t + 2] * 3 + 1] > 0.62;
  const counted = (I) => { const m = new Map(); for (let t = 0; t < I.length; t += 3) if (high(I, t)) for (let k = 0; k < 3; k++) { const e = key(I[t + k], I[t + (k + 1) % 3]); m.set(e, (m.get(e) ?? 0) + 1); } return m; };
  const now = counted(idx), was = counted(M.idx);
  // The open edges (as their triangles have them, a to b, c the triangle's third corner).
  const open = [];
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    if (!high(idx, t)) break;
    const a = idx[t + k], b = idx[t + (k + 1) % 3], c = idx[t + (k + 2) % 3];
    if (a >= n0 || b >= n0 || now.get(key(a, b)) !== 1 || was.get(key(a, b)) === 1) continue;
    open.push({ a, b, c });
  }
  // (The fill's points, by 4 mm cells: a cloth edge with one of them near is under the fill.)
  const cellOf = (p) => `${Math.floor(p[0] / 0.004)},${Math.floor(p[1] / 0.004)},${Math.floor(p[2] / 0.004)}`, fill = new Map();
  for (let v = n0; v < pos.length / 3; v++) { const k = cellOf(P(v)); (fill.get(k) ?? fill.set(k, []).get(k)).push(v); }
  const underFill = (p) => {
    const c = cellOf(p).split(',').map(Number);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) for (const v of fill.get(`${c[0] + a},${c[1] + b},${c[2] + d}`) ?? []) { const q = P(v); if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 0.004) return true; }
    return false;
  };
  // (Our band's outside, rows `from` to 6: its triangles with their outward normals, by 2.5 cm cells of their first corner.)
  const C3 = (i) => [cpos[i * 3], cpos[i * 3 + 1], cpos[i * 3 + 2]], cell = (p) => `${Math.floor(p[0] / 0.025)},${Math.floor(p[1] / 0.025)},${Math.floor(p[2] / 0.025)}`;
  const bandTris = (from) => {
    const out = new Map();
    for (let t = 0; t < cidx.length; t += 3) {
      const r = Math.floor(t / 6) % (RN - 1);
      if (r < from || r > 5) continue;
      const a = C3(cidx[t]), b = C3(cidx[t + 1]), c = C3(cidx[t + 2]);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n);
      if (l > 1e-12) { const k = cell(a); (out.get(k) ?? out.set(k, []).get(k)).push({ a, b, c, n: n.map((x) => x / l) }); }
    }
    return out;
  };
  // The nearest point of a triangle (Ericson's closest point).
  const sub = (u, w) => [u[0] - w[0], u[1] - w[1], u[2] - w[2]], dot = (u, w) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2], at = (o, u, s, w = [0, 0, 0], t = 0) => [o[0] + u[0] * s + w[0] * t, o[1] + u[1] * s + w[1] * t, o[2] + u[2] * s + w[2] * t];
  const closest = (p, { a, b, c }) => {
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return a;
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(a, ab, d1 / (d1 - d3));
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(a, ac, d2 / (d2 - d6));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return at(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
    const dn = 1 / (va + vb + vc);
    return at(a, ab, vb * dn, ac, vc * dn);
  };
  const nearest = (p, tris) => {
    let best = null, bd = Infinity;
    const [i, j, k] = cell(p).split(',').map(Number);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const tri of tris.get(`${i + a},${j + b},${k + c}`) ?? []) {
      if (Math.abs(tri.a[0] - p[0]) > 0.025 || Math.abs(tri.a[1] - p[1]) > 0.025 || Math.abs(tri.a[2] - p[2]) > 0.025) continue;
      const q = closest(p, tri), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (d < bd) { bd = d; best = { q, n: tri.n, d }; }
    }
    return best;
  };
  // 1. The open edges' points our band does not cover (its foot and face).
  const gap = new Set(), seen = new Set();
  const look = (tris) => { for (const { a, b } of open) for (const v of [a, b]) { if (seen.has(v)) continue; const p = P(v); if (p[1] <= 0.66 || bands[v] >= 3 || underFill(p)) { seen.add(v); continue; } const hit = nearest(p, tris); if (hit && hit.d > 0.0012 && hit.d < 0.02) { gap.add(v); seen.add(v); } } };
  look(bandTris(0));
  if (!gap.size) return;
  // 2. There the band's foot turned in steeply: 3 mm out from its face's edge and 3.5 mm down (eased along the band over
  // 2 cm either way), so it stays under the cloth carried on to it and does not show beside the band.
  const L = loop.length, want = new Float32Array(L);
  for (const v of gap) {
    const p = P(v);
    let bk = -1, bd = 0.025;
    for (let k = 0; k < L; k++) { const d = Math.hypot(cpos[(k * RN + 1) * 3] - p[0], cpos[(k * RN + 1) * 3 + 1] - p[1], cpos[(k * RN + 1) * 3 + 2] - p[2]); if (d < bd) { bd = d; bk = k; } }
    if (bk >= 0) want[bk] = 1;
  }
  loop.forEach((o, k) => {
    let w = 0;
    for (let j = -8; j <= 8; j++) w = Math.max(w, want[((k + j) % L + L) % L] * Math.min(1, (9 - Math.abs(j)) / 4));
    if (!w) return;
    for (let j = 0; j < 3; j++) { const g = cpos[(k * RN + 1) * 3 + j], f = g + o.v[j] * 0.003 - o.N[j] * 0.0035, i = (k * RN) * 3 + j; cpos[i] += (f - cpos[i]) * w; }
  });
  // (Edges the turned-in foot no longer covers, with them.)
  seen.clear();
  for (const v of gap) seen.add(v);
  look(bandTris(0));
  // 3. Each such edge carried on to just under the band's face at its edge.
  const face = bandTris(1), to = new Map();
  const target = (v, c, b) => {
    if (to.has(v)) return to.get(v);
    let got = null;
    const hit = gap.has(v) ? nearest(P(v), face) : null;
    if (hit) {
      const p = P(v), q = hit.q.map((x, i) => x - hit.n[i] * 0.0006), d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      // (Its print: the edge triangle's flat places carried on, d = s (b - v) + t (c - v) on its plane.)
      const e1 = [pos[b * 3] - p[0], pos[b * 3 + 1] - p[1], pos[b * 3 + 2] - p[2]], e2 = [pos[c * 3] - p[0], pos[c * 3 + 1] - p[1], pos[c * 3 + 2] - p[2]];
      const g11 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], g12 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2], g22 = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2];
      const r1 = d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2], r2 = d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2], det = g11 * g22 - g12 * g12;
      let s = 0, t2 = 0;
      if (Math.abs(det) > 1e-16) { s = (r1 * g22 - r2 * g12) / det; t2 = (r2 * g11 - r1 * g12) / det; }
      let fx = s * (flat[b * 2] - flat[v * 2]) + t2 * (flat[c * 2] - flat[v * 2]), fy = s * (flat[b * 2 + 1] - flat[v * 2 + 1]) + t2 * (flat[c * 2 + 1] - flat[v * 2 + 1]);
      const fl = Math.hypot(fx, fy), cap = 1.5 * Math.hypot(...d);
      if (fl > cap) { fx *= cap / fl; fy *= cap / fl; }
      got = pos.length / 3;
      pos.push(...q); nor.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]); flat.push(flat[v * 2] + fx, flat[v * 2 + 1] + fy);
      side.push(side[v]); shade.push(shade[v]); bands.push(0);
    }
    to.set(v, got);
    return got;
  };
  for (const { a, b, c } of open) {
    const a2 = target(a, c, b), b2 = target(b, c, a);
    if (a2 == null && b2 == null) continue;
    // (Wound as the cloth beside it: the edge b to a here.)
    if (a2 != null) idx.push(b, a, a2);
    if (a2 != null && b2 != null) idx.push(b, a2, b2);
    else if (b2 != null) idx.push(b, a, b2);
  }
}

/** The basketball singlet's round neck on its pattern (front, + x side: [x, y] from the middle out), for the made singlet's
 *  outline (main.js): the round neck as printed on the fill. null before its model is here. */
export function bballRoundOutline(name) {
  if (!window.TRIPO_MESHES?.[name]?.band) return null;
  const R = roundFill(name);
  return R.roundFlat.filter(([, y]) => y <= R.roundFlat.at(-1)[1]);
}

/**
 * A model's V-neck on the flat pattern (garment metres, front, + x side): from the V's point out along its edge to where it
 * meets the model's own neck band, as the cut model prints it (cutNeck vFlat), for the made garment's outline (necks.js
 * neckCut), so the painter's V (its stitching) is the model's. null without one.
 */
export function tripoNeckOutline(name, neck) {
  const V = vOf(name, neck), cut = V ? cutNeck(name, V) : null;
  if (!cut?.vFlat?.length) return null;
  const pts = cut.vFlat.map(([x, y]) => [Math.max(0, x), y]).sort((a, b) => a[0] - b[0]);
  return [[0, pts[0][1]], ...pts.filter(([x]) => x > 0.003)];
}


/** Our V-neck binding (cutNeck's `collar`) as a shape printed in the neck binding's colour (its swatch, BAND_SWATCH). */
function collarGeometry(C, { minX, minY, span }, swatch = BAND_SWATCH, strip = false) {
  // (A model with no swatch of its own (an empty list: the tee): BAND_SWATCH, as when it has none.)
  if (!swatch?.[0]) swatch = BAND_SWATCH;
  const n = C.pos.length / 3, [x, y] = swatch[0], uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  // (`strip`: printed from the swatch's strip as the model's own band (bandAt), across ours from its foot (row 0) up its face
  // (the first 6 rows of each place along it: cutNeck) to its rolled top (1) and over.)
  for (let i = 0; i < n; i++) {
    const r = i % 14, [sx, sy] = strip ? bandAt(swatch[0], C.pos[i * 3], r < 6 ? r / 5 : 1 + (r - 5) * 0.12) : [x, y];
    uv[i * 2] = (0.5 * (sx - minX)) / span;
    uv[i * 2 + 1] = (sy - minY) / span;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = C.shade[i];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(C.pos.slice(), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setIndex(new THREE.BufferAttribute(C.idx.slice(), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Where on the flat pattern (front half, garment metres) a model's painter puts its bindings' plain colour: the neck's,
 *  the armholes'. Outside every garment's outline (high beside the straps), so nothing else is printed from there. (A
 *  model may bring its own, its data's `swatch`: the basketball singlet's, inside its smaller atlas.) */
export const BAND_SWATCH = [[0.32, 0.865], [-0.32, 0.865]];

/**
 * Where a model's neck band (with places across it) is printed from, in its swatch `sw` (garment metres): up a 2.4 cm strip
 * 1 cm for each band's width across it (`across`: 0 its foot, 1 its top fold, more down its inside), and along it 2 mm for
 * each cm out from the middle (`x`, the point's own). texture.js paints a collar's stripes and tips there.
 */
export const bandAt = ([sx, sy], x, across) => [sx - 0.012 + Math.min(0.024, Math.abs(x) * 0.2), sy - 0.012 + Math.min(0.024, across * 0.01)];

/** A model's bindings per point: its converter's marks (`band`), else found from its layout (bands); null if none. */
const bandsOf = (M) => M.band ?? (M.data.layout?.runs ? bands(M) : null);

/**
 * Which binding each point is on (0 none, 1 the neck, 2 an armhole): within 1.15 cm (its width) along the cloth of the binding's free
 * edge (its points: those on layout.runs), not on past its seam (another open edge of the model). Points at one place
 * (the side seams' copies) count as one.
 */
function bands(M) {
  // (A point and its copies: the same place, normal and print place; two sides of a seam may round to one place.)
  const n = M.count, I = M.idx, key = (i) => `${M.pos[i * 3]},${M.pos[i * 3 + 1]},${M.pos[i * 3 + 2]},${M.nor[i * 3]},${M.nor[i * 3 + 1]},${M.nor[i * 3 + 2]},${M.flat[i * 2]},${M.flat[i * 2 + 1]}`;
  const id = new Int32Array(n), ids = new Map();
  for (let i = 0; i < n; i++) { const k = key(i); if (!ids.has(k)) ids.set(k, ids.size); id[i] = ids.get(k); }
  const m = ids.size, use = new Map(), nb = Array.from({ length: m }, () => new Set());
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = id[I[t + e]], b = id[I[t + (e + 1) % 3]], k = a < b ? a * m + b : b * m + a;
    use.set(k, (use.get(k) ?? 0) + 1);
    nb[a].add(b); nb[b].add(a);
  }
  const open = new Uint8Array(m);
  for (const [k, c] of use) if (c === 1) { open[Math.floor(k / m)] = 1; open[k % m] = 1; }
  const pt = new Float32Array(m * 3);
  const nr = new Float32Array(m * 3);
  for (let i = 0; i < n; i++) { pt.set(M.pos.subarray(i * 3, i * 3 + 3), id[i] * 3); nr.set(M.nor.subarray(i * 3, i * 3 + 3), id[i] * 3); }
  // The free edges' points: those whose flat place is on a run.
  // (Matched within 0.15 mm: the runs keep 4 decimals, the points the file's flat unit.)
  const cell = (v) => Math.round(v * 1000), grid = new Map();
  M.data.layout.runs.forEach((sides, which) => sides.forEach((runs) => runs.forEach((run) => run.forEach(([x, y]) => {
    const k = `${cell(x)},${cell(y)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([x, y, which + 1]);
  }))));
  const onRun = (x, y) => {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const [px, py, w] of grid.get(`${cell(x) + a},${cell(y) + b}`) ?? []) if (Math.hypot(px - x, py - y) < 0.00015) return w;
    return 0;
  };
  const out = new Uint8Array(m), dist = new Float32Array(m).fill(Infinity), queue = [];
  for (let i = 0; i < n; i++) {
    const w = open[id[i]] && onRun(M.flat[i * 2], M.flat[i * 2 + 1]);
    if (w && dist[id[i]] > 0) { dist[id[i]] = 0; out[id[i]] = w; queue.push(id[i]); }
  }
  for (let q = 0; q < queue.length; q++) {
    const v = queue[q];
    // (Not on past another open edge: the band's seam.)
    if (dist[v] > 0 && open[v]) continue;
    for (const w of nb[v]) {
      // (Nor over a sharp turn of the cloth: where a band is sewn on without a gap, its seam is a crease.)
      if (dist[v] > 0.005 && nr[v * 3] * nr[w * 3] + nr[v * 3 + 1] * nr[w * 3 + 1] + nr[v * 3 + 2] * nr[w * 3 + 2] < 0.92) continue;
      const d = dist[v] + Math.hypot(pt[v * 3] - pt[w * 3], pt[v * 3 + 1] - pt[w * 3 + 1], pt[v * 3 + 2] - pt[w * 3 + 2]);
      if (d < 0.0115 && d < dist[w]) { dist[w] = d; out[w] = out[v]; queue.push(w); }
    }
  }
  // (No stray islands: a few points of a binding cut off from its band, where the model's binding piece juts onto the
  // strap, stay the cloth's.)
  const seen = new Uint8Array(m);
  for (let s = 0; s < m; s++) {
    if (!out[s] || seen[s]) continue;
    const group = [s];
    seen[s] = 1;
    for (let k = 0; k < group.length; k++) for (const w of nb[group[k]]) if (out[w] && !seen[w]) { seen[w] = 1; group.push(w); }
    if (group.length < 40) for (const v of group) out[v] = 0;
  }
  return Uint8Array.from(id, (k) => out[k]);
}

/**
 * The model's own seams and trims on the flat pattern, for its painter (the file's `layout`, garment metres): `tabs`
 * [cx, cy, w, h] (trims sewn on the front), `panel` the front side panels' inner edge (right half, top down, [x, y]),
 * `runs[binding][side]` the bindings' free edges ({x, y} runs; binding 0 the neck, 1 the armholes; side 0 front, 1
 * back) and `band[binding][side]` their bands as flat triangles (x, y corners, 6 numbers each). null without one.
 */
function layoutOf(D) {
  const L = D.layout;
  if (!L) return null;
  const tri = (b64) => Float32Array.from(new Int16Array(bytes(b64)), (v) => v * D.flatUnit);
  return {
    tabs: L.tabs ?? null,
    panel: L.panel ?? null,
    runs: L.runs?.map((sides) => sides.map((runs) => runs.map((run) => run.map(([x, y]) => ({ x, y }))))) ?? null,
    band: L.band?.map((sides) => sides.map(tri)) ?? null,
  };
}

/**
 * The model on a made garment (garment.js buildGarment's result): its printed shape (tripoShape), its neck opening's
 * rim (the file's `neck`: points round it, else the made garment's; with a V-neck its V in front), and `wearer`: what
 * the form under it (mannequin.js) and the neck label (label.js) read of a made garment, taken from the model, so both
 * sit inside it. `neckShape`: the design's neck (necks.js neckShape: 'v' cuts the dress's V, cutNeck).
 */
export function tripoGarment(name, garment, neckShape = null, opts = {}) {
  const shape = tripoShape(name, garment.frame, neckShape, opts);
  // (Its band left off: the opening's rim is the band's foot, the data's `foot`.)
  const rim = opts.dropBand && shape.data.foot ? shape.data.foot : shape.data.neck;
  const own = rim ? rim.map(([x, y, z]) => new THREE.Vector3(x, y, z)) : garment.neck;
  // (A neck made all the way round (the basketball singlet's round neck): its own edge.)
  const neck = shape.neckRim ? shape.neckRim.map(([x, y, z]) => new THREE.Vector3(x, y, z)) : shape.vEdge ? vNeckRim(own, shape.vEdge) : own;
  // (A neck filled in with our own cloth (fillNeck): the form under the filled shape, so it stays under the new cloth.)
  const P = shape.points, uncut = shape.vEdge && !shape.filled ? decode(name) : null, B = uncut?.pos ?? P, n = B.length / 3;
  // (The form under a V-neck and its neck as under the model's own round neck, from the model before its cut: it shows
  // in the V as the form's chest.)
  let body = null;
  if (garment.body) {
    // The form is shaped slice by slice from the fabric's points (mannequin.js), on a made garment's close grid: here the
    // model's points with its triangles' edge middles and centres, so every direction round each slice has fabric to
    // stay inside. Not the trims on the cloth (the file's side bit 2: bib tabs). Front and back as the made garment's
    // (here simply all of them, the last again for an odd count).
    const I = uncut?.idx ?? shape.geometry.index.array, side = uncut?.side ?? shape.side, out = [], seen = new Set();
    const add = (a, b, c, wa, wb, wc) => out.push(B[a] * wa + B[b] * wb + B[c] * wc, B[a + 1] * wa + B[b + 1] * wb + B[c + 1] * wc, B[a + 2] * wa + B[b + 2] * wb + B[c + 2] * wc);
    for (let i = 0; i < n; i++) if (!(side[i] & 2)) out.push(B[i * 3], B[i * 3 + 1], B[i * 3 + 2]);
    for (let t = 0; t < I.length; t += 3) {
      const k = [I[t], I[t + 1], I[t + 2]];
      if (k.some((v) => side[v] & 2)) continue;
      add(k[0] * 3, k[1] * 3, k[2] * 3, 1 / 3, 1 / 3, 1 / 3);
      for (let e = 0; e < 3; e++) {
        const a = k[e], b = k[(e + 1) % 3], key = a < b ? a * 65536 + b : b * 65536 + a;
        if (seen.has(key)) continue;
        seen.add(key);
        add(a * 3, b * 3, a * 3, 0.5, 0.5, 0);
      }
    }
    // (A model open round much of the body (the netball bib: its open sides, its back panel only low on the back; its
    // data's `form: 'made'`): the made garment's smooth worn shape too (garment.at every 1.2 cm over its pattern, none of
    // its creases), so the form is the made garment's wherever the model has no cloth and stays inside the model where it has.)
    if (shape.data.form === 'made' && garment.at) {
      const poly = garment.outline, { minX, maxX, minY, maxY } = garment.frame;
      const inside = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
      for (const back of [false, true]) for (let y = minY + 0.006; y < maxY; y += 0.012) for (let x = minX; x <= maxX; x += 0.012) {
        if (!inside(x, y)) continue;
        const q = garment.at(x, y, back);
        out.push(q.x, q.y, q.z);
      }
    }
    if ((out.length / 3) % 2) out.push(out[out.length - 3], out[out.length - 2], out[out.length - 1]);
    const m = out.length / 6;
    // A sleeved garment (the football jersey): how far along its sleeve each of those points is (the made garment's own
    // measure, garment.js sleeveAt, at the point's place on the flat pattern), so the form has its upper arms in the
    // model's sleeves; else all on the body.
    let sleeve = new Array(m).fill(-1);
    if (garment.sleeveAt && garment.body.sleeve?.some((l) => l >= 0)) {
      const UV = shape.geometry.getAttribute('uv').array, { minX, maxX, minY, span } = garment.frame;
      // (Each point's place from its print (its uv on the atlas), back to the flat pattern.)
      const flatOf = (u, v) => (u >= 0.5 ? [maxX - 2 * (u - 0.5) * span, minY + v * span] : [minX + 2 * u * span, minY + v * span]);
      const lab = [];
      // (Under a V-neck the points are the model's before its cut: their own flat places.)
      const fx = (i) => (uncut ? uncut.flat[i * 2] : flatOf(UV[i * 2], UV[i * 2 + 1])[0]), fy = (i) => (uncut ? uncut.flat[i * 2 + 1] : flatOf(UV[i * 2], UV[i * 2 + 1])[1]);
      const at = (x, y) => (Math.abs(x) < 0.2 ? -1 : garment.sleeveAt(x, y));
      for (let i = 0; i < n; i++) if (!(side[i] & 2)) lab.push(at(fx(i), fy(i)));
      seen.clear();
      for (let t = 0; t < I.length; t += 3) {
        const k = [I[t], I[t + 1], I[t + 2]];
        if (k.some((v) => side[v] & 2)) continue;
        lab.push(at((fx(k[0]) + fx(k[1]) + fx(k[2])) / 3, (fy(k[0]) + fy(k[1]) + fy(k[2])) / 3));
        for (let e = 0; e < 3; e++) {
          const a = k[e], b = k[(e + 1) % 3], key = a < b ? a * 65536 + b : b * 65536 + a;
          if (seen.has(key)) continue;
          seen.add(key);
          lab.push(at((fx(a) + fx(b)) / 2, (fy(a) + fy(b)) / 2));
        }
      }
      if (lab.length % 2) lab.push(lab.at(-1));
      // (One for each point, front and back alike: mannequin.js reads 2n of them.)
      sleeve = lab;
    }
    // (`shoulderFit`: the shoulders kept inside the model's narrower straps all round, mannequin.js.)
    // (`looseSleeve`: the arms ended 1.2 cm inside the model's sleeves and kept slim, as its sleeves stand off the arm.)
    // (`shoulderFit`: the shoulders kept inside the model's narrower straps all round, mannequin.js.)
    // (`looseSleeve`: the arms ended 1.2 cm inside the model's sleeves and kept slim, as its sleeves stand off the arm.)
    body = { ...garment.body, n: m, positions: Float32Array.from(out), sleeve, shoulderFit: true, ...(sleeve.some((l) => l >= 0) ? { looseSleeve: true } : {}) };
  }
  // The label hangs inside the back: `surface(x, y, true)` gives the model's innermost back there (backField).
  let field = null;
  const surface = (x, y, back = false) => {
    field ??= backField(P, shape.geometry.index.array, garment.frame.maxY);
    return { x, y, z: back ? field(x, y) : -Infinity };
  };
  const wearer = { kind: garment.kind, frame: garment.frame, body, neck: own, geometry: shape.geometry, surface };
  return { ...shape, neck, wearer, surface: surfaceOf(shape.geometry, garment.frame) };
}

/**
 * The model as worn, from its flat pattern: (x, y, back) (garment metres, front or back half) -> the point of the model
 * printed from there (its triangle there, by its corners' places on the pattern; else the nearest triangle's middle), for
 * a collar's own pieces sewn on it (rugbycollars.js buildCollarParts: a fold-down collar, buttons).
 */
function surfaceOf(geometry, { minX, maxX, minY, span }) {
  const P = geometry.getAttribute('position').array, UV = geometry.getAttribute('uv').array, I = geometry.index.array;
  const G = 0.01, grid = [new Map(), new Map()], tris = [];
  for (let t = 0; t < I.length; t += 3) {
    const k = [I[t], I[t + 1], I[t + 2]], back = UV[k[0] * 2] >= 0.5;
    if (k.some((v) => (UV[v * 2] >= 0.5) !== back)) continue;
    const f = k.map((v) => (back ? [maxX - 2 * (UV[v * 2] - 0.5) * span, minY + UV[v * 2 + 1] * span] : [minX + 2 * UV[v * 2] * span, minY + UV[v * 2 + 1] * span]));
    const ti = tris.push({ k, f }) - 1, xs = f.map((q) => q[0]), ys = f.map((q) => q[1]);
    if (Math.max(...xs) - Math.min(...xs) > 0.1 || Math.max(...ys) - Math.min(...ys) > 0.1) continue;
    for (let i = Math.floor(Math.min(...xs) / G); i <= Math.floor(Math.max(...xs) / G); i++) for (let j = Math.floor(Math.min(...ys) / G); j <= Math.floor(Math.max(...ys) / G); j++) {
      const key = `${i},${j}`, g = grid[back ? 1 : 0];
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(ti);
    }
  }
  const at = (tri, w) => new THREE.Vector3(...[0, 1, 2].map((c) => w[0] * P[tri.k[0] * 3 + c] + w[1] * P[tri.k[1] * 3 + c] + w[2] * P[tri.k[2] * 3 + c]));
  // (Smoothed over 6 mm round each place: the model's own small folds would tip a collar's pieces about.)
  const one = (x, y, back) => {
    const g = grid[back ? 1 : 0];
    let near = null, nd = Infinity;
    for (let r = 0; r <= 4; r++) {
      for (let i = Math.floor(x / G) - r; i <= Math.floor(x / G) + r; i++) for (let j = Math.floor(y / G) - r; j <= Math.floor(y / G) + r; j++) for (const ti of g.get(`${i},${j}`) ?? []) {
        const { f } = tris[ti], det = (f[1][1] - f[2][1]) * (f[0][0] - f[2][0]) + (f[2][0] - f[1][0]) * (f[0][1] - f[2][1]);
        if (Math.abs(det) < 1e-14) continue;
        const l1 = ((f[1][1] - f[2][1]) * (x - f[2][0]) + (f[2][0] - f[1][0]) * (y - f[2][1])) / det, l2 = ((f[2][1] - f[0][1]) * (x - f[2][0]) + (f[0][0] - f[2][0]) * (y - f[2][1])) / det, l3 = 1 - l1 - l2;
        if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return at(tris[ti], [l1, l2, l3]);
        const d = Math.hypot((f[0][0] + f[1][0] + f[2][0]) / 3 - x, (f[0][1] + f[1][1] + f[2][1]) / 3 - y);
        if (d < nd) { nd = d; near = ti; }
      }
      if (near != null) break;
    }
    return near != null ? at(tris[near], [1 / 3, 1 / 3, 1 / 3]) : new THREE.Vector3(x, y, back ? -0.1 : 0.1);
  };
  return (x, y, back = false) => [[0, 0], [0.006, 0], [-0.006, 0], [0, 0.006], [0, -0.006]].reduce((s, [dx, dy]) => s.add(one(x + dx, y + dy, back)), new THREE.Vector3()).divideScalar(5);
}

/**
 * The neck opening's rim with a V-neck: the model's own rim (`own`, round the opening) without its points in front
 * within the V, and the V's edge (`v`, x rising) in their place, in the rim's own order.
 */
function vNeckRim(own, v) {
  const reach = Math.max(...v.map(([x]) => Math.abs(x))), n = own.length;
  const gone = own.map((p) => p.z > 0 && Math.abs(p.x) < reach);
  const start = gone.findIndex((g, i) => !g && gone[(i + n - 1) % n]);
  if (start < 0) return own;
  const kept = [];
  for (let k = 0; k < n; k++) if (!gone[(start + k) % n]) kept.push(own[(start + k) % n]);
  const edge = v.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  if (kept.at(-1).x > kept[0].x) edge.reverse();
  return [...kept, ...edge];
}

/**
 * The model's back near the neck as a height field seen from the front: for (x, y) on a 2 mm grid (|x| < 6 cm, the
 * top 30 cm), the innermost (largest) z of its triangles there that lie behind the middle (z < 0); -Infinity where none.
 */
function backField(P, I, top) {
  const G = 0.002, X0 = -0.06, Y0 = top - 0.3, NX = Math.round(0.12 / G) + 1, NY = Math.round(0.32 / G) + 1;
  const z = new Float32Array(NX * NY).fill(-Infinity);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    if (P[a + 2] >= 0 || P[b + 2] >= 0 || P[c + 2] >= 0) continue;
    const x0 = Math.min(P[a], P[b], P[c]), x1 = Math.max(P[a], P[b], P[c]), y0 = Math.min(P[a + 1], P[b + 1], P[c + 1]), y1 = Math.max(P[a + 1], P[b + 1], P[c + 1]);
    if (x1 < X0 || x0 > X0 + 0.12 || y1 < Y0 || y0 > Y0 + 0.32) continue;
    const det = (P[b + 1] - P[c + 1]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 1] - P[c + 1]);
    if (Math.abs(det) < 1e-12) continue;
    for (let i = Math.max(0, Math.ceil((x0 - X0) / G)); i <= Math.min(NX - 1, Math.floor((x1 - X0) / G)); i++) {
      for (let j = Math.max(0, Math.ceil((y0 - Y0) / G)); j <= Math.min(NY - 1, Math.floor((y1 - Y0) / G)); j++) {
        const x = X0 + i * G, y = Y0 + j * G;
        const l1 = ((P[b + 1] - P[c + 1]) * (x - P[c]) + (P[c] - P[b]) * (y - P[c + 1])) / det, l2 = ((P[c + 1] - P[a + 1]) * (x - P[c]) + (P[a] - P[c]) * (y - P[c + 1])) / det, l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        const k = j * NX + i;
        z[k] = Math.max(z[k], l1 * P[a + 2] + l2 * P[b + 2] + l3 * P[c + 2]);
      }
    }
  }
  return (x, y) => {
    const i = Math.round((x - X0) / G), j = Math.round((y - Y0) / G);
    return i < 0 || j < 0 || i >= NX || j >= NY ? -Infinity : z[j * NX + i];
  };
}

/**
 * The necks filled in on a V-necked model (SCJERSEY 2026-11-13, the user: every neck style on every model): the soccer
 * jersey's round neck and shallow V. Seen from the front (the model's x and y, metres): `xJ`, where our band meets the
 * model's own band on each side (it is cut off straight up and down there, its shoulder and back kept); `drop`, how far
 * under the top of the model's band there the new neck's edge is at the middle; `v`: straight sides to a point (else a
 * round curve); `width`, our band's width along the cloth at the middle (at its ends the model band's); `lift` its face off
 * the cloth, `thick` from its face to its inside (metres).
 */
const FILL_NECKS = {
  'soccer-jersey': {
    round: { xJ: 0.09, drop: 0.018, width: 0.014, lift: 0.0015, thick: 0.004 },
    shallow: { xJ: 0.09, drop: 0.04, v: true, width: 0.014, lift: 0.0015, thick: 0.004 },
  },
};

/**
 * The model with its front neck filled in to a higher neck (FILL_NECKS), made once: the model's V (its band and the cloth
 * just under it, in front between the two ends) taken off along a line 4 mm under the band's foot, the opening filled with
 * our own cloth up to the new neck (its shape and print carried on smoothly from the cloth round it: a smooth surface fitted
 * to the chest there, eased to meet the cut edge exactly, the print's places likewise) and our own band along the new
 * neck's edge, from where it meets the model's band on one side round to the other (`collar`, printed in the Neck trim
 * colour: collarGeometry). Fields as cutNeck's (`vEdge`: the new neck's edge, x rising).
 */
function fillNeck(name, kind, F) {
  const cacheKey = `${name}:fill:${kind}`;
  if (decoded.has(cacheKey)) return decoded.get(cacheKey);
  const M = decode(name), band = M.band ?? new Uint8Array(M.count), { xJ } = F;
  // The model's band in front seen from the front: its foot (lowest) and top (highest) by |x|, every 5 mm.
  const STEP = 0.005, bins = Math.ceil((xJ + 0.02) / STEP) + 1, foot = new Array(bins).fill(Infinity), top = new Array(bins).fill(-Infinity);
  for (let i = 0; i < M.count; i++) {
    if (band[i] !== 1 || M.pos[i * 3 + 2] <= 0 || M.side[i] & 1) continue;
    const k = Math.round(Math.abs(M.pos[i * 3]) / STEP);
    if (k >= bins) continue;
    foot[k] = Math.min(foot[k], M.pos[i * 3 + 1]);
    top[k] = Math.max(top[k], M.pos[i * 3 + 1]);
  }
  const fill = (arr) => { for (let k = 0; k < bins; k++) if (!Number.isFinite(arr[k])) arr[k] = arr[k - 1] ?? arr.find(Number.isFinite); };
  // The foot as a straight line each side (a V: least squares over the bins out to the ends), the cut line 1 cm under it
  // and under every bin's own foot.
  let sx = 0, sy = 0, sxx = 0, sxy = 0, cnt = 0;
  for (let k = 0; k * STEP <= xJ; k++) if (Number.isFinite(foot[k])) { const x = k * STEP; sx += x; sy += foot[k]; sxx += x * x; sxy += x * foot[k]; cnt++; }
  const slope = (cnt * sxy - sx * sy) / (cnt * sxx - sx * sx || 1), icpt = (sy - slope * sx) / cnt;
  let under = 0;
  for (let k = 0; k * STEP <= xJ; k++) if (Number.isFinite(foot[k])) under = Math.max(under, icpt + slope * k * STEP - foot[k]);
  fill(foot); fill(top);
  const at = (arr, ax) => { const t = Math.min(bins - 1.001, ax / STEP), k = Math.floor(t); return arr[k] + (arr[k + 1] - arr[k]) * (t - k); };
  const L = (x) => icpt + slope * Math.abs(x) - under - 0.01;
  const yTopJ = at(top, xJ);
  // The model's band is cut off square to its run up the V's side (its direction u, the foot line's slope), through the top
  // of its edge at xJ; ours ends on the same line (dEnd, into the cloth), as wide as the model's there (to the foot line).
  const ul = Math.hypot(1, slope), u = [1 / ul, slope / ul], dEnd = [slope / ul, -1 / ul];
  const past = (x, y) => (Math.abs(x) - xJ) * u[0] + (y - yTopJ) * u[1];
  // (Where the cut line meets the foot line: yTopJ + t dEnd_y = icpt + slope (xJ + t dEnd_x) - under.)
  // (The model band's own width there: how far its outside reaches from its top along the cut, measured on its points.)
  let wJ = 0;
  for (let i = 0; i < M.count; i++) {
    if (band[i] !== 1 || M.side[i] & 1 || M.pos[i * 3 + 2] <= 0 || M.nor[i * 3 + 2] < 0.2) continue;
    const x = Math.abs(M.pos[i * 3]), y = M.pos[i * 3 + 1];
    if (Math.abs(past(x, y)) > 0.004) continue;
    wJ = Math.max(wJ, (x - xJ) * dEnd[0] + (y - yTopJ) * dEnd[1]);
  }
  wJ = Math.min(0.03, Math.max(0.012, wJ || 0.02));
  // The new neck's edge (our band's top): from (xJ, yTopJ) to the middle, `drop` lower there.
  const yC = yTopJ - F.drop;
  // (Its ends run on in the line of the model's band there (its top edge's slope at xJ), so the two meet without a corner
  // (QATEST 2026-11-16): a cubic from the middle (level for the round neck; for the shallow V straight out of its point).)
  const topSlope = (at(top, xJ) - at(top, xJ - 0.01)) / 0.01, s0 = F.v ? (yTopJ - yC) / xJ : 0;
  const T = (x) => { const t = Math.min(1, Math.abs(x) / xJ), h = yTopJ - yC, m0 = s0 * xJ, m1 = Math.max(0, Math.min(topSlope * xJ, 2.4 * h)); return yC * (2 * t ** 3 - 3 * t ** 2 + 1) + m0 * (t ** 3 - 2 * t ** 2 + t) + yTopJ * (-2 * t ** 3 + 3 * t ** 2) + m1 * (t ** 3 - t ** 2) + 0 * h; };

  const pos = Array.from(M.pos), nor = Array.from(M.nor), flat = Array.from(M.flat), side = Array.from(M.side), shade = Array.from(M.shade), bnd = Array.from(band);
  let tris = [];
  for (let t = 0; t < M.idx.length; t += 3) {
    const c = [M.idx[t], M.idx[t + 1], M.idx[t + 2]];
    const near = c.every((v) => !(side[v] & 1) && pos[v * 3 + 2] > 0) && c.some((v) => Math.abs(pos[v * 3]) < xJ + 0.05 && pos[v * 3 + 1] > L(0) - 0.03);
    tris.push({ c, near });
  }
  const point = (a, b, va, vb) => {
    const t = va / (va - vb), i = pos.length / 3;
    for (let k = 0; k < 3; k++) pos.push(pos[a * 3 + k] + (pos[b * 3 + k] - pos[a * 3 + k]) * t);
    const nx = nor[a * 3] + (nor[b * 3] - nor[a * 3]) * t, ny = nor[a * 3 + 1] + (nor[b * 3 + 1] - nor[a * 3 + 1]) * t, nz = nor[a * 3 + 2] + (nor[b * 3 + 2] - nor[a * 3 + 2]) * t, l = Math.hypot(nx, ny, nz) || 1;
    nor.push(nx / l, ny / l, nz / l);
    for (let k = 0; k < 2; k++) flat.push(flat[a * 2 + k] + (flat[b * 2 + k] - flat[a * 2 + k]) * t);
    side.push(side[a]);
    shade.push(shade[a] + (shade[b] - shade[a]) * t);
    bnd.push(bnd[a] === bnd[b] ? bnd[a] : 0);
    return i;
  };
  const made = [];
  const split = (value, drop, only = () => true) => {
    const cache = new Map(), memo = new Map(), out = [];
    const val = (v) => { if (!memo.has(v)) memo.set(v, value(v)); return memo.get(v); };
    for (const tri of tris) {
      if (!tri.near || !only(tri)) { out.push(tri); continue; }
      const v = tri.c.map(val), sg = v.map((x) => (x > 1e-9 ? 1 : x < -1e-9 ? -1 : 0));
      if (!sg.includes(1) || !sg.includes(-1)) { if ((sg.includes(1) ? 1 : -1) !== drop) out.push(tri); continue; }
      const above = [], under = [];
      for (let k = 0; k < 3; k++) {
        const a = tri.c[k], b = tri.c[(k + 1) % 3];
        if (sg[k] >= 0) above.push(a);
        if (sg[k] <= 0) under.push(a);
        if (sg[k] * sg[(k + 1) % 3] < 0) {
          const key = a < b ? `${a},${b}` : `${b},${a}`;
          if (!cache.has(key)) { cache.set(key, a < b ? point(a, b, v[k], v[(k + 1) % 3]) : point(b, a, v[(k + 1) % 3], v[k])); made.push(cache.get(key)); }
          above.push(cache.get(key));
          under.push(cache.get(key));
        }
      }
      for (const keep of drop > 0 ? [under] : drop < 0 ? [above] : [above, under]) for (let k = 1; k + 1 < keep.length; k++) out.push({ ...tri, c: [keep[0], keep[k], keep[k + 1]] });
    }
    tris = out;
  };
  // 1. Straight up and down at each end (past there all is as it was); 2. along the line under the band's foot, the cloth
  // and band above it (between the ends) dropped.
  split((v) => past(pos[v * 3], pos[v * 3 + 1]), 0);
  for (const tri of tris) tri.inside = tri.near && tri.c.reduce((s2, v) => s2 + past(pos[v * 3], pos[v * 3 + 1]), 0) / 3 < 0;
  made.length = 0;
  split((v) => pos[v * 3 + 1] - L(pos[v * 3]), 1, (tri) => tri.inside);
  // (The model's band left over between the ends, above the cut line: gone too.)
  tris = tris.filter((tri) => !(tri.inside && tri.c.every((v) => pos[v * 3 + 1] > L(pos[v * 3]) - 1e-9)));
  // The cut edge: the points made on the line (and the line's ends at the band's foot).
  // (The opening's edge as the cloth now is: the points on its open edges (one triangle) along the line, in front.)
  const use = new Map();
  for (const tri of tris) for (let k = 0; k < 3; k++) { const p = tri.c[k], q = tri.c[(k + 1) % 3], key = p < q ? `${p},${q}` : `${q},${p}`; use.set(key, (use.get(key) ?? 0) + 1); }
  const onEdge = new Set();
  for (const [key, c] of use) if (c === 1) for (const v of key.split(',').map(Number)) if (past(pos[v * 3], pos[v * 3 + 1]) < 1e-6 && pos[v * 3 + 2] > 0 && Math.abs(pos[v * 3 + 1] - L(pos[v * 3])) < 0.003 && nor[v * 3 + 2] > 0) onEdge.add(v);
  const edge = [...onEdge].sort((a, b) => pos[a * 3] - pos[b * 3]);

  // ---- The surface there: z, the print's place and shade as smooth functions of (x, y), fitted (least squares) to the
  // front cloth round the opening (not the band), then eased to the cut edge's own values.
  const fit = [];
  for (let i = 0; i < M.count; i++) {
    const x = M.pos[i * 3], y = M.pos[i * 3 + 1], z = M.pos[i * 3 + 2];
    if (band[i] || M.side[i] & 1 || z <= 0 || Math.abs(x) > xJ + 0.06 || y < L(0) - 0.06 || y > yTopJ + 0.01 || y > L(x) + 0.001) continue;
    fit.push(i);
  }
  const basis = (x, y) => [1, y, y * y, x * x, x * x * y, x, x * y];
  const solve = (val) => {
    const n = 7, A = Array.from({ length: n }, () => new Float64Array(n + 1));
    for (const i of fit) { const b = basis(M.pos[i * 3], M.pos[i * 3 + 1]), v = val(i); for (let r = 0; r < n; r++) { for (let c = 0; c < n; c++) A[r][c] += b[r] * b[c]; A[r][n] += b[r] * v; } }
    for (let r = 0; r < n; r++) A[r][r] += 1e-9;
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } }
    const w = A.map((row, r) => row[n] / row[r]);
    return (x, y) => basis(x, y).reduce((s2, b, k) => s2 + b * w[k], 0);
  };
  const fz = solve((i) => M.pos[i * 3 + 2]), fu = solve((i) => M.flat[i * 2]), fv = solve((i) => M.flat[i * 2 + 1]), fs = solve((i) => M.shade[i]);

  // ---- Our band's line: its top edge along the new neck from one end to the other every 2.5 mm, across it (into the
  // cloth, seen from the front) square to the line, at the ends straight down (the model band's cut); its width.
  const path = [];
  const len = 2 * xJ * 1.6, n = Math.max(24, Math.round(len / 0.0025));
  for (let k = 0; k <= n; k++) { const x = -xJ + (2 * xJ * k) / n; path.push({ x, y: T(x) }); }
  if (F.v && !path.some((p) => Math.abs(p.x) < 1e-9)) { path.push({ x: 0, y: T(0) }); path.sort((a, b) => a.x - b.x); }
  path.forEach((p, k) => {
    const a = path[Math.max(0, k - 1)], b = path[Math.min(path.length - 1, k + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    if (F.v && Math.abs(p.x) < 1e-9) { tx = 1; ty = 0; }
    const l = Math.hypot(tx, ty) || 1;
    let d = [ty / l, -tx / l];
    if (d[1] > 0) d = [-d[0], -d[1]];
    // (Into the cloth: square to the line; within 1.5 cm of an end turning to the model band's cut.)
    const fromEnd = xJ - Math.abs(p.x), e = Math.min(1, fromEnd / 0.015), sx = p.x < 0 ? -1 : 1;
    d = [d[0] * e + sx * dEnd[0] * (1 - e), d[1] * e + dEnd[1] * (1 - e)];
    const dl = Math.hypot(...d);
    p.d = [d[0] / dl, d[1] / dl];
    if (F.v && Math.abs(p.x) < 1e-9) { const s = Math.abs(ty / l) || 0; p.d = [0, -1]; p.mitre = 1 / Math.max(0.3, Math.cos(Math.atan2(yTopJ - yC, xJ))); }
    p.e = e;
    // (One even width all round, the model band's own (QATEST 2026-11-16).)
    p.w = wJ * (p.mitre ?? 1);
  });
  // The fill's top: just under our band's foot (tucked 3 mm under it).
  const topEdge = path.map((p) => [p.x + p.d[0] * (p.w - 0.003), p.y + p.d[1] * (p.w - 0.003)]);

  // ---- The fill: in columns, one at each point of the cut edge (from one end to the other), each from that point straight
  // up (seen from the front) to our band's foot line, a point every 5 mm; neighbouring columns joined in quads.
  const topAt = (x) => {
    for (let k = 1; k < topEdge.length; k++) { const [x0, y0] = topEdge[k - 1], [x1, y1] = topEdge[k]; if ((x - x0) * (x - x1) <= 0 && x1 !== x0) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
    return topEdge[x < 0 ? 0 : topEdge.length - 1][1];
  };
  const xy = [], fixed = [], cols = [];
  for (const v of edge) { cols.push([xy.length / 2]); xy.push(pos[v * 3], pos[v * 3 + 1]); fixed.push(v); }
  const nEdge = fixed.length, ROWS = Math.max(2, Math.ceil(Math.max(...edge.map((v) => topAt(pos[v * 3]) - pos[v * 3 + 1])) / 0.005));
  edge.forEach((v, c) => {
    const x = pos[v * 3], y0 = pos[v * 3 + 1], y1 = Math.max(y0, topAt(x));
    for (let r = 1; r <= ROWS; r++) { cols[c].push(xy.length / 2); xy.push(x, y0 + ((y1 - y0) * r) / ROWS); fixed.push(-1); }
  });
  const m = xy.length / 2, fillIdx = [];
  for (let c = 0; c + 1 < cols.length; c++) for (let r = 0; r < ROWS; r++) {
    const a = cols[c][r], b = cols[c + 1][r], d = cols[c][r + 1], e = cols[c + 1][r + 1];
    // (Counter-clockwise seen from the front: x rises along a row, y up a column.)
    fillIdx.push(a, b, e, a, e, d);
  }
  // The eased difference at the cut edge (the edge's own minus the smooth fit), spread smoothly over the fill (each point
  // the average of its neighbours, the edge held).
  const nbs = Array.from({ length: m }, () => new Set());
  for (let t = 0; t < fillIdx.length; t += 3) for (let k = 0; k < 3; k++) { nbs[fillIdx[t + k]].add(fillIdx[t + (k + 1) % 3]); nbs[fillIdx[t + (k + 1) % 3]].add(fillIdx[t + k]); }
  const ease = (own, fn) => {
    const d = new Float64Array(m);
    for (let k = 0; k < nEdge; k++) d[k] = own(fixed[k]) - fn(xy[k * 2], xy[k * 2 + 1]);
    for (let it = 0; it < 300; it++) for (let k = nEdge; k < m; k++) { let s2 = 0, c = 0; for (const j of nbs[k]) { s2 += d[j]; c++; } if (c) d[k] = s2 / c; }
    return Array.from({ length: m }, (_, k) => fn(xy[k * 2], xy[k * 2 + 1]) + d[k]);
  };
  const Z = ease((v) => pos[v * 3 + 2], fz), U = ease((v) => flat[v * 2], fu), V = ease((v) => flat[v * 2 + 1], fv), H = ease((v) => shade[v], fs);
  // The surface's z anywhere near (for our band): the fit eased as at the nearest fill point.
  const zAt = (x, y) => { let best = 0, bd = Infinity; for (let k = 0; k < m; k++) { const d = (xy[k * 2] - x) ** 2 + (xy[k * 2 + 1] - y) ** 2; if (d < bd) { bd = d; best = k; } } return fz(x, y) + (Z[best] - fz(xy[best * 2], xy[best * 2 + 1])); };
  const hAt = (x, y) => { let best = 0, bd = Infinity; for (let k = 0; k < m; k++) { const d = (xy[k * 2] - x) ** 2 + (xy[k * 2 + 1] - y) ** 2; if (d < bd) { bd = d; best = k; } } return H[best]; };
  // The fill's points (the cut edge's are the model's own), normals from its triangles.
  const id = new Int32Array(m);
  for (let k = 0; k < m; k++) {
    if (k < nEdge) { id[k] = fixed[k]; continue; }
    id[k] = pos.length / 3;
    pos.push(xy[k * 2], xy[k * 2 + 1], Z[k]);
    nor.push(0, 0, 1);
    flat.push(U[k], V[k]);
    side.push(0);
    shade.push(H[k]);
    bnd.push(0);
  }
  const acc = new Float64Array(m * 3);
  for (let t = 0; t < fillIdx.length; t += 3) {
    const [a, b, c] = [fillIdx[t], fillIdx[t + 1], fillIdx[t + 2]], P = (k) => [xy[k * 2], xy[k * 2 + 1], Z[k]];
    const A = P(a), B = P(b), C = P(c), e1 = B.map((v, j) => v - A[j]), e2 = C.map((v, j) => v - A[j]);
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const k of [a, b, c]) for (let j = 0; j < 3; j++) acc[k * 3 + j] += nn[j];
  }
  // (Mostly the smooth fitted chest's own normal, so the fill is lit as the cloth round it (QATEST 2026-11-16: a lighter patch).)
  for (let k = nEdge; k < m; k++) {
    const x = xy[k * 2], y = xy[k * 2 + 1], h = 0.002, gx = (fz(x + h, y) - fz(x - h, y)) / (2 * h), gy = (fz(x, y + h) - fz(x, y - h)) / (2 * h);
    const fl = Math.hypot(gx, gy, 1), al = Math.hypot(acc[k * 3], acc[k * 3 + 1], acc[k * 3 + 2]) || 1;
    const nn = [-gx / fl * 0.8 + (acc[k * 3] / al) * 0.2, -gy / fl * 0.8 + (acc[k * 3 + 1] / al) * 0.2, 1 / fl * 0.8 + (acc[k * 3 + 2] / al) * 0.2], l = Math.hypot(...nn) || 1;
    nor.splice(id[k] * 3, 3, nn[0] / l, nn[1] / l, nn[2] / l);
  }
  const idx = tris.flatMap((tri) => tri.c);
  for (const k of fillIdx) idx.push(id[k]);

  // ---- Our band: its cross-section at each place along its line, seen from the front across it (into the cloth) and
  // off the cloth: from its foot tucked into the fill, up its face (standing `lift` off the cloth; at its ends on the
  // model band's own face, flush), over its rolled top edge and down its inside (`thick` behind the face).
  const ownFace = (x, y) => {
    // (The model band's outermost face there, seen from the front, as it was.)
    let best = null;
    for (let t = 0; t < M.idx.length; t += 3) {
      const a = M.idx[t], b = M.idx[t + 1], c = M.idx[t + 2];
      if (band[a] !== 1 || band[b] !== 1 || band[c] !== 1) continue;
      const P2 = M.pos, det = (P2[b * 3 + 1] - P2[c * 3 + 1]) * (P2[a * 3] - P2[c * 3]) + (P2[c * 3] - P2[b * 3]) * (P2[a * 3 + 1] - P2[c * 3 + 1]);
      if (Math.abs(det) < 1e-14 || Math.abs(P2[a * 3] - x) > 0.03 || Math.abs(P2[a * 3 + 1] - y) > 0.03) continue;
      const l1 = ((P2[b * 3 + 1] - P2[c * 3 + 1]) * (x - P2[c * 3]) + (P2[c * 3] - P2[b * 3]) * (y - P2[c * 3 + 1])) / det, l2 = ((P2[c * 3 + 1] - P2[a * 3 + 1]) * (x - P2[c * 3]) + (P2[a * 3] - P2[c * 3]) * (y - P2[c * 3 + 1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      const z = l1 * P2[a * 3 + 2] + l2 * P2[b * 3 + 2] + l3 * P2[c * 3 + 2];
      if (!best || z > best) best = z;
    }
    return best;
  };
  const { lift, thick } = F, r = thick / 2, cpos = [], cshade = [], cidx = [];
  const prof = [];
  // (Across from its foot (a = how far into the cloth, metres; o = off the cloth): foot, face, the roll, the inside.)
  prof.push({ a: 1.0, o: -0.0008, f: true }, { a: 1.0, o: 0.45 }, { a: 0.75, o: 1 }, { a: 0.5, o: 1 }, { a: 0.25, o: 1 }, { a: 0, o: 1 });
  for (let k = 1; k <= 6; k++) { const th = (k * Math.PI) / 6; prof.push({ roll: true, a: -r * Math.sin(th), o: 1, back: r - r * Math.cos(th) }); }
  prof.push({ a: 0.35, o: 1, back: thick, inner: true }, { a: 0.75, o: 1, back: thick, inner: true });
  const RR = prof.length;
  path.forEach((p) => {
    const sh = hAt(p.x + p.d[0] * p.w, p.y + p.d[1] * p.w);
    for (const q of prof) {
      const a = q.roll ? q.a : q.a * p.w, x = p.x + p.d[0] * a, y = p.y + p.d[1] * a;
      const cloth = zAt(x, y);
      let face = cloth + lift;
      if (p.e < 1) { const own = ownFace(x, y); if (own != null) face = own * (1 - p.e) + face * p.e; }
      let z = q.f ? cloth - 0.0008 : q.o === 0.45 ? cloth + (face - cloth) * 0.45 : face;
      if (q.back) z -= q.back;
      cpos.push(x, y, z);
      cshade.push(sh * (q.inner ? 0.75 : q.roll && q.back > r ? 0.85 : 1));
    }
  });
  for (let i = 0; i + 1 < path.length; i++) for (let k = 0; k + 1 < RR; k++) { const a = i * RR + k, c = a + RR; cidx.push(a, c, a + 1, a + 1, c, c + 1); }
  // ONE band all round (QATEST / the user 2026-11-16): from its ends it goes on, in the same piece, ON the model's own band
  // (left as it is under it) over the shoulders and round the back: each place along the model's neck edge (the data's
  // `neck`, its band's top) with the band's way down to its foot there (where it meets the cloth), our cross-section as in
  // front, as wide, 1.5 mm off the model's band; the first and last 12 places (3.5 cm) eased smoothly from the front's ends.
  {
    const rim = M.data.neck ?? [];
    const cx = rim.reduce((q, p2) => q + p2[0], 0) / (rim.length || 1), cz = rim.reduce((q, p2) => q + p2[2], 0) / (rim.length || 1);
    const ang = (x, z) => Math.atan2(x - cx, z - cz);
    const secPt = (i, k) => [cpos[(i * RR + k) * 3], cpos[(i * RR + k) * 3 + 1], cpos[(i * RR + k) * 3 + 2]];
    const TOPK = 5, last = path.length - 1, startTop = secPt(last, TOPK), endTop = secPt(0, TOPK);
    const aS = ang(startTop[0], startTop[2]), span = ((ang(endTop[0], endTop[2]) - aS) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const rel = (x, z) => ((ang(x, z) - aS) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const back = rim.filter((q) => { const t = rel(q[0], q[2]); return t > 0.08 && t < span - 0.08; }).sort((p1, p2) => rel(p1[0], p1[2]) - rel(p2[0], p2[2]));
    const line = [startTop, ...back, endTop], tops = [];
    for (let k = 0; k + 1 < line.length; k++) { const A = line[k], B = line[k + 1], n2 = Math.max(1, Math.round(Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) / 0.003)); for (let j = 0; j < n2; j++) tops.push(A.map((v, c) => v + ((B[c] - v) * j) / n2)); }
    tops.push(endTop);
    // The model's band: its outside points (for its surface) and its foot (its points next to the cloth), in 1 cm cells.
    const nbr = new Map();
    for (let t = 0; t < M.idx.length; t += 3) for (let k = 0; k < 3; k++) { const u = M.idx[t + k], w = M.idx[t + (k + 1) % 3]; (nbr.get(u) ?? nbr.set(u, []).get(u)).push(w); }
    const out2 = (v) => { const rx = M.pos[v * 3] - cx, rz = M.pos[v * 3 + 2] - cz, l = Math.hypot(rx, rz) || 1; return (M.nor[v * 3] * rx + M.nor[v * 3 + 2] * rz) / l; };
    const surf = [], feet = [];
    for (let v = 0; v < M.count; v++) {
      if (band[v] !== 1 || out2(v) < 0.1) continue;
      surf.push(v);
      if ((nbr.get(v) ?? []).some((w) => band[w] === 0)) feet.push(v);
    }
    const nearestOf = (list, q, ok = () => true) => { let best = -1, bd = Infinity; for (const v of list) { if (!ok(v)) continue; const d = Math.hypot(M.pos[v * 3] - q[0], M.pos[v * 3 + 1] - q[1], M.pos[v * 3 + 2] - q[2]); if (d < bd) { bd = d; best = v; } } return best; };
    const secs = tops.map((R, j) => {
      const a0 = ang(R[0], R[2]);
      const f = nearestOf(feet, R, (v) => Math.abs(((ang(M.pos[v * 3], M.pos[v * 3 + 2]) - a0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < 0.2);
      const F2 = f >= 0 ? [M.pos[f * 3], M.pos[f * 3 + 1], M.pos[f * 3 + 2]] : [R[0], R[1] - wJ, R[2]];
      let d3 = F2.map((v, c) => v - R[c]); const dl = Math.hypot(...d3) || 1; d3 = d3.map((v) => v / dl);
      const A = tops[Math.max(0, j - 1)], B = tops[Math.min(tops.length - 1, j + 1)], tg = B.map((v, c) => v - A[c]);
      let n3 = [tg[1] * d3[2] - tg[2] * d3[1], tg[2] * d3[0] - tg[0] * d3[2], tg[0] * d3[1] - tg[1] * d3[0]];
      const nl = Math.hypot(...n3) || 1; n3 = n3.map((v) => v / nl);
      if (n3[0] * (R[0] - cx) + n3[2] * (R[2] - cz) < 0) n3 = n3.map((v) => -v);
      return { R, d3, n3 };
    });
    // (The way down and out smoothed along.)
    for (const key of ['d3', 'n3']) { const sm = secs.map((_, j) => { const acc = [0, 0, 0]; for (let k = Math.max(0, j - 3); k <= Math.min(secs.length - 1, j + 3); k++) for (let c = 0; c < 3; c++) acc[c] += secs[k][key][c]; const l = Math.hypot(...acc) || 1; return acc.map((v) => v / l); }); secs.forEach((sc, j) => (sc[key] = sm[j])); }
    const base0 = cpos.length / 3;
    secs.forEach((sc, j) => {
      const { R, d3, n3 } = sc;
      prof.forEach((q, k) => {
        const a = q.roll ? q.a : q.a * wJ;
        let pt = R.map((v, c) => v + d3[c] * a);
        // (On the model band's surface there, then off it.)
        const v = nearestOf(surf, pt);
        if (v >= 0) { const h = (M.pos[v * 3] - pt[0]) * n3[0] + (M.pos[v * 3 + 1] - pt[1]) * n3[1] + (M.pos[v * 3 + 2] - pt[2]) * n3[2]; if (h > 0) pt = pt.map((x, c) => x + n3[c] * h); }
        const off = q.f ? -0.0008 : q.o === 0.45 ? 0.45 * (lift + 0.0012) : lift + 0.0012;
        pt = pt.map((x, c) => x + n3[c] * (off - (q.back ?? 0)));
        // (Eased into the front's end sections over the first and last 4 places.)
        const sm3 = (t) => { const u = Math.max(0, Math.min(1, t)); return 1 - u * u * (3 - 2 * u); }, wS = sm3(j / 12), wE = sm3((secs.length - 1 - j) / 12);
        if (wS > 0) { const s2 = secPt(last, k); pt = pt.map((x, c) => x * (1 - wS) + s2[c] * wS); }
        if (wE > 0) { const s2 = secPt(0, k); pt = pt.map((x, c) => x * (1 - wE) + s2[c] * wE); }
        cpos.push(...pt);
        cshade.push(q.inner ? 0.75 : q.roll && (q.back ?? 0) > r ? 0.85 : 1);
      });
    });
    // (Joined on from the front's right end, round the back, to its left end: one piece.)
    const order = [last, ...secs.map((_, j) => base0 / RR + j), 0];
    for (let i = 0; i + 1 < order.length; i++) for (let k = 0; k + 1 < RR; k++) { const a = order[i] * RR + k, c = order[i + 1] * RR + k; cidx.push(a, c, a + 1, a + 1, c, c + 1); }
  }
  // The new neck's edge (the roll's top), every 1.2 cm and at the ends and the middle.
  const vEdge = [];
  path.forEach((p, i) => {
    const k = i * RR + 6 + 3, q = [cpos[k * 3], cpos[k * 3 + 1], cpos[k * 3 + 2]], last = vEdge.at(-1);
    if (!last || i === path.length - 1 || Math.abs(p.x) < 1e-9 || Math.hypot(q[0] - last[0], q[1] - last[1]) >= 0.012) vEdge.push(q);
  });
  const out = {
    ...M, count: pos.length / 3, pos: Float32Array.from(pos), nor: Float32Array.from(nor), flat: Float32Array.from(flat),
    side: Uint8Array.from(side), shade: Float32Array.from(shade), idx: pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx),
    // (The band per point for the print: the new cloth is cloth.)
    band: Uint8Array.from(bnd),
    collar: { pos: Float32Array.from(cpos), shade: Float32Array.from(cshade), idx: Uint16Array.from(cidx) }, vEdge,
  };
  decoded.set(cacheKey, out);
  return out;
}
