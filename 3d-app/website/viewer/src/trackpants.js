// Track pants (FN10 2026-11-02, the user: the Tracksuit tiles show the jacket AND matching pants, as their pictures
// garment-tracksuit / garment-netball-tracksuit): full-length, slim straight legs, an elastic waistband in the body's
// colour, a stripe in the jacket's stripe colour down the outer side of each leg, and a small "3" with the 3DEEZI word
// on the wearer's left thigh. Made as garment.js makes shorts (front and back pieces sewn at the sides and the inner
// legs, worn round the body by worn.js wornShorts) with this long cut; its own print here. main.js shows them under the
// track jacket when the design's look asks for them (design.zoneColors.pantsStripe).
import { buildGarment, SPECS } from './garment.js';

/** The cut's heights (metres, the hem at 0): the waist, the crotch, the waistband's depth. */
export const TP = { waist: 1.0, crotch: 0.735, band: 0.04 };
const along = (pairs, y) => {
  if (y <= pairs[0][0]) return pairs[0][1];
  for (let i = 1; i < pairs.length; i++) {
    if (y <= pairs[i][0]) { const [y0, x0] = pairs[i - 1], [y1, x1] = pairs[i]; return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0); }
  }
  return pairs.at(-1)[1];
};
/** The side seam [y, x] (the flat front piece's outer edge) from the hem up to the waist, and the inner leg seam. */
const SIDE = [[0, 0.235], [0.2, 0.248], [0.45, 0.262], [0.62, 0.272], [TP.crotch, 0.276], [0.85, 0.258], [TP.waist, 0.215]];
const INNER = [[0.012, 0.062], [0.2, 0.058], [0.45, 0.05], [0.62, 0.03], [TP.crotch, 0]];
export const pantsSideX = (y) => along(SIDE, y);

export const TRACK_PANTS = {
  half: [
    [0, TP.waist], ...SIDE.slice().reverse().map(([y, x]) => [x, y]).filter(([, y]) => y > 0.02),
    [0.236, 0.007], [0.22, 0], [0.1, 0], [0.068, 0.004], ...INNER.map(([y, x]) => [x, y]),
  ],
  neck: { drop: 0.012, half: 0.4 },
  rim: { drop: 0.015, half: 0.4, radius: 0.012, width: TP.band, one: true },
  crease: 0.5,
  legs: true,
  loose: true,
  depth: 0.16,
  chest: false,
  points: { CF: [0, TP.waist], OT: [0.215, TP.waist], ST: [0.236, 0.007], IB: [0.062, 0.012], CR: [0, TP.crotch] },
  worn: {
    sideSeam: SIDE,
    inner: INNER,
    crotch: TP.crotch,
    blend: [TP.crotch - 0.02, TP.crotch + 0.1],
    hipDepth: 0.72,
    // Each leg a slim straight tube, a little fuller at the thigh, hanging down from the seat.
    legIn: [0.04, 0.006],
    legOut: [0.155, 0.2],
    outLine: [[0, 0.152], [0.2, 0.158], [0.45, 0.166], [0.62, 0.178], [TP.crotch, 0.19], [0.85, 0.19], [TP.waist, 0.17]],
    legDepth: [0.058, 0.098],
    relief: 0.3,
    seat: 0.3,
  },
};
SPECS.trackpants = TRACK_PANTS;

/** Builds the pants (garment.js's garment object): the waistband in the body's colour, no drawstring showing, no label. */
export function buildTrackPants({ detail = false } = {}) {
  const garment = buildGarment('trackpants', { spec: TRACK_PANTS, detail });
  garment.drawstring = false;
  garment.pants = true;
  garment.rimColour = 'main';
  return garment;
}

const HEX = /^#[0-9a-f]{6}$/i;
/** The stripe's reach in from the side seam (metres) on the front and the back piece: about 6 cm across the outer leg. */
const STRIPE = [0.05, 0.012];

/** One piece's print: the body colour (the jacket's own body colour when it has one), the side stripes. */
export function paintTrackPants(painter, design, back, trim) {
  const g = painter.ctx, zc = design.zoneColors ?? {};
  if (HEX.test(zc.body ?? '')) { g.fillStyle = zc.body; g.fillRect(-1.6, -0.2, 3.2, 1.8); }
  g.fillStyle = HEX.test(zc.pantsStripe ?? '') ? zc.pantsStripe : HEX.test(zc.stripe ?? '') ? zc.stripe : trim;
  const ys = Array.from({ length: 41 }, (_, i) => -0.03 + ((TP.waist + 0.06) * i) / 40);
  for (const dir of [-1, 1]) {
    g.beginPath();
    // (Mostly on the front piece, so it shows from the front as on the pictures.)
    ys.forEach((y, i) => { const x = dir * (pantsSideX(y) - STRIPE[back ? 1 : 0]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.lineTo(dir * 0.75, ys.at(-1));
    g.lineTo(dir * 0.75, ys[0]);
    g.closePath();
    g.fill();
  }
  // Under the 3D waistband: the body's colour.
  g.fillStyle = HEX.test(zc.body ?? '') ? zc.body : design.main;
  g.fillRect(-0.8, TP.waist - TP.band - 0.004, 1.6, TP.band + 0.05);
}

/** The marks: a small "3" with the club's word under it on the wearer's left thigh (each can be moved or hidden). */
export const TP_CREST = { side: 'front', x: 0.17, y: 0.83 };
export const TP_WORD = { side: 'front', x: 0.17, y: 0.806 };
export async function paintTrackPantsMarks(painter, design, logo, textOutline, loadImage) {
  const crest = design.logoImage || null;
  if (crest !== painter._logoKey) {
    painter._logo = crest ? await loadImage(crest).catch(() => null) : null;
    painter._logoKey = crest;
  }
  if (painter._logo) painter.markImage(design, 'crest', TP_CREST, painter._logo, 0.04, 0.032);
  else painter.markShield(design, 'crest', TP_CREST, [[0, 0.014], [0.012, 0.008], [0.009, -0.008], [0, -0.014], [-0.009, -0.008], [-0.012, 0.008]], 0.016, 0.022);
  painter.markText(design, 'wordmark', TP_WORD, logo, 0.014, design.accent, 0.06, textOutline);
}
