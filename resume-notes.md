# Resume notes

Updated 2026-10-26 11:40. Only what's needed to continue; finished work is in tasks.md, task-done-today.md and test-pending.md.
- SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`
- Client pictures: `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\images\NNN.jpg/png`

## After a restart
1. Stop leftover test servers and browsers (php not on :8000, node iso scripts, playwright chrome / msedge, flutter_tester); check SP\*.lock.
2. No agent is running. Start new agents from "Next".

## Priority (user 2026-10-26)
Tasks given today and on the last working day come first; older ones after.

## State (2026-10-26 11:40)
- All of today's tasks and the 2026-10-23 tasks (9.115 to 9.123) are DONE.
- Today's upload file is ready: `D:\3d-app\deploy-zips\3deez-update-2026-10-26-a.tar.gz` (398 files, 11 MB, code only, viewer -26 with the new look as the default, Artboard 2026-10-26-3).
  - After extracting: `php artisan optimize:clear`.
  - The suppliers tables set themselves up on first use on live, so no other command is needed.
- Pushed to v2 = 8963f9a (2026-10-26 12:00, user asked). Upload file: D:\3d-app\deploy-zips\3deez-update-2026-10-26-b.tar.gz (includes -a).
- Local database got the suppliers update (user OK; backup database-before-suppliers-2026-10-26.sqlite).
- MB1 done: "Made by" on Upload Your Order (website + app). Next tasks start now (user). Next pack script: copy SP/final-pack-1026b.sh with letter c.

## Running
| Agent | Task | Notes |
|---|---|---|
| UM1 a1712eada4aaa6a83 | 9.124 account menu: Dashboard out of the menu bar; the letter circle opens Dashboard / My profile / Edit profile / Sign out; Edit profile page; app Profile gets Edit profile (images/179.png) | Started 2026-10-26 |
| (done) RP1 ac70e1006ffdfa538 | 9.125 forgot password: emailed 6-digit code, sign in with the code or set a new password; website + app (images/180.png) | No real emails in tests; live needs mail settings |
| AI3D ad0d30b5e059000b3 | 9.116, PARKED at 90% (user: latest tasks first); resume from SP\AI3D\checkpoint.md | Up to about US$1 of AI checks; website + app (+ viewer if needed: letters in the number slot) |

## Next, in order
1. **tasks.md 9.116 (client, given 2026-10-23; RUNNING, AI3D): AI designer › "Open in 3D designer"** picks the nearest 3D model and carries the whole AI design onto it: the AI picture's colours, the chest symbol and, for netball, the position letters (the 3D falls back to the team name / "3DEEZI" today).
2. **One full test round** (the user wanted it after the 3D work):
   - the app preview 30-visit check;
   - QA U's leftovers (SP\QAU\results.md);
   - the admin card overflow;
   - the website plurals on screen;
   - update SP\studio-layout-test.cjs (two upload boxes now);
   - the flaky website tests (AiApiTest, RemoveTestAccountsTest and others that failed once while agents ran in parallel).
3. **Small leftovers:**
   - in the app order form, the 2XL / 3XL / 4XL size boxes cut their labels at phone width;
   - the app's toasts can sit over an open Studio panel;
   - Assist text still says 3DEEZI TEAM sits between Orders and Dashboard (Suppliers is in between now);
   - the app Assist link to Approved opens the All tab.
4. Paused / later:
   - 9.113 American Football own 3D jersey and compression top;
   - 9.92 app Assets from the server;
   - 9.80 garment build list (incl. the COMING SOON items);
   - 9.83 print designs on hoodies / jackets;
   - 9.60a / 9.60b.
5. Waiting on the user / client (questions.md):
   - 1: the Airwallex keys;
   - 2a: OK to update the local database for suppliers (backup first; the local .env has SUPPLIERS_AUTO_SETUP=false until then);
   - 2b: the listing prices (placeholders A$49 / A$490);
   - 2c: "Made by" on Upload Your Order too?

## Where things are
- **Live site:** https://testcaresortwork.co.in/3deez/
  - **Live tars are CODE-ONLY** (no database.sqlite, no storage/app), so the live accounts stay. **Never delete Manoj Caresort's live admin account.**
  - Tell the user if a tar needs `php artisan migrate --force` (today's doesn't).
- **New 3D look:** now the default for everyone; `?look=1` gives the old look. Pictures: D:\3d-app\deploy-zips\3d-showcase\.
- **GitHub:** main = 2d9b553; v2 = 5433dd9 (2026-10-23 18:15). database.sqlite stays out of git. Local v6 = ec79628 with the work uncommitted.
- **Scripts:**
  - SP\final-pack-1026a.sh: code-only pack (copy it with the next letter);
  - SP\final-push-v2.sh: push via a temp index, with a message file;
  - SP\iso-server.cjs: isolated database copy.
- **Briefs:** SP\qa-rules.md (locks wait 15 min), SP\viewer-protocol.md, SP\garment-brief.md, SP\V2\checkpoint.md.
- **Backups:** C:\3deezi-archive\database-before-*.sqlite.
- **Disk and memory:** D: has about 3–4 GB free; one flutter run at a time (flutter.lock), one browser per agent.

## Rules
- **This file:** keep it current and short; delete what's done.
- **Notes files:** after every task, update tasks.md, task-done-today.md and test-pending.md.
  - task-done-today.md is SHOWN TO THE CLIENT: only tasks the user gave directly, short lines.
  - test-pending.md: each task's test steps, between horizontal lines.
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
