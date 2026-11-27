// Model Painter (admin tool, 2026-11-26; remove with REMOVE.md): the colour-area map of one ready-made model.
// The map is the viewer's own piece format (tripomesh.js / main.js addRelief): per point the area on the near side of its
// nearest area line (A), the area on the far side (B) and how far it is from that line (mm, quantised 128 + mm / 0.4), plus
// per-triangle entries (pieceTri: 3 bytes triangle, A, B, each corner's distance) where the corners lie by different lines.
// The shader draws every line where the distance crosses 0, smooth and anti-aliased, so the edges follow what was painted,
// not the triangles. Painting composes distance fields: every stroke, line and outline is a smooth shape on the cloth.
// Area numbers: 0 the body (the cloth's print), k the k-th of partKeys.

export const MAXD = 51; // mm: the furthest a stored distance reaches (128 +- 127 * 0.4)
const b64 = (s) => { const t = atob(s), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };
export const toB64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const qd = (mm) => Math.max(1, Math.min(255, Math.round(128 + mm / 0.4)));

/** The model's data (window.TRIPO_MESHES[name]) decoded: points (metres), normals, triangles, its own areas. */
export function decodeModel(D) {
  const n = D.count, q = new Uint16Array(b64(D.pos).buffer), nn = new Int8Array(b64(D.nor).buffer), I = new Uint16Array(b64(D.idx).buffer);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = D.lo[i % 3] + (q[i] / 65535) * (D.hi[i % 3] - D.lo[i % 3]);
  for (let i = 0; i < n; i++) { const x = nn[i * 3], y = nn[i * 3 + 1], z = nn[i * 3 + 2], l = Math.hypot(x, y, z) || 1; nor[i * 3] = x / l; nor[i * 3 + 1] = y / l; nor[i * 3 + 2] = z / l; }
  return { n, T: I.length / 3, pos, nor, idx: I, own: { partKeys: [...(D.partKeys ?? [])], piece: D.piece ?? null, pieceTri: D.pieceTri ?? null, triPart: D.triPart ?? null } };
}

