import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(root, '.tools/browser/node_modules/playwright'));
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errors = [];
const out = path.join(here, 'previews');
fs.mkdirSync(out, { recursive: true });
try {
  for (const [name, source] of [['before', 'assets/viewer/index.html'], ['after', 'website/public/media/viewer/index.html']]) {
    const page = await browser.newPage({ viewport: { width: 840, height: 840 }, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
    await page.goto(`file:///${path.join(root, source).replaceAll('\\', '/')}?still&mobile`);
    await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 60000 });
    await page.evaluate(async () => { await window.viewer.setDesign({ logoText: '3DEEZI', backName: 'YOUR NAME', number: '23' }); });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: path.join(out, `${name}-front.png`) });
    await page.evaluate(() => window.viewer.setView('Side'));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, `${name}-side.png`) });
    console.log(JSON.stringify({ scene: name, capture: await page.evaluate(() => window.viewer.captureDataUrl('Back').startsWith('data:image/png;base64,')) }));
    await page.close();
  }
  console.log(JSON.stringify({ errors }));
} finally { await browser.close(); }
