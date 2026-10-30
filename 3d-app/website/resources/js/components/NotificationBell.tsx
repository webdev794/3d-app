import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api } from '../api';
import '../../css/notification-bell.css';

/** One notification as GET /api/v1/notifications returns it (newest first); data.link is a site path. */
interface BellItem { id: string; type: string; data: { title?: string; number?: string; name?: string; text?: string; link?: string } & Record<string, unknown>; read_at: string | null; created_at: string | null }
interface BellFeed { unread: number; items: BellItem[] }

const ago = (iso: string | null) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
};
const titleOf = (d: BellItem['data']) => d.title || [d.number, d.name].filter(Boolean).join(' · ') || 'Notification';

/** The header bell (client picture 145): unread badge, a dropdown of the newest notifications, polled once a minute. Signed-in only. */
export default function NotificationBell({ signedIn }: { signedIn: boolean }) {
  const navigate = useNavigate();
  const [feed, setFeed] = useState<BellFeed>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(() => { api<BellFeed>('/notifications').then(f => { if (f && Array.isArray(f.items)) setFeed(f); }).catch(() => { /* keep the last list; the next poll retries */ }); }, []);
  useEffect(() => {
    if (!signedIn) { setFeed({ unread: 0, items: [] }); setOpen(false); return; }
    load();
    const t = window.setInterval(() => { if (!document.hidden) load(); }, 60_000);
    return () => window.clearInterval(t);
  }, [signedIn, load]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const markRead = (ids?: string[]) => {
    const now = new Date().toISOString();
    setFeed(f => ({ unread: ids ? Math.max(0, f.unread - f.items.filter(i => ids.includes(i.id) && !i.read_at).length) : 0, items: f.items.map(i => (!ids || ids.includes(i.id)) && !i.read_at ? { ...i, read_at: now } : i) }));
    api<{ unread: number }>('/notifications/read', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) }).then(r => { if (r && typeof r.unread === 'number') setFeed(f => ({ ...f, unread: r.unread })); }).catch(() => undefined);
  };
  const toggle = () => { const next = !open; setOpen(next); if (next && feed.unread > 0) markRead(); };
  const go = (item: BellItem) => { if (!item.read_at) markRead([item.id]); setOpen(false); const link = item.data.link; if (typeof link === 'string' && link.startsWith('/')) navigate(link); };

  if (!signedIn) return null;
  const badge = feed.unread > 99 ? '99+' : String(feed.unread);
  return <div className="notif-bell" ref={wrap}>
    <button type="button" className="notif-bell-btn" aria-label={feed.unread ? `Notifications, ${feed.unread} unread` : 'Notifications'} aria-haspopup="true" aria-expanded={open} title="Notifications" onClick={toggle}>
      <Bell size={19} strokeWidth={1.7} />{feed.unread > 0 && <span className="notif-badge">{badge}</span>}
    </button>
    {open && <div className="notif-panel" role="menu" aria-label="Notifications">
      <div className="notif-head"><strong>Notifications</strong>{feed.items.some(i => !i.read_at) && <button type="button" onClick={() => markRead()}>Mark all read</button>}</div>
      {feed.items.length === 0 ? <p className="notif-empty">You have no notifications yet.</p> :
        <ul>{feed.items.map(item => <li key={item.id}>
          <button type="button" role="menuitem" className={item.read_at ? 'notif-item' : 'notif-item is-unread'} onClick={() => go(item)}>
            <span className="notif-title">{titleOf(item.data)}</span>
            {item.data.text && <span className="notif-text">{item.data.text}</span>}
            <span className="notif-time">{ago(item.created_at)}</span>
          </button>
        </li>)}</ul>}
    </div>}
  </div>;
}
