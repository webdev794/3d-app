import type { ArtworkLayer, Design } from './components/KitViewer';

/**
 * Artwork to 3D for headwear and accessories (CP1, client 2026-11-02: the MANTIS cap sheet). The artwork is read by the
 * AI (POST /ai/accessory/read: the model, its parts' colours and where its front, back and side logos are); each logo
 * is cut out of the picture with its background taken away and put on its place on our 3D model as an image object,
 * so it can be moved, resized and recoloured in the Studio like any other artwork.
 */

/** The accessories the artwork goes on (our 3D models; the server's OpenAiDesigner::ACCESSORIES). */
export const accessoryGarments = ['cap', 'five-panel-cap', 'bucket-hat', 'beanie', 'socks', 'skirt'];
export const isAccessory = (garment: string | null | undefined) => !!garment && accessoryGarments.includes(garment);

type Box = { x: number; y: number; w: number; h: number };
type SideBox = Box & { level?: 'low' | 'middle' | 'high' };
/** The server's reading (OpenAiDesigner::accessoryFromReading). */
export type AccessoryReading = {
  garment: string; seen: string; exact: boolean; name: string;
  marks: { front: Box | null; back: Box | null; left: SideBox | null; right: SideBox | null };
  views: { front: Box | null; back: Box | null };
  design: Partial<Design>;
};

/** A logo cut from the picture: transparent behind it, trimmed to it; its width and height in fractions of the picture. */
export type CutLogo = { src: string; aspect: number; w: number; h: number };

const near = (a: Uint8ClampedArray, i: number, c: number[], tol: number) => Math.abs(a[i] - c[0]) + Math.abs(a[i + 1] - c[1]) + Math.abs(a[i + 2] - c[2]) <= tol;

/**
 * Cuts the logo in `box` (fractions of the picture) out of the picture: the background colour (the commonest round the
 * box's edge) is taken away from the edge inwards, so letters' own holes in that colour stay as they are; then trimmed.
 */
export async function cutLogo(src: string, box: Box): Promise<CutLogo | null> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight, pad = 0.1;
  const x0 = Math.max(0, Math.floor((box.x - box.w * pad) * W)), y0 = Math.max(0, Math.floor((box.y - box.h * pad) * H));
  const x1 = Math.min(W, Math.ceil((box.x + box.w * (1 + pad)) * W)), y1 = Math.min(H, Math.ceil((box.y + box.h * (1 + pad)) * H));
  if (x1 - x0 < 6 || y1 - y0 < 6) return null;
  // Drawn larger when small (a small label in a big sheet), at most 640 px on its longer side.
  const k = Math.min(4, 640 / Math.max(x1 - x0, y1 - y0));
  const w = Math.max(1, Math.round((x1 - x0) * k)), h = Math.max(1, Math.round((y1 - y0) * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h), px = data.data;
  // The background: the commonest colour round the edge.
  const counts = new Map<number, { n: number; c: number[] }>();
  const edge = (x: number, y: number) => { const i = (y * w + x) * 4; if (px[i + 3] < 40) return; const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4); const e = counts.get(key) ?? { n: 0, c: [px[i], px[i + 1], px[i + 2]] }; e.n++; counts.set(key, e); };
  for (let x = 0; x < w; x++) { edge(x, 0); edge(x, h - 1); }
  for (let y = 0; y < h; y++) { edge(0, y); edge(w - 1, y); }
  const bg = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.c;
  if (bg) {
    // Flood from the edge over the background colour (and its anti-aliased fringe, faded out).
    const seen = new Uint8Array(w * h), stack: number[] = [];
    const push = (x: number, y: number) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const p = y * w + x; if (seen[p]) return; seen[p] = 1; if (near(px, p * 4, bg, 90)) stack.push(p); };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const p = stack.pop()!, i = p * 4;
      const d = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
      px[i + 3] = d <= 45 ? 0 : Math.round(px[i + 3] * Math.min(1, (d - 45) / 45));
      const x = p % w, y = (p - x) / w;
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
  }
  // Trimmed to what is left.
  let tx0 = w, ty0 = h, tx1 = -1, ty1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 40) { if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; if (y < ty0) ty0 = y; if (y > ty1) ty1 = y; }
  g.putImageData(data, 0, 0);
  // Nothing left (a logo in the background's own colour): the box as it is.
  if (tx1 - tx0 < 3 || ty1 - ty0 < 3) { tx0 = 0; ty0 = 0; tx1 = w - 1; ty1 = h - 1; g.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, w, h); }
  const out = document.createElement('canvas');
  out.width = tx1 - tx0 + 1; out.height = ty1 - ty0 + 1;
  out.getContext('2d')!.drawImage(canvas, tx0, ty0, out.width, out.height, 0, 0, out.width, out.height);
  return { src: out.toDataURL('image/png'), aspect: out.width / out.height, w: out.width / k / W, h: out.height / k / H };
}

