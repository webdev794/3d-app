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
| `STRIPE_KEY` | | Stripe publishable key (pk_live…) |
| `STRIPE_SECRET` | | Stripe secret key (sk_live…) |
| `STRIPE_WEBHOOK_SECRET` | | From the Stripe webhook (whsec…) |
| `PAYMENTS_TEST_MODE` | (empty) | Must stay empty on the real site |

## 3. Stripe (online payments)

- A Stripe account in Australia, currency AUD.
- A webhook to `https://<site>/api/v1/payments/stripe/webhook` with these events:
  - payment_intent.succeeded
  - payment_intent.payment_failed
  - payment_intent.processing
  - payment_intent.canceled
  - charge.refunded
- Apple Pay: verify the domain in Stripe.
- Check in Admin › Pricing › Online payments: it shows whether Stripe is connected and the webhook address to copy.

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
