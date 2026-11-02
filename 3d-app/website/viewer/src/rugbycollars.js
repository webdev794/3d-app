import * as THREE from 'three';

// The rugby collar library's finishes on the 3D jersey (NK1 2026-11-02, client mockup images/300 "Rugby Jersey Studio";
// the collars themselves: necks.js RUGBY_COLLARS) and a rugby jersey's fit (design.fit). Each collar is the jersey's
// neck cut round, V or shallow V (necks.js neckCut) plus: its collar band's width and stripes (the 3D rib's own colours),
// tipped shoulders, a grandad stand, the wing collar (wingcollar.js), a fold-down polo collar with its buttons (made
// as FN8's Rugby Polo collar, polocollar.js, but for any neck), and the prints under the neck (a V insert, a crossover,
// the button placket). "Final shape to match supplier pattern": these are the looks, not cutting patterns.

const HEX = /^#[0-9a-f]{6}$/i;
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The jersey's spec for the collar: its band's width, a grandad collar's stand, a fold-down collar (rim hidden). */
export function collarSpec(spec, collar) {
  if (!collar) return spec;
  const rim = { ...spec.rim, width: collar.band?.width ?? spec.rim.width };
  if (collar.stand) Object.assign(rim, { stand: collar.stand, width: Math.max(rim.width ?? 0.011, 0.026) });
  return { ...spec, rim, rugbyCollar: collar.id };
}

/**
 * A rugby jersey's fit (design.fit): Classic hangs loose from the chest, a little fuller to the hem (a traditional cut);
 * Pro / Athletic is the jersey as matched to the tile pictures (no change); Tight / Compression sits close to the body,
 * the chest and shoulders shaped, the waist in, few creases. Only where the cloth sits changes: the print stays.
 */
export function fitSpec(spec, fit) {
  if (fit === 'classic') return { ...spec, loose: true, hemFlare: 0.085, fit };
  if (fit === 'tight') return { ...spec, loose: false, tight: { fit: 0.91, crease: 0.45, relief: 1.7, chest: 0.035, waist: 0.12, pitLift: 0.06, trap: 0.004 }, fit };
  return spec;
}

/** The collar's colours from the design: its band (the rim's own colour), stripes, insert and placket. */
export function collarColours(design, band) {
  const accent = HEX.test(design.accent ?? '') ? design.accent : '#16b4f0';
  // A contrast to the band (the cards' royal blue on a cyan collar): the accent, else the Secondary, else royal blue.
  const differs = (a, b) => { if (!HEX.test(a ?? '') || !HEX.test(b ?? '')) return false; const A = new THREE.Color(a), B = new THREE.Color(b); return Math.abs(A.r - B.r) + Math.abs(A.g - B.g) + Math.abs(A.b - B.b) > 0.45; };
  const insert = differs(accent, band) ? accent : differs(design.secondary, band) ? design.secondary : '#0b5bd3';
  return { band, inner: design.main, accent: insert, white: '#ffffff', secondary: design.secondary, placket: insert };
}

/**
 * The collar band's own colours (vertex colours over the rib, rugby collars only): `stripes` across it ([from, to] up
 * its outside face, 0 at its foot on the body, 1 at its top edge; past 1 on over the fold) and, with `tips`, short bars
 * where it meets the shoulder seams. `rim` is the collar rib's mesh (garment.js buildCollar: v runs up the outside face
 * (0 to 5/14), over the fold, down the inside).
 */
