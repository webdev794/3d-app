// Part looks on a ready-made model split into its pieces (client 607, PATTERNDND 2026-11-19): a part's own colour and
// pattern (design.parts), and a Patterns area's pattern (design.zones), drawn inside that part's own piece of the model,
// so every border stays on the model's own lines. (tripomesh.js `piece`: per point the two pieces by it and its distance
// from their line; main.js addRelief colours each piece up to that smooth line, and this follows the same line on the
// print.) The body (no piece of its own) is the front on the front's half of the print and the back on the back's, so a
// front's pattern runs to the side seams; a sleeve, a cuff, a hem band or the socks' top band is its own piece. Track
// pants: their front and back look covers each whole side (the pants, never the jacket). Nothing here paints for a
// design without such a look, so every other look is drawn as before.
// A model whose sleeves are not pieces of their own (the training tee, the football jersey: sleeves in the body's piece):
// there the made garment's sleeve areas on the print are the sleeves, and the front and back stop at them (PATTERNDND r2).
import { zoneAt, partAt, partRegion } from './zones.js';

/** The rib parts: their own colour is their piece's plain colour (main.js paintPlains); a pattern never goes on them. */
const RIB = new Set(['collar', 'waistband']);
/** Pieces of the body's own cloth: the seam tapes and band rings lying in it (lips), a piece in the Main colour. */
const BODY_KEYS = new Set(['lip', 'main']);
const HEX = /^#[0-9a-f]{6}$/i;
const isPicture = (v) => typeof v === 'string' && (v.startsWith('data:image/') || v.startsWith('/') || v.startsWith('http'));
/** The colour an area's pattern is drawn in (texture.js paintZones). */
const zoneInkSlot = (design) => (design.patternColorOwn && HEX.test(design.patternColor ?? '') ? 'patternColor' : 'secondary');

/** The piece at a point, from the shader's rounding (main.js addRelief: int( v + 0.5 ) - 1; -1 the body). */
const pieceIx = (v) => Math.floor(v + 0.5) - 1;

/**
 * The design part a model piece (its partKeys name) stands for; null for a piece of a fixed colour (inside, trim...).
 * `x`: the garment x there (+ the wearer's left), for one piece that is both cuffs.
 */
export function pieceKeyPart(kind, key, x = 0) {
  if (!key) return null;
  if (key === 'collar') return kind === 'socks' ? 'sockBand' : 'collar';
  if (key === 'waistband') return 'waistband';
  const m = /^(?:part|area):([A-Za-z]+)/.exec(key);
  if (!m) return null;
  const name = m[1];
  if (name === 'cuffs') return x >= 0 ? 'leftSleeve' : 'rightSleeve';
  if (name === 'leftCuff') return 'leftSleeve';
  if (name === 'rightCuff') return 'rightSleeve';
  if (name === 'collarBand') return 'collar';
  return name;
}

/** The body's part on one side; none on socks (sockprint.js prints their leg, hoops and foot) and track pants (pantsPart). */
function bodyPart(painter, back) {
  if (painter.kind === 'socks' || painter.kind === 'trackpants') return null;
  if (painter.partName === 'shorts') return back ? 'shortsBack' : 'shortsFront';
  return back ? 'back' : 'front';
}
/** Track pants: one look for each whole side (their parts, texture.js printedParts). */
const pantsPart = (back) => (back ? 'shortsBack' : 'shortsFront');
export const PANTS_PARTS = ['shortsFront', 'shortsBack'];

/** The parts a Patterns area stands for on a model split into pieces (design.zones on it). */
function zoneParts(painter, zone) {
  const shorts = painter.partName === 'shorts';
  if (zone === 'body') return shorts ? ['shortsFront', 'shortsBack'] : ['front', 'back'];
  if (zone === 'sleeves') return ['leftSleeve', 'rightSleeve'];
  if (zone === 'hem') return [shorts ? 'shortsHem' : 'hem'];
  return [];
}

