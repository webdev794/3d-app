import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Plus, RotateCcw, Type, X } from 'lucide-react';
import type { ArtworkLayer, Design } from '../types';
import ColorWheel from './ColorWheel';
import { patternNames, readImage } from './StudioArtwork';
import { isShortsPart, partLabels, partSpots, partsOf, ribPart, withPart, type PartKey, type PartStyle } from '../parts';

/** Where the chosen part was tapped (new objects go there), else its usual place. */
export interface PartSpot { key: PartKey; side: 'front' | 'back'; x: number; y: number }

type Props = {
  design: Design;
  selected: PartKey | null;
  spot: PartSpot | null;
  onSelect: (key: PartKey) => void;
  edit: (patch: Partial<Design>) => void;
  preview: (patch: Partial<Design>) => void;
  commit: () => void;
  onNotice: (text: string) => void;
  onDone: () => void;
  /** A tap on the pattern (task 9.137): show this part's PATTERN section. */
  focus?: { section: 'pattern'; at: number } | null;
};

const DIRECTIONS = [{ angle: 0, label: '↓', name: 'Top to bottom' }, { angle: 180, label: '↑', name: 'Bottom to top' }, { angle: 90, label: '→', name: 'Left to right' }, { angle: 270, label: '←', name: 'Right to left' }, { angle: 45, label: '↘', name: 'Diagonal' }];
const MAX_LOGO = 3 * 1024 * 1024;

/**
 * Parts (task 9.134): one part of the kit (front, back, a sleeve, the collar, the side panels, the hem; the shorts'
 * parts) with its own colour, a fade, a pattern of its own (or the kit's fainter) and objects on it only.
 */
