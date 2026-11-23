import type { Design } from './components/KitViewer';
import { fixedNeck, isModelCollar, modelCollarsFor } from './garmentStyle';

/**
 * The ready-made 3D models (Tripo, 2026-11-13): a tile shows its garment on its own model by a flag in its look's
 * design.zoneColors (the viewer, viewer/src/main.js tripoOf). The flag is the garment's choice, not a colour the
 * customer picks: presets, resets and other looks that clear zoneColors keep it, so the model (and its neck choices)
 * stays. Add each new model's flag here; the apps keep the same list (lib/model_flags.dart).
 */
export const MODEL_FLAGS = ['bballSinglet', 'bballBand', 'rlShorts', 'rlSocks', 'fbJersey', 'fbV', 'scJersey', 'netballBib', 'aflGuernsey', 'trainingShorts', 'womenRugbyShorts', 'trackPants', 'womenLeggings', 'fitnessBottoms', 'tsPants', 'poloShirt', 'trainingTee', 'fitnessTop', 'rashGuard', 'rugbyJersey', 'poloZip', 'rugbyVJersey', 'trainingSinglet', 'bballHoodie', 'fishingHoodie', 'womenRugbyJersey', 'tsJacket', 'tjModel', 'tpModel', 'baseballJersey', 'afJersey', 'hoodedTee', 'waterproofJacket', 'windbreakerJacket', 'womenFootballJersey', 'zipHoodie', 'sweatshirt', 'sleevelessHoodie', 'longsleevePolo', 'lsTee', 'womenTee', 'raglanLs', 'womenSinglet', 'cyclingJersey', 'mtbJersey', 'compressionPants', 'pufferVest', 'sportsBra', 'womenShorts', 'swimShorts', 'menTights', 'runningShorts', 'womenFootballShorts'] as const;

type Colours = Record<string, string> | null | undefined;
/** `next` zoneColors (null: none) with the model flags of `was` it lacks put back; null when there is nothing. */
export function keepModelFlags(was: Colours, next: Colours): Record<string, string> | null {
    const kept: Record<string, string> = {};
    for (const key of MODEL_FLAGS) if (typeof was?.[key] === 'string' && !(next && key in next)) kept[key] = was[key] as string;
    const out = { ...(next ?? {}), ...kept };
    return Object.keys(out).length ? out : null;
}

/** Flags that are a choice made on a model rather than a model (kept while that model is on): the Rugby League jersey's V. */
const CHOICE_OF: Partial<Record<(typeof MODEL_FLAGS)[number], (typeof MODEL_FLAGS)[number]>> = { fbV: 'fbJersey' };
type TileLike = { garment: string | null; design?: { zoneColors?: Record<string, string | undefined> | null } } | null | undefined;
type DesignLike = Pick<Design, 'garment' | 'zoneColors' | 'neck'>;
/**
 * A design opened on its tile (client 2026-11-17, 571.png: a saved Football jersey kept the Rugby League jersey's model
 * flag, so the Studio showed that jersey): the tile's model flags win. Model flags the tile doesn't have go (a choice
 * such as fbV stays with its model), the tile's flags the design lacks come back, and a neck the model doesn't offer
 * falls back to the model's own. The same design object when nothing changes.
 */
export function withTileModel<D extends DesignLike>(design: D, tile: TileLike): D {
    if (!tile?.design || !tile.garment || tile.garment !== design.garment) return design;
    const own = tile.design.zoneColors ?? {};
    const flags = MODEL_FLAGS.filter(f => typeof own[f] === 'string');
    const zc: Record<string, string> = { ...((design.zoneColors as Record<string, string> | null | undefined) ?? {}) };
    let changed = false;
    for (const f of MODEL_FLAGS) {
        const parent = CHOICE_OF[f];
        const wanted = flags.includes(f) || (!!parent && flags.includes(parent));
        if (!wanted && f in zc) { delete zc[f]; changed = true; }
        if (flags.includes(f) && typeof zc[f] !== 'string') { zc[f] = own[f] as string; changed = true; }
    }
    const zoneColors = changed ? (Object.keys(zc).length ? zc : null) : design.zoneColors;
    const fixed = fixedNeck({ garment: design.garment, zoneColors } as DesignLike);
    // (a collar style of the Rugby League jersey's model stays: RUGBYJ, client 611)
    const neckOff = !!fixed && !!design.neck && design.neck !== fixed && !(isModelCollar(design.neck) && modelCollarsFor({ garment: design.garment, zoneColors } as DesignLike));
    if (!changed && !neckOff) return design;
    return { ...design, zoneColors, ...(neckOff ? { neck: undefined } : {}) };
}
