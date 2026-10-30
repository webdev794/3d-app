import * as THREE from 'three';
import { KANGAROO, HOOD_TOP, kangarooEdge } from './zones.js';

// Hoodies (garment.js SPECS.hoodie / ziphoodie): the lined hood lying down behind the neck, its drawstring, the
// kangaroo pocket (split either side of the zip on the zip hoodie), the rib cuffs and waistband and the front zip.
// All in garment metres on the made garment (its creases), y up, front +z.

const ramp = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * The made front (or back) panel at a panel point: position, normal and baked shade, from the panel's own triangle it
 * falls in (the nearest one, extrapolated, outside the panel). Triangles are bucketed for speed.
 */
export function panelSampler({ points, faces, positions, normals, colours, n }, back = false) {
  const off = back ? n : 0, cell = 0.03, buckets = new Map();
  const key = (i, j) => `${i},${j}`;
  faces.forEach((f) => {
    const xs = f.map((i) => points[i].x), ys = f.map((i) => points[i].y);
    for (let i = Math.floor(Math.min(...xs) / cell); i <= Math.floor(Math.max(...xs) / cell); i++) {
      for (let j = Math.floor(Math.min(...ys) / cell); j <= Math.floor(Math.max(...ys) / cell); j++) {
        const k = key(i, j);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(f);
      }
    }
  });
  return (x, y) => {
    let best = null;
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
    for (let r = 0; r <= 3 && !(best && best.worst >= 0); r++) {
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        for (const [a, b, c] of buckets.get(key(i, j)) ?? []) {
          const A = points[a], B = points[b], C = points[c];
          const d = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y);
          const wa = ((B.y - C.y) * (x - C.x) + (C.x - B.x) * (y - C.y)) / d, wb = ((C.y - A.y) * (x - C.x) + (A.x - C.x) * (y - C.y)) / d;
          const worst = Math.min(wa, wb, 1 - wa - wb);
          if (!best || worst > best.worst) best = { worst, w: [[a, wa], [b, wb], [c, 1 - wa - wb]] };
        }
      }
    }
    const p = new THREE.Vector3(), nrm = new THREE.Vector3();
    let shade = 0;
    for (const [i0, w] of best.w) {
      const i = i0 + off;
      p.x += positions[i * 3] * w; p.y += positions[i * 3 + 1] * w; p.z += positions[i * 3 + 2] * w;
      nrm.x += normals[i * 3] * w; nrm.y += normals[i * 3 + 1] * w; nrm.z += normals[i * 3 + 2] * w;
      shade += colours[i * 3] * w;
    }
    return { p, n: nrm.normalize(), shade, inside: best.worst >= -1e-6 };
  };
}

const geometryOf = ({ pos, uv, col, idx }) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col) geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
};

/** A grid of rows x cols vertices (row-major) as triangles, wound so the first quad's normal points along `out`. */
function gridIndex(pos, rows, cols, base, out) {
  const P = (k) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const r = Math.floor(rows / 2), c = Math.floor(cols / 2), a = base + r * cols + c;
  const flip = out && P(a + 1).sub(P(a)).cross(P(a + cols).sub(P(a))).dot(out) < 0;
  const idx = [];
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const a0 = base + j * cols + i, b0 = a0 + 1, c0 = a0 + cols, d0 = c0 + 1;
    if (flip) idx.push(a0, c0, b0, b0, c0, d0); else idx.push(a0, b0, c0, b0, d0, c0);
  }
  return idx;
}

/**
 * The hood, lying down behind the neck as a hoodie's does when it is not worn up: from the neck seam it stands up
 * round the neck (low at the front, where its face edges cross over, or end at the zip), rolls outwards over its face
 * edge and, at the back, falls down over the shoulders and upper back as a soft pouch with its crown tucked under.
 * One sheet: the outer fabric outside (printed from the atlas's hood piece: zones.js HOOD_TOP), the lining inside
 * (its own colour, a separate back-face material). Returns its geometry, the face edge (for the drawstring channel),
 * the eyelets and the hood piece's outline on the atlas (back side, garment metres).
 */
