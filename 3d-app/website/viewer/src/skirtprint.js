// The skirt's print (COMING SOON item 10, 2026-10-29): its parts, side panels, waistband, seams and marks, in the flat
// print's garment metres (skirt.js: y the height above the hem, x round the skirt from its middle, +x the wearer's
// left). Kept apart so a professional model's own print can replace it; texture.js and zones.js call in here for kind
// 'skirt'. Laid out as the client's tile picture (garment-netball-skirt.webp): black, a cyan side panel down each side
// from the waistband to the hem (the trim colour), the black gathered elastic waistband, a seam down the middle, the
// hem stitched, and the 3DEEZI "3" mark over the 3DEEZI wordmark low on the wearer's left front.
import { SKIRT_LEN, SKIRT_SEAM, SKIRT_ROWS, skirtGirth } from './skirt.js';

/** The printed parts (design.parts keys): the front, the back, the side panels, the hem and the waistband. */
export const SKIRT_PARTS = ['front', 'back', 'sides', 'hem', 'skirtBand'];
/** The hem area's (and part's) top. */
const HEM_TOP = 0.06;
/**
 * The side panel's half-width round the side seam, as a share of the girth (the side seam is at a quarter): as the
 * picture's panels, which show about 31 of its 768 pixels wide under the waistband and 36 at the hem.
 */
const sideShare = (y) => 0.063 + 0.0375 * Math.min(Math.max(y, 0), SKIRT_SEAM);
/** The side panel's inner edge (its seam with the front or back) at height y, on the +x side. */
const sideEdge = (y) => (0.25 - sideShare(y)) * skirtGirth(y);
/** The inner edge from under the waistband down past the hem, as points. */
let edgePoints = null;
const edge = () => (edgePoints ??= Array.from({ length: 64 }, (_, i) => { const y = SKIRT_SEAM - ((SKIRT_SEAM + 0.03) * i) / 63; return [sideEdge(y), y]; }));
/** One side panel's outline (dir +1 the wearer's left), from the waistband down past the hem. */
const panel = (dir) => [...edge().map(([x, y]) => [dir * x, y]), [dir * 0.5, -0.03], [dir * 0.5, SKIRT_SEAM]];
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Where the crest and the club's word sit: low on the wearer's left front, the word under the crest (the picture). */
export const SKIRT_CREST = { side: 'front', x: 0.12, y: 0.079 };
export const SKIRT_WORD = { side: 'front', x: 0.12, y: 0.047 };

/** The areas a pattern can be dropped onto (zones.js): the body, the side panels (in thin slices following their
 *  slanted seam) and the hem. */
let zones = null;
export function skirtZones() {
  if (zones) return zones;
  const sides = [];
  for (let y = -0.03; y < SKIRT_SEAM - 1e-6; y += 0.002) sides.push([sideEdge(y + 0.001), y, 0.5, Math.min(SKIRT_SEAM, y + 0.002)]);
  return (zones = { body: [[-0.5, -0.03, 0.5, SKIRT_SEAM]], sides, hem: [[-0.5, -0.03, 0.5, HEM_TOP]] });
}

/** The part at a print point. */
export function skirtPartAt(side, x, y) {
  if (y >= SKIRT_SEAM) return 'skirtBand';
  if (Math.abs(x) >= sideEdge(y)) return 'sides';
  if (y <= HEM_TOP) return 'hem';
  return side === 'back' ? 'back' : 'front';
}

/** A part's region on one side (zones.js partRegion's shape: outlines to keep, groups to cut out). */
export function skirtRegion(key, back) {
  const band = [box(-1, SKIRT_SEAM, 1, 1.6)], sides = [panel(1), panel(-1)], hem = [box(-1, -0.2, 1, HEM_TOP)];
  if (key === 'skirtBand') return { keep: band, cut: [] };
  if (key === 'sides') return { keep: sides, cut: [band] };
  if (key === 'hem') return { keep: hem, cut: [sides] };
  if (key === (back ? 'back' : 'front')) return { keep: [box(-1.6, -0.2, 1.6, 1.6)], cut: [band, sides, hem] };
  return null;
}

