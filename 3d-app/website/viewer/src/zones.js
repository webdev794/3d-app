// Garment areas a pattern can be dropped onto, in garment metres (y up,
// hem at 0, x = 0 down the middle). Rectangles are mirrored left/right and
// clipped to the garment outline when painted.

const TOP = {
  sleeves: [[0.27, 0.44, 0.47, 0.76]],
  yoke: [[-0.3, 0.56, 0.3, 0.8]],
  sides: [[0.2, 0, 0.3, 0.55]],
  hem: [[-0.3, 0, 0.3, 0.14]],
  body: [[-0.2, 0.14, 0.2, 0.56]],
};
const SHORTS = {
  sides: [[0.2, 0, 0.32, 0.44]],
  hem: [[-0.32, 0, 0.32, 0.1]],
  body: [[-0.2, 0.1, 0.2, 0.44]],
};

export const ZONE_NAMES = { body: 'Chest & body', yoke: 'Shoulders', sleeves: 'Sleeves', sides: 'Side panels', hem: 'Hem', pocket: 'Chest pocket', hood: 'Hood' };

/**
 * The pocket polo's chest pocket (pool and darts shirts): a patch pocket sewn on the wearer's left chest (+x on the
 * front), in garment metres: its sides, top and bottom, the bottom corners' radius and the depth of its top hem.
 * The 3D pocket (garment.js), its print and stitching (texture.js) and its colour zone all use it.
 */
export const POCKET = { x0: 0.055, x1: 0.167, top: 0.6, bottom: 0.462, corner: 0.014, hem: 0.022 };

/** The garments with a chest pocket. */
export const hasPocket = (kind) => kind === 'pocketpolo';

/** Whether a garment point (front side) is on the pocket. */
export function onPocket(x, y) {
  const { x0, x1, top, bottom, corner: r } = POCKET;
  if (x < x0 || x > x1 || y < bottom || y > top) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.max(y, bottom + r);
  return Math.hypot(x - cx, y - cy) <= r || y >= bottom + r;
}

/** Hoodies (pull-over and full zip). */
export const isHoodie = (kind) => kind === 'hoodie' || kind === 'ziphoodie';
/** The track suit jacket (collar or hood style: one kind, design.trackStyle). */
export const isTrack = (kind) => kind === 'trackjacket';

/**
 * A hoodie's kangaroo pocket, in garment metres on the front: its top (sewn) and foot (sewn, just above the
 * waistband), the top's half-width, the widest half-width (its lower sides, sewn), where the curved hand opening
 * ends at each side, and the gap either side of a zip (the zip hoodie's pocket is split, each half sewn along it).
 */
export const KANGAROO = { top: 0.3, bottom: 0.035, topHalf: 0.1, half: 0.172, openBottom: 0.12, zipGap: 0.013 };
/** The kangaroo pocket's half-width at height y: its sewn lower sides, then the hand opening curving in to the top. */
export function kangarooEdge(y) {
  const K = KANGAROO;
  if (y <= K.openBottom) return K.half;
  const t = Math.min(1, (y - K.openBottom) / (K.top - K.openBottom));
  return K.topHalf + (K.half - K.topHalf) * Math.cos((t * Math.PI) / 2);
}
/** Whether a front point is on a hoodie's kangaroo pocket (`zip`: split by the zip). */
export function onKangaroo(x, y, zip = false) {
  const K = KANGAROO;
  return y >= K.bottom && y <= K.top && Math.abs(x) <= kangarooEdge(y) && (!zip || Math.abs(x) >= K.zipGap);
}
/**
 * The hood's own piece on the print atlas: on the back side above the back panel, the neck seam along its top at
 * HOOD_TOP, the hood (laid open, its centre seam down the middle) hanging below it (hoodie.js buildHood).
 */
