// The soccer jersey's ready-made model (Tripo, 2026-11-13; tripo-convert.mjs), for the Football sport's "Football jersey"
// tile only (look flag design.zoneColors.scJersey; every other jersey keeps its own shape). The model's own points,
// triangles and normals, placed with one uniform scale and a move where the made jersey stands (garment.js SPECS.jersey
// with its own V and round back, necks.js roundBack), printed through that jersey's flat pattern (its painter: colour
// areas, marks, numbers, layers).
//
// The model: a V-neck jersey with set-in short sleeves, a side panel down each side from the armpit (its seams in front
// and behind, a side seam in its middle), a V neck band (stand-up, turned in), rolled cuff bands sewn on at a seam round
// each sleeve, a turned-up hem.
//
// Where each point is on the flat pattern: the model is cut into a front and a back as the pattern is (at its side seams,
// along the sleeves' undersides and over the shoulders and sleeves' tops) and each half is laid flat as cloth is, keeping
// every triangle's shape as well as it can (a conformal map, least squares), with its edges and seams sewn onto the
// pattern's: the hem's fold onto our hem, the side seams onto ours, the sleeves' undersides and tops onto ours, the cuff
// bands' seams onto our cuff lines, the neck band's foot onto our neck edge, its side panels' seams onto the painter's side
// panels' inner edges and its armholes onto the line where our sleeve area starts (zones.js: x 0.27).
// Printed plain (tripomesh.js, per point `band` with the data's `swatch`): 1 the neck band (Neck trim colour), 2 the cuff
// bands (inside and out: the trim colour), 3 the hem turned up inside (the body's colour).

const SLEEVE_X = 0.27;   // zones.js TOP.sleeves: the sleeve area from here out
const PANEL = { p0: [0.262, 0.54], p1: [0.215, 0.3], p2: [0.23, 0] };   // texture.js side panels' inner edge (quadratic)

