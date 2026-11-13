/**
 * Garment style (NK1 2026-11-02, client mockups images/299 and 300): the Studio's Style tool. design.neck is the neck's
 * shape ('round' | 'v') on the garments whose 3D model can switch it, and on rugby jerseys one of the rugby collar
 * library (RC001-RC010, Custom shallow V); design.fit is a rugby jersey's fit. Unset: the garment's own (its tile
 * picture's). The 3D viewer makes them (viewer/src/necks.js); the apps keep the same lists (lib/garment_style.dart).
 */
import type { Design } from './components/KitViewer';

export type NeckStyle = 'round' | 'v';
export type RugbyFit = 'classic' | 'pro' | 'tight';

/** The garments with a neck to choose and their own neck (the full kit's top is the jersey). */
export const neckGarments: Record<string, NeckStyle> = { jersey: 'v', fullkit: 'v', tee: 'round', singlet: 'round', 'shooting-shirt': 'v', 'netball-dress': 'round' };
// (The netball dress: its 3D model's own round neck; a V cuts the model's neck and binds it with our own binding: user
// 2026-11-13. The old made dress is never shown.)
export const neckLabels: Record<NeckStyle, string> = { round: 'Round neck', v: 'V-neck' };

/** The rugby collar library, as on the client's Rugby Jersey Studio (images/300). */
export const rugbyCollars = [
    { id: 'rc001', code: 'RC001', name: 'Round crew, contrast band', shape: 'round' },
    { id: 'rc002', code: 'RC002', name: 'V insert, tipped', shape: 'round' },
    { id: 'rc003', code: 'RC003', name: 'Round crew, double band', shape: 'round' },
    { id: 'rc004', code: 'RC004', name: 'Wing collar', shape: 'v' },
    { id: 'rc005', code: 'RC005', name: 'Round crew, tipped shoulders', shape: 'round' },
    { id: 'rc006', code: 'RC006', name: 'Grandad collar, 1 button', shape: 'round' },
    { id: 'rc007', code: 'RC007', name: 'V-neck, button placket', shape: 'v' },
    { id: 'rc008', code: 'RC008', name: 'Polo collar, 3 buttons', shape: 'round' },
    { id: 'rc009', code: 'RC009', name: 'Polo collar, 1 button', shape: 'round' },
    { id: 'rc010', code: 'RC010', name: 'Fold-down collar, crossover', shape: 'round' },
    { id: 'shallow-v', code: 'CUSTOM', name: 'Custom shallow V', shape: 'v' },
] as const;
export type RugbyCollar = (typeof rugbyCollars)[number]['id'];
export const neckValues = ['round', 'v', ...rugbyCollars.map(c => c.id)];

export const rugbyFits: { id: RugbyFit; label: string; note: string }[] = [
    { id: 'classic', label: 'Classic', note: 'Loose, traditional' },
    { id: 'pro', label: 'Pro / Athletic', note: 'Fitted through the body' },
    { id: 'tight', label: 'Tight / Compression', note: 'Close to the skin' },
];

/** Neck trim / collar colours offered first (the mockups' cyan, white and black). */
export const trimSwatches = [{ hex: '#16b4f0', label: 'Cyan' }, { hex: '#ffffff', label: 'White' }, { hex: '#111214', label: 'Black' }];

const HEX = /^#[0-9a-f]{6}$/i;
/** Rugby League or Rugby Union (the sport's id, or its name on the design sheet). */
export const isRugby = (sport?: string | null) => /rugby/i.test(sport ?? '');
/** The garment's neck can be chosen. */
export const hasNeckStyle = (garment: string) => garment in neckGarments;
/** A garment with no neck at all (shorts, pants, skirts, socks, headwear), by its garment id or product name. */
export const hasNoNeck = (garment: string, product = '') => ['shorts', 'socks', 'cap', 'five-panel-cap', 'bucket-hat', 'beanie', 'skirt'].includes(garment) || /shorts|pants|tights|skirt|skort|socks|\bcap\b|\bhat\b|beanie/i.test(product);
/** A rugby jersey (or the rugby kit's jersey): the collar library and the fit. */
export const hasRugbyStyle = (sport: string | null | undefined, garment: string) => isRugby(sport) && (garment === 'jersey' || garment === 'fullkit');

/**
 * The Basketball singlet tile's own 3D model (its look's zoneColors.bballSinglet, BBSINGLET 2026-11-13): its own neck is a
 * V (null for any other design); its round neck is our own neck piece filled in on it (viewer tripomesh.js roundFill).
 */
