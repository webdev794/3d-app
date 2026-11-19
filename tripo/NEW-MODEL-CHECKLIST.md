# Adding a new 3D model (Tripo): checklist

Follow this for every new garment model the client gives. Learned from the Netball dress and Basketball shorts (12 Nov 2026).

## 1. Make the model in Tripo
- One model per garment piece: a kit is cut into jersey, shorts and so on. Shorts need a shorts-only picture, because in kit pictures the shirt hides the waist.
- One model per variation: each neck or style (for example a V-neck dress) needs its own picture from the client and its own model.
- Settings: Smart Mesh, Quad, polycount about 10,000, Private, Generate Multi-Views first, export as GLB.
- Save it as `D:\3d-app\tripo\<garment>.glb`.

## 2. Put it in the project
- The model is final: never reshape it. Only one uniform scale and its placement on the figure.
- The model data goes inside the 3D viewer page, not as a separate file, so it can't stall or come from an old saved copy in the browser.
- Colours, prints and logos: add the colour map, so every colour area, pattern, the 3DEEZI wordmark ("3D" in white), the "3" mark and the position letters work on it.
- Starting look: the colours and placement from the client's picture. Never use text or logos from the picture. The tile picture stays unchanged.
- ALWAYS (user 13 Nov): set the model's colours AND our logo, text and number positions from the reference picture (the client booklet card or the picture the user sends). A model only counts as done once its colours and our marks match the reference placements.

## 2b. Neck and collar choices
- See AGENT-RULES.md rule 4 (user 16 Nov): the model's own neck only for now; extra neck styles come in a later pass as our own pieces laid ON TOP of the model. NEVER cut the model.

## 3. Replace the old one
- Delete the old shape of THAT garment only, and only once its new model is in. Other garments keep theirs until their new models come.
- Never fall back to the old shape. If the model ever fails to load, show "did not load, Retry".
- No style choice may build the old shape. Build every style on the new model instead (see 2b); never hide styles. Do this on the website and in the app.

## 4. Check before calling it done
- Speed and memory: repeat colour changes, pattern changes, moving the logo and text, view switches and every style choice about 20 times, at normal speed and on a slow-PC setting. Memory stays level, no new big images are made on each change, and every change finishes well under 20 seconds.
- Studio on the website and in the app: the model shows, colours and logos work, and there are no errors.
- The "YOUR DESIGN" card in Studio shows a picture of the whole kit.
- Every other garment looks exactly as before.

## 5. Ship
- Viewer version bump, both viewer copies identical, website and app builds.
- The next live tar includes all finished work. The phone app gets it with its next app build.

## STRICT RULE (user, 16 Nov)
The .glb is final. Never change its shape for anything (ragged parts, seams, folds, holes in the model itself). Never cut it either, not even at the neck (see AGENT-RULES.md, which beats this file). All work is colours, print, our marks and lighting.

## Fast recipe (16 Nov): one settings file + one command
1. Put the GLB in `D:\3d-app\tripo\`.
2. Write `website\viewer\models\<name>.json` (copy `afl-guernsey.json`): the GLB path, the converter (the garment kind's
   `viewer\tripo-<kind>.mjs`; a new model of a kind already done reuses it), the part and look flag, the model's own neck
   and the other neck styles to build (`necks`: a V `depth` down the pattern), the tile names, the starting look from the
   booklet card (colours, our 3DEEZI wordmark / "3" mark / number places, chest bands as layers; nothing from the card's
   text or logos) and the check views.
3. From `website\`: `node viewer/tripo-add.mjs <name> --agent <YOURNAME>`. It converts the GLB (data only; the model's
   points are only scaled and placed), wires the tile on the website and the app (catalog.php, sports_catalog.dart,
   modelFlags.ts, model_flags.dart, viewer/src/recipemodels.js), bumps VIEWER_VERSION, builds both viewer copies (under
   viewer.lock, presets.json kept), then makes the check sheet `viewer\models\check\<name>.jpg` and compares the other
   tiles' fingerprints before/after (under browser.lock). Steps one at a time: `--steps convert`, `wire`, `build`, `check`.
4. Look at the sheet; fix colours/places in the settings file and run `--steps wire,build,check` again.
5. Then the vite build and flutter build web (one heavy job at a time), and QATEST.
Neck rule: the model's own neck is shown exactly as it is; another neck style is laid on it, cutting only where the opening
itself changes (tripomesh.js vOf / cutNeck for a V).
