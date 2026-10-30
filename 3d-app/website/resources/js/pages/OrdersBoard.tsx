import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clock3, FileText, Info, LoaderCircle, Plus, RefreshCw, Search, TriangleAlert, X } from 'lucide-react';
import { orderApi } from '../orderApi';
import { OrderPageHeader } from '../components/OrderPageParts';
import OrderDetailDrawer, { type DetailFocus } from '../components/OrderDetail';
import { GarmentPicture, PaymentPill, STAGES, StatusPill, cardLine, displayRef, payPath, plural, readBoard, shortDate, type BoardData, type BoardOrder, type OrderDetail, type StageKey } from '../components/orderBoardModel';
import '../../css/orders-board.css';

type View = 'current' | 'completed';
/** The board refreshes itself every minute while the tab is open, and at once when the customer comes back to it. */
const REFRESH_MS = 60_000;

const EMPTY: Record<StageKey, string> = {
  received: 'New orders start here.',
  design: 'Nothing waiting on design.',
  production: 'Nothing in production.',
  shipped: 'Nothing on its way.',
  delivered: 'No recent deliveries.',
};
/** The customer has something to do on this order: approve a design or pay an invoice. */
const needsYou = (o: BoardOrder) => o.action === 'review_design' || !!o.payment?.payable;

/**
 * My Orders (/orders): every order of the signed-in customer on a five-stage board (Order received → Delivered),
 * with search, Current / Completed, and the order's detail in a side panel (?order=ID; &focus=review|track|pay opens
 * the design review, the tracking or the invoice). Customers only look: staff move the orders between stages.
 */
