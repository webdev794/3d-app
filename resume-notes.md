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
