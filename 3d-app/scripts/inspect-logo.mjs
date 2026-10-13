// Render the supplied vector PDF for inspection, without changing its artwork.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '../.tools/pdf/node_modules/@napi-rs/canvas/index.js';
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfjs = await import('../.tools/pdf/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/inspect-logo.mjs <PDF>');
const document = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(source)) }).promise;
const output = path.resolve('design-reference/final-logo');
fs.mkdirSync(output, {recursive:true});
for (let number=1;number<=document.numPages;number++) {
  const page=await document.getPage(number);
  const view=page.getViewport({scale:2});
  const canvas=createCanvas(Math.ceil(view.width),Math.ceil(view.height));
  await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
  fs.writeFileSync(path.join(output,`page-${number}.png`),canvas.toBuffer('image/png'));
  console.log(JSON.stringify({page:number,width:view.width,height:view.height,text:(await page.getTextContent()).items.map(x=>x.str).join(' ')}));
}
