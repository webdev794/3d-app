import * as THREE from 'three';
import Delaunator from 'delaunator';

// Garment outlines (right half, metres, y up, hem at 0). The left half is
// mirrored. Each garment is a sewn front + back panel "inflated" into a
// volume, so its texture layout is the flat print pattern itself.
const TOP_BODY = [
  [0.19, 0.716], [0.258, 0.688], [0.33, 0.636], [0.418, 0.566], [0.398, 0.522],
  [0.372, 0.476], [0.31, 0.505], [0.258, 0.53], [0.25, 0.42], [0.244, 0.3],
  [0.25, 0.16], [0.258, 0.03], [0.2, 0.012], [0.1, 0.002], [0, 0],
];
const CUFF = [[0.418, 0.566], [0.372, 0.476]];

/**
 * Per garment: outline, which edges stay open (neck/waist, hem or legs,
 * cuffs, armholes), the rim tube (collar or waistband) and inflation depth.
 */
export const SPECS = {
  jersey: {
    half: [[0, 0.672], [0.05, 0.712], [0.088, 0.738], ...TOP_BODY],
    neck: { drop: 0.072, half: 0.092 },
    rim: { drop: 0.08, half: 0.11, radius: 0.009 },
    cuff: CUFF,
    depth: 0.18,
    chest: true,
    torso: { half: 0.262, depth: 0.118 },
    droop: { pivot: [0.255, 0.645], from: 0.245, to: 0.31, angle: 0.36 },
  },
  tee: {
    half: [[0, 0.7], [0.05, 0.722], [0.086, 0.738], ...TOP_BODY],
    neck: { drop: 0.045, half: 0.09 },
    rim: { drop: 0.05, half: 0.11, radius: 0.0085 },
    cuff: CUFF,
    depth: 0.18,
    chest: true,
    torso: { half: 0.262, depth: 0.118 },
    droop: { pivot: [0.255, 0.645], from: 0.245, to: 0.31, angle: 0.36 },
  },
  polo: {
    half: [[0, 0.712], [0.05, 0.73], [0.082, 0.742], ...TOP_BODY],
    neck: { drop: 0.035, half: 0.086 },
    rim: { drop: 0.04, half: 0.11, radius: 0.017 },
    cuff: CUFF,
    depth: 0.18,
    chest: true,
    torso: { half: 0.262, depth: 0.118 },
    droop: { pivot: [0.255, 0.645], from: 0.245, to: 0.31, angle: 0.36 },
  },
  singlet: {
    half: [
      [0, 0.64], [0.06, 0.69], [0.095, 0.738], [0.152, 0.738], [0.165, 0.66],
      [0.19, 0.58], [0.236, 0.505], [0.246, 0.42], [0.24, 0.3], [0.246, 0.16],
      [0.254, 0.03], [0.2, 0.012], [0.1, 0.002], [0, 0],
    ],
    neck: { drop: 0.072, half: 0.15 },
    rim: { drop: 0.08, half: 0.11, radius: 0.009 },
    armholes: true,
    depth: 0.175,
    chest: true,
    torso: { half: 0.25, depth: 0.115 },
  },
  shorts: {
    half: [
      [0, 0.42], [0.215, 0.42], [0.232, 0.32], [0.25, 0.16], [0.272, 0.02],
      [0.15, 0], [0.05, 0.02], [0.012, 0.15], [0, 0.17],
    ],
    neck: { drop: 0.012, half: 0.4 },
    rim: { drop: 0.015, half: 0.4, radius: 0.012 },
    legs: true,
    depth: 0.16,
    chest: false,
  },
};

/** Smooth closed outline sampled every `step` metres. */
function outline(kind, step) {
  const half = (SPECS[kind] ?? SPECS.jersey).half;
  const pts = [
    ...half.map(([x, y]) => new THREE.Vector2(x, y)),
    ...half
      .slice(1, -1)
      .reverse()
      .map(([x, y]) => new THREE.Vector2(-x, y)),
  ];
  const curve = new THREE.SplineCurve([...pts, pts[0]]);
  const length = curve.getLength();
  return curve.getSpacedPoints(Math.round(length / step)).slice(0, -1);
}

