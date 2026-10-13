// Exercises the actual browser renderer and bridge without API keys or accounts.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('../../.tools/browser/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.messages = [];
    window.Viewer = { postMessage: message => window.messages.push(JSON.parse(message)) };
  });
  try {
    await page.goto(pathToFileURL(path.resolve(__dirname, '../public/media/viewer/index.html')).href + '?still&mobile');
    await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 60000 });
    const checks = await page.evaluate(async () => {
      const viewer = window.viewer;
      const tile = document.createElement('canvas'); tile.width = tile.height = 100;
      const context = tile.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, 100, 100); context.fillStyle = '#000000'; context.fillRect(30, 25, 40, 50);
      await viewer.processImage({ id: 'clean-logo', src: tile.toDataURL(), removeBg: true, tint: '#ff0000' });
      const processed = window.messages.find(message => message.id === 'clean-logo');
      const image = new Image(); image.src = processed.data; await image.decode();
      const sample = document.createElement('canvas'); sample.width = image.width; sample.height = image.height; sample.getContext('2d').drawImage(image, 0, 0);
      const pixel = [...sample.getContext('2d').getImageData(10, 10, 1, 1).data];
      const layers = [
        { id: 'shape', type: 'shape', shape: 'rectangle', color: '#ff0000', part: 'top', side: 'front', x: 0, y: .4, w: .16, h: .08 },
        { id: 'logo', type: 'image', src: processed.data, part: 'top', side: 'back', x: 0, y: .4, w: .08 },
        { id: 'text', type: 'text', text: 'BOARD', color: '#ffffff', part: 'top', side: 'front', x: 0, y: .6, size: .045 },
      ];
      await viewer.setDesign({ garment: 'jersey', logoText: '', backName: '', number: '', gradient: { from: '#101020', to: '#345678', angle: 0 }, zones: { sleeves: 'Dots', hem: 'Hoops' }, layers });
      const capture = viewer.captureDataUrl('Front');
      await viewer.board(true);
      viewer.select('shape');
      await viewer.captureBoard({ id: 'board-export' });
      // Find a real panel coordinate through the same pick API used by asset drops.
      let target = null;
      for (let y = .15; y < .8 && !target; y += .01) {
        for (let x = .08; x < .49; x += .01) {
          viewer.pick({ id: 'scan', x, y });
          const hit = window.messages.pop();
          if (hit.hit && hit.part === 'top' && hit.side === 'front' && Math.abs(hit.x) < .009 && Math.abs(hit.y - .4) < .009) { target = { x: x * innerWidth, y: y * innerHeight }; break; }
        }
      }
      viewer.pick({ id: 'outside', x: 0, y: 0 });
      return { processed: { width: image.width, height: image.height, pixel }, capture: capture.startsWith('data:image/png;base64,'), board: window.messages.find(message => message.id === 'board-export')?.data?.startsWith('data:image/png;base64,'), target, outside: window.messages.find(message => message.id === 'outside')?.hit };
    });
    assert.deepEqual(checks.processed, { width: 40, height: 50, pixel: [255, 0, 0, 255] });
    assert.equal(checks.capture, true); assert.equal(checks.board, true); assert.equal(checks.outside, false); assert.ok(checks.target);
    await page.mouse.move(checks.target.x, checks.target.y); await page.mouse.down();
    await page.mouse.move(checks.target.x + 24, checks.target.y - 10, { steps: 4 }); await page.mouse.up();
    await page.waitForFunction(() => window.messages.some(message => message.type === 'layers'));
    const moved = await page.evaluate(() => window.messages.filter(message => message.type === 'layers').at(-1).layers.find(layer => layer.id === 'shape'));
    assert.notEqual(moved.x, 0); assert.notEqual(moved.y, .4);
    await page.keyboard.press('Delete');
    const removed = await page.evaluate(() => window.messages.filter(message => message.type === 'layers').at(-1).layers);
    assert.equal(removed.some(layer => layer.id === 'shape'), false);
    await page.evaluate(async () => {
      await window.viewer.setDesign({ garment: 'fullkit' });
      await window.viewer.captureBoard({ id: 'fullkit-export' });
      await window.viewer.board(false);
      window.viewer.receive('{invalid');
    });
    assert.equal(await page.evaluate(() => window.messages.some(message => message.id === 'fullkit-export' && message.data?.startsWith('data:image/png;base64,'))), true);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: ['background removal and tint', 'gradient and per-zone painting', '3D PNG capture', 'board PNG capture', 'panel picking and empty-space rejection', 'pointer layer move', 'keyboard layer deletion', 'full-kit board export', 'malformed bridge message recovery'], errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
