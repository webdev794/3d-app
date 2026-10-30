// The bucket hat's print (garment 5, 2026-10-29): its parts, bound brim edge, eyelets, crest and stitching, in the flat
// print's garment metres (bucket.js: the brim's top at the bottom of both halves, the crown's side above it, the top
// above the front, the brim's underside above the back). Kept apart so a professional model's own print can replace
// it; texture.js and zones.js call in here for kind 'bucket-hat'.
import { HAT_C, HAT_BRIM, HAT_EDGE, HAT_SIDE, HAT_SIDE_LEN, HAT_TOP, HAT_UNDER } from './bucket.js';

const C = HAT_C, W = HAT_BRIM, E = HAT_EDGE, YS = HAT_SIDE, LS = HAT_SIDE_LEN, TOP0 = YS + LS + 0.003;
/** The printed parts (design.parts keys): the crown's front and back, its top, the brim's top and underside, the binding. */
export const HAT_PARTS = ['front', 'back', 'hatTop', 'hatBrim', 'hatUnder', 'hatBinding'];
/** Where the crest sits: the crown's front, above its middle; the club's word under it. */
export const HAT_CREST = { side: 'front', x: 0, y: YS + 0.62 * LS };
const HAT_WORD = { side: 'front', x: 0, y: YS + 0.27 * LS };

/** The part at a print point. */
export function hatPartAt(side, x, y) {
  const back = side === 'back';
  if (y < W) return y < E ? 'hatBinding' : 'hatBrim';
  if (y < TOP0) return back ? 'back' : 'front';
  if (!back) return 'hatTop';
  const strip = y < HAT_UNDER[1] ? 0 : 1;
  return y - HAT_UNDER[strip] < E ? 'hatBinding' : 'hatUnder';
}

const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** A part's region on one side (zones.js partRegion's shape: outlines to keep, groups to cut out). */
export function hatRegion(key, back) {
  const [u0, u1] = HAT_UNDER;
  if (key === 'hatBinding') return { keep: [box(-1, -0.2, 1, E), ...(back ? [box(-1, u0 - 0.003, 1, u0 + E), box(-1, u1 - 0.003, 1, u1 + E)] : [])], cut: [] };
  if (key === 'hatBrim') return { keep: [box(-1, E, 1, W + 0.002)], cut: [] };
  if (key === 'hatUnder') return back ? { keep: [box(-1, u0 + E, 1, u0 + W + 0.003), box(-1, u1 + E, 1, u1 + W + 0.003)], cut: [] } : null;
  if (key === 'hatTop') return back ? null : { keep: [box(-1, TOP0, 1, 1.6)], cut: [] };
  if (key === (back ? 'back' : 'front')) return { keep: [box(-1.6, W + 0.002, 1.6, TOP0)], cut: [] };
  return null;
}

/**
 * One side's trims, over the kit's colour and pattern (texture.js has painted those, clipped to the outline): each
 * part's own look; the binding in the trim colour (Secondary); the eyelets.
 */
export function paintHat(painter, design, back, trim) {
  const g = painter.ctx;
  const own = ['hatTop', 'hatBrim', 'hatUnder', 'hatBinding'];
  painter.paintParts(design, back, { skip: own });
  for (const key of own) {
    const style = painter.partStyle(design, key);
    const fill = key === 'hatBinding' ? trim : null;
    if (!style && !fill) continue;
    g.save();
    if (painter.clipPart(key, back)) {
      if (style) painter.paintPartLook(design, style, painter.partBox(key, back), fill ?? painter.baseFill(design));
      else { g.fillStyle = fill; g.fillRect(-1.6, -0.2, 3.2, 1.8); }
    }
    g.restore();
  }
  // The eyelets: two each side, high on the crown, stitched round.
  painter.side(back);
  // The general picture's shards (the tile look's zoneColors.shards / shardsDeep): flat shapes on the crown and the brim.
  const zc = design.zoneColors ?? {};
  if (zc.shards) paintShards(g, back, zc.shards, zc.shardsDeep ?? zc.shards);
  const y = YS + 0.74 * LS;
  for (const x of [-C / 4 + 0.018, C / 4 - 0.018]) {
    g.beginPath(); g.arc(x, y, 0.0028, 0, 2 * Math.PI);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    g.beginPath(); g.arc(x, y, 0.0013, 0, 2 * Math.PI);
    g.fillStyle = 'rgba(0,0,0,0.85)'; g.fill();
  }
}

/**
 * The shards of the client's bucket hat picture (garment-bucket-hat.webp), FN1 2026-10-30: flat slanted bars and wedges
 * in two colours (cyan and royal blue, measured on the picture), up the crown's sides and round the brim; the crown's
 * front middle left clear for the crest. Print x on each half from -C/4 to C/4 (the sides), y from the brim's edge up.
 */
