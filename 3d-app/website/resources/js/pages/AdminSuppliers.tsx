/**
 * Admin › Suppliers (task 9.118): the applications and listings (approve, hide, edit, logo, paid until), the owner's own
 * makers (3DEEZI, Mantis), and the listing prices card shown in Admin › Pricing. Server: Admin\SupplierAdminController.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Check, Factory, ImagePlus, LoaderCircle, Pencil, Plus, Search, Store, Trash2, X } from 'lucide-react';
import { formatMoney } from '../money';
import { adminSupplierApi, dayText, type AdminSupplier, type ListingPrices, type SupplierStatus } from '../supplierApi';
import { SupplierLogo } from './Suppliers';
import '../../css/suppliers.css';

const STATUS_LABEL: Record<SupplierStatus, string> = { applied: 'Applied', approved: 'Approved', hidden: 'Hidden' };
const STATUS_TONE: Record<SupplierStatus, string> = { applied: 'pending', approved: 'delivered', hidden: 'cancelled' };

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="modal compact-modal admin-modal wide" onCancel={onClose}><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X /></button><h2>{title}</h2>{children}</dialog>;
}

/** The listing's state in a few words: plan, paid until, the invoice. */
function listingText(s: AdminSupplier): string {
  if (s.owner) return 'Owner’s own (no listing)';
  const parts = [s.plan === 'yearly' ? 'Yearly' : s.plan === 'monthly' ? 'Monthly' : 'No plan'];
  if (s.paid_until) parts.push(`${s.expired ? 'ended' : 'paid until'} ${dayText(s.paid_until)}`);
  else if (s.invoice?.status === 'awaiting_payment') parts.push('not paid yet');
  else parts.push('free listing');
  return parts.join(' · ');
}

export default function SuppliersAdmin({ onNotice }: { onNotice: (text: string) => void }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState<{ suppliers: AdminSupplier[]; counts: Record<SupplierStatus, number> } | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AdminSupplier | 'new' | null>(null);
  const load = useCallback(() => {
    adminSupplierApi.list({ ...(query ? { search: query } : {}), ...(status ? { status } : {}) }).then(d => { setData(d); setError(''); }).catch(e => setError((e as Error).message));
  }, [query, status]);
  useEffect(load, [load]);
  async function setSupplierStatus(s: AdminSupplier, next: SupplierStatus) {
    try { await adminSupplierApi.update(s.id, { status: next }); onNotice(`${s.name} is now ${STATUS_LABEL[next].toLowerCase()}.`); load(); }
    catch (e) { onNotice((e as Error).message); }
  }
  async function remove(s: AdminSupplier) {
    if (!window.confirm(`Remove ${s.name}? Orders it made keep its name.`)) return;
    try { onNotice((await adminSupplierApi.remove(s.id)).message); load(); } catch (e) { onNotice((e as Error).message); }
  }
  return <section className="glow-panel admin-card" data-testid="admin-suppliers">
    <div className="admin-toolbar"><h2><Factory size={18} /> Suppliers {data && <small>{data.suppliers.length}</small>}</h2>
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Company, email, what they make" /></form>
      <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{(Object.keys(STATUS_LABEL) as SupplierStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}{data ? ` (${data.counts[s]})` : ''}</option>)}</select>
      <button className="button button-gradient" onClick={() => setEditing('new')}><Plus size={16} /> Add supplier</button></div>
    <p className="muted pa-sub">Approved suppliers show on the Preferred suppliers page and in the order form’s “Made by” choice while their listing is paid (or free). 3DEEZI and Mantis are the owner’s own. Pass an outside supplier’s orders on to them yourself for now.</p>
    {error && <p className="error-message">{error}</p>}
    {!data ? <div className="empty-state"><LoaderCircle className="spin" /></div> : <div className="table-wrap"><table className="admin-table"><thead><tr><th>Supplier</th><th>Contact</th><th>Listing</th><th>Orders</th><th>Status</th><th /></tr></thead><tbody>
      {data.suppliers.map(s => <tr key={s.id} data-supplier={s.name}>
        <td><div className="order-kit"><SupplierLogo supplier={s} size="sm" /><div><strong>{s.name}</strong>{s.owner && <> <span className="sp-badge"><BadgeCheck size={12} /> Owner</span></>}<small className="cell-sub">{[s.makes, s.location].filter(Boolean).join(' · ') || '—'}</small></div></div></td>
        <td>{s.contact_name || <span className="muted">—</span>}{s.email && <small className="cell-sub">{s.email}</small>}{s.phone && <small className="cell-sub">{s.phone}</small>}</td>
        <td>{listingText(s)}{s.invoice && <small className="cell-sub">{s.invoice.invoice_number} · {s.invoice.label}{s.invoice.total ? ` · ${formatMoney(s.invoice.total, s.invoice.currency)}` : ''}</small>}{!s.owner && s.status === 'approved' && !s.listed && <small className="cell-sub sp-error">Not shown: listing ended</small>}</td>
        <td>{s.orders_count}</td>
        <td><select className={`status-select s-${STATUS_TONE[s.status]}`} value={s.status} disabled={s.default} onChange={e => void setSupplierStatus(s, e.target.value as SupplierStatus)} aria-label={`Status of ${s.name}`}>{(Object.keys(STATUS_LABEL) as SupplierStatus[]).map(v => <option key={v} value={v}>{STATUS_LABEL[v]}</option>)}</select></td>
        <td className="row-actions">{s.status === 'applied' && <button className="icon-button" title="Approve" aria-label={`Approve ${s.name}`} onClick={() => void setSupplierStatus(s, 'approved')}><Check size={15} /></button>}
          <button className="icon-button" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}><Pencil size={15} /></button>
          {!s.owner && <button className="icon-button danger" aria-label={`Remove ${s.name}`} onClick={() => void remove(s)}><Trash2 size={15} /></button>}</td></tr>)}
      {!data.suppliers.length && <tr><td colSpan={6} className="muted">No suppliers found.</td></tr>}
    </tbody></table></div>}
    {editing && <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={message => { setEditing(null); onNotice(message); load(); }} />}
  </section>;
}

