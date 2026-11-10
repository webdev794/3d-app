import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, ChevronRight, Download, Eye, EyeOff, FileText, GripVertical, Image as ImageIcon, Info, LoaderCircle, Mouse, MousePointer2, Move, Palette, Redo2, Save, Scaling, Sparkles, Trash2, Type, Undo2, Upload, UploadCloud, X, ExternalLink } from 'lucide-react';
import { api, saveBlob, type Project, type User } from '../api';
import MarqueeViewer, { type LayerChange, type MarqueeViewerHandle } from '../components/MarqueeViewer';
import ColorWheel from '../components/ColorWheel';
import { readImage } from '../components/StudioArtwork';
import { loadJsPdf } from '../designSheet';
import { provideAssistContext } from '../assistBridge';
import { BRAND_LOGOS, MARQUEE_PATTERNS, MARQUEE_SWATCHES, SIZE_LABEL, WALLS_LABEL, defaultMarquee, marqueeProductName, metres, newLayerId, normalizeMarquee, zoneLabel, zoneSize, zonesOf, type MarqueeDesign, type MarqueeLayer, type MarqueeSize, type MarqueeView, type MarqueeWalls, type MarqueeZone } from '../marquee';
import { media } from '../api';
import '../../css/signage.css';

// ---------- the marquee being designed (kept for this visit, like the garment Studio's draft)

export interface MarqueeDraft { id?: number; version?: number; name: string; status?: 'draft' | 'approved'; design: MarqueeDesign; /** A picture to put on the back wall when the Studio opens (Upload artwork on the landing page). */ artwork?: string }
const DRAFT_KEY = '3deezi.marquee';
export function loadMarqueeDraft(): MarqueeDraft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (saved && typeof saved === 'object') return { name: String(saved.name || 'Custom marquee'), id: saved.id, version: saved.version, status: saved.status, design: normalizeMarquee(saved.design), artwork: saved.artwork };
  } catch { /* a fresh marquee */ }
  return { name: 'Custom marquee', design: defaultMarquee() };
}
export function storeMarqueeDraft(draft: MarqueeDraft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, artwork: undefined })); } catch { /* storage full: this page only */ } }
}
/** A saved marquee project opened from My projects (App.openProject). */
export function marqueeDraftFromProject(project: Project): MarqueeDraft {
  const design = (project.design as unknown as { marquee?: unknown }).marquee;
  return { id: project.id, version: project.version, name: project.name, status: project.status, design: normalizeMarquee(design) };
}
export const isMarqueeProject = (project: Pick<Project, 'garment'>) => project.garment === 'marquee';

// ---------- the products (landing page tiles): line icons drawn as in the mockup

const icon = (children: ReactNode) => <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
export const SIGNAGE_PRODUCTS: { id: string; name: string; ready: boolean; icon: ReactNode }[] = [
  { id: 'marquees', name: 'Marquees', ready: true, icon: icon(<><path d="M6 22 24 9l18 13" /><path d="M6 22h36" /><path d="M8 22v18M40 22v18M24 9v3" /><path d="M6 22c3 3 6 3 9 0 3 3 6 3 9 0 3 3 6 3 9 0 3 3 6 3 9 0" /></>) },
  { id: 'feather-flags', name: 'Feather flags', ready: false, icon: icon(<><path d="M20 44V6" /><path d="M20 6c10 2 15 9 13 20-1 7-6 11-13 13" /><path d="M23 14c4 2 6 5 6 9" /></>) },
  { id: 'pull-up-banners', name: 'Pull-up banners', ready: false, icon: icon(<><rect x="14" y="5" width="20" height="33" rx="1" /><path d="M11 41h26M16 38v3M32 38v3" /><path d="M18 30l12-14" /></>) },
  { id: 'banners', name: 'Banners', ready: false, icon: icon(<><rect x="5" y="13" width="38" height="22" rx="1.5" /><circle cx="9" cy="17" r="1.4" /><circle cx="39" cy="17" r="1.4" /><circle cx="9" cy="31" r="1.4" /><circle cx="39" cy="31" r="1.4" /></>) },
  { id: 'table-covers', name: 'Table covers', ready: false, icon: icon(<><path d="M10 18h28l5 18H5z" /><path d="M10 18 5 36M38 18l5 18" /><path d="M14 36v4M34 36v4" /></>) },
  { id: 'backdrops', name: 'Backdrops', ready: false, icon: icon(<><path d="M6 10c6 3 30 3 36 0v26c-6 3-30 3-36 0z" /><path d="M6 10v26M42 10v26" /></>) },
];

/** The landing page's setup choices (MARQUEE SETUP), on the draft that START DESIGNING opens. */
function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return <div className="sg-choice" role="group" aria-label={label}><span>{label}</span><div>{options.map(([v, text]) => <button key={v} type="button" className={v === value ? 'is-on' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>{text}</button>)}</div></div>;
}

/**
 * SIGNAGE & MARQUEES (/signage, client mockup 298): the products as tiles (Marquees ready, the others COMING SOON),
 * the 3D stage with a marquee, a feather flag, a pull-up banner and a table cover, MARQUEE SETUP (size, walls, view)
 * and START DESIGNING / Upload artwork, which open the Marquee Studio with those choices.
 */
