import * as THREE from 'three';
import { panelSampler, buildRib, ribNormalMap } from './hoodie.js';

// The varsity (letterman) jacket (garment.js SPECS.varsity): a wool body with leather sleeves, a snap-button front on a
// raised placket, slanted welt pockets trimmed in leather, a rib collar, cuffs and waistband with contrast stripes and
// a quilted lining showing inside the neck. Its rib pieces are printed from their own pieces on the print atlas (above
// the panels: the collar on the back side, the waistband and cuffs on the front), so the 2D panels show them and
// artwork can go on them. All in garment metres on the made garment, y up, front +z.

const ramp = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const HEX = /^#[0-9a-f]{6}$/i;

export const isVarsity = (kind) => kind === 'varsity';

/**
 * The jacket's details in garment metres (front panel): the placket down the centre front (its overlapping edge at
 * +x), the snaps' heights on it (one more on the waistband), each welt pocket (the right half's; mirrored): its centre
 * line from top to foot and its width; the rib pieces' places on the atlas and their stripes (t: 0 at the seam, 1 at
 * the band's end).
 */
export const VARSITY = {
  placket: { x0: -0.016, x1: 0.016, bottom: 0.002, top: 0.668 },
  snaps: [0.625, 0.505, 0.385, 0.265, 0.145],
  bandSnap: -0.031,
  welt: { a: [0.118, 0.292], b: [0.166, 0.148], w: 0.021 },
  collarGap: 0.006,
  hemGap: 0.0016,
  rib: { collar: 0.052, waist: 0.065, cuff: 0.062 },
  atlas: { waistTop: 0.9, cuffTop: 1.045, cuffX: 0.08, collarBottom: 0.862 },
  stripes: [[0.6, 0.69], [0.78, 0.87]],
};

/** The welt pocket's corners on one side (sgn), `d` metres outside its edge: top-inner, top-outer, foot-outer, foot-inner. */
export function weltCorners(sgn, d = 0) {
  const { a, b, w } = VARSITY.welt;
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
  // Across the welt: towards the side seam (+x on the right half).
  const nx = -uy, ny = ux, s = nx < 0 ? -1 : 1, hw = w / 2 + d;
  const at = (p, k, e) => [sgn * (p[0] + s * nx * k + ux * e), p[1] + s * ny * k + uy * e];
  return [at(a, -hw, -d), at(a, hw, -d), at(b, hw, d), at(b, -hw, d)];
}

/** Whether a front point is on a welt pocket's trim. */
export function onWelt(x, y) {
  return [1, -1].some((sgn) => {
    const c = weltCorners(sgn);
    let inside = false;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      if ((c[i][1] > y) !== (c[j][1] > y) && x < ((c[j][0] - c[i][0]) * (y - c[i][1])) / (c[j][1] - c[i][1]) + c[i][0]) inside = !inside;
    }
    return inside;
  });
}

