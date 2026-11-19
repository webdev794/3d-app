import * as THREE from 'three';

// Collar styles laid ON a ready-made model (RUGBYJ 2026-11-19, the client's picture 611: "these are the collars that should be on
// mock ups and available to choose from"): the Rugby League jersey's model (rugby-jersey) keeps its own stand-up collar for
// Warrior; every other style hides the model's own collar (main.js: its pieces not drawn, nothing cut or moved) and lays our
// own pieces along the collar's foot line (the data's `neckRing`, viewer/tripo-glbparts.mjs): a band lying on the body, a
// standing band, a fold-down polo collar with its placket, or a V (the cloth inside it not drawn, main.js) with its band.
// Every piece is one plain colour (the collar's: the trim colour), with thin stitch lines along its edges.

/** The styles (ids as stored in design.neck) and their names, in the client's order. Warrior is the model's own collar. */
export const MODEL_COLLARS = [
  ['grandfather', 'Grandfather'], ['crew', 'Crew'], ['mandarin', 'Mandarin'], ['keyhole', 'Keyhole'],
  ['viking', 'Viking'], ['warrior', 'Warrior'], ['traditional', 'Traditional'], ['perth', 'Perth'],
];
const IDS = new Set(MODEL_COLLARS.map(([id]) => id));
/** The model collar style a design asks for (null: the model's own collar). */
export const modelCollarOf = (design) => { const id = String(design?.neck ?? '').toLowerCase(); return IDS.has(id) && id !== 'warrior' ? id : null; };

// Per style: `band` a band lying on the body (width m, wider at the back by `back`), `stand` a standing band (height), `fold`
// a fold-down collar (its flap's length; `points` longer at the front), `gap` an opening at the front (m each side), `placket`
// { length, width, buttons }, `v` a V cut ({ depth below the ring's front, half: its half-width at the ring, band: its width }).
const STYLES = {
  grandfather: { stand: 0.022, gap: 0.006, placket: { length: 0.07, width: 0.026, buttons: 0 } },
  crew: { band: 0.016 },
  mandarin: { stand: 0.016 },
  keyhole: { band: 0.014, v: { depth: 0.085, half: 0.012, band: 0.011 } },
  viking: { band: 0.026, back: 0.008 },
  traditional: { stand: 0.012, fold: 0.042, points: 0.035, gap: 0.014, placket: { length: 0.11, width: 0.03, buttons: 2 } },
  perth: { band: 0.028, v: { depth: 0.09, half: 0.06, band: 0.028 } },
};
/** The V a style cuts in the model's front (for main.js: the cloth inside it is not drawn): { apexY, apexZ, topY, half } or null. */
export function modelCollarV(data, style) {
  const s = STYLES[style]; if (!s?.v || !data?.neckRing) return null;
  const R = ring(data), f = R.P[R.front];
  // (its top corners on the ring itself, where the ring is `half` out from the middle in front: the V's sides run from there
  // straight down to its point, `depth` below the ring's front)
  const at = (sg) => R.P.filter((p) => p.z > R.C.z && Math.sign(p.x) === sg).reduce((b, p) => (Math.abs(Math.abs(p.x) - s.v.half) < Math.abs(Math.abs(b.x) - s.v.half) ? p : b));
  const yTop = (at(1).y + at(-1).y) / 2, apexY = f.y - s.v.depth;
  return { apexY, yTop, topY: yTop + 0.03, half: s.v.half, slope: s.v.half / (yTop - apexY), frontY: f.y, zc: R.C.z, depth: yTop - apexY };
}

function ring(data) {
  const c = data.neckRing.c, nn = data.neckRing.n, n = c.length / 3, P = [], N = [];
  for (let i = 0; i < n; i++) { P.push(new THREE.Vector3(c[i * 3], c[i * 3 + 1], c[i * 3 + 2])); N.push(new THREE.Vector3(nn[i * 3], nn[i * 3 + 1], nn[i * 3 + 2]).normalize()); }
  let front = 0; P.forEach((p, i) => { if (p.z > P[front].z) front = i; });
  // (a centre for the ring: its points' middle; each point's way out from it, level)
  const C = P.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / n);
  const T = P.map((p, i) => P[(i + 1) % n].clone().sub(P[(i - 1 + n) % n]).normalize());
  const OUT = P.map((p) => new THREE.Vector3(p.x - C.x, 0, p.z - C.z).normalize());
  return { P, N, T, OUT, C, n, front };
}

