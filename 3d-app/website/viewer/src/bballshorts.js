// The basketball shorts (COMING SOON item 7, 2026-10-29): long, loose game shorts, cut as the client's tile picture
// (media/showroom/garment-basketball-shorts.webp): knee length, the legs hanging wide and straight from the hips, a deep
// gathered elastic waistband (three stitched channels) and the body's colour at the waist and hems. Its own cut and
// builder, so a professional model can replace it without touching the other garments: the shorts made as garment.js
// makes them (front and back panels sewn at the sides and the inner legs, worn round the body by worn.js wornShorts)
// with this cut; its print, parts and marks are in bballprint.js.
import { buildGarment, SPECS } from './garment.js';
import { BB, BB_SIDE, BB_INNER, BB_SPLIT, BB_VENT, BB_LEG } from './bballprint.js';

const { waist: W, crotch: C } = BB;
/** Smoothstep from a to b. */
const THREE_ramp = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
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
    [0, W], ...BB_SIDE.slice().reverse().filter(([y]) => y > BB_SPLIT.y + 0.01).map(([y, x]) => [x, y]), ...BB_VENT.slice().reverse(), [0.16, 0], [0.075, 0.002], [0.05, 0.006], [0.043, 0.012], ...BB_INNER.slice(1).map(([y, x]) => [x, y]),
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
  // (BSF r6: no shadow line under the gathered band.)
  rimShade: 0,
  // (BSF 2026-11-05, client 428 / 434, Yellow Images front, back, half side: many soft vertical folds falling from the
  // gathered waistband down the front, the seat and the legs, a few gentle diagonal folds on the legs from the inner thigh
  // out and down; none on the hem's bound band, which stays straight.)
  folds: (p, back) => {
    const ax = Math.abs(p.x), y = p.y, ph = back ? 1.9 : 0.4, side = p.x < 0 ? 0.7 : 0;
    const soft = (v) => Math.sign(v) * Math.abs(v) ** 1.4;
    // (BST on -253: none over the hem band, and none near the side seams, so the outline stays smooth.)
    const sideX = BB_SIDE.reduce((x, [yy, xx], k, a) => (k && y >= a[k - 1][0] && y <= yy ? a[k - 1][1] + ((xx - a[k - 1][1]) * (y - a[k - 1][0])) / (yy - a[k - 1][0]) : x), BB_SIDE.at(-1)[1]);
    const keep = THREE_ramp(0.035, 0.09, y) * (back ? THREE_ramp(sideX - 0.015, sideX - 0.07, ax) : THREE_ramp(sideX - 0.07, sideX - 0.2, ax));
    // (Not at the waist's edge, under the band, so the band stays one smooth piece; softer at the centre seam.)
    const top = THREE_ramp(W - 0.03, W - 0.075, y) * (0.4 + 0.6 * THREE_ramp(0.005, 0.045, ax));
    // In front: a few soft folds from the band, about 6 cm apart, uneven in spacing and length, fading out by ~45 % down.
    // (BST on -256: 8-10 shallow soft folds spread evenly over both front panels, not deep tubes by the fly.)
    const k = p.x * 120 + 0.9 * Math.sin(p.x * 31 + 0.8) + ph + side;
    const reach = W - 0.26 - 0.05 * (0.5 + 0.5 * Math.sin(p.x * 23 + 1.3 + side));
    // (BST folds.py on -255: the picture's folds ~2.5x deeper up top, ~4x lower down, reaching ~45 % down.)
    const depth = 0.0045 + 0.0105 * THREE_ramp(W - 0.3, W - 0.06, y);
    // Two scales mixed, so no two folds are alike: broad soft folds and, near the band, the elastic's fine gathers
    // running straight up into it.
    const broad = Math.sin(k) * (0.7 + 0.3 * Math.sin(p.x * 17 + 2.1)) + 0.45 * Math.sin(p.x * 197 + 2.3 * Math.sin(p.x * 13 + y * 5) + ph);
    const fine = Math.sin(p.x * 420 + 0.8 * Math.sin(p.x * 57)) * 0.0005 * THREE_ramp(W - 0.1, W - 0.035, y);
    // (Shallower towards the sides, where at 40 degrees they were seen edge-on as shiny tubes: BST on -263.)
    const front = back ? 0 : broad * depth * 0.62 * (1 - 0.6 * THREE_ramp(0.09, 0.17, ax)) * THREE_ramp(reach - 0.04, reach + 0.06, y) + fine;
    // (Client 451 / yi-back, BST on -266: the back is smooth under the band: no V folds, only the band's fine gathers.)
    // Behind: a few soft V folds just under the band, towards the centre, gone by ~18 % down; then a smooth seat.
    const vx = ax - (W - 0.03 - y) * 0.5;
    const vee = back ? 0 * soft(Math.sin(vx * 95 + ph)) * THREE_ramp(W - 0.13, W - 0.06, y) * THREE_ramp(0.2, 0.1, ax) : 0;
    // Behind below the V, down the seat: soft, faint, uneven upright folds.
    const seatF = back ? soft(Math.sin(p.x * 80 + 1.2 * Math.sin(y * 9 + p.x * 13) + ph)) * 0.0032 * THREE_ramp(W - 0.31, W - 0.2, y) * THREE_ramp(W - 0.06, W - 0.12, y) : 0;
    // The legs: a few long faint vertical folds below the crotch; a small soft fold at the crotch.
    const legs = soft(Math.sin(p.x * 60 + 0.9 * Math.sin(y * 6) + ph + side)) * 0.0008 * THREE_ramp(C + 0.02, C - 0.06, y);
    // (Client yi-back / 451: the elastic band's dense ruching, all round, and a few soft gathers just under it, 7-12 %
    // down, fading out by about 15 %.)
    // (BSF r16: the fine ruching and creases are now in the relief map (bballprint.js), sharp; the mesh keeps a faint swell.)
    const ruche = (0.65 + 0.35 * Math.sin(p.x * 37 + ph)) * Math.sin(p.x * 290 + 0.9 * Math.sin(p.x * 61 + ph)) * 0.0008 * THREE_ramp(W - 0.036, W - 0.026, y);
    const under = Math.sin(p.x * 300 + 1.1 * Math.sin(p.x * 43 + y * 20) + ph) * 0.0015 * THREE_ramp(W - 0.1, W - 0.05, y) * THREE_ramp(W - 0.022, W - 0.035, y);
    const crotch = Math.exp(-(((ax - 0.05) / 0.025) ** 2 + ((y - C + 0.03) / 0.03) ** 2)) * 0.0018;
    return keep * top * (front + vee + seatF) + keep * legs + THREE_ramp(sideX - 0.003, sideX - 0.03, ax) * (ruche + (back ? under : 0)) + crotch * THREE_ramp(0.035, 0.09, y);
  },

  legs: true,
  // (BSF r3, 420: the leg openings finished with a thin flat binding, not a thick roll turned in: they stay open, with
  // a straight edge and sharp corners at the split.)
  hemRoll: 0.0009,
  hemAllowance: 0.002,
  // (The band folded over at the top and 2.5 cm down inside, in its own colour: no dark strip along its top: BST on -268.)
  waistFold: { roll: 0.0022, inside: 0.025 },
  // (Just under the band the cloth is shaded as if it hung straight down, not catching the top light as a pale strip.)
  bandNormals: [W - 0.15, W - 0.026, 1],
  // (BSF r2: the V split at the side of each hem stays open up to its top, not sewn shut above 3 cm.)
  split: { x: BB_SPLIT.x + 0.07, top: BB_SPLIT.y },
  loose: true,
  depth: 0.16,
  chest: false,
  points: { CF: [0, W], OT: [BB_SIDE.at(-1)[1], W], ST: [0.313, BB_SPLIT.y], IB: [0.043, 0.012], CR: [0, C] },
  worn: {
    sideSeam: BB_SIDE,
    inner: BB_INNER,
    crotch: C,
    blend: [C - 0.02, C + 0.12],
    hipDepth: 0.7,
    // (BSF r16: `[front, back]`: the front's sides fuller, so the hips read about 1 % wider in front and at 40 degrees.)
    hipBox: [3.2, 2.5],
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
    // (BSF r16, BST on -270: the front hips ~1 % fuller just above the crotch.)
    outLine: [[0, BB_LEG.outHem], [0.06, BB_LEG.outHem], [C, 0.2275], [C + 0.06, 0.229], [BB.waist, 0.185]],
    legDepth: [BB_LEG.depthHem, 0.145],
    relief: 0.12,
    seat: 0.05,
    // (BSF r3, 431: the crotch's baked shadow light.)
    shade: 0.4,
    // (BSF r3, 431: the back rises 1.4 cm higher than the front, level across the back and easing down to the side seams.)
    backRise: 0.011,
    riseFlat: [0.11, 0.237],
  },
};
SPECS.bballshorts = BBALL_SHORTS;

/**
 * Builds the basketball shorts (garment.js's garment object): the deep gathered waistband in the body's colour
 * (`rimColour`), no drawstring showing (its cord is inside the band, as on the picture), no neck label.
 */
export function buildBballShorts({ detail = false } = {}) {
  // (A finer mesh, so the soft folds shade smoothly, with no diamond facets: BSF 2026-11-05.)
  const garment = buildGarment('bballshorts', { spec: BBALL_SHORTS, detail, step: 0.006 });
  garment.drawstring = false;
  garment.bball = true;
  garment.rimColour = 'main';
  return garment;
}