/** The leather sleeve on one side (dir), in garment metres: outside the armhole seam (clipped to the outline by the caller). */
export function sleevePath(c, dir) {
  c.moveTo(dir * 0.262, -0.1);
  c.lineTo(dir * 0.262, 0.531);
  c.quadraticCurveTo(dir * 0.273, 0.61, dir * 0.257, 0.687);
  c.lineTo(dir * 0.257, 0.76);
  c.lineTo(dir * 0.95, 0.76);
  c.lineTo(dir * 0.95, -0.1);
  c.closePath();
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

/**
 * A raised layer of fabric on the front (the placket, a welt): a grid over `at(u, v)` (panel metres) standing `lift(u,
 * v)` off the made front, printed from the atlas under it, with walls down to the body along the edges `walls` lists
 * ('u0', 'u1', 'v0', 'v1'), shaded `wallShade`.
 */
function raised(ctx, { cols, rows, at, lift, walls, wallShade = 0.55 }) {
  const { sampleFront, uvAt } = ctx;
  const pos = [], uv = [], col = [], idx = [], flat = [];
  const put = (v, x, y, c) => { pos.push(v.x, v.y, v.z); uv.push(...uvAt(x, y)); col.push(c, c, c); flat.push([x, y]); return pos.length / 3 - 1; };
  const grid = [];
  for (let j = 0; j <= rows; j++) {
    const row = [];
    for (let i = 0; i <= cols; i++) {
      const u = i / cols, v = j / rows, [x, y] = at(u, v), s = sampleFront(x, y);
      row.push(put(s.p.clone().addScaledVector(s.n, lift(u, v)), x, y, s.shade));
    }
    grid.push(row);
  }
  // Wound so the faces point out of the front.
  const P = (k) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const a = grid[0][0], flip = P(grid[0][1]).sub(P(a)).cross(P(grid[1][0]).sub(P(a))).z < 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a0 = grid[j][i], b0 = grid[j][i + 1], c0 = grid[j + 1][i], d0 = grid[j + 1][i + 1];
    if (flip) idx.push(a0, c0, b0, b0, c0, d0); else idx.push(a0, b0, c0, b0, d0, c0);
  }
  const wall = (list) => {
    for (const turn of [false, true]) {
      const tops = list.map((v) => put(P(v), flat[v][0], flat[v][1], col[v * 3] * Math.min(1, wallShade * 1.6)));
      const feet = list.map((v) => { const [x, y] = flat[v], s = sampleFront(x, y); return put(s.p.clone().addScaledVector(s.n, -0.0003), x, y, col[v * 3] * wallShade * 0.6); });
      for (let k = 0; k < list.length - 1; k++) {
        const t0 = tops[k], t1 = tops[k + 1], f0 = feet[k], f1 = feet[k + 1];
        idx.push(...(turn ? [t0, t1, f0, t1, f1, f0] : [t0, f0, t1, t1, f0, f1]));
      }
    }
  };
  if (walls.includes('u0')) wall(grid.map((r) => r[0]));
  if (walls.includes('u1')) wall(grid.map((r) => r[cols]));
  if (walls.includes('v0')) wall(grid[0]);
  if (walls.includes('v1')) wall(grid[rows]);
  return geometryOf({ pos, uv, col, idx });
}

/** How far the placket stands off the front at x: sewn flat along its inner edge, standing 2 mm at its overlapping edge. */
const placketLift = (x) => 0.0003 + 0.0019 * ramp(VARSITY.placket.x0, VARSITY.placket.x0 + 0.01, x);

/**
 * Moves a rib band's print onto its own piece of the atlas: `map(along, t)` (metres along the band from its first
 * point; t 0 at the seam, 1 at its end) gives the atlas uv. The rib count (for the rib normal map) moves to uv1.
 */