export default function OrdersBoardPage({ onNotice }: { onNotice?: (text: string) => void }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // An order's own link (/orders/12, as in the emails and notifications) opens the board with that order.
  const { orderId } = useParams();
  useEffect(() => { if (orderId) navigate(/^\d+$/.test(orderId) ? `/orders?order=${orderId}` : '/orders', { replace: true }); }, [orderId, navigate]);
  const view: View = params.get('view') === 'completed' ? 'completed' : 'current';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The latest view and search for the loader, which the timers keep calling.
  const wanted = useRef({ view, query });
  wanted.current = { view, query };
  const lastLoad = useRef(0);
  const sequence = useRef(0);
  const next = useRef(0);
  const reload = useRef<() => void>(() => {});
  const load = useCallback(async () => {
    const { view, query } = wanted.current;
    const mine = ++sequence.current;
    window.clearTimeout(next.current);
    setBusy(true);
    try {
      const data = readBoard(await orderApi.board(view, query), view);
      if (mine !== sequence.current) return;
      setBoard(data); setError(''); setStale(false);
      lastLoad.current = Date.now(); setLoadedAt(lastLoad.current); setNow(lastLoad.current);
    } catch (e) {
      if (mine !== sequence.current) return;
      setStale(true);
      setError((e as Error).message);
    } finally {
      if (mine === sequence.current) {
        setBusy(false);
        // The next check, a minute after this one (skipped while the tab is in the background: coming back checks).
        next.current = window.setTimeout(() => { if (document.visibilityState === 'visible') reload.current(); }, REFRESH_MS);
      }
    }
  }, []);
  reload.current = load;

  useEffect(() => { const t = setTimeout(() => setQuery(search.trim()), 280); return () => clearTimeout(t); }, [search]);
  useEffect(() => { if (!orderId) load(); }, [view, query, load, orderId]);
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 5_000) load(); };
    const clock = window.setInterval(() => setNow(Date.now()), 10_000);
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => {
      // Leaving the page: a check still on its way is ignored and schedules nothing more.
      sequence.current++;
      window.clearTimeout(next.current); clearInterval(clock);
      document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back);
    };
  }, [load]);

  const shown = board && board.view === view ? board : null;
  const minutes = loadedAt === null ? null : Math.max(0, Math.floor((now - loadedAt) / 60_000));
  const updated = stale && shown ? 'Couldn’t update · Try again' : minutes === null ? 'Updating…' : minutes < 1 ? 'Updated just now' : minutes < 60 ? `Updated ${minutes} min ago` : `Updated ${Math.floor(minutes / 60)} hr ago`;

  function setView(next: View) {
    if (next === view) return;
    const p = new URLSearchParams(params);
    if (next === 'completed') p.set('view', 'completed'); else p.delete('view');
    setParams(p, { replace: true });
  }

  /* The order panel lives in the address (?order=12), so Back closes it and a link can open it. */
  const openKey = params.get('order');
  const focusParam = params.get('focus');
  const focus: DetailFocus = focusParam === 'review' || focusParam === 'track' || focusParam === 'pay' ? focusParam : null;
  const everyOrder = useMemo(() => shown ? [...STAGES.flatMap(s => shown.columns[s.key]), ...shown.cancelled] : [], [shown]);
  const openOrder = openKey ? everyOrder.find(o => String(o.id) === openKey || o.number.toLowerCase() === openKey.replace(/^#/, '').toLowerCase()) ?? null : null;
  const openId = openOrder?.id ?? (openKey && /^\d+$/.test(openKey) ? Number(openKey) : null);
  function open(order: BoardOrder, how: DetailFocus = null) {
    // Pay now goes to the invoice's Review & Pay page; the order panel shows the invoice if there is no page.
    const pay = how === 'pay' && order.payment ? payPath(order.payment) : null;
    if (pay) { navigate(pay); return; }
    const p = new URLSearchParams(params);
    p.set('order', String(order.id));
    if (how) p.set('focus', how); else p.delete('focus');
    setParams(p, { state: { orderPanel: true } });
  }
  function close() {
    if ((location.state as { orderPanel?: boolean } | null)?.orderPanel) { navigate(-1); return; }
    const p = new URLSearchParams(params);
    p.delete('order'); p.delete('focus');
    setParams(p, { replace: true });
  }
  /** The panel recorded something (an approval): the card shows it at once, then the board catches up. */
  const changed = useCallback((order: OrderDetail) => {
    setBoard(b => {
      if (!b) return b;
      const swap = (list: BoardOrder[]) => list.map(o => (o.id === order.id ? { ...o, ...order } : o));
      return { ...b, columns: Object.fromEntries(STAGES.map(s => [s.key, swap(b.columns[s.key])])) as BoardData['columns'], cancelled: swap(b.cancelled) };
    });
    load();
  }, [load]);

  const searching = query.length > 0;
  const total = shown ? everyOrder.length : 0;

  return <div className="op-page ob-page">
    <div className="op-shell ob-shell">
      <div className="ob-top">
        <OrderPageHeader current="My Orders" title="My Orders" subtitle="Your orders. Every stage. One place." back={null} />
        <NewOrderMenu />
      </div>

      <div className="ob-toolbar">
        <label className="ob-search">
          <Search size={20} aria-hidden="true" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders…" aria-label="Search orders by reference, name or garment" maxLength={80} />
          {search && <button type="button" className="ob-search-clear" onClick={() => setSearch('')} aria-label="Clear the search"><X size={16} /></button>}
        </label>
        <div className="ob-tabs" role="tablist" aria-label="Which orders">
          <button type="button" role="tab" id="ob-tab-current" aria-selected={view === 'current'} aria-controls="ob-panel" className={view === 'current' ? 'is-on' : ''} onClick={() => setView('current')}>Current orders</button>
          <button type="button" role="tab" id="ob-tab-completed" aria-selected={view === 'completed'} aria-controls="ob-panel" className={view === 'completed' ? 'is-on' : ''} onClick={() => setView('completed')}>Completed</button>
        </div>
        <button type="button" className={`ob-updated${stale && shown ? ' is-stale' : ''}${busy ? ' is-busy' : ''}`} onClick={() => load()} title={loadedAt ? `Checked at ${new Date(loadedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })} · refreshes every minute. Click to refresh now.` : 'Refresh now'}>
          {busy ? <RefreshCw size={19} className="spin" aria-hidden="true" /> : stale && shown ? <TriangleAlert size={19} aria-hidden="true" /> : <Clock3 size={19} aria-hidden="true" />}<span>{updated}</span>
        </button>
      </div>

      <div id="ob-panel" role="tabpanel" aria-labelledby={`ob-tab-${view}`} aria-busy={busy || undefined} className={`ob-panel${busy && shown ? ' is-busy' : ''}`}>
        {!shown ? (error ? <div className="ob-message is-error" role="alert"><TriangleAlert size={22} /><p>{error}</p><button type="button" className="ob-ghost" onClick={() => load()}>Try again</button></div>
          : <div className="ob-message" role="status"><LoaderCircle className="spin" size={22} /><p>Loading your orders…</p></div>)
          : <>
            {searching && total === 0 && <div className="ob-message" role="status"><Search size={22} /><p>No {view === 'current' ? 'current' : 'completed'} orders match “{query}”.{view === 'current' && ' Older orders are under Completed.'}</p><button type="button" className="ob-ghost" onClick={() => setSearch('')}>Clear search</button></div>}
            {!searching && total === 0 && view === 'current' && <div className="ob-message is-start"><FileText size={22} /><p>No current orders. Start one with the order form, or upload the order you have.</p><Link className="ob-ghost" to="/orders/new">Create order form</Link><Link className="ob-ghost" to="/orders/upload">Upload your order</Link></div>}
            {view === 'current' ? (total > 0 || !searching) && <StageBoard board={shown} onOpen={open} /> : <CompletedOrders board={shown} onOpen={open} searching={searching} />}
            {view === 'current' && shown.drafts.length > 0 && <Drafts drafts={shown.drafts} />}
          </>}
      </div>

      <p className="ob-foot"><Info size={20} aria-hidden="true" /> Open an order to view artwork, details and updates.</p>
    </div>
    {openKey && <OrderDetailDrawer key={openKey} orderId={openId} initial={openOrder} focus={focus} refreshedAt={loadedAt} onClose={close} onChanged={changed} onNotice={onNotice} />}
  </div>;
}

/** "+ NEW ORDER": the order form or an upload. */
function NewOrderMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  const line = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
  return <div className="ob-new" ref={root}>
    <button type="button" className="ob-new-button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(v => !v)}><Plus size={24} strokeWidth={2.2} /><span>New order</span></button>
    {open && <div className="ob-new-menu">
      <Link to="/orders/new" onClick={() => setOpen(false)}><svg {...line}><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2H12" /><path d="M19 13V7.5l-5-5" /><path d="M14 2.5V6a1.5 1.5 0 0 0 1.5 1.5H19" /><path d="M8 11h7M8 14.5h4.5" /><path d="M18 14.5q.6 2.9 3.5 3.5-2.9.6-3.5 3.5-.6-2.9-3.5-3.5 2.9-.6 3.5-3.5Z" fill="currentColor" strokeWidth={1} /></svg><span><strong>Create Order Form</strong><small>Build an order with 3DEEZI Assist</small></span></Link>
      <Link to="/orders/upload" onClick={() => setOpen(false)}><svg {...line}><path d="M4 14.5v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /><path d="M12 15.5v-12M7.5 8 12 3.5 16.5 8" /></svg><span><strong>Upload Your Order</strong><small>Submit your form and artwork</small></span></Link>
    </div>}
  </div>;
}

