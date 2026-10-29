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
    nodePaths: [path.join(root, 'viewer/node_modules'), path.join(here, '../node_modules')],
    bundle: true, minify: true, format: 'iife',
    target: ['chrome100', 'safari16'], write: false, legalComments: 'none',
});
const js = outputFiles[0].text.replaceAll('</script', '<\\/script');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>3DEEZI — Cinematic 3D Studio</title><style>
@font-face{font-family:Rajdhani;font-weight:700;src:url(data:font/ttf;base64,${base64('assets/fonts/Rajdhani-Bold.ttf')}) format('truetype')}
@font-face{font-family:JerseyBlock;font-weight:700;src:url(data:font/ttf;base64,${base64('assets/fonts/JerseyBlock.ttf')}) format('truetype')}
html,body{margin:0;height:100%;overflow:hidden;background:#03070c;touch-action:none;-webkit-user-select:none;user-select:none}
#stage{display:block;width:100%;height:100%;opacity:0;transition:opacity .8s ease}.ready #stage{opacity:1}
</style></head><body><canvas id="stage"></canvas>
<script>window.DEFAULT_PATTERN='data:image/png;base64,${base64('viewer/sample-pattern.png')}';window.STADIUM='data:image/webp;base64,${base64('website/public/media/showroom/studio-backdrop.webp')}';</script>
<script>${js}</script></body></html>`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
// Keep the same board, artwork tools and cinematic renderer in the apps
// (skipped with --website-only, so the app's files are left alone).
if (!process.argv.includes('--website-only')) {
  const mobileOut = path.join(root, 'assets/viewer/index.html');
  fs.mkdirSync(path.dirname(mobileOut), { recursive: true });
  fs.writeFileSync(mobileOut, html);
}
// pdf.js for print layouts: its own file beside the viewer, loaded only when a PDF is opened (layout.js); a plain
// script, as modules do not load from the apps' local files.
const reader = await esbuild.build({
    entryPoints: [path.join(here, 'src/pdf-reader.js')],
    nodePaths: [path.join(here, '../node_modules')],
    bundle: true, minify: true, format: 'iife',
    target: ['chrome100', 'safari16'], write: false, legalComments: 'none',
});
const readerOut = path.join(path.dirname(out), 'pdf-reader.js');
fs.writeFileSync(readerOut, reader.outputFiles[0].text);
if (!process.argv.includes('--website-only')) fs.writeFileSync(path.join(root, 'assets/viewer/pdf-reader.js'), reader.outputFiles[0].text);
// The "High quality" jersey's shape (?hq=1, src/hq.js): its own file beside the website's viewer, loaded only when
// asked for. The app gets it too (its Studio switch "High quality jersey (preview)" opens the viewer with ?hq=1).
fs.copyFileSync(path.join(here, 'hq-jersey.js'), path.join(path.dirname(out), 'hq-jersey.js'));
if (!process.argv.includes('--website-only')) fs.copyFileSync(path.join(here, 'hq-jersey.js'), path.join(root, 'assets/viewer/hq-jersey.js'));
const presets = path.join(root, 'assets/presets.json');
if (fs.existsSync(presets)) fs.copyFileSync(presets, path.join(root, 'website/public/media/presets.json'));
console.log(`Cinematic website viewer built: ${path.relative(root, out)} (${Math.round(html.length / 1024)} KB)`);
