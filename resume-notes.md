# Resume notes

Updated 2026-10-26 16:40. Only what's needed to continue; finished work is in tasks.md, task-done-today.md and test-pending.md.
- SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`
- Client pictures: `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\images\NNN.jpg/png`

## After a restart
1. Stop leftover test servers and browsers (php not on :8000, node iso scripts, playwright chrome / msedge, flutter_tester); check SP\*.lock.
2. Resume the running agents below with SendMessage ("continue; safe steps; report"). If an ID doesn't work, start a new agent with the task from tasks.md 9.128.

## Running (started 2026-10-26 about 16:40)
| Agent | Task | Notes |
|---|---|---|
| (done) PC1 ae12aed1b615bb420 | 9.128 C: "See it on a player" (photoreal athlete wearing the exact kit; website + app; Studio and AI results) | Up to about US$1 of AI checks |
| (done) MK1 ab29b5b3d82863329 | 9.128 A: "Mockup" studio product pictures (front / back / 3/4, Yellow Images standard; website + app) | Up to about US$1; shares AI files with PC1 |

9.128 B (bought / artist garment models) is ON HOLD: the client may buy models. Check each link before purchase (GLB/FBX, clean UVs, under 100k triangles, app/web licence).

## State (2026-10-26 17:30)
- All tasks through 9.128 A and C are DONE. 9.128 B (bought models) is ON HOLD.
- 9.129 and 9.130 DONE. Latest live file: D:/3d-app/deploy-zips/3deez-update-2026-10-26-h.tar.gz (18:51, viewer -30 with the HQ jersey behind ?hq=1, includes hq-jersey.js). NOT pushed (v2 = ea00724 = -e). Next pack: copy SP/final-pack-1026h.sh with letter i. No agent running.
- RUNNING: HQ1 a86778d06f5027069 (tasks.md 9.130): the client's professional soccer jersey model (C:/Users/Intel/Downloads/soccer-green-jersey-player-08) into our viewer as a high-quality jersey behind a flag; work copy SP/HQ1/.
- SPLIT for speed (user 2026-10-26 ~17:58, "about half hour"): HQ1 a86778d06f5027069 = lead (load + optimise the GLB, ?hq=1 flag, integrate); HQ2 DONE: ?hq=1 phone frame time equals the old jersey (about 147 vs 143 ms at 4x CPU), hq-jersey.js is 1.43 MB (0.99 MB gzip), save/reopen OK, the old jersey is unaffected; it found arm stubs below the sleeves and a lumpy neck lid hiding the size label (sent to HQ1); HQ3 DONE: the AI print sheet works on ?hq=1 (the crash was HQ1's test script; fix in SP/HQ3/deliver). Timebox about 25 min; HQ1 parks cleanly if short (SP/HQ1/checkpoint.md).
- Also running (small, 18:40): FX1 DONE: the chest badge now reads "3D" in Mockup / See it on a player (prompt fix, US$0.07). Follow-up: send whether the chest crest is the default 3D badge or a club logo, and add the "3D" line only for the default badge (else a club shield with letters could get "3D"). FX2 DONE: pattern_areas_test now checks the app's 12 garments against catalog.php (the dress included); passes.
- Latest live file: D:\3d-app\deploy-zips\3deez-update-2026-10-26-f.tar.gz (17:27; includes Mockup and See it on a player). NOT pushed yet: v2 = ea00724, the -e file.
- Next pack: copy SP/final-pack-1026f.sh with letter g.
- Small open items:
  - test/pattern_areas_test.dart expects 11 garments but there are now 12 (update the test);
  - the tiny "3D" badge reads "30" in AI photos;
  - the Tennis dress tile still uses the singlet;
  - no "Dress" order line;
  - ProjectRequest may refuse pocketpolo layouts (422).

## Next, in order
1. **FIRST: tasks.md 9.126 (user 2026-10-26; spec SP\AI3D\fix-spec.md, pictures images/181–183.png).** Open in 3D gaps:
   - (1) the soccer jersey's 3D isn't 100% like the picture (the back reads RANVERS);
   - (2) netball needs a women's fitted dress shape and a female mannequin;
   - (3) the hoodie, jackets, shorts and full kit must carry the AI picture's real pattern, not simple stripes.

   Split across agents: (1) + (3) one agent, (2) a 3D garment agent (garment-brief.md + viewer-protocol.md). AI3D ad0d30b5e059000b3 knows this code.
2. **One full test round:**
   - the app preview 30-visit check;
   - QA U's leftovers (SP\QAU\results.md);
   - the admin card overflow;
   - the website plurals;
   - update SP\studio-layout-test.cjs (two upload boxes);
   - the flaky website tests (AiApiTest, RemoveTestAccountsTest…);
   - update SP\aid-results-test.cjs (it waits for the old AI results layout);
   - the AI crest crop on hoodies was wrong once (the instruction was made clearer but not re-tested).
3. **Small leftovers:**
   - app order form 2XL/3XL/4XL labels cut at phone width;
   - app toasts over an open Studio panel;
   - Assist text says TEAM sits between Orders and Dashboard;
   - app Assist link to Approved opens the All tab.
4. **Later:**
   - 3D models for the COMING SOON garments (9.80; 9.113 American Football jersey / compression top);
   - 9.92 app Assets from the server;
   - 9.83 print designs on hoodies / jackets;
   - 9.60a / 9.60b.
5. **Waiting on the client:** the Airwallex keys (questions.md 1); his supplier listing prices (now A$49 / A$490); the live email settings (Requirements.md, for the Forgot password codes).

## Where things are
- **Live site:** https://testcaresortwork.co.in/3deez/.
  - **Live tars are CODE-ONLY** (no database.sqlite, no storage/app), so the live accounts stay. **Never delete Manoj Caresort's live admin account.**
  - Live sets up new tables on first use (suppliers); tell the user if a tar needs `php artisan migrate --force`.
- **Local database:** got the suppliers update on 2026-10-26 (backup C:\3deezi-archive\database-before-suppliers-2026-10-26.sqlite).
- **GitHub:** main = 2d9b553; v2 = 8bb7268. database.sqlite stays out of git. Local v6 = ec79628 with the work uncommitted.
- **Scripts:**
  - SP\final-pack-1026c.sh: code-only pack (copy it with the next letter);
  - SP\final-push-v2.sh <message file>: push via a temp index;
  - SP\iso-server.cjs: isolated database copy.
- **Briefs:** SP\qa-rules.md (locks wait 15 min), SP\viewer-protocol.md, SP\garment-brief.md, SP\V2\checkpoint.md.

## Rules
- **This file:** keep it current and short; delete what's done (user 2026-10-26: keep it updated in case the limit hits).
- **Notes files:** after every task, update tasks.md, task-done-today.md and test-pending.md.
  - task-done-today.md is SHOWN TO THE CLIENT: only tasks the user gave directly, short lines.
- **Priority:** tasks given today and on the last working day come first.
- **Testing:**
  - every task gets its linked modules tested, website and app;
  - never sign up, sign in or save on 8000 (use iso-server.cjs).
- **Talking to the user:** simple words, no jargon.
- **Pushing:** only when told; never pull.
- **Restrictions:**
  - no new packages, no APK;
  - php -l on every PHP edit;
  - no keys in notes;
  - small AI spends up to about US$2 are OK, reported afterwards;
  - blocked actions go to the user.
