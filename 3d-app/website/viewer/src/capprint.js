// The cap's print (garment 4, 2026-10-29): its parts, piping, side sweeps, brim, eyelets, crest and stitching, in the
// flat print's garment metres (cap.js: the crown's halves with x round the band and y up from the band at CAP_BAND; the
// brim's top below the front half, its underside below the back half). Kept apart so a professional model's own print
// can replace it; texture.js and zones.js call in here for kind 'cap'. Shapes here are worked out from the band
// (local y 0) and moved up to CAP_BAND on the print.
import { CAP_C, CAP_BAND, capSeams, CAP_TOP, BRIM_ARC, BRIM_DEPTH, BRIM_GAP, CAP_EYELETS } from './cap.js';

const C = CAP_C, LM = CAP_TOP, BAND = CAP_BAND;
const depth = (u) => BRIM_DEPTH * Math.max(0, 1 - u * u) ** 0.5;
/** The printed parts (design.parts keys): the crown's front and back, the brim's top and underside, the piping, the side sweeps. */
export const CAP_PARTS = ['front', 'back', 'capBrim', 'capUnder', 'capPiping', 'capSweep', 'capSweepLow'];
/** Where the crest sits: the front panel's middle. */
export const CAP_CREST = { side: 'front', x: 0, y: BAND + 0.074 };
/** Where the club's word sits: under the crest. */
const CAP_WORD = { side: 'front', x: 0, y: BAND + 0.036 };
const PIPE = 0.0019;      // half the piping's width
const EDGE = 0.0055;      // the brim's piped edge (DT4: as wide as the pictures' binding)

/** Arc round the band from the centre front, at a print point (0 .. C/2, either side). */
const arcOf = (back, x) => (back ? C / 2 - Math.abs(x) : Math.abs(x));
// The side sweeps (as the tile pictures): on each side panel (from the front panel's seam to the back panel's) a band
// rising from the front seam's foot towards the back and widening, and below it, to the band, a second colour.
const A0 = C / 6, A1 = C / 3, SLOPE = 0.85, GAP = 0.0035;
const wide = (A) => 0.012 + 0.33 * Math.max(0, A - A0);
const line = (A) => SLOPE * (A - A0 + 0.012);
const inSides = (A) => A >= A0 + PIPE && A <= A1 - PIPE;

/** The part at a print point. */
export function capPartAt(side, x, yPrint) {
  const back = side === 'back', y = yPrint - BAND;
  if (y < 0) {
    const u = x / BRIM_ARC;
    if (Math.abs(u) <= 1 && -y - BRIM_GAP >= depth(u) - EDGE) return 'capPiping';
    return back ? 'capUnder' : 'capBrim';
  }
  if (capSeams(back).some((s) => Math.abs(x - s) <= PIPE)) return 'capPiping';
  const A = arcOf(back, x);
  if (inSides(A)) {
    const L = line(A);
    if (y <= L && y >= L - wide(A)) return 'capSweep';
    if (y < L - wide(A) - GAP) return 'capSweepLow';
  }
  return back ? 'back' : 'front';
}

const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** The brim's shape (from the band to its edge). */
const brim = () => {
  const pts = [];
  for (let i = 0; i <= 60; i++) { const u = -1 + i / 30; pts.push([u * BRIM_ARC, -BRIM_GAP - depth(u)]); }
  return [...pts, [BRIM_ARC, -BRIM_GAP + 0.003], [-BRIM_ARC, -BRIM_GAP + 0.003]];
};
const brimEdge = () => {
  const outer = [], inner = [];
  for (let i = 0; i <= 60; i++) { const u = -1 + i / 30; outer.push([u * BRIM_ARC, -BRIM_GAP - depth(u) - 0.002]); inner.push([u * BRIM_ARC, -BRIM_GAP - Math.max(0, depth(u) - EDGE)]); }
  return [...outer, ...inner.reverse()];
};
const pipes = (back) => capSeams(back).map((s) => box(s - PIPE, 0, s + PIPE, LM + 0.02));
/** The sweeps' shapes on one side: between `lo(A)` and `hi(A)` (clamped to the crown), both sides of the middle. */
function sweep(back, lo, hi) {
  const out = [];
  for (const sign of [1, -1]) {
    // (Each half runs a few millimetres past the other's edge, so no hairline shows where they meet.)
    const a0 = back ? Math.max(C / 4 - 0.006, A0) : A0, a1 = back ? A1 : Math.min(C / 4 + 0.006, A1);
    if (a1 <= a0) continue;
    const top = [], bottom = [];
    for (let i = 0; i <= 40; i++) {
      const A = a0 + ((a1 - a0) * i) / 40, x = sign * (back ? C / 2 - A : A);
      const y0 = Math.min(LM, Math.max(0, lo(A))), y1 = Math.min(LM, Math.max(0, hi(A)));
      bottom.push([x, y0 - (y0 <= 0 ? 0.01 : 0)]);
      top.push([x, Math.max(y0, y1)]);
    }
    out.push([...bottom, ...top.reverse()]);
  }
  return out;
}
const sweepHi = (back) => sweep(back, (A) => line(A) - wide(A), (A) => line(A));
const sweepLo = (back) => sweep(back, () => -1, (A) => line(A) - wide(A) - GAP);

/** Moves shapes worked out from the band up to their place on the print. */
const up = (polys) => polys.map((poly) => poly.map(([x, y]) => [x, y + BAND]));