/**
 * `standing` (the pull-over; FN5 2026-10-30, the client's hoodie picture): instead of lying down, the hood stands open
 * behind the neck as on a display form: low round the front where its face edges cross, its sides flaring out and up
 * from the neck, its back rising highest and leaning back so its cyan lining shows from the front, the crown rolling
 * forward over the top so the outer fabric shows above the opening. One sheet, the lining inside all the way.
 */
export function buildHood(ctx, { zip = false, standing = false } = {}) {
  const { poly, seam, positions, n, maxY, neck, surface, uvBack } = ctx;
  // The neck seam: the neck opening's points, front (-x to +x) then back (+x to -x), each with its panel point.
  const neckIdx = poly.map((_, i) => i).filter((i) => !seam[i] && poly[i].y > maxY - neck.drop && Math.abs(poly[i].x) < neck.half);
  const vtx = (j) => new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
  const front = neckIdx.slice().sort((a, b) => poly[a].x - poly[b].x).map((i) => ({ p: vtx(i), x: poly[i].x, y: poly[i].y, back: false }));
  const backRun = neckIdx.slice().sort((a, b) => poly[b].x - poly[a].x).map((i) => ({ p: vtx(n + i), x: poly[i].x, y: poly[i].y, back: true }));
  let loop = [...front, ...backRun];
  // Three times as many points, along straight lines between them.
  loop = loop.flatMap((a, k) => {
    const b = loop[(k + 1) % loop.length];
    return [0, 1 / 3, 2 / 3].map((t) => ({ p: a.p.clone().lerp(b.p, t), x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, back: t < 0.5 ? a.back : b.back }));
  });
  // Start at the front's middle and run round by the wearer's left (+x), the back, and back to the front.
  const centre = loop.reduce((best, q, k) => (!q.back && Math.abs(q.x) < Math.abs(loop[best].x) ? k : best), 0);
  const ring = [...loop.slice(centre), ...loop.slice(0, centre)];
  // A pull-over's face edges cross at the front (each runs 2.5 cm past the middle, the left one over); a zip hoodie's
  // end either side of the zip.
  const lap = 0.025, gap = KANGAROO.zipGap - 0.001;
  const lastFront = (list) => list.filter((q) => !q.back);
  let strip;
  if (zip) {
    strip = [...ring.filter((q, k) => k < ring.length / 2 ? !(!q.back && q.x < gap) : !(!q.back && q.x > -gap))];
  } else {
    const before = ring.filter((q) => !q.back && q.x < 0 && q.x > -lap).sort((a, b) => a.x - b.x);
    const after = lastFront(ring).filter((q) => q.x > 0 && q.x < lap).sort((a, b) => a.x - b.x);
    strip = [...before, ...ring, ...after.map((q) => ({ ...q }))];
  }
  // Arc length along the seam, the back's middle and how far round from the front each column is (0 front, 1 back).
  const arc = [0];
  for (let k = 1; k < strip.length; k++) arc.push(arc[k - 1] + strip[k].p.distanceTo(strip[k - 1].p));
  const mid = strip.reduce((best, q, k) => (q.back && Math.abs(q.x) < Math.abs(strip[best].x) ? k : best), strip.findIndex((q) => q.back));
  const half = Math.max(arc[mid], arc.at(-1) - arc[mid]);
  const C = strip.reduce((s, q) => s.add(q.p), new THREE.Vector3()).divideScalar(strip.length);
  const up = new THREE.Vector3(0, 1, 0);
  const ROWS = 46, cols = strip.length;
  const pos = [], uv = [], col = [];
  const lengths = [], edge = [], eyelets = [];
  for (let c = 0; c < cols; c++) {
    const q = strip[c], S = q.p;
    const hx = arc[mid] - arc[c];                     // + on the wearer's left, 0 at the back's middle
    const g = THREE.MathUtils.clamp(1 - Math.abs(hx) / half, 0, 1);
    const O = new THREE.Vector3(S.x, 0, S.z - C.z).normalize(), side = new THREE.Vector3().crossVectors(up, O);
    // Overlapping ends: the one on top stands a little further out.
    const over = !zip && c < strip.length / 2 && !q.back && q.x < 0.001 ? 0.0045 * ramp(0.001, -0.012, q.x) : 0;
    const hs = 0.022 + 0.035 * ramp(0, 0.38, g) - 0.022 * ramp(0.55, 1, g);
    const lean = 0.15 + 0.6 * ramp(0.35, 1, g);
    const rr = 0.008 + 0.013 * ramp(0.2, 0.7, g);
    const turn = THREE.MathUtils.lerp(1.1, Math.PI, ramp(0.12, 0.55, g));
    // Only the back falls (down over the shoulders and the back); the front stands round the neck.
    const fall = q.back ? 0.24 * ramp(0.45, 0.9, g) ** 0.6 : 0;
    const tuck = 0.014 * ramp(0.45, 0.7, g);
    const local = [];   // [out, up] from the seam point, then 3D points for the fall
    if (standing) {
      // The wall: 34 rows from just under the seam up to its top, flaring out more the higher it goes; then the crown,
      // 12 rows rolling inward (towards the opening) over the top: forward over the back, a little in at the sides.
      const H = 0.02 + 0.012 * ramp(0, 0.45, g) + 0.01 * ramp(0.45, 1, g);
      const L = 0.3 + 0.5 * ramp(0.05, 0.5, g);
      for (let k = 0; k <= 33; k++) {
        const h = -0.004 + ((H + 0.004) * k) / 33, t = Math.max(0, h) / H;
        local.push([0.0016 + over + Math.max(0, h) * Math.tan(L) * (0.45 + 0.55 * t), h]);
      }
      const curl = 0.4 + 2.3 * ramp(0.12, 0.55, g), rc = 0.008 + 0.024 * ramp(0.12, 0.6, g);
      let [o, h] = local.at(-1), phi = Math.atan(Math.tan(L) * 1.55);
      for (let k = 1; k <= 12; k++) {
        const step = (rc * curl) / 12;
        phi -= curl / 12;
        o += step * Math.sin(phi);
        h += step * Math.cos(phi);
        local.push([o, h]);
      }
      const toWorldS = ([oo, hh]) => S.clone().addScaledVector(O, oo).addScaledVector(up, hh);
      const pathS = local.map(toWorldS);
      let vS = 0;
      pathS.forEach((P, r) => {
        if (r) vS += P.distanceTo(pathS[r - 1]);
        pos.push(P.x, P.y, P.z);
        uv.push(...uvBack(hx, HOOD_TOP - vS));
        const s = r <= 6 ? 0.55 + 0.45 * ramp(0, 6, r) : 1;
        col.push(s, s, s);
      });
      lengths.push([hx, vS]);
      edge.push(pathS.at(-1));
      if (!q.back && Math.abs(Math.abs(q.x) - 0.036) < 0.004 && !eyelets.some((e) => Math.sign(e.x) === Math.sign(q.x) && (c < strip.length / 2) === e.first)) {
        eyelets.push({ x: q.x, first: c < strip.length / 2, at: pathS[18].clone().addScaledVector(O, 0.004), out: O.clone() });
      }
      continue;
    }
    // The stand: from just under the seam (it covers the body's neck edge) up round the neck, leaning out.
    for (let k = 0; k <= 9; k++) { const h = -0.004 + ((hs + 0.004) * k) / 9; local.push([0.0016 + over + Math.max(0, h) * Math.tan(lean), h]); }
    const [o0, h0] = local.at(-1);
    // The roll over the face edge, outwards.
    for (let k = 1; k <= 11; k++) { const a = (turn * k) / 11; local.push([o0 + rr * (1 - Math.cos(a)) + 0.004 * Math.sin(a) * Math.tan(lean), h0 + rr * Math.sin(a)]); }
    const [oE, hE] = local.at(-1);
    const toWorld = ([o, h]) => S.clone().addScaledVector(O, o).addScaledVector(up, h);
    const path = local.map(toWorld);
    // The fall, down over the shoulders and back onto the body (standing off it as a soft, fuller pouch), from the
    // end of the roll; then the crown tucked under.
    const E = path.at(-1);
    const bodyAt = (d) => {
      const x = q.x * (1 + 2.6 * d), y = q.y + hE - d, e = 0.004;
      const B = surface(x, y, q.back);
      const N = new THREE.Vector3().subVectors(surface(x + e, y, q.back), surface(x - e, y, q.back))
        .cross(new THREE.Vector3().subVectors(surface(x, y + e, q.back), surface(x, y - e, q.back))).normalize();
      if (N.dot(O) < 0) N.negate();
      return { B, N };
    };
    const FALL = 22;
    for (let k = 1; k <= FALL; k++) {
      const d = (fall * k) / FALL, { B, N } = bodyAt(d);
      const lift = 0.009 + 0.024 * Math.sin(Math.PI * Math.min(1, d / Math.max(fall, 1e-4))) ** 0.8 * g * g;
      const drop = E.clone().addScaledVector(up, -d).addScaledVector(O, -0.05 * d);
      const on = B.clone().addScaledVector(N, lift);
      const P = drop.lerp(on, ramp(0, 0.075, d));
      // Never inside the body.
      const out = P.clone().sub(B).dot(N);
      if (out < 0.006) P.addScaledVector(N, 0.006 - out);
      path.push(P);
    }
    const end = path.at(-1), { B: Be, N: Ne } = bodyAt(fall + 0.006);
    for (let k = 1; k <= 3; k++) {
      const t = k / 3, P = end.clone();
      if (tuck > 0.001) P.lerp(Be.clone().addScaledVector(Ne, 0.0035), t).addScaledVector(up, -tuck * 0.4 * t);
      path.push(P);
    }
    // Lengths along the column for the print (the hood piece: the seam at its top, the face edge at its foot).
    let v = 0;
    path.forEach((P, r) => {
      if (r) v += P.distanceTo(path[r - 1]);
      pos.push(P.x, P.y, P.z);
      uv.push(...uvBack(hx, HOOD_TOP - v));
      // Shade: deep at the seam (inside and out), lighter up the stand and over the pouch, darker where it tucks.
      const s = r <= 9 ? 0.5 + 0.5 * ramp(0, 9, r) : r >= ROWS - 4 && tuck > 0.001 ? 0.78 : 1;
      col.push(s, s, s);
    });
    lengths.push([hx, v]);
    edge.push(path[20]);
    // Eyelets for the drawstring: on each face edge's front, 3.5 cm either side of the middle (just past the zip).
    if (!q.back && Math.abs(Math.abs(q.x) - (zip ? 0.032 : 0.036)) < 0.004 && !eyelets.some((e) => Math.sign(e.x) === Math.sign(q.x) && (c < strip.length / 2) === e.first)) {
      eyelets.push({ x: q.x, first: c < strip.length / 2, at: path[9].clone().addScaledVector(O, 0.004), out: O.clone() });
    }
  }
  // Wound so the front faces point away from the body over the fall (the hood's outside there). Two groups: the stand
  // and roll (0: the side facing the neck is the lining, the other the outer fabric) and the fall (1: the outer
  // fabric outside, the lining under it).
  const P = (k) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const a = mid * ROWS + 32, flip = P(a + ROWS).sub(P(a)).cross(P(a + 1).sub(P(a))).dot(new THREE.Vector3(0, 0, -1)) < 0;
  const groups = [[], []];
  for (let c = 0; c < cols - 1; c++) for (let r = 0; r < ROWS - 1; r++) {
    const a0 = c * ROWS + r, b0 = a0 + 1, c0 = a0 + ROWS, d0 = c0 + 1;
    groups[r < 15 && !standing ? 0 : 1].push(...(flip ? [a0, b0, c0, b0, d0, c0] : [a0, c0, b0, b0, c0, d0]));
  }
  const geometry = geometryOf({ pos, uv, col, idx: [...groups[0], ...groups[1]] });
  geometry.addGroup(0, groups[0].length, 0);
  geometry.addGroup(groups[0].length, groups[1].length, 1);
  // The hood piece on the atlas (back side): the neck seam along its top, the face edge and crown along its foot.
  const piece = [
    ...lengths.map(([hx]) => ({ x: hx, y: HOOD_TOP + 0.006 })),
    ...lengths.slice().reverse().map(([hx, v]) => ({ x: hx, y: HOOD_TOP - v - 0.006 })),
  ].reverse();
  // The face edge: from the front of one end up its lip, round, and down the other (its drawstring channel).
  const channel = [...edge];
  return { geometry, piece, channel, eyelets, hoodX: lengths.map(([hx]) => hx) };
}

