// The shared recipe for a new ready-made (Tripo) model (BBSINGLET 2026-11-16, the user: a new GLB needs only a short
// settings file and one command). From website/:
//
//   node viewer/tripo-add.mjs <name> [--steps convert,wire,build,check] [--agent NAME]
//
// The settings: viewer/models/<name>.json
//   glb        the model file (from viewer/), read as data only
//   converter  viewer/tripo-<converter>.mjs: the garment kind's converter (placement, flat print places, bands); a new
//              model of a kind already done reuses that kind's converter
//   part       the viewer part it is shown as (singlet ...), `flag` the look's flag (design.zoneColors[flag]) that shows it
//   ownNeck    the model's own neck (shown exactly as it is; the only neck for now: nothing is cut, user 2026-11-16)
//   tiles      [{ name, image }]: the catalog tiles (website config/catalog.php and app lib/sports_catalog.dart) that get it
//   look       the starting look (colours, marks, layers) from the booklet card: our marks only, never the card's text
//   check      { views }: the quick check sheet's views (shots.cjs view names)
//
// Steps (all by default):
//   convert  GLB -> viewer/tripo-<name>.js (the converter; the model's points are only scaled and placed, never moved)
//   wire     viewer/src/recipemodels.js (all models' settings), the flag in modelFlags.ts and lib/model_flags.dart, the
//            look and tiles in catalog.php and sports_catalog.dart (tile lines rewritten to show the model)
//   build    under viewer.lock: the merge gate's save (recipe/gate.cjs), VIEWER_VERSION + 1 (KitViewer.tsx, re-read first),
//            build.mjs (both viewer copies), public/media/presets.json put back as it was, then the merge gate's check
//            (only this model's tiles may change; on FAIL the last good viewer is put back): --allow more,tiles  --no-gate
//   check    under browser.lock: the check sheet (viewer/models/check/<name>.jpg) and the other tiles' fingerprints,
//            before (the viewer as it was) and after: they must be identical
// The vite and flutter builds stay separate (one heavy job at a time).
//
// Strict rule (user 2026-11-16): the GLB's shape is final. The model's own neck is shown as it is; other necks are built
// on it (tripomesh.js vOf / cutNeck: cut only where the opening itself changes, our band laid on).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readGLB, viewerLib, pack, writeData, parts, neighbours, openChains, closestOnTriangle, madeSurface, fitFlat, FLAT_UNIT } from './tripo-convert.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), web = path.resolve(here, '..'), root = path.resolve(web, '..');
const args = process.argv.slice(2), name = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const steps = opt('steps', 'convert,wire,build,check').split(',');
const agent = opt('agent', process.env.AGENT ?? 'RECIPE');
const settingsFile = path.join(here, 'models', `${name}.json`);
if (!name || !fs.existsSync(settingsFile)) { console.error('usage: node viewer/tripo-add.mjs <name>   (viewer/models/<name>.json holds its settings)'); process.exit(1); }
const S = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
const say = (...m) => console.log(`[${name}]`, ...m);
const read = (f) => fs.readFileSync(f, 'utf8'), write = (f, s) => fs.writeFileSync(f, s);
const LOCK_DIRS = (process.env.LOCK_DIRS ?? 'D:/systemp/claude/d--3d-app/f8ed271f-373f-48f2-8ab8-74454c4c0e9f/scratchpad D:/systemp/claude/0fe865e4811eb60b/f8ed271f-373f-48f2-8ab8-74454c4c0e9f/scratchpad').split(' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withLock(lock, fn) {
  // (A lock is never stale by age (AGENT-RULES 7): wait until it is gone. After writing our stamp, wait 2 s and read it
  // again; if another agent's stamp is there, it won: wait again.)
  const stamp = `${agent} ${new Date().toISOString().replace('T', ' ').slice(0, 19)} ${process.pid}\n`;
  for (;;) {
    const busy = LOCK_DIRS.map((d) => path.join(d, lock)).find((f) => fs.existsSync(f));
    if (busy) { say(`waiting: ${lock} held by ${read(busy).trim()}`); await sleep(15000); continue; }
    for (const d of LOCK_DIRS) if (fs.existsSync(d)) write(path.join(d, lock), stamp);
    await sleep(2000);
    if (LOCK_DIRS.every((d) => !fs.existsSync(d) || (fs.existsSync(path.join(d, lock)) && read(path.join(d, lock)) === stamp))) break;
  }
  // (Only our own lock is removed: another agent may hold it by then.)
  try { return await fn(); } finally { for (const d of LOCK_DIRS) { const f = path.join(d, lock); if (fs.existsSync(f) && read(f) === stamp) fs.rmSync(f); } }
}

