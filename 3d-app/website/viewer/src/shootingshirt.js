// The basketball shooting shirt (COMING SOON plan item 8; WF1 lane B2, 2026-10-29): a loose short-sleeve warm-up tee,
// as the client's tile picture (garment-shooting-shirt.webp) shows it: a V neck with a rib collar band, raglan sleeves
// (the seam runs from the neck down to the underarm, so the sleeve colour reaches the collar), longer and wider short
// sleeves that stand off the arm, finished with a cuff band and a thin stripe, and a loose body that hangs straight
// from the chest to a plain hem. Its own spec and print helpers here, so a professional model can replace it without
// touching the other garments (garment.js builds the mesh from SHOOTING, texture.js calls the helpers).

/** Garment metres (right half, y up, hem at 0): the cuff's top and bottom corners. */
// (FN5 2026-10-30, the user: basketball players are lean and tall with long arms: the sleeves 2 cm longer and the body
// 4 cm longer than WF1's cut, the cloth hanging straight and loose.)
const CT = [0.465, 0.545], CB = [0.4, 0.441];

/**
 * The cut: the jersey's body (garment.js TOP_BODY) with a deeper V neck, raglan shoulders and longer, wider sleeves (3
 * cm longer than the tee's, the cuff 12 cm across instead of 10). `looseSleeve`: the sleeve stands off the arm, wider
 * towards the cuff (worn.js; the mannequin's arm stays thin inside it). `raglan`: sewn and printed with raglan seams.
 */
export const SHOOTING = {
  half: [
    [0, 0.636], [0.05, 0.693], [0.09, 0.738],
    [0.19, 0.717], [0.258, 0.69], [0.345, 0.632], CT, [0.436, 0.491], CB, [0.318, 0.492], [0.258, 0.53],
    [0.25, 0.42], [0.244, 0.3], [0.25, 0.14], [0.258, -0.01], [0.2, -0.028], [0.1, -0.038], [0, -0.04],
  ],
  neck: { drop: 0.106, half: 0.094 },
  rim: { drop: 0.11, half: 0.112, radius: 0.0095 },
  cuff: [CT, CB],
  points: { CT, CB },
  depth: 0.2,
  chest: true,
  loose: true,
  raglan: true,
  looseSleeve: { cuff: 0.063 },
  // The arms (and so the sleeves) stand a little out from the sides, as on the picture (worn.js; 80 degrees on the others).
  // (FN5, DT8: a little nearer the body, 70 degrees: the picture's sleeves span .89 of its height.)
  armDrop: 70,
  cuffKeep: 0.04,
};

/** The front V's tip (garment metres): the collar trim and its seam follow the neck opening. */
export const SHOOT_V = 0.632;

/** The raglan seam on one side (dir 1: the wearer's left), from the shoulder line beside the collar to the underarm. */
export function shootSeam(dir, steps = 24) {
  const [x0, y0] = [0.118, 0.732], [cx, cy] = [0.148, 0.632], [x1, y1] = [0.258, 0.53];
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = k / steps, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    return [dir * (a * x0 + b * cx + c * x1), a * y0 + b * cy + c * y1];
  });
}

/**
 * The shirt's areas that are not rectangles (zones.js), on the wearer's left (+x; mirrored): the raglan sleeve from its
 * seam out to the cuff (up to the collar), and the side panels the picture's shards fill, from the underarm to the hem.
 */
export const SHOOT_ZONES = {
  sleeves: [[0.118, 0.9], ...shootSeam(1), [0.262, 0.4], [0.9, 0.4], [0.9, 0.9]],
  sides: [[0.24, 0.53], [0.3, 0.53], [0.3, -0.07], [0.08, -0.07], [0.092, 0.12], [0.112, 0.26], [0.15, 0.38], [0.2, 0.48]],
};

/** Where the shirt's own marks go (as on the picture): the "3" mark and the word under it on the left chest, the number in the middle. */
export const SHOOT_MARKS = {
  // (FN5 2026-10-30, tester DT8: the stack 2 cm higher, the word tight under the "3" as the picture's.)
  crest: { side: 'front', x: 0.08, y: 0.59 },
  wordmark: { side: 'front', x: 0.08, y: 0.556 },
  frontNumber: { side: 'front', x: 0, y: 0.432 },
};

/** The crest's corners (metres, y up): the usual shield's, about 0.72 as big (the picture's small chest logo). */
export const SHOOT_CREST = [[0, 0.0245], [0.02, 0.013], [0.016, -0.0145], [0, -0.026], [-0.016, -0.0145], [-0.02, 0.013]];

