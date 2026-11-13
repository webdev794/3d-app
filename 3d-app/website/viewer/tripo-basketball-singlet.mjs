// The basketball singlet's ready-made model (Tripo, 2026-11-13; tripo-convert.mjs), for the Basketball sport's singlet
// tiles only (look flag design.zoneColors.bballSinglet; every other singlet keeps the made one). Placed on the made
// singlet (garment.js SPECS.singlet): one uniform scale, its hem to its strap tops as the made singlet's. Each point is
// printed from where the made singlet's smooth shape is nearest it (its flat pattern place), so the print, marks and
// layers sit where they sat on the made singlet; round the body below the arms the model's own side seam is the line
// between front and back (the lookup turned round the body so that seam meets the made side seam).
//
// The model's neck (a V) and armholes are bound: the cloth rolls over each opening's edge into a facing inside (to the
// chest and the upper back), and the hem is turned up inside. What is added for the painter:
//  - `band` per point (1 the neck binding, 2 an armhole's, 3 the inside): each binding is a 4-6 mm thick slab from the
//    opening's edge (where the outside rolls in) to its groove (its seam), found by how far the next surface is behind
//    the cloth; printed in the binding's plain colour (tripomesh.js, from the swatches `swatch` on the pattern, beyond
//    the outline, which the painter fills: texture.js paintModelSwatches);
//  - the facings and the hem turned up inside (3): printed plain in the body's colour, not the print turned over;
//  - `neck`: the neck opening's edge (points round it, every 1.5 cm) for the form under it, the neck label and the round
//    neck's cut (tripomesh.js).
export default {
  model: '../../tripo/basketball-jersey.glb',
  lib: "export { buildGarment } from './garment.js';",
  async convert({ glb, lib, tools, debug }) {
    const { madeSurface, neighbours, openChains } = tools;
    const made = lib.buildGarment('singlet', { detail: true });
    made.geometry.computeBoundingBox();
    const box = made.geometry.boundingBox, { minX, maxX, minY, maxY, span } = made.frame, outline = made.outline;
    const count = glb.pos.length / 3, log = [];

    // ---- Placed: one uniform scale (the model's hem to its strap tops = the made singlet's), centred left to right,
    // its middle front to back on the made singlet's.
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], glb.pos[i]); hi[i % 3] = Math.max(hi[i % 3], glb.pos[i]); }
    const scale = (box.max.y - box.min.y) / (hi[1] - lo[1]);
    const move = [-scale * (lo[0] + hi[0]) / 2, box.min.y - scale * lo[1], (box.min.z + box.max.z) / 2 - scale * (lo[2] + hi[2]) / 2];
    const pos = new Float64Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = glb.pos[i] * scale + move[i % 3];
    const nor = glb.nor, P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], N = (i) => [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]];
    const dist = (a, b) => Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
    log.push(`scale ${scale.toFixed(4)}, moved ${move.map((v) => v.toFixed(4)).join(', ')}`);

    // ---- The made singlet's pattern: its side seam's half-width by height (below the underarm) and its open edges.
    const sideX = (y) => {
      let x = 0;
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i], b = outline[(i + 1) % outline.length];
        if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) x = Math.max(x, Math.abs(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y)));
      }
      return x;
    };
    const pitY = 0.505;
    const inPoly = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
    // The outline's open edges (neck, armholes, hem: not the side seams below the underarm, nor the strap tops) as segments.
    const openSeg = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length], my = (a.y + b.y) / 2, mx = Math.abs(a.x + b.x) / 2;
      const strapTop = my > maxY - 0.004, side = my < pitY - 0.01 && my > 0.02 && mx > sideX(my) - 0.006;
      if (!strapTop && !side) openSeg.push([a, b]);
    }
    const nearOpen = (x, y) => {
      let best = null;
      for (const [a, b] of openSeg) {
        const ex = b.x - a.x, ey = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey || 1)));
        const px = a.x + ex * t, py = a.y + ey * t, d = Math.hypot(x - px, y - py);
        if (!best || d < best.d) best = { d, x: px, y: py, nx: -ey, ny: ex };
      }
      return best;
    };
    const toOpen = (x, y) => nearOpen(x, y).d;

    // ---- The made singlet's smooth shape (its worn shape without creases: garment.at), on its flat pattern and a
    // little past its open edges (3 cm round the neck, armholes and hem; never past the side seams or the strap tops),
    // front and back, as one surface for nearest-point questions.
    const STEP = 0.005, smooth = { pos: [], uv: [], idx: [] };
    for (const back of [false, true]) {
      const ids = new Map(), nx = Math.round((maxX - minX) / STEP) + 1, ny = Math.round((maxY - minY + 0.04) / STEP) + 1;
      const keep = (x, y) => y <= maxY - 0.002 && y >= minY - 0.035 && Math.abs(x) <= (y <= pitY ? sideX(Math.max(y, 0.0005)) : 0.3) && (inPoly(outline, x, y) || toOpen(x, y) < 0.03);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = minX + i * STEP, y = minY - 0.035 + j * STEP;
        if (!keep(x, y)) continue;
        const v = made.at(x, y, back);
        ids.set(j * nx + i, smooth.pos.length / 3);
        smooth.pos.push(v.x, v.y, v.z);
        smooth.uv.push(back ? 0.5 + (0.5 * (maxX - x)) / span : (0.5 * (x - minX)) / span, (y - minY) / span);
      }
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = ids.get(j * nx + i), b = ids.get(j * nx + i + 1), c = ids.get((j + 1) * nx + i), d = ids.get((j + 1) * nx + i + 1);
        if (a == null || b == null || c == null || d == null) continue;
        if (back) smooth.idx.push(a, c, b, b, c, d); else smooth.idx.push(a, b, c, b, d, c);
      }
    }
    const attr = (array) => ({ array });
    const smoothMade = { frame: made.frame, geometry: { getAttribute: (n) => (n === 'position' ? attr(smooth.pos) : n === 'uv' ? attr(smooth.uv) : null), index: attr(smooth.idx) } };
    const surface = madeSurface(smoothMade, 0.02), madeShade = madeSurface(made, 0.02);

    // ---- The model's side seams: under each arm a narrow insert (about 1.3 cm) between two seams (open edges), from the
    // hem up to `seamTop`. Their angles round the body (about its middle; 0 at the side, positive in front), by height
    // every 2 cm, smoothed: the front seam's and the back seam's (the line between the front and the back of the pattern:
    // there the made side seam is).
    const nb = neighbours(count, glb.idx);
    const chains = openChains(glb.idx);
    const seamTop = 0.43;
    const crack = [[], []];
    for (const c of chains) for (const v of c) { const [x, y, z] = P(v); if (Math.abs(x) > 0.12 && y > 0.02 && y < seamTop + 0.01 && Math.abs(z) < 0.05) crack[x > 0 ? 1 : 0].push([y, Math.atan2(z, Math.abs(x))]); }
    const seamRows = (pts, q) => {
      const rows = [];
      for (let y = 0; y <= seamTop + 0.001; y += 0.02) {
        const near = pts.filter((p) => Math.abs(p[0] - y) < 0.03).map((p) => p[1]).sort((m, n) => m - n);
        rows.push(near.length >= 2 ? near[Math.min(near.length - 1, Math.floor(q * near.length))] : null);
      }
      for (let k = 0; k < rows.length; k++) if (rows[k] == null) rows[k] = rows[k - 1] ?? rows.find((r) => r != null);
      let out = rows;
      for (let it = 0; it < 2; it++) out = out.map((_, k) => (out[Math.max(0, k - 1)] + 2 * out[k] + out[Math.min(out.length - 1, k + 1)]) / 4);
      return out;
    };
    const seamFront = crack.map((pts) => seamRows(pts, 0.85)), seamBack = crack.map((pts) => seamRows(pts, 0.15));
    const rowAt = (rows, y) => { const t = Math.max(0, Math.min(seamTop, y)) / 0.02, k = Math.min(rows.length - 2, Math.floor(t)); return rows[k] + (rows[k + 1] - rows[k]) * (t - k); };
    // (The line between front and back: the back seam, so the insert is the front's, as the made singlet's side panels
    // are at the front's edge.)
    const angleAt = (w, y) => rowAt(seamBack[w], y);
    log.push(`side insert: front seam ${seamFront.map((a) => (a.reduce((m, v) => m + v, 0) / a.length * 180 / Math.PI).toFixed(1)).join('/')} deg, back seam ${seamBack.map((a) => (a.reduce((m, v) => m + v, 0) / a.length * 180 / Math.PI).toFixed(1)).join('/')} deg in front of the side`);

    // ---- Outside or inside: the model's normal against the way out of the body there (from its middle: level below the
    // chest, from the middle of the chest above it, so a strap's top faces out and the armholes' insides face in).
    const core = 0.6, out = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const [x, y, z] = P(i), d = [x, Math.max(0, y - core), z], l = Math.hypot(...d) || 1;
      out[i] = (nor[i * 3] * d[0] + nor[i * 3 + 1] * d[1] + nor[i * 3 + 2] * d[2]) / l;
    }
    // The inside (facings): from each facing's own free edge (an open edge on the inside: the top facing's at the chest
    // and upper back, the hem's turned-up edge) over the points facing in.
    // (Only edges at least 5 cm long, most of their points facing in: not the small cracks on the straps' outside.)
    const inner = new Uint8Array(count), queue = [];
    for (const c of chains) {
      let len = 0;
      for (let k = 1; k < c.length; k++) len += dist(c[k], c[k - 1]);
      if (len < 0.05 || c.filter((v) => out[v] < -0.2).length < c.length * 0.6) continue;
      for (const v of c) if (out[v] < -0.2 && !inner[v]) { inner[v] = 1; queue.push(v); }
    }
    for (let k = 0; k < queue.length; k++) for (const w of nb[queue[k]]) if (!inner[w] && out[w] < 0) { inner[w] = 1; queue.push(w); }
    let innerCount = 0;
    for (let i = 0; i < count; i++) innerCount += inner[i];
    log.push(`inside (facings): ${innerCount} points`);

    // ---- The openings' edges (where the outside turns in): outside points next to the inside, above the underarm; one
    // group for the neck, one for each armhole (by where they are: the neck's within the straps' inner edges).
        const edge = new Uint8Array(count);
    for (let i = 0; i < count; i++) if (!inner[i] && pos[i * 3 + 1] > seamTop && nb[i].some((j) => inner[j])) edge[i] = 1;
    // Neck or armhole: by where each edge point is, seen from the front: the neck's inside the straps' middle line (at the
    // strap tops the neck's edge reaches 12.1 cm out, the armholes' starts 12.8 cm out), the armholes' outside it.
    const strapX = [0.125, 0.125];
    const which = new Uint8Array(count);   // 1 neck, 2 armhole
    for (let i = 0; i < count; i++) if (edge[i]) which[i] = Math.abs(pos[i * 3]) < strapX[pos[i * 3] > 0 ? 1 : 0] ? 1 : 2;
    const edgeCount = [0, 0, 0];
    for (let i = 0; i < count; i++) edgeCount[which[i]]++;
    log.push(`opening edges: neck ${edgeCount[1]}, armholes ${edgeCount[2]} points `);
    if (edgeCount[1] < 150 || edgeCount[2] < 150) throw new Error(`the neck and armhole edges were not found (${log.at(-1)})`);

    // ---- The bindings. Each is a slab of cloth 4-6 mm thick (its outside face, rolled over the opening's edge into its
    // inside face), sewn on where the cloth and its facing (2-3 mm apart) meet it in a groove; so its outside face is
    // where the next surface straight in behind the cloth is 3.5 mm or more away (measured along the inward normal; the
    // cloth's facing is nearer, the groove nearer still; past the facings nothing is near). Outside: from each opening's
    // edge over those points (at most 3.5 cm from it), and the groove's points beside them (so the band's colour reaches
    // into the groove). Inside: its roll (4 mm on down from the edge). Every other inside point (the facings, the hem turned up) is
    // printed plain in the body's colour (3).
    const CELL = 0.005, cells = new Map(), ckey = (a, b, c) => `${a},${b},${c}`;
    for (let t = 0; t < glb.idx.length; t += 3) {
      const lo2 = [0, 1, 2].map((k) => Math.floor(Math.min(pos[glb.idx[t] * 3 + k], pos[glb.idx[t + 1] * 3 + k], pos[glb.idx[t + 2] * 3 + k]) / CELL));
      const hi2 = [0, 1, 2].map((k) => Math.floor(Math.max(pos[glb.idx[t] * 3 + k], pos[glb.idx[t + 1] * 3 + k], pos[glb.idx[t + 2] * 3 + k]) / CELL));
      for (let a2 = lo2[0]; a2 <= hi2[0]; a2++) for (let b2 = lo2[1]; b2 <= hi2[1]; b2++) for (let c2 = lo2[2]; c2 <= hi2[2]; c2++) (cells.get(ckey(a2, b2, c2)) ?? cells.set(ckey(a2, b2, c2), []).get(ckey(a2, b2, c2))).push(t);
    }
    // (The nearest surface along a ray from o in direction d, up to maxT: Moller-Trumbore over the cells along it.)
    const ray = (o, d, maxT) => {
      let best = maxT;
      const seen = new Set();
      for (let st = 0; st <= maxT + CELL; st += CELL / 2) {
        const q = [0, 1, 2].map((k) => Math.floor((o[k] + d[k] * st) / CELL));
        for (let a2 = -1; a2 <= 1; a2++) for (let b2 = -1; b2 <= 1; b2++) for (let c2 = -1; c2 <= 1; c2++) for (const t of cells.get(ckey(q[0] + a2, q[1] + b2, q[2] + c2)) ?? []) {
          if (seen.has(t)) continue;
          seen.add(t);
          const A = P(glb.idx[t]), Bv = P(glb.idx[t + 1]), Cv = P(glb.idx[t + 2]);
          const e1 = Bv.map((v, k) => v - A[k]), e2 = Cv.map((v, k) => v - A[k]);
          const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
          if (Math.abs(det) < 1e-14) continue;
          const tv = o.map((v, k) => v - A[k]), u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
          if (u < 0 || u > 1) continue;
          const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], w = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
          if (w < 0 || u + w > 1) continue;
          const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
          if (tt > 1e-5 && tt < best) best = tt;
        }
      }
      return best;
    };
    const crestPts = [1, 2].map((w) => Array.from({ length: count }, (_, i) => i).filter((i) => which[i] === w));
    const nearCrest = (p, w) => { let d = Infinity; for (const e of crestPts[w - 1]) d = Math.min(d, Math.hypot(p[0] - pos[e * 3], p[1] - pos[e * 3 + 1], p[2] - pos[e * 3 + 2])); return d; };
    const thick = new Float64Array(count).fill(-1);
    for (let i = 0; i < count; i++) {
      if (inner[i] || which[i] || (nearCrest(P(i), 1) > 0.035 && nearCrest(P(i), 2) > 0.035)) continue;
      const n = N(i);
      thick[i] = ray(P(i).map((v, k) => v - n[k] * 0.0001), n.map((v) => -v), 0.012);
    }
    const slab = (i) => thick[i] >= 0.0035 && thick[i] < 0.0115;
    const band = new Uint8Array(count), bq = [];
    for (let i = 0; i < count; i++) if (which[i]) { band[i] = which[i]; bq.push(i); }
    for (let k = 0; k < bq.length; k++) {
      const v = bq[k];
      for (const w of nb[v]) if (!band[w] && !inner[w] && slab(w) && nearCrest(P(w), band[v]) <= 0.035) { band[w] = band[v]; bq.push(w); }
    }
    // (The groove beside it.)
    const grooveAt = [];
    for (let i = 0; i < count; i++) if (!band[i] && !inner[i] && thick[i] >= 0 && thick[i] < 0.0022) { const w = nb[i].find((j) => band[j] && !which[j]); if (w != null) grooveAt.push([i, band[w]]); }
    for (const [i, w] of grooveAt) band[i] = w;
    // (Single points left out between band points, as down the middle of the V's mitred point: taken in.)
    for (let it = 0; it < 2; it++) for (let i = 0; i < count; i++) {
      if (band[i] || inner[i]) continue;
      const on = nb[i].filter((j) => band[j] === 1 || band[j] === 2);
      if (on.length && on.length >= nb[i].length - 1) band[i] = band[on[0]];
    }
    const INSIDE = 0.004, iq = [];
    for (let i = 0; i < count; i++) if (which[i]) { band[i] = which[i]; iq.push(i); }
    for (let k = 0; k < iq.length; k++) {
      const v = iq[k], w0 = band[v];
      for (const w of nb[v]) {
        if (!inner[w] || band[w]) continue;
        if (nearCrest(P(w), w0) > INSIDE) continue;
        band[w] = w0; iq.push(w);
      }
    }
    const bandCount = [0, 0, 0, 0];
    for (let i = 0; i < count; i++) bandCount[band[i]]++;
    log.push(`bindings: neck ${bandCount[1]}, armholes ${bandCount[2]} points; inside, plain: ${bandCount[3]}`);

    // ---- Each point's flat place: the model unrolled as cloth, slice by slice (every 5 mm up). Its height on the pattern:
    // its own, its hem to its strap tops as the pattern's. Across: the way round its slice (along the cloth, from the middle
    // front, or the middle back), as a share of the way to the line between front and back below the arms (the side
    // insert's middle: the made side seam) or to the armhole's edge above them (the made armhole there); where the V
    // opens the middle, from the neck's edge at its own distance from the middle. So the side seam, the armholes and the
    // neck sit on the pattern's own, the print runs on smoothly across the chest and round the sides, and nothing is
    // pulled out of shape. Front or back: by the side insert's middle (its angle carried on up past the armholes, so
    // over the straps' tops too). The inside (facings) as the outside straight across it.
    let yLo = Infinity, yHi = -Infinity;
    for (let i = 0; i < count; i++) { yLo = Math.min(yLo, pos[i * 3 + 1]); yHi = Math.max(yHi, pos[i * 3 + 1]); }
    const flatY = (y) => ((y - yLo) / (yHi - yLo)) * maxY;
    // The pattern's outline's half-width at a height (the side seam below the underarm, the armhole above).
    const edgeX = (y) => { let x = 0; for (let k = 0; k < outline.length; k++) { const a2 = outline[k], b2 = outline[(k + 1) % outline.length]; if ((a2.y - y) * (b2.y - y) <= 0 && a2.y !== b2.y) x = Math.max(x, Math.abs(a2.x + ((b2.x - a2.x) * (y - a2.y)) / (b2.y - a2.y))); } return x || 0.152; };
    const zc = (box.min.z + box.max.z) / 2;
    const ang = (i) => Math.atan2(pos[i * 3 + 2] - zc, pos[i * 3]);
    // Slices: per 2 degree step round the body, the outside's distance from the middle (the cloth cut level there: its
    // triangles' crossings, sampled every few mm, the furthest out; none: no cloth there).
    const SL = 0.005, NS = Math.ceil((yHi - yLo) / SL) + 1, NB = 180, DEG = (2 * Math.PI) / NB;
    const slices = Array.from({ length: NS }, () => ({ r: new Float64Array(NB), n: new Uint16Array(NB) }));
    for (let t = 0; t < glb.idx.length; t += 3) {
      const c = [glb.idx[t], glb.idx[t + 1], glb.idx[t + 2]];
      if (c.some((v) => inner[v])) continue;
      const ys = c.map((v) => pos[v * 3 + 1]), k0 = Math.ceil((Math.min(...ys) - yLo) / SL), k1 = Math.floor((Math.max(...ys) - yLo) / SL);
      for (let k = Math.max(0, k0); k <= Math.min(NS - 1, k1); k++) {
        const h = yLo + k * SL, cut = [];
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
    // The way along a slice from the middle (front: 90 degrees, back: -90) to the bin `to`, on one side (sx: +1 the
    // wearer's left, x > 0): { at: the arc to each bin from the middle, start (the first bin with cloth, from the middle), end
    // (the last before a gap) }.
    const binOf = (a2) => ((Math.floor((a2 + Math.PI) / DEG) % NB) + NB) % NB;
    const walks = new Map();
    const walk = (k, front, sx) => {
      const key = `${k}:${front}:${sx}`;
      if (walks.has(key)) return walks.get(key);
      const S2 = slices[k], r = (b2) => (S2.n[b2] ? S2.r[b2] : null);
      const mid = front ? Math.PI / 2 : -Math.PI / 2, dir = (front ? -1 : 1) * sx;   // (towards the side)
      // (Only as far as the line between front and back: the side insert's middle, its angle carried on up.)
      const y = yLo + k * SL, side = sx > 0 ? angleAt(1, y) : Math.PI - angleAt(0, y), TAU = 2 * Math.PI, reach = (((dir * (side - mid)) % TAU) + TAU) % TAU;
      const steps = [], at = new Map();
      for (let j = 0; (j + 0.5) * DEG <= reach; j++) steps.push(binOf(mid + dir * (j + 0.5) * DEG));
      // (A gap of up to 5 steps (10 degrees) is only a thin slice missing points; a longer one is an opening.)
      let s2 = null, prev = null, start = null, end = null, gap = 0;
      for (const b2 of steps) {
        const rb = r(b2);
        if (rb == null) { if (s2 != null && ++gap > 5) break; continue; }
        gap = 0;
        const a2 = -Math.PI + (b2 + 0.5) * DEG, q = [rb * Math.cos(a2), rb * Math.sin(a2)];
        if (s2 == null) { s2 = Math.abs(q[0]); start = b2; } else s2 += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
        at.set(b2, s2); prev = q; end = b2;
      }
      const out = { at, start, end, len: s2 ?? 0 };
      walks.set(key, out);
      return out;
    };
    const arcAt = (W, a2) => { const b2 = binOf(a2); if (W.at.has(b2)) return W.at.get(b2); let best = null, bd = Infinity; for (const [bb, v] of W.at) { const d = Math.abs(((bb - b2 + NB * 1.5) % NB) - NB / 2); if (d < bd) { bd = d; best = v; } } return best ?? 0; };
    // The armholes' lowest edge point, each side (above it the armhole's edge is the reference).
    const pit = [Infinity, Infinity];
    for (let i = 0; i < count; i++) if (which[i] === 2) { const w = pos[i * 3] > 0 ? 1 : 0; pit[w] = Math.min(pit[w], pos[i * 3 + 1]); }
    log.push(`underarms at ${pit.map((v) => v.toFixed(3)).join(' / ')}`);
    if (debug === 'walks') for (const y of [0.2, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]) {
      const k = Math.round((y - yLo) / SL), deg = (b2) => (b2 == null ? '-' : (-180 + (b2 + 0.5) * 2).toFixed(0));
      const row = [[true, 1], [true, -1], [false, 1], [false, -1]].map(([f, sx]) => { const W = walk(k, f, sx); return `${f ? 'F' : 'B'}${sx > 0 ? 'L' : 'R'} ${deg(W.start)}..${deg(W.end)} len ${W.len.toFixed(3)}`; });
      log.push(`walk y ${y}: ${row.join(' | ')}`);
    }
    // Below the arms, which side of the seams each point is on: the front, the insert or the back, grown out together from
    // the points clearly in each (the seams are open edges: nothing grows across them).
    const region = new Int8Array(count), rq = [];
    for (let i = 0; i < count; i++) {
      const y = pos[i * 3 + 1];
      if (inner[i] || y > seamTop) continue;
      const w = pos[i * 3] > 0 ? 1 : 0, a2 = Math.atan2(pos[i * 3 + 2] - zc, Math.abs(pos[i * 3])), f = rowAt(seamFront[w], y), b2 = rowAt(seamBack[w], y);
      if (Math.abs(a2 - (f + b2) / 2) > 0.4) continue;
      const lab = a2 > f + 0.05 ? 1 : a2 < b2 - 0.05 ? 3 : a2 < f - 0.012 && a2 > b2 + 0.012 ? 2 : 0;
      if (lab) { region[i] = lab; rq.push(i); }
    }
    for (let k = 0; k < rq.length; k++) for (const w of nb[rq[k]]) if (!region[w] && !inner[w] && pos[w * 3 + 1] <= seamTop) { region[w] = region[rq[k]]; rq.push(w); }
    // (The insert's width on the pattern: its own across the cloth, about 1.3 cm, as the arc there.)
    const INSERT_W = 0.0125;
    const F = new Float64Array(count * 2), back = new Uint8Array(count), shade = new Float64Array(count);
    const place = (i) => {
      const y = pos[i * 3 + 1], x = pos[i * 3], sx = x >= 0 ? 1 : -1, w = sx > 0 ? 1 : 0, a2 = ang(i);
      // (Its angle from the side, positive in front, on its own side.)
      const fromSide = Math.atan2(pos[i * 3 + 2] - zc, Math.abs(x));
      const isFront = region[i] ? region[i] < 3 : fromSide >= angleAt(w, y);
      const fy = flatY(y), k = Math.max(0, Math.min(NS - 1, Math.round((y - yLo) / SL)));
      // (The slice's walk; for a point beyond its last bin, at least on it.)
      const Wk = walk(k, isFront, sx);
      const s2 = arcAt(Wk, a2);
      const ref = Wk.len;
      const share = ref > 1e-6 ? s2 / ref : 0;
      // (The side insert: from its front seam's line on the pattern (INSERT_W in from the side seam) out to the side seam,
      // by the way across it; the front just short of that line. So the Side panels part fills it exactly.)
      const E = edgeX(fy);
      if (region[i] === 2) {
        const f = rowAt(seamFront[w], y), b2 = rowAt(seamBack[w], y), t = Math.max(0, Math.min(1, (f - fromSide) / Math.max(1e-4, f - b2)));
        return { x: sx * (E - INSERT_W * (1 - t)), y: fy, back: 0 };
      }
      if (isFront && y < seamTop + 0.03) {
        // (The front below the arms: out to its seam with the insert, INSERT_W in from the side seam; easing over 3 cm
        // above the insert's top to the whole way out.)
        const fa = sx > 0 ? rowAt(seamFront[w], y) : Math.PI - rowAt(seamFront[w], y), toSeam = arcAt(Wk, fa) || ref;
        const low = Math.min(1, s2 / toSeam) * (E - INSERT_W - 0.0003), t = Math.max(0, Math.min(1, (y - seamTop) / 0.03));
        return { x: sx * (low + (share * E - low) * t), y: fy, back: 0 };
      }
      return { x: sx * share * E, y: fy, back: isFront ? 0 : 1 };
    };
    for (let i = 0; i < count; i++) {
      const q = place(i);
      F[i * 2] = q.x; F[i * 2 + 1] = q.y; back[i] = q.back;
      shade[i] = madeShade.nearest(P(i), inner[i] ? null : N(i), { turn: inner[i] ? 0 : 0.03 }).shade;
    }
    // The inside past the bindings, printed plain (tripomesh.js, texture.js paintModelSwatches): 3 the front's facing, 4
    // the back's, 5 / 6 the hem turned up inside (front / back).
    for (let i = 0; i < count; i++) if (inner[i] && !band[i]) band[i] = (pos[i * 3 + 1] < 0.12 ? 5 : 3) + back[i];

    // ---- The model's own lines on the pattern, for its painter and its made singlet (main.js, texture.js):
    // `insert`: the side insert's two seams under each arm, [flat y, front seam x, back seam x] every 2 cm (right half;
    // the Side panels part fills between them); `hemTop`: the top of the hem turned up inside (the Hem part's height);
    // `neckFront` / `neckBack`: the neck opening's edge on the front and the back of the pattern, [x, y] from the middle
    // out every 5 mm (the made singlet's outline there, so the 2D panels show the model's V and its high back neck).
    const insert = [];
    for (let y = 0; y <= seamTop + 1e-6; y += 0.02) {
      const k = Math.max(0, Math.min(NS - 1, Math.round((Math.max(y, 0.01) - yLo) / SL))), fy = flatY(y);
      const Wf = walk(k, true, 1), Wb = walk(k, false, 1);
      const refF = Wf.len, refB = Wb.len;
      if (!(refF > 0.05 && refB > 0.05)) continue;
      insert.push([+fy.toFixed(4), +(edgeX(fy) - INSERT_W).toFixed(4), +edgeX(fy).toFixed(4)]);
    }
    log.push(`side insert on the pattern: x ${Math.min(...insert.map((r) => Math.min(r[1], r[2]))).toFixed(3)}..${Math.max(...insert.map((r) => edgeX(r[0]))).toFixed(3)}`);
    const hemChain = chains.filter((c) => c.length > 4 && c.every((v) => pos[v * 3 + 1] < 0.1) && c.filter((v) => inner[v]).length > c.length / 2);
    const hemPts = hemChain.flat();
    const hemTop = hemPts.length ? +flatY(hemPts.reduce((m, v) => m + pos[v * 3 + 1], 0) / hemPts.length).toFixed(4) : 0.035;
    const neckLine = (wantBack) => {
      const bins = new Map();
      for (let i = 0; i < count; i++) {
        if (which[i] !== 1 || (pos[i * 3 + 2] < zc) !== wantBack) continue;
        const b2 = Math.round(Math.abs(F[i * 2]) / 0.005);
        bins.set(b2, Math.max(bins.get(b2) ?? -Infinity, F[i * 2 + 1]));
      }
      const pts = [...bins.entries()].sort((m, n) => m[0] - n[0]).map(([b2, y]) => [b2 * 0.005, y]);
      // (Smoothed, and rising outwards: the opening's edge.)
      const sm = pts.map(([x], k) => [x, (pts[Math.max(0, k - 1)][1] + 2 * pts[k][1] + pts[Math.min(pts.length - 1, k + 1)][1]) / 4]);
      for (let k = 1; k < sm.length; k++) sm[k][1] = Math.max(sm[k][1], sm[k - 1][1]);
      return sm.map(([x, y]) => [+x.toFixed(4), +Math.min(y, maxY).toFixed(4)]);
    };
    const neckFront = neckLine(false), neckBack = neckLine(true);
    log.push(`hem turned up ${hemTop} m; neck on the pattern: front ${neckFront[0]?.[1]} at the middle to ${neckFront.at(-1)?.join(', ')}, back ${neckBack[0]?.[1]} to ${neckBack.at(-1)?.join(', ')}`);

    // ---- The shade: the made singlet's (its even light, the soft shade under the arms), smoothed over 3-4 cm so none of
    // the made singlet's own folds comes with it (the model has its own).
    let S = shade;
    for (let it = 0; it < 25; it++) { const T = new Float64Array(count); for (let i = 0; i < count; i++) { let s = S[i]; for (const j of nb[i]) s += S[j]; T[i] = s / (nb[i].length + 1); } S = T; }

    // ---- Triangles across the halves (the side seams, the strap tops): the corners on the other half get copies on the
    // triangle's half.
    // (The inside is one even colour: no baked shade on it.)
    for (let i = 0; i < count; i++) if (band[i] >= 3) S[i] = 1;
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

    // ---- The neck opening's edge, in order round it (the top of its roll: of its edge points, the highest): in front
    // (the V, seen from the front) every 1 cm across, behind (seen from above, about the opening's middle) every 8 degrees
    // round; every 1.5 cm along.
    const neckPts = [];
    for (let i = 0; i < count; i++) if (which[i] === 1) neckPts.push(i);
    const cx = neckPts.reduce((s2, v) => s2 + pos[v * 3], 0) / neckPts.length, cz = neckPts.reduce((s2, v) => s2 + pos[v * 3 + 2], 0) / neckPts.length;
    const front = new Map(), behind = new Map();
    for (const v of neckPts) {
      const isFront = pos[v * 3 + 2] > cz;
      const k = isFront ? Math.round(pos[v * 3] / 0.01) : Math.round((Math.atan2(pos[v * 3 + 2] - cz, pos[v * 3] - cx) * 180) / Math.PI / 8);
      const m = isFront ? front : behind;
      if (!m.has(k) || pos[v * 3 + 1] > pos[m.get(k) * 3 + 1]) m.set(k, v);
    }
    // (In front from the wearer's right to the left, x rising; behind from the left round to the right, the angle falling
    // from 0 to -180.)
    const ring = [...[...front.entries()].sort((p1, p2) => p1[0] - p2[0]).map(([, v]) => v), ...[...behind.entries()].sort((p1, p2) => p2[0] - p1[0]).map(([, v]) => v)];
    const neck = [];
    for (let k = 0, along = Infinity; k < ring.length; k++) {
      along += k ? dist(ring[k], ring[k - 1]) : 0;
      if (along >= 0.015) { neck.push(P(ring[k]).map((v) => +v.toFixed(5))); along = 0; }
    }
    log.push(`neck edge: ${neck.length} points, lowest in front y ${Math.min(...neck.filter((p) => p[2] > 0).map((p) => p[1])).toFixed(3)}`);

    // Where the painter puts the plain colours (the front half of the pattern, beyond the outline): the neck binding's,
    // the armholes', the inside's (front, back, hem front, hem back).
    const swatch = [[0.42, 0.7], [0.42, 0.6], [0.42, 0.5], [0.42, 0.4], [0.42, 0.3], [0.42, 0.2]];

    if (debug) {
      const fs = await import('node:fs');
      fs.writeFileSync(`${debug}/singlet-debug.json`, JSON.stringify({ count, F: Array.from(F, (v) => +v.toFixed(4)), back: Array.from(back), inner: Array.from(inner), band: Array.from(band), edge: Array.from(which), out: Array.from(out, (v) => +v.toFixed(2)), outline: outline.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4)]), neck }));
    }
    return {
      data: {
        pos: Float32Array.from(OP), nor: Float32Array.from(ON), flat: Float64Array.from(OF), back: Uint8Array.from(OB), shade: Float64Array.from(OS), idx,
        extra: { scale: +scale.toFixed(6), move: move.map((v) => +v.toFixed(6)), neck, swatch, ownNeck: 'v', halves: true, inside: [3, 4, 5, 6], insert, hemTop, neckFront, neckBack, band: Buffer.from(Uint8Array.from(OBand).buffer).toString('base64') },
      },
      report: log.join('\n'),
    };
  },
};
