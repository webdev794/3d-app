// Print layouts: a finished factory print layout (a PDF, SVG or picture of the garment's cut panels laid out flat,
// each named by a label such as FRONT BODY or LEFT SLEEVE) read into panels the 3D garment can wear. This file
// finds the panels and their names and shows them for checking; layout-warp.js puts them on the garment.

export const ROLE_NAMES = {
  front: 'Front body',
  back: 'Back body',
  sleeveL: 'Left sleeve',
  sleeveR: 'Right sleeve',
  neck: 'Neck trim',
  legL: 'Left leg (shorts)',
  legR: 'Right leg (shorts)',
  none: 'Not used',
};

/** The part a panel label names: FRONT BODY → front, RIGHT LEG SHORTS → legR … (null: not a panel name). */
export function roleOf(text) {
  const t = ` ${String(text).toUpperCase().replace(/[^A-Z]+/g, ' ')} `;
  const side = / LEFT | LHS /.test(t) ? 'L' : / RIGHT | RHS /.test(t) ? 'R' : '';
  if (/ SLEEVES? /.test(t)) return side ? `sleeve${side}` : null;
  if (/ LEGS? | SHORTS? /.test(t)) return side ? `leg${side}` : null;
  if (/ NECK | COLLAR | TRIM | RIB /.test(t)) return 'neck';
  if (/ FRONT /.test(t)) return 'front';
  if (/ BACK /.test(t)) return 'back';
  return null;
}

const makeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This file could not be read as a print layout.'));
    img.src = src;
  });

let reader = null;
/** pdf.js, from the file beside this page (a plain script), loaded the first time a PDF is opened. */
const pdfReader = () => (reader ??= new Promise((resolve, reject) => {
  if (globalThis.pdfjsReader) { resolve(globalThis.pdfjsReader); return; }
  const script = document.createElement('script');
  script.src = new URL('pdf-reader.js', location.href).href;
  script.onload = () => (globalThis.pdfjsReader ? resolve(globalThis.pdfjsReader) : reject(new Error('The PDF reader did not start.')));
  script.onerror = () => reject(new Error('The PDF reader could not be loaded.'));
  document.head.append(script);
}).catch((error) => { reader = null; throw error; }));

/** Text pieces on one line, close together ("LEFT" "SLEEVE"), as one label. */
function joinLabels(items) {
  const out = [];
  for (const t of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = out.find((o) => Math.abs(o.y - t.y) < Math.max(o.h, t.h) * 0.5 && t.x >= o.x && t.x - (o.x + o.w) < Math.max(o.h, t.h) * 1.2);
    if (last) {
      last.text += ` ${t.text}`;
      last.w = Math.max(last.x + last.w, t.x + t.w) - last.x;
      last.h = Math.max(last.h, t.h);
    } else out.push({ ...t });
  }
  return out;
}

/**
 * The layout's first page as a picture (white behind it), `long` pixels on its longer side, and the text on it
 * with where each piece is (PDF only: a picture's text cannot be read).
 */
export async function readLayout(src, { long = 4800 } = {}) {
  const head = src.slice(0, 48);
  if (/^data:application\/pdf/i.test(head)) {
    const pdfjs = await pdfReader();
    const bytes = Uint8Array.from(atob(src.slice(src.indexOf(',') + 1)), (ch) => ch.charCodeAt(0));
    const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
    const doc = await task.promise;
    try {
      const page = await doc.getPage(1);
      const one = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: long / Math.max(one.width, one.height) });
      const image = makeCanvas(vp.width, vp.height);
      const g = image.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, image.width, image.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      const items = [];
      for (const t of (await page.getTextContent()).items) {
        if (!t.str?.trim()) continue;
        const [x, y] = vp.convertToViewportPoint(t.transform[4], t.transform[5]);
        const h = Math.max(1, Math.hypot(t.transform[2], t.transform[3]) * vp.scale);
        items.push({ text: t.str.trim(), x, y: y - h, w: Math.max(1, t.width * vp.scale), h });
      }
      return { image, labels: joinLabels(items), pages: doc.numPages };
    } finally {
      task.destroy();
    }
  }
  if (!/^data:image\//i.test(head)) throw new Error('Choose a PDF, SVG, PNG or JPG print layout.');
  const img = await loadImage(src);
  const svg = /^data:image\/svg/i.test(head);
  const side = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const k = svg ? long / side : Math.min(1, long / side);
  const image = makeCanvas((img.naturalWidth || img.width) * k, (img.naturalHeight || img.height) * k);
  const g = image.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, image.width, image.height);
  g.drawImage(img, 0, 0, image.width, image.height);
  return { image, labels: [], pages: 1 };
}

/** The commonest colour round the picture's edge: its background. */
function edgeColour(px, w, h) {
  const counts = new Map();
  const add = (x, y) => {
    const i = (y * w + x) * 4, key = `${px[i] >> 4},${px[i + 1] >> 4},${px[i + 2] >> 4},${px[i + 3] >> 6}`;
    const c = counts.get(key);
    if (c) { c.n++; c.r += px[i]; c.g += px[i + 1]; c.b += px[i + 2]; c.a += px[i + 3]; } else counts.set(key, { n: 1, r: px[i], g: px[i + 1], b: px[i + 2], a: px[i + 3] });
  };
  for (let x = 0; x < w; x += 2) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y += 2) { add(0, y); add(w - 1, y); }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return [best.r / best.n, best.g / best.n, best.b / best.n, best.a / best.n];
}

