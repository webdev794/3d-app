// The Rugby jersey tile picture's side sweeps (FN4 2026-10-30, media/showroom/garment-rugby-jersey.webp and the Rugby
// League kit's): flat painted shapes in the picture's own two colours, up each side of the front and back: a long
// curved cyan blade along the side seam with a royal blue stripe in its middle, thin cyan spikes reaching in towards the
// chest, and a cyan spike up from the hem. Drawn when the tile look sets design.zoneColors.sweep (cyan) and
// sweepDeep (royal blue), and the cyan raglan shoulders with design.zoneColors.raglan; any other jersey is unchanged.
const HEX = /^#[0-9a-f]{6}$/i;
// The picture's pixels (its wearer's left side: the centre at x 384, the side seam at 575, the hem at 715) to the flat
// print's garment metres.
// (Round 2: the picture is a photo of the front, so its x is the sine of the way round the body: the flat print's x is
// the arc, out to the side seam at about 0.27. The blades then show as wide on the front as in the picture.)
const X = (px) => 0.27 * (Math.asin(Math.max(-1, Math.min(1, (px - 384) / 191))) / (Math.PI / 2)), Y = (py) => (715 - py) * 0.00112;

/** A blade along a quadratic centreline p0 -> c -> p1 (picture px), its width (px) at t from `w(t)`. */
function blade(g, p0, c, p1, w, s) {
  const N = 40, left = [], right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], y = u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1];
    const dx = 2 * u * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]), dy = 2 * u * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]);
    const l = Math.hypot(dx, dy) || 1, half = w(t) / 2, nx = -dy / l, ny = dx / l;
    left.push([x + nx * half, y + ny * half]);
    right.push([x - nx * half, y - ny * half]);
  }
  g.beginPath();
  [...left, ...right.reverse()].forEach(([x, y], i) => (i ? g.lineTo(s * X(x), Y(y)) : g.moveTo(s * X(x), Y(y))));
  g.closePath();
  g.fill();
}
const taper = (a, b) => (t) => a + (b - a) * t;

/** Paints the sweeps on one side of the flat print (its frame already set: garment metres, y up). */
export function paintJerseySweeps(painter, design, back) {
  const zc = design.zoneColors ?? {};
  if (!HEX.test(zc.sweep ?? '') || !HEX.test(zc.sweepDeep ?? '')) return;
  const g = painter.ctx, cyan = zc.sweep, royal = zc.sweepDeep, black = design.main;
  g.save();
  // The cyan raglan panels (design.zoneColors.raglan): from the collar along the raglan seam to the underarm, over the
  // shoulder and the sleeve's top; the sleeve under the underarm's level stays black, as the picture's.
  if (HEX.test(zc.raglan ?? '')) {
    g.fillStyle = zc.raglan;
    for (const dir of [-1, 1]) {
      g.beginPath();
      g.moveTo(dir * 0.058, 0.9);
      g.lineTo(dir * 0.058, 0.69);
      g.quadraticCurveTo(dir * 0.15, 0.62, dir * 0.262, 0.54);
      g.lineTo(dir * 0.7, 0.54);
      g.lineTo(dir * 0.7, 0.9);
      g.closePath();
      g.fill();
    }
  }
  // The picture's trims with the raglan panels: a plain black hem (no band) and wide cyan cuffs (about 2.5 cm).
  if (HEX.test(zc.raglan ?? '')) {
    for (const run of painter.edges()) {
      if (run.kind === 'hem') { g.fillStyle = black; painter.band(run.points, 0.012); }
      else if (run.kind === 'cuff') { g.fillStyle = zc.raglan; painter.band(run.points, 0.025); }
    }
  }
  for (const s of [1, -1]) {
    // The long blade: thin under the arm, bowing in to its widest at the waist, down to the hem.
    g.fillStyle = cyan;
    blade(g, [586, 262], [488, 480], [576, 722], (t) => (t < 0.45 ? 3 + 31 * (t / 0.45) ** 0.8 : 34 - 12 * ((t - 0.45) / 0.55)), s);
    // Its royal blue middle.
    g.fillStyle = royal;
    blade(g, [562, 400], [502, 545], [562, 722], (t) => 2 + 12 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7, s);
    // A black split low in the blade, and one along the side seam above.
    g.fillStyle = black;
    blade(g, [566, 575], [552, 650], [588, 722], (t) => 1.5 + 3 * t, s);
    blade(g, [578, 330], [566, 400], [560, 470], (t) => 4 * Math.sin(Math.PI * t), s);
    // The thin spikes reaching in towards the chest.
    g.fillStyle = cyan;
    blade(g, [568, 316], [520, 380], [462, 470], taper(9, 0.5), s);
    blade(g, [522, 466], [494, 512], [462, 553], taper(8, 0.5), s);
    // The spike up from the hem.
    blade(g, [522, 724], [520, 662], [532, 600], taper(16, 0.5), s);
  }
  g.restore();
}

/**
 * The Singlet tile picture's side flows (FN4 2026-10-30, media/showroom/garment-singlet.webp): a big blue shape up each
 * side from the hem to the armhole, reaching in to a point at about two thirds of the way up, in the picture's flat
 * tones: azure (design.zoneColors.flow), a light sky lobe along its upper inner edge (flowLight) and royal blue low on
 * the outside (flowDeep). Front and back. Only with those colours set (the tile look); any other singlet is unchanged.
 */
const SX = (px) => 0.245 * ((px - 320) / 150), SY = (py) => (600 - py) * 0.001336;
const FLOW = [[470, 218], [458, 240], [446, 300], [432, 345], [410, 366], [376, 400], [388, 430], [398, 470], [408, 520], [424, 565], [440, 612], [520, 612], [520, 218]];
const FLOW_LIGHT = [[470, 226], [462, 236], [452, 280], [440, 330], [410, 366], [376, 400], [386, 412], [404, 404], [430, 380], [446, 340], [458, 290], [470, 250]];
const FLOW_MID = [[386, 412], [404, 404], [432, 384], [428, 440], [424, 500], [432, 540], [420, 540], [408, 500], [398, 460]];
const FLOW_DEEP = [[408, 520], [424, 565], [440, 612], [520, 612], [520, 470], [470, 470], [452, 500], [440, 540], [430, 520]];
export function paintSingletFlows(painter, design) {
  const zc = design.zoneColors ?? {};
  if (!HEX.test(zc.flow ?? '') || !HEX.test(zc.flowLight ?? '') || !HEX.test(zc.flowDeep ?? '')) return;
  const g = painter.ctx;
  const poly = (pts, s) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(s * SX(x), SY(y)) : g.moveTo(s * SX(x), SY(y)))); g.closePath(); g.fill(); };
  g.save();
  for (const s of [1, -1]) {
    g.fillStyle = zc.flow; poly(FLOW, s);
    g.fillStyle = zc.flowLight; poly(FLOW_LIGHT, s); poly(FLOW_MID, s);
    g.fillStyle = zc.flowDeep; poly(FLOW_DEEP, s);
  }
  g.restore();
}
