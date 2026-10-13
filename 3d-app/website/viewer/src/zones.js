// Garment areas a pattern can be dropped onto, in garment metres (y up,
// hem at 0, x = 0 down the middle). Rectangles are mirrored left/right and
// clipped to the garment outline when painted.

const TOP = {
  sleeves: [[0.27, 0.44, 0.47, 0.76]],
  yoke: [[-0.3, 0.56, 0.3, 0.8]],
  sides: [[0.2, 0, 0.3, 0.55]],
  hem: [[-0.3, 0, 0.3, 0.14]],
  body: [[-0.2, 0.14, 0.2, 0.56]],
};
const SHORTS = {
  sides: [[0.2, 0, 0.32, 0.44]],
  hem: [[-0.32, 0, 0.32, 0.1]],
  body: [[-0.2, 0.1, 0.2, 0.44]],
};

export const ZONE_NAMES = { body: 'Chest & body', yoke: 'Shoulders', sleeves: 'Sleeves', sides: 'Side panels', hem: 'Hem' };

const table = (kind) => (kind === 'shorts' ? SHORTS : TOP);

/** Rectangles [x0, y0, x1, y1] for a zone, mirrored to both sides of the body. */
export function zoneRects(kind, zone) {
  const rects = table(kind)[zone] ?? [];
  return rects.flatMap(([x0, y0, x1, y1]) => (x0 >= 0 ? [[x0, y0, x1, y1], [-x1, y0, -x0, y1]] : [[x0, y0, x1, y1]]));
}

/** Which zone a garment point falls in (first match wins). */
export function zoneAt(kind, x, y) {
  const order = kind === 'shorts' ? ['sides', 'hem', 'body'] : ['sleeves', 'yoke', 'sides', 'hem', 'body'];
  for (const zone of order) {
    if (zoneRects(kind, zone).some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) return zone;
  }
  return 'body';
}
