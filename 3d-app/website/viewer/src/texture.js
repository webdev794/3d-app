// Paints the kit's print atlas: front panel on the left half, back panel
// (mirrored so it reads correctly from behind) on the right half. Everything
// is drawn in garment coordinates (metres), so placement is exact.

import { zoneRects, zonePolys, NFL_PANEL, POCKET, hasPocket, isHoodie, isTrack, isDress, KANGAROO, kangarooEdge, HOOD_TOP, partRegion, TOP_PARTS, SHORTS_PARTS } from './zones.js';
import { POCKET_ZIP, pocketZipX } from './trackjacket.js';
import { isVarsity, varsityTailoring, paintVarsity, paintVarsityMarks } from './varsity.js';

/** The tops with set-in or raglan sleeves. */
const SLEEVED = ['jersey', 'nfljersey', 'tee', 'raglan', 'polo', 'pocketpolo', 'hoodie', 'ziphoodie', 'trackjacket', 'varsity', 'compression'];

/**
 * The chest pocket's outline (zones.js POCKET) in garment metres on the current transform: from the top's inner
 * corner down, round the rounded bottom corners and up to the top's outer corner, `d` metres inside its edge (closed
 * along the top when `close`).
 */
function pocketPath(c, d = 0, close = true) {
  const { x0, x1, top, bottom, corner } = POCKET, r = Math.max(0.001, corner - d);
  c.moveTo(x0 + d, top);
  c.lineTo(x0 + d, bottom + corner);
  c.arcTo(x0 + d, bottom + d, x0 + corner, bottom + d, r);
  c.lineTo(x1 - corner, bottom + d);
  c.arcTo(x1 - d, bottom + d, x1 - d, bottom + corner, r);
  c.lineTo(x1 - d, top);
  if (close) c.closePath();
}
import { RAGLAN, raglanSeam } from './layout-warp.js';
import { drawWord } from './wordart.js';
import { BRAND_WORDMARK, BRAND_MARK } from './brandmarks.js';
import { JERSEY_BLADES, SHORTS_BLADES } from './jerseyblades.js';
import { SOCK_PARTS, paintSocks, sockTailoring, paintSockMarks } from './sockprint.js';
import { SKIRT_PARTS, paintSkirt, skirtTailoring, paintSkirtMarks } from './skirtprint.js';
import { CAP_PARTS, paintCap, capTailoring, paintCapMarks } from './capprint.js';

/**
 * A hoodie's kangaroo pocket outline (zones.js KANGAROO) in garment metres, `d` metres inside its edge: the whole
 * pocket, or one half of a split (zip) one (`sgn` +1 / -1). Its curved hand openings run from the top's corners down
 * the sides.
 */
function kangarooPath(c, d = 0, sgn = 0) {
  const K = KANGAROO, steps = 16, inner = K.zipGap + d;
  const side = (s) => {
    const out = [];
    for (let k = 0; k <= steps; k++) { const y = K.top - d - ((K.top - K.bottom - 2 * d) * k) / steps; out.push([s * (kangarooEdge(y) - d), y]); }
    return out;
  };
  const pts = sgn === 0 ? [...side(1), ...side(-1).reverse()]
    : [[sgn * inner, K.top - d], ...side(sgn), [sgn * inner, K.bottom + d]];
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}
/** The kangaroo pocket's halves (one when it is whole). */
const kangarooSides = (kind) => (kind === 'ziphoodie' ? [1, -1] : [0]);
/** The hand opening's edge on one side (sgn), `d` metres inside it. */
function openingPath(c, sgn, d = 0) {
  const K = KANGAROO;
  for (let k = 0; k <= 16; k++) {
    const y = K.top - ((K.top - K.openBottom) * k) / 16, x = sgn * (kangarooEdge(y) - d);
    k ? c.lineTo(x, y) : c.moveTo(x, y);
  }
}

/**
 * The track jacket's panel lines (right half, garment metres; mirrored with `dir`): the shoulder and sleeve panel's
 * lower edge, from the neck over the shoulder and down the sleeve to the cuff, and the side panel's inner edge, from
 * the underarm down to the hem. Shared by the paint and the stitching.
 */
function trackShoulderLine(c, dir, d = 0, move = true) {
  if (move) c.moveTo(dir * 0.075, 0.745 - d); else c.lineTo(dir * 0.075, 0.745 - d);
  c.quadraticCurveTo(dir * 0.17, 0.69 - d, dir * 0.258, 0.622 - d);
  c.lineTo(dir * 0.65, 0.245 - d);
}
function trackSideLine(c, dir, d = 0, move = true) {
  if (move) c.moveTo(dir * (0.256 - d), 0.53); else c.lineTo(dir * (0.256 - d), 0.53);
  c.quadraticCurveTo(dir * (0.2 - d), 0.3, dir * (0.212 - d), -0.01);
}
/** A side pocket's zip line on the front (trackjacket.js POCKET_ZIP), moved `d` metres square to it (+ outwards). */
function trackPocketLine(c, sgn, d = 0) {
  const [, yb] = POCKET_ZIP.bottom, [, yt] = POCKET_ZIP.top;
  const dx = pocketZipX(sgn, yt) - pocketZipX(sgn, yb), dy = yt - yb, l = Math.hypot(dx, dy);
  const nx = (sgn * dy) / l, ny = (-sgn * dx) / l;   // square to the zip, away from the middle
  c.moveTo(pocketZipX(sgn, yb) + nx * d, yb + ny * d);
  c.lineTo(pocketZipX(sgn, yt) + nx * d, yt + ny * d);
}

/**
 * The netball dress's side panel line (right half, garment metres; mirrored with `dir`), moved `d` metres in from it:
 * from just inside the underarm, in at the waist and out over the hips to the hem, as on a netball dress's princess
 * side panels. Shared by the paint and the stitching.
 */
function dressSideLine(c, dir, d = 0, move = true) {
  if (move) c.moveTo(dir * (0.21 - d), 0.69); else c.lineTo(dir * (0.21 - d), 0.69);
  c.quadraticCurveTo(dir * (0.175 - d), 0.52, dir * (0.19 - d), 0.4);
  c.quadraticCurveTo(dir * (0.215 - d), 0.18, dir * (0.31 - d), -0.01);
}
/** How far the dress's heights are above a top's (its shoulder seam at 0.88, a singlet's at 0.738): its marks sit as
 *  far below its shoulders as a singlet's. */
const DRESS_RAISE = 0.142;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('Artwork took too long to load.')), 15000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Unable to read artwork.')); };
    img.src = src;
  });

/** Black-on-white AI artwork → a stencil tinted in `color`. */
/**
 * The picture's own print (task 9.116): a full-colour patch cut from an AI design picture, marked by the hosts with two
 * exact pixels at its top left (PRINT_MARK, a lossless PNG). Returns it as a canvas (repeated as it is, so diagonal
 * graphics keep their direction), or null for any other pattern picture (those stay one-colour stencils).
 */
export const PRINT_MARK = [[3, 222, 177], [17, 61, 233]];
async function printTile(src) {
  const img = await loadImage(src);
  if (img.width < 8 || img.height < 8) return null;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, 2, 1).data;
  if (!PRINT_MARK.every(([r, gr, b], i) => px[i * 4] === r && px[i * 4 + 1] === gr && px[i * 4 + 2] === b)) return null;
  // The two marker pixels take their neighbours' colour.
  g.drawImage(img, 0, 1, 2, 1, 0, 0, 2, 1);
  // Seamless: the patch shifted by half (its edges meet its middle, so they continue across a repeat), with the patch
  // itself over it, fading out towards its own edges.
  const w = c.width, h = c.height, out = document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d');
  for (const [dx, dy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]]) o.drawImage(c, dx, dy);
  const fade = (x1, y1) => {
    const ramp = g.createLinearGradient(0, 0, x1, y1);
    ramp.addColorStop(0, 'rgba(0,0,0,0)'); ramp.addColorStop(0.3, 'rgba(0,0,0,1)');
    ramp.addColorStop(0.7, 'rgba(0,0,0,1)'); ramp.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = ramp;
    g.fillRect(0, 0, w, h);
  };
  fade(w, 0);
  fade(0, h);
  g.globalCompositeOperation = 'source-over';
  o.drawImage(c, 0, 0);
  return out;
}

/** A zone value that is an uploaded pattern picture (a data URL or a local image URL) rather than a pattern name. */
/** Clips `g` (in garment metres) to a part's region (zones.js partRegion): its outlines, less each group cut out. */
function regionClip(g, region) {
  const trace = (poly) => { poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  g.beginPath();
  // (Each outline its own way round: with the nonzero rule overlapping outlines add up.)
  for (const poly of region.keep) trace(clockwise(poly));
  g.clip();
  for (const group of region.cut) {
    if (!group.length) continue;
    g.beginPath();
    g.rect(-5, -5, 10, 10);
    for (const poly of group) trace(poly);
    g.clip('evenodd');
  }
}
/** An outline turned one way round (for the nonzero rule). */
function clockwise(poly) {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  return area < 0 ? [...poly].reverse() : poly;
}

const isPicture = (v) => typeof v === 'string' && (v.startsWith('data:image/') || v.startsWith('/') || v.startsWith('http'));

async function stencil(src, color) {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const [r, gr, b] = hexRgb(color);
  for (let i = 0; i < data.data.length; i += 4) {
    const lum = (data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114) / 255;
    data.data[i] = r;
    data.data[i + 1] = gr;
    data.data[i + 2] = b;
    data.data[i + 3] = Math.round(Math.min(1, Math.max(0, (0.85 - lum) / 0.6)) * 255);
  }
  g.putImageData(data, 0, 0);
  return c;
}

const hexRgb = (hex) => {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/**
 * The pattern's own colour (design.patternColor) when the user chose it (design.patternColorOwn: the Colours panel's
 * Pattern tab, or a tap on the pattern): the built-in patterns and the area patterns are then painted in it. Without
 * it, as before: the whole-garment pattern in a mix of the Primary and Secondary, the area patterns in the Secondary.
 */
export const ownPatternInk = (design) => (design.patternColorOwn && HEX.test(design.patternColor ?? '') ? design.patternColor : null);
/** The area patterns' ink: the pattern's own colour, else the Secondary (as before). */
const zoneInk = (design) => ownPatternInk(design) ?? design.secondary;

const mix = (a, b, t) => {
  const [r1, g1, b1] = hexRgb(a), [r2, g2, b2] = hexRgb(b);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
};

/** Contrast bands along the finished edges (metres): kept narrow, the same width at the hem
 *  (and leg hems) and round the sleeve ends, and even all the way round. */
/** The football jersey's numbers' font (square block numerals, built into the viewer) and its yoke seam's height. */
const NFL_FONT = 'JerseyBlock';
/** The football jersey's numbers drawn this much narrower (their height kept), as the client's pictures' numerals (FX3). */
const NFL_SQUEEZE = 0.78;
/** A text object's own font (design.layers[].font, FX3): only a font the viewer carries (the jersey numerals). */
export const LAYER_FONTS = [NFL_FONT];
const layerFont = (layer) => (LAYER_FONTS.includes(layer?.font) ? layer.font : null);
export const NFL_YOKE = 0.612;
const HEM_BAND = 0.009, CUFF_BAND = 0.009, NFL_CUFF_BAND = 0.02;
/** The Practice Jersey's shoulder stripe (texture.js paintNflTrims, FX3): its middle line on the +x side, [x, y, width]
 *  in metres, from over the shoulder's top down along the armhole to the underarm. */
const NFL_STRIPE = [[0.178, 0.738, 0.05], [0.218, 0.69, 0.066], [0.252, 0.645, 0.072], [0.268, 0.6, 0.062], [0.268, 0.56, 0.046], [0.26, 0.535, 0.024]];
/** A band along a smooth curve through `pts` ([x, y, width]), its width eased between them: the outline, one edge
 *  then back along the other. */
function taperedBand(pts, steps = 8) {
  const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const line = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < steps || (i === pts.length - 2 && s === steps); s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      line.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  const side = (k) => line.map(([x, y, w], i) => {
    const [ax, ay] = line[Math.max(0, i - 1)], [bx, by] = line[Math.min(line.length - 1, i + 1)];
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1;
    return [x - (k * dy * w) / 2 / d, y + (k * dx * w) / 2 / d];
  });
  return [...side(1), ...side(-1).reverse()];
}
/** The track jacket's sleeve sponsor: on the wearer's right sleeve panel (front), along the arm. */
const TRACK_SPONSOR = { side: 'front', x: -0.38, y: 0.528, rot: -46 };


/** The cover-stitch's look (stitches()): its shadow, the thread and a highlight, each [dx, dy, style, width]. */
const STITCH_TONE = [[.00035, -.00045, 'rgba(0,0,0,0.42)', .0012], [0, 0, 'rgba(255,255,255,0.2)', .001], [-.00018, .00022, 'rgba(255,255,255,0.34)', .00045]];
/** The compression top's dark thread, tone on tone, as the client's picture (FX3; as the skirt's and the cap's). */
const COMPRESSION_THREAD = [[0.00035, -0.00045, 'rgba(0,0,0,0.55)', 0.0013], [0, 0, 'rgba(0,0,0,0.35)', 0.001], [-0.00018, 0.00022, 'rgba(255,255,255,0.1)', 0.00045]];
const HEX = /^#[0-9a-f]{6}$/i;
/**
 * A colour zone's gradient fill, or null when the zone is a solid colour. The Primary zone keeps the original
 * `design.gradient` ({ from, to, angle }); Secondary and Pattern use `design.gradients[slot]`. Any gradient may carry
 * `stops` ([{ color, at 0..1 }], two or more, e.g. Sunset's orange, pink and purple); without them it runs from `from`
 * to `to`.
 */
export function zoneGradient(design, slot) {
  const gradient = slot === 'main' ? design.gradient : design.gradients?.[slot];
  if (!gradient || typeof gradient !== 'object') return null;
  let stops = Array.isArray(gradient.stops)
    ? gradient.stops.filter((s) => s && HEX.test(s.color)).map((s) => ({ color: s.color, at: Math.min(1, Math.max(0, Number(s.at) || 0)) }))
    : [];
  if (stops.length < 2) {
    if (!HEX.test(gradient.from ?? '') || !HEX.test(gradient.to ?? '')) return null;
    stops = [{ color: gradient.from, at: 0 }, { color: gradient.to, at: 1 }];
  }
  stops.sort((a, b) => a.at - b.at);
  return { stops, angle: Number(gradient.angle) || 0 };
}

/** Whether a picture fills its box (its four corners solid), so it can be a badge with a stitched edge. */
function opaqueCorners(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    return [0, 7, 56, 63].every((i) => d[i * 4 + 3] > 230);
  } catch { return false; }
}

/**
 * The Swirl pattern's maze (alpha only, x -0.5..0.5 by y 0..0.82 at 1024 px a metre), made once. `sleeve`: the maze
 * for the shoulders reaching over the top of a bare sleeve (FX3, the client's football and hockey jersey picture): strong
 * over the shoulder and along the sleeve's top, fading out two thirds of the way to the cuff, the underside plain.
 */
const swirlCache = new Map();
function swirlMask(sleeve = false) {
  if (swirlCache.has(sleeve)) return swirlCache.get(sleeve);
  const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const W = 1024, H = 840, c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const cg = c.getContext('2d'), img = cg.createImageData(W, H), d = img.data;
  // Waves of one length (about 3.4 cm) in many directions: the zero lines of their sum wind like a maze.
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const waves = [];
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI, k = (2 * Math.PI) / (0.028 * (0.85 + rnd() * 0.3));
    waves.push([Math.cos(a) * k, Math.sin(a) * k, rnd() * Math.PI * 2]);
  }
  for (let j = 0; j < H; j++) {
    const y = 0.82 - (j / H) * 0.82;
    // Full strength above y 0.72, fading to under half by y 0.46 (the picture's dark lower sleeve and chest).
    const fade = 0.45 + 0.55 * Math.min(1, Math.max(0, (y - 0.46) / 0.26));
    for (let i = 0; i < W; i++) {
      const x = -0.5 + i / 1024;
      let f = 0;
      for (const [kx, ky, ph] of waves) f += Math.cos(kx * x + ky * y + ph);
      // The ridge: near the zero line, soft-edged (lines and gaps about even).
      const v = Math.abs(f) / 3.74;
      const a = v < 0.21 ? 1 : v < 0.29 ? (0.29 - v) / 0.08 : 0;
      let reach = 1;
      if (sleeve) {
        // Along the sleeve from the shoulder (s) and down from its top edge (p), on the jersey's sleeve (garment.js).
        const ax = Math.abs(x), on = sm(0.24, 0.27, ax);
        const s = (ax - 0.258) * 0.84 - (y - 0.61) * 0.546, p = -(ax - 0.258) * 0.607 - (y - 0.688) * 0.795;
        reach = 1 - on + on * (1 - sm(0.05, 0.13, s)) * (1 - sm(0.04, 0.09, p));
      }
      d[(j * W + i) * 4 + 3] = Math.round(a * fade * reach * 255);
    }
  }
  cg.putImageData(img, 0, 0);
  swirlCache.set(sleeve, c);
  return c;
}

