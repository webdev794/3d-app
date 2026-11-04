/**
 * The netball dress's own parts (NDF 2026-11-04, the client's preferred model, images 425-427): a straight shift dress
 * (garment.js SPECS['netball-dress'], worn.js wornShift) with
 *  - full-length side panels, from the underarm to the hem, a little wider towards the hem (ND_PANEL);
 *  - a yoke: a band across the upper back under a top in the body's colour (ND_YOKE_BACK), over the straps and the
 *    upper chest in front (ND_YOKE_FRONT);
 *  - the neck and armholes bound in the yoke's colour;
 *  - the bib-holder (velcro) tabs on the front: two across above the bib, one upright each side of it, two across
 *    below it (ND_TABS), sewn on in a deeper shade of the body.
 * Each in its own colour (design.zoneColors): `body` (else the Primary), `panels` and `yoke` (else the Secondary) and
 * `binding` (else the yoke's).
 * All in garment metres on the flat dress (y up, the hem at 0, the strap tops at 0.88; right half, mirrored).
 */

const HEX = /^#[0-9a-f]{6}$/i;

/** The side seam (right half), from the underarm down to the hem's corner: the dress's own cut (garment.js uses it). */
// (Narrowest at 40% of the height down, 1.33x as wide at the hem: NDT's measures of 425-427.)
export const ND_SEAM = [
  [0.248, 0.735], [0.254, 0.7], [0.253, 0.66], [0.243, 0.62], [0.23, 0.58], [0.221, 0.53], [0.224, 0.48], [0.235, 0.43],
  [0.253, 0.37], [0.276, 0.3], [0.297, 0.22], [0.315, 0.14], [0.327, 0.07], [0.333, 0.03],
];
/** The side seam's half-width at a height. */
export function seamX(y) {
  const S = ND_SEAM;
  if (y >= S[0][1]) return S[0][0];
  for (let i = 1; i < S.length; i++) {
    const [x0, y0] = S[i - 1], [x1, y1] = S[i];
    if (y >= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  }
  const [x0, y0] = S.at(-2), [x1, y1] = S.at(-1);
  return x1 + ((x1 - x0) * (y - y1)) / (y1 - y0);
}
/** The side panel's width in from the side seam (metres): an even 6 cm band down to the waist, widening to 8 cm at the
 *  hem as the A-line does (425's back panels: 0.043 of the height at the waist, 0.061 lower down; and from the side
 *  three-quarter, 426, the panel reaches round to the silhouette's edge all the way down). */
const panelWidth = (y) => 0.06 + 0.02 * Math.min(1, Math.max(0, (0.45 - y) / 0.42));
/** The side panel's inner edge (right half), top down: from the armhole's foot (inside its binding) to below the hem. */
export const ND_PANEL_EDGE = (() => {
  const out = [[0.185, 0.78], [0.178, 0.75]];
  for (let y = 0.72; y > -0.011; y -= 0.03) out.push([+(seamX(y) - panelWidth(y)).toFixed(4), +y.toFixed(3)]);
  out.push([+(seamX(-0.01) - panelWidth(-0.01)).toFixed(4), -0.01]);
  return out;
})();
/** The side panel (right half) as a closed outline: its inner edge, then out past the side seam. */
export const ND_PANEL = [...ND_PANEL_EDGE, [0.6, -0.01], [0.6, 0.75]];
/** The yoke in front: over the straps and the upper chest, down to a line from the neck's foot out to the armholes. */
// (Its foot 0.17 of the height under the shoulders in the middle, 0.20 where it meets the side panels: 427.)
export const ND_YOKE_FRONT_EDGE = [[0, 0.732], [0.06, 0.729], [0.12, 0.722], [0.17, 0.713], [0.21, 0.705], [0.26, 0.698]];
export const ND_YOKE_FRONT = [...ND_YOKE_FRONT_EDGE, [0.6, 0.698], [0.6, 1.0], [0, 1.0]];
/** The yoke behind (425): a band across the upper back, under a broad area of the body's colour across the top (round
 *  the high back neck and over the backs of the straps, 0.08-0.09 of the height deep), its foot arched: 0.234 of the
 *  height under the shoulders in the middle, 0.27 at the sides, where it runs on into the side panels under the arms. */
export const ND_YOKE_BACK_EDGE = [[0, 0.674], [0.08, 0.671], [0.14, 0.663], [0.19, 0.651], [0.23, 0.642], [0.26, 0.637]];
// (Its top on the flat, solved so that once the back neck's lift (garment.js backHeight) has carried it up it runs
// smoothly from 0.80 high in the middle (0.09 of the height under the shoulders) to 0.81 over the straps (0.08), as 425.)
const ND_YOKE_BACK_TOP = [[0, 0.7504], [0.02, 0.7527], [0.04, 0.7571], [0.06, 0.765], [0.07, 0.7718], [0.08, 0.7805], [0.085, 0.7864],
  [0.09, 0.7919], [0.094, 0.8019], [0.097, 0.8078], [0.0979, 0.8079], [0.11, 0.81], [0.6, 0.81]];
export const ND_YOKE_BACK = [...ND_YOKE_BACK_EDGE, [0.6, 0.637], ...ND_YOKE_BACK_TOP.slice().reverse()];
/** The bib-holder tabs on the front, [centre x, centre y, width, height] (metres): round the position bib's edges. */
// (Round the tile's bib: 0.36 to 0.61 of the height down, 0.235 of it wide, as 427's.)
export const ND_TABS = [
  [-0.066, 0.563, 0.052, 0.017], [0.066, 0.563, 0.052, 0.017],
  [-0.111, 0.455, 0.017, 0.052], [0.111, 0.455, 0.017, 0.052],
  [-0.066, 0.347, 0.052, 0.017], [0.066, 0.347, 0.052, 0.017],
];
/** How far a front point is inside a tab (metres; < 0 outside), for the tabs' raised relief (garment.js). */
export function tabInside(x, y) {
  let best = -1;
  for (const [cx, cy, w, h] of ND_TABS) best = Math.max(best, Math.min(w / 2 - Math.abs(x - cx), h / 2 - Math.abs(y - cy)));
  return best;
}
/** A closed outline mirrored to the left half (for both sides as one list of outlines). */
export const mirrored = (poly) => [poly, poly.map(([x, y]) => [-x, y]).reverse()];

const hex = (v) => (typeof v === 'string' && HEX.test(v) ? v : null);
/** The dress's colours: the body, the side panels, the yoke and the binding (the binding follows the yoke). */
export function dressColours(design) {
  const z = design.zoneColors ?? {};
  const body = hex(z.body) ?? hex(design.main) ?? '#1b1d20';
  const panels = hex(z.panels) ?? hex(design.secondary) ?? body;
  const yoke = hex(z.yoke) ?? hex(design.secondary) ?? panels;
  return { body, panels, yoke, binding: hex(z.binding) ?? yoke };
}
/**
 * A design made for the old netball dress (its tile look before NDF: the sides printed with the body's Blades, a black
 * neck) opens on the new dress with its colours mapped to the new parts: the body keeps the Primary and its print, the
 * side panels and yoke take the Secondary (the old side ribbons' and armhole binding's colour). Its old part looks for
 * the sides and collar (the body's own colour and print again) are dropped, so the panels and yoke show.
 */
export function dressDesign(design) {
  const parts = design.parts;
  if (!parts) return design;
  const same = (s) => !!s && (!s.colour || s.colour.toLowerCase() === String(design.main).toLowerCase());
  const oldSides = same(parts.sides) && parts.sides.pattern === 'Blades' && !parts.sides.fade;
  if (!oldSides) return design;
  const { sides: _s, ...rest } = parts;
  if (same(rest.collar) && !rest.collar.pattern && !rest.collar.fade) delete rest.collar;
  return { ...design, parts: Object.keys(rest).length ? rest : null };
}

/** Fills a polygon (and its mirror). */
function fillBoth(g, poly) {
  for (const p of mirrored(poly)) {
    g.beginPath();
    p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  }
}

/**
 * Before the dress is painted inside its outline (texture.js): the margin just outside it in the colour of the part along
 * each edge (the panels' along the side seams and under their hem, the binding's along the neck and armholes), so the
 * texture's smoothing at the seams does not pull in the body's colour (it showed as a thin line down the middle of each
 * side panel, along the side seam: NDF). Kept clear of the other side's half of the print (x within 0.36).
 */
export function paintDressBleed(t, design, back) {
  const g = t.ctx, c = dressColours(design);
  g.save();
  t.side(back);
  g.fillStyle = c.panels;
  fillBoth(g, ND_PANEL.map(([x, y]) => [Math.min(x, 0.36), y]));
  const runs = t.dressEdges();
  g.strokeStyle = c.binding;
  g.lineWidth = 0.04;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const run of [runs.neck, ...runs.armholes]) {
    if (!run?.length) continue;
    g.beginPath();
    run.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
  }
  g.restore();
}

