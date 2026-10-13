// Bundles the Artboard into ONE self-contained HTML file (script, styles,
// fonts and logo inlined), written for the website and for the Flutter app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from '../../viewer/node_modules/esbuild/lib/main.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const b64 = (file) => fs.readFileSync(path.resolve(root, file)).toString('base64');
const { outputFiles } = await esbuild.build({
  entryPoints: [path.join(here, 'src/main.js')],
  nodePaths: [path.join(root, 'viewer/node_modules')],
  bundle: true, minify: true, format: 'iife',
  target: ['chrome100', 'safari16'], write: false, legalComments: 'none',
});
const js = outputFiles[0].text.replaceAll('</script', '<\\/script');
const css = fs.readFileSync(path.join(here, 'src/artboard.css'), 'utf8');
const logo = fs.existsSync(path.resolve(root, 'assets/images/brand-final.png')) ? 'assets/images/brand-final.png' : 'assets/images/brand.png';
const body = fs.readFileSync(path.join(here, 'src/body.html'), 'utf8').replace('__LOGO__', `data:image/png;base64,${b64(logo)}`);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#04090f"><title>3DEEZI Artboard</title><style>
@font-face{font-family:Rajdhani;font-weight:700;src:url(data:font/ttf;base64,${b64('assets/fonts/Rajdhani-Bold.ttf')}) format('truetype')}
@font-face{font-family:Rajdhani;font-weight:600;src:url(data:font/ttf;base64,${b64('assets/fonts/Rajdhani-SemiBold.ttf')}) format('truetype')}
@font-face{font-family:Inter;font-weight:100 900;src:url(data:font/ttf;base64,${b64('assets/fonts/Inter.ttf')}) format('truetype')}
${css}</style></head><body>${body}<script>${js}</script></body></html>`;
for (const out of [path.join(root, 'website/public/media/artboard/index.html'), path.join(root, 'assets/artboard/index.html')]) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`Artboard built: ${path.relative(root, out)} (${Math.round(html.length / 1024)} KB)`);
}
