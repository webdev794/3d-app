import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, baseUrl, saveBlob, type ApiError, type Project, type User } from '../api';
import type { Draft } from '../App';
import { defaultDesign, type ArtworkLayer, type Design } from '../types';
import { artboardOf, placements, readAsset, type ArtboardLayer, type LibraryAsset } from '../components/StudioArtwork';

/** Bump when the editor (media/artboard/index.html) is rebuilt, so browsers load the new copy. */
const EDITOR_VERSION = '2026-10-20-8';

/** The garments artwork can be sent to (config/catalog.php), in the Studio's order, and the parts each has. */
const GARMENTS: { id: Design['garment']; name: string }[] = [{ id: 'fullkit', name: 'Full Kit' }, { id: 'jersey', name: 'Jersey' }, { id: 'shorts', name: 'Shorts' }, { id: 'tee', name: 'Training Tee' }, { id: 'singlet', name: 'Singlet' }, { id: 'polo', name: 'Polo' }];
const partsOf = (garment: string): string[] => (garment === 'shorts' ? ['shorts'] : garment === 'fullkit' ? ['top', 'shorts'] : ['top']);

type Message = {
    type?: string; host?: string; data?: string; name?: string; format?: string; mode?: string;
    // Designs in the account (projects.js in the Artboard): {type: 'docs', id, op, …}.
    id?: number; op?: string; template?: boolean; doc?: number; document?: string; preview?: string | null; version?: number;
    // Send to 3D Studio: the design it came from, where it goes and where on the garment.
    artboard?: number | null; target?: { kind?: string; garment?: string; project?: number | string }; placement?: string | null;
};

/**
 * The 3DEEZI Artboard (CorelDRAW-style artwork editor). The editor itself is
 * the shared page in media/artboard, also used by the apps; this route hosts
 * it, keeps its designs in the account and sends finished artwork to the 3D
 * studio (linked to the design: the Studio's Edit in Artboard opens it again
 * with /artboard?doc=ID, and sending again updates that artwork in place).
 */
