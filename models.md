# 3D models: client guide and order (started 13 Nov 2026)

Source: the client's booklet "3DEEZI_Yellow_Images_Model_Reference_Booklet.pdf" (13 Nov 2026): 36 Yellow Images references, a build order, an acceptance checklist and the remaining coverage.
How we work: you make each model in Tripo from the client's reference picture (text removed), save it as a GLB in D:\3d-app\tripo\, and tell me. I put it in following D:\3d-app\tripo\NEW-MODEL-CHECKLIST.md.

## Client instructions (from the booklet)
- Use the references to agree garment types and the visual standard; build original 3DEEZI models. Sample logos, artwork and third-party branding are NOT part of the build. We never copy their text or logos; we only note where logos, numbers and text sit, and put ours there.
- Build order: 1 Core teamwear (rugby, basketball, netball, soccer, AFL, basic team apparel); 2 Training and activewear; 3 Specialist and outerwear; 4 Headwear and presentation.
- Start with ONE COMPLETE RUGBY KIT (jersey, shorts, socks) to approve the modelling and artwork workflow. Approval test: a seam-crossing pattern, a chest logo and a back number.
- Separate women's and youth fits are their own models (not one adult model scaled).
- Different collars, sleeve lengths and reversible garments are explicit variants. (Our rule: collars and necks I build on the model myself; sleeve lengths and reversible are separate models.)
- Every model needs: complete geometry that holds up when turning (front, back, sides, inside); editable zones (front, back, sleeves, side panels, collar, trims); artwork that works across seams (logos, small text, numbers, gradients, patterns); fabric finishes (mesh, smooth polyester, fleece, rib, knit, shell); smooth 360 turning, zoom and jersey/shorts/full-kit toggles on phone and web; the same camera, light and scale for approval sheets, PDF/Excel and orders.
- Not models: the two "rotation reference" animations (soccer kit 99354, hoodie 70681) only show the presentation standard.
- Do not delete other models or categories yet (user, 13 Nov).

## Written details on each card (follow them too, user 13 Nov)
- Rugby jersey 15814: collar, raglan sleeves, side panels and hem; regular and pro fit.
- Full rugby kit 14134: separate jersey, shorts and socks; one coordinated kit scene.
- Women's rugby kit 14524: dedicated women's fit; V-neck, sleeve trims and matching shorts.
- Rugby shorts 14565: waistband, gusset, side seams and short leg profile.
- Basketball V-neck 92705: neck and arm bindings; side panels; reversible variant required.
- Basketball full kit 151692: independent singlet and longer basketball shorts; front/back numbers.
- Netball dress 22007: shaped waist, skirt flare, arm bindings; front/back bib attachment zones.
- Netball bib 37504: separate positional bib mesh; editable letters and attachment areas.
- Soccer jersey 138303: V-neck, short sleeves and panel-safe artwork; add matching shorts/socks.
- Aussie rules singlet 11230: AFL-specific neckline and armholes; fitted torso, shorts variant.
- Baseball jersey 41138: two-button placket, raglan sleeves; also a full-button variant.
- Cricket polo jersey 39858: collar and placket geometry; long-sleeve option and cricket trousers.
- Polo shirt 75906: collar, placket, cuffs and side panels; plain and textured fabric options.
- Training shorts 131096: waistband, side panels, hem and pocket zones; men/women variants.
- Training suit 86789: separate jacket and trousers; zip, collar, cuffs and side panels.
- Tracksuit 11007: coordinated jacket and pant material zones; add hooded version.
- Women's leggings 103553: waistband, leg panels and seam continuity; full and 7/8 lengths.
- Women's fitness kit 117908: independent top and bottoms; editable binding and stretch fabric finish.
- Tennis skirt 49992: pleats or flare, waistband; skort / inner-short variant.
- Women's sport kit 60421: women's silhouette reference; separate garment selection and materials.
- American football kit 14776: padded jersey profile and pants; helmet a separate optional asset.
- Rashguard 117732: compression fit, raglan seams, stretch finish; short and long sleeves.
- Fishing hooded jersey 100509: long sleeves, hood and cuffs; add collared and non-hooded fishing styles.
- Fightwear 141063: fit reference only; separate MMA and Muay Thai shorts.
- Basketball hoodie 50942: hood lining, cuffs, hem and pocket; pullover and full-zip variants.
- Puffer vest 154580: quilt channels, lining, zip and pockets; add sleeved puffer jacket.
- Windbreaker 31265: shell fabric, zipper, cuffs and panel seams; hood variant required.
- Women's windbreaker 131105: dedicated women's cut; separate shell, lining and trim materials.
- Bucket hat 82642: crown, brim underside, eyelets and seams; optional drawcord.
- Beanie 141316: knit texture, folded cuff and embroidery placement.
- Training tee 112791: crew neck, shoulder seams and sleeves; men, women and youth fits.
- Raglan tee 38600: separate raglan sleeve panels; continuous artwork across seams.
- Training singlet 106702: armhole binding, neckline and side panels; loose training fit.
- Baseball cap 95707: crown panels, visor underside, eyelets and closure; embroidery zones.

