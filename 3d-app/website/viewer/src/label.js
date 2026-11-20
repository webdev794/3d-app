import * as THREE from 'three';
import { BRAND_MARK, BRAND_WORDMARK } from './brandmarks.js';

/** The neck label's size (metres) and how far below the back neck's edge it starts (under the collar rib). */
const LABEL_W = 0.056, LABEL_H = 0.046, LABEL_DROP = 0.013;
/** The netball dress's own: a small dark woven label, as inside the back neck of the client's dress (ND1). */
const SMALL = { W: 0.024, H: 0.011, DROP: 0.009 };

/**
 * The 3DEEZI neck label sewn inside the back neck of a top, centred just under the collar: a light fabric label,
 * curved with the back, a few millimetres inside it (so it never shows through to the outside), facing in. It is
 * seen from the front through the neck opening. Returns the mesh; its picture is drawn by paintLabel.
 */
export function buildLabel(garment) {
  const small = garment.kind === 'netball-dress';
  const { W, H, DROP } = small ? SMALL : { W: LABEL_W, H: LABEL_H, DROP: LABEL_DROP };
  // The back neck's middle: the point of the neck opening at the back nearest the centre line.
  const back = garment.neck.filter((p) => p.z < 0);
  const top = back.reduce((best, p) => (Math.abs(p.x) < Math.abs(best.x) ? p : best), back[0]);
  const y0 = top.y - DROP;
  // The back as worn (with its raised neckline) at a point of the label: of the fabric at about that height, the part
  // nearest the front (the label lies inside all of it, never behind it).
  const zAt = (x, y) => {
    let z = -Infinity, near = null;
    for (let py = garment.frame.maxY; py > garment.frame.maxY - 0.25; py -= 0.0005) {
      const v = garment.surface(x, py, true), d = Math.abs(v.y - y);
      if (d < 0.003) z = Math.max(z, v.z);
      if (!near || d < near.d) near = { d, z: v.z };
    }
    return z > -Infinity ? z : near.z;
  };
  const cols = 29, rows = 13, positions = [], uvs = [], indices = [];
  // It hangs straight down from its seam: each column at the fabric's frontmost point along it.
  const xAt = (c) => -W / 2 + (W * c) / (cols - 1), yAt = (r) => y0 - (H * r) / (rows - 1);
  // The made fabric too (its creases and seams), wherever it is near the column.
  const pos = garment.geometry.getAttribute('position'), lo = y0 - H - 0.004;
  const made = (x) => {
    let z = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const vz = pos.getZ(i), vy = pos.getY(i);
      if (vz < 0 && vy > lo && vy < y0 + 0.004 && Math.abs(pos.getX(i) - x) < 0.006) z = Math.max(z, vz);
    }
    return z;
  };
  const hang = [...Array(cols).keys()].map((c) => Math.max(made(xAt(c)), ...[...Array(rows).keys()].map((r) => zAt(xAt(c), yAt(r)))));
  // A lone spike (a single point of the centre line, 2 mm wide) would fold the label: it lies over its neighbours.
  const smooth = hang.map((z, c) => (c > 0 && c < cols - 1 ? Math.min(z, Math.max(hang[c - 1], hang[c + 1]) + 0.002) : z));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Inside the back (towards the front: +z), clear of the fabric and its creases.
      positions.push(xAt(c), yAt(r), smooth[c] + 0.0035);
      uvs.push(c / (cols - 1), 1 - r / (rows - 1));
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const canvas = document.createElement('canvas');
  canvas.width = 560; canvas.height = 460;
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map, roughness: 0.92, side: THREE.FrontSide }));
  mesh.userData.size = null;
  mesh.userData.dark = small;
  return mesh;
}

/**
 * Draws the label: 3DEEZI and "AI SPORTSWEAR DESIGNER" in dark lettering on light fabric, and the size below.
 * `style` 'mark': a black label with the cyan 3DEEZI "3" (the compression top's picture, DT4).
 */
