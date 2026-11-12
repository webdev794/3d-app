// The ready-made (Tripo) garment models, 2026-11-12: converts a model's GLB file into the kit viewer's own compact data
// file, viewer/tripo-<name>.js (a plain script: the apps load the viewer from local files, where modules do not load),
// which build.mjs copies beside both viewers. Run it again only when a model file changes:
//
//   node viewer/tripo-convert.mjs <name> [model.glb]            (from website/; the model defaults to the config's)
//
// The model is used as it is: its points, triangles and normals, only scaled (one uniform scale), moved and turned onto
// the garment's place. What is added: where each point is on the garment's flat print pattern (the made garment's
// atlas, garment.js), so the viewer's own printing (colour areas, patterns, marks, layers) lands on it unchanged:
//  - each point takes the flat pattern place of the nearest point of the made garment (front or back panel), then
//  - the garment's own features are pinned (a config's `pins`: its seams, bindings, bib tabs...) and the places in
//    between follow smoothly (a least-squares fit that keeps the nearest-point map's local shape, pinned points held);
//  - points on the inside of a fold (a hem facing, the inside of a binding) are mirrored past the pattern's edge, so
//    they show the plain margin colour there, not the print turned over;
//  - triangles across the side seams (front and back in different halves of the atlas) get their own copies of the
//    corners on the other side (no smear across the atlas).
// The GLB is read as data only (its JSON header and binary buffer); nothing in it is run.
//
// The data file: window.TRIPO_MESHES[name] = { v, count, tris, lo, hi, pos (Uint16 x3, in lo..hi), nor (Int8 x3),
// flat (Int16 x2, garment metres / FLAT_UNIT), side (Uint8: 0 front, 1 back), shade (Uint8, / 200), idx (Uint16 x3),
// ...the config's extras (neck rim, tab places) }, all arrays base64. viewer/src/tripomesh.js reads it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
export const FLAT_UNIT = 1 / 25000;

