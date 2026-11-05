# Resume notes
Updated 2026-11-04 evening (weekly limit nearly used). Only what is still open; history is in tasks.md, detail-checks.md and git.
- SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`; client pictures in SP's sibling folder `images\NNN` (latest 432).
- Old notes (before this clean-up) are saved in SP\resume-notes.before-1104-cleanup.md.

## START HERE (2026-11-05)
1. Check SP\viewer.lock and SP\vite.lock are free; run `dart analyze lib` (D:\3d-app\3d-app) and `npx tsc --noEmit` (website).
2. Resume the agents below with SendMessage (each has a log); then look at their pictures yourself before telling the user anything.
3. Nothing from the afternoon of 11-04 is pushed or packed yet. The user said 11-04 pushes go to **v2** (SP\final-push-v2.sh); ask which branch on 11-05. Next live tar: copy SP\final-pack-1104a.sh with REF = deploy-zips\3deez-update-2026-11-04-a.tar.gz.

## Running work (agent IDs)
- **PW1 a5f768a90a0758a35: phone bubble pages** (Projects, Profile, Orders, My orders; mobile only). To do:
  - headings at least as far from the top rim as "LET'S CREATE" on Home;
  - the bubble as WIDE as Home's (pages were about 16 px narrower);
  - the top and bottom curve the SAME as Home's, not rounder (base the dome on the visible screen height);
  - everything inside the bubble, at the top and scrolled to the bottom.
  It builds on my uncommitted edits:
  - glass_bubble.dart: the dome cap kDomeW (it fixed Profile's pointed top);
  - bubble_page.dart: side padding 28, bottom padding 0.27 x width;
  - orders_tab.dart: bottom padding 56;
  - orders_board.dart: the My orders header centred.
  Then flutter build web and check in the browser (SP\DR1\bot.cjs). Log SP\PW1\log.md.
- **Basketball shorts:** BSF a161c7475f4c08d5e (fixer) merged viewer **-246**: creases and seam lines, a straight open hem, a 6% smooth waistband, no seat shadow, the back, a wider V, stripe heights. BST ad3a868f541eb014f (tester) is testing -246 with the full checklist. BST on -246: FAIL but close (front, 40-degree view, gap, waistband height, surface, hem and stripes PASS). BSF round 4 fix list: V split sharp, straight and near black; straight side outline (hips); waistband gathers, no ledge; back 2-3% narrower; colours vs the tile. Spec and logs in SP\BS.
- **Netball dress** (client's new model, images 425-427): NDF af583c2f6cd3ff881 merged -244 (new shift dress) and -245 (back neck as 425, side panels, a NEW tile picture), and has NDT's -244 fix list (back neck, shoulder tops, armhole U, yoke-to-panel join, front yoke curve, crest lower, back letters lower, pale edge rim, body colour). NDT aaa2f21c3d04e8914 is testing on -246. Spec and logs in SP\ND.
- **QD a7ad4d6af6f014290:** task 1 done (website home glass; I then put the main buttons back to bright glossy at the end of home.css). Task 2 in progress: a small 3DEEZI neck mark under the back collar on AI and artwork kits (viewer). Log SP\QD\log.md.
- **TW a8eb1e13f49abd4c4 (task worker):** making the Artwork to 3D "Open AI preview in 3D Studio" button ALWAYS open the Studio (shows "Opening..." at once, falls back to a full page load, never stuck; no questions to the client, per the user). The fishing shirt -> Polo with a note is done.
- **Paused until the client sends preferred-model pictures per garment:** FN15 a4bb5a8ba17a2333a (fixer; HANDBACK and an unmerged hoodie cuff taper in SP\FN\FN15\log.md) and DT11 a1d108b7550d1d493 (tester; tools in SP\DT12).

## Client references to give the next free fixer + tester (user 11-04)
- Soccer / football kit: a Yellow Images soccer kit (front: raglan jersey, shorts, socks) and a Sweden yellow / blue kit (front and back). Pasted in chat only; NOT saved in images\, so ask the user to re-send.
- American Football casual jersey: Yellow Images "Football Jersey Mockup" (slim fit, V neck, raglan, sleeve stripes, side panels).
- American Football: Yellow Images "American Football Jersey Mockup - Front View / Back View" (blue, yellow V collar, 01) and "Man Wearing Full American Football Kit Mockup" (red). Pasted in chat only; ask to re-send or find them by name on yellowimages.com.

## Waiting on the user / client
- questions.md 1: Airwallex keys (later). The answered questions were removed (decisions are in tasks.md).
- Practice Jersey: kept 4.5% longer; its final shape follows the client's preferred pictures.
- Sharper Home icons (the client will send).

## State
- Branches: v3 = 0a0d3fc (Home dome shape, 11-04); v2 = ffd179c; main = 2d9b553.
- Live: https://testcaresortwork.co.in/3deez/; last tar 3deez-update-2026-11-04-a.
- Viewer -246 (netball dress -244/-245, shorts -246).
- In the project but not pushed or packed: the website home glass with bright buttons; the fishing shirt note; the page bubble edits; viewer -244..-246; BSF's colour panels.
- task-done-today.md: today's Done list, plus "Finished 3D models (based on client preference)" (empty; the shorts went back to Working on).

## Rules (keep)
- Plain words. task-done-today.md is shown to the client (direct tasks only).
- Models:
  - the client's preferred-model pictures are the only target; Yellow Images only for the CLOSEST mockup;
  - the full tester checklist (SP\tester-checklist.md: all views including the back, surface crops, hem, details, colours);
  - fix only the exact spot; many measured rounds, each closer; undo a worse step; never touch passed models.
- Test my own changes with screenshots before reporting. Don't change approved work while doing a new task. The user wants me free for their messages: give the work to agents.
- Never sign up / sign in / save on :8000 (use SP\iso-server.cjs). Push only when told. Live tars code-only; never delete Manoj Caresort. php -l every PHP edit. No new packages.
- 11-04 RULE (user): garment tile pictures are the client's images: never change them, only the 3D models. NDF told to restore garment-netball-dress.webp (both copies) from its backup / v3 (sha a27888e9dd21).
- 11-04 RULE (user): each model fixer works only on its own model (shared-file changes must leave other kits identical). Sent to BSF and NDF; added to the fixer briefs.

## PAUSED 2026-11-04 evening (user): resume these tomorrow, each from its log's HANDBACK
| Worker | ID | Log (HANDBACK) | Next step |
|---|---|---|---|
| Page worker PW1 (phone bubble pages) | a5f768a90a0758a35 | SP\PW1\log.md | Headings as far from the rim as Home; the same width and top / bottom curve as Home; everything inside at top and bottom; then flutter build web + browser check (SP\DR1\bot.cjs) |
| Basketball shorts fixer BSF | a161c7475f4c08d5e | SP\BS\fixer-log.md | Round 4: V split sharp / straight / near black; straight side outline (hips); waistband gathers, no ledge; back 2-3% narrower; colours vs tile |
| Basketball shorts tester BST | ad3a868f541eb014f | SP\BS\tester-log.md | Test BSF's next version with the full checklist (round.sh N, studio-trim.mjs, the 40-degree view) |
| Netball dress fixer NDF | af583c2f6cd3ff881 | SP\ND\fixer-log.md | NDT's -244 list: shoulder tops, armhole U, yoke-to-panel join, front yoke curve, crest lower, back letters lower, pale edge rim, body colour, small items |
| Netball dress tester NDT | aaa2f21c3d04e8914 | SP\ND\tester-log.md | Finish / redo the test on the latest build, then each new NDF version |
| Collar-mark worker QD | a7ad4d6af6f014290 | SP\QD\log.md | Task 2: small 3DEEZI neck mark under the back collar on AI and artwork kits |
| Task worker TW | a8eb1e13f49abd4c4 | SP\TW\log.md | Artwork to 3D "Open AI preview in 3D Studio" always opens the Studio (Opening... at once, full-page fallback, never stuck) |
| Main model pair (paused earlier) | FN15 a4bb5a8ba17a2333a / DT11 a1d108b7550d1d493 | SP\FN\FN15\log.md | Waits for the client's preferred-model pictures per garment |
Each worker's 2-line pause reply is added below as it arrives.
- TW paused: the Artwork to 3D button fix is built (Create.tsx, App.tsx, api.ts; tsc clean), 1 of 11 tests run (hoodie 1440 passed), screenshots not yet checked. Its earlier runs probably made 2 extra small paid AI calls (the Studio pattern call was not faked); the new tests fake all AI calls.
- BSF paused: last merge -246, no lock. Round 4 NOT merged; in its copy a near-black V inside (works) and a reshaped V cut (worse, reverted). HANDBACK in SP/BS/fixer-log.md.
- FINAL 11-04 (99% limit): all workers stopped. Viewer is now -247 (probably QD's collar mark, not checked yet); locks free at stop time. PW1, NDF, NDT and QD were stopped before replying: tomorrow, read each log's end, check the project builds (dart analyze, tsc, vite, viewer copies identical) and look at -247 before anything else.
- TODO FIRST 11-05: live tar of FINISHED tasks only (REF = deploy-zips/3deez-update-2026-11-04-a.tar.gz): the website home glass + bright buttons (home.css) and the fishing shirt -> Polo note (AiStage.tsx, Create.tsx, OpenAiDesigner.php). The built website bundle and Create.tsx also hold UNFINISHED work (the Artwork to 3D button fix, viewer -244..-247), so hold those back or finish and test them first, then rebuild and pack. v2 pushed = 85bc429 (work in progress).

- 2026-11-05 START: locks free, dart analyze + tsc clean, viewer -247 = QD collar mark (merged 18:55, one check left), both viewer copies identical. task-done-today.md cleared for 11-05. Resumed: QD (collar mark checks), TW (button tests), PW1 (phone bubble pages), BSF (shorts round 4), NDF (dress fix list). BST and NDT wait for the fixers' next versions. Live tar of finished work after these report (home glass, fishing note, + whatever passes).
- 11-05: QD task 2 DONE (collar mark checks pass on -247). QD free.
- 11-05: TW button fix DONE (11 runs, all AI faked). Ready for tar.
- 11-05: PW1 DONE (pages match Home; web built). App-only.
- 11-05: shorts PASS on -252 (BST) -> Finished (client preference). Back 2-3% full accepted. My note: waistband top edge looks tilted at 3/4.
- 11-05: shorts back to Working on: I misread images/428 (client shorts HAVE soft vertical / diagonal folds); BSF adds folds, BST checks they match. Tester checklist corrected.

- 2026-11-05: BST failed shorts -255 (folds far too faint at 20-45% of target, waistband looks like a ring, hard lines at 40 deg, knit not visible, back 2-3% wide). Fix list sent to BSF a161c7475f4c08d5e. BST ad3a868f541eb014f tests the next version.
- 2026-11-05: TL finished the app Order Assistant + one Orders card (shots in scratchpad\TL\shots). Main sent 3 small fixes (pill "ORDER ASSISTANT", tab bar on screen 1, Orders bubble shorter like 439 so suppliers show), then the website. Shorts -256 FAIL (tube folds, ring band, shiny) -> fix list to BSF. Netball: NDF checking hip depth + back neck; keep -254 otherwise.
- 2026-11-05: TL finished Order Assistant + Orders card (app+web), tested by hand on 8010. Live needs migrate (order_assists) + reach photon.komoot.io; polo price unset -> polo orders wait for a quote.

## 2026-11-05 ~14:00 STOP: all agents hit the 5-hour limit (resets 2:50pm IST)
Resume via SendMessage, do not respawn:
- push+tar agent a57a1b2603f6958e5: stopped mid-way, state UNKNOWN. Check git status/log first. HOLD the push and tar until the desktop undo below is done (the user said the website desktop must not change).
- TL a3f101741f6eac5d9: do the 3 corrections in tasks.md (desktop back to 3 cards, website assistant not phone-style, manual form minimal fields with 3 tabs kept). App stays as built.
- BSF a161c7475f4c08d5e: -261 fix list (40° tube folds, knit on body, back legs 60-70% -0.5%, back V 1.5x); merge only after the pack is done.
- NDF af583c2f6cd3ff881: folds/shine/yoke colour (-257 list); merge only after the pack is done. NDT aaa2f21c3d04e8914, BST ad3a868f541eb014f test after.
- 2026-11-05: v2 pushed = d390e95 (with the wrong desktop changes); tar 3deez-update-2026-11-05-a made but NOT for live. After TL undoes the desktop pages: new commit on top of v2 (no force) + remake the tar (REF 11-04-a).
- 2026-11-05 15:05: v2 pushed = 66cd25b (on top of d390e95); live tar deploy-zips/3deez-update-2026-11-05-b.tar.gz (delta since 11-04-a, code only, DELETE-ON-LIVE.txt inside); 11-05-a deleted, never live.
- 2026-11-05: v2 pushed = 4e31698 (on top of 66cd25b; shorts viewer etc., no tar).
- 2026-11-05 evening: user: finish shorts + netball dress first (others wait for client pictures). Final fix round each (BSF on -273 list, NDF on -272 list), then one tester check; leftovers go on a later list. TL: Orders tab opens 449 screen + one glass panel round the prompt bar, then pattern_areas test, then bubble batches 1-5. Rule: ask the user when platform/screen is unclear.
- 2026-11-05: QA regression tester a67e886bef88faf96 added (user): tests all linked website+app features on its own copy server (8011), reports to main only; re-run after each batch.
- 2026-11-05: HM a706c0f22b467b17b = app Home design 458 (new agent, user). TL told to keep off the Home files.

## 2026-11-05 late: RUNNING (resume each via SendMessage after a stop)
- NDF af583c2f6cd3ff881: adding 4 cloth curves (images/459) to the netball dress; then NDT aaa2f21c3d04e8914 tests (ready).
- TL a3f101741f6eac5d9: rim padding on the bubble forms, then bubble batches 2-5 (app only; Home files are off-limits).
- HM a706c0f22b467b17b: app Home design 458 (check v3 first; HD jerseys in images/460: left = AI, right = DYO). Mobile app only.
- QA a67e886bef88faf96: regression sweep (website + app) on its own copy server 8011.
- Shorts are FINISHED (-275), with a later list in tasks.md. Not pushed since v2 4e31698; no tar since 11-05-b.
- 2026-11-05 ~86%: dress -276 FAILED (2 of 4 curves, darker, slant and folds back); NDF is redoing it with masked spots on top of the -275 state; -275 stays the reference. TL bubble batches, HM Home, QA sweep still running. No push (user: not yet).
- 2026-11-05 ~90%: App Home 458 DONE (HM). Clean-up done (D: about 2.9 GB free). URGENT with TL: order form/upload/details use the standard Projects BubblePage bubble + all 4 tabs at about 590 px wide (images/461). Dress: NDT checking -277 against -275. QA sweep running. No push yet.
- 2026-11-05: QA a67e886bef88faf96 PAUSED by the user; resume tomorrow (2026-11-06) via SendMessage.
- 2026-11-05 END: TL a3f101741f6eac5d9 is still fixing (app only) the bubbles and spacing on the Orders tab screen and the manual form/Upload/details (content fills the bubble, nothing past the rim, even gaps; 360/390/590x700). Resume it first tomorrow and check its screenshots. NDT is checking dress -277 against -275. Push only when told.