/** The model's cloth for laying pieces on it: nearest cloth within reach, its place and normal (averaged over 1.2 cm). */
function clothOf(geometry) {
  const pos = geometry.getAttribute('position').array, nor = geometry.getAttribute('normal').array, G = 0.012, grid = new Map();
  for (let i = 0; i < pos.length / 3; i++) { const k = `${Math.floor(pos[i * 3] / G)},${Math.floor(pos[i * 3 + 1] / G)},${Math.floor(pos[i * 3 + 2] / G)}`; (grid.get(k) ?? grid.set(k, []).get(k)).push(i); }
  return (q, facing) => {
    const at = new THREE.Vector3(), nm = new THREE.Vector3(); let w = 0;
    const [cx, cy, cz] = [q.x, q.y, q.z].map((v) => Math.floor(v / G));
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) for (const i of grid.get(`${cx + a},${cy + b},${cz + c}`) ?? []) {
      const nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2];
      if (facing && nx * facing.x + ny * facing.y + nz * facing.z < 0.2) continue;   // (the outside face only)
      const d = Math.hypot(pos[i * 3] - q.x, pos[i * 3 + 1] - q.y, pos[i * 3 + 2] - q.z); if (d > 2 * G) continue;
      const k = 1 - d / (2 * G); at.x += pos[i * 3] * k; at.y += pos[i * 3 + 1] * k; at.z += pos[i * 3 + 2] * k; nm.x += nx * k; nm.y += ny * k; nm.z += nz * k; w += k;
    }
    if (!w) return null;
    at.multiplyScalar(1 / w); nm.normalize();
    // (onto the cloth's plane there)
    const p = q.clone().sub(nm.clone().multiplyScalar(q.clone().sub(at).dot(nm)));
    return { p, n: nm };
  };
}

/** The model's front cloth at (x, y): its foremost point there and its normal (front-facing cloth within 6 mm across). */
function frontOf(geometry) {
  const pos = geometry.getAttribute('position').array, nor = geometry.getAttribute('normal').array, G = 0.006, grid = new Map();
  for (let i = 0; i < pos.length / 3; i++) { if (nor[i * 3 + 2] < 0.2) continue; const k = `${Math.floor(pos[i * 3] / G)},${Math.floor(pos[i * 3 + 1] / G)}`; (grid.get(k) ?? grid.set(k, []).get(k)).push(i); }
  return (x, y) => {
    const cx = Math.floor(x / G), cy = Math.floor(y / G); let best = null, w = 0; const at = new THREE.Vector3(), nm = new THREE.Vector3();
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of grid.get(`${cx + a},${cy + b}`) ?? []) if (!best || pos[i * 3 + 2] > best) best = pos[i * 3 + 2];
    if (best == null) return null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of grid.get(`${cx + a},${cy + b}`) ?? []) {
      if (pos[i * 3 + 2] < best - 0.01) continue; const d = Math.hypot(pos[i * 3] - x, pos[i * 3 + 1] - y), k = Math.max(0, 1 - d / (2 * G)); if (!k) continue;
      at.x += pos[i * 3] * k; at.y += pos[i * 3 + 1] * k; at.z += pos[i * 3 + 2] * k; nm.x += nor[i * 3] * k; nm.y += nor[i * 3 + 1] * k; nm.z += nor[i * 3 + 2] * k; w += k;
    }
    if (!w) return null; at.multiplyScalar(1 / w); nm.normalize();
    const p = new THREE.Vector3(x, y, at.z + ((at.x - x) * nm.x + (at.y - y) * nm.y) / (nm.z || 1));
    return { p, n: nm };
  };
}
/** Ring indices with a gap: rotated so the gap is at the ends (a strip never joins across it). */
function openOrder(ids) { const k = ids.findIndex((i, j) => j > 0 && i !== ids[j - 1] + 1); return k > 0 ? [...ids.slice(k), ...ids.slice(0, k)] : ids; }

