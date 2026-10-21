import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUp, Box, Check, ChevronLeft, ChevronRight, Crown, Download, EllipsisVertical, ImagePlus, ImageUp, Lightbulb, LoaderCircle, Mic, MicOff, Paperclip, PenLine, Plus, RefreshCw, Settings, Sparkles, WandSparkles, X } from 'lucide-react';
import { api, media, saveBlob, type Catalog, type CatalogItem, type Concept } from '../api';
import type { Draft } from '../App';
import type { Design } from '../types';
import { DesignThumbnail } from './Library';
import Loader from '../components/Loader';
import ImageEditor, { EditImageButton } from '../components/ImageEditor';
import { CategoryIcon } from '../components/GarmentIcon';
import { allGarments, formatCount, friendlyError, garmentInBrief, garmentLabels, MAX_BRIEF, sportInBrief, SportRow, sportTiles, useVoice } from '../components/AiStage';
import '../../css/ai-designer.css';

export const kitArt = (sport: string) => media(`showroom/kit-${sport}.webp`);
export const garmentArt = (garment: string) => media(`showroom/garment-${garment}.webp`);
/** Shown in the garment step and the studio; not yet available in 3D. */
export const comingSoon = [{ id: 'socks', name: 'Socks', description: 'Match socks with team bands.' }, { id: 'shoes', name: 'Shoes', description: 'Boots in your colours.' }];
const garmentOrder = ['fullkit', 'jersey', 'shorts', 'tee', 'singlet', 'polo', 'pocketpolo', 'hoodie', 'ziphoodie'];
/** A garment's place on the garment step; one not listed yet goes last. */
const order = (id: string) => { const i = garmentOrder.indexOf(id); return i < 0 ? garmentOrder.length : i; };

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
  useEffect(() => { const key = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (t && (t.isContentEditable || t.closest('input, textarea, select'))) return; if (e.key === 'ArrowLeft') rotate(-1); if (e.key === 'ArrowRight') rotate(1); if (e.key === 'Enter' && sports.length && !t?.closest('button, a')) onNext(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [rotate, onNext, sports.length]);
  const offset = (i: number) => { const n = sports.length; let o = i - active; if (o > n / 2) o -= n; if (o < -n / 2) o += n; return o; };
  const sport = sports[active];

  return <section className="showroom sport-step" onPointerDown={e => { dragStart.current = e.clientX; }} onPointerUp={e => { if (dragStart.current !== null && Math.abs(e.clientX - dragStart.current) > 50) rotate(e.clientX < dragStart.current ? 1 : -1); dragStart.current = null; }} onWheel={e => { const now = Date.now(); if (Math.abs(e.deltaX) > 20 && now - wheelLock.current > 350) { wheelLock.current = now; rotate(e.deltaX > 0 ? 1 : -1); } }}>
    <div className="showroom-bg" style={{ backgroundImage: `url(${media('showroom/stadium-stage.webp')})` }} />
    <div className="showroom-head">
      <Link className="back-link" to="/"><ArrowLeft size={16} /> Back to create</Link>
      <span className="eyebrow">DESIGN YOUR OWN</span>
      <h1>Different sports.<br /><span>Same team spirit.</span></h1>
      <p>Choose your sport and start designing. Rotate to explore.</p>
    </div>
    {!catalog ? <div className="empty-state"><LoaderCircle className="spin" /> Loading sports…</div> : <>
      <CategoryShortcuts sports={sports} active={active} onPick={i => rotate(offset(i))} />
      <div className="carousel" aria-roledescription="carousel" aria-label="Sports">
        {sports.map((s, i) => { const o = offset(i), a = Math.abs(o); return <button key={s.id} className={`carousel-item ${o === 0 ? 'is-active' : ''}`} style={{ '--o': o, '--a': a, zIndex: 20 - a, opacity: a > 4 ? 0 : 1 } as React.CSSProperties} onClick={() => o === 0 ? onNext() : rotate(o)} aria-label={o === 0 ? `Design ${s.name}` : `Rotate to ${s.name}`} aria-current={o === 0} tabIndex={a > 4 ? -1 : 0}>
          {/* Only the kits on the stage and the next one each side load (30 categories): the rest come in as it turns. */}
          {a <= 5 && <img src={kitArt(s.id)} alt={`${s.name} kit`} draggable={false} decoding="async" />}
          <span className="carousel-label"><strong>{s.name}</strong><small>{s.description}</small></span>
        </button>; })}
        <span className="stage-ring" aria-hidden="true" />
        <button className="carousel-arrow prev" onClick={() => rotate(-1)} aria-label="Previous sport"><ChevronLeft /></button>
        <button className="carousel-arrow next" onClick={() => rotate(1)} aria-label="Next sport"><ChevronRight /></button>
      </div>
      {/* A dot each fits a dozen categories; more show as a count (the tiles above pick any of them). */}
      {sports.length <= 12 ? <div className="carousel-dots">{sports.map((s, i) => <button key={s.id} className={i === active ? 'active' : ''} onClick={() => rotate(offset(i))} aria-label={s.name} />)}</div>
        : <div className="carousel-count" aria-live="polite"><b>{active + 1}</b> / {sports.length}</div>}
      <button className="button button-gradient design-sport" onClick={onNext} disabled={!sport}>DESIGN {sport ? sport.name.toUpperCase() : 'THIS SPORT'} <ArrowRight size={19} /></button>
    </>}
  </section>;
}

type TileFilter = 'all' | 'sports' | 'apparel';
const tileFilters: { id: TileFilter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'sports', label: 'Sports' }, { id: 'apparel', label: 'Apparel' }];
const groupOf = (s: CatalogItem) => s.group === 'apparel' ? 'apparel' : 'sports';

