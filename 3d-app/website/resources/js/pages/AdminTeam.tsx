import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Palette, Columns3, Download, FileText, Gift, List, LoaderCircle, Lock, MessageSquare, Paperclip, ReceiptText, RefreshCw, Search, Send, SlidersHorizontal, Upload, UserCheck } from 'lucide-react';
import { api, fetchFile, saveBlob } from '../api';
import '../../css/admin-team.css';

/**
 * Admin > 3DEEZI TEAM, and the designer view (/designer): design requests by status (board and list), one request
 * (brief, customer files, deliveries by version, the conversation with internal notes, assignment, status, history),
 * and the plans and allowances (admins). API: team-api.md section 4. Designers only get the requests assigned to them.
 */

type Mode = 'admin' | 'designer';
interface TeamFile { id: number; kind: string; name: string; extension: string; size: number; is_image: boolean; thumb: string | null; version: number | null; visibility: string; url: string; uploaded_by: { id: number; name: string; role: string } | null; created_at: string }
interface Message { id: number; body: string | null; role: string; author: { id: number; name: string } | null; internal: boolean; files: TeamFile[]; created_at: string }
interface HistoryRow { id: number; kind: string; from: string | null; to: string | null; text: string | null; by: string | null; role: string; internal: boolean; at: string }
interface InvoiceSummary { invoice_number: string | null; label: string; total: string | null; amount_due: string | null; currency: string; status: string }
interface Summary {
  id: number; number: string; status: string; status_label: string; name: string; email: string; sport_name: string; garment_name: string; category: string | null;
  description: string; colours: string[]; instructions: string | null; billing: string; plan: string; price: string; currency: string; invoice: InvoiceSummary | null;
  designer: { id: number; name: string } | null; revisions_used: number; revisions_allowed: number; due_date: string | null; latest_version: number; unread: number;
  created_at: string; status_changed_at: string | null; customer?: { id: number; name: string; email: string } | null; priority?: string; internal_notes_count?: number; files_count?: number;
  /** Client answers 2026-10-21: extra revision rounds, a round waiting for payment, the refund mark. */
  extra_revisions?: number;
  /** The client's new /team form (2026-10-22): "Garments needed" (the first is the garment) and the "Preferred delivery date". */
  garments?: string[]; garment_names?: string[]; preferred_date?: string | null; pending_revision?: { invoice: InvoiceSummary | null } | null; refund_status?: 'due' | 'refunded' | null; refunded_at?: string | null;
}
interface Detail extends Summary {
  files: TeamFile[]; deliveries: { version: number; created_at: string; note: string | null; files: TeamFile[] }[]; messages: Message[]; history: HistoryRow[];
  final: { version: number; assets: { id: number; name: string }[] } | null;
  allowance: { plan_name: string; used_this_month: number; included_per_month: number; remaining_included: number | null; unlimited: boolean; open_requests: number } | null;
}
interface Designer { id: number; name: string; email: string; is_admin: boolean; is_designer: boolean; designer_all: boolean; open: number; is_me?: boolean }
interface Plan { id: string; name: string; included_per_month: number; price: string; revisions: number; max_open: number }
interface AllowanceSettings { plans: Record<string, Plan>; pay_first: boolean; default_designer_id: number | null; extra_revision_price: string; first_draft_days: number; revision_days: number; customers: AllowanceRow[] }
interface AllowanceRow { user: { id: number; name: string; email: string }; plan: string; monthly_included: number | null; bonus_requests: number; unlimited: boolean; note: string | null; used_this_month: number; included_per_month: number; open_requests: number; next_billing: string }

export const TEAM_STATUSES: [string, string][] = [['awaiting_payment', 'Awaiting payment'], ['received', 'Request received'], ['assigned', 'Designer assigned'], ['in_progress', 'Design in progress'], ['review', 'Ready for review'], ['revision', 'Revisions requested'], ['approved', 'Final: approved'], ['closed', 'Closed']];
const PILL: Record<string, string> = { awaiting_payment: 'pending', received: 'pending', assigned: 'confirmed', in_progress: 'in_production', review: 'shipped', revision: 'pending', approved: 'delivered', closed: 'cancelled' };
const label = (s: string) => TEAM_STATUSES.find(([id]) => id === s)?.[1] ?? s;
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
const kb = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const Pill = ({ status }: { status: string }) => <span className={`status-pill s-${PILL[status] ?? 'pending'}`}>{label(status)}</span>;
const billingText = (r: Summary) => r.billing === 'paid' ? `Paid request · ${r.currency} ${r.price} incl. GST${r.invoice ? ` · ${r.invoice.invoice_number} ${r.invoice.label}` : ''}` : r.billing === 'free' ? 'No charge' : `Included (${r.plan})`;
/** "Jersey, Shorts": every garment asked for (older requests: the one garment). */
const garmentsOf = (r: Summary) => r.garment_names?.length ? r.garment_names.join(', ') : r.garment_name;
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const RefundChip = ({ r }: { r: Summary }) => r.refund_status ? <em className={`atm-refund${r.refund_status === 'refunded' ? ' done' : ''}`}>{r.refund_status === 'due' ? 'REFUND DUE' : 'REFUNDED'}</em> : null;
/** "Assigned to me" on the board and list: the owner who is also the designer. */
const MINE_KEY = 'atm.mine';
const loadMine = () => { try { return sessionStorage.getItem(MINE_KEY) === '1'; } catch { return false; } };
const saveMine = (on: boolean) => { try { sessionStorage.setItem(MINE_KEY, on ? '1' : '0'); } catch { /* private mode */ } };

