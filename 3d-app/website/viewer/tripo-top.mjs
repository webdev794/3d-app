// The shared converter for ready-made (Tripo) tops, shorts and other garments added by the recipe (MODELQ 2026-11-16;
// viewer/tripo-add.mjs, settings in viewer/models/<name>.json `convert`). The model's points, triangles and normals are
// used exactly as they are: one uniform scale and a move onto the made garment's place (garment.js), nothing reshaped,
// no shade baked in.
//
// The direct approach (user 2026-11-16): the model's own parts are its borders. The model is split into regions along
// its own seams (open edges, edges shared by three or more triangles) and sharp creases (`creaseDeg`); the settings name
// which regions are which part (`regions`: [{ regions: [ids], band: key, where? }], ids as viewer/models/check/<name>-regions.jpg
// shows them, made by `node viewer/tripo-top.mjs regions <name>`); each such part is printed in one flat colour from its
// own swatch (`swatchKeys`: texture.js paintModelSwatches: 'collar' the Collar part's own colour else the trim colour,
// 'trim', 'main', 'inside' (drawn in the inside's plain material), '#rrggbb' a fixed colour, 'zone:<name>' that colour
// area). Everything else is cloth, printed through the made garment's flat pattern:
//  - front / back: each point by which side of the model's middle it is on (the middle between its front-most and
//    back-most cloth at its place seen from the front, per 1 cm);
//  - up the pattern: its height (the made garment's pattern is its height, garment.js);
//  - across: the way round the cloth from the middle front (back) at its height (the slice's outermost cloth, per 5 mm),
//    times the slice's share: the body's way round to its side = the pattern's half-width there (below the underarm;
//    above it the underarm's share), so prints run on smoothly round the body and onto the sleeves.
// For a garment with legs (`legs: true`: shorts, pants, leggings) the way round is measured round each leg from its own
// middle front (back) below the crotch, out to the leg's outer side.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The model split along its seams and sharp creases: each triangle's region (0 the largest), regions' triangles. */
export function regionsOf(glb, creaseDeg = 25) {
  const P = glb.pos, I = glb.idx, n = P.length / 3, T = I.length / 3;
  const fn = new Float64Array(T * 3);
  for (let t = 0; t < T; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const m = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...m) || 1;
    fn[t * 3] = m[0] / l; fn[t * 3 + 1] = m[1] / l; fn[t * 3 + 2] = m[2] / l;
  }
  const edges = new Map();
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const a = I[t * 3 + k], b = I[t * 3 + (k + 1) % 3], key = a < b ? a * n + b : b * n + a; (edges.get(key) ?? edges.set(key, []).get(key)).push(t); }
  const cos = Math.cos((creaseDeg * Math.PI) / 180), parent = Int32Array.from({ length: T }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const ts of edges.values()) {
    if (ts.length !== 2) continue;
    const [f, g] = ts;
    if (fn[f * 3] * fn[g * 3] + fn[f * 3 + 1] * fn[g * 3 + 1] + fn[f * 3 + 2] * fn[g * 3 + 2] < cos) continue;
    parent[find(f)] = find(g);
  }
  const roots = new Map();
  for (let t = 0; t < T; t++) { const r = find(t); (roots.get(r) ?? roots.set(r, []).get(r)).push(t); }
  const regs = [...roots.values()].sort((a, b) => b.length - a.length || a[0] - b[0]), triReg = new Int32Array(T);
  regs.forEach((ts, k) => ts.forEach((t) => (triReg[t] = k)));
  return { fn, triReg, regs };
}

