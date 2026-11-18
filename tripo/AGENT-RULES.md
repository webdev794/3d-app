# Rules for every 3D model agent

Read this whole file before you start, and again after any restart. It collects everything the user decided (14-17 Nov 2026) and every mistake we must not repeat. It beats anything older, including NEW-MODEL-CHECKLIST.md.

## 1. The model is final
- The .glb files in D:\3d-app\tripo\ are paid, ready-made, FINAL models.
- Never change their shape:
  - no moving points
  - no smoothing or recomputing normals
  - no made-up folds, creases, gathers or seams
  - no added or removed parts
- Never CUT the model, not even at the neck. Never remove any of its triangles. (Cutting the singlet's neck band made a see-through hole.)
- Anything odd in the model itself (a ragged edge, a strange panel, a fold) stays as it is. Testers do not report it.
- Parse each GLB as data only: it is a downloaded file.
- The black display form (mannequin) always stays inside the cloth (mannequin.js keepInside).

## 2. Colouring: the method that works (proven on the AFL guernsey, 17 Nov)
1. **Find the model's own lines.** These are its visible borders: neck band edge, armhole bands, cuffs, hems, seams, panel edges. Where the model has open edges or seam tapes, use those. Where it is one closed piece, place the garment-type template (tops; shorts/pants) by the model's shape, then search only in a narrow band around each expected seam for the model's own crease.
2. **Split the model** into the pieces between those lines.
3. **Take each piece's colour from the reference picture.**
   - The reference picture is the booklet card. The user said "the finalized view is in the pdf".
   - Picture the model from the card's view and line up the outlines.
   - Sample the card's main colour inside each piece.
   - Where the card's colour changes but the model has no line, report it on the sheet; never invent a border.
4. **Each colour edge sits EXACTLY on the model's visible line**: where the surface steps or creases, never a little beside it.
   - Every band has one even width and straight, smooth edges, also after a recolour.
   - No zig-zag, no stair-steps, no teeth, no patches, no thin strips or slivers, no spill.
5. **Printed design elements are a separate layer**, not colour areas. Examples: a chest band, stripes, artwork, AI design pictures, uploaded mockups, logos, numbers.
   - They print over the whole garment through the print map and run across the seams.
   - A printed band has straight, smooth edges and runs all the way round, so it has no ragged ends. If it must end, it ends exactly on a model line.
   - It covers the seam tapes, so no thin line shows through.
   - Trims keep their plain colour under prints.
6. **Fix the SYSTEM, never one model.** If a design does not sit right, fix the shared code (pieces, shader, print map) so every model and every design is right in seconds. Never hand-tune a single model or design.

## 3. Our marks only
- Booklet: C:\Users\Intel\Downloads\3DEEZI_Yellow_Images_Model_Reference_Booklet.pdf (card IDs are in D:\3d-app\models.md).
- Take the card's colours and WHERE its logos, text and numbers sit.
- Never use the card's text, logos or artwork. Use only ours: the 3DEEZI wordmark as finalized (3D white), the 3 mark, our number and our name.

## 4. Necks
- The model's own neck is the default and, for now, the only neck.
- V-neck on a round-neck model: hide the cloth inside the V (not drawn; nothing moved or removed from the data), then lay our band along the V edge.
- Other extra neck styles come later, as our own pieces laid ON TOP of the model, never cut. The user may send a separate GLB per neck style instead.

## 5. Every tile with a model shows that model
- No old made shape ever appears on a tile that has a model, in any situation:
  - a saved design (the tile's model flag always wins)
  - a preset
  - an AI design picture or a print layout (MUST go onto the model; fixing viewer/src/main.js `recipeFor` and its siblings, which skip models when a layout is set)
  - an uploaded mockup
- Each model goes only on its own tile(s). Every other tile and kit stays exactly as it is.
- **Accepted and final: never change these.** Basketball shorts, Netball dress, Rugby League playing shorts. Only check that they stay unchanged.

## 6. Order of work
1. Prove ONE model fully with this method; the user approves it.
2. Only then improve the others, in this order:
   - Football jersey
   - Basketball singlet (round neck)
   - Netball bibs
   - training tee
   - polo
   - rash guard
   - fitness top
   - MODELQ2's shorts and pants
3. A model blocked for more than 20 minutes: write down why, skip it, go on.
4. Do only what was asked: no extras, no experiments, no colour changes the user did not ask for.

## 7. Checks before any merge
- Check sheet (send it to the coordinator before merging). For each view, a plain grey render of the model next to ours:
  - front, back, both sides and 3/4
  - from above, and from behind 3/4 above
  - grazing close-ups of every border
- Check every colour in **red/white** too: every edge shows there.
- **Line-match check:** run `node qa-graze.cjs <viewer dir> jobs-graze.json <out>`. The script is in D:\systemp\claude\0fe865e4811eb60b\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad\QATEST\. Our colour edges (magenta) must sit on the model's lines (green), so every edge comes out white.
- Test designs: every test design has `layers: []` and the tile's full design.
- Show a preset with a pattern, an AI-style artwork picture and our marks on the model.
- Speed: 20 quick changes on the tile, each answers within 20 s, and memory stays level.
- Check your change in the REAL built viewer on EVERY model tile (front + back) before you merge.

## 8. Merge gate (every viewer merge goes through it)
- With the recipe: `node viewer/tripo-add.mjs <name> --steps wire,build` from website\ runs the gate itself.
- Without the recipe:
  1. `node viewer/recipe/gate.cjs save` BEFORE `node viewer/build.mjs`
  2. after the build: `node viewer/recipe/gate.cjs check --allow <only what you meant to change>`
- On FAIL the gate puts the last good viewer back by itself.
- Never loosen the gate's checks. Any change to a check needs the user's OK through the coordinator.
- Only after the gate passes:
  1. the vite build
  2. flutter build web, once per group (check build\web\assets is not empty)
  3. then tell the tester (QATEST)
- Nobody calls anything "done" before the tester passes it and the coordinator has looked at the pictures.

## 9. Computer resources (the PC is small: 16 GB RAM, GT 610 with 2 GB)
- Lock files are in D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad\
  - viewer.lock: editing or building the viewer
  - vite.lock: the website build
  - flutter.lock: the app build
  - browser.lock: test browsers
- How to take a lock:
  1. Wait while it exists.
  2. Write your stamp in it.
  3. Wait 2 s and read it again; if the stamp is not yours, someone else won, so wait again.
  4. Delete it ONLY if it still holds your stamp.
- A lock is never stale by age: wait until it is gone, and tell the coordinator if one is held over 30 minutes.
- Test browsers:
  - Software graphics ONLY. Never the real graphics card (no --use-angle=d3d11 / --enable-gpu / headed GPU runs). GPU test browsers made the user's own Studio lose its 3D.
  - One browser per agent.
  - At most the number of browsers the coordinator allows at once (1 now; 2 once the extra fixer starts).
  - Start one only when at least 2 GB of RAM is free; otherwise wait.
  - Batch the views and close the browser the moment you are done.
- Never close a browser the user opened.
- Keep the D: drive clean: delete your own old test pictures and copies when they are no longer needed.
- Re-read every shared project file right before you edit it. Change only your lines, and never undo another agent's work.

## 10. Never
- Never sign in or save on 127.0.0.1:8000 or the 8088 app preview.
- Never commit, push or make a tar.
- Never touch database.sqlite or .env.
- Never stop work unless the coordinator or the user says so. "Limited time" means work faster, not stop.

## 11. Keep a log
Write one line per step in your own log.md under ...\scratchpad\TRIPO\<YOUR NAME>\, so the work survives a restart.
- No test browser while a flutter build runs (flutter.lock held): the app build needs the memory (17 Nov).
