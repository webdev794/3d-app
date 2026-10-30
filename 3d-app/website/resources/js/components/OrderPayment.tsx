/**
 * Prices, invoices and paying (payments-api.md): small pieces other pages embed.
 * - PaymentStatusPill: the payment pill of an order card.
 * - PaymentSummaryPanel: invoice number, pill, amount due, Pay now and Download invoice.
 * - PriceBreakdown + useQuote: the order's price for a review step (POST /pricing/quote).
 * - PricingChoices: delivery destination, optional extras and a discount code (GET /pricing/options).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleCheck, Clock, CreditCard, FileText, Info, LoaderCircle, RotateCcw, TriangleAlert, XCircle } from 'lucide-react';
import { api, fetchFile, saveBlob } from '../api';
import { moneyOr } from '../money';
import '../../css/payments.css';

export type PaymentStatus = 'quote_required' | 'awaiting_payment' | 'part_paid' | 'paid' | 'refunded' | 'cancelled';
export interface PaymentAttempt { status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled'; message: string | null; at: string }
/** An order's payment summary (`payment` in order JSON). */
export interface PaymentSummary {
  invoice_id: number; invoice_number: string | null; status: PaymentStatus; label: string; tone: 'amber' | 'blue' | 'green' | 'grey' | 'red';
  currency: string; total: string | null; amount_paid: string; amount_due: string | null; deposit_due: string | null;
  issued_at: string | null; due_at: string | null; paid_at: string | null; pay_url: string | null; pdf: string | null; can_pay: boolean;
  last_attempt: PaymentAttempt | null; reasons: { code: string; message: string; key?: string }[]; production_ready: boolean;
}
export interface QuoteLine { key: string; kind: 'garment' | 'extra' | 'custom'; name: string; quantity: number; unit_price: string | null; total: string | null; priced: boolean; code?: string; unit?: string }
export interface Quote {
  status: 'priced' | 'quote_required'; currency: string; quantity: number; lines: QuoteLine[]; extras: QuoteLine[];
  garments_total: string; extras_total: string; shipping: { destination: string | null; name: string; amount: string | null; priced: boolean; taxable: boolean } | null;
  discounts: { name: string; code: string | null; amount: string }[]; discount_total: string; subtotal: string | null;
  tax: { name: string; rate: string; amount: string | null; included: boolean; applies: boolean }; total: string | null;
  reasons: { code: string; message: string; key?: string }[]; discount_code: { code: string; valid: boolean; message: string | null } | null;
}
export interface PricingChoice { destination?: string; extras?: string[]; discount_code?: string }
export interface QuoteRequest { items: Record<string, unknown>[]; pricing?: PricingChoice; shipping_address?: string }
export interface PricingOptions {
  currency: string; tax: { name: string; rate: string; included: boolean };
  garments: { garment: string; sport: string | null; name: string; unit_price: string }[];
  extras: { code: string; name: string; unit: 'garment' | 'player' | 'order'; unit_price: string; auto: boolean }[];
  destinations: { code: string; name: string }[]; default_destination: string | null; discount_codes: boolean;
  tiers: { name: string; min_quantity: number; percent: string | null; amount: string | null }[]; payment_rule: { rule: 'none' | 'deposit' | 'full'; deposit_percent: number };
}

/** "1870.00", "AUD" -> "A$1,870.00" (the site's one price style, money.ts); "To be confirmed" without an amount. */
export function money(amount: string | number | null | undefined, currency = 'AUD'): string {
  return moneyOr(amount, currency, 'To be confirmed');
}

const PILL_ICON: Record<PaymentStatus, typeof Clock> = { quote_required: Clock, awaiting_payment: Clock, part_paid: CircleCheck, paid: CircleCheck, refunded: RotateCcw, cancelled: XCircle };

/** The payment pill; nothing without a payment. */
export function PaymentStatusPill({ payment, size }: { payment: Pick<PaymentSummary, 'status' | 'label' | 'tone'> | null | undefined; size?: 'sm' }) {
  if (!payment) return null;
  const Icon = PILL_ICON[payment.status] ?? Clock;
  return <span className={`pay-pill tone-${payment.tone}${size === 'sm' ? ' is-sm' : ''}`}><Icon size={size === 'sm' ? 12 : 15} />{payment.label}</span>;
}

/** Downloads an invoice's PDF (the token is a header, so not a plain link). */
export async function downloadInvoice(number: string, key?: string | null) {
  saveBlob(await fetchFile(`/invoices/${encodeURIComponent(number)}/pdf${key ? `?key=${encodeURIComponent(key)}` : ''}`), `${number}.pdf`);
}

