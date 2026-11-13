// The Rugby League playing shorts' ready-made model (Tripo, 2026-11-13; tripo-convert.mjs): the model's own points,
// triangles and normals, placed with one uniform scale and a move where the made shorts stand (garment.js SPECS.shorts),
// printed through the made shorts' flat pattern (texture.js: body, the hem bindings, the waistband, number and marks).
//
// Where each point is on the flat pattern: the model is unrolled as cloth is, round each leg (below the crotch) from the
// inner leg seam over the front to the side seam and on round the back, and round the body above from the centre front.
// The share of the way round, measured along the cross-section (an ellipse fitted to each 1 % slice of the model), is
// the share across our panel at that height. The seams are the model's own: the side seam a little in front of the
// widest point (SIDE_Z), the inner leg seam straight inside (z 0). Heights go per column: the model's hem edge onto our
// hem (1.5 mm inside it), its hem binding's top (BINDING above the edge) onto a level line HEM_TOP up (the shorts' Hem
// part there: zones.js useModelHem, main.js RL_HEM), the crotch onto ours; above it the body up to the foot of the model's waistband, and its waistband (from its foot to the
// top edge, both slanting down to the front) onto our printed waistband (the rim's width under the waist).
const SIDE_Z = 0.037, BINDING = 0.047;
// Our pattern (SPECS.shorts.half): the side seam, the inner leg seam and the hem as the made shorts' outline.
const SIDE = [[0.002, 0.29], [0.012, 0.302], [0.035, 0.3], [0.095, 0.286], [0.17, 0.262], [0.27, 0.236], [0.35, 0.215]];
const INNER = [[0.01, 0.045], [0.035, 0.022], [0.06, 0.008], [0.072, 0]];
const HEM = [[0.036, 0.015], [0.043, 0.011], [0.051, 0.008], [0.068, 0.005], [0.093, 0.003], [0.127, 0.001], [0.144, 0], [0.22, 0], [0.263, 0.001], [0.288, 0.002], [0.297, 0.003], [0.302, 0.008]];
// The flat heights: crotch, the hem binding's top (level; main.js RL_HEM), the waistband's foot and top (the made shorts'
// waist 0.35 less the rim's 4 cm, as texture.js prints it for the model: modelBand).
const CROTCH = 0.072, HEM_TOP = 0.024, BAND_FOOT = 0.3105, BAND_TOP = 0.3495;

