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
 * picture's panels, which keep about the same width seen from the front, a little narrower at the hem (36, 36, 33, 32
 * and 27 of its 768 pixels from under the waistband to the hem). As the skirt flares the panel turns away round the side,
 * so it takes a smaller share of the wider girth towards the hem (FM 2026-10-30: it widened towards the hem before).
 */
const sideShare = (y) => (0.051 + 0.152 * Math.min(Math.max(y, 0), 0.22)) * (1 - 0.27 * Math.min(1, Math.max(0, (y - (SKIRT_SEAM - 0.06)) / 0.06)) ** 1.5);
// (FN1 2026-10-30: gathered in to about three quarters of its width right under the waistband, as the picture's 30 px against 41.)
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
export const SKIRT_WORD = { side: 'front', x: 0.1175, y: 0.047 };

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
 * light, lean, wave, deep], the same every time. The cloth over the elastic bunches into fine upright puckers about
 * 2-3 mm apart, short in the narrow channels and longer in the wide middle one, as the picture's (FM 2026-10-30: soft and
 * rounded, no longer hard-edged blocks that read as a printed barcode). Round 3: bunched and uneven: puckers packed
 * tight in bunches, with now and then a wider, deeper valley between bunches; nearly straight (a slight lean); most
 * crowns dull, a few catching the light.
 */
let puckerList = null;
function puckers() {
  if (puckerList) return puckerList;
  const rnd = random(11), edges = [SKIRT_SEAM, ...[...SKIRT_ROWS].reverse(), SKIRT_LEN], out = [];
  for (let c = 0; c < edges.length - 1; c++) {
    const y0 = edges[c] + 0.0005, y1 = edges[c + 1] - 0.0005, h = y1 - y0;
    for (let x = -0.5; x < 0.5;) {
      // A bunch: tight puckers; then (one time in four or five) a wide, deep valley before the next.
      const deep = rnd() < 0.22, p = 0.0035 * (deep ? 1.35 + 0.5 * rnd() : 0.6 + 0.55 * rnd()), a = y0 + h * 0.08 * rnd(), b = y1 - h * 0.08 * rnd();
      // A slight wander up the channel (the gathered cloth buckles), out of step with its neighbours.
      const wave = { amp: p * (0.01 + 0.03 * rnd()), len: 0.008 + 0.008 * rnd(), phase: 2 * Math.PI * rnd() }, lit = rnd();
      out.push([x, p, a, b, ((deep ? 0.62 : 0.4) + 0.2 * rnd()) * 0.72, (0.1 + 0.1 * lit * lit) * 0.8, (rnd() - 0.5) * Math.min(0.0009, h * 0.06), wave, deep]);
      x += p;
    }
  }
  return (puckerList = out);
}
/** A pucker's line from y0 up to y1, `dx` across from its left edge: leaning, and wandering in its wave. */
function puckerPath(g, [x, , , , , , lean, wave], dx, y0, y1) {
  const n = Math.max(2, Math.ceil((y1 - y0) / 0.0008));
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n, t = i / n;
    const px = x + dx + lean * t + wave.amp * Math.sin((2 * Math.PI * (y - y0)) / wave.len + wave.phase);
    if (i) g.lineTo(px, y); else g.moveTo(px, y);
  }
}
/** A soft profile along a path: layered round-capped strokes, widest and faintest first (a rounded crown, no hard edge). */
function softStroke(g, path, width, alpha, rgb, layers = [[1, 0.3], [0.62, 0.35], [0.3, 0.35]]) {
  for (const [w, a] of layers) {
    g.strokeStyle = `rgba(${rgb},${alpha * a})`;
    g.lineWidth = width * w;
    path(g);
    g.stroke();
  }
}
const straight = (x0, y0, x1, y1) => (g) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); };

/** How much darker the waistband's gathered face is than the skirt's cloth (round 3). */
const BAND_SHADE = 0.1;
/**
 * The elastic's ruching (garment metres, clipped to the waistband): the band is stitched in channels; the cloth over
 * the elastic is gathered into fine puckers, each a soft dark valley and a softly lit, rounded crown, leaning a little
 * this way or that. Then the stitched rows, and the top edge rolled over: a lit crest with a shade under it.
 */
