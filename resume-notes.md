# Resume notes

Updated 2026-10-22, at the pause. Finished work is in tasks.md, task-done-today.md and test-pending.md; this file keeps only what is needed to continue. SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`.

## Do first (next session)
**After the VS Code restart (2026-10-22, late afternoon):** AB finished (bell follow-up: 2 fixes, flutter 165/165; website shorts Patterns offers Shoulders / Sleeves = A's bug; SecondaryButton not tappable by screen readers). Resumed V1 (it held viewer.lock from 15:39: check the merge state first), U1 (lead time + Create Order Form fields), U5 (payment follow-up). New QA R af3d538b047c18a8a: pre-push bug hunt, testing only. Then: U2 follow-up, checks, tar, push to main and v2.
**User plan (2026-10-22, session at 41%):** finish the tasks in hand (AP1 app back buttons, U1 lead-time + Create Order Form fields, follow-ups U5 / AB / U2), then checks, a new tar and push to **main and v2**, then the client's "PlayStation game like graphics" (questions.md 2: step 1 = V1 running in its own viewer copy; step 2 = detailed garment shapes with folds, mannequin, reflections).
**Session 2026-10-22 afternoon:** stopped leftover test servers (AB, T5 iso servers and their node scripts). Wave 1 resumed: J2 (viewer regressions first), U3, U4, P1. Wave 2 when these finish: T5, V1, J1; then the follow-ups R2, U1, U5, AB, U2. Memory about 2 GB free, so 4 agents at a time.
1. **Viewer check:** a stale SP\viewer.lock from J2 (10:59) is still there. J2 merged the track jacket into the project viewer (VIEWER_VERSION 2026-10-20-19, both copies built and identical), but its regressions didn't finish:
   - SP\J2\layout-save2.log has 1 FAIL ("same print as when checked");
   - marks2.log is empty;
   - draw-v19: 94 / 117 / self-jersey unchanged, but self-tee / self-polo changed against draw-base (10:19, before the T4 / J1 / V1 merges).

   Resume J2 to finish or fix its regressions and release the lock.
2. **Resume the stopped agents** (SendMessage to the ID: "continue where you stopped; re-read files first; finish, test, build under the locks, report"). Keep to about 4–5 at once, because memory and disk are tight:
   - **J1 a93ef1c38c77861b7:** varsity jacket (9.45), viewer protocol.
   - **J2 a48e71f0043eb4ed7:** track suit jacket (9.38); also fix dyo_tiles_test "SHOW ALL GARMENTS" with J1.
   - **V1 a1e9dfa6e54432818:** 3D video-game quality (9.86): MSAA, lighting, fabric, floor, Khronos Neutral, bloom, device tier, ?quality=flat proof.
   - **U3 a3c47a20d026068fd:** REVIEW & APPROVE ORDER (9.89). Left:
     - render garmentsNote in the multi layout;
     - set PAYMENT_PAGE_LIVE = true;
     - pass showConfirm={false} to OrderFormRead in its dialog;
     - finish its app approve() helper (orders_app_test "Create Order Form" / "Review price choices" fail inside it).
   - **U4 aef867d80f791f9c2:** multi-garment review parts (9.89); left: priceRowsFromPayment in A$.
   - **T5 a81b408a2fc70fcd7:** 3DEEZI TEAM page redesign (9.91), website + app; prices from the API, app thousands separators.
   - **P1 ac7daddb3f7ea1a0b:** TEAM in Club A$49.95, Free A$100 (9.93).
   - **R2 a1942915fef83baee:** results page linked tests, then portrait AI designs (9.94; 2 real generations, about US$0.60, approved).
   - **U1 a8f79f5ebabd6b7fc:** upload-order linked tests, then the 4-week lead-time warning and the same fields on the Create Order Form (9.94).
   - **U5 a4743217b8d708e01:** payment page linked tests, plus Requirements.md section 3 and knowledge.md.
   - **AB af59dbbeb3a1953a6:** app bell linked tests.
   - **U2 a48c3383ffc300355 (AI order-form reader, done):** give it its linked-modules follow-up. The app web build after its work wasn't run; build after U3.
3. **Check, then package:**
   - check that the half-done features don't show broken: T5 TEAM page, P1 pricing, U3 review, V1 3D;
   - run a QA round;
   - then `bash SP/final-pack-1022m.sh` for package -l;
   - push to main only when the user says.

## Where things are
- **Live package:** `D:\3d-app\deploy-zips\3deez-update-2026-10-22-m.tar.gz` (15:24; includes the work finished today, the finished TEAM page, the track jacket and migration 2026_10_22_100000 (backup C:\3deezi-archive\database-before-100000-1523.sqlite); cumulative since ec79628; database with both live logins and the TEAM migrations; test accounts cleaned). Extract in the live website folder, then `php artisan optimize:clear`. Older packages are in C:\3deezi-archive.
- **GitHub:**
  - main = 72f0602, v2 = 5ca9715; both keep an older database.sqlite (a database push was refused by the permission check, so ask first);
  - local v6 is still ec79628 with the work uncommitted;
  - nothing from 2026-10-22 is on GitHub yet.
- **Scripts:**
  - pack: `bash SP/final-pack-1022m.sh` (sed the letter for later ones);
  - push: `bash SP/final-push-main.sh <msg>` (temp index, keeps the database out of git).
- **Database backups:** C:\3deezi-archive\database-before-700000-1752.sqlite and database-before-qa-cleanup-1839.sqlite.
- **Disk:** D: about 4 GB free. Old scratch folders are in C:\3deezi-archive\scratch-old-2026-10-21.
- **Shared briefs:**
  - SP\qa-rules.md (rules, "Never sign up on 8000", iso-server.cjs, `php -d upload_tmp_dir`);
  - SP\viewer-protocol.md;
  - SP\garment-brief.md;
  - SP\team-api.md;
  - client page specs: SP\U3\review-approve-spec.md, review-approve-multi-spec.md, SP\U5\payment-spec.md, SP\T5\team-page-spec.md.

## Pending after that, in order
1. tasks.md 9.92: the app's Assets screen should show designs saved on the server.
2. tasks.md 9.85: one price style ("A$") across the site.
3. Small items:
   - 4 test scripts that sign up through a proxy now refuse to run; point them at iso-server: app-layout-test.cjs, GR/app-gradient.cjs, ai-edit/site-test.cjs, ai-edit/debug-site2.cjs;
   - SP/team/e2e.cjs and stubs.cjs need the /notifications stub and the new TEAM form;
   - Studio Placement list: add Hood / Pocket;
   - the Y field stops at 1000 mm.
4. Garments in the 9.80 order: spray / waterproof jackets (9.39–9.41), puffer jacket and vest (9.42–9.43), softshell (9.44), parka (9.46), then golf quarter-zip, athletics, tennis, fightwear (9.47+), American football, fishing (9.18), swimwear.
5. 9.83: full print designs on hoodies (hood, kangaroo pocket, zip warp shapes; text across the hood seam looks bent).
6. Sports follow-ups: the long sport list in the order form, the concept preview wording, presets for new sports.
7. Later (user): 9.60a jersey / tee neck and 9.60b polo collar from design pictures (copies SP\B\src and SP\C\src); the design fee credited back on an order.
8. Waiting on the client: the Airwallex demo keys.

## How to ship
1. **Viewer work:** SP\viewer-protocol.md (own copy, viewer.lock, git merge-file, the next VIEWER_VERSION; regressions marks-baseline changed 0, layout-save-test, 94 / 117).
2. **Builds:** vite under SP\vite.lock; `flutter build web --release` under SP\flutter.lock.
3. **Checks:** php artisan test, tsc, flutter analyze, and flutter test on all test\*_test.dart except *_live_test.dart.
4. **Package, then push** when the user says.

## Rules to keep
- **Linked features keep working:** when an agent finishes, resume it to test the linked modules of its work (website + app); "worse" counts as broken.
- **Database:** never sign up, sign in or save on 8000; use iso-server.cjs. No test accounts in the real database.
- **Questions:** go ahead on my suggested answers, record them as "Decided" in questions.md and say so in chat; only keys and unapproved spend wait.
- **Restrictions:**
  - push only when told; never pull;
  - no new packages without asking; no APK;
  - paid AI calls only with OK;
  - php -l every PHP edit;
  - no keys or passwords in notes;
  - when a permission check blocks an action, don't work around it; ask the user.
