// The socks' print (garment 3, 2026-10-29): their parts, team hoops, heel and toe, crest and stitching, in the flat
// print's garment metres (socks.js: y from the toe's tip up to the welt's top, x round the tube). Kept apart so a
// professional model's own print can replace it; texture.js and zones.js call in here for kind 'socks'.
// SK1 (2026-10-29): laid out as the client's tile picture: a thick top band, a black gap and a second band; thin
// ribbed lines round the ankle; a small heel patch; a thin line across the toes; the 3DEEZI "3" on the shin.
import { SOCK_LEN, SOCK_WELT, SOCK_FOOT, sockToeGroove } from './socks.js';
// (FN4 2026-10-30: each socks tile picture's own layout, LAYOUTS below.)

const L = SOCK_LEN;
/** The printed parts (design.parts keys): the leg's front and back, the top band, the hoops, the heel and toe. */
export const SOCK_PARTS = ['front', 'back', 'sockBand', 'sockHoops', 'sockFoot'];
/** The thin ribbed lines round the ankle (the Rugby socks picture only). */
// (FN7 2026-10-30, DT8: all 8 show, running down onto the instep as in the picture.)
const ANKLE = Array.from({ length: 8 }, (_, i) => { const y = SOCK_FOOT.heel + (SOCK_FOOT.ankle - SOCK_FOOT.heel) * 0.08 + i * 0.0098; return [y, y + 0.0024]; });
/**
 * Each socks picture's own layout (FN4 2026-10-30, measured on the tile pictures; depths from the welt's top down):
 *   two (the general socks picture: Football / Footy / Hockey socks, and any socks design by default): a black top,
 *     two cyan hoops under it, a full cyan toe cap and the heel cup (the sockFoot part), no lines round the ankle;
 *   wide (Game Socks, design.zoneColors.sockHoopsWide): a deep black top, two wide hoops, a bigger "3";
 *   rugby (Rugby socks, design.zoneColors.sockToeLine): the cyan top band with one black line through it (the band and
 *     the hoop under the line), the fine lines round the ankle, a thin line across the top of the forefoot where the
 *     toes start, the heel cup, a flat one-colour "3" (design.zoneColors.sockMark).
 * `band`: the top band's depth; `hoops`: [top, bottom] depths; `crest`: the "3"'s centre below the top and its width.
 */
const LAYOUTS = {
  // (FN7 2026-10-30, DT8: the hoops a third deeper and the "3" 3.5 cm higher, as the picture.)
  two: { band: 0.034, hoops: [[0.034, 0.058], [0.071, 0.095]], ankle: false, toeLine: false, crest: [0.145, 0.07] },
  wide: { band: 0.057, hoops: [[0.057, 0.081], [0.096, 0.121]], ankle: false, toeLine: false, crest: [0.175, 0.08] },
  rugby: { band: 0.037, hoops: [[0.043, 0.09]], ankle: true, toeLine: true, crest: [0.215, 0.07] },
};
const HEX = /^#[0-9a-f]{6}$/i;
let layout = LAYOUTS.two;
/** Picks the layout for a design (texture.js calls it before painting, so the parts' regions follow it). */
export function setSockLayout(design) {
  const zc = design?.zoneColors ?? {};
  layout = HEX.test(zc.sockToeLine ?? '') ? LAYOUTS.rugby : HEX.test(zc.sockHoopsWide ?? '') ? LAYOUTS.wide : LAYOUTS.two;
}
const HOOPS = () => [...layout.hoops.map(([a, b]) => [L - b, L - a]), ...(layout.ankle ? ANKLE : [])];
/** The thin line across the top of the forefoot, where the toes start (Rugby). */
const TOE_LINE = [0.046, 0.0485];
/** The full toe cap (the general picture): from the tip back about 3.5 cm, straight across, on top and under. */
const TOE_CAP = 0.036;
/** The heel patch: a cup over the heel's back, from the sole up towards the ankle and round to the sides, so it shows
 *  from the front beside each heel (the client's socks pictures; DT4: it was a thin crescent under the heel). */
const HEEL = { cy: SOCK_FOOT.heel + (SOCK_FOOT.ankle - SOCK_FOOT.heel) * 0.45, ry: 0.058, rx: 0.09 };
/** Where the crest sits: on the shin, as the tile picture. */
export const SOCK_CREST = { side: 'front', x: 0, y: L - 0.18 };

const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const heelPoly = () => Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * 2 * Math.PI; return [HEEL.rx * Math.cos(a), HEEL.cy + HEEL.ry * Math.sin(a)]; });
/** The cup's ends round the sides of the ankle (on the front panel, at its side seams), so the cyan shows each side of
 *  the ankle from the front, as in the general picture (FN4). */
const SIDE = { x: 0.07, cy: HEEL.cy - 0.002, rx: 0.026, ry: 0.04 };
// (The back cup reaches its side seams, rx 0.09, about as deep there as the side ends, so the two meet there in one cup.)
const sidePoly = (dir) => Array.from({ length: 32 }, (_, i) => { const a = (i / 32) * 2 * Math.PI; return [dir * SIDE.x + SIDE.rx * Math.cos(a), SIDE.cy + SIDE.ry * Math.sin(a)]; });
const inSide = (x, y) => ((Math.abs(x) - SIDE.x) / SIDE.rx) ** 2 + ((y - SIDE.cy) / SIDE.ry) ** 2 <= 1;
const band = () => [box(-1, L - layout.band, 1, L + 1)];
const hoops = () => HOOPS().map(([a, b]) => box(-1, a, 1, b));
const toe = (back) => (layout.toeLine ? (back ? [] : [box(-1, TOE_LINE[0], 1, TOE_LINE[1])]) : [box(-1, -0.2, 1, TOE_CAP)]);
const foot = (back) => [...toe(back), ...(back ? [heelPoly()] : [sidePoly(1), sidePoly(-1)])];
const inHeel = (x, y) => (x / HEEL.rx) ** 2 + ((y - HEEL.cy) / HEEL.ry) ** 2 <= 1;
const inToe = (back, y) => (layout.toeLine ? !back && y >= TOE_LINE[0] && y <= TOE_LINE[1] : y <= TOE_CAP);

