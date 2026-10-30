import { sockPartAt, sockRegion } from './sockprint.js';
import { skirtPartAt, skirtRegion, skirtZones } from './skirtprint.js';
import { capPartAt, capRegion } from './capprint.js';
import { hatPartAt, hatRegion } from './hatprint.js';
import { bballPartAt, bballRegion, bballZoneAt, BBALL_ZONES } from './bballprint.js';
import { SHOOT_ZONES } from './shootingshirt.js';

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
// (FN4 2026-10-30: fitted to the shorter, wider shorts: the hem area the bottom 6 cm.)
const SHORTS = {
  sides: [[0.2, 0, 0.34, 0.37]],
  hem: [[-0.34, 0, 0.34, 0.06]],
  body: [[-0.2, 0.06, 0.2, 0.37]],
};

export const ZONE_NAMES = { body: 'Chest & body', yoke: 'Shoulders', sleeves: 'Sleeves', sides: 'Side panels', hem: 'Hem', pocket: 'Chest pocket', hood: 'Hood' };

/**
 * The pocket polo's chest pocket (pool and darts shirts): a patch pocket sewn on the wearer's left chest (+x on the
 * front), in garment metres: its sides, top and bottom, the bottom corners' radius and the depth of its top hem.
 * The 3D pocket (garment.js), its print and stitching (texture.js) and its colour zone all use it.
 */
// (FN6 2026-10-30, the Darts shirt picture: the pocket higher, wider towards the zip and shallower.)
export const POCKET = { x0: 0.032, x1: 0.167, top: 0.635, bottom: 0.52, corner: 0.012, hem: 0.022 };

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
  // The side panels: from the underarm down the bodice's and the skirt's sides (its hem 0.405 out at the sides).
  sides: [[0.17, 0, 0.45, 0.68]],
  hem: [[-0.45, 0, 0.45, 0.12]],
  body: [[-0.2, 0.12, 0.2, 0.72]],
};

// The varsity jacket (varsity.js): the hoodie's long sleeves, no hood.
const { hood: _hood, ...VARSITY_ZONES } = HOODIE;

// The socks (sockprint.js): one area, the whole sock (its parts are its band, hoops, heel and toe).
const SOCKS = { body: [[-0.3, 0, 0.3, 0.7]] };

// The cap (capprint.js): one area, the whole cap (its parts are its brim, piping and side sweeps).
const CAP = { body: [[-0.3, 0, 0.3, 0.3]] };

// The American football jersey (garment.js SPECS.nfljersey): its Shoulders area is the cap over each shoulder pad (the
// client's Game Jersey picture), from the shoulder seam over the top of the sleeve, edged with piping (texture.js
// paintNflTrims); the side panels come further round onto the front (NFL_PANEL).
// FX3: the cap is a patch over the shoulder pad only, as in the picture: it ends part way along the sleeve, so the rest of
// the sleeve (down to the cuff) stays black. The side area stops under the arm (the sleeve's underside stays black).
export const NFL_CAP = [[0.17, 0.8], [0.17, 0.745], [0.205, 0.68], [0.24, 0.626], [0.258, 0.613], [0.3, 0.6], [0.33, 0.66], [0.35, 0.8]];
const NFL = { ...TOP, yoke: [[0.17, 0.56, 0.35, 0.8]], sides: [[0.2, 0, 0.3, 0.5]] };
/** A zone's own outlines (+x side and mirrored) where it is not a rectangle; null when its rectangles are its shape. */
// The compression top's side panel (the client's picture): its inner edge runs straight up from the hem, then curves out
// and narrows into the raglan piping at the underarm, so the panel goes on from the piping (no flat top across the side
// of the chest: FM 2026-10-30). Its outer side runs on past the side seam.
// (FM print 2026-10-30: a little narrower across the chest, its inner edge 6 mm further out from 36 to 46 cm up.)
// (Round 2: the panel's top is a point on the front of the armpit where the raglan piping (COMPRESSION_PIPING) comes down
// into its inner edge, one unbroken line as in the picture; above it, under the arm, black. It used to meet the piping in
// the armpit's pinch, where it showed as a cyan blob.)
export const COMPRESSION_PANEL = [[0.15, -0.01], [0.15, 0.3], [0.156, 0.36], [0.163, 0.42], [0.172, 0.46], [0.18, 0.5], [0.196, 0.492], [0.225, 0.476], [0.27, 0.462], [0.27, -0.01]];
/**
 * The compression top's raglan piping (texture.js), right half [x, y] on the flat pattern: from the collar it runs down
 * beside it, out over the front of the shoulder and down the front of the armpit into the side panel's inner edge (its
 * last point is the panel's top), as on the client's picture (FM 2026-10-30). Drawn smooth through these points.
 */
