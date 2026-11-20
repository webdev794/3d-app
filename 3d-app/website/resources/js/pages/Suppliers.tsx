/**
 * Preferred suppliers (task 9.118). /suppliers: the approved makers as cards (logo, name, what they make, where, their
 * link) with "Become a preferred supplier". /suppliers/apply: that application (company, contact, what they make,
 * where, logo, message and a monthly or yearly listing), then the listing invoice on the usual pay page; an admin
 * approves it (Admin › Suppliers). A signed-in applicant sees their listing there instead: its status, paying, renewing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, CalendarClock, CheckCircle2, Clock, CreditCard, ExternalLink, Factory, ImagePlus, LoaderCircle, MapPin, Shirt, Store, TriangleAlert, X } from 'lucide-react';
import { ApiError, type User } from '../api';
import { formatMoney } from '../money';
import { dayText, initials, supplierApi, type ListingPrices, type MyListing, type Plan, type Supplier } from '../supplierApi';
import '../../css/suppliers.css';

const price = (amount: string | undefined, currency = 'AUD') => (amount === undefined ? '' : Number(amount) > 0 ? formatMoney(amount, currency, { whole: true }) : 'Free');

export function SupplierLogo({ supplier, size = 'md' }: { supplier: Pick<Supplier, 'name' | 'logo_url'>; size?: 'sm' | 'md' }) {
  return <span className={`sp-logo is-${size}${supplier.logo_url ? '' : ' is-empty'}`} aria-hidden="true">
    {supplier.logo_url ? <img src={supplier.logo_url} alt="" loading="lazy" /> : initials(supplier.name)}
  </span>;
}

function SupplierCard({ supplier }: { supplier: Supplier }) {
  return <article className="sp-card glow-panel" data-testid="supplier-card">
    <header className="sp-card-head">
      <SupplierLogo supplier={supplier} />
      <div><h2>{supplier.name}</h2>{supplier.owner && <span className="sp-badge"><BadgeCheck size={13} /> 3DEEZI family</span>}</div>
    </header>
    {supplier.summary && <p className="sp-summary">{supplier.summary}</p>}
    <dl className="sp-facts">
      {supplier.makes && <div><dt><Shirt size={14} /> Makes</dt><dd>{supplier.makes}</dd></div>}
      {supplier.location && <div><dt><MapPin size={14} /> Where</dt><dd>{supplier.location}</dd></div>}
    </dl>
    {supplier.website && <a className="button button-outline sp-link" href={supplier.website} target="_blank" rel="noopener noreferrer">Visit website <ExternalLink size={14} /></a>}
  </article>;
}

/** /suppliers */
export function SuppliersPage({ user }: { user: User | null }) {
  const [data, setData] = useState<{ suppliers: Supplier[]; prices: ListingPrices } | null>(null);
  const [error, setError] = useState('');
  const [mine, setMine] = useState<MyListing | null>(null);
  useEffect(() => { supplierApi.page().then(setData).catch(e => setError((e as Error).message)); }, []);
  useEffect(() => { if (user) supplierApi.mine().then(setMine).catch(() => setMine(null)); else setMine(null); }, [user?.id]);
  const prices = data?.prices;
  return <div className="page-shell sp-page">
    <div className="page-heading sp-heading">
      <span className="eyebrow"><Factory size={13} /> PREFERRED SUPPLIERS</span>
      <h1>Made by makers <span>we trust.</span></h1>
      <p>Teamwear makers who work with 3DEEZI. Choose one under “Made by” when you fill in an order form; 3DEEZI makes it when you don’t choose.</p>
    </div>
    {mine && <Link to="/suppliers/apply" className="sp-mine glow-panel" data-testid="my-listing-link"><SupplierLogo supplier={mine} size="sm" /><span><strong>Your listing: {mine.name}</strong><small>{statusLine(mine)}</small></span><ArrowRight size={18} /></Link>}
    {error && <p className="error-message">{error}</p>}
    {!data && !error ? <div className="empty-state"><LoaderCircle className="spin" /></div> : data && <div className="sp-grid">
      {data.suppliers.map(s => <SupplierCard key={s.id} supplier={s} />)}
      <article className="sp-card sp-join glow-panel" data-testid="become-supplier">
        <span className="sp-join-icon"><Store size={26} /></span>
        <h2>Become a preferred <span>supplier</span></h2>
        <p className="muted">Make teamwear? Get listed here and in the order form’s “Made by” choice for every team ordering on 3DEEZI.</p>
        {prices && <p className="sp-join-price"><strong>{price(prices.monthly, prices.currency)}</strong> a month or <strong>{price(prices.yearly, prices.currency)}</strong> a year{prices.tax_included ? ` (incl. ${prices.tax_name})` : ''}</p>}
        <Link className="button button-gradient" to="/suppliers/apply">{mine ? 'View your listing' : 'Become a preferred supplier'} <ArrowRight size={16} /></Link>
      </article>
    </div>}
  </div>;
}

