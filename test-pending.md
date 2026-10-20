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

## Website: 3D and design

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

### 9b. My design picture for jersey, tee and polo, and Convert
1. Studio → Artwork → My design picture: upload a flat **jersey** drawing (front and back side by side). The check screen says Garment: Jersey, with front and back named. Click Put on the 3D kit. Check front, back and side: the pattern, the logos, the sleeves and round crests.
2. On the check screen, change the garment to Training Tee, then to Polo: the kit changes garment and the drawing goes onto it.
3. **/convert**: upload the same picture → **PUT MY DESIGN ON THE 3D KIT**. The Studio opens with the check screen; put it on, Save, and open the project again: the design comes back.
4. Upload a flat tee drawing with **short (cap) sleeves**: the 3D tee has the same short sleeves and the print is not stretched. Then one with **long sleeves** (up to about 1.3 times a normal tee sleeve): longer 3D sleeves. A drawing with normal sleeves looks as before.
5. Known limit: the neck shape stays the 3D garment's own (crew or V from the drawing comes later).

### 10. Print-layout shorts scaled evenly
In the Studio, with the Leopards print layout on (Artwork → Factory print layout), choose Garment **Shorts** or **Full Kit**. The shorts are 12% bigger in all directions; the logos keep their shape and the waistband stays under the tee.

## Artboard

### 11. Toolbox flyouts (17 buttons)
1. Open the Artboard (Ctrl+F5).
2. **Rectangle** (button 8): click its small triangle, right-click it, or click it twice. The flyout has every shape tool: Rectangle, 3-Point Rectangle, Ellipse, Polygon, Star, … Sport Badges. Pick Ellipse: the button now shows Ellipse.
3. **Interactive Fill** holds Mesh Fill and Smart Fill.
4. **Contour** holds Blend, Drop Shadow, Inner Shadow, Block Shadow, Extrude, Distort and Envelope.
5. Shortcuts still work: F6 rectangle, F7 ellipse, Y polygon.

### 12. Selection handles, as in CorelDRAW
1. Draw a rectangle, press V, click the empty page, then click the rectangle: **8 small squares** for sizing.
2. Click it again:
   - **curved arrows** at the corners rotate it;
   - **straight arrows** on the sides slant it;
   - the **circle** in the middle is the centre of rotation, and you can drag it.
3. Click again: back to the squares.
4. Text: a second click shows the rotate handles. **Double-click** a text to type in it (two quick taps on a phone).

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

## Homepage

### 15. 3DEEZI Rewards banner and the chat on the homepage
1. At the bottom of the homepage: a gift box, 3DEEZI REWARDS, "Something rewarding is on the way." and a **COMING SOON** pill (not clickable). It and ORDER NOW are full width.
2. On a computer (window 1200 px or wider) the chat opens by itself at the top. Scroll down to ORDER NOW: the chat folds into its button. Scroll back up: it opens again.
3. The three creation cards always use the full width, with the chat open or closed; the open chat floats over the right card.

### 15b. Header AI and DYO buttons
1. At the top right, next to **Start a kit**: **AI** and **DYO** are equal pills in the cyan-to-violet gradient, with the icon on the left, as tall as Start a kit (like the Artboard's buttons).
2. Hover: the gradient moves, the pill glows and the icon turns slightly.
3. Make the window narrower: the pills shrink and never overlap the menu; below 800 px they are in the menu.

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

---