/**
 * The quick-access row over the stage (client visual): one 2D tile per catalogue category, filtered by ALL · SPORTS ·
 * APPAREL. A tile turns the stage to its kit (the page stays); turning the stage lights its tile and brings it into view.
 * One row only: the arrows page it on desktop, phones swipe it.
 */
function CategoryShortcuts({ sports, active, onPick }: { sports: CatalogItem[]; active: number; onPick: (index: number) => void }) {
  const [filter, setFilter] = useState<TileFilter>('all');
  const [more, setMore] = useState({ prev: false, next: false });
  const strip = useRef<HTMLDivElement>(null);
  const shown = sports.map((s, i) => ({ s, i })).filter(({ s }) => filter === 'all' || groupOf(s) === filter);
  const measure = useCallback(() => {
    const el = strip.current; if (!el) return;
    const prev = el.scrollLeft > 2, next = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setMore(m => m.prev === prev && m.next === next ? m : { prev, next });
  }, []);
  // The stage turned to a category outside the filter: show them all, so its tile can light up.
  useEffect(() => { if (filter !== 'all' && sports[active] && groupOf(sports[active]) !== filter) setFilter('all'); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  // Keep the lit tile in view: scrolls the row only, never the page.
  useEffect(() => {
    const el = strip.current, tile = el?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (el && tile && (tile.offsetLeft < el.scrollLeft || tile.offsetLeft + tile.offsetWidth > el.scrollLeft + el.clientWidth))
      el.scrollTo({ left: tile.offsetLeft - (el.clientWidth - tile.offsetWidth) / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    measure();
  }, [active, filter, measure]);
  useEffect(() => { const el = strip.current; if (!el) return; const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect(); }, [measure]);
  /** About one page of tiles, keeping one in view for context. */
  const page = (dir: number) => { const el = strip.current; if (!el) return; const w = el.querySelector<HTMLElement>('.sport-tile')?.offsetWidth ?? 120; el.scrollBy({ left: dir * Math.max(el.clientWidth - w, w), behavior: 'smooth' }); };
  /** A filter that hides the chosen category turns the stage to its first one, so a tile is always lit. */
  const choose = (f: TileFilter) => { setFilter(f); const first = sports.findIndex(s => groupOf(s) === f); if (f !== 'all' && first >= 0 && sports[active] && groupOf(sports[active]) !== f) onPick(first); };
  const filters = tileFilters.filter(f => f.id === 'all' || sports.some(s => groupOf(s) === f.id));
  // Own pointer and wheel: swiping or scrolling the row must not turn the stage behind it.
  return <div className="sport-shortcuts" onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <div className="sport-filter" role="group" aria-label="Show categories">{filters.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => choose(f.id)}>{f.label}</button>)}</div>
    <div className={`sport-strip${more.prev || more.next ? '' : ' fits'}`}>
      <button type="button" className="sport-strip-arrow" onClick={() => page(-1)} disabled={!more.prev} aria-label="Previous categories"><ChevronLeft size={20} /></button>
      <div ref={strip} className={`sport-tiles${more.prev ? ' more-prev' : ''}${more.next ? ' more-next' : ''}`} onScroll={measure} role="group" aria-label="Categories">
        {shown.map(({ s, i }) => <button key={s.id} type="button" data-index={i} className="sport-tile" aria-pressed={i === active} onClick={() => onPick(i)} title={s.name}><CategoryIcon category={s.id} /><strong>{s.name}</strong></button>)}
      </div>
      <button type="button" className="sport-strip-arrow" onClick={() => page(1)} disabled={!more.next} aria-label="More categories"><ChevronRight size={20} /></button>
    </div>
  </div>;
}

/** Step 2: choose the garment for the sport. */
export function GarmentSelection({ catalog, draft, onSelect, onNext, onBack }: { catalog: Catalog | null; draft: Draft; onSelect: (id: string) => void; onNext: () => void; onBack: () => void }) {
  const sport = catalog?.sports.find(s => s.id === draft.sport);
  const all = [...(catalog?.garments ?? [])].sort((a, b) => order(a.id) - order(b.id));
  /** The sport's garments (catalog.php), most likely first; "All garments" shows the rest too. */
  const suited = sport?.garments?.length ? sport.garments.filter(id => all.some(g => g.id === id)) : [];
  const [showAll, setShowAll] = useState(false);
  const limited = suited.length > 0 && suited.length < all.length && !showAll;
  const garments = limited ? suited.map(id => all.find(g => g.id === id)!) : all;
  // A garment this sport does not offer (left from another sport) gives way to the sport's first.
  useEffect(() => { if (limited && !suited.includes(draft.garment)) onSelect(suited[0]); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, draft.sport]);
  return <section className="showroom garment-step">
    <div className="showroom-bg dim" style={{ backgroundImage: `url(${media('showroom/stadium-stage.webp')})` }} />
    <div className="glow-panel garment-panel">
      <div className="step-heading"><span className="step-number">2</span><div><h1>Select garment</h1><p>Choose what you want to design for {sport?.name || 'your sport'}.</p></div></div>
      {!catalog ? <div className="empty-state"><LoaderCircle className="spin" /> Loading garments…</div> : <div className="garment-tiles">
        {garments.map(g => <button key={g.id} className={`garment-tile ${draft.garment === g.id ? 'selected' : ''}`} onClick={() => onSelect(g.id)} onDoubleClick={onNext} aria-pressed={draft.garment === g.id}>
          {draft.garment === g.id && <span className="tile-check"><Check size={14} /></span>}
          <img src={garmentArt(g.id)} alt="" onError={e => { const fallback = garmentArt(g.id.includes('polo') ? 'polo' : 'jersey'); if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback; }} /><strong>{g.name}</strong><small>{g.description}</small>
        </button>)}
        {comingSoon.map(g => <div key={g.id} className="garment-tile soon" aria-disabled="true"><span className="soon-badge">COMING SOON</span><img src={garmentArt(g.id)} alt="" /><strong>{g.name}</strong><small>{g.description}</small></div>)}
      </div>}
      {catalog && suited.length > 0 && suited.length < all.length && <button type="button" className="garment-more" aria-pressed={showAll} onClick={() => setShowAll(v => !v)}>{showAll ? `Only ${sport?.name ?? 'this sport'} garments` : 'Show all garments'}</button>}
      <div className="garment-actions"><button className="button button-outline" onClick={onBack}><ArrowLeft size={18} /> Change sport</button><button className="button button-gradient" disabled={!catalog || !draft.garment} onClick={onNext}>Continue to studio <ArrowRight size={19} /></button></div>
    </div>
  </section>;
}

/** An attached picture: kept on this device until Generate (so it can be attached before signing in), then saved to Assets. */
type Reference = { id?: number; name: string; preview: string; file?: File };
const MAX_REFERENCES = 4;
/** The old brief chips, now suggestions in the (+) menu. */
const suggestions = [
  { label: 'Electric cyan', text: 'A black and cyan rugby league jersey with aggressive tribal geometric shoulder panels, a cyan V collar and the 3DEEZI wordmark across the chest.' },
  { label: 'Club polo', text: 'A grey oversized polo with a black half-zip collar with white tipping, white shoulder panels, black cuffs and hem, raised silicone wordmark across the chest and a crest on the right chest. Premium cotton fabric.' },
  { label: 'Classic club', text: 'A navy and gold football kit with classic vertical stripes, elegant and confident, gold crew collar.' },
  { label: 'My design in 3D', text: 'Create a 3D version of my attached design. Make the front a hero image, slightly turned one way, with the back smaller behind it. Create a nice background.' },
];

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

/** One of the four designs a brief gives: its direction (from the AI's planning step), its 3D kit spec and its picture. */
type DesignOption = { id: string; rank: number; name: string; description: string; design: Design; motif?: string; direction?: Record<string, unknown>; image?: string | null; quality?: 'high' | 'medium'; pending?: 'high' | 'medium'; busy: boolean; error?: string; view?: View };
/** presentation: front and back side by side (the PRIMARY, Make HD); front: one garment, square, for the option cards (138.jpg). */
type View = 'presentation' | 'front';
type BriefBody = { prompt: string; sport: string; garment: string; reference_ids: number[] };
/** What "Make HD" costs (Pricing: an HD presentation mockup). */
const HD_CREDITS = 10;

/**
 * The AI designer (client visual 2026-10-21): the logo, DESIGN WITHOUT LIMITS, one prompt bar and the sports row over the
 * studio with the 3DEEZI emblem and the kit. Generate (images/138.jpg): one planning call gives four ranked designs; the best is the PRIMARY
 * (an HD presentation mockup, as wide as the prompt bar), the other three are medium previews in a column on the right. Each keeps its
 * 3D kit spec, so any of them opens in the Studio as an editable kit.
 */
export function AiDesigner({ catalog, draft, onChange, requireAuth, onStudio, onNotice }: { catalog: Catalog | null; draft: Draft; onChange: (draft: Draft) => void; requireAuth: (action?: () => void) => void; onStudio: () => void; onNotice?: (text: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const [references, setReferences] = useState<Reference[]>([]);
  /** "HD primary" (off by default, client 2026-10-21: fast and low cost first): the primary rendered in HD rather than as a quick preview. */
  const [wantHd, setWantHd] = useState(false);
  /** The results step: [0] is the PRIMARY, [1..3] the options; `planning` while the AI writes the four directions. */
  const [results, setResults] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [options, setOptions] = useState<DesignOption[]>([]);
  const [menu, setMenu] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const lastBrief = useRef<BriefBody | null>(null);
  const [making3d, setMaking3d] = useState(false);
  const [dropping, setDropping] = useState(false);
  /** The sports tile chosen (optional), the garment chips (only when the brief names no garment) and the (+) menu. */
  const [tile, setTile] = useState<string | null>(null);
  const [askGarment, setAskGarment] = useState(false);
  const [pickedGarment, setPickedGarment] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  /** A friendly note that is not an error (a long paste was shortened). */
  const [note, setNote] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const plus = useRef<HTMLDivElement>(null);
  /** This brief's run: a new brief, Refine and leaving the page end it, so a late mockup or print sheet is dropped. */
  const run = useRef(0);
  useEffect(() => () => { run.current += 1; }, []);
  const isAi = !!catalog?.provider.is_ai;
  const voice = useVoice(prompt, setPrompt, setError);
  const tiles = sportTiles(catalog?.sports);
  const chosen = tiles.find(t => t.id === tile);
  const atBrief = !results;
  const primary = options[0];

  // The bar grows with the text (about seven lines, then it scrolls); the column around it stays centred.
  useEffect(() => { const el = field.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 196)}px`; }, [prompt, atBrief]);
  // Ready to type on computers (not on phones, where it would open the keyboard over the page).
  useEffect(() => { if (atBrief && matchMedia('(pointer: fine)').matches) field.current?.focus({ preventScroll: true }); }, [atBrief]);
  useEffect(() => {
    if (menu === null) return;
    const away = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('.aid-kebab-wrap')) setMenu(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [menu]);
  useEffect(() => {
    if (!plusOpen) return;
    const away = (e: PointerEvent) => { if (!plus.current?.contains(e.target as Node)) setPlusOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlusOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [plusOpen]);

  /** Generate: the sport from the tile (or the brief), the garment from the brief or a quick chip; then sign in if needed. */
  function submit(garmentChoice?: string) {
    voice.stop();
    const text = prompt.trim();
    if (!text && !references.length) { setError('Describe your design: the garment, colours, style or your team name.'); field.current?.focus(); return; }
    if (text.length < 10 && !references.length) { setError('Tell us a little more: colours, style or your team name (at least 10 characters).'); field.current?.focus(); return; }
    const sport = chosen ?? sportInBrief(text, tiles);
    // A garment picked for an earlier brief only when this sport offers it (Fishing has no shorts).
    const garment = garmentChoice ?? garmentInBrief(text) ?? (pickedGarment && (sport?.garments ?? allGarments).includes(pickedGarment) ? pickedGarment : null);
    if (!garment) { setError(''); setAskGarment(true); return; }
    if (garmentChoice) setPickedGarment(garmentChoice);
    setAskGarment(false); setError(''); setNote('');
    let brief = text.length >= 10 ? text : `Create a design from my attached artwork. ${text}`.trim();
    if (sport?.brief && !brief.toLowerCase().includes(sport.brief.split(' ')[0].toLowerCase())) brief = `${sport.brief}: ${brief}`;
    requireAuth(() => void generate(brief, sport?.sport ?? draft.sport, garment));
  }
  async function generate(brief: string, sport: string, garment: string) {
    const mine = ++run.current, current = () => run.current === mine;
    setResults(true); setPlanning(true); setOptions([]); setMenu(null); setEditing(null); setMaking3d(false); setError('');
    onChange({ ...draft, sport, garment, mode: 'ai', design: { ...draft.design, garment: garment as Design['garment'] }, patternMotif: undefined, pendingDrawing: undefined });
    // Pictures attached before signing in are saved now (in Assets, as references), so the AI can read them.
    let refs = references;
    try {
      refs = await Promise.all(references.map(async r => r.id || !r.file ? r : { ...r, ...(await saveReference(r.file)) }));
      if (!current()) return;
      setReferences(refs);
    } catch (e) { if (current()) { setError(`Your pictures could not be attached. ${friendlyError(e)}`); setPlanning(false); } return; }
    const body: BriefBody = { prompt: brief, sport, garment, reference_ids: refs.flatMap(r => r.id ? [r.id] : []) };
    lastBrief.current = body;
    try {
      if (!isAi) {
        // Preview mode (no AI on the server): four concepts from the wording, shown as 3D kit thumbnails.
        const result = await api<{ concepts: Concept[] }>('/concepts', { method: 'POST', body: JSON.stringify(body) });
        if (current()) setOptions(result.concepts.map((c, i) => ({ ...c, rank: i + 1, busy: false })));
        return;
      }
      // Fast like ChatGPT (client 2026-10-21): the PRIMARY (the brief as written) starts rendering at once, while one short
      // planning call gives its 3D kit spec and three ranked alternatives; then the options render, all in parallel on a
      // normal server (the local one answers one request at a time). Results from an older brief are dropped.
      const first: DesignOption = { id: `primary-${mine}`, rank: 1, name: 'Your design', description: 'Your brief, exactly as written.', design: { ...draft.design, garment: garment as Design['garment'] }, direction: { ownDesign: false }, image: null, busy: true };
      setOptions([first]);
      void render(first, wantHd ? 'high' : 'medium', mine, 'presentation');
      const plan = await api<{ directions: DesignOption[] }>('/ai/designs', { method: 'POST', body: JSON.stringify(body) });
      if (!current()) return;
      const [spec, ...rest] = plan.directions;
      const alternatives = rest.map(d => ({ ...d, image: null, busy: true }));
      // The primary keeps its picture (or its render still running) and takes the plan's name and 3D kit spec.
      setOptions(list => [...list.map(o => o.id === first.id && spec ? { ...o, name: spec.name, description: spec.description, design: spec.design, motif: spec.motif } : o), ...alternatives]);
      for (const o of alternatives) void render(o, 'medium', mine, 'front');
    } catch (e) { if (current()) setError(friendlyError(e)); } finally { if (current()) setPlanning(false); }
  }
  /** Renders one design (the PRIMARY in HD, an option as a medium preview, "Make HD" or "Regenerate"); its card fills in when it arrives. */
  async function render(option: DesignOption, quality: 'high' | 'medium', mine = run.current, view: View = option.view ?? 'front') {
    const body = lastBrief.current, current = () => run.current === mine;
    if (!body || !option.direction) return;
    setOptions(list => list.map(x => x.id === option.id ? { ...x, busy: true, pending: quality, view, error: undefined } : x));
    try {
      const r = await api<{ image: string; quality: 'high' | 'medium'; view?: View }>('/ai/designs/render', { method: 'POST', body: JSON.stringify({ ...body, rank: option.rank, quality, view, direction: option.direction, name: option.name }) });
      if (current()) setOptions(list => list.map(x => x.id === option.id ? { ...x, busy: false, image: r.image, quality: r.quality, view: r.view ?? view } : x));
    } catch (e) { if (current()) setOptions(list => list.map(x => x.id === option.id ? { ...x, busy: false, error: friendlyError(e) } : x)); }
  }
  /** "Make primary": the option swaps places with the PRIMARY at once, keeping its picture. */
  const makePrimary = (index: number) => { setMenu(null); setOptions(list => { const next = [...list]; [next[0], next[index]] = [next[index], next[0]]; return next; }); };
  const download = async (o: DesignOption, n: number) => { setMenu(null); if (o.image) saveBlob(await (await fetch(o.image)).blob(), `3deezi-design-${n}${o.quality === 'high' ? '-hd' : ''}.jpg`); };
  /** "Back to create": the brief step with the brief, pictures, sport and switches kept; work still running is dropped. */
  const backToCreate = () => { run.current += 1; setResults(false); setPlanning(false); setOptions([]); setMenu(null); setEditing(null); setMaking3d(false); setError(''); };
  async function saveReference(file: File) {
    const data = new FormData(); data.append('file', file); data.append('name', file.name); data.append('type', 'reference');
    return api<{ id: number; name: string }>('/assets', { method: 'POST', body: data });
  }
  /** Pictures attached with (+) or the picture button, pasted or dropped: up to 4, kept with this design session. */
  async function addFiles(list: File[]) {
    const images = list.filter(f => f.type.startsWith('image/'));
    if (!images.length) { if (list.length) setError('Attach pictures: PNG, JPG or WebP logos, artwork or references.'); return; }
    const room = MAX_REFERENCES - references.length;
    if (room <= 0) { setError(`Up to ${MAX_REFERENCES} pictures: remove one first.`); return; }
    const big = images.find(f => f.size > 10 * 1024 * 1024);
    if (big) { setError(`${big.name} is over 10 MB: use a smaller picture.`); return; }
    setError('');
    const added: Reference[] = [];
    for (const file of images.slice(0, room)) {
      try { const ready = await uploadable(file); added.push({ name: ready.name, preview: URL.createObjectURL(ready), file: ready }); }
      catch { setError('Use a PNG, JPG or WebP picture.'); }
    }
    setReferences(old => [...old, ...added].slice(0, MAX_REFERENCES));
    if (images.length > room) setError(`Only ${room} more picture${room === 1 ? '' : 's'} could be added: up to ${MAX_REFERENCES} in all.`);
  }
  // Not while MAKE IT 3D is drawing: it opens the Studio by itself with the print sheet (a concept would start its own AI print meanwhile).
  const customize = (concept: Pick<Concept, 'name' | 'design' | 'motif'>) => { if (making3d) return; onChange({ ...draft, name: concept.name, design: concept.design, mode: 'ai', patternMotif: concept.motif, pendingDrawing: undefined }); onStudio(); };
  /** "Open in 3D Designer" (MAKE IT 3D): the PRIMARY redrawn by the same AI as a flat front and back print sheet, then put on the 3D kit like a design picture. */
  async function makeIt3d() {
    const image = primary?.image;
    if (!image || !primary) return;
    // A design picture goes on a singlet, jersey, tee or polo (with or without the pocket) only: a hoodie takes the
    // design's colours, pattern and wordmark, with the first attached logo as its crest (no print sheet is drawn).
    if (draft.garment === 'hoodie' || draft.garment === 'ziphoodie') {
      const logo = primary.design.logoImage || references.find(r => r.preview.startsWith('data:image/'))?.preview || null;
      onChange({ ...draft, id: undefined, version: undefined, name: primary.name || draft.name, mode: 'ai', design: { ...primary.design, garment: draft.garment, layout: null, logoImage: logo }, patternMotif: primary.motif, pendingDrawing: undefined });
      onStudio();
      onNotice?.('Hoodies take your design’s colours and logo; full print designs on hoodies are coming.');
      return;
    }
    const mine = run.current, current = () => run.current === mine;
    setMaking3d(true); setError('');
    try {
      const sheet = await api<{ asset: { id: number; name: string }; image: string }>('/ai/print-sheet', { method: 'POST', body: JSON.stringify({ image, sport: draft.sport, garment: draft.garment, reference_ids: references.flatMap(r => r.id ? [r.id] : []), name: primary?.name ?? '', front_only: primary?.view === 'front' }) });
      // Refine or another page meanwhile: the user stays where they went (the print sheet is kept in Assets).
      if (current()) putDrawing({ id: sheet.asset.id, name: sheet.asset.name, preview: sheet.image });
    } catch (e) { if (current()) setError(`Make it 3D: ${friendlyError(e)}`); } finally { if (current()) setMaking3d(false); }
  }
  /** The attached picture itself on the 3D kit (no AI): the Studio checks it, then puts it on exactly as drawn. */
  const putDrawing = (picture: Reference) => { if (!picture.id) return; const top = (['singlet', 'jersey', 'tee', 'polo', 'pocketpolo'].includes(draft.garment) ? draft.garment : 'singlet') as Design['garment']; onChange({ ...draft, id: undefined, version: undefined, name: draft.name === 'Untitled kit' ? 'My design' : draft.name, garment: top, mode: 'ai', design: { ...(primary?.design ?? draft.design), garment: top, layout: null }, patternMotif: undefined, pendingDrawing: { asset: picture.id, name: picture.name } }); onStudio(); };

  const full = references.length >= MAX_REFERENCES;
  const garmentChoices = (chosen ?? sportInBrief(prompt, tiles))?.garments ?? allGarments;
  const stageProps = {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true); } },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false); },
    onDrop: (e: React.DragEvent) => { setDropping(false); if (!e.dataTransfer.files.length) return; e.preventDefault(); void addFiles([...e.dataTransfer.files]); },
  };
  const background = <picture className="aid-bg" aria-hidden="true">
    <source media="(max-aspect-ratio: 4/5)" type="image/webp" srcSet={`${media('images/ai-designer/bg-tall-640.webp')} 640w, ${media('images/ai-designer/bg-tall-1024.webp')} 1024w`} sizes="100vw" />
    <img src={media('images/ai-designer/bg-1440.webp')} srcSet={`${media('images/ai-designer/bg-960.webp')} 960w, ${media('images/ai-designer/bg-1440.webp')} 1440w, ${media('images/ai-designer/bg-2048.webp')} 2048w`} sizes="100vw" alt="" fetchPriority="high" decoding="async" />
  </picture>;
  /** The prompt bar: the brief step's, and on the results the same bar with the current brief, to refine it or start again. */
  const bar = <form className={`aid-prompt${references.length ? ' has-files' : ''}`} onSubmit={e => { e.preventDefault(); submit(); }}>
        {references.length > 0 && <ul className="aid-files" aria-label="Attached pictures">{references.map((r, i) => <li key={r.preview}><img src={r.preview} alt={r.name} /><button type="button" aria-label={`Remove ${r.name}`} onClick={() => setReferences(items => items.filter((_, j) => j !== i))}><X size={12} /></button></li>)}</ul>}
        <div className="aid-row">
          <div className="aid-plus-wrap" ref={plus}>
            <button type="button" className="aid-plus" aria-haspopup="menu" aria-expanded={plusOpen} aria-label="Attach and suggestions" title="Attach logos or artwork, or try a suggestion" onClick={() => setPlusOpen(o => !o)}><Plus size={22} /></button>
            {plusOpen && <div className="aid-menu" role="menu">
              <button type="button" role="menuitem" disabled={full} onClick={() => { setPlusOpen(false); upload.current?.click(); }}><Paperclip size={16} /><span>Attach logos or artwork</span><small>{references.length}/{MAX_REFERENCES}</small></button>
              <span className="aid-menu-label">Try a suggestion</span>
              {suggestions.map(s => <button type="button" role="menuitem" key={s.label} onClick={() => { setPrompt(s.text); setError(''); setPlusOpen(false); field.current?.focus(); }}><Lightbulb size={16} /><span>{s.label}</span></button>)}
            </div>}
          </div>
          <label className="aid-field"><span className="sr-only">Describe your design</span>
            <textarea ref={field} rows={1} value={prompt} maxLength={MAX_BRIEF} placeholder={chosen ? `Describe your ${chosen.label} design...` : 'Describe your design...'}
              onChange={e => { setPrompt(e.target.value); if (error) setError(''); if (note && e.target.value.length < MAX_BRIEF) setNote(''); }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); submit(); } }}
              onPaste={e => {
                const files = [...e.clipboardData.files], text = e.clipboardData.getData('text/plain');
                if (files.some(f => f.type.startsWith('image/'))) { void addFiles(files); if (!text) { e.preventDefault(); return; } }
                // A paste past the limit keeps what fits and says so (the browser would cut it silently).
                const el = e.currentTarget, start = el.selectionStart, end = el.selectionEnd, room = MAX_BRIEF - (prompt.length - (end - start));
                if (text.length <= room) return;
                e.preventDefault();
                const kept = text.slice(0, Math.max(0, room));
                setPrompt(prompt.slice(0, start) + kept + prompt.slice(end)); setError('');
                setNote(`Your brief was shortened to ${formatCount(MAX_BRIEF)} characters.`);
                requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + kept.length; });
              }} />
          </label>
          <button type="button" className="aid-icon" disabled={full} onClick={() => upload.current?.click()} aria-label="Upload a reference image" title={full ? `Up to ${MAX_REFERENCES} pictures` : 'Upload a reference image, logo or design'}><ImagePlus size={21} /></button>
          {voice.supported && <button type="button" className={`aid-icon${voice.listening ? ' is-on' : ''}`} onClick={voice.toggle} aria-pressed={voice.listening} aria-label={voice.listening ? 'Stop voice input' : 'Speak your brief'} title={voice.listening ? 'Stop voice input' : 'Speak your brief'}>{voice.listening ? <MicOff size={21} /> : <Mic size={21} />}</button>}
          <button type="submit" className="aid-go" aria-label="Generate design" title="Generate design"><ArrowUp size={23} strokeWidth={2.4} /></button>
        </div>
        {prompt.length > MAX_BRIEF - 500 && <span className={`aid-count${prompt.length >= MAX_BRIEF ? ' is-full' : ''}`} aria-live="polite">{formatCount(prompt.length)} / {formatCount(MAX_BRIEF)}</span>}
        <input ref={upload} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" onChange={e => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </form>;
  const notes = <>
      {askGarment && <div className="aid-ask" role="group" aria-label="Choose the garment"><span>What are we designing{chosen ? ` for ${chosen.label}` : ''}?</span>{garmentChoices.map(g => <button key={g} type="button" onClick={() => submit(g)}>{garmentLabels[g]}</button>)}</div>}
      {error && <p className="aid-error" role="alert">{error}</p>}
      {note && !error && <p className="aid-info" role="status">{note}</p>}
  </>;

  if (results) {
    /** The ⋮ menu of the PRIMARY (index 0) or an option: Make primary, Make HD, Download, Edit image, Regenerate, Customise in 3D Studio. */
    const kebab = (o: DesignOption, index: number) => <div className="aid-kebab-wrap">
      <button type="button" className="aid-kebab" aria-haspopup="menu" aria-expanded={menu === index} aria-label={index ? `Design ${index + 1} actions` : 'Primary design actions'} onClick={() => setMenu(m => m === index ? null : index)}><EllipsisVertical size={18} /></button>
      {menu === index && <div className="aid-menu aid-kebab-menu" role="menu">
        {index > 0 && <button type="button" role="menuitem" onClick={() => makePrimary(index)}><Crown size={16} /><span>Make primary</span></button>}
        {isAi && o.direction && o.quality !== 'high' && <button type="button" role="menuitem" disabled={o.busy} onClick={() => { setMenu(null); requireAuth(() => void render(o, 'high', run.current, 'presentation')); }} title="The full front and back presentation in HD"><Sparkles size={16} /><span>Make HD</span><small>{HD_CREDITS} credits</small></button>}
        {o.image && <button type="button" role="menuitem" onClick={() => void download(o, index + 1)}><Download size={16} /><span>Download</span></button>}
        {o.image && <button type="button" role="menuitem" onClick={() => { setMenu(null); setEditing(index); }}><PenLine size={16} /><span>Edit image</span></button>}
        {isAi && o.direction && <button type="button" role="menuitem" disabled={o.busy} onClick={() => { setMenu(null); requireAuth(() => void render(o, o.quality ?? 'medium')); }}><RefreshCw size={16} /><span>Regenerate{index ? ' this option' : ''}</span></button>}
        <button type="button" role="menuitem" disabled={making3d} onClick={() => { setMenu(null); customize(o); }}><Box size={16} /><span>Customise in 3D Studio</span><small>editable kit</small></button>
        {index === 0 && references.filter(r => r.id).map(r => <button key={r.id} type="button" role="menuitem" onClick={() => { setMenu(null); putDrawing(r); }} title="Already the finished design? Put your attached picture on the 3D kit exactly as drawn"><ArrowRight size={16} /><span>Put {r.name} on the 3D kit</span></button>)}
      </div>}
    </div>;
    const art = (o: DesignOption | undefined, big: boolean) => !o ? null
      : o.image ? <><img className="aid-art-blur" src={o.image} alt="" aria-hidden="true" /><img className="aid-art-img" src={o.image} alt={`${o.name}: ${o.description}`} />{o.busy && <span className="aid-art-busy" role="status"><LoaderCircle className="spin" size={big ? 30 : 20} />{big ? (o.pending === 'high' && o.quality !== 'high' ? 'Rendering in HD… about a minute' : 'Regenerating…') : null}</span>}</>
      : o.busy ? (big ? <Loader overlay={false} title={o.pending === 'high' ? 'Rendering your HD design…' : 'Rendering your design…'} subtitle={o.pending === 'high' ? 'Your brief and logos, front and back, in HD · about a minute.' : 'Your brief and logos, front and back · about 40 seconds. Three more designs follow.'} steps={['Reading your brief and logos', 'Designing front and back', 'Lighting the presentation', 'Finishing']} seconds={o.pending === 'high' ? 70 : 38} /> : <span className="aid-art-wait" role="status"><LoaderCircle className="spin" size={22} /><small>{o.name}</small></span>)
      : o.error ? <div className="aid-art-error" role="alert"><p>{o.error}</p>{o.direction && <button type="button" className="button button-outline" onClick={() => requireAuth(() => void render(o, o.pending ?? 'medium'))}><RefreshCw size={15} /> Try again</button>}</div>
      : <DesignThumbnail design={o.design} />;
    const editingOption = editing === null ? undefined : options[editing];
    return <section className={`aid-stage aid-results-stage${dropping ? ' dropping' : ''}`} aria-label="Your designs" {...stageProps}>
      {background}
      <div className="aid-results">
        <button type="button" className="aid-back" onClick={backToCreate}><ArrowLeft size={18} /> Back to create</button>
        <div className="aid-primary glow-panel" aria-busy={planning || !!primary?.busy}>
          <span className="aid-badge"><Settings size={16} /> PRIMARY DESIGN</span>
          {primary && kebab(primary, 0)}
          <div className="aid-primary-art" title={primary ? `${primary.name}: ${primary.description}` : undefined}>
            {!primary && planning ? <Loader overlay={false} title="Designing your kit…" subtitle="Four design directions from your brief and logos; the best becomes your primary design." steps={references.length ? ['Reading your brief and logos', 'Four design directions', 'Choosing the best', 'Rendering your designs'] : ['Reading your brief', 'Four design directions', 'Choosing the best', 'Rendering your designs']} seconds={isAi ? 30 : 3} />
              : primary ? art(primary, true)
              : <div className="aid-art-error" role="alert"><p>{error || 'No designs came back.'}</p>{lastBrief.current && <button type="button" className="button button-outline" onClick={() => { const b = lastBrief.current!; requireAuth(() => void generate(b.prompt, b.sport, b.garment)); }}><RefreshCw size={15} /> Try again</button>}</div>}
          </div>
          <div className="aid-primary-actions">
            <button type="button" className="button button-gradient" disabled={!primary || making3d || (isAi ? !primary.image : false)} onClick={() => { if (!primary) return; if (primary.image) requireAuth(() => void makeIt3d()); else customize(primary); }} title={making3d ? 'Drawing the print sheet: the 3D Designer opens by itself' : 'The same design drawn flat, front and back, then put on the live 3D kit'}>{making3d ? <LoaderCircle className="spin" size={18} /> : <Box size={18} />} {making3d ? 'Drawing the print sheet… about a minute' : <>Open in 3D Designer <ArrowRight size={18} /></>}</button>
            <button type="button" className="button button-outline" disabled={!primary?.image} onClick={() => primary && void download(primary, 1)}><Download size={18} /> Download</button>
          </div>
        </div>
        <div className="aid-option-list" role="list" aria-label="More designs">
          {[1, 2, 3].map(i => { const o = options[i]; return <div key={o?.id ?? i} className={`aid-option glow-panel${o?.busy && !o.image ? ' is-busy' : ''}`} role="listitem">
            <span className="aid-num" aria-hidden="true">{i + 1}</span>
            {o && kebab(o, i)}
            <button type="button" className="aid-option-art" disabled={!o || (!o.image && !!o.direction)} onClick={() => o && makePrimary(i)} aria-label={o ? `Design ${i + 1}: ${o.name}. Make primary` : `Design ${i + 1}`} title={o ? `${o.name}: ${o.description}` : undefined}>
              {o ? art(o, false) : <span className="aid-art-wait"><LoaderCircle className="spin" size={22} /></span>}
            </button>
          </div>; })}
        </div>
        <div className="aid-results-bar">{bar}{notes}</div>
      </div>
      {editingOption?.image && <ImageEditor src={editingOption.image} title={`Design ${editing! + 1} · ${editingOption.name}`} fileName={`3deezi-design-${editing! + 1}`} ai={isAi} requireAuth={requireAuth} onClose={() => setEditing(null)} onUse={image => { const id = editingOption.id; setOptions(list => list.map(x => x.id === id ? { ...x, image } : x)); setEditing(null); }} />}
    </section>;
  }

  return <section className={`aid-stage${dropping ? ' dropping' : ''}`} aria-labelledby="aid-title" {...stageProps}>
    {background}
    <div className="aid-inner">
      <img className="aid-logo" src={media('images/brand-final.png')} alt="3DEEZI" width={1712} height={272} />
      <p className="aid-tagline">AI SPORTSWEAR DESIGNER</p>
      <h1 id="aid-title" className="aid-heading">DESIGN WITHOUT LIMITS</h1>
      {bar}
      {notes}
      <div className="aid-options">{isAi
        ? <label className="aid-switch" title="Off: four designs as quick previews (about 40 seconds). On: your primary design is rendered in HD (about a minute, more credits). Any design can be made HD later from its ⋮ menu."><input type="checkbox" role="switch" checked={wantHd} onChange={e => setWantHd(e.target.checked)} /><i aria-hidden="true" />HD primary</label>
        : catalog && <span className="aid-note">Preview mode: AI is not connected on this server, so concepts are built from your wording.</span>}</div>
      <SportRow tiles={tiles} selected={tile} onSelect={id => { setTile(t => t === id ? null : id); setAskGarment(false); setPickedGarment(null); }} />
    </div>
  </section>;
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
  const open = () => { if (!result) return; onChange({ ...draft, id: undefined, version: undefined, name: result.name, sport: result.sport, garment: result.garment, mode: 'ai', design: { ...draft.design, ...result.design, patternImage: null, layout: null }, patternMotif: result.motif || undefined, pendingDrawing: undefined }); onStudio(); };
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
      const top = (['singlet', 'jersey', 'tee', 'polo', 'pocketpolo'].includes(draft.garment) ? draft.garment : 'singlet') as Design['garment'];
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
