// Paints the kit's print atlas: front panel on the left half, back panel
// (mirrored so it reads correctly from behind) on the right half. Everything
// is drawn in garment coordinates (metres), so placement is exact.

import { zoneRects, POCKET, hasPocket, isHoodie, isTrack, KANGAROO, kangarooEdge, HOOD_TOP } from './zones.js';
import { POCKET_ZIP, pocketZipX } from './trackjacket.js';
import { isVarsity, varsityTailoring, paintVarsity, paintVarsityMarks } from './varsity.js';

/** The tops with set-in or raglan sleeves. */
const SLEEVED = ['jersey', 'tee', 'raglan', 'polo', 'pocketpolo', 'hoodie', 'ziphoodie', 'trackjacket', 'varsity'];

/**
 * The chest pocket's outline (zones.js POCKET) in garment metres on the current transform: from the top's inner
 * corner down, round the rounded bottom corners and up to the top's outer corner, `d` metres inside its edge (closed
 * along the top when `close`).
 */
function pocketPath(c, d = 0, close = true) {
  const { x0, x1, top, bottom, corner } = POCKET, r = Math.max(0.001, corner - d);
  c.moveTo(x0 + d, top);
  c.lineTo(x0 + d, bottom + corner);
  c.arcTo(x0 + d, bottom + d, x0 + corner, bottom + d, r);
  c.lineTo(x1 - corner, bottom + d);
  c.arcTo(x1 - d, bottom + d, x1 - d, bottom + corner, r);
  c.lineTo(x1 - d, top);
  if (close) c.closePath();
}
import { RAGLAN, raglanSeam } from './layout-warp.js';

/**
 * A hoodie's kangaroo pocket outline (zones.js KANGAROO) in garment metres, `d` metres inside its edge: the whole
 * pocket, or one half of a split (zip) one (`sgn` +1 / -1). Its curved hand openings run from the top's corners down
 * the sides.
 */
function kangarooPath(c, d = 0, sgn = 0) {
  const K = KANGAROO, steps = 16, inner = K.zipGap + d;
  const side = (s) => {
    const out = [];
    for (let k = 0; k <= steps; k++) { const y = K.top - d - ((K.top - K.bottom - 2 * d) * k) / steps; out.push([s * (kangarooEdge(y) - d), y]); }
    return out;
  };
  const pts = sgn === 0 ? [...side(1), ...side(-1).reverse()]
    : [[sgn * inner, K.top - d], ...side(sgn), [sgn * inner, K.bottom + d]];
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}
/** The kangaroo pocket's halves (one when it is whole). */
const kangarooSides = (kind) => (kind === 'ziphoodie' ? [1, -1] : [0]);
/** The hand opening's edge on one side (sgn), `d` metres inside it. */
function openingPath(c, sgn, d = 0) {
  const K = KANGAROO;
  for (let k = 0; k <= 16; k++) {
    const y = K.top - ((K.top - K.openBottom) * k) / 16, x = sgn * (kangarooEdge(y) - d);
    k ? c.lineTo(x, y) : c.moveTo(x, y);
  }
}

/**
 * The track jacket's panel lines (right half, garment metres; mirrored with `dir`): the shoulder and sleeve panel's
 * lower edge, from the neck over the shoulder and down the sleeve to the cuff, and the side panel's inner edge, from
 * the underarm down to the hem. Shared by the paint and the stitching.
 */
function trackShoulderLine(c, dir, d = 0, move = true) {
  if (move) c.moveTo(dir * 0.075, 0.745 - d); else c.lineTo(dir * 0.075, 0.745 - d);
  c.quadraticCurveTo(dir * 0.17, 0.69 - d, dir * 0.258, 0.622 - d);
  c.lineTo(dir * 0.65, 0.245 - d);
}
function trackSideLine(c, dir, d = 0, move = true) {
  if (move) c.moveTo(dir * (0.256 - d), 0.53); else c.lineTo(dir * (0.256 - d), 0.53);
  c.quadraticCurveTo(dir * (0.2 - d), 0.3, dir * (0.212 - d), -0.01);
}
/** A side pocket's zip line on the front (trackjacket.js POCKET_ZIP), moved `d` metres square to it (+ outwards). */
function trackPocketLine(c, sgn, d = 0) {
  const [, yb] = POCKET_ZIP.bottom, [, yt] = POCKET_ZIP.top;
  const dx = pocketZipX(sgn, yt) - pocketZipX(sgn, yb), dy = yt - yb, l = Math.hypot(dx, dy);
  const nx = (sgn * dy) / l, ny = (-sgn * dx) / l;   // square to the zip, away from the middle
  c.moveTo(pocketZipX(sgn, yb) + nx * d, yb + ny * d);
  c.lineTo(pocketZipX(sgn, yt) + nx * d, yt + ny * d);
}

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

/** Contrast bands along the finished edges (metres): kept narrow, the same width at the hem
 *  (and leg hems) and round the sleeve ends, and even all the way round. */
const HEM_BAND = 0.009, CUFF_BAND = 0.009;
/** The track jacket's sleeve sponsor: on the wearer's right sleeve panel (front), along the arm. */
const TRACK_SPONSOR = { side: 'front', x: -0.38, y: 0.528, rot: -46 };


const HEX = /^#[0-9a-f]{6}$/i;
/**
 * A colour zone's gradient fill, or null when the zone is a solid colour. The Primary zone keeps the original
 * `design.gradient` ({ from, to, angle }); Secondary and Pattern use `design.gradients[slot]`. Any gradient may carry
 * `stops` ([{ color, at 0..1 }], two or more, e.g. Sunset's orange, pink and purple); without them it runs from `from`
 * to `to`.
 */