function ruching(g) {
  g.save();
  g.setLineDash([]);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Gathered cloth is mostly in its own shade: the band's face darker than the skirt's (the picture: 19-27 against
  // the skirt's 26-29), lit only along the crowns (round 3).
  g.fillStyle = `rgba(0,0,0,${BAND_SHADE})`;
  g.fillRect(-0.5, SKIRT_SEAM, 1, SKIRT_LEN - SKIRT_SEAM);
  for (const k of puckers()) {
    const [, p, a, b, dark, light, , , deep] = k, r = p * 0.2;
    softStroke(g, (c) => puckerPath(c, k, 0, a + r, b - r), p * (deep ? 0.9 : 0.5), dark, '0,0,0');
    softStroke(g, (c) => puckerPath(c, k, p * 0.45, a + p * 0.5, Math.max(a + p * 0.5, b - p * 0.5)), p * 0.5, light, '255,255,255', [[1, 0.45], [0.5, 0.55]]);
  }
  g.restore();
  // The stitched rows: a soft groove where the thread pulls the elastic in.
  for (const y of SKIRT_ROWS) {
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(-0.5, y - 0.0011, 1, 0.0022);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-0.5, y - 0.0005, 1, 0.001);
  }
  // The rolled top edge: its crest catches the light, then turns away into shade; the seam under the band in shade.
  const roll = g.createLinearGradient(0, SKIRT_LEN, 0, SKIRT_LEN - 0.0042);
  roll.addColorStop(0, 'rgba(255,255,255,0.04)');
  roll.addColorStop(0.3, 'rgba(255,255,255,0.16)');
  roll.addColorStop(0.62, 'rgba(0,0,0,0)');
  roll.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = roll;
  g.fillRect(-0.5, SKIRT_LEN - 0.0042, 1, 0.0042);
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(-0.5, SKIRT_SEAM, 1, 0.0009);
}

/**
 * The puckers' relief (texture.js reliefMap, a height map in garment metres): each a rounded crown rising softly from
 * its valley, so the light runs smoothly over it; and the rolled top edge's crest.
 */
function ruchingRelief(g) {
  g.save();
  g.setLineDash([]);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const k of puckers()) {
    const [, p, a, b, , , , , deep] = k;
    softStroke(g, (c) => puckerPath(c, k, p * 0.45, a + p * 0.3, Math.max(a + p * 0.3, b - p * 0.3)), p * 0.7, 1, '255,255,255', [[1, 0.06], [0.66, 0.07], [0.36, 0.08], [0.16, 0.065]]);
    softStroke(g, (c) => puckerPath(c, k, 0, a, b), p * (deep ? 0.6 : 0.36), deep ? 0.34 : 0.24, '0,0,0', [[1, 0.6], [0.5, 0.6]]);
  }
  softStroke(g, straight(-0.5, SKIRT_LEN - 0.0016, 0.5, SKIRT_LEN - 0.0016), 0.0034, 1, '255,255,255', [[1, 0.12], [0.6, 0.14], [0.3, 0.14]]);
  g.restore();
}

/** The seams' shade: the centre seam (front and back), the side panels' seams and a soft shadow under the waistband. */
function seamShade(g) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.65)';
  g.fillRect(-0.0005, -0.03, 0.001, SKIRT_SEAM + 0.03);
  // Its folded edge on the -x side catches a little light (the picture, round 3: 2 px left of the dark line).
  g.fillStyle = 'rgba(255,255,255,0.03)';
  g.fillRect(-0.0016, -0.03, 0.0007, SKIRT_SEAM + 0.03);
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
 * the waistband's seam; the centre seam top-stitched on its -x side only (one faint row about 4.5 mm off, the
 * picture's; round 3) and each side panel's seam top-stitched on the body side; the hem's two rows of cover-stitch at the top of the hem turned up inside, and its turned-up edge; the
 * elastic's stitched rows (as seams: sunk grooves) and its puckers (`relief`: soft raised crowns). The thread
 * is dark, tone on tone (`tone`), as in the picture.
 */