function statusLine(l: MyListing) {
  if (l.status === 'hidden') return 'Switched off by 3DEEZI';
  if (l.pay_path) return 'Waiting for your payment';
  if (l.status === 'applied') return l.paid_until ? `Paid until ${dayText(l.paid_until)} · waiting for approval` : 'Waiting for approval';
  if (!l.listed) return 'Your listing has ended: pay to list it again';
  return l.paid_until ? `Listed · paid until ${dayText(l.paid_until)}` : 'Listed';
}

const EMPTY = { company: '', website: '', contact_name: '', email: '', phone: '', makes: '', location: '', summary: '', message: '' };
type Fields = typeof EMPTY;

/** /suppliers/apply */
export function SupplierApplyPage({ user, checking, requireAuth }: { user: User | null; checking: boolean; requireAuth: (action?: () => void) => void }) {
  const navigate = useNavigate();
  const [prices, setPrices] = useState<ListingPrices | null>(null);
  const [mine, setMine] = useState<MyListing | null | undefined>(undefined);
  const [form, setForm] = useState<Fields>(EMPTY);
  const [plan, setPlan] = useState<Plan>('yearly');
  const [logo, setLogo] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef(form); formRef.current = form;
  const planRef = useRef(plan); planRef.current = plan;
  const logoRef = useRef(logo); logoRef.current = logo;
  useEffect(() => { supplierApi.page().then(d => setPrices(d.prices)).catch(() => setPrices(null)); }, []);
  const loadMine = useCallback(() => { if (user) supplierApi.mine().then(setMine).catch(() => setMine(null)); else setMine(null); }, [user?.id]);
  useEffect(loadMine, [loadMine]);
  // Signed in: the account's name and email to start with.
  useEffect(() => { if (user) setForm(f => ({ ...f, contact_name: f.contact_name || user.name, email: f.email || user.email })); }, [user?.id]);
  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo.url); }, [logo]);

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
  function pickLogo(file: File | undefined) {
    setErrors(x => ({ ...x, logo: '' }));
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setErrors(x => ({ ...x, logo: 'Choose a PNG, JPEG or WebP logo.' })); return; }
    if (file.size > 2 * 1024 * 1024) { setErrors(x => ({ ...x, logo: 'The logo can be up to 2 MB.' })); return; }
    setLogo({ file, url: URL.createObjectURL(file) });
  }
  function check(f: Fields) {
    const p: Record<string, string> = {};
    if (!f.company.trim()) p.company = 'Add your company name.';
    if (!f.contact_name.trim()) p.contact_name = 'Add a contact name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) p.email = f.email.trim() ? 'Check the email address.' : 'Add an email address.';
    if (!f.makes.trim()) p.makes = 'Say what you make, e.g. sublimated jerseys and shorts.';
    if (!f.location.trim()) p.location = 'Add where you are, e.g. Brisbane, QLD.';
    return p;
  }
  async function send() {
    const f = formRef.current;
    const problems = check(f);
    setErrors(problems); setError('');
    if (Object.keys(problems).length) { document.querySelector<HTMLElement>('.sp-form [aria-invalid="true"]')?.focus(); return; }
    setBusy(true);
    try {
      const body = new FormData();
      Object.entries(f).forEach(([k, v]) => { if (v.trim()) body.append(k, v.trim()); });
      body.append('plan', planRef.current);
      if (logoRef.current) body.append('logo', logoRef.current.file);
      const result = await supplierApi.apply(body);
      // On to the pay page (the hosted payment for the listing); a free listing waits for approval here.
      if (result.pay_path) navigate(result.pay_path);
      else { setMine(result); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) loadMine();
      if (err.errors) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])));
      setError(err.message);
    } finally { setBusy(false); }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problems = check(formRef.current);
    if (Object.keys(problems).length) { setErrors(problems); return; }
    // The listing and its invoice belong to an account: sign in (or create one) first, then it is sent.
    if (!user) { requireAuth(() => { void send(); }); return; }
    void send();
  }

  if (checking || (user && mine === undefined)) return <div className="page-shell empty-state"><LoaderCircle className="spin" /><p>Loading…</p></div>;
  const crumbs = <nav className="pay-crumbs sp-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><i>/</i><Link to="/suppliers">Preferred suppliers</Link><i>/</i><span>{mine ? 'Your listing' : 'Become a preferred supplier'}</span></nav>;
  if (mine) return <div className="page-shell sp-page sp-apply">{crumbs}<MyListingPanel listing={mine} prices={prices} onChange={setMine} onPay={path => navigate(path)} /></div>;

  const field = (key: keyof Fields, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label className="field">
    <span>{label}{props.required ? null : <small className="sp-optional"> (optional)</small>}</span>
    <input {...props} value={form[key]} onChange={set(key)} aria-invalid={!!errors[key]} />
    {errors[key] && <small className="sp-error">{errors[key]}</small>}
  </label>;
  const cost = (p: Plan) => (prices ? price(p === 'yearly' ? prices.yearly : prices.monthly, prices.currency) : '');
  const free = prices && Number(prices.monthly) <= 0 && Number(prices.yearly) <= 0;
  const saving = prices && Number(prices.monthly) > 0 && Number(prices.yearly) > 0 ? Math.round(100 - Number(prices.yearly) / (Number(prices.monthly) * 12) * 100) : 0;
  return <div className="page-shell sp-page sp-apply">
    {crumbs}
    <div className="page-heading sp-heading">
      <span className="eyebrow"><Store size={13} /> BECOME A PREFERRED SUPPLIER</span>
      <h1>Get your teamwear <span>in front of teams.</span></h1>
      <p>Tell us about your company. {free ? 'Listing is free at the moment.' : 'Choose a monthly or yearly listing and pay online.'} We check every application before your company shows on the Preferred suppliers page and in the order form.</p>
    </div>
    <form className="sp-form" onSubmit={submit} noValidate>
      <section className="glow-panel sp-panel">
        <h2>Your company</h2>
        <div className="field-row">{field('company', 'Company', { required: true, maxLength: 160, autoComplete: 'organization' })}{field('website', 'Website', { maxLength: 255, placeholder: 'yourcompany.com', inputMode: 'url' })}</div>
        <div className="field-row">{field('makes', 'What you make', { required: true, maxLength: 300, placeholder: 'e.g. Sublimated jerseys, shorts and socks' })}{field('location', 'Where you are', { required: true, maxLength: 160, placeholder: 'e.g. Brisbane, QLD' })}</div>
        <label className="field"><span>Short description <small className="sp-optional">(optional, shown on your card)</small></span><textarea rows={2} maxLength={300} value={form.summary} onChange={set('summary')} placeholder="One or two lines about your company" /></label>
        <div className="sp-logo-field">
          <span className="sp-logo-preview">{logo ? <img src={logo.url} alt="Your logo" /> : <ImagePlus size={26} />}</span>
          <div><strong>Logo <small className="sp-optional">(optional)</small></strong><small className="muted">PNG, JPEG or WebP, up to 2 MB. Shown on your card.</small>
            <div className="sp-logo-actions"><label className="button button-outline sp-file">{logo ? 'Change logo' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { pickLogo(e.target.files?.[0]); e.target.value = ''; }} /></label>{logo && <button type="button" className="button button-secondary" onClick={() => setLogo(null)}><X size={14} /> Remove</button>}</div>
            {errors.logo && <small className="sp-error">{errors.logo}</small>}</div>
        </div>
      </section>
      <section className="glow-panel sp-panel">
        <h2>Contact</h2>
        <div className="field-row">{field('contact_name', 'Contact name', { required: true, maxLength: 120, autoComplete: 'name' })}{field('phone', 'Phone', { maxLength: 40, autoComplete: 'tel', inputMode: 'tel' })}</div>
        {field('email', 'Email', { required: true, type: 'email', maxLength: 190, autoComplete: 'email' })}
        <label className="field"><span>Message to 3DEEZI <small className="sp-optional">(optional)</small></span><textarea rows={3} maxLength={3000} value={form.message} onChange={set('message')} placeholder="Sports you cover, minimum order, turnaround times…" /></label>
      </section>
      {!free && <section className="glow-panel sp-panel">
        <h2>Your listing</h2>
        <div className="sp-plans" role="radiogroup" aria-label="Listing plan">
          {(['monthly', 'yearly'] as Plan[]).map(p => <label key={p} className={`sp-plan${plan === p ? ' is-on' : ''}`}>
            <input type="radio" name="plan" value={p} checked={plan === p} onChange={() => setPlan(p)} />
            <span className="sp-plan-name">{p === 'yearly' ? 'Yearly' : 'Monthly'}{p === 'yearly' && saving > 0 && <em>Save {saving}%</em>}</span>
            <strong>{cost(p)}</strong><small>{p === 'yearly' ? 'a year' : 'a month'}{prices?.tax_included ? `, incl. ${prices.tax_name}` : ''}</small>
          </label>)}
        </div>
        <p className="field-hint">You pay after sending this form, on our secure payment page. Your listing goes live once 3DEEZI approves it.</p>
      </section>}
      {!user && <p className="sp-note"><Clock size={15} /> You’ll sign in or create a free account to send it, so you can pay and keep track of your listing.</p>}
      {error && <p className="error-message" role="alert"><TriangleAlert size={15} /> {error}</p>}
      <div className="sp-submit"><button className="button button-gradient" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />}{free ? 'SEND APPLICATION' : 'SEND AND PAY'} <ArrowRight size={16} /></button></div>
    </form>
  </div>;
}

