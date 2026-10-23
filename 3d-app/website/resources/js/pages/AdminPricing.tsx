/**
 * Admin › Pricing and Admin › Invoices (payments-api.md 7), in the admin console's style:
 * - PricingAdmin: the price list (garments by sport, extras, shipping by destination, quantity tiers and codes),
 *   business details and invoice settings, and the online payment setup.
 * - InvoicesAdmin: every invoice; price and issue "Quote required" orders, mark paid, resend, refund, cancel, PDF.
 * - AdminOrderBilling: an order's invoice inside the order board's order view.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { BadgeDollarSign, Ban, Building2, CheckCircle2, ChevronLeft, ChevronRight, Copy, CreditCard, Download, Eye, FileText, LoaderCircle, Mail, Pencil, Plus, Receipt, RotateCcw, Search, Trash2, TriangleAlert, Upload, X } from 'lucide-react';
import { api, fetchFile, saveBlob } from '../api';
import { PaymentStatusPill, money, type PaymentSummary, type Quote } from '../components/OrderPayment';

type Kind = 'garment' | 'extra' | 'shipping' | 'discount';
interface Rule { id: number; kind: Kind; code: string | null; sport: string | null; name: string; price: string; per_item: string; percent: string | null; unit: 'garment' | 'player' | 'order' | null; auto: boolean; min_quantity: number | null; taxable: boolean; active: boolean; sort: number }
interface Settings { business_name: string; abn: string; address: string; email: string; phone: string; website: string; logo: string | null; logo_url: string | null; currency: string; tax_name: string; tax_rate: string; default_destination: string; invoice_start: number; due_days: number; invoice_note: string; bank_details: string; payment_rule: 'none' | 'deposit' | 'full'; deposit_percent: number }
interface PricingState { rules: Rule[]; settings: Settings; garments: { id: string; name: string }[]; sports: { id: string; name: string }[]; currencies: string[];
  gateway: { mode: 'airwallex' | 'stripe' | 'test' | 'none'; provider_setting: string | null;
    airwallex: { client_id: boolean; api_key: boolean; webhook_secret: boolean; account_id: boolean; env: 'demo' | 'prod'; ready: boolean; webhook_url: string; events: string[] };
    stripe_key: boolean; stripe_secret: boolean; webhook_secret: boolean; live: boolean; webhook_url: string; events: string[]; environment: string } }
interface InvoiceRow extends PaymentSummary { id: number; order: { id: number; number: string; name: string; status: string } | null; customer: { id: number; name: string; email: string } | null; created_at: string; emailed_at: string | null }
interface StaffPayment { id: number; provider: string; kind: string; method: string | null; status: string; amount: string; currency: string; message: string | null; reference: string | null; card: { brand: string | null; last4: string } | null; paid_at: string | null; created_at: string; by: string | null }
interface InvoiceDetail extends InvoiceRow { number: string | null; quote: Quote; staff_notes: string | null; notes: string | null; account: { id: number; name: string; email: string } | null;
  payments: StaffPayment[]; customer: { id: number; name: string; email: string } | null;
  order: InvoiceRow['order'] & { items?: { name: string; quantity: number; sizes: Record<string, number> }[]; summary?: string | null } }
interface Paged<T> { data: T[]; current_page: number; last_page: number; total: number; counts?: Record<string, number> }

const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const KIND_TITLES: Record<Kind, [string, string]> = {
  garment: ['Garments', 'Unit price per garment. A sport’s own price wins over the price for every sport.'],
  extra: ['Extras', 'Names and numbers printing, express production… charged per garment, per printed name/number, or per order.'],
  shipping: ['Shipping', 'A rate per destination: per order plus per garment. GST off for exports.'],
  discount: ['Discounts', 'Automatic quantity tiers (no code) and codes customers type. Both apply to the goods, not shipping.'],
};
const UNIT_LABEL: Record<string, string> = { garment: 'per garment', player: 'per name / number', order: 'per order' };
const METHODS: [string, string][] = [['bank_transfer', 'Bank transfer'], ['cash', 'Cash'], ['card', 'Card (in person)'], ['other', 'Other']];

function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`modal compact-modal admin-modal${wide ? ' wide' : ''} pa-dialog`} onCancel={onClose}><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X /></button><h2>{title}</h2>{children}</dialog>;
}

async function downloadPdf(id: number, number: string | null, onError: (m: string) => void) {
  try { saveBlob(await fetchFile(`/admin/invoices/${id}/pdf`), `${number ?? 'invoice'}.pdf`); } catch (e) { onError((e as Error).message); }
}

/* ============================================================================================ Pricing */

