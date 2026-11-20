// Garment style › Neck style (NK1 2026-11-02, client mockup images/299): the neck's shape as a design setting,
// design.neck: 'round' | 'v' (and, on rugby jerseys, a collar from the rugby collar library: RUGBY_COLLARS). Unset: the
// garment's own neck, exactly as the tile pictures were matched. Only the neck opening's outline changes (the first
// points of the garment's outline), so the print atlas, the colours, logos and artwork all stay where they are.

/** The garments whose neck can be switched (their own default shape). The full kit's top is the jersey. */
// (The netball dress: its Tripo model's own round neck; a V cuts the model's neck and binds it, tripomesh.js cutNeck: user
// 2026-11-13. The old made dress is never shown.)
export const NECK_DEFAULTS = { jersey: 'v', tee: 'round', raglan: 'round', singlet: 'round', 'shooting-shirt': 'v', 'netball-dress': 'round' };

/**
 * The rugby collar library (client mockup images/300, "Rugby Jersey Studio"): each collar's neck shape and its finish.
 *   shape: the opening ('round', 'v', 'shallow': a wide shallow V);
 *   band: the collar band's width (metres, the rib round the opening) and its stripes ([from, to] across the band, 0 its
 *     foot on the body to 1 its top edge, in 'inner' (the kit's main colour), 'accent', 'secondary' or 'white');
 *   tips: short contrast bars where the band meets the shoulder seams (in 'accent' and 'secondary');
 *   stand: a grandad (band) collar standing up that high; wing: the wing collar (wingcollar.js); fold: a fold-down polo
 *     collar (its stand and fall over the band);
 *   placket: a button placket down the centre front ({ length, buttons }); insert: a V insert filling the V under a high
 *     round opening ('v'), or a crossover ('cross').
 * Colours: the collar colour (Neck trim / Collar colour: design.parts.collar) is the band's; stripes and inserts use the
 * kit's own colours, so a change of colours carries through.
 */
export const RUGBY_COLLARS = {
  rc001: { name: 'Round crew, contrast band', shape: 'round', band: { width: 0.02, stripes: [[0.62, 1.01, 'inner']] } },
  rc002: { name: 'V insert, tipped', shape: 'round', insert: 'v', band: { width: 0.012, stripes: [[0.7, 1.01, 'white']] }, tips: true },
  rc003: { name: 'Round crew, double band', shape: 'round', band: { width: 0.022, stripes: [[0.36, 0.44, 'white'], [0.66, 1.01, 'accent']] } },
  rc004: { name: 'Wing collar', shape: 'v', wing: true, band: { width: 0.011 } },
  rc005: { name: 'Round crew, tipped shoulders', shape: 'round', band: { width: 0.016, stripes: [] }, tips: true },
  rc006: { name: 'Grandad collar, 1 button', shape: 'round', stand: 0.016, band: { width: 0.026, stripes: [[0.72, 1.01, 'white']] }, placket: { length: 0.075, buttons: 1 } },
  rc007: { name: 'V-neck, button placket', shape: 'v', band: { width: 0.014 }, placket: { length: 0.05, buttons: 1 } },
  rc008: { name: 'Polo collar, 3 buttons', shape: 'round', fold: true, piping: true, band: { width: 0.011 }, placket: { length: 0.12, buttons: 3 } },
  rc009: { name: 'Polo collar, 1 button', shape: 'round', fold: true, band: { width: 0.011 }, placket: { length: 0.075, buttons: 1 } },
  rc010: { name: 'Fold-down collar, crossover', shape: 'round', fold: true, insert: 'cross', band: { width: 0.011 } },
  'shallow-v': { name: 'Custom shallow V', shape: 'shallow', band: { width: 0.022, stripes: [[0.12, 0.24, 'accent']] } },
};

/** The design's collar from the library (rugby jerseys), or null. */
export function rugbyCollar(design) {
  const id = String(design?.neck ?? '').toLowerCase();
  return RUGBY_COLLARS[id] ? { id, ...RUGBY_COLLARS[id] } : null;
}

/**
 * The neck shape the design asks of a garment `kind`: 'round', 'v' or 'shallow', or null for the garment's own.
 * `own`: the garment's own shape here (the full kit's crew-neck look makes its jersey's own neck round).
 */
export function neckShape(kind, design, own = NECK_DEFAULTS[kind]) {
  if (!NECK_DEFAULTS[kind]) return null;
  const collar = rugbyCollar(design);
  // (The rugby collars are made on the jersey; elsewhere they fall back to their plain shape.)
  const want = collar ? (collar.shape === 'shallow' && kind !== 'jersey' ? 'v' : collar.shape) : design?.neck === 'round' || design?.neck === 'v' ? design.neck : null;
  // (A V chosen in the Style panel, or a V-type collar, always gets its own deep, pointed V: the garment's own V (the
  // jersey's, matched to its tile picture) stays only while nothing is chosen. User 2026-11-02, images/308-309.)
  if (want === 'v' || want === 'shallow') return want;
  return want && want !== own ? want : null;
}

