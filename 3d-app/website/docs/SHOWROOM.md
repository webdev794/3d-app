# 3DEEZI 3D Showroom

An interactive, game-style 3D showroom: one large garment on a glowing podium in a night stadium. You can spin it, zoom, recolour it live and capture a high-resolution mock-up.

- **File:** `website/public/showroom/index.html`. One self-contained page: three.js loads from a CDN, and everything else is inline.
- **Address:** `https://YOUR-SITE/showroom/` (test server: `https://testcaresortwork.co.in/3deez/showroom/`).
- **Useful links:**
  - `?sport=soccer` opens a sport: `rugby-league`, `soccer`, `basketball`, `afl` or `training`.
  - `?quality=high`, `medium` or `low` fixes the graphics level. Without it, the page chooses automatically and steps down if the frame rate drops below 40 fps.
  - `?embed=1` hides the logo bar and headline, for use inside the apps.

## Swapping in purchased GLB models

1. Put the files in `public/showroom/models/` with these exact names:

   | Sport | Top | Shorts |
   |---|---|---|
   | Rugby League | `rugby_jersey.glb` | `rugby_shorts.glb` |
   | Soccer | `soccer_jersey.glb` | `soccer_shorts.glb` |
   | Basketball | `basketball_singlet.glb` | `basketball_shorts.glb` |
   | AFL | `afl_guernsey.glb` | `afl_shorts.glb` |
   | Training | `training_tee.glb` | — |

2. That's all. The page checks for each file and uses it if it exists; otherwise it shows the built-in placeholder. You can mix them, for example a real jersey with placeholder shorts. To test a model folder without replacing anything, open `?models=some-folder/`, which loads `some-folder/models/...`.

3. The page automatically:
   - scales the model to real size (jersey 75 cm, shorts 42 cm), centres it and stands it on the podium;
   - colours meshes or materials whose name contains `collar`, `cuff`, `rib`, `trim`, `neck`, `binding` or `waist` with the **accent** colour, and gives every other mesh the **main colour and tiled pattern**;
   - prints the team name, crest, back name and number as decals, found by aiming at the front and back of the body.

   For artwork placed exactly on the garment's own print layout (as in a factory template), the model needs a proper UV layout. Ask me to switch that model to UV painting once it arrives.

## Settings that control the look

At the top of the script, `LOOK`:

| Setting | Effect |
|---|---|
| `exposure` | Overall brightness |
| `bloomStrength`, `bloomRadius`, `bloomThreshold` | Glow on the podium rings, lamps and LED columns. A lower threshold makes more things glow. |
| `vignette` | Darkening at the screen edges |
| `fogDensity` | Stadium haze and depth |
| `envIntensity` | Soft image-based light on the garment |
| `rimCyan`, `rimBlue` | Colours of the back rim lights |
| `fabric` | `roughness`, `sheen` and `knit` (strength of the knit-texture bumps) |
| `kitScreenHeight` | How much of the screen height the garment fills (0.62 = 62%) |

`TIERS` sets what each graphics level does: pixel ratio, anti-aliasing, floor mirror, shadow sharpness, particle count and texture size.

## Embedding in the Flutter app and the React website

The same file works in both. It exposes `window.showroom`:

```js
showroom.setSport('soccer');
showroom.setDesign({ main: '#0b1016', secondary: '#12E1F0', accent: '#1E7BFF', pattern: 'hoops', team: 'MANTIS', backName: 'SMITH', number: '7' });
showroom.view('back');   // 'front' | 'back' | 'side' | 'spin'
showroom.capture();       // opens the high-resolution PNG
```

- **Flutter (`webview_flutter`):**
  - Load `https://YOUR-SITE/showroom/?embed=1`, or bundle the file as an asset as the app's current viewer does.
  - Enable JavaScript, then call `controller.runJavaScript("showroom.setDesign(${jsonEncode(design)})")`.
- **React:**
  - `<iframe src="/showroom/?embed=1">`, then `iframe.contentWindow.showroom.setDesign(...)`. Same origin, so direct calls work.

## Checklist for buying garment models or briefing a 3D artist

**Format and size**
- [ ] **GLB (glTF 2.0)** preferred. FBX or OBJ with textures is fine; I convert them.
- [ ] Real-world scale in metres, garment upright (Y up), facing +Z (front towards the viewer).
- [ ] **Polycount** 20,000–60,000 triangles per garment (phones stay smooth). Avoid 500k+ CLO3D/Marvelous exports, or ask for a decimated version.
- [ ] File size under about 10 MB per garment, textures included.

**Structure**
- [ ] Separate, clearly **named meshes or materials**: `Body`, `Sleeve_L`, `Sleeve_R`, `Collar`, `Cuff_L`, `Cuff_R`, and `Waistband` for shorts.
- [ ] **Clean, non-overlapping UVs** laid out like the flat sewing pattern (front panel, back panel, sleeves), so a print design lands where a factory would print it.
- [ ] One UV set, all panels at the same texel density, no stretching on the chest, back or sleeves.
- [ ] Shown on an invisible mannequin (shaped and draped), not flat. No body or mannequin mesh included.

**Realism**
- [ ] Baked **normal map** for folds, seams and stitching (2K–4K). Optional ambient-occlusion map.
- [ ] Optional fabric detail map (knit or mesh texture) that tiles.
- [ ] Neutral base colour (white or grey) so we can recolour it.

**Rights**
- [ ] **Royalty-free licence that allows use in a commercial app and website**, including showing the model to customers and producing images of it. Avoid "editorial use only" and "no redistribution in apps".
- [ ] For a commissioned artist, the contract transfers full rights or grants an exclusive licence to Mantis Clothing / 3DEEZI, and source files (`.zprj`/`.blend`) are delivered too.

**Range to buy first:** rugby jersey, rugby shorts, soccer jersey, basketball singlet, AFL guernsey, training tee. Socks and boots come later.
