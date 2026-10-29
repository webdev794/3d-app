import * as THREE from 'three';

/** The neck label's size (metres) and how far below the back neck's edge it starts (under the collar rib). */
const W = 0.056, H = 0.046, DROP = 0.013;

/**
 * The 3DEEZI neck label sewn inside the back neck of a top, centred just under the collar: a light fabric label,
 * curved with the back, a few millimetres inside it (so it never shows through to the outside), facing in. It is
 * seen from the front through the neck opening. Returns the mesh; its picture is drawn by paintLabel.
 */
export function buildLabel(garment) {
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
  if (style === 'mark') {
    g.fillStyle = '#1b1c1f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
    g.fillStyle = '#16b4f0';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.save();
    // In the label's upper part, so it shows above the front of the collar.
    g.translate(w / 2, h * 0.34);
    g.transform(1, 0, -0.22, 1, 0, 0);
    g.font = '700 230px Rajdhani, Inter, sans-serif';
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
