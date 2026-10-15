// Artistic Media (CorelDRAW): a freehand stroke turned into a filled shape. Modes:
//   preset  shape profiles along the stroke (tapered, teardrop, flare, wedge, round, wave, pinch)
//   brush   textured styles (dry brush, ribbon, chalk, ink splatter)
//   spray   objects scattered along the stroke (dots, stars, sparkles, hearts, leaves, bolts, confetti)
//   calli   calligraphic: a flat pen nib held at an angle
//   expr    expression: width from pen pressure, or from mouse speed (faster = thinner)
// Pure geometry: page points in, path data out. The same spec always draws the same stroke.

import { fitPartsD, starUnit, dToModel, modelToD, SHAPE_SETS } from './vector.js';

/** Repeatable random numbers. */
function rng(seed) {
  let q = Math.max(1, Math.floor(Math.abs(seed)) % 2147483646);
  return () => (q = (q * 16807) % 2147483647) / 2147483647;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * The centre line to store with a stroke: lightly smoothed, evenly spaced, each point with its expression
 * factor f (0.2-1): pen pressure when drawn with a pen, otherwise from the drawing speed (screen px per ms).
 * raw: [{ x, y, t, pr, pen }], zoom: page zoom when drawn.
 */
export function captureStroke(raw, zoom, step) {
  const pts = raw.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return pts.map((p) => [p.x, p.y, 1]);
  const pen = pts.some((p) => p.pen) && pts.some((p) => Math.abs((p.pr ?? 0.5) - 0.5) > 0.02);
  const f = pts.map((p, i) => {
    if (pen) return clamp(p.pr ?? 0.5, 0.15, 1);
    const q = pts[Math.max(0, i - 1)], r = pts[Math.min(pts.length - 1, i + 1)];
    const v = (Math.hypot(r.x - q.x, r.y - q.y) * zoom) / Math.max(1, (r.t ?? 0) - (q.t ?? 0));
    return clamp(1.25 - v / 1.6, 0.25, 1);
  });
  // Smooth the factor so the width changes gently.
  const fs = f.map((_, i) => { let s = 0, n = 0; for (let k = -3; k <= 3; k++) { const v = f[i + k]; if (v !== undefined) { s += v; n++; } } return s / n; });
  return resample(pts.map((p, i) => ({ x: p.x, y: p.y, f: fs[i] })), step, 600).map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.f * 100) / 100]);
}
/** Evenly spaced points (arc length `step`, at most `max`), interpolating x, y and f. */
function resample(pts, step, max = 600) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (L < 1e-6) return [pts[0]];
  const ds = Math.max(step, L / max), out = [pts[0]];
  let want = ds, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y);
    while (acc + l >= want && l > 0) {
      const t = (want - acc) / l;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, f: a.f + (b.f - a.f) * t });
      want += ds;
    }
    acc += l;
  }
  const last = pts.at(-1);
  if (Math.hypot(last.x - out.at(-1).x, last.y - out.at(-1).y) > ds / 4) out.push(last);
  return out;
}
/** Smoothing 0-100: passes of a [1 2 1] average, ends fixed. */
function smoothPts(pts, smoothing) {
  let p = pts;
  const passes = Math.round(clamp(smoothing, 0, 100) / 100 * 8);
  for (let k = 0; k < passes && p.length > 2; k++) {
    p = p.map((q, i) => (i === 0 || i === p.length - 1 ? q : { x: (p[i - 1].x + 2 * q.x + p[i + 1].x) / 4, y: (p[i - 1].y + 2 * q.y + p[i + 1].y) / 4, f: q.f }));
  }
  return p;
}
/** Arc length, unit tangent and normal at each point. */
function frames(pts) {
  let s = 0;
  return pts.map((p, i) => {
    if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return { ...p, s, tx: dx / l, ty: dy / l, nx: -dy / l, ny: dx / l };
  });
}
const signedArea = (poly) => poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + (p.x * q.y - q.x * p.y); }, 0) / 2;
/** All outlines turned the same way, so overlapping parts fill as one (nonzero fill). */
const sameWay = (poly) => (signedArea(poly) < 0 ? poly.slice().reverse() : poly);
/** A half circle from angle a0 over 180° round c, radius r. */
function arc(c, r, a0, dir = 1, n = 10) {
  const out = [];
  for (let k = 1; k < n; k++) { const a = a0 + dir * Math.PI * (k / n); out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }); }
  return out;
}
/** Outline of a stroke whose half-widths are given per point (separately for the left and right edge). */
function outline(fr, halfL, halfR, caps = true) {
  const left = fr.map((p, i) => ({ x: p.x + p.nx * halfL[i], y: p.y + p.ny * halfL[i] }));
  const right = fr.map((p, i) => ({ x: p.x - p.nx * halfR[i], y: p.y - p.ny * halfR[i] }));
  const a = fr[0], z = fr.at(-1), r0 = (halfL[0] + halfR[0]) / 2, r1 = (halfL.at(-1) + halfR.at(-1)) / 2;
  const endCap = caps && r1 > 0.2 ? arc(z, r1, Math.atan2(z.ny, z.nx), -1) : [];
  const startCap = caps && r0 > 0.2 ? arc(a, r0, Math.atan2(-a.ny, -a.nx), -1) : [];
  return [...left, ...endCap, ...right.reverse(), ...startCap];
}
const ribbonPoly = (fr, half) => outline(fr, half, half, true);

