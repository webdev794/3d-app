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
  const out = { data: D, count: n, pos, nor, flat, side: new Uint8Array(bytes(D.side)), shade, idx: new Uint16Array(bytes(D.idx)) };
  decoded.set(name, out);
  return out;
}

/**
 * The model as the garment's printed shape: { geometry (position, normal, uv on the made garment's atlas, color: the
 * baked shade, index), points (its positions), side (per point, as decode's), data (the file's own fields), layout (its
 * seams and trims on the pattern, layoutOf) }. `frame`: the made garment's
 * (garment.js: minX, maxX, minY, span), whose atlas has the front on its left half and the back, seen from behind, on
 * its right.
 */
export function tripoShape(name, frame) {
  const M = decode(name), { minX, maxX, minY, span } = frame, n = M.count;
  const uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = M.flat[i * 2], y = M.flat[i * 2 + 1];
    uv[i * 2] = M.side[i] & 1 ? 0.5 + (0.5 * (maxX - x)) / span : (0.5 * (x - minX)) / span;
    uv[i * 2 + 1] = (y - minY) / span;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = M.shade[i];
  }
  // A model's bindings (layout.runs: their free edges): each band printed from its own swatch of the atlas (BAND_SWATCH,
  // its painter's), so it is one even colour from its free edge right to its seam, whatever the pattern does there.
  const band = M.data.layout?.runs ? bands(M) : null;
  let pos = M.pos, nor = M.nor, uvs = uv, cols = col, index = M.idx;
  if (band) {
    // Each point's print: its band's swatch, else its own place on the front or back half. Over the straps' tops (the top
    // 8 cm) the half is the one the cloth faces (its normal forward or back), so the shoulder line there is clean.
    const top = M.data.hi[1];
    const mode = Int8Array.from({ length: n }, (_, i) => (band[i] ? 1 + band[i] : M.pos[i * 3 + 1] > top - 0.08 && !(M.side[i] & 2) ? (M.nor[i * 3 + 2] < 0 ? 1 : 0) : M.side[i] & 1));
    const uvOf = (i, m) => {
      if (m >= 2) { const [x, y] = BAND_SWATCH[m - 2]; return [(0.5 * (x - minX)) / span, (y - minY) / span]; }
      const x = M.flat[i * 2], y = M.flat[i * 2 + 1];
      return [m ? 0.5 + (0.5 * (maxX - x)) / span : (0.5 * (x - minX)) / span, (y - minY) / span];
    };
    for (let i = 0; i < n; i++) uv.set(uvOf(i, mode[i]), i * 2);
    // A triangle with corners printed differently: all its corners as most of them are (copies of the others), so none
    // smears across the atlas.
    const P = Array.from(M.pos), N = Array.from(M.nor), U = Array.from(uv), C = Array.from(col), idx = Array.from(M.idx), copies = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const tri = idx.slice(t, t + 3), on = tri.map((v) => mode[v]);
      if (on[0] === on[1] && on[1] === on[2]) continue;
      const count = new Map();
      on.forEach((m) => count.set(m, (count.get(m) ?? 0) + 1));
      // (A band only where all three corners are on it: its edge on the cloth then never juts out in teeth.)
      const cloth = [...count].filter(([m]) => m < 2);
      const want = (cloth.length ? cloth : [...count]).sort((p, q) => q[1] - p[1] || q[0] - p[0])[0][0];
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
    pos = Float32Array.from(P); nor = Float32Array.from(N); uvs = Float32Array.from(U); cols = Float32Array.from(C);
    index = pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos === M.pos ? M.pos.slice() : pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor === M.nor ? M.nor.slice() : nor, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geometry.setIndex(new THREE.BufferAttribute(index === M.idx ? M.idx.slice() : index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const points = geometry.getAttribute('position').array, side = new Uint8Array(points.length / 3);
  side.set(M.side);
  return { geometry, points, side, data: M.data, layout: layoutOf(M.data) };
}

/** Where on the flat pattern (front half, garment metres) a model's painter puts its bindings' plain colour: the neck's,
 *  the armholes'. Outside every garment's outline (high beside the straps), so nothing else is printed from there. */
export const BAND_SWATCH = [[0.32, 0.865], [-0.32, 0.865]];

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
 * rim (the file's `neck`: points round it, else the made garment's), and `wearer`: what the form under it
 * (mannequin.js) and the neck label (label.js) read of a made garment, taken from the model, so both sit inside it.
 */
export function tripoGarment(name, garment) {
  const shape = tripoShape(name, garment.frame);
  const P = shape.points, n = P.length / 3;
  const neck = shape.data.neck ? shape.data.neck.map(([x, y, z]) => new THREE.Vector3(x, y, z)) : garment.neck;
  let body = null;
  if (garment.body) {
    // The form is shaped slice by slice from the fabric's points (mannequin.js), on a made garment's close grid: here the
    // model's points with its triangles' edge middles and centres, so every direction round each slice has fabric to
    // stay inside. Not the trims on the cloth (the file's side bit 2: bib tabs). Front and back as the made garment's
    // (here simply all of them, the last again for an odd count).
    const I = shape.geometry.index.array, side = shape.side, out = [], seen = new Set();
    const add = (a, b, c, wa, wb, wc) => out.push(P[a] * wa + P[b] * wb + P[c] * wc, P[a + 1] * wa + P[b + 1] * wb + P[c + 1] * wc, P[a + 2] * wa + P[b + 2] * wb + P[c + 2] * wc);
    for (let i = 0; i < n; i++) if (!(side[i] & 2)) out.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
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
    if ((out.length / 3) % 2) out.push(out[out.length - 3], out[out.length - 2], out[out.length - 1]);
    const m = out.length / 6;
    // (`shoulderFit`: the shoulders kept inside the model's narrower straps all round, mannequin.js.)
    body = { ...garment.body, n: m, positions: Float32Array.from(out), sleeve: new Array(m).fill(-1), shoulderFit: true };
  }
  // The label hangs inside the back: `surface(x, y, true)` gives the model's innermost back there (backField).
  let field = null;
  const surface = (x, y, back = false) => {
    field ??= backField(P, shape.geometry.index.array, garment.frame.maxY);
    return { x, y, z: back ? field(x, y) : -Infinity };
  };
  const wearer = { kind: garment.kind, frame: garment.frame, body, neck, geometry: shape.geometry, surface };
  return { ...shape, neck, wearer };
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
