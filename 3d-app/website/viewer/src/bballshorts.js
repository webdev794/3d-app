// The basketball shorts (COMING SOON item 7, 2026-10-29): long, loose game shorts, cut as the client's tile picture
// (media/showroom/garment-basketball-shorts.webp): knee length, the legs hanging wide and straight from the hips, a deep
// gathered elastic waistband (three stitched channels) and the body's colour at the waist and hems. Its own cut and
// builder, so a professional model can replace it without touching the other garments: the shorts made as garment.js
// makes them (front and back panels sewn at the sides and the inner legs, worn round the body by worn.js wornShorts)
// with this cut; its print, parts and marks are in bballprint.js.
import { buildGarment, SPECS } from './garment.js';
import { BB, BB_SIDE, BB_INNER } from './bballprint.js';

const { waist: W, crotch: C } = BB;
/**
 * The cut (right half, metres, the hem at 0): the waist across the top, the side seam flaring out to a wide leg opening
 * (about 68 cm round), the hem nearly level, the inner leg seam rising to the crotch. `worn`: how they hang (worn.js):
 * roomy hips, each leg a wide oval tube falling straight from the seat, a little fuller at the top, the body hardly
 * showing through.
 */
export const BBALL_SHORTS = {
  half: [
    [0, W], [0.215, W], [0.224, 0.545], [0.234, 0.515], [0.258, 0.44], [0.28, 0.374], [0.303, 0.3], [0.318, 0.259], [0.338, 0.2],
    [0.352, 0.144], [0.366, 0.07], [0.374, 0.022], [0.371, 0.007], [0.355, 0.001], [0.27, 0], [0.16, 0], [0.075, 0.002],
    [0.045, 0.006], [0.036, 0.014], [0.03, 0.066], [0.022, 0.145], [0.013, 0.224], [0.005, 0.297], [0, C],
  ],
  neck: { drop: 0.012, half: 0.4 },
  // (FN6 2026-10-30, DT8: one flat, finely gathered band about 9 % of the height, as the picture; the legs' creases
  // softer, so the sides hang straight.)
  rim: { drop: 0.015, half: 0.4, radius: 0.012, width: BB.band, one: true },
  crease: 0.4,
  legs: true,
  loose: true,
  depth: 0.16,
  chest: false,
  points: { CF: [0, W], OT: [0.215, W], ST: [0.374, 0.022], IB: [0.036, 0.014], CR: [0, C] },
  worn: {
    sideSeam: BB_SIDE,
    inner: BB_INNER,
    crotch: C,
    blend: [C - 0.02, C + 0.12],
    hipDepth: 0.72,
    // (FN4 2026-10-30, the user: basketball shorts are very loose on a lean, tall player: each leg a wide, straight tube
    // of even width from the crotch to the hem (a slight flare only), hanging well away from the thigh, deep front to
    // back; hardly any of the body showing through.)
    legIn: [0.026, 0.006],
    legOut: [0.27, 0.252],
    legDepth: [0.118, 0.12],
    relief: 0.12,
    seat: 0.05,
  },
};
SPECS.bballshorts = BBALL_SHORTS;

/**
 * Builds the basketball shorts (garment.js's garment object): the deep gathered waistband in the body's colour
 * (`rimColour`), no drawstring showing (its cord is inside the band, as on the picture), no neck label.
 */
export function buildBballShorts({ detail = false } = {}) {
  const garment = buildGarment('bballshorts', { spec: BBALL_SHORTS, detail });
  garment.drawstring = false;
  garment.bball = true;
  garment.rimColour = 'main';
  return garment;
}
