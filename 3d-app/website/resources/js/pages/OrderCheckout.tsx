/**
 * COMPLETE YOUR PAYMENT (/orders/3DZ-00008/pay) and its Confirmation (/orders/3DZ-00008/confirmation): the step after
 * REVIEW & APPROVE ORDER, in the client's design (2026-10-22): the 3-step bar, PAYMENT METHOD with BILLING & DELIVERY
 * on the left, the ORDER SUMMARY on the right; then the Confirmation in the same style.
 *
 * Card details never touch this page, its state or our server. With Airwallex (the client's provider) PAY opens
 * Airwallex's secure Hosted Payment Page (card, Apple Pay, Google Pay), which sends the customer back here, where the
 * payment is checked with Airwallex (its webhook may come later). Test mode (no provider keys, a developer's
 * computer) simulates the payment through the same server path. With Stripe, PAY continues on the invoice page,
 * where Stripe's own card fields are. Data: GET /orders/{number}/checkout (OrderCheckoutController); paying goes
 * through the invoice endpoints (payments-api.md 4). The app's pay link (?key=) works here without signing in.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CircleCheck, ClipboardCheck, Copy, CreditCard, Info, LoaderCircle, Lock, Mail, ShieldCheck, TriangleAlert, Truck, User as UserIcon, Wallet } from 'lucide-react';
import { api, ApiError, getToken, type Project, type User } from '../api';
import type { OrderFile, OrderItem } from '../orderApi';
import { PaymentStatusPill, downloadInvoice, money, type PaymentSummary, type Quote } from '../components/OrderPayment';
import { GarmentPicture } from '../components/orderBoardModel';
import { DownloadReviewPdf } from '../components/OrderReviewGarments';
import { artworkOf, reviewDeliveryFromOrder, reviewGarmentsFrom, summaryText } from '../components/orderReviewData';
import { loadAirwallex } from './InvoicePay';
import '../../css/orders-board.css';
import '../../css/checkout.css';

type Viewer = 'owner' | 'link' | 'staff';
interface CheckoutItem extends OrderItem { name: string; quantity: number; thumbnail: string | null; fit_name?: string | null }
interface CheckoutOrder {
  id: number; number: string; name: string; status: string; approval: string | null; source: string; quantity: number;
  contact_name: string | null; contact_email: string | null; team_name: string | null; phone: string | null; shipping_address: string | null;
  delivery: 'deliver' | 'pickup' | null; needed_by: string | null; notes: string | null; files: OrderFile[]; link: string;
  [key: string]: unknown;
}
interface Receipt { number: string; amount: string; paid_at: string | null; method: string | null; card: { brand: string | null; last4: string } | null }
interface Gateway { provider: 'airwallex' | 'stripe' | 'test' | 'none'; environment: 'demo' | 'prod' | null; country: string | null; test_mode: boolean; banner: string | null; bank_details: string | null }
interface CheckoutInvoice extends PaymentSummary {
  id: number; number: string | null; viewer: Viewer; quote: Quote | null; receipt: Receipt | null; gateway: Gateway;
  payment_rule: { rule: 'none' | 'deposit' | 'full'; deposit_percent: number };
}
interface Address { street: string; suburb: string; state: string; postcode: string; country: string }
interface Billing { same: boolean; name?: string | null; company?: string | null; address?: string | null; fields?: Address }
interface Checkout { viewer: Viewer; order: CheckoutOrder; items: CheckoutItem[]; projects: Project[]; invoice: CheckoutInvoice | null; billing: Billing | null }
interface Started { payment: { id: number; client_secret: string | null; intent_id?: string | null }; invoice: CheckoutInvoice }

/** Phones and tablets: one column, with the PAY bar (checkout.css). */
const NARROW = '(max-width: 900px)';
const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
const isAustralia = (c: string) => ['australia', 'au', 'aus', ''].includes(c.trim().toLowerCase());

