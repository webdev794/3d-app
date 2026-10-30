// Painterly Brush (CorelDRAW): realistic brush strokes painted as a picture (bitmap) in one colour: Oil, Watercolour,
// Charcoal, Airbrush and Marker. Paints the stroke on a canvas; the page places the canvas as an image.

export const PAINT_NAMES = { oil: 'Oil', watercolour: 'Watercolour', charcoal: 'Charcoal', airbrush: 'Airbrush', marker: 'Marker' };

function rng(seed) {
  let q = Math.max(1, Math.floor(Math.abs(seed)) % 2147483646);
  return () => (q = (q * 16807) % 2147483647) / 2147483647;
}
function rgbOf(hex) {
  const n = parseInt(String(hex || '#000000').replace('#', '').slice(0, 6).padEnd(6, '0'), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** k > 0 lightens towards white, k < 0 darkens towards black. */
const shade = ([r, g, b], k) => (k >= 0 ? [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k] : [r * (1 + k), g * (1 + k), b * (1 + k)]).map(Math.round);
const css = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;

/** Evenly spaced points along the stroke, with the unit normal at each. */
function frames(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y);
    let t = step - carry;
    for (; t <= l; t += step) out.push({ x: a.x + ((b.x - a.x) * t) / l, y: a.y + ((b.y - a.y) * t) / l });
    carry = l - (t - step);
  }
  if (out.length < 2) out.push(pts.at(-1));
  return out.map((p, i) => {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return { x: p.x, y: p.y, nx: -dy / l, ny: dx / l };
  });
}

/**
 * Paints a stroke. pts: page points; size: brush width (page units); flow 0-1; colour '#rrggbb'.
 * Returns { canvas, left, top, scale } (page units per pixel), or null for an empty stroke.
 */
export function paintStroke(pts, { brush = 'oil', size = 16, flow = 0.8, colour = '#12E1F0', seed = 1, pxPerUnit = 1.6 } = {}) {
  const P0 = pts.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  if (!P0.length) return null;
  if (P0.length === 1) P0.push({ x: P0[0].x + 0.4, y: P0[0].y });
  const rand = rng(seed), rgb = rgbOf(colour), W = Math.max(1, size), pad = W * 1.6;
  const xs = P0.map((p) => p.x), ys = P0.map((p) => p.y);
  const left = Math.min(...xs) - pad, top = Math.min(...ys) - pad, w = Math.max(...xs) + pad - left, h = Math.max(...ys) + pad - top;
  // Enough pixels for print-quality edges, within what phones can handle.
  let k = pxPerUnit;
  k = Math.min(k, 3000 / w, 3000 / h, Math.sqrt(7e6 / (w * h)));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * k)); cv.height = Math.max(1, Math.ceil(h * k));
  const g = cv.getContext('2d');
  g.setTransform(k, 0, 0, k, -left * k, -top * k);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const F = frames(P0, Math.max(0.3, W * 0.06));
  const line = (q, width, col, alpha) => {
    g.globalAlpha = alpha; g.strokeStyle = col; g.lineWidth = width;
    g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
    g.globalAlpha = 1;
  };
  const offset = (off, jitter = 0) => F.map((p) => { const o = off + (rand() - 0.5) * jitter; return { x: p.x + p.nx * o, y: p.y + p.ny * o }; });

  if (brush === 'marker') {
    line(F, W, css(rgb), 0.5 + 0.4 * flow);
  } else if (brush === 'airbrush') {
    for (let i = 0; i < F.length; i += 2) {
      const p = F[i], gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, W / 2);
      gr.addColorStop(0, css(rgb, 0.05 + 0.13 * flow)); gr.addColorStop(1, css(rgb, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, W / 2, 0, Math.PI * 2); g.fill();
    }
  } else if (brush === 'watercolour') {
    // Layers of thin, wobbly washes with soft edges, then a few darker granules.
    g.filter = `blur(${Math.max(0.6, W * k * 0.04)}px)`;
    for (let layer = 0; layer < 4; layer++) {
      let wob = 0;
      const q = F.map((p) => { wob = wob * 0.85 + (rand() - 0.5) * W * 0.05; return { x: p.x + p.nx * wob, y: p.y + p.ny * wob }; });
      line(q, W * (0.85 + 0.2 * rand()), css(rgb), 0.07 + 0.13 * flow);
    }
    g.filter = 'none';
    line(F, W * 0.55, css(shade(rgb, -0.12)), 0.05 + 0.05 * flow);
    g.fillStyle = css(shade(rgb, -0.25), 0.12);
    for (let i = 0; i < F.length; i++) {
      if (rand() > 0.5) continue;
      const p = F[i], o = (rand() - 0.5) * W * 0.8;
      g.fillRect(p.x + p.nx * o, p.y + p.ny * o, W * 0.03, W * 0.03);
    }
  } else if (brush === 'charcoal') {
    line(F, W, css(rgb), 0.6 + 0.35 * flow);
    // Paper grain: tiny speckles and streaks rubbed out of the stroke.
    g.globalCompositeOperation = 'destination-out';
    const grain = Math.max(0.6, W * 0.05), count = Math.min(60000, Math.round((F.length * W) / (grain * 1.4)));
    g.fillStyle = 'rgba(0,0,0,0.65)';
    for (let i = 0; i < count; i++) {
      const p = F[Math.floor(rand() * F.length)], o = (rand() - 0.5) * W * 1.05;
      g.fillRect(p.x + p.nx * o, p.y + p.ny * o, grain * (0.5 + rand()), grain * (0.5 + rand()));
    }
    for (let s = 0; s < 4; s++) line(offset((rand() - 0.5) * W * 0.8, W * 0.04), W * 0.03, 'rgba(0,0,0,1)', 0.35);
    g.globalCompositeOperation = 'source-over';
  } else {
    // Oil: a full, slightly streaky base and bristle lines in lighter and darker tones of the colour.
    line(F, W * 0.94, css(rgb), 0.78 + 0.2 * flow);
    const B = 16;
    for (let b = 0; b < B; b++) {
      const off = (b / (B - 1) - 0.5) * W * 0.86, tone = (rand() - 0.5) * 0.42;
      line(offset(off, W * 0.015), W * (0.04 + 0.06 * rand()), css(shade(rgb, tone)), 0.45 + 0.25 * rand());
    }
    line(offset(-W * 0.22, W * 0.01), W * 0.05, css(shade(rgb, 0.45)), 0.35);
  }
  return { canvas: cv, left, top, scale: 1 / k };
}
