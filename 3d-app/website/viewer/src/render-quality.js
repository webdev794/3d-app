import * as THREE from 'three';

// Render quality (2026-10-22): the tiers, the stadium's lighting environment, the fabric's woven detail and the
// stadium photo's floodlights in high dynamic range. None of it changes what is printed where: the print atlas
// (texture.js), the garments' shapes and the picking are the same in every tier.

/**
 * The render tier: 'high' (computers), 'low' (phones, tablets, the apps' WebViews, weak or software graphics) or
 * 'flat' (the renderer exactly as before these changes, for regression checks). `?quality=low|high|flat` chooses one
 * (`?baseline` = flat).
 */
export function qualityTier(params, renderer) {
  const asked = (params.get('quality') || '').toLowerCase();
  if (asked === 'flat' || params.has('baseline')) return 'flat';
  if (asked === 'low' || asked === 'high') return asked;
  const ua = navigator.userAgent || '';
  // Phones and tablets (an iPad says it is a Mac, but it has touch).
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'low';
  if (Math.min(screen.width, screen.height) < 600) return 'low';
  if ((navigator.hardwareConcurrency || 8) < 4 || (navigator.deviceMemory || 8) < 4) return 'low';
  try {
    const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(name)) return 'low';
  } catch { /* unknown graphics: the default */ }
  return 'high';
}

/** Each tier's settings (flat has none: the renderer as it was). */
export const TIERS = {
  // Multisampled rendering (fewer samples on high-density screens, which alias less), a sharper key-light shadow,
  // the podium's mirror finish.
  high: { msaa: devicePixelRatio >= 1.75 ? 2 : 4, fxaa: false, shadowSize: 2048, shadowRadius: 3, podiumMirror: 512, backdropScale: 1 },
  // Phones: no extra scene pass (the podium's gloss reflects the environment only), FXAA instead of MSAA.
  low: { msaa: 0, fxaa: true, shadowSize: 1024, shadowRadius: 2, podiumMirror: 0, backdropScale: 0.5 },
};

/**
 * The stadium's light for reflections and sheen (made once, then prefiltered by PMREMGenerator): a night bowl with a
 * faint glow over the stands, banks of cool floodlights high behind and to the sides, a big warm key panel in front
 * on the left (the same side as the key light), a dim cool fill on the right and cool rim strips behind.
 */
export function stadiumEnvironment({ softbox = false } = {}) {
  const env = new THREE.Scene();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(20, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vDir;\nvoid main() { vDir = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `varying vec3 vDir;
void main() {
  float y = normalize( vDir ).y;
  vec3 sky = mix( vec3( 0.014, 0.03, 0.06 ), vec3( 0.003, 0.008, 0.018 ), smoothstep( 0.1, 0.9, y ) );
  vec3 stands = vec3( 0.05, 0.12, 0.22 ) * exp( -pow( ( y - 0.08 ) / 0.1, 2.0 ) );
  vec3 pitch = vec3( 0.02, 0.026, 0.034 ) * smoothstep( 0.02, -0.4, y );
  gl_FragColor = vec4( sky + stands + pitch, 1.0 );
}`,
  }));
  env.add(bowl);
  const panel = (w, h, color, power, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0.4, 0);
    env.add(mesh);
  };
  // Floodlight banks.
  panel(3.4, 1.3, 0xdcecff, 14, -6, 6.5, -7);
  panel(3.4, 1.3, 0xdcecff, 14, 6, 6.8, -7);
  panel(2.6, 1.0, 0xd6e8ff, 9, -9.5, 5.5, 0.5);
  panel(2.6, 1.0, 0xd6e8ff, 9, 9.5, 5.8, -0.5);
  // Warm key panel and the cool fill.
  panel(5.5, 4.2, 0xffd9b4, 3.2, -6.5, 5.5, 6.5);
  panel(4, 3, 0x9cc4ff, 0.7, 7, 2.5, 6);
  // A broad soft light from the camera's side, so the print reads true from the front.
  panel(9, 5, 0xfff4ea, 1.5, 0, 2.2, 9.5);
  // Look 2: a long studio softbox overhead, a soft sheen along the shoulders, the folds' ridges and the trims.
  if (softbox) panel(7, 2.2, 0xeef5ff, 2.2, 0, 8.5, 1.5);
  // Cool rim strips behind.
  panel(0.6, 5.5, 0x74d2ff, 4, -6, 1.8, -6.5);
  panel(0.6, 5.5, 0x74d2ff, 4, 6, 1.8, -6.5);
  return env;
}

