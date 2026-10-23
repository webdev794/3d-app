/**
 * REVIEW & PAY (/invoices/INV-1048): the invoice as agreed and paying it, desktop and phone (payments-api.md 4-5).
 * Card numbers never touch our page or server. With Airwallex (the default provider) the customer pays on Airwallex's
 * Hosted Payment Page (Airwallex.js redirectToCheckout: card, Apple Pay, Google Pay) and comes back here, where the
 * payment is checked with Airwallex. With Stripe, Stripe.js draws the card fields (iframes) and confirms the payment;
 * wallets come through Stripe's Payment Request button. Without provider keys on a developer's computer, a clearly
 * labelled TEST form pays through the same server path.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronDown, CircleCheck, CreditCard, FileText, Info, LoaderCircle, Lock, ShieldCheck, TriangleAlert, Wallet } from 'lucide-react';
import { api, ApiError, getToken, type User } from '../api';
import { PaymentStatusPill, downloadInvoice, money, type PaymentSummary, type Quote } from '../components/OrderPayment';

interface InvoicePayment { id: number; provider: 'airwallex' | 'stripe' | 'test' | 'manual'; kind: string; method: string | null; status: string; amount: string; currency: string; message: string | null; card: { brand: string | null; last4: string } | null; paid_at: string | null; created_at: string | null }
interface InvoiceData extends PaymentSummary {
  id: number; number: string; viewer: 'owner' | 'link' | 'staff';
  order: { id: number | null; number: string | null; name: string | null; status: string | null; approval: string | null; quantity: number; summary: string | null;
    /** "team": a 3DEEZI TEAM design request's invoice (no garments); "order" or missing: an order's. */
    source?: string | null };
  customer: { name: string | null; contact: string | null; email: string | null; phone: string | null; address: string | null } | null;
  seller: { name: string; abn: string; email: string; logo: string | null };
  quote: Quote; payments: InvoicePayment[];
  receipt: { number: string; amount: string; paid_at: string | null; method: string | null; card: { brand: string | null; last4: string } | null } | null;
  gateway: { provider: 'airwallex' | 'stripe' | 'test' | 'none'; publishable_key: string | null; environment: 'demo' | 'prod' | null; country: string | null; test_mode: boolean; banner: string | null; wallets: boolean; bank_details: string | null };
  payment_rule: { rule: 'none' | 'deposit' | 'full'; deposit_percent: number };
  notes: string | null;
}

/* Stripe.js, loaded from js.stripe.com when Stripe is set up (no npm package). */
interface StripeElement { mount: (el: HTMLElement) => void; destroy: () => void; on: (event: string, cb: (e: { error?: { message?: string }; complete?: boolean }) => void) => void }
interface PaymentRequestEvent { paymentMethod: { id: string }; complete: (status: 'success' | 'fail') => void }
interface StripePaymentRequest { canMakePayment: () => Promise<Record<string, boolean> | null>; on: (event: 'paymentmethod', cb: (ev: PaymentRequestEvent) => void) => void }
interface StripeJs {
  elements: (options?: Record<string, unknown>) => { create: (type: string, options?: Record<string, unknown>) => StripeElement };
  confirmCardPayment: (secret: string, data?: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ error?: { message?: string }; paymentIntent?: { status: string } }>;
  paymentRequest: (options: Record<string, unknown>) => StripePaymentRequest;
}
/* Airwallex.js, loaded from static.airwallex.com when Airwallex is set up (no npm package). */
interface AirwallexPayments { redirectToCheckout: (options: Record<string, unknown>) => unknown }
interface AirwallexSdk { init: (options: Record<string, unknown>) => Promise<{ payments?: AirwallexPayments }> }
declare global { interface Window { Stripe?: (key: string) => StripeJs; AirwallexComponentsSDK?: AirwallexSdk } }
let airwallexSdk: Promise<AirwallexPayments> | null = null;
/** Also used by COMPLETE YOUR PAYMENT (OrderCheckout.tsx). */
export function loadAirwallex(env: 'demo' | 'prod'): Promise<AirwallexPayments> {
  airwallexSdk ??= new Promise<void>((resolve, reject) => {
    if (window.AirwallexComponentsSDK) return resolve();
    const script = document.createElement('script');
    script.src = 'https://static.airwallex.com/components/sdk/v1/index.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('The secure payment page could not load. Check your connection and try again.'));
    document.head.append(script);
  }).then(async () => {
    if (!window.AirwallexComponentsSDK) throw new Error('The secure payment page could not load.');
    const { payments } = await window.AirwallexComponentsSDK.init({ env, enabledElements: ['payments'], locale: 'en' });
    if (!payments) throw new Error('The secure payment page could not load.');
    return payments;
  });
  airwallexSdk.catch(() => { airwallexSdk = null; });
  return airwallexSdk;
}
let stripeScript: Promise<void> | null = null;
function loadStripe(key: string): Promise<StripeJs> {
  stripeScript ??= new Promise((resolve, reject) => {
    if (window.Stripe) return resolve();
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { stripeScript = null; reject(new Error('The secure card form could not load. Check your connection and try again.')); };
    document.head.append(script);
  });
  return stripeScript.then(() => { if (!window.Stripe) throw new Error('The secure card form could not load.'); return window.Stripe(key); });
}
const CARD_STYLE = { base: { color: '#e8f1fb', fontFamily: 'Inter, Arial, sans-serif', fontSize: '15px', iconColor: '#00d9ed', '::placeholder': { color: '#6d8197' } }, invalid: { color: '#ff9fb0', iconColor: '#ff9fb0' } };

