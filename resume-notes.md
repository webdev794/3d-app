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
- 11:51 checkpoint 2 of 2026-10-21: all agents finished; PHP 133, tsc, flutter analyze, flutter 69 (live tests left out); package D:/3d-app/deploy-zips/3deez-update-2026-10-21-b.tar.gz (240 files, 77 MB, cumulative since ec79628, both logins); main b6eba5e (78 files). No agents running.
- 12:00 pushed all work to v2 (user): da9a6ea on top of origin/v2 ec79628 (224 files, no force). Local v6 = ec79628 = parent of da9a6ea, so 'git merge --ff-only origin/v2' would bring local v6 up to date without changing files (not done; ask the user). Running: homepage redesign a5b7b5e4ac742d6cc, app pay in browser a31b344bf69defd8c.
- 12:05 user clarified: the redesign is the AI designer page (134 -> 135.jpg), not Home; agent a5b7b5e4ac742d6cc corrected (revert any Home.tsx edits; app: ai_designer.dart).
- 12:15 user: do not work on the homepage redesign. The redesign agent had overwritten Home.tsx, then wrote it back; I restored it from origin/v2 (identical to v2 and main; backup of its version in scratchpad/home-restore). No website build since 11:50, so the site never showed it. The agent restarted on the AI designer page only (Create.tsx AiDesigner brief step + app ai_designer.dart); 13 of its 20 images used (11 sport tiles reusable, in scratchpad/home-img).
- Pay in browser done (a31b344bf69defd8c): changed android/app/src/main/kotlin/com/example/three_deezi/MainActivity.kt and ios/Runner/AppDelegate.swift (reviewed; main = HEAD for both) -> include them in the next push. Native code not compiled (no APK).
- 12:35 user: the spinning 3DEEZI emblem is missing in the AI designer loader (images/136.png). Loader.tsx and its CSS unchanged (= main); caused by the redesign agent's in-progress website build at 12:22 (new ai-designer.css / AiStage.tsx / Create.tsx). Sent to a5b7b5e4ac742d6cc to fix; told it not to build unfinished work again.
- 12:53 checkpoint 3 of 2026-10-21: package D:/3d-app/deploy-zips/3deez-update-2026-10-21-c.tar.gz (262 files, 78 MB, both logins); main 37f30f9 (58 files incl. pubspec.yaml, android MainActivity.kt, ios AppDelegate.swift, assets/images/ai_designer; main had no other changes to them). v2 stays da9a6ea (snapshot before the redesign). No agents running. Next (user): the client's new garments (tasks 9.18-9.49, 9.10) when no newer client tasks.
- 13:00 checkpoint: HD mockup loader fix (.mockup-frame>img) -> package 3deez-update-2026-10-21-d.tar.gz (264 files), main 048fab1.
- 13:01 user: MAKE IT 3D -> Studio showed 'The 3D preview could not load'. Log: print-sheet 70 s, then the Studio started POST /ai/pattern (36 s) on the single-threaded local server; viewer requests dropped. Sent to af8d37b7f43a56574: no /ai/pattern after MAKE IT 3D / design picture, viewer auto-retry when slow, reproduce with a slow stub.
- 13:30-13:50 QA round (user: test all linked modules, fix the preset bug, then tar + push to v2). Rules: scratchpad/qa-rules.md. A Studio core + preset bug = aa0acdeea438e7ab2; B AI designer flow = a67c90bdd122d2ad8; C orders, payments, pages = aef1ec656aea8e80e; D Artboard + app parity = a14c29fcdadfb1de2. 45 min each. Bugs in scratchpad/qa/.
- Disk D: was full (0.01 GB free): deleted 220 old temp folders (playwright profiles, flutter_tools); moved 34 superseded packages + scratchpad/leopards + tgz to C:\3deezi-archive (kept 3deez-update-2026-10-21-d and the database package in deploy-zips). D: 2.5 GB free. Make it 3D fix (Create.tsx, Studio.tsx, ai_designer.dart) in the tree, unbuilt; QA B verifies it.
- QA D done: no Artboard bugs (31 suites pass, new round trip 21/21 in scratchpad/qa/D-roundtrip.cjs, run-suites.sh AB_URL fixed); app guest name 'Alex Morgan' -> C; phone Studio Ask bar -> A; asked D to retry the app home lower half.
- QA D finished: app home lower half OK (earlier abort = a flutter build web in progress); website ORDER NOW tile pictures collapse at <=600 px (order-now.css, align-items:stretch on .on-tile in the 600 px block) -> C. D: 1.9 GB free.
- QA A finished 14:30: preset bug fixed (StudioArtwork.tsx, Studio.tsx, app_controller.dart, studio_tools.dart, studio_document_test.dart); builds 14:06/14:08. Not fixed: numbers/names over a design picture (viewer skips marks when a layout is on); app has no notice when a colour change removes the picture.
- QA C finished 14:31: Assist reopen at top (Assist.tsx), ORDER NOW pictures <=600 px (order-now.css), app Profile Guest name (library.dart + test). PHP 133, flutter 82. Manual checks left: real admin/customer session flows, Invoices actions in browser, Order this kit dialog.
- 14:45 final of the QA round: PHP 133, tsc, flutter analyze, flutter 82; package D:/3d-app/deploy-zips/3deez-update-2026-10-21-e.tar.gz (264 files, 78 MB, both logins; -d moved to C:\3deezi-archive); pushed v2 fbeaff5 (67 files, on top of da9a6ea; includes pubspec, android MainActivity.kt, ios AppDelegate.swift, app images). main stays 048fab1 (without the QA fixes). Open: a late /ai/pattern from a left Studio overwriting a new DYO draft (unverified); Generate before /catalog loads makes no HD mockup; numbers/names over a design picture.
- 14:50 user: own design not selectable after choosing presets in the Studio (it vanished). -> agent A aa0acdeea438e7ab2: a YOUR DESIGN card first in Preset designs (restore with one click, ticked while on; survives save/reopen), My designs lists saved projects; website + app; 30 min.
- 15:02 YOUR DESIGN card done (A): package 3deez-update-2026-10-21-f.tar.gz (-e moved to C:\3deezi-archive); v2 1e66a1d (8 files). Website: the card persists per project in the browser's local storage; app: until the app is closed.
- 15:15 client (WhatsApp, images/139.png): 4 options, the PRIMARY the best -> option A (best ranked first rendered HD, 3 medium previews). New agent for the AI results redesign (images/138.jpg), 75 min, website + app (tasks.md 9.77).
- 15:35 user: DESIGN [SPORT] button overlaps the footer on /create/sport (images/140.png) -> agent a5017602856bd0d1e (CSS-only in showroom.css; results agent aacb0fd6e7d2db1d2 is editing Create.tsx).
- 15:45 user asked about gpt-6-astra. Key has gpt-6-astra/luna/sol, gpt-6.1-sol, gpt-image-2.5-flare/sunburst (chatgpt-image-latest deprecated 2026-12-01). Recommended: image model gpt-image-2.5-flare (faster, better), planning model gpt-6.1-sol, chat stays luna; astra too slow/pricey. Sent to results agent aacb0fd6e7d2db1d2: measure flare vs image-2, add OPENAI_PLANNING_MODEL (+ admin field), optional OPENAI_HD_IMAGE_MODEL (sunburst); no live default change without the user.
- 15:50 DESIGN button overlap fixed (showroom.css only: sticky in the stage, phone above ASSIST); built. Not yet packed.
- 15:58 user: set the best models. Tested (about 3 cents): flare low-quality image 11-12 s, logo faithful (scratchpad/model-check/flare-logo.png); flare rejects input_fidelity (code retries without); gpt-6.1-sol OK. Set in the settings DB: image gpt-image-2.5-flare, hd gpt-image-2.5-sunburst, planning gpt-6.1-sol, text stays gpt-6-luna. Results agent asked to skip input_fidelity for 2.5 models. The DB ships with the next package, so live gets them too.
- 16:02 user: are agents testing linked modules on the side? (only the results agent was running). Started QA E (ongoing): real-call check of every AI feature on the new models (cap 8 images / about US$1.50), regression of the sport button, Studio YOUR DESIGN / presets, smoke of site pages; then the results redesign when it ships.
- 16:10 QA E: planning on gpt-6.1-sol drops the client's logo (refuses to reproduce the mascot), 32 s, changes layout -> REVERTED: openai_planning_model cleared (falls back to gpt-6-luna). Image models still flare / sunburst pending E's image checks.
- 16:20 QA E: luna planning keeps the logo (8 s, designs 16.7 s); 6 real images on flare/sunburst all OK, quality >= gpt-image-2 (scratchpad/qa/E-models/cmp-*.jpg). Image models stay flare / sunburst. Sent to results agent: duplicate option names; app ai_service.dart models -> flare/sunburst + fallback.
- 16:25 client: ORDERS in the header opens an Orders page (images/142.jpg) -> new agent (45 min; owns OrdersMenu.tsx, App.tsx header/routes, OrderNow.tsx, order-now.css, order_entry.dart).
- 16:35 QA E round 1 done: all AI features OK on flare/sunburst/luna (about US$0.35), regression OK (sport 31/31, Studio A suites 67/67, admin settings 3/3, app preview, PHP 44); no project changes. Pending for E: test the results redesign when shipped. Old B-site customise test fails vs the 15:53 build -> results agent to confirm and update stubs.
- 16:40 user: loader emblem too small in the circle (images/143.jpg) -> new agent (25 min; loader CSS / Loader.tsx only; all Loader uses incl. HD mockup frame and the new results page).
- 16:55 results redesign shipped (aacb0fd6e7d2db1d2): layout matches 138.jpg. Follow-ups sent (option variety, single front view on option cards, Pricing text). QA E resumed to test the results page + links (My projects, admin pages after Admin.tsx overwrite, B-site sections).
- 17:05 loader emblem bigger (showroom.css only, --ring variable; emblem 65% of the ring; built).
- 17:15 Orders page done (/order-now, website + app). QA E asked to also check order detail, admin order board and the /order-now links.
- 17:25 results follow-ups shipped (VARIETY_RULES, front-view option cards 1024 medium, front_only print sheet, pricing text); PHP 148, flutter 92, Playwright 80. QA E allowed 1 real Generate (about $0.30) to verify variety.
- 17:30 user: add as many sports (images/144.jpg) -> tasks.md 9.79 (linked 9.13, 9.10, 9.18-9.49). New agent (90 min): about 20-25 sports, mapped to existing garments, tile photos + stage kit pictures + symbols (cap 50 images / about $3), website + app.
- 17:40 client: American football, golf, tennis, athletics, swimming, darts first (sent to the sports agent with default garments). questions.md item 2: agree the full sport list, the garment mapping, and which special garments to build first.
- 17:45 QA E: real Generate OK ($0.21; plan 21.5 s luna, renders 16-21 s flare medium; options differ: blue sash, black minimal, white panels; logo faithful; scratchpad/qa/E-models/cmp-generate.jpg). Stubbed: results 22/22, refine 10/10, latemockup 2/2, phone 5/5, orders 38/38, admin pages render. B-site.cjs updated. Next: app results screen. Package after the sports agent finishes (it edits catalog.php / Create.tsx now).
- 17:55 QA E: app results screen OK (offline samples, no key in the 8088 build); minor: 'Open in 3D …' cut at 390 px -> results agent (small edit, no build; sports agent builds at end).
- 18:00 QA E finished part 3: no real bugs (results 22/22, refine 10/10, latemockup 2/2, phone 5/5, orders + admin 38/38, app results OK). Real AI spend in QA E total about US$0.56 (10 images). Open: the app label fix (results agent), the app's models are built in (no public endpoint for Admin › Settings). Waiting for the sports agent, then checks + package + v2 push.
- 18:05 user answered: sport list as proposed, stand-ins OK, garment order my choice (tasks.md 9.80). Starting #1 pool/darts polo with real chest pocket.
- 18:10 app label fixed (ai_designer.dart LayoutBuilder: buttons stack under 420 px; tests at 360/390/600; flutter 95/95); no web build (sports agent builds). Started #1 garment agent (pool/darts polo with real pocket) ac04db942c799feb7, viewer-protocol.
- 18:20 client: 3DEEZI TEAM human designer service (tasks.md 9.81). Agents T1 (server/admin/designers, writes scratchpad/team-api.md) and T2 (customer site + app). Running also: sports agent ad76f80f45da7bc46, pocket polo ac04db942c799feb7. QA round after.
- 18:30 client yes: hoodies, jackets, varsity. Hoodie agent started (pull-over + zip-up, long sleeves; viewer-protocol with the pocket polo agent; catalog entries via me to the sports agent). Next queued: varsity jacket, other jackets (tasks.md 9.80 order updated).
- 18:35 T1 contract v1 at scratchpad/team-api.md (/api/v1/team, /api/v1/team-admin, TEAM-1001; no real subscriptions: team_allowances table with placeholder plans free/pro/premium/business). Passed to T2.
- 18:50 pocket polo done (viewer -13; touched OrderForm.tsx, Library.tsx, App.tsx garment ids, create_home.dart, app_controller.dart etc.). Not browser-tested: presets / YOUR DESIGN with it, export buttons, 8088 -> QA round. dyo_tiles_test fails on the sports agent's 'touch' icon -> sent to it.
- 19:10 sports done (29 categories; PHP 153, flutter 100). Open: order form long sport select (C area), concept preview wording, generic presets for new sports, hoodie garment pictures (sent to hoodie agent). Running: T1, T2, hoodies. QA round after all three.
- 19:20 T1: TEAM backend + admin/designer screens built; migration 2026_10_21_600000 applied to local database.sqlite (backup scratchpad/db-before-team.sqlite) -> ships with the next package (live gets the tables). Running full suite + admin render checks.
- 19:35 T1 done (PHP 164). Client questions for TEAM in questions.md item 2. Asked T2 for a Designer header link for is_designer users + real-endpoint checks.
- 19:55 hoodies done (viewer -14). QA F started (fix linked: OrderForm ziphoodie row, Library / AiStage labels, admin zone names, ASSIST knowledge, app equivalents; then test sports, pocket polo, hoodies; TEAM when T2 done).
- 20:30 T2 (TEAM customer site + app) done. QA F told to test TEAM too (+45 min). Then checks, pack -g, push to v2.
- 20:45 client answers for TEAM -> agent T3 (owns TEAM files; QA F logs TEAM bugs to qa/bugs-for-T3.md). questions.md now only Airwallex keys.
- 21:10 user OK: migration 700000 run on database.sqlite (backup C:\3deezi-archive\database-before-700000-1752.sqlite).
- 21:25 started J1 varsity jacket (9.45) and J2 track suit jacket (9.38), shared brief scratchpad\garment-brief.md, viewer protocol.
- J1 varsity PARKED (nothing built; plan in scratchpad\J1\RESUME.md; re-copy base/src from the current viewer before resuming). Push script ready: scratchpad\final-push-v2.sh (keeps database.sqlite out of git); pack: final-pack-1021g.sh.
- J2 track jacket PARKED (nothing built; plan in scratchpad\J2\RESUME.md, dev scripts J2\devbuild.mjs / shots.cjs; garment pictures are rendered from the viewer, no paid call). Re-copy J2 base/src from the current viewer before resuming.
- T3 done for server + website (PHP 175, vite built, no app files). Left for tomorrow: website bell, app parity in team.dart, isolated e2e. See tasks.md 9.82.
- QA F done: 12 linked bugs fixed (viewer -15), PHP 175, flutter all pass. Tomorrow: browser tests of the Studio per new garment, DYO paths, app 8088, the whole 3DEEZI TEAM list (not started). Order-form hoodie picture fixed by me (ART set).

