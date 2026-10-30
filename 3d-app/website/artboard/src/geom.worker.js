// The Artboard's shape worker (see geomcore.js): bundled on its own by build.mjs and started from a blob.

import { runGeom } from './geomcore.js';

self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, ...runGeom(data) }); }
  catch (e) { self.postMessage({ id: data.id, error: e?.message || 'The shape could not be worked out' }); }
};
