# Test steps

How to test each finished task. A task is removed from here once you've tested it. (Older steps, already tested, were cleared on 2026-10-23; the last full copy is in git main 2d9b553.)

---

## Garment pictures match the design (Rugby, Netball) (2026-10-23)
1. Create › Design Your Own › Rugby League (computer, 1440 wide): 11 tiles in black and cyan; the kit has the socks on its right with the feet turned out; Socks tile feet splayed; bucket hat with a wide brim; Jersey is a V-neck with cyan sleeves.
2. Rugby: the same 11 pictures, first tile "Rugby Kit".
3. Netball: the 8 pictures match the design; the bibs show only GS and C.
4. At 1024 and on a phone: pictures sharp, no dark square or faded edge.
5. Football or Tennis: their pictures still show.
6. App › Design › Rugby League and Netball: the same new pictures.

---

## Invoice PDF shows GST (10%) (2026-10-23)
1. Open any priced invoice › Download PDF (as a customer, and in Admin › Invoices): the tax line reads "GST (10%)", not "GST (1%)".
2. The same on a 3DEEZI TEAM invoice and on a deposit or paid receipt.

---

## Review page keeps the garment name (2026-10-23)
1. Design Your Own › Netball › Netball bibs › save the design.
2. Orders › Create Order Form: add a row with that design and sizes › Review order.
3. The section title says "NETBALL BIBS", the price note says "Netball bibs", and Download review PDF shows "01 — NETBALL BIBS".
4. App: My orders › Create Order Form › pick that design › Review: "NETBALL BIBS".

---

## Homepage on phones shows AI · DYO · HOME (2026-10-23)
1. Open the homepage on a phone (or a 390 / 414 / 430 px window), signed out and signed in.
2. The three icon pills show bottom-left (HOME ringed); Sign in or bell / avatar and ☰ stay bottom-right; the big logo is clear above; no sideways scroll.
3. Each pill opens the AI designer, Choose your sport and the homepage.

---

## App Home: four picture tiles (2026-10-23)
1. Open the app on a phone (or the app preview at 390 wide) › Home: the 3DEEZI logo and bell, "What would you like to create?", "Choose how you want to start.", four picture tiles, "Need a hand? Ask 3DEEZI Assist →", one grey "Convert an image to 3D" line, the bar Home · Projects · Orders · Profile. No round Assist button on Home.
2. AI DESIGNER opens the AI designer; DESIGN YOUR OWN opens Choose your sport; ARTBOARD opens the Artboard; 3DEEZI TEAM opens the TEAM page.
3. "Ask 3DEEZI Assist" opens the chat and the round button shows; closing the chat hides it again.
4. Signed in, the bell opens your notifications.
5. "Convert an image to 3D" opens the picture picker (or says Convert needs AI).
6. At 360, 430 and tablet width: still two by two, nothing cut off.
7. Projects and Studio still show the round Assist button.

---

## App Orders tab and new bottom bar (2026-10-23)
1. App (390 wide), signed in: the bar shows Home · Projects · Orders · Profile; Assets is no longer in the bar.
2. Orders: "ORDER WITH 3DEEZI", CREATE ORDER FORM and UPLOAD YOUR ORDER tiles, the wide MY ORDERS tile, the Rewards "Coming soon." strip and the Assist link; the Orders cube is filled cyan.
3. CREATE ORDER FORM opens the order form; UPLOAD YOUR ORDER opens the upload screen.
4. MY ORDERS opens My orders with its bell; open an order; an unpaid invoice shows PAY NOW. Back returns to the Orders tab.
5. "Need help? 3DEEZI Assist" opens the chat; closing it hides the round button again.
6. Projects › "Assets" (top left) opens Assets with a Back arrow. Profile › Asset library opens Assets; Profile › Orders opens the Orders tab.
7. Signed out, the Create or Upload tile asks you to sign in.
8. At 360, 430 and tablet width nothing overflows.

---

## App: uploaded orders open (2026-10-23)
1. App › Orders › UPLOAD YOUR ORDER: add a PDF › send › VIEW MY ORDER: the order shows "Quote required", the PDF under Files and the update (before, a grey screen).
2. Once 3DEEZI issues that order's invoice: My orders › the order › PAY NOW opens the pay page.

---

## App Assist opens the order form and upload screens (2026-10-23)
1. App › Assist: ask for help with an order form › tap "Create order form" (or let Assist open it): the Orders tab opens with the order form on top.
2. Ask to "upload my order form": Upload your order opens.
3. Signed out, both ask you to sign in.

---

