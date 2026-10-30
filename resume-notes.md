# Resume notes

Updated 2026-10-29 19:05. Only what's needed to continue.
- SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`; client pictures in SP's sibling folder images\NNN (latest 235)

## State
- Local folder on branch v6 (work uncommitted). GitHub v2 = ffd179c (2026-10-30 13:25). main = 2d9b553. v3: wait for the user's instructions.
- Live file: D:\3d-app\deploy-zips\3deez-update-2026-10-30-b.tar.gz (14:03, viewer -120: + skirt, cap, compression print r2; NOT pushed to v2 yet; v2 = 10-30-a). Live must run `php artisan migrate --force` (presets table; and the new ai_sessions table from 2026-10-30) + `php artisan optimize:clear`.
- Viewer about 2026-10-20-87.

## Running (2026-10-30 12:4x: task w83efahnp, run wf_fcef5062-75b; resume with resumeFromRunId wf_fcef5062-75b; testers read SP\tester-checklist.md)
- Workflow wf_d2dbde0a-e11 (stopped safely, no merge in progress; the skirt shape fixer had just copied CF1\paused into SP\FM\skirt\src, nothing merged yet) "finalize-models": one model at a time, in this order:
  1. Skirt (the closest to final; first merge CF1's finished fixes from SP\CF1\paused);
  2. Compression top;
  3. American Football jerseys;
  4. Cap;
  5. Socks;
  6. Football / Hockey jersey Swirl.
- Per model: a shape fixer and a print fixer in parallel, then an independent tester, for up to 3 rounds until the tester says FINAL. The wrap-up step adds FINAL models to the bottom list of task-done-today.md. Logs are in SP\FM\<model>.
- If it stopped (usage limit, VS Code restart): run Workflow with scriptPath C:\Users\Intel\.claude\projects\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\workflows\scripts\finalize-models-wf_d2dbde0a-e11.js and resumeFromRunId wf_d2dbde0a-e11. Finished steps are reused.
- Keep at most 3-4 agents at once: memory and drive D are tight. Close leftover test browsers after restarts. Replies to the user: one short line.



## MONDAY START HERE (paused 2026-10-30 19:06, the user said resume Monday)
- Live tar ready: D:\3d-app\deploy-zips\3deez-update-2026-10-30-d.tar.gz (19:05, viewer -166, code-only; tile tests 8 passed, php -l clean). Live: migrate --force + optimize:clear.
- NOT pushed: the user wants this pushed to v3 (SP final-push-v3.sh, parents v3 + v2, no force). Ask first; check that lib/ compiles (the bubble-home builders were pausing).
- Bubble home 9.163: workflow wf_fefd7c4e-090 (builders A a5a5461b873c70d9e, B a38ce10bb2ac64197 told to pause compiling, with the classic home as the DEFAULT until tested). Stop or resume it; then the tester. Log SP\HB1\log.md.
- Lanes workflow wf_2acb23fb-607 stopped (testers only, nothing changed): resume with resumeFromRunId to test rugby league/union + shorts, football jersey + full kit, NFL jerseys + compression, singlet + bibs + polo.
- DT8 ac7a8aa8f8aa553f1 (tester) paused: see SP\DT8\log.md. FAIL lists open: shooting shirt (spikes 5-12% off, wordmark 5% low), netball dress (ND2 ab9deec6b5a231533 has the 5-point plan in its log; question: the light blue ends at 77% in the picture vs our 92%), socks -164 (to analyse).
- FN9 acbbb8e91633224ad: basketball shorts outline (hips bulge; one straight line from band to hem), plan in SP\FN\FN9\log.md, not merged. Basketball shorts are NOT on the Finished list.
- FN8 a6ed246e45dc5961f: Rugby Polo half done in SP\FN\FN8\src2, not merged. Track jacket merged (-162), waits for DT8.
- FN5 af3b7fc876015e18d: hoodie hood merged (-165), waits for DT8; Varsity not started (or barely).
- Finished list (tester passed): skirts, cap, bucket hat. Everything else waits for the tester.

## Tester gate (user 2026-10-30): DT8 ac7a8aa8f8aa553f1 is the standing tester (SP\DT8\user-points.md + SP\tester-checklist.md). A model goes on the Finished list ONLY after DT8 PASS; route DT8 FAILs to the fixer, then back to DT8. FN7 ae143389459dfe1e8 = rugby socks split toe (done -158). Active 18:1x: DT8 tester, FN5 af3b7fc876015e18d (shooting shirt FAIL + tee/raglan), ND2 ab9deec6b5a231533 (netball side-view light blue), FN8 a6ed246e45dc5961f (hoodie, track jacket, varsity, rugby polo). FN3, FN4, FN6 stopped (context full).
- 2026-10-30 18:5x: mobile home 9.163 workflow wf_fefd7c4e-090 (task wea4tmb7y; script C:\Users\Intel\.claude\projects\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\workflows\scripts\bubble-home-wf_fefd7c4e-090.js; resume with resumeFromRunId). Also running: FN9 acbbb8e91633224ad (basketball shorts straight outline), ND2 (netball DT8 FAIL list), FN5 (hood, then varsity), FN8 (rugby polo), DT8 (tester). Basketball shorts are OFF the Finished list until DT8 re-passes the outline.
- 2026-10-30 18:4x: workflow wf_2acb23fb-607 (task wtadr6y1u) runs 4 tester+fixer lanes: A rugby league/union + shorts, B football jersey + full kit, C American Football jerseys + compression top, D singlet + bibs + club polo/darts. Its wrap-up adds PASSed models to the Finished list. Resume: Workflow scriptPath C:\Users\Intel\.claude\projects\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\workflows\scripts\finish-models-lanes-wf_2acb23fb-607.js with resumeFromRunId wf_2acb23fb-607. DT8 keeps: basketball shorts (PASS 18:4x), shooting shirt, tees, netball dress, socks, new hoodie/track/varsity/rugby polo, skirt/cap/hat re-check. Tar 3deez-update-2026-10-30-c.tar.gz made 18:29 (viewer -159/-160), NOT pushed; the user said wait, ask again about the v2 push.
## Running now (2026-10-30 17:xx): FN6 ab3a8261a4778425b (replaced FN3, context full) + FN4 af5fea03aaa563d82 + FN5 af3b7fc876015e18d work (FN2 a5f3ea1ea1c5408a8 = football jersey tribal design + collar) SP\FN\queue.md (brief SP\FNrief.md): compression top, socks, NFL jerseys, rugby league (tile picture, q6 decided), shooting shirt, basketball shorts, shorts, bibs. Done today: netball dress -122, skirt -118, cap -119, bucket hat -121, football jersey maze -124. To resume: send each the queue again.

## Earlier today (2026-10-30 15:05)
- HB1 af16f69fe67694526 PAUSED (client voice: "don't start anything until you think"; questions.md 8): mobile Home glass-bubble prototype (9.163, spec SP\HB1\spec.md).
- ND2 ab9deec6b5a231533: netball outer-strip diagonal colour segments (9.161). FN2 a5f3ea1ea1c5408a8: football jersey shoulder design to the neck (9.162).
- The finalize-models workflow ended at the limit (compression top round 2 onward not done); restart it only after these finish (max 4 agents).
- Waiting on the user: AI designer preview, cap at about 950 px so the background art shows (asked 2026-10-30).
- FN1 ae84e634974305f18: finishes the skirt, then the bucket hat; FN2 a5f3ea1ea1c5408a8 finishes the cap; simply (flat paint, about 25 min each; user: "finish quickly"). Log SP\FN1\log.md. When it finishes the cap, take the cap out of the workflow's MODELS before the workflow reaches it.

## Open items by model (full lists in D:\3d-app\detail-checks.md)
- **Skirt:**
  - neutral black instead of warm brown;
  - broad drape folds;
  - no display-form thigh stubs under the hem.
  All three are finished in SP\CF1\paused; the workflow merges them first.
- **Compression top:**
  - the arms stand too far out and are too long; the hem must be level with the cuffs;
  - the front between the side panels is 25-35% too narrow;
  - the panels are thin just above the hem (15 vs 28 px);
  - the sleeve stripes should widen from 11 to 22 px toward the cuff.
- **American Football jerseys:**
  - Practice Jersey: the print (86, wordmark, "3") must be solid over the mesh;
  - Game Jersey: the fabric dots show through the white 86;
  - the shoulder numbers may be "8"s (the 86): check the picture first;
  - the length waits for the user (questions.md 4).
- **Cap:** the brim must be curved like the pictures.
- **Socks:**
  - the toe line is still wrong (user 2026-10-29, images/236 client vs 237 ours): the client's thin cyan line runs ACROSS THE TOP of the forefoot, near the toes; ours is a pale curved band round the toe tip;
  - each tile needs its own layout:
    - Football / Footy / Hockey: two hoops, a full cyan toe, no ankle lines;
    - Game Socks: two wide hoops and a bigger "3";
    - Rugby: a flat cyan "3";
  - the top of the foot looks grey;
  - CF1's toe / ankle folds are finished in SP\CF1\paused, not merged.
- **Football / Hockey jersey Swirl** (merged at -87, the design now sits on the shoulders up to the neck):
  - the maze beside the collar should be brighter and denser;
  - check the Full kit's maze against its picture.
- **Netball dress: FINAL by the user 2026-10-30 13:25 (viewer -117, flat painted strips; no more testing on it).** Older: (2026-10-30 13:xx): viewer -113 merged by ND1 (black hip edges, bib black, creases both sides). ND2 ab9deec6b5a231533 now finishes the strips (narrower, saturated cyan / azure / royal, ribbon shading, no teal lines, side view); then DT6 re-tests; then push v2 + tar.** Older: NOT final (user 2026-10-30, images/243-245): big vertical folds below the waist missing; 3DEEZI logo must sit at the bust (ours too high). ND1 fixing, DT6 re-tests.** Earlier notes: ND1 a6bb230d2b8dc09cb merged 2026-10-30 (viewer -88, tile opens the picture look, brighter cyan); hem corners fixed (-91); DT6 ae5286b7978e8d925 detail-tests it, then the Rugby League jersey. Its working copy is close to the picture. Left: the hem corners hang in points at the side seams, and the cyan is a little dark. Log SP\WF1\netball-dress\log.md, side-by-side sbs-r6.png.
- **Later** (from the testers):
  - the jersey (football / hockey) wing collar with a V placket and a white inside, and side panels that show from the front;
  - the Full kit's crew neck, cyan blades on the shorts, and socks;
  - the Game Kit needs game pants with a belt and knee pads (COMING SOON plan item 12), socks and a front 86.

## Builder queue (one at a time, after the models above; each has a log)
1. (RF1 a5665e02d10f77ca7: shipped -90 the picture's shoulder stripes / claws / flames, "3DEEZI" under the crest, look 'rugbyLeague'; now: all-blue 3 crest on the rugby tiles + kit shorts check) Rugby League jersey: SP\WF1\rugby-league-jersey\log.md.
2. Shooting shirt: SP\WF1\shooting-shirt\log.md.
3. Basketball shorts: SP\WF1\basketball-shorts\log.md.
4. Shorts: SP\WF1\shorts\log.md.
5. Bucket hat: an unchecked start in SP\GM4\hat.
6. Bibs.
7. The detail pass on the other existing garments: rugby league kit, singlet, tee, polo, raglan, hoodie, track jacket, varsity, full kit.
8. COMING SOON plan items 9 onwards: SP\GM1\plan.md.

Prompts for these: the workflow script garment-detail-pass-wf_e3c2c5e1-acb.js (buildPrompt / detailPrompt).

## Waiting on the user / client
- The Football jersey length (questions.md 4).
- Buying professional garment models; the HQ jersey as default; Airwallex keys; supplier prices; live mail settings.

## Rules
- Keep this file short; delete what's done. task-done-today.md is shown to the client (only direct tasks).
- task-done-today.md bottom section "Finished 3D models (built, tested and final)": add a model ONLY when the detail tester passes it with no open differences.
- Never start my own suggestions without the user's yes. Finished fixes are merged at once; one-model-at-a-time only decides what starts next.
- GM1\same.cjs gives false differences on a busy machine: re-run before trusting it.
- Never sign up / sign in / save on 8000 (use SP\iso-server.cjs). Push only when told. Live tars are code-only; never delete Manoj Caresort. Local DB migrations: back up, then run. No keys in notes; php -l every PHP edit; no new packages; simple words.