function onAtlas(geometry, map) {
  const uv = geometry.getAttribute('uv');
  geometry.setAttribute('uv1', uv.clone());
  let length = 0;
  for (let i = 0; i < uv.count; i++) length = Math.max(length, uv.getX(i) * 0.0045);
  for (let i = 0; i < uv.count; i++) {
    const [u, v] = map(uv.getX(i) * 0.0045, uv.getY(i), length);
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return length;
}

/** A rectangle piece outline (garment metres, closed by the caller). */
const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

/**
 * The varsity jacket's extra pieces on the made garment: the rib collar, cuffs and waistband (each printed from its
 * atlas piece), the placket, the welt pockets and the snaps. Returns their geometries, the snaps' places and the rib
 * pieces' outlines on the atlas (`pieces`: { back, outline, rib: name, length, height, flip }).
 */
export function buildVarsityParts(spec, ctx) {
  const { poly, seam, positions, n, minY, maxY, uvAt, uvBack } = ctx;
  const V = VARSITY;
  const sampleFront = panelSampler(ctx, false);
  const full = { ...ctx, sampleFront };
  const vtx = (j) => new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
  const byX = (a, b) => poly[a].x - poly[b].x;
  const ribs = [], pieces = [];
  const A = V.atlas;

  // The waistband: along the hem, split at the front (its ends meet under the bottom snap); its piece on the front of
  // the atlas, the seam along its top.
  const hemIdx = poly.map((_, i) => i).filter((i) => !seam[i] && poly[i].y < minY + 0.03);
  const g = V.hemGap;
  const right = hemIdx.filter((i) => poly[i].x >= g).sort(byX), left = hemIdx.filter((i) => poly[i].x <= -g).sort(byX);
  const hemLoop = [...right.map(vtx), ...hemIdx.slice().sort(byX).reverse().map((i) => vtx(n + i)), ...left.map(vtx)];
  const waist = buildRib(hemLoop, { dir: new THREE.Vector3(0, -1, 0), length: V.rib.waist, squeeze: 0.03, open: true });
  let L = 0;
  const waistLength = onAtlas(waist, (a, t, len) => { L = len; return uvAt(-len / 2 + a, A.waistTop - t * V.rib.waist); });
  ribs.push(waist);
  pieces.push({ back: false, rib: 'waist', outline: rect(-waistLength / 2 - 0.004, A.waistTop - V.rib.waist - 0.004, waistLength / 2 + 0.004, A.waistTop + 0.011), x0: -L / 2, top: A.waistTop, height: V.rib.waist, dir: -1 });

  // The cuffs, as a hoodie's; their pieces side by side on the front of the atlas.
  const [ca, cb] = spec.cuff.map(([x, y]) => new THREE.Vector2(x, y)), ab = cb.clone().sub(ca);
  const mid = ca.clone().lerp(cb, 0.5), inward = new THREE.Vector2(ab.y, -ab.x).normalize();
  if (inward.dot(new THREE.Vector2(0.258, 0.61).sub(mid)) < 0) inward.negate();
  for (const sgn of [1, -1]) {
    const idx = poly.map((_, i) => i).filter((i) => {
      if (seam[i] || Math.sign(poly[i].x) !== sgn) return false;
      const q = new THREE.Vector2(Math.abs(poly[i].x), poly[i].y), t = THREE.MathUtils.clamp(q.clone().sub(ca).dot(ab) / ab.lengthSq(), 0, 1);
      return q.distanceTo(ca.clone().addScaledVector(ab, t)) < 0.012;
    });
    const along = (i) => new THREE.Vector2(Math.abs(poly[i].x), poly[i].y).sub(ca).dot(ab);
    idx.sort((a, b) => along(a) - along(b));
    const loop = [...idx.map(vtx), ...idx.slice().reverse().map((i) => vtx(n + i))];
    const m = new THREE.Vector2(sgn * mid.x, mid.y), inn = new THREE.Vector2(sgn * inward.x, inward.y);
    const dir = ctx.at(m.x, m.y, false).sub(ctx.at(m.x + inn.x * 0.03, m.y + inn.y * 0.03, false)).normalize();
    const cuff = buildRib(loop, { dir, length: V.rib.cuff, squeeze: 0.12 });
    let x0 = 0;
    const len = onAtlas(cuff, (a, t, l) => { x0 = sgn > 0 ? A.cuffX : -A.cuffX - l; return uvAt(x0 + a, A.cuffTop - t * V.rib.cuff); });
    ribs.push(cuff);
    pieces.push({ back: false, rib: sgn > 0 ? 'cuffL' : 'cuffR', outline: rect(x0 - 0.004, A.cuffTop - V.rib.cuff - 0.004, x0 + len + 0.004, A.cuffTop + 0.011), x0, top: A.cuffTop, height: V.rib.cuff, dir: -1 });
  }

  // The collar: round the neck from the front's middle by the wearer's left (+x), the back and back to the front,
  // its ends either side of the top snap; standing up, leaning a little back, drawn in round the neck. Its piece is on
  // the back of the atlas (read from behind), the seam along its foot.
  const neckIdx = poly.map((_, i) => i).filter((i) => !seam[i] && poly[i].y > maxY - spec.neck.drop && Math.abs(poly[i].x) < spec.neck.half);
  const cg = V.collarGap;
  const frontR = neckIdx.filter((i) => poly[i].x >= cg).sort(byX), frontL = neckIdx.filter((i) => poly[i].x <= -cg).sort(byX);
  const collarLoop = [...frontR.map(vtx), ...neckIdx.slice().sort(byX).reverse().map((i) => vtx(n + i)), ...frontL.map(vtx)];
  const collar = buildRib(collarLoop, { dir: new THREE.Vector3(0, 1, -0.32).normalize(), length: V.rib.collar, squeeze: 0.07, open: true });
  let cl = 0;
  const collarLength = onAtlas(collar, (a, t, len) => { cl = len; return uvBack(len / 2 - a, A.collarBottom + t * V.rib.collar); });
  ribs.push(collar);
  pieces.push({ back: true, rib: 'collar', outline: rect(-collarLength / 2 - 0.004, A.collarBottom - 0.011, collarLength / 2 + 0.004, A.collarBottom + V.rib.collar + 0.004), x0: -cl / 2, top: A.collarBottom, height: V.rib.collar, dir: 1 });

  // The placket: a strip 3.2 cm wide down the centre front, its overlapping edge (+x) standing off the front.
  const P = V.placket;
  const placket = raised(full, {
    cols: 10, rows: 90,
    at: (u, v) => [P.x0 + (P.x1 - P.x0) * u, P.bottom + (P.top - P.bottom) * v],
    lift: (u) => placketLift(P.x0 + (P.x1 - P.x0) * u),
    walls: ['u1'], wallShade: 0.45,
  });

  // The welt pockets: a leather band each side, slanted, standing about 2.5 mm off the front, its slit along the
  // inner edge.
  const welts = [1, -1].map((sgn) => {
    const [c0, c1, c2, c3] = weltCorners(sgn);
    return raised(full, {
      cols: 6, rows: 24,
      at: (u, v) => {
        const top = [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u], foot = [c3[0] + (c2[0] - c3[0]) * u, c3[1] + (c2[1] - c3[1]) * u];
        return [top[0] + (foot[0] - top[0]) * v, top[1] + (foot[1] - top[1]) * v];
      },
      lift: (u, v) => 0.0012 + 0.0013 * Math.sin(Math.PI * u) ** 0.5 * Math.sin(Math.PI * v) ** 0.3,
      walls: ['u0', 'u1', 'v0', 'v1'], wallShade: 0.5,
    });
  });

  // The snaps: on the placket's middle, and one on the waistband.
  const snaps = V.snaps.map((y) => {
    const s = sampleFront(0, y);
    return { p: s.p.clone().addScaledVector(s.n, placketLift(0) + 0.0004), n: s.n.clone() };
  });
  const base = sampleFront(0, 0.004), k = (0.004 - V.bandSnap) / 0.069;
  const band = base.p.clone();
  band.y += V.bandSnap - 0.004;
  band.z = base.p.z * (1 - 0.03 * k) + 0.0034;
  snaps.push({ p: band, n: new THREE.Vector3(0, 0, 1) });

  return { ribs, pieces, placket, welts, snaps, sampleFront };
}

/** A snap: a domed metal cap with a rolled rim, its axis along +z. */
export function snapGeometries() {
  const dome = new THREE.SphereGeometry(0.0076, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.rotateX(Math.PI / 2);
  dome.scale(1, 1, 0.42);
  const rim = new THREE.TorusGeometry(0.0077, 0.0012, 8, 28);
  return { dome, rim };
}

/** The snaps as meshes, each facing out of the front. */
export function buildSnaps(snaps, material) {
  const { dome, rim } = snapGeometries();
  const group = new THREE.Group(), z = new THREE.Vector3(0, 0, 1);
  for (const { p, n } of snaps) {
    for (const [geometry, lift] of [[dome, 0.0006], [rim, 0.0004]]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(p).addScaledVector(n, lift);
      mesh.quaternion.setFromUnitVectors(z, n.clone().normalize());
      mesh.castShadow = true;
      group.add(mesh);
    }
  }
  return group;
}

/** The rib's normal map for the varsity's bands: read from uv1 (uv is the atlas piece the band is printed from). */
export function varsityRibMap() {
  const map = ribNormalMap();
  map.channel = 1;
  return map;
}

/** The quilted lining: diamond quilting stitched in rows, a soft puff in each diamond. Tileable, about 5 cm a diamond. */
export function quiltMap() {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s * 0.62);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#a9a9a9');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s]]) {
    const q = g.createRadialGradient(x, y, 2, x, y, s * 0.62);
    q.addColorStop(0, '#ffffff');
    q.addColorStop(1, 'rgba(169,169,169,0)');
    g.fillStyle = q;
    g.fillRect(0, 0, s, s);
  }
  g.strokeStyle = 'rgba(40,40,40,0.75)';
  g.lineWidth = 3;
  g.setLineDash([7, 4]);
  g.beginPath();
  g.moveTo(0, s / 2); g.lineTo(s / 2, 0); g.lineTo(s, s / 2); g.lineTo(s / 2, s); g.closePath();
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  // The atlas spans about 2.8 x 1.4 m.
  t.repeat.set(52, 26);
  return t;
}