/** A painting session on one model: its state per point, the ops (undo / redo), the output. */
export class AreaMap {
  constructor(M, start) {
    this.M = M; const n = M.n, T = M.T;
    // point -> triangles, point -> neighbours
    const cnt = new Uint32Array(n + 1);
    for (let k = 0; k < T * 3; k++) cnt[M.idx[k] + 1]++;
    for (let i = 0; i < n; i++) cnt[i + 1] += cnt[i];
    const at = cnt.slice(), vt = new Uint32Array(T * 3);
    for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) vt[at[M.idx[t * 3 + k]]++] = t;
    this.vtStart = cnt; this.vt = vt;
    // mirror partner (nearest point to (-x, y, z)) and a grid for nearest-point lookups
    this.grid = new Map(); this.G = 0.02;
    for (let i = 0; i < n; i++) { const k = this.cell(M.pos[i * 3], M.pos[i * 3 + 1], M.pos[i * 3 + 2]); (this.grid.get(k) ?? this.grid.set(k, []).get(k)).push(i); }
    this.load(start);
  }
  cell(x, y, z) { const G = this.G; return `${Math.floor(x / G)},${Math.floor(y / G)},${Math.floor(z / G)}`; }
  nearest(x, y, z, maxR = 0.06) {
    let best = -1, bd = maxR * maxR; const G = this.G, R = Math.ceil(maxR / G), cx = Math.floor(x / G), cy = Math.floor(y / G), cz = Math.floor(z / G), P = this.M.pos;
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) {
      const L = this.grid.get(`${cx + a},${cy + b},${cz + c}`); if (!L) continue;
      for (const j of L) { const d = (P[j * 3] - x) ** 2 + (P[j * 3 + 1] - y) ** 2 + (P[j * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = j; } }
    }
    return best;
  }
  /** The starting areas: a saved map's (or the model's own) piece data; a model with parts per triangle only: those. */
  load(src) {
    const { n, T, idx } = this.M;
    this.keys = [...src.partKeys];
    const sh = new Uint8Array(n), ot = new Uint8Array(n), ds = new Float32Array(n).fill(MAXD);
    this.raw = src.piece ? b64(src.piece) : null;
    this.rawTri = new Map();
    if (src.pieceTri) { const P = b64(src.pieceTri); for (let e = 0; e + 7 < P.length; e += 8) this.rawTri.set(P[e] | (P[e + 1] << 8) | (P[e + 2] << 16), P.slice(e + 3, e + 8)); }
    const tp = src.triPart ? b64(src.triPart) : null;
    this.lipTri = null;
    if (tp) { // the model's lips / inside stay per triangle (main.js: two-sided lips); every other part becomes painted areas
      const keep = new Set(this.keys.map((k, j) => (k === 'lip' || k === 'inside' ? j + 1 : 0)).filter(Boolean));
      this.lipTri = Uint8Array.from(tp, (p) => (keep.has(p) ? p : 0));
    }
    if (this.raw) {
      for (let i = 0; i < n; i++) {
        const A = this.raw[i * 3], B = this.raw[i * 3 + 1], z = (this.raw[i * 3 + 2] - 128) * 0.4;
        sh[i] = z >= 0 ? A : B; ot[i] = z >= 0 ? B : A; ds[i] = A === B ? MAXD : Math.min(MAXD, Math.abs(z));
      }
    } else if (tp) {
      for (let t = T - 1; t >= 0; t--) for (let k = 0; k < 3; k++) { const v = idx[t * 3 + k]; if (tp[t] && !this.lipTri[t]) sh[v] = tp[t]; }
      ot.set(sh);
      this.rawTri.clear();
    } else ot.set(sh);
    // with parts per triangle only, every point is "touched": its line is made fresh from the labels
    this.base = { sh, ot, ds };
    this.orig = { sh: sh.slice(), ot: ot.slice(), ds: ds.slice() };
    this.ops = []; this.cursor = 0;
    this.baseTouched = new Uint8Array(n).fill(this.raw ? 0 : 1);
    this.replay();
  }
  /** Back to the model's own Tripo areas (as the viewer shows them without a map). */
  resetTo(src) { this.load(src); }
  keyIndex(key) { let i = this.keys.indexOf(key); if (i < 0) { this.keys.push(key); i = this.keys.length - 1; } return i + 1; }

  replay(upto = this.cursor) {
    this.sh = this.base.sh.slice(); this.ot = this.base.ot.slice(); this.ds = this.base.ds.slice(); this.touched = this.baseTouched.slice();
    for (let k = 0; k < upto; k++) this.applyOp(this.ops[k]);
  }
  snapshot() { return { sh: this.sh.slice(), ot: this.ot.slice(), ds: this.ds.slice(), touched: this.touched.slice(), keys: this.keys.length }; }
  restore(s) { this.sh.set(s.sh); this.ot.set(s.ot); this.ds.set(s.ds); this.touched.set(s.touched); }
  push(op) { this.ops.length = this.cursor; this.ops.push(op); this.cursor++; this.applyOp(op); }
  undo() { if (this.cursor) { this.cursor--; this.replay(); return true; } return false; }
  redo() { if (this.cursor < this.ops.length) { this.applyOp(this.ops[this.cursor++]); return true; } return false; }

  /** One point under a shape of area L at signed distance s (mm, + inside). Eraser: L < 0, the point's own Tripo area. */
  applyAt(i, s, L) {
    if (L < 0) L = this.orig.sh[i];
    const sh = this.sh[i];
    if (s > 0) {
      if (sh !== L) { this.ot[i] = sh; this.sh[i] = L; this.ds[i] = Math.min(MAXD, s); }
      else if (this.ds[i] <= s && this.ot[i] !== L) { this.ot[i] = L; this.ds[i] = Math.min(MAXD, s); }
      else return;
    } else {
      const d = -s;
      if (sh === L || d >= this.ds[i] || d >= MAXD) return;
      this.ot[i] = L; this.ds[i] = d;
    }
    this.touched[i] = 1;
  }
  applyOp(op) {
    if (op.type === 'fill') { this.applyFill(op); return; }
    for (let k = 0; k < op.idx.length; k++) this.applyAt(op.idx[k], op.s[k], op.label);
  }
  /** The connected points of one area (no line between them) from point v. */
  region(v) {
    const L = this.sh[v], seen = new Uint8Array(this.M.n), out = [v], { idx } = this.M; seen[v] = 1;
    for (let q = 0; q < out.length; q++) {
      const a = out[q];
      for (let j = this.vtStart[a]; j < this.vtStart[a + 1]; j++) { const t = this.vt[j]; for (let k = 0; k < 3; k++) { const b = idx[t * 3 + k]; if (!seen[b] && this.sh[b] === L) { seen[b] = 1; out.push(b); } } }
    }
    return Int32Array.from(out);
  }
  applyFill(op) {
    const { idx } = this.M, inR = new Uint8Array(this.M.n), from = op.from, L = op.label;
    for (const v of op.region) inR[v] = 1;
    for (const v of op.region) { if (this.sh[v] === from) this.sh[v] = L; if (this.ot[v] === from) this.ot[v] = L; this.touched[v] = 1; }
    // the points across the region's edge: their far side is now L
    for (const v of op.region) for (let j = this.vtStart[v]; j < this.vtStart[v + 1]; j++) { const t = this.vt[j]; for (let k = 0; k < 3; k++) { const b = idx[t * 3 + k]; if (!inR[b] && this.ot[b] === from) { this.ot[b] = L; this.touched[b] = 1; } } }
  }

  /** The viewer's data: piece (per point), pieceTri (per triangle), triPart (lips / inside only), partKeys. */
  output() {
    const { n, T, idx } = this.M, piece = new Uint8Array(n * 3);
    const canon = (i) => { const a = this.sh[i], b = this.ot[i], d = a === b ? MAXD : this.ds[i]; return a <= b ? [a, b, d] : [b, a, -d]; };
    for (let i = 0; i < n; i++) {
      if (!this.touched[i] && this.raw) { piece[i * 3] = this.raw[i * 3]; piece[i * 3 + 1] = this.raw[i * 3 + 1]; piece[i * 3 + 2] = this.raw[i * 3 + 2]; continue; }
      const [a, b, d] = canon(i); piece[i * 3] = a; piece[i * 3 + 1] = b; piece[i * 3 + 2] = qd(d);
    }
    const tri = [];
    for (let t = 0; t < T; t++) {
      const c = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
      const untouched = !this.touched[c[0]] && !this.touched[c[1]] && !this.touched[c[2]];
      const own = this.rawTri.get(t);
      if (untouched && this.raw) { if (own) tri.push(t & 255, (t >> 8) & 255, t >> 16, ...own); continue; }
      const p = c.map((v) => [piece[v * 3], piece[v * 3 + 1]]);
      if (p.every((q) => q[0] === p[0][0] && q[1] === p[0][1]) && !own) continue;
      // the line of the corner nearest a real line; every corner's distance from that line
      let best = c[0], bd = Infinity;
      for (const v of c) { const d = this.sh[v] === this.ot[v] ? MAXD + 1 : this.ds[v]; if (d < bd) { bd = d; best = v; } }
      let [A, B] = canon(best);
      if (A === B) { // no line by any corner: the corners' own areas (the most of them, the lower number first)
        const ls = [...new Set(c.map((v) => this.sh[v]))].sort((x, y) => x - y); A = ls[0]; B = ls[1] ?? ls[0];
      }
      const dist = (v) => {
        const [a, b, d] = canon(v);
        if (a === A && b === B && A !== B) return d;
        const s = this.sh[v], m = Math.max(2, this.ds[v]);
        if (s === A && s !== B) return m; if (s === B && s !== A) return -m;
        if (A === B) return MAXD;
        return this.ot[v] === A ? 2 : this.ot[v] === B ? -2 : 2;
      };
      tri.push(t & 255, (t >> 8) & 255, t >> 16, A, B, ...c.map((v) => qd(dist(v))));
    }
    let triPart = null;
    if (this.lipTri && this.lipTri.some(Boolean)) triPart = toB64(this.lipTri);
    return { partKeys: [...this.keys], piece: toB64(piece), pieceTri: toB64(Uint8Array.from(tri)), triPart, _piece: piece, _tri: Uint8Array.from(tri) };
  }
}