function paintShards(g, back, cyan, deep) {
  const u = (f) => YS + f * LS, q = C / 4;
  const fill = (colour, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = colour; g.fill(); };
  g.save();
  // A wedge on the brim: a broad slanted triangle rising from the bound edge.
  const brim = (x, w, c, lean = 1) => fill(c, [[x, E], [x + w, E], [x + w / 2 + lean * 0.02, W - 0.006]]);
  if (!back) {
    for (const s of [-1, 1]) {
      // One broad blade up each side of the crown, leaning out towards the top, and a deep blue wedge at the side.
      fill(cyan, [[s * 0.078, u(0)], [s * 0.112, u(0)], [s * 0.15, u(1.02)], [s * 0.116, u(1.02)]]);
      fill(deep, [[s * 0.118, u(0)], [s * (q + 0.01), u(0)], [s * (q + 0.01), u(0.7)]]);
    }
    // A cyan sliver high on the wearer's right.
    fill(cyan, [[-0.05, u(0.68)], [-0.068, u(0.68)], [-0.1, u(1.02)], [-0.082, u(1.02)]]);
    // The brim: big wedges at the sides, the middle front mostly clear.
    brim(-0.165, 0.07, cyan, -1); brim(-0.1, 0.05, deep, -1); brim(0.035, 0.05, deep); brim(0.095, 0.07, cyan);
  } else {
    // The back: three broad blades and a wedge.
    [[-0.13, cyan], [-0.02, deep], [0.08, cyan]].forEach(([x, c]) => fill(c, [[x, u(0)], [x + 0.036, u(0)], [x + 0.07, u(1.02)], [x + 0.034, u(1.02)]]));
    fill(deep, [[-0.085, u(0)], [-0.04, u(0)], [-0.04, u(0.6)]]);
    brim(-0.16, 0.07, deep); brim(-0.06, 0.06, cyan); brim(0.04, 0.06, deep); brim(0.12, 0.06, cyan);
  }
  g.restore();
}

/** How the hat is made: two rows round the crown at the brim and at the top, the top's edge, the back seam, and the
 *  brim's rows of stitching all round (on its top and its underside) and the binding's row. */
export function hatTailoring(back) {
  const row = (y) => (c) => { c.moveTo(-0.4, y); c.lineTo(0.4, y); };
  const stitches = [row(YS + 0.004), row(YS + 0.0085), row(YS + LS - 0.004), row(YS + LS - 0.0085), row(E + 0.0012)];
  for (let i = 0; i < 8; i++) stitches.push(row(W - 0.008 - i * 0.0068));
  if (back) {
    for (const u of HAT_UNDER) { stitches.push(row(u + E + 0.0012)); for (let i = 0; i < 8; i++) stitches.push(row(u + W - 0.008 - i * 0.0068)); }
    stitches.push((c) => { c.moveTo(-0.004, YS + 0.002); c.lineTo(-0.004, YS + LS - 0.002); }, (c) => { c.moveTo(0.004, YS + 0.002); c.lineTo(0.004, YS + LS - 0.002); });
  } else {
    // The top's edge, 4 mm in.
    stitches.push((c) => { c.ellipse(0, HAT_TOP.y, HAT_TOP.a - 0.004, HAT_TOP.b - 0.004, 0, 0, 2 * Math.PI); });
  }
  const seams = [row(W), row(YS + LS), ...(back ? [(c) => { c.moveTo(0, YS); c.lineTo(0, YS + LS); }] : [])];
  // Dark thread, tone on tone, as the pictures (as the cap's).
  return { stitches, seams, folds: [], tone: HAT_THREAD };
}
const HAT_THREAD = [[0.00035, -0.00045, 'rgba(0,0,0,0.5)', 0.0012], [0, 0, 'rgba(0,0,0,0.3)', 0.001], [-0.00018, 0.00022, 'rgba(255,255,255,0.1)', 0.00045]];

/** The marks: the crest on the crown's front and the club's word under it (no names or numbers on a hat). */
export async function paintHatMarks(painter, design, loadImage, textOutline) {
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
  if (painter._logo) painter.markImage(design, 'crest', HAT_CREST, painter._logo, 0.055, 0.042);
  // No club logo yet: the 3DEEZI "3" mark (texture.js markShield draws the brand's own picture), as on the tile pictures.
  else if (!ownArt) painter.markShield(design, 'crest', HAT_CREST, [[0, 0.024], [0.0216, 0.0132], [0.0168, -0.0144], [0, -0.024], [-0.0168, -0.0144], [-0.0216, 0.0132]], 0.0216, 0.031);
  // The club's word under it (the default 3DEEZI is the brand's own wordmark picture: texture.js markText).
  const word = (design.logoText ?? '').trim().toUpperCase();
  if (word) painter.markText(design, 'wordmark', HAT_WORD, word, 0.029, design.accent, 0.126, textOutline);
}
