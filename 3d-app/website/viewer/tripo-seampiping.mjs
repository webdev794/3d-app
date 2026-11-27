// Piping of our own along a ready-made model's raglan seams (FIXER6 2026-11-26, item 198: the women's fitness top's printed
// cyan piping (texture.js, the made compression top's COMPRESSION_PIPING) landed wobbly beside the model's own seams). Run
// from website/ AFTER its converter and parts step (it reads and rewrites viewer/tripo-<name>.js):
//
//   node viewer/tripo-seampiping.mjs <name>
//
// Settings: viewer/parts/<name>.json `seamPiping`: { from, to (print height of the seam's foot at the underarm and its top
// by the collar), seed (|x| metres of the seam at its foot), angle (degrees: a seam point is where neighbouring faces meet at
// more than this), tol (metres across from one height to the next), sigma (metres of smoothing along it), lift (metres off the cloth) }.
// How: per half (front / back) and side, the model's crease points between those heights, followed up from the underarm
// (each 1 cm of height only the points within `tol` across of the last), their middle per height, smoothed, laid onto the
// cloth: data `piping` (main.js pipingStrip: a 4 mm strip lying on the cloth, in the piping colour), and data `ownPiping`
// (texture.js leaves out the made top's printed piping). The model's shape is never changed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel } from './pieces/model.mjs';
import { closestOnTri } from './pieces/pieces.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
const S = name && JSON.parse(fs.readFileSync(path.join(here, 'parts', `${name}.json`), 'utf8')).seamPiping;
if (!S) { console.error('usage: node viewer/tripo-seampiping.mjs <name>   (viewer/parts/<name>.json needs `seamPiping`)'); process.exit(1); }
const m = loadModel(name), { D, n, pos: P, nor: N, idx, side } = m, T = idx.length / 3;
const FL = new Int16Array(new Uint8Array(Buffer.from(D.flat, 'base64')).buffer), fy = (v) => FL[v * 2 + 1] * D.flatUnit;
// crease strength per welded point
const pk = (v) => `${Math.round(P[v * 3] * 2e4)},${Math.round(P[v * 3 + 1] * 2e4)},${Math.round(P[v * 3 + 2] * 2e4)}`, W = new Map(), wid = new Int32Array(n);
for (let v = 0; v < n; v++) { const k = pk(v); if (!W.has(k)) W.set(k, W.size); wid[v] = W.get(k); }
const FN = new Float64Array(T * 3);
for (let t = 0; t < T; t++) { const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3, u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]], x = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...x) || 1; FN[t * 3] = x[0] / l; FN[t * 3 + 1] = x[1] / l; FN[t * 3 + 2] = x[2] / l; }
const E = new Map();
for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const a = wid[idx[t * 3 + k]], b = wid[idx[t * 3 + (k + 1) % 3]], key = a < b ? a * 1e7 + b : b * 1e7 + a; (E.get(key) ?? E.set(key, []).get(key)).push(t); }
const ang = new Float32Array(W.size);
for (const [key, ts] of E) { if (ts.length !== 2) continue; const [a, b] = ts, d = Math.abs(FN[a * 3] * FN[b * 3] + FN[a * 3 + 1] * FN[b * 3 + 1] + FN[a * 3 + 2] * FN[b * 3 + 2]), g = (Math.acos(Math.min(1, d)) * 180) / Math.PI, u = Math.floor(key / 1e7), v = key % 1e7; ang[u] = Math.max(ang[u], g); ang[v] = Math.max(ang[v], g); }
const from = S.from ?? 0.53, to = S.to ?? 0.705, A = S.angle ?? 40, tol = S.tol ?? 0.022, sigma = S.sigma ?? 0.02;
// the cloth (outer faces) for laying the line on
const G = 0.02, grid = new Map(), gk = (p) => p.map((c) => Math.floor(c / G)).join(',');
for (let t = 0; t < T; t++) { const c = [0, 1, 2].map((a) => (P[idx[t * 3] * 3 + a] + P[idx[t * 3 + 1] * 3 + a] + P[idx[t * 3 + 2] * 3 + a]) / 3), k = gk(c); (grid.get(k) ?? grid.set(k, []).get(k)).push(t); }
const P3 = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
const onCloth = (p, facing) => {
  const [x, y, z] = p.map((c) => Math.floor(c / G)); let best = null, bd = 9, bt = -1;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const t of grid.get(`${x + a},${y + b},${z + c}`) ?? []) {
    if (FN[t * 3 + 2] * facing < -0.3 && N[idx[t * 3] * 3 + 2] * facing < -0.3) continue;
    const q = closestOnTri(p, P3(idx[t * 3]), P3(idx[t * 3 + 1]), P3(idx[t * 3 + 2])), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < bd) { bd = d; best = q; bt = t; }
  }
  if (!best) return null;
  const v = idx[bt * 3]; let nn = [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]]; if (nn[2] * facing < 0) nn = nn.map((x2) => -x2);
  return { q: best, n: nn };
};
const lines = [], report = [];
for (const h of [0, 1]) for (const sg of [1, -1]) {
  const facing = h ? -1 : 1, bins = new Map();
  for (let v = 0; v < n; v++) {
    if ((side[v] & 1) !== h || ang[wid[v]] < A) continue;
    const x = sg * P[v * 3], y = fy(v); if (y < from || y > to || x < 0.03 || x > 0.23 || N[v * 3 + 2] * facing < -0.2) continue;
    const b = Math.round(y * 100); (bins.get(b) ?? bins.set(b, []).get(b)).push(v);
  }
  let last = S.seed ?? 0.17; const pts = [];
  for (const [, vs0] of [...bins].sort((a, b) => a[0] - b[0])) {
    const vs = vs0.filter((v) => Math.abs(sg * P[v * 3] - last) < tol); if (!vs.length) continue;
    const med = (k) => { const a = vs.map((v) => P[v * 3 + k]).sort((p, q) => p - q); return a[a.length >> 1]; };
    const p = [med(0), med(1), med(2)]; last = sg * p[0]; pts.push(p);
  }
  if (pts.length < 6) { report.push(`${h ? 'back' : 'front'} ${sg > 0 ? '+x' : '-x'}: too few seam points`); continue; }
  // (`fit` (FIXER6 2026-11-27, item 203: the piping must lie IN the seam's groove, one straight even line): the seam as a smooth
  // curve x(y), z(y) (least squares, degree `fit`) through the crease points within `near` of it, refitted 3 times, so one stray
  // crease (the collar edge, a fold) never bends it; each place then put onto the crease point nearest it within `snap`.)
  if (S.fit) {
    const deg = S.fit, near = S.near ?? 0.004, cand = [];
    for (let v = 0; v < n; v++) { if ((side[v] & 1) !== h || ang[wid[v]] < A) continue; const y = P[v * 3 + 1]; if (sg * P[v * 3] < 0.02 || N[v * 3 + 2] * facing < -0.2) continue; if (y < pts[0][1] - 0.01 || y > Math.min(pts.at(-1)[1] + 0.01, S.fitTop?.[h ? 'back' : 'front'] ?? 9)) continue; cand.push(v); }
    const solve = (M2, r) => { const k = r.length; for (let i = 0; i < k; i++) { let p2 = i; for (let j = i + 1; j < k; j++) if (Math.abs(M2[j][i]) > Math.abs(M2[p2][i])) p2 = j; [M2[i], M2[p2]] = [M2[p2], M2[i]]; [r[i], r[p2]] = [r[p2], r[i]]; for (let j = i + 1; j < k; j++) { const f = M2[j][i] / M2[i][i]; for (let c = i; c < k; c++) M2[j][c] -= f * M2[i][c]; r[j] -= f * r[i]; } } const x2 = new Array(k).fill(0); for (let i = k - 1; i >= 0; i--) { let s2 = r[i]; for (let j = i + 1; j < k; j++) s2 -= M2[i][j] * x2[j]; x2[i] = s2 / M2[i][i]; } return x2; };
    const fitAxis = (ys, vs) => { const k = deg + 1, M2 = Array.from({ length: k }, () => new Array(k).fill(0)), r = new Array(k).fill(0); ys.forEach((y, i) => { const pw = Array.from({ length: k }, (_, j) => y ** j); for (let a2 = 0; a2 < k; a2++) { r[a2] += pw[a2] * vs[i]; for (let b2 = 0; b2 < k; b2++) M2[a2][b2] += pw[a2] * pw[b2]; } }); return solve(M2, r); };
    const ev = (cf, y) => cf.reduce((s2, c, j) => s2 + c * y ** j, 0);
    let use = pts.filter((p) => p[1] <= (S.fitTop?.[h ? 'back' : 'front'] ?? 9)), cx, cz;
    for (let it = 0; it < 4; it++) {
      cx = fitAxis(use.map((p) => p[1]), use.map((p) => p[0])); cz = fitAxis(use.map((p) => p[1]), use.map((p) => p[2]));
      const nxt = cand.map((v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]).filter((p) => Math.hypot(p[0] - ev(cx, p[1]), p[2] - ev(cz, p[1])) < near);
      if (nxt.length < 8) break; use = nxt;
    }
    // (`fitTop` { front, back }: the seam's top on that half (where it meets the collar), so the collar's own edge is never followed)
    const y0 = Math.min(...use.map((p) => p[1])), y1 = Math.min(Math.max(...use.map((p) => p[1])), S.fitTop?.[h ? 'back' : 'front'] ?? 9); pts.length = 0;
    for (let y = y0; y <= y1 + 1e-9; y += 0.003) { let p = [ev(cx, y), y, ev(cz, y)]; let best = null, bd = S.snap ?? 0.0025; for (const q of use) { const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < bd) { bd = d; best = q; } } pts.push(best ? best.slice() : p); }
  }
  // resampled every 3 mm along it, smoothed (Gaussian `sigma`, its ends kept), laid on the cloth
  const R = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), k = Math.max(1, Math.round(d / 0.003)); for (let j = 1; j <= k; j++) R.push(a.map((x2, c) => x2 + ((b[c] - x2) * j) / k)); }
  const sgs = sigma / 0.003, hw = Math.ceil(3 * sgs);
  const L = R.map((_, k) => { const ww = Math.min(hw, k, R.length - 1 - k); let s = [0, 0, 0], ws = 0; for (let o = -ww; o <= ww; o++) { const w = Math.exp(-0.5 * (o / sgs) ** 2); s = s.map((x2, c) => x2 + R[k + o][c] * w); ws += w; } return s.map((x2) => x2 / ws); });
  const C = [], Nn = [];
  // (lifted `lift` metres off the cloth along its normal, so the 4 mm strip lies over the seam's groove, never half under it)
  // (each normal turned outward from the body's middle and smoothed along the line, so the strip never twists edge-on)
  const zc = (D.lo[2] + D.hi[2]) / 2;
  for (const p of L) { const r = onCloth(p, facing); if (!r) continue; const out = [p[0], 0, p[2] - zc]; if (r.n[0] * out[0] + r.n[2] * out[2] < 0) r.n = r.n.map((x2) => -x2); C.push(r.q); Nn.push(r.n); }
  const NS = Nn.map((_, k) => { let s2 = [0, 0, 0]; for (let o = -6; o <= 6; o++) { const q = Nn[k + o]; if (q) s2 = s2.map((x2, c) => x2 + q[c]); } const l = Math.hypot(...s2) || 1; return s2.map((x2) => x2 / l); });
  C.forEach((q, k) => { for (let c = 0; c < 3; c++) q[c] += NS[k][c] * (S.lift ?? 0.002); Nn[k] = NS[k]; });
  lines.push({ c: C.flatMap((q) => q.map((x2) => +x2.toFixed(5))), n: Nn.flatMap((q) => q.map((x2) => +x2.toFixed(3))), closed: false });
  report.push(`${h ? 'back' : 'front'} ${sg > 0 ? '+x' : '-x'}: ${C.length * 3} mm from ${C[0][1].toFixed(3)} up to ${C.at(-1)[1].toFixed(3)}`);
}
D.piping = lines; D.ownPiping = true;
fs.writeFileSync(path.join(here, `tripo-${name}.js`), `window.TRIPO_MESHES=window.TRIPO_MESHES||{};window.TRIPO_MESHES[${JSON.stringify(name)}]=${JSON.stringify(D)};\n`);
for (const r of report) console.log(`[${name}] seam piping ${r}`);