export function skirtTailoring() {
  const line = (x0, y0, x1, y1) => (c) => { c.moveTo(x0, y0); c.lineTo(x1, y1); };
  const side = (dir, inset = 0) => (c) => edge().forEach(([x, y], i) => (i ? c.lineTo(dir * (x - inset), y) : c.moveTo(dir * (x - inset), y)));
  return {
    seams: [line(0, -0.03, 0, SKIRT_SEAM), side(1), side(-1), line(-0.5, SKIRT_SEAM, 0.5, SKIRT_SEAM), ...SKIRT_ROWS.map((y) => line(-0.5, y, 0.5, y))],
    stitches: [line(-0.5, 0.0143, 0.5, 0.0143), line(-0.5, 0.0173, 0.5, 0.0173), line(-0.0045, -0.03, -0.0045, SKIRT_SEAM)],
    folds: [line(-0.5, 0.0195, 0.5, 0.0195)],
    // The elastic's puckers and rolled edge, soft rounded crowns (FM 2026-10-30: texture.js strokes `ridges` flat).
    relief: ruchingRelief,
    tone: SKIRT_THREAD,
    // Fine, short stitches (about 1.2 mm a stitch, the picture's), barely raised (round 3: long dashes before).
    dash: [0.0008, 0.0004],
    stitchRelief: 0.4,
  };
}
/** Dark thread sunk in the cloth, tone on tone and barely seen: a faint shadow, the thread, a faint glint (texture.js
 *  stitches(); round 3: fainter and finer, as the picture's). */
const SKIRT_THREAD = [[0.0002, -0.00025, 'rgba(0,0,0,0.26)', 0.0008], [0, 0, 'rgba(0,0,0,0.16)', 0.0006], [-0.00012, 0.00015, 'rgba(255,255,255,0.2)', 0.0004]];

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
  // (FM 2026-10-30: the "3" mark 6 % smaller, as the picture's.)
  else if (!ownArt) painter.markShield(design, 'crest', SKIRT_CREST, [[0, 0.0174], [0.0146, 0.0085], [0.0113, -0.0103], [0, -0.0174], [-0.0113, -0.0103], [-0.0146, 0.0085]], 0.016, 0.022);
  painter.markText(design, 'wordmark', SKIRT_WORD, logo, 0.0267, design.accent, 0.12, textOutline);
}

/**
 * The skirt's light (main.js puts it into the skirt's shader, after the lighting, before the tone mapping), as the
 * client's studio picture (FM 2026-10-30): its black a neutral black all over and evenly lit, its cyan panels clean and
 * bright, its print's whites white.
 * - Neutral cloth (black, greys, white) takes no colour from the lights: the stage's warm key and cool fill and rims
 *   tinted it brown on one side and blue on the other. Coloured cloth keeps its own hue at the lit brightness.
 * - Dark cloth gets a soft fill from the side away from the key light (fixed in the world, so it stays right as the
 *   skirt turns): the picture's black is about as light on the far side as on the near. Round 3: the key's share on
 *   dark cloth a sixth less, the fill a little more, so the black sits at the picture's 24-29, not 30-34.
 * - Light cloth (the panels): the key's highlight softened and the shade lifted a little, so the panels stay clean and
 *   bright as the picture's instead of paling to white on one side and dulling on the other.
 * - The print's whites (the logo) as white as the picture's.
 */
export const SKIRT_LIGHT = `{
  vec3 skW = vec3( 0.2126, 0.7152, 0.0722 );
  vec3 skAlb = max( diffuseColor.rgb, vec3( 1e-4 ) );
  float skA = dot( skAlb, skW ), skL = max( dot( outgoingLight, skW ), 1e-6 );
  float skMax = max( skAlb.r, max( skAlb.g, skAlb.b ) ), skSat = ( skMax - min( skAlb.r, min( skAlb.g, skAlb.b ) ) ) / skMax;
  float skNeutral = 1.0 - smoothstep( 0.2, 0.4, skSat ), skDark = 1.0 - smoothstep( 0.05, 0.2, skA ), skBright = smoothstep( 0.1, 0.3, skA );
  outgoingLight = mix( skAlb / skA, vec3( 1.0 ), skNeutral ) * skL;
  vec3 skKey = normalize( ( viewMatrix * vec4( -0.67, 0.62, 0.39, 0.0 ) ).xyz );
  float skAway = clamp( 0.5 - 0.5 * dot( normal, skKey ), 0.0, 1.0 );
  outgoingLight *= 1.0 - 0.24 * skDark;
  outgoingLight += mix( skAlb, vec3( skA ), skNeutral ) * 1.6 * skAway * skDark;
  float skE = skL / skA, skEven = ( 1.0 + ( skE - 1.0 ) * ( skE > 1.0 ? 0.08 : 0.5 ) ) * 1.05;
  outgoingLight *= mix( 1.0, skEven / skE, skBright );
  outgoingLight = mix( outgoingLight, max( outgoingLight, skAlb * 2.0 ), smoothstep( 0.3, 0.6, skA ) * skNeutral );
}`;
