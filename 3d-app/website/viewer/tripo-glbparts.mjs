// A ready-made model coloured from a second file of the SAME garment split into parts by Tripo (RUGBYJ 2026-11-18, the
// rugby jersey: rugby-jersey-parts.glb = body, two sleeves, collar, back-neck strip). Run from website/ AFTER its
// converter (it reads and rewrites viewer/tripo-<name>.js):
//
//   node viewer/tripo-glbparts.mjs <name>
//
// Settings: viewer/parts/<name>.json `glbParts`:
//   glb      the parts file (from viewer/), read as data only
//   keys     { <part node name>: key | null (the print) }: texture.js paintModelSwatches keys
//   collar   the collar's key; its foot is one smooth closed line round the neck, and it wins over every other piece
//   sleeves  the sleeves' keys; each sleeve's border with the body (raglan seam, front and back, under the arm) one smooth
//            closed line; a sleeve is one colour inside and out (its lining takes its key), so its cuff edge is clean
//   band     { key, from, to } (m): an even band inside the collar, from `from` to `to` below the collar's top fold (the
//            picture's navy band inside the top of a rugby collar)
//   sigma    (m) how far along each line it is smoothed (collarSigma: the collar's foot); reach (m) how far from a line its distance is measured
//   far, island, speck: points with no part nearer than `far` take their neighbours'; patches of fewer than `island`
//            points and of fewer than `speck` triangles take the key round them
// The model's shape is never changed: only which piece each point is on and its signed distance from the smooth line
// between its piece and the next (the data's `piece` / `pieceTri`, as tripo-pieces.mjs writes them; main.js colours each
// piece up to that line).
// How:
//  1. each point takes the part of the nearest parts-file triangle facing its own way (placed as the converter placed the
//     model: data scale and move); tiny patches take the key round them;
//  2. its cloth layer: the outside (a ray from it along its normal, or a little to the side, gets out of the garment) or
//     the inside (lining, turned-in collar, hem fold); an inside point takes the key of the outside cloth facing it;
//  3. the borders (collar foot, each sleeve's seam) found where the smoothed share of that piece is one half, chained,
//     smoothed along their length and laid back onto the cloth; every point's signed distance from them;
//  4. the band inside the collar measured from the collar's top fold over the cloth.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel, analyse } from './pieces/model.mjs';
import { closestOnTri } from './pieces/pieces.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
const settings = name && JSON.parse(fs.readFileSync(path.join(here, 'parts', `${name}.json`), 'utf8')).glbParts;
if (!settings) { console.error('usage: node viewer/tripo-glbparts.mjs <name>   (viewer/parts/<name>.json needs `glbParts`)'); process.exit(1); }
const say = (...a) => console.log(`[${name}]`, ...a);

