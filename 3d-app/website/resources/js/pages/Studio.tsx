import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Box, Camera, Check, ChevronRight, Package, Download, Expand, Grid2X2, Pencil,Hash, ImagePlus, Layers, LoaderCircle, Maximize, MoreVertical, Palette, Plus, Redo2, RotateCcw, Save, SendHorizontal, Shirt, SlidersHorizontal, Sparkles, Type, Undo2, WandSparkles, X, PenTool, FileText, ZoomIn, ZoomOut } from 'lucide-react';
import { api, fetchFile, media, saveBlob, type Catalog, type Project, type User } from '../api';
import { OrderKitDialog } from './Orders';
import { paymentPath } from '../components/OrderReviewApprove';
import { designSheetPdf } from '../designSheet';
import { type Design, type View, type Zone, type ArtworkLayer } from '../types';
import KitViewer, { type KitViewerHandle, type HoodieArea, isHoodie, isVarsity, varsityAreas, varsityColour, isTrack, trackAreas, trackColour, trackAreaLabel } from '../components/KitViewer';
import ColorWheel from '../components/ColorWheel';
import { comingSoon, garmentArt, productName } from './Create';
import type { Draft } from '../App';
import { ArtworkPanel, PresetPanel, checkDrawing, designSignature, ownPatch, patternNames, readAsset, readImage, type ArtworkDrop, type OwnDesign, type ShelvedLayouts } from '../components/StudioArtwork';
import { defaultDesign } from '../types';
import { onAssist } from '../assistBridge';
import { EditImageButton } from '../components/ImageEditor';
import { PlayerShotButton } from '../components/PlayerShot';
import ProductMockupDialog from '../components/ProductMockupDialog';
import GradientFlyout, { gradientOf, gradientPatch, makeGradient, stopsOf, cssGradient, type GradientSlot } from '../components/GradientFlyout';
import type { Gradient } from '../components/KitViewer';
import '../../css/studio-tools.css';

type Tool = 'ai' | 'garment' | 'colours' | 'patterns' | 'logos' | 'text' | 'numbers' | 'presets';
type Message = { from: 'you' | '3deezi'; text: string };
const tools = [{ id: 'ai', label: 'AI', icon: Sparkles }, { id: 'garment', label: 'Garment', icon: Shirt }, { id: 'colours', label: 'Colours', icon: Palette }, { id: 'patterns', label: 'Patterns', icon: Grid2X2 }, { id: 'logos', label: 'Artwork', icon: ImagePlus }, { id: 'text', label: 'Text', icon: Type }, { id: 'numbers', label: 'Numbers', icon: Hash }, { id: 'presets', label: 'Presets', icon: Layers }] as const;
/** A colour (#hex, rgb() or a name such as "dark blue") as #rrggbb, or null. */
function cssColour(text: string) {
  const g = document.createElement('canvas').getContext('2d')!;
  for (const tryName of [text.trim(), text.trim().replace(/[\s-]+/g, '')]) {
    g.fillStyle = '#010203'; g.fillStyle = tryName; const a = g.fillStyle;
    g.fillStyle = '#040506'; g.fillStyle = tryName;
    if (a === g.fillStyle) return a;
  }
  return null;
}
/** The design keys a design picture or print layout hides (Studio uncover). */
const lookKeys = ['main', 'secondary', 'accent', 'pattern', 'patternColor', 'patternImage', 'patternBody', 'patternScale', 'gradient', 'gradients', 'zones'] as const;
/** A hoodie's own colour areas in the Colours panel (the zip only on the zip hoodie). */
const hoodieAreas: { key: HoodieArea; label: string }[] = [{ key: 'hood', label: 'Hood' }, { key: 'lining', label: 'Hood lining' }, { key: 'rib', label: 'Cuffs & waistband' }, { key: 'pocket', label: 'Pocket' }, { key: 'zip', label: 'Zip' }];
const colourSlots = [{ key: 'main', label: 'Primary' }, { key: 'secondary', label: 'Secondary' }, { key: 'accent', label: 'Accent' }, { key: 'patternColor', label: 'Pattern' }] as const;
const palettes = [['#0b1016', '#00c2cc', '#36e3ee'], ['#08233e', '#efb84a', '#ffffff'], ['#f2f4f6', '#0076cd', '#0b1830'], ['#261133', '#ad47da', '#fb92d3'], ['#0c2824', '#31c29a', '#ffffff'], ['#240c12', '#ec3e5b', '#f9e6d4']];
const suggestions = ['Make it red and gold', 'Add bold chevrons', 'Darker body, brighter trims', 'Number 7 for SMITH', 'Give it a tribal shoulder print'];
/**
 * Patterns › Apply to area: only the areas the garment has, as the 3D viewer paints them (viewer zones.js). Shorts
 * have no shoulders or sleeves and a singlet no sleeves (a pattern there painted nothing); the full kit's jersey has both.
 */
function patternAreas(garment: string, trackStyle?: string | null): { key: Zone; label: string }[] {
  const shorts = garment === 'shorts';
  return [
    { key: 'body', label: shorts ? 'Body' : 'Chest & body' },
    ...(shorts ? [] : [{ key: 'yoke' as const, label: 'Shoulders' }]),
    ...(shorts || garment === 'singlet' || garment === 'netball-dress' ? [] : [{ key: 'sleeves' as const, label: 'Sleeves' }]),
    { key: 'sides', label: 'Side panels' },
    { key: 'hem', label: shorts ? 'Leg hems' : 'Hem' },
    ...(garment === 'pocketpolo' ? [{ key: 'pocket' as const, label: 'Chest pocket' }] : []),
    ...(isHoodie(garment) ? [{ key: 'pocket' as const, label: 'Kangaroo pocket' }, { key: 'hood' as const, label: 'Hood' }] : []),
    ...(isTrack(garment) ? [{ key: 'hood' as const, label: trackStyle === 'hood' ? 'Hood' : 'Collar' }] : []),
  ];
}

