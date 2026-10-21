# Open questions

Questions waiting for your answer. Each one is also asked in the chat; once answered, it is removed from here.

1. **Airwallex keys: what exactly is needed (2026-10-21)**
   - **To start testing (demo):** the **Client ID** and the **API key** from the client's Airwallex **demo** (sandbox) account, under Settings > Developer > API keys. That is all for the first test.
   - **The webhook secret:** in Airwallex, Settings > Developer > Webhooks, add the address **https://testcaresortwork.co.in/3deez/api/v1/payments/airwallex/webhook** (for the test site) and tick: payment_intent.succeeded, payment_intent.payment_failed, payment_intent.pending, payment_intent.cancelled, payment_attempt.authorization_failed, payment_attempt.failed_to_process, refund.accepted, refund.settled, refund.failed. Then copy the **webhook secret** it shows. Also in Airwallex: Payments > Settings, turn on cards, Apple Pay and Google Pay.
   - **For the real launch:** the same three (Client ID, API key, webhook secret) from the **live** Airwallex account.
   - **How to send them:** privately to me, not in this file or any notes file (these go to GitHub). They go only into the live site's settings (.env).

2. **Selling in New Zealand?** Today the whole site uses one currency (AUD) and one tax rate (Australian GST 10%). Does the client also sell to New Zealand customers, and if so in NZD with NZ GST (15%)? That needs a currency and tax rate per delivery country (a small change); Airwallex itself already takes NZD.

3. **Can the client's NZ Airwallex account take AUD card payments,** and which Airwallex wallet should the money settle into? (Something only the client can check in their account.)

4. **Apple Pay / Google Pay in the phone app: just say yes or no.** In short: nothing new to buy or integrate. Airwallex already gives Apple Pay and Google Pay. The only change is in our app: open the pay page in the phone's normal browser instead of inside the app, because wallets don't show inside an app window. After paying, the customer comes back to the app. A small change; I recommend **yes**.
Answer: Ok, yes then, no need to ask client. 

5. **The client's new garments (3D model additions checklist, 16 October 2026):** they are already in tasks.md, all still to do:
   - fishing shirt (9.18), pool / billiards shirt and darts polo (9.28-9.29);
   - puffer jacket, puffer vest, softshell jacket (9.42-9.44), with the hoodies and other jackets (9.35-9.46);
   - fightwear: rash guard, MMA, Muay Thai, boxing and compression shorts (9.47 onwards);
   - the garment-first picker, to choose a garment without choosing a sport (9.10).

   Each is a new 3D garment (a bigger job per garment). The "Choose your sport" tiles are already linked: once a garment is built and added to the catalogue as apparel, its tile appears by itself. **When should we start them, and in which order?** (You said this morning to leave old pending tasks for later.)
   Answer: Yes, we can continue, possibly if client not gave more tasks today. 

6. **Live 3D kits on the "Choose your sport" stage: please ask the client.** I checked the old tasks: the client asked earlier (Stage 2) for a rotating 3D carousel, which was built as today's turning stage of kit pictures and marked done. Nothing older asks for live 3D models there. The new brief says "keep the large central garments and existing rotation functionality in genuine interactive 3D". My reading is to keep the current stage, which is what we did. Please ask the client whether they want live 3D models on that stage instead (possible, but heavier to load on phones).
Answer: I shared image, doesnt it clarify? Do you want to tell client, not to add more 3D models because it will be heavy for phones?

(Answered 2026-10-21: the AI designer may use the project's OpenAI key for a small BLITZ comparison test (a few images). "BLITZ" is only the client's example team logo, not a tool, so nothing needs to be bought.)

(Answered and applied 2026-10-20: the live test logins admin@3deezi.com and admin@example.test are in our database with their live passwords and admin rights; other live-only accounts could not be recovered, because no copy of the old live database exists in git or the packages. Earlier: no admin screens in the app; payment choices kept; live setup details are in Requirements.md.)
