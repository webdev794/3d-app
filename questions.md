# Open questions

Questions waiting for your answer. Each one is also asked in the chat; once answered, it is removed from here.

1. **Airwallex keys: what exactly is needed (2026-10-21)**
   - **To start testing (demo):** the **Client ID** and the **API key** from the client's Airwallex **demo** (sandbox) account, under Settings > Developer > API keys. That is all for the first test.
   - **The webhook secret (the Airwallex work is now finished):** in Airwallex, Settings > Developer > Webhooks, add the address **https://testcaresortwork.co.in/3deez/api/v1/payments/airwallex/webhook** (for the test site) and tick: payment_intent.succeeded, payment_intent.payment_failed, payment_intent.pending, payment_intent.cancelled, payment_attempt.authorization_failed, payment_attempt.failed_to_process, refund.accepted, refund.settled, refund.failed. Then copy the **webhook secret** it shows. Also in Airwallex: Payments > Settings, turn on cards, Apple Pay and Google Pay.
   - **For the real launch:** the same three (Client ID, API key, webhook secret) from the **live** Airwallex account.
   - **How to send them:** privately to me, not in this file or any notes file (these go to GitHub). They go only into the live site's settings (.env).

2. **Selling in New Zealand?** Today the whole site uses one currency (AUD) and one tax rate (Australian GST 10%). Does the client also sell to New Zealand customers, and if so in NZD with NZ GST (15%)? That needs a currency and tax rate per delivery country (a small change); Airwallex itself already takes NZD.

3. **Can the client's NZ Airwallex account take AUD card payments,** and which Airwallex wallet should the money settle into? (Something only the client can check in their account.)

4. **Apple Pay / Google Pay inside the phone app:** the app opens the pay page inside the app. Cards work there, but Apple Pay and Google Pay may not show inside an app window. Should the app open the pay page in the phone's normal browser instead (wallets then show, and the customer comes back to the app afterwards)? I'd recommend yes.

5. **Apparel tiles on "Choose your sport":** the client listed Hoodies, Jackets, Gymwear, Workwear and Hi-Vis Uniforms. Their tile symbols are ready, but we have no kit for them yet (today only Training is under APPAREL). Should we add these as new garments (each needs a kit picture for the turning stage and a garment for the 3D Studio), and in which order?

6. **"Genuine interactive 3D" on the sport stage:** the big kits on "Choose your sport" are pictures on a turning stage, not live 3D models (the Studio after it is live 3D). Is that fine, or does the client want live 3D kits on that stage too? Live models are possible but heavier to load on phones.

(Answered 2026-10-21: the AI designer may use the project's OpenAI key for a small BLITZ comparison test (a few images). "BLITZ" is only the client's example team logo, not a tool, so nothing needs to be bought.)

(Answered and applied 2026-10-20: the live test logins admin@3deezi.com and admin@example.test are in our database with their live passwords and admin rights; other live-only accounts could not be recovered, because no copy of the old live database exists in git or the packages. Earlier: no admin screens in the app; payment choices kept; live setup details are in Requirements.md.)
