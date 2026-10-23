# Resume notes

Updated 2026-10-23 13:10 (checkpoint at the session limit). Only what's needed to continue; finished work lives in tasks.md, task-done-today.md and test-pending.md (test steps). SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`. Client pictures: `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\images\NNN.jpg/png`.

## After a restart
1. Stop leftover test servers and browsers (php not on :8000, node iso scripts, playwright chrome / msedge, flutter_tester); check SP\*.lock.
2. No agent is running. Start the next wave from "Next" with new agents.

## Running agents
None. All finished or stopped at a checkpoint by 13:05 on 2026-10-23. Last IDs:
- QA U afc76b65e6cebc31f (bug hunt; stopped at a checkpoint, see Next 1)
- V2 ae8e48ab7079b58fd (3D step 2; checkpoint SP\V2\checkpoint.md)

## Next
1. Finish QA U's checks from "Resume from here" in SP\QAU\results.md:
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
4. **Test-setup bug:** uploads made on iso servers land in the real storage folder, under storage/app/private/*/121. User 121 doesn't exist in the real database; the config cache probably keeps the real path. Fix SP\iso-server.cjs (e.g. clear the config cache in the copy or set the disk root) and delete those orphan files before the next tar. Tars -o and -p carried them; they're harmless but junk.
5. Waiting on the client: the Airwallex demo keys; confirming the plan values; review of 3D step 2.

## Where things are
- **Live package:** `D:\3d-app\deploy-zips\3deez-update-2026-10-23-p.tar.gz` (2026-10-23 13:01).
  - Contains everything done up to then, with the old 3D look and a database with both live logins.
  - Extract it in the live website folder (https://testcaresortwork.co.in/3deez/), then run `php artisan optimize:clear`.
  - Older packages: -o is in deploy-zips; the rest are in C:\3deezi-archive.
- **GitHub:** main = 2d9b553; v2 = pushed 2026-10-23 (see MEMORY branches). database.sqlite stays out of git. Local v6 = ec79628 with the work uncommitted.
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
- **Notes files:** after every task, update tasks.md, task-done-today.md (only what's new and done, short lines, no "client", no testing rounds) and test-pending.md (its test steps, one section per task between horizontal lines).
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