/** A polygon (canvas points, a value at each) clipped to where the value is >= 0 (`sign` 1) or <= 0 (`sign` -1). */
function clipPoly(pts, vals, sign) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length, a = vals[i] * sign, b = vals[j] * sign;
    if (a >= 0) out.push(pts[i]);
    if ((a >= 0) !== (b >= 0)) {
      const t = a / (a - b);
      out.push([pts[i][0] + (pts[j][0] - pts[i][0]) * t, pts[i][1] + (pts[j][1] - pts[i][1]) * t]);
    }
  }
  return out;
}

/** The made garment's sleeve at a garment point ({side, x, y}) on the body's piece, or null. */
function bodySleeve(painter, at) {
  const p = partAt(painter.kind, zoneAt(painter.kind, at.x, at.y, at.side), at.side, at.x, at.y);
  return p === 'leftSleeve' || p === 'rightSleeve' ? p : null;
}
/** One side's garment-metre transform on `g` (texture.js side), the print scaled by `k` and moved `dx` pixels. */
function setSide(painter, g, back, k = 1, dx = 0) {
  const { minX, maxX, minY, span } = painter.frame;
  const H = painter.canvas.height * k, s = H / span;
  if (back) g.setTransform(-s, 0, 0, -s, H + maxX * s + dx, H + minY * s);
  else g.setTransform(s, 0, 0, -s, -minX * s + dx, H + minY * s);
}
/** The made garment's sleeve outlines on one side (garment metres). */
const sleeveOutlines = (painter, back) => ['leftSleeve', 'rightSleeve'].flatMap((k) => partRegion(painter.kind, k, back)?.keep ?? []);
const tracePolys = (g, polys) => { for (const poly of polys) { poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); } };
/**
 * The clips of a part on one side, each a function that clips `g` (scale `k`, moved `dx` pixels): its own pieces, and
 * the body's piece (less the sleeve areas for the front or back; only its sleeve area for a sleeve).
 */
