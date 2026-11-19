/**
 * The site's one price style (task 9.85): "A$1,870.00". Every page's money helper calls formatMoney; the server's texts
 * (App\Services\Pricing\Money::format: notifications, emails, order history, invoice PDFs) and the app write the same.
 * - Two decimals with en-AU grouping: A$0.00, A$9.09, A$49.95, A$1,870.00; a negative amount: -A$12.50.
 * - Other billing currencies (Admin > Pricing): NZ$, US$, CA$, £ and €; any other code as "JPY 1,870.00".
 * - `whole`: whole dollars without ".00" (the Pricing page's plan prices: A$19, A$49.95, A$5,990).
 */
const PREFIX: Record<string, string> = { AUD: 'A$', NZD: 'NZ$', USD: 'US$', CAD: 'CA$', GBP: '£', EUR: '€' };
const CENTS = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const WHOLE = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });

export function formatMoney(amount: string | number, currency?: string | null, { whole = false }: { whole?: boolean } = {}): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);
  const code = (currency || 'AUD').trim().toUpperCase();
  const digits = whole && Number.isInteger(value) ? WHOLE.format(Math.abs(value)) : CENTS.format(Math.abs(value));
  // "-A$0.00" never: a negative that rounds to nothing is nothing.
  const negative = value < 0 && /[1-9]/.test(digits);
  return `${negative ? '-' : ''}${PREFIX[code] ?? `${code} `}${digits}`;
}

/** formatMoney, or `missing` ("To be confirmed", "Quote pending", "—") when there is no amount. */
export function moneyOr(amount: string | number | null | undefined, currency?: string | null, missing = 'To be confirmed'): string {
  return amount === null || amount === undefined || amount === '' ? missing : formatMoney(amount, currency);
}