/**
 * The cuffs (the picture): from the sleeve's edge, a narrow band in the cuff colour, a thin stripe in the trim colour,
 * then a wider band in the cuff colour (the kit's own pattern colour, else the trim colour a little darker). Each runs
 * an even distance from the edge all the way round (painter.inset), a little past each end.
 */
export function paintShootCuffs(painter, design, trim, cuffInk) {
  const g = painter.ctx;
  for (const run of painter.edges()) {
    if (run.kind !== 'cuff') continue;
    const strip = (from, to, style) => {
      const path = [...painter.inset(run.points, from, 0.03), ...painter.inset(run.points, to, 0.03).reverse()];
      g.beginPath();
      path.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.fillStyle = style;
      g.fill();
    };
    strip(-0.004, 0.0235, cuffInk);
    strip(0.0045, 0.0085, trim);
  }
}

/** The V collar's trim on the print (the rib band round the neck opening), its seam and stitching. */
export function shootNeckline(back, drop = 0, inset = 0) {
  return (c) => { c.moveTo(-0.092 + inset, 0.745 - drop); c.lineTo(0, (back ? 0.69 : SHOOT_V) - drop); c.lineTo(0.092 - inset, 0.745 - drop); };
}

/**
 * Side shards (the shooting shirt picture's side panels; pattern "Shards"), traced from the client's tile picture
 * (garment-shooting-shirt.webp, 640 px; FN5 2026-10-30, tester DT8): on each side a cyan blade from the underarm down
 * the side seam that runs on as a thin spike down and in to a point at the side of the stomach; a royal blue panel from
 * the side of the chest, widening to the hem along the side seam; and a thin cyan spike from the side of the stomach
 * down to the hem along the panel's inner edge. Outlines in the picture's pixels (its left side), taken onto the flat
 * pattern: the picture's silhouette edge is the side seam (x 0.258), its x stretched 0.565 m per half-width in from
 * there (as the front view shows it); its underarm (y 276) is ours (0.53), its hem (y 583) ours (-0.01). Past the side
 * seam, round the side, the edge's colour. Both sides mirrored.
 */
const PIC_EDGE = [[276, 190], [380, 191], [440, 188], [540, 185], [583, 184]];
const picEdge = (y) => {
  for (let k = 1; k < PIC_EDGE.length; k++) {
    const [y0, x0] = PIC_EDGE[k - 1], [y1, x1] = PIC_EDGE[k];
    if (y <= y1 || k === PIC_EDGE.length - 1) return x0 + ((x1 - x0) * (Math.min(Math.max(y, y0), y1) - y0)) / (y1 - y0);
  }
  return 190;
};
const flat = ([x, y]) => { const e = picEdge(y); return [0.258 - (0.565 * (x - e)) / (319 - e), 0.53 - ((y - 276) * 0.54) / 307]; };
// The cyan blade from the underarm and its thin spike, the royal panel, the lower cyan spike (picture pixels).
const BLADE = [[190, 276], [197, 292], [204, 310], [209, 328], [213, 345], [217, 370], [220, 395], [223, 420], [225, 445], [225, 466],
  [222, 445], [218, 420], [213, 395], [209, 372], [205, 350], [192, 374], [190, 350]];
const PANEL = [[192, 374], [205, 350], [207, 380], [207, 410], [206, 440], [207, 470], [210, 520], [213, 575], [214, 600], [184, 600], [184, 583],
  [185, 540], [187, 480], [189, 420], [190, 390]];
const SPIKE = [[217, 446], [215, 470], [215, 500], [216, 540], [219, 575], [220, 600], [213, 600], [210, 560], [208, 520], [207, 480], [209, 460]];
const LOW = flat([190, 374])[1];
const SHARD_SHAPES = [
  ['c', BLADE.map(flat)], ['r', PANEL.map(flat)], ['c', SPIKE.map(flat)],
  // Round the side: the blade's cyan above the panel's top, the panel's royal below it.
  ['c', [[0.256, 0.54], [0.32, 0.54], [0.32, LOW], [0.256, LOW]]],
  ['r', [[0.256, LOW], [0.32, LOW], [0.32, -0.07], [0.256, -0.07]]],
];

/** Draws the side shards in the patterns' frame (garment metres, both sides): pattern ink and trim colour. */
export function drawShards(g, ink, trim) {
  for (const [c, pts] of SHARD_SHAPES) {
    g.fillStyle = c === 'c' ? trim : ink;
    for (const s of [-1, 1]) {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(s * x, y) : g.moveTo(s * x, y)));
      g.closePath();
      g.fill();
    }
  }
}