export function paintLabel(label, size = 'L', style = 'word') {
  if (label.userData.size === size && label.userData.style === style) return;
  label.userData.size = size;
  label.userData.style = style;
  const map = label.material.map, c = map.image, g = c.getContext('2d'), w = c.width, h = c.height;
  // The netball dress's small dark label: 3DEEZI in light grey on dark grey, stitched across its ends.
  // (FN11 2026-11-02: style 'dark' (a tile look's design.zoneColors.labelDark) gives the same small dark label.)
  if (label.userData.dark || style === 'dark') {
    g.fillStyle = '#2e3034';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 0; y < h; y += 10) g.fillRect(0, y, w, 3);
    g.fillStyle = '#c3c7cc';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(1, 2.2);
    g.font = '700 150px Rajdhani, Inter, sans-serif';
    g.fillText('3DEEZI', 0, 0);
    g.restore();
    map.needsUpdate = true;
    return;
  }
  if (style === 'mark') {
    // (FM print 2026-10-30: a plain black label, about the inside's own black seen in the neck, with a sharp wide
    // italic "3" running from cyan at the top to blue at the foot, as the picture's.)
    g.fillStyle = '#161719';
    g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.save();
    // In the label's upper part, so it shows above the front of the collar.
    g.translate(w / 2, h * 0.34);
    g.transform(1.55, 0, -0.5, 0.9, 0, 0);
    const ink = g.createLinearGradient(0, -80, 0, 80);
    ink.addColorStop(0, '#22d2ff');
    ink.addColorStop(1, '#1466e6');
    g.fillStyle = ink;
    g.font = '700 210px Rajdhani, Inter, sans-serif';
    g.fillText('3', 0, 0);
    g.restore();
    map.needsUpdate = true;
    return;
  }
  g.fillStyle = '#e6e7e9';
  g.fillRect(0, 0, w, h);
  // A faint woven texture and the stitching across the top and bottom.
  g.fillStyle = 'rgba(0,0,0,0.035)';
  for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
  g.strokeStyle = 'rgba(40,44,50,0.35)';
  g.lineWidth = 3;
  g.setLineDash([12, 9]);
  for (const y of [16, h - 16]) { g.beginPath(); g.moveTo(10, y); g.lineTo(w - 10, y); g.stroke(); }
  g.setLineDash([]);
  g.fillStyle = '#1c2026';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.save();
  g.translate(w / 2, 150);
  g.transform(1, 0, -0.18, 1, 0, 0);
  g.font = '700 128px Rajdhani, Inter, sans-serif';
  g.fillText('3DEEZI', 0, 0);
  g.restore();
  g.font = '700 33px Rajdhani, Inter, sans-serif';
  g.fillText('AI SPORTSWEAR DESIGNER', w / 2, 200);
  g.font = '700 160px Rajdhani, Inter, sans-serif';
  g.fillText(String(size).toUpperCase().slice(0, 4), w / 2, 395);
  map.needsUpdate = true;
}

/**
 * A print's main colour: the commonest colour of a panel of the page (inside its outline), so a black shirt with red
 * patterns is black, not the dark red an average would give. For the garment's inside.
 */
export function mainColour(image, panel) {
  const w = 64, h = 64, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, panel.x0, panel.y0, panel.x1 - panel.x0, panel.y1 - panel.y0, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const sx = w / (panel.x1 - panel.x0), sy = h / (panel.y1 - panel.y0);
  const P = panel.outline.map(([x, y]) => [(x - panel.x0) * sx, (y - panel.y0) * sy]);
  const inside = (x, y) => {
    let hit = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [xi, yi] = P[i], [xj, yj] = P[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const bins = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x + 0.5, y + 0.5)) continue;
    const i = (y * w + x) * 4, key = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
    const bin = bins.get(key) ?? [0, 0, 0, 0];
    bin[0] += d[i]; bin[1] += d[i + 1]; bin[2] += d[i + 2]; bin[3]++;
    bins.set(key, bin);
  }
  const top = [...bins.values()].sort((a, b) => b[3] - a[3])[0];
  if (!top) return null;
  return `#${top.slice(0, 3).map((v) => Math.round(v / top[3]).toString(16).padStart(2, '0')).join('')}`;
}

// ---------- the 3DEEZI mark printed under the back collar of a customer's own design (QD 2026-11-04)
/**
 * Its place (metres): its top `GAP` under the collar rib, else lowered in `DROP` steps (up to `TRIES` places) past a
 * printed collar band or anything else there; the print round it checked `PAD` wider; sampled every `STEP`; `LIFT` how far
 * outside the fabric it lies; `PX` its picture's pixels a metre.
 */
const NECK_PRINT = { GAP: 0.007, DROP: 0.002, TRIES: 12, PAD: 0.003, STEP: 0.001, LIFT: 0.0007, PX: 11600 };
/**
 * Its two lockups, `W` x `H` (whole millimetres, even): a small printed label, the "3" over the 3DEEZI word 92 % as wide
 * (as the Rugby League crest's, texture.js crestWord); and where the room under the collar is shallower (a team name
 * close under it), one line, the "3" beside the word.
 */
