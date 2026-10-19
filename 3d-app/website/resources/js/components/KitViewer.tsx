import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';

export type Garment = 'jersey' | 'tee' | 'polo' | 'singlet' | 'shorts' | 'fullkit';
export type View = 'front' | 'side' | 'back';
export type Zone = 'body' | 'yoke' | 'sleeves' | 'sides' | 'hem';
/** Bump when public/media/viewer/index.html is rebuilt, so browsers load the new 3D viewer. */
const VIEWER_VERSION = '2026-10-19-2';

export interface ArtworkLayer {
    id: string; name?: string; type: 'image' | 'text' | 'shape';
    part: 'top' | 'shorts'; side: 'front' | 'back'; x: number; y: number;
    w?: number; h?: number; rot?: number; opacity?: number; src?: string;
    text?: string; size?: number; color?: string; shape?: 'rectangle' | 'ellipse' | 'triangle';
}
/**
 * Where a fixed mark sits when it was moved, resized, turned or hidden on the 2D panels (default place otherwise).
 * Keys: top_wordmark, top_sponsor, top_crest, top_name, top_number, shorts_crest, shorts_number, shorts_wordmark.
 */
export interface MarkPlace { side?: 'front' | 'back'; x?: number; y?: number; scale?: number; rot?: number; hidden?: boolean }
export interface GarmentPoint { hit: boolean; part?: 'top' | 'shorts'; side?: 'front' | 'back'; x?: number; y?: number; zone?: Zone }

/** Shared with the Flutter viewer. Persist this object as a project's design. */
export interface Design {
    garment: Garment;
    main: string;
    secondary: string;
    accent: string;
    pattern: string;
    logoText: string;
    number: string;
    backName?: string;
    patternImage?: string | null;
    logoImage?: string | null;
    /** Sponsor logo printed on the front below the wordmark. */
    sponsorImage?: string | null;
    patternColor?: string;
    patternBody?: number;
    patternScale?: number;
    gradient?: { from: string; to: string; angle: number } | null;
    zones?: Partial<Record<Zone, string>>;
    layers?: ArtworkLayer[];
    marks?: Record<string, MarkPlace>;
}

export const defaultDesign: Design = {
    garment: 'jersey',
    main: '#0b1016',
    secondary: '#00c2cc',
    accent: '#36e3ee',
    pattern: 'Chevron',
    logoText: '3DEEZI',
    backName: 'YOUR NAME',
    number: '23',
    logoImage: null,
    patternColor: '#0b6f78',
    patternBody: 0.06,
};

export interface KitViewerHandle {
    /** Returns a PNG of the actual 3D scene after pending design changes finish. */
    capture: (view?: View) => Promise<string>;
    captureBoard: () => Promise<string>;
    pick: (x: number, y: number) => Promise<GarmentPoint>;
    processImage: (src: string, options: { removeBg?: boolean; tolerance?: number; tint?: string | null }) => Promise<string>;
    select: (id: string | null) => void;
    /** Zooms the 2D panels. */
    zoomBoard: (how: 'in' | 'out' | 'fit') => void;
}

export interface KitViewerProps {
    design: Design;
    view?: View;
    rotating?: boolean;
    onReady?: () => void;
    className?: string;
    board?: boolean;
    onLayers?: (layers: ArtworkLayer[]) => void;
    onMarks?: (marks: Record<string, MarkPlace>) => void;
    onSelection?: (id: string | null) => void;
}

