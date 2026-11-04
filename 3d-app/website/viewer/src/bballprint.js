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
// (BSF 2026-11-04, client pictures 418-420: longer, to about the knee, the crotch 57 % down (a deep rise), each leg
// hanging straight down, the hem's outer corner cut back to a V split at the side.)
// (BSF r3, 419 / 431: the waistband about 6 % of the height, front and back: 2.9 cm, 3.8 cm showing with its rolled top.)
export const BB = { waist: 0.63, crotch: 0.271, band: 0.029 };
/** The side seam [y, x], from the hem's outer corner up to the waist: the flat panel's outer edge, flaring to the hem. */
// (FN9 2026-11-02, the user: from the waist to the hem the outer side is ONE straight line, as the picture, no bulge at
// the hips: above the crotch the seam is that line over the hips' ellipse (3D half-width 0.7354 x flat), the waist 5 % wider.)
export const BB_SIDE = [[0, 0.313], [0.07, 0.313], [0.2, 0.315], [BB.crotch, 0.32], [0.34, 0.316], [0.42, 0.308], [0.5, 0.294], [0.55, 0.284], [0.58, 0.276], [0.61, 0.264], [BB.waist, 0.256]];
/** The V split at the side of each leg's hem: the hem's outer corner (x at y 0) and how high the split rises. */
// (BSF r2, BST -241: a taller, narrower V, 12 % of the height as 420; the panels open along it: bballshorts.js split.)
export const BB_SPLIT = { x: 0.257, y: 0.075 };
/** The inner leg seam [y, x], from the hem's inner corner up to the crotch. */
export const BB_INNER = [[0.012, 0.042], [0.066, 0.036], [0.145, 0.024], [0.224, 0.009], [BB.crotch, 0]];
/**
 * The side panel on each piece (front and back) of each side: its width in from the side seam at the waist and at the
 * hem, the piping strip along its inner edge (on the body's side of it), the band's lower and upper edges at the side
 * seam (each rising `rise` towards the panel's inner edge) and the hem part's depth.
 */
// (FN10 2026-11-02, tester DT10: from the front the panel showed half the picture's width: it reaches further in.)
export const BB_PANEL = { top: 0.06, hem: 0.076, piping: 0.008, band: [0.235, 0.36], rise: 0.028, hemBand: 0.03 };
/** The printed parts (design.parts keys): the legs' front and back, the side panels, their band and piping, the hems. */
export const BBALL_PARTS = ['shortsFront', 'shortsBack', 'shortsSides', 'shortsBand', 'shortsPiping', 'shortsHem'];
/** The marks' places: the crest ("3" mark) with the club's word under it on the wearer's right leg; the number on the left leg. */
export const BB_CREST = { side: 'front', x: -0.18, y: 0.125 };
export const BB_WORD = { side: 'front', x: -0.18, y: 0.094 };
export const BB_NUMBER = { side: 'front', x: 0.18, y: 0.12 };

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

/** The hem stripes [colour key, from, to] (metres up from the hem's edge): trim 1 above, trim 2 along the edge. */
// (BSF r3, 419 / 431: the upper stripe 2.7-3.9 cm up, the edge binding 1.05 cm.)
export const BB_TRIMS = [['bballTrim1', 0.027, 0.039], ['bballTrim2', 0, 0.0105]];
/** A hem stripe on both legs: `d0`-`d1` above the hem's edge, which runs level and then up the V split's edge to the
 *  side seam (so each stripe bends up along the V, keeping its height: BSF r2, the stripes' peak 18 % up as 420). */
export function trimBand(d0, d1) {
  const top = sideX(BB_SPLIT.y) + 0.002, lo = d0 > 0 ? d0 : -0.02;
  const edge = (d) => [[BB_SPLIT.x, d], [top, BB_SPLIT.y + d]];
  const poly = [[0, lo], ...(d0 > 0 ? edge(d0) : [[BB_SPLIT.x + 0.1, lo], [top, lo]]), ...edge(d1).reverse(), [0, d1]];
  return [poly, mirror(poly)];
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
  // The two hem stripes round each leg, running up both edges of the V split (BSF 2026-11-04, client 419 / 420): trim 1
  // above, trim 2 at the hem's edge (design.zoneColors.bballTrim1 / bballTrim2; unset, the Secondary colour).
  for (const [key, d0, d1] of BB_TRIMS) {
    const own = design.zoneColors?.[key];
    g.fillStyle = HEX.test(own ?? '') ? own : HEX.test(design.secondary ?? '') ? design.secondary : '#ffffff';
    for (const poly of trimBand(d0, d1)) { trace(g, poly); g.fill(); }
  }
  // Under the 3D waistband: its colour (the body's, as the picture, unless it has its own).
  painter.side(back);
  g.fillStyle = painter.partStyle(design, 'waistband')?.own ?? design.main;
  g.fillRect(-0.8, BB.waist - BB.band - 0.004, 1.6, BB.band + 0.05);
  painter.side(back);
}