/** The outer edge of the shape whose topmost-leftmost pixel is (sx, sy), traced clockwise (Moore neighbours). */
function trace(mask, w, h, sx, sy) {
  const D = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const out = [[sx, sy]];
  let cx = sx, cy = sy, back = 6;   // the pixel to the west is outside
  for (let steps = 0; steps < 4 * w * h; steps++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      if (inside(cx + D[d][0], cy + D[d][1])) { found = d; break; }
    }
    if (found < 0) break;   // a lone pixel
    const nx = cx + D[found][0], ny = cy + D[found][1];
    // Search on from the outside neighbour checked just before, as seen from the new pixel.
    const pd = (found + 7) % 8, bx = cx + D[pd][0] - nx, by = cy + D[pd][1] - ny;
    back = D.findIndex(([dx, dy]) => dx === bx && dy === by);
    if (back < 0) back = (found + 4) % 8;
    if (nx === sx && ny === sy) break;
    out.push([nx, ny]);
    cx = nx;
    cy = ny;
  }
  return out;
}

/** An open line with fewer points (Ramer–Douglas–Peucker), `eps` pixels off at most; keeps both ends. */
function rdp(pts, eps) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = pts[i], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    let best = -1, idx = -1;
    for (let q = i + 1; q < j; q++) {
      const d = Math.abs((pts[q][0] - ax) * dy - (pts[q][1] - ay) * dx) / len;
      if (d > best) { best = d; idx = q; }
    }
    if (idx >= 0 && best > eps) { keep[idx] = 1; stack.push([i, idx], [idx, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** A closed outline with fewer points: split at the point farthest from the first, each half simplified. */
function simplify(points, eps) {
  if (points.length < 4) return points;
  let split = 1, dist = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (d > dist) { dist = d; split = i; }
  }
  const a = rdp(points.slice(0, split + 1), eps), b = rdp([...points.slice(split), points[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Twice the signed area: above 0 when the outline runs clockwise on screen (y down). */
const area2 = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);

/**
 * A garment drawing's front often shows the inside of the back through its neck opening, drawn white: a hole in the
 * shape just under its top edge (under the back's neckline). That hole is opened up to the top, so the outline runs
 * down round the front's neckline as the garment's does. `p`: the shape's box in the mask (`w` pixels wide).
 */
function openNeck(mask, w, p) {
  const bw = p.x1 - p.x0 + 1, bh = p.y1 - p.y0 + 1, at = (x, y) => (p.y0 + y) * w + p.x0 + x;
  // Background reached from the edge of the box (4 neighbours) is outside (-1); any other background is a hole (1, 2 …).
  const label = new Int32Array(bw * bh);
  const fill = (start, id) => {
    const stack = [start], box = { id, n: 0, x0: bw, x1: -1, y0: bh, y1: -1 };
    label[start] = id;
    while (stack.length) {
      const q = stack.pop(), x = q % bw, y = (q - x) / bw;
      box.n++;
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, r = ny * bw + nx;
        if (nx >= 0 && ny >= 0 && nx < bw && ny < bh && !label[r] && !mask[at(nx, ny)]) { label[r] = id; stack.push(r); }
      }
    }
    return box;
  };
  for (let x = 0; x < bw; x++) for (const y of [0, bh - 1]) if (!label[y * bw + x] && !mask[at(x, y)]) fill(y * bw + x, -1);
  for (let y = 0; y < bh; y++) for (const x of [0, bw - 1]) if (!label[y * bw + x] && !mask[at(x, y)]) fill(y * bw + x, -1);
  // The neck: the biggest hole near the top middle, with only a thin line (the back's neckline) above it.
  let neck = null;
  for (let q = 0, id = 0; q < bw * bh; q++) {
    if (label[q] || mask[at(q % bw, Math.floor(q / bw))]) continue;
    const box = fill(q, ++id), cx = Math.round((box.x0 + box.x1) / 2);
    if (box.n < 0.002 * bw * bh || box.y0 > 0.25 * bh || cx < 0.3 * bw || cx > 0.7 * bw) continue;
    let above = 0;
    for (let y = 0; y < box.y0; y++) if (mask[at(cx, y)]) above++;
    if (above <= 0.06 * bh && (!neck || box.n > neck.n)) neck = box;
  }
  if (!neck) return;
  for (let x = neck.x0; x <= neck.x1; x++) {
    let top = -1;
    for (let y = neck.y0; y <= neck.y1 && top < 0; y++) if (label[y * bw + x] === neck.id) top = y;
    for (let y = 0; y < top; y++) mask[at(x, y)] = 0;
  }
  // Only the shape itself is kept (not a scrap of the line cut off above the opening).
  const piece = new Int32Array(bw * bh);
  let best = 0, bestSize = 0;
  for (let q = 0, id = 0; q < bw * bh; q++) {
    if (piece[q] || !mask[at(q % bw, Math.floor(q / bw))]) continue;
    const stack = [q];
    piece[q] = ++id;
    let size = 0;
    while (stack.length) {
      const r = stack.pop(), x = r % bw, y = (r - x) / bw;
      size++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, s = ny * bw + nx;
        if (nx >= 0 && ny >= 0 && nx < bw && ny < bh && !piece[s] && mask[at(nx, ny)]) { piece[s] = id; stack.push(s); }
      }
    }
    if (size > bestSize) { best = id; bestSize = size; }
  }
  for (let q = 0; q < bw * bh; q++) if (piece[q] && piece[q] !== best) mask[at(q % bw, Math.floor(q / bw))] = 0;
}

/**
 * A garment drawing's background: a smooth wash fitted to the picture's edge (a quadratic per colour, refitted
 * without the edge points far from it, such as a garment touching the edge), so a photo mock-up's grey gradient or
 * vignette is background too, not only a white page. Returns its colour at a pixel, how far a pixel may differ from
 * it and still be background, and whether it is a plain white page.
 */
function backgroundModel(px, w, h) {
  const all = [];
  const add = (x, y) => { const i = (y * w + x) * 4; all.push([x / w, y / h, px[i], px[i + 1], px[i + 2]]); };
  for (let x = 0; x < w; x += 2) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y += 2) { add(0, y); add(w - 1, y); }
  const basis = (u, v) => [1, u, v, u * u, v * v, u * v];
  const solve = (pts, c) => {
    const A = Array.from({ length: 6 }, () => new Float64Array(7));
    for (const s of pts) { const b = basis(s[0], s[1]); for (let i = 0; i < 6; i++) { for (let j = 0; j < 6; j++) A[i][j] += b[i] * b[j]; A[i][6] += b[i] * s[c]; } }
    for (let i = 0; i < 6; i++) A[i][i] += 1e-6;
    for (let i = 0; i < 6; i++) {
      let p = i;
      for (let r = i + 1; r < 6; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]];
      for (let r = 0; r < 6; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let k = i; k < 7; k++) A[r][k] -= f * A[i][k]; }
    }
    return A.map((row, i) => row[6] / row[i]);
  };
  const colour = (fit, u, v) => { const b = basis(u, v); return fit.map((f) => f.reduce((s, q, i) => s + q * b[i], 0)); };
  let use = all, fit = null, rms = 0;
  for (let pass = 0; pass < 3; pass++) {
    fit = [2, 3, 4].map((c) => solve(use, c));
    const err = all.map((s) => { const m = colour(fit, s[0], s[1]); return Math.max(Math.abs(s[2] - m[0]), Math.abs(s[3] - m[1]), Math.abs(s[4] - m[2])); });
    const median = [...err].sort((a, b) => a - b)[err.length >> 1], limit = Math.max(6, 2.5 * median);
    const kept = all.filter((_, i) => err[i] <= limit), near = err.filter((e) => e <= limit);
    rms = Math.sqrt(near.reduce((s, e) => s + e * e, 0) / Math.max(1, near.length));
    if (kept.length < 24) break;
    use = kept;
  }
  const spots = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]].map(([u, v]) => colour(fit, u, v));
  const plain = spots.every((c) => c.every((v) => v > 245));
  return { at: (x, y) => colour(fit, x / w, y / h), tol: Math.max(24, 3 * rms), plain };
}

