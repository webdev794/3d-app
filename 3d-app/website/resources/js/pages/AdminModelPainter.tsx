// MODEL-PAINTER (admin tool, 2026-11-26; an internal extra, remove with model-painter/REMOVE.md): opened only by typing
// /admin/model-painter (admin only; no menu entry or button, user 27 Nov).
// The tool itself is its own page (media/model-painter/index.html, built by model-painter/build.mjs); this only hosts it
// and hands it the garment tiles (each with the design it starts with, as the Studio opens it) and the sign-in.
import { useEffect, useRef } from 'react';
import { baseUrl, getToken, media, type Catalog } from '../api';
import { VIEWER_VERSION, defaultDesign } from '../components/KitViewer';
import { tileMarks } from './Create';

export default function AdminModelPainter({ catalog }: { catalog: Catalog | null }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!catalog) return;
    const tiles = catalog.sports.flatMap(s => (s.tiles ?? []).filter(t => t.garment && t.fit !== 'soon').map(t => {
      const look = { trackStyle: undefined, neck: undefined, fit: undefined, ...t.design };
      return { sport: s.id, sportName: s.name, name: t.name, garment: t.garment, design: { ...defaultDesign, ...look, ...tileMarks(defaultDesign, look, t.garment as string), garment: t.garment, productName: t.name } };
    }));
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      let m: { type?: string } | null = null;
      try { m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      if (m?.type === 'modelpainter-hello') frame.current?.contentWindow?.postMessage({ type: 'modelpainter-init', tiles, token: getToken(), api: `${baseUrl}/api/v1`, viewerVersion: VIEWER_VERSION }, window.location.origin);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [catalog]);
  if (!catalog) return <p className="muted">Loading the garment tiles…</p>;
  return <iframe ref={frame} title="Model Painter" src={`${media('model-painter/index.html')}?v=${VIEWER_VERSION}`} style={{ width: '100%', height: 'calc(100vh - 150px)', minHeight: 560, border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, background: '#11151a' }} />;
}
