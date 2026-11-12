import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { ApiError, draftKey, fetchFile, getToken } from '../api';
import { viewerLook } from '../viewerLook';
import type { PartKey, PartStyle } from '../parts';

export type Garment = 'jersey' | 'nfljersey' | 'compression' | 'shooting-shirt' | 'socks' | 'cap' | 'five-panel-cap' | 'beanie' | 'bucket-hat' | 'skirt' | 'tee' | 'polo' | 'pocketpolo' | 'hoodie' | 'ziphoodie' | 'varsity' | 'trackjacket' | 'singlet' | 'netball-dress' | 'shorts' | 'fullkit';
export type View = 'front' | 'side' | 'back';
/** Colour / pattern areas; 'pocket' only on the pocket polo (pool and darts shirts). */
export type Zone = 'body' | 'yoke' | 'sleeves' | 'sides' | 'hem' | 'pocket' | 'hood';
/** A hoodie's own colour areas (Design.zoneColors): the hood's outer, its lining, the rib cuffs and waistband, the
 * kangaroo pocket and the zip. Unset, the hood and pocket follow the body, the lining and zip the Secondary colour. */
export type HoodieArea = 'hood' | 'lining' | 'rib' | 'pocket' | 'zip' | 'stripe';
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
/** The basketball shorts (the shorts with the royal band colour, zoneColors.bballBand: the viewer cuts and prints them as
 * basketball shorts) and their own colour areas: the two stripes round each leg's hem (BSF 2026-11-04). Unset, both
 * follow the Secondary colour. */
export type BballArea = 'bballTrim1' | 'bballTrim2';
export const isBballShorts = (design: { garment?: string; zoneColors?: Record<string, string | undefined> | null }) => design.garment === 'shorts' && /^#[0-9a-f]{6}$/i.test(design.zoneColors?.bballBand ?? '');
export const bballAreas: { key: BballArea; label: string; follows: 'Secondary' }[] = [
    { key: 'bballTrim1', label: 'Hem stripe 1', follows: 'Secondary' }, { key: 'bballTrim2', label: 'Hem stripe 2 (edge)', follows: 'Secondary' },
];
export function bballColour(design: { secondary?: string; zoneColors?: Record<string, string | undefined> | null }, key: BballArea): string {
    const own = design.zoneColors?.[key];
    return own && /^#[0-9a-f]{6}$/i.test(own) ? own : design.secondary ?? '#ffffff';
}
/** The netball dress's own colour areas (Design.zoneColors; viewer netballdress.js, NDF 2026-11-04): the body, the
 * full-length side panels, the yoke and the neck and armhole binding. Unset, the body follows the Primary, the panels
 * and yoke the Secondary, the binding the yoke. */
