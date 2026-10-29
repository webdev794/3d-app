// The socks' print (garment 3, 2026-10-29): their parts, team hoops, heel and toe, crest and stitching, in the flat
// print's garment metres (socks.js: y from the toe's tip up to the welt's top, x round the tube). Kept apart so a
// professional model's own print can replace it; texture.js and zones.js call in here for kind 'socks'.
// SK1 (2026-10-29): laid out as the client's tile picture: a thick top band, a black gap and a second band; thin
// ribbed lines round the ankle; a small heel patch; a thin line across the toes; the 3DEEZI "3" on the shin.
import { SOCK_LEN, SOCK_WELT, SOCK_FOOT } from './socks.js';

const L = SOCK_LEN;
/** The printed parts (design.parts keys): the leg's front and back, the top band, the hoops, the heel and toe. */
export const SOCK_PARTS = ['front', 'back', 'sockBand', 'sockHoops', 'sockFoot'];
/** The team hoops (Secondary): one wide band under the top band's black gap, and thin ribbed lines round the ankle. */
const HOOPS = [
  [L - SOCK_WELT - 0.037, L - SOCK_WELT - 0.012],
  ...Array.from({ length: 8 }, (_, i) => { const y = SOCK_FOOT.heel + (SOCK_FOOT.ankle - SOCK_FOOT.heel) * 0.4 + i * 0.0098; return [y, y + 0.0024]; }),
];
/** The thin line across the toes (no longer the whole toe). */
const TOE_LINE = [SOCK_FOOT.toe - 0.002, SOCK_FOOT.toe + 0.0025];
/** The heel patch: a cup over the heel's back, from the sole up towards the ankle and round to the sides, so it shows
 *  from the front beside each heel (the client's socks pictures; DT4: it was a thin crescent under the heel). */
const HEEL = { cy: SOCK_FOOT.heel + (SOCK_FOOT.ankle - SOCK_FOOT.heel) * 0.45, ry: 0.058, rx: 0.058 };
/** Where the crest sits: on the shin, halfway down the leg (as the tile picture). */
export const SOCK_CREST = { side: 'front', x: 0, y: L - 0.235 };

const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const heelPoly = () => Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * 2 * Math.PI; return [HEEL.rx * Math.cos(a), HEEL.cy + HEEL.ry * Math.sin(a)]; });
const band = () => [box(-1, L - SOCK_WELT, 1, L + 1)];
const hoops = () => HOOPS.map(([a, b]) => box(-1, a, 1, b));
const foot = (back) => [box(-1, TOE_LINE[0], 1, TOE_LINE[1]), ...(back ? [heelPoly()] : [])];
const inHeel = (x, y) => (x / HEEL.rx) ** 2 + ((y - HEEL.cy) / HEEL.ry) ** 2 <= 1;

/** The part at a print point. */
export function sockPartAt(side, x, y) {
  const back = side === 'back';
  if (y >= L - SOCK_WELT) return 'sockBand';
  if ((y >= TOE_LINE[0] && y <= TOE_LINE[1]) || (back && inHeel(x, y))) return 'sockFoot';
  if (HOOPS.some(([a, b]) => y >= a && y <= b)) return 'sockHoops';
  return back ? 'back' : 'front';
}

/** A part's region on one side (zones.js partRegion's shape: outlines to keep, groups to cut out). */
export function sockRegion(key, back) {
  if (key === 'sockBand') return { keep: band(), cut: [] };
  if (key === 'sockHoops') return { keep: hoops(), cut: back ? [[heelPoly()]] : [] };
  if (key === 'sockFoot') return { keep: foot(back), cut: [] };
  if (key === (back ? 'back' : 'front')) return { keep: [box(-1.6, -0.2, 1.6, 1.6)], cut: [band(), hoops(), foot(back)] };
  return null;
}

/**
 * One side's trims, over the kit's colour and pattern (texture.js has painted those, clipped to the outline): each
 * part's own look; the top band and the heel and toe in the kit's colour, the hoops in the trim colour (Secondary).
 * Then the knit's rib shade: fine upright ribs, deeper on the doubled top band, so the sock reads as knitted.
 */
