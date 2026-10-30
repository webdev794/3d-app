import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, LoaderCircle, ShieldCheck, Trash2, TriangleAlert, UserX, X } from 'lucide-react';
import { api } from '../api';
import '../../css/admin-test-accounts.css';

/**
 * Admin › Users › "Remove test accounts": a preview of the automatic test accounts (an @example.test or @example.com
 * email, no admin, no order, no 3DEEZI TEAM request), then their removal (UserController::testAccounts and
 * removeTestAccounts). Every admin and every real email address stays.
 */
interface TestAccount { id: number; name: string; email: string; projects_count: number }
interface Preview { remove: TestAccount[]; remove_count: number; keep_count: number }
interface Removal { removed: number; kept: number; projects: number; assets: number; artboard_documents: number; message: string }

const count = (n: number, word: string) => `${n.toLocaleString('en-AU')} ${word}${n === 1 ? '' : 's'}`;

/** The toolbar button and its confirm dialog. */
export default function RemoveTestAccounts({ onRemoved }: { onRemoved: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="button button-outline" onClick={() => setOpen(true)}><UserX size={16} /> Remove test accounts</button>
    {open && <RemoveDialog onClose={() => setOpen(false)} onRemoved={onRemoved} />}
  </>;
}

function RemoveDialog({ onClose, onRemoved }: { onClose: () => void; onRemoved: (message: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Removal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => { api<Preview>('/admin/users/test-accounts').then(setPreview).catch(e => setError((e as Error).message)); }, []);
  async function remove() {
    if (!preview) return;
    setBusy(true); setError('');
    // Only the accounts listed here (the server checks the rule again).
    try {
      const result = await api<Removal>('/admin/users/test-accounts/remove', { method: 'POST', body: JSON.stringify({ confirm: true, ids: preview.remove.map(u => u.id) }) });
      setDone(result); onRemoved(result.message);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const close = () => { if (!busy) onClose(); };
  const none = preview?.remove_count === 0;

  return <dialog ref={ref} className="modal compact-modal admin-modal tac" aria-labelledby="tac-title" onCancel={e => { e.preventDefault(); close(); }}>
    <button className="icon-button modal-close" onClick={close} disabled={busy} aria-label="Close"><X /></button>
    <h2 id="tac-title">Remove test accounts</h2>
    {done ? <>
      <div className="tac-done" role="status"><CheckCircle2 size={22} /><div><strong>{done.message}</strong>
        <span>Removed with them: {count(done.projects, 'project')}, {count(done.assets, 'upload')} and {count(done.artboard_documents, 'Artboard design')}.</span></div></div>
      <div className="tac-actions"><button className="button button-gradient" onClick={onClose}>Done</button></div>
    </> : !preview ? <>
      {error ? <p className="error-message">{error}</p> : <div className="tac-loading"><LoaderCircle className="spin" size={18} /> Finding the test accounts…</div>}
      {error && <div className="tac-actions"><button className="button button-outline" onClick={onClose}>Close</button></div>}
    </> : <>
      <div className="tac-summary">
        <div className="gone"><strong data-testid="tac-remove-count">{preview.remove_count.toLocaleString('en-AU')}</strong><span>{preview.remove_count === 1 ? 'test account to remove' : 'test accounts to remove'}</span></div>
        <div className="stay"><strong data-testid="tac-keep-count">{preview.keep_count.toLocaleString('en-AU')}</strong><span>{preview.keep_count === 1 ? 'account kept' : 'accounts kept'}</span></div>
      </div>
      <div className="tac-keep"><ShieldCheck size={18} /><div><strong>Keeps every admin and every real email address.</strong>
        <span>Accounts with an order or a 3DEEZI TEAM request are kept too. Only @example.test and @example.com accounts are removed.</span></div></div>
      {none ? <p className="tac-none">No test accounts to remove.</p> : <>
        <ul className="tac-list" aria-label="Test accounts to remove">{preview.remove.map(u => <li key={u.id}>
          <strong>{u.name}</strong><small>{u.email}</small><em>{u.projects_count ? count(u.projects_count, 'project') : 'No projects'}</em>
        </li>)}</ul>
        <p className="tac-warn"><TriangleAlert size={15} /> Their projects, uploads and Artboard designs are removed with them. This cannot be undone.</p>
      </>}
      {error && <p className="error-message">{error}</p>}
      <div className="tac-actions">
        <button className="button button-outline" onClick={close} disabled={busy}>{none ? 'Close' : 'Cancel'}</button>
        {!none && <button className="button tac-remove" onClick={() => void remove()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />} Remove {count(preview.remove_count, 'test account')}</button>}
      </div>
    </>}
  </dialog>;
}
