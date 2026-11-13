import * as THREE from 'three';
import { BRAND_MARK, BRAND_WORDMARK } from './brandmarks.js';

// The pop-up marquee (Signage & Marquees, client mockups 297 / 298, 2026-11-02): a peaked square roof, printed
// valances, an aluminium frame with legs and optional walls (a half wall too). Real sizes in metres (3 x 3 m or
// 3 x 6 m). Every printable zone has its own flat print area (a canvas), as a garment's panels: the roof is laid out
// as seen from above, a valance or a wall as seen from outside (the back wall from inside, as it faces the front).

/** The printable zones, in the Studio's order. */
export const ZONES = ['roof', 'valanceFront', 'valanceBack', 'valanceLeft', 'valanceRight', 'wallLeft', 'wallRight', 'wallBack'];
export const ZONE_LABEL = {
  roof: 'Roof', valanceFront: 'Front valance', valanceBack: 'Back valance', valanceLeft: 'Left valance', valanceRight: 'Right valance',
  wallLeft: 'Left wall', wallRight: 'Right wall', wallBack: 'Back wall',
};
/** The two sizes: frame width (front) x depth, metres. */
export const SIZES = { '3x3': { w: 3, d: 3 }, '3x6': { w: 6, d: 3 } };
/** The frame's height to the eaves, the roof's rise, the valance's drop and a half wall's height (metres). */
export const EAVE = 2.1, RISE = 0.85, VALANCE = 0.26, HALF = 1.0, OVERHANG = 0.035;
export const PATTERNS = ['Solid', 'Blades', 'Velocity', 'Chevron', 'Stripes', 'Diagonal', 'Hoops', 'Dots', 'Camo', 'Tribal'];
const HEX = /^#[0-9a-f]{6}$/i;

/** Which walls the marquee has: 'none' (roof only), 'back' or 'full' (back, left and right); `half`: a half wall on the left. */
export function wallsOf(design) {
  const walls = design?.walls === 'none' || design?.walls === 'full' ? design.walls : 'back';
  const full = walls === 'full';
  return {
    wallBack: walls !== 'none' ? 'full' : null,
    wallLeft: full ? 'full' : design?.halfWall ? 'half' : null,
    wallRight: full ? 'full' : null,
  };
}

/** A zone's print area in metres {w, h} (null when the marquee has no such wall). */
export function zoneSize(zone, design) {
  const { w, d } = SIZES[design?.size] ?? SIZES['3x3'];
  const walls = wallsOf(design);
  if (zone === 'roof') return { w: w + OVERHANG * 2, h: d + OVERHANG * 2 };
  if (zone === 'valanceFront' || zone === 'valanceBack') return { w: w + OVERHANG * 2, h: VALANCE };
  if (zone === 'valanceLeft' || zone === 'valanceRight') return { w: d + OVERHANG * 2, h: VALANCE };
  if (!walls[zone]) return null;
  const height = walls[zone] === 'half' ? HALF : EAVE - 0.06;
  return { w: zone === 'wallBack' ? w : d, h: height };
}

// ---------- the 3D model

const tubeMat = () => new THREE.MeshStandardMaterial({ color: 0x1d2228, metalness: 0.8, roughness: 0.42 });
/** A square aluminium tube from a to b (pop-up frames use hexagonal / square profile tube). */
function tube(a, b, size, material) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, len, size), material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

