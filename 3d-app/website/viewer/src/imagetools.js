// Logo and artwork clean-up, shared by the website and the apps (the apps
// call it through the viewer bridge): background removal, one-colour
// recolouring, trimming and downsizing. Returns a PNG data URL.

const load = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('This image took too long to load.')), 15000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Unable to read this image.')); };
    img.src = src;
  });

const rgb = (hex) => {
  const v = parseInt(String(hex).replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/**
 * @param {string} src  data URL or URL
 * @param {{removeBg?: boolean, tolerance?: number, tint?: string|null, maxSize?: number}} options
 */
export async function processImage(src, { removeBg = false, tolerance = 42, tint = null, maxSize = 1024 } = {}) {
  if (typeof src !== 'string' || !src.length || src.length > 16000000) throw new Error('Choose a valid image smaller than 12 MB.');
  maxSize = Math.max(32, Math.min(2048, Number(maxSize) || 1024));
  tolerance = Math.max(1, Math.min(200, Number(tolerance) || 42));
  if (tint && !/^#[0-9a-f]{6}$/i.test(tint)) throw new Error('Choose a valid six-digit colour.');
  const img = await load(src);
  const k = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  const px = data.data;

  if (removeBg) {
    // Background colour = the most common colour along the border.
    const counts = new Map();
    const border = [];
    for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
    for (const i of border) {
      if (px[i * 4 + 3] < 20) continue;
      const key = ((px[i * 4] >> 4) << 8) | ((px[i * 4 + 1] >> 4) << 4) | (px[i * 4 + 2] >> 4);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let best = -1, bestKey = 0;
    for (const [key, n] of counts) if (n > best) { best = n; bestKey = key; }
    if (best > 0) {
      const bg = [((bestKey >> 8) & 15) * 16 + 8, ((bestKey >> 4) & 15) * 16 + 8, (bestKey & 15) * 16 + 8];
      const dist = (i) => Math.hypot(px[i * 4] - bg[0], px[i * 4 + 1] - bg[1], px[i * 4 + 2] - bg[2]);
      // Flood fill from the border so same-coloured shapes inside the logo stay.
      const seen = new Uint8Array(w * h);
      const stack = border.filter((i) => dist(i) < tolerance * 1.6);
      for (const i of stack) seen[i] = 1;
      while (stack.length) {
        const i = stack.pop();
        const d = dist(i);
        // Soft edge: fully clear inside the tolerance, fading just outside it.
        const keep = d < tolerance ? 0 : Math.min(1, (d - tolerance) / (tolerance * 0.6));
        px[i * 4 + 3] = Math.round(px[i * 4 + 3] * keep);
        if (d >= tolerance) continue;
        const x = i % w, y = (i / w) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j >= 0 && !seen[j] && dist(j) < tolerance * 1.6) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
  }

  if (tint) {
    const [r, gr, b] = rgb(tint);
    for (let i = 0; i < px.length; i += 4) {
      px[i] = r;
      px[i + 1] = gr;
      px[i + 2] = b;
    }
  }
  g.putImageData(data, 0, 0);

  // Trim fully transparent margins.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return c.toDataURL('image/png');
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c, -x0, -y0);
  return out.toDataURL('image/png');
}

/** Where artwork lands for each placement choice (garment metres). */
export const PLACEMENTS = {
  'left-chest': { label: 'Left chest', side: 'front', x: 0.105, y: 0.6, w: 0.075 },
  'right-chest': { label: 'Right chest', side: 'front', x: -0.105, y: 0.6, w: 0.075 },
  'centre-chest': { label: 'Centre chest', side: 'front', x: 0, y: 0.5, w: 0.17 },
  'full-front': { label: 'Full front', side: 'front', x: 0, y: 0.36, w: 0.32 },
  'left-sleeve': { label: 'Left sleeve', side: 'front', x: 0.375, y: 0.54, w: 0.055, rot: -24 },
  'right-sleeve': { label: 'Right sleeve', side: 'front', x: -0.375, y: 0.54, w: 0.055, rot: 24 },
  'back-top': { label: 'Back neck', side: 'back', x: 0, y: 0.66, w: 0.16 },
  'back-centre': { label: 'Back centre', side: 'back', x: 0, y: 0.4, w: 0.26 },
  'shorts-left': { label: 'Shorts left leg', side: 'front', part: 'shorts', x: 0.15, y: 0.2, w: 0.07 },
  'shorts-right': { label: 'Shorts right leg', side: 'front', part: 'shorts', x: -0.15, y: 0.2, w: 0.07 },
};