## Resume tomorrow (2026-10-22)
1. 3DEEZI TEAM: the website header bell (NotificationBell.tsx over GET /notifications), the client's answers in the app (team.dart: incl. GST, due date, extra revision + pay, refund text; create_home tile wording; api_client teamRevise extra flag), isolated-DB end-to-end run and the admin click-through (tasks.md 9.82).
2. Browser QA not done today: Studio per new garment (pocket polo, hoodie, zip hoodie), DYO sport paths, the app 8088, the whole 3DEEZI TEAM list (QA F report: pending list).
3. J1 varsity jacket (scratchpad\J1\RESUME.md) and J2 track suit jacket (scratchpad\J2\RESUME.md): re-copy base/src from the current viewer (now 2026-10-20-15) first.
4. Then 9.80 order: spray / waterproof jackets, puffer jacket + vest, softshell, parka; 9.83 print designs on hoodies; golf quarter-zip, athletics, tennis, fightwear, American football, fishing, swimwear.
- QA F short round: Studio panel 0-px viewer fixed (showroom.css .dyo-body>.dyo-stage{grid-column:3}), new garments pass in the Studio (34 + 11 checks). Left: artwork drag onto hood / pocket, sponsor + neck label on new garments, app 8088 paths, TEAM list.
- 31 QA test accounts (*.qa.*@example.com, 1 project each) found in the real DB, from scripts registering on 8000 (studio-layout-save-test.cjs etc.); rule added to qa-rules.md; cleanup asked in questions.md item 2. DB mtime 18:30 = sessions/cache (SESSION_DRIVER=database), not test data.
- Live package -h made (panel fix + app TEAM parity; website part). Not pushed yet: push to v2 waits for the user's OK.
