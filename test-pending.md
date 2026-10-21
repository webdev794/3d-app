# Waiting for your test

Finished work that I have checked myself, with how to test each item. When something works, tell me and I'll remove it from this list. When it doesn't, tell me what you saw.

**Where to test**
- **Website:** http://127.0.0.1:8000. The live site only gets these after you upload the next package. Press Ctrl+F5 once after an update.
- **App preview:** http://127.0.0.1:8088. This is the web build of the phone app.
- **Accounts:** sign in with your own account. Steps marked **(admin)** need your admin account.
- **Costs:** steps marked **(AI credit)** call OpenAI and cost a little.
- **Payments:** test mode works only on this computer; no real card is charged.

---

## Website: ordering




### 4. Upload Your Order (Orders → Upload Your Order)
1. Your contact details are already filled in; **Edit** changes them.
2. Drag an Excel, CSV or PDF order form into the big box, or use **BROWSE FILES**. You see a progress bar, then **✓ Uploaded**, plus **Replace** and ✕.
3. Try a wrong file type (e.g. an .exe): it is refused with the reason.
4. Optional: artwork files and additional instructions.
5. Open the **3DEEZI ASSIST** bar. Try "Which files should I upload?". Then try "I don't have an order form": it goes to Create Order Form with your details carried over.
6. **Save draft**, then **REVIEW ORDER**.
   - If garment rows were read from an Excel form, check them and tick **These details are correct**.
   - Without confirmed rows, the price shows **Quote required**.
7. **Confirm order** shows a reference and **View my order**.

### 5. My Orders (Orders → My Orders)
1. A board with five stages (Order Received, Design & Approval, Production, Shipped, Delivered) and a count on each.
2. Each card shows the reference, name, garment picture, number of garments, a status pill and the latest update.
3. Try the search box and the **Current orders / Completed** tabs.
4. Click a card: the order panel shows garments and sizes, files, design proofs, updates and delivery.
5. **REVIEW DESIGN** appears when staff ask for approval (see 6). Approve the design (confirm it), or **Request changes** with a note.
6. **TRACK DELIVERY** appears after staff add tracking: carrier, number and the carrier's link.
7. On a phone there is a stage bar at the top; tap a stage or swipe.

### 6. Admin › Order board (admin)
1. Go to **Admin → Order board**.
2. Drag a card from Order Received to Design & Approval. The customer's My Orders shows the new stage after a refresh.
3. Open an order:
   - post an update marked **Customer-visible** or **Internal only**;
   - upload a **proof** as Customer-visible. The customer now sees **Approval needed** and **REVIEW DESIGN**.
4. Move it to **Production** without approval or payment: you get a warning. Going on anyway needs a reason, which is saved in the history.
5. Add a courier, tracking number and link, then move it to Shipped. The customer gets **TRACK DELIVERY**.
6. Internal notes and files never show to the customer.

### 7. Payments
1. After **Confirm order** on Create Order Form, click **PAY NOW**. The pay page opens: invoice on the left, payment on the right, and a TEST banner.
2. Choose **Approve**: you see **Payment received** with a receipt. Or choose **Decline**: "Payment failed… try again".
3. **Download invoice** gives the PDF.
4. Locally, emails go to the log file (storage/logs/laravel.log) instead of being sent.
5. **(admin) Admin → Pricing:**
   - Price list: garments, extras, shipping, discounts.
   - Business & invoices: name, ABN, logo, bank details, the rule before production.
   - Online payments: Stripe status and the webhook address.
6. **(admin) Admin → Invoices:** open a **Quote required** one, type the missing prices, then **Issue invoice and email the customer**. Also try mark paid, resend, refund and cancel.

### 7b. Price choices at the review (website and app)
1. **(admin)** Admin → Pricing → Price list: add a second destination (e.g. New Zealand), an extra customers can choose (e.g. Express production) and a discount code (e.g. TEAM10, 10%). Locally there is only Australia, with no extras or codes.
2. **/orders/new**: add 20 jerseys, then **REVIEW ORDER**. The price shows Australian shipping and GST.
3. Change **Delivery to** to New Zealand: shipping and GST change.
4. Tick Express production: it shows as a line and the total goes up.
5. Type NOPE and press **Apply**: "This code isn't valid." and the total stays. Type TEAM10 and Apply: a discount line, and the total goes down.
6. **Confirm order**: the invoice total equals the reviewed total. Open the invoice and check its lines.
7. **Upload Your Order**: the same, after ticking **These details are correct**.
8. **App:** Create order form and Upload order give the same choices and totals; after Confirm, the invoice matches.

