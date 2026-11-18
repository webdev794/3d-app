// The shared converter for ready-made garments with legs (shorts, pants, leggings; MODELQ2 2026-11-16): tripo-top.mjs's
// unrolling with legs, then onto the made garment's own pattern (settings.convert.made: 'shorts' garment.js, 'trackpants'
// trackpants.js) by its own seams, so the made garment's print (body, side panels or stripes, hems, marks, objects) sits
// on any such model the same way:
//  - heights as they are (the model is placed on the made garment's height);
//  - across: the way round along an ellipse fitted to each cross-section, from the centre front (back) or a leg's inner
//    side out to the side, onto the pattern from its inner edge to its side seam;
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
    // (Heights as they are (the model is placed on the made garment's height), 17 Nov: a piecewise map squeezed the legs' print
    // where the model's crotch sits higher than the pattern's (chevrons flattened); `convert.pieceHeights` keeps it.)
    const yOf = (y) => (C.pieceHeights ? (y < yc ? (W.crotch * (y - yb)) / (yc - yb) : W.crotch + ((waist - W.crotch) * (y - yc)) / (yt - yc)) : y);
    for (let i = 0; i < n; i++) F[i * 2 + 1] = yOf(D.pos[i * 3 + 1]);
    // ---- Across: the way round the cloth along an ellipse fitted to each 5 mm cross-section (smoothed over 3.5 cm): the
    // body's round its middle from the centre front (back), each leg's below the crotch round its own middle from its inner
    // side; as a share of the way to the side (where the model's front and back halves meet: the ellipse's widest point)
    // onto the pattern from its inner edge (the centre line, or the inner leg seam) to its side seam. (17 Nov: the cloth's
    // own outline seen from the front squeezed the sides, where the cloth turns away, into streaks; an ellipse runs smoothly
    // round them, as the basketball shorts' converter does.)
    const SL = 0.005, NS = Math.ceil((yt - yb) / SL) + 1, reg = (i) => (D.pos[i * 3 + 1] >= yc ? 0 : D.pos[i * 3] >= 0 ? 1 : -1);
    const box = new Map(), bk = (k, r) => k * 4 + r + 1;
    for (let i = 0; i < n; i++) { const k = Math.round((D.pos[i * 3 + 1] - yb) / SL), r = reg(i), K = bk(k, r), x = D.pos[i * 3], z = D.pos[i * 3 + 2]; const b = box.get(K) ?? box.set(K, [Infinity, -Infinity, Infinity, -Infinity, 0]).get(K); b[0] = Math.min(b[0], x); b[1] = Math.max(b[1], x); b[2] = Math.min(b[2], z); b[3] = Math.max(b[3], z); b[4]++; }
    const fitAt = (k, r) => { let cx = 0, cz = 0, a = 0, b = 0, w = 0; for (let d = -7; d <= 7; d++) { const e = box.get(bk(k + d, r)); if (!e || e[4] < 3) continue; const g = Math.exp(-0.5 * (d / 3.5) ** 2); cx += g * (r === 0 ? 0 : (e[0] + e[1]) / 2); cz += g * (e[2] + e[3]) / 2; a += g * (r === 0 ? Math.max(Math.abs(e[0]), Math.abs(e[1])) : (e[1] - e[0]) / 2); b += g * (e[3] - e[2]) / 2; w += g; } return w ? { cx: cx / w, cz: cz / w, a: Math.max(0.01, a / w), b: Math.max(0.01, b / w) } : null; };
    const fits = new Map(), fitOf = (k, r) => { const K = bk(k, r); if (!fits.has(K)) fits.set(K, fitAt(k, r)); return fits.get(K); };
    // (arc length along x = a sin s, z = b cos s from s0 to s1, Simpson)
    const arc = (a, b, s0, s1) => { const m = Math.max(2, 2 * Math.ceil(Math.abs(s1 - s0) / (Math.PI / 48))), h = (s1 - s0) / m, f = (s) => Math.sqrt(a * a * Math.cos(s) ** 2 + b * b * Math.sin(s) ** 2); let sum = f(s0) + f(s1); for (let j = 1; j < m; j++) sum += f(s0 + j * h) * (j % 2 ? 4 : 2); return (sum * h) / 3; };
    for (let i = 0; i < n; i++) {
      const k = Math.round((D.pos[i * 3 + 1] - yb) / SL), r = reg(i), y = F[i * 2 + 1], s = D.pos[i * 3] >= 0 ? 1 : -1, back = D.back[i];
      // (u: outward (the body: from its middle; a leg: towards its outer side), v: forward)
      const shareIn = (rr) => {
        const E = fitOf(k, rr) ?? fitOf(k + (rr === 0 ? 2 : -2), rr); if (!E) return null;
        const u = rr === 0 ? Math.abs(D.pos[i * 3]) : rr * (D.pos[i * 3] - E.cx), v = D.pos[i * 3 + 2] - E.cz, p = Math.atan2(E.b * u, E.a * v);
        if (rr === 0) return back ? arc(E.a, E.b, Math.PI, Math.max(p, 0)) / arc(E.a, E.b, Math.PI, Math.PI / 2) : arc(E.a, E.b, 0, Math.max(p, 0)) / arc(E.a, E.b, 0, Math.PI / 2);
        return back ? arc(E.a, E.b, -Math.PI / 2, p < 0 ? p : p - 2 * Math.PI) / arc(E.a, E.b, -Math.PI / 2, -1.5 * Math.PI) : arc(E.a, E.b, -Math.PI / 2, p) / arc(E.a, E.b, -Math.PI / 2, Math.PI / 2);
      };
      // (Just under the crotch the leg's way round is blended into the body's over 4 cm, so the print runs on without a step.)
      const yy = D.pos[i * 3 + 1], wB = r === 0 ? 1 : Math.min(1, Math.max(0, (yy - (yc - 0.04)) / 0.04)) ** 2;
      const sB = wB > 0 ? shareIn(0) : null, sL = wB < 1 ? shareIn(r === 0 ? s : r) : null;
      const share = sB == null ? sL : sL == null ? sB : sB * wB + sL * (1 - wB);
      if (share == null) continue;
      const tt = Math.min(1.03, Math.max(-0.03, share));
      // (Kept 2 mm inside the pattern's edges.)
      F[i * 2] = s * (inner(y) + 0.002 + tt * (side(y) - inner(y) - 0.004));
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
    return { ...out, report: `${out.report}\nprint places onto the made ${C.made}' seams (the way round along each 5 mm section's ellipse to the sides and inner legs; model crotch ${yc.toFixed(3)}), eased along the cloth` };
  },
};
