// Export selected regions of the client's vector PDF without redrawing the logo.
import fs from 'node:fs';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '../.tools/pdf/node_modules/@napi-rs/canvas/index.js';
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfjs=await import('../.tools/pdf/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const document=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(process.argv[2]))}).promise;
const page=await document.getPage(1);
// Coordinates refer to a 2x render of the supplied 581.241 × 434.347 pt page.
const regions={
  'brand-final.png':{x:116,y:588,w:856,h:136},
  'brand-tagline-final.png':{x:116,y:588,w:856,h:191},
  'emblem-final.png':{x:165,y:115,w:728,h:452},
};
for(const [name,r] of Object.entries(regions)){
  const canvas=createCanvas(r.w*2,r.h*2);
  const viewport=page.getViewport({scale:4,offsetX:-r.x*2,offsetY:-r.y*2});
  await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  fs.writeFileSync(`assets/images/${name}`,canvas.toBuffer('image/png'));
  fs.writeFileSync(`website/public/media/images/${name}`,canvas.toBuffer('image/png'));
  console.log(name);
}
