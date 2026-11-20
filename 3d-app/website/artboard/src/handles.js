// Selection handles as in CorelDRAW (Pick tool).
// One click on an object: the 6 sizing handles the client asked for (2026-10-21): the 4 corners and the middle of the
// left and right sides; no handle at the middle of the top and bottom, no rotation stick. The height alone changes with
// the H box on the property bar (Keep proportions off) or Shift + a corner drag (free resize).
// A click on the selected object again (a click, not a drag): the rotate and slant handles. Curved arrows at the
// corners turn it round the centre of rotation (the circle, in the middle at first: drag it anywhere), straight arrows
// at the middle of the sides slant it (top and bottom: sideways, left and right: up and down). The next click brings
// the sizing handles back. Dragging the object moves it in both modes. Text: a double-click (a double tap) types in it.
import { ActiveSelection, Control, Point, controlsUtils, util } from 'fabric';

const BLUE = '#1E7BFF', HALO = '#ffffff';
const OUT = 9; // the rotate and slant arrows sit this far (screen pixels) outside the corners and sides
// Which handles show. Sizing (one click): 6, the corners and the left and right middles (corners resize, the side ones
// stretch the width); the top and bottom middles are hidden, so they cannot be grabbed either. Rotating (a second
// click): 8 arrows (4 corners turn, 4 sides slant) and the centre of rotation.
const SIZING = { tl: true, tr: true, bl: true, br: true, ml: true, mr: true, mt: false, mb: false, mtr: false };
const ROTATING = { tl: true, tr: true, bl: true, br: true, ml: true, mr: true, mt: true, mb: true, mtr: false };
const rad = (d) => (d * Math.PI) / 180;
const svgCursor = (body, fallback) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#fff" stroke-width="4">${body}</g><g stroke="#000" stroke-width="1.6">${body}</g></svg>`)}") 12 12, ${fallback}`;
const ROTATE_CURSOR = svgCursor('<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M17.6 3.4v4.2h-4.2"/>', 'crosshair');
const isTouch = (e) => e?.pointerType === 'touch' || /^touch/.test(e?.type ?? '');
const typable = (o) => typeof o?.enterEditing === 'function' && o.editable !== false;