/** A tube along a line of points (the hood's drawstring channel). */
export function tubeAlong(points, radius) {
  const clean = points.filter((p, k) => !k || p.distanceTo(points[k - 1]) > 1e-4);
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(clean), Math.max(8, clean.length * 2), radius, 8, false);
}

/**
 * The hood's drawstring: a flat cord out of each eyelet on the face edge, hanging down over the chest about 20 cm,
 * finished with an aglet. Returns the group and its two materials (cord; eyelets and aglets).
 */
export function buildHoodCords(ctx, eyelets) {
  const { sampleFront } = ctx;
  const cord = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.75 });
  const group = new THREE.Group();
  for (const e of eyelets) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0036, 0.0011, 8, 20), metal);
    ring.position.copy(e.at);
    ring.lookAt(e.at.clone().add(e.out));
    group.add(ring);
    const dir = Math.sign(e.x) || 1, pts = [e.at.clone().addScaledVector(e.out, 0.002)];
    const y0 = e.at.y;
    for (let k = 1; k <= 9; k++) {
      const t = k / 9, y = y0 - 0.012 - 0.2 * t, x = dir * (0.034 + 0.012 * t + 0.004 * Math.sin(t * 5));
      const s = sampleFront(x, Math.min(y, 0.69));
      const P = s.p.clone().addScaledVector(s.n, 0.0055);
      P.x = x;
      if (k === 1) P.z = Math.max(P.z, e.at.z + 0.004);
      P.y = y;
      pts.push(P);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.0027, 8, false), cord);
    tube.scale.set(1, 1, 1);
    tube.castShadow = true;
    group.add(tube);
    const end = curve.getPoint(1), tangent = curve.getTangent(1).normalize();
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.003, 0.024, 14), metal);
    tip.position.copy(end).addScaledVector(tangent, 0.011);
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    tip.castShadow = true;
    group.add(tip);
  }
  return { group, cord, metal };
}