/**
 * The compression top's own stitching (texture.js tailoring; the client's picture, FX3), on either side: a double
 * cover-stitch 9 and 12.5 mm above the hem, right across (the side panels too); each cuff's hem stitched 1 cm in, with
 * its turned edge; a stitch line along the side panel's inner edge and along the side seam; and one along each edge of
 * the sleeve stripe (2.2 cm either side of the sleeve's underside seam). Taken from the outline, so it follows the shape.
 */
function compressionTailoring(p) {
  const stitches = [], folds = [], poly = p.outline;
  const line = (pts) => (c) => pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
  const nearest = (x, y) => poly.reduce((best, q, i) => (Math.hypot(q.x - x, q.y - y) < Math.hypot(poly[best].x - x, poly[best].y - y) ? i : best), 0);
  const between = (a, b) => {
    const n = poly.length, run = [], step = (b - a + n) % n <= n / 2 ? 1 : -1;
    for (let i = a; ; i = (i + step + n) % n) { run.push(poly[i]); if (i === b) break; }
    return run;
  };
  const minY = Math.min(...poly.map((q) => q.y));
  const hem = poly.filter((q) => q.y < minY + 0.02 && Math.abs(q.x) < 0.3).sort((a, b) => a.x - b.x);
  if (hem.length > 1) {
    const at = (d) => [{ x: hem[0].x - 0.02, y: hem[0].y + d }, ...hem.map((q) => ({ x: q.x, y: q.y + d })), { x: hem[hem.length - 1].x + 0.02, y: hem[hem.length - 1].y + d }];
    for (const d of [0.009, 0.0125]) stitches.push(line(at(d)));
  }
  const [ax, ay] = p.points?.CT ?? [0.676, 0.272], [bx, by] = p.points?.CB ?? [0.624, 0.218];
  const [x0, , , y1] = zoneRects(p.kind, 'sides')[0] ?? [];
  for (const dir of [-1, 1]) {
    const cuff = [{ x: dir * ax, y: ay }, { x: dir * bx, y: by }];
    stitches.push(line(p.inset(cuff, 0.01, 0.004)));
    folds.push(line(p.inset(cuff, 0.0016, 0.004)));
    // (Along the panel's own inner edge where it has one, up into the piping: FM 2026-10-30.)
    const own = zonePolys(p.kind, 'sides')?.[0]?.filter(([x]) => x < 0.26);
    if (own) stitches.push(line(own.map(([x, y]) => ({ x: dir * (x + 0.003), y: Math.max(y, minY - 0.01) }))));
    else if (x0 != null) stitches.push(line([{ x: dir * (x0 + 0.003), y: minY - 0.01 }, { x: dir * (x0 + 0.003), y: y1 }]));
    const side = between(nearest(dir * 0.255, 0.52), nearest(dir * 0.234, minY + 0.015));
    if (side.length > 1) stitches.push(line(p.inset(side, 0.004)));
  }
  for (const run of p.sleeveUnderEdges()) if (run.length > 1) stitches.push(line(p.inset(run, alongRun(run, (t) => compressionStripe(t) - 0.003))));
  return { stitches, folds };
}

/**
 * The compression top's sleeve stripe, its width on each panel (metres) at `t` along the sleeve's underside, 0 at the
 * underarm and 1 at the cuff. Measured from the client's picture (FM print fixer 2026-10-30): narrow on the upper arm,
 * widening past the elbow to about twice that down the forearm, and a little narrower again at the cuff.
 */
const STRIPE_WIDTHS = [[0, 0.014], [0.3, 0.017], [0.45, 0.022], [0.52, 0.025], [0.6, 0.034], [0.68, 0.035], [0.75, 0.036], [0.85, 0.032], [0.93, 0.026], [1, 0.021]];
function compressionStripe(t) {
  const found = STRIPE_WIDTHS.findIndex(([at]) => at >= t), i = Math.max(1, found < 0 ? STRIPE_WIDTHS.length - 1 : found);
  const [a, wa] = STRIPE_WIDTHS[i - 1], [b, wb] = STRIPE_WIDTHS[i];
  const k = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
  return wa + (wb - wa) * k * k * (3 - 2 * k);
}

/** A width that changes along a point run: `f(t)` (t 0 to 1 by length along the run) for each of its points. */
function alongRun(run, f) {
  const len = [0];
  for (let i = 1; i < run.length; i++) len.push(len[i - 1] + Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y));
  const total = len[len.length - 1] || 1;
  return len.map((l) => f(l / total));
}

export class KitPainter {
  constructor(frame, outline, size = 2048, kind = 'jersey') {
    this.kind = kind;
    this.frame = frame;
    this.outline = outline;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size / 2;
    this.ctx = this.canvas.getContext('2d');
    this._stencilKey = null;
    this._stencil = null;
  }

  /** Sets the transform so drawing happens in garment metres on one side. */
  side(back, g = this.ctx, k = 1) {
    const { minX, maxX, minY, span } = this.frame;
    const H = this.canvas.height * k, s = H / span;
    if (back) g.setTransform(-s, 0, 0, -s, H + maxX * s, H + minY * s);
    else g.setTransform(s, 0, 0, -s, -minX * s, H + minY * s);
    return s;
  }

  // ---------- parts (task 9.134): one part of the kit with its own look (design.parts)
  /** This garment piece's parts that are printed (the collar and the waistband are 3D rib). */
  get printedParts() {
    if (this.kind === 'socks') return SOCK_PARTS;
    if (this.kind === 'skirt') return SKIRT_PARTS;
    if (this.kind === 'cap') return CAP_PARTS;
    return (this.partName === 'shorts' ? SHORTS_PARTS : TOP_PARTS).filter((key) => key !== 'collar' && key !== 'waistband');
  }

  /** A part's own look (design.parts[key]) when it has one this piece can show; else null. */
  partStyle(design, key) {
    const style = design.parts?.[key];
    const rib = key === 'collar' || key === 'waistband';
    if (!style || typeof style !== 'object' || (!rib && !this.printedParts.includes(key))) return null;
    const own = HEX.test(style.colour ?? '') ? style.colour : null;
    const fade = style.fade && HEX.test(style.fade.from ?? '') ? { from: style.fade.from, to: HEX.test(style.fade.to ?? '') ? style.fade.to : null, angle: Number(style.fade.angle) || 0 } : null;
    const pattern = typeof style.pattern === 'string' && style.pattern && style.pattern !== 'None' ? style.pattern : null;
    const raw = style.patternOpacity;
    const opacity = raw === null || raw === undefined || !Number.isFinite(Number(raw)) ? 1 : Math.min(1, Math.max(0, Number(raw)));
    if (!own && !fade && !pattern && opacity >= 1) return null;
    const ink = HEX.test(style.patternColour ?? '') ? style.patternColour : HEX.test(design.patternColor ?? '') ? design.patternColor : design.secondary;
    return { own, fade, pattern, opacity, ink };
  }

  /** Clips the context to a part on one side (garment metres on `g`, the print scaled by `k`); false when it is not there. */
  clipPart(key, back, g = this.ctx, k = 1) {
    const region = partRegion(this.kind, key, back);
    if (!region || !region.keep.length) return false;
    this.side(back, g, k);
    regionClip(g, region);
    return true;
  }

  /** A part's box in garment metres (its kept rectangles within the garment), for its fade. */
  partBox(key, back) {
    const region = partRegion(this.kind, key, back);
    const { minX, maxX, minY } = this.frame, maxY = minY + this.frame.span;
    if (!region) return [minX, minY, maxX, maxY];
    // The front or back (kept everywhere but the other parts): the body's own box, from its zones.
    const whole = region.keep.length === 1 && Math.max(...region.keep[0].map(([x]) => x)) - Math.min(...region.keep[0].map(([x]) => x)) > 3;
    const rects = whole ? ['yoke', 'body', 'hem', 'sides'].flatMap((zone) => zoneRects(this.kind, zone)).map(([x0, y0, x1, y1]) => [[x0, y0], [x1, y1]]) : region.keep;
    const xs = rects.flat().map(([x]) => x), ys = rects.flat().map(([, y]) => y);
    // The body's own top: its shoulders, not the print's square.
    const top = Math.min(maxY, Math.max(...ys), Math.max(...this.outline.map((p) => p.y)));
    return [Math.max(minX, Math.min(...xs)), Math.max(minY, Math.min(...ys)), Math.min(maxX, Math.max(...xs)), top];
  }

  /** A fade across a box: from -> to (to null: fading out), angle 0 = top to bottom, 90 = left to right. */
  fadeStyle({ from, to, angle }, [x0, y0, x1, y1]) {
    const g = this.ctx, a = (angle * Math.PI) / 180, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const dx = Math.sin(a), dy = -Math.cos(a), r = (Math.abs(dx) * (x1 - x0) + Math.abs(dy) * (y1 - y0)) / 2 || 0.01;
    const grad = g.createLinearGradient(cx - dx * r, cy - dy * r, cx + dx * r, cy + dy * r);
    const [rr, gg, bb] = hexRgb(from);
    grad.addColorStop(0, from);
    grad.addColorStop(1, to ?? `rgba(${rr},${gg},${bb},0)`);
    return grad;
  }

  /**
   * A part's own look over what is under it (the clip already set): its colour (the kit's pattern is then not on it),
   * or the kit's pattern made fainter (`base`: the kit's fill there); its fade; its own pattern at its opacity.
   */
  paintPartLook(design, style, box, base) {
    const g = this.ctx, BIG = [-1.6, -0.2, 3.2, 1.8];
    if (style.own) { g.fillStyle = style.own; g.fillRect(...BIG); }
    else if (!style.pattern && style.opacity < 1 && base) {
      g.save(); g.globalAlpha = 1 - style.opacity; g.fillStyle = base; g.fillRect(...BIG); g.restore();
    }
    if (style.fade) { g.fillStyle = this.fadeStyle(style.fade, box); g.fillRect(...BIG); }
    if (style.pattern) {
      g.save();
      g.globalAlpha = style.opacity;
      if (isPicture(style.pattern)) {
        const tile = this._zoneTiles?.get(style.pattern.length + style.ink + style.pattern.slice(-64));
        if (tile) {
          const pattern = g.createPattern(tile, 'repeat');
          const k = (design.patternScale ?? 0.3) / tile.width;
          pattern.setTransform(new DOMMatrix([k, 0, 0, -k, 0, 0]));
          g.fillStyle = pattern;
          g.fillRect(...BIG);
        }
      } else if (style.pattern === 'Solid') { g.fillStyle = style.ink; g.fillRect(...BIG); }
      else this.proceduralPattern(design, style.pattern, style.ink);
      g.restore();
    }
  }

  /** The kit's own fill under a part (the body's colour or gradient), to make the kit's pattern fainter on it. */
  baseFill(design) {
    const ownBody = isTrack(this.kind) && HEX.test(design.zoneColors?.body ?? '') ? design.zoneColors.body : null;
    return ownBody ?? this.zoneFill(design, 'main');
  }

  /** The parts with their own look on one side, over the kit's colours and pattern (the outline's clip set). */
  paintParts(design, back, { skip = [] } = {}) {
    if (!design.parts) return;
    const g = this.ctx;
    for (const key of this.printedParts) {
      if (skip.includes(key)) continue;
      const style = this.partStyle(design, key);
      if (!style) continue;
      g.save();
      if (this.clipPart(key, back)) this.paintPartLook(design, style, this.partBox(key, back), this.baseFill(design));
      g.restore();
    }
    this.side(back);
  }

  /**
   * The kit's AI pattern layer (drawn over the trims) kept off the parts with their own colour, and fainter on the
   * parts whose pattern was made fainter: erased from `lg` (one side's square, in its pixels) before it is drawn.
   */
  erasePartsFrom(lg, design, back) {
    if (!design.parts) return;
    const H = this.canvas.height;
    for (const key of this.printedParts) {
      const style = this.partStyle(design, key);
      if (!style || !(style.own || (!style.pattern && style.opacity < 1))) continue;
      lg.save();
      // The part's clip in print pixels, moved onto the side's own square (the back's starts at the print's middle).
      lg.setTransform(1, 0, 0, 1, back ? -H : 0, 0);
      const at = lg.getTransform();
      this.side(back, lg);
      lg.setTransform(at.multiply(lg.getTransform()));
      const region = partRegion(this.kind, key, back);
      if (region?.keep.length) {
        regionClip(lg, region);
        lg.setTransform(1, 0, 0, 1, 0, 0);
        lg.globalCompositeOperation = 'destination-out';
        lg.globalAlpha = style.own ? 1 : 1 - style.opacity;
        lg.fillStyle = '#000';
        lg.fillRect(0, 0, lg.canvas.width, lg.canvas.height);
      }
      lg.restore();
    }
  }

  /** The whole part, white on a small mask (its glow on the 3D kit), `k` the mask's size against the print; null when not printed. */
  partMask(key, k = 0.25) {
    const keys = [key].flat();
    this._mask ??= document.createElement('canvas');
    const m = this._mask, W = Math.round(this.canvas.width * k), H = Math.round(this.canvas.height * k);
    if (m.width !== W || m.height !== H) { m.width = W; m.height = H; }
    const g = m.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    let any = false;
    for (const back of [false, true]) {
      // (Several parts at once: every part a kit colour covers, task 9.137.)
      for (const one of keys) {
        g.save();
        if (this.clipPart(one, back, g, k)) {
          any = true;
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.fillStyle = '#fff';
          g.fillRect(back ? H : 0, 0, H, H);
        }
        g.restore();
      }
    }
    return any ? m : null;
  }