/**
 * The fabric types a design can choose (design.fabric: the Studio's Fabric type in the website and the apps). Standard
 * (or none) is each garment's own fabric; the others are the same on every garment: Mesh an open, breathable hexagonal
 * mesh, Pro a smooth, tight performance knit with a satin sheen, Eco a matt, soft cotton-feel recycled knit.
 */
export const FABRIC_TYPES = { Mesh: 'airmesh', Pro: 'pro', Eco: 'eco' };

/**
 * The fabric each garment is made of: the design's fabric type (`chosen`), else the garment's own: a mesh, a bird's-eye
 * knit, piqué (polos), brushed fleece or a fine knit; none for a garment with its own finish (such as the varsity's wool
 * and leather), which is left as its maker set it.
 */
export function fabricOf(kind, part, chosen) {
  if (part?.material?.roughnessMap || part?.material?.clearcoatMap) return null;
  if (Object.hasOwn(FABRIC_TYPES, chosen)) return FABRIC_TYPES[chosen];
  if (part?.hoodie) return 'fleece';
  if (part?.track) return 'knit';
  return { jersey: 'mesh', nfljersey: 'mesh', compression: 'pro', singlet: 'mesh', shorts: 'mesh', tee: 'birdseye', raglan: 'birdseye', polo: 'pique', pocketpolo: 'pique' }[kind] ?? 'knit';
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Distance from (u, v) to the nearest centre of a staggered grid of n x n cells per tile (odd rows half a cell along). */
function staggered(n) {
  const p = 1 / n;
  return (u, v) => {
    const row = Math.floor(v * n);
    let best = 9;
    for (let dr = -1; dr <= 1; dr++) {
      const j = row + dr, cy = (j + 0.5) * p, shift = (((j % 2) + 2) % 2) * 0.5;
      const i = Math.round(u * n - 0.5 - shift);
      for (let di = -1; di <= 1; di++) best = Math.min(best, Math.hypot(u - (i + di + 0.5 + shift) * p, v - cy));
    }
    return best;
  };
}
/** Tileable value noise with a period of `cells` per tile. */
function valueNoise(cells, seed) {
  const r = new Float32Array(cells * cells);
  let s = seed;
  for (let i = 0; i < r.length; i++) { s = (s * 16807) % 2147483647; r[i] = s / 2147483647; }
  const at = (i, j) => r[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
  return (u, v) => {
    const x = u * cells, y = v * cells, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (at(i, j) * (1 - sx) + at(i + 1, j) * sx) * (1 - sy) + (at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx) * sy;
  };
}

// tile: metres of fabric one repeat covers; scale: the normal map's strength; cavity: how much the holes darken the
// print (kept low so the design's colours stay true); rough / sheen: the surface (left as the garment set them when
// missing, as for hoodies and the track jacket).
const FABRICS = {
  // Breathable eyelet mesh: holes about 4 mm apart in staggered rows, fine knit loops between.
  mesh: { tile: 0.0336, scale: 0.75, cavity: 0.22, rough: 0.6, sheen: 0.48, sheenRough: 0.38, strength: 4, make: () => eyelets(8, 0.3) },
  // Bird's-eye knit: the same, finer and with small holes.
  birdseye: { tile: 0.0224, scale: 0.75, cavity: 0.2, rough: 0.62, sheen: 0.5, sheenRough: 0.4, strength: 3.5, make: () => eyelets(8, 0.2) },
  // Piqué: small raised honeycomb cells.
  pique: { tile: 0.026, scale: 0.8, cavity: 0.12, rough: 0.7, sheen: 0.42, sheenRough: 0.45, strength: 3, make: () => pique(8) },
  // Brushed fleece: soft, uneven fibres.
  fleece: { tile: 0.05, scale: 0.45, cavity: 0, strength: 6, make: () => ({ height: fleece() }) },
  // A fine knit (track jackets, and any garment without its own fabric).
  knit: { tile: 0.02, scale: 0.4, cavity: 0, strength: 2.5, make: () => ({ height: (u, v) => 0.5 + 0.5 * Math.cos(2 * Math.PI * (u + v) * 12) ** 3 }) },
  // The fabric types (FABRIC_TYPES). Mesh: open hexagonal holes about 3.4 mm apart (half the fabric open), thin knitted
  // walls between them; the holes show the shade behind them. (tileV: the tile's height, 10 rows of the hexagons.)
  airmesh: { tile: 0.0272, tileV: 0.0272 * (10 * Math.sqrt(3) / 2) / 8, scale: 0.85, cavity: 0.42, rough: 0.66, sheen: 0.4, sheenRough: 0.45, strength: 4.5, make: () => hexMesh(8, 10, 0.35) },
  // Pro: a tight, smooth performance knit (fine wales under a millimetre apart, hardly any relief) with a satin sheen.
  pro: { tile: 0.024, scale: 0.32, cavity: 0, rough: 0.4, sheen: 0.9, sheenRough: 0.24, sheenColor: 0xd2dde8, strength: 2.5, make: () => microKnit(32, 26) },
  // Eco: a soft, matt cotton-feel knit of recycled yarn: knitted loops about 1.2 mm across, the yarn's slubs a few
  // millimetres long and a faint heathered (melange) shade.
  eco: { tile: 0.06, scale: 0.6, cavity: 0.2, rough: 0.92, sheen: 0.14, sheenRough: 0.9, sheenColor: 0x8c99a6, strength: 4, make: () => cottonKnit(48, 44) },
};
function eyelets(n, rf) {
  const d = staggered(n), r = rf / n;
  return {
    height: (u, v) => {
      const k = d(u, v);
      const yarn = 0.12 * (0.5 + 0.5 * Math.cos(2 * Math.PI * u * n * 3)) * (0.5 + 0.5 * Math.cos(2 * Math.PI * v * n * 3));
      return 0.55 + yarn - 0.8 * (1 - smooth(r * 0.5, r, k)) + 0.15 * Math.exp(-(((k - r * 1.15) / (r * 0.3)) ** 2));
    },
    cavity: (u, v) => 1 - 0.85 * (1 - smooth(r * 0.3, r * 0.95, d(u, v))),
  };
}
function pique(n) {
  const d = staggered(n), r = 0.58 / n;
  return {
    height: (u, v) => Math.sqrt(Math.max(0, 1 - (d(u, v) / r) ** 2)),
    cavity: (u, v) => 1 - 0.6 * smooth(r * 0.75, r * 1.02, d(u, v)),
  };
}
function fleece() {
  const octaves = [[valueNoise(8, 11), 0.45], [valueNoise(16, 23), 0.25], [valueNoise(32, 37), 0.18], [valueNoise(64, 41), 0.12]];
  return (u, v) => octaves.reduce((s, [f, a]) => s + f(u, v) * a, 0);
}

/**
 * A regular hexagonal mesh, `cols` x `rows` holes per tile (rows even, so it tiles): each hole a hexagon of inradius
 * `rho` (holes `1` apart), with rounded knitted walls between.
 */
function hexMesh(cols, rows, rho) {
  const h3 = Math.sqrt(3) / 2;
  // Distance from (u, v) to the nearest hole's centre, in hexagon terms (the hexagon norm: 1 = a neighbour's centre).
  const hex = (u, v) => {
    const X = u * cols, Y = v * rows * h3;
    const j0 = Math.round(Y / h3);
    let best = 9;
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      const shift = (((j % 2) + 2) % 2) * 0.5, i0 = Math.round(X - shift);
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        const dx = Math.abs(X - (i + shift)), dy = Math.abs(Y - j * h3);
        // Pointy-topped hexagons (flat sides left and right), as the holes of a knitted mesh sit.
        best = Math.min(best, Math.max(dx, dx * 0.5 + dy * h3));
      }
    }
    return best;
  };
  return {
    height: (u, v) => {
      const k = hex(u, v), wall = smooth(rho, rho + 0.1, k);
      // Knitted loops along the walls.
      const loops = 0.12 * (0.5 + 0.5 * Math.cos(2 * Math.PI * u * cols * 5)) * (0.5 + 0.5 * Math.cos(2 * Math.PI * v * rows * 3));
      return 0.15 + wall * (0.75 + loops);
    },
    cavity: (u, v) => 1 - 0.9 * (1 - smooth(rho - 0.03, rho + 0.05, hex(u, v))),
  };
}
/**
 * The face of a single-jersey knit, `wales` columns and `courses` rows of loops per tile: in each column the two legs of
 * every loop, leaning into a V, fullest halfway along the loop (0 between the columns, 1 on a leg).
 */
