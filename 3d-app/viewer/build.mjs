// Bundles the 3D viewer into ONE self-contained HTML file (scripts, font and
// demo pattern inlined) so it loads offline from Flutter assets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../assets/viewer/index.html');
const b64 = (file) => fs.readFileSync(path.resolve(here, file)).toString('base64');

const { outputFiles } = await esbuild.build({
  entryPoints: [path.resolve(here, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome90', 'safari15'],
  write: false,
  legalComments: 'none',
});
const js = outputFiles[0].text.replaceAll('</script', '<\\/script');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>3DEEZI 3D Studio</title>
<style>
@font-face{font-family:Rajdhani;font-weight:700;src:url(data:font/ttf;base64,${b64('../assets/fonts/Rajdhani-Bold.ttf')}) format('truetype')}
html,body{margin:0;height:100%;overflow:hidden;background:#03060a;touch-action:none;-webkit-user-select:none;user-select:none}
#stage{display:block;width:100%;height:100%;opacity:0;transition:opacity .6s ease}
.ready #stage{opacity:1}
</style></head>
<body><canvas id="stage"></canvas>
<script>window.DEFAULT_PATTERN='data:image/png;base64,${b64('sample-pattern.png')}';window.STADIUM='data:image/webp;base64,${b64('stadium-backdrop.webp')}';</script>
<script>${js}</script>
</body></html>`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Viewer written: ${path.relative(process.cwd(), out)} (${(html.length / 1024).toFixed(0)} KB)`);
