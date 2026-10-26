# Open questions

Questions waiting for your answer. Each one is also asked in the chat; once answered, it is removed from here. My suggested answer is in brackets under each question. I go ahead with my suggested answer where I can decide (the decisions are recorded in tasks.md); tell me if you want something different.

1. **Airwallex demo details (asked to the client 2026-10-21):** from the client's Airwallex **demo** (sandbox) account, Settings > Developer > API keys: the **Client ID** and an **API key**. Once they add the webhook for the test site (the address and events are in Requirements.md, section 3), also its **webhook secret**. Please send them to me privately, not in this file or any notes file (these go to GitHub); they go only into the test site's settings (.env).
   (Client sends them privately; they go into .env only.)


2. **Preferred suppliers (2026-10-26):**
   - a) **Your computer's site:** the new suppliers feature needs one database update on your computer (port 8000) before you can see it there. Our safety rules only allow that with your OK, and I make a backup first. May I run it?
     (Reply "yes, update the database". The live site needs nothing: it sets itself up on first use.)
   - b) **For the client: the listing prices.** For now A$49 a month or A$490 a year, incl. GST; they can be changed any time in Admin › Pricing.
     (Keep these until the client sends his prices.)
   - c) **For the client:** should "Upload Your Order" also get the "Made by" choice (3DEEZI / Mantis / a supplier)?
     (Yes, add it; an admin can already change it per order.)

3. **Client (2026-10-26): "Is there any way we can train the AI? Netball has no numbers or names, you have bibs. Can we also train the AI to place the symbol on the chest, and maybe the 3DEEZI word mark small on the top back? And the same colour as the mock-up."**

   Picture: images/175.jpg (netball dresses today: a big 3DEEZI logo across the chest and "TEAM 01" on the back).

   **Answer: yes, and no "training" is needed.** We give the AI designer fixed rules for each sport and for logo placement; the AI follows them every time.
   - **Netball:** no names or numbers. Instead, the position letters on bibs (GS, GA, WA, C, WD, GD, GK), large on the front and back, as real netball bibs have.
   - **Every design:**
     - the club's symbol on the chest;
     - a small 3DEEZI word mark at the top of the back, just under the collar.
   - **Same colour as the mock-up:** when you open an AI design in 3D, the kit takes the exact colours of the AI picture (main, secondary, accent), not default colours. This is part of the "Open in 3D designer" improvement (tasks.md 9.116).
   - **Other sports** can get their own rules the same way, e.g. American football with big numbers on the shoulders and sleeves.

   (Suggested: I add these rules to the AI designer now, website and app, and test them with a few small AI picture calls, a few cents each.)