function knitLoops(u, v, wales, courses) {
  const x = u * wales, fx = x - Math.floor(x) - 0.5, t = v * courses + 0.9 * Math.abs(fx);
  return Math.cos(Math.PI * (2 * Math.abs(fx) - 0.5)) ** 2 * (0.6 + 0.4 * Math.sin(Math.PI * (t - Math.floor(t))));
}
/** A fine, tight knit: tiny loops in close columns, almost flat. */
function microKnit(wales, courses) {
  return { height: (u, v) => 0.4 + 0.6 * knitLoops(u, v, wales, courses) };
}
/**
 * A soft knit of slubby recycled yarn: its loops, the yarn's thickness uneven in short streaks along the rows (slubs) and
 * the melange's darker and lighter fibres, also in streaks along the rows.
 */
function cottonKnit(wales, courses) {
  const slub = valueNoise(10, 53), fibre = valueNoise(64, 71), heather = valueNoise(16, 89);
  return {
    height: (u, v) => 0.45 * knitLoops(u, v, wales, courses) + 0.35 * slub(u, v * 4) + 0.2 * fibre(u, v),
    cavity: (u, v) => 1 - 0.85 * smooth(0.35, 0.85, heather(u, v * 5) * 0.8 + fibre(u, v) * 0.2),
  };
}