/**
 * Just outside the outline, before the print (texture.js paint, unclipped): the colours that meet each edge carried a
 * little past it, so where the side seam, the V split and the hem's edge are drawn the texture's filtering blends in
 * the panel, band and stripe colours instead of the body's (BSF r3, 420: no dark line down the side seam).
 */
export function bballBleed(painter, design, back) {
  const g = painter.ctx;
  const sides = painter.partStyle(design, 'shortsSides'), bandStyle = painter.partStyle(design, 'shortsBand');
  const panelHex = sides?.own ?? (HEX.test(design.secondary ?? '') ? design.secondary : '#16b4f0');
  const bandHex = bandStyle?.own ?? (HEX.test(design.zoneColors?.bballBand ?? '') ? design.zoneColors.bballBand : deeper(panelHex));
  const trimHex = (key) => (HEX.test(design.zoneColors?.[key] ?? '') ? design.zoneColors[key] : HEX.test(design.secondary ?? '') ? design.secondary : '#ffffff');
  const [b0, b1] = BB_PANEL.band, apex = BB_SPLIT.y, top = sideX(apex), out = 0.016;
  const strip = (y0, y1) => [...heights(y0, y1, 12).map((y) => [sideX(y) - 0.0005, y]), ...heights(y0, y1, 12).reverse().map((y) => [sideX(y) + out, y])];
  g.save();
  painter.side(back);
  const fill = (poly, style) => { g.fillStyle = style; for (const p of [poly, mirror(poly)]) { trace(g, p); g.fill(); } };
  fill(strip(apex, BB.waist), panelHex);
  fill(strip(apex, b0), rgba(bandHex, 0.56));
  fill(strip(b0, b1), bandHex);
  const [[, d0, d1], [, e0, e1]] = BB_TRIMS;
  fill(strip(apex + d0, apex + d1), trimHex('bballTrim1'));
  // The V split and the hem's edge: the edge binding's colour.
  fill([[BB_SPLIT.x + 0.0004, 0], [BB_SPLIT.x + 0.0004, -0.03], [top + out, -0.03], [top + out, apex + e1], [top - 0.0005, apex + e1], [top - 0.0005, apex]], trimHex('bballTrim2'));
  g.fillStyle = trimHex('bballTrim2');
  g.fillRect(-FAR, -0.03, 2 * FAR, 0.03 + e0);
  g.restore();
}

/**
 * How the shorts are sewn (painted stitching and relief): the leg hems (two rows of cover-stitch, the turned-up edge),
 * the waistband's foot with the fine elastic gathers just under it, and the centre seam from the waistband down to the
 * crotch, in front and behind. (BSF r3, 419 / 431: the side panels and their piping are printed, no sewn seams down the
 * legs: those read as creases.)
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
  seams.push((c) => { c.moveTo(0, waistSeam); c.lineTo(0, BB.crotch + 0.01); });
  stitches.push((c) => { c.moveTo(0.0032, waistSeam - 0.002); c.lineTo(0.0032, BB.crotch + 0.03); });
  // The elastic's fine gathers in the cloth just under the band: short soft puckers about 5 mm apart, of uneven length.
  const relief = (g) => {
    g.save();
    g.lineCap = 'round';
    for (let x = -0.4, k = 0; x <= 0.4; x += 0.005, k++) {
      const len = 0.007 + 0.006 * (0.5 + 0.5 * Math.sin(k * 2.39 + 0.7)) + 0.003 * Math.sin(k * 0.73);
      g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 0.0022;
      g.beginPath(); g.moveTo(x, waistSeam - 0.001); g.lineTo(x + 0.0006 * Math.sin(k), waistSeam - len); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 0.0012;
      g.beginPath(); g.moveTo(x + 0.0025, waistSeam - 0.001); g.lineTo(x + 0.0025, waistSeam - 0.6 * len); g.stroke();
    }
    g.restore();
  };
  return { stitches, seams, folds, relief };
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
