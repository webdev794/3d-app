import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUp, Box, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Ellipsis, ImagePlus, ImageUp, Lightbulb, LoaderCircle, Mic, MicOff, Paperclip, PenLine, Plus, RefreshCw, SendHorizontal, Sparkles, Undo2, WandSparkles, X } from 'lucide-react';
import { api, ApiError, media, saveBlob, type Catalog, type CatalogItem, type Concept, type GarmentTile, type Project } from '../api';
import type { Draft } from '../App';
import { defaultDesign, type Design } from '../types';
import { DesignThumbnail } from './Library';
import Loader from '../components/Loader';
import ImageEditor from '../components/ImageEditor';
import { CategoryIcon } from '../components/GarmentIcon';
import { allGarments, formatCount, friendlyError, garmentChips, garmentInBrief, garmentLabels, MAX_BRIEF, sportInBrief, SportRow, sportTiles, useVoice, type GarmentChip } from '../components/AiStage';
import { ResultsViewer } from '../components/ResultsViewer';
import { preparePattern } from '../components/OwnPatterns';
import { PlayerShotButton } from '../components/PlayerShot';
import { RecentDesigns, writeLocalSession, type AiSessionFull, type AiSessionOption, type AiSessionSummary, type LocalAiSession } from '../components/RecentDesigns';
import '../../css/ai-designer.css';

export const kitArt = (sport: string) => media(`showroom/kit-${sport}.webp`);
export const garmentArt = (garment: string) => media(`showroom/garment-${garment}.webp`);
/** Shown in the garment step and the studio; not yet available in 3D. */
export const comingSoon = [{ id: 'shoes', name: 'Shoes', description: 'Boots in your colours.' }];
const garmentOrder = ['fullkit', 'jersey', 'nfljersey', 'compression', 'shooting-shirt', 'shorts', 'tee', 'singlet', 'netball-dress', 'polo', 'pocketpolo', 'hoodie', 'ziphoodie', 'trackjacket', 'varsity', 'socks', 'cap', 'bucket-hat', 'skirt'];
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

/** A tile's picture (media/showroom/garment-<image>.webp); a missing one falls back to its 3D garment's, then the jersey's. */
const tileArt = (t: GarmentTile) => garmentArt(t.image || t.garment || 'jersey');
/**
 * A sport's garment tiles (task 9.99, config/catalog.php `tiles`): its own names on our 3D garments. An older server
 * without them gets one tile per garment the sport lists (or every garment).
 */
export function sportGarmentTiles(sport: CatalogItem | undefined, garments: CatalogItem[] = []): GarmentTile[] {
  if (sport?.tiles?.length) return sport.tiles;
  const ids = sport?.garments?.length ? sport.garments : [...garments].sort((a, b) => order(a.id) - order(b.id)).map(g => g.id);
  return ids.flatMap(id => { const g = garments.find(x => x.id === id); return g ? [{ name: g.name, description: g.description, garment: g.id, fit: 'exact' as const, image: g.id }] : []; });
}
/** "More teamwear": every other 3D garment, by its own name (the sport's tiles already show theirs). */
export function moreGarmentTiles(sport: CatalogItem | undefined, garments: CatalogItem[] = []): GarmentTile[] {
  const used = new Set(sportGarmentTiles(sport, garments).map(t => t.garment));
  return [...garments].sort((a, b) => order(a.id) - order(b.id)).filter(g => !used.has(g.id)).map(g => ({ name: g.name, description: g.description, garment: g.id, fit: 'exact' as const, image: g.id }));
}
/** The garment's name for a design: the sport tile it was chosen as ("Netball dress"), else the 3D garment's name. */
export function productName(design: Pick<Design, 'garment' | 'productName'>, catalog?: Catalog | null): string {
  return design.productName || catalog?.garments.find(g => g.id === design.garment)?.name || design.garment;
}
/**
 * The back name and number when a kit's sport changes (client 2026-10-26: "netball you don't have numbers or names"),
 * from the catalogue's rules ('names' / 'numbers' false): a sport without them drops the sample ones (anything typed
 * stays), and leaving such a sport gives an empty back the sample name and number again. Other sports keep theirs.
 */
export function backForSport(design: Pick<Design, 'backName' | 'number' | 'logoText'>, catalog: Catalog | null | undefined, from: string, to: string): Pick<Design, 'backName' | 'number'> {
  const was = catalog?.sports.find(s => s.id === from), now = catalog?.sports.find(s => s.id === to);
  let backName = design.backName ?? '', number = design.number ?? '';
  if (now?.names === false && (backName === defaultDesign.backName || backName === design.logoText)) backName = '';
  if (now?.numbers === false && number === defaultDesign.number) number = '';
  if (now && now.names !== false && was?.names === false && !backName) backName = defaultDesign.backName ?? '';
  if (now && now.numbers !== false && was?.numbers === false && !number) number = defaultDesign.number;
  return { backName, number };
}
/** What choosing a tile puts on the draft: the 3D garment, the tile's name (empty for a plain 3D garment) and its settings. */
export type GarmentChoice = { garment: string; productName: string; design?: GarmentTile['design'] };
/** A garment tile's starting look (task 9.154) brings its number's colour and look: kept marks stay, the number's own go. */
export function tileMarks(was: Design, tile?: Partial<Design>): Partial<Design> {
  if (!tile?.marks) return {};
  const { top_number: _n, top_frontNumber: _f, ...rest } = was.marks ?? {};
  // Marks a bib tile hid (team name, crest, name) show again.
  const kept = Object.fromEntries(Object.entries(rest).filter(([key, m]) => !(['top_wordmark', 'top_crest', 'top_name'].includes(key) && m?.hidden)));
  // The picture's own objects (ids 'tile-…': position letters, the sleeve number) replace the last tile's.
  const layers = [...(was.layers ?? []).filter(l => !l.id.startsWith('tile-')), ...(tile.layers ?? [])];
  return { marks: { ...kept, ...(Array.isArray(tile.marks) ? {} : tile.marks) }, layers };
}
/**
 * Another 3D garment from the Studio's garment rail or Garment panel (client 2026-10-29) opens looking like its picture
 * there (garment-<id>.webp), so what is clicked is what opens, as its Design Your Own tile: the look of a tile with that
 * picture (the sport's own first); a picture no tile shows takes the sport's first tile of that garment, else any sport's.
 * What it puts on the design, as choosing the tile does (own uploads and text stay); undefined when there is none.
 */
export function garmentLook(catalog: Catalog | null | undefined, sport: string, garment: string, was: Design): Partial<Design> | undefined {
  const sports = catalog?.sports ?? [];
  const tiles = [...sports.filter(s => s.id === sport), ...sports.filter(s => s.id !== sport)].flatMap(s => s.tiles ?? []).filter(t => t.garment === garment);
  const tile = tiles.find(t => t.image === garment) ?? tiles[0];
  if (!tile) return undefined;
  const design = { trackStyle: undefined, ...tile.design };
  return { ...design, ...tileMarks(was, design) };
}

/**
 * Step 2 (client visuals images/157.jpg and 160.jpg): "<SPORT> UNIFORMS & TEAMWEAR", the sport's own garment tiles (rows of
 * four, a shorter last row centred) and "More teamwear" for every other 3D garment. A tile without a 3D model of its own
 * says which garment the 3D preview uses; one with none close enough is COMING SOON and cannot be chosen.
 */
