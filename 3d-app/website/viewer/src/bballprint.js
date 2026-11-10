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
export const BB = { waist: 0.64, crotch: 0.275, band: 0.029 };
/** The side seam [y, x], from the hem's outer corner up to the waist: the flat panel's outer edge, flaring to the hem. */
// (FN9 2026-11-02, the user: from the waist to the hem the outer side is ONE straight line, as the picture, no bulge at
// the hips: above the crotch the seam is that line over the hips' ellipse (3D half-width 0.7354 x flat), the waist 5 % wider.)
// (BSF round 4, 2026-11-05: from the crotch up 0.925 of the width cut before: the hips are worn shallower and squarer
// (bballshorts.js hipDepth / hipBox), as wide as before; from the band's foot the cloth widens smoothly, no ledge.)
const HIP = 0.915;
export const BB_SIDE = [[0, 0.313], [0.07, 0.313], [0.2, 0.315], ...[[BB.crotch, 0.32], [0.34, 0.316], [0.42, 0.308], [0.5, 0.294], [0.55, 0.282], [0.575, 0.282], [0.6, 0.262], [BB.waist, 0.26]].map(([y, x]) => [y, x * HIP])];
/** The V split at the side of each leg's hem: the hem's outer corner (x at y 0) and how high the split rises. */
// (BSF r2, BST -241: a taller, narrower V, 12 % of the height as 420; the panels open along it: bballshorts.js split.)
export const BB_SPLIT = { x: 0.257, y: 0.075 };
/** The legs at the hem as worn (bballshorts.js worn: inLine, outLine, legDepth): inner and outer side, half-depth. */
export const BB_LEG = { inHem: 0.04, outHem: 0.2335, depthHem: 0.138 };
/**
 * The V split's edge [x, y], from the hem's corner up to the top of the split: cut so that, worn round the leg, it runs
 * up in a straight line as the client's picture shows it (420, a three-quarter view turned about 40 degrees), with a
 * sharp corner at the hem; a straight cut curls round the leg into a curve (BSF 2026-11-04, tester BST on -246).
 */
