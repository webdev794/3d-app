// The netball bib's ready-made model (Tripo, 2026-11-13; tripo-convert.mjs), for the Netball sport's "Netball bibs" tile
// only (look flag design.zoneColors.netballBib; every other singlet, the training bibs and the singlet with bib keep the
// made singlet). Placed on the made singlet (garment.js SPECS.singlet), whose painter prints it: one uniform scale, one
// small turn forward (the model stands leaning back, as hung on its hanger) and a move, so its shoulders sit on the made
// singlet's and the body inside it is as wide as the made singlet's.
//
// What the model is (read as data): a front bib panel hanging from the neck and shoulders, free at its sides and hem
// (the open sides); behind it, joined at the neck and shoulders, an inner layer round the front and sides of the body;
// a back yoke over the shoulders; a separate back panel (wide low on the back, a narrow strip up the spine to the yoke);
// two small pieces behind the back neck (a hanger loop). What is added for the painter:
//  - flat places: each outside surface laid flat by least squares (each edge kept as long and in the same direction as
//    on the surface: across = round the body, along = up the surface), front and back halves of the made singlet's
//    pattern, shown a little larger (`k`) so the bib fits its outline; points past the outline pulled in at the sides;
//  - `band` per point (tripomesh.js, as the basketball singlet's): 1 the neck binding (round the neck opening), 2 the
//    edge binding (the panel's sides and hem, the armhole edges, the yoke's edge), 3 the inside (the inner layer, every
//    face turned to the body, the hanger loop): printed plain from the swatches `swatch` (texture.js paintModelSwatches:
//    the neck in the Neck trim colour, else Secondary; the edges in Secondary; the inside in the body's);
//  - `neck`: the neck opening's edge (points round it every 1.5 cm) for the form under it, the neck label and the V cut.
const TILT = +(process.env.BIB_TILT ?? 9);        // degrees, top forward
const FIT = +(process.env.BIB_FIT ?? 0.175);      // half-width of the inner layer at the waist, metres
const K = +(process.env.BIB_K ?? 0.86);           // flat pattern metres per surface metre

