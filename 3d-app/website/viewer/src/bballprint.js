// The basketball shorts' print (COMING SOON item 7, 2026-10-29; bballshorts.js is their cut), laid out as the client's
// tile picture (media/showroom/garment-basketball-shorts.webp): a wide side panel down each side of the front and the
// back in the trim colour (Secondary), a royal blue band slanting across it at mid-thigh (lowest at the side seam), the
// panel shading into that blue under the band towards the hem, and a thin piping strip sewn in between the body and the
// panel along its inner edge. The waistband and the leg hems are the body's colour. The 3DEEZI "3" mark with the
// wordmark under it on the wearer's right leg, above the hem. Garment metres: the hem at 0, x across the flat panel
// (+ the wearer's left, on the back as in front). Kept apart so a professional model's own print can replace it;
// texture.js and zones.js call in here for kind 'bballshorts'.

/** The cut (metres, the hem at 0): the waist's height, the crotch's and the waistband's depth. */
// (FN4 2026-10-30, the user: the crotch 40 % down from the waistband's top, the legs' inner gap 60 % of the height, as
// the picture's; was 0.259, 55 % down.)
// (FN6 2026-10-30, DT8: the band 4.2 cm, one flat gathered piece, as the picture.)
export const BB = { waist: 0.57, crotch: 0.342, band: 0.042 };
/** The side seam [y, x], from the hem's outer corner up to the waist: the flat panel's outer edge, flaring to the hem. */
export const BB_SIDE = [[0, 0.375], [0.07, 0.366], [0.144, 0.352], [0.2, 0.338], [0.259, 0.318], [0.3, 0.303], [0.374, 0.28], [0.44, 0.258], [0.515, 0.234], [0.545, 0.224], [BB.waist, 0.215]];
/** The inner leg seam [y, x], from the hem's inner corner up to the crotch. */
export const BB_INNER = [[0.012, 0.035], [0.066, 0.03], [0.145, 0.022], [0.224, 0.013], [0.297, 0.005], [BB.crotch, 0]];
/**
 * The side panel on each piece (front and back) of each side: its width in from the side seam at the waist and at the
 * hem, the piping strip along its inner edge (on the body's side of it), the band's lower and upper edges at the side
 * seam (each rising `rise` towards the panel's inner edge) and the hem part's depth.
 */
export const BB_PANEL = { top: 0.045, hem: 0.058, piping: 0.008, band: [0.195, 0.313], rise: 0.028, hemBand: 0.03 };
/** The printed parts (design.parts keys): the legs' front and back, the side panels, their band and piping, the hems. */
export const BBALL_PARTS = ['shortsFront', 'shortsBack', 'shortsSides', 'shortsBand', 'shortsPiping', 'shortsHem'];
/** The marks' places: the crest ("3" mark) with the club's word under it on the wearer's right leg; the number on the left leg. */
export const BB_CREST = { side: 'front', x: -0.21, y: 0.08 };
export const BB_WORD = { side: 'front', x: -0.21, y: 0.049 };
export const BB_NUMBER = { side: 'front', x: 0.21, y: 0.075 };

const HEX = /^#[0-9a-f]{6}$/i;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
function along(pairs, y) {
  if (y <= pairs[0][0]) return pairs[0][1];
  for (let i = 1; i < pairs.length; i++) {
    if (y <= pairs[i][0]) { const [y0, x0] = pairs[i - 1], [y1, x1] = pairs[i]; return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0); }
  }
  return pairs.at(-1)[1];
}
/** The side seam's x at a height. */
export const sideX = (y) => along(BB_SIDE, y);
/** The side panel's width at a height (from the side seam in), and its inner edge's x. */
const panelW = (y) => BB_PANEL.hem + (BB_PANEL.top - BB_PANEL.hem) * clamp01(y / BB.waist);
const innerX = (y) => sideX(y) - panelW(y);
/** Beyond the side seam (the garment's outline clips what is painted there). */
const FAR = 0.75, TOP = BB.waist + 0.04, FOOT = -0.03;
const heights = (y0, y1, n = 28) => Array.from({ length: n + 1 }, (_, i) => y0 + ((y1 - y0) * i) / n);