// ---------- reading the model (data only)
/** A GLB's meshes as one: positions and normals (node transforms applied) and triangle indices. */
export function readGLB(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB file`);
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4), chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  if (!json || !bin) throw new Error(`${file}: no JSON or binary chunk`);
  const read = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
    if (!Type || bv.byteStride) throw new Error(`${file}: accessor ${i} not supported`);
    const start = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return new Type(bin.buffer.slice(start, start + a.count * comps * Type.BYTES_PER_ELEMENT));
  };
  // Each node's world matrix (column-major 4x4), its mesh's primitives placed with it.
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  const local = (n) => {
    if (n.matrix) return n.matrix;
    const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
  };
  const pos = [], nor = [], idx = [];
  const visit = (ni, parent) => {
    const node = json.nodes[ni], m = mul(parent, local(node));
    if (node.mesh != null) for (const prim of json.meshes[node.mesh].primitives) {
      if ((prim.mode ?? 4) !== 4) continue;
      const p = read(prim.attributes.POSITION), n = prim.attributes.NORMAL != null ? read(prim.attributes.NORMAL) : null;
      const base = pos.length / 3, count = p.length / 3;
      for (let i = 0; i < count; i++) {
        const [x, y, z] = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
        pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        const [a, b, c] = n ? [n[i * 3], n[i * 3 + 1], n[i * 3 + 2]] : [0, 0, 0];
        const q = [m[0] * a + m[4] * b + m[8] * c, m[1] * a + m[5] * b + m[9] * c, m[2] * a + m[6] * b + m[10] * c], l = Math.hypot(...q) || 1;
        nor.push(q[0] / l, q[1] / l, q[2] / l);
      }
      const ix = prim.indices != null ? read(prim.indices) : Uint32Array.from({ length: count }, (_, i) => i);
      for (const v of ix) idx.push(base + v);
    }
    for (const c of node.children ?? []) visit(c, m);
  };
  const scene = json.scenes?.[json.scene ?? 0]?.nodes ?? json.nodes.map((_, i) => i);
  for (const ni of scene) visit(ni, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return { pos: Float32Array.from(pos), nor: Float32Array.from(nor), idx: Uint32Array.from(idx) };
}

/** The viewer's own garment code, bundled for Node (`exports`: what the entry exports from viewer/src). */
export async function viewerLib(srcDir, exports, root = path.resolve(here, '../..')) {
  const esbuild = require(path.join(root, 'viewer/node_modules/esbuild'));
  const out = await esbuild.build({
    stdin: { contents: exports, resolveDir: srcDir, sourcefile: 'tripo-entry.js' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
    nodePaths: [path.join(root, 'viewer/node_modules'), path.join(root, 'website/node_modules')],
  });
  const file = path.join(here, `.tripo-lib-${process.pid}.mjs`);
  fs.writeFileSync(file, out.outputFiles[0].text);
  try { return await import(pathToFileURL(file).href); } finally { fs.rmSync(file, { force: true }); }
}

// ---------- geometry helpers
/** Connected parts: a part number for each point (0 = the largest part), and the parts' sizes. */
export function parts(count, idx) {
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]); parent[find(idx[t + 1])] = a; parent[find(idx[t + 2])] = a; }
  const size = new Map();
  for (let i = 0; i < count; i++) { const r = find(i); size.set(r, (size.get(r) ?? 0) + 1); }
  const order = [...size.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r), rank = new Map(order.map((r, k) => [r, k]));
  return { part: Int32Array.from({ length: count }, (_, i) => rank.get(find(i))), sizes: order.map((r) => size.get(r)) };
}

/** Each point's neighbours along the triangles' edges. */
export function neighbours(count, idx) {
  const sets = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3]; sets[a].add(b); sets[b].add(a); }
  return sets.map((s) => [...s]);
}

/** The open edges (used by one triangle only), as chains of points: [{ points, closed }]. */
export function openChains(idx) {
  const use = new Map(), key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const e = key(idx[t + k], idx[t + (k + 1) % 3]); use.set(e, (use.get(e) ?? 0) + 1); }
  const next = new Map();
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = idx[t + k], b = idx[t + (k + 1) % 3];
    if (use.get(key(a, b)) === 1) (next.get(a) ?? next.set(a, []).get(a)).push(b);
  }
  const seen = new Set(), chains = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const points = [];
    let v = start;
    while (v != null && !seen.has(v)) { seen.add(v); points.push(v); v = (next.get(v) ?? []).find((w) => !seen.has(w)) ?? null; }
    chains.push(points);
  }
  return chains;
}

/** Closest point to p on triangle abc: [x, y, z, wa, wb, wc] (Ericson, Real-Time Collision Detection 5.1.5). */
export function closestOnTriangle(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const at = (u, v, w) => [a[0] * u + b[0] * v + c[0] * w, a[1] * u + b[1] * v + c[1] * w, a[2] * u + b[2] * v + c[2] * w, u, v, w];
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return at(1, 0, 0);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(0, 1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return at(1 - v, v, 0); }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(0, 0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return at(1 - w, 0, w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return at(0, 1 - w, w); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return at(1 - v - w, v, w);
}

/**
 * The made garment's surface for nearest-point questions: its triangles (positions, normals, flat pattern places and
 * which half of the atlas, front or back) in a grid of `cell` metres.
 */
export function madeSurface(made, cell = 0.02) {
  const g = made.geometry, P = g.getAttribute('position').array, UV = g.getAttribute('uv').array, I = g.index.array;
  const C = g.getAttribute('color')?.array;
  const { minX, maxX, minY, span } = made.frame;
  const tris = [];
  for (let t = 0; t < I.length; t += 3) {
    const k = [I[t], I[t + 1], I[t + 2]], v = k.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
    const u = k.map((i) => [UV[i * 2], UV[i * 2 + 1]]);
    const back = u.map(([s]) => s >= 0.5);
    if (back[0] !== back[1] || back[1] !== back[2]) continue;   // (none on a made garment: each panel is one half)
    // The flat pattern place of each corner (inverting the atlas, garment.js uvAt / uvBack).
    const flat = u.map(([s, w]) => [back[0] ? maxX - 2 * (s - 0.5) * span : minX + 2 * s * span, minY + w * span]);
    const e1 = v[1].map((x, i) => x - v[0][i]), e2 = v[2].map((x, i) => x - v[0][i]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n);
    if (l < 1e-12) continue;
    tris.push({ v, flat, back: back[0], n: n.map((x) => x / l), shade: k.map((i) => (C ? C[i * 3] : 1)), index: t / 3 });
  }
  const grid = new Map(), key = (i, j, k) => `${i},${j},${k}`;
  tris.forEach((t, ti) => {
    const lo = [0, 1, 2].map((c) => Math.floor(Math.min(t.v[0][c], t.v[1][c], t.v[2][c]) / cell));
    const hi = [0, 1, 2].map((c) => Math.floor(Math.max(t.v[0][c], t.v[1][c], t.v[2][c]) / cell));
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) (grid.get(key(i, j, k)) ?? grid.set(key(i, j, k), []).get(key(i, j, k))).push(ti);
  });
  /**
   * The best made point for a model point p (normal n): the nearest, a triangle facing the other way counting
   * `turn` metres further (so the front of a strap finds the front, not the back an inch behind it). `only(tri)`:
   * which triangles may answer. Returns { flat: [x, y], back, d, facing (the cosine between the normals), point,
   * shade (the made garment's baked shade there), tri }.
   */
  const nearest = (p, n, { turn = 0.02, only = null, reach = 0.25 } = {}) => {
    const c = p.map((x) => Math.floor(x / cell));
    let best = null;
    for (let r = 0; r * cell <= reach; r++) {
      for (let i = c[0] - r; i <= c[0] + r; i++) for (let j = c[1] - r; j <= c[1] + r; j++) for (let k = c[2] - r; k <= c[2] + r; k++) {
        if (Math.max(Math.abs(i - c[0]), Math.abs(j - c[1]), Math.abs(k - c[2])) !== r) continue;
        for (const ti of grid.get(key(i, j, k)) ?? []) {
          const t = tris[ti];
          if (only && !only(t)) continue;
          const q = closestOnTriangle(p, ...t.v), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
          const facing = n ? t.n[0] * n[0] + t.n[1] * n[1] + t.n[2] * n[2] : 1;
          const score = d + turn * Math.max(0, -facing);
          if (!best || score < best.score) best = { score, d, facing, back: t.back, tri: t, point: q.slice(0, 3), shade: t.shade[0] * q[3] + t.shade[1] * q[4] + t.shade[2] * q[5], flat: [0, 1].map((a) => t.flat[0][a] * q[3] + t.flat[1][a] * q[4] + t.flat[2][a] * q[5]) };
        }
      }
      // Done when nothing in the next ring of cells can be nearer.
      if (best && best.score <= r * cell) break;
    }
    return best;
  };
  return { tris, nearest };
}

/**
 * Least-squares flat places: keeps each edge's flat difference as in `F0` (the nearest-point map) while pinned points
 * go to their places (weight `W`). `F0`, result: Float64Array x, y per point. Conjugate gradients on the normal
 * equations, per coordinate. `edges`: the model's edges [a, b] that count (not across the side seams' halves).
 */
export function fitFlat(count, edges, F0, pins, { W = 400, iterations = 600 } = {}) {
  const out = Float64Array.from(F0);
  const pinned = new Map(pins.map((p) => [p.i, p]));
  for (let c = 0; c < 2; c++) {
    // A x = b, with A = sum over edges of (e_a - e_b)(e_a - e_b)^T + W * pinned + tiny * I (each part anchored).
    const b = new Float64Array(count), diag = new Float64Array(count).fill(1e-6);
    for (const [a, q] of edges) {
      const d = F0[a * 2 + c] - F0[q * 2 + c];
      b[a] += d; b[q] -= d; diag[a] += 1; diag[q] += 1;
    }
    for (let i = 0; i < count; i++) b[i] += 1e-6 * F0[i * 2 + c];
    for (const [i, p] of pinned) { b[i] += W * p.at[c]; diag[i] += W; }
    const apply = (x, y) => {
      for (let i = 0; i < count; i++) y[i] = diag[i] * x[i];
      for (const [a, q] of edges) { y[a] -= x[q]; y[q] -= x[a]; }
    };
    const x = new Float64Array(count);
    for (let i = 0; i < count; i++) x[i] = F0[i * 2 + c];
    const r = new Float64Array(count), z = new Float64Array(count), pv = new Float64Array(count), Ap = new Float64Array(count);
    apply(x, Ap);
    for (let i = 0; i < count; i++) { r[i] = b[i] - Ap[i]; z[i] = r[i] / diag[i]; pv[i] = z[i]; }
    let rz = 0;
    for (let i = 0; i < count; i++) rz += r[i] * z[i];
    for (let it = 0; it < iterations && rz > 1e-18; it++) {
      apply(pv, Ap);
      let pAp = 0;
      for (let i = 0; i < count; i++) pAp += pv[i] * Ap[i];
      const alpha = rz / pAp;
      for (let i = 0; i < count; i++) { x[i] += alpha * pv[i]; r[i] -= alpha * Ap[i]; z[i] = r[i] / diag[i]; }
      let rz2 = 0;
      for (let i = 0; i < count; i++) rz2 += r[i] * z[i];
      const beta = rz2 / rz;
      rz = rz2;
      for (let i = 0; i < count; i++) pv[i] = z[i] + beta * pv[i];
    }
    for (let i = 0; i < count; i++) out[i * 2 + c] = x[i];
  }
  return out;
}

/** Writes the data file. */
export function writeData(file, name, data) {
  const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, ArrayBuffer.isView(v) ? b64(v) : v]));
  const text = `window.TRIPO_MESHES=window.TRIPO_MESHES||{};window.TRIPO_MESHES[${JSON.stringify(name)}]=${JSON.stringify(fields)};\n`;
  fs.writeFileSync(file, text);
  return text.length;
}

/**
 * Packs a converted model: `pos` placed positions, `nor` normals, `flat` flat places (x, y), `back` (0/1), `shade`
 * (0..1.27), `idx` triangles; `extra`: the config's own fields.
 */
export function pack({ pos, nor, flat, back, shade, idx }, extra = {}) {
  const count = pos.length / 3;
  if (count > 65535) throw new Error('too many points for 16-bit indices');
  const lo = [0, 1, 2].map((c) => { let m = Infinity; for (let i = c; i < pos.length; i += 3) m = Math.min(m, pos[i]); return m; });
  const hi = [0, 1, 2].map((c) => { let m = -Infinity; for (let i = c; i < pos.length; i += 3) m = Math.max(m, pos[i]); return m; });
  const q = new Uint16Array(count * 3), n = new Int8Array(count * 3), f = new Int16Array(count * 2), s = new Uint8Array(count), side = new Uint8Array(count);
  for (let i = 0; i < count * 3; i++) {
    const c = i % 3;
    q[i] = Math.round(((pos[i] - lo[c]) / (hi[c] - lo[c] || 1)) * 65535);
    n[i] = Math.round(Math.max(-1, Math.min(1, nor[i])) * 127);
  }
  for (let i = 0; i < count * 2; i++) f[i] = Math.max(-32767, Math.min(32767, Math.round(flat[i] / FLAT_UNIT)));
  for (let i = 0; i < count; i++) { s[i] = Math.max(0, Math.min(255, Math.round(shade[i] * 200))); side[i] = back[i] & 3; }
  return { v: 1, count, tris: idx.length / 3, lo, hi, flatUnit: FLAT_UNIT, pos: q, nor: n, flat: f, side, shade: s, idx: Uint16Array.from(idx), ...extra };
}

// ---------- the garments
// Each model's own settings and steps are in viewer/tripo-<name>.mjs (export default { model: the GLB from website/,
// lib: what to bundle from viewer/src, convert({ glb, lib, tools, debug }) -> { data, report } }); `tools` are the
// helpers above. See the netball dress's.

// ---------- command line
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [name, model] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const opt = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const own = path.join(here, `tripo-${name}.mjs`);
  if (!name || !fs.existsSync(own)) { console.error(`usage: node viewer/tripo-convert.mjs <name> [model.glb]  (viewer/tripo-<name>.mjs holds its settings)`); process.exit(1); }
  const config = (await import(pathToFileURL(own).href)).default;
  const srcDir = path.resolve(opt('src', path.join(here, 'src')));
  const lib = await viewerLib(srcDir, config.lib, path.resolve(opt('root', path.resolve(here, '../..'))));
  const file = path.resolve(model ?? path.resolve(here, '..', config.model));
  const glb = readGLB(file);
  const t0 = Date.now();
  const tools = { readGLB, parts, neighbours, openChains, closestOnTriangle, madeSurface, fitFlat, FLAT_UNIT };
  const { data, report } = await config.convert({ glb, lib, srcDir, tools, debug: opt('debug', null) });
  const out = path.resolve(opt('out', here), `tripo-${name}.js`);
  const size = writeData(out, name, pack(data, data.extra));
  console.log(`${name}: ${path.basename(file)} -> ${path.relative(process.cwd(), out)} (${Math.round(size / 1024)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (report) console.log(report);
}
