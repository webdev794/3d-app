// Paints the kit's print atlas: front panel on the left half, back panel
// (mirrored so it reads correctly from behind) on the right half. Everything
// is drawn in garment coordinates (metres), so placement is exact.

import { zoneRects } from './zones.js';

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('Artwork took too long to load.')), 15000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Unable to read artwork.')); };
    img.src = src;
  });

/** Black-on-white AI artwork â†’ a stencil tinted in `color`. */
async function stencil(src, color) {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const [r, gr, b] = hexRgb(color);
  for (let i = 0; i < data.data.length; i += 4) {
    const lum = (data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114) / 255;
    data.data[i] = r;
    data.data[i + 1] = gr;
    data.data[i + 2] = b;
    data.data[i + 3] = Math.round(Math.min(1, Math.max(0, (0.85 - lum) / 0.6)) * 255);
  }
  g.putImageData(data, 0, 0);
  return c;
}

const hexRgb = (hex) => {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

const mix = (a, b, t) => {
  const [r1, g1, b1] = hexRgb(a), [r2, g2, b2] = hexRgb(b);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
};

export class KitPainter {
  constructor(frame, outline, size = 2048, kind = 'jersey') {
    this.kind = kind;
    this.frame = frame;
    this.outline = outline;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size / 2;
    this.ctx = this.canvas.getContext('2d');
    this._stencilKey = null;
    this._stencil = null;
  }

  /** Sets the transform so drawing happens in garment metres on one side. */
  side(back) {
    const { minX, maxX, minY, span } = this.frame;
    const s = this.canvas.height / span;
    const g = this.ctx;
    if (back) g.setTransform(-s, 0, 0, -s, this.canvas.height + maxX * s, this.canvas.height + minY * s);
    else g.setTransform(s, 0, 0, -s, -minX * s, this.canvas.height + minY * s);
    return s;
  }

  /** Upright text at garment point (x, y), `size` in metres. */
  text(back, str, x, y, size, color, { maxWidth = 0.3, outline } = {}) {
    const g = this.ctx;
    this.side(back);
    g.save();
    g.translate(x, y);
    g.scale(back ? -1 : 1, -1);
    g.font = `700 ${size}px Rajdhani, Inter, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = g.measureText(str).width;
    if (w > maxWidth) g.scale(maxWidth / w, 1);
    if (outline) {
      g.lineWidth = size * 0.07;
      g.strokeStyle = outline;
      g.lineJoin = 'round';
      g.strokeText(str, 0, 0);
    }
    g.fillStyle = color;
    g.fillText(str, 0, 0);
    g.restore();
  }

  clipOutline(back) {
    const g = this.ctx;
    this.side(back);
    g.beginPath();
    this.outline.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.clip();
  }

  proceduralPattern(design, name = design.pattern, ink = mix(design.main, design.secondary, 0.35)) {
    const g = this.ctx;
    g.strokeStyle = ink;
    g.fillStyle = ink;
    if (name === 'Hoops') {
      for (let y = 0.02; y < 0.8; y += 0.07) g.fillRect(-0.5, y, 1, 0.032);
    } else if (name === 'Dots') {
      for (let y = 0.01; y < 0.8; y += 0.026) {
        for (let x = -0.5 + ((y * 100) % 2 ? 0.013 : 0); x < 0.5; x += 0.026) {
          g.beginPath();
          g.arc(x, y, 0.0055, 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (name === 'Diagonal') {
      g.lineWidth = 0.012;
      for (let x = -1.2; x < 0.6; x += 0.05) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 0.8, 0.8);
        g.stroke();
      }
    } else if (name === 'Tribal') {
      // Bands of interlocking triangles with a fine double line.
      for (let y = 0.03; y < 0.8; y += 0.11) {
        for (let x = -0.5; x < 0.5; x += 0.05) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 0.025, y + 0.045);
          g.lineTo(x + 0.05, y);
          g.closePath();
          g.fill();
        }
        g.fillRect(-0.5, y + 0.055, 1, 0.005);
        g.fillRect(-0.5, y + 0.066, 1, 0.0025);
      }
    } else if (name === 'Camo') {
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 160; i++) {
        const x = -0.5 + rnd(), y = rnd() * 0.8, r = 0.015 + rnd() * 0.035;
        g.beginPath();
        g.ellipse(x, y, r * 1.6, r, rnd() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    } else if (name === 'Stripes') {
      g.lineWidth = 0.004;
      for (let x = -0.5; x <= 0.5; x += 0.028) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 0.8);
        g.stroke();
      }
    } else if (name === 'Chevron') {
      g.lineWidth = 0.006;
      for (let y = 0.05; y < 0.62; y += 0.045) {
        g.beginPath();
        g.moveTo(-0.5, y + 0.12);
        g.lineTo(0, y);
        g.lineTo(0.5, y + 0.12);
        g.stroke();
      }
    } else if (name === 'Velocity') {
      g.globalAlpha = 0.85;
      for (let i = 0; i < 9; i++) {
        const y = 0.04 + i * 0.05;
        for (const dir of [-1, 1]) {
          g.beginPath();
          g.moveTo(dir * 0.26, y);
          g.lineTo(dir * (0.1 + i * 0.006), y + 0.09);
          g.lineTo(dir * (0.1 + i * 0.006), y + 0.105);
          g.lineTo(dir * 0.26, y + 0.03);
          g.closePath();
          g.fill();
        }
      }
      g.globalAlpha = 1;
    }
  }

  async paint(design) {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = design.main;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (design.patternImage) {
      const key = design.patternImage.length + design.patternColor + design.patternImage.slice(-64);
      if (key !== this._stencilKey) {
        this._stencil = await stencil(design.patternImage, design.patternColor ?? design.secondary).catch(() => null);
        this._stencilKey = key;
      }
    } else {
      this._stencil = null;
    }

    for (const back of [false, true]) {
      g.save();
      this.clipOutline(back);
      if (design.gradient) this.gradientFill(design.gradient);
      this.proceduralPattern(design);

      const shorts = this.kind === 'shorts';
      const sleeves = ['jersey', 'tee', 'polo'].includes(this.kind);
      g.fillStyle = design.secondary;
      for (const dir of [-1, 1]) {
        g.beginPath();
        if (shorts) {
          // Outer-leg stripe.
          g.moveTo(dir * 0.19, 0.43);
          g.lineTo(dir * 0.232, 0);
          g.lineTo(dir * 0.3, 0);
          g.lineTo(dir * 0.3, 0.43);
        } else {
          // Side panels.
          g.moveTo(dir * 0.262, 0.54);
          g.quadraticCurveTo(dir * 0.215, 0.3, dir * 0.23, 0);
          g.lineTo(dir * 0.3, 0);
          g.lineTo(dir * 0.3, 0.54);
        }
        g.closePath();
        g.fill();
        if (sleeves) {
          g.beginPath();
          g.moveTo(dir * 0.43, 0.6);
          g.lineTo(dir * 0.395, 0.6);
          g.lineTo(dir * 0.35, 0.47);
          g.lineTo(dir * 0.385, 0.45);
          g.closePath();
          g.fill();
        }
      }
      // Hem band (leg hems on shorts) and the waistband.
      g.fillRect(-0.3, 0, 0.6, 0.012);
      if (shorts) g.fillRect(-0.3, 0.395, 0.6, 0.03);

      // AI pattern across the shoulders and sleeves (the yoke), fading out.
      if (this._stencil) {
        const tile = design.patternScale ?? 0.3;
        const layer = document.createElement('canvas');
        const s = this.side(back);
        layer.width = this.canvas.height;
        layer.height = this.canvas.height;
        const lg = layer.getContext('2d');
        const pattern = lg.createPattern(this._stencil, 'repeat');
        const k = (tile * s) / this._stencil.width;
        pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
        lg.fillStyle = pattern;
        lg.fillRect(0, 0, layer.width, layer.height);
        // Fade the pattern below the chest: draw a gradient mask in canvas px.
        lg.globalCompositeOperation = 'destination-in';
        const { minY, span } = this.frame;
        const py = (y) => layer.height - ((y - minY) / span) * layer.height;
        // Tops: pattern across the yoke; shorts: across the legs.
        const mask = this.kind === 'shorts'
          ? lg.createLinearGradient(0, py(0.26), 0, py(0.03))
          : lg.createLinearGradient(0, py(0.4), 0, py(0.6));
        mask.addColorStop(0, `rgba(0,0,0,${design.patternBody ?? 0.12})`);
        mask.addColorStop(1, 'rgba(0,0,0,1)');
        lg.fillStyle = mask;
        lg.fillRect(0, 0, layer.width, layer.height);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(layer, back ? this.canvas.height : 0, 0);
      }

      this.paintZones(design, back);

      // Collar trim: V-neck for jerseys and singlets, crew for tee and polo.
      this.side(back);
      g.strokeStyle = design.secondary;
      g.lineWidth = 0.018;
      if (this.kind === 'tee' || this.kind === 'polo') {
        g.beginPath();
        g.moveTo(-0.092, 0.745);
        g.quadraticCurveTo(0, back ? 0.73 : 0.66, 0.092, 0.745);
        g.stroke();
      } else if (!shorts) {
        g.beginPath();
        g.moveTo(-0.095, 0.745);
        g.lineTo(0, back ? 0.69 : 0.668);
        g.lineTo(0.095, 0.745);
        g.stroke();
      }
      // Polo button placket.
      if (this.kind === 'polo' && !back) {
        g.fillStyle = design.secondary;
        g.fillRect(-0.02, 0.57, 0.04, 0.15);
        g.fillStyle = design.accent;
        for (const y of [0.6, 0.64, 0.68]) {
          g.beginPath();
          g.arc(0, y, 0.006, 0, Math.PI * 2);
          g.fill();
        }
      }
      // Tailoring details are painted in the same panel coordinates as the kit.
      // Fine double stitching and inset seams give the fabric a manufactured finish.
      this.side(back);
      g.strokeStyle = mix(design.main, design.accent, .24);
      g.lineWidth = .0009;
      g.setLineDash([.002, .0017]);
      for (const inset of [0, .0032]) {
        g.beginPath();
        g.moveTo(-.255, .019 + inset);
        g.quadraticCurveTo(0, .006 + inset, .255, .019 + inset);
        g.stroke();
        if (!shorts) {
          for (const dir of [-1, 1]) {
            g.beginPath();
            g.moveTo(dir * (.105 + inset), .718);
            g.quadraticCurveTo(dir * .235, .691 - inset, dir * .395, .548 - inset);
            g.stroke();
            g.beginPath();
            g.moveTo(dir * (.235 - inset), .035);
            g.quadraticCurveTo(dir * (.21 - inset), .29, dir * (.234 - inset), .496);
            g.stroke();
          }
        }
      }
      g.setLineDash([]);
      g.restore();
    }

    // Front: wordmark and crest. Back: name and number.
    const logo = (design.logoText || '').toUpperCase();
    const textOutline = mix(design.main, '#000000', 0.5);
    if (this.kind === 'shorts') {
      await this.paintShortsMarks(design, logo, textOutline);
      await this.paintLayers(design);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return this.canvas;
    }
    const ownArt = (design.layers ?? []).some((l) => l.side !== 'back' && (l.part ?? 'top') === 'top' && l.type !== 'text');
    this.text(false, logo, 0, 0.47, 0.085, design.accent, { maxWidth: 0.3, outline: textOutline });
    // Sponsor logo: front, centred below the wordmark, fitted into 17 x 6.5 cm.
    if (design.sponsorImage) {
      if (design.sponsorImage !== this._sponsorKey) {
        this._sponsor = await loadImage(design.sponsorImage).catch(() => null);
        this._sponsorKey = design.sponsorImage;
      }
      if (this._sponsor) {
        const k = Math.min(0.17 / this._sponsor.width, 0.065 / this._sponsor.height);
        const w = this._sponsor.width * k, h = this._sponsor.height * k;
        this.side(false);
        g.save();
        g.translate(0, 0.335);
        g.scale(1, -1);
        g.drawImage(this._sponsor, -w / 2, -h / 2, w, h);
        g.restore();
      }
    }
    if (design.logoImage) {
      // Uploaded club logo on the chest, fitted into a 7 cm box.
      if (design.logoImage !== this._logoKey) {
        this._logo = await loadImage(design.logoImage).catch(() => null);
        this._logoKey = design.logoImage;
      }
    } else {
      this._logo = null;
    }
    this.side(false);
    g.save();
    g.translate(0.105, 0.6);
    if (ownArt && !this._logo) {
      // No default crest: the user's own artwork is on the kit.
    } else if (this._logo) {
      const box = 0.07, k = box / Math.max(this._logo.width, this._logo.height);
      g.scale(1, -1);
      g.drawImage(this._logo, (-this._logo.width * k) / 2, (-this._logo.height * k) / 2, this._logo.width * k, this._logo.height * k);
    } else {
      g.fillStyle = design.accent;
      g.beginPath();
      g.moveTo(0, 0.034);
      g.lineTo(0.028, 0.018);
      g.lineTo(0.022, -0.02);
      g.lineTo(0, -0.036);
      g.lineTo(-0.022, -0.02);
      g.lineTo(-0.028, 0.018);
      g.closePath();
      g.fill();
    }
    g.restore();
    if (!this._logo && !ownArt) this.text(false, '3D', 0.105, 0.6, 0.03, design.main, { maxWidth: 0.04 });
    const backName = (design.backName || logo).toUpperCase();
    this.text(true, backName, 0, 0.6, 0.06, design.accent, { maxWidth: 0.28, outline: textOutline });
    this.text(true, String(design.number ?? '23'), 0, 0.38, 0.24, design.accent, {
      maxWidth: 0.3,
      outline: textOutline,
    });
    await this.paintLayers(design);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return this.canvas;
  }

  /** Two-colour gradient across the body; angle 0 runs top to bottom. */
  gradientFill({ from, to, angle = 0 }) {
    const g = this.ctx;
    const a = (angle * Math.PI) / 180, cx = 0, cy = 0.38, r = 0.42;
    const dx = Math.sin(a) * r, dy = -Math.cos(a) * r;
    const grad = g.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    grad.addColorStop(0, from);
    grad.addColorStop(1, to);
    g.fillStyle = grad;
    g.fillRect(-0.6, -0.1, 1.2, 1);
  }

  /** Patterns or colour blocks dropped onto areas (sleeves, shoulders, ...). */
  paintZones(design, back) {
    const g = this.ctx;
    for (const [zone, name] of Object.entries(design.zones ?? {})) {
      if (!name || name === 'None') continue;
      g.save();
      this.side(back);
      g.beginPath();
      for (const [x0, y0, x1, y1] of zoneRects(this.kind, zone)) g.rect(x0, y0, x1 - x0, y1 - y0);
      g.clip();
      if (name === 'Solid') {
        g.fillStyle = design.secondary;
        g.fillRect(-0.6, -0.1, 1.2, 1);
      } else {
        this.proceduralPattern(design, name, design.secondary);
      }
      g.restore();
    }
  }

  image(src) {
    this._images ??= new Map();
    if (this._images.size > 60) this._images.clear();
    if (!this._images.has(src)) this._images.set(src, loadImage(src).catch(() => null));
    return this._images.get(src);
  }

  /** The kit part a layer belongs to. */
  get partName() {
    return this.kind === 'shorts' ? 'shorts' : 'top';
  }

  /** User artwork and text, placed anywhere, sized and rotated (degrees, clockwise). */
  async paintLayers(design) {
    const g = this.ctx;
    for (const layer of design.layers ?? []) {
      if ((layer.part ?? 'top') !== this.partName) continue;
      const back = layer.side === 'back';
      const img = layer.type === 'image' ? await this.image(layer.src) : null;
      if (layer.type === 'image' && !img) continue;
      g.save();
      this.clipOutline(back);
      g.translate(layer.x, layer.y);
      g.scale(back ? -1 : 1, -1);
      g.rotate(((layer.rot ?? 0) * Math.PI) / 180);
      g.globalAlpha = layer.opacity ?? 1;
      if (layer.type === 'text') {
        const size = layer.size ?? 0.06;
        g.font = `700 ${size}px Rajdhani, Inter, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = layer.color ?? design.accent;
        g.fillText(String(layer.text ?? ''), 0, 0);
      } else if (layer.type === 'shape') {
        const w = layer.w ?? 0.1, h = layer.h ?? w;
        g.fillStyle = layer.color ?? design.accent;
        g.beginPath();
        if (layer.shape === 'ellipse') g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        else if (layer.shape === 'triangle') { g.moveTo(0, -h / 2); g.lineTo(w / 2, h / 2); g.lineTo(-w / 2, h / 2); g.closePath(); }
        else g.rect(-w / 2, -h / 2, w, h);
        g.fill();
      } else if (img) {
        const w = layer.w ?? 0.1, h = (w * img.height) / img.width;
        g.drawImage(img, -w / 2, -h / 2, w, h);
      }
      g.restore();
    }
  }

  /** Garment metres -> texture pixels. */
  toCanvas(back, x, y) {
    const { minX, maxX, minY, span } = this.frame;
    const H = this.canvas.height, s = H / span;
    return { x: back ? H + (maxX - x) * s : (x - minX) * s, y: H - (y - minY) * s, s };
  }

  /** Texture pixels -> { side, x, y } in garment metres. */
  fromCanvas(px, py) {
    const { minX, maxX, minY, span } = this.frame;
    const H = this.canvas.height, s = H / span, back = px >= H;
    return { side: back ? 'back' : 'front', x: back ? maxX - (px - H) / s : px / s + minX, y: minY + (H - py) / s };
  }

  /** Size of a layer in garment metres (images keep their aspect ratio). */
  async layerSize(layer) {
    if (layer.type === 'shape') return { w: layer.w ?? 0.1, h: layer.h ?? layer.w ?? 0.1 };
    if (layer.type === 'text') {
      const g = this.ctx, size = layer.size ?? 0.06;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.font = `700 ${size * 1000}px Rajdhani, Inter, sans-serif`;
      const w = g.measureText(String(layer.text ?? '')).width / 1000;
      g.restore();
      return { w, h: size };
    }
    const img = await this.image(layer.src);
    const w = layer.w ?? 0.1;
    return { w, h: img ? (w * img.height) / img.width : w };
  }

  /** Reject board drops in empty atlas space, outside the actual garment. */
  contains(x, y) {
    let inside = false;
    for (let i = 0, j = this.outline.length - 1; i < this.outline.length; j = i++) {
      const a = this.outline[i], b = this.outline[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  /** Shorts: crest on one leg, number on the other, small wordmark behind. */
  async paintShortsMarks(design, logo, textOutline) {
    const g = this.ctx;
    if (design.logoImage && design.logoImage !== this._logoKey) {
      this._logo = await loadImage(design.logoImage).catch(() => null);
      this._logoKey = design.logoImage;
    }
    if (!design.logoImage) this._logo = null;
    this.side(false);
    g.save();
    g.translate(0.15, 0.13);
    if (this._logo) {
      const box = 0.055, k = box / Math.max(this._logo.width, this._logo.height);
      g.scale(1, -1);
      g.drawImage(this._logo, (-this._logo.width * k) / 2, (-this._logo.height * k) / 2, this._logo.width * k, this._logo.height * k);
    } else {
      g.fillStyle = design.accent;
      g.beginPath();
      g.moveTo(0, 0.026);
      g.lineTo(0.022, 0.014);
      g.lineTo(0.017, -0.016);
      g.lineTo(0, -0.028);
      g.lineTo(-0.017, -0.016);
      g.lineTo(-0.022, 0.014);
      g.closePath();
      g.fill();
    }
    g.restore();
    if (!this._logo) this.text(false, '3D', 0.15, 0.13, 0.024, design.main, { maxWidth: 0.032 });
    this.text(false, String(design.number ?? '23'), -0.15, 0.12, 0.075, design.accent, {
      maxWidth: 0.12,
      outline: textOutline,
    });
    this.text(true, logo, 0, 0.33, 0.04, design.accent, { maxWidth: 0.2, outline: textOutline });
    g.setTransform(1, 0, 0, 1, 0, 0);
    return this.canvas;
  }
}

/** A small tileable knit normal map (pique dots), generated once. */
export function knitNormalMap(size = 256) {
  const h = new Float32Array(size * size);
  const cells = 32, cell = size / cells;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = ((x % cell) / cell) - 0.5, cy = ((y % cell) / cell) - 0.5;
      const row = Math.floor(y / cell) % 2 ? 0.25 : 0;
      const dx = ((cx + row + 1.5) % 1) - 0.5;
      h[y * size + x] = Math.max(0, 1 - Math.hypot(dx * 1.4, cy) * 2.4);
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * 1.5, ny = (at(x, y - 1) - at(x, y + 1)) * 1.5;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