export function SignagePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<MarqueeDraft>(loadMarqueeDraft);
  const [view, setView] = useState<MarqueeView>('Front');
  const [soon, setSoon] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const design = draft.design;
  const setup = (patch: Partial<MarqueeDesign>) => setDraft(d => ({ ...d, design: { ...d.design, ...patch } }));
  useEffect(() => { storeMarqueeDraft(draft); }, [draft]);
  useEffect(() => { if (!soon) return; const t = setTimeout(() => setSoon(null), 3200); return () => clearTimeout(t); }, [soon]);
  useEffect(() => provideAssistContext(() => 'The Signage & Marquees page (SIGNAGE & MARQUEES in the top menu, /signage): products for clubs and events. Marquees are ready: choose the size (3 x 3 m or 3 x 6 m), the walls (roof only, a back wall or full walls) and press START DESIGNING to open the Marquee Studio, or Upload artwork to start from your own picture. Feather flags, pull-up banners, banners, table covers and backdrops are coming soon.'), []);
  async function uploaded(file?: File | null) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setSoon('Upload a PNG, JPEG or WebP picture.'); return; }
    const src = await shrinkPicture(await readImage(file));
    const next = { ...draft, artwork: src };
    storeMarqueeDraft(next);
    navigate('/signage/marquee');
  }
  return <div className="signage-page glass-ui">
    <MarqueeViewer className="sg-stage" design={design} view={view} showroom />
    <div className="sg-haze" aria-hidden="true" />
    <header className="sg-head">
      <h1>SIGNAGE &amp; <span>MARQUEES</span></h1>
      <p>Choose a product. Make it yours.</p>
    </header>
    <nav className="sg-products" aria-label="Signage products">
      {SIGNAGE_PRODUCTS.map(p => <button key={p.id} type="button" className={`sg-product ${p.ready ? 'is-on' : 'is-soon'}`} aria-current={p.ready ? 'true' : undefined} aria-disabled={!p.ready} onClick={() => (p.ready ? navigate('/signage/marquee') : setSoon(`${p.name} are coming soon. Marquees are ready to design now.`))}>
        {p.icon}<span>{p.name}</span>{!p.ready && <small>COMING SOON</small>}
        {/* Every product carries the "3" emblem and the wordmark (branding, BR1 2026-11-02): the brand pictures, not typed text. */}
        <i className="sg-brand" aria-hidden="true"><img src={media('images/splash_mark.png')} alt="" /><img src={media('images/brand-wordmark.png')} alt="" /></i>
      </button>)}
    </nav>
    <section className="sg-setup" aria-label="Marquee setup">
      <h2>MARQUEE SETUP</h2>
      <Choice label="Size" options={[['3x3', '3 × 3 m'], ['3x6', '3 × 6 m']]} value={design.size} onChange={size => setup({ size })} />
      <Choice label="Walls" options={[['none', 'Roof only'], ['back', 'Back wall'], ['full', 'Full walls']]} value={design.walls} onChange={walls => setup({ walls })} />
      <Choice label="View" options={[['Front', 'Front'], ['Back', 'Back'], ['360°', '360°']]} value={view === 'Front' || view === 'Back' || view === '360°' ? view : 'Front'} onChange={setView} />
    </section>
    <div className="sg-cta">
      <h2>CUSTOM MARQUEE</h2>
      <p>Roof, valance &amp; wall artwork</p>
      <Link className="button button-gradient sg-start" to="/signage/marquee">START DESIGNING <ArrowRight size={18} /></Link>
      <button type="button" className="sg-upload" onClick={() => upload.current?.click()}><Upload size={16} /> <span>Upload artwork</span></button>
      <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { void uploaded(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
    {soon && <div className="sg-soon" role="status">{soon}</div>}
  </div>;
}

/** A picture made small enough to keep in a design (the long side at most 2000 px), as PNG or JPEG. */
async function shrinkPicture(src: string, long = 2000): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('This picture could not be read.')); i.src = src; });
  const k = Math.min(1, long / Math.max(img.naturalWidth, img.naturalHeight));
  if (k === 1 && src.length < 2_500_000) return src;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const png = c.toDataURL('image/png');
  return png.length < 2_500_000 ? png : c.toDataURL('image/jpeg', 0.88);
}

// ---------- the Marquee Studio (/signage/marquee, client mockup 297)