export default function AdminTeam({ mode, itemId, onNotice, myId }: { mode: Mode; itemId?: string; onNotice: (text: string) => void; myId?: number }) {
  const base = mode === 'admin' ? '/admin/team' : '/designer';
  const [tab, setTab] = useState<'board' | 'list' | 'allowances'>(() => { try { return (sessionStorage.getItem('atm.tab') as 'board' | 'list') || 'board'; } catch { return 'board'; } });
  useEffect(() => { try { if (tab !== 'allowances') sessionStorage.setItem('atm.tab', tab); } catch { /* private mode */ } }, [tab]);
  if (itemId && /^\d+$/.test(itemId)) return <RequestDetail key={itemId} id={Number(itemId)} mode={mode} base={base} onNotice={onNotice} myId={myId} />;
  return <div className="atm">
    <div className="atm-tabs" role="tablist" aria-label="3DEEZI TEAM views">
      <button role="tab" aria-selected={tab === 'board'} className={tab === 'board' ? 'on' : ''} onClick={() => setTab('board')}><Columns3 size={15} /> Board</button>
      <button role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}><List size={15} /> List</button>
      {mode === 'admin' && <button role="tab" aria-selected={tab === 'allowances'} className={tab === 'allowances' ? 'on' : ''} onClick={() => setTab('allowances')}><SlidersHorizontal size={15} /> Plans &amp; allowances</button>}
    </div>
    {tab === 'board' ? <Board base={base} mode={mode} /> : tab === 'list' ? <RequestList base={base} mode={mode} /> : <Allowances onNotice={onNotice} />}
  </div>;
}

function Card({ r, base }: { r: Summary; base: string }) {
  return <Link to={`${base}/${r.id}`} className="atm-card" aria-label={`Open ${r.number} ${r.name}`}>
    <span className="atm-card-top"><strong>{r.number}</strong>{r.unread > 0 && <em className="atm-unread" title="Unread customer messages">{r.unread}</em>}{r.priority === 'high' && <em className="atm-high">HIGH</em>}<RefundChip r={r} />{r.pending_revision && <em className="atm-high" title="Extra revision waiting for payment">EXTRA · UNPAID</em>}</span>
    <span className="atm-card-name">{r.name}</span>
    <small>{garmentsOf(r)} · {r.sport_name}</small>
    <small className="muted">{r.designer ? <><UserCheck size={12} /> {r.designer.name}</> : 'Unassigned'}{r.due_date ? ` · due ${r.due_date}` : ''}{r.preferred_date ? ` · wanted by ${day(r.preferred_date)}` : ''}</small>
  </Link>;
}

function Board({ base, mode }: { base: string; mode: Mode }) {
  const [columns, setColumns] = useState<{ status: string; label: string; requests: Summary[] }[] | null>(null);
  const [error, setError] = useState('');
  const [mine, setMine] = useState(() => mode === 'admin' && loadMine());
  const load = useCallback(() => { api<{ columns: { status: string; label: string; requests: Summary[] }[] }>(`/team-admin/board${mine ? '?mine=1' : ''}`).then(d => { setColumns(d.columns); setError(''); }).catch(e => setError(e.message)); }, [mine]);
  useEffect(load, [load]);
  if (error) return <p className="error-message">{error}</p>;
  if (!columns) return <div className="empty-state"><LoaderCircle className="spin" /> Loading…</div>;
  const total = columns.reduce((n, c) => n + c.requests.length, 0);
  return <section className="glow-panel admin-card">
    <div className="admin-toolbar"><h2><Columns3 size={18} /> {mode === 'admin' ? 'All design requests' : 'My design requests'} <small>{total}</small></h2>{mode === 'admin' && <label className="atm-check"><input type="checkbox" checked={mine} onChange={e => { setMine(e.target.checked); saveMine(e.target.checked); }} /> Assigned to me</label>}<button className="button button-outline" onClick={load}><RefreshCw size={15} /> Refresh</button></div>
    {total === 0 && <p className="muted">{mine ? 'Nothing is assigned to you right now.' : mode === 'admin' ? 'No design requests yet. Customers send them from the 3DEEZI TEAM page.' : 'No requests are assigned to you yet.'}</p>}
    <div className="atm-columns">{columns.map(c => <div key={c.status} className={`atm-col atm-col-${c.status}`}>
      <h3><Pill status={c.status} /> <b>{c.requests.length}</b></h3>
      {c.requests.map(r => <Card key={r.id} r={r} base={base} />)}
    </div>)}</div>
  </section>;
}

