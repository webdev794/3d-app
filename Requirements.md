# Go-live requirements

What the client's real site needs before launch. The current live site is a test site; when the client has a domain and hosting, fill in the blanks below. Values are left empty on purpose.

## 1. Domain and hosting

- **Domain / site address:** (not bought yet)
- **Hosting:** PHP 8.2 or newer, with these extensions: gd, zip, fileinfo, pdo_sqlite, mbstring, openssl, curl.
- **Upload limits** in PHP settings, for order files up to 25 MB:
  - `upload_max_filesize = 26M`
  - `post_max_size = 30M`
- **HTTPS:** required for card payments and Apple Pay.

## 2. Settings in the live `.env`

| Setting | Value | Notes |
|---|---|---|
| `APP_URL` | | The site address, e.g. https://… |
| `APP_ENV` | `production` | |
| `APP_DEBUG` | `false` | |
| `OPENAI_API_KEY` | | For the AI designer, AI edits and 3DEEZI ASSIST (kept on the server only) |
| `MAIL_MAILER` | `sendmail` for now | Uses the hosting's own mail, like `wp_mail()` on WordPress sites. Later `smtp`, with `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD` |
| `MAIL_FROM_ADDRESS` | | e.g. noreply@ the client's domain |
| `MAIL_FROM_NAME` | `3DEEZI` | |
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

- Replace the example prices (jersey $50, shorts $30, Australian shipping $100) with the client's real prices: garments per sport, extras (e.g. names and numbers), shipping per destination, discounts.

## 6. Content to review

- Privacy and Terms pages: written as drafts, for the client (or a lawyer) to check and complete.
- About and Support pages: check the wording.

## 7. Data on launch day

- The test site's database holds test accounts, projects and orders. For the real launch, start with a clean database (keep only the real admin account), or remove the test data first.

## 8. Mobile app

- Build the app with the real site address: `--dart-define=API_BASE_URL=https://<site>` (read in lib/api_client.dart).
- App store details (names, icons, screenshots) are separate from this list.
