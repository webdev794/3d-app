// Guidelines and snapping (CorelDRAW-style).
// Drag from the top ruler for a horizontal guideline, from the left ruler for
// a vertical one; drag a guideline back onto a ruler to remove it. With Snap
// on, moving objects, dragged nodes and drawing clicks snap to guidelines,
// the page edges and centre, other objects' edges and centres, and their nodes.

import { Point, util } from 'fabric';

const NEAR = 7;  // snap distance in screen pixels
const GRAB = 4;  // how close the pointer must be to pick up a guideline

export function createGuides({ canvas, wrap, rulerH, rulerV, page, objects, canEdit, changed, options = () => ({ guides: true, objects: true, nodes: true, page: true }) }) {
  let guides = { x: [], y: [] };
  let drag = null;     // { axis: 'x' | 'y', index: -1 for a new guideline, v }
  let targets = null;  // snap targets, cached for one mouse interaction

  const tol = () => NEAR / canvas.getZoom();
  const local = (e) => { const r = wrap.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }; };
  const toPage = (e) => { const l = local(e); return util.transformPoint(new Point(l.x, l.y), util.invertTransform(canvas.viewportTransform)); };
  const valueAt = (axis, e) => { const p = toPage(e); return axis === 'x' ? p.x : p.y; };
  const screenOf = (axis, v) => { const t = canvas.viewportTransform; return axis === 'x' ? v * t[0] + t[4] : v * t[3] + t[5]; };

  function hitGuide(e) {
    const l = local(e);
    for (const axis of ['x', 'y']) {
      const i = guides[axis].findIndex((v) => Math.abs(screenOf(axis, v) - (axis === 'x' ? l.x : l.y)) <= GRAB);
      if (i >= 0) return { axis, index: i };
    }
    return null;
  }
  function start(axis, index, e) {
    e.preventDefault(); e.stopPropagation();
    drag = { axis, index, v: valueAt(axis, e) };
    canvas.requestRenderAll();
  }
  rulerH.addEventListener('pointerdown', (e) => { if (e.button === 0) start('y', -1, e); });
  rulerV.addEventListener('pointerdown', (e) => { if (e.button === 0) start('x', -1, e); });
  // Picking up an existing guideline wins over selecting objects under it.
  wrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !canEdit()) return;
    const hit = hitGuide(e);
    if (hit) start(hit.axis, hit.index, e);
  }, true);
  wrap.addEventListener('pointermove', (e) => {
    if (drag || !canEdit()) return;
    const hit = hitGuide(e);
    wrap.style.cursor = hit ? (hit.axis === 'x' ? 'col-resize' : 'row-resize') : '';
  });
  addEventListener('pointermove', (e) => { if (drag) { drag.v = valueAt(drag.axis, e); canvas.requestRenderAll(); } });
  addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag, list = guides[d.axis];
    drag = null;
    if (local(e).inside) { if (d.index >= 0) list[d.index] = d.v; else list.push(d.v); }
    else if (d.index >= 0) list.splice(d.index, 1);
    else { canvas.requestRenderAll(); return; }
    canvas.requestRenderAll();
    changed();
  });

  function draw(ctx) {
    if (!guides.x.length && !guides.y.length && !drag) return;
    const r = canvas.getRetinaScaling(), w = canvas.getWidth(), h = canvas.getHeight();
    ctx.save(); ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
    const line = (axis, v) => {
      const s = Math.round(screenOf(axis, v)) + 0.5;
      ctx.beginPath();
      if (axis === 'x') { ctx.moveTo(s, 0); ctx.lineTo(s, h); } else { ctx.moveTo(0, s); ctx.lineTo(w, s); }
      ctx.stroke();
    };
    ctx.strokeStyle = 'rgba(30,123,255,.95)';
    for (const axis of ['x', 'y']) guides[axis].forEach((v, i) => { if (!(drag && drag.axis === axis && drag.index === i)) line(axis, v); });
    if (drag) { ctx.strokeStyle = '#12E1F0'; line(drag.axis, drag.v); }
    ctx.restore();
  }

  /** Anchor points of a curve (and of everything inside a group), in page units. */
  function nodePoints(o) {
    if (o.type === 'group' || o.type === 'activeselection') return o.getObjects().flatMap(nodePoints);
    if (o.type !== 'path' || !o.path) return [];
    const m = o.calcTransformMatrix(), off = o.pathOffset;
    return o.path.filter((c) => c.length >= 3).map((c) => util.transformPoint(new Point(c[c.length - 2] - off.x, c[c.length - 1] - off.y), m));
  }
  function collect(exclude) {
    const on = options(), xs = [], ys = [], pts = [];
    if (on.guides) { xs.push(...guides.x); ys.push(...guides.y); }
    if (on.page) {
      xs.push(0, page.width / 2, page.width); ys.push(0, page.height / 2, page.height);
      pts.push(new Point(0, 0), new Point(page.width, 0), new Point(0, page.height), new Point(page.width, page.height), new Point(page.width / 2, page.height / 2));
    }
    for (const o of objects()) {
      if (!o.visible || exclude.includes(o)) continue;
      if (on.objects) {
        const b = o.getBoundingRect();
        xs.push(b.left, b.left + b.width / 2, b.left + b.width);
        ys.push(b.top, b.top + b.height / 2, b.top + b.height);
        pts.push(new Point(b.left, b.top), new Point(b.left + b.width, b.top), new Point(b.left, b.top + b.height), new Point(b.left + b.width, b.top + b.height));
      }
      if (on.nodes) pts.push(...nodePoints(o));
    }
    return { xs, ys, pts };
  }
  const nearest = (list, v, t) => { let best = null, bd = t; for (const x of list) { const d = Math.abs(x - v); if (d < bd) { bd = d; best = x; } } return best; };

  /** A point snapped to the nearest node or corner, else to guideline / edge lines. */
  function snapPoint(p, exclude = []) {
    targets ??= collect(exclude);
    const t = tol();
    let best = null, bd = t;
    for (const q of targets.pts) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; } }
    if (best) return new Point(best.x, best.y);
    return new Point(nearest(targets.xs, p.x, t) ?? p.x, nearest(targets.ys, p.y, t) ?? p.y);
  }
  /** Moves a dragged object so an edge or centre meets a guideline or another object. */
  function snapObject(o) {
    targets ??= collect([o, ...(o.type === 'activeselection' ? o.getObjects() : [])]);
    o.setCoords();  // while dragging, the cached corners lag one step behind
    const b = o.getBoundingRect(), t = tol();
    const delta = (mine, lines) => { let best = null; for (const a of mine) for (const l of lines) { const d = l - a; if (Math.abs(d) < t && (best === null || Math.abs(d) < Math.abs(best))) best = d; } return best; };
    const dx = delta([b.left, b.left + b.width / 2, b.left + b.width], targets.xs);
    const dy = delta([b.top, b.top + b.height / 2, b.top + b.height], targets.ys);
    if (dx !== null) o.set('left', o.left + dx);
    if (dy !== null) o.set('top', o.top + dy);
    return { x: dx !== null, y: dy !== null };
  }

  return {
    draw, snapPoint, snapObject,
    forget: () => { targets = null; },
    get: () => ({ x: guides.x.slice(), y: guides.y.slice() }),
    set: (g) => { guides = { x: [...(g?.x ?? [])], y: [...(g?.y ?? [])] }; canvas.requestRenderAll(); },
    clear: () => { guides = { x: [], y: [] }; canvas.requestRenderAll(); changed(); },
    get dragging() { return !!drag; },
  };
}
