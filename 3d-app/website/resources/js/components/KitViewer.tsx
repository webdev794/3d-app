import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { ApiError, fetchFile, getToken } from '../api';
import { viewerLook } from '../viewerLook';
import type { PartKey, PartStyle } from '../parts';

export type Garment = 'jersey' | 'nfljersey' | 'tee' | 'polo' | 'pocketpolo' | 'hoodie' | 'ziphoodie' | 'varsity' | 'trackjacket' | 'singlet' | 'netball-dress' | 'shorts' | 'fullkit';
export type View = 'front' | 'side' | 'back';
/** Colour / pattern areas; 'pocket' only on the pocket polo (pool and darts shirts). */
export type Zone = 'body' | 'yoke' | 'sleeves' | 'sides' | 'hem' | 'pocket' | 'hood';
/** A hoodie's own colour areas (Design.zoneColors): the hood's outer, its lining, the rib cuffs and waistband, the
 * kangaroo pocket and the zip. Unset, the hood and pocket follow the body, the lining and zip the Secondary colour. */
export type HoodieArea = 'hood' | 'lining' | 'rib' | 'pocket' | 'zip';
export const isHoodie = (garment: string) => garment === 'hoodie' || garment === 'ziphoodie';
/** The varsity (letterman) jacket's own colour areas (Design.zoneColors): the wool body, the leather sleeves, the rib
 * collar, cuffs and waistband and their stripes, the snaps, the welt pockets' trim and the quilted lining. */