export function zoneGradient(design, slot) {
  const gradient = slot === 'main' ? design.gradient : design.gradients?.[slot];
  if (!gradient || typeof gradient !== 'object') return null;
  let stops = Array.isArray(gradient.stops)
    ? gradient.stops.filter((s) => s && HEX.test(s.color)).map((s) => ({ color: s.color, at: Math.min(1, Math.max(0, Number(s.at) || 0)) }))
    : [];
  if (stops.length < 2) {
    if (!HEX.test(gradient.from ?? '') || !HEX.test(gradient.to ?? '')) return null;
    stops = [{ color: gradient.from, at: 0 }, { color: gradient.to, at: 1 }];
  }
  stops.sort((a, b) => a.at - b.at);
  return { stops, angle: Number(gradient.angle) || 0 };
}

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
  side(back, g = this.ctx) {
    const { minX, maxX, minY, span } = this.frame;
    const s = this.canvas.height / span;
    if (back) g.setTransform(-s, 0, 0, -s, this.canvas.height + maxX * s, this.canvas.height + minY * s);
    else g.setTransform(s, 0, 0, -s, -minX * s, this.canvas.height + minY * s);
    return s;
  }

  /** Text centred on (0, 0) of the current frame (y down), `size` in metres, squeezed to `maxWidth`. Returns its size. */
  centredText(str, size, color, maxWidth, outline) {
    const g = this.ctx;
    g.save();
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
    return { w: Math.min(w, maxWidth), h: size };
  }

  /**
   * One fixed mark (wordmark, sponsor, crest, name, number): drawn at its usual place `def` ({side, x, y}) unless
   * it was moved, resized, turned or hidden on the design board (design.marks, keyed `${part}_${name}`).
   * `draw(g)` paints it centred on (0, 0), y down, at its usual size and returns that size in metres; each mark
   * drawn is listed in `this.marks` so the board can select it.
   */
  mark(design, name, def, draw) {
    const key = `${this.partName}_${name}`, o = design.marks?.[key] ?? {};
    if (o.hidden === true) return;
    const num = (v, d) => (Number.isFinite(v) ? v : d);
    const back = (o.side === 'front' || o.side === 'back' ? o.side : def.side) === 'back';
    const g = this.ctx;
    g.save();
    this.clipOutline(back);
    g.translate(num(o.x, def.x), num(o.y, def.y));
    g.scale(back ? -1 : 1, -1);
    g.rotate((num(o.rot, def.rot ?? 0) * Math.PI) / 180);
    const scale = num(o.scale, 1);
    g.scale(scale, scale);
    const size = draw(g);
    g.restore();
    if (size) this.marks.push({ key, name, def, w0: size.w, h0: size.h });
  }

  markText(design, name, def, str, size, color, maxWidth, outline) {
    if (str) this.mark(design, name, def, () => this.centredText(str, size, color, maxWidth, outline));
  }

  /** An image mark fitted into boxW x boxH metres. */
  markImage(design, name, def, img, boxW, boxH) {
    this.mark(design, name, def, (g) => {
      const k = Math.min(boxW / img.width, boxH / img.height), w = img.width * k, h = img.height * k;
      g.drawImage(img, -w / 2, -h / 2, w, h);
      return { w, h };
    });
  }

  /** The 3DEEZI shield with "3D" on it, until the club has a logo; `pts` are its corners (metres, y up). */
  markShield(design, name, def, pts, textSize, textMax) {
    this.mark(design, name, def, (g) => {
      g.fillStyle = design.accent;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, -y) : g.moveTo(x, -y)));
      g.closePath();
      g.fill();
      this.centredText('3D', textSize, design.main, textMax);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    });
  }

  /**
   * How the garment is sewn, in garment metres: `seams` where pieces are joined (shoulder
   * panels, sides and set-in sleeves), `stitches` (double-needle cover-stitch rows on the
   * hem, collar and sleeve hems, plus the seam stitching) and `folds` (the top edge of a
   * hem turned up inside). Shared by the painted stitches and the relief map.
   */
  tailoring(back) {
    const shorts = this.kind === 'shorts', sleeves = SLEEVED.includes(this.kind);
    const raglan = this.kind === 'raglan';
    const stitches = [], seams = [], folds = [];
    const along = (points) => (c) => points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    // Hems and sleeve ends: two rows of cover-stitch and the turned-up edge inside, each an even
    // distance from the edge all the way round.
    for (const { kind, points } of this.edges()) {
      stitches.push(along(this.inset(points, .0115)), along(this.inset(points, .0147)));
      folds.push(along(this.inset(points, .019, .006)));
    }
    // Shorts: where the waistband is sewn on, just below it (the waist's own height: the drawn outline bulges a
    // little above it at the corners).
    // A deep gathered band (training shorts): the stitching runs right along its foot, where the gathers end.
    const deepBand = (this.rimWidth ?? 0.026) >= 0.035;
    const waistSeam = (this.points?.CF?.[1] ?? 0.42) - (this.rimWidth ?? 0.026) - (deepBand ? 0.0012 : 0.006);
    const hoodie = isHoodie(this.kind), track = isTrack(this.kind), varsity = isVarsity(this.kind), longTop = hoodie || track || varsity;
    for (const inset of [0, .0032]) {
      // The varsity jacket's long sleeves are set in as a hoodie's.
      if (longTop) {
        // Shoulder seams (to the shoulder point; the long sleeve is set in below it).
        for (const dir of [-1, 1]) stitches.push((c) => { c.moveTo(dir * (.1 + inset), .725 - inset); c.quadraticCurveTo(dir * .19, .712 - inset, dir * .254, .684 - inset); });
        continue;
      }
      if (shorts) { stitches.push((c) => { c.moveTo(-.4, waistSeam - inset); c.lineTo(.4, waistSeam - inset); }); continue; }
      for (const dir of [-1, 1]) {
        // Raglan: the seam from the neck down to the underarm, stitched on the body side; otherwise along the shoulder.
        if (raglan) stitches.push(along(raglanSeam([dir * RAGLAN.neck, .728], dir).map(([x, y]) => ({ x: x - dir * (0.004 + inset), y: y - 0.004 - inset }))));
        else stitches.push((c) => { c.moveTo(dir * (.105 + inset), .718); c.quadraticCurveTo(dir * .235, .691 - inset, dir * .395, .548 - inset); });
        stitches.push((c) => { c.moveTo(dir * (.235 - inset), .035); c.quadraticCurveTo(dir * (.21 - inset), .29, dir * (.234 - inset), .496); });
      }
    }
    if (!shorts) {
      for (const dir of [-1, 1]) {
        if (longTop) { seams.push((c) => { c.moveTo(dir * .1, .728); c.quadraticCurveTo(dir * .19, .715, dir * .258, .688); }); continue; }
        if (raglan) seams.push(along(raglanSeam([dir * RAGLAN.neck, .728], dir).map(([x, y]) => ({ x, y }))));
        else seams.push((c) => { c.moveTo(dir * .1066, .718); c.quadraticCurveTo(dir * .235, .6894, dir * .395, .5464); });
        seams.push((c) => { c.moveTo(dir * .2334, .035); c.quadraticCurveTo(dir * .2084, .29, dir * .2324, .496); });
      }
      // Collar: joined just below the neck trim, with two rows of stitching under it.
      const crew = this.kind === 'tee' || this.kind === 'raglan' || this.kind === 'polo' || this.kind === 'pocketpolo' || longTop;
      const neckline = (drop, inset) => (crew
        ? (c) => { c.moveTo(-.09 + inset, .745 - drop); c.quadraticCurveTo(0, (back ? .73 : .66) - drop, .09 - inset, .745 - drop); }
        : (c) => { c.moveTo(-.089 + inset, .745 - drop); c.lineTo(0, (back ? .69 : .668) - drop); c.lineTo(.089 - inset, .745 - drop); });
      // The varsity's collar is sewn round its own deeper neck (varsityTailoring).
      if (!varsity) {
        seams.push(neckline(.0095, 0));
        for (const drop of [.0125, .0165]) stitches.push(neckline(drop, 0));
      }
    }
    if (varsity) {
      const own = varsityTailoring(this, back);
      stitches.push(...own.stitches);
      seams.push(...own.seams);
      folds.push(...own.folds);
    }
    if (hasPocket(this.kind) && !back) {
      // The chest pocket: sewn on round its sides and bottom with two rows of stitching, its top hem stitched across
      // (with a short bar tack at each top corner) and turned in at the top edge.
      const { x0, x1, top, hem } = POCKET;
      seams.push((c) => pocketPath(c, 0, false));
      stitches.push((c) => pocketPath(c, 0.0028, false), (c) => pocketPath(c, 0.006, false));
      stitches.push((c) => { c.moveTo(x0 + 0.003, top - hem + 0.0025); c.lineTo(x1 - 0.003, top - hem + 0.0025); });
      for (const x of [x0 + 0.0045, x1 - 0.0045]) stitches.push((c) => { c.moveTo(x, top - 0.0015); c.lineTo(x, top - 0.012); });
      folds.push((c) => { c.moveTo(x0 + 0.001, top - 0.0016); c.lineTo(x1 - 0.001, top - 0.0016); });
    }
    if (hoodie && !back) {
      // The kangaroo pocket: sewn on along its top, lower sides and foot with two rows of stitching; each hand
      // opening turned in and stitched down. The zip hoodie's halves are also sewn along the zip.
      for (const sgn of kangarooSides(this.kind)) {
        seams.push((c) => kangarooPath(c, 0, sgn));
        stitches.push((c) => kangarooPath(c, 0.003, sgn), (c) => kangarooPath(c, 0.0065, sgn));
      }
      for (const sgn of [-1, 1]) folds.push((c) => openingPath(c, sgn, 0.0015));
    }
    if (track) {
      // The track jacket: the shoulder and sleeve panels and the side panels sewn in (top-stitched on the body side);
      // the side pockets' welts stitched round their zips; the collar piece stitched along its top edge.
      for (const dir of [-1, 1]) {
        seams.push((c) => trackShoulderLine(c, dir), (c) => trackSideLine(c, dir));
        stitches.push((c) => trackShoulderLine(c, dir, 0.0035), (c) => trackSideLine(c, dir, 0.0035));
        if (!back) for (const d of [-0.0145, 0.0145]) stitches.push((c) => trackPocketLine(c, dir, d));
      }
      const piece = this.pieces?.[0]?.outline;
      if (back && piece && !this.trackHood) {
        const foot = piece.filter((p) => p.y < HOOD_TOP);
        stitches.push((c) => foot.forEach((p, i) => (i ? c.lineTo(p.x, p.y + 0.009) : c.moveTo(p.x, p.y + 0.009))));
      }
    }
    if ((hoodie || (track && this.trackHood)) && back) {
      // The hood piece: its centre seam, and the face edge's drawstring channel stitched along its foot.
      const piece = this.pieces?.[0]?.outline;
      seams.push((c) => { c.moveTo(0, HOOD_TOP); c.lineTo(0, HOOD_TOP - 0.4); });
      for (const inset of [-0.003, 0.003]) stitches.push((c) => { c.moveTo(inset, HOOD_TOP); c.lineTo(inset, HOOD_TOP - 0.4); });
      if (piece) {
        const foot = piece.filter((p) => p.y < HOOD_TOP);
        stitches.push((c) => foot.forEach((p, i) => (i ? c.lineTo(p.x, p.y + 0.016) : c.moveTo(p.x, p.y + 0.016))));
      }
    }
    if (sleeves && !raglan) {
      // Set-in sleeves: the armhole seam from the shoulder down to the underarm, stitched on the body side.
      for (const dir of [-1, 1]) {
        seams.push((c) => { c.moveTo(dir * .257, .687); c.quadraticCurveTo(dir * .273, .61, dir * .261, .531); });
        stitches.push((c) => { c.moveTo(dir * .2535, .683); c.quadraticCurveTo(dir * .269, .61, dir * .2565, .535); });
      }
    }
    return { stitches, seams, folds };
  }

  /**
   * Fine relief of the sewing as a normal map in the print's layout (seen when zoomed in):
   * each stitch stands up and the fabric dips along the stitch rows, seams sink a little
   * and pucker, and turned-up hems show a soft ridge. Depends only on the garment shape.
   */
  reliefMap({ pucker = false } = {}) {
    const W = this.canvas.width, H = this.canvas.height;
    const height = document.createElement('canvas');
    height.width = W; height.height = H;
    const g = height.getContext('2d');
    g.fillStyle = 'rgb(128,128,128)';
    g.fillRect(0, 0, W, H);
    const stroke = (paths, style, width, dash = []) => {
      g.strokeStyle = style; g.lineWidth = width; g.setLineDash(dash); g.lineCap = 'round';
      for (const draw of paths) { g.beginPath(); draw(g); g.stroke(); }
    };
    for (const back of [false, true]) {
      const { stitches, seams, folds } = this.tailoring(back);
      this.side(back, g);
      stroke(seams, 'rgba(255,255,255,0.12)', .012, [.0035, .0035]);   // puckering across the seam
      // Render tiers: deeper, less regular puckering (longer soft ripples over the short ones).
      if (pucker) { stroke(seams, 'rgba(255,255,255,0.1)', .016, [.0035, .0035]); stroke(seams, 'rgba(255,255,255,0.12)', .022, [.007, .005]); }
      stroke(seams, 'rgba(0,0,0,0.32)', .0022);                        // the seam sinks
      stroke(folds, 'rgba(255,255,255,0.24)', .004);                   // turned-up hem edge
      stroke(stitches, 'rgba(0,0,0,0.24)', .0017);                     // fabric pulled down by the thread
      stroke(stitches, 'rgba(255,255,255,0.8)', .0011, [.0024, .0016]); // each stitch stands up
    }
    // Soften the profiles, then turn heights into normals.
    const soft = document.createElement('canvas');
    soft.width = W; soft.height = H;
    const sg = soft.getContext('2d', { willReadFrequently: true });
    sg.filter = 'blur(0.8px)';
    sg.drawImage(height, 0, 0);
    const h = sg.getImageData(0, 0, W, H).data, out = sg.createImageData(W, H), o = out.data;
    for (let y = 0; y < H; y++) {
      const up = Math.max(0, y - 1) * W, down = Math.min(H - 1, y + 1) * W, row = y * W;
      for (let x = 0; x < W; x++) {
        const nx = (h[(row + Math.max(0, x - 1)) * 4] - h[(row + Math.min(W - 1, x + 1)) * 4]) / 255 * 2.4;
        const ny = (h[(up + x) * 4] - h[(down + x) * 4]) / 255 * 2.4;
        const len = Math.hypot(nx, ny, 1), i = (row + x) * 4;
        o[i] = (nx / len * 0.5 + 0.5) * 255; o[i + 1] = (ny / len * 0.5 + 0.5) * 255; o[i + 2] = (1 / len * 0.5 + 0.5) * 255; o[i + 3] = 255;
      }
    }
    sg.putImageData(out, 0, 0);
    return soft;
  }

  /**
   * Raised cover-stitch along each path (drawn in garment metres): a soft shadow,
   * the thread, then a highlight on top, so stitches read tone-on-tone on any colour.
   */
  stitches(back, paths) {
    const g = this.ctx;
    this.side(back);
    g.save();
    g.setLineDash([.0024, .0016]);
    g.lineCap = 'round';
    for (const [dx, dy, style, width] of [[.00035, -.00045, 'rgba(0,0,0,0.42)', .0012], [0, 0, 'rgba(255,255,255,0.2)', .001], [-.00018, .00022, 'rgba(255,255,255,0.34)', .00045]]) {
      g.save();
      g.translate(dx, dy);
      g.strokeStyle = style;
      g.lineWidth = width;
      for (const draw of paths) { g.beginPath(); draw(g); g.stroke(); }
      g.restore();
    }
    g.restore();
  }

  clipOutline(back) {
    const g = this.ctx;
    this.side(back);
    g.beginPath();
    this.outline.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    // Pieces of their own on the atlas (a hoodie's hood) are printed too.
    for (const piece of this.piecesOn(back)) {
      piece.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
    }
    g.clip();
  }

  /** The outlines of the separate pieces on one side of the atlas (a hoodie's hood on the back). */
  piecesOn(back) {
    return (this.pieces ?? []).filter((p) => p.back === back).map((p) => p.outline);
  }

  /**
   * The finished edges, each a run of outline points in garment metres: the hem (each leg
   * opening on shorts) and each sleeve end. Bands and stitching follow them at an even
   * distance, so they are the same width all the way round the body and the arms.
   */
  edges() {
    if (this._edges) return this._edges;
    const poly = this.outline, n = poly.length, shorts = this.kind === 'shorts';
    const sleeves = SLEEVED.includes(this.kind);
    // The cuff's corners: the garment's own (the raglan's, garment.js points) or the tee's.
    const [ax, ay] = this.points?.CT ?? [0.418, 0.566], [bx, by] = this.points?.CB ?? [0.372, 0.476];
    const a = { x: ax, y: ay }, b = { x: bx, y: by }, dx = b.x - a.x, dy = b.y - a.y;
    const onCuff = (p) => {
      const x = Math.abs(p.x), t = ((x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
      return t >= 0 && t <= 1 && Math.hypot(x - a.x - dx * t, p.y - a.y - dy * t) < 0.006;
    };
    // Shorts made with their finished edges marked (legs with side splits) take those: the hem curves up into the split.
    const kinds = shorts && this.edgeMask
      ? poly.map((p, i) => (this.edgeMask[i] && p.y < this.frame.maxY - 0.05 ? 'hem' : null))
      : poly.map((p) => (p.y < 0.03 && (!shorts || Math.abs(p.x) > 0.035) ? 'hem' : sleeves && onCuff(p) ? 'cuff' : null));
    const runs = [], start = kinds.findIndex((k, i) => k !== kinds[(i - 1 + n) % n]);
    for (let i = Math.max(0, start), seen = 0; start >= 0 && seen < n;) {
      const kind = kinds[i], points = [];
      while (seen < n && kinds[i] === kind) { points.push(poly[i]); i = (i + 1) % n; seen++; }
      if (kind && points.length > 1) runs.push({ kind, points });
    }
    return (this._edges = runs);
  }

  /** An edge run moved `d` metres into the garment, square to the edge, and `ext` metres on past each end. */
  inset(points, d, ext = 0) {
    const n = points.length;
    const out = points.map((p, i) => {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
      if (!this.contains(p.x + nx * 0.003, p.y + ny * 0.003)) { nx = -nx; ny = -ny; }
      return { x: p.x + nx * d, y: p.y + ny * d };
    });
    if (ext) {
      const on = (p, q) => { const l = Math.hypot(p.x - q.x, p.y - q.y) || 1; return { x: p.x + ((p.x - q.x) / l) * ext, y: p.y + ((p.y - q.y) / l) * ext }; };
      return [on(out[0], out[1]), ...out, on(out[n - 1], out[n - 2])];
    }
    return out;
  }

  /** Fills an even band `w` metres wide along an edge run (clipped to the outline by the caller). */
  band(points, w) {
    const g = this.ctx, path = [...this.inset(points, -0.004, 0.03), ...this.inset(points, w, 0.03).reverse()];
    g.beginPath();
    path.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.fill();
  }

  proceduralPattern(design, name = design.pattern, ink = mix(design.main, design.secondary, 0.35)) {
    // A garment wider than the patterns' metre (a hoodie's long sleeves) repeats them a metre to each side.
    if (this.frame.maxX <= 0.5) return this.patternTile(design, name, ink);
    const g = this.ctx;
    for (const dx of [-1, 0, 1]) {
      g.save();
      g.translate(dx, 0);
      g.beginPath();
      g.rect(-0.5, -0.5, 1, 2);
      g.clip();
      this.patternTile(design, name, ink);
      g.restore();
    }
  }

  /** One metre of a pattern (x -0.5 to 0.5). */
  patternTile(design, name, ink) {
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
    // A factory print layout: its panels are the print (warped into layoutBase by layout-warp.js); only the
    // sewing and the user's own artwork go on top.
    if (design.layout && this.layoutBase) {
      g.fillStyle = this.layoutFill ?? design.main;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      g.drawImage(this.layoutBase, 0, 0, this.canvas.width, this.canvas.height);
      for (const back of [false, true]) {
        g.save();
        this.clipOutline(back);
        this.stitches(back, this.tailoring(back).stitches);
        g.restore();
      }
      this.marks = [];
      await this.paintLayers(design);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return this.canvas;
    }
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
      // Gradient fills, one per colour zone (zoneGradient): the body (Primary), the pattern's ink (Pattern) and
      // the trims (Secondary: side panels, bands, collar, placket, area blocks).
      const body = zoneGradient(design, 'main');
      // The track jacket's body may have its own colour (design.zoneColors.body) instead of the Primary.
      const ownBody = isTrack(this.kind) && HEX.test(design.zoneColors?.body ?? '') ? design.zoneColors.body : null;
      if (ownBody) { g.fillStyle = ownBody; g.fillRect(-1.6, -0.1, 3.2, 1.6); } else if (body) this.gradientFill(body);
      const ink = zoneGradient(design, 'patternColor');
      this.proceduralPattern(design, design.pattern, ink ? this.gradientStyle(ink) : undefined);
      const trim = this.zoneFill(design, 'secondary');

      const shorts = this.kind === 'shorts';
      const sleeves = SLEEVED.includes(this.kind);
      const hoodie = isHoodie(this.kind), track = isTrack(this.kind), varsity = isVarsity(this.kind);
      g.fillStyle = trim;
      // Hoodies: no side panels or edge bands (their cuffs and waistband are rib, hoodie.js); the track jacket's own
      // panels are painted below (paintTrack); the varsity jacket has rib trims (varsity.js).
      for (const dir of hoodie || track || varsity ? [] : [-1, 1]) {
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
      }
      // Bands an even width all the way round: the cuffs, the hem (leg hems on shorts), and
      // the waistband. Each reaches a little past the edge so the rolled hem is banded too.
      if (!hoodie && !track && !varsity) for (const run of this.edges()) this.band(run.points, run.kind === 'cuff' ? CUFF_BAND : HEM_BAND);
      if (shorts) g.fillRect(-0.4, (this.points?.CF?.[1] ?? 0.42) - 0.025, 0.8, 0.03);

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

      if (hoodie) this.paintHoodie(design, back);
      if (track) this.paintTrack(design, back);
      if (varsity) paintVarsity(this, design, back);
      this.paintZones(design, back);

      // Collar trim: V-neck for jerseys and singlets, crew for tee and polo.
      this.side(back);
      g.strokeStyle = trim;
      g.lineWidth = 0.018;
      if (this.kind === 'tee' || this.kind === 'raglan' || this.kind === 'polo' || this.kind === 'pocketpolo') {
        g.beginPath();
        g.moveTo(-0.092, 0.745);
        g.quadraticCurveTo(0, back ? 0.73 : 0.66, 0.092, 0.745);
        g.stroke();
      } else if (!shorts && !hoodie && !track && !varsity) {
        g.beginPath();
        g.moveTo(-0.095, 0.745);
        g.lineTo(0, back ? 0.69 : 0.668);
        g.lineTo(0.095, 0.745);
        g.stroke();
      }
      // Polo button placket.
      if ((this.kind === 'polo' || this.kind === 'pocketpolo') && !back) {
        g.fillStyle = trim;
        g.fillRect(-0.02, 0.57, 0.04, 0.15);
        g.fillStyle = design.accent;
        for (const y of [0.6, 0.64, 0.68]) {
          g.beginPath();
          g.arc(0, y, 0.006, 0, Math.PI * 2);
          g.fill();
        }
      }
      // The chest pocket: a soft shadow on the shirt round its sewn edges and its top hem in the trim colour (the
      // pocket itself is the body's fabric, or its own colour zone: Apply to area, Chest pocket).
      if (hasPocket(this.kind) && !back) {
        const { x0, x1, top, hem } = POCKET;
        g.save();
        g.strokeStyle = 'rgba(0,0,0,0.16)';
        g.lineWidth = 0.007;
        g.beginPath();
        pocketPath(g, -0.0016, false);
        g.stroke();
        g.restore();
        g.fillStyle = trim;
        g.fillRect(x0, top - hem * 0.42, x1 - x0, hem * 0.42);
      }
      // Tailoring details are painted in the same panel coordinates as the kit.
      this.stitches(back, this.tailoring(back).stitches);
      g.restore();
    }

    // The fixed marks: wordmark, sponsor and crest on the front, name and number on the back (shorts: crest,
    // number and a small wordmark). Each can be moved, resized, turned or hidden on the design board.
    const logo = (design.logoText || '').toUpperCase();
    const textOutline = mix(design.main, '#000000', 0.5);
    this.marks = [];
    if (this.kind === 'shorts') {
      await this.paintShortsMarks(design, logo, textOutline);
      await this.paintLayers(design);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return this.canvas;
    }
    const ownArt = (design.layers ?? []).some((l) => l.side !== 'back' && (l.part ?? 'top') === 'top' && l.type !== 'text');
    // The varsity jacket: a chenille letter (or the logo) on the chest, the club arched across the back, the name and
    // a big number under it, sleeve patches (varsity.js).
    if (isVarsity(this.kind)) {
      if (design.sponsorImage && design.sponsorImage !== this._sponsorKey) {
        this._sponsor = await loadImage(design.sponsorImage).catch(() => null);
        this._sponsorKey = design.sponsorImage;
      }
      if (design.logoImage && design.logoImage !== this._logoKey) {
        this._logo = await loadImage(design.logoImage).catch(() => null);
        this._logoKey = design.logoImage;
      } else if (!design.logoImage) { this._logo = null; this._logoKey = null; }
      paintVarsityMarks(this, design, { logo, logoImg: this._logo, sponsorImg: design.sponsorImage ? this._sponsor : null, ownArt });
      await this.paintLayers(design);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return this.canvas;
    }
    // The pocket polo (pool and darts shirts): the team name small on the right chest, the crest on the pocket (it
    // can be moved above it on the 2D panels), the player's name across the upper back and the sponsor low on the back.
    const pocket = hasPocket(this.kind), hoodie = isHoodie(this.kind), zip = this.kind === 'ziphoodie' || isTrack(this.kind);
    // The track jacket: as the zip hoodie in front (the club name small on the right chest, the crest on the left),
    // the sponsor on the right sleeve, the name and number (or the club's name) across the back.
    const track = isTrack(this.kind);
    // Hoodies: the wordmark across the chest above the pocket (the zip hoodie's small on the right chest, clear of the
    // zip), the crest on the left chest, the sponsor on the pocket (the zip hoodie's low on the back), the name and
    // number on the back below the hood.
    if (zip) this.markText(design, 'wordmark', { side: 'front', x: -0.105, y: 0.575 }, logo, 0.034, design.accent, 0.13, textOutline);
    else if (hoodie) this.markText(design, 'wordmark', { side: 'front', x: 0, y: 0.43 }, logo, 0.075, design.accent, 0.3, textOutline);
    else if (pocket) this.markText(design, 'wordmark', { side: 'front', x: -0.105, y: 0.56 }, logo, 0.036, design.accent, 0.12, textOutline);
    else this.markText(design, 'wordmark', { side: 'front', x: 0, y: 0.47 }, logo, 0.085, design.accent, 0.3, textOutline);
    // Sponsor logo: front, centred below the wordmark, fitted into 17 x 6.5 cm.
    if (design.sponsorImage) {
      if (design.sponsorImage !== this._sponsorKey) {
        this._sponsor = await loadImage(design.sponsorImage).catch(() => null);
        this._sponsorKey = design.sponsorImage;
      }
      if (this._sponsor && track) this.markImage(design, 'sponsor', TRACK_SPONSOR, this._sponsor, 0.09, 0.03);
      else if (this._sponsor && zip) this.markImage(design, 'sponsor', { side: 'back', x: 0, y: 0.09 }, this._sponsor, 0.2, 0.07);
      else if (this._sponsor && hoodie) this.markImage(design, 'sponsor', { side: 'front', x: 0, y: 0.19 }, this._sponsor, 0.17, 0.065);
      else if (this._sponsor && pocket) this.markImage(design, 'sponsor', { side: 'back', x: 0, y: 0.17 }, this._sponsor, 0.24, 0.09);
      else if (this._sponsor) this.markImage(design, 'sponsor', { side: 'front', x: 0, y: 0.335 }, this._sponsor, 0.17, 0.065);
    }
    if (design.logoImage) {
      if (design.logoImage !== this._logoKey) {
        this._logo = await loadImage(design.logoImage).catch(() => null);
        this._logoKey = design.logoImage;
      }
    } else {
      this._logo = null;
      this._logoKey = null;
    }
    // Uploaded club logo on the chest, fitted into a 7 cm box; else the 3DEEZI shield (none when the user's own
    // artwork is on the kit).
    const crest = hoodie || track ? { side: 'front', x: 0.105, y: 0.575 } : pocket ? { side: 'front', x: (POCKET.x0 + POCKET.x1) / 2, y: (POCKET.bottom + POCKET.top - POCKET.hem) / 2 } : { side: 'front', x: 0.105, y: 0.6 };
    if (this._logo) this.markImage(design, 'crest', crest, this._logo, pocket ? 0.075 : 0.07, pocket ? 0.075 : 0.07);
    else if (!ownArt) this.markShield(design, 'crest', crest, [[0, 0.034], [0.028, 0.018], [0.022, -0.02], [0, -0.036], [-0.022, -0.02], [-0.028, 0.018]], 0.03, 0.04);
    const backName = (design.backName || logo).toUpperCase();
    if (hoodie || (track && this.trackHood)) {
      this.markText(design, 'name', { side: 'back', x: 0, y: 0.43 }, backName, 0.055, design.accent, 0.3, textOutline);
      this.markText(design, 'number', { side: 'back', x: 0, y: 0.25 }, String(design.number ?? '23'), 0.19, design.accent, 0.28, textOutline);
    } else if (pocket) {
      this.markText(design, 'name', { side: 'back', x: 0, y: 0.6 }, backName, 0.075, design.accent, 0.34, textOutline);
      this.markText(design, 'number', { side: 'back', x: 0, y: 0.43 }, String(design.number ?? '23'), 0.15, design.accent, 0.22, textOutline);
    } else {
      this.markText(design, 'name', { side: 'back', x: 0, y: 0.6 }, backName, 0.06, design.accent, 0.28, textOutline);
      this.markText(design, 'number', { side: 'back', x: 0, y: 0.38 }, String(design.number ?? '23'), 0.24, design.accent, 0.3, textOutline);
    }
    await this.paintLayers(design);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return this.canvas;
  }

  /** A gradient across the body, in panel metres (any number of stops); angle 0 runs top to bottom. */
  gradientStyle({ stops, angle = 0 }) {
    const g = this.ctx;
    const a = (angle * Math.PI) / 180, cx = 0, cy = 0.38, r = 0.42;
    const dx = Math.sin(a) * r, dy = -Math.cos(a) * r;
    const grad = g.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    for (const s of stops) grad.addColorStop(s.at, s.color);
    return grad;
  }

  /** Fills the whole panel with a gradient (the body's Primary zone). */
  gradientFill(gradient) {
    const g = this.ctx, w = this.frame.maxX > 0.5 ? 1.6 : 0.6;
    g.fillStyle = this.gradientStyle(gradient);
    g.fillRect(-w, -0.1, 2 * w, 1);
  }

  /** A colour zone's paint: its gradient when it has one, else its solid colour. */
  zoneFill(design, slot) {
    const gradient = zoneGradient(design, slot);
    return gradient ? this.gradientStyle(gradient) : design[slot];
  }

  /**
   * A hoodie's own colour zones on the atlas (design.zoneColors, hex): the hood's outer fabric (its piece on the back;
   * otherwise the body's fill) and the kangaroo pocket (on the front, under the 3D pocket). The lining, rib, zip and
   * drawstring are coloured on their own 3D parts (main.js).
   */
  paintHoodie(design, back) {
    const g = this.ctx, own = (key) => (HEX.test(design.zoneColors?.[key] ?? '') ? design.zoneColors[key] : null);
    g.save();
    this.side(back);
    if (back) {
      // The hood: the body's fill (its gradient too) unless it has its own colour.
      g.beginPath();
      for (const piece of this.piecesOn(true)) { piece.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }
      g.clip();
      const body = zoneGradient(design, 'main');
      g.fillStyle = own('hood') ?? design.main;
      g.fillRect(-0.8, HOOD_TOP - 0.5, 1.6, 0.6);
      if (body && !own('hood')) { g.translate(0, HOOD_TOP - 0.78); this.gradientFill(body); }
    } else if (own('pocket')) {
      g.beginPath();
      for (const sgn of kangarooSides(this.kind)) kangarooPath(g, -0.004, sgn);
      g.clip();
      g.fillStyle = own('pocket');
      g.fillRect(-0.4, 0, 0.8, 0.4);
    }
    g.restore();
    if (!back) {
      // The hand openings' turned-in edges, a touch darker.
      g.save();
      this.side(false);
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineWidth = 0.006;
      for (const sgn of [-1, 1]) { g.beginPath(); openingPath(g, sgn, 0.003); g.stroke(); }
      g.restore();
    }
  }

  /**
   * The track jacket's own colour areas on the atlas (design.zoneColors, hex): the shoulder and sleeve panels and the
   * side panels (default Secondary), the sleeve stripe along the top seam from the neck to the cuff (default Accent),
   * the collar or hood (its piece on the back; default the body's fill), and the side pockets' welts. The body's own
   * colour is the background (paint); the cuffs, hem band and zip are coloured on their 3D parts (main.js).
   */
  paintTrack(design, back) {
    const g = this.ctx, own = (key) => (HEX.test(design.zoneColors?.[key] ?? '') ? design.zoneColors[key] : null);
    const trim = this.zoneFill(design, 'secondary');
    g.save();
    this.side(back);
    for (const dir of [-1, 1]) {
      g.fillStyle = own('shoulder') ?? trim;
      g.beginPath();
      trackShoulderLine(g, dir);
      g.lineTo(dir * 0.8, 0.3);
      g.lineTo(dir * 0.8, 0.9);
      g.lineTo(dir * 0.075, 0.9);
      g.closePath();
      g.fill();
      g.fillStyle = own('side') ?? trim;
      g.beginPath();
      trackSideLine(g, dir);
      g.lineTo(dir * 0.3, -0.01);
      g.lineTo(dir * 0.3, 0.47);
      g.closePath();
      g.fill();
    }
    // The stripe: along the outline's top edge (the shoulder and sleeve seam), 1.2 cm on each panel.
    g.strokeStyle = own('stripe') ?? design.accent;
    g.lineWidth = 0.024;
    g.lineJoin = 'round';
    for (const run of this.trackTopEdges()) { g.beginPath(); run.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
    if (!back) {
      // The side pockets' welts: a narrow, slightly darker strip round each zip (the zip itself is 3D).
      g.strokeStyle = 'rgba(0,0,0,0.2)';
      g.lineWidth = 0.027;
      g.lineCap = 'round';
      for (const sgn of [-1, 1]) { g.beginPath(); trackPocketLine(g, sgn); g.stroke(); }
    }
    g.restore();
    if (back) {
      // The collar or hood: the body's fill (its gradient too) unless it has its own colour.
      g.save();
      this.side(true);
      g.beginPath();
      for (const piece of this.piecesOn(true)) { piece.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }
      g.clip();
      const body = zoneGradient(design, 'main'), ownBody = own('body');
      g.fillStyle = own('collar') ?? ownBody ?? design.main;
      g.fillRect(-0.8, HOOD_TOP - 0.5, 1.6, 0.6);
      if (body && !own('collar') && !ownBody) { g.translate(0, HOOD_TOP - 0.78); this.gradientFill(body); }
      g.restore();
    }
  }

  /** The outline's top edge on each side (the shoulder seam and the sleeve's top seam, neck to cuff), as point runs. */
  trackTopEdges() {
    if (this._topEdges) return this._topEdges;
    const poly = this.outline, n = poly.length;
    const nearest = (x, y) => poly.reduce((best, p, i) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(poly[best].x - x, poly[best].y - y) ? i : best), 0);
    const runs = [];
    for (const dir of [-1, 1]) {
      const a = nearest(dir * 0.098, 0.738), b = nearest(dir * 0.68, 0.262), run = [];
      // The short way round between them.
      const fwd = (b - a + n) % n, step = fwd <= n / 2 ? 1 : -1;
      for (let i = a; ; i = (i + step + n) % n) { run.push(poly[i]); if (i === b) break; }
      // On a little way past each end (the neck edge, the cuff), so the stripe's ends are square to them.
      runs.push(run);
    }
    return (this._topEdges = runs);
  }

  /** Patterns or colour blocks dropped onto areas (sleeves, shoulders, ...). */
  paintZones(design, back) {
    const g = this.ctx;
    for (const [zone, name] of Object.entries(design.zones ?? {})) {
      if (!name || name === 'None') continue;
      if (zone === 'pocket' && (back || !(hasPocket(this.kind) || isHoodie(this.kind)))) continue;
      if (zone === 'hood' && (!back || !(isHoodie(this.kind) || isTrack(this.kind)))) continue;
      g.save();
      this.side(back);
      g.beginPath();
      if (zone === 'pocket' && isHoodie(this.kind)) for (const sgn of kangarooSides(this.kind)) kangarooPath(g, -0.004, sgn);
      else if (zone === 'pocket') pocketPath(g);
      // The hood's patterns are drawn as on the body, moved up onto its piece.
      if (zone === 'hood') { for (const piece of this.piecesOn(true)) { piece.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); } g.clip(); g.translate(0, HOOD_TOP - 0.78); g.beginPath(); }
      for (const [x0, y0, x1, y1] of zoneRects(this.kind, zone)) g.rect(x0, y0, x1 - x0, y1 - y0);
      g.clip();
      if (name === 'Solid') {
        g.fillStyle = this.zoneFill(design, 'secondary');
        g.fillRect(-1.6, -0.1, 3.2, 1.6);
      } else {
        this.proceduralPattern(design, name, this.zoneFill(design, 'secondary'));
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

  /** Reject board drops in empty atlas space, outside the actual garment (`side`: also its own pieces there). */
  contains(x, y, side) {
    const inPoly = (poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    };
    if (inPoly(this.outline)) return true;
    return side != null && this.piecesOn(side === 'back').some(inPoly);
  }

  /**
   * Shorts: crest on one leg, number on the other, small wordmark behind. The crest is the team
   * logo, as on the shirt: the fixed chest crest, or else the logo placed on the front of the top
   * (the logo-sized image nearest the chest crest). Artwork placed on the front of the shorts
   * takes the crest's place.
   */
  async paintShortsMarks(design, logo, textOutline) {
    const g = this.ctx, layers = design.layers ?? [];
    const ownArt = layers.some((l) => l.part === 'shorts' && l.side !== 'back' && l.type !== 'text');
    const nearCrest = (l) => Math.hypot(Math.abs(l.x) - 0.105, l.y - 0.6);
    const topLogo = layers
      .filter((l) => l.type === 'image' && (l.part ?? 'top') === 'top' && l.side !== 'back' && (l.w ?? 0.1) <= 0.18 && Math.abs(l.x) < 0.26)
      .sort((a, b) => nearCrest(a) - nearCrest(b))[0];
    const crest = design.logoImage || (ownArt ? null : topLogo?.src ?? null);
    if (crest !== this._logoKey) {
      this._logo = crest ? await loadImage(crest).catch(() => null) : null;
      this._logoKey = crest;
    }
    const crestAt = { side: 'front', x: 0.15, y: 0.13 };
    if (this._logo) this.markImage(design, 'crest', crestAt, this._logo, 0.055, 0.055);
    else if (!ownArt) this.markShield(design, 'crest', crestAt, [[0, 0.026], [0.022, 0.014], [0.017, -0.016], [0, -0.028], [-0.017, -0.016], [-0.022, 0.014]], 0.024, 0.032);
    this.markText(design, 'number', { side: 'front', x: -0.15, y: 0.12 }, String(design.number ?? '23'), 0.075, design.accent, 0.12, textOutline);
    this.markText(design, 'wordmark', { side: 'back', x: 0, y: 0.33 }, logo, 0.04, design.accent, 0.2, textOutline);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return this.canvas;
  }
}

/** A small tileable knit normal map (pique dots), generated once. */
/**
 * Technical polyester sports knit: a fine diagonal twill. Raised yarn ridges run
 * at 45° with recessed grooves between them, and the yarn crossings along each
 * ridge step from one ridge to the next (as a twill does). Tileable; 32 ridges per tile.
 */
export function knitNormalMap(size = 512) {
  const h = new Float32Array(size * size);
  const ridge = size / 32, yarn = size / 16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + y) / ridge, v = (x - y) / yarn;
      const rib = 0.5 + 0.5 * Math.cos(2 * Math.PI * u);
      const cross = 0.5 + 0.5 * Math.cos(2 * Math.PI * v + Math.PI * Math.floor(u));
      h[y * size + x] = 0.68 * rib ** 1.6 + 0.32 * rib * cross;
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
