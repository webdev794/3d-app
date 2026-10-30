# Go-live requirements

What the client's real site needs before launch. The current live site is a test site; when the client has a domain and hosting, fill in the blanks below. Values are left empty on purpose.

## 1. Domain and hosting

- **Domain / site address:** (not bought yet)
- **Hosting:** PHP 8.2 or newer, with these extensions: gd, zip, fileinfo, pdo_sqlite, mbstring, openssl, curl.
- **Upload limits** in PHP settings, for order files up to 25 MB:
  - `upload_max_filesize = 26M`
  - `post_max_size = 30M`
- **HTTPS:** required for card payments and Apple Pay.
- **PHP errors off and a temp folder** (3DEEZI TEAM uploads): `display_errors = Off`, and `upload_tmp_dir` either unset or an existing, writable folder. Otherwise PHP notices break the upload replies.

- **CorelDRAW (.cdr) upload (optional):** the Artboard opens .cdr files only with a converter on the server. The cheapest option is LibreOffice installed on the server (set CDR_SOFFICE_PATH); or a converter service (CDR_CONVERTER_URL); or CloudConvert, a paid API (CLOUDCONVERT_API_KEY). Without one, .cdr upload says it is not available; SVG / PDF / PNG / JPG work.

## 2. Settings in the live `.env`

