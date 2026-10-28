// Projects (5.119) and Send to 3D Studio linked to the design (5.62–5.68).
//
// On this device: the open design is kept as you work (autosave, a moment after each change and when the page is
// hidden or closed) and comes back after a reload. A design too big for the page's storage (about 5 MB, pictures
// included) goes to the browser's database instead.
//
// In the 3DEEZI account: File > Save to my account / Save as… / Open from my account keep editable designs (every
// page, a name and a small picture); Save as template / New from template reuse layouts (four built-in starters and
// the user's own). The account belongs to the host (the website or the app), so requests go over the host bridge:
//   artboard -> host  {type: 'docs', id, op, …}: op 'list' {template}, 'get' {doc}, 'save' {doc?, version?, name,
//                     document, preview, template}, 'delete' {doc}, 'projects' (the kits to send artwork to)
//   host -> artboard  docsReply {id, ok: true, data} or {id, ok: false, error, status, signin}
//   host -> artboard  host {docs: true, signedIn, kit: {name, garment, artboards: [ids]}, garments: [{id, name,
//                     parts}], placements: [{id, label, part}]}: the account is there (sent when ready, and again
//                     after signing in or out)
//   host -> artboard  openDoc {id}: the Studio's "Edit in Artboard" (the design an artwork layer came from)
//   artboard -> host  {type: 'signin'}: the host shows its sign-in
//   artboard -> host  {type: 'artwork', data, name, artboard, target: {kind: 'current' | 'garment' | 'project',
//                     garment, project}, placement}: Send to 3D Studio. `artboard` is the design's id in the account:
//                     the layer on the kit keeps it, and the host updates layers that have it in place.
// A host that never says `host` (the page opened on its own, older apps) keeps the simple Save and Send.
import { StaticCanvas, util } from 'fabric';
import { TEMPLATES, templateJson } from './templates.js';

// -------------------------------------------------------------------------------------------------------------------
// The design on this device
// -------------------------------------------------------------------------------------------------------------------
const DB = '3deezi-artboard-docs';
/** One request on the browser's database (IndexedDB), for designs too big for localStorage. */
function withStore(mode, fn) {
  return new Promise((resolve, reject) => {
    let open;
    try { open = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
    open.onupgradeneeded = () => open.result.createObjectStore('docs');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      try {
        const tx = db.transaction('docs', mode), req = fn(tx.objectStore('docs'));
        tx.oncomplete = () => { db.close(); resolve(req?.result); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
      } catch (e) { db.close(); reject(e); }
    };
  });
}
let seq = 0, pending = null, timer = null, onChange = null, onFull = null;
/** Keeps the design (JSON text) on this device now. */
export function saveNow(key, snap) {
  clearTimeout(timer); pending = null;
  const n = ++seq;
  try {
    localStorage.setItem(key, snap);
    if (localStorage.getItem(`${key}.big`)) { localStorage.removeItem(`${key}.big`); withStore('readwrite', (s) => s.delete(key)).catch(() => {}); }
    return;
  } catch { /* too big for localStorage: the browser's database keeps it */ }
  withStore('readwrite', (s) => s.put(snap, key)).then(() => {
    if (n !== seq) return; // a newer save went to localStorage meanwhile
    try { localStorage.setItem(`${key}.big`, '1'); localStorage.removeItem(key); } catch { /* the older copy stays */ }
  }).catch(() => onFull?.());
}
/** Keeps the design on this device a moment after the last change. `snap`: the JSON text, or a function giving it.
 *  `change`: false when nothing in the design changed (another page was opened). */
export function autosave(key, snap, change = true) {
  pending = { key, snap };
  clearTimeout(timer);
  timer = setTimeout(flushAutosave, 600);
  if (change) onChange?.();
}
/** A change not kept yet is kept now. */
export function flushAutosave() {
  const p = pending;
  if (p) saveNow(p.key, typeof p.snap === 'function' ? p.snap() : p.snap);
}
// The page is closing, reloading or going to the background: nothing waits.
addEventListener('pagehide', flushAutosave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAutosave(); });
/** The design kept on this device, or null. `older`: where an earlier version of the page kept it. */
export async function loadLocal(key, older) {
  for (const k of [key, older]) {
    if (!k) continue;
    let big = false, text = null;
    try { big = localStorage.getItem(`${k}.big`) === '1'; text = localStorage.getItem(k); } catch { /* storage blocked */ }
    if (big) { try { const s = await withStore('readonly', (st) => st.get(k)); if (typeof s === 'string' && s) return s; } catch { /* no database */ } }
    if (text) return text;
  }
  return null;
}

