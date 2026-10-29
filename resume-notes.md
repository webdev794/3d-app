# Resume notes

Updated 2026-10-29 18:50 (end of day). Only what's needed to continue.
- SP = `D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad`; client pictures in SP's sibling folder images\NNN (latest 218)

## State
- Local folder on branch v6 (work uncommitted). GitHub v2 = a93a711 (all work to 2026-10-29). main = 2d9b553. v3: wait for the user's instructions.
- Live file: D:\3d-app\deploy-zips\3deez-update-2026-10-28-f.tar.gz (older than v2). Live must run `php artisan migrate --force` (presets table) + `php artisan optimize:clear`.

## Running (user 2026-10-29 15:00: ONLY 2 agents: one builder at a time + one tester; when the tester finds a bug, one fixer agent may run too: max 3; no second fixer, VS Code kept restarting)
- Builder: ND1 a6bb230d2b8dc09cb: netball dress (log SP\WF1\netball-dress).
- Fixer 2: FX3 a24d75d5309013901: football jersey leftovers (log SP\FX3).
- User 2026-10-29: 4 agents (CF1, FX3, ND1, DT4); the user closed Edge to free memory (5.4 GB free). If VS Code crashes, go back to 2 (fixer + tester).
- Fixer: CF1 finished cap (-78), socks colours and compression top (-80); DT4 checks them. Slot free (kept free: drive D nearly full).
- Tester: DT4 ab0c631035b928e45: the skirt, then the cap after CF1; log SP\DT4\log.md. Older testers DT1-DT3 logs in SP.

- User 2026-10-29: whenever an agent finishes its current model, start the next from the queues (keep 3-4 agents; replies to the user: one short line).


## FOCUS MODE (user 2026-10-29 18:20): one model at a time. All fixers (CF1, FX3) work only on the current model; the tester (DT4) re-tests until it says FINAL; then the next model.
- Order: 1 Compression top (now) -> 2 American Football jerseys -> 3 Skirt -> 4 Cap -> 5 Socks -> 6 Netball dress (ND1 paused) -> then the builder queue.
- Paused for later: FX3 Swirl collar / shoulder fade; CF1 socks toe / ankle folds + skirt neutral black / drape folds / no thigh stubs: FINISHED in CF1\paused (not merged; other-garments check failed on memory), notes SP\CF1\log.md.

## Open items by model (detail-checks.md sections 2, 5, 6, 7)
- Compression top (viewer -86; CF1 shape landed): DT5 still finds arms out too far and too long, body too narrow and too short (front 66-75% of the picture width; hem must be level with the cuffs), sleeve stripes should widen 11 to 22 px. FX3 print / stitching LANDED in -86 (block sleeve 3, wider chest 3, dark stitching). Jerseys -84: narrower 86, smaller caps + black sleeves, Practice V insert; next: DT5 compares jerseys + compression on -86. FX3 Swirl fade finished but not merged (SP\FX3\log.md end).
- Skirt: neutral black, drape folds, no thigh stubs (done in CF1\paused, not merged).
- Socks: each tile needs its own layout (Football / Footy / Hockey: two hoops, full cyan toe, no ankle lines; Game Socks: two wide hoops, bigger 3; Rugby: flat cyan 3); top of foot looks grey. CF1 paused toe / ankle folds in CF1\paused.
- Cap: brim flatter than the pictures' curved brim.

## Tomorrow first (DT5 findings 18:55, detail-checks.md sections 2 + 4)
- Compression top: arms too far out and too long; hem must be level with the cuffs; front between panels 25-35% too narrow; panels thin just above the hem (15 vs 28 px); sleeve stripes should widen 11 to 22 px toward the cuff.
- Practice Jersey: mesh holes run through the 86, wordmark and 3 mark: the print must be solid (main item).
- Game Jersey: shoulder numbers may be 8s (the 86) not 3s, check the picture again; the fabric dots show through the white 86 up close.
- Both jerseys: length waits for the user (questions.md 4).