export function GarmentSelection({ catalog, draft, onSelect, onNext, onBack }: { catalog: Catalog | null; draft: Draft; onSelect: (choice: GarmentChoice) => void; onNext: () => void; onBack: () => void }) {
  const sport = catalog?.sports.find(s => s.id === draft.sport);
  const all = catalog?.garments ?? [];
  const tiles = sportGarmentTiles(sport, all);
  const extra = sport?.more === false ? [] : moreGarmentTiles(sport, all);
  const chosen = draft.design.productName;
  /** The tile chosen: by its name; a plain 3D garment from "More teamwear" has an empty name. */
  const current = (chosen ? tiles.find(t => t.name === chosen && t.garment === draft.garment) : undefined)
    ?? (chosen === '' ? extra.find(t => t.garment === draft.garment) : undefined);
  const [showMore, setShowMore] = useState(() => !!current && extra.includes(current));
  // A tile's own settings, and none left from another tile: a plain track jacket after the Hooded Tracksuit kept the
  // hood (QA U); without a style it is the plain (collar) track jacket, as when it is chosen first.
  const pick = (t: GarmentTile, plain = false) => { if (t.garment) onSelect({ garment: t.garment, productName: plain ? '' : t.name, design: { trackStyle: undefined, ...t.design } }); };
  // A new sport (or a garment left from another one) starts on the sport's first garment.
  useEffect(() => { if (catalog && !current) { const first = tiles.find(t => t.fit !== 'soon'); if (first) pick(first); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, draft.sport]);
  const title = sport?.heading ?? sport?.name ?? 'your sport';
  // Per-sport display settings (config/catalog.php): names only, own subtitle, a hint line and an own background.
  const described = sport?.descriptions !== false;
  const subtitle = sport?.subtitle || `Choose what you want to design for ${title}.`;
  const backdrop = sport?.backdrop || 'stadium-stage';
  const tile = (t: GarmentTile, plain = false) => {
    const soon = t.fit === 'soon' || !t.garment, selected = !soon && current === t;
    const uses = t.fit === 'nearest' ? all.find(g => g.id === t.garment)?.name : undefined;
    const body = <>
      {selected && <span className="tile-check"><Check size={14} /></span>}
      {soon && <span className="soon-badge">COMING SOON</span>}
      <img src={tileArt(t)} className={t.image && t.image !== t.garment ? 'tile-photo' : undefined} alt="" loading="lazy" decoding="async" onError={e => { const fallback = garmentArt(t.garment ?? 'jersey'); if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback; }} />
      <strong>{t.name}</strong>{described && <small>{t.description}</small>}
      {uses && described && <em className="tile-note">3D preview uses {uses.toLowerCase()}</em>}
    </>;
    // Names only: the description (and which 3D garment the preview uses) moves to the tooltip.
    const tip = described ? undefined : [t.description, uses && `3D preview uses ${uses.toLowerCase()}`, soon && 'Coming soon'].filter(Boolean).join(' · ');
    return soon ? <div key={t.name} className="garment-tile soon" aria-disabled="true" data-tile={t.name} title={tip}>{body}</div>
      : <button key={`${plain ? 'more' : 'tile'}-${t.name}`} type="button" className={`garment-tile${selected ? ' selected' : ''}`} onClick={() => pick(t, plain)} onDoubleClick={onNext} aria-pressed={selected} data-tile={t.name} title={tip}>{body}</button>;
  };
  return <section className={`showroom garment-step${described ? '' : ' names-only'}`} data-sport={sport?.id}>
    <div className={`showroom-bg dim${backdrop !== 'stadium-stage' ? ' own-backdrop' : ''}`} style={{ backgroundImage: `url(${media(`showroom/${backdrop}.webp`)})` }} />
    <div className="glow-panel garment-panel">
      <div className="step-heading"><span className="step-number">2</span><div><h1>{sport ? `${title} ${sport.group === 'apparel' ? 'teamwear' : 'uniforms & teamwear'}` : 'Select garment'}</h1><p>{subtitle}</p></div></div>
      {!catalog ? <div className="empty-state"><LoaderCircle className="spin" /> Loading garments…</div> : <>
        <div className="garment-tiles" role="group" aria-label={`${title} garments`}>{tiles.map(t => tile(t))}</div>
        {extra.length > 0 && <button type="button" className="garment-more" aria-expanded={showMore} aria-controls="garment-more-tiles" onClick={() => setShowMore(v => !v)}>{showMore ? 'Less teamwear' : 'More teamwear'} <ChevronRight size={16} className={showMore ? 'is-open' : ''} /></button>}
        {showMore && extra.length > 0 && <div id="garment-more-tiles" className="garment-tiles garment-tiles-more" role="group" aria-label="More teamwear">{extra.map(t => tile(t, true))}</div>}
      </>}
      <div className="garment-actions"><button className="button button-outline" onClick={onBack}><ArrowLeft size={18} /> Change sport</button>{sport?.select_hint && <p className="garment-hint">{sport.select_hint}</p>}<button className="button button-gradient" disabled={!catalog || !current} onClick={onNext}>Continue to studio <ArrowRight size={19} /></button></div>
    </div>
  </section>;
}

/**
 * An AI reply checked before it is used: one without what it promised (no `data`, no picture: a proxy page, a cut-off
 * reply) throws inside the caller's try, so the usual friendly error shows ("The AI designer is busy or unavailable…",
 * with Try again) instead of a blank page (a missing picture read inside a state update unmounted the whole page).
 */
/** The 3D garments a design picture (print sheet) goes on as drawn. */
const drawnGarments = ['singlet', 'netball-dress', 'jersey', 'nfljersey', 'tee', 'polo', 'pocketpolo'];
/** An AI picture read for the 3D kit (POST /ai/designs/read, task 9.116). */
type DesignReading = { garment: string; seen: string; exact: boolean; hood: boolean; motif: string | null; crest: { x: number; y: number; w: number; h: number } | null; print?: { x: number; y: number; w: number; h: number } | null; design: Partial<Design> };
/** The viewer's mark for a full-colour print patch (viewer texture.js PRINT_MARK): two exact pixels at its top left. */
const PRINT_MARK = [[3, 222, 177], [17, 61, 233]];
/**
 * A patch of the AI picture's own print (`box` in fractions of it, a little inside its edges), as a marked PNG the 3D
 * kit lays all over the body (task 9.126), with its repeat size in metres.
 */
export async function cropPrint(src: string, box: { x: number; y: number; w: number; h: number }): Promise<{ image: string; scale: number } | null> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight, inset = 0.08;
  const x0 = (box.x + box.w * inset) * W, y0 = (box.y + box.h * inset) * H, w = box.w * (1 - 2 * inset) * W, h = box.h * (1 - 2 * inset) * H;
  if (w < 24 || h < 24) return null;
  const k = Math.min(1, 512 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
  const g = canvas.getContext('2d')!;
  g.drawImage(img, x0, y0, w, h, 0, 0, canvas.width, canvas.height);
  const mark = g.createImageData(2, 1);
  PRINT_MARK.forEach(([r, gr, b], i) => mark.data.set([r, gr, b, 255], i * 4));
  g.putImageData(mark, 0, 0);
  // About 1.3 m of garment across the whole picture (a front and back side by side): the patch's own size on the kit.
  return { image: canvas.toDataURL('image/png'), scale: Math.min(0.6, Math.max(0.15, box.w * (1 - 2 * inset) * 1.6)) };
}
/** The club symbol cut from the AI picture (`box` in fractions of it, with a little margin), as a small PNG for the chest. */
export async function cropCrest(src: string, box: { x: number; y: number; w: number; h: number }): Promise<string | null> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight, pad = 0.12;
  const x0 = Math.max(0, (box.x - box.w * pad) * W), y0 = Math.max(0, (box.y - box.h * pad) * H);
  const x1 = Math.min(W, (box.x + box.w * (1 + pad)) * W), y1 = Math.min(H, (box.y + box.h * (1 + pad)) * H);
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;
  const k = Math.min(1, 320 / Math.max(x1 - x0, y1 - y0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((x1 - x0) * k); canvas.height = Math.round((y1 - y0) * k);
  canvas.getContext('2d')!.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
export function aiReply<T extends object>(reply: T | null | undefined, keys: (keyof T)[], message = ''): T {
  if (!reply || typeof reply !== 'object' || keys.some(k => reply[k] == null || reply[k] === '')) throw new ApiError(message, 502);
  return reply;
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
type DesignOption = { id: string; rank: number; name: string; description: string; design: Design; motif?: string; direction?: Record<string, unknown>; image?: string | null; quality?: 'high' | 'medium'; pending?: 'high' | 'medium' | 'refine'; busy: boolean; error?: string; view?: View; previous?: string };
/** A design picture as a data URL (pictures can be blob: URLs after an edit). */
const asData = async (src: string) => src.startsWith('data:image/') ? src : new Promise<string>((resolve, reject) => { void fetch(src).then(r => r.blob()).then(b => { const f = new FileReader(); f.onload = () => resolve(String(f.result)); f.onerror = reject; f.readAsDataURL(b); }, reject); });
/** presentation: front and back side by side in one tall 2:3 picture (all four designs and Make HD, 146.jpg; landscape if the model turns the size down); front: one garment, square (the old option cards). */
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
export function AiDesigner({ catalog, draft, onChange, requireAuth, onStudio, onNotice, signedIn = false, checking = false, onOpenProject }: { catalog: Catalog | null; draft: Draft; onChange: (draft: Draft) => void; requireAuth: (action?: () => void) => void; onStudio: () => void; onNotice?: (text: string) => void; /** Recent designs: the account's saved briefs (signed in) or the last one on this device. */ signedIn?: boolean; checking?: boolean; onOpenProject?: (project: Project) => void }) {
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
  /** The design shown large (client visual 146.jpg): tapping a thumbnail selects it; nothing is rendered again. */
  const [sel, setSel] = useState(0);
  /** "Refine this design…": the slim bar, expanded while typing (the original brief shows under it); its text is kept. */
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineText, setRefineText] = useState('');
  const controls = useRef<HTMLDivElement>(null);
  const lastBrief = useRef<BriefBody | null>(null);
  const [making3d, setMaking3d] = useState(false);
  const [dropping, setDropping] = useState(false);
  /** The sports tile chosen (optional), the garment chips (only when the brief names no garment) and the (+) menu. */
  const [tile, setTile] = useState<string | null>(null);
  const [askGarment, setAskGarment] = useState(false);
  const [pickedGarment, setPickedGarment] = useState<GarmentChip | null>(null);
  /** The garment's name for the last brief (a chip such as "Netball dress"), for Try again. */
  const lastProduct = useRef<GarmentChip | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  /** A friendly note that is not an error (a long paste was shortened). */
  const [note, setNote] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const plus = useRef<HTMLDivElement>(null);
  /** This brief's run: a new brief, Refine and leaving the page end it, so a late mockup or print sheet is dropped. */
  const run = useRef(0);
  useEffect(() => () => { run.current += 1; }, []);
  /** Recent designs: this brief's saved session (its id and the pictures last sent, by place); a new brief or reopening another starts over. */
  const session = useRef<{ token: number; id: number | null; sent: string[] }>({ token: 0, id: null, sent: [] });
  const saving = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef<DesignOption[]>([]);
  latest.current = options;
  const isAi = !!catalog?.provider.is_ai;
  const voice = useVoice(prompt, setPrompt, setError);
  const tiles = sportTiles(catalog?.sports);
  const chosen = tiles.find(t => t.id === tile);
  const atBrief = !results;
  /** The selected design (the PRIMARY until another is chosen): Open in 3D Designer, Download, Refine and ⋯ act on it. */
  const primary = options[sel] ?? options[0];

  // The bar grows with the text (about seven lines, then it scrolls); the column around it stays centred.
  useEffect(() => { const el = field.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 196)}px`; }, [prompt, atBrief, refineOpen]);
  // Ready to type on computers (not on phones, where it would open the keyboard over the page).
  useEffect(() => { if (atBrief && matchMedia('(pointer: fine)').matches) field.current?.focus({ preventScroll: true }); }, [atBrief]);
  useEffect(() => {
    if (!refineOpen) return;
    const away = (e: PointerEvent) => { const t = e.target as Element | null; if (t?.isConnected && !controls.current?.contains(t) && !t.closest?.('dialog, .aid-full')) setRefineOpen(false); };
    // Esc closes an open menu (the (+) menu, ⋯) first; only then the expanded bar.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open], .aid-full, .aid-menu')) setRefineOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [refineOpen]);
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
  function submit(garmentChoice?: GarmentChip) {
    voice.stop();
    const text = prompt.trim();
    if (!text && !references.length) { setError('Describe your design: the garment, colours, style or your team name.'); field.current?.focus(); return; }
    if (text.length < 10 && !references.length) { setError('Tell us a little more: colours, style or your team name (at least 10 characters).'); field.current?.focus(); return; }
    const sport = chosen ?? sportInBrief(text, tiles);
    // A garment picked for an earlier brief only when this sport offers it (Fishing has no shorts).
    const named = garmentInBrief(text);
    const choice: GarmentChip | null = garmentChoice ?? (named ? { garment: named, name: '' } : null) ?? (pickedGarment && (sport?.garments ?? allGarments).includes(pickedGarment.garment) ? pickedGarment : null);
    if (!choice) { setError(''); setAskGarment(true); return; }
    if (garmentChoice) setPickedGarment(garmentChoice);
    setAskGarment(false); setError(''); setNote('');
    let brief = text.length >= 10 ? text : `Create a design from my attached artwork. ${text}`.trim();
    if (sport?.brief && !brief.toLowerCase().includes(sport.brief.split(' ')[0].toLowerCase())) brief = `${sport.brief}: ${brief}`;
    requireAuth(() => void generate(brief, sport?.sport ?? draft.sport, choice.garment, choice));
  }
  async function generate(brief: string, sport: string, garment: string, chip: GarmentChip | null = null) {
    lastProduct.current = chip;
    const product = chip?.garment === garment ? { productName: chip.name, ...chip.design } : { productName: '' };
    const mine = ++run.current, current = () => run.current === mine;
    session.current = { token: session.current.token + 1, id: null, sent: [] };
    setResults(true); setPlanning(true); setOptions([]); setSel(0); setMenu(null); setEditing(null); setMaking3d(false); setRefineOpen(false); setError('');
    onChange({ ...draft, sport, garment, mode: 'ai', design: { ...draft.design, ...product, garment: garment as Design['garment'] }, patternMotif: undefined, pendingDrawing: undefined });
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
        const result = aiReply(await api<{ concepts: Concept[] }>('/concepts', { method: 'POST', body: JSON.stringify(body) }), ['concepts']);
        if (current()) setOptions(result.concepts.map((c, i) => ({ ...c, rank: i + 1, busy: false })));
        return;
      }
      // Fast like ChatGPT (client 2026-10-21): the PRIMARY (the brief as written) starts rendering at once, while one short
      // planning call gives its 3D kit spec and three ranked alternatives; then the options render, all in parallel on a
      // normal server (the local one answers one request at a time). Results from an older brief are dropped.
      const first: DesignOption = { id: `primary-${mine}`, rank: 1, name: 'Your design', description: 'Your brief, exactly as written.', design: { ...draft.design, ...product, garment: garment as Design['garment'] }, direction: { ownDesign: false }, image: null, busy: true };
      setOptions([first]);
      void render(first, wantHd ? 'high' : 'medium', mine, 'presentation');
      const plan = aiReply(await api<{ directions: DesignOption[] }>('/ai/designs', { method: 'POST', body: JSON.stringify(body) }), ['directions']);
      if (!current()) return;
      const [spec, ...rest] = plan.directions;
      const alternatives = rest.map(d => ({ ...d, image: null, busy: true }));
      // The primary keeps its picture (or its render still running) and takes the plan's name and 3D kit spec.
      setOptions(list => [...list.map(o => o.id === first.id && spec ? { ...o, name: spec.name, description: spec.description, design: spec.design, motif: spec.motif } : o), ...alternatives]);
      for (const o of alternatives) void render(o, 'medium', mine, 'presentation');
    } catch (e) { if (current()) setError(friendlyError(e)); } finally { if (current()) setPlanning(false); }
  }
  /** Renders one design (the PRIMARY in HD, an option as a medium preview, "Make HD" or "Regenerate"); its card fills in when it arrives. */
  async function render(option: DesignOption, quality: 'high' | 'medium', mine = run.current, view: View = option.view ?? 'presentation') {
    const body = lastBrief.current, current = () => run.current === mine;
    if (!body || !option.direction) return;
    setOptions(list => list.map(x => x.id === option.id ? { ...x, busy: true, pending: quality, view, error: undefined } : x));
    try {
      const r = aiReply(await api<{ image: string; quality: 'high' | 'medium'; view?: View }>('/ai/designs/render', { method: 'POST', body: JSON.stringify({ ...body, rank: option.rank, quality, view, direction: option.direction, name: option.name }) }), ['image']);
      if (current()) setOptions(list => list.map(x => x.id === option.id ? { ...x, busy: false, image: r.image, quality: r.quality, view: r.view ?? view } : x));
    } catch (e) { if (current()) setOptions(list => list.map(x => x.id === option.id ? { ...x, busy: false, error: friendlyError(e) } : x)); }
  }
  /** A thumbnail tapped: that design goes large and the one shown moves into the thumbnails; each keeps its picture and edits (nothing is rendered or charged). */
  const select = (index: number) => { setMenu(null); setSel(index); };
  /** The selected picture alone (the thumbnails are page elements, never part of the file). */
  const download = async (o: DesignOption, n: number) => { setMenu(null); if (o.image) saveBlob(await (await fetch(o.image)).blob(), `3deezi-design-${n}${o.quality === 'high' ? '-hd' : ''}.jpg`); };
  /** "Back to create": the brief step with the brief, pictures, sport and switches kept; work still running is dropped. */
  const backToCreate = () => { run.current += 1; setResults(false); setPlanning(false); setOptions([]); setSel(0); setMenu(null); setEditing(null); setMaking3d(false); setRefineOpen(false); setError(''); };

  // Recent designs (client 2026-10-30): once a brief's designs are in (and after Make HD, Regenerate, Refine or Edit image),
  // they are saved to the account (only the pictures that changed are sent) and the last brief is kept on this device.
  const ready = results && !planning && options.length > 0 && options.every(o => !o.busy) && options.some(o => o.image);
  const pictures = ready ? options.flatMap(o => o.image ? [o.image] : []).join('\n') : '';
  useEffect(() => {
    if (!pictures || !lastBrief.current) return;
    const brief = lastBrief.current, token = session.current.token;
    const timer = setTimeout(() => {
      const list = latest.current.filter(o => o.image && !o.busy);
      const keep = (o: DesignOption): Omit<AiSessionOption, 'image'> => ({ name: o.name, description: o.description, quality: o.quality ?? null, view: o.view ?? null, motif: o.motif ?? null, direction: o.direction ?? null, design: o.design as unknown as Record<string, unknown> });
      void writeLocalSession({ prompt: brief.prompt, sport: brief.sport, garment: brief.garment, at: new Date().toISOString(), options: list.map(o => ({ ...keep(o), image: o.image! })) });
      if (!signedIn) return;
      saving.current = saving.current.then(async () => {
        const now = session.current;
        // Reopened and unchanged: nothing to send (the list keeps its order).
        if (now.token !== token || (now.id && list.length === now.sent.length && list.every((o, i) => o.image === now.sent[i]))) return;
        try {
          const images = await Promise.all(list.map(o => asData(o.image!)));
          const body = { prompt: brief.prompt, sport: brief.sport, garment: brief.garment, source: 'web', reference_ids: brief.reference_ids, options: list.map((o, i) => ({ ...keep(o), ...(now.id && now.sent[i] === o.image ? {} : { image: images[i] }) })) };
          const saved = await api<AiSessionSummary>(now.id ? `/ai/sessions/${now.id}` : '/ai/sessions', { method: now.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
          if (session.current.token === token) session.current = { token, id: saved.id, sent: list.map(o => o.image!) };
        } catch { /* Recent designs are a convenience: the designs on screen are unaffected. */ }
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [pictures, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A Recent designs card: YOUR DESIGNS again with that brief's designs, ready to switch, refine, open in 3D or put on a player (no AI call). */
  async function reopen(id: number) {
    const mine = ++run.current;
    session.current = { token: session.current.token + 1, id: null, sent: [] };
    setResults(true); setPlanning(true); setOptions([]); setSel(0); setMenu(null); setEditing(null); setMaking3d(false); setRefineOpen(false); setError('');
    try {
      const s = await api<AiSessionFull>(`/ai/sessions/${id}`);
      if (run.current === mine) showSession(s, id);
    } catch (e) { if (run.current === mine) { setError(friendlyError(e)); setPlanning(false); } }
  }
  function showSession(s: Pick<AiSessionFull, 'prompt' | 'sport' | 'garment' | 'reference_ids' | 'options'>, id: number | null) {
    const pick = (list: CatalogItem[] | undefined, v: string | null | undefined) => { const t = String(v ?? '').toLowerCase(); return list?.find(x => x.id === v || x.name.toLowerCase() === t || x.id === t.replace(/\s+/g, '-'))?.id; };
    const sport = pick(catalog?.sports, s.sport) ?? draft.sport, garment = pick(catalog?.garments, s.garment) ?? draft.garment;
    onChange({ ...draft, sport, garment, mode: 'ai', design: { ...draft.design, garment: garment as Design['garment'] }, patternMotif: undefined, pendingDrawing: undefined });
    lastBrief.current = { prompt: s.prompt, sport, garment, reference_ids: s.reference_ids ?? [] };
    lastProduct.current = null;
    setPrompt(s.prompt);
    const list = s.options.filter(o => o.image).map((o, i): DesignOption => {
      // An app session keeps its colours in the app's spec.
      const spec = (o.spec ?? {}) as Record<string, string | undefined>;
      const fromApp: Partial<Design> = o.design ? {} : { ...(spec.mainColor && { main: spec.mainColor }), ...(spec.secondaryColor && { secondary: spec.secondaryColor }), ...(spec.accentColor && { accent: spec.accentColor }), ...(spec.logoText && { logoText: spec.logoText }) };
      const own = (o.design ?? {}) as Partial<Design>;
      return { id: `s${id ?? 'device'}-${i}`, rank: i + 1, name: o.name || `Design ${i + 1}`, description: o.description || '', design: { ...draft.design, ...fromApp, ...own, garment: garment as Design['garment'] }, motif: o.motif ?? undefined, direction: o.direction ?? undefined, image: o.image, quality: o.quality ?? 'medium', view: o.view ?? 'presentation', busy: false };
    });
    session.current = { token: session.current.token, id, sent: id ? list.map(o => o.image!) : [] };
    setOptions(list); setSel(0); setPlanning(false);
    if (!list.length) setError('The pictures of this design are no longer saved.');
  }
  /** The last brief on this device (signed out). */
  function reopenLocal(s: LocalAiSession) {
    run.current += 1;
    session.current = { token: session.current.token + 1, id: null, sent: [] };
    setResults(true); setMenu(null); setEditing(null); setMaking3d(false); setRefineOpen(false); setError('');
    showSession({ ...s, reference_ids: [] }, null);
  }
  /** "Refine this design…": the selected picture changed as described by the AI image editor (the same as Edit image › Describe), in its own proportions. */
  function refine() {
    const o = primary, text = refineText.trim();
    if (!o?.image || o.busy) return;
    if (text.length < 3) { setError('Describe the change: for example “make the collar gold” or “add the number 7 on the back”.'); return; }
    if (!isAi) { setError('Refining a design needs AI to be connected on the server.'); return; }
    requireAuth(async () => {
      const mine = run.current, current = () => run.current === mine, id = o.id, before = o.image!;
      setError(''); setRefineOpen(false);
      setOptions(list => list.map(x => x.id === id ? { ...x, busy: true, pending: 'refine' } : x));
      try {
        const image = before.startsWith('data:image/') ? before : await new Promise<string>((resolve, reject) => { void fetch(before).then(r => r.blob()).then(b => { const f = new FileReader(); f.onload = () => resolve(String(f.result)); f.onerror = reject; f.readAsDataURL(b); }, reject); });
        const r = aiReply(await api<{ image: string }>('/ai/image-edit', { method: 'POST', body: JSON.stringify({ image, instruction: text }) }), ['image']); // no size: the server keeps the picture's own proportions
        if (!current()) return;
        setOptions(list => list.map(x => x.id === id ? { ...x, busy: false, image: r.image, previous: before } : x));
        setRefineText('');
      } catch (e) {
        if (!current()) return;
        setOptions(list => list.map(x => x.id === id ? { ...x, busy: false } : x));
        setError(`Refine: ${friendlyError(e)}`);
      }
    });
  }
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
  /** The garment's name chosen with the brief ("Netball dress") stays with the design while it is the same 3D garment. */
  // …and so does the chip's own setting (the hooded tracksuit's hood): the AI's plan does not know it (a "Hooded Tracksuit"
  // otherwise opened in the Studio as a collar track jacket).
  const named = (design: Design): Design => design.garment === draft.design.garment
    ? { ...design, ...(lastProduct.current?.garment === design.garment ? lastProduct.current.design : undefined), productName: draft.design.productName }
    : { ...design, productName: undefined };
  // A new kit, as MAKE IT 3D and Convert open it: the draft can still hold a project opened earlier (the Studio's
  // "New AI design"), and its Save must not overwrite that project with this design (QA U).
  const customize = (concept: Pick<Concept, 'name' | 'design' | 'motif'>) => { if (making3d) return; onChange({ ...draft, id: undefined, version: undefined, name: concept.name, design: named(concept.design), mode: 'ai', patternMotif: concept.motif, pendingDrawing: undefined }); onStudio(); };
  /**
   * "Open in 3D Designer" (task 9.116): the PRIMARY picture read first (one cheap AI call) for the nearest 3D garment we
   * have and its own colours, pattern, team name and lettering (netball: the position letters), with its club symbol
   * cut from the picture when no logo was attached. A singlet, jersey, tee or polo then takes the picture itself: the
   * same AI redraws it as a flat front and back print sheet, put on the kit like a design picture. Other garments (and
   * any step that fails) open in the picture's colours. Never a refusal: the closest garment, with a note saying so.
   */
  async function makeIt3d() {
    const image = primary?.image;
    if (!image || !primary) return;
    const mine = run.current, current = () => run.current === mine;
    setMaking3d(true); setError('');
    try {
      const read = await api<DesignReading>('/ai/designs/read', { method: 'POST', body: JSON.stringify({ image, sport: draft.sport, garment: draft.garment }) })
        .then(r => r && typeof r.garment === 'string' && r.design ? r : null, () => null);
      if (!current()) return;
      const garment = (read?.garment ?? draft.garment) as Design['garment'];
      const attached = primary.design.logoImage || references.find(r => r.preview.startsWith('data:image/'))?.preview || null;
      const logo = attached || (read?.crest ? await cropCrest(image, read.crest).catch(() => null) : null);
      // The picture's own print on the body (no generic pattern when the picture shows one).
      const print = read?.print ? await cropPrint(image, read.print).catch(() => null) : null;
      if (!current()) return;
      const shown = catalog?.garments.find(g => g.id === garment)?.name ?? garment;
      const note = read && !read.exact ? `Shown on our ${shown.toLowerCase()}: the closest 3D garment to your ${read.seen || 'design'}.` : '';
      const design: Design = { ...primary.design, ...(read?.design ?? {}), garment, layout: null, logoImage: logo ?? primary.design.logoImage ?? null, ...(print ? { patternImage: print.image, patternScale: print.scale } : {}) };
      // In the picture's colours (no print sheet): the other garments, and the fallback when the print sheet fails.
      const inColours = (why: string) => {
        onChange({ ...draft, id: undefined, version: undefined, garment, name: primary.name || draft.name, mode: 'ai', design: named(design), patternMotif: print ? undefined : read?.motif ?? primary.motif, pendingDrawing: undefined });
        onStudio();
        onNotice?.([note, why].filter(Boolean).join(' '));
      };
      if (!drawnGarments.includes(garment)) { inColours(note ? 'It takes your design’s colours, pattern, symbol and lettering.' : `Your ${shown.toLowerCase()} takes your design’s colours, pattern, symbol and lettering.`); return; }
      let sheet: { asset: { id: number; name: string }; image: string };
      try {
        sheet = aiReply(await api<{ asset: { id: number; name: string }; image: string }>('/ai/print-sheet', { method: 'POST', body: JSON.stringify({ image, sport: draft.sport, garment, reference_ids: references.flatMap(r => r.id ? [r.id] : []), name: primary?.name ?? '', front_only: primary?.view === 'front' }) }), ['asset', 'image']);
      } catch (e) {
        if (current()) inColours(`The flat print sheet could not be drawn (${friendlyError(e)}), so the kit takes your design’s colours, pattern, symbol and lettering.`);
        return;
      }
      // Refine or another page meanwhile: the user stays where they went (the print sheet is kept in Assets).
      if (current()) putDrawing({ id: sheet.asset.id, name: sheet.asset.name, preview: sheet.image }, design, note);
    } finally { if (current()) setMaking3d(false); }
  }
  /**
   * The print sheet on the 3D kit (no AI): the Studio checks it on the garment the picture was read as, then puts it on
   * exactly as drawn; the read design (colours, symbol, lettering) stays underneath if the check is cancelled or fails.
   */
  const putDrawing = (picture: Reference, read?: Design, note = '') => { if (!picture.id) return; const top = (drawnGarments.includes(read?.garment ?? draft.garment) ? read?.garment ?? draft.garment : 'singlet') as Design['garment']; onChange({ ...draft, id: undefined, version: undefined, name: draft.name === 'Untitled kit' ? 'My design' : draft.name, garment: top, mode: 'ai', design: named({ ...(read ?? primary?.design ?? draft.design), garment: top, layout: null }), patternMotif: undefined, pendingDrawing: { asset: picture.id, name: picture.name, known: !!read, note: note || undefined } }); onStudio(); };

  const full = references.length >= MAX_REFERENCES;
  const garmentChoices = garmentChips(chosen ?? sportInBrief(prompt, tiles));
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
      {askGarment && <div className="aid-ask" role="group" aria-label="Choose the garment"><span>What are we designing{chosen ? ` for ${chosen.label}` : ''}?</span>{garmentChoices.map(g => <button key={`${g.garment}-${g.name}`} type="button" onClick={() => submit(g)}>{g.name || garmentLabels[g.garment] || g.garment}</button>)}</div>}
      {error && <p className="aid-error" role="alert">{error}</p>}
      {note && !error && <p className="aid-info" role="status">{note}</p>}
  </>;

  if (results) {
    /** The ⋯ menu on the large design (client visual 146.jpg keeps the page to one big picture and two buttons): Make HD, Regenerate, Edit image, Undo refine, Customise in 3D Studio, your pictures on the kit. */
    const kebab = (o: DesignOption, index: number) => <div className="aid-kebab-wrap">
      <button type="button" className="aid-round aid-kebab" aria-haspopup="menu" aria-expanded={menu === index} aria-label={`Design ${index + 1} actions`} title="More: Make HD, Regenerate, Edit image…" onClick={() => setMenu(m => m === index ? null : index)}><Ellipsis size={18} /></button>
      {menu === index && <div className="aid-menu aid-kebab-menu" role="menu">
        {isAi && o.direction && o.quality !== 'high' && <button type="button" role="menuitem" disabled={o.busy} onClick={() => { setMenu(null); requireAuth(() => void render(o, 'high', run.current, 'presentation')); }} title="The full front and back presentation in HD"><Sparkles size={16} /><span>Make HD</span><small>{HD_CREDITS} credits</small></button>}
        {isAi && o.direction && <button type="button" role="menuitem" disabled={o.busy} onClick={() => { setMenu(null); requireAuth(() => void render(o, o.quality ?? 'medium')); }}><RefreshCw size={16} /><span>Regenerate this design</span></button>}
        {o.image && <button type="button" role="menuitem" disabled={o.busy} onClick={() => { setMenu(null); setEditing(index); }}><PenLine size={16} /><span>Edit image</span></button>}
        {o.previous && <button type="button" role="menuitem" disabled={o.busy} onClick={() => { setMenu(null); setOptions(list => list.map(x => x.id === o.id ? { ...x, image: x.previous, previous: undefined } : x)); }}><Undo2 size={16} /><span>Undo last refine</span></button>}
        <button type="button" role="menuitem" disabled={making3d} onClick={() => { setMenu(null); customize(o); }}><Box size={16} /><span>Customise in 3D Studio</span><small>editable kit</small></button>
        {references.filter(r => r.id).map(r => <button key={r.id} type="button" role="menuitem" onClick={() => { setMenu(null); putDrawing(r); }} title="Already the finished design? Put your attached picture on the 3D kit exactly as drawn"><ArrowRight size={16} /><span>Put {r.name} on the 3D kit</span></button>)}
      </div>}
    </div>;
    const art = (o: DesignOption | undefined, big: boolean) => !o ? null
      : o.image ? <><img className="aid-art-blur" src={o.image} alt="" aria-hidden="true" /><img className="aid-art-img" src={o.image} alt={`${o.name}: ${o.description}`} draggable={false} />{o.busy && <span className="aid-art-busy" role="status"><LoaderCircle className="spin" size={big ? 30 : 20} />{big ? (o.pending === 'refine' ? 'Refining this design… about a minute' : o.pending === 'high' && o.quality !== 'high' ? 'Rendering in HD… about a minute' : 'Regenerating…') : null}</span>}</>
      : o.busy ? (big ? <Loader overlay={false} title={o.pending === 'high' ? 'Rendering your HD design…' : 'Rendering your design…'} subtitle={o.pending === 'high' ? 'Your brief and logos, front and back, in HD · about a minute.' : 'Your brief and logos, front and back · about 40 seconds. Three more designs follow.'} steps={['Reading your brief and logos', 'Designing front and back', 'Lighting the presentation', 'Finishing']} seconds={o.pending === 'high' ? 70 : 38} /> : <span className="aid-art-wait" role="status"><LoaderCircle className="spin" size={20} /></span>)
      : o.error ? (big ? <div className="aid-art-error" role="alert"><p>{o.error}</p>{o.direction && <button type="button" className="button button-outline" onClick={() => requireAuth(() => void render(o, o.pending === 'high' ? 'high' : 'medium'))}><RefreshCw size={15} /> Try again</button>}</div> : <span className="aid-art-wait is-error" title={o.error}><RefreshCw size={18} /></span>)
      : <DesignThumbnail design={o.design} />;
    const editingOption = editing === null ? undefined : options[editing];
    // Four designs (the PRIMARY and three options): the three not shown float as thumbnails; while the plan is written their places wait.
    const total = Math.max(options.length, planning ? 4 : 0);
    const shown = Math.min(sel, Math.max(0, total - 1));
    const thumbs = Array.from({ length: total }, (_, i) => i).filter(i => i !== shown).map(i => {
      const o = options[i];
      return { index: i, label: o ? `Design ${i + 1}: ${o.name}. Show this design` : `Design ${i + 1}: on its way`, disabled: !o || (!o.image && !!o.direction && !o.error), content: o ? art(o, false) : <span className="aid-art-wait" role="status"><LoaderCircle className="spin" size={20} /></span> };
    });
    const main = !primary && planning ? <Loader overlay={false} title="Designing your kit…" subtitle="Four design directions from your brief and logos; the best becomes your primary design." steps={references.length ? ['Reading your brief and logos', 'Four design directions', 'Choosing the best', 'Rendering your designs'] : ['Reading your brief', 'Four design directions', 'Choosing the best', 'Rendering your designs']} seconds={isAi ? 30 : 3} />
      : primary ? art(primary, true)
      : <div className="aid-art-error" role="alert"><p>{error || 'No designs came back.'}</p>{lastBrief.current && <button type="button" className="button button-outline" onClick={() => { const b = lastBrief.current!, chip = lastProduct.current; requireAuth(() => void generate(b.prompt, b.sport, b.garment, chip)); }}><RefreshCw size={15} /> Try again</button>}</div>;
    const canRefine = !!primary?.image && !primary.busy;
    return <section className={`aid-stage aid-results-stage${dropping ? ' dropping' : ''}${refineOpen ? ' refining' : ''}`} aria-label="Your designs" {...stageProps}>
      {background}
      <div className="aid-results">
        <div className="aid-results-head">
          <button type="button" className="aid-back" onClick={backToCreate} aria-label="Back to create" title="Back to create"><ArrowLeft size={22} /></button>
          <h1>YOUR DESIGNS</h1>
          {total > 0 ? <span className="aid-count-sel" aria-live="polite" aria-label={`Design ${shown + 1} of ${total}`}><b>{shown + 1}</b> / {total}</span> : <span />}
        </div>
        <ResultsViewer id={primary?.id ?? 'none'} image={primary?.image} alt={primary ? `${primary.name}: ${primary.description}` : 'Your design'} defaultRatio={primary?.view === 'front' ? 1 : 2 / 3} main={main}
          busy={planning || !!primary?.busy} thumbs={primary ? thumbs : []} onPick={select} tools={primary && kebab(primary, shown)} />
        <div className="aid-controls" ref={controls}>
          {!refineOpen && <div className="aid-actions">
            <button type="button" className="button button-gradient aid-open3d" disabled={!primary || making3d || (isAi ? !primary.image : false)} onClick={() => { if (!primary) return; if (primary.image) requireAuth(() => void makeIt3d()); else customize(primary); }} title={making3d ? 'Drawing the print sheet: the 3D Designer opens by itself' : 'The same design drawn flat, front and back, then put on the live 3D kit'}>{making3d ? <LoaderCircle className="spin" size={20} /> : <Box size={20} />}<span>{making3d ? 'Drawing the print sheet…' : 'Open in 3D Designer'}</span></button>
            <button type="button" className="aid-dl" disabled={!primary?.image} onClick={() => primary && void download(primary, shown + 1)} aria-label={`Download design ${shown + 1}`} title="Download this design"><Download size={22} /></button>
          </div>}
          {!refineOpen && isAi && primary?.image && <PlayerShotButton className="button button-secondary full-width aid-player" requireAuth={requireAuth} disabled={!!primary.busy}
            kit={{ sport: catalog?.sports.find(s => s.id === draft.sport)?.name || draft.sport, garment: productName(primary.design, catalog), name: primary.name, logoText: primary.design.logoText, backName: primary.design.backName || primary.design.logoText, number: primary.design.number }}
            pictures={async () => primary.image ? [primary.image] : []} />}
          <div className={`aid-refine${refineOpen ? ' is-open' : ''}`}>
            <form className="aid-refine-row" onSubmit={e => { e.preventDefault(); refine(); }}>
              <Sparkles className="aid-refine-icon" size={19} aria-hidden="true" />
              <label className="aid-refine-field"><span className="sr-only">Refine this design</span>
                <textarea rows={refineOpen ? 3 : 1} value={refineText} maxLength={1000} placeholder="Refine this design…"
                  onFocus={e => { setRefineOpen(true); const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: 'nearest' }), 250); }}
                  onChange={e => { setRefineText(e.target.value); if (error) setError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); refine(); } }} />
              </label>
              {refineOpen && <button type="button" className="aid-refine-close" onClick={() => setRefineOpen(false)} aria-label="Collapse" title="Collapse (your text is kept)"><ChevronDown size={20} /></button>}
              <button type="submit" className="aid-refine-go" disabled={!canRefine || !refineText.trim()} aria-label="Refine this design" title={isAi ? 'The AI changes this design as you describe (about a minute)' : 'Needs AI on the server'}><SendHorizontal size={19} /></button>
            </form>
            {refineOpen && <div className="aid-refine-brief">
              <span className="aid-menu-label">Your original brief · edit it for four new designs</span>
              {bar}
            </div>}
          </div>
          {notes}
        </div>
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
      <RecentDesigns signedIn={signedIn} checking={checking} onOpen={id => void reopen(id)} onOpenLocal={reopenLocal} onOpenProject={onOpenProject} onSignIn={() => requireAuth()} />
      <SportRow tiles={tiles} selected={tile} onSelect={id => { setTile(t => t === id ? null : id); setAskGarment(false); setPickedGarment(null); }} />
    </div>
  </section>;
}

/** CONVERT: a photo, sketch or mockup (e.g. from ChatGPT) becomes an editable 3D design. */
/** The garments a print layout or artwork can go on as drawn (our 3D models with print areas). */
const artworkGarments = ['jersey', 'tee', 'polo', 'pocketpolo', 'nfljersey', 'compression', 'singlet', 'netball-dress', 'raglan', 'hoodie', 'ziphoodie', 'trackjacket', 'varsity', 'shorts', 'fullkit'];
type ArtworkKind = 'layout' | 'front' | 'allover' | 'garment';
/** An artwork file read on the page: the file to keep (AI files as PDF), its type, and a preview picture. */
type ArtworkFile = { file: File; type: string; name: string; preview: string; wide: boolean; look: ArtworkLook };
/** What a picture looks like: a photo or mockup (an opaque background, many colours), and its main colour (not its background). */
type ArtworkLook = { photo: boolean; main: string };
const plainLook: ArtworkLook = { photo: false, main: '#0b1016' };

/** The look of a picture (task 9.153): read from a small copy, no AI. */
async function artworkLook(src: string): Promise<ArtworkLook> {
  const img = new Image(); img.src = src; await img.decode();
  const n = 64, c = document.createElement('canvas'); c.width = n; c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, n, n);
  const px = g.getImageData(0, 0, n, n).data;
  const key = (i: number) => ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
  // The background: the commonest colour round the edge (none when the edge is see-through).
  const edge = new Map<number, number>(); let clear = 0, rim = 0;
  for (let i = 0; i < n; i++) for (const [x, y] of [[i, 0], [i, n - 1], [0, i], [n - 1, i]]) { const at = (y * n + x) * 4; rim++; if (px[at + 3] < 40) clear++; else edge.set(key(at), (edge.get(key(at)) ?? 0) + 1); }
  const bg = clear > rim * 0.3 ? -1 : [...edge.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
  const near = (k: number, b: number) => b >= 0 && Math.abs((k >> 8) - (b >> 8)) + Math.abs(((k >> 4) & 15) - ((b >> 4) & 15)) + Math.abs((k & 15) - (b & 15)) <= 2;
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 40) continue;
    const k = key(i); if (near(k, bg)) continue;
    const e = counts.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += px[i]; e.g += px[i + 1]; e.b += px[i + 2]; counts.set(k, e);
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  // A photo: an opaque edge in many shades (a flat logo or layout has few colours, or a see-through or plain background).
  const photo = clear < rim * 0.3 && edge.size > 24 && counts.size > 220;
  return { photo, main: top ? `#${hex(top.r / top.n)}${hex(top.g / top.n)}${hex(top.b / top.n)}` : plainLook.main };
}

/** A vector or picture as a PNG, `long` pixels on its longer side, transparent behind it (logos and all-over prints). */
async function artworkPicture(art: Pick<ArtworkFile, 'file' | 'type'>, long = 1600, jpeg = false): Promise<string> {
  let source: CanvasImageSource, w: number, h: number;
  if (art.type === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist');
    // @ts-ignore: the worker build has no types; pdf.js runs it on the page when it is set as globalThis.pdfjsWorker.
    const worker = await import('pdfjs-dist/build/pdf.worker.mjs');
    (globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker ??= worker;
    const task = pdfjs.getDocument({ data: new Uint8Array(await art.file.arrayBuffer()) });
    try {
      const page = await (await task.promise).getPage(1);
      const one = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: long / Math.max(one.width, one.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport, background: 'rgba(0,0,0,0)' }).promise;
      return canvas.toDataURL('image/png');
    } finally { void task.destroy(); }
  }
  const img = new Image();
  img.src = await readFileData(art.file, art.type);
  await img.decode();
  w = img.naturalWidth || 1000; h = img.naturalHeight || 1000; source = img;
  // Vectors are drawn sharp at full size; pictures are never enlarged.
  const k = art.type === 'image/svg+xml' ? long / Math.max(w, h) : Math.min(1, long / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k)); canvas.height = Math.max(1, Math.round(h * k));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return jpeg ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png');
}
const readFileData = (file: Blob, type: string) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => { const s = String(r.result); resolve(`data:${type};base64,${s.slice(s.indexOf(',') + 1)}`); }; r.onerror = () => reject(new Error('Unable to read this file.')); r.readAsDataURL(file); });

