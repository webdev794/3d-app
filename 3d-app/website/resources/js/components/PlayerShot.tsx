import { useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle, RotateCcw, Save, UserRound, X } from 'lucide-react';
import { api, saveBlob } from '../api';
import type { Design } from '../types';
import { allParts, partLabels } from '../parts';
import type { Gradient } from './KitViewer';
import '../../css/player-shot.css';

const HEX = /^#[0-9a-f]{6}$/i;
const mixHex = (a: string, b: string, t: number) => {
    const n = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    return `#${[0, 1, 2].map(i => Math.round(n(a, i) + (n(b, i) - n(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
};
const gradientWords = (g: Gradient) => {
    const stops = g.stops && g.stops.length >= 2 ? [...g.stops].sort((a, b) => a.at - b.at).map(s => s.color) : [g.from, g.to];
    const way = !g.angle ? 'top to bottom' : g.angle === 90 ? 'left to right' : `at ${g.angle}°`;
    return `a gradient of ${stops.join(', ')} (${way})`;
};
/** The 3D kit's patterns in words (viewer/src/texture.js patternTile). */
const PATTERN_WORDS: Record<string, string> = {
    Chevron: 'thin chevron (V-shaped) lines evenly spaced from chest to hem',
    Stripes: 'thin vertical pinstripes',
    Velocity: 'angled speed stripes down both sides of the chest',
    Blades: 'curved blade stripes sweeping up both sides from the hem',
    Swirl: 'a dense maze of winding lines, like brain coral, over the shoulders and sleeves',
    Hoops: 'horizontal hoops across the body',
    Dots: 'a fine all-over dot pattern',
    Diagonal: 'thin diagonal lines across the body',
    Tribal: 'bands of small interlocking triangles across the body',
    Camo: 'a camouflage pattern',
};

/**
 * The Studio kit's colours by area, in the 3D kit's own rules (body, the pattern's ink, trims, lettering, areas),
 * for "See it on a player": the image model needs to know which colour goes where (bug 2026-10-27, images/193.jpg:
 * three bare hex codes came out as a pink-to-purple gradient body with cream sleeves). The server names each colour.
 */
export function kitColours(design: Design): string[] {
    const solid = (hex: string) => (HEX.test(hex) ? hex.toLowerCase() : hex);
    const own = design.patternColorOwn && HEX.test(design.patternColor ?? '') ? design.patternColor! : null;
    const bodyArea = design.zoneColors && 'body' in design.zoneColors ? design.zoneColors.body : null;
    const lines = [`body: ${bodyArea ? solid(bodyArea) : design.gradient ? gradientWords(design.gradient) : solid(design.main)}`];
    if (design.layout) lines.push('print: the factory print exactly as in the kit pictures');
    else if (design.patternImage) lines.push('print: a custom all-over print, exactly as in the kit pictures');
    else if (PATTERN_WORDS[design.pattern]) {
        const ink = design.gradients?.patternColor ? gradientWords(design.gradients.patternColor) : solid(own ?? (HEX.test(design.main) && HEX.test(design.secondary) ? mixHex(design.main, design.secondary, 0.35) : design.secondary));
        lines.push(`pattern: ${PATTERN_WORDS[design.pattern]}, in ${ink}`);
    } else lines.push('pattern: none, a plain body');
    for (const [zone, name] of Object.entries(design.zones ?? {})) {
        if (name && PATTERN_WORDS[name]) lines.push(`${zone} pattern: ${PATTERN_WORDS[name]}, in ${solid(own ?? design.secondary)}`);
    }
    lines.push(`collar, cuffs, side panels and trims: ${design.gradients?.secondary ? gradientWords(design.gradients.secondary) : solid(design.secondary)}`);
    lines.push(`lettering (wordmark, name and number)${design.logoImage ? '' : ' and the small crest badge'}: ${solid(design.accent)}`);
    for (const [area, hex] of Object.entries(design.zoneColors ?? {})) {
        if (area !== 'body' && hex && HEX.test(hex)) lines.push(`${area.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${solid(hex)}`);
    }
    // The parts with a look of their own (task 9.134), as the app.
    lines.push(...fitColourLines(partColourLines(design), 14 - lines.length));
    return lines;
}

/**
 * The parts with a look of their own (task 9.134) in words, one line each ("left sleeve: #e92137, a fade of #ffc52f
 * to clear (top to bottom)"): the same lines as the app's partColourLines (player_shot.dart).
 */
export function partColourLines(design: Design): string[] {
    const way = (angle: number) => {
        const a = ((angle % 360) + 360) % 360;
        return a === 0 ? 'top to bottom' : a === 90 ? 'left to right' : a === 180 ? 'bottom to top' : a === 270 ? 'right to left' : `at ${Math.round(a)}°`;
    };
    const lines: string[] = [];
    for (const key of allParts) {
        const s = design.parts?.[key];
        if (!s) continue;
        const at = typeof s.patternOpacity === 'number' ? ` at ${Math.round(s.patternOpacity * 100)}% opacity` : '';
        const bits: string[] = [];
        if (s.colour && HEX.test(s.colour)) bits.push(s.colour.toLowerCase());
        if (s.fade && HEX.test(s.fade.from)) bits.push(`a fade of ${s.fade.from.toLowerCase()} to ${s.fade.to && HEX.test(s.fade.to) ? s.fade.to.toLowerCase() : 'clear'} (${way(Number(s.fade.angle) || 0)})`);
        if (s.pattern) bits.push(`${/^(data:|\/|https?:)/.test(s.pattern) ? 'a custom print, exactly as in the kit pictures' : PATTERN_WORDS[s.pattern] ?? s.pattern.toLowerCase()}${s.patternColour && HEX.test(s.patternColour) ? ` in ${s.patternColour.toLowerCase()}` : ''}${at}`);
        else if (typeof s.patternOpacity === 'number') bits.push(s.patternOpacity === 0 ? 'no pattern' : `the kit pattern${at}`);
        if (bits.length) lines.push(`${partLabels[key].toLowerCase()}: ${bits.join(', ')}`);
    }
    return lines;
}

/**
 * Lines within the server's limits (PlayerShotController: 14 lines of at most 200 characters): each on its own line
 * while `room` lasts, else several to a line. The same rule as the app's fitColourLines.
 */
export function fitColourLines(lines: string[], room: number): string[] {
    const clip = (s: string) => s.slice(0, 200);
    if (room <= 0 || !lines.length) return [];
    if (lines.length <= room) return lines.map(clip);
    const packed: string[] = [];
    for (const l of lines) {
        if (packed.length && packed[packed.length - 1].length + 2 + l.length <= 200) packed[packed.length - 1] += `; ${l}`;
        else packed.push(clip(l));
    }
    return packed.slice(0, room);
}

/** "See it on a player" (9.128 C): the user's kit worn by a photoreal athlete in the sport's own setting. */
export type PlayerKit = {
    sport: string;
    garment: string;
    name?: string;
    colours?: string[];
    logoText?: string;
    backName?: string;
    number?: string;
};

const POSES = [['front', 'Front'], ['action', 'Action'], ['team', 'Team photo']] as const;
type Pose = typeof POSES[number][0];

/** The server takes data URLs; a picture given as a link is read first. */
async function asDataUrl(src: string): Promise<string> {
    if (src.startsWith('data:')) return src;
    const blob = await (await fetch(src, { credentials: 'include' })).blob();
    return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob); });
}

export const wornByWomen = (garment: string) => /dress/i.test(garment);

/** A picture's width / height, so the frame takes its shape (2:3 player, 3:2 team photo, the person photo's own). */
const imageRatio = (src: string) => new Promise<number>(resolve => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 2 / 3);
    img.onerror = () => resolve(2 / 3);
    img.src = src;
});

export function PlayerShotButton({ kit, pictures, requireAuth, disabled, className = 'button button-secondary full-width', label = 'See it on a player' }: {
    kit: PlayerKit;
    /** The kit pictures: the 3D front and back captures, or the AI picture. */
    pictures: () => Promise<string[]>;
    requireAuth: (then: () => void) => void;
    disabled?: boolean;
    className?: string;
    label?: string;
}) {
    const [open, setOpen] = useState(false);
    return <>
        <button type="button" className={className} disabled={disabled} onClick={() => requireAuth(() => setOpen(true))}><UserRound size={16} /> {label}</button>
        {open && <PlayerShotDialog kit={kit} pictures={pictures} onClose={() => setOpen(false)} />}
    </>;
}

export function PlayerShotDialog({ kit, pictures, onClose }: { kit: PlayerKit; pictures: () => Promise<string[]>; onClose: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const women = wornByWomen(kit.garment);
    const [player, setPlayer] = useState<'male' | 'female'>(women ? 'female' : 'male');
    const [pose, setPose] = useState<Pose>('front');
    const [shots, setShots] = useState<{ image: string; saved: boolean; ratio: number }[]>([]);
    const [at, setAt] = useState(0);
    const [busy, setBusy] = useState<'' | 'make' | 'save'>('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [who, setWho] = useState<'player' | 'photo'>('player');
    const [photo, setPhoto] = useState('');
    useEffect(() => { dialog.current?.showModal(); }, []);
    const fileName = `${(kit.name || '3deezi-kit').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}-on-a-player-${at + 1}.jpg`;

    async function make(nextPose: Pose = pose) {
        setBusy('make'); setError(''); setNotice('');
        try {
            const images = await Promise.all((await pictures()).filter(Boolean).slice(0, 2).map(asDataUrl));
            if (!images.length) throw new Error('The kit picture is not ready yet. Please try again.');
            if (who === 'photo' && !photo) throw new Error('Upload a photo of a person first.');
            const result = await api<{ image: string }>('/ai/player', { method: 'POST', body: JSON.stringify({ images, ...(who === 'photo' ? { person: photo } : {}), player, pose: nextPose, sport: kit.sport, garment: kit.garment, colours: kit.colours || [], logoText: kit.logoText || '', backName: kit.backName || '', number: kit.number || '' }) });
            const ratio = await imageRatio(result.image);
            setShots(items => { setAt(items.length); return [...items, { image: result.image, saved: false, ratio }]; });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create the picture.');
        } finally { setBusy(''); }
    }

    function anotherPose() {
        if (who === 'photo') { void make(); return; }
        const next = POSES[(POSES.findIndex(p => p[0] === pose) + 1) % POSES.length][0];
        setPose(next); void make(next);
    }

    function pickPhoto(file?: File) {
        setError('');
        if (!file) return;
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError('Choose a JPG, PNG or WebP photo.'); return; }
        if (file.size > 10 * 1024 * 1024) { setError('Choose a photo smaller than 10 MB.'); return; }
        const r = new FileReader(); r.onload = () => setPhoto(String(r.result)); r.readAsDataURL(file);
    }

    async function save() {
        const shot = shots[at]; if (!shot) return;
        setBusy('save'); setError('');
        try {
            await api('/ai/player/save', { method: 'POST', body: JSON.stringify({ image: shot.image, name: kit.name || 'Kit' }) });
            setShots(items => items.map((s, i) => i === at ? { ...s, saved: true } : s));
            setNotice('Saved in your Assets.');
        } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(''); }
    }

    const shot = shots[at];
    return <dialog ref={dialog} className="modal compact-modal player-shot" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
        <button className="icon-button modal-close" disabled={!!busy} onClick={onClose} aria-label="Close dialog"><X /></button>
        <span className="eyebrow">SEE IT ON A PLAYER</span>
        <h2>Your kit, worn for real.</h2>
        <div className="showcase-panel">
            {/* Once there is a picture, its room goes to the picture (QA 2026-10-27). */}
            {!shot && <p className="muted">A photoreal {kit.sport} player wears your {kit.garment.toLowerCase()} in the sport's own setting. The colours, print, crest and lettering stay as you made them.</p>}
            <div className={`showcase-frame${shot ? ' has-shot' : ''}`} style={shot ? { aspectRatio: String(shot.ratio) } : undefined}>{shot ? <img src={shot.image} alt={`Your kit on a ${player} player`} /> : <span>{busy === 'make' ? 'Creating your picture… about a minute' : 'Choose a player and a pose, then create.'}</span>}{busy === 'make' && <LoaderCircle className="spin showcase-spinner" size={28} />}</div>
            {shots.length > 1 && <div className="showcase-strip">{shots.map((s, i) => <button key={i} className={i === at ? 'selected' : ''} onClick={() => setAt(i)}><img src={s.image} alt={`Player picture ${i + 1}`} /></button>)}</div>}
            <div className="prompt-chips" aria-label="Who wears it"><button type="button" className={who === 'player' ? 'selected' : ''} disabled={!!busy} onClick={() => setWho('player')}>An athlete</button><button type="button" className={who === 'photo' ? 'selected' : ''} disabled={!!busy} onClick={() => setWho('photo')}>Upload a photo of a person</button></div>
            {who === 'photo' && <div className="player-photo"><label className="button button-secondary"><input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={!!busy} onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />{photo ? 'Change photo' : 'Choose a photo'}</label>{photo && <img src={photo} alt="Your photo" />}<p className="field-hint">Your photo is only used to make this picture. It isn't kept unless you save the result.</p></div>}
            {who === 'player' && <>            <div className="prompt-chips" aria-label="Player">{(['male', 'female'] as const).map(p => <button type="button" key={p} className={player === p ? 'selected' : ''} disabled={!!busy || (women && p === 'male')} onClick={() => setPlayer(p)}>{p === 'male' ? 'Male player' : 'Female player'}</button>)}</div>
            <div className="prompt-chips" aria-label="Pose">{POSES.map(([id, name]) => <button type="button" key={id} className={pose === id ? 'selected' : ''} disabled={!!busy} onClick={() => setPose(id)}>{name}</button>)}</div></>}
            {error && <p className="error-message" role="alert">{error}</p>}
            {notice && <p className="field-hint" role="status">{notice}</p>}
            <div className="showcase-actions">
                {!shot && <button className="button button-gradient" disabled={!!busy || (who === 'photo' && !photo)} onClick={() => make()}>{busy === 'make' ? <LoaderCircle className="spin" size={17} /> : <UserRound size={17} />}{busy === 'make' ? 'CREATING…' : 'CREATE PICTURE'}</button>}
                {shot && <button className="button button-secondary" disabled={!!busy} onClick={async () => saveBlob(await (await fetch(shot.image)).blob(), fileName)}><Download size={16} /> Download</button>}
                {shot && <button className="button button-secondary" disabled={!!busy} onClick={anotherPose}>{busy === 'make' ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />} {who === 'photo' ? 'Try again' : 'Try another pose'}</button>}
                {shot && <button className="button button-gradient" disabled={!!busy || shot.saved} onClick={save}>{busy === 'save' ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} {shot.saved ? 'Saved' : 'Save to my assets'}</button>}
            </div>
            <p className="field-hint">Each picture uses one AI generation, like the showcase.</p>
        </div>
    </dialog>;
}