  /** Text centred on (0, 0) of the current frame (y down), `size` in metres, squeezed to `maxWidth`. Returns its size. */
  centredText(str, size, color, maxWidth, outline, family) {
    const g = this.ctx;
    g.save();
    g.font = `700 ${size}px ${family ? `${family}, ` : ''}Rajdhani, Inter, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = g.measureText(str).width;
    if (w > maxWidth) g.scale(maxWidth / w, 1);
    if (outline) {
      g.lineWidth = size * 0.07;
      g.strokeStyle = outline;
      g.lineJoin = 'round';
      g.strokeText(str, 0, 0);
    }
    g.fillStyle = color;
    g.fillText(str, 0, 0);
    g.restore();
    return { w: Math.min(w, maxWidth), h: size };
  }

  /**
   * One fixed mark (wordmark, sponsor, crest, name, number): drawn at its usual place `def` ({side, x, y}) unless
   * it was moved, resized, turned or hidden on the design board (design.marks, keyed `${part}_${name}`).
   * `draw(g)` paints it centred on (0, 0), y down, at its usual size and returns that size in metres; each mark
   * drawn is listed in `this.marks` so the board can select it.
   */
  mark(design, name, def, draw) {
    const key = `${this.partName}_${name}`, o = design.marks?.[key] ?? {};
    if (o.hidden === true) return;
    const num = (v, d) => (Number.isFinite(v) ? v : d);
    const back = (o.side === 'front' || o.side === 'back' ? o.side : def.side) === 'back';
    const g = this.ctx;
    g.save();
    this.clipOutline(back);
    g.translate(num(o.x, def.x), num(o.y, def.y));
    g.scale(back ? -1 : 1, -1);
    g.rotate((num(o.rot, def.rot ?? 0) * Math.PI) / 180);
    const scale = num(o.scale, 1);
    g.scale(scale, scale);
    const size = draw(g);
    g.restore();
    if (size) this.marks.push({ key, name, def, w0: size.w, h0: size.h, side: back ? 'back' : 'front', x: num(o.x, def.x), y: num(o.y, def.y), rot: num(o.rot, def.rot ?? 0), w: size.w * scale, h: size.h * scale });
  }

  markText(design, name, def, str, size, color, maxWidth, outline, family, squeeze = 1) {
    const own = design.marks?.[`${this.partName}_${name}`]?.color;
    const look = design.marks?.[`${this.partName}_${name}`]?.look;
    const ink = /^#[0-9a-f]{6}$/i.test(own ?? '') ? own : color;
    // The default chest text 3DEEZI is the real brand wordmark (RL1); the user's own words, colour or look stay text.
    if (name === 'wordmark' && str === '3DEEZI' && !own && !look && this._brandWord) {
      const img = this._brandWord, w = Math.min(maxWidth, size * 4.2), h = (w * img.height) / img.width;
      this.mark(design, name, def, (g) => { g.drawImage(img, -w / 2, -h / 2, w, h); return { w, h }; });
      return;
    }
    // A word's look (task 9.146: outline, shadow, 3D block, contour; arch, wave, bridge, slant; letter spacing).
    // `squeeze`: the word drawn that much narrower, its height kept (the football jersey's numbers).
    const narrow = (draw) => (g) => { if (squeeze !== 1) g.scale(squeeze, 1); const s = draw(g); return s && squeeze !== 1 ? { ...s, w: s.w * squeeze } : s; };
    if (str && look) this.mark(design, name, def, narrow((g) => drawWord(g, str, size, ink, maxWidth, look, outline, design.main, family)));
    else if (str) this.mark(design, name, def, narrow(() => this.centredText(str, size, ink, maxWidth, outline, family)));
  }

  /** An image mark fitted into boxW x boxH metres. */
  markImage(design, name, def, img, boxW, boxH) {
    this.mark(design, name, def, (g) => {
      const k = Math.min(boxW / img.width, boxH / img.height), w = img.width * k, h = img.height * k;
      if (name !== 'crest') { g.drawImage(img, -w / 2, -h / 2, w, h); return { w, h }; }
      // A badge shape chosen on the 3D kit (task 9.144): the picture inside that shape.
      const shape = crestShape(design.marks?.[`${this.partName}_crest`]?.shape);
      if (shape) {
        const s = Math.max(w, h);
        this.badge(g, (c) => shapePath(c, shape, s, s), () => { g.fillStyle = design.accent; g.fillRect(-s, -s, 2 * s, 2 * s); const k2 = 0.8; g.drawImage(img, (-w * k2) / 2, (-h * k2) / 2, w * k2, h * k2); }, s);
        return { w: s, h: s };
      }
      // The crest as a sewn-on badge (2026-10-28): a picture filling its box gets rounded corners, a stitched
      // edge and a raised rim; a cut-out logo keeps its shape, lifted by a soft shadow.
      if (opaqueCorners(img)) {
        const r = Math.min(w, h) * 0.12;
        this.badge(g, (c) => c.roundRect(-w / 2, -h / 2, w, h, r), () => g.drawImage(img, -w / 2, -h / 2, w, h), Math.min(w, h));
      } else {
        g.save(); this.liftShadow(g, Math.min(w, h)); g.drawImage(img, -w / 2, -h / 2, w, h); g.restore();
      }
      return { w, h };
    });
  }

  /** The 3DEEZI shield with "3D" on it, until the club has a logo; `pts` are its corners (metres, y up). */
  markShield(design, name, def, pts, textSize, textMax) {
    this.mark(design, name, def, (g) => {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      // Another badge shape chosen on the 3D kit (task 9.144); none = the usual shield.
      const shape = crestShape(design.marks?.[`${this.partName}_${name}`]?.shape);
      const sw = Math.max(...xs) - Math.min(...xs), sh = Math.max(...ys) - Math.min(...ys);
      // No badge shape chosen: the 3DEEZI "3" mark (RL1), as on the client's pictures.
      if (!shape && this._brandMark) {
        // (A tile's "3" all in one blue, design.zoneColors.crestMark: the Rugby League picture's, RF1.)
        const tint = HEX.test(design.zoneColors?.crestMark ?? '') ? design.zoneColors.crestMark : null;
        const img = tint ? this.crestMark(tint) : this._brandMark, w = (Math.max(...ys) - Math.min(...ys)) * 1.3, h = (w * img.height) / img.width;
        // The Game Jersey picture (FX3): the "3" mark on a small sewn badge at the V of the neck (design.zoneColors.badge).
        const plate = this.kind === 'nfljersey' && HEX.test(design.zoneColors?.badge ?? '') ? design.zoneColors.badge : null;
        if (plate) this.plate(g, w, plate);
        // The Rugby League jersey picture (RF1): a small 3DEEZI line under the "3", in the light cyan of
        // design.zoneColors.crestWord; the two centred together.
        const word = !plate && HEX.test(design.zoneColors?.crestWord ?? '') ? this.crestWord(design.zoneColors.crestWord) : null;
        if (word) {
          const ww = w * 0.92, wh = (ww * word.height) / word.width, gap = w * 0.04, all = h + gap + wh;
          g.drawImage(img, -w / 2, -all / 2, w, h);
          g.drawImage(word, -ww / 2, all / 2 - wh, ww, wh);
          return { w, h: all };
        }
        g.drawImage(img, -w / 2, -h / 2, w, h);
        return plate ? { w: w * 1.7, h: w * 1.12 } : { w, h };
      }
      const path = shape ? (c) => shapePath(c, shape, sw, shape === 'circle' || shape === 'square' || shape === 'rounded' || shape === 'diamond' ? sw : sh) : (c) => { pts.forEach(([x, y], i) => (i ? c.lineTo(x, -y) : c.moveTo(x, -y))); c.closePath(); };
      // A sewn-on badge: raised rim and stitched edge (texture.js badge).
      this.badge(g, path, () => { g.fillStyle = design.accent; g.fillRect(-1, -1, 2, 2); }, Math.max(...xs) - Math.min(...xs));
      this.centredText('3D', textSize, design.main, textMax);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    });
  }

  /** The "3" mark all in one colour: lighter at the top, deeper at the foot (the Rugby League picture's blue "3"). */
  crestMark(colour) {
    if (this._crestMarkKey !== colour) {
      const img = this._brandMark, c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      const ink = g.createLinearGradient(0, 0, 0, c.height);
      ink.addColorStop(0, mix(colour, '#ffffff', 0.3));
      ink.addColorStop(1, mix(colour, '#0a4fd0', 0.4));
      g.fillStyle = ink;
      g.fillRect(0, 0, c.width, c.height);
      this._crestMarkImg = c;
      this._crestMarkKey = colour;
    }
    return this._crestMarkImg;
  }

  /** The 3DEEZI wordmark all in one colour (`colour` lightened a quarter towards white), for under the "3" mark. */
  crestWord(colour) {
    if (!this._brandWord) return null;
    if (this._crestWordKey !== colour) {
      const img = this._brandWord, c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = mix(colour, '#ffffff', 0.25);
      g.fillRect(0, 0, c.width, c.height);
      this._crestWord = c;
      this._crestWordKey = colour;
    }
    return this._crestWord;
  }

  /** A soft shadow under what is drawn next, as if it stands off the fabric (`size`: the mark's size in metres). */
  /**
   * The small badge behind the football jersey's "3" mark at the V (the client's Game Jersey picture, FX3), `w` the
   * mark's width (metres, centred, y down): a flat top under the V, wide shoulders, a point below, in `colour` with a
   * dark sewn rim and a faint raised edge.
   */
  plate(g, w, colour) {
    const path = (c) => { c.moveTo(-0.5 * w, -0.54 * w); c.lineTo(0.5 * w, -0.54 * w); c.lineTo(0.85 * w, 0); c.lineTo(0, 0.58 * w); c.lineTo(-0.85 * w, 0); c.closePath(); };
    g.save();
    this.liftShadow(g, w);
    g.fillStyle = colour;
    g.beginPath(); path(g); g.fill();
    g.restore();
    g.save();
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = w * 0.07;
    g.beginPath(); path(g); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = w * 0.025;
    g.save(); g.scale(0.84, 0.84); g.beginPath(); path(g); g.restore(); g.stroke();
    g.restore();
  }

  liftShadow(g, size) {
    const m = g.getTransform(), px = Math.hypot(m.a, m.b);
    g.shadowColor = 'rgba(0,0,0,0.38)';
    g.shadowBlur = size * 0.05 * px;
    g.shadowOffsetX = size * 0.012 * px;
    g.shadowOffsetY = size * 0.022 * px;
  }

  /**
   * A sewn-on badge: its shape (`path`, local metres, y down) lifted by a soft shadow, filled by `fill` (clipped to
   * it), then a raised rim (light above, dark below) and a row of stitches just inside the edge.
   */
  badge(g, path, fill, size) {
    g.save();
    this.liftShadow(g, size);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath(); path(g); g.fill();
    g.restore();
    g.save();
    g.beginPath(); path(g); g.clip();
    fill();
    // The rim: lit from above, shaded below.
    const rim = size * 0.05;
    for (const [dy, style] of [[-rim * 0.25, 'rgba(255,255,255,0.32)'], [rim * 0.25, 'rgba(0,0,0,0.38)']]) {
      g.save(); g.translate(0, -dy); g.beginPath(); path(g); g.restore();
      g.lineWidth = rim; g.strokeStyle = style; g.stroke();
    }
    // The stitches, just inside the edge.
    g.setLineDash([size * 0.03, size * 0.02]);
    g.lineCap = 'round';
    for (const [k, style, wd] of [[1, 'rgba(0,0,0,0.35)', 0.012], [1, 'rgba(255,255,255,0.75)', 0.007]]) {
      g.save(); g.scale(0.86, 0.86); g.beginPath(); path(g); g.restore();
      g.lineWidth = size * wd * k; g.strokeStyle = style; g.stroke();
    }
    g.restore();
  }

  /**
   * How the garment is sewn, in garment metres: `seams` where pieces are joined (shoulder
   * panels, sides and set-in sleeves), `stitches` (double-needle cover-stitch rows on the
   * hem, collar and sleeve hems, plus the seam stitching) and `folds` (the top edge of a
   * hem turned up inside). Shared by the painted stitches and the relief map.
   */
  tailoring(back) {
    // The socks: their toe seam and welt (sockprint.js).
    if (this.kind === 'socks') return sockTailoring();
    // The skirt: its seams, the hem's stitching and the waistband's elastic (skirtprint.js).
    if (this.kind === 'skirt') return skirtTailoring();
    // The cap: its top-stitching and the brim's rows (capprint.js).
    if (this.kind === 'cap') return capTailoring(back);
    const shorts = this.kind === 'shorts', sleeves = SLEEVED.includes(this.kind);
    const raglan = this.kind === 'raglan';
    const stitches = [], seams = [], folds = [];
    const along = (points) => (c) => points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    // Hems and sleeve ends: two rows of cover-stitch and the turned-up edge inside, each an even
    // distance from the edge all the way round.
    for (const { kind, points } of this.edges()) {
      stitches.push(along(this.inset(points, .0115)), along(this.inset(points, .0147)));
      folds.push(along(this.inset(points, .019, .006)));
    }
    // The netball dress: its neck and armholes bound (the binding stitched down along each). Its sides are printed in
    // one piece with the front and back (the client's dress shows no panel seams: ND1), sewn only at the side seams.
    if (isDress(this.kind)) {
      const runs = this.dressEdges();
      for (const run of [runs.neck, ...runs.armholes]) {
        seams.push(along(this.inset(run, 0.0095)));
        for (const d of [0.0125, 0.0165]) stitches.push(along(this.inset(run, d)));
      }
      // The hem's double row of cover-stitch, 2 cm up, as on the client's dress.
      for (const { kind, points } of this.edges()) if (kind === 'hem') for (const d of [0.018, 0.0225]) stitches.push(along(this.inset(points, d)));
      return { stitches, seams, folds };
    }
    // Shorts: where the waistband is sewn on, just below it (the waist's own height: the drawn outline bulges a
    // little above it at the corners).
    // A deep gathered band (training shorts): the stitching runs right along its foot, where the gathers end.
    const deepBand = (this.rimWidth ?? 0.026) >= 0.035;
    const waistSeam = (this.points?.CF?.[1] ?? 0.42) - (this.rimWidth ?? 0.026) - (deepBand ? 0.0012 : 0.006);
    const hoodie = isHoodie(this.kind), track = isTrack(this.kind), varsity = isVarsity(this.kind), longTop = hoodie || track || varsity || this.kind === 'compression';
    for (const inset of [0, .0032]) {
      // The varsity jacket's long sleeves are set in as a hoodie's.
      if (longTop) {
        // Shoulder seams (to the shoulder point; the long sleeve is set in below it).
        for (const dir of [-1, 1]) stitches.push((c) => { c.moveTo(dir * (.1 + inset), .725 - inset); c.quadraticCurveTo(dir * .19, .712 - inset, dir * .254, .684 - inset); });
        continue;
      }
      if (shorts) { stitches.push((c) => { c.moveTo(-.4, waistSeam - inset); c.lineTo(.4, waistSeam - inset); }); continue; }
      for (const dir of [-1, 1]) {
        // Raglan: the seam from the neck down to the underarm, stitched on the body side; otherwise along the shoulder.
        if (raglan) stitches.push(along(raglanSeam([dir * RAGLAN.neck, .728], dir).map(([x, y]) => ({ x: x - dir * (0.004 + inset), y: y - 0.004 - inset }))));
        else stitches.push((c) => { c.moveTo(dir * (.105 + inset), .718); c.quadraticCurveTo(dir * .235, .691 - inset, dir * .395, .548 - inset); });
        stitches.push((c) => { c.moveTo(dir * (.235 - inset), .035); c.quadraticCurveTo(dir * (.21 - inset), .29, dir * (.234 - inset), .496); });
      }
    }
    if (!shorts) {
      for (const dir of [-1, 1]) {
        if (longTop) { seams.push((c) => { c.moveTo(dir * .1, .728); c.quadraticCurveTo(dir * .19, .715, dir * .258, .688); }); continue; }
        if (raglan) seams.push(along(raglanSeam([dir * RAGLAN.neck, .728], dir).map(([x, y]) => ({ x, y }))));
        else seams.push((c) => { c.moveTo(dir * .1066, .718); c.quadraticCurveTo(dir * .235, .6894, dir * .395, .5464); });
        seams.push((c) => { c.moveTo(dir * .2334, .035); c.quadraticCurveTo(dir * .2084, .29, dir * .2324, .496); });
      }
      // Collar: joined just below the neck trim, with two rows of stitching under it.
      const crew = this.kind === 'tee' || this.kind === 'raglan' || this.kind === 'polo' || this.kind === 'pocketpolo' || longTop;
      const neckline = (drop, inset) => (crew
        ? (c) => { c.moveTo(-.09 + inset, .745 - drop); c.quadraticCurveTo(0, (back ? .73 : .66) - drop, .09 - inset, .745 - drop); }
        : (c) => { c.moveTo(-.089 + inset, .745 - drop); c.lineTo(0, (back ? .69 : .668) - drop); c.lineTo(.089 - inset, .745 - drop); });
      // The varsity's collar is sewn round its own deeper neck (varsityTailoring).
      if (!varsity) {
        seams.push(neckline(.0095, 0));
        for (const drop of [.0125, .0165]) stitches.push(neckline(drop, 0));
      }
    }
    if (this.kind === 'compression') {
      // The client's compression top picture (FX3): a double cover-stitch about 1 cm above the hem, across the side
      // panels; each cuff's hem stitched about 1 cm in (and its turned edge); a stitch line along both edges of each
      // side panel (its inner edge, and the side seam) and of each sleeve stripe; all in dark thread (`tone`).
      const own = compressionTailoring(this);
      stitches.push(...own.stitches);
      folds.push(...own.folds);
    }
    if (varsity) {
      const own = varsityTailoring(this, back);
      stitches.push(...own.stitches);
      seams.push(...own.seams);
      folds.push(...own.folds);
    }
    if (hasPocket(this.kind) && !back) {
      // The chest pocket: sewn on round its sides and bottom with two rows of stitching, its top hem stitched across
      // (with a short bar tack at each top corner) and turned in at the top edge.
      const { x0, x1, top, hem } = POCKET;
      seams.push((c) => pocketPath(c, 0, false));
      stitches.push((c) => pocketPath(c, 0.0028, false), (c) => pocketPath(c, 0.006, false));
      stitches.push((c) => { c.moveTo(x0 + 0.003, top - hem + 0.0025); c.lineTo(x1 - 0.003, top - hem + 0.0025); });
      for (const x of [x0 + 0.0045, x1 - 0.0045]) stitches.push((c) => { c.moveTo(x, top - 0.0015); c.lineTo(x, top - 0.012); });
      folds.push((c) => { c.moveTo(x0 + 0.001, top - 0.0016); c.lineTo(x1 - 0.001, top - 0.0016); });
    }
    if (hoodie && !back) {
      // The kangaroo pocket: sewn on along its top, lower sides and foot with two rows of stitching; each hand
      // opening turned in and stitched down. The zip hoodie's halves are also sewn along the zip.
      for (const sgn of kangarooSides(this.kind)) {
        seams.push((c) => kangarooPath(c, 0, sgn));
        stitches.push((c) => kangarooPath(c, 0.003, sgn), (c) => kangarooPath(c, 0.0065, sgn));
      }
      for (const sgn of [-1, 1]) folds.push((c) => openingPath(c, sgn, 0.0015));
    }
    if (track) {
      // The track jacket: the shoulder and sleeve panels and the side panels sewn in (top-stitched on the body side);
      // the side pockets' welts stitched round their zips; the collar piece stitched along its top edge.
      for (const dir of [-1, 1]) {
        seams.push((c) => trackShoulderLine(c, dir), (c) => trackSideLine(c, dir));
        stitches.push((c) => trackShoulderLine(c, dir, 0.0035), (c) => trackSideLine(c, dir, 0.0035));
        if (!back) for (const d of [-0.0145, 0.0145]) stitches.push((c) => trackPocketLine(c, dir, d));
      }
      const piece = this.pieces?.[0]?.outline;
      if (back && piece && !this.trackHood) {
        const foot = piece.filter((p) => p.y < HOOD_TOP);
        stitches.push((c) => foot.forEach((p, i) => (i ? c.lineTo(p.x, p.y + 0.009) : c.moveTo(p.x, p.y + 0.009))));
      }
    }
    if ((hoodie || (track && this.trackHood)) && back) {
      // The hood piece: its centre seam, and the face edge's drawstring channel stitched along its foot.
      const piece = this.pieces?.[0]?.outline;
      seams.push((c) => { c.moveTo(0, HOOD_TOP); c.lineTo(0, HOOD_TOP - 0.4); });
      for (const inset of [-0.003, 0.003]) stitches.push((c) => { c.moveTo(inset, HOOD_TOP); c.lineTo(inset, HOOD_TOP - 0.4); });
      if (piece) {
        const foot = piece.filter((p) => p.y < HOOD_TOP);
        stitches.push((c) => foot.forEach((p, i) => (i ? c.lineTo(p.x, p.y + 0.016) : c.moveTo(p.x, p.y + 0.016))));
      }
    }
    if (sleeves && !raglan) {
      // Set-in sleeves: the armhole seam from the shoulder down to the underarm, stitched on the body side.
      for (const dir of [-1, 1]) {
        seams.push((c) => { c.moveTo(dir * .257, .687); c.quadraticCurveTo(dir * .273, .61, dir * .261, .531); });
        stitches.push((c) => { c.moveTo(dir * .2535, .683); c.quadraticCurveTo(dir * .269, .61, dir * .2565, .535); });
      }
    }
    return { stitches, seams, folds, ...(this.kind === 'compression' ? { tone: COMPRESSION_THREAD } : {}) };
  }

  /**
   * Fine relief of the sewing as a normal map in the print's layout (seen when zoomed in):
   * each stitch stands up and the fabric dips along the stitch rows, seams sink a little
   * and pucker, and turned-up hems show a soft ridge. Depends only on the garment shape.
   */
  reliefMap({ pucker = false } = {}) {
    const W = this.canvas.width, H = this.canvas.height;
    const height = document.createElement('canvas');
    height.width = W; height.height = H;
    const g = height.getContext('2d');
    g.fillStyle = 'rgb(128,128,128)';
    g.fillRect(0, 0, W, H);
    const stroke = (paths, style, width, dash = []) => {
      g.strokeStyle = style; g.lineWidth = width; g.setLineDash(dash); g.lineCap = 'round';
      for (const draw of paths) { g.beginPath(); draw(g); g.stroke(); }
    };
    for (const back of [false, true]) {
      // `dash` / `stitchRelief`: a garment's own stitch length and how raised its stitches stand (the skirt's, skirtprint.js).
      const { stitches, seams, folds, ridges = [], relief, dash = [.0024, .0016], stitchRelief: sr = 1 } = this.tailoring(back);
      this.side(back, g);
      stroke(seams, 'rgba(255,255,255,0.12)', .012, [.0035, .0035]);   // puckering across the seam
      // Render tiers: deeper, less regular puckering (longer soft ripples over the short ones).
      if (pucker) { stroke(seams, 'rgba(255,255,255,0.1)', .016, [.0035, .0035]); stroke(seams, 'rgba(255,255,255,0.12)', .022, [.007, .005]); }
      stroke(seams, 'rgba(0,0,0,0.32)', .0022);                        // the seam sinks
      stroke(folds, 'rgba(255,255,255,0.24)', .004);                   // turned-up hem edge
      stroke(stitches, `rgba(0,0,0,${0.24 * sr})`, .0017);             // fabric pulled down by the thread
      stroke(stitches, `rgba(255,255,255,${0.8 * sr})`, .0011, dash);  // each stitch stands up
      stroke(ridges, 'rgba(255,255,255,0.28)', .0019);                    // rounded raised crowns (the skirt's ruched elastic)
      relief?.(g);                                                     // a garment's own relief (the skirt's puckers, skirtprint.js)
    }
    // Soften the profiles, then turn heights into normals.
    const soft = document.createElement('canvas');
    soft.width = W; soft.height = H;
    const sg = soft.getContext('2d', { willReadFrequently: true });
    sg.filter = 'blur(0.8px)';
    sg.drawImage(height, 0, 0);
    const h = sg.getImageData(0, 0, W, H).data, out = sg.createImageData(W, H), o = out.data;
    for (let y = 0; y < H; y++) {
      const up = Math.max(0, y - 1) * W, down = Math.min(H - 1, y + 1) * W, row = y * W;
      for (let x = 0; x < W; x++) {
        const nx = (h[(row + Math.max(0, x - 1)) * 4] - h[(row + Math.min(W - 1, x + 1)) * 4]) / 255 * 2.4;
        const ny = (h[(up + x) * 4] - h[(down + x) * 4]) / 255 * 2.4;
        const len = Math.hypot(nx, ny, 1), i = (row + x) * 4;
        o[i] = (nx / len * 0.5 + 0.5) * 255; o[i + 1] = (ny / len * 0.5 + 0.5) * 255; o[i + 2] = (1 / len * 0.5 + 0.5) * 255; o[i + 3] = 255;
      }
    }
    sg.putImageData(out, 0, 0);
    return soft;
  }

  /**
   * Raised cover-stitch along each path (drawn in garment metres): a soft shadow,
   * the thread, then a highlight on top, so stitches read tone-on-tone on any colour.
   * `tone`: a garment's own thread (the skirt's dark thread, skirtprint.js); `dash`: its own stitch length.
   */
  stitches(back, paths, tone = STITCH_TONE, dash = [.0024, .0016]) {
    const g = this.ctx;
    this.side(back);
    g.save();
    g.setLineDash(dash);
    g.lineCap = 'round';
    for (const [dx, dy, style, width] of tone) {
      g.save();
      g.translate(dx, dy);
      g.strokeStyle = style;
      g.lineWidth = width;
      for (const draw of paths) { g.beginPath(); draw(g); g.stroke(); }
      g.restore();
    }
    g.restore();
  }

  clipOutline(back) {
    const g = this.ctx;
    this.side(back);
    g.beginPath();
    this.outline.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    // Pieces of their own on the atlas (a hoodie's hood) are printed too.
    for (const piece of this.piecesOn(back)) {
      piece.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
    }
    g.clip();
  }

  /** The outlines of the separate pieces on one side of the atlas (a hoodie's hood on the back). */
  piecesOn(back) {
    return (this.pieces ?? []).filter((p) => p.back === back).map((p) => p.outline);
  }

  /**
   * The netball dress's bound edges, as runs of outline points (garment metres): the neck (from the wearer's right
   * strap round to the left) and each armhole (from the strap's top down to the underarm), as garment.js finds them.
   */
  dressEdges() {
    if (this._dressEdges) return this._dressEdges;
    const poly = this.outline, n = poly.length, top = this.frame.maxY;
    const runsOf = (pred) => {
      const ok = poly.map(pred), runs = [], start = ok.findIndex((v, i) => v && !ok[(i - 1 + n) % n]);
      for (let i = start, seen = 0; start >= 0 && seen < n;) {
        if (!ok[i]) { i = (i + 1) % n; seen++; continue; }
        const run = [];
        while (ok[i] && seen < n) { run.push(poly[i]); i = (i + 1) % n; seen++; }
        if (run.length > 1) runs.push(run);
      }
      return runs;
    };
    // (The neck between the straps' inner corners, the armholes from the straps' outer corners down to the underarm:
    // garment.js points N, S and U.)
    const neckX = (this.points?.N?.[0] ?? 0.088) + 0.002, strapX = (this.points?.S?.[0] ?? 0.136) - 0.003;
    const neck = runsOf((p) => p.y > top - 0.15 && Math.abs(p.x) < neckX).sort((a, b) => b.length - a.length)[0] ?? [];
    const pitX = (this.points?.U?.[0] ?? 0.224) + 0.004;
    const armholes = runsOf((p) => Math.abs(p.x) > strapX && p.y > 0.671 && Math.abs(p.x) < pitX);
    return (this._dressEdges = { neck, armholes });
  }

  /**
   * The finished edges, each a run of outline points in garment metres: the hem (each leg
   * opening on shorts) and each sleeve end. Bands and stitching follow them at an even
   * distance, so they are the same width all the way round the body and the arms.
   */
  edges() {
    if (this._edges) return this._edges;
    const poly = this.outline, n = poly.length, shorts = this.kind === 'shorts';
    const sleeves = SLEEVED.includes(this.kind);
    // The cuff's corners: the garment's own (the raglan's, garment.js points) or the tee's.
    const [ax, ay] = this.points?.CT ?? [0.418, 0.566], [bx, by] = this.points?.CB ?? [0.372, 0.476];
    const a = { x: ax, y: ay }, b = { x: bx, y: by }, dx = b.x - a.x, dy = b.y - a.y;
    const onCuff = (p) => {
      const x = Math.abs(p.x), t = ((x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
      return t >= 0 && t <= 1 && Math.hypot(x - a.x - dx * t, p.y - a.y - dy * t) < 0.006;
    };
    // Shorts made with their finished edges marked (legs with side splits) take those: the hem curves up into the split.
    const kinds = shorts && this.edgeMask
      ? poly.map((p, i) => (this.edgeMask[i] && p.y < this.frame.maxY - 0.05 ? 'hem' : null))
      : poly.map((p) => (p.y < 0.03 && (!shorts || Math.abs(p.x) > 0.035) ? 'hem' : sleeves && onCuff(p) ? 'cuff' : null));
    const runs = [], start = kinds.findIndex((k, i) => k !== kinds[(i - 1 + n) % n]);
    for (let i = Math.max(0, start), seen = 0; start >= 0 && seen < n;) {
      const kind = kinds[i], points = [];
      while (seen < n && kinds[i] === kind) { points.push(poly[i]); i = (i + 1) % n; seen++; }
      if (kind && points.length > 1) runs.push({ kind, points });
    }
    return (this._edges = runs);
  }

  /** An edge run moved `d` metres into the garment, square to the edge, and `ext` metres on past each end. (`d` may
   * be a list, one distance for each point.) */
  inset(points, d, ext = 0) {
    const n = points.length;
    const out = points.map((p, i) => {
      const di = Array.isArray(d) ? d[i] : d;
      const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
      if (!this.contains(p.x + nx * 0.003, p.y + ny * 0.003)) { nx = -nx; ny = -ny; }
      return { x: p.x + nx * di, y: p.y + ny * di };
    });
    if (ext) {
      const on = (p, q) => { const l = Math.hypot(p.x - q.x, p.y - q.y) || 1; return { x: p.x + ((p.x - q.x) / l) * ext, y: p.y + ((p.y - q.y) / l) * ext }; };
      return [on(out[0], out[1]), ...out, on(out[n - 1], out[n - 2])];
    }
    return out;
  }

  /** Fills an even band `w` metres wide along an edge run (clipped to the outline by the caller). */
  band(points, w) {
    const g = this.ctx, path = [...this.inset(points, -0.004, 0.03), ...this.inset(points, w, 0.03).reverse()];
    g.beginPath();
    path.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.fill();
  }

  proceduralPattern(design, name = design.pattern, ink = mix(design.main, design.secondary, 0.35)) {
    // The netball dress is taller than the patterns' 0.8 m: they are drawn as on a top (from its shoulders down), and
    // again below for the skirt's hem. Its Blades are its own (dressBlades).
    if (isDress(this.kind)) {
      if (name === 'Blades') return this.dressBlades(design, ink);
      const g = this.ctx;
      for (const [dy, y0, y1] of [[DRESS_RAISE, DRESS_RAISE, 1.2], [DRESS_RAISE - 0.8, -0.2, DRESS_RAISE]]) {
        g.save();
        g.beginPath();
        g.rect(-0.6, y0, 1.2, y1 - y0);
        g.clip();
        g.translate(0, dy);
        this.patternTile(design, name, ink);
        g.restore();
      }
      return;
    }
    // The jersey's Blades are the client's Rugby League jersey's own (jerseyBlades).
    // (The shorts' too: the same picture's flames down their sides.)
    if ((this.kind === 'jersey' || this.kind === 'shorts') && name === 'Blades' && this._jerseyBlades) return this.jerseyBlades(design, ink);
    // A garment wider than the patterns' metre (a hoodie's long sleeves) repeats them a metre to each side.
    if (this.frame.maxX <= 0.5) return this.patternTile(design, name, ink);
    const g = this.ctx;
    for (const dx of [-1, 0, 1]) {
      g.save();
      g.translate(dx, 0);
      g.beginPath();
      g.rect(-0.5, -0.5, 1, 2);
      g.clip();
      this.patternTile(design, name, ink);
      g.restore();
    }
  }

  /**
   * The jersey's Blades (RF1 2026-10-30): the client's Rugby League jersey picture's shapes, laid back onto the flat
   * print (jerseyblades.js), on both sides of the front and the back: the tribal flames up each side, the light cyan
   * stripes and claws over the shoulders and the royal blue flames on the sleeves. Tinted from light cyan (the Accent,
   * lightened) through the Accent to `ink` (the Pattern colour; royal blue on the picture).
   */
  jerseyBlades(design, ink) {
    const cyan = HEX.test(design.accent ?? '') ? design.accent : '#16b4f0';
    const royal = typeof ink === 'string' && (HEX.test(ink) || ink.startsWith('rgb(')) ? ink : HEX.test(design.patternColor ?? '') ? design.patternColor : '#1672f5';
    const key = cyan + royal;
    if (this._jerseyBladesKey !== key) {
      this._jerseyBladesTint = tintJerseyBlades(this._jerseyBlades, cyan, royal);
      this._jerseyBladesKey = key;
    }
    const g = this.ctx, J = this.kind === 'shorts' ? SHORTS_BLADES : JERSEY_BLADES;
    for (const s of [-1, 1]) {
      g.save();
      g.translate(0, J.top);
      g.scale(s / J.ppm, -1 / J.ppm);
      g.drawImage(this._jerseyBladesTint, 0, 0);
      g.restore();
    }
  }

  /** The netball dress's half-width at a height (garment metres): where its outline is widest there (the side seam;
   *  above the underarm, the armhole). */
  dressHalf(y) {
    // (Not below the side seam's foot, points.H: the curved hem under it would pull the ribbons in at the hem.)
    y = Math.max(y, this.points?.H?.[1] ?? 0);
    let best = 0;
    const poly = this.outline;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i];
      if ((a.y > y) === (b.y > y) || (a.x < 0 && b.x < 0)) continue;
      best = Math.max(best, a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
    }
    return best || 0.2;
  }

  /**
   * The netball dress's Blades (the client's Netball dress picture; WF1, measured by ND1 2026-10-29): flowing ribbons
   * down each side instead of the jersey's blades, as the picture shows them once laid back onto the flat dress (its
   * colours read pixel by pixel through the 3D front view). Each ribbon's rows: [height, inner and outer edge as a
   * share of the dress's half-width there] (beyond 1: on round the side seam), top down.
   *  - SIDE: a band down each side of the top from the underarm, azure shading to royal blue, in at the waist and on
   *    round the hips;
   *  - CYAN: a cyan edge along the band's inner side, on down the skirt as a ribbon that crosses out to the hem's side;
   *  - OUTER: an azure ribbon from the hip round the side to the hem;
   *  - INNER: a royal blue ribbon from under the bib's corner sweeping out to the hem, lighter towards it.
   * Black between them.
   * The royal blue is the pattern's colour, the cyan the accent, the azure halfway between (the picture's three
   * blues, 4,82,220 / 2,140,248 / 6,190,250).
   */
  dressBlades(design, ink) {
    const g = this.ctx, accent = HEX.test(design.accent ?? '') ? design.accent : null;
    // (The default ink is a mix, 'rgb(r,g,b)'; a gradient ink paints every ribbon.)
    const rgb = typeof ink === 'string' && /^rgb\((\d+),(\d+),(\d+)\)$/.exec(ink.replace(/\s/g, ''));
    const base = typeof ink === 'string' && HEX.test(ink) ? ink : rgb ? `#${rgb.slice(1, 4).map((v) => (+v).toString(16).padStart(2, '0')).join('')}` : null;
    const solid = !!(base && accent);
    const cyan = solid ? '#' + hexRgb(accent).map((v, i) => Math.round(v + ([0, 236, 255][i] - v) * 0.4).toString(16).padStart(2, '0')).join('') : ink, azure = solid ? mix(base, accent, 0.4) : ink;
    // (Clean smooth ribbons, round the side seam where they reach it, black gaps between: DT6.)
    // (Off the side seam from the waist down, ending in a point on the hip: the hips' sides stay black, as the picture.)
    // (Only a thin black edge round the hips, 7 % of the half-width each side of the seam: from the side the hips show
    // the strips, not a black diamond.)
    // (ND2: the picture traced level by level: one strip per side from the armhole (thin cyan at the bust, azure at the
    // waist, cyan on the hips with a thin black edge outside), on round the side to the hem; a royal strip from under
    // the bib's corner, beside it on the hips, leaning out towards the hem; black between them lower down.)
    const SIDE = [[0.705, 0.72, 1.0], [0.69, 0.74, 1.0], [0.62, 0.72, 0.95], [0.54, 0.68, 0.92], [0.48, 0.62, 0.9], [0.42, 0.57, 0.88],
      [0.38, 0.56, 0.8], [0.35, 0.56, 0.735], [0.314, 0.58, 0.745], [0.278, 0.64, 0.8], [0.24, 0.72, 0.88], [0.2, 0.78, 0.98],
      [0.15, 0.82, 1.12], [0.06, 0.85, 1.12], [-0.03, 0.87, 1.12]];
    const INNER = [[0.42, 0.55, 0.58], [0.39, 0.46, 0.55], [0.35, 0.39, 0.535], [0.314, 0.38, 0.555], [0.278, 0.41, 0.615], [0.24, 0.46, 0.675],
      [0.2, 0.51, 0.705], [0.12, 0.56, 0.715], [0.04, 0.6, 0.735], [-0.03, 0.67, 0.795]];
    /** An edge's share at height y (rows from the top down; smooth through them). */
    const share = (rows, k, y) => {
      let i = 0;
      while (i < rows.length - 2 && y < rows[i + 1][0]) i++;
      const p = (j) => rows[Math.max(0, Math.min(rows.length - 1, j))][k];
      const t = Math.min(1, Math.max(0, (rows[i][0] - y) / (rows[i][0] - rows[i + 1][0])));
      const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
      return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
    };
    // Each ribbon also stroked thinly in its own colour, so neighbouring ribbons meet without a dark hairline.
    const ribbon = (rows, fill) => {
      const top = rows[0][0], foot = rows.at(-1)[0], steps = Math.max(8, Math.round((top - foot) / 0.004));
      for (const s of [-1, 1]) {
        g.beginPath();
        for (let i = 0; i <= steps; i++) { const y = top - ((top - foot) * i) / steps; g.lineTo(s * share(rows, 2, y) * this.dressHalf(y), y); }
        for (let i = steps; i >= 0; i--) { const y = top - ((top - foot) * i) / steps; g.lineTo(s * share(rows, 1, y) * this.dressHalf(y), y); }
        g.closePath();
        g.fillStyle = fill;
        g.fill();
        g.lineWidth = 0.0012;
        g.lineJoin = 'round';
        g.strokeStyle = fill;
        g.stroke();
      }
    };
    /** A vertical blend between two colours (top `y0` to `y1`). */
    const fade = (from, to, y0, y1) => {
      if (!solid) return ink;
      const grad = g.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(0, from);
      grad.addColorStop(1, to);
      return grad;
    };
    /**
     * The light on a twisting ribbon (the client's picture: light cyan, mid and deep blue in diagonal bands along each
     * strip): soft streaks inside the ribbon, each crossing its width as it runs down (from `a` to `b`, shares of the
     * ribbon's width), lighter or darker over its own colour.
     */
    const sheen = (rows, streaks) => {
      const top = rows[0][0], foot = rows.at(-1)[0], steps = Math.max(8, Math.round((top - foot) / 0.004));
      for (const s of [-1, 1]) for (const [a, b, w, style] of streaks) {
        // (Eight soft layers, narrowing: a smooth band, brightest along its middle, no hard edges.)
        for (let L = 0; L < 8; L++) {
          const k = 1 - L * 0.11, alpha = 0.16;
          g.beginPath();
          const at = (i, side) => {
            const y = top - ((top - foot) * i) / steps, t = i / steps, c = a + (b - a) * t, h = (w * k) / 2;
            const i0 = share(rows, 1, y), i1 = share(rows, 2, y), f = Math.min(1, Math.max(0, c + side * h));
            return [s * (i0 + (i1 - i0) * f) * this.dressHalf(y), y];
          };
          for (let i = 0; i <= steps; i++) g.lineTo(...at(i, -1));
          for (let i = steps; i >= 0; i--) g.lineTo(...at(i, 1));
          g.closePath();
          g.globalAlpha = alpha * (style === DEEP ? 0.5 : 0.8);
          g.fillStyle = style;
          g.fill();
        }
      }
      g.globalAlpha = 1;
    };
    const LIGHT = 'rgba(0,200,255,0.9)', DEEP = 'rgba(0,40,170,0.9)';
    g.save();
    // The top's side panels azure shading down to royal blue under a cyan edge; on the skirt an azure ribbon round each
    // side, the cyan ribbon crossing over it to the hem, the royal ribbon (lighter towards the hem) inside them.
    // (Flat picture colours, no shading painted in: the 3D light gives the folds. Cyan at the bust, azure through the
    // waist, cyan on the hips, azure down the skirt; the inner strip royal; dark gaps between them.)
    const C = '#04c2f8', A = '#0f80f2', R = '#0253d7';
    const sideFill = (() => {
      if (!solid) return ink;
      const grad = g.createLinearGradient(0, 0.7, 0, -0.03);
      const at = (y) => (0.7 - y) / 0.73;
      grad.addColorStop(at(0.7), C);
      grad.addColorStop(at(0.56), C);
      grad.addColorStop(at(0.48), A);
      grad.addColorStop(at(0.42), A);
      grad.addColorStop(at(0.36), C);
      grad.addColorStop(at(0.26), C);
      grad.addColorStop(at(0.16), A);
      grad.addColorStop(at(-0.03), A);
      return grad;
    })();
    ribbon(SIDE, sideFill);
    ribbon(INNER, solid ? R : ink);
    g.restore();
  }

