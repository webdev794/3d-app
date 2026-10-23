# Resume notes

Updated 2026-10-23 17:45. Only what's needed to continue; finished work is in tasks.md, task-done-today.md and test-pending.md.
- SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`
- Client pictures: `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\images\NNN.jpg/png`

## After a restart
1. Stop leftover test servers and browsers (php not on :8000, node iso scripts, playwright chrome / msedge, flutter_tester); check SP\*.lock.
2. Resume the parked agent below with SendMessage. If its ID doesn't work, start a new agent with the task from tasks.md.

## Parked agent
| Agent | Task | Notes |
|---|---|---|
| V2 ae8e48ab7079b58fd | tasks.md 9.115: round ribbed varsity cuffs in the new look; built in its copy SP\V2\r5, not checked or shipped | Resume steps in SP\V2\checkpoint.md; ship as viewer -25 (essential checks only), then a code-only tar (copy SP/final-pack-1023r.sh with the next letter) |
## Next, in order
1. **tasks.md 9.117 (client): Studio on phones.** The 3D view fills most of the screen and the colour wheel is much smaller (images/172.jpg, iPhone Safari on the website). Spec SP\S1\studio-phone-spec.md. Website first, then the app's Studio to match.
2. **tasks.md 9.118 (client): preferred suppliers.** Spec SP\PS\preferred-suppliers-spec.md; open points in questions.md 3; go ahead on the bracketed suggestions if there's no answer. Mantis is the owner's company.
3. **tasks.md 9.116 (client): AI designer › "Open in 3D designer"** picks the nearest 3D model and carries the whole AI design onto it. Start when the user says.
4. **One full test round once the 3D work is final** (user: no testing rounds until then). Include:
   - the app preview 30-visit check;
   - QA U's leftovers in SP\QAU\results.md ("Resume from here");
   - the admin card overflow on the final build;
   - the website plurals on screen.
5. Paused: 9.113 American Football own 3D jersey and compression top. Later: 9.92 app Assets from the server, 9.80 garment build list (incl. the COMING SOON items), 9.83 print designs on hoodies / jackets, 9.60a / 9.60b.
6. Waiting on the user / client:
   - questions.md 2: new 3D look for everyone? Making it the default was blocked by the permission check, so it needs a clear yes. Then set LOOK_DEFAULT '2' in viewer/src/main.js, the next VIEWER_VERSION, and node viewer/build.mjs.
   - questions.md 1 and 3: the Airwallex demo keys; the suppliers' listing price.

## Where things are
- **Live site:** https://testcaresortwork.co.in/3deez/
  - Latest package: `D:\3d-app\deploy-zips\3deez-update-2026-10-23-r.tar.gz` (17:26, viewer -24). After extracting, run `php artisan optimize:clear`.
  - **Live tars are CODE-ONLY** (no database.sqlite, no storage/app), so the live accounts stay. **Never delete Manoj Caresort's live admin account.**
  - New migrations need `php artisan migrate --force` on live: tell the user. None since -o.
- **New 3D look:** behind `?look=2` (remembered per browser; `?look=1` off). Showcase pictures: D:\3d-app\deploy-zips\3d-showcase\; before/after: D:\3d-app\deploy-zips\3d-look-step2-pictures\.
- **GitHub:** main = 2d9b553; v2 = 530e22d (2026-10-23 17:27). database.sqlite stays out of git. Local v6 = ec79628 with the work uncommitted.
- **Scripts:** SP\final-pack-1023r.sh (code-only pack), SP\final-push-v2.sh / final-push-main.sh (push via a temp index), SP\iso-server.cjs (isolated copy; runs php -S and checks that storage is the copy).
- **Briefs:** SP\qa-rules.md (locks wait 15 min), SP\viewer-protocol.md, SP\garment-brief.md, SP\V2\checkpoint.md.
- **Backups:** C:\3deezi-archive\database-before-*.sqlite.
- **Disk and memory:** D: has 2–4 GB free; clean playwright_* / flutter_tools.* and SP\iso-* when low. One flutter run at a time (flutter.lock), one browser per agent.

## Rules
- **This file:** keep it current and short; delete what's done.
- **Notes files:** after every task, update tasks.md, task-done-today.md and test-pending.md.
  - task-done-today.md is SHOWN TO THE CLIENT: only tasks the user gave directly, short lines. No fixes from our own testing, no testing rounds.
  - test-pending.md: each task's test steps, between horizontal lines.
- **Testing:**
  - every task gets its linked modules tested, website and app;
  - never sign up, sign in or save on 8000 (use iso-server.cjs).
- **Talking to the user:** simple words, no jargon; don't make them do technical steps.
- **Pushing:** only when told (today: v2); never pull.
- **Restrictions:**
  - no new packages, no APK;
  - php -l on every PHP edit;
  - no keys in notes;
  - small AI spends up to about US$2 are OK, reported afterwards;
  - blocked actions go to the user.