/**
 * The panels on the page: each separate shape on the plain background; a strip split off by a thin line (a cuff
 * or hem band under its sleeve or leg) joins the panel it belongs to; each is named by the nearest label. Outlines
 * are in the picture's pixels, running clockwise on screen.
 * `drawing`: the page is a drawing of the finished garment (its front and back drawn flat, as on a tech sheet or a
 * mock-up) instead of cut panels: the two big shapes are the front and the back (named by labels when there are
 * any, else in reading order: the front first), the front's neck opening is opened up (openNeck), and small shapes
 * beside them (a logo, a note) are left out.
 */
export function findPanels(image, labels = [], { drawing = false } = {}) {
  const W = image.width, H = image.height;
  const k = Math.min(1, 1200 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const small = makeCanvas(w, h);
  const sg = small.getContext('2d', { willReadFrequently: true });
  sg.drawImage(image, 0, 0, w, h);
  const px = sg.getImageData(0, 0, w, h).data;
  const bg = edgeColour(px, w, h);
  const clear = bg[3] < 128;
  // A garment drawing on a white page or a photo mock-up's backdrop: the background fitted to the picture's edge.
  const model = drawing && !clear ? backgroundModel(px, w, h) : null;
  const ink = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < w * h; i += 4, j++) {
    const a = px[i + 3];
    if (a < 96) continue;
    if (model) {
      const x = j % w, m = model.at(x, (j - x) / w);
      // On a photo's backdrop, greys a little darker than it are its shadows (under a garment, inside its neck).
      const grey = !model.plain && Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) < 22 && px[i] + px[i + 1] + px[i + 2] > 0.55 * (m[0] + m[1] + m[2]);
      if (!grey && Math.max(Math.abs(px[i] - m[0]), Math.abs(px[i + 1] - m[1]), Math.abs(px[i + 2] - m[2])) > model.tol) ink[j] = 1;
    } else if (clear || Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2])) > 24) ink[j] = 1;
  }
  // Panel names written beside the panels are not panels.
  const named = labels.map((l) => ({ ...l, role: roleOf(l.text) })).filter((l) => l.role);
  for (const l of named) {
    const x0 = Math.max(0, Math.floor(l.x * k) - 2), x1 = Math.min(w - 1, Math.ceil((l.x + l.w) * k) + 2);
    const y0 = Math.max(0, Math.floor(l.y * k) - 2), y1 = Math.min(h - 1, Math.ceil((l.y + l.h) * k) + 2);
    for (let y = y0; y <= y1; y++) ink.fill(0, y * w + x0, y * w + x1 + 1);
  }
  // Separate shapes (touching diagonally counts as touching).
  const comp = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  let parts = [];
  for (let s = 0; s < w * h; s++) {
    if (!ink[s] || comp[s] >= 0) continue;
    const id = parts.length;
    let top = 0, area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack[top++] = s;
    comp[s] = id;
    while (top) {
      const p = stack[--top];
      area++;
      const x = p % w, y = (p - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (ink[q] && comp[q] < 0) { comp[q] = id; stack[top++] = q; }
        }
      }
    }
    parts.push({ ids: [id], area, x0, y0, x1, y1, role: null, label: '' });
  }
  parts = parts.filter((p) => p.area >= w * h * 0.0003);
  if (drawing) {
    const most = Math.max(0, ...parts.map((p) => p.area));
    parts = parts.filter((p) => p.area >= most * 0.05);
  }
  // Each name goes to the nearest shape (the nearer name wins when two point at one shape).
  const gap = (l, p) => {
    const cx = (l.x + l.w / 2) * k, cy = (l.y + l.h / 2) * k;
    return Math.hypot(Math.max(p.x0 - cx, 0, cx - p.x1), Math.max(p.y0 - cy, 0, cy - p.y1));
  };
  const pairs = [];
  for (const l of named) for (const p of parts) pairs.push({ l, p, d: gap(l, p) });
  pairs.sort((a, b) => a.d - b.d);
  const usedLabels = new Set();
  for (const { l, p } of pairs) {
    if (p.role || usedLabels.has(l)) continue;
    p.role = l.role;
    p.label = l.text;
    usedLabels.add(l);
  }
  if (drawing) {
    // How much of its box each shape fills, holes included (row by row, first to last pixel): a garment's armholes
    // and neck leave its box's corners empty; a close-up or a photo in a frame (a mock-up's detail panels) fills it.
    for (const p of parts) {
      const ids = new Set(p.ids);
      let filled = 0;
      for (let y = p.y0; y <= p.y1; y++) {
        let first = -1, last = -1;
        for (let x = p.x0; x <= p.x1; x++) if (ids.has(comp[y * w + x])) { if (first < 0) first = x; last = x; }
        if (first >= 0) filled += last - first + 1;
      }
      p.fill = filled / ((p.x1 - p.x0 + 1) * (p.y1 - p.y0 + 1));
      p.frame = p.fill > 0.92;
    }
    // The front and the back: named by their labels, else the two biggest garment-like shapes in reading order.
    for (const p of parts) if (p.role !== 'front' && p.role !== 'back') { p.role = null; p.label = ''; }
    const [a, b] = parts.filter((p) => !p.frame).sort((m, n) => n.area - m.area).slice(0, 2);
    const sideBySide = a && b && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5 * Math.min(a.y1 - a.y0, b.y1 - b.y0);
    const order = [a, b].filter(Boolean).sort((m, n) => (sideBySide ? m.x0 - n.x0 : m.y0 - n.y0));
    for (const role of ['front', 'back']) {
      if (parts.some((p) => p.role === role)) continue;
      const free = order.find((p) => !p.role);
      if (free) free.role = role;
    }
  }
  // An unnamed strip just above or below a named panel, as wide as most of it, belongs to that panel.
  for (const u of drawing ? [] : [...parts].filter((p) => !p.role).sort((a, b) => b.area - a.area)) {
    let best = null, bestGap = h * 0.03;
    for (const p of parts) {
      if (!p.role || p === u) continue;
      const overlap = Math.min(u.x1, p.x1) - Math.max(u.x0, p.x0);
      if (overlap < (u.x1 - u.x0) * 0.5) continue;
      const g = Math.max(u.y0 - p.y1, p.y0 - u.y1, 0);
      if (g <= bestGap) { best = p; bestGap = g; }
    }
    if (!best) continue;
    best.ids.push(...u.ids);
    best.area += u.area;
    best.x0 = Math.min(best.x0, u.x0); best.y0 = Math.min(best.y0, u.y0);
    best.x1 = Math.max(best.x1, u.x1); best.y1 = Math.max(best.y1, u.y1);
    u.merged = true;
  }
  parts = parts.filter((p) => !p.merged);
  // Each panel's outline: the outer edge of its shapes, joined across the thin lines between them.
  const mask = new Uint8Array(w * h);
  const panels = parts.map((p, n) => {
    mask.fill(0);
    const ids = new Set(p.ids);
    for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) if (ids.has(comp[y * w + x])) mask[y * w + x] = 1;
    // Close thin gaps across the panel (a white line above a cuff or hem band, whether it cuts the panel in two or
    // stops just short of one edge), so the outline runs round the outside and not into the gap. A drawing has no
    // such lines: its front's neck opening is opened instead.
    if (drawing) openNeck(mask, w, p);
    else {
      const most = Math.ceil(h * 0.03);
      for (let x = p.x0; x <= p.x1; x++) {
        let first = -1, last = -1;
        for (let y = p.y0; y <= p.y1; y++) if (mask[y * w + x]) { if (first < 0) first = y; last = y; }
        for (let y = first; first >= 0 && y <= last;) {
          if (mask[y * w + x]) { y++; continue; }
          let run = 0;
          while (y + run <= last && !mask[(y + run) * w + x]) run++;
          if (run <= most) for (let r = 0; r < run; r++) mask[(y + r) * w + x] = 1;
          y += run;
        }
      }
    }
    let sx = -1, sy = -1;
    for (let y = p.y0; y <= p.y1 && sy < 0; y++) for (let x = p.x0; x <= p.x1; x++) if (mask[y * w + x]) { sx = x; sy = y; break; }
    let outline = simplify(trace(mask, w, h, sx, sy), 0.7).map(([x, y]) => [(x + 0.5) / k, (y + 0.5) / k]);
    if (area2(outline) < 0) outline = outline.reverse();
    // A drawing's shape that fills its box (`frame`: a detail panel or a photo, not a garment).
    return { id: `p${n}`, role: p.role ?? 'none', label: p.label, x0: p.x0 / k, y0: p.y0 / k, x1: (p.x1 + 1) / k, y1: (p.y1 + 1) / k, outline, ...(drawing ? { frame: !!p.frame } : {}) };
  });
  // A drawing on a plain white page, or a photo mock-up (its lighting and folds are part of the print it gives).
  if (model) panels.plain = model.plain;
  return panels;
}

