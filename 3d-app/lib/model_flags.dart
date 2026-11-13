/// The ready-made 3D models (Tripo, 2026-11-13), as the website's
/// modelFlags.ts: a tile shows its garment on its own model by a flag in its
/// look's zoneColors. The flag is the garment's choice, not a colour the
/// customer picks: presets, resets and other looks that clear zoneColors keep
/// it, so the model (and its neck choices) stays. Add each new model's flag
/// here and in website/resources/js/modelFlags.ts.
const modelFlags = [
  'bballSinglet',
  'bballBand',
  'rlShorts',
  'rlSocks',
  'fbJersey',
  'fbV',
  'scJersey',
  'netballBib',
];

/// [next] zoneColors with the model flags of [was] it lacks put back.
Map<String, String> keepModelFlags(
  Map<String, String> was,
  Map<String, String> next,
) => {
  ...next,
  for (final key in modelFlags)
    if (was[key] != null && !next.containsKey(key)) key: was[key]!,
};