/** A gently sagging fabric panel: a grid in a vertical plane, `fn(u, v)` -> point; uv as given (u right, v up). */
function panelGeometry(cols, rows, fn) {
  const g = new THREE.BufferGeometry(), pos = [], uv = [], index = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const u = i / cols, v = j / rows, p = fn(u, v);
    pos.push(p.x, p.y, p.z);
    uv.push(u, v);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, e = c + 1;
    index.push(a, b, e, a, e, c);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * The roof: one pyramid (3 x 3 m) or two side by side (3 x 6 m), each face a little slack between its ribs. Its uv is
 * the roof seen from above (u left to right, v back (1) to front (0)), so the roof's print area is that view.
 */
function roofGeometry(w, d) {
  const hw = w / 2 + OVERHANG, hd = d / 2 + OVERHANG, peaks = w > 4 ? [-w / 4, w / 4] : [0];
  const span = w / peaks.length / 2 + OVERHANG;
  const pos = [], uv = [], index = [];
  const N = 18;
  for (const px of peaks) {
    const left = Math.max(-hw, px - span), right = Math.min(hw, px + span);
    const corners = [[left, hd], [right, hd], [right, -hd], [left, -hd]];
    const peak = new THREE.Vector3(px, EAVE + RISE, 0);
    for (let f = 0; f < 4; f++) {
      const [ax, az] = corners[f], [bx, bz] = corners[(f + 1) % 4];
      const base = pos.length / 3;
      // Rows from the eave edge (t = 0) to the peak (t = 1); the fabric sags between the corner ribs.
      for (let r = 0; r <= N; r++) {
        const t = r / N, cols = Math.max(1, N - r);
        for (let c = 0; c <= cols; c++) {
          const s = cols ? c / cols : 0.5;
          const ex = ax + (bx - ax) * s, ez = az + (bz - az) * s;
          const x = ex + (peak.x - ex) * t, z = ez + (peak.z - ez) * t;
          const sag = 0.05 * Math.sin(Math.PI * s) * Math.sin(Math.PI * Math.min(1, t * 1.25)) * (1 - t);
          const y = EAVE + RISE * t - sag;
          pos.push(x, y, z);
          uv.push((x + hw) / (2 * hw), 1 - (z + hd) / (2 * hd));
        }
      }
      // Stitch the rows into triangles.
      let row = base;
      for (let r = 0; r < N; r++) {
        const cols = N - r, next = row + cols + 1, nextCols = Math.max(0, cols - 1);
        for (let c = 0; c < cols; c++) {
          index.push(row + c, row + c + 1, next + Math.min(c, nextCols));
          if (c < nextCols) index.push(row + c + 1, next + c + 1, next + c);
        }
        row = next;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return { geometry: g, peaks };
}

/**
 * Builds the marquee for `design` ({size, walls, halfWall}). Returns {group, zones: {zone: mesh}, outlines:
 * {zone: [corners]}, size}. Each zone's mesh carries userData.zone, for picking.
 */
export function buildMarquee(design) {
  const { w, d } = SIZES[design?.size] ?? SIZES['3x3'];
  const group = new THREE.Group();
  const metal = tubeMat(), dark = new THREE.MeshStandardMaterial({ color: 0x0b0e12, metalness: 0.4, roughness: 0.6 });
  const hw = w / 2, hd = d / 2;
  // Legs: corners, and the middle of the long sides on 3 x 6 m. An outer tube, a thinner inner one above it, the
  // slider bracket and a foot plate.
  const legXs = w > 4 ? [-hw, 0, hw] : [-hw, hw];
  const legs = [];
  for (const x of legXs) for (const z of [hd, -hd]) legs.push([x, z]);
  for (const [x, z] of legs) {
    group.add(tube(new THREE.Vector3(x, 0.01, z), new THREE.Vector3(x, 1.25, z), 0.05, metal));
    group.add(tube(new THREE.Vector3(x, 1.2, z), new THREE.Vector3(x, EAVE + 0.02, z), 0.04, metal));
    const slider = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.075), dark);
    slider.position.set(x, EAVE - 0.42, z);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.08), dark);
    top.position.set(x, EAVE - 0.01, z);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.008, 0.14), dark);
    foot.position.set(x, 0.004, z);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.06), dark);
    clip.position.set(x, 1.22, z);
    group.add(slider, top, foot, clip);
  }
  // The scissor truss between neighbouring legs: zig-zag bars between the eave and the slider.
  const truss = (a, b) => {
    const len = a.distanceTo(b), n = Math.max(2, Math.round(len / 0.75));
    group.add(tube(a.clone().setY(EAVE - 0.02), b.clone().setY(EAVE - 0.02), 0.03, metal));
    for (let i = 0; i < n; i++) {
      const p = a.clone().lerp(b, i / n), q = a.clone().lerp(b, (i + 1) / n);
      group.add(tube(p.clone().setY(EAVE - 0.03), q.clone().setY(EAVE - 0.42), 0.022, metal));
      group.add(tube(p.clone().setY(EAVE - 0.42), q.clone().setY(EAVE - 0.03), 0.022, metal));
    }
  };
  for (const z of [hd, -hd]) for (let i = 0; i < legXs.length - 1; i++) truss(new THREE.Vector3(legXs[i], 0, z), new THREE.Vector3(legXs[i + 1], 0, z));
  for (const x of legXs) truss(new THREE.Vector3(x, 0, hd), new THREE.Vector3(x, 0, -hd));

  // The roof and its ribs to the peak(s) underneath.
  const zones = {}, outlines = {};
  const zoneMat = () => new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, side: THREE.FrontSide });
  const roof = roofGeometry(w, d);
  const roofMesh = new THREE.Mesh(roof.geometry, zoneMat());
  roofMesh.castShadow = true;
  zones.roof = roofMesh;
  group.add(roofMesh);
  for (const px of roof.peaks) {
    const peak = new THREE.Vector3(px, EAVE + RISE - 0.04, 0);
    const span = w / roof.peaks.length / 2;
    for (const [x, z] of [[px - span, hd], [px + span, hd], [px + span, -hd], [px - span, -hd]]) group.add(tube(new THREE.Vector3(x, EAVE + 0.02, z), peak, 0.022, metal));
    group.add(tube(new THREE.Vector3(px, EAVE - 0.3, 0), peak, 0.03, metal));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12), dark);
    hub.position.copy(peak);
    group.add(hub);
  }
  const hW = hw + OVERHANG, hD = hd + OVERHANG;
  outlines.roof = [[-hW, EAVE, hD], [hW, EAVE, hD], [hW, EAVE, -hD], [-hW, EAVE, -hD]];

  // Valances: hanging from the roof's edge on each side, read from outside (u to the right as seen from there).
  const valance = (zone, from, to) => {
    const geometry = panelGeometry(48, 3, (u, v) => {
      const p = from.clone().lerp(to, u);
      const ripple = 0.006 * Math.sin(u * Math.PI * 14) * (1 - v);
      const outward = new THREE.Vector3(to.z - from.z, 0, from.x - to.x).normalize().multiplyScalar(-ripple);
      return p.add(outward).setY(EAVE - VALANCE + v * VALANCE);
    });
    const mesh = new THREE.Mesh(geometry, zoneMat());
    mesh.castShadow = true;
    zones[zone] = mesh;
    group.add(mesh);
    outlines[zone] = [[from.x, EAVE, from.z], [to.x, EAVE, to.z], [to.x, EAVE - VALANCE, to.z], [from.x, EAVE - VALANCE, from.z]];
  };
  valance('valanceFront', new THREE.Vector3(-hW, 0, hD), new THREE.Vector3(hW, 0, hD));
  valance('valanceBack', new THREE.Vector3(hW, 0, -hD), new THREE.Vector3(-hW, 0, -hD));
  valance('valanceLeft', new THREE.Vector3(-hW, 0, -hD), new THREE.Vector3(-hW, 0, hD));
  valance('valanceRight', new THREE.Vector3(hW, 0, hD), new THREE.Vector3(hW, 0, -hD));

  // Walls: hung inside the legs from the eave (a half wall from the frame's lower clips).
  const walls = wallsOf(design);
  const wall = (zone, from, to) => {
    const kind = walls[zone];
    if (!kind) return;
    const top = kind === 'half' ? 0.05 + HALF : EAVE - 0.04, bottom = kind === 'half' ? 0.05 : 0.02;
    const geometry = panelGeometry(40, 16, (u, v) => {
      const p = from.clone().lerp(to, u);
      // Soft vertical folds, fixed at the top and the legs.
      const fold = 0.018 * Math.sin(u * Math.PI * (from.distanceTo(to) / 0.5)) * Math.sin(Math.PI * u) * (1 - v * 0.6);
      const n = new THREE.Vector3(to.z - from.z, 0, from.x - to.x).normalize().multiplyScalar(fold);
      return p.add(n).setY(bottom + v * (top - bottom));
    });
    const mesh = new THREE.Mesh(geometry, zoneMat());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    zones[zone] = mesh;
    group.add(mesh);
    outlines[zone] = [[from.x, top, from.z], [to.x, top, to.z], [to.x, bottom, to.z], [from.x, bottom, from.z]];
    // A half wall's top bar between the legs.
    if (kind === 'half') group.add(tube(new THREE.Vector3(from.x, top + 0.01, from.z), new THREE.Vector3(to.x, top + 0.01, to.z), 0.025, metal));
  };
  const inset = 0.03;
  // The back wall faces the front (it is read from inside), the side walls from outside.
  wall('wallBack', new THREE.Vector3(-hw, 0, -hd + inset), new THREE.Vector3(hw, 0, -hd + inset));
  wall('wallLeft', new THREE.Vector3(-hw + inset, 0, -hd), new THREE.Vector3(-hw + inset, 0, hd));
  wall('wallRight', new THREE.Vector3(hw - inset, 0, hd), new THREE.Vector3(hw - inset, 0, -hd));

  // The print side faces out (the back wall: in); the other side shows the print dimmer, as through the fabric, but the
  // right way round (marquee-main.js turns its texture, 2026-11-11), so a logo never reads backwards.
  for (const [zone, mesh] of Object.entries(zones)) {
    mesh.userData.zone = zone;
    const through = new THREE.Mesh(mesh.geometry, new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.BackSide, color: 0x5a6068 }));
    through.userData.zone = zone;
    through.userData.through = true;
    mesh.userData.through = through;
    through.castShadow = mesh.castShadow;
    group.add(through);
  }
  return { group, zones, outlines, size: { w, d } };
}