export type DressArea = 'body' | 'panels' | 'yoke' | 'binding';
export const isNetballDress = (garment: string) => garment === 'netball-dress';
export const dressAreas: { key: DressArea; label: string; follows: 'Primary' | 'Secondary' | 'Yoke' }[] = [
    { key: 'body', label: 'Body', follows: 'Primary' }, { key: 'panels', label: 'Side panels', follows: 'Secondary' },
    { key: 'yoke', label: 'Yoke', follows: 'Secondary' }, { key: 'binding', label: 'Neck & armhole binding', follows: 'Yoke' },
];
/** A netball dress area's colour: its own, else what it follows (as the 3D viewer paints it). */
export function dressColour(design: { main?: string; secondary?: string; zoneColors?: Record<string, string | undefined> | null }, key: DressArea): string {
    const hex = (v?: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
    const own = hex(design.zoneColors?.[key]);
    if (own) return own;
    if (key === 'binding') return dressColour(design, 'yoke');
    return (key === 'body' ? design.main : design.secondary) ?? '#ffffff';
}
/** Bump when public/media/viewer/index.html is rebuilt, so browsers load the new 3D viewer. */
export const VIEWER_VERSION = '2026-10-20-295';

/**
 * The browser's own private mode, in its own words and with its own shortcut (LIVEFIX L1 2026-11-12): what works at once
 * when something saved in the browser, or the browser itself, stops the 3D.
 */
export function privateWindow(): string {
    const ua = navigator.userAgent || '';
    const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touchMac) return 'a private tab';
    const mac = /Macintosh|Mac OS X/.test(ua);
    const keys = (letter: string) => `${mac ? '⌘' : 'Ctrl'}+Shift+${letter}`;
    if (/Firefox\//.test(ua)) return `a private window (${keys('P')})`;
    if (/Edg\//.test(ua)) return `an InPrivate window (${keys('N')})`;
    if (/OPR\/|Opera/.test(ua)) return `a private window (${keys('N')})`;
    if ((navigator as Navigator & { brave?: unknown }).brave) return `a private window (${keys('N')})`;
    if (/Chrome\/|CriOS\//.test(ua)) return `an Incognito window (${keys('N')})`;
    if (mac && /Safari\//.test(ua)) return `a private window (${keys('N')})`;
    return 'a private window';
}

const ERROR_BUTTON = { padding: '9px 18px', border: '1px solid #00c2cc', borderRadius: 6, background: '#09202c', color: '#d9fcff', cursor: 'pointer' } as const;

/**
 * "Fix it" on a 3D error: clears only what this site keeps for the Studio and its 3D view in this browser (the Studio's
 * draft, YOUR DESIGN's entries, the remembered 3D look and HQ preview, the site's Cache Storage), then reloads. The
 * sign-in (sessionStorage 3deezi.session) and everything saved on the server (projects, orders) stay. LIVEFIX L1 2026-11-12:
 * a remembered setting made the dress fail on every try in one browser while a private window worked.
 */
async function clearSavedKit() {
    try { sessionStorage.removeItem(draftKey); } catch { /* blocked storage: nothing kept */ }
    try {
        for (const key of Object.keys(localStorage)) if (key === draftKey || key.startsWith('3deezi.own.') || key === '3deezi.look' || key === '3deezi.hq') localStorage.removeItem(key);
    } catch { /* blocked storage: nothing kept */ }
    try { if ('caches' in window) await Promise.all((await caches.keys()).map((name) => caches.delete(name))); } catch { /* no caches */ }
    window.location.reload();
}
/** Testing: a page opened with ?quality=low|high|flat shows the 3D viewer in that render tier (else the device's own). */
const viewerQuality = () => { const q = new URLSearchParams(window.location.search).get('quality'); return q && /^(low|high|flat)$/.test(q) ? `&quality=${q}` : ''; };

export interface ArtworkLayer {
    id: string; name?: string; type: 'image' | 'text' | 'shape';
    part: 'top' | 'shorts'; side: 'front' | 'back'; x: number; y: number;
    w?: number; h?: number; rot?: number; opacity?: number; src?: string;
    text?: string; size?: number; color?: string; shape?: 'rectangle' | 'ellipse' | 'triangle';
    /** A text object's own font ('JerseyBlock') and word look (viewer texture.js; the American football jerseys' "3"s). */
    font?: string; look?: WordLookStyle;
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
    /** Garment style › Neck style (garmentStyle.ts): 'round' | 'v', or a rugby collar ('rc001'…'rc010', 'shallow-v'); unset: the garment's own. */
    neck?: string | null;
    /** Garment style › Fit (rugby jerseys): Classic, Pro / Athletic or Tight / Compression; unset: Pro (the tile's). */
    fit?: 'classic' | 'pro' | 'tight' | null;
    /** Parts of the kit with a look of their own (task 9.134: Parts panel); absent = the kit as before. */
    parts?: Partial<Record<PartKey, PartStyle>> | null;
    layers?: ArtworkLayer[];
    marks?: Record<string, MarkPlace>;
    layout?: DesignLayout | null;
    /** The sport's garment tile it was chosen as ("Netball dress", task 9.99): its name in the Studio, projects and orders; `garment` stays the 3D garment. Empty: a plain 3D garment. */
    productName?: string;
    /** A sport typed in "Custom…" (client 2026-11-02): its name in the Studio, projects and orders; the project's `sport` stays a catalogue id. */
    sportName?: string;
    /** Colours › Fabric type (the 3D viewer's fabric: render-quality.js FABRIC_TYPES). Unset or Standard: the garment's own fabric. */
    fabric?: FabricType | null;
    /** A project saved by the apps: their own details (its fabric was only kept here before design.fabric existed). */
    app?: { fabric?: string } & Record<string, unknown>;
}

/** Colours › Fabric type, as in the apps: Standard is each garment's own fabric. */
export const fabricTypes = ['Standard', 'Mesh', 'Pro', 'Eco'] as const;
export type FabricType = (typeof fabricTypes)[number];
/** Each garment's own fabric (Standard), as the 3D viewer makes it (render-quality.js fabricOf). */
const ownFabrics: Partial<Record<Garment, string>> = { jersey: 'eyelet mesh', nfljersey: 'eyelet mesh', compression: 'smooth stretch knit', 'shooting-shirt': 'eyelet mesh', socks: 'rib knit', cap: 'cotton twill', 'five-panel-cap': 'cotton twill', beanie: 'rib knit', 'bucket-hat': 'cotton twill', skirt: 'smooth stretch knit', singlet: 'eyelet mesh', shorts: 'eyelet mesh', fullkit: 'eyelet mesh', tee: "bird's-eye knit", polo: 'piqué', pocketpolo: 'piqué', hoodie: 'brushed fleece', ziphoodie: 'brushed fleece', trackjacket: 'fine knit', 'netball-dress': 'fine knit' };
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
    /** Garment style's NECK DETAIL: a close-up of the neck (a JPEG data URL) once the design is on the kit; null without a top. */
    neckShot: () => Promise<string | null>;
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
export interface ColourPick { slot: 'main' | 'secondary' | 'accent' | 'pattern' | 'pattern-image'; area: HoodieArea | VarsityArea | TrackArea | DressArea | null; zone: string; part?: 'top' | 'shorts'; partKey?: PartKey | null }

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
    // The browser switched 3D off for this page (the viewer's 'webgl' error, LIVEFIX L1 2026-11-12): its own message, with
    // what works (a private window) first, and no Retry, which cannot help in the same browser.
    const [webglOff, setWebglOff] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const copyLink = () => { void navigator.clipboard?.writeText(window.location.href).then(() => setLinkCopied(true), () => setLinkCopied(false)); };
    // The viewer left part of a design out of the 3D view (its 'notice'): one line over the view for a while.
    const [notice, setNotice] = useState('');
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
    // What the viewer said it is doing for the design in flight (its 'step' messages, plain words): named in the message
    // if that design stops or fails (LIVEFIX L1 2026-11-12).
    const viewerStep = useRef('');
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
            viewerStep.current = '';
            send('setDesign', JSON.parse(latestDesign.current));
            // (60 s: a slow but working apply on a modest PC, such as a new garment's first build, never shows the error.)
            designTimer.current = setTimeout(() => {
                console.warn('3D viewer did not finish the design; last step:', viewerStep.current || '(none reported)');
                fail(`The 3D preview could not apply this design${viewerStep.current ? ` (it stopped while ${viewerStep.current})` : ''}. Please retry.`);
            }, 60000);
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
            // Its 30 s from now: while queued it waited behind the design, which has its own timer (LIVEFIX L1).
            clearTimeout(request.timeout);
            request.timeout = setTimeout(() => fail(request.kind === 'board' ? 'The 2D panels export timed out. Please retry.' : 'The 3D export timed out. Please retry the preview.'), 30000);
            send(request.kind === 'board' ? 'captureBoard' : 'capture', request.kind === 'board' ? { id: 'board-export' } : views[request.view]);
        }
    }, [send, fail]);
    flushRef.current = flush;

    useImperativeHandle(ref, () => ({
        pick: (x, y) => request<GarmentPoint>('pick', { x, y }),
        neckShot: () => request<{ data?: string | null }>('neckShot', {}, 30000).then(m => (typeof m.data === 'string' && m.data.startsWith('data:image/') ? m.data : null)),
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
            // (90 s while queued: the design in flight may take 60 s; flush gives it its own 30 s once sent.)
            captureQueue.current.push({ view: 'front', kind: 'board', resolve, reject, timeout: setTimeout(() => fail('The 2D panels export timed out. Please retry.'), 90000) });
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
                // (90 s while queued: the design in flight may take 60 s; flush gives it its own 30 s once sent.)
                timeout: setTimeout(() => fail('The 3D export timed out. Please retry the preview.'), 90000),
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
        setWebglOff(false);
        setLinkCopied(false);
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
            // The viewer could not put the design on (it posts why): said now, not after the whole wait; the reason goes to
            // the console for us (LIVEFIX L1 2026-11-12). (It posts this twice; the second finds nothing in flight.)
            if (message.type === 'step' && typeof (message as { step?: unknown }).step === 'string') viewerStep.current = (message as { step: string }).step;
            // The browser switched 3D off (or would not start it): said plainly, at once. If it comes back, a fresh viewer.
            if (message.type === 'error' && (message as { command?: string }).command === 'webgl') {
                console.warn('The browser switched off 3D for the viewer:', message.message);
                setWebglOff(true);
                fail('Your browser switched off 3D for this page.');
                return;
            }
            if (message.type === 'webglRestored') { setAttempt((value) => value + 1); return; }
            if (message.type === 'notice' && typeof message.message === 'string') {
                console.warn('3D viewer:', message.message, (message as { reason?: string }).reason ?? '');
                setNotice(message.message);
                clearTimeout(noticeTimer.current);
                noticeTimer.current = setTimeout(() => setNotice(''), 12000);
            }
            if (message.type === 'error' && (message as { command?: string }).command === 'setDesign' && inFlightDesign.current) {
                const where = String((message as { step?: unknown }).step || viewerStep.current || '');
                console.warn('3D viewer could not apply the design:', message.message, where ? `(while ${where})` : '');
                // (In plain words: the model's own message when it is ours and plain, else the step it failed in.)
                const own = /^The 3D model of this garment did not load\.?$/.test(message.message ?? '');
                fail(own ? 'The 3D model of this garment did not load. Check your connection and press Retry.' : `The 3D preview could not apply this design${where ? ` (a problem while ${where})` : ''}. Please retry.`);
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
                    {status === 'loading' ? <><span style={{ color: '#00d9e8', letterSpacing: 3, fontWeight: 700 }}>3DEEZI</span><span>Preparing your 3D kit…</span></> : webglOff ? <>
                        <strong style={{ color: '#e6f7ff', fontSize: 14, maxWidth: 420, lineHeight: 1.45 }}>Your browser switched off 3D for this page. To continue, open this page in {privateWindow()}.</strong>
                        <button type="button" onClick={copyLink} style={ERROR_BUTTON}>{linkCopied ? 'Link copied' : 'Copy page link'}</button>
                        <span style={{ maxWidth: 420, lineHeight: 1.45 }}>Or open it in another browser.</span>
                        <span style={{ maxWidth: 420, lineHeight: 1.45, opacity: 0.8 }}>Restarting the browser also fixes it.</span>
                    </> : <>
                        {attempt > 0 && <strong style={{ color: '#e6f7ff', fontSize: 14, maxWidth: 440, lineHeight: 1.45 }}>If it keeps happening, open this page in {privateWindow()}, or clear this site's saved data in your browser.</strong>}
                        <span style={{ maxWidth: 440, lineHeight: 1.45 }}>{error}</span>
                        <button type="button" onClick={() => { void clearSavedKit(); }} style={{ ...ERROR_BUTTON, background: '#0b3a4a', fontWeight: 700 }}>Fix it: clear this page&apos;s saved kit and reload</button>
                        <span style={{ maxWidth: 440, lineHeight: 1.4, fontSize: 12, opacity: 0.85, marginTop: -8 }}>Your unsaved changes on this page will be lost. Saved projects are kept.</span>
                        <button type="button" onClick={() => setAttempt((value) => value + 1)} style={ERROR_BUTTON}>Retry preview</button>
                        {attempt === 0 && <span style={{ maxWidth: 440, lineHeight: 1.45 }}>If it keeps happening, open this page in {privateWindow()}, or clear this site&apos;s saved data in your browser.</span>}
                        <button type="button" onClick={copyLink} style={ERROR_BUTTON}>{linkCopied ? 'Link copied' : 'Copy page link'}</button>
                    </>}
                </div>
            )}
            {status === 'ready' && notice && (
                <div role="status" style={{ position: 'absolute', left: 12, right: 12, bottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(3,6,10,.86)', border: '1px solid #00c2cc55', color: '#d9fcff', fontSize: 12, lineHeight: 1.4, textAlign: 'center', pointerEvents: 'none' }}>{notice}</div>
            )}
        </div>
    );
});

export default KitViewer;
