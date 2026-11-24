// The converter for ready-made (Tripo) skirts (MODELQ8 2026-11-23, the tennis skirt on the Netball skirt, Hockey skort and
// Tennis skirt tiles): tripo-top.mjs's placing (one uniform scale, the model on the made skirt's height, skirt.js), then
// every point's print place on the made skirt's own pattern (skirt.js: y the height above the hem, x round the skirt
// from its middle, the front and back panels each a quarter of the girth either side), so the skirt's print, marks and
// layers sit on the model as on the made skirt:
//  - heights as they are;
//  - across: the way round along an ellipse fitted to each 5 mm cross-section (smoothed over 3.5 cm), from the centre
//    front (back) out to the side (the ellipse's widest point), as a share of the pattern's quarter girth there;
//  - then eased along the cloth (each point toward its neighbours on the same half; the halves' edges held).
// The model's points are never moved: only their print places.
import top from './tripo-top.mjs';
export default {
  lib: "export { buildSkirt, skirtGirth, SKIRT_LEN } from './skirt.js';",
  async convert(args) {
    const C = args.settings.convert ?? {}, L = args.lib;
    const lib = { buildGarment: (_k, o) => L.buildSkirt(o), SPECS: {} };
    const out = await top.convert({ ...args, lib, settings: { ...args.settings, convert: { pit: 2, ...C } } }), D = out.data, n = D.pos.length / 3, F = D.flat, I = D.idx;
    const half = (y) => L.skirtGirth(y) / 4;
    let yb = Infinity, yt = -Infinity;
    for (let i = 0; i < n; i++) { yb = Math.min(yb, D.pos[i * 3 + 1]); yt = Math.max(yt, D.pos[i * 3 + 1]); }
    for (let i = 0; i < n; i++) F[i * 2 + 1] = D.pos[i * 3 + 1];
    const SL = 0.005, box = new Map();
    for (let i = 0; i < n; i++) { const k = Math.round((D.pos[i * 3 + 1] - yb) / SL), x = D.pos[i * 3], z = D.pos[i * 3 + 2]; const b = box.get(k) ?? box.set(k, [Infinity, -Infinity, Infinity, -Infinity, 0]).get(k); b[0] = Math.min(b[0], x); b[1] = Math.max(b[1], x); b[2] = Math.min(b[2], z); b[3] = Math.max(b[3], z); b[4]++; }
    const fits = new Map();
    const fitOf = (k) => { if (fits.has(k)) return fits.get(k); let cz = 0, a = 0, b = 0, w = 0; for (let d = -7; d <= 7; d++) { const e = box.get(k + d); if (!e || e[4] < 3) continue; const g = Math.exp(-0.5 * (d / 3.5) ** 2); cz += g * (e[2] + e[3]) / 2; a += g * Math.max(Math.abs(e[0]), Math.abs(e[1])); b += g * (e[3] - e[2]) / 2; w += g; } const r = w ? { cz: cz / w, a: Math.max(0.01, a / w), b: Math.max(0.01, b / w) } : null; fits.set(k, r); return r; };
    const arc = (a, b, s0, s1) => { const m = Math.max(2, 2 * Math.ceil(Math.abs(s1 - s0) / (Math.PI / 48))), h = (s1 - s0) / m, f = (s) => Math.sqrt(a * a * Math.cos(s) ** 2 + b * b * Math.sin(s) ** 2); let sum = f(s0) + f(s1); for (let j = 1; j < m; j++) sum += f(s0 + j * h) * (j % 2 ? 4 : 2); return (sum * h) / 3; };
    for (let i = 0; i < n; i++) {
      const k = Math.round((D.pos[i * 3 + 1] - yb) / SL), E = fitOf(k); if (!E) continue;
      const y = F[i * 2 + 1], s = D.pos[i * 3] >= 0 ? 1 : -1, back = D.back[i];
      const p = Math.atan2(E.b * Math.abs(D.pos[i * 3]), E.a * (D.pos[i * 3 + 2] - E.cz));
      const share = back ? arc(E.a, E.b, Math.PI, Math.max(p, 0)) / arc(E.a, E.b, Math.PI, Math.PI / 2) : arc(E.a, E.b, 0, Math.max(p, 0)) / arc(E.a, E.b, 0, Math.PI / 2);
      const tt = Math.min(1.03, Math.max(-0.03, share)), hy = half(Math.min(Math.max(y, 0), L.SKIRT_LEN));
      F[i * 2] = s * (0.002 + tt * (hy - 0.004));
    }
    const nb = Array.from({ length: n }, () => new Set()), edge = new Uint8Array(n);
    const same = (a, b) => D.back[a] === D.back[b] && Math.sign(F[a * 2]) === Math.sign(F[b * 2]);
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3]; if (same(a, b)) { nb[a].add(b); nb[b].add(a); } else { edge[a] = 1; edge[b] = 1; } }
    for (let it = 0; it < (C.ease ?? 40); it++) {
      const next = Float64Array.from(F);
      for (let i = 0; i < n; i++) { if (edge[i] || !nb[i].size) continue; let sx = 0; for (const j of nb[i]) sx += F[j * 2]; next[i * 2] = 0.5 * F[i * 2] + (0.5 * sx) / nb[i].size; }
      F.set(next);
    }
    return { ...out, report: `${out.report}\nprint places onto the made skirt's pattern (the way round along each 5 mm section's ellipse to the sides; model ${yb.toFixed(3)}..${yt.toFixed(3)}), eased along the cloth` };
  },
};
