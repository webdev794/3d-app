// The beanie's print (CP1 2026-11-02, the client's HEADWEAR mockup images/296.jpg): its parts, stripes, pom-pom, marks
// and knit, in the flat print's garment metres (beanie.js: the cuff at the bottom of both halves, the crown above it,
// the pom-pom above the front). Kept apart so a professional model's own print can replace it; texture.js and zones.js
// call in here for kind 'beanie'.
import { BEANIE_C, BEANIE_CUFF, BEANIE_CROWN, BEANIE_CROWN_LEN, BEANIE_POM } from './beanie.js';

const C = BEANIE_C, CUFF = BEANIE_CUFF, Y0 = BEANIE_CROWN, LS = BEANIE_CROWN_LEN, POM = BEANIE_POM;
/** The printed parts (design.parts keys): the crown's front and back, the cuff, the stripes, the pom-pom. */
export const BEANIE_PARTS = ['front', 'back', 'beanieCuff', 'beanieStripe', 'beaniePom'];
/** The stripes (as the mockup): one across the cuff's top, one across the crown above it; [y, height]. */
const TWO = [[CUFF + 0.016, 0.018], [Y0 + 0.075, 0.019]]; // (FN13, DT11: higher, at .41 / .63) // (FN11, DT10: as thick as the picture's)
// (FN11: the NFL beanie, design.zoneColors.beanieOne: one stripe at the cuff's top, no pom-pom, a big logo.)
const ONE = [[CUFF + 0.037, 0.012]]; // (FN13, DT11: at .49)
let STRIPES = TWO;
const HEX = /^#[0-9a-f]{6}$/i;
const mode = (design) => { STRIPES = HEX.test(design?.zoneColors?.beanieOne ?? '') ? ONE : TWO; return STRIPES === ONE; };
/** Where the crest sits: on the cuff's front, under its stripe; the club's word under it. */
export const BEANIE_CREST = { side: 'front', x: 0, y: 0.036 };
const BEANIE_WORD = { side: 'front', x: 0, y: 0.0115 };

const inStripe = (y) => STRIPES.some(([s, h]) => y >= s - h / 2 && y <= s + h / 2);

/** The part at a print point. */
export function beaniePartAt(side, x, y) {
  if (side !== 'back' && y >= POM.y - 0.004) return 'beaniePom';
  if (inStripe(y)) return 'beanieStripe';
  if (y < CUFF) return 'beanieCuff';
  return side === 'back' ? 'back' : 'front';
}

const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const stripes = () => STRIPES.map(([s, h]) => box(-1, s - h / 2, 1, s + h / 2));
/** A part's region on one side (zones.js partRegion's shape: outlines to keep, groups to cut out). */
export function beanieRegion(key, back) {
  if (key === 'beaniePom') return back ? null : { keep: [box(-1, POM.y - 0.004, 1, 1.6)], cut: [] };
  if (key === 'beanieStripe') return { keep: stripes(), cut: [] };
  if (key === 'beanieCuff') return { keep: [box(-1, -0.2, 1, CUFF)], cut: [stripes()] };
  if (key === (back ? 'back' : 'front')) return { keep: [box(-1.6, CUFF, 1.6, back ? 1.6 : POM.y - 0.004)], cut: [stripes()] };
  return null;
}

/** A little seeded random (the pom-pom's yarn: the same every time). */
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/**
 * One side's knit details over the kit's colour and pattern (texture.js has painted those): each part's own look; the
 * stripes in the trim colour (Secondary); the pom-pom in yarn of the trim and body colours.
 */
export function paintBeanie(painter, design, back, trim) {
  const g = painter.ctx;
  const one = mode(design);
  const own = ['beanieCuff', 'beanieStripe', 'beaniePom'];
  painter.paintParts(design, back, { skip: own });
  for (const key of own) {
    if ((back || one) && key === 'beaniePom') continue;
    const style = painter.partStyle(design, key);
    const fill = key === 'beanieStripe' || key === 'beaniePom' ? trim : null;
    if (!style && !fill) continue;
    g.save();
    if (painter.clipPart(key, back)) {
      if (style) painter.paintPartLook(design, style, painter.partBox(key, back), fill ?? painter.baseFill(design));
      else { g.fillStyle = fill; g.fillRect(-1.6, -0.2, 3.2, 1.8); }
    }
    g.restore();
  }
  painter.side(back);
  // The pom-pom's yarn: short strands of the body colour among the trim colour's, all over the ball.
  if (!back && !one) {
    const yarn = painter.partStyle(design, 'beaniePom')?.own ?? design.main ?? '#111214';
    const rnd = seeded(7);
    g.save();
    g.lineCap = 'round';
    for (let i = 0; i < 1600; i++) {
      const x = -C / 4 + rnd() * (C / 2), y = POM.y + rnd() * POM.h, a = rnd() * Math.PI * 2, l = 0.008 + rnd() * 0.012;
      g.strokeStyle = i % 4 === 0 ? 'rgba(255,255,255,0.22)' : yarn;
      g.lineWidth = 0.0022 + rnd() * 0.0018;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    g.restore();
  }
}

/** How it is made: the cuff's fold and foot, and the crown's join above the cuff (no stitching: knitted). */
export function beanieTailoring(back) { // eslint-disable-line no-unused-vars
  const row = (y) => (c) => { c.moveTo(-0.4, y); c.lineTo(0.4, y); };
  return { stitches: [], seams: [row(0.003), row(CUFF - 0.002)], folds: [], tone: BEANIE_THREAD };
}
const BEANIE_THREAD = [[0.00035, -0.00045, 'rgba(0,0,0,0.45)', 0.0012], [0, 0, 'rgba(0,0,0,0.25)', 0.001], [-0.00018, 0.00022, 'rgba(255,255,255,0.08)', 0.00045]];

/** The marks: the crest on the cuff's front and the club's word under it (no names or numbers on a beanie). */
export async function paintBeanieMarks(painter, design, loadImage, textOutline) {
  mode(design);
  const k = 1.9; // (FN11, DT10: the logo about twice as big)
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
  if (painter._logo) painter.markImage(design, 'crest', BEANIE_CREST, painter._logo, 0.036 * k, 0.022 * k);
  // No club logo yet: the 3DEEZI "3" mark (texture.js markShield draws the brand's own picture), as on the tile picture.
  else if (!ownArt || design.marks?.top_crest?.side === 'back') painter.markShield(design, 'crest', BEANIE_CREST, [[0, 0.0105], [0.0095, 0.0058], [0.0074, -0.0063], [0, -0.0105], [-0.0074, -0.0063], [-0.0095, 0.0058]].map(([x, y]) => [x * k, y * k]), 0.0095 * k, 0.014 * k);
  const word = (design.logoText ?? '').trim().toUpperCase();
  if (word) painter.markText(design, 'wordmark', BEANIE_WORD, word, 0.015 * 1.6, design.accent, 0.08 * 1.6, textOutline);
}