// -------------------------------------------------------------------------------------------------------------------
// Designs and templates in the account, Send to 3D Studio
// -------------------------------------------------------------------------------------------------------------------
const MM = 2;
const when = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
const partsOf = (garment, garments) => garments?.find((g) => g.id === garment)?.parts ?? (garment === 'shorts' || garment === 'Shorts' ? ['shorts'] : /full ?kit/i.test(garment ?? '') ? ['top', 'shorts'] : ['top']);

/**
 * ctx: $, toast, post, icon, escHtml, store (the autosave key), snapshot() (the design as JSON text),
 * open(json) (opens a design in place of the one on the page), preview() (a picture of the page), blank() (nothing on
 * any page), finish() (ends editing a PowerClip).
 */
export function createProjects(ctx) {
  const { $, toast, post, escHtml } = ctx;
  const META = `${ctx.store}.doc`;
  const NONE = { id: null, name: '', version: null, dirty: false };
  /** The account design the page is (id null: not in the account), and whether it changed since it was saved there. */
  let doc = { ...NONE };
  try { const m = JSON.parse(localStorage.getItem(META) || 'null'); if (m && typeof m === 'object') doc = { id: Number(m.id) > 0 ? Number(m.id) : null, name: String(m.name ?? '').slice(0, 120), version: Number(m.version) || null, dirty: !!m.dirty }; } catch { /* none */ }
  let host = null, afterSignIn = null, changes = 0, reqId = 0, busy = false;
  const waiting = new Map();
  const writeMeta = () => { try { localStorage.setItem(META, JSON.stringify(doc)); } catch { /* storage full */ } showName(); ctx.docChanged?.(); };
  onChange = () => { changes++; if (!doc.dirty) { doc.dirty = true; writeMeta(); } };
  let fullSaid = false;
  onFull = () => { if (fullSaid) return; fullSaid = true; toast('This design is too big to keep on this device: save it to your account (File > Save to my account) so it is not lost', 8000); };
  const keepHere = () => saveNow(ctx.store, ctx.snapshot());
  const hosted = () => !!host?.docs;

  /** The design's name on the status bar: click to save it to the account. */
  function showName() {
    const el = $('docName');
    if (!el) return;
    el.hidden = !hosted() && !doc.id;
    el.textContent = doc.id ? `${doc.name}${doc.dirty ? ' •' : ''}` : doc.name || 'Untitled design';
    el.classList.toggle('dirty', !!doc.id && doc.dirty);
    el.title = doc.id
      ? (doc.dirty ? `“${doc.name}” in your account · changes not saved there yet: click or press Ctrl+S to save` : `“${doc.name}” is saved in your account`)
      : 'Not in your account yet: click or press Ctrl+S to save it there (File > Save to my account)';
  }

  // ---------- requests to the host
  function request(op, args = {}, ms = 60000) {
    if (!hosted()) return Promise.reject(new Error('Open the Artboard from the 3DEEZI website or app to keep designs in your account.'));
    const id = ++reqId;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { waiting.delete(id); reject(new Error('3DEEZI did not answer: check the connection and try again.')); }, ms);
      waiting.set(id, { resolve, reject, t });
      post({ type: 'docs', id, op, ...args });
    });
  }
  function docsReply({ id, ok, data, error, status, signin } = {}) {
    const w = waiting.get(id);
    if (!w) return;
    waiting.delete(id); clearTimeout(w.t);
    if (ok) { w.resolve(data); return; }
    const e = new Error(error || 'That did not work. Please try again.');
    e.status = Number(status) || 0; e.signin = !!signin || e.status === 401;
    w.reject(e);
  }
  /** Account commands need the user signed in: the host shows its sign-in, and `then` runs once they are. */
  function needSignIn(then) {
    afterSignIn = then;
    keepHere(); // the app leaves the Artboard to sign in
    post({ type: 'signin' });
    toast('Sign in to keep your designs in your 3DEEZI account', 5000);
  }
  function hostInfo(info) {
    const was = !!host?.signedIn;
    host = { ...(info ?? {}), docs: !!info?.docs };
    showName();
    if (host.signedIn && !was && afterSignIn) { const then = afterSignIn; afterSignIn = null; setTimeout(then, 60); }
  }
  /** An account request failed: sign in (then `retry`), or say why. */
  function failed(e, retry) {
    if (e.signin && retry) { needSignIn(retry); return; }
    toast(e.message, 6000);
  }

  // ---------- questions (in the page: the apps' web views have no confirm boxes)
  function ask(text, yes = 'OK', no = 'Cancel') {
    const d = $('askDialog');
    $('askText').textContent = text; $('askYes').textContent = yes; $('askNo').textContent = no;
    return new Promise((resolve) => {
      const done = (v) => { d.onclose = null; if (d.open) d.close(); resolve(v); };
      $('askYes').onclick = () => done(true);
      $('askNo').onclick = () => done(false);
      d.onclose = () => resolve(false);
      d.showModal();
      $('askYes').focus();
    });
  }
  /** Replacing the design on the page: asks first when it has changes the account does not have. */
  async function okToReplace(what) {
    if (ctx.blank() || (doc.id && !doc.dirty)) return true;
    return ask(`${what} The design on the page is replaced: ${doc.id ? `changes to “${doc.name}” that are not saved in your account are lost` : 'it is not saved in your account, so it is lost'} (Undo cannot bring it back).`, 'Open it', 'Cancel');
  }

  // ---------- saving
  /** A small JPEG of the page for the lists. */
  async function smallPreview() {
    let png = null;
    try { png = ctx.preview(); } catch { /* no picture: the lists show an empty frame */ }
    if (!png) return null;
    const im = new Image();
    im.src = png;
    try { await im.decode(); } catch { return null; }
    const k = Math.min(1, 240 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  }
  /** A name for a design not named yet: its first text, or "Artboard design". */
  const suggestName = () => (doc.name || ctx.firstText() || 'Artboard design').slice(0, 120);
  /**
   * Saves the design in the account: the design the page is (again), or a new one (`asNew`), or a template. Answers
   * the saved design ({id, name, version, …}).
   */
  async function save({ name = suggestName(), asNew = false, template = false, replace = null } = {}) {
    ctx.finish();
    const at = changes, document = ctx.snapshot(), preview = await smallPreview();
    const again = !template && !asNew && doc.id;
    const body = { name: name.trim().slice(0, 120) || 'Artboard design', document, preview, template };
    if (again) Object.assign(body, { doc: doc.id, version: doc.version ?? undefined });
    if (replace) body.doc = replace;
    let saved;
    try {
      saved = await request('save', body, 180000);
    } catch (e) {
      if (again && e.status === 404) return save({ name: body.name, asNew: true }); // deleted meanwhile: a new one
      if (again && e.status === 409) {
        if (await ask(`“${doc.name}” was changed somewhere else since you opened it (in another tab or in the app). Save your version as a new design?`, 'Save as new', 'Cancel')) return save({ name: `${body.name} (copy)`.slice(0, 120), asNew: true });
        e.quiet = true;
      }
      throw e;
    }
    if (!template) { doc = { id: saved.id, name: saved.name, version: saved.version, dirty: changes !== at }; writeMeta(); }
    return saved;
  }
  async function saveAndSay(opts) {
    if (busy) return;
    busy = true;
    try {
      const s = await save(opts);
      toast(opts?.template ? `Template “${s.name}” saved in your account: File > New from template starts a design from it` : `Saved in your account: “${s.name}”${s.pages > 1 ? ` (${s.pages} pages)` : ''}`);
      return s;
    } catch (e) { if (!e.quiet) failed(e, () => saveAndSay(opts)); }
    finally { busy = false; }
  }

  /** File > Save to my account (Ctrl+S): again into the same design, or asks for a name the first time. */
  function docSave() {
    if (!hosted()) { saveButton(); return; }
    if (!host.signedIn) { needSignIn(docSave); return; }
    if (doc.id) saveAndSay();
    else showSave('save');
  }
  /** The name box: 'save' (the first time), 'saveAs' (a new copy) or 'template'. */
  function showSave(kind) {
    if (!hosted()) { toast('Open the Artboard from the 3DEEZI website or app to keep designs in your account'); return; }
    if (!host.signedIn) { needSignIn(() => showSave(kind)); return; }
    const t = { save: ['Save to my account', 'Your design is kept in your 3DEEZI account with all its pages: open it again with File > Open from my account, on the website or in the app.', 'Save'], saveAs: ['Save as', 'A new copy in your account, with its own name. The design you had open stays as it was saved.', 'Save copy'], template: ['Save as template', 'The design becomes a template in your account: File > New from template starts new designs from it (the template itself stays as it is).', 'Save template'] }[kind];
    $('saveTitle').textContent = t[0]; $('saveLead').textContent = t[1]; $('saveOk').textContent = t[2];
    $('saveName').value = kind === 'saveAs' && doc.id ? `${suggestName()} copy`.slice(0, 120) : suggestName();
    $('saveError').textContent = '';
    $('saveOk').onclick = async () => {
      const name = $('saveName').value.trim();
      if (!name) { $('saveError').textContent = 'Give the design a name'; $('saveName').focus(); return; }
      let replace = null;
      if (kind === 'template') {
        // Saving under the name of one of your templates replaces it (how a template is changed).
        const mine = await request('list', { template: true }).catch(() => []);
        const same = mine.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
        if (same) { if (!(await ask(`A template called “${same.name}” is in your account. Replace it with this design?`, 'Replace', 'Cancel'))) return; replace = same.id; }
      }
      $('saveDialog').close();
      saveAndSay({ name, asNew: kind !== 'save' || !doc.id, template: kind === 'template', replace });
    };
    $('saveDialog').showModal();
    $('saveName').select();
  }
  $('saveName').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); $('saveOk').click(); } };

  /** The top bar's Save: on this device always; in the account too when signed in. */
  function saveButton() {
    ctx.finish();
    keepHere();
    post({ type: 'saved', json: ctx.snapshot() });
    if (hosted() && host.signedIn) { docSave(); return; }
    toast(hosted() ? 'Saved on this device · sign in to keep it in your account too (File > Save to my account)' : 'Artboard saved on this device');
  }

  // ---------- opening
  /** Opens a design from the account in place of the one on the page. */
  async function openFromAccount(id, { from = 'list' } = {}) {
    let d;
    try { d = await request('get', { doc: id }, 120000); } catch (e) {
      if (e.status === 404) { toast(from === 'kit' ? 'The design this artwork came from is no longer in your account' : 'That design is no longer in your account'); return false; }
      failed(e, () => openFromAccount(id, { from }));
      return false;
    }
    if (!(await okToReplace(`Open “${d.name}”${from === 'kit' ? ' (the design of the artwork on your kit)' : ''}?`))) return false;
    try { await ctx.open(d.document, d.name); } catch { toast(`“${d.name}” could not be opened: the design may be damaged`); return false; }
    doc = { id: d.id, name: d.name, version: d.version, dirty: false }; writeMeta();
    toast(from === 'kit' ? `“${d.name}” is open: change it, then Send to 3D Studio to update it on the kit` : `Opened “${d.name}” from your account`, 5000);
    return true;
  }
  /** The Studio's Edit in Artboard: the design an artwork layer came from. */
  function openDoc(arg) {
    const id = Number(arg?.id ?? arg);
    if (!(id > 0)) return;
    if (doc.id === id) { toast(`“${doc.name}” is open: change it, then Send to 3D Studio to update it on the kit`, 5000); return; }
    if (!host?.signedIn) { needSignIn(() => openDoc(id)); return; }
    openFromAccount(id, { from: 'kit' });
  }
  /** A new design from a template (built-in or the user's own): not in the account until saved. */
  async function useTemplate(json, name) {
    if (!(await okToReplace(`Start a new design from the template “${name}”?`))) return false;
    try { await ctx.open(json, name); } catch { toast(`The template “${name}” could not be opened`); return false; }
    doc = { ...NONE, name: String(name).slice(0, 120) }; writeMeta(); // the name it is saved under, unless changed
    toast(`New design from “${name}”: change the text and colours, then File > Save to my account`, 5000);
    return true;
  }

  // ---------- the Open from my account / New from template window
  const builtinPreviews = new Map();
  /** A picture of a built-in template (drawn once, like a saved design's picture). */
  async function builtinPreview(t) {
    if (builtinPreviews.has(t.id)) return builtinPreviews.get(t.id);
    const W = t.page[0] * MM, H = t.page[1] * MM, k = 220 / Math.max(W, H);
    const el = document.createElement('canvas');
    const c = new StaticCanvas(el, { width: W, height: H, backgroundColor: '#ffffff', enableRetinaScaling: false, renderOnAddRemove: false });
    try {
      for (const o of await util.enlivenObjects(JSON.parse(templateJson(t)).objects)) c.add(o);
      const url = c.toDataURL({ format: 'jpeg', quality: 0.85, multiplier: k, enableRetinaScaling: false });
      builtinPreviews.set(t.id, url);
      return url;
    } catch { return ''; } finally { c.dispose(); }
  }
  let tab = 'designs', listed = [];
  function card({ key, name, img, sub, badge, del }) {
    return `<div class="doc-card" data-key="${escHtml(key)}"><button class="doc-open" type="button" title="${escHtml(tab === 'designs' ? `Open “${name}”` : `New design from “${name}”`)}"><span class="doc-thumb">${img ? `<img src="${escHtml(img)}" alt="">` : ''}</span><b>${escHtml(name)}</b><small>${badge ? `<span class="doc-badge">${escHtml(badge)}</span> ` : ''}${escHtml(sub)}</small></button>${del ? `<button class="doc-del" type="button" title="Delete “${escHtml(name)}” from your account" aria-label="Delete">${ctx.icon('trash')}</button>` : ''}</div>`;
  }
  async function renderDocs() {
    const grid = $('docsGrid'), note = $('docsNote');
    document.querySelectorAll('#docsDialog [data-docs-tab]').forEach((b) => b.classList.toggle('on', b.dataset.docsTab === tab));
    $('docsTitle').textContent = tab === 'designs' ? 'Open from my account' : 'New from template';
    $('docsFind').value = '';
    note.innerHTML = ''; grid.innerHTML = '';
    listed = [];
    const builtins = tab === 'templates' ? TEMPLATES.map((t) => ({ key: `b:${t.id}`, name: t.name, sub: t.note, badge: 'Starter', t })) : [];
    let mine = [], why = '';
    if (!hosted()) why = tab === 'designs' ? 'Open the Artboard from the 3DEEZI website or app to keep designs in your account and open them here.' : '';
    else if (!host.signedIn) why = tab === 'designs' ? 'Sign in to keep your designs in your 3DEEZI account and open them here, on the website or in the app.' : 'Sign in to see your own templates here too.';
    if (!why && hosted()) {
      grid.innerHTML = '<p class="docs-wait">Loading…</p>';
      try { mine = await request('list', { template: tab === 'templates' }); } catch (e) { why = e.signin ? 'Sign in again to see your designs.' : e.message; }
      if (!$('docsDialog').open) return;
    }
    listed = [
      ...builtins,
      ...mine.map((d) => ({ key: `a:${d.id}`, name: d.name, img: d.preview, sub: `${d.pages > 1 ? `${d.pages} pages · ` : ''}${when(d.updated_at)}${d.id === doc.id ? ' · open now' : ''}`, del: true, d })),
    ];
    grid.innerHTML = listed.map(card).join('') || `<p class="docs-wait">${tab === 'designs' ? (why ? '' : 'No designs in your account yet: File > Save to my account keeps the one on the page.') : 'No templates yet.'}</p>`;
    if (why) note.innerHTML = `${escHtml(why)}${hosted() && !host.signedIn ? ' <button class="mini" type="button" id="docsSignIn">Sign in</button>' : ''}`;
    else if (tab === 'templates') note.textContent = 'Your own templates: File > Save as template. Saving under the same name replaces one.';
    $('docsSignIn')?.addEventListener('click', () => { $('docsDialog').close(); needSignIn(() => showDocs(tab)); });
    for (const it of listed) {
      const el = grid.querySelector(`[data-key="${CSS.escape(it.key)}"]`);
      if (it.t) builtinPreview(it.t).then((url) => { const img = document.createElement('img'); img.src = url; img.alt = ''; if (url) el?.querySelector('.doc-thumb')?.replaceChildren(img); });
      el?.querySelector('.doc-open')?.addEventListener('click', () => pick(it));
      el?.querySelector('.doc-del')?.addEventListener('click', () => remove(it));
    }
  }
  async function pick(it) {
    $('docsDialog').close();
    if (it.t) { await useTemplate(templateJson(it.t), it.name); return; }
    if (tab === 'templates') {
      try { const d = await request('get', { doc: it.d.id }, 120000); await useTemplate(d.document, d.name); } catch (e) { failed(e, () => pick(it)); }
      return;
    }
    if (it.d.id === doc.id && !doc.dirty) { toast(`“${doc.name}” is already open`); return; }
    await openFromAccount(it.d.id);
  }
  async function remove(it) {
    const d = it.d;
    if (!(await ask(`Delete “${d.name}” from your account? This cannot be undone${d.id === doc.id ? ' (the design stays on the page)' : ''}.`, 'Delete', 'Cancel'))) return;
    try { await request('delete', { doc: d.id }); } catch (e) { if (e.status !== 404) { failed(e); return; } }
    if (d.id === doc.id) { doc = { ...NONE, name: doc.name }; writeMeta(); }
    toast(`“${d.name}” deleted from your account`);
    if ($('docsDialog').open) renderDocs();
  }
  function showDocs(which = 'designs') {
    tab = which;
    $('docsDialog').showModal();
    renderDocs();
  }
  document.querySelectorAll('#docsDialog [data-docs-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.docsTab; renderDocs(); }; });
  $('docsFind').oninput = () => {
    const q = $('docsFind').value.trim().toLowerCase();
    for (const it of listed) { const el = $('docsGrid').querySelector(`[data-key="${CSS.escape(it.key)}"]`); if (el) el.hidden = !!q && !it.name.toLowerCase().includes(q); }
  };
  $('docsFind').onkeydown = (e) => e.stopPropagation();

  // ---------- Send to 3D Studio (5.62–5.68)
  let sendData = null, sendName = '', projects = null;
  /** The choices on the Send window: where the artwork goes, and where on the garment. */
  function syncSend() {
    const to = document.querySelector('input[name="sendTo"]:checked')?.value ?? 'current';
    $('sendProject').disabled = !projects?.length;
    const kit = host.kit ?? {};
    const project = projects?.find((p) => String(p.id) === $('sendProject').value);
    const garment = to === 'garment' ? $('sendGarment').value : to === 'project' ? project?.garment : kit.garment;
    const onKit = to === 'garment' ? [] : (to === 'project' ? project?.artboards : kit.artboards) ?? [];
    const updating = !!doc.id && onKit.map(Number).includes(doc.id);
    // Already on that kit: the artwork there is updated in place (same position and size).
    const places = (host.placements ?? []).filter((p) => partsOf(garment, host.garments).includes(p.part));
    const keep = $('sendPlace').value;
    $('sendPlace').innerHTML = places.map((p) => `<option value="${escHtml(p.id)}">${escHtml(p.label)}</option>`).join('');
    if (places.some((p) => p.id === keep)) $('sendPlace').value = keep;
    $('sendPlaceRow').hidden = updating || !places.length;
    $('sendUpdate').hidden = !updating;
    $('sendOk').textContent = updating ? 'Update on the kit' : 'Send to 3D Studio';
  }
  function send(data, name) {
    sendData = data; sendName = name;
    $('sendImg').src = data;
    const kit = host.kit ?? {}, garments = host.garments ?? [];
    $('sendKitName').textContent = kit.name ? `${kit.name}${kit.garment ? ` · ${garments.find((g) => g.id === kit.garment)?.name ?? kit.garment}` : ''}` : '';
    $('sendGarment').innerHTML = garments.map((g) => `<option value="${escHtml(g.id)}">${escHtml(g.name)}</option>`).join('');
    $('sendGarmentRow').hidden = !garments.length;
    if (kit.garment && garments.some((g) => g.id === kit.garment)) $('sendGarment').value = kit.garment;
    document.querySelector('input[name="sendTo"][value="current"]').checked = true;
    $('sendName').value = suggestName();
    $('sendNameRow').hidden = !host.signedIn;
    $('sendSignIn').hidden = !!host.signedIn;
    $('sendProject').innerHTML = '<option value="">Loading your projects…</option>';
    projects = null;
    syncSend();
    $('sendDialog').showModal();
    request('projects').then((list) => {
      projects = Array.isArray(list) ? list : [];
      $('sendProject').innerHTML = projects.length ? projects.map((p) => `<option value="${escHtml(String(p.id))}">${escHtml(p.name)}</option>`).join('') : '<option value="">No saved projects yet</option>';
    }).catch((e) => {
      projects = [];
      $('sendProject').innerHTML = `<option value="">${escHtml(e.signin ? 'Sign in to see your projects' : 'Your projects could not be loaded')}</option>`;
    }).finally(() => { if ($('sendDialog').open) syncSend(); });
  }
  for (const el of document.querySelectorAll('input[name="sendTo"]')) el.onchange = syncSend;
  // Choosing a garment or a project chooses that option too.
  for (const [id, to] of [['sendGarment', 'garment'], ['sendProject', 'project']]) {
    $(id).onfocus = $(id).onchange = () => { document.querySelector(`input[name="sendTo"][value="${to}"]`).checked = true; syncSend(); };
  }
  $('sendPlace').onkeydown = $('sendGarment').onkeydown = $('sendProject').onkeydown = (e) => e.stopPropagation();
  $('sendName').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); $('sendOk').click(); } };
  $('sendSignIn').querySelector('button').onclick = () => { $('sendDialog').close(); needSignIn(() => ctx.sendAgain()); };
  $('sendOk').onclick = async () => {
    if (busy) return;
    const to = document.querySelector('input[name="sendTo"]:checked')?.value ?? 'current';
    if (to === 'project' && !$('sendProject').value) { toast('Choose one of your projects first'); return; }
    const target = to === 'garment' ? { kind: 'garment', garment: $('sendGarment').value } : to === 'project' ? { kind: 'project', project: projects.find((p) => String(p.id) === $('sendProject').value)?.id } : { kind: 'current' };
    const placement = $('sendPlaceRow').hidden ? null : $('sendPlace').value || null;
    const name = ($('sendName').value.trim() || suggestName()).slice(0, 120);
    busy = true; $('sendOk').disabled = true;
    try {
      keepHere();
      // 5.62: the design is saved first, so the artwork on the kit keeps its editable original.
      let link = null;
      if (host.signedIn) {
        try {
          if (!doc.id || doc.dirty || name !== doc.name) await save({ name });
          link = doc.id;
        } catch (e) {
          if (e.signin) { $('sendDialog').close(); needSignIn(() => ctx.sendAgain()); return; }
          if (e.quiet || !(await ask(`The design could not be saved in your account (${e.message}). Send just the picture? (Edit in Artboard will not be there for it.)`, 'Send the picture', 'Cancel'))) return;
        }
      }
      $('sendDialog').close();
      post({ type: 'artwork', data: sendData, name: link ? doc.name : sendName, artboard: link, target, placement });
      toast(link ? `Sent to the 3D Studio: “${doc.name}” stays in your account (Edit in Artboard opens it again)` : 'Sent to the 3D Studio', 5000);
    } finally { busy = false; $('sendOk').disabled = false; }
  };

  // ---------- File menu, keys
  const actions = {
    docOpen: () => showDocs('designs'),
    templateNew: () => showDocs('templates'),
    docSave,
    docSaveAs: () => showSave('saveAs'),
    templateSave: () => showSave('template'),
  };
  // Ctrl+S saves to the account (Ctrl+Shift+S: Save as), Ctrl+O opens from it; never the browser's own.
  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k !== 's' && !(k === 'o' && !e.shiftKey)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (document.querySelector('dialog[open]')) return;
    if (k === 'o') actions.docOpen(); else if (e.shiftKey) actions.docSaveAs(); else docSave();
  }, true);
  $('docName')?.addEventListener('click', docSave);

  return {
    actions,
    /** The host keeps designs in its account: Send to 3D Studio asks where the artwork goes. */
    hosted,
    send,
    saveButton,
    /** Host messages (window.artboard.<name>). */
    bridge: { host: hostInfo, docsReply, openDoc },
    /** File > New document: a new design, not in the account. */
    cleared: () => { doc = { ...NONE }; writeMeta(); },
    /** The design kept on this device is open (or a new page when there was none). */
    started: (restored) => { if (!restored && doc.id) doc = { ...NONE }; writeMeta(); },
    /** For 3DEEZI ASSIST: which design is open. */
    describe: () => (doc.id ? `Design “${doc.name}” is open (saved in the account${doc.dirty ? ', with changes not saved there yet' : ''}). ` : ''),
    get doc() { return { ...doc }; },
    /** Document tabs (task 9.141): the open tab's account details out, another tab's in (null: a new design). */
    /** Document tabs (task 9.143): the design's new name; one in the account is saved again under it. */
    rename: async (name) => {
      doc = { ...doc, name: String(name).trim().slice(0, 120) }; writeMeta();
      if (doc.id && hosted() && host.signedIn) await saveAndSay({ name: doc.name });
    },
    /** The in-page question box (the apps' web views answer no confirm() boxes). */
    ask,
    swapDoc: (next) => { const was = { ...doc }; doc = next ? { ...NONE, ...next } : { ...NONE }; writeMeta(); return was; },
  };
}