## Status
A model is marked DONE only when its colours and our logo, text and number positions match its reference card (user 13 Nov). The tile ALWAYS takes the reference card's colours, even if it had another look before.

| # | Reference (Yellow Images ID) | Our garments / tiles | Status |
|---|---|---|---|
| 1 | Rugby jersey (15814) | Rugby League Jersey tile only (kits unchanged) | MERGED -298 (FBJERSEY, necks round/V/shallow V); MERGED -301 in the 15814 look (yellow, navy sleeves, our marks; plain navy cuffs); all 13 collar styles shown (-305), yellow collar by default; Regular + Pro fit. OPEN (user 13 Nov 18:27, images 543-546): the necks look unfinished: the round neck has no thick band round the circle, the V-neck band is only half made; build full bands, then check all 13 styles. The user said it can wait (jersey is still "Working on"). Spec + notes: SP2\TRIPO\JERSEYNECK\ (agent a872c0f943fc6e0e9). MODELTEST's jersey test is paused |
| 2 | Rugby shorts (14565) | Rugby League Playing Shorts (only that tile, user 13 Nov) | MERGED -299 (RGSHORTS): yellow, navy waistband + hems, our number + wordmark; waistband and side-seam areas; no gusset on the model. MODELTEST: NOT PERFECT (preset brings back old shape, waistband top yellow, seam-cut logos, hidden side stripe, crotch glow, number accent, crest). RGSHORTS paused mid-fix (18:0x restart). OPEN (user 13 Nov 18:31, images 547 ours / 548 reference): folds look sharp and only on one side; the reference's vertical lines (gathered waistband, centre seam) do not show fully; the user asks whether the GLB's structure was changed. Image 549 (Tripo's own view of the model): the soft folds under the waistband show on BOTH sides there, so our viewer loses or sharpens them. SHORTSCHECK result 18:36 (measured, script SP2\SC\cmp.mjs): the shape is UNCHANGED from the GLB (18,891 triangles in both; all 9,871 points in the same place, largest difference 0.005 mm; normals are the GLB's own; 274 extra points are seam copies for printing). Folds are in the GLB on both sides about equally; the waistband gathers (ripples about 2 mm) and the centre front seam (ridge about 4 mm) are in the shape too. Causes on OUR side (read in code, not seen): one strong light from the upper left (studio.js:32, 2.55) with weak fill from the right (studio.js:41-42, 0.36), exposure 1.4 on bright yellow (main.js:121), no baked fold shade for this model (tripo-rugby-shorts.mjs:216 shade all 1; main.js:299 expects it); band printed solid navy with the wordmark over it (texture.js:2057, 3145, 3264), no gather lines, stitch rows or seam line painted; the bends are real corners in Tripo's mesh (about 100 edges per side over 40 degrees). 16 Nov user (image 554): NO made-up curls, no baked fold shading, no normal smoothing, no painted lines: show the GLB exactly; only the light / exposure / shine of this tile changes so the GLB's own folds read as in Tripo. (Superseded plan:) more even light / fill for this tile, bake soft fold shading in the converter, paint fine vertical gather lines + two stitch rows on the band and a centre seam line (print and relief); only if still sharp: soften the lighting of the fold edges (normals averaged over about 1 cm, points not moved). Then MODELTEST's 8 findings |
| 3 | Full rugby kit (14134), socks only | Rugby League Socks tile only | MERGED -300 (RGSOCKS): navy, our yellow 3 on the shins; band, hoops, heel, toe areas. MODELTEST: NOT PERFECT (preset old shape, jagged side seam + colour leaks, seam-cut logos, 3 mark too low + extra wordmark, ragged foot patterns, hidden hoops, edge glow, wavy ribs). Fixes queued for RGSOCKS after RGSHORTS (fewer agents at once) |
| 4 | Basketball V-neck (92705) | Basketball singlet tile only (user 13 Nov) | DONE 13 Nov (viewer -297): yellow, charcoal V-neck and armholes, our 3 mark + 3DEEZI across the chest; MODELTEST: NOT PERFECT (11 findings: presets bring back the old shape for ALL new models, patterns torn across the chest, side panels, seam-crossing logos, mark sizes, mesh stretch, 2D board, inside colours, hem band, shine). Round 2 merged -306. Round 3 merged -310 (13 Nov 18:35, user image 540): the model's whole neck binding is taken off and one binding of ours runs all the way round (no corners at the shoulders in front and 3/4 views); the inside is one even colour (Reverse if set, else Main). Round 4 merged -313 (13 Nov 19:00, user image 550 "on left and right it is still missing some black strip"): the band now runs unbroken across both strap tops from the front (I saw the picture); in both 3/4 views a small dark lump / jagged bits remain at each strap top. Independent tester + skeptics: workflow wf_42b492bf-342, pictures SP2\VERIFY313\neck. 16 Nov user image 551: a HOLE through the strap top (between neck band and armhole band, seen from behind-above) on -313; BBSINGLET fixing (-314). STILL OPEN: that lump at the strap tops (next round, only that), the back-neck size label looks partly covered by the new band, side strip edge follows the model's zig-zag seam, speed test + website Studio / app not re-run. Agent BBSINGLET ab55c7d0c2b3fe25e |
| 5 | Basketball full kit (151692) | Basketball shorts (longer) | DONE earlier: basketball-shorts.glb |
| 6 | Netball dress (22007) | Netball dress | DONE: the client APPROVED the current dress (netball-dress.glb, 12 Nov) on 13 Nov; not remade |
| 7 | Netball bib (37504) | Netball bibs tile only | IN PROGRESS again: netball-bib.glb (agent NBBIB) |
| 8 | Soccer jersey (138303) | Football jersey tile only | IN PROGRESS: soccer-jersey.glb (agent SCJERSEY) |
| 9 | Aussie rules singlet (11230) | AFL guernsey tile only | IN PROGRESS 16 Nov: aussie-rules-singlet.glb (added 10:23), agent AFLSINGLET ab55d3d224beb12b8 |
| 10 | Baseball jersey (41138) | Softball jersey (two-button placket; full-button variant later) | To do |
| 11 | Cricket polo jersey (39858) | Cricket shirt (+ long-sleeve variant), cricket trousers (separate) | To do |
| 12 | Polo shirt (75906) | All polos (20 tiles) | GLB added 16 Nov 11:48 (polo-shirt.glb); queued for BBSINGLET after AFL, via the shared recipe |
| 13 | Training shorts (131096) | Training shorts (men and women models) | GLB added 16 Nov (training-shorts.glb, men); queued for BBSINGLET after the hoodie |
| 14 | Training suit (86789) | Track jacket + track pants | track-jacket.glb added 16 Nov, queued for BBSINGLET after training shorts; track-pants.glb added 16 Nov, queued after the jacket |
| 15 | Tracksuit (11007) | Tracksuits (+ hooded version) | tracksuit-jacket.glb + tracksuit-pants.glb added 16 Nov, queued |
| 16 | Women's leggings (103553) | Leggings, running tights, compression spats | To do |
| 17 | Women's fitness kit (117908) | Gymwear top + bottoms | To do |
| 18 | Tennis skirt (49992) | Netball skirt, tennis skirt (+ skort / inner-short variant) | To do |
| 19 | Women's sport kit (60421) | Women's fit reference | Reference only |
| 20 | American football kit (14776) | Game Jersey, Practice Jersey, Game Pants | To do |
| 21 | Rashguard (117732) | Rash guards (short and long sleeve = 2 models) | To do |
| 22 | Fishing hooded jersey (100509) | Fishing hoodie / shirt (non-hooded variant later) | To do |
| 23 | Fightwear fit (141063) | MMA shorts and Muay Thai shorts (separate shapes) | Reference only; shorts to do |
| 24 | Basketball hoodie (50942) | Hoodies (pullover) + zip hoodies | GLB added 16 Nov (basketball-hoodie.glb, pullover); queued for BBSINGLET after the tee |
| 25 | Puffer vest (154580) | New: puffer vest (+ sleeved puffer) | To do |
| 26 | Windbreaker (31265) | Waterproof jacket (+ hood) | To do |
| 27 | Women's windbreaker (131105) | Women's jacket | To do |
| 28 | Bucket hat (82642) | Bucket hats | To do (ours is finished; replace only if you want) |
| 29 | Beanie (141316) | Beanies | To do (ours is finished; replace only if you want) |
| 30 | Training tee (112791) | All training tees (men, women, youth) | GLB added 16 Nov (training-tee.glb); queued for BBSINGLET after the polo, via the shared recipe |
| 31 | Raglan tee (38600) | Raglan / long-sleeve tee | To do |
| 32 | Training singlet (106702) | Other sports' singlets (netball, athletics, tennis …) | To do |
| 33 | Baseball cap (95707) | Caps | To do (ours is finished; replace only if you want) |
| 34 | Women's rugby kit (14524) | Women's rugby jersey (V-neck) + shorts | To do |
| - | Soccer rotation (99354), Hoodie rotation (70681) | Presentation benchmarks | Not models |

