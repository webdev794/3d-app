// Bundles the Artboard into ONE self-contained HTML file (script, styles,
// fonts and logo inlined), written for the website and for the Flutter app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from '../../viewer/node_modules/esbuild/lib/main.js';
import { FONTS } from './src/fonts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const b64 = (file) => fs.readFileSync(path.resolve(root, file)).toString('base64');
const { outputFiles } = await esbuild.build({
  entryPoints: [path.join(here, 'src/main.js')],
  nodePaths: [path.join(here, 'node_modules'), path.join(root, 'viewer/node_modules')],
  // paper-core: the boolean/offset engine without the PaperScript compiler.
  alias: { paper: path.join(here, 'node_modules/paper/dist/paper-core.js') },
  // jsPDF's optional HTML-to-PDF helpers are never used.
  external: ['html2canvas', 'dompurify', 'canvg'],
  bundle: true, minify: true, format: 'iife',
  target: ['chrome100', 'safari16'], write: false, legalComments: 'none',
});
const js = outputFiles[0].text.replaceAll('</script', '<\\/script');
// The shape worker (Smudge and Eraser maths off the main thread): its own bundle, embedded as a string.
const geom = await esbuild.build({
  entryPoints: [path.join(here, 'src/geom.worker.js')],
  nodePaths: [path.join(here, 'node_modules'), path.join(root, 'viewer/node_modules')],
  alias: { paper: path.join(here, 'node_modules/paper/dist/paper-core.js') },
  bundle: true, minify: true, format: 'iife', target: ['chrome100', 'safari16'], write: false, legalComments: 'none',
});
const geomJs = JSON.stringify(geom.outputFiles[0].text).replaceAll('</script', '<\\/script');
const css = fs.readFileSync(path.join(here, 'src/artboard.css'), 'utf8');
const logo = fs.existsSync(path.resolve(root, 'assets/images/brand-final.png')) ? 'assets/images/brand-final.png' : 'assets/images/brand.png';
const body = fs.readFileSync(path.join(here, 'src/body.html'), 'utf8').replace('__LOGO__', `data:image/png;base64,${b64(logo)}`);
// Font files once, as base64: registered with FontFace and parsed by opentype.js.
// The build number for the status bar: the website also passes it as ?v=, the app's copy has no address to read it from.
const build = /EDITOR_VERSION = '([^']+)'/.exec(fs.readFileSync(path.resolve(root, 'website/resources/js/pages/Artboard.tsx'), 'utf8'))?.[1] ?? '';
const fontData = Object.fromEntries(FONTS.flatMap((f) => f.faces.map(([file]) => [file, fs.readFileSync(path.join(here, 'fonts', file)).toString('base64')])));
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#04090f"><title>3DEEZI Artboard</title><style>
${css}</style></head><body>${body}<script>window.__ABGEOM=${geomJs};window.__ABBUILD=${JSON.stringify(build)};window.__ABFONTS=${JSON.stringify(fontData)}</script><script>${js}</script></body></html>`;
for (const out of [path.join(root, 'website/public/media/artboard/index.html'), path.join(root, 'assets/artboard/index.html')]) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`Artboard built: ${path.relative(root, out)} (${Math.round(html.length / 1024)} KB)`);
}