| Setting | Value | Notes |
|---|---|---|
| `APP_URL` | | The site address, e.g. https://… |
| `APP_ENV` | `production` | |
| `APP_DEBUG` | `false` | |
| `OPENAI_API_KEY` | | For the AI designer, AI edits and 3DEEZI ASSIST (kept on the server only) |
| AI models | set in Admin › Settings | Recommended (2026-10-21): image gpt-image-2.5-flare, HD image gpt-image-2.5-sunburst, planning gpt-6-luna (gpt-6.1-sol tested 2026-10-21: it dropped the client's mascot logo and was slower), chat gpt-6-luna. Saved in the database, so they override .env |
| `MAIL_MAILER` | `sendmail` for now | Uses the hosting's own mail, like `wp_mail()` on WordPress sites. Later `smtp`, with `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD` |
| `MAIL_FROM_ADDRESS` | | e.g. noreply@ the client's domain |
| `MAIL_FROM_NAME` | `3DEEZI` | |
| Mail check | | Email is needed for the "Forgot password?" codes (sign-in window, website and app) and Support messages. After setting the mail lines, try "Forgot password?" with your own email: the code should arrive within a minute (check spam; a from-address on the site's own domain helps) |
| `PAYMENTS_PROVIDER` | (empty) or `airwallex` | Empty = Airwallex when its keys are set |
| `AIRWALLEX_CLIENT_ID` | | Airwallex › Settings › Developer › API keys |
| `AIRWALLEX_API_KEY` | | Same page (kept on the server only) |
| `AIRWALLEX_WEBHOOK_SECRET` | | The secret of the Airwallex webhook (section 3) |
| `AIRWALLEX_ENV` | `demo` first, then `prod` | demo = Airwallex sandbox (test cards); prod = live |
| `AIRWALLEX_ACCOUNT_ID` | (empty) | Only if the API key covers several Airwallex accounts |
| `STRIPE_KEY` | (empty) | Only if Stripe is used instead of Airwallex |
| `STRIPE_SECRET` | (empty) | Only if Stripe is used |
| `STRIPE_WEBHOOK_SECRET` | (empty) | Only if Stripe is used |
| `PAYMENTS_TEST_MODE` | (empty) | Must stay empty on the real site |

## 3. Airwallex (online payments, the client's provider)

Customers pay on Airwallex's secure payment page (card, Apple Pay, Google Pay); card details never reach the site. What the client does in their Airwallex account (they share the keys privately, never by a notes file or chat that is saved):

1. **Demo (sandbox) first.** Sign in to the Airwallex sandbox (demo) account, which is separate from the live account, so no real money moves.
2. **API keys:** Settings › Developer › API keys: copy the **Client ID** and create an **API key**. They go into `AIRWALLEX_CLIENT_ID` and `AIRWALLEX_API_KEY`, with `AIRWALLEX_ENV=demo`.
3. **Webhook:** Settings › Developer › Webhooks › add a notification URL `https://<site>/api/v1/payments/airwallex/webhook` (Admin › Pricing › Online payments shows it, with a copy button) and tick these events:
   - payment_intent.succeeded
   - payment_intent.payment_failed
   - payment_intent.pending
   - payment_intent.cancelled
   - payment_attempt.authorization_failed
   - payment_attempt.failed_to_process
   - refund.accepted
   - refund.settled
   - refund.failed

   Copy the webhook's **secret** into `AIRWALLEX_WEBHOOK_SECRET`.
4. **Payment methods:** Payments › Settings: make sure cards, **Apple Pay** and **Google Pay** are on. Apple Pay needs no domain check with Airwallex's payment page.
5. **Currencies:** AUD (prices and invoices are in AUD with 10% GST for Australia). The Airwallex account is in New Zealand: check that it may take AUD card payments and which wallet the money settles into.
   - **Decide before launch: selling in New Zealand?** Today the whole site uses one currency (AUD) and one tax rate (Australian GST 10%). If the client also sells to New Zealand customers in NZD with NZ GST (15%), the site needs a currency and tax rate per delivery country (a small change); Airwallex itself already takes NZD.
6. **Test in demo:** pay an invoice with an Airwallex test card; it shows Paid, the receipt arrives, and the webhook shows delivered in Airwallex. Try a declined test card and a refund too.
7. **Go live:** in the **live** account, create live API keys and the same webhook (its own secret), then set them in the live `.env` with `AIRWALLEX_ENV=prod`. Admin › Pricing › Online payments then says "Airwallex connected (live)".
8. **Return address (nothing to set up):** after paying on Airwallex's page, the customer comes back to the order's COMPLETE YOUR PAYMENT page, `https://<site>/orders/3DZ-…/pay?payment=…` (or `?cancelled=…` when they close it without paying), and then sees the order's Confirmation. 3DEEZI TEAM invoices come back to `https://<site>/invoices/INV-…` as before. The site sends these addresses with each payment, so no return URL or domain needs to be entered in Airwallex; only the webhook (step 3) is set up there.
9. **Optional, after go-live: card fields on the page itself.** Today PAY opens Airwallex's secure payment page. The client's design shows the card number, expiry and CVC on our page; that can be done with Airwallex's embedded card fields (still Airwallex's own secure fields, so card details still never reach the site). It needs the demo keys first to build and test it with Airwallex test cards, and, if Apple Pay should also appear inside the page, the site's domain registered for Apple Pay in Airwallex. A small change on the payment page; no server change.

## 3b. Stripe (only if used instead of Airwallex)

- A Stripe account in Australia, currency AUD. Set `PAYMENTS_PROVIDER=stripe` if Airwallex keys are also set.
- A webhook to `https://<site>/api/v1/payments/stripe/webhook` with these events:
  - payment_intent.succeeded
  - payment_intent.payment_failed
  - payment_intent.processing
  - payment_intent.canceled
  - charge.refunded
- Apple Pay: verify the domain in Stripe.
- Check in Admin › Pricing › Online payments: it shows which provider is connected and the webhook address to copy.

## 4. Business details (Admin › Pricing)

- Business name, ABN, address, email, phone, website, logo (printed on invoices).
- Bank details (for bank transfers), and the note shown on every invoice.
- GST (10% for Australia), currency (AUD), invoice number start, due days.
- Rule before production: paid in full (default).

## 5. Prices (Admin › Pricing › Price list)
- **Prices for the new garments:** hoodie, zip hoodie, polo with pocket, varsity jacket and track jacket have no price in the price list yet, so their orders go to "We're confirming your price". Add them in Admin › Pricing.
- **Full kit price:** the price list has no price for a full kit (top + shorts ordered from the Studio), so every Studio full-kit order lands on "We're confirming your price" with no Pay button. Add a full-kit price (or per-garment prices that the kit order uses) so customers can pay straight away.

- Replace the example prices (jersey $50, shorts $30, Australian shipping $100) with the client's real prices: garments per sport, extras (e.g. names and numbers), shipping per destination, discounts.

## 6. Content to review

- Privacy and Terms pages: written as drafts, for the client (or a lawyer) to check and complete.
- About and Support pages: check the wording.

## 7. Data on launch day

- The test site's database holds test accounts, projects and orders. For the real launch, start with a clean database (keep only the real admin account), or remove the test data first.

## 8. Mobile app

- Build the app with the real site address: `--dart-define=API_BASE_URL=https://<site>` (read in lib/api_client.dart).
- App store details (names, icons, screenshots) are separate from this list.