const NECK_LOCKUPS = [{ name: 'label', W: 0.044, H: 0.036 }, { name: 'line', W: 0.054, H: 0.01 }];
/** Its flat inks where the brand's own colours would not read: on a light print near black, on a mid blue white. */
const NECK_INKS = { white: '#f4f7fa', dark: '#15181d' };

/**
 * The 3DEEZI mark printed on the outside of the back, just under the collar, on a customer's own design (a design picture
 * or a print layout on the kit: the AI Designer's and Artwork to 3D's kits). It is its own small mesh lying on the fabric a
 * hair outside it, so it stays crisp at any zoom and the customer's print is never changed; shaded as the fabric under it,
 * never picked by a tap. Here the fabric under the strip below the collar is found once per kit (`shape`: the garment's
 * geometry as drawn, `neck`: its neck points, `rim`: the collar rib); placeNeckPrint puts the mark on its place. Returns
 * the mesh (hidden until placed), or null with no back neck to put it under.
 */
export function buildNeckPrint(shape, neck, rim) {
  const { GAP, DROP, TRIES, PAD, STEP } = NECK_PRINT;
  const W = Math.max(...NECK_LOCKUPS.map((l) => l.W)), H = Math.max(...NECK_LOCKUPS.map((l) => l.H));
  const half = W / 2 + PAD, near = (x) => Math.abs(x) <= half;
  // The collar's lowest point on the back over the mark's width: the rib's (else the neck edge's).
  let top = Infinity;
  const rib = rim?.visible ? rim.geometry.getAttribute('position') : null;
  if (rib) for (let i = 0; i < rib.count; i++) if (rib.getZ(i) < 0 && near(rib.getX(i))) top = Math.min(top, rib.getY(i));
  if (!Number.isFinite(top)) for (const p of neck ?? []) if (p.z < 0 && near(p.x)) top = Math.min(top, p.y);
  if (!Number.isFinite(top)) return null;
  // The strip sampled every millimetre: from just above the highest place to just below the lowest.
  const cols = Math.round((2 * half) / STEP) + 1, rows = Math.round((PAD + (TRIES - 1) * DROP + H + PAD) / STEP) + 1;
  const yTop = top - GAP + PAD, yLow = yTop - (rows - 1) * STEP;
  // The fabric's triangles that can lie under it, seen from behind (corners x, y, z; uv; shade).
  const pos = shape.getAttribute('position'), uv = shape.getAttribute('uv'), shade = shape.getAttribute('color');
  const index = shape.index?.array, count = index ? index.length : pos.count, tris = [];
  for (let t = 0; t < count; t += 3) {
    const a = index ? index[t] : t, b = index ? index[t + 1] : t + 1, c = index ? index[t + 2] : t + 2;
    const xa = pos.getX(a), xb = pos.getX(b), xc = pos.getX(c);
    if (Math.max(xa, xb, xc) < -half || Math.min(xa, xb, xc) > half) continue;
    const ya = pos.getY(a), yb = pos.getY(b), yc = pos.getY(c), lo = Math.min(ya, yb, yc), hi = Math.max(ya, yb, yc);
    if (hi < yLow || lo > yTop) continue;
    tris.push({ k: [a, b, c], xs: [xa, xb, xc], ys: [ya, yb, yc], lo, hi, zs: [pos.getZ(a), pos.getZ(b), pos.getZ(c)] });
  }
  // Each sample: the outermost fabric behind it (the back faces -z, so the lowest z), its print point and its shade.
  const hits = new Array(cols * rows).fill(null);
  for (let r = 0; r < rows; r++) {
    const y = yTop - r * STEP, row = tris.filter((t) => t.lo <= y + 1e-9 && t.hi >= y - 1e-9);
    for (let c = 0; c < cols; c++) {
      const x = -half + c * STEP;
      let best = null;
      for (const { k, xs: [x1, x2, x3], ys: [y1, y2, y3], zs } of row) {
        const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
        if (Math.abs(det) < 1e-12) continue;
        const l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det, l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det, l3 = 1 - l1 - l2;
        if (l1 < -1e-7 || l2 < -1e-7 || l3 < -1e-7) continue;
        const z = l1 * zs[0] + l2 * zs[1] + l3 * zs[2];
        if (best && z >= best.z) continue;
        const mix = (a) => l1 * a.getX(k[0]) + l2 * a.getX(k[1]) + l3 * a.getX(k[2]);
        best = { z, u: mix(uv), v: l1 * uv.getY(k[0]) + l2 * uv.getY(k[1]) + l3 * uv.getY(k[2]), shade: shade ? mix(shade) : 1 };
      }
      hits[r * cols + c] = best;
    }
  }
  const material = new THREE.MeshStandardMaterial({ transparent: true, premultipliedAlpha: true, depthWrite: false, roughness: 0.62, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.visible = false;
  // A tap there is on the fabric under it (colour picking and the 2D board read the fabric's print).
  mesh.raycast = () => {};
  mesh.userData.neckPrint = { hits, cols, rows, yTop, half, lockup: null, shaped: null, row: null, ink: null };
  return mesh;
}

/**
 * Puts the 3DEEZI mark (buildNeckPrint) on the first plain place under the collar: as a small label, else on one line, in
 * an ink that reads on the print there (the brand's own colours on a dark print, else white or near black). Where the
 * print under every place is busy (the customer's artwork: lettering, a logo, a printed collar band too deep to clear) it
 * is hidden: it never covers it. `print`: the part's print canvas, painted; `taken(px, py)`: whether a print pixel holds
 * one of the customer's own objects (a plain one too), which it never goes on either. Returns whether it shows.
 */
export async function placeNeckPrint(mesh, print, taken = () => false) {
  const { DROP, TRIES, PAD, STEP } = NECK_PRINT, n = mesh.userData.neckPrint, { hits, cols, half } = n;
  const shown = (on) => { mesh.visible = on; return on; };
  // The print's colour at every sample: one read of the pixels round them.
  const at = hits.map((h) => (h ? [h.u * print.width, (1 - h.v) * print.height] : null)), on = at.filter(Boolean);
  if (!on.length) return shown(false);
  const x0 = Math.max(0, Math.floor(Math.min(...on.map((p) => p[0])))), y0 = Math.max(0, Math.floor(Math.min(...on.map((p) => p[1]))));
  const w = Math.min(print.width, Math.ceil(Math.max(...on.map((p) => p[0]))) + 1) - x0, h = Math.min(print.height, Math.ceil(Math.max(...on.map((p) => p[1]))) + 1) - y0;
  let data;
  try { data = print.getContext('2d').getImageData(x0, y0, w, h).data; } catch { return shown(false); }
  const colour = at.map((p) => {
    if (!p) return null;
    const i = (Math.min(h - 1, Math.floor(p[1]) - y0) * w + Math.min(w - 1, Math.floor(p[0]) - x0)) * 4;
    return taken(p[0], p[1]) ? 'taken' : [data[i], data[i + 1], data[i + 2]];
  });
  const pad = Math.round(PAD / STEP), drop = Math.round(DROP / STEP);
  for (const lockup of NECK_LOCKUPS) {
    const tall = Math.round(lockup.H / STEP), c0 = Math.round((half - lockup.W / 2 - PAD) / STEP);
    for (let k = 0; k < TRIES; k++) {
      // The place and the print round it: all on the fabric, none of it the customer's own objects, and at most 2.5 %
      // of it far from its middle colour.
      const list = [];
      let off = false;
      for (let r = k * drop; r <= k * drop + 2 * pad + tall && !off; r++) {
        for (let c = c0; c < cols - c0; c++) {
          const v = colour[r * cols + c];
          if (!v || v === 'taken') { off = true; break; }
          list.push(v);
        }
      }
      if (off) continue;
      const mid = [0, 1, 2].map((ch) => list.map((v) => v[ch]).sort((a, b) => a - b)[list.length >> 1]);
      const far = list.filter((v) => Math.max(Math.abs(v[0] - mid[0]), Math.abs(v[1] - mid[1]), Math.abs(v[2] - mid[2])) > 64).length;
      if (far > 0.025 * list.length) continue;
      if (!(await inkNeckPrint(mesh, lockup, neckInk(mid)))) return shown(false);
      shapeNeckPrint(mesh, lockup, k * drop + pad);
      return shown(true);
    }
  }
  return shown(false);
}

/** The mark's mesh, `lockup` with its top at sample row `top`: every second sample, a hair outside the fabric, in its shade. */
function shapeNeckPrint(mesh, lockup, top) {
  const n = mesh.userData.neckPrint;
  if (n.row === top && n.shaped === lockup.name) return;
  n.row = top;
  n.shaped = lockup.name;
  const { STEP, LIFT } = NECK_PRINT, { W, H } = lockup, every = 2, c0 = Math.round((n.half - W / 2) / STEP);
  const gc = Math.round(W / STEP / every) + 1, gr = Math.round(H / STEP / every) + 1, positions = [], uvs = [], colours = [], indices = [];
  for (let r = 0; r < gr; r++) {
    for (let c = 0; c < gc; c++) {
      const row = top + r * every, hit = n.hits[row * n.cols + c0 + c * every];
      positions.push(-W / 2 + c * every * STEP, n.yTop - row * STEP, hit.z - LIFT);
      // Seen from behind, the wearer's left (+x) is on the viewer's left: the picture's left edge there.
      uvs.push(1 - c / (gc - 1), 1 - r / (gr - 1));
      colours.push(hit.shade, hit.shade, hit.shade);
    }
  }
  for (let r = 0; r < gr - 1; r++) {
    for (let c = 0; c < gc - 1; c++) {
      const a = r * gc + c, b = a + 1, d = a + gc, e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  mesh.geometry.dispose();
  mesh.geometry = geometry;
}

/** The ink that reads on a print colour [r, g, b] (contrast as WCAG's): the brand's own colours, white, or near black. */
function neckInk([r, g, b]) {
  const lin = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const lum = (R, G, B) => 0.2126 * lin(R) + 0.7152 * lin(G) + 0.0722 * lin(B);
  const L = lum(r, g, b), contrast = (o) => (Math.max(L, o) + 0.05) / (Math.min(L, o) + 0.05);
  // The word's cyan "EEZI" and the silver "3D" both read: the brand's own colours.
  if (contrast(lum(0, 216, 255)) >= 2.6 && contrast(lum(223, 230, 238)) >= 3) return 'colour';
  return contrast(1) >= 3 ? 'white' : 'dark';
}

/** The "3" and the word, crisp as printed (their soft glow taken off, as texture.js pictureBrand), loaded once. */
let neckBrand = null;
function neckPictures() {
  const crisp = (img) => {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height), p = data.data;
    for (let i = 3; i < p.length; i += 4) p[i] = p[i] < 110 ? 0 : p[i] > 190 ? 255 : Math.round(((p[i] - 110) / 80) * 255);
    g.putImageData(data, 0, 0);
    return c;
  };
  return (neckBrand ??= Promise.all([BRAND_MARK, BRAND_WORDMARK].map((src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(crisp(img));
    img.onerror = () => resolve(null);
    img.src = src;
  }))));
}

/**
 * Draws the mark as `lockup` in `ink` ('colour', 'white' or 'dark') on its own picture: the label (the "3" across it, the
 * word under it) or the line (the "3", then the word beside it, centred). false: the brand pictures could not be read.
 */
async function inkNeckPrint(mesh, lockup, ink) {
  const n = mesh.userData.neckPrint;
  if (n.ink === ink && n.lockup === lockup.name) return true;
  const [mark, word] = await neckPictures();
  if (!mark || !word) return false;
  // Its own picture at the lockup's size (a new one when the lockup changes).
  let map = mesh.material.map;
  if (n.lockup !== lockup.name) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(lockup.W * NECK_PRINT.PX);
    canvas.height = Math.round(lockup.H * NECK_PRINT.PX);
    map?.dispose();
    map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.premultiplyAlpha = true;
    mesh.material.map = map;
    mesh.material.needsUpdate = true;
  }
  n.ink = ink;
  n.lockup = lockup.name;
  const c = map.image, g = c.getContext('2d'), w = c.width, h = c.height;
  // One picture at its place, in the brand's own colours or flat in one ink.
  const put = (img, x, y, iw, ih) => {
    if (ink === 'colour') { g.drawImage(img, x, y, iw, ih); return; }
    const t = document.createElement('canvas');
    t.width = Math.ceil(iw);
    t.height = Math.ceil(ih);
    const tg = t.getContext('2d');
    tg.drawImage(img, 0, 0, t.width, t.height);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = NECK_INKS[ink];
    tg.fillRect(0, 0, t.width, t.height);
    g.drawImage(t, x, y, iw, ih);
  };
  g.clearRect(0, 0, w, h);
  if (lockup.name === 'label') {
    const mh = (w * mark.height) / mark.width, gap = w * 0.04, ww = w * 0.92, wh = (ww * word.height) / word.width, top = (h - (mh + gap + wh)) / 2;
    put(mark, 0, top, w, mh);
    put(word, (w - ww) / 2, top + mh + gap, ww, wh);
  } else {
    // The "3" the line's height, the word about half of it, a quarter of the height between; all fitted in and centred.
    const mw = (h * mark.width) / mark.height, wh = h * 0.52, ww = (wh * word.width) / word.height, gap = h * 0.28;
    const k = Math.min(1, w / (mw + gap + ww)), x = (w - k * (mw + gap + ww)) / 2;
    put(mark, x, (h - k * h) / 2, k * mw, k * h);
    put(word, x + k * (mw + gap), (h - k * wh) / 2, k * ww, k * wh);
  }
  map.needsUpdate = true;
  return true;
}