/**
 * One side's print over the kit's colour and pattern (texture.js has painted those, clipped to the outline): each
 * part's own look; the side panels in the trim colour (Secondary); the waistband in the kit's colour, unprinted, with
 * its elastic's ruching; the seams' shade.
 */
export function paintSkirt(painter, design, back, trim) {
  const g = painter.ctx, BIG = [-1.6, -0.2, 3.2, 1.8];
  painter.paintParts(design, back, { skip: ['sides', 'skirtBand'] });
  for (const key of ['sides', 'skirtBand']) {
    const style = painter.partStyle(design, key), base = key === 'sides' ? trim : painter.baseFill(design);
    g.save();
    if (painter.clipPart(key, back)) {
      g.fillStyle = base;
      g.fillRect(...BIG);
      if (style) painter.paintPartLook(design, style, painter.partBox(key, back), base);
      if (key === 'skirtBand') ruching(g);
    }
    g.restore();
  }
  painter.side(back);
  seamShade(g);
}

/** A little random, the same every time. */
function random(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/**
 * The elastic's puckers, channel by channel between the stitched rows (garment metres): [x, pitch, bottom, top, dark,
 * light], the same every time. The cloth over the elastic bunches into upright puckers about 4 mm apart, uneven in
 * spacing and height, short in the narrow channels and longer in the wide middle one (DT4: the picture's ruching, not
 * a fine even rib).
 */
let puckerList = null;
function puckers() {
  if (puckerList) return puckerList;
  const rnd = random(11), edges = [SKIRT_SEAM, ...[...SKIRT_ROWS].reverse(), SKIRT_LEN], out = [];
  for (let c = 0; c < edges.length - 1; c++) {
    const y0 = edges[c] + 0.0004, y1 = edges[c + 1] - 0.0004, h = y1 - y0;
    for (let x = -0.5; x < 0.5;) {
      const p = 0.004 * (0.65 + 0.7 * rnd()), a = y0 + h * 0.22 * rnd(), b = y1 - h * 0.22 * rnd();
      out.push([x, p, a, b, 0.34 + 0.16 * rnd(), 0.1 + 0.1 * rnd()]);
      x += p;
    }
  }
  return (puckerList = out);
}

/**
 * The elastic's ruching (garment metres, clipped to the waistband): the band is stitched in channels; the cloth over
 * the elastic is gathered into puckers, each a dark valley and a lit crown. Then the stitched rows, and the top edge
 * rolled over.
 */
function ruching(g) {
  // Each pucker soft and rounded at its ends: a narrow dark valley, then a broad, faintly lit crown.
  g.save();
  g.lineCap = 'round';
  for (const [x, p, a, b, dark, light] of puckers()) {
    const r = p * 0.11, cx = x + p * 0.62, w = p * 0.5;
    g.strokeStyle = `rgba(0,0,0,${dark})`;
    g.lineWidth = p * 0.22;
    g.beginPath(); g.moveTo(x + r, a + r); g.lineTo(x + r, b - r); g.stroke();
    g.strokeStyle = `rgba(255,255,255,${light * 0.6})`;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(cx, a + w / 2); g.lineTo(cx, Math.max(a + w / 2, b - w / 2)); g.stroke();
  }
  g.restore();
  // The stitched rows: a groove where the thread pulls the elastic in.
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (const y of SKIRT_ROWS) g.fillRect(-0.5, y - 0.0006, 1, 0.0012);
  // The rolled top edge catches the light; the seam under the band sits in shade.
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(-0.5, SKIRT_LEN - 0.0012, 1, 0.0012);
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(-0.5, SKIRT_SEAM, 1, 0.0009);
}

/** The seams' shade: the centre seam (front and back), the side panels' seams and a soft shadow under the waistband. */
function seamShade(g) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(-0.0005, -0.03, 0.001, SKIRT_SEAM + 0.03);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(0.0008, -0.03, 0.0006, SKIRT_SEAM + 0.03);
  g.strokeStyle = 'rgba(0,0,0,0.42)';
  g.lineWidth = 0.0009;
  for (const dir of [1, -1]) {
    g.beginPath();
    edge().forEach(([x, y], i) => (i ? g.lineTo(dir * x, y) : g.moveTo(dir * x, y)));
    g.stroke();
  }
  const shade = g.createLinearGradient(0, SKIRT_SEAM, 0, SKIRT_SEAM - 0.012);
  shade.addColorStop(0, 'rgba(0,0,0,0.38)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = shade;
  g.fillRect(-0.5, SKIRT_SEAM - 0.012, 1, 0.012);
  g.restore();
}

/**
 * How the skirt is made (painted stitches and the relief map, texture.js): the centre seam, the side panels' seams and
 * the waistband's seam; the centre seam top-stitched either side and each side panel's seam top-stitched on the body
 * side; the hem's two rows of cover-stitch at the top of the hem turned up inside, and its turned-up edge; the
 * elastic's stitched rows (as seams: sunk grooves) and its puckers (`ridges`: raised crowns in the relief). The thread
 * is dark, tone on tone (`tone`), as in the picture.
 */
export function skirtTailoring() {
  const line = (x0, y0, x1, y1) => (c) => { c.moveTo(x0, y0); c.lineTo(x1, y1); };
  const side = (dir, inset = 0) => (c) => edge().forEach(([x, y], i) => (i ? c.lineTo(dir * (x - inset), y) : c.moveTo(dir * (x - inset), y)));
  return {
    seams: [line(0, -0.03, 0, SKIRT_SEAM), side(1), side(-1), line(-0.5, SKIRT_SEAM, 0.5, SKIRT_SEAM), ...SKIRT_ROWS.map((y) => line(-0.5, y, 0.5, y))],
    stitches: [line(-0.5, 0.014, 0.5, 0.014), line(-0.5, 0.0175, 0.5, 0.0175), line(-0.0045, -0.03, -0.0045, SKIRT_SEAM), line(0.0045, -0.03, 0.0045, SKIRT_SEAM), side(1, 0.0025), side(-1, 0.0025)],
    folds: [line(-0.5, 0.0195, 0.5, 0.0195)],
    ridges: [(c) => puckers().forEach(([x, p, a, b]) => { c.moveTo(x + p * 0.66, a); c.lineTo(x + p * 0.66, b); })],
    tone: SKIRT_THREAD,
  };
}
/** Dark thread sunk in the cloth: its shadow, the thread, a faint glint (texture.js stitches()). */
const SKIRT_THREAD = [[0.00035, -0.00045, 'rgba(0,0,0,0.5)', 0.0012], [0, 0, 'rgba(0,0,0,0.3)', 0.001], [-0.00018, 0.00022, 'rgba(255,255,255,0.1)', 0.00045]];

/** The marks: the crest (the club's logo, else the 3DEEZI "3" mark) and the club's word under it (3DEEZI: the real
 *  wordmark), low on the wearer's left front. No names or numbers on a skirt. */
export async function paintSkirtMarks(painter, design, loadImage, logo, textOutline) {
  if (design.logoImage) {
    if (design.logoImage !== painter._logoKey) {
      painter._logo = await loadImage(design.logoImage).catch(() => null);
      painter._logoKey = design.logoImage;
    }
  } else {
    painter._logo = null;
    painter._logoKey = null;
  }
  const ownArt = (design.layers ?? []).some((l) => l.side !== 'back' && (l.part ?? 'top') === 'top' && l.type !== 'text' && !String(l.id ?? '').startsWith('kit-'));
  if (painter._logo) painter.markImage(design, 'crest', SKIRT_CREST, painter._logo, 0.05, 0.05);
  else if (!ownArt) painter.markShield(design, 'crest', SKIRT_CREST, [[0, 0.0185], [0.0155, 0.009], [0.012, -0.011], [0, -0.0185], [-0.012, -0.011], [-0.0155, 0.009]], 0.016, 0.022);
  painter.markText(design, 'wordmark', SKIRT_WORD, logo, 0.0267, design.accent, 0.12, textOutline);
}