/**
 * A body panel's hem fold: a plain strip along its bottom edge, the full width, in a different colour from what is
 * above it (printed hem allowances are often a contrast colour; they are sewn inside, so they do not show). Returns
 * the page y where the visible garment ends, or null.
 */
export function hemFold(image, panel) {
  const w = Math.max(8, Math.round(panel.x1 - panel.x0)), h = Math.max(8, Math.round(panel.y1 - panel.y0));
  const k = Math.min(1, 400 / h), cw = Math.max(8, Math.round(w * k)), ch = Math.max(8, Math.round(h * k));
  const c = makeCanvas(cw, ch);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, panel.x0, panel.y0, w, h, 0, 0, cw, ch);
  const d = g.getImageData(0, 0, cw, ch).data;
  // Each row's colour over the middle 80 % of the panel, and how even it is.
  const row = (y) => {
    let r = 0, gg = 0, b = 0, n = 0;
    const x0 = Math.round(cw * 0.1), x1 = Math.round(cw * 0.9);
    for (let x = x0; x < x1; x++) { const i = (y * cw + x) * 4; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    r /= n; gg /= n; b /= n;
    let spread = 0;
    for (let x = x0; x < x1; x++) { const i = (y * cw + x) * 4; spread = Math.max(spread, Math.abs(d[i] - r), Math.abs(d[i + 1] - gg), Math.abs(d[i + 2] - b)); }
    return { c: [r, gg, b], spread };
  };
  const far = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  // From the bottom (skipping the edge's own soft pixels), the strip runs while rows stay even and alike.
  let y = ch - 3;
  const base = row(y);
  if (base.spread > 40) return null;
  let top = y;
  for (; top > ch * 0.88; top--) {
    const r = row(top - 1);
    if (r.spread > 40 || far(r.c, base.c) > 30) break;
  }
  const strip = (ch - top) / ch;
  if (strip < 0.008 || strip > 0.08) return null;
  const above = row(Math.max(0, top - 3));
  if (far(above.c, base.c) < 40) return null;
  return panel.y0 + (top / ch) * h;
}

