// The pullover hoodie's ready-made model coloured from a second file of the SAME garment split into parts by Tripo
// (HOODIE 2026-11-19: hoodie-textured.glb + hoodie-parts.glb, booklet cards 10562 / 10640). As viewer/tripo-glbparts.mjs (the
// tee / jersey tool) but for a hoodie's pieces: a hood with its lining, raglan sleeves, rib cuffs and waistband, a kangaroo
// pocket and cords. Run from website/ AFTER its converter (it reads and rewrites viewer/tripo-<name>.js):
//
//   node viewer/tripo-hoodie.mjs <name>
//
// Settings: viewer/parts/<name>.json `hoodieParts`:
//   glb      the parts file (from viewer/), read as data only
//   roles    { <part node name>: role }: what each part is (body, sleeveL, sleeveR, cuffL, cuffR, hem, hood, lining,
//            pocket, cord, ...); `split` [{ part, where, role }]: a part's triangles whose middle passes `where` (x y z,
//            placed, metres) another role (a part Tripo made of two pieces)
//   regions  { <region>: { roles: [...], key, sigma, steps } }: the pieces whose borders are smooth lines (hood, sleeves, pocket)
//            (`steps`: passes smoothing its share before the line is found, default 12: more where the parts' border is ragged;
//            `reach`: how far out its line decides the side, default `reach`; `oneSide`: its line's side decided once for
//            the whole line, not per place); the
//            print (key null) everywhere else; `order` which wins where two meet
//   lining   { region, key }: in that region the cloth facing into the hood (towards its middle, per height) is the lining
//   rings    { <role>: { key, dir: 'out' | 'down' | 'up', width, beyond } }: a rib band of one even width from its opening's fold
//            (cuffs, waistband): its own colour up to `width`, the piece round it (`beyond`: a region, else the print) after;
//            `margin`: how far past its width it still reaches the cloth round it (default 0.015; more on a coarse mesh),
//            `wide`: out to how many times its opening's radius (default 1.4); `first`: its even edge wins in a triangle it shares;
//            `endSpan`: its fold per angle the furthest within that many of 72 bins (a coarse mesh)
//   plain    { <role>: key }: pieces of their own shape (cords), one colour, never smoothed
//   sleeveMap { region: { armhole: [top, bottom], cuff: [top, bottom] } }: each sleeve's print places laid onto the made
//            garment's sleeve (u from its seam to its cuff, v round from its top), the body's places kept as uvBody (altUv),
//            so a design picture's sleeves land on the sleeves and the raglan seam prints straight
//   stitches { seams: [{ region, at }], rings: [{ role, at }], sigma }: thin stitch lines (main.js stitchStrips): `at` metres
//            from a region's border (+ into the region, - out of it) or from a ring's opening fold
//   mirror   [{ from, to, with, side }]: on the `side` half (x sign, default +) a point that is `to` or `with` (default
//            ['body']) takes `to` where its mirror image (-x) is `from`, else the `with` role there (a ragged border one side)
//   form     [roles]: points kept out of the form inside (data side bit 2: the hood, cords)
//   zipParts [{ part, where }]: straight zips of our own along those parts (pocket zips), the parts themselves the body
//   zipLine  { top, sigma, end }: a full zip down the centre front (data `zip`, as viewer/tripo-glbparts.mjs: main.js lays our
//            own tape and teeth along it, the print under it): from `top` (the parts file's own height) down to the hem
//   data     fields copied into the data (insideCloth)
// The model's shape is never changed: only which piece each point is on, its signed distance from the line between its
// piece and the next (data `piece` / `pieceTri`), its print places, and the stitch lines.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel, analyse } from './pieces/model.mjs';
import { closestOnTri } from './pieces/pieces.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
const S0 = name && JSON.parse(fs.readFileSync(path.join(here, 'parts', `${name}.json`), 'utf8')).hoodieParts;
if (!S0) { console.error('usage: node viewer/tripo-hoodie.mjs <name>   (viewer/parts/<name>.json needs `hoodieParts`)'); process.exit(1); }
const settings = S0, say = (...a) => console.log(`[${name}]`, ...a), report = [];