export const COMPRESSION_PIPING = [[0.088, 0.738], [0.087, 0.715], [0.09, 0.7], [0.104, 0.688], [0.146, 0.669], [0.186, 0.635], [0.208, 0.58], [0.216, 0.556], [0.208, 0.536], [0.193, 0.516], [0.18, 0.5]];
export function zonePolys(kind, zone) {
  if (kind === 'nfljersey' && zone === 'yoke') return [NFL_CAP, NFL_CAP.map(([x, y]) => [-x, y]).reverse()];
  if (kind === 'compression' && zone === 'sides') return [COMPRESSION_PANEL, COMPRESSION_PANEL.map(([x, y]) => [-x, y]).reverse()];
  if (kind === 'shorts' && zone === 'sides') return panels(kind);
  // (The shooting shirt's raglan sleeves and side panels: its own outlines, shootingshirt.js SHOOT_ZONES.)
  if (ownOutline(kind, zone)) return zoneOutlines(kind, zone);
  return null;
}

// The skirt (skirtprint.js): its body, side panels and hem.
// The compression top: the varsity's long sleeves; wide side panels from the armpit to the hem, seen from the front
// (the client's picture; CF1 2026-10-29).
// (DT4: a little wider, as the picture's.)
// (CF1: its sleeves reach further, to just below the hem.)
const COMPRESSION = { ...VARSITY_ZONES, sleeves: [[0.262, 0.1, 0.8, 0.76]], sides: [[0.15, 0, 0.27, 0.56]] };

// The bucket hat (hatprint.js): one area, the whole hat (its parts are its top, brim, underside and binding).
const HAT = { body: [[-0.3, 0, 0.3, 0.36]] };

const table = (kind) => (kind === 'bballshorts' ? BBALL_ZONES : kind === 'skirt' ? skirtZones() : kind === 'nfljersey' ? NFL : kind === 'bucket-hat' ? HAT : kind === 'cap' ? CAP : kind === 'socks' ? SOCKS : kind === 'shorts' ? SHORTS : isDress(kind) ? DRESS : isHoodie(kind) || isTrack(kind) ? HOODIE : kind === 'varsity' ? VARSITY_ZONES : kind === 'compression' ? COMPRESSION : TOP);

/**
 * A garment's areas that are not rectangles: outlines on the wearer's left (+x), mirrored (the shooting shirt's raglan
 * sleeves, up to the collar along the raglan seam, and its side panels). Every other area is its rectangles.
 */
