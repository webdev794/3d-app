import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, baseUrl, saveBlob, type User } from '../api';
import type { Draft } from '../App';
import type { ArtworkLayer } from '../types';
import { placements, readAsset, type LibraryAsset } from '../components/StudioArtwork';

/** Bump when the editor (media/artboard/index.html) is rebuilt, so browsers load the new copy. */
const EDITOR_VERSION = '2026-10-19-4';

/**
 * The 3DEEZI Artboard (CorelDRAW-style artwork editor). The editor itself is
 * the shared page in media/artboard, also used by the apps; this route hosts
 * it and sends finished artwork to the 3D studio.
 */
export default function ArtboardPage({ draft, onChange, user, onNotice, requireAuth }: { draft: Draft; onChange: (draft: Draft) => void; user: User | null; onNotice: (text: string) => void; requireAuth: (action?: () => void) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const latest = useRef(draft);
  latest.current = draft;

  useEffect(() => {
    const send = (cmd: string, arg: unknown) => frame.current?.contentWindow?.postMessage(JSON.stringify({ cmd, arg }), window.location.origin);
    async function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      let msg: { type?: string; host?: string; data?: string; name?: string; format?: string };
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.host !== 'web') return;
      if (msg.type === 'convertFile' && msg.data && msg.format === 'cdr') {
        // The server converts CorelDRAW to SVG; the editor imports SVG as editable vectors.
        const data = msg.data, name = msg.name || 'artwork.cdr';
        const convert = async () => {
          try {
            const form = new FormData();
            form.append('file', new File([await (await fetch(data)).blob()], name));
            const out = await api<{ svg: string; name: string }>('/convert/cdr', { method: 'POST', body: form });
            send('addImage', { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(out.svg)}`, name: out.name });
            onNotice('CorelDRAW file imported as editable vectors.');
          } catch (e) { onNotice((e as Error).message); send('toast', (e as Error).message); }
        };
        // Not set up on this server: say so straight away, without asking anyone to sign in.
        const formats = await api<{ cdr: boolean }>('/convert/formats').catch(() => ({ cdr: true }));
        if (!formats.cdr) {
          const text = 'CorelDRAW import is not set up on this server yet. Export the file as SVG from CorelDRAW and import that instead.';
          onNotice(text); send('toast', text);
          return;
        }
        // Signed out: open sign-in, then carry on with the import.
        if (user) await convert(); else { onNotice('Sign in to import CorelDRAW files.'); requireAuth(() => void convert()); }
        return;
      }
      if (msg.type === 'ready' && user) {
        // The user's uploaded logos and artwork appear in the Assets tab.
        try {
          const assets = (await api<LibraryAsset[]>('/assets')).filter(a => ['logo', 'artwork', 'reference'].includes(a.type)).slice(0, 24);
          const list = await Promise.all(assets.map(async a => ({ name: a.name, src: await readAsset(a).catch(() => '') })));
          send('setAssets', list.filter(a => a.src));
        } catch { /* Assets are optional here. */ }
      }
      if (msg.type === 'export' && msg.data) saveBlob(await (await fetch(msg.data)).blob(), msg.name || '3deezi-artwork.png');
      if (msg.type === 'artwork' && msg.data) {
        const current = latest.current;
        const shorts = current.design.garment === 'shorts';
        const at = placements.find(p => p.id === (shorts ? 'shorts-left' : 'left-chest'))!;
        const layer: ArtworkLayer = { id: `art-${Date.now().toString(36)}`, name: msg.name || 'Artboard design', type: 'image', src: msg.data, part: at.part, side: at.side, x: at.x, y: at.y, w: at.w };
        onChange({ ...current, design: { ...current.design, layers: [...(current.design.layers ?? []), layer] } });
        onNotice('Artwork added to your kit. Drag it into place on the 3D kit or in 2D panels.');
        navigate('/studio');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate, onChange, onNotice, user, requireAuth]);

  return <iframe ref={frame} className="artboard-frame" title="3DEEZI Artboard" allow="fullscreen" allowFullScreen src={`${baseUrl}/media/artboard/index.html?host=web&v=${EDITOR_VERSION}`} />;
}
