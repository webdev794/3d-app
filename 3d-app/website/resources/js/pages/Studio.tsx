import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Box, Check, Package, Download, Expand, Grid2X2, Handshake, Hash, ImagePlus, LoaderCircle, MoreVertical, Palette, Plus, Redo2, RotateCcw, Save, SendHorizontal, Shirt, SlidersHorizontal, Sparkles, Type, Undo2, Upload, WandSparkles, X } from 'lucide-react';
import { api, fetchFile, media, saveBlob, type Catalog, type Project, type User } from '../api';
import { OrderKitDialog } from './Orders';
import { type Design, type View } from '../types';
import KitViewer, { type KitViewerHandle } from '../components/KitViewer';
import ColorWheel from '../components/ColorWheel';
import { comingSoon, garmentArt } from './Create';
import type { Draft } from '../App';

type Tool = 'ai' | 'garment' | 'colours' | 'patterns' | 'logos' | 'text' | 'numbers';
type Asset = { id: number; name: string; type: string };
type Message = { from: 'you' | '3deezi'; text: string };
const tools = [{ id: 'ai', label: 'AI', icon: Sparkles }, { id: 'garment', label: 'Garment', icon: Shirt }, { id: 'colours', label: 'Colours', icon: Palette }, { id: 'patterns', label: 'Patterns', icon: Grid2X2 }, { id: 'logos', label: 'Logos', icon: ImagePlus }, { id: 'text', label: 'Text', icon: Type }, { id: 'numbers', label: 'Numbers', icon: Hash }] as const;
const colourSlots = [{ key: 'main', label: 'Primary' }, { key: 'secondary', label: 'Secondary' }, { key: 'accent', label: 'Accent' }, { key: 'patternColor', label: 'Pattern' }] as const;
const palettes = [['#0b1016', '#00c2cc', '#36e3ee'], ['#08233e', '#efb84a', '#ffffff'], ['#f2f4f6', '#0076cd', '#0b1830'], ['#261133', '#ad47da', '#fb92d3'], ['#0c2824', '#31c29a', '#ffffff'], ['#240c12', '#ec3e5b', '#f9e6d4']];
const suggestions = ['Make it red and gold', 'Add bold chevrons', 'Darker body, brighter trims', 'Number 7 for SMITH', 'Give it a tribal shoulder print'];

