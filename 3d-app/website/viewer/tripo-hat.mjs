// The shared converter for ready-made (Tripo) headwear: the cap, the beanie and the bucket hat (MODELQ7 2026-11-23,
// coordinator: the user's new cap / beanie / bucket hat models replace cap.js / beanie.js / bucket.js on every tile).
// The model's own points, triangles and normals, used exactly as they are: one uniform scale and a move onto the made
// hat's place (nothing reshaped, nothing removed). Printed through the made hat's own flat pattern (capprint.js,
// beanieprint.js, hatprint.js): each point takes the print place of the nearest made surface facing its own way
// (tripo-convert.mjs madeSurface), so the panels' prints, artwork on the front and our marks land where they do on the
// made hat. A triangle whose corners fall on both halves of the print is written on one half (its points copied with
// that half's places), as tripo-top.mjs does.
//
// Settings (viewer/models/<name>.json `convert`):
//   made     'cap' | 'beanie' | 'bucket-hat': the made hat whose place and print it takes
//   weld     points that are the same point (identical place and normal) taken as one (fewer points; nothing moves)
//   align    'back' (the cap: its crown's back on the made crown's back, its brim forward) | 'centre' (default)
//   alignY   'top': its top on the made hat's top (the bucket hat: its chin cord hangs below), else its bottom
//   fit      'width' (default: its width side to side as the made hat's) | 'height'
//   scaleBy  an extra factor on that scale (default 1)
//   smooth   passes evening out each point's print place with its neighbours' on the same half and facing the same
//            way (a ribbed knit: its ridges and grooves otherwise snap to uneven places)
//   innerRay  the inside marked per point (data `inner`, tripomesh.js innerOf): a point whose ray along its normal meets the
//            hat again further than `innerMin` metres away (default 0.02) faces into the hat; drawn in the inside's plain colour
//            (the normal-only rule marked the beanie's rib grooves on the outside)
//   tilt     degrees turned round the side-to-side axis first (+: its front down), so its band lies as the made hat's band
//            (placing only: the cap model sits tipped back as worn; the made cap's band is level)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
// (`plainParts` (MODELQ7 2026-11-24): { glb: the same model split into parts by Tripo (from viewer/), keys: { <part node>: key } }:
// the triangles nearest those parts drawn in one plain colour by their key (data triPart / partKeys, main.js; texture.js
// paintModelSwatches: 'plain:zone:cord|secondary' = the Cord colour, else the trim colour): the bucket hat's chin cord.)
function readParts(file) {
  const buf = fs.readFileSync(file);
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) { const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4), chunk = buf.subarray(off + 8, off + 8 + len); if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8')); else if (type === 0x004e4942) bin = chunk; off += 8 + len; }
  const read = (i) => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], comps = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type], Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType]; const st = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0); return new Type(bin.buffer.slice(st, st + a.count * comps * Type.BYTES_PER_ELEMENT)); };
  const out = [];
  for (const node of json.nodes) {
    if (node.mesh == null) continue;
    const t = node.translation ?? [0, 0, 0], sc = node.scale ?? [1, 1, 1], cents = [];
    for (const prim of json.meshes[node.mesh].primitives) {
      const p = read(prim.attributes.POSITION), ix = prim.indices != null ? read(prim.indices) : Uint32Array.from({ length: p.length / 3 }, (_, i) => i);
      for (let k = 0; k < ix.length; k += 3) { const c = [0, 0, 0]; for (let j = 0; j < 3; j++) for (let a = 0; a < 3; a++) c[a] += (p[ix[k + j] * 3 + a] * sc[a] + t[a]) / 3; cents.push(c); }
    }
    out.push({ name: node.name, cents });
  }
  return out;
}
const BUILD = { cap: 'buildCap', beanie: 'buildBeanie', 'bucket-hat': 'buildBucketHat' };