// ---- The parts file: each node's triangles (translation and scale only).
function readParts(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB file`);
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) { const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4), chunk = buf.subarray(off + 8, off + 8 + len); if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8')); else if (type === 0x004e4942) bin = chunk; off += 8 + len; }
  const read = (i) => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], comps = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type], Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType]; const s = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0); return new Type(bin.buffer.slice(s, s + a.count * comps * Type.BYTES_PER_ELEMENT)); };
  const out = [];
  for (const node of json.nodes) {
    if (node.mesh == null) continue;
    if (node.rotation && node.rotation.some((v, i) => Math.abs(v - [0, 0, 0, 1][i]) > 1e-6)) throw new Error(`${node.name}: rotated part not supported`);
    const t = node.translation ?? [0, 0, 0], s = node.scale ?? [1, 1, 1], tris = [];
    for (const prim of json.meshes[node.mesh].primitives) {
      const p = read(prim.attributes.POSITION), ix = prim.indices != null ? read(prim.indices) : Uint32Array.from({ length: p.length / 3 }, (_, i) => i);
      for (const v of ix) tris.push([p[v * 3] * s[0] + t[0], p[v * 3 + 1] * s[1] + t[1], p[v * 3 + 2] * s[2] + t[2]]);
    }
    out.push({ name: node.name, tris });
  }
  return out;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

const m = loadModel(name), A = analyse(m), D = m.D, V = A.V;
const P3 = (v) => [A.P[v * 3], A.P[v * 3 + 1], A.P[v * 3 + 2]], N3 = (v) => [A.PN[v * 3], A.PN[v * 3 + 1], A.PN[v * 3 + 2]];
const parts = readParts(path.resolve(here, settings.glb));
const turnA = ((D.turn ?? 0) * Math.PI) / 180, tc = Math.cos(turnA), ts = Math.sin(turnA);
const place = (p0) => { const p = D.turn ? [p0[0] * tc + p0[2] * ts, p0[1], -p0[0] * ts + p0[2] * tc] : p0; return [p[0] * D.scale + D.move[0], p[1] * D.scale + D.move[1], p[2] * D.scale + D.move[2]]; };

// ---- Roles (indices) and colour keys (1 + place in partKeys; 0 the print).
const roleNames = [...new Set([...Object.values(settings.roles), ...(settings.split ?? []).map((s) => s.role)])], RI = (r) => { const i = roleNames.indexOf(r); if (i < 0) throw new Error(`unknown role ${r}`); return i; };
const keys = [...(D.partKeys ?? [])];
const keyIdx = (k) => { if (k == null) return 0; let i = keys.indexOf(k); if (i < 0) { keys.push(k); i = keys.length - 1; } return i + 1; };

const same = (u, v) => dot(N3(u), N3(v)) > 0.3;
const nbs = A.nb.map((s, v) => [...s].filter((u) => same(u, v)));
const islands = (lab, min) => {
  let fixed = 0;
  const total = new Map(); for (let v = 0; v < V; v++) total.set(lab[v], (total.get(lab[v]) ?? 0) + 1);
  const seen = new Uint8Array(V);
  for (let s0 = 0; s0 < V; s0++) {
    if (seen[s0]) continue;
    const comp = [s0], k0 = lab[s0]; seen[s0] = 1;
    for (let i = 0; i < comp.length; i++) for (const u of nbs[comp[i]]) if (!seen[u] && lab[u] === k0) { seen[u] = 1; comp.push(u); }
    if (comp.length >= min || comp.length > total.get(k0) / 2) continue;
    const votes = new Map(); for (const v of comp) for (const u of nbs[v]) if (lab[u] !== k0) votes.set(lab[u], (votes.get(lab[u]) ?? 0) + 1);
    const to = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (to !== undefined) { for (const v of comp) lab[v] = to; fixed += comp.length; }
  }
  return fixed;
};

// ---- 1. Each point: the role of the nearest parts-file triangle facing its own way.
const G = 0.02, gk = (x, y, z) => `${x},${y},${z}`;
const grid = new Map(), TR = [];
const splits = (settings.split ?? []).map((s) => ({ ...s, test: new Function('x', 'y', 'z', `return (${s.where});`), role: RI(s.role) }));
parts.forEach((p) => {
  if (!(p.name in settings.roles)) throw new Error(`no role for part ${p.name}`);
  const own = RI(settings.roles[p.name]);
  for (let k = 0; k < p.tris.length; k += 3) {
    const tri = [place(p.tris[k]), place(p.tris[k + 1]), place(p.tris[k + 2])], id = TR.length, mid = [0, 1, 2].map((a) => (tri[0][a] + tri[1][a] + tri[2][a]) / 3);
    const sp = splits.find((s) => s.part === p.name && s.test(...mid));
    TR.push({ tri, role: sp ? sp.role : own, n: nrm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]))) });
    const mn = [0, 1, 2].map((a) => Math.floor(Math.min(...tri.map((q) => q[a])) / G)), mx = [0, 1, 2].map((a) => Math.floor(Math.max(...tri.map((q) => q[a])) / G));
    for (let x = mn[0]; x <= mx[0]; x++) for (let y = mn[1]; y <= mx[1]; y++) for (let z = mn[2]; z <= mx[2]; z++) { const kk = gk(x, y, z); (grid.get(kk) ?? grid.set(kk, []).get(kk)).push(id); }
  }
});
const role = new Int16Array(V).fill(-1); let far = 0;
for (let v = 0; v < V; v++) {
  const p = P3(v), c = p.map((x) => Math.floor(x / G)), pn = N3(v);
  let best = -1, bd = Infinity;
  for (let r = 1; r <= 3 && best < 0; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let d = -r; d <= r; d++) for (const id of grid.get(gk(c[0] + a, c[1] + b, c[2] + d)) ?? []) {
    const q = closestOnTri(p, ...TR[id].tri), dd = Math.hypot(...sub(q, p)) + (dot(TR[id].n, pn) < 0 ? 0.02 : 0); if (dd < bd) { bd = dd; best = id; }
  }
  if (best < 0 || bd > (settings.far ?? 0.03) + 0.02) { far++; continue; }
  role[v] = TR[best].role;
}
for (let it = 0; it < 30 && role.includes(-1); it++) for (let v = 0; v < V; v++) if (role[v] < 0) for (const u of A.nb[v]) if (role[u] >= 0) { role[v] = role[u]; break; }
for (let v = 0; v < V; v++) if (role[v] < 0) role[v] = RI('body');
const plainRoles = new Set(Object.keys(settings.plain ?? {}).map(RI));
// (tiny patches take the role round them; pieces of their own shape (cords) as they are)
{ const keep = Int16Array.from(role); const isl = islands(role, settings.island ?? 60); for (let v = 0; v < V; v++) if (plainRoles.has(keep[v])) role[v] = keep[v]; report.push(`role patches taken in: ${isl} points`); }

// ---- 2. Outside or inside: rays from the point along its normal and 6 tilted round it; out when two get out.
const TG = 0.02, tgrid = new Map();
for (let t = 0; t < A.T; t++) {
  const mn = [9, 9, 9], mx = [-9, -9, -9];
  for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) { const x = A.P[A.F[t * 3 + k] * 3 + a]; mn[a] = Math.min(mn[a], x); mx[a] = Math.max(mx[a], x); }
  for (let x = Math.floor(mn[0] / TG); x <= Math.floor(mx[0] / TG); x++) for (let y = Math.floor(mn[1] / TG); y <= Math.floor(mx[1] / TG); y++) for (let z = Math.floor(mn[2] / TG); z <= Math.floor(mx[2] / TG); z++) { const k = gk(x, y, z); (tgrid.get(k) ?? tgrid.set(k, []).get(k)).push(t); }
}
const lo = [9, 9, 9], hi = [-9, -9, -9]; for (let v = 0; v < V; v++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], A.P[v * 3 + a]); hi[a] = Math.max(hi[a], A.P[v * 3 + a]); }
const hits = (o, d, own) => {
  const seen = new Set();
  for (let s = 0.001; s < 0.7; s += TG * 0.5) {
    const p = [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
    if (p.some((x, a) => x < lo[a] - 0.02 || x > hi[a] + 0.02)) return false;
    for (const t of tgrid.get(gk(...p.map((x) => Math.floor(x / TG)))) ?? []) {
      if (seen.has(t) || own.has(t)) continue; seen.add(t);
      const a = P3(A.F[t * 3]), e1 = sub(P3(A.F[t * 3 + 1]), a), e2 = sub(P3(A.F[t * 3 + 2]), a), pv = cross(d, e2), det = dot(e1, pv);
      if (Math.abs(det) < 1e-12) continue;
      const tv = sub(o, a), u = dot(tv, pv) / det; if (u < 0 || u > 1) continue;
      const qv = cross(tv, e1), w = dot(d, qv) / det; if (w < 0 || u + w > 1) continue;
      if (dot(e2, qv) / det > 0.0015) return true;
    }
  }
  return false;
};
const vt = Array.from({ length: V }, () => []); for (let t = 0; t < A.T; t++) for (let k = 0; k < 3; k++) vt[A.F[t * 3 + k]].push(t);
const outside = new Uint8Array(V);
for (let v = 0; v < V; v++) {
  const n = N3(v), o = P3(v), own = new Set(vt[v]), t1 = nrm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross(n, t1);
  const dirs = [n, ...[0, 1, 2, 3, 4, 5].map((k) => { const a = (k * Math.PI) / 3; return nrm(n.map((x, i) => x + 0.7 * (Math.cos(a) * t1[i] + Math.sin(a) * t2[i]))); })];
  let out = 0; for (const d of dirs) if (!hits(o, d, own) && ++out >= 2) break;
  outside[v] = out >= 2 ? 1 : 0;
}
for (let it = 0; it < 2; it++) for (let v = 0; v < V; v++) { const L = nbs[v]; if (L.length >= 3 && L.every((u) => outside[u] !== outside[v])) outside[v] = 1 - outside[v]; }
const PG = 0.01, pgrid = new Map(); for (let v = 0; v < V; v++) { const k = gk(...P3(v).map((x) => Math.floor(x / PG))); (pgrid.get(k) ?? pgrid.set(k, []).get(k)).push(v); }
const nearPts = (p, r) => { const c = p.map((x) => Math.floor(x / PG)), n2 = Math.ceil(r / PG), o = []; for (let a = -n2; a <= n2; a++) for (let b = -n2; b <= n2; b++) for (let d = -n2; d <= n2; d++) for (const v of pgrid.get(gk(c[0] + a, c[1] + b, c[2] + d)) ?? []) if (Math.hypot(...sub(P3(v), p)) < r) o.push(v); return o; };
// (an inside point: the outside cloth facing it, its other face)
const facing = new Int32Array(V).fill(-1);
for (let v = 0; v < V; v++) {
  if (outside[v]) continue;
  let bd = settings.wall ?? 0.025;
  for (const u of nearPts(P3(v), bd)) { if (!outside[u] || dot(N3(u), N3(v)) > -0.5 || dot(sub(P3(u), P3(v)), N3(v)) > 0) continue; const d = Math.hypot(...sub(P3(u), P3(v))); if (d < bd) { bd = d; facing[v] = u; } }
}
// (the hood's inside is cloth of its own (the lining), never the other face of the outside: hood points keep their role)
// (`mirror` [{ from, to, with }] (HOODIE/MODELQ6 2026-11-20, the zip hoodie: its left raglan seam ragged in the parts file, the
// right one clean): on the other half (x of the other sign), a point that is `to` or one of `with` takes `to` where the mirrored
// point (-x) is `from`, else the first of `with` there; the garment is the same both sides)
for (const M of settings.mirror ?? []) {
  const from = RI(M.from), to = RI(M.to), other = (M.with ?? ['body']).map(RI), swap = new Set([to, ...other]), sx = Math.sign(M.side ?? 1); let n = 0;
  const was = Int16Array.from(role);
  for (let v = 0; v < V; v++) {
    if (Math.sign(A.P[v * 3]) !== sx || !swap.has(was[v])) continue;
    const q = [-A.P[v * 3], A.P[v * 3 + 1], A.P[v * 3 + 2]]; let best = -1, bd = 0.02;
    for (const u of nearPts(q, 0.02)) { if (dot(N3(u), [-A.PN[v * 3], A.PN[v * 3 + 1], A.PN[v * 3 + 2]]) < 0.3) continue; const d = Math.hypot(...sub(P3(u), q)); if (d < bd) { bd = d; best = u; } }
    if (best < 0) continue;
    const r = was[best] === from ? to : other.includes(was[best]) ? was[best] : null;
    if (r !== null && r !== role[v]) { role[v] = r; n++; }
  }
  report.push(`mirror ${M.from} -> ${M.to}: ${n} points changed`);
}
const hoodRoles = new Set([...(settings.regions?.[settings.lining?.region]?.roles ?? []), ...Object.values(settings.regions ?? {}).filter((R) => R.own).flatMap((R) => R.roles)].map(RI));
let lined = 0; for (let v = 0; v < V; v++) if (facing[v] >= 0 && role[v] !== role[facing[v]] && !hoodRoles.has(role[v]) && !plainRoles.has(role[v])) { role[v] = role[facing[v]]; lined++; }
report.push(`outside ${outside.reduce((a, b) => a + b, 0)} / ${V}; inside points facing outside cloth ${[...facing].filter((x) => x >= 0).length} (role changed ${lined}); no part near ${far}`);

// ---- 3. Smooth borders: per region its smoothed share; where it is one half, chained into lines, smoothed, laid onto the
// cloth; each point's signed distance from them (+ in the region).
const sigma = settings.sigma ?? 0.015, reach = settings.reach ?? 0.03;
function shareOf(inPiece, steps = 12) {
  let w = Float32Array.from({ length: V }, (_, v) => (inPiece(v) ? 1 : 0));
  for (let it = 0; it < steps; it++) { const n = new Float32Array(V); for (let v = 0; v < V; v++) { const L = nbs[v]; let s = 0; for (const u of L) s += w[u]; n[v] = L.length ? 0.5 * w[v] + (0.5 * s) / L.length : w[v]; } w = n; }
  return w;
}
function linesOf(w, sg, region = (v) => outside[v], minLen = 8, oneSide = false) {
  const ek = (u, v) => (u < v ? u * 1e6 + v : v * 1e6 + u), segs = [];
  const cut = (u, v) => { const f = (w[u] - 0.5) / (w[u] - w[v] || 1e-9); return P3(u).map((x, k) => x + (A.P[v * 3 + k] - x) * f); };
  for (let t = 0; t < A.T; t++) {
    const c = [A.F[t * 3], A.F[t * 3 + 1], A.F[t * 3 + 2]];
    if (!c.every(region)) continue;
    const cr = [];
    for (let k = 0; k < 3; k++) { const u = c[k], v = c[(k + 1) % 3]; if ((w[u] >= 0.5) !== (w[v] >= 0.5)) cr.push([ek(u, v), cut(u, v)]); }
    if (cr.length === 2) segs.push(cr);
  }
  const at = new Map(); segs.forEach((s, i) => { for (const [e] of s) (at.get(e) ?? at.set(e, []).get(e)).push(i); });
  const used = new Uint8Array(segs.length), out = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const walk = (from) => { const pts = []; let cur = s0, e = from; for (;;) { const nx = segs[cur].find(([x]) => x !== e); pts.push(nx[1]); const j = (at.get(nx[0]) ?? []).find((i) => !used[i]); if (j === undefined) return { pts, back: (at.get(nx[0]) ?? []).includes(s0) && cur !== s0 }; used[j] = 1; cur = j; e = nx[0]; } };
    const fw = walk(segs[s0][0][0]), closed = fw.back, bw = closed ? { pts: [] } : walk(segs[s0][1][0]);
    const C = [...bw.pts.reverse(), segs[s0][0][1], ...fw.pts];
    if (C.length < minLen) continue;
    const R = [C[0]]; let acc = 0;
    for (let i = 1; i < C.length; i++) { const d = Math.hypot(...sub(C[i], C[i - 1])); acc += d; while (acc >= 0.002) { const f = 1 - (acc - 0.002) / (d || 1); R.push(C[i - 1].map((x, k) => x + (C[i][k] - x) * Math.min(1, Math.max(0, f)))); acc -= 0.002; } }
    if (R.length < minLen) continue;
    const sgn = sg / 0.002, hw = Math.ceil(3 * sgn), ker = []; for (let o = -hw; o <= hw; o++) ker.push(Math.exp(-0.5 * (o / sgn) ** 2));
    let L = R.map((_, k) => { let s = [0, 0, 0], ws = 0; const ww = closed ? hw : Math.min(hw, k, R.length - 1 - k); for (let o = -ww; o <= ww; o++) { const j = closed ? (((k + o) % R.length) + R.length) % R.length : k + o; s = s.map((x, i) => x + R[j][i] * ker[o + hw]); ws += ker[o + hw]; } return s.map((x) => x / ws); });
    const nearV = []; L = L.map((p) => { let best = p, bd = 9, bv = -1; for (const v of nearPts(p, 0.02)) { if (!region(v)) continue; for (const t of vt[v]) { const q = closestOnTri(p, P3(A.F[t * 3]), P3(A.F[t * 3 + 1]), P3(A.F[t * 3 + 2])), d = Math.hypot(...sub(q, p)); if (d < bd) { bd = d; best = q; bv = v; } } } nearV.push(bv); return best; });
    const n = L.length, normal = L.map((p, i) => { const own = nearV[i] >= 0 ? N3(nearV[i]) : null; let s = [0, 0, 0]; for (const v of nearPts(p, 0.015)) if (region(v) && (!own || dot(N3(v), own) > 0)) s = s.map((x, k) => x + A.PN[v * 3 + k]); return nrm(s); });
    let side = L.map((p, i) => nrm(cross(nrm(sub(L[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], L[closed ? (i - 1 + n) % n : Math.max(0, i - 1)])), normal[i])));
    for (let i = 1; i < n; i++) if (dot(side[i], side[i - 1]) < 0) side[i] = side[i].map((x) => -x);
    // (`oneSide`: the whole line turned once, by all its places' say together (a ragged border's places disagree))
    if (oneSide) { let s2 = 0; side.forEach((d, i) => { for (const v of nearPts(L[i], 0.03)) if (region(v)) s2 += dot(sub(P3(v), L[i]), d) * (w[v] - 0.5); }); if (s2 < 0) side = side.map((d) => d.map((x) => -x)); }
    else side = side.map((d, i) => { let s2 = 0, m2 = 0; for (const v of nearPts(L[i], 0.012)) if (region(v)) { s2 += dot(sub(P3(v), L[i]), d) * (w[v] - 0.5); m2 += Math.abs(dot(sub(P3(v), L[i]), d) * (w[v] - 0.5)); } return m2 > 0 && s2 < -0.3 * m2 ? d.map((x) => -x) : d; });
    out.push({ C: L, side, normal, closed, len: n * 2 });
  }
  return out;
}
function distOf(lines, w, ok = (v) => outside[v], far2 = reach) {
  const d = Float32Array.from({ length: V }, (_, v) => (w[v] >= 0.5 ? reach : -reach)), bd = new Float32Array(V).fill(9);
  for (const L of lines) L.C.forEach((p, i) => { for (const v of nearPts(p, far2)) {
    if (!ok(v) || dot(N3(v), L.normal[i]) < -0.2) continue;
    const e = Math.hypot(...sub(P3(v), p)); if (e >= bd[v]) continue;
    if (!L.closed && (i === 0 || i === L.C.length - 1) && e > 0.004) continue;
    bd[v] = e; d[v] = dot(sub(P3(v), p), L.side[i]);
  } });
  return d;
}
// (an inside point measured as the outside cloth facing it)
const src = (v) => (outside[v] ? v : facing[v] >= 0 ? facing[v] : v);
const regionNames = settings.order ?? Object.keys(settings.regions ?? {});
const regions = regionNames.map((rn) => {
  const R = settings.regions[rn], rs = new Set(R.roles.map(RI)), w = shareOf((v) => rs.has(role[R.own ? v : src(v)]), R.steps ?? 12), L = linesOf(w, R.sigma ?? sigma, undefined, 8, !!R.oneSide), d = distOf(L, w, undefined, R.reach ?? reach);
  report.push(`${rn}: border ${L.map((x) => `${x.len} mm${x.closed ? ' closed' : ''}`).join(', ') || 'none'}`);
  return { name: rn, roles: rs, key: keyIdx(R.key), w, lines: L, d, inside: (v) => (outside[v] ? d[v] : facing[v] >= 0 && !R.own ? d[facing[v]] : w[v] >= 0.5 ? reach : -reach) };
});
const RN = (rn) => regions.findIndex((r) => r.name === rn);

// ---- 4. The lining: in its region the cloth facing into the hood (towards the middle of the hood's cloth at its height).
const linR = settings.lining ? RN(settings.lining.region) : -1, LINING = settings.lining ? keyIdx(settings.lining.key) : -1;
const hoodIn = new Float32Array(V).fill(-1);
if (linR >= 0) {
  const R = regions[linR], hp = []; for (let v = 0; v < V; v++) if (R.w[v] > 0.5) hp.push(v);
  // (per 1 cm of height the hood cloth's middle; smoothed)
  const yb = (y) => Math.round(y / 0.01), mids = new Map();
  for (const v of hp) { const k = yb(A.P[v * 3 + 1]), c = mids.get(k) ?? mids.set(k, [0, 0, 0]).get(k); c[0] += A.P[v * 3]; c[1] += A.P[v * 3 + 2]; c[2]++; }
  const ks = [...mids.keys()].sort((a, b) => a - b), mid = (y) => { let k = yb(y); k = Math.max(ks[0], Math.min(ks.at(-1), k)); let s = [0, 0], ws = 0; for (let o = -3; o <= 3; o++) { const c = mids.get(k + o); if (!c) continue; const wt = Math.exp(-0.5 * (o / 1.5) ** 2) * c[2]; s = [s[0] + (wt * c[0]) / c[2], s[1] + (wt * c[1]) / c[2]]; ws += wt; } return [s[0] / ws, s[1] / ws]; };
  let f = Float32Array.from({ length: V }, (_, v) => { const [cx, cz] = mid(A.P[v * 3 + 1]), d = nrm([cx - A.P[v * 3], 0, cz - A.P[v * 3 + 2]]); return dot(N3(v), d); });
  // (smoothed a little over the same face)
  for (let it = 0; it < 3; it++) { const g = new Float32Array(V); for (let v = 0; v < V; v++) { let s = f[v] * 2, n = 2; for (const u of nbs[v]) { s += f[u]; n++; } g[v] = s / n; } f = g; }
  for (let v = 0; v < V; v++) hoodIn[v] = f[v];
}

// ---- 5. Each point's piece: the region it is in (the first of `order` where two claim it), else the print.
const pair = new Int16Array(V * 2), S = new Float32Array(V), field = new Int16Array(V);   // field: -1 plain, r region r, 50 lining fold, 100+ ring
const plainKey = new Map(Object.entries(settings.plain ?? {}).map(([r, k]) => [RI(r), keyIdx(k)]));
for (let v = 0; v < V; v++) {
  if (plainKey.has(role[v])) { pair[v * 2] = pair[v * 2 + 1] = plainKey.get(role[v]); S[v] = 0.01; field[v] = -1; continue; }
  const ds = regions.map((r) => r.inside(v));
  let r = ds.findIndex((d) => d > 0);
  if (r >= 0) {
    // (its border with the next region on, else the print)
    const o = ds.findIndex((d, j) => j !== r && d > -0.01);
    pair[v * 2] = regions[r].key; pair[v * 2 + 1] = o >= 0 ? regions[o].key : 0; S[v] = ds[r]; field[v] = r;
  } else {
    r = ds.reduce((b, d, j) => (d > ds[b] ? j : b), 0);
    pair[v * 2] = regions[r]?.key ?? 0; pair[v * 2 + 1] = 0; S[v] = ds[r] ?? -0.01; field[v] = regions.length ? r : -1;
  }
  if (linR >= 0 && pair[v * 2] === regions[linR].key && S[v] > 0 && Math.abs(hoodIn[v]) < Math.abs(S[v]) * 30) { pair[v * 2] = LINING; pair[v * 2 + 1] = regions[linR].key; S[v] = hoodIn[v] * 0.01; field[v] = 50; }
}

// ---- 6. Rib bands of one even width (cuffs, waistband): from the opening's fold (where its outside cloth turns in), a depth
// W over the cloth along the opening's axis; the band's colour up to it, the piece round it after.
const rings = [];
for (const [rn, R] of Object.entries(settings.rings ?? {})) {
  const ri = RI(rn), K = keyIdx(R.key), beyond = R.beyond ? regions[RN(R.beyond)] : null;
  const cp = []; for (let v = 0; v < V; v++) if (outside[v] && role[v] === ri) cp.push(v);
  const c0 = cp.reduce((acc, v) => acc.map((x, i) => x + A.P[v * 3 + i] / cp.length), [0, 0, 0]);
  let ax;
  if (R.dir === 'down') ax = [0, -1, 0];
  else if (R.dir === 'up') ax = [0, 1, 0];   // (MODELQ5 2026-11-20, the rash guard's neck band: HOODIE)
  else {
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (const v of cp) { const d = sub(P3(v), c0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
    const tr = C[0][0] + C[1][1] + C[2][2]; ax = [0.31, 0.53, 0.79]; for (let it = 0; it < 300; it++) { const m2 = [0, 1, 2].map((i) => tr * ax[i] - (C[i][0] * ax[0] + C[i][1] * ax[1] + C[i][2] * ax[2])); ax = nrm(m2); }
    // (out of the sleeve: towards the cuff's own end, away from the sleeve's middle above it)
    const sl = beyond ? (() => { const q = []; for (let v = 0; v < V; v++) if (outside[v] && beyond.w[v] > 0.5) q.push(v); return q.reduce((acc, v) => acc.map((x, i) => x + A.P[v * 3 + i] / q.length), [0, 0, 0]); })() : [c0[0], c0[1] + 1, c0[2]];
    if (dot(ax, sub(c0, sl)) < 0) ax = ax.map((x) => -x);
  }
  const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], e1 = nrm(cross(ax, ref)), e2 = cross(ax, e1), NB = 72;
  const ang = (v) => { const d = sub(P3(v), c0); return Math.atan2(dot(d, e2), dot(d, e1)); }, along = (v) => dot(sub(P3(v), c0), ax), rad = (v) => { const d = sub(P3(v), c0), t = dot(d, ax); return Math.hypot(...d.map((x, i) => x - ax[i] * t)); };
  const bin = (v) => Math.min(NB - 1, Math.floor(((ang(v) + Math.PI) / (2 * Math.PI)) * NB));
  const end = new Float32Array(NB).fill(-9); for (const v of cp) end[bin(v)] = Math.max(end[bin(v)], along(v));
  for (let k = 0; k < NB; k++) if (end[k] < -1) { let j2 = 1; while (end[(k + j2) % NB] < -1 && end[(k - j2 + NB) % NB] < -1 && j2 < NB) j2++; end[k] = Math.max(end[(k + j2) % NB], end[(k - j2 + NB) % NB]); }
  // (`endSpan`: each angle's fold the furthest within that many bins either side first: on a coarse mesh many bins miss the edge)
  if (R.endSpan) { const e0 = Float32Array.from(end); for (let k = 0; k < NB; k++) for (let o = -R.endSpan; o <= R.endSpan; o++) end[k] = Math.max(end[k], e0[(k + o + NB) % NB]); }
  const endS = end.map((_, k) => { let s2 = 0, ws = 0; for (let o = -4; o <= 4; o++) { const w2 = Math.exp(-0.5 * (o / 2) ** 2); s2 += end[(k + o + NB) % NB] * w2; ws += w2; } return s2 / ws; });
  const depth = (v) => { const f2 = ((ang(v) + Math.PI) / (2 * Math.PI)) * NB - 0.5, k0 = Math.floor(f2), t2 = f2 - k0; return endS[((k0 % NB) + NB) % NB] * (1 - t2) + endS[(((k0 + 1) % NB) + NB) % NB] * t2 - along(v); };
  const Rm = cp.reduce((acc, v) => acc + rad(v), 0) / cp.length;
  const edge = []; for (const v of cp) if (depth(v) > 0.004 && [...A.nb[v]].some((u) => outside[u] && role[u] !== ri)) edge.push(depth(v));
  edge.sort((a2, b2) => a2 - b2); const W = R.width ?? edge[edge.length >> 1] ?? 0.03;
  // (its cloth: reached over the outside from its own points no deeper than its width and a little; never the body beside
  // a sleeve, never a pocket or cord lying over it)
  const own = new Uint8Array(V), q2 = []; for (const v of cp) { const dp = depth(v); if (dp > -0.03 && dp < W) { own[v] = 1; q2.push(v); } }
  const blocked = (u) => plainKey.has(role[u]) || (R.not ?? []).some((r) => role[u] === RI(r));
  while (q2.length) { const v = q2.pop(); for (const u of A.nb[v]) { if (own[u] || !outside[u] || blocked(u)) continue; const dp = depth(u); if (dp > -0.03 && dp < W + (R.margin ?? 0.015) && rad(u) < Rm * (R.wide ?? 1.4)) { own[u] = 1; q2.push(u); } } }
  const inward = (v) => { const d = sub(P3(v), c0), t = dot(d, ax); return dot(N3(v), nrm(d.map((x, i) => x - ax[i] * t))) < -0.3; };
  const near = (v) => rad(v) < Rm * ((R.wide ?? 1.4) - 0.1);
  // (`strayTo` { region, where } (RUGBYJ 2026-11-20, the hoodie's pocket): where `where` passes, the cloth beyond the band is
  // that region (the waistband meets the pocket on its own line), else as before)
  const stray = R.strayTo ? { key: regions[RN(R.strayTo.region)].key, test: new Function('x', 'y', 'z', 'nx', 'ny', 'nz', `return (${R.strayTo.where});`) } : null;
  const strayAt = (v) => (stray && outside[v] && stray.test(...P3(v), ...N3(v)) ? stray.key : null);
  rings.push({ name: rn, key: K, beyond, W, margin: R.margin ?? 0.015, first: !!R.first, depth, own, inward, near, c0, ax, rad, Rm, strayAt });
  report.push(`${rn} even width ${(W * 1000).toFixed(1)} mm (ring ${(Rm * 1000).toFixed(0)} mm, border ${edge.length})`);
}
for (const [ri, E] of rings.entries()) for (let v = 0; v < V; v++) {
  if (plainKey.has(role[v])) continue;
  const dp = E.depth(v);
  const onIt = E.own[v] || (!outside[v] && E.near(v) && E.inward(v) && (E.own[src(v)] || facing[v] < 0));
  if (onIt && dp > -0.03 && dp < E.W + Math.max(0.03, E.margin)) { pair[v * 2] = E.key; pair[v * 2 + 1] = E.beyond ? E.beyond.key : E.strayAt(v) ?? 0; S[v] = E.W - dp; field[v] = 100 + ri; continue; }
  // (a stray bit of the ring's parts beyond its band: the piece round it)
  if (field[v] >= 100 && field[v] !== 100 + ri) continue;
  if (pair[v * 2] === E.key || pair[v * 2 + 1] === E.key) { const k = E.beyond && E.beyond.w[v] > 0.3 ? E.beyond.key : E.strayAt(v) ?? 0; pair[v * 2] = pair[v * 2 + 1] = k; S[v] = 0.01; field[v] = -1; }
}
// (no stray patches of the final colours on their layer)
{
  const fk = Int16Array.from({ length: V }, (_, v) => (S[v] >= 0 ? pair[v * 2] : pair[v * 2 + 1])), was = Int16Array.from(fk);
  const isl3 = islands(fk, settings.island ?? 60);
  for (let v = 0; v < V; v++) if (fk[v] !== was[v] && !plainKey.has(role[v])) { pair[v * 2] = pair[v * 2 + 1] = fk[v]; S[v] = 0.01; field[v] = -1; }
  report.push(`colour patches taken in: ${isl3} points`);
}
const colourOf = (v) => (S[v] >= 0 ? pair[v * 2] : pair[v * 2 + 1]);
if (process.env.ROLES) {
  // (debug: each point's role and side (outside 0 / inside +16) as its piece, for an offline picture)
  const o = new Uint8Array(m.n * 3); for (let i = 0; i < m.n; i++) { const v = A.weld[i], k = role[v] + 1 + (outside[v] ? 0 : 20); o[i * 3] = o[i * 3 + 1] = k; o[i * 3 + 2] = 130; }
  const D2 = { ...D, partKeys: [...roleNames, ...Array(20 - roleNames.length).fill('x'), ...roleNames.map((r) => `in:${r}`)], piece: Buffer.from(o).toString('base64'), pieceTri: '' };
  fs.writeFileSync(path.join(process.env.ROLES, `tripo-${name}.js`), `window.TRIPO_MESHES=window.TRIPO_MESHES||{};window.TRIPO_MESHES[${JSON.stringify(name)}]=${JSON.stringify(D2)};\n`);
  const cnt = new Map(); for (let v = 0; v < V; v++) { const k = `${roleNames[role[v]]}:${outside[v] ? 'out' : 'in'}:${['print', ...keys][colourOf(v)]}`; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  console.log([...cnt].sort().map(([k, c]) => `${k} ${c}`).join('\n'));
}

// ---- 7. Stitch lines: thin lines on the outside cloth at an even distance from a border or an opening's fold.
const stitches = [];
if (settings.stitches) {
  const T2 = settings.stitches, sg2 = T2.sigma ?? 0.02;
  const put = (L, what, flip = null) => {
    if (L.len < (T2.minLen ?? 60)) return;
    const n2 = flip ? L.C.map((p, i) => (dot(L.normal[i], flip(p)) < 0 ? L.normal[i].map((x) => -x) : L.normal[i])) : L.normal;
    stitches.push({ what, closed: L.closed, c: L.C.flatMap((p) => p.map((x) => +x.toFixed(5))), n: n2.flatMap((p) => p.map((x) => +x.toFixed(3))) });
    report.push(`stitch ${what}: ${L.len} mm${L.closed ? ' closed' : ''}`);
  };
  for (const s of T2.seams ?? []) {
    const R = regions[RN(s.region)], f = Float32Array.from({ length: V }, (_, v) => 0.5 + (R.d[v] - s.at) * (s.at >= 0 ? 1 : 1));
    // (on the cloth on its side of the border, outside, never on a band or cord)
    const ok = (v) => outside[v] && !plainKey.has(role[v]) && (s.at >= 0 ? R.d[v] > -0.002 : R.d[v] < 0.002) && !rings.some((E) => E.own[v] && E.depth(v) < E.W + 0.002);
    for (const L of linesOf(f, sg2, ok)) put(L, `${s.region} ${s.at > 0 ? 'in' : 'out'} ${Math.abs(s.at * 1000)} mm`);
  }
  for (const s of T2.rings ?? []) {
    const E = rings.find((r) => r.name === s.role); if (!E) continue;
    const ok = (v) => outside[v] && (E.own[v] || (E.beyond ? E.beyond.w[v] > 0.3 : true)) && E.rad(v) < E.Rm * 1.5 && E.depth(v) > -0.01 && E.depth(v) < E.W + 0.05 && !plainKey.has(role[v]);
    const f = Float32Array.from({ length: V }, (_, v) => 0.5 + (E.depth(v) - (E.W + s.at)));
    const Ls = linesOf(f, sg2, ok).filter((L) => L.len >= (T2.minLen ?? 60));
    const radial = (p) => { const d = sub(p, E.c0), t = dot(d, E.ax); return d.map((x, i) => x - E.ax[i] * t); };
    const mr = (L) => L.C.reduce((acc, p) => acc + Math.hypot(...radial(p)), 0) / L.C.length;
    const L = Ls.sort((a2, b2) => mr(b2) - mr(a2) || b2.len - a2.len)[0];
    if (L) put(L, `${s.role} ${(s.at * 1000).toFixed(0)} mm past its band`, radial);
  }
}

// ---- 8. Print places (altUv): the body's place of every point as the converter laid it (B); each sleeve's points laid onto
// the made sleeve (S), and the cloth beside a sleeve's seam given the sleeve's place at the seam, so the seam prints straight.
const flat = new Int16Array(new Uint8Array(Buffer.from(D.flat, 'base64')).buffer), side = new Uint8Array(Buffer.from(D.side, 'base64')), U0 = D.flatUnit;
const altB = Int16Array.from(flat), altSideB = Uint8Array.from(side), fS = Int16Array.from(flat), sS = Uint8Array.from(side);
let mapped = 0, seamMapped = 0;
const lerp = (a2, b2, t) => [a2[0] + (b2[0] - a2[0]) * t, a2[1] + (b2[1] - a2[1]) * t];
const geoAll = (seeds, region) => { const d = new Float32Array(V).fill(9), q = []; for (const v of seeds) { d[v] = 0; q.push(v); } while (q.length) { let bi = 0; for (let i = 1; i < q.length; i++) if (d[q[i]] < d[q[bi]]) bi = i; const v = q[bi]; q[bi] = q[q.length - 1]; q.pop(); for (const u of A.nb[v]) { if (!region(u)) continue; const nd = d[v] + Math.hypot(...sub(P3(u), P3(v))); if (nd < d[u]) { d[u] = nd; q.push(u); } } } return d; };
const placeOf = new Map(), seamPlace = new Map();
for (const [rn, SM] of Object.entries(settings.sleeveMap ?? {})) {
  const R = regions[RN(rn)], cuff = rings.find((E) => E.beyond === R), inK = new Uint8Array(V), sp = [];
  for (let v = 0; v < V; v++) { const k = colourOf(v); if (k === R.key || (cuff && k === cuff.key)) { inK[v] = 1; sp.push(v); } }
  const [A0, B0] = SM.armhole, [C0, D2] = SM.cuff;
  const cE = cuff ? cuff.c0 : sp.reduce((a2, v) => a2.map((x, i) => x + A.P[v * 3 + i] / sp.length), [0, 0, 0]), cA = sp.reduce((a2, v) => a2.map((x, i) => x + A.P[v * 3 + i] / sp.length), [0, 0, 0]);
  const ax2 = nrm(sub(cE, cA)), radialOf = (v) => { const d = sub(P3(v), cA), t = dot(d, ax2); return d.map((x, i) => x - ax2[i] * t); };
  const outer = (v) => inK[v] && outside[v];
  const seam = sp.filter((v) => outer(v) && [...A.nb[v]].some((u) => !inK[u] && outside[u]));
  const rim = cuff ? sp.filter((v) => outer(v) && cuff.depth(v) < 0.006 && cuff.own[v]) : [];
  const gS = geoAll(seam, outer), gC = geoAll(rim, outer);
  const inset = SM.inset ?? 0.07, sgn = Math.sign(cE[0]);
  // (the sleeve's top on the made pattern is its outer side here: the arm hangs down, so 'up' round it is out from the body)
  const sq = (w) => nrm(w.map((x, i) => x - ax2[i] * dot(w, ax2))), eUp = sq(SM.up ?? [sgn, 0.5, 0]), eF = sq([0, 0, 1]);
  const at = (u, th) => { const vv = Math.min(1, Math.abs(th) / Math.PI), [px, py] = lerp(lerp(A0, C0, 0.04 + 0.92 * u), lerp(B0, D2, 0.04 + 0.92 * u), inset + (1 - 2 * inset) * vv); return [sgn * px, py, th >= 0 ? 0 : 1]; };
  for (const v of sp) {
    const o = outside[v] ? v : facing[v] >= 0 && inK[facing[v]] ? facing[v] : -1, ok = o >= 0 && gS[o] < 8 && gC[o] < 8;
    const u = ok ? Math.max(0, Math.min(1, gS[o] / (gS[o] + gC[o] || 1))) : 1, r = radialOf(v);
    placeOf.set(v, at(u, Math.atan2(dot(r, eF), dot(r, eUp))));
  }
  // (the cloth beside the seam, within 5 cm: the sleeve's own edge place at the seam (u 0))
  const SG = 0.025, sgrid = new Map(); for (const v of seam) { const kk = P3(v).map((x) => Math.floor(x / SG)).join(','); (sgrid.get(kk) ?? sgrid.set(kk, []).get(kk)).push(v); }
  const nearSeam = (v) => { const c = P3(v).map((x) => Math.floor(x / SG)); for (let a2 = -2; a2 <= 2; a2++) for (let b2 = -2; b2 <= 2; b2++) for (let c2 = -2; c2 <= 2; c2++) for (const u of sgrid.get(`${c[0] + a2},${c[1] + b2},${c[2] + c2}`) ?? []) if (Math.hypot(...sub(P3(u), P3(v))) < 0.05) return true; return false; };
  for (let v = 0; v < V; v++) {
    if (inK[v] || placeOf.has(v) || seamPlace.has(v) || Math.sign(A.P[v * 3]) !== sgn || !nearSeam(v)) continue;
    const r = radialOf(v); seamPlace.set(v, at(0, Math.atan2(dot(r, eF), dot(r, eUp))));
  }
}
// (pieces of one plain colour (hood, lining, cords, bands) by a sleeve: their main place is the sleeve's seam place, so a
// triangle between them and the sleeve prints its sleeve side from the sleeve's place, never across the atlas)
const plainK = new Set([...plainKey.values(), ...rings.map((E) => E.key), ...(settings.plainKeys ?? []).map(keyIdx), LINING].filter((k) => k > 0));
for (let i = 0; i < m.n; i++) {
  const v = A.weld[i], pl = placeOf.get(v), sm = seamPlace.get(v);
  if (pl) { flat[i * 2] = fS[i * 2] = Math.round(pl[0] / U0); flat[i * 2 + 1] = fS[i * 2 + 1] = Math.round(pl[1] / U0); side[i] = sS[i] = (side[i] & ~1) | pl[2]; mapped++; continue; }
  if (sm) { fS[i * 2] = Math.round(sm[0] / U0); fS[i * 2 + 1] = Math.round(sm[1] / U0); sS[i] = (sS[i] & ~1) | sm[2]; seamMapped++; if (plainK.has(colourOf(v))) { flat[i * 2] = fS[i * 2]; flat[i * 2 + 1] = fS[i * 2 + 1]; side[i] = sS[i]; } }
}
report.push(`sleeve points laid on the made sleeves: ${mapped}; beside their seams ${seamMapped}`);
// (`bodyEdge` [[y, x], ...]: the made pattern's side edge (half-width) by height below the underarm (`bodyPit`): the body's print
// places across measured again round its smoothed outermost cloth per half and per 5 mm of height, scaled so the body's
// own side lands on the pattern's side; above the underarm the underarm's scale. The converter's scale took the sleeves
// hanging beside the body as body, so prints came out a third too wide.)
if (settings.bodyEdge) {
  const E = settings.bodyEdge, pit = settings.bodyPit ?? E[0][0], edgeAt = (y) => { const yy = Math.min(pit, y); for (let k = 0; k + 1 < E.length; k++) { const [y0, x0] = E[k], [y1, x1] = E[k + 1]; if ((yy - y0) * (yy - y1) <= 0) return x0 + ((x1 - x0) * (yy - y0)) / (y1 - y0 || 1); } return yy > E[0][0] ? E[0][1] : E.at(-1)[1]; };
  const notBody = new Set([...regions.filter((r) => /sleeve|hood|lining/i.test(r.name)).map((r) => r.key), ...plainK]);
  const isBody = (v) => outside[v] && !notBody.has(colourOf(v)) && !placeOf.has(v);
  const YB = 0.005, XB = 0.005; let yMin = 9, yMax = -9, xMax = 0; for (let v = 0; v < V; v++) { yMin = Math.min(yMin, A.P[v * 3 + 1]); yMax = Math.max(yMax, A.P[v * 3 + 1]); xMax = Math.max(xMax, Math.abs(A.P[v * 3])); }
  const NY = Math.ceil((yMax - yMin) / YB) + 1, NX = Math.ceil(xMax / XB) + 2, half = new Uint8Array(V); for (let i = 0; i < m.n; i++) half[A.weld[i]] = side[i] & 1;
  const Z = [0, 1].map(() => Array.from({ length: NY }, () => new Float64Array(NX).fill(NaN)));
  for (let v = 0; v < V; v++) { if (!isBody(v)) continue; const h = half[v], r = Math.round((A.P[v * 3 + 1] - yMin) / YB), c = Math.round(Math.abs(A.P[v * 3]) / XB), z = A.P[v * 3 + 2], row = Z[h][r]; if (Number.isNaN(row[c]) || (h ? z < row[c] : z > row[c])) row[c] = z; }
  const g1 = (sg, Bn) => { const Rr = Math.ceil((3 * sg) / Bn), k = []; for (let o = -Rr; o <= Rr; o++) k.push(Math.exp(-0.5 * ((o * Bn) / sg) ** 2)); return { R: Rr, k }; }, KX = g1(0.02, XB), KY = g1(0.02, YB);
  const arcs = [0, 1].map((h) => {
    const sx = Z[h].map((row) => Float64Array.from(row, (_, c) => { if (Number.isNaN(row[c])) return NaN; let s2 = 0, w2 = 0; for (let o = -KX.R; o <= KX.R; o++) { const v2 = row[c + o]; if (v2 === undefined || Number.isNaN(v2)) continue; s2 += KX.k[o + KX.R] * v2; w2 += KX.k[o + KX.R]; } return s2 / w2; }));
    const sy = sx.map((row, r) => Float64Array.from(row, (_, c) => { if (Number.isNaN(row[c])) return NaN; let s2 = 0, w2 = 0; for (let o = -KY.R; o <= KY.R; o++) { const v2 = sx[r + o]?.[c]; if (v2 === undefined || Number.isNaN(v2)) continue; s2 += KY.k[o + KY.R] * v2; w2 += KY.k[o + KY.R]; } return s2 / w2; }));
    return sy.map((row) => { const a = new Float64Array(NX).fill(NaN); let acc = 0, prev = null; for (let c = 0; c < NX; c++) { if (Number.isNaN(row[c])) continue; acc = prev === null ? c * XB : acc + Math.hypot((c - prev[0]) * XB, row[c] - prev[1]); a[c] = acc; prev = [c, row[c]]; } return a; });
  });
  // (the scale per height: the pattern's edge over the way round to the body's side (its last column), smoothed; above the underarm held)
  const pitR = Math.round((pit - yMin) / YB);
  const scale = [0, 1].map((h) => {
    const raw = Float64Array.from({ length: NY }, (_, r) => { const a = arcs[h][r]; let last = -1; for (let c = 0; c < NX; c++) if (!Number.isNaN(a[c])) last = c; return last > 4 && a[last] > 0.1 && r <= pitR ? edgeAt(yMin + r * YB) / a[last] : NaN; });
    const sm = Float64Array.from(raw, (_, r) => { let s2 = 0, w2 = 0; for (let o = -8; o <= 8; o++) { const v2 = raw[r + o]; if (v2 === undefined || Number.isNaN(v2)) continue; const wt = Math.exp(-0.5 * (o / 4) ** 2); s2 += wt * v2; w2 += wt; } return w2 ? s2 / w2 : NaN; });
    let lastK = NaN; for (let r = 0; r < NY; r++) { if (!Number.isNaN(sm[r])) lastK = sm[r]; else if (r > pitR) sm[r] = lastK; }
    let firstK = sm.find((x) => !Number.isNaN(x)); for (let r = 0; r < NY; r++) if (Number.isNaN(sm[r])) sm[r] = firstK; else break;
    return sm;
  });
  report.push(`body scale across: front ${scale[0][Math.round((0.3 - yMin) / YB)].toFixed(3)} back ${scale[1][Math.round((0.3 - yMin) / YB)].toFixed(3)} (at 30 cm), at the underarm ${scale[0][pitR]?.toFixed(3)}`);
  // (true size (1:1) over the middle `trueShare` of the way to the side, so marks keep their shape; the rest stretched or
  // pressed so the body's side lands on the pattern's side)
  const TS = settings.bodyTrue ?? 0.6, across = (a, k, y) => { const E = edgeAt(y), side = E / k, a0 = TS * Math.min(side, E); return a <= a0 ? a : a0 + ((a - a0) * (E - a0)) / Math.max(1e-3, side - a0); };
  let moved = 0;
  for (let i = 0; i < m.n; i++) {
    const v = A.weld[i]; if (placeOf.has(v) || notBody.has(colourOf(v))) continue;
    const h = altSideB[i] & 1, r = Math.max(0, Math.min(NY - 1, Math.round((A.P[v * 3 + 1] - yMin) / YB))), cf = Math.abs(A.P[v * 3]) / XB, c0 = Math.floor(cf), t = cf - c0;
    let a0 = arcs[h][r][c0], a1 = arcs[h][r][c0 + 1];
    if (a0 === undefined || Number.isNaN(a0)) { let c2 = c0; while (c2 > 0 && Number.isNaN(arcs[h][r][c2])) c2--; a0 = Number.isNaN(arcs[h][r][c2]) ? c0 * XB : arcs[h][r][c2] + (c0 - c2) * XB; }
    const a = a1 === undefined || Number.isNaN(a1) ? a0 + t * XB : a0 * (1 - t) + a1 * t, nx = Math.round(((Math.sign(A.P[v * 3]) || 1) * across(a, scale[h][r], A.P[v * 3 + 1])) / U0);
    altB[i * 2] = nx; if (!seamPlace.has(v) || !plainK.has(colourOf(v))) flat[i * 2] = nx; moved++;
  }
  report.push(`body print places measured again: ${moved}`);
}
// (the neck opening's rim (the form's neck, the neck label): per 1/48 round the neck the highest cloth that is not the
// hood, its lining or the cords, within `neckReach` of the middle)
if (settings.neckReach) {
  const hoodK = new Set([...regions.filter((r) => /hood|lining/i.test(r.name)).map((r) => r.key), ...plainKey.values()]), pts = [];
  for (let v = 0; v < V; v++) if (!hoodK.has(colourOf(v)) && Math.hypot(A.P[v * 3], A.P[v * 3 + 2]) < settings.neckReach && A.P[v * 3 + 1] > 0.5) pts.push(v);
  const cx = pts.reduce((a, v) => a + A.P[v * 3], 0) / pts.length, cz = pts.reduce((a, v) => a + A.P[v * 3 + 2], 0) / pts.length, bins = new Array(48).fill(-1);
  for (const v of pts) { const b2 = Math.floor((Math.atan2(A.P[v * 3] - cx, A.P[v * 3 + 2] - cz) / (2 * Math.PI) + 1) * 48) % 48; if (bins[b2] < 0 || A.P[v * 3 + 1] > A.P[bins[b2] * 3 + 1]) bins[b2] = v; }
  D.neck = bins.filter((v) => v >= 0).map((v) => P3(v).map((q2) => +q2.toFixed(5)));
  report.push(`neck rim: ${D.neck.length} points, ${Math.min(...D.neck.map((p) => p[1])).toFixed(3)}..${Math.max(...D.neck.map((p) => p[1])).toFixed(3)} high`);
}
// (out of the form inside: the hood and cords; data side bit 2)
const formOut = new Set((settings.form ?? []).map(RI));
let outForm = 0; for (let i = 0; i < m.n; i++) if (formOut.has(role[A.weld[i]])) { side[i] |= 2; sS[i] |= 2; altSideB[i] |= 2; outForm++; }
report.push(`points kept out of the form: ${outForm}`);
D.flat = Buffer.from(flat.buffer).toString('base64'); D.side = Buffer.from(side).toString('base64');
D.flatB = Buffer.from(altB.buffer).toString('base64'); D.sideB = Buffer.from(altSideB).toString('base64');
D.flatS = Buffer.from(fS.buffer).toString('base64'); D.sideS = Buffer.from(sS).toString('base64');

// ---- Data: per point its pair and distance; triangles whose corners have different pairs: one line for all three corners.
const n = m.n, q = (s) => Math.max(1, Math.min(255, Math.round(128 + (s * 1000) / 0.4))), out = new Uint8Array(n * 3);
for (let i = 0; i < n; i++) { const v = A.weld[i], a = pair[v * 2], b = pair[v * 2 + 1]; out[i * 3] = a; out[i * 3 + 1] = b; out[i * 3 + 2] = q(a === b ? 0.01 : S[v]); }
const valueIn = (v, f) => {
  if (f >= 100) { const E = rings[f - 100]; return E.W - E.depth(v); }
  if (f === 50) return hoodIn[v] * 0.01;
  return regions[f].inside(v);
};
const tris = []; let mixed = 0;
for (let t = 0; t < A.T; t++) {
  const c = [A.F[t * 3], A.F[t * 3 + 1], A.F[t * 3 + 2]];
  if (c.every((v) => pair[v * 2] === pair[c[0] * 2] && pair[v * 2 + 1] === pair[c[0] * 2 + 1])) continue;
  mixed++;
  const live = c.filter((v) => field[v] >= 0 && pair[v * 2] !== pair[v * 2 + 1]);
  if (!live.length) { const ks = c.map(colourOf), k = ks.sort((x, y) => ks.filter((z) => z === y).length - ks.filter((z) => z === x).length)[0]; tris.push(t & 255, (t >> 8) & 255, (t >> 16) & 255, k, k, q(0.01), q(0.01), q(0.01)); continue; }
  const fs2 = [...new Set(live.map((v) => field[v]))], mean = (f2) => Math.abs(c.reduce((acc, v) => acc + valueIn(v, f2), 0) / 3);
  // (a rib band marked `first` cuts its own even edge through a triangle it shares with another piece)
  const firstR = fs2.find((f2) => f2 >= 100 && rings[f2 - 100].first);
  const f = firstR !== undefined ? firstR : fs2.length > 1 ? fs2.reduce((x, y) => (mean(y) < mean(x) ? y : x)) : fs2[0];
  const vf = live.find((v) => field[v] === f); const a = pair[vf * 2], b = pair[vf * 2 + 1];
  tris.push(t & 255, (t >> 8) & 255, (t >> 16) & 255, a, b, ...c.map((v) => q(valueIn(v, f))));
}
// (no specks: a patch of fewer than `speck` triangles of one colour inside another takes that colour)
{
  const own = new Map(); for (let j = 0; j < tris.length; j += 8) own.set(tris[j] | (tris[j + 1] << 8) | (tris[j + 2] << 16), j);
  const keyAt = (t) => { const j = own.get(t); if (j !== undefined) { const sv = (tris[j + 5] + tris[j + 6] + tris[j + 7]) / 3 - 128; return sv >= 0 ? tris[j + 3] : tris[j + 4]; } return colourOf(A.F[t * 3]); };
  const tk = Int16Array.from({ length: A.T }, (_, t) => keyAt(t)), adjT = Array.from({ length: A.T }, () => []), em = new Map();
  for (let t = 0; t < A.T; t++) for (let k = 0; k < 3; k++) { const a2 = A.F[t * 3 + k], b2 = A.F[t * 3 + (k + 1) % 3], kk = a2 < b2 ? a2 * 1e6 + b2 : b2 * 1e6 + a2; const o = em.get(kk); if (o !== undefined) { adjT[t].push(o); adjT[o].push(t); } else em.set(kk, t); }
  const seen = new Uint8Array(A.T); let fixed = 0;
  for (let s0 = 0; s0 < A.T; s0++) {
    if (seen[s0]) continue;
    const comp = [s0]; seen[s0] = 1;
    for (let i = 0; i < comp.length; i++) for (const u of adjT[comp[i]]) if (!seen[u] && tk[u] === tk[s0]) { seen[u] = 1; comp.push(u); }
    if (comp.length >= (settings.speck ?? 8) || plainK.has(tk[s0]) && comp.some((t) => plainKey.has(role[A.F[t * 3]]))) continue;
    const votes = new Map(); for (const t of comp) for (const u of adjT[t]) if (tk[u] !== tk[s0]) votes.set(tk[u], (votes.get(tk[u]) ?? 0) + 1);
    const to = [...votes].sort((x, y) => y[1] - x[1])[0]?.[0]; if (to === undefined) continue;
    for (const t of comp) { const j = own.get(t), row = [t & 255, (t >> 8) & 255, (t >> 16) & 255, to, to, q(0.01), q(0.01), q(0.01)]; if (j !== undefined) tris.splice(j, 8, ...row); else { own.set(t, tris.length); tris.push(...row); } fixed++; }
  }
  // (`strictCorners` (RUGBYJ 2026-11-20, hoodie item 13: tiny hood-coloured dashes under the hood seam): a triangle showing a
  // colour in a corner keeps it only if a triangle beside it is wholly that colour, else it is one colour (its middle's).)
  if (settings.strictCorners) {
    const shows = (t) => { const j = own.get(t); if (j === undefined) return new Set([colourOf(A.F[t * 3]), colourOf(A.F[t * 3 + 1]), colourOf(A.F[t * 3 + 2])]); const o = new Set(); for (const k of [5, 6, 7]) o.add(tris[j + k] >= 128 ? tris[j + 3] : tris[j + 4]); return o; };
    let corners = 0;
    for (const [t, j] of [...own]) {
      if (tris[j + 3] === tris[j + 4]) continue;
      const sv = (tris[j + 5] + tris[j + 6] + tris[j + 7]) / 3 - 128, mid = sv >= 0 ? tris[j + 3] : tris[j + 4], minor = sv >= 0 ? tris[j + 4] : tris[j + 3];
      if (adjT[t].some((u) => { const sh = shows(u); return sh.size === 1 && sh.has(minor); })) continue;
      tris.splice(j, 8, t & 255, (t >> 8) & 255, (t >> 16) & 255, mid, mid, q(0.01), q(0.01), q(0.01)); corners++;
    }
    report.push(`lone corners made one colour: ${corners}`);
  }
  report.push(`triangles by two pieces ${mixed}; specks ${fixed}`);
}
if (stitches.length) D.stitches = stitches; else delete D.stitches;
// (`zipLine` (HOODIE/MODELQ6 2026-11-20, the zip hoodie; as viewer/tripo-glbparts.mjs, MODELQ5's Zip-up polo): the centre
// front's line (x = 0) over the outside cloth from `top` (the parts file's own height: the zip's top) down to the hem's fold,
// smoothed: data `zip`, along which main.js lays our own zip tape and teeth (the model's shape unchanged, the print under it).)
if (settings.zipLine) {
  const yTop = place([0, settings.zipLine.top, 0])[1];
  const zr = (v) => outside[v] && A.P[v * 3 + 2] > 0 && A.P[v * 3 + 1] < yTop && Math.abs(A.P[v * 3]) < 0.05;
  let Lz = linesOf(Float32Array.from({ length: V }, (_, v) => 0.5 + A.P[v * 3] * 50), settings.zipLine.sigma ?? 0.01, zr).sort((a2, b2) => b2.len - a2.len);
  const rest = Lz.slice(1); Lz = Lz[0];
  if (Lz) {
    if (Lz.C[0][1] < Lz.C[Lz.C.length - 1][1]) { Lz.C.reverse(); Lz.normal.reverse(); }
    // (a piece carrying on up from its top within 1 cm (a notch in the cloth breaks the line), all of it higher and on the
    // front's outside (z > 8 cm), joined on: the zip hoodie's funnel neck up to its top edge)
    for (let more = true; more;) {
      more = false;
      for (const L of rest) {
        if (L.used) continue;
        if (L.C[0][1] > L.C.at(-1)[1]) { L.C.reverse(); L.normal.reverse(); }
        if (Math.hypot(...sub(L.C[0], Lz.C[0])) < 0.01 && L.C.every((q) => q[1] > Lz.C[0][1] - 0.005 && q[2] > 0.08)) {
          Lz.C = [...[...L.C].reverse(), ...Lz.C]; Lz.normal = [...[...L.normal].reverse(), ...Lz.normal]; Lz.len += L.len; L.used = more = true;
        }
      }
    }
    // (down to its lowest point only (past it the line runs back up the hem's turned-up inside), ending above the fold)
    const yLow = Math.min(...Lz.C.map((q) => q[1])), cutAt = Lz.C.findIndex((q) => q[1] <= yLow + (settings.zipLine.end ?? 0.006));
    if (cutAt > 0) { Lz.C = Lz.C.slice(0, cutAt); Lz.normal = Lz.normal.slice(0, cutAt); Lz.len = Lz.C.length * 2; }
    D.zip = [{ c: Lz.C.flatMap((q) => q.map((x) => +x.toFixed(5))), n: Lz.normal.map((q) => (q[2] < 0 ? q.map((x) => -x) : q)).flatMap((q) => q.map((x) => +x.toFixed(3))) }];
    report.push(`zip line ${Lz.len} mm, from ${Lz.C[0][1].toFixed(3)} down to ${Lz.C[Lz.C.length - 1][1].toFixed(3)}`);
  } else report.push('zip line: none found');
} else delete D.zip;
// (`zipParts` (MODELQ7 2026-11-24, item 138: the waterproof jacket's pocket zips came out ragged as plain parts): [{ part, where }]:
// each a STRAIGHT zip of our own (main.js lays tape and teeth of one even width along data `zip`, as the front zip), from end
// to end of that part's points (the parts file's own; `where` x y z in its units picks one of several), laid on the front's
// outside cloth there. The part itself counts as the body (its role), so no ragged colour edge is left.)
if (settings.zipParts?.length) {
  D.zip ??= [];
  for (const Z of settings.zipParts) {
    const test = Z.where ? new Function('x', 'y', 'z', `return (${Z.where});`) : () => true;
    const pts = (parts.find((p) => p.name === Z.part)?.tris ?? []).filter((q) => test(...q)).map(place);
    if (pts.length < 6) { report.push(`zip part ${Z.part}: too few points`); continue; }
    // the part's main direction across the front (x, y): its two ends
    const cx = pts.reduce((t, q) => t + q[0], 0) / pts.length, cy = pts.reduce((t, q) => t + q[1], 0) / pts.length;
    let sxx = 0, sxy = 0, syy = 0; for (const q of pts) { const dx = q[0] - cx, dy = q[1] - cy; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
    const ts = pts.map((q) => (q[0] - cx) * ux + (q[1] - cy) * uy), t0 = Math.min(...ts) + 0.004, t1 = Math.max(...ts) - 0.004;
    const C = [], Nn = [];
    for (let t = t1; t >= t0 - 1e-9; t -= 0.004) {
      const x = cx + ux * t, y = cy + uy * t;
      // the outside cloth there: the front-most point within 6 mm across
      let best = -1; for (let v = 0; v < V; v++) { if (!outside[v] || A.P[v * 3 + 2] <= 0 || Math.hypot(A.P[v * 3] - x, A.P[v * 3 + 1] - y) > 0.006) continue; if (best < 0 || A.P[v * 3 + 2] > A.P[best * 3 + 2]) best = v; }
      if (best < 0) continue;
      C.push([x, y, A.P[best * 3 + 2]]); Nn.push(N3(best));
    }
    if (C.length < 3) { report.push(`zip part ${Z.part}: no cloth found`); continue; }
    if (C[0][1] < C.at(-1)[1]) { C.reverse(); Nn.reverse(); }
    D.zip.push({ c: C.flatMap((q) => q.map((x) => +x.toFixed(5))), n: Nn.map((q) => (q[2] < 0 ? q.map((x) => -x) : q)).flatMap((q) => q.map((x) => +x.toFixed(3))) });
    report.push(`zip part ${Z.part}${Z.where ? ` (${Z.where})` : ''}: straight zip ${C.length * 4} mm`);
  }
}
if (settings.data) Object.assign(D, settings.data);
D.partKeys = keys; D.piece = Buffer.from(out).toString('base64'); D.pieceTri = Buffer.from(Uint8Array.from(tris)).toString('base64');
fs.writeFileSync(path.join(here, `tripo-${name}.js`), `window.TRIPO_MESHES=window.TRIPO_MESHES||{};window.TRIPO_MESHES[${JSON.stringify(name)}]=${JSON.stringify(D)};\n`);
say(`keys ${keys.join(', ')}`); for (const r of report) say(r);
