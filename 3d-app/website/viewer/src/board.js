// The design board: a flat, Corel-style view of every print panel (front and
// back of each kit part). Artwork layers and the fixed marks (wordmark, crest,
// sponsor, name, number) are dragged, resized, rotated and removed here; the
// wheel or a pinch zooms, dragging empty space pans. Edits flow back to the 3D
// kit live.

const HANDLE = 9;
const MARK = 'mark:';
const MIN_ZOOM = 0.5, MAX_ZOOM = 8;
const HINT = ['DESIGN BOARD', 'drag to move', 'corners resize', 'top handle rotates', 'scroll to zoom', 'drag empty space to pan', 'double-click to fit'];
const HINT_TOUCH = ['DESIGN BOARD', 'drag to move', 'corners resize', 'top handle rotates', 'pinch to zoom', 'drag empty space to pan', 'double-tap to fit'];

export function createBoard({ getParts, getDesign, onLayers, onMarks = () => {}, onSelect = () => {} }) {
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', display: 'none', touchAction: 'none', cursor: 'default' });
  document.body.appendChild(canvas);
  canvas.dataset.designBoard = 'true';
  const g = canvas.getContext('2d');
  let visible = false, rows = [], selected = null, drag = null, pinch = null, sizes = new Map();
  // The view: zoom 1 shows the whole board; pan in device pixels.
  let zoom = 1, panX = 0, panY = 0, lastTap = { t: 0, x: 0, y: 0 };
  const pointers = new Map();
  const dpr = () => Math.min(devicePixelRatio || 1, 2);

  /** The hint along the top, broken into lines that fit the board's width. */
  function hintLines(exporting) {
    if (exporting) return ['3DEEZI DESIGN BOARD  ·  DESIGN PREVIEW'];
    const d = dpr(), max = canvas.width - 32 * d;
    g.font = `600 ${12 * d}px Inter, sans-serif`;
    const lines = [];
    for (const part of matchMedia('(pointer: coarse)').matches ? HINT_TOUCH : HINT) {
      const joined = lines.length ? `${lines[lines.length - 1]}  ·  ${part}` : part;
      if (lines.length && g.measureText(joined).width <= max) lines[lines.length - 1] = joined;
      else lines.push(part);
    }
    return lines;
  }

  /** Board rows: one per kit part, its texture drawn at (ox, oy) with scale k (after the zoom and pan). */
  function layout(lines, exporting) {
    const parts = getParts();
    const d = dpr(), W = canvas.width, H = canvas.height, pad = 28 * d, label = 22 * d;
    const head = (23 + 17 * lines.length) * d;
    const n = parts.length || 1;
    const rowH = Math.max(20, Math.min((H - pad * (n + 1) - label * n - head) / n, (W - pad * 2) / 2));
    const z = exporting ? 1 : zoom, px = exporting ? 0 : panX, py = exporting ? 0 : panY;
    let y = pad + head;
    rows = parts.map((part) => {
      const tex = part.painter.canvas;
      const k = rowH / tex.height;
      const ox = (W - tex.width * k) / 2, oy = y + label;
      y += rowH + label + pad;
      return { part, ox: W / 2 + (ox - W / 2) * z + px, oy: H / 2 + (oy - H / 2) * z + py, k: k * z };
    });
  }

  const rowOf = (part) => rows.find((r) => r.part.painter.partName === (part ?? 'top'));

  /** The fixed marks each part painted (painter.marks), placed as design.marks says. */
  function marks() {
    const out = [], own = getDesign().marks ?? {};
    const num = (v, d) => (Number.isFinite(v) ? v : d);
    for (const row of rows) {
      for (const m of row.part.painter.marks ?? []) {
        const o = own[m.key] ?? {}, scale = num(o.scale, 1);
        out.push({ id: MARK + m.key, mark: m, part: row.part.painter.partName, side: o.side === 'front' || o.side === 'back' ? o.side : m.def.side, x: num(o.x, m.def.x), y: num(o.y, m.def.y), rot: num(o.rot, 0), scale, wM: m.w0 * scale, hM: m.h0 * scale });
      }
    }
    return out;
  }
  /** Everything that can be picked: the marks, then the layers (painted over them). */
  const items = () => [...marks(), ...(getDesign().layers ?? [])];

  /** Item centre, size and rotation in board pixels. */
  function geometry(item) {
    const row = rowOf(item.part);
    if (!row) return null;
    const p = row.part.painter.toCanvas(item.side === 'back', item.x, item.y);
    const size = item.mark ? { w: item.wM, h: item.hM } : sizes.get(item.id) ?? { w: item.w ?? 0.1, h: item.w ?? 0.1 };
    return { row, cx: row.ox + p.x * row.k, cy: row.oy + p.y * row.k, w: size.w * p.s * row.k, h: size.h * p.s * row.k, rot: ((item.rot ?? 0) * Math.PI) / 180 };
  }

  /** Point in an item's own (unrotated, centred) frame. */
  const local = (geo, x, y) => {
    const dx = x - geo.cx, dy = y - geo.cy, c = Math.cos(-geo.rot), s = Math.sin(-geo.rot);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  };

  async function measure() {
    const design = getDesign();
    for (const layer of design.layers ?? []) {
      const row = rowOf(layer.part);
      if (row) sizes.set(layer.id, await row.part.painter.layerSize(layer));
    }
  }

  function render(exporting = false) {
    if (!visible && !exporting) return;
    const d = dpr();
    canvas.width = innerWidth * d;
    canvas.height = innerHeight * d;
    const lines = hintLines(exporting);
    layout(lines, exporting);
    g.fillStyle = '#05090f';
    g.fillRect(0, 0, canvas.width, canvas.height);
    // Drafting grid.
    g.strokeStyle = 'rgba(18,225,240,0.06)';
    g.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 24 * d) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, canvas.height); g.stroke(); }
    for (let y = 0; y < canvas.height; y += 24 * d) { g.beginPath(); g.moveTo(0, y); g.lineTo(canvas.width, y); g.stroke(); }
    g.textAlign = 'center';
    for (const row of rows) {
      const tex = row.part.painter.canvas;
      const painter = row.part.painter;
      g.save();
      g.shadowColor = 'rgba(18,225,240,0.25)';
      g.shadowBlur = 18 * d;
      // Each side clipped to its panel outline so the board shows the cut shapes.
      for (const back of [false, true]) {
        g.save();
        g.beginPath();
        // With any pieces of their own on that side (a hoodie's hood).
        for (const outline of [painter.outline, ...(painter.piecesOn?.(back) ?? [])]) {
          outline.forEach((pt, i) => {
            const c = painter.toCanvas(back, pt.x, pt.y);
            const x = row.ox + c.x * row.k, y = row.oy + c.y * row.k;
            i ? g.lineTo(x, y) : g.moveTo(x, y);
          });
          g.closePath();
        }
        g.save();
        g.clip();
        g.shadowBlur = 0;
        g.drawImage(tex, row.ox, row.oy, tex.width * row.k, tex.height * row.k);
        g.restore();
        g.strokeStyle = 'rgba(18,225,240,0.55)';
        g.lineWidth = 1.5 * d;
        g.stroke();
        g.restore();
        const label = `${painter.partName === 'shorts' ? 'SHORTS' : 'TOP'} · ${back ? 'BACK' : 'FRONT'}`;
        g.fillStyle = '#12E1F0';
        g.font = `700 ${11 * d}px Inter, sans-serif`;
        g.fillText(label, row.ox + (tex.height * row.k) * (back ? 1.5 : 0.5), row.oy - 8 * d);
      }
      g.restore();
    }
    // The hint, over a band when zoomed panels slide under it.
    if (!exporting && (zoom !== 1 || panX || panY)) {
      g.fillStyle = 'rgba(5,9,15,0.86)';
      g.fillRect(0, 0, canvas.width, (14 + 17 * lines.length) * d);
    }
    g.fillStyle = '#9fb2c4';
    g.font = `600 ${12 * d}px Inter, sans-serif`;
    lines.forEach((line, i) => g.fillText(line, canvas.width / 2, (26 + 17 * i) * d));
    // Selection.
    const item = items().find((it) => it.id === selected);
    const geo = item && geometry(item);
    if (geo && !exporting) {
      g.save();
      g.translate(geo.cx, geo.cy);
      g.rotate(geo.rot);
      g.strokeStyle = '#12E1F0';
      g.lineWidth = 1.5 * d;
      g.setLineDash([5 * d, 4 * d]);
      g.strokeRect(-geo.w / 2, -geo.h / 2, geo.w, geo.h);
      g.setLineDash([]);
      g.fillStyle = '#ffffff';
      const hs = HANDLE * d;
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.fillRect((x * geo.w) / 2 - hs / 2, (y * geo.h) / 2 - hs / 2, hs, hs);
      g.beginPath();
      g.moveTo(0, -geo.h / 2);
      g.lineTo(0, -geo.h / 2 - 22 * d);
      g.stroke();
      g.beginPath();
      g.arc(0, -geo.h / 2 - 26 * d, 6 * d, 0, Math.PI * 2);
      g.fill();
      // Delete button (a fixed mark is hidden; Reset layout brings it back).
      g.fillStyle = '#e5484d';
      g.beginPath();
      g.arc(geo.w / 2 + 14 * d, -geo.h / 2 - 14 * d, 10 * d, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 2 * d;
      g.beginPath();
      const bx = geo.w / 2 + 14 * d, by = -geo.h / 2 - 14 * d, r = 4 * d;
      g.moveTo(bx - r, by - r); g.lineTo(bx + r, by + r); g.moveTo(bx + r, by - r); g.lineTo(bx - r, by + r);
      g.stroke();
      g.restore();
    }
  }

  /** Board point (device px) -> { part, side, x, y } on a panel, or null. */
  function toGarment(px, py) {
    for (const row of rows) {
      const tex = row.part.painter.canvas;
      const tx = (px - row.ox) / row.k, ty = (py - row.oy) / row.k;
      if (tx < 0 || ty < 0 || tx > tex.width || ty > tex.height) continue;
      const at = row.part.painter.fromCanvas(tx, ty);
      if (!row.part.painter.contains(at.x, at.y, at.side)) continue;
      return { part: row.part.painter.partName, ...at, painter: row.part.painter };
    }
    return null;
  }

  function hitTest(px, py) {
    const d = dpr();
    const all = items();
    const sel = all.find((it) => it.id === selected);
    const geo = sel && geometry(sel);
    if (geo) {
      const p = local(geo, px, py);
      if (Math.hypot(p.x - (geo.w / 2 + 14 * d), p.y - (-geo.h / 2 - 14 * d)) < 13 * d) return { item: sel, mode: 'delete' };
      if (Math.hypot(p.x, p.y - (-geo.h / 2 - 26 * d)) < 11 * d) return { item: sel, mode: 'rotate', geo };
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        if (Math.abs(p.x - (x * geo.w) / 2) < 12 * d && Math.abs(p.y - (y * geo.h) / 2) < 12 * d) return { item: sel, mode: 'scale', geo };
      }
    }
    for (let i = all.length - 1; i >= 0; i--) {
      const g2 = geometry(all[i]);
      if (!g2) continue;
      const p = local(g2, px, py);
      if (Math.abs(p.x) <= g2.w / 2 + 4 && Math.abs(p.y) <= g2.h / 2 + 4) return { item: all[i], mode: 'move', geo: g2 };
    }
    return null;
  }

  const point = (e) => ({ x: e.clientX * dpr(), y: e.clientY * dpr() });
  const commit = (item, final) => (item.mark ? onMarks({ ...(getDesign().marks ?? {}) }, final) : onLayers([...(getDesign().layers ?? [])], final));
  // The host's selection lists layers only; a selected mark is the board's own.
  const select = (id) => { selected = id; onSelect(id && !id.startsWith(MARK) ? id : null); render(); };

  /** Changes how a fixed mark is placed (design.marks). */
  function setMark(key, patch) {
    const design = getDesign();
    design.marks = { ...(design.marks ?? {}), [key]: { ...(design.marks?.[key] ?? {}), ...patch } };
  }

  /** Removes a layer, or hides a fixed mark. */
  function remove(item) {
    if (item.mark) setMark(item.mark.key, { hidden: true });
    else getDesign().layers = (getDesign().layers ?? []).filter((l) => l.id !== item.id);
    select(null);
    commit(item, true);
  }

  // ---------- the view: zoom about a point, pan, fit
  function clampPan() {
    const W = canvas.width, H = canvas.height;
    panX = Math.max(-W * (0.3 + 0.5 * zoom), Math.min(W * (0.3 + 0.5 * zoom), panX));
    panY = Math.max(-H * (0.3 + 0.5 * zoom), Math.min(H * (0.3 + 0.5 * zoom), panY));
  }
  function zoomAt(x, y, factor) {
    const W = canvas.width, H = canvas.height;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor)), k = next / zoom;
    panX = x - W / 2 - (x - W / 2 - panX) * k;
    panY = y - H / 2 - (y - H / 2 - panY) * k;
    zoom = next;
    clampPan();
    render();
  }
  function fit() { zoom = 1; panX = 0; panY = 0; render(); }

  function startPinch() {
    if (drag && drag.item) commit(drag.item, true);
    drag = null;
    const [a, b] = [...pointers.values()];
    pinch = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), z0: zoom, mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, pan0: { x: panX, y: panY } };
  }
  function movePinch() {
    const [a, b] = [...pointers.values()];
    const W = canvas.width, H = canvas.height;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d0));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Keep the board point that was under the fingers' midpoint under it.
    panX = mid.x - W / 2 - ((pinch.mid0.x - W / 2 - pinch.pan0.x) / pinch.z0) * next;
    panY = mid.y - H / 2 - ((pinch.mid0.y - H / 2 - pinch.pan0.y) / pinch.z0) * next;
    zoom = next;
    clampPan();
    render();
  }

  function hover(p) {
    const hit = hitTest(p.x, p.y);
    canvas.style.cursor = !hit ? 'grab' : { move: 'move', scale: 'nwse-resize', rotate: 'crosshair', delete: 'pointer' }[hit.mode];
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = point(e);
    pointers.set(e.pointerId, p);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
    if (pointers.size === 2) { startPinch(); return; }
    if (pointers.size > 2 || pinch) return;
    const hit = hitTest(p.x, p.y);
    if (!hit) {
      // Empty space: nothing selected; drag to pan; a double tap fits the board again (double-click: below).
      const now = performance.now(), d = dpr();
      if (e.pointerType !== 'mouse' && now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30 * d) {
        lastTap.t = 0;
        selected = null;
        onSelect(null);
        fit();
        return;
      }
      lastTap = { t: now, x: p.x, y: p.y };
      drag = { mode: 'pan', start: p, pan0: { x: panX, y: panY } };
      canvas.style.cursor = 'grabbing';
      select(null);
      return;
    }
    if (hit.mode === 'delete') { remove(hit.item); return; }
    const item = hit.item;
    select(item.id);
    const start = local({ ...hit.geo, rot: 0 }, p.x, p.y);
    drag = { ...hit, start, w0: item.w ?? 0.1, h0: item.h ?? item.w ?? 0.1, size0: item.size ?? 0.06, scale0: item.scale ?? 1, dist0: Math.max(1, Math.hypot(p.x - hit.geo.cx, p.y - hit.geo.cy)), offset: { x: p.x - hit.geo.cx, y: p.y - hit.geo.cy } };
    render();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = point(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch) { if (pointers.size >= 2) movePinch(); return; }
    if (!drag) { if (e.pointerType === 'mouse') hover(p); return; }
    if (drag.mode === 'pan') {
      panX = drag.pan0.x + p.x - drag.start.x;
      panY = drag.pan0.y + p.y - drag.start.y;
      clampPan();
      render();
      return;
    }
    const item = drag.item, geo = drag.geo;
    if (drag.mode === 'move') {
      const at = toGarment(p.x - drag.offset.x, p.y - drag.offset.y);
      if (at && at.part === (item.part ?? 'top')) {
        if (item.mark) setMark(item.mark.key, { side: at.side, x: at.x, y: at.y });
        else Object.assign(item, { side: at.side, x: at.x, y: at.y });
      }
    } else if (drag.mode === 'scale') {
      const f = Math.max(0.15, Math.hypot(p.x - geo.cx, p.y - geo.cy) / drag.dist0);
      if (item.mark) setMark(item.mark.key, { scale: Math.max(0.2, Math.min(5, drag.scale0 * f)) });
      else if (item.type === 'text') item.size = Math.max(0.005, Math.min(0.4, drag.size0 * f));
      else {
        item.w = Math.max(0.005, Math.min(1, drag.w0 * f));
        if (item.type === 'shape') item.h = Math.max(0.005, Math.min(1, drag.h0 * f));
      }
    } else if (drag.mode === 'rotate') {
      let deg = (Math.atan2(p.y - geo.cy, p.x - geo.cx) * 180) / Math.PI + 90;
      if (Math.abs(deg % 45) < 4) deg = Math.round(deg / 45) * 45; // snap to 45°
      if (item.mark) setMark(item.mark.key, { rot: Math.round(deg) });
      else item.rot = Math.round(deg);
    }
    commit(item, false);
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (!drag) return;
    const done = drag;
    drag = null;
    if (done.mode === 'pan') { canvas.style.cursor = 'grab'; return; }
    commit(done.item, true);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = point(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => {
    const p = point(e);
    if (!hitTest(p.x, p.y)) fit();
  });
  addEventListener('keydown', (e) => {
    if (!visible || !selected || !['Delete', 'Backspace'].includes(e.key)) return;
    const item = items().find((it) => it.id === selected);
    if (!item) return;
    e.preventDefault();
    remove(item);
  });
  addEventListener('resize', () => render());

  return {
    get visible() { return visible; },
    async show(on) {
      visible = !!on;
      canvas.style.display = visible ? 'block' : 'none';
      if (visible) { zoom = 1; panX = 0; panY = 0; render(); await measure(); render(); }
    },
    async refresh() { if (visible) { render(); await measure(); render(); } },
    select,
    /** 'in', 'out' or 'fit' (the host's zoom buttons). */
    zoom(how) {
      if (!visible) return;
      if (how === 'fit') fit();
      else zoomAt(canvas.width / 2, canvas.height / 2, how === 'in' ? 1.25 : 0.8);
    },
    /** What is on the board and where (CSS pixels), with the zoom: for automated checks. */
    inspect() {
      const d = dpr();
      return { zoom, panX: panX / d, panY: panY / d, selected, items: items().map((it) => { const geo = geometry(it); return geo && { id: it.id, side: it.side, x: it.x, y: it.y, cx: geo.cx / d, cy: geo.cy / d, w: geo.w / d, h: geo.h / d, rot: it.rot ?? 0 }; }).filter(Boolean) };
    },
    async capture() { render(true); await measure(); render(true); const data = canvas.toDataURL('image/png'); render(); return data; },
    /** Normalised screen point -> garment point on the board, or null. */
    pick(nx, ny) {
      if (!visible) return null;
      const at = toGarment(nx * canvas.width, ny * canvas.height);
      if (!at) return null;
      const { painter, ...rest } = at;
      return { ...rest, kind: painter.kind };
    },
  };
}