/**
 * The five stages. Wide screens show them side by side; tablets and phones scroll them sideways one at a time
 * (snapping to each column) with the stage bar above to jump between them.
 */
function StageBoard({ board, onOpen }: { board: BoardData; onOpen: (o: BoardOrder, how?: DetailFocus) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  // The stages in view: one on a phone, two or three on a tablet (the stage bar lights them).
  const [inView, setInView] = useState<StageKey[]>(['received']);
  const placed = useRef(false);
  const frame = useRef(0);

  /** A tap on the stage bar: that column to the front (and focus, for keyboards); on opening, just the scroll. */
  function goTo(key: StageKey, tapped = true) {
    const box = scroller.current;
    const column = box?.querySelector<HTMLElement>(`[data-stage="${key}"]`);
    if (!box || !column) return;
    box.scrollTo({ left: column.offsetLeft - parseFloat(getComputedStyle(box).paddingLeft || '0'), behavior: tapped ? 'smooth' : 'auto' });
    if (tapped) column.focus({ preventScroll: true });
  }
  const measure = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = scroller.current;
      if (!box) return;
      const view = box.getBoundingClientRect();
      const seen = [...box.querySelectorAll<HTMLElement>('[data-stage]')].filter(c => {
        const r = c.getBoundingClientRect();
        return Math.min(r.right, view.right) - Math.max(r.left, view.left) >= r.width * 0.6;
      }).map(c => c.dataset.stage as StageKey);
      setInView(v => (seen.length && seen.join() !== v.join() ? seen : v));
    });
  }, []);
  // Phones and tablets open on the stage that needs the customer, else the first stage with orders.
  useEffect(() => {
    const box = scroller.current;
    if (!placed.current && box) {
      placed.current = true;
      const first = STAGES.find(s => board.columns[s.key].some(needsYou)) ?? STAGES.find(s => board.columns[s.key].length);
      if (box.scrollWidth > box.clientWidth + 4 && first && first.key !== 'received') goTo(first.key, false);
    }
    measure();
  }, [board, measure]);
  useEffect(() => { window.addEventListener('resize', measure); return () => { window.removeEventListener('resize', measure); cancelAnimationFrame(frame.current); }; }, [measure]);

  return <div className="ob-board-wrap">
    <nav className="ob-stepper" aria-label="Order stages">
      {STAGES.map(s => {
        const count = board.columns[s.key].length;
        const flag = board.columns[s.key].some(needsYou);
        const on = inView.includes(s.key);
        return <button key={s.key} type="button" className={`tone-${s.tone}${on ? ' is-on' : ''}`} aria-current={on ? 'true' : undefined} onClick={() => goTo(s.key)} aria-label={`${s.label}: ${plural(count, 'order')}${flag ? ', needs you' : ''}${on ? ' (on screen)' : ''}`}>
          <span className="ob-step-top"><i className="ob-dot" aria-hidden="true" /><b>{count}</b>{flag && <em className="ob-flag" aria-hidden="true">!</em>}</span>
          <span className="ob-step-name">{s.short}</span>
        </button>;
      })}
    </nav>
    <div className="ob-board" ref={scroller} onScroll={measure}>
      {STAGES.map(s => {
        const orders = board.columns[s.key];
        const several = orders.length > 1;
        return <section key={s.key} className={`ob-col tone-${s.tone}`} data-stage={s.key} aria-labelledby={`ob-col-${s.key}`} tabIndex={-1}>
          <header className="ob-col-head"><i className="ob-dot" aria-hidden="true" /><h2 id={`ob-col-${s.key}`}>{s.label}</h2><span className="ob-count" title={plural(orders.length, 'order')}>{orders.length}</span></header>
          <div className="ob-col-body">
            {orders.length ? orders.map(o => <OrderCard key={o.id} order={o} compact={several && !needsYou(o)} onOpen={onOpen} />) : <p className="ob-col-empty">{EMPTY[s.key]}</p>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}

/** Completed orders: delivered more than two weeks ago, or cancelled. */
function CompletedOrders({ board, onOpen, searching }: { board: BoardData; onOpen: (o: BoardOrder, how?: DetailFocus) => void; searching: boolean }) {
  const delivered = STAGES.flatMap(s => board.columns[s.key]);
  const groups = [
    { key: 'delivered', label: 'Delivered', tone: 'green', orders: delivered },
    { key: 'cancelled', label: 'Cancelled', tone: 'grey', orders: board.cancelled },
  ].filter(g => g.orders.length);
  if (!groups.length) return searching ? null : <div className="ob-message"><Info size={22} /><p>No completed orders yet. Delivered orders move here two weeks after delivery.</p></div>;
  return <div className="ob-done">
    {groups.map(g => <section key={g.key} className={`ob-done-group tone-${g.tone}`} aria-labelledby={`ob-done-${g.key}`}>
      <header className="ob-col-head"><i className="ob-dot" aria-hidden="true" /><h2 id={`ob-done-${g.key}`}>{g.label}</h2><span className="ob-count">{g.orders.length}</span></header>
      <div className="ob-done-grid">{g.orders.map(o => <OrderCard key={o.id} order={o} compact={false} onOpen={onOpen} />)}</div>
    </section>)}
  </div>;
}

/** Order forms and uploads saved but not sent. */
function Drafts({ drafts }: { drafts: BoardData['drafts'] }) {
  return <section className="ob-drafts" aria-labelledby="ob-drafts-h">
    <h2 id="ob-drafts-h"><FileText size={18} aria-hidden="true" /> Not sent yet <span>{drafts.length}</span></h2>
    <ul>{drafts.map(d => <li key={d.id}>
      <Link to={`/orders/${d.kind === 'upload' ? 'upload' : 'new'}?draft=${d.id}`}>
        <span><strong>{d.title || 'Untitled order'}</strong><small>{d.kind === 'upload' ? 'Upload' : 'Order form'}{d.updated_at ? ` · saved ${shortDate(d.updated_at)}` : ''}</small></span>
        <em>Continue <ArrowRight size={15} /></em>
      </Link>
    </li>)}</ul>
  </section>;
}

/** One order on the board. Customers open it; they can't drag it (staff move orders between stages). */
function OrderCard({ order, compact, onOpen }: { order: BoardOrder; compact: boolean; onOpen: (o: BoardOrder, how?: DetailFocus) => void }) {
  const review = order.action === 'review_design';
  const track = order.action === 'track_delivery';
  const pay = !!order.payment?.payable;
  const hasButtons = review || track || pay;
  const line = cardLine(order);
  const garments = order.garments.length ? order.garments : [{ garment: order.source === 'upload' ? 'form' : 'other', name: order.source === 'upload' ? 'Uploaded order form' : 'Order', quantity: 0, thumbnail: null }];
  // No design picture on any garment: the order's first artwork or proof picture (cover), else drawn garments.
  const cover = !garments.some(g => g.thumbnail) && order.cover ? [{ ...garments[0], thumbnail: order.cover, name: `${order.name} artwork` }] : null;
  const pictures = cover ?? (compact ? garments.slice(0, 1) : garments.slice(0, 2));
  const more = cover ? 0 : garments.length - pictures.length;
  const lineEl = line.text && <p className="ob-line" title={line.title}>{line.text}</p>;
  return <article className={`ob-card${compact ? ' is-compact' : ''}${review ? ' needs-approval' : ''}${pay ? ' needs-payment' : ''}`} data-order={order.number}
    onClick={e => { if (!(e.target as HTMLElement).closest('button, a')) onOpen(order); }} draggable={false} onDragStart={e => e.preventDefault()}>
    <p className="ob-ref">{displayRef(order.number)}</p>
    <h3 className="ob-name"><button type="button" onClick={() => onOpen(order)} title={`Open order ${order.number}`}>{order.name}</button></h3>
    <div className={`ob-pics count-${pictures.length}`}>
      {pictures.map((g, i) => <GarmentPicture key={`${g.garment}-${i}`} garment={g.garment} thumbnail={g.thumbnail} alt={g.name} />)}
      {more > 0 && <span className="ob-more" title={garments.slice(pictures.length).map(g => g.name).join(', ')}>+{more}</span>}
    </div>
    <p className="ob-qty">{order.quantity > 0 ? plural(order.quantity, 'garment') : 'Sizes to be confirmed'}{order.needed_by && !order.completed ? ` · required ${new Date(`${order.needed_by}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}</p>
    <div className="ob-pills"><StatusPill status={order.sub_status} />{order.payment && <PaymentPill payment={order.payment} />}</div>
    {!hasButtons && lineEl}
    {hasButtons ? <div className="ob-actions">
      {review && <button type="button" className="ob-action" onClick={() => onOpen(order, 'review')}>Review design <ArrowRight size={17} /></button>}
      {pay && <button type="button" className="ob-action is-pay" onClick={() => onOpen(order, 'pay')}>Pay now <ArrowRight size={17} /></button>}
      {track && <button type="button" className="ob-action" onClick={() => onOpen(order, 'track')}>Track delivery <ArrowRight size={17} /></button>}
    </div> : <button type="button" className="ob-view" onClick={() => onOpen(order)}>View order <ArrowRight size={17} /></button>}
    {hasButtons && lineEl}
  </article>;
}