## Fixer queue (next fixer takes these in order; detail-checks.md)
- (CF1 now) Socks: knit creases around the toe (user 2026-10-29).
- Skirt (DT4): fabric sheen makes the black warm brown (render-quality interlock); broad soft drape folds missing; display form thigh stubs look like two black discs (picture has no form).
- (FX3 now) Football jerseys leftovers (DT3, detail-checks.md section 4): Game chest "3" bold slanted bigger; small "3"s on the shoulder tops; V mark in a small badge; wide cyan side panels with a black inner strip still thin from the front; Practice shoulder stripes wide from the front; stacked logo bigger; mesh holes visible all over the body. Length waits for the user (questions.md 4).
- DONE by CF1: compression top 8 differences (was: FX2 had started (stopped at the user's request, max 3 agents); its files in SP\FX2.
- Jersey (football / hockey) wing collar with V placket and white inside; side panels hardly show from the front.
- Full kit (swirl): crew neck; shorts with cyan blades on the lower outer legs; socks.
- Game Kit: needs game pants with belt and knee pads (COMING SOON plan item 12), socks, front 86.

## Builder queue (start the next only when the current builder finishes; each has a progress log)
2. Socks exact match, rest after CF1's toe-line fix; log SP\SK2.
5. Rugby League jersey leftovers: SP\WF1\rugby-league-jersey\log.md.
6. Shooting shirt: SP\WF1\shooting-shirt\log.md.
7. Basketball shorts: SP\WF1\basketball-shorts\log.md.
8. Shorts: SP\WF1\shorts\log.md.
9. Then: bucket hat, bibs (GM4 log), rugby league kit, football jersey, singlet, tee, polo, raglan, hoodie, track jacket, varsity, full kit, then COMING SOON plan items 9+ (SP\GM1\plan.md).
- FD1 ac5a188598cb64cc9 (tile looks) stopped at the limit while finishing screenshots; low priority.
- Prompts for these: the workflow script garment-detail-pass-wf_e3c2c5e1-acb.js (buildPrompt / detailPrompt); use them for ONE agent at a time, not a workflow.

- DT5 a01e0827338d866f3 (tester): nothing FINAL yet; football jersey shots saved, not yet compared; re-check the compression top / football jerseys as the fixers land, aim for FINAL; log SP\DT5\log.md.

## Agent progress saved (2026-10-29 18:30; each also keeps a log)
- DT4 ab0c631035b928e45 (tester): STOPPED (context full) after skirt fixes (-81) and compression / socks heel / cap fixes (-83). Start a NEW tester (DT5) from SP\DT4\log.md (last lines = re-check recipe) when CF1 + FX3 report the compression top. Warning: GM1\same.cjs gives false differences when the machine is busy; re-run before trusting.
- CF1 a2248b0f4560b6960 (fixer): cap eyelets + fabric (-78), socks toe colour, compression top 8 points (-80); was on the socks toe shading; next = compression-top findings. Log SP\CF1.
- FX3 a24d75d5309013901 (fixer): football jerseys (-82): bold chest 3, shoulder 3s, V badge, side panels, practice stripes / mesh / black sides; finishing V triangle, narrower 86, Game black sleeves. Swirl collar/shoulder fade paused. Log SP\FX3\log.md.
- ND1 a6bb230d2b8dc09cb (builder): netball dress, paused by focus mode. Log SP\WF1\netball-dress\log.md.
- Memory: commit memory ran out at 18:24 (website build emptied); 34 test browsers closed, website rebuilt. Keep agents to 3-4 and browsers closed.

## Waiting on the client
- Buying professional garment models; HQ jersey as default; Airwallex keys; supplier prices; live mail settings.

## Rules
- Keep this file short; delete what's done. task-done-today.md is shown to the client (only direct tasks).
- task-done-today.md bottom section "Finished 3D models (built, tested and final)": add a model ONLY when the detail tester passes it with no open differences (user 2026-10-29, for the client).
- Never start my own suggestions without the user's yes.
- Never sign up / sign in / save on 8000 (SP\iso-server.cjs). Push only when told. Live tars code-only; never delete Manoj Caresort. Local DB migrations: back up, then run. No keys in notes; php -l every PHP edit; no new packages; simple words.