// ---------- the print: one canvas per zone

const images = new Map();
/** Loads a picture (cached). '3deezi:logo' = the 3DEEZI "3" emblem, '3deezi:wordmark' = the wordmark. */
export function loadImage(src) {
  // (The brand pictures inlined in the viewer, brandmarks.js: they load in the apps' local viewer too and never taint the canvas.)
  const url = src === '3deezi:logo' ? BRAND_MARK : src === '3deezi:wordmark' ? BRAND_WORDMARK : src;
  if (!images.has(url)) {
    images.set(url, new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    }));
  }
  return images.get(url);
}

/** A seeded random number source, so a pattern looks the same every time. */
function seeded(seed) { let s = seed % 2147483647 || 7; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

/**
 * Draws a pattern over the whole w x h panel: `ink` and `accent` its colours, `scale` its size. The roof's blades
 * fan in from its four corners (as the mockup), every other panel's sweep up from its lower corners.
 */
export function drawPattern(g, name, w, h, { ink = '#00c2ff', accent = '#1565ff', scale = 1, roof = false } = {}) {
  const k = Math.max(0.2, scale) * Math.min(w, h);
  g.save();
  g.fillStyle = ink;
  g.strokeStyle = ink;
  if (name === 'Blades') {
    const shard = (x0, y0, x1, y1, tx, ty, colour) => {
      g.fillStyle = colour;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(tx, ty); g.lineTo(x1, y1); g.closePath(); g.fill();
    };
    const rnd = seeded(11);
    if (roof) {
      // From each corner towards the middle, along the hips.
      const cx = w / 2, cy = h / 2;
      for (const [x, y] of [[0, 0], [w, 0], [w, h], [0, h]]) {
        for (let i = 0; i < 7; i++) {
          const a = Math.atan2(cy - y, cx - x) + (rnd() - 0.5) * 0.9, len = Math.hypot(cx - x, cy - y) * (0.35 + rnd() * 0.5);
          const side = (rnd() - 0.5) * 0.25 * Math.min(w, h), nx = -Math.sin(a), ny = Math.cos(a);
          const bx = x + nx * side, by = y + ny * side, width = (0.015 + rnd() * 0.05) * Math.min(w, h);
          shard(bx - nx * width, by - ny * width, bx + nx * width, by + ny * width, bx + Math.cos(a) * len, by + Math.sin(a) * len, i % 3 === 1 ? accent : ink);
        }
      }
    } else {
      // Long sharp sweeps rising from the bottom corners towards the middle.
      for (const dir of [1, -1]) {
        const x0 = dir > 0 ? 0 : w;
        for (let i = 0; i < 9; i++) {
          const base = h * (0.25 + rnd() * 0.85), width = (0.03 + rnd() * 0.09) * h;
          const tx = x0 + dir * w * (0.18 + rnd() * 0.32), ty = h * (rnd() * 0.55);
          const along = dir * (rnd() * 0.12 * w);
          shard(x0 + along, base, x0 + along, base + width, tx, ty, i % 3 === 1 ? accent : ink);
        }
        for (let i = 0; i < 6; i++) {
          const bx = x0 + dir * w * (0.02 + rnd() * 0.3), width = (0.015 + rnd() * 0.05) * w;
          shard(bx, h, bx + dir * width, h, bx + dir * w * (0.1 + rnd() * 0.22), h * (0.3 + rnd() * 0.45), i % 2 ? accent : ink);
        }
      }
    }
  } else if (name === 'Velocity') {
    g.globalAlpha = 0.9;
    for (let i = 0; i < 10; i++) {
      const y = h * (0.1 + i * 0.085);
      for (const dir of [-1, 1]) {
        const x0 = w / 2 + dir * w * 0.5, x1 = w / 2 + dir * w * (0.12 + i * 0.012);
        g.fillStyle = i % 3 === 2 ? accent : ink;
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y + h * 0.04); g.lineTo(x1, y + h * 0.055); g.lineTo(x0, y + h * 0.03); g.closePath(); g.fill();
      }
    }
  } else if (name === 'Chevron') {
    g.lineWidth = k * 0.025;
    for (let y = -h * 0.2; y < h * 1.2; y += k * 0.12) {
      g.beginPath(); g.moveTo(0, y + w * 0.12); g.lineTo(w / 2, y); g.lineTo(w, y + w * 0.12); g.stroke();
    }
  } else if (name === 'Stripes') {
    const step = k * 0.12;
    for (let x = 0, i = 0; x < w; x += step, i++) { g.fillStyle = i % 2 ? accent : ink; g.fillRect(x, 0, step * 0.4, h); }
  } else if (name === 'Diagonal') {
    g.lineWidth = k * 0.04;
    for (let x = -h; x < w + h; x += k * 0.16) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke(); }
  } else if (name === 'Hoops') {
    const step = k * 0.16;
    for (let y = 0, i = 0; y < h; y += step, i++) { g.fillStyle = i % 2 ? accent : ink; g.fillRect(0, y, w, step * 0.45); }
  } else if (name === 'Dots') {
    const step = k * 0.08;
    for (let y = step / 2, r = 0; y < h; y += step, r++) for (let x = (r % 2 ? step / 2 : 0); x < w + step; x += step) {
      g.beginPath(); g.arc(x, y, step * 0.22, 0, Math.PI * 2); g.fill();
    }
  } else if (name === 'Camo') {
    const rnd = seeded(5);
    const n = Math.round((w * h) / (k * k * 0.02));
    for (let i = 0; i < Math.min(n, 900); i++) {
      g.fillStyle = i % 3 ? ink : accent;
      const r = k * (0.03 + rnd() * 0.06);
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, r * 1.6, r, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  } else if (name === 'Tribal') {
    const band = k * 0.22;
    for (let y = band * 0.2; y < h; y += band) {
      for (let x = 0; x < w; x += band * 0.45) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + band * 0.22, y + band * 0.4); g.lineTo(x + band * 0.45, y); g.closePath(); g.fill();
      }
      g.fillStyle = accent; g.fillRect(0, y + band * 0.5, w, band * 0.05); g.fillStyle = ink;
    }
  }
  g.restore();
}