export default function Studio({ draft, onChange, catalog, requireAuth, onNotice, user }: { draft: Draft; onChange: (draft: Draft) => void; catalog: Catalog | null; requireAuth: (action?: () => void) => void; onNotice: (text: string) => void; user: User | null }) {
  const [tool, setTool] = useState<Tool | null>('colours');
  const [slot, setSlot] = useState<(typeof colourSlots)[number]['key']>('main');
  const [view, setView] = useState<View>('front');
  const [rotating, setRotating] = useState(false);
  const [ready, setReady] = useState(false);
  const [past, setPast] = useState<Design[]>([]);
  const [future, setFuture] = useState<Design[]>([]);
  const [modal, setModal] = useState<'save' | 'export' | 'showcase' | null>(null);
  const [menu, setMenu] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [scene, setScene] = useState(catalog?.showcase_scenes?.[0] || 'Stadium tunnel');
  const [showcaseBack, setShowcaseBack] = useState(false);
  const [showcases, setShowcases] = useState<string[]>([]);
  const [selectedShowcase, setSelectedShowcase] = useState(0);
  const [patternBusy, setPatternBusy] = useState(false);
  const [motif, setMotif] = useState('');
  const [ask, setAsk] = useState('');
  const [askImage, setAskImage] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [chat, setChat] = useState<Message[]>([]);
  const latest = useRef(draft);
  latest.current = draft;
  const liveBase = useRef<Design | null>(null);
  const aiEnabled = !!catalog?.provider.is_ai;
  const navigate = useNavigate();

  // A design from AI concepts, Convert or an AI edit arrives with a motif: generate its print.
  useEffect(() => {
    if (!draft.patternMotif || !aiEnabled || draft.design.patternImage || patternBusy) return;
    setPatternBusy(true);
    api<{ patternImage: string }>('/ai/pattern', { method: 'POST', body: JSON.stringify({ motif: draft.patternMotif }) })
      .then(({ patternImage }) => { const current = latest.current; onChange({ ...current, patternMotif: undefined, design: { ...current.design, patternImage } }); onNotice('AI print pattern applied to your kit.'); })
      .catch(e => { onChange({ ...latest.current, patternMotif: undefined }); onNotice(`Pattern not generated: ${(e as Error).message}`); })
      .finally(() => setPatternBusy(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.patternMotif, aiEnabled]);
  const [name, setName] = useState(draft.name === 'Untitled kit' ? '' : draft.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(!draft.id);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [assetBusy, setAssetBusy] = useState(false);
  const viewer = useRef<KitViewerHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const sponsorUpload = useRef<HTMLInputElement>(null);
  const askUpload = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { if (modal) dialog.current?.showModal(); }, [modal]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'nearest' }); }, [chat, asking]);
  useEffect(() => { const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload); }, [dirty]);

  /** One undoable change. */
  function edit(patch: Partial<Design>, extra: Partial<Draft> = {}) {
    const current = latest.current;
    setPast(history => [...history.slice(-39), liveBase.current ?? { ...current.design }]); liveBase.current = null; setFuture([]);
    const design = { ...current.design, ...patch };
    onChange({ ...current, ...extra, design, garment: design.garment }); setDirty(true);
  }
  /** Live updates while dragging the colour wheel; `commit` makes them one undo step. */
  function preview(patch: Partial<Design>) { const current = latest.current; liveBase.current ??= { ...current.design }; onChange({ ...current, design: { ...current.design, ...patch } }); setDirty(true); }
  function commit() { if (!liveBase.current) return; const base = liveBase.current; liveBase.current = null; setPast(history => [...history.slice(-39), base]); setFuture([]); }
  function undo() { const previous = past.at(-1); if (!previous) return; setFuture(items => [draft.design, ...items]); setPast(items => items.slice(0, -1)); onChange({ ...draft, design: previous, garment: previous.garment }); setDirty(true); }
  function redo() { const next = future[0]; if (!next) return; setPast(items => [...items, draft.design]); setFuture(items => items.slice(1)); onChange({ ...draft, design: next, garment: next.garment }); setDirty(true); }
  useEffect(() => { const key = (e: KeyboardEvent) => { if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).matches('input,textarea')) return; if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });

  async function captureThumbnail() {
    if (!ready || !viewer.current) return undefined;
    const source = await viewer.current.capture('front');
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = source; });
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 800 / image.width, 800 / image.height);
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const thumbnail = await captureThumbnail(); const project = await api<Project>(draft.id ? `/projects/${draft.id}` : '/projects', { method: draft.id ? 'PATCH' : 'POST', body: JSON.stringify({ name: name.trim(), sport: draft.sport, garment: draft.garment, mode: draft.mode, design: draft.design, status: 'draft', ...(thumbnail ? { thumbnail } : {}), ...(draft.id ? { expected_version: draft.version } : {}) }) }); onChange({ ...project }); setDirty(false); setModal(null); onNotice(`${project.name} saved · Version ${project.version}`); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function loadAssets() { setAssetBusy(true); setError(''); try { setAssets((await api<Asset[]>('/assets')).filter(a => a.type === 'logo')); } catch (e) { setError((e as Error).message); } finally { setAssetBusy(false); } }
  function blobData(blob: Blob) { return new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Unable to read this image.')); r.readAsDataURL(blob); }); }
  async function applyLogo(asset: Asset) { setAssetBusy(true); setError(''); try { edit({ logoImage: await blobData(await fetchFile(`/assets/${asset.id}/file`)) }); onNotice(`${asset.name} added to your kit.`); } catch (e) { setError((e as Error).message); } finally { setAssetBusy(false); } }
  async function uploadLogo(file: File, sponsor = false) {
    setAssetBusy(true); setError('');
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Use a logo smaller than 2 MB for the 3D designer.');
      const form = new FormData(); form.append('file', file); form.append('name', (sponsor ? `Sponsor · ${file.name}` : file.name).slice(0, 120)); form.append('type', 'logo');
      await api('/assets', { method: 'POST', body: form });
      edit(sponsor ? { sponsorImage: await blobData(file) } : { logoImage: await blobData(file) }); setAssets(null);
      onNotice(sponsor ? 'Sponsor logo added to the front of your kit.' : 'Logo added to your kit and saved in Assets.');
    } catch (e) { setError((e as Error).message); } finally { setAssetBusy(false); }
  }
  async function aiPattern() {
    if (motif.trim().length < 3) return;
    edit({ patternImage: null }, { patternMotif: motif.trim() }); setMotif('');
  }
  /** "Ask 3DEEZI to change anything." */
  async function askAi(text = ask) {
    const instruction = text.trim();
    if (!instruction || asking) return;
    if (!aiEnabled) { onNotice('AI is not connected on this server.'); return; }
    setAsking(true); setAsk(''); setChat(c => [...c, { from: 'you', text: instruction }]);
    const image = askImage; setAskImage(null);
    try {
      const r = await api<{ design: Partial<Design>; reply: string; motif: string | null }>('/ai/edit', { method: 'POST', body: JSON.stringify({ instruction, design: latest.current.design, image }) });
      edit(r.motif ? { ...r.design, patternImage: null } : r.design, r.motif ? { patternMotif: r.motif } : {});
      setChat(c => [...c, { from: '3deezi', text: r.reply + (r.motif ? ' Creating the new print now…' : '') }]);
      if (tool !== 'ai') onNotice(r.reply);
    } catch (e) { setChat(c => [...c, { from: '3deezi', text: `Sorry, that didn’t work: ${(e as Error).message}` }]); }
    finally { setAsking(false); }
  }
  async function generateShowcase() {
    if (!viewer.current) { setError('The 3D viewer is still starting. Please try again.'); return; }
    setBusy(true); setError('');
    try {
      const image = await viewer.current.capture(showcaseBack ? 'back' : 'front');
      const result = await api<{ image: string }>('/ai/showcase', { method: 'POST', body: JSON.stringify({ image, scene, back: showcaseBack, sport: catalog?.sports.find(s => s.id === draft.sport)?.name || draft.sport, garment: catalog?.garments.find(g => g.id === draft.garment)?.name || draft.garment, logoText: showcaseBack ? (draft.design.backName || draft.design.logoText) : draft.design.logoText, number: draft.design.number, name: draft.name }) });
      setShowcases(items => [...items, result.image]); setSelectedShowcase(showcases.length);
      onNotice('Showcase ready · also saved in your Assets.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function exportDesign(format: 'png' | 'front-back' | 'json') {
    setBusy(true); setError(''); const filename = (draft.name || '3deezi-kit').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    try {
      if (format === 'json') saveBlob(new Blob([JSON.stringify({ schema: '3deezi.design.v1', name: draft.name, sport: draft.sport, garment: draft.garment, mode: draft.mode, version: draft.version || 1, design: draft.design }, null, 2)], { type: 'application/json' }), `${filename}.json`);
      else {
        if (!viewer.current) throw new Error('The 3D viewer is still starting. Please try again.');
        const front = await viewer.current.capture(format === 'png' ? view : 'front');
        if (format === 'png') saveBlob(await (await fetch(front)).blob(), `${filename}-${view}.png`);
        else { const back = await viewer.current.capture('back'); const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); const images = await Promise.all([load(front), load(back)]); const canvas = document.createElement('canvas'); canvas.width = images[0].width * 2; canvas.height = images[0].height; const context = canvas.getContext('2d'); if (!context) throw new Error('Image export is unavailable in this browser.'); images.forEach((img, i) => context.drawImage(img, i * images[0].width, 0)); const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not create the image.')), 'image/png')); saveBlob(blob, `${filename}-front-back.png`); }
      }
      onNotice('Your design export is ready.');
    } catch (e) { setError((e as Error).message || 'Export failed. Please try again.'); } finally { setBusy(false); }
  }
  const garments = [...(catalog?.garments ?? [])].sort((a, b) => ['fullkit', 'jersey', 'shorts', 'tee', 'singlet', 'polo'].indexOf(a.id) - ['fullkit', 'jersey', 'shorts', 'tee', 'singlet', 'polo'].indexOf(b.id));
  const pick = (t: Tool) => { setTool(current => current === t ? null : t); setError(''); };
  const colourValue = slot === 'patternColor' ? (draft.design.patternColor || draft.design.secondary) : draft.design[slot];

  return <div className="dyo">
    <header className="dyo-top">
      <Link to="/" className="dyo-brand" aria-label="3DEEZI home"><img src={media('images/brand.png')} alt="3DEEZI" /><span>AI SPORTSWEAR DESIGNER</span></Link>
      <span className="dyo-title">DYO STUDIO</span>
      <label className="dyo-name"><span>Project name</span><input value={draft.name} maxLength={120} onChange={e => { onChange({ ...draft, name: e.target.value }); setDirty(true); }} aria-label="Project name" /></label>
      <div className="dyo-actions">
        <button className="round-button" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={18} /></button>
        <button className="round-button" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 size={18} /></button>
        <button className="button button-outline" onClick={() => requireAuth(() => { setError(''); setName(draft.name === 'Untitled kit' ? '' : draft.name); setModal('save'); })}><Save size={16} /> Save{dirty && <i className="dirty-dot" aria-label="Unsaved changes" />}</button>
        <button className="button button-gradient" onClick={() => { setError(''); setModal('export'); }}><Download size={16} /> Export</button>
        <div className="dyo-menu"><button className="round-button" onClick={() => setMenu(m => !m)} aria-label="More" aria-expanded={menu}><MoreVertical size={18} /></button>
          {menu && <div className="menu-pop" onClick={() => setMenu(false)}>{aiEnabled && <button onClick={() => requireAuth(() => { setError(''); setModal('showcase'); })}><WandSparkles size={15} /> Photoreal showcase</button>}<button onClick={() => requireAuth(() => { if (!draft.id || dirty) { onNotice('Save your project first, then order it.'); setName(draft.name === 'Untitled kit' ? '' : draft.name); setModal('save'); } else setOrdering(true); })}><Package size={15} /> Order this kit</button><button onClick={() => navigate('/orders')}><Box size={15} /> My orders</button><button onClick={() => navigate('/create/ai')}><Sparkles size={15} /> New AI design</button><button onClick={() => navigate('/create/sport')}><Shirt size={15} /> Change sport</button><button onClick={() => navigate('/projects')}><Box size={15} /> My projects</button></div>}
        </div>
      </div>
    </header>

    <div className={`dyo-body ${tool ? 'panel-open' : ''}`}>
      <nav className="dyo-rail" aria-label="Design tools">{tools.map(t => <button key={t.id} className={tool === t.id ? 'active' : ''} onClick={() => pick(t.id)} aria-pressed={tool === t.id}><t.icon size={22} /><span>{t.label}</span></button>)}</nav>

      {tool && <section className="dyo-panel" aria-label={tools.find(t => t.id === tool)?.label}>
        <div className="panel-head"><h2>{tools.find(t => t.id === tool)?.label}</h2><button className="icon-button" onClick={() => setTool(null)} aria-label="Close panel"><X size={18} /></button></div>
        <div className="panel-body">
          {tool === 'colours' && <>
            <div className="slot-tabs" role="tablist">{colourSlots.map(s => <button key={s.key} role="tab" aria-selected={slot === s.key} className={slot === s.key ? 'active' : ''} onClick={() => setSlot(s.key)}>{s.label}</button>)}</div>
            <ColorWheel value={colourValue} onChange={hex => preview({ [slot]: hex })} onCommit={commit} />
            <h4>READY-MADE PALETTES</h4><div className="preset-palettes">{palettes.map((palette, index) => <button key={index} aria-label={`Apply palette ${index + 1}`} onClick={() => edit({ main: palette[0], secondary: palette[1], accent: palette[2], patternColor: palette[1] })}>{palette.map((c, i) => <span key={i} style={{ background: c }} />)}</button>)}</div>
          </>}
          {tool === 'patterns' && <>
            <div className="pattern-grid">{['Chevron', 'Stripes', 'Velocity', 'Solid'].map(pattern => <button className={draft.design.pattern === pattern && !draft.design.patternImage ? 'selected' : ''} key={pattern} onClick={() => edit({ pattern, patternImage: null })}><span className={`pattern-preview pattern-${pattern.toLowerCase()}`} style={{ '--pattern-color': draft.design.secondary } as React.CSSProperties} /><span>{pattern}{draft.design.pattern === pattern && !draft.design.patternImage && <Check size={14} />}</span></button>)}</div>
            {aiEnabled && <div className="ai-pattern"><h4>AI PRINT FROM WORDS</h4><div className="inline-field"><input value={motif} onChange={e => setMotif(e.target.value)} onKeyDown={e => e.key === 'Enter' && aiPattern()} placeholder="e.g. Maori-inspired koru waves" maxLength={200} /><button className="button button-gradient" disabled={patternBusy || motif.trim().length < 3} onClick={aiPattern}>{patternBusy ? <LoaderCircle className="spin" size={16} /> : <WandSparkles size={16} />}</button></div>{draft.design.patternImage && <button className="button button-secondary full-width" onClick={() => edit({ patternImage: null })}><X size={14} /> Remove AI print</button>}</div>}
            <label className="field">Pattern coverage<input type="range" min="0" max="1" step="0.05" value={draft.design.patternBody ?? 0.1} onChange={e => preview({ patternBody: Number(e.target.value) })} onPointerUp={commit} /><span className="field-hint">Shoulders → Full body</span></label>
          </>}
          {tool === 'logos' && <>
            <button className="logo-upload" disabled={assetBusy} onClick={() => requireAuth(() => upload.current?.click())}>{assetBusy ? <LoaderCircle className="spin" /> : <Upload />}<strong>Upload your team logo</strong><span>Chest crest · PNG, JPG or WEBP · up to 2 MB</span></button>
            {draft.design.logoImage && <div className="applied-logo"><img src={draft.design.logoImage} alt="Applied team logo" /><span>Logo applied</span><button className="icon-button" aria-label="Remove logo from kit" onClick={() => edit({ logoImage: null })}><X size={16} /></button></div>}
            <button className="button button-secondary full-width" disabled={assetBusy} onClick={() => requireAuth(loadAssets)}>Choose from your Assets <ArrowRight size={16} /></button>
            {assets && <div className="logo-library">{assets.length ? assets.map(asset => <button key={asset.id} disabled={assetBusy} onClick={() => applyLogo(asset)}><ImagePlus size={16} />{asset.name}<Plus size={14} /></button>) : <p className="muted">No saved logos yet. Upload your first logo above.</p>}</div>}
            <h4>SPONSOR · FRONT, BELOW THE WORDMARK</h4>
            <button className="logo-upload" disabled={assetBusy} onClick={() => requireAuth(() => sponsorUpload.current?.click())}>{assetBusy ? <LoaderCircle className="spin" /> : <Handshake />}<strong>Upload a sponsor logo</strong><span>PNG with transparency works best</span></button>
            {draft.design.sponsorImage && <div className="applied-logo"><img src={draft.design.sponsorImage} alt="Applied sponsor logo" /><span>Sponsor applied</span><button className="icon-button" aria-label="Remove sponsor from kit" onClick={() => edit({ sponsorImage: null })}><X size={16} /></button></div>}
          </>}
          {tool === 'text' && <>
            <label className="field">Team wordmark<input value={draft.design.logoText} maxLength={20} onChange={e => edit({ logoText: e.target.value })} placeholder="YOUR TEAM" /></label>
            <div className="studio-tip"><Type size={18} /><p>Short team names create a stronger, more readable wordmark.</p></div>
          </>}
          {tool === 'numbers' && <>
            <div className="number-preview" style={{ color: draft.design.accent, background: draft.design.main }}><small>{draft.design.backName || 'YOUR NAME'}</small><strong>{draft.design.number || '23'}</strong></div>
            <label className="field">Player number<input inputMode="numeric" value={draft.design.number} maxLength={3} onChange={e => edit({ number: e.target.value.replace(/\D/g, '') })} placeholder="23" /></label>
            <label className="field">Player name<input value={draft.design.backName || ''} maxLength={20} onChange={e => edit({ backName: e.target.value })} placeholder="YOUR NAME" /></label>
            <button className="button button-secondary full-width" onClick={() => { setView('back'); setRotating(false); }}>View the back <ArrowRight size={16} /></button>
          </>}
          {tool === 'garment' && <div className="panel-garments">{garments.map(g => <button key={g.id} className={draft.design.garment === g.id ? 'selected' : ''} onClick={() => edit({ garment: g.id as Design['garment'] })}><img src={garmentArt(g.id)} alt="" /><span>{g.name}</span>{draft.design.garment === g.id && <Check size={15} />}</button>)}</div>}
          {tool === 'ai' && <div className="ai-chat">
            {!aiEnabled && <p className="muted">AI is not connected on this server.</p>}
            {chat.length === 0 && <div className="ai-hello"><Sparkles size={20} /><p>Tell me what to change, like you would in ChatGPT. Colours, patterns, names, numbers. Attach an image to match its style.</p></div>}
            {chat.map((m, i) => <p key={i} className={`bubble ${m.from === 'you' ? 'mine' : ''}`}>{m.text}</p>)}
            {asking && <p className="bubble typing"><LoaderCircle className="spin" size={14} /> Designing…</p>}
            <div ref={chatEnd} />
            <div className="prompt-chips">{suggestions.map(s => <button key={s} type="button" disabled={asking || !aiEnabled} onClick={() => askAi(s)}>{s}</button>)}</div>
            {aiEnabled && <button className="button button-secondary full-width" onClick={() => requireAuth(() => { setError(''); setModal('showcase'); })}><WandSparkles size={16} /> Photoreal showcase</button>}
          </div>}
          {error && !modal && <p className="error-message" role="alert">{error}</p>}
        </div>
      </section>}

      <div className="dyo-stage" ref={stage}>
        <KitViewer ref={viewer} design={draft.design} view={view} rotating={rotating} onReady={() => setReady(true)} className="studio-viewer" />
        <div className="stage-chips">{patternBusy && <span><LoaderCircle className="spin" size={13} /> Creating AI print…</span>}<span>{catalog?.sports.find(s => s.id === draft.sport)?.name || draft.sport} · {catalog?.garments.find(g => g.id === draft.garment)?.name || draft.garment}</span></div>
        <div className="view-controls">{(['front', 'back', 'side'] as View[]).map(v => <button key={v} className={view === v && !rotating ? 'active' : ''} onClick={() => { setView(v); setRotating(false); }}>{v}</button>)}<button className={rotating ? 'active' : ''} onClick={() => setRotating(r => !r)} aria-pressed={rotating}><RotateCcw size={14} /> 360°</button><button className="fullscreen" aria-label="Fullscreen preview" onClick={() => { stage.current?.requestFullscreen?.().catch(() => onNotice('Fullscreen is unavailable in this browser.')); }}><Expand size={16} /></button></div>
      </div>

      <aside className="dyo-garments" aria-label="Garments">{garments.map(g => <button key={g.id} className={draft.design.garment === g.id ? 'selected' : ''} onClick={() => edit({ garment: g.id as Design['garment'] })} aria-pressed={draft.design.garment === g.id}><img src={garmentArt(g.id)} alt="" /><span>{g.name}</span></button>)}{comingSoon.map(g => <button key={g.id} className="soon" disabled title="Coming soon"><img src={garmentArt(g.id)} alt="" /><span>{g.name}</span><small>SOON</small></button>)}</aside>
    </div>

    <form className="dyo-prompt" onSubmit={e => { e.preventDefault(); requireAuth(() => askAi()); }}>
      <button type="button" className="round-button" aria-label="Attach a reference image" title="Attach a reference image" onClick={() => askUpload.current?.click()}><ImagePlus size={18} /></button>
      <button type="button" className="round-button" aria-label="Add your logo" title="Add your logo" onClick={() => requireAuth(() => upload.current?.click())}><Plus size={18} /></button>
      {askImage && <span className="ask-image"><img src={askImage} alt="Reference" /><button type="button" onClick={() => setAskImage(null)} aria-label="Remove image"><X size={12} /></button></span>}
      <input value={ask} onChange={e => setAsk(e.target.value)} placeholder={aiEnabled ? 'Ask 3DEEZI to change anything…' : 'AI is not connected on this server'} disabled={!aiEnabled || asking} maxLength={600} aria-label="Ask 3DEEZI to change anything" />
      <button className="send-button" disabled={!aiEnabled || asking || !ask.trim()} aria-label="Send">{asking ? <LoaderCircle className="spin" size={18} /> : <SendHorizontal size={18} />}</button>
      <button type="button" className="round-button" aria-label="Open the AI panel" title="AI panel" onClick={() => setTool('ai')}><SlidersHorizontal size={18} /></button>
    </form>
    <input type="file" hidden ref={upload} accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadLogo(file); e.target.value = ''; }} />
    <input type="file" hidden ref={sponsorUpload} accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadLogo(file, true); e.target.value = ''; }} />
    <input type="file" hidden ref={askUpload} accept="image/png,image/jpeg,image/webp" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (file.size > 5 * 1024 * 1024) { onNotice('Use a reference image smaller than 5 MB.'); return; } setAskImage(await blobData(file)); }} />

    {ordering && user && draft.id && <OrderKitDialog projectId={draft.id} projectName={draft.name} user={user} onClose={() => setOrdering(false)} onOrdered={order => { setOrdering(false); onNotice(`Order ${order.number} sent · we’ll confirm the price.`); }} />}
    {modal && <dialog ref={dialog} className="modal compact-modal" onCancel={() => !busy && setModal(null)}><button className="icon-button modal-close" disabled={busy} onClick={() => setModal(null)} aria-label="Close dialog"><X /></button><span className="eyebrow">{modal === 'save' ? 'KEEP THE GOOD IDEAS' : modal === 'showcase' ? 'PHOTOREAL SHOWCASE' : 'READY TO SHARE'}</span><h2>{modal === 'save' ? 'Save your project.' : modal === 'showcase' ? 'Your design, for real.' : 'Take your design with you.'}</h2>{modal === 'showcase' ? <div className="showcase-panel"><p className="muted">The live 3D kit is captured and turned into a photoreal marketing image. The design itself stays exactly as you made it.</p><div className="showcase-frame">{showcases.length ? <img src={showcases[selectedShowcase]} alt="Photoreal showcase of your design" /> : <span>{busy ? 'Creating your showcase… about a minute' : 'Choose a scene and generate.'}</span>}{busy && <LoaderCircle className="spin showcase-spinner" size={28} />}</div>{showcases.length > 1 && <div className="showcase-strip">{showcases.map((src, i) => <button key={i} className={i === selectedShowcase ? 'selected' : ''} onClick={() => setSelectedShowcase(i)}><img src={src} alt={`Showcase ${i + 1}`} /></button>)}</div>}<div className="prompt-chips">{(catalog?.showcase_scenes || []).map(s => <button type="button" key={s} className={scene === s ? 'selected' : ''} disabled={busy} onClick={() => setScene(s)}>{s}</button>)}</div><div className="prompt-chips">{([['Front', false], ['Back', true]] as const).map(([label, back]) => <button type="button" key={label} className={showcaseBack === back ? 'selected' : ''} disabled={busy} onClick={() => setShowcaseBack(back)}>{label}</button>)}</div>{error && <p className="error-message" role="alert">{error}</p>}<div className="showcase-actions"><button className="button button-gradient" disabled={busy || !ready} onClick={generateShowcase}>{busy ? <LoaderCircle className="spin" size={17} /> : <WandSparkles size={17} />}{busy ? 'GENERATING…' : 'GENERATE SHOWCASE'}</button>{showcases.length > 0 && <button className="button button-secondary" disabled={busy} onClick={async () => saveBlob(await (await fetch(showcases[selectedShowcase])).blob(), `${(draft.name || '3deezi-kit').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}-showcase-${selectedShowcase + 1}.jpg`)}><Download size={16} /> Download</button>}</div><p className="field-hint">Every showcase is also saved in your Assets.</p></div> : modal === 'save' ? <form onSubmit={save}><p className="muted">{draft.id ? `Save a new version of your kit. Version ${draft.version || 1} will stay in your history.` : 'Your kit will be saved to your personal Projects library.'}</p><label className="field">Project name<input autoFocus value={name} onChange={e => setName(e.target.value)} required maxLength={120} placeholder="e.g. Coastal Warriors — Home kit" /></label><div className="save-summary"><span>{catalog?.sports.find(s => s.id === draft.sport)?.name}</span><span>{catalog?.garments.find(g => g.id === draft.garment)?.name}</span><span>VERSION {(draft.version || 0) + 1}</span></div>{error && <p className="error-message" role="alert">{error}</p>}<button className="button button-gradient full-width" disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}SAVE PROJECT<ArrowRight size={17} /></button></form> : <><p className="muted">Download a real 3D scene capture or the editable design specification.</p><div className="export-options"><button disabled={busy || !ready} onClick={() => exportDesign('png')}><Box /><span><strong>3D mockup</strong><small>Current view · PNG image</small></span><Download size={18} /></button><button disabled={busy || !ready} onClick={() => exportDesign('front-back')}><Shirt /><span><strong>Front & back</strong><small>Two views · One PNG image</small></span><Download size={18} /></button><button disabled={busy} onClick={() => exportDesign('json')}><Grid2X2 /><span><strong>Design specification</strong><small>Colours, pattern, and player details · JSON</small></span><Download size={18} /></button></div>{busy && <p className="export-progress"><LoaderCircle className="spin" size={17} /> Preparing your download…</p>}{error && <p className="error-message" role="alert">{error}</p>}<p className="field-hint">Mockups are for design review. These exports do not include manufacturing patterns or a production tech pack.</p></>}</dialog>}
  </div>;
}
