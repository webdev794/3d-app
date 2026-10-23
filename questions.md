# Open questions

Questions waiting for your answer. Each one is also asked in the chat; once answered, it is removed from here. My suggested answer is in brackets under each question. I go ahead with my suggested answer where I can decide (the decisions are recorded in tasks.md); tell me if you want something different.

1. **Airwallex demo details (asked to the client 2026-10-21):** from the client's Airwallex **demo** (sandbox) account, Settings > Developer > API keys: the **Client ID** and an **API key**. Once they add the webhook for the test site (the address and events are in Requirements.md, section 3), also its **webhook secret**. Please send them to me privately, not in this file or any notes file (these go to GitHub); they go only into the test site's settings (.env).
   (Client sends them privately; they go into .env only.)

2. **New 3D look on the test site (2026-10-23):** tonight's file has the mannequin, folds and new lighting. Should everyone see them straight away on the test site, or only people who open the link with ?look=2? Making it the default was blocked by the safety check, so it needs your clear yes.
   (Reply "yes, new 3D look for everyone": I make it the default, and ?look=1 still shows the old look.)

3. **Preferred suppliers (client ideas, 2026-10-23):**
   - a) What should a supplier pay to be listed?
     (A monthly or yearly listing price the client sets in Admin › Pricing, paid on the same payment page; no price fixed by us.)
   - b) When a customer picks an outside preferred supplier in the order form, how does that supplier get the order?
     (For now 3DEEZI's admin sees the supplier on the order and passes it on; supplier logins come later.)
   - Answered 2026-10-23: Mantis is the owner's company (Mantis owns 3DEEZI). So the order form's "Made by" offers 3DEEZI and Mantis, both the owner's own, and those orders go straight to the owner. The preferred suppliers section is for OTHER companies, who apply and pay to be listed.