function partClips(painter, fp, e, side, k = 1, dx = 0) {
  const out = [], own = e?.paths[side], mode = e?.body[side], bp = fp.body.paths[side];
  if (own) out.push((g) => { g.setTransform(k, 0, 0, k, dx, 0); g.clip(own); });
  if (mode && bp) out.push((g) => {
    g.setTransform(k, 0, 0, k, dx, 0);
    g.clip(bp);
    const polys = mode === 'cut' ? sleeveOutlines(painter, side === 1) : partRegion(painter.kind, mode, side === 1)?.keep ?? [];
    if (mode === 'cut' && !polys.length) return;
    setSide(painter, g, side === 1, k, dx);
    g.beginPath();
    if (mode === 'cut') g.rect(-5, -5, 10, 10);
    tracePolys(g, polys);
    g.clip(mode === 'cut' ? 'evenodd' : 'nonzero');
  });
  return out;
}
/** A part's box on one side in canvas pixels (its pieces and its share of the body's piece). */
function partBox(e, side) {
  const a = e.boxes[side], b = e.bodyBoxes[side];
  if (!a || !b) return a ?? b;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

const cache = new WeakMap();
/**
 * Where each part's pieces are on the print (canvas pixels): `parts` part -> {paths: [front, back] Path2D, boxes}, and
 * `keyed` piece index -> the same plus the parts on it, for the pieces of their own (not the body). Made once per model
 * shape and print; null on a model without pieces.
 */
export function pieceFootprints(painter) {
  const geo = painter.pieceGeometry, keys = painter.model?.keys;
  if (!painter.model?.pieces || !geo || !keys) return null;
  const W = painter.canvas.width, H = painter.canvas.height, f = painter.frame;
  const sig = [W, H, f?.minX, f?.maxX, f?.minY, f?.span, painter.kind, painter.partName, keys.join(',')].join('|');
  const was = cache.get(geo);
  if (was?.sig === sig) return was;
  // (A model with both print places by its sleeves' seams (main.js altUv): the body's piece is printed from `uvBody`.)
  const uv = geo.getAttribute('uv'), ub = painter.model.altUv ? geo.getAttribute('uvBody') : null, pc = geo.getAttribute('piece'), index = geo.index;
  if (!uv || !pc) return null;
  const printed = painter.printedParts;
  const parts = new Map(), keyed = new Map(), body = { paths: [null, null], boxes: [null, null] };
  const entry = (map, name) => {
    let e = map.get(name);
    if (!e) map.set(name, (e = { paths: [null, null], boxes: [null, null], parts: new Set(), body: [null, null], bodyBoxes: [null, null] }));
    return e;
  };
  const grow = (boxes, side, poly) => {
    const b = (boxes[side] ??= [Infinity, Infinity, -Infinity, -Infinity]);
    for (const [x, y] of poly) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  };
  // (Each triangle wound the same way round before it joins a path: a model's inside faces lie on the same print place as
  // its outside, wound the other way, and with the nonzero rule the two would cancel out (r4: the RL Jersey's sleeves and
  // the Football jersey's front painted only in slivers).)
  const addPoly = (e, side, poly) => {
    let area = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
    if (area < 0) poly = [...poly].reverse();
    const p = (e.paths[side] ??= new Path2D());
    p.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) p.lineTo(poly[i][0], poly[i][1]);
    p.closePath();
    grow(e.boxes, side, poly);
  };
  const emit = (ix, poly) => {
    if (poly.length < 3) return;
    let cx = 0, cy = 0;
    for (const [x, y] of poly) { cx += x; cy += y; }
    cx /= poly.length; cy /= poly.length;
    const side = cx >= H ? 1 : 0, key = ix >= 0 ? keys[ix] : null, ofBody = ix < 0 || BODY_KEYS.has(key);
    if (ofBody) {
      // (The body's piece: the front or back there, but the made garment's sleeve areas in it are the sleeves.)
      const named = bodyPart(painter, side === 1);
      if (!named || !printed.includes(named)) return;
      addPoly(body, side, poly);
      const e = entry(parts, named);
      e.body[side] = 'cut';
      grow(e.bodyBoxes, side, poly);
      // (Not on a model whose sleeves are pieces of their own (data ownSleeves, FIXER6 2026-11-27, items 200 / 173): there the
      // body's piece is all body; the made garment's sleeve areas in it painted the sleeve colour on the body.)
      const sleeve = painter.model?.ownSleeves ? null : bodySleeve(painter, painter.fromCanvas(cx, cy));
      if (sleeve && printed.includes(sleeve)) { const sl = entry(parts, sleeve); sl.body[side] = sleeve; grow(sl.bodyBoxes, side, poly); }
      return;
    }
    const named = pieceKeyPart(painter.kind, key, painter.fromCanvas(cx, cy).x);
    if (!named || RIB.has(named) || !printed.includes(named)) return;
    addPoly(entry(parts, named), side, poly);
    const e = entry(keyed, ix);
    e.parts.add(named);
    addPoly(e, side, poly);
  };
  const n = index ? index.count : uv.count;
  for (let t = 0; t + 2 < n; t += 3) {
    const vs = index ? [index.getX(t), index.getX(t + 1), index.getX(t + 2)] : [t, t + 1, t + 2];
    const pts = vs.map((v) => [uv.getX(v) * W, (1 - uv.getY(v)) * H]);
    const ptsB = ub ? vs.map((v) => [ub.getX(v) * W, (1 - ub.getY(v)) * H]) : pts;
    const at = (ix) => (ix < 0 ? ptsB : pts);
    const A = vs.map((v) => pc.getX(v)), B = vs.map((v) => pc.getY(v)), Z = vs.map((v) => pc.getZ(v));
    if (A[0] === A[1] && A[1] === A[2] && B[0] === B[1] && B[1] === B[2]) {
      const a = pieceIx(A[0]), b = pieceIx(B[0]);
      // (Two pieces in one triangle: piece A where the distance is above 0, as the shader's pieceSide.)
      if (a === b) emit(a, at(a));
      else { emit(a, clipPoly(at(a), Z, 1)); emit(b, clipPoly(at(b), Z, -1)); }
    } else {
      // (Corners by different pieces with no line given: the piece in its middle.)
      const a = pieceIx((A[0] + A[1] + A[2]) / 3), b = pieceIx((B[0] + B[1] + B[2]) / 3), c = a === b || Z[0] + Z[1] + Z[2] >= 0 ? a : b;
      emit(c, at(c));
    }
  }
  const out = { sig, parts, keyed, body };
  cache.set(geo, out);
  return out;
}