### 7c. Payments through Airwallex (2026-10-21)
- **On this computer (test mode, no keys):** a customer's unpaid invoice → **Pay now** → the TEST form → **Approve**: Paid with a receipt; **Decline** on another: "Payment failed", and trying again works. **(admin)** Admin › Pricing › Online payments shows "Test mode" and the Airwallex webhook address with a copy button.
- **With the client's demo keys (later):** Admin › Pricing › Online payments shows "Airwallex connected (demo)". Pay an invoice: Airwallex's page opens (our page shows an AIRWALLEX DEMO banner); pay with an Airwallex test card → back on the invoice: "Confirming your payment…", then **Paid** with the card's last 4 digits and a receipt. Also: a declined test card; Back on Airwallex's page ("The payment wasn't completed"); **(admin)** Admin › Invoices › Refund → Refunded, and the refund shows in Airwallex; in the app, Pay now → pay → the order shows Paid.

### 7d. App: Pay now in the phone's browser (2026-10-21, needs an app build on a phone)
1. App → Orders → an order with an unpaid invoice → **PAY NOW**: the phone's browser (Chrome or Safari) opens the pay page, already signed in.
2. Test mode: **Approve** → "Payment received" → switch back to the app: the order shows **Paid** within a moment.
3. With Airwallex demo keys: Airwallex's page shows Card, plus Google Pay (Android) or Apple Pay (iPhone with a card in Wallet).
4. Switch back without paying: still Awaiting payment, and Pay now works again.
5. In the web app preview (http://127.0.0.1:8088), Pay now opens a new tab as before.

## Website: 3D and design

### 8. AI designer page, new design (2026-10-21)
1. Click the cyan **AI** button at the top right (or http://127.0.0.1:8000/create/ai). You see the big 3DEEZI logo, "DESIGN WITHOUT LIMITS", one bar "Describe your design..." and a row of sport photos.
2. Click **Basketball**: it gets a teal frame and the page stays put (click again to clear it).
3. The picture button in the bar: choose a logo; a small copy appears inside the bar.
4. Type a brief and press the round teal arrow (signed out: sign in, then it starts by itself with your text, logo and sport).
5. On the results, **Refine your brief**: your text, logo and sport are still there.
6. Choose **Fishing**, type a brief without a garment: buttons ask which garment; tap one and it starts.
7. **+** in the bar: "Attach logos or artwork" and suggestions such as "Club polo".
8. Paste a very long text: it is kept up to 4,000 characters, with a counter near the end and no error.
9. While it generates, the "Creating your design…" circle shows the spinning 3DEEZI emblem; with the HD mockup on, the "Rendering your HD mockup…" circle shows the same small glowing emblem inside the circle, with no grey square.
10. On a phone the bar stays in the middle and the sports row swipes. **App:** AI Designer shows the same; tap Netball, type, tap the arrow, choose the garment.

### 8a. AI designer like ChatGPT, and MAKE IT 3D (2026-10-21) (AI credit)
1. Header **AI** → Training, Singlet. Brief: "Create a cool training singlets using this for the theme and main logo"; attach the BLITZ logo; HD mockup ticked → CREATE.
2. A one-line art direction shows above the mockup. The mockup: a bold sublimated singlet, the logo large on the front, BLITZ over a number on the back, front and back in a dark stadium, the small 3DEEZI neck label. The 4 concepts show the BLITZ logo on the chest.
3. **MAKE IT 3D** (about a minute): a flat front and back sheet appears (also in Assets), the Studio's check screen, then the design on the 3D singlet.
4. The same in the app (AI designer → mockup card → MAKE IT 3D).
5. A brief asking for a white studio background gets one; an attached complete design is kept exactly.

### 8c. MAKE IT 3D and the AI designer fixes (testing round, 2026-10-21) (AI credit)
1. Generate with the HD mockup on, then **MAKE IT 3D**: while it draws, CUSTOMISE IN 3D STUDIO is greyed out. About a minute later the Studio opens with the check screen; put it on: your design is on the kit. No "3D preview could not load", no "Creating AI print".
2. Press MAKE IT 3D, then at once "Refine your brief" (or another page): you stay where you are; the sheet waits in Assets.
3. Generate with the mockup on, Refine, switch the mockup off and generate a new brief: the old mockup does not appear.
4. Fight Wear tile, a brief without a garment, pick Shorts; then the Fishing tile and a brief without a garment: the Fishing garment chips appear.
5. Convert: PUT MY DESIGN ON THE 3D KIT, then Convert again → CONVERT TO 3D → OPEN IN 3D STUDIO: the Studio shows the converted kit, not the old picture.
6. **App:** concepts → MAKE IT 3D → Back: you stay on the brief and see "Your print sheet is ready in Assets › Artwork."

### 8b. Design your own: "Choose your sport" tiles (2026-10-21)
1. Home → **START DESIGNING** (or the **DYO** pill in the header). Under the heading: **ALL · SPORTS · APPAREL** and one row of tiles, with RUGBY LEAGUE glowing.
2. Click **BASKETBALL**: the basketball kit comes to the front and the button says **DESIGN BASKETBALL**; you stay on the page.
3. Click the big arrow beside the kits a few times: the glowing tile follows the kit in front.
4. **SPORTS**: Training disappears. **APPAREL**: only TRAINING shows and its kit comes to the front.
5. On a narrow window, the small arrows beside the row show more tiles; on a phone, swipe the row.
6. **DESIGN …** opens the garment step for that sport.
7. **App:** Create → START DESIGNING: the same filters and tiles; tap NETBALL → DESIGN NETBALL; swipe the kits and the glowing tile follows.

### 8. AI designer: pictures in the brief (header **AI** button)
1. Copy a picture and press Ctrl+V in **Your design brief**. It appears under **YOUR LOGOS, DESIGNS & REFERENCES**. Dragging a file onto the brief also works (cyan highlight); **Add image** takes several. Up to 4 pictures.
2. The **My design in 3D** chip writes a brief for turning your design into a 3D presentation.
3. **(AI credit)** CREATE MY DESIGN, with the HD mockup ticked, makes a mockup that keeps your design. You already checked this mockup.

### 9. My design picture on the 3D singlet
1. Go to Studio → Artwork → **MY DESIGN PICTURE** → Upload my design picture.
2. Use a **flat** design: front and back drawn side by side on white, like the client's 818 INK snapshot.
3. The check screen shows front and back, with garment Singlet. Click **Put on the 3D kit**.
4. You should see:
   - **Front:** the full red pattern over the whole body, the mantis wordmark, and a round 818 INK crest.
   - **Back:** the big crest, centred and round.
5. Save, then open the project again: the design comes back.
6. On the AI designer's results, **PUT MY DESIGN ON THE 3D KIT** under an attached picture does the same.

7. **Photo-style mockups** (like the AI HD mockup on a grey background) work too. The check screen notes that the photo's lighting is printed onto the kit. A flat drawing gives the cleanest result.
8. Try a random photo (e.g. a stadium picture): the check screen says it looks like a photo or mockup and **Put on the 3D kit** stays disabled. Each shape card has Front / Back / Not used if you want to choose by hand.

### 9a. The AI mockup on the singlet (2026-10-21, viewer 2026-10-20-10)
Studio → Artwork → **MY DESIGN PICTURE** → upload the AI HD mockup (3deezi-mockup.jpg) → **Put on the 3D kit** (Ctrl+F5 first).
- **Back:** the whole 818 INK ring shows; nothing cut off at the top.
- **Front (round 2):** the red centre line runs straight down the middle from the V to the hem; the crest sits by the pattern's middle, as on the mockup; the V is the same depth and strap width on both sides.
- **Back (round 3):** turn the kit round. There is red pattern between the neckline and the top of the big crest (a little less than on the mockup); the crest is round, centred and about as wide as on the mockup; the neckline is a clean, even black band.
- **Neck:** no black lump on the right strap.
- Your flat 818 INK drawing looks exactly as before.

### 9c. Neck label and inside colour (2026-10-21)
1. Studio: pick a dark Jersey and turn the 3D kit to the front. Look into the neck opening: a light label with **3DEEZI**, "AI SPORTSWEAR DESIGNER" and a big **L**; the inside is dark like the shirt.
2. Turn to the back: the label doesn't show through.
3. A white or yellow kit: the inside is light.
4. Try Singlet, Training Tee and Polo, then your 818 INK design picture: black inside with the label. Shorts have no label.
5. The same in the app.

### 9d. No moving line behind the kit (2026-10-21)
1. Open the DYO Studio (any kit). At the kit's waist height there is no straight dark line across the stadium; the stands run softly into the wet floor.
2. Drag the kit round slowly, then click Front, Back, Side and 360°: nothing in the background slides, tilts or jumps; only the kit turns.
3. Zoom in and out and drag up and down: still no hard line.
4. The same on a phone, in the app, on the AI designer results and on Convert.

### 9e. Presets and a design picture (testing round, 2026-10-21)
1. AI → MAKE IT 3D (or Artwork → My design picture), so the kit shows your design picture.
2. Click any **Preset design**: the 3D kit changes to the preset and a notice says it replaced your design picture. Click another preset: it changes again.
3. Undo twice: the first preset, then the design picture come back. Or Artwork → My design picture → **Put my design picture back**.
4. The same with a factory print layout (Leopards PDF): **Put the print layout back**.
5. With a design picture on, click a pattern, a palette or CHOOSE GRADIENT: the change shows, the picture comes off with a notice, Undo brings it back. Typing a player number or switching to Jersey keeps the picture on.
6. Set a Secondary gradient, then choose a preset: no gradient is left and the preset shows its tick.
7. **App:** add a text or logo, then choose a preset: the text or logo stays.
8. **Phone (390 px):** the Ask bar reads "Ask 3DEEZI…" and scrolling shows the Colours tabs above it.

### 9f. YOUR DESIGN card (2026-10-21)
1. AI → MAKE IT 3D (or Artwork → My design picture), then click two Preset designs.
2. The first card in Preset designs is **YOUR DESIGN**, with a picture of your kit. Click it: your design is back and the card is ticked. Undo goes back to the preset.
3. **My designs** also starts with YOUR DESIGN, then your saved projects.
4. Save, open My projects, open the kit: YOUR DESIGN is still offered (website: same browser; app: until the app is closed).
5. A colour-only design: pick a palette, then two presets: YOUR DESIGN brings your colours back. A brand-new kit that only tried presets shows no YOUR DESIGN card.

### 9b. My design picture for jersey, tee and polo, and Convert
1. Studio → Artwork → My design picture: upload a flat **jersey** drawing (front and back side by side). The check screen says Garment: Jersey, with front and back named. Click Put on the 3D kit. Check front, back and side: the pattern, the logos, the sleeves and round crests.
2. On the check screen, change the garment to Training Tee, then to Polo: the kit changes garment and the drawing goes onto it.
3. **/convert**: upload the same picture → **PUT MY DESIGN ON THE 3D KIT**. The Studio opens with the check screen; put it on, Save, and open the project again: the design comes back.
4. Upload a flat tee drawing with **short (cap) sleeves**: the 3D tee has the same short sleeves and the print is not stretched. Then one with **long sleeves** (up to about 1.3 times a normal tee sleeve): longer 3D sleeves. A drawing with normal sleeves looks as before.
5. Known limit: the neck shape stays the 3D garment's own (crew or V from the drawing comes later).

### 10. Print-layout shorts scaled evenly
In the Studio, with the Leopards print layout on (Artwork → Factory print layout), choose Garment **Shorts** or **Full Kit**. The shorts are 12% bigger in all directions; the logos keep their shape and the waistband stays under the tee.

### 10b. Gradient Presets (DYO Studio > Colours) (2026-10-21)
1. Studio → **Colours** → **GRADIENT FILL** → **CHOOSE GRADIENT ›**: "GRADIENT PRESETS" opens beside the Colours panel; the kit stays the same size.
2. Click each of the 8 presets: the kit changes at once, the chosen one gets a cyan outline and tick, From / To follow; SUNSET shows "3 COLOURS".
3. **CREATE CUSTOM GRADIENT**: Add stop, type a HEX colour (e.g. FFD400), move Position: the kit updates live.
4. Close with X, Esc, or a click on the 3D kit: the gradient stays. Undo / Redo at the top work.
5. **SECONDARY** → BLACK / GOLD: only the trims change. **Turn gradient off · solid colour**: back to solid.
6. Back, Side, 360°: right all round. Export → 2D panels and Design sheet show it.
7. Save, reopen from My projects: still there. On a phone: a small sheet at the bottom. **App:** Colours → CHOOSE GRADIENT, the same.

## Artboard

### 11. Toolbox flyouts (17 buttons)
1. Open the Artboard (Ctrl+F5).
2. **Rectangle** (button 8): click its small triangle, right-click it, or click it twice. The flyout has every shape tool: Rectangle, 3-Point Rectangle, Ellipse, Polygon, Star, … Sport Badges. Pick Ellipse: the button now shows Ellipse.
3. **Interactive Fill** holds Mesh Fill and Smart Fill.
4. **Contour** holds Blend, Drop Shadow, Inner Shadow, Block Shadow, Extrude, Distort and Envelope.
5. Shortcuts still work: F6 rectangle, F7 ellipse, Y polygon.

### 12. Selection handles, as in the client's picture (build 2026-10-21-3)
1. Open the Artboard (Ctrl+F5 once). Draw a rectangle, press V, click the empty page, then click the rectangle: **6 small squares**, at the 4 corners and the middle of the left and right sides; nothing at the middle of the top or bottom.
2. Drag a corner: the shape grows or shrinks evenly. Drag the left or right middle: only the width changes.
3. Click it again: **curved arrows** at the corners rotate it, **straight arrows** at the middle of all 4 sides slant it, and the **circle** in the middle is the centre of rotation (you can drag it).
4. Click again: the 6 squares come back.
5. To change only the height: turn off **Keep proportions** on the top bar and type the height in the **H** box, or hold **Shift** and drag a corner straight down.
6. The same on a text, a picture, a group and two objects selected with Shift+click. Text: a double-click lets you type in it (two quick taps on a phone).

### 13. Contour tool
1. Type a word (F8), then pick **Contour** (Contour flyout). Drag outwards from a letter: dashed steps show while you drag; let go to apply.
2. On the property bar:
   - change **Steps** to 5, **Corners** to Miter / Round / Bevel, and the Fill and Outline colours. The contour updates at once.
3. Drag inwards for an inside contour. Try **To centre**.
4. **Remove**, **Undo**, and **Ctrl+K** (break apart).
5. Contours from older saved pages: select one and press Apply to clean it.

### 14. Two fixes from your test
1. **Variable Outline** (Artistic Media flyout): move over a shape and drag on its outline. It responds at once (it used to freeze).
2. **Palette:** make a To centre contour on green text. The DOCUMENT swatches at the bottom show just the text colour and the contour colour, with no run of greens.

### 14b. The Artboard feels smooth again (2026-10-21)
1. Open the Artboard (Ctrl+F5 once). The status bar shows build **2026-10-21-1**.
2. **File → New from template → Back name and number.** Add about 30 shapes (draw some rectangles and ellipses, then Ctrl+D a few times) and 2–3 photos (**File → Import**).
3. Drag a shape around quickly: it follows the mouse smoothly. **Ctrl+A**, then drag everything: still smooth.
4. Click objects one after another and press the arrow keys: each responds at once.
5. **Layers** tab: selecting, renaming, the eye and lock buttons, ↑/↓, delete and **Undo** show in the list as before.
6. Click different tools and open a few flyouts: no delay. Make the window narrower and wider: the page, rulers and the AI / DYO / HOME pills adjust smoothly.

### 14c. Artboard: the mouse pointer is an arrow (2026-10-21)
1. Open the Artboard (Ctrl+F5 once). The status bar shows build **2026-10-21-2** or later.
2. With the Pick tool, move over the empty page and over shapes and texts: the normal arrow, no four-way arrows. Drag a shape: the arrow stays.
3. The small squares round a selected shape show double arrows; click the shape again: the corners show the turning cursor, the circle in the middle a crosshair.
4. Hold the **Space bar**: the hand shows and dragging moves the view; let go and the arrow is back.
5. Over the rulers, toolbox, menus, bars and panels: the arrow; in boxes you type in (X, Y, sizes): the text cursor.
6. Other tools keep their own cursors (crosshair for shapes, hand for Pan, zoom glass, eyedropper).

### 14d. Artboard ↔ 3D Studio round trip (QA, 2026-10-21; automated in the QA tests, no code change needed)
1. Sign in, open the Artboard, draw a shape and add a text. Rename the shape, use the eye, lock and Bring forward in Layers, then Undo and Redo: the Layers list follows each step.
2. **File › Save to my account**: the name shows on the status bar.
3. **Send to 3D Studio › Send**: the Studio opens with the artwork on the left chest.
4. In the Studio, select that layer › **Edit in Artboard**: the same design opens. Change a colour › Send again: the button reads "Update on the kit" and the same layer updates (no second layer).
5. The AI, DYO and HOME pills on the Artboard top bar open the right pages; back on the Artboard the design is still there.

## Homepage

### 15. 3DEEZI Rewards banner and the chat on the homepage
1. At the bottom of the homepage: a gift box, 3DEEZI REWARDS, "Something rewarding is on the way." and a **COMING SOON** pill (not clickable). It and ORDER NOW are full width.
2. On a computer (window 1200 px or wider) the chat opens by itself at the top. Scroll down to ORDER NOW: the chat folds into its button. Scroll back up: it opens again.
3. The three creation cards always use the full width, with the chat open or closed; the open chat floats over the right card.

### 15b. Header AI and DYO buttons
1. At the top right, next to **Start a kit**: **AI** and **DYO** are equal pills in the cyan-to-violet gradient, with the icon on the left, as tall as Start a kit (like the Artboard's buttons).
2. Hover: the gradient moves, the pill glows and the icon turns slightly.
3. Make the window narrower: the pills shrink and never overlap the menu; below 800 px they are in the menu.

### 15c. Fixes from the testing round (2026-10-21)
1. **Homepage chat:** on a 1440×900 screen the chat is open at the top; scroll down to ORDER NOW and it folds; scroll back up and it opens again. On a large monitor (2560 wide) it is open at load.
2. **ORDER NOW on a phone** (or a window 390 / 600 px wide): "Create order form" and "Upload your order" show their pictures full width.
3. **App Profile:** signed out it shows "Guest" (not "Alex Morgan"); signed in, your own name.

### 22. New footer and pages
1. At the bottom of the homepage (and other pages, but not the Studio, Artboard or Admin):
   - a cyan line;
   - the 3DEEZI wordmark;
   - **About · Support · Privacy · Terms**, a divider and the **3DEEZI ASSIST** button.
   Scroll to the bottom: the floating chat button settles into the footer.
2. Open each page:
   - **About:** what 3DEEZI does.
   - **Support:** FAQs, an "Open 3DEEZI ASSIST" button and a contact form.
   - **Privacy** and **Terms:** marked "draft for the client to review".
3. On Support, send the contact form (name, email, message, optional order reference). It shows a thank-you. Locally the email goes to the log.
4. **(admin)** **Admin → Support** lists the message. Try the status (new / answered / closed), search and delete.
5. **App:** Profile menu → About, Support, Privacy, Terms open those pages.

## App (http://127.0.0.1:8088)

### 16. Ordering in the app
1. **Home:** "Order now with 3DEEZI" has three entries.
2. **Create Order Form** and **Upload Your Order** are native screens:
   - drafts;
   - "Help me add sizes";
   - uploads with progress;
   - review with the price (delivery, extras and a discount code change it), or "Quote required";
   - **Confirm order**, then the reference and **Pay now**, which opens the pay page.
3. **Menu → My orders:**
   - stage tabs and cards;
   - open an order: approve the design or request changes, the tracking link, and Download on each file.
4. The **bell** shows notifications; tapping one opens its order.

### 17. Other app items
- **AI designer results:** **Put my design on the 3D kit** under each attached picture.
- **Studio → Artwork tool → Upload my design picture:** the same as item 9.
- **Home:** the 3DEEZI Rewards card at the end.
- **Artboard:** the same toolbox, handles and Contour changes as the website.

---

## From yesterday, not yet confirmed

### 18. AI image editor
Use the **Edit** chip on AI concepts, **Edit image** under the HD mockup, in the Studio's Photoreal showcase and on Convert, or the **pen icon** in Assets. Try **Markup**, **Comment**, **Erase**, **Remove BG** and **Resize**. **(AI credit)** Describe edits → **Edit with AI** makes a new version; use ‹ › to switch versions, **Download**, and **Use this version**.

### 19. Order this kit: names and numbers
1. In the Studio, ⋮ → **Order this kit**. Tick **This design is final**.
2. Names and numbers: the same on every shirt, one per player (try **Paste from Excel**), or none.
3. **(admin)** The admin order page shows the names and numbers table.

### 20. Artboard designs in your account
1. **File → Save to my account** (Ctrl+S); **Open from my account** (Ctrl+O); **New from template** (4 starters).
2. **Send to 3D Studio**: choose the kit, a new kit or a project.
3. In the Studio, select that artwork → **Edit in Artboard**. Change it and send it again: the same artwork updates in place.

### 21. Leopards print layout in 3D
In the Studio, Artwork → Factory print layout → upload the LEOPARDS PDF. On the check screen click **Put on the 3D kit**. Check:
- the shorts' three-channel waistband, drawstring and pockets;
- the hem band, the same height front and back;
- the front and back folds;
- the tee's folds, including the upper-back V;
- shorts and Full Kit from the Garment buttons.
- **new (2026-10-21):** the sleeves. Turn the kit to the side and zoom in on a sleeve: the cuff band's rows run straight and level round the arm, the band is the same height at the top of the arm and underneath, and there is no V where front and back meet. Check from the front and back too.

---