const PRESETS = {
  taper: (t) => Math.pow(Math.sin(Math.PI * t), 0.6),
  teardrop: (t) => Math.pow(1 - t, 0.7),
  flare: (t) => Math.pow(t, 0.7),
  wedge: (t) => 1 - t,
  round: () => 1,
  wave: (t, s, W) => 0.55 + 0.45 * Math.sin((s / (W * 1.6)) * Math.PI),
  pinch: (t) => 0.3 + 0.7 * Math.abs(2 * t - 1),
};
export const PRESET_NAMES = { taper: 'Tapered', teardrop: 'Teardrop', flare: 'Flare', wedge: 'Wedge', round: 'Round', wave: 'Wave', pinch: 'Pinched' };
export const BRUSH_NAMES = { dry: 'Dry brush', ribbon: 'Ribbon', chalk: 'Chalk', splatter: 'Ink splatter' };
export const SPRAY_NAMES = { stars: 'Stars', dots: 'Dots', sparkles: 'Sparkles', hearts: 'Hearts', leaves: 'Leaves', bolts: 'Lightning', confetti: 'Confetti' };

const item = (set, id) => SHAPE_SETS[set]?.items.find(([k]) => k === id)?.[2];
const SPRAY_SHAPES = {
  stars: () => starUnit(5, 55),
  sparkles: () => starUnit(4, 78),
  dots: () => 'M 50 0 C 77.6 0 100 22.4 100 50 C 100 77.6 77.6 100 50 100 C 22.4 100 0 77.6 0 50 C 0 22.4 22.4 0 50 0 Z',
  hearts: () => item('basic', 'heart') ?? 'M 50 90 L 10 45 A 22 22 0 0 1 50 20 A 22 22 0 0 1 90 45 Z',
  leaves: () => 'M 50 0 C 88 26 88 74 50 100 C 12 74 12 26 50 0 Z',
  bolts: () => item('basic', 'bolt') ?? 'M 55 0 L 20 55 H 45 L 35 100 L 80 40 H 55 Z',
  confetti: () => 'M 32 8 H 68 V 92 H 32 Z',
};
const CONFETTI = ['#12E1F0', '#1E7BFF', '#7B4DFF', '#FFD23F', '#FF4D6D', '#2BD67B'];

/**
 * The shape for a stored stroke. spec: { mode, width (page units), smooth, preset, brush, spray, spacing (page units),
 * sizeVar (%), rotate, angle (degrees), seed, pts: [[x, y, f]] }. Returns { d } or, for the sprayer,
 * { items: [{ d, fill }] } (fill null = the stroke's colour).
 */
