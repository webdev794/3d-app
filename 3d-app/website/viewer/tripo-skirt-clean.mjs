// RUGBYJ 2026-11-25 item 148 (client 654): the tennis skirt's (every skirt tile's) waistband, hem binding and side piping drawn
// from the model's SHAPE, not Tripo's ragged parts: the waistband HB deep under the top edge, the hem binding HH high over the
// bottom edge (both per angle round the skirt), each side's piping a straight line (fitted to Tripo's piping) PW wide from
// the hem binding to the waistband. Rewrites the data's piece / pieceTri only (keys, shape, print places unchanged).
// node skirt-clean.mjs <tripo-tennis-skirt.js>   (safe to run again)
import fs from 'node:fs';
const file = process.argv[2], NAME = 'tennis-skirt', text = fs.readFileSync(file, 'utf8'), head = `window.TRIPO_MESHES["${NAME}"]=`, i0 = text.indexOf(head);
if (i0 < 0) throw new Error('no model data');
const D = JSON.parse(text.slice(i0 + head.length, text.lastIndexOf(';')));
if (JSON.stringify(D.partKeys) !== JSON.stringify(['part:skirtBand', 'part:hem', 'part:hem|trim'])) throw new Error('keys changed: ' + D.partKeys);
const b64 = (s) => { const u = Buffer.from(s, 'base64'); return u.buffer.slice(u.byteOffset, u.byteOffset + u.length); };
const n = D.count, q = new Uint16Array(b64(D.pos)), idx = new Uint16Array(b64(D.idx));
const P = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) P[i] = D.lo[i % 3] + (q[i] / 65535) * (D.hi[i % 3] - D.lo[i % 3]);
const HB = 0.044, HH = 0.010, PW = 0.012, BAND = 0.02, NB = 90, K_BAND = 1, K_HEM = 2, K_PIP = 3;
let zc = 0; for (let i = 0; i < n; i++) zc += P[i * 3 + 2] / n;
const phi = (i) => Math.atan2(P[i * 3], P[i * 3 + 2] - zc), fb = (f) => ((f + Math.PI) / (2 * Math.PI)) * NB - 0.5;
const top = new Float32Array(NB).fill(-9), bot = new Float32Array(NB).fill(9);
for (let i = 0; i < n; i++) { const b = Math.min(NB - 1, Math.max(0, Math.round(fb(phi(i))))), y = P[i * 3 + 1]; top[b] = Math.max(top[b], y); bot[b] = Math.min(bot[b], y); }
const sm = (a) => a.map((_, b) => (a[(b + NB - 1) % NB] + 2 * a[b] + a[(b + 1) % NB]) / 4);
const T = sm(top), B = sm(bot), at = (a, f) => { const x = fb(f), b0 = Math.floor(x), t = x - b0; return a[(b0 + NB) % NB] * (1 - t) + a[(b0 + 1) % NB] * t; };
// the piping's line per side, fitted to Tripo's piping (old data: piece key 3) between the hem and the band: phi = a + b y
const pc0 = new Uint8Array(b64(D.pieceOld ?? D.piece)), key0 = (i) => (pc0[i * 3 + 2] >= 128 ? pc0[i * 3] : pc0[i * 3 + 1]);
const fit = {};
for (const s of [1, -1]) {
  const rows = {};
  for (let i = 0; i < n; i++) { if (key0(i) !== K_PIP || Math.sign(P[i * 3]) !== s) continue; const y = P[i * 3 + 1]; if (y < 0.06 || y > 0.28) continue; (rows[Math.floor(y / 0.02)] ??= []).push(phi(i)); }
  const pts = Object.entries(rows).filter(([, v]) => v.length > 20).map(([k, v]) => { v.sort((a, b) => a - b); return [(+k + 0.5) * 0.02, v[v.length >> 1]]; });
  const my = pts.reduce((a, p) => a + p[0], 0) / pts.length, mf = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const b = pts.reduce((a, p) => a + (p[0] - my) * (p[1] - mf), 0) / pts.reduce((a, p) => a + (p[0] - my) ** 2, 0);
  fit[s] = { a: mf - b * my, b }; console.log(`piping ${s > 0 ? 'left' : 'right'}: ${pts.length} rows, phi = ${(fit[s].a * 180 / Math.PI).toFixed(1)} + ${(fit[s].b * 180 / Math.PI).toFixed(1)} deg/m * y`);
}
// per point: each area's signed distance (+ inside)
const S = new Float32Array(n * 4);
for (let i = 0; i < n; i++) {
  const f = phi(i), y = P[i * 3 + 1], r = Math.hypot(P[i * 3], P[i * 3 + 2] - zc), s = P[i * 3] >= 0 ? 1 : -1, ln = fit[s];
  S[i * 4 + K_BAND] = y - (at(T, f) - HB);
  S[i * 4 + K_HEM] = at(B, f) + HH - y;
  S[i * 4 + K_PIP] = PW / 2 - Math.abs(f - (ln.a + ln.b * y)) * r;
}
const enc = (d) => Math.max(0, Math.min(255, 128 + Math.round((d * 1000) / 0.4)));
const best = (i) => { let k = K_BAND; for (const c of [K_HEM, K_PIP]) if (S[i * 4 + c] > S[i * 4 + k]) k = c; return k; };
const piece = new Uint8Array(n * 3); let inside = 0, edge = 0;
for (let i = 0; i < n; i++) {
  const k = best(i), d = S[i * 4 + k];
  if (d >= BAND) { piece[i * 3] = piece[i * 3 + 1] = k; piece[i * 3 + 2] = 128; inside++; }
  else if (d > -BAND) { piece[i * 3] = k; piece[i * 3 + 1] = 0; piece[i * 3 + 2] = enc(d); edge++; }
  else piece[i * 3 + 2] = 128;
}
// triangles whose corners lie by different areas: one line for the triangle (its two areas meeting where their distances are equal)
const tris = []; let mixed = 0;
for (let t = 0; t < D.tris; t++) {
  const c = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]], ks = new Set(c.map(best).filter((k, j) => S[c[j] * 4 + k] > -BAND));
  if (ks.size < 2) continue;
  const [ka, kb] = [...ks].sort((a, b) => Math.max(...c.map((v) => S[v * 4 + b])) - Math.max(...c.map((v) => S[v * 4 + a])));
  mixed++; tris.push(t & 255, (t >> 8) & 255, (t >> 16) & 255, ka, 0, ...c.map((v) => enc(Math.max(S[v * 4 + ka], S[v * 4 + kb]))));   // (both areas in the first one's colour inside this one triangle)
}
D.pieceOld ??= D.piece;
D.piece = Buffer.from(piece).toString('base64'); D.pieceTri = Buffer.from(Uint8Array.from(tris)).toString('base64');
fs.writeFileSync(file, text.slice(0, i0) + head + JSON.stringify(D) + ';');
console.log(`skirt clean: zc ${zc.toFixed(3)}, ${inside} points inside an area, ${edge} by an edge, ${mixed} triangles between two areas`);