/** "A$4,000.00" (task 9.85: A$ everywhere); other currencies as the site writes them. */
export function aud(amount: string | number | null | undefined, currency = 'AUD'): string {
  if (amount === null || amount === undefined || amount === '') return 'To be confirmed';
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);
  if (currency !== 'AUD') return money(value, currency);
  return `${value < 0 ? '-' : ''}A$${Math.abs(value).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const shortDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const brandName = (b: string | null | undefined) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card');
const paidStatus = (s: string | undefined) => s === 'paid' || s === 'part_paid';

export default function OrderCheckoutPage({ user, checking, requireAuth, step }: { user: User | null; checking: boolean; requireAuth: (after?: () => void) => void; step: 'pay' | 'confirmation' }) {
  const { ref = '' } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const key = search.get('key');
  const invoiceParam = search.get('invoice');
  const returned = /^\d+$/.test(search.get('payment') ?? '') ? search.get('payment') : null;
  const leftCheckout = !!search.get('cancelled');
  /** Kept on every page of the checkout: the app's pay link and the invoice it names. */
  const keep = useMemo(() => { const q = new URLSearchParams(); if (key) q.set('key', key); if (invoiceParam) q.set('invoice', invoiceParam); return q.toString(); }, [key, invoiceParam]);
  const keyQuery = key ? `?key=${encodeURIComponent(key)}` : '';
  const [data, setData] = useState<Checkout | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const signedIn = !!user || !!getToken();
  const ready = !!key || (signedIn && !checking);
  const confirmation = step === 'confirmation';

  const load = useCallback(() => api<Checkout>(`/orders/${encodeURIComponent(ref)}/checkout${keep ? `?${keep}` : ''}`)
    .then(d => { setData(d); setError(null); return d; })
    .catch(e => { setError({ status: e instanceof ApiError ? e.status : 0, message: (e as Error).message }); return null; }), [ref, keep]);
  useEffect(() => { if (ready) void load(); }, [ready, load]);
  // The Confirmation opens at its top (the customer may have paid from further down, or from the PAY bar).
  useEffect(() => { if (confirmation) window.scrollTo({ top: 0 }); }, [confirmation]);

  const go = useCallback((to: 'pay' | 'confirmation', number: string) => navigate(`/orders/${encodeURIComponent(number)}/${to}${keep ? `?${keep}` : ''}`, { replace: true }), [navigate, keep]);
  // Paid: the Confirmation. The Confirmation of an order not paid yet: back to paying.
  useEffect(() => {
    if (!data?.invoice || returned) return;
    if (!confirmation && data.invoice.status === 'paid') go('confirmation', data.order.number);
    if (confirmation && !paidStatus(data.invoice.status)) go('pay', data.order.number);
  }, [data, confirmation, returned, go]);

  // Back from Airwallex's payment page: check the payment with Airwallex until it is paid or clearly not.
  useEffect(() => {
    if (!returned || !ready) return;
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setConfirming(true);
    const check = async () => {
      try {
        const invoice = await api<CheckoutInvoice>(`/payments/${returned}/sync${keyQuery}`, { method: 'POST' });
        if (stopped) return;
        if (paidStatus(invoice.status) || !invoice.can_pay || invoice.last_attempt?.status === 'failed') {
          const fresh = await load();
          setConfirming(false);
          if (fresh && paidStatus(invoice.status)) go('confirmation', fresh.order.number);
          else if (fresh) go('pay', fresh.order.number);
          return;
        }
      } catch { if (stopped) return; }
      if (++tries >= 12) { setConfirming(false); void load(); return; }
      timer = setTimeout(check, 4000);
    };
    void check();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [returned, ready, keyQuery, load, go]);

  if (!key && !signedIn && !checking) return <div className="op-page ck-page"><div className="op-shell"><div className="op-card ck-gate"><ShieldCheck size={36} /><h1>Sign in to pay</h1><p>Order {ref.toUpperCase()} is in the account that placed it. Sign in with it to complete your payment.</p><button type="button" className="ck-pay is-small" onClick={() => requireAuth(() => void load())}>Sign in <ArrowRight size={18} /></button></div></div></div>;
  if (error) return <div className="op-page ck-page"><div className="op-shell"><div className="op-card ck-gate"><TriangleAlert size={36} /><h1>{error.status === 404 ? 'Order not found' : 'Something went wrong'}</h1><p>{error.status === 404 ? `We couldn’t find order ${ref.toUpperCase()} in your account. Check you’re signed in with the account that placed it.` : error.message}</p><div className="ck-gate-actions"><Link className="ck-outline" to="/orders">My Orders</Link>{error.status !== 404 && <button type="button" className="ck-pay is-small" onClick={() => void load()}>Try again</button>}</div></div></div></div>;
  if (!data) return <div className="op-page ck-page"><div className="op-shell"><div className="empty-state"><LoaderCircle className="spin" /> Loading your order…</div></div></div>;

  const invoice = data.invoice;
  const showConfirmation = confirmation && paidStatus(invoice?.status);
  return <div className="op-page ck-page">
    <div className="op-shell">
      <header className="op-head ck-head">
        <div className="ck-head-copy">
          <nav className="op-crumbs" aria-label="Breadcrumb"><ol><li><Link to="/">Home</Link></li><li><Link to="/orders">Orders</Link></li><li aria-current="page">{showConfirmation ? 'Confirmation' : 'Payment'}</li></ol></nav>
          <h1>{showConfirmation ? (invoice?.status === 'part_paid' ? 'Deposit received' : 'Order confirmed') : 'Complete your payment'}</h1>
          <p>{showConfirmation ? 'Thank you. Your payment is received and your order is with 3DEEZI.' : 'Your garments, sizes and final mockups are approved. Complete payment to submit your order.'}</p>
        </div>
        <Steps current={showConfirmation ? 3 : 2} />
      </header>
      {invoice?.gateway.banner && <p className="ck-banner" role="note"><TriangleAlert size={16} /> {invoice.gateway.banner}</p>}
      {confirming && <p className="ck-note is-info" role="status"><LoaderCircle className="spin" size={16} /> Confirming your payment with Airwallex… This page updates by itself.</p>}
      {leftCheckout && !confirming && invoice?.can_pay && <p className="ck-note is-info" role="status"><Info size={16} /> The payment wasn’t completed, so nothing was charged. You can pay below when you’re ready.</p>}
      {!showConfirmation && <button type="button" className="ck-jump" onClick={() => document.getElementById('ck-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        <span>Order <b>{data.order.number}</b>{invoice?.total ? <> · <b>{aud(invoice.amount_due ?? invoice.total, invoice.currency)}</b></> : null}</span><span className="ck-jump-link">Order summary <ArrowRight size={14} /></span>
      </button>}
      <div className="ck-grid">
        <div className="ck-main">
          {showConfirmation && invoice ? <ConfirmationCard data={data} invoice={invoice} keyParam={key} keep={keep} />
            : <PaymentCard data={data} keyQuery={keyQuery} keep={keep} onData={setData} onPaid={() => go('confirmation', data.order.number)} />}
        </div>
        <aside className="ck-side" aria-label="Order summary"><OrderSummary data={data} paid={showConfirmation} /></aside>
      </div>
    </div>
  </div>;
}

/** Review & approve ✓ → Payment → Confirmation. */
function Steps({ current }: { current: 2 | 3 }) {
  const steps = ['Review & approve', 'Payment', 'Confirmation'];
  return <ol className="ck-steps" aria-label="Checkout steps">
    {steps.map((label, i) => {
      const n = i + 1;
      const done = n < current || (current === 3 && n === 3);
      const now = n === current;
      return <li key={label} className={`${done ? 'is-done' : ''}${now ? ' is-current' : ''}`} aria-current={now ? 'step' : undefined}>
        <span className="ck-step-dot" aria-hidden="true">{done ? <Check size={17} strokeWidth={3} /> : n}</span>
        <span className="ck-step-label">{label}{done && <span className="op-sr"> (done)</span>}</span>
      </li>;
    })}
  </ol>;
}

/* ============================================================================================ PAYMENT METHOD */

function PaymentCard({ data, keyQuery, keep, onData, onPaid }: { data: Checkout; keyQuery: string; keep: string; onData: (d: Checkout) => void; onPaid: () => void }) {
  const navigate = useNavigate();
  const invoice = data.invoice;
  const order = data.order;
  const gateway = invoice?.gateway;
  const [amount, setAmount] = useState<'full' | 'deposit'>(invoice?.deposit_due ? 'deposit' : 'full');
  const [outcome, setOutcome] = useState<'succeeded' | 'failed'>('succeeded');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const saved = data.billing?.same === false ? data.billing : null;
  const [same, setSame] = useState(!saved);
  const [open, setOpen] = useState(!!saved);
  const [bill, setBill] = useState(() => ({ name: saved?.name ?? order.contact_name ?? '', company: saved?.company ?? order.team_name ?? '', street: saved?.fields?.street ?? '', suburb: saved?.fields?.suburb ?? '', state: saved?.fields?.state ?? '', postcode: saved?.fields?.postcode ?? '', country: saved?.fields?.country ?? 'Australia' }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const payRef = useRef<HTMLDivElement>(null);
  const [payInView, setPayInView] = useState(true);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches);
  const staff = data.viewer === 'staff';
  const payable = !!invoice?.number && invoice.can_pay && order.status !== 'cancelled';
  const due = amount === 'deposit' && invoice?.deposit_due ? invoice.deposit_due : invoice?.amount_due ?? null;
  const failed = invoice?.last_attempt?.status === 'failed' ? invoice.last_attempt.message : null;
  const processing = invoice?.last_attempt?.status === 'processing';

  // Phones: when the PAY button is scrolled away, a bar at the bottom keeps it in reach.
  useEffect(() => {
    const el = payRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setPayInView(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [payable]);
  useEffect(() => { const m = window.matchMedia(NARROW); const on = () => setNarrow(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);
  const barOn = payable && invoice?.gateway.provider !== 'none' && !payInView && narrow;

  /** The billing address: saved with the invoice only when it differs from the delivery address (or changes back). */
  async function saveBilling() {
    if (!invoice?.number || (same && data.billing?.same !== false)) return;
    const body = same ? { same: true } : { same: false, name: bill.name, company: bill.company, address: { street: bill.street, suburb: bill.suburb, state: bill.state, postcode: bill.postcode, country: bill.country } };
    const billing = await api<Billing>(`/invoices/${encodeURIComponent(invoice.number)}/billing${keyQuery}`, { method: 'PUT', body: JSON.stringify(body) });
    onData({ ...data, billing });
  }

  async function pay() {
    if (!invoice?.number || !gateway || busy || staff || !payable) return;
    setBusy(true); setMessage(null); setErrors({});
    try {
      await saveBilling();
      if (gateway.provider === 'stripe') { navigate(`/invoices/${encodeURIComponent(invoice.number)}${keyQuery}`); return; }
      const started = await api<Started>(`/invoices/${encodeURIComponent(invoice.number)}/pay${keyQuery}`, { method: 'POST', body: JSON.stringify({ amount }) });
      if (gateway.provider === 'test') {
        const after = await api<CheckoutInvoice>(`/payments/${started.payment.id}/test-complete${keyQuery}`, { method: 'POST', body: JSON.stringify({ outcome, method: 'card' }) });
        onData({ ...data, invoice: after });
        if (paidStatus(after.status)) onPaid();
        else setMessage(after.last_attempt?.message ?? 'The payment did not go through.');
        setBusy(false);
        return;
      }
      // Airwallex: its secure page takes the card, then sends the customer back here.
      const p = started.payment;
      if (!p.client_secret || !p.intent_id) throw new Error('The secure payment page could not be opened. Please try again.');
      const payments = await loadAirwallex(gateway.environment === 'prod' ? 'prod' : 'demo');
      const back = (param: 'payment' | 'cancelled') => { const q = new URLSearchParams(keep); q.set(param, String(p.id)); return `${window.location.origin}/orders/${encodeURIComponent(order.number)}/pay?${q}`; };
      await Promise.resolve(payments.redirectToCheckout({
        intent_id: p.intent_id, client_secret: p.client_secret, currency: invoice.currency, country_code: gateway.country ?? 'AU',
        successUrl: back('payment'), cancelUrl: back('cancelled'), methods: ['card', 'applepay', 'googlepay'],
        appearance: { mode: 'dark', variables: { colorBrand: '#00d9ed' } }, locale: 'en',
      }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.errors) {
        setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k.replace(/^address\./, ''), v[0]])));
        setOpen(true); setMessage('Check the billing address.');
      } else setMessage((e as Error).message);
      setBusy(false);
    }
  }

  const contactLine = [order.contact_name, order.team_name].filter(Boolean).join(' · ') || order.name;
  const payLabel = `PAY ${aud(due, invoice?.currency)}`;
  const set = (field: keyof typeof bill) => (e: { target: { value: string } }) => setBill(b => ({ ...b, [field]: e.target.value }));
  const field = (name: keyof typeof bill, label: string, props: Record<string, unknown> = {}) => <label className={`ck-field${name === 'street' ? ' ck-wide' : ''}`}>
    <span>{label}</span><input className="op-input" value={bill[name]} onChange={set(name)} aria-invalid={!!errors[name]} maxLength={120} {...props} />
    {errors[name] && <small className="op-error">{errors[name]}</small>}
  </label>;

  return <section className="op-card ck-card ck-payment" aria-labelledby="ck-pay-title">
    <div className="ck-card-head"><h2 id="ck-pay-title">Payment method</h2><span className="ck-secure"><Lock size={15} /> Secure checkout</span></div>
    <div className="ck-card-body">
      {!invoice || invoice.status === 'quote_required' ? <div className="ck-notice">
        <Info size={20} /><div><b>{invoice ? 'We’re confirming your price' : 'We’re preparing your invoice'}</b>
          <p>{invoice ? 'Something on your order needs a price from our team. We’ll email your invoice as soon as it’s ready, and you can pay here or from My Orders.' : 'Your order is with 3DEEZI. Your invoice appears here and in My Orders as soon as it’s ready.'}</p>
          {invoice?.reasons?.length ? <ul>{invoice.reasons.map(r => <li key={r.code + (r.key ?? '')}>{r.message}</li>)}</ul> : null}
          <Link className="op-link" to={order.link}>View my order <ArrowRight size={15} /></Link></div>
      </div> : order.status === 'cancelled' || invoice.status === 'refunded' || invoice.status === 'cancelled' ? <div className="ck-notice">
        <Info size={20} /><div><b>{order.status === 'cancelled' ? 'This order was cancelled' : `Invoice ${invoice.status}`}</b><p>{invoice.status === 'refunded' ? 'The payment for this invoice was refunded.' : 'Nothing is due on this order.'}</p><Link className="op-link" to="/orders">My Orders <ArrowRight size={15} /></Link></div>
      </div> : <>
        <div className="ck-method is-on" role="radiogroup" aria-label="Payment method">
          <label><input type="radio" name="ck-method" checked readOnly /><span className="ck-radio" aria-hidden="true" />
            <span className="ck-method-text"><b>Credit / debit card</b><small>Pay securely with your credit or debit card.</small></span>
            <CreditCard className="ck-method-icon" size={30} /></label>
        </div>
        {invoice.deposit_due && <div className="ck-amounts" role="radiogroup" aria-label="How much to pay">
          <label className={amount === 'deposit' ? 'is-on' : ''}><input type="radio" name="ck-amount" checked={amount === 'deposit'} onChange={() => setAmount('deposit')} /><span>Deposit ({invoice.payment_rule.deposit_percent}%)<b>{aud(invoice.deposit_due, invoice.currency)}</b></span></label>
          <label className={amount === 'full' ? 'is-on' : ''}><input type="radio" name="ck-amount" checked={amount === 'full'} onChange={() => setAmount('full')} /><span>Pay in full<b>{aud(invoice.amount_due, invoice.currency)}</b></span></label>
        </div>}
        <CardArea gateway={invoice.gateway} invoiceNumber={invoice.number} outcome={outcome} onOutcome={setOutcome} />

        <div className="ck-billing">
          <h3>Billing &amp; delivery</h3>
          <label className="ck-check"><input type="checkbox" checked={same} disabled={staff || busy} onChange={e => { setSame(e.target.checked); if (!e.target.checked) setOpen(true); }} />
            <span className="ck-box" aria-hidden="true"><Check size={15} strokeWidth={3} /></span>
            <span><b>Same as delivery address</b><small>Use the same address for billing and delivery.</small></span></label>
          <div className="ck-person"><span className="ck-person-icon"><UserIcon size={18} /></span><span className="ck-person-name">{contactLine}</span>
            <button type="button" className="op-link" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Hide address' : 'View / edit address'} <ArrowRight size={15} /></button></div>
          {open && <div className="ck-address">
            <div className="ck-address-view"><span>{order.delivery === 'pickup' ? 'Pick up' : 'Delivery address'}</span>
              <p>{order.shipping_address ?? 'No delivery address on this order yet.'}</p>
              <small>Delivery is as you approved it. To change it, contact us before paying.</small></div>
            {same ? <p className="ck-quiet">Billing uses the delivery address. <button type="button" className="op-link" disabled={staff} onClick={() => setSame(false)}>Use a different billing address</button></p>
              : <div className="ck-fields">
                {field('name', 'Name on the invoice', { autoComplete: 'name' })}
                {field('company', 'Company / team', { autoComplete: 'organization' })}
                {field('street', 'Street address', { autoComplete: 'street-address' })}
                {field('suburb', 'Suburb / town', { autoComplete: 'address-level2' })}
                {isAustralia(bill.country) ? <label className="ck-field"><span>State</span>
                  <select className="op-input" value={bill.state.toUpperCase()} onChange={set('state')} aria-invalid={!!errors.state}><option value="">Choose…</option>{AU_STATES.map(s => <option key={s}>{s}</option>)}</select>
                  {errors.state && <small className="op-error">{errors.state}</small>}</label> : field('state', 'State / region')}
                {field('postcode', 'Postcode', { autoComplete: 'postal-code', inputMode: isAustralia(bill.country) ? 'numeric' : undefined, maxLength: 10 })}
                {field('country', 'Country', { autoComplete: 'country-name' })}
              </div>}
          </div>}
        </div>

        {processing && <p className="ck-note is-info" role="status"><LoaderCircle className="spin" size={16} /> Your payment is processing. This page updates by itself.</p>}
        {(message || failed) && <p className="ck-note is-error" role="alert"><TriangleAlert size={16} /> <span><b>{message === 'Check the billing address.' ? 'Check the billing address.' : 'Payment failed.'}</b> {message === 'Check the billing address.' ? '' : `${message ?? failed} Try again or use another card.`}</span></p>}
        {staff && <p className="ck-note is-info"><Info size={16} /> Staff view: only the customer can pay. Use Admin › Invoices › Mark paid for a payment received another way.</p>}
        {invoice.gateway.provider === 'none' ? <div className="ck-notice"><Info size={20} /><div><b>Online payment isn’t available yet</b><p>Please pay by bank transfer using your invoice number {invoice.number} as the reference, or contact us.</p>{invoice.gateway.bank_details && <p className="ck-bank">{invoice.gateway.bank_details}<br />Reference: {invoice.number}</p>}</div></div>
          : <div ref={payRef} className="ck-pay-wrap">
            <button type="button" className="ck-pay" disabled={busy || staff || !payable} onClick={() => void pay()}>{busy ? <LoaderCircle className="spin" size={20} /> : <Lock size={19} />}<span>{payLabel}</span><ArrowRight size={22} /></button>
          </div>}
        <div className="ck-pay-foot">
          <Link className="ck-back" to={order.link}><ArrowLeft size={16} /> Back to order review</Link>
          <span><Lock size={14} /> Payment is processed securely.</span>
        </div>
      </>}
    </div>
    {barOn && <div className="ck-paybar is-on" data-assist-above="">
      <span>Total <b>{aud(due, invoice?.currency)}</b></span>
      <button type="button" className="ck-pay is-small" disabled={busy || staff} onClick={() => void pay()}>{busy ? <LoaderCircle className="spin" size={18} /> : <Lock size={16} />} PAY <ArrowRight size={18} /></button>
    </div>}
  </section>;
}

/** Where the card goes: never our own inputs. Airwallex's page (or Stripe's fields on the invoice page) takes it. */
function CardArea({ gateway, invoiceNumber, outcome, onOutcome }: { gateway: Gateway; invoiceNumber: string | null; outcome: 'succeeded' | 'failed'; onOutcome: (o: 'succeeded' | 'failed') => void }) {
  if (gateway.provider === 'none') return null;
  if (gateway.provider === 'test') return <div className="ck-cardbox is-test">
    <p className="ck-cardbox-title"><ShieldCheck size={18} /> Test mode: no card needed</p>
    <p>Payments are simulated on this computer, so nothing is charged. On the real site, card details are entered securely with Airwallex.</p>
    <fieldset className="ck-outcome"><legend>Test payment result</legend>
      <label><input type="radio" name="ck-outcome" checked={outcome === 'succeeded'} onChange={() => onOutcome('succeeded')} /> Approve</label>
      <label><input type="radio" name="ck-outcome" checked={outcome === 'failed'} onChange={() => onOutcome('failed')} /> Decline</label></fieldset>
  </div>;
  const stripe = gateway.provider === 'stripe';
  return <div className="ck-cardbox">
    <p className="ck-cardbox-title"><ShieldCheck size={18} /> Card details are entered securely with {stripe ? 'Stripe' : 'Airwallex'}</p>
    <p>{stripe ? `Press Pay to enter your card on the secure card form of invoice ${invoiceNumber ?? ''}.` : 'Press Pay to open Airwallex’s secure payment page. Enter your card there, or use Apple Pay or Google Pay, then you come back here.'} Your card details never reach 3DEEZI.</p>
    <p className="ck-cardbox-methods"><CreditCard size={16} /> Visa · Mastercard · Amex {!stripe && <><Wallet size={16} /> Apple Pay · Google Pay</>}</p>
  </div>;
}

/* ============================================================================================ CONFIRMATION */

function ConfirmationCard({ data, invoice, keyParam, keep }: { data: Checkout; invoice: CheckoutInvoice; keyParam: string | null; keep: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const r = invoice.receipt;
  const part = invoice.status === 'part_paid';
  const order = data.order;
  const first = (order.contact_name ?? '').trim().split(/\s+/)[0];
  async function receipt() { if (!invoice.number) return; setBusy(true); setError(''); try { await downloadInvoice(invoice.number, keyParam); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <section className="op-card ck-card ck-confirm" aria-labelledby="ck-confirm-title" aria-live="polite">
    <div className="ck-card-head"><h2 id="ck-confirm-title">{part ? 'Deposit received' : 'Payment received'}</h2><PaymentStatusPill payment={invoice} size="sm" /></div>
    <div className="ck-card-body">
      <div className="ck-confirm-hero">
        <span className="ck-confirm-icon"><CircleCheck size={46} /></span>
        <div><span className="ck-eyebrow">Order number</span><strong className="ck-confirm-number">{order.number}</strong>
          <p>Thank you{first ? `, ${first}` : ''}. {part ? `We’ve received your deposit for ${order.name}.` : `${order.name} is paid and submitted to 3DEEZI.`}</p></div>
      </div>
      {r && <dl className="ck-receipt">
        <div><dt>Receipt</dt><dd>{r.number}</dd></div>
        <div><dt>Amount paid</dt><dd>{aud(r.amount, invoice.currency)}</dd></div>
        {r.paid_at && <div><dt>Paid</dt><dd>{shortDate(r.paid_at)}</dd></div>}
        <div><dt>Method</dt><dd>{r.card ? `${brandName(r.card.brand)} •••• ${r.card.last4}` : r.method === 'bank_transfer' ? 'Bank transfer' : r.method === 'wallet' ? 'Wallet' : 'Card'}</dd></div>
      </dl>}
      {part && <p className="ck-note is-info"><Info size={16} /> <span>Still to pay: <b>{aud(invoice.amount_due, invoice.currency)}</b>. <Link className="op-link" to={`/orders/${encodeURIComponent(order.number)}/pay${keep ? `?${keep}` : ''}`}>Pay the balance <ArrowRight size={14} /></Link></span></p>}
      <h3 className="ck-sub">What happens next</h3>
      <ol className="ck-next">
        <li><span className="ck-next-icon"><Mail size={19} /></span><div><b>Your receipt</b><p>A receipt for invoice {invoice.number} goes to {order.contact_email || 'your email'}.</p></div></li>
        <li><span className="ck-next-icon"><ClipboardCheck size={19} /></span><div><b>Production check</b><p>Our team checks your approved mockups, sizes and artwork, then books your order into production.</p></div></li>
        <li><span className="ck-next-icon"><Truck size={19} /></span><div><b>{order.delivery === 'pickup' ? 'Production & pick up' : 'Production & delivery'}</b><p>Follow every stage in My Orders. We let you know when it {order.delivery === 'pickup' ? 'is ready to pick up' : 'ships'}{order.needed_by ? `, aiming for ${shortDate(order.needed_by)}` : ''}.</p></div></li>
      </ol>
      <div className="ck-actions">
        <Link className="ck-pay is-small" to="/orders">View My Orders <ArrowRight size={18} /></Link>
        <Link className="ck-outline" to={order.link}>View this order</Link>
        <button type="button" className="ck-outline" onClick={() => void receipt()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : null} Download receipt</button>
      </div>
      {error && <p className="error-message">{error}</p>}
    </div>
  </section>;
}

/* ============================================================================================ ORDER SUMMARY */

function OrderSummary({ data, paid }: { data: Checkout; paid: boolean }) {
  const [copied, setCopied] = useState(false);
  const invoice = data.invoice;
  const q = invoice?.quote ?? null;
  const c = invoice?.currency ?? 'AUD';
  const order = data.order;
  const items = data.items;
  const garments = items.reduce((a, i) => a + (i.quantity || 0), 0) || order.quantity;
  const priced = !!invoice && invoice.status !== 'quote_required' && !!q && q.status === 'priced';
  const rows = useMemo<[string, string][]>(() => (priced && q ? [
    ['Garments', aud(q.garments_total, c)],
    ...(Number(q.extras_total) > 0 ? [['Extras', aud(q.extras_total, c)] as [string, string]] : []),
    ...(q.shipping ? [['Shipping', q.shipping.priced ? aud(q.shipping.amount, c) : 'To be confirmed'] as [string, string]] : []),
    ...q.discounts.map(d => [d.name, `-${aud(d.amount, c)}`] as [string, string]),
    [q.tax.included ? `${q.tax.name} (included)` : q.tax.name, aud(q.tax.amount, c)],
  ] : []), [priced, q, c]);
  // The approved order PDF (U4's review PDF, drawn when pressed): the garments with their mockups, in A$.
  const pdf = useMemo(() => ({
    garments: reviewGarmentsFrom({ items: items.map((i, n) => ({ ...i, key: `${n}-${i.garment}` })), projects: data.projects, artwork: artworkOf(order.files) }),
    delivery: reviewDeliveryFromOrder(order as unknown as Parameters<typeof reviewDeliveryFromOrder>[0]),
    priceRows: !priced ? [['Pricing', 'Pricing pending confirmation: 3DEEZI confirms the price, then emails your invoice.'] as [string, string]]
      : [...rows, ['Total', aud(invoice?.total, c)] as [string, string], ...(invoice?.number ? [['Invoice', `${invoice.number} · ${invoice.label}`] as [string, string]] : [])],
  }), [items, data.projects, order, invoice, priced, rows, c]);
  async function copy() {
    try { await navigator.clipboard.writeText(order.number); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); }
  }
  return <section className="op-card ck-card ck-summary" id="ck-summary" aria-labelledby="ck-summary-title">
    <div className="ck-summary-head">
      <h2 id="ck-summary-title">Order summary</h2>
      <div className="ck-ref"><span>Order reference</span><strong>{order.number}</strong>
        <button type="button" onClick={() => void copy()} aria-label={copied ? 'Copied' : `Copy order reference ${order.number}`} title={copied ? 'Copied' : 'Copy'}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
        <span className="op-sr" role="status">{copied ? 'Order reference copied' : ''}</span></div>
    </div>
    <div className="ck-card-body">
      {paid && invoice && <p className="ck-paid-line"><PaymentStatusPill payment={invoice} size="sm" /> {invoice.number}</p>}
      <ul className="ck-items">{items.map((i, n) => <li key={`${i.garment}-${n}`}>
        <span className="ck-thumb"><GarmentPicture garment={i.garment} thumbnail={i.thumbnail} alt={i.name} /></span>
        <span className="ck-item-text"><b>{i.name}</b>{i.fit_name && <small>{i.fit_name} fit</small>}</span>
        <span className="ck-item-qty">× {i.quantity}</span>
      </li>)}</ul>
      {items.length === 0 && <p className="ck-quiet">{order.source === 'upload' ? 'We’re reading your uploaded order form: the garments appear here once we’ve checked them.' : 'No garments on this order yet.'}</p>}
      <div className="ck-count"><span>{summaryText(items.length, garments)}</span><Link className="op-link" to={order.link}>View approved mockups &amp; sizes <ArrowRight size={15} /></Link></div>
      {priced && invoice ? <dl className="ck-prices">
        {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        <div className="ck-total"><dt>Total</dt><dd>{aud(invoice.total, c)}</dd></div>
        {Number(invoice.amount_paid) > 0 && <div className="ck-paid"><dt>Paid</dt><dd>-{aud(invoice.amount_paid, c)}</dd></div>}
        {Number(invoice.amount_paid) > 0 && <div className="ck-due"><dt>Amount due</dt><dd>{aud(invoice.amount_due, c)}</dd></div>}
      </dl> : <p className="ck-pending"><Info size={16} /> Pricing pending confirmation.</p>}
      <div className="ck-pdf"><DownloadReviewPdf {...pdf} reference={order.number} title="APPROVED ORDER" label="Download approved order PDF" filename={`${order.number}-approved-order.pdf`} /></div>
    </div>
  </section>;
}