export default {
  lib: "export { buildGarment, SPECS } from './garment.js';",
  async convert({ glb, lib, tools, settings }) {  // eslint-disable-line no-param-reassign
    const C = settings.convert ?? {}, log = [];
    const { neighbours } = tools;
    const made = lib.buildGarment(C.made ?? settings.part, { detail: true });
    made.geometry.computeBoundingBox();
    const box = made.geometry.boundingBox, outline = made.outline;
    const { fn, triReg } = regionsOf(glb, C.creaseDeg ?? 25);
    // (`turn`: degrees round the upright, for a model made facing away (its front at -z): placing only, its shape as it is.)
    if (C.turn) {
      const th = (C.turn * Math.PI) / 180, c = Math.cos(th), s2 = Math.sin(th), rot = (A) => { const B = Float32Array.from(A); for (let i = 0; i < B.length; i += 3) { const x = A[i], z = A[i + 2]; B[i] = x * c + z * s2; B[i + 2] = -x * s2 + z * c; } return B; };
      glb = { ...glb, pos: rot(glb.pos), nor: rot(glb.nor) };
      for (let t = 0; t < fn.length; t += 3) { const x = fn[t], z = fn[t + 2]; fn[t] = x * c + z * s2; fn[t + 2] = -x * s2 + z * c; }
    }
    const R = glb.pos, I = glb.idx, count = R.length / 3, T = I.length / 3;

    // ---- Each triangle's part (band key index + 1; 0 cloth), from the settings' rules in order (later rules win).
    const keys = C.swatchKeys ?? [];
    const triBand = new Uint8Array(T);
    for (const rule of C.regions ?? []) {
      const ids = new Set(rule.regions ?? []), b = rule.band === 'cloth' ? 0 : keys.indexOf(rule.band) + 1;
      if (b < 0) throw new Error(`unknown band ${rule.band}`);
      // (`where`: a test on the triangle's middle (model units x y z) and its normal (nx ny nz), from our settings.)
      const where = rule.where ? new Function('x', 'y', 'z', 'nx', 'ny', 'nz', `return (${rule.where});`) : null;
      for (let t = 0; t < T; t++) {
        if (rule.regions && !ids.has(triReg[t])) continue;
        if (where) {
          const m = [0, 1, 2].map((a) => (R[I[t * 3] * 3 + a] + R[I[t * 3 + 1] * 3 + a] + R[I[t * 3 + 2] * 3 + a]) / 3);
          if (!where(m[0], m[1], m[2], fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2])) continue;
        }
        triBand[t] = b;
      }
    }
    // Each point's part: the part most of its triangles are on, a part before the cloth (so a part's own triangles are
    // whole: tripoShape prints a triangle as a part only when all three corners are on it).
    const band = new Uint8Array(count);
    {
      const votes = Array.from({ length: count }, () => new Map());
      for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const v = I[t * 3 + k], m = votes[v]; m.set(triBand[t], (m.get(triBand[t]) ?? 0) + 1); }
      for (let i = 0; i < count; i++) { const parts = [...votes[i]].filter(([b]) => b).sort((p, q) => q[1] - p[1]); band[i] = parts.length ? parts[0][0] : 0; }
    }
    log.push(`parts: ${keys.map((k, j) => `${k} ${band.reduce((s, b) => s + (b === j + 1), 0)}`).join(', ')} points; cloth ${band.reduce((s, b) => s + !b, 0)}`);

    // ---- Placed: one uniform scale, the model's body top (`top`, model units; default its whole height) at the made
    // garment's top, centred left to right and front to back. (`fit`: 'width' scales its width to the made garment's.)
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], R[i]); hi[i % 3] = Math.max(hi[i % 3], R[i]); }
    const top = C.top ?? hi[1];
    const scale = C.scale ?? (C.fit === 'width' ? (box.max.x - box.min.x) / (hi[0] - lo[0]) : (box.max.y - box.min.y) / (top - lo[1]));
    const move = [-scale * (lo[0] + hi[0]) / 2, box.min.y - scale * lo[1] + (C.lift ?? 0), (box.min.z + box.max.z) / 2 - scale * (lo[2] + hi[2]) / 2];
    const pos = new Float64Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = R[i] * scale + move[i % 3];
    const nor = glb.nor;
    log.push(`scale ${scale.toFixed(4)}, moved ${move.map((v) => v.toFixed(4)).join(', ')}; made ${C.made ?? settings.part} box y ${box.min.y.toFixed(3)}..${box.max.y.toFixed(3)}`);
    const X = (i) => pos[i * 3], Y = (i) => pos[i * 3 + 1], Z = (i) => pos[i * 3 + 2];

    // ---- Front and back: the middle between the front-most and back-most cloth per 1 cm seen from the front.
    // (Legs: the same, each leg is its own column of cells.)
    const G = 0.01, gx0 = Math.floor(Math.min(...Array.from({ length: count }, (_, i) => X(i))) / G) - 1, gy0 = Math.floor(box.min.y / G) - 2;
    const GW = Math.ceil((Math.max(...Array.from({ length: count }, (_, i) => X(i))) - gx0 * G) / G) + 2, GH = Math.ceil((Math.max(...Array.from({ length: count }, (_, i) => Y(i))) - gy0 * G) / G) + 2;
    const zMax = new Float64Array(GW * GH).fill(-Infinity), zMin = new Float64Array(GW * GH).fill(Infinity);
    const cell = (x, y) => Math.max(0, Math.min(GH - 1, Math.floor(y / G) - gy0)) * GW + Math.max(0, Math.min(GW - 1, Math.floor(x / G) - gx0));
    for (let t = 0; t < T; t++) {
      // (Sampled over each triangle, so every cell it covers counts.)
      const [a, b, c] = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
      const m = Math.max(1, Math.ceil(Math.max(Math.hypot(X(b) - X(a), Y(b) - Y(a)), Math.hypot(X(c) - X(a), Y(c) - Y(a))) / (G / 2)));
      for (let u = 0; u <= m; u++) for (let v = 0; u + v <= m; v++) {
        const wa = 1 - (u + v) / m, wb = u / m, wc = v / m;
        const x = X(a) * wa + X(b) * wb + X(c) * wc, y = Y(a) * wa + Y(b) * wb + Y(c) * wc, z = Z(a) * wa + Z(b) * wb + Z(c) * wc, k = cell(x, y);
        zMax[k] = Math.max(zMax[k], z); zMin[k] = Math.min(zMin[k], z);
      }
    }
    let zMid = new Float64Array(GW * GH).fill(NaN);
    for (let k = 0; k < GW * GH; k++) if (zMax[k] > -Infinity) zMid[k] = (zMax[k] + zMin[k]) / 2;
    for (let it = 0; it < 6; it++) {
      const next = Float64Array.from(zMid);
      for (let r = 0; r < GH; r++) for (let q = 0; q < GW; q++) {
        let s = 0, w = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dq = -1; dq <= 1; dq++) { const rr = r + dr, qq = q + dq; if (rr < 0 || qq < 0 || rr >= GH || qq >= GW) continue; const v = zMid[rr * GW + qq]; if (!Number.isNaN(v)) { s += v; w++; } }
        if (w) next[r * GW + q] = Number.isNaN(zMid[r * GW + q]) ? s / w : (zMid[r * GW + q] * 2 + s) / (2 + w);
      }
      zMid = next;
    }
    const midAt = (x, y) => { const v = zMid[cell(x, y)]; return Number.isNaN(v) ? 0 : v; };
    const front = (i) => Z(i) > midAt(X(i), Y(i));
    const back = new Uint8Array(count);
    for (let i = 0; i < count; i++) back[i] = front(i) ? 0 : 1;
    // Each triangle's half: most of its corners'.
    const triSide = new Uint8Array(T);
    for (let t = 0; t < T; t++) triSide[t] = back[I[t * 3]] + back[I[t * 3 + 1]] + back[I[t * 3 + 2]] >= 2 ? 1 : 0;

    // ---- The way round each slice (every 5 mm up), per half: the outermost cloth (front: highest z; back: lowest) per 5 mm
    // out from the middle (x), its length from the middle out.
    const SL = 0.005, XB = 0.005, yLo = box.min.y - 0.02, NS = Math.ceil((Math.max(...Array.from({ length: count }, (_, i) => Y(i))) - yLo) / SL) + 2;
    const xMax = Math.max(...Array.from({ length: count }, (_, i) => Math.abs(X(i)))), NX = Math.ceil(xMax / XB) + 2;
    // (Legs: measured round each leg from its own middle; `legs` gives the crotch height in model units.)
    const crotch = C.legs ? C.legs * scale + move[1] : null;
    const legMid = new Float64Array(NS).fill(0);
    if (crotch != null) {
      // (Each slice below the crotch: the leg's middle = the middle of its cloth's x span, per side.)
      const span = Array.from({ length: NS }, () => [Infinity, -Infinity]);
      for (let i = 0; i < count; i++) { if (Y(i) >= crotch || X(i) <= 0) continue; const k = Math.round((Y(i) - yLo) / SL), s = span[k]; s[0] = Math.min(s[0], X(i)); s[1] = Math.max(s[1], X(i)); }
      for (let k = 0; k < NS; k++) legMid[k] = Number.isFinite(span[k][0]) ? (span[k][0] + span[k][1]) / 2 : NaN;
      for (let k = 0; k < NS; k++) if (Number.isNaN(legMid[k])) legMid[k] = 0;
      let sm = Array.from(legMid);
      for (let it = 0; it < 8; it++) sm = sm.map((_, k) => (sm[Math.max(0, k - 1)] + 2 * sm[k] + sm[Math.min(NS - 1, k + 1)]) / 4);
      for (let k = 0; k < NS; k++) legMid[k] = yLo + k * SL < crotch ? sm[k] : 0;
    }
    // (x measured from the slice's middle: the body's, or below the crotch the leg's.)
    const ax = (x, y) => { const k = Math.max(0, Math.min(NS - 1, Math.round((y - yLo) / SL))); return Math.abs(x) - legMid[k]; };
    const prof = [0, 1].map(() => Array.from({ length: NS }, () => new Float64Array(NX * 2 + 2).fill(NaN)));
    const OFF = NX + 1;   // (bins from -NX to NX: left of a leg's middle is its inner side)
    for (let t = 0; t < T; t++) {
      if (triBand[t]) continue;
      const h = triSide[t], c = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]], ys = c.map(Y);
      const k0 = Math.ceil((Math.min(...ys) - yLo) / SL), k1 = Math.floor((Math.max(...ys) - yLo) / SL);
      for (let k = Math.max(0, k0); k <= Math.min(NS - 1, k1); k++) {
        const yy = yLo + k * SL, cut = [];
        for (let e = 0; e < 3; e++) {
          const a = c[e], b = c[(e + 1) % 3], ya = Y(a), yb = Y(b);
          if ((ya - yy) * (yb - yy) > 0 || ya === yb) continue;
          const f = (yy - ya) / (yb - ya);
          cut.push([X(a) + (X(b) - X(a)) * f, Z(a) + (Z(b) - Z(a)) * f]);
        }
        if (cut.length < 2) continue;
        const [p0, p1] = cut, m = Math.max(1, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 0.002));
        for (let j = 0; j <= m; j++) {
          const x = p0[0] + ((p1[0] - p0[0]) * j) / m, z = p0[1] + ((p1[1] - p0[1]) * j) / m;
          const b = Math.round(ax(x, yy) / XB) + OFF, row = prof[h][k];
          if (b < 0 || b >= row.length) continue;
          if (Number.isNaN(row[b]) || (h ? z < row[b] : z > row[b])) row[b] = z;
        }
      }
    }
    // The way round from the middle per bin (outward: from the middle bin; legs: inward too, from the leg's middle).
    const arc = [0, 1].map((h) => prof[h].map((row) => {
      const s = new Float64Array(row.length).fill(NaN);
      for (const dir of [1, -1]) {
        let prev = null, acc = 0;
        for (let b = OFF; b >= 0 && b < row.length; b += dir) {
          if (Number.isNaN(row[b])) continue;
          const x = (b - OFF) * XB;
          if (prev == null) acc = Math.abs(x); else acc += Math.hypot(x - prev[0], row[b] - prev[1]);
          s[b] = dir * acc; prev = [x, row[b]];
        }
      }
      return s;
    }));
    const arcAt = (h, k, a) => {
      const s = arc[h][Math.max(0, Math.min(NS - 1, k))], f = a / XB + OFF, b0 = Math.floor(f);
      // (Nearest bins with a value either side.)
      let lo2 = b0, hi2 = b0 + 1;
      while (lo2 >= 0 && Number.isNaN(s[lo2])) lo2--;
      while (hi2 < s.length && Number.isNaN(s[hi2])) hi2++;
      if (lo2 < 0 && hi2 >= s.length) return a;
      if (lo2 < 0) return s[hi2] - (hi2 - f) * XB;
      if (hi2 >= s.length) return s[lo2] + (f - lo2) * XB;
      return s[lo2] + ((s[hi2] - s[lo2]) * (f - lo2)) / (hi2 - lo2);
    };
    // ---- Each slice's share: the pattern's half-width at its height over the body's way round to its side (its cloth up to
    // the first gap of 1.5 cm out from the middle: the sleeves beside it left out); above the underarm the underarm's.
    const edgeX = (y) => { let x = 0; for (let k = 0; k < outline.length; k++) { const a = outline[k], b = outline[(k + 1) % outline.length]; if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) { const v = a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y); if (v > 0 && (!x || v < x)) x = v; } } return x; };
    const pitY = C.pit ?? (() => {
      // (The pattern's underarm: after the outline's furthest point out (the cuff), where it turns from across to down.)
      const O = outline.filter((p) => p.x >= 0), kc = O.reduce((m, p, k) => (p.x > O[m].x ? k : m), 0);
      for (let k = kc + 1; k + 1 < O.length; k++) { const dx = O[k + 1].x - O[k].x, dy = O[k + 1].y - O[k].y; if (dy < 0 && Math.abs(dy) > 1.5 * Math.abs(dx) && O[k].y < O[kc].y) return O[k].y; }
      return 0.5;
    })();
    const share = [0, 1].map((h) => {
      const k = new Float64Array(NS).fill(NaN);
      for (let r = 0; r < NS; r++) {
        const y = yLo + r * SL;
        if (y > pitY - 0.01 || y < box.min.y + 0.01) continue;
        const s = arc[h][r];
        let last = null, gap = 0;
        for (let b = OFF; b < s.length; b++) { if (Number.isNaN(s[b])) { if (last != null && ++gap > 3) break; continue; } gap = 0; last = b; }
        const E = crotch != null && y < crotch ? null : edgeX(y);
        if (last != null && E && s[last] > 0.05) k[r] = E / s[last];
      }
      // (Gaps filled, smoothed, held at the underarm's above it and at the lowest's below.)
      const firstK = k.findIndex((v) => !Number.isNaN(v)), lastK = k.length - 1 - [...k].reverse().findIndex((v) => !Number.isNaN(v));
      for (let r = 0; r < NS; r++) if (Number.isNaN(k[r])) k[r] = r < firstK ? k[firstK] : r > lastK ? k[lastK] : k[r - 1];
      let sm = Array.from(k);
      for (let it = 0; it < 10; it++) sm = sm.map((_, r) => (sm[Math.max(0, r - 1)] + 2 * sm[r] + sm[Math.min(NS - 1, r + 1)]) / 4);
      // (`share`: one fixed share for every slice (HOODIE/MODELQ6 2026-11-20: 1 = prints at true size on a model narrower or
      // wider than the made pattern, so marks keep their shape).)
      return sm.map((v) => C.share ?? Math.max(0.7, Math.min(1.35, Number.isFinite(v) ? v : 1)));
    });
    log.push(`underarm on the pattern at ${pitY.toFixed(3)}; share front ${share[0][Math.round((0.25 - yLo) / SL)]?.toFixed(3)} back ${share[1][Math.round((0.25 - yLo) / SL)]?.toFixed(3)} (at 25 cm)`);

    // ---- Flat places. (Legs: across = the way round the leg from its middle, plus the leg's middle on the pattern
    // (`legX`: the pattern's leg middle, else where the leg's middle is).)
    const F = new Float64Array(count * 2);
    for (let i = 0; i < count; i++) {
      const y = Y(i), k = Math.max(0, Math.min(NS - 1, Math.round((y - yLo) / SL))), h = back[i], sx = X(i) >= 0 ? 1 : -1;
      const a = ax(X(i), y), s = arcAt(h, k, a) * share[h][k];
      F[i * 2] = sx * (crotch != null && y < crotch ? legMid[k] * (C.legShare ?? 1) + s : s);
      F[i * 2 + 1] = y;
    }

    // ---- Points on both halves (triangles across the middle line) and band triangles: copies with their own half.
    const OP = [], ON = [], OF = [], OB = [], OBand = [], idx = [], copy = new Map();
    const out = (i, h) => {
      const key = i * 2 + h;
      if (copy.has(key)) return copy.get(key);
      const k = OP.length / 3;
      copy.set(key, k);
      OP.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); ON.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]); OF.push(F[i * 2], F[i * 2 + 1]); OB.push(h); OBand.push(band[i]);
      return k;
    };
    for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) idx.push(out(I[t * 3 + k], triSide[t]));
    log.push(`${OP.length / 3} points written (${OP.length / 3 - count} copies across the halves)`);

    // ---- The neck opening's rim (for the form and the neck label): per 1/48 round the neck, the highest point of the
    // collar part (`neckBand`, default the first key) or, without one, of the top of the cloth.
    const nb = keys.indexOf(C.neckBand ?? keys[0]) + 1;
    let neck = null;
    if (!C.legs) {
      const pick = (i) => (nb > 0 ? band[i] === nb : Y(i) > box.max.y - 0.08 && Math.abs(X(i)) < 0.12);
      const pts = []; for (let i = 0; i < count; i++) if (pick(i)) pts.push(i);
      if (pts.length) {
        const cx = pts.reduce((s, i) => s + X(i), 0) / pts.length, cz = pts.reduce((s, i) => s + Z(i), 0) / pts.length;
        const bins = new Array(48).fill(-1), ang = (i) => Math.atan2(X(i) - cx, Z(i) - cz);
        for (const i of pts) { const b = Math.floor(((ang(i) / (2 * Math.PI)) + 1) * 48) % 48; if (bins[b] < 0 || Y(i) > Y(bins[b])) bins[b] = i; }
        neck = bins.filter((v) => v >= 0).map((v) => [X(v), Y(v), Z(v)].map((q) => +q.toFixed(5)));
      }
    }
    // Where the painter puts the plain colours (front half, above the pattern's outline), 6 cm apart.
    const swatch = keys.map((_, j) => C.swatchAt?.[j] ?? [0.2 + 0.06 * j, 0.8]);
    const insideBands = keys.map((k, j) => (k === 'inside' ? j + 1 : 0)).filter(Boolean);
    return {
      data: {
        pos: Float32Array.from(OP), nor: Float32Array.from(ON), flat: Float64Array.from(OF), back: Uint8Array.from(OB), shade: new Float64Array(OP.length / 3).fill(1), idx,
        extra: { scale: +scale.toFixed(6), move: move.map((v) => +v.toFixed(6)), ...(C.turn ? { turn: C.turn } : {}), ...(neck ? { neck } : {}), swatch, swatchKeys: keys, swatchSpread: 0.02, ownNeck: settings.ownNeck ?? 'own', halves: true, ...(insideBands.length ? { inside: insideBands } : {}), band: Buffer.from(Uint8Array.from(OBand).buffer).toString('base64') },
      },
      report: log.join('\n'),
    };
  },
};
