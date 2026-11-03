# Resume notes

Updated 2026-11-02 19:05. Only what's needed to continue; history is in tasks.md and detail-checks.md.
- SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`; client pictures in SP's sibling folder images\NNN (latest 329).

## START HERE (2026-11-03)
1. Check that SP\viewer.lock and SP\vite.lock are free; run `dart analyze lib` (in D:\3d-app\3d-app) and `npx tsc --noEmit` (in website): both were clean at 18:53.
2. Ask the user whether they extracted tar 3deez-update-2026-11-02-d on live (if not, it is the only one needed). Live steps: migrate --force, optimize:clear, Ctrl+Shift+R.
3. Restart the model work (the user's rule: one fixer + one tester on models, plus separate agents for separate tasks; watch memory). Resume each agent with SendMessage, from its log:
   - Tester DT11 a1d108b7550d1d493 (SP\DT11\log.md). Test order: netball dress, hooded tracksuits, tees, bball tracksuit jacket (-218+); beanies (-222+); team hoodie (-223); rugby jerseys / shorts (-219); NFL varsity (-224). It renders itself, opens models fresh, ends with Verdict PASS / FAIL.
   - FN13 accf4dbe710501ba3 (SP\FN\FN13\log.md, PAUSE section): merge the bigger beanie logo, NFL Game jersey shoulders (1.58 -> 1.95), Game Kit top = game jersey, tops (compression muscles + notch, singlet racer-back, bibs cyan binding + open sides, club polo), soccer sleeves, bball jacket collar edge, tee sleeve flecks (LT2 thinks the new tee sleeve shape, not the lighting).
   - FX-R aa634a8747e960d3d (SP\FN\FX-R\log.md): round 3 is in its copy (rugby sleeves to 40%, kit socks, shorts widths, logo 2.1); render, then merge against base3.
   - FX-H afc573aa532704c3c (SP\FN\FX-H\log.md): NFL hoodie to .88 wide, hood lying back (swap the lining faces first), armpit ripples.
   - FX-V a0727b40c92ddf306 (SP\FN\FNV\log.md): render and measure the NFL varsity V collar at -224 (target .158 / .207 / .237 at 1 / 3 / 5%), stripes, top snap.
   - Shared fixer brief SP\FN\split-brief.md. ALWAYS merge with git merge-file against your own base (a whole-file copy once lost changes).
4. Blender (BL1 aaf8c3e27097e15c2, SP\BL1\log.md; Blender at D:\Blender\blender-4.2.23-windows-x64): realistic folds for the FINISHED models (shooting shirt first). The user's idea: the display form's arms crumple the sleeves, so leave the arms out of the collision (or use a smooth sleeve-shaped proxy) and use looser fabric. Send 2 big images (front + 3/4, before | after). I check them before the user sees them (truly new folds, no crumple, print aligned). BL1 found two causes: the form's right arm mesh was inside-out (crumpled the right sleeve), and self-collision pulls the shirt together so the hem rises. With the arms left out the test run stays in shape (not yet rendered). Nothing is merged; it lives only behind ?cloth=1 in BL1's copy.
5. Mobile home (Builder A a5a5461b873c70d9e, SP\HB1\log.md): round 4 done and pushed; waiting for the client's reply. Preview: http://192.168.18.113:8088 (node scripts\serve_preview.mjs --lan in D:\3d-app\3d-app).
6. After each finished batch: update task-done-today.md (clear yesterday's items first; Finished list only after a tester PASS), make a delta tar (copy SP\final-pack-1102d.sh with REF = the -d tar) and push v3 when the user says.

## State
- Local branch v6 (work uncommitted). GitHub v3 = 88fbf1b (2026-11-02 18:5x, viewer -224), v2 = ffd179c, main = 2d9b553.
- Live = https://testcaresortwork.co.in/3deez/ (the user extracts delta tars). Last tar: 3deez-update-2026-11-02-d.tar.gz (all of 11-02 since 10-30-d).
- Finished 3D models (tester PASS): skirts, shooting shirt, basketball shorts, caps, bucket hat, socks, 5 panel cap, netball dress, varsity jacket.
- Done today (11-02): design file uploads, Custom sport / garment, calmer lighting + edge highlight, AI designer open preview, 3DEEZI marks on every item, Studio Style (neck) + rugby collars + fits, Signage & Marquees, Headwear, Tracksuit item, mobile bubble home, garment list follows the sport.
- Drive D is tight (about 2 GB free): keep test output small.

## Waiting on the user
- questions.md 1: Airwallex demo keys. questions.md 2: a small "3" + 3DEEZI under the back collar on customers' own AI / artwork kits?
- The client's reply on the mobile home round 4.

## Rules
- Keep this file short; delete what's done. task-done-today.md is shown to the client (only direct tasks).
- Finished 3D models list: add a model ONLY when the tester passes it; move it back to Working on when the user raises a new point.
- Go ahead with my suggested answers; questions only for logins, keys, integrations or money.
- Never sign up / sign in / save on 8000 (use SP\iso-server.cjs). Push only when told. Live tars are code-only; never delete Manoj Caresort. Local DB migrations: back up, then run. No keys in notes; php -l every PHP edit; no new packages; never run flutter build web; simple words.
- SM1 paused 12:3x: Signage & Marquees done (website + app). Marquee orders show 'Quote required' until an admin sets a Marquee price in Admin > Pricing. Next (SP\SM1\log.md): rerun the app tests sync / flow / bubble_home / home_switcher one at a time; check the app on a phone; optional app Export. CP1 paused: cap / bucket hat logos fixed (logo positions reset on garment change, website + app); beanie + 5-panel built (-178); bucket hat too white not yet looked at; tester must re-test caps / hat and test the beanie / 5-panel.
- QUEUED (user 2026-11-02, images/310-311): 9.173 the Studio garment rail must show and select 'Tracksuit' for tracksuit tiles (now 'Track jacket'); website + app. Give to the next free agent; add to FN10's queue too (the basketball tracksuit blades / piping).
- 2026-11-02 12:29: second delta tar D:\3d-app\deploy-zips\3deez-update-2026-11-02-b.tar.gz (17 files, changes since 11-02-a: the V-neck fix, viewer -181) + v3 push 3583a9b. Next delta tar: copy SP final-pack-1102b.sh with REF = the -b tar. All agents paused.
- If the session ends before the back-neck fix: NK1 acef514e096b20775 has it (round back neckline, all neck styles); then tar -c with SP final-pack-1102c.sh (REF = -b tar) + v3 push.
- 15:0x RESUMED (limit reset; user: models = one fixer + one tester, finish today's tasks): NK1 back-neck round, then 9.173 tracksuit garment rail; FN10 model queue (socks top band, bucket hat white, tracksuit blades, ...); DT10 re-tests caps / hat, beanie, 5-panel, tracksuits; SM1 reruns app tests. Builder A free (bubble home waits for the client).
- 15:4x FN10 stopped (memory full); FN11 a214fbe1960ccad2b is the only model fixer now (queue in SP\FN\FN11\log.md: headwear, tracksuit leftovers, then FN10's queue). WB1 a92fecacc4a4b24c8: rebuilds the 8088 app preview and opens it to the phone on the LAN (bubble home).
- 16:xx FN11 stopped (memory full) after -191 (hoodie colours / looks). FN12 a7ca3f66914a0832f is the only model fixer now (queue in SP\FN\FN12\log.md: netball dress, tee silhouette, tracksuit hood / bball jacket / beanie stripes, hoodie hood, then varsity onward). User: only home + 1 fixer + 1 tester until the mobile home is done; then push v3 for the Android / iPhone build (kBubbleHomeDefault = true).
- 2026-11-02 17:xx: user confirmed the mobile home works; pushed v3 = 8e901c0 (kBubbleHomeDefault = true, viewer -194) for the Android / iPhone build. Builder A is still improving the tutorial demo (bigger glass, no overlapping text); push again when done.
- FN12 stopped (memory full) at -199. FN13 = the only model fixer now (queue in SP\FN\FN13\log.md, from FN12's HANDBACK). Tar 3deez-update-2026-11-02-c.tar.gz (16:29, viewer -196, all of today since 10-30-d) was given to the user for live; v3 = 53b85c9.
- DT10 stopped (it had started relying on the fixers' screenshots); DT11 a1d108b7550d1d493 is the model tester now: it renders every model itself, opened fresh from its tile, and ends each report with Verdict: PASS / FAIL. FN13 accf4dbe710501ba3 is the fixer. Netball dress PASSED (-198), on the Finished list.

- 2026-11-03 start: all six resumed (DT11 tester, FN13, FX-R, FX-H, FX-V, BL1); viewer -224, no locks, dart analyze clean; task-done-today.md cleared for today.
- 2026-11-03 user: LOW PRESSURE today: only FN13 (fixer) + DT11 (tester) on models, + BL1 as the one task worker (after Blender, give it non-model tasks). FX-R / FX-H / FX-V paused; FN13 takes their logs later.
- 11-03: FX-R / FX-H / FX-V all paused, nothing merged, no locks. Their next steps are in their logs (FX-R round 3: shorts logo scale undecided, b12 sleeve render unchecked; FX-H: hoodie .875 wide OK, hood lean, armpit ripples left). FN13 takes them after its own queue.
- 11-03: NEW TASK (images/330): bottom tab bar = same drag-and-release glass bubble effect as the home bubble. QUEUED for BL1 aaf8c3e27097e15c2 after its Blender work (user said so; Builder A was stopped before it changed anything). Spec SP/HB1/spec-tabbar.md. FN13 merged the beanie logo (-225); DT11 to test the beanies.
- 11-03: NEW TASK (images/331): Orders page "Preferred suppliers" card at the bottom; client asks for the bubble theme across the app. QUEUED for BL1 after the tab bar. Spec SP/HB1/spec-orders.md; questions.md 3.
- 11-03: NEW TASK (images/332): "Add logos, artwork or a reference" on the app order form does nothing; spec SP/HB1/spec-addlogo.md. images/333 = the client's Orders page design (added to spec-orders.md). Both QUEUED for BL1 (order: tab bar, add logo fix, Orders page).
- 11-03: BL1 Blender shooting shirt before|after images ready (SP/BL1/client/*.png). My check: no crumple, print aligned; but the body is wider/boxier, the sleeve ends and hem have ragged edges, and the folds are faint. Shown to the user. BL1 moved on to the app tasks (tab bar, add logo, Orders page).
- 11-03: NEW TASK (images/334): bubble theme on Home / Projects / Orders / Profile (client picture answers questions.md 3, removed). Spec SP/HB1/spec-alltheme.md. QUEUED for BL1 as task 4.
- 11-03: NEW TASK (images/335): bell overlaps the 3DEEZI logo on the bubble home; move it to the top-right like images/334. QUEUED for BL1 as task 5.
- 11-03: BL1 done task 1 (tab bar) + task 5 (bell), lib/screens/bubble_home.dart; tests pass. 8088 preview not rebuilt (needs flutter build web = user OK). Now task 2 add logo.
- 11-03: NEW TASK (images/336-338): order process (4-step form, upload sheet, confirmation review + approve, PDF / Excel). Spec SP/HB1/spec-orderflow.md. QUEUED for BL1 as task 6.
- 11-03: BL1 done task 2 (add logo on iPhone: iOS file types + photo/camera/files sheet, lib/screens/order_entry.dart). Now task 3 Orders page.
- 11-03 (images/339): client picture of the 3 order screens (Create form step 1, Upload order & artwork, My orders) added to SP/HB1/spec-orderflow.md for BL1 task 6.
- 11-03: BL1 done task 3 (Orders page app + website /order-now; supplier buttons preset Made by). Now task 4 theme, then task 6.
- 11-03: BL1 done task 4 (bubble theme 4 pages; filters All/AI/DYO/Approved, Saved addresses coming soon). Task 6 started; local migration OK (order version + approved by/at) -> live needs migrate --force.
- 11-03: BL1 task 6 server part done. NEW MIGRATION 2026_11_03_100000_add_confirmation_to_orders.php (version, approved_by, approved_at) -> live: php artisan migrate --force. Local DB backup SP/BL1/database.before-orderflow.sqlite. Confirmation PDF / Excel links; asked for colour names + a back picture.
- 11-03: BL1 task 6: colour names + back picture (Studio saves back on save) + website review step (PDF / Excel, approve wording) done. Left: 4-step bar + Create / Upload layouts (337/339), My orders search/filters/cards (web + app), app review. If BL1 runs out: resume from SP/BL1/log.md with a new agent.
- 11-03: FN13 handed back (memory full) at viewer -238. FN14 a64c71faf10f6f968 = the only model fixer now (queue from SP/FN/FN13/log.md HANDBACK; log SP/FN/FN14/log.md). Finished today: plain tee, hooded tracksuits, bball tracksuit, NFL beanie, beanie, rugby tee.
- 11-03 ~91% weekly limit (resets tomorrow afternoon). User: when BL1 finishes the order process -> push v3 (SP/final-push-v3.sh) + delta tar of today (copy SP/final-pack-1102d.sh, REF = deploy-zips/3deez-update-2026-11-02-d.tar.gz) as backup for the client. FN14 told: hoodie only, then HANDBACK. Live needs migrate --force (new orders migration).
- 11-03: BL1 finished task 6 (step bars). Deferred to tomorrow: one step per screen, per-garment artwork rows + Choose saved design, order sheet box inside Create order. Pack script SP/final-pack-1103a.sh ready (REF = 11-02-d); run after FN14 hoodie merge, then push v3.
- 11-03: Blender: user shared the shooting shirt before|after images with the client; no more Blender images needed for now (BL1 stopped).
- 11-03 11:5x: PUSHED v3 = 748adff (viewer -239, all of 11-03). Live tar deploy-zips/3deez-update-2026-11-03-a.tar.gz (43 files, since 11-02-d; next tar REF = this one). Live: extract, php artisan migrate --force, optimize:clear, Ctrl+Shift+R. FN14 stopped (HANDBACK SP/FN/FN14/log.md); DT11 to retest the team hoodie on -239 tomorrow. All agents stopped for the limit.
- 11-03: NEW TASK (images/340-341): blob-shaped bubble per client picture on Projects / Orders / Profile (now rounded rectangles). Spec SP/HB1/spec-blob.md. STARTED TODAY by BB1 a91f081a69961eabb (user: finish today). Also rebuild the 8088 preview after it (user OK needed for flutter build web).
- 11-03: user OK: after BB1 finishes -> flutter build web + serve 8088 on LAN (node scripts/serve_preview.mjs --lan) for phone + PC check.
- 11-03: then push v3 again (+ delta tar 11-03-b, REF = 11-03-a).
- 11-03: BB1 blob bubble done (lib/widgets/glass_bubble.dart, bubble_page.dart, screens/orders_tab.dart). flutter build web done; 8088 served on LAN. PUSHED v3 = 28a28fe. No new live tar (app-only change; 11-03-a is current for live).
- 11-03: BB1 scroll fix (Projects / Profile / My orders scroll whole page). Web rebuilt. PUSHED v3. Open: logo row stays fixed on those 3 pages (scrolls on Orders); pull-to-refresh lost on My orders.
