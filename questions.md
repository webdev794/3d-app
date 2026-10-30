# Open questions

Questions waiting for your answer. Each one is also asked in the chat; once answered, it is removed from here. My suggested answer is in brackets under each question. I go ahead with my suggested answer where I can decide (the decisions are recorded in tasks.md); tell me if you want something different.

1. **Airwallex demo details (asked to the client 2026-10-21):** from the client's Airwallex **demo** (sandbox) account, Settings > Developer > API keys: the **Client ID** and an **API key**. Once they add the webhook for the test site (the address and events are in Requirements.md, section 3), also its **webhook secret**. Please send them to me privately, not in this file or any notes file (these go to GitHub); they go only into the test site's settings (.env).
   (Client sends them privately; they go into .env only.)

2. **Client (2026-10-26): 3D standard like Yellow Images NFL mockups, and "place the uniform onto a person".** How far should we go?
   (Suggested, in three parts:
   A. Photoreal mockup pictures: for each design, a "Mockup" button makes studio-quality pictures, front, back and 3/4, like Yellow Images, from our 3D plus the existing AI photoreal step. About 1 week; small AI cost per picture.
   B. Better 3D garments: the real-time 3D can't fully match Yellow Images (those are offline studio renders), but artist-made garment models (made in a cloth tool, then loaded into our viewer) close most of the gap. Needs a 3D artist or bought models, extra cost and 1–3 weeks per set; start with the jersey and the NFL jersey.
   C. "On a person": a "See it on a player" button puts the design on a realistic athlete picture with AI (the existing Photoreal showcase extended), on the website and in the app. About 2–3 days.
   Start with C and A now; B when the client agrees the budget.)


4. **American Football Game Jersey length (2026-10-29):** the Game Jersey tile picture is short and wide (height about equal to shoulder width), while the Game Kit picture shows a longer jersey; our 3D is about 40% longer, like the Game Kit. Which should the Game Jersey follow?
   (Suggested: keep the longer Game Kit length, since both tiles use one model and a longer jersey tucks into game pants.)

5. **Tennis skirt / Hockey skort descriptions (2026-10-29):** the tiles say "Pleated skirt with inner shorts" / "Skirt with built-in shorts", but the client's pictures (and our 3D) show a plain A-line skirt with side panels.
   (Decided, going ahead: the descriptions now match the pictures, e.g. "A-line skirt with side panels"; tile names stay. Tell me if pleats or inner shorts are wanted instead.)

6. **Rugby League Jersey / Kit: which picture should the 3D follow? (2026-10-30)** The tile picture you click (garment-rugby-jersey.webp) shows cyan raglan shoulders, cyan cuffs and curved side blades; the kit tile picture also has shorts with cyan side panels and socks. But the 3D was made to follow the client's other picture (images/225: claw shoulders and tribal flames).
   (Suggested: follow the TILE picture the customer clicks, since that's the rule for every tile; keep the claw / flame design as a separate preset.)
