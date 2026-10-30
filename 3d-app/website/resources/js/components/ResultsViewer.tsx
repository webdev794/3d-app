import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Expand, Minus, Plus, X } from 'lucide-react';

/**
 * The AI designer's results viewer (client visual 2026-10-22, images/146.jpg; wider 2026-10-30, images/240.jpg): one
 * large design in a wide frame that fills the space between the heading and the controls, the picture centred in it at
 * its own proportions (never cropped or stretched) over its blurred backdrop; the other designs as bigger cards stacked
 * in a column at its right (in a row under it on phones). The cards are page elements only: downloads and the 3D
 * Designer get the selected picture alone.
 */
export type ViewerThumb = { index: number; label: string; disabled: boolean; content: ReactNode };

export type ViewerLayout = { iw: number; ih: number; left: number; top: number };

/** The picture's box, centred in a W×H frame, for a picture of aspect `ar` (width / height): as big as it fits. */
export function viewerLayout(W: number, H: number, ar: number): ViewerLayout {
  const iw = Math.max(0, Math.min(W, H * ar)), ih = ar ? iw / ar : 0;
  return { iw, ih, left: Math.round((W - iw) / 2), top: Math.round((H - ih) / 2) };
}

export function ResultsViewer({ id, image, alt, defaultRatio, main, thumbs, tools, onPick, busy }: {
  /** The selected design: a new one plays the short switch transition. */
  id: string; image?: string | null; alt: string; defaultRatio: number; main: ReactNode;
  thumbs: ViewerThumb[]; tools?: ReactNode; onPick: (index: number) => void; busy?: boolean;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [full, setFull] = useState(false);
  useLayoutEffect(() => {
    const el = area.current; if (!el) return;
    const measure = () => setBox(b => b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The picture's own proportions (a front and back presentation is 3:2, an option square, an edited picture any).
  useEffect(() => {
    if (!image || ratios[image]) return;
    let live = true;
    const probe = new Image();
    probe.onload = () => { if (live && probe.naturalWidth && probe.naturalHeight) setRatios(r => ({ ...r, [image]: probe.naturalWidth / probe.naturalHeight })); };
    probe.src = image;
    return () => { live = false; };
  }, [image, ratios]);
  const ar = (image && ratios[image]) || defaultRatio;
  const l = viewerLayout(box.w, box.h, ar);
  const ready = box.w > 0 && box.h > 0;
  return <>
    <div className="aid-view-area" ref={area}>
      {ready && <div className={`aid-viewer${image ? '' : ' is-fill'}`} aria-busy={busy}>
        <div className="aid-viewer-clip">
          {image && <img className="aid-viewer-backdrop" src={image} alt="" aria-hidden="true" />}
          <div key={id} className="aid-viewer-art" style={image ? { left: l.left, top: l.top, width: l.iw, height: l.ih } : undefined} title={alt}>{main}</div>
        </div>
        <div className="aid-viewer-tools">
          {tools}
          {image && <button type="button" className="aid-round" onClick={() => setFull(true)} aria-label="Full screen" title="Full screen (pinch or scroll to zoom)"><Expand size={18} /></button>}
        </div>
      </div>}
      {full && image && <FullScreen src={image} alt={alt} onClose={() => setFull(false)} />}
    </div>
    <div className="aid-side">
      {thumbs.length > 0 && <>
        <small className="aid-thumbs-hint" aria-hidden="true">Tap to switch</small>
        <div className="aid-thumbs" role="list" aria-label="Other designs">{thumbs.map(t => <div role="listitem" className="aid-thumb-item" key={t.index}>
          <button type="button" className="aid-thumb" disabled={t.disabled} onClick={() => onPick(t.index)} aria-label={t.label} title={t.label}>
            <span className="aid-thumb-art">{t.content}</span>
            <span className="aid-thumb-num" aria-hidden="true">{t.index + 1}</span>
          </button>
        </div>)}</div>
      </>}
    </div>
  </>;
}

type View = { s: number; x: number; y: number };
const MAX_ZOOM = 6;

/** Full screen: the selected picture alone, pinch, scroll or double-tap to zoom, drag to pan; Esc or × returns. */
export function FullScreen({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [v, setV] = useState<View>({ s: 1, x: 0, y: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number } | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    close.current?.focus({ preventScroll: true });
    return () => { window.removeEventListener('keydown', key, true); document.body.style.overflow = overflow; };
  }, [onClose]);
  /** Zoom by k about a point (px, py) measured from the stage's centre. */
  const zoomAt = (k: number, px: number, py: number) => setV(o => {
    const s = Math.min(MAX_ZOOM, Math.max(1, o.s * k));
    if (s === 1) return { s: 1, x: 0, y: 0 };
    const r = s / o.s;
    return { s, x: px - (px - o.x) * r, y: py - (py - o.y) * r };
  });
  const centre = (x: number, y: number) => { const r = stage.current!.getBoundingClientRect(); return [x - r.left - r.width / 2, y - r.top - r.height / 2] as const; };
  // Wheel zoom needs a non-passive listener (React's onWheel is passive).
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const [px, py] = centre(e.clientX, e.clientY); zoomAt(Math.exp(-e.deltaY * 0.0022), px, py); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const spread = () => { const [a, b] = [...pointers.current.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; };
  return createPortal(<div className="aid-full" role="dialog" aria-modal="true" aria-label={`Full screen: ${alt}`}>
    <div ref={stage} className="aid-full-stage"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.current.size === 2) pinch.current = spread(); }}
      onPointerMove={e => {
        const p = pointers.current.get(e.pointerId); if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size >= 2 && pinch.current) {
          const now = spread(), [px, py] = centre(now.cx, now.cy);
          zoomAt(now.d / Math.max(1, pinch.current.d), px, py);
          setV(o => o.s === 1 ? o : { ...o, x: o.x + now.cx - pinch.current!.cx, y: o.y + now.cy - pinch.current!.cy });
          pinch.current = now;
        } else if (pointers.current.size === 1) setV(o => o.s === 1 ? o : { ...o, x: o.x + dx, y: o.y + dy });
      }}
      onPointerUp={e => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; }}
      onPointerCancel={e => { pointers.current.delete(e.pointerId); pinch.current = null; }}
      onDoubleClick={e => { const [px, py] = centre(e.clientX, e.clientY); if (v.s > 1) setV({ s: 1, x: 0, y: 0 }); else zoomAt(2.5, px, py); }}>
      <img src={src} alt={alt} draggable={false} style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})` }} />
    </div>
    <div className="aid-full-bar">
      <button type="button" className="aid-round" onClick={() => zoomAt(1 / 1.5, 0, 0)} disabled={v.s <= 1} aria-label="Zoom out"><Minus size={18} /></button>
      <span aria-live="polite">{Math.round(v.s * 100)}%</span>
      <button type="button" className="aid-round" onClick={() => zoomAt(1.5, 0, 0)} disabled={v.s >= MAX_ZOOM} aria-label="Zoom in"><Plus size={18} /></button>
    </div>
    <button ref={close} type="button" className="aid-round aid-full-close" onClick={onClose} aria-label="Close full screen"><X size={20} /></button>
  </div>, document.body);
}
