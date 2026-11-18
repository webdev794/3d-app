// A ready-made model split into the pieces between its own lines (MODELQ4 2026-11-17, the user: every colour border sits
// on one of the model's own lines, bands one even width with smooth edges). Run from website/ AFTER its converter and
// tripo-parts.mjs (it reads and rewrites viewer/tripo-<name>.js):
//
//   node viewer/tripo-pieces.mjs <name>
//
// Settings: viewer/parts/<name>.json `pieces`: { bands: the key of the band pieces (the pieces all along an opening:
// neck, armholes), e.g. "collar"; the other pieces show the print }. Which pieces take a colour of their own comes from
// the model's reference picture (its booklet card): a piece in the body's colour there shows the print.
// How: the model's own seam tapes and band rings (its separate pieces lying in the cloth) are its lines; each line is the
// tape's visible lip, smoothed; the cloth is cut along them (edges crossing a line) into pieces (pieces/lines.mjs). Per
// data point: the pieces on the two sides of its nearest line (0 the print, k = partKeys[k-1]) and its signed distance from
// that line; a triangle whose corners lie by different lines gets its own corners (data `pieceTri`). tripomesh.js turns
// these into the `piece` attribute; main.js colours each piece up to the smooth line (addRelief, pieced). The per-triangle
// parts (triPart) are all set to cloth: the pieces colour everything. The model's shape is never changed.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { colourLines } from './pieces/lines.mjs';
import { closestOnTri } from './pieces/pieces.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
const settings = JSON.parse(fs.readFileSync(path.join(here, 'parts', `${name}.json`), 'utf8')).pieces;
if (!name || !settings) { console.error('usage: node viewer/tripo-pieces.mjs <name>   (viewer/parts/<name>.json needs `pieces`)'); process.exit(1); }
// (A model that is one closed piece (MODELQ2 2026-11-17, parts file `pieces.fromParts`): its lines are the borders of its own
// parts per triangle (tripo-parts.mjs, found from its geometry: a gathered waistband, a high band, cuffs), drawn onto its own
// creases within `snap` (lines.mjs extraLines); each piece then takes the key of most of its triangles' parts. Off unless the
// parts file asks for it.)
const triPartIn = (() => { if (!settings.fromParts) return null; const c = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(here, `tripo-${name}.js`), 'utf8'), c); const d = c.window.TRIPO_MESHES[name]; return d.triPart ? new Uint8Array(Buffer.from(d.triPart, 'base64')) : null; })();
const partBorders = (S0) => {
  // (The borders between parts, as edges of the welded model; each connected run of them (a waistband's foot, a cuff's
  // seam) one line: seen along its best-fit plane's normal, a run that goes all the way round (a ring) is its points'
  // middle per 3 degrees round its centre; an open run its points' middle per 3 mm along its main direction. So a border
  // that zig-zags over the triangles becomes one even line through them; lines.mjs then draws it onto the crease.)
  const { A: A0 } = S0, E = new Map(), adj = new Map();
  for (let t2 = 0; t2 < A0.T; t2++) for (let k = 0; k < 3; k++) { const a = A0.F[t2 * 3 + k], b = A0.F[t2 * 3 + (k + 1) % 3], key = a < b ? a * 1e6 + b : b * 1e6 + a; (E.get(key) ?? E.set(key, []).get(key)).push(t2); }
  for (const [key, ts] of E) if (ts.length === 2 && triPartIn[ts[0]] !== triPartIn[ts[1]]) { const a = Math.floor(key / 1e6), b = key % 1e6; (adj.get(a) ?? adj.set(a, []).get(a)).push(b); (adj.get(b) ?? adj.set(b, []).get(b)).push(a); }
  const seen = new Set(), out = [], Pv = (v) => [A0.P[v * 3], A0.P[v * 3 + 1], A0.P[v * 3 + 2]];
  for (const s0 of adj.keys()) {
    if (seen.has(s0)) continue;
    const run = [s0]; seen.add(s0);
    for (let k = 0; k < run.length; k++) for (const u of adj.get(run[k])) if (!seen.has(u)) { seen.add(u); run.push(u); }
    if (run.length < 8) continue;
    const pts = run.map(Pv), c = pts.reduce((s2, p) => s2.map((x, i) => x + p[i] / pts.length), [0, 0, 0]);
    const Cv = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of pts) { const d = p.map((x, i) => x - c[i]); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Cv[i][j] += d[i] * d[j]; }
    const eig = (M, small) => { const tr = M[0][0] + M[1][1] + M[2][2]; let v = [0.31, 0.53, 0.79]; for (let it = 0; it < 300; it++) { const m = [0, 1, 2].map((i) => (small ? tr * v[i] : 0) + (small ? -1 : 1) * (M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2])), l = Math.hypot(...m) || 1; v = m.map((x) => x / l); } return v; };
    const nrm = eig(Cv, true), big = eig(Cv, false), ref = Math.abs(nrm[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], un = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
    const b1 = un(cr(nrm, ref)), b2 = cr(nrm, b1), ang = pts.map((p) => { const d = p.map((x, i) => x - c[i]); return Math.atan2(d[0] * b2[0] + d[1] * b2[1] + d[2] * b2[2], d[0] * b1[0] + d[1] * b1[1] + d[2] * b1[2]); });
    // (a ring: no gap round it wider than 35 degrees)
    const sa = [...ang].sort((x, y) => x - y); let gap = sa[0] + 2 * Math.PI - sa.at(-1); for (let i = 1; i < sa.length; i++) gap = Math.max(gap, sa[i] - sa[i - 1]);
    const NB = Math.max(24, Math.min(120, Math.round(pts.length / 2))), bins = Array.from({ length: NB }, () => [0, 0, 0, 0]);
    pts.forEach((p, i) => { const b = Math.min(NB - 1, Math.floor(((ang[i] + Math.PI) / (2 * Math.PI)) * NB)); bins[b][0] += p[0]; bins[b][1] += p[1]; bins[b][2] += p[2]; bins[b][3]++; });
    let C, closed;
    if (gap < (35 * Math.PI) / 180) { C = bins.filter((b) => b[3]).map((b) => [b[0] / b[3], b[1] / b[3], b[2] / b[3]]); closed = true; }
    else {
      const along = pts.map((p) => (p[0] - c[0]) * big[0] + (p[1] - c[1]) * big[1] + (p[2] - c[2]) * big[2]), lo2 = Math.min(...along), m = new Map();
      pts.forEach((p, i) => { const b = Math.floor((along[i] - lo2) / 0.003), e = m.get(b) ?? m.set(b, [0, 0, 0, 0]).get(b); e[0] += p[0]; e[1] += p[1]; e[2] += p[2]; e[3]++; });
      C = [...m.keys()].sort((x, y) => x - y).map((b) => { const e = m.get(b); return [e[0] / e[3], e[1] / e[3], e[2] / e[3]]; }); closed = false;
    }
    if (C.length >= 6) out.push({ C, closed, snap: settings.snap ?? 0.006, sigma: settings.sigma ?? 2 });
  }
  return out;
};
// (`pieces.lines`: lines given as rough paths along the model's expected seams, [{ C: [[x, y, z], ...] (the data's metres),
// closed, snap, sigma, snapSigma }], drawn onto its creases the same way.)
const extra = (S0) => [...(triPartIn ? partBorders(S0) : []), ...(settings.lines ?? [])];
const S = colourLines(name, { slot: () => 'piece', ...settings, ...(triPartIn || settings.lines ? { extraLines: extra } : {}) }), { A } = S;
const P = (v) => [A.P[v * 3], A.P[v * 3 + 1], A.P[v * 3 + 2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const D3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// The band pieces: nearly all their points within 4.5 cm of one of the cloth's openings.
const openPts = S.openings.flat(), regKey = {};
for (let r = 0; r < S.nr && !triPartIn; r++) {
  let n = 0, near = 0;
  for (const v of S.bodyPts) { if (S.reg[v] !== r) continue; n++; const p = P(v); if (openPts.some((q) => D3(p, q) < 0.045)) near++; }
  if (n >= (settings.minRegion ?? 25) && near / n > 0.9 && settings.bands) regKey[r] = settings.bands;
}
const file = path.join(here, `tripo-${name}.js`), ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx);
const D = ctx.window.TRIPO_MESHES[name], keys = [...(D.partKeys ?? [])];
// (fromParts: each piece, the cloth's and the model's own separate pieces (S.ownReg), takes the key of most of its triangles'
// parts; a piece mostly cloth shows the print.)
if (triPartIn) {
  const votes = new Map(), regOf = (v) => (S.ownReg[v] >= 0 ? S.ownReg[v] : S.reg[v]);
  for (let t = 0; t < A.T; t++) { const r = regOf(A.F[t * 3]); if (r < 0 || regOf(A.F[t * 3 + 1]) !== r || regOf(A.F[t * 3 + 2]) !== r) continue; const m = votes.get(r) ?? votes.set(r, new Map()).get(r); m.set(triPartIn[t], (m.get(triPartIn[t]) ?? 0) + 1); }
  for (const [r, m] of votes) { const [p, c] = [...m].sort((x, y) => y[1] - x[1])[0], all = [...m.values()].reduce((s2, x) => s2 + x, 0); if (p > 0 && c > all / 2 && D.partKeys?.[p - 1]) regKey[r] = D.partKeys[p - 1]; }
}
// (`pieces.seeds`: [{ at: [x, y, z], key }]: the piece holding the model point nearest `at` (the cloth's, or one of the model's own
// separate pieces) takes `key`, over the tests above.)
for (const sd of settings.seeds ?? []) {
  let best = -1, bd = Infinity;
  for (const v of S.allPts) { const d2 = D3(P(v), sd.at); if (d2 < bd) { bd = d2; best = v; } }
  if (best >= 0) regKey[S.ownReg[best] >= 0 ? S.ownReg[best] : S.reg[best]] = sd.key;
}
const idxOf = (r) => { const k = regKey[r] ?? null; if (k == null) return 0; let i = keys.indexOf(k); if (i < 0) { keys.push(k); i = keys.length - 1; } return i + 1; };
const q = (s) => Math.max(1, Math.min(255, Math.round(128 + (s * 1000) / 0.4)));
const n = D.count, out = new Uint8Array(n * 3);
for (let i = 0; i < n; i++) {
  const w = A.weld[i]; let a = S.LA[w], b = S.LB[w], s = S.LS[w];
  if (a < 0) { a = b = 0; s = 1; }
  out[i * 3] = idxOf(a); out[i * 3 + 1] = idxOf(b); out[i * 3 + 2] = q(s);
}
// Triangles whose corners lie by different lines: every corner the same two pieces and its own distance from the one
// line between them nearest the triangle.
const ownOf = (w) => (S.LA[w] === S.LB[w] ? S.LA[w] : S.LS[w] >= 0 ? S.LA[w] : S.LB[w]);
const lineDist = (p, r1, r2) => {
  let best = null;
  for (const L of S.lines) {
    const m = L.closed ? L.C.length : L.C.length - 1;
    for (let i = 0; i < m; i++) {
      const [rp, rm] = L.rs[i]; if (!((rp === r1 && rm === r2) || (rp === r2 && rm === r1))) continue;
      const a0 = L.C[i], b0 = L.C[(i + 1) % L.C.length], ab = sub(b0, a0), f = Math.max(0, Math.min(1, dot(sub(p, a0), ab) / (dot(ab, ab) || 1e-12))), c = a0.map((x, k) => x + ab[k] * f), d = D3(p, c);
      if (best && d >= best.d) continue;
      const s = dot(sub(p, c), L.side[i]); best = { d, s: rp === r1 ? s : -s };
    }
  }
  return best;
};
const raw = Buffer.from(D.idx, 'base64'), IDX = n > 65535 ? new Uint32Array(new Uint8Array(raw).buffer) : new Uint16Array(new Uint8Array(raw).buffer);
const tris = []; let mixed = 0;
for (let t = 0; t < IDX.length / 3; t++) {
  const c = [0, 1, 2].map((k) => IDX[t * 3 + k]);
  if (c.every((i) => out[i * 3] === out[c[0] * 3] && out[i * 3 + 1] === out[c[0] * 3 + 1])) continue;
  mixed++;
  const w = c.map((i) => A.weld[i]), regs = [...new Set(w.map(ownOf))].filter((r) => r >= 0), mid = w.map(P).reduce((s, p) => s.map((x, k) => x + p[k] / 3), [0, 0, 0]);
  // (where a band meets another line, the band's own line wins near it: the band ends on its ring, never runs down a seam)
  let pick = null;
  for (let i = 0; i < regs.length; i++) for (let j = i + 1; j < regs.length; j++) {
    const L = lineDist(mid, regs[i], regs[j]); if (!L) continue;
    const band = regKey[regs[i]] !== undefined || regKey[regs[j]] !== undefined, d = band && L.d < 0.012 ? L.d - 1 : L.d;
    if (!pick || d < pick.d) pick = { d, r1: regs[i], r2: regs[j] };
  }
  if (pick && pick.d < 0) pick.d += 1;
  let a, b, sv;
  if (!pick || pick.d > 0.06) { a = b = idxOf(regs[0] ?? 0); sv = [0.01, 0.01, 0.01]; }
  else { a = idxOf(pick.r1); b = idxOf(pick.r2); sv = w.map((x) => lineDist(P(x), pick.r1, pick.r2)?.s ?? 0.01); }
  tris.push(t & 255, (t >> 8) & 255, (t >> 16) & 255, a, b, ...sv.map(q));
}
// The per-triangle parts: all cloth, but for the model's lips: its seam tapes and band rings (the pieces lying in the
// cloth, whose edges show) and any cloth triangle wound inward. Those are 'lip': printed on both faces (main.js), so a
// lip turned inward shows the print and the piece's colour there, never the inside's plain colour as a thin stray line.
{
  const zc = (S.lo[2] + S.hi[2]) / 2, yc = (S.lo[1] + S.hi[1]) / 2, body = new Set(S.comps[0].tris);
  let lipKey = keys.indexOf('lip'); if (lipKey < 0) { keys.push('lip'); lipKey = keys.length - 1; }
  // (Which way a cloth triangle faces: a ray from it along its normal and one against it; the side whose ray gets out of the
  // garment without meeting any of its triangles is the open air. Where both or neither get out: from the garment's middle.)
  const G = 0.02, gkey = (x, y, z) => `${x},${y},${z}`, tgrid = new Map(), PP = A.P, FF = A.F;
  for (let t = 0; t < A.T; t++) {
    const mn = [9, 9, 9], mx = [-9, -9, -9];
    for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) { const v = PP[FF[t * 3 + k] * 3 + a]; mn[a] = Math.min(mn[a], v); mx[a] = Math.max(mx[a], v); }
    for (let x = Math.floor(mn[0] / G); x <= Math.floor(mx[0] / G); x++) for (let y = Math.floor(mn[1] / G); y <= Math.floor(mx[1] / G); y++) for (let z = Math.floor(mn[2] / G); z <= Math.floor(mx[2] / G); z++) { const k = gkey(x, y, z); (tgrid.get(k) ?? tgrid.set(k, []).get(k)).push(t); }
  }
  const meets = (o, d, skip) => {
    const seen = new Set();
    for (let s = 0; s < 0.6; s += G * 0.5) {
      const p = [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
      if (p.some((v, a) => v < S.lo[a] - 0.02 || v > S.hi[a] + 0.02)) return false;
      for (const t of tgrid.get(gkey(Math.floor(p[0] / G), Math.floor(p[1] / G), Math.floor(p[2] / G))) ?? []) {
        if (t === skip || seen.has(t)) continue; seen.add(t);
        const a = FF[t * 3] * 3, b = FF[t * 3 + 1] * 3, c = FF[t * 3 + 2] * 3, e1 = [PP[b] - PP[a], PP[b + 1] - PP[a + 1], PP[b + 2] - PP[a + 2]], e2 = [PP[c] - PP[a], PP[c + 1] - PP[a + 1], PP[c + 2] - PP[a + 2]];
        const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = dot(e1, pv);
        if (Math.abs(det) < 1e-12) continue;
        const tv = [o[0] - PP[a], o[1] - PP[a + 1], o[2] - PP[a + 2]], u = dot(tv, pv) / det; if (u < 0 || u > 1) continue;
        const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = dot(d, qv) / det; if (v < 0 || u + v > 1) continue;
        if (dot(e2, qv) / det > 1e-4) return true;
      }
    }
    return false;
  };
  // (Cloth right at a line (its seam folds into the tape there, and its fold's underside can face out): printed on both faces.)
  const LG = 0.02, lgrid = new Map(), lk = (p) => p.map((c) => Math.floor(c / LG)).join(',');
  for (const L of S.lines) for (const q of L.C) { const k = lk(q); (lgrid.get(k) ?? lgrid.set(k, []).get(k)).push(q); }
  const nearLine = (p, r) => { const [x, y, z] = p.map((c) => Math.floor(c / LG)); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const q of lgrid.get(`${x + a},${y + b},${z + c}`) ?? []) if (D3(p, q) < r) return true; return false; };
  // (Only bands make lips (MODELQ5): a big piece with a colour of its own (a side panel, a sleeve) is not a band.)
  const bandKey = (k) => k !== undefined && (k === settings.bands || k === 'collar' || k === 'waistband' || !!k?.startsWith?.('part:'));
  const tp = new Uint8Array(IDX.length / 3); let lips = 0;
  for (let t = 0; t < tp.length; t++) {
    // (and the bands' cloth: a binding wraps over the opening's edge, so its inside face is the band's colour too, and the
    // colour does not change at the rim)
    let lip = !body.has(t) || [0, 1, 2].some((k) => nearLine(P(A.F[t * 3 + k]), settings.seamLip ?? 0.01) || bandKey(regKey[ownOf(A.F[t * 3 + k])]));
    if (!lip) {
      const c = [0, 1, 2].map((k) => P(A.F[t * 3 + k])).reduce((a, p) => a.map((x, i) => x + p[i] / 3), [0, 0, 0]), n = [A.FN[t * 3], A.FN[t * 3 + 1], A.FN[t * 3 + 2]];
      const front = meets(c.map((x, i) => x + n[i] * 1e-4), n, t), back = meets(c.map((x, i) => x - n[i] * 1e-4), n.map((x) => -x), t);
      if (front !== back) lip = front && !back;
      else { const o = [c[0], (c[1] - yc) * 0.4, c[2] - zc], l = Math.hypot(...o) || 1; lip = dot(n, o) / l < 0; }
    }
    if (lip) { tp[t] = lipKey + 1; lips++; }
  }
  D.triPart = Buffer.from(tp).toString('base64');
  console.log(`[${name}] lips (both faces printed): ${lips} triangles`);
}
// The tapes' print places: each tape point printed from the cloth right over it (the nearest cloth triangle's own print
// places, at the point's place in it; its own front or back half kept, so its triangles stay on one half), so a tape's edge that shows carries exactly the print
// around it (a band, a pattern, a picture) and never a stray line of another colour. Only where the print is taken from
// changes; the model's points stay where they are.
{
  const flat = new Int16Array(new Uint8Array(Buffer.from(D.flat, 'base64')).buffer), side = new Uint8Array(Buffer.from(D.side, 'base64'));
  const body = S.comps[0].tris, G = 0.02, gk = (p) => p.map((c) => Math.floor(c / G)).join(','), grid = new Map();
  for (const t of body) { const c = [0, 1, 2].map((k) => P(A.F[t * 3 + k])).reduce((a, p) => a.map((x, i) => x + p[i] / 3), [0, 0, 0]); const k = gk(c); (grid.get(k) ?? grid.set(k, []).get(k)).push(t); }
  const bary = (p, a, b, c) => { const v0 = sub(b, a), v1 = sub(c, a), v2 = sub(p, a), d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1), den = d00 * d11 - d01 * d01 || 1e-18, v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den; return [1 - v - w, v, w]; };
  let moved = 0;
  for (let i = 0; i < n; i++) {
    const wv = A.weld[i]; if (S.bodyPts.has(wv)) continue;
    const p = P(wv), [x, y, z] = p.map((c) => Math.floor(c / G)); let best = null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const t of grid.get(`${x + a},${y + b},${z + c}`) ?? []) { const q = closestOnTri(p, P(A.F[t * 3]), P(A.F[t * 3 + 1]), P(A.F[t * 3 + 2])), d = D3(p, q); if (!best || d < best.d) best = { d, t, q }; }
    if (!best || best.d > 0.02) continue;
    const cs = [0, 1, 2].map((k) => IDX[best.t * 3 + k]), bw = bary(best.q, ...[0, 1, 2].map((k) => P(A.F[best.t * 3 + k]))).map((u) => Math.max(0, u)), sw = bw.reduce((a, u) => a + u, 0) || 1;
    for (const k of [0, 1]) flat[i * 2 + k] = Math.round(cs.reduce((acc, c, j) => acc + (bw[j] / sw) * flat[c * 2 + k], 0));
    moved++;
  }
  D.flat = Buffer.from(flat.buffer).toString('base64');
  console.log(`[${name}] tape points printed from the cloth over them: ${moved}`);
}
D.partKeys = keys; D.piece = Buffer.from(out).toString('base64'); D.pieceTri = Buffer.from(Uint8Array.from(tris)).toString('base64');
fs.writeFileSync(file, `window.TRIPO_MESHES=window.TRIPO_MESHES||{};window.TRIPO_MESHES[${JSON.stringify(name)}]=${JSON.stringify(D)};\n`);
console.log(`[${name}] pieces: ${S.nr} between ${S.lines.length} lines; band pieces ${Object.keys(regKey).length} (${settings.bands}); keys ${keys.join(', ')}; triangles by two lines ${mixed}`);