/**
 * The kangaroo pocket (zones.js KANGAROO): a second layer of fabric over the stomach, sewn along its top, its lower
 * sides and its foot (just above the waistband), its curved sides open for the hands: there it stands off the body
 * and its opening shows in shadow. A zip hoodie's is split either side of the zip (each half sewn along the zip).
 * Its UVs are the front's under it, so the print runs on across it (and its colour zone paints that area).
 */
export function buildKangaroo(ctx, { zip = false } = {}) {
  const { sampleFront, uvAt } = ctx;
  const K = KANGAROO, rows = 40, cols = zip ? 26 : 52;
  const pieces = zip ? [[K.zipGap, 1], [-1, -K.zipGap]] : [[-1, 1]];
  const pos = [], uv = [], col = [], idx = [];
  const open = (y) => (y > K.openBottom ? Math.sin((Math.PI * (y - K.openBottom)) / (K.top - K.openBottom)) : 0);
  const flat = [];
  const put = (v, x, y, c) => { pos.push(v.x, v.y, v.z); uv.push(...uvAt(x, y)); col.push(c, c, c); flat.push([x, y]); return pos.length / 3 - 1; };
  for (const [a, b] of pieces) {
    const base = pos.length / 3, grid = [];
    for (let j = 0; j <= rows; j++) {
      const row = [], y = K.bottom + ((K.top - K.bottom) * j) / rows, xr = kangarooEdge(y);
      const x0 = a === -1 ? -xr : a, x1 = b === 1 ? xr : b;
      for (let i = 0; i <= cols; i++) {
        const x = x0 + ((x1 - x0) * i) / cols, s = sampleFront(x, y), ax = Math.abs(x);
        const sewn = Math.min(y - K.bottom, K.top - y, y < K.openBottom ? xr - ax : 1, zip ? ax - K.zipGap : 1);
        const toOpen = y > K.openBottom ? xr - ax : 1;
        const lift = 0.0012 + 0.0028 * ramp(0, 0.025, sewn) + 0.0035 * Math.sin((Math.PI * (y - K.bottom)) / (K.top - K.bottom)) * Math.cos((Math.PI * ax) / (2 * K.half))
          + 0.014 * open(y) * Math.exp(-toOpen / 0.03);
        const c = s.shade * (1 - 0.22 * Math.exp(-toOpen / 0.005) * open(y));
        // The hand opening's lip also stands forward, so its opening shows from the front.
        const lip = 0.007 * open(y) * Math.exp(-toOpen / 0.025);
        row.push(put(s.p.clone().addScaledVector(s.n, lift).add(new THREE.Vector3(0, 0, lip)), x, y, c));
      }
      grid.push(row);
    }
    idx.push(...gridIndex(pos, rows + 1, cols + 1, base, new THREE.Vector3(0, 0, 1)));
    // Walls down to the body: shaded where sewn, deep shadow inside the hand openings (both windings).
    const wall = (list, foot) => {
      // Two copies, one wound each way, so each has its own even normals (the one facing away is not drawn).
      for (const turn of [false, true]) {
        const tops = list.map((v) => put(new THREE.Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]), flat[v][0], flat[v][1], col[v * 3] * Math.min(1, foot * 1.6)));
        const feet = list.map((v) => { const [x, y] = flat[v], s = sampleFront(x, y); return put(s.p.clone().addScaledVector(s.n, -0.0003), x, y, col[v * 3] * foot * 0.6); });
        for (let k = 0; k < list.length - 1; k++) {
          const t0 = tops[k], t1 = tops[k + 1], f0 = feet[k], f1 = feet[k + 1];
          idx.push(...(turn ? [t0, t1, f0, t1, f1, f0] : [t0, f0, t1, t1, f0, f1]));
        }
      }
    };
    wall(grid[0], 0.55);
    wall(grid[rows], 0.55);
    const cut = Math.round((rows * (K.openBottom - K.bottom)) / (K.top - K.bottom));
    for (const [list, outer] of [[grid.map((row) => row[cols]), b === 1], [grid.map((row) => row[0]), a === -1]]) {
      if (!outer) { wall(list, 0.55); continue; }
      // The outer side: sewn below the hand opening, open (in shadow) along it.
      wall(list.slice(0, cut + 1), 0.55);
      wall(list.slice(cut), 0.1);
    }
  }
  return geometryOf({ pos, uv, col, idx });
}