export default function ArtboardPage({ draft, onChange, user, onNotice, requireAuth, onStart }: { draft: Draft; onChange: (draft: Draft) => void; user: User | null; onNotice: (text: string) => void; requireAuth: (action?: () => void) => void; onStart: (mode: 'ai' | 'dyo' | 'home') => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const latest = useRef(draft);
  latest.current = draft;
  const userRef = useRef(user);
  userRef.current = user;
  const authRef = useRef(requireAuth);
  authRef.current = requireAuth;
  const startRef = useRef(onStart);
  startRef.current = onStart;
  const ready = useRef(false);
  /** Edit in Artboard: the design to open once the editor is ready and the user is signed in. */
  const pendingDoc = useRef<number | null>(null);
  const docParam = Number(params.get('doc')) || 0;

  const send = useCallback((cmd: string, arg: unknown) => frame.current?.contentWindow?.postMessage(JSON.stringify({ cmd, arg }), window.location.origin), []);
  /** What the Artboard needs to know: the account, the kit open in the Studio, the garments and placements. */
  const sendHost = useCallback(() => {
    const d = latest.current;
    send('host', {
      docs: true, signedIn: !!userRef.current,
      kit: { name: d.name, garment: d.design.garment, artboards: (d.design.layers ?? []).map(artboardOf).filter(Boolean) },
      garments: GARMENTS.map(g => ({ ...g, parts: partsOf(g.id) })),
      placements: placements.map(p => ({ id: p.id, label: p.label, part: p.part })),
    });
  }, [send]);
  const openPending = useCallback(() => {
    const id = pendingDoc.current;
    if (!id || !ready.current) return;
    if (!userRef.current) { authRef.current(); return; } // opened again once signed in (the effect below)
    pendingDoc.current = null;
    send('openDoc', { id });
    setParams({}, { replace: true });
  }, [send, setParams]);
  useEffect(() => { if (docParam) { pendingDoc.current = docParam; openPending(); } }, [docParam, openPending]);
  useEffect(() => { if (ready.current) { sendHost(); openPending(); } }, [user, sendHost, openPending]);

  useEffect(() => {
    /** The Artboard's requests for designs in the account and for the user's projects. */
    async function docs(msg: Message) {
      const reply = (arg: Record<string, unknown>) => send('docsReply', { id: msg.id, ...arg });
      if (!userRef.current) { reply({ ok: false, signin: true, status: 401, error: 'Sign in to keep your designs in your 3DEEZI account.' }); return; }
      try {
        let data: unknown = null;
        if (msg.op === 'list') data = await api(`/artboards?template=${msg.template ? 1 : 0}`);
        else if (msg.op === 'get') data = await api(`/artboards/${Number(msg.doc)}`);
        else if (msg.op === 'save') {
          const body = { name: msg.name, document: msg.document, preview: msg.preview ?? null, template: !!msg.template, ...(msg.doc && msg.version ? { expected_version: msg.version } : {}) };
          data = await api(msg.doc ? `/artboards/${Number(msg.doc)}` : '/artboards', { method: msg.doc ? 'PATCH' : 'POST', body: JSON.stringify(body) });
        } else if (msg.op === 'delete') await api(`/artboards/${Number(msg.doc)}`, { method: 'DELETE' });
        else if (msg.op === 'projects') data = (await api<Project[]>('/projects')).map(p => ({ id: p.id, name: p.name, garment: p.design?.garment || p.garment, artboards: (p.design?.layers ?? []).map(artboardOf).filter(Boolean) }));
        else throw new Error('The Artboard asked for something this page cannot do.');
        reply({ ok: true, data });
      } catch (e) { reply({ ok: false, error: (e as Error).message, status: (e as ApiError).status ?? 0 }); }
    }
    /** Send to 3D Studio: onto the kit in the Studio, a new kit or one of the user's projects. Layers made from the same design are updated in place. */
    async function placeArtwork(msg: Message) {
      const src = msg.data!, target = msg.target ?? { kind: 'current' }, name = (msg.name || 'Artboard design').slice(0, 120);
      const link = typeof msg.artboard === 'number' && msg.artboard > 0 ? msg.artboard : undefined;
      let base: Draft = latest.current;
      try {
        if (target.kind === 'project' && target.project != null) {
          const id = Number(target.project);
          if (base.id !== id) { const p = await api<Project>(`/projects/${id}`); base = { ...p, design: { ...defaultDesign, ...p.design } }; }
        } else if (target.kind === 'garment' && GARMENTS.some(g => g.id === target.garment)) {
          const garment = target.garment as Design['garment'];
          base = { name: 'Untitled kit', sport: base.sport, garment, mode: 'dyo', design: { ...defaultDesign, garment } };
        }
      } catch (e) { const text = (e as Error).message; onNotice(text); send('toast', text); return; }
      const layers = base.design.layers ?? [];
      const linked = link ? layers.filter(l => artboardOf(l) === link) : [];
      let next: ArtworkLayer[];
      if (linked.length) next = layers.map(l => (artboardOf(l) === link ? { ...l, src, name } : l));
      else {
        if (layers.length >= 40) { const text = 'A design can contain up to 40 artwork layers: remove one in the Studio first.'; onNotice(text); send('toast', text); return; }
        const parts = partsOf(base.design.garment), valid = placements.filter(p => parts.includes(p.part));
        const at = valid.find(p => p.id === msg.placement) ?? valid.find(p => p.id === (base.design.garment === 'shorts' ? 'shorts-left' : 'left-chest')) ?? valid[0];
        const { id: _id, label: _label, ...position } = at;
        const layer: ArtboardLayer = { id: `art-${Date.now().toString(36)}`, name, type: 'image', src, ...position, ...(link ? { artboard: link } : {}) };
        next = [...layers, layer];
      }
      onChange({ ...base, design: { ...base.design, layers: next } });
      onNotice(linked.length ? `${name} updated on your kit: same place and size.${base.id ? ' Save the project to keep it.' : ''}` : target.kind === 'project' ? `${name} added to ${base.name}. Save the project to keep it.` : 'Artwork added to your kit. Drag it into place on the 3D kit or in 2D panels.');
      navigate('/studio');
    }
    async function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      let msg: Message;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.host !== 'web') return;
      // AI / DYO quick access on the Artboard's top bar (the artwork is already saved there).
      if (msg.type === 'start' && (msg.mode === 'ai' || msg.mode === 'dyo' || msg.mode === 'home')) { startRef.current(msg.mode); return; }
      if (msg.type === 'docs' && typeof msg.id === 'number') { await docs(msg); return; }
      if (msg.type === 'signin') { requireAuth(); return; }
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
      if (msg.type === 'ready') {
        // The account and the kit for the File menu and Send to 3D Studio; Edit in Artboard's design.
        ready.current = true;
        sendHost();
        openPending();
        if (user) {
          // The user's uploaded logos and artwork appear in the Assets tab.
          try {
            const assets = (await api<LibraryAsset[]>('/assets')).filter(a => ['logo', 'artwork', 'reference'].includes(a.type)).slice(0, 24);
            const list = await Promise.all(assets.map(async a => ({ name: a.name, src: await readAsset(a).catch(() => '') })));
            send('setAssets', list.filter(a => a.src));
          } catch { /* Assets are optional here. */ }
        }
      }
      if (msg.type === 'export' && msg.data) saveBlob(await (await fetch(msg.data)).blob(), msg.name || '3deezi-artwork.png');
      if (msg.type === 'artwork' && msg.data) await placeArtwork(msg);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate, onChange, onNotice, user, requireAuth, send, sendHost, openPending]);

  return <iframe ref={frame} className="artboard-frame" title="3DEEZI Artboard" allow="fullscreen" allowFullScreen src={`${baseUrl}/media/artboard/index.html?host=web&v=${EDITOR_VERSION}`} />;
}