/** A box in canvas pixels as the part's box in garment metres (its fade's extent). */
function boxOf(painter, b) {
  const p = painter.fromCanvas(b[0], b[3]), q = painter.fromCanvas(b[2], b[1]);
  return [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)];
}

/**
 * The Patterns areas with a pattern on this model: part -> pattern name (the areas' own, texture.js paintZones). 'Solid' is
 * left out: a model split into pieces never showed the areas' plain fills (texture.js: no paintZones on it), and tiles set
 * them (the Training Tee's sleeves and sides), so their looks stay as they are; a part's colour is the Parts panel's.
 */
function zoneLooks(painter, design, fp) {
  const out = new Map();
  for (const [zone, name] of Object.entries(design.zones ?? {})) {
    if (!name || name === 'None' || name === 'Solid') continue;
    for (const part of zoneParts(painter, zone)) if (fp.parts.has(part)) out.set(part, name);
  }
  return out;
}

/** An area's pattern over the current clip, as texture.js paintZones draws it. */
function paintZoneLook(painter, design, name, back) {
  const g = painter.ctx;
  painter.side(back);
  const ink = painter.zoneFill(design, zoneInkSlot(design));
  if (isPicture(name)) {
    const tile = painter.zoneTile(design, name);
    if (!tile) return;
    const pattern = g.createPattern(tile, 'repeat'), k = (design.patternScale ?? 0.3) / tile.width;
    pattern.setTransform(new DOMMatrix([back ? -k : k, 0, 0, -k, 0, 0]));
    g.fillStyle = pattern;
    g.fillRect(-1.6, -0.2, 3.2, 1.8);
  } else if (name === 'Solid') {
    g.fillStyle = ink;
    g.fillRect(-1.6, -0.2, 3.2, 1.8);
  } else painter.proceduralPattern(design, name, ink);
}

/**
 * Each part's own look and each area's pattern inside their pieces on one side (texture.js: after the kit's colour and
 * pattern, under the marks; the areas over the parts, as on a made garment). A piece of its own (a sleeve, a cuff, a
 * band) under a look is first filled in the Main, so the shader puts its plain colour back wherever the print shows the
 * Main (main.js pieceTintW: weight 1) and the kit's pattern stays off it; with a colour of its own the print itself shows
 * there (weight 0).
 */