function RequestList({ base, mode }: { base: string; mode: Mode }) {
  const [mine, setMine] = useState(() => mode === 'admin' && loadMine());
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [outstanding, setOutstanding] = useState(true);
  const [rows, setRows] = useState<Summary[] | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams({ ...(status ? { status } : {}), ...(query ? { search: query } : {}), ...(outstanding ? { outstanding: '1' } : {}), ...(mine ? { mine: '1' } : {}) });
    api<Summary[]>(`/team-admin/requests?${params}`).then(r => { setRows(r); setError(''); }).catch(e => setError(e.message));
  }, [status, query, outstanding, mine]);
  return <section className="glow-panel admin-card">
    <div className="admin-toolbar"><h2><List size={18} /> Requests {rows && <small>{rows.length}</small>}</h2>
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="TEAM-…, name or email" aria-label="Search requests" /></form>
      <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{TEAM_STATUSES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
      <label className="atm-check"><input type="checkbox" checked={outstanding} onChange={e => setOutstanding(e.target.checked)} /> Outstanding only</label>
      {mode === 'admin' && <label className="atm-check"><input type="checkbox" checked={mine} onChange={e => { setMine(e.target.checked); saveMine(e.target.checked); }} /> Assigned to me</label>}</div>
    {error && <p className="error-message">{error}</p>}
    {!rows ? <div className="empty-state"><LoaderCircle className="spin" /></div> : <div className="table-wrap"><table className="admin-table"><thead><tr><th>Request</th><th>Customer</th><th>Garment</th><th>Designer</th><th>Status</th><th>Billing</th><th>Updated</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.id} className="atm-row" onClick={() => navigate(`${base}/${r.id}`)}>
        <td><Link to={`${base}/${r.id}`} onClick={e => e.stopPropagation()}><strong>{r.number}</strong></Link>{r.unread > 0 && <em className="atm-unread">{r.unread}</em>}<small className="cell-sub">{r.name}</small></td>
        <td>{r.customer?.name ?? '—'}<small className="cell-sub">{r.customer?.email}</small></td>
        <td>{garmentsOf(r)}<small className="cell-sub">{r.sport_name}{r.preferred_date ? ` · wanted by ${day(r.preferred_date)}` : ''}</small></td>
        <td>{r.designer?.name ?? <span className="muted">Unassigned</span>}</td>
        <td><Pill status={r.status} /> <RefundChip r={r} /></td>
        <td><small>{billingText(r)}</small></td>
        <td>{when(r.status_changed_at ?? r.created_at)}</td>
      </tr>)}
      {!rows.length && <tr><td colSpan={7} className="muted">No requests match.</td></tr>}
    </tbody></table></div>}
  </section>;
}

function FileTile({ f }: { f: TeamFile }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try { saveBlob(await fetchFile(f.url.replace(/^\/api\/v1/, '')), f.name); } catch (e) { window.alert((e as Error).message); } finally { setBusy(false); }
  }
  return <button type="button" className={`atm-file${f.visibility === 'internal' ? ' internal' : ''}`} onClick={download} title={`Download ${f.name}`}>
    {f.thumb ? <img src={f.thumb} alt="" /> : <span className="atm-file-icon"><FileText size={22} /><b>{f.extension.toUpperCase()}</b></span>}
    <span className="atm-file-name">{f.name}</span>
    <small>{f.kind}{f.visibility === 'internal' ? ' · staff only' : ''} · {kb(f.size)}</small>
    {busy ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}
  </button>;
}