export const BB_VENT = (() => {
  // (A straight cut, as -246. BSF round 4 test d1: cut to rise slowly first, (1 - (1 - t)^(1/2.2)), the worn split turned
  // into a round arch: worse. Measured worn at 40 degrees, the straight cut already rises evenly (P40 linear in x).)
  const pts = [];
  for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push([BB_SPLIT.x + (0.313 - BB_SPLIT.x) * t, BB_SPLIT.y * t]); }
  return pts;
})();
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
  // (Along the V split's own edge, BB_VENT, carried on just past the side seam at its top.)
  const edge = (d) => [...BB_VENT.map(([x, y]) => [x, y + d]), [top, BB_SPLIT.y + d]];
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
  // (BSF r17, BST on -273, yi-front / yi-back: the shade of the gathers, too fine for the lighting alone: the elastic's
  // valleys (at the same places as the relief's, bballTailoring), a darker puckered line at the band's foot where the body
  // starts, and behind, the soft long shadows of the gathers under it, to ~15 % down.)
  const ws = BB.waist - BB.band - 0.0012, px = Math.abs(g.getTransform().a) || 3000;
  const rnd = (k, s) => 0.5 + 0.5 * Math.sin(k * s + Math.sin(k * 0.37 * s + (back ? 2.1 : 0.3)));
  // (Each layer drawn sharp on its own canvas, then laid on blurred once: a filter on every fill is far too slow.)
  const layer = (blur, draw) => {
    const c = document.createElement('canvas'); c.width = g.canvas.width; c.height = g.canvas.height;
    const l = c.getContext('2d'); l.setTransform(g.getTransform()); draw(l);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.filter = `blur(${(blur * px).toFixed(1)}px)`; g.drawImage(c, 0, 0); g.restore();
  };
  layer(0.0009, (l) => {
    for (let x = -0.45, k = 0; x <= 0.45; k++) {
      const gap = 0.005 + 0.004 * rnd(k, 2.17);
      l.fillStyle = `rgba(0,0,0,${0.3 + 0.2 * rnd(k, 1.3)})`;
      l.fillRect(x - 0.0013, ws, 0.0026, BB.band + 0.02);
      x += gap;
    }
    l.strokeStyle = 'rgba(0,0,0,0.42)'; l.lineWidth = 0.0026;
    l.beginPath();
    for (let x = -0.45; x <= 0.45; x += 0.0015) l.lineTo(x, ws + 0.0004 + 0.0007 * Math.sin(x * 1300 + Math.sin(x * 210)));
    l.stroke();
  });
  if (back) layer(0.0028, (l) => {
    for (let x = -0.28, k = 0; x <= 0.28; k++) {
      const len = 0.045 + 0.045 * rnd(k, 2.39), w = 0.005 + 0.003 * rnd(k, 1.1), dx = Math.sign(x) * len * 0.12;
      l.fillStyle = `rgba(0,0,0,${0.24 + 0.14 * rnd(k, 0.93)})`;
      l.beginPath(); l.moveTo(x - w / 2, ws); l.lineTo(x + w / 2, ws); l.lineTo(x + dx, ws - len); l.closePath(); l.fill();
      x += 0.013 + 0.012 * rnd(k, 1.61);
    }
  });
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
  fill([[BB_SPLIT.x + 0.0004, -0.03], [top + out, -0.03], [top + out, apex + e1], [top - 0.0005, apex + e1], ...BB_VENT.slice().reverse().map(([x, y]) => [x + 0.0004, y])], trimHex('bballTrim2'));
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
export function bballTailoring(painter, back = false) {
  const stitches = [], seams = [], folds = [];
  const along = (points) => (c) => points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  // (Along the level hem only: carried round the V split's corner, the rows crossed the stripes in a diagonal line.)
  for (const { points } of painter.edges()) {
    let run = [];
    const flush = () => { if (run.length > 1) { stitches.push(along(painter.inset(run, 0.0115)), along(painter.inset(run, 0.0147))); folds.push(along(painter.inset(run, 0.019, 0.006))); } run = []; };
    for (const p of points) { if (p.y < 0.003 && Math.abs(p.x) < BB_SPLIT.x - 0.02) run.push(p); else flush(); }
    flush();
  }
  const waistSeam = BB.waist - BB.band - 0.0012;
  seams.push((c) => { c.moveTo(0, waistSeam); c.lineTo(0, BB.crotch + 0.01); });
  stitches.push((c) => { c.moveTo(0.0032, waistSeam - 0.002); c.lineTo(0.0032, BB.crotch + 0.03); });
  // The elastic's fine gathers in the cloth just under the band: short soft puckers about 5 mm apart, of uneven length.
  const relief = (g) => {
    g.save();
    g.lineCap = 'round';
    // The double knit's fine lines running across the whole garment, about 2.5 mm apart (BST on -261: on the body too).
    // (BSF r17, BST on -273: not here any more: drawn into the relief they beat against the screen's pixels in broad
    // light and dark bands across the legs; the fabric's own normal map (render-quality.js bballknit) carries them.)
    // (BSF r16, BST on -270, client yi-front / yi-back: crisp, sharp-edged creases, not mesh bumps.) A crease: a narrow
    // sunk valley tapering to nothing, with a thin raised ridge beside it, drawn as filled wedges so its edges stay sharp.
    const wedge = (x, y, dx, len, w, style) => {
      g.fillStyle = style; g.beginPath();
      g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y);
      g.quadraticCurveTo(x + w / 4 + dx * 0.5, y - len * 0.5, x + dx, y - len);
      g.quadraticCurveTo(x - w / 4 + dx * 0.5, y - len * 0.5, x - w / 2, y);
      g.fill();
    };
    const rnd = (k, s) => 0.5 + 0.5 * Math.sin(k * s + Math.sin(k * 0.37 * s + (back ? 2.1 : 0.3)));
    // The band: dense, fine elastic ruching all round, thin uneven gathers about 3-6 mm apart from its foot to the edge.
    for (let x = -0.45, k = 0; x <= 0.45; k++) {
      const gap = 0.005 + 0.004 * rnd(k, 2.17), top = BB.waist + 0.012, wav = 0.0008 * Math.sin(k * 1.9);
      g.fillStyle = `rgba(0,0,0,${0.3 + 0.2 * rnd(k, 1.3)})`;
      g.beginPath(); g.moveTo(x - 0.0005, waistSeam); g.lineTo(x + 0.0005, waistSeam); g.quadraticCurveTo(x + wav + 0.0004, (waistSeam + top) / 2, x + 0.0004, top); g.lineTo(x - 0.0004, top); g.quadraticCurveTo(x + wav - 0.0004, (waistSeam + top) / 2, x - 0.0005, waistSeam); g.fill();
      g.strokeStyle = `rgba(255,255,255,${0.22 + 0.18 * rnd(k, 1.7)})`; g.lineWidth = 0.0006 + 0.0006 * rnd(k, 0.83);
      g.beginPath(); g.moveTo(x + gap / 2, waistSeam + 0.0005); g.quadraticCurveTo(x + gap / 2 + wav, (waistSeam + top) / 2, x + gap / 2, top); g.stroke();
      x += gap;
    }
    // Just under the band: fine creases fanning out and down from the gathered elastic, uneven in spacing and length;
    // in front reaching ~5-9 cm (to ~15 % down), behind shorter and fewer (fading by ~12 %).
    for (let x = -0.3, k = 0; x <= 0.3; k++) {
      const ax = Math.abs(x), gap = (back ? 0.005 : 0.0055) + 0.006 * rnd(k, 1.61);
      const len = (back ? 0.04 + 0.05 * rnd(k, 2.39) : 0.04 + 0.075 * rnd(k, 2.39)) * (0.55 + 0.45 * Math.min(1, ax / 0.04));
      const dx = Math.sign(x) * len * (0.08 + 0.25 * Math.min(1, ax / 0.25)) + 0.004 * Math.sin(k * 0.71);
      const deep = (back ? 0.7 : 1) * (0.65 + 0.35 * rnd(k, 0.93)), wide = back ? 2.2 : 1;
      wedge(x, waistSeam - 0.0006, dx, len, (0.0024 + 0.0014 * rnd(k, 1.1)) * wide, `rgba(0,0,0,${deep})`);
      wedge(x + 0.0022 * wide, waistSeam - 0.0006, dx * 0.9, len * 0.8, 0.0018 * wide, `rgba(255,255,255,${deep * 0.8})`);
      x += gap;
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