export function paintPieceParts(painter, design, back) {
  if (!painter.model?.pieces || !(design.parts || design.zones)) return;
  const fp = pieceFootprints(painter);
  if (!fp) return;
  const g = painter.ctx, side = back ? 1 : 0, H = painter.canvas.height, zones = zoneLooks(painter, design, fp);
  const clipTo = (path) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clip(path); };
  for (const [ix, e] of fp.keyed) {
    const path = e.paths[side];
    if (!path || ![...e.parts].some((p) => painter.partStyle(design, p) || zones.has(p))) continue;
    const key = painter.model.keys[ix];
    // (A colour area's piece with no colour of its own ('area:<name>'): the cloth's print shows on it (paintPlains), so its
    // look goes over the kit's as on any other part.)
    if (key.startsWith('area:') && design.zones?.[key.slice(5)] !== 'Solid') continue;
    g.save();
    clipTo(path);
    g.fillStyle = HEX.test(design.main ?? '') ? design.main : painter.baseFill(design);
    g.fillRect(side * H, 0, H, H);
    g.restore();
  }
  for (const [part, e] of fp.parts) {
    const style = painter.partStyle(design, part), box = partBox(e, side);
    if (!style || !box) continue;
    // (A sleeve of its own colour only on a model whose sleeves are pieces of their own (ownSleeves, FIXER6 2026-11-27, item 200):
    // its piece's plain colour (main.js partTint) colours it; painted into the print as well it spilled onto the body beside the
    // raglan edge, where the two share print places, in jagged teeth.)
    if (painter.model?.ownSleeves && /Sleeve$/.test(part) && style.own && !style.pattern && !style.fade && style.opacity >= 1) continue;
    for (const clip of partClips(painter, fp, e, side)) {
      g.save();
      clip(g);
      painter.side(back);
      painter.paintPartLook(design, style, boxOf(painter, box), painter.baseFill(design));
      g.restore();
    }
  }
  for (const [part, name] of zones) {
    for (const clip of partClips(painter, fp, fp.parts.get(part), side)) {
      g.save();
      clip(g);
      paintZoneLook(painter, design, name, back);
      g.restore();
    }
  }
  painter.side(back);
}

/** Track pants: the pants' own look on each whole side (texture.js, the track pants' branch; its outline's clip set). */
export function paintPantsLook(painter, design, back) {
  if (painter.kind !== 'trackpants' || !design.parts) return;
  const style = painter.partStyle(design, pantsPart(back));
  if (!style) return;
  const g = painter.ctx, { minX, maxX, minY, span } = painter.frame;
  g.save();
  painter.side(back);
  painter.paintPartLook(design, style, [minX, minY, maxX, minY + span], painter.baseFill(design));
  g.restore();
  painter.side(back);
}

/**
 * The print shader's weight for a piece's own colour (main.js paintPlains) under its part's look: null keeps it; 1 its
 * colour only where the print shows the Main (the look printed over the Main: paintPieceParts); 0 the print itself (the
 * part's own colour printed there). `hex`: the piece's plain colour.
 */
export function pieceTintW(painter, design, ix, hex) {
  const fp = pieceFootprints(painter), e = fp?.keyed.get(ix);
  if (!e) return null;
  const zones = zoneLooks(painter, design, fp);
  const looks = [...e.parts].map((p) => painter.partStyle(design, p)).filter(Boolean);
  const zoned = [...e.parts].some((p) => zones.has(p));
  if (!looks.length && !zoned) return null;
  if (e.parts.size > 1 || !looks.length) return looks.some((s) => s.own) && e.parts.size === 1 ? 0 : 1;
  const s = looks[0];
  if (!zoned && !s.pattern && !s.fade && (!s.own || s.own.toLowerCase() === String(hex).toLowerCase())) return null;
  return s.own ? 0 : 1;
}

/**
 * The part under a hit (main.js colourAt and pickAt): on a model split into pieces its piece's part (the body: the front
 * or back there); on track pants their side (the pants, never the jacket); else null to keep the made garment's own map
 * (socks' leg, hoops and foot; every other garment). `at`: the hit on the print.
 */
