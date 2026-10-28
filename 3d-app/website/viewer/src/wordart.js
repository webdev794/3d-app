/**
 * How a word looks (task 9.146, the Studio's TEXT and NUMBERS panels): design.marks.<part>_<name>.look =
 * {style, width, color, shape, spacing}. style: 'plain' | 'outline' | 'shadow' | 'extrude' (3D block) | 'contour'
 * (a second ring); width: the line's thickness (a share of the letter height, 0..0.3); color: the line's colour;
 * shape: 'straight' | 'archUp' | 'archDown' | 'wave' | 'bridge' | 'slant'; spacing: extra room between letters
 * (a share of the letter height, -0.1..0.6). The website (WordLook.tsx) and the app (word_look.dart) draw the
 * same tiles. No look = the word exactly as before.
 */
export const WORD_STYLES = ['plain', 'outline', 'shadow', 'extrude', 'contour'];
export const WORD_SHAPES = ['straight', 'archUp', 'archDown', 'wave', 'bridge', 'slant'];

export function wordLook(look) {
  if (!look || typeof look !== 'object') return null;
  const num = (v, d, a, b) => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
  return {
    style: WORD_STYLES.includes(look.style) ? look.style : 'plain',
    width: num(look.width, 0.08, 0, 0.3),
    color: /^#[0-9a-f]{6}$/i.test(look.color ?? '') ? look.color : null,
    shape: WORD_SHAPES.includes(look.shape) ? look.shape : 'straight',
    spacing: num(look.spacing, 0, -0.1, 0.6),
  };
}

/**
 * Draws `str` centred on (0, 0) (y down) in `size`-high letters, no wider than `maxWidth`, with `look`; `line` is
 * the default line colour, `gap` the colour behind a contour's ring (the kit). Returns {w, h}.
 */
export function drawWord(g, str, size, color, maxWidth, look, line, gap) {
  const L = wordLook(look);
  const chars = [...String(str)];
  g.save();
  g.font = `700 ${size}px Rajdhani, Inter, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const gapW = L.spacing * size, widths = chars.map((c) => g.measureText(c).width);
  const W = widths.reduce((a, b) => a + b, 0) + gapW * Math.max(0, chars.length - 1);
  const k = W > maxWidth ? maxWidth / W : 1;
  g.scale(k, 1);
  if (L.shape === 'slant') g.transform(1, 0, -0.32, 1, 0, 0);
  // Each letter's place along the shape: [x, y, angle, height scale].
  const R = Math.max(W, size) * 0.85, places = [];
  let u = -W / 2;
  for (let i = 0; i < chars.length; i++) {
    const c = u + widths[i] / 2;
    let x = c, y = 0, a = 0, sy = 1;
    if (L.shape === 'archUp' || L.shape === 'archDown') {
      const t = c / R, dir = L.shape === 'archUp' ? 1 : -1;
      x = R * Math.sin(t); y = dir * R * (1 - Math.cos(t)); a = dir * t;
      y -= (dir * R * (1 - Math.cos(W / 2 / R))) / 2;
    } else if (L.shape === 'wave') {
      const f = (Math.PI * 3) / Math.max(W, 1e-6);
      y = size * 0.16 * Math.sin(c * f); a = Math.atan(size * 0.16 * f * Math.cos(c * f));
    } else if (L.shape === 'bridge') sy = 1 + 0.5 * Math.cos((Math.PI * c) / Math.max(W, 1e-6));
    places.push([x, y, a, sy]);
    u += widths[i] + gapW;
  }
  const each = (paint) => chars.forEach((ch, i) => {
    const [x, y, a, sy] = places[i];
    g.save(); g.translate(x, y); g.rotate(a); if (sy !== 1) { g.translate(0, size * 0.5); g.scale(1, sy); g.translate(0, -size * 0.5); }
    paint(ch); g.restore();
  });
  const lineColor = L.color ?? line ?? '#000000';
  g.lineJoin = 'round';
  if (L.style === 'extrude') {
    const steps = 8, d = size * Math.max(0.02, L.width * 0.9) / steps;
    g.fillStyle = lineColor;
    for (let s = steps; s >= 1; s--) { g.save(); g.translate(s * d, s * d); each((ch) => g.fillText(ch, 0, 0)); g.restore(); }
  }
  if (L.style === 'contour') {
    const w = size * Math.max(0.03, L.width);
    g.strokeStyle = lineColor; g.lineWidth = w * 3.2; each((ch) => g.strokeText(ch, 0, 0));
    g.strokeStyle = gap ?? '#ffffff'; g.lineWidth = w * 1.9; each((ch) => g.strokeText(ch, 0, 0));
    g.strokeStyle = lineColor; g.lineWidth = w * 0.9; each((ch) => g.strokeText(ch, 0, 0));
  }
  if (L.style === 'outline' && L.width > 0) { g.strokeStyle = lineColor; g.lineWidth = size * L.width * 2; each((ch) => g.strokeText(ch, 0, 0)); }
  if (L.style === 'plain' && line) { g.strokeStyle = line; g.lineWidth = size * 0.07; each((ch) => g.strokeText(ch, 0, 0)); }
  if (L.style === 'shadow') {
    const m = g.getTransform(), px = Math.hypot(m.a, m.b) / k;
    g.shadowColor = L.color ? `${L.color}cc` : 'rgba(0,0,0,0.6)';
    g.shadowBlur = size * Math.max(0.04, L.width) * px;
    g.shadowOffsetX = g.shadowOffsetY = size * Math.max(0.04, L.width) * px;
  }
  g.fillStyle = color;
  each((ch) => g.fillText(ch, 0, 0));
  g.restore();
  const arch = L.shape === 'archUp' || L.shape === 'archDown' ? R * (1 - Math.cos(W / 2 / R)) : L.shape === 'wave' ? size * 0.32 : L.shape === 'bridge' ? size * 0.5 : 0;
  return { w: W * k + (L.style === 'contour' ? size * L.width * 3 : 0), h: size + arch };
}