export function PricingAdmin({ onNotice }: { onNotice: (text: string) => void }) {
  const [state, setState] = useState<PricingState | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'prices' | 'business' | 'payments'>('prices');
  const [editing, setEditing] = useState<{ kind: Kind; rule: Rule | null } | null>(null);
  const load = useCallback(() => { api<PricingState>('/admin/pricing').then(setState).catch(e => setError((e as Error).message)); }, []);
  useEffect(load, [load]);
  if (!state) return <div className="empty-state">{error ? <p className="error-message">{error}</p> : <LoaderCircle className="spin" />}</div>;
  const currency = state.settings.currency;
  async function toggle(rule: Rule) {
    try { await api(`/admin/pricing/rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify(ruleBody(rule, { active: !rule.active })) }); onNotice(rule.active ? 'Price switched off.' : 'Price switched on.'); load(); }
    catch (e) { onNotice((e as Error).message); }
  }
  async function remove(rule: Rule) {
    if (!window.confirm(`Delete “${rule.name}”? Invoices already issued keep their prices.`)) return;
    try { await api(`/admin/pricing/rules/${rule.id}`, { method: 'DELETE' }); onNotice('Price deleted.'); load(); } catch (e) { onNotice((e as Error).message); }
  }
  const sportName = (id: string | null) => (id ? state.sports.find(s => s.id === id)?.name ?? id : 'Every sport');
  const cells = (r: Rule): React.ReactNode[] => r.kind === 'garment' ? [<strong key="n">{state.garments.find(g => g.id === r.code)?.name ?? r.code}</strong>, sportName(r.sport), money(r.price, currency)]
    : r.kind === 'extra' ? [<strong key="n">{r.name}</strong>, <code key="c">{r.code}</code>, `${money(r.price, currency)} ${UNIT_LABEL[r.unit ?? 'order']}`, r.auto ? 'Automatic' : 'Customer chooses']
    : r.kind === 'shipping' ? [<strong key="n">{r.name}</strong>, <code key="c">{r.code}</code>, `${money(r.price, currency)}${Number(r.per_item) > 0 ? ` + ${money(r.per_item, currency)} a garment` : ''}`, r.taxable ? 'GST applies' : 'No GST']
    : [<strong key="n">{r.name}</strong>, r.code ? <code key="c">{r.code}</code> : 'Automatic', r.percent !== null ? `${r.percent}% off` : `${money(r.price, currency)} off`, r.min_quantity ? `${r.min_quantity}+ garments` : 'Any quantity'];
  const heads: Record<Kind, string[]> = { garment: ['Garment', 'Sport', 'Unit price'], extra: ['Extra', 'Code', 'Price', 'Added'], shipping: ['Destination', 'Code', 'Rate', 'Tax'], discount: ['Discount', 'Code', 'Amount', 'Needs'] };

  return <div className="pa-page">
    <div className="pa-tabs" role="tablist">
      {([['prices', 'Price list', BadgeDollarSign], ['business', 'Business & invoices', Building2], ['payments', 'Online payments', CreditCard]] as const).map(([id, label, Icon]) =>
        <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Icon size={16} /> {label}</button>)}
    </div>
    {tab === 'prices' && <div className="pa-lists">{(Object.keys(KIND_TITLES) as Kind[]).map(kind => {
      const rules = state.rules.filter(r => r.kind === kind);
      return <section key={kind} className="glow-panel admin-card">
        <div className="admin-toolbar"><h2>{KIND_TITLES[kind][0]} <small>{rules.length}</small></h2><button className="button button-gradient" onClick={() => setEditing({ kind, rule: null })}><Plus size={16} /> Add</button></div>
        <p className="muted pa-sub">{KIND_TITLES[kind][1]}</p>
        <div className="table-wrap"><table className="admin-table compact"><thead><tr>{heads[kind].map(h => <th key={h}>{h}</th>)}<th>On</th><th /></tr></thead><tbody>
          {rules.map(r => <tr key={r.id} className={r.active ? '' : 'pa-off'}>{cells(r).map((c, i) => <td key={i}>{c}</td>)}
            <td><label className="pa-switch"><input type="checkbox" checked={r.active} onChange={() => void toggle(r)} aria-label={`${r.name} on`} /><span /></label></td>
            <td className="row-actions"><button className="icon-button" onClick={() => setEditing({ kind, rule: r })} aria-label={`Edit ${r.name}`}><Pencil size={15} /></button><button className="icon-button danger" onClick={() => void remove(r)} aria-label={`Delete ${r.name}`}><Trash2 size={15} /></button></td></tr>)}
          {!rules.length && <tr><td colSpan={heads[kind].length + 2} className="muted">{kind === 'garment' ? 'No garment prices yet: every order needs a quote until you add them.' : 'None yet.'}</td></tr>}
        </tbody></table></div>
      </section>;
    })}</div>}
    {tab === 'business' && <BusinessSettings state={state} onSaved={next => { setState(next); onNotice('Settings saved.'); }} onNotice={onNotice} />}
    {tab === 'payments' && <PaymentsSetup state={state} onNotice={onNotice} />}
    {editing && <RuleForm kind={editing.kind} rule={editing.rule} state={state} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onNotice('Price saved.'); load(); }} />}
  </div>;
}

function ruleBody(r: Partial<Rule> & { kind: Kind }, patch: Partial<Rule> = {}) {
  const v = { ...r, ...patch };
  return { kind: v.kind, code: v.code ?? null, sport: v.sport ?? null, name: v.name ?? '', price: v.price === '' ? null : v.price, per_item: v.per_item || null,
    percent: v.percent === '' ? null : v.percent ?? null, unit: v.unit ?? null, auto: !!v.auto, min_quantity: v.min_quantity ?? null, taxable: v.taxable ?? true, active: v.active ?? true };
}

function RuleForm({ kind, rule, state, onClose, onSaved }: { kind: Kind; rule: Rule | null; state: PricingState; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Rule> & { kind: Kind }>(rule ?? { kind, code: kind === 'garment' ? state.garments[0]?.id : '', sport: null, name: '', price: '', per_item: '', percent: kind === 'discount' ? '' : null,
    unit: kind === 'extra' ? 'player' : null, auto: kind === 'extra', min_quantity: null, taxable: true, active: true });
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>(rule && kind === 'discount' && rule.percent === null ? 'amount' : 'percent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<Rule>) => setForm(f => ({ ...f, ...patch }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const body = ruleBody(form, kind === 'discount' ? (discountType === 'percent' ? { price: '' } : { percent: '' }) : {});
    try { await api(rule ? `/admin/pricing/rules/${rule.id}` : '/admin/pricing/rules', { method: rule ? 'PATCH' : 'POST', body: JSON.stringify(body) }); onSaved(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const c = state.settings.currency;
  return <Dialog title={`${rule ? 'Edit' : 'Add'} ${({ garment: 'a garment price', extra: 'an extra', shipping: 'a shipping rate', discount: 'a discount' } as Record<Kind, string>)[kind]}`} onClose={onClose}>
    <form className="admin-form" onSubmit={submit}>
      {kind === 'garment' && <div className="field-row">
        <label className="field">Garment<select value={form.code ?? ''} onChange={e => set({ code: e.target.value })}>{state.garments.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <label className="field">Sport<select value={form.sport ?? ''} onChange={e => set({ sport: e.target.value || null })}><option value="">Every sport</option>{state.sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      </div>}
      {kind !== 'garment' && <div className="field-row">
        <label className="field">Name<input required maxLength={120} value={form.name ?? ''} onChange={e => set({ name: e.target.value })} placeholder={kind === 'extra' ? 'Names & numbers printing' : kind === 'shipping' ? 'Australia' : '10% off 50+ garments'} /></label>
        <label className="field">{kind === 'shipping' ? 'Destination code' : kind === 'discount' ? 'Code customers type' : 'Code'}<input required={kind !== 'discount'} maxLength={40} value={form.code ?? ''} onChange={e => set({ code: e.target.value })} placeholder={kind === 'shipping' ? 'AU, NZ, INTL, PICKUP' : kind === 'discount' ? 'Blank = automatic tier' : 'names_numbers'} /></label>
      </div>}
      {kind === 'discount' && <div className="field-row">
        <label className="field">Discount<select value={discountType} onChange={e => setDiscountType(e.target.value as 'percent' | 'amount')}><option value="percent">Percent off</option><option value="amount">Amount off ({c})</option></select></label>
        {discountType === 'percent' ? <label className="field">Percent<input type="number" min={0} max={100} step="0.01" required value={form.percent ?? ''} onChange={e => set({ percent: e.target.value })} /></label>
          : <label className="field">Amount ({c})<input type="number" min={0} step="0.01" required value={form.price ?? ''} onChange={e => set({ price: e.target.value })} /></label>}
      </div>}
      {kind !== 'discount' && <div className="field-row">
        <label className="field">{kind === 'shipping' ? `Per order (${c})` : `Price (${c})`}<input type="number" min={0} step="0.01" required value={form.price ?? ''} onChange={e => set({ price: e.target.value })} /></label>
        {kind === 'shipping' && <label className="field">Per garment ({c})<input type="number" min={0} step="0.01" value={form.per_item ?? ''} onChange={e => set({ per_item: e.target.value })} placeholder="0.00" /></label>}
        {kind === 'extra' && <label className="field">Charged<select value={form.unit ?? 'order'} onChange={e => set({ unit: e.target.value as Rule['unit'] })}><option value="player">Per name / number printed</option><option value="garment">Per garment</option><option value="order">Per order</option></select></label>}
      </div>}
      {kind === 'discount' && <label className="field">Fewest garments<input type="number" min={0} value={form.min_quantity ?? ''} onChange={e => set({ min_quantity: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Any quantity" /></label>}
      {kind === 'extra' && <label className="toggle-row"><input type="checkbox" checked={!!form.auto} onChange={e => set({ auto: e.target.checked })} /><span><strong>Add automatically</strong><small>On: added whenever it applies (names/numbers: each player with a name or number). Off: the customer ticks it in the order form.</small></span></label>}
      {kind === 'shipping' && <label className="toggle-row"><input type="checkbox" checked={form.taxable ?? true} onChange={e => set({ taxable: e.target.checked })} /><span><strong>GST applies</strong><small>Turn off for exports (GST-free).</small></span></label>}
      {error && <p className="error-message">{error}</p>}
      <button className="button button-gradient full-width" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}SAVE</button>
    </form>
  </Dialog>;
}

function BusinessSettings({ state, onSaved, onNotice }: { state: PricingState; onSaved: (s: PricingState) => void; onNotice: (t: string) => void }) {
  const [form, setForm] = useState<Settings>(state.settings);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const set = (patch: Partial<Settings>) => setForm(f => ({ ...f, ...patch }));
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy('save'); setError('');
    const body: Partial<Settings> = { ...form };
    delete body.logo; delete body.logo_url;
    try { onSaved(await api<PricingState>('/admin/pricing/settings', { method: 'PUT', body: JSON.stringify(body) })); } catch (err) { setError((err as Error).message); } finally { setBusy(''); }
  }
  async function logo(file: File | null) {
    setBusy('logo'); setError('');
    try {
      const data = new FormData();
      if (file) data.append('logo', file);
      const next = await api<PricingState>('/admin/pricing/logo', { method: file ? 'POST' : 'DELETE', ...(file ? { body: data } : {}) });
      setForm(f => ({ ...f, logo: next.settings.logo, logo_url: next.settings.logo_url })); onNotice(file ? 'Logo saved.' : 'Logo removed.');
    } catch (err) { setError((err as Error).message); } finally { setBusy(''); }
  }
  return <form className="admin-grid pa-business" onSubmit={save}>
    <section className="glow-panel admin-card"><h2><Building2 size={18} /> Business details on invoices</h2>
      <label className="field">Business name<input required maxLength={120} value={form.business_name} onChange={e => set({ business_name: e.target.value })} /></label>
      <div className="field-row"><label className="field">ABN<input maxLength={30} value={form.abn} onChange={e => set({ abn: e.target.value })} placeholder="12 345 678 901" /></label><label className="field">Phone<input maxLength={40} value={form.phone} onChange={e => set({ phone: e.target.value })} /></label></div>
      <label className="field">Address<textarea rows={2} maxLength={500} value={form.address} onChange={e => set({ address: e.target.value })} /></label>
      <div className="field-row"><label className="field">Email<input type="email" maxLength={190} value={form.email} onChange={e => set({ email: e.target.value })} /></label><label className="field">Website<input maxLength={190} value={form.website} onChange={e => set({ website: e.target.value })} /></label></div>
      <div className="pa-logo">{form.logo_url ? <img src={form.logo_url} alt="Invoice logo" /> : <span className="muted">No logo: the business name is printed instead.</span>}
        <label className="button button-outline">{busy === 'logo' ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />} {form.logo_url ? 'Change logo' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void logo(f); }} /></label>
        {form.logo_url && <button type="button" className="button button-outline" onClick={() => void logo(null)}><Trash2 size={15} /> Remove</button>}</div>
    </section>
    <section className="glow-panel admin-card"><h2><Receipt size={18} /> Tax, invoices and payment</h2>
      <div className="field-row"><label className="field">Currency<select value={form.currency} onChange={e => set({ currency: e.target.value })}>{state.currencies.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="field">Default delivery destination<input maxLength={20} value={form.default_destination} onChange={e => set({ default_destination: e.target.value.toUpperCase() })} placeholder="AU" /></label></div>
      <div className="field-row"><label className="field">Tax name<input required maxLength={20} value={form.tax_name} onChange={e => set({ tax_name: e.target.value })} /></label><label className="field">Tax rate (%)<input type="number" min={0} max={50} step="0.01" required value={form.tax_rate} onChange={e => set({ tax_rate: e.target.value })} /></label></div>
      <div className="field-row"><label className="field">Invoice numbers start at<input type="number" min={1} required value={form.invoice_start} onChange={e => set({ invoice_start: Number(e.target.value) })} /><span className="field-hint">INV-{form.invoice_start}, then the next one up.</span></label><label className="field">Payment due (days)<input type="number" min={0} max={365} required value={form.due_days} onChange={e => set({ due_days: Number(e.target.value) })} /></label></div>
      <label className="field">Before production<select value={form.payment_rule} onChange={e => set({ payment_rule: e.target.value as Settings['payment_rule'] })}><option value="full">The invoice is paid in full</option><option value="deposit">A deposit is paid</option><option value="none">No payment rule</option></select>
        <span className="field-hint">New invoices follow this rule; the order board asks before moving an order into Production otherwise.</span></label>
      {form.payment_rule === 'deposit' && <label className="field">Deposit (%)<input type="number" min={1} max={99} required value={form.deposit_percent} onChange={e => set({ deposit_percent: Number(e.target.value) })} /></label>}
      <label className="field">Bank details for transfers<textarea rows={2} maxLength={500} value={form.bank_details} onChange={e => set({ bank_details: e.target.value })} placeholder="BSB 000-000 · Account 12345678 · 3DEEZI Pty Ltd" /></label>
      <label className="field">Note on every invoice<textarea rows={2} maxLength={1000} value={form.invoice_note} onChange={e => set({ invoice_note: e.target.value })} /></label>
      {error && <p className="error-message">{error}</p>}
      <button className="button button-gradient full-width" disabled={!!busy}>{busy === 'save' && <LoaderCircle className="spin" size={15} />}SAVE SETTINGS</button>
    </section>
  </form>;
}

function PaymentsSetup({ state, onNotice }: { state: PricingState; onNotice: (t: string) => void }) {
  const g = state.gateway;
  const a = g.airwallex;
  const set = (on: boolean) => on ? 'set' : 'not set';
  const copy = (url: string) => { void navigator.clipboard?.writeText(url); onNotice('Webhook address copied.'); };
  const status = g.mode === 'airwallex' ? { ok: true, title: `Airwallex connected (${a.env === 'prod' ? 'live' : 'demo'})`, text: a.env === 'prod' ? 'Customers pay by card, Apple Pay or Google Pay on Airwallex’s secure page from the Review & Pay page.' : 'Demo (sandbox): Airwallex test cards only, no real money. Set AIRWALLEX_ENV=prod with live keys to take payments.' }
    : g.mode === 'stripe' ? { ok: true, title: `Stripe connected (${g.live ? 'live' : 'test'} keys)`, text: 'Customers pay by card, Apple Pay or Google Pay on the Review & Pay page.' }
    : g.mode === 'test' ? { ok: false, title: 'Test mode: payments are simulated', text: 'No Airwallex or Stripe keys on this server. The pay page shows a TEST form; nothing is charged.' }
    : { ok: false, title: 'Online payment is off', text: g.provider_setting ? `PAYMENTS_PROVIDER is ${g.provider_setting}, but its keys are not in the server’s .env. Customers see the bank details meanwhile.` : 'Add the Airwallex keys to the server’s .env. Customers see the bank details meanwhile.' };
  const showStripe = g.mode === 'stripe' || g.stripe_key || g.stripe_secret;
  return <div className="admin-grid">
    <section className="glow-panel admin-card"><h2><CreditCard size={18} /> Card payments</h2>
      <div className={`connection ${status.ok ? 'ok' : 'off'}`}>{status.ok ? <CheckCircle2 size={20} /> : <TriangleAlert size={20} />}<div><strong>{status.title}</strong><span>{status.text}</span></div></div>
      <dl className="kv">
        <dt>Provider</dt><dd>{g.mode === 'none' ? 'none' : g.mode}{g.provider_setting ? ' (PAYMENTS_PROVIDER)' : ''}</dd>
        <dt>AIRWALLEX_CLIENT_ID</dt><dd>{set(a.client_id)}</dd><dt>AIRWALLEX_API_KEY</dt><dd>{set(a.api_key)}</dd>
        <dt>AIRWALLEX_WEBHOOK_SECRET</dt><dd>{set(a.webhook_secret)}</dd><dt>AIRWALLEX_ENV</dt><dd>{a.env === 'prod' ? 'prod (live)' : 'demo (sandbox)'}</dd>
        {a.account_id && <><dt>AIRWALLEX_ACCOUNT_ID</dt><dd>set</dd></>}
        {showStripe && <><dt>STRIPE_KEY</dt><dd>{set(g.stripe_key)}</dd><dt>STRIPE_SECRET</dt><dd>{set(g.stripe_secret)}</dd><dt>STRIPE_WEBHOOK_SECRET</dt><dd>{set(g.webhook_secret)}</dd></>}
        <dt>Environment</dt><dd>{g.environment}</dd>
      </dl>
      <p className="field-hint">Keys live in the server’s .env file (never here). Airwallex › Settings › Developer › API keys.</p>
    </section>
    <section className="glow-panel admin-card"><h2>Airwallex webhook</h2>
      <p className="muted">In Airwallex › Settings › Developer › Webhooks, add this notification URL (in the {a.env === 'prod' ? 'live' : 'demo'} account), tick the events below, and copy its secret into AIRWALLEX_WEBHOOK_SECRET.</p>
      <div className="pa-copy"><code>{a.webhook_url}</code><button type="button" className="icon-button" aria-label="Copy the Airwallex webhook address" onClick={() => copy(a.webhook_url)}><Copy size={15} /></button></div>
      <p className="muted">Events: {a.events.join(', ')}</p>
      {!a.webhook_secret && a.ready && <p className="field-hint">Without the webhook secret, payments are still checked when the customer comes back from Airwallex, but a closed browser tab is only caught by the webhook.</p>}
    </section>
    {showStripe && <section className="glow-panel admin-card"><h2>Stripe webhook</h2>
      <p className="muted">In Stripe › Developers › Webhooks, add this endpoint and copy its signing secret into STRIPE_WEBHOOK_SECRET.</p>
      <div className="pa-copy"><code>{g.webhook_url}</code><button type="button" className="icon-button" aria-label="Copy the Stripe webhook address" onClick={() => copy(g.webhook_url)}><Copy size={15} /></button></div>
      <p className="muted">Events: {g.events.join(', ')}</p>
    </section>}
  </div>;
}

/* ============================================================================================ Invoices */

const FILTERS: [string, string][] = [['', 'All'], ['quote_required', 'Quote required'], ['awaiting_payment', 'Awaiting payment'], ['part_paid', 'Deposit paid'], ['paid', 'Paid'], ['refunded', 'Refunded'], ['cancelled', 'Cancelled']];

export function InvoicesAdmin({ onNotice }: { onNotice: (text: string) => void }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paged<InvoiceRow> | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), ...(status ? { status } : {}), ...(query ? { search: query } : {}) });
    api<Paged<InvoiceRow>>(`/admin/invoices?${params}`).then(setResult).catch(e => setError((e as Error).message));
  }, [page, status, query]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [status, query]);
  const counts = result?.counts ?? {};
  return <section className="glow-panel admin-card">
    <div className="admin-toolbar"><h2><Receipt size={18} /> Invoices {result && <small>{result.total}</small>}</h2>
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Invoice, order, team or customer" /></form></div>
    <div className="pa-filters" role="tablist">{FILTERS.map(([id, label]) => <button key={id} role="tab" aria-selected={status === id} className={status === id ? 'on' : ''} onClick={() => setStatus(id)}>{label}{id && counts[id] ? <em>{counts[id]}</em> : null}</button>)}</div>
    {error && <p className="error-message">{error}</p>}
    {!result ? <div className="empty-state"><LoaderCircle className="spin" /></div> : <div className="table-wrap"><table className="admin-table"><thead><tr><th>Invoice</th><th>Order</th><th>Customer</th><th>Total</th><th>Due</th><th>Status</th><th>Issued</th><th /></tr></thead><tbody>
      {result.data.map(i => <tr key={i.id}>
        <td><strong>{i.invoice_number ?? '—'}</strong>{!i.invoice_number && <small className="cell-sub">Not issued</small>}</td>
        <td>{i.order ? <>{i.order.number}<small className="cell-sub">{i.order.name}</small></> : <span className="muted">Deleted</span>}</td>
        <td>{i.customer?.name ?? '—'}<small className="cell-sub">{i.customer?.email}</small></td>
        <td>{i.total ? money(i.total, i.currency) : <span className="muted">To price</span>}</td>
        <td>{i.can_pay ? money(i.amount_due, i.currency) : '—'}{i.due_at && i.can_pay && <small className="cell-sub">by {date(i.due_at)}</small>}</td>
        <td><PaymentStatusPill payment={i} size="sm" />{i.last_attempt?.status === 'failed' && i.can_pay && <small className="cell-sub pa-warn">Last card payment failed</small>}</td>
        <td>{date(i.issued_at ?? i.created_at)}</td>
        <td className="row-actions"><button className="icon-button" onClick={() => setOpen(i.id)} aria-label={`Open ${i.invoice_number ?? 'quote'} for ${i.order?.number ?? ''}`} title="Open"><Eye size={15} /></button>
          {i.invoice_number && <button className="icon-button" onClick={() => void downloadPdf(i.id, i.invoice_number, onNotice)} aria-label={`Download ${i.invoice_number}`} title="PDF"><Download size={15} /></button>}</td>
      </tr>)}
      {!result.data.length && <tr><td colSpan={8} className="muted">No invoices{status ? ' with this status' : ''} yet.</td></tr>}
    </tbody></table></div>}
    {result && result.last_page > 1 && <div className="pager"><button className="icon-button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button><span>Page {result.current_page} of {result.last_page}</span><button className="icon-button" disabled={page >= result.last_page} onClick={() => setPage(p => p + 1)} aria-label="Next page"><ChevronRight size={16} /></button></div>}
    {open !== null && <InvoiceManager id={open} onClose={() => setOpen(null)} onChanged={load} onNotice={onNotice} />}
  </section>;
}

/** One invoice for staff: price and issue a quote, or mark paid, resend, refund, cancel and download it. */
function InvoiceManager({ id, onClose, onChanged, onNotice }: { id: number; onClose: () => void; onChanged: () => void; onNotice: (t: string) => void }) {
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api<InvoiceDetail>(`/admin/invoices/${id}`).then(setInv).catch(e => setError((e as Error).message)); }, [id]);
  useEffect(load, [load]);
  const changed = (next: InvoiceDetail, message: string) => { setInv(next); onNotice(message); onChanged(); };
  return <Dialog title={inv ? (inv.number ? `Invoice ${inv.number}` : `Quote for ${inv.order?.number ?? 'order'}`) : 'Invoice'} onClose={onClose} wide>
    {!inv ? <div className="empty-state">{error ? <p className="error-message">{error}</p> : <LoaderCircle className="spin" />}</div>
      : inv.status === 'quote_required' && inv.order ? <IssueForm orderId={inv.order.id} quote={inv.quote} reasons={inv.reasons} currency={inv.currency} onIssued={next => changed(next, `Invoice ${next.number} issued and emailed.`)} />
      : <InvoiceActions inv={inv} onChanged={changed} onNotice={onNotice} />}
  </Dialog>;
}

function InvoiceActions({ inv, onChanged, onNotice }: { inv: InvoiceDetail; onChanged: (i: InvoiceDetail, m: string) => void; onNotice: (t: string) => void }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [paid, setPaid] = useState({ method: 'bank_transfer', reference: '', amount: '' });
  const [note, setNote] = useState('');
  async function run(name: string, path: string, body: Record<string, unknown>, message: string) {
    setBusy(name); setError('');
    try { const next = await api<InvoiceDetail & { message?: string }>(`/admin/invoices/${inv.id}/${path}`, { method: 'POST', body: JSON.stringify(body) }); onChanged(next, next.message ?? message); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  const q = inv.quote;
  const payable = inv.can_pay;
  const paidSome = Number(inv.amount_paid) > 0 && inv.status !== 'refunded';
  return <div className="pa-invoice">
    <div className="pa-invoice-head"><PaymentStatusPill payment={inv} /><span>{inv.order?.number} · {inv.order?.name}</span><span className="muted">{inv.account?.name} ({inv.account?.email})</span></div>
    <div className="admin-grid">
      <section className="admin-card pa-box"><h3>Invoice</h3>
        <table className="admin-table compact"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>
          {[...q.lines, ...q.extras].map(l => <tr key={l.key}><td>{l.name}</td><td>{l.quantity}</td><td>{money(l.unit_price, inv.currency)}</td><td>{money(l.total, inv.currency)}</td></tr>)}</tbody></table>
        <dl className="kv pa-kv">
          {q.shipping && <><dt>Shipping · {q.shipping.name}</dt><dd>{money(q.shipping.amount, inv.currency)}</dd></>}
          {q.discounts.map(d => <Fragment key={d.name + d.code}><dt>{d.name}</dt><dd>-{money(d.amount, inv.currency)}</dd></Fragment>)}
          <dt>Subtotal</dt><dd>{money(q.subtotal, inv.currency)}</dd><dt>{q.tax.name} ({q.tax.rate}%)</dt><dd>{money(q.tax.amount, inv.currency)}</dd>
          <dt><strong>Total</strong></dt><dd><strong>{money(inv.total, inv.currency)}</strong></dd><dt>Paid</dt><dd>{money(inv.amount_paid, inv.currency)}</dd><dt>Due</dt><dd>{money(inv.amount_due, inv.currency)}{inv.due_at ? ` by ${date(inv.due_at)}` : ''}</dd>
          <dt>Issued</dt><dd>{date(inv.issued_at)}{inv.emailed_at ? ` · emailed ${date(inv.emailed_at)}` : ''}</dd>
        </dl>
        <div className="project-actions">
          <button className="button button-outline" onClick={() => void downloadPdf(inv.id, inv.number, onNotice)}><FileText size={15} /> PDF</button>
          {(payable || inv.status === 'paid') && <button className="button button-outline" disabled={!!busy} onClick={() => void run('resend', 'resend', {}, 'Emailed.')}>{busy === 'resend' ? <LoaderCircle className="spin" size={15} /> : <Mail size={15} />} {payable ? 'Resend invoice' : 'Resend receipt'}</button>}
          {inv.pay_url && <a className="button button-outline" href={inv.pay_url} target="_blank" rel="noreferrer"><Eye size={15} /> Pay page</a>}
        </div>
      </section>
      <section className="admin-card pa-box"><h3>Payments</h3>
        {inv.payments.length ? <ul className="pa-payments">{inv.payments.map(p => <li key={p.id}><strong>{money(p.amount, p.currency)}</strong> <span className={`pa-pstatus s-${p.status}`}>{p.status}</span>
          <small>{p.provider === 'manual' ? `${METHODS.find(([m]) => m === p.method)?.[1] ?? p.method} · recorded by ${p.by ?? 'staff'}${p.reference ? ` · ${p.reference}` : ''}` : `${p.provider === 'test' ? 'Test' : p.provider === 'airwallex' ? 'Airwallex' : 'Stripe'} ${p.method === 'wallet' ? 'wallet' : 'card'}${p.card ? ` ${p.card.brand ?? ''} •••• ${p.card.last4}` : ''}`} · {date(p.paid_at ?? p.created_at)}{p.message ? ` · ${p.message}` : ''}</small></li>)}</ul>
          : <p className="muted">No payments yet.</p>}
        {payable && <form className="admin-form pa-markpaid" onSubmit={e => { e.preventDefault(); void run('paid', 'mark-paid', { method: paid.method, reference: paid.reference || null, amount: paid.amount || null }, 'Marked paid: the receipt is emailed.'); }}>
          <h4>Mark paid (received another way)</h4>
          <div className="field-row"><label className="field">Method<select value={paid.method} onChange={e => setPaid({ ...paid, method: e.target.value })}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="field">Amount<input type="number" min={0.01} step="0.01" value={paid.amount} onChange={e => setPaid({ ...paid, amount: e.target.value })} placeholder={inv.amount_due ?? ''} /></label></div>
          <label className="field">Reference<input maxLength={120} value={paid.reference} onChange={e => setPaid({ ...paid, reference: e.target.value })} placeholder="e.g. bank reference" /></label>
          <button className="button button-gradient" disabled={!!busy}>{busy === 'paid' ? <LoaderCircle className="spin" size={15} /> : <CheckCircle2 size={15} />} Mark paid</button>
        </form>}
        {(payable || paidSome) && <div className="pa-danger">
          <label className="field">Note (kept on the invoice)<input maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder={paidSome ? 'Why it was refunded' : 'Why it was cancelled'} /></label>
          <div className="project-actions">
            {paidSome && <button className="button button-outline" disabled={!!busy} onClick={() => window.confirm('Refund this invoice? Airwallex card payments are refunded through Airwallex now. Bank transfers: pay the money back yourself; Stripe card payments: refund them in Stripe first.') && void run('refund', 'refund', { note }, 'Refund recorded.')}><RotateCcw size={15} /> Record refund</button>}
            {payable && !paidSome && <button className="button button-outline danger" disabled={!!busy} onClick={() => window.confirm('Cancel this invoice? The customer can no longer pay it.') && void run('cancel', 'cancel', { note }, 'Invoice cancelled.')}><Ban size={15} /> Cancel invoice</button>}
          </div>
        </div>}
      </section>
    </div>
    {error && <p className="error-message">{error}</p>}
  </div>;
}

/** Prices for what has none (and any line staff change), extra lines, shipping and a discount; then issue. */
function IssueForm({ orderId, quote, reasons, currency, onIssued }: { orderId: number; quote: Quote; reasons: PaymentSummary['reasons']; currency: string; onIssued: (i: InvoiceDetail) => void }) {
  const [lines, setLines] = useState<Record<string, string>>({});
  const [shipping, setShipping] = useState('');
  const [discount, setDiscount] = useState('');
  const [custom, setCustom] = useState<{ name: string; quantity: string; unit_price: string }[]>([]);
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<Quote>(quote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const body = JSON.stringify({ lines: Object.fromEntries(Object.entries(lines).filter(([, v]) => v !== '')), shipping: shipping || null, discount: discount || null,
    custom_lines: custom.filter(c => c.name.trim() && c.unit_price !== '').map(c => ({ name: c.name.trim(), quantity: Number(c.quantity) || 1, unit_price: c.unit_price })) });
  useEffect(() => {
    const timer = setTimeout(() => { api<Quote>(`/admin/orders/${orderId}/billing/preview`, { method: 'POST', body }).then(setPreview).catch(e => setError((e as Error).message)); }, 350);
    return () => clearTimeout(timer);
  }, [orderId, body]);
  async function issue() {
    setBusy(true); setError('');
    try { onIssued(await api<InvoiceDetail>(`/admin/orders/${orderId}/invoice`, { method: 'POST', body: JSON.stringify({ ...JSON.parse(body), notes: notes || null, send_email: true }) })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const ready = preview.status === 'priced';
  return <div className="pa-issue">
    {reasons.length > 0 && <div className="pa-reasons"><TriangleAlert size={16} /><ul>{reasons.map((r, i) => <li key={i}>{r.message}</li>)}</ul></div>}
    <table className="admin-table compact"><thead><tr><th>Item</th><th>Qty</th><th>Unit price ({currency})</th><th>Total</th></tr></thead><tbody>
      {preview.lines.filter(l => l.kind === 'garment').map(l => <tr key={l.key}><td>{l.name}</td><td>{l.quantity}</td>
        <td><input className="pa-price" type="number" min={0} step="0.01" value={lines[l.key] ?? ''} placeholder={l.priced ? money(l.unit_price, currency) : 'Price'} aria-label={`Unit price of ${l.name}`} onChange={e => setLines({ ...lines, [l.key]: e.target.value })} /></td>
        <td>{l.priced ? money(l.total, currency) : '—'}</td></tr>)}
      {preview.extras.map(l => <tr key={l.key}><td>{l.name}</td><td>{l.quantity}</td><td>{money(l.unit_price, currency)}</td><td>{money(l.total, currency)}</td></tr>)}
      {custom.map((c, i) => <tr key={`c${i}`}><td><input className="pa-price wide" value={c.name} placeholder="e.g. Design fee" aria-label="Added line" onChange={e => setCustom(custom.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></td>
        <td><input className="pa-price" type="number" min={1} value={c.quantity} aria-label="Quantity" onChange={e => setCustom(custom.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} /></td>
        <td><input className="pa-price" type="number" min={0} step="0.01" value={c.unit_price} aria-label="Unit price" onChange={e => setCustom(custom.map((x, j) => j === i ? { ...x, unit_price: e.target.value } : x))} /></td>
        <td><button type="button" className="icon-button danger" aria-label="Remove line" onClick={() => setCustom(custom.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td></tr>)}
    </tbody></table>
    <button type="button" className="button button-outline pa-add" onClick={() => setCustom([...custom, { name: '', quantity: '1', unit_price: '' }])}><Plus size={15} /> Add a line</button>
    <div className="field-row"><label className="field">Shipping ({preview.shipping?.name ?? 'delivery'}, {currency})<input type="number" min={0} step="0.01" value={shipping} placeholder={preview.shipping?.priced ? money(preview.shipping.amount, currency) : 'Price'} onChange={e => setShipping(e.target.value)} /></label>
      <label className="field">Discount ({currency})<input type="number" min={0} step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0.00" /></label></div>
    <label className="field">Note on the invoice<input maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></label>
    <div className="pa-preview">{ready ? <><span>Subtotal {money(preview.subtotal, currency)} · {preview.tax.name} {money(preview.tax.amount, currency)}</span><strong>Total {money(preview.total, currency)}</strong></>
      : <span className="pa-warn">Still to price: {preview.reasons.map(r => r.message).join(' ')}</span>}</div>
    {error && <p className="error-message">{error}</p>}
    <button className="button button-gradient full-width" disabled={!ready || busy} onClick={() => void issue()}>{busy && <LoaderCircle className="spin" size={15} />}ISSUE INVOICE AND EMAIL THE CUSTOMER</button>
  </div>;
}

/** An order's invoice inside the admin order view: its status and amounts, open it, or price and issue one. */
export function AdminOrderBilling({ orderId, onNotice, onChange }: { orderId: number; onNotice: (text: string) => void; onChange?: () => void }) {
  const [data, setData] = useState<{ invoices: InvoiceRow[]; quote: Quote } | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const load = useCallback(() => { api<{ invoices: InvoiceRow[]; quote: Quote }>(`/admin/orders/${orderId}/billing`).then(setData).catch(e => setError((e as Error).message)); }, [orderId]);
  useEffect(load, [load]);
  const current = data?.invoices.find(i => i.status !== 'cancelled') ?? null;
  const refresh = () => { load(); onChange?.(); };
  return <section className="aob-block pa-order-billing"><h3><Receipt size={16} /> Invoice and payment</h3>
    {!data ? (error ? <p className="error-message">{error}</p> : <LoaderCircle className="spin" size={16} />)
      : current ? <div className="pa-order-row"><PaymentStatusPill payment={current} size="sm" /><strong>{current.invoice_number ?? 'Quote required'}</strong>
          <span>{current.total ? `${money(current.total, current.currency)}${current.can_pay ? ` · ${money(current.amount_due, current.currency)} due` : ''}` : current.reasons[0]?.message ?? ''}</span>
          <button type="button" className="button button-outline" onClick={() => setOpen(current.id)}>{current.status === 'quote_required' ? <><BadgeDollarSign size={15} /> Price and issue</> : <><Eye size={15} /> Manage invoice</>}</button></div>
      : <div className="pa-order-row"><span className="muted">No invoice{data.invoices.length ? ' (the last one was cancelled)' : ''}. Price now: {data.quote.status === 'priced' ? money(data.quote.total, data.quote.currency) : 'quote required'}.</span>
          <button type="button" className="button button-outline" onClick={() => setOpen('new')}><Plus size={15} /> Create invoice</button></div>}
    {open === 'new' && <Dialog title="Create invoice" onClose={() => setOpen(null)} wide><IssueForm orderId={orderId} quote={data!.quote} reasons={data!.quote.reasons} currency={data!.quote.currency} onIssued={i => { onNotice(`Invoice ${i.number} issued and emailed.`); setOpen(null); refresh(); }} /></Dialog>}
    {typeof open === 'number' && <InvoiceManager id={open} onClose={() => { setOpen(null); refresh(); }} onChanged={refresh} onNotice={onNotice} />}
  </section>;
}
