// node montage.cjs <out.jpg> <height> <img1> [img2 ...]  ("|" starts a new row; "label=text" labels the next image). No browser.
const fs = require('fs');
const { createCanvas, loadImage } = require('D:/3d-app/3d-app/website/node_modules/@napi-rs/canvas');
(async () => {
  const [out, h, ...files] = process.argv.slice(2); const H = +h;
  const rows = [[]]; let label = null;
  for (const f of files) { if (f === '|') rows.push([]); else if (f.startsWith('label=')) label = f.slice(6); else { rows.at(-1).push({ img: await loadImage(fs.readFileSync(f)), label: label ?? require('path').basename(f) }); label = null; } }
  const widths = rows.map((r) => r.reduce((s, o) => s + Math.round(o.img.width * H / o.img.height) + 6, 0));
  const c = createCanvas(Math.max(...widths), rows.length * (H + 6)), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.font = '14px sans-serif';
  rows.forEach((r, y) => { let x = 0; for (const o of r) { const w = Math.round(o.img.width * H / o.img.height); g.drawImage(o.img, x, y * (H + 6), w, H); g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(x, y * (H + 6), Math.min(w, 8 + 7.5 * o.label.length), 18); g.fillStyle = '#c00'; g.fillText(o.label, x + 4, y * (H + 6) + 14); x += w + 6; } });
  fs.writeFileSync(out, c.toBuffer('image/jpeg', 85));
  console.log('wrote', out);
})();
