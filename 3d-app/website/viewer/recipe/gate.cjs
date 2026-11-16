// The MERGE GATE (MODELQ 2026-11-16, the user: a merge must never break a tile that was fine). One command, from website/:
//
//   node viewer/recipe/gate.cjs save                 the built viewer as it is now = "last good" (before your build)
//   node viewer/recipe/gate.cjs check [--allow A,B]  after your build: every model tile and the first tile of every other
//                                                    garment, front + back at normal zoom, against the last good viewer
//   node viewer/recipe/gate.cjs restore              put the last good viewer back (both copies + VIEWER_VERSION)
//
// check: one browser session (under browser.lock, recipe/run-browser.sh), both viewers in turn. Per tile: page errors,
// the 3D's geometry and print fingerprints, and the front and back pictures (how much of the picture the garment covers,
// and the mean colour difference). A tile in --allow (tile names, or model flags / names: the tiles the merge means to
// change) may differ, but must still show a whole garment (its cover not 10 % less than before, not near black where it
// was not). Every other tile must match (fingerprints equal, pictures within a small difference). On FAIL the last good
// viewer is put back at once and the reasons are printed; exit code 1. tripo-add.mjs --steps build runs save + check.
const fs = require('fs'), path = require('path'), url = require('url'), { execFileSync } = require('child_process');
const here = __dirname, web = path.resolve(here, '../..'), root = path.resolve(web, '..');
const LG = path.join(here, 'lastgood');
const COPIES = { web: path.join(web, 'public/media/viewer/index.html'), app: path.join(root, 'assets/viewer/index.html') };
const KV = path.join(web, 'resources/js/components/KitViewer.tsx');
const verOf = (t) => /export const VIEWER_VERSION = '([^']+)';/.exec(t)?.[1];
const [cmd, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : null; };

function save() {
  fs.mkdirSync(LG, { recursive: true });
  fs.copyFileSync(COPIES.web, path.join(LG, 'web.html'));
  fs.copyFileSync(COPIES.app, path.join(LG, 'app.html'));
  fs.writeFileSync(path.join(LG, 'version.txt'), verOf(fs.readFileSync(KV, 'utf8')));
  console.log(`gate: saved the last good viewer (${fs.readFileSync(path.join(LG, 'version.txt'), 'utf8')})`);
}
function restore() {
  fs.copyFileSync(path.join(LG, 'web.html'), COPIES.web);
  fs.copyFileSync(path.join(LG, 'app.html'), COPIES.app);
  const v = fs.readFileSync(path.join(LG, 'version.txt'), 'utf8').trim(), t = fs.readFileSync(KV, 'utf8');
  fs.writeFileSync(KV, t.replace(/export const VIEWER_VERSION = '[^']+';/, `export const VIEWER_VERSION = '${v}';`));
  console.log(`gate: RESTORED the last good viewer (${v}): both copies and VIEWER_VERSION. Run the vite build again if it ran.`);
}

/** The tiles to check: every tile on a ready-made model, and the first tile of each other garment (designs once). */
function tiles() {
  let s = execFileSync('php', ['-d', 'display_startup_errors=0', '-d', 'display_errors=0', path.join(here, 'tiles.php')], { cwd: web, encoding: 'utf8', maxBuffer: 1 << 26 });
  const all = JSON.parse(s.slice(s.indexOf('[')));
  const flags = new Set();
  const mf = fs.readFileSync(path.join(web, 'resources/js/modelFlags.ts'), 'utf8').match(/MODEL_FLAGS = \[([^\]]*)\]/)?.[1] ?? '';
  for (const m of mf.matchAll(/'([^']+)'/g)) flags.add(m[1]);
  const rec = fs.readFileSync(path.join(web, 'viewer/src/recipemodels.js'), 'utf8'), R = JSON.parse(rec.slice(rec.indexOf('{'), rec.lastIndexOf('}') + 1));
  const wide = new Set(Object.values(R).filter((m) => m.wide).map((m) => m.part));
  for (const m of Object.values(R)) flags.add(m.flag);
  const seen = new Set(), garments = new Set(), out = [];
  for (const t of all) {
    const d = { layers: [], logoText: '3DEEZI', pattern: 'None', zones: [], parts: null, gradient: null, gradients: null, ...t.design };
    const key = JSON.stringify(d);
    if (seen.has(key)) continue;
    const model = Object.keys(d.zoneColors ?? {}).some((f) => flags.has(f)) || wide.has(t.garment);
    if (!model && garments.has(t.garment)) continue;
    seen.add(key); garments.add(t.garment);
    out.push({ name: `${t.sport}/${t.name}`, model, flags: Object.keys(d.zoneColors ?? {}).filter((f) => flags.has(f)), garment: t.garment, design: d });
  }
  return out;
}