/** The invoice of an order card: number, pill, amount due, Pay now and Download invoice. */
export function PaymentSummaryPanel({ payment, orderNumber, compact = false }: { payment: PaymentSummary | null | undefined; orderNumber?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!payment) return null;
  const number = payment.invoice_number;
  async function download() { if (!number) return; setBusy(true); setError(''); try { await downloadInvoice(number); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className={`pay-summary${compact ? ' is-compact' : ''}`}>
    <div className="pay-summary-head"><strong>{number ? `Invoice ${number}` : 'Price'}</strong><PaymentStatusPill payment={payment} size={compact ? 'sm' : undefined} /></div>
    {payment.status === 'quote_required'
      ? <p className="pay-summary-note"><Info size={14} /> We’re confirming your price{orderNumber ? ` for ${orderNumber}` : ''}. Your invoice follows by email.</p>
      : <p className="pay-summary-amount">{payment.can_pay ? <>Amount due <b>{money(payment.amount_due, payment.currency)}</b></> : <>Total <b>{money(payment.total, payment.currency)}</b></>}</p>}
    {payment.last_attempt?.status === 'failed' && payment.can_pay && <p className="pay-summary-error"><TriangleAlert size={14} /> The last payment didn’t go through. You can try again.</p>}
    <div className="pay-summary-actions">
      {payment.can_pay && number && <Link className="button button-gradient pay-now" to={`/invoices/${number}`}><CreditCard size={15} /> Pay now <ArrowRight size={15} /></Link>}
      {number && <button type="button" className="button button-outline" onClick={download} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <FileText size={15} />} Download invoice</button>}
    </div>
    {error && <p className="error-message">{error}</p>}
  </div>;
}

/** The order's price for a review step; null = don't ask (yet). Asks again 400 ms after the request changes. */
export function useQuote(request: QuoteRequest | null): { quote: Quote | null; loading: boolean; error: string } {
  const [state, setState] = useState<{ quote: Quote | null; loading: boolean; error: string }>({ quote: null, loading: false, error: '' });
  const key = request ? JSON.stringify(request) : '';
  const latest = useRef(0);
  useEffect(() => {
    if (!key) { setState({ quote: null, loading: false, error: '' }); return; }
    const id = ++latest.current;
    setState(s => ({ ...s, loading: true, error: '' }));
    const timer = setTimeout(() => {
      api<Quote>('/pricing/quote', { method: 'POST', body: key })
        .then(quote => { if (latest.current === id) setState({ quote, loading: false, error: '' }); })
        .catch(e => { if (latest.current === id) setState({ quote: null, loading: false, error: (e as Error).message }); });
    }, 400);
    return () => clearTimeout(timer);
  }, [key]);
  return state;
}

/** The review step's breakdown: items, extras, shipping, discounts, subtotal, tax and TOTAL; or "Quote required". */
export function PriceBreakdown({ quote, loading = false, error = '' }: { quote: Quote | null; loading?: boolean; error?: string }) {
  if (error) return <div className="pay-breakdown"><p className="error-message">{error}</p></div>;
  if (!quote) return <div className="pay-breakdown is-loading">{loading ? <><LoaderCircle className="spin" size={16} /> Working out your price…</> : null}</div>;
  const c = quote.currency;
  const rows = [...quote.lines, ...quote.extras];
  const required = quote.status === 'quote_required';
  return <div className={`pay-breakdown${loading ? ' is-updating' : ''}`} aria-busy={loading}>
    <table className="pay-items"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.key}><td>{r.name}</td><td>{r.quantity}</td><td>{r.priced ? money(r.unit_price, c) : '—'}</td><td>{r.priced ? money(r.total, c) : 'To be confirmed'}</td></tr>)}</tbody></table>
    <dl className="pay-totals">
      <div><dt>Garments</dt><dd>{money(quote.garments_total, c)}</dd></div>
      {Number(quote.extras_total) > 0 && <div><dt>Extras</dt><dd>{money(quote.extras_total, c)}</dd></div>}
      {quote.shipping && <div><dt>Shipping{quote.shipping.name ? ` · ${quote.shipping.name}` : ''}</dt><dd>{quote.shipping.priced ? money(quote.shipping.amount, c) : 'To be confirmed'}</dd></div>}
      {quote.discounts.map(d => <div key={d.name + d.code} className="is-discount"><dt>{d.name}{d.code ? ` (${d.code})` : ''}</dt><dd>-{money(d.amount, c)}</dd></div>)}
      {!required && <>
        <div className="is-rule"><dt>Subtotal</dt><dd>{money(quote.subtotal, c)}</dd></div>
        <div><dt>{quote.tax.name} ({quote.tax.applies ? `${quote.tax.rate}%` : 'not applicable'})</dt><dd>{money(quote.tax.amount, c)}</dd></div>
      </>}
    </dl>
    {required
      ? <div className="pay-quote-required"><Clock size={16} /><div><strong>Quote required</strong><ul>{quote.reasons.map((r, i) => <li key={i}>{r.message}</li>)}</ul><span>Confirm your order and 3DEEZI confirms the price, then emails your invoice.</span></div></div>
      : <div className="pay-total"><span>TOTAL</span><b>{money(quote.total, c)}</b></div>}
    {quote.discount_code && !quote.discount_code.valid && <p className="pay-code-note"><TriangleAlert size={14} /> {quote.discount_code.message}</p>}
  </div>;
}