export function bballOwnNeck(design: Pick<Design, 'garment' | 'zoneColors'>): NeckStyle | null {
    const flag = (design.zoneColors as Record<string, string> | null | undefined)?.bballSinglet;
    return design.garment === 'singlet' && HEX.test(flag ?? '') ? 'v' : null;
}

/**
 * The Rugby League Jersey tile on its own 3D model (FBJERSEY 2026-11-13, the look's zoneColors.fbJersey): its own round
 * neck; the collar library made on it, but for the collars whose own pieces (a wing collar, fold-down polo collars) do not
 * yet sit cleanly on it; and two fits, its own Regular and a slimmer Pro fit.
 */
export const isModelJersey = (design: Pick<Design, 'garment' | 'zoneColors'>) => design.garment === 'jersey' && HEX.test((design.zoneColors as Record<string, string> | null | undefined)?.fbJersey ?? '');
const notOnModel: string[] = [];   // (every collar is made on it now: FBJERSEY round 3)
/** The collar library offered for a design. */
export const collarsFor = (design: Pick<Design, 'garment' | 'zoneColors'>) => (isModelJersey(design) ? rugbyCollars.filter(c => !notOnModel.includes(c.id)) : rugbyCollars);
/** The fits offered for a design: the model jersey's own shape (Regular) and a slimmer Pro fit (design.fit 'tight'). */
export const fitsFor = (design: Pick<Design, 'garment' | 'zoneColors'>) => (isModelJersey(design) ? [{ id: 'pro' as RugbyFit, label: 'Regular', note: 'The jersey as made' }, { id: 'tight' as RugbyFit, label: 'Pro fit', note: 'Slimmer, athletic' }] : rugbyFits);

/** The garment's own neck (the Full kit picture's crew-neck look makes its jersey's round). */
export function ownNeck(design: Pick<Design, 'garment' | 'zoneColors'>): NeckStyle | null {
    if (!hasNeckStyle(design.garment)) return null;
    const bball = bballOwnNeck(design);
    if (bball) return bball;
    if (isModelJersey(design) && !HEX.test((design.zoneColors as Record<string, string> | null | undefined)?.fbV ?? '')) return 'round';
    const crew = (design.zoneColors as Record<string, string> | null | undefined)?.crewNeck;
    return design.garment === 'fullkit' && HEX.test(crew ?? '') ? 'round' : neckGarments[design.garment];
}
export const collarOf = (design: Pick<Design, 'neck'>) => rugbyCollars.find(c => c.id === design.neck) ?? null;
/** The neck shown: the design's own choice, else the garment's. */
export function neckOf(design: Pick<Design, 'garment' | 'zoneColors' | 'neck'>): string | null {
    if (!hasNeckStyle(design.garment)) return null;
    return design.neck && neckValues.includes(design.neck) ? design.neck : ownNeck(design);
}
/** "V-neck", "Round neck", "RC006 Grandad collar, 1 button" (null: the garment has no neck to choose). */
export function neckLabel(design: Pick<Design, 'garment' | 'zoneColors' | 'neck'>): string | null {
    const neck = neckOf(design);
    if (!neck) return null;
    const collar = rugbyCollars.find(c => c.id === neck);
    return collar ? `${collar.code === 'CUSTOM' ? '' : `${collar.code} `}${collar.name}` : neckLabels[neck as NeckStyle];
}
export const fitOf = (design: Pick<Design, 'fit'>): RugbyFit => (design.fit === 'classic' || design.fit === 'tight' ? design.fit : 'pro');
export const fitLabel = (design: Pick<Design, 'fit' | 'garment' | 'zoneColors'>) => (isModelJersey(design) ? (design.fit === 'tight' ? 'Pro fit' : 'Regular') : rugbyFits.find(f => f.id === fitOf(design))!.label);
/** The neck trim's (collar's) colour: its own (Parts › Collar), else the kit's Secondary as the viewer draws it. */
export const trimOf = (design: Pick<Design, 'parts' | 'secondary'>) => design.parts?.collar?.colour && HEX.test(design.parts.collar.colour) ? design.parts.collar.colour : design.secondary;

/** The design sheet's and the kit page's rows: [label, value]. */
export function styleRows(design: Design, sport?: string | null): [string, string][] {
    const rows: [string, string][] = [];
    const neck = neckLabel(design);
    if (neck) rows.push([collarOf(design) ? 'Collar' : 'Neck style', neck]);
    if (neck && design.parts?.collar?.colour) rows.push([collarOf(design) ? 'Collar colour' : 'Neck trim', design.parts.collar.colour.toUpperCase()]);
    if (hasRugbyStyle(sport, design.garment) || design.fit) rows.push(['Fit', fitLabel(design)]);
    return rows;
}