/** A small normal map of rib knit: upright ribs, one per tile across (u). */
export function ribNormalMap() {
  const w = 32, h = 4, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let x = 0; x < w; x++) {
    const slope = -Math.sin((2 * Math.PI * x) / w) * 0.9;
    const len = Math.hypot(slope, 1);
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      img.data[i] = ((slope / len) * 0.5 + 0.5) * 255; img.data[i + 1] = 128; img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Look 2: a round ring for a long sleeve's rib cuff. The sleeve's own end is pressed flat (its drawn cuff bows away
 * from the straight line between the corners, so the made sleeve closes there), and a band sewn on that edge hangs as
 * a flat strip. This ring is taken round the sleeve itself `above` metres up from the cuff line, where it is still
 * round: the outermost fabric in each direction round the arm, a few millimetres outside it (room for the
 * sleeve's flattened end inside). A band from it covers the sleeve's
 * end. `ca`, `cb`: the cuff's corners (flat pattern, right half); `sgn`: the side; `dir`: along the arm, outwards.
 */
export function cuffRingAbove({ points, positions, n }, ca, cb, sgn, dir, above = 0.03) {
  const ab = cb.clone().sub(ca), L = ab.length(), u = ab.clone().divideScalar(L);
  const mid = ca.clone().lerp(cb, 0.5), inward = new THREE.Vector2(-u.y, u.x);
  if (inward.dot(new THREE.Vector2(0.258, 0.61).sub(mid)) < 0) inward.negate();
  const near = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (Math.sign(p.x) !== sgn) continue;
    const q = new THREE.Vector2(Math.abs(p.x), p.y).sub(ca), t = q.dot(u) / L, d = q.dot(inward);
    if (t < -0.15 || t > 1.15 || Math.abs(d - above) > 0.008) continue;
    for (const j of [i, n + i]) near.push(new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]));
  }
  if (near.length < 12) return null;
  const C = near.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(near.length);
  const e1 = new THREE.Vector3().crossVectors(dir, Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).normalize();
  const e2 = new THREE.Vector3().crossVectors(dir, e1).normalize();
  const K = 48, r = new Array(K).fill(0);
  for (const p of near) {
    const o = p.clone().sub(C), x = o.dot(e1), y = o.dot(e2);
    const k = Math.floor(((Math.atan2(y, x) / (2 * Math.PI)) + 1) * K) % K;
    r[k] = Math.max(r[k], Math.hypot(x, y));
  }
  for (let k = 0; k < K; k++) if (!r[k]) { let a = k, b = k; while (!r[a]) a = (a - 1 + K) % K; while (!r[b]) b = (b + 1) % K; r[k] = (r[a] + r[b]) / 2; }
  const smooth = r.map((v, k) => (r[(k - 1 + K) % K] + 2 * v + r[(k + 1) % K]) / 4);
  return smooth.map((v, k) => {
    const th = (2 * Math.PI * (k + 0.5)) / K, rr = Math.max(v, r[k]) + 0.0045;
    return C.clone().addScaledVector(e1, rr * Math.cos(th)).addScaledVector(e2, rr * Math.sin(th));
  });
}