export function piecePartAt(painter, hit, at) {
  if (!at) return null;
  if (painter.kind === 'trackpants') return pantsPart(at.side === 'back');
  if (!painter.model?.pieces || !painter.model.keys || !hit?.face || !hit.uv) return null;
  const geo = hit.object?.geometry, uv = geo?.getAttribute('uv'), pc = geo?.getAttribute('piece');
  if (!uv || !pc) return null;
  const vs = [hit.face.a, hit.face.b, hit.face.c];
  const [p0, p1, p2] = vs.map((v) => [uv.getX(v), uv.getY(v)]);
  const d = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
  const u = hit.uv.x - p0[0], w = hit.uv.y - p0[1];
  const l1 = Math.abs(d) < 1e-14 ? 1 / 3 : (u * (p2[1] - p0[1]) - (p2[0] - p0[0]) * w) / d;
  const l2 = Math.abs(d) < 1e-14 ? 1 / 3 : ((p1[0] - p0[0]) * w - u * (p1[1] - p0[1])) / d;
  const l = [1 - l1 - l2, l1, l2], mix = (get) => vs.reduce((s, v, i) => s + l[i] * get(v), 0);
  const a = pieceIx(mix((v) => pc.getX(v))), b = pieceIx(mix((v) => pc.getY(v))), z = mix((v) => pc.getZ(v));
  const ix = a === b || z >= 0 ? a : b, key = ix >= 0 ? painter.model.keys[ix] : null;
  const named = key && !BODY_KEYS.has(key) ? pieceKeyPart(painter.kind, key, at.x) : null;
  if (named) return named;
  // (The body's piece: a sleeve where the made garment's sleeve area is (sleeves not pieces of their own), else the side.)
  const sleeve = bodySleeve(painter, at);
  return sleeve && painter.printedParts.includes(sleeve) ? sleeve : bodyPart(painter, at.side === 'back');
}

/**
 * The part's glow mask from its pieces (texture.js partMask, white on `g` at scale `k`): true when drawn, false when the
 * part has pieces but none on this side, null when the made garment's map draws it.
 */
export function pieceMask(painter, g, key, back, k) {
  if (painter.kind === 'trackpants' && PANTS_PARTS.includes(key)) {
    if (key !== pantsPart(back)) return false;
    g.save();
    if (painter.model?.pieces) { g.setTransform(k, 0, 0, k, 0, 0); g.fillStyle = '#fff'; g.fillRect(back ? painter.canvas.height : 0, 0, painter.canvas.height, painter.canvas.height); }
    else {
      painter.side(back, g, k);
      g.beginPath();
      painter.outline.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.fillStyle = '#fff';
      g.fill();
    }
    g.restore();
    return true;
  }
  const fp = pieceFootprints(painter), e = fp?.parts.get(key);
  if (!e) return null;
  const clips = partClips(painter, fp, e, back ? 1 : 0, k);
  if (!clips.length) return false;
  for (const clip of clips) {
    g.save();
    clip(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    g.restore();
  }
  return true;
}

/**
 * The kit's AI pattern layer taken off a part with its own colour (texture.js erasePartsFrom; `lg` one side's square,
 * `alpha` how much): true when done here (a piece part), false to use the made garment's map.
 */
export function pieceErase(painter, lg, key, back, alpha) {
  const fp = pieceFootprints(painter), e = fp?.parts.get(key);
  if (!e) return false;
  for (const clip of partClips(painter, fp, e, back ? 1 : 0, 1, back ? -painter.canvas.height : 0)) {
    lg.save();
    clip(lg);
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = 'destination-out';
    lg.globalAlpha = alpha;
    lg.fillStyle = '#000';
    lg.fillRect(0, 0, lg.canvas.width, lg.canvas.height);
    lg.restore();
  }
  return true;
}

/**
 * The Patterns areas this kit can show (main.js, with designApplied): null when every area shows (no model split into
 * pieces, or a garment beside it that paints them all); else the areas with a matching part on its models.
 */
export function pieceAreas(painters) {
  let out = null, pieced = false;
  for (const painter of painters) {
    const fp = painter.kind === 'socks' || painter.kind === 'trackpants' ? null : pieceFootprints(painter);
    if (!fp) { if (painter.kind !== 'trackpants') return null; continue; }
    pieced = true;
    out ??= new Set();
    for (const zone of ['body', 'yoke', 'sleeves', 'sides', 'hem', 'pocket', 'hood']) if (zoneParts(painter, zone).some((p) => fp.parts.has(p))) out.add(zone);
  }
  return pieced ? [...out] : null;
}
