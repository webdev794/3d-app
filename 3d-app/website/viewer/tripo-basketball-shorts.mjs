// The basketball shorts' ready-made model (Tripo, 2026-11-12; tripo-convert.mjs): the model's own points, triangles and
// normals, placed with one uniform scale and a move where the made shorts stand (bballshorts.js), printed through the
// made shorts' flat pattern (bballprint.js: side panels, band, piping, hem stripes, marks).
//
// Where each point is on the flat pattern: the model is unrolled as cloth is, round each leg (below the crotch) from the
// inner leg seam over the front to the side seam and on round the back, and round the body above from the centre front.
// The share of the way round, measured along the cross-section (an ellipse fitted to each 1 % slice of the model), is
// the share across our panel at that height; heights go piecewise from the model's hem, crotch, band foot and top to
// ours. Near the hem each column is moved so the model's own hem edge and V split land exactly on our pattern's hem and
// V (BB_VENT), so the edge binding and the stripe run along the model's hem and up its splits as on the made shorts.
// The side seam is where each slice reaches out furthest (at the V split's top below it); front and back meet there.
export default {
  model: '../../tripo/basketball-shorts.glb',
  lib: "export { buildBballShorts } from './bballshorts.js'; export { BB, BB_INNER, BB_SPLIT, BB_VENT, sideX } from './bballprint.js';",
  async convert({ glb, lib, debug }) {
    const { BB, BB_INNER, BB_SPLIT, BB_VENT, sideX } = lib;
    const made = lib.buildBballShorts({ detail: true });
    made.geometry.computeBoundingBox();
    const box = made.geometry.boundingBox;
    const M = glb.pos, n = M.length / 3;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const lerpTable = (table, x) => {
      if (x <= table[0][0]) return table[0][1];
      for (let i = 1; i < table.length; i++) if (x <= table[i][0]) { const [x0, y0] = table[i - 1], [x1, y1] = table[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1); }
      return table[table.length - 1][1];
    };
    // Our pattern: the inner leg seam's x by height (0 at the crotch), the hem's edge by x (the inner corner's curve,
    // level, then up the V split).
    const INNER = [[0, BB_INNER[0][1]], ...BB_INNER.map(([y, x]) => [y, x])];
    const innerX = (y) => (y >= BB.crotch ? 0 : lerpTable(INNER, y));
    const HEM = [[0.043, 0.012], [0.05, 0.006], [0.075, 0.002], [0.16, 0], [BB_SPLIT.x, 0], ...BB_VENT.slice(1)];
    // Arc length along an ellipse (half-axes a across, b front to back) from its front (t = 0) to parameter t.
    const arc = (a, b, t) => {
      const steps = Math.max(2, 2 * Math.ceil(Math.abs(t) / (Math.PI / 24))), h = t / steps;
      const f = (s) => Math.sqrt(a * a * Math.cos(s) ** 2 + b * b * Math.sin(s) ** 2);
      let sum = f(0) + f(t);
      for (let k = 1; k < steps; k++) sum += f(k * h) * (k % 2 ? 4 : 2);
      return (sum * h) / 3;
    };
    const param = (a, b, psi) => Math.atan2(b * Math.sin(psi), a * Math.cos(psi));

    let top = -Infinity, bottom = Infinity;
    for (let i = 0; i < n; i++) { top = Math.max(top, M[i * 3 + 1]); bottom = Math.min(bottom, M[i * 3 + 1]); }
    const H = top - bottom;
    // The model's crotch (the lowest point down the middle) and waistband foot (its groove, 6.5 % under the top).
    let crotch = Infinity;
    for (let i = 0; i < n; i++) if (Math.abs(M[i * 3]) < 0.012 * H) crotch = Math.min(crotch, M[i * 3 + 1]);
    const hc = crotch + 0.015 * H, hb = top - 0.065 * H;
    const Y = [[bottom, 0], [hc, BB.crotch], [hb, BB.waist - BB.band], [top, BB.waist]];
    const yBase = (h) => lerpTable(Y, h);

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
      // An ellipse from the slice's extents: centre, half-axes (the body's about x = 0).
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
    // The model's open edges low on the legs: the hems with their V splits.
    const ek = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a), count = new Map(), I = glb.idx;
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const e = ek(I[t + k], I[t + (k + 1) % 3]); count.set(e, (count.get(e) ?? 0) + 1); }
    const edge = new Set();
    for (const [e, c] of count) {
      if (c !== 1) continue;
      const a = Math.floor(e / 1048576), b = e % 1048576;
      if (M[a * 3 + 1] < bottom + 0.184 * H && M[b * 3 + 1] < bottom + 0.184 * H) { edge.add(a); edge.add(b); }
    }
    // Below 5 % (the hem not level, a slice holds only part of a leg's ring) the legs' fit is held.
    const low = bottom + 0.05 * H;
    const fitAt = (h, s) => { const L = s > 0 ? 0 : 1, [A, B, w] = at(Math.max(h, low)); return { a: mix(A.legs[L], B.legs[L], w, 'a'), b: mix(A.legs[L], B.legs[L], w, 'b'), cx: mix(A.legs[L], B.legs[L], w, 'cx'), cz: mix(A.legs[L], B.legs[L], w, 'cz') }; };
    // The side seam: straight out at the side (the fitted ellipse's widest point), except near the hem, where it comes
    // down to the V split's top (each leg's highest hem point: the model has its splits a little forward of the side).
    const apexOf = new Map();
    for (const s of [1, -1]) {
      let top2 = -1;
      for (const i of edge) if (side(i) === s && (top2 < 0 || M[i * 3 + 1] > M[top2 * 3 + 1])) top2 = i;
      const L = fitAt(M[top2 * 3 + 1], s);
      apexOf.set(s, { h: M[top2 * 3 + 1], dir: Math.atan2(s * M[top2 * 3] - L.cx, M[top2 * 3 + 2] - L.cz) });
    }
    const legAt = (h, s) => {
      const A = apexOf.get(s), w = smooth(A.h + 0.01 * H, A.h + 0.15 * H, h);
      return { ...fitAt(h, s), out: A.dir + (Math.PI / 2 - A.dir) * w, in: -Math.PI / 2 };
    };
    const bodyAt = (h, s) => {
      const L = s > 0 ? 0 : 1, [A, B, w] = at(Math.max(h, hc));
      return { a: mix(A.body[L], B.body[L], w, 'a'), b: mix(A.body[L], B.body[L], w, 'b'), cz: mix(A.body[L], B.body[L], w, 'cz'), out: Math.PI / 2 };
    };
    if (debug) {
      for (const [s, A] of apexOf) console.log(`apex ${s}: height ${((A.h - bottom) / H).toFixed(3)} direction ${((A.dir * 180) / Math.PI).toFixed(1)} deg`);
      for (let k = 0; k <= 100; k += 5) { const r = SM[k], f = (v) => v?.toFixed(3); console.log(`${k}% legL a ${f(r.legs[0]?.a)} b ${f(r.legs[0]?.b)} c ${f(r.legs[0]?.cx)},${f(r.legs[0]?.cz)} | body a ${f(r.body[0]?.a)} b ${f(r.body[0]?.b)} cz ${f(r.body[0]?.cz)}`); }
    }
    // A point's place round its leg: [front share (0 inner seam .. 1 side seam), back share (0 side seam .. 1 inner seam), on the front].
    const legShare = (i) => {
      const s = side(i), L = legAt(M[i * 3 + 1], s);
      const t = param(L.a, L.b, Math.atan2(s * M[i * 3] - L.cx, M[i * 3 + 2] - L.cz)), tin = param(L.a, L.b, L.in), tout = param(L.a, L.b, L.out);
      const ain = arc(L.a, L.b, tin), aout = arc(L.a, L.b, tout);
      const tb = t >= (tin + tout) / 2 ? t : t + 2 * Math.PI;
      return [(arc(L.a, L.b, t) - ain) / (aout - ain), (arc(L.a, L.b, tb) - aout) / (arc(L.a, L.b, tin + 2 * Math.PI) - aout), t > tin && t < tout];
    };
    // Round the body: [front share (0 centre front .. 1 side seam), back share (0 centre back .. 1 side seam), on the front].
    const bodyShare = (i) => {
      const B = bodyAt(M[i * 3 + 1], side(i));
      const t = param(B.a, B.b, Math.atan2(Math.abs(M[i * 3]), M[i * 3 + 2] - B.cz)), tout = param(B.a, B.b, B.out);
      const all = arc(B.a, B.b, Math.PI), seam = arc(B.a, B.b, tout), here = arc(B.a, B.b, t);
      // (Under the crotch, round the body's axis, the direction means nothing: there the points are on the centre seam,
      // as close to the middle as they are across.)
      const mid = (1.6 * Math.abs(M[i * 3])) / B.a;
      return [Math.min(here / seam, mid), Math.min((all - here) / (all - seam), mid), t < tout];
    };
    const legs = Array.from({ length: n }, (_, i) => legShare(i)), bodies = Array.from({ length: n }, (_, i) => bodyShare(i));

    // The model's own hem edge round each leg, as [share, height] per panel, and where its V split starts (front: the
    // last share before the edge climbs; behind: the first after it comes down).
    const hems = new Map(), rise = bottom + 0.045 * H;
    for (const s of [1, -1]) for (const panel of [0, 1]) {
      const rows = [];
      for (const i of edge) if (side(i) === s && legs[i][2] === (panel === 0)) rows.push([legs[i][panel], M[i * 3 + 1]]);
      rows.sort((p, q) => p[0] - q[0]);
      let v = panel === 0 ? 0.8 : 0.2;
      if (panel === 0) { for (const [f, h] of rows) if (h <= rise) v = f; } else { for (let k = rows.length - 1; k >= 0; k--) if (rows[k][1] <= rise) v = rows[k][0]; }
      hems.set(`${s}:${panel}`, { rows: rows.length > 3 ? rows : [[0, bottom], [1, bottom]], v });
    }
    const inner0 = innerX(0), side0 = sideX(0);
    const ourV = [(BB_SPLIT.x - inner0) / (side0 - inner0), (side0 - BB_SPLIT.x) / (side0 - inner0)];

    /** A point's flat pattern place [x, y] (garment metres) on a panel (0 front, 1 back). */
    const flatOf = (i, panel) => {
      const s = side(i), h = M[i * 3 + 1];
      const legW = 1 - smooth(hc - 0.05 * H, hc + 0.03 * H, h);
      let y = yBase(h), x = 0;
      if (legW > 0) {
        const raw = legs[i][panel];
        let share = raw;
        const near = 1 - smooth(bottom + 0.2 * H, bottom + 0.32 * H, h), hem = hems.get(`${s}:${panel}`);
        if (near > 0) share += (lerpTable([[0, 0], [hem.v, ourV[panel]], [1, 1]], raw) - share) * near;
        const yl = yBase(h), inner = innerX(yl), out = sideX(yl);
        const xl = panel === 0 ? inner + share * (out - inner) : out - share * (out - inner);
        // (1.5 mm inside our edge: the print's very edge is a hair darker where the painted body meets the colours carried
        // past it.)
        const yy = near > 0 ? yl + near * (lerpTable(HEM, xl) + 0.0015 - yBase(lerpTable(hem.rows, raw))) : yl;
        x = xl * legW; y = yy * legW + y * (1 - legW);
      }
      if (legW < 1) x += bodies[i][panel] * sideX(y) * (1 - legW);
      // Kept on the panel, 3-4 mm inside its seams (clear of that darker edge): a point printed from the piece it is not
      // on takes that piece's edge. (Through the V split the edge is the split's, placed above.)
      const yl = clamp(y, -0.008, BB.waist - 0.003), inner = y < BB.crotch ? innerX(yl) + 0.003 : 0;
      return [s * clamp(x, inner, sideX(yl) - (yl > BB_SPLIT.y + 0.01 ? 0.004 : 0.0005)), yl];
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
    const report = `scale ${scale.toFixed(4)} move ${move.map((v) => v.toFixed(4)).join(', ')}; crotch ${((hc - bottom) / H).toFixed(3)}, band foot ${((hb - bottom) / H).toFixed(3)}; ` +
      `V start front ${[...hems].map(([k, v]) => `${k} ${v.v.toFixed(3)}`).join(' ')}; ${split} triangles across the seams, ${count2 - n} split points (${count2} in all)`;
    return { data: { pos: Float32Array.from(P), nor: Float32Array.from(N), flat: Float64Array.from(F), back: Uint8Array.from(B), shade: new Float64Array(count2).fill(1), idx, extra: { scale, move } }, report };
  },
};
