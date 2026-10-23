# Resume notes

Updated 2026-10-23 13:10 (checkpoint at the session limit). Only what's needed to continue; finished work lives in tasks.md, task-done-today.md and test-pending.md (test steps). SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`. Client pictures: `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\images\NNN.jpg/png`.

## After a restart
1. Stop leftover test servers and browsers (php not on :8000, node iso scripts, playwright chrome / msedge, flutter_tester); check SP\*.lock.
2. Resume each running agent below: SendMessage to its ID with "continue where you stopped; re-read files first; finish, test linked modules, build under the locks, report". In a new session where the IDs don't work, start a new agent with the task from tasks.md.

## Running agents (started 2026-10-23 about 13:40)
| Agent | Task | Notes |
|---|---|---|

## Next
0. **Checkpoint 2026-10-23 at 85%.** Done: V2 (viewer -23: switch, touch-ups, hero look; showcase pictures in D:\3d-app\deploy-zips\3d-showcase\), W1, W3, A1, A2. W2 was told to stop at a safe point.
   - Then run `bash SP/final-pack-1023q.sh` from the website folder: the CODE-ONLY evening tar 3deez-update-2026-10-23-q.tar.gz, with no database or uploads and the new look behind ?look=2.
   - Then push to v2 with SP/final-push-v2.sh and a new message file.
   - **Open question (questions.md 2): should the new 3D look be the default on the test site?** Making it the default (LOOK_DEFAULT '2' in viewer/src/main.js + VIEWER_VERSION -24 + node viewer/build.mjs) was BLOCKED by the permission check ("Production Deploy"), so it was reverted; it waits for the user's clear yes.
   - **User 2026-10-23 at 85%: "stop the testing part, we will do it in end, once main 3D task finalized."** No QA rounds until the 3D task is final. Then one full test round covering everything below.
   - Still to check later, when the machine is quiet: the app preview 30-visit check (V2 couldn't finish it under load); a QA round on today's last changes.
   - Paused: 9.113 American Football own 3D jersey / compression top.
   - Website bug for later (from V2): on phones (≤600 px) the Studio's Save button is hidden by CSS dated 2026-10-19 (W2 may have fixed it; see its report).
1. QA U's unfinished checks ("Resume from here" in SP\QAU\results.md), for that QA round:
   - re-sweep Admin Pricing on phones;
   - the app preview sweep (QAU\iso-app.cjs, app-sweep.cjs);
   - full flutter test -j 1 (expect 205);
   - the priced order's pay step and invoice PDF;
   - TEAM PAY NOW;
   - the 360 px AI results step;
   - php artisan test + tsc.
2. **3D step 2 (viewer 2026-10-20-21) is in the tree and on v2 for the client; it is NOT live.**
   - Until the client approves, every live tar must carry the old viewer. SP/final-pack-1023p.sh swaps in SP\V2\backup; copy it with the next letter.
   - When approved: VIEWER_VERSION → 2026-10-20-22, pack normally, and add the ASSIST note from SP\V2\checkpoint.md.
   - Its small follow-ups are in that checkpoint.
3. Pending list, in order:
   - tasks.md 9.97 small follow-ups (now includes QA U's open bugs: a design's name on other garments' order rows, requireAuth timing, ASSIST over the Pro Studio button);
   - 9.92 app Assets from the server;
   - 9.85 one price style "A$";
   - 9.80 garment build list;
   - 9.83 print designs on hoodies / jackets;
   - later 9.60a / 9.60b.
4. Test-setup bug FIXED 2026-10-23: `artisan serve` didn't pass LARAVEL_STORAGE_PATH to its web process, so iso uploads landed in the real storage. iso-server.cjs now runs `php -S` with variables_order=EGPCS and refuses to start unless storage is the copy. The leaked folders (assets/121, 123, order-files/121, 122; ids the real database never issued) were moved to C:\3deezi-archive\iso-leak-uploads-2026-10-23.
5. Waiting on the client: the Airwallex demo keys; confirming the plan values; review of 3D step 2.
6. **Live tars are code-only from now on** (no database.sqlite, no storage/app), so the live database keeps its own accounts. **Manoj Caresort's live admin account must never be deleted** (user 2026-10-23).
   - The users cleanup happens on the live site with the "Remove test accounts" button (W3, tasks.md 9.111).
   - New tables or columns then need `php artisan migrate --force` on live: tell the user when a tar adds a migration. None has been added since -o.

## Where things are
- **Live package:** `D:\3d-app\deploy-zips\3deez-update-2026-10-23-p2.tar.gz`: the same code as -p (2026-10-23 13:01) WITHOUT database.sqlite and storage/app, so Manoj Caresort's live account stays. Do not use -p, which carries our database.
  - Contains everything done up to then, with the old 3D look. No new migrations since -o, so nothing to run on live.
  - Extract it in the live website folder (https://testcaresortwork.co.in/3deez/), then run `php artisan optimize:clear`.
  - Older packages: -o is in deploy-zips; the rest are in C:\3deezi-archive.
- **GitHub:** main = 2d9b553; v2 = 6a5e0f2 (pushed 2026-10-23 13:10, includes 3D step 2). database.sqlite stays out of git. Local v6 = ec79628 with the work uncommitted.
- **Scripts:** SP\final-pack-1023p.sh (pack, with the old-viewer swap), SP\final-push-main.sh and SP\final-push-v2.sh (push via a temp index).
- **Briefs:**
  - rules: SP\qa-rules.md (locks wait 15 min), SP\viewer-protocol.md, SP\garment-brief.md, SP\team-api.md;
  - specs: SP\U3\*-spec.md, SP\U5\payment-spec.md, SP\T5\team-page-spec.md, SP\G3\sport-garments-spec.md, SP\M1\app-home-spec.md, SP\M2\app-orders-spec.md;
  - results: SP\QAU\results.md and SP\<agent>\linked-results.md.
- **Database backups:** C:\3deezi-archive\database-before-*.sqlite.
- **Disk and memory:**
  - D: has 2–4 GB free; clean playwright_* / flutter_tools.* temp folders and SP\iso-* copies when low.
  - Memory is tight: one flutter run at a time (hold flutter.lock for tests too), one browser per agent.

## Rules
- **Keep this file current:** update it before and after every task; delete what's done.
- **Notes files:** after every task, update tasks.md, task-done-today.md and test-pending.md.
  - task-done-today.md is SHOWN TO THE CLIENT: list only tasks the user gave directly, short lines, no "client". Leave out bug fixes from our own testing, our own improvements and testing rounds.
  - test-pending.md: each task's test steps, one section per task between horizontal lines.
- **Testing:**
  - every task gets its linked modules tested (website + app);
  - a fresh QA round runs before every tar or push;
  - testing never signs up on 8000 (use iso-server.cjs).
- **Pushing:** only when told; never pull.
- **Restrictions:**
  - no new packages; no APK;
  - php -l on every PHP edit;
  - no keys in notes;
  - small AI spends up to about US$2 are OK, reported afterwards;
  - blocked actions go to the user.