/**
 * A rib-knit band sewn on at an edge (a hoodie's cuffs and waistband): from just inside the garment's edge it runs on
 * `length` metres along `dir`, drawn in a little (`squeeze`) as rib does, round over at its end and a little way back
 * up inside. `loop`: the edge's points in order round it (closed unless `open`, as a zip hoodie's split waistband).
 * u counts the ribs (about 4.5 mm apart) for the rib normal map.
 */
export function buildRib(loop, { dir, length, squeeze, open = false }) {
  const pts = loop.flatMap((a, k) => {
    if (open && k === loop.length - 1) return [a];
    const b = loop[(k + 1) % loop.length];
    return [a, a.clone().lerp(b, 0.5)];
  });
  const C = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);
  const fold = 0.003, profile = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    profile.push([-0.007 + (length + 0.007) * t, -0.0022 * (1 - ramp(0, 0.12, t)) + 0.0016 * ramp(0, 0.12, t), t]);
  }
  for (let k = 1; k <= 6; k++) { const a = (Math.PI * k) / 6; profile.push([length + fold * Math.sin(a), 0.0016 - fold * (1 - Math.cos(a)), 1]); }
  for (let k = 1; k <= 3; k++) profile.push([length - (0.02 * k) / 3, 0.0016 - 2 * fold, 1]);
  const rowsN = profile.length, pos = [], uv = [];
  let along = 0;
  pts.forEach((P, i) => {
    if (i) along += P.distanceTo(pts[i - 1]);
    const r = P.clone().sub(C), a0 = r.dot(dir), rr = r.clone().addScaledVector(dir, -a0), rad = rr.length(), R = rr.divideScalar(rad);
    for (const [a, off, t] of profile) {
      const radius = rad * (1 - squeeze * ramp(0, 1, t)) + off;
      const Q = C.clone().addScaledVector(dir, a0 + a).addScaledVector(R, radius);
      pos.push(Q.x, Q.y, Q.z);
      uv.push(along / 0.0045, a / length);
    }
  });
  const cols = pts.length + (open ? 0 : 1);
  if (!open) for (let r = 0; r < rowsN; r++) { pos.push(pos[r * 3], pos[r * 3 + 1], pos[r * 3 + 2]); uv.push((along + pts.at(-1).distanceTo(pts[0])) / 0.0045, uv[r * 2 + 1]); }
  const idx = [];
  for (let c = 0; c < cols - 1; c++) for (let r = 0; r < rowsN - 1; r++) {
    const a0 = c * rowsN + r, b0 = a0 + 1, c0 = a0 + rowsN, d0 = c0 + 1;
    idx.push(a0, b0, c0, b0, d0, c0);
  }
  return geometryOf({ pos, uv, idx });
}

