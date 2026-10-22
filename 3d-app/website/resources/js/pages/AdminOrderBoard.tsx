import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ExternalLink, Eye, EyeOff, LoaderCircle, Lock, Paperclip, RefreshCw, Search, Send, Truck, Upload, X } from 'lucide-react';
import { ApiError } from '../api';
import GarmentIcon from '../components/GarmentIcon';
import OrderFormReading from '../components/OrderFormReading';
import { STAGES, StageBlocked, orderApi, uploadAdminFile, type Board, type BoardOrder, type FileKind, type OrderDetail, type OrderStatus, type StageProblem } from '../orderApi';
import '../../css/admin-board.css';

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '');
interface Pending { order: BoardOrder; status: OrderStatus; problems: StageProblem[] }

/**
 * Admin > Order board: every order in its stage. Drag a card to another stage (or use its Move menu); moving into
 * Production checks the design approval and full payment first (staff may override, with a reason for unpaid orders).
 * Open a card to post updates (customer-visible or internal), add files and proofs, set tracking, assignment and dates.
 */
export default function AdminOrderBoard({ onNotice }: { onNotice: (text: string) => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [view, setView] = useState<'current' | 'completed'>('current');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [over, setOver] = useState<OrderStatus | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const load = useCallback(() => { orderApi.adminBoard(view, query).then(b => { setBoard(b); setError(''); }).catch(e => setError((e as Error).message)); }, [view, query]);
  useEffect(load, [load]);

  async function move(order: BoardOrder, status: OrderStatus, confirm?: { approval: boolean; unpaid: boolean; reason: string }) {
    if (order.status === status) return;
    setBusy(order.id);
    // Moved on the board straight away; put back if the server says no.
    setBoard(b => b && moveLocally(b, order, status));
    try {
      await orderApi.moveStage(order.id, status, confirm ? { confirmApproval: confirm.approval, confirmUnpaid: confirm.unpaid, reason: confirm.reason } : {});
      setPending(null);
      onNotice(`${order.number} moved to ${STAGES.find(s => s.status === status)?.label ?? status}.`);
    } catch (e) {
      if (e instanceof StageBlocked) setPending({ order, status, problems: e.problems });
      else onNotice((e as Error).message);
    } finally { setBusy(null); load(); }
  }

  return <section className="glow-panel admin-card aob">
    <div className="admin-toolbar">
      <h2>Order board {board && <small>{board.counts.current} current · {board.counts.completed} completed</small>}</h2>
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Reference, name, garment or customer" aria-label="Search orders" /></form>
      <div className="aob-views" role="group" aria-label="Orders to show">{(['current', 'completed'] as const).map(v => <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'current' ? 'Current' : 'Completed'}</button>)}</div>
      <button type="button" className="button button-outline" onClick={load}><RefreshCw size={15} /> Refresh</button>
    </div>
    <p className="aob-hint">Drag a card to another stage, or use its Move menu. Moving into Production needs the customer’s design approval and full payment; you can override with a reason.</p>
    {error && <p className="error-message">{error}</p>}
    {!board ? <div className="empty-state"><LoaderCircle className="spin" /></div> : <div className="aob-columns">
      {board.stages.map(stage => <div key={stage.status} className={`aob-col tone-${stage.tone}${over === stage.status ? ' is-over' : ''}`} data-status={stage.status}
        onDragOver={e => { e.preventDefault(); setOver(stage.status); }} onDragLeave={() => setOver(o => (o === stage.status ? null : o))}
        onDrop={e => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData('text/order')); const order = board.stages.flatMap(s => s.orders).find(o => o.id === id); if (order) void move(order, stage.status); }}>
        <header><i /><h3>{stage.label}</h3><b>{stage.count}</b></header>
        <div className="aob-cards">
          {stage.orders.map(order => <article key={order.id} className={`aob-card${busy === order.id ? ' is-busy' : ''}`} draggable data-order={order.number}
            onDragStart={e => { e.dataTransfer.setData('text/order', String(order.id)); e.dataTransfer.effectAllowed = 'move'; }}>
            <button type="button" className="aob-open" onClick={() => setOpenId(order.id)} aria-label={`Open ${order.number}`}>
              <span className="aob-ref">{order.number}</span>
              <strong>{order.name}</strong>
              <span className="aob-garments">{order.garments.slice(0, 3).map((g, i) => g.thumbnail ? <img key={i} src={g.thumbnail} alt="" /> : <GarmentIcon key={i} garment={g.garment} />)}{order.garments.length === 0 && (order.cover ? <img src={order.cover} alt="" /> : <Paperclip size={22} />)}</span>
              <span className="aob-meta">{order.quantity ? `${order.quantity} garments` : 'Sizes in the order form'} · {order.customer?.name}</span>
              <span className={`aob-pill tone-${order.sub_status.tone}`}>{order.sub_status.label}</span>
              {order.payment ? <span className={`aob-pill tone-${order.payment.tone}`}>{order.payment.label}</span> : <span className="aob-pill tone-grey">No invoice</span>}
              {order.latest_update && <span className="aob-latest">{order.latest_update.text}{order.latest_update.message && order.latest_update.text !== order.latest_update.message ? `: ${order.latest_update.message}` : ''}</span>}
              <span className="aob-dates">In {day(order.submitted_at)}{order.due_date ? ` · due ${day(order.due_date)}` : ''}{order.needed_by ? ` · required ${day(order.needed_by)}` : ''}{order.assignee ? ` · ${order.assignee}` : ''}</span>
            </button>
            <label className="aob-move"><span>Move</span><select value={order.status} onChange={e => void move(order, e.target.value as OrderStatus)} aria-label={`Move ${order.number} to`}>
              {STAGES.map(s => <option key={s.status} value={s.status}>{s.label}</option>)}<option value="cancelled">Cancelled</option></select></label>
          </article>)}
          {stage.orders.length === 0 && <p className="aob-empty">No orders here.</p>}
        </div>
      </div>)}
    </div>}
    {board && view === 'completed' && board.cancelled.length > 0 && <p className="aob-hint">Cancelled: {board.cancelled.map(o => o.number).join(', ')}</p>}
    {pending && <GateDialog pending={pending} onCancel={() => { setPending(null); load(); }} onConfirm={c => void move(pending.order, pending.status, c)} />}
    {openId !== null && <OrderPanel id={openId} onClose={() => { setOpenId(null); load(); }} onNotice={onNotice} />}
  </section>;
}

