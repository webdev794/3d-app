// The parts of a ready-made model per triangle, from the model's own geometry (MODELQ 2026-11-16, the direct approach:
// the model's own bands, cuffs, hems, collar and panels are the borders). Run from website/ after its converter:
//
//   node viewer/tripo-parts.mjs <name> [--labels out.json]
//
// Settings: viewer/parts/<name>.json { glb (from viewer/), creaseDeg, keys: [part keys, see texture.js paintModelSwatches],
// rules: [{ regions?: [ids], where?: "test", part: key | 'cloth' } | { oldBand: [n], part }], partBands: [the converter's own
// per-point bands these parts replace] }. The model is split into regions along its own seams
// (open edges, edges of three or more triangles) and sharp creases (tripo-top.mjs regionsOf; the ids as
// `node <scratch>/inspect.mjs` shows them); the rules (in order, later ones win) name each region's part, `where` a test on
// the triangle's middle (x y z, model units) and normal (nx ny nz), its region `r` and that region's size `size`.
// Adds `triPart` (one byte per triangle of the data file: 0 cloth, k the k-th key) and `partKeys` to viewer/tripo-<name>.js:
// tripomesh.js draws each part's triangles in that part's plain colour (main.js paintPlains). The GLB is read as data only.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { readGLB, closestOnTriangle, openChains } from './tripo-convert.mjs';
import { regionsOf } from './tripo-top.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Each GLB triangle's part (0 cloth, k the k-th key) from the rules. */
export function glbParts(glb, S) {
  const { fn, triReg, regs } = regionsOf(glb, S.creaseDeg ?? 25);
  const R = glb.pos, I = glb.idx, T = I.length / 3, part = new Uint8Array(T), n = R.length / 3;
  // (Triangles sharing an edge, and those with an open edge (the model's own free edges: an opening's rim).)
  const edgeTris = new Map();
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const a = I[t * 3 + k], c = I[t * 3 + (k + 1) % 3], key = a < c ? a * n + c : c * n + a; (edgeTris.get(key) ?? edgeTris.set(key, []).get(key)).push(t); }
  const open = new Uint8Array(T), nbs = Array.from({ length: T }, () => []);
  for (const ts of edgeTris.values()) { if (ts.length === 1) open[ts[0]] = 1; for (const u of ts) for (const v of ts) if (u !== v) nbs[u].push(v); }
  const mid = (t) => [0, 1, 2].map((a) => (R[I[t * 3] * 3 + a] + R[I[t * 3 + 1] * 3 + a] + R[I[t * 3 + 2] * 3 + a]) / 3);
  const test = (expr) => { const f = new Function('x', 'y', 'z', 'nx', 'ny', 'nz', 'r', 'size', 'open', `return (${expr});`); return (t) => { const m = mid(t); return f(m[0], m[1], m[2], fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2], triReg[t], regs[triReg[t]].length, open[t]); }; };
  let vnb = null;
  for (const rule of S.rules ?? []) {
    if (rule.oldBand) continue;
    // (`fill`: a part bounded by the model's own seam: every triangle reached from the `seed` triangles (a test, as `where`)
    // without crossing the `barrier` regions (the seam's own triangles, taken in too); more than `max` reached means the
    // seam is not closed: an error.)
    // (`edge`: a band sewn on beyond the body's own free edge (an open chain of the model: the one whose middle is nearest
    // `near`, model units): `up`: the triangles whose middle is above that edge, at their angle round its middle seen from
    // above (a neck band); `in`: inside it, seen along x (an armhole band); `where` limits it (a test, as below).)
    if (rule.edge) {
      const E = rule.edge, p = S.keys.indexOf(rule.part) + 1, lim = rule.where ? test(rule.where) : () => true;
      const chains = openChains(I).filter((c) => (E.len ? c.length === E.len : c.length >= (E.min ?? 20)));
      const cm = (c) => [0, 1, 2].map((a) => c.reduce((q, v) => q + R[v * 3 + a], 0) / c.length);
      const chain = chains.sort((a2, b2) => Math.hypot(...cm(a2).map((v, k) => v - E.near[k])) - Math.hypot(...cm(b2).map((v, k) => v - E.near[k])))[0];
      const c0 = cm(chain);
      // (`ring`: seen along the edge's own best-fit plane's normal (its points' least spread), the triangles inside the
      // edge within `depth` of that plane on either side; else `up` / `in` seen from above / along x.)
      let basis = null;
      if (E.mode === 'ring') {
        const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (const v of chain) { const d = [0, 1, 2].map((a) => R[v * 3 + a] - c0[a]); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
        // (The smallest: power iteration on (tr C) I - C.)
        const tr = C[0][0] + C[1][1] + C[2][2]; let nv = [0.3, 0.5, 0.8];
        for (let it = 0; it < 200; it++) { const m = [0, 1, 2].map((i) => tr * nv[i] - (C[i][0] * nv[0] + C[i][1] * nv[1] + C[i][2] * nv[2])), l = Math.hypot(...m); nv = m.map((x) => x / l); }
        const ref = Math.abs(nv[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], e1 = [nv[1] * ref[2] - nv[2] * ref[1], nv[2] * ref[0] - nv[0] * ref[2], nv[0] * ref[1] - nv[1] * ref[0]], l1 = Math.hypot(...e1);
        const b1 = e1.map((x) => x / l1), b2 = [nv[1] * b1[2] - nv[2] * b1[1], nv[2] * b1[0] - nv[0] * b1[2], nv[0] * b1[1] - nv[1] * b1[0]];
        basis = { nv, b1, b2 };
      }
      const flat2 = (q) => { const d = [0, 1, 2].map((a) => q[a] - c0[a]); return basis ? [d[0] * basis.b1[0] + d[1] * basis.b1[1] + d[2] * basis.b1[2], d[0] * basis.b2[0] + d[1] * basis.b2[1] + d[2] * basis.b2[2], d[0] * basis.nv[0] + d[1] * basis.nv[1] + d[2] * basis.nv[2]] : E.mode === 'up' ? [d[0], d[2], d[1]] : [d[1], d[2], d[0]]; };
      const ang = (q) => { const f = flat2(q); return Math.atan2(f[1], f[0]); };
      const [u, w] = [0, 1];
      // (The edge as a curve round its middle: its value (height, or reach from the middle) by angle, joined straight.)
      const pts = chain.map((v) => { const q = [R[v * 3], R[v * 3 + 1], R[v * 3 + 2]], f = flat2(q); return [ang(q), E.mode === 'up' ? q[1] : Math.hypot(f[0], f[1])]; }).sort((a2, b2) => a2[0] - b2[0]);
      const ptsR = chain.map((v) => { const q = [R[v * 3], R[v * 3 + 1], R[v * 3 + 2]], f = flat2(q); return [ang(q), Math.hypot(f[0], f[1])]; }).sort((a2, b2) => a2[0] - b2[0]);
      const curveAt = (P2) => (a) => { const k = P2.findIndex(([x]) => x >= a); const A = k <= 0 ? [P2.at(-1)[0] - 2 * Math.PI, P2.at(-1)[1]] : P2[k - 1], B = k < 0 ? [P2[0][0] + 2 * Math.PI, P2[0][1]] : P2[k]; return A[1] + ((B[1] - A[1]) * (a - A[0])) / (B[0] - A[0] || 1); };
      const atR = curveAt(ptsR);
      const at = (a) => { const k = pts.findIndex(([x]) => x >= a); const A = k <= 0 ? [pts.at(-1)[0] - 2 * Math.PI, pts.at(-1)[1]] : pts[k - 1], B = k < 0 ? [pts[0][0] + 2 * Math.PI, pts[0][1]] : pts[k]; return A[1] + ((B[1] - A[1]) * (a - A[0])) / (B[0] - A[0] || 1); };
      let got = 0;
      for (let t = 0; t < T; t++) {
        if (!lim(t)) continue;
        // (`corners`: every corner must pass, not only the middle: the band's edge a clean row of its own triangles.)
        if (E.corners && E.mode === 'up' && [0, 1, 2].some((k) => { const q = [R[I[t * 3 + k] * 3], R[I[t * 3 + k] * 3 + 1], R[I[t * 3 + k] * 3 + 2]]; return q[1] - at(ang(q)) < E.corners; })) continue;
        const m = mid(t), f = flat2(m), v = E.mode === 'up' ? m[1] - at(ang(m)) : at(ang(m)) - Math.hypot(f[0], f[1]);
        if (basis && Math.abs(f[2]) > (E.depth ?? 0.03)) continue;
        // (`within`: up, and no further out from the middle (seen from above) than the edge there plus that much: so the
        // shoulders rising beside a neck band are not taken.)
        if (E.mode === 'up' && E.within != null && Math.hypot(f[0], f[1]) > atR(ang(m)) + E.within) continue;
        if (v > (E.margin ?? 0.0005)) { part[t] = p; got++; }
      }
      console.log(`edge ${rule.part}: chain of ${chain.length} at ${c0.map((v) => v.toFixed(3))}, ${got} triangles`);
      continue;
    }
    // (`between`: a band from its own free edge (`from`: an open chain, by `near` and `len`, its point count) to the edge
    // where it is sewn on (`to`, the same): every triangle reached from those on the free edge without passing the sewn
    // edge's triangles (taken in too).)
    if (rule.between) {
      const p = S.keys.indexOf(rule.part) + 1, chains = openChains(I);
      const cm = (c) => [0, 1, 2].map((a) => c.reduce((q, v) => q + R[v * 3 + a], 0) / c.length);
      const pick = (o) => chains.filter((c) => !o.len || c.length === o.len).sort((a2, b2) => Math.hypot(...cm(a2).map((v, k) => v - o.near[k])) - Math.hypot(...cm(b2).map((v, k) => v - o.near[k])))[0];
      // (`to` may list several edges (the band's own and the body's, where they are welded); `reach`: points within that far
      // of them count as on them, so a weld beside the seam does not let the band run on into the body.)
      const A = new Set(pick(rule.between.from)), B = new Set([rule.between.to].flat().flatMap((o) => pick(o))), got = new Uint8Array(T), q = [];
      const reach = rule.between.reach ?? 0;
      if (reach > 0) {
        const Bp = [...B].map((v) => [R[v * 3], R[v * 3 + 1], R[v * 3 + 2]]);
        for (let v = 0; v < n; v++) if (!B.has(v) && !A.has(v) && Bp.some((q2) => Math.hypot(q2[0] - R[v * 3], q2[1] - R[v * 3 + 1], q2[2] - R[v * 3 + 2]) < reach)) B.add(v);
      }
      const has = (t, set) => set.has(I[t * 3]) || set.has(I[t * 3 + 1]) || set.has(I[t * 3 + 2]);
      for (let t = 0; t < T; t++) if (has(t, A)) { got[t] = 1; q.push(t); }
      for (let k = 0; k < q.length; k++) for (const u of nbs[q[k]]) if (!got[u]) { got[u] = 1; if (!has(u, B)) q.push(u); }
      const total = got.reduce((s2, v) => s2 + v, 0);
      if (total > (rule.between.max ?? T / 6)) throw new Error(`between for ${rule.part} reached ${total} triangles: it is not closed`);
      for (let t = 0; t < T; t++) if (got[t]) part[t] = p;
      console.log(`between ${rule.part}: ${total} triangles`);
      continue;
    }
    // (`split`: a band sewn onto the body where the model has two edges side by side (the band's own and the body's, open
    // chains `band` and `body`, by `near` / `len`): each triangle goes to the nearer of them along the cloth (within `reach`),
    // so the colour's border is the model's own seam.)
    if (rule.split) {
      const p = S.keys.indexOf(rule.part) + 1, chains = openChains(I), lim = rule.where ? test(rule.where) : () => true;
      const cm = (c) => [0, 1, 2].map((a) => c.reduce((q, v) => q + R[v * 3 + a], 0) / c.length);
      const pick = (o) => chains.filter((c) => !o.len || c.length === o.len).sort((a2, b2) => Math.hypot(...cm(a2).map((v, k) => v - o.near[k])) - Math.hypot(...cm(b2).map((v, k) => v - o.near[k])))[0];
      const reach = rule.split.reach ?? 0.1;
      if (!vnb) { vnb = Array.from({ length: n }, () => new Set()); for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { vnb[I[t * 3 + k]].add(I[t * 3 + (k + 1) % 3]); vnb[I[t * 3 + (k + 1) % 3]].add(I[t * 3 + k]); } }
      const dist = (src) => {
        const d = new Float64Array(n).fill(Infinity), heap = [];
        const push = (v) => { heap.push(v); let k = heap.length - 1; while (k) { const q2 = (k - 1) >> 1; if (d[heap[q2]] <= d[heap[k]]) break; [heap[q2], heap[k]] = [heap[k], heap[q2]]; k = q2; } };
        const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r2 = l + 1; let m = k; if (l < heap.length && d[heap[l]] < d[heap[m]]) m = l; if (r2 < heap.length && d[heap[r2]] < d[heap[m]]) m = r2; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
        for (const v of src) { d[v] = 0; push(v); }
        while (heap.length) { const v = pop(); if (d[v] > reach * 1.5) break; for (const u of vnb[v]) { const nd = d[v] + Math.hypot(R[u * 3] - R[v * 3], R[u * 3 + 1] - R[v * 3 + 1], R[u * 3 + 2] - R[v * 3 + 2]); if (nd < d[u]) { d[u] = nd; push(u); } } }
        return d;
      };
      const dB = dist([rule.split.band].flat().flatMap(pick)), dO = dist([rule.split.body].flat().flatMap(pick));
      let got = 0;
      for (let t = 0; t < T; t++) {
        if (!lim(t)) continue;
        const v = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]], b2 = (dB[v[0]] + dB[v[1]] + dB[v[2]]) / 3, o = (dO[v[0]] + dO[v[1]] + dO[v[2]]) / 3;
        if (b2 < reach && b2 < o) { part[t] = p; got++; }
      }
      console.log(`split ${rule.part}: ${got} triangles`);
      continue;
    }
    // (`slab`: the end of a sleeve or leg, a band `width` deep from its far end along `axis` (model units), among the
    // triangles `where` allows (one sleeve): a cuff turned up at a sleeve's end.)
    // (`hem`: a band turned at a fold (a sleeve's or leg's end): its seeds the fold's edges (bent more than `fold` degrees)
    // among the triangles `where` allows; every such triangle all of whose corners are within `reach` of them along the
    // cloth. So the band's edge runs parallel to the model's own end.)
    if (rule.hem) {
      const p = S.keys.indexOf(rule.part) + 1, lim = rule.where ? test(rule.where) : () => true, cos = Math.cos((rule.hem.fold * Math.PI) / 180);
      if (!vnb) { vnb = Array.from({ length: n }, () => new Set()); for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { vnb[I[t * 3 + k]].add(I[t * 3 + (k + 1) % 3]); vnb[I[t * 3 + (k + 1) % 3]].add(I[t * 3 + k]); } }
      const seeds = new Set();
      // (Or the seeds are the corners of the triangles `seed` (a test) picks: the end's own small pieces.)
      if (rule.hem.seed) { const sd = test(rule.hem.seed); for (let t = 0; t < T; t++) if (sd(t)) for (let k = 0; k < 3; k++) seeds.add(I[t * 3 + k]); }
      else for (const [key, ts] of edgeTris) {
        if (ts.length !== 2 || !lim(ts[0]) || !lim(ts[1])) continue;
        const [f, g] = ts;
        if (fn[f * 3] * fn[g * 3] + fn[f * 3 + 1] * fn[g * 3 + 1] + fn[f * 3 + 2] * fn[g * 3 + 2] < cos) { seeds.add(Math.floor(key / n)); seeds.add(key % n); }
      }
      const d = new Float64Array(n).fill(Infinity), q = [...seeds];
      for (const v of q) d[v] = 0;
      // (Dijkstra by repeated relaxing: small regions.)
      for (let k = 0; k < q.length; k++) { const v = q[k]; for (const u of vnb[v]) { const nd = d[v] + Math.hypot(R[u * 3] - R[v * 3], R[u * 3 + 1] - R[v * 3 + 1], R[u * 3 + 2] - R[v * 3 + 2]); if (nd < d[u] && nd < rule.hem.reach * 1.5) { d[u] = nd; q.push(u); } } }
      let got = 0;
      for (let t = 0; t < T; t++) if (lim(t) && [0, 1, 2].every((k) => d[I[t * 3 + k]] <= rule.hem.reach)) { part[t] = p; got++; }
      console.log(`hem ${rule.part}: ${seeds.size} fold points, ${got} triangles`);
      continue;
    }
    if (rule.slab) {
      const p = S.keys.indexOf(rule.part) + 1, lim = rule.where ? test(rule.where) : () => true;
      let ax = rule.slab.axis.slice(), al = Math.hypot(...ax);
      const along = (t) => { const m = mid(t); return (m[0] * ax[0] + m[1] * ax[1] + m[2] * ax[2]) / al; };
      let far = -Infinity;
      for (let t = 0; t < T; t++) if (lim(t)) far = Math.max(far, along(t));
      // (The end's own plane: the end ring's points (within 8 mm of the far end) fitted, their least spread its normal;
      // three rounds.)
      for (let round = 0; round < 3; round++) {
        const pts = [];
        for (let t = 0; t < T; t++) if (lim(t) && along(t) >= far - 0.008) pts.push(mid(t));
        if (pts.length < 10) break;
        const c0 = [0, 1, 2].map((a) => pts.reduce((q, m) => q + m[a], 0) / pts.length), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (const m of pts) { const d = m.map((v, a) => v - c0[a]); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
        const tr = C[0][0] + C[1][1] + C[2][2]; let nv = ax.map((v) => v / al);
        for (let it = 0; it < 200; it++) { const m = [0, 1, 2].map((i) => tr * nv[i] - (C[i][0] * nv[0] + C[i][1] * nv[1] + C[i][2] * nv[2])), l = Math.hypot(...m); nv = m.map((x) => x / l); }
        if (nv[0] * ax[0] + nv[1] * ax[1] + nv[2] * ax[2] < 0) nv = nv.map((v) => -v);
        ax = nv; al = 1; far = -Infinity;
        for (let t = 0; t < T; t++) if (lim(t)) far = Math.max(far, along(t));
      }
      let got = 0;
      for (let t = 0; t < T; t++) if (lim(t) && along(t) >= far - rule.slab.width) { part[t] = p; got++; }
      console.log(`slab ${rule.part}: ${got} triangles`);
      continue;
    }
    if (rule.fill) {
      const p = S.keys.indexOf(rule.part) + 1, bar = new Set(rule.fill.barrier ?? []), seed = test(rule.fill.seed), got = new Uint8Array(T), q = [];
      for (let t = 0; t < T; t++) if (!bar.has(triReg[t]) && seed(t)) { got[t] = 1; q.push(t); }
      for (let k = 0; k < q.length; k++) for (const u of nbs[q[k]]) if (!got[u]) { got[u] = 1; if (!bar.has(triReg[u])) q.push(u); }
      const total = got.reduce((s2, v) => s2 + v, 0);
      if (total > (rule.fill.max ?? T / 4)) throw new Error(`fill for ${rule.part} reached ${total} triangles: its seam is not closed`);
      for (let t = 0; t < T; t++) if (got[t]) part[t] = p;
      console.log(`fill ${rule.part}: ${q.length} seeds+reached, ${total} with the seam`);
      continue;
    }
    const ids = rule.regions ? new Set(rule.regions) : null, p = rule.part === 'cloth' ? 0 : S.keys.indexOf(rule.part) + 1;
    if (rule.part !== 'cloth' && p < 1) throw new Error(`unknown part ${rule.part}`);
    const where = rule.where ? test(rule.where) : null;
    for (let t = 0; t < T; t++) {
      if (ids && !ids.has(triReg[t])) continue;
      if (where && !where(t)) continue;
      part[t] = p;
    }
  }
  // (Clean edges (`smooth`, default 2 passes): a part's triangle with one neighbour of its own and two of another's goes to
  // that other; a cloth or other triangle with two or more neighbours of one part joins it (teeth and notches along a border
  // made by a test); then a part's islands under `minPiece` triangles (default 25) go back to the cloth.)
  for (let it = 0; it < (S.smooth ?? 2); it++) {
    const next = Uint8Array.from(part);
    for (let t = 0; t < T; t++) {
      const cnt = new Map();
      for (const u of nbs[t]) cnt.set(part[u], (cnt.get(part[u]) ?? 0) + 1);
      const own = cnt.get(part[t]) ?? 0, [best, bc] = [...cnt].filter(([q]) => q !== part[t]).sort((a2, b2) => b2[1] - a2[1])[0] ?? [null, 0];
      if (best != null && bc >= 2 && own <= 1) next[t] = best;
    }
    part.set(next);
  }
  {
    const seen = new Uint8Array(T);
    for (let t = 0; t < T; t++) {
      if (!part[t] || seen[t]) continue;
      const q = [t]; seen[t] = 1;
      for (let k = 0; k < q.length; k++) for (const u of nbs[q[k]]) if (!seen[u] && part[u] === part[t]) { seen[u] = 1; q.push(u); }
      if (q.length < (S.minPiece ?? 25)) for (const u of q) part[u] = 0;
    }
  }
  // (`minCloth` (CLIENTOPS 2026-11-26, the warm-up hoodie's stray dark specks on its sleeve): a cloth island under that many
  // triangles wholly inside one part joins that part. Off unless set.)
  if (S.minCloth) {
    const seen = new Uint8Array(T);
    for (let t = 0; t < T; t++) {
      if (part[t] || seen[t]) continue;
      const q = [t], round = new Set(); seen[t] = 1;
      for (let k = 0; k < q.length; k++) for (const u of nbs[q[k]]) { if (part[u]) round.add(part[u]); else if (!seen[u]) { seen[u] = 1; q.push(u); } }
      if (q.length < S.minCloth && round.size === 1) { const p2 = [...round][0]; for (const u of q) part[u] = p2; }
    }
  }
  return { part, triReg };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), name = args.find((a) => !a.startsWith('--'));
  const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
  const S = JSON.parse(fs.readFileSync(path.join(here, 'parts', `${name}.json`), 'utf8'));
  const glb = readGLB(path.resolve(here, S.glb));
  const { part } = glbParts(glb, S);
  if (opt('labels')) fs.writeFileSync(opt('labels'), JSON.stringify({ triLabel: Array.from(part), names: ['cloth', ...S.keys] }));
  // The data file (our own, made by the converter): read, the parts added, written back.
  const file = path.join(here, `tripo-${name}.js`), text = fs.readFileSync(file, 'utf8'), ctx = { window: {} };
  vm.runInNewContext(text, ctx);
  const D = ctx.window.TRIPO_MESHES[name], b = (s) => Buffer.from(s, 'base64');
  const q = new Uint16Array(new Uint8Array(b(D.pos)).buffer), idx = new Uint16Array(new Uint8Array(b(D.idx)).buffer), n = D.count;
  // Each data point back in the model's own units (its placing undone: move, scale, a converter's forward tilt).
  const th = ((D.tilt ?? 0) * Math.PI) / 180, ct = Math.cos(th), st = Math.sin(th);
  const own = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    let p = [0, 1, 2].map((c) => (D.lo[c] + (q[i * 3 + c] / 65535) * (D.hi[c] - D.lo[c]) - D.move[c]) / D.scale);
    // (A converter's turn round the upright (data `turn`, degrees) undone.)
    if (D.turn) { const a = (-D.turn * Math.PI) / 180, c = Math.cos(a), s2 = Math.sin(a); p = [p[0] * c + p[2] * s2, p[1], -p[0] * s2 + p[2] * c]; }
    own.set([p[0], p[1] * ct + p[2] * st, -p[1] * st + p[2] * ct], i * 3);
  }
  // The model's triangles in a grid; each data triangle takes the part of the model triangle under its middle.
  const G = 0.02, grid = new Map(), key = (a, c, d) => `${a},${c},${d}`, P = glb.pos, I = glb.idx;
  const V = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  for (let t = 0; t < I.length / 3; t++) {
    const c = [0, 1, 2].map((a) => (P[I[t * 3] * 3 + a] + P[I[t * 3 + 1] * 3 + a] + P[I[t * 3 + 2] * 3 + a]) / 3).map((v) => Math.floor(v / G));
    (grid.get(key(...c)) ?? grid.set(key(...c), []).get(key(...c))).push(t);
  }
  const triPart = new Uint8Array(idx.length / 3);
  let worst = 0;
  for (let t = 0; t < triPart.length; t++) {
    const m = [0, 1, 2].map((a) => (own[idx[t * 3] * 3 + a] + own[idx[t * 3 + 1] * 3 + a] + own[idx[t * 3 + 2] * 3 + a]) / 3);
    const c = m.map((v) => Math.floor(v / G));
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 3 && (best < 0 || bd > G * (r - 1)); r++) for (let a = -r; a <= r; a++) for (let e = -r; e <= r; e++) for (let f = -r; f <= r; f++) for (const u of grid.get(key(c[0] + a, c[1] + e, c[2] + f)) ?? []) {
      const p = closestOnTriangle(m, V(I[u * 3]), V(I[u * 3 + 1]), V(I[u * 3 + 2])), d = Math.hypot(p[0] - m[0], p[1] - m[1], p[2] - m[2]);
      if (d < bd) { bd = d; best = u; }
    }
    worst = Math.max(worst, bd);
    triPart[t] = best >= 0 ? part[best] : 0;
  }
  // (`oldBand` rules: a triangle still cloth whose three corners are all on one of the converter's own per-point bands
  // listed (its inside, say) takes that part.)
  const oldBand = D.band ? new Uint8Array(b(D.band)) : null;
  for (const rule of S.rules ?? []) {
    if (!rule.oldBand || !oldBand) continue;
    const set = new Set(rule.oldBand), p = S.keys.indexOf(rule.part) + 1;
    for (let t = 0; t < triPart.length; t++) if (!triPart[t] && [0, 1, 2].every((k) => set.has(oldBand[idx[t * 3 + k]]))) triPart[t] = p;
    // (`erode` (metres; MODELQ6 2026-11-17, the netball bib): the part taken back that far from where it meets the outside
    // cloth (the converter's band 0): a converter band reaching past the model's own edge (its roll's foot) onto the flat
    // cloth below; tripo-pieces.mjs then draws the part's border onto the crease there (fromParts, snap).)
    if (rule.erode) {
      const at = (i) => [0, 1, 2].map((c) => D.lo[c] + (q[i * 3 + c] / 65535) * (D.hi[c] - D.lo[c])), wk = (i) => at(i).map((v) => Math.round(v * 1e4)).join(',');
      const clothPts = new Set(), partPts = new Set();
      for (let t = 0; t < triPart.length; t++) { const c = [0, 1, 2].map((k) => idx[t * 3 + k]); if (triPart[t] === p) c.forEach((i) => partPts.add(wk(i))); else if (!triPart[t] && c.some((i) => oldBand[i] === 0)) c.forEach((i) => clothPts.add(wk(i))); }
      const edge = [...partPts].filter((k) => clothPts.has(k)).map((k) => k.split(',').map((v) => +v / 1e4));
      const EG = 0.01, eg = new Map(); for (const e of edge) { const k = e.map((v) => Math.floor(v / EG)).join(','); (eg.get(k) ?? eg.set(k, []).get(k)).push(e); }
      let taken = 0;
      for (let t = 0; t < triPart.length; t++) {
        if (triPart[t] !== p) continue;
        const m = [0, 1, 2].map((c) => [0, 1, 2].reduce((acc, k) => acc + at(idx[t * 3 + k])[c] / 3, 0)), g0 = m.map((v) => Math.floor(v / EG)), r = Math.ceil(rule.erode / EG);
        let near = false;
        for (let a2 = -r; a2 <= r && !near; a2++) for (let b2 = -r; b2 <= r && !near; b2++) for (let c2 = -r; c2 <= r && !near; c2++) for (const e of eg.get(`${g0[0] + a2},${g0[1] + b2},${g0[2] + c2}`) ?? []) if (Math.hypot(e[0] - m[0], e[1] - m[1], e[2] - m[2]) < rule.erode) { near = true; break; }
        if (near) { triPart[t] = 0; taken++; }
      }
      console.log(`[${name}] ${rule.part}: ${taken} triangles taken back within ${rule.erode * 1000} mm of the outside cloth`);
    }
  }
  D.triPart = Buffer.from(triPart.buffer).toString('base64');
  D.partKeys = S.keys;
  // (The converter's own bands these parts replace: printed as cloth under them, tripomesh.js.)
  D.partBands = S.partBands ?? [];
  fs.writeFileSync(file, `window.TRIPO_MESHES=window.TRIPO_MESHES||{};window.TRIPO_MESHES[${JSON.stringify(name)}]=${JSON.stringify(D)};\n`);
  const counts = S.keys.map((k, j) => `${k} ${triPart.reduce((s, v) => s + (v === j + 1), 0)}`);
  console.log(`[${name}] parts per triangle: ${counts.join(', ')}; cloth ${triPart.reduce((s, v) => s + !v, 0)} (largest gap to the model ${(worst * 1000).toFixed(2)} mm, model units)`);
}