export default {
  model: '../../tripo/netball-bib.glb',
  lib: "export { buildGarment } from './garment.js';",
  async convert({ glb, lib, tools, debug }) {
    const { neighbours, openChains, parts } = tools;
    const made = lib.buildGarment('singlet', { detail: true });
    made.geometry.computeBoundingBox();
    const box = made.geometry.boundingBox, { maxY } = made.frame, outline = made.outline;
    let count = glb.pos.length / 3, tris = glb.idx;
    const log = [];
    let part = parts(count, glb.idx).part;
    let nb = neighbours(count, glb.idx);

    // ---- Placed. The model's own frame: y up 0..1, +z the front. Turned forward about x by TILT, scaled so its inner
    // layer at the waist (model height 0.3) is FIT wide either side, its top on the made singlet's strap tops, centred
    // left to right, its body (inner layer front to back panel) centred on the made singlet's.
    const th = (TILT * Math.PI) / 180, ct = Math.cos(th), st = Math.sin(th);
    const turn = (x, y, z) => [x, y * ct - z * st, y * st + z * ct];
    const M0 = (i) => [glb.pos[i * 3], glb.pos[i * 3 + 1], glb.pos[i * 3 + 2]];
    let inner = 0;
    for (let i = 0; i < count; i++) {
      const [x, y, z] = M0(i);
      if (part[i] === 0 && Math.abs(y - 0.3) < 0.02 && z < 0 && z > -0.12) inner = Math.max(inner, Math.abs(x));
    }
    const scale = FIT / inner;
    const R = new Float64Array(count * 3);
    let nor = new Float64Array(count * 3);
    for (let i = 0; i < count; i++) {
      R.set(turn(...M0(i)), i * 3);
      const n = turn(glb.nor[i * 3], glb.nor[i * 3 + 1], glb.nor[i * 3 + 2]), l = Math.hypot(...n) || 1;
      nor.set(n.map((v) => v / l), i * 3);
    }
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], R[i]); hi[i % 3] = Math.max(hi[i % 3], R[i]); }
    // (The body's middle front to back at the waist: the inner layer's front and the back panel, at x 0.)
    let zf = -Infinity, zb = Infinity;
    for (let i = 0; i < count; i++) {
      const [x, y, z] = M0(i);
      if (Math.abs(x) > 0.03 || Math.abs(y - 0.3) > 0.03) continue;
      if (part[i] === 0 && z < 0.27 && z > 0) zf = Math.max(zf, R[i * 3 + 2]);
      if (part[i] === 1) zb = Math.min(zb, R[i * 3 + 2]);
    }
    const move = [-scale * (lo[0] + hi[0]) / 2, box.max.y - scale * hi[1], (box.min.z + box.max.z) / 2 - scale * (zf + zb) / 2];
    let pos = new Float64Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = R[i] * scale + move[i % 3];
    const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], N = (i) => [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]];
    const dist = (a, b) => Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
    const top = box.max.y, my = (i) => glb.pos[i * 3 + 1];
    log.push(`scale ${scale.toFixed(4)}, turned ${TILT} deg forward, moved ${move.map((v) => v.toFixed(4)).join(', ')}; placed y ${(lo[1] * scale + move[1]).toFixed(3)}..${top.toFixed(3)}`);

    // ---- Ray casts (nearest surface along a ray), over a grid of 1 cm cells.
    const CELL = 0.01, cells = new Map(), ck = (a, b, c) => `${a},${b},${c}`;
    for (let t = 0; t < glb.idx.length; t += 3) {
      const a = glb.idx[t], b = glb.idx[t + 1], c = glb.idx[t + 2];
      const l2 = [0, 1, 2].map((k) => Math.floor(Math.min(pos[a * 3 + k], pos[b * 3 + k], pos[c * 3 + k]) / CELL));
      const h2 = [0, 1, 2].map((k) => Math.floor(Math.max(pos[a * 3 + k], pos[b * 3 + k], pos[c * 3 + k]) / CELL));
      for (let x = l2[0]; x <= h2[0]; x++) for (let y = l2[1]; y <= h2[1]; y++) for (let z = l2[2]; z <= h2[2]; z++) (cells.get(ck(x, y, z)) ?? cells.set(ck(x, y, z), []).get(ck(x, y, z))).push(t);
    }
    const ray = (o, d, maxT, skip = -1) => {
      let best = maxT;
      const seen = new Set();
      for (let s = 0; s <= best + CELL; s += CELL / 2) {
        const q = [0, 1, 2].map((k) => Math.floor((o[k] + d[k] * s) / CELL));
        for (let a2 = -1; a2 <= 1; a2++) for (let b2 = -1; b2 <= 1; b2++) for (let c2 = -1; c2 <= 1; c2++) for (const t of cells.get(ck(q[0] + a2, q[1] + b2, q[2] + c2)) ?? []) {
          if (seen.has(t)) continue;
          seen.add(t);
          const tri = [glb.idx[t], glb.idx[t + 1], glb.idx[t + 2]];
          if (tri.includes(skip)) continue;
          const A = P(tri[0]), B = P(tri[1]), C = P(tri[2]);
          const e1 = B.map((v, k) => v - A[k]), e2 = C.map((v, k) => v - A[k]);
          const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
          if (Math.abs(det) < 1e-14) continue;
          const tv = o.map((v, k) => v - A[k]), u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
          if (u < 0 || u > 1) continue;
          const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], w = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
          if (w < 0 || u + w > 1) continue;
          const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
          if (tt > 2e-4 && tt < best) best = tt;
        }
      }
      return best;
    };

    // ---- Outside or inside: the normal against the way out of the body (from its middle line; above the chest from
    // the middle of the chest, so the straps' tops face out).
    const core = top - 0.2, out = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const [x, y, z] = P(i), d = [x, Math.max(0, y - core), z], l = Math.hypot(...d) || 1;
      out[i] = (nor[i * 3] * d[0] + nor[i * 3 + 1] * d[1] + nor[i * 3 + 2] * d[2]) / l;
    }
    // Inside (3): faces turned to the body; faces turned out but covered (the inner layer's front, under the bib panel:
    // another surface within 6 cm along its normal); the hanger loop.
    let band = new Uint8Array(count), covered = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      if (part[i] >= 2) { band[i] = 3; continue; }
      if (out[i] < -0.15) { band[i] = 3; continue; }
      const n = N(i);
      if (ray(P(i), n, 0.06, i) < 0.06) { covered[i] = 1; band[i] = 3; }
    }
    // The bib panel (below where it joins the inner layer, model height 0.8): from its front at the hem over the outside
    // points; the rest of that part below there (the inner layer's sides) is inside too.
    let panel = new Uint8Array(count);
    let seed = -1;
    for (let i = 0; i < count; i++) if (part[i] === 0 && !band[i] && my(i) < 0.1 && (seed < 0 || pos[i * 3 + 2] > pos[seed * 3 + 2])) seed = i;
    const pq = [seed];
    panel[seed] = 1;
    for (let k = 0; k < pq.length; k++) for (const w of nb[pq[k]]) if (!panel[w] && !band[w] && my(w) < 0.8) { panel[w] = 1; pq.push(w); }
    for (let i = 0; i < count; i++) if (part[i] === 0 && !band[i] && !panel[i] && my(i) < 0.8) band[i] = 3;

    // ---- Front or back half: the bib panel and the outside above it facing forward, the straps' tops by their normal
    // (as tripomesh.js reads them over the top 8 cm), the yoke and the back panel behind.
    let back = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      if (part[i] === 1) back[i] = 1;
      else if (part[i] === 0 && !panel[i]) back[i] = pos[i * 3 + 1] > top - 0.08 ? (nor[i * 3 + 2] < 0 ? 1 : 0) : (pos[i * 3 + 2] < 0 ? 1 : 0);
    }

    // ---- The neck opening's edge: round its middle seen from above (the front neck and the yoke's top at x 0), in
    // steps of 2 degrees, the innermost points of the main part high up; of those (within 1.5 cm in), the highest.
    let nzF = -Infinity, nzB = Infinity;
    for (let i = 0; i < count; i++) if (part[i] === 0 && my(i) > 0.85 && Math.abs(pos[i * 3]) < 0.01) { nzF = Math.max(nzF, pos[i * 3 + 2]); nzB = Math.min(nzB, pos[i * 3 + 2]); }
    const ncz = (nzF + nzB) / 2;
    const bins = new Map();
    for (let i = 0; i < count; i++) {
      if (part[i] !== 0 || my(i) < 0.84) continue;
      const dx = pos[i * 3], dz = pos[i * 3 + 2] - ncz, r = Math.hypot(dx, dz), k = Math.round((Math.atan2(dz, dx) * 180) / Math.PI / 2);
      (bins.get(k) ?? bins.set(k, []).get(k)).push([i, r]);
    }
    const crestNeck = [];
    for (const [k, list] of [...bins.entries()].sort((a, b) => b[0] - a[0])) {
      const rmin = Math.min(...list.map((e) => e[1]));
      let best = -1;
      for (const [i, r] of list) if (r < rmin + 0.009 && (best < 0 || pos[i * 3 + 1] > pos[best * 3 + 1])) best = i;
      crestNeck.push({ k, i: best, r: rmin });
    }
    // (Only the opening: bins whose innermost point is near the ring's typical radius, not past a strap.)
    const rs = crestNeck.map((c) => c.r).sort((a, b) => a - b), rMed = rs[Math.floor(rs.length / 2)];
    const ring = crestNeck.filter((c) => c.r < rMed * 1.6).map((c) => c.i);
    log.push(`neck opening: middle z ${ncz.toFixed(3)}, ${ring.length} edge points, radius ~${rMed.toFixed(3)}`);

    // ---- Geodesic distance over the surface (Dijkstra-like, by edges) from seeds, up to a limit.
    const geo = (seeds, limit, allow = () => true) => {
      const d = new Float64Array(count).fill(Infinity), q = [];
      for (const s of seeds) { d[s] = 0; q.push(s); }
      for (let k = 0; k < q.length; k++) {
        const v = q[k];
        for (const w of nb[v]) {
          if (!allow(w)) continue;
          const nd = d[v] + dist(v, w);
          if (nd < d[w] && nd <= limit) { d[w] = nd; q.push(w); }
        }
      }
      return d;
    };

    // ---- Clean islands: a few points of the outside alone among the inside (or the other way round) take their
    // surroundings' (the ray casts are noisy where the layers touch).
    const islands = (isIn, setTo, max) => {
      const seen = new Uint8Array(count);
      for (let s0 = 0; s0 < count; s0++) {
        if (seen[s0] || part[s0] > 1 || !isIn(s0)) continue;
        const g = [s0];
        seen[s0] = 1;
        for (let k = 0; k < g.length; k++) for (const w of nb[g[k]]) if (!seen[w] && part[w] <= 1 && isIn(w)) { seen[w] = 1; g.push(w); }
        if (g.length < max) for (const v of g) setTo(v);
      }
    };
    islands((i) => band[i] === 3, (i) => { band[i] = 0; }, 60);
    islands((i) => band[i] === 0, (i) => { band[i] = 3; }, 60);

    // ---- Distance to a set of points (straight, in 3D), over a 2 cm grid.
    const nearestTo = (list) => {
      const G = 0.02, grid = new Map(), key = (a, b, c) => `${a},${b},${c}`;
      for (const p of list) { const k = key(...p.map((v) => Math.floor(v / G))); (grid.get(k) ?? grid.set(k, []).get(k)).push(p); }
      return (q, reach) => {
        let d = Infinity;
        const c = q.map((v) => Math.floor(v / G)), r = Math.ceil(reach / G);
        for (let a2 = -r; a2 <= r; a2++) for (let b2 = -r; b2 <= r; b2++) for (let c2 = -r; c2 <= r; c2++) for (const p of grid.get(key(c[0] + a2, c[1] + b2, c[2] + c2)) ?? []) d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
        return d;
      };
    };
    // The neck's edge as a smooth line (the ring's points, each the mean of its 7 neighbours along it, every 2 mm).
    const ringPts = ring.map((_, k) => { const s = [0, 0, 0]; for (let j = -3; j <= 3; j++) { const v = ring[(k + j + ring.length) % ring.length]; for (let c = 0; c < 3; c++) s[c] += pos[v * 3 + c] / 7; } return s; });
    const dense = [];
    ringPts.forEach((p, k) => { const q = ringPts[(k + 1) % ringPts.length], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / 0.002)); for (let j = 0; j < n; j++) dense.push(p.map((v, c) => v + ((q[c] - v) * j) / n)); });
    const toNeck = nearestTo(dense);

    // ---- The neck binding (1): 1.4 cm from the opening's edge on the outside; its roll 6 mm on the inside.
    const NECK_W = 0.014, ROLL = 0.006, EDGE_W = 0.011;
    const dNeck = new Float64Array(count);
    for (let i = 0; i < count; i++) dNeck[i] = part[i] === 0 ? toNeck(P(i), 0.04) : Infinity;
    // ---- The edge binding (2): along the outside's other edges, where it ends (the panel's free sides and hem) or turns
    // to the inside (the armholes over the shoulders, the yoke's lower edge): 1.1 cm in from there; its roll 6 mm.
    const printed = (i) => part[i] === 0 && band[i] === 0;
    const open = new Uint8Array(count);
    for (const c of openChains(glb.idx)) {
      let len = 0;
      for (let k = 1; k < c.length; k++) len += dist(c[k], c[k - 1]);
      if (len >= 0.1) for (const v of c) open[v] = 1;
    }
    // (The inside next to an edge: its big pieces only, not a few points where the layers touch.)
    const bigInside = new Uint8Array(count), seenIn = new Uint8Array(count);
    for (let s0 = 0; s0 < count; s0++) {
      if (seenIn[s0] || part[s0] !== 0 || band[s0] !== 3) continue;
      const g = [s0];
      seenIn[s0] = 1;
      for (let k = 0; k < g.length; k++) for (const w of nb[g[k]]) if (!seenIn[w] && part[w] === 0 && band[w] === 3) { seenIn[w] = 1; g.push(w); }
      if (g.length >= 400) for (const v of g) bigInside[v] = 1;
    }
    const edgePts = [], edgeIdx = [];
    for (let i = 0; i < count; i++) if (printed(i) && dNeck[i] > 0.03 && (open[i] || nb[i].some((j) => bigInside[j]))) { edgePts.push(P(i)); edgeIdx.push(i); }
    const toEdge = nearestTo(edgePts);
    // (Over the surface too, so neither reaches across to a layer lying close behind: within 1.7 times along it.)
    const gNeck = geo(ring, NECK_W * 1.7, (w) => part[w] === 0), gEdge = geo(edgeIdx, EDGE_W * 1.7, (w) => part[w] === 0);
    const before = Uint8Array.from(band);
    for (let i = 0; i < count; i++) {
      if (part[i] !== 0 || part[i] > 1) continue;
      const roll = band[i] === 3;
      if (roll ? gNeck[i] <= 0.011 : dNeck[i] <= NECK_W && gNeck[i] < Infinity) band[i] = 1;
      else if (band[i] !== 1 && dNeck[i] > NECK_W + 0.004 && (roll ? gEdge[i] <= ROLL : gEdge[i] < Infinity && toEdge(P(i), 0.03) <= EDGE_W)) band[i] = 2;
    }
    const crestList = edgePts;
    // (No stray bits of a binding: pieces under 25 points go back to what they were.)
    for (const b of [1, 2]) islands((i) => band[i] === b, (i) => { band[i] = before[i]; }, 25);
    // ---- The side ties (4): where the bib is joined front to back at each side, low (the inner layer's side walls
    // under the panel's open side, model |x| >= 0.262, behind its front, below 0.42 of its height, and the back panel's
    // side tabs): their own colour area, both faces.
    const mx = (i) => glb.pos[i * 3], mz = (i) => glb.pos[i * 3 + 2];
    let ties = 0;
    for (let i = 0; i < count; i++) {
      const tie = (part[i] === 0 && !panel[i] && Math.abs(mx(i)) >= 0.262 && mz(i) <= 0.1 && my(i) <= 0.42 && band[i] !== 2 && band[i] !== 1) || (part[i] === 1 && Math.abs(mx(i)) >= 0.25);
      if (tie) { band[i] = 4; ties++; }
    }
    log.push(`side ties: ${ties} points`);

    // ---- Clean binding edges: every triangle with cloth and one binding at its corners is cut where that binding ends
    // (its distance from the neck's or the edge's line equal to its width, straight between the corners), so the
    // binding's edge is a smooth line, not the triangles' steps. The model's surface is kept exactly: the new points are on
    // its triangles' own edges. (They are the binding's: tripomesh.js prints a triangle with any cloth corner as cloth.)
    {
      const val = (i, b) => (b === 1 ? dNeck[i] - NECK_W : toEdge(P(i), 0.03) - EDGE_W);
      const NP = Array.from(pos), NN = Array.from(nor), NPart = Array.from(part), NBand = Array.from(band), NBack = Array.from(back), NPanel = Array.from(panel), NCov = Array.from(covered);
      const cache = new Map(), out = [];
      const vc = new Map(), V = (i, b) => { const k = i * 4 + b; if (!vc.has(k)) vc.set(k, val(i, b)); return vc.get(k); };
      const cross = (a, b, bb) => {
        // (a: a cloth corner, b: a binding corner.)
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (cache.has(key)) return cache.get(key);
        const va = V(a, bb), vb = V(b, bb);
        const t = va > 0 && vb <= 0 ? Math.min(0.85, Math.max(0.15, va / (va - vb))) : 0.5;
        const i = NP.length / 3;
        for (let k = 0; k < 3; k++) NP.push(pos[a * 3 + k] + (pos[b * 3 + k] - pos[a * 3 + k]) * t);
        const n = [0, 1, 2].map((k) => nor[a * 3 + k] + (nor[b * 3 + k] - nor[a * 3 + k]) * t), nl = Math.hypot(...n) || 1;
        NN.push(...n.map((v) => v / nl));
        NPart.push(part[a]); NBand.push(bb); NBack.push(back[b]); NPanel.push(panel[a]); NCov.push(0);
        cache.set(key, i);
        return i;
      };
      let cut = 0;
      for (let t = 0; t < tris.length; t += 3) {
        const c = [tris[t], tris[t + 1], tris[t + 2]], bs = c.map((v) => band[v]);
        const bset = new Set(bs.filter((b) => b === 1 || b === 2));
        if (bset.size !== 1 || !bs.includes(0) || bs.some((b) => b === 3 || b === 4) || c.some((v) => part[v] !== 0)) { out.push(...c); continue; }
        const bb = [...bset][0];
        // Walk round the triangle: cloth corners and binding corners, a new point on each edge between the two.
        const clothPoly = [], bandPoly = [];
        for (let k = 0; k < 3; k++) {
          const a = c[k], b = c[(k + 1) % 3], ca = bs[k] === 0, cb = bs[(k + 1) % 3] === 0;
          (ca ? clothPoly : bandPoly).push(a);
          if (ca !== cb) { const q = ca ? cross(a, b, bb) : cross(b, a, bb); clothPoly.push(q); bandPoly.push(q); }
        }
        for (const poly of [clothPoly, bandPoly]) for (let k = 1; k + 1 < poly.length; k++) out.push(poly[0], poly[k], poly[k + 1]);
        cut++;
      }
      pos = Float64Array.from(NP); nor = Float64Array.from(NN); part = Int32Array.from(NPart); band = Uint8Array.from(NBand); back = Uint8Array.from(NBack); panel = Uint8Array.from(NPanel); covered = Uint8Array.from(NCov);
      tris = out; count = pos.length / 3; nb = neighbours(count, tris);
      log.push(`binding edges: ${cut} triangles cut, ${cache.size} points added (${count} in all)`);
    }
    const bc = [0, 0, 0, 0, 0];
    for (let i = 0; i < count; i++) bc[band[i]]++;
    log.push(`bindings: neck ${bc[1]}, edges ${bc[2]} points (${crestList.length} on the edges); inside, plain: ${bc[3]}; printed ${bc[0]}`);

    // ---- Flat places: each half's printed points (and their bindings, so the colours meet cleanly) laid flat by least
    // squares; each edge's flat step = its 3D step in the surface's own frame there (across: level round the body;
    // along: up the surface).
    const flatOf = (sideBack) => {
      const use = new Uint8Array(count);
      for (let i = 0; i < count; i++) use[i] = part[i] <= 1 && band[i] !== 3 && band[i] !== 4 && back[i] === sideBack ? 1 : 0;
      const edges = [];
      for (let i = 0; i < count; i++) if (use[i]) for (const j of nb[i]) if (j > i && use[j]) edges.push([i, j]);
      const tgt = edges.map(([a, b]) => {
        let n = [nor[a * 3] + nor[b * 3], nor[a * 3 + 1] + nor[b * 3 + 1], nor[a * 3 + 2] + nor[b * 3 + 2]];
        const nl = Math.hypot(...n) || 1;
        n = n.map((v) => v / nl);
        let u = sideBack ? [-n[2], 0, n[0]] : [n[2], 0, -n[0]];
        const ul = Math.hypot(...u);
        const w = Math.min(1, ul / 0.4);
        u = ul ? [(u[0] / ul) * w + (1 - w), 0, (u[2] / ul) * w] : [1, 0, 0];
        const ud = u[0] * n[0] + u[1] * n[1] + u[2] * n[2];
        u = u.map((v, k) => v - ud * n[k]);
        const l2 = Math.hypot(...u) || 1;
        u = u.map((v) => v / l2);
        const v = sideBack ? [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]] : [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
        const e = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]];
        return [e[0] * u[0] + e[1] * u[1] + e[2] * u[2], e[0] * v[0] + e[1] * v[1] + e[2] * v[2]];
      });
      // Weakly held where they are seen from the front (each part anchored), then the least squares.
      const F = new Float64Array(count * 2);
      for (let i = 0; i < count; i++) { F[i * 2] = pos[i * 3]; F[i * 2 + 1] = pos[i * 3 + 1]; }
      for (let c = 0; c < 2; c++) {
        const b = new Float64Array(count), diag = new Float64Array(count).fill(1e-6);
        edges.forEach(([a, q], k) => { const t = tgt[k][c]; b[a] -= t; b[q] += t; diag[a] += 1; diag[q] += 1; });
        for (let i = 0; i < count; i++) b[i] += 1e-6 * F[i * 2 + c];
        const apply = (x, y) => { for (let i = 0; i < count; i++) y[i] = diag[i] * x[i]; for (const [a, q] of edges) { y[a] -= x[q]; y[q] -= x[a]; } };
        const x = new Float64Array(count);
        for (let i = 0; i < count; i++) x[i] = F[i * 2 + c];
        const r = new Float64Array(count), z = new Float64Array(count), pv = new Float64Array(count), Ap = new Float64Array(count);
        apply(x, Ap);
        for (let i = 0; i < count; i++) { r[i] = b[i] - Ap[i]; z[i] = r[i] / diag[i]; pv[i] = z[i]; }
        let rz = 0;
        for (let i = 0; i < count; i++) rz += r[i] * z[i];
        for (let it = 0; it < 4000 && rz > 1e-22; it++) {
          apply(pv, Ap);
          let pAp = 0;
          for (let i = 0; i < count; i++) pAp += pv[i] * Ap[i];
          const al = rz / pAp;
          for (let i = 0; i < count; i++) { x[i] += al * pv[i]; r[i] -= al * Ap[i]; z[i] = r[i] / diag[i]; }
          let rz2 = 0;
          for (let i = 0; i < count; i++) rz2 += r[i] * z[i];
          const be = rz2 / rz;
          rz = rz2;
          for (let i = 0; i < count; i++) pv[i] = z[i] + be * pv[i];
        }
        for (let i = 0; i < count; i++) if (use[i]) F[i * 2 + c] = x[i];
      }
      return { F, use };
    };
    const front = flatOf(0), backF = flatOf(1);
    const F = new Float64Array(count * 2);
    // Each half's (and each separate part's) place: the middle at x 0 (its own middle seen from the front), its top at
    // the pattern's top; the back panel hung under the yoke where it meets it.
    const place = (half, members) => {
      let sx = 0, sw = 0, fy = -Infinity;
      for (const i of members) { sx += half.F[i * 2] - pos[i * 3]; sw++; }
      for (const i of members) fy = Math.max(fy, half.F[i * 2 + 1]);
      return { dx: -sx / sw, fy };
    };
    const TOPF = maxY - 0.003;
    const memF = [], memY = [], memB = [];
    for (let i = 0; i < count; i++) {
      if (front.use[i]) memF.push(i);
      if (backF.use[i]) (part[i] === 1 ? memB : memY).push(i);
    }
    // front
    {
      const { dx, fy } = place(front, memF);
      for (const i of memF) { F[i * 2] = K * (front.F[i * 2] + dx); F[i * 2 + 1] = TOPF - K * (fy - front.F[i * 2 + 1]); }
    }
    // the yoke (back of the main part)
    {
      const { dx, fy } = place(backF, memY);
      for (const i of memY) { F[i * 2] = K * (backF.F[i * 2] + dx); F[i * 2 + 1] = TOPF - K * (fy - backF.F[i * 2 + 1]); }
    }
    // the back panel: its top point under the nearest yoke point (by height on the surface below it)
    {
      let t = memB[0];
      for (const i of memB) if (pos[i * 3 + 1] > pos[t * 3 + 1]) t = i;
      let q = memY[0];
      for (const i of memY) if (dist(i, t) < dist(q, t)) q = i;
      const fyT = F[q * 2 + 1] - K * dist(q, t);
      let sx = 0;
      for (const i of memB) sx += backF.F[i * 2] - pos[i * 3];
      const dx = -sx / memB.length;
      for (const i of memB) { F[i * 2] = K * (backF.F[i * 2] + dx); F[i * 2 + 1] = fyT - K * (backF.F[t * 2 + 1] - backF.F[i * 2 + 1]); }
      log.push(`back panel hung ${(dist(q, t) * 100).toFixed(1)} cm under the yoke; `);
    }

    // ---- Into the made singlet's outline (the painter prints inside it only): at each height on the pattern, points
    // past its side pulled in (the outer part of that row squeezed, its middle as it is), 5 mm inside.
    const sideX = (y) => {
      let x = 0;
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i], b = outline[(i + 1) % outline.length];
        if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) x = Math.max(x, Math.abs(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y)));
      }
      return x;
    };
    const inPoly = (x, y) => { let c = false; for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) { const a = outline[i], b = outline[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
    for (const members of [memF, [...memY, ...memB]]) {
      const ROW = 0.01, wide = new Map();
      for (const i of members) { const r = Math.round(F[i * 2 + 1] / ROW); wide.set(r, Math.max(wide.get(r) ?? 0, Math.abs(F[i * 2]))); }
      const rows = [...wide.keys()].sort((a, b) => a - b), r0 = rows[0], r1 = rows.at(-1);
      const W = [];
      for (let r = r0; r <= r1; r++) W.push(wide.get(r) ?? 0);
      // (Each row's widest, as the most of the rows within 2 cm.)
      const Ws = W.map((_, k) => Math.max(...W.slice(Math.max(0, k - 2), k + 3)));
      for (const i of members) {
        const y = F[i * 2 + 1], k = Math.max(0, Math.min(Ws.length - 1, Math.round(y / ROW) - r0));
        const wb = Ws[k], wo = sideX(Math.min(maxY - 0.005, Math.max(0.01, y))) - 0.005, c = Math.min(0.1, wo * 0.55);
        const ax = Math.abs(F[i * 2]);
        if (wb > wo && ax > c) F[i * 2] = Math.sign(F[i * 2]) * (c + ((ax - c) * (wo - c)) / (wb - c));
      }
    }
    let outside = 0, outsideBand = 0;
    for (let i = 0; i < count; i++) if (front.use[i] || backF.use[i]) { if (!inPoly(F[i * 2], F[i * 2 + 1])) { if (band[i]) outsideBand++; else outside++; } }
    log.push(`flat: front y ${Math.min(...memF.map((i) => F[i * 2 + 1])).toFixed(3)}..${Math.max(...memF.map((i) => F[i * 2 + 1])).toFixed(3)}, back panel y ${Math.min(...memB.map((i) => F[i * 2 + 1])).toFixed(3)}..${Math.max(...memB.map((i) => F[i * 2 + 1])).toFixed(3)}; outside the outline: ${outside} printed points, ${outsideBand} binding points`);
    // (The inside's points: where the outside nearest them is printed, so a stray corner shows nothing odd.)
    for (let i = 0; i < count; i++) if (!front.use[i] && !backF.use[i]) { F[i * 2] = pos[i * 3] * K; F[i * 2 + 1] = Math.max(0.01, Math.min(TOPF, pos[i * 3 + 1])); }

    // ---- Shade: even outside, darker inside (the inside's own faces, under the bib panel), smoothed over a few cm.
    let S = Float64Array.from({ length: count }, (_, i) => (band[i] === 3 ? (covered[i] ? 0.62 : 0.72) : 1));
    for (let it = 0; it < 12; it++) { const T = new Float64Array(count); for (let i = 0; i < count; i++) { let s = S[i]; for (const j of nb[i]) s += S[j]; T[i] = s / (nb[i].length + 1); } S = T; }

    // ---- Triangles across the halves: the corners on the other half get copies on the triangle's half.
    const OP = [...pos], ON = [...nor], OF = [...F], OB = [...back], OS = [...S], OBand = [...band], idx = [];
    const copies = new Map();
    for (let t = 0; t < tris.length; t += 3) {
      const tri = [tris[t], tris[t + 1], tris[t + 2]];
      const side = tri.filter((v) => back[v]).length >= 2 ? 1 : 0;
      for (let k = 0; k < 3; k++) {
        const v = tri[k];
        if (back[v] === side) continue;
        const key = `${v}:${side}`;
        if (!copies.has(key)) {
          copies.set(key, OP.length / 3);
          OP.push(...P(v)); ON.push(...N(v)); OF.push(F[v * 2], F[v * 2 + 1]); OB.push(side); OS.push(S[v]); OBand.push(band[v]);
        }
        tri[k] = copies.get(key);
      }
      idx.push(...tri);
    }
    log.push(`${copies.size} seam copies, ${OP.length / 3} points`);

    // ---- The neck rim for the viewer: the ring in order (front from the wearer's right to the left, then the back
    // from the left round to the right), every 1.5 cm.
    const neck = [];
    for (let k = 0, along = Infinity; k < ring.length; k++) {
      along += k ? dist(ring[k], ring[k - 1]) : 0;
      if (along >= 0.015) { neck.push(P(ring[k]).map((v) => +v.toFixed(5))); along = 0; }
    }
    log.push(`neck edge: ${neck.length} points, front at x 0: y ${Math.max(...neck.filter((p) => p[2] > ncz && Math.abs(p[0]) < 0.02).map((p) => p[1])).toFixed(3)}`);

    const swatch = [[0.42, 0.7], [0.42, 0.6], [0.42, 0.5], [0.42, 0.4]];
    if (debug) {
      const fs = await import('node:fs');
      fs.writeFileSync(`${debug}/bib-debug.json`, JSON.stringify({ count, F: Array.from(F, (v) => +v.toFixed(4)), back: Array.from(back), band: Array.from(band), panel: Array.from(panel), part: Array.from(part), pos: Array.from(pos, (v) => +v.toFixed(4)), nor: Array.from(nor, (v) => +v.toFixed(3)), idx: Array.from(tris), outline: outline.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4)]), neck }));
    }
    return {
      data: {
        pos: Float32Array.from(OP), nor: Float32Array.from(ON), flat: Float64Array.from(OF), back: Uint8Array.from(OB), shade: Float64Array.from(OS), idx,
        extra: { scale: +scale.toFixed(6), tilt: TILT, form: 'made', swatchSpread: 0.05, areas: [null, 'bibEdge', null, 'bibTies'], move: move.map((v) => +v.toFixed(6)), neck, swatch, band: Buffer.from(Uint8Array.from(OBand).buffer).toString('base64') },
      },
      report: log.join('\n'),
    };
  },
};