/**
 * The back neck of a cut neck (garment.js backHeight `backNeck`): a smooth round curve, its middle at the jersey's back
 * neck height (0.752), easing down to the shoulder seams at the neck's sides, whatever the front's shape (user
 * 2026-11-02, images/312-314: only the front is a V; the back of the neckline is a smooth round curve). The cloth is
 * drawn up only above `from`, just under the front's foot, clear of the back name.
 */
const backNeck = (foot) => ({ centre: 0.752, from: Math.min(foot - 0.03, 0.64) });

/**
 * A garment's own V (the jersey's, the shooting shirt's: neck left unset) with the same round back (the tester, user
 * 2026-11-02: every client picture shows a round back neck); its front exactly as matched to the tile pictures.
 */
export function roundBack(kind, spec) {
  if (NECK_DEFAULTS[kind] !== 'v' || spec.backNeck || kind === 'netball-dress') return spec;
  return { ...spec, neckPoint: spec.half[2], backNeck: backNeck(spec.half[0][1]), liftZ: true };
}

/**
 * The garment's spec with its neck cut to `shape` ('round', 'v', 'shallow'). The neck's end at the shoulder seam stays
 * where it is (so the shoulders, sleeves and the whole print atlas keep their places); only the opening's foot and its
 * curve change, with the collar band (rim), the open edge and the back neck's line to match.
 */
export function neckCut(kind, spec, shape, model = null) {
  if (!shape) return spec;
  const half = spec.half;
  if (kind === 'netball-dress') {
    // The dress (its Tripo model, user 2026-11-13): only its outline on the pattern (the 2D panels, the print's edge),
    // its V as the model's own is cut (tripomesh.js DRESS_V, seen on the pattern): from its point, 5 cm under the round
    // neck's foot, up to where it meets the round neck (6.3 cm out), the round neck on from there. (A point 4 mm out on
    // the same line keeps the outline's curve from rounding the V's point.)
    if (shape === 'round') return spec;
    const from = half.findIndex(([x]) => x > 0.07);
    return { ...spec, half: [[0, 0.7327], [0.004, 0.7380], [0.0219, 0.7616], [0.0424, 0.7842], [0.063, 0.806], ...half.slice(from)], neckShape: 'v' };
  }
  if (kind === 'singlet') {
    // The singlet: its scoop's foot (0.64) kept; the V straight from it to the strap's inner corner.
    const [nx, ny] = half[2], foot = half[0][1] + (shape === 'shallow' ? 0.03 : 0);
    const neck = shape === 'round' ? [[0, 0.64], [0.06, 0.69], [nx, ny]] : [[0, foot], [0.01, foot + ((ny - foot) * 0.01) / nx], [nx / 2, (foot + ny) / 2], [nx, ny]];
    return { ...spec, half: [...neck, ...half.slice(3)], neckShape: shape, neckPoint: [nx, ny], backNeck: backNeck(neck[0][1]), liftZ: true };
  }
  // Sleeved tops (jersey, tee, raglan, shooting shirt): the tee's crew neck, the jersey's V (6.6 cm deep) or a shallow V
  // (5 cm), each from the garment's own neck point.
  const [nx, ny] = half[2];
  // (The V: 10 cm deep, straight sides and a sharp point (a point 1 cm out on the same line keeps the spline from
  // rounding it); the shallow V 5 cm, also straight and pointed.)
  // (A ready-made model's V (the football jersey, fbjersey.js): `model`, its own edge on the pattern as cut in the model
  // (tripomesh.js tripoNeckOutline), from its point out to its own round neck, which goes on to the shoulder from there.)
  const foot = model?.length ? ny - model[0][1] : { round: 0.038, v: 0.1, shallow: 0.05 }[shape];
  const tip = ny - foot;
  const on = (x) => [x, tip + (foot * x) / nx];
  const neck = model?.length ? [...model.filter(([x]) => x < nx - 0.004), ...half.slice(1, 2).filter(([x]) => x > model.at(-1)[0] + 0.004)] : shape === 'round' ? [[0, tip], [0.05, ny - 0.016]] : [[0, tip], on(0.01), on(nx / 2)];
  const drop = foot + 0.006;
  return {
    ...spec,
    half: [...neck, [nx, ny], ...half.slice(3)],
    neck: { ...spec.neck, drop, half: Math.max(spec.neck.half, nx + 0.004) },
    rim: { ...spec.rim, drop: drop + 0.006 },
    crew: shape === 'round',
    neckShape: shape,
    neckPoint: [nx, ny],
    // (The shallow V's back drawn up whole near its edge: drawn up only at the edge it came out saw-toothed: DT10.)
    backNeck: shape === 'shallow' ? { ...backNeck(tip), whole: true } : backNeck(tip),
    liftZ: true,
    // The back neck's line (garment.js backHeight): the crew neck's or the V's.
    neckLine: shape === 'round' ? (ax) => 0.707 + ax * 0.42 : shape === 'v' ? (ax) => tip + ax * 0.76 : (ax) => tip + ax * 0.6,
    neckTip: tip,
  };
}