/** Where a row of a panel starts and ends: the outline's leftmost and rightmost crossing of page height y. */
function rowSpan(outline, y) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    if ((a[1] <= y) === (b[1] <= y)) continue;
    const x = a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  return hi > lo ? [lo, hi] : null;
}

/**
 * Thin white lines printed right across a panel (as above a sleeve's band): their rows, [top, bottom] in page
 * pixels. A line is a few rows (up to 3.5 % of the panel's height) that are white nearly all the way across, with
 * print above and below.
 */
export function whiteLines(image, panel) {
  const x0 = Math.floor(panel.x0), y0 = Math.floor(panel.y0), w = Math.ceil(panel.x1) - x0, h = Math.ceil(panel.y1) - y0;
  const g = makeCanvas(w, h).getContext('2d', { willReadFrequently: true });
  g.drawImage(image, x0, y0, w, h, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const frac = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const span = rowSpan(panel.outline, y0 + y + 0.5);
    if (!span || span[1] - span[0] < 0.4 * w) { frac[y] = -1; continue; }
    const a = Math.max(0, Math.ceil(span[0] - x0) + 3), b = Math.min(w - 1, Math.floor(span[1] - x0) - 3);
    let white = 0;
    for (let x = a; x <= b; x++) {
      const i = (y * w + x) * 4;
      if (d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225) white++;
    }
    frac[y] = white / Math.max(1, b - a + 1);
  }
  const lines = [];
  for (let y = 0; y < h; y++) {
    if (frac[y] < 0.85) continue;
    let end = y;
    while (end + 1 < h && frac[end + 1] >= 0.85) end++;
    const thick = end - y + 1, above = frac[y - 3] ?? -1, below = frac[end + 3] ?? -1;
    if (thick >= 2 && thick <= 0.035 * h && above >= 0 && above < 0.3 && below >= 0 && below < 0.3) lines.push([y0 + y, y0 + end]);
    y = end;
  }
  return lines;
}

/**
 * The page with the white lines across the given panels joined up: the top half of each line takes the colour
 * just above it, the bottom half the colour just below, so the print either side meets with no white between.
 */
export function joinLines(image, panels) {
  const out = makeCanvas(image.width, image.height), g = out.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0);
  for (const panel of panels) {
    for (const [top, bottom] of whiteLines(image, panel)) {
      // The line's own soft edges too (one row either side).
      const y0 = top - 1, y1 = bottom + 1, mid = (top + bottom) / 2;
      const x0 = Math.floor(panel.x0), w = Math.ceil(panel.x1) - x0;
      const strip = g.getImageData(x0, y0 - 3, w, y1 - y0 + 7), d = strip.data, rows = strip.height;
      for (let r = 3; r < rows - 3; r++) {
        const y = y0 - 3 + r, span = rowSpan(panel.outline, y + 0.5);
        if (!span) continue;
        const from = (y <= mid ? 0 : rows - 1) * w;
        for (let x = Math.max(0, Math.ceil(span[0] - x0)); x <= Math.min(w - 1, Math.floor(span[1] - x0)); x++) {
          const i = (r * w + x) * 4, j = (from + x) * 4;
          d[i] = d[j]; d[i + 1] = d[j + 1]; d[i + 2] = d[j + 2]; d[i + 3] = 255;
        }
      }
      g.putImageData(strip, x0, y0 - 3);
    }
  }
  return out;
}

/**
 * Pocket marks on a shorts leg piece: thin straight bars in a colour of their own in the upper part of the piece
 * (factory layouts mark the side pockets' openings this way). Each as [[x, y], [x, y]] (its ends, page pixels).
 */
