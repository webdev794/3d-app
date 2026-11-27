// MODEL-PAINTER hook (admin tool /admin/model-painter, 2026-11-26; an internal extra, remove with ModelPainter REMOVE.md).
// A garment tile's hand-painted colour-area map (media/model-maps/, saved by the Model Painter) is put in place of its
// model's own pieces (data piece / pieceTri / partKeys / triPart) for designs from THAT tile only (its model + tile name,
// design.productName). Every other tile, and every tile without a saved map, keeps the model's own areas: nothing changes.
// The model's shape is never touched; only which colour area each bit of cloth is in.
const FIELDS = ['piece', 'pieceTri', 'partKeys', 'triPart'];
let index = null, indexLoad = null, tag = '';
const files = new Map();

const fetchJson = (url) => {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(() => ctl?.abort(), 4000);
  return fetch(url, { cache: 'no-cache', signal: ctl?.signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null).finally(() => clearTimeout(t));
};
const base = () => { try { return new URL('../model-maps/', location.href).href; } catch { return null; } };

/** The saved maps' list ({ "<model>|<tile name>": "<file>" }), read once per page; {} when there is none or it can't be read. */
function loadIndex() {
  if (index) return Promise.resolve(index);
  if (!base() || !/^https?:$/.test(location.protocol)) { index = {}; return Promise.resolve(index); }
  indexLoad ??= fetchJson(base() + 'index.json').then((j) => (index = j && typeof j === 'object' && j.maps ? j.maps : {}));
  return indexLoad;
}

/** Each loaded model's map for this design put in place (or its own areas put back). Never throws, never waits long. */
export async function useAreaMaps(design) {
  try {
    const all = window.TRIPO_MESHES ?? {}, tile = design?.productName ?? '';
    // (The Model Painter's own preview: its unsaved map, on its viewer only.)
    const preview = window.__modelPainterPreview ?? null;
    const maps = preview || !tile ? {} : await loadIndex();
    const on = [];
    for (const [name, D] of Object.entries(all)) {
      if (!D || typeof D !== 'object') continue;
      let map = null;
      if (preview && preview.model === name) map = preview.data;
      else if (!preview && tile && maps[`${name}|${tile}`]) {
        const file = maps[`${name}|${tile}`];
        if (!files.has(file)) files.set(file, await fetchJson(base() + encodeURI(file)));
        map = files.get(file);
      }
      if (map && map.model === name && map.count === D.count && typeof map.piece === 'string') {
        D.__mpOwn ??= Object.fromEntries(FIELDS.map((f) => [f, D[f]]));
        for (const f of FIELDS) D[f] = Object.prototype.hasOwnProperty.call(map, f) ? map[f] : D.__mpOwn[f];
        on.push(`${name}:${map.id ?? ''}`);
      } else if (D.__mpOwn) {
        for (const f of FIELDS) D[f] = D.__mpOwn[f];
        delete D.__mpOwn;
      }
    }
    tag = on.length ? `:areamap:${on.join(',')}` : '';
  } catch (error) { console.warn('Model Painter map:', error); }
}
/** Part of every cache key built from a model's data: a map in place builds its own shapes. '' with none (as before). */
export const areaMapTag = () => tag;