/** A varsity colour zone (design.zoneColors) or its fallback. */
export function varsityColour(design, key) {
  const own = design.zoneColors?.[key];
  if (HEX.test(own ?? '')) return own;
  const sleeves = HEX.test(design.zoneColors?.sleeves ?? '') ? design.zoneColors.sleeves : design.secondary;
  return {
    body: design.main, sleeves, rib: design.main, ribStripe: sleeves, snaps: design.main, pocketTrim: sleeves, lining: design.secondary,
  }[key] ?? design.main;
}

/**
 * The finish of the jacket's fabric in the print's layout (texture.js frame): green the roughness (wool matt, leather
 * smoother), red the clear coat (leather only). One small canvas for both maps.
 */
export function finishMap(painter) {
  const H = 512, W = 1024, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(0,235,0)';
  g.fillRect(0, 0, W, H);
  const { minX, maxX, minY, span } = painter.frame, s = H / span;
  for (const back of [false, true]) {
    if (back) g.setTransform(-s, 0, 0, -s, H + maxX * s, H + minY * s);
    else g.setTransform(s, 0, 0, -s, -minX * s, H + minY * s);
    g.fillStyle = 'rgb(255,112,0)';
    for (const dir of [-1, 1]) { g.beginPath(); sleevePath(g, dir); g.fill(); }
    if (!back) {
      for (const sgn of [1, -1]) { g.beginPath(); weltCorners(sgn, 0.002).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

/** The neck edge's points on the panel outline, -x to +x. */
function neckEdge(painter) {
  return painter.outline.filter((p) => p.y > 0.655 && Math.abs(p.x) < 0.097).sort((a, b) => a.x - b.x);
}

/**
 * How the jacket is sewn, besides the shoulder and armhole seams (texture.js tailoring): the collar's seam round the
 * neck, the placket's two rows of stitching and its edge, the welts sewn on round their edges, and the waistband's
 * seam along the hem.
 */
export function varsityTailoring(painter, back) {
  const stitches = [], seams = [], folds = [];
  const neck = neckEdge(painter);
  const inset = (d) => (c) => neck.forEach((p, i) => (i ? c.lineTo(p.x, p.y - d) : c.moveTo(p.x, p.y - d)));
  seams.push(inset(0.002));
  stitches.push(inset(0.0065));
  // The waistband's seam along the hem.
  seams.push((c) => { c.moveTo(-0.3, 0.003); c.lineTo(0.3, 0.003); });
  stitches.push((c) => { c.moveTo(-0.3, 0.0075); c.lineTo(0.3, 0.0075); });
  if (!back) {
    const P = VARSITY.placket;
    for (const x of [P.x0 + 0.0035, P.x1 - 0.0035]) stitches.push((c) => { c.moveTo(x, P.bottom + 0.004); c.lineTo(x, P.top - 0.004); });
    seams.push((c) => { c.moveTo(P.x0, P.bottom); c.lineTo(P.x0, P.top); });
    folds.push((c) => { c.moveTo(P.x1 - 0.0008, P.bottom); c.lineTo(P.x1 - 0.0008, P.top); });
    for (const sgn of [1, -1]) {
      const corners = (d) => (c) => { weltCorners(sgn, d).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
      seams.push(corners(0));
      stitches.push(corners(-0.0025));
    }
  }
  return { stitches, seams, folds };
}

/**
 * The varsity's own colour zones on the atlas (design.zoneColors): the leather sleeves, the welt trim, the placket's
 * edge and the rib pieces (their colour and contrast stripes). The snaps and the lining are coloured on their own 3D
 * parts (main.js). Drawn in garment metres on the side's transform, after the body's fill and pattern.
 */
export function paintVarsity(painter, design, back) {
  const g = painter.ctx;
  g.save();
  painter.side(back);
  // The body (wool) has its own colour only when set; else the Primary fill (gradient and pattern) stays.
  if (HEX.test(design.zoneColors?.body ?? '')) {
    g.save();
    g.beginPath();
    painter.outline.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.clip();
    g.fillStyle = design.zoneColors.body;
    g.fillRect(-1, -0.1, 2, 0.9);
    g.restore();
  }
  // Leather sleeves.
  g.save();
  g.beginPath();
  painter.outline.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.clip();
  // Unset, the sleeves (and the welt trim) follow Secondary, its gradient too.
  const ownSleeves = HEX.test(design.zoneColors?.sleeves ?? '');
  const leather = ownSleeves ? design.zoneColors.sleeves : painter.zoneFill(design, 'secondary');
  g.fillStyle = leather;
  for (const dir of [-1, 1]) { g.beginPath(); sleevePath(g, dir); g.fill(); }
  // Leather's soft sheen down the sleeve, a touch lighter along its top.
  g.restore();
  if (!back) {
    // The welt trim and its slit (along the inner edge), the placket's overlapping edge.
    g.fillStyle = HEX.test(design.zoneColors?.pocketTrim ?? '') ? design.zoneColors.pocketTrim : leather;
    for (const sgn of [1, -1]) {
      const c = weltCorners(sgn, 0.0012);
      g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
      const [t0, , , f0] = weltCorners(sgn, -0.0006);
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 0.0022;
      g.beginPath(); g.moveTo(...t0); g.lineTo(...f0); g.stroke();
    }
    const P = VARSITY.placket;
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 0.0016;
    g.beginPath(); g.moveTo(P.x1 - 0.0006, P.bottom); g.lineTo(P.x1 - 0.0006, P.top + 0.01); g.stroke();
  }
  // The rib pieces: their colour, the stripes near the band's end and the rib's fine lines.
  const rib = varsityColour(design, 'rib'), stripe = varsityColour(design, 'ribStripe');
  for (const piece of painter.ribPieces ?? []) {
    if (piece.back !== back) continue;
    const xs = piece.outline.map((p) => p.x), ys = piece.outline.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    g.fillStyle = rib;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = stripe;
    for (const [a, b] of VARSITY.stripes) {
      const ya = piece.top + piece.dir * a * piece.height, yb = piece.top + piece.dir * b * piece.height;
      g.fillRect(x0, Math.min(ya, yb), x1 - x0, Math.abs(yb - ya));
    }
  }
  g.restore();
}

/** A fill of chenille tufts in `colour`: tiny light and dark specks, a tile about 6 mm across. */
const tuftTiles = new Map();
function tufted(g, colour) {
  if (!tuftTiles.has(colour)) {
    const s = 32, c = document.createElement('canvas');
    c.width = c.height = s;
    const t = c.getContext('2d');
    t.fillStyle = colour;
    t.fillRect(0, 0, s, s);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 90; k++) {
      t.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
      t.beginPath(); t.arc(rnd() * s, rnd() * s, 0.8 + rnd() * 1.4, 0, Math.PI * 2); t.fill();
    }
    if (tuftTiles.size > 12) tuftTiles.clear();
    tuftTiles.set(colour, c);
  }
  const pattern = g.createPattern(tuftTiles.get(colour), 'repeat');
  pattern.setTransform(new DOMMatrix([0.006 / 32, 0, 0, 0.006 / 32, 0, 0]));
  return pattern;
}

/** Text in felt (chenille) style centred on (0, 0), y down: a thick felt border round a fuzzy fill; optionally arched. */
function chenilleText(painter, str, { size, fill, border, maxWidth, arc = 0 }) {
  const g = painter.ctx;
  g.save();
  g.font = `700 ${size}px Rajdhani, Inter, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const chars = [...str], widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) * 1.04;
  const squeeze = total > maxWidth ? maxWidth / total : 1;
  // Each character's place and turn (an arch bends up in the middle: a circle of radius `arc` below the text).
  const place = [];
  let run = -total / 2;
  chars.forEach((ch, i) => {
    const w = widths[i] * 1.04, mid = (run + w / 2) * squeeze;
    run += w;
    if (arc > 0) { const a = mid / arc; place.push([arc * Math.sin(a), arc - arc * Math.cos(a), a]); } else place.push([mid, 0, 0]);
  });
  const each = (draw) => chars.forEach((ch, i) => { const [x, y, a] = place[i]; g.save(); g.translate(x, y); g.rotate(a); g.scale(squeeze, 1); draw(ch); g.restore(); });
  // Outer edge, felt border, then the chenille fill with its tufted texture.
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = size * 0.26;
  each((ch) => g.strokeText(ch, 0, 0));
  g.strokeStyle = border;
  g.lineWidth = size * 0.2;
  each((ch) => g.strokeText(ch, 0, 0));
  g.fillStyle = tufted(g, fill);
  each((ch) => g.fillText(ch, 0, 0));
  g.restore();
  const height = size * 1.1 + (arc > 0 ? arc - arc * Math.cos(total * squeeze / 2 / arc) : 0);
  return { w: Math.min(total, maxWidth) + size * 0.2, h: height };
}

const SLEEVE_TURN = Math.PI / 4;

/**
 * The varsity's fixed marks: a chenille letter (the club's initial) or the club's logo on the left chest, the club
 * name arched across the upper back, the player's name and a big number below it, the sponsor as a patch on the right
 * sleeve, and a round felt number patch on the left sleeve.
 */
export function paintVarsityMarks(painter, design, { logo, logoImg, sponsorImg, ownArt }) {
  const sleeves = varsityColour(design, 'sleeves');
  // The felt border in the accent colour, unless that is too close to the letter's (then the body's, or black).
  const far = (x, y) => { const p = parseInt(x.slice(1), 16), q = parseInt(y.slice(1), 16); return Math.abs((p >> 16) - (q >> 16)) + Math.abs(((p >> 8) & 255) - ((q >> 8) & 255)) + Math.abs((p & 255) - (q & 255)) > 90; };
  const body = varsityColour(design, 'body');
  const border = [design.accent, body, '#000000'].find((c) => HEX.test(c) && far(c, sleeves)) ?? '#000000';
  const felt = { fill: sleeves, border };
  const crest = { side: 'front', x: 0.105, y: 0.55 };
  if (logoImg) painter.markImage(design, 'crest', crest, logoImg, 0.11, 0.11);
  else if (!ownArt) {
    const letter = ([...logo].find((ch) => /[A-Z0-9]/.test(ch)) ?? 'V');
    painter.mark(design, 'crest', crest, () => chenilleText(painter, letter, { size: 0.13, ...felt, maxWidth: 0.12 }));
  }
  painter.mark(design, 'wordmark', { side: 'back', x: 0, y: 0.585 }, () => (logo ? chenilleText(painter, logo, { size: 0.062, ...felt, maxWidth: 0.36, arc: 0.42 }) : null));
  const backName = (design.backName || logo).toUpperCase();
  if (backName) painter.markText(design, 'name', { side: 'back', x: 0, y: 0.455 }, backName, 0.042, design.accent, 0.26, 'rgba(0,0,0,0.35)');
  const number = String(design.number ?? '23');
  painter.mark(design, 'number', { side: 'back', x: 0, y: 0.29 }, () => chenilleText(painter, number, { size: 0.17, ...felt, maxWidth: 0.26 }));
  // Sleeve patches stand upright on the arm as worn (the flat sleeve runs down and out at 45 degrees).
  if (sponsorImg) {
    painter.mark(design, 'sponsor', { side: 'front', x: -0.34, y: 0.555 }, (g) => {
      const k = Math.min(0.075 / sponsorImg.width, 0.075 / sponsorImg.height), w = sponsorImg.width * k, h = sponsorImg.height * k;
      g.rotate(SLEEVE_TURN);
      g.drawImage(sponsorImg, -w / 2, -h / 2, w, h);
      return { w, h };
    });
  }
  // The left sleeve's felt patch: a disc in the body's colour with the number on it (fixed).
  if (!number.trim()) return;
  const g = painter.ctx;
  g.save();
  painter.clipOutline(false);
  g.translate(0.34, 0.555);
  g.scale(1, -1);
  g.rotate(-SLEEVE_TURN);
  g.fillStyle = design.accent;
  g.beginPath(); g.arc(0, 0, 0.036, 0, Math.PI * 2); g.fill();
  g.fillStyle = varsityColour(design, 'body');
  g.beginPath(); g.arc(0, 0, 0.031, 0, Math.PI * 2); g.fill();
  painter.centredText(number, 0.04, design.accent, 0.05);
  g.restore();
}