Remaining coverage the client also wants (no reference yet): rugby league and union collar variants (I build these on the jersey), reversible basketball set, netball separate singlet and skirt, training bib, standalone socks, cricket trousers, MMA and Muay Thai shorts, non-hooded fishing shirt, short-sleeve rashguard, full-button baseball jersey, softshell, waterproof hooded jacket, sleeved puffer, long parka, pullover hoodie, hooded tracksuit, pocketed pool/darts polos, workwear and hi-vis, sports bra, crop top, bike shorts, skort.

## How to make each one (Tripo)
1. Take the client's reference picture (front view). Remove their text and logos, so the model has none baked in.
2. One garment per model: cut kits into jersey, shorts and socks. For shorts use a shorts-only picture (in kits the shirt hides the waist). Socks without boots.
3. Tripo: Smart Mesh, Quad, about 10,000 polycount, Private, Generate Multi-Views (check the back looks right), export GLB.
4. Save it as D:\3d-app\tripo\<garment>.glb (for example rugby-shorts.glb) and tell me which tiles it is for.

## Rule
Each model goes ONLY on the tile(s) you name; nothing else changes (user 13 Nov).

## Queue (17:58, user: one agent per model, finish within an hour; memory watched)
Running model agents: BBSINGLET (singlet round neck + inside colour), RGSHORTS (shorts findings), RGSOCKS (socks findings), SCJERSEY (Football jersey), NBBIB (bib final checks).
Testers: MODELTEST = Rugby League jersey only; workflow "model-testers-parallel" (run wf_db1f4cd3-675) = one tester per model (singlet, shorts, socks, bib, Football jersey), each waits for its model's new merge after 17:58, then tests; a skeptic confirms the findings.
Memory guard: a monitor warns when RAM < 1.5 GB or commit < 3 GB; testers check free RAM before every browser.

## Next to send
**Aussie rules singlet (Yellow Images ID 11230)**: singlet only, front view, text removed. Save as afl-guernsey.glb and tell me the tile (e.g. AFL > AFL guernsey).
After that: Polo shirt (75906), then Training tee (112791).

## Direct approach (user 16 Nov)
Ready-made models: colour the model's OWN parts (its bands, cuffs, hems, collar, panels are its borders), our marks at the card positions, the model's own neck; one check, merge, next. Extra neck styles in a second pass after all queued models.

## Queue added 16 Nov (afternoon, waiting for the fresh agent): rashguard.glb, women-leggings.glb, women-fitness-top.glb, women-fitness-bottoms.glb (after tracksuit-pants.glb)
