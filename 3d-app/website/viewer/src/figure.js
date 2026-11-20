// The body a garment is made for (2026-10-26, tasks.md 9.126): men's and women's garments are cut and worn differently.
// A garment's spec says which (garment.js `form`: 'male', the default, or 'female'). The worn shape (worn.js) and the
// display mannequin under it in the new look (mannequin.js) follow it.
//
// 'male': the athletic body every garment had so far (worn.js wornTop / wornShorts); its mannequin is taken from the
// made garment itself.
// 'female': a women's figure, in garment metres measured down from the shoulder line (where front and back meet on top
// of the shoulders: the garment's highest point): bust, underbust, waist, hips and the thighs, about a size 10-12.
// A fitted garment (the netball dress) is shaped over it; its mannequin takes the bodice from the made garment and the
// hips and thighs from here (a flared skirt stands away from them).

/** Each level: [drop below the shoulder line, half-width, half-depth, the centre's forward offset] (metres). */
const FEMALE_TORSO = [
  [0.2, 0.162, 0.1, 0],       // underarms
  [0.26, 0.156, 0.098, 0],    // bust (its fullness in front: bust below)
  [0.33, 0.138, 0.094, 0],    // underbust
  [0.4, 0.126, 0.093, 0],     // waist
  [0.5, 0.152, 0.104, -0.004],
  [0.6, 0.168, 0.112, -0.008], // hips at their fullest
  [0.7, 0.164, 0.108, -0.008], // just above the crotch
];

export const FIGURES = {
  male: null,
  female: {
    torso: FEMALE_TORSO,
    waist: 0.4,
    hip: 0.6,
    crotch: 0.7,
    /** The seat's fullness behind (metres, at the hips' fullest) and the bust's in front (at its apex). */
    seat: 0.016,
    bust: { drop: 0.26, x: 0.09, depth: 0.036 },
    /** Each thigh: its centre out from the middle, its radius at the top and at mid-thigh (0.9 below the shoulders). */
    thigh: { x: 0.084, top: 0.082, mid: 0.064 },
    /** The shoulders a sleeveless garment's armholes show: from beside the neck out to the arm plate; its foot is
     *  `drop + height` below the shoulder line, its top slopes down `slope` per metre out past 9 cm; its half-depth. */
    shoulder: { from: 0.05, to: 0.165, height: 0.068, depth: 0.058, drop: 0.09, slope: 0.4 },
  },
};

/** The figure a garment's spec asks for (null: the male athletic body). */
export const figureOf = (spec) => FIGURES[spec?.form] ?? null;

const lerp = (a, b, t) => a + (b - a) * t;
/** The torso's [half-width, half-depth, forward] at `drop` metres below the shoulder line (held past its ends). */
export function torsoAt(figure, drop) {
  const T = figure.torso;
  if (drop <= T[0][0]) return T[0].slice(1);
  for (let i = 1; i < T.length; i++) {
    if (drop <= T[i][0]) {
      const t = (drop - T[i - 1][0]) / (T[i][0] - T[i - 1][0]), s = t * t * (3 - 2 * t);
      return [1, 2, 3].map((k) => lerp(T[i - 1][k], T[i][k], s));
    }
  }
  return T.at(-1).slice(1);
}