## American Football garments (16 tiles) (2026-10-23)
1. Website › Create › Design Your Own › American Football: "AMERICAN FOOTBALL UNIFORMS & TEAMWEAR", "Choose your game uniform, practice wear or sideline apparel.", 16 tiles four by four with names only, on a night football field with a goal post.
2. Game Pants, Compression Shorts, Game Socks, Cap, Bucket Hat and Beanie say COMING SOON and can't be chosen.
3. "Select a garment to customise." sits between Change sport and Continue to studio.
4. Pick Game Jersey › Continue: the Studio shows "American Football · Game Jersey". Save it: My projects shows that name.
5. Hooded Tracksuit opens the track jacket with a hood.
6. Netball, Rugby or Tennis: still their descriptions, usual subtitle and stadium background.
7. App › Design Your Own › American Football: the same tiles, texts and field; Game Jersey › Continue shows "American Football · Game Jersey".
8. Orders › Create Order Form: add saved American Football designs (Game Jersey, Varsity Jacket) with sizes › Review order: each section has the design's name; a garment with no price yet says "Quote required — No price is set for … yet" (never NaN). Admin › Orders and Admin › Projects show the same names.

---

## AI designer no longer goes blank on a bad AI reply (2026-10-23)
1. Create › AI designer › pick a sport › write a brief › pick a garment › generate.
2. If the AI is busy or sends a bad reply, the page shows "The AI designer is busy or unavailable right now…" with Try again; it never goes blank. The same for Refine, Make it 3D and Convert ("The converter sent an unexpected reply. Please try again.").

---

## Hooded Tracksuit from the AI designer keeps its hood (2026-10-23)
1. Website: Create › AI designer › Rugby League or American Football › brief › Hooded Tracksuit › a design › Customise in 3D Studio: the Studio says "… · Hooded Tracksuit" and the track jacket has a hood. Waterproof Jacket the same.
2. App: AI designer › the same steps: the jacket has the hood.

---

## Artboard faster (2026-10-23)
Open /artboard and press Ctrl+F5; the status bar shows 2026-10-23-5. In the app, open the Artboard screen.
1. Make a busy page: about 10 shapes and texts plus a photo, then Ctrl+A and Ctrl+D a few times until there are 100+ objects.
2. Drag one object quickly: it follows smoothly and the drop is instant. Ctrl+Z puts it back; Ctrl+Y moves it again.
3. Shift+click two objects far apart in the stack and drag them: smooth, and objects above them still cover them.
4. Ctrl+A and drag everything: smoother than before; the drop is instant.
5. Arrow keys: each press moves at once; Ctrl+Z undoes one press at a time.
6. Click objects and the empty page: the selection shows at once.
7. Switch tools (V, F6, F8, the toolbox, flyout tools, your + buttons): instant; flyouts still show the last tool used.
8. Move or turn an object with a connector: the connector follows at once.
9. File › Save to my account, reload, File › Open from my account: the same design. Export PNG, SVG and PDF: as before.
10. Put an object with a blend mode (e.g. Inner Shadow set to Multiply) on top and drag something under it: it still looks right.

---

## Artboard: two-finger pinch zoom on phones (2026-10-23)
1. On a phone (or a browser in device mode at 390 wide), open /artboard; the status bar shows 2026-10-23-5.
2. Pinch with two fingers: the page zooms around the point between your fingers (before, it only moved the page).
3. Drag an object with one finger: smooth. Press and hold an object: its menu opens. Press and hold an empty part of the page: the page menu opens.
4. App › Artboard: the same three checks.

---

## "New AI design" saves as a new project (2026-10-23)
1. My projects › open a saved kit › in the Studio ⋮ › New AI design › Generate › ⋯ › Customise in 3D Studio › Save.
2. A new project appears in My projects; the kit you opened is unchanged.

---

## Track jacket keeps its collar after a hooded tile (2026-10-23)
1. Design Your Own › Rugby League › Hooded Tracksuit, then Change sport › Football › Track jacket › Continue: the jacket has the collar, not the hood.
2. App: the same with Soccer, in Design Your Own and in the AI designer chips.

---

## Admin Pricing fits phones (2026-10-23)
1. Admin › Pricing on a 390 px phone (also 360 and 430): the price list fits the screen, no sideways scroll.

---

## 3D look step 2: folds, mannequin, thicker hems (2026-10-23; on v2 only, not in the live package)
Where the v2 branch runs (or locally), open the Studio with a hard refresh.
1. Jersey: natural folds from the armpits, at the waist and lower back, under the sleeves; a dark display mannequin (hips below the hem, upper arms in the sleeves, a short chrome stand into the podium); a thicker collar and hem; a soft sheen on the shoulders.
2. All 11 garments: folds and the mannequin; the neck size label still shows; logos, names, numbers and artwork sit where they did.
3. Add ?quality=flat to the address: exactly the old look.
4. Phone (website and app): the same look; the kit turns as smoothly as before.
5. Still as before: dragging artwork onto the kit, 2D panels and export, Design sheet PDF (new look in its pictures), save and reopen, print layouts, admin order kit pictures.
6. Open and leave the Studio 30+ times in one session: the 3D loads every time.

---