/** A part's region on one side (zones.js partRegion's shape: outlines to keep, groups to cut out). */
export function capRegion(key, back) {
  if (key === 'capPiping') return { keep: up([...pipes(back), brimEdge()]), cut: [] };
  if (key === 'capBrim') return back ? null : { keep: up([brim()]), cut: [up([brimEdge()])] };
  if (key === 'capUnder') return back ? { keep: up([brim()]), cut: [up([brimEdge()])] } : null;
  if (key === 'capSweep') return { keep: up(sweepHi(back)), cut: [up(pipes(back))] };
  if (key === 'capSweepLow') return { keep: up(sweepLo(back)), cut: [up(pipes(back))] };
  if (key === (back ? 'back' : 'front')) return { keep: up([box(-1.6, 0, 1.6, 1.6)]), cut: [up(pipes(back)), up(sweepHi(back)), up(sweepLo(back))] };
  return null;
}

/**
 * One side's trims, over the kit's colour and pattern (texture.js has painted those, clipped to the outline): each
 * part's own look; the piping in the trim colour (Secondary); the eyelets.
 */
export function paintCap(painter, design, back, trim) {
  const g = painter.ctx;
  const own = ['capBrim', 'capUnder', 'capSweep', 'capSweepLow', 'capPiping'];
  painter.paintParts(design, back, { skip: own });
  for (const key of own) {
    const style = painter.partStyle(design, key);
    const fill = key === 'capPiping' ? trim : null;
    if (!style && !fill) continue;
    g.save();
    if (painter.clipPart(key, back)) {
      if (style) painter.paintPartLook(design, style, painter.partBox(key, back), fill ?? painter.baseFill(design));
      else { g.fillStyle = fill; g.fillRect(-1.6, -0.2, 3.2, 1.8); }
    }
    g.restore();
  }
  // The eyelets (cap.js CAP_EYELETS: a metal grommet on each): the fabric shaded round each grommet, and the hole.
  painter.side(back);
  for (const { x, v } of CAP_EYELETS.filter((e) => e.back === back)) {
    const y = BAND + LM * v, shade = g.createRadialGradient(x, y, 0.0048, x, y, 0.0072);
    shade.addColorStop(0, 'rgba(0,0,0,0.45)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
    g.beginPath(); g.arc(x, y, 0.0072, 0, 2 * Math.PI);
    g.fillStyle = shade; g.fill();
    g.beginPath(); g.arc(x, y, 0.0024, 0, 2 * Math.PI);
    g.fillStyle = 'rgba(0,0,0,0.9)'; g.fill();
  }
}

/** How the cap is made: top-stitching beside each seam, round the band, and the brim's rows of stitching. */
export function capTailoring(back) {
  const stitches = [];
  for (const s of capSeams(back)) for (const x of [s - 0.0042, s + 0.0042]) stitches.push((c) => { c.moveTo(x, BAND + 0.004); c.lineTo(x, BAND + LM - 0.012); });
  stitches.push((c) => { c.moveTo(-0.4, BAND + 0.0045); c.lineTo(0.4, BAND + 0.0045); });
  for (let k = 0; k < 6; k++) {
    const d = 0.0075 + k * 0.0055;
    stitches.push((c) => {
      let started = false;
      for (let i = 0; i <= 80; i++) {
        const u = -1 + i / 40, dd = depth(u) - d;
        if (dd <= 0.004) continue;
        const px = u * BRIM_ARC, py = BAND - BRIM_GAP - dd;
        if (started) c.lineTo(px, py); else { c.moveTo(px, py); started = true; }
      }
    });
  }
  const seams = capSeams(back).map((x) => (c) => { c.moveTo(x, BAND); c.lineTo(x, BAND + LM); });
  // The front's middle seam (the pictures' two front panels), unpiped, top-stitched either side (DT4).
  if (!back) {
    seams.push((c) => { c.moveTo(0, BAND); c.lineTo(0, BAND + LM); });
    for (const x of [-0.0042, 0.0042]) stitches.push((c) => { c.moveTo(x, BAND + 0.004); c.lineTo(x, BAND + LM - 0.012); });
  }
  // Dark thread, tone on tone, as the pictures (texture.js stitches()).
  return { stitches, seams, folds: [], tone: CAP_THREAD };
}
const CAP_THREAD = [[0.00035, -0.00045, 'rgba(0,0,0,0.5)', 0.0012], [0, 0, 'rgba(0,0,0,0.3)', 0.001], [-0.00018, 0.00022, 'rgba(255,255,255,0.1)', 0.00045]];

/** The marks: the crest on the front panel and the club's word under it (no names or numbers on a cap). */
export async function paintCapMarks(painter, design, loadImage, textOutline) {
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
  if (painter._logo) painter.markImage(design, 'crest', CAP_CREST, painter._logo, 0.06, 0.05);
  // No club logo yet: the 3DEEZI "3" mark (texture.js markShield draws the brand's own picture), as on the tile pictures.
  else if (!ownArt) painter.markShield(design, 'crest', CAP_CREST, [[0, 0.023], [0.02, 0.012], [0.016, -0.014], [0, -0.023], [-0.016, -0.014], [-0.02, 0.012]], 0.02, 0.03);
  // The club's word under it (the default 3DEEZI is the brand's own wordmark picture: texture.js markText).
  const word = (design.logoText ?? '').trim().toUpperCase();
  if (word) painter.markText(design, 'wordmark', CAP_WORD, word, 0.026, design.accent, 0.11, textOutline);
}