/** A strip of quads through rows of points (rows[i][j]: along the collar i, across it j), closed round when `closed`. */
function sheet(rows, closed) {
  const P = [], I = [], m = rows[0].length, n = rows.length;
  for (const r of rows) for (const p of r) P.push(p.x, p.y, p.z);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = ((i + 1) % n) * m + j; I.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}
/** Thin dark lines along given point runs, laid just off the piece (stitching). */
function stitchLines(runs, width = 0.0014) {
  const P = [], I = [];
  for (const { pts, nrm, closed } of runs) {
    const n = pts.length, base = P.length / 3;
    for (let i = 0; i < n; i++) {
      const t = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)].clone().sub(pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]);
      const s = new THREE.Vector3().crossVectors(t, nrm[i]).normalize().multiplyScalar(width / 2), c = pts[i].clone().addScaledVector(nrm[i], 0.0009);
      P.push(c.x + s.x, c.y + s.y, c.z + s.z, c.x - s.x, c.y - s.y, c.z - s.z);
    }
    for (let i = 0; i < (closed ? n : n - 1); i++) { const a = base + i * 2, b = base + ((i + 1) % n) * 2; I.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
  const N = new Float32Array(P.length); for (let i = 1; i < N.length; i += 3) N[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  mesh.raycast = () => {}; mesh.renderOrder = 2; return mesh;
}

/**
 * The collar style's pieces on the model: a group (its meshes in `material`, the collar's colour) and the neck points for the
 * label (the back of the collar's top). `geometry`: the model's printed shape (main.js), `data` its data (neckRing).
 */
export function buildModelCollar(style, data, geometry, material) {
  const s = STYLES[style]; if (!s || !data?.neckRing) return null;
  const R = ring(data), cloth = clothOf(geometry), frontAt = frontOf(geometry), group = new THREE.Group(), runs = [];
  const { P, N, T, OUT, n, front } = R;
  const lift = 0.0012, up = new THREE.Vector3(0, 1, 0);
  // (how far round from the front: -1..1 front, the back is |a| near 1)
  const frontness = (i) => P[i].z > R.C.z ? (P[i].z - R.C.z) / (P[front].z - R.C.z) : 0;
  const V = s.v ? modelCollarV(data, style) : null;
  const inV = (p) => V && p.z > R.C.z && Math.abs(p.x) < V.half + 0.002 && p.y > V.apexY - 0.002;
  const gapOK = (i) => !s.gap || !(P[i].z > R.C.z && Math.abs(P[i].x) < s.gap);
  // ---- a band lying on the body, from the ring down and out over the cloth
  const laid = (start, dir0, width, steps, facing) => {
    const row = [], nrm = [];
    let q = start.clone(), d = dir0.clone();
    for (let j = 0; j <= steps; j++) {
      const hit = cloth(q, facing);
      const p = hit ? hit.p.clone().addScaledVector(hit.n, lift) : q.clone();
      row.push(p); nrm.push(hit ? hit.n : facing);
      // (on along the cloth: the direction kept square to the cloth's normal)
      if (hit) d = d.clone().sub(hit.n.clone().multiplyScalar(d.dot(hit.n))).normalize();
      q = (hit ? hit.p : q).clone().addScaledVector(d, width / steps);
    }
    return { row, nrm };
  };
  if (s.band) {
    const rows = [], inner = [], outer = [], innerN = [], outerN = [], idx = [];
    const keep = []; for (let i = 0; i < n; i++) if (!inV(P[i]) && gapOK(i)) keep.push(i);
    for (const i of openOrder(keep)) {
      const w = s.band + (s.back ?? 0) * (1 - Math.max(0, frontness(i)));
      const down = OUT[i].clone().multiplyScalar(0.55).add(up.clone().multiplyScalar(-1)).normalize();
      // (a roll over the opening's edge: a few mm inside, then out over the cloth)
      const rim = P[i].clone().addScaledVector(N[i], -0.002).addScaledVector(up, 0.001);
      const { row, nrm } = laid(P[i].clone().addScaledVector(up, -0.0005), down, w, 6, N[i]);
      rows.push([rim, ...row]); idx.push(i);
      inner.push(row[0]); innerN.push(nrm[0]); outer.push(row.at(-1)); outerN.push(nrm.at(-1));
    }
    const closed = idx.length === n && keep.length === n;
    if (rows.length > 3) { group.add(new THREE.Mesh(sheet(rows, closed), material)); runs.push({ pts: outer.map((p, k) => p.clone().addScaledVector(outerN[k], 0.0003).sub(outer[k].clone().sub(inner[k]).normalize().multiplyScalar(0.003))), nrm: outerN, closed }); }
  }
  // ---- a standing band (and a fold-down collar over it)
  if (s.stand) {
    const rows = [], tops = [], topN = [];
    const ids = []; for (let i = 0; i < n; i++) if (gapOK(i)) ids.push(i);
    // (an open collar starts and ends at its front gap: walk from one side of the gap round the back to the other)
    const order = openOrder(ids);
    for (const i of order) {
      const lean = up.clone().addScaledVector(OUT[i], -0.12).normalize();
      const base = P[i].clone().addScaledVector(N[i], 0.0008).addScaledVector(up, -0.003), h = s.stand;
      const row = []; for (let j = 0; j <= 4; j++) row.push(base.clone().addScaledVector(lean, (h * j) / 4).addScaledVector(OUT[i], 0.0015));
      if (s.fold) {
        // (the fold-down flap: over the stand's top and out and down over the shoulders, its points longer at the front)
        const top = row.at(-1), L = s.fold + (s.points ?? 0) * Math.max(0, frontness(i)) ** 3;
        // (over the stand's top, then down over the cloth below the ring, a little off it: the flap lies on the shoulders)
        row.push(top.clone().addScaledVector(OUT[i], 0.004).addScaledVector(up, 0.001));
        const down = OUT[i].clone().multiplyScalar(0.55).add(up.clone().multiplyScalar(-1)).normalize();
        const flap = laid(P[i].clone().addScaledVector(up, -0.001), down, L, 6, N[i]);
        // (near the front gap the flap's front edge slants out and down to its point: rows within `pointRows` of the gap
        // pushed sideways away from it, more at the flap's free edge)
        const kEnd = Math.min(order.indexOf(i), order.length - 1 - order.indexOf(i)), K = 24, away = T[i].clone().multiplyScalar(order.indexOf(i) < order.length / 2 ? 1 : -1);
        flap.row.forEach((p, j) => { if (!j) return; const t = j / 6, q = p.clone().addScaledVector(flap.nrm[j], 0.003 + 0.004 * t); if (kEnd < K) q.addScaledVector(away, L * t * 0.75 * (1 - kEnd / K) ** 2); row.push(q); });
      }
      rows.push(row); tops.push(row.at(-1)); topN.push(OUT[i]);
    }
    if (rows.length > 3) { group.add(new THREE.Mesh(sheet(rows, !s.gap), material)); runs.push({ pts: tops.map((p, k) => p.clone().addScaledVector(rows[k].at(-2).clone().sub(p).normalize(), 0.003)), nrm: topN, closed: !s.gap }); }
    // (the stand's inside: the model's cloth below the ring shows through no gap: a short inner face)
  }
  // ---- the V: a band along each side of the V, mitred at its point (each side's band clipped at the middle line, so the
  // two meet in one straight seam), laid on the front cloth
  if (V) {
    for (const sg of [-1, 1]) {
      const len = Math.hypot(V.half, V.depth), o = [sg * V.depth / len, -V.half / len], w = s.v.band;
      const tEnd = 1 + (V.depth * w) / (len * V.half), rows = [], edge = [], edgeN = [], inner = [], innerN = [];
      for (let j = 0; j <= 40; j++) {
        const t = (tEnd * j) / 40, ex = sg * V.half * (1 - t), ey = V.yTop - (V.yTop - V.apexY) * t;
        let ix = ex, iy = ey; const ox = ex + o[0] * w, oy = ey + o[1] * w;
        // (past the middle: the inner end moved along the row onto the middle line)
        if (sg * ix < 0) { const f2 = ix / (ix - ox); ix = 0; iy = iy + (oy - iy) * f2; }
        if (sg * ox < 0) continue;
        const r = [];
        for (let k = 0; k <= 4; k++) { const x = ix + ((ox - ix) * k) / 4, y = iy + ((oy - iy) * k) / 4, h = frontAt(x, y); if (!h) break; r.push(h.p.clone().addScaledVector(h.n, lift)); if (k === 0) { inner.push(r[0]); innerN.push(h.n); } if (k === 4) { edge.push(r[4]); edgeN.push(h.n); } }
        if (r.length !== 5) continue;
        // (over the cut edge: a short lip turned in under the V's edge)
        if (sg * ex >= 0) r.unshift(r[0].clone().addScaledVector(new THREE.Vector3(-o[0], -o[1], 0), 0.002).addScaledVector(new THREE.Vector3(0, 0, 1), -0.004));
        else r.unshift(r[0].clone());
        rows.push(r);
      }
      if (rows.length > 3) { group.add(new THREE.Mesh(sheet(rows, false), material)); runs.push({ pts: edge.map((p, k) => p.clone().addScaledVector(new THREE.Vector3(-o[0], -o[1], 0), 0.003)), nrm: edgeN, closed: false }); }
    }
  }
  // ---- the facing: a band of the collar's colour inside the opening, all round, so the edge where the model's own collar is
  // not drawn never shows from inside or from above
  {
    const keep = []; for (let i = 0; i < n; i++) if (!inV(P[i]) && (s.band || s.stand ? true : gapOK(i))) keep.push(i);
    const rows = [];
    for (const i of openOrder(keep)) {
      const r = [];
      for (const [dn, du] of [[0.0012, 0.0008], [-0.001, 0.002], [-0.005, -0.002], [-0.007, -0.012], [-0.008, -0.026]]) r.push(P[i].clone().addScaledVector(N[i], dn).addScaledVector(up, du));
      rows.push(r);
    }
    if (rows.length > 3) group.add(new THREE.Mesh(sheet(rows, keep.length === n), material));
  }
  // ---- a placket down the front: a strip lying on the cloth, its buttons
  if (s.placket) {
    const f = P[front], pk = s.placket, rows = [], cen = [], cenN = [];
    for (let j = 0; j <= 20; j++) {
      const y = f.y - (pk.length * j) / 20, row = [];
      for (let k = 0; k <= 2; k++) { const x = -pk.width / 2 + (pk.width * k) / 2, hit = frontAt(x, y); row.push(hit ? hit.p.clone().addScaledVector(hit.n, lift * 1.4) : new THREE.Vector3(x, y, f.z)); if (k === 1) { cen.push(row.at(-1)); cenN.push(hit?.n ?? new THREE.Vector3(0, 0, 1)); } }
      rows.push(row);
    }
    group.add(new THREE.Mesh(sheet(rows, false), material));
    runs.push({ pts: cen, nrm: cenN, closed: false });
    for (let b = 0; b < pk.buttons; b++) {
      const k = Math.round(((b + 1) * 20) / (pk.buttons + 1)), c = cen[k], btn = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.0025, 20), new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.35 }));
      btn.position.copy(c.clone().addScaledVector(cenN[k], 0.0015)); btn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cenN[k]); btn.raycast = () => {}; group.add(btn);
    }
  }
  if (runs.length) group.add(stitchLines(runs));
  group.traverse((o) => { if (o.isMesh && o.material === material) { o.castShadow = true; o.receiveShadow = true; } });
  // (the neck label hangs from the back of the collar's top: a standing collar's top, else the ring)
  const lift2 = s.stand && !s.fold ? s.stand - 0.004 : s.fold ? s.stand - 0.004 : -0.002;
  const neck = P.map((p) => new THREE.Vector3(p.x, p.y + lift2, p.z));
  return { group, neck };
}
