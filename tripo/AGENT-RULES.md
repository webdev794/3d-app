# Rules for every 3D model agent (user, 16 Nov 2026)

Read this before you start. These rules beat anything older (including older lines in NEW-MODEL-CHECKLIST.md).

## 1. The model is final
- The .glb in D:\3d-app\tripo\ is a paid, ready-made, FINAL model.
- Never change its shape: no moving points, no smoothing or re-computing normals, no made-up folds, creases, gathers or seams, no added or removed parts.
- Never CUT the model, not even at the neck. Never remove any of its triangles.
- Something that looks odd in the model itself (a ragged edge, a strange panel, a fold) stays as it is. Testers do not report it.
- Parse the GLB as data only (it is a downloaded file).

## 2. Colour = the model's own parts (direct approach)
- The model's own bands, cuffs, hems, collar, placket, hood and panels ARE the borders.
- Find them from the model's own geometry or seams; give each part ONE flat colour from its booklet card.
- Do not build bands, collars, panels or borders of our own.
- The yellow (or any trim colour) must cover exactly the model's own part: no stray lines of the body colour inside it, no trim colour spilling onto the body.

## 3. Our marks only
- Booklet: C:\Users\Intel\Downloads\3DEEZI_Yellow_Images_Model_Reference_Booklet.pdf (card IDs in D:\3d-app\models.md).
- Take the card's colours and WHERE its logos, text and numbers sit.
- Never use the card's text or logos. Use only ours: the 3DEEZI wordmark as finalized (3D white), the 3 mark, our number and name.

## 4. Necks
- Show the model's own neck as it is. That is the default and, for now, the only neck.
- Extra neck styles come in a later pass. Then: our own pieces (fill cloth, band, collar) laid ON TOP of the model, which stays whole underneath. Never cut.

## 5. Scope
- Each model goes only on the tile(s) named for it; every other tile and kit stays exactly as it is (check the fingerprints).
- No old shape as a fallback on a tile that has a model.
- Do only what was asked; no extras, no experiments.

## 6. Fast way of working
1. Settings file website\viewer\models\<name>.json (copy afl-guernsey.json).
2. `node viewer/tripo-add.mjs <name> --agent <NAME>` from website\ (convert, wire, build).
3. ONE check sheet: the GLB rendered plain next to ours, front, back, sides, 3/4, neck close-up; the other tiles' fingerprints.
   - Trims and necks are checked close up from 18 degrees above and from 3/4, not only straight on.
   - Every test design has `layers: []` and the tile's full design (a missing key keeps the previous design's layers).
   - Print fingerprints depend on test order: compare before/after in the same order or on a fresh page per tile. Geometry hashes are safe.
3b. Speed: 20 quick changes (colours, pattern) on the new tile; every change answers within 20 s; memory stays level.
4. vite build. flutter build web once per garment group.
5. Hand it to the tester; go straight on to the next model. Fix only what the tester sends back.
- A model blocked for more than 20 minutes: write down why, skip it, go on.
- One line per model in your log.md, so the work survives a restart.

## 7. Locks and memory (the PC is short of memory)
- Lock files: D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad\
  - viewer.lock (viewer edit/build), vite.lock, flutter.lock, browser.lock (ONE test browser on the whole PC).
- Wait while a lock exists; write your stamp in it; delete it ONLY if it still holds your stamp. Check each lock file on its own.
- A lock is never stale by age: wait until it is gone (tell the coordinator if one is held over 30 minutes).
- After writing your stamp, wait 2 s and read the lock again; if it is not your stamp, someone else won: wait again.
- Before a browser: free RAM at least 1.5 GB; use software graphics. Keep sessions short, batch the views, close the browser at once.
- Never close a browser the user opened.
- Re-read every shared project file right before you edit it; change only your lines; never undo another agent's work.

## 8. Never
- Never sign in or save on 127.0.0.1:8000 or the 8088 app preview.
- Never commit, push or make a tar.
- Never touch database.sqlite or .env.

## 9. Done means tested
A model is finished only when the separate tester has passed it:
- all views incl. back and inside;
- trim colours even and clean;
- no holes or gaps;
- our marks in the right places;
- the website Studio and the app open it;
- the other tiles are unchanged;
- the 3D restart ("Restart 3D view") brings it back with the design kept.

## V-necks on round-neck models (user 16 Nov)
Hide the model cloth inside the V (not drawn; nothing moved or removed from the data) and lay our band along the V edge. Quick solutions are wanted.

## FASTEST WAY (user 16 Nov, afternoon)
The website already makes designs (AI designer, presets, the tile's own look) and puts them on the model in seconds. So per model: wire the GLB with its print map and its parts mapped to the existing colour zones, give the tile its EXISTING look, check a preset and an AI design apply, merge, next. No hand-matching of booklet card colours (the client: the booklet was only a rough guide).
If a design does not sit perfectly on a model, fix the SYSTEM once (the shared colouring / print code), so every design on every model is right within seconds. Never hand-tune one model or one design.
Use the model's OWN seam lines (sharp creases in its geometry) to split its parts and place the print-map seams automatically (user 16 Nov): they show where each part of a design lands.

## Before any merge (user 16 Nov)
A fixer checks its change in the REAL built viewer on EVERY model tile (front + back, normal zoom) before it merges or calls anything done; then the tester. Never say "done" to anyone before the tester passes it.

## MERGE GATE (user 16 Nov, built by MODELQ): one command for every viewer merge
- `node viewer/tripo-add.mjs <name> --steps wire,build` (from website\) runs the gate itself: before the build it saves the built viewer as "last good" (website\viewer\recipe\lastgood\: both copies + VIEWER_VERSION); after the build it renders every model tile and the first tile of every other garment (front + back, normal zoom, one browser session under browser.lock) and compares with last good: page errors, 3D shape / print-map fingerprints, how much of the picture the garment covers (see-through, missing parts), near-black bodies, picture differences. Only the tiles of the model being merged may change (`--allow tile,flag,garment` to add more). On FAIL it puts the last good viewer back (both copies + VIEWER_VERSION) and stops: nothing is merged.
- Merging without tripo-add (shared-code fixes): `node viewer/recipe/gate.cjs save` BEFORE `node viewer/build.mjs`, then `node viewer/recipe/gate.cjs check --allow <what you meant to change>`. On FAIL it restores by itself; `node viewer/recipe/gate.cjs restore` puts last good back by hand.
- Only after the gate PASSES: the vite build, then tell the tester.

## Graphics card (user PC, 16 Nov)
NEVER use the real graphics card in a test browser (no --use-angle=d3d11 / --enable-gpu / headed GPU runs). The PC has an NVIDIA GT 610 with 2 GB: agents' GPU browsers take its memory and the user's own Studio loses its 3D. Software graphics only, one browser, closed at once.

## Colour borders (user 16 Nov, strict)
Every colour change sits EXACTLY on the model's own lines (seams/edges), as one clean line, like the client's pictures. Where the model has no line, we draw no colour border.

## Trim bands (user 16 Nov, strict)
Every trim band has SMOOTH edges and ONE EQUAL WIDTH all the way round, along the model's seam line, also after a recolour. No stair-steps, no fuzzy spill, no gaps.