/** The side panels (both sides) in the panels' colour, or a part look (paintLook) when the Side panels part has one. */
export function paintDressPanels(t, design, back, paintLook) {
  const g = t.ctx;
  g.fillStyle = dressColours(design).panels;
  for (const p of mirrored(ND_PANEL)) {
    g.beginPath();
    p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    if (paintLook) { g.save(); g.clip(); paintLook(); g.restore(); }
  }
}

/** The yoke, front (straps and upper chest) or back (across the shoulders). */
export function paintDressYoke(t, design, back) {
  const g = t.ctx;
  g.fillStyle = dressColours(design).yoke;
  fillBoth(g, back ? ND_YOKE_BACK : ND_YOKE_FRONT);
}

/** The neck and armhole binding in its own colour (the neck in the Collar part's own colour when it has one). */
export function paintDressBinding(t, design, back, neckOwn) {
  const g = t.ctx, runs = t.dressEdges(), yoke = dressColours(design).binding;
  g.lineJoin = 'round';
  g.lineCap = 'butt';
  for (const run of [runs.neck, ...runs.armholes]) {
    if (!run?.length) continue;
    g.strokeStyle = run === runs.neck ? neckOwn ?? yoke : yoke;
    // (About 1.1 cm showing at the neck and 1.3 cm round the armholes, as the pictures': half the stroke is off the edge.)
    g.lineWidth = run === runs.neck ? 0.022 : 0.026;
    g.beginPath();
    run.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
  }
}