interface CaptureRequest {
    view: View;
    kind?: 'scene' | 'board';
    resolve: (data: string) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

const views: Record<View, string> = { front: 'Front', side: 'Side', back: 'Back' };

/** Hosts the same bundled Three.js garment renderer used by the mobile app. */
export const KitViewer = forwardRef<KitViewerHandle, KitViewerProps>(function KitViewer(
    { design, view = 'front', rotating = false, onReady, className = '', board = false, onLayers, onMarks, onSelection }, ref,
) {
    const host = `website-kit-${useId().replace(/:/g, '')}`;
    const appBase = document.querySelector('meta[name="app-base"]')?.getAttribute('content')?.replace(/\/$/, '') || '';
    const iframe = useRef<HTMLIFrameElement>(null);
    const [attempt, setAttempt] = useState(0);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [error, setError] = useState('');
    const engineReady = useRef(false);
    const failed = useRef(false);
    const revealed = useRef(false);
    const mounted = useRef(false);
    const announced = useRef(false);
    const latestDesign = useRef('');
    const inFlightDesign = useRef<string | null>(null);
    const appliedDesign = useRef<string | null>(null);
    const latestView = useRef({ view, rotating });
    const readyCallback = useRef(onReady);
    const boardMode = useRef(board);
    const layerCallback = useRef(onLayers);
    const marksCallback = useRef(onMarks);
    const selectionCallback = useRef(onSelection);
    const requests = useRef(new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>());
    const captureQueue = useRef<CaptureRequest[]>([]);
    const activeCapture = useRef<CaptureRequest | null>(null);
    const designTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flushRef = useRef<() => void>(() => {});
    latestDesign.current = JSON.stringify({ layers: [], zones: {}, gradient: null, marks: {}, ...design });
    latestView.current = { view, rotating };
    readyCallback.current = onReady;
    boardMode.current = board;
    layerCallback.current = onLayers;
    marksCallback.current = onMarks;
    selectionCallback.current = onSelection;

    const send = useCallback((cmd: string, arg: unknown) => {
        iframe.current?.contentWindow?.postMessage(JSON.stringify({ cmd, arg }), window.location.origin);
    }, []);
    const request = useCallback(<T,>(cmd: string, arg: object) => new Promise<T>((resolve, reject) => {
        if (!engineReady.current || failed.current) { reject(new Error('Wait for the preview to finish loading.')); return; }
        const id = crypto.randomUUID();
        const timeout = setTimeout(() => { requests.current.delete(id); reject(new Error('The designer did not respond. Please try again.')); }, 20000);
        requests.current.set(id, { resolve, reject, timeout }); send(cmd, { ...arg, id });
    }), [send]);

    const rejectCaptures = useCallback((message: string) => {
        const captures = [...captureQueue.current];
        if (activeCapture.current) captures.unshift(activeCapture.current);
        activeCapture.current = null;
        captureQueue.current = [];
        requests.current.forEach((item) => { clearTimeout(item.timeout); item.reject(new Error(message)); });
        requests.current.clear();
        captures.forEach((request) => {
            clearTimeout(request.timeout);
            request.reject(new Error(message));
        });
    }, []);

    const fail = useCallback((message: string) => {
        failed.current = true;
        engineReady.current = false;
        inFlightDesign.current = null;
        if (designTimer.current) clearTimeout(designTimer.current);
        rejectCaptures(message);
        if (mounted.current) {
            setError(message);
            setStatus('error');
        }
    }, [rejectCaptures]);

    // The underlying painter is async and does not identify acknowledgements.
    // Keep one design in flight and coalesce rapid colour/text changes to the latest.
    const flush = useCallback(() => {
        if (!engineReady.current || failed.current || inFlightDesign.current || activeCapture.current) return;
        if (appliedDesign.current !== latestDesign.current) {
            inFlightDesign.current = latestDesign.current;
            send('setDesign', JSON.parse(latestDesign.current));
            designTimer.current = setTimeout(() => fail('The 3D preview could not apply this design. Please retry.'), 20000);
            return;
        }
        if (!revealed.current) return;
        if (!announced.current) {
            announced.current = true;
            setStatus('ready');
            readyCallback.current?.();
        }
        const request = captureQueue.current.shift();
        if (request) {
            activeCapture.current = request;
            send(request.kind === 'board' ? 'captureBoard' : 'capture', request.kind === 'board' ? { id: 'board-export' } : views[request.view]);
        }
    }, [send, fail]);
    flushRef.current = flush;

    useImperativeHandle(ref, () => ({
        pick: (x, y) => request<GarmentPoint>('pick', { x, y }),
        processImage: (src, options) => request<string>('processImage', { src, ...options }),
        select: (id) => send('select', id),
        zoomBoard: (how) => send('boardZoom', how),
        captureBoard: () => new Promise<string>((resolve, reject) => {
            if (!mounted.current || status === 'error') { reject(new Error('The design board is unavailable. Please retry.')); return; }
            captureQueue.current.push({ view: 'front', kind: 'board', resolve, reject, timeout: setTimeout(() => fail('The 2D panels export timed out. Please retry.'), 30000) });
            flushRef.current();
        }),
        capture: (requestedView = latestView.current.view) => new Promise<string>((resolve, reject) => {
            if (!mounted.current || status === 'error') {
                reject(new Error('The 3D preview is unavailable. Please retry the preview first.'));
                return;
            }
            const request: CaptureRequest = {
                view: requestedView,
                resolve,
                reject,
                timeout: setTimeout(() => fail('The 3D export timed out. Please retry the preview.'), 30000),
            };
            captureQueue.current.push(request);
            flushRef.current();
        }),
    }), [fail, status, request, send]);

    useEffect(() => {
        mounted.current = true;
        failed.current = false;
        revealed.current = false;
        engineReady.current = false;
        announced.current = false;
        inFlightDesign.current = null;
        appliedDesign.current = null;
        setStatus('loading');
        setError('');
        let rotationTimer: ReturnType<typeof setTimeout> | undefined;

        const begin = () => {
            if (engineReady.current || failed.current) return;
            engineReady.current = true;
            send('board', boardMode.current);
            send('setView', latestView.current.rotating ? '360°' : views[latestView.current.view]);
            flushRef.current();
            // The viewer completes its entrance animation after 1.6 s and sets
            // its initial rotation state. Re-apply the controlled prop afterward.
            rotationTimer = setTimeout(() => {
                if (engineReady.current && !failed.current) {
                    revealed.current = true;
                    send('setView', latestView.current.rotating ? '360°' : views[latestView.current.view]);
                    flushRef.current();
                }
            }, 1800);
        };

        const receive = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow) return;
            if (typeof event.data !== 'string') return;
            let message: { host?: string; type?: string; view?: string; data?: string; id?: string; error?: string; layers?: ArtworkLayer[]; marks?: Record<string, MarkPlace> };
            try { message = JSON.parse(event.data); } catch { return; }
            if (!message || message.host !== host) return;
            if (message.type === 'layers' && Array.isArray(message.layers)) layerCallback.current?.(message.layers);
            if (message.type === 'marks' && message.marks && typeof message.marks === 'object') marksCallback.current?.(message.marks);
            if (message.type === 'selection') selectionCallback.current?.(message.id || null);
            if (message.id && requests.current.has(message.id)) {
                const pending = requests.current.get(message.id)!; requests.current.delete(message.id); clearTimeout(pending.timeout);
                if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.type === 'image' ? message.data : message);
            }
            if (message.type === 'ready') begin();
            if (message.type === 'designApplied' && inFlightDesign.current) {
                if (designTimer.current) clearTimeout(designTimer.current);
                appliedDesign.current = inFlightDesign.current;
                inFlightDesign.current = null;
                flushRef.current();
            }
            if ((message.type === 'capture' || message.type === 'captureBoard') && activeCapture.current) {
                const request = activeCapture.current;
                if (request.kind === 'board' ? message.type !== 'captureBoard' : message.view !== views[request.view]) return;
                activeCapture.current = null;
                clearTimeout(request.timeout);
                if (typeof message.data === 'string' && message.data.startsWith('data:image/png;base64,')) {
                    request.resolve(message.data);
                } else request.reject(new Error('The 3D preview returned an invalid image.'));
                flushRef.current();
            }
        };

        window.addEventListener('message', receive);
        // Also detect readiness directly: a cached iframe can send its ready
        // message before React installs the listener (including Strict Mode).
        const readinessPoll = setInterval(() => {
            if (engineReady.current) return;
            try {
                if (iframe.current?.contentDocument?.body?.classList.contains('ready')) begin();
            } catch { /* A same-origin renderer is required; timeout explains a failed load. */ }
        }, 200);
        const loadTimeout = setTimeout(() => {
            if (!engineReady.current) fail('The 3D preview could not load. Check WebGL support and retry.');
        }, 60000);
        return () => {
            mounted.current = false;
            engineReady.current = false;
            window.removeEventListener('message', receive);
            clearInterval(readinessPoll);
            clearTimeout(loadTimeout);
            clearTimeout(rotationTimer);
            if (designTimer.current) clearTimeout(designTimer.current);
            rejectCaptures('The 3D preview was closed.');
        };
    }, [attempt, host, fail, rejectCaptures, send]);

    useEffect(() => { flush(); }, [design, flush]);
    useEffect(() => { if (engineReady.current) send('board', board); }, [board, send]);
    useEffect(() => {
        if (engineReady.current) send('setView', rotating ? '360°' : views[view]);
    }, [view, rotating, send]);

    return (
        <div className={`kit-viewer ${className}`} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 260, overflow: 'hidden', background: '#03060a' }} aria-busy={status === 'loading'}>
            <iframe
                key={attempt}
                ref={iframe}
                src={`${appBase}/media/viewer/index.html?host=${encodeURIComponent(host)}&still&mobile&v=${VIEWER_VERSION}`}
                title="Interactive 3D kit preview. Drag to rotate and scroll to zoom."
                allow="fullscreen"
                style={{ width: '100%', height: '100%', minHeight: 260, display: 'block', border: 0 }}
            />
            {status !== 'ready' && (
                <div role={status === 'error' ? 'alert' : 'status'} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 14, padding: 30, textAlign: 'center', color: '#a9bbc9', background: '#03060a', fontSize: 13 }}>
                    {status === 'loading' ? <><span style={{ color: '#00d9e8', letterSpacing: 3, fontWeight: 700 }}>3DEEZI</span><span>Preparing your 3D kit…</span></> : <><span>{error}</span><button type="button" onClick={() => setAttempt((value) => value + 1)} style={{ padding: '9px 18px', border: '1px solid #00c2cc', borderRadius: 6, background: '#09202c', color: '#d9fcff', cursor: 'pointer' }}>Retry preview</button></>}
                </div>
            )}
        </div>
    );
});

export default KitViewer;