function inside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function distanceToOutline(p, poly, seam) {
  let best = Infinity;
  const ab = new THREE.Vector2(), ap = new THREE.Vector2();
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (seam && !(seam[i] && seam[(i + 1) % poly.length])) continue;
    ab.subVectors(b, a);
    ap.subVectors(p, a);
    const t = THREE.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
    best = Math.min(best, ap.addScaledVector(ab, -t).length());
  }
  return best;
}

/**
 * Builds the garment mesh. Returns the geometry plus the 2D frame the texture
 * compositor needs to paint in garment coordinates.
 */
export function buildGarment(kind = 'jersey', { step = 0.0085 } = {}) {
  const spec = SPECS[kind] ?? SPECS.jersey;
  const poly = outline(kind, step);
  const minX = Math.min(...poly.map((p) => p.x)), maxX = -minX;
  const minY = Math.min(...poly.map((p) => p.y));
  const maxY = Math.max(...poly.map((p) => p.y));
  const span = Math.max(maxX - minX, maxY - minY) * 1.02;

  // Hem (or leg openings), cuffs, armholes and neck (or waist) stay open;
  // only true seams join front to back.
  const cuff = spec.cuff?.map(([x, y]) => new THREE.Vector2(x, y));
  const open = (p) => {
    const ax = Math.abs(p.x);
    if (p.y < minY + 0.03 && (!spec.legs || ax > 0.035)) return true;
    if (p.y > maxY - spec.neck.drop && ax < spec.neck.half) return true;
    if (spec.armholes && ax > 0.15 && p.y > 0.5 && ax < 0.24) return true;
    if (cuff) {
      const a = cuff[0], b = cuff[1], q = new THREE.Vector2(ax, p.y);
      const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(q.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      if (q.distanceTo(a.clone().addScaledVector(ab, t)) < 0.012) return true;
    }
    return false;
  };
  const seam = poly.map((p) => !open(p));

  // Boundary first (shared seam), then an even interior grid.
  const points = [...poly];
  const nb = points.length;
  for (let y = minY + step / 2; y < maxY; y += step * 0.866) {
    const shift = (Math.round((y - minY) / (step * 0.866)) % 2) * step * 0.5;
    for (let x = minX + shift; x < maxX; x += step) {
      const p = new THREE.Vector2(x, y);
      if (inside(p, poly) && distanceToOutline(p, poly) > step * 0.55) points.push(p);
    }
  }
  const tri = Delaunator.from(points, (p) => p.x, (p) => p.y).triangles;
  const faces = [];
  for (let i = 0; i < tri.length; i += 3) {
    const [a, b, c] = [points[tri[i]], points[tri[i + 1]], points[tri[i + 2]]];
    const centroid = new THREE.Vector2((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3);
    if (!inside(centroid, poly)) continue;
    const ccw = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
    faces.push(ccw ? [tri[i], tri[i + 1], tri[i + 2]] : [tri[i], tri[i + 2], tri[i + 1]]);
  }

  // Depth of the front panel at each point. Tops wrap the torso around a
  // body-shaped (elliptical) cross-section, as on a mannequin; sleeves and
  // shorts are inflated tubes (depth grows with the square root of the
  // distance to the seam). Gentle waves add drape and folds.
  const n = points.length;
  const torso = spec.torso;
  const depth = points.map((p, i) => {
    if (i < nb && seam[i]) return 0;
    const d = distanceToOutline(p, poly, seam);
    const edgeFade = Math.min(1, d * 32);
    const hemWeight = Math.exp(-((p.y - .09) ** 2) / .025);
    const drape = edgeFade * (
      .0025 * Math.sin(p.x * 39 + p.y * 8) +
      .005 * Math.sin(p.x * 67 + Math.sin(p.y * 12) * 1.2) * hemWeight +
      .0015 * Math.sin(p.x * 25 - p.y * 30)
    );
    const tube = spec.depth * Math.sqrt(d);
    if (!torso) return tube + drape;
    // Torso: ellipse across the body, fuller at the chest, closing smoothly
    // into the shoulder seam.
    const ax = Math.abs(p.x), a = torso.half;
    const b = torso.depth * (1 + .09 * Math.exp(-((p.y - .5) ** 2) / .02) - .05 * Math.exp(-((p.y - .28) ** 2) / .01));
    const across = ax < a ? Math.sqrt(1 - (ax / a) ** 2) : 0;
    const shoulder = Math.min(1, Math.sqrt(d / .12)) * (1 - .3 * THREE.MathUtils.smoothstep(p.y, .56, .74));
    // Soft diagonal folds from the underarms and a little ease at the waist.
    const folds = edgeFade * (
      .004 * Math.sin((ax * 1.4 + p.y) * 34) * Math.exp(-((p.y - .44) ** 2) / .006) * Math.exp(-((ax - .17) ** 2) / .006) +
      .0025 * Math.sin(p.x * 52) * Math.exp(-((p.y - .2) ** 2) / .004)
    );
    return Math.max(b * across * shoulder, tube) + drape + folds;
  });
  // Sleeves hang down from the shoulder (A-pose) instead of standing out flat.
  const droop = (x, y) => {
    if (!spec.droop) return [x, y];
    const ax = Math.abs(x), w = THREE.MathUtils.smoothstep(ax, spec.droop.from, spec.droop.to);
    if (!w) return [x, y];
    const [px, py] = spec.droop.pivot, angle = -spec.droop.angle * w;
    const dx = ax - px, dy = y - py, c = Math.cos(angle), s = Math.sin(angle);
    return [Math.sign(x) * (px + dx * c - dy * s), py + dx * s + dy * c];
  };

  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const backHeight = (p) => {
    if (!spec.chest || Math.abs(p.x) > .112 || p.y < .62) return p.y;
    const neckLine = kind === 'tee' || kind === 'polo' ? .707 + Math.abs(p.x) * .42 : .672 + Math.abs(p.x) * .76;
    const weight = Math.exp(-((p.y - neckLine) ** 2) / .00072) * Math.max(0, 1 - Math.abs(p.x) / .12);
    return p.y + Math.max(0, .752 - p.y) * weight;
  };
  const back = spec.torso ? 0.94 : 0.9;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const [fx, fy] = droop(p.x, p.y), [bx, by] = droop(p.x, backHeight(p));
    positions.set([fx, fy, depth[i]], i * 3);
    positions.set([bx, by, -depth[i] * back], (n + i) * 3);
    uvs.set([(0.5 * (p.x - minX)) / span, (p.y - minY) / span], i * 2);
    uvs.set([0.5 + (0.5 * (maxX - p.x)) / span, (p.y - minY) / span], (n + i) * 2);
  }
  const index = [];
  for (const [a, b, c] of faces) index.push(a, b, c);
  for (const [a, b, c] of faces) index.push(n + a, n + c, n + b);

  // Normals from a welded copy so the side seams shade smoothly.
  const weld = (i) => (i >= n && i - n < nb && seam[i - n] ? i - n : i);
  const welded = new THREE.BufferGeometry();
  welded.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  welded.setIndex(index.map(weld));
  welded.computeVertexNormals();
  const normals = welded.getAttribute('normal').array.slice();
  for (let i = 0; i < nb; i++) if (seam[i]) normals.set(normals.slice(i * 3, i * 3 + 3), (n + i) * 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeBoundingBox();

  // Rim (collar or waistband): along the front opening, then back round
  // the rear one.
  const neckIdx = poly
    .map((p, i) => i)
    .filter((i) => !seam[i] && poly[i].y > maxY - spec.rim.drop && Math.abs(poly[i].x) < spec.rim.half);
  neckIdx.sort((a, b) => poly[a].x - poly[b].x);
  const neck = [
    ...neckIdx.map((i) => new THREE.Vector3(poly[i].x, poly[i].y, depth[i])),
    ...neckIdx.slice().reverse().map((i) => new THREE.Vector3(poly[i].x, backHeight(poly[i]), -depth[i] * back)),
  ];
  return {
    kind,
    geometry,
    frame: { minX, maxX, minY, maxY, span },
    outline: poly,
    neck,
    rimRadius: spec.rim.radius,
  };
}

/** Rib-knit collar ribbon: a sewn band, rather than an inflated round tube. */
export function buildCollar(neck, shorts = false) {
  const curve = new THREE.CatmullRomCurve3(neck, true);
  const points = curve.getSpacedPoints(160);
  const positions = [], uvs = [], indices = [];
  const width = shorts ? .018 : .012;
  points.forEach((point, index) => {
    positions.push(point.x, point.y - width, point.z, point.x, point.y + width * .25, point.z);
    uvs.push(index / 160, 0, index / 160, 1);
    if (index < 160) {
      const a = index * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
