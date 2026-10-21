# Resume notes

Updated 2026-10-20, about 17:15 (session at about 90%). Finished work is in tasks.md and task-done-today.md; this file keeps only what is needed to continue.

## Where things are
- **Live:** upload `D:\3d-app\deploy-zips\3deez-update-2026-10-20-g.tar.gz`, or a newer letter if one is made later. Packages are cumulative since the live 2026-10-19 version, so the latest one alone is enough. Each includes our database with both live test logins (admin@3deezi.com, admin@example.test). Extract in the 3deez folder; nothing else is needed.
- **GitHub main:** 9685a77, with the website, our app work and the notes files (the user asked to push all changes on 2026-10-20). Local branch v6 is still at ec79628, with all of today's work uncommitted (many new files untracked). Push through a temporary index (SP\final-push.sh), so v6 stays untouched.
- **Versions:** viewer 2026-10-20-5, Artboard editor 2026-10-20-10.
- **Unfinished agent work** is only in scratchpad copies, never in project files. SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`.
- **Check first:**
  - no `SP\viewer.lock`;
  - the viewer files equal origin/main (git hash-object vs git rev-parse origin/main:path).

## Pending, in order
1. **AI mockup on the 3D singlet** (user's live tests, images 119-122; tasks.md 9.60c)
   - **Front, centre line:** the red centre line of the design must run straight down the middle; it curves to the right.
   - **Front, crest:** the 818 INK crest sits too near the arm.
     - Cause: the photo foreshortens the shirt's sides. The crest is about 0.44 of the way out, but shows at 0.63 in the photo.
     - Next: flatten the photo row by row, from the garment's width at each height. The first attempt is in SP\B2\unproject-wip-layout-warp.js and unproject-wip-main.js; one stretch for all rows broke the shoulder and armhole corners.
     - The curved centre line probably has the same cause.
   - **Back:** the top of the big crest is cut by the back neck. Move it down a little so the whole ring shows.
     - Cause: the 3D back neck is raised, and the back drawing is placed without that raise (about 2.7 cm cut).
     - A fix is coded but untested in SP\B2\src. Test it on 117 (the mockup) and 94 (the flat drawing), run the regressions, ship.
   - **Neck, right side** (image 123): a black bulge on the right strap next to the neck, and the neckline edge is wrong at the top right. Likely cause: the singlet takes its cut (straps, neck) from the photo, and a shadow or fold on the right shoulder got into the outline. Check the outline found near the right strap and neck.
2. **The Artboard is laggy** (user, 2026-10-20). Measure first, then fix what is slow. Candidates:
   - drawing and dragging;
   - the selection handles;
   - the quick-access fitter and its ResizeObservers;
   - Contour previews;
   - the palette.
3. **Leopards cuff rows** (tasks.md 9.8)
   - SP\A\src try5 gives a band spread of 0.10-0.12 cm with straight rows. The changes are in worn.js tube() and layout-warp.js (regionMesh band.cuffDepth).
   - Next:
     - check the V at the top seam in SP\A\out\try5-cuffL-below.png;
     - run SP\A\folds.cjs;
     - merge against SP\A\base;
     - run the full regressions, then ship.
4. **Polo collar from the drawing** (tasks.md 9.60b)
   - The collar texture from the drawing works in SP\C\src (polo-collar.js and main.js).
   - Problem: the 3D polo collar is a 1.1 cm upright band, so the stripes barely show.
   - Next: a real fold-down collar for polo design pictures, about 4 cm on the shirt, with that texture.
5. **Jersey / tee neck shape from the drawing** (tasks.md 9.60a)
   - Crew or V, and the depth.
   - Also needed: the collar trim depth, the collar stitching and the back neck raise.
   - Copy: SP\B\src.

## How to ship viewer work
1. Follow the rules in SP\viewer-protocol.md:
   - own copy, viewer.lock, git merge-file onto the project;
   - the next VIEWER_VERSION;
   - regressions: marks-baseline changed 0, layout-save-test, 94 and 117 unchanged unless meant to change.
2. Run the vite build and flutter build web.
3. Run `bash SP/final-pack.sh` (change -e to the next letter first).
4. Run `bash SP/final-push.sh <message file>`.

## Rules to keep
- **Pushing:**
  - only when the user says; checkpoints before the limit (tar and push) are agreed;
  - scope: website, lib/, test/, assets/viewer and assets/artboard;
  - never root notes files.
- **Live packages** include our database. Check that both live test logins are in it before packing.
- **Don'ts:**
  - no APK;
  - no new packages without asking;
  - no paid AI calls in tests;
  - never pull.
- **php -l** every PHP edit.
- **test-pending.md:** every finished task goes in with its test steps.

Agent IDs from this session (resumable only in this session): mockup a620c1b862a0f7aa2, cuff a9a4b1d756d8a5c51, polo collar a7b8460ad3c3a2c99.

## 2026-10-21 wave 1 (started about 10:05)
- AI mockup fixes (back crest, front crest, centre line, right strap bulge): agent a620c1b862a0f7aa2, 45 min, viewer-protocol.
- Leopards cuff rows, finish try5: agent a9a4b1d756d8a5c51, 40 min, viewer-protocol.
- Artboard speed (5.130): agent ad421acabbec317ce, 45 min, artboard/src only; builds both copies, EDITOR_VERSION 2026-10-21-1, vite + flutter builds.
- After the wave: checks, tar 3deez-update-2026-10-21.tar.gz (cumulative since ec79628; use SP/final-pack.sh with the new name), push (SP/final-push.sh plus root notes and 3d-app/assets/images/brand-wordmark.png).
- User (10:10): finish only yesterday's tasks (the three running); don't start old pending work (polo collar 9.60b, jersey/tee neck 9.60a) - later. New tasks for today are coming.
- 10:31 checkpoint: package D:/3d-app/deploy-zips/3deez-update-2026-10-21.tar.gz (226 files, 77 MB, cumulative since ec79628, database with both logins); main 75727de (cuff rows, Artboard speed, mockup round 1, notes). Mockup round 2 running (a620c1b862a0f7aa2, viewer -8).
- 10:40 user (images 124-126): neck right side and front/back neck not perfect -> added to mockup round 2 (a620c1b862a0f7aa2); new: neck size label (3DEEZI + L) inside the back neck and the inside in the garment's colour -> a7b8460ad3c3a2c99 (40 min, viewer-protocol; marks-baseline changes on purpose at the neck/inside only).
- 11:00 new client task: DYO Choose Your Sport tile carousel (tasks.md 9.70) -> agent a5017602856bd0d1e (60 min, website + app; viewer only via viewer-protocol).
- 11:05 new: moving horizontal line in the 3D background (tasks.md 9.71) -> agent a2023384f796b0e97 (40 min, viewer-protocol). Running now: mockup round 3 (a620c1b862a0f7aa2), sport chooser (a5017602856bd0d1e), background line (a2023384f796b0e97).
- 11:15 new: Gradient Presets flyout in Studio Colours (tasks.md 9.72) -> agent aa8ee791377ee2e90 (60 min, website + app + viewer via protocol + server validation). Mockup round 3 finished (viewer -10). Running: sport chooser (a5017602856bd0d1e), background line (a2023384f796b0e97), gradients (aa8ee791377ee2e90).
- 11:20 client: Artboard mouse pointer should be an arrow (tasks.md 5.131) -> agent ad421acabbec317ce (25 min, artboard only, EDITOR_VERSION 2026-10-21-2).
- 11:25 client: Artboard first-click handles 6 not 8 (tasks.md 5.132) -> agent a1eafa35530f2a0d7 (30 min). Artboard agents share src via scratchpad/artboard.lock + git merge-file (copies in scratchpad/H).
- 11:35 client: AI designer looks plain next to ChatGPT (tasks.md 9.73) -> new agent (60 min, server + app prompts, no paid calls; comparison script in scratchpad/ai-compare). Question in questions.md: may it run 2-4 paid images?
- 11:40 client: pay with Airwallex (tasks.md 9.74) -> new agent (75 min, server + pay page + admin + docs; Http::fake only). AI designer quality agent af8d37b7f43a56574 (tasks.md 9.73). Running now: sport chooser a5017602856bd0d1e, background line a2023384f796b0e97, gradients aa8ee791377ee2e90, Artboard pointer ad421acabbec317ce, Artboard handles a1eafa35530f2a0d7, AI quality af8d37b7f43a56574, Airwallex (new).
- Pointer 5.131 done (build 2026-10-21-2). flutter build web failed on the gradients agent's unfinished Dart (design_sheet.dart gradientStops); rerun flutter build web after aa8ee791377ee2e90 finishes.