const SIZE = 256;
const baked = new Map();
/** The fabric's detail texture (normal in RGB, the holes' shade in A), made once per fabric. */
function bake(name) {
  if (baked.has(name)) return baked.get(name);
  const f = FABRICS[name], { height, cavity } = f.make();
  const h = new Float32Array(SIZE * SIZE), data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) h[y * SIZE + x] = height((x + 0.5) / SIZE, (y + 0.5) / SIZE);
  const at = (x, y) => h[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * f.strength, ny = (at(x, y - 1) - at(x, y + 1)) * f.strength;
      const len = Math.hypot(nx, ny, 1), i = (y * SIZE + x) * 4;
      data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      data[i + 3] = Math.round((cavity ? cavity((x + 0.5) / SIZE, (y + 0.5) / SIZE) : 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  baked.set(name, texture);
  return texture;
}

/** Each printed material's finish before any fabric was put on it (a fabric without its own roughness keeps it). */
const finishes = new WeakMap();
/** Each printed material's shade-of-the-holes strength (a shader uniform: a new fabric only changes its value). */
const cavities = new WeakMap();
/**
 * Puts the fabric's woven detail on a garment part's printed materials (those on the shared knit map `knit` when the
 * part is first dressed): its normal map at the fabric's real size on this garment (`span`: metres one side of the
 * print atlas covers), the holes' shade over the print, and the fabric's roughness and sheen. `chosen`: the design's
 * fabric type (FABRIC_TYPES; Standard or none: the garment's own). Called again when that changes; returns whether the
 * part's fabric changed (the print itself never does).
 */
export function dressFabric(group, part, knit, anisotropy, chosen) {
  const name = fabricOf(part.painter.kind, part, chosen), f = FABRICS[name];
  if (!f || part.fabric === name) return false;
  if (!part.fabricMaterials) {
    const seen = new Set();
    group.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [o.material].flat()) if (m.normalMap === knit && m.map === part.texture) seen.add(m);
    });
    part.fabricMaterials = [...seen];
    for (const m of seen) finishes.set(m, { roughness: m.roughness, sheen: m.sheen, sheenRoughness: m.sheenRoughness, sheenColor: m.sheenColor.clone(), clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness });
  }
  part.fabric = name;
  const span = part.painter.frame.span;
  const map = bake(name).clone();
  map.repeat.set((2 * span) / f.tile, span / (f.tileV ?? f.tile));
  map.anisotropy = anisotropy;
  map.userData.own = true;   // this part's own copy, freed with the kit
  const old = new Set();
  for (const m of part.fabricMaterials) {
    if (m.normalMap !== knit && m.normalMap?.userData.own) old.add(m.normalMap);
    m.normalMap = map;
    m.normalScale.set(f.scale, f.scale);
    const was = finishes.get(m);
    Object.assign(m, {
      roughness: f.rough ?? was.roughness, sheen: f.sheen ?? was.sheen, sheenRoughness: f.sheenRough ?? was.sheenRoughness,
      clearcoat: f.clearcoat ?? was.clearcoat, clearcoatRoughness: f.clearcoatRough ?? was.clearcoatRoughness,
    });
    if (f.sheenColor != null) m.sheenColor.setHex(f.sheenColor); else m.sheenColor.copy(was.sheenColor);
    let cavity = cavities.get(m);
    if (!cavity && f.cavity) {
      // The holes' shade on the print, softer on light print (letters, numbers) so the dots don't sit over them (after the print's colour is read, before lighting).
      cavity = { value: f.cavity };
      cavities.set(m, cavity);
      const before = m.onBeforeCompile, key = m.customProgramCacheKey;
      m.onBeforeCompile = (shader, renderer) => {
        before.call(m, shader, renderer);
        shader.uniforms.fabricCavity = cavity;
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', 'uniform float fabricCavity;\nvoid main() {')
          .replace('#include <map_fragment>', '#include <map_fragment>\n#ifdef USE_NORMALMAP\n\tdiffuseColor.rgb *= 1.0 - fabricCavity * ( 1.0 - 0.65 * smoothstep( 0.25, 0.85, dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ) ) * ( 1.0 - texture2D( normalMap, vNormalMapUv ).a );\n#endif');
      };
      m.customProgramCacheKey = () => `${key.call(m)}|fabric-cavity`;
    }
    if (cavity) cavity.value = f.cavity;
    m.needsUpdate = true;
  }
  old.forEach((t) => t.dispose());
  return true;
}

/**
 * The (blurred) stadium photo as a high dynamic range texture: its floodlights, the brightest pixels, lifted well
 * above white so the bloom pass makes them glow; everything else exactly as the photo. `scale`: its size (the photo
 * is out of focus, so phones take half).
 */
export function hdrBackdrop(canvas, scale = 1) {
  const w = Math.max(1, Math.round(canvas.width * scale)), h = Math.max(1, Math.round(canvas.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(canvas, 0, 0, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const linear = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const s = i / 255; linear[i] = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }
  const data = new Uint16Array(w * h * 4), half = THREE.DataUtils.toHalfFloat, one = half(1);
  for (let y = 0; y < h; y++) {
    const row = (h - 1 - y) * w;   // a data texture's rows go bottom up
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, o = (row + x) * 4;
      const r = linear[src[i]], gg = linear[src[i + 1]], b = linear[src[i + 2]];
      const t = smooth(0.5, 0.95, 0.2126 * r + 0.7152 * gg + 0.0722 * b), boost = 1 + 7 * t * t;
      data[o] = half(r * boost); data[o + 1] = half(gg * boost); data[o + 2] = half(b * boost); data[o + 3] = one;
    }
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