export function paintSocks(painter, design, back, trim) {
  const g = painter.ctx;
  painter.paintParts(design, back, { skip: ['sockBand', 'sockHoops', 'sockFoot'] });
  for (const key of ['sockHoops', 'sockBand', 'sockFoot']) {
    const style = painter.partStyle(design, key);
    const fill = key === 'sockHoops' ? trim : null;
    if (!style && !fill) continue;
    g.save();
    if (painter.clipPart(key, back)) {
      if (style) painter.paintPartLook(design, style, painter.partBox(key, back), fill ?? painter.baseFill(design));
      else { g.fillStyle = fill; g.fillRect(-1.6, -0.2, 3.2, 1.8); }
    }
    g.restore();
  }
  // The toe line is knitted in finer, so it reads a shade deeper and duller than the heel in the same colour (the
  // client's picture: a mid-blue line, about #2b91c1 beside the cyan heel; CF1 2026-10-29).
  g.save();
  g.fillStyle = 'rgba(14,18,22,0.58)';
  g.fillRect(-1.6, TOE_LINE[0], 3.2, TOE_LINE[1] - TOE_LINE[0]);
  g.restore();
  ribShade(g);
  painter.side(back);
}

/** The rib knit's shade over the print (garment metres): soft upright ribs 3.6 mm apart, a light ridge and a dark
 *  valley each; deeper on the cuff (thick folded fabric) and the top hoop, faint down the leg. */
function ribShade(g) {
  const P = 0.0036, top = L - SOCK_WELT - 0.04;
  g.save();
  for (let x = -0.4; x < 0.4; x += P) {
    // Down the leg and foot: faint.
    g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(x, -0.2, P * 0.36, top + 0.2);
    g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(x + P * 0.5, -0.2, P * 0.3, top + 0.2);
    // The cuff and hoop: deep ribs with a lit ridge.
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, top, P * 0.4, 1);
    g.fillStyle = 'rgba(255,255,255,0.09)'; g.fillRect(x + P * 0.48, top, P * 0.28, 1);
  }
  g.restore();
}

/** How the socks are made: the toe's linking seam across the foot, the welt's turned-in edge (painted and relief). */
export function sockTailoring() {
  const line = (y) => (c) => { c.moveTo(-0.4, y); c.lineTo(0.4, y); };
  return { stitches: [], seams: [line(SOCK_FOOT.toe - 0.012)], folds: [line(L - SOCK_WELT)] };
}

/** The 3DEEZI "3" mark (the app's splash mark, images/splash_mark.png) as outlines, 400 x 255 units, y down: its silver
 *  top bar and small lower bar, its blue middle bar and the blue arrowed bottom. */
const MARK3 = {
  silver: [
    [[135, 12], [380, 12], [348, 54], [178, 54], [152, 86], [76, 86]],
    [[72, 180], [158, 180], [110, 238], [20, 238]],
  ],
  blue: [
    [[142, 92], [300, 92], [272, 146], [104, 146]],
    [[178, 180], [262, 180], [300, 134], [326, 76], [370, 132], [296, 238], [122, 238]],
  ],
};

/** Draws the "3" mark centred, `w` metres wide (local metres, y down). */
function drawMark3(g, w) {
  const k = w / 400, ox = -200 * k, oy = -125 * k;
  const path = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(ox + x * k, oy + y * k) : g.moveTo(ox + x * k, oy + y * k))); g.closePath(); };
  const silver = g.createLinearGradient(ox, oy, ox + 400 * k, oy + 250 * k);
  silver.addColorStop(0, '#f4f7fa'); silver.addColorStop(0.55, '#aab4bf'); silver.addColorStop(1, '#e3e9ef');
  const blue = g.createLinearGradient(ox + 100 * k, oy + 240 * k, ox + 380 * k, oy + 80 * k);
  blue.addColorStop(0, '#0b3fc8'); blue.addColorStop(0.55, '#1474ea'); blue.addColorStop(1, '#22d3ff');
  for (const pts of MARK3.silver) { path(pts); g.fillStyle = silver; g.fill(); }
  for (const pts of MARK3.blue) { path(pts); g.fillStyle = blue; g.fill(); }
  // A fine light edge, as the mark's bevel.
  g.lineWidth = w * 0.008; g.strokeStyle = 'rgba(210,240,255,0.55)';
  for (const pts of [...MARK3.silver, ...MARK3.blue]) { path(pts); g.stroke(); }
}

/** The marks: only the crest, on the shin (no names, numbers or words on socks). Without the club's logo, the
 *  3DEEZI "3" mark knitted in (no badge). */
export async function paintSockMarks(painter, design, loadImage) {
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
  if (painter._logo) painter.markImage(design, 'crest', SOCK_CREST, painter._logo, 0.06, 0.06);
  else if (!ownArt) painter.mark(design, 'crest', SOCK_CREST, (g) => { drawMark3(g, 0.064); return { w: 0.064, h: 0.041 }; });
}
