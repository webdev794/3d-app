# Resume notes

Updated 2026-10-26 12:50. Only what's needed to continue; finished work is in tasks.md, task-done-today.md and test-pending.md.
- SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`
- Client pictures: `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\images\NNN.jpg/png`

## After a restart
1. Stop leftover test servers and browsers (php not on :8000, node iso scripts, playwright chrome / msedge, flutter_tester); check SP\*.lock.
2. Resume the running agent below with SendMessage ("continue from your checkpoint; safe steps; report"). If its ID doesn't work, start a new agent with tasks.md 9.116 and SP\AI3D\checkpoint.md.

## Running (9.126, started after the session renewed)
| Agent | Task | Notes |
|---|---|---|
| (done) AI3D ad0d30b5e059000b3 | 9.126 parts 1 + 3: the soccer 3D matches the picture (RANVERS → clean text); hoodie, jackets, shorts and full kit carry the AI picture's real pattern | Up to about US$1 more of AI checks; checkpoint SP\AI3D\checkpoint.md |
| (done) OC1 ae97afe6003f312eb | 9.127 app Home order cards (images/184.jpg): client wants them "close to the website": big cards like the website homepage's order section (176.jpg: Need help ordering? / Order ready to go? / My orders, with pictures and buttons) | App only |
| (done) NB1 ac00da321de303471 | 9.126 part 2: new `netball-dress` 3D garment (women's fitted shape, flared hem) + a female mannequin; the Netball dress tile uses it | garment-brief.md + viewer-protocol.md; no paid AI |

After both: a code-only pack (copy SP/final-pack-1026d.sh with the next letter) and push to v2 when the user asks.

## State (2026-10-26 13:12)
- All tasks given on 2026-10-23 and 2026-10-26 are DONE, including 9.116 (viewer -27; AI spend about US$0.89).
- Latest live file: `D:\3d-app\deploy-zips\3deez-update-2026-10-26-d.tar.gz` (13:11, code only, includes a, b, c). After extracting: `php artisan optimize:clear`.
- Latest live file: D:\3d-app\deploy-zips\3deez-update-2026-10-26-e.tar.gz (16:13; viewer -29: netball dress + female form, Open in 3D fixes, app Home order cards). NOT pushed yet (v2 = 8bb7268 = the -d file); push when the user asks. Next pack: copy SP/final-pack-1026e.sh with letter f.
- 9.126 and 9.127 DONE. No agent running.
- Small open items from NB1: the Tennis dress tile still uses the singlet (a one-line change); no separate "Dress" order line; ProjectRequest may refuse pocketpolo design-picture layouts (422).

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
