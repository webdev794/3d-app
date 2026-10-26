import { useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle, RotateCcw, Save, UserRound, X } from 'lucide-react';
import { api, saveBlob } from '../api';

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
    const [shots, setShots] = useState<{ image: string; saved: boolean }[]>([]);
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
            setShots(items => { setAt(items.length); return [...items, { image: result.image, saved: false }]; });
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
            <p className="muted">A photoreal {kit.sport} player wears your {kit.garment.toLowerCase()} in the sport's own setting. The colours, print, crest and lettering stay as you made them.</p>
            <div className="showcase-frame">{shot ? <img src={shot.image} style={{ objectFit: 'contain' }} alt={`Your kit on a ${player} player`} /> : <span>{busy === 'make' ? 'Creating your picture… about a minute' : 'Choose a player and a pose, then create.'}</span>}{busy === 'make' && <LoaderCircle className="spin showcase-spinner" size={28} />}</div>
            {shots.length > 1 && <div className="showcase-strip">{shots.map((s, i) => <button key={i} className={i === at ? 'selected' : ''} onClick={() => setAt(i)}><img src={s.image} alt={`Player picture ${i + 1}`} /></button>)}</div>}
            <div className="prompt-chips" aria-label="Who wears it"><button type="button" className={who === 'player' ? 'selected' : ''} disabled={!!busy} onClick={() => setWho('player')}>An athlete</button><button type="button" className={who === 'photo' ? 'selected' : ''} disabled={!!busy} onClick={() => setWho('photo')}>Upload a photo of a person</button></div>
            {who === 'photo' && <div className="player-photo"><label className="button button-secondary"><input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={!!busy} onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />{photo ? 'Change photo' : 'Choose a photo'}</label>{photo && <img src={photo} alt="Your photo" style={{ height: 64, borderRadius: 8, objectFit: 'cover' }} />}<p className="field-hint">Your photo is only used to make this picture. It isn't kept unless you save the result.</p></div>}
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