/** A band edge across the panel: from the panel's inner edge (rising `rise` above y0) out to the side seam (at y0). */
function bandEdge(y0) {
  const pts = [];
  for (let k = 16; k >= 0; k--) {
    const t = k / 16, y = y0 + BB_PANEL.rise * t;
    pts.push([sideX(y) - t * panelW(y), y]);
  }
  return pts;
}
/** The outlines on the +x side (y up): the panel (with its band, out past the side seam), the piping, the band, the
 *  panel under the band, the hem part. */
const SHAPES = (() => {
  const ys = heights(FOOT, TOP);
  const [b0, b1] = BB_PANEL.band;
  const lowerTop = bandEdge(b0);
  return {
    panel: [...ys.map((y) => [innerX(y), y]), [FAR, TOP], [FAR, FOOT]],
    piping: [...ys.map((y) => [innerX(y) - BB_PANEL.piping, y]), ...ys.slice().reverse().map((y) => [innerX(y) + 0.0004, y])],
    band: [...bandEdge(b1), [FAR, b1], [FAR, b0], ...bandEdge(b0).reverse()],
    lower: [...lowerTop, [FAR, b0], [FAR, FOOT], ...heights(FOOT, b0 + BB_PANEL.rise, 12).map((y) => [innerX(y) - 0.0004, y])],
    hem: [[-FAR, FOOT], [FAR, FOOT], [FAR, BB_PANEL.hemBand], [-FAR, BB_PANEL.hemBand]],
  };
})();
const mirror = (poly) => poly.map(([x, y]) => [-x, y]).reverse();
/** A shape on both sides of the body. */
const both = (name) => (name === 'hem' ? [SHAPES.hem] : [SHAPES[name], mirror(SHAPES[name])]);

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inAny = (name, x, y) => both(name).some((poly) => inPoly(x, y, poly));

/** The part at a print point (zones.js partAt for the basketball shorts). */
export function bballPartAt(side, x, y) {
  if (y < BB_PANEL.hemBand) return 'shortsHem';
  if (inAny('piping', x, y)) return 'shortsPiping';
  if (inAny('band', x, y)) return 'shortsBand';
  if (inAny('panel', x, y)) return 'shortsSides';
  return side === 'back' ? 'shortsBack' : 'shortsFront';
}

/** The pattern area at a print point (zones.js zoneAt): the side panels (with their piping), the leg hems, the body. */
export function bballZoneAt(x, y) {
  if (inAny('panel', x, y) || inAny('piping', x, y)) return 'sides';
  return y < BB_PANEL.hemBand ? 'hem' : 'body';
}

/** A part's region on one side (zones.js partRegion's shape: outlines to keep, groups to cut out). */
export function bballRegion(key, back) {
  const ALL = [[-1.6, -0.2], [1.6, -0.2], [1.6, 1.6], [-1.6, 1.6]];
  const hem = both('hem');
  if (key === 'shortsHem') return { keep: hem, cut: [] };
  if (key === 'shortsPiping') return { keep: both('piping'), cut: [hem] };
  if (key === 'shortsBand') return { keep: both('band'), cut: [hem] };
  if (key === 'shortsSides') return { keep: both('panel'), cut: [both('band'), hem] };
  if (key === (back ? 'shortsBack' : 'shortsFront')) return { keep: [ALL], cut: [both('panel'), both('piping'), hem] };
  return null;
}

/** The pattern areas' rectangles (zones.js zoneRects; their own outlines are traced by bballZonePath). */
export const BBALL_ZONES = { sides: [[0.14, -0.01, 0.4, 0.6]], hem: [[-0.4, -0.01, 0.4, BB_PANEL.hemBand]], body: [[-0.3, BB_PANEL.hemBand, 0.3, 0.6]] };

