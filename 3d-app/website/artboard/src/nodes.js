// CorelDRAW-style Shape tool (F10): edit the nodes and Bézier handles of any
// curve, plus the Smooth / Roughen / Attract / Repel brushes.
// Coordinates are page (world) units; hit testing is in screen pixels.

import { modelToD, objectModel, setWorldPath, segmentPoints, splitBezier, nearestOnSegment, bezierAt, lerp, cloneModel } from './vector.js';

// Grab distances in px, larger for fingers.
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const HIT = COARSE ? 16 : 7;          // node / handle
const SEG_HIT = COARSE ? 14 : 6;      // segment
const key = (s, n) => `${s}:${n}`;
const unkey = (k) => k.split(':').map(Number);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y);

export function createNodeEditor(cfg) {
  const { canvas } = cfg;
  let target = null, model = null, sel = new Set(), drag = null, marquee = null, brush = null;

  const vpt = () => canvas.viewportTransform;
  const toScreen = (p) => ({ x: p.x * vpt()[0] + vpt()[4], y: p.y * vpt()[3] + vpt()[5] });
  const dist = (a, b) => { const A = toScreen(a), B = toScreen(b); return Math.hypot(A.x - B.x, A.y - B.y); };
  const nodeAt = (k) => { const [s, n] = unkey(k); return model?.[s]?.nodes[n]; };
  const segCount = (s) => (s.closed ? s.nodes.length : s.nodes.length - 1);
  const segEnds = (s, i) => [s.nodes[i], s.nodes[(i + 1) % s.nodes.length]];

  function write() {
    if (!target) return;
    const d = modelToD(model);
    if (!d) { const o = target; end(); cfg.remove(o); return; }
    setWorldPath(target, d);
    cfg.refill?.(target);
    canvas.requestRenderAll();
  }
  function commit() { if (target) cfg.commit(target); cfg.changed?.(); }

  /** Start editing an object (converted to curves first if needed). */
  function start(o) {
    if (!o) return false;
    const path = cfg.toPath(o);
    if (!path) return false;
    target = path;
    model = objectModel(path);
    setWorldPath(path, modelToD(model));
    sel = new Set();
    canvas.requestRenderAll();
    cfg.changed?.();
    return true;
  }
  function end() { target = null; model = null; sel = new Set(); drag = null; marquee = null; canvas.requestRenderAll(); cfg.changed?.(); }
  /** Re-read the target after an outside change (fill colour, undo, …). */
  function refresh() { if (target && canvas.getObjects().includes(target)) model = objectModel(target); else if (target) end(); }

  // -----------------------------------------------------------------
  // Hit testing
  // -----------------------------------------------------------------
  function visibleHandles() {
    const out = [];
    for (const k of sel) {
      const [s, n] = unkey(k), sp = model[s], nd = sp?.nodes[n];
      if (!nd) continue;
      if (nd.hi) out.push({ s, n, which: 'hi', p: nd.hi, from: nd });
      if (nd.ho) out.push({ s, n, which: 'ho', p: nd.ho, from: nd });
      const prev = n > 0 ? n - 1 : sp.closed ? sp.nodes.length - 1 : -1, next = n < sp.nodes.length - 1 ? n + 1 : sp.closed ? 0 : -1;
      if (prev >= 0 && sp.nodes[prev].ho) out.push({ s, n: prev, which: 'ho', p: sp.nodes[prev].ho, from: sp.nodes[prev] });
      if (next >= 0 && sp.nodes[next].hi) out.push({ s, n: next, which: 'hi', p: sp.nodes[next].hi, from: sp.nodes[next] });
    }
    return out;
  }
  const hitHandle = (p) => visibleHandles().find((h) => dist(h.p, p) <= HIT);
  function hitNode(p) {
    let best = null;
    model.forEach((s, si) => s.nodes.forEach((n, ni) => { const d = dist(n, p); if (d <= HIT && (!best || d < best.d)) best = { s: si, n: ni, d }; }));
    return best;
  }
  function hitSegment(p) {
    let best = null;
    model.forEach((s, si) => {
      for (let i = 0; i < segCount(s); i++) {
        const [a, b] = segEnds(s, i), pts = segmentPoints(a, b);
        const r = nearestOnSegment(pts, p, !a.ho && !b.hi), d = dist(r.point, p);
        if (d <= SEG_HIT && (!best || d < best.d)) best = { s: si, i, t: r.t, d };
      }
    });
    return best;
  }

  // -----------------------------------------------------------------
  // Mouse
  // -----------------------------------------------------------------
  function down(p, e) {
    if (!target) { const o = cfg.objectAt(p); if (o) start(o); return; }
    const h = hitHandle(p);
    if (h) { drag = { kind: 'handle', ...h }; return; }
    const n = hitNode(p);
    if (n) {
      const k = key(n.s, n.n);
      if (e.shiftKey) { if (sel.has(k)) sel.delete(k); else sel.add(k); }
      else if (!sel.has(k)) sel = new Set([k]);
      drag = { kind: 'nodes', from: p, orig: cloneModel(model), moved: false };
      cfg.changed?.(); canvas.requestRenderAll();
      return;
    }
    const sg = hitSegment(p);
    if (sg) {
      const sp = model[sg.s];
      sel = new Set([key(sg.s, sg.i), key(sg.s, (sg.i + 1) % sp.nodes.length)]);
      drag = { kind: 'segment', ...sg, from: p, orig: cloneModel(model), moved: false };
      cfg.changed?.(); canvas.requestRenderAll();
      return;
    }
    const other = cfg.objectAt(p);
    if (other && other !== target) { start(other); return; }
    marquee = { a: p, b: p, add: e.shiftKey };
  }
  function move(p, e) {
    if (brush) brush.at = p;
    if (marquee) { marquee.b = p; canvas.requestRenderAll(); return; }
    if (!drag) { if (brush) canvas.requestRenderAll(); return; }
    if (drag.kind === 'handle') {
      const nd = model[drag.s].nodes[drag.n], other = drag.which === 'hi' ? 'ho' : 'hi';
      nd[drag.which] = { x: p.x, y: p.y };
      if ((nd.type === 'smooth' || nd.type === 'symmetric') && nd[other] && !e.altKey) {
        const v = sub(p, nd), l = len(v) || 1, ol = nd.type === 'symmetric' ? l : len(sub(nd[other], nd));
        nd[other] = { x: nd.x - (v.x / l) * ol, y: nd.y - (v.y / l) * ol };
      }
      write();
      return;
    }
    const dx = p.x - drag.from.x, dy = p.y - drag.from.y;
    if (!drag.moved && dist(p, drag.from) < 3) return;
    drag.moved = true;
    model = cloneModel(drag.orig);
    if (drag.kind === 'nodes') {
      for (const k of sel) {
        const nd = nodeAt(k);
        if (!nd) continue;
        nd.x += dx; nd.y += dy;
        if (nd.hi) { nd.hi.x += dx; nd.hi.y += dy; }
        if (nd.ho) { nd.ho.x += dx; nd.ho.y += dy; }
      }
    } else if (drag.kind === 'segment') {
      // Reshape the curve so the grabbed point follows the pointer.
      const sp = model[drag.s], [a, b] = segEnds(sp, drag.i);
      if (!a.ho && !b.hi) { a.ho = lerp(a, b, 1 / 3); b.hi = lerp(a, b, 2 / 3); }
      const t = Math.min(0.95, Math.max(0.05, drag.t));
      const k = 1 / (3 * t * (1 - t) * ((1 - t) ** 2 + t * t));
      a.ho = { x: a.ho.x + dx * (1 - t) * k, y: a.ho.y + dy * (1 - t) * k };
      b.hi = { x: b.hi.x + dx * t * k, y: b.hi.y + dy * t * k };
      // Keep smooth neighbours smooth.
      for (const [nd, which] of [[a, 'ho'], [b, 'hi']]) {
        const other = which === 'ho' ? 'hi' : 'ho';
        if ((nd.type === 'smooth' || nd.type === 'symmetric') && nd[other]) {
          const v = sub(nd[which], nd), l = len(v) || 1, ol = nd.type === 'symmetric' ? l : len(sub(nd[other], nd));
          nd[other] = { x: nd.x - (v.x / l) * ol, y: nd.y - (v.y / l) * ol };
        }
      }
    }
    write();
  }
  function up(p) {
    if (marquee) {
      const m = marquee; marquee = null;
      if (dist(m.a, m.b) < 4) { if (!m.add) sel = new Set(); }
      else {
        const x0 = Math.min(m.a.x, m.b.x), x1 = Math.max(m.a.x, m.b.x), y0 = Math.min(m.a.y, m.b.y), y1 = Math.max(m.a.y, m.b.y);
        if (!m.add) sel = new Set();
        model.forEach((s, si) => s.nodes.forEach((n, ni) => { if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) sel.add(key(si, ni)); }));
      }
      cfg.changed?.(); canvas.requestRenderAll();
      return;
    }
    if (drag) { const moved = drag.kind === 'handle' || drag.moved; drag = null; if (moved) commit(); }
  }
  function dblclick(p) {
    if (!target) return;
    const n = hitNode(p);
    if (n) { sel = new Set([key(n.s, n.n)]); op('delete'); return; }
    const sg = hitSegment(p);
    if (sg) { splitSegment(sg.s, sg.i, sg.t, true); write(); commit(); }
  }

  // -----------------------------------------------------------------
  // Node operations (property bar)
  // -----------------------------------------------------------------
  function splitSegment(s, i, t, select) {
    const sp = model[s], [a, b] = segEnds(sp, i);
    const straight = !a.ho && !b.hi;
    let mid;
    if (straight) mid = { ...lerp(a, b, t), hi: null, ho: null, type: 'cusp' };
    else {
      const [l, r] = splitBezier(segmentPoints(a, b), t);
      a.ho = l[1]; b.hi = r[2];
      mid = { x: l[3].x, y: l[3].y, hi: l[2], ho: r[1], type: 'smooth' };
    }
    sp.nodes.splice(i + 1, 0, mid);
    // Keys after the insert point shift by one.
    sel = new Set([...sel].map((k) => { const [ss, nn] = unkey(k); return ss === s && nn > i ? key(ss, nn + 1) : k; }));
    if (select) sel = new Set([key(s, i + 1)]);
    return i + 1;
  }
  const selectedBySub = () => {
    const m = new Map();
    for (const k of sel) { const [s, n] = unkey(k); if (model[s]?.nodes[n]) { if (!m.has(s)) m.set(s, []); m.get(s).push(n); } }
    for (const v of m.values()) v.sort((a, b) => a - b);
    return m;
  };
  function makeSmooth(sp, n, symmetric) {
    const nd = sp.nodes[n], N = sp.nodes.length;
    const prev = n > 0 ? sp.nodes[n - 1] : sp.closed ? sp.nodes[N - 1] : null, next = n < N - 1 ? sp.nodes[n + 1] : sp.closed ? sp.nodes[0] : null;
    nd.type = symmetric ? 'symmetric' : 'smooth';
    let dir;
    if (nd.hi && nd.ho) dir = sub(nd.ho, nd.hi);
    else if (prev && next) dir = sub(next, prev);
    else dir = nd.ho ? sub(nd.ho, nd) : nd.hi ? sub(nd, nd.hi) : next ? sub(next, nd) : prev ? sub(nd, prev) : { x: 1, y: 0 };
    const l = len(dir) || 1, u = { x: dir.x / l, y: dir.y / l };
    let li = nd.hi ? len(sub(nd.hi, nd)) : prev ? len(sub(nd, prev)) / 3 : 0, lo = nd.ho ? len(sub(nd.ho, nd)) : next ? len(sub(next, nd)) / 3 : 0;
    if (symmetric) li = lo = (li + lo) / 2 || li || lo;
    if (prev || nd.hi) nd.hi = { x: nd.x - u.x * li, y: nd.y - u.y * li };
    if (next || nd.ho) nd.ho = { x: nd.x + u.x * lo, y: nd.y + u.y * lo };
  }
  function op(name) {
    if (!target) return;
    const by = selectedBySub();
    if (name === 'selectAll') { sel = new Set(); model.forEach((s, si) => s.nodes.forEach((_, ni) => sel.add(key(si, ni)))); cfg.changed?.(); canvas.requestRenderAll(); return; }
    if (!by.size && !['reverse'].includes(name)) { cfg.toast('Select one or more nodes first (click a node, or drag a box around nodes)'); return; }
    if (name === 'add') {
      for (const [s, ns] of [...by.entries()]) for (const n of ns.slice().reverse()) { const sp = model[s]; if (n < segCount(sp)) splitSegment(s, n, 0.5, false); }
    } else if (name === 'delete') {
      for (const [s, ns] of by) { const sp = model[s]; for (const n of ns.slice().reverse()) sp.nodes.splice(n, 1); }
      model = model.filter((s) => s.nodes.length > (s.closed ? 1 : 1));
      for (const s of model) if (s.nodes.length < 2) s.closed = false;
      model = model.filter((s) => s.nodes.length >= 2);
      sel = new Set();
    } else if (name === 'toLine' || name === 'toCurve') {
      for (const [s, ns] of by) {
        const sp = model[s], N = sp.nodes.length;
        for (const n of ns) {
          const pi = n > 0 ? n - 1 : sp.closed ? N - 1 : -1;
          const pairs = pi >= 0 ? [[sp.nodes[pi], sp.nodes[n]]] : n < N - 1 ? [[sp.nodes[n], sp.nodes[n + 1]]] : [];
          for (const [a, b] of pairs) {
            if (name === 'toLine') { a.ho = null; b.hi = null; a.type = 'cusp'; b.type = 'cusp'; }
            else if (!a.ho && !b.hi) { a.ho = lerp(a, b, 1 / 3); b.hi = lerp(a, b, 2 / 3); }
          }
        }
      }
    } else if (name === 'cusp') {
      for (const [s, ns] of by) for (const n of ns) model[s].nodes[n].type = 'cusp';
    } else if (name === 'smooth' || name === 'symmetric') {
      for (const [s, ns] of by) for (const n of ns) makeSmooth(model[s], n, name === 'symmetric');
    } else if (name === 'reverse') {
      const subs = by.size ? [...by.keys()] : model.map((_, i) => i);
      for (const s of subs) { const sp = model[s]; sp.nodes.reverse(); for (const nd of sp.nodes) [nd.hi, nd.ho] = [nd.ho, nd.hi]; }
      sel = new Set();
    } else if (name === 'close') {
      for (const s of by.keys()) model[s].closed = true;
    } else if (name === 'break') {
      // Split at each selected node: a closed path opens there, an open one splits in two.
      const [[s, ns]] = by;
      const sp = model[s], n = ns[0], nd = sp.nodes[n];
      const copy = { ...nd, hi: null, ho: nd.ho && { ...nd.ho }, type: 'cusp' };
      if (sp.closed) {
        sp.nodes = [copy, ...sp.nodes.slice(n + 1), ...sp.nodes.slice(0, n), { ...nd, ho: null, type: 'cusp' }];
        sp.closed = false;
      } else if (n > 0 && n < sp.nodes.length - 1) {
        const tail = { closed: false, nodes: [copy, ...sp.nodes.slice(n + 1)] };
        sp.nodes = [...sp.nodes.slice(0, n), { ...nd, ho: null, type: 'cusp' }];
        model.splice(s + 1, 0, tail);
      } else { cfg.toast('Pick a node in the middle of an open curve, or any node of a closed one'); return; }
      sel = new Set();
    } else if (name === 'join' || name === 'extend') {
      const ends = [...sel].map(unkey).filter(([s, n]) => model[s] && !model[s].closed && (n === 0 || n === model[s].nodes.length - 1));
      if (ends.length !== 2) { cfg.toast('Select two end nodes of open curves (Shift+click)'); return; }
      let [[s1, n1], [s2, n2]] = ends;
      if (s1 === s2) {
        const sp = model[s1];
        if (name === 'join') { const a = sp.nodes[0], b = sp.nodes.at(-1); a.x = b.x = (a.x + b.x) / 2; a.y = b.y = (a.y + b.y) / 2; a.hi = b.hi; sp.nodes.pop(); }
        sp.closed = true;
      } else {
        // Orient so path 1 ends at n1 and path 2 starts at n2, then concatenate.
        const A = model[s1], B = model[s2];
        const flip = (sp) => { sp.nodes.reverse(); for (const nd of sp.nodes) [nd.hi, nd.ho] = [nd.ho, nd.hi]; };
        if (n1 === 0) flip(A);
        if (n2 !== 0) flip(B);
        let nodes = B.nodes;
        if (name === 'join') {
          const a = A.nodes.at(-1), b = nodes[0];
          a.x = (a.x + b.x) / 2; a.y = (a.y + b.y) / 2; a.ho = b.ho; nodes = nodes.slice(1);
        }
        A.nodes.push(...nodes);
        model.splice(s2, 1);
      }
      sel = new Set();
    } else if (name === 'extract') {
      const subs = [...by.keys()];
      if (subs.length === model.length) { cfg.toast('Select nodes on one part of a combined curve to extract it'); return; }
      const parts = subs.map((s) => model[s]);
      model = model.filter((_, i) => !subs.includes(i));
      sel = new Set();
      write();
      cfg.extract(target, modelToD(parts));
      commit();
      return;
    }
    write();
    commit();
    canvas.requestRenderAll();
  }
  function nudge(dx, dy) {
    if (!target || !sel.size) return false;
    for (const k of sel) {
      const nd = nodeAt(k);
      if (!nd) continue;
      nd.x += dx; nd.y += dy;
      if (nd.hi) { nd.hi.x += dx; nd.hi.y += dy; }
      if (nd.ho) { nd.ho.x += dx; nd.ho.y += dy; }
    }
    write(); commit();
    return true;
  }

  // -----------------------------------------------------------------
  // Sculpting brushes (work on the selected objects)
  // -----------------------------------------------------------------
  let sculpt = null;
  function brushDown(kind, objs, p, radius) {
    const targets = objs.map((o) => cfg.toPath(o)).filter(Boolean).map((o) => ({ o, model: objectModel(o), touched: new Set() }));
    if (!targets.length) { cfg.toast('Select the objects to shape first, then drag over their outlines'); return; }
    sculpt = { kind, targets, radius, last: p };
    brushStep(p);
  }
  function brushStep(p) {
    if (!sculpt) return;
    const { kind, radius: R } = sculpt;
    for (const t of sculpt.targets) {
      let changed = false;
      t.model.forEach((sp, si) => {
        if (kind === 'roughen') {
          // Turn segments under the brush into a jagged edge (once per stroke).
          for (let i = segCount(sp) - 1; i >= 0; i--) {
            const [a, b] = segEnds(sp, i), mid = bezierAt(segmentPoints(a, b), 0.5);
            const id = `${si}:${Math.round(a.x)}:${Math.round(a.y)}`;
            if (Math.hypot(mid.x - p.x, mid.y - p.y) > R || t.touched.has(id)) continue;
            const pts = segmentPoints(a, b), L = Math.hypot(b.x - a.x, b.y - a.y), k = Math.max(4, Math.min(24, Math.round(L / (R / 3))));
            const amp = Math.max(1.5, R / 8), extra = [];
            for (let j = 1; j < k; j++) {
              const q = bezierAt(pts, j / k), q2 = bezierAt(pts, Math.min(1, j / k + 0.01)), dx = q2.x - q.x, dy = q2.y - q.y, l = Math.hypot(dx, dy) || 1;
              const s = j % 2 ? amp : -amp;
              extra.push({ x: q.x - (dy / l) * s, y: q.y + (dx / l) * s, hi: null, ho: null, type: 'cusp' });
            }
            a.ho = null; b.hi = null;
            sp.nodes.splice(i + 1, 0, ...extra);
            for (const e of extra) t.touched.add(`${si}:${Math.round(e.x)}:${Math.round(e.y)}`);
            t.touched.add(id); changed = true;
          }
          return;
        }
        for (const nd of sp.nodes) {
          const d = Math.hypot(nd.x - p.x, nd.y - p.y);
          if (d > R) continue;
          const f = 1 - d / R;
          let dx = 0, dy = 0;
          if (kind === 'attract' || kind === 'repel') {
            const s = (kind === 'attract' ? 0.12 : -0.12) * f;
            dx = (p.x - nd.x) * s; dy = (p.y - nd.y) * s;
            if (kind === 'repel' && d < 1) { dx = R * 0.05; }
          } else if (kind === 'smooth') {
            const N = sp.nodes.length, i = sp.nodes.indexOf(nd);
            const prev = i > 0 ? sp.nodes[i - 1] : sp.closed ? sp.nodes[N - 1] : null, next = i < N - 1 ? sp.nodes[i + 1] : sp.closed ? sp.nodes[0] : null;
            if (!prev || !next) continue;
            dx = ((prev.x + next.x) / 2 - nd.x) * 0.25 * f; dy = ((prev.y + next.y) / 2 - nd.y) * 0.25 * f;
          }
          nd.x += dx; nd.y += dy;
          if (nd.hi) { nd.hi.x += dx; nd.hi.y += dy; }
          if (nd.ho) { nd.ho.x += dx; nd.ho.y += dy; }
          if (kind === 'smooth') makeSmooth(sp, sp.nodes.indexOf(nd), false);
          changed = true;
        }
      });
      if (changed) { setWorldPath(t.o, modelToD(t.model)); cfg.refill?.(t.o); }
    }
    canvas.requestRenderAll();
  }
  function brushUp() {
    if (!sculpt) return;
    for (const t of sculpt.targets) cfg.commit(t.o);
    sculpt = null;
  }
  function setBrush(b) { brush = b; canvas.requestRenderAll(); }

  // -----------------------------------------------------------------
  // Overlay
  // -----------------------------------------------------------------
  function draw(ctx) {
    const r = canvas.getRetinaScaling(), v = vpt();
    if (brush?.at) {
      ctx.save(); ctx.setTransform(r, 0, 0, r, 0, 0);
      const c = toScreen(brush.at);
      ctx.strokeStyle = '#12E1F0'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(c.x, c.y, brush.radius * v[0], 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (!target || !model) return;
    ctx.save();
    ctx.setTransform(r * v[0], 0, 0, r * v[3], r * v[4], r * v[5]);
    ctx.strokeStyle = '#12E1F0'; ctx.lineWidth = 1 / v[0];
    ctx.stroke(new Path2D(modelToD(model)));
    ctx.setTransform(r, 0, 0, r, 0, 0);
    // Handles.
    ctx.lineWidth = 1; ctx.strokeStyle = '#7B4DFF'; ctx.fillStyle = '#7B4DFF';
    for (const h of visibleHandles()) {
      const a = toScreen(h.from), b = toScreen(h.p);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Nodes: squares (cusp) and circles (smooth); selected ones filled.
    model.forEach((s, si) => s.nodes.forEach((n, ni) => {
      const q = toScreen(n), on = sel.has(key(si, ni)), size = ni === 0 ? 4.5 : 3.5;
      ctx.beginPath();
      if (n.type === 'cusp') ctx.rect(q.x - size, q.y - size, size * 2, size * 2); else ctx.arc(q.x, q.y, size + 0.5, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#12E1F0' : '#ffffff'; ctx.fill();
      ctx.strokeStyle = on ? '#04131c' : '#1E7BFF'; ctx.lineWidth = 1.2; ctx.stroke();
    }));
    if (marquee) {
      const a = toScreen(marquee.a), b = toScreen(marquee.b);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = '#12E1F0'; ctx.fillStyle = 'rgba(18,225,240,.08)';
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    ctx.restore();
  }

  return {
    start, end, refresh, down, move, up, dblclick, op, nudge, draw,
    brushDown, brushStep, brushUp, setBrush,
    get target() { return target; },
    get selectedCount() { return sel.size; },
    get nodeCount() { return model ? model.reduce((a, s) => a + s.nodes.length, 0) : 0; },
    selectedType() { const t = [...sel].map((k) => nodeAt(k)?.type).filter(Boolean); return t.length && t.every((x) => x === t[0]) ? t[0] : null; },
  };
}