export default function PartsPanel({ design, selected, spot, onSelect, edit, preview, commit, onNotice, onDone, focus }: Props) {
  const [text, setText] = useState('');
  const patternRef = useRef<HTMLHeadingElement>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!focus) return;
    requestAnimationFrame(() => patternRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(t);
  }, [focus, selected]);
  const available = partsOf(design.garment);
  const key = selected && available.includes(selected) ? selected : null;
  const style: PartStyle = (key && design.parts?.[key]) || {};
  // What the part follows in the kit's colours while it has none of its own.
  const follows = key === 'sides' || key === 'shortsSides' || ribPart(key ?? 'front') ? 'secondary' : 'main';
  const kitColour = design[follows];
  const set = (patch: Partial<PartStyle> | null, live = false) => { if (!key) return; const parts = withPart(design.parts, key, patch === null ? null : { ...style, ...patch }); (live ? preview : edit)({ parts }); };
  const objects = (design.layers ?? []).filter(l => l.clip === key);
  const setLayer = (id: string, patch: Partial<ArtworkLayer>, live = false) => (live ? preview : edit)({ layers: (design.layers ?? []).map(l => l.id === id ? { ...l, ...patch } : l) });
  const place = () => {
    const at = spot && spot.key === key ? spot : key ? partSpots[key] : partSpots.front;
    return { part: key && isShortsPart(key) ? 'shorts' as const : 'top' as const, side: at.side, x: at.x, y: at.y };
  };
  const addText = () => {
    if (!key || !text.trim()) return;
    if ((design.layers ?? []).length >= 40) { onNotice('A design can contain up to 40 artwork layers.'); return; }
    const sleeve = key === 'leftSleeve' || key === 'rightSleeve';
    edit({ layers: [...(design.layers ?? []), { id: crypto.randomUUID(), type: 'text', name: `Text on the ${partLabels[key].toLowerCase()}`, text: text.trim().toUpperCase().slice(0, 40), size: sleeve ? 0.04 : 0.05, color: design.accent, ...place(), clip: key }] });
    setText('');
    onNotice(`Text added on the ${partLabels[key].toLowerCase()}. Move it on the 2D panels.`);
  };
  const addLogo = async (file: File) => {
    if (!key) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { onNotice('Choose a PNG, JPEG or WebP picture.'); return; }
    if (file.size > MAX_LOGO) { onNotice('That picture is too big (3 MB at most).'); return; }
    if ((design.layers ?? []).length >= 40) { onNotice('A design can contain up to 40 artwork layers.'); return; }
    const src = await readImage(file);
    const sleeve = key === 'leftSleeve' || key === 'rightSleeve';
    edit({ layers: [...(design.layers ?? []), { id: crypto.randomUUID(), type: 'image', name: file.name.slice(0, 120), src, w: sleeve ? 0.07 : 0.09, ...place(), clip: key }] });
    onNotice(`${file.name} added on the ${partLabels[key].toLowerCase()}. Move or resize it on the 2D panels.`);
  };
  const patternValue = style.pattern ?? (style.patternOpacity === 0 ? '__none' : '__kit');
  const ownPicture = !!style.pattern && /^(data:|\/|https?:)/.test(style.pattern);

  return <div className="parts-panel">
    <p className="field-hint">Tap a part of the kit, or choose it here.</p>
    <div className="part-chips" role="radiogroup" aria-label="Part of the kit">{available.map(k => <button key={k} type="button" role="radio" aria-checked={key === k} className={key === k ? 'active' : ''} onClick={() => onSelect(k)}>{partLabels[k]}{design.parts?.[k] && <i className="part-dot" aria-label="has its own look" />}</button>)}</div>
    {!key && <p className="field-hint">Choose a part to give it its own colour, a fade, a pattern or a logo.</p>}
    {key && <>
      <div className="part-head"><h3>{partLabels[key].toUpperCase()}</h3>{(design.parts?.[key] || objects.length > 0) && <button type="button" className="text-button" onClick={() => set(null)} title="Back to the kit's colours and pattern"><RotateCcw size={14} /> Reset</button>}</div>
      <h4>COLOUR</h4>
      <div className="slot-tabs" role="radiogroup" aria-label={`${partLabels[key]} colour`}>
        <button type="button" role="radio" aria-checked={!style.colour} className={!style.colour ? 'active' : ''} onClick={() => set({ colour: null })}>Kit colour</button>
        <button type="button" role="radio" aria-checked={!!style.colour} className={style.colour ? 'active' : ''} onClick={() => set({ colour: style.colour ?? kitColour })}>Own colour</button>
      </div>
      {style.colour
        ? <ColorWheel key={key} value={style.colour} onChange={hex => set({ colour: hex }, true)} onCommit={commit} onDone={onDone} />
        : <p className="field-hint">Follows the kit's {follows === 'main' ? 'Primary' : 'Secondary'} colour <i className="part-swatch" style={{ background: kitColour }} />. Own colour makes this part plain in a colour of its own.</p>}
      {ribPart(key) ? <p className="field-hint">The {partLabels[key].toLowerCase()} is knitted rib: it takes a colour only.</p> : <>
        <h4>FADE</h4>
        {style.fade ? <div className="part-fade">
          <div className="gradient-colours">
            <label>From<input type="color" aria-label="Fade from" value={style.fade.from} onChange={e => set({ fade: { ...style.fade!, from: e.target.value } }, true)} onBlur={commit} /></label>
            <label>To<input type="color" aria-label="Fade to" value={style.fade.to ?? style.fade.from} disabled={!style.fade.to} onChange={e => set({ fade: { ...style.fade!, to: e.target.value } }, true)} onBlur={commit} /></label>
            <label className="part-check"><input type="checkbox" checked={!style.fade.to} onChange={e => set({ fade: { ...style.fade!, to: e.target.checked ? null : '#ffffff' } })} /> Fade out</label>
          </div>
          <div className="part-dirs" role="radiogroup" aria-label="Fade direction">{DIRECTIONS.map(d => <button key={d.angle} type="button" role="radio" aria-checked={style.fade!.angle === d.angle} className={style.fade!.angle === d.angle ? 'active' : ''} title={d.name} aria-label={d.name} onClick={() => set({ fade: { ...style.fade!, angle: d.angle } })}>{d.label}</button>)}</div>
          <label className="field">Direction · {style.fade.angle}°<input type="range" min={0} max={360} step={5} value={style.fade.angle} aria-label="Fade angle" onChange={e => set({ fade: { ...style.fade!, angle: Number(e.target.value) } }, true)} onPointerUp={commit} onKeyUp={commit} /></label>
          <button type="button" className="gradient-off" onClick={() => set({ fade: null })}><X size={14} /> Remove the fade</button>
        </div> : <button type="button" className="button button-secondary full-width" onClick={() => set({ fade: { from: style.colour ?? kitColour, to: null, angle: 0 } })}><Plus size={15} /> Add a fade</button>}
        <h4 ref={patternRef} className={flash ? 'part-flash' : ''}>PATTERN</h4>
        <label className="field">Pattern on the {partLabels[key].toLowerCase()}<select value={ownPicture ? '__picture' : patternValue} onChange={e => { const v = e.target.value; if (v === '__kit') set({ pattern: null, patternOpacity: null }); else if (v === '__none') set({ pattern: null, patternOpacity: 0 }); else if (v !== '__picture') set({ pattern: v, patternOpacity: style.pattern ? style.patternOpacity : null }); }}>
          <option value="__kit">The kit's pattern</option>
          <option value="__none">No pattern</option>
          {ownPicture && <option value="__picture">My pattern</option>}
          {patternNames.filter(n => n !== 'None').map(n => <option key={n} value={n}>{n}</option>)}
        </select></label>
        {style.pattern && <label className="part-colour">Pattern colour<input type="color" aria-label="Pattern colour on this part" value={style.patternColour ?? design.patternColor ?? design.secondary} onChange={e => set({ patternColour: e.target.value }, true)} onBlur={commit} /></label>}
        {patternValue !== '__none' && <label className="field">{style.pattern ? 'Pattern opacity' : "The kit's pattern here"} · {Math.round((style.patternOpacity ?? 1) * 100)}%<input type="range" min={0} max={100} step={5} value={Math.round((style.patternOpacity ?? 1) * 100)} aria-label="Pattern opacity" onChange={e => set({ patternOpacity: Number(e.target.value) / 100 }, true)} onPointerUp={commit} onKeyUp={commit} /></label>}
        <h4>OBJECTS ON THE {partLabels[key].toUpperCase()}</h4>
        {objects.map(l => <div key={l.id} className="part-object">
          {l.type === 'image' && l.src ? <img src={l.src} alt="" /> : <Type size={16} />}
          <span>{l.type === 'text' ? l.text : l.name ?? 'Logo'}</span>
          <label className="part-opacity" title="Opacity">{Math.round((l.opacity ?? 1) * 100)}%<input type="range" min={10} max={100} step={5} value={Math.round((l.opacity ?? 1) * 100)} aria-label={`Opacity of ${l.type === 'text' ? l.text : l.name ?? 'logo'}`} onChange={e => setLayer(l.id, { opacity: Number(e.target.value) / 100 }, true)} onPointerUp={commit} onKeyUp={commit} /></label>
          <button type="button" className="icon-button" aria-label={`Remove ${l.type === 'text' ? l.text : l.name ?? 'logo'}`} onClick={() => edit({ layers: (design.layers ?? []).filter(x => x.id !== l.id) })}><X size={14} /></button>
        </div>)}
        <div className="inline-field part-add-text"><input value={text} maxLength={40} placeholder="Text on this part" aria-label="Text on this part" onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addText()} /><button type="button" className="button button-secondary" disabled={!text.trim()} onClick={addText}><Plus size={15} /> Text</button></div>
        <label className="button button-secondary full-width part-add-logo"><input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addLogo(f).catch(error => onNotice((error as Error).message)); }} /><ImagePlus size={15} /> Add a logo on this part</label>
        <p className="field-hint">Objects stay inside the {partLabels[key].toLowerCase()}. Move or resize them on the 2D panels.</p>
      </>}
    </>}
  </div>;
}