export function pocketMarks(image, panel) {
  const k = 3, x0 = Math.floor(panel.x0), y0 = Math.floor(panel.y0);
  const w = Math.ceil((panel.x1 - x0) / k), h = Math.ceil((panel.y1 - y0) / k);
  const g = makeCanvas(w, h).getContext('2d', { willReadFrequently: true });
  g.drawImage(image, x0, y0, w * k, h * k, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  // The piece's own colour: the most common one in its upper half.
  const counts = new Map();
  for (let y = Math.floor(h * 0.1); y < h * 0.5; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, key = (d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const base = [((top >> 8) & 15) * 16 + 8, ((top >> 4) & 15) * 16 + 8, (top & 15) * 16 + 8];
  // Pixels of another colour, inside the piece (not near its edge), in its upper 60 %.
  const inside = (x, y) => {
    const span = rowSpanAt(panel.outline, y0 + (y + 0.5) * k);
    return span && x0 + (x + 0.5) * k > span[0] + 30 && x0 + (x + 0.5) * k < span[1] - 30;
  };
  const mask = new Uint8Array(w * h);
  for (let y = Math.floor(h * 0.05); y < h * 0.6; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const far = Math.max(Math.abs(d[i] - base[0]), Math.abs(d[i + 1] - base[1]), Math.abs(d[i + 2] - base[2]));
      if (far > 70 && !(d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225) && inside(x, y)) mask[y * w + x] = 1;
    }
  }
  // Long thin pieces of that mask are the marks.
  const seen = new Uint8Array(w * h), marks = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start], pts = [];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      pts.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (pts.length < 12) continue;
    // Its main direction (principal axis) and how long / wide it is along and across that.
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
    let lo = Infinity, hi = -Infinity, wide = 0;
    for (const [x, y] of pts) { const a = (x - mx) * ux + (y - my) * uy; lo = Math.min(lo, a); hi = Math.max(hi, a); wide = Math.max(wide, Math.abs(-(x - mx) * uy + (y - my) * ux)); }
    const long = hi - lo;
    if (long < 0.06 * h || long < 5 * (2 * wide + 1)) continue;
    const end = (a) => [x0 + (mx + ux * a + 0.5) * k, y0 + (my + uy * a + 0.5) * k];
    marks.push({ ends: [end(lo), end(hi)], wide: (2 * wide + 1) * k, colour: base });
  }
  return marks;
}

/** rowSpan, for code above its definition. */
const rowSpanAt = (outline, y) => rowSpan(outline, y);

/**
 * The page with each leg piece's pocket marks drawn as side pocket openings, as on the made shorts: the mark painted
 * out in the piece's colour, then the opening: the side panel behind it in soft shadow, the dark gap, the lip (the
 * front panel's finished edge) catching the light with a row of stitching along it, and a bar-tack across each end.
 * `panel.side` ([waist, notch]: the piece's side line, where the 3D side seam goes; layout-warp.js panelSides) puts
 * the lip on the side away from the side seam, and a mark drawn just behind the side line (on the piece's back half)
 * is taken as the same opening mirrored onto the front: side pockets open at the front, as the client's mock-ups
 * show (same height, length, slant and distance from the side).
 */
export function drawPockets(image, panels) {
  const out = makeCanvas(image.width, image.height), g = out.getContext('2d');
  g.drawImage(image, 0, 0);
  const line = (p, q, width, style, dash = []) => {
    g.setLineDash(dash); g.lineWidth = width; g.strokeStyle = style;
    g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); g.setLineDash([]);
  };
  for (const panel of panels) {
    // Page pixels to the millimetre: the side line runs about 32 cm on the shorts (waist to the top of the split).
    const side = panel.side, mm = side ? Math.hypot(side[1][0] - side[0][0], side[1][1] - side[0][1]) / 320 : (panel.y1 - panel.y0) / 380;
    for (const { ends, wide, colour } of pocketMarks(image, panel)) {
      const [r, gg, bb] = colour, rgb = (f, al = 1) => `rgba(${Math.min(255, Math.round(r * f))},${Math.min(255, Math.round(gg * f))},${Math.min(255, Math.round(bb * f))},${al})`;
      g.lineCap = 'round';
      line(ends[0], ends[1], wide + 10, rgb(1));
      let [a, b] = ends[0][1] <= ends[1][1] ? ends : [ends[1], ends[0]];   // top end first
      let lip = null;
      if (side) {
        const [c, d] = side, l = Math.hypot(d[0] - c[0], d[1] - c[1]) || 1, k = panel.role === 'legL' ? -1 : 1;
        // Across the side line towards the front half: a left leg's is the piece's left half, a right leg's its right.
        const fx = (k * (d[1] - c[1])) / l, fy = (-k * (d[0] - c[0])) / l;
        const off = (p) => (p[0] - c[0]) * fx + (p[1] - c[1]) * fy;
        if (off(a) + off(b) < 0 && Math.max(-off(a), -off(b)) < 90 * mm) {
          const flip = (p) => { const t = 2 * off(p); return [p[0] - t * fx, p[1] - t * fy]; };
          a = flip(a); b = flip(b);
        }
        lip = off(a) + off(b) >= 0 ? [fx, fy] : [-fx, -fy];
      }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      // Across the opening, towards the lip.
      let lx = -uy, ly = ux;
      if (lip && lx * lip[0] + ly * lip[1] < 0) { lx = -lx; ly = -ly; }
      // A point `s` mm along the opening from its top end and `dd` mm across it (+ towards the lip).
      const at = (s, dd) => [a[0] + ux * s * mm + lx * dd * mm, a[1] + uy * s * mm + ly * dd * mm], L = len / mm;
      // The side panel behind the opening, in shadow: deepest at the gap, fading out over 16 mm, narrower at the ends.
      const shade = g.createLinearGradient(...at(L / 2, 0), ...at(L / 2, -16));
      shade.addColorStop(0, 'rgba(0,0,0,0.55)');
      shade.addColorStop(0.35, 'rgba(0,0,0,0.25)');
      shade.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = shade;
      g.beginPath(); g.moveTo(...at(0, 0.5)); g.lineTo(...at(L, 0.5)); g.lineTo(...at(L - 8, -16)); g.lineTo(...at(8, -16)); g.closePath(); g.fill();
      // The gap.
      line(at(0, -0.6), at(L, -0.6), 3.4 * mm, 'rgba(0,0,0,0.5)');
      line(at(0.5, -0.4), at(L - 0.5, -0.4), 1.9 * mm, 'rgba(0,0,0,0.88)');
      // The lip: its rolled edge catching the light, then easing back to the cloth.
      line(at(0.8, 3.4), at(L - 0.8, 3.4), 2.6 * mm, rgb(1.22, 0.55));
      line(at(0.6, 1.5), at(L - 0.6, 1.5), 1.5 * mm, rgb(1.75));
      // A row of stitching along the lip.
      line(at(4, 7.4), at(L - 4, 7.4), 0.95 * mm, 'rgba(0,0,0,0.35)', [2.4 * mm, 1.6 * mm]);
      line(at(4, 7.1), at(L - 4, 7.1), 0.7 * mm, rgb(2.3, 0.6), [2.4 * mm, 1.6 * mm]);
      // Bar-tacks across both ends.
      for (const s of [0.6, L - 0.6]) {
        line(at(s + 0.4, -1.6), at(s + 0.4, 8), 2.4 * mm, 'rgba(0,0,0,0.35)');
        line(at(s, -1.6), at(s, 8), 1.5 * mm, rgb(2.1, 0.8));
      }
    }
  }
  g.lineCap = 'butt';
  return out;
}