function RequestDetail({ id, mode, base, onNotice, myId }: { id: number; mode: Mode; base: string; onNotice: (text: string) => void; myId?: number }) {
  const [r, setR] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => { api<Detail>(`/team-admin/requests/${id}`).then(d => { setR(d); setError(''); }).catch(e => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  useEffect(() => { if (mode === 'admin') api<Designer[]>('/team-admin/designers').then(setDesigners).catch(() => {}); }, [mode]);

  async function run(key: string, task: () => Promise<Detail | unknown>, done?: string) {
    setBusy(key);
    try { const next = await task(); if (next && typeof next === 'object' && 'number' in (next as Detail)) setR(next as Detail); else load(); if (done) onNotice(done); }
    catch (e) { onNotice((e as Error).message); }
    finally { setBusy(''); }
  }
  if (error) return <div className="atm"><Link to={base} className="button button-outline"><ArrowLeft size={15} /> All requests</Link><p className="error-message">{error}</p></div>;
  if (!r) return <div className="empty-state"><LoaderCircle className="spin" /> Loading…</div>;
  const finished = r.status === 'approved' || r.status === 'closed';
  const setStatus = (status: string, force = false) => {
    if (status === 'closed' && !window.confirm(`Close ${r.number}? The customer is told.`)) return;
    if (status === 'approved' && !window.confirm(`Approve version ${r.latest_version} for the customer? It is saved to their account.`)) return;
    void run('status', () => api<Detail>(`/team-admin/requests/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, force }) }), `${r.number}: ${label(status)}.`);
  };
  const statusOptions = mode === 'admin' ? TEAM_STATUSES.map(([s]) => s) : ['in_progress', 'review'];
  const me = designers.find(d => d.is_admin && (d.is_me || d.id === myId));
  const setRefund = (state: 'due' | 'refunded' | null) => {
    if (state === 'refunded' && !window.confirm(`Have you refunded ${r.number} in full in Airwallex or Stripe? This records the refund on the invoice; it does not send money.`)) return;
    void run('refund', () => api<Detail>(`/team-admin/requests/${id}/refund`, { method: 'PATCH', body: JSON.stringify({ refund_status: state }) }), state === 'refunded' ? 'Refund recorded.' : state === 'due' ? 'Marked: refund due.' : 'Refund mark cleared.');
  };

  return <div className="atm atm-detail">
    <div className="atm-detail-head">
      <Link to={base} className="button button-outline"><ArrowLeft size={15} /> All requests</Link>
      <h2>{r.number} <span>{r.name}</span></h2><Pill status={r.status} /><RefundChip r={r} />
      <button className="icon-button" onClick={load} aria-label="Refresh"><RefreshCw size={16} /></button>
    </div>
    {mode === 'admin' && r.refund_status === 'due' && <div className="atm-refund-bar" role="status"><ReceiptText size={18} /><span><b>Refund due</b> · {r.invoice?.invoice_number ? `invoice ${r.invoice.invoice_number}, ${r.currency} ${r.invoice.total ?? r.price}` : `${r.currency} ${r.price}`}. Refund it by hand in Airwallex or Stripe, then tick Refunded.</span><label className="atm-check"><input type="checkbox" checked={false} disabled={busy === 'refund'} onChange={() => setRefund('refunded')} /> Refunded</label></div>}
    {r.refund_status === 'refunded' && <p className="atm-refund-done"><ReceiptText size={15} /> Refunded{r.refunded_at ? ` ${when(r.refunded_at)}` : ''}.</p>}
    {r.pending_revision && <p className="atm-refund-done is-wait"><RefreshCw size={15} /> Extra revision requested: waiting for invoice {r.pending_revision.invoice?.invoice_number ?? ''} to be paid.</p>}
    <div className="atm-grid">
      <div className="atm-main">
        <section className="glow-panel admin-card"><h3>Brief</h3>
          <dl className="atm-kv"><dt>Customer</dt><dd>{r.customer?.name ?? r.name} · <a href={`mailto:${r.email}?subject=${encodeURIComponent(`${r.number}: your 3DEEZI design`)}`}>{r.email}</a></dd>
            <dt>Company / team</dt><dd>{r.name}</dd>
            <dt>Garments needed</dt><dd data-testid="atm-garments">{garmentsOf(r)} · {r.sport_name}{r.category ? ` · ${r.category}` : ''}</dd>
            <dt>Preferred delivery date</dt><dd data-testid="atm-preferred">{r.preferred_date ? day(r.preferred_date) : <span className="muted">Not given</span>}</dd>
            <dt>Colours</dt><dd>{r.colours.length ? <span className="atm-swatches">{r.colours.map(c => <span key={c}><i style={{ background: /^#[0-9a-f]{3,8}$/i.test(c) || /^[a-z]+$/i.test(c) ? c : 'transparent' }} />{c}</span>)}</span> : <span className="muted">Not given</span>}</dd>
            <dt>Sent</dt><dd>{when(r.created_at)}</dd></dl>
          <p className="atm-text">{r.description}</p>
          {r.instructions && <><h4>Additional instructions</h4><p className="atm-text">{r.instructions}</p></>}
          <h4>Logos, references and attachments ({r.files.length})</h4>
          {r.files.length ? <div className="atm-files">{r.files.map(f => <FileTile key={f.id} f={f} />)}</div> : <p className="muted">No files.</p>}
        </section>

        <section className="glow-panel admin-card"><h3>Designs sent to the customer</h3>
          {r.deliveries.length ? r.deliveries.map(d => <div key={d.version} className="atm-version"><h4>Version {d.version}{r.final?.version === d.version && <span className="status-pill s-delivered">Approved</span>} <small className="muted">{when(d.created_at)}</small></h4>
            {d.note && <p className="atm-text">{d.note}</p>}<div className="atm-files">{d.files.map(f => <FileTile key={f.id} f={f} />)}</div></div>) : <p className="muted">Nothing delivered yet.</p>}
          {!finished && r.status !== 'awaiting_payment' && <DeliveryForm id={id} next={r.latest_version + 1} onDone={next => { setR(next); onNotice(`Version ${next.latest_version} uploaded${next.status === 'review' ? ' and sent to the customer for review' : ''}.`); }} onError={onNotice} />}
        </section>

        <Conversation r={r} id={id} onSent={load} onError={onNotice} />
      </div>

      <aside className="atm-side">
        <section className="glow-panel admin-card"><h3>Workflow</h3>
          {mode === 'admin' && <label className="field">Designer
            <select className="admin-select" value={r.designer?.id ?? ''} disabled={finished || busy === 'assign'} onChange={e => run('assign', () => api<Detail>(`/team-admin/requests/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ designer_id: e.target.value ? Number(e.target.value) : null }) }), 'Designer updated.')}>
              <option value="">Unassigned</option>{designers.map(d => <option key={d.id} value={d.id}>{d.name}{d.is_designer ? '' : ' (admin)'} · {d.open} open</option>)}</select></label>}
          {mode === 'admin' && me && !finished && r.designer?.id !== me.id && <button className="button button-outline full-width" disabled={busy === 'assign'} onClick={() => run('assign', () => api<Detail>(`/team-admin/requests/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ designer_id: me.id }) }), 'Assigned to you.')}><UserCheck size={15} /> Assign to me</button>}
          {mode === 'designer' && <p><UserCheck size={14} /> {r.designer ? `Assigned to ${r.designer.name}` : 'Unassigned'}</p>}
          <label className="field">Status
            <select className="admin-select" value={r.status} disabled={busy === 'status' || (finished && mode !== 'admin')} onChange={e => setStatus(e.target.value)}>
              {!statusOptions.includes(r.status) && <option value={r.status}>{label(r.status)}</option>}
              {statusOptions.map(s => <option key={s} value={s}>{label(s)}</option>)}</select></label>
          {r.status === 'awaiting_payment' && mode === 'admin' && <button className="button button-outline full-width" onClick={() => window.confirm('Start work before the invoice is paid?') && run('status', () => api<Detail>(`/team-admin/requests/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'received', force: true }) }), 'Started before payment.')}>Start before payment</button>}
          {r.status === 'review' && <p className="muted">Waiting for the customer to approve, ask for revisions or message.</p>}
          {mode === 'admin' && !finished && r.status !== 'awaiting_payment' && <button className="button button-outline full-width" disabled={busy === 'free'} title={r.pending_revision ? 'Start the waiting extra revision now, without payment (its invoice is cancelled)' : 'Give the customer one more revision, free'} onClick={() => window.confirm(r.pending_revision ? 'Start the extra revision free? Its invoice is cancelled.' : 'Give the customer one more revision, free?') && run('free', () => api<Detail>(`/team-admin/requests/${id}/free-revision`, { method: 'POST' }), 'Free revision given.')}><Gift size={15} /> {r.pending_revision ? 'Waive the extra revision fee' : 'Free revision'}</button>}
          {mode === 'admin' && !r.refund_status && r.billing === 'paid' && (r.invoice?.status === 'paid' || r.invoice?.status === 'part_paid') && <button className="button button-quiet full-width" disabled={busy === 'refund'} onClick={() => window.confirm('Mark a full refund as due (3DEEZI could not deliver as promised)?') && setRefund('due')}><ReceiptText size={15} /> Mark refund due</button>}
          {mode === 'admin' && r.refund_status && <button className="button button-quiet full-width" disabled={busy === 'refund'} onClick={() => window.confirm('Clear the refund mark?') && setRefund(null)}>Clear refund mark</button>}
          <dl className="atm-kv small"><dt>Revisions</dt><dd>{r.revisions_used} of {r.revisions_allowed} used{r.extra_revisions ? ` (${r.extra_revisions} extra)` : ''}</dd><dt>Billing</dt><dd>{billingText(r)}</dd>{r.due_date && <><dt>Due</dt><dd>{r.due_date}</dd></>}</dl>
          {mode === 'admin' && <AdminDetails r={r} id={id} onSaved={next => { setR(next); onNotice('Saved.'); }} onError={onNotice} />}
        </section>
        {r.allowance && mode === 'admin' && <section className="glow-panel admin-card"><h3>Customer's allowance</h3>
          <dl className="atm-kv small"><dt>Plan</dt><dd>{r.allowance.plan_name}{r.allowance.unlimited ? ' · unlimited' : ''}</dd><dt>This month</dt><dd>{r.allowance.used_this_month} of {r.allowance.included_per_month} included used</dd><dt>Open requests</dt><dd>{r.allowance.open_requests}</dd></dl></section>}
        <section className="glow-panel admin-card"><h3>History</h3>
          <ol className="atm-history">{r.history.slice().reverse().map(h => <li key={h.id} className={h.internal ? 'internal' : ''}><b>{h.to ? label(h.to) : h.kind}</b>{h.text && h.text !== label(h.to ?? '') && <span>{h.text}</span>}<small>{h.by ?? 'System'} · {when(h.at)}{h.internal ? ' · staff only' : ''}</small></li>)}</ol>
        </section>
      </aside>
    </div>
  </div>;
}

