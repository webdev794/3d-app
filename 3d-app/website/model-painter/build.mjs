// Model Painter (admin tool; remove with REMOVE.md): builds media/model-painter/index.html from this folder.
//   node model-painter/build.mjs [--out <dir>]      (run from website/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = process.env.MP_SITE ?? path.resolve(here, '..');
const root = process.env.MP_ROOT ?? path.resolve(site, '..');
const { build } = await import(pathToUrl(path.join(root, 'viewer/node_modules/esbuild/lib/main.js')));
function pathToUrl(p) { return 'file:///' + p.replace(/\\/g, '/'); }
const at = process.argv.indexOf('--out');
const out = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(site, 'public/media/model-painter');
const { outputFiles } = await build({
  entryPoints: [path.join(here, 'painter.js')],
  nodePaths: [path.join(root, 'viewer/node_modules')],
  bundle: true, minify: true, format: 'iife', target: ['chrome100', 'safari16'], write: false, legalComments: 'none',
});
const css = fs.readFileSync(path.join(here, 'painter.css'), 'utf8');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Model Painter</title><style>${css}</style></head><body><script>${outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('Model Painter built:', path.join(out, 'index.html'), Math.round(html.length / 1024), 'KB');
