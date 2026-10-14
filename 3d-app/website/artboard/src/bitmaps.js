// Bitmap tools for imported images: adjustments (brightness, contrast,
// saturation, blur, grayscale), plain-background removal, and tracing an
// image into editable vector shapes (like CorelDRAW PowerTRACE).

import { filters } from 'fabric';
import ImageTracer from 'imagetracerjs';

const BLUR_MAX = 0.6;
const typeOf = (f) => f?.constructor?.type ?? f?.type;

/** Fabric filters for the adjustment sliders (-100..100; blur 0..100). */
export function adjustFilters({ brightness = 0, contrast = 0, saturation = 0, blur = 0, grayscale = false }) {
  const out = [];
  if (brightness) out.push(new filters.Brightness({ brightness: brightness / 100 }));
  if (contrast) out.push(new filters.Contrast({ contrast: contrast / 100 }));
  if (saturation) out.push(new filters.Saturation({ saturation: saturation / 100 }));
  if (blur) out.push(new filters.Blur({ blur: (blur / 100) * BLUR_MAX }));
  if (grayscale) out.push(new filters.Grayscale());
  return out;
}

/** The slider values behind an image's current filters. */
export function readAdjust(img) {
  const find = (t) => (img.filters || []).find((f) => typeOf(f) === t);
  return {
    brightness: Math.round((find('Brightness')?.brightness ?? 0) * 100),
    contrast: Math.round((find('Contrast')?.contrast ?? 0) * 100),
    saturation: Math.round((find('Saturation')?.saturation ?? 0) * 100),
    blur: Math.round(((find('Blur')?.blur ?? 0) / BLUR_MAX) * 100),
    grayscale: !!find('Grayscale'),
  };
}

/** The image's visible (cropped, unfiltered) pixels, at most `max` px on the long side. */
export function imagePixels(img, max) {
  const el = img.getOriginalElement?.() ?? img.getElement();
  const w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(el, img.cropX || 0, img.cropY || 0, w, h, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx, kx: canvas.width / w, ky: canvas.height / h };
}

/** The most common opaque colour along the border, or null. */
export function borderColour(ctx, w, h) {
  const px = ctx.getImageData(0, 0, w, h).data, counts = new Map();
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  for (const i of border) {
    if (px[i * 4 + 3] < 20) continue;
    const key = ((px[i * 4] >> 4) << 8) | ((px[i * 4 + 1] >> 4) << 4) | (px[i * 4 + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0, bestKey = null;
  for (const [key, n] of counts) if (n > best) { best = n; bestKey = key; }
  return bestKey === null ? null : [((bestKey >> 8) & 15) * 16 + 8, ((bestKey >> 4) & 15) * 16 + 8, (bestKey & 15) * 16 + 8];
}

/**
 * Clears the plain background around a logo: flood-fills from the border so
 * same-coloured areas inside the artwork stay, with a soft edge. Same method
 * as the 3D Studio. Returns false when no background colour was found.
 */
export function removeBackground(ctx, w, h, tolerance = 42) {
  const bg = borderColour(ctx, w, h);
  if (!bg) return false;
  const data = ctx.getImageData(0, 0, w, h), px = data.data;
  const dist = (i) => Math.hypot(px[i * 4] - bg[0], px[i * 4 + 1] - bg[1], px[i * 4 + 2] - bg[2]);
  const seen = new Uint8Array(w * h), stack = [];
  const visit = (i) => { if (!seen[i] && dist(i) < tolerance * 1.6) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { visit(x); visit((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { visit(y * w); visit(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), d = dist(i);
    const keep = d < tolerance ? 0 : Math.min(1, (d - tolerance) / (tolerance * 0.6));
    px[i * 4 + 3] = Math.round(px[i * 4 + 3] * keep);
    if (d >= tolerance) continue;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (y > 0) visit(i - w);
    if (y < h - 1) visit(i + w);
  }
  ctx.putImageData(data, 0, 0);
  return true;
}

export const TRACE_DETAIL = {
  low: { max: 400, ltres: 2, qtres: 2, pathomit: 16 },
  medium: { max: 700, ltres: 1, qtres: 1, pathomit: 8 },
  high: { max: 1000, ltres: 0.5, qtres: 0.5, pathomit: 4 },
};

/** The `n` most common opaque colours, averaged within 4-bit buckets. */
function dominantColours(px, n) {
  const buckets = new Map();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += px[i]; b.g += px[i + 1]; b.b += px[i + 2];
    buckets.set(key, b);
  }
  return [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, n)
    .map((b) => ({ r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n), a: 255 }));
}

/**
 * Traces pixels into an SVG string of filled colour regions. The palette is the
 * image's own most common colours, so small areas (a logo's accent colour) keep
 * their colour instead of being merged into a neighbour.
 */
export function traceSvg(ctx, w, h, { colours = 4, detail = 'medium' } = {}) {
  const d = TRACE_DETAIL[detail] ?? TRACE_DETAIL.medium, img = ctx.getImageData(0, 0, w, h);
  const pal = dominantColours(img.data, Math.max(2, Math.min(16, colours)));
  if (!pal.length) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  return ImageTracer.imagedataToSVG(img, {
    pal, numberofcolors: pal.length, colorquantcycles: 1,
    ltres: d.ltres, qtres: d.qtres, pathomit: d.pathomit, strokewidth: 0, linefilter: true,
    roundcoords: 1, viewbox: true, desc: false, blurradius: 0,
  });
}

/** True when a CSS colour (rgb(...) or #hex) is within `tolerance` of an [r, g, b] colour. */
export function nearColour(css, rgb, tolerance = 40) {
  if (!rgb || typeof css !== 'string') return false;
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  const c = m ? [+m[1], +m[2], +m[3]] : /^#[0-9a-f]{6}$/i.test(css) ? [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16)) : null;
  return !!c && Math.hypot(c[0] - rgb[0], c[1] - rgb[1], c[2] - rgb[2]) < tolerance;
}
