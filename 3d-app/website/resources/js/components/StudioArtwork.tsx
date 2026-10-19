import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, Copy, FileUp, ImagePlus, Layers, LoaderCircle, PenTool, Plus, Search, Trash2, Type, Upload, WandSparkles, Star } from 'lucide-react';
import { api, fetchFile, getToken, media, type Project } from '../api';
import type { ArtworkLayer, Design } from '../types';
import type { KitViewerHandle } from './KitViewer';

export type LibraryAsset = { id: number; name: string; type: string; src?: string };
export type ArtworkDrop = { asset?: LibraryAsset; pattern?: string };
export const patternNames = ['None', 'Solid', 'Chevron', 'Stripes', 'Velocity', 'Hoops', 'Dots', 'Diagonal', 'Tribal', 'Camo'];
export const placements = [
    { id: 'left-chest', label: 'Left chest', side: 'front', part: 'top', x: 0.105, y: 0.6, w: 0.075 },
    { id: 'right-chest', label: 'Right chest', side: 'front', part: 'top', x: -0.105, y: 0.6, w: 0.075 },
    { id: 'centre-chest', label: 'Centre chest', side: 'front', part: 'top', x: 0, y: 0.5, w: 0.17 },
    { id: 'full-front', label: 'Full front', side: 'front', part: 'top', x: 0, y: 0.36, w: 0.32 },
    { id: 'left-sleeve', label: 'Left sleeve', side: 'front', part: 'top', x: 0.375, y: 0.54, w: 0.055, rot: -24 },
    { id: 'right-sleeve', label: 'Right sleeve', side: 'front', part: 'top', x: -0.375, y: 0.54, w: 0.055, rot: 24 },
    { id: 'back-top', label: 'Back neck', side: 'back', part: 'top', x: 0, y: 0.66, w: 0.16 },
    { id: 'back-centre', label: 'Back centre', side: 'back', part: 'top', x: 0, y: 0.4, w: 0.26 },
    { id: 'shorts-left', label: 'Shorts left leg', side: 'front', part: 'shorts', x: 0.15, y: 0.2, w: 0.07 },
    { id: 'shorts-right', label: 'Shorts right leg', side: 'front', part: 'shorts', x: -0.15, y: 0.2, w: 0.07 },
] as const;
/** Artwork sent from the Artboard keeps the id of the design it came from: Edit in Artboard opens it again, and sending it again updates the layer in place. */
export type ArtboardLayer = ArtworkLayer & { artboard?: number };
export const artboardOf = (layer?: ArtworkLayer | null) => { const id = (layer as ArtboardLayer | null | undefined)?.artboard; return typeof id === 'number' && id > 0 ? id : undefined; };
export function readImage(blob: Blob) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Unable to read this image.')); reader.readAsDataURL(blob); }); }
export async function readAsset(asset: LibraryAsset) { return asset.src || readImage(await fetchFile(`/assets/${asset.id}/file`)); }

