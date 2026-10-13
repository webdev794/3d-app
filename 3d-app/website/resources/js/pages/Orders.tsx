import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LoaderCircle, Package, X } from 'lucide-react';
import { api, type User } from '../api';
import { SIZES, statusLabel, type Order } from './Admin';

const money = (v: string | null, currency = 'AUD') => v === null ? 'Quote pending' : new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(Number(v));

/** "My orders": the customer's orders and their progress. */
export function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Order[]>('/orders').then(setOrders).catch(e => setError(e.message)); }, []);
  return <div className="page-shell admin-page">
    <div className="page-heading"><span className="eyebrow"><Package size={14} /> MY ORDERS</span><h1>From design <span>to delivery.</span></h1><p>Order a saved kit from the studio (⋮ → Order this kit). We confirm the price and keep you updated here.</p></div>
    {error && <p className="error-message">{error}</p>}
    {!orders ? <div className="empty-state"><LoaderCircle className="spin" /></div> : orders.length === 0 ? <div className="glow-panel admin-card empty-state"><p>No orders yet.</p><Link className="button button-gradient" to="/projects">Choose a kit to order <ArrowRight size={16} /></Link></div> :
      <div className="glow-panel admin-card table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Kit</th><th>Items</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead><tbody>
        {orders.map(o => <tr key={o.id}><td><strong>{o.number}</strong></td><td>{o.project?.name ?? '—'}</td><td>{o.quantity}<small className="cell-sub">{Object.entries(o.sizes).map(([s, n]) => `${s}×${n}`).join(' · ')}</small></td><td>{money(o.total, o.currency)}</td><td><span className={`status-pill s-${o.status}`}>{statusLabel(o.status)}</span></td><td>{new Date(o.created_at).toLocaleDateString('en-AU')}</td></tr>)}
      </tbody></table></div>}
  </div>;
}

/** Order a saved kit: sizes, contact and delivery. */
export function OrderKitDialog({ projectId, projectName, user, onClose, onOrdered }: { projectId: number; projectName: string; user: User; onClose: () => void; onOrdered: (order: Order) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ contact_name: user.name, phone: '', shipping_address: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const quantity = Object.values(sizes).reduce((a, b) => a + b, 0);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { onOrdered(await api<Order>('/orders', { method: 'POST', body: JSON.stringify({ ...form, project_id: projectId, sizes: Object.fromEntries(Object.entries(sizes).filter(([, n]) => n > 0)) }) })); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <dialog ref={ref} className="modal compact-modal admin-modal" onCancel={onClose}><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X /></button>
    <span className="eyebrow">ORDER THIS KIT</span><h2>{projectName}</h2><p className="muted">Tell us the sizes you need. We’ll confirm the price and timing before anything is made.</p>
    <form onSubmit={submit} className="admin-form">
      <fieldset className="size-grid"><legend>Quantities by size · {quantity} total</legend>{SIZES.map(s => <label key={s}><span>{s}</span><input type="number" min={0} max={10000} value={sizes[s] || ''} placeholder="0" onChange={e => setSizes({ ...sizes, [s]: Math.max(0, Number(e.target.value) || 0) })} /></label>)}</fieldset>
      <div className="field-row"><label className="field">Contact name<input required maxLength={120} value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></label><label className="field">Phone<input maxLength={40} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label></div>
      <label className="field">Delivery address<textarea rows={2} maxLength={1000} value={form.shipping_address} onChange={e => setForm({ ...form, shipping_address: e.target.value })} /></label>
      <label className="field">Notes<textarea rows={2} maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Deadline, player names, anything we should know" /></label>
      {error && <p className="error-message">{error}</p>}
      <button className="button button-gradient full-width" disabled={busy || quantity < 1}>{busy && <LoaderCircle className="spin" size={16} />}SEND ORDER REQUEST · {quantity} ITEM{quantity === 1 ? '' : 'S'}</button>
    </form></dialog>;
}