// ---------- convert
if (steps.includes('convert')) {
  const config = (await import(pathToFileURL(path.join(here, `tripo-${S.converter}.mjs`)).href)).default;
  const lib = await viewerLib(path.join(here, 'src'), config.lib, root);
  const glb = readGLB(path.resolve(here, S.glb));
  const t0 = Date.now();
  const { data, report } = await config.convert({ glb, lib, srcDir: path.join(here, 'src'), settings: S, tools: { readGLB, parts, neighbours, openChains, closestOnTriangle, madeSurface, fitFlat, FLAT_UNIT } });
  const size = writeData(path.join(here, `tripo-${name}.js`), name, pack(data, data.extra));
  say(`converted: viewer/tripo-${name}.js (${Math.round(size / 1024)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (report) console.log(report);
}

// ---------- wire
const php = (v, ind = '') => Array.isArray(v) ? `[${v.map((x) => php(x, ind)).join(', ')}]` : v && typeof v === 'object' ? `[${Object.entries(v).map(([k, x]) => `'${k}' => ${php(x, ind)}`).join(', ')}]` : typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : String(v);
const dart = (v) => Array.isArray(v) ? `${v.length && typeof v[0] === 'object' ? '<Map<String, dynamic>>' : ''}[${v.map(dart).join(', ')}]` : v && typeof v === 'object' ? `{${Object.entries(v).map(([k, x]) => `'${k}': ${dart(x)}`).join(', ')}}` : typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : String(v);
if (steps.includes('wire')) {
  // The viewer's registry, from every model's settings.
  const all = {};
  for (const f of fs.readdirSync(path.join(here, 'models')).filter((f) => f.endsWith('.json')).sort()) {
    const m = JSON.parse(read(path.join(here, 'models', f)));
    all[f.slice(0, -5)] = { part: m.part, ...(m.garment ? { garment: m.garment } : {}), ...(m.wide ? { wide: true } : {}), ...(m.except ? { except: m.except } : {}), flag: m.flag, ownNeck: m.ownNeck, necks: {} };   // (Own neck only for now (user 2026-11-16): no neck is cut; other necks come later, laid on top.)
  }
  write(path.join(here, 'src/recipemodels.js'), `// Made by viewer/tripo-add.mjs from viewer/models/*.json: the ready-made models added by the shared recipe. Do not edit.\nexport const RECIPE_MODELS = ${JSON.stringify(all)};\n`);
  // The flag kept by presets and resets (website and app).
  const mf = path.join(web, 'resources/js/modelFlags.ts');
  let t = read(mf);
  if (!t.includes(`'${S.flag}'`)) { t = t.replace(/(export const MODEL_FLAGS = \[[^\]]*)\]/, `$1, '${S.flag}']`); write(mf, t); }
  const df = path.join(root, 'lib/model_flags.dart');
  t = read(df);
  if (!t.includes(`'${S.flag}'`)) { t = t.replace(/(const modelFlags = \[[\s\S]*?)(\r?\n)\];/, `$1$2  '${S.flag}',$2];`); write(df, t); }
  // The look and the tiles: website.
  const cf = path.join(web, 'config/catalog.php');
  t = read(cf);
  const nl = t.includes('\r\n') ? '\r\n' : '\n';
  // (`baseLook`: the tile keeps an existing look (2026-11-16, the user: the tile's own design, not the booklet card's
  // colours): the model's look is a copy of that look with only the model's flag added to its colour areas.)
  const flagHex = '#ffffff';
  const baseLine = S.baseLook ? t.split(/\r?\n/).find((l) => l.startsWith(`        '${S.baseLook}' => [`)) : null;
  if (S.baseLook && !baseLine) throw new Error(`base look not found: ${S.baseLook}`);
  const lookLine = baseLine
    ? (baseLine.includes("'zoneColors' => [") ? baseLine.replace("'zoneColors' => [", `'zoneColors' => ['${S.flag}' => '${flagHex}', `) : baseLine.replace(/\],\s*$/, `, 'zoneColors' => ['${S.flag}' => '${flagHex}']],`)).replace(`'${S.baseLook}' =>`, `'${S.flag}' =>`)
    : `        '${S.flag}' => ${php(S.look)},`;
  const MARK = '        // (Looks of the models added by the shared recipe: viewer/tripo-add.mjs, viewer/models/<name>.json.)';
  if (!t.includes(MARK)) t = t.replace(/^(\s*)'bballSinglet' => \[/m, `${MARK}${nl}$&`);
  const lines = t.split(nl);
  const at = lines.findIndex((l) => l.startsWith(`        '${S.flag}' => [`));
  if (at >= 0) lines[at] = lookLine; else lines.splice(lines.indexOf(MARK) + 1, 0, lookLine);
  // (`pictures`: every tile showing that picture without a look of its own (catalog.php $pictureLooks) takes this look.)
  for (const pic of S.pictures ?? []) {
    const k = lines.findIndex((l) => l.startsWith('$pictureLooks = ['));
    let done = false;
    for (let j = k; j > 0 && j < lines.length && !lines[j].startsWith('];'); j++) {
      const re = new RegExp(`'${pic}' => '[^']*'`);
      if (re.test(lines[j])) { lines[j] = lines[j].replace(re, `'${pic}' => '${S.flag}'`); done = true; break; }
    }
    if (!done) say(`website picture not found: ${pic}`);
  }
  for (const tile of S.tiles) {
    // (Every tile of that name: a name used in several sports gets the model in all of them.)
    const ks = lines.map((l, k) => (new RegExp(`\\$(near|tile)\\('${tile.name}', `).test(l) ? k : -1)).filter((k) => k >= 0);
    if (!ks.length) { say(`website tile not found: ${tile.name}`); continue; }
    for (const k of ks) {
      const m = /^(\s*)\$(?:near|tile)\('([^']*)', '((?:[^'\\]|\\.)*)', '([^']*)'/.exec(lines[k]);
      lines[k] = `${m[1]}$tile('${m[2]}', '${m[3]}', '${m[4]}', '${tile.image ?? m[4]}') + ['design' => $look('${S.flag}')],`;
    }
  }
  write(cf, lines.join(nl));
  // The look and the tiles: app.
  const sf = path.join(root, 'lib/sports_catalog.dart');
  t = read(sf);
  const dnl = t.includes('\r\n') ? '\r\n' : '\n';
  const DMARK = '    // Looks of the models added by the shared recipe (viewer/tripo-add.mjs).';
  if (!t.includes(DMARK)) t = t.replace(/^    'bballSinglet': \{/m, `${DMARK}${dnl}$&`);
  let dLook = `    '${S.flag}': ${dart(S.look)},`;
  const dl = t.split(dnl);
  if (S.baseLook) {
    // (The base look's block, `    'name': {` to its closing `    },`, as one line with the flag added.)
    const b0 = dl.findIndex((l) => l.startsWith(`    '${S.baseLook}': {`));
    if (b0 < 0) throw new Error(`app base look not found: ${S.baseLook}`);
    let b1 = b0;
    if (!dl[b0].trimEnd().endsWith('},')) while (b1 < dl.length && dl[b1] !== '    },') b1++;
    let body = dl.slice(b0, b1 + 1).map((l, k) => (k ? l.trim() : l)).join(' ').replace(`'${S.baseLook}': {`, `'${S.flag}': {`);
    body = body.includes("'zoneColors': {") ? body.replace("'zoneColors': {", `'zoneColors': {'${S.flag}': '${flagHex}', `) : body.replace(`'${S.flag}': {`, `'${S.flag}': {'zoneColors': {'${S.flag}': '${flagHex}'}, `);
    dLook = body.replace(/,\s*}/g, '}').replace(/\{\s+/g, '{');
  }
  const dat = dl.findIndex((l) => l.startsWith(`    '${S.flag}': {`));
  if (dat >= 0) dl[dat] = dLook; else dl.splice(dl.indexOf(DMARK) + 1, 0, dLook);
  t = dl.join(dnl);
  for (const pic of S.pictures ?? []) {
    const block = /const pictureLooks = \{[\s\S]*?\n\};/.exec(t);
    const re = new RegExp(`(\\n  '${pic}': )'[^']*',`);
    if (!block || !re.test(block[0])) { say(`app picture not found: ${pic}`); continue; }
    t = t.replace(block[0], block[0].replace(re, `$1'${S.flag}',`));
  }
  for (const tile of S.tiles) {
    const re = new RegExp(`GarmentTile(?:\\.nearest)?\\(\\s*'${tile.name}',\\s*'((?:[^'\\\\]|\\\\.)*)',\\s*'([^']*)'[^)]*\\),`, 'g');
    const found = [...t.matchAll(re)];
    if (!found.length) { say(`app tile not found: ${tile.name}`); continue; }
    for (const m of found) t = t.replace(m[0], `GarmentTile(${dnl}      '${tile.name}',${dnl}      '${m[1]}',${dnl}      '${m[2]}',${dnl}      image: '${tile.image}',${dnl}      look: '${S.flag}',${dnl}    ),`);
  }
  write(sf, t);
  say('wired: recipemodels.js, model flags, catalog.php, sports_catalog.dart');
}

// ---------- build
const viewerHtml = path.join(web, 'public/media/viewer/index.html'), before = path.join(here, 'models/check', `${name}-before.html`);
if (steps.includes('build')) {
  fs.mkdirSync(path.dirname(before), { recursive: true });
  // (`--held`: the caller already holds viewer.lock (RUGBYJ 2026-11-18, coordinator: hold it from the wire step through the build
  // and gate), so the build runs without taking it again.)
  await (args.includes('--held') ? (_l, fn) => fn() : withLock)('viewer.lock', async () => {
    fs.copyFileSync(viewerHtml, before);
    // (The merge gate, recipe/gate.cjs: the viewer as it was saved as "last good" first.)
    execFileSync(process.execPath, [path.join(here, 'recipe/gate.cjs'), 'save'], { cwd: web, stdio: 'inherit' });
    const presets = path.join(web, 'public/media/presets.json'), keep = read(presets);
    const kv = path.join(web, 'resources/js/components/KitViewer.tsx');
    const t = read(kv), m = /export const VIEWER_VERSION = '(\d{4}-\d\d-\d\d)-(\d+)';/.exec(t);
    const next = `${m[1]}-${+m[2] + 1}`;
    write(kv, t.replace(m[0], `export const VIEWER_VERSION = '${next}';`));
    execFileSync(process.execPath, [path.join(here, 'build.mjs')], { cwd: here, stdio: 'inherit' });
    write(presets, keep);
    const same = read(viewerHtml) === read(path.join(root, 'assets/viewer/index.html'));
    say(`built: VIEWER_VERSION ${next}; both viewer copies identical: ${same}; presets.json kept`);
    // (The merge gate: every model tile and the first tile of each other garment against the last good viewer; only this
    // model's tiles may change; on FAIL the last good viewer is put back and this command stops.)
    if (!args.includes('--no-gate')) {
      const allow = [S.flag, ...S.tiles.map((t) => t.name), ...(S.wide ? [S.part] : []), ...(opt('allow', '') ? opt('allow', '').split(',') : [])].join(',');
      try { execFileSync(process.execPath, [path.join(here, 'recipe/gate.cjs'), 'check', '--allow', allow], { cwd: web, stdio: 'inherit' }); }
      catch { say('MERGE GATE FAILED: the last good viewer is back; fix and build again'); process.exit(1); }
    }
  });
}

// ---------- check
if (steps.includes('check')) {
  const dir = path.join(here, 'models/check', name), R = path.join(here, 'recipe');
  fs.mkdirSync(dir, { recursive: true });
  const design = { garment: S.garment ?? S.part, logoText: '3DEEZI', layers: [], pattern: 'None', zones: [], parts: null, ...S.look };
  const jobs = path.join(dir, 'jobs.json');
  write(jobs, JSON.stringify([{ name: 'own', design, views: S.check.views, wait: 1200 }]));
  const run = (...a) => execFileSync('bash', [path.join(R, 'run-browser.sh'), process.execPath, ...a], { stdio: 'inherit', env: { ...process.env, AGENT: agent } });
  run(path.join(R, 'shots.cjs'), viewerHtml, jobs, dir, '520', '620');
  const shots = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg'));
  execFileSync(process.execPath, [path.join(R, 'montage.cjs'), path.join(here, 'models/check', `${name}.jpg`), '300', ...shots.map((f) => path.join(dir, f))], { stdio: 'inherit' });
  if (fs.existsSync(before)) {
    const hashOf = (html) => { const out = path.join(dir, `hash-${path.basename(html)}.txt`); execFileSync('bash', [path.join(R, 'run-browser.sh'), 'bash', '-c', `"${process.execPath}" "${path.join(R, 'hashes.cjs')}" "${html}" "${path.join(R, 'other-tiles.json')}" > "${out}"`], { stdio: 'inherit', env: { ...process.env, AGENT: agent } }); return read(out); };
    const a = hashOf(before), b = hashOf(viewerHtml);
    say(`other tiles' fingerprints ${a === b ? 'IDENTICAL' : 'DIFFER (see models/check/' + name + '/hash-*.txt)'}`);
  }
  say(`check sheet: viewer/models/check/${name}.jpg`);
}
