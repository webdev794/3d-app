// The Football jersey's ready-made model (Tripo, 2026-11-13; tripo-convert.mjs): the model's own points, triangles and
// normals, placed with one uniform scale and a move where the made crew-neck jersey stands (fbjersey.js FB_SPEC), printed
// through that jersey's flat pattern (its painter: colour areas, raglan sleeves, marks, numbers, layers).
//
// Where each point is on the flat pattern: the model is cut into a front and a back as the pattern is (at its side
// seams, along the sleeves' undersides and over the shoulders and the sleeves' tops) and each half is laid flat as cloth
// is, keeping every triangle's shape as well as it can (a conformal map, least squares), with its edges sewn onto the
// pattern's: its hem's fold onto our hem, its side seams onto our side seams, the sleeves' undersides and tops onto ours,
// the cuffs' folds onto our cuff lines and its neck band's foot onto our neck edge; and on the front its raglan seams onto
// our raglan seams (layout-warp.js RAGLAN), so the sleeve colour meets the body at the model's own seams. The insides of
// the hem and cuffs (turned in) are mirrored back over the pattern's edge (the sleeve's own colour inside its cuff). The
// neck band (the stand-up band round the opening, inside and out) is printed from its own swatch in the Neck trim colour
// (tripomesh.js: the data's `bands`, per point, and `swatch`). The raglan piping strip on the wearer's right (its own part
// of the model) takes the places of the cloth under it.

const RAGLAN_NECK = [0.06, 0.728], RAGLAN_CONTROL = [0.17, 0.645], RAGLAN_UNDER = [0.258, 0.53];   // layout-warp.js RAGLAN
const RAGLAN_END = 0.9;