/**
 * The order form's "Made by" choice: 3DEEZI (the default), Mantis, then the approved suppliers. `value` null is the
 * default (3DEEZI). Shown only when there is a choice to make.
 */
export function MadeByField({ suppliers, value, onChange, error }: { suppliers: Supplier[]; value: number | null; onChange: (id: number | null) => void; error?: string }) {
  if (suppliers.length < 2) return null;
  const fallback = suppliers.find(s => s.default) ?? suppliers[0];
  const chosen = suppliers.find(s => s.id === value) ?? fallback;
  const about = [chosen.makes, chosen.location].filter(Boolean).join(' · ');
  return <label className={`op-field sp-made-by${error ? ' has-error' : ''}`} data-testid="made-by">
    <span className="op-label">Made by</span>
    <select className="op-input" name="supplier_id" value={chosen.id} onChange={e => { const id = Number(e.target.value); onChange(id === fallback.id ? null : id); }} aria-invalid={!!error}>
      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.default ? ' (default)' : ''}</option>)}
    </select>
    {error ? <small className="op-error">{error}</small> : <small className="op-hint">{chosen.default ? 'Made by 3DEEZI unless you choose one of our preferred suppliers.' : about || 'One of our preferred suppliers.'} · <Link to="/suppliers" target="_blank" rel="noopener">See the suppliers</Link></small>}
  </label>;
}

