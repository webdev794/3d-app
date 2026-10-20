import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Download, ImageUp, LoaderCircle, Plus, Sparkles, WandSparkles, X } from 'lucide-react';
import { api, media, saveBlob, type Catalog, type Concept } from '../api';
import type { Draft } from '../App';
import type { Design } from '../types';
import { DesignThumbnail } from './Library';
import Loader from '../components/Loader';
import { EditImageButton } from '../components/ImageEditor';

export const kitArt = (sport: string) => media(`showroom/kit-${sport}.webp`);
export const garmentArt = (garment: string) => media(`showroom/garment-${garment}.webp`);
/** Shown in the garment step and the studio; not yet available in 3D. */
export const comingSoon = [{ id: 'socks', name: 'Socks', description: 'Match socks with team bands.' }, { id: 'shoes', name: 'Shoes', description: 'Boots in your colours.' }];
const garmentOrder = ['fullkit', 'jersey', 'shorts', 'tee', 'singlet', 'polo'];

export function FlowSteps({ step, ai = false }: { step: number; ai?: boolean }) {
  return <div className="flow-steps" aria-label="Design progress">{[ai ? 'Your brief' : 'Your sport', ai ? 'Your concept' : 'Your garment', 'Your design'].map((label, index) => <div className={step === index ? 'current' : step > index ? 'complete' : ''} key={label}><span>{step > index ? <Check size={12} /> : `0${index + 1}`}</span>{label}{index < 2 && <ChevronRight size={14} />}</div>)}</div>;
}