export default function Studio({ draft, onChange, catalog, requireAuth, onNotice, user, initialBoard = false }: { draft: Draft; onChange: (draft: Draft) => void; catalog: Catalog | null; requireAuth: (action?: () => void) => void; onNotice: (text: string) => void; user: User | null; initialBoard?: boolean }) {
  // Phones open with no tool panel, so the 3D kit fills the screen (client 2026-10-23, 172.jpg); a tool opens its panel below it.
  const [tool, setTool] = useState<Tool | null>(initialBoard ? 'logos' : (window.matchMedia?.('(max-width: 600px)').matches ? null : 'colours'));
  const [board, setBoard] = useState(initialBoard);
  // A factory print layout on the kit (ArtworkPanel); kept in the 3D viewer for this visit.
  // The 3D viewer's own screen (print layout check) is open: the stage's chips and buttons step aside.
  const [viewerModal, setViewerModal] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [dragging, setDragging] = useState<ArtworkDrop | null>(null);
  const [zone, setZone] = useState<Zone | 'all'>('all');
  // The garment's own areas; after a garment change an area it doesn't have falls back to the whole garment.
  const areas = patternAreas(draft.design.garment, draft.design.trackStyle);
  const area = zone !== 'all' && areas.some(a => a.key === zone) ? zone : 'all';
  useEffect(() => { if (area !== zone) setZone(area); }, [area, zone]);
  const [slot, setSlot] = useState<(typeof colourSlots)[number]['key']>('main');
  // GRADIENT PRESETS, the flyout beside the Colours panel.
  const [gradientOpen, setGradientOpen] = useState(false);
  const colourPanel = useRef<HTMLElement>(null);
  const gradientButton = useRef<HTMLButtonElement>(null);
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
  const [mockupOpen, setMockupOpen] = useState(false);
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
  // Phones: the Ask bar's input is narrow, so its hint is short (not cut off).
  const narrow = window.matchMedia?.('(max-width: 600px)').matches ?? false;
  const navigate = useNavigate();
  useEffect(() => { setBoard(initialBoard); if (initialBoard) setTool('logos'); }, [initialBoard]);
  function openBoard(on: boolean) { setBoard(on); if (on) setTool('logos'); setRotating(false); }
  // 3DEEZI ASSIST can turn the kit, open a tool panel, switch the garment or the 2D panels, and export.
  const readyNow = useRef(ready);
  readyNow.current = ready;
  useEffect(() => onAssist('studio', async (action, value) => {
    const panels: Record<string, Tool> = { ai: 'ai', garment: 'garment', colours: 'colours', patterns: 'patterns', logos: 'logos', text: 'text', numbers: 'numbers', presets: 'presets' };
    if (action === 'view') {
      if (value === '360') { setRotating(true); return '360° rotation'; }
      if (!['front', 'back', 'side'].includes(value)) throw new Error('The views are front, back, side and 360.');
      setView(value as View); setRotating(false);
      return `${value[0].toUpperCase()}${value.slice(1)} view`;
    }
    if (action === 'panel') {
      if (value === 'close') { setTool(null); return 'Panel closed'; }
      if (!panels[value]) throw new Error('There is no such Studio panel.');
      setTool(panels[value]);
      return `${tools.find(t => t.id === value)?.label ?? value} panel open`;
    }
    if (action === 'garment') {
      const g = garments.find(item => item.id === value);
      if (!g) throw new Error('That garment is not available.');
      edit({ garment: g.id as Design['garment'] });
      return `Garment: ${g.name}`;
    }
    if (action === 'board') { openBoard(value === '2d'); return value === '2d' ? '2D print panels' : '3D view'; }
    if (action === 'export') {
      const formats = { pdf: 'Design sheet (PDF)', png: '3D mockup (PNG)', 'front-back': 'Front & back (PNG)', artboard: 'Print panels (PNG)', json: 'Design specification (JSON)' } as const;
      if (!(value in formats)) throw new Error('Exports are pdf, png, front-back, artboard and json.');
      // Just opened: wait for the 3D viewer.
      for (let i = 0; i < 150 && !readyNow.current; i++) await new Promise(r => setTimeout(r, 100));
      if (!readyNow.current) throw new Error('The 3D viewer is still starting. Please try again.');
      await exportDesign(value as keyof typeof formats);
      return `${formats[value as keyof typeof formats]} downloaded`;
    }
    if (action === 'design') {
      // Direct edits, as in the panels: number, name, wordmark, colours, pattern (one undo step).
      const patch: Partial<Design> = {}, said: string[] = [];
      for (const pair of value.split(',').map(x => x.trim()).filter(Boolean)) {
        const [key, ...rest] = pair.split('='), v = rest.join('=').trim();
        if (key === 'number') { const n = v.replace(/\D/g, '').slice(0, 3); if (!n) throw new Error('The number needs digits.'); patch.number = n; said.push(`number ${n}`); }
        else if (key === 'name') { patch.backName = v.toUpperCase().slice(0, 20); said.push(`name ${patch.backName}`); }
        else if (key === 'wordmark') { patch.logoText = v.toUpperCase().slice(0, 20); said.push(`wordmark ${patch.logoText}`); }
        else if (['main', 'secondary', 'accent', 'patternColor'].includes(key)) {
          const hex = cssColour(v); if (!hex) throw new Error(`"${v}" is not a colour I know.`);
          patch[key as 'main' | 'secondary' | 'accent' | 'patternColor'] = hex; said.push(`${colourSlots.find(c => c.key === key)?.label ?? key} ${hex}`);
        } else if (key === 'pattern') {
          const name = patternNames.find(n => n.toLowerCase() === v.toLowerCase()); if (!name) throw new Error(`Patterns are: ${patternNames.join(', ')}.`);
          Object.assign(patch, { pattern: name === 'None' ? 'Solid' : name, patternImage: null, zones: {} }); said.push(`pattern ${name}`);
        } else throw new Error(`I can't set "${key}" here.`);
      }
      if (!said.length) throw new Error('Nothing to change.');
      edit(patch);
      return `Changed ${said.join(', ')}`;
    }
    if (action === 'studioAi') {
      // Anything else about the kit's look: the Studio's own AI, as if typed in the Ask 3DEEZI bar.
      if (!aiEnabled) throw new Error('AI is not connected on this server.');
      if (!user) { requireAuth(() => void askAi(value)); throw new Error('Sign in first: the sign-in window is open, and the change is made after you sign in.'); }
      return `Studio AI: ${await aiEdit(value)}`;
    }
    throw new Error('The Studio cannot do that.');
  }));

  // A design from AI concepts, Convert or an AI edit arrives with a motif: generate its print.
  // Never for a design picture (MAKE IT 3D, Put my design on the 3D kit): the picture is the whole design.
  const isDrawing = (d: Draft) => !!d.pendingDrawing || d.design.layout?.kind === 'drawing';
  const drawing = isDrawing(draft);
  useEffect(() => {
    if (!draft.patternMotif) return;
    if (drawing) { onChange({ ...latest.current, patternMotif: undefined }); return; }
    if (!aiEnabled || draft.design.patternImage || patternBusy) return;
    setPatternBusy(true);
    api<{ patternImage: string }>('/ai/pattern', { method: 'POST', body: JSON.stringify({ motif: draft.patternMotif }) })
      .then(({ patternImage }) => {
        const current = latest.current;
        // A design picture arrived meanwhile: it stays as drawn, without this print.
        if (isDrawing(current)) { onChange({ ...current, patternMotif: undefined }); return; }
        onChange({ ...current, patternMotif: undefined, design: { ...current.design, patternImage } }); onNotice('AI print pattern applied to your kit.');
      })
      .catch(e => { onChange({ ...latest.current, patternMotif: undefined }); if (!isDrawing(latest.current)) onNotice(`Pattern not generated: ${(e as Error).message}`); })
      .finally(() => setPatternBusy(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.patternMotif, aiEnabled, drawing]);
  const [name, setName] = useState(draft.name === 'Untitled kit' ? '' : draft.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(!draft.id);
  const viewer = useRef<KitViewerHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const askUpload = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { if (modal) dialog.current?.showModal(); }, [modal]);
  // A design picture sent from the AI designer: checked in the 3D view, then on the kit exactly as drawn.
  const drawingStarted = useRef<number | null>(null);
  useEffect(() => {
    const pending = draft.pendingDrawing;
    if (!pending || !ready || !viewer.current || drawingStarted.current === pending.asset) return;
    drawingStarted.current = pending.asset;
    void (async () => {
      try {
        const src = await readImage(await fetchFile(`/assets/${pending.asset}/file`));
        const patch = await checkDrawing(viewer.current!, src, pending.name, pending.asset, latest.current.design.garment, !!pending.known);
        // The picture carries its own lettering: the position letters read from it (task 9.116) are not added again.
        const layers = latest.current.design.layers?.filter(l => !l.id.startsWith('position-'));
        if (patch) { edit({ ...patch, ...(layers && layers.length !== latest.current.design.layers?.length ? { layers } : {}) }, { pendingDrawing: undefined }); onNotice([pending.note, 'Your design is on the 3D kit as drawn. Save the project to keep it.'].filter(Boolean).join(' ')); }
        else { onChange({ ...latest.current, pendingDrawing: undefined }); if (pending.note) onNotice(pending.note); }
      } catch (e) {
        onChange({ ...latest.current, pendingDrawing: undefined });
        // An AI design (task 9.116) is already on the kit in its colours, symbol and lettering: never a refusal.
        onNotice(pending.note !== undefined || latest.current.mode === 'ai' && pending.known ? [pending.note, `The picture itself could not go on the 3D kit (${(e as Error).message}), so the kit takes your design’s colours, symbol and lettering.`].filter(Boolean).join(' ') : `Design picture: ${(e as Error).message}`);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.pendingDrawing, ready]);
  // The last design picture and print layout on the kit this visit: a preset or Remove takes them off, Artwork puts them back.
  const [shelved, setShelved] = useState<ShelvedLayouts>({});
  useEffect(() => { const on = draft.design.layout; if (on) setShelved(s => ({ ...s, [on.kind === 'drawing' ? 'drawing' : 'print']: { layout: on, garment: draft.design.garment } })); }, [draft.design.layout, draft.design.garment]);
  // YOUR DESIGN (Preset designs): the user's own design before the first preset, kept with the kit in this browser.
  const ownKey = `3deezi.own.${draft.id ?? 'new'}`;
  const readOwn = (key: string): { own: OwnDesign | null; preset: boolean } => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? { own: null, preset: false }; } catch { return { own: null, preset: false }; } };
  const [ownState, setOwnState] = useState(() => readOwn(ownKey));
  const ownLoaded = useRef(ownKey);
  useEffect(() => { if (ownLoaded.current === ownKey) return; ownLoaded.current = ownKey; const kept = readOwn(ownKey); if (kept.own || ownState.own === null) setOwnState(kept); }, [ownKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { if (ownState.own) localStorage.setItem(ownKey, JSON.stringify(ownState)); } catch { /* full or private: kept for this visit */ } }, [ownState, ownKey]);
  // While the kit is the user's own (not a preset), YOUR DESIGN follows it; a fresh kit untouched since it started has none.
  useEffect(() => {
    const now = designSignature(draft.design), own = ownState.own;
    if (own && designSignature(own.design) === now) { if (ownState.preset) setOwnState(s => ({ ...s, preset: false })); return; }
    if (ownState.preset) return;
    if (!own && now === designSignature({ ...defaultDesign, garment: draft.design.garment })) return;
    setOwnState(s => ({ own: { design: draft.design, thumb: s.own?.thumb }, preset: false }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.design]);
  /** A preset is about to replace the kit: keep the user's own design (with a still of it) for YOUR DESIGN. */
  async function beforePreset() {
    if (ownState.preset) return;
    // A fresh kit that starts from a preset has no design of its own.
    if (!ownState.own) { setOwnState({ own: null, preset: true }); return; }
    let thumb: string | null | undefined = ownState.own.thumb;
    try { thumb = await captureThumbnail(240); } catch { /* the swatch shows */ }
    setOwnState({ own: { design: latest.current.design, thumb }, preset: true });
  }
  function restoreOwn() {
    const own = ownState.own; if (!own) return;
    edit(ownPatch(own.design)); setOwnState(s => ({ ...s, preset: false }));
    onNotice('Your design is back on the kit. Undo returns to the preset.');
  }
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'nearest' }); }, [chat, asking]);
  useEffect(() => { const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload); }, [dirty]);

  /**
   * A design picture or print layout is painted instead of the colours, pattern and gradients: a change to them takes it
   * off, so the change shows (Undo, or Artwork, puts it back).
   */
  function uncover(patch: Partial<Design>, design: Design): Partial<Design> {
    const on = design.layout;
    if (!on || 'layout' in patch || !lookKeys.some(key => key in patch)) return patch;
    const picture = on.kind === 'drawing';
    onNotice(`${picture ? 'Design picture' : 'Print layout'} taken off so your change shows: Undo, or Artwork › ${picture ? 'My design picture' : 'Factory print layout'}, puts it back.`);
    return { ...patch, layout: null };
  }
  /** One undoable change. */
  function edit(patch: Partial<Design>, extra: Partial<Draft> = {}) {
    const current = latest.current;
    setPast(history => [...history.slice(-39), liveBase.current ?? { ...current.design }]); liveBase.current = null; setFuture([]);
    patch = uncover(patch, current.design);
    // Another 3D garment is no longer the sport's tile it was chosen as ("Netball dress"): it takes its own name.
    if (patch.garment && patch.garment !== current.design.garment && current.design.productName) patch = { ...patch, productName: undefined };
    const design = { ...current.design, ...patch };
    onChange({ ...current, ...extra, design, garment: design.garment }); setDirty(true);
  }
  /** Live updates while dragging the colour wheel; `commit` makes them one undo step. */
  function preview(patch: Partial<Design>) { const current = latest.current; liveBase.current ??= { ...current.design }; onChange({ ...current, design: { ...current.design, ...uncover(patch, current.design) } }); setDirty(true); }
  function commit() { if (!liveBase.current) return; const base = liveBase.current; liveBase.current = null; setPast(history => [...history.slice(-39), base]); setFuture([]); }
  function undo() { const previous = past.at(-1); if (!previous) return; setFuture(items => [draft.design, ...items]); setPast(items => items.slice(0, -1)); onChange({ ...draft, design: previous, garment: previous.garment }); setDirty(true); }
  function redo() { const next = future[0]; if (!next) return; setPast(items => [...items, draft.design]); setFuture(items => items.slice(1)); onChange({ ...draft, design: next, garment: next.garment }); setDirty(true); }
  function applyPattern(pattern: string) { edit(area === 'all' ? { pattern: pattern === 'None' ? 'Solid' : pattern, patternImage: null, zones: {} } : { zones: { ...draft.design.zones, [area]: pattern } }); }
  async function dropArtwork(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault(); const payload = dragging; setDragging(null);
    if (!payload || !viewer.current || !stage.current) return;
    // The 3D frame's own box: on phones it is drawn a little wider than the stage (studio-tools.css), so the kit shows larger.
    const rect = (stage.current.querySelector('.studio-viewer iframe') ?? stage.current).getBoundingClientRect();
    try {
      const hit = await viewer.current.pick((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
      if (!hit.hit || !hit.part || !hit.side || hit.x === undefined || hit.y === undefined) { onNotice('Drop directly onto the garment or a 2D panel.'); return; }
      if (payload.pattern && hit.zone) { const where = patternAreas(latest.current.design.garment, latest.current.design.trackStyle).find(a => a.key === hit.zone)?.label ?? hit.zone; edit({ zones: { ...latest.current.design.zones, [hit.zone]: payload.pattern } }); onNotice(`${payload.pattern} applied to the ${where.toLowerCase()}.`); return; }
      if (payload.asset) {
        const src = await readAsset(payload.asset); const currentLayers = latest.current.design.layers || [];
        if (currentLayers.length >= 40) { onNotice('A design can contain up to 40 artwork layers.'); return; }
        const id = crypto.randomUUID(); const layer: ArtworkLayer = { id, type: 'image', name: payload.asset.name, src, part: hit.part, side: hit.side, x: hit.x, y: hit.y, w: 0.12 };
        edit({ layers: [...currentLayers, layer] }); setSelectedLayer(id); viewer.current.select(id);
        onNotice(`${payload.asset.name} placed on the ${hit.side}.`);
      }
    } catch (e) { onNotice((e as Error).message); }
  }
  useEffect(() => { const key = (e: KeyboardEvent) => { if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).matches('input,textarea')) return; if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });

  async function captureThumbnail(size = 800) {
    if (!ready || !viewer.current) return undefined;
    const source = await viewer.current.capture('front');
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = source; });
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, size / image.width, size / image.height);
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const thumbnail = await captureThumbnail(); const project = await api<Project>(draft.id ? `/projects/${draft.id}` : '/projects', { method: draft.id ? 'PATCH' : 'POST', body: JSON.stringify({ name: name.trim(), sport: draft.sport, garment: draft.garment, mode: draft.mode, design: draft.design, status: 'draft', ...(thumbnail ? { thumbnail } : {}), ...(draft.id ? { expected_version: draft.version } : {}) }) }); try { if (ownState.own) localStorage.setItem(`3deezi.own.${project.id}`, JSON.stringify(ownState)); } catch { /* full */ } ownLoaded.current = `3deezi.own.${project.id}`; onChange({ ...project }); setDirty(false); setModal(null); onNotice(`${project.name} saved · Version ${project.version}`); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function blobData(blob: Blob) { return new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Unable to read this image.')); r.readAsDataURL(blob); }); }
  async function aiPattern() {
    if (motif.trim().length < 3) return;
    edit({ patternImage: null }, { patternMotif: motif.trim() }); setMotif('');
  }
  /** "Ask 3DEEZI to change anything." */
  /** The Studio AI changes the kit from words (and an optional reference image); returns its reply. */
  async function aiEdit(instruction: string, image: string | null = null) {
    const r = await api<{ design: Partial<Design>; reply: string; motif: string | null }>('/ai/edit', { method: 'POST', body: JSON.stringify({ instruction, design: latest.current.design, image }) });
    edit(r.motif ? { ...r.design, patternImage: null } : r.design, r.motif ? { patternMotif: r.motif } : {});
    return r.reply + (r.motif ? ' Creating the new print now…' : '');
  }
  async function askAi(text = ask) {
    const instruction = text.trim();
    if (!instruction || asking) return;
    if (!aiEnabled) { onNotice('AI is not connected on this server.'); return; }
    setAsking(true); setAsk(''); setChat(c => [...c, { from: 'you', text: instruction }]);
    const image = askImage; setAskImage(null);
    try {
      const reply = await aiEdit(instruction, image);
      setChat(c => [...c, { from: '3deezi', text: reply }]);
      if (tool !== 'ai') onNotice(reply);
    } catch (e) { setChat(c => [...c, { from: '3deezi', text: `Sorry, that didn’t work: ${(e as Error).message}` }]); }
    finally { setAsking(false); }
  }
  async function generateShowcase() {
    if (!viewer.current) { setError('The 3D viewer is still starting. Please try again.'); return; }
    setBusy(true); setError('');
    try {
      const image = await viewer.current.capture(showcaseBack ? 'back' : 'front');
      const result = await api<{ image: string }>('/ai/showcase', { method: 'POST', body: JSON.stringify({ image, scene, back: showcaseBack, sport: catalog?.sports.find(s => s.id === draft.sport)?.name || draft.sport, garment: productName(draft.design, catalog), logoText: showcaseBack ? (draft.design.backName || draft.design.logoText) : draft.design.logoText, number: draft.design.number, name: draft.name }) });
      setShowcases(items => [...items, result.image]); setSelectedShowcase(showcases.length);
      onNotice('Showcase ready · also saved in your Assets.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function exportDesign(format: 'png' | 'front-back' | 'json' | 'artboard' | 'pdf') {
    setBusy(true); setError(''); const filename = (draft.name || '3deezi-kit').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    try {
      if (format === 'json') saveBlob(new Blob([JSON.stringify({ schema: '3deezi.design.v1', name: draft.name, sport: draft.sport, garment: draft.garment, mode: draft.mode, version: draft.version || 1, design: draft.design }, null, 2)], { type: 'application/json' }), `${filename}.json`);
      else if (format === 'artboard') {
        if (!viewer.current) throw new Error('The 2D panels are still starting. Please try again.');
        const png = await viewer.current.captureBoard(); saveBlob(await (await fetch(png)).blob(), `${filename}-print-panels.png`);
      } else if (format === 'pdf') {
        // One-page design sheet: front and back views with colours, pattern, text and artwork.
        if (!viewer.current) throw new Error('The 3D viewer is still starting. Please try again.');
        const front = await viewer.current.capture('front'), back = await viewer.current.capture('back');
        const panels = await viewer.current.captureBoard().catch(() => null);
        const sheet = await designSheetPdf({ name: draft.name || 'Untitled kit', sport: catalog?.sports.find(s => s.id === draft.sport)?.name ?? draft.sport, garment: productName(draft.design, catalog), version: draft.version || 1, design: draft.design, front, back, panels });
        saveBlob(sheet, `${filename}-design-sheet.pdf`);
      } else {
        if (!viewer.current) throw new Error('The 3D viewer is still starting. Please try again.');
        const front = await viewer.current.capture(format === 'png' ? view : 'front');
        if (format === 'png') saveBlob(await (await fetch(front)).blob(), `${filename}-${view}.png`);
        else { const back = await viewer.current.capture('back'); const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); const images = await Promise.all([load(front), load(back)]); const canvas = document.createElement('canvas'); canvas.width = images[0].width * 2; canvas.height = images[0].height; const context = canvas.getContext('2d'); if (!context) throw new Error('Image export is unavailable in this browser.'); images.forEach((img, i) => context.drawImage(img, i * images[0].width, 0)); const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not create the image.')), 'image/png')); saveBlob(blob, `${filename}-front-back.png`); }
      }
      onNotice('Your design export is ready.');
    } catch (e) { setError((e as Error).message || 'Export failed. Please try again.'); } finally { setBusy(false); }
  }
  const garmentOrder = ['fullkit', 'jersey', 'shorts', 'tee', 'singlet', 'netball-dress', 'polo', 'pocketpolo', 'hoodie', 'ziphoodie', 'trackjacket', 'varsity'];
  const garments = [...(catalog?.garments ?? [])].sort((a, b) => garmentOrder.indexOf(a.id) - garmentOrder.indexOf(b.id));
  const pick = (t: Tool) => { setTool(current => current === t ? null : t); setError(''); setGradientOpen(false); };
  const colourValue = slot === 'patternColor' ? (draft.design.patternColor || draft.design.secondary) : draft.design[slot];
  // The selected colour zone's gradient (Accent stays solid: names, numbers and the wordmark).
  const gradientSlot: GradientSlot | null = slot === 'accent' ? null : slot;
  const zoneGradient = gradientSlot ? gradientOf(draft.design, gradientSlot) : null;
  const zoneStops = zoneGradient ? stopsOf(zoneGradient) : null;
  const applyGradient = (g: Gradient | null) => { if (gradientSlot) edit(gradientPatch(latest.current.design, gradientSlot, g)); };
  const previewGradient = (g: Gradient) => { if (gradientSlot) preview(gradientPatch(latest.current.design, gradientSlot, g)); };
  /** From or To changed: the first or last stop; the stops between are kept. */
  const gradientEnd = (end: 'from' | 'to', hex: string) => { if (!zoneGradient || !zoneStops) return; const stops = zoneStops.map((s, i) => (end === 'from' ? i === 0 : i === zoneStops.length - 1) ? { ...s, color: hex } : s); previewGradient(makeGradient(stops, zoneGradient.angle, null)); };

  return <div className={`dyo studio-extended ${board ? 'artboard-mode' : ''} ${tool === 'presets' ? 'presets-in-panel' : ''} ${tool ? `tool-open tool-${tool}` : ''}`}>
    <header className="dyo-top">
      <Link to="/" className="dyo-brand" aria-label="3DEEZI home"><img src={media('images/brand-final.png')} alt="3DEEZI" /><span>AI SPORTSWEAR DESIGNER</span></Link>
      <span className="dyo-title">{board ? '2D PANELS' : 'DYO STUDIO'}</span>
      <label className="dyo-name"><span>Project name</span><input value={draft.name} maxLength={120} onChange={e => { onChange({ ...draft, name: e.target.value }); setDirty(true); }} aria-label="Project name" /></label>
      <div className="dyo-actions">
        <button className="button button-outline studio-mode-button" onClick={() => navigate('/artboard')}><PenTool size={16} /> Artboard</button><button className="button button-outline studio-mode-button" onClick={() => openBoard(!board)}>{board ? <Shirt size={16} /> : <Layers size={16} />}{board ? '3D view' : '2D panels'}</button>
        <button className="round-button" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={18} /></button>
        <button className="round-button" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 size={18} /></button>
        <button className="button button-outline studio-save" onClick={() => requireAuth(() => { setError(''); setName(draft.name === 'Untitled kit' ? '' : draft.name); setModal('save'); })}><Save size={16} /> Save{dirty && <i className="dirty-dot" aria-label="Unsaved changes" />}</button>
        <button className="button button-gradient" onClick={() => { setError(''); setModal('export'); }}><Download size={16} /> Export</button>
        <div className="dyo-menu"><button className="round-button" onClick={() => setMenu(m => !m)} aria-label="More" aria-expanded={menu}><MoreVertical size={18} /></button>
          {menu && <div className="menu-pop" onClick={() => setMenu(false)}>{aiEnabled && <button onClick={() => requireAuth(() => { setError(''); setModal('showcase'); })}><WandSparkles size={15} /> Photoreal showcase</button>}{aiEnabled && <button onClick={() => requireAuth(() => setMockupOpen(true))}><Camera size={15} /> Mockup</button>}<button onClick={() => requireAuth(() => { if (!draft.id || dirty) { onNotice('Save your project first, then order it.'); setName(draft.name === 'Untitled kit' ? '' : draft.name); setModal('save'); } else setOrdering(true); })}><Package size={15} /> Order this kit</button><button onClick={() => navigate('/orders')}><Box size={15} /> My orders</button><button onClick={() => navigate('/create/ai')}><Sparkles size={15} /> New AI design</button><button onClick={() => navigate('/create/sport', { state: { keep: true } })}><Shirt size={15} /> Change sport</button><button onClick={() => navigate('/projects')}><Box size={15} /> My projects</button></div>}
        </div>
      </div>
    </header>

    <div className={`dyo-body ${tool ? 'panel-open' : ''}`}>
      <nav className="dyo-rail" aria-label="Design tools">{tools.map(t => <button key={t.id} className={tool === t.id ? 'active' : ''} onClick={() => pick(t.id)} aria-pressed={tool === t.id}><t.icon size={22} /><span>{t.label}</span></button>)}</nav>

      {tool && <section className="dyo-panel" ref={colourPanel} aria-label={tools.find(t => t.id === tool)?.label}>
        <div className="panel-head"><h2>{tools.find(t => t.id === tool)?.label}</h2><button className="icon-button" onClick={() => setTool(null)} aria-label="Close panel"><X size={18} /></button></div>
        <div className="panel-body">
          {tool === 'colours' && <>
            <div className="slot-tabs" role="tablist">{colourSlots.map(s => <button key={s.key} role="tab" aria-selected={slot === s.key} className={slot === s.key ? 'active' : ''} onClick={() => setSlot(s.key)}>{s.label}</button>)}</div>
            <ColorWheel value={colourValue} onChange={hex => preview({ [slot]: hex })} onCommit={commit} onDone={() => { setTool(null); setGradientOpen(false); }} />
            <h4>READY-MADE PALETTES</h4><div className="preset-palettes">{palettes.map((palette, index) => <button key={index} aria-label={`Apply palette ${index + 1}`} onClick={() => edit({ main: palette[0], secondary: palette[1], accent: palette[2], patternColor: palette[1] })}>{palette.map((c, i) => <span key={i} style={{ background: c }} />)}</button>)}</div>
            {isHoodie(draft.design.garment) && <div className="hoodie-areas"><h4>HOODIE AREAS</h4>{hoodieAreas.filter(a => a.key !== 'zip' || draft.design.garment === 'ziphoodie').map(a => { const own = draft.design.zoneColors?.[a.key]; const fallback = a.key === 'lining' || a.key === 'zip' ? draft.design.secondary : draft.design.main; return <label key={a.key} className="hoodie-area"><input type="color" aria-label={`${a.label} colour`} value={own || fallback} onChange={e => preview({ zoneColors: { ...draft.design.zoneColors, [a.key]: e.target.value } })} onBlur={commit} /><span>{a.label}</span>{own ? <button type="button" className="icon-button" aria-label={`${a.label}: back to the kit colours`} title="Back to the kit colours" onClick={() => { const next = { ...draft.design.zoneColors }; delete next[a.key]; edit({ zoneColors: next }); }}><X size={13} /></button> : <small>{a.key === 'lining' || a.key === 'zip' ? 'Secondary' : 'Primary'}</small>}</label>; })}</div>}
            {isVarsity(draft.design.garment) && <div className="hoodie-areas varsity-areas"><h4>VARSITY AREAS</h4>{varsityAreas.map(a => { const own = draft.design.zoneColors?.[a.key]; return <label key={a.key} className="hoodie-area"><input type="color" aria-label={`${a.label} colour`} value={varsityColour(draft.design, a.key)} onChange={e => preview({ zoneColors: { ...draft.design.zoneColors, [a.key]: e.target.value } })} onBlur={commit} /><span>{a.label}</span>{own ? <button type="button" className="icon-button" aria-label={`${a.label}: back to the kit colours`} title="Back to the kit colours" onClick={() => { const next = { ...draft.design.zoneColors }; delete next[a.key]; edit({ zoneColors: next }); }}><X size={13} /></button> : <small>{a.follows}</small>}</label>; })}</div>}
            {isTrack(draft.design.garment) && <div className="hoodie-areas track-areas"><h4>TRACK JACKET AREAS</h4>{trackAreas.map(a => { const own = draft.design.zoneColors?.[a.key]; const label = trackAreaLabel(a.key, draft.design.trackStyle); return <label key={a.key} className="hoodie-area"><input type="color" aria-label={`${label} colour`} value={trackColour(draft.design, a.key)} onChange={e => preview({ zoneColors: { ...draft.design.zoneColors, [a.key]: e.target.value } })} onBlur={commit} /><span>{label}</span>{own ? <button type="button" className="icon-button" aria-label={`${label}: back to the kit colours`} title="Back to the kit colours" onClick={() => { const next = { ...draft.design.zoneColors }; delete next[a.key]; edit({ zoneColors: next }); }}><X size={13} /></button> : <small>{a.follows}</small>}</label>; })}</div>}
            <div className="gradient-controls"><h4>GRADIENT FILL</h4>{gradientSlot ? <>
              <button ref={gradientButton} type="button" className="gradient-choose" aria-expanded={gradientOpen} onClick={() => setGradientOpen(o => !o)}>CHOOSE GRADIENT <ChevronRight size={17} /></button>
              {zoneGradient && zoneStops ? <>
                <div className="gradient-colours"><label>From<input aria-label="Gradient start colour" type="color" value={zoneStops[0].color} onChange={e => gradientEnd('from', e.target.value)} onBlur={commit} /></label><label>To<input aria-label="Gradient end colour" type="color" value={zoneStops[zoneStops.length - 1].color} onChange={e => gradientEnd('to', e.target.value)} onBlur={commit} /></label></div>
                {zoneStops.length > 2 && <div className="gradient-stops-preview" style={{ background: cssGradient(zoneStops, 90) }} title={`${zoneStops.length} colours: ${zoneStops.map(s => s.color.toUpperCase()).join(', ')}`}><span>{zoneStops.length} COLOURS</span></div>}
                <label className="field">Angle · {zoneGradient.angle}°<input type="range" min={0} max={360} step={5} value={zoneGradient.angle} onChange={e => previewGradient({ ...zoneGradient, angle: Number(e.target.value) })} onPointerUp={commit} onKeyUp={commit} aria-label="Gradient angle" /></label>
                <button type="button" className="gradient-off" onClick={() => applyGradient(null)}><X size={14} /> Turn gradient off · solid colour</button>
              </> : <p className="field-hint">Solid colour. Choose a gradient to blend colours across this zone.</p>}
            </> : <p className="field-hint">Names, numbers and the wordmark stay a solid colour. Choose Primary, Secondary or Pattern for a gradient fill.</p>}</div>
            {gradientOpen && gradientSlot && <GradientFlyout slot={gradientSlot} slotLabel={colourSlots.find(c => c.key === gradientSlot)?.label.toUpperCase() ?? ''} gradient={zoneGradient} base={colourValue} fallback={gradientSlot === 'main' ? draft.design.secondary : draft.design.main} apply={applyGradient} preview={previewGradient} commit={commit} onClose={() => setGradientOpen(false)} anchor={colourPanel} opener={gradientButton} />}
          </>}
          {tool === 'patterns' && <>
            <label className="field">Apply to area<select value={area} onChange={e => setZone(e.target.value as Zone | 'all')}><option value="all">Whole garment</option>{areas.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
            <p className="field-hint">Choose a pattern for this area, or drag a pattern directly onto the garment.</p>
            <div className="pattern-grid">{patternNames.map(pattern => { const active = (area === 'all' ? draft.design.pattern : draft.design.zones?.[area]) === pattern && (area !== 'all' || !draft.design.patternImage); return <button className={active ? 'selected' : ''} key={pattern} draggable onDragStart={e => { e.dataTransfer.setData('text/plain', pattern); e.dataTransfer.effectAllowed = 'copy'; setDragging({ pattern }); }} onDragEnd={() => setDragging(null)} onClick={() => applyPattern(pattern)}><span className={`pattern-preview pattern-${pattern.toLowerCase()}`} style={{ '--pattern-color': draft.design.patternColor || draft.design.secondary } as React.CSSProperties} /><span>{pattern}{active && <Check size={14} />}</span></button>; })}</div>
            {aiEnabled && <div className="ai-pattern"><h4>AI PRINT FROM WORDS</h4><div className="inline-field"><input value={motif} onChange={e => setMotif(e.target.value)} onKeyDown={e => e.key === 'Enter' && aiPattern()} placeholder="e.g. Maori-inspired koru waves" maxLength={200} /><button className="button button-gradient" disabled={patternBusy || motif.trim().length < 3} onClick={aiPattern}>{patternBusy ? <LoaderCircle className="spin" size={16} /> : <WandSparkles size={16} />}</button></div>{draft.design.patternImage && <button className="button button-secondary full-width" onClick={() => edit({ patternImage: null })}><X size={14} /> Remove AI print</button>}</div>}
            <label className="field">Pattern coverage<input type="range" min="0" max="1" step="0.05" value={draft.design.patternBody ?? 0.1} onChange={e => preview({ patternBody: Number(e.target.value) })} onPointerUp={commit} /><span className="field-hint">{draft.design.garment === 'shorts' ? 'Leg hems → Full shorts' : draft.design.garment === 'fullkit' ? 'Shoulders & leg hems → Full kit' : 'Shoulders → Full body'}</span></label>
          </>}
          {tool === 'logos' && <><ArtworkPanel design={draft.design} edit={edit} shelved={shelved} viewer={viewer} selected={selectedLayer} onSelect={setSelectedLayer} requireAuth={requireAuth} onNotice={onNotice} onDrag={setDragging} ready={ready} board={board} onBoard={() => openBoard(true)} />
            {(draft.design.logoImage || draft.design.sponsorImage) && <h4>EXISTING FIXED LOGOS</h4>}
            {draft.design.logoImage && <div className="applied-logo"><img src={draft.design.logoImage} alt="Existing team logo" /><span>Chest crest</span><button className="icon-button" aria-label="Remove existing team logo" onClick={() => edit({ logoImage: null })}><X size={16} /></button></div>}
            {draft.design.sponsorImage && <div className="applied-logo"><img src={draft.design.sponsorImage} alt="Existing sponsor" /><span>Sponsor</span><button className="icon-button" aria-label="Remove existing sponsor" onClick={() => edit({ sponsorImage: null })}><X size={16} /></button></div>}
          </>}
          {tool === 'text' && <>
            <label className="field">Team wordmark<input value={draft.design.logoText} maxLength={20} onChange={e => edit({ logoText: e.target.value })} placeholder="YOUR TEAM" /></label>
            <div className="studio-tip"><Type size={18} /><p>Short team names create a stronger, more readable wordmark.</p></div>
            <button className="button button-secondary full-width" onClick={() => { setTool('logos'); openBoard(true); }}><Plus size={16} /> Add movable text in 2D panels</button>
          </>}
          {tool === 'numbers' && <>
            <div className="number-preview" style={{ color: draft.design.accent, background: draft.design.main }}><small>{draft.design.backName || 'YOUR NAME'}</small><strong>{draft.design.number || '23'}</strong></div>
            {/* Netball (task 9.116): the position letters (GS, WD…) in the number's place. */}
            {catalog?.sports.find(s => s.id === draft.sport)?.positions?.length
              ? <label className="field">Position letters<input value={draft.design.number} maxLength={3} onChange={e => edit({ number: e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase() })} placeholder="GS" /></label>
              : <label className="field">Player number<input inputMode="numeric" value={draft.design.number} maxLength={3} onChange={e => edit({ number: e.target.value.replace(/\D/g, '') })} placeholder="23" /></label>}
            <label className="field">Player name<input value={draft.design.backName || ''} maxLength={20} onChange={e => edit({ backName: e.target.value })} placeholder="YOUR NAME" /></label>
            <button className="button button-secondary full-width" onClick={() => { setView('back'); setRotating(false); }}>View the back <ArrowRight size={16} /></button>
          </>}
          {tool === 'garment' && <div className="panel-garments">{garments.map(g => <button key={g.id} className={draft.design.garment === g.id ? 'selected' : ''} onClick={() => edit({ garment: g.id as Design['garment'] })}><img src={garmentArt(g.id)} alt="" /><span>{g.name}</span>{draft.design.garment === g.id && <Check size={15} />}</button>)}</div>}
          {tool === 'garment' && isTrack(draft.design.garment) && <div className="track-style"><h4>TRACK JACKET STYLE</h4><div className="slot-tabs" role="radiogroup" aria-label="Track jacket style">{([['collar', 'Stand-up collar'], ['hood', 'Hood']] as const).map(([id, label]) => { const on = (draft.design.trackStyle ?? 'collar') === id; return <button key={id} type="button" role="radio" aria-checked={on} className={on ? 'active' : ''} onClick={() => edit({ trackStyle: id })}>{label}</button>; })}</div></div>}
          {tool === 'presets' && <PresetPanel design={draft.design} edit={edit} onNotice={onNotice} own={ownState.own} onOwn={restoreOwn} beforePreset={beforePreset} />}
          {tool === 'ai' && <div className="ai-chat">
            {!aiEnabled && <p className="muted">AI is not connected on this server.</p>}
            {chat.length === 0 && <div className="ai-hello"><Sparkles size={20} /><p>Tell me what to change, like you would in ChatGPT. Colours, patterns, names, numbers. Attach an image to match its style.</p></div>}
            {chat.map((m, i) => <p key={i} className={`bubble ${m.from === 'you' ? 'mine' : ''}`}>{m.text}</p>)}
            {asking && <p className="bubble typing"><LoaderCircle className="spin" size={14} /> Designing…</p>}
            <div ref={chatEnd} />
            <div className="prompt-chips">{suggestions.map(s => <button key={s} type="button" disabled={asking || !aiEnabled} onClick={() => askAi(s)}>{s}</button>)}</div>
            {aiEnabled && <button className="button button-secondary full-width" onClick={() => requireAuth(() => { setError(''); setModal('showcase'); })}><WandSparkles size={16} /> Photoreal showcase</button>}
            {aiEnabled && <button className="button button-secondary full-width" onClick={() => requireAuth(() => setMockupOpen(true))}><Camera size={16} /> Mockup</button>}
            {aiEnabled && <PlayerShotButton disabled={!ready} requireAuth={requireAuth} kit={{ sport: catalog?.sports.find(s => s.id === draft.sport)?.name || draft.sport, garment: productName(draft.design, catalog), name: draft.name, colours: [draft.design.main, draft.design.secondary, draft.design.accent], logoText: draft.design.logoText, backName: draft.design.backName || draft.design.logoText, number: draft.design.number }} pictures={async () => viewer.current ? [await viewer.current.capture('front'), await viewer.current.capture('back')] : []} />}
          </div>}
          {error && !modal && <p className="error-message" role="alert">{error}</p>}
        </div>
      </section>}

      <div className={`dyo-stage ${viewerModal ? 'viewer-modal' : ''}`} ref={stage}>
        <KitViewer ref={viewer} design={draft.design} view={view} rotating={rotating} board={board} onLayers={layers => edit({ layers })} onMarks={marks => edit({ marks })} onModal={setViewerModal} onLayoutError={message => onNotice(`Print layout: ${message} The kit is shown without it (Artwork › Factory print layout).`)} onSelection={setSelectedLayer} onReady={() => setReady(true)} className="studio-viewer" />
        {dragging && <div className="studio-drop-target" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={dropArtwork}><span>Drop {dragging.pattern ? `${dragging.pattern} on an area` : 'artwork onto your garment'}</span></div>}
        {board && <div className="artboard-controls"><span>Drag anything to move it · corners resize · top handle rotates · scroll or pinch to zoom</span><div className="board-buttons"><button className="board-to-3d" onClick={() => openBoard(false)} title="Back to the 3D kit"><Shirt size={14} /> 3D view</button><button disabled={!ready} onClick={() => viewer.current?.zoomBoard('out')} aria-label="Zoom out" title="Zoom out"><ZoomOut size={15} /></button><button disabled={!ready} onClick={() => viewer.current?.zoomBoard('in')} aria-label="Zoom in" title="Zoom in"><ZoomIn size={15} /></button><button disabled={!ready} onClick={() => viewer.current?.zoomBoard('fit')} title="Show the whole board"><Maximize size={14} /> Fit</button>{Object.keys(draft.design.marks ?? {}).length > 0 && <button onClick={() => edit({ marks: {} })} title="Put the wordmark, crest, sponsor, name and number back where they were (shows any you removed)"><RotateCcw size={14} /> Reset layout</button>}<button disabled={!ready || busy} onClick={() => void exportDesign('artboard')}><Download size={14} /> Export board</button></div></div>}
        <div className="stage-chips"><label className="stage-name" title="Project name"><input value={draft.name} maxLength={120} placeholder="Project name" onChange={e => { onChange({ ...draft, name: e.target.value }); setDirty(true); }} aria-label="Project name" /><Pencil size={12} aria-hidden="true" /></label>{patternBusy &&<span><LoaderCircle className="spin" size={13} /> Creating AI print…</span>}<span>{catalog?.sports.find(s => s.id === draft.sport)?.name || draft.sport} · {draft.design.layout ? `${draft.design.layout.kind === 'drawing' ? 'Design picture' : 'Print layout'} · ${draft.design.layout.name}` : productName(draft.design, catalog)}</span></div>
        <div className="view-controls">{(['front', 'back', 'side'] as View[]).map(v => <button key={v} className={view === v && !rotating ? 'active' : ''} onClick={() => { setView(v); setRotating(false); }}>{v}</button>)}<button className={rotating ? 'active' : ''} onClick={() => setRotating(r => !r)} aria-pressed={rotating}><RotateCcw size={14} /> 360°</button><button className="fullscreen" aria-label="Fullscreen preview" onClick={() => { stage.current?.requestFullscreen?.().catch(() => onNotice('Fullscreen is unavailable in this browser.')); }}><Expand size={16} /></button></div>
      </div>

      <aside className="studio-presets-aside" aria-label="Ready to use designs"><PresetPanel design={draft.design} edit={edit} onNotice={onNotice} own={ownState.own} onOwn={restoreOwn} beforePreset={beforePreset} /></aside>
      <aside className="dyo-garments" aria-label="Garments">{garments.map(g => <button key={g.id} className={draft.design.garment === g.id ? 'selected' : ''} onClick={() => edit({ garment: g.id as Design['garment'] })} aria-pressed={draft.design.garment === g.id}><img src={garmentArt(g.id)} alt="" /><span>{g.name}</span></button>)}{comingSoon.map(g => <button key={g.id} className="soon" disabled title="Coming soon"><img src={garmentArt(g.id)} alt="" /><span>{g.name}</span><small>SOON</small></button>)}</aside>
    </div>

    <form className="dyo-prompt" onSubmit={e => { e.preventDefault(); requireAuth(() => askAi()); }}>
      <button type="button" className="round-button" aria-label="Attach a reference image" title="Attach a reference image" onClick={() => askUpload.current?.click()}><ImagePlus size={18} /></button>
      <button type="button" className="round-button" aria-label="Add your logo" title="Add your logo" onClick={() => setTool('logos')}><Plus size={18} /></button>
      {askImage && <span className="ask-image"><img src={askImage} alt="Reference" /><button type="button" onClick={() => setAskImage(null)} aria-label="Remove image"><X size={12} /></button></span>}
      <input value={ask} onChange={e => setAsk(e.target.value)} placeholder={aiEnabled ? (narrow ? 'Ask 3DEEZI…' : 'Ask 3DEEZI to change anything…') : (narrow ? 'AI not connected' : 'AI is not connected on this server')} disabled={!aiEnabled || asking} maxLength={600} aria-label="Ask 3DEEZI to change anything" />
      <button className="send-button" disabled={!aiEnabled || asking || !ask.trim()} aria-label="Send">{asking ? <LoaderCircle className="spin" size={18} /> : <SendHorizontal size={18} />}</button>
      <button type="button" className="round-button" aria-label="Open the AI panel" title="AI panel" onClick={() => setTool('ai')}><SlidersHorizontal size={18} /></button>
    </form>
    <input type="file" hidden ref={askUpload} accept="image/png,image/jpeg,image/webp" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (file.size > 5 * 1024 * 1024) { onNotice('Use a reference image smaller than 5 MB.'); return; } setAskImage(await blobData(file)); }} />

    {ordering && user && draft.id && <OrderKitDialog projectId={draft.id} projectName={draft.name} user={user} onClose={() => setOrdering(false)} onOrdered={order => { setOrdering(false); const pay = paymentPath(order); if (pay) { onNotice(`Order ${order.number} sent.`); navigate(pay); } else onNotice(`Order ${order.number} sent · we’ll confirm the price.`); }} />}
    {mockupOpen && <ProductMockupDialog viewer={viewer} ready={ready} onClose={() => setMockupOpen(false)} onNotice={onNotice} meta={{ name: draft.name, sport: catalog?.sports.find(s => s.id === draft.sport)?.name || draft.sport, garment: productName(draft.design, catalog), logoText: draft.design.logoText, backName: draft.design.backName, number: draft.design.number, colors: [draft.design.main, draft.design.secondary, draft.design.accent] }} />}
    {modal && <dialog ref={dialog} className="modal compact-modal" onCancel={() => !busy && setModal(null)}><button className="icon-button modal-close" disabled={busy} onClick={() => setModal(null)} aria-label="Close dialog"><X /></button><span className="eyebrow">{modal === 'save' ? 'KEEP THE GOOD IDEAS' : modal === 'showcase' ? 'PHOTOREAL SHOWCASE' : 'READY TO SHARE'}</span><h2>{modal === 'save' ? 'Save your project.' : modal === 'showcase' ? 'Your design, for real.' : 'Take your design with you.'}</h2>{modal === 'showcase' ? <div className="showcase-panel"><p className="muted">The live 3D kit is captured and turned into a photoreal marketing image. The design itself stays exactly as you made it.</p><div className="showcase-frame">{showcases.length ? <img src={showcases[selectedShowcase]} alt="Photoreal showcase of your design" /> : <span>{busy ? 'Creating your showcase… about a minute' : 'Choose a scene and generate.'}</span>}{busy && <LoaderCircle className="spin showcase-spinner" size={28} />}</div>{showcases.length > 1 && <div className="showcase-strip">{showcases.map((src, i) => <button key={i} className={i === selectedShowcase ? 'selected' : ''} onClick={() => setSelectedShowcase(i)}><img src={src} alt={`Showcase ${i + 1}`} /></button>)}</div>}<div className="prompt-chips">{(catalog?.showcase_scenes || []).map(s => <button type="button" key={s} className={scene === s ? 'selected' : ''} disabled={busy} onClick={() => setScene(s)}>{s}</button>)}</div><div className="prompt-chips">{([['Front', false], ['Back', true]] as const).map(([label, back]) => <button type="button" key={label} className={showcaseBack === back ? 'selected' : ''} disabled={busy} onClick={() => setShowcaseBack(back)}>{label}</button>)}</div>{error && <p className="error-message" role="alert">{error}</p>}<div className="showcase-actions"><button className="button button-gradient" disabled={busy || !ready} onClick={generateShowcase}>{busy ? <LoaderCircle className="spin" size={17} /> : <WandSparkles size={17} />}{busy ? 'GENERATING…' : 'GENERATE SHOWCASE'}</button>{showcases.length > 0 && <button className="button button-secondary" disabled={busy} onClick={async () => saveBlob(await (await fetch(showcases[selectedShowcase])).blob(), `${(draft.name || '3deezi-kit').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}-showcase-${selectedShowcase + 1}.jpg`)}><Download size={16} /> Download</button>}{showcases.length > 0 && <EditImageButton disabled={busy} src={showcases[selectedShowcase]} title={`Showcase ${selectedShowcase + 1}`} fileName={`${(draft.name || '3deezi-kit').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}-showcase-${selectedShowcase + 1}`} ai={aiEnabled} requireAuth={requireAuth} keepAs={`${draft.name || 'Kit'} showcase (edited)`} onUse={image => { const at = selectedShowcase; setShowcases(items => items.map((s, i) => i === at ? image : s)); onNotice('Showcase updated · also saved in your Assets.'); }} />}</div><p className="field-hint">Every showcase is also saved in your Assets.</p></div> : modal === 'save' ? <form onSubmit={save}><p className="muted">{draft.id ? `Save a new version of your kit. Version ${draft.version || 1} will stay in your history.` : 'Your kit will be saved to your personal Projects library.'}</p><label className="field">Project name<input autoFocus value={name} onChange={e => setName(e.target.value)} required maxLength={120} placeholder="e.g. Coastal Warriors — Home kit" /></label><div className="save-summary"><span>{catalog?.sports.find(s => s.id === draft.sport)?.name}</span><span>{productName(draft.design, catalog)}</span><span>VERSION {(draft.version || 0) + 1}</span></div>{error && <p className="error-message" role="alert">{error}</p>}<button className="button button-gradient full-width" disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}SAVE PROJECT<ArrowRight size={17} /></button></form> : <><p className="muted">Download your print panels, a 3D scene capture, a PDF design sheet or the editable design specification.</p><div className="export-options"><button disabled={busy || !ready} onClick={() => exportDesign('artboard')}><Layers /><span><strong>2D print panels</strong><small>Front and back print panels / PNG image</small></span><Download size={18} /></button><button disabled={busy || !ready} onClick={() => exportDesign('png')}><Box /><span><strong>3D mockup</strong><small>Current view · PNG image</small></span><Download size={18} /></button><button disabled={busy || !ready} onClick={() => exportDesign('front-back')}><Shirt /><span><strong>Front & back</strong><small>Two views · One PNG image</small></span><Download size={18} /></button><button disabled={busy || !ready} onClick={() => exportDesign('pdf')}><FileText /><span><strong>Design sheet</strong><small>Front & back views, colours and details · PDF</small></span><Download size={18} /></button><button disabled={busy} onClick={() => exportDesign('json')}><Grid2X2 /><span><strong>Design specification</strong><small>Colours, pattern, and player details · JSON</small></span><Download size={18} /></button></div>{busy && <p className="export-progress"><LoaderCircle className="spin" size={17} /> Preparing your download…</p>}{error && <p className="error-message" role="alert">{error}</p>}<p className="field-hint">Mockups are for design review. These exports do not include manufacturing patterns or a production tech pack.</p></>}</dialog>}
  </div>;
}