export default {
  model: '../../tripo/soccer-jersey.glb',
  lib: "export { buildGarment, SPECS } from './garment.js'; export { roundBack } from './necks.js';",
  async convert({ glb, lib, tools, debug }) {
    const { madeSurface, neighbours } = tools;
    const made = lib.buildGarment('jersey', { spec: lib.roundBack('jersey', lib.SPECS.jersey), detail: true });
    made.geometry.computeBoundingBox();
    const box = made.geometry.boundingBox;
    const log = [];
    const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const lerpTable = (table, x) => {
      if (x <= table[0][0]) return table[0][1];
      for (let i = 1; i < table.length; i++) if (x <= table[i][0]) { const [x0, y0] = table[i - 1], [x1, y1] = table[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1); }
      return table.at(-1)[1];
    };
    // ---- The line between the front and back halves (the pattern's side seams, the shoulders' and sleeves' tops and
    // undersides): below the armpits along the model's own side seam (its crease, by its angle round the body at each
    // height), above them through the shoulders' and sleeves' middle (z ARM_Z). The model's triangles crossing it are cut
    // along it (new points on its own surface: the shape is unchanged), so each half's edge is a smooth line.
    const ARMPIT = 0.6, ARM_Z = -0.055;
    const seamAngle = (() => {
      const Q = glb.pos, J = glb.idx, n0 = Q.length / 3, fn = [], et = new Map(), cr = new Uint8Array(n0);
      for (let t = 0; t < J.length; t += 3) { const a = J[t] * 3, b = J[t + 1] * 3, c = J[t + 2] * 3, e1 = [Q[b] - Q[a], Q[b + 1] - Q[a + 1], Q[b + 2] - Q[a + 2]], e2 = [Q[c] - Q[a], Q[c + 1] - Q[a + 1], Q[c + 2] - Q[a + 2]], m = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...m) || 1; fn.push(m.map((v) => v / l)); }
      for (let t = 0; t < J.length; t += 3) for (let k = 0; k < 3; k++) { const a = J[t + k], b = J[t + (k + 1) % 3], key = a < b ? a * n0 + b : b * n0 + a; (et.get(key) ?? et.set(key, []).get(key)).push(t / 3); }
      for (const [key, ts] of et) if (ts.length === 2) { const [f, g] = ts.map((t) => fn[t]); if (f[0] * g[0] + f[1] * g[1] + f[2] * g[2] < 0.9) { cr[Math.floor(key / n0)] = 1; cr[key % n0] = 1; } }
      const rows = [];
      for (let y = 0.04; y <= 0.58; y += 0.02) {
        const a = [];
        for (let i = 0; i < n0; i++) if (cr[i] && Math.abs(Q[i * 3 + 1] - y) < 0.012 && Math.abs(Q[i * 3]) > 0.2) { const d = (Math.atan2(Q[i * 3 + 2], Math.abs(Q[i * 3])) * 180) / Math.PI; if (Math.abs(d + 2) < 7) a.push(d); }
        rows.push([y, a.length >= 3 ? a.sort((p, q) => p - q)[a.length >> 1] : null]);
      }
      for (let k = 0; k < rows.length; k++) if (rows[k][1] == null) rows[k][1] = rows[k - 1]?.[1] ?? rows.find((r) => r[1] != null)?.[1] ?? -2;
      const sm = rows.map(([y], k) => [y, rows.slice(Math.max(0, k - 2), k + 3).reduce((q, r) => q + r[1], 0) / rows.slice(Math.max(0, k - 2), k + 3).length]);
      log.push(`side seam: ${sm.map(([y, a]) => a.toFixed(1)).join(' ')} degrees round from the side`);
      return (y) => (lerpTable(sm, y) * Math.PI) / 180;
    })();
    const divide = (x, y, z) => { const t = smoothstep(ARMPIT - 0.07, ARMPIT + 0.03, y); return z - (Math.abs(x) * Math.tan(seamAngle(y)) * (1 - t) + ARM_Z * t); };
    const R0 = Array.from(glb.pos), N0 = Array.from(glb.nor), I0 = [];
    {
      const cache = new Map(), val = (v) => divide(R0[v * 3], R0[v * 3 + 1], R0[v * 3 + 2]);
      const at0 = (a, b) => {
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (cache.has(key)) return cache.get(key);
        const va = val(a), vb = val(b), t = va / (va - vb), i = R0.length / 3;
        for (let k = 0; k < 3; k++) R0.push(R0[a * 3 + k] + (R0[b * 3 + k] - R0[a * 3 + k]) * t);
        const nn = [0, 1, 2].map((k) => N0[a * 3 + k] + (N0[b * 3 + k] - N0[a * 3 + k]) * t), l = Math.hypot(...nn) || 1;
        N0.push(...nn.map((v) => v / l));
        cache.set(key, i);
        return i;
      };
      const J = glb.idx;
      for (let t = 0; t < J.length; t += 3) {
        const c = [J[t], J[t + 1], J[t + 2]], v = c.map(val), sg = v.map((x) => (x > 1e-9 ? 1 : x < -1e-9 ? -1 : 0));
        if (!sg.includes(1) || !sg.includes(-1)) { I0.push(...c); continue; }
        const above = [], under = [];
        for (let k = 0; k < 3; k++) {
          const a = c[k], b = c[(k + 1) % 3];
          if (sg[k] >= 0) above.push(a);
          if (sg[k] <= 0) under.push(a);
          if (sg[k] * sg[(k + 1) % 3] < 0) { const m = at0(a, b); above.push(m); under.push(m); }
        }
        for (const keep of [above, under]) for (let k = 1; k + 1 < keep.length; k++) I0.push(keep[0], keep[k], keep[k + 1]);
      }
      log.push(`cut along the halves' line: ${cache.size} new points`);
    }
    const R = Float32Array.from(R0), I = Uint32Array.from(I0), count = R.length / 3;
    glb = { pos: R, nor: Float32Array.from(N0), idx: I };

    // ---- Placed: one uniform scale (the model's hem to its back neck's top = the made jersey's), centred left to right,
    // its middle front to back on the made jersey's. (Its own features are found in its own units, R.)
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], R[i]); hi[i % 3] = Math.max(hi[i % 3], R[i]); }
    const scale = (box.max.y - box.min.y) / (hi[1] - lo[1]);
    const move = [-scale * (lo[0] + hi[0]) / 2, box.min.y - scale * lo[1], (box.min.z + box.max.z) / 2 - scale * (lo[2] + hi[2]) / 2];
    const pos = new Float64Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = R[i] * scale + move[i % 3];
    const nor = glb.nor, P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], N = (i) => [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]];
    const rx = (i) => R[i * 3], ry = (i) => R[i * 3 + 1], rz = (i) => R[i * 3 + 2];
    const rd = (a, b) => Math.hypot(R[a * 3] - R[b * 3], R[a * 3 + 1] - R[b * 3 + 1], R[a * 3 + 2] - R[b * 3 + 2]);
    log.push(`frame ${JSON.stringify(made.frame)} scale ${scale.toFixed(4)}, moved ${move.map((v) => v.toFixed(4)).join(', ')}`);
    const nb = neighbours(count, I);

    // ---- Its edges: open (one triangle) and doubled seams (three or more triangles: where a band is sewn on).
    const edgeTris = new Map();
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3], key = a < b ? a * count + b : b * count + a; (edgeTris.get(key) ?? edgeTris.set(key, []).get(key)).push(t / 3); }
    const isOpen = new Uint8Array(count), isSeam = new Uint8Array(count);
    for (const [key, ts] of edgeTris) {
      if (ts.length === 1) { isOpen[Math.floor(key / count)] = 1; isOpen[key % count] = 1; }
      if (ts.length > 2) { isSeam[Math.floor(key / count)] = 1; isSeam[key % count] = 1; }
    }
    const fnorm = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const e1 = [R[b] - R[a], R[b + 1] - R[a + 1], R[b + 2] - R[a + 2]], e2 = [R[c] - R[a], R[c + 1] - R[a + 1], R[c + 2] - R[a + 2]];
      const m = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...m) || 1;
      fnorm.push(m.map((v) => v / l));
    }
    const crease = new Uint8Array(count);
    for (const [key, ts] of edgeTris) {
      if (ts.length !== 2) continue;
      const [f, g] = ts.map((t) => fnorm[t]);
      if (f[0] * g[0] + f[1] * g[1] + f[2] * g[2] < 0.9) { crease[Math.floor(key / count)] = 1; crease[key % count] = 1; }
    }
    // Distance along the cloth from some points (model units, to `reach`).
    const along = (sources, reach = 0.12, ok = () => true) => {
      const d = new Float64Array(count).fill(Infinity), heap = [];
      const push = (v) => { heap.push(v); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (d[heap[p]] <= d[heap[k]]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && d[heap[l]] < d[heap[m]]) m = l; if (r < heap.length && d[heap[r]] < d[heap[m]]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
      for (const v of sources) { d[v] = 0; push(v); }
      while (heap.length) {
        const v = pop();
        if (d[v] > reach) break;
        for (const w of nb[v]) { if (!ok(w)) continue; const nd = d[v] + rd(v, w); if (nd < d[w]) { d[w] = nd; push(w); } }
      }
      return d;
    };

    // ---- The neck band: from its free edge (the open edge inside the neck) up over its top and down its outside to its
    // foot, the first crease on its outside (each 1/36 of the way round the neck).
    const neckFree = [];
    for (let i = 0; i < count; i++) if (isOpen[i] && ry(i) > 0.75 && Math.abs(rx(i)) < 0.2) neckFree.push(i);
    const dNeck = along(neckFree, 0.16);
    const neckC = [0, 2].map((a) => neckFree.reduce((s, v) => s + R[v * 3 + a], 0) / neckFree.length);
    const angleNeck = (i) => Math.atan2(rx(i) - neckC[0], rz(i) - neckC[1]);
    const outwardNeck = (i) => { const n = N(i), ax = rx(i) - neckC[0], az = rz(i) - neckC[1]; return (n[0] * ax + n[2] * az) / (Math.hypot(ax, az) || 1); };
    // (The band's top fold first: in each bin the highest point within 7.5 cm of the free edge; its foot, the first crease
    // on the outside 6-30 mm on past the fold, else 15 mm past it.)
    const BINS = 36, footD = new Array(BINS).fill(Infinity), foldAt = new Array(BINS).fill(null);
    const binOf = (i) => Math.floor(((angleNeck(i) / (2 * Math.PI)) + 1) * BINS) % BINS;
    for (let i = 0; i < count; i++) {
      if (!(dNeck[i] < 0.075) || ry(i) < 0.75) continue;
      const k = binOf(i);
      if (foldAt[k] == null || ry(i) > ry(foldAt[k])) foldAt[k] = i;
    }
    // (The band is a piece of its own laid on the cloth: where its outside ends, its edge is open or sewn on (a doubled
    // seam); that edge first, else the first crease.)
    const footOpen = new Array(BINS).fill(Infinity);
    for (let i = 0; i < count; i++) {
      if (ry(i) < 0.72 || outwardNeck(i) < 0.2) continue;
      const k = binOf(i), f = foldAt[k] == null ? 0.049 : dNeck[foldAt[k]];
      if (!(dNeck[i] > f + 0.006 && dNeck[i] < f + 0.07)) continue;
      if (isOpen[i] || isSeam[i]) footOpen[k] = Math.min(footOpen[k], dNeck[i]);
      else if (crease[i] && dNeck[i] < f + 0.03) footD[k] = Math.min(footD[k], dNeck[i]);
    }
    for (let k = 0; k < BINS; k++) if (Number.isFinite(footOpen[k])) footD[k] = footOpen[k];
    // (This band is folded in two, its inside as wide as its outside and its outside running smoothly into the cloth: its
    // foot is as far past its fold as its free edge is before it.)
    for (let k = 0; k < BINS; k++) if (foldAt[k] != null) footD[k] = 2 * dNeck[foldAt[k]];
    for (let k = 0; k < BINS; k++) if (!Number.isFinite(footD[k]) && foldAt[k] != null) footD[k] = dNeck[foldAt[k]] + 0.015;
    const footAt = (i) => {
      const t = ((angleNeck(i) / (2 * Math.PI)) + 1) * BINS - 0.5, k0 = Math.floor(t), f = t - k0;
      const get = (k) => { const v = footD[((k % BINS) + BINS) % BINS]; return Number.isFinite(v) ? v : null; };
      let a = get(k0), b = get(k0 + 1);
      for (let s = 2; a == null && s < 6; s++) a = get(k0 - s + 1);
      for (let s = 2; b == null && s < 6; s++) b = get(k0 + s);
      return (a ?? b ?? 0.03) * (1 - f) + (b ?? a ?? 0.03) * f;
    };
    const band = new Uint8Array(count);
    for (let i = 0; i < count; i++) if (dNeck[i] <= footAt(i) + 0.0005) band[i] = 1;
    log.push(`neck band: foot ${footD.map((v) => (Number.isFinite(v) ? (v * 1000).toFixed(0) : '-')).join(' ')} (model mm) from its free edge; ${band.reduce((s, v) => s + v, 0)} points`);

    // ---- The cuff bands: each sewn on at a doubled seam round the sleeve; its ring's centre and its axis (out of the
    // sleeve, away from the body). The band: everything past the seam's plane (its outside, the rolled edge, its inside).
    const cuffs = [1, -1].map((s) => {
      const ring = [];
      for (let i = 0; i < count; i++) if (isSeam[i] && s * rx(i) > 0.29 && ry(i) > 0.5 && ry(i) < 0.82) ring.push(i);
      const c = [0, 1, 2].map((a) => ring.reduce((q, v) => q + R[v * 3 + a], 0) / ring.length);
      // (The sleeve's axis: from the shoulder joint out through the ring's centre, level front to back.)
      const v = [c[0] - s * 0.2, c[1] - 0.78, 0], l = Math.hypot(...v);
      return { s, ring, c, d: v.map((x) => x / l) };
    });
    log.push(`cuffs: ${cuffs.map((q) => `${q.ring.length} seam points, centre ${q.c.map((v) => v.toFixed(3))} axis ${q.d.map((v) => v.toFixed(2))}`).join('; ')}`);
    const axial = (i, q) => (rx(i) - q.c[0]) * q.d[0] + (ry(i) - q.c[1]) * q.d[1] + (rz(i) - q.c[2]) * q.d[2];
    const radial = (i, q) => { const v = [rx(i) - q.c[0], ry(i) - q.c[1], rz(i) - q.c[2]], t = v[0] * q.d[0] + v[1] * q.d[1] + v[2] * q.d[2]; return v.map((x, a) => x - t * q.d[a]); };
    // The band: the seam cuts the sleeve off it; the cloth joined to the sleeve's outermost point without crossing the seam
    // (its outside, its rolled edge and its inside), within 15 cm of the seam's centre.
    for (const q of cuffs) {
      const ringSet = new Set(q.ring), near = (i) => Math.hypot(rx(i) - q.c[0], ry(i) - q.c[1], rz(i) - q.c[2]) < 0.15;
      let start = -1;
      for (let i = 0; i < count; i++) if (!ringSet.has(i) && near(i) && (start < 0 || axial(i, q) > axial(start, q))) start = i;
      const got = new Uint8Array(count), queue = [start];
      got[start] = 1;
      for (let k = 0; k < queue.length; k++) for (const w of nb[queue[k]]) if (!got[w] && !ringSet.has(w) && near(w)) { got[w] = 1; queue.push(w); }
      log.push(`cuff ${q.s > 0 ? 'left' : 'right'}: band ${queue.length} points from ${start} (axial ${axial(start, q).toFixed(3)})`);
      if (queue.length > 900) throw new Error('the cuff band reached past its seam');
      for (const v of queue) band[v] = 2;
      for (const v of q.ring) band[v] = 2;
    }
    log.push(`cuff bands: ${band.reduce((s, v) => s + (v === 2), 0)} points`);

    // ---- The hem turned up inside: near the hem, the cloth facing in (towards the body's middle), joined to the hem's
    // lowest points; printed plain in the body's colour (3).
    const facingIn = (i) => { const n = N(i), l = Math.hypot(rx(i), rz(i)) || 1; return (n[0] * rx(i) + n[2] * rz(i)) / l; };
    {
      const seed = [];
      for (let i = 0; i < count; i++) if (ry(i) < 0.09 && facingIn(i) < -0.2 && !band[i]) seed.push(i);
      const keep = new Uint8Array(count), queue = [];
      // (Only what joins the rolled edge: the lowest few millimetres.)
      for (const v of seed) if (nb[v].some((w) => ry(w) < 0.03 || facingIn(w) > 0.2)) { keep[v] = 1; queue.push(v); }
      for (let k = 0; k < queue.length; k++) for (const w of nb[queue[k]]) if (!keep[w] && !band[w] && ry(w) < 0.09 && facingIn(w) < -0.1) { keep[w] = 1; queue.push(w); }
      for (let i = 0; i < count; i++) if (keep[i]) band[i] = 3;
    }
    log.push(`hem inside: ${band.reduce((s, v) => s + (v === 3), 0)} points`);
    // (Other inside cloth near the neck (the band's own inside) is the band's; nothing else of the model faces in.)

    // ---- Front and back: the cloth in front of z = zDiv(y) is the front panel's. Below the armpits at the side seams
    // (the model's: a little behind the side), over the shoulders and along the sleeves through their middle.
    const front = (i) => divide(rx(i), ry(i), rz(i)) > 0;
    const triSide = [];
    for (let t = 0; t < I.length; t += 3) triSide.push([I[t], I[t + 1], I[t + 2]].some((v) => divide(rx(v), ry(v), rz(v)) < -1e-9) ? 1 : 0);
    const triNb = Array.from({ length: I.length / 3 }, () => []);
    for (const ts of edgeTris.values()) if (ts.length === 2) { triNb[ts[0]].push(ts[1]); triNb[ts[1]].push(ts[0]); }
    for (let pass = 0; pass < 3; pass++) {
      const seen = new Uint8Array(triSide.length);
      for (let t0 = 0; t0 < triSide.length; t0++) {
        if (seen[t0]) continue;
        const group = [t0];
        seen[t0] = 1;
        for (let k = 0; k < group.length; k++) for (const u of triNb[group[k]]) if (!seen[u] && triSide[u] === triSide[t0]) { seen[u] = 1; group.push(u); }
        if (group.length < 300) for (const t of group) triSide[t] = 1 - triSide[t];
      }
    }

    // ---- The pattern's edges (front outline, + x side; the back's the same but its raised neck), as point runs.
    const O = made.outline.map((p) => [p.x, p.y]), BO = (made.backOutline ?? made.outline).map((p) => [p.x, p.y]);
    const near = (poly, x, y, from = 0, to = poly.length) => { let best = from; for (let k = from; k < to; k++) if (Math.hypot(poly[k][0] - x, poly[k][1] - y) < Math.hypot(poly[best][0] - x, poly[best][1] - y)) best = k; return best; };
    const half = O.findIndex(([x], k) => k > 10 && x < 0);
    const iNeck = near(O, 0.088, 0.738, 0, 40), iCuffTop = near(O, 0.418, 0.566, 0, 100), iCuffLow = near(O, 0.372, 0.476, 0, 100), iPit = near(O, 0.258, 0.53, 0, 120), iHem = near(O, 0.258, 0.03, 100, half);
    const run = (poly, a, b) => { const out = []; for (let k = a; k <= b; k++) out.push(poly[k]); return out; };
    const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
    const at = (pts, t) => {
      const L = [0];
      for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const want = Math.min(1, Math.max(0, t)) * L.at(-1);
      let k = 1;
      while (k < pts.length - 1 && L[k] < want) k++;
      const f = (want - L[k - 1]) / (L[k] - L[k - 1] || 1);
      return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f];
    };
    const edgesOf = (poly) => ({
      top: run(poly, iNeck, iCuffTop), cuff: run(poly, iCuffTop, iCuffLow), under: run(poly, iCuffLow, iPit), side: run(poly, iPit, iHem),
      hem: [...run(poly, iHem, half - 1), ...mirror(run(poly, iHem, half - 1)).reverse().slice(1)].reverse(),
      neck: (() => { const e = (poly === BO ? made.backNeckEdge : made.neckEdge) ?? made.neckEdge; return e.map((p) => [p.x, p.y]); })(),
    });
    const E = [edgesOf(O), edgesOf(BO)];
    log.push(`pattern: neck point ${iNeck}, cuff ${iCuffTop}-${iCuffLow}, armpit ${iPit}, hem corner ${iHem}; neck edge ${E[0].neck.length} / ${E[1].neck.length} points`);
    // The side panels' inner edge (texture.js), from the hem up to the armpit.
    const panelPts = Array.from({ length: 41 }, (_, k) => { const t = 1 - k / 40, u = 1 - t; return [u * u * PANEL.p0[0] + 2 * u * t * PANEL.p1[0] + t * t * PANEL.p2[0], u * u * PANEL.p0[1] + 2 * u * t * PANEL.p1[1] + t * t * PANEL.p2[1]]; });

    // ---- The pins: each point of the model's edges and seams and where it goes on the pattern ([x, y], per half).
    const pins = [new Map(), new Map()], pinKind = [new Map(), new Map()];
    let kindNow = '';
    const pin = (h, i, xy) => { pins[h].set(i, xy); pinKind[h].set(i, kindNow); };
    const inHalf = [new Uint8Array(count), new Uint8Array(count)];
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) inHalf[triSide[t / 3]][I[t + k]] = 1;
    const outer = (i) => !band[i];
    const shares = (list, angle, dist = rd) => {
      const s = list.slice().sort((a, b) => angle(a) - angle(b));
      const ends = s.map((v, k) => (inHalf[0][v] && inHalf[1][v] ? k : -1)).filter((k) => k >= 0);
      const a = ends.length ? ends[0] : 0, b = ends.length > 1 ? ends.at(-1) : s.length - 1, L = new Array(s.length).fill(0);
      for (let k = a + 1; k <= b; k++) L[k] = L[k - 1] + dist(s[k], s[k - 1]);
      for (let k = b + 1; k < s.length; k++) L[k] = L[b];
      return new Map(s.map((v, k) => [v, L[b] ? L[k] / L[b] : 0]));
    };
    // The hem's fold: the lowest outside points round the body (each 1/90 of the way round, the lowest).
    const hemFoldAll = (() => {
      const best = new Map();
      for (let i = 0; i < count; i++) {
        if (!outer(i) || ry(i) > 0.045 || facingIn(i) < 0.2) continue;
        const k = Math.round((Math.atan2(rx(i), rz(i)) / (2 * Math.PI)) * 180);
        if (!best.has(k) || ry(i) < ry(best.get(k))) best.set(k, i);
      }
      return [...best.values()];
    })();
    for (const h of [0, 1]) {
      const e = E[h];
      kindNow = 'hem';
      const hemFold = hemFoldAll.filter((i) => inHalf[h][i]);
      // (Its length round the body seen from below: its ups and downs in the creases left out.)
      for (const [v, t] of shares(hemFold, (i) => Math.atan2(rx(i), h ? -rz(i) : rz(i)), (a, b) => Math.hypot(rx(a) - rx(b), rz(a) - rz(b)))) pin(h, v, at(e.hem, t));
      // The cuff bands' seams: round each sleeve from its underside to its top.
      kindNow = 'cuff';
      for (const q of cuffs) {
        const seam = q.ring.filter((i) => inHalf[h][i]);
        const ang = (i) => { const r = radial(i, q); return Math.atan2(Math.abs(r[2]), -r[1]); };
        // (Not its lowest quarter: there the model's cuff meets its armpit, far closer than the pattern's; left to the flat map.)
        for (const [v, t] of shares(seam, ang)) if (t > 0.25) pin(h, v, ((xy) => [q.s * xy[0], xy[1]])(at(e.cuff.slice().reverse(), t)));
      }
      // The neck band's foot: the cloth's points next to the band, round the neck from the wearer's right.
      kindNow = 'neck';
      const foot = [];
      for (let i = 0; i < count; i++) if (inHalf[h][i] && outer(i) && nb[i].some((w) => band[w] === 1)) foot.push(i);
      for (const [v, t] of shares(foot, (i) => Math.atan2(rx(i) - neckC[0], h ? neckC[1] - rz(i) : rz(i) - neckC[1]))) pin(h, v, at(e.neck, t));
    }
    // The seams between the halves: the side seams (below the armpit, by height), the sleeves' undersides (from the cuff
    // in, by the way along the cloth) and the tops (from the neck band out, by the way along the cloth).
    const sewn = [];
    for (let i = 0; i < count; i++) if (inHalf[0][i] && inHalf[1][i] && outer(i) && !pins[0].has(i) && !pins[1].has(i)) sewn.push(i);
    const hemEnd = [1, -1].map((sg) => { const ys = []; for (let i = 0; i < count; i++) if (pinKind[0].get(i) === 'hem' && inHalf[1][i] && sg * rx(i) > 0) ys.push(ry(i)); return ys.length ? ys.reduce((q, v) => q + v, 0) / ys.length : 0.02; });
    const hemY = (i) => hemEnd[rx(i) > 0 ? 0 : 1];
    const dNeckFar = along(neckFree, 0.9);
    const dCuff = cuffs.map((q) => along(q.ring, 0.5));
    // ---- The armholes (the set-in sleeves' seams): each a ring of creases round the shoulder, found as the plane that
    // most of the creases there lie on (random tries, the best kept). The cloth past it is the sleeve.
    let seed = 12345;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const holes = [1, -1].map((s) => {
      const cand = [];
      for (let i = 0; i < count; i++) if (crease[i] && !band[i] && s * rx(i) > 0.2 && s * rx(i) < 0.47 && ry(i) > 0.55 && ry(i) < 0.98) cand.push(i);
      let best = null;
      for (let k = 0; k < 4000; k++) {
        const [a, b, c] = [0, 1, 2].map(() => cand[Math.floor(rand() * cand.length)]);
        const e1 = [rx(b) - rx(a), ry(b) - ry(a), rz(b) - rz(a)], e2 = [rx(c) - rx(a), ry(c) - ry(a), rz(c) - rz(a)];
        let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const l = Math.hypot(...n);
        if (l < 1e-6) continue;
        n = n.map((v) => v / l);
        if (n[0] * s < 0) n = n.map((v) => -v);
        // (Facing out along the arm: mostly sideways, a little down; never upright front to back.)
        if (n[0] * s < 0.5 || Math.abs(n[2]) > 0.5) continue;
        const o = n[0] * rx(a) + n[1] * ry(a) + n[2] * rz(a);
        let inl = 0;
        for (const i of cand) if (Math.abs(n[0] * rx(i) + n[1] * ry(i) + n[2] * rz(i) - o) < 0.004) inl++;
        if (!best || inl > best.inl) best = { n, o, inl };
      }
      const dist = (i) => best.n[0] * rx(i) + best.n[1] * ry(i) + best.n[2] * rz(i) - best.o;
      const ring = cand.filter((i) => Math.abs(dist(i)) < 0.005);
      const top = ring.reduce((p, i) => (ry(i) > ry(p) ? i : p), ring[0]), low = ring.reduce((p, i) => (ry(i) < ry(p) ? i : p), ring[0]);
      // (A point is on the sleeve when past the plane and, seen along the plane's normal, within the ring.)
      const c = [0, 1, 2].map((a) => ring.reduce((p, v) => p + R[v * 3 + a], 0) / ring.length);
      const inPlane = (i) => { const v = [rx(i) - c[0], ry(i) - c[1], rz(i) - c[2]], t = v[0] * best.n[0] + v[1] * best.n[1] + v[2] * best.n[2]; return Math.hypot(v[0] - t * best.n[0], v[1] - t * best.n[1], v[2] - t * best.n[2]); };
      const rad = ring.reduce((p, v) => p + inPlane(v), 0) / ring.length;
      const armpitY = Math.min(...ring.map((v) => ry(v)));
      const onSleeve = (i) => dist(i) > 0 && (inPlane(i) < rad * 1.15 || ry(i) >= armpitY - 0.004);
      return { s, ...best, ring, dist, top, low, onSleeve };
    });
    log.push(`armholes: ${holes.map((q) => `${q.ring.length} creases, normal ${q.n.map((v) => v.toFixed(2))}, top y ${ry(q.top).toFixed(3)}, armpit y ${ry(q.low).toFixed(3)}`).join('; ')}`);
    const holeOf = (i) => holes[rx(i) > 0 ? 0 : 1];
    // The pattern's top and underside split where the sleeve area starts (x SLEEVE_X).
    const splitAt = (pts) => {
      const k = pts.findIndex((p, j) => j && (p[0] - SLEEVE_X) * (pts[j - 1][0] - SLEEVE_X) <= 0);
      const a = pts[k - 1], b = pts[k], f = (SLEEVE_X - a[0]) / (b[0] - a[0] || 1), m = [SLEEVE_X, a[1] + (b[1] - a[1]) * f];
      return [[...pts.slice(0, k), m], [m, ...pts.slice(k)]];
    };
    const [topBody, topSleeve] = splitAt(E[0].top), [underSleeve] = splitAt(E[0].under);
    const holeTopY = topBody.at(-1)[1], holeLowY = underSleeve.at(-1)[1];
    const seamOf = (i) => {
      const s = rx(i) < 0 ? -1 : 1, q = cuffs[s > 0 ? 0 : 1];
      // (On the body side of the armhole: the side seam below the armpit, else the shoulder's top; on the sleeve: its top
      // above its axis, its underside below.)
      if (!holes[s > 0 ? 0 : 1].onSleeve(i)) return ry(i) < ARMPIT ? 'side' : 'top';
      return radial(i, q)[1] > 0 ? 'top' : 'under';
    };
    if (process.env.SCDBG) for (const i of sewn) if (Math.abs(rx(i)) > 0.28) { const q = holeOf(i); log.push(`sewn ${[rx(i), ry(i), rz(i)].map((v) => v.toFixed(3))} dist ${q.dist(i).toFixed(3)} on ${q.onSleeve(i)} kind ${seamOf(i)}`); }
    const range = new Map();
    for (const i of sewn) {
      const kind = seamOf(i), s = rx(i) < 0 ? -1 : 1, key = `${kind}${s}`, d = kind === 'top' ? dNeckFar[i] : kind === 'under' ? dCuff[s > 0 ? 0 : 1][i] : ry(i);
      if (!Number.isFinite(d)) continue;
      const r = range.get(key) ?? [Infinity, -Infinity];
      range.set(key, [Math.min(r[0], d), Math.max(r[1], d)]);
    }
    const sideTop = new Map();   // (the side seam's top, each side: where the undersides take over)
    for (const i of sewn) {
      const kind = seamOf(i), s = rx(i) < 0 ? -1 : 1, [d0, d1] = range.get(`${kind}${s}`) ?? [0, 1];
      kindNow = kind;
      let xy;
      const q = holeOf(i);
      if (kind === 'side') xy = at(E[0].side.slice().reverse(), (ry(i) - hemY(i)) / (d1 - hemY(i)));
      else if (kind === 'under') {
        continue;
        // (From the cuff to the armhole's foot: the pattern's underside out of the sleeve area; past it, the armpit.)
        const d = dCuff[s > 0 ? 0 : 1][i], dl = dCuff[s > 0 ? 0 : 1][q.low];
        if (!Number.isFinite(d)) continue;
        xy = d <= dl ? at(underSleeve, (d - d0) / (dl - d0 || 1)) : at(E[0].under, 1);
      } else {
        // (From the neck to the armhole's top: the pattern's top to the sleeve area; then on along the sleeve's top.)
        const d = dNeckFar[i], dt = dNeckFar[q.top];
        if (!Number.isFinite(d)) continue;
        xy = d <= dt ? at(topBody, (d - d0) / (dt - d0 || 1)) : at(topSleeve, (d - dt) / (d1 - dt || 1));
      }
      for (const h of [0, 1]) pin(h, i, [s * xy[0], xy[1]]);
    }
    log.push(`seams: ${[...range].map(([k, [a, b]]) => `${k} ${a.toFixed(3)}..${b.toFixed(3)}`).join(', ')}`);
    // The armholes onto the line where the sleeve area starts: each half's ring from its top down to the armpit, by its
    // angle round the ring's middle.
    kindNow = 'armhole';
    let holePinned = 0;
    for (const q of holes) {
      const c = [0, 1, 2].map((a) => q.ring.reduce((p, v) => p + R[v * 3 + a], 0) / q.ring.length);
      const angle = (i) => { const v = [rx(i) - c[0], ry(i) - c[1], rz(i) - c[2]]; return Math.atan2(Math.abs(v[2] - (v[0] * q.n[0] + v[1] * q.n[1] + v[2] * q.n[2]) * q.n[2]), v[1] - (v[0] * q.n[0] + v[1] * q.n[1] + v[2] * q.n[2]) * q.n[1]); };
      const aTop = angle(q.top), aLow = angle(q.low);
      for (const i of q.ring) for (const h of [0, 1]) {
        if (!inHalf[h][i] || pins[h].has(i)) continue;
        const t = Math.min(1, Math.max(0, (angle(i) - aTop) / (aLow - aTop || 1)));
        if (t > 0.7) continue;
        pin(h, i, [q.s * SLEEVE_X, holeTopY + (holeLowY - holeTopY) * t]);
        holePinned++;
      }
    }
    log.push(`armholes: ${holePinned} points pinned onto x ${SLEEVE_X} (y ${holeTopY.toFixed(3)}..${holeLowY.toFixed(3)})`);

    // ---- The side panels' seams (front and back, each side): the model's creases there, one line each by height (from
    // the hem's fold up to the armhole), onto the painter's side panel edge by their share of the way up.
    const panelLine = (h, s) => {
      // (Their angle round the body seen from above: in front about 22 degrees in front of the side, behind about 14
      // behind; within 9 degrees of that, creases only.)
      const want = h ? -14 : 22, rows = [];
      for (let y = 0.07; y <= 0.62; y += 0.01) {
        const here = [];
        for (let i = 0; i < count; i++) {
          if (!crease[i] || band[i] || Math.abs(ry(i) - y) > 0.006 || s * rx(i) < 0.15) continue;
          const a = (Math.atan2(rz(i), s * rx(i)) * 180) / Math.PI;
          if (Math.abs(a - want) < 9) here.push(a);
        }
        if (here.length) { here.sort((p, q) => p - q); rows.push([y, here[here.length >> 1]]); }
      }
      // (Smoothed: the median of 5 rows.)
      return rows.map(([y], k) => { const w = rows.slice(Math.max(0, k - 2), k + 3).map((r) => r[1]).sort((p, q) => p - q); return [y, w[w.length >> 1]]; });
    };
    // (Not pinned: the made jersey's side panels are much narrower than the model's, so the model's seams are left where
    // the flat map puts them and the painter paints its side panels there instead (the data's `panels`, below).)
    const seamPts = [[], []], seamLines = [[null, null], [null, null]];
    for (const h of [0, 1]) for (const s of [1, -1]) {
      const line = panelLine(h, s);
      if (line.length < 20) { log.push(`panel seam ${h ? 'back' : 'front'} ${s}: only ${line.length} rows`); continue; }
      seamLines[h][s > 0 ? 0 : 1] = line;
      const y0 = line[0][0], y1 = line.at(-1)[0];
      for (let i = 0; i < count; i++) {
        if (!outer(i) || !inHalf[h][i] || s * rx(i) < 0.15 || ry(i) < y0 || ry(i) > y1) continue;
        const a = (Math.atan2(rz(i), s * rx(i)) * 180) / Math.PI;
        if (Math.abs(a - lerpTable(line, ry(i))) <= (crease[i] ? 1.2 : 0.6)) seamPts[h].push(i);
      }
      log.push(`panel seam ${h ? 'back' : 'front'} ${s > 0 ? 'left' : 'right'}: ${line.length} rows, y ${y0.toFixed(2)}..${y1.toFixed(2)}, angle ${line[0][1].toFixed(1)}..${line.at(-1)[1].toFixed(1)}`);
    }
    log.push(`pins: front ${pins[0].size}, back ${pins[1].size} (seams ${sewn.length})`);

    // ---- Each half laid flat: a conformal map (least squares) of its triangles (not the bands') with its pins held.
    const F = [new Float64Array(count * 2), new Float64Array(count * 2)], solved = [new Uint8Array(count), new Uint8Array(count)];
    const solveAll = () => {
      for (const h of [0, 1]) {
        const tris = [];
        for (let t = 0; t < I.length; t += 3) {
          if (triSide[t / 3] !== h) continue;
          const c = [I[t], I[t + 1], I[t + 2]];
          if (c.some((v) => band[v])) continue;
          tris.push(c);
        }
        const used = new Map();
        for (const c of tris) for (const v of c) if (!used.has(v)) used.set(v, used.size);
        const m = used.size, fixed = new Uint8Array(m), val = new Float64Array(m * 2);
        for (const [v, k] of used) { const p = pins[h].get(v); if (p) { fixed[k] = 1; val[k * 2] = p[0]; val[k * 2 + 1] = p[1]; } }
        const rows = [];
        for (const c of tris) {
          const [a, b, d] = c.map((v) => P(v));
          const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
          const l1 = Math.hypot(...e1);
          const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], area2 = Math.hypot(...nrm);
          if (l1 < 1e-9 || area2 < 1e-12) continue;
          const xa = e1.map((v) => v / l1), na = nrm.map((v) => v / area2), ya = [na[1] * xa[2] - na[2] * xa[1], na[2] * xa[0] - na[0] * xa[2], na[0] * xa[1] - na[1] * xa[0]];
          const flip = h ? -1 : 1;
          const w = [[0, 0], [l1, 0], [e2[0] * xa[0] + e2[1] * xa[1] + e2[2] * xa[2], flip * (e2[0] * ya[0] + e2[1] * ya[1] + e2[2] * ya[2])]];
          const sq = 1 / (4 * Math.sqrt(area2 / 2));
          const coef = [0, 1, 2].map((j) => [(w[(j + 1) % 3][0] - w[(j + 2) % 3][0]) * sq, (w[(j + 1) % 3][1] - w[(j + 2) % 3][1]) * sq]);
          rows.push({ k: c.map((v) => used.get(v)), coef });
        }
        const apply = (z, out) => {
          out.fill(0);
          for (const { k, coef } of rows) {
            let re = 0, im = 0;
            for (let j = 0; j < 3; j++) { const u = z[k[j] * 2], v = z[k[j] * 2 + 1], [p, q] = coef[j]; re += p * u - q * v; im += q * u + p * v; }
            for (let j = 0; j < 3; j++) { const [p, q] = coef[j]; out[k[j] * 2] += p * re + q * im; out[k[j] * 2 + 1] += -q * re + p * im; }
          }
        };
        const x = new Float64Array(m * 2);
        for (const [v, k] of used) {
          if (fixed[k]) { x[k * 2] = val[k * 2]; x[k * 2 + 1] = val[k * 2 + 1]; continue; }
          x[k * 2] = (h ? -1 : 1) * rx(v) * scale; x[k * 2 + 1] = ry(v) * scale;
        }
        const Ax = new Float64Array(m * 2), r = new Float64Array(m * 2), z = new Float64Array(m * 2), pv = new Float64Array(m * 2), Ap = new Float64Array(m * 2);
        const diag = new Float64Array(m * 2).fill(1e-12);
        for (const { k, coef } of rows) for (let j = 0; j < 3; j++) { const [p, q] = coef[j]; diag[k[j] * 2] += p * p + q * q; diag[k[j] * 2 + 1] += p * p + q * q; }
        const mask = (vec) => { for (let k = 0; k < m; k++) if (fixed[k]) { vec[k * 2] = 0; vec[k * 2 + 1] = 0; } };
        apply(x, Ax);
        for (let i = 0; i < m * 2; i++) r[i] = -Ax[i];
        mask(r);
        for (let i = 0; i < m * 2; i++) { z[i] = r[i] / diag[i]; pv[i] = z[i]; }
        let rzv = 0;
        for (let i = 0; i < m * 2; i++) rzv += r[i] * z[i];
        const r0 = rzv;
        let it = 0;
        for (; it < 20000 && rzv > r0 * 1e-16; it++) {
          apply(pv, Ap);
          mask(Ap);
          let pAp = 0;
          for (let i = 0; i < m * 2; i++) pAp += pv[i] * Ap[i];
          const alpha = rzv / pAp;
          let rz2 = 0;
          for (let i = 0; i < m * 2; i++) { x[i] += alpha * pv[i]; r[i] -= alpha * Ap[i]; z[i] = r[i] / diag[i]; rz2 += r[i] * z[i]; }
          const beta = rz2 / rzv;
          rzv = rz2;
          for (let i = 0; i < m * 2; i++) pv[i] = z[i] + beta * pv[i];
        }
        for (const [v, k] of used) { F[h][v * 2] = x[k * 2]; F[h][v * 2 + 1] = x[k * 2 + 1]; solved[h][v] = 1; }
        // (Where the model's cloth folds over itself (deep creases at the hem), the flat map can turn triangles over: those
        // places, and a ring round them, are smoothed (each the average of its neighbours, the rest held) until none is.)
        // (A triangle's turn on the pattern against its turn on the model, its winding checked against the file's normals,
        // as a few of the model's triangles are wound the other way.)
        const orient = (c) => {
          const [a, b, d] = c, A = P(a), B = P(b), D = P(d), e1 = B.map((v, j) => v - A[j]), e2 = D.map((v, j) => v - A[j]);
          const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          const wind = Math.sign(c.reduce((q, v) => q + fn[0] * nor[v * 3] + fn[1] * nor[v * 3 + 1] + fn[2] * nor[v * 3 + 2], 0)) || 1;
          const ar = (F[h][b * 2] - F[h][a * 2]) * (F[h][d * 2 + 1] - F[h][a * 2 + 1]) - (F[h][d * 2] - F[h][a * 2]) * (F[h][b * 2 + 1] - F[h][a * 2 + 1]);
          return Math.sign(ar) * wind * (h ? -1 : 1);
        };
        { const o = tris.map(orient); log.push(`${h ? 'back' : 'front'}: turn + ${o.filter((v) => v > 0).length} - ${o.filter((v) => v < 0).length}`); }
        const vnb = new Map();
        for (const c of tris) for (let k = 0; k < 3; k++) { const a = c[k], b = c[(k + 1) % 3]; (vnb.get(a) ?? vnb.set(a, new Set()).get(a)).add(b); (vnb.get(b) ?? vnb.set(b, new Set()).get(b)).add(a); }
        log.push(`${h ? 'back' : 'front'}: ${tris.length} triangles, ${m} points (${fixed.reduce((s, v) => s + v, 0)} pinned), ${it} steps`);
      }
    };
    solveAll();

    // ---- The deep folds low on the body (the hem's creases) pack much cloth into little room, and the flat map pushes some
    // of it out sideways onto the side panels' place: cloth well inside the front or back (3D |x| under 15 cm) below the
    // waist is kept inside the panels' seams (front 17 cm, back 20 cm out on the pattern), so a fold shows the body's print.
    const clampFolds = () => {
      let clamped = 0;
      for (const h of [0, 1]) {
        const lim = h ? 0.2 : 0.17;
        for (let i = 0; i < count; i++) {
          if (!solved[h][i] || band[i] || Math.abs(pos[i * 3]) > 0.172 || pos[i * 3 + 1] > 0.3) continue;
          const fx = F[h][i * 2];
          if (Math.abs(fx) > lim - 0.005) { F[h][i * 2] = Math.sign(fx) * (lim - 0.005 - 0.01 * (1 - Math.exp(-(Math.abs(fx) - lim + 0.005) / 0.01))); clamped++; }
        }
      }
      log.push(`folds: ${clamped} points kept inside the side panels' seams`);
    };
    clampFolds();

    // ---- The side panels as the flat map placed them: each half's seam (both sides together, +x), the middle of its points
    // every 2 cm of height on the pattern, smoothed; from the hem to the armhole (top down).
    const panels = [0, 1].map((h) => {
      const rows = [];
      for (let y = 0.0; y <= 0.56; y += 0.02) {
        const xs = seamPts[h].filter((i) => solved[h][i] && Math.abs(F[h][i * 2 + 1] - y) < 0.012).map((i) => Math.abs(F[h][i * 2])).sort((p, q) => p - q);
        if (xs.length >= 3) rows.push([xs[xs.length >> 1], y]);
      }
      const sm = rows.map(([, y], k) => [rows.slice(Math.max(0, k - 1), k + 2).reduce((q, r) => q + r[0], 0) / rows.slice(Math.max(0, k - 1), k + 2).length, y]);
      return sm.reverse().map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]);
    });
    log.push(`side panels on the pattern: front ${panels[0].map(([x, y]) => `${x.toFixed(3)}@${y.toFixed(2)}`).join(' ')}; back ${panels[1].map(([x, y]) => `${x.toFixed(3)}@${y.toFixed(2)}`).join(' ')}`);
    // ---- The cloth in front of the front seams (behind the back seams) kept inside the panels' lines on the pattern, and the
    // panels' cloth outside them, so the painted panels end at the model's seams also where its folds pushed the map about.
    {
      const lineX = (c, y) => { for (let k = 1; k < c.length; k++) if ((y - c[k - 1][1]) * (y - c[k][1]) <= 0) { const [x0, y0] = c[k - 1], [x1, y1] = c[k]; return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0 || 1); } return y > c[0][1] ? c[0][0] : c.at(-1)[0]; };
      let moved = 0;
      for (const h of [0, 1]) for (const sgn of [1, -1]) {
        const line = seamLines[h][sgn > 0 ? 0 : 1];
        if (!line || !panels[h].length) continue;
        for (let i = 0; i < count; i++) {
          if (!solved[h][i] || band[i] || sgn * rx(i) < 0.12 || ry(i) < line[0][0] - 0.02 || ry(i) > line.at(-1)[0]) continue;
          const a = (Math.atan2(rz(i), sgn * rx(i)) * 180) / Math.PI, want = lerpTable(line, ry(i));
          // (In front of the front seam / behind the back seam: the body's side of it, else the panel's.)
          const bodySide = h ? a < want - 1.5 : a > want + 1.5, panelSide = h ? a > want + 1.5 : a < want - 1.5;
          const X = lineX(panels[h], F[h][i * 2 + 1]), fx = Math.abs(F[h][i * 2]);
          if (bodySide && fx > X - 0.004) { F[h][i * 2] = Math.sign(F[h][i * 2]) * (X - 0.004); moved++; }
          else if (panelSide && fx < X + 0.004) { F[h][i * 2] = Math.sign(F[h][i * 2] || sgn) * (X + 0.004); moved++; }
        }
      }
      log.push(`side panels: ${moved} points put on their own side of the panels' lines`);
      // (Likewise the sleeves: the cloth past each armhole on the sleeve's side of the line where the sleeve area starts, the
      // body's on its own side.)
      let sleeveMoved = 0;
      for (const h of [0, 1]) for (let i = 0; i < count; i++) {
        if (!solved[h][i] || band[i] || Math.abs(rx(i)) < 0.2) continue;
        const q = holeOf(i), on = q.onSleeve(i), fx = Math.abs(F[h][i * 2]), fy = F[h][i * 2 + 1], sg = Math.sign(F[h][i * 2]) || (rx(i) < 0 ? -1 : 1);
        if (on && fx < SLEEVE_X + 0.004) { F[h][i * 2] = sg * (SLEEVE_X + 0.004); if (fy < 0.47) F[h][i * 2 + 1] = 0.47; sleeveMoved++; }
        else if (!on && fy > 0.44 && fx > SLEEVE_X - 0.004) { F[h][i * 2] = sg * (SLEEVE_X - 0.004); sleeveMoved++; }
      }
      log.push(`sleeves: ${sleeveMoved} points put on their own side of the sleeve line`);
    }

    // ---- The bands' points (printed from their swatches): the place of the nearest placed cloth point (for picking).
    const sideOf = new Uint8Array(count);
    for (let i = 0; i < count; i++) sideOf[i] = front(i) ? 0 : 1;
    const grid = new Map(), G = 0.02, gk = (a, b, c) => `${a},${b},${c}`;
    for (let i = 0; i < count; i++) if (solved[0][i] || solved[1][i]) { const k = gk(...[rx(i), ry(i), rz(i)].map((v) => Math.floor(v / G))); (grid.get(k) ?? grid.set(k, []).get(k)).push(i); }
    const nearestPlaced = (i, h) => {
      let best = -1, bd = Infinity;
      const c = [rx(i), ry(i), rz(i)].map((v) => Math.floor(v / G));
      for (let r = 1; r <= 4 && best < 0; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let e = -r; e <= r; e++) for (const j of grid.get(gk(c[0] + a, c[1] + b, c[2] + e)) ?? []) {
        if (!solved[h][j]) continue;
        const d = rd(i, j);
        if (d < bd) { bd = d; best = j; }
      }
      return best;
    };
    for (let i = 0; i < count; i++) {
      if (solved[0][i] || solved[1][i]) continue;
      for (const h of [sideOf[i], 1 - sideOf[i]]) {
        const p = pins[h].get(i);
        if (p) { F[h][i * 2] = p[0]; F[h][i * 2 + 1] = p[1]; solved[h][i] = 1; sideOf[i] = h; break; }
        const j = nearestPlaced(i, h);
        if (j >= 0) { F[h][i * 2] = F[h][j * 2]; F[h][i * 2 + 1] = F[h][j * 2 + 1]; solved[h][i] = 1; sideOf[i] = h; break; }
      }
    }

    // ---- The shade: the made jersey's baked shade nearest each point, smoothed over a few cm (none of its folds).
    const madeShade = madeSurface(made, 0.02);
    let S = new Float64Array(count);
    for (let i = 0; i < count; i++) S[i] = madeShade.nearest(P(i), N(i), { turn: 0.03 }).shade;
    for (let it = 0; it < 25; it++) { const T = new Float64Array(count); for (let i = 0; i < count; i++) { let s = S[i]; for (const j of nb[i]) s += S[j]; T[i] = s / (nb[i].length + 1); } S = T; }

    // ---- The points written: each with its half's place; a point on both halves (the seams) twice, one per half.
    const OP = [], ON = [], OF = [], OB = [], OS = [], OBand = [], idx = [], copy = new Map();
    const out = (i, h) => {
      const key = i * 2 + h;
      if (copy.has(key)) return copy.get(key);
      const k = OP.length / 3;
      copy.set(key, k);
      const g = solved[h][i] || !solved[1 - h][i] ? h : 1 - h;
      OP.push(...P(i)); ON.push(...N(i)); OF.push(F[g][i * 2], F[g][i * 2 + 1]); OB.push(h); OS.push(S[i]); OBand.push(band[i]);
      return k;
    };
    for (let t = 0; t < I.length; t += 3) {
      const c = [I[t], I[t + 1], I[t + 2]], h = c.some((v) => band[v]) && c.every((v) => band[v]) ? (c.filter((v) => sideOf[v]).length >= 2 ? 1 : 0) : triSide[t / 3];
      idx.push(...c.map((v) => out(v, h)));
    }
    log.push(`${OP.length / 3} points written (${OP.length / 3 - count} seam copies)`);

    // ---- The neck opening's rim: the band's top (its highest point each 1/48 of the way round), for the form and the
    // label, in order round it (in front from the wearer's right to the left, x rising; behind back round).
    const rimBins = new Array(48).fill(-1);
    for (let i = 0; i < count; i++) {
      if (band[i] !== 1) continue;
      const k = Math.floor(((angleNeck(i) / (2 * Math.PI)) + 1) * 48) % 48;
      if (rimBins[k] < 0 || ry(i) > ry(rimBins[k])) rimBins[k] = i;
    }
    const neck = rimBins.filter((v) => v >= 0).map((v) => P(v).map((q) => +q.toFixed(5)));

    if (debug) {
      const fs = await import('node:fs');
      const Fd = [], Bd = [];
      for (let i = 0; i < OP.length / 3; i++) { Fd.push(+OF[i * 2].toFixed(5), +OF[i * 2 + 1].toFixed(5)); Bd.push(OB[i] & 1); }
      const pinsOut = [0, 1].map((h) => [...pins[h]].map(([i, xy]) => [xy[0], xy[1], pinKind[h].get(i), i]));
      fs.writeFileSync(`${debug}/flat-debug.json`, JSON.stringify({ pins: pinsOut, F: Fd, back: Bd, pos: OP.map((v) => +v.toFixed(5)), nor: ON.map((v) => +v.toFixed(3)), band: OBand, idx, outline: O, backOutline: BO }));
    }
    // Where the painter puts the plain colours (texture.js paintModelSwatches; the front half, beyond the outline): the
    // neck band's (Neck trim), the cuffs' (trim), the inside's (body).
    const swatch = [[0.22, 0.79], [0.29, 0.79], [0.36, 0.79]];
    return {
      data: {
        pos: Float32Array.from(OP), nor: Float32Array.from(ON), flat: Float64Array.from(OF), back: Uint8Array.from(OB), shade: Float64Array.from(OS), idx,
        extra: { scale: +scale.toFixed(6), move: move.map((v) => +v.toFixed(6)), neck, swatch, ownNeck: 'v', halves: true, panels, band: Buffer.from(Uint8Array.from(OBand).buffer).toString('base64') },
      },
      report: log.join('\n'),
    };
  },
};
