// The Rugby League socks' ready-made model (Tripo, RGSOCKS 2026-11-13; tripo-convert.mjs): the model's own points,
// triangles and normals (a pair, as our socks: one part per sock), placed with one uniform scale and a move where the
// made pair stands (socks.js), printed through the made socks' flat pattern (sockprint.js: band, hoops, heel and toe,
// the "3" on the shin, patterns, layers).
//
// Where each point is on the flat pattern: each sock is unrolled as a knitted tube is, round its own centreline. Its
// length runs along a smooth field over the sock (0 on its top opening, 1 at the toe's tip: a harmonic field, whose level
// lines are the tube's rings, also round the heel); each ring's middle is a point of the centreline, its length round the
// girth. Flat y: the length along the centreline, from the top (SOCK_LEN) down, the model's ankle and heel landing on our
// pattern's (SOCK_FOOT), the toe's tip at 0. Flat x: the length round the ring from its front middle (the shin, then the
// top of the foot), as the made sock's (+x the wearer's left on both socks); past a quarter of the girth the back half.
const K = 0.48;            // the uniform scale: the top 48 cm over the sole, as the made socks' TOP
const FLOOR = -0.0662;     // the sole's height (socks.js FLOOR), plus the made sole's 0.4 mm

export default {
  model: '../../tripo/rugby-socks.glb',
  lib: "export { buildSocks, SOCK_LEN, SOCK_FOOT } from './socks.js';",
  async convert({ glb, lib, tools, debug }) {
    const { SOCK_LEN, SOCK_FOOT } = lib;
    const made = lib.buildSocks({ detail: true });
    const n = glb.pos.length / 3, I = glb.idx;
    // Placed: scaled, the sole on the podium, the legs' tops over z = 0 (where the made legs stand).
    const chains = tools.openChains(I).filter((c) => c.length > 20);
    let rz = 0, rn = 0;
    for (const c of chains) for (const v of c) { rz += glb.pos[v * 3 + 2]; rn++; }
    let lowY = Infinity;
    for (let i = 0; i < n; i++) lowY = Math.min(lowY, glb.pos[i * 3 + 1]);
    const move = [0, FLOOR + 0.0004 - K * lowY, -K * (rz / rn)];
    const pos = new Float64Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = K * glb.pos[i] + move[i % 3];
    const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
    const lerpTable = (table, x) => {
      if (x <= table[0][0]) return table[0][1];
      for (let i = 1; i < table.length; i++) if (x <= table[i][0]) { const [x0, y0] = table[i - 1], [x1, y1] = table[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1); }
      return table[table.length - 1][1];
    };

    const { part, sizes } = tools.parts(n, I);
    if (sizes.length < 2 || sizes[1] < 1000) throw new Error('rugby-socks: expected a pair (two parts)');
    // Per point: its length field h, its place along the centreline (metres from the top), the girth there, its share
    // round (q: 0 the front middle, +0.25 the wearer's left side, +-0.5 the back middle).
    const h = new Float64Array(n), along = new Float64Array(n), girth = new Float64Array(n), q = new Float64Array(n);
    const report = [];
    const madeGirth = madeGirthOf(made, SOCK_LEN);

    for (const p of [0, 1]) {
      const vs = [];
      for (let i = 0; i < n; i++) if (part[i] === p) vs.push(i);
      const local = new Map(vs.map((v, k) => [v, k]));
      const tris = [];
      for (let t = 0; t < I.length; t += 3) if (part[I[t]] === p) tris.push([I[t], I[t + 1], I[t + 2]]);
      // The top opening and the toe's tip (the points furthest along the foot, within 3 mm).
      const rim = new Set(chains.find((c) => part[c[0]] === p));
      let cx = 0;
      for (const v of rim) cx += pos[v * 3];
      cx /= rim.size;
      // (The foot's way: from the leg's middle to the foot's middle, level.)
      let fx = 0, fz = 0, fk = 0, lx = 0, lz = 0, lk = 0;
      for (const v of vs) { const y = pos[v * 3 + 1] - FLOOR; if (y < 0.03) { fx += pos[v * 3]; fz += pos[v * 3 + 2]; fk++; } else if (y > 0.25) { lx += pos[v * 3]; lz += pos[v * 3 + 2]; lk++; } }
      const fdir = norm([fx / fk - lx / lk, 0, fz / fk - lz / lk]);
      let tipD = -Infinity;
      for (const v of vs) tipD = Math.max(tipD, dot(P(v), fdir));
      const tip = new Set(vs.filter((v) => dot(P(v), fdir) > tipD - 0.003));
      // The harmonic field: cotangent weights (negative ones clamped), 0 on the rim, 1 at the tip; conjugate gradients.
      const m = vs.length, W = new Map();
      const addW = (a, b, w) => { const k = a < b ? a * m + b : b * m + a; W.set(k, (W.get(k) ?? 0) + w); };
      for (const [a, b, c] of tris) {
        const A = P(a), B = P(b), C = P(c);
        const cot = (o, u, v) => { const e1 = sub(u, o), e2 = sub(v, o), cr = Math.hypot(...cross(e1, e2)); return cr > 1e-14 ? dot(e1, e2) / cr : 0; };
        addW(local.get(b), local.get(c), 0.5 * cot(A, B, C));
        addW(local.get(c), local.get(a), 0.5 * cot(B, C, A));
        addW(local.get(a), local.get(b), 0.5 * cot(C, A, B));
      }
      const nb = Array.from({ length: m }, () => []);
      for (const [k, w0] of W) { const a = Math.floor(k / m), b = k % m, w = Math.max(w0, 1e-4); nb[a].push([b, w]); nb[b].push([a, w]); }
      const fixed = new Float64Array(m).fill(NaN);
      vs.forEach((v, k) => { if (rim.has(v)) fixed[k] = 0; else if (tip.has(v)) fixed[k] = 1; });
      const x = Float64Array.from(fixed, (f) => (Number.isNaN(f) ? 0.5 : f));
      const free = (k) => Number.isNaN(fixed[k]);
      const diag = Float64Array.from(nb, (l) => l.reduce((s, [, w]) => s + w, 0));
      const Ax = (u, out) => { for (let k = 0; k < m; k++) { if (!free(k)) { out[k] = 0; continue; } let s = diag[k] * u[k]; for (const [j, w] of nb[k]) if (free(j)) s -= w * u[j]; out[k] = s; } };
      const b = new Float64Array(m);
      for (let k = 0; k < m; k++) if (free(k)) for (const [j, w] of nb[k]) if (!free(j)) b[k] += w * fixed[j];
      const u = Float64Array.from(x, (v, k) => (free(k) ? v : 0)), r = new Float64Array(m), z = new Float64Array(m), d = new Float64Array(m), Ad = new Float64Array(m);
      Ax(u, Ad);
      for (let k = 0; k < m; k++) { r[k] = free(k) ? b[k] - Ad[k] : 0; z[k] = r[k] / diag[k]; d[k] = z[k]; }
      let rz2 = 0;
      for (let k = 0; k < m; k++) rz2 += r[k] * z[k];
      let it = 0;
      for (; it < 5000 && rz2 > 1e-22; it++) {
        Ax(d, Ad);
        let dAd = 0;
        for (let k = 0; k < m; k++) dAd += d[k] * Ad[k];
        const al = rz2 / dAd;
        let nrz = 0;
        for (let k = 0; k < m; k++) { u[k] += al * d[k]; r[k] -= al * Ad[k]; z[k] = r[k] / diag[k]; nrz += r[k] * z[k]; }
        const be = nrz / rz2;
        rz2 = nrz;
        for (let k = 0; k < m; k++) d[k] = z[k] + be * d[k];
      }
      vs.forEach((v, k) => (h[v] = free(k) ? u[k] : fixed[k]));

      // The rings: level lines of h, each its middle (the centreline), girth and the length round it by angle.
      const NL = 700, levels = [];
      const lv = (k) => { const t = k / NL; return t ** 1.6; };   // (closer near the top; the tip's rings are tiny)
      for (let k = 0; k <= NL; k++) {
        const H = k === 0 ? 1e-9 : k === NL ? 1 - 1e-6 : lv(k), segs = [];
        for (const tri of tris) {
          const pts = [];
          for (let e = 0; e < 3; e++) {
            const a = tri[e], c = tri[(e + 1) % 3], ha = h[a] - H, hc = h[c] - H;
            if ((ha < 0) !== (hc < 0)) { const t = ha / (ha - hc), A = P(a), C = P(c); pts.push([A[0] + (C[0] - A[0]) * t, A[1] + (C[1] - A[1]) * t, A[2] + (C[2] - A[2]) * t]); }
          }
          if (pts.length === 2) segs.push(pts);
        }
        let len = 0, c = [0, 0, 0];
        for (const [a, e] of segs) { const l = Math.hypot(...sub(e, a)); len += l; for (let j = 0; j < 3; j++) c[j] += ((a[j] + e[j]) / 2) * l; }
        if (!len) continue;
        levels.push({ H, segs, c: c.map((v) => v / len), girth: len });
      }
      // The centreline smoothed, its length from the top, its way (tangent) and each ring's frame: `side` the wearer's
      // left (+x) square to it, `f` the front (the shin on the leg, the top of the foot on the foot).
      const C = levels.map((l, i) => { const w = 3, s = [0, 0, 0]; let k2 = 0; for (let j = Math.max(0, i - w); j <= Math.min(levels.length - 1, i + w); j++) { for (let a = 0; a < 3; a++) s[a] += levels[j].c[a]; k2++; } return s.map((v) => v / k2); });
      C[0] = levels[0].c;
      let L = 0;
      levels.forEach((l, i) => { if (i) L += Math.hypot(...sub(C[i], C[i - 1])); l.L = L; l.cc = C[i]; });
      levels.forEach((l, i) => {
        const a = C[Math.max(0, i - 6)], e = C[Math.min(levels.length - 1, i + 6)];
        l.t = norm(sub(e, a));
        l.side = norm(sub([1, 0, 0], l.t.map((v) => v * l.t[0])));
        l.f = cross(l.t, l.side);
        // The length round by angle (360 bins from -180 degrees), from the front middle (angle 0).
        const bins = new Float64Array(360), ang = (pt) => { const dd = sub(pt, l.cc); return Math.atan2(dot(dd, l.side), dot(dd, l.f)); };
        for (const [a, e] of l.segs) {
          let t0 = ang(a), t1 = ang(e);
          if (t1 - t0 > Math.PI) t0 += 2 * Math.PI; else if (t0 - t1 > Math.PI) t1 += 2 * Math.PI;
          const lo = Math.min(t0, t1), hi = Math.max(t0, t1), segL = Math.hypot(...sub(e, a));
          const b0 = Math.floor(((lo + Math.PI) / (2 * Math.PI)) * 360), b1 = Math.floor(((hi + Math.PI) / (2 * Math.PI)) * 360);
          for (let bb = b0; bb <= b1; bb++) bins[((bb % 360) + 360) % 360] += segL / (b1 - b0 + 1);
        }
        const cum = new Float64Array(361);
        for (let k = 0; k < 360; k++) cum[k + 1] = cum[k] + bins[k];
        l.cum = cum;
        l.share = (theta) => {
          const f = ((theta + Math.PI) / (2 * Math.PI)) * 360, k = Math.min(359, Math.max(0, Math.floor(f))), v = cum[k] + (cum[k + 1] - cum[k]) * (f - k);
          let s = (v - cum[180]) / cum[360];
          return s > 0.5 ? s - 1 : s < -0.5 ? s + 1 : s;
        };
        delete l.segs;
      });
      // The model's heel: where its centreline turns from running down the leg (30 degrees from straight down) to running
      // along the foot (75 degrees). Its rings turn there within 2 cm (a sharp heel), so that turn's middle lands on the
      // middle of our pattern's heel bend (SOCK_FOOT ankle..heel, where its heel cup is printed), the top and the toe's tip
      // on ours: the print stays near its true size on the leg and the foot.
      const legWay = [0, -1, 0];
      const turned = (deg) => levels.find((l) => l.L > 0.1 && Math.acos(Math.min(1, dot(l.t, legWay))) > (deg * Math.PI) / 180).L;
      const Lank = turned(30), Lheel = turned(75), Ltip = levels.at(-1).L, Lb = (Lank + Lheel) / 2, yb = (SOCK_FOOT.ankle + SOCK_FOOT.heel) / 2;
      if (debug) report.push("  profile L:deg:cy:cz " + levels.filter((_, i) => i % 20 === 0).map((l) => `${l.L.toFixed(3)}:${(Math.acos(Math.min(1, dot(l.t, legWay))) * 180 / Math.PI).toFixed(0)}:${(l.cc[1] - FLOOR).toFixed(3)}:${l.cc[2].toFixed(3)}`).join(" "));
      const Y = [[0, SOCK_LEN], [Lb, yb], [Ltip, 0]];
      report.push(`sock ${p}: ${m} points, CG ${it} its; centreline ${Ltip.toFixed(3)} m (made ${SOCK_LEN.toFixed(3)}); heel turn ${Lank.toFixed(3)}-${Lheel.toFixed(3)} from the top (made ${(SOCK_LEN - SOCK_FOOT.ankle).toFixed(3)}-${(SOCK_LEN - SOCK_FOOT.heel).toFixed(3)}); y scale leg ${((SOCK_LEN - yb) / Lb).toFixed(3)}, foot ${(yb / (Ltip - Lb)).toFixed(3)}`);
      if (debug) report.push('  L, girth (model / made at that flat y): ' + levels.filter((_, i) => i % 25 === 0).map((l) => `${l.L.toFixed(3)}:${l.girth.toFixed(3)}/${madeGirth(lerpTable(Y, l.L)).toFixed(3)}`).join(' '));
      // Each point: between two rings by h.
      const heelZone = new Map();
      const Hs = levels.map((l) => l.H);
      for (const v of vs) {
        let lo = 0, hi = levels.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (Hs[mid] <= h[v]) lo = mid; else hi = mid; }
        const A = levels[lo], B = levels[hi], t = Math.min(1, Math.max(0, (h[v] - A.H) / (B.H - A.H || 1)));
        const Lv = A.L + (B.L - A.L) * t;
        heelZone.set(v, Lv > Lank - 0.06 && Lv < Lheel + 0.05);
        along[v] = lerpTable(Y, Lv);
        girth[v] = A.girth + (B.girth - A.girth) * t;
        const cc = A.cc.map((c, j) => c + (B.cc[j] - c) * t), dd = sub(P(v), cc);
        const share = (l) => l.share(Math.atan2(dot(dd, l.side), dot(dd, l.f)));
        let qa = share(A), qb = share(B);
        if (qb - qa > 0.5) qb -= 1; else if (qa - qb > 0.5) qb += 1;
        let qq = qa + (qb - qa) * t;
        q[v] = qq > 0.5 ? qq - 1 : qq < -0.5 ? qq + 1 : qq;
        if (tip.has(v)) q[v] = 0;
      }
      // Round the heel the rings turn within 2 cm, so their places there waver: smoothed (each the mean of its
      // neighbours', 200 times), from 6 cm above the turn to 5 cm along the foot; the rest held.
      const nbs = new Map(vs.map((v) => [v, new Set()]));
      for (const [a, b2, c] of tris) { nbs.get(a).add(b2).add(c); nbs.get(b2).add(a).add(c); nbs.get(c).add(a).add(b2); }
      const zone = vs.filter((v) => heelZone.get(v) && !tip.has(v) && !rim.has(v));
      const wrap = (d) => (d > 0.5 ? d - 1 : d < -0.5 ? d + 1 : d);
      for (let pass = 0; pass < 200; pass++) {
        const next = zone.map((v) => {
          let dq = 0, sa = 0, sg = 0, k2 = 0;
          for (const w of nbs.get(v)) { dq += wrap(q[w] - q[v]); sa += along[w]; sg += girth[w]; k2++; }
          return [v, wrap(q[v] + (0.5 * dq) / k2), 0.5 * along[v] + (0.5 * sa) / k2, 0.5 * girth[v] + (0.5 * sg) / k2];
        });
        for (const [v, qq, a2, g2] of next) { q[v] = qq; along[v] = a2; girth[v] = g2; }
      }
    }

    // The flat x round: the model's own girth (true size), no wider than the made pattern's outline there (its seam 3 mm
    // inside the outline: the atlas's very edge is a dark anti-aliased line).
    const G = (v) => Math.min(girth[v], madeGirth(along[v]) + 0.004);
    const xFront = (v) => q[v] * G(v);
    const xBack = (v) => ((q[v] >= 0 ? 0.5 : -0.5) - q[v]) * G(v);
    const isBack = (v) => Math.abs(q[v]) > 0.25;
    // Triangles: each on the half of most of its corners; a corner on the other half gets a copy there.
    const outPos = Array.from(pos), outNor = Array.from(glb.nor), flat = [], back = [], idx = [];
    for (let v = 0; v < n; v++) { back.push(isBack(v) ? 1 : 0); flat.push(isBack(v) ? xBack(v) : xFront(v), along[v]); }
    const copies = new Map();
    let split = 0;
    for (let t = 0; t < I.length; t += 3) {
      const c = [I[t], I[t + 1], I[t + 2]], sides = c.map(isBack), want = sides.filter(Boolean).length >= 2;
      for (const v of c) {
        if (isBack(v) === want) { idx.push(v); continue; }
        const key = v * 2 + (want ? 1 : 0);
        if (!copies.has(key)) {
          copies.set(key, outPos.length / 3);
          outPos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
          outNor.push(glb.nor[v * 3], glb.nor[v * 3 + 1], glb.nor[v * 3 + 2]);
          flat.push(want ? xBack(v) : xFront(v), along[v]);
          back.push(want ? 1 : 0);
          split++;
        }
        idx.push(copies.get(key));
      }
    }
    // Baked shade: none, but the sole's underside a little in shadow (as the made socks').
    const count = outPos.length / 3, shade = new Float64Array(count);
    for (let i = 0; i < count; i++) { const y = outPos[i * 3 + 1] - FLOOR, t = Math.min(1, Math.max(0, (0.03 - y) / 0.028)); shade[i] = 1 - 0.25 * t * t * (3 - 2 * t); }
    report.push(`scale ${K}, move (${move.map((v) => v.toFixed(4)).join(', ')}); ${split} seam copies, ${count} points, ${idx.length / 3} triangles`);
    return { data: { pos: Float32Array.from(outPos), nor: Float32Array.from(outNor), flat: Float64Array.from(flat), back: Uint8Array.from(back), shade, idx, extra: {} }, report: report.join('\n') };
  },
};

/** The made pattern's girth by flat y (its outline's width: socks.js outline, both halves). */
function madeGirthOf(made, SOCK_LEN) {
  const pts = made.outline.filter((p) => p.x > 0 && p.y >= 0).map((p) => [p.y, (p.x - 0.004) * 4]).sort((a, b) => a[0] - b[0]);
  return (y) => {
    if (y <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (y <= pts[i][0]) { const [y0, g0] = pts[i - 1], [y1, g1] = pts[i]; return g0 + ((g1 - g0) * (y - y0)) / (y1 - y0 || 1); }
    return pts.at(-1)[1];
  };
}