/** Where each logo goes on a model (its print, garment metres: viewer capprint.js / hatprint.js) and its size limits. */
type Place = { side: 'front' | 'back'; x: number; y: number; w: number; min: number; max: number; maxH: number; across: number };
const CAP_BAND = 0.09;
const places: Record<string, Partial<Record<'front' | 'back' | 'left' | 'right', Place>> & { level?: Record<string, number> }> = {
  // The cap (cap.js: the band at y 0.09, the crown 0.2 high; the front panel ±0.102, the side panels to ±0.153 on the
  // front half, +x the wearer's left; across: about how wide the whole cap looks in a front or back view).
  cap: {
    front: { side: 'front', x: 0, y: CAP_BAND + 0.068, w: 0.1, min: 0.05, max: 0.15, maxH: 0.085, across: 0.2 },
    back: { side: 'back', x: 0, y: CAP_BAND + 0.085, w: 0.06, min: 0.03, max: 0.1, maxH: 0.05, across: 0.2 },
    left: { side: 'front', x: 0.128, y: CAP_BAND + 0.05, w: 0.036, min: 0.02, max: 0.044, maxH: 0.04, across: 0 },
    right: { side: 'front', x: -0.128, y: CAP_BAND + 0.05, w: 0.036, min: 0.02, max: 0.044, maxH: 0.04, across: 0 },
    level: { low: CAP_BAND + 0.024, middle: CAP_BAND + 0.055, high: CAP_BAND + 0.095 },
  },
  // The bucket hat (bucket.js: the crown's side from y 0.054 to 0.145, ±0.153 on each half).
  'bucket-hat': {
    front: { side: 'front', x: 0, y: 0.1, w: 0.1, min: 0.04, max: 0.14, maxH: 0.07, across: 0.24 },
    back: { side: 'back', x: 0, y: 0.12, w: 0.07, min: 0.03, max: 0.12, maxH: 0.045, across: 0.24 },
    left: { side: 'front', x: 0.115, y: 0.1, w: 0.04, min: 0.02, max: 0.05, maxH: 0.05, across: 0 },
    right: { side: 'front', x: -0.115, y: 0.1, w: 0.04, min: 0.02, max: 0.05, maxH: 0.05, across: 0 },
    level: { low: 0.07, middle: 0.1, high: 0.125 },
  },
};

places['five-panel-cap'] = places.cap;
// The beanie (beanie.js: the cuff from y 0 to about .068, the crown above it): the front logo on the cuff's front.
places.beanie = {
  front: { side: 'front', x: 0, y: 0.033, w: 0.08, min: 0.03, max: 0.11, maxH: 0.034, across: 0.22 },
  back: { side: 'back', x: 0, y: 0.033, w: 0.06, min: 0.03, max: 0.1, maxH: 0.034, across: 0.22 },
};
/**
 * The small 3DEEZI marks (the "3" over the word) when the customer's logo takes the front (BR1, 2026-11-02: never the
 * word over the customer's art): on the back, low, under the back logo (viewer design.marks top_crest / top_wordmark).
 */
