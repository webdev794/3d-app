import { useEffect, useRef, useState, type RefObject } from 'react';
import { Check, ChevronDown, ChevronRight, Info, Search } from 'lucide-react';
import type { Design, KitViewerHandle } from './KitViewer';
import { isTrack } from './KitViewer';
import { withPart } from '../parts';
import { collarOf, fitOf, hasNeckStyle, hasRugbyStyle, neckLabel, neckLabels, neckOf, ownNeck, rugbyCollars, rugbyFits, trimOf, trimSwatches, type NeckStyle } from '../garmentStyle';
import '../../css/garment-style.css';

/** The Style tool's icon: a sleeveless top, as on the client's mockup (images/299). */
export function StyleIcon({ size = 22 }: { size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 3c0 2.2 1.8 4 4 4s4-1.8 4-4l2.5 1c-.6 2-.4 4 1 5.5V21H4.5V9.5c1.4-1.5 1.6-3.5 1-5.5L8 3Z" />
    </svg>;
}

/** What a collar card shows (the same finishes as the 3D viewer's necks.js). */
type Art = { shape: 'round' | 'v' | 'shallow'; band?: number; stripe?: 'inner' | 'accent' | 'white' | 'double'; insert?: 'v' | 'cross'; stand?: boolean; fold?: boolean; wing?: boolean; buttons?: number; tips?: boolean };
const arts: Record<string, Art> = {
    round: { shape: 'round' }, v: { shape: 'v' },
    rc001: { shape: 'round', band: 9, stripe: 'inner' }, rc002: { shape: 'round', insert: 'v', stripe: 'white', tips: true },
    rc003: { shape: 'round', band: 10, stripe: 'double' }, rc004: { shape: 'v', wing: true },
    rc005: { shape: 'round', band: 8, tips: true }, rc006: { shape: 'round', stand: true, stripe: 'white', buttons: 1 },
    rc007: { shape: 'v', buttons: 1 }, rc008: { shape: 'round', fold: true, buttons: 3 }, rc009: { shape: 'round', fold: true, buttons: 1 },
    rc010: { shape: 'round', fold: true, insert: 'cross' }, 'shallow-v': { shape: 'shallow', band: 10, stripe: 'accent' },
};

/** A small drawing of a neck or collar in the kit's own colours (body, trim, accent). */
function NeckArt({ id, design }: { id: string; design: Design }) {
    const a = arts[id] ?? arts.round, trim = trimOf(design), body = design.main, accent = design.accent, band = a.band ?? 6;
    const tip = a.shape === 'round' ? 58 : a.shape === 'v' ? 64 : 50;
    const open = a.shape === 'round' ? `M28 14 Q60 ${tip + 14} 92 14` : `M28 14 L60 ${tip} L92 14`;
    const inner = a.shape === 'round' ? `M${28 + band} 14 Q60 ${tip + 14 - band * 1.6} ${92 - band} 14` : `M${28 + band} 14 L60 ${tip - band * 1.4} L${92 - band} 14`;
    return <svg viewBox="0 0 120 84" className="neck-art" aria-hidden="true">
        <defs><linearGradient id={`fab-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={body} /><stop offset="1" stopColor="#000" stopOpacity=".9" /></linearGradient></defs>
        <path d="M0 22 Q20 8 28 10 L92 10 Q100 8 120 22 V84 H0Z" fill={`url(#fab-${id})`} />
        {a.insert === 'v' && <path d="M40 12 L60 48 L80 12Z" fill={accent} />}
        {a.insert === 'cross' && <><path d="M44 14 L68 46 L56 52Z" fill={accent} /><path d="M76 14 L52 46 L64 52Z" fill={trim} /></>}
        <path d={`${open} Q60 2 28 14Z`} fill="#e9edf0" opacity={a.insert ? 0 : 1} />
        <path d={a.insert ? 'M34 14 Q60 34 86 14 Q60 4 34 14Z' : `${inner} Q60 6 ${28 + band} 14Z`} fill="#0b0d10" opacity=".9" />
        {a.buttons ? <><rect x="56" y={a.shape === 'v' ? tip - 2 : 36} width="8" height={a.buttons > 1 ? 34 : 22} rx="1.5" fill={accent} />{Array.from({ length: a.buttons }, (_, i) => <circle key={i} cx="60" cy={(a.shape === 'v' ? tip + 4 : 42) + i * 10} r="2" fill="#dfe6ea" />)}</> : null}
        <path d={a.insert ? 'M34 14 Q60 34 86 14' : open} fill="none" stroke={trim} strokeWidth={band} strokeLinejoin={a.shape === 'round' ? 'round' : 'miter'} />
        {a.stripe && <path d={a.insert ? 'M34 14 Q60 34 86 14' : open} fill="none" stroke={a.stripe === 'inner' ? body : a.stripe === 'white' ? '#ffffff' : accent} strokeWidth={a.stripe === 'double' ? 2 : band * 0.35} transform={a.stripe === 'inner' || a.stripe === 'white' ? 'translate(0 -2.4)' : 'translate(0 2.6)'} />}
        {a.stripe === 'double' && <path d={open} fill="none" stroke="#ffffff" strokeWidth="1.4" transform="translate(0 -2.6)" />}
        <path d="M28 14 Q60 2 92 14" fill="none" stroke={trim} strokeWidth={band * 0.8} />
        {a.tips && <><path d="M22 18 L32 12" stroke={accent} strokeWidth="5" /><path d="M98 18 L88 12" stroke={accent} strokeWidth="5" /></>}
        {a.stand && <path d="M26 14 Q60 0 94 14 L94 6 Q60 -8 26 6Z" fill={trim} />}
        {a.wing && <><path d="M28 14 L46 38 L36 40Z" fill={trim} /><path d="M92 14 L74 38 L84 40Z" fill={trim} /></>}
        {a.fold && <><path d="M26 12 L58 40 L40 46 L18 24Z" fill={trim} stroke="#00000055" /><path d="M94 12 L62 40 L80 46 L102 24Z" fill={trim} stroke="#00000055" /></>}
    </svg>;
}

/**
 * The Style tool (client mockups images/299 and 300): the product, the neck style cards (round / V), the neck trim
 * colour; on rugby jerseys the collar library, the collar colour and the fit. Every change keeps the design.
 */
export function StylePanel({ design, sport, product, edit, onGarment, onMoreColours }: { design: Design; sport?: string | null; product: string; edit: (patch: Partial<Design>) => void; onGarment: () => void; onMoreColours: () => void }) {
    const neck = neckOf(design), own = ownNeck(design), rugby = hasRugbyStyle(sport, design.garment), collar = collarOf(design);
    const trim = trimOf(design), ownTrim = design.parts?.collar?.colour ?? null;
    // (A V is always kept as chosen: the 3D gives it its own deep, pointed V, also on a garment whose own neck is a V.)
    const setNeck = (id: string) => edit({ neck: id === own && id !== 'v' ? null : id });
    const setTrim = (hex: string) => edit({ parts: withPart(design.parts, 'collar', { ...(design.parts?.collar ?? {}), colour: hex.toLowerCase() === design.secondary.toLowerCase() && !ownTrim ? null : hex }) });
    return <div className="garment-style">
        <label className="field">Product<button type="button" className="style-product" onClick={onGarment} aria-label={`Product: ${product}. Change garment`}><span>{product}</span><ChevronDown size={16} /></button></label>
        {hasNeckStyle(design.garment) ? <>
            <h4>NECK STYLE</h4>
            <div className="neck-cards" role="radiogroup" aria-label="Neck style">{(['round', 'v'] as NeckStyle[]).map(id => { const on = neck === id; return <button key={id} type="button" role="radio" aria-checked={on} className={on ? 'selected' : ''} onClick={() => setNeck(id)}><NeckArt id={id} design={design} /><span>{neckLabels[id].toUpperCase()}</span>{on && <i className="neck-tick"><Check size={13} /></i>}</button>; })}</div>
            {neck && <p className="neck-chosen"><Check size={14} /> {neckLabel(design)} selected</p>}
            <p className="field-hint">Available styles vary by garment.</p>
            {rugby && <>
                <h4>RUGBY COLLAR OPTIONS</h4>
                <div className="neck-cards rugby-collars" role="radiogroup" aria-label="Rugby collar">{rugbyCollars.map(c => { const on = neck === c.id; return <button key={c.id} type="button" role="radio" aria-checked={on} className={`${on ? 'selected' : ''} ${c.id === 'shallow-v' ? 'wide' : ''}`} onClick={() => setNeck(c.id)} title={c.name}><NeckArt id={c.id} design={design} /><span>{c.id === 'shallow-v' ? 'CUSTOM SHALLOW V' : c.code}</span>{on && <i className="neck-tick"><Check size={13} /></i>}</button>; })}</div>
                {collar && <p className="field-hint"><Info size={13} /> {collar.name}. Final shape to match supplier pattern.</p>}
            </>}
            <h4>{rugby ? 'COLLAR COLOUR' : 'NECK TRIM'}</h4>
            <div className="trim-swatches" role="radiogroup" aria-label={rugby ? 'Collar colour' : 'Neck trim colour'}>{trimSwatches.map(s => { const on = trim.toLowerCase() === s.hex; return <button key={s.hex} type="button" role="radio" aria-checked={on} aria-label={s.label} title={s.label} className={on ? 'selected' : ''} style={{ background: s.hex }} onClick={() => setTrim(s.hex)}>{on && <Check size={18} />}</button>; })}
                {!trimSwatches.some(s => s.hex === trim.toLowerCase()) && <span className="trim-own" style={{ background: trim }} title={`Now ${trim.toUpperCase()}`} />}</div>
            <button type="button" className="text-button more-colours" onClick={onMoreColours}>More colours <ChevronRight size={15} /></button>
            {rugby && <>
                <h4>FIT</h4>
                <div className="fit-options" role="radiogroup" aria-label="Rugby jersey fit">{rugbyFits.map(f => { const on = fitOf(design) === f.id; return <button key={f.id} type="button" role="radio" aria-checked={on} className={on ? 'selected' : ''} onClick={() => edit({ fit: f.id === 'pro' ? null : f.id })}><strong>{f.label}</strong><small>{f.note}</small></button>; })}</div>
            </>}
        </> : <p className="field-hint">{isTrack(design.garment) ? 'The track jacket comes with a stand-up collar or a hood: choose it under Garment.' : `The ${product.toLowerCase()} keeps its own collar.`} Neck styles: jerseys, tees, singlets, netball dresses and shooting shirts.</p>}
        <p className="style-foot"><StyleIcon size={15} /> Also available on compatible netball dresses and tees.</p>
    </div>;
}

/** NECK DETAIL (beside the 3D kit while the Style tool is open): a close-up of the neck from the 3D viewer. */
export function NeckDetail({ design, viewer, ready }: { design: Design; viewer: RefObject<KitViewerHandle | null>; ready: boolean }) {
    const [shot, setShot] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const live = useRef(0);
    const sig = JSON.stringify([design.garment, design.neck, design.fit, design.main, design.secondary, design.accent, design.pattern, design.patternColor, design.parts, design.zones, design.zoneColors, design.gradient, design.logoText, design.layout?.asset]);
    useEffect(() => {
        if (!ready) return;
        const turn = ++live.current;
        setBusy(true);
        const timer = setTimeout(() => { void viewer.current?.neckShot().then(data => { if (live.current === turn) { setShot(data); setBusy(false); } }, () => { if (live.current === turn) setBusy(false); }); }, 650);
        return () => clearTimeout(timer);
    }, [sig, ready, viewer]);
    if (!hasNeckStyle(design.garment)) return null;
    const label = neckLabel(design);
    return <aside className="neck-detail" aria-label="Neck detail">
        <h3><Search size={17} /> NECK DETAIL</h3>
        <div className={`neck-shot ${busy ? 'busy' : ''}`}>{shot ? <img src={shot} alt={`Close-up of the ${label ?? 'neck'}`} /> : <span>Preparing the close-up…</span>}</div>
        {label && <p className="neck-chip"><Check size={13} /> {label.toUpperCase()}</p>}
        <p className="neck-note"><strong>Change style, keep your design.</strong> Colours, logos and artwork stay in place.</p>
        {collarOf(design) && <p className="neck-note small"><Info size={13} /> Final shape to match supplier pattern.</p>}
    </aside>;
}