function SupplierForm({ supplier, onClose, onSaved }: { supplier: AdminSupplier | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '', website: supplier?.website_text ?? '', makes: supplier?.makes ?? '', location: supplier?.location ?? '', summary: supplier?.summary ?? '',
    contact_name: supplier?.contact_name ?? '', email: supplier?.email ?? '', phone: supplier?.phone ?? '', plan: supplier?.plan ?? '', paid_until: supplier?.paid_until ?? '',
    status: supplier?.status ?? 'approved', sort: String(supplier?.sort ?? 100),
  });
  const [logo, setLogo] = useState<File | null>(null);
  const logoUrl = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  useEffect(() => () => { if (logoUrl) URL.revokeObjectURL(logoUrl); }, [logoUrl]);
  const [current, setCurrent] = useState(supplier);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const body = { ...form, plan: form.plan || null, paid_until: form.paid_until || null, sort: Number(form.sort) || 0 };
    try {
      if (supplier) {
        await adminSupplierApi.update(supplier.id, body);
        if (logo) await adminSupplierApi.logo(supplier.id, logo);
      } else {
        const data = new FormData();
        Object.entries(body).forEach(([k, v]) => { if (v !== null && v !== '') data.append(k, String(v)); });
        if (logo) data.append('logo', logo);
        await adminSupplierApi.create(data);
      }
      onSaved(`${form.name} saved.`);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function dropLogo() {
    if (!current) return;
    try { setCurrent(await adminSupplierApi.removeLogo(current.id)); } catch (err) { setError((err as Error).message); }
  }
  const text = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label className="field">{label}<input {...props} value={form[key]} onChange={set(key)} /></label>;
  return <Dialog title={supplier ? `Edit ${supplier.name}` : 'Add a supplier'} onClose={onClose}><form onSubmit={submit} className="admin-form">
    <div className="field-row">{text('name', 'Company', { required: true, maxLength: 160 })}{text('website', 'Website', { maxLength: 255, placeholder: 'company.com' })}</div>
    <div className="field-row">{text('makes', 'What they make', { maxLength: 300 })}{text('location', 'Where', { maxLength: 160 })}</div>
    <label className="field">Short description (on their card)<textarea rows={2} maxLength={300} value={form.summary} onChange={set('summary')} /></label>
    <div className="sp-logo-field">
      <span className="sp-logo-preview">{logoUrl ? <img src={logoUrl} alt="New logo" /> : current?.logo_url ? <img src={current.logo_url} alt="Logo" /> : <ImagePlus size={24} />}</span>
      <div><strong>Logo</strong><small className="muted">PNG, JPEG or WebP, up to 2 MB.</small>
        <div className="sp-logo-actions"><label className="button button-outline sp-file">{logo || current?.logo_url ? 'Change logo' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { setLogo(e.target.files?.[0] ?? null); e.target.value = ''; }} /></label>
          {(logo || current?.logo_url) && <button type="button" className="button button-secondary" onClick={() => (logo ? setLogo(null) : void dropLogo())}><X size={14} /> Remove</button>}</div></div>
    </div>
    <div className="field-row">{text('contact_name', 'Contact name', { maxLength: 120 })}{text('email', 'Email', { type: 'email', maxLength: 190 })}</div>
    <div className="field-row">{text('phone', 'Phone', { maxLength: 40 })}<label className="field">Status<select value={form.status} onChange={set('status')} disabled={!!supplier?.default}>{(Object.keys(STATUS_LABEL) as SupplierStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label></div>
    {!supplier?.owner && <div className="field-row"><label className="field">Listing plan<select value={form.plan} onChange={set('plan')}><option value="">No plan</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>{text('paid_until', 'Paid until (empty: free listing)', { type: 'date' })}</div>}
    {text('sort', 'Order on the page (lower first)', { type: 'number', min: 0, max: 9999 })}
    {supplier?.message && <div className="field">Their message<p className="muted sp-summary">{supplier.message}</p></div>}
    {supplier?.account && <p className="field-hint">Applied from the account {supplier.account.name} ({supplier.account.email}).</p>}
    {error && <p className="error-message">{error}</p>}
    <button className="button button-gradient full-width" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{supplier ? 'SAVE CHANGES' : 'ADD SUPPLIER'}</button>
  </form></Dialog>;
}

/** Every maker for the admin's order lists (3DEEZI first), loaded once per list. */
function useMakers() {
  const [makers, setMakers] = useState<AdminSupplier[]>([]);
  useEffect(() => { adminSupplierApi.list({}).then(d => setMakers(d.suppliers)).catch(() => setMakers([])); }, []);
  return makers;
}

/** Admin › Orders and the order board: "Made by" filter ('' all, '3deezi', or a supplier's id). */
export function MadeByFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const makers = useMakers();
  if (!makers.length) return null;
  return <select className="admin-select" value={value} onChange={e => onChange(e.target.value)} aria-label="Filter by who makes it" data-testid="made-by-filter">
    <option value="">Made by: all</option>
    {makers.map(m => <option key={m.id} value={m.default ? '3deezi' : String(m.id)}>{m.name}{m.status !== 'approved' ? ` (${STATUS_LABEL[m.status].toLowerCase()})` : ''}</option>)}
  </select>;
}

/** The admin's order form: who makes it (staff may pass an order to any supplier). */
export function MadeBySelect({ value, onChange }: { value: number | ''; onChange: (value: number | '') => void }) {
  const makers = useMakers();
  if (!makers.length) return null;
  const fallback = makers.find(m => m.default)?.id ?? '';
  return <label className="field">Made by<select value={value === '' ? fallback : value} onChange={e => onChange(e.target.value ? Number(e.target.value) : '')} data-testid="made-by-select">
    {makers.map(m => <option key={m.id} value={m.id}>{m.name}{m.status !== 'approved' ? ` (${STATUS_LABEL[m.status].toLowerCase()})` : ''}</option>)}
  </select></label>;
}

/** Admin › Pricing: what outside suppliers pay for their listing (monthly or yearly, including GST). */
export function SupplierListingPrices({ onNotice }: { onNotice: (text: string) => void }) {
  const [prices, setPrices] = useState<ListingPrices | null>(null);
  const [form, setForm] = useState({ monthly: '', yearly: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { adminSupplierApi.prices().then(p => { setPrices(p); setForm({ monthly: p.monthly, yearly: p.yearly }); }).catch(e => setError((e as Error).message)); }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const p = await adminSupplierApi.savePrices(form.monthly, form.yearly); setPrices(p); setForm({ monthly: p.monthly, yearly: p.yearly }); onNotice('Supplier listing prices saved.'); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <section className="glow-panel admin-card" data-testid="supplier-listing-prices">
    <div className="admin-toolbar"><h2><Store size={18} /> Preferred supplier listing</h2></div>
    <p className="muted pa-sub">What an outside supplier pays to be listed on the Preferred suppliers page and in the order form’s “Made by” choice. Including {prices?.tax_name ?? 'GST'}; 0 makes it free.</p>
    <form className="admin-form" onSubmit={save}>
      <div className="field-row">
        <label className="field">Monthly ({prices?.currency ?? 'AUD'})<input type="number" min={0} step="0.01" required value={form.monthly} onChange={e => setForm(f => ({ ...f, monthly: e.target.value }))} /></label>
        <label className="field">Yearly ({prices?.currency ?? 'AUD'})<input type="number" min={0} step="0.01" required value={form.yearly} onChange={e => setForm(f => ({ ...f, yearly: e.target.value }))} /></label>
      </div>
      {error && <p className="error-message">{error}</p>}
      <button className="button button-gradient" disabled={busy || !prices}>{busy && <LoaderCircle className="spin" size={16} />}Save listing prices</button>
    </form>
  </section>;
}
