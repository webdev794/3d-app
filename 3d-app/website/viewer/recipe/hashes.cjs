// node hashes.cjs <index.html> <jobs.json>  -> per job: geometry (fabric mesh position/uv/index), print canvas, relief, rim visible
const fs = require('fs'), url = require('url');
const { chromium } = require('D:/3d-app/3d-app/.tools/browser/node_modules/playwright');
(async () => {
  const [html, jobsFile] = process.argv.slice(2);
  const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 500 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.addInitScript(() => { window.Viewer = { postMessage: () => {} }; });
  await page.goto(url.pathToFileURL(html).href + '?host=t&still&debug');
  await page.waitForFunction(() => document.body.classList.contains('ready') && window.__v, null, { timeout: 120000 });
  for (const job of jobs) {
    const r = await page.evaluate(async (d) => {
      await window.viewer.setDesign(d);
      const h = async (arr) => { const b = await crypto.subtle.digest('SHA-1', arr.buffer ? new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength) : arr); return [...new Uint8Array(b)].slice(0, 5).map((x) => x.toString(16).padStart(2, '0')).join(''); };
      const out = [];
      for (const part of window.__v.parts) {
        let fabric = null; part.rim.parent.traverse((o) => { if (o.isMesh && [o.material].flat().includes(part.material) && !fabric) fabric = o; });
        const g = fabric.geometry, c = part.painter.canvas, px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        out.push(`${part.painter.kind} geo ${await h(g.getAttribute('position').array)}/${await h(g.getAttribute('uv').array)}/${await h(g.index.array)} print ${await h(px)} rim ${part.rim.visible} tripo ${!!part.tripo}`);
      }
      return out.join(' ; ');
    }, job.design);
    console.log(job.name.padEnd(18), r);
  }
  await browser.close();
})();
