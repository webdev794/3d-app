import * as THREE from 'three';

// The football / hockey jersey's wing collar (FN2 2026-10-30, the client's tile picture): a stand collar of the body's
// fabric sewn round the neckline, up at the back and sides and lower down the V in front, its top edge rolled a
// little outwards and its front ends flaring out like wings; dark grey inside. Shown when design.zoneColors.wingCollar is
// set (the tile's look, catalog.php 'tribal'); a plain mesh pair over the collar rib, never picked.

/** The collar along `neck` (the garment's neckline loop, garment metres): { group, outer, inner }. */
export function buildWingCollar(neck) {
  const curve = new THREE.CatmullRomCurve3(neck, true), N = 240, pts = curve.getSpacedPoints(N);
  let cx = 0, cz = 0, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { cx += p.x; cz += p.z; minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  cx /= pts.length; cz /= pts.length;
  const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const R = 8, pos = [], uv = [], idx = [];
  pts.forEach((p, i) => {
    // How high on the neckline (1 at the back and shoulders, 0 at the V's point).
    const k = sm(minY, maxY, p.y), front = 1 - k;
    const out = new THREE.Vector3(p.x - cx, 0, p.z - cz).normalize();
    // Its top level round the back and sides (2 cm over the shoulders' neck points), coming down the V to under 1 cm.
    // (FN2 round 2: 1.6 cm over the neck points, down to 0.6 cm at the V, so the front shows black, not its inside.)
    const h = THREE.MathUtils.lerp(0.006, Math.min(0.04, maxY + 0.016 - p.y), sm(0.35, 0.85, k));
    const lean = 0.003 + 0.007 * front;             // the front ends flare out a little (the wings)
    for (let r = 0; r <= R; r++) {
      const s = r / R, roll = s * s;                // the top rolled over outwards
      // (Its foot starts 6 mm down inside the collar rib, so it joins the neckline with no gap from any side.)
      const q = p.clone().addScaledVector(out, 0.0012 + lean * roll + 0.0015 * Math.sin(Math.PI * s * 0.5));
      q.y += (h + 0.006) * s - 0.006;
      pos.push(q.x, q.y, q.z);
      uv.push(i / N, s);
    }
    if (i < N) for (let r = 0; r < R; r++) { const a = i * (R + 1) + r, c = a + R + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Normals outwards: check at the back's middle.
  const n = g.getAttribute('normal'), back = pts.reduce((b, p, i) => (p.z < pts[b].z ? i : b), 0), vi = back * (R + 1) + R / 2;
  if (n.getZ(vi) > 0) {
    const ix = g.index.array;
    for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; }
    g.computeVertexNormals();
  }
  const outer = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.85, side: THREE.FrontSide });
  const inner = new THREE.MeshStandardMaterial({ color: 0x5f6266, roughness: 0.95, side: THREE.BackSide });
  const group = new THREE.Group();
  group.name = 'wing-collar';
  for (const m of [outer, inner]) {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = m === outer;
    mesh.raycast = () => {};
    group.add(mesh);
  }
  group.visible = false;
  return { group, outer, inner };
}

/** Shows the wing collar in the design's colours (zoneColors.wingCollar, .wingCollarInside), or hides it. */
export function paintWingCollar(wing, design) {
  if (!wing) return;
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v ?? '') ? v : null);
  const own = hex(design.zoneColors?.wingCollar);
  wing.group.visible = !!own;
  if (!own) return;
  wing.outer.color.set(own);
  wing.inner.color.set(hex(design.zoneColors?.wingCollarInside) ?? '#5f6266');
}