function AdminDetails({ r, id, onSaved, onError }: { r: Detail; id: number; onSaved: (d: Detail) => void; onError: (t: string) => void }) {
  const [due, setDue] = useState(r.due_date ?? '');
  const [revisions, setRevisions] = useState(r.revisions_allowed);
  const [priority, setPriority] = useState(r.priority ?? 'normal');
  const [busy, setBusy] = useState(false);
  const dirty = due !== (r.due_date ?? '') || revisions !== r.revisions_allowed || priority !== (r.priority ?? 'normal');
  async function save() {
    setBusy(true);
    try { onSaved(await api<Detail>(`/team-admin/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ due_date: due || null, revisions_allowed: revisions, priority }) })); }
    catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="atm-admin-details">
    <label className="field">Due date<input type="date" value={due} onChange={e => setDue(e.target.value)} /></label>
    <label className="field">Revisions allowed<input type="number" min={0} max={50} value={revisions} onChange={e => setRevisions(Number(e.target.value))} /></label>
    <label className="field">Priority<select className="admin-select" value={priority} onChange={e => setPriority(e.target.value)}><option value="normal">Normal</option><option value="high">High</option></select></label>
    <button className="button button-outline full-width" disabled={!dirty || busy} onClick={save}>{busy && <LoaderCircle className="spin" size={14} />} Save details</button>
  </div>;
}

function DeliveryForm({ id, next, onDone, onError }: { id: number; next: number; onDone: (d: Detail) => void; onError: (t: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState('artwork');
  const [note, setNote] = useState('');
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) { input.current?.click(); return; }
    const body = new FormData();
    files.forEach(f => body.append('files[]', f));
    body.append('kind', kind); if (note.trim()) body.append('note', note.trim()); body.append('send', send ? '1' : '0');
    setBusy(true);
    try { onDone(await api<Detail>(`/team-admin/requests/${id}/deliveries`, { method: 'POST', body })); setFiles([]); setNote(''); if (input.current) input.current.value = ''; }
    catch (err) { onError((err as Error).message); } finally { setBusy(false); }
  }
  return <form className="atm-delivery" onSubmit={submit}>
    <h4><Upload size={15} /> Upload version {next}</h4>
    <input ref={input} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.svg,.ai,.eps,.zip" onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 10))} aria-label="Artwork or mockup files" />
    {files.length > 0 && <p className="muted">{files.length} file{files.length === 1 ? '' : 's'}: {files.map(f => f.name).join(', ')}</p>}
    <div className="atm-row-fields"><label className="field">Kind<select className="admin-select" value={kind} onChange={e => setKind(e.target.value)}><option value="artwork">Artwork (flat front and back)</option><option value="mockup">Mockup</option></select></label>
      <label className="atm-check"><input type="checkbox" checked={send} onChange={e => setSend(e.target.checked)} /> Send to the customer for review</label></div>
    <label className="field">Note to the customer<textarea rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="What changed in this version" /></label>
    <p className="field-hint">A PNG, JPG or WEBP of the flat front and back goes into the customer's account and the Studio's "My design picture" when they approve.</p>
    <button className="button button-gradient" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />} {files.length ? 'Upload' : 'Choose files'}</button>
  </form>;
}

function Conversation({ r, id, onSent, onError }: { r: Detail; id: number; onSent: () => void; onError: (t: string) => void }) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [r.messages.length]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !files.length) return;
    const data = new FormData();
    if (body.trim()) data.append('body', body.trim());
    files.forEach(f => data.append('files[]', f));
    data.append('internal', internal ? '1' : '0');
    setBusy(true);
    try { await api(`/team-admin/requests/${id}/messages`, { method: 'POST', body: data }); setBody(''); setFiles([]); if (input.current) input.current.value = ''; onSent(); }
    catch (err) { onError((err as Error).message); } finally { setBusy(false); }
  }
  return <section className="glow-panel admin-card"><h3><MessageSquare size={17} /> Conversation with {r.name}</h3>
    <div className="atm-chat">{r.messages.length ? r.messages.map(m => <div key={m.id} className={`atm-msg role-${m.role}${m.internal ? ' internal' : ''}`}>
      <span className="atm-msg-by">{m.author?.name ?? 'System'} <small>{m.role}{m.internal ? ' · staff only' : ''} · {when(m.created_at)}</small></span>
      {m.body && <p>{m.body}</p>}
      {m.files.length > 0 && <div className="atm-files small">{m.files.map(f => <FileTile key={f.id} f={f} />)}</div>}
    </div>) : <p className="muted">No messages yet.</p>}<div ref={end} /></div>
    {r.status !== 'closed' && <form className="atm-compose" onSubmit={submit}>
      <textarea rows={3} maxLength={4000} value={body} onChange={e => setBody(e.target.value)} placeholder={internal ? 'Internal note (staff only)' : 'Message the customer'} aria-label="Message" />
      <div className="atm-compose-bar">
        <label className="atm-check"><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> <Lock size={13} /> Internal note</label>
        <button type="button" className="button button-outline" onClick={() => input.current?.click()}><Paperclip size={15} /> {files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : 'Attach'}</button>
        <input ref={input} hidden type="file" multiple onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
        <button className="button button-gradient" disabled={busy || (!body.trim() && !files.length)}>{busy ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />} {internal ? 'Add note' : 'Send'}</button>
      </div>
    </form>}
  </section>;
}

function Allowances({ onNotice }: { onNotice: (text: string) => void }) {
  const [plans, setPlans] = useState<Record<string, Plan> | null>(null);
  const [payFirst, setPayFirst] = useState(true);
  const [options, setOptions] = useState({ default_designer_id: '' as string, extra_revision_price: '25.00', first_draft_days: 3, revision_days: 2 });
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [customers, setCustomers] = useState<AllowanceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<AllowanceRow[] | null>(null);
  const applySettings = (d: AllowanceSettings) => { setPlans(d.plans); setPayFirst(d.pay_first); setOptions({ default_designer_id: d.default_designer_id ? String(d.default_designer_id) : '', extra_revision_price: d.extra_revision_price ?? '25.00', first_draft_days: d.first_draft_days ?? 3, revision_days: d.revision_days ?? 2 }); };
  const load = useCallback(() => { api<AllowanceSettings>('/team-admin/allowances').then(d => { applySettings(d); setCustomers(d.customers); }).catch(e => onNotice(e.message)); }, [onNotice]);
  useEffect(load, [load]);
  useEffect(() => { api<Designer[]>('/team-admin/designers').then(setDesigners).catch(() => {}); }, []);
  const edit = (id: string, patch: Partial<Plan>) => setPlans(p => p && { ...p, [id]: { ...p[id], ...patch } });
  async function save() {
    if (!plans) return;
    setBusy(true);
    try {
      const body = { pay_first: payFirst, default_designer_id: options.default_designer_id ? Number(options.default_designer_id) : null, extra_revision_price: options.extra_revision_price, first_draft_days: options.first_draft_days, revision_days: options.revision_days,
        plans: Object.fromEntries(Object.values(plans).map(p => [p.id, { name: p.name, included_per_month: p.included_per_month, price: p.price, revisions: p.revisions, max_open: p.max_open }])) };
      const d = await api<AllowanceSettings>('/team-admin/allowances/plans', { method: 'PUT', body: JSON.stringify(body) });
      applySettings(d); onNotice('Plans saved.');
    } catch (e) { onNotice((e as Error).message); } finally { setBusy(false); }
  }
  const lookUp = (e: React.FormEvent) => { e.preventDefault(); api<AllowanceRow[]>(`/team-admin/allowances/users?search=${encodeURIComponent(search.trim())}`).then(setFound).catch(err => onNotice(err.message)); };
  const shown = useMemo(() => found ?? customers, [found, customers]);
  if (!plans) return <div className="empty-state"><LoaderCircle className="spin" /></div>;
  return <>
    <section className="glow-panel admin-card"><h2><SlidersHorizontal size={18} /> Plans</h2>
      <p className="muted">These are the plans on the public <a href="/pricing" target="_blank" rel="noreferrer">Pricing page</a> (Rookie, Creator, Club and Pro Studio); keep the names the same. Prices include GST (the GST is worked out at the rate in Admin › Pricing). Included requests don't carry over to the next month. Subscriptions are not live yet: set each customer's plan below.</p>
      <div className="table-wrap"><table className="admin-table atm-plans"><thead><tr><th>Plan</th><th>Included a month</th><th>Price per extra request (incl. GST)</th><th>Revisions per request</th><th>Open at once</th></tr></thead><tbody>
        {Object.values(plans).map(p => <tr key={p.id}>
          <td><input aria-label={`${p.id} name`} value={p.name} maxLength={60} onChange={e => edit(p.id, { name: e.target.value })} /><small className="cell-sub">{p.id}</small></td>
          <td><input aria-label={`${p.name} included a month`} type="number" min={0} value={p.included_per_month} onChange={e => edit(p.id, { included_per_month: Number(e.target.value) })} /></td>
          <td><input aria-label={`${p.name} price`} type="number" min={0} step="0.01" value={p.price} onChange={e => edit(p.id, { price: e.target.value })} /></td>
          <td><input aria-label={`${p.name} revisions`} type="number" min={0} value={p.revisions} onChange={e => edit(p.id, { revisions: Number(e.target.value) })} /></td>
          <td><input aria-label={`${p.name} open at once`} type="number" min={1} value={p.max_open} onChange={e => edit(p.id, { max_open: Number(e.target.value) })} /></td>
        </tr>)}</tbody></table></div>
      <label className="toggle-row"><input type="checkbox" checked={payFirst} onChange={e => setPayFirst(e.target.checked)} /><span><strong>Paid requests start once paid</strong><small>Off: the work starts at once and the invoice stays open.</small></span></label>
      <div className="atm-options">
        <label className="field">Default designer<select className="admin-select" aria-label="Default designer" value={options.default_designer_id} onChange={e => setOptions({ ...options, default_designer_id: e.target.value })}>
          <option value="">None: an admin assigns each request</option>{designers.map(d => <option key={d.id} value={d.id}>{d.name}{d.is_admin ? ' (admin)' : ' (designer)'}</option>)}</select>
          <small className="field-hint">Every new request is assigned to this person as soon as it can start (received, or paid).</small></label>
        <label className="field">Extra revision round (incl. GST)<input aria-label="Extra revision price" type="number" min={0} step="0.01" value={options.extra_revision_price} onChange={e => setOptions({ ...options, extra_revision_price: e.target.value })} />
          <small className="field-hint">Offered when the included revisions are used up; starts once paid.</small></label>
        <label className="field">First draft due in (business days)<input aria-label="First draft business days" type="number" min={0} max={60} value={options.first_draft_days} onChange={e => setOptions({ ...options, first_draft_days: Number(e.target.value) })} /></label>
        <label className="field">Each revision due in (business days)<input aria-label="Revision business days" type="number" min={0} max={60} value={options.revision_days} onChange={e => setOptions({ ...options, revision_days: Number(e.target.value) })} />
          <small className="field-hint">Due dates skip Saturday and Sunday; you can still change one by hand on a request.</small></label>
      </div>
      <button className="button button-gradient" disabled={busy} onClick={save}>{busy && <LoaderCircle className="spin" size={15} />} Save plans</button>
    </section>
    <section className="glow-panel admin-card"><div className="admin-toolbar"><h2>Customers</h2>
      <form className="admin-search" onSubmit={lookUp}><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a customer by name or email" aria-label="Find a customer" /></form>
      {found && <button className="button button-outline" onClick={() => { setFound(null); setSearch(''); }}>Show customers with settings</button>}</div>
      <div className="table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Plan</th><th>Monthly override</th><th>Bonus requests</th><th>Unlimited</th><th>This month</th><th>Note</th><th /></tr></thead><tbody>
        {shown.map(row => <AllowanceEditor key={row.user.id} row={row} plans={plans} onSaved={next => { setCustomers(c => [next, ...c.filter(x => x.user.id !== next.user.id)]); setFound(f => f && f.map(x => x.user.id === next.user.id ? next : x)); onNotice(`${next.user.name}: allowance saved.`); }} onError={onNotice} />)}
        {!shown.length && <tr><td colSpan={8} className="muted">{found ? 'No customers found.' : `Every customer is on the ${plans.free?.name ?? 'free'} plan. Find a customer to change theirs.`}</td></tr>}
      </tbody></table></div>
    </section>
  </>;
}

function AllowanceEditor({ row, plans, onSaved, onError }: { row: AllowanceRow; plans: Record<string, Plan>; onSaved: (r: AllowanceRow) => void; onError: (t: string) => void }) {
  const [form, setForm] = useState({ plan: row.plan, monthly_included: row.monthly_included === null ? '' : String(row.monthly_included), bonus_requests: row.bonus_requests, unlimited: row.unlimited, note: row.note ?? '' });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (form.unlimited && !row.unlimited && !window.confirm(`Give ${row.user.name} unlimited design requests? This is recorded with your name.`)) return;
    setBusy(true);
    try { onSaved(await api<AllowanceRow>(`/team-admin/allowances/users/${row.user.id}`, { method: 'PUT', body: JSON.stringify({ ...form, monthly_included: form.monthly_included === '' ? null : Number(form.monthly_included), note: form.note || null }) })); }
    catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  return <tr>
    <td><strong>{row.user.name}</strong><small className="cell-sub">{row.user.email}</small></td>
    <td><select className="admin-select" aria-label={`${row.user.name} plan`} value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>{Object.values(plans).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
    <td><input aria-label={`${row.user.name} monthly override`} type="number" min={0} placeholder="Plan's" value={form.monthly_included} onChange={e => setForm({ ...form, monthly_included: e.target.value })} /></td>
    <td><input aria-label={`${row.user.name} bonus requests`} type="number" min={0} value={form.bonus_requests} onChange={e => setForm({ ...form, bonus_requests: Number(e.target.value) })} /></td>
    <td><input aria-label={`${row.user.name} unlimited`} type="checkbox" checked={form.unlimited} onChange={e => setForm({ ...form, unlimited: e.target.checked })} /></td>
    <td>{row.used_this_month} of {row.included_per_month}<small className="cell-sub">{row.open_requests} open · next: {row.next_billing}</small></td>
    <td><input aria-label={`${row.user.name} note`} maxLength={500} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></td>
    <td><button className="button button-outline" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="spin" size={14} /> : 'Save'}</button></td>
  </tr>;
}

/** /designer and /designer/:itemId: the designer's own screen (non-admin designers), the requests assigned to them. */
export function DesignerPage({ user, onNotice }: { user: { name: string; is_admin?: boolean; is_designer?: boolean }; onNotice: (text: string) => void }) {
  const { itemId } = useParams();
  if (!user.is_designer && !user.is_admin) return <div className="page-shell"><div className="auth-gate panel"><Palette size={38} /><span className="eyebrow">3DEEZI TEAM</span><h1>Designers only.</h1><p>This page is for 3DEEZI designers. An administrator can mark your account as a designer under Admin › Users.</p><Link className="button button-primary" to="/">Back to create</Link></div></div>;
  return <div className="atm-designer-page">
    <div className="atm-designer-top"><h1><Palette size={22} /> 3DEEZI TEAM · Designer</h1><p>{user.is_admin ? 'You are an administrator: you see every request (Admin › 3DEEZI TEAM has the allowances too).' : `Hi ${user.name.split(' ')[0]}: the design requests assigned to you.`}</p>
      {user.is_admin && <Link className="button button-outline" to="/admin/team">Admin › 3DEEZI TEAM</Link>}</div>
    <AdminTeam mode="designer" itemId={itemId} onNotice={onNotice} />
  </div>;
}
