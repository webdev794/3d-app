// MODELQ4 2026-11-17: a ready-made model split into the pieces between its own lines.
// The model's separate pieces (triangle components through shared edges: bands, panels, yokes) lie on/under the main shell;
// each piece's footprint on the shell is that piece's area; its outline (its own free edge, resampled + smoothed) is the
// colour line. Per welded point: A, B (labels on the two sides of its nearest line) and S (signed distance, + = A side).
import { prepare, loops } from './model.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s], len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function closestOnTri(p, a, b, c) { // Ericson
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return add(add(a, ab, v), ac, w);
}

/** Resample a polyline (closed or not) every `step` m and Gaussian-smooth it (sigma m). Carries a per-point vector `dir`. */
function smoothLine(pts, dirs, closed, step = 0.002, sigma = 0.005) {
  const seg = []; let L = 0; const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], l = len(sub(b, a)); seg.push([i, L, l]); L += l; }
  const N = Math.max(4, Math.round(L / step)), R = [], D = [];
  for (let k = 0; k < (closed ? N : N + 1); k++) {
    const t = (k / N) * L; let j = seg.findIndex(([, s, l]) => t <= s + l + 1e-12); if (j < 0) j = seg.length - 1;
    const [i, s, l] = seg[j], f = l > 0 ? (t - s) / l : 0, a = pts[i], b = pts[(i + 1) % pts.length];
    R.push(add(a, sub(b, a), f)); D.push(norm(add(dirs[i], sub(dirs[(i + 1) % pts.length], dirs[i]), f)));
  }
  const h = L / N, w = Math.ceil((3 * sigma) / h), ker = []; for (let o = -w; o <= w; o++) ker.push(Math.exp(-0.5 * ((o * h) / sigma) ** 2));
  const sm = (arr) => arr.map((_, k) => { let s = [0, 0, 0], ws = 0; for (let o = -w; o <= w; o++) { let j = k + o; if (closed) j = ((j % arr.length) + arr.length) % arr.length; else if (j < 0 || j >= arr.length) continue; const kw = ker[o + w]; s = add(s, arr[j], kw); ws += kw; } return s.map((x) => x / ws); });
  return { Q: sm(R), D: sm(D).map(norm), closed };
}