/**
 * ARTWORK TO 3D (task 9.153): the user's own artwork on the real 3D garment, editable in the Studio. A full print
 * layout (front, back and sleeve panels side by side) is read into its panels and checked in the Studio; one design or
 * logo goes on the front (moved and resized there) or as an all-over print. The AI reading is only an extra.
 */
export function ConvertPage({ catalog, draft, onChange, requireAuth, onStudio }: { catalog: Catalog | null; draft: Draft; onChange: (draft: Draft) => void; requireAuth: (action?: () => void) => void; onStudio: () => void }) {
  const [art, setArt] = useState<ArtworkFile | null>(null);
  const [kind, setKind] = useState<ArtworkKind>('layout');
  const [sport, setSport] = useState(draft.sport);
  const [garment, setGarment] = useState(artworkGarments.includes(draft.garment) ? draft.garment : 'jersey');
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ name: string; summary: string; sport: string; garment: string; motif: string | null; design: Design } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const isAi = !!catalog?.provider.is_ai;
  const sports = catalog?.sports ?? [];
  const tiles = sports.find(s => s.id === sport)?.tiles ?? [];
  const garmentChoices = [...new Map(tiles.filter(t => t.garment && artworkGarments.includes(t.garment)).map(t => [t.garment!, t.name])).entries()];
  const choices = garmentChoices.length ? garmentChoices : artworkGarments.map(g => [g, catalog?.garments.find(c => c.id === g)?.name ?? garmentLabels[g] ?? g] as [string, string]);
  useEffect(() => { if (choices.length && !choices.some(([g]) => g === garment)) setGarment(choices[0][0]); }, [sport]); // eslint-disable-line react-hooks/exhaustive-deps

  async function read(file: File) {
    setError(''); setResult(null);
    if (file.size > 30 * 1024 * 1024) { setError('Use a file smaller than 30 MB.'); return; }
    const lower = file.name.toLowerCase();
    let type = /\.pdf$/.test(lower) ? 'application/pdf' : /\.svg$/.test(lower) ? 'image/svg+xml' : /\.png$/.test(lower) ? 'image/png' : /\.jpe?g$/.test(lower) ? 'image/jpeg' : /\.webp$/.test(lower) ? 'image/webp' : '';
    let name = file.name;
    if (/\.(ai|eps)$/.test(lower)) {
      // Illustrator files saved PDF-compatible are PDFs inside; EPS (and older AI) files are PostScript, which a browser cannot draw.
      const head = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
      if (!head.includes('%PDF')) { setError(`${file.name} cannot be read here. In Illustrator (or your design app) use Save As › PDF, or Export › SVG, then upload that file.`); return; }
      type = 'application/pdf'; name = file.name.replace(/\.(ai|eps)$/i, '.pdf');
    }
    if (!type) { setError('Choose a PDF, SVG, AI, PNG, JPG or WEBP file.'); return; }
    const kept = new File([file], name, { type });
    try {
      const preview = type === 'application/pdf' ? await artworkPicture({ file: kept, type }, 1200) : await readFileData(kept, type);
      const img = new Image(); img.src = preview; await img.decode().catch(() => undefined);
      const wide = (img.naturalWidth || 1) / Math.max(1, img.naturalHeight || 1) > 1.45;
      const look = await artworkLook(preview).catch(() => plainLook);
      setArt({ file: kept, type, name, preview, wide, look });
      // A photo or mockup of a garment (a background, many colours) is read by the AI; a wide flat sheet is most likely
      // a print layout (panels side by side); anything else a single design or logo.
      setKind(look.photo && isAi ? 'garment' : wide ? 'layout' : 'front');
    } catch { setError(`${file.name} could not be opened. Try saving it again as PDF, SVG or PNG.`); }
  }

  /** The artwork on the real 3D garment, then the Studio (where a print layout's panels are checked first). */
  async function toStudio() {
    if (!art) return;
    setPlacing(true); setError('');
    try {
      const base = { ...draft, id: undefined, version: undefined, name: draft.name === 'Untitled kit' ? art.name.replace(/\.[a-z]+$/i, '').slice(0, 60) || 'My design' : draft.name, sport, garment, mode: 'dyo' as const, patternMotif: undefined, pendingDrawing: undefined };
      // A fresh kit for the artwork (an earlier design's logos, print or layout are not carried over).
      // The side panels and trims take the artwork's main colour (not the default kit's cyan); a logo's kit stays plain.
      const look = art.look;
      const design: Design = { ...defaultDesign, garment: garment as Design['garment'], layout: null, layers: [], patternImage: null, secondary: kind === 'front' ? defaultDesign.main : look.main, ...(kind === 'allover' ? { main: look.main } : {}) };
      if (kind === 'garment') { await fromGarmentPicture(base, design); return; }
      if (kind === 'layout') {
        const form = new FormData(); form.append('file', art.file); form.append('name', art.name.slice(0, 120)); form.append('type', 'layout');
        const saved = await api<{ id: number; name: string }>('/assets', { method: 'POST', body: form });
        onChange({ ...base, design, pendingDrawing: { asset: saved.id, name: saved.name || art.name, kind: 'layout', type: art.type, known: true } });
      } else {
        const src = await artworkPicture(art);
        if (kind === 'allover') onChange({ ...base, design: { ...design, pattern: 'Solid', patternImage: await preparePattern(src, 'full'), patternScale: 0.16, zones: {} } });
        else {
          const layer = { id: crypto.randomUUID(), type: 'image' as const, name: art.name.slice(0, 120), src, side: 'front' as const, part: 'top' as const, x: 0, y: 0.42, w: 0.24 };
          onChange({ ...base, design: { ...design, layers: [...(design.layers ?? []).filter(l => l.type !== 'image' || l.src !== src), layer] } });
        }
      }
      onStudio();
    } catch (e) { setError(friendlyError(e)); } finally { setPlacing(false); }
  }

  /**
   * A picture of a garment (a mock-up or photo, front and back): the AI path of "Open in 3D Designer" (task 9.116).
   * The picture is read for its colours, crest and lettering, then the same AI redraws it as a flat front and back
   * print sheet (screens, buttons and backgrounds left out), checked in the Studio and put on the kit as drawn.
   */
  async function fromGarmentPicture(base: Draft, plain: Design) {
    if (!art) return;
    const image = await artworkPicture(art, 1536, true);
    const read = await api<DesignReading>('/ai/designs/read', { method: 'POST', body: JSON.stringify({ image, sport, garment }) })
      .then(r => r && r.design ? r : null, () => null);
    const logo = read?.crest ? await cropCrest(image, read.crest).catch(() => null) : null;
    // The garment chosen here stays (the reading only gives the colours, crest and lettering); its side panels the
    // picture's main colour unless the reading names a trim colour.
    const design: Design = { ...plain, ...(read?.design ?? {}), garment: garment as Design['garment'], layout: null, layers: [], patternImage: null, logoImage: logo ?? null };
    const sheet = aiReply(await api<{ asset: { id: number; name: string }; image: string }>('/ai/print-sheet', { method: 'POST', body: JSON.stringify({ image, sport, garment, reference_ids: [], name: base.name }) }), ['asset', 'image']);
    onChange({ ...base, mode: 'ai', design, pendingDrawing: { asset: sheet.asset.id, name: sheet.asset.name, known: true } });
    onStudio();
  }

  async function convert() {
    if (!art) return;
    setBusy(true); setError('');
    try { const image = await artworkPicture(art, 1280); setResult(aiReply(await api<NonNullable<typeof result>>('/ai/convert', { method: 'POST', body: JSON.stringify({ image }) }), ['design'], 'The converter sent an unexpected reply. Please try again.')); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const open = () => { if (!result) return; onChange({ ...draft, id: undefined, version: undefined, name: result.name, sport: result.sport, garment: result.garment, mode: 'ai', design: { ...draft.design, ...result.design, patternImage: null, layout: null, productName: undefined }, patternMotif: result.motif || undefined, pendingDrawing: undefined }); onStudio(); };

  if (busy) return <Loader title="Making the AI preview…" subtitle="Reading colours, patterns and lettering from your artwork." steps={['Reading the artwork', 'Finding colours', 'Matching pattern and lettering']} seconds={18} />;
  const kinds: { id: ArtworkKind; label: string; hint: string }[] = [
    ...(isAi ? [{ id: 'garment' as const, label: 'Picture of a garment (mockup / photo)', hint: 'A mock-up or photo of the garment, front and back. AI redraws it flat and puts it on the 3D kit, sides, crest and number included. Uses AI (a small fee per picture).' }] : []),
    { id: 'layout', label: 'Full print layout', hint: 'Front, back and sleeve panels side by side, as the factory prints them. Each panel goes on its part of the garment.' },
    { id: 'front', label: 'Logo or design on the front', hint: 'One design or logo on the front. Move and resize it on the 3D kit.' },
    { id: 'allover', label: 'All-over print', hint: 'The design repeated over the whole garment.' },
  ];
  return <div className="page-shell creation-page convert-page">
    <div className="page-heading"><span className="eyebrow"><ImageUp size={14} /> ARTWORK TO 3D</span><h1>Your artwork. <span>On the real 3D kit.</span></h1><p>Upload your vector artwork or picture and it goes straight onto the 3D garment as its print, ready to edit, save and order.</p></div>
    <div className="convert-layout">
      <div className="convert-image"><button className={`convert-drop glow-panel ${art ? 'has-image' : ''}`} onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void read(f); }}>
        {art ? <img src={art.preview} alt="Your artwork" /> : <><ImageUp size={34} /><strong>Drop your artwork or click to upload</strong><span>PDF, SVG, AI · PNG, JPG or WEBP · up to 30 MB</span></>}
      </button>
      {art && <p className="field-hint">{art.name}{art.type === 'application/pdf' || art.type === 'image/svg+xml' ? ' · vector, printed sharp' : ''}</p>}</div>
      <input ref={input} type="file" hidden accept=".pdf,.svg,.ai,.eps,.png,.jpg,.jpeg,.webp,application/pdf,image/svg+xml,application/postscript,image/png,image/jpeg,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
      <div className="convert-side glow-panel">
        {result ? <><span className="eyebrow">AI PREVIEW</span><h2>{result.name}</h2><p className="muted">{result.summary}</p>
          <div className="convert-palette">{(['main', 'secondary', 'accent'] as const).map(k => <span key={k}><i style={{ background: result.design[k] }} />{result.design[k]}</span>)}</div>
          <button className="button button-outline full-width" onClick={open}>OPEN AI PREVIEW IN 3D STUDIO <ArrowRight size={18} /></button>
          <button className="button button-outline full-width" onClick={() => setResult(null)}><ArrowLeft size={16} /> Back to my artwork</button></>
          : <><span className="eyebrow">1 · WHAT IS IT?</span>
          <div className="convert-kinds" role="radiogroup" aria-label="What the artwork is">{kinds.map(k => <label key={k.id} className={`convert-kind${kind === k.id ? ' is-on' : ''}`}><input type="radio" name="artwork-kind" checked={kind === k.id} onChange={() => setKind(k.id)} /><span><strong>{k.label}</strong><small>{k.hint}</small></span></label>)}</div>
          <span className="eyebrow">2 · CHOOSE THE GARMENT</span>
          <div className="convert-pick">
            <label>Sport<select value={sport} onChange={e => setSport(e.target.value)}>{sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>Garment<select value={garment} onChange={e => setGarment(e.target.value)}>{choices.map(([g, n]) => <option key={g} value={g}>{n}</option>)}</select></label>
          </div>
          {kind === 'front' && art?.look.photo && <p className="field-hint convert-warn" role="status">This looks like a photo or mock-up with a background, not a logo: the whole picture would go on the chest.{isAi ? ' Choose “Picture of a garment” to put its design on the kit.' : ''}</p>}
          {kind === 'allover' && art?.look.photo && <p className="field-hint convert-warn" role="status">This looks like a photo or mock-up: the whole picture, background included, would repeat over the kit.{isAi ? ' Choose “Picture of a garment” to put its design on the kit.' : ''}</p>}
          {kind === 'garment' && <p className="field-hint">Uses AI: about 30 seconds. The Studio then shows the front and back it drew for you to check.</p>}
          {kind === 'layout' && <p className="field-hint">The Studio shows each panel it found: check it is the front, back or a sleeve, then put it on.</p>}
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="button button-gradient full-width" disabled={!art || placing} onClick={() => requireAuth(() => void toStudio())}>{placing ? <LoaderCircle className="spin" size={18} /> : <Box size={18} />} PUT IT ON THE 3D KIT</button>
          {art && isAi && <button className="button button-outline full-width" disabled={placing} onClick={() => requireAuth(() => void convert())}><WandSparkles size={16} /> AI preview picture</button>}</>}
      </div>
    </div>
  </div>;
}
