# Resume notes

Updated 2026-11-02 (afternoon). Only what's needed to continue; older history is in tasks.md and detail-checks.md.
- SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`; client pictures in SP's sibling folder images\NNN (latest 307).

## State
- Local folder on branch v6 (work uncommitted). GitHub: v3 = 9f17e7b (2026-11-02 12:2x, all work to viewer -180), v2 = ffd179c, main = 2d9b553.
- Today's push goes to **v3** (script SP\final-push-v3.sh: parents v3 + v2, tree = v2 + local work, no force; message file SP\push-v3-msg.txt, update it first).
- Live = https://testcaresortwork.co.in/3deez/. The user extracts the tar there. Everything up to tar 3deez-update-2026-10-30-d.tar.gz is already uploaded, so today's tar needs ONLY files changed since then (plus public/build). Pack script SP\final-pack-1102a.sh (change it to a since-10-30-d list before running).
- Live steps for today's tar: `php artisan migrate --force` (new column assets.source_id from UP1), then `php artisan optimize:clear`. PHP upload limits upload_max_filesize >= 26M, post_max_size >= 36M. Optional, for EPS / PSD files: Imagick, Ghostscript or a CloudConvert key.
- DONE 12:20: tar D:\3d-app\deploy-zips\3deez-update-2026-11-02-a.tar.gz (103 files, 5.4 MB, only changes since 10-30-d, viewer -180) + v3 push 9f17e7b. NEXT at 98%: NK1 V-neck fix, then tar -b (SP\final-pack-1102b.sh, changes since 11-02-a) + v3 push again.
- All other agents PAUSED 12:2x at safe points (logs: SP\FN\FN10\log.md queue, SP\CP1\log.md, SP\SM1\log.md, SP\NK1\log.md, SP\DT10\log.md).
- Viewer is about 2026-10-20-177. Drive D has only about 1 GB free: keep test output small.

## Agents (2026-11-02). The user: models use only TWO agents (one tester + one fixer); other tasks get their own agent.
- **DT10 a1b800c1918235f8d**: the model tester (gatekeeper). Reads SP\tester-checklist.md and SP\DT8\user-points.md (the user's own points per model, add every new one). Log SP\DT10\log.md. It opens each model FRESH from its tile.
- **FN10 aaf2b46a28116e662**: the only model fixer. Works DT10's FAIL lists in order; written queue in SP\FN\FN10\log.md. Now: tracksuits (track pants with the jacket on the Tracksuit tiles, a clean stand-up collar, level chest logos; Athletics track jacket: ONLY level the chest logo and wordmark). Then: socks top band + brighter hoops, netball dress, tees, hoodie, varsity, rugby league / union, shorts, full kit shorts, NFL Game jersey shoulders + Game Kit top, compression top muscles, singlet racer-back, training bibs, club polo / darts. The football jersey points wait for DT10's fresh re-check.
- **CP1 a05af6a2d10a82b90**: Headwear (9.166): the cap artwork lands on the 3D cap (done); the HEADWEAR DYO tile (done); next the beanie with pom-pom and the 5-panel cap 3D models; "Caps" get a 6-panel variant; both 3DEEZI marks (BR1 notes). Log SP\CP1\log.md.
- **SM1 ac5d9916654eb157f**: Signage & Marquees (9.168): website done (menu, /signage, 3D marquee, Marquee Studio, save / export / review / order, no migration); fixing the "2 garments" wording; next the app. Spec SP\SM1\spec.md, log SP\SM1\log.md.
- **Builder A a5a5461b873c70d9e**: mobile bubble home (9.163), phones only; round 3 done (client 301-302 feedback, the glass nav on all phone screens, the tutorial). Client files in SP\HB1\client (idle PNG + drag GIF). Free now. The classic home stays the default (kBubbleHomeDefault = false) until the client approves.
- Finished today (no longer running): UP1 (9.167), CU1 (9.165), LT1 (9.164), AD1 (9.171), BR1 (9.169), NK1 (9.170), FN9, ND2. Their logs are in SP\<name>\log.md.

## Waiting on the user
- questions.md 1: Airwallex demo keys. questions.md 2: a small "3" + 3DEEZI under the back collar on customers' own AI / artwork kits?
- The user hasn't said yes to a second model fixer (offered several times).
- Socks on kits (Full kit, Rugby League kit, Game Kit) were decided yes (tasks.md); the fixer queue line 19 in SP\FN\queue.md.

## Rules
- Keep this file short; delete what's done. task-done-today.md is shown to the client (only direct tasks).
- Finished 3D models list: add a model ONLY when the tester passes it; move it back to Working on when the user raises a new point.
- Go ahead with my suggested answers; questions only for logins, keys, integrations or money.
- Never sign up / sign in / save on 8000 (use SP\iso-server.cjs). Push only when told. Live tars are code-only; never delete Manoj Caresort. Local DB migrations: back up, then run. No keys in notes; php -l every PHP edit; no new packages; never run flutter build web; simple words.
- SM1 paused 12:3x: Signage & Marquees done (website + app). Marquee orders show 'Quote required' until an admin sets a Marquee price in Admin > Pricing. Next (SP\SM1\log.md): rerun the app tests sync / flow / bubble_home / home_switcher one at a time; check the app on a phone; optional app Export. CP1 paused: cap / bucket hat logos fixed (logo positions reset on garment change, website + app); beanie + 5-panel built (-178); bucket hat too white not yet looked at; tester must re-test caps / hat and test the beanie / 5-panel.
- QUEUED (user 2026-11-02, images/310-311): 9.173 the Studio garment rail must show and select 'Tracksuit' for tracksuit tiles (now 'Track jacket'); website + app. Give to the next free agent; add to FN10's queue too (the basketball tracksuit blades / piping).
- 2026-11-02 12:29: second delta tar D:\3d-app\deploy-zips\3deez-update-2026-11-02-b.tar.gz (17 files, changes since 11-02-a: the V-neck fix, viewer -181) + v3 push 3583a9b. Next delta tar: copy SP final-pack-1102b.sh with REF = the -b tar. All agents paused.
- If the session ends before the back-neck fix: NK1 acef514e096b20775 has it (round back neckline, all neck styles); then tar -c with SP final-pack-1102c.sh (REF = -b tar) + v3 push.
- 15:0x RESUMED (limit reset; user: models = one fixer + one tester, finish today's tasks): NK1 back-neck round, then 9.173 tracksuit garment rail; FN10 model queue (socks top band, bucket hat white, tracksuit blades, ...); DT10 re-tests caps / hat, beanie, 5-panel, tracksuits; SM1 reruns app tests. Builder A free (bubble home waits for the client).
- 15:4x FN10 stopped (memory full); FN11 a214fbe1960ccad2b is the only model fixer now (queue in SP\FN\FN11\log.md: headwear, tracksuit leftovers, then FN10's queue). WB1 a92fecacc4a4b24c8: rebuilds the 8088 app preview and opens it to the phone on the LAN (bubble home).
- 16:xx FN11 stopped (memory full) after -191 (hoodie colours / looks). FN12 a7ca3f66914a0832f is the only model fixer now (queue in SP\FN\FN12\log.md: netball dress, tee silhouette, tracksuit hood / bball jacket / beanie stripes, hoodie hood, then varsity onward). User: only home + 1 fixer + 1 tester until the mobile home is done; then push v3 for the Android / iPhone build (kBubbleHomeDefault = true).
- 2026-11-02 17:xx: user confirmed the mobile home works; pushed v3 = 8e901c0 (kBubbleHomeDefault = true, viewer -194) for the Android / iPhone build. Builder A is still improving the tutorial demo (bigger glass, no overlapping text); push again when done.
- FN12 stopped (memory full) at -199. FN13 = the only model fixer now (queue in SP\FN\FN13\log.md, from FN12's HANDBACK). Tar 3deez-update-2026-11-02-c.tar.gz (16:29, viewer -196, all of today since 10-30-d) was given to the user for live; v3 = 53b85c9.
- DT10 stopped (it had started relying on the fixers' screenshots); DT11 a1d108b7550d1d493 is the model tester now: it renders every model itself, opened fresh from its tile, and ends each report with Verdict: PASS / FAIL. FN13 accf4dbe710501ba3 is the fixer. Netball dress PASSED (-198), on the Finished list.

## Now (2026-11-02 evening) - user: only 3 agents: 1 model fixer + 1 model tester + 1 on new tasks
- FN13 accf4dbe710501ba3 (model fixer): queue in SP\FN\FN13\log.md: soccer jersey slimmer (9.176, not NFL-like), hooded tracksuit FAIL (front edges to the zip, no front label, black back, rugby side panel), netball inner edge straight from 60% to the hem, basketball jacket panels + piping, beanie stripes, hoodie list, then varsity onward.
- DT11 a1d108b7550d1d493 (model tester): renders itself, Verdict PASS / FAIL; now the tees (-201).
- Builder A a5a5461b873c70d9e (new tasks): mobile home round 4 (client: bigger bubble with ripples, options spread evenly, cleaner icons, same-size labels, real high-res 3DEEZI logo). Before / after picture SP\HB1\client\round4-sbs.png.
- PAUSED (resume when the 3rd slot is free): LT2 abf80c2ef9b29b303 calmer Studio lighting + thin highlight around garments (9.174; log SP\LT2\log.md); SG1 ad03379d293a6b7a9 Studio garment list follows the selected sport, Soccer shows soccer apparel (9.175; log SP\SG1\log.md).
- WAITING ON THE USER: free about 3 GB on D (they delete the old installer, WUDownloadCache, D:\d, old flutter_tools temp; the safety check blocked me), then I install Blender (user OK) and start the realistic-fold jersey.
- Finished today (tester PASS): netball dress (-198; back in Working on for the straight hem edge), socks, 5 panel cap, NFL beanie, caps, bucket hat, shooting shirt, basketball shorts, skirts.
- Live: tar 3deez-update-2026-11-02-c.tar.gz (16:29, viewer -196). v3 = 53b85c9 (the bubble home is the default on phones).
- RULE (user): update this file regularly with every agent's work.
- SG1 PAUSED: garment list follows the sport (website + app), code in the project, compiles, 23 click checks pass. Left: rebuild the website (vite), fix the custom-sport click step, check Football > Football jersey on the website + app, add an app test (SP\SG1\log.md).
- LT2 PAUSED: calmer lighting + thin edge highlight ready in SP\LT2\src (not merged, no lock): bloom halved, floodlights / back lights / podium softer, main light less warm; cyan closer (centre 26 -> 11). Left: check the edge highlight in pictures, lit-side cyan slightly light, lights-sbs.png, merge + build (SP\LT2\log.md).
- DT11: tees -203 FAIL (list in detail-checks "DT11: Tees", sent to FN13); next it re-tests the beanie, basketball tracksuit jacket, hoodie, varsity.
- D drive (user 2026-11-02): KEEP Free Download Manager, Software, xampp, flutter, 3d-app, ClaudeMemory, laravel, htdocs, Java, Gradle, PubCache, systemp. The user is deleting the other folders themselves after checking.
- FN13: bball tracksuit jacket (-203) + soccer jersey slimmer (-204) merged, sent to DT11. FN13 next: DT11 hooded-tracksuit list, netball edge, tee list. Blender: the download over curl keeps dropping (35 MB of ~350); the user is downloading blender-4.2.23-windows-x64.zip to D:\Blender by browser (sha256 82e79147...10cb); then unzip there and start the realistic-fold jersey.
- Builder A round 4 DONE (bigger bubble with ripples, 5 options evenly on a pentagon, clean jersey art + vector badges, same-size labels, the real emblem-final.png logo; preview rebuilt; SP\HB1\client
ound4-sbs.png). NOT pushed to v3 yet. Third slot -> SG1 resumed to finish; then LT2.
- DT11 re-tests FAIL: soccer jersey (wing-collar insert, sleeves), bball jacket (piping, collar edge, panel width), beanie + NFL beanie (shape, pom-pom), hoodies (shape, hood, stripe band, NFL cords), varsity (collar), NFL varsity (shape). All sent to FN13. NFL beanie moved back to Working on.
- Blender: the user is downloading it to D:\downloads (not D:\Blender). When it's done: check sha256 82e791475779a7342424a480bdde9a20b43710da9264c60346125aa16cd910cb, unzip into D:\Blender, delete the partial D:\Blenderlender.zip.
- SG1 DONE (9.175): garment list follows the sport, website (built 17:21) + app (test studio_sport_garments_test.dart). Third slot -> LT2 (lighting) resumed next.
- FN13 merged up to -204 (hood, tees, netball kink, bball jacket, soccer cut); a ready batch (hood front edges, rugby side panel, dark neck labels, netball straight edge, flare tees) waits for viewer.lock (LT2) then FN13 runs SP FN\FN13\merge.sh. The navy back tint on every garment went to LT2 (lighting).
- 17:4x user: a separate agent per task. Model fixers now: FN13 accf4dbe710501ba3 (soccer jersey, bball jacket, garment-tee, NFL jerseys / game kit / full kit shorts, tops), FX-H afc573aa532704c3c (hoodies), FX-V a0727b40c92ddf306 (varsity + NFL varsity), FX-R aa634a8747e960d3d (rugby jerseys + kit shorts, football / rugby shorts). Shared brief SP\FN\split-brief.md. Tester DT11 a1d108b7550d1d493. LT2 abf80c2ef9b29b303 lighting (+ navy back tint). Watch the machine's memory (about 7 agents now).
- Blender 4.2.23 LTS installed (portable) at D:\Blenderlender-4.2.23-windows-x64 (sha256 OK; the zip is still in D:\downloads). BL1 (new agent): cloth-simulated soccer jersey prototype behind ?cloth=1, log SP\BL1\log.md.
- LT2 DONE (9.174, viewer -208): calmer lighting, thin edge highlight, neutral black backs. Note: the dark kit front is a touch darker / purpler; the layout test had page-load timeouts on -208.
- User: netball dress back on Finished (accepts the bump fix). BL1 switched: Blender cloth on FINISHED models first (netball dress, shooting shirt, basketball shorts, skirt), before / after screenshots in SP\BL1\client for the client.
- DT11 PASS: Basketball Varsity (-214), on Finished. NFL varsity: FX-V doing its own rib collar. FX-R: rugby shoulders + rugby shorts hem corner. DT11 testing rugby / shorts -214.
- 18:3x: FN13 -218 (netball inner edge fixed in the solid-colour path, hood front edges, tee hems, bball jacket panel) -> DT11 re-testing. LT2 resumed: dark shadow flecks under sleeves. FX-V: NFL varsity collar stripes (taller band). FX-R: rugby / shorts DT11 list + socks on the rugby kit. FX-H: hoodie width / hood / sleeves. BL1: Blender sheet SP\BL1\clientll-before-after.png (shooting shirt, bball shorts, skirt, netball -218).
- 18:5x: BL1 shooting shirt prototype; sleeves crumpled -> quick fix: cloth on the body only, sleeves kept original. Images SP\BL1\client\shooting-shirt-before-after-front.png / -34.png. Not merged (only in BL1's copy, behind ?cloth=1). User session ends soon.

## TOMORROW START HERE (paused 2026-11-02 ~19:00 at 90% of the limit)
- All agents told to PAUSE at safe points; each writes its next steps in its own log. Viewer is about -222. Not pushed since v3 = 53b85c9; last live tar 3deez-update-2026-11-02-c (16:29, viewer -196).
- FIRST: check the locks are free (SP\viewer.lock / vite.lock), dart analyze lib + npx tsc --noEmit clean, then make tar 3deez-update-2026-11-03-a (changes since 11-02-c; copy SP final-pack-1102c.sh with REF = the -c tar) and push v3 when the user says.
- Model fixers (resume each via its log):
  - FN13 accf4dbe710501ba3 (SP\FN\FN13\log.md): beanie logo marks, NFL jerseys / full-kit shorts, tops, bball jacket collar edge, soccer sleeves.
  - FX-H afc573aa532704c3c (SP\FN\FX-H\log.md): hoodie width .78 / .88 at 50%.
  - FX-V a0727b40c92ddf306 (SP\FN\FNV\log.md): NFL varsity collar narrower, opening like a V, with the two cyan stripes.
  - FX-R aa634a8747e960d3d (SP\FN\FX-R\log.md): rugby jersey shape (sleeves to 40%, tips .88, shoulders +5%, hem narrowing), rugby kit socks, football shorts hem / waist / logo 25%, rugby shorts logo 25%.
  - Shared brief SP\FN\split-brief.md. A merge once overwrote main.js with an old copy: always git merge-file.
- Tester DT11 a1d108b7550d1d493 (SP\DT11\log.md): re-test -218 batch (netball edge, hood edges, tees, bball jacket), beanies -222, hoodies, NFL varsity, rugby / shorts after the fixers.
- LT2 abf80c2ef9b29b303: dark shadow flecks under the tee sleeves (shadow bias).
- BL1 aaf8c3e27097e15c2 (SP\BL1\log.md): Blender cloth NOT good yet (crumpled sleeves; the user says it must look truly realistic). Fix the sleeves, then send a FEW images (shooting shirt front + 3/4). Nothing merged; only behind ?cloth=1 in BL1's copy. Blender at D:\Blender\blender-4.2.23-windows-x64.
- Mobile home round 4 done on the preview (http://192.168.18.113:8088, serve_preview.mjs --lan); push to v3 when the user says.
- Finished list (tester PASS): skirts, shooting shirt, basketball shorts, caps, bucket hat, socks, 5 panel cap, netball dress, varsity jacket.
- Questions open: Airwallex keys; a small 3DEEZI under the back collar on customers' own AI / artwork kits?

- Tee sleeve flecks: LT2 could not fix them with shadow settings; probably the new tee sleeve shape (FN13 / tee area); next steps in SP\LT2\log.md (pictures SP\LT2cne).
- FX-H paused at -223: team hoodie width .788 (target .78, OK); NFL hoodie .79 vs .88; next: DT11 re-test -223, a wider NFL hoodie, the hood further back, armpit ripples (SP\FN\FX-H\log.md).
- DT11 paused (no verdict on -218). Tomorrow's test order (SP\DT11\log.md): netball dress, hooded tracksuits, tees, bball tracksuit jacket (-218+), beanies (-222+), team hoodie (-223), rugby jerseys / shorts (-219, then FX-R round 3), NFL varsity after FX-V.
- FX-V paused: NFL varsity V-shaped collar merged as viewer -224, not yet rendered or measured (next: SP\FN\FNV\log.md). Viewer now -224. Only BL1 still running (user asked to let it continue; it sends 2 images only if worth showing the client).