export type VarsityArea = 'body' | 'sleeves' | 'rib' | 'ribStripe' | 'snaps' | 'pocketTrim' | 'lining';
export const isVarsity = (garment: string) => garment === 'varsity';
/** VARSITY AREAS in the Studio, the kit page and the Design sheet, with what each follows while unset. */
export const varsityAreas: { key: VarsityArea; label: string; follows: 'Primary' | 'Secondary' | 'Sleeves' }[] = [
    { key: 'body', label: 'Body (wool)', follows: 'Primary' }, { key: 'sleeves', label: 'Sleeves (leather)', follows: 'Secondary' },
    { key: 'rib', label: 'Collar, cuffs & waistband', follows: 'Primary' }, { key: 'ribStripe', label: 'Rib stripes', follows: 'Sleeves' },
    { key: 'snaps', label: 'Snaps', follows: 'Primary' }, { key: 'pocketTrim', label: 'Pocket trim', follows: 'Sleeves' },
    { key: 'lining', label: 'Quilted lining', follows: 'Secondary' },
];
/** A varsity area's colour: its own, else what it follows (as the 3D viewer paints it). */
export function varsityColour(design: { main?: string; secondary?: string; zoneColors?: Record<string, string | undefined> | null }, key: VarsityArea): string {
    const hex = (v?: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
    const own = hex(design.zoneColors?.[key]);
    if (own) return own;
    const follows = varsityAreas.find(a => a.key === key)?.follows ?? 'Primary';
    if (follows === 'Sleeves') return hex(design.zoneColors?.sleeves) ?? design.secondary ?? '#ffffff';
    return (follows === 'Secondary' ? design.secondary : design.main) ?? '#ffffff';
}
/** The track suit jacket's own colour areas (Design.zoneColors): the body, the shoulder and sleeve panels, the side
 * panels, the sleeve stripe, the collar (or hood: Design.trackStyle), the rib cuffs and hem band and the zips. */
export type TrackArea = 'body' | 'shoulder' | 'side' | 'stripe' | 'collar' | 'cuffs' | 'zip';
export const isTrack = (garment: string) => garment === 'trackjacket';
/** TRACK JACKET AREAS in the Studio, the kit page and the Design sheet, with what each follows while unset. */
export const trackAreas: { key: TrackArea; label: string; follows: 'Primary' | 'Secondary' | 'Accent' | 'Body' }[] = [
    { key: 'body', label: 'Body', follows: 'Primary' }, { key: 'shoulder', label: 'Shoulder & sleeve panels', follows: 'Secondary' },
    { key: 'side', label: 'Side panels', follows: 'Secondary' }, { key: 'stripe', label: 'Sleeve stripe', follows: 'Accent' },
    { key: 'collar', label: 'Collar', follows: 'Body' }, { key: 'cuffs', label: 'Cuffs & hem band', follows: 'Body' },
    { key: 'zip', label: 'Zips', follows: 'Secondary' },
];
/** The collar area's label: the hood when the jacket has one. */
export const trackAreaLabel = (key: TrackArea, trackStyle?: string | null) => (key === 'collar' && trackStyle === 'hood' ? 'Hood' : trackAreas.find(a => a.key === key)?.label ?? key);
/** A track jacket area's colour: its own, else what it follows (as the 3D viewer paints it). */
export function trackColour(design: { main?: string; secondary?: string; accent?: string; zoneColors?: Record<string, string | undefined> | null }, key: TrackArea): string {
    const hex = (v?: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
    const own = hex(design.zoneColors?.[key]);
    if (own) return own;
    const follows = trackAreas.find(a => a.key === key)?.follows ?? 'Primary';
    if (follows === 'Body') return hex(design.zoneColors?.body) ?? design.main ?? '#ffffff';
    return (follows === 'Secondary' ? design.secondary : follows === 'Accent' ? design.accent : design.main) ?? '#ffffff';
}
/** Bump when public/media/viewer/index.html is rebuilt, so browsers load the new 3D viewer. */
const VIEWER_VERSION = '2026-10-20-62';
/** Testing: a page opened with ?quality=low|high|flat shows the 3D viewer in that render tier (else the device's own). */
const viewerQuality = () => { const q = new URLSearchParams(window.location.search).get('quality'); return q && /^(low|high|flat)$/.test(q) ? `&quality=${q}` : ''; };

export interface ArtworkLayer {
    id: string; name?: string; type: 'image' | 'text' | 'shape';
    part: 'top' | 'shorts'; side: 'front' | 'back'; x: number; y: number;
    w?: number; h?: number; rot?: number; opacity?: number; src?: string;
    text?: string; size?: number; color?: string; shape?: 'rectangle' | 'ellipse' | 'triangle';
    /** On one part of the kit only (task 9.134): cut to that part's edges. */
    clip?: PartKey | null;
}
/**
 * Where a fixed mark sits when it was moved, resized, turned or hidden on the 2D panels (default place otherwise).
 * Keys: top_wordmark, top_sponsor, top_crest, top_name, top_number, shorts_crest, shorts_number, shorts_wordmark.
 */
export interface MarkPlace { side?: 'front' | 'back'; x?: number; y?: number; scale?: number; rot?: number; hidden?: boolean; /** The crest's badge shape (task 9.144). */ shape?: 'shield' | 'circle' | 'square' | 'rounded' | 'diamond'; /** A word's own colour (task 9.144). */ color?: string; /** How a word looks (task 9.146). */ look?: WordLookStyle }
/** A word's look on the kit (task 9.146): viewer/src/wordart.js. */
export interface WordLookStyle { style?: 'plain' | 'outline' | 'shadow' | 'extrude' | 'contour'; width?: number; color?: string; shape?: 'straight' | 'archUp' | 'archDown' | 'wave' | 'bridge' | 'slant'; spacing?: number }
export interface GarmentPoint { hit: boolean; part?: 'top' | 'shorts'; side?: 'front' | 'back'; x?: number; y?: number; zone?: Zone; partKey?: PartKey | null }
/**
 * A factory print layout on the kit: the file (one of the user's assets), each panel found in it named in the order
 * found ('none' = not used), whether the plain strip under the body panels is the hem fold, whether the white lines
 * across the sleeves are joined up (left out), and the parts it makes.
 */
export interface DesignLayout { asset: number; name: string; roles: string[]; hemFold?: boolean; joinLines?: boolean; parts?: string[]; /** 'drawing': the finished garment's front and back drawn flat (a design picture), put on the garment in parts[0]. */ kind?: 'drawing' }

/** Shared with the Flutter viewer. Persist this object as a project's design. */
/** A gradient colour stop: `at` runs 0 (start) to 1 (end). */
export type GradientStop = { color: string; at: number };
/** A colour zone's gradient fill: from, to and angle (0 = top to bottom); `stops` has every colour when there are more
 * than two (Sunset: orange, pink, purple); `preset` names the ready-made gradient it came from. */
export type Gradient = { from: string; to: string; angle: number; stops?: GradientStop[]; preset?: string | null };

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
    /** The Pattern colour was chosen by the user (Colours › Pattern, or a tap on the pattern): the built-in and area
     * patterns are painted in it. Unset (older designs, presets, palettes): the whole-garment pattern in a mix of the
     * Primary and Secondary and the area patterns in the Secondary, as before. */
    patternColorOwn?: boolean | null;
    patternBody?: number;
    patternScale?: number;
    /** The Primary zone's gradient fill (the body); `gradients` holds the Secondary and Pattern zones' fills. */
    gradient?: Gradient | null;
    gradients?: Partial<Record<'secondary' | 'patternColor', Gradient>> | null;
    zones?: Partial<Record<Zone, string>>;
    /** Hoodies, the varsity jacket and the track jacket: each area's own colour (hex). */
    zoneColors?: Partial<Record<HoodieArea | VarsityArea | TrackArea, string>> | null;
    /** The track jacket's style: its stand-up collar (default) or a hood. */
    trackStyle?: 'collar' | 'hood' | null;
    /** Parts of the kit with a look of their own (task 9.134: Parts panel); absent = the kit as before. */
    parts?: Partial<Record<PartKey, PartStyle>> | null;
    layers?: ArtworkLayer[];
    marks?: Record<string, MarkPlace>;
    layout?: DesignLayout | null;
    /** The sport's garment tile it was chosen as ("Netball dress", task 9.99): its name in the Studio, projects and orders; `garment` stays the 3D garment. Empty: a plain 3D garment. */
    productName?: string;
    /** Colours › Fabric type (the 3D viewer's fabric: render-quality.js FABRIC_TYPES). Unset or Standard: the garment's own fabric. */
    fabric?: FabricType | null;
    /** A project saved by the apps: their own details (its fabric was only kept here before design.fabric existed). */
    app?: { fabric?: string } & Record<string, unknown>;
}

/** Colours › Fabric type, as in the apps: Standard is each garment's own fabric. */
export const fabricTypes = ['Standard', 'Mesh', 'Pro', 'Eco'] as const;
export type FabricType = (typeof fabricTypes)[number];
/** Each garment's own fabric (Standard), as the 3D viewer makes it (render-quality.js fabricOf). */
const ownFabrics: Partial<Record<Garment, string>> = { jersey: 'eyelet mesh', nfljersey: 'eyelet mesh', singlet: 'eyelet mesh', shorts: 'eyelet mesh', fullkit: 'eyelet mesh', tee: "bird's-eye knit", polo: 'piqué', pocketpolo: 'piqué', hoodie: 'brushed fleece', ziphoodie: 'brushed fleece', trackjacket: 'fine knit', 'netball-dress': 'fine knit' };
/** What each fabric type is, for the Studio and the design sheet. */
export const fabricNotes: Record<FabricType, string> = {
    Standard: "The garment's own fabric.",
    Mesh: 'Open hexagonal mesh: light and breathable, the holes show up close.',
    Pro: 'Smooth, tight performance knit with a satin sheen.',
    Eco: 'Soft, matt cotton-feel knit of recycled yarn.',
};
/** The design's fabric type (an app project saved before design.fabric keeps it in design.app.fabric). */
export function fabricOf(design: Pick<Design, 'fabric' | 'app'>): FabricType {
    const chosen = design.fabric ?? design.app?.fabric;
    return fabricTypes.find(type => type === chosen) ?? 'Standard';
}
/** The fabric in words: "Mesh (open hexagonal mesh)", "Standard (eyelet mesh)"; the varsity jacket's is its own. */
export function fabricLabel(design: Pick<Design, 'fabric' | 'app'> & { garment?: string }): string {
    if (isVarsity(design.garment ?? '')) return 'Wool body, leather sleeves';
    const type = fabricOf(design);
    const what = type === 'Standard' ? ownFabrics[design.garment as Garment] ?? 'fine knit' : { Mesh: 'open hexagonal mesh', Pro: 'satin performance knit', Eco: 'matt cotton-feel recycled knit' }[type];
    return `${type} (${what})`;
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
    /** Drag to kit: the part under the pointer (normalised x, y) glows; null clears it. */
    dragHover: (at: { x: number; y: number } | null) => void;
    /** Turns the kit to a view now, even when that view is already chosen (the kit may have been turned or be idling round since). */
    turnTo: (view: View) => void;
    /** Lights up a whole part (hold: until glowPart(null)). */
    glowPart: (at: { part?: 'top' | 'shorts'; key?: PartKey; keys?: PartKey[]; hold?: boolean } | null) => void;
    processImage: (src: string, options: { removeBg?: boolean; tolerance?: number; tint?: string | null }) => Promise<string>;
    select: (id: string | null) => void;
    /** Zooms the 2D panels. */
    zoomBoard: (how: 'in' | 'out' | 'fit') => void;
    /**
     * A new factory print layout (data URL of a PDF, SVG or picture, saved as asset `asset`): its panels are found and
     * checked on screen. Put it on the kit with the design's `layout` ({asset, name, roles, hemFold, parts}).
     */
    checkLayout: (src: string, name: string, asset: number, options?: { drawing?: boolean; garment?: string; known?: boolean }) => Promise<LayoutCheck>;
}
export interface LayoutCheck { cancelled?: boolean; roles?: string[]; hemFold?: boolean; joinLines?: boolean; parts?: string[]; kind?: 'drawing'; panels?: { role: string; label: string }[] }

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
    /** The viewer shows a screen of its own (the print layout check): hide what the page puts over the 3D view. */
    onModal?: (open: boolean) => void;
    /** The design's print layout could not be put on the kit (the kit is shown without it). */
    onLayoutError?: (message: string) => void;
    /** Tap the kit to pick a colour (the Colours panel open): the viewer then reports a short tap on the kit. */
    colourPick?: boolean;
    onColourPick?: (picked: ColourPick) => void;
    /** Tap the kit to choose a part (the Parts panel, task 9.134): the viewer reports a short tap and lights the part. */
    partPick?: boolean;
    onPartPick?: (picked: PartPick) => void;
    /** Select the crest, words and logos on the 3D kit and edit them there (task 9.144, the Studio). */
    objectEdit?: boolean;
    /** A word edited on the 3D kit: the design field (logoText, backName, number) and its new value. */
    onMarkText?: (field: 'logoText' | 'backName' | 'number', value: string) => void;
}
/** A part chosen by a tap: its key (null on a piece that is not a part: a hood), the garment piece and where it was tapped. */
export interface PartPick { partKey: PartKey | null; part: 'top' | 'shorts'; side?: 'front' | 'back'; x?: number; y?: number; slot?: ColourPick['slot'] }
/** A tapped part of the kit: the kit colour it follows and, on hoodies, the varsity and the track jacket, its own area. */
export interface ColourPick { slot: 'main' | 'secondary' | 'accent' | 'pattern' | 'pattern-image'; area: HoodieArea | VarsityArea | TrackArea | null; zone: string; part?: 'top' | 'shorts'; partKey?: PartKey | null }