interface ArtworkProps {
    design: Design; edit: (patch: Partial<Design>) => void;
    viewer: React.RefObject<KitViewerHandle | null>; selected: string | null; onSelect: (id: string | null) => void;
    requireAuth: (action?: () => void) => void; onNotice: (message: string) => void;
    onDrag: (payload: ArtworkDrop | null) => void; ready: boolean; board: boolean; onBoard: () => void;
}
export function ArtworkPanel({ design, edit, viewer, selected, onSelect, requireAuth, onNotice, onDrag, ready, board, onBoard }: ArtworkProps) {
    const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('');
    const [placement, setPlacement] = useState('left-chest');
    const [tint, setTint] = useState('#ffffff');
    const navigate = useNavigate();
    const fileInput = useRef<HTMLInputElement>(null);
    const layoutInput = useRef<HTMLInputElement>(null);
    const layers = design.layers || [];
    const layer = layers.find(item => item.id === selected);
    const layout = design.layout;
    const validPlacements = placements.filter(item => design.garment === 'shorts' ? item.part === 'shorts' : design.garment === 'fullkit' || item.part === 'top');
    const at = validPlacements.find(item => item.id === placement) || validPlacements[0];
    const patchLayer = (patch: Partial<ArtworkLayer>) => edit({ layers: layers.map(item => item.id === selected ? { ...item, ...patch } : item) });
    async function task(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
    function add(src: string, name: string) {
        if (layers.length >= 40) { onNotice('A design can contain up to 40 artwork layers.'); return; }
        const id = crypto.randomUUID();
        const { id: _placementId, label: _label, ...position } = at;
        edit({ layers: [...layers, { id, type: 'image', name, src, ...position }] }); onSelect(id); viewer.current?.select(id);
        onNotice(`${name} placed on ${at.label.toLowerCase()}. Open 2D panels to drag, resize and rotate it.`);
    }
    async function load() { await task(async () => {
        const list = (await api<LibraryAsset[]>('/assets')).filter(item => ['logo', 'artwork', 'upload', 'pattern'].includes(item.type));
        // Private files are fetched with the same authorization as the API.
        const results = await Promise.allSettled(list.map(async item => ({ ...item, src: await readAsset(item) })));
        setAssets(results.map((result, index) => result.status === 'fulfilled' ? result.value : list[index]));
        if (results.some(result => result.status === 'rejected')) setError('Some asset previews could not load. Click the asset to retry.');
    }); }
    async function upload(file: File) { await task(async () => {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG or WEBP image.');
        if (file.size > 2 * 1024 * 1024) throw new Error('Choose an image smaller than 2 MB.');
        const form = new FormData(); form.append('file', file); form.append('name', file.name.slice(0, 120)); form.append('type', 'logo');
        const saved = await api<LibraryAsset>('/assets', { method: 'POST', body: form });
        const src = await readImage(file); setAssets(current => [{ ...saved, src }, ...(current || [])]); add(src, file.name);
    }); }
    async function process(options: { removeBg?: boolean; tint?: string }) { if (!layer?.src || !viewer.current) return; await task(async () => {
        const src = await viewer.current!.processImage(layer.src!, options);
        patchLayer({ src }); onNotice(options.removeBg ? 'Plain background removed. Undo restores the original image.' : 'Artwork recoloured. Undo restores the original image.');
    }); }
    /**
     * A factory print layout: kept with the saved assets (so the project opens with it, here and in the app), checked in
     * the 3D viewer, then put on the kit, the same way every time.
     */
    async function importLayout(file: File) { await task(async () => {
        if (!/\.(pdf|svg|png|jpe?g)$/i.test(file.name)) throw new Error('Choose a PDF, SVG, PNG or JPG print layout.');
        if (file.size > 30 * 1024 * 1024) throw new Error('Choose a print layout smaller than 30 MB.');
        if (!viewer.current) throw new Error('The 3D kit is still starting. Please try again.');
        // Named by the file's ending (some systems give no type for PDFs).
        const kind = /\.pdf$/i.test(file.name) ? 'application/pdf' : /\.svg$/i.test(file.name) ? 'image/svg+xml' : /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg';
        const data = await readImage(file);
        const form = new FormData(); form.append('file', file); form.append('name', file.name.slice(0, 120)); form.append('type', 'layout');
        const saved = await api<LibraryAsset>('/assets', { method: 'POST', body: form });
        // A layout not put on the kit is not kept.
        const forget = () => api(`/assets/${saved.id}`, { method: 'DELETE' }).catch(() => undefined);
        const result = await viewer.current.checkLayout(`data:${kind};base64,${data.slice(data.indexOf(',') + 1)}`, file.name, saved.id).catch(async (error) => { await forget(); throw error; });
        if (result.cancelled || !result.roles) { await forget(); return; }
        // The garment shows what the layout makes: a top and shorts are the full kit.
        const parts = result.parts ?? [];
        const garment = parts.includes('shorts') && parts.includes('raglan') ? 'fullkit' : parts.includes('shorts') ? 'shorts' : ['shorts', 'fullkit'].includes(design.garment) ? 'tee' : design.garment;
        edit({ garment, layout: { asset: saved.id, name: file.name.slice(0, 160), roles: result.roles, hemFold: result.hemFold !== false, joinLines: result.joinLines === true, parts: result.parts } });
        onNotice(`Print layout on the 3D kit: ${result.panels?.length ?? 0} panels from ${file.name}. Save the project to keep it.`);
    }); }
    function duplicate() { if (!layer || layers.length >= 40) return; const id = crypto.randomUUID(); edit({ layers: [...layers, { ...layer, id, name: `${layer.name || layer.type} copy`.slice(0, 120), x: Math.min(1, layer.x + 0.025), y: Math.max(-0.5, layer.y - 0.025) }] }); onSelect(id); viewer.current?.select(id); }
    function reorder(direction: number) { const index = layers.findIndex(item => item.id === selected); const to = index + direction; if (index < 0 || to < 0 || to >= layers.length) return; const result = [...layers]; [result[index], result[to]] = [result[to], result[index]]; edit({ layers: result }); }
    function newLayer(type: 'text' | 'shape', shape?: ArtworkLayer['shape']) {
        if (layers.length >= 40) { onNotice('A design can contain up to 40 artwork layers.'); return; }
        const id = crypto.randomUUID(); const { id: _id, label: _label, ...position } = at;
        edit({ layers: [...layers, { ...position, id, type, name: type === 'text' ? 'Team text' : shape, text: type === 'text' ? 'YOUR TEAM' : undefined, shape, size: 0.045, w: 0.15, h: 0.1, color: design.accent }] });
        onSelect(id); viewer.current?.select(id);
    }
    return <div className="artwork-panel">
        <p className="field-hint">Add a logo or artwork, then drag it onto your garment. Every layer stays editable in the 2D panels.</p>
        <label className="field">New artwork placement<select value={at.id} onChange={e => setPlacement(e.target.value)}>{validPlacements.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <button className="logo-upload" disabled={busy} onClick={() => requireAuth(() => fileInput.current?.click())}><Upload size={22} /><strong>Upload logo or artwork</strong><span>PNG, JPG or WEBP · up to 2 MB</span></button>
        <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file); }} />
        <div className="print-layout">
            <strong>FACTORY PRINT LAYOUT</strong>
            <p className="field-hint">The finished print file from the factory (PDF, SVG or PNG with the cut panels laid flat and named FRONT BODY, LEFT SLEEVE …): each panel goes onto the 3D kit, the same way every time.</p>
            {layout
                ? <><p className="print-layout-on"><Check size={15} /> {layout.name} · {layout.roles.filter(role => role !== 'none').length} panels on the kit</p>
                    <label className="print-layout-join"><input type="checkbox" checked={layout.joinLines !== false} onChange={e => edit({ layout: { ...layout, joinLines: e.target.checked } })} /> Join the sleeve bands to the sleeves (no white line between them)</label><button className="button button-outline full-width" disabled={busy} onClick={() => { edit({ layout: null }); onNotice('Print layout removed: back to your designed kit. The file stays in your saved assets.'); }}>Remove print layout</button></>
                : <button className="button button-secondary full-width" disabled={busy || !ready} onClick={() => requireAuth(() => layoutInput.current?.click())}>{busy ? <LoaderCircle className="spin" size={15} /> : <FileUp size={15} />} Upload print layout</button>}
            <input ref={layoutInput} hidden type="file" accept=".pdf,.svg,.png,.jpg,.jpeg,application/pdf,image/svg+xml,image/png,image/jpeg" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importLayout(file); }} />
        </div>
        <button className="button button-secondary full-width" disabled={busy} onClick={() => requireAuth(load)}>{busy ? <LoaderCircle size={15} className="spin" /> : <ImagePlus size={15} />} Load your saved assets</button>
        {assets && <><label className="artwork-search"><Search size={14} /><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find an asset" aria-label="Search assets" /></label><div className="artwork-library">{assets.filter(item => item.name.toLowerCase().includes(filter.toLowerCase())).map(asset => <button key={asset.id} disabled={busy} draggable={!!asset.src} title={`Add ${asset.name}, or drag onto the garment`} onDragStart={e => { e.dataTransfer.setData('text/plain', asset.name); e.dataTransfer.effectAllowed = 'copy'; onDrag({ asset }); }} onDragEnd={() => onDrag(null)} onClick={() => void task(async () => add(await readAsset(asset), asset.name))}>{asset.src ? <img src={asset.src} alt="" /> : <ImagePlus />}<span>{asset.name}</span></button>)}</div>{!assets.length && <p className="muted">No saved artwork yet. Upload an image to get started.</p>}</>}
        <h4>ADD A LAYER</h4><div className="artwork-add"><button onClick={() => newLayer('text')}><Type size={16} /> Text</button>{(['rectangle', 'ellipse', 'triangle'] as const).map(shape => <button key={shape} onClick={() => newLayer('shape', shape)}><span className={`shape-symbol ${shape}`} />{shape}</button>)}</div>
        <h4><Layers size={14} /> ARTWORK LAYERS <span>{layers.length}/40</span></h4>
        <div className="artwork-layers">{[...layers].reverse().map(item => <button key={item.id} className={item.id === selected ? 'selected' : ''} onClick={() => { onSelect(item.id); viewer.current?.select(item.id); }}>{item.type === 'image' ? <img src={item.src} alt="" /> : item.type === 'text' ? <Type size={18} /> : <span className={`shape-symbol ${item.shape}`} />}<span>{item.name || item.text || item.type}<small>{item.part === 'shorts' ? 'Shorts' : 'Top'} · {item.side}</small></span>{item.id === selected && <Check size={14} />}</button>)}{!layers.length && <p className="field-hint">Your added text, logos and shapes appear here.</p>}</div>
        {layer && <div className="layer-properties"><h4>SELECTED LAYER</h4>
            <label className="field">Layer name<input value={layer.name || ''} maxLength={120} onChange={e => patchLayer({ name: e.target.value })} /></label>
            {artboardOf(layer) && <div className="artboard-link"><button className="button button-secondary full-width" onClick={() => navigate(`/artboard?doc=${artboardOf(layer)}`)}><PenTool size={15} /> Edit in Artboard</button><p className="field-hint">Made in the Artboard: change it there, then Send to 3D Studio again to update it here (same place and size).</p></div>}
            {layer.type === 'text' && <label className="field">Text<input value={layer.text || ''} maxLength={100} onChange={e => patchLayer({ text: e.target.value })} /></label>}
            <label className="field">Placement<select value="custom" onChange={e => { const next = validPlacements.find(item => item.id === e.target.value); if (next) { const { id: _id, label: _label, ...position } = next; patchLayer(position); } }}><option value="custom">Custom · {layer.side}</option>{validPlacements.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <div className="layer-fields"><label className="field">X (mm)<input type="number" min={-500} max={500} step={1} value={Math.round(layer.x * 1000)} onChange={e => patchLayer({ x: Math.max(-0.5, Math.min(0.5, Number(e.target.value) / 1000)) })} /></label><label className="field">Y (mm)<input type="number" min={0} max={1000} value={Math.round(layer.y * 1000)} onChange={e => patchLayer({ y: Math.max(0, Math.min(1, Number(e.target.value) / 1000)) })} /></label></div>
            <div className="layer-fields"><label className="field">{layer.type === 'text' ? 'Text size' : 'Width'} (mm)<input type="number" min={10} max={layer.type === 'text' ? 400 : 600} value={Math.round((layer.type === 'text' ? layer.size ?? 0.06 : layer.w ?? 0.1) * 1000)} onChange={e => patchLayer({ [layer.type === 'text' ? 'size' : 'w']: Math.max(0.01, Math.min(layer.type === 'text' ? 0.4 : 0.6, Number(e.target.value) / 1000)) })} /></label><label className="field">Rotation (°)<input type="number" min={-360} max={360} value={layer.rot || 0} onChange={e => patchLayer({ rot: Math.max(-360, Math.min(360, Number(e.target.value))) })} /></label></div>
            {layer.type === 'shape' && <label className="field">Height (mm)<input type="number" min={10} max={600} value={Math.round((layer.h ?? 0.1) * 1000)} onChange={e => patchLayer({ h: Math.max(0.01, Math.min(0.6, Number(e.target.value) / 1000)) })} /></label>}
            <label className="field">Opacity · {Math.round((layer.opacity ?? 1) * 100)}%<input type="range" min={0.05} max={1} step={0.05} value={layer.opacity ?? 1} onChange={e => patchLayer({ opacity: Number(e.target.value) })} /></label>
            {layer.type === 'image' ? <><div className="artwork-tint"><input type="color" aria-label="Artwork tint" value={tint} onChange={e => setTint(e.target.value)} /><button className="button button-secondary" disabled={!ready || busy} onClick={() => void process({ tint })}>Apply colour</button></div><button className="button button-secondary full-width" disabled={!ready || busy} onClick={() => void process({ removeBg: true })}><WandSparkles size={15} /> Remove plain background</button><p className="field-hint">Best for logos with a solid background. Use Undo to restore the original.</p></> : <label className="field">Fill colour<input type="color" value={layer.color || design.accent} onChange={e => patchLayer({ color: e.target.value })} /></label>}
            <div className="layer-actions"><button title="Bring forward" aria-label="Bring layer forward" onClick={() => reorder(1)} disabled={layers.at(-1)?.id === selected}><ArrowUp size={16} /></button><button title="Send backward" aria-label="Send layer backward" onClick={() => reorder(-1)} disabled={layers[0]?.id === selected}><ArrowDown size={16} /></button><button title="Duplicate" aria-label="Duplicate layer" onClick={duplicate} disabled={layers.length >= 40}><Copy size={16} /></button><button title="Delete" aria-label="Delete layer" onClick={() => { edit({ layers: layers.filter(item => item.id !== selected) }); onSelect(null); viewer.current?.select(null); }}><Trash2 size={16} /></button></div>
        </div>}
        {!board && <button className="button button-outline full-width" onClick={onBoard}><Layers size={15} /> Open 2D panels</button>}
        {error && <p className="error-message" role="alert">{error}</p>}
    </div>;
}

type Preset = { id: string; name: string; description: string; design: Partial<Design> };
type Tab = 'all' | 'mine' | 'favourites';
const FAVOURITES = '3deezi.favouritePresets';
const readFavourites = (): string[] => { try { return JSON.parse(localStorage.getItem(FAVOURITES) || '[]'); } catch { return []; } };

/** "Preset designs": ready-made looks (All), the user's saved kits (My designs) and starred ones (Favourites). */
export function PresetPanel({ design, edit, onNotice }: { design: Design; edit: (patch: Partial<Design>) => void; onNotice: (text: string) => void }) {
    const [presets, setPresets] = useState<Preset[]>([]);
    const [mine, setMine] = useState<Project[] | null>(null);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('');
    const [tab, setTab] = useState<Tab>('all');
    const [favourites, setFavourites] = useState<string[]>(readFavourites);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => { let active = true; setError(''); api<Preset[]>('/presets').then(data => { if (active) setPresets(data); }).catch(e => { if (active) setError((e as Error).message); }); return () => { active = false; }; }, [attempt]);
    useEffect(() => {
        if (tab !== 'mine' || mine || !getToken()) return;
        api<Project[]>('/projects').then(setMine).catch(() => setMine([]));
    }, [tab, mine]);
    function matches(preset: Preset) { return ['main', 'secondary', 'accent', 'pattern', 'patternColor', 'patternBody', 'gradient', 'zones'].every(key => preset.design[key as keyof Design] === undefined || JSON.stringify(design[key as keyof Design]) === JSON.stringify(preset.design[key as keyof Design])) && !design.patternImage; }
    function apply(name: string, source: Partial<Design>) {
        const { layers: _layers, garment: _garment, logoText: _wordmark, number: _number, backName: _name, logoImage: _logo, sponsorImage: _sponsor, ...style } = source;
        // Older saves lack these keys: clear them so the look matches exactly.
        edit({ gradient: null, zones: {}, ...style, patternImage: style.patternImage ?? null }); onNotice(`${name} applied. Your logos and player details are preserved.`);
    }
    function toggleFavourite(id: string) {
        const next = favourites.includes(id) ? favourites.filter(f => f !== id) : [...favourites, id];
        setFavourites(next);
        try { localStorage.setItem(FAVOURITES, JSON.stringify(next)); } catch { /* private mode */ }
    }
    const q = filter.toLowerCase();
    const shownPresets = presets.filter(p => (tab === 'all' || favourites.includes(p.id)) && `${p.name} ${p.description} ${p.design.pattern}`.toLowerCase().includes(q));
    const shownMine = (mine ?? []).filter(p => p.name.toLowerCase().includes(q));
    return <div className="studio-presets">
        <div className="preset-heading"><div><span className="eyebrow">READY TO USE</span><h2>Preset designs</h2></div><span>{presets.length}</span></div>
        <div className="preset-tabs" role="tablist">{([['all', 'All designs'], ['mine', 'My designs'], ['favourites', 'Favourites']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
        <label className="artwork-search"><Search size={14} /><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search designs" aria-label="Search designs" /></label>
        {tab === 'mine' ? (
            !getToken() ? <p className="muted">Sign in to see your saved designs here.</p>
            : !mine ? <p className="muted"><LoaderCircle size={14} className="spin" /> Loading your designs…</p>
            : !shownMine.length ? <p className="muted">No saved designs yet. Save a kit and it appears here.</p>
            : <div className="studio-preset-grid">{shownMine.map(p => <button key={p.id} onClick={() => apply(p.name, p.design)} title={`Apply the look of ${p.name}`}>{p.thumbnail ? <img className="preset-thumb" src={p.thumbnail} alt="" loading="lazy" /> : <span className="preset-thumb preset-thumb-empty" style={{ background: `linear-gradient(135deg,${p.design.main},${p.design.secondary})` }} />}<strong>{p.name}</strong><small>Version {p.version}</small></button>)}</div>
        ) : error ? <div><p className="error-message" role="alert">{error}</p><button className="button button-secondary" onClick={() => setAttempt(value => value + 1)}>Retry presets</button></div>
        : !presets.length ? <p className="muted"><LoaderCircle size={14} className="spin" /> Loading designs…</p>
        : !shownPresets.length ? <p className="muted">{tab === 'favourites' ? 'Tap the star on any design to keep it here.' : 'No designs match your search.'}</p>
        : <div className="studio-preset-grid">{shownPresets.map(preset => <div key={preset.id} className={`preset-card ${matches(preset) ? 'selected' : ''}`}>
            <button className="preset-apply" onClick={() => apply(preset.name, preset.design)} title={preset.description} aria-pressed={matches(preset)}><img className="preset-thumb" src={media(`presets/${preset.id}.webp`)} alt="" loading="lazy" /><strong>{preset.name}</strong><small>{preset.design.pattern}</small></button>
            <button className={`preset-star ${favourites.includes(preset.id) ? 'on' : ''}`} onClick={() => toggleFavourite(preset.id)} aria-label={favourites.includes(preset.id) ? `Remove ${preset.name} from favourites` : `Add ${preset.name} to favourites`}><Star size={14} /></button>
            {matches(preset) && <Check className="preset-check" size={15} />}
        </div>)}</div>}
        <p className="field-hint">Choose a complete colour and print combination, then make it yours.</p>
    </div>;
}
