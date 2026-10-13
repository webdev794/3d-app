// The design board: a flat, Corel-style view of every print panel (front and
// back of each kit part) where artwork layers are dragged, resized, rotated
// and deleted. Edits flow back to the 3D kit live.

const HANDLE = 9;

export function createBoard({ getParts, getDesign, onLayers }) {
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', display: 'none', touchAction: 'none', cursor: 'default' });
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  let visible = false, rows = [], selected = null, drag = null, sizes = new Map();
  const dpr = () => Math.min(devicePixelRatio || 1, 2);

  /** Board rows: one per kit part, its texture drawn at (ox, oy) with scale k. */
  function layout() {
    const parts = getParts();
    const W = canvas.width, H = canvas.height, pad = 28 * dpr(), label = 22 * dpr();
    const n = parts.length;
    const rowH = Math.min((H - pad * (n + 1) - label * n - 40 * dpr()) / n, (W - pad * 2) / 2);
    let y = pad + 40 * dpr();
    rows = parts.map((part) => {
      const tex = part.painter.canvas;
      const k = rowH / tex.height;
      const row = { part, ox: (W - tex.width * k) / 2, oy: y + label, k };
      y += rowH + label + pad;
      return row;
    });
  }

  const rowFor = (layer) => rows.find((r) => r.part.painter.partName === (layer.part ?? 'top'));

  /** Layer centre, size and rotation in board pixels. */
  function geometry(layer) {
    const row = rowFor(layer);
    if (!row) return null;
    const p = row.part.painter.toCanvas(layer.side === 'back', layer.x, layer.y);
    const size = sizes.get(layer.id) ?? { w: layer.w ?? 0.1, h: layer.w ?? 0.1 };
    return { row, cx: row.ox + p.x * row.k, cy: row.oy + p.y * row.k, w: size.w * p.s * row.k, h: size.h * p.s * row.k, rot: ((layer.rot ?? 0) * Math.PI) / 180 };
  }

  /** Point in a layer's own (unrotated, centred) frame. */
  const local = (geo, x, y) => {
    const dx = x - geo.cx, dy = y - geo.cy, c = Math.cos(-geo.rot), s = Math.sin(-geo.rot);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  };

  async function measure() {
    const design = getDesign();
    for (const layer of design.layers ?? []) {
      const row = rowFor(layer);
      if (row) sizes.set(layer.id, await row.part.painter.layerSize(layer));
    }
  }

  function render() {
    if (!visible) return;
    const d = dpr();
    canvas.width = innerWidth * d;
    canvas.height = innerHeight * d;
    layout();
    g.fillStyle = '#05090f';
    g.fillRect(0, 0, canvas.width, canvas.height);
    // Drafting grid.
    g.strokeStyle = 'rgba(18,225,240,0.06)';
    g.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 24 * d) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, canvas.height); g.stroke(); }
    for (let y = 0; y < canvas.height; y += 24 * d) { g.beginPath(); g.moveTo(0, y); g.lineTo(canvas.width, y); g.stroke(); }
    g.fillStyle = '#9fb2c4';
    g.font = `600 ${12 * d}px Inter, sans-serif`;
    g.textAlign = 'center';
    g.fillText('DESIGN BOARD  ·  drag to move  ·  corners resize  ·  top handle rotates', canvas.width / 2, 26 * d);
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
        painter.outline.forEach((pt, i) => {
          const c = painter.toCanvas(back, pt.x, pt.y);
          const x = row.ox + c.x * row.k, y = row.oy + c.y * row.k;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        });
        g.closePath();
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
    // Selection.
    const layer = (getDesign().layers ?? []).find((l) => l.id === selected);
    const geo = layer && geometry(layer);
    if (geo) {
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
      // Delete button.
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
      return { part: row.part.painter.partName, ...row.part.painter.fromCanvas(tx, ty), painter: row.part.painter };
    }
    return null;
  }

  function hitTest(px, py) {
    const d = dpr();
    const layers = getDesign().layers ?? [];
    const sel = layers.find((l) => l.id === selected);
    const geo = sel && geometry(sel);
    if (geo) {
      const p = local(geo, px, py);
      if (Math.hypot(p.x - (geo.w / 2 + 14 * d), p.y - (-geo.h / 2 - 14 * d)) < 13 * d) return { layer: sel, mode: 'delete' };
      if (Math.hypot(p.x, p.y - (-geo.h / 2 - 26 * d)) < 11 * d) return { layer: sel, mode: 'rotate', geo };
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        if (Math.abs(p.x - (x * geo.w) / 2) < 12 * d && Math.abs(p.y - (y * geo.h) / 2) < 12 * d) return { layer: sel, mode: 'scale', geo };
      }
    }
    for (let i = layers.length - 1; i >= 0; i--) {
      const g2 = geometry(layers[i]);
      if (!g2) continue;
      const p = local(g2, px, py);
      if (Math.abs(p.x) <= g2.w / 2 + 4 && Math.abs(p.y) <= g2.h / 2 + 4) return { layer: layers[i], mode: 'move', geo: g2 };
    }
    return null;
  }

  const point = (e) => ({ x: e.clientX * dpr(), y: e.clientY * dpr() });
  const commit = (final) => onLayers([...(getDesign().layers ?? [])], final);

  canvas.addEventListener('pointerdown', (e) => {
    const p = point(e);
    const hit = hitTest(p.x, p.y);
    if (!hit) { selected = null; render(); return; }
    if (hit.mode === 'delete') {
      getDesign().layers = (getDesign().layers ?? []).filter((l) => l !== hit.layer);
      selected = null;
      commit(true);
      return;
    }
    selected = hit.layer.id;
    canvas.setPointerCapture(e.pointerId);
    const start = local({ ...hit.geo, rot: 0 }, p.x, p.y);
    drag = { ...hit, start, w0: hit.layer.w ?? 0.1, size0: (sizes.get(hit.layer.id)?.h ?? 0.06), dist0: Math.hypot(p.x - hit.geo.cx, p.y - hit.geo.cy), offset: { x: p.x - hit.geo.cx, y: p.y - hit.geo.cy } };
    render();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = point(e), layer = drag.layer, geo = drag.geo;
    if (drag.mode === 'move') {
      const at = toGarment(p.x - drag.offset.x, p.y - drag.offset.y);
      if (at && at.part === (layer.part ?? 'top')) Object.assign(layer, { side: at.side, x: at.x, y: at.y });
    } else if (drag.mode === 'scale') {
      const f = Math.max(0.15, Math.hypot(p.x - geo.cx, p.y - geo.cy) / drag.dist0);
      if (layer.type === 'text') layer.size = Math.min(0.4, drag.size0 * f);
      else layer.w = Math.min(0.6, drag.w0 * f);
    } else if (drag.mode === 'rotate') {
      let deg = (Math.atan2(p.y - geo.cy, p.x - geo.cx) * 180) / Math.PI + 90;
      if (Math.abs(deg % 45) < 4) deg = Math.round(deg / 45) * 45; // snap to 45°
      layer.rot = Math.round(deg);
    }
    commit(false);
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    commit(true);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  addEventListener('keydown', (e) => {
    if (!visible || !selected || !['Delete', 'Backspace'].includes(e.key)) return;
    getDesign().layers = (getDesign().layers ?? []).filter((l) => l.id !== selected);
    selected = null;
    commit(true);
  });
  addEventListener('resize', () => render());

  return {
    get visible() { return visible; },
    async show(on) {
      visible = !!on;
      canvas.style.display = visible ? 'block' : 'none';
      if (visible) { await measure(); render(); }
    },
    async refresh() { if (visible) { await measure(); render(); } },
    select(id) { selected = id; render(); },
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