interface CaptureRequest {
    view: View;
    kind?: 'scene' | 'board';
    resolve: (data: string) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

const views: Record<View, string> = { front: 'Front', side: 'Side', back: 'Back' };

/** A saved print layout file as a data URL, downloaded with the visitor's sign-in (their own, or any for administrators). */
async function downloadLayout(asset: number) {
    if (!getToken()) throw new Error('Sign in to see this kit’s print layout.');
    try {
        const blob = await fetchFile(`/assets/${asset}/file`);
        return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('The print layout file could not be read.')); reader.readAsDataURL(blob); });
    } catch (error) {
        if (error instanceof ApiError && error.status === 404) throw new Error('The print layout file is no longer in the saved assets.');
        throw error;
    }
}

/** Hosts the same bundled Three.js garment renderer used by the mobile app. */
export const KitViewer = forwardRef<KitViewerHandle, KitViewerProps>(function KitViewer(
    { design, view = 'front', rotating = false, onReady, className = '', board = false, onLayers, onMarks, onSelection, onModal, onLayoutError, colourPick = false, onColourPick, partPick = false, onPartPick, objectEdit = false, onMarkText }, ref,
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
    const modalCallback = useRef(onModal);
    const layoutErrorCallback = useRef(onLayoutError);
    // Print layout files this page already has (the last one checked here), by asset id.
    const layoutSources = useRef(new Map<number, string>());
    const selectionCallback = useRef(onSelection);
    const colourPickCallback = useRef(onColourPick);
    const colourPickMode = useRef(colourPick);
    const partPickCallback = useRef(onPartPick);
    const partPickMode = useRef(partPick);
    const objectEditMode = useRef(objectEdit);
    const markTextCallback = useRef(onMarkText);
    const requests = useRef(new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>());
    const captureQueue = useRef<CaptureRequest[]>([]);
    const activeCapture = useRef<CaptureRequest | null>(null);
    const designTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flushRef = useRef<() => void>(() => {});
    // The fabric always (Standard when unset; an app project's older place for it read too), so the next design never keeps the last one's.
    latestDesign.current = JSON.stringify({ layers: [], zones: {}, gradient: null, gradients: null, marks: {}, layout: null, ...design, fabric: fabricOf(design) });
    latestView.current = { view, rotating };
    readyCallback.current = onReady;
    boardMode.current = board;
    layerCallback.current = onLayers;
    marksCallback.current = onMarks;
    modalCallback.current = onModal;
    layoutErrorCallback.current = onLayoutError;
    selectionCallback.current = onSelection;
    colourPickCallback.current = onColourPick;
    partPickCallback.current = onPartPick;
    markTextCallback.current = onMarkText;

    const send = useCallback((cmd: string, arg: unknown) => {
        iframe.current?.contentWindow?.postMessage(JSON.stringify({ cmd, arg }), window.location.origin);
    }, []);
    const request = useCallback(<T,>(cmd: string, arg: object, wait = 20000) => new Promise<T>((resolve, reject) => {
        if (!engineReady.current || failed.current) { reject(new Error('Wait for the preview to finish loading.')); return; }
        const id = crypto.randomUUID();
        const timeout = setTimeout(() => { requests.current.delete(id); reject(new Error('The designer did not respond. Please try again.')); }, wait);
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
        dragHover: (at) => { if (engineReady.current) send('dragHover', at); },
        turnTo: (to) => { if (engineReady.current) send('setView', views[to]); },
        glowPart: (at) => { if (engineReady.current) send('glowPart', at); },
        processImage: (src, options) => request<string>('processImage', { src, ...options }),
        select: (id) => send('select', id),
        zoomBoard: (how) => send('boardZoom', how),
        // The visitor checks the panels in the viewer first: allow them time.
        checkLayout: (src, name, asset, options = {}) => {
            layoutSources.current = new Map([[asset, src]]);
            return request<LayoutCheck>('checkLayout', { src, name, asset, ...options }, 30 * 60 * 1000);
        },
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
            send('colourPick', colourPickMode.current);
            send('partPick', partPickMode.current);
            send('objectEdit', objectEditMode.current);
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
            let message: { host?: string; type?: string; view?: string; data?: string; id?: string; error?: string; layers?: ArtworkLayer[]; marks?: Record<string, MarkPlace>; open?: boolean; asset?: number; message?: string; hit?: boolean; slot?: ColourPick['slot']; area?: ColourPick['area']; zone?: string; part?: 'top' | 'shorts'; partKey?: PartKey | null; side?: 'front' | 'back'; x?: number; y?: number };
            try { message = JSON.parse(event.data); } catch { return; }
            if (!message || message.host !== host) return;
            if (message.type === 'layers' && Array.isArray(message.layers)) layerCallback.current?.(message.layers);
            if (message.type === 'marks' && message.marks && typeof message.marks === 'object') marksCallback.current?.(message.marks);
            if (message.type === 'modal') modalCallback.current?.(!!message.open);
            // The design's print layout file: the viewer has not read it yet (allow time to download and read it).
            if (message.type === 'layoutWanted' && typeof message.asset === 'number') {
                const asset = message.asset;
                if (designTimer.current) clearTimeout(designTimer.current);
                designTimer.current = setTimeout(() => fail('The print layout took too long to load. Please retry.'), 200000);
                const kept = layoutSources.current.get(asset);
                void (kept ? Promise.resolve(kept) : downloadLayout(asset)).then((src) => send('layoutFile', { asset, src }), (error: Error) => send('layoutFile', { asset, error: error.message }));
            }
            if (message.type === 'layoutError') layoutErrorCallback.current?.(message.message || 'The print layout could not be loaded.');
            if (message.type === 'colourPick' && message.hit && typeof message.slot === 'string') colourPickCallback.current?.({ slot: message.slot, area: message.area ?? null, zone: String(message.zone ?? ''), part: message.part, partKey: message.partKey ?? null });
            if (message.type === 'partPick' && message.hit) partPickCallback.current?.({ partKey: message.partKey ?? null, part: message.part ?? 'top', side: message.side, x: message.x, y: message.y, slot: message.slot });
            if (message.type === 'selection') selectionCallback.current?.(message.id || null);
            const words = message as { field?: string; value?: unknown };
            if (message.type === 'markText' && (words.field === 'logoText' || words.field === 'backName' || words.field === 'number') && typeof words.value === 'string') markTextCallback.current?.(words.field, words.value);
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
    useEffect(() => { colourPickMode.current = colourPick; if (engineReady.current) send('colourPick', colourPick); }, [colourPick, send]);
    useEffect(() => { partPickMode.current = partPick; if (engineReady.current) send('partPick', partPick); }, [partPick, send]);
    useEffect(() => { objectEditMode.current = objectEdit; if (engineReady.current) send('objectEdit', objectEdit); }, [objectEdit, send]);
    useEffect(() => {
        if (engineReady.current) send('setView', rotating ? '360°' : views[view]);
    }, [view, rotating, send]);

    return (
        <div className={`kit-viewer ${className}`} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 260, overflow: 'hidden', background: '#03060a' }} aria-busy={status === 'loading'}>
            <iframe
                key={attempt}
                ref={iframe}
                src={`${appBase}/media/viewer/index.html?host=${encodeURIComponent(host)}&still&mobile&layouts${viewerQuality()}${viewerLook()}&v=${VIEWER_VERSION}`}
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
