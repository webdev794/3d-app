/**
 * The ready-made 3D models (Tripo, 2026-11-13): a tile shows its garment on its own model by a flag in its look's
 * design.zoneColors (the viewer, viewer/src/main.js tripoOf). The flag is the garment's choice, not a colour the
 * customer picks: presets, resets and other looks that clear zoneColors keep it, so the model (and its neck choices)
 * stays. Add each new model's flag here; the apps keep the same list (lib/model_flags.dart).
 */
export const MODEL_FLAGS = ['bballSinglet', 'bballBand', 'rlShorts', 'rlSocks', 'fbJersey', 'fbV', 'scJersey', 'netballBib'] as const;

type Colours = Record<string, string> | null | undefined;
/** `next` zoneColors (null: none) with the model flags of `was` it lacks put back; null when there is nothing. */
export function keepModelFlags(was: Colours, next: Colours): Record<string, string> | null {
    const kept: Record<string, string> = {};
    for (const key of MODEL_FLAGS) if (typeof was?.[key] === 'string' && !(next && key in next)) kept[key] = was[key] as string;
    const out = { ...(next ?? {}), ...kept };
    return Object.keys(out).length ? out : null;
}
