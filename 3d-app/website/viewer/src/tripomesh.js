import * as THREE from 'three';

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
      s.src = `tripo-${name}.js`;
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
export const BIB_V = { tip: 0.6, width: 0.012, roll: 0.0014, lift: 0.0009, key: 'v' };

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
  if (name === 'netball-dress') return neck === 'v' || neck === 'shallow' ? DRESS_V : null;
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
  const reach = Math.max(line[0].x, line[1].x) + 0.03;
  // The triangles the V may cross: in front of the middle (also the binding's rolled edge, printed from the back half of
  // the pattern), not a trim, near the neck. (Each triangle's corners are on one half of the pattern: the converter's
  // seam copies.)
  let tris = [];
  for (let t = 0; t < M.idx.length; t += 3) {
    const c = [M.idx[t], M.idx[t + 1], M.idx[t + 2]];
    const near = c.every((v) => (V.trims || !(side[v] & 2)) && pos[v * 3 + 2] > 0) && c.some((v) => pos[v * 3 + 1] > tip - 0.05 && Math.abs(pos[v * 3]) < reach);
    tris.push({ c, near, binding: near && c.every((v) => own[v] === 1) });
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
  for (const [p, w] of [[path[0], 0], [path.at(-1), 1]]) { p.x += up[w][0] * 0.0015; p.y += up[w][1] * 0.0015; }
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
    const atEnd = ownWidth[along[i] < along.at(-1) / 2 ? 0 : 1] || width / stretch;
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
    for (const [a, b] of rollProf) {
      cpos.push(E[0] + D[0] * a + N[0] * b, E[1] + D[1] * a + N[1] * b, E[2] + D[2] * a + N[2] * b);
      cshade.push(topShade * (b < -roll ? 0.8 : 1));
    }
  });
  for (let i = 0; i + 1 < path.length; i++) for (let r = 0; r + 1 < R; r++) {
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
export function tripoShape(name, frame, neck = null, { dropBand = false } = {}) {
  // (Only the dress's V is cut (DRESS_V). The basketball singlet keeps its model's own V whatever is chosen: a round
  // neck cannot be cut from it, its binding is a 2-2.5 cm slab filling its straps' tops: BBSINGLET 2026-11-13.)
  // (The football jersey's V-necks too, FBJERSEY 2026-11-13: tripomesh.js vOf, JERSEY_V.)
  const V = neck ? vOf(name, neck) : null, cut = V ? cutNeck(name, V) : null;
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
  // A model's bindings (layout.runs: their free edges; or marked per point by its converter): each band printed from its
  // own swatch of the atlas (the model's `swatch`, else BAND_SWATCH; its painter's), so it is one even colour from its
  // free edge right to its seam, whatever the pattern does there.
  const band = bandsOf(M), SW = M.data.swatch ?? BAND_SWATCH, spread = M.data.swatchSpread ?? 0;
  let pos = M.pos, nor = M.nor, uvs = uv, cols = col, index = M.idx, insideGroup = null;
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
          C.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
        }
        idx[t + k] = copies.get(ck);
      }
    }
    // (A model with its inside marked (its data's `inside`: the basketball singlet): the inside's triangles last, as a
    // group of their own, drawn in a plain material of one even colour (main.js): printed from one point of the pattern
    // they have no direction for the fabric's weave, which showed on them as blotches (user 2026-11-13, image 540).)
    if (M.data.inside) {
      const clothTris = [], insideTris = [];
      for (let t = 0; t < idx.length; t += 3) (insideModes.has(triMode[t / 3]) ? insideTris : clothTris).push(idx[t], idx[t + 1], idx[t + 2]);
      idx.length = 0;
      idx.push(...clothTris, ...insideTris);
      insideGroup = [clothTris.length, insideTris.length];
    }
    pos = Float32Array.from(P); nor = Float32Array.from(N); uvs = Float32Array.from(U); cols = Float32Array.from(C);
    index = pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos === M.pos ? M.pos.slice() : pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor === M.nor ? M.nor.slice() : nor, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geometry.setIndex(new THREE.BufferAttribute(index === M.idx ? M.idx.slice() : index, 1));
  if (insideGroup) { geometry.addGroup(0, insideGroup[0], 0); geometry.addGroup(insideGroup[0], insideGroup[1], 1); }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const points = geometry.getAttribute('position').array, side = new Uint8Array(points.length / 3);
  side.set(M.side);
  // (How far out the neck band reaches, for its tips: texture.js.)
  let bandReach = 0;
  if (band && M.across) for (let i = 0; i < n; i++) if (band[i] === 1) bandReach = Math.max(bandReach, Math.abs(M.pos[i * 3]));
  return { geometry, points, side, data: M.data, layout: layoutOf(M.data), vEdge: cut?.vEdge ?? R?.vEdge ?? null, neckRim: R?.neckRim ?? null, insideGroup: !!insideGroup, collar: cut ? collarGeometry(cut.collar, frame, SW, !!M.across) : R ? collarGeometry(R.collar, frame, SW) : null, bandReach };
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
  // 1. The model without its neck band (every triangle with a corner on it), and the cloth's edge left there: the
  // outside cloth's points that were joined to the band (its groove).
  const idx = [], grooveSet = new Set();
  for (let t = 0; t < M.idx.length; t += 3) {
    const c = [M.idx[t], M.idx[t + 1], M.idx[t + 2]], on = c.filter((v) => band[v] === 1).length;
    if (on) for (const v of c) if (band[v] === 0) grooveSet.add(v);
    if (!on) idx.push(...c);
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
    const add = (base, a, h) => cpos.push(base[0] + v[0] * a + N[0] * h, base[1] + v[1] * a + N[1] * h, base[2] + v[2] * a + N[2] * h);
    add(o.G, 0.007, -0.0012);
    // (Its face a little fuller over the straps and the back, clear of the cloth's edge under it.)
    for (const f of FACE) add([C[0] + d[0] * f, C[1] + d[1] * f, C[2] + d[2] * f], 0, (0.0007 + 0.0022 * (1 - Math.max(0, Math.min(1, o.f)))) * Math.sin(Math.PI * Math.min(1, f + 0.12)));
    add(C, 0, 0);
    add(C, -0.0022, -0.0018);
    add(C, -0.0016, -0.0044);
    add(C, 0.004, -0.0062);
    add(C, 0.02, -0.0062);
    cshade.push(...SHADE);
  }
  const cidx = [];
  for (let k = 0; k < L; k++) for (let r = 0; r + 1 < RN; r++) { const a = k * RN + r, c = ((k + 1) % L) * RN + r; cidx.push(a, c, a + 1, a + 1, c, c + 1); }
  // (Wound so its outside faces out: checked on its face at the first place, turned round if not.)
  {
    const q = (i) => [cpos[i * 3], cpos[i * 3 + 1], cpos[i * 3 + 2]], a = q(cidx[6]), b2 = q(cidx[7]), c = q(cidx[8]);
    const e1 = b2.map((x, j) => x - a[j]), e2 = c.map((x, j) => x - a[j]), fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (fn[0] * loop[0].N[0] + fn[1] * loop[0].N[1] + fn[2] * loop[0].N[2] < 0) for (let t = 0; t < cidx.length; t += 3) { const x = cidx[t + 1]; cidx[t + 1] = cidx[t + 2]; cidx[t + 2] = x; }
  }
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
  const P = shape.points, uncut = shape.vEdge ? decode(name) : null, B = uncut?.pos ?? P, n = B.length / 3;
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