// ---- The parts file: each node's triangles (node translation and scale only; the parts files have no rotation).
function readParts(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB file`);
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) { const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4), chunk = buf.subarray(off + 8, off + 8 + len); if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8')); else if (type === 0x004e4942) bin = chunk; off += 8 + len; }
  const read = (i) => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], comps = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type], Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType]; const s = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0); return new Type(bin.buffer.slice(s, s + a.count * comps * Type.BYTES_PER_ELEMENT)); };
  const out = [];
  for (const node of json.nodes) {
    if (node.mesh == null) continue;
    if (node.rotation && node.rotation.some((v, i) => Math.abs(v - [0, 0, 0, 1][i]) > 1e-6)) throw new Error(`${node.name}: rotated part not supported`);
    const t = node.translation ?? [0, 0, 0], s = node.scale ?? [1, 1, 1], tris = [];
    for (const prim of json.meshes[node.mesh].primitives) {
      const p = read(prim.attributes.POSITION), ix = prim.indices != null ? read(prim.indices) : Uint32Array.from({ length: p.length / 3 }, (_, i) => i);
      for (const v of ix) tris.push([p[v * 3] * s[0] + t[0], p[v * 3 + 1] * s[1] + t[1], p[v * 3 + 2] * s[2] + t[2]]);
    }
    out.push({ name: node.name, tris });
  }
  return out;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

const m = loadModel(name), A = analyse(m), D = m.D, V = A.V;
const P3 = (v) => [A.P[v * 3], A.P[v * 3 + 1], A.P[v * 3 + 2]], N3 = (v) => [A.PN[v * 3], A.PN[v * 3 + 1], A.PN[v * 3 + 2]];
const parts = readParts(path.resolve(here, settings.glb));
// (A converter's turn round the upright (data `turn`, degrees: the training tee's model faces away) applied first, as the
// converter placed the model (tripo-parts.mjs undoes it the same way); MODELQ5 2026-11-18.)
const turnA = ((D.turn ?? 0) * Math.PI) / 180, tc = Math.cos(turnA), ts = Math.sin(turnA);
const place = (p0) => { const p = D.turn ? [p0[0] * tc + p0[2] * ts, p0[1], -p0[0] * ts + p0[2] * tc] : p0; return [p[0] * D.scale + D.move[0], p[1] * D.scale + D.move[1], p[2] * D.scale + D.move[2]]; };
// (Each key's index: 1 + its place in the data's partKeys; 0 = the print.)
const keys = [...(D.partKeys ?? [])];
const keyIdx = (k) => { if (k == null) return 0; let i = keys.indexOf(k); if (i < 0) { keys.push(k); i = keys.length - 1; } return i + 1; };
const partKey = parts.map((p) => { if (!(p.name in settings.keys)) throw new Error(`no key for part ${p.name}`); return keyIdx(settings.keys[p.name]); });
const COLLAR = keyIdx(settings.collar), SLEEVES = (settings.sleeves ?? []).map(keyIdx), BAND = settings.band ? keyIdx(settings.band.key) : -1;
// (Neighbours on the same layer of cloth: across an edge whose two points face the same way, not round a fold.)
const same = (u, v) => dot(N3(u), N3(v)) > 0.3;
const nbs = A.nb.map((s, v) => [...s].filter((u) => same(u, v)));
const islands = (key, min, ok = () => true) => {
  let fixed = 0;
  const total = new Map(); for (let v = 0; v < V; v++) total.set(key[v], (total.get(key[v]) ?? 0) + 1);
  const seen = new Uint8Array(V);
  for (let s0 = 0; s0 < V; s0++) {
    if (seen[s0] || !ok(s0)) continue;
    const comp = [s0], k0 = key[s0]; seen[s0] = 1;
    for (let i = 0; i < comp.length; i++) for (const u of nbs[comp[i]]) if (!seen[u] && key[u] === k0 && ok(u)) { seen[u] = 1; comp.push(u); }
    if (comp.length >= min || comp.length > total.get(k0) / 2) continue;
    const votes = new Map(); for (const v of comp) for (const u of nbs[v]) if (key[u] !== k0 && ok(u)) votes.set(key[u], (votes.get(key[u]) ?? 0) + 1);
    const to = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (to !== undefined) { for (const v of comp) key[v] = to; fixed += comp.length; }
  }
  return fixed;
};

// ---- 1. Each point: the part of the nearest parts-file triangle facing its own way.
const G = 0.02, gk = (x, y, z) => `${x},${y},${z}`;
const grid = new Map(), TR = [];
parts.forEach((p, pi) => { for (let k = 0; k < p.tris.length; k += 3) {
  const tri = [place(p.tris[k]), place(p.tris[k + 1]), place(p.tris[k + 2])], id = TR.length; TR.push({ tri, pi, n: nrm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]))) });
  const mn = [0, 1, 2].map((a) => Math.floor(Math.min(...tri.map((q) => q[a])) / G)), mx = [0, 1, 2].map((a) => Math.floor(Math.max(...tri.map((q) => q[a])) / G));
  for (let x = mn[0]; x <= mx[0]; x++) for (let y = mn[1]; y <= mx[1]; y++) for (let z = mn[2]; z <= mx[2]; z++) { const kk = gk(x, y, z); (grid.get(kk) ?? grid.set(kk, []).get(kk)).push(id); }
} });
const key = new Int16Array(V).fill(-1); let far = 0;
for (let v = 0; v < V; v++) {
  const p = P3(v), c = p.map((x) => Math.floor(x / G)), pn = N3(v);
  let best = -1, bd = Infinity;
  for (let r = 1; r <= 3 && best < 0; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let d = -r; d <= r; d++) for (const id of grid.get(gk(c[0] + a, c[1] + b, c[2] + d)) ?? []) {
    // (a triangle facing away from the point's own cloth (the other layer) counts 2 cm further away)
    const q = closestOnTri(p, ...TR[id].tri), dd = Math.hypot(...sub(q, p)) + (dot(TR[id].n, pn) < 0 ? 0.02 : 0); if (dd < bd) { bd = dd; best = id; }
  }
  if (best < 0 || bd > (settings.far ?? 0.03) + 0.02) { far++; continue; }
  key[v] = partKey[TR[best].pi];
}
for (let it = 0; it < 30 && key.includes(-1); it++) for (let v = 0; v < V; v++) if (key[v] < 0) for (const u of A.nb[v]) if (key[u] >= 0) { key[v] = key[u]; break; }
for (let v = 0; v < V; v++) if (key[v] < 0) key[v] = 0;
const isl1 = islands(key, settings.island ?? 60);

// ---- 2. Outside or inside: rays from the point along its normal and 6 tilted round it; out when two get out.
const TG = 0.02, tgrid = new Map();
for (let t = 0; t < A.T; t++) {
  const mn = [9, 9, 9], mx = [-9, -9, -9];
  for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) { const x = A.P[A.F[t * 3 + k] * 3 + a]; mn[a] = Math.min(mn[a], x); mx[a] = Math.max(mx[a], x); }
  for (let x = Math.floor(mn[0] / TG); x <= Math.floor(mx[0] / TG); x++) for (let y = Math.floor(mn[1] / TG); y <= Math.floor(mx[1] / TG); y++) for (let z = Math.floor(mn[2] / TG); z <= Math.floor(mx[2] / TG); z++) { const k = gk(x, y, z); (tgrid.get(k) ?? tgrid.set(k, []).get(k)).push(t); }
}
const lo = [9, 9, 9], hi = [-9, -9, -9]; for (let v = 0; v < V; v++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], A.P[v * 3 + a]); hi[a] = Math.max(hi[a], A.P[v * 3 + a]); }
const hits = (o, d, own) => {
  const seen = new Set();
  for (let s = 0.001; s < 0.7; s += TG * 0.5) {
    const p = [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
    if (p.some((x, a) => x < lo[a] - 0.02 || x > hi[a] + 0.02)) return false;
    for (const t of tgrid.get(gk(...p.map((x) => Math.floor(x / TG)))) ?? []) {
      if (seen.has(t) || own.has(t)) continue; seen.add(t);
      const a = P3(A.F[t * 3]), e1 = sub(P3(A.F[t * 3 + 1]), a), e2 = sub(P3(A.F[t * 3 + 2]), a), pv = cross(d, e2), det = dot(e1, pv);
      if (Math.abs(det) < 1e-12) continue;
      const tv = sub(o, a), u = dot(tv, pv) / det; if (u < 0 || u > 1) continue;
      const qv = cross(tv, e1), w = dot(d, qv) / det; if (w < 0 || u + w > 1) continue;
      if (dot(e2, qv) / det > 0.0015) return true;
    }
  }
  return false;
};
const vt = Array.from({ length: V }, () => []); for (let t = 0; t < A.T; t++) for (let k = 0; k < 3; k++) vt[A.F[t * 3 + k]].push(t);
const outside = new Uint8Array(V);
for (let v = 0; v < V; v++) {
  const n = N3(v), o = P3(v), own = new Set(vt[v]), t1 = nrm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross(n, t1);
  const dirs = [n, ...[0, 1, 2, 3, 4, 5].map((k) => { const a = (k * Math.PI) / 3; return nrm(n.map((x, i) => x + 0.7 * (Math.cos(a) * t1[i] + Math.sin(a) * t2[i]))); })];
  let out = 0; for (const d of dirs) if (!hits(o, d, own) && ++out >= 2) break;
  outside[v] = out >= 2 ? 1 : 0;
}
// (single stray points of either layer take their neighbours')
for (let it = 0; it < 2; it++) for (let v = 0; v < V; v++) { const L = nbs[v]; if (L.length >= 3 && L.every((u) => outside[u] !== outside[v])) outside[v] = 1 - outside[v]; }
// An inside point takes the key of the outside cloth facing it (the other face of the same cloth, within `wall`).
const PG = 0.01, pgrid = new Map(); for (let v = 0; v < V; v++) { const k = gk(...P3(v).map((x) => Math.floor(x / PG))); (pgrid.get(k) ?? pgrid.set(k, []).get(k)).push(v); }
const nearPts = (p, r) => { const c = p.map((x) => Math.floor(x / PG)), n2 = Math.ceil(r / PG), o = []; for (let a = -n2; a <= n2; a++) for (let b = -n2; b <= n2; b++) for (let d = -n2; d <= n2; d++) for (const v of pgrid.get(gk(c[0] + a, c[1] + b, c[2] + d)) ?? []) if (Math.hypot(...sub(P3(v), p)) < r) o.push(v); return o; };
const facing = new Int32Array(V).fill(-1);
for (let v = 0; v < V; v++) {
  if (outside[v]) continue;
  let bd = settings.wall ?? 0.025;
  for (const u of nearPts(P3(v), bd)) { if (!outside[u] || dot(N3(u), N3(v)) > -0.5 || dot(sub(P3(u), P3(v)), N3(v)) > 0) continue;   // (behind it: its other face, never the cloth across a gap in front of it)
    const d = Math.hypot(...sub(P3(u), P3(v))); if (d < bd) { bd = d; facing[v] = u; } }
}
let lined = 0; for (let v = 0; v < V; v++) if (facing[v] >= 0 && key[v] !== key[facing[v]]) { key[v] = key[facing[v]]; lined++; }
const isl2 = islands(key, settings.island ?? 60);
// (Out beyond the body's side, every point is its sleeve's, outside, lining and the fold between (QATEST -353: specks
// along the sleeve openings' edge).)
let pastBody = 0;
if (SLEEVES.length) {
  const bx = []; for (let v = 0; v < V; v++) if (key[v] === 0 && outside[v]) bx.push(Math.abs(A.P[v * 3])); bx.sort((a, b) => a - b);
  const edge = (bx[Math.floor(bx.length * 0.995)] ?? 9) + (settings.pastBody ?? 0.03);
  const sideKey = [1, -1].map((sg) => { const c = new Map(); for (let v = 0; v < V; v++) if (SLEEVES.includes(key[v]) && sg * A.P[v * 3] > edge) c.set(key[v], (c.get(key[v]) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0]; });
  for (let v = 0; v < V; v++) { const k = sideKey[A.P[v * 3] > 0 ? 0 : 1]; if (k && Math.abs(A.P[v * 3]) > edge && key[v] !== k) { key[v] = k; pastBody++; } }
  say(`points past the body's side made their sleeve's: ${pastBody} (beyond |x| ${edge.toFixed(3)})`);
}

// ---- 3. The borders: per piece (the collar; each sleeve, the collar counted as the piece next to it below), its
// smoothed share; where it is one half on the outside cloth, chained into lines, smoothed, laid onto the cloth.
const sigma = settings.sigma ?? 0.015, reach = settings.reach ?? 0.03;
function shareOf(inPiece, steps = 12) {
  let w = Float32Array.from({ length: V }, (_, v) => (inPiece(v) ? 1 : 0));
  for (let it = 0; it < steps; it++) { const n = new Float32Array(V); for (let v = 0; v < V; v++) { const L = nbs[v]; let s = 0; for (const u of L) s += w[u]; n[v] = L.length ? 0.5 * w[v] + (0.5 * s) / L.length : w[v]; } w = n; }
  return w;
}
function linesOf(w, sigma, region = null) {
  // (`region`: the cloth a stitch line lies on (default: the outside cloth, as the colour borders))
  const inRegion = region ?? ((v) => outside[v]);
  const ek = (u, v) => (u < v ? u * 1e6 + v : v * 1e6 + u), segs = [];
  const cut = (u, v) => { const f = (w[u] - 0.5) / (w[u] - w[v] || 1e-9); return P3(u).map((x, k) => x + (A.P[v * 3 + k] - x) * f); };
  for (let t = 0; t < A.T; t++) {
    const c = [A.F[t * 3], A.F[t * 3 + 1], A.F[t * 3 + 2]];
    if (!c.every(inRegion)) continue;
    const cr = [];
    for (let k = 0; k < 3; k++) { const u = c[k], v = c[(k + 1) % 3]; if ((w[u] >= 0.5) !== (w[v] >= 0.5)) cr.push([ek(u, v), cut(u, v)]); }
    if (cr.length === 2) segs.push(cr);
  }
  const at = new Map(); segs.forEach((s, i) => { for (const [e] of s) (at.get(e) ?? at.set(e, []).get(e)).push(i); });
  const used = new Uint8Array(segs.length), out = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const walk = (from) => { const pts = []; let cur = s0, e = from; for (;;) { const nx = segs[cur].find(([x]) => x !== e); pts.push(nx[1]); const j = (at.get(nx[0]) ?? []).find((i) => !used[i]); if (j === undefined) return { pts, back: (at.get(nx[0]) ?? []).includes(s0) && cur !== s0 }; used[j] = 1; cur = j; e = nx[0]; } };
    const fw = walk(segs[s0][0][0]), closed = fw.back, bw = closed ? { pts: [] } : walk(segs[s0][1][0]);
    const C = [...bw.pts.reverse(), segs[s0][0][1], ...fw.pts];
    if (C.length < 8) continue;
    // resampled every 2 mm, smoothed (Gaussian `sigma`; an open line keeps its ends), laid onto the outside cloth
    const R = [C[0]]; let acc = 0;
    for (let i = 1; i < C.length; i++) { const d = Math.hypot(...sub(C[i], C[i - 1])); acc += d; while (acc >= 0.002) { const f = 1 - (acc - 0.002) / (d || 1); R.push(C[i - 1].map((x, k) => x + (C[i][k] - x) * Math.min(1, Math.max(0, f)))); acc -= 0.002; } }
    if (R.length < 8) continue;
    const sg = sigma / 0.002, hw = Math.ceil(3 * sg), ker = []; for (let o = -hw; o <= hw; o++) ker.push(Math.exp(-0.5 * (o / sg) ** 2));
    let L = R.map((_, k) => { let s = [0, 0, 0], ws = 0; const ww = closed ? hw : Math.min(hw, k, R.length - 1 - k); for (let o = -ww; o <= ww; o++) { const j = closed ? (((k + o) % R.length) + R.length) % R.length : k + o; s = s.map((x, i) => x + R[j][i] * ker[o + hw]); ws += ker[o + hw]; } return s.map((x) => x / ws); });
    // (laid onto the line's own cloth (its region), the normal of the face it lies on: the cloth within 1.5 cm facing as the
    // nearest point does, so the other face of a thin opening never cancels it)
    const nearV = []; L = L.map((p) => { let best = p, bd = 9, bv = -1; for (const v of nearPts(p, 0.02)) { if (!inRegion(v)) continue; for (const t of vt[v]) { const q = closestOnTri(p, P3(A.F[t * 3]), P3(A.F[t * 3 + 1]), P3(A.F[t * 3 + 2])), d = Math.hypot(...sub(q, p)); if (d < bd) { bd = d; best = q; bv = v; } } } nearV.push(bv); return best; });
    if (false) L = L.map((p) => { let best = p, bd = 9; for (const v of nearPts(p, 0.02)) { if (!outside[v]) continue; for (const t of vt[v]) { const q = closestOnTri(p, P3(A.F[t * 3]), P3(A.F[t * 3 + 1]), P3(A.F[t * 3 + 2])), d = Math.hypot(...sub(q, p)); if (d < bd) { bd = d; best = q; } } } return best; });
    const n = L.length, normal = L.map((p, i) => { const own = region && nearV[i] >= 0 ? N3(nearV[i]) : null; let s = [0, 0, 0]; for (const v of nearPts(p, 0.015)) if (inRegion(v) && (!own || dot(N3(v), own) > 0)) s = s.map((x, k) => x + A.PN[v * 3 + k]); return nrm(s); });
    let side = L.map((p, i) => nrm(cross(nrm(sub(L[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], L[closed ? (i - 1 + n) % n : Math.max(0, i - 1)])), normal[i])));
    for (let i = 1; i < n; i++) if (dot(side[i], side[i - 1]) < 0) side[i] = side[i].map((x) => -x);
    // (each place then turned to its piece by the cloth within 1.2 cm of it, where that cloth says clearly: MODELQ6)
    if (settings.localSide) side = side.map((d, i) => { let s2 = 0, m2 = 0; for (const v of nearPts(L[i], 0.012)) if (outside[v]) { s2 += dot(sub(P3(v), L[i]), d) * (w[v] - 0.5); m2 += Math.abs(dot(sub(P3(v), L[i]), d) * (w[v] - 0.5)); } return m2 > 0 && s2 < -0.3 * m2 ? d.map((x) => -x) : d; });
    // (+ on the piece's side)
    let vote = 0; L.forEach((p, i) => { for (const v of nearPts(p, 0.012)) if (outside[v]) vote += dot(sub(P3(v), p), side[i]) * (w[v] - 0.5); });
    if (vote < 0) side = side.map((d) => d.map((x) => -x));
    out.push({ C: L, side, normal, closed, len: n * 2 });
  }
  return out;
}
// The signed distance of every outside point from the nearest of the lines (+ in the piece) within `reach`, else by its
// share (+/- reach).
function distOf(lines, w) {
  const d = Float32Array.from({ length: V }, (_, v) => (w[v] >= 0.5 ? reach : -reach)), bd = new Float32Array(V).fill(9);
  for (const L of lines) L.C.forEach((p, i) => { for (const v of nearPts(p, reach)) {
    if (!outside[v] || dot(N3(v), L.normal[i]) < -0.2) continue;
    const e = Math.hypot(...sub(P3(v), p)); if (e >= bd[v]) continue;
    if (!L.closed && (i === 0 || i === L.C.length - 1) && e > 0.004) continue;
    bd[v] = e; d[v] = dot(sub(P3(v), p), L.side[i]);
  } });
  return d;
}
const report = [];
// The collar: its foot one closed line.
// (`evenCuffs` (MODELQ5 2026-11-18, the training tee: its cuffs are their own parts, kept on purpose by the user): a cuff
// piece (a `sleeves` key) one even width all round (and `evenCollar`: the collar a band of one even width down from the neck
// opening's top fold, its axis upright): its line lies at one depth W over the outside cloth from the sleeve
// opening's fold (where its outside cloth turns in), W the middle depth of its parts' own border; so the band's top edge
// is straight and even, however ragged the parts' split is.)
const evenRings = new Map();
const evenShare = (s, up = false) => {
  // (the cuff's ring: its outside points; its axis the least spread of them (its plane's normal), turned away from the
  // body's middle; per 5 degrees round the axis the furthest reach of the cuff's cloth (the opening's fold), smoothed round;
  // each point's depth back from it along the axis. The line is the depth W (the middle depth of its parts' own top
  // border), on the outside cloth round that sleeve's end.)
  const cp = []; for (let v = 0; v < V; v++) if (outside[v] && key[v] === s) cp.push(v);
  const c0 = cp.reduce((acc, v) => acc.map((x, i) => x + A.P[v * 3 + i] / cp.length), [0, 0, 0]);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (const v of cp) { const d = sub(P3(v), c0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  const tr = C[0][0] + C[1][1] + C[2][2]; let ax = [0.31, 0.53, 0.79]; for (let it = 0; it < 300; it++) { const m2 = [0, 1, 2].map((i) => tr * ax[i] - (C[i][0] * ax[0] + C[i][1] * ax[1] + C[i][2] * ax[2])); ax = nrm(m2); }
  if (up ? ax[1] < 0 : ax[0] * c0[0] < 0) ax = ax.map((x) => -x);
  const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], e1 = nrm(cross(ax, ref)), e2 = cross(ax, e1), NB = 72;
  const ang = (v) => { const d = sub(P3(v), c0); return Math.atan2(dot(d, e2), dot(d, e1)); }, along = (v) => dot(sub(P3(v), c0), ax), rad = (v) => { const d = sub(P3(v), c0), t = dot(d, ax); return Math.hypot(...d.map((x, i) => x - ax[i] * t)); };
  const bin = (v) => Math.min(NB - 1, Math.floor(((ang(v) + Math.PI) / (2 * Math.PI)) * NB));
  const end = new Float32Array(NB).fill(-9); for (const v of cp) end[bin(v)] = Math.max(end[bin(v)], along(v));
  for (let k = 0; k < NB; k++) if (end[k] < -1) { let j2 = 1; while (end[(k + j2) % NB] < -1 && end[(k - j2 + NB) % NB] < -1 && j2 < NB) j2++; end[k] = Math.max(end[(k + j2) % NB], end[(k - j2 + NB) % NB]); }
  const endS = end.map((_, k) => { let s2 = 0, ws = 0; for (let o = -4; o <= 4; o++) { const w2 = Math.exp(-0.5 * (o / 2) ** 2); s2 += end[(k + o + NB) % NB] * w2; ws += w2; } return s2 / ws; });
  const depth = (v) => { const f2 = ((ang(v) + Math.PI) / (2 * Math.PI)) * NB - 0.5, k0 = Math.floor(f2), t2 = f2 - k0; return endS[((k0 % NB) + NB) % NB] * (1 - t2) + endS[(((k0 + 1) % NB) + NB) % NB] * t2 - along(v); };
  const R = cp.reduce((acc, v) => acc + rad(v), 0) / cp.length;
  const edge = []; for (const v of cp) if (depth(v) > 0.004 && [...A.nb[v]].some((u) => outside[u] && key[u] !== s)) edge.push(depth(v));
  edge.sort((a2, b2) => a2 - b2); const W = (up ? settings.collarWidth : settings.cuffWidth) ?? edge[edge.length >> 1] ?? 0.02;
  
  // (only the sleeve's own cloth: near the ring's radius and facing away from its axis, never the body beside the sleeve)
  // (its cloth: the outside cloth reached from its own parts' points over neighbours no deeper than its width and a little)
  const sl = new Uint8Array(V), q2 = []; for (const v of cp) { const dp = depth(v); if (dp > -0.03 && dp < W) { sl[v] = 1; q2.push(v); } }
  // (a point taken for the inside in a tight fold by the underarm but facing out, away from the sleeve's axis, is the
  // sleeve's outside here: it takes the band's colour plainly where it lies within the band (below))
  const facesOut = (u) => { const d = sub(P3(u), c0), t = dot(d, ax); return dot(N3(u), nrm(d.map((x, i) => x - ax[i] * t))) > 0.3; };
  let reclaimed = 0;
  while (q2.length) { const v = q2.pop(); for (const u of A.nb[v]) { if (sl[u] || !(outside[u] || facesOut(u))) continue; const dp = depth(u); if (dp > -0.03 && dp < W + 0.012) { sl[u] = 1; q2.push(u); if (!outside[u]) reclaimed++; } } }
  const onSleeve = (v) => sl[v] === 1;
  const near = (v) => rad(v) < R * 1.3;
  // (a turned-in face: facing the axis)
  const inward = (v) => { const d = sub(P3(v), c0), t = dot(d, ax); return dot(N3(v), nrm(d.map((x, i) => x - ax[i] * t))) < -0.3; };
  evenRings.set(s, { depth, W, onSleeve, near, inward, c0, ax });
  report.push(`${keys[s - 1]} even width ${(W * 1000).toFixed(1)} mm (ring ${(R * 1000).toFixed(0)} mm, border ${edge.length}, outside reclaimed ${reclaimed})`);
  return Float32Array.from({ length: V }, (_, v) => { const dp = depth(v); return onSleeve(v) && dp > -0.03 && dp < 0.12 ? Math.max(0, Math.min(1, 0.5 + (W - dp) / 0.01)) : 0; });
};
const wC = settings.evenCollar ? evenShare(COLLAR, true) : shareOf((v) => key[v] === COLLAR), linesC = linesOf(wC, settings.collarSigma ?? sigma, settings.evenCollar ? (v) => outside[v] || evenRings.get(COLLAR).onSleeve(v) : null), dC = distOf(linesC, wC);
report.push(`collar lines ${linesC.map((L) => `${L.len} mm${L.closed ? ' closed' : ''}`).join(', ')}`);
// Each sleeve: the collar's points count as the piece beside them below (nearest point not on the collar, same layer), so
// a sleeve's seam runs on up under the collar and meets the collar's foot line at a clean corner.
const below = Int16Array.from(key);
{
  const off = []; for (let v = 0; v < V; v++) if (key[v] !== COLLAR) off.push(v);
  for (let v = 0; v < V; v++) {
    if (key[v] !== COLLAR) continue;
    let bd = 9, k = 0; for (const u of nearPts(P3(v), 0.06)) { if (key[u] === COLLAR || dot(N3(u), N3(v)) < 0.3) continue; const e = Math.hypot(...sub(P3(u), P3(v))); if (e < bd) { bd = e; k = key[u]; } }
    below[v] = k;
  }
}
const dS = SLEEVES.map((s) => { const w = settings.evenCuffs ? evenShare(s) : shareOf((v) => below[v] === s), L = linesOf(w, sigma, settings.evenCuffs ? (v) => outside[v] || evenRings.get(s).onSleeve(v) : null); report.push(`${keys[s - 1]} lines ${L.map((x) => `${x.len} mm${x.closed ? ' closed' : ''}`).join(', ')}`); return distOf(L, w); });

// ---- Per outside point: collar where it is in the collar, else the sleeve it is in, else the print; the line nearest it
// with its two pieces. Inside points: as the outside cloth facing them (the band inside the collar below).
const pair = new Int16Array(V * 2), S = new Float32Array(V), field = new Int8Array(V);   // field: 0 collar line, 1+k sleeve k
const sleeveAt = (v) => { let k = -1, b = -9; dS.forEach((d, i) => { if (d[v] > b) { b = d[v]; k = i; } }); return [k, b]; };
const setOutside = (v, src) => {
  const [k, ds] = sleeveAt(src), lower = ds > 0 ? SLEEVES[k] : 0, dc = dC[src];
  if (dc > 0 || Math.abs(dc) <= Math.abs(ds)) { pair[v * 2] = COLLAR; pair[v * 2 + 1] = lower; S[v] = dc; field[v] = 0; }
  else { pair[v * 2] = SLEEVES[k]; pair[v * 2 + 1] = 0; S[v] = ds; field[v] = 1 + k; }
};
for (let v = 0; v < V; v++) if (outside[v]) setOutside(v, v);
for (let v = 0; v < V; v++) if (!outside[v]) {
  if (facing[v] >= 0) { setOutside(v, facing[v]); continue; }
  // (no outside cloth facing it (deep inside): its own key, plain)
  pair[v * 2] = pair[v * 2 + 1] = key[v]; S[v] = 0.01; field[v] = -1;
}
// (evenCuffs: a cuff's colour only within its even band (on the sleeve's own cloth, no deeper than its width and a little):
// anywhere else (a stray bit of its parts up the sleeve or on the body by the underarm) the print.)
const evenList = [...evenRings];
for (const [ei, [k, E]] of evenList.entries()) for (let v = 0; v < V; v++) {
  // (its cloth round the opening, outside and turned in: the band up to depth W, its edge smooth (the depth's own measure))
  const dp = E.depth(v);
  if ((E.onSleeve(v) || (!outside[v] && E.near(v) && E.inward(v))) && dp > -0.03 && dp < E.W + 0.03) { pair[v * 2] = k; pair[v * 2 + 1] = 0; S[v] = E.W - dp; field[v] = 100 + ei; continue; }
  if (pair[v * 2] !== k && pair[v * 2 + 1] !== k) continue;
  if (E.onSleeve(v) && E.depth(v) < E.W + 0.004) continue;
  pair[v * 2] = pair[v * 2 + 1] = 0; S[v] = 0.01; field[v] = -1;
}
// ---- 4. The band inside the collar: inside collar points from `from` to `to` over the cloth below its top fold (where its
// outside turns in: an inside collar point next to an outside one, in the collar's upper half).
let bandPts = 0, collarTop = null;
const dR = new Float32Array(V).fill(9);
if (settings.band) {
  // (the collar's inside: its cloth facing the neck's middle, an upright line through the collar's points)
  const cp = []; for (let v = 0; v < V; v++) if (pair[v * 2] === COLLAR && S[v] > 0) cp.push(v);
  const ax = cp.reduce((s2, v) => s2 + A.P[v * 3], 0) / cp.length, az = cp.reduce((s2, v) => s2 + A.P[v * 3 + 2], 0) / cp.length;
  const inward = (v) => A.PN[v * 3] * (A.P[v * 3] - ax) + A.PN[v * 3 + 2] * (A.P[v * 3 + 2] - az) < 0;
  const isC = (v) => pair[v * 2] === COLLAR && S[v] > 0, inC = (v) => isC(v) && inward(v);
  // (its top fold's height all round: the collar's highest cloth per 5 degrees round the neck, smoothed round; each inside
  // point's depth below it: the band is the inside cloth from `from` to `to` below its top, straight and even all round)
  const NB = 72, angOf = (v) => Math.atan2(A.P[v * 3] - ax, A.P[v * 3 + 2] - az), binOf = (v) => Math.min(NB - 1, Math.floor(((angOf(v) + Math.PI) / (2 * Math.PI)) * NB));
  const top = new Float32Array(NB).fill(-9); for (const v of cp) top[binOf(v)] = Math.max(top[binOf(v)], A.P[v * 3 + 1]);
  for (let k = 0; k < NB; k++) if (top[k] < -1) { let j2 = 1; while (top[(k + j2) % NB] < -1 && top[(k - j2 + NB) % NB] < -1 && j2 < NB) j2++; top[k] = Math.max(top[(k + j2) % NB], top[(k - j2 + NB) % NB]); }
  const topS = top.map((_, k) => { let s2 = 0, ws = 0; for (let o = -3; o <= 3; o++) { const w2 = Math.exp(-0.5 * (o / 1.5) ** 2); s2 += top[(k + o + NB) % NB] * w2; ws += w2; } return s2 / ws; });
  const topAt = (v) => { const f2 = ((angOf(v) + Math.PI) / (2 * Math.PI)) * NB - 0.5, k0 = Math.floor(f2), t2 = f2 - k0; return topS[((k0 % NB) + NB) % NB] * (1 - t2) + topS[(((k0 + 1) % NB) + NB) % NB] * t2; };
  collarTop = { topAt, inward, isC };
  for (let v = 0; v < V; v++) if (inC(v)) dR[v] = topAt(v) - A.P[v * 3 + 1];
  const { from, to } = settings.band;
  // (one band: only the largest run of it and the cloth round it; stray bits lower in the neck stay the collar's)
  // (only round the collar's full height: where its top drops by more than `drop` (its front ends) the band stops)
  const topMax = Math.max(...topS), tall = (v) => topAt(v) > topMax - (settings.band.drop ?? 0.02);
  const inB = (v) => inC(v) && tall(v) && dR[v] > from && dR[v] < to, seenB = new Uint8Array(V); let main = [];
  for (let s0 = 0; s0 < V; s0++) { if (seenB[s0] || !inB(s0)) continue; const comp = [s0]; seenB[s0] = 1; for (let i = 0; i < comp.length; i++) for (const u of A.nb[comp[i]]) if (!seenB[u] && inB(u)) { seenB[u] = 1; comp.push(u); } if (comp.length > main.length) main = comp; }
  const near = new Set(main); for (const v of main) for (const u of A.nb[v]) if (inC(u)) near.add(u);
  for (const v of near) if (dR[v] < to + 0.015 && tall(v)) { pair[v * 2] = BAND; pair[v * 2 + 1] = COLLAR; S[v] = Math.min(dR[v] - from, to - dR[v]); field[v] = 9; if (S[v] > 0) bandPts++; }
  for (let v = 0; v < V; v++) if (!near.has(v)) dR[v] = 9;
}
// (No stray patches of the final colours either: a patch of fewer than `island` points of one colour, on its layer,
// takes the colour round it, plain.)
{
  const fk = Int16Array.from({ length: V }, (_, v) => (S[v] >= 0 ? pair[v * 2] : pair[v * 2 + 1])), was = Int16Array.from(fk);
  const isl3 = islands(fk, settings.island ?? 60);
  for (let v = 0; v < V; v++) if (fk[v] !== was[v]) { pair[v * 2] = pair[v * 2 + 1] = fk[v]; S[v] = 0.01; field[v] = -1; }
  report.push(`colour patches taken in: ${isl3} points`);
}
// ---- 5. Stitch lines (`stitches`, RUGBYJ 2026-11-18, the user: as the client's pictures 592 / 600 / 601): thin lines on the
// outside cloth at an even distance from an edge, each smoothed along its length (`sigma`); main.js draws them as thin
// strips laid on the cloth, a little darker than the cloth under them (the model's shape unchanged):
//   collarFoot  below the collar's foot line, on the body and sleeves (the neck seam)
//   collarTop   below the collar's top fold, on its outside (its edge stitching)
//   cuff, hem   above each sleeve's opening fold and the body's bottom fold, round it
const stitches = [];
if (settings.stitches) {
  const T2 = settings.stitches, sg2 = T2.sigma ?? 0.02;
  const iso = (f, level, region, what) => {
    const w = Float32Array.from({ length: V }, (_, v) => 0.5 + (f[v] - level));
    for (const L of linesOf(w, sg2, region)) {
      if (L.len < (T2.minLen ?? 60)) continue;
      // (only on the outside face: the line's cloth facing away from the middle of its own ring (round the neck, a sleeve,
      // the body), never the turned-in face under it)
      const cen = L.C.reduce((acc, p) => acc.map((x, i) => x + p[i] / L.C.length), [0, 0, 0]);
      const outward = L.C.reduce((acc, p, i) => acc + dot(L.normal[i], nrm(sub(p, cen))), 0) / L.C.length;
      if (process.env.DBG) console.log('DBG', what, L.len, L.closed, outward.toFixed(2));
      if (outward < (process.env.KEEPALL ? -9 : 0.2)) continue; stitches.push({ what, closed: L.closed, c: L.C.flatMap((p) => p.map((x) => +x.toFixed(5))), n: L.normal.flatMap((p) => p.map((x) => +x.toFixed(3))) }); report.push(`stitch ${what}: ${L.len} mm${L.closed ? ' closed' : ''}`); }
  };
  const colourOf = (v) => (S[v] >= 0 ? pair[v * 2] : pair[v * 2 + 1]);
  // (shortest ways over the outside cloth from seed points, metres)
  const geo = (seeds, region, max) => { const d = new Float32Array(V).fill(9), q = []; for (const v of seeds) { d[v] = 0; q.push(v); } while (q.length) { let bi = 0; for (let i = 1; i < q.length; i++) if (d[q[i]] < d[q[bi]]) bi = i; const v = q[bi]; q[bi] = q[q.length - 1]; q.pop(); if (d[v] > max) continue; for (const u of A.nb[v]) { if (!region(u)) continue; const nd = d[v] + Math.hypot(...sub(P3(u), P3(v))); if (nd < d[u] - 1e-9) { d[u] = nd; q.push(u); } } } return d; };
  if (T2.collarFoot) iso(Float32Array.from({ length: V }, (_, v) => -dC[v]), T2.collarFoot, (v) => outside[v] && dC[v] < 0.005, 'collar foot');
  if (T2.collarTop && collarTop) { const f = Float32Array.from({ length: V }, (_, v) => collarTop.topAt(v) - A.P[v * 3 + 1]); iso(f, T2.collarTop, (v) => collarTop.isC(v) && !collarTop.inward(v), 'collar top'); }
  // (an opening's fold: where the cloth turns over (two triangles side by side facing nearly opposite ways); per opening the
  // largest such run)
  const folded = new Uint8Array(V);
  // (a point whose triangles round it include two facing nearly opposite ways)
  for (let v = 0; v < V; v++) { const ts = vt[v]; let mn = 1; for (let a2 = 0; a2 < ts.length; a2++) for (let b2 = a2 + 1; b2 < ts.length; b2++) { const x = ts[a2] * 3, y = ts[b2] * 3; mn = Math.min(mn, A.FN[x] * A.FN[y] + A.FN[x + 1] * A.FN[y + 1] + A.FN[x + 2] * A.FN[y + 2]); } if (mn < (T2.fold ?? -0.3)) folded[v] = 1; }
  const foldOf = (ok) => { const seeds = new Set(); for (let v = 0; v < V; v++) if (folded[v] && ok(v)) seeds.add(v); if (process.env.DBG) console.log('DBG seeds', seeds.size); const seen = new Set(); let best = []; for (const s0 of seeds) { if (seen.has(s0)) continue; const comp = [s0]; seen.add(s0); for (let i = 0; i < comp.length; i++) for (const u of A.nb[comp[i]]) for (const x of [u, ...A.nb[u]]) if (seeds.has(x) && !seen.has(x)) { seen.add(x); comp.push(x); } if (comp.length > best.length) best = comp; } return best; };
  // (an opening's edge all round: along the opening's axis, the cloth's furthest reach per 5 degrees round it, smoothed
  // round; each point's depth back from it. The line is the depth `cuff` / `hem` on the outside face.)
  const endDepth = (pts, origin, axis) => {
    const ref = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], e1 = nrm(cross(axis, ref)), e2 = cross(axis, e1), NB = 72;
    const ang = (v) => { const d = sub(P3(v), origin); return Math.atan2(dot(d, e2), dot(d, e1)); }, bin = (v) => Math.min(NB - 1, Math.floor(((ang(v) + Math.PI) / (2 * Math.PI)) * NB)), along = (v) => dot(sub(P3(v), origin), axis);
    const end = new Float32Array(NB).fill(-9); for (const v of pts) end[bin(v)] = Math.max(end[bin(v)], along(v));
    for (let k = 0; k < NB; k++) if (end[k] < -1) { let j2 = 1; while (end[(k + j2) % NB] < -1 && end[(k - j2 + NB) % NB] < -1 && j2 < NB) j2++; end[k] = Math.max(end[(k + j2) % NB], end[(k - j2 + NB) % NB]); }
    const endS = end.map((_, k) => { let s2 = 0, ws = 0; for (let o = -3; o <= 3; o++) { const w2 = Math.exp(-0.5 * (o / 1.5) ** 2); s2 += end[(k + o + NB) % NB] * w2; ws += w2; } return s2 / ws; });
    return Float32Array.from({ length: V }, (_, v) => { const f2 = ((ang(v) + Math.PI) / (2 * Math.PI)) * NB - 0.5, k0 = Math.floor(f2), t2 = f2 - k0; return endS[((k0 % NB) + NB) % NB] * (1 - t2) + endS[(((k0 + 1) % NB) + NB) % NB] * t2 - along(v); });
  };
  // (an even cuff (evenCuffs): its stitch line at depth `cuff` from the opening's fold, round the whole sleeve on its own
  // cloth, the same measure as its band)
  if (T2.cuff && settings.evenCuffs) for (const k of SLEEVES) {
    // (of the rings at that depth (its outside face; a turned-in lining reached at the opening) the one furthest from the
    // sleeve's axis, its normals turned away from the axis)
    const E = evenRings.get(k), radial = (p) => { const d = sub(p, E.c0), t = dot(d, E.ax); return d.map((x, i) => x - E.ax[i] * t); };
    const Ls = linesOf(Float32Array.from({ length: V }, (_, v) => 0.5 + ((E.onSleeve(v) ? E.depth(v) : 9) - T2.cuff)), sg2, (v) => E.onSleeve(v)).filter((L) => L.len >= (T2.minLen ?? 60));
    const mr = (L) => L.C.reduce((acc, p) => acc + Math.hypot(...radial(p)), 0) / L.C.length, L = Ls.sort((a2, b2) => mr(b2) - mr(a2))[0];
    if (!L) continue;
    const n2 = L.C.map((p, i) => { const r = nrm(radial(p)); return dot(L.normal[i], r) < 0 ? L.normal[i].map((x) => -x) : L.normal[i]; });
    stitches.push({ what: `cuff ${keys[k - 1]}`, closed: L.closed, c: L.C.flatMap((p) => p.map((x) => +x.toFixed(5))), n: n2.flatMap((p) => p.map((x) => +x.toFixed(3))) }); report.push(`stitch cuff ${keys[k - 1]}: ${L.len} mm${L.closed ? ' closed' : ''}`);
  }
  if (T2.cuff && !settings.evenCuffs) for (const k of SLEEVES) {
    const sp = []; for (let v = 0; v < V; v++) if (colourOf(v) === k) sp.push(v);
    let mx = 0; for (const v of sp) mx = Math.max(mx, Math.abs(A.P[v * 3]));
    const ends = sp.filter((v) => Math.abs(A.P[v * 3]) > mx - 0.04), cE = ends.reduce((a2, v) => a2.map((x, i) => x + A.P[v * 3 + i] / ends.length), [0, 0, 0]), cA = sp.reduce((a2, v) => a2.map((x, i) => x + A.P[v * 3 + i] / sp.length), [0, 0, 0]);
    // (the sleeve's outer face: its cloth facing away from the sleeve's middle line; its opening's fold: outer-face points
    // next to the lining, near the sleeve's end; the line: the shortest way over the outer face from that fold)
    const ax2 = nrm(sub(cE, cA)), radial = (v) => { const d = sub(P3(v), cA), t = dot(d, ax2); return nrm(d.map((x, i) => x - ax2[i] * t)); };
    const outer = new Uint8Array(V); for (const v of sp) outer[v] = dot(N3(v), radial(v)) > 0 ? 1 : 0;
    const endA = Math.max(...ends.map((v) => dot(sub(P3(v), cA), ax2)));
    const rim = sp.filter((v) => outer[v] && dot(sub(P3(v), cA), ax2) > endA - 0.07 && [...A.nb[v]].some((u) => colourOf(u) === k && !outer[u]));
    const reg = (v) => colourOf(v) === k && outer[v];
    iso(geo(rim, reg, T2.cuff + 0.03), T2.cuff, reg, `cuff ${keys[k - 1]}`);
  }
  if (T2.hem) {
    const yMin = Math.min(...Array.from({ length: V }, (_, v) => A.P[v * 3 + 1])), bp = []; for (let v = 0; v < V; v++) if (A.P[v * 3 + 1] < yMin + 0.1) bp.push(v);
    const c0 = bp.reduce((a2, v) => a2.map((x, i) => x + A.P[v * 3 + i] / bp.length), [0, 0, 0]);
    // (its outer face: cloth facing away from the body's upright middle line, so the line never runs on the hem's turned-up
    // inside where a ray from it gets out under the hem (QATEST -355: the back hem line under the cloth))
    const outerHem = (v) => A.PN[v * 3] * (A.P[v * 3] - c0[0]) + A.PN[v * 3 + 2] * (A.P[v * 3 + 2] - c0[2]) > 0;
    iso(endDepth(bp, c0, [0, -1, 0]), T2.hem, (v) => outerHem(v) && A.P[v * 3 + 1] < yMin + 0.1, 'hem');
  }
}
// ---- 6. The sleeves on the pattern as the made garment's sleeves (`sleeveMap`, RUGBYJ 2026-11-18, CLIENT598: a flat garment
// picture's or an AI picture's sleeve colours landed on the body's place of the pattern): each sleeve point's print place
// from how far it is from its raglan seam to its cuff (u) and how far round from the sleeve's top (v, front half or back
// half): u, v laid onto the made sleeve between its armhole edge and its cuff edge. Only the print places change.
let mapped = 0;
if (settings.sleeveMap) {
  const SM = settings.sleeveMap, [A0, B0] = SM.armhole, [C0, D0] = SM.cuff, lerp = (a2, b2, t) => [a2[0] + (b2[0] - a2[0]) * t, a2[1] + (b2[1] - a2[1]) * t];
  const colourOf = (v) => (S[v] >= 0 ? pair[v * 2] : pair[v * 2 + 1]);
  const geoAll = (seeds, region) => { const d = new Float32Array(V).fill(9), q = []; for (const v of seeds) { d[v] = 0; q.push(v); } while (q.length) { let bi = 0; for (let i = 1; i < q.length; i++) if (d[q[i]] < d[q[bi]]) bi = i; const v = q[bi]; q[bi] = q[q.length - 1]; q.pop(); for (const u of A.nb[v]) { if (!region(u)) continue; const nd = d[v] + Math.hypot(...sub(P3(u), P3(v))); if (nd < d[u] - 1e-9) { d[u] = nd; q.push(u); } } } return d; };
  const flat = new Int16Array(new Uint8Array(Buffer.from(D.flat, 'base64')).buffer), side = new Uint8Array(Buffer.from(D.side, 'base64')), U0 = D.flatUnit;
  const placeOf = new Map();
  for (const k of SLEEVES) {
    const sp = []; for (let v = 0; v < V; v++) if (colourOf(v) === k) sp.push(v);
    if (sp.length < 50) continue;
    let mx = 0; for (const v of sp) mx = Math.max(mx, Math.abs(A.P[v * 3]));
    const ends = sp.filter((v) => Math.abs(A.P[v * 3]) > mx - 0.04), cE = ends.reduce((a2, v) => a2.map((x, i) => x + A.P[v * 3 + i] / ends.length), [0, 0, 0]), cA = sp.reduce((a2, v) => a2.map((x, i) => x + A.P[v * 3 + i] / sp.length), [0, 0, 0]);
    const ax2 = nrm(sub(cE, cA)), radialOf = (v) => { const d = sub(P3(v), cA), t = dot(d, ax2); return d.map((x, i) => x - ax2[i] * t); };
    const inK = new Uint8Array(V); for (const v of sp) inK[v] = 1;
    const outer = (v) => inK[v] && dot(N3(v), nrm(radialOf(v))) > 0;
    const endA = Math.max(...ends.map((v) => dot(sub(P3(v), cA), ax2)));
    const seam = sp.filter((v) => outer(v) && [...A.nb[v]].some((u) => !inK[u]));
    const rim = sp.filter((v) => outer(v) && dot(sub(P3(v), cA), ax2) > endA - 0.07 && [...A.nb[v]].some((u) => inK[u] && !outer(u)));
    const gS = geoAll(seam, outer), gC = geoAll(rim, outer);
    // (up and front round the sleeve: the world's up and front, square to the sleeve's line)
    const sq = (w) => nrm(w.map((x, i) => x - ax2[i] * dot(w, ax2))), eUp = sq([0, 1, 0]), eF = sq([0, 0, 1]);
    const outs = sp.filter(outer), PG2 = 0.012, g2 = new Map(); for (const v of outs) { const kk = P3(v).map((x) => Math.floor(x / PG2)).join(','); (g2.get(kk) ?? g2.set(kk, []).get(kk)).push(v); }
    const nearOuter = (v) => { const c = P3(v).map((x) => Math.floor(x / PG2)); let best = -1, bd = 9; for (let a2 = -2; a2 <= 2; a2++) for (let b2 = -2; b2 <= 2; b2++) for (let c2 = -2; c2 <= 2; c2++) for (const u of g2.get(`${c[0] + a2},${c[1] + b2},${c[2] + c2}`) ?? []) { const d = Math.hypot(...sub(P3(u), P3(v))); if (d < bd) { bd = d; best = u; } } return best; };
    for (const v of sp) {
      // (a point no way from its seam and cuff reaches over the outer face (up by the neck): at the seam's end of the sleeve)
      const o = outer(v) ? v : nearOuter(v), ok = o >= 0 && gS[o] < 8 && gC[o] < 8;
      const u = ok ? Math.max(0, Math.min(1, gS[o] / (gS[o] + gC[o] || 1))) : 0, r = radialOf(v), th = Math.atan2(dot(r, eF), dot(r, eUp)), vv = Math.min(1, Math.abs(th) / Math.PI);
      // (a little inside the made sleeve's edges, so a picture's sleeve colour is taken, never its outline or background)
      const [px, py] = lerp(lerp(A0, C0, 0.04 + 0.92 * u), lerp(B0, D0, 0.04 + 0.92 * u), (SM.inset ?? 0.07) + (1 - 2 * (SM.inset ?? 0.07)) * vv);
      placeOf.set(v, [Math.sign(A.P[v * 3]) * px, py, th >= 0 ? 0 : 1]);
    }
  }
  for (let i = 0; i < m.n; i++) { const pl = placeOf.get(A.weld[i]); if (!pl) continue; flat[i * 2] = Math.round(pl[0] / U0); flat[i * 2 + 1] = Math.round(pl[1] / U0); side[i] = (side[i] & ~1) | pl[2]; mapped++; }
  D.flat = Buffer.from(flat.buffer).toString('base64'); D.side = Buffer.from(side).toString('base64');
}
report.push(`sleeve points laid on the made sleeves: ${mapped}`);
report.push(`outside ${outside.reduce((a, b) => a + b, 0)} / ${V}; inside points facing outside cloth ${[...facing].filter((x) => x >= 0).length} (key changed ${lined}); islands ${isl1}+${isl2}; band points ${bandPts}; no part near ${far}`);

// ---- Data: per point its pair and distance; triangles whose corners have different pairs: one line for all three
// corners (the one nearest a corner), each corner's distance from it.
const n = m.n, q = (s) => Math.max(1, Math.min(255, Math.round(128 + (s * 1000) / 0.4))), out = new Uint8Array(n * 3);
for (let i = 0; i < n; i++) { const v = A.weld[i], a = pair[v * 2], b = pair[v * 2 + 1]; out[i * 3] = a; out[i * 3 + 1] = b; out[i * 3 + 2] = q(a === b ? 0.01 : S[v]); }
const valueIn = (v, f) => {
  // (a corner's own distance from field f's line, and which piece lies below the collar there)
  const src = outside[v] ? v : facing[v] >= 0 ? facing[v] : v;
  // (an even band's own measure (evenCuffs / evenCollar): its width less the depth from its opening)
  if (f >= 100) { const E = evenList[f - 100][1]; return E.W - E.depth(v); }
  if (f === 9) return dR[v] < 9 ? Math.min(dR[v] - settings.band.from, settings.band.to - dR[v]) : -0.01;
  if (f === 0) return dC[src];
  return dS[f - 1][src];
};
const tris = []; let mixed = 0;
for (let t = 0; t < A.T; t++) {
  const c = [A.F[t * 3], A.F[t * 3 + 1], A.F[t * 3 + 2]];
  if (c.every((v) => pair[v * 2] === pair[c[0] * 2] && pair[v * 2 + 1] === pair[c[0] * 2 + 1])) continue;
  mixed++;
  const live = c.filter((v) => field[v] >= 0 && pair[v * 2] !== pair[v * 2 + 1]);
  if (!live.length) { const k = pair[c[0] * 2]; tris.push(t & 255, (t >> 8) & 255, (t >> 16) & 255, k, k, q(0.01), q(0.01), q(0.01)); continue; }
  // (the line passing nearest the triangle's middle: its corners' mean distance from each line (collar, band, sleeves))
  const v0 = live.reduce((a, v) => (Math.abs(S[v]) < Math.abs(S[a]) ? v : a));
  const fs2 = [...new Set(live.map((v) => field[v]))], mean = (f2) => Math.abs(c.reduce((acc, v) => acc + valueIn(v, f2), 0) / 3);
  const f = fs2.length > 1 ? fs2.reduce((x, y) => (mean(y) < mean(x) ? y : x)) : field[v0];
  const vf = live.find((v) => field[v] === f) ?? v0; let a = pair[vf * 2], b = pair[vf * 2 + 1];
  if (f === 0) { const lows = c.map((v) => { const [k, ds] = sleeveAt(outside[v] ? v : facing[v] >= 0 ? facing[v] : v); return ds > 0 ? SLEEVES[k] : 0; }); b = lows.sort((x, y) => lows.filter((z) => z === y).length - lows.filter((z) => z === x).length)[0]; }
  tris.push(t & 255, (t >> 8) & 255, (t >> 16) & 255, a, b, ...c.map((v) => q(valueIn(v, f))));
}
// ---- No specks: a patch of fewer than `speck` triangles of one colour inside another takes that colour.
{
  const own = new Map(); for (let j = 0; j < tris.length; j += 8) own.set(tris[j] | (tris[j + 1] << 8) | (tris[j + 2] << 16), j);
  const keyAt = (t) => { const j = own.get(t); if (j !== undefined) { const sv = (tris[j + 5] + tris[j + 6] + tris[j + 7]) / 3 - 128; return sv >= 0 ? tris[j + 3] : tris[j + 4]; } const v = A.F[t * 3]; return S[v] >= 0 ? pair[v * 2] : pair[v * 2 + 1]; };
  const tk = Int16Array.from({ length: A.T }, (_, t) => keyAt(t)), adjT = Array.from({ length: A.T }, () => []), em = new Map();
  for (let t = 0; t < A.T; t++) for (let k = 0; k < 3; k++) { const a2 = A.F[t * 3 + k], b2 = A.F[t * 3 + (k + 1) % 3], kk = a2 < b2 ? a2 * 1e6 + b2 : b2 * 1e6 + a2; const o = em.get(kk); if (o !== undefined) { adjT[t].push(o); adjT[o].push(t); } else em.set(kk, t); }
  const seen = new Uint8Array(A.T); let fixed = 0;
  for (let s0 = 0; s0 < A.T; s0++) {
    if (seen[s0]) continue;
    const comp = [s0]; seen[s0] = 1;
    for (let i = 0; i < comp.length; i++) for (const u of adjT[comp[i]]) if (!seen[u] && tk[u] === tk[s0]) { seen[u] = 1; comp.push(u); }
    if (comp.length >= (settings.speck ?? 3)) continue;
    const votes = new Map(); for (const t of comp) for (const u of adjT[t]) if (tk[u] !== tk[s0]) votes.set(tk[u], (votes.get(tk[u]) ?? 0) + 1);
    const to = [...votes].sort((x, y) => y[1] - x[1])[0]?.[0]; if (to === undefined) continue;
    for (const t of comp) { const j = own.get(t), row = [t & 255, (t >> 8) & 255, (t >> 16) & 255, to, to, q(0.01), q(0.01), q(0.01)]; if (j !== undefined) tris.splice(j, 8, ...row); else { own.set(t, tris.length); tris.push(...row); } fixed++; }
  }
  // (a colour only in one corner of a triangle, with none of it in the triangles round it: that triangle one colour)
  const shows = (t) => { const j = own.get(t); if (j === undefined) return new Set([0, 1, 2].map((k) => { const v = A.F[t * 3 + k]; return S[v] >= 0 ? pair[v * 2] : pair[v * 2 + 1]; })); const o = new Set(); for (const k of [5, 6, 7]) o.add(tris[j + k] >= 128 ? tris[j + 3] : tris[j + 4]); return o; };
  let corners = 0;
  for (const [t, j] of [...own]) {
    if (tris[j + 3] === tris[j + 4]) continue;
    const sv = (tris[j + 5] + tris[j + 6] + tris[j + 7]) / 3 - 128, mid = sv >= 0 ? tris[j + 3] : tris[j + 4], minor = sv >= 0 ? tris[j + 4] : tris[j + 3];
    if (adjT[t].some((u) => shows(u).has(minor))) continue;
    tris.splice(j, 8, t & 255, (t >> 8) & 255, (t >> 16) & 255, mid, mid, q(0.01), q(0.01), q(0.01)); corners++;
  }
  // (the band only where it is: a triangle showing the band anywhere further than 3 mm from the band's own depth below
  // the collar's top (a sliver along a fold, a dash under the band, QATEST -353) is the colour round it)
  let stray = 0;
  if (collarTop && BAND > 0) for (const [t, j] of [...own]) {
    if (tris[j + 3] !== BAND && tris[j + 4] !== BAND) continue;
    const c = [0, 1, 2].map((k) => A.F[t * 3 + k]), dep = c.map((v) => collarTop.topAt(v) - A.P[v * 3 + 1]), sv = [5, 6, 7].map((k) => tris[j + k] - 128);
    let bad = false;
    for (let u = 0; u <= 4 && !bad; u++) for (let w2 = 0; u + w2 <= 4; w2++) { const b0 = [1 - (u + w2) / 4, u / 4, w2 / 4], val = b0.reduce((acc, x, i) => acc + x * sv[i], 0), d = b0.reduce((acc, x, i) => acc + x * dep[i], 0); const shows = val >= 0 ? tris[j + 3] : tris[j + 4]; if (shows === BAND && (d < settings.band.from - 0.003 || d > settings.band.to + 0.003)) { bad = true; break; } }
    if (!bad) continue;
    const other = tris[j + 3] === BAND ? tris[j + 4] : tris[j + 3];
    tris.splice(j, 8, t & 255, (t >> 8) & 255, (t >> 16) & 255, other, other, q(0.01), q(0.01), q(0.01)); stray++;
  }
  // (inside the collar no sleeve colour: a triangle of the collar's inside face (facing the neck's middle, down to the
  // collar's foot) showing a sleeve's colour is the collar's)
  let inSleeve = 0;
  if (collarTop) for (let t = 0; t < A.T; t++) {
    const c = [0, 1, 2].map((k) => A.F[t * 3 + k]);
    if (!c.every((v) => collarTop.inward(v) && collarTop.topAt(v) - A.P[v * 3 + 1] < (settings.collarDepth ?? 0.06) && collarTop.topAt(v) - A.P[v * 3 + 1] > -0.002)) continue;
    const j = own.get(t), showsK = j !== undefined ? [tris[j + 3], tris[j + 4]] : c.map((v) => (S[v] >= 0 ? pair[v * 2] : pair[v * 2 + 1]));
    if (!showsK.some((k) => SLEEVES.includes(k))) continue;
    const keep = showsK.filter((k) => !SLEEVES.includes(k)), to = keep.length ? keep[0] : COLLAR, row = [t & 255, (t >> 8) & 255, (t >> 16) & 255, to, to, q(0.01), q(0.01), q(0.01)];
    if (j !== undefined) tris.splice(j, 8, ...row); else { own.set(t, tris.length); tris.push(...row); }
    inSleeve++;
  }
  report.push(`triangles by two pieces ${mixed}; specks ${fixed}; lone corners ${corners}; stray band bits ${stray}; sleeve colour inside the collar ${inSleeve}`);
  if (process.env.DBG2 && collarTop) for (let t = 0; t < A.T; t++) { const c = [0, 1, 2].map((k) => A.F[t * 3 + k]); if (!c.some((v) => collarTop.inward(v)) || c.some((v) => A.P[v * 3 + 1] < 0.62)) continue; const j = own.get(t), ks = j !== undefined ? [5, 6, 7].map((k) => (tris[j + k] >= 128 ? tris[j + 3] : tris[j + 4])) : c.map((v) => (S[v] >= 0 ? pair[v * 2] : pair[v * 2 + 1])); if (!ks.some((k) => SLEEVES.includes(k) || k === BAND)) continue; const mid = [0, 1, 2].map((a2) => c.reduce((acc, v) => acc + A.P[v * 3 + a2], 0) / 3); if (ks.includes(BAND) && c.every((v) => collarTop.topAt(v) - A.P[v * 3 + 1] < 0.02)) continue; console.log('DBG2', t, mid.map((x) => x.toFixed(3)).join(' '), ks.join(','), c.map((v) => (collarTop.topAt(v) - A.P[v * 3 + 1]).toFixed(3)).join('/'), c.map((v) => collarTop.inward(v) ? 'in' : 'out').join('/')); }
}
D.stitches = stitches.length ? stitches : undefined; if (!stitches.length) delete D.stitches;
// (`data`: fields copied into the data as they are, e.g. { insideCloth: true } (main.js: the cloth's inside drawn as cloth,
// no form arms, the edge light only at the outline); MODELQ5 2026-11-18)
if (settings.data) Object.assign(D, settings.data);
D.partKeys = keys; D.piece = Buffer.from(out).toString('base64'); D.pieceTri = Buffer.from(Uint8Array.from(tris)).toString('base64');
if (settings.data) Object.assign(D, settings.data);
fs.writeFileSync(path.join(here, `tripo-${name}.js`), `window.TRIPO_MESHES=window.TRIPO_MESHES||{};window.TRIPO_MESHES[${JSON.stringify(name)}]=${JSON.stringify(D)};\n`);
say(`keys ${keys.join(', ')}`); for (const r of report) say(r);