export const HOOD_TOP = 1.2;
const HOODIE = {
  ...TOP,
  // A long sleeve: past the shoulder seam, down to the wrist.
  sleeves: [[0.262, 0.15, 0.75, 0.76]],
  yoke: [[-0.26, 0.56, 0.26, 0.8]],
  sides: [[0.2, 0, 0.26, 0.55]],
  // The hood's piece, as its patterns are drawn: moved up onto it (texture.js paintZones).
  hood: [[-0.7, 0, 0.7, 0.8]],
};

/** The netball dress (garment.js): a women's dress, sleeveless, with a skirt (its own heights: the hem at 0, the
 *  shoulder seam at 0.88, the waist at 0.48). */
export const isDress = (kind) => kind === 'netball-dress';
const DRESS = {
  // The straps and the upper chest and back.
  yoke: [[-0.3, 0.72, 0.3, 0.95]],
  // The side panels: from the underarm down the bodice's and the skirt's sides.
  sides: [[0.17, 0, 0.36, 0.68]],
  hem: [[-0.36, 0, 0.36, 0.12]],
  body: [[-0.2, 0.12, 0.2, 0.72]],
};

// The varsity jacket (varsity.js): the hoodie's long sleeves, no hood.
const { hood: _hood, ...VARSITY_ZONES } = HOODIE;

const table = (kind) => (kind === 'shorts' ? SHORTS : isDress(kind) ? DRESS : isHoodie(kind) || isTrack(kind) ? HOODIE : kind === 'varsity' || kind === 'compression' ? VARSITY_ZONES : TOP);

/** Rectangles [x0, y0, x1, y1] for a zone, mirrored to both sides of the body. */
export function zoneRects(kind, zone) {
  const rects = table(kind)[zone] ?? [];
  return rects.flatMap(([x0, y0, x1, y1]) => (x0 >= 0 ? [[x0, y0, x1, y1], [-x1, y0, -x0, y1]] : [[x0, y0, x1, y1]]));
}

/** Which zone a garment point falls in (first match wins); `side` front or back (the pocket is only in front). */
export function zoneAt(kind, x, y, side) {
  if (hasPocket(kind) && side !== 'back' && onPocket(x, y)) return 'pocket';
  if (isHoodie(kind)) {
    if (side === 'back' && y > 0.8) return 'hood';
    if (side !== 'back' && onKangaroo(x, y, kind === 'ziphoodie')) return 'pocket';
  }
  // The track jacket's collar (or hood) piece, above the back panel on the atlas.
  if (isTrack(kind) && side === 'back' && y > 0.8) return 'hood';
  const order = kind === 'shorts' ? ['sides', 'hem', 'body'] : ['sleeves', 'yoke', 'sides', 'hem', 'body'];
  for (const zone of order) {
    if (zoneRects(kind, zone).some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) return zone;
  }
  return 'body';
}

// ---------- parts (task 9.134): the pieces a tap selects and the part panel edits (design.parts keys)
/** The parts of a top and of shorts. Left / right are the wearer's (+x on both sides of the print, as the pocket). */
export const TOP_PARTS = ['front', 'back', 'leftSleeve', 'rightSleeve', 'collar', 'sides', 'hem'];
export const SHORTS_PARTS = ['shortsFront', 'shortsBack', 'shortsSides', 'shortsHem', 'waistband'];
/** The garments whose collar or hood is a piece of its own on the back of the print (above y 0.8). */
const hoodPiece = (kind) => isHoodie(kind) || isTrack(kind);
/** Tops without sleeves: what their sleeve area holds is the body's. */
const sleeveless = (kind) => kind === 'singlet' || isDress(kind);
/** The garments with printed side panels (texture.js; shorts: the side stripes). The jackets have none. */
const panelled = (kind) => !isHoodie(kind) && !isTrack(kind) && kind !== 'varsity' && kind !== 'compression';

