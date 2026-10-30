/**
 * Task 9.134: one part of the kit with a look of its own (design.parts) and objects on that part only (layer.clip).
 * The 3D viewer paints them (viewer/src/texture.js); the app agents build against scratchpad TP1/parts.md.
 */
export const topParts = ['front', 'back', 'leftSleeve', 'rightSleeve', 'collar', 'sides', 'hem'] as const;
export const shortsParts = ['shortsFront', 'shortsBack', 'shortsSides', 'shortsHem', 'waistband'] as const;
/** The socks' printed parts besides their front and back (viewer sockprint.js): the top band, the hoops, the heel and toe. */
export const sockParts = ['sockBand', 'sockHoops', 'sockFoot'] as const;
/** The cap's printed parts besides its front and back (viewer capprint.js): the brim, under the brim, the piping, the side sweeps. */
export const capParts = ['capBrim', 'capUnder', 'capPiping', 'capSweep', 'capSweepLow'] as const;
/** The skirt's own printed part besides its front, back, side panels and hem (viewer skirtprint.js): the waistband. */
export const skirtParts = ['skirtBand'] as const;
/** The bucket hat's printed parts besides its front and back (viewer hatprint.js): its top, brim, under the brim, the bound edge. */
export const hatParts = ['hatTop', 'hatBrim', 'hatUnder', 'hatBinding'] as const;
export type PartKey = (typeof topParts)[number] | (typeof shortsParts)[number] | (typeof sockParts)[number] | (typeof capParts)[number] | (typeof skirtParts)[number] | (typeof hatParts)[number];
export const allParts: PartKey[] = [...topParts, ...shortsParts, ...sockParts, ...capParts, ...skirtParts, ...hatParts];

/** A part's own look: every field optional; a part without any follows the kit. */
export interface PartFade { from: string; to: string | null; angle: number }
export interface PartStyle {
    /** Its own colour (a plain part: the kit's pattern is not drawn on it). */
    colour?: string | null;
    /** A fade across it, over its colour; to null fades out into what is under it. Angle 0 = top to bottom. */
    fade?: PartFade | null;
    /** A pattern on this part only: a pattern name or the user's own pattern picture. */
    pattern?: string | null;
    /** That pattern's colour (else the kit's Pattern colour). */
    patternColour?: string | null;
    /** 0..1: its own pattern's opacity, or (without one) the kit's pattern's on this part. */
    patternOpacity?: number | null;
}

export const partLabels: Record<PartKey, string> = {
    front: 'Front', back: 'Back', leftSleeve: 'Left sleeve', rightSleeve: 'Right sleeve', collar: 'Collar', sides: 'Side panels', hem: 'Hem',
    shortsFront: 'Shorts front', shortsBack: 'Shorts back', shortsSides: 'Shorts side stripes', shortsHem: 'Shorts hems', waistband: 'Waistband',
    sockBand: 'Top band', sockHoops: 'Hoops', sockFoot: 'Heel & toe',
    capBrim: 'Brim', capUnder: 'Under the brim', capPiping: 'Piping', capSweep: 'Side sweep', capSweepLow: 'Lower side sweep',
    skirtBand: 'Waistband',
    hatTop: 'Top', hatBrim: 'Brim', hatUnder: 'Under the brim', hatBinding: 'Brim edge',
};
/** The collar and the waistband are 3D rib: a colour only. */
export const ribPart = (key: PartKey) => key === 'collar' || key === 'waistband';
export const isShortsPart = (key: PartKey) => (shortsParts as readonly string[]).includes(key);

/** The parts a garment has (as the viewer finds them). */
export function partsOf(garment: string): PartKey[] {
    const jacket = ['hoodie', 'ziphoodie', 'trackjacket', 'varsity'].includes(garment);
    const sleeveless = garment === 'singlet' || garment === 'netball-dress';
    const top = topParts.filter(key => !(jacket && key === 'collar') && !(sleeveless && (key === 'leftSleeve' || key === 'rightSleeve')));
    if (garment === 'socks') return ['front', 'back', ...sockParts];
    if (garment === 'cap') return ['front', 'back', ...capParts];
    if (garment === 'skirt') return ['front', 'back', 'sides', 'hem', ...skirtParts];
    if (garment === 'bucket-hat') return ['front', 'back', ...hatParts];
    if (garment === 'shorts') return [...shortsParts];
    if (garment === 'fullkit') return [...topParts, ...shortsParts];
    return top;
}