/** Step 1: the sports rotate on a stadium stage; the centre one is chosen. */
export function SportSelection({ catalog, selected, onSelect, onNext }: { catalog: Catalog | null; selected: string; onSelect: (id: string) => void; onNext: () => void }) {
  const sports = catalog?.sports ?? [];
  const [active, setActive] = useState(0);
  const dragStart = useRef<number | null>(null);
  const wheelLock = useRef(0);
  useEffect(() => { const i = sports.findIndex(s => s.id === selected); if (i >= 0) setActive(i); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);
  const rotate = useCallback((step: number) => { if (!sports.length) return; setActive(a => { const next = (a + step + sports.length) % sports.length; onSelect(sports[next].id); return next; }); }, [sports, onSelect]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') rotate(-1); if (e.key === 'ArrowRight') rotate(1); if (e.key === 'Enter' && sports.length) onNext(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [rotate, onNext, sports.length]);
  const offset = (i: number) => { const n = sports.length; let o = i - active; if (o > n / 2) o -= n; if (o < -n / 2) o += n; return o; };
  const sport = sports[active];

  return <section className="showroom" onPointerDown={e => { dragStart.current = e.clientX; }} onPointerUp={e => { if (dragStart.current !== null && Math.abs(e.clientX - dragStart.current) > 50) rotate(e.clientX < dragStart.current ? 1 : -1); dragStart.current = null; }} onWheel={e => { const now = Date.now(); if (Math.abs(e.deltaX) > 20 && now - wheelLock.current > 350) { wheelLock.current = now; rotate(e.deltaX > 0 ? 1 : -1); } }}>
    <div className="showroom-bg" style={{ backgroundImage: `url(${media('showroom/stadium-stage.webp')})` }} />
    <div className="showroom-head">
      <Link className="back-link" to="/"><ArrowLeft size={16} /> Back to create</Link>
      <span className="eyebrow">DESIGN YOUR OWN</span>
      <h1>Different sports.<br /><span>Same team spirit.</span></h1>
      <p>Choose your sport and start designing. Rotate to explore.</p>
    </div>
    {!catalog ? <div className="empty-state"><LoaderCircle className="spin" /> Loading sports…</div> : <>
      <div className="carousel" aria-roledescription="carousel" aria-label="Sports">
        {sports.map((s, i) => { const o = offset(i), a = Math.abs(o); return <button key={s.id} className={`carousel-item ${o === 0 ? 'is-active' : ''}`} style={{ '--o': o, '--a': a, zIndex: 20 - a, opacity: a > 4 ? 0 : 1 } as React.CSSProperties} onClick={() => o === 0 ? onNext() : rotate(o)} aria-label={o === 0 ? `Design ${s.name}` : `Rotate to ${s.name}`} aria-current={o === 0} tabIndex={a > 4 ? -1 : 0}>
          <img src={kitArt(s.id)} alt={`${s.name} kit`} draggable={false} />
          <span className="carousel-label"><strong>{s.name}</strong><small>{s.description}</small></span>
        </button>; })}
        <span className="stage-ring" aria-hidden="true" />
        <button className="carousel-arrow prev" onClick={() => rotate(-1)} aria-label="Previous sport"><ChevronLeft /></button>
        <button className="carousel-arrow next" onClick={() => rotate(1)} aria-label="Next sport"><ChevronRight /></button>
      </div>
      <div className="carousel-dots">{sports.map((s, i) => <button key={s.id} className={i === active ? 'active' : ''} onClick={() => rotate(offset(i))} aria-label={s.name} />)}</div>
      <button className="button button-gradient design-sport" onClick={onNext} disabled={!sport}>DESIGN {sport ? sport.name.toUpperCase() : 'THIS SPORT'} <ArrowRight size={19} /></button>
    </>}
  </section>;
}

/** Step 2: choose the garment for the sport. */
export function GarmentSelection({ catalog, draft, onSelect, onNext, onBack }: { catalog: Catalog | null; draft: Draft; onSelect: (id: string) => void; onNext: () => void; onBack: () => void }) {
  const sport = catalog?.sports.find(s => s.id === draft.sport);
  const garments = [...(catalog?.garments ?? [])].sort((a, b) => garmentOrder.indexOf(a.id) - garmentOrder.indexOf(b.id));
  return <section className="showroom garment-step">
    <div className="showroom-bg dim" style={{ backgroundImage: `url(${media('showroom/stadium-stage.webp')})` }} />
    <div className="glow-panel garment-panel">
      <div className="step-heading"><span className="step-number">2</span><div><h1>Select garment</h1><p>Choose what you want to design for {sport?.name || 'your sport'}.</p></div></div>
      {!catalog ? <div className="empty-state"><LoaderCircle className="spin" /> Loading garments…</div> : <div className="garment-tiles">
        {garments.map(g => <button key={g.id} className={`garment-tile ${draft.garment === g.id ? 'selected' : ''}`} onClick={() => onSelect(g.id)} onDoubleClick={onNext} aria-pressed={draft.garment === g.id}>
          {draft.garment === g.id && <span className="tile-check"><Check size={14} /></span>}
          <img src={garmentArt(g.id)} alt="" /><strong>{g.name}</strong><small>{g.description}</small>
        </button>)}
        {comingSoon.map(g => <div key={g.id} className="garment-tile soon" aria-disabled="true"><span className="soon-badge">COMING SOON</span><img src={garmentArt(g.id)} alt="" /><strong>{g.name}</strong><small>{g.description}</small></div>)}
      </div>}
      <div className="garment-actions"><button className="button button-outline" onClick={onBack}><ArrowLeft size={18} /> Change sport</button><button className="button button-gradient" disabled={!catalog || !draft.garment} onClick={onNext}>Continue to studio <ArrowRight size={19} /></button></div>
    </div>
  </section>;
}

type Reference = { id: number; name: string; preview: string };

/** A pasted or dropped picture the server takes (PNG, JPG or WebP); any other picture is redrawn as a PNG. */
async function uploadable(file: File): Promise<File> {
  const name = file.name && file.name !== 'image.png' ? file.name : 'Pasted image.png';
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return name === file.name ? file : new File([file], name, { type: file.type });
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('This picture could not be read.');
  return new File([blob], name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
}

/** The AI designer: one brief gives an HD presentation mockup (like ChatGPT) and four editable 3D concepts. */
export function AiDesigner({ catalog, draft, onChange, requireAuth, onStudio }: { catalog: Catalog | null; draft: Draft; onChange: (draft: Draft) => void; requireAuth: (action?: () => void) => void; onStudio: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selected, setSelected] = useState(0);
  const [references, setReferences] = useState<Reference[]>([]);
  const [uploading, setUploading] = useState(false);
  const [wantMockup, setWantMockup] = useState(true);
  const [mockup, setMockup] = useState<{ image?: string; error?: string; busy: boolean } | null>(null);
  const [dropping, setDropping] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const isAi = !!catalog?.provider.is_ai;

  async function generate() {
    if (prompt.trim().length < 10) { setError('Describe your idea in at least 10 characters.'); return; }
    setBusy(true); setError('');
    const body = { prompt, sport: draft.sport, garment: draft.garment, reference_ids: references.map(r => r.id) };
    if (isAi && wantMockup) {
      setMockup({ busy: true });
      api<{ image: string }>('/ai/mockup', { method: 'POST', body: JSON.stringify(body) })
        .then(r => setMockup({ busy: false, image: r.image }))
        .catch(e => setMockup({ busy: false, error: (e as Error).message }));
    } else setMockup(null);
    try { const result = await api<{ concepts: Concept[] }>('/concepts', { method: 'POST', body: JSON.stringify(body) }); setConcepts(result.concepts); setSelected(0); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function addReference(file: File) {
    setUploading(true); setError('');
    try { const data = new FormData(); data.append('file', file); data.append('name', file.name); data.append('type', 'reference'); const result = await api<{ id: number; name: string }>('/assets', { method: 'POST', body: data }); setReferences(old => [...old, { ...result, preview: URL.createObjectURL(file) }]); }
    catch (e) { setError((e as Error).message); } finally { setUploading(false); }
  }
  /** Pictures pasted or dropped into the brief, or picked, join the attachments: up to 4 in all. */
  function addFiles(list: File[]) {
    const images = list.filter(f => f.type.startsWith('image/'));
    if (!images.length) return;
    const room = 4 - references.length;
    if (room <= 0) { setError('Up to 4 images: remove one first.'); return; }
    requireAuth(() => void (async () => {
      for (const file of images.slice(0, room)) {
        try { await addReference(await uploadable(file)); } catch { setError('Use a PNG, JPG or WebP picture.'); return; }
      }
      if (images.length > room) setError(`Only ${room} more image${room === 1 ? '' : 's'} could be added: up to 4 in all.`);
    })());
  }
  const customize = (concept: Concept) => { onChange({ ...draft, name: concept.name, design: concept.design, mode: 'ai', patternMotif: concept.motif }); onStudio(); };
  /** The attached picture itself on the 3D kit (no AI): the Studio checks it, then puts it on exactly as drawn. */
  const putDrawing = (picture: Reference) => { const top = (['singlet', 'jersey', 'tee', 'polo'].includes(draft.garment) ? draft.garment : 'singlet') as Design['garment']; onChange({ ...draft, id: undefined, version: undefined, name: draft.name === 'Untitled kit' ? 'My design' : draft.name, garment: top, mode: 'ai', design: { ...(concepts[selected]?.design ?? draft.design), garment: top, layout: null }, patternMotif: undefined, pendingDrawing: { asset: picture.id, name: picture.name } }); onStudio(); };

  if (busy) return <Loader seconds={isAi ? 28 : 3} steps={references.length ? ['Understanding your brief', 'Analysing your references', 'Creating design concepts', 'Preparing 3D garment'] : ['Understanding your brief', 'Choosing colours and patterns', 'Creating design concepts', 'Preparing 3D garment']} />;

  if (concepts.length) return <div className="page-shell creation-page"><button className="back-link" onClick={() => { setConcepts([]); setMockup(null); }}><ArrowLeft size={16} /> Refine your brief</button><FlowSteps step={1} ai />
    {mockup && <section className="mockup-result glow-panel"><div className="mockup-copy"><span className="eyebrow"><Sparkles size={14} /> ONE PROMPT · HD MOCKUP</span><h2>Your design, <span>presented.</span></h2><p className="muted">“{prompt}”</p>{mockup.image && <div className="mockup-actions"><button className="button button-gradient" onClick={async () => saveBlob(await (await fetch(mockup.image!)).blob(), '3deezi-mockup.jpg')}><Download size={17} /> Download HD mockup</button><EditImageButton className="button button-outline" src={mockup.image} title="HD mockup" fileName="3deezi-mockup" ai={isAi} requireAuth={requireAuth} keepAs="AI mockup (edited)" onUse={image => setMockup(m => m && { ...m, image })} /><span className="field-hint">Also saved in your Assets.</span></div>}{mockup.error && <p className="error-message" role="alert">Mockup not created: {mockup.error}</p>}</div>
      <div className="mockup-frame">{mockup.image ? <img src={mockup.image} alt="AI presentation mockup of your design" /> : mockup.busy ? <Loader overlay={false} title="Rendering your HD mockup…" subtitle="Photoreal front, back and detail views · about a minute." steps={['Reading your brief and logos', 'Designing front and back', 'Adding fabric and details', 'Finishing the presentation']} seconds={70} /> : null}</div>
    </section>}
    {references.length > 0 && <div className="flow-actions"><p className="muted">Already have the finished design? Put your attached picture on the 3D kit exactly as drawn: its front and back edge to edge, the whole pattern and your logos in place (singlet, jersey, tee or polo).</p>{references.map(r => <button key={r.id} className="button button-gradient" onClick={() => putDrawing(r)} title={`Put ${r.name} on the 3D kit`}><img src={r.preview} alt="" style={{ width: 26, height: 26, objectFit: 'cover', borderRadius: 4 }} /> PUT MY DESIGN ON THE 3D KIT <ArrowRight size={18} /></button>)}</div>}
    <div className="page-heading"><span className="eyebrow">MAKE IT EDITABLE IN 3D</span><h1>Find your <span>starting point.</span></h1><p>Choose a direction to customise on the live 3D kit. Every colour, pattern, and detail is editable.</p></div>
    <div className="concept-grid">{concepts.map((concept, index) => <div className="concept-cell" key={concept.id}><button className={`concept-card panel ${selected === index ? 'selected' : ''}`} onClick={() => setSelected(index)} onDoubleClick={() => customize(concept)} aria-pressed={selected === index}><span className="concept-index">CONCEPT 0{index + 1}</span><span className="selection-indicator">{selected === index && <Check size={14} />}</span>{concept.preview ? <img className="concept-preview" src={concept.preview} alt={`${concept.name} AI concept render`} /> : <DesignThumbnail design={concept.design} />}<div className="concept-copy"><h3>{concept.name}</h3><p>{concept.description}</p><div className="palette-dots">{[concept.design.main, concept.design.secondary, concept.design.accent].map((c, i) => <span key={i} style={{ background: c }} />)}</div></div></button>
      {concept.preview && <EditImageButton className="image-edit-chip" label="Edit" iconSize={13} src={concept.preview} title={`Concept 0${index + 1} · ${concept.name}`} fileName={`3deezi-concept-${index + 1}`} ai={isAi} requireAuth={requireAuth} onUse={image => setConcepts(list => list.map((c, i) => i === index ? { ...c, preview: image } : c))} />}</div>)}</div>
    <div className="flow-actions"><p className="muted">Your brief: “{prompt}”</p><button className="button button-gradient" onClick={() => customize(concepts[selected])}>CUSTOMISE IN 3D STUDIO <ArrowRight size={19} /></button></div></div>;

  return <div className="page-shell creation-page"><Link className="back-link" to="/"><ArrowLeft size={16} /> Back to create</Link><FlowSteps step={0} ai /><div className="ai-layout"><div className="ai-brief"><span className="eyebrow"><Sparkles size={14} /> THE AI DESIGNER</span><h1>One prompt.<br /><span>A finished design.</span></h1><p className="intro-copy">Describe it like you would to ChatGPT: the garment, colours, collar, logos and where they go. Paste or attach your logos, or a design you already have: we’ll place the logos, or turn your design into 3D.</p>
    <form className={`brief-form${dropping ? ' dropping' : ''}`} onSubmit={e => { e.preventDefault(); requireAuth(generate); }}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false); }}
      onDrop={e => { setDropping(false); if (!e.dataTransfer.files.length) return; e.preventDefault(); addFiles([...e.dataTransfer.files]); }}>
      <div className="field-row"><label className="field">Sport<select value={draft.sport} onChange={e => onChange({ ...draft, sport: e.target.value })}>{catalog?.sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="field">Garment<select value={draft.garment} onChange={e => onChange({ ...draft, garment: e.target.value, design: { ...draft.design, garment: e.target.value as Design['garment'] } })}>{catalog?.garments.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label></div>
      <label className="field">Your design brief<textarea value={prompt} onChange={e => setPrompt(e.target.value)} onPaste={e => { const files = [...e.clipboardData.files]; if (!files.some(f => f.type.startsWith('image/'))) return; if (!e.clipboardData.getData('text/plain')) e.preventDefault(); addFiles(files); }} placeholder="A grey oversized polo with a black half-zip collar, white shoulder panels and black cuffs. MANTIS wordmark across the chest in raised silicone, the club crest on the right chest, league badge on the left, 1992 on the back of the collar and SEAGULLS script across the back yoke…" required minLength={10} maxLength={2000} rows={6} /><span className="field-hint">Be specific about colours, collar, logos and placement. Paste (Ctrl+V) or drop pictures here too. {prompt.length}/2000</span></label>
      <div className="prompt-chips"><button type="button" onClick={() => setPrompt('A black and cyan rugby league jersey with aggressive tribal geometric shoulder panels, a cyan V collar and the 3DEEZI wordmark across the chest.')}>Electric cyan</button><button type="button" onClick={() => setPrompt('A grey oversized polo with a black half-zip collar with white tipping, white shoulder panels, black cuffs and hem, raised silicone wordmark across the chest and a crest on the right chest. Premium cotton fabric.')}>Club polo</button><button type="button" onClick={() => setPrompt('A navy and gold football kit with classic vertical stripes, elegant and confident, gold crew collar.')}>Classic club</button><button type="button" onClick={() => setPrompt('Create a 3D version of my attached design. Make the front a hero image, slightly turned one way, with the back smaller behind it. Create a nice background.')}>My design in 3D</button></div>
      <div className="reference-heading"><span>YOUR LOGOS, DESIGNS & REFERENCES <span className="muted">/ optional</span></span><span>{references.length}/4</span></div>
      <div className="reference-list">{references.map(r => <div className="reference-item" key={r.id}><img src={r.preview} alt={r.name} /><button className="icon-button" type="button" aria-label={`Remove ${r.name}`} onClick={() => setReferences(items => items.filter(item => item.id !== r.id))}><X size={13} /></button></div>)}{references.length < 4 && <button className="reference-upload" type="button" disabled={uploading} onClick={() => requireAuth(() => upload.current?.click())}>{uploading ? <LoaderCircle className="spin" size={20} /> : <Plus size={22} />}<span>Add image</span></button>}<input ref={upload} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" multiple hidden onChange={e => { addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} /></div>
      {isAi && <label className="toggle-row"><input type="checkbox" checked={wantMockup} onChange={e => setWantMockup(e.target.checked)} /><span><strong>Create an HD presentation mockup</strong><small>Photoreal front, back and close-up details, like ChatGPT · about a minute</small></span></label>}
      {!isAi && <p className="field-hint">Preview mode: AI is not connected on this server, so concepts are built from your wording.</p>}
      {error && <p role="alert" className="error-message">{error}</p>}
      <button className="button button-gradient full-width" disabled={!catalog}><WandSparkles size={20} />CREATE MY DESIGN<ArrowRight size={19} /></button>
    </form></div>
    <div className="ai-inspiration"><img src={media('images/art/generating.jpg')} alt="Cyan and violet jersey concept inspiration" /><div><span className="eyebrow">A LITTLE INSPIRATION</span><h2>One idea.<br /><span>Endless directions.</span></h2><p>Start with a concept. Make it your own.</p></div></div></div></div>;
}

/** CONVERT: a photo, sketch or mockup (e.g. from ChatGPT) becomes an editable 3D design. */
export function ConvertPage({ catalog, draft, onChange, requireAuth, onStudio }: { catalog: Catalog | null; draft: Draft; onChange: (draft: Draft) => void; requireAuth: (action?: () => void) => void; onStudio: () => void }) {
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ name: string; summary: string; sport: string; garment: string; motif: string | null; design: Design } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const isAi = !!catalog?.provider.is_ai;

  async function read(file: File) {
    if (file.size > 8 * 1024 * 1024) { setError('Use an image smaller than 8 MB.'); return; }
    const data = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
    setImage(data); setResult(null); setError('');
  }
  async function convert() {
    setBusy(true); setError('');
    try { setResult(await api('/ai/convert', { method: 'POST', body: JSON.stringify({ image }) })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const open = () => { if (!result) return; onChange({ ...draft, id: undefined, version: undefined, name: result.name, sport: result.sport, garment: result.garment, mode: 'ai', design: { ...draft.design, ...result.design, patternImage: null }, patternMotif: result.motif || undefined }); onStudio(); };
  const [placing, setPlacing] = useState(false);
  /** The picture itself on the 3D kit (no AI): kept as a saved asset, checked in the Studio, put on exactly as drawn. */
  async function putDrawing() {
    if (!image) return;
    setPlacing(true); setError('');
    try {
      const blob = await (await fetch(image)).blob();
      const type = ['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) ? blob.type : 'image/png';
      const form = new FormData(); form.append('file', new File([blob], `My design.${type === 'image/jpeg' ? 'jpg' : type.slice(6)}`, { type })); form.append('type', 'reference'); form.append('name', 'My design');
      const saved = await api<{ id: number; name: string }>('/assets', { method: 'POST', body: form });
      const top = (['singlet', 'jersey', 'tee', 'polo'].includes(draft.garment) ? draft.garment : 'singlet') as Design['garment'];
      onChange({ ...draft, id: undefined, version: undefined, name: draft.name === 'Untitled kit' ? 'My design' : draft.name, garment: top, mode: 'dyo', design: { ...draft.design, garment: top, layout: null }, patternMotif: undefined, pendingDrawing: { asset: saved.id, name: saved.name || 'My design' } });
      onStudio();
    } catch (e) { setError((e as Error).message); } finally { setPlacing(false); }
  }

  if (busy) return <Loader title="Converting your design…" subtitle="Reading colours, patterns and lettering from your image." steps={['Reading the image', 'Finding colours', 'Matching pattern and lettering', 'Preparing 3D garment']} seconds={18} />;
  return <div className="page-shell creation-page convert-page">
    <div className="page-heading"><span className="eyebrow"><ImageUp size={14} /> CONVERT</span><h1>Any image. <span>Editable in 3D.</span></h1><p>Upload a photo, sketch or mockup (even one made in ChatGPT) and 3DEEZI turns it into a 3D kit you can edit.</p></div>
    <div className="convert-layout">
      <div className="convert-image"><button className={`convert-drop glow-panel ${image ? 'has-image' : ''}`} onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void read(f); }}>
        {image ? <img src={image} alt="Your uploaded design" /> : <><ImageUp size={34} /><strong>Drop an image or click to upload</strong><span>PNG, JPG or WEBP · up to 8 MB</span></>}
      </button>
      {image && <EditImageButton className="button button-outline" src={image} title="Your image" fileName="3deezi-convert" ai={isAi} requireAuth={requireAuth} onUse={next => { setImage(next); setResult(null); setError(''); }} />}</div>
      <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
      <div className="convert-side glow-panel">
        {result ? <><span className="eyebrow">WHAT WE FOUND</span><h2>{result.name}</h2><p className="muted">{result.summary}</p>
          <div className="convert-facts"><span>{catalog?.sports.find(s => s.id === result.sport)?.name}</span><span>{catalog?.garments.find(g => g.id === result.garment)?.name}</span><span>{result.design.pattern}</span></div>
          <div className="convert-palette">{(['main', 'secondary', 'accent'] as const).map(k => <span key={k}><i style={{ background: result.design[k] }} />{result.design[k]}</span>)}</div>
          {result.design.logoText && <p>Wordmark: <strong>{result.design.logoText}</strong></p>}
          <button className="button button-gradient full-width" onClick={open}>OPEN IN 3D STUDIO <ArrowRight size={18} /></button></>
          : <><span className="eyebrow">HOW IT WORKS</span><ol className="convert-steps"><li>Upload your image.</li><li>AI reads its colours, pattern and lettering.</li><li>Open it on the live 3D kit and keep designing.</li></ol>
          {!isAi && <p className="field-hint">Conversion needs AI to be connected on the server.</p>}
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="button button-gradient full-width" disabled={!image || !isAi} onClick={() => requireAuth(convert)}><WandSparkles size={18} /> CONVERT TO 3D</button></>}
        {image && <><button className="button button-outline full-width" disabled={placing || busy} onClick={() => requireAuth(() => void putDrawing())}>{placing ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />} PUT MY DESIGN ON THE 3D KIT</button><p className="field-hint">Already the finished design, front and back drawn side by side? Put it on the 3D kit exactly as drawn, no AI needed.</p></>}
      </div>
    </div>
  </div>;
}
