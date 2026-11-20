// Part looks on a ready-made model split into its pieces (client 607, PATTERNDND 2026-11-19): a part's own colour and
// pattern (design.parts), and a Patterns area's pattern (design.zones), drawn inside that part's own piece of the model,
// so every border stays on the model's own lines. (tripomesh.js `piece`: per point the two pieces by it and its distance
// from their line; main.js addRelief colours each piece up to that smooth line, and this follows the same line on the
// print.) The body (no piece of its own) is the front on the front's half of the print and the back on the back's, so a
// front's pattern runs to the side seams; a sleeve, a cuff, a hem band or the socks' top band is its own piece. Track
// pants: their front and back look covers each whole side (the pants, never the jacket). Nothing here paints for a
// design without such a look, so every other look is drawn as before.

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
  const uv = geo.getAttribute('uv'), pc = geo.getAttribute('piece'), index = geo.index;
  if (!uv || !pc) return null;
  const printed = painter.printedParts;
  const parts = new Map(), keyed = new Map();
  const entry = (map, name) => {
    let e = map.get(name);
    if (!e) map.set(name, (e = { paths: [null, null], boxes: [null, null], parts: new Set() }));
    return e;
  };
  const addPoly = (e, side, poly) => {
    const p = (e.paths[side] ??= new Path2D());
    p.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) p.lineTo(poly[i][0], poly[i][1]);
    p.closePath();
    const b = (e.boxes[side] ??= [Infinity, Infinity, -Infinity, -Infinity]);
    for (const [x, y] of poly) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  };
  const emit = (ix, poly) => {
    if (poly.length < 3) return;
    let cx = 0, cy = 0;
    for (const [x, y] of poly) { cx += x; cy += y; }
    cx /= poly.length; cy /= poly.length;
    const side = cx >= H ? 1 : 0, key = ix >= 0 ? keys[ix] : null, body = ix < 0 || BODY_KEYS.has(key);
    const named = body ? bodyPart(painter, side === 1) : pieceKeyPart(painter.kind, key, painter.fromCanvas(cx, cy).x);
    if (!named || RIB.has(named) || !printed.includes(named)) return;
    addPoly(entry(parts, named), side, poly);
    if (!body) { const e = entry(keyed, ix); e.parts.add(named); addPoly(e, side, poly); }
  };
  const n = index ? index.count : uv.count;
  for (let t = 0; t + 2 < n; t += 3) {
    const vs = index ? [index.getX(t), index.getX(t + 1), index.getX(t + 2)] : [t, t + 1, t + 2];
    const pts = vs.map((v) => [uv.getX(v) * W, (1 - uv.getY(v)) * H]);
    const A = vs.map((v) => pc.getX(v)), B = vs.map((v) => pc.getY(v)), Z = vs.map((v) => pc.getZ(v));
    if (A[0] === A[1] && A[1] === A[2] && B[0] === B[1] && B[1] === B[2]) {
      const a = pieceIx(A[0]), b = pieceIx(B[0]);
      // (Two pieces in one triangle: piece A where the distance is above 0, as the shader's pieceSide.)
      if (a === b) emit(a, pts);
      else { emit(a, clipPoly(pts, Z, 1)); emit(b, clipPoly(pts, Z, -1)); }
    } else {
      // (Corners by different pieces with no line given: the piece in its middle.)
      const a = pieceIx((A[0] + A[1] + A[2]) / 3), b = pieceIx((B[0] + B[1] + B[2]) / 3);
      emit(a === b || Z[0] + Z[1] + Z[2] >= 0 ? a : b, pts);
    }
  }
  const out = { sig, parts, keyed };
  cache.set(geo, out);
  return out;
}

/** A box in canvas pixels as the part's box in garment metres (its fade's extent). */
function boxOf(painter, b) {
  const p = painter.fromCanvas(b[0], b[3]), q = painter.fromCanvas(b[2], b[1]);
  return [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)];
}

/** The Patterns areas with a pattern on this model: part -> pattern name (the areas' own, texture.js paintZones). */
function zoneLooks(painter, design, fp) {
  const out = new Map();
  for (const [zone, name] of Object.entries(design.zones ?? {})) {
    if (!name || name === 'None') continue;
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
    const path = e.paths[side], style = path ? painter.partStyle(design, part) : null;
    if (!style) continue;
    g.save();
    clipTo(path);
    painter.side(back);
    painter.paintPartLook(design, style, boxOf(painter, e.boxes[side]), painter.baseFill(design));
    g.restore();
  }
  for (const [part, name] of zones) {
    const path = fp.parts.get(part).paths[side];
    if (!path) continue;
    g.save();
    clipTo(path);
    paintZoneLook(painter, design, name, back);
    g.restore();
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
  return named ?? bodyPart(painter, at.side === 'back');
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
  const e = pieceFootprints(painter)?.parts.get(key);
  if (!e) return null;
  const path = e.paths[back ? 1 : 0];
  if (!path) return false;
  g.save();
  g.setTransform(k, 0, 0, k, 0, 0);
  g.fillStyle = '#fff';
  g.fill(path);
  g.restore();
  return true;
}

/**
 * The kit's AI pattern layer taken off a part with its own colour (texture.js erasePartsFrom; `lg` one side's square,
 * `alpha` how much): true when done here (a piece part), false to use the made garment's map.
 */
export function pieceErase(painter, lg, key, back, alpha) {
  const e = pieceFootprints(painter)?.parts.get(key);
  if (!e) return false;
  const path = e.paths[back ? 1 : 0];
  if (!path) return true;
  lg.save();
  lg.setTransform(1, 0, 0, 1, back ? -painter.canvas.height : 0, 0);
  lg.clip(path);
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.globalCompositeOperation = 'destination-out';
  lg.globalAlpha = alpha;
  lg.fillStyle = '#000';
  lg.fillRect(0, 0, lg.canvas.width, lg.canvas.height);
  lg.restore();
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