const quad = (p0, p1, p2, n = 12) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
});
/** One side panel as painted (texture.js), on the +x side: a top's, the dress's or the shorts' side stripe. */
function panelOutline(kind) {
  if (kind === 'shorts') return [[0.19, 0.43], [0.232, 0], [0.3, 0], [0.3, 0.43]];
  if (isDress(kind)) return [...quad([0.203, 0.69], [0.158, 0.52], [0.172, 0.4]), ...quad([0.172, 0.4], [0.196, 0.18], [0.252, -0.01]).slice(1), [0.4, -0.01], [0.4, 0.7]];
  return [...quad([0.262, 0.54], [0.215, 0.3], [0.23, 0]), [0.3, 0], [0.3, 0.54]];
}
const mirror = (poly) => poly.map(([x, y]) => [-x, y]).reverse();
/** The side panels (both sides) as outlines. */
const panels = (kind) => { const one = panelOutline(kind); return [one, mirror(one)]; };
const box = ([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The part at a garment point (its zone from zoneAt, its side, x and y); null on a hood (its own AREAS colours). */
export function partAt(kind, zone, side, x, y) {
  // A garment with painted side panels: only the panel itself is the side panels' part.
  if (zone === 'sides' && panelled(kind) && Number.isFinite(y) && !panels(kind).some((poly) => inPoly(x, y, poly))) {
    zone = zoneRects(kind, 'hem').some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1) ? 'hem' : 'body';
  }
  if (kind === 'shorts') return zone === 'sides' ? 'shortsSides' : zone === 'hem' ? 'shortsHem' : side === 'back' ? 'shortsBack' : 'shortsFront';
  if (zone === 'hood') return null;
  if (zone === 'sleeves' && !sleeveless(kind)) return x >= 0 ? 'leftSleeve' : 'rightSleeve';
  if (zone === 'sides' || zone === 'hem') return zone;
  return side === 'back' ? 'back' : 'front';
}

/**
 * Where a part is on one side of the print, in garment metres: outlines to keep (`keep`, their union) and groups of
 * outlines to cut out (`cut`, each group one zone that zoneAt checks before it); null when the part is not printed on
 * that side (the collar and the waistband are 3D rib, not print). On a garment with painted side panels the panels are
 * the side panels' part, and the body and hem run on under them (the panels are painted over them).
 */
export function partRegion(kind, key, back) {
  const R = (zone) => zoneRects(kind, zone).map(box);
  const ALL = [box([-1.6, -0.2, 1.6, 1.6])];
  const half = (rects, sign) => rects.filter(([x0, , x1]) => (sign > 0 ? x0 >= 0 : x1 <= 0)).map(box);
  const sides = panelled(kind) ? [] : R('sides');
  if (kind === 'shorts') {
    if (key === 'shortsSides') return { keep: panels(kind), cut: [] };
    if (key === 'shortsHem') return { keep: R('hem'), cut: [] };
    if (key === (back ? 'shortsBack' : 'shortsFront')) return { keep: ALL, cut: [R('hem')] };
    return null;
  }
  // Pieces of their own above the body on the print: a hood or track collar (back), the varsity's rib pieces (both).
  const hood = hoodPiece(kind) && back ? [[box([-1.6, 0.8, 1.6, 1.6])]] : kind === 'varsity' ? [[box([-1.6, 0.81, 1.6, 1.6])]] : [];
  if (key === 'leftSleeve' || key === 'rightSleeve') {
    if (sleeveless(kind)) return null;
    const keep = half(zoneRects(kind, 'sleeves'), key === 'leftSleeve' ? 1 : -1);
    return keep.length ? { keep, cut: [] } : null;
  }
  if (key === 'sides') return panelled(kind) ? { keep: panels(kind), cut: [] } : { keep: R('sides'), cut: [R('sleeves'), R('yoke'), ...hood] };
  if (key === 'hem') return { keep: R('hem'), cut: [R('sleeves'), R('yoke'), sides, ...hood] };
  // (A sleeveless top's sleeve area is its body's.)
  if (key === (back ? 'back' : 'front')) return { keep: ALL, cut: [sleeveless(kind) ? [] : R('sleeves'), sides, R('hem'), ...hood] };
  return null;
}