export function paintCollarBand(rim, collar, colours) {
  const m = rim.material, geo = rim.geometry, uv = geo.getAttribute('uv'), pos = geo.getAttribute('position');
  const stripes = collar?.band?.stripes ?? [];
  if (!collar || (!stripes.length && !collar.tips)) { if (m.vertexColors) { m.vertexColors = false; m.needsUpdate = true; } return; }
  const base = m.color.clone(), col = new Float32Array(uv.count * 3);
  // Where the band meets the shoulders: its outermost points across.
  let reach = 0;
  for (let i = 0; i < pos.count; i++) reach = Math.max(reach, Math.abs(pos.getX(i)));
  for (let i = 0; i < uv.count; i++) {
    const v = uv.getY(i), face = v <= 5 / 14 ? v / (5 / 14) : 1 + (v - 5 / 14) / (6 / 14);
    let c = base;
    for (const [from, to, ink] of stripes) if (face >= from && face <= to) c = new THREE.Color(colours[ink] ?? ink);
    // Tipped: two bars across the band over each shoulder (the outer 1.2 to 2.6 cm of its width).
    const ax = Math.abs(pos.getX(i));
    if (collar.tips && ax > reach - 0.03 && ax < reach - 0.012 && face <= 1.05) c = new THREE.Color(colours.accent);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.color.set(0xffffff);
  if (!m.vertexColors) { m.vertexColors = true; m.needsUpdate = true; }
}

/** The panel's outward normal on the worn garment (finite differences of garment.surface). */
function normalAt(garment, x, y, back) {
  const e = 0.004;
  const dx = garment.surface(x + e, y, back).sub(garment.surface(x - e, y, back)), dy = garment.surface(x, y + e, back).sub(garment.surface(x, y - e, back));
  const n = new THREE.Vector3().crossVectors(dx, dy).normalize();
  if ((back ? -1 : 1) * n.z < 0) n.negate();
  return n;
}

/** The front neck's foot (garment metres) and the neck's end at the shoulder seam. */
function neckEnds(garment) {
  const edge = garment.neckEdge ?? [];
  const foot = edge.reduce((low, p) => (Math.abs(p.x) < 0.012 ? Math.min(low, p.y) : low), Infinity);
  const end = edge.reduce((far, p) => (Math.abs(p.x) > far[0] ? [Math.abs(p.x), p.y] : far), [0, 0]);
  return { foot: Number.isFinite(foot) ? foot : garment.neckTip ?? 0.7, nx: end[0] || 0.088, ny: end[1] || 0.738 };
}

/** One button (a flat dome about 11 mm across, a rim and its holes' dip), facing +z. */
function buttonGeometry() {
  const profile = [[0, 0.0016], [0.0024, 0.0015], [0.0042, 0.0016], [0.0052, 0.0013], [0.0056, 0.0007], [0.0055, 0], [0.0045, -0.0004], [0, -0.0004]];
  const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), 28);
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** The placket's place on the front (garment metres): its half width, top (the neck's foot) and foot, its buttons. */
export function placketOf(garment, collar) {
  if (!collar?.placket) return null;
  const { foot } = neckEnds(garment), top = foot + 0.004, bottom = foot - collar.placket.length, n = collar.placket.buttons;
  const buttons = Array.from({ length: n }, (_, k) => top - 0.017 - (k * (top - bottom - 0.03)) / Math.max(1, n - 1));
  return { half: collar.fold ? 0.019 : 0.016, top, bottom, buttons };
}

/**
 * The collar's 3D pieces besides the band: a fold-down collar (a stand round the neck seam, folded over, its fall lying
 * back over the shoulders and spread into two points at the front) and the placket's buttons. Returns
 * { group, collar: material | null, buttons: material | null }.
 */
