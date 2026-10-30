import * as THREE from 'three';

/**
 * The "High quality" jersey (2026-10-26, behind ?hq=1): a professional garment made in CLO (nine pattern pieces: the
 * front and back panels, their hem bands, the two set-in sleeves and their cuffs, the collar), about 72k triangles.
 * Its shape lives in hq-jersey.js next to index.html, loaded only when asked for (window.HQ_JERSEY: per piece,
 * positions as 16-bit numbers in the model's box, normals as 8-bit, its flat pattern position (UV, in metres) as
 * 16-bit, triangle indices; plus the body it was made on, cropped to the torso, upper arms and neck).
 *
 * It is printed with our own atlas, through the flat pattern: each HQ pattern piece is laid onto the same place of our
 * jersey's flat pattern (front on our front, back on our back, each sleeve half on our sleeve's front or back half,
 * hem bands and cuffs on our hem and cuff edges), so colours per area, patterns, crest, name and number and print
 * sheets land where they land on our jersey, and follow the HQ fabric's folds as a sublimated print does. Our jersey
 * is still made (its painter, picking, label and the 2D panels use it).
 */

/** Whether the HQ jersey is asked for (?hq=1). */
export const hqWanted = (params) => params.get('hq') === '1';

/** Loads hq-jersey.js once (a plain script, as the apps load the viewer from local files). */
let loading = null;
export function loadHQ() {
  if (window.HQ_JERSEY) return Promise.resolve(window.HQ_JERSEY);
  loading ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'hq-jersey.js';
    s.onload = () => resolve(window.HQ_JERSEY ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return loading;
}

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

/** The pieces in the model's own metres (made once). */
let decoded = null;
function pieces() {
  if (decoded) return decoded;
  const D = window.HQ_JERSEY;
  decoded = D.pieces.map((p) => {
    const q = new Int16Array(bytes(p.pos)), nn = new Int8Array(bytes(p.nor)), t = new Int16Array(bytes(p.uv));
    const pos = new Float32Array(q.length), nor = new Float32Array(q.length), uv = new Float32Array(t.length);
    for (let i = 0; i < q.length; i++) {
      const c = i % 3;
      pos[i] = D.lo[c] + ((q[i] + 32768) / 65535) * (D.hi[c] - D.lo[c]);
      nor[i] = nn[i] / 127;
    }
    for (let i = 0; i < t.length; i++) uv[i] = t[i] / 32767;
    return { name: p.name, pos, nor, uv, idx: new Uint16Array(bytes(p.idx)) };
  });
  return decoded;
}

// The CLO model on our jersey: its hem to our hem, its shoulders to ours, a touch narrower than tall.
const HQ_HEM = 0.9778, HQ_TOP = 1.6486, HQ_MIDZ = -0.0072, HQ_NECK = 1.6, HQ_NECK_TOP = 1.675;

const range = (uv, c) => {
  let lo = Infinity, hi = -Infinity;
  for (let i = c; i < uv.length; i += 2) { lo = Math.min(lo, uv[i]); hi = Math.max(hi, uv[i]); }
  return [lo, hi];
};

/** A point `f` (0..1) of the way along a polyline. */
function along(line, f) {
  const lens = [0];
  for (let i = 1; i < line.length; i++) lens.push(lens[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const want = Math.min(1, Math.max(0, f)) * lens[lens.length - 1];
  for (let i = 1; i < line.length; i++) {
    if (lens[i] >= want) {
      const t = (want - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
    }
  }
  return line[line.length - 1];
}

/**
 * Our sleeve on the flat pattern (the wearer's left, +x): its top line (shoulder fold, armhole to cuff) and its
 * underarm line (armpit to cuff), from the garment's half outline and cuff corners.
 */
function sleeveLines(spec) {
  const half = spec.half, [c1, c2] = spec.cuff;
  const i1 = half.findIndex((p) => p[0] === c1[0] && p[1] === c1[1]), i2 = half.findIndex((p) => p[0] === c2[0] && p[1] === c2[1]);
  if (i1 < 0 || i2 < 0) throw new Error('no sleeve on this cut');
  // The armhole: the outline's corners where the sleeve meets the body (the innermost x before the side seam).
  let b = i2;
  while (b < half.length - 1 && half[b + 1][1] > half[b][1] - 0.2 && half[b + 1][0] >= half[b][0] - 0.07 && half[b][0] > 0.26) b++;
  const armX = half[b][0];
  let a = i1;
  while (a > 0 && half[a][0] > armX + 1e-6) a--;
  return { top: half.slice(a, i1 + 1), under: half.slice(i2, b + 1).reverse() };
}

/**
 * The HQ jersey dressed in our jersey's print: { geometry (the printed pieces), collar (its own band, for the collar
 * rib's material), avatar (the form under it) }. `garment`: our made jersey (garment.js); `spec`: its cut.
 */
export function hqJersey(garment, spec) {
  const g = garment.geometry, gb = g.boundingBox ?? (g.computeBoundingBox(), g.boundingBox);
  const { minX, maxX, minY, span } = garment.frame;
  const sy = (gb.max.y - gb.min.y) / (HQ_TOP - HQ_HEM), sxz = sy * 0.97;
  const midZ = (gb.max.z + gb.min.z) / 2;
  const place = (x, y, z) => [x * sxz, gb.min.y + (y - HQ_HEM) * sy, midZ + (z - HQ_MIDZ) * sxz];
  // Our atlas (garment.js uvAt / uvBack): the front on its left half, the back (as seen from behind) on its right.
  const atlas = (x, y, back) => (back ? [0.5 + (0.5 * (maxX - x)) / span, (y - minY) / span] : [(0.5 * (x - minX)) / span, (y - minY) / span]);
  const P = Object.fromEntries(pieces().map((p) => [p.name, p]));
  // The pattern's scale onto ours: the front panel and its hem band from hem to shoulder = our hem to shoulder.
  const [fv0, fv1] = range(P.front.uv, 1), [hv0, hv1] = range(P.fronthem.uv, 1);
  const shoulder = Math.max(...spec.half.filter((p) => p[0] > 0.1).map((p) => p[1]));
  const k = shoulder / (fv1 - fv0 + hv1 - hv0);
  const hemH = (hv1 - hv0) * k;
  const lines = sleeveLines(spec);
  // Our pattern's top edge (neckline, then shoulder) by |x|: the HQ panels' rows above it (its round neck sits higher
  // than our V) stay just inside it, below our collar trim (9 mm either side of the neckline, more at the V's point: texture.js).
  const edge = spec.half.slice(0, spec.half.indexOf(lines.top[0]) + 1);
  const topAt = (x) => {
    for (let i = 1; i < edge.length; i++) if (edge[i][0] >= x) {
      const t = (x - edge[i - 1][0]) / (edge[i][0] - edge[i - 1][0] || 1);
      return edge[i - 1][1] + (edge[i][1] - edge[i - 1][1]) * t;
    }
    return edge[edge.length - 1][1];
  };

  /** Our flat pattern point [x, y, back] for an HQ piece's pattern point. */
  const flatOf = {};
  for (const [body, hem, back] of [['front', 'fronthem', false], ['back', 'backhem', true]]) {
    const [u0, u1] = range(P[body].uv, 0), uc = (u0 + u1) / 2, dir = back ? -1 : 1;
    const [, v1] = range(P[body].uv, 1), [w0, w1] = range(P[hem].uv, 1);
    // The pattern's v runs down the garment (its top has the smallest v).
    // Heights: down the middle, a pattern row sits at the height our jersey's print has at that height as worn (so
    // a chest print, name and number land as high as on our jersey); above our neckline, on at the pattern's scale.
    const height = heightMap(P[body], place, ourHeights(g, back, minY, span), k, v1, hemH);
    flatOf[body] = (u, v) => { const x = dir * (u - uc) * k; return [x, Math.min(height(v), topAt(Math.abs(x)) - 0.02), back]; };
    const foot = height(v1);
    flatOf[hem] = (u, v) => [dir * (u - uc) * k, ((w1 - v) / (w1 - w0)) * foot, back];
  }
  // Sleeves: the pattern's centre line (the cap's top) runs down the top of the arm; its two halves go to our sleeve's
  // front and back halves, the cap to the armhole, the cuff edge to our cuff.
  for (const side of ['L', 'R']) {
    const sleeve = P[`sleeve${side}`], cuff = P[`cuff${side}`], sg = side === 'L' ? 1 : -1;
    const n = sleeve.pos.length / 3;
    let top = 0, front = 0;
    for (let i = 1; i < n; i++) if (sleeve.pos[i * 3 + 1] > sleeve.pos[top * 3 + 1]) top = i;
    for (let i = 1; i < n; i++) if (sleeve.pos[i * 3 + 2] > sleeve.pos[front * 3 + 2]) front = i;
    const uTop = sleeve.uv[top * 2], frontSign = Math.sign(sleeve.uv[front * 2] - uTop) || 1;
    const [v0, v1] = range(sleeve.uv, 1), [u0, u1] = range(sleeve.uv, 0);
    // The armpit: where the pattern is widest (the cap's two lower corners).
    let pit = v1;
    for (let i = 0; i < n; i++) { const u = sleeve.uv[i * 2]; if (u - u0 < 0.004 || u1 - u < 0.004) pit = Math.min(pit, sleeve.uv[i * 2 + 1]); }
    // Each row's half width either side of the centre line (8 mm rows).
    const rows = new Map(), row = (v) => Math.round(v / 0.008);
    for (let i = 0; i < n; i++) {
      const u = sleeve.uv[i * 2] - uTop, r = row(sleeve.uv[i * 2 + 1]), w = rows.get(r) ?? [1e-4, 1e-4];
      if (u * frontSign > 0) w[0] = Math.max(w[0], Math.abs(u)); else w[1] = Math.max(w[1], Math.abs(u));
      rows.set(r, w);
    }
    const widthAt = (v, isFront) => {
      const w = rows.get(row(v)) ?? rows.get(row(v) - 1) ?? rows.get(row(v) + 1) ?? [0.1, 0.1];
      return w[isFront ? 0 : 1];
    };
    const onSleeve = (s, tTop, tUnder, back) => {
      const a = along(lines.top, tTop), b = along(lines.under, tUnder), f = Math.min(1, Math.abs(s));
      return [sg * (a[0] + (b[0] - a[0]) * f), a[1] + (b[1] - a[1]) * f, back];
    };
    flatOf[`sleeve${side}`] = (u, v) => {
      const isFront = (u - uTop) * frontSign > 0;
      const s = Math.abs(u - uTop) / widthAt(v, isFront);
      return onSleeve(s, (v - v0) / (v1 - v0), (v - pit) / (v1 - pit), !isFront);
    };
    // The cuff: round the arm as the sleeve's end, just inside our cuff edge (its trim colour).
    const cn = cuff.pos.length / 3;
    let ct = 0;
    for (let i = 1; i < cn; i++) if (cuff.pos[i * 3 + 1] > cuff.pos[ct * 3 + 1]) ct = i;
    const cTop = cuff.uv[ct * 2], [cu0, cu1] = range(cuff.uv, 0);
    flatOf[`cuff${side}`] = (u) => {
      const isFront = (u - cTop) * frontSign > 0;
      const s = Math.abs(u - cTop) / Math.max(1e-4, isFront === frontSign > 0 ? cu1 - cTop : cTop - cu0);
      return onSleeve(s, 0.985, 0.985, !isFront);
    };
  }

  const pos = [], nor = [], uv = [], col = [], idx = [];
  let collar = null;
  for (const piece of pieces()) {
    const n = piece.pos.length / 3;
    const placed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) placed.set(place(piece.pos[i * 3], piece.pos[i * 3 + 1], piece.pos[i * 3 + 2]), i * 3);
    // Some pieces (the folded hem bands and cuffs) come with their normals towards the wearer: turn those round, so
    // every piece's outside is printed. Outward = away from the body's axis (body pieces) or the piece's own middle
    // (sleeves, cuffs, collar: tubes and rings).
    const mid = [0, 0, 0];
    for (let i = 0; i < n * 3; i++) mid[i % 3] += placed[i] / n;
    const round = !/^(front|back)/.test(piece.name);
    let out = 0;
    for (let i = 0; i < n; i++) {
      const dx = placed[i * 3] - (round ? mid[0] : 0), dz = placed[i * 3 + 2] - (round ? mid[2] : midZ), dy = round ? placed[i * 3 + 1] - mid[1] : 0;
      out += Math.sign(piece.nor[i * 3] * dx + piece.nor[i * 3 + 1] * dy + piece.nor[i * 3 + 2] * dz);
    }
    const turn = out < 0 ? -1 : 1;
    const normalOf = (i) => new THREE.Vector3(turn * piece.nor[i * 3] / sxz, turn * piece.nor[i * 3 + 1] / sy, turn * piece.nor[i * 3 + 2] / sxz).normalize();
    if (piece.name === 'collar') {
      collar = collarBand(piece, placed, normalOf);
      continue;
    }
    const flat = flatOf[piece.name], base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      pos.push(placed[i * 3], placed[i * 3 + 1], placed[i * 3 + 2]);
      const nv = normalOf(i);
      nor.push(nv.x, nv.y, nv.z);
      const [x, y, back] = flat(piece.uv[i * 2], piece.uv[i * 2 + 1]);
      uv.push(...atlas(x, y, back));
      col.push(1, 1, 1);
    }
    // A sleeve's triangles across its top or underarm line take both halves' print positions: give such a triangle
    // its own corners on the side most of it is on (no smear across the atlas).
    const sides = piece.name.startsWith('sleeve') || piece.name.startsWith('cuff');
    for (let t = 0; t < piece.idx.length; t += 3) {
      const tri = [piece.idx[t], piece.idx[t + 1], piece.idx[t + 2]].map((v) => v + base);
      if (sides) {
        const us = tri.map((v) => uv[v * 2]);
        if (Math.max(...us) - Math.min(...us) > 0.25) {
          const backs = us.filter((u) => u >= 0.5).length >= 2;
          for (let c = 0; c < 3; c++) {
            if ((us[c] >= 0.5) === backs) continue;
            const v = tri[c] - base, at = pos.length / 3;
            pos.push(pos[tri[c] * 3], pos[tri[c] * 3 + 1], pos[tri[c] * 3 + 2]);
            nor.push(nor[tri[c] * 3], nor[tri[c] * 3 + 1], nor[tri[c] * 3 + 2]);
            const [x, y] = flat(piece.uv[v * 2], piece.uv[v * 2 + 1]);
            uv.push(...atlas(x, y, backs));
            col.push(1, 1, 1);
            tri[c] = at;
          }
        }
      }
      idx.push(...tri);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  orient(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, collar, avatar: avatar(place) };
}

/**
 * Our made jersey down its middle (|x| < 2 cm), front or back: its print height (flat y) at each worn height, in 5 mm
 * steps of worn height (averaged over the folds).
 */
function ourHeights(g, back, minY, span) {
  const P = g.attributes.position.array, UV = g.attributes.uv.array, bins = new Map();
  for (let i = 0; i < P.length / 3; i++) {
    if (Math.abs(P[i * 3]) > 0.02 || (UV[i * 2] >= 0.5) !== back) continue;
    const b = Math.round(P[i * 3 + 1] / 0.005), e = bins.get(b) ?? [0, 0];
    e[0] += minY + UV[i * 2 + 1] * span; e[1]++;
    bins.set(b, e);
  }
  return [...bins].sort((a, b) => a[0] - b[0]).map(([b, [sum, count]]) => [b * 0.005, sum / count]);
}

/**
 * An HQ body panel's pattern row (v) -> our flat height: the panel's middle column as placed gives each row's worn
 * height, and our jersey's print height at that worn height (`ours`) is the row's; past our jersey's top (its neckline)
 * the rows go on at the pattern's scale `k`. Below our hem band's top, rows are spaced evenly down to `hemH`.
 */
function heightMap(piece, place, ours, k, v1, hemH) {
  const n = piece.pos.length / 3, rows = new Map();
  for (let i = 0; i < n; i++) {
    if (Math.abs(piece.pos[i * 3]) > 0.02) continue;
    const r = Math.round(piece.uv[i * 2 + 1] / 0.005), e = rows.get(r) ?? [0, 0];
    e[0] += place(0, piece.pos[i * 3 + 1], 0)[1]; e[1]++;
    rows.set(r, e);
  }
  const worn = [...rows].sort((a, b) => a[0] - b[0]).map(([r, [sum, count]]) => [r * 0.005, sum / count]);
  const lerp = (table, x) => {
    if (x <= table[0][0]) return table[0][1] + (x - table[0][0]) * ((table[1][1] - table[0][1]) / (table[1][0] - table[0][0] || 1));
    for (let i = 1; i < table.length; i++) if (table[i][0] >= x) {
      const t = (x - table[i - 1][0]) / (table[i][0] - table[i - 1][0] || 1);
      return table[i - 1][1] + (table[i][1] - table[i - 1][1]) * t;
    }
    return null;
  };
  // The rows where both are known (our jersey's middle, below its neckline), fitted with one straight line, so the
  // print's lines stay straight (both garments' folds averaged out).
  const top = ours[ours.length - 1][0], pts = [];
  for (const [v, y] of worn) if (y < top - 0.02 && y > ours[0][0] + 0.03) { const f = lerp(ours, y); if (f != null) pts.push([v, f]); }
  if (pts.length < 8) return (v) => hemH + (v1 - v) * k;
  const mv = pts.reduce((s, p) => s + p[0], 0) / pts.length, mf = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const slope = pts.reduce((s, p) => s + (p[0] - mv) * (p[1] - mf), 0) / pts.reduce((s, p) => s + (p[0] - mv) ** 2, 0);
  return (v) => mf + (v - mv) * slope;
}

/** Makes every triangle wind counter-clockwise as seen from the side its vertex normals point to. */
function orient(geometry) {
  const P = geometry.attributes.position.array, N = geometry.attributes.normal.array, I = geometry.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < I.length; t += 3) {
    a.fromArray(P, I[t] * 3); b.fromArray(P, I[t + 1] * 3); c.fromArray(P, I[t + 2] * 3);
    const face = b.sub(a).cross(c.sub(a));
    n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) n.x += N[I[t + k] * 3], n.y += N[I[t + k] * 3 + 1], n.z += N[I[t + k] * 3 + 2];
    if (face.dot(n) < 0) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s; }
  }
}

/** The collar piece as a band for the collar rib's material: u round the neck (0..1), v across the band. */
function collarBand(piece, placed, normalOf) {
  const n = placed.length / 3;
  let cx = 0, cz = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { cx += placed[i * 3] / n; cz += placed[i * 3 + 2] / n; lo = Math.min(lo, placed[i * 3 + 1]); hi = Math.max(hi, placed[i * 3 + 1]); }
  const uv = new Float32Array(n * 2), nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = (Math.atan2(placed[i * 3] - cx, placed[i * 3 + 2] - cz) / (2 * Math.PI)) + 0.5;
    uv[i * 2 + 1] = (placed[i * 3 + 1] - lo) / (hi - lo || 1);
    normalOf(i).toArray(nor, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(placed, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.Uint16BufferAttribute(piece.idx, 1));
  orient(geometry);
  return geometry;
}

/**
 * The body the HQ jersey was made on (CLO's avatar: its torso, upper arms and neck), placed like the jersey, for the
 * dark display form under it in the new look (the mannequin's finish, mannequin.js: dark inside the garment).
 */
function avatar(place) {
  const A = window.HQ_JERSEY.avatar;
  if (!A) return null;
  const q = new Int16Array(bytes(A.pos)), n = q.length / 3;
  const pos = new Float32Array(q.length), occ = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = [0, 1, 2].map((c) => A.lo[c] + ((q[i * 3 + c] + 32768) / 65535) * (A.hi[c] - A.lo[c]));
    // The neck cut just inside the collar (its top a flat lid), so no dark neck shows above it.
    v[1] = Math.min(v[1], HQ_NECK - 0.012);
    pos.set(place(v[0], v[1], v[2]), i * 3);
    // In the open above the collar (the neck), in the jersey's shade below it.
    occ[i] = v[1] > HQ_NECK ? 0.9 : v[1] > HQ_NECK - 0.03 ? 0.55 : 0.3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('occlusion', new THREE.BufferAttribute(occ, 1));
  g.setIndex(new THREE.Uint16BufferAttribute(new Uint16Array(bytes(A.idx)), 1));
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}
