// Renders the bundled viewer in headless Chrome and saves screenshots.
// Usage: node viewer/shot.cjs <outDir> [width height]
const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../.tools/browser/node_modules/playwright'));
(async () => {
  const out = process.argv[2];
  const [w, h] = [Number(process.argv[3] || 412), Number(process.argv[4] || 760)];
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const url = 'file:///' + path.resolve(__dirname, '../assets/viewer/index.html').replace(/\\/g, '/') + '?still&mobile';
  await page.goto(url);
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  for (const view of ['Front', 'Side', 'Back']) {
    await page.evaluate((v) => window.viewer.setView(v), view);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(out, `viewer-${view.toLowerCase()}.png`) });
  }
  console.log(JSON.stringify({ errors }));
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