/**
 * The full-length front zip: two tapes either side of the centre front, the interlocking teeth down the middle (from
 * the foot of the waistband to the neck) and the slider at the top with its pull hanging down. `path(y)` gives the
 * centre front's made surface ({p, n}) at a height. Returns the group and its materials (tape, teeth, slider).
 */
export function buildZip(path, { bottom, top }) {
  const tape = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85, side: THREE.DoubleSide });
  const teethMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.38, metalness: 0.2 });
  // (FN5 2026-10-30, DT7: a satin gunmetal slider, so it no longer flashes pure white on the collar in the 3/4 view.)
  const metal = new THREE.MeshStandardMaterial({ color: 0x8e949c, roughness: 0.5, metalness: 0.7 });
  const group = new THREE.Group();
  const step = 0.003, ys = [];
  for (let y = bottom; y <= top + 1e-6; y += step) ys.push(y);
  const frames = ys.map((y) => {
    const { p, n } = path(y);
    const t = path(y + 0.002).p.sub(path(y - 0.002).p).normalize();
    const x = new THREE.Vector3().crossVectors(t, n).normalize();
    if (x.x < 0) x.negate();
    return { p, n, t, x };
  });
  // Tapes: 1.1 cm each, just off the fabric.
  const pos = [], idx = [];
  for (const sgn of [-1, 1]) {
    const base = pos.length / 3;
    frames.forEach(({ p, n, x }) => {
      for (const w of [0.0012, 0.006, 0.0115]) { const q = p.clone().addScaledVector(x, sgn * w).addScaledVector(n, 0.0013 - (w > 0.011 ? 0.0006 : 0)); pos.push(q.x, q.y, q.z); }
    });
    for (let k = 0; k < frames.length - 1; k++) for (let c = 0; c < 2; c++) {
      const a = base + k * 3 + c, b = a + 1, d = a + 3, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  group.add(new THREE.Mesh(geometryOf({ pos, idx }), tape));
  // Teeth: little moulded blocks alternating from each side, interlocked down the middle.
  const tooth = new THREE.BoxGeometry(0.0046, 0.0019, 0.0024);
  const count = Math.floor((top - bottom - 0.02) / 0.0021);
  const teeth = new THREE.InstancedMesh(tooth, teethMat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), basis = new THREE.Matrix4();
  for (let k = 0; k < count; k++) {
    const y = bottom + 0.004 + k * 0.0021, { p, n } = path(y);
    const t = path(y + 0.002).p.sub(path(y - 0.002).p).normalize(), x = new THREE.Vector3().crossVectors(t, n).normalize();
    basis.makeBasis(x, t, n);
    q.setFromRotationMatrix(basis);
    m.compose(p.clone().addScaledVector(n, 0.0022).addScaledVector(x, (k % 2 ? 1 : -1) * 0.0011), q, new THREE.Vector3(1, 1, 1));
    teeth.setMatrixAt(k, m);
  }
  teeth.castShadow = true;
  group.add(teeth);
  // The slider at the top and its pull.
  const { p, n } = path(top - 0.012), t = path(top - 0.01).p.sub(path(top - 0.014).p).normalize(), x = new THREE.Vector3().crossVectors(t, n).normalize();
  basis.makeBasis(x, t, n);
  const slider = new THREE.Mesh(new THREE.BoxGeometry(0.0095, 0.017, 0.0048), metal);
  slider.position.copy(p).addScaledVector(n, 0.0038);
  slider.quaternion.setFromRotationMatrix(basis);
  group.add(slider);
  const pull = new THREE.Mesh(new THREE.BoxGeometry(0.0072, 0.03, 0.0014), metal);
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.22);
  pull.quaternion.setFromRotationMatrix(basis).multiply(tilt);
  pull.position.copy(p).addScaledVector(n, 0.0075).addScaledVector(t, -0.021);
  pull.castShadow = true;
  group.add(pull);
  return { group, tape, teeth: teethMat, metal };
}