async function check() {
  const { chromium } = require('D:/3d-app/3d-app/.tools/browser/node_modules/playwright');
  const { loadImage, createCanvas } = require(path.join(web, 'node_modules/@napi-rs/canvas'));
  const allow = new Set((opt('allow') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const list = tiles();
  const allowed = (t) => allow.has(t.name) || allow.has(t.name.split('/')[1]) || t.flags.some((f) => allow.has(f)) || allow.has(t.garment);
  console.log(`gate: ${list.length} tiles (${list.filter((t) => t.model).length} on models); may change: ${list.filter(allowed).map((t) => t.name).join(', ') || 'none'}`);
  // (The viewer as built by this merge: if another agent builds while this runs, nothing is put back over theirs. Run the
  // check while holding viewer.lock, as tripo-add.mjs does.)
  const builtAt = fs.statSync(COPIES.web).mtimeMs;
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const run = async (html) => {
    const page = await browser.newPage({ viewport: { width: 360, height: 440 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    await page.addInitScript(() => { window.Viewer = { postMessage: () => {} }; });
    await page.goto(url.pathToFileURL(html).href + '?host=t&still&debug');
    await page.waitForFunction(() => document.body.classList.contains('ready') && window.__v, null, { timeout: 180000 });
    // The empty stage (kit hidden), to measure how much of a picture the garment covers.
    const bg = await page.evaluate(async () => { window.__v.kit.visible = false; const d = window.viewer.captureDataUrl('Front'); window.__v.kit.visible = true; return d; });
    const res = {};
    for (const t of list) {
      errors.length = 0;
      const r = await page.evaluate(async (d) => {
        const ok = await window.viewer.setDesign(d).then(() => 'ok', (e) => `THREW ${e.message}`);
        const h = async (arr) => { const b = await crypto.subtle.digest('SHA-1', new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)); return [...new Uint8Array(b)].slice(0, 5).map((x) => x.toString(16).padStart(2, '0')).join(''); };
        const fp = [];
        for (const part of window.__v.parts) {
          let fabric = null;
          part.rim.parent.traverse((o) => { if (o.isMesh && !fabric && [o.material].flat().includes(part.material)) fabric = o; });
          if (!fabric) { fp.push('nofabric'); continue; }
          const g = fabric.geometry;
          fp.push(`${part.painter.kind}:${await h(g.getAttribute('position').array)}/${await h(g.index.array)}/${await h(g.getAttribute('uv').array)}`);
        }
        return { ok, fp: fp.join(' ') };
      }, t.design);
      // (MODELQ3 2026-11-16: the pictures only once the design has finished painting (its print, fonts and pictures load
      // after setDesign answers): both views taken again every 0.5 s until two rounds in a row are the same, at most 6 s.
      // A fixed 400 ms caught some tiles half painted on the heavier page: picture-only failures on untouched tiles.)
      let pics = null;
      for (let k = 0; k < 12; k++) {
        await page.waitForTimeout(500);
        const now = [];
        for (const v of ['Front', 'Back']) now.push(await page.evaluate((v) => window.viewer.captureDataUrl(v), v));
        const same = pics && now.every((d, j) => d === pics[j]);
        pics = now;
        if (same) break;
      }
      res[t.name] = { ...r, pics, errors: [...errors] };
    }
    await page.close();
    return { res, bg };
  };
  const toPx = async (dataUrl) => { const img = await loadImage(Buffer.from(dataUrl.split(',')[1], 'base64')); const c = createCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, img.width, img.height).data; d.W = img.width; return d; };
  try {
    const A = await run(path.join(LG, 'web.html')), B = await run(COPIES.web);
    const bgA = await toPx(A.bg), bgB = await toPx(B.bg);
    const fails = [];
    for (const t of list) {
      const a = A.res[t.name], b = B.res[t.name];
      if (b.ok !== 'ok') { fails.push(`${t.name}: the design did not go on (${b.ok})`); continue; }
      if (b.errors.length && !a.errors.length) fails.push(`${t.name}: page errors ${b.errors.join(' | ')}`);
      for (let k = 0; k < 2; k++) {
        const pa = await toPx(a.pics[k]), pb = await toPx(b.pics[k]);
        let covA = 0, covB = 0, diff = 0, lumA = 0, lumB = 0;
        const n = pa.length / 4;
        // (Changes counted per 8 x 8 pixel block: render noise on single pixels along edges averages out; a block counts as
        // changed when its mean colour moved more than 30 of 255.)
        const W = pa.W, B = 8, bw = Math.ceil(W / B), bsum = new Float64Array(bw * Math.ceil(n / W / B)), bcnt = new Float64Array(bsum.length);
        for (let i = 0; i < pa.length; i += 4) {
          const bi = Math.floor(i / 4 / W / B) * bw + Math.floor(((i / 4) % W) / B);
          bsum[bi] += pa[i] + pa[i + 1] + pa[i + 2] - pb[i] - pb[i + 1] - pb[i + 2]; bcnt[bi] += 3;
          const inA = Math.abs(pa[i] - bgA[i]) + Math.abs(pa[i + 1] - bgA[i + 1]) + Math.abs(pa[i + 2] - bgA[i + 2]) > 24;
          const inB = Math.abs(pb[i] - bgB[i]) + Math.abs(pb[i + 1] - bgB[i + 1]) + Math.abs(pb[i + 2] - bgB[i + 2]) > 24;
          if (inA) { covA++; lumA += pa[i] + pa[i + 1] + pa[i + 2]; }
          if (inB) { covB++; lumB += pb[i] + pb[i + 1] + pb[i + 2]; }
          diff += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
        }
        const view = k ? 'back' : 'front', mean = diff / n / 3;
        lumA = covA ? lumA / covA / 3 : 0; lumB = covB ? lumB / covB / 3 : 0;
        if (covB < covA * 0.9) fails.push(`${t.name} ${view}: the garment covers ${((100 * covB) / n).toFixed(1)} % of the picture, was ${((100 * covA) / n).toFixed(1)} % (see-through or missing parts?)`);
        if (lumB < 25 && lumA > 45) fails.push(`${t.name} ${view}: near black (${lumB.toFixed(0)}, was ${lumA.toFixed(0)})`);
        let blocks = 0;
        for (let q = 0; q < bsum.length; q++) if (bcnt[q] && Math.abs(bsum[q] / bcnt[q]) > 30) blocks++;
        if (process.env.GATE_STATS) console.log(`gate stats: ${t.name} ${view}: ${blocks} blocks changed, mean ${mean.toFixed(2)}, cover ${covA} -> ${covB}`);
        // (Not meant to change: a real change (a part recoloured, a mark moved, something missing) moves whole blocks; render
        // noise moves single pixels. More than 12 changed blocks or a mean difference over 4 fails.)
        if (!allowed(t) && (blocks > 12 || mean > 4)) fails.push(`${t.name} ${view}: changed (${blocks} blocks of 8 px changed, mean difference ${mean.toFixed(2)}) but the merge is not meant to change it`);
      }
      if (!allowed(t) && a.fp !== b.fp) fails.push(`${t.name}: its 3D shape or print map changed (${a.fp} -> ${b.fp})`);
    }
    if (fails.length) {
      console.log(`gate: FAIL (${fails.length})\n  ${fails.join('\n  ')}`);
      if (fs.statSync(COPIES.web).mtimeMs !== builtAt) console.log('gate: the viewer was built again by someone else while checking: NOT restored; check again under viewer.lock');
      else restore();
      process.exitCode = 1;
    } else console.log(`gate: PASS (${list.length} tiles, front and back)`);
  } finally { await browser.close(); }
}

if (cmd === 'save') save();
else if (cmd === 'restore') restore();
else if (cmd === 'check') {
  // (Under the PC's one browser lock, unless already inside it.)
  if (process.env.GATE_LOCKED) check().catch((e) => { console.log('gate: FAIL (could not run)', e.message); restore(); process.exitCode = 1; });
  else {
    try { execFileSync('bash', [path.join(here, 'run-browser.sh'), process.execPath, __filename, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, GATE_LOCKED: '1' } }); }
    catch (e) { process.exitCode = e.status || 1; }
  }
} else console.log('usage: node viewer/recipe/gate.cjs save | check [--allow tile names / model flags / garments, comma separated] | restore');