/** Draws a handle twice, a white halo and then blue, so it shows on the page and on the dark area round it. */
function paint(ctx, draw) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [colour, width] of [[HALO, 4.6], [BLUE, 2]]) {
    ctx.strokeStyle = ctx.fillStyle = colour; ctx.lineWidth = width;
    draw(colour === HALO);
  }
}
/** An arrowhead whose tip is just past (x, y), pointing along the unit vector (dx, dy). */
function head(ctx, x, y, dx, dy, halo) {
  ctx.beginPath();
  ctx.moveTo(x + dx * 3, y + dy * 3);
  ctx.lineTo(x - dx * 2 - dy * 3.6, y - dy * 2 + dx * 3.6);
  ctx.lineTo(x - dx * 2 + dy * 3.6, y - dy * 2 - dx * 3.6);
  ctx.closePath();
  if (halo) ctx.stroke();
  ctx.fill();
}
/** A curved double arrow round a corner (turn 0 = the bottom-right corner; 90, 180, 270 the others clockwise). */
function cornerArrow(ctx, x, y, turn) {
  const r = 12, a0 = rad(6), a1 = rad(84); // round the corner itself: its ends point along the two sides
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rad(turn));
  ctx.translate(-r * Math.SQRT1_2, -r * Math.SQRT1_2); // the arc's centre lies towards the object
  paint(ctx, (halo) => {
    ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.stroke();
    head(ctx, r * Math.cos(a0), r * Math.sin(a0), Math.sin(a0), -Math.cos(a0), halo);
    head(ctx, r * Math.cos(a1), r * Math.sin(a1), -Math.sin(a1), Math.cos(a1), halo);
  });
  ctx.restore();
}
/** A straight double arrow along the side (turn 0 = left and right). */
function sideArrow(ctx, x, y, turn) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rad(turn));
  paint(ctx, (halo) => {
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke();
    head(ctx, 5, 0, 1, 0, halo); head(ctx, -5, 0, -1, 0, halo);
  });
  ctx.restore();
}
/** The centre of rotation: a ring with a dot. */
function pivotMark(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  paint(ctx, (halo) => {
    ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, halo ? 3 : 2, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

/**
 * canvas: the Fabric canvas. enabled(): true while clicks may switch the handles (the Pick tool is on).
 * hint(text): shows a line of help at the bottom of the page area ('' hides it); hintEl: that line's element.
 * style: the handle colours, given to a selection of several objects too.
 */
export function createHandles({ canvas, enabled, hint, hintEl, style }) {
  let xf = null; // { o, local, saved }: the rotate / slant handles are on for o (local = the centre of rotation in o's own plane)
  let down = null, lastClick = null, said = '';
  const say = (text) => { said = text; hint(text); };
  const unsay = () => { if (said && hintEl.textContent === said) hint(''); said = ''; };
  const modeHint = () => (matchMedia('(max-width: 900px)').matches
    ? 'Corner arrows rotate · side arrows slant · tap again to resize'
    : 'Rotate: drag a corner arrow · Slant: drag a side arrow · Drag the circle to move the centre of rotation · Click again to resize');

  /** The centre of rotation on the page. */
  const pivotOf = (o) => util.transformPoint(xf?.o === o ? xf.local : new Point(0, 0), o.calcTransformMatrix());

  /** Turns the object round the centre of rotation by the angle the pointer moves round it (Ctrl or Shift: 15° steps). */
  const rotate = (e, t, x, y) => {
    const o = t.target;
    if (o.lockRotation) return false;
    const s = (t.round ??= (() => { const pv = pivotOf(o); return { pv, a0: Math.atan2(t.ey - pv.y, t.ex - pv.x), angle: o.angle || 0, c: o.getCenterPoint() }; })());
    let angle = s.angle + ((Math.atan2(y - s.pv.y, x - s.pv.x) - s.a0) * 180) / Math.PI;
    if (e.ctrlKey || e.shiftKey) angle = Math.round(angle / 15) * 15;
    angle = ((angle % 360) + 360) % 360;
    if (Math.abs(angle - (((o.angle || 0) % 360) + 360) % 360) < 1e-6) return false;
    const d = rad(angle - s.angle), cos = Math.cos(d), sin = Math.sin(d), dx = s.c.x - s.pv.x, dy = s.c.y - s.pv.y;
    o.set('angle', angle);
    o.setPositionByOrigin(new Point(s.pv.x + dx * cos - dy * sin, s.pv.y + dx * sin + dy * cos), 'center', 'center');
    say(`Rotation ${Math.round(angle * 10) / 10}° · Ctrl or Shift: 15° steps`);
    return true;
  };
  const turnControl = (x, y, turn) => new Control({
    x, y, offsetX: Math.sign(x) * OUT, offsetY: Math.sign(y) * OUT, sizeX: 24, sizeY: 24, touchSizeX: 38, touchSizeY: 38,
    actionName: 'rotate', actionHandler: controlsUtils.wrapWithFireEvent('rotating', rotate),
    cursorStyleHandler: (e, c, o) => (o.lockRotation ? 'not-allowed' : ROTATE_CURSOR),
    render: (ctx, left, top, _s, o) => cornerArrow(ctx, left, top, turn + o.getTotalAngle()),
  });
  /**
   * Slants the object along its own width (top and bottom arrows) or height (left and right arrows), as in CorelDRAW:
   * the side with the arrow follows the pointer and the opposite side stays where it was, whatever the object's
   * rotation (Ctrl or Shift: the slant in 15° steps). The shear is worked out in the object's own (turned) frame and
   * given back to Fabric as scale and skew, so the object keeps its rotation.
   */
  const slant = (key) => (e, t, x, y) => {
    const o = t.target, across = key === 'mt' || key === 'mb';
    if (o[across ? 'lockSkewingX' : 'lockSkewingY']) return false;
    const s = (t.slant ??= (() => { const dim = o._getTransformedDimensions(), a = rad(o.angle || 0); return { cos: Math.cos(a), sin: Math.sin(a), c: o.getCenterPoint(), L: util.calcDimensionsMatrix(o), span: Math.max(1e-6, across ? dim.y : dim.x), flipX: !!o.flipX, flipY: !!o.flipY }; })());
    // How far the pointer moved along the object's own x (top / bottom arrows) or y (left / right arrows).
    const dx = x - t.ex, dy = y - t.ey;
    let d = across ? dx * s.cos + dy * s.sin : -dx * s.sin + dy * s.cos;
    if (e.ctrlKey || e.shiftKey) d = s.span * Math.tan(Math.round(Math.atan2(d, s.span) / rad(15)) * rad(15));
    const k = ({ mt: -1, mb: 1, ml: -1, mr: 1 }[key] * d) / s.span;
    // The shear (about the object's middle line), then back to Fabric's scale · skewX · skewY.
    const [a0, b0, c0, d0] = s.L;
    const [a1, b1, c1, d1] = across ? [a0 + k * b0, b0, c0 + k * d0, d0] : [a0, b0 + k * a0, c0, d0 + k * c0];
    if (Math.abs(d1) < 1e-6) return false;
    const ty = b1 / d1, sx = a1 - c1 * ty;
    if (Math.abs(sx) < 1e-6) return false;
    const tx = c1 / sx, scaleX = s.flipX ? -sx : sx, scaleY = s.flipY ? -d1 : d1;
    if (!(scaleX > 0 && scaleY > 0) || Math.abs(tx) > 25 || Math.abs(ty) > 25) return false; // a slant too far to undo by eye
    o.set({ scaleX, scaleY, skewX: (Math.atan(tx) * 180) / Math.PI, skewY: (Math.atan(ty) * 180) / Math.PI });
    // The middle moves half as far as the pointer: the opposite side stays put.
    const mx = across ? d / 2 : 0, my = across ? 0 : d / 2;
    o.setPositionByOrigin(new Point(s.c.x + mx * s.cos - my * s.sin, s.c.y + mx * s.sin + my * s.cos), 'center', 'center');
    say(`Slant ${Math.round((Math.atan2(d, s.span) * 1800) / Math.PI) / 10}° · Ctrl or Shift: 15° steps`);
    return true;
  };
  const slantControl = (key) => {
    const across = key === 'mt' || key === 'mb', x = { ml: -0.5, mr: 0.5 }[key] ?? 0, y = { mt: -0.5, mb: 0.5 }[key] ?? 0;
    return new Control({
      x, y, offsetX: Math.sign(x) * OUT, offsetY: Math.sign(y) * OUT, sizeX: across ? 24 : 16, sizeY: across ? 16 : 24, touchSizeX: 36, touchSizeY: 36,
      actionName: across ? 'skewX' : 'skewY', actionHandler: controlsUtils.wrapWithFireEvent('skewing', slant(key)),
      cursorStyleHandler: controlsUtils.skewCursorStyleHandler,
      render: (ctx, left, top, _s, o) => sideArrow(ctx, left, top, (across ? 0 : 90) + o.getTotalAngle()),
    });
  };
  const pivotControl = () => new Control({
    x: 0, y: 0, sizeX: 18, sizeY: 18, touchSizeX: 34, touchSizeY: 34, actionName: 'pivot', cursorStyle: 'crosshair',
    positionHandler: (_dim, _m, o) => util.transformPoint(pivotOf(o), canvas.viewportTransform),
    actionHandler: (e, t, x, y) => {
      const o = t.target;
      if (xf?.o !== o) return false;
      let p = new Point(x, y);
      // It snaps to the middle, the corners and the middle of each side (where the handles are) when close.
      const [tl, tr, br, bl] = o.getCoords(), mid = (a, b) => new Point((a.x + b.x) / 2, (a.y + b.y) / 2);
      const snap = [o.getCenterPoint(), tl, tr, br, bl, mid(tl, tr), mid(tr, br), mid(br, bl), mid(bl, tl)]
        .map((q) => [q, Math.hypot(q.x - p.x, q.y - p.y) * canvas.getZoom()]).sort((a, b) => a[1] - b[1])[0];
      if (snap[1] < 8) p = snap[0];
      xf.local = util.transformPoint(p, util.invertTransform(o.calcTransformMatrix()));
      o.setCoords();
      canvas.requestRenderAll();
      return false; // the object itself does not change
    },
    render: (ctx, left, top) => pivotMark(ctx, left, top),
  });

  function on(o) {
    off();
    xf = { o, local: new Point(0, 0), saved: o.controls };
    // The centre of rotation is last: it is picked before the others where they overlap (small objects).
    o.controls = { tl: turnControl(-0.5, -0.5, 180), tr: turnControl(0.5, -0.5, 270), br: turnControl(0.5, 0.5, 0), bl: turnControl(-0.5, 0.5, 90), mt: slantControl('mt'), mb: slantControl('mb'), ml: slantControl('ml'), mr: slantControl('mr'), pivot: pivotControl() };
    o.setControlsVisibility(ROTATING); // all 8 arrows: the top and bottom ones too (hidden while sizing)
    o.setCoords();
    say(modeHint());
    canvas.requestRenderAll();
  }
  function off() {
    if (!xf) return;
    const { o, saved } = xf;
    xf = null;
    o.controls = saved;
    o.setControlsVisibility(SIZING);
    o.setCoords();
    unsay();
    canvas.requestRenderAll();
  }
  /** One click on an object: the corners and the middle of the left and right sides, no rotation stick (rotating is a click away). */
  function sizing(o) {
    if (!o) return;
    o.setControlsVisibility(SIZING);
    if (o instanceof ActiveSelection && style) o.set(style);
  }
  /** Typing in a text from a double-click (a double tap on phones): the cursor goes where it was clicked. */
  function startTyping(o, e) {
    off();
    o.selected = false;
    if (!o.canvas || o.isEditing) return;
    if (canvas.getActiveObject() !== o) canvas.setActiveObject(o);
    o.enterEditing(e);
    const i = o.getSelectionStartFromPointer(e);
    o.setSelectionStart(i); o.setSelectionEnd(i);
    canvas.requestRenderAll();
  }

  // A new selection (or none) starts with the sizing handles.
  for (const ev of ['selection:created', 'selection:updated']) canvas.on(ev, () => { off(); sizing(canvas.getActiveObject()); });
  canvas.on('selection:cleared', () => off());
  canvas.on('text:editing:entered', () => off());
  canvas.on('mouse:down', (opt) => {
    const e = opt.e, p = canvas.getViewportPoint(e);
    down = { o: opt.target ?? null, already: !!opt.alreadySelected, corner: opt.transform?.corner || '', x: p.x, y: p.y, at: performance.now(), touch: isTouch(e), mod: e.shiftKey || e.ctrlKey || e.metaKey || e.altKey };
  });
  canvas.on('mouse:up', (opt) => {
    const d = down;
    down = null;
    if (xf && said !== modeHint()) say(modeHint()); // after a turn or slant: the help again instead of the angle
    // A press on a handle is a turn, a slant or a move of the centre (a click on the centre counts as one on the object).
    if (!d?.o || d.mod || (d.corner && d.corner !== 'pivot')) { lastClick = null; return; }
    const p = canvas.getViewportPoint(opt.e), now = performance.now();
    // A click, not a drag (a finger may move a little; held long, it opens the right-click menu instead).
    if (Math.hypot(p.x - d.x, p.y - d.y) > (d.touch ? 10 : 4) || (d.touch && now - d.at > 500)) { lastClick = null; return; }
    const o = d.o, prev = lastClick;
    lastClick = { o, at: now, x: p.x, y: p.y };
    if (!enabled() || canvas.getActiveObject() !== o || o.isEditing) return;
    // Fingers give no double-click: two quick taps on a text type in it.
    if (d.touch && typable(o) && !o.group && prev?.o === o && now - prev.at < 450 && Math.hypot(p.x - prev.x, p.y - prev.y) < 24) { lastClick = null; startTyping(o, opt.e); return; }
    if (!d.already || !o.hasControls || o.locked || o.connSpec || o.nodePick) return;
    if (typable(o)) o.selected = false; // the click switches the handles (Fabric would start typing)
    if (xf?.o === o) off(); else on(o);
  });
  // A double-click on a text types in it (after Fabric's own double-click, so no word is selected).
  canvas.on('mouse:dblclick', (opt) => {
    const o = opt.target, e = opt.e;
    if (!enabled() || !typable(o) || o.group || o.isEditing || o.locked) return;
    queueMicrotask(() => startTyping(o, e));
  });

  return {
    /** 'size' (the 6 sizing handles) or 'rotate' (rotate and slant handles). */
    mode: () => (xf ? 'rotate' : 'size'),
    /** Switches the handles of the selected object, as a second click on it does. */
    toggle: () => { const o = canvas.getActiveObject(); if (!o || o.locked) return; if (xf?.o === o) off(); else on(o); },
    off,
    /** The centre of rotation on the page while the rotate handles are on. */
    pivot: () => (xf ? pivotOf(xf.o) : null),
  };
}
