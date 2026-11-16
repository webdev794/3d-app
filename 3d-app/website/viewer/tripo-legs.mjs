// The shared converter for ready-made garments with legs (shorts, pants, leggings; MODELQ2 2026-11-16): tripo-top.mjs's
// unrolling with legs, then onto the made garment's own pattern (settings.convert.made: 'shorts' garment.js, 'trackpants'
// trackpants.js) by its own seams, so the made garment's print (body, side panels or stripes, hems, marks, objects) sits
// on any such model the same way:
//  - heights piecewise: the model's hem, crotch (settings.convert.legs, model units) and top onto the pattern's hem,
//    crotch and waist;
//  - across, per 1 cm of height, per half (front, back) and per leg: the way round stretched evenly so the model's own
//    sides (where its front and back meet) land on the pattern's side seam and its inner legs on the inner leg seam;
//  - then eased along the cloth (each point toward its neighbours on the same half; the halves' edges held), so the
//    model's folds do not make side stripes and other prints wavy.
// The model's points are never moved: only their print places.
import top from './tripo-top.mjs';
const along = (pairs, y) => { if (y <= pairs[0][0]) return pairs[0][1]; for (let i = 1; i < pairs.length; i++) if (y <= pairs[i][0]) { const [y0, x0] = pairs[i - 1], [y1, x1] = pairs[i]; return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0); } return pairs.at(-1)[1]; };
export default {
  lib: "export { buildGarment, SPECS } from './garment.js'; export { buildTrackPants } from './trackpants.js';",
  async convert(args) {
    const C = args.settings.convert ?? {}, spec = args.lib.SPECS[C.made], W = spec.worn;
    const out = await top.convert(args), D = out.data, n = D.pos.length / 3, F = D.flat, I = D.idx;
    const side = (y) => along(W.sideSeam, y), inner = (y) => (y >= W.crotch ? 0 : along(W.inner, y));
    // ---- Heights: hem, crotch and top onto the pattern's.
    let yb = Infinity, yt = -Infinity;
    for (let i = 0; i < n; i++) { yb = Math.min(yb, D.pos[i * 3 + 1]); yt = Math.max(yt, D.pos[i * 3 + 1]); }
    const yc = C.legs * D.extra.scale + D.extra.move[1], waist = spec.points?.CF?.[1] ?? W.sideSeam.at(-1)[0];
    const yOf = (y) => (y < yc ? (W.crotch * (y - yb)) / (yc - yb) : W.crotch + ((waist - W.crotch) * (y - yc)) / (yt - yc));
    for (let i = 0; i < n; i++) F[i * 2 + 1] = yOf(D.pos[i * 3 + 1]);
    // ---- Across: per 1 cm slice, half and leg, the lowest and highest |x| (1 % and 99 %), smoothed over 5 cm.
    const SL = 0.01, key = (k, h, s) => (k * 2 + h) * 2 + (s > 0 ? 1 : 0), lists = new Map();
    const slice = (i) => Math.floor((F[i * 2 + 1] + 0.1) / SL);
    for (let i = 0; i < n; i++) { const K = key(slice(i), D.back[i], F[i * 2]); (lists.get(K) ?? lists.set(K, []).get(K)).push(Math.abs(F[i * 2])); }
    const ends = new Map();
    for (const [K, l] of lists) { l.sort((a, b) => a - b); ends.set(K, [l[Math.floor(l.length * 0.01)], l[Math.min(l.length - 1, Math.floor(l.length * 0.99))]]); }
    const at = (k, h, s) => { let lo = 0, hi = 0, w = 0; for (let d = -2; d <= 2; d++) { const e = ends.get(key(k + d, h, s)); if (e) { lo += e[0]; hi += e[1]; w++; } } return w ? [lo / w, hi / w] : null; };
    for (let i = 0; i < n; i++) {
      const y = F[i * 2 + 1], s = F[i * 2] >= 0 ? 1 : -1, e = at(slice(i), D.back[i], s);
      if (!e) continue;
      const lo = D.pos[i * 3 + 1] < yc ? e[0] : 0, t = Math.min(1, Math.max(0, (Math.abs(F[i * 2]) - lo) / Math.max(1e-6, e[1] - lo)));
      // (Kept 2 mm inside the pattern's edges.)
      F[i * 2] = s * (inner(y) + 0.002 + t * (side(y) - inner(y) - 0.004));
    }
    // ---- Eased along the cloth (40 rounds; points on a half's edge held).
    const nb = Array.from({ length: n }, () => new Set()), edge = new Uint8Array(n);
    const same = (a, b) => D.back[a] === D.back[b] && Math.sign(F[a * 2]) === Math.sign(F[b * 2]);
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3]; if (same(a, b)) { nb[a].add(b); nb[b].add(a); } else { edge[a] = 1; edge[b] = 1; } }
    for (let it = 0; it < (C.ease ?? 40); it++) {
      const next = Float64Array.from(F);
      for (let i = 0; i < n; i++) { if (edge[i] || !nb[i].size) continue; let sx = 0; for (const j of nb[i]) sx += F[j * 2]; next[i * 2] = 0.5 * F[i * 2] + (0.5 * sx) / nb[i].size; }
      F.set(next);
    }
    return { ...out, report: `${out.report}\nprint places onto the made ${C.made}' seams (hem, crotch ${yc.toFixed(3)} -> ${W.crotch}, waist ${waist}; sides, inner legs), eased along the cloth` };
  },
};