// The tee's and the raglan's sleeve (FN5 2026-10-30, the client's tee pictures): the raglan piece from the collar along the
// raglan seam (layout-warp.js RAGLAN / raglanSeam: from [0.06, 0.728] by [0.17, 0.645] to the underarm [0.258, 0.53])
// out to the cuff, so the sleeve colour fills it up to the neck (no black triangle at the shoulder).
const RAGLAN_SLEEVE = [[0.06, 0.9], ...Array.from({ length: 25 }, (_, k) => {
  const t = k / 24, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
  return [a * 0.06 + b * 0.17 + c * 0.258, a * 0.728 + b * 0.645 + c * 0.53];
}), [0.27, 0.44], [0.9, 0.44], [0.9, 0.9]];
const ownOutline = (kind, zone) => (kind === 'shooting-shirt' ? SHOOT_ZONES[zone] ?? null : (kind === 'tee' || kind === 'raglan') && zone === 'sleeves' ? RAGLAN_SLEEVE : null);
/** A zone's outlines (both sides): its own, else its rectangles as outlines. */
export function zoneOutlines(kind, zone) {
  const own = ownOutline(kind, zone);
  if (own) return [own, own.map(([x, y]) => [-x, y]).reverse()];
  return zoneRects(kind, zone).map(([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
}

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
  if (kind === 'socks' || kind === 'cap' || kind === 'bucket-hat') return 'body';
  // The basketball shorts' areas follow their slanted side panels (bballprint.js).
  if (kind === 'bballshorts') return bballZoneAt(x, y);
  // The football jersey's shoulder caps lie over the sleeves' tops: they come first.
  if (zonePolys(kind, 'yoke')?.some((poly) => inPoly(x, y, poly))) return 'yoke';
  const order = kind === 'shorts' ? ['sides', 'hem', 'body'] : ['sleeves', 'yoke', 'sides', 'hem', 'body'];
  for (const zone of order) {
    if (zone === 'yoke' && zonePolys(kind, zone)) continue;
    if (ownOutline(kind, zone) ? zoneOutlines(kind, zone).some((poly) => inPoly(x, y, poly)) : zoneRects(kind, zone).some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) return zone;
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
/** The garments with printed side panels (texture.js; shorts: the side stripes). The jackets have none; the shooting
 *  shirt's side panels are an area of its own (its outline, SHOOT_ZONES). */
const panelled = (kind) => !isHoodie(kind) && !isTrack(kind) && kind !== 'varsity' && kind !== 'compression' && kind !== 'shooting-shirt';

const quad = (p0, p1, p2, n = 12) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
});
/** One side panel as painted (texture.js), on the +x side: a top's, the dress's or the shorts' side stripe. */
function panelOutline(kind) {
  // (FN4 2026-10-30: an even stripe about 5.5 cm in from the flared side seam, as on the shorts pictures.)
  if (kind === 'shorts') return [[0.16, 0.37], [0.181, 0.27], [0.207, 0.17], [0.231, 0.095], [0.245, 0.035], [0.247, -0.01], [0.36, -0.01], [0.36, 0.37]];
  if (isDress(kind)) return [...quad([0.21, 0.69], [0.175, 0.52], [0.19, 0.4]), ...quad([0.19, 0.4], [0.215, 0.18], [0.31, -0.01]).slice(1), [0.5, -0.01], [0.5, 0.7]];
  if (kind === 'nfljersey') return NFL_PANEL;
  return [...quad([0.262, 0.54], [0.215, 0.3], [0.23, 0]), [0.3, 0], [0.3, 0.54]];
}
/** The football jersey's side panel (+x side), as painted (texture.js): from the underarm, its inner edge well round
 *  onto the front, so from the front it shows as wide as on the client's Game Jersey picture (FX3: about 7 % of the
 *  body's half-width just under the arm, about 12 % at the waist, 18 % at the hem; the body turns away beyond x 0.19). */
export const NFL_PANEL = [...quad([0.258, 0.53], [0.172, 0.51], [0.166, 0.4]), ...quad([0.166, 0.4], [0.15, 0.2], [0.144, 0]).slice(1), [0.3, 0], [0.3, 0.5]];
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
  if (kind === 'skirt') return skirtPartAt(side, x, y);
  if (kind === 'bballshorts') return bballPartAt(side, x, y);
  // A garment with painted side panels: only the panel itself is the side panels' part.
  if (zone === 'sides' && panelled(kind) && Number.isFinite(y) && !panels(kind).some((poly) => inPoly(x, y, poly))) {
    zone = zoneRects(kind, 'hem').some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1) ? 'hem' : 'body';
  }
  if (kind === 'socks') return sockPartAt(side, x, y);
  if (kind === 'cap') return capPartAt(side, x, y);
  if (kind === 'bucket-hat') return hatPartAt(side, x, y);
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
  if (kind === 'skirt') return skirtRegion(key, back);
  if (kind === 'bballshorts') return bballRegion(key, back);
  const R = (zone) => (ownOutline(kind, zone) ? zoneOutlines(kind, zone) : zoneRects(kind, zone).map(box));
  const ALL = [box([-1.6, -0.2, 1.6, 1.6])];
  const half = (rects, sign) => rects.filter(([x0, , x1]) => (sign > 0 ? x0 >= 0 : x1 <= 0)).map(box);
  if (kind === 'socks') return sockRegion(key, back);
  if (kind === 'cap') return capRegion(key, back);
  if (kind === 'bucket-hat') return hatRegion(key, back);
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
    const keep = ownOutline(kind, 'sleeves') ? zoneOutlines(kind, 'sleeves').filter((poly) => Math.sign(poly[0][0]) === (key === 'leftSleeve' ? 1 : -1)) : half(zoneRects(kind, 'sleeves'), key === 'leftSleeve' ? 1 : -1);
    return keep.length ? { keep, cut: [] } : null;
  }
  if (key === 'sides') return panelled(kind) ? { keep: panels(kind), cut: [] } : { keep: R('sides'), cut: [R('sleeves'), R('yoke'), ...hood] };
  if (key === 'hem') return { keep: R('hem'), cut: [R('sleeves'), R('yoke'), sides, ...hood] };
  // (A sleeveless top's sleeve area is its body's.)
  if (key === (back ? 'back' : 'front')) return { keep: ALL, cut: [sleeveless(kind) ? [] : R('sleeves'), sides, R('hem'), ...hood] };
  return null;
}
