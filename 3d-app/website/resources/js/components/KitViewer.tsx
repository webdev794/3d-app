import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';

export type Garment = 'jersey' | 'tee' | 'polo' | 'singlet' | 'shorts' | 'fullkit';
export type View = 'front' | 'side' | 'back';

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
}

export interface KitViewerProps {
    design: Design;
    view?: View;
    rotating?: boolean;
    onReady?: () => void;
    className?: string;
}

interface CaptureRequest {
    view: View;
    resolve: (data: string) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

const views: Record<View, string> = { front: 'Front', side: 'Side', back: 'Back' };

/** Hosts the same bundled Three.js garment renderer used by the mobile app. */
export const KitViewer = forwardRef<KitViewerHandle, KitViewerProps>(function KitViewer(
    { design, view = 'front', rotating = false, onReady, className = '' }, ref,
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
    const captureQueue = useRef<CaptureRequest[]>([]);
    const activeCapture = useRef<CaptureRequest | null>(null);
    const designTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flushRef = useRef<() => void>(() => {});
    latestDesign.current = JSON.stringify(design);
    latestView.current = { view, rotating };
    readyCallback.current = onReady;

    const send = useCallback((cmd: string, arg: unknown) => {
        iframe.current?.contentWindow?.postMessage(JSON.stringify({ cmd, arg }), window.location.origin);
    }, []);

    const rejectCaptures = useCallback((message: string) => {
        const requests = [...captureQueue.current];
        if (activeCapture.current) requests.unshift(activeCapture.current);
        activeCapture.current = null;
        captureQueue.current = [];
        requests.forEach((request) => {
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
            send('capture', views[request.view]);
        }
    }, [send, fail]);
    flushRef.current = flush;

    useImperativeHandle(ref, () => ({
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
    }), [fail, status]);

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
            let message: { host?: string; type?: string; view?: string; data?: string };
            try { message = JSON.parse(event.data); } catch { return; }
            if (!message || message.host !== host) return;
            if (message.type === 'ready') begin();
            if (message.type === 'designApplied' && inFlightDesign.current) {
                if (designTimer.current) clearTimeout(designTimer.current);
                appliedDesign.current = inFlightDesign.current;
                inFlightDesign.current = null;
                flushRef.current();
            }
            if (message.type === 'capture' && activeCapture.current) {
                const request = activeCapture.current;
                if (message.view !== views[request.view]) return;
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
    useEffect(() => {
        if (engineReady.current) send('setView', rotating ? '360°' : views[view]);
    }, [view, rotating, send]);

    return (
        <div className={`kit-viewer ${className}`} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 260, overflow: 'hidden', background: '#03060a' }} aria-busy={status === 'loading'}>
            <iframe
                key={attempt}
                ref={iframe}
                src={`${appBase}/media/viewer/index.html?host=${encodeURIComponent(host)}&still&mobile`}
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
