import { useEffect, useRef, useState } from 'react';
import { Camera, Download, FolderPlus, LoaderCircle, X } from 'lucide-react';
import { api, saveBlob } from '../api';
import type { KitViewerHandle } from './KitViewer';
import '../../css/product-mockup.css';

/** The Studio's "Mockup": studio product photos (front, back, 3/4) of the design, from the 3D captures. */
export type MockupView = 'front' | 'back' | 'three-quarter';
export const mockupViews: { id: MockupView; label: string }[] = [{ id: 'front', label: 'Front' }, { id: 'back', label: 'Back' }, { id: 'three-quarter', label: '3/4' }];
export const mockupBackgrounds = [{ id: 'light-grey', label: 'Light grey' }, { id: 'white', label: 'White' }, { id: 'dark', label: 'Dark' }] as const;
type Background = typeof mockupBackgrounds[number]['id'];

export type MockupMeta = { name: string; sport: string; garment: string; logoText?: string; backName?: string; number?: string; colors?: string[] };

export default function ProductMockupDialog({ viewer, meta, ready, onClose, onNotice }: { viewer: React.RefObject<KitViewerHandle | null>; meta: MockupMeta; ready: boolean; onClose: () => void; onNotice: (text: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [background, setBackground] = useState<Background>('light-grey');
  const [shots, setShots] = useState<Partial<Record<MockupView, string>>>({});
  const [working, setWorking] = useState<MockupView | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = !!working || saving;
  const file = (meta.name || '3deezi-kit').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  useEffect(() => { dialog.current?.showModal(); }, []);

  async function generate() {
    if (!viewer.current) return;
    setError(''); setShots({});
    try {
      setWorking('front');
      const front = await viewer.current.capture('front'), back = await viewer.current.capture('back');
      for (const view of mockupViews) {
        setWorking(view.id);
        const result = await api<{ image: string }>('/ai/product-mockup', { method: 'POST', body: JSON.stringify({ front, back, view: view.id, background, sport: meta.sport, garment: meta.garment, logoText: meta.logoText || null, backName: meta.backName || null, number: meta.number || null, colors: (meta.colors || []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6) }) });
        setShots(items => ({ ...items, [view.id]: result.image }));
      }
      onNotice('Your mockups are ready.');
    } catch (e) { setError(e instanceof Error ? e.message : 'The mockup could not be made. Please try again.'); }
    finally { setWorking(null); }
  }
  const download = async (view: MockupView) => { const src = shots[view]; if (src) saveBlob(await (await fetch(src)).blob(), `${file}-mockup-${view}.jpg`); };
  async function downloadAll() { for (const view of mockupViews) { await download(view.id); await new Promise(r => setTimeout(r, 300)); } }
  async function keep() {
    setSaving(true); setError('');
    try {
      const images = mockupViews.filter(v => shots[v.id]).map(v => ({ view: v.id, image: shots[v.id] }));
      await api('/ai/product-mockup/save', { method: 'POST', body: JSON.stringify({ name: meta.name, images }) });
      onNotice(`${images.length} mockup${images.length === 1 ? '' : 's'} saved in your Assets.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Please try again.'); }
    finally { setSaving(false); }
  }
  const count = Object.keys(shots).length;

  return <dialog ref={dialog} className="modal product-mockup-modal" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <button className="icon-button modal-close" disabled={busy} onClick={onClose} aria-label="Close dialog"><X /></button>
    <span className="eyebrow">STUDIO MOCKUP</span>
    <h2>Product photos of your design.</h2>
    <p className="muted">Three studio pictures (front, back and 3/4) on a clean background, with real fabric, stitching, folds and shadows. Your colours, print, crest, name and number stay as you made them.</p>
    <div className="product-mockup-grid">{mockupViews.map(v => <figure key={v.id} className={`pm-shot pm-${background}`}>
      {shots[v.id] ? <img src={shots[v.id]} alt={`${v.label} mockup of your design`} /> : <span>{working === v.id ? <><LoaderCircle className="spin" size={24} /> Making the {v.label} picture…</> : v.label}</span>}
      <figcaption>{v.label}{shots[v.id] && <button type="button" className="icon-button" disabled={busy} onClick={() => download(v.id)} aria-label={`Download ${v.label}`} title="Download"><Download size={15} /></button>}</figcaption>
    </figure>)}</div>
    <div className="prompt-chips" role="group" aria-label="Background">{mockupBackgrounds.map(b => <button type="button" key={b.id} className={background === b.id ? 'selected' : ''} disabled={busy} onClick={() => setBackground(b.id)}>{b.label}</button>)}</div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="showcase-actions">
      <button className="button button-gradient" disabled={busy || !ready} onClick={generate}>{working ? <LoaderCircle className="spin" size={17} /> : <Camera size={17} />}{working ? 'MAKING MOCKUPS…' : count ? 'MAKE AGAIN' : 'MAKE MOCKUPS'}</button>
      {count > 0 && <button className="button button-secondary" disabled={busy} onClick={downloadAll}><Download size={16} /> Download all</button>}
      {count > 0 && <button className="button button-secondary" disabled={busy} onClick={keep}>{saving ? <LoaderCircle className="spin" size={16} /> : <FolderPlus size={16} />} Save to my assets</button>}
    </div>
    <p className="field-hint">About a minute per picture. Uses your AI allowance like the Photoreal showcase.</p>
  </dialog>;
}
