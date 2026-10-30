import { useEffect, useState } from 'react';
import { Check, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api';
import type { Design } from '../types';
import { readAsset, type ArtworkDrop, type LibraryAsset } from './StudioArtwork';

/** The viewer's mark for a full-colour print tile (viewer texture.js PRINT_MARK): two exact pixels at the top left. */
const PRINT_MARK = [[3, 222, 177], [17, 61, 233]];
/** A see-through pixel in a Kit colours picture: white (the stencil's "no ink") at the faintest opacity, so turning the picture back to Full colour can make it see-through again. */
const SEE_THROUGH = [255, 255, 255, 1];
export const OWN_PATTERN_MAX = 5 * 1024 * 1024;
export type OwnMode = 'full' | 'kit';

/** A zone value or pattern image that is an uploaded picture rather than a pattern name. */
export const isPatternPicture = (v: unknown): v is string => typeof v === 'string' && /^(data:image\/|\/|https?:)/.test(v);
/** A zone's pattern as people read it: uploaded pictures are "My pattern". */
export const patternLabel = (v: unknown) => isPatternPicture(v) ? 'My pattern' : String(v ?? '');

/**
 * What this visit knows about the pattern pictures on the kit: each picture's mode (read once from its own pixels) and
 * the My patterns tile it was made from. Kept outside the panel, so closing and opening Patterns loses nothing; the
 * mode itself always comes from the picture in the design (after an undo, a save and reopen, or in the app).
 */
const modes = new Map<string, OwnMode | 'unreadable'>();
const madeFrom = new Map<string, number>();
function remember<T>(map: Map<string, T>, key: string, value: T) {
  if (map.size >= 24 && !map.has(key)) map.delete(map.keys().next().value as string);
  map.set(key, value);
}

function load(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Unable to read this pattern picture.')); img.src = src; }); }

/** Whether a picture carries the full-colour mark: its two top-left pixels, read exactly (as the viewer does). */
function marked(img: HTMLImageElement) {
  const c = document.createElement('canvas'); c.width = 2; c.height = 1;
  const g = c.getContext('2d')!; g.drawImage(img, 0, 0, 2, 1, 0, 0, 2, 1); const px = g.getImageData(0, 0, 2, 1).data;
  return PRINT_MARK.every(([r, gr, b], i) => px[i * 4] === r && px[i * 4 + 1] === gr && px[i * 4 + 2] === b);
}

/** The mode a pattern picture is in: marked = full colour, else kit colours. */
export async function modeOf(src: string): Promise<OwnMode> {
  const known = modes.get(src);
  if (known === 'full' || known === 'kit') return known;
  const mode: OwnMode = marked(await load(src)) ? 'full' : 'kit';
  remember(modes, src, mode);
  return mode;
}

/**
 * A pattern picture made ready for the 3D viewer (at most 768 px, PNG), from an upload or from a picture already on the
 * kit. "full" keeps its colours and see-through parts and is marked, so the viewer repeats it as it is (the AI print's
 * seamless repeat); "kit" is unmarked, so the viewer uses it as a stencil painted in the kit's colours, like the
 * built-in patterns (its see-through pixels become SEE_THROUGH, so a later "full" gives them back).
 */
export async function preparePattern(src: string, mode: OwnMode): Promise<string> {
  const img = await load(src); const k = Math.min(1, 768 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(img.width * k)); c.height = Math.max(8, Math.round(img.height * k));
  const g = c.getContext('2d', { willReadFrequently: true })!;
  let from: CanvasImageSource = img;
  if (marked(img)) {
    // Already in full colour: its two mark pixels take the colours of the two below them, as the viewer does.
    const own = document.createElement('canvas'); own.width = img.width; own.height = img.height;
    const og = own.getContext('2d')!; og.drawImage(img, 0, 0); og.clearRect(0, 0, 2, 1); og.drawImage(img, 0, 1, 2, 1, 0, 0, 2, 1);
    from = own;
  }
  g.drawImage(from, 0, 0, c.width, c.height);
  const data = g.getImageData(0, 0, c.width, c.height), px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (mode === 'kit' && px[i + 3] === 0) px.set(SEE_THROUGH, i);
    else if (mode === 'full' && px[i + 3] === 1 && px[i] > 250 && px[i + 1] > 250 && px[i + 2] > 250) px[i + 3] = 0;
  }
  if (mode === 'full') PRINT_MARK.forEach(([r, gr, b], i) => px.set([r, gr, b, 255], i * 4));
  else if (PRINT_MARK.every(([r, gr, b], i) => px[i * 4] === r && px[i * 4 + 1] === gr && px[i * 4 + 2] === b)) px[0] ^= 1; // never marked by chance
  g.putImageData(data, 0, 0);
  const out = c.toDataURL('image/png');
  remember(modes, out, mode);
  return out;
}

type Props = {
  design: Design; area: string; areaLabel: string; signedIn: boolean; requireAuth: (action?: () => void) => void;
  edit: (patch: Partial<Design>) => void; onNotice: (text: string) => void; onDrag: (drop: ArtworkDrop | null) => void;
};

/**
 * Patterns › My patterns: the user's own pattern pictures (saved assets of type "pattern", here and in the app). The
 * Full colour / Kit colours buttons show and change the pattern picture on the chosen area, as the design has it.
 */
export function OwnPatterns({ design, area, areaLabel, signedIn, requireAuth, edit, onNotice, onDrag }: Props) {
  const [items, setItems] = useState<LibraryAsset[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const [, setRead] = useState(0);
  useEffect(() => {
    if (!signedIn) { setItems(null); return; }
    let live = true;
    api<LibraryAsset[]>('/assets').then(async list => {
      const own = list.filter(a => a.type === 'pattern');
      const read = await Promise.allSettled(own.map(async a => ({ ...a, src: await readAsset(a) })));
      if (live) setItems(read.map((r, i) => r.status === 'fulfilled' ? r.value : own[i]));
    }).catch(() => live && setItems([]));
    return () => { live = false; };
  }, [signedIn]);

  // The pattern picture on this area, as the design has it, and its mode (read from the picture).
  const where = area === 'all' ? 'whole garment' : areaLabel.toLowerCase();
  const target = area === 'all' ? design.patternImage : design.zones?.[area as keyof NonNullable<Design['zones']>];
  const picture = isPatternPicture(target) ? target : null;
  const known = picture ? modes.get(picture) : undefined;
  const mode = known === 'full' || known === 'kit' ? known : null;
  useEffect(() => {
    if (!picture || modes.has(picture)) return;
    let live = true;
    modeOf(picture).catch(() => remember(modes, picture, 'unreadable')).finally(() => { if (live) setRead(n => n + 1); });
    return () => { live = false; };
  }, [picture, known === undefined]);

  /** Puts one of My patterns on an area, in the mode of the picture already there (else full colour). */
  async function apply(item: LibraryAsset, to = area) {
    try {
      setError('');
      const as: OwnMode = (to === area ? mode : null) ?? 'full';
      const src = await preparePattern(await readAsset(item), as);
      remember(madeFrom, src, item.id);
      if (to === 'all') edit({ pattern: 'Solid', patternImage: src, zones: {}, ...(as === 'kit' ? { patternBody: 1 } : {}) });
      else edit({ zones: { ...design.zones, [to]: src } });
      onNotice(`${item.name || 'Your pattern'} applied to the ${to === 'all' ? 'whole garment' : areaLabel.toLowerCase()} in ${as === 'full' ? 'full colour' : 'kit colours'}.`);
    } catch (e) { setError((e as Error).message); }
  }
  /** Full colour or kit colours for the pattern picture on this area (one undo step). */
  async function switchMode(next: OwnMode) {
    if (!picture || !mode || mode === next || switching) return;
    setSwitching(true); setError('');
    try {
      const src = await preparePattern(picture, next);
      const from = madeFrom.get(picture);
      if (from !== undefined) remember(madeFrom, src, from);
      if (area === 'all') edit({ patternImage: src, ...(next === 'kit' ? { patternBody: 1 } : {}) });
      else edit({ zones: { ...design.zones, [area]: src } });
      onNotice(`The pattern on the ${where} is now in ${next === 'full' ? 'full colour' : 'kit colours'}.`);
    } catch (e) { setError((e as Error).message); } finally { setSwitching(false); }
  }
  async function upload(file: File) {
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Choose a PNG, JPG or WebP picture.'); return; }
    if (file.size > OWN_PATTERN_MAX) { setError('Choose a picture smaller than 5 MB.'); return; }
    setBusy(true);
    try {
      const form = new FormData(); form.append('file', file); form.append('name', file.name.replace(/\.[^.]+$/, '').slice(0, 120)); form.append('type', 'pattern');
      const saved = await api<LibraryAsset>('/assets', { method: 'POST', body: form });
      const item = { ...saved, src: await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Unable to read this picture.')); r.readAsDataURL(file); }) };
      setItems(list => [item, ...(list ?? [])]);
      await apply(item);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(item: LibraryAsset) {
    if (!window.confirm(`Delete "${item.name}" from My patterns? Kits that already use it keep it.`)) return;
    try { await api(`/assets/${item.id}`, { method: 'DELETE' }); setItems(list => (list ?? []).filter(a => a.id !== item.id)); onNotice('Pattern deleted from My patterns.'); } catch (e) { setError((e as Error).message); }
  }
  const tip = !picture ? `No pattern picture on the ${where} yet. Tap one of your patterns to put it there, then choose its colours here.`
    : known === 'unreadable' ? `The colours of the pattern on the ${where} can't be changed here.`
    : !mode ? 'Reading the pattern…'
    : mode === 'full' ? `The pattern on the ${where} shows its own colours. Kit colours paints it in your kit's colours.`
    : `The pattern on the ${where} is painted in your kit's colours. Full colour shows its own colours.`;

  return <div className="own-patterns">
    <h4>MY PATTERNS</h4>
    <div className="segmented own-pattern-mode" role="group" aria-label={`Colours of the pattern on the ${where}`}>
      {(['full', 'kit'] as const).map(m => <button key={m} type="button" className={mode === m ? 'selected' : ''} aria-pressed={mode === m} disabled={!mode || switching} onClick={() => switchMode(m)}>{switching && mode !== m && <LoaderCircle className="spin" size={12} />}{m === 'full' ? 'Full colour' : 'Kit colours'}</button>)}
    </div>
    <p className="field-hint own-pattern-tip">{tip}</p>
    <div className="pattern-grid">
      <label className="own-pattern-upload" onClick={e => { if (!signedIn) { e.preventDefault(); requireAuth(); } }}>
        <input type="file" hidden accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
        <span className="pattern-preview own-pattern-plus">{busy ? <LoaderCircle className="spin" size={20} /> : <Plus size={22} />}</span><span>Upload pattern</span>
      </label>
      {(items ?? []).map(item => {
        const active = !!picture && madeFrom.get(picture) === item.id;
        return <button key={item.id} className={`own-pattern ${active ? 'selected' : ''}`} title={item.name} draggable={!!item.src}
          onDragStart={async e => { e.dataTransfer.setData('text/plain', item.name); e.dataTransfer.effectAllowed = 'copy'; const src = await preparePattern(item.src!, mode ?? 'full'); remember(madeFrom, src, item.id); onDrag({ pattern: src, label: item.name || 'Your pattern' }); }}
          onDragEnd={() => setTimeout(() => onDrag(null), 0)} onClick={() => apply(item)}>
          <span className="pattern-preview" style={{ backgroundImage: item.src ? `url(${item.src})` : undefined, backgroundSize: 'cover' }} />
          <span>{item.name || 'Pattern'}{active && <Check size={14} />}</span>
          <i role="button" tabIndex={0} aria-label={`Delete ${item.name}`} className="own-pattern-delete" onClick={e => { e.stopPropagation(); void remove(item); }}><Trash2 size={12} /></i>
        </button>;
      })}
    </div>
    <p className="field-hint">{signedIn ? 'PNG, JPG or WebP up to 5 MB. Saved to your account, so it is in the app too. Tap for this area, or drag onto the garment.' : 'Sign in to upload your own pattern.'}</p>
    {picture && <button className="button button-secondary full-width" onClick={() => area === 'all' ? edit({ patternImage: null }) : edit({ zones: { ...design.zones, [area]: 'None' } })}><X size={14} /> Remove my pattern here</button>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </div>;
}
