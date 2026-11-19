import { useEffect, useRef } from 'react';
import type { Design, MarkPlace, WordLookStyle } from './KitViewer';

/**
 * How a word on the kit looks (task 9.146): style tiles (Plain, Outline, Shadow, 3D block, Contour), shape tiles
 * (Straight, Arch up, Arch down, Wave, Bridge, Slant), each a small picture of the word with that look, then size,
 * letter spacing, line thickness and colour. Kept in design.marks.<key>.look (and .scale for the size); the viewer
 * (viewer/src/wordart.js) draws the same.
 */
const STYLES: [WordLookStyle['style'], string][] = [['plain', 'Plain'], ['outline', 'Outline'], ['shadow', 'Shadow'], ['extrude', '3D block'], ['contour', 'Contour']];
const SHAPES: [WordLookStyle['shape'], string][] = [['straight', 'Straight'], ['archUp', 'Arch up'], ['archDown', 'Arch down'], ['wave', 'Wave'], ['bridge', 'Bridge'], ['slant', 'Slant']];

/** The same drawing as the viewer's drawWord (centred on 0, 0). */
export function drawWord(g: CanvasRenderingContext2D, str: string, size: number, color: string, maxWidth: number, look: WordLookStyle, line: string, gap: string) {
    const L = { style: look.style ?? 'plain', width: Math.min(0.3, Math.max(0, look.width ?? 0.08)), color: look.color ?? null, shape: look.shape ?? 'straight', spacing: Math.min(0.6, Math.max(-0.1, look.spacing ?? 0)) };
    const chars = [...str];
    g.save();
    g.font = `700 ${size}px Rajdhani, Inter, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const gapW = L.spacing * size, widths = chars.map(c => g.measureText(c).width);
    const W = widths.reduce((a, b) => a + b, 0) + gapW * Math.max(0, chars.length - 1);
    const k = W > maxWidth ? maxWidth / W : 1;
    g.scale(k, 1);
    if (L.shape === 'slant') g.transform(1, 0, -0.32, 1, 0, 0);
    const R = Math.max(W, size) * 0.85, places: [number, number, number, number][] = [];
    let u = -W / 2;
    for (let i = 0; i < chars.length; i++) {
        const c = u + widths[i] / 2;
        let x = c, y = 0, a = 0, sy = 1;
        if (L.shape === 'archUp' || L.shape === 'archDown') {
            const t = c / R, dir = L.shape === 'archUp' ? 1 : -1;
            x = R * Math.sin(t); y = dir * R * (1 - Math.cos(t)); a = dir * t;
            y -= (dir * R * (1 - Math.cos(W / 2 / R))) / 2;
        } else if (L.shape === 'wave') {
            const f = (Math.PI * 3) / Math.max(W, 1e-6);
            y = size * 0.16 * Math.sin(c * f); a = Math.atan(size * 0.16 * f * Math.cos(c * f));
        } else if (L.shape === 'bridge') sy = 1 + 0.5 * Math.cos((Math.PI * c) / Math.max(W, 1e-6));
        places.push([x, y, a, sy]);
        u += widths[i] + gapW;
    }
    const each = (paint: (ch: string) => void) => chars.forEach((ch, i) => {
        const [x, y, a, sy] = places[i];
        g.save(); g.translate(x, y); g.rotate(a); if (sy !== 1) { g.translate(0, size * 0.5); g.scale(1, sy); g.translate(0, -size * 0.5); }
        paint(ch); g.restore();
    });
    const lineColor = L.color ?? line;
    g.lineJoin = 'round';
    if (L.style === 'extrude') {
        const steps = 8, d = size * Math.max(0.02, L.width * 0.9) / steps;
        g.fillStyle = lineColor;
        for (let s = steps; s >= 1; s--) { g.save(); g.translate(s * d, s * d); each(ch => g.fillText(ch, 0, 0)); g.restore(); }
    }
    if (L.style === 'contour') {
        const w = size * Math.max(0.03, L.width);
        g.strokeStyle = lineColor; g.lineWidth = w * 3.2; each(ch => g.strokeText(ch, 0, 0));
        g.strokeStyle = gap; g.lineWidth = w * 1.9; each(ch => g.strokeText(ch, 0, 0));
        g.strokeStyle = lineColor; g.lineWidth = w * 0.9; each(ch => g.strokeText(ch, 0, 0));
    }
    if (L.style === 'outline' && L.width > 0) { g.strokeStyle = lineColor; g.lineWidth = size * L.width * 2; each(ch => g.strokeText(ch, 0, 0)); }
    if (L.style === 'plain') { g.strokeStyle = line; g.lineWidth = size * 0.07; each(ch => g.strokeText(ch, 0, 0)); }
    if (L.style === 'shadow') {
        g.shadowColor = L.color ? `${L.color}cc` : 'rgba(0,0,0,0.6)';
        g.shadowBlur = size * Math.max(0.04, L.width);
        g.shadowOffsetX = g.shadowOffsetY = size * Math.max(0.04, L.width);
    }
    g.fillStyle = color;
    each(ch => g.fillText(ch, 0, 0));
    g.restore();
}

/** Darker by half, as the viewer's default letter outline. */
const darker = (hex: string) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.5).toString(16).padStart(2, '0')).join('');

function Tile({ word, look, design, label, on, onClick }: { word: string; look: WordLookStyle; design: Design; label: string; on: boolean; onClick: () => void }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const c = canvas.current, g = c?.getContext('2d');
        if (!c || !g) return;
        const dpr = window.devicePixelRatio || 1;
        c.width = 96 * dpr; c.height = 52 * dpr;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = design.main; g.fillRect(0, 0, 96, 52);
        g.translate(48, 26);
        drawWord(g, word || 'TEAM', 20, design.accent, 84, look, darker(design.main), design.main);
    }, [word, look, design.main, design.accent]);
    return <button type="button" className={`word-tile${on ? ' selected' : ''}`} aria-pressed={on} onClick={onClick} title={label}><canvas ref={canvas} style={{ width: 96, height: 52 }} aria-hidden="true" /><span>{label}</span></button>;
}

export function WordLook({ design, markKey, word, edit, preview, commit, title }: { design: Design; markKey: string; word: string; edit: (patch: Partial<Design>) => void; preview: (patch: Partial<Design>) => void; commit: () => void; title: string }) {
    const mark: MarkPlace = design.marks?.[markKey] ?? {};
    const look: WordLookStyle = mark.look ?? {};
    const patch = (next: Partial<MarkPlace>, live = false) => {
        const marks = { ...(design.marks ?? {}), [markKey]: { ...mark, ...next } };
        (live ? preview : edit)({ marks });
    };
    const setLook = (next: Partial<WordLookStyle>, live = false) => patch({ look: { ...look, ...next } }, live);
    const style = look.style ?? 'plain', shape = look.shape ?? 'straight';
    return <div className="word-look" aria-label={title}>
        <h4>{title.toUpperCase()} STYLE</h4>
        <div className="word-tiles">{STYLES.map(([id, label]) => <Tile key={id} word={word} design={design} look={{ ...look, style: id }} label={label} on={style === id} onClick={() => setLook({ style: id })} />)}</div>
        <h4>{title.toUpperCase()} SHAPE</h4>
        <div className="word-tiles">{SHAPES.map(([id, label]) => <Tile key={id} word={word} design={design} look={{ ...look, shape: id }} label={label} on={shape === id} onClick={() => setLook({ shape: id })} />)}</div>
        <label className="field">Size<input type="range" min="0.5" max="2" step="0.05" value={mark.scale ?? 1} onChange={e => patch({ scale: Number(e.target.value) }, true)} onPointerUp={commit} onKeyUp={commit} /></label>
        <label className="field">Letter spacing<input type="range" min="-0.1" max="0.6" step="0.02" value={look.spacing ?? 0} onChange={e => setLook({ spacing: Number(e.target.value) }, true)} onPointerUp={commit} onKeyUp={commit} /></label>
        {style !== 'plain' && <label className="field">{style === 'shadow' ? 'Shadow size' : style === 'extrude' ? 'Block depth' : 'Line thickness'}<input type="range" min="0" max="0.3" step="0.01" value={look.width ?? 0.08} onChange={e => setLook({ width: Number(e.target.value) }, true)} onPointerUp={commit} onKeyUp={commit} /></label>}
        {style !== 'plain' && <label className="field word-colour">{style === 'shadow' ? 'Shadow colour' : 'Line colour'}<input type="color" value={look.color ?? darker(design.main)} onChange={e => setLook({ color: e.target.value }, true)} onBlur={commit} /></label>}
        {mark.look && <button type="button" className="button button-secondary full-width" onClick={() => patch({ look: undefined, scale: undefined })}>Back to the plain {title.toLowerCase()}</button>}
    </div>;
}
