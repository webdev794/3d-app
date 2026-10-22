# Open questions

Questions waiting for your answer. Each one is also asked in the chat; once answered, it is removed from here. My suggested answer is in brackets under each question. I go ahead with my suggested answer where I can decide (the decisions are recorded in tasks.md); tell me if you want something different.

1. **Airwallex demo details (asked to the client 2026-10-21):** from the client's Airwallex **demo** (sandbox) account, Settings > Developer > API keys: the **Client ID** and an **API key**. Once they add the webhook for the test site (the address and events are in Requirements.md, section 3), also its **webhook secret**. Please send them to me privately, not in this file or any notes file (these go to GitHub); they go only into the test site's settings (.env).
   (Client sends them privately; they go into .env only.)

2. **Client (2026-10-22): "PlayStation game like graphics needed." Is it possible?**

   **Answer: yes, largely, on computers and good phones, done in steps.** The 3D kit runs live in the web browser and the app, not on a games console, so it won't match a PS5 game with ray tracing. But it can get close to a PlayStation-style product showcase: a kit on a stand with stadium lighting, realistic fabric, soft shadows, a glossy floor and glowing lights. Phones get a lighter version so the kit still turns smoothly.

   **What limits it today:**
   - lighting and shading are basic: flat front light, jagged edges, matte floor;
   - the fabric has no visible mesh or knit texture;
   - the garments are built from simple shapes in code, so they have few real folds or drape;
   - the website runs the 3D in "phone mode" on computers too, so computers never get the better settings.

   **Plan:**
   - **Step 1 (about 1 day, already started; the agent paused when the session restarted):**
     - lighting and look: smooth edges, stadium lighting with a warm key light and cool rim lights;
     - visible mesh / knit fabric with a soft sheen;
     - a glossy reflective floor, glow on the stadium lights, deeper shadows;
     - true print colours;
     - a "high" quality level on computers and a lighter one on phones.

     Before / after pictures of every garment go to the client. Print positions, the 2D panels and the exports stay exactly the same.
   - **Step 2 (about 3–5 days):**
     - more detailed garment shapes with built-in folds and drape (wrinkle detail per garment, softer seams, better collars and cuffs);
     - a better mannequin or body;
     - a studio "HDR" environment for reflections.
   - **Step 3 (optional, later):** console-level detail would need garment models made by a 3D artist in a cloth tool (e.g. Marvelous Designer or Blender), then loaded into the viewer, at extra cost and time. For marketing pictures, the existing AI "Photoreal showcase" can already make photo-quality images of a design.

   (My suggestion: do step 1 now and show the client before / after pictures; then decide on step 2 together. I'll resume the 3D quality agent as soon as a slot frees up.)