type Rail = 'select' | 'colours' | 'logos' | 'text' | 'patterns' | 'upload';
const RAIL: { id: Rail; label: string; Icon: (props: { size?: number }) => ReactNode }[] = [
  { id: 'select', label: 'Select', Icon: MousePointer2 }, { id: 'colours', label: 'Colours', Icon: Palette }, { id: 'logos', label: 'Logos', Icon: Sparkles },
  { id: 'text', label: 'Text', Icon: Type }, { id: 'patterns', label: 'Patterns', Icon: PatternIcon }, { id: 'upload', label: 'Upload', Icon: UploadCloud },
];
function PatternIcon(props: { size?: number }) { const s = props.size ?? 24; return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 15 15 3h5L3 20zM9 21 21 9v5l-7 7zM3 3h6L3 9z" /></svg>; }
type ColourTarget = 'panel' | 'pattern' | 'accent' | 'layer';
const HEX = /^#[0-9a-f]{6}$/i;

export function MarqueeStudio({ user, requireAuth, onNotice }: { user: User | null; requireAuth: (action?: () => void) => void; onNotice: (text: string) => void }) {
  const navigate = useNavigate();
  const viewer = useRef<MarqueeViewerHandle>(null);
  const [draft, setDraftState] = useState<MarqueeDraft>(loadMarqueeDraft);
  const design = draft.design;
  const [past, setPast] = useState<MarqueeDesign[]>([]);
  const [future, setFuture] = useState<MarqueeDesign[]>([]);
  const [dirty, setDirty] = useState(false);
  const [rail, setRail] = useState<Rail>('select');
  const [zone, setZone] = useState<MarqueeZone>('wallBack');
  const [layerId, setLayerId] = useState<string | null>(null);
  const [tool, setTool] = useState<'move' | 'scale' | null>(null);
  const [view, setView] = useState<MarqueeView>('Front');
  const [mode, setMode] = useState<'3D' | '2D'>('3D');
  const [panels, setPanels] = useState<Partial<Record<MarqueeZone, string>>>({});
  const [target, setTarget] = useState<ColourTarget>('panel');
  const [busy, setBusy] = useState<'' | 'save' | 'export'>('');
  const [exportOpen, setExportOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [dragRow, setDragRow] = useState<string | null>(null);
  const liveBase = useRef<MarqueeDesign | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const touch = useMemo(() => window.matchMedia?.('(pointer: coarse)').matches ?? false, []);
  const logoInput = useRef<HTMLInputElement>(null);

  const zones = zonesOf(design);
  const current = zones.includes(zone) ? zone : zones.includes('wallBack') ? 'wallBack' : 'roof';
  useEffect(() => { if (current !== zone) setZone(current); }, [current, zone]);
  const zd = design.zones[current];
  const layers = zd.layers;
  const layer = layers.find(l => l.id === layerId) ?? null;
  const pattern = layers.find(l => l.type === 'pattern') ?? null;
  // A new zone selects its top picture or words.
  useEffect(() => { if (!layers.some(l => l.id === layerId)) setLayerId([...layers].reverse().find(l => l.type !== 'pattern')?.id ?? layers[0]?.id ?? null); }, [current, layers, layerId]);
  useEffect(() => { storeMarqueeDraft(draft); }, [draft]);

  /** Changes the design: kept in the undo history unless `live` (a drag or a colour wheel turn, committed after). */
  function change(next: MarqueeDesign, live = false) {
    if (live) { liveBase.current ??= design; }
    else { const base = liveBase.current ?? design; liveBase.current = null; setPast(p => [...p.slice(-49), base]); setFuture([]); }
    setDraftState(d => ({ ...d, design: next }));
    setDirty(true);
  }
  function commit() { if (!liveBase.current) return; const base = liveBase.current; liveBase.current = null; setPast(p => [...p.slice(-49), base]); setFuture([]); }
  const setZoneDesign = (z: MarqueeZone, patch: Partial<typeof zd>, live = false) => change({ ...design, zones: { ...design.zones, [z]: { ...design.zones[z], ...patch } } }, live);
  const setLayers = (next: MarqueeLayer[], live = false) => setZoneDesign(current, { layers: next }, live);
  const patchLayer = (id: string, patch: Partial<MarqueeLayer>, live = false) => setLayers(layers.map(l => (l.id === id ? { ...l, ...patch } : l)), live);
  function undo() { const prev = past.at(-1); if (!prev) return; setPast(p => p.slice(0, -1)); setFuture(f => [design, ...f]); setDraftState(d => ({ ...d, design: prev })); setDirty(true); }
  function redo() { const next = future[0]; if (!next) return; setFuture(f => f.slice(1)); setPast(p => [...p, design]); setDraftState(d => ({ ...d, design: next })); setDirty(true); }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Upload artwork on the landing page: the picture fills the back wall (or the roof on a roof-only marquee).
  useEffect(() => {
    if (!draft.artwork) return;
    const z: MarqueeZone = zonesOf(draft.design).includes('wallBack') ? 'wallBack' : 'roof';
    const added: MarqueeLayer = { id: newLayerId(z, 'upload'), type: 'image', name: 'Your artwork', src: draft.artwork, x: 0.5, y: 0.5, w: 1 };
    setDraftState(d => ({ ...d, artwork: undefined, design: { ...d.design, zones: { ...d.design.zones, [z]: { ...d.design.zones[z], layers: [...d.design.zones[z].layers, added] } } } }));
    setZone(z); setLayerId(added.id); setDirty(true);
    onNotice(`Your artwork is on the ${zoneLabel(z, draft.design).toLowerCase()}. Move or scale it, or pick another panel.`);
  }, []);

  useEffect(() => provideAssistContext(() => [
    'The Marquee Studio (/signage/marquee): a 3D pop-up marquee to design. The left rail has Select, Colours, Logos, Text, Patterns and Upload; the Edit panel lists the design zones (roof, valances, walls), the colours and the selected layer with Move and Scale (then drag on the marquee). The right side has the zone\'s artwork layers (show or hide, drag to reorder) and a flat preview of the panel; Open 2D layout shows every printable panel flat. SAVE keeps it in My projects, EXPORT downloads a print PDF or the panels as pictures, REVIEW DESIGN checks every panel before ordering.',
    `Now: ${SIZE_LABEL[design.size]}, ${WALLS_LABEL[design.walls]}${design.halfWall && design.walls !== 'full' ? ' and a half wall' : ''}; the selected zone is the ${zoneLabel(current, design)}.`,
  ].join('\n')), [design, current]);

  // ---- picking and the 3D drags
  const pickZone = (z: MarqueeZone) => { setZone(z); setTool(null); };
  function layerMoved(c: LayerChange) {
    const zl = design.zones[c.zone];
    if (!zl) return;
    const next = zl.layers.map(l => (l.id === c.id ? { ...l, x: c.x, y: c.y, ...(c.w != null ? { w: c.w } : {}), ...(c.size != null ? { size: c.size } : {}) } : l));
    change({ ...design, zones: { ...design.zones, [c.zone]: { ...zl, layers: next } } }, !c.final);
    if (c.final) commit();
  }

  // ---- layer actions
  function addLayer(l: MarqueeLayer) { setLayers([...layers, l]); setLayerId(l.id); }
  const addLogo = (src: string, name = 'Logo') => addLayer({ id: newLayerId(current, 'logo'), type: 'image', name, src, x: 0.5, y: 0.5, w: current.startsWith('valance') ? 0.3 : 0.32 });
  const addText = () => addLayer({ id: newLayerId(current, 'text'), type: 'text', name: 'Text', text: 'YOUR TEAM', color: '#ffffff', x: 0.5, y: current.startsWith('valance') ? 0.5 : 0.75, size: current.startsWith('valance') ? 0.55 : 0.12 });
  function setPattern(name: string) {
    if (pattern) patchLayer(pattern.id, { name });
    else setLayers([{ id: newLayerId(current, 'pattern'), type: 'pattern', name, color: '#00c8ff', accent: '#1560ff', scale: 1 }, ...layers]);
  }
  /** Copies this zone's colour or pattern to every panel. */
  function everyPanel(what: 'colour' | 'pattern') {
    const next = { ...design.zones };
    for (const z of Object.keys(next) as MarqueeZone[]) {
      if (z === current) continue;
      if (what === 'colour') next[z] = { ...next[z], color: zd.color };
      else {
        const others = next[z].layers.filter(l => l.type !== 'pattern');
        next[z] = { ...next[z], layers: pattern ? [{ ...pattern, id: newLayerId(z, 'pattern') }, ...others] : others };
      }
    }
    change({ ...design, zones: next });
    onNotice(what === 'colour' ? 'Every panel has this colour now.' : 'Every panel has this pattern now.');
  }
  async function uploadTo(file: File | undefined | null, fill: boolean) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { onNotice('Upload a PNG, JPEG or WebP picture.'); return; }
    try {
      const src = await shrinkPicture(await readImage(file));
      addLayer({ id: newLayerId(current, fill ? 'upload' : 'logo'), type: 'image', name: fill ? 'Your artwork' : file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Logo', src, x: 0.5, y: 0.5, w: fill ? 1 : 0.3 });
    } catch (e) { onNotice((e as Error).message); }
  }
  function moveRow(id: string, before: string | null) {
    const list = layers.filter(l => l.id !== id), moving = layers.find(l => l.id === id);
    if (!moving) return;
    // The list shows the top layer first: dropping on a row puts the layer above it.
    const at = before ? list.findIndex(l => l.id === before) + 1 : 0;
    list.splice(at, 0, moving);
    setLayers(list);
  }

  // ---- colours
  const colourOf = (t: ColourTarget) => t === 'panel' ? zd.color : t === 'pattern' ? pattern?.color ?? '#00c8ff' : t === 'accent' ? pattern?.accent ?? '#1560ff' : layer?.color ?? '#ffffff';
  const canLayerColour = layer?.type === 'text';
  const colourTarget: ColourTarget = target === 'layer' && !canLayerColour ? 'panel' : (target === 'pattern' || target === 'accent') && !pattern ? 'panel' : target;
  function setColour(hex: string, live = false) {
    if (colourTarget === 'panel') setZoneDesign(current, { color: hex }, live);
    else if (colourTarget === 'layer' && layer) patchLayer(layer.id, { color: hex }, live);
    else if (pattern) patchLayer(pattern.id, colourTarget === 'pattern' ? { color: hex } : { accent: hex }, live);
  }

  // ---- size and walls
  const setSize = (size: MarqueeSize) => change({ ...design, size });

  // ---- save, export, review
  async function thumbnail() {
    const shot = await viewer.current!.capture('Front');
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = shot; });
    const c = document.createElement('canvas'), k = 720 / img.naturalWidth;
    c.width = 720; c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.84);
  }
  async function save(): Promise<MarqueeDraft | null> {
    setBusy('save');
    try {
      const roof = design.zones.roof, roofPattern = roof.layers.find(l => l.type === 'pattern');
      const body = {
        name: draft.name.trim() || 'Custom marquee', sport: 'training', garment: 'marquee', mode: 'dyo',
        design: { garment: 'marquee', main: roof.color, secondary: HEX.test(roofPattern?.color ?? '') ? roofPattern!.color : '#00c8ff', accent: HEX.test(roofPattern?.accent ?? '') ? roofPattern!.accent : '#1560ff', pattern: 'Solid', productName: marqueeProductName(design), sportName: 'Signage & Marquees', marquee: design },
        thumbnail: await thumbnail().catch(() => undefined),
      };
      const saved = draft.id
        ? await api<Project>(`/projects/${draft.id}`, { method: 'PUT', body: JSON.stringify({ ...body, ...(draft.version ? { expected_version: draft.version } : {}) }) })
        : await api<Project>('/projects', { method: 'POST', body: JSON.stringify(body) });
      const next = { ...draft, id: saved.id, version: saved.version, status: saved.status };
      setDraftState(next); setDirty(false);
      onNotice('Saved to My projects.');
      return next;
    } catch (e) { onNotice((e as Error).message || 'The marquee could not be saved.'); return null; }
    finally { setBusy(''); }
  }
  async function exportPdf() {
    setExportOpen(false); setBusy('export');
    try {
      const JsPdf = await loadJsPdf();
      const pdf = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const front = await viewer.current!.capture('Front'), back = await viewer.current!.capture('Back');
      pdf.setFillColor(5, 8, 12); pdf.rect(0, 0, 297, 210, 'F');
      pdf.setTextColor(0, 217, 237); pdf.setFontSize(9); pdf.text('3DEEZI · SIGNAGE & MARQUEES', 14, 14);
      pdf.setTextColor(240, 246, 250); pdf.setFontSize(20); pdf.text(`${draft.name || 'Custom marquee'} · ${SIZE_LABEL[design.size]}`, 14, 24);
      pdf.setFontSize(9); pdf.setTextColor(150, 170, 190);
      pdf.text(`Walls: ${WALLS_LABEL[design.walls]}${design.halfWall && design.walls !== 'full' ? ' + left half wall' : ''} · ${zones.length} printable panels · version ${draft.version ?? 1}`, 14, 31);
      pdf.addImage(front, 'PNG', 14, 38, 132, 88); pdf.addImage(back, 'PNG', 151, 38, 132, 88);
      pdf.text('Front', 14, 131); pdf.text('Back', 151, 131);
      pdf.text(zones.map(z => { const s = zoneSize(z, design)!; return `${zoneLabel(z, design)}: ${metres(s.w)} × ${metres(s.h)}`; }), 14, 142);
      for (const z of zones) {
        const print = await viewer.current!.panelPrint(z);
        pdf.addPage();
        pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, 297, 210, 'F');
        pdf.setTextColor(20, 30, 40); pdf.setFontSize(14); pdf.text(`${zoneLabel(z, design).toUpperCase()} · ${metres(print.size.w)} × ${metres(print.size.h)}`, 14, 16);
        pdf.setFontSize(8); pdf.setTextColor(110, 120, 130); pdf.text('Print area as seen from outside (the back wall as seen from inside the marquee; the roof from above, front at the bottom). Add 30 mm bleed for hemming.', 14, 22);
        const k = Math.min(269 / print.size.w, 170 / print.size.h), w = print.size.w * k, h = print.size.h * k;
        pdf.setDrawColor(0, 170, 200); pdf.rect(14 + (269 - w) / 2 - 0.5, 28 - 0.5, w + 1, h + 1);
        pdf.addImage(print.data, 'PNG', 14 + (269 - w) / 2, 28, w, h);
      }
      saveBlob(pdf.output('blob'), `${(draft.name || 'custom-marquee').replace(/[^\w-]+/g, '-').toLowerCase()}-print.pdf`);
    } catch (e) { onNotice((e as Error).message || 'The export could not be made.'); }
    finally { setBusy(''); }
  }
  async function exportPictures() {
    setExportOpen(false); setBusy('export');
    try {
      const shot = await viewer.current!.capture(view === '360°' ? 'Front' : view);
      saveBlob(await (await fetch(shot)).blob(), 'marquee-3d.png');
      for (const z of zones) { const p = await viewer.current!.panelPrint(z); saveBlob(await (await fetch(p.data)).blob(), `marquee-${z}.png`); }
    } catch (e) { onNotice((e as Error).message); }
    finally { setBusy(''); }
  }

  const sizeOf = (z: MarqueeZone) => zoneSize(z, design);
  const status = draft.status === 'approved' ? 'Approved' : dirty || !draft.id ? 'Draft' : 'Saved';
  const selectedName = layer ? layer.type === 'pattern' ? 'Background pattern' : layer.type === 'text' ? `“${layer.text ?? ''}”` : layer.name || 'Logo' : 'No layer';
  const preview = panels[current];
  const zs = sizeOf(current);

  return <div className="marquee-studio">
    <div className="ms-top">
      <nav className="ms-crumbs" aria-label="Breadcrumb"><Link to="/signage">Signage &amp; Marquees</Link><span>/</span><span aria-current="page">Marquee Studio</span></nav>
      <div className="ms-title">
        <h1>CUSTOM MARQUEE</h1>
        <label className="ms-size"><span className="sr-only">Marquee size</span><select value={design.size} onChange={e => setSize(e.target.value as MarqueeSize)}>{(Object.keys(SIZE_LABEL) as MarqueeSize[]).map(s => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}</select><ChevronDown size={15} /></label>
      </div>
      <div className="ms-actions">
        <button type="button" className="ms-round" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!past.length} onClick={undo}><Undo2 size={17} /></button>
        <button type="button" className="ms-round" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!future.length} onClick={redo}><Redo2 size={17} /></button>
        <span className={`ms-status is-${status.toLowerCase()}`}>{status}</span>
        <button type="button" className="ms-btn" disabled={busy === 'save'} onClick={() => requireAuth(() => { void save(); })}>{busy === 'save' ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} SAVE</button>
        <div className="ms-export">
          <button type="button" className="ms-btn" aria-expanded={exportOpen} disabled={busy === 'export'} onClick={() => setExportOpen(o => !o)}>{busy === 'export' ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />} EXPORT</button>
          {exportOpen && <div className="ms-menu" role="menu"><button role="menuitem" type="button" onClick={() => void exportPdf()}><FileText size={16} /> Print PDF (every panel)</button><button role="menuitem" type="button" onClick={() => void exportPictures()}><Download size={16} /> Panels as pictures (PNG)</button></div>}
        </div>
        <button type="button" className="button button-gradient ms-review" onClick={() => setReview(true)}>REVIEW DESIGN <ArrowRight size={17} /></button>
      </div>
    </div>

    <div className="ms-work">
      <MarqueeViewer ref={viewer} className="ms-stage" design={design} view={view} zone={mode === '3D' ? current : null} layer={layer ? { zone: current, id: layer.id } : null} tool={tool} onZonePick={pickZone} onPanels={images => setPanels(p => ({ ...p, ...images }))} onLayerChange={layerMoved} />
      {mode === '2D' && <Layout2D design={design} panels={panels} zone={current} onPick={z => setZone(z)} />}

      <nav className="ms-rail" aria-label="Tools">{RAIL.map(({ id, label, Icon }) => <button key={id} type="button" className={rail === id ? 'is-on' : ''} aria-pressed={rail === id} onClick={() => setRail(id)}><Icon size={26} /><span>{label}</span></button>)}</nav>

      <section className="ms-panel ms-edit" aria-label="Edit panel">
        <h2>{rail === 'select' ? 'EDIT PANEL' : RAIL.find(r => r.id === rail)!.label.toUpperCase()}</h2>
        {rail === 'select' && <>
          <h3>Design zone</h3>
          <div className="ms-zones">{zones.map(z => <button key={z} type="button" className={z === current ? 'is-on' : ''} aria-pressed={z === current} onClick={() => pickZone(z)}>{zoneLabel(z, design)}{z === current && <ChevronRight size={16} />}</button>)}</div>
          <label className="ms-size ms-walls-pick"><span>Walls</span><select value={`${design.walls}${design.halfWall && design.walls !== 'full' ? '+half' : ''}`} onChange={e => { const [walls, half] = e.target.value.split('+'); change({ ...design, walls: walls as MarqueeWalls, halfWall: !!half }); }}>
          {(Object.keys(WALLS_LABEL) as MarqueeWalls[]).flatMap(w => w === 'full' ? [[w, WALLS_LABEL[w]]] : [[w, WALLS_LABEL[w]], [`${w}+half`, `${w === 'none' ? 'Roof' : 'Back'} + half wall`]]).map(([v, text]) => <option key={v} value={v}>{text}</option>)}
        </select><ChevronDown size={15} /></label>
          <hr />
          <h3 className="ms-sub">COLOURS</h3>
          <Swatches value={zd.color} onPick={hex => setZoneDesign(current, { color: hex })} />
          <button type="button" className="ms-link" onClick={() => { setTarget('panel'); setRail('colours'); }}><Palette size={16} /> Open colour wheel <ArrowRight size={14} /></button>
          <hr />
          <h3 className="ms-sub">SELECTED LAYER</h3>
          <div className="ms-layer-name">{selectedName}</div>
          <div className="ms-tools">
            <button type="button" className={tool === 'move' ? 'is-on' : ''} aria-pressed={tool === 'move'} disabled={!layer || layer.type === 'pattern'} onClick={() => setTool(t => (t === 'move' ? null : 'move'))}><Move size={18} /> Move</button>
            <button type="button" className={tool === 'scale' ? 'is-on' : ''} aria-pressed={tool === 'scale'} disabled={!layer || layer.type === 'pattern'} onClick={() => setTool(t => (t === 'scale' ? null : 'scale'))}><Scaling size={18} /> Scale</button>
          </div>
          {tool && <p className="ms-hint">{tool === 'move' ? 'Drag the layer on the marquee to move it.' : 'Drag up or down on the marquee to make the layer bigger or smaller.'}</p>}
          {tool && layer && layer.type !== 'pattern' && <LayerFine layer={layer} onChange={(patch, live) => patchLayer(layer.id, patch, live)} onCommit={commit} />}
        </>}
        {rail === 'colours' && <>
          <div className="ms-seg" role="group" aria-label="What to colour">
            {([['panel', 'Panel'], ['pattern', 'Pattern'], ['accent', 'Accent'], ['layer', 'Text']] as [ColourTarget, string][]).map(([t, text]) => <button key={t} type="button" disabled={(t === 'layer' && !canLayerColour) || ((t === 'pattern' || t === 'accent') && !pattern)} className={colourTarget === t ? 'is-on' : ''} onClick={() => setTarget(t)}>{text}</button>)}
          </div>
          <Swatches value={colourOf(colourTarget)} onPick={hex => setColour(hex)} />
          <ColorWheel value={colourOf(colourTarget)} onChange={hex => setColour(hex, true)} onCommit={commit} />
          <button type="button" className="ms-link" onClick={() => everyPanel('colour')}>Use this panel colour on every panel <ArrowRight size={14} /></button>
        </>}
        {rail === 'logos' && <>
          <p className="ms-hint">Add a logo to the {zoneLabel(current, design).toLowerCase()}. Then Move or Scale it on the marquee.</p>
          <div className="ms-logos">{BRAND_LOGOS.map(l => <button key={l.src} type="button" onClick={() => addLogo(l.src, l.name)}><img src={media(l.src === '3deezi:logo' ? 'images/splash_mark.png' : 'images/brand-wordmark.png')} alt="" /><span>{l.name}</span></button>)}</div>
          <button type="button" className="ms-drop" onClick={() => logoInput.current?.click()}><UploadCloud size={26} /><strong>Upload your logo</strong><span>PNG with a clear background works best</span></button>
          <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { void uploadTo(e.target.files?.[0], false); e.target.value = ''; }} />
        </>}
        {rail === 'text' && <>
          <button type="button" className="ms-btn ms-wide" onClick={addText}><Type size={16} /> Add text to the {zoneLabel(current, design).toLowerCase()}</button>
          {layer?.type === 'text' ? <div className="ms-fields">
            <label className="field">Words<input value={layer.text ?? ''} maxLength={60} onChange={e => patchLayer(layer.id, { text: e.target.value }, true)} onBlur={commit} /></label>
            <label className="field">Font<select value={layer.font ?? 'Rajdhani'} onChange={e => patchLayer(layer.id, { font: e.target.value })}><option value="Rajdhani">Sport italic</option><option value="JerseyBlock">Jersey block</option></select></label>
            <span className="ms-label">Colour</span>
            <Swatches value={layer.color ?? '#ffffff'} onPick={hex => patchLayer(layer.id, { color: hex })} />
            <label className="ms-check"><input type="checkbox" checked={HEX.test(layer.outline ?? '')} onChange={e => patchLayer(layer.id, { outline: e.target.checked ? '#00c8ff' : null })} /> Cyan outline</label>
          </div> : <p className="ms-hint">Choose a text layer on the right to change its words.</p>}
        </>}
        {rail === 'patterns' && <>
          <div className="pattern-grid ms-patterns">{MARQUEE_PATTERNS.map(p => { const on = (pattern?.name ?? 'Solid') === p; return <button key={p} type="button" className={on ? 'selected' : ''} onClick={() => setPattern(p)}><span className={`pattern-preview pattern-${p.toLowerCase()}`} style={{ '--pattern-color': pattern?.color ?? '#00c8ff' } as React.CSSProperties} /><span>{p}{on && <Check size={14} />}</span></button>; })}</div>
          {pattern && pattern.name !== 'Solid' && <>
            <span className="ms-label">Pattern colour</span><Swatches value={pattern.color ?? '#00c8ff'} onPick={hex => patchLayer(pattern.id, { color: hex })} />
            <span className="ms-label">Accent</span><Swatches value={pattern.accent ?? '#1560ff'} onPick={hex => patchLayer(pattern.id, { accent: hex })} />
            <label className="field">Pattern size<input type="range" min={0.4} max={2.5} step={0.05} value={pattern.scale ?? 1} onChange={e => patchLayer(pattern.id, { scale: Number(e.target.value) }, true)} onPointerUp={commit} onKeyUp={commit} /></label>
          </>}
          <button type="button" className="ms-link" onClick={() => everyPanel('pattern')}>Use this pattern on every panel <ArrowRight size={14} /></button>
        </>}
        {rail === 'upload' && <>
          <button type="button" className="ms-drop" onClick={() => uploadInput.current?.click()}><UploadCloud size={30} /><strong>Upload artwork for the {zoneLabel(current, design).toLowerCase()}</strong><span>{zs ? `Print area ${metres(zs.w)} × ${metres(zs.h)}` : ''} · PNG, JPEG or WebP</span></button>
          <input ref={uploadInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { void uploadTo(e.target.files?.[0], true); e.target.value = ''; }} />
          <p className="ms-hint">Your picture fills the panel's width. A finished print file? Make it the panel's shape (see the size above) so nothing is cut.</p>
        </>}
      </section>

      <aside className="ms-panel ms-side" aria-label="Artwork layers and panel preview">
        <h2>ARTWORK LAYERS</h2>
        <ul className="ms-layers">{[...layers].reverse().map(l => <li key={l.id} className={`${l.id === layerId ? 'is-on' : ''} ${dragRow === l.id ? 'is-dragging' : ''}`} draggable onDragStart={e => { setDragRow(l.id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragRow(null)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragRow && dragRow !== l.id) moveRow(dragRow, l.id); setDragRow(null); }}>
          <button type="button" className="ms-eye" aria-label={l.visible === false ? `Show ${layerTitle(l)}` : `Hide ${layerTitle(l)}`} onClick={() => patchLayer(l.id, { visible: l.visible === false })}>{l.visible === false ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          <button type="button" className="ms-row" onClick={() => setLayerId(l.id)}><LayerThumb layer={l} /><span>{layerTitle(l)}{l.type === 'text' && l.text ? <small> {l.text}</small> : null}</span></button>
          {l.id === layerId && <button type="button" className="ms-del" aria-label={`Delete ${layerTitle(l)}`} onClick={() => setLayers(layers.filter(x => x.id !== l.id))}><Trash2 size={15} /></button>}
          <span className="ms-grip" aria-hidden="true"><GripVertical size={18} /></span>
        </li>)}
          {!layers.length && <li className="ms-empty">No artwork on this panel yet: add a logo, text or a pattern.</li>}
        </ul>
        <hr />
        <h2>PANEL PREVIEW</h2>
        <h3 className="ms-sub">{zoneLabel(current, design).toUpperCase()}{zs && <small> · {metres(zs.w)} × {metres(zs.h)}</small>}</h3>
        <div className="ms-preview" style={{ aspectRatio: zs ? `${Math.max(zs.w / zs.h, 1.1)}` : '16/9' }}>{preview ? <img src={preview} alt={`${zoneLabel(current, design)} print`} style={zs && zs.w / zs.h > 3 ? { width: '100%', height: 'auto' } : undefined} /> : <LoaderCircle className="spin" />}</div>
        <button type="button" className="ms-link" onClick={() => setMode('2D')}><ExternalLink size={17} /> Open 2D layout <ArrowRight size={14} /></button>
        <p className="ms-note"><Info size={17} /> Check each printable panel before approval.</p>
      </aside>

      {mode === '3D' && <p className="ms-drag"><Mouse size={16} /> Drag to rotate <i>·</i> {touch ? 'Pinch to zoom' : 'Scroll to zoom'}</p>}
      <div className="ms-views">
        <div role="group" aria-label="View">{(['Front', 'Back', 'Left', 'Right', '360°'] as MarqueeView[]).map(v => <button key={v} type="button" className={view === v && mode === '3D' ? 'is-on' : ''} onClick={() => { setMode('3D'); setView(v); viewer.current?.setView(v); }}>{v}</button>)}</div>
        <div role="group" aria-label="3D or 2D">{(['3D', '2D'] as const).map(m => <button key={m} type="button" className={mode === m ? 'is-on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{m}</button>)}</div>
      </div>
    </div>
    {review && <ReviewDialog draft={draft} design={design} panels={panels} dirty={dirty} user={user} onClose={() => setReview(false)} onSave={save} onPick={z => { setZone(z); setReview(false); setMode('3D'); }} requireAuth={requireAuth} onOrdered={() => { setReview(false); navigate('/orders'); onNotice('Your marquee order is in. We will confirm the price and timing.'); }} />}
  </div>;
}

const layerTitle = (l: MarqueeLayer) => l.type === 'pattern' ? 'Background pattern' : l.type === 'text' ? l.name && l.name !== 'Text' ? l.name : 'Text' : l.name || 'Logo';
function LayerThumb({ layer }: { layer: MarqueeLayer }) {
  if (layer.type === 'pattern') return <span className="ms-thumb"><PatternIcon size={24} /></span>;
  if (layer.type === 'text') return <span className="ms-thumb ms-thumb-text">T<small>t</small></span>;
  const src = layer.src === '3deezi:logo' ? media('images/splash_mark.png') : layer.src === '3deezi:wordmark' ? media('images/brand-wordmark.png') : layer.src;
  return <span className="ms-thumb">{src ? <img src={src} alt="" /> : <ImageIcon size={20} />}</span>;
}
function Swatches({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  return <div className="ms-swatches">{MARQUEE_SWATCHES.map(hex => <button key={hex} type="button" aria-label={`Colour ${hex}`} aria-pressed={value.toLowerCase() === hex} className={value.toLowerCase() === hex ? 'is-on' : ''} style={{ background: hex }} onClick={() => onPick(hex)} />)}<label className="ms-swatch-own" title="Any colour"><input type="color" value={HEX.test(value) ? value : '#000000'} onChange={e => onPick(e.target.value)} aria-label="Any colour" /></label></div>;
}
/** The selected picture or words, finely: size and turn (Move and Scale do it on the marquee). */
function LayerFine({ layer, onChange, onCommit }: { layer: MarqueeLayer; onChange: (patch: Partial<MarqueeLayer>, live: boolean) => void; onCommit: () => void }) {
  const big = layer.type === 'image' ? layer.w ?? 0.3 : layer.size ?? 0.15;
  return <div className="ms-fine">
    <label>Size<input type="range" min={0.02} max={1} step={0.01} value={big} onChange={e => onChange(layer.type === 'image' ? { w: Number(e.target.value) } : { size: Number(e.target.value) }, true)} onPointerUp={onCommit} onKeyUp={onCommit} /></label>
    <label>Turn<input type="range" min={-180} max={180} step={1} value={layer.rot ?? 0} onChange={e => onChange({ rot: Number(e.target.value) }, true)} onPointerUp={onCommit} onKeyUp={onCommit} /></label>
  </div>;
}

/** Every printable panel flat, at its real proportions (the 2D layout). */
function Layout2D({ design, panels, zone, onPick }: { design: MarqueeDesign; panels: Partial<Record<MarqueeZone, string>>; zone: MarqueeZone; onPick: (z: MarqueeZone) => void }) {
  const zones = zonesOf(design);
  const group = (list: MarqueeZone[]) => list.filter(z => zones.includes(z));
  const tile = (z: MarqueeZone) => { const s = zoneSize(z, design)!; return <button key={z} type="button" className={`ms-flat ${z === zone ? 'is-on' : ''}`} onClick={() => onPick(z)} style={{ '--ratio': `${s.w / s.h}` } as React.CSSProperties}>
    <span className="ms-flat-img">{panels[z] ? <img src={panels[z]} alt="" /> : <LoaderCircle className="spin" />}</span>
    <span className="ms-flat-name">{zoneLabel(z, design)} <small>{metres(s.w)} × {metres(s.h)}</small></span>
  </button>; };
  return <div className="ms-2d" aria-label="2D layout of the printable panels">
    <div className="ms-2d-col">{group(['roof']).map(tile)}</div>
    <div className="ms-2d-col">{group(['valanceFront', 'valanceBack', 'valanceLeft', 'valanceRight']).map(tile)}</div>
    <div className="ms-2d-col">{group(['wallBack', 'wallLeft', 'wallRight']).map(tile)}</div>
  </div>;
}

/**
 * REVIEW DESIGN: every printable panel flat with its size, "I have checked every panel", then the order (as a
 * garment kit's Order this kit): how many, the contact and delivery. The marquee is saved first.
 */
function ReviewDialog({ draft, design, panels, dirty, user, onClose, onSave, onPick, requireAuth, onOrdered }: { draft: MarqueeDraft; design: MarqueeDesign; panels: Partial<Record<MarqueeZone, string>>; dirty: boolean; user: User | null; onClose: () => void; onSave: () => Promise<MarqueeDraft | null>; onPick: (z: MarqueeZone) => void; requireAuth: (action?: () => void) => void; onOrdered: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const [checked, setChecked] = useState(false);
  const [step, setStep] = useState<'review' | 'order'>('review');
  const [form, setForm] = useState({ quantity: 1, contact_name: user?.name ?? '', phone: '', shipping_address: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const zones = zonesOf(design);
  const key = useMemo(() => `marquee-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, []);
  async function order() {
    setError('');
    if (!form.contact_name.trim()) { setError('Add a contact name.'); return; }
    setBusy(true);
    try {
      const saved = dirty || !draft.id ? await onSave() : draft;
      if (!saved?.id) { setBusy(false); return; }
      await api('/orders', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ project_id: saved.id, project_version: saved.version, design_final: true, names: 'none', sizes: { [`${design.size === '3x6' ? '3x6' : '3x3'} m`]: form.quantity }, contact_name: form.contact_name, phone: form.phone || null, shipping_address: form.shipping_address || null, notes: form.notes || null }) });
      onOrdered();
    } catch (e) { setError((e as Error).message || 'The order could not be placed.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={ref} className="modal ms-review-dialog" onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <button type="button" className="icon-button modal-close" aria-label="Close" onClick={onClose}><X /></button>
    <span className="eyebrow">REVIEW DESIGN</span>
    <h2>{draft.name || 'Custom marquee'} <span>· {SIZE_LABEL[design.size]}</span></h2>
    {step === 'review' ? <>
      <p className="muted">Check each printable panel. Tap a panel to go back and change it.</p>
      <div className="ms-review-grid">{zones.map(z => { const s = zoneSize(z, design)!; return <button key={z} type="button" onClick={() => onPick(z)}><span className="ms-review-img" style={{ aspectRatio: `${Math.max(s.w / s.h, 1.6)}` }}>{panels[z] ? <img src={panels[z]} alt="" /> : <LoaderCircle className="spin" />}</span><strong>{zoneLabel(z, design)}</strong><small>{metres(s.w)} × {metres(s.h)}</small></button>; })}</div>
      <label className="ms-check ms-final"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /> I have checked every panel. This design is final.</label>
      <div className="ms-dialog-actions"><button type="button" className="button button-outline" onClick={onClose}>Keep designing</button><button type="button" className="button button-gradient" disabled={!checked} onClick={() => requireAuth(() => setStep('order'))}>ORDER THIS MARQUEE <ArrowRight size={17} /></button></div>
    </> : <>
      <p className="muted">Tell us how many and where to send them. We’ll confirm the price and timing before anything is made.</p>
      <div className="ms-order-form">
        <label className="field">How many marquees<input type="number" min={1} max={500} value={form.quantity} onChange={e => setForm({ ...form, quantity: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })} /></label>
        <label className="field">Contact name<input value={form.contact_name} maxLength={120} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></label>
        <label className="field">Phone<input value={form.phone} maxLength={40} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="field">Delivery address<textarea rows={2} maxLength={1000} value={form.shipping_address} onChange={e => setForm({ ...form, shipping_address: e.target.value })} /></label>
        <label className="field">Notes<textarea rows={2} maxLength={2000} value={form.notes} placeholder="Event date, frame colour, carry bag…" onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="ms-dialog-actions"><button type="button" className="button button-outline" onClick={() => setStep('review')}>Back</button><button type="button" className="button button-gradient" disabled={busy} onClick={() => void order()}>{busy ? <LoaderCircle className="spin" size={17} /> : null} PLACE ORDER <ArrowRight size={17} /></button></div>
    </>}
  </dialog>;
}
