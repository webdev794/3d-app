// Viewer pictures (JPEG): node shots.cjs <index.html> <jobs.json> <outDir> [w] [h]
// jobs: [{name, design, views: ['Front','Back','Side','Q45' (degrees round), 'neck' (the NECK DETAIL close-up),
//   'zoom' (close on the front neck), 'zoomQ35' (close, 35 degrees round)]}]. Kit bob held still.
const path = require('path'), fs = require('fs'), url = require('url');
const { chromium } = require('D:/3d-app/3d-app/.tools/browser/node_modules/playwright');
(async () => {
  const [html, jobsFile, outDir, W = '560', H = '760'] = process.argv.slice(2);
  const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: +W, height: +H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall|GL Driver Message/.test(m.text())) errors.push(m.type() + ' ' + m.text().slice(0, 300)); });
  await page.addInitScript(() => { window.__msgs = []; window.Viewer = { postMessage: (t) => window.__msgs.push(JSON.parse(t)) }; });
  await page.goto(url.pathToFileURL(html).href + '?host=t&still&debug');
  await page.waitForFunction(() => document.body.classList.contains('ready') && window.__v, null, { timeout: 120000 });
  await page.waitForTimeout(2000);
  const jpeg = (dataUrl, q = 0.82) => page.evaluate(async ([d, q]) => {
    const img = new Image(); img.src = d; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/jpeg', q);
  }, [dataUrl, q]);
  const save = (file, d) => fs.writeFileSync(path.join(outDir, file), Buffer.from(d.split(',')[1], 'base64'));
  for (const job of jobs) {
    const t0 = Date.now();
    const r = await page.evaluate((d) => window.viewer.setDesign(d).then(() => 'ok', (e) => 'THREW ' + e.message), job.design);
    const applied = Date.now() - t0;
    await page.waitForTimeout(job.wait ?? 600);
    for (const view of job.views) {
      let shot;
      if (view === 'board') {
        await page.evaluate(() => { window.__msgs.length = 0; return window.viewer.board(true); });
        await page.waitForTimeout(2500);
        await page.evaluate(() => window.viewer.captureBoard({ id: 2 }));
        await page.waitForFunction(() => window.__msgs.some((m) => m.type === 'captureBoard'), null, { timeout: 30000 });
        shot = await page.evaluate(() => window.__msgs.find((m) => m.type === 'captureBoard').data);
        await page.evaluate(() => window.viewer.board(false));
        await page.waitForTimeout(800);
        if (!shot) { console.log('board: no picture'); continue; }
      } else if (view === 'neck') {
        await page.evaluate(() => { window.__msgs.length = 0; return window.viewer.neckShot({ id: 1 }); });
        await page.waitForFunction(() => window.__msgs.some((m) => m.type === 'neckShot'), null, { timeout: 30000 });
        shot = await page.evaluate(() => window.__msgs.find((m) => m.type === 'neckShot').data);
      } else {
        const deg = /^Q(-?\d+)$/.exec(view)?.[1], zoom = /^zoom(?:Q(-?\d+))?(?:D(\d+))?(?:X(-?\d+))?(?:Y(\d+))?(?:P(\d+))?$/.exec(view);
        await page.evaluate((v) => window.viewer.setView(v), deg != null || zoom ? 'Front' : view);
        await page.waitForTimeout(1300);
        const direct = await page.evaluate(([deg, zoom]) => {
          const v = window.__v;
          v.kit.position.y = 0;
          if (zoom) {
            // Close on the front neck: the target at the neck, 0.55 m away (or D cm), a little from above.
            const T = window.THREE_V3 ?? v.controls.target.constructor;
            const box = { y: 0 };
            let top = -Infinity;
            v.kit.updateMatrixWorld(true);
            v.kit.traverse((o) => { if (o.isMesh && o.geometry?.boundingBox == null) o.geometry?.computeBoundingBox?.(); });
            const part = v.parts[0], g = part.rim.parent;
            const pos = (part.tripo?.geometry ?? part.garment.geometry).getAttribute('position');
            for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
            const at = new T(zoom[3] != null ? +zoom[3] / 1000 : 0, zoom[4] != null ? +zoom[4] / 1000 : top - 0.11, zoom[3] != null ? 0.05 : 0.05); g.localToWorld(at);
            const r = (+(zoom[2] ?? 55)) / 100, th = ((+(zoom[1] ?? 0)) * Math.PI) / 180, ph = zoom[5] != null ? (+zoom[5] * Math.PI) / 180 : Math.PI * 0.44;
            v.controls.target.copy(at);
            v.camera.position.set(at.x + r * Math.sin(ph) * Math.sin(th), at.y + r * Math.cos(ph), at.z + r * Math.sin(ph) * Math.cos(th));
            v.camera.lookAt(at);
            // (Drawn at once: the controls' limits would pull the camera back on the next frame.)
            return window.viewer.captureDataUrl(null);
          }
          if (deg == null) return null;
          const off = v.camera.position.clone().sub(v.controls.target);
          const r = off.length(), phi = Math.acos(off.y / r);
          v.setCamera({ radius: r, theta: (+deg * Math.PI) / 180, phi });
          return null;
        }, [deg, zoom]);
        await page.waitForTimeout(300);
        shot = direct ?? await page.evaluate((args) => window.viewer.captureDataUrl(args.plain ? args.view : null), { view, plain: deg == null && !zoom });
      }
      save(`${job.name}-${view.toLowerCase()}.jpg`, await jpeg(shot));
    }
    if (job.texture) save(`${job.name}-tex.jpg`, await page.evaluate(() => window.__v.parts[0].painter.canvas.toDataURL('image/jpeg', 0.7)));
    console.log(job.name, r, 'applied in', applied, 'ms');
  }
  if (errors.length) console.log([...new Set(errors)].slice(0, 20).join('\n'));
  await browser.close();
})();
