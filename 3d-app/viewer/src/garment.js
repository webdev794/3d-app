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
    depth: 0.235,
    chest: true,
  },
  tee: {
    half: [[0, 0.7], [0.05, 0.722], [0.086, 0.738], ...TOP_BODY],
    neck: { drop: 0.045, half: 0.09 },
    rim: { drop: 0.05, half: 0.11, radius: 0.0085 },
    cuff: CUFF,
    depth: 0.235,
    chest: true,
  },
  polo: {
    half: [[0, 0.712], [0.05, 0.73], [0.082, 0.742], ...TOP_BODY],
    neck: { drop: 0.035, half: 0.086 },
    rim: { drop: 0.04, half: 0.11, radius: 0.017 },
    cuff: CUFF,
    depth: 0.235,
    chest: true,
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
    depth: 0.235,
    chest: true,
  },
  shorts: {
    half: [
      [0, 0.42], [0.215, 0.42], [0.232, 0.32], [0.25, 0.16], [0.272, 0.02],
      [0.15, 0], [0.05, 0.02], [0.012, 0.15], [0, 0.17],
    ],
    neck: { drop: 0.012, half: 0.4 },
    rim: { drop: 0.015, half: 0.4, radius: 0.012 },
    legs: true,
    depth: 0.2,
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

  // Inflation: depth grows with the square root of the distance to the seam,
  // giving round sleeves and a fuller torso. Gentle waves add drape.
  const n = points.length;
  const depth = points.map((p, i) => {
    if (i < nb && seam[i]) return 0;
    const d = distanceToOutline(p, poly, seam);
    const drape =
      0.0035 * Math.sin(p.y * 38 + p.x * 9) * Math.min(1, d * 12) +
      0.0025 * Math.sin(p.x * 31 - p.y * 17) * Math.min(1, d * 12);
    const chest = spec.chest
      ? 0.018 * Math.exp(-((p.y - 0.52) ** 2) / 0.02) * Math.exp(-(p.x ** 2) / 0.03)
      : 0;
    return spec.depth * Math.sqrt(d) + drape + chest;
  });

  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  for (let i = 0; i < n; i++) {
    const p = points[i];
    positions.set([p.x, p.y, depth[i]], i * 3);
    positions.set([p.x, p.y, -depth[i] * 0.9], (n + i) * 3);
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
    ...neckIdx.slice().reverse().map((i) => new THREE.Vector3(poly[i].x, poly[i].y, -depth[i] * 0.9)),
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
