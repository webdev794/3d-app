import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, LifeBuoy, LoaderCircle, Search, Trash2 } from 'lucide-react';
import { api } from '../api';

/** Admin > Support: messages sent with the Support page's contact form (/support). Styles: the admin panel's own. */
interface SupportMessage { id: number; user_id: number | null; name: string; email: string; order_reference: string | null; message: string; status: string; created_at: string }
interface Page<T> { data: T[]; current_page: number; last_page: number; total: number }

const STATUSES = ['new', 'answered', 'closed'];
const statusClass: Record<string, string> = { new: 'pending', answered: 'confirmed', closed: 'delivered' };
const when = (iso: string) => new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function SupportPanel({ onNotice }: { onNotice: (text: string) => void }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<SupportMessage> | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), ...(query ? { search: query } : {}), ...(status ? { status } : {}) });
    api<Page<SupportMessage>>(`/admin/support-messages?${params}`).then(r => { setResult(r); setError(''); }).catch(e => setError(e.message));
  }, [page, query, status]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [query, status]);

  async function setMessageStatus(m: SupportMessage, next: string) {
    try { await api(`/admin/support-messages/${m.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); onNotice(`Message from ${m.name} marked ${next}.`); load(); }
    catch (e) { onNotice((e as Error).message); }
  }
  async function remove(m: SupportMessage) {
    if (!window.confirm(`Delete the message from ${m.name}? This cannot be undone.`)) return;
    try { await api(`/admin/support-messages/${m.id}`, { method: 'DELETE' }); onNotice('Message deleted.'); load(); }
    catch (e) { onNotice((e as Error).message); }
  }

  return <section className="glow-panel admin-card">
    <div className="admin-toolbar"><h2><LifeBuoy size={18} /> Support messages {result && <small>{result.total}</small>}</h2>
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, email, reference or text" /></form>
      <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></div>
    {error && <p className="error-message">{error}</p>}
    {!result ? <div className="empty-state"><LoaderCircle className="spin" /></div> : <div className="table-wrap"><table className="admin-table"><thead><tr><th>From</th><th>Order</th><th>Message</th><th>Status</th><th>Received</th><th /></tr></thead><tbody>
      {result.data.map(m => <tr key={m.id}>
        <td><strong>{m.name}</strong><small className="cell-sub"><a href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message to 3DEEZI')}`}>{m.email}</a>{m.user_id ? ` · account #${m.user_id}` : ''}</small></td>
        <td>{m.order_reference || <span className="muted">—</span>}</td>
        <td className="cell-message" style={{ whiteSpace: 'pre-line' }}>{m.message}</td>
        <td><select className={`status-select s-${statusClass[m.status] ?? 'pending'}`} value={m.status} onChange={e => setMessageStatus(m, e.target.value)} aria-label={`Status of the message from ${m.name}`}>{STATUSES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></td>
        <td>{when(m.created_at)}</td>
        <td className="row-actions"><button className="icon-button danger" aria-label={`Delete the message from ${m.name}`} onClick={() => remove(m)}><Trash2 size={15} /></button></td>
      </tr>)}
      {!result.data.length && <tr><td colSpan={6} className="muted">No support messages yet.</td></tr>}
    </tbody></table></div>}
    {result && result.last_page > 1 && <div className="pager"><button className="icon-button" disabled={result.current_page <= 1} onClick={() => setPage(result.current_page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button><span>Page {result.current_page} of {result.last_page}</span><button className="icon-button" disabled={result.current_page >= result.last_page} onClick={() => setPage(result.current_page + 1)} aria-label="Next page"><ChevronRight size={16} /></button></div>}
  </section>;
}
