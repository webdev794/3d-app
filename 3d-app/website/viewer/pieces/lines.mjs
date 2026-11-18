// MODELQ4 2026-11-17: the colour line of each seam tape = its own smoothed centre line; per body point near a tape: the pieces on the
// tape's two sides (A, B) and the signed distance S to that centre line (+ = A side). Away from tapes: its own piece.
import { pieces, closestOnTri } from './pieces.mjs';
const D3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
function gauss(Q, closed, sigmaPts) {
  const w = Math.ceil(3 * sigmaPts), ker = []; for (let o = -w; o <= w; o++) ker.push(Math.exp(-0.5 * (o / sigmaPts) ** 2));
  return Q.map((_, k) => { let s = [0, 0, 0], ws = 0; for (let o = -w; o <= w; o++) { let j = k + o; if (closed) j = ((j % Q.length) + Q.length) % Q.length; else if (j < 0 || j >= Q.length) continue; s = s.map((x, i) => x + Q[j][i] * ker[o + w]); ws += ker[o + w]; } return s.map((x) => x / ws); });
}
export function colourLines(name, template) {
  const S = pieces(name, { ...template, key: new Proxy({}, { get: (_, k) => (k === 'body' ? 'body' : 'strip') }), prio: new Proxy({}, { get: () => 1 }) }), { A } = S, P = (v) => [A.P[v * 3], A.P[v * 3 + 1], A.P[v * 3 + 2]];
  const B0 = S.comps[0]; S.bodyPts = new Set(); for (const t of B0.tris) for (let k = 0; k < 3; k++) S.bodyPts.add(A.F[t * 3 + k]);
  const PN = (v) => [A.PN[v * 3], A.PN[v * 3 + 1], A.PN[v * 3 + 2]];
  // body points grid
  const G = 0.01, ck = (p) => `${Math.floor(p[0] / G)},${Math.floor(p[1] / G)},${Math.floor(p[2] / G)}`, grid = new Map();
  for (const v of S.bodyPts) { const k = ck(P(v)); (grid.get(k) ?? grid.set(k, []).get(k)).push(v); }
  const nearBody = (q, r, ok = () => true) => { const [x, y, z] = q.map((c) => Math.floor(c / G)), n = Math.ceil(r / G); let best = -1, bd = r; for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) for (let c = -n; c <= n; c++) for (const v of grid.get(`${x + a},${y + b},${z + c}`) ?? []) { if (!ok(v)) continue; const d = D3(q, P(v)); if (d < bd) { bd = d; best = v; } } return best; };
  // the cloth's normal at q: its points' normals within 1.5 cm, each turned outward (the model's own normals flip in places)
  const zcN = (S.lo[2] + S.hi[2]) / 2, ycN = (S.lo[1] + S.hi[1]) / 2;
  const clothNormal = (q) => { const out = norm([q[0], (q[1] - ycN) * 0.4, q[2] - zcN]); const [x, y, z] = q.map((c) => Math.floor(c / G)); let s2 = [0, 0, 0]; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) for (const v of grid.get(`${x + a},${y + b},${z + c}`) ?? []) { if (D3(q, P(v)) > 0.015) continue; let n = PN(v); if (dot(n, out) < 0) n = n.map((t) => -t); s2 = s2.map((t, k) => t + n[k]); } return Math.hypot(...s2) > 1e-6 ? norm(s2) : out; };
  // A piece that mostly stands clear of the cloth (a band sewn on beyond its edge: the hem band) is a piece of its own;
  // the others (tapes lying in the cloth) are lines.
  const TG = 0.02, tk = (p) => `${Math.floor(p[0] / TG)},${Math.floor(p[1] / TG)},${Math.floor(p[2] / TG)}`, btg = new Map();
  for (const t of B0.tris) { const c = [0, 1, 2].map((k) => P(A.F[t * 3 + k])).reduce((a, p) => a.map((x, i) => x + p[i] / 3), [0, 0, 0]); const k = tk(c); (btg.get(k) ?? btg.set(k, []).get(k)).push(t); }
  const toCloth = (p) => { const [x, y, z] = p.map((c) => Math.floor(c / TG)); let b = 9; for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (let c = -1; c <= 1; c++) for (const t of btg.get(`${x + a},${y + bb},${z + c}`) ?? []) b = Math.min(b, D3(p, closestOnTri(p, P(A.F[t * 3]), P(A.F[t * 3 + 1]), P(A.F[t * 3 + 2])))); return b; };
  const own = [];
  for (const cp of S.pcs) { const vs = [...new Set(cp.tris.flatMap((t) => [A.F[t * 3], A.F[t * 3 + 1], A.F[t * 3 + 2]]))]; const on = vs.filter((v) => toCloth(P(v)) < 0.004).length / vs.length; cp.onCloth = on; if (on < 0.5) own.push(cp); }
  // How far a point stands out of the cloth (+ outside, metres): from the nearest cloth triangle, along its normal turned
  // outward.
  const clothOffset = (p) => {
    const [x, y, z] = p.map((c) => Math.floor(c / TG)); let best = null;
    for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (let c = -1; c <= 1; c++) for (const t of btg.get(`${x + a},${y + bb},${z + c}`) ?? []) { const q = closestOnTri(p, P(A.F[t * 3]), P(A.F[t * 3 + 1]), P(A.F[t * 3 + 2])), d = D3(p, q); if (!best || d < best.d) best = { d, q, t }; }
    if (!best) return 0;
    const o = norm([p[0], (p[1] - ycN) * 0.4, p[2] - zcN]); let n = [A.FN[best.t * 3], A.FN[best.t * 3 + 1], A.FN[best.t * 3 + 2]]; if (dot(n, o) < 0) n = n.map((v) => -v);
    return dot(sub(p, best.q), n);
  };
  const lines = [];
  for (const cp of S.pcs) {
    if (own.includes(cp)) continue;
    const rings = cp.loops.filter((l) => l.closed && l.Q.length > 40);
    let C, closed, beadOut = false;
    if (rings.length >= 2) {
      // A band ring: its lip that shows (stands out of the cloth: the ridge seen on the model) is the line; if neither
      // stands out more than the other, the middle between its two lips.
      const [L1, L2] = rings, lift = (L) => L.Q.reduce((s2, p) => s2 + clothOffset(p), 0) / L.Q.length, h1 = lift(L1), h2 = lift(L2);
      if (process.env.DBG) console.log('ring', cp.size, 'lips stand out', (h1 * 1000).toFixed(2), (h2 * 1000).toFixed(2), 'mm');
      beadOut = Math.max(h1, h2) > (template.beadOut ?? 0.0002);
      if (Math.abs(h1 - h2) > (template.lipDiff ?? 0.0003)) C = (h1 > h2 ? L1 : L2).Q.map((p) => p.slice());
      else C = L1.Q.map((p) => { let b = L2.Q[0], bd = 9; for (const q of L2.Q) { const d = D3(p, q); if (d < bd) { bd = d; b = q; } } return p.map((x, k) => (x + b[k]) / 2); });
      closed = true;
    } else {
      // an open tape: the middles of its points binned by how far along it they are
      const vs = new Set(), adj = new Map();
      for (const t of cp.tris) for (let k = 0; k < 3; k++) { const a = A.F[t * 3 + k], b = A.F[t * 3 + (k + 1) % 3]; vs.add(a); (adj.get(a) ?? adj.set(a, new Set()).get(a)).add(b); (adj.get(b) ?? adj.set(b, new Set()).get(b)).add(a); }
      const geo = (s0) => { const d = new Map([[s0, 0]]), q = [s0]; while (q.length) { q.sort((x, y) => d.get(y) - d.get(x)); const v = q.pop(); for (const u of adj.get(v)) { const nd = d.get(v) + D3(P(v), P(u)); if (nd < (d.get(u) ?? 9)) { d.set(u, nd); q.push(u); } } } return d; };
      const far = (d) => [...d].reduce((m, x) => (x[1] > m[1] ? x : m))[0];
      const d1 = geo(far(geo([...vs][0]))), bins = new Map();
      const zc0 = (S.lo[2] + S.hi[2]) / 2, yc0 = (S.lo[1] + S.hi[1]) / 2;
      const outOf = (v) => { const p = P(v), b = nearBody(p, 0.01, (u) => !vs.has(u)); if (b < 0) return 0; const r = norm([p[0], (p[1] - yc0) * 0.4, p[2] - zc0]); let nb = PN(b); if (dot(nb, r) < 0) nb = nb.map((x) => -x); return dot(sub(p, P(b)), nb); };
      const shown = new Set([...vs].filter((v) => outOf(v) > (template.lipOut ?? 0.0003)));
      const useShown = shown.size > vs.size * 0.08;
      for (const [v, x] of d1) { if (useShown && !shown.has(v)) continue; const b = Math.floor(x / 0.003); const e = bins.get(b) ?? bins.set(b, [0, 0, 0, 0]).get(b); const p = P(v); e[0] += p[0]; e[1] += p[1]; e[2] += p[2]; e[3]++; }
      C = [...bins.keys()].sort((a, b) => a - b).map((b) => { const e = bins.get(b); return [e[0] / e[3], e[1] / e[3], e[2] / e[3]]; }); closed = false;
      // a tape that is one loop round (both ends meet) is closed
      if (C.length > 10 && D3(C[0], C.at(-1)) < 0.01) closed = true;
    }
    if (C.length < 4) continue;
    C = gauss(C, closed, closed && rings.length >= 2 ? 3 : 2);
    if (!closed) C.ends = true; // (carried on past its ends below, once all lines are known)
    // side vector per point (tangent x the cloth's normal there), smoothed; the pieces either side, 1.2 cm out
    const n = C.length;
    let side = C.map((q, i) => { const a = C[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = C[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], v = nearBody(q, 0.02); const nn = clothNormal(q); return norm(cross(norm(sub(b, a)), nn)); });
    // keep the side vectors pointing one way along the line (the cloth's normals flip in places)
    for (let i = 1; i < n; i++) if (dot(side[i], side[i - 1]) < 0) side[i] = side[i].map((x) => -x);
    side = gauss(side, closed, 3).map(norm);
    // A band ring whose tape stands out of the cloth (a rounded bead): its line is where its sewn edge meets the cloth,
    // and the bead belongs to the band; the colour line runs along the bead's foot on the side away from the opening the
    // band edges (the crease seen on the model: user 577), each place's offset from its lip smoothed along the ring.
    if (rings.length >= 2 && beadOut && template.beadFoot !== false) {
      // (the bead: the tape's points out of the cloth or just under its surface, where the tape tucks in at the bead's foot)
      const vis = [...new Set(cp.tris.flatMap((t) => [A.F[t * 3], A.F[t * 3 + 1], A.F[t * 3 + 2]]))].map(P).filter((p) => clothOffset(p) > -(template.beadTuck ?? 0.0015));
      const BG = 0.006, bgrid = new Map(), bk = (p) => p.map((c) => Math.floor(c / BG)).join(',');
      for (const p of vis) { const k = bk(p); (bgrid.get(k) ?? bgrid.set(k, []).get(k)).push(p); }
      // (the opening this ring edges: the one nearest the ring on average, so near another opening (a neck band's ends by
      // the armholes) the bead's foot is still taken on the side away from its own opening)
      const ownOpen = S.openings.map((O) => [O, C.reduce((acc, q) => acc + Math.min(...O.map((o) => D3(q, o))), 0) / C.length]).sort((a, b) => a[1] - b[1])[0]?.[0] ?? [];
      const off = C.map((q, i) => {
        let nearO = null, nd = 9; for (const o of ownOpen) { const d = D3(q, o); if (d < nd) { nd = d; nearO = o; } }
        if (!nearO || nd > 0.06) return 0;
        const towardOpen = dot(sub(nearO, q), side[i]) > 0 ? 1 : -1, [x, y, z] = q.map((c) => Math.floor(c / BG));
        let best = null;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const p of bgrid.get(`${x + a},${y + b},${z + c}`) ?? []) {
          const d = sub(p, q), along = d.map((v, k) => v - side[i][k] * dot(d, side[i]));
          if (Math.hypot(...along) > 0.003) continue; // (beside this place, not along the ring)
          const sv = dot(d, side[i]);
          if (sv * towardOpen <= 0 && (best === null || Math.abs(sv) > Math.abs(best))) best = sv;
        }
        return best === null ? null : Math.max(-(template.beadMax ?? 0.006), Math.min(template.beadMax ?? 0.006, best));
      });
      // (places with none of the tape beside them take their nearest neighbours' offsets round the ring)
      const known = off.map((o, i) => [o, i]).filter(([o]) => o !== null);
      const filled = off.map((o, i) => { if (o !== null || !known.length) return o ?? 0; let best = known[0], bd = 1e9; for (const [ko, ki] of known) { const d = Math.min(Math.abs(ki - i), C.length - Math.abs(ki - i)); if (d < bd) { bd = d; best = [ko, ki]; } } return best[0]; });
      const sm = gauss(filled.map((o) => [o, 0, 0]), true, 6).map((v) => v[0]);
      C = C.map((q, i) => q.map((x, k) => x + side[i][k] * sm[i]));
      if (process.env.DBG) console.log('ring', cp.size, 'bead foot offsets mm: median', (([...sm].sort((a, b) => a - b)[sm.length >> 1]) * 1000).toFixed(2), 'range', (Math.min(...sm) * 1000).toFixed(2), (Math.max(...sm) * 1000).toFixed(2));
    }
    lines.push({ C, closed, side, cp, ring: rings.length >= 2 });
    if (process.env.DBG) console.log('line', cp.size, closed ? 'closed' : 'open', C.length, rings.length >= 2 ? 'ring' : 'tape');
  }
  // Lines that are not separate pieces of the model (MODELQ2 2026-11-17): on a model that is one closed piece, its own lines
  // are creases in the cloth (a waistband's foot, a cuff's seam). `template.extraLines(S)` gives them as point lists
  // [{ C: [[x, y, z], ...] (the data's metres, as S.A.P), closed, snap? (m), sigma? (points) }]: each is resampled every
  // 2 mm, drawn onto the model's strongest crease within `snap` across it (the crease strength of the points there,
  // squared, as weights; only the shift across the line is kept), smoothed, and given its side vectors as the tapes' lines.
  // (None unless the parts file asks for them: every other model's lines are exactly as before.)
  for (const X of template.extraLines?.(S) ?? []) {
    const closed = !!X.closed;
    const seg = []; let Ltot = 0; const m0 = closed ? X.C.length : X.C.length - 1;
    for (let i = 0; i < m0; i++) { const l = D3(X.C[i], X.C[(i + 1) % X.C.length]); seg.push([i, Ltot, l]); Ltot += l; }
    const N = Math.max(8, Math.round(Ltot / 0.002));
    let C = Array.from({ length: closed ? N : N + 1 }, (_, k) => { const t = (k / N) * Ltot; let j = seg.findIndex(([, s0, l]) => t <= s0 + l + 1e-12); if (j < 0) j = seg.length - 1; const [i, s0, l] = seg[j], f = l > 0 ? (t - s0) / l : 0, a = X.C[i], b = X.C[(i + 1) % X.C.length]; return a.map((x, k2) => x + (b[k2] - x) * f); });
    C = gauss(C, closed, X.sigma ?? 2);
    const n = C.length, sideOf = (Q) => { let sd = Q.map((q, i) => { const a = Q[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = Q[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]; return norm(cross(norm(sub(b, a)), clothNormal(q))); }); for (let i = 1; i < n; i++) if (dot(sd[i], sd[i - 1]) < 0) sd[i] = sd[i].map((x) => -x); return gauss(sd, closed, 3).map(norm); };
    let side = sideOf(C);
    if (X.snap) {
      const r = X.snap, k0 = Math.ceil(r / G);
      const shift = C.map((q, i) => {
        const [x, y, z] = q.map((c) => Math.floor(c / G)); let sw = 0, sv = 0;
        for (let a = -k0; a <= k0; a++) for (let b = -k0; b <= k0; b++) for (let c = -k0; c <= k0; c++) for (const v of grid.get(`${x + a},${y + b},${z + c}`) ?? []) {
          const d = sub(P(v), q), across = dot(d, side[i]), along = Math.hypot(...d.map((t, k2) => t - side[i][k2] * across));
          if (Math.abs(across) > r || along > 0.003) continue;
          const w = A.crease[v] ** 2; sw += w; sv += w * across;
        }
        return sw > (X.minCrease ?? 0.002) ? sv / sw : 0;
      });
      const sm = gauss(shift.map((s) => [s, 0, 0]), closed, X.snapSigma ?? 4).map((v) => v[0]);
      C = gauss(C.map((q, i) => q.map((t, k2) => t + side[i][k2] * sm[i])), closed, 1);
      side = sideOf(C);
    }
    lines.push({ C, closed, side, cp: null, extra: true });
    if (process.env.DBG) console.log('extra line', closed ? 'closed' : 'open', C.length, 'points');
  }
  // An open line carried on up to 1.5 cm past each end along itself, stopping where it meets another line (so it closes its
  // piece there and never cuts into the piece beyond).
  {
    const near = (q, self) => { let b = 9; for (const L of lines) { if (L === self) continue; for (const c of L.C) b = Math.min(b, D3(q, c)); } return b; };
    for (const L of lines) {
      if (L.closed) continue;
      const tip = (a, b) => { const d = norm(sub(a, b)), out = []; if (near(a, L) < 0.004) return out; for (let k = 1; k <= 5; k++) { const q = a.map((x, i) => x + d[i] * 0.003 * k); out.push(q); if (near(q, L) < 0.004) break; } return out; };
      const head = tip(L.C[0], L.C[3]).reverse(), tail = tip(L.C.at(-1), L.C.at(-4));
      L.C = [...head, ...L.C, ...tail]; L.side = [...head.map(() => L.side[0]), ...L.side, ...tail.map(() => L.side.at(-1))];
    }
  }
  // segment grid
  const SG = 0.02, sk = (p) => `${Math.floor(p[0] / SG)},${Math.floor(p[1] / SG)},${Math.floor(p[2] / SG)}`, sg = new Map();
  lines.forEach((L, li) => { const n = L.C.length, m = L.closed ? n : n - 1; for (let i = 0; i < m; i++) { const c = L.C[i].map((x, k) => (x + L.C[(i + 1) % n][k]) / 2); const k = sk(c); (sg.get(k) ?? sg.set(k, []).get(k)).push([li, i]); } });
  // The cloth cut along the lines: an edge of the body crossing a line (passing within `cutTol` of it, its ends on
  // opposite sides) is cut; the pieces = the body's points flood-filled over the edges not cut.
  const segSeg = (p1, q1, p2, q2) => { // closest distance between two segments
    const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
    let s2, t2; const c = dot(d1, r), b = dot(d1, d2), den = a * e - b * b;
    s2 = den > 1e-14 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0; t2 = (b * s2 + f) / e;
    if (t2 < 0) { t2 = 0; s2 = Math.max(0, Math.min(1, -c / a)); } else if (t2 > 1) { t2 = 1; s2 = Math.max(0, Math.min(1, (b - c) / a)); }
    return D3(p1.map((x, k) => x + d1[k] * s2), p2.map((x, k) => x + d2[k] * t2));
  };
  const cutTol = template.cutTol ?? 0.006;
  const nb = new Map(); for (const t of B0.tris) for (let k = 0; k < 3; k++) { const a = A.F[t * 3 + k], b = A.F[t * 3 + (k + 1) % 3]; (nb.get(a) ?? nb.set(a, new Set()).get(a)).add(b); (nb.get(b) ?? nb.set(b, new Set()).get(b)).add(a); }
  const cutE = new Set();
  for (const [a, set] of nb) for (const b of set) {
    if (b < a) continue;
    const pa = P(a), pb = P(b), mid = pa.map((x, k) => (x + pb[k]) / 2), half = D3(pa, pb) / 2 + cutTol, n2 = Math.ceil(half / SG);
    const [x, y, z] = mid.map((c) => Math.floor(c / SG)); let cut = false;
    for (let i = -n2; i <= n2 && !cut; i++) for (let j = -n2; j <= n2 && !cut; j++) for (let k = -n2; k <= n2 && !cut; k++) for (const [li, si] of sg.get(`${x + i},${y + j},${z + k}`) ?? []) {
      const L = lines[li], n = L.C.length, c0 = L.C[si], c1 = L.C[(si + 1) % n];
      if (segSeg(pa, pb, c0, c1) > cutTol) continue;
      const sd = L.side[si], sa = dot(sub(pa, c0), sd), sb = dot(sub(pb, c0), sd);
      if (sa * sb < 0) { cut = true; break; }
    }
    if (cut) cutE.add(a * 1e6 + b);
  }
  const reg = new Int32Array(A.V).fill(-1), size = []; let nr = 0;
  for (const s0 of S.bodyPts) { if (reg[s0] >= 0) continue; const st = [s0]; reg[s0] = nr; let cnt = 0; while (st.length) { const v = st.pop(); cnt++; for (const u of nb.get(v) ?? []) if (reg[u] < 0 && !cutE.has(Math.min(u, v) * 1e6 + Math.max(u, v))) { reg[u] = nr; st.push(u); } } size.push(cnt); nr++; }
  // tiny pieces (a few points boxed in by crossing lines): joined to their biggest neighbour
  for (let pass = 0; pass < 3; pass++) for (const v of S.bodyPts) if (size[reg[v]] < (template.minRegion ?? 25)) { let best = -1; for (const u of nb.get(v)) if (size[reg[u]] >= (template.minRegion ?? 25) && (best < 0 || size[reg[u]] > size[best])) best = reg[u]; if (best >= 0) { size[reg[v]]--; reg[v] = best; size[best]++; } }
  S.reg = reg; S.size = size; S.nr = nr; S.cutE = cutE;
  lines.forEach((L) => { L.rs = L.C.map((q, i) => [1, -1].map((sg2) => { const v = nearBody(q.map((x, k) => x + L.side[i][k] * sg2 * (template.sideOff ?? 0.012)), template.sideR ?? 0.022, (u) => size[reg[u]] >= (template.minRegion ?? 25)); return v >= 0 ? reg[v] : -1; })); });
  const reach = template.lineReach2 ?? 0.035;
  const LA = new Int16Array(A.V).fill(-1), LB = new Int16Array(A.V).fill(-1), LS = new Float32Array(A.V).fill(1);
  // the pieces of their own: region ids after the cloth's
  const ownReg = new Int32Array(A.V).fill(-1);
  own.forEach((cp, k) => { const r = nr + k; size.push(cp.tris.length); for (const t of cp.tris) for (let j = 0; j < 3; j++) ownReg[A.F[t * 3 + j]] = r; });
  const allPts = new Set([...S.bodyPts]); for (const cp of S.pcs) for (const t of cp.tris) for (let j = 0; j < 3; j++) allPts.add(A.F[t * 3 + j]);
  const tapePts = [];
  for (const v of allPts) {
    if (!S.bodyPts.has(v)) {
      if (ownReg[v] >= 0) { LA[v] = LB[v] = ownReg[v]; LS[v] = 1; continue; }
      const b = nearBody(P(v), 0.04); S.reg[v] = b >= 0 ? S.reg[b] : 0;
      tapePts.push(v);
      continue;
    }
    const p = P(v), [x, y, z] = p.map((c) => Math.floor(c / SG));
    // the regions it could be: its own (or, on a tape, its two nearest)
    const own = [S.reg[v]], others = new Set([...(S.bodyPts.has(v) ? nb.get(v) ?? [] : [])].map((u) => S.reg[u]).filter((r) => r !== S.reg[v]));
    let best = null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const [li, i] of sg.get(`${x + a},${y + b},${z + c}`) ?? []) {
      const L = lines[li], n = L.C.length, a0 = L.C[i], b0 = L.C[(i + 1) % n], ab = sub(b0, a0), f = Math.max(0, Math.min(1, dot(sub(p, a0), ab) / (dot(ab, ab) || 1e-12)));
      const q = a0.map((x2, k) => x2 + ab[k] * f), d = D3(p, q); if (d > reach || (best && d >= best.d)) continue;
      const [rp, rm] = f < 0.5 ? L.rs[i] : L.rs[(i + 1) % n]; if (rp < 0 || rm < 0 || rp === rm) continue;
      if (!own.includes(rp) && !own.includes(rm)) continue;
      if (others.size && !(others.has(rp) || others.has(rm))) continue;
      const sd = L.side[f < 0.5 ? i : (i + 1) % n];
      best = { d, s: dot(sub(p, q), sd), rp, rm };
    }
    if (!best) { LA[v] = LB[v] = own[0]; LS[v] = 1; continue; }
    let { s, rp, rm } = best; if (rp > rm) { [rp, rm] = [rm, rp]; s = -s; }
    LA[v] = rp; LB[v] = rm; LS[v] = s;
  }
  // A tape's point: what the cloth right over it shows (the nearest cloth triangle's pieces and distance from their line at
  // the point's place in it), so a tape edge that shows carries the colours round it and never a fleck of another.
  const bary = (p, a, b, c) => { const v0 = sub(b, a), v1 = sub(c, a), v2 = sub(p, a), d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1), den = d00 * d11 - d01 * d01 || 1e-18, w1 = (d11 * d20 - d01 * d21) / den, w2 = (d00 * d21 - d01 * d20) / den; return [1 - w1 - w2, w1, w2]; };
  for (const v of tapePts) {
    const p = P(v), [x, y, z] = p.map((c) => Math.floor(c / TG)); let best = null;
    for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (let c = -1; c <= 1; c++) for (const t of btg.get(`${x + a},${y + bb},${z + c}`) ?? []) { const q = closestOnTri(p, P(A.F[t * 3]), P(A.F[t * 3 + 1]), P(A.F[t * 3 + 2])), d = D3(p, q); if (!best || d < best.d) best = { d, q, t }; }
    if (!best) { LA[v] = LB[v] = S.reg[v]; LS[v] = 1; continue; }
    const cs = [0, 1, 2].map((k) => A.F[best.t * 3 + k]), w = bary(best.q, ...cs.map(P)).map((u) => Math.max(0, u)), sw = w.reduce((a, u) => a + u, 0) || 1;
    if (cs.every((c) => LA[c] === LA[cs[0]] && LB[c] === LB[cs[0]])) { LA[v] = LA[cs[0]]; LB[v] = LB[cs[0]]; LS[v] = cs.reduce((acc, c, k) => acc + (w[k] / sw) * LS[c], 0); }
    else { const k = w.indexOf(Math.max(...w)); LA[v] = LA[cs[k]]; LB[v] = LB[cs[k]]; LS[v] = LS[cs[k]]; }
    // (Near a band's ring line the ring itself decides: a seam tape that runs into a band (a shoulder seam meeting the neck
    // band) has the band's colour exactly up to the ring's line and the cloth's below it, never running down the seam.)
    let ring = null;
    for (const L of lines) {
      if (!L.ring) continue;
      const n = L.C.length;
      for (let i = 0; i < n; i++) {
        const a0 = L.C[i], b0 = L.C[(i + 1) % n], ab = sub(b0, a0), f = Math.max(0, Math.min(1, dot(sub(p, a0), ab) / (dot(ab, ab) || 1e-12))), q = a0.map((x2, k) => x2 + ab[k] * f), d = D3(p, q);
        if (d > (template.ringReach ?? 0.012) || (ring && d >= ring.d)) continue;
        const j = f < 0.5 ? i : (i + 1) % n, [rp, rm] = L.rs[j];
        if (rp < 0 || rm < 0 || rp === rm) continue;
        ring = { d, s: dot(sub(p, q), L.side[j]), rp, rm };
      }
    }
    if (ring) { let { s, rp, rm } = ring; if (rp > rm) { [rp, rm] = [rm, rp]; s = -s; } LA[v] = rp; LB[v] = rm; LS[v] = s; }
  }
  return { ...S, lines, LA, LB, LS, own, ownReg, allPts };
}