/** The outline cut off below page height y (the part kept above it, closed by a straight line). */
export function cutBelow(outline, y) {
  const out = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const ain = a[1] <= y, bin = b[1] <= y;
    if (ain) out.push(a);
    if (ain !== bin) { const t = (y - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, y]); }
  }
  return out;
}

let styled = false;
function addStyles() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
.lay-check{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;background:#040a12f2;color:#dbe7f0;font:13px Inter,system-ui,sans-serif;-webkit-user-select:none;user-select:none}
.lay-head{padding:14px 16px 6px}.lay-head b{display:block;color:#12e1f0;font-size:15px;letter-spacing:.04em}.lay-head p{margin:4px 0 0;color:#9fb2c4;line-height:1.45}
.lay-grid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:8px 16px 12px;align-content:start}
.lay-card{border:1px solid #1d3a4c;border-radius:10px;background:#07131f;padding:8px;display:flex;flex-direction:column;gap:6px}
.lay-card canvas{width:100%;height:110px;object-fit:contain;background:#ffffff;border-radius:6px}
.lay-card small{color:#7f93a6;font-size:11px;min-height:14px}
.lay-card select{width:100%;padding:6px;border-radius:7px;border:1px solid #23506a;background:#06192a;color:#e8f4fb;font:inherit}
.lay-card.none{opacity:.6}.lay-card.dup select{border-color:#e5484d}
.lay-note{margin:0 16px;color:#ffb4a8;min-height:16px;font-size:12px}
.lay-fold{display:flex;gap:8px;align-items:flex-start;margin:0 16px 6px;color:#cfe3ee;font-size:12.5px;line-height:1.4}.lay-fold[hidden]{display:none}.lay-fold input{margin-top:2px;accent-color:#12e1f0}
.lay-warn{color:#ffd28a!important;font-weight:600}.lay-garment{align-items:center}.lay-garment select{padding:6px 8px;border-radius:7px;border:1px solid #23506a;background:#06192a;color:#e8f4fb;font:inherit}
.lay-buttons{display:flex;gap:10px;justify-content:flex-end;padding:10px 16px 14px;border-top:1px solid #1d3a4c}
.lay-buttons button{padding:9px 16px;border-radius:20px;border:1px solid #23506a;background:#06192a;color:#dbe7f0;font:600 13px Inter,system-ui,sans-serif;cursor:pointer}
.lay-buttons .go{border:0;color:#02131c;background:linear-gradient(110deg,#12e1f0,#2f80ff)}
.lay-buttons button:disabled{opacity:.45;cursor:default}`;
  document.head.append(s);
}

/** A panel cut out of the page, on white, `size` pixels on its longer side; `dots`: points (page pixels) marked on it. */
function thumbnail(image, panel, size = 220, dots = []) {
  const w = panel.x1 - panel.x0, h = panel.y1 - panel.y0, k = size / Math.max(w, h);
  const c = makeCanvas(w * k, h * k);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(image, panel.x0, panel.y0, w, h, 0, 0, c.width, c.height);
  g.strokeStyle = '#12e1f0';
  g.lineWidth = 2;
  g.beginPath();
  panel.outline.forEach(([x, y], i) => (i ? g.lineTo((x - panel.x0) * k, (y - panel.y0) * k) : g.moveTo((x - panel.x0) * k, (y - panel.y0) * k)));
  g.closePath();
  g.stroke();
  g.fillStyle = '#ffd400';
  for (const [x, y] of dots) { g.beginPath(); g.arc((x - panel.x0) * k, (y - panel.y0) * k, 3.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
  return c;
}

/** The parts of a garment drawing (layout.js findPanels `drawing`). */
export const DRAWING_ROLES = { front: 'Front', back: 'Back', none: 'Not used' };

/**
 * The check screen over the 3D view: each panel found, named from its label; any name can be changed. Resolves with
 * {roles: each panel's name in the order found, fold: the hem fold strips are cut off, join: the white lines across
 * the sleeves are joined up}, or null when cancelled.
 * A garment drawing (`drawing`): its front and back are checked instead, with the garment it is ({value: name} in
 * `garments`, `garment` chosen first) and its corners (`dots`: each panel's, page pixels) marked; resolves with
 * {roles, garment}.
 */
export function confirmPanels(image, panels, fileName = 'Print layout', { drawing = false, garments = {}, garment = null, dots = [], usable = [], warning = '', remark = '' } = {}) {
  addStyles();
  // Which panels end in a hem fold strip, and which have a white line across (each choice is shown while a panel
  // it applies to has one).
  const folds = panels.map((p) => !drawing && hemFold(image, p) != null);
  const lines = panels.map((p) => !drawing && whiteLines(image, p).length > 0);
  const names = drawing ? DRAWING_ROLES : ROLE_NAMES, safe = (s) => String(s).replace(/[<>&"]/g, '');
  const intro = drawing
    ? `<b>DESIGN PICTURE · ${safe(fileName)}</b>${warning ? `<p class="lay-warn">${safe(warning)}</p>` : ''}<p>Your design goes onto the 3D kit exactly as drawn: the front onto the front, the back onto the back, edge to edge. Check which is which and the garment, then put it on. The same picture always gives the same kit.${remark ? ` ${safe(remark)}` : ''}</p>`
    : `<b>PRINT LAYOUT · ${safe(fileName)}</b><p>${panels.length} panel${panels.length === 1 ? '' : 's'} found. Check what each one is, then put the layout on the 3D kit. The same file always gives the same kit.</p>`;
  const choice = drawing ? `<label class="lay-fold lay-garment">Garment <select>${Object.entries(garments).map(([v, n]) => `<option value="${safe(v)}"${v === garment ? ' selected' : ''}>${safe(n)}</option>`).join('')}</select></label>` : '';
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'lay-check';
    box.setAttribute('role', 'dialog');
    box.innerHTML = `<div class="lay-head">${intro}</div><div class="lay-grid"></div>${choice}<label class="lay-fold" hidden><input type="checkbox" checked> The plain strip along the bottom of the body panels is the hem fold (sewn inside, so it does not show)</label><label class="lay-fold lay-lines" hidden><input type="checkbox" checked> Join the sleeve bands to the sleeves (leave out the white line between them)</label><p class="lay-note"></p><div class="lay-buttons"><button type="button" class="no">Cancel</button><button type="button" class="go">Put on the 3D kit</button></div>`;
    const grid = box.querySelector('.lay-grid'), note = box.querySelector('.lay-note'), go = box.querySelector('.go'), fold = box.querySelector('.lay-fold:not(.lay-garment)'), join = box.querySelector('.lay-lines');
    const selects = panels.map((p, i) => {
      const card = document.createElement('div');
      card.className = 'lay-card';
      card.append(thumbnail(image, p, 220, dots[i] ?? []));
      const small = document.createElement('small');
      small.textContent = drawing ? (usable[i] === false ? 'Not a garment shape' : p.role === 'none' ? 'Not part of the garment?' : `The ${p.role} of the garment`) : p.label ? `Label: ${p.label}` : 'No label found';
      const sel = document.createElement('select');
      sel.innerHTML = Object.entries(names).map(([v, n]) => `<option value="${v}"${v === p.role ? ' selected' : ''}>${n}</option>`).join('');
      card.append(small, sel);
      grid.append(card);
      return { sel, card };
    });
    const check = () => {
      const counts = {};
      for (const { sel } of selects) counts[sel.value] = (counts[sel.value] ?? 0) + 1;
      let dup = false;
      for (const { sel, card } of selects) {
        const d = sel.value !== 'none' && counts[sel.value] > 1;
        dup ||= d;
        card.classList.toggle('dup', d);
        card.classList.toggle('none', sel.value === 'none');
      }
      const top = counts.front || counts.back, legs = counts.legL || counts.legR;
      // A drawing's front and back must be garment shapes (not a detail panel, a photo or the background).
      const odd = drawing && selects.some(({ sel }, i) => (sel.value === 'front' || sel.value === 'back') && usable[i] === false);
      note.textContent = dup ? (drawing ? 'Two pictures are named the same: one front and one back.' : 'Two panels have the same name: each part can have one panel only.')
        : !top && !legs ? (drawing ? 'Name the front or the back of the garment.' : 'Name at least one panel (a body panel or a shorts leg).')
          : odd ? 'A shape named front or back is not a garment shape: name only the garment’s front and back.' : '';
      go.disabled = dup || (!top && !legs) || odd;
      fold.hidden = !selects.some(({ sel }, i) => (sel.value === 'front' || sel.value === 'back') && folds[i]);
      join.hidden = !selects.some(({ sel }, i) => (sel.value === 'sleeveL' || sel.value === 'sleeveR') && lines[i]);
    };
    selects.forEach(({ sel }) => sel.addEventListener('change', check));
    check();
    const done = (value) => { box.remove(); resolve(value); };
    box.querySelector('.no').onclick = () => done(null);
    go.onclick = () => done(drawing
      ? { roles: selects.map(({ sel }) => sel.value), garment: box.querySelector('.lay-garment select')?.value ?? garment }
      : { roles: selects.map(({ sel }) => sel.value), fold: fold.querySelector('input').checked, join: !join.hidden && join.querySelector('input').checked });
    document.body.append(box);
  });
}
