import * as THREE from 'three';
import { KANGAROO, HOOD_TOP } from './zones.js';
import { panelSampler, buildHood, buildRib, buildZip, cuffRingAbove } from './hoodie.js';

// The track suit jacket (garment.js SPECS.trackjacket / trackjacketHood): smooth polyester, a full front zip finished
// with a zip garage at the top, a stand-up collar (its own printed piece on the atlas) or the zip hoodie's hood,
// set-in sleeves with rib cuffs, a rib hem band and a zipped pocket in each side of the front.
// All in garment metres on the made garment (its creases), y up, front +z.

const ramp = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The collar's height (metres) at the back and at the zip, and the collar sheet's thickness. */
export const COLLAR = { back: 0.052, front: 0.046, thick: 0.004 };

/**
 * The side pockets' zips on the front (garment metres): each from its foot near the hem band up and a little in
 * towards the middle. `sgn` +1 the wearer's left, -1 the right. Shared by the 3D zips and the painted welts.
 */
export const POCKET_ZIP = { bottom: [0.172, 0.07], top: [0.147, 0.23] };
export function pocketZipX(sgn, y) {
  const [x0, y0] = POCKET_ZIP.bottom, [x1, y1] = POCKET_ZIP.top;
  return sgn * (x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
}

/**
 * A stand-up collar sewn round the neck: from the neck seam it stands up round the neck (a little higher at the back),
 * leaning in a touch, rounds over its top edge and comes back down inside. Its two ends meet either side of the front
 * zip, closed (the sheet's thickness runs out over their last 6 mm). One sheet: the outside printed from the atlas's
 * collar piece (zones.js HOOD_TOP, as a hood), the inside its lining (group 1). Returns its geometry, its piece's
 * outline on the atlas (back side) and `front(h)`: the zip's line up its front edge, h metres above the neck seam.
 */
export function buildStandCollar(ctx) {
  const { poly, seam, positions, n, maxY, neck, uvBack } = ctx;
  const neckIdx = poly.map((_, i) => i).filter((i) => !seam[i] && poly[i].y > maxY - neck.drop && Math.abs(poly[i].x) < neck.half);
  const vtx = (j) => new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
  const front = neckIdx.slice().sort((a, b) => poly[a].x - poly[b].x).map((i) => ({ p: vtx(i), x: poly[i].x, y: poly[i].y, back: false }));
  const backRun = neckIdx.slice().sort((a, b) => poly[b].x - poly[a].x).map((i) => ({ p: vtx(n + i), x: poly[i].x, y: poly[i].y, back: true }));
  let loop = [...front, ...backRun];
  loop = loop.flatMap((a, k) => {
    const b = loop[(k + 1) % loop.length];
    return [0, 1 / 3, 2 / 3].map((t) => ({ p: a.p.clone().lerp(b.p, t), x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, back: t < 0.5 ? a.back : b.back }));
  });
  const centre = loop.reduce((best, q, k) => (!q.back && Math.abs(q.x) < Math.abs(loop[best].x) ? k : best), 0);
  const ring = [...loop.slice(centre), ...loop.slice(0, centre)];
  // Ends either side of the zip.
  const gap = KANGAROO.zipGap - 0.001;
  const strip = ring.filter((q, k) => (k < ring.length / 2 ? !(!q.back && q.x < gap) : !(!q.back && q.x > -gap)));
  const arc = [0];
  for (let k = 1; k < strip.length; k++) arc.push(arc[k - 1] + strip[k].p.distanceTo(strip[k - 1].p));
  const mid = strip.reduce((best, q, k) => (q.back && Math.abs(q.x) < Math.abs(strip[best].x) ? k : best), strip.findIndex((q) => q.back));
  const half = Math.max(arc[mid], arc.at(-1) - arc[mid]);
  const C = strip.reduce((s, q) => s.add(q.p), new THREE.Vector3()).divideScalar(strip.length);
  const up = new THREE.Vector3(0, 1, 0);
  const OUT = 11, ROLL = 6, IN = 10, ROWS = OUT + ROLL + IN;
  const height = (g) => THREE.MathUtils.lerp(COLLAR.front, COLLAR.back, ramp(0.1, 0.8, g));
  const outer = (h) => 0.0016 - 0.11 * Math.max(0, h);   // the outside leans in towards the neck as it rises
  const pos = [], uv = [], col = [], lengths = [];
  const columns = [];
  for (let c = 0; c < strip.length; c++) {
    const q = strip[c], S = q.p;
    const hx = arc[mid] - arc[c];
    const g = THREE.MathUtils.clamp(1 - Math.abs(hx) / half, 0, 1);
    const O = new THREE.Vector3(S.x, 0, S.z - C.z).normalize();
    // The sheet's thickness runs out over the last 6 mm at each end, closing it there.
    const th = COLLAR.thick * ramp(0, 0.006, Math.min(arc[c], arc.at(-1) - arc[c]));
    const H = height(g), r = th / 2;
    const local = [];
    for (let k = 0; k < OUT; k++) { const h = -0.004 + ((H + 0.004) * k) / (OUT - 1); local.push([outer(h), h]); }
    const oTop = outer(H);
    for (let k = 1; k <= ROLL; k++) { const a = (Math.PI * k) / (ROLL + 1); local.push([oTop - r + r * Math.cos(a), H + r * Math.sin(a)]); }
    for (let k = 0; k < IN; k++) { const h = H - ((H + 0.002) * k) / (IN - 1); local.push([outer(h) - th, h]); }
    const path = local.map(([o, h]) => S.clone().addScaledVector(O, o).addScaledVector(up, h));
    columns.push({ S, O, H });
    let v = 0;
    path.forEach((P, k) => {
      if (k) v += P.distanceTo(path[k - 1]);
      pos.push(P.x, P.y, P.z);
      uv.push(...uvBack(hx, HOOD_TOP - v));
      // Shade: a little deeper where it meets the neck seam and on the inside.
      const s = k < OUT ? 0.72 + 0.28 * ramp(0, 4, k) : k < OUT + ROLL ? 0.95 : 0.7;
      col.push(s, s, s);
      if (k === OUT + 2) lengths.push([hx, v]);
    });
  }
  const P = (k) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const a = mid * ROWS + 5, flip = P(a + ROWS).sub(P(a)).cross(P(a + 1).sub(P(a))).dot(new THREE.Vector3(0, 0, -1)) < 0;
  const groups = [[], []];
  for (let c = 0; c < strip.length - 1; c++) for (let r = 0; r < ROWS - 1; r++) {
    const a0 = c * ROWS + r, b0 = a0 + 1, c0 = a0 + ROWS, d0 = c0 + 1;
    groups[r < OUT + 2 ? 0 : 1].push(...(flip ? [a0, b0, c0, b0, d0, c0] : [a0, c0, b0, b0, c0, d0]));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex([...groups[0], ...groups[1]]);
  geometry.addGroup(0, groups[0].length, 0);
  geometry.addGroup(groups[0].length, groups[1].length, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  // The collar piece on the atlas (back side): the neck seam along its top, its top edge along its foot.
  const piece = [
    ...lengths.map(([hx]) => ({ x: hx, y: HOOD_TOP + 0.006 })),
    ...lengths.slice().reverse().map(([hx, v]) => ({ x: hx, y: HOOD_TOP - v - 0.006 })),
  ].reverse();
  // The zip's line up the front edge: halfway between the two ends, on the outside.
  const ends = [columns[0], columns.at(-1)];
  const frontEdge = (h) => {
    const p = new THREE.Vector3();
    for (const { S, O } of ends) p.add(S.clone().addScaledVector(O, outer(h) + 0.0006).addScaledVector(up, h));
    const nrm = ends[0].O.clone().add(ends[1].O).normalize();
    return { p: p.multiplyScalar(0.5), n: nrm };
  };
  return { geometry, piece, front: frontEdge, height: Math.min(ends[0].H, ends[1].H), seamY: (ends[0].S.y + ends[1].S.y) / 2 };
}

/**
 * A track jacket's extra pieces on the made garment: the collar (or hood), the rib cuffs and hem band, the front zip
 * (over the hem band, up the collar's front edge to its top), the zip garage and the side pockets' zips.
 */
export function buildTrackParts(spec, ctx) {
  const { poly, seam, positions, n, minY } = ctx;
  const sampleFront = panelSampler(ctx, false);
  const full = { ...ctx, sampleFront };
  const hoodStyle = spec.track?.style === 'hood';
  const collar = hoodStyle ? null : buildStandCollar(full);
  const hood = hoodStyle ? buildHood(full, { zip: true }) : null;
  const vtx = (j) => new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
  // The hem band (split at the zip) and the cuffs.
  const hemIdx = poly.map((_, i) => i).filter((i) => !seam[i] && poly[i].y < minY + 0.03);
  const byX = (a, b) => poly[a].x - poly[b].x, g0 = 0.0125;
  const right = hemIdx.filter((i) => poly[i].x >= g0).sort(byX), left = hemIdx.filter((i) => poly[i].x <= -g0).sort(byX);
  const hemLoop = [...right.map(vtx), ...hemIdx.slice().sort(byX).reverse().map((i) => vtx(n + i)), ...left.map(vtx)];
  const BAND = 0.045;
  const ribs = [buildRib(hemLoop, { dir: new THREE.Vector3(0, -1, 0), length: BAND, squeeze: 0.015, open: true })];
  const [ca, cb] = spec.cuff.map(([x, y]) => new THREE.Vector2(x, y)), ab = cb.clone().sub(ca);
  const midC = ca.clone().lerp(cb, 0.5), inward = new THREE.Vector2(ab.y, -ab.x).normalize();
  if (inward.dot(new THREE.Vector2(0.258, 0.61).sub(midC)) < 0) inward.negate();
  for (const sgn of [1, -1]) {
    const idx = poly.map((_, i) => i).filter((i) => {
      if (seam[i] || Math.sign(poly[i].x) !== sgn) return false;
      const q = new THREE.Vector2(Math.abs(poly[i].x), poly[i].y), t = THREE.MathUtils.clamp(q.clone().sub(ca).dot(ab) / ab.lengthSq(), 0, 1);
      return q.distanceTo(ca.clone().addScaledVector(ab, t)) < 0.012;
    });
    const along = (i) => new THREE.Vector2(Math.abs(poly[i].x), poly[i].y).sub(ca).dot(ab);
    idx.sort((a, b) => along(a) - along(b));
    const loop = [...idx.map(vtx), ...idx.slice().reverse().map((i) => vtx(n + i))];
    const m = new THREE.Vector2(sgn * midC.x, midC.y), inn = new THREE.Vector2(sgn * inward.x, inward.y);
    const dir = ctx.at(m.x, m.y, false).sub(ctx.at(m.x + inn.x * 0.03, m.y + inn.y * 0.03, false)).normalize();
    // Look 2: a round rib tube over the sleeve's end, from 3 cm up the sleeve (hoodie.js cuffRingAbove).
    const ring = ctx.detail ? cuffRingAbove(ctx, ca, cb, sgn, dir) : null;
    ribs.push(ring ? buildRib(ring, { dir, length: 0.03 + 0.05, squeeze: 0.05 }) : buildRib(loop, { dir, length: 0.05, squeeze: 0.1 }));
  }
  // The front zip: from the hem band's foot up the centre front, then (collar) up the collar's front edge.
  const neckTop = spec.half[0][1] - 0.003, base = sampleFront(0, 0.004);
  const lift = collar ? collar.height - 0.003 : 0;
  const top = neckTop + lift;
  const path = (y) => {
    if (y > neckTop && collar) {
      const join = sampleFront(0, neckTop), h = y - neckTop, e = collar.front(h), e0 = collar.front(0);
      // From the body's centre front at the neck, on up the collar (eased onto its edge over the first 8 mm).
      const p = join.p.clone().addScaledVector(join.n, 0.0004).add(e.p.clone().sub(e0.p));
      const t = ramp(0, 0.008, h);
      return { p: p.lerp(e.p, t), n: join.n.clone().lerp(e.n, t).normalize() };
    }
    if (y >= 0.004) { const s = sampleFront(0, Math.min(y, neckTop)); return { p: s.p.clone().addScaledVector(s.n, 0.0004), n: s.n }; }
    const k = (0.004 - y) / (BAND + 0.004), p = base.p.clone();
    p.y += y - 0.004;
    p.z = base.p.z * (1 - 0.015 * k) + 0.0016;
    return { p, n: new THREE.Vector3(0, 0, 1) };
  };
  const zip = buildZip(path, { bottom: -(BAND - 0.003), top });
  // The zip garage: a small folded flap of the collar's fabric over the top of the zip.
  let garage = null;
  if (collar) {
    const at = path(top - 0.006), t = path(top - 0.004).p.sub(path(top - 0.008).p).normalize();
    const x = new THREE.Vector3().crossVectors(t, at.n).normalize();
    const geometry = new THREE.BoxGeometry(0.027, 0.016, 0.0055, 2, 2, 1);
    // Rounded a little: pull the corners in.
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const ax = Math.abs(p.getX(i)) / 0.0135, ay = Math.abs(p.getY(i)) / 0.008; if (ax > 0.99 && ay > 0.99) p.setXYZ(i, p.getX(i) * 0.93, p.getY(i) * 0.9, p.getZ(i)); }
    geometry.computeVertexNormals();
    const basis = new THREE.Matrix4().makeBasis(x, t, at.n);
    garage = { geometry, position: at.p.clone().addScaledVector(at.n, 0.0042), quaternion: new THREE.Quaternion().setFromRotationMatrix(basis) };
  }
  // The side pockets' zips, each sewn into a welt in the front.
  const pocketZips = [1, -1].map((sgn) => {
    const [, yb] = POCKET_ZIP.bottom, [, yt] = POCKET_ZIP.top;
    const pz = (y) => { const s = sampleFront(pocketZipX(sgn, y), y); return { p: s.p.clone().addScaledVector(s.n, 0.0002), n: s.n }; };
    return buildZip(pz, { bottom: yb, top: yt });
  });
  // Brushed sliders and pulls: the front zip's slider sits just under the garage, where polished metal caught the
  // light in a hard glint (bloomed on phones). Each zip has its own materials, so the hoodies' are unchanged.
  for (const z of [zip, ...pocketZips]) { z.metal.roughness = 0.5; z.metal.metalness = 0.65; }
  return { collar, hood, ribs, zip, garage, pocketZips, sampleFront, hoodStyle };
}