export function pieces(name, template) {
  const { A, lo, hi } = prepare(name);
  const P = (v) => [A.P[v * 3], A.P[v * 3 + 1], A.P[v * 3 + 2]];
  const C = triComponents(A);
  const order = C.size.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
  const body = order[0][1];
  // Per component: its triangles, box, centroid, its own outline loops.
  const comps = order.filter(([s]) => s >= 40).map(([size, id]) => {
    const tris = []; for (let t = 0; t < A.T; t++) if (C.comp[t] === id) tris.push(t);
    const c = [0, 0, 0], bl = [9, 9, 9], bh = [-9, -9, -9]; let n = 0;
    for (const t of tris) for (let k = 0; k < 3; k++) { const p = P(A.F[t * 3 + k]); for (let i = 0; i < 3; i++) { c[i] += p[i]; bl[i] = Math.min(bl[i], p[i]); bh[i] = Math.max(bh[i], p[i]); } n++; }
    const ecount = new Map(), third = new Map();
    for (const t of tris) for (let k = 0; k < 3; k++) { const a = A.F[t * 3 + k], b = A.F[t * 3 + (k + 1) % 3], key = a < b ? a * 1e6 + b : b * 1e6 + a; ecount.set(key, (ecount.get(key) ?? 0) + 1); third.set(key, A.F[t * 3 + (k + 2) % 3]); }
    const open = []; for (const [key, cnt] of ecount) if (cnt === 1) open.push([Math.floor(key / 1e6), key % 1e6]);
    const lps = loops(open).filter((l) => l.length >= 6).map((l) => {
      const closed = open.some(([a, b]) => (a === Math.min(l[0], l.at(-1)) && b === Math.max(l[0], l.at(-1)))) || (l.length > 20 && len(sub(P(l[0]), P(l.at(-1)))) < 0.012);
      const pts = l.map(P), dirs = l.map((v, i) => {
        // inward: towards the own triangle's third point, across the edge (both edges at this point)
        let d = [0, 0, 0];
        for (const j of [i - 1, i + 1]) { const u = l[(j + l.length) % l.length]; if (!closed && (j < 0 || j >= l.length)) continue; const key = v < u ? v * 1e6 + u : u * 1e6 + v; const w = third.get(key); if (w === undefined) continue; const e = norm(sub(P(u), P(v))), q = sub(P(w), P(v)); d = add(d, norm(sub(q, e.map((x) => x * dot(q, e))))); }
        return norm(d);
      });
      return smoothLine(pts, dirs, closed);
    });
    return { id, size, tris, c: c.map((x) => x / n), bl, bh, loops: lps };
  });
  const B = comps[0];
  // The body's own openings (its open loops): neck, armholes, hem...
  const bodyOpen = []; { const ec = new Map(); for (const t of B.tris) for (let k = 0; k < 3; k++) { const a = A.F[t * 3 + k], b = A.F[t * 3 + (k + 1) % 3], key = a < b ? a * 1e6 + b : b * 1e6 + a; ec.set(key, (ec.get(key) ?? 0) + 1); } for (const [key, cnt] of ec) if (cnt === 1) bodyOpen.push([Math.floor(key / 1e6), key % 1e6]); }
  const openings = loops(bodyOpen).filter((l) => l.length >= 10).map((l) => l.map(P));
  const nearOpening = (p) => { let best = 9; for (const o of openings) for (const q of o) best = Math.min(best, len(sub(p, q))); return best; };
  // Classify each piece by the template.
  for (const cp of comps.slice(1)) {
    const lp = cp.loops.flatMap((l) => l.Q); const nearO = lp.length ? lp.filter((q) => nearOpening(q) < 0.012).length / lp.length : 0;
    cp.facts = { nearO, h: cp.bh[1] - cp.bl[1], w: cp.bh[0] - cp.bl[0], c: cp.c, top: hi[1], bottom: lo[1] };
    cp.slot = template.slot(cp.facts);
  }
  B.slot = 'body';
  const labels = [...new Set(comps.map((c) => template.key[c.slot] ?? 'body'))];
  const labelOf = (slot) => labels.indexOf(template.key[slot] ?? 'body');
  const prio = (slot) => template.prio[slot] ?? 0;
  // Grid of each piece's triangles and outline segments.
  const G = 0.02, cell = (x) => Math.floor(x / G), gk = (x, y, z) => `${x},${y},${z}`;
  const pcs = comps.slice(1).filter((c) => (template.key[c.slot] ?? 'body') !== 'body' || prio(c.slot) > 0);
  for (const cp of pcs) {
    cp.tg = new Map(); for (const t of cp.tris) { const c = [0, 1, 2].map((k) => P(A.F[t * 3 + k])).reduce((s, p) => add(s, p, 1 / 3), [0, 0, 0]); const k = gk(cell(c[0]), cell(c[1]), cell(c[2])); (cp.tg.get(k) ?? cp.tg.set(k, []).get(k)).push(t); }
    cp.sg = new Map(); cp.loops.forEach((L, li) => { const n = L.Q.length, m = L.closed ? n : n - 1; for (let i = 0; i < m; i++) { const c = add(L.Q[i], L.Q[(i + 1) % n]).map((x) => x / 2), k = gk(cell(c[0]), cell(c[1]), cell(c[2])); (cp.sg.get(k) ?? cp.sg.set(k, []).get(k)).push([li, i]); } });
  }
  const R = template.reach ?? 0.03, tolN = template.tolN ?? 0.008;
  // Per welded point of the body: per piece, distance to the piece's surface and signed distance to its outline.
  const out = { A: new Uint8Array(A.V), B: new Uint8Array(A.V), S: new Float32Array(A.V).fill(1) };
  const bodyPts = new Set(); for (const t of B.tris) for (let k = 0; k < 3; k++) bodyPts.add(A.F[t * 3 + k]);
  const pieceOf = new Int32Array(A.V).fill(-1);
  for (const cp of pcs) for (const t of cp.tris) for (let k = 0; k < 3; k++) { const v = A.F[t * 3 + k]; if (!bodyPts.has(v) && (pieceOf[v] < 0 || prio(cp.slot) > prio(pcs[pieceOf[v]].slot))) pieceOf[v] = pcs.indexOf(cp); }
  const field = (v, cp) => {
    const p = P(v), cx = cell(p[0]), cy = cell(p[1]), cz = cell(p[2]);
    let dS = 9, dL = 9, sL = 1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const t of cp.tg.get(gk(cx + a, cy + b, cz + c)) ?? []) { const q = closestOnTri(p, P(A.F[t * 3]), P(A.F[t * 3 + 1]), P(A.F[t * 3 + 2])); dS = Math.min(dS, len(sub(p, q))); }
      for (const [li, i] of cp.sg.get(gk(cx + a, cy + b, cz + c)) ?? []) {
        const L = cp.loops[li], n = L.Q.length, a0 = L.Q[i], b0 = L.Q[(i + 1) % n], ab = sub(b0, a0), f = Math.max(0, Math.min(1, dot(sub(p, a0), ab) / (dot(ab, ab) || 1e-12)));
        const q = add(a0, ab, f), d = sub(p, q), dist = len(d);
        if (dist < dL) { dL = dist; const dir = norm(add(L.D[i], sub(L.D[(i + 1) % n], L.D[i]), f)); sL = dot(d, dir) >= 0 ? 1 : -1; }
      }
    }
    return { dS, dL, sL };
  };
  for (const v of bodyPts) {
    const F = pcs.map((cp) => field(v, cp));
    // inside a piece: on its footprint (close to its surface) and, near its outline, on the outline's inner side
    const inside = F.map((f) => template.footOnly ? f.dS < tolN : f.dS < tolN && (f.dL > 0.004 ? f.dS < f.dL - 0.0005 || f.sL > 0 : f.sL > 0));
    const lab = (ins) => { let best = -1; ins.forEach((x, i) => { if (x && (best < 0 || prio(pcs[i].slot) > prio(pcs[best].slot))) best = i; }); return best < 0 ? labelOf('body') : labelOf(pcs[best].slot); };
    const own = lab(inside);
    // the nearest outline that changes the colour here
    const cand = F.map((f, i) => [f.dL, i]).filter(([d, i]) => d < R && F[i].dS < tolN + F[i].dL).sort((a, b) => a[0] - b[0]);
    let done = false;
    for (const [d, i] of cand) {
      const inn = inside.slice(), outn = inside.slice(); inn[i] = true; outn[i] = false;
      let a = lab(inn), b = lab(outn), s = d * (inside[i] ? 1 : -1);
      if (a === b) continue;
      if (a > b) { [a, b] = [b, a]; s = -s; }
      out.A[v] = a + 1; out.B[v] = b + 1; out.S[v] = s; done = true; break;
    }
    if (!done) { out.A[v] = out.B[v] = own + 1; out.S[v] = 1; }
  }
  for (let v = 0; v < A.V; v++) if (!bodyPts.has(v)) { const l = pieceOf[v] >= 0 ? labelOf(pcs[pieceOf[v]].slot) : labelOf('body'); out.A[v] = out.B[v] = l + 1; out.S[v] = 1; }
  return { A, lo, hi, comps, labels, out, pcs, openings, G, cell, gk };
}

/** The model's triangles grouped by the edges they share (a piece of its own: a band, a seam tape, a panel). */
export function triComponents(A) {
  const edges = new Map();
  for (let t = 0; t < A.T; t++) for (let k = 0; k < 3; k++) { const a = A.F[t*3+k], b = A.F[t*3+(k+1)%3]; const key = a<b? a*1e6+b : b*1e6+a; (edges.get(key) ?? edges.set(key, []).get(key)).push(t); }
  const par = Int32Array.from({length:A.T},(_, i)=>i); const f=(x)=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x];}return x;};
  for (const ts of edges.values()) if (ts.length===2) { const a=f(ts[0]), b=f(ts[1]); if(a!==b) par[a]=b; }
  const comp = new Int32Array(A.T); const ids = new Map(); for (let t=0;t<A.T;t++){const r=f(t); if(!ids.has(r)) ids.set(r, ids.size); comp[t]=ids.get(r);}
  const size = new Array(ids.size).fill(0); for (let t=0;t<A.T;t++) size[comp[t]]++;
  return { comp, size, n: ids.size, edges };
}
