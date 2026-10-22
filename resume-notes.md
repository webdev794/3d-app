# Resume notes

Updated 2026-10-22, late evening (session at 90%, paused). Finished work is in tasks.md, task-done-today.md and test-pending.md; this file keeps only what is needed to continue. SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`. Client pictures are in `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\images\` (NNN.jpg / .png).

## PAUSED 2026-10-22 late evening (session limit 90%)
- All of today's tasks are finished and recorded, except G3's follow-up (see its row). Package -o made (17:48) and main pushed at the pause (see "Where things are"); v2 was not pushed this time (user asked for main).
- To resume: read this file, stop leftover test servers / browsers, check SP\*.lock, then resume G3 if its follow-up is not finished, then the "Next" list.

## Running agents: resume each after a restart
Send the agent its ID with: "continue where you stopped; re-read files first; finish, test, build under the locks, report". If an agent can't be resumed (new session), start a new agent with the same brief: the spec files below hold everything. Before resuming, stop leftover test servers and browsers (php not on :8000, node iso scripts, playwright msedge) and check SP\*.lock.

| Agent | Task | Brief / spec | Notes |
|---|---|---|---|
| G3 a264d377d5229ab8d | 9.99 garments per sport: DONE incl. follow-up (ASSIST fix, 5 more pictures, about US$0.48 of US$2 in total). LEFT: fix the stubbed AI replies in SP\G3\garments-e2e.cjs and re-run the AI designer → Studio check; app shots at 360 / 430 (SP\G3pp-shot.cjs) | SP\G3\sport-garments-spec.md, images/157.jpg, 160.jpg | |

## Next, after these
1. Each finished agent gets its linked-modules follow-up (rule), then a QA round (as QA R did), then checks, a tar (`bash SP/final-pack-1022o.sh` with the next letter) and a push to **main and v2** (`bash SP/final-push-main.sh <msg>` and `SP/final-push-v2.sh <msg>`), only when the user says.
2. **PlayStation graphics, step 2** (questions.md 2): detailed garment shapes with folds and drape, a better mannequin, reflections. Step 1 is done (viewer -20, before / after in SP\V1\shots\sbs-*.jpg). My suggestion to the user: start with the jersey only, so the client can judge it. Waiting for the user's go.

## Where things are
- **Live package:** `D:\3d-app\deploy-zips\3deez-update-2026-10-22-o.tar.gz` (17:48; all of 2026-10-22's work, viewer 2026-10-20-20, database with both live logins and every migration). Extract in the live website folder, then `php artisan optimize:clear`. Older packages are in C:\3deezi-archive.
- **GitHub:** main = 7ac1997, v2 = 7ce95ae (both 2026-10-22 16:25; database.sqlite kept out of git, since a database push was refused by the permission check). Local v6 is still ec79628 with the work uncommitted.
- **Database backups:** C:\3deezi-archive\database-before-700000-1752.sqlite, database-before-qa-cleanup-1839.sqlite and database-before-100000-1523.sqlite.
- **Disk:** D: about 2–4 GB free; clean old temp folders (playwright_*, flutter_tools.*) and leftover SP\iso-* copies when it gets low.
- **Shared briefs:**
  - SP\qa-rules.md (rules, "Never sign up on 8000", iso-server.cjs, which now sets upload_tmp_dir);
  - SP\viewer-protocol.md;
  - SP\garment-brief.md;
  - SP\team-api.md;
  - client page specs: SP\U3\review-approve-spec.md, SP\U3\review-approve-multi-spec.md, SP\U5\payment-spec.md, SP\T5\team-page-spec.md, SP\G3\sport-garments-spec.md.

## Pending, in order (after the running agents)
1. tasks.md 9.97 small follow-ups:
   - the "Delivery to" dropdown on Pick up;
   - website shorts Patterns offers Shoulders / Sleeves;
   - app SecondaryButton not tappable by screen readers;
   - "Order Received" shows twice in the app;
   - no prices yet for the new garments (Requirements.md).
2. tasks.md 9.92: the app's Assets screen should show designs saved on the server.
3. tasks.md 9.85: one price style ("A$") across the site, including notification texts.
4. Small items:
   - 4 proxy test scripts need iso-server (app-layout-test.cjs, GR/app-gradient.cjs, ai-edit/site-test.cjs, ai-edit/debug-site2.cjs);
   - SP/team/e2e.cjs needs the /notifications stub;
   - Studio Placement list: add Hood / Pocket;
   - the Y field stops at 1000 mm.
5. Garments in the 9.80 order: spray / waterproof jackets (9.39–9.41), puffer jacket and vest (9.42–9.43), softshell (9.44), parka (9.46), then golf quarter-zip, athletics, tennis, fightwear (9.47+), American football, fishing (9.18), swimwear; plus netball dress / skirt / bibs, track pants, socks, caps, bucket hat (from 9.99).
6. 9.83: full print designs on hoodies, varsity and track jacket.
7. Later (user): 9.60a jersey / tee neck and 9.60b polo collar from design pictures; the design fee credited back on an order.
8. Waiting on the client: the Airwallex demo keys; confirming the plan values (Club 15 a month then A$49.95, Pro Studio 30 then A$49, Club 5 open at once).

## How to ship
1. **Viewer work:** SP\viewer-protocol.md (own copy, viewer.lock, git merge-file, the next VIEWER_VERSION; regressions run **one at a time**: marks-baseline changed 0, layout-save-test, 94 / 117).
2. **Builds:** vite under SP\vite.lock; `flutter build web --release` under SP\flutter.lock.
3. **Checks:** php artisan test, tsc, flutter analyze, and flutter test on all test\*_test.dart except *_live_test.dart (`-j 1` if memory is low).
4. **Package, then push** when the user says.

## Rules to keep
- **Record new requests at once:** every new client or user request goes straight into tasks.md (with the picture path and a spec file if it's a design) and into the running-agents table above, so nothing depends on the user reminding me after a restart.
- **Linked features keep working:** when an agent finishes, resume it to test the linked modules of its work (website + app); "worse" counts as broken.
- **Database:** never sign up, sign in or save on 8000; use iso-server.cjs. No test accounts in the real database.
- **Questions:** go ahead on my suggested answers and say so in chat; only keys and unapproved spend wait. Small spends up to about US$2 are fine; report them afterwards.
- **Restrictions:**
  - push only when told; never pull;
  - no new packages without asking; no APK;
  - php -l every PHP edit;
  - no keys or passwords in notes;
  - when a permission check blocks an action, don't work around it; ask the user.
