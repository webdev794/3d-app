// The AFL guernsey's ready-made model (Tripo aussie-rules-singlet.glb, 2026-11-16; tripo-convert.mjs), for the AFL > "AFL
// guernsey" tile only (look flag design.zoneColors.aflGuernsey; every other singlet keeps its own). Placed on the made
// singlet (garment.js SPECS.singlet): one uniform scale and a move, its hem to its top as the made singlet's. The model's
// shape, triangles and normals are used exactly as they are (nothing reshaped, no shade baked in).
//
// What the model is (read as data): a fitted sleeveless guernsey; a body panel with diagonal seams from each underarm to
// the front hem (its side panels), shoulder seams and front yoke seams; and its own bands sewn round the openings: a
// round crew neck band, the armhole bands and a hem band. What is added for the painter (as the basketball singlet's,
// tripo-basketball-singlet.mjs, so the same viewer code prints it):
//  - flat places: the model unrolled slice by slice (every 5 mm up): its height on the pattern from its own height, across
//    the way round its slice from the middle front (or back) as a share of the way to the line between front and back
//    (the body's side line, where it is widest; over the shoulders the shoulder seam), times the made singlet's half-width
//    there; so the print runs on smoothly round the body;
//  - `band` per point: 1 the neck band, 2 the armhole bands (each band piece beyond the body's own edge there, printed plain
//    from its swatch), 3 / 4 the inside (front / back), 5 / 6 the hem band's inside (front / back); the hem band's outside
//    is printed from its own place (the Hem part, `hemTop` high);
//  - `insert`: the side panel between the model's diagonal seam and the side line ([flat y, front x, back x] every 2 cm up
//    to the underarm), for the Side panels part (zones.js useModelTop);
//  - `neck` (the neck opening's edge, for the form, the neck label and the V cut), `neckFront` / `neckBack` (the neck on the
//    pattern, for the made singlet's outline under it: main.js).
export default {
  model: '../../tripo/aussie-rules-singlet.glb',
  lib: "export { buildGarment } from './garment.js';",
  async convert({ glb, lib, tools, debug }) {
    const { neighbours, openChains } = tools;
    const made = lib.buildGarment('singlet', { detail: true });
    made.geometry.computeBoundingBox();
    const box = made.geometry.boundingBox, { maxY } = made.frame, outline = made.outline;
    const count = glb.pos.length / 3, log = [];

    // ---- Placed: one uniform scale (its height = the made singlet's), centred left to right and front to back.
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], glb.pos[i]); hi[i % 3] = Math.max(hi[i % 3], glb.pos[i]); }
    const scale = (box.max.y - box.min.y) / (hi[1] - lo[1]);
    const move = [-scale * (lo[0] + hi[0]) / 2, box.min.y - scale * lo[1], (box.min.z + box.max.z) / 2 - scale * (lo[2] + hi[2]) / 2];
    const pos = new Float64Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = glb.pos[i] * scale + move[i % 3];
    const nor = glb.nor, P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], N = (i) => [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]];
    const dist = (a, b) => Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
    // (The model's own units, for finding its parts: y 0 hem .. 1 back neck.)
    const M = (i) => [glb.pos[i * 3], glb.pos[i * 3 + 1], glb.pos[i * 3 + 2]];
    log.push(`scale ${scale.toFixed(4)}, moved ${move.map((v) => v.toFixed(4)).join(', ')}`);
    const nb = neighbours(count, glb.idx), chains = openChains(glb.idx);
    const lenOf = (c) => { let s = 0; for (let k = 1; k < c.length; k++) s += dist(c[k], c[k - 1]); return s; };
    const ext = (c, k) => [Math.min(...c.map((v) => glb.pos[v * 3 + k])), Math.max(...c.map((v) => glb.pos[v * 3 + k]))];

    // ---- The body's own edges (open edges of the body panel, the bands are sewn on beyond them): the neck's (the long
    // chain round the neck lowest in front), each armhole's (the chain round it facing out), the hem's (the long chain round
    // the hem whose lowest point is highest: the body's foot, the hem band below it).
    const big = chains.filter((c) => c.length >= 30);
    const neckEdge = big.filter((c) => ext(c, 1)[0] > 0.7 && ext(c, 0)[1] - ext(c, 0)[0] > 0.2 && ext(c, 0)[0] < 0 && ext(c, 0)[1] > 0).sort((a, b) => ext(a, 1)[0] - ext(b, 1)[0])[0];
    const hemEdge = big.filter((c) => ext(c, 1)[1] < 0.12 && lenOf(c) > 0.9 * scale && ext(c, 0)[0] < 0 && ext(c, 0)[1] > 0 && ext(c, 2)[1] - ext(c, 2)[0] > 0.3).sort((a, b) => ext(b, 1)[0] - ext(a, 1)[0])[0];
    const out = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const [x, y, z] = M(i), d = [x, Math.max(0, y - 0.8), z], l = Math.hypot(...d) || 1;
      out[i] = (nor[i * 3] * d[0] + nor[i * 3 + 1] * d[1] + nor[i * 3 + 2] * d[2]) / l;
    }
    const armEdge = [-1, 1].map((sx) => big.filter((c) => ext(c, 1)[0] > 0.6 && ext(c, 1)[1] < 0.96 && c.every((v) => glb.pos[v * 3] * sx > 0.15) && ext(c, 1)[1] - ext(c, 1)[0] > 0.2)
      .sort((a, b) => c2out(b) - c2out(a))[0]);
    function c2out(c) { return c.reduce((s, v) => s + out[v], 0) / c.length - (ext(c, 0)[1] * Math.sign(glb.pos[c[0] * 3]) > 0.27 ? 1 : 0); }
    if (!neckEdge || !hemEdge || !armEdge[0] || !armEdge[1]) throw new Error('the body edges were not found');
    log.push(`body edges: neck ${neckEdge.length} pts (y ${ext(neckEdge, 1).map((v) => v.toFixed(3))}), armholes ${armEdge.map((c) => c.length)}, hem ${hemEdge.length} pts (y ${ext(hemEdge, 1).map((v) => v.toFixed(3))})`);

    // Each edge as a curve round its own middle: by angle, the edge's height (neck, hem) or reach from the armhole's middle.
    const BINS = 72;
    const curve = (c, key, angle) => {
      const at = new Array(BINS).fill(null);
      for (const v of c) { const b = ((Math.floor(((angle(v) + Math.PI) / (2 * Math.PI)) * BINS) % BINS) + BINS) % BINS; const k = key(v); at[b] = at[b] == null ? k : (at[b] + k) / 2; }
      for (let it = 0; it < BINS; it++) for (let b = 0; b < BINS; b++) if (at[b] == null) at[b] = at[(b + 1) % BINS] ?? at[(b + BINS - 1) % BINS];
      return (a) => at[((Math.floor(((a + Math.PI) / (2 * Math.PI)) * BINS) % BINS) + BINS) % BINS];
    };
    const mid = (c, k) => c.reduce((s, v) => s + glb.pos[v * 3 + k], 0) / c.length;
    const nc = [mid(neckEdge, 0), mid(neckEdge, 2)], hc = [mid(hemEdge, 0), mid(hemEdge, 2)];
    const neckA = (v) => Math.atan2(glb.pos[v * 3 + 2] - nc[1], glb.pos[v * 3] - nc[0]);
    const neckY = curve(neckEdge, (v) => glb.pos[v * 3 + 1], neckA);
    const hemA = (v) => Math.atan2(glb.pos[v * 3 + 2] - hc[1], glb.pos[v * 3] - hc[0]);
    const hemY = curve(hemEdge, (v) => glb.pos[v * 3 + 1], hemA);
    const armC = armEdge.map((c) => [mid(c, 1), mid(c, 2)]);
    const armA = (w, v) => Math.atan2(glb.pos[v * 3 + 2] - armC[w][1], glb.pos[v * 3 + 1] - armC[w][0]);
    const armR = armEdge.map((c, w) => curve(c, (v) => Math.hypot(glb.pos[v * 3 + 1] - armC[w][0], glb.pos[v * 3 + 2] - armC[w][1]), (v) => armA(w, v)));
    const armX = armEdge.map((c) => Math.min(...c.map((v) => Math.abs(glb.pos[v * 3]))));
    const onEdge = new Uint8Array(count);
    for (const c of [neckEdge, hemEdge, ...armEdge]) for (const v of c) onEdge[v] = 1;

    // ---- The bands: beyond the body's edge (above the neck's, inside the armhole's ring, below the hem's), near it.
    const band = new Uint8Array(count);
    let hemBand = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      if (onEdge[i]) continue;
      const [x, y, z] = M(i);
      if (y > 0.7 && Math.hypot(x - nc[0], z - nc[1]) < 0.3 && y > neckY(neckA(i)) + 0.0005) { band[i] = 1; continue; }
      const w = x > 0 ? 1 : 0;
      if (Math.abs(x) > armX[w] - 0.03 && y > 0.55) {
        const r = Math.hypot(y - armC[w][0], z - armC[w][1]);
        if (r < armR[w](armA(w, i)) - 0.0005) { band[i] = 2; continue; }
      }
      if (y < 0.13 && y < hemY(hemA(i)) - 0.0005) hemBand[i] = 1;
    }
    // (The neck band whole: its edge curve is coarse where the neck edge falls steeply, which left patches of the band as
    // body; the band is the part joined to the points clearly above the edge, never through the edge itself, and not
    // more than 1.5 mm below it.)
    {
      const near = (i) => { const [x, y, z] = M(i); return y > 0.7 && Math.hypot(x - nc[0], z - nc[1]) < 0.3 && y > neckY(neckA(i)) - 0.0015; };
      const seen = new Uint8Array(count), queue = [];
      for (let i = 0; i < count; i++) if (band[i] === 1 && glb.pos[i * 3 + 1] > neckY(neckA(i)) + 0.008) { seen[i] = 1; queue.push(i); }
      for (let k = 0; k < queue.length; k++) for (const j of nb[queue[k]]) if (!seen[j] && !onEdge[j] && band[j] !== 2 && near(j)) { seen[j] = 1; queue.push(j); }
      for (const i of queue) band[i] = 1;
    }
    const cnt = (a, v) => a.reduce((s, x) => s + (x === v ? 1 : 0), 0);
    log.push(`bands: neck ${cnt(band, 1)}, armholes ${cnt(band, 2)}, hem band ${cnt(hemBand, 1)} points`);

    // ---- Inside: the points facing the body (not the bands).
    const inner = new Uint8Array(count);
    for (let i = 0; i < count; i++) if (!band[i] && out[i] < -0.25) inner[i] = 1;
    // (Mixed single points between inside points: inside.)
    for (let it = 0; it < 2; it++) for (let i = 0; i < count; i++) if (!band[i] && !inner[i] && nb[i].length && nb[i].filter((j) => inner[j]).length >= nb[i].length - 1 && out[i] < 0.2) inner[i] = 1;

    // ---- The line between front and back. Below the underarm: the body's side line (where each slice is widest, its z,
    // smoothed over height); above it the shoulder seams' z (the model's seam on top of each shoulder).
    let yLo = Infinity, yHi = -Infinity;
    for (let i = 0; i < count; i++) { yLo = Math.min(yLo, pos[i * 3 + 1]); yHi = Math.max(yHi, pos[i * 3 + 1]); }
    const SL = 0.005, NS = Math.ceil((yHi - yLo) / SL) + 1;
    const pitY = Math.min(...armEdge.map((c) => Math.min(...c.map((v) => pos[v * 3 + 1]))));
    const sideZ = [new Float64Array(NS).fill(NaN), new Float64Array(NS).fill(NaN)], sideX = [new Float64Array(NS), new Float64Array(NS)];
    for (let i = 0; i < count; i++) {
      if (inner[i] || band[i]) continue;
      const k = Math.round((pos[i * 3 + 1] - yLo) / SL), w = pos[i * 3] > 0 ? 1 : 0;
      if (Math.abs(pos[i * 3]) > sideX[w][k]) { sideX[w][k] = Math.abs(pos[i * 3]); sideZ[w][k] = pos[i * 3 + 2]; }
    }
    // (The shoulder seams: short open chains on top of the shoulders.)
    const shoulder = chains.filter((c) => c.length >= 20 && ext(c, 1)[0] > 0.9 && ext(c, 2)[1] - ext(c, 2)[0] < 0.03 && ext(c, 0)[1] - ext(c, 0)[0] > 0.08);
    const seamZ = shoulder.length ? shoulder.flat().reduce((s, v) => s + pos[v * 3 + 2], 0) / shoulder.flat().length : null;
    const kPit = Math.round((pitY - yLo) / SL);
    for (const w of [0, 1]) {
      const zs = sideZ[w];
      for (let k = 0; k < NS; k++) if (k > kPit - 4 || Number.isNaN(zs[k])) zs[k] = NaN;
      // (Up from the underarm: easing to the shoulder seam over 8 cm.)
      const lastK = (() => { for (let k = kPit - 5; k >= 0; k--) if (!Number.isNaN(zs[k])) return k; return 0; })();
      for (let k = 0; k < NS; k++) if (Number.isNaN(zs[k])) zs[k] = k > lastK ? zs[lastK] + ((seamZ ?? zs[lastK]) - zs[lastK]) * Math.min(1, (k - lastK) * SL / 0.08) : zs[lastK];
      let sm = Array.from(zs);
      for (let it = 0; it < 6; it++) sm = sm.map((_, k) => (sm[Math.max(0, k - 1)] + 2 * sm[k] + sm[Math.min(NS - 1, k + 1)]) / 4);
      sideZ[w] = Float64Array.from(sm);
    }
    const zDiv = (w, y) => sideZ[w][Math.max(0, Math.min(NS - 1, Math.round((y - yLo) / SL)))];
    // (The front panel ends at the model's own diagonal seam under each arm (its open chain from the underarm to the front
    // hem): the cloth between that seam and the side line is printed with the back, so a print on the front (the chest
    // band) ends exactly on the model's seam (QATEST 2026-11-16: the chest band's end was uneven at the side). MODELQ.)
    const diag = chains.filter((c) => c.length >= 60 && ext(c, 1)[1] - ext(c, 1)[0] > 0.4 && ext(c, 1)[1] < 0.75);
    const seamAng = [0, 1].map((w) => {
      const pts = diag.flat().filter((v) => (glb.pos[v * 3] > 0 ? 1 : 0) === w).map((v) => [pos[v * 3 + 1], Math.atan2(pos[v * 3 + 2], Math.abs(pos[v * 3]))]);
      const rows = new Map();
      for (const [y, a] of pts) { const k = Math.round(y / 0.01); rows.set(k, Math.max(rows.get(k) ?? -Infinity, a)); }
      return rows;
    });
    const seamTop = [0, 1].map((w) => Math.max(...[...seamAng[w].keys()]) * 0.01);
    const inWedge = (i) => {
      const w = pos[i * 3] > 0 ? 1 : 0, y = pos[i * 3 + 1], k = Math.round(y / 0.01);
      if (y > seamTop[w]) return false;
      let a0 = seamAng[w].get(k);
      for (let d = 1; a0 == null && d < 4; d++) a0 = seamAng[w].get(k - d) ?? seamAng[w].get(k + d);
      return a0 != null && Math.atan2(pos[i * 3 + 2], Math.abs(pos[i * 3])) < a0 - 1e-4;
    };
    const oldFront = (i) => pos[i * 3 + 2] > zDiv(pos[i * 3] > 0 ? 1 : 0, pos[i * 3 + 1]);
    const wedge = (i) => oldFront(i) && inWedge(i);
    const isFrontPt = (i) => oldFront(i) && !inWedge(i);
    log.push(`underarm at ${pitY.toFixed(3)}; shoulder seams ${shoulder.length} (z ${seamZ?.toFixed(3)}); side line z at the waist ${zDiv(0, 0.25).toFixed(3)} / ${zDiv(1, 0.25).toFixed(3)}`);

    // ---- Slices: per 2 degree step round each slice's own middle, the outside's distance from it (furthest out).
    const flatY = (y) => ((y - yLo) / (yHi - yLo)) * maxY;
    const edgeX = (y) => { let x = 0; for (let k = 0; k < outline.length; k++) { const a2 = outline[k], b2 = outline[(k + 1) % outline.length]; if ((a2.y - y) * (b2.y - y) <= 0 && a2.y !== b2.y) x = Math.max(x, Math.abs(a2.x + ((b2.x - a2.x) * (y - a2.y)) / (b2.y - a2.y))); } return x || 0.152; };
    const NB = 180, DEG = (2 * Math.PI) / NB;
    const zcOf = new Float64Array(NS);
    for (let k = 0; k < NS; k++) zcOf[k] = (zDiv(0, yLo + k * SL) + zDiv(1, yLo + k * SL)) / 2;
    const slices = Array.from({ length: NS }, () => ({ r: new Float64Array(NB), n: new Uint8Array(NB) }));
    for (let t = 0; t < glb.idx.length; t += 3) {
      const c = [glb.idx[t], glb.idx[t + 1], glb.idx[t + 2]];
      if (c.some((v) => inner[v])) continue;
      const ys = c.map((v) => pos[v * 3 + 1]), k0 = Math.ceil((Math.min(...ys) - yLo) / SL), k1 = Math.floor((Math.max(...ys) - yLo) / SL);
      for (let k = Math.max(0, k0); k <= Math.min(NS - 1, k1); k++) {
        const h = yLo + k * SL, cut = [], zc = zcOf[k];
        for (let e = 0; e < 3; e++) {
          const a2 = c[e], b2 = c[(e + 1) % 3], ya = pos[a2 * 3 + 1], yb = pos[b2 * 3 + 1];
          if ((ya - h) * (yb - h) > 0 || ya === yb) continue;
          const f = (h - ya) / (yb - ya);
          cut.push([pos[a2 * 3] + (pos[b2 * 3] - pos[a2 * 3]) * f, pos[a2 * 3 + 2] + (pos[b2 * 3 + 2] - pos[a2 * 3 + 2]) * f]);
        }
        if (cut.length < 2) continue;
        const [p0, p1] = cut, m = Math.max(2, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 0.003));
        for (let j = 0; j <= m; j++) {
          const x = p0[0] + ((p1[0] - p0[0]) * j) / m, z = p0[1] + ((p1[1] - p0[1]) * j) / m;
          const b2 = ((Math.floor((Math.atan2(z - zc, x) + Math.PI) / DEG) % NB) + NB) % NB, rr = Math.hypot(x, z - zc), S2 = slices[k];
          if (!S2.n[b2] || rr > S2.r[b2]) { S2.r[b2] = rr; S2.n[b2] = 1; }
        }
      }
    }
    const binOf = (a2) => ((Math.floor((a2 + Math.PI) / DEG) % NB) + NB) % NB;
    const walks = new Map();
    const walk = (k, front, sx) => {
      const key = `${k}:${front}:${sx}`;
      if (walks.has(key)) return walks.get(key);
      const S2 = slices[k], r = (b2) => (S2.n[b2] ? S2.r[b2] : null), y = yLo + k * SL, zc = zcOf[k];
      const midA = front ? Math.PI / 2 : -Math.PI / 2, dir = (front ? -1 : 1) * sx;
      // (As far as the line between front and back, at the side.)
      const w = sx > 0 ? 1 : 0, side = Math.atan2(zDiv(w, y) - zc, sx * Math.max(0.05, sideX[w][k] || 0.15)), TAU = 2 * Math.PI, reach = (((dir * (side - midA)) % TAU) + TAU) % TAU;
      const at = new Map();
      let s2 = null, prev = null, start = null, end = null, gap = 0;
      for (let j = 0; (j + 0.5) * DEG <= reach; j++) {
        const b2 = binOf(midA + dir * (j + 0.5) * DEG), rb = r(b2);
        if (rb == null) { if (s2 != null && ++gap > 5) break; continue; }
        gap = 0;
        const a2 = -Math.PI + (b2 + 0.5) * DEG, q = [rb * Math.cos(a2), rb * Math.sin(a2)];
        if (s2 == null) { s2 = Math.abs(q[0]); start = b2; } else s2 += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
        at.set(b2, s2); prev = q; end = b2;
      }
      const o = { at, start, end, len: s2 ?? 0 };
      walks.set(key, o);
      return o;
    };
    const arcAt = (W, a2) => { const b2 = binOf(a2); if (W.at.has(b2)) return W.at.get(b2); let best = null, bd = Infinity; for (const [bb, v] of W.at) { const d = Math.abs(((bb - b2 + NB * 1.5) % NB) - NB / 2); if (d < bd) { bd = d; best = v; } } return best ?? 0; };
    const F = new Float64Array(count * 2), back = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      const y = pos[i * 3 + 1], x = pos[i * 3], sx = x >= 0 ? 1 : -1, k = Math.max(0, Math.min(NS - 1, Math.round((y - yLo) / SL)));
      // (A point between the diagonal seam and the side line: printed with the back, at its place on the front's way round.)
      const front = isFrontPt(i), Wk = walk(k, front || wedge(i), sx), s2 = arcAt(Wk, Math.atan2(pos[i * 3 + 2] - zcOf[k], x));
      const fy = flatY(y), share = Wk.len > 1e-6 ? Math.min(1, s2 / Wk.len) : 0;
      F[i * 2] = sx * share * edgeX(fy); F[i * 2 + 1] = fy; back[i] = front ? 0 : 1;
    }

    // ---- The side panel: the model's diagonal seam under each arm (its long open chain from the underarm to the front
    // hem) on the pattern, every 2 cm up to the underarm: [y, its x on the front (else the side), on the back (else the side)].
    const seams = chains.filter((c) => c.length >= 60 && ext(c, 1)[1] - ext(c, 1)[0] > 0.4 && ext(c, 1)[1] < 0.75);
    const insert = [], pitFlat = flatY(pitY);
    for (let fy = 0; fy <= pitFlat - 0.01 + 1e-6; fy += 0.02) {
      const E = edgeX(fy), near = seams.flat().filter((v) => pos[v * 3] > 0 && Math.abs(F[v * 2 + 1] - fy) < 0.012);
      const fr = near.filter((v) => !back[v]), bk = near.filter((v) => back[v]);
      const fx = fr.length ? Math.min(E, fr.reduce((s, v) => s + F[v * 2], 0) / fr.length) : E;
      const bx = bk.length && !fr.length ? Math.min(E, bk.reduce((s, v) => s + F[v * 2], 0) / bk.length) : E;
      insert.push([+fy.toFixed(4), +fx.toFixed(4), +bx.toFixed(4)]);
    }
    log.push(`side panel seams ${seams.length}; on the pattern ${insert.map((r) => `${r[0].toFixed(2)}:${r[1].toFixed(3)}/${r[2].toFixed(3)}`).join(' ')}`);
    // (The hem band's top: the body's foot, on the pattern.)
    const hemTop = +(hemEdge.reduce((s, v) => s + F[v * 2 + 1], 0) / hemEdge.length).toFixed(4);

    // ---- Inside colours: 3 / 4 the inside (front / back), 5 / 6 the hem band's inside.
    for (let i = 0; i < count; i++) {
      if (band[i]) continue;
      if (hemBand[i] && out[i] < 0) band[i] = 5 + back[i];
      else if (inner[i]) band[i] = (hemBand[i] ? 5 : 3) + back[i];
    }

    // ---- The neck on the pattern (its edge: the neck band's top, the highest flat y per 5 mm out from the middle), front and back.
    const neckLine = (wantBack) => {
      const bins = new Map();
      for (const v of neckEdge) {
        if (back[v] !== (wantBack ? 1 : 0)) continue;
        const b2 = Math.round(Math.abs(F[v * 2]) / 0.005);
        bins.set(b2, Math.max(bins.get(b2) ?? -Infinity, F[v * 2 + 1]));
      }
      const pts = [...bins.entries()].sort((m, n) => m[0] - n[0]).map(([b2, y]) => [b2 * 0.005, y]);
      const sm = pts.map(([x], k) => [x, (pts[Math.max(0, k - 1)][1] + 2 * pts[k][1] + pts[Math.min(pts.length - 1, k + 1)][1]) / 4]);
      for (let k = 1; k < sm.length; k++) sm[k][1] = Math.max(sm[k][1], sm[k - 1][1]);
      return sm.map(([x, y]) => [+x.toFixed(4), +Math.min(y, maxY).toFixed(4)]);
    };
    const neckFront = neckLine(false), neckBack = neckLine(true);
    log.push(`hem band top ${hemTop}; neck on the pattern: front ${neckFront[0]?.[1]} .. ${neckFront.at(-1)?.join(', ')}, back ${neckBack[0]?.[1]} .. ${neckBack.at(-1)?.join(', ')}`);

    // ---- Triangles across the halves: the corners on the other half get copies on the triangle's half. No shade baked.
    const S = new Float64Array(count).fill(1);
    const OP = [...pos], ON = [...nor], OF = [...F], OB = [...back], OS = [...S], OBand = [...band], idx = [];
    const copies = new Map();
    for (let t = 0; t < glb.idx.length; t += 3) {
      const tri = [glb.idx[t], glb.idx[t + 1], glb.idx[t + 2]];
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

    // ---- The neck opening's edge, in order round it (the neck band's top: its highest points), every 1.5 cm.
    const ncx = neckEdge.reduce((s, v) => s + pos[v * 3], 0) / neckEdge.length, ncz = neckEdge.reduce((s, v) => s + pos[v * 3 + 2], 0) / neckEdge.length;
    const topBy = new Map();
    for (let i = 0; i < count; i++) if (band[i] === 1) { const a = Math.round((Math.atan2(pos[i * 3 + 2] - ncz, pos[i * 3] - ncx) * 180) / Math.PI / 6); if (!topBy.has(a) || pos[i * 3 + 1] > pos[topBy.get(a) * 3 + 1]) topBy.set(a, i); }
    // (In front from the wearer's right to the left, x rising, then round the back: angle from about 180 down to -180.)
    const ring = [...topBy.entries()].sort((p1, p2) => ((p2[0] + 360) % 60) - ((p1[0] + 360) % 60)).map(([, v]) => v);
    const neck = [];
    for (let k = 0, along = Infinity; k < ring.length; k++) {
      along += k ? dist(ring[k], ring[k - 1]) : 0;
      if (along >= 0.015) { neck.push(P(ring[k]).map((v) => +v.toFixed(5))); along = 0; }
    }
    log.push(`neck edge: ${neck.length} points`);
    const swatch = [[0.42, 0.7], [0.42, 0.6], [0.42, 0.5], [0.42, 0.4], [0.42, 0.3], [0.42, 0.2]];
    if (debug) {
      const fs = await import('node:fs');
      fs.writeFileSync(`${debug}/afl-debug.json`, JSON.stringify({ count, band: Array.from(band), back: Array.from(back), F: Array.from(F, (v) => +v.toFixed(4)) }));
    }
    return {
      data: {
        pos: Float32Array.from(OP), nor: Float32Array.from(ON), flat: Float64Array.from(OF), back: Uint8Array.from(OB), shade: Float64Array.from(OS), idx,
        extra: { scale: +scale.toFixed(6), move: move.map((v) => +v.toFixed(6)), neck, swatch, ownNeck: 'round', halves: true, inside: [3, 4, 5, 6], insert: null, hemTop, neckFront, neckBack, band: Buffer.from(Uint8Array.from(OBand).buffer).toString('base64') },
      },
      report: log.join('\n'),
    };
  },
};
