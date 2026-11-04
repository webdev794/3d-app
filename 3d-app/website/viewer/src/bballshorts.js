// The basketball shorts (COMING SOON item 7, 2026-10-29): long, loose game shorts, cut as the client's tile picture
// (media/showroom/garment-basketball-shorts.webp): knee length, the legs hanging wide and straight from the hips, a deep
// gathered elastic waistband (three stitched channels) and the body's colour at the waist and hems. Its own cut and
// builder, so a professional model can replace it without touching the other garments: the shorts made as garment.js
// makes them (front and back panels sewn at the sides and the inner legs, worn round the body by worn.js wornShorts)
// with this cut; its print, parts and marks are in bballprint.js.
import { buildGarment, SPECS } from './garment.js';
import { BB, BB_SIDE, BB_INNER, BB_SPLIT } from './bballprint.js';

const { waist: W, crotch: C } = BB;
/**
 * The cut (right half, metres, the hem at 0): the waist across the top, the side seam flaring out to a wide leg opening
 * (about 68 cm round), the hem nearly level, the inner leg seam rising to the crotch. `worn`: how they hang (worn.js):
 * roomy hips, each leg a wide oval tube falling straight from the seat, a little fuller at the top, the body hardly
 * showing through.
 */
export const BBALL_SHORTS = {
  // (BSF 2026-11-04: down the side seam to the V split, the hem's outer corner cut back to it, the hem level, the inner
  // leg seam up to the deep crotch.)
  half: [
    [0, W], ...BB_SIDE.slice().reverse().filter(([y]) => y > BB_SPLIT.y + 0.01).map(([y, x]) => [x, y]), [0.313, BB_SPLIT.y],
    [BB_SPLIT.x, 0], [0.16, 0], [0.075, 0.002], [0.05, 0.006], [0.043, 0.012], ...BB_INNER.slice(1).map(([y, x]) => [x, y]),
  ],
  // (BSF r3: only the waist's own edge is open and carries the band: with the side seams' top 1.2 cm in it too, the
  // band's ends turned down at the sides in little wings.)
  neck: { drop: 0.003, half: 0.4 },
  // (FN6 2026-10-30, DT8: one flat, finely gathered band, the legs' creases softer, so the sides hang straight.)
  // (BSF r3, 419 / 431: a smooth printed band (`flat`: no rib), about 6 % of the height.)
  rim: { drop: 0.004, half: 0.4, radius: 0.012, width: BB.band, one: 'smooth', flat: true },
  // (BSF r3, the user 2026-11-04: smooth, gently draped fabric as 419 / 420 / 428, not creased: the folds at a tenth.)
  crease: 0.08,
  // (BSF r3, 431: loose cloth hangs from the seat and over the crotch's curve: it is shaded as if hanging, with no dark
  // hollow above the crotch (garment.js seatNormals: from, to, how much of the downward tilt is taken out).)
  seatNormals: [C - 0.01, C + 0.14, 0.85],
  legs: true,
  // (BSF r3, 420: the leg openings finished with a thin flat binding, not a thick roll turned in: they stay open, with
  // a straight edge and sharp corners at the split.)
  hemRoll: 0.0009,
  // (BSF r2: the V split at the side of each hem stays open up to its top, not sewn shut above 3 cm.)
  split: { x: BB_SPLIT.x + 0.07, top: BB_SPLIT.y },
  loose: true,
  depth: 0.16,
  chest: false,
  points: { CF: [0, W], OT: [0.256, W], ST: [0.313, BB_SPLIT.y], IB: [0.043, 0.012], CR: [0, C] },
  worn: {
    sideSeam: BB_SIDE,
    inner: BB_INNER,
    crotch: C,
    blend: [C - 0.02, C + 0.12],
    hipDepth: 0.85,
    // (FN4 2026-10-30, the user: basketball shorts are very loose on a lean, tall player: each leg a wide, straight tube
    // of even width from the crotch to the hem (a slight flare only), hanging well away from the thigh, deep front to
    // back; hardly any of the body showing through.)
    legIn: [0.042, -0.003],
    // (BSF 2026-11-04, client 419: the gap between the legs opening faster towards the hem.)
    // (BSF r3: the inner corners of the hem round away a little more, as 419.)
    inLine: [[0, 0.05], [0.013, 0.046], [0.031, 0.04], [0.062, 0.033], [0.124, 0.02], [0.186, 0.01], [0.248, 0.004], [C, 0]],
    legOut: [0.231, 0.231],
    // (FN9 2026-11-02: the legs' outer side on the same straight line as the hips, from the waist to a slightly wider hem.)
    // (BSF 2026-11-04, client 419/420: the legs hang straight down, about .70 of the height across, the hem's corners
    // rounding in to .60 over its last few cm; above the crotch in to the waist.)
    // (BSF r3, the user 2026-11-04, 429 / 430: the leg openings hang straight down and stay open, not pulled in at the
    // hem; only the last few mm ease in.)
    outLine: [[0, 0.239], [0.06, 0.239], [C, 0.231], [BB.waist, 0.185]],
    legDepth: [0.132, 0.15],
    relief: 0.12,
    seat: 0.05,
    // (BSF r3, 431: the crotch's baked shadow light.)
    shade: 0.4,
    // (BSF r3, 431: the back rises 1.4 cm higher than the front, level across the back and easing down to the side seams.)
    backRise: 0.014,
    riseFlat: [0.12, 0.254],
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