export function buildCollarParts(garment, collar) {
  const group = new THREE.Group();
  group.name = 'rugby-collar';
  let fold = null, buttons = null;
  const placket = placketOf(garment, collar);
  if (collar?.fold && garment.neckEdge?.length > 4) {
    const { foot, nx, ny } = neckEnds(garment);
    const gap = placket ? placket.half - 0.001 : 0.004;
    const tip = [Math.max(0.07, nx + 0.008), foot - 0.012], ctrl = [nx + 0.03, foot + 0.006], seam = [nx + 0.046, ny - 0.012];
    // The neckline loop, from the front's middle round the back, three columns between each edge point.
    const front = garment.neckEdge.map((p) => ({ x: p.x, y: p.y, back: false }));
    const back = garment.neckEdge.slice().reverse().map((p) => ({ x: p.x, y: p.y, back: true }));
    let loop = [...front, ...back];
    loop = loop.flatMap((a, k) => { const b = loop[(k + 1) % loop.length]; return [0, 1 / 3, 2 / 3].map((t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, back: t < 0.5 ? a.back : b.back })); });
    loop.forEach((q) => { q.p = garment.surface(q.x, q.y, q.back).addScaledVector(normalAt(garment, q.x, q.y, q.back), 0.0015); });
    const centre = loop.reduce((best, q, k) => (!q.back && Math.abs(q.x) < Math.abs(loop[best].x) ? k : best), 0);
    const cols = [...loop.slice(centre), ...loop.slice(0, centre)].filter((q) => q.back || Math.abs(q.x) >= gap);
    const C = cols.reduce((s, q) => s.add(q.p), new THREE.Vector3()).divideScalar(cols.length);
    const up = new THREE.Vector3(0, 1, 0);
    const land = (q) => {
      const s = Math.sign(q.x) || 1, ax = Math.abs(q.x);
      if (!q.back) {
        const t = smooth(0, 1, (ax - gap) / (nx - 0.006 - gap)), u = 1 - t;
        return [s * (u * u * tip[0] + 2 * u * t * ctrl[0] + t * t * seam[0]), u * u * tip[1] + 2 * u * t * ctrl[1] + t * t * seam[1]];
      }
      const w = smooth(0.03, 0.082, ax);
      return [s * (ax + (seam[0] - ax) * w), q.y - 0.015 + (seam[1] - (q.y - 0.015)) * w];
    };
    const STAND = 8, FOLD = 6, FALL = 16, ROWS = STAND + FOLD + FALL, pos = [];
    cols.forEach((q, c) => {
      const g = Math.sin((Math.PI * c) / (cols.length - 1));
      // The stand: 1.4 cm at the front ends, 2.6 cm at the back.
      const H = THREE.MathUtils.lerp(0.014, 0.026, smooth(0.1, 0.9, g));
      const O = new THREE.Vector3(q.p.x - C.x, 0, q.p.z - C.z).normalize(), P = q.p;
      for (let k = 0; k < STAND; k++) pos.push(P.clone().addScaledVector(O, 0.0012).addScaledVector(up, -0.006 + ((H + 0.006) * k) / (STAND - 1)));
      const [lx, ly] = land(q), S0 = garment.surface(q.x, q.y, q.back), fix = P.clone().sub(S0), fall = [];
      for (let k = 0; k < FALL; k++) {
        const u = k / (FALL - 1), x = q.x + (lx - q.x) * u, y = q.y + (ly - q.y) * u;
        const S = garment.surface(x, y, q.back).addScaledVector(fix, 1 - u), N = normalAt(garment, x, y, q.back);
        fall.push(S.addScaledVector(N, 0.0046 * (1 - u) + 0.0028 * u).addScaledVector(up, (H + 0.0015) * (1 - u) * (1 - u)).addScaledVector(O, 0.003 * (1 - u)));
      }
      const top = pos[pos.length - 1].clone(), first = fall[0];
      for (let k = 1; k <= FOLD; k++) { const t = k / (FOLD + 1); pos.push(top.clone().lerp(first, t).addScaledVector(up, 0.0026 * Math.sin(Math.PI * t))); }
      pos.push(...fall);
    });
    const flat = new Float32Array(pos.length * 3), uv = [], index = [];
    pos.forEach((p, i) => { flat.set([p.x, p.y, p.z], i * 3); uv.push(Math.floor(i / ROWS) / (cols.length - 1), (i % ROWS) / (ROWS - 1)); });
    for (let c = 0; c < cols.length - 1; c++) for (let r = 0; r < ROWS - 1; r++) { const a = c * ROWS + r, b = a + 1, d = a + ROWS, e = d + 1; index.push(a, d, b, b, d, e); }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(flat, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    fold = new THREE.MeshPhysicalMaterial({ roughness: 0.82, sheen: 0.3, sheenRoughness: 0.6, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, fold);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.raycast = () => {};
    group.add(mesh);
    // Its outer edge piped (RC008: a thin line of the accent along the fall's edge).
    if (collar.piping) {
      const edge = cols.map((_, c) => new THREE.Vector3(flat[(c * ROWS + ROWS - 1) * 3], flat[(c * ROWS + ROWS - 1) * 3 + 1], flat[(c * ROWS + ROWS - 1) * 3 + 2]));
      const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), edge.length * 2, 0.0013, 6, false), new THREE.MeshStandardMaterial({ roughness: 0.7 }));
      pipe.name = 'piping';
      pipe.raycast = () => {};
      group.add(pipe);
    }
  }
  if (placket) {
    buttons = new THREE.MeshPhysicalMaterial({ color: 0xe9eef2, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const shape = buttonGeometry();
    for (const y of placket.buttons) {
      const n = normalAt(garment, 0, y, false), b = new THREE.Mesh(shape, buttons);
      b.position.copy(garment.surface(0, y, false).addScaledVector(n, 0.0032));
      b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      b.castShadow = true;
      b.raycast = () => {};
      group.add(b);
    }
  }
  return { group, fold, buttons, pipe: group.getObjectByName('piping')?.material ?? null };
}

/**
 * The collar's prints on the front panel (garment metres, the side's frame set): RC002's V insert under its round neck
 * (the insert in the accent, its V edged in the collar colour), RC010's crossover, and a button placket (in the
 * insert's colour, stitched, a dark overlap line down its middle).
 */
export function paintCollarPrint(painter, collar, colours, back) {
  if (!collar || back) return;
  const g = painter.ctx, { foot } = neckEnds(painter);
  g.save();
  if (collar.insert === 'v') {
    const top = foot + 0.012, tip = foot - 0.07, w = 0.062;
    g.fillStyle = colours.accent;
    g.beginPath(); g.moveTo(-w, top); g.lineTo(0, tip); g.lineTo(w, top); g.closePath(); g.fill();
    g.strokeStyle = colours.band; g.lineWidth = 0.013; g.lineJoin = 'miter';
    g.beginPath(); g.moveTo(-w - 0.006, top + 0.01); g.lineTo(0, tip); g.lineTo(w + 0.006, top + 0.01); g.stroke();
  }
  if (collar.insert === 'cross') {
    const top = foot + 0.012, low = foot - 0.06;
    g.fillStyle = colours.accent;
    g.beginPath(); g.moveTo(-0.05, top); g.lineTo(0.022, top); g.lineTo(0.008, low); g.closePath(); g.fill();
    g.fillStyle = colours.band;
    g.beginPath(); g.moveTo(0.05, top); g.lineTo(-0.022, top); g.lineTo(-0.008, low); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 0.0012;
    g.beginPath(); g.moveTo(-0.022, top); g.lineTo(-0.008, low); g.stroke();
  }
  const placket = placketOf(painter, collar);
  if (placket) {
    const { half, top, bottom } = placket;
    g.fillStyle = colours.placket;
    g.fillRect(-half, bottom, 2 * half, top - bottom + 0.02);
    g.strokeStyle = 'rgba(120,124,130,0.55)'; g.lineWidth = 0.0008; g.setLineDash([0.0028, 0.0018]);
    for (const x of [-half + 0.0025, half - 0.0025]) { g.beginPath(); g.moveTo(x, top + 0.02); g.lineTo(x, bottom + 0.0025); g.stroke(); }
    g.beginPath(); g.moveTo(-half + 0.0025, bottom + 0.0025); g.lineTo(half - 0.0025, bottom + 0.0025); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 0.0012;
    g.beginPath(); g.moveTo(0.001, top + 0.02); g.lineTo(0.001, bottom + 0.011); g.stroke();
    for (const x of [-half, half]) { g.beginPath(); g.moveTo(x, top + 0.02); g.lineTo(x, bottom); g.stroke(); }
    g.beginPath(); g.moveTo(-half, bottom); g.lineTo(half, bottom); g.stroke();
  }
  g.restore();
}
