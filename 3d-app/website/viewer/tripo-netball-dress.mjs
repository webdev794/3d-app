// The netball dress's ready-made model (Tripo, 2026-11-12; tripo-convert.mjs). Placed on the made dress (garment.js
// SPECS['netball-dress'], on the female figure): one uniform scale, its hem to its strap tops as the made dress's. Each
// point is printed from where the made dress's smooth shape is nearest it (its flat pattern place), so the print, marks
// and layers sit where they sat on the made dress. The model's own seams and trims are measured on that pattern for the
// painter (netballdress.js useDressShape), so its colour areas follow them: the front side-panel seams (the panels'
// inner edges), the neck and armhole bindings (each band from its free edge to its seam) and the six bib tabs.

export default {
  model: '../../tripo/netball-dress.glb',
  lib: "export { buildGarment } from './garment.js'; export { seamX } from './netballdress.js';",
  async convert({ glb, lib, tools, debug }) {
    const { madeSurface, parts, neighbours, openChains } = tools;
    const made = lib.buildGarment('netball-dress', { detail: true });
    made.geometry.computeBoundingBox();
    const box = made.geometry.boundingBox, { minX, maxX, minY, maxY, span } = made.frame;
    const count = glb.pos.length / 3, log = [];

    // ---- Placed: one uniform scale (the model's hem to its strap tops = the made dress's), centred left to right,
    // its middle front to back on the made dress's.
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], glb.pos[i]); hi[i % 3] = Math.max(hi[i % 3], glb.pos[i]); }
    const scale = (box.max.y - box.min.y) / (hi[1] - lo[1]);
    const move = [-scale * (lo[0] + hi[0]) / 2, box.min.y - scale * lo[1], (box.min.z + box.max.z) / 2 - scale * (lo[2] + hi[2]) / 2];
    const pos = new Float64Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = glb.pos[i] * scale + move[i % 3];
    const nor = glb.nor, P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], N = (i) => [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]];
    const dist = (a, b) => Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
    log.push(`scale ${scale.toFixed(4)}, moved ${move.map((v) => v.toFixed(4)).join(', ')}`);

    // ---- The made dress's smooth shape (its worn shape without creases: garment.at), on its flat pattern and a little
    // past its open edges (3 cm round the neck, armholes and hem; never past the side seams or the strap tops), front
    // and back (the back on its raised outline, garment.js liftZ), as one surface for nearest-point questions.
    const outline = made.outline, backOutline = made.backOutline ?? made.outline;
    const inPoly = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
    const toPoly = (poly, x, y) => { let d = Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ex = b.x - a.x, ey = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey || 1))); d = Math.min(d, Math.hypot(x - a.x - ex * t, y - a.y - ey * t)); } return d; };
    const pitY = made.points.U[1];
    const STEP = 0.005, smooth = { pos: [], uv: [], idx: [] };
    for (const back of [false, true]) {
      const poly = back ? backOutline : outline, ids = new Map();
      const nx = Math.round((maxX - minX) / STEP) + 1, ny = Math.round((maxY - minY + 0.04) / STEP) + 1;
      const keep = (x, y) => y <= maxY - 0.002 && y >= minY - 0.035 && Math.abs(x) <= (y <= pitY ? lib.seamX(y) : 0.3) && (inPoly(poly, x, y) || toPoly(poly, x, y) < 0.03);
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
        // Front faces out of the body (front: +z, back: -z).
        if (back) smooth.idx.push(a, c, b, b, c, d); else smooth.idx.push(a, b, c, b, d, c);
      }
    }
    const attr = (array) => ({ array });
    const smoothMade = { frame: made.frame, geometry: { getAttribute: (n) => (n === 'position' ? attr(smooth.pos) : n === 'uv' ? attr(smooth.uv) : null), index: attr(smooth.idx) } };
    const surface = madeSurface(smoothMade, 0.02), madeShade = madeSurface(made, 0.02);

    // ---- Each point's flat place: from the nearest point of that surface (a strap's front finds the front, not its
    // back), and the made dress's baked shade nearest it.
    const F = new Float64Array(count * 2), back = new Uint8Array(count), shade = new Float64Array(count), facing = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const hit = surface.nearest(P(i), N(i), { turn: 0.03 });
      F[i * 2] = hit.flat[0]; F[i * 2 + 1] = hit.flat[1];
      back[i] = hit.back ? 1 : 0;
      facing[i] = hit.facing;
      shade[i] = madeShade.nearest(P(i), N(i), { turn: 0.03 }).shade;
    }

    // ---- The model's parts: the dress (the largest), the wearer's right armhole binding (its own part), the bib tabs.
    const { part, sizes } = parts(count, glb.idx);
    const trim = (i) => sizes[part[i]] < 400;
    log.push(`parts: ${sizes.join(' ')}`);

    // ---- Its open edges: seams (two edges side by side 1-4 mm apart: the binding seams and the front side-panel
    // seams) and free edges (each binding's own edge, the hem facing's top).
    const chains = openChains(glb.idx).map((c) => {
      const mid = [0, 1, 2].map((a) => c.reduce((s, v) => s + pos[v * 3 + a], 0) / c.length);
      let len = 0;
      for (let k = 1; k < c.length; k++) len += dist(c[k], c[k - 1]);
      return { c, mid, len, yhi: Math.max(...c.map((v) => pos[v * 3 + 1])) };
    }).filter((ch) => ch.len > 0.05);
    // (Most of a seam edge's points have another edge within 4.5 mm; a binding's free edge is 1.1-1.4 cm from its seam.)
    const close = (a, b) => a.c.filter((v) => b.c.some((w) => dist(v, w) < 0.0045)).length / a.c.length;
    const front = (ch) => ch.mid[2] > 0.02 && Math.abs(ch.mid[0]) > 0.12 && ch.mid[1] < pitY;
    for (const ch of chains) ch.seam = front(ch) || chains.reduce((s, o) => s + (o === ch ? 0 : close(ch, o)), 0) > 0.4;
    const atNeck = (ch) => Math.abs(ch.mid[0]) < 0.04 && ch.mid[1] > maxY - 0.15, atArm = (ch) => Math.abs(ch.mid[0]) > 0.09 && ch.mid[1] > maxY - 0.25 && ch.mid[2] < 0.03;
    const neckEdge = chains.filter((ch) => !ch.seam && atNeck(ch) && ch.len > 0.3), armEdges = chains.filter((ch) => !ch.seam && atArm(ch) && ch.len > 0.3);
    const bindingSeams = chains.filter((ch) => ch.seam && (atNeck(ch) || atArm(ch)));
    const sideSeams = chains.filter((ch) => ch.seam && front(ch));
    const facingTop = chains.filter((ch) => !ch.seam && Math.abs(ch.mid[0]) < 0.05 && ch.mid[1] < 0.3 && ch.len > 0.5);
    log.push(`edges: ${chains.length}: binding free edges ${neckEdge.length} neck + ${armEdges.length} armholes, binding seams ${bindingSeams.length}, front side-panel seams ${sideSeams.length}, hem facing ${facingTop.length}`);
    if (neckEdge.length !== 1 || armEdges.length !== 2 || !bindingSeams.length || !sideSeams.length) throw new Error(`not all of the model's seams were found (${log.at(-1)})`);

    // ---- A hem facing (the cloth turned up inside, up to `facingTop`): past the hem on the pattern, mirrored about it,
    // so it shows the plain margin there (as the inside), not the print turned over.
    const hemAt = (x) => {
      let y = Infinity;
      for (let k = 0; k < outline.length; k++) {
        const a = outline[k], b = outline[(k + 1) % outline.length];
        if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
        y = Math.min(y, a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));
      }
      return Number.isFinite(y) ? y : 0;
    };
    let turned = 0;
    for (let i = 0; i < count; i++) {
      if (trim(i) || facing[i] > -0.3 || pos[i * 3 + 1] > (facingTop[0]?.yhi ?? 0.25) + 0.02) continue;
      F[i * 2 + 1] = 2 * hemAt(F[i * 2]) - F[i * 2 + 1];
      turned++;
    }
    log.push(`hem facing: ${turned} points past the hem`);

    // ---- The bindings: each band, from its free edge over to its seam (its points within 1.6 cm of the free edge along
    // the cloth, not across the seam), as triangles on the pattern; the free edges as runs.
    // (inBand: 1 the neck's band, 2 an armhole's.)
    const nb = neighbours(count, glb.idx), inBand = new Uint8Array(count), seamPt = new Uint8Array(count);
    for (const ch of bindingSeams) for (const v of ch.c) seamPt[v] = 1;
    for (const [list, mark] of [[neckEdge, 1], [armEdges, 2]]) for (const ch of list) {
      const d = new Map(ch.c.map((v) => [v, 0])), queue = [...ch.c];
      while (queue.length) {
        const v = queue.shift();
        if (seamPt[v]) continue;
        for (const w of nb[v]) {
          const nd = d.get(v) + dist(v, w);
          if (nd < 0.016 && nd < (d.get(w) ?? Infinity)) { d.set(w, nd); queue.push(w); }
        }
      }
      for (const v of d.keys()) inBand[v] = mark;
    }
    const q = (v) => Math.round(v / tools.FLAT_UNIT);
    // band[binding][side]: the neck's (0) and the armholes' (1) triangles on the front (0) and the back (1) half.
    const band = [[[], []], [[], []]];
    for (let t = 0; t < glb.idx.length; t += 3) {
      const tri = [glb.idx[t], glb.idx[t + 1], glb.idx[t + 2]];
      if (!tri.every((v) => inBand[v])) continue;
      const side = tri.filter((v) => back[v]).length >= 2 ? 1 : 0, which = tri.filter((v) => inBand[v] === 2).length >= 2 ? 1 : 0;
      band[which][side].push(...tri.flatMap((v) => [q(F[v * 2]), q(F[v * 2 + 1])]));
    }
    // The free edges as runs (runs[binding][side]), split where they pass from the front to the back half; a chain is a
    // loop when its ends meet.
    const runs = [[[], []], [[], []]];
    for (const [list, which] of [[neckEdge, 0], [armEdges, 1]]) for (const ch of list) {
      let run = null;
      const loop = dist(ch.c[0], ch.c.at(-1)) < 0.02 ? [...ch.c, ch.c[0]] : ch.c;
      for (const v of loop) {
        if (!run || run.side !== back[v]) { if (run?.pts.length > 1) runs[which][run.side].push(run.pts); run = { side: back[v], pts: [] }; }
        run.pts.push([+F[v * 2].toFixed(4), +F[v * 2 + 1].toFixed(4)]);
      }
      if (run?.pts.length > 1) runs[which][run.side].push(run.pts);
    }
    log.push(`bindings: neck ${band[0][0].length / 6} + ${band[0][1].length / 6}, armholes ${band[1][0].length / 6} + ${band[1][1].length / 6} triangles (front + back)`);

    // ---- The front side-panel seams on the pattern (both sides, as one right-hand edge: top down, every 1 cm).
    const seamPts = [];
    for (const ch of sideSeams) for (const v of ch.c) if (!back[v] && facing[v] > -0.3 && F[v * 2 + 1] > 0) seamPts.push([Math.abs(F[v * 2]), F[v * 2 + 1]]);
    const yTop = Math.max(...seamPts.map((p) => p[1])), yLow = Math.min(...seamPts.map((p) => p[1])), panel = [];
    for (let y = yTop; y > yLow - 1e-6; y -= 0.01) {
      const near = seamPts.filter((p) => Math.abs(p[1] - y) < 0.012);
      if (near.length) panel.push([+(near.reduce((s, p) => s + p[0], 0) / near.length).toFixed(4), +y.toFixed(4)]);
    }
    for (let k = 1; k < panel.length - 1; k++) panel[k][0] = +((panel[k - 1][0] + 2 * panel[k][0] + panel[k + 1][0]) / 4).toFixed(4);
    log.push(`front side-panel edge: ${panel.length} points, x ${panel[0][0]} at ${panel[0][1]} to ${panel.at(-1)[0]} at ${panel.at(-1)[1]}`);

    // ---- The bib tabs (each two parts of the model: a tab and its stitched rim): their rectangles on the pattern.
    const tabs = [];
    for (let i = 0; i < count; i++) {
      if (!trim(i)) continue;
      const p = [F[i * 2], F[i * 2 + 1]];
      let t = tabs.find((tb) => Math.abs(tb.c[0] - p[0]) < 0.06 && Math.abs(tb.c[1] - p[1]) < 0.06);
      if (!t) tabs.push(t = { c: p.slice(), lo: [Infinity, Infinity], hi: [-Infinity, -Infinity] });
      for (const a of [0, 1]) { t.lo[a] = Math.min(t.lo[a], p[a]); t.hi[a] = Math.max(t.hi[a], p[a]); }
      t.c = [(t.lo[0] + t.hi[0]) / 2, (t.lo[1] + t.hi[1]) / 2];
    }
    const tabRects = tabs.map((t) => [t.c[0], t.c[1], t.hi[0] - t.lo[0], t.hi[1] - t.lo[1]].map((v) => +v.toFixed(4)));
    log.push(`tabs: ${tabRects.map((r) => `[${r.join(', ')}]`).join(' ')}`);

    // ---- The shade: the made dress's (its even light across the front, the soft shade under the bust and at the
    // waist), smoothed over 3-4 cm so none of the made dress's own folds comes with it.
    let S = shade;
    for (let it = 0; it < 25; it++) { const T = new Float64Array(count); for (let i = 0; i < count; i++) { let s = S[i]; for (const j of nb[i]) s += S[j]; T[i] = s / (nb[i].length + 1); } S = T; }

    // ---- Triangles across the side seams: the corners on the other half get copies on the triangle's half.
    const OP = [...pos], ON = [...nor], OF = [...F], OB = [], OS = [...S], idx = [];
    for (let i = 0; i < count; i++) OB.push(back[i] | (trim(i) ? 2 : 0));
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
          OP.push(...P(v)); ON.push(...N(v)); OF.push(F[v * 2], F[v * 2 + 1]); OB.push(side | (trim(v) ? 2 : 0)); OS.push(S[v]);
        }
        tri[k] = copies.get(key);
      }
      idx.push(...tri);
    }
    log.push(`${copies.size} seam copies, ${OP.length / 3} points`);

    // ---- The neck opening's rim (its binding's free edge, every 1.5 cm), for the form under it and the neck label.
    const rim = neckEdge[0].c, neck = [];
    for (let k = 0, along = Infinity; k < rim.length; k++) {
      along += k ? dist(rim[k], rim[k - 1]) : 0;
      if (along >= 0.015) { neck.push(P(rim[k]).map((v) => +v.toFixed(5))); along = 0; }
    }

    if (debug) {
      const fs = await import('node:fs');
      fs.writeFileSync(`${debug}/flat-debug.json`, JSON.stringify({ F: Array.from(F, (v) => +v.toFixed(5)), back: Array.from(back), trim: Array.from({ length: count }, (_, i) => (trim(i) ? 1 : 0)), band: Array.from(inBand, (v) => (v ? 1 : 0)), idx: Array.from(glb.idx), outline: outline.map((p) => [p.x, p.y]), backOutline: backOutline.map((p) => [p.x, p.y]), tabs: tabRects, panel, runs: [[...runs[0][0], ...runs[1][0]], [...runs[0][1], ...runs[1][1]]] }));
    }
    return {
      data: {
        pos: Float32Array.from(OP), nor: Float32Array.from(ON), flat: Float64Array.from(OF), back: Uint8Array.from(OB), shade: Float64Array.from(OS), idx,
        extra: { scale: +scale.toFixed(6), move: move.map((v) => +v.toFixed(6)), neck, layout: { tabs: tabRects, panel, runs, band: band.map((sides) => sides.map((b) => Buffer.from(Int16Array.from(b).buffer).toString('base64'))) } },
      },
      report: log.join('\n'),
    };
  },
};