export default {
  lib: "export { buildCap } from './cap.js'; export { buildBeanie } from './beanie.js'; export { buildBucketHat } from './bucket.js';",
  async convert({ glb: glb0, lib, settings, tools }) {
    const C = settings.convert ?? {}, log = [];
    let glb = glb0;
    if (C.weld) {
      const at = new Map(), keep = [], to = new Uint32Array(glb.pos.length / 3);
      for (let i = 0; i < to.length; i++) {
        const k = `${glb.pos[i * 3]},${glb.pos[i * 3 + 1]},${glb.pos[i * 3 + 2]},${glb.nor[i * 3]},${glb.nor[i * 3 + 1]},${glb.nor[i * 3 + 2]}`;
        if (!at.has(k)) { at.set(k, keep.length); keep.push(i); }
        to[i] = at.get(k);
      }
      const pick = (A) => Float32Array.from({ length: keep.length * 3 }, (_, j) => A[keep[Math.floor(j / 3)] * 3 + (j % 3)]);
      glb = { ...glb, pos: pick(glb.pos), nor: pick(glb.nor), idx: glb.idx.map((v) => to[v]) };
    }
    if (C.tilt) {
      const a = (C.tilt * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), P = Float32Array.from(glb.pos), N = Float32Array.from(glb.nor);
      for (const A of [P, N]) for (let i = 0; i < A.length / 3; i++) { const y = A[i * 3 + 1], z = A[i * 3 + 2]; A[i * 3 + 1] = y * c - z * sn; A[i * 3 + 2] = y * sn + z * c; }
      glb = { ...glb, pos: P, nor: N };
    }
    const madeKind = C.made ?? settings.part;
    const made = lib[BUILD[madeKind]]({ detail: true });
    made.geometry.computeBoundingBox();
    const box = made.geometry.boundingBox;
    const count = glb.pos.length / 3, I = glb.idx, T = I.length / 3;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], glb.pos[i * 3 + a]); hi[a] = Math.max(hi[a], glb.pos[i * 3 + a]); }
    // ---- Placed: one uniform scale, a move.
    const mlo = [box.min.x, box.min.y, box.min.z], mhi = [box.max.x, box.max.y, box.max.z];
    const scale = (C.fit === 'height' ? (mhi[1] - mlo[1]) / (hi[1] - lo[1]) : (mhi[0] - mlo[0]) / (hi[0] - lo[0])) * (C.scaleBy ?? 1);
    const move = [(mlo[0] + mhi[0]) / 2 - ((lo[0] + hi[0]) / 2) * scale, C.alignY === 'top' ? mhi[1] - hi[1] * scale : mlo[1] - lo[1] * scale,
      C.align === 'back' ? mlo[2] - lo[2] * scale : (mlo[2] + mhi[2]) / 2 - ((lo[2] + hi[2]) / 2) * scale];
    const pos = new Float64Array(count * 3), nor = new Float64Array(count * 3);
    for (let i = 0; i < count; i++) for (let a = 0; a < 3; a++) { pos[i * 3 + a] = glb.pos[i * 3 + a] * scale + move[a]; nor[i * 3 + a] = glb.nor[i * 3 + a]; }
    if (made.neck?.length) log.push(`made rim y: front ${made.neck[0].y.toFixed(3)} z ${made.neck[0].z.toFixed(3)}, side ${made.neck[12].y.toFixed(3)}, back ${made.neck[24].y.toFixed(3)} z ${made.neck[24].z.toFixed(3)}`);
    log.push(`made ${madeKind} box ${mlo.map((v) => v.toFixed(3))} .. ${mhi.map((v) => v.toFixed(3))}; scale ${scale.toFixed(4)}, moved ${move.map((v) => v.toFixed(4)).join(', ')}`);
    // ---- Each point's print place: the nearest made surface facing its way, on each half asked for.
    const S = tools.madeSurface(made, 0.01);
    const place = new Map();
    const placeOf = (i, h) => {
      const key = i * 3 + (h ?? 2);
      if (place.has(key)) return place.get(key);
      const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], n = [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]];
      const r = S.nearest(p, n, { turn: 0.02, reach: 0.4, ...(h == null ? {} : { only: (t) => t.back === !!h }) });
      place.set(key, r);
      return r;
    };
    let dSum = 0, dMax = 0;
    const half = new Uint8Array(count);
    for (let i = 0; i < count; i++) { const r = placeOf(i, null); half[i] = r?.back ? 1 : 0; const d = r?.d ?? 0; dSum += d; dMax = Math.max(dMax, d); }
    if (C.smooth) {
      const nb = tools.neighbours(count, I);
      let F = new Float64Array(count * 2); for (let i = 0; i < count; i++) { const r = placeOf(i, null); F[i * 2] = r?.flat[0] ?? 0; F[i * 2 + 1] = r?.flat[1] ?? 0; }
      for (let it = 0; it < C.smooth; it++) {
        const G = Float64Array.from(F);
        for (let i = 0; i < count; i++) {
          let sx = 0, sy = 0, k = 0;
          for (const j of nb[i]) { if (half[j] !== half[i] || nor[i * 3] * nor[j * 3] + nor[i * 3 + 1] * nor[j * 3 + 1] + nor[i * 3 + 2] * nor[j * 3 + 2] < 0.3) continue; sx += F[j * 2]; sy += F[j * 2 + 1]; k++; }
          if (k) { G[i * 2] = 0.5 * F[i * 2] + (0.5 * sx) / k; G[i * 2 + 1] = 0.5 * F[i * 2 + 1] + (0.5 * sy) / k; }
        }
        F = G;
      }
      for (let i = 0; i < count; i++) { const r = placeOf(i, null); if (r) place.set(i * 3 + 2, { ...r, flat: [F[i * 2], F[i * 2 + 1]] }); }
    }
    log.push(`nearest made surface: mean ${(dSum / count * 1000).toFixed(1)} mm, most ${(dMax * 1000).toFixed(1)} mm`);
    // ---- Each triangle on one half (most of its corners'); its points copied per half.
    const OP = [], ON = [], OF = [], OB = [], OS = [], idx = [], copy = new Map();
    const out = (i, h) => {
      const key = i * 2 + h;
      if (copy.has(key)) return copy.get(key);
      const r = half[i] === h ? placeOf(i, null) : placeOf(i, h);
      const k = OP.length / 3;
      copy.set(key, k);
      OP.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); ON.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]); OF.push(...(r?.flat ?? [0, 0])); OB.push(h); OS.push(Math.max(0, Math.min(1.27, r?.shade ?? 1)));
      return k;
    };
    for (let t = 0; t < T; t++) {
      const h = half[I[t * 3]] + half[I[t * 3 + 1]] + half[I[t * 3 + 2]] >= 2 ? 1 : 0;
      for (let k = 0; k < 3; k++) idx.push(out(I[t * 3 + k], h));
    }
    log.push(`${OP.length / 3} points written (${OP.length / 3 - count} copies across the halves), ${T} triangles`);
    // ---- Plain parts: each written triangle's part by the parts file's nearest triangle (placed as the model was).
    let plain = null, plainTri = null;
    const PP = settings.convert?.plainParts;
    if (PP) {
      const parts = readParts(path.resolve(here, PP.glb)), keys = [...new Set(Object.values(PP.keys))];
      const a = ((C.tilt ?? 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      const placeP = ([x, y, z]) => [x * scale + move[0], (y * ca - z * sa) * scale + move[1], (y * sa + z * ca) * scale + move[2]];
      const G = 0.01, grid = new Map(), gk = (p) => p.map((v) => Math.floor(v / G)).join(',');
      parts.forEach((p) => { const k = p.name in PP.keys ? keys.indexOf(PP.keys[p.name]) + 1 : 0; for (const c0 of p.cents) { const c = placeP(c0), kk = gk(c); (grid.get(kk) ?? grid.set(kk, []).get(kk)).push([c, k]); } });
      const nearestKey = (q) => { const b = q.map((v) => Math.floor(v / G)); let best = null, bd = Infinity; for (let r = 0; r <= 3 && !best; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) for (const [c, key] of grid.get([b[0] + i, b[1] + j, b[2] + k].join(',')) ?? []) { const d = Math.hypot(c[0] - q[0], c[1] - q[1], c[2] - q[2]); if (d < bd) { bd = d; best = key; } } return best ?? 0; };
      const tp = new Uint8Array(idx.length / 3); let nPlain = 0;
      for (let t = 0; t < tp.length; t++) { const c = [0, 1, 2].map((ax) => (OP[idx[t * 3] * 3 + ax] + OP[idx[t * 3 + 1] * 3 + ax] + OP[idx[t * 3 + 2] * 3 + ax]) / 3); tp[t] = nearestKey(c); if (tp[t]) nPlain++; }
      plainTri = tp;
      plain = { triPart: Buffer.from(tp.buffer).toString('base64'), partKeys: keys };
      log.push(`plain parts: ${nPlain} triangles (${keys.join(', ')})`);
    }
    // ---- The inside: a ray from each written point along its normal meets the hat again (far enough not to be a rib).
    let innerB64 = null;
    if (C.innerRay) {
      const NP = OP.length / 3, cell = 0.01, grid = new Map(), gk = (a, b, c) => `${a},${b},${c}`;
      const TT = idx.length / 3;
      for (let t = 0; t < TT; t++) {
        const lo3 = [0, 1, 2].map((a) => Math.floor(Math.min(OP[idx[t * 3] * 3 + a], OP[idx[t * 3 + 1] * 3 + a], OP[idx[t * 3 + 2] * 3 + a]) / cell));
        const hi3 = [0, 1, 2].map((a) => Math.floor(Math.max(OP[idx[t * 3] * 3 + a], OP[idx[t * 3 + 1] * 3 + a], OP[idx[t * 3 + 2] * 3 + a]) / cell));
        for (let i = lo3[0]; i <= hi3[0]; i++) for (let j = lo3[1]; j <= hi3[1]; j++) for (let k = lo3[2]; k <= hi3[2]; k++) { const kk = gk(i, j, k); (grid.get(kk) ?? grid.set(kk, []).get(kk)).push(t); }
      }
      const hit = (o, d, t) => {
        const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
        const e1 = [OP[b] - OP[a], OP[b + 1] - OP[a + 1], OP[b + 2] - OP[a + 2]], e2 = [OP[c] - OP[a], OP[c + 1] - OP[a + 1], OP[c + 2] - OP[a + 2]];
        const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
        if (Math.abs(det) < 1e-12) return -1;
        const inv = 1 / det, s0 = [o[0] - OP[a], o[1] - OP[a + 1], o[2] - OP[a + 2]], u = (s0[0] * p[0] + s0[1] * p[1] + s0[2] * p[2]) * inv;
        if (u < 0 || u > 1) return -1;
        const qv = [s0[1] * e1[2] - s0[2] * e1[1], s0[2] * e1[0] - s0[0] * e1[2], s0[0] * e1[1] - s0[1] * e1[0]], v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) * inv;
        if (v < 0 || u + v > 1) return -1;
        return (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv;
      };
      const minD = C.innerMin ?? 0.02, maxD = 0.4, inner = new Uint8Array(NP);
      for (let i = 0; i < NP; i++) {
        const o = [OP[i * 3], OP[i * 3 + 1], OP[i * 3 + 2]], d = [ON[i * 3], ON[i * 3 + 1], ON[i * 3 + 2]], l = Math.hypot(...d) || 1;
        for (let a = 0; a < 3; a++) d[a] /= l;
        const seen = new Set();
        let found = false;
        for (let s2 = minD; s2 <= maxD && !found; s2 += cell * 0.7) {
          const p = [o[0] + d[0] * s2, o[1] + d[1] * s2, o[2] + d[2] * s2];
          for (const t of grid.get(gk(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell))) ?? []) {
            if (seen.has(t)) continue; seen.add(t);
            if (plainTri?.[t]) continue;   // (the cord does not count)
            const h = hit(o, d, t);
            if (h <= minD) continue;
            // (only the hat's other wall seen from behind: the ray leaves the hat there, so it started inside; a rib's ridge
            // met from the outside faces the ray)
            const nx = ON[idx[t * 3] * 3] + ON[idx[t * 3 + 1] * 3] + ON[idx[t * 3 + 2] * 3], ny = ON[idx[t * 3] * 3 + 1] + ON[idx[t * 3 + 1] * 3 + 1] + ON[idx[t * 3 + 2] * 3 + 1], nz = ON[idx[t * 3] * 3 + 2] + ON[idx[t * 3 + 1] * 3 + 2] + ON[idx[t * 3 + 2] * 3 + 2];
            if (nx * d[0] + ny * d[1] + nz * d[2] > 0) { found = true; break; }
          }
        }
        inner[i] = found ? 1 : 0;
      }
      // (a plain part (the cord) keeps its own colour: never the inside's)
      if (plainTri) for (let t = 0; t < plainTri.length; t++) if (plainTri[t]) for (let k = 0; k < 3; k++) inner[idx[t * 3 + k]] = 0;
      innerB64 = Buffer.from(inner.buffer).toString('base64');
      log.push(`inside (ray along the normal meets the hat again past ${minD * 1000} mm): ${inner.reduce((a, v) => a + v, 0)} of ${NP} points`);
    }
    // (The opening's rim for the viewer (made hat's own neck list): kept as the made hat's.)
    const neck = (made.neck ?? []).map((v) => [v.x, v.y, v.z].map((q) => +q.toFixed(5)));
    return {
      data: {
        pos: Float32Array.from(OP), nor: Float32Array.from(ON), flat: Float64Array.from(OF), back: Uint8Array.from(OB), shade: Float64Array.from(OS), idx,
        extra: { scale: +scale.toFixed(6), move: move.map((v) => +v.toFixed(6)), neck, swatch: [], swatchKeys: [], swatchSpread: 0.02, ownNeck: settings.ownNeck ?? 'none', halves: true, ...(plain ?? {}), ...(innerB64 ? { inner: innerB64 } : {}) },
      },
      report: log.join('\n'),
    };
  },
};