/** The pixels per metre of a zone's print canvas (the long side at most 2048 px). */
function canvasSize(size) {
  const ppm = Math.min(420, 2048 / Math.max(size.w, size.h));
  return { cw: Math.max(16, Math.round(size.w * ppm)), ch: Math.max(16, Math.round(size.h * ppm)) };
}

/**
 * Paints one zone's print into `canvas` (resized to the zone): its colour, then its layers bottom to top: a
 * pattern {type:'pattern', name, color, accent, scale}, a picture {type:'image', src, x, y, w, rot} or words
 * {type:'text', text, color, font, x, y, size, rot}. x, y: the centre, 0..1 across and down the panel; a picture's w
 * is a share of the panel's width, words' size a share of its height. Hidden layers (visible false) are skipped.
 */
export async function paintZone(canvas, zone, zd, size) {
  const { cw, ch } = canvasSize(size);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = HEX.test(zd?.color ?? '') ? zd.color : '#0b1016';
  g.fillRect(0, 0, cw, ch);
  for (const layer of zd?.layers ?? []) {
    if (layer.visible === false) continue;
    if (layer.type === 'pattern') {
      if (!layer.name || layer.name === 'Solid') continue;
      drawPattern(g, layer.name, cw, ch, { ink: HEX.test(layer.color ?? '') ? layer.color : '#00c2ff', accent: HEX.test(layer.accent ?? '') ? layer.accent : '#1565ff', scale: Number(layer.scale) || 1, roof: zone === 'roof' });
      continue;
    }
    const x = (Number(layer.x) || 0.5) * cw, y = (Number(layer.y) || 0.5) * ch, rot = ((Number(layer.rot) || 0) * Math.PI) / 180;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    if (layer.type === 'image' && layer.src) {
      const img = await loadImage(layer.src);
      if (img) {
        const width = Math.max(0.01, Number(layer.w) || 0.3) * cw, height = width * (img.naturalHeight / img.naturalWidth);
        g.drawImage(img, -width / 2, -height / 2, width, height);
      }
    } else if (layer.type === 'text' && layer.text) {
      const px = Math.max(0.01, Number(layer.size) || 0.15) * ch;
      const family = layer.font === 'JerseyBlock' ? 'JerseyBlock' : 'Rajdhani';
      g.font = `700 ${px}px ${family}, Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // Sporty italic, as the 3DEEZI wordmark.
      if (layer.italic !== false) g.transform(1, 0, -0.2, 1, 0, 0);
      if (HEX.test(layer.outline ?? '')) { g.lineWidth = px * 0.08; g.strokeStyle = layer.outline; g.lineJoin = 'round'; g.strokeText(String(layer.text), 0, 0); }
      g.fillStyle = HEX.test(layer.color ?? '') ? layer.color : '#ffffff';
      g.fillText(String(layer.text), 0, 0);
    }
    g.restore();
  }
  return canvas;
}

/** A layer's box on its panel, 0..1 (for the selection outline and picking): {x, y, w, h}. */
export async function layerBox(layer, size) {
  const { cw, ch } = canvasSize(size);
  if (layer.type === 'image') {
    const img = await loadImage(layer.src);
    const w = Math.max(0.01, Number(layer.w) || 0.3), h = img ? (w * cw * (img.naturalHeight / img.naturalWidth)) / ch : w;
    return { x: layer.x, y: layer.y, w, h };
  }
  if (layer.type === 'text') {
    const px = Math.max(0.01, Number(layer.size) || 0.15) * ch;
    const g = document.createElement('canvas').getContext('2d');
    g.font = `700 ${px}px Rajdhani, Arial, sans-serif`;
    return { x: layer.x, y: layer.y, w: (g.measureText(String(layer.text ?? '')).width * 1.1) / cw, h: (px * 1.1) / ch };
  }
  return { x: 0.5, y: 0.5, w: 1, h: 1 };
}

// ---------- the starting design (the client's mockup: black, cyan and royal blue blades, the 3DEEZI logo)

export function defaultMarqueeDesign() {
  const blades = (id) => ({ id, type: 'pattern', name: 'Blades', color: '#00c8ff', accent: '#1560ff', scale: 1 });
  const logo = (id, x, y, w) => ({ id, type: 'image', name: 'Logo', src: '3deezi:logo', x, y, w });
  // (Branding, BR1 2026-11-02: the "3" emblem and the wordmark everywhere, from the brand pictures, not typed text.)
  const word = (id, x, y, w) => ({ id, type: 'image', name: 'Wordmark', src: '3deezi:wordmark', x, y, w });
  const valance = (z) => ({ color: '#05080c', layers: [blades(`${z}-pattern`), logo(`${z}-logo`, 0.25, 0.5, 0.09), word(`${z}-word`, 0.53, 0.5, 0.36)] });
  return {
    size: '3x3',
    walls: 'back',
    halfWall: true,
    zones: {
      roof: { color: '#05080c', layers: [blades('roof-pattern'), logo('roof-logo', 0.5, 0.66, 0.2), word('roof-word', 0.5, 0.79, 0.3)] },
      valanceFront: valance('valanceFront'),
      valanceBack: valance('valanceBack'),
      valanceLeft: valance('valanceLeft'),
      valanceRight: valance('valanceRight'),
      wallBack: { color: '#05080c', layers: [blades('wallBack-pattern'), logo('wallBack-logo', 0.5, 0.42, 0.24), word('wallBack-word', 0.5, 0.66, 0.5)] },
      wallLeft: { color: '#05080c', layers: [blades('wallLeft-pattern'), logo('wallLeft-logo', 0.5, 0.33, 0.2), word('wallLeft-word', 0.5, 0.74, 0.5)] },
      wallRight: { color: '#05080c', layers: [blades('wallRight-pattern'), logo('wallRight-logo', 0.5, 0.42, 0.24), word('wallRight-word', 0.5, 0.66, 0.5)] },
    },
  };
}