function usePhone() {
  const query = '(max-width: 760px)';
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => { const m = window.matchMedia(query); const on = () => setPhone(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);
  return phone;
}
const shortDate = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const brandName = (brand: string | null | undefined) => brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Card';

export default function InvoicePayPage({ user, checking, requireAuth }: { user: User | null; checking: boolean; requireAuth: (after?: () => void) => void }) {
  const { number = '' } = useParams();
  const [search] = useSearchParams();
  const key = search.get('key');
  const navigate = useNavigate();
  const phone = usePhone();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const suffix = key ? `?key=${encodeURIComponent(key)}` : '';
  const path = `/invoices/${encodeURIComponent(number.toUpperCase())}`;
  const returned = /^\d+$/.test(search.get('payment') ?? '') ? search.get('payment') : null;
  const leftCheckout = !!search.get('cancelled');
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    api<InvoiceData>(`${path}${suffix}`).then(data => {
      // An order's invoice is paid on the order's COMPLETE YOUR PAYMENT page (the same payment, in the client's design),
      // keeping the app's pay link (?key=) and Airwallex's return (?payment= / ?cancelled=). 3DEEZI TEAM invoices (no
      // order), staff and Stripe (its card fields are on this page) stay here.
      if (data.order.number && data.order.status && data.viewer !== 'staff' && data.gateway.provider !== 'stripe') {
        const q = new URLSearchParams(search);
        q.set('invoice', data.number);
        navigate(`/orders/${encodeURIComponent(data.order.number)}/${data.status === 'paid' && !q.get('payment') ? 'confirmation' : 'pay'}?${q}`, { replace: true });
        return;
      }
      setInvoice(data); setError(null);
    })
      .catch(e => setError({ status: e instanceof ApiError ? e.status : 0, message: (e as Error).message }));
  }, [path, suffix, search, navigate]);
  const signedIn = !!user || !!getToken();
  useEffect(() => { if (key || (signedIn && !checking)) load(); }, [load, key, signedIn, checking]);
  // Back from Airwallex's payment page: check the payment with Airwallex (its webhook may come a little later).
  useEffect(() => {
    if (!returned || !(key || (signedIn && !checking))) return;
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setConfirming(true);
    const check = async () => {
      try {
        const data = await api<InvoiceData>(`/payments/${returned}/sync${suffix}`, { method: 'POST' });
        if (stopped) return;
        setInvoice(data); setError(null);
        if (data.status === 'paid' || data.status === 'part_paid' || !data.can_pay) { setConfirming(false); return; }
      } catch { if (stopped) return; }
      if (++tries >= 12) { setConfirming(false); return; }
      timer = setTimeout(check, 4000);
    };
    void check();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [returned, key, signedIn, checking, suffix]);
  // A card payment still processing: look again for a while.
  useEffect(() => {
    if (invoice?.last_attempt?.status !== 'processing') return;
    const timer = setInterval(load, 4000);
    const stop = setTimeout(() => clearInterval(timer), 120_000);
    return () => { clearInterval(timer); clearTimeout(stop); };
  }, [invoice?.last_attempt?.status, load]);

  if (!key && !signedIn && !checking) return <div className="page-shell pay-page"><div className="pay-gate glow-panel"><ShieldCheck size={36} /><h1>Sign in to pay</h1><p>Invoice {number.toUpperCase()} is in the account that placed the order. Sign in with it to review and pay.</p><button className="button button-gradient" onClick={() => requireAuth(load)}>Sign in <ArrowRight size={16} /></button></div></div>;
  if (error) return <div className="page-shell pay-page"><div className="pay-gate glow-panel"><TriangleAlert size={36} /><h1>{error.status === 404 ? 'Invoice not found' : 'Something went wrong'}</h1><p>{error.status === 404 ? `We couldn’t find invoice ${number.toUpperCase()} in your account. Check you’re signed in with the account that placed the order.` : error.message}</p><div className="pay-gate-actions"><Link className="button button-outline" to="/orders">My Orders</Link>{error.status !== 404 && <button className="button button-gradient" onClick={load}>Try again</button>}</div></div></div>;
  if (!invoice) return <div className="page-shell pay-page"><div className="empty-state"><LoaderCircle className="spin" /> Loading your invoice…</div></div>;

  const paid = invoice.status === 'paid';
  const closed = invoice.status === 'refunded' || invoice.status === 'cancelled';
  const team = isTeam(invoice);
  const head = paid ? { title: 'Payment received', sub: 'Thank you. Your invoice is paid in full.' }
    : closed ? { title: `Invoice ${invoice.status}`, sub: invoice.status === 'refunded' ? 'This invoice was refunded.' : 'This invoice was cancelled: nothing is due.' }
    : team ? (isRevision(invoice) ? { title: 'Pay for your extra revision round', sub: 'Your designer starts the revision once this is paid.' } : { title: 'Pay for your design request', sub: 'Your designer starts once this is paid.' })
    : { title: 'Review & pay', sub: 'Your order is confirmed. Complete payment to continue.' };
  // A 3DEEZI TEAM invoice has no production or artwork approval.
  const approvalBar = team ? invoice.notes : invoice.order.approval && invoice.order.approval !== 'approved'
    ? 'Artwork approval is required before production.'
    : invoice.payment_rule.rule === 'full' && !paid ? 'Production starts once your invoice is paid in full.' : invoice.notes;

  return <div className="page-shell pay-page">
    {phone ? <Link to={team ? '/team/requests' : '/orders'} className="pay-back"><ArrowLeft size={17} /> {team ? 'My design requests' : 'My Orders'}</Link>
      : team ? <nav className="pay-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><i>/</i><Link to="/team">3DEEZI TEAM</Link><i>/</i><Link to="/team/requests">My design requests</Link><i>/</i><span>Invoice</span></nav>
      : <nav className="pay-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><i>/</i><Link to="/orders">Orders</Link><i>/</i><Link to="/orders">My Orders</Link><i>/</i><span>Invoice</span></nav>}
    {invoice.gateway.banner && <div className="pay-test-banner" role="note"><TriangleAlert size={16} /> {invoice.gateway.banner}</div>}
    {phone ? <PhoneHead invoice={invoice} />
      : <header className="pay-head"><h1>{head.title}</h1><p>{head.sub}</p></header>}
    {confirming && !paid && <p className="pay-message is-info" role="status"><LoaderCircle className="spin" size={16} /> Confirming your payment with Airwallex… This page updates by itself.</p>}
    {leftCheckout && !confirming && !paid && !closed && <p className="pay-message is-info" role="status"><Info size={16} /> The payment wasn’t completed, so nothing was charged. You can pay below when you’re ready.</p>}
    <div className="pay-grid">
      {phone ? <details className="pay-details glow-panel"><summary><FileText size={18} /> View invoice details <ChevronDown size={18} className="pay-chevron" /></summary><InvoiceCard invoice={invoice} keyParam={key} bare /></details>
        : <InvoiceCard invoice={invoice} keyParam={key} />}
      {paid || closed || invoice.status === 'part_paid' && !invoice.can_pay
        ? <ResultCard invoice={invoice} keyParam={key} onOrders={() => navigate(team ? '/team/requests' : '/orders')} />
        : <PaymentCard invoice={invoice} keyParam={key} phone={phone} onChange={setInvoice} />}
    </div>
    {approvalBar && <div className="pay-info glow-panel"><Info size={20} /><span>{approvalBar}</span></div>}
  </div>;
}

/** A 3DEEZI TEAM design request's invoice (the API's order.source), and one for an extra revision round. */
const isTeam = (invoice: InvoiceData) => invoice.order.source === 'team';
const isRevision = (invoice: InvoiceData) => isTeam(invoice) && invoice.order.summary === 'Extra revision round';
/** "Order #3DZ-00012", or "Design request TEAM-1001". */
const refOf = (invoice: InvoiceData) => isTeam(invoice) ? `Design request ${invoice.order.number}` : `Order #${invoice.order.number}`;

function PhoneHead({ invoice }: { invoice: InvoiceData }) {
  return <header className="pay-phone-head">
    <h1>Invoice {invoice.number}</h1>
    <PaymentStatusPill payment={invoice} />
    {invoice.order.summary && <p className="pay-phone-summary">{invoice.order.summary}</p>}
    {invoice.order.number && <p className="pay-phone-order">{refOf(invoice)}</p>}
    <strong className="pay-phone-amount">{money(invoice.can_pay ? invoice.amount_due : invoice.total, invoice.currency)}</strong>
  </header>;
}

function InvoiceCard({ invoice, keyParam, bare = false }: { invoice: InvoiceData; keyParam: string | null; bare?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const q = invoice.quote;
  const c = invoice.currency;
  const rows = [...q.lines, ...q.extras];
  async function download() { setBusy(true); setError(''); try { await downloadInvoice(invoice.number, keyParam); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <section className={`pay-card pay-invoice${bare ? ' is-bare' : ' glow-panel'}`} aria-label={`Invoice ${invoice.number}`}>
    {!bare && <div className="pay-invoice-head">
      <div className="pay-invoice-title"><h2>Invoice</h2><PaymentStatusPill payment={invoice} /></div>
      <div className="pay-invoice-ref"><strong>{invoice.number}</strong>{invoice.order.number && <span>{refOf(invoice)}</span>}</div>
    </div>}
    <div className="pay-customer"><span>Customer</span><strong>{invoice.customer?.name || '—'}</strong></div>
    <table className="pay-items"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.key}><td>{r.name}</td><td>{r.quantity}</td><td>{money(r.unit_price, c)}</td><td>{money(r.total, c)}</td></tr>)}</tbody></table>
    <dl className="pay-totals">
      <div><dt>{invoice.order.source === 'team' ? (invoice.order.summary || 'Design request') : 'Garments'}</dt><dd>{money(q.garments_total, c)}</dd></div>
      {Number(q.extras_total) > 0 && <div><dt>Extras</dt><dd>{money(q.extras_total, c)}</dd></div>}
      {q.shipping && <div><dt>Shipping</dt><dd>{money(q.shipping.amount, c)}</dd></div>}
      {q.discounts.map(d => <div key={d.name + d.code} className="is-discount"><dt>{d.name}</dt><dd>-{money(d.amount, c)}</dd></div>)}
      <div className="is-rule"><dt>Subtotal</dt><dd>{money(q.subtotal, c)}</dd></div>
      <div><dt>{q.tax.name} ({q.tax.applies ? `${q.tax.rate}%` : 'not applicable'})</dt><dd>{money(q.tax.amount, c)}</dd></div>
    </dl>
    <div className="pay-total"><span>TOTAL</span><b>{money(invoice.total, c)}</b></div>
    {Number(invoice.amount_paid) > 0 && <dl className="pay-totals is-paid"><div><dt>Paid</dt><dd>-{money(invoice.amount_paid, c)}</dd></div><div><dt>Amount due</dt><dd>{money(invoice.amount_due, c)}</dd></div></dl>}
    <div className="pay-invoice-foot">
      <button type="button" className="pay-download" onClick={download} disabled={busy}>{busy ? <LoaderCircle className="spin" size={22} /> : <FileText size={24} />}<span>Download invoice</span></button>
      <span>{invoice.issued_at ? `Issued ${shortDate(invoice.issued_at)}` : ''}{invoice.due_at && invoice.can_pay ? ` · Due ${shortDate(invoice.due_at)}` : ''}</span>
    </div>
    {error && <p className="error-message">{error}</p>}
  </section>;
}

/** Paid, refunded or cancelled: the receipt, or what happened. */
function ResultCard({ invoice, keyParam, onOrders }: { invoice: InvoiceData; keyParam: string | null; onOrders: () => void }) {
  const [busy, setBusy] = useState(false);
  const r = invoice.receipt;
  const paid = invoice.status === 'paid' || invoice.status === 'part_paid';
  return <section className={`pay-card pay-result glow-panel${paid ? ' is-paid' : ''}`} aria-live="polite">
    <div className="pay-result-icon">{paid ? <CircleCheck size={46} /> : <Info size={46} />}</div>
    <h2>{invoice.status === 'paid' ? 'Payment received' : invoice.status === 'part_paid' ? 'Deposit received' : invoice.status === 'refunded' ? 'Refunded' : 'Cancelled'}</h2>
    {paid && r ? <dl className="pay-receipt">
      <div><dt>Receipt</dt><dd>{r.number}</dd></div>
      <div><dt>Amount</dt><dd>{money(r.amount, invoice.currency)}</dd></div>
      {r.paid_at && <div><dt>Paid</dt><dd>{shortDate(r.paid_at)}</dd></div>}
      <div><dt>Method</dt><dd>{r.card ? `${brandName(r.card.brand)} •••• ${r.card.last4}` : r.method === 'bank_transfer' ? 'Bank transfer' : r.method === 'wallet' ? 'Wallet' : 'Card'}</dd></div>
    </dl> : <p className="muted">{invoice.status === 'refunded' ? 'The payment for this invoice was refunded.' : 'This invoice was cancelled. Nothing is due.'}</p>}
    {paid && <p className="pay-result-note">{invoice.status === 'paid' ? `A receipt is on its way to your email. ${isTeam(invoice) ? 'Your designer can start now.' : 'Your order moves on to production once its design is approved.'}` : `Still to pay: ${money(invoice.amount_due, invoice.currency)}.`}</p>}
    <div className="pay-result-actions">
      <button type="button" className="button button-outline" disabled={busy} onClick={async () => { setBusy(true); try { await downloadInvoice(invoice.number, keyParam); } finally { setBusy(false); } }}>{busy ? <LoaderCircle className="spin" size={15} /> : <FileText size={15} />} {paid ? 'Download receipt' : 'Download invoice'}</button>
      <button type="button" className="button button-gradient" onClick={onOrders}>{isTeam(invoice) ? 'My design requests' : 'My Orders'} <ArrowRight size={15} /></button>
    </div>
  </section>;
}

type Outcome = 'succeeded' | 'failed';

function PaymentCard({ invoice, keyParam, phone, onChange }: { invoice: InvoiceData; keyParam: string | null; phone: boolean; onChange: (i: InvoiceData) => void }) {
  const gateway = invoice.gateway;
  const [tab, setTab] = useState<'card' | 'wallet'>('card');
  const [amount, setAmount] = useState<'full' | 'deposit'>(invoice.deposit_due ? 'deposit' : 'full');
  const [name, setName] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('succeeded');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [stripe, setStripe] = useState<StripeJs | null>(null);
  const [stripeError, setStripeError] = useState('');
  const [walletReady, setWalletReady] = useState<boolean | null>(null);
  const cardEl = useRef<StripeElement | null>(null);
  const refs = { number: useRef<HTMLDivElement>(null), expiry: useRef<HTMLDivElement>(null), cvc: useRef<HTMLDivElement>(null), wallet: useRef<HTMLDivElement>(null) };
  const staff = invoice.viewer === 'staff';
  const due = amount === 'deposit' && invoice.deposit_due ? invoice.deposit_due : invoice.amount_due;
  const suffix = keyParam ? `?key=${encodeURIComponent(keyParam)}` : '';
  const failed = invoice.last_attempt?.status === 'failed' ? invoice.last_attempt.message : null;
  const processing = invoice.last_attempt?.status === 'processing';

  // The secure card fields (Stripe Elements), styled like the page's inputs.
  useEffect(() => {
    if (gateway.provider !== 'stripe' || !gateway.publishable_key || tab !== 'card') return;
    let mounted: StripeElement[] = [];
    let cancelled = false;
    loadStripe(gateway.publishable_key).then(s => {
      if (cancelled || !refs.number.current || !refs.expiry.current || !refs.cvc.current) return;
      setStripe(s);
      const elements = s.elements({ locale: 'en' });
      const number = elements.create('cardNumber', { style: CARD_STYLE, placeholder: '1234 1234 1234 1234', showIcon: true });
      const expiry = elements.create('cardExpiry', { style: CARD_STYLE, placeholder: 'MM / YY' });
      const cvc = elements.create('cardCvc', { style: CARD_STYLE, placeholder: '•••' });
      number.mount(refs.number.current); expiry.mount(refs.expiry.current); cvc.mount(refs.cvc.current);
      for (const el of [number, expiry, cvc]) el.on('change', e => setStripeError(e.error?.message ?? ''));
      cardEl.current = number;
      mounted = [number, expiry, cvc];
    }).catch(e => setStripeError((e as Error).message));
    return () => { cancelled = true; mounted.forEach(el => el.destroy()); cardEl.current = null; };
  }, [gateway.provider, gateway.publishable_key, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Starts the payment on the server: the open payment for this amount, or a new one. */
  const start = useCallback(async () => api<{ payment: InvoicePayment & { client_secret: string | null; intent_id?: string | null }; invoice: InvoiceData }>(`/invoices/${invoice.number}/pay${suffix}`, { method: 'POST', body: JSON.stringify({ amount }) }), [invoice.number, suffix, amount]);
  const finish = useCallback(async (paymentId: number) => { onChange(await api<InvoiceData>(`/payments/${paymentId}/sync${suffix}`, { method: 'POST' })); }, [onChange, suffix]);

  // Apple Pay / Google Pay through Stripe's Payment Request button.
  useEffect(() => {
    if (gateway.provider !== 'stripe' || !gateway.publishable_key || tab !== 'wallet') return;
    let element: StripeElement | null = null;
    let cancelled = false;
    setWalletReady(null);
    loadStripe(gateway.publishable_key).then(async s => {
      const request = s.paymentRequest({ country: 'AU', currency: invoice.currency.toLowerCase(), total: { label: `3DEEZI invoice ${invoice.number}`, amount: Math.round(Number(due) * 100) }, requestPayerName: true });
      const can = await request.canMakePayment();
      if (cancelled) return;
      setWalletReady(!!can);
      if (!can || !refs.wallet.current) return;
      request.on('paymentmethod', async ev => {
        setBusy(true); setMessage(null);
        try {
          const { payment } = await start();
          const result = await s.confirmCardPayment(payment.client_secret ?? '', { payment_method: ev.paymentMethod.id }, { handleActions: false });
          ev.complete(result.error ? 'fail' : 'success');
          if (!result.error && result.paymentIntent?.status === 'requires_action') await s.confirmCardPayment(payment.client_secret ?? '');
          if (result.error) setMessage({ tone: 'error', text: result.error.message ?? 'The payment did not go through.' });
          await finish(payment.id);
        } catch (e) { ev.complete('fail'); setMessage({ tone: 'error', text: (e as Error).message }); }
        finally { setBusy(false); }
      });
      element = s.elements().create('paymentRequestButton', { paymentRequest: request, style: { paymentRequestButton: { type: 'default', theme: 'dark', height: '48px' } } });
      element.mount(refs.wallet.current);
    }).catch(e => { if (!cancelled) { setWalletReady(false); setStripeError((e as Error).message); } });
    return () => { cancelled = true; element?.destroy(); };
  }, [gateway.provider, gateway.publishable_key, tab, due, invoice.currency, invoice.number, start, finish]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Airwallex: start the payment, then go to Airwallex's secure page; it sends the customer back here. */
  async function payAirwallex() {
    if (staff || busy) return;
    setBusy(true); setMessage(null);
    try {
      const { payment } = await start();
      if (!payment.client_secret || !payment.intent_id) throw new Error('The secure payment page could not be opened. Please try again.');
      const payments = await loadAirwallex(gateway.environment === 'prod' ? 'prod' : 'demo');
      const here = `${window.location.origin}/invoices/${encodeURIComponent(invoice.number)}?${keyParam ? `key=${encodeURIComponent(keyParam)}&` : ''}`;
      await Promise.resolve(payments.redirectToCheckout({
        intent_id: payment.intent_id,
        client_secret: payment.client_secret,
        currency: invoice.currency,
        country_code: gateway.country ?? 'AU',
        successUrl: `${here}payment=${payment.id}`,
        cancelUrl: `${here}cancelled=${payment.id}`,
        methods: ['card', 'applepay', 'googlepay'],
        appearance: { mode: 'dark', variables: { colorBrand: '#00d9ed' } },
        locale: 'en',
      }));
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message });
      setBusy(false);
    }
  }

  async function pay(method: 'card' | 'wallet' = 'card') {
    if (staff || busy) return;
    setBusy(true); setMessage(null);
    try {
      const { payment } = await start();
      if (gateway.provider === 'test') {
        onChange(await api<InvoiceData>(`/payments/${payment.id}/test-complete${suffix}`, { method: 'POST', body: JSON.stringify({ outcome, method }) }));
        return;
      }
      if (!stripe || !cardEl.current || !payment.client_secret) throw new Error('The secure card form is not ready yet. Wait a moment and try again.');
      const result = await stripe.confirmCardPayment(payment.client_secret, { payment_method: { card: cardEl.current, billing_details: name.trim() ? { name: name.trim() } : {} } });
      if (result.error) setMessage({ tone: 'error', text: result.error.message ?? 'The payment did not go through.' });
      await finish(payment.id);
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message });
    } finally { setBusy(false); }
  }

  const testField = (value: string) => <div className="pay-input is-test" aria-readonly>{value}<em>TEST</em></div>;
  const stripeField = (ref: React.RefObject<HTMLDivElement | null>, label: string) => <div ref={ref} className="pay-input is-stripe" aria-label={label} />;
  const payLabel = phone ? 'PAY NOW' : `PAY ${money(due, invoice.currency).toUpperCase()}`;
  const none = gateway.provider === 'none';
  const airwallex = gateway.provider === 'airwallex';

  return <section className="pay-card pay-payment glow-panel" aria-label="Payment">
    <h2>Payment</h2>
    {!phone && <div className="pay-due"><span>Amount due</span><strong>{money(due, invoice.currency)}</strong></div>}
    {invoice.deposit_due && <div className="pay-amount-choice" role="radiogroup" aria-label="How much to pay">
      <label className={amount === 'deposit' ? 'is-on' : ''}><input type="radio" name="pay-amount" checked={amount === 'deposit'} onChange={() => setAmount('deposit')} /><span>Deposit ({invoice.payment_rule.deposit_percent}%)<b>{money(invoice.deposit_due, invoice.currency)}</b></span></label>
      <label className={amount === 'full' ? 'is-on' : ''}><input type="radio" name="pay-amount" checked={amount === 'full'} onChange={() => setAmount('full')} /><span>Pay in full<b>{money(invoice.amount_due, invoice.currency)}</b></span></label>
    </div>}
    {processing && <p className="pay-message is-info" role="status"><LoaderCircle className="spin" size={16} /> Your payment is processing. This page updates by itself.</p>}
    {(message || failed) && <p className={`pay-message ${message?.tone === 'info' ? 'is-info' : 'is-error'}`} role="alert"><TriangleAlert size={16} /> <span><b>Payment failed.</b> {message?.text ?? failed} Try again or use another card.</span></p>}
    {none ? <div className="pay-offline">
      <p><strong>Online payment isn’t available yet.</strong> Please pay by bank transfer using your invoice number as the reference, or contact us.</p>
      {gateway.bank_details && <p className="pay-bank">{gateway.bank_details}<br />Reference: {invoice.number}</p>}
    </div> : <>
      {airwallex ? <div className="pay-form pay-hosted">
        <p className="pay-hosted-note"><ShieldCheck size={18} /> <span>You’ll pay on <b>Airwallex’s secure payment page</b> by card, Apple Pay or Google Pay (where your phone or browser has it), then come back here.</span></p>
        <button type="button" className="pay-button" disabled={busy || staff || !invoice.can_pay} onClick={() => void payAirwallex()}>{busy ? <LoaderCircle className="spin" size={20} /> : null}{payLabel} <ArrowRight size={22} /></button>
        <p className="pay-hosted-methods"><CreditCard size={16} /> Card <Wallet size={16} /> Apple Pay · Google Pay</p>
      </div> : <>
      <div className="pay-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'card'} className={tab === 'card' ? 'is-on' : ''} onClick={() => setTab('card')}><CreditCard size={19} /> Card</button>
        <button type="button" role="tab" aria-selected={tab === 'wallet'} className={tab === 'wallet' ? 'is-on' : ''} onClick={() => setTab('wallet')}><Wallet size={19} /> Wallet</button>
      </div>
      {tab === 'card' ? <form className="pay-form" onSubmit={e => { e.preventDefault(); void pay('card'); }}>
        <label className="pay-field">Cardholder name<input className="pay-input" value={name} onChange={e => setName(e.target.value)} autoComplete="cc-name" maxLength={80} placeholder="Enter cardholder name" disabled={staff} /></label>
        <div className="pay-field"><span>Card number</span>{gateway.test_mode ? testField('4242 4242 4242 4242') : stripeField(refs.number, 'Card number')}</div>
        <div className="pay-field-row">
          <div className="pay-field"><span>Expiry date</span>{gateway.test_mode ? testField('12 / 34') : stripeField(refs.expiry, 'Expiry date')}</div>
          <div className="pay-field"><span>CVC</span>{gateway.test_mode ? testField('•••') : stripeField(refs.cvc, 'CVC')}</div>
        </div>
        {gateway.test_mode && <fieldset className="pay-test-outcome"><legend>Test payment result</legend>
          <label><input type="radio" name="outcome" checked={outcome === 'succeeded'} onChange={() => setOutcome('succeeded')} /> Approve</label>
          <label><input type="radio" name="outcome" checked={outcome === 'failed'} onChange={() => setOutcome('failed')} /> Decline</label></fieldset>}
        {stripeError && <p className="pay-message is-error" role="alert"><TriangleAlert size={16} /> {stripeError}</p>}
        <button className="pay-button" disabled={busy || staff || !invoice.can_pay}>{busy ? <LoaderCircle className="spin" size={20} /> : null}{payLabel} <ArrowRight size={22} /></button>
      </form> : <div className="pay-wallet">
        {gateway.test_mode ? <>
          <p className="muted">Apple Pay and Google Pay appear here on supported phones and browsers once card payments are live.</p>
          <button type="button" className="pay-button is-wallet" disabled={busy || staff} onClick={() => void pay('wallet')}>{busy ? <LoaderCircle className="spin" size={20} /> : <Wallet size={20} />} Pay with test wallet</button>
        </> : <>
          <div ref={refs.wallet} className="pay-wallet-button" />
          {walletReady === null && <p className="muted"><LoaderCircle className="spin" size={14} /> Checking for Apple Pay or Google Pay…</p>}
          {walletReady === false && <p className="muted">Apple Pay or Google Pay isn’t available on this device or browser. Pay by card instead.</p>}
        </>}
      </div>}
      </>}
      {staff && <p className="pay-message is-info"><Info size={16} /> Staff view: only the customer can pay. Use Admin › Invoices › Mark paid for a payment received another way.</p>}
      <p className="pay-secure"><Lock size={16} /> Secure payment</p>
      <p className="pay-status-note">Payment status updates after confirmation.</p>
    </>}
  </section>;
}