export function buildMedia(spec) {
  const W = Math.max(0.5, spec.width), rand = rng(spec.seed ?? 7);
  let pts = (spec.pts ?? []).map(([x, y, f]) => ({ x, y, f: f ?? 1 }));
  if (!pts.length) return { d: '' };
  if (pts.length === 1) pts = [pts[0], { ...pts[0], x: pts[0].x + 0.5 }];
  pts = smoothPts(pts, spec.smooth ?? 50);
  const fr = frames(pts), L = fr.at(-1).s || 1, tol = Math.max(0.3, W * 0.012);
  const fit = (polys, smooth = tol) => fitPartsD(polys.filter((p) => p.length > 2).map((p) => ({ closed: true, pts: sameWay(p) })), smooth);

  if (spec.mode === 'spray') {
    const unit = (SPRAY_SHAPES[spec.spray] ?? SPRAY_SHAPES.stars)(), gap = Math.max(W * 0.3, spec.spacing || W * 1.5);
    const items = [];
    let i = 0, k = 0;
    for (let s = gap / 2; s <= L; s += gap) {
      while (i < fr.length - 1 && fr[i + 1].s < s) i++;
      const a = fr[i], b = fr[Math.min(i + 1, fr.length - 1)], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const size = W * (1 + clamp(spec.sizeVar ?? 30, 0, 90) / 100 * (rand() * 2 - 1));
      const across = W * 0.6 * (rand() * 2 - 1);
      const c = { x: p.x + a.nx * across, y: p.y + a.ny * across };
      const turn = spec.rotate === 'follow' ? Math.atan2(a.ty, a.tx) + Math.PI / 2 : spec.rotate === 'none' ? 0 : rand() * Math.PI * 2;
      // The unit shape (0-100 box) centred on c, turned and sized.
      const cs = Math.cos(turn), sn = Math.sin(turn), k2 = size / 100;
      const d = modelToD(dToModel(unit, (q) => { const x = (q.x - 50) * k2, y = (q.y - 50) * k2; return { x: c.x + x * cs - y * sn, y: c.y + x * sn + y * cs }; }));
      items.push({ d, fill: spec.spray === 'confetti' ? CONFETTI[k % CONFETTI.length] : null });
      k++;
    }
    return { items };
  }
  if (spec.mode === 'calli') {
    // A flat nib at a fixed angle: the edges are the centre line moved by half the nib each way (plus a hairline).
    const a = ((spec.angle ?? 45) * Math.PI) / 180, dx = (Math.cos(a) * W) / 2, dy = (Math.sin(a) * W) / 2, m = W * 0.06;
    const left = fr.map((p) => ({ x: p.x + dx + p.nx * m, y: p.y + dy + p.ny * m })), right = fr.map((p) => ({ x: p.x - dx - p.nx * m, y: p.y - dy - p.ny * m }));
    return { d: fit([[...left, ...right.reverse()]]) };
  }
  if (spec.mode === 'expr') {
    const half = fr.map((p) => (W / 2) * p.f * Math.min(1, (L - p.s) / (W * 1.2) + 0.25, p.s / (W * 0.6) + 0.35));
    return { d: fit([ribbonPoly(fr, half)]) };
  }
  if (spec.mode === 'brush') {
    const style = spec.brush ?? 'dry';
    if (style === 'ribbon') {
      const half = fr.map((p) => (W / 2) * (0.1 + 0.9 * Math.abs(Math.cos((p.s / (W * 2.2)) * Math.PI))));
      return { d: fit([ribbonPoly(fr, half)]) };
    }
    if (style === 'chalk') {
      const jag = () => fr.map(() => rand());
      const n1 = jag(), n2 = jag();
      const halfL = fr.map((p, i) => (W / 2) * (0.72 + 0.28 * n1[i]) * Math.min(1, (L - p.s) / W + 0.3, p.s / W + 0.3));
      const halfR = fr.map((p, i) => (W / 2) * (0.72 + 0.28 * n2[i]) * Math.min(1, (L - p.s) / W + 0.3, p.s / W + 0.3));
      return { d: fitPartsD([{ closed: true, pts: sameWay(outline(fr, halfL, halfR, true)) }], 0) };
    }
    if (style === 'splatter') {
      const polys = [ribbonPoly(fr, fr.map((p) => (W * 0.3) * Math.min(1, (L - p.s) / W + 0.4, p.s / W + 0.4)))];
      for (let s = W * 0.4; s <= L; s += W * 0.55) {
        if (rand() > 0.7) continue;
        const i = fr.findIndex((p) => p.s >= s), p = fr[Math.max(0, i)], r = W * (0.08 + 0.26 * rand()), off = W * (0.5 + 1.2 * rand()) * (rand() < 0.5 ? -1 : 1);
        const c = { x: p.x + p.nx * off, y: p.y + p.ny * off };
        polys.push(Array.from({ length: 16 }, (_, k) => ({ x: c.x + Math.cos((k / 16) * Math.PI * 2) * r, y: c.y + Math.sin((k / 16) * Math.PI * 2) * r * (0.8 + 0.2 * rand()) })));
        // Now and then a drip: a small blob running away from the stroke.
        if (rand() < 0.25) {
          const dir = Math.sign(off), d2 = { x: c.x + p.nx * dir * r * 2.2, y: c.y + p.ny * dir * r * 2.2 }, r2 = r * 0.45;
          polys.push(Array.from({ length: 12 }, (_, k) => ({ x: d2.x + Math.cos((k / 12) * Math.PI * 2) * r2, y: d2.y + Math.sin((k / 12) * Math.PI * 2) * r2 })));
        }
      }
      return { d: fit(polys) };
    }
    // Dry brush: bristle strands across the width, each with gaps that grow as the brush runs dry.
    const K = 7, polys = [];
    for (let k = 0; k < K; k++) {
      const off = (k / (K - 1) - 0.5) * W * 0.86, w = W * (0.11 + 0.1 * rand());
      const strand = fr.map((p) => ({ ...p, x: p.x + p.nx * off, y: p.y + p.ny * off }));
      let start = null;
      for (let i = 0; i <= strand.length; i++) {
        const t = i < strand.length ? strand[i].s / L : 1, gapNow = i === strand.length || rand() < 0.015 + 0.16 * t * t;
        if (!gapNow && start === null) start = i;
        if ((gapNow || i === strand.length) && start !== null) {
          const run = strand.slice(start, i);
          if (run.length > 2) {
            const rl = run.at(-1).s - run[0].s || 1;
            polys.push(ribbonPoly(run, run.map((p) => (w / 2) * Math.min(1, (p.s - run[0].s) / (rl * 0.25) + 0.15, (run.at(-1).s - p.s) / (rl * 0.25) + 0.15))));
          }
          start = null;
        }
      }
    }
    return { d: fit(polys, Math.max(0.2, W * 0.008)) };
  }
  // Preset profiles (the default).
  const prof = PRESETS[spec.preset] ?? PRESETS.taper;
  const half = fr.map((p) => (W / 2) * Math.max(0, prof(p.s / L, p.s, W)));
  return { d: fit([ribbonPoly(fr, half)]) };
}
