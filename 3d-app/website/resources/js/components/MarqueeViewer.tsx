import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { VIEWER_VERSION } from './KitViewer';
import type { MarqueeDesign, MarqueeView, MarqueeZone } from '../marquee';

/** What the Marquee Studio asks of the 3D marquee. */
export interface MarqueeViewerHandle {
  setView: (view: MarqueeView) => void;
  /** A picture of the marquee from a side (PNG data URL). */
  capture: (view?: MarqueeView) => Promise<string>;
  /** A zone's print at full size: {data: PNG data URL, size: metres}. */
  panelPrint: (zone: MarqueeZone) => Promise<{ data: string; size: { w: number; h: number } }>;
}
export interface LayerChange { zone: MarqueeZone; id: string; x: number; y: number; w?: number; size?: number; final: boolean }

/**
 * The 3D pop-up marquee (media/viewer/marquee.html, built from viewer/src/marquee-main.js with the kit viewer): the
 * design is painted on its roof, valances and walls; a tap on a panel picks that zone; with Move or Scale a drag on the
 * selected zone moves or scales the selected layer. `showroom`: the landing page's stage (a feather flag, a pull-up
 * banner and a table cover beside it, no picking).
 */
export const MarqueeViewer = forwardRef<MarqueeViewerHandle, {
  design: MarqueeDesign; view?: MarqueeView; showroom?: boolean; zone?: MarqueeZone | null; layer?: { zone: MarqueeZone; id: string } | null; tool?: 'move' | 'scale' | null;
  onZonePick?: (zone: MarqueeZone) => void; onPanels?: (images: Partial<Record<MarqueeZone, string>>) => void; onLayerChange?: (change: LayerChange) => void; onReady?: () => void; className?: string;
}>(function MarqueeViewer({ design, view, showroom = false, zone = null, layer = null, tool = null, onZonePick, onPanels, onLayerChange, onReady, className = '' }, ref) {
  const host = `website-marquee-${useId().replace(/:/g, '')}`;
  const appBase = document.querySelector('meta[name="app-base"]')?.getAttribute('content')?.replace(/\/$/, '') || '';
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const waits = useRef(new Map<string, (message: Record<string, unknown>) => void>());
  const callbacks = useRef({ onZonePick, onPanels, onLayerChange, onReady });
  callbacks.current = { onZonePick, onPanels, onLayerChange, onReady };

  const send = useCallback((cmd: string, arg?: unknown) => { frame.current?.contentWindow?.postMessage(JSON.stringify({ cmd, arg }), window.location.origin); }, []);
  /** A command answered by a message of `type` (matched by its id, or by its view for captures). */
  const ask = useCallback((type: string, key: string, cmd: string, arg: unknown) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => { waits.current.delete(`${type}:${key}`); reject(new Error('The 3D marquee did not answer. Please try again.')); }, 20000);
    waits.current.set(`${type}:${key}`, (message) => { clearTimeout(timer); if (message.error) reject(new Error(String(message.error))); else resolve(message); });
    send(cmd, arg);
  }), [send]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      let message: Record<string, unknown>;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.host !== host) return;
      if (message.type === 'ready') { setReady(true); callbacks.current.onReady?.(); }
      if (message.type === 'zonePick' && typeof message.zone === 'string') callbacks.current.onZonePick?.(message.zone as MarqueeZone);
      if (message.type === 'panels' && message.images && typeof message.images === 'object') callbacks.current.onPanels?.(message.images as Partial<Record<MarqueeZone, string>>);
      if (message.type === 'layerChange') callbacks.current.onLayerChange?.(message as unknown as LayerChange);
      const key = message.type === 'capture' ? `capture:${message.view ?? ''}` : message.type === 'panelPrint' ? `panelPrint:${message.id}` : '';
      const wait = key && waits.current.get(key);
      if (wait) { waits.current.delete(key); wait(message); }
    };
    window.addEventListener('message', receive);
    // A cached frame can be ready before this listener is in place.
    const poll = setInterval(() => { try { if (frame.current?.contentDocument?.body?.classList.contains('ready')) { setReady(true); clearInterval(poll); } } catch { clearInterval(poll); } }, 400);
    const late = setTimeout(() => { if (!frame.current?.contentDocument?.body?.classList.contains('ready')) setFailed(true); }, 45000);
    return () => { window.removeEventListener('message', receive); clearInterval(poll); clearTimeout(late); };
  }, [host]);
  useEffect(() => { if (ready) setFailed(false); }, [ready]);

  // The design, the chosen view, the selection and the tool, whenever they change.
  useEffect(() => { if (ready) send('setDesign', design); }, [ready, design, send]);
  useEffect(() => { if (ready && view) send('setView', view); }, [ready, view, send]);
  useEffect(() => { if (ready) send('selectZone', zone); }, [ready, zone, send]);
  useEffect(() => { if (ready) send('selectLayer', layer); }, [ready, layer?.zone, layer?.id, send]);
  useEffect(() => { if (ready) send('tool', tool); }, [ready, tool, send]);

  useImperativeHandle(ref, () => ({
    setView: (v) => send('setView', v),
    capture: async (v) => {
      const message = await ask('capture', v ?? '', 'capture', v ?? null);
      return String(message.data);
    },
    panelPrint: async (z) => {
      const id = `${z}-${Date.now()}`;
      const message = await ask('panelPrint', id, 'panelPrint', { id, zone: z });
      return { data: String(message.data), size: message.size as { w: number; h: number } };
    },
  }), [ask, send]);

  const quality = new URLSearchParams(window.location.search).get('quality');
  const src = `${appBase}/media/viewer/marquee.html?host=${encodeURIComponent(host)}${showroom ? '&scene=showroom' : ''}${quality && /^(low|high)$/.test(quality) ? `&quality=${quality}` : ''}&v=${VIEWER_VERSION}`;
  return <div className={`marquee-viewer ${className}`}>
    <iframe ref={frame} title={showroom ? 'Signage and marquees on the 3DEEZI stage' : 'Your marquee in 3D'} src={src} onLoad={() => { try { if (frame.current?.contentDocument?.body?.classList.contains('ready')) setReady(true); } catch { /* not ready yet */ } }} />
    {!ready && <div className="marquee-viewer-status" role="status">{failed ? <><span>The 3D marquee could not load.</span><button type="button" onClick={() => { setFailed(false); if (frame.current) frame.current.src = src; }}>Try again</button></> : <><LoaderCircle className="spin" /><span>Putting up your marquee…</span></>}</div>}
  </div>;
});
export default MarqueeViewer;