export default {
  model: '../../tripo/football-jersey.glb',
  lib: "export { buildGarment } from './garment.js'; export { roundBack } from './necks.js'; export { FB_SPEC, FB_SWATCH } from './fbjersey.js';",
  async convert({ glb, lib, tools, debug }) {
    const { madeSurface, parts, neighbours, openChains } = tools;
    const made = lib.buildGarment('jersey', { spec: lib.roundBack('jersey', lib.FB_SPEC), detail: true });
    made.geometry.computeBoundingBox();
    const box = made.geometry.boundingBox;
    const count = glb.pos.length / 3, log = [], R = glb.pos, I = glb.idx;
    const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const lerpTable = (table, x) => {
      if (x <= table[0][0]) return table[0][1];
      for (let i = 1; i < table.length; i++) if (x <= table[i][0]) { const [x0, y0] = table[i - 1], [x1, y1] = table[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1); }
      return table.at(-1)[1];
    };

    // ---- Placed: one uniform scale (the model's hem to its back neck's top = the made jersey's), centred left to right,
    // its middle front to back on the made jersey's. (Below, the model's own features are found in its own units, R.)
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], R[i]); hi[i % 3] = Math.max(hi[i % 3], R[i]); }
    const scale = (box.max.y - box.min.y) / (hi[1] - lo[1]);
    const move = [-scale * (lo[0] + hi[0]) / 2, box.min.y - scale * lo[1], (box.min.z + box.max.z) / 2 - scale * (lo[2] + hi[2]) / 2];
    const pos = new Float64Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = R[i] * scale + move[i % 3];
    const nor = glb.nor, P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], N = (i) => [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]];
    const rx = (i) => R[i * 3], ry = (i) => R[i * 3 + 1], rz = (i) => R[i * 3 + 2];
    const rd = (a, b) => Math.hypot(R[a * 3] - R[b * 3], R[a * 3 + 1] - R[b * 3 + 1], R[a * 3 + 2] - R[b * 3 + 2]);
    log.push(`scale ${scale.toFixed(4)}, moved ${move.map((v) => v.toFixed(4)).join(', ')}`);

    // ---- Its parts: the shirt (the largest) and the raglan piping strip on the wearer's right front.
    const { part, sizes } = parts(count, I);
    const piping = (i) => part[i] !== 0;
    log.push(`parts: ${sizes.join(' ')}`);
    const nb = neighbours(count, I);

    // ---- Its open edges: the neck band's free edge (inside the band), the hem's and the cuffs' turned-in edges.
    const chains = openChains(I).filter((c) => !piping(c[0])).map((c) => ({ c, mid: [0, 1, 2].map((k) => c.reduce((s, v) => s + R[v * 3 + k], 0) / c.length) }));
    const free = {
      neck: chains.filter((ch) => ch.mid[1] > 0.84 && Math.abs(ch.mid[0]) < 0.12),
      hem: chains.filter((ch) => ch.mid[1] < 0.06),
      cuff: [1, -1].map((s) => chains.filter((ch) => s * ch.mid[0] > 0.29 && ch.mid[1] > 0.49 && ch.mid[1] < 0.61)),
    };
    // Distance along the cloth from an edge (model units, to 12 cm).
    const along = (sources, reach = 0.12) => {
      const d = new Float64Array(count).fill(Infinity), heap = [];
      const push = (v) => { heap.push(v); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (d[heap[p]] <= d[heap[k]]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && d[heap[l]] < d[heap[m]]) m = l; if (r < heap.length && d[heap[r]] < d[heap[m]]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
      for (const v of sources) { d[v] = 0; push(v); }
      while (heap.length) {
        const v = pop();
        if (d[v] > reach) break;
        for (const w of nb[v]) { const nd = d[v] + rd(v, w); if (nd < d[w]) { d[w] = nd; push(w); } }
      }
      return d;
    };
    const dNeck = along(free.neck.flatMap((ch) => ch.c)), dHem = along(free.hem.flatMap((ch) => ch.c));
    const dCuff = free.cuff.map((list) => along(list.flatMap((ch) => ch.c)));

    // ---- Each cuff's ring: its centre and its axis (out of the sleeve), from its turned-in edge.
    const cuffs = free.cuff.map((list, k) => {
      const pts = list.flatMap((ch) => ch.c);
      const c = [0, 1, 2].map((a) => pts.reduce((s, v) => s + R[v * 3 + a], 0) / pts.length);
      // (The ring's plane: its normal by the cross products of points round it.)
      const n = [0, 0, 0];
      const ord = pts.slice().sort((a, b) => Math.atan2(ry(a) - c[1], rz(a) - c[2]) - Math.atan2(ry(b) - c[1], rz(b) - c[2]));
      for (let j = 0; j < ord.length; j++) {
        const a = [rx(ord[j]) - c[0], ry(ord[j]) - c[1], rz(ord[j]) - c[2]], b = [rx(ord[(j + 1) % ord.length]) - c[0], ry(ord[(j + 1) % ord.length]) - c[1], rz(ord[(j + 1) % ord.length]) - c[2]];
        n[0] += a[1] * b[2] - a[2] * b[1]; n[1] += a[2] * b[0] - a[0] * b[2]; n[2] += a[0] * b[1] - a[1] * b[0];
      }
      const l = Math.hypot(...n), s = k ? -1 : 1, d = n.map((v) => (v / l) * Math.sign(n[0] * s));
      return { c, d, s };
    });
    log.push(`cuffs: ${cuffs.map((q) => `centre ${q.c.map((v) => v.toFixed(3))} axis ${q.d.map((v) => v.toFixed(2))}`).join('; ')}`);
    // Across a sleeve from its axis (model units): the part of p - c square to d.
    const radial = (i, q) => { const v = [rx(i) - q.c[0], ry(i) - q.c[1], rz(i) - q.c[2]], t = v[0] * q.d[0] + v[1] * q.d[1] + v[2] * q.d[2]; return v.map((x, a) => x - t * q.d[a]); };

    // ---- The turned-in hem and cuffs (facing the body): near their edge, the cloth's normal pointing in.
    const facing = new Uint8Array(count);   // 1 the hem's, 2 a cuff's
    for (let i = 0; i < count; i++) {
      if (piping(i)) continue;
      const n = N(i);
      if (dHem[i] < 0.045 && n[0] * rx(i) + n[2] * rz(i) < -0.2 * Math.hypot(rx(i), rz(i))) facing[i] = 1;
      for (const [k, q] of cuffs.entries()) {
        if (!(dCuff[k][i] < 0.04)) continue;
        const r = radial(i, q), rl = Math.hypot(...r) || 1;
        if ((n[0] * r[0] + n[1] * r[1] + n[2] * r[2]) / rl < -0.2) facing[i] = 2;
      }
    }
    // (Only what joins its edge: a fold of the cloth elsewhere facing in is not a hem.)
    for (const [kind, sources] of [[1, free.hem.flatMap((ch) => ch.c)], [2, free.cuff.flatMap((l) => l.flatMap((ch) => ch.c))]]) {
      const keep = new Uint8Array(count), queue = sources.filter((v) => facing[v] === kind);
      for (const v of queue) keep[v] = 1;
      for (let q = 0; q < queue.length; q++) for (const w of nb[queue[q]]) if (facing[w] === kind && !keep[w]) { keep[w] = 1; queue.push(w); }
      for (let i = 0; i < count; i++) if (facing[i] === kind && !keep[i]) facing[i] = 0;
    }

    // ---- The neck band: from its free edge (inside) up over its top and down its outside to its foot, the first crease
    // on its outside (each 1/36 of the way round the neck).
    const neckC = (() => { const pts = free.neck.flatMap((ch) => ch.c); return [0, 2].map((a) => pts.reduce((s, v) => s + R[v * 3 + a], 0) / pts.length); })();
    const angleNeck = (i) => Math.atan2(rx(i) - neckC[0], rz(i) - neckC[1]);
    const outwardNeck = (i) => { const n = N(i), ax = rx(i) - neckC[0], az = rz(i) - neckC[1]; return (n[0] * ax + n[2] * az) / (Math.hypot(ax, az) || 1); };
    const fnorm = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const e1 = [R[b] - R[a], R[b + 1] - R[a + 1], R[b + 2] - R[a + 2]], e2 = [R[c] - R[a], R[c + 1] - R[a + 1], R[c + 2] - R[a + 2]];
      const m = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...m) || 1;
      fnorm.push(m.map((v) => v / l));
    }
    const edgeTris = new Map();
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3], key = a < b ? a * count + b : b * count + a; (edgeTris.get(key) ?? edgeTris.set(key, []).get(key)).push(t / 3); }
    const crease = new Uint8Array(count);
    for (const [key, ts] of edgeTris) {
      if (ts.length !== 2) continue;
      const [f, g] = ts.map((t) => fnorm[t]);
      if (f[0] * g[0] + f[1] * g[1] + f[2] * g[2] < 0.85) { crease[Math.floor(key / count)] = 1; crease[key % count] = 1; }
    }
    const BINS = 36, footD = new Array(BINS).fill(Infinity);
    // (Its top each 1/36 of the way round: the highest point near its edge. The crease of its top fold itself is not its
    // foot: the foot is at least 6 mm under the top.)
    const topY = new Array(BINS).fill(-Infinity);
    for (let i = 0; i < count; i++) if (!piping(i) && dNeck[i] < 0.03) { const k = Math.floor(((angleNeck(i) / (2 * Math.PI)) + 1) * BINS) % BINS; topY[k] = Math.max(topY[k], ry(i)); }
    for (let i = 0; i < count; i++) {
      if (piping(i) || !crease[i] || !(dNeck[i] > 0.012 && dNeck[i] < 0.075) || outwardNeck(i) < 0.2 || ry(i) < 0.8) continue;
      const k = Math.floor(((angleNeck(i) / (2 * Math.PI)) + 1) * BINS) % BINS;
      if (ry(i) > topY[k] - 0.006) continue;
      footD[k] = Math.min(footD[k], dNeck[i]);
    }
    // (Smoothed round the neck: a missed crease takes its neighbours'.)
    const footAt = (i) => {
      const t = ((angleNeck(i) / (2 * Math.PI)) + 1) * BINS - 0.5, k0 = Math.floor(t), f = t - k0;
      const get = (k) => { const v = footD[((k % BINS) + BINS) % BINS]; return Number.isFinite(v) ? v : null; };
      let a = get(k0), b = get(k0 + 1);
      for (let s = 2; a == null && s < 6; s++) a = get(k0 - s + 1);
      for (let s = 2; b == null && s < 6; s++) b = get(k0 + s);
      return (a ?? b ?? 0.03) * (1 - f) + (b ?? a ?? 0.03) * f;
    };
    const band = new Uint8Array(count);
    for (let i = 0; i < count; i++) if (!piping(i) && dNeck[i] <= footAt(i) + 0.0005) band[i] = 1;
    // (Never below its foot where it is tall (its back and back corners: there the way along the cloth from its edge 
    // reached on over the shoulders); each 1/36 of the way round, the band's foot is the lower edge of most of its points
    // there (the median of their lowest fifth, smoothed with the neighbours), and nothing under it is band.)
    const binOf = (i) => Math.floor(((angleNeck(i) / (2 * Math.PI)) + 1) * BINS) % BINS;
    const ys = Array.from({ length: BINS }, () => []);
    for (let i = 0; i < count; i++) if (band[i] && outwardNeck(i) > 0) ys[binOf(i)].push(ry(i));
    const low = ys.map((list) => { if (!list.length) return null; list.sort((a, b) => a - b); return list[Math.floor(list.length * 0.2)]; });
    const lowAt = (k) => { const v = [-1, 0, 1].map((d) => low[(k + d + BINS) % BINS]).filter((q) => q != null).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : -Infinity; };
    let cutBand = 0;
    for (let i = 0; i < count; i++) if (band[i] && outwardNeck(i) > 0 && footAt(i) > 0.025 && ry(i) < lowAt(binOf(i)) - 0.004) { band[i] = 0; cutBand++; }
    // (Bits of band left on their own (cut off from it) are cloth.)
    {
      const seen = new Uint8Array(count);
      for (let s0 = 0; s0 < count; s0++) {
        if (!band[s0] || seen[s0]) continue;
        const group = [s0]; seen[s0] = 1;
        for (let k = 0; k < group.length; k++) for (const w of nb[group[k]]) if (band[w] && !seen[w]) { seen[w] = 1; group.push(w); }
        if (group.length < 40) for (const v of group) { band[v] = 0; cutBand++; }
      }
    }
    log.push(`neck band: ${cutBand} stray points under its foot made cloth`);
    log.push(`neck band: foot ${footD.map((v) => (Number.isFinite(v) ? (v * 1000).toFixed(0) : '-')).join(' ')} mm (model) from its free edge; ${band.reduce((s, v) => s + v, 0)} points`);

    // ---- Front and back: the cloth in front of z = zDiv(x, y) is the front panel's. Below the armpits at the side seams
    // (the model's, at z -0.015), over the shoulders and along the sleeves through the sleeve's middle (its axis), as the
    // pattern's front and back meet along the sleeve's top and underside.
    const ARMPIT = 0.6;
    const sleeveZ = (ax) => lerpTable([[0, -0.05], [0.2, -0.055], [0.3, -0.062], [0.4, -0.08], [0.47, -0.1]], ax);
    const zDiv = (x, y) => { const ax = Math.abs(x), t = Math.max(smoothstep(ARMPIT - 0.06, ARMPIT + 0.03, y), smoothstep(0.27, 0.31, ax)); return -0.015 * (1 - t) + sleeveZ(ax) * t; };
    const front = (i) => rz(i) > zDiv(rx(i), ry(i));
    const triSide = [];
    for (let t = 0; t < I.length; t += 3) triSide.push([I[t], I[t + 1], I[t + 2]].filter((v) => !front(v)).length >= 2 ? 1 : 0);
    // (No islands: a small patch of one half inside the other (a fold reaching past the line) goes to the half round it.)
    const triNb = Array.from({ length: I.length / 3 }, () => []);
    for (const ts of edgeTris.values()) if (ts.length === 2) { triNb[ts[0]].push(ts[1]); triNb[ts[1]].push(ts[0]); }
    for (let pass = 0; pass < 3; pass++) {
      const seen = new Uint8Array(triSide.length);
      for (let t0 = 0; t0 < triSide.length; t0++) {
        if (seen[t0]) continue;
        const group = [t0];
        seen[t0] = 1;
        for (let k = 0; k < group.length; k++) for (const u of triNb[group[k]]) if (!seen[u] && triSide[u] === triSide[t0]) { seen[u] = 1; group.push(u); }
        if (group.length < 400 && !group.some((t) => piping(I[t * 3]))) for (const t of group) triSide[t] = 1 - triSide[t];
      }
    }

    // ---- The pattern's edges (front outline, + x side; the back's the same but its raised neck), as point runs.
    const O = made.outline.map((p) => [p.x, p.y]), BO = (made.backOutline ?? made.outline).map((p) => [p.x, p.y]);
    const near = (poly, x, y, from = 0, to = poly.length) => { let best = from; for (let k = from; k < to; k++) if (Math.hypot(poly[k][0] - x, poly[k][1] - y) < Math.hypot(poly[best][0] - x, poly[best][1] - y)) best = k; return best; };
    const half = O.findIndex(([x], k) => k > 10 && x < 0);   // the first point of the - x side (past the hem's middle)
    const iNeck = near(O, 0.088, 0.738, 0, 40), iCuffTop = near(O, 0.418, 0.566, 0, 100), iCuffLow = near(O, 0.37, 0.476, 0, 100), iPit = near(O, 0.258, 0.531, 0, 120), iHem = near(O, 0.258, 0.031, 100, half);
    const run = (poly, a, b) => { const out = []; for (let k = a; k <= b; k++) out.push(poly[k]); return out; };
    const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
    const at = (pts, t) => {
      // The point at share t (0..1) of the way along a run.
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
      hem: [...run(poly, iHem, half - 1), ...mirror(run(poly, iHem, half - 1)).reverse().slice(1)].reverse(),   // from - x to + x
      neck: (() => { const e = (poly === BO ? made.backNeckEdge : made.neckEdge) ?? made.neckEdge; return e.map((p) => [p.x, p.y]); })(),
    });
    const E = [edgesOf(O), edgesOf(BO)];
    log.push(`pattern: neck point ${iNeck}, cuff ${iCuffTop}-${iCuffLow}, armpit ${iPit}, hem corner ${iHem}`);

    // ---- The pins: each point of the model's edges and seams and where it goes on the pattern ([x, y], per half).
    const pins = [new Map(), new Map()];
    const pinKind = [new Map(), new Map()];
    let kindNow = '';
    const pin = (h, i, xy) => { pins[h].set(i, xy); pinKind[h].set(i, kindNow); };
    // Points of a half: those of its triangles.
    const inHalf = [new Uint8Array(count), new Uint8Array(count)];
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) inHalf[triSide[t / 3]][I[t + k]] = 1;
    const outer = (i) => !piping(i) && !facing[i] && !band[i];
    // A ring of points sorted round an axis and spread by their length along it: share of the way for each.
    // (The ring's ends: its first and last points on both halves (where it meets the seams between them); points past an
    // end take that end's share.)
    const shares = (list, angle) => {
      const s = list.slice().sort((a, b) => angle(a) - angle(b));
      const ends = s.map((v, k) => (inHalf[0][v] && inHalf[1][v] ? k : -1)).filter((k) => k >= 0);
      const a = ends.length ? ends[0] : 0, b = ends.length > 1 ? ends.at(-1) : s.length - 1, L = new Array(s.length).fill(0);
      for (let k = a + 1; k <= b; k++) L[k] = L[k - 1] + rd(s[k], s[k - 1]);
      for (let k = b + 1; k < s.length; k++) L[k] = L[b];
      return new Map(s.map((v, k) => [v, L[b] ? L[k] / L[b] : 0]));
    };
    for (const h of [0, 1]) {
      const e = E[h];
      // The hem's fold: the outside points next to the turned-in hem, round the body from the wearer's right.
      kindNow = 'hem';
      const hemFold = [];
      for (let i = 0; i < count; i++) if (inHalf[h][i] && outer(i) && dHem[i] < 0.06 && nb[i].some((w) => facing[w] === 1)) hemFold.push(i);
      // (Seen from outside: the front from the wearer's right (- x) to the left; the back too, by x.)
      for (const [v, t] of shares(hemFold, (i) => Math.atan2(rx(i), h ? -rz(i) : rz(i)))) pin(h, v, at(e.hem, t));
      // The cuffs' folds: round each sleeve from its underside (at the axis's level, below) to its top.
      kindNow = 'cuff';
      for (const [k, q] of cuffs.entries()) {
        const fold = [];
        for (let i = 0; i < count; i++) if (inHalf[h][i] && outer(i) && dCuff[k][i] < 0.05 && nb[i].some((w) => facing[w] === 2)) fold.push(i);
        // (The angle round the axis from straight down, up the front (or the back) to straight up.)
        const ang = (i) => { const r = radial(i, q); return Math.atan2(Math.abs(r[2]), -r[1]); };
        for (const [v, t] of shares(fold, ang)) pin(h, v, ((xy) => [q.s * xy[0], xy[1]])(at(e.cuff.slice().reverse(), t)));
      }
      // The neck band's foot: the cloth's points next to the band, round the neck from the wearer's right.
      kindNow = 'neck';
      const foot = [];
      // (Not the points well under it: bits cut off the band (above) are not its foot.)
      for (let i = 0; i < count; i++) if (inHalf[h][i] && outer(i) && nb[i].some((w) => band[w]) && ry(i) >= lowAt(binOf(i)) - 0.008) foot.push(i);
      // (By the angle round the neck between the ring's ends, not by its length: a ring that zigzags would shift the
      // pattern's middle off the model's.)
      const ang = (i) => Math.atan2(rx(i) - neckC[0], h ? neckC[1] - rz(i) : rz(i) - neckC[1]);
      const ends = foot.filter((i) => inHalf[0][i] && inHalf[1][i]).map(ang).sort((a, b) => a - b);
      const a0 = ends.length > 1 ? ends[0] : Math.min(...foot.map(ang)), a1 = ends.length > 1 ? ends.at(-1) : Math.max(...foot.map(ang));
      for (const v of foot) pin(h, v, at(e.neck, Math.min(1, Math.max(0, (ang(v) - a0) / (a1 - a0 || 1)))));
    }
    // The seams between the halves: each point on both (its triangles on both sides), outside, by where it is: the side
    // seams (below the armpit, by height), the sleeves' undersides (from the armpit out, by the way along the sleeve) and
    // the tops (from the neck out over the shoulder and along the sleeve's top, by the way out).
    const sewn = [];
    for (let i = 0; i < count; i++) if (inHalf[0][i] && inHalf[1][i] && outer(i) && !pins[0].has(i) && !pins[1].has(i)) sewn.push(i);
    // (The side seams start at the hem's fold there: its points on both halves, each side.)
    const hemEnd = [1, -1].map((sg) => { const ys = []; for (let i = 0; i < count; i++) if (pinKind[0].get(i) === 'hem' && inHalf[1][i] && sg * rx(i) > 0) ys.push(ry(i)); return ys.length ? ys.reduce((q, v) => q + v, 0) / ys.length : 0.02; });
    const hemY = (i) => hemEnd[rx(i) > 0 ? 0 : 1];
    // (Which seam: the side seams below the armpits; on a sleeve within 12 cm of its cuff, its underside on the side towards
    // the body (seen across its axis), else the shoulder's and sleeve's top. Each seam's share of the way: the side seams'
    // by height from the hem's fold to the armpit, the undersides' by the way along the cloth from the cuff, the tops' by
    // the way along the cloth from the neck band.)
    const dNeckFar = along(free.neck.flatMap((ch) => ch.c), 0.9);
    const seamOf = (i) => {
      const s = rx(i) < 0 ? -1 : 1, q = cuffs[s > 0 ? 0 : 1], ax = Math.abs(rx(i));
      if (ry(i) < ARMPIT && ax < 0.29) return 'side';
      const v = [rx(i) - q.c[0], ry(i) - q.c[1], rz(i) - q.c[2]], tt = v[0] * q.d[0] + v[1] * q.d[1] + v[2] * q.d[2];
      if (tt < -0.12) return 'top';
      const r = radial(i, q), out = [s * Math.abs(q.d[1]), Math.abs(q.d[0])];
      return r[0] * out[0] + r[1] * out[1] > 0 ? 'top' : 'under';
    };
    const range = new Map();
    for (const i of sewn) {
      const kind = seamOf(i), s = rx(i) < 0 ? -1 : 1, key = `${kind}${s}`, d = kind === 'top' ? dNeckFar[i] : kind === 'under' ? dCuff[s > 0 ? 0 : 1][i] : ry(i);
      if (!Number.isFinite(d)) continue;
      const r = range.get(key) ?? [Infinity, -Infinity];
      range.set(key, [Math.min(r[0], d), Math.max(r[1], d)]);
    }
    for (const i of sewn) {
      const kind = seamOf(i), s = rx(i) < 0 ? -1 : 1, [d0, d1] = range.get(`${kind}${s}`) ?? [0, 1];
      kindNow = kind;
      let xy;
      if (kind === 'side') xy = at(E[0].side.slice().reverse(), (ry(i) - hemY(i)) / (ARMPIT - hemY(i)));
      else if (kind === 'under') { const d = dCuff[s > 0 ? 0 : 1][i]; if (!Number.isFinite(d)) continue; xy = at(E[0].under, (d - d0) / (d1 - d0)); }
      else { const d = dNeckFar[i]; if (!Number.isFinite(d)) continue; xy = at(E[0].top, (d - d0) / (d1 - d0)); }
      for (const h of [0, 1]) pin(h, i, [s * xy[0], xy[1]]);
    }
    log.push(`seams: ${[...range].map(([k, [a, b]]) => `${k} ${a.toFixed(3)}..${b.toFixed(3)}`).join(', ')}`);
    // The front's raglan seams: the model's (its cracks and creases and the piping strip there), each side's line by height
    // (from the neck band's foot down to the armpit), onto ours by their share of the way down.
    const guide = [[0.10, 0.925], [0.17, 0.875], [0.25, 0.82], [0.282, 0.76], [0.287, 0.70], [0.272, 0.655], [0.263, 0.63]];
    const guideX = (y) => lerpTable(guide.map(([x, yy]) => [yy, x]).reverse(), y);
    const isOpen = new Uint8Array(count);
    for (const [key, ts] of edgeTris) if (ts.length === 1) { isOpen[Math.floor(key / count)] = 1; isOpen[key % count] = 1; }
    const raglan = [];
    for (const s of [1, -1]) {
      const cand = [];
      for (let i = 0; i < count; i++) {
        if (s * rx(i) <= 0 || rz(i) < -0.05 || ry(i) < 0.62 || ry(i) > 0.93) continue;
        if (Math.abs(s * rx(i) - guideX(ry(i))) > 0.015) continue;
        // (Its crack below the shoulder, its crease above it; on the wearer's right the piping strip over it.)
        if (piping(i) || isOpen[i] || (crease[i] && ry(i) > 0.81)) cand.push(i);
      }
      // The line: each 5 mm of height, the middle of the candidates there.
      const line = [];
      for (let y = 0.63; y <= 0.93; y += 0.005) {
        const here = cand.filter((i) => Math.abs(ry(i) - y) < 0.004);
        if (here.length < (ry(here[0] ?? 0) > 0.81 ? 2 : 1)) continue;
        const xs = here.map((i) => s * rx(i)).sort((a, b) => a - b), zs = here.map((i) => rz(i)).sort((a, b) => a - b);
        line.push([xs[xs.length >> 1], y, zs[zs.length >> 1]]);
      }
      // (Smoothed over 3 rows.)
      const L = line.map((p, k) => [0, 1, 2].map((a) => (line[Math.max(0, k - 1)][a] + p[a] + line[Math.min(line.length - 1, k + 1)][a]) / 3));
      const yTop = L.at(-1)[1], yLow = L[0][1];
      raglan.push({ s, line: L, yTop, yLow });
      const seam = raglanSeamPts(s);
      kindNow = 'raglan';
      let n = 0;
      // (Its length from the neck down, and each point's nearest place on it: the share of the way there.)
      const Ld = [0];
      for (let k = 1; k < L.length; k++) Ld.push(Ld[k - 1] + Math.hypot(...[0, 1, 2].map((a) => L[k][a] - L[k - 1][a])));
      const onLine = (q) => {
        let best = { d: Infinity, t: 0 };
        for (let k = 1; k < L.length; k++) {
          const a = L[k - 1], b = L[k], e = [0, 1, 2].map((c) => b[c] - a[c]), el = e[0] ** 2 + e[1] ** 2 + e[2] ** 2 || 1;
          const u = Math.max(0, Math.min(1, ((q[0] - a[0]) * e[0] + (q[1] - a[1]) * e[1] + (q[2] - a[2]) * e[2]) / el));
          const d = Math.hypot(...[0, 1, 2].map((c) => q[c] - a[c] - u * e[c]));
          if (d < best.d) best = { d, t: 1 - (Ld[k - 1] + u * Math.sqrt(el)) / Ld.at(-1) };
        }
        return best;
      };
      for (let i = 0; i < count; i++) {
        if (!outer(i) || !inHalf[0][i] || inHalf[1][i] || pins[0].has(i) || s * rx(i) <= 0 || ry(i) < yLow - 0.005 || ry(i) > yTop + 0.005) continue;
        const o = onLine([s * rx(i), ry(i), rz(i)]);
        // (Only the points on it: its crack's edges, else within 2.5 mm; a wider strip held on one line would pinch the cloth.)
        if (o.d > (isOpen[i] ? 0.006 : 0.0025)) continue;
        // (The model's seam ends 3 cm above its side seam's top: ours stops that much short of the armpit, so the cloth
        // between (the front of the armpit) has room on the sleeve's side of it.)
        const xy = at(seam, o.t * RAGLAN_END);
        pin(0, i, [s * xy[0], xy[1]]);
        n++;
      }
      if (process.env.FBDBG) for (let i = 0; i < count; i++) if (isOpen[i] && s * rx(i) > 0.24 && ry(i) > 0.62 && ry(i) < 0.82 && rz(i) > 0) log.push(`  crack ${i} ${[rx(i), ry(i), rz(i)].map((v) => v.toFixed(3))} outer ${outer(i)} h0 ${inHalf[0][i]} h1 ${inHalf[1][i]} pin ${pinKind[0].get(i) ?? '-'} d ${onLine([s * rx(i), ry(i), rz(i)]).d.toFixed(4)} t ${onLine([s * rx(i), ry(i), rz(i)]).t.toFixed(2)}`);
      log.push(`raglan ${s > 0 ? 'left' : 'right'}: line ${L.length} rows, y ${yLow.toFixed(3)}..${yTop.toFixed(3)}, ${(Ld.at(-1) * 100).toFixed(1)} cm, ${n} points pinned`);
      // The back's raglan line: the model has none modelled there (only its front seams), so the sleeve's colour would meet
      // the body anywhere the map put it (patches over the shoulder from the side). The front's line seen from behind (the
      // same x and height on the back) is held on our raglan seam there too, so the back's edge is as clean and even.
      kindNow = 'raglanBack';
      const L2 = L.map(([x, y]) => [x, y]), L2d = [0];
      for (let k = 1; k < L2.length; k++) L2d.push(L2d[k - 1] + Math.hypot(L2[k][0] - L2[k - 1][0], L2[k][1] - L2[k - 1][1]));
      let nb2 = 0;
      for (let i = 0; i < count; i++) {
        if (!outer(i) || !inHalf[1][i] || inHalf[0][i] || pins[1].has(i) || s * rx(i) <= 0 || rz(i) > neckC[1] || ry(i) < yLow || ry(i) > yTop) continue;
        let best = { d: Infinity, t: 0 };
        for (let k = 1; k < L2.length; k++) {
          const a = L2[k - 1], b = L2[k], ex = b[0] - a[0], ey = b[1] - a[1], el = ex * ex + ey * ey || 1;
          const u = Math.max(0, Math.min(1, ((s * rx(i) - a[0]) * ex + (ry(i) - a[1]) * ey) / el)), d = Math.hypot(s * rx(i) - a[0] - u * ex, ry(i) - a[1] - u * ey);
          if (d < best.d) best = { d, t: 1 - (L2d[k - 1] + u * Math.sqrt(el)) / L2d.at(-1) };
        }
        if (best.d > 0.003) continue;
        const xy = at(seam, best.t * RAGLAN_END);
        pin(1, i, [s * xy[0], xy[1]]);
        nb2++;
      }
      log.push(`raglan ${s > 0 ? 'left' : 'right'} on the back: ${nb2} points pinned`);
    }
    function raglanSeamPts(s) {
      const out = [];
      for (let k = 0; k <= 48; k++) { const t = k / 48, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; out.push([a * RAGLAN_NECK[0] + b * RAGLAN_CONTROL[0] + c * RAGLAN_UNDER[0], a * RAGLAN_NECK[1] + b * RAGLAN_CONTROL[1] + c * RAGLAN_UNDER[1]]); }
      return out;
    }
    log.push(`pins: front ${pins[0].size}, back ${pins[1].size} (seams ${sewn.length})`);

    // ---- Each half laid flat: a conformal map (least squares) of its triangles (not the band's, not the piping's) with
    // its pins held. Conjugate gradients on the normal equations.
    const F = [new Float64Array(count * 2), new Float64Array(count * 2)], solved = [new Uint8Array(count), new Uint8Array(count)];
    for (const h of [0, 1]) {
      const tris = [];
      for (let t = 0; t < I.length; t += 3) {
        if (triSide[t / 3] !== h) continue;
        const c = [I[t], I[t + 1], I[t + 2]];
        if (c.some((v) => piping(v) || band[v])) continue;
        tris.push(c);
      }
      const used = new Map();
      for (const c of tris) for (const v of c) if (!used.has(v)) used.set(v, used.size);
      const m = used.size, fixed = new Uint8Array(m), val = new Float64Array(m * 2);
      for (const [v, k] of used) { const p = pins[h].get(v); if (p) { fixed[k] = 1; val[k * 2] = p[0]; val[k * 2 + 1] = p[1]; } }
      // Each triangle's coefficients: S = sum_j z_j (w_{j+1} - w_{j+2}) / (4 sqrt(area)), w its own flat corners (seen from
      // outside; the back's mirrored, as the pattern's back is seen from the front).
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
      // M z: per triangle, real = sum p u - q v, imag = sum q u + p v.
      const apply = (z, out) => {
        out.fill(0);
        for (const { k, coef } of rows) {
          let re = 0, im = 0;
          for (let j = 0; j < 3; j++) { const u = z[k[j] * 2], v = z[k[j] * 2 + 1], [p, q] = coef[j]; re += p * u - q * v; im += q * u + p * v; }
          for (let j = 0; j < 3; j++) { const [p, q] = coef[j]; out[k[j] * 2] += p * re + q * im; out[k[j] * 2 + 1] += -q * re + p * im; }
        }
      };
      // A x = -A_fixed val, unknowns the free points (fixed ones held at their values).
      const x = new Float64Array(m * 2);
      // (Start: the pins, the rest from the nearest pin's place.)
      const start = new Float64Array(m * 2);
      for (const [v, k] of used) {
        if (fixed[k]) { start[k * 2] = val[k * 2]; start[k * 2 + 1] = val[k * 2 + 1]; continue; }
        start[k * 2] = rx(v) * scale; start[k * 2 + 1] = ry(v) * scale;
      }
      x.set(start);
      const Ax = new Float64Array(m * 2), r = new Float64Array(m * 2), z = new Float64Array(m * 2), pv = new Float64Array(m * 2), Ap = new Float64Array(m * 2);
      const diag = new Float64Array(m * 2).fill(1e-12);
      for (const { k, coef } of rows) for (let j = 0; j < 3; j++) { const [p, q] = coef[j]; diag[k[j] * 2] += p * p + q * q; diag[k[j] * 2 + 1] += p * p + q * q; }
      const mask = (vec) => { for (let k = 0; k < m; k++) if (fixed[k]) { vec[k * 2] = 0; vec[k * 2 + 1] = 0; } };
      apply(x, Ax);
      for (let i = 0; i < m * 2; i++) r[i] = -Ax[i];
      mask(r);
      for (let i = 0; i < m * 2; i++) { z[i] = r[i] / diag[i]; pv[i] = z[i]; }
      let rz = 0;
      for (let i = 0; i < m * 2; i++) rz += r[i] * z[i];
      const r0 = rz;
      let it = 0;
      for (; it < 20000 && rz > r0 * 1e-16; it++) {
        apply(pv, Ap);
        mask(Ap);
        let pAp = 0;
        for (let i = 0; i < m * 2; i++) pAp += pv[i] * Ap[i];
        const alpha = rz / pAp;
        let rz2 = 0;
        for (let i = 0; i < m * 2; i++) { x[i] += alpha * pv[i]; r[i] -= alpha * Ap[i]; z[i] = r[i] / diag[i]; rz2 += r[i] * z[i]; }
        const beta = rz2 / rz;
        rz = rz2;
        for (let i = 0; i < m * 2; i++) pv[i] = z[i] + beta * pv[i];
      }
      for (const [v, k] of used) { F[h][v * 2] = x[k * 2]; F[h][v * 2 + 1] = x[k * 2 + 1]; solved[h][v] = 1; }
      log.push(`${h ? 'back' : 'front'}: ${tris.length} triangles, ${m} points (${fixed.reduce((s, v) => s + v, 0)} pinned), ${it} steps`);
    }

    // ---- The turned-in hem and cuffs: mirrored back over the pattern's edge (inside the cloth there).
    const hemAt = (h, x) => lerpTable(E[h].hem.map(([a, b]) => [a, b]).sort((p, q) => p[0] - q[0]), x);
    for (const h of [0, 1]) for (let i = 0; i < count; i++) {
      if (!facing[i]) continue;
      const f = F[h];
      if (facing[i] === 1) { const y0 = hemAt(h, f[i * 2]); if (f[i * 2 + 1] < y0) f[i * 2 + 1] = 2 * y0 - f[i * 2 + 1]; continue; }
      // (The cuff's line on the pattern, straight from its top corner to its foot: mirrored to the sleeve's side of it.)
      const s = f[i * 2] < 0 ? -1 : 1, [ax, ay] = E[h].cuff[0], [bx, by] = E[h].cuff.at(-1);
      const ex = bx - ax, ey = by - ay, el = Math.hypot(ex, ey), nx = -ey / el, ny = ex / el;   // (normal pointing out of the sleeve)
      // (Mirrored to within 6 mm of the edge, however deep the turned-in cuff: the cuff's stripe (FB_CUFF_STRIPE, from
      // 7.5 mm in) is printed on its outside only.)
      const px = s * f[i * 2] - ax, py = f[i * 2 + 1] - ay, d = px * nx + py * ny, e = 0.006 * (1 - Math.exp(-Math.abs(d) / 0.006));
      f[i * 2] = s * (s * f[i * 2] - (d + e) * nx); f[i * 2 + 1] -= (d + e) * ny;
    }

    // ---- The outside of the cloth always inside the pattern: a point the map put past its outline (in the folds at the
    // armpits, by the neck band's foot, over a shoulder) goes to the nearest place on the outline, 1 mm in, so it is
    // printed with the colour at that edge (no other colour from past the edge, which streaked by the neck and armpits).
    const inside = (poly, x, y) => { let c = false; for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const [xa, ya] = poly[a], [xb, yb] = poly[b]; if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) c = !c; } return c; };
    let pulledIn = 0;
    for (const h of [0, 1]) {
      const poly = h ? BO : O;
      for (let i = 0; i < count; i++) {
        if (!solved[h][i] || !outer(i) || facing[i]) continue;
        const f = F[h], x = f[i * 2], y = f[i * 2 + 1];
        if (inside(poly, x, y)) continue;
        let best = null;
        for (let k = 0; k < poly.length; k++) {
          const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % poly.length], ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
          const qx = ax + ex * t, qy = ay + ey * t, d = Math.hypot(x - qx, y - qy);
          if (!best || d < best.d) best = { d, qx, qy };
        }
        if (!best || best.d > 0.12) continue;
        const k = 0.001 / (best.d || 1);
        f[i * 2] = best.qx - (x - best.qx) * k; f[i * 2 + 1] = best.qy - (y - best.qy) * k;
        pulledIn++;
      }
    }
    log.push(`${pulledIn} outside points past the pattern's outline pulled onto it`);

    // ---- The band and the piping: the band printed from its swatch (its places only for picking: the nearest foot's);
    // the piping from the cloth under it (the nearest cloth point's place).
    const cloth = [];
    for (let i = 0; i < count; i++) if (!piping(i) && !band[i]) cloth.push(i);
    const grid = new Map(), G = 0.01, gk = (x, y, z) => `${Math.floor(x / G)},${Math.floor(y / G)},${Math.floor(z / G)}`;
    for (const i of cloth) { const k = gk(rx(i), ry(i), rz(i)); (grid.get(k) ?? grid.set(k, []).get(k)).push(i); }
    const nearestCloth = (i, ok = () => true) => {
      let best = -1, bd = Infinity;
      for (let r = 1; r <= 6 && best < 0; r++) {
        const [cx, cy, cz] = [rx(i), ry(i), rz(i)].map((v) => Math.floor(v / G));
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) for (const j of grid.get(`${cx + a},${cy + b},${cz + c}`) ?? []) {
          if (!ok(j)) continue;
          const d = rd(i, j);
          if (d < bd) { bd = d; best = j; }
        }
      }
      return best;
    };
    const sideOf = new Uint8Array(count);
    for (let i = 0; i < count; i++) sideOf[i] = front(i) ? 0 : 1;
    // (The band's foot points per half, with their places: the pins on the neck edge.)
    const feet = [0, 1].map((h) => [...pins[h].keys()].filter((c) => nb[c].some((w) => band[w])));
    for (let i = 0; i < count; i++) {
      if (!piping(i) && !band[i]) continue;
      let h = sideOf[i], j = -1;
      if (band[i]) {
        for (const hh of [h, 1 - h]) { let bd = Infinity; for (const c of feet[hh]) { const d = rd(i, c); if (d < bd) { bd = d; j = c; } } if (j >= 0) { h = hh; break; } }
        if (j < 0) continue;
        F[h][i * 2] = pins[h].get(j)[0]; F[h][i * 2 + 1] = pins[h].get(j)[1]; solved[h][i] = 1;
      } else {
        j = nearestCloth(i, (c) => !facing[c] && solved[0][c]);
        if (j < 0) continue;
        h = 0;
        F[0][i * 2] = F[0][j * 2]; F[0][i * 2 + 1] = F[0][j * 2 + 1]; solved[0][i] = 1;
      }
      sideOf[i] = h;
    }

    // (Any point left without a place (a cloth point whose triangles all touch the band): its pin's, else the nearest placed
    // point's.)
    for (let i = 0; i < count; i++) {
      if (solved[0][i] || solved[1][i]) continue;
      const h = sideOf[i], p = pins[h].get(i) ?? pins[1 - h].get(i);
      if (p) { F[h][i * 2] = p[0]; F[h][i * 2 + 1] = p[1]; solved[h][i] = 1; continue; }
      let best = -1, bd = Infinity;
      for (let j = 0; j < count; j++) if (solved[h][j]) { const d = rd(i, j); if (d < bd) { bd = d; best = j; } }
      if (best >= 0) { F[h][i * 2] = F[h][best * 2]; F[h][i * 2 + 1] = F[h][best * 2 + 1]; solved[h][i] = 1; }
    }

    // ---- The shade: the made jersey's baked shade nearest each point, smoothed over a few cm (none of its folds).
    const madeShade = madeSurface(made, 0.02);
    let S = new Float64Array(count);
    for (let i = 0; i < count; i++) S[i] = madeShade.nearest(P(i), N(i), { turn: 0.03 }).shade;
    for (let it = 0; it < 25; it++) { const T = new Float64Array(count); for (let i = 0; i < count; i++) { let s = S[i]; for (const j of nb[i]) s += S[j]; T[i] = s / (nb[i].length + 1); } S = T; }

    // ---- The points written: each with its half's place; a point on both halves (the seams) twice, one per half.
    // ---- Across the neck band (for a collar's stripes and tips, tripomesh.js): 0 at its foot on the cloth, 1 at its top
    // fold, on past 1 down its inside (each 1/36 of the way round: its foot's and its top's way along the cloth from its
    // free edge).
    const topD = new Array(BINS).fill(-1);
    for (let i = 0; i < count; i++) if (band[i]) { const k = Math.floor(((angleNeck(i) / (2 * Math.PI)) + 1) * BINS) % BINS; if (topD[k] < 0 || ry(i) > ry(topD[k])) topD[k] = i; }
    const across = (i) => {
      const k = Math.floor(((angleNeck(i) / (2 * Math.PI)) + 1) * BINS) % BINS, f = footAt(i), t = topD[k] >= 0 ? dNeck[topD[k]] : f / 2;
      if (dNeck[i] >= t) return Math.max(0, (f - dNeck[i]) / Math.max(1e-4, f - t));
      return 1 + (t - dNeck[i]) / Math.max(1e-4, f - t);
    };
    const OP = [], ON = [], OF = [], OB = [], OS = [], OBand = [], OAcross = [], idx = [], copy = new Map();
    const out = (i, h) => {
      const key = i * 2 + h;
      if (copy.has(key)) return copy.get(key);
      const k = OP.length / 3;
      copy.set(key, k);
      // (A point solved only in the other half (a triangle at the band or the piping): that half's place.)
      const g = solved[h][i] || !solved[1 - h][i] ? h : 1 - h;
      OP.push(...P(i)); ON.push(...N(i)); OF.push(F[g][i * 2], F[g][i * 2 + 1]); OB.push(h | (piping(i) ? 2 : 0)); OS.push(S[i]); OAcross.push(band[i] ? Math.min(255, Math.round(across(i) * 100)) : 0); OBand.push(band[i]);
      return k;
    };
    for (let t = 0; t < I.length; t += 3) {
      const c = [I[t], I[t + 1], I[t + 2]], h = c.some((v) => band[v] || piping(v)) ? (c.filter((v) => sideOf[v]).length >= 2 ? 1 : 0) : triSide[t / 3];
      idx.push(...c.map((v) => out(v, h)));
    }
    log.push(`${OP.length / 3} points written (${OP.length / 3 - count} seam copies)`);

    // ---- The neck opening's rim: the band's top (its highest point each 1/48 of the way round), for the form and the
    // label; the band's free edge (inside) as the binding run.
    const rimBins = new Array(48).fill(-1);
    for (let i = 0; i < count; i++) {
      if (!band[i]) continue;
      const k = Math.floor(((angleNeck(i) / (2 * Math.PI)) + 1) * 48) % 48;
      if (rimBins[k] < 0 || ry(i) > ry(rimBins[k])) rimBins[k] = i;
    }
    const neck = rimBins.filter((v) => v >= 0).map((v) => P(v).map((q) => +q.toFixed(5)));
    // The band's foot round the neck (the cloth's edge where the band is sewn on, each 1/48 of the way round: its points
    // next to the band, the lowest in each), for a collar sewn on in its place (tripomesh.js tripoShape dropBand).
    const footBins = new Array(48).fill(-1);
    for (const h of [0, 1]) for (const [i, kind] of pinKind[h]) {
      if (kind !== 'neck') continue;
      const k = Math.floor(((angleNeck(i) / (2 * Math.PI)) + 1) * 48) % 48;
      if (footBins[k] < 0 || ry(i) < ry(footBins[k])) footBins[k] = i;
    }
    const foot = footBins.filter((v) => v >= 0).map((v) => P(v).map((q) => +q.toFixed(5)));

    if (debug) {
      const fs = await import('node:fs');
      const Fd = [], Bd = [];
      for (let i = 0; i < OP.length / 3; i++) { Fd.push(+OF[i * 2].toFixed(5), +OF[i * 2 + 1].toFixed(5)); Bd.push(OB[i] & 1); }
      const pinsOut = [0, 1].map((h) => [...pins[h]].map(([i, xy]) => [xy[0], xy[1], pinKind[h].get(i)]));
      fs.writeFileSync(`${debug}/flat-debug.json`, JSON.stringify({ pins: pinsOut, F: Fd, back: Bd, pos: OP.map((v) => +v.toFixed(5)), band: OBand, idx, outline: O, backOutline: BO }));
    }
    const swatch = lib.FB_SWATCH;
    return {
      data: {
        pos: Float32Array.from(OP), nor: Float32Array.from(ON), flat: Float64Array.from(OF), back: Uint8Array.from(OB), shade: Float64Array.from(OS), idx,
        extra: { scale: +scale.toFixed(6), move: move.map((v) => +v.toFixed(6)), neck, foot, band: Buffer.from(Uint8Array.from(OBand).buffer).toString("base64"), across: Buffer.from(Uint8Array.from(OAcross).buffer).toString("base64"), swatch, halves: true },
      },
      report: log.join('\n'),
    };
  },
};