/**
 * The seams the dress's pieces are sewn along (garment metres, runs of {x, y}), each with its row of top-stitching 3 mm
 * onto the body: the side panels' inner edges and the yoke's foot.
 */
export function dressSeams(back) {
  const run = (pts, dx, dy) => pts.map(([x, y]) => ({ x: x + dx(x), y: y + dy }));
  const yoke = back ? ND_YOKE_BACK_EDGE : ND_YOKE_FRONT_EDGE;
  const across = [...yoke.slice().reverse().map(([x, y]) => [-x, y]), ...yoke.slice(1)];
  return [
    { seam: run(ND_PANEL_EDGE, () => 0, 0), stitch: run(ND_PANEL_EDGE, () => -0.003, 0) },
    { seam: run(ND_PANEL_EDGE.map(([x, y]) => [-x, y]), () => 0, 0), stitch: run(ND_PANEL_EDGE.map(([x, y]) => [-x, y]), () => 0.003, 0) },
    { seam: run(across, () => 0, 0), stitch: run(across, () => 0, -0.003) },
  ];
}

const shade = (h, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
/**
 * The bib-holder tabs (front), sewn on over everything else (a position bib is fastened onto them): a deeper shade of
 * the body, the hook side's fine nap, a stitched edge.
 */
export function paintDressTabs(t, design) {
  const g = t.ctx, body = dressColours(design).body;
  g.save();
  t.clipOutline(false);
  for (const [cx, cy, w, h] of ND_TABS) {
    const x0 = cx - w / 2, y0 = cy - h / 2, r = 0.003;
    g.fillStyle = shade(body, 0.72);
    g.beginPath(); g.roundRect(x0, y0, w, h, r); g.fill();
    // The nap: fine rows across the tab, a touch lighter and darker.
    const across = w > h;
    for (let k = 0, s = 0.0016; k * s < (across ? h : w) - 0.002; k++) {
      g.fillStyle = k % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
      if (across) g.fillRect(x0 + 0.002, y0 + 0.001 + k * s, w - 0.004, s * 0.6);
      else g.fillRect(x0 + 0.001 + k * s, y0 + 0.002, s * 0.6, h - 0.004);
    }
    // Its edge: a soft dark outline and a row of stitching 2 mm in.
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 0.0012;
    g.beginPath(); g.roundRect(x0, y0, w, h, r); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 0.0007;
    g.setLineDash([0.0022, 0.0014]);
    g.beginPath(); g.roundRect(x0 + 0.002, y0 + 0.002, w - 0.004, h - 0.004, r * 0.6); g.stroke();
    g.setLineDash([]);
  }
  g.restore();
}