/** The part at a print point. */
export function sockPartAt(side, x, y) {
  const back = side === 'back';
  if (y >= L - layout.band) return 'sockBand';
  if (inToe(back, y) || (back ? inHeel(x, y) : inSide(x, y))) return 'sockFoot';
  if (HOOPS().some(([a, b]) => y >= a && y <= b)) return 'sockHoops';
  return back ? 'back' : 'front';
}

/** A part's region on one side (zones.js partRegion's shape: outlines to keep, groups to cut out). */
export function sockRegion(key, back) {
  if (key === 'sockBand') return { keep: band(), cut: [] };
  if (key === 'sockHoops') return { keep: hoops(), cut: back ? [[heelPoly()]] : [[sidePoly(1)], [sidePoly(-1)]] };
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
  // The Rugby picture's toe line: a thin flat line in its own colour (design.zoneColors.sockToeLine, measured on the
  // picture), across the top of the forefoot where the toes start (user 2026-10-29: not a pale band round the tip).
  if (layout.toeLine && !back) {
    g.save();
    g.fillStyle = design.zoneColors.sockToeLine;
    g.fillRect(-1.6, TOE_LINE[0], 3.2, TOE_LINE[1] - TOE_LINE[0]);
    g.restore();
  }
  // The Rugby picture's split toe (user 2026-10-30, images/265): a soft dark groove from the toe's tip back over the
  // forefoot between the big toe and the others, on the medial side (the second sock's toe print is mirrored: socks.js).
  if (layout.toeLine && !back) toeGroove(g);
  ribShade(g);
  painter.side(back);
}

/** The big toe's groove: a soft shadow line, darkest in the middle, from the toe's end back to y 0.033, with a faint
 *  light ridge beside it on the toes' side. (FN7: along the shape's own groove line, socks.js sockToeGroove, so the
 *  big toe medial of it is the longest, forward-most toe.) */
let groovePts = null;
function toeGroove(g) {
  groovePts ??= sockToeGroove();
  const path = () => {
    g.beginPath();
    // (FN7 round 3: the split is in the shape now; the painted shadow stays on the top, short of the toe's end, where
    // the print is stretched over the front.)
    groovePts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  };
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [w, a] of [[0.008, 0.2], [0.005, 0.3], [0.0025, 0.45]]) { path(); g.lineWidth = w; g.strokeStyle = `rgba(0,0,0,${a})`; g.stroke(); }
  g.translate(0.0042, 0);
  path(); g.lineWidth = 0.002; g.strokeStyle = 'rgba(255,255,255,0.07)'; g.stroke();
  g.restore();
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
function drawMark3(g, w, flat = null) {
  const k = w / 400, ox = -200 * k, oy = -125 * k;
  const path = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(ox + x * k, oy + y * k) : g.moveTo(ox + x * k, oy + y * k))); g.closePath(); };
  const silver = g.createLinearGradient(ox, oy, ox + 400 * k, oy + 250 * k);
  silver.addColorStop(0, '#f4f7fa'); silver.addColorStop(0.55, '#aab4bf'); silver.addColorStop(1, '#e3e9ef');
  const blue = g.createLinearGradient(ox + 100 * k, oy + 240 * k, ox + 380 * k, oy + 80 * k);
  blue.addColorStop(0, '#0b3fc8'); blue.addColorStop(0.55, '#1474ea'); blue.addColorStop(1, '#22d3ff');
  if (flat) {
    // One flat colour, no bevel (the Rugby socks picture's knitted-in "3").
    for (const pts of [...MARK3.silver, ...MARK3.blue]) { path(pts); g.fillStyle = flat; g.fill(); }
    return;
  }
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
  // Each picture's "3": its height on the shin and its size (the layout's), flat in one colour on the Rugby socks.
  const [down, w] = layout.crest, at = { ...SOCK_CREST, y: L - down };
  // (FN7 2026-10-30, DT8: a crest place left over from another garment (a jersey's chest, above the sock's top) is
  // not the sock's: the "3" goes back to its own place on the shin.)
  const key = `${painter.partName}_crest`, own = design.marks?.[key];
  if (own && Number.isFinite(own.y) && (own.y > L - SOCK_WELT || own.y < SOCK_FOOT.ankle)) design = { ...design, marks: { ...design.marks, [key]: { ...own, x: undefined, y: undefined, scale: undefined } } };
  const flat = HEX.test(design.zoneColors?.sockMark ?? '') ? design.zoneColors.sockMark : null;
  if (painter._logo) painter.markImage(design, 'crest', at, painter._logo, w * 0.94, w * 0.94);
  else if (!ownArt) painter.mark(design, 'crest', at, (g) => { drawMark3(g, w, flat); return { w, h: w * 0.64 }; });
}