export default {
  model: '../../tripo/rugby-shorts.glb',
  lib: "export { buildGarment, SPECS } from './garment.js';",
  async convert({ glb, lib, tools, debug }) {
    const made = lib.buildGarment('shorts', { spec: lib.SPECS.shorts, detail: true });
    made.geometry.computeBoundingBox();
    const box = made.geometry.boundingBox;
    const M = glb.pos, n = M.length / 3, I = glb.idx;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const lerpTable = (table, x) => {
      if (x <= table[0][0]) return table[0][1];
      for (let i = 1; i < table.length; i++) if (x <= table[i][0]) { const [x0, y0] = table[i - 1], [x1, y1] = table[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1); }
      return table[table.length - 1][1];
    };
    const sideX = (y) => lerpTable(SIDE, y), innerX = (y) => (y >= CROTCH ? 0 : lerpTable(INNER, y)), hemY = (x) => lerpTable(HEM, x);
    // Arc length along an ellipse (half-axes a across, b front to back) from its front (t = 0) to parameter t.
    const arc = (a, b, t) => {
      const steps = Math.max(2, 2 * Math.ceil(Math.abs(t) / (Math.PI / 24))), h = t / steps;
      const f = (s) => Math.sqrt(a * a * Math.cos(s) ** 2 + b * b * Math.sin(s) ** 2);
      let sum = f(0) + f(t);
      for (let k = 1; k < steps; k++) sum += f(k * h) * (k % 2 ? 4 : 2);
      return (sum * h) / 3;
    };
    const param = (a, b, psi) => Math.atan2(b * Math.sin(psi), a * Math.cos(psi));
    // The ellipse's parameter where its outer (inner) side crosses z (x = a sin t, z = cz + b cos t).
    const atZ = (L, z, inner = false) => (inner ? -1 : 1) * Math.acos(clamp((z - L.cz) / L.b, -0.999, 0.999));

    let top = -Infinity, bottom = Infinity;
    for (let i = 0; i < n; i++) { top = Math.max(top, M[i * 3 + 1]); bottom = Math.min(bottom, M[i * 3 + 1]); }
    const H = top - bottom;
    // The model's crotch: the lowest point down the middle.
    let crotch = Infinity;
    for (let i = 0; i < n; i++) if (Math.abs(M[i * 3]) < 0.012 * H) crotch = Math.min(crotch, M[i * 3 + 1]);
    const hc = crotch;

    // Its open edges: the two leg hems (low), the waist's top edge (the highest ring), the waistband's foot (its lower
    // edge, a ring across the body under it) and the body's top edge tucked under that foot.
    const chains = tools.openChains(I).filter((c) => c.length >= 40);
    const meanY = (c) => c.reduce((s, i) => s + M[i * 3 + 1], 0) / c.length;
    chains.sort((a, b) => meanY(a) - meanY(b));
    const hemChains = chains.filter((c) => meanY(c) < bottom + 0.2 * H), waist = chains.filter((c) => meanY(c) > bottom + 0.6 * H);
    if (hemChains.length !== 2 || waist.length !== 3) throw new Error(`unexpected open edges: ${chains.map((c) => `${c.length}@${meanY(c).toFixed(3)}`).join(' ')}`);
    const topRing = waist.reduce((a, b) => (meanY(a) > meanY(b) ? a : b));
    const [footRing, bodyRing] = waist.filter((c) => c !== topRing).sort((a, b) => a.length - b.length);
    const hemSet = new Set(hemChains.flat()), footSet = new Set(footRing), bodyEdge = new Set(bodyRing);

    // Cross-sections every 1 %: per leg (s = +1 the wearer's left, +x) and per half body (about x = 0).
    const S = [];
    for (let k = 0; k <= 100; k++) {
      const h = bottom + (k / 100) * H;
      let win = 0.012 * H, rows;
      for (;;) {
        rows = [];
        for (let i = 0; i < n; i++) if (Math.abs(M[i * 3 + 1] - h) < win) rows.push(i);
        if (rows.length >= 40 || win > 0.05 * H) break;
        win *= 1.5;
      }
      const fit = (list, s) => {
        if (list.length < 6) return null;
        let xin = Infinity, xout = -Infinity, zmin = Infinity, zmax = -Infinity;
        for (const i of list) {
          const x = s ? s * M[i * 3] : Math.abs(M[i * 3]), z = M[i * 3 + 2];
          xin = Math.min(xin, x); xout = Math.max(xout, x); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z);
        }
        return { cx: s ? (xin + xout) / 2 : 0, cz: (zmin + zmax) / 2, a: s ? (xout - xin) / 2 : xout, b: (zmax - zmin) / 2 };
      };
      S.push({ legs: [1, -1].map((s) => fit(rows.filter((i) => s * M[i * 3] > 0), s)), body: [1, -1].map((s) => fit(rows.filter((i) => s * M[i * 3] >= 0), 0)) });
    }
    // Smoothed over 7 slices, so the seams run straight past the folds.
    const SM = S.map((_, k) => {
      const avg = (group, L) => {
        const list = [];
        for (let j = Math.max(0, k - 3); j <= Math.min(100, k + 3); j++) if (S[j][group][L]) list.push(S[j][group][L]);
        if (!list.length) return null;
        return Object.fromEntries(['cx', 'cz', 'a', 'b'].map((key) => [key, list.reduce((sum, f) => sum + f[key], 0) / list.length]));
      };
      return { legs: [0, 1].map((L) => avg('legs', L)), body: [0, 1].map((L) => avg('body', L)) };
    });
    const at = (h) => { const k = clamp(((h - bottom) / H) * 100, 0, 100), k0 = Math.floor(k); return [SM[k0], SM[Math.min(100, k0 + 1)], k - k0]; };
    const mix = (A, B, w, key) => (A && B ? A[key] + (B[key] - A[key]) * w : (A ?? B)[key]);
    const side = (i) => (M[i * 3] >= 0 ? 1 : -1);
    // Below 11 % (the slanted hem: a slice there holds only part of a leg's ring) the legs' fit is held.
    const low = bottom + 0.11 * H;
    const legAt = (h, s) => {
      const L = s > 0 ? 0 : 1, [A, B, w] = at(Math.max(h, low));
      return Object.fromEntries(['a', 'b', 'cx', 'cz'].map((key) => [key, mix(A.legs[L], B.legs[L], w, key)]));
    };
    const bodyAt = (h, s) => {
      const L = s > 0 ? 0 : 1, [A, B, w] = at(Math.max(h, hc));
      return Object.fromEntries(['a', 'b', 'cz'].map((key) => [key, mix(A.body[L], B.body[L], w, key)]));
    };
    // A point's place round its leg: [front share (0 inner seam .. 1 side seam), back share (0 side seam .. 1 inner seam), on the front].
    const legShare = (i) => {
      const s = side(i), L = legAt(M[i * 3 + 1], s);
      const t = param(L.a, L.b, Math.atan2(s * M[i * 3] - L.cx, M[i * 3 + 2] - L.cz)), tin = atZ(L, 0, true), tout = atZ(L, SIDE_Z);
      const ain = arc(L.a, L.b, tin), aout = arc(L.a, L.b, tout);
      const tb = t >= (tin + tout) / 2 ? t : t + 2 * Math.PI;
      return [(arc(L.a, L.b, t) - ain) / (aout - ain), (arc(L.a, L.b, tb) - aout) / (arc(L.a, L.b, tin + 2 * Math.PI) - aout), t > tin && t < tout];
    };
    // Round the body: [front share (0 centre front .. 1 side seam), back share (0 centre back .. 1 side seam), on the front].
    const bodyShare = (i) => {
      const B = bodyAt(M[i * 3 + 1], side(i));
      const t = param(B.a, B.b, Math.atan2(Math.abs(M[i * 3]), M[i * 3 + 2] - B.cz)), tout = atZ(B, SIDE_Z);
      const all = arc(B.a, B.b, Math.PI), seam = arc(B.a, B.b, tout), here = arc(B.a, B.b, t);
      // (Under the crotch, round the body's axis, the direction means nothing: there the points are on the centre seam.)
      const mid = (1.6 * Math.abs(M[i * 3])) / B.a;
      return [Math.min(here / seam, mid), Math.min((all - here) / (all - seam), mid), t < tout];
    };
    const legs = Array.from({ length: n }, (_, i) => legShare(i)), bodies = Array.from({ length: n }, (_, i) => bodyShare(i));

    // The model's own hem round each leg, as [share, height] per panel.
    const hems = new Map();
    for (const s of [1, -1]) for (const panel of [0, 1]) {
      const rows = [];
      for (const i of hemSet) if (side(i) === s && legs[i][2] === (panel === 0)) rows.push([legs[i][panel], M[i * 3 + 1]]);
      rows.sort((p, q) => p[0] - q[0]);
      hems.set(`${s}:${panel}`, rows.length > 3 ? rows : [[0, bottom], [1, bottom]]);
    }
    // The waistband's foot and the waist's top edge round the body, as [share, height] per panel (both halves together:
    // the model is symmetric).
    const ring = (set) => [0, 1].map((panel) => {
      const rows = [];
      for (const i of set) if (bodies[i][2] === (panel === 0)) rows.push([bodies[i][panel], M[i * 3 + 1]]);
      rows.sort((p, q) => p[0] - q[0]);
      return rows;
    });
    const foot = ring(footSet), rim = ring(topRing);

    /** A point's flat pattern place [x, y] (garment metres) on a panel (0 front, 1 back). */
    const flatOf = (i, panel) => {
      const s = side(i), h = M[i * 3 + 1];
      const legW = 1 - smooth(hc - 0.05 * H, hc + 0.03 * H, h);
      // The body: from the crotch up to the waistband's foot, then the waistband.
      const share = bodies[i][panel], hf = lerpTable(foot[panel], share), ht = lerpTable(rim[panel], share);
      let yb = h <= hf ? CROTCH + ((h - hc) / (hf - hc)) * (BAND_FOOT - CROTCH) : BAND_FOOT + ((h - hf) / (ht - hf)) * (BAND_TOP - BAND_FOOT);
      // (The waistband's own foot exactly on ours; the body's top edge tucked under it just below.)
      if (footSet.has(i)) yb = BAND_FOOT + 0.0004;
      if (bodyEdge.has(i)) yb = BAND_FOOT - 0.0015;
      let x = share * sideX(clamp(yb, 0, 0.35)) * (1 - legW), y = yb * (1 - legW);
      if (legW > 0) {
        const raw = legs[i][panel], hh = lerpTable(hems.get(`${s}:${panel}`), raw);
        // Across the panel at a height (the inner seam to the side seam), and the hem there.
        const across = (yy) => { const inner = innerX(yy), out = sideX(yy); return panel === 0 ? inner + raw * (out - inner) : out - raw * (out - inner); };
        let target = hemY(across(0.005)) + 0.0015;
        target = hemY(across(target)) + 0.0015;
        const hb = Math.min(hh + BINDING, hc - 0.02 * H);
        const yl = h <= hh ? target : h <= hb ? target + ((h - hh) / (hb - hh)) * (HEM_TOP - 0.0006 - target) : h <= hc ? HEM_TOP + 0.0006 + ((h - hb) / (hc - hb)) * (CROTCH - HEM_TOP - 0.0006) : yb;
        x += across(yl) * legW; y += yl * legW;
      }
      // Kept on the panel, 3-4 mm inside its seams (the atlas's very edge is a darker line); low on the leg 1.2 cm inside
      // the side seam, clear of the printed hem band's end, which runs on up past the outline's rounded corner there.
      const yy = clamp(y, -0.008, BAND_TOP), inner = yy < CROTCH ? innerX(yy) + 0.003 : 0;
      return [s * clamp(x, inner, sideX(yy) - (yy < 0.07 ? 0.012 : 0.004)), yy];
    };
    const panelOf = (i) => ((M[i * 3 + 1] < hc - 0.01 * H ? legs[i][2] : bodies[i][2]) ? 0 : 1);

    // Placed where the made shorts stand: their hem and top, centred on them.
    let lx = Infinity, hx = -Infinity, lz = Infinity, hz = -Infinity;
    for (let i = 0; i < n; i++) { lx = Math.min(lx, M[i * 3]); hx = Math.max(hx, M[i * 3]); lz = Math.min(lz, M[i * 3 + 2]); hz = Math.max(hz, M[i * 3 + 2]); }
    const scale = (box.max.y - box.min.y) / H;
    const move = [(box.min.x + box.max.x) / 2 - ((lx + hx) / 2) * scale, box.min.y - bottom * scale, (box.min.z + box.max.z) / 2 - ((lz + hz) / 2) * scale];

    // Each triangle printed from one panel (most of its points'); a point used by both panels' triangles is split.
    const P = [], N = [], F = [], B = [], idx = [], copies = new Map();
    const use = (i, panel) => {
      const key = i * 2 + panel;
      if (!copies.has(key)) {
        copies.set(key, B.length);
        for (let c = 0; c < 3; c++) { P.push(M[i * 3 + c] * scale + move[c]); N.push(glb.nor[i * 3 + c]); }
        F.push(...flatOf(i, panel));
        B.push(panel);
      }
      return copies.get(key);
    };
    const panels = Array.from({ length: n }, (_, i) => panelOf(i));
    let split = 0;
    for (let t = 0; t < I.length; t += 3) {
      const p = [panels[I[t]], panels[I[t + 1]], panels[I[t + 2]]];
      const panel = p[0] + p[1] + p[2] >= 2 ? 1 : 0;
      if (p[0] !== p[1] || p[1] !== p[2]) split++;
      for (let k = 0; k < 3; k++) idx.push(use(I[t + k], panel));
    }
    const count2 = B.length;
    if (debug) {
      for (const [k, rows] of hems) console.log(`hem ${k}: ${rows.length} points, ${rows[0][1].toFixed(3)} .. ${rows.at(-1)[1].toFixed(3)}`);
      for (const p of [0, 1]) console.log(`panel ${p}: band foot ${foot[p].length} pts ${foot[p][0][1].toFixed(3)}..${foot[p].at(-1)[1].toFixed(3)}, top ${rim[p][0][1].toFixed(3)}..${rim[p].at(-1)[1].toFixed(3)}`);
    }
    const report = `scale ${scale.toFixed(4)} move ${move.map((v) => v.toFixed(4)).join(', ')}; crotch ${((hc - bottom) / H).toFixed(3)}; ` +
      `${split} triangles across the seams, ${count2 - n} split points (${count2} in all)`;
    return { data: { pos: Float32Array.from(P), nor: Float32Array.from(N), flat: Float64Array.from(F), back: Uint8Array.from(B), shade: new Float64Array(count2).fill(1), idx, extra: { scale, move } }, report };
  },
};