  /** One metre of a pattern (x -0.5 to 0.5). */
  patternTile(design, name, ink) {
    const g = this.ctx;
    g.strokeStyle = ink;
    g.fillStyle = ink;
    if (name === 'Hoops') {
      for (let y = 0.02; y < 0.8; y += 0.07) g.fillRect(-0.5, y, 1, 0.032);
    } else if (name === 'Dots') {
      for (let y = 0.01; y < 0.8; y += 0.026) {
        for (let x = -0.5 + ((y * 100) % 2 ? 0.013 : 0); x < 0.5; x += 0.026) {
          g.beginPath();
          g.arc(x, y, 0.0055, 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (name === 'Diagonal') {
      g.lineWidth = 0.012;
      for (let x = -1.2; x < 0.6; x += 0.05) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 0.8, 0.8);
        g.stroke();
      }
    } else if (name === 'Tribal') {
      // Bands of interlocking triangles with a fine double line.
      for (let y = 0.03; y < 0.8; y += 0.11) {
        for (let x = -0.5; x < 0.5; x += 0.05) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 0.025, y + 0.045);
          g.lineTo(x + 0.05, y);
          g.closePath();
          g.fill();
        }
        g.fillRect(-0.5, y + 0.055, 1, 0.005);
        g.fillRect(-0.5, y + 0.066, 1, 0.0025);
      }
    } else if (name === 'Camo') {
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 160; i++) {
        const x = -0.5 + rnd(), y = rnd() * 0.8, r = 0.015 + rnd() * 0.035;
        g.beginPath();
        g.ellipse(x, y, r * 1.6, r, rnd() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    } else if (name === 'Stripes') {
      g.lineWidth = 0.004;
      for (let x = -0.5; x <= 0.5; x += 0.028) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 0.8);
        g.stroke();
      }
    } else if (name === 'Chevron') {
      g.lineWidth = 0.006;
      for (let y = 0.05; y < 0.62; y += 0.045) {
        g.beginPath();
        g.moveTo(-0.5, y + 0.12);
        g.lineTo(0, y);
        g.lineTo(0.5, y + 0.12);
        g.stroke();
      }
    } else if (name === 'Swirl') {
      // A dense maze of winding lines, like brain coral (the client's football and hockey jersey pictures, task 9.154;
      // DT3): the ridges of a band-limited wave sum, drawn as a mask, strong up top and fading down the sleeve and chest.
      const mask = swirlMask(this._swirlSleeve === true);
      const c = document.createElement('canvas');
      c.width = mask.width;
      c.height = mask.height;
      const cg = c.getContext('2d');
      cg.drawImage(mask, 0, 0);
      cg.globalCompositeOperation = 'source-in';
      cg.fillStyle = typeof ink === 'string' ? ink : HEX.test(design.patternColor ?? '') ? design.patternColor : design.secondary;
      cg.fillRect(0, 0, c.width, c.height);
      // The mask's row 0 is the top (y 0.82); the side's frame has y up.
      g.save();
      g.translate(-0.5, 0.82);
      g.scale(1 / c.width, -0.82 / c.height);
      g.drawImage(c, 0, 0);
      g.restore();
    } else if (name === 'Blades') {
      // Sharp flame-like blades (the client's Rugby League jersey, RL1 2026-10-29): thick pointed blades stacked up each
      // side seam, pointing up towards the chest, and blades fanning out from each shoulder over the sleeve top, with the
      // body colour showing between them; each has a lighter edge in the accent colour (cyan on the picture).
      const glow = mix(ink, design.accent ?? ink, 0.7);
      // A blade from its base (x0, y0)-(x1, y1) to a sharp tip (tx, ty), its edges bowed by `bow` (metres).
      const blade = (x0, y0, x1, y1, tx, ty, bow) => {
        const nx = -(ty - (y0 + y1) / 2), ny = tx - (x0 + x1) / 2, l = Math.hypot(nx, ny) || 1, ox = (nx / l) * bow, oy = (ny / l) * bow;
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo((x0 + tx) / 2 + ox, (y0 + ty) / 2 + oy, tx, ty);
        g.quadraticCurveTo((x1 + tx) / 2 + ox * 0.4, (y1 + ty) / 2 + oy * 0.4, x1, y1);
        g.closePath();
        g.fill();
      };
      for (const s of [-1, 1]) {
        const paint = (x0, y0, x1, y1, tx, ty, bow) => {
          g.fillStyle = ink;
          blade(s * x0, y0, s * x1, y1, s * tx, ty, s * bow);
          // The cyan edge: a thinner blade along its upper side.
          g.fillStyle = glow;
          blade(s * x0, y0, s * (x0 + (x1 - x0) * 0.3), y0 + (y1 - y0) * 0.3, s * tx, ty, s * bow);
        };
        // Up the side: four thick blades, the base on the side seam, the tip up and in, black between them.
        for (let i = 0; i < 4; i++) {
          const yb = -0.02 + i * 0.13;
          paint(0.33, yb + 0.12, 0.33, yb, 0.15 + i * 0.025, yb + 0.25 - i * 0.02, 0.035);
        }
        // Long thin flames inside them, low down.
        paint(0.2, -0.02, 0.26, -0.02, 0.12, 0.3, 0.02);
        // Over the shoulder: three blades from the neck side fanning out along the sleeve top, towards the cuff.
        paint(0.16, 0.78, 0.24, 0.75, 0.42, 0.56, 0.02);
        paint(0.26, 0.73, 0.33, 0.7, 0.46, 0.5, 0.015);
        paint(0.35, 0.68, 0.41, 0.65, 0.48, 0.47, 0.01);
        // A thin blade over the collarbone, pointing down and in.
        paint(0.17, 0.74, 0.22, 0.73, 0.1, 0.61, 0.01);
      }
    } else if (name === 'Velocity') {
      g.globalAlpha = 0.85;
      for (let i = 0; i < 9; i++) {
        const y = 0.04 + i * 0.05;
        for (const dir of [-1, 1]) {
          g.beginPath();
          g.moveTo(dir * 0.26, y);
          g.lineTo(dir * (0.1 + i * 0.006), y + 0.09);
          g.lineTo(dir * (0.1 + i * 0.006), y + 0.105);
          g.lineTo(dir * 0.26, y + 0.03);
          g.closePath();
          g.fill();
        }
      }
      g.globalAlpha = 1;
    }
  }

  async paint(design) {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    // A factory print layout: its panels are the print (warped into layoutBase by layout-warp.js); only the
    // sewing and the user's own artwork go on top.
    if (design.layout && this.layoutBase) {
      g.fillStyle = this.layoutFill ?? design.main;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      g.drawImage(this.layoutBase, 0, 0, this.canvas.width, this.canvas.height);
      for (const back of [false, true]) {
        g.save();
        this.clipOutline(back);
        this.stitches(back, this.tailoring(back).stitches);
        g.restore();
      }
      this.marks = [];
      await this.paintLayers(design);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return this.canvas;
    }
    g.fillStyle = design.main;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (design.patternImage) {
      const key = design.patternImage.length + design.patternColor + design.patternImage.slice(-64);
      if (key !== this._stencilKey) {
        this._print = await printTile(design.patternImage).catch(() => null);
        this._stencil = this._print ? null : await stencil(design.patternImage, design.patternColor ?? design.secondary).catch(() => null);
        this._stencilKey = key;
      }
    } else {
      this._stencil = null;
      this._print = null;
    }

    // Uploaded patterns dropped onto areas (design.zones values that are pictures): each a full-colour repeat (marked,
    // printTile) or a stencil in the trim colour, loaded before painting.
    this._zoneTiles ??= new Map();
    for (const name of Object.values(design.zones ?? {})) {
      if (!isPicture(name)) continue;
      const key = name.length + (zoneInk(design) ?? '') + name.slice(-64);
      if (this._zoneTiles.has(key)) continue;
      if (this._zoneTiles.size > 12) this._zoneTiles.clear();
      const print = await printTile(name).catch(() => null);
      // (A full-colour print is marked, so a tap on it can tell it from a pattern in the kit's colours.)
      if (print) print.fullColour = true;
      this._zoneTiles.set(key, print ?? (await stencil(name, zoneInk(design)).catch(() => null)));
    }
    // A part's own uploaded pattern (design.parts): its full-colour repeat, or a stencil in its pattern colour.
    for (const key of design.parts ? this.printedParts : []) {
      const style = this.partStyle(design, key);
      if (!style?.pattern || !isPicture(style.pattern)) continue;
      const tileKey = style.pattern.length + style.ink + style.pattern.slice(-64);
      if (this._zoneTiles.has(tileKey)) continue;
      if (this._zoneTiles.size > 12) this._zoneTiles.clear();
      const print = await printTile(style.pattern).catch(() => null);
      if (print) print.fullColour = true;
      this._zoneTiles.set(tileKey, print ?? (await stencil(style.pattern, style.ink).catch(() => null)));
    }

    // The jersey's Blades: the client's Rugby League picture's shapes (jerseyBlades), loaded once.
    if (this.kind === 'jersey' || this.kind === 'shorts') this._jerseyBlades = await jerseyBladesImage(this.kind === 'shorts');
    for (const back of [false, true]) {
      g.save();
      this.clipOutline(back);
      // Gradient fills, one per colour zone (zoneGradient): the body (Primary), the pattern's ink (Pattern) and
      // the trims (Secondary: side panels, bands, collar, placket, area blocks).
      const body = zoneGradient(design, 'main');
      // The track jacket's body may have its own colour (design.zoneColors.body) instead of the Primary.
      const ownBody = isTrack(this.kind) && HEX.test(design.zoneColors?.body ?? '') ? design.zoneColors.body : null;
      if (ownBody) { g.fillStyle = ownBody; g.fillRect(-1.6, -0.1, 3.2, 1.6); } else if (body) this.gradientFill(body);
      const ink = zoneGradient(design, 'patternColor');
      // The picture's own print all over the body (printTile), else the chosen pattern.
      if (this._print) this.fullPrint(design, back);
      else this.proceduralPattern(design, design.pattern, ink ? this.gradientStyle(ink) : ownPatternInk(design) ?? undefined);
      const trim = this.zoneFill(design, 'secondary');
      // The socks: their hoops, top band, heel and toe (sockprint.js), then the areas' patterns and the seams.
      // The cap: its brim, side sweeps, piping and eyelets (capprint.js), then the areas' patterns and the stitching.
      if (this.kind === 'cap') {
        paintCap(this, design, back, trim);
        this.paintZones(design, back);
        this.side(back);
        const sewn = this.tailoring(back);
        this.stitches(back, sewn.stitches, sewn.tone);
        g.restore();
        continue;
      }
      // The skirt: its side panels, waistband and seams (skirtprint.js), then the areas' patterns and the stitching.
      if (this.kind === 'skirt') {
        paintSkirt(this, design, back, trim);
        this.paintZones(design, back);
        this.side(back);
        const sewn = this.tailoring(back);
        this.stitches(back, sewn.stitches, sewn.tone, sewn.dash);
        g.restore();
        continue;
      }
      if (this.kind === 'socks') {
        paintSocks(this, design, back, trim);
        this.paintZones(design, back);
        this.side(back);
        this.stitches(back, this.tailoring(back).stitches);
        g.restore();
        continue;
      }

      const shorts = this.kind === 'shorts';
      const sleeves = SLEEVED.includes(this.kind);
      const hoodie = isHoodie(this.kind), track = isTrack(this.kind), varsity = isVarsity(this.kind);
      // Parts with a look of their own (design.parts), over the kit's colour and pattern and under its trims: the side
      // panels' own look goes on the panels themselves (below); the jackets' parts after their own areas.
      const sideKey = shorts ? 'shortsSides' : 'sides', sideStyle = this.partStyle(design, sideKey);
      if (!hoodie && !track && !varsity) this.paintParts(design, back, { skip: [sideKey] });
      g.fillStyle = trim;
      // Hoodies: no side panels or edge bands (their cuffs and waistband are rib, hoodie.js); the track jacket's own
      // panels are painted below (paintTrack); the varsity jacket has rib trims (varsity.js).
      // The compression top: long sleeves set in over where the panels would be; plain sides (its cuffs and hem banded below).
      for (const dir of hoodie || track || varsity || this.kind === 'compression' ? [] : [-1, 1]) {
        g.beginPath();
        if (isDress(this.kind)) {
          // The dress's side panels: in at the waist, out over the hips to the hem.
          dressSideLine(g, dir);
          g.lineTo(dir * 0.5, -0.01);
          g.lineTo(dir * 0.5, 0.7);
        } else if (shorts) {
          // Outer-leg stripe.
          g.moveTo(dir * 0.19, 0.43);
          g.lineTo(dir * 0.232, 0);
          g.lineTo(dir * 0.3, 0);
          g.lineTo(dir * 0.3, 0.43);
        } else if (this.kind === 'nfljersey') {
          // The football jersey's side panels: further round onto the front (zones.js NFL_PANEL).
          NFL_PANEL.forEach(([x, y], i) => (i ? g.lineTo(dir * x, y) : g.moveTo(dir * x, y)));
        } else {
          // Side panels.
          g.moveTo(dir * 0.262, 0.54);
          g.quadraticCurveTo(dir * 0.215, 0.3, dir * 0.23, 0);
          g.lineTo(dir * 0.3, 0);
          g.lineTo(dir * 0.3, 0.54);
        }
        g.closePath();
        g.fill();
        if (sideStyle) {
          g.save();
          g.clip();
          this.paintPartLook(design, sideStyle, this.partBox(sideKey, back), trim);
          g.restore();
          g.fillStyle = trim;
        }
      }
      // Bands an even width all the way round: the cuffs, the hem (leg hems on shorts), and
      // the waistband. Each reaches a little past the edge so the rolled hem is banded too.
      // The American football jersey (the client's pictures, DT1): a plain hem and wide cuff bands. (The netball dress's
      // hem is turned and stitched in its own fabric, as on the client's dress: no band.)
      const nfl = this.kind === 'nfljersey';
      // The compression top: plain hem and cuffs (no bands). (The netball dress's hem is turned and stitched in its own
      // fabric, as on the client's dress: no band either.)
      if (!hoodie && !track && !varsity && this.kind !== 'compression' && !isDress(this.kind)) for (const run of this.edges()) { if (nfl && run.kind === 'hem') continue; this.band(run.points, run.kind === 'cuff' ? (nfl ? NFL_CUFF_BAND : CUFF_BAND) : HEM_BAND); }
      if (shorts) {
        g.fillStyle = this.partStyle(design, 'waistband')?.own ?? trim;
        g.fillRect(-0.4, (this.points?.CF?.[1] ?? 0.42) - 0.025, 0.8, 0.03);
        g.fillStyle = trim;
      }

      // AI pattern across the shoulders and sleeves (the yoke), fading out.
      if (this._stencil) {
        const tile = design.patternScale ?? 0.3;
        const layer = document.createElement('canvas');
        const s = this.side(back);
        layer.width = this.canvas.height;
        layer.height = this.canvas.height;
        const lg = layer.getContext('2d');
        const pattern = lg.createPattern(this._stencil, 'repeat');
        const k = (tile * s) / this._stencil.width;
        pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
        lg.fillStyle = pattern;
        lg.fillRect(0, 0, layer.width, layer.height);
        // Fade the pattern below the chest: draw a gradient mask in canvas px.
        lg.globalCompositeOperation = 'destination-in';
        const { minY, span } = this.frame;
        const py = (y) => layer.height - ((y - minY) / span) * layer.height;
        // Tops: pattern across the yoke; shorts: across the legs.
        const mask = this.kind === 'shorts'
          ? lg.createLinearGradient(0, py(0.26), 0, py(0.03))
          : isDress(this.kind) ? lg.createLinearGradient(0, py(0.4 + DRESS_RAISE), 0, py(0.6 + DRESS_RAISE)) : lg.createLinearGradient(0, py(0.4), 0, py(0.6));
        mask.addColorStop(0, `rgba(0,0,0,${design.patternBody ?? 0.12})`);
        mask.addColorStop(1, 'rgba(0,0,0,1)');
        lg.fillStyle = mask;
        lg.fillRect(0, 0, layer.width, layer.height);
        this.erasePartsFrom(lg, design, back);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(layer, back ? this.canvas.height : 0, 0);
      }

      if (hoodie) this.paintHoodie(design, back);
      if (track) this.paintTrack(design, back);
      if (varsity) paintVarsity(this, design, back);
      if (hoodie || track || varsity) this.paintParts(design, back);
      this.paintZones(design, back);
      if (this.kind === 'nfljersey') this.paintNflTrims(design, back);

      // Collar trim: V-neck for jerseys and singlets, crew for tee and polo (the collar's own colour: design.parts).
      this.side(back);
      // (The compression top: a crew neck in the body's colour, as the client's picture.)
      g.strokeStyle = this.partStyle(design, 'collar')?.own ?? (this.kind === 'compression' ? this.baseFill(design) : trim);
      g.lineWidth = 0.018;
      if (this.kind === 'tee' || this.kind === 'raglan' || this.kind === 'polo' || this.kind === 'pocketpolo' || this.kind === 'compression') {
        g.beginPath();
        g.moveTo(-0.092, 0.745);
        g.quadraticCurveTo(0, back ? 0.73 : 0.66, 0.092, 0.745);
        g.stroke();
      } else if (isDress(this.kind)) {
        // The netball dress: its round neck and armholes bound in the trim colour (the neck in the collar's own colour
        // when it has one: the client's dress has a black neck and cyan armholes).
        // (The armholes' binding wider, as on the client's dress: about 1.6 cm, turning away round the strap's edge.)
        const runs = this.dressEdges(), neckInk = g.strokeStyle;
        g.lineJoin = 'round';
        for (const run of [runs.neck, ...runs.armholes]) {
          g.strokeStyle = run === runs.neck ? neckInk : trim;
          g.lineWidth = run === runs.neck ? 0.018 : 0.032;
          g.beginPath();
          run.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
          g.stroke();
        }
      } else if (!shorts && !hoodie && !track && !varsity) {
        g.beginPath();
        g.moveTo(-0.095, 0.745);
        g.lineTo(0, back ? 0.69 : 0.668);
        g.lineTo(0.095, 0.745);
        g.stroke();
      }
      // The compression top: thin raglan piping from the neck down to each underarm, front and back (the client's
      // picture; CF1 2026-10-29), in the trim colour.
      // (DT4: about 1 cm wide and running down the front of the chest to the underarm, as the picture's; and a stripe
      // along each sleeve's underside from the underarm to the cuff.)
      if (this.kind === 'compression') {
        g.save();
        g.strokeStyle = trim;
        g.lineWidth = 0.009;
        g.lineCap = 'round';
        for (const dir of [-1, 1]) {
          g.beginPath();
          g.moveTo(dir * 0.088, back ? 0.744 : 0.738);
          g.quadraticCurveTo(dir * 0.17, 0.69, dir * 0.256, 0.53);
          g.stroke();
        }
        // Its seam: a fine dark line along the piping, a little to the sleeve side.
        g.save();
        g.strokeStyle = 'rgba(0,0,0,0.38)';
        g.lineWidth = 0.0011;
        for (const dir of [-1, 1]) {
          g.beginPath();
          g.moveTo(dir * 0.0905, back ? 0.746 : 0.74);
          g.quadraticCurveTo(dir * 0.1725, 0.692, dir * 0.2585, 0.532);
          g.stroke();
        }
        g.restore();
        // The sleeve stripe: along the outline's underarm edge from the underarm to the cuff, widening down the arm as
        // the picture's (compressionStripe; the outline clips what lies past the edge).
        g.fillStyle = trim;
        for (const run of this.sleeveUnderEdges()) {
          if (run.length < 2) continue;
          const path = [...this.inset(run, -0.004, 0.02), ...this.inset(run, alongRun(run, compressionStripe), 0.02).reverse()];
          g.beginPath();
          path.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
          g.closePath();
          g.fill();
        }
        g.restore();
      }
      // Polo button placket.
      if ((this.kind === 'polo' || this.kind === 'pocketpolo') && !back) {
        g.fillStyle = trim;
        g.fillRect(-0.02, 0.57, 0.04, 0.15);
        g.fillStyle = design.accent;
        for (const y of [0.6, 0.64, 0.68]) {
          g.beginPath();
          g.arc(0, y, 0.006, 0, Math.PI * 2);
          g.fill();
        }
      }
      // The chest pocket: a soft shadow on the shirt round its sewn edges and its top hem in the trim colour (the
      // pocket itself is the body's fabric, or its own colour zone: Apply to area, Chest pocket).
      if (hasPocket(this.kind) && !back) {
        const { x0, x1, top, hem } = POCKET;
        g.save();
        g.strokeStyle = 'rgba(0,0,0,0.16)';
        g.lineWidth = 0.007;
        g.beginPath();
        pocketPath(g, -0.0016, false);
        g.stroke();
        g.restore();
        g.fillStyle = trim;
        g.fillRect(x0, top - hem * 0.42, x1 - x0, hem * 0.42);
      }
      // Tailoring details are painted in the same panel coordinates as the kit (in the garment's own thread, if any).
      const sewn = this.tailoring(back);
      this.stitches(back, sewn.stitches, sewn.tone);
      g.restore();
    }

    // The fixed marks: wordmark, sponsor and crest on the front, name and number on the back (shorts: crest,
    // number and a small wordmark). Each can be moved, resized, turned or hidden on the design board.
    const logo = (design.logoText || '').toUpperCase();
    const textOutline = mix(design.main, '#000000', 0.5);
    this.marks = [];
    [this._brandWord, this._brandMark] = await brandImages();
    // The socks: only the crest, on the shin.
    // The cap: the crest on the front panel, the club's word under it.
    if (this.kind === 'cap') {
      await paintCapMarks(this, design, loadImage, textOutline);
      await this.paintLayers(design);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return this.canvas;
    }
    // The skirt: the crest low on the left front, the club's word under it.
    if (this.kind === 'skirt') {
      await paintSkirtMarks(this, design, loadImage, logo, textOutline);
      await this.paintLayers(design);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return this.canvas;
    }
    if (this.kind === 'socks') {
      await paintSockMarks(this, design, loadImage);
      await this.paintLayers(design);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return this.canvas;
    }
    if (this.kind === 'shorts') {
      await this.paintShortsMarks(design, logo, textOutline);
      await this.paintLayers(design);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return this.canvas;
    }
    // Logos added on the 3D kit itself (task 9.144, ids 'kit-…': a crest copy on the other chest) keep the crest, as does
    // a tile picture's own object (ids 'tile-…': the netball dress's position bib).
    const ownArt = (design.layers ?? []).some((l) => l.side !== 'back' && (l.part ?? 'top') === 'top' && l.type !== 'text' && !/^(kit|tile)-/.test(String(l.id ?? '')));
    // The varsity jacket: a chenille letter (or the logo) on the chest, the club arched across the back, the name and
    // a big number under it, sleeve patches (varsity.js).
    if (isVarsity(this.kind)) {
      if (design.sponsorImage && design.sponsorImage !== this._sponsorKey) {
        this._sponsor = await loadImage(design.sponsorImage).catch(() => null);
        this._sponsorKey = design.sponsorImage;
      }
      if (design.logoImage && design.logoImage !== this._logoKey) {
        this._logo = await loadImage(design.logoImage).catch(() => null);
        this._logoKey = design.logoImage;
      } else if (!design.logoImage) { this._logo = null; this._logoKey = null; }
      paintVarsityMarks(this, design, { logo, logoImg: this._logo, sponsorImg: design.sponsorImage ? this._sponsor : null, ownArt });
      await this.paintLayers(design);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return this.canvas;
    }
    // The pocket polo (pool and darts shirts): the team name small on the right chest, the crest on the pocket (it
    // can be moved above it on the 2D panels), the player's name across the upper back and the sponsor low on the back.
    const pocket = hasPocket(this.kind), hoodie = isHoodie(this.kind), zip = this.kind === 'ziphoodie' || isTrack(this.kind);
    // The track jacket: as the zip hoodie in front (the club name small on the right chest, the crest on the left),
    // the sponsor on the right sleeve, the name and number (or the club's name) across the back.
    const track = isTrack(this.kind);
    // Hoodies: the wordmark across the chest above the pocket (the zip hoodie's small on the right chest, clear of the
    // zip), the crest on the left chest, the sponsor on the pocket (the zip hoodie's low on the back), the name and
    // number on the back below the hood.
    if (zip) this.markText(design, 'wordmark', { side: 'front', x: -0.105, y: 0.575 }, logo, 0.034, design.accent, 0.13, textOutline);
    else if (hoodie) this.markText(design, 'wordmark', { side: 'front', x: 0, y: 0.43 }, logo, 0.075, design.accent, 0.3, textOutline);
    else if (pocket) this.markText(design, 'wordmark', { side: 'front', x: -0.105, y: 0.56 }, logo, 0.036, design.accent, 0.12, textOutline);
    // The netball dress: as on the client's dress, the 3DEEZI wordmark across the bust (narrower: the bust curves away)
    // under the "3" mark (the crest, below), the position bib under them; the club's own words as wide as before.
    else if (isDress(this.kind)) this.markText(design, 'wordmark', { side: 'front', x: 0, y: 0.663 }, logo, 0.075, design.accent, logo === '3DEEZI' ? 0.17 : 0.26, textOutline);
    // The American football jersey (task 9.113; the client's Game Jersey picture, DT1): the team name centred across
    // the chest above the big front number.
    else if (this.kind === 'nfljersey') this.markText(design, 'wordmark', { side: 'front', x: 0, y: 0.566 }, logo, 0.06, design.accent, 0.195, textOutline);
    // The compression top (the client's picture; CF1 2026-10-29): the wordmark high across the chest, under the crest.
    // (DT4: a little lower, the crest just above it and a little bigger, as the picture.)
    else if (this.kind === 'compression') this.markText(design, 'wordmark', { side: 'front', x: 0, y: 0.533 }, logo, 0.05, design.accent, 0.2, textOutline);
    else this.markText(design, 'wordmark', { side: 'front', x: 0, y: 0.47 }, logo, 0.085, design.accent, 0.3, textOutline);
    // Sponsor logo: front, centred below the wordmark, fitted into 17 x 6.5 cm.
    if (design.sponsorImage) {
      if (design.sponsorImage !== this._sponsorKey) {
        this._sponsor = await loadImage(design.sponsorImage).catch(() => null);
        this._sponsorKey = design.sponsorImage;
      }
      if (this._sponsor && track) this.markImage(design, 'sponsor', TRACK_SPONSOR, this._sponsor, 0.09, 0.03);
      else if (this._sponsor && zip) this.markImage(design, 'sponsor', { side: 'back', x: 0, y: 0.09 }, this._sponsor, 0.2, 0.07);
      else if (this._sponsor && hoodie) this.markImage(design, 'sponsor', { side: 'front', x: 0, y: 0.19 }, this._sponsor, 0.17, 0.065);
      else if (this._sponsor && pocket) this.markImage(design, 'sponsor', { side: 'back', x: 0, y: 0.17 }, this._sponsor, 0.24, 0.09);
      else if (this._sponsor && isDress(this.kind)) this.markImage(design, 'sponsor', { side: 'front', x: 0, y: 0.335 + DRESS_RAISE }, this._sponsor, 0.15, 0.06);
      else if (this._sponsor) this.markImage(design, 'sponsor', { side: 'front', x: 0, y: 0.335 }, this._sponsor, 0.17, 0.065);
    }
    if (design.logoImage) {
      if (design.logoImage !== this._logoKey) {
        this._logo = await loadImage(design.logoImage).catch(() => null);
        this._logoKey = design.logoImage;
      }
    } else {
      this._logo = null;
      this._logoKey = null;
    }
    // Uploaded club logo on the chest, fitted into a 7 cm box; else the 3DEEZI shield (none when the user's own
    // artwork is on the kit).
    // The American football jersey: a small crest just under the V of the neck (the client's Game Jersey picture).
    const nflCrest = this.kind === 'nfljersey', stacked = this.kind === 'compression';
    // (The compression top: the crest centred above the wordmark.)
    // (The netball dress: the "3" mark above the wordmark's right end, a little smaller, as on the client's dress.)
    const crest = nflCrest ? { side: 'front', x: 0, y: 0.632 } : stacked ? { side: 'front', x: 0, y: 0.577 } : isDress(this.kind) ? { side: 'front', x: 0.047, y: 0.707 } : hoodie || track ? { side: 'front', x: 0.105, y: 0.575 } : pocket ? { side: 'front', x: (POCKET.x0 + POCKET.x1) / 2, y: (POCKET.bottom + POCKET.top - POCKET.hem) / 2 } : { side: 'front', x: 0.105, y: 0.6 };
    // (FX3: the compression top's '3' mark a little wider, as the picture's: 85 px against 77.)
    const crestK = nflCrest ? 0.38 : stacked ? 0.95 : 1;
    if (this._logo) this.markImage(design, 'crest', crest, this._logo, nflCrest ? 0.045 : pocket ? 0.075 : 0.07, nflCrest ? 0.045 : pocket ? 0.075 : 0.07);
    else if (!ownArt && isDress(this.kind)) this.markShield(design, 'crest', crest, [[0, 0.027], [0.022, 0.014], [0.017, -0.016], [0, -0.028], [-0.017, -0.016], [-0.022, 0.014]], 0.024, 0.032);
    else if (!ownArt) this.markShield(design, 'crest', crest, [[0, 0.034], [0.028, 0.018], [0.022, -0.02], [0, -0.036], [-0.022, -0.02], [-0.028, 0.018]].map(([x, y]) => [x * crestK, y * crestK]), 0.03 * crestK, 0.04 * crestK);
    const backName = (design.backName || logo).toUpperCase();
    if (hoodie || (track && this.trackHood)) {
      this.markText(design, 'name', { side: 'back', x: 0, y: 0.43 }, backName, 0.055, design.accent, 0.3, textOutline);
      this.markText(design, 'number', { side: 'back', x: 0, y: 0.25 }, String(design.number ?? '23'), 0.19, design.accent, 0.28, textOutline);
    } else if (pocket) {
      this.markText(design, 'name', { side: 'back', x: 0, y: 0.6 }, backName, 0.075, design.accent, 0.34, textOutline);
      this.markText(design, 'number', { side: 'back', x: 0, y: 0.43 }, String(design.number ?? '23'), 0.15, design.accent, 0.22, textOutline);
    } else if (isDress(this.kind)) {
      this.markText(design, 'name', { side: 'back', x: 0, y: 0.6 + DRESS_RAISE }, backName, 0.055, design.accent, 0.24, textOutline);
      this.markText(design, 'number', { side: 'back', x: 0, y: 0.38 + DRESS_RAISE }, String(design.number ?? '23'), 0.22, design.accent, 0.28, textOutline);
    } else if (this.kind === 'nfljersey') {
      // The American football jersey: the big number on the back and on the front too (as on the client's Game
      // Jersey tile); the front one takes the Number's colour, look and hiding, and can be moved on its own.
      const own = design.marks ?? {}, num = own.top_number ?? {};
      const shared = { ...(num.color ? { color: num.color } : {}), ...(num.look ? { look: num.look } : {}), ...(num.hidden ? { hidden: true } : {}) };
      const both = { ...design, marks: { ...own, top_frontNumber: { ...shared, ...own.top_frontNumber } } };
      this.markText(design, 'name', { side: 'back', x: 0, y: 0.62 }, backName, 0.055, design.accent, 0.28, textOutline);
      // Square block jersey numerals (JerseyBlock, the client's pictures).
      this.markText(design, 'number', { side: 'back', x: 0, y: 0.37 }, String(design.number ?? '23'), 0.26, design.accent, 0.32, textOutline, NFL_FONT, NFL_SQUEEZE);
      this.markText(both, 'frontNumber', { side: 'front', x: 0, y: 0.38 }, String(design.number ?? '23'), 0.24, design.accent, 0.3, textOutline, NFL_FONT, NFL_SQUEEZE);
    } else {
      this.markText(design, 'name', { side: 'back', x: 0, y: 0.6 }, backName, 0.06, design.accent, 0.28, textOutline);
      this.markText(design, 'number', { side: 'back', x: 0, y: 0.38 }, String(design.number ?? '23'), 0.24, design.accent, 0.3, textOutline);
    }
    await this.paintLayers(design);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return this.canvas;
  }

  /** The picture's own print (printTile) across the whole side, `design.patternScale` metres a repeat (one patch). */
  fullPrint(design, back) {
    const g = this.ctx, at = g.getTransform();
    const s = this.side(back), size = this.canvas.height;
    const pattern = g.createPattern(this._print, 'repeat');
    const k = ((design.patternScale ?? 0.3) * s) / this._print.width;
    pattern.setTransform(new DOMMatrix([k, 0, 0, k, back ? size : 0, 0]));
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = pattern;
    g.fillRect(back ? size : 0, 0, size, size);
    g.setTransform(at);
  }

  /** A gradient across the body, in panel metres (any number of stops); angle 0 runs top to bottom. */
  gradientStyle({ stops, angle = 0 }) {
    const g = this.ctx;
    // The netball dress is taller: its gradient runs from its shoulders to its hem.
    const a = (angle * Math.PI) / 180, cx = 0, cy = isDress(this.kind) ? 0.44 : 0.38, r = isDress(this.kind) ? 0.47 : 0.42;
    const dx = Math.sin(a) * r, dy = -Math.cos(a) * r;
    const grad = g.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    for (const s of stops) grad.addColorStop(s.at, s.color);
    return grad;
  }

  /** Fills the whole panel with a gradient (the body's Primary zone). */
  gradientFill(gradient) {
    const g = this.ctx, w = this.frame.maxX > 0.5 ? 1.6 : 0.6;
    g.fillStyle = this.gradientStyle(gradient);
    g.fillRect(-w, -0.1, 2 * w, 1);
  }

  /** A colour zone's paint: its gradient when it has one, else its solid colour. */
  zoneFill(design, slot) {
    const gradient = zoneGradient(design, slot);
    return gradient ? this.gradientStyle(gradient) : design[slot];
  }

  /**
   * A hoodie's own colour zones on the atlas (design.zoneColors, hex): the hood's outer fabric (its piece on the back;
   * otherwise the body's fill), the kangaroo pocket (on the front, under the 3D pocket) and the sleeve stripe. The lining, rib, zip and
   * drawstring are coloured on their own 3D parts (main.js).
   */
  paintHoodie(design, back) {
    const g = this.ctx, own = (key) => (HEX.test(design.zoneColors?.[key] ?? '') ? design.zoneColors[key] : null);
    g.save();
    this.side(back);
    if (back) {
      // The hood: the body's fill (its gradient too) unless it has its own colour.
      g.beginPath();
      for (const piece of this.piecesOn(true)) { piece.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }
      g.clip();
      const body = zoneGradient(design, 'main');
      g.fillStyle = own('hood') ?? design.main;
      g.fillRect(-0.8, HOOD_TOP - 0.5, 1.6, 0.6);
      if (body && !own('hood')) { g.translate(0, HOOD_TOP - 0.78); this.gradientFill(body); }
    } else if (own('pocket')) {
      g.beginPath();
      for (const sgn of kangarooSides(this.kind)) kangarooPath(g, -0.004, sgn);
      g.clip();
      g.fillStyle = own('pocket');
      g.fillRect(-0.4, 0, 0.8, 0.4);
    }
    g.restore();
    // The sleeve stripe (task 9.154, the client's hoodie picture): along the shoulder and the sleeve's top seam, from
    // the neck to the cuff, 5 cm wide; none while it has no colour of its own (Hoodie areas).
    if (own('stripe')) {
      g.save();
      this.side(back);
      g.strokeStyle = own('stripe');
      g.lineWidth = 0.05;
      g.lineJoin = 'round';
      for (const run of this.trackTopEdges()) { g.beginPath(); run.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
      g.restore();
    }
    if (!back) {
      // The hand openings' turned-in edges, a touch darker.
      g.save();
      this.side(false);
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineWidth = 0.006;
      for (const sgn of [-1, 1]) { g.beginPath(); openingPath(g, sgn, 0.003); g.stroke(); }
      g.restore();
    }
  }

  /**
   * The track jacket's own colour areas on the atlas (design.zoneColors, hex): the shoulder and sleeve panels and the
   * side panels (default Secondary), the sleeve stripe along the top seam from the neck to the cuff (default Accent),
   * the collar or hood (its piece on the back; default the body's fill), and the side pockets' welts. The body's own
   * colour is the background (paint); the cuffs, hem band and zip are coloured on their 3D parts (main.js).
   */
  paintTrack(design, back) {
    const g = this.ctx, own = (key) => (HEX.test(design.zoneColors?.[key] ?? '') ? design.zoneColors[key] : null);
    const trim = this.zoneFill(design, 'secondary');
    g.save();
    this.side(back);
    for (const dir of [-1, 1]) {
      g.fillStyle = own('shoulder') ?? trim;
      g.beginPath();
      trackShoulderLine(g, dir);
      g.lineTo(dir * 0.8, 0.3);
      g.lineTo(dir * 0.8, 0.9);
      g.lineTo(dir * 0.075, 0.9);
      g.closePath();
      g.fill();
      g.fillStyle = own('side') ?? trim;
      g.beginPath();
      trackSideLine(g, dir);
      g.lineTo(dir * 0.3, -0.01);
      g.lineTo(dir * 0.3, 0.47);
      g.closePath();
      g.fill();
    }
    // The stripe: along the outline's top edge (the shoulder and sleeve seam), 1.2 cm on each panel.
    g.strokeStyle = own('stripe') ?? design.accent;
    g.lineWidth = 0.024;
    g.lineJoin = 'round';
    for (const run of this.trackTopEdges()) { g.beginPath(); run.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
    if (!back) {
      // The side pockets' welts: a narrow, slightly darker strip round each zip (the zip itself is 3D).
      g.strokeStyle = 'rgba(0,0,0,0.2)';
      g.lineWidth = 0.027;
      g.lineCap = 'round';
      for (const sgn of [-1, 1]) { g.beginPath(); trackPocketLine(g, sgn); g.stroke(); }
    }
    g.restore();
    if (back) {
      // The collar or hood: the body's fill (its gradient too) unless it has its own colour.
      g.save();
      this.side(true);
      g.beginPath();
      for (const piece of this.piecesOn(true)) { piece.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }
      g.clip();
      const body = zoneGradient(design, 'main'), ownBody = own('body');
      g.fillStyle = own('collar') ?? ownBody ?? design.main;
      g.fillRect(-0.8, HOOD_TOP - 0.5, 1.6, 0.6);
      if (body && !own('collar') && !ownBody) { g.translate(0, HOOD_TOP - 0.78); this.gradientFill(body); }
      g.restore();
    }
  }

  /** The outline's top edge on each side (the shoulder seam and the sleeve's top seam, neck to cuff), as point runs. */
  /** A long sleeve's underside (the outline's edge from the underarm to the cuff's lower corner), each side. */
  sleeveUnderEdges() {
    if (this._underEdges) return this._underEdges;
    const poly = this.outline, n = poly.length;
    const nearest = (x, y) => poly.reduce((best, p, i) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(poly[best].x - x, poly[best].y - y) ? i : best), 0);
    const runs = [];
    for (const dir of [-1, 1]) {
      // (To the cuff's lower corner: the sleeves are longer since CF1.)
      const [cx, cy] = this.points?.CB ?? [0.613, 0.224];
      const a = nearest(dir * 0.271, 0.529), b = nearest(dir * cx, cy), run = [];
      const fwd = (b - a + n) % n, step = fwd <= n / 2 ? 1 : -1;
      for (let i = a; ; i = (i + step + n) % n) { run.push(poly[i]); if (i === b) break; }
      runs.push(run);
    }
    return (this._underEdges = runs);
  }

  trackTopEdges() {
    if (this._topEdges) return this._topEdges;
    const poly = this.outline, n = poly.length;
    const nearest = (x, y) => poly.reduce((best, p, i) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(poly[best].x - x, poly[best].y - y) ? i : best), 0);
    const runs = [];
    for (const dir of [-1, 1]) {
      const a = nearest(dir * 0.098, 0.738), b = nearest(dir * 0.68, 0.262), run = [];
      // The short way round between them.
      const fwd = (b - a + n) % n, step = fwd <= n / 2 ? 1 : -1;
      for (let i = a; ; i = (i + step + n) % n) { run.push(poly[i]); if (i === b) break; }
      // On a little way past each end (the neck edge, the cuff), so the stripe's ends are square to them.
      runs.push(run);
    }
    return (this._topEdges = runs);
  }

  /**
   * The American football jersey's own trims (the client's pictures, DT1), on one side: piping round its shoulder caps
   * while they have a colour (Game Jersey: neck to underarm, and down the sleeve to the cuff, in the caps' colour); the
   * shoulder stripe along the sleeve's top seam from the shoulder to the cuff (Practice Jersey: design.zoneColors.stripe);
   * and, on the Mesh fabric, the yoke's seam across the chest and back (above it the cloth is smooth: render-quality.js).
   */
  paintNflTrims(design, back) {
    const g = this.ctx, cap = design.zones?.yoke;
    g.save();
    this.side(back);
    g.lineJoin = 'round';
    g.lineCap = 'butt';
    if (cap && cap !== 'None') {
      g.strokeStyle = this.zoneFill(design, ownPatternInk(design) ? 'patternColor' : 'secondary');
      g.lineWidth = 0.0065;
      for (const dir of [-1, 1]) {
        g.beginPath(); g.moveTo(dir * 0.1, 0.75); g.quadraticCurveTo(dir * 0.168, 0.628, dir * 0.262, 0.536); g.stroke();
        g.beginPath(); g.moveTo(dir * 0.252, 0.592); g.lineTo(dir * 0.385, 0.537); g.stroke();
      }
    }
    const stripe = HEX.test(design.zoneColors?.stripe ?? '') ? design.zoneColors.stripe : null;
    if (stripe) {
      // The Practice Jersey picture (FX3): a wide stripe down the front (and back) of each shoulder along the armhole,
      // from the top of the shoulder to the underarm, widest over the shoulder, so it shows clearly from the front.
      g.fillStyle = stripe;
      for (const dir of [-1, 1]) {
        g.beginPath();
        taperedBand(NFL_STRIPE.map(([x, y, w]) => [dir * x, y, w])).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.fill();
      }
    }
    // The Practice Jersey picture (FX3): a small cyan insert in the point of the V, notched at the top under the collar
    // (design.zoneColors.vInsert; front only).
    const vInsert = HEX.test(design.zoneColors?.vInsert ?? '') ? design.zoneColors.vInsert : null;
    if (vInsert && !back) {
      g.fillStyle = vInsert;
      g.beginPath();
      [[-0.0135, 0.668], [0, 0.662], [0.0135, 0.668], [0.0125, 0.648], [0, 0.637], [-0.0125, 0.648]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
    }
    if (design.fabric === 'Mesh') {
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.lineWidth = 0.0025;
      g.beginPath(); g.moveTo(-0.262, NFL_YOKE); g.lineTo(0.262, NFL_YOKE); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.lineWidth = 0.0012;
      g.beginPath(); g.moveTo(-0.262, NFL_YOKE - 0.004); g.lineTo(0.262, NFL_YOKE - 0.004); g.stroke();
    }
    g.restore();
  }

  /** An uploaded area pattern's tile (its full-colour print, or its stencil in the area patterns' ink), once loaded. */
  zoneTile(design, name) {
    return this._zoneTiles?.get(name.length + (zoneInk(design) ?? '') + name.slice(-64));
  }

  /** Patterns or colour blocks dropped onto areas (sleeves, shoulders, ...). */
  paintZones(design, back) {
    const g = this.ctx;
    for (const [zone, name] of Object.entries(design.zones ?? {})) {
      if (!name || name === 'None') continue;
      if (zone === 'pocket' && (back || !(hasPocket(this.kind) || isHoodie(this.kind)))) continue;
      if (zone === 'hood' && (!back || !(isHoodie(this.kind) || isTrack(this.kind)))) continue;
      g.save();
      this.side(back);
      g.beginPath();
      if (zone === 'pocket' && isHoodie(this.kind)) for (const sgn of kangarooSides(this.kind)) kangarooPath(g, -0.004, sgn);
      else if (zone === 'pocket') pocketPath(g);
      // The hood's patterns are drawn as on the body, moved up onto its piece.
      if (zone === 'hood') { for (const piece of this.piecesOn(true)) { piece.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); } g.clip(); g.translate(0, HOOD_TOP - 0.78); g.beginPath(); }
      // A garment's own area shape (zonePolys) first; else the Swirl on the shoulders of a sleeved top: a raglan piece
      // from the neck down to the underarm, the chest and collar between them left plain (the client's football and
      // hockey jersey pictures, DT3).
      const polys = zonePolys(this.kind, zone);
      if (polys) for (const poly of polys) { poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
      else if (zone === 'yoke' && name === 'Swirl' && SLEEVED.includes(this.kind) && !isHoodie(this.kind) && !isTrack(this.kind)) {
        // A bare sleeve (no pattern of its own): the shoulders' maze reaches over its top, fading out down the arm (FX3,
        // the client's football and hockey jersey picture); else above the sleeve area only (it has its own pattern).
        const bare = !design.zones?.sleeves || design.zones.sleeves === 'None';
        this._swirlSleeve = bare;
        for (const dir of [-1, 1]) {
          g.moveTo(dir * 0.085, 0.85);
          g.quadraticCurveTo(dir * 0.16, 0.66, dir * 0.262, 0.54);
          if (bare) {
            g.lineTo(dir * 0.262, -0.1);
            g.lineTo(dir * 0.6, -0.1);
          } else {
            g.lineTo(dir * 0.27, 0.54);
            g.lineTo(dir * 0.27, 0.76);
            g.lineTo(dir * 0.6, 0.76);
          }
          g.lineTo(dir * 0.6, 0.85);
          g.closePath();
        }
      } else for (const [x0, y0, x1, y1] of zoneRects(this.kind, zone)) g.rect(x0, y0, x1 - x0, y1 - y0);
      g.clip();
      if (isPicture(name)) {
        const tile = this.zoneTile(design, name);
        if (tile) {
          const pattern = g.createPattern(tile, 'repeat');
          const k = (design.patternScale ?? 0.3) / tile.width;
          // Upright on the canvas (the side's frame has y up, and the back is mirrored).
          pattern.setTransform(new DOMMatrix([back ? -k : k, 0, 0, -k, 0, 0]));
          g.fillStyle = pattern;
          g.fillRect(-1.6, -0.1, 3.2, 1.6);
        }
      } else if (name === 'Solid') {
        g.fillStyle = this.zoneFill(design, ownPatternInk(design) ? 'patternColor' : 'secondary');
        g.fillRect(-1.6, -0.1, 3.2, 1.6);
      } else {
        this.proceduralPattern(design, name, this.zoneFill(design, ownPatternInk(design) ? 'patternColor' : 'secondary'));
      }
      this._swirlSleeve = false;
      g.restore();
      // The raglan seam's thin piping in the accent colour, along the Swirl's edge (the pictures' cyan line).
      if (zone === 'yoke' && name === 'Swirl' && !zonePolys(this.kind, zone) && SLEEVED.includes(this.kind) && !isHoodie(this.kind) && !isTrack(this.kind)) {
        g.save();
        this.side(back);
        g.strokeStyle = HEX.test(design.accent ?? '') ? design.accent : design.secondary;
        g.lineWidth = 0.005;
        for (const dir of [-1, 1]) {
          g.beginPath();
          g.moveTo(dir * 0.085, 0.85);
          g.quadraticCurveTo(dir * 0.16, 0.66, dir * 0.262, 0.54);
          g.stroke();
        }
        g.restore();
      }
    }
  }

  image(src) {
    this._images ??= new Map();
    if (this._images.size > 60) this._images.clear();
    if (!this._images.has(src)) this._images.set(src, loadImage(src).catch(() => null));
    return this._images.get(src);
  }

  /** The kit part a layer belongs to. */
  get partName() {
    return this.kind === 'shorts' ? 'shorts' : 'top';
  }

  /** User artwork and text, placed anywhere, sized and rotated (degrees, clockwise). */
  async paintLayers(design) {
    const g = this.ctx;
    this.layerBoxes = [];
    for (const layer of design.layers ?? []) {
      if ((layer.part ?? 'top') !== this.partName) continue;
      const back = layer.side === 'back';
      const img = layer.type === 'image' ? await this.image(layer.src) : null;
      if (layer.type === 'image' && !img) continue;
      g.save();
      this.clipOutline(back);
      // An object on one part only (task 9.134): cut to that part; not drawn where the part is not.
      if (layer.clip && !this.clipPart(layer.clip, back)) { g.restore(); continue; }
      g.translate(layer.x, layer.y);
      g.scale(back ? -1 : 1, -1);
      g.rotate(((layer.rot ?? 0) * Math.PI) / 180);
      g.globalAlpha = layer.opacity ?? 1;
      if (layer.type === 'text') {
        const size = layer.size ?? 0.06, str = String(layer.text ?? '');
        // A text object drawn narrower (`narrow`, 0.3 to 1; the compression top picture's tall condensed block "3" on
        // the sleeve, FM print fixer); none = as before.
        const squeeze = Math.min(1, Math.max(0.3, Number(layer.narrow) || 1));
        // A text object's own font and word look (FX3, the American football jerseys' pictures: the bold slanted block
        // "3" on the chest, the shoulder numbers); none = as before.
        if (layerFont(layer) || layer.look) {
          if (squeeze < 1) g.scale(squeeze, 1);
          const { w, h } = drawWord(g, str, size, layer.color ?? design.accent, Infinity, layer.look ?? {}, null, design.main, layerFont(layer));
          this.layerBoxes.push({ id: layer.id, side: layer.side, x: layer.x, y: layer.y, rot: layer.rot ?? 0, w: w * squeeze, h });
          g.restore();
          continue;
        }
        g.font = `700 ${size}px Rajdhani, Inter, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = layer.color ?? design.accent;
        // The netball dress's position letters (ids 'tile-position…', the client's dress): tall condensed block letters,
        // filled out a little and edged with a fine dark line, as printed on its bib.
        const bib = isDress(this.kind) && String(layer.id ?? '').startsWith('tile-position'), narrow = bib ? 0.53 : squeeze;
        if (bib) {
          g.save();
          g.scale(narrow, 1);
          g.lineJoin = 'round';
          g.lineWidth = size * 0.075;
          g.strokeStyle = 'rgba(0,0,0,0.55)';
          g.strokeText(str, 0, 0);
          g.lineWidth = size * 0.045;
          g.strokeStyle = g.fillStyle;
          g.strokeText(str, 0, 0);
          g.fillText(str, 0, 0);
          g.restore();
        } else {
          if (narrow < 1) g.scale(narrow, 1);
          g.fillText(str, 0, 0);
        }
        this.layerBoxes.push({ id: layer.id, side: layer.side, x: layer.x, y: layer.y, rot: layer.rot ?? 0, w: g.measureText(str).width * narrow, h: size });
      } else if (layer.type === 'shape') {
        const w = layer.w ?? 0.1, h = layer.h ?? w;
        g.fillStyle = layer.color ?? design.accent;
        // A tile's position bib (ids 'tile-bib…', a rectangle: the client's netball dress) is a patch sewn on.
        if (String(layer.id ?? '').startsWith('tile-bib') && layer.shape !== 'ellipse' && layer.shape !== 'triangle') this.sewnPatch(g, w, h);
        else {
          g.beginPath();
          if (layer.shape === 'ellipse') g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
          else if (layer.shape === 'triangle') { g.moveTo(0, -h / 2); g.lineTo(w / 2, h / 2); g.lineTo(-w / 2, h / 2); g.closePath(); }
          else g.rect(-w / 2, -h / 2, w, h);
          g.fill();
        }
        this.layerBoxes.push({ id: layer.id, side: layer.side, x: layer.x, y: layer.y, rot: layer.rot ?? 0, w, h });
      } else if (img) {
        const w = layer.w ?? 0.1, h = (w * img.height) / img.width;
        g.drawImage(img, -w / 2, -h / 2, w, h);
        this.layerBoxes.push({ id: layer.id, side: layer.side, x: layer.x, y: layer.y, rot: layer.rot ?? 0, w, h });
      }
      g.restore();
    }
  }

  /**
   * A patch sewn on (`w` x `h` metres, centred, y down, in the current fill): lifted by a soft shadow, its edge lit above
   * and shaded below, a row of stitches just inside it, tone on tone.
   */
  sewnPatch(g, w, h) {
    const fill = g.fillStyle, path = (d = 0) => { g.beginPath(); g.rect(-w / 2 + d, -h / 2 + d, w - 2 * d, h - 2 * d); };
    g.save();
    this.liftShadow(g, Math.min(w, h) * 0.6);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    path(); g.fill();
    g.restore();
    // (Its bottom edge a thick lip standing off the stomach, a soft shadow under it, as the client's bib: DT6.)
    const under = g.createLinearGradient(0, h / 2, 0, h / 2 + 0.012);
    under.addColorStop(0, 'rgba(0,0,0,0.55)');
    under.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = under;
    g.fillRect(-w / 2 + 0.002, h / 2, w - 0.004, 0.012);
    g.save();
    path(); g.clip();
    g.fillStyle = fill;
    g.fillRect(-w, -h, 2 * w, 2 * h);
    const rim = 0.0035;
    // (A fine lighter edge all round, as the client's bib shows, lit a little more along its top.)
    path(rim * 0.2);
    g.lineWidth = rim * 0.55; g.strokeStyle = 'rgba(255,255,255,0.13)'; g.stroke();
    for (const [dy, style] of [[-rim * 0.45, 'rgba(255,255,255,0.2)'], [rim * 0.45, 'rgba(0,0,0,0.5)']]) {
      g.save(); g.translate(0, -dy); path(); g.restore();
      g.lineWidth = rim; g.strokeStyle = style; g.stroke();
    }
    g.beginPath(); g.moveTo(-w / 2, h / 2 - 0.0025); g.lineTo(w / 2, h / 2 - 0.0025);
    g.lineWidth = 0.0035; g.strokeStyle = 'rgba(255,255,255,0.17)'; g.stroke();
    g.setLineDash([0.0026, 0.0017]);
    g.lineCap = 'round';
    for (const [style, wd, dx] of [['rgba(0,0,0,0.5)', 0.0015, 0.0003], ['rgba(255,255,255,0.36)', 0.0008, 0]]) {
      g.save(); g.translate(dx, dx); path(0.0055); g.restore();
      g.lineWidth = wd; g.strokeStyle = style; g.stroke();
    }
    g.restore();
  }

  /** Garment metres -> texture pixels. */
  toCanvas(back, x, y) {
    const { minX, maxX, minY, span } = this.frame;
    const H = this.canvas.height, s = H / span;
    return { x: back ? H + (maxX - x) * s : (x - minX) * s, y: H - (y - minY) * s, s };
  }

  /** Texture pixels -> { side, x, y } in garment metres. */
  fromCanvas(px, py) {
    const { minX, maxX, minY, span } = this.frame;
    const H = this.canvas.height, s = H / span, back = px >= H;
    return { side: back ? 'back' : 'front', x: back ? maxX - (px - H) / s : px / s + minX, y: minY + (H - py) / s };
  }

  /** Size of a layer in garment metres (images keep their aspect ratio). */
  async layerSize(layer) {
    if (layer.type === 'shape') return { w: layer.w ?? 0.1, h: layer.h ?? layer.w ?? 0.1 };
    if (layer.type === 'text') {
      const g = this.ctx, size = layer.size ?? 0.06;
      if (layerFont(layer) || layer.look) {
        // Measured as drawn (texture.js paintLayers), with nothing painted.
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 0;
        const { w, h } = drawWord(g, String(layer.text ?? ''), size * 1000, '#000', Infinity, layer.look ?? {}, null, null, layerFont(layer));
        g.restore();
        return { w: w / 1000, h: h / 1000 };
      }
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.font = `700 ${size * 1000}px Rajdhani, Inter, sans-serif`;
      const w = g.measureText(String(layer.text ?? '')).width / 1000;
      g.restore();
      return { w, h: size };
    }
    const img = await this.image(layer.src);
    const w = layer.w ?? 0.1;
    return { w, h: img ? (w * img.height) / img.width : w };
  }

  /** Reject board drops in empty atlas space, outside the actual garment (`side`: also its own pieces there). */
  contains(x, y, side) {
    const inPoly = (poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    };
    if (inPoly(this.outline)) return true;
    return side != null && this.piecesOn(side === 'back').some(inPoly);
  }

  /**
   * Shorts: crest on one leg, number on the other, small wordmark behind. The crest is the team
   * logo, as on the shirt: the fixed chest crest, or else the logo placed on the front of the top
   * (the logo-sized image nearest the chest crest). Artwork placed on the front of the shorts
   * takes the crest's place.
   */
  async paintShortsMarks(design, logo, textOutline) {
    const g = this.ctx, layers = design.layers ?? [];
    const ownArt = layers.some((l) => l.part === 'shorts' && l.side !== 'back' && l.type !== 'text' && !String(l.id ?? '').startsWith('kit-'));
    const nearCrest = (l) => Math.hypot(Math.abs(l.x) - 0.105, l.y - 0.6);
    const topLogo = layers
      .filter((l) => l.type === 'image' && (l.part ?? 'top') === 'top' && l.side !== 'back' && (l.w ?? 0.1) <= 0.18 && Math.abs(l.x) < 0.26)
      .sort((a, b) => nearCrest(a) - nearCrest(b))[0];
    const crest = design.logoImage || (ownArt ? null : topLogo?.src ?? null);
    if (crest !== this._logoKey) {
      this._logo = crest ? await loadImage(crest).catch(() => null) : null;
      this._logoKey = crest;
    }
    const crestAt = { side: 'front', x: 0.15, y: 0.13 };
    if (this._logo) this.markImage(design, 'crest', crestAt, this._logo, 0.055, 0.055);
    else if (!ownArt) this.markShield(design, 'crest', crestAt, [[0, 0.026], [0.022, 0.014], [0.017, -0.016], [0, -0.028], [-0.017, -0.016], [-0.022, 0.014]], 0.024, 0.032);
    this.markText(design, 'number', { side: 'front', x: -0.15, y: 0.12 }, String(design.number ?? '23'), 0.075, design.accent, 0.12, textOutline);
    this.markText(design, 'wordmark', { side: 'back', x: 0, y: 0.33 }, logo, 0.04, design.accent, 0.2, textOutline);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return this.canvas;
  }
}

/** The 3DEEZI wordmark and "3" mark pictures (brandmarks.js), loaded once. */
let brandLoad = null;
/** The jersey's Blades shapes (jerseyblades.js), loaded once (null if they cannot be read). */
const bladesLoads = {};
function jerseyBladesImage(shorts = false) {
  return (bladesLoads[shorts ? 'shorts' : 'jersey'] ??= loadImage((shorts ? SHORTS_BLADES : JERSEY_BLADES).src).catch(() => null));
}
/** A colour (#rrggbb or rgb(r, g, b)) as [r, g, b]. */
const rgbOf = (c) => (c.startsWith('rgb(') ? c.slice(4, -1).split(',').map(Number) : hexRgb(c));
/**
 * The jersey's Blades shapes in the kit's colours: each pixel's shade (red: 0 light cyan .. 255 royal blue) from the
 * Accent lightened 40 % towards white, through the Accent (at 0.229, the picture's cyan) to the Pattern colour.
 */
function tintJerseyBlades(img, cyan, royal) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height), p = data.data;
  const C = rgbOf(cyan), L = C.map((v) => v + (255 - v) * 0.4), R = rgbOf(royal), T1 = 0.229, lut = new Uint8ClampedArray(768);
  for (let k = 0; k < 256; k++) {
    const t = k / 255;
    for (let n = 0; n < 3; n++) lut[k * 3 + n] = t < T1 ? L[n] + (C[n] - L[n]) * (t / T1) : C[n] + (R[n] - C[n]) * ((t - T1) / (1 - T1));
  }
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const k = p[i] * 3;
    p[i] = lut[k];
    p[i + 1] = lut[k + 1];
    p[i + 2] = lut[k + 2];
  }
  g.putImageData(data, 0, 0);
  return c;
}

function brandImages() {
  return (brandLoad ??= Promise.all([BRAND_WORDMARK, BRAND_MARK].map((src) => loadImage(src).catch(() => null))));
}

/** A small tileable knit normal map (pique dots), generated once. */
/**
 * Technical polyester sports knit: a fine diagonal twill. Raised yarn ridges run
 * at 45° with recessed grooves between them, and the yarn crossings along each
 * ridge step from one ridge to the next (as a twill does). Tileable; 32 ridges per tile.
 */
export function knitNormalMap(size = 512) {
  const h = new Float32Array(size * size);
  const ridge = size / 32, yarn = size / 16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + y) / ridge, v = (x - y) / yarn;
      const rib = 0.5 + 0.5 * Math.cos(2 * Math.PI * u);
      const cross = 0.5 + 0.5 * Math.cos(2 * Math.PI * v + Math.PI * Math.floor(u));
      h[y * size + x] = 0.68 * rib ** 1.6 + 0.32 * rib * cross;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * 1.5, ny = (at(x, y - 1) - at(x, y + 1)) * 1.5;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** The crest badge shapes (task 9.144): the usual shield (none) or one of these. */
export const CREST_SHAPES = ['circle', 'square', 'rounded', 'diamond', 'shield'];
function crestShape(v) { return CREST_SHAPES.includes(v) && v !== 'shield' ? v : null; }
/** A badge shape `w` x `h` metres centred on (0, 0) (y down). */
function shapePath(c, shape, w, h) {
  if (shape === 'circle') c.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (shape === 'square') c.rect(-w / 2, -h / 2, w, h);
  else if (shape === 'rounded') c.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.22);
  else if (shape === 'diamond') { c.moveTo(0, -h / 2); c.lineTo(w / 2, 0); c.lineTo(0, h / 2); c.lineTo(-w / 2, 0); c.closePath(); }
}
