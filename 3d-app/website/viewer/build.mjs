import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from '../../viewer/node_modules/esbuild/lib/main.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.resolve(here, '../public/media/viewer/index.html');
const base64 = (file) => fs.readFileSync(path.resolve(root, file)).toString('base64');
const { outputFiles } = await esbuild.build({
    entryPoints: [path.join(here, 'src/main.js')],
    nodePaths: [path.join(root, 'viewer/node_modules')],
    bundle: true, minify: true, format: 'iife',
    target: ['chrome100', 'safari16'], write: false, legalComments: 'none',
});
const js = outputFiles[0].text.replaceAll('</script', '<\\/script');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>3DEEZI — Cinematic 3D Studio</title><style>
@font-face{font-family:Rajdhani;font-weight:700;src:url(data:font/ttf;base64,${base64('assets/fonts/Rajdhani-Bold.ttf')}) format('truetype')}
html,body{margin:0;height:100%;overflow:hidden;background:#03070c;touch-action:none;-webkit-user-select:none;user-select:none}
#stage{display:block;width:100%;height:100%;opacity:0;transition:opacity .8s ease}.ready #stage{opacity:1}
</style></head><body><canvas id="stage"></canvas>
<script>window.DEFAULT_PATTERN='data:image/png;base64,${base64('viewer/sample-pattern.png')}';</script>
<script>${js}</script></body></html>`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Cinematic website viewer built: ${path.relative(root, out)} (${Math.round(html.length / 1024)} KB)`);
