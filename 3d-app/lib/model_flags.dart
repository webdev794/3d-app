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
  'aflGuernsey',
  'trainingShorts',
  'womenRugbyShorts',
  'trackPants',
  'womenLeggings',
  'fitnessBottoms',
  'tsPants',
  'poloShirt',
  'trainingTee',
  'fitnessTop',
  'rashGuard',
  'rugbyJersey',
  'poloZip',
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

/// Flags that are a choice made on a model rather than a model (kept while
/// that model is on): the Rugby League jersey's V.
const _choiceOf = {'fbV': 'fbJersey'};

/// A design opened on its tile (client 2026-11-17, 571.png: a saved Football
/// jersey kept the Rugby League jersey's model flag, so the Studio showed that
/// jersey), as the website's withTileModel: the tile's model flags win. Model
/// flags the tile doesn't have go (a choice such as fbV stays with its model)
/// and the tile's flags the design lacks come back. [tileColours]: the tile
/// look's zoneColors. Null when nothing changes.
Map<String, String>? withTileModel(
  Map<String, String> zoneColors,
  Map<String, dynamic> tileColours,
) {
  final flags = [
    for (final f in modelFlags)
      if (tileColours[f] is String) f,
  ];
  final out = {...zoneColors};
  var changed = false;
  for (final f in modelFlags) {
    final parent = _choiceOf[f];
    final wanted =
        flags.contains(f) || (parent != null && flags.contains(parent));
    if (!wanted && out.containsKey(f)) {
      out.remove(f);
      changed = true;
    }
    if (flags.contains(f) && out[f] == null) {
      out[f] = tileColours[f] as String;
      changed = true;
    }
  }
  return changed ? out : null;
}
