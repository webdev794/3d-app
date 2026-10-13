/* Full local browser smoke test. Run after `npm run build` and starting Laravel.
 * node scripts/smoke.cjs [http://127.0.0.1:8000]
 * Creates an isolated QA account and cleans up its project/assets on success.
 * Screenshots and downloaded exports go to design-reference/website.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.resolve(__dirname, '../../.tools/browser/node_modules/playwright'))); }

const base = (process.argv[2] || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const output = path.resolve(__dirname, '../../design-reference/website');
const run = `${Date.now()}`;
const account = { name: 'Website QA', email: `website.qa.${run}@example.test`, password: `Local-QA-${run}!` };
const projectName = `Browser QA ${run}`;
const results = [];
const runtimeErrors = [];
const requestFailures = [];
let browser;
let page;
let context;

async function step(name, action) {
    process.stdout.write(`${name} ... `);
    const start = Date.now();
    try { await action(); results.push({ name, passed: true, ms: Date.now() - start }); console.log('PASS'); }
    catch (error) { results.push({ name, passed: false, error: error.message, ms: Date.now() - start }); console.log('FAIL'); throw error; }
}

async function route(url) { await page.goto(`${base}${url}`); await page.locator('.server-banner').waitFor({ state: 'hidden' }); }
async function ready3d() { await page.locator('.kit-viewer[aria-busy="false"]').waitFor({ timeout: 45000 }); }
async function screenshot(name, fullPage = true) { await page.screenshot({ path: path.join(output, `${name}.png`), fullPage }); }
async function api(endpoint, options = {}) {
    return page.evaluate(async ({ base, endpoint, options }) => {
        const response = await fetch(`${base}/api/v1${endpoint}`, {
            ...options,
            headers: { Accept: 'application/json', Authorization: `Bearer ${sessionStorage.getItem('3deezi.session')}`, ...options.headers },
        });
        if (!response.ok) throw new Error(`API ${endpoint}: ${response.status} ${await response.text()}`);
        return response.status === 204 ? null : (await response.json()).data;
    }, { base, endpoint, options });
}
async function saveProject(name) {
    await page.locator('.studio-actions').getByRole('button', { name: /Save project/i }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByLabel('Project name').fill(name);
    const responsePromise = page.waitForResponse(response => response.url().match(/\/api\/v1\/projects(?:\/\d+)?$/) && ['POST', 'PATCH'].includes(response.request().method()));
    await dialog.getByRole('button', { name: /Save project/i }).click();
    const response = await responsePromise;
    assert(response.ok(), `Save failed: ${response.status()} ${await response.text()}`);
    await dialog.waitFor({ state: 'hidden' });
    return (await response.json()).data;
}
async function download(button, filename) {
    const waiting = page.waitForEvent('download', { timeout: 45000 });
    await button.click();
    const file = await waiting;
    const target = path.join(output, filename || file.suggestedFilename());
    await file.saveAs(target);
    assert(fs.statSync(target).size > 20, 'Downloaded file is empty');
    return target;
}
async function noOverflow() {
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert(dimensions.scroll <= dimensions.width + 2, `Horizontal overflow: ${dimensions.scroll}px at ${dimensions.width}px`);
}

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}), args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) requestFailures.push({ url: request.url(), error: request.failure()?.errorText }); });
    page.on('dialog', dialog => dialog.accept());

    await step('Homepage and desktop layout', async () => {
        await route('/');
        await page.locator('.hero h1').waitFor();
        await page.locator('.creation-card').first().waitFor();
        await noOverflow();
        await screenshot('home-desktop');
    });
    await step('Register through the website', async () => {
        await page.locator('.header-actions').getByRole('button', { name: /^Sign in$/i }).click();
        const auth = page.locator('dialog[open]');
        await auth.locator('.auth-switch').getByRole('button', { name: /Create an account/i }).click();
        await auth.locator('input[name="name"]').fill(account.name);
        await auth.locator('input[name="email"]').fill(account.email);
        await auth.locator('input[name="password"]').fill(account.password);
        await auth.locator('input[name="password_confirmation"]').fill(account.password);
        await auth.locator('form').getByRole('button', { name: /Create account/i }).click();
        await auth.waitFor({ state: 'hidden' });
        assert(await page.evaluate(() => !!sessionStorage.getItem('3deezi.session')), 'Registration did not persist a token');
    });
    await step('DYO sport and garment flow', async () => {
        await page.locator('.creation-card.dyo-card').click();
        await page.locator('.sport-card').filter({ has: page.getByRole('heading', { name: 'Rugby League', exact: true }) }).click();
        await page.locator('.flow-actions').getByRole('button').click();
        await page.locator('.garment-card').filter({ has: page.getByRole('heading', { name: 'Jersey', exact: true }) }).click();
        await page.locator('.flow-actions').getByRole('button').click();
        await ready3d();
        await screenshot('studio-desktop-initial');
    });
    await step('Color, pattern, lettering, undo and back view', async () => {
        await page.getByRole('button', { name: 'Apply palette 2', exact: true }).click();
        await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
        await page.locator('.pattern-grid').getByRole('button', { name: 'Stripes', exact: true }).click();
        await page.getByRole('tab', { name: 'Text', exact: true }).click();
        await page.getByLabel('Team wordmark', { exact: true }).fill('QA WARRIORS');
        await page.getByLabel('Player name', { exact: true }).fill('MORGAN');
        await page.getByLabel('Player number', { exact: true }).fill('42');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        assert.equal(await page.getByLabel('Player number', { exact: true }).inputValue(), '23');
        await page.getByRole('button', { name: 'Redo', exact: true }).click();
        assert.equal(await page.getByLabel('Player number', { exact: true }).inputValue(), '42');
        await page.locator('.view-controls').getByRole('button', { name: 'back', exact: true }).click();
        await ready3d();
        await screenshot('studio-desktop-back');
    });
    let project;
    await step('Save project and verify API persistence', async () => {
        project = await saveProject(projectName);
        assert.equal(project.version, 1);
        assert.equal(project.design.main.toLowerCase(), '#08233e');
        assert.equal(project.design.pattern, 'Stripes');
        assert.equal(project.design.logoText, 'QA WARRIORS');
        assert.equal(project.design.number, '42');
        assert.equal(project.design.backName, 'MORGAN');
        const saved = await api(`/projects/${project.id}`);
        assert.equal(saved.design.number, '42');
        if (process.env.REQUIRE_THUMBNAIL === '1') assert.match(saved.thumbnail || '', /^data:image\/(?:jpeg|png|webp);base64,/);
    });
    await step('Reload project, edit, save version and inspect history', async () => {
        await route('/projects');
        await page.getByRole('button', { name: `Open ${projectName} in the design studio`, exact: true }).click();
        await ready3d();
        await page.getByRole('tab', { name: 'Text', exact: true }).click();
        assert.equal(await page.getByLabel('Player number', { exact: true }).inputValue(), '42');
        await page.getByLabel('Player number', { exact: true }).fill('43');
        project = await saveProject(projectName);
        assert.equal(project.version, 2);
        await route('/projects');
        await page.getByRole('button', { name: `Version history for ${projectName}`, exact: true }).click();
        const history = page.locator('dialog[open]');
        await history.getByText('Version 1', { exact: true }).waitFor();
        await history.getByText('Version 2', { exact: true }).waitFor();
        await history.getByRole('button', { name: 'Close dialog', exact: true }).click();
        await screenshot('projects-desktop');
    });
    await step('Approve project and verify approved collection', async () => {
        const responsePromise = page.waitForResponse(response => response.url().endsWith(`/projects/${project.id}`) && response.request().method() === 'PATCH');
        await page.getByRole('button', { name: `Approve ${projectName}`, exact: true }).click();
        assert((await responsePromise).ok(), 'Approval failed');
        await route('/approved');
        await page.getByRole('button', { name: `Open ${projectName} in the design studio`, exact: true }).waitFor();
        assert.equal((await api(`/projects/${project.id}`)).status, 'approved');
    });
    let asset;
    await step('Upload, preview and download a private asset', async () => {
        await route('/assets');
        await page.getByRole('button', { name: /Upload (an )?asset/i }).first().click();
        const upload = page.locator('dialog[open]');
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
        await upload.locator('input[type="file"]').setInputFiles({ name: 'qa-crest.png', mimeType: 'image/png', buffer: png });
        await upload.getByLabel('Asset name').fill('QA crest');
        const responsePromise = page.waitForResponse(response => response.url().endsWith('/assets') && response.request().method() === 'POST');
        await upload.getByRole('button', { name: 'Upload asset', exact: true }).click();
        const response = await responsePromise;
        assert(response.ok(), `Asset upload failed: ${response.status()} ${await response.text()}`);
        asset = (await response.json()).data;
        await upload.waitFor({ state: 'hidden' });
        await page.getByRole('img', { name: 'QA crest', exact: true }).waitFor();
        await download(page.getByRole('button', { name: 'Download QA crest', exact: true }), 'asset-download.png');
        const anonymous = await context.request.get(`${base}/api/v1/assets/${asset.id}/file`, { headers: { Accept: 'application/json' } });
        assert.equal(anonymous.status(), 401, 'Asset was available without bearer authentication');
    });
    await step('Dashboard uses saved project and asset counts', async () => {
        await route('/dashboard');
        await page.locator('.lib-stat-card').first().waitFor();
        const dashboard = await api('/dashboard');
        assert.equal(dashboard.projects, 1);
        assert.equal(dashboard.approved, 1);
        assert.equal(dashboard.assets, 1);
        assert.equal(await page.locator('.lib-project-card').count(), 1);
    });
    await step('PNG front/back and editable JSON exports', async () => {
        await page.getByRole('button', { name: `Open ${projectName} in the design studio`, exact: true }).click();
        await ready3d();
        await page.locator('.studio-actions').getByRole('button', { name: 'Export', exact: true }).click();
        const exporting = page.locator('dialog[open]');
        const pngPath = await download(exporting.getByRole('button', { name: /3D mockup/i }), 'kit-mockup.png');
        assert.equal(fs.readFileSync(pngPath).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert(fs.statSync(pngPath).size > 10000, '3D PNG was suspiciously small');
        const pairPath = await download(exporting.getByRole('button', { name: /Front & back/i }), 'kit-front-back.png');
        assert(fs.statSync(pairPath).size > 20000, 'Front/back PNG was suspiciously small');
        const jsonPath = await download(exporting.getByRole('button', { name: /Design specification/i }), 'kit-design.json');
        const spec = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        assert.equal(spec.design.number, '43');
        assert.equal(spec.design.logoText, 'QA WARRIORS');
        await exporting.getByRole('button', { name: 'Close dialog', exact: true }).click();
        await screenshot('studio-desktop-saved');
    });
    await step('Mobile studio, navigation and page widths', async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await noOverflow();
        await screenshot('studio-mobile');
        await route('/');
        await noOverflow();
        await screenshot('home-mobile');
        await page.getByRole('button', { name: 'Toggle menu', exact: true }).click();
        await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Projects', exact: true }).click();
        await page.locator('.lib-project-card').waitFor();
        await noOverflow();
        await screenshot('projects-mobile');
        await page.setViewportSize({ width: 320, height: 780 });
        await noOverflow();
        await route('/assets');
        await page.locator('.lib-asset-card').waitFor();
        await noOverflow();
        await page.setViewportSize({ width: 1440, height: 1000 });
    });
    await step('Delete test project and asset through confirmation dialogs', async () => {
        await page.getByRole('button', { name: 'Delete QA crest', exact: true }).click();
        await page.locator('dialog[open]').getByRole('button', { name: 'Delete asset', exact: true }).click();
        await page.locator('dialog[open]').waitFor({ state: 'hidden' });
        await route('/projects');
        await page.getByRole('button', { name: `Delete ${projectName}`, exact: true }).click();
        await page.locator('dialog[open]').getByRole('button', { name: 'Delete project', exact: true }).click();
        await page.locator('dialog[open]').waitFor({ state: 'hidden' });
        assert.equal((await api('/projects')).length, 0);
        assert.equal((await api('/assets')).length, 0);
    });
    await step('Sign out, guarded pages and sign back in', async () => {
        await route('/profile');
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await page.locator('.header-actions').getByRole('button', { name: /^Sign in$/i }).waitFor();
        assert.equal(await page.evaluate(() => sessionStorage.getItem('3deezi.session')), null);
        await route('/projects');
        await page.locator('.auth-gate').waitFor();
        await page.locator('.auth-gate').getByRole('button').click();
        const auth = page.locator('dialog[open]');
        await auth.locator('input[name="email"]').fill(account.email);
        await auth.locator('input[name="password"]').fill(account.password);
        await auth.locator('form').getByRole('button', { name: /^Sign in$/i }).click();
        await auth.waitFor({ state: 'hidden' });
        await page.getByRole('heading', { name: 'My projects', exact: true }).waitFor();
        await api('/auth/logout', { method: 'POST' });
    });
    await step('No uncaught browser errors', async () => { assert.deepEqual(runtimeErrors, []); });
})().catch(async error => {
    console.error(error.stack || error);
    if (page) {
        await screenshot('smoke-failure').catch(() => {});
        console.error((await page.locator('body').innerText().catch(() => '')).slice(-4500));
    }
    process.exitCode = 1;
}).finally(async () => {
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'smoke-results.json'), JSON.stringify({ base, time: new Date().toISOString(), results, runtimeErrors, requestFailures }, null, 2));
    await browser?.close();
    console.log(`Results: ${path.join(output, 'smoke-results.json')}`);
});
