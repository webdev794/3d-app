// The ready-made model's data (viewer/tripo-<name>.js, as tripomesh.js decodes it) welded, with its open edges chained
// into loops (MODELQ3 / MODELQ4 2026-11-17, for tripo-pieces.mjs). The data file is read as data only.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const VIEWER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadModel(name) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(VIEWER, `tripo-${name}.js`), 'utf8'), ctx);
  const D = ctx.window.TRIPO_MESHES[name], n = D.count;
  const bytes = (b) => { const u = Buffer.from(b, 'base64'); return u.buffer.slice(u.byteOffset, u.byteOffset + u.length); };
  const q = new Uint16Array(bytes(D.pos)), nn = new Int8Array(bytes(D.nor));
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = D.lo[i % 3] + (q[i] / 65535) * (D.hi[i % 3] - D.lo[i % 3]);
  for (let i = 0; i < n; i++) { const x = nn[i * 3], y = nn[i * 3 + 1], z = nn[i * 3 + 2], l = Math.hypot(x, y, z) || 1; nor[i * 3] = x / l; nor[i * 3 + 1] = y / l; nor[i * 3 + 2] = z / l; }
  const idx = new Uint16Array(bytes(D.idx)), side = new Uint8Array(bytes(D.side));
  return { name, D, n, pos, nor, idx, side };
}

/** Points at one place welded (the atlas copies), triangles on the welded points, face normals, open edges, and per welded
 * point the crease strength: the largest bend (1 - cos) between neighbouring faces across its edges. */
export function analyse(m) {
  const { pos, idx, n } = m, at = new Map(), weld = new Int32Array(n), W = [];
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
    if (!at.has(k)) { at.set(k, W.length / 3); W.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); }
    weld[i] = at.get(k);
  }
  const P = Float32Array.from(W), V = P.length / 3, T = idx.length / 3, F = new Int32Array(T * 3), FN = new Float32Array(T * 3);
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < 3; k++) F[t * 3 + k] = weld[idx[t * 3 + k]];
    const [a, b, c] = [F[t * 3], F[t * 3 + 1], F[t * 3 + 2]];
    const u = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]], v = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0], l = Math.hypot(nx, ny, nz) || 1;
    FN[t * 3] = nx / l; FN[t * 3 + 1] = ny / l; FN[t * 3 + 2] = nz / l;
  }
  const edges = new Map();
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) {
    const a = F[t * 3 + k], b = F[t * 3 + (k + 1) % 3], key = a < b ? a * 1e6 + b : b * 1e6 + a;
    const e = edges.get(key); if (e) e.t.push(t); else edges.set(key, { a: Math.min(a, b), b: Math.max(a, b), t: [t] });
  }
  const A_flip = { n: 0 };
  const crease = new Float32Array(V), open = [], nb = Array.from({ length: V }, () => new Set());
  for (const e of edges.values()) {
    nb[e.a].add(e.b); nb[e.b].add(e.a);
    if (e.t.length === 1) { open.push([e.a, e.b]); continue; }
    if (e.t.length !== 2) continue;
    const [s, t] = e.t, c = FN[s * 3] * FN[t * 3] + FN[s * 3 + 1] * FN[t * 3 + 1] + FN[s * 3 + 2] * FN[t * 3 + 2], bend = 1 - Math.abs(c);
    if (c < 0) A_flip.n++;
    if (bend > crease[e.a]) crease[e.a] = bend;
    if (bend > crease[e.b]) crease[e.b] = bend;
  }
  // The point normals on the welded points (area-weighted face normals): which side is out.
  const PN = new Float32Array(V * 3);
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const v = F[t * 3 + k]; PN[v * 3] += FN[t * 3]; PN[v * 3 + 1] += FN[t * 3 + 1]; PN[v * 3 + 2] += FN[t * 3 + 2]; }
  for (let v = 0; v < V; v++) { const l = Math.hypot(PN[v * 3], PN[v * 3 + 1], PN[v * 3 + 2]) || 1; PN[v * 3] /= l; PN[v * 3 + 1] /= l; PN[v * 3 + 2] /= l; }
  return { P, V, F, T, FN, PN, crease, open, nb, weld, flips: A_flip.n };
}

/** Open edges chained into loops (each a list of welded points). */
export function loops(open) {
  const adj = new Map();
  for (const [a, b] of open) { (adj.get(a) ?? adj.set(a, []).get(a)).push(b); (adj.get(b) ?? adj.set(b, []).get(b)).push(a); }
  const seen = new Set(), out = [];
  for (const s of adj.keys()) {
    if (seen.has(s)) continue;
    const L = [s]; seen.add(s);
    let cur = s;
    for (;;) { const nx = (adj.get(cur) ?? []).find((x) => !seen.has(x)); if (nx === undefined) break; seen.add(nx); L.push(nx); cur = nx; }
    out.push(L);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Model, analysis, open-point flags and the box. */
export function prepare(name) {
  const m = loadModel(name), A = analyse(m), isOpen = new Uint8Array(A.V);
  for (const l of loops(A.open)) if (l.length > 3) for (const v of l) isOpen[v] = 1;
  let lo = [9, 9, 9], hi = [-9, -9, -9];
  for (let v = 0; v < A.V; v++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], A.P[v * 3 + k]); hi[k] = Math.max(hi[k], A.P[v * 3 + k]); }
  return { m, A, isOpen, lo, hi };
}