/** The applicant's listing: where it is (sent, paid, approved), paying an open invoice, and another month or year. */
function MyListingPanel({ listing, prices, onChange, onPay }: { listing: MyListing; prices: ListingPrices | null; onChange: (l: MyListing) => void; onPay: (path: string) => void }) {
  const [busy, setBusy] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const paid = !!listing.paid_until && !listing.pay_path;
  const steps = [
    { label: 'Application sent', done: true },
    { label: 'Listing paid', done: paid || (prices ? Number(prices.monthly) <= 0 && Number(prices.yearly) <= 0 : false) },
    { label: 'Approved and listed', done: listing.listed },
  ];
  async function renew(plan: Plan) {
    setBusy(plan); setError('');
    try { const next = await supplierApi.renew(plan); onChange(next); if (next.pay_path) onPay(next.pay_path); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  const free = prices && Number(prices.monthly) <= 0 && Number(prices.yearly) <= 0;
  return <section className="glow-panel sp-panel sp-listing" data-testid="my-listing">
    <header className="sp-listing-head"><SupplierLogo supplier={listing} /><div><span className="eyebrow">YOUR LISTING · {listing.reference}</span><h1>{listing.name}</h1><p className="muted">{statusLine(listing)}</p></div></header>
    <ol className="sp-steps">{steps.map(s => <li key={s.label} className={s.done ? 'is-done' : ''}>{s.done ? <CheckCircle2 size={18} /> : <Clock size={18} />}{s.label}</li>)}</ol>
    <dl className="sp-facts sp-listing-facts">
      {listing.makes && <div><dt><Shirt size={14} /> Makes</dt><dd>{listing.makes}</dd></div>}
      {listing.location && <div><dt><MapPin size={14} /> Where</dt><dd>{listing.location}</dd></div>}
      <div><dt><CalendarClock size={14} /> Plan</dt><dd>{listing.plan === 'yearly' ? 'Yearly' : listing.plan === 'monthly' ? 'Monthly' : '—'}{listing.paid_until ? ` · paid until ${dayText(listing.paid_until)}` : ''}</dd></div>
    </dl>
    {error && <p className="error-message">{error}</p>}
    <div className="sp-listing-actions">
      {listing.pay_path && <button type="button" className="button button-gradient" onClick={() => onPay(listing.pay_path!)}><CreditCard size={16} /> Pay {listing.invoice?.total ? formatMoney(listing.invoice.total, listing.invoice.currency) : 'now'}</button>}
      {!listing.pay_path && !free && listing.status !== 'hidden' && (['monthly', 'yearly'] as Plan[]).map(p => <button key={p} type="button" className="button button-outline" disabled={!!busy} onClick={() => void renew(p)}>{busy === p ? <LoaderCircle className="spin" size={15} /> : null}{listing.paid_until ? 'Add' : 'Pay for'} {p === 'yearly' ? 'a year' : 'a month'}{prices ? ` · ${price(p === 'yearly' ? prices.yearly : prices.monthly, prices.currency)}` : ''}</button>)}
      <Link className="button button-secondary" to="/suppliers">Preferred suppliers <ArrowRight size={15} /></Link>
    </div>
    <p className="field-hint">To change your details or logo, contact 3DEEZI from the Support page.</p>
  </section>;
}