/** Destination names the price list may not have (the server's PricingService::DESTINATIONS). */
const DESTINATION_NAMES: Record<string, string> = { AU: 'Australia', NZ: 'New Zealand', INTL: 'International', PICKUP: 'Pick up' };

/**
 * Delivery destination, optional extras and a discount code, for the `pricing` sent with the order. "Delivery to" shows
 * where the price is worked out for: the one chosen here, else the quote's (`shipping`), else section 1's Deliver / Pick
 * up and country (`choice`, e.g. "PICKUP", "NZ"), else the price list's default; a destination the price list has no
 * price for shows as itself (3DEEZI prices it). Picked up (`choice` "PICKUP"): there is nothing to deliver, so no list.
 */
export function PricingChoices({ value, onChange, choice, shipping }: { value: PricingChoice; onChange: (next: PricingChoice) => void;
  choice?: string | null; shipping?: { destination?: string | null; name?: string | null } | null }) {
  const [options, setOptions] = useState<PricingOptions | null>(null);
  const [code, setCode] = useState(value.discount_code ?? '');
  useEffect(() => { api<PricingOptions>('/pricing/options').then(setOptions).catch(() => setOptions(null)); }, []);
  if (!options) return null;
  const extras = options.extras.filter(e => !e.auto);
  const chosen = new Set(value.extras ?? []);
  // The price list's own code for a destination (its code, or a known place under another code, as the server matches it).
  const listed = (c: string | null | undefined) => {
    const up = (c ?? '').trim().toUpperCase();
    if (!up) return null;
    const named = DESTINATION_NAMES[up]?.toLowerCase();
    return options.destinations.find(d => d.code.toUpperCase() === up)?.code ?? (named ? options.destinations.find(d => d.name.trim().toLowerCase() === named)?.code : undefined) ?? null;
  };
  const pickup = choice?.toUpperCase() === 'PICKUP' && (!value.destination || value.destination.toUpperCase() === 'PICKUP' || value.destination === listed('PICKUP'));
  const shown = value.destination || shipping?.destination || choice || options.default_destination || '';
  const selected = listed(shown) ?? shown.toUpperCase();
  const destinations = selected && !options.destinations.some(d => d.code === selected)
    ? [{ code: selected, name: shipping?.destination?.toUpperCase() === selected && shipping.name ? shipping.name : DESTINATION_NAMES[selected] ?? selected }, ...options.destinations]
    : options.destinations;
  return <div className="pay-choices">
    {pickup ? <div className="field pay-pickup" data-testid="pay-pickup">Delivery to<span>Pick up from 3DEEZI (no delivery)</span></div>
      : destinations.length > 0 && <label className="field">Delivery to<select value={selected} onChange={e => onChange({ ...value, destination: e.target.value || undefined })}>
      {destinations.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}</select></label>}
    {extras.length > 0 && <fieldset className="pay-extras"><legend>Extras</legend>{extras.map(e => <label key={e.code} className="pay-extra"><input type="checkbox" checked={chosen.has(e.code)}
      onChange={ev => { const next = new Set(chosen); if (ev.target.checked) next.add(e.code); else next.delete(e.code); onChange({ ...value, extras: [...next] }); }} />
      <span>{e.name}<small>{money(e.unit_price, options.currency)} {e.unit === 'order' ? 'per order' : e.unit === 'player' ? 'per name / number' : 'per garment'}</small></span></label>)}</fieldset>}
    {options.discount_codes && <label className="field">Discount code<span className="pay-code"><input value={code} maxLength={40} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Optional" />
      <button type="button" className="button button-outline" onClick={() => onChange({ ...value, discount_code: code.trim() || undefined })}>Apply</button></span></label>}
  </div>;
}