const backMarks: Record<string, Design['marks']> = {
  cap: { top_crest: { side: 'back', x: 0, y: CAP_BAND + 0.03, scale: 0.6 }, top_wordmark: { side: 'back', x: 0, y: CAP_BAND + 0.011, scale: 0.6 } },
  'bucket-hat': { top_crest: { side: 'back', x: 0, y: 0.085, scale: 0.55 }, top_wordmark: { side: 'back', x: 0, y: 0.067, scale: 0.55 } },
  beanie: { top_crest: { side: 'back', x: 0, y: 0.035 }, top_wordmark: { side: 'back', x: 0, y: 0.0135 } },
};
backMarks['five-panel-cap'] = backMarks.cap;

/** A logo's width on the model: its share of the view's width, else the place's own; never taller than the place allows. */
function widthOn(place: Place, logo: CutLogo, view: Box | null) {
  let w = view && place.across ? (logo.w / view.w) * place.across : place.w;
  w = Math.min(place.max, Math.max(place.min, w));
  return Math.min(w, place.maxH * logo.aspect);
}

const LABELS: Record<string, string> = { front: 'Front logo', back: 'Back logo', left: 'Left side label', right: 'Right side label' };

/**
 * The 3D design from the reading: the artwork's colours, and each logo cut from the picture on its place (cap and bucket
 * hat: front, back and both sides as image objects; socks and skirt: the front logo as their crest).
 */
export async function accessoryDesign(base: Design, reading: AccessoryReading, picture: string): Promise<{ design: Design; placed: string[] }> {
  const garment = reading.garment as Design['garment'];
  const design: Design = { ...base, ...reading.design, garment, layout: null, patternImage: null, layers: [], logoImage: null };
  const placed: string[] = [];
  const spots = places[garment];
  const cut = async (box: Box | null) => (box ? await cutLogo(picture, box).catch(() => null) : null);
  if (!spots) {
    // Socks and skirt: the front logo is their crest.
    const logo = await cut(reading.marks.front);
    if (logo) { design.logoImage = logo.src; placed.push('front'); }
    return { design, placed };
  }
  const layers: ArtworkLayer[] = [];
  for (const key of ['front', 'back', 'left', 'right'] as const) {
    const place = spots[key], box = reading.marks[key];
    if (!place || !box) continue;
    const logo = await cut(box);
    if (!logo) continue;
    const view = key === 'front' ? reading.views.front : key === 'back' ? reading.views.back : null;
    const level = (box as SideBox).level;
    const y = (key === 'left' || key === 'right') && level && spots.level?.[level] ? spots.level[level] : place.y;
    layers.push({ id: `art-${key}-${Math.random().toString(36).slice(2, 8)}`, name: LABELS[key], type: 'image', part: 'top', side: place.side, x: place.x, y, w: Number(widthOn(place, logo, view).toFixed(4)), src: logo.src });
    placed.push(key);
  }
  design.layers = layers;
  // The front logo cut from the artwork is the customer's: the small 3DEEZI marks go on the back, under its logo.
  if (placed.includes('front') && backMarks[garment]) {
    design.logoText = '3DEEZI';
    design.marks = { ...(design.marks ?? {}), ...backMarks[garment] };
  }
  return { design, placed };
}

/** One logo or design on the front of an accessory ("Logo or design on the front"). */
export const accessoryBackMarks = (garment: string) => backMarks[garment] ?? null;
export function accessoryFrontLayer(garment: string, src: string, name: string, aspect = 1): ArtworkLayer | null {
  const place = places[garment]?.front;
  if (!place) return null;
  const w = Math.min(place.w, place.maxH * aspect);
  return { id: crypto.randomUUID(), type: 'image', name, src, part: 'top', side: 'front', x: place.x, y: place.y, w: Number(w.toFixed(4)) };
}