/** Where a new object goes on a part chosen from the list (garment metres; a tap gives its own place). */
export const partSpots: Record<PartKey, { side: 'front' | 'back'; x: number; y: number }> = {
    front: { side: 'front', x: 0, y: 0.22 }, back: { side: 'back', x: 0, y: 0.2 },
    leftSleeve: { side: 'front', x: 0.37, y: 0.6 }, rightSleeve: { side: 'front', x: -0.37, y: 0.6 },
    collar: { side: 'front', x: 0, y: 0.7 }, sides: { side: 'front', x: 0.265, y: 0.3 }, hem: { side: 'front', x: 0, y: 0.07 },
    shortsFront: { side: 'front', x: -0.12, y: 0.25 }, shortsBack: { side: 'back', x: 0.12, y: 0.25 },
    shortsSides: { side: 'front', x: 0.26, y: 0.2 }, shortsHem: { side: 'front', x: -0.15, y: 0.05 }, waistband: { side: 'front', x: 0, y: 0.4 },
    sockBand: { side: 'front', x: 0, y: 0.62 }, sockHoops: { side: 'front', x: 0, y: 0.56 }, sockFoot: { side: 'front', x: 0, y: 0.03 },
    capBrim: { side: 'front', x: 0, y: 0.046 }, capUnder: { side: 'back', x: 0, y: 0.046 }, capPiping: { side: 'front', x: 0.102, y: 0.14 }, capSweep: { side: 'front', x: 0.135, y: 0.117 }, skirtBand: { side: 'front', x: 0, y: 0.32 }, capSweepLow: { side: 'front', x: 0.145, y: 0.096 },
    hatTop: { side: 'front', x: 0, y: 0.25 }, hatBrim: { side: 'front', x: 0, y: 0.03 }, hatUnder: { side: 'back', x: 0, y: 0.19 }, hatBinding: { side: 'front', x: 0, y: 0.002 },
};

/** A garment's own spot for a part, where it is elsewhere than the usual one (the skirt's side panels: viewer skirtprint.js). */
export const garmentSpots: Record<string, Partial<Record<PartKey, { side: 'front' | 'back'; x: number; y: number }>>> = {
    skirt: { sides: { side: 'front', x: 0.23, y: 0.12 } },
    'bucket-hat': { front: { side: 'front', x: 0, y: 0.11 }, back: { side: 'back', x: 0, y: 0.11 } },
};

const HEX = /^#[0-9a-f]{6}$/i;
/** A part's look without its empty fields; null when nothing is left (the part follows the kit again). */
export function cleanPart(style: PartStyle | null | undefined): PartStyle | null {
    if (!style) return null;
    const out: PartStyle = {};
    if (style.colour && HEX.test(style.colour)) out.colour = style.colour;
    if (style.fade && HEX.test(style.fade.from)) out.fade = { from: style.fade.from, to: style.fade.to && HEX.test(style.fade.to) ? style.fade.to : null, angle: Math.round(Number(style.fade.angle) || 0) };
    if (style.pattern && style.pattern !== 'None') out.pattern = style.pattern;
    if (out.pattern && style.patternColour && HEX.test(style.patternColour)) out.patternColour = style.patternColour;
    if (typeof style.patternOpacity === 'number' && style.patternOpacity < 1) out.patternOpacity = Math.max(0, Math.round(style.patternOpacity * 100) / 100);
    return Object.keys(out).length ? out : null;
}
/** design.parts with one part's look changed (or cleared); null when no part has a look of its own. */
export function withPart(parts: Partial<Record<PartKey, PartStyle>> | null | undefined, key: PartKey, style: PartStyle | null): Partial<Record<PartKey, PartStyle>> | null {
    const next = { ...(parts ?? {}) };
    const clean = cleanPart(style);
    if (clean) next[key] = clean; else delete next[key];
    return Object.keys(next).length ? next : null;
}
/** One line for the design sheet and the kit page: "Own colour #FF0000 · fade #FFCC00 → out ↓ · Hoops 60%". */
export function partSummary(style: PartStyle): string {
    const bits: string[] = [];
    if (style.colour) bits.push(`Own colour ${style.colour.toUpperCase()}`);
    if (style.fade) bits.push(`Fade ${style.fade.from.toUpperCase()} → ${style.fade.to ? style.fade.to.toUpperCase() : 'clear'} (${style.fade.angle}°)`);
    const opacity = typeof style.patternOpacity === 'number' ? ` ${Math.round(style.patternOpacity * 100)}%` : '';
    if (style.pattern) bits.push(`Pattern ${/^(data:|\/|https?:)/.test(style.pattern) ? 'My pattern' : style.pattern}${style.patternColour ? ` ${style.patternColour.toUpperCase()}` : ''}${opacity}`);
    else if (opacity) bits.push(`Kit pattern${opacity}`);
    return bits.join(' · ');
}
/**
 * The colours the parts add to the kit (their own colours, fades and pattern colours), each once, lower case: the
 * Mockup's true colours after the kit's three (the app's partColours, part_editing.dart).
 */
export function partColours(parts: Partial<Record<PartKey, PartStyle>> | null | undefined): string[] {
    const out: string[] = [];
    for (const key of allParts) {
        const s = parts?.[key];
        if (!s) continue;
        for (const hex of [s.colour, s.fade?.from, s.fade?.to, s.patternColour]) {
            if (hex && HEX.test(hex) && !out.includes(hex.toLowerCase())) out.push(hex.toLowerCase());
        }
    }
    return out;
}