/** Traces a pattern area (texture.js paintZones): the side panels with their piping, the leg hems, or the body between. */
export function bballZonePath(g, zone) {
  const ys = heights(BB_PANEL.hemBand, TOP);
  const polys = zone === 'sides' ? [...both('panel'), ...both('piping')]
    : zone === 'hem' ? both('hem')
    : zone === 'body' ? [[...ys.map((y) => [innerX(y) - BB_PANEL.piping, y]), ...ys.slice().reverse().map((y) => [-(innerX(y) - BB_PANEL.piping), y])]]
    : [];
  for (const poly of polys) {
    poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  }
}

const rgb = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
/** A deeper shade of a colour (the band's own when none is chosen): darker and a little richer. */
export function deeper(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  const L = l * 0.62, S = Math.min(1, s * 1.08 + 0.04);
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q;
  const hue = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return '#' + [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
function trace(g, poly) {
  g.beginPath();
  poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}
const BIG = [-1.6, -0.2, 3.2, 1.8];

/**
 * One side's print over the kit's colour and pattern (texture.js has painted those, clipped to the outline): the parts'
 * own looks; on each side the panel in the trim colour (or its own look), the band, the shading under the band, the
 * piping; the hems' own look; the body's colour under the 3D waistband.
 */
export function paintBball(painter, design, back, trim) {
  const g = painter.ctx;
  painter.paintParts(design, back, { skip: ['shortsSides', 'shortsBand', 'shortsPiping', 'shortsHem'] });
  const sides = painter.partStyle(design, 'shortsSides'), bandStyle = painter.partStyle(design, 'shortsBand'), pipeStyle = painter.partStyle(design, 'shortsPiping');
  const panelHex = sides?.own ?? (HEX.test(design.secondary ?? '') ? design.secondary : '#16b4f0');
  const bandHex = bandStyle?.own ?? (HEX.test(design.zoneColors?.bballBand ?? '') ? design.zoneColors.bballBand : deeper(panelHex));
  const [b0] = BB_PANEL.band, rise = BB_PANEL.rise;
  for (const dir of [-1, 1]) {
    const M = (poly) => (dir > 0 ? poly : mirror(poly));
    // The panel: the trim colour, or its own look.
    g.save();
    trace(g, M(SHAPES.panel));
    g.clip();
    g.fillStyle = sides?.own ?? trim;
    g.fillRect(...BIG);
    if (sides) painter.paintPartLook(design, sides, painter.partBox('shortsSides', back), trim);
    // Under the band the panel shades into the band's blue towards the hem, in lines parallel to the band's edges.
    g.save();
    trace(g, M(SHAPES.lower));
    g.clip();
    const pw = BB_PANEL.hem, len = Math.hypot(rise, pw), nx = (dir * rise) / len, ny = pw / len;
    const x0 = dir * (sideX(0) - pw / 2), reach = (b0 + rise / 2) * ny;
    const shade = g.createLinearGradient(x0, 0, x0 + nx * reach, ny * reach);
    shade.addColorStop(0, rgba(bandHex, 0.82));
    shade.addColorStop(0.55, rgba(bandHex, 0.56));
    shade.addColorStop(1, rgba(bandHex, 0.3));
    g.fillStyle = shade;
    g.fillRect(...BIG);
    g.restore();
    // The band.
    g.save();
    trace(g, M(SHAPES.band));
    g.clip();
    g.fillStyle = bandHex;
    g.fillRect(...BIG);
    if (bandStyle) painter.paintPartLook(design, bandStyle, painter.partBox('shortsBand', back), bandHex);
    g.restore();
    g.restore();
    // The piping: the panel's colour (it stands out against the body and the shaded lower panel), or its own.
    g.save();
    trace(g, M(SHAPES.piping));
    g.clip();
    g.fillStyle = pipeStyle?.own ?? sides?.own ?? trim;
    g.fillRect(...BIG);
    if (pipeStyle) painter.paintPartLook(design, pipeStyle, painter.partBox('shortsPiping', back), pipeStyle.own ?? panelHex);
    g.restore();
  }
  // The leg hems: the body's colour (as the picture), or their own look.
  const hemStyle = painter.partStyle(design, 'shortsHem');
  if (hemStyle) {
    g.save();
    if (painter.clipPart('shortsHem', back)) painter.paintPartLook(design, hemStyle, painter.partBox('shortsHem', back), painter.baseFill(design));
    g.restore();
  }
  // Under the 3D waistband: its colour (the body's, as the picture, unless it has its own).
  painter.side(back);
  g.fillStyle = painter.partStyle(design, 'waistband')?.own ?? design.main;
  g.fillRect(-0.8, BB.waist - BB.band - 0.004, 1.6, BB.band + 0.05);
  painter.side(back);
}

/**
 * How the shorts are sewn (painted stitching and relief): the leg hems (two rows of cover-stitch, the turned-up edge),
 * the waistband's foot, the piping sewn in between the body and the panel (a seam either side, top-stitched on the
 * body's side), and the centre seam from the waistband down to the crotch, in front and behind.
 */
export function bballTailoring(painter) {
  const stitches = [], seams = [], folds = [];
  const along = (points) => (c) => points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  for (const { points } of painter.edges()) {
    stitches.push(along(painter.inset(points, 0.0115)), along(painter.inset(points, 0.0147)));
    folds.push(along(painter.inset(points, 0.019, 0.006)));
  }
  const waistSeam = BB.waist - BB.band - 0.0012;
  stitches.push((c) => { c.moveTo(-0.5, waistSeam); c.lineTo(0.5, waistSeam); });
  const ys = heights(0.004, waistSeam - 0.002, 40);
  const line = (dx) => (dir) => (c) => ys.forEach((y, i) => { const x = dir * (innerX(y) + dx); i ? c.lineTo(x, y) : c.moveTo(x, y); });
  for (const dir of [-1, 1]) {
    seams.push(line(-BB_PANEL.piping)(dir), line(0)(dir));
    stitches.push(line(-BB_PANEL.piping - 0.0028)(dir));
  }
  seams.push((c) => { c.moveTo(0, waistSeam); c.lineTo(0, BB.crotch + 0.01); });
  stitches.push((c) => { c.moveTo(0.0032, waistSeam - 0.002); c.lineTo(0.0032, BB.crotch + 0.03); });
  return { stitches, seams, folds };
}

/**
 * The marks: the crest on the wearer's right leg above the hem (the club's logo, or the 3DEEZI "3" mark), the club's word
 * under it (the default 3DEEZI is the brand wordmark), the number on the left leg. Each can be moved, resized or hidden.
 */
export async function paintBballMarks(painter, design, logo, textOutline, loadImage) {
  const layers = design.layers ?? [];
  const ownArt = layers.some((l) => l.part === 'shorts' && l.side !== 'back' && l.type !== 'text' && !String(l.id ?? '').startsWith('kit-'));
  const crest = design.logoImage || null;
  if (crest !== painter._logoKey) {
    painter._logo = crest ? await loadImage(crest).catch(() => null) : null;
    painter._logoKey = crest;
  }
  if (painter._logo) painter.markImage(design, 'crest', BB_CREST, painter._logo, 0.058, 0.046);
  else if (!ownArt) painter.markShield(design, 'crest', BB_CREST, [[0, 0.019], [0.016, 0.011], [0.012, -0.011], [0, -0.019], [-0.012, -0.011], [-0.016, 0.011]], 0.022, 0.03);
  painter.markText(design, 'wordmark', BB_WORD, logo, 0.019, design.accent, 0.08, textOutline);
  painter.markText(design, 'number', BB_NUMBER, String(design.number ?? '23'), 0.075, design.accent, 0.12, textOutline);
}