function moveLocally(board: Board, order: BoardOrder, status: OrderStatus): Board {
  const moved = { ...order, status };
  return { ...board, stages: board.stages.map(s => ({ ...s, orders: s.status === status ? [moved, ...s.orders.filter(o => o.id !== order.id)] : s.orders.filter(o => o.id !== order.id) })) };
}

/** Moving into Production without approval or full payment: say why, and confirm (a reason for unpaid orders). */
function GateDialog({ pending, onCancel, onConfirm }: { pending: Pending; onCancel: () => void; onConfirm: (c: { approval: boolean; unpaid: boolean; reason: string }) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  const unpaid = pending.problems.some(p => p.code === 'payment_missing');
  const label = STAGES.find(s => s.status === pending.status)?.label ?? pending.status;
  return <dialog ref={ref} className="modal compact-modal admin-modal aob-gate" onCancel={onCancel} aria-labelledby="aob-gate-title">
    <h2 id="aob-gate-title">Move {pending.order.number} to {label}?</h2>
    <ul>{pending.problems.map(p => <li key={p.code}><strong>{p.code === 'payment_missing' ? 'Payment' : 'Approval'}</strong> {p.message}</li>)}</ul>
    {unpaid && <label className="field">Reason for moving it before full payment (kept in the order’s history)<textarea rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. School pays on account" /></label>}
    <div className="project-actions">
      <button type="button" className="button button-secondary" onClick={onCancel}>Keep it where it is</button>
      <button type="button" className="button button-gradient" disabled={unpaid && reason.trim().length < 3}
        onClick={() => onConfirm({ approval: pending.problems.some(p => p.code === 'approval_missing'), unpaid, reason: reason.trim() })}>Move anyway</button>
    </div>
  </dialog>;
}

const FILE_KINDS: [FileKind, string][] = [['proof', 'Design proof'], ['artwork', 'Artwork'], ['photo', 'Photo'], ['invoice', 'Invoice'], ['order_form', 'Order form'], ['other', 'Other']];

/** One order for staff: updates, files and proofs, approval, tracking, assignment and dates, and the history. */
function OrderPanel({ id, onClose, onNotice }: { id: number; onClose: () => void; onNotice: (text: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [visibility, setVisibility] = useState<'customer' | 'internal'>('customer');
  const [tracking, setTracking] = useState({ carrier: '', tracking_number: '', tracking_url: '' });
  const [fileKind, setFileKind] = useState<FileKind>('proof');
  const [fileVisibility, setFileVisibility] = useState<'customer' | 'internal'>('customer');
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => { ref.current?.showModal(); orderApi.staff().then(setStaff).catch(() => {}); }, []);
  const load = useCallback(() => {
    orderApi.adminOrder(id).then(o => { setOrder(o); setTracking({ carrier: o.carrier ?? '', tracking_number: o.tracking_number ?? '', tracking_url: o.tracking_url ?? '' }); }).catch(e => setError((e as Error).message));
  }, [id]);
  useEffect(load, [load]);

  async function save(body: Parameters<typeof orderApi.postUpdate>[1], done: string) {
    setSaving(true); setError('');
    try { setOrder(await orderApi.postUpdate(id, body)); onNotice(done); return true; }
    catch (e) { setError((e as Error).message); return false; } finally { setSaving(false); }
  }
  async function upload(file: File) {
    setError(''); setProgress(0);
    try {
      setOrder(await uploadAdminFile(id, file, fileKind, fileVisibility, message.trim() || undefined, setProgress));
      onNotice(fileKind === 'proof' && fileVisibility === 'customer' ? 'Proof added: the customer is asked to approve it.' : 'File added.');
      if (fileKind === 'proof') setMessage('');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'The upload failed.'); } finally { setProgress(null); }
  }
  const steps = order ? (order.status === 'confirmed' ? [] : (STAGE_STEPS[order.status] ?? [])) : [];

  return <dialog ref={ref} className="modal compact-modal admin-modal wide aob-panel" onCancel={onClose} aria-labelledby="aob-panel-title">
    <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X /></button>
    {!order ? <div className="empty-state">{error ? <p className="error-message">{error}</p> : <LoaderCircle className="spin" />}</div> : <>
      <span className="eyebrow">{order.stage_label} · {order.sub_status.label}</span>
      <h2 id="aob-panel-title">{order.number} · {order.name}</h2>
      <p className="muted">{order.customer?.name ?? order.user?.name} ({order.customer?.email ?? order.user?.email}) · {order.contact_name}{order.phone ? ` · ${order.phone}` : ''}{order.contact_email ? ` · ${order.contact_email}` : ''} · placed {when(order.submitted_at)}</p>
      <div className="project-actions"><Link className="button button-outline" to={`/admin/orders/${order.id}`}><Eye size={15} /> Full order page</Link>
        {order.payment?.pdf && <span className={`aob-pill tone-${order.payment.tone}`}>{order.payment.label}{order.payment.amount_due ? ` · ${order.payment.currency} ${order.payment.amount_due} due` : ''}</span>}
        {!order.payment && <span className="aob-pill tone-grey">No invoice yet</span>}</div>
      {error && <p className="error-message" role="alert">{error}</p>}

      <div className="aob-grid">
        <section><h3>Garments and sizes</h3>
          {order.items.length ? <ul className="aob-list">{order.items.map((item, i) => <li key={i}><strong>{item.name}</strong>{item.fit ? ` · ${item.fit}` : ''}{item.project_name ? ` · design “${item.project_name}”` : ''}<small>{Object.entries(item.sizes).map(([s, n]) => `${s} ${n}`).join(' · ')} = {item.quantity}{item.players?.length ? ` · ${item.players.length} names/numbers` : ''}</small></li>)}</ul>
            : <p className="muted">{order.quantity ? Object.entries(order.sizes).map(([s, n]) => `${s} ${n}`).join(' · ') : 'Sizes are in the uploaded order form.'}</p>}
          {order.notes && <p className="aob-notes">“{order.notes}”</p>}
          {order.needed_by && <p className="muted" data-testid="aob-date-required">Date required: <strong>{new Date(`${order.needed_by}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</strong></p>}
          {order.shipping_address && <p className="muted kit-pre" data-testid="aob-delivery"><strong>Delivery address</strong><br />{order.shipping_address}</p>}
        </section>
        <section><h3>Stage and staff</h3>
          {steps.length > 0 && <label className="field">Sub-status<select value={order.step ?? steps[0][0]} disabled={saving} onChange={e => void save({ step: e.target.value }, 'Sub-status updated.')}>{steps.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
          <label className="field">Assigned to<select value={order.assigned_to ?? ''} disabled={saving} onChange={e => void save({ assigned_to: e.target.value ? Number(e.target.value) : null }, 'Assignment saved.')}><option value="">Nobody</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="field">Due date (staff only)<input type="date" value={order.due_date ?? ''} disabled={saving} onChange={e => void save({ due_date: e.target.value || null }, 'Due date saved.')} /></label>
          <p className="muted">Design approval: <strong>{({ waiting: 'Design in progress', review: 'Waiting for the customer', approved: 'Approved', changes: 'Changes requested' } as Record<string, string>)[order.approval ?? ''] ?? 'Not tracked'}</strong></p>
          {order.approval !== 'review' && order.proof && <button type="button" className="button button-outline" disabled={saving} onClick={() => void save({ approval: 'review' }, 'Approval requested.')}>Ask to approve proof v{order.proof.version} again</button>}
        </section>
      </div>

      <section className="aob-block"><h3>Post an update</h3>
        <textarea rows={2} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} placeholder={visibility === 'customer' ? 'Message for the customer, e.g. “Sewing has started.”' : 'A note for the team only'} aria-label="Update" />
        <div className="aob-row">
          <div className="aob-views" role="group" aria-label="Who sees it">
            <button type="button" className={visibility === 'customer' ? 'on' : ''} aria-pressed={visibility === 'customer'} onClick={() => setVisibility('customer')}><Eye size={14} /> Customer-visible</button>
            <button type="button" className={visibility === 'internal' ? 'on' : ''} aria-pressed={visibility === 'internal'} onClick={() => setVisibility('internal')}><Lock size={14} /> Internal only</button>
          </div>
          <button type="button" className="button button-gradient" disabled={saving || !message.trim()} onClick={async () => { if (await save({ message: message.trim(), visibility }, visibility === 'customer' ? 'Update posted to the customer.' : 'Internal note added.')) setMessage(''); }}><Send size={15} /> Post</button>
        </div>
      </section>

      {/* An uploaded order form as 3DEEZI AI read it, with the original file one click away. */}
      <OrderFormReading files={order.files} onError={setError} />
      <section className="aob-block"><h3>Files and design proofs</h3>
        <div className="aob-row">
          <select value={fileKind} onChange={e => setFileKind(e.target.value as FileKind)} aria-label="Kind of file">{FILE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select value={fileVisibility} onChange={e => setFileVisibility(e.target.value as 'customer' | 'internal')} aria-label="Who sees the file"><option value="customer">Customer-visible</option><option value="internal">Internal only</option></select>
          <label className="button button-outline aob-file"><Upload size={15} /> {fileKind === 'proof' && fileVisibility === 'customer' ? 'Upload proof and request approval' : 'Upload file'}<input type="file" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} /></label>
        </div>
        {progress !== null && <div className="aob-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress * 100}%` }} /></div>}
        <ul className="aob-files">{order.files.map(f => <li key={f.id}>{f.thumb ? <img src={f.thumb} alt="" /> : <Paperclip size={18} />}
          <span><strong>{f.name}</strong><small>{FILE_KINDS.find(([k]) => k === f.kind)?.[1] ?? f.kind}{f.version ? ` v${f.version}` : ''}{f.review_status ? ` · ${f.review_status}` : ''}</small></span>
          <em className={f.visibility === 'internal' ? 'is-internal' : ''}>{f.visibility === 'internal' ? <><EyeOff size={12} /> Internal only</> : <><Eye size={12} /> Customer-visible</>}</em>
          <button type="button" className="icon-button" onClick={() => void orderApi.download(f).catch(e => setError((e as Error).message))} aria-label={`Download ${f.name}`}><Download size={15} /></button></li>)}
          {order.files.length === 0 && <li className="muted">No files yet.</li>}</ul>
      </section>

      <section className="aob-block"><h3><Truck size={16} /> Delivery tracking</h3>
        <div className="aob-row aob-track">
          <input value={tracking.carrier} onChange={e => setTracking({ ...tracking, carrier: e.target.value })} placeholder="Courier" aria-label="Courier" maxLength={80} />
          <input value={tracking.tracking_number} onChange={e => setTracking({ ...tracking, tracking_number: e.target.value })} placeholder="Tracking number" aria-label="Tracking number" maxLength={80} />
          <input value={tracking.tracking_url} onChange={e => setTracking({ ...tracking, tracking_url: e.target.value })} placeholder="https:// tracking link" aria-label="Tracking link" maxLength={500} />
          <button type="button" className="button button-outline" disabled={saving} onClick={() => void save({ carrier: tracking.carrier || null, tracking_number: tracking.tracking_number || null, tracking_url: tracking.tracking_url || null }, 'Tracking saved.')}>Save tracking</button>
        </div>
      </section>

      <section className="aob-block"><h3>History</h3>
        <ol className="aob-history">{order.updates.map(u => <li key={u.id} className={u.visibility === 'internal' ? 'is-internal' : ''}>
          <span className="aob-when">{when(u.created_at)}</span>
          <span><strong>{u.text}</strong>{u.message && u.message !== u.text && <q>{u.message}</q>}<small>{u.user?.name ?? (u.author === 'system' ? '3DEEZI' : u.author)} · {u.visibility === 'internal' ? 'Internal only' : 'Customer-visible'}</small></span>
        </li>)}</ol>
      </section>
      <BillingSlot orderId={order.id} onNotice={onNotice} onChange={load} />
      <p className="muted"><ExternalLink size={13} /> All invoices and prices: Admin › Invoices and Admin › Pricing.</p>
    </>}
  </dialog>;
}

/** The payments feature's invoice panel (pages/AdminPricing.tsx), loaded with the order view. */
function BillingSlot(props: { orderId: number; onNotice: (text: string) => void; onChange: () => void }) {
  const [Panel, setPanel] = useState<null | typeof import('./AdminPricing').AdminOrderBilling>(null);
  useEffect(() => { void import('./AdminPricing').then(m => setPanel(() => m.AdminOrderBilling)); }, []);
  return Panel ? <Panel {...props} /> : null;
}

/** The sub-statuses staff choose in each stage (Design & Approval follows the approval). */
const STAGE_STEPS: Partial<Record<OrderStatus, [string, string][]>> = {
  pending: [['received', 'Order received'], ['reviewing', 'Checking the order']],
  in_production: [['in_production', 'In production'], ['printing', 'Printing'], ['cutting', 'Cutting'], ['sewing', 'Sewing'], ['quality_check', 'Quality check'], ['packing', 'Packing']],
  shipped: [['in_transit', 'In transit'], ['out_for_delivery', 'Out for delivery']],
};
