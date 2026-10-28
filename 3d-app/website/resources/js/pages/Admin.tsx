import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Database, Download, ExternalLink, Eye, FolderOpen, Handshake, KeyRound, LayoutDashboard, LoaderCircle, LogOut, Package, Pencil, PlugZap, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, TriangleAlert, Users, X, Clock } from 'lucide-react';
import { api, fetchFile, media, saveBlob, type Catalog, type User } from '../api';
import { KitViewer, defaultDesign, varsityAreas, varsityColour, trackAreas, trackColour, trackAreaLabel, fabricLabel, type Design, type KitViewerHandle } from '../components/KitViewer';
import { Columns3 } from 'lucide-react';
import AdminOrderBoard from './AdminOrderBoard';
import OrderFormReading from '../components/OrderFormReading';
import type { OrderFile, OrderItem, Payment } from '../orderApi';
import { GarmentReviewSection, ReviewSummaryChip, artworkOf, aud, priceRowsFromPayment, reviewGarmentsFrom, reviewLayoutFor, useGarmentMockups } from '../components/OrderReviewGarments';
import type { Project } from '../api';
import SupportPanel from './AdminSupport';
import { LifeBuoy } from 'lucide-react';
import { InvoicesAdmin, PricingAdmin } from './AdminPricing';
import { BadgeDollarSign, Receipt } from 'lucide-react';
import '../../css/orders.css';
import { ALL_SIZES, MENS_SIZES, RARE_SIZES, rareText, sizeGroups } from '../orderSizes';
import { moneyOr } from '../money';
import AdminTeam from './AdminTeam';
import { Palette } from 'lucide-react';
import RemoveTestAccounts from './AdminTestAccounts';
import SuppliersAdmin, { MadeByFilter, MadeBySelect } from './AdminSuppliers';
import { Factory } from 'lucide-react';
import PresetsAdmin from './AdminPresets';
import { Layers as PresetsIcon } from 'lucide-react';

export interface AdminUser extends User { is_admin: boolean; is_designer?: boolean; designer_all?: boolean; projects_count?: number; orders_count?: number }
export interface Order {
  id: number; number: string; user_id: number; project_id: number | null; status: string; sizes: Record<string, number>;
  quantity: number; unit_price: string | null; total: string | null; currency: string; contact_name: string; phone: string | null;
  shipping_address: string | null; needed_by?: string | null; notes: string | null; admin_notes?: string | null; created_at: string;
  user?: { id: number; name: string; email: string }; project?: { id: number; name: string; sport: string; garment: string; status?: string; version?: number; thumbnail?: string | null } | null;
  /** Names and numbers on the back: the same on every shirt (players holds the one), a list (one per player) or none. */
  names?: BackNames | null; players?: Player[] | null; /** The kit's version when it was ordered. */ project_version?: number | null;
  /** The invoice at a glance (total, paid, status); none before the order has one. */ payment?: Payment | null;
  /** Who makes it (preferred suppliers): none on orders placed before the choice existed (3DEEZI). */ supplier_id?: number | null; made_by?: string | null;
}
export type BackNames = 'same' | 'list' | 'none';
/** One shirt's back: a list row has its size. */
export interface Player { name: string; number: string; size?: string }
interface AdminProject { id: number; name: string; sport: string; garment: string; mode: string; status: 'draft' | 'approved'; version: number; thumbnail: string | null; updated_at: string; orders_count: number; /** The sport's garment tile it was made as ("Netball dress"). */ product_name?: string | null; user?: { id: number; name: string; email: string } }
interface Page<T> { data: T[]; current_page: number; last_page: number; total: number }
interface TrendPoint { day: string; kits: number; orders: number }
interface Stats { partners: number; new_partners: number; users: number; admins: number; projects: number; orders: number; approved: number; quotes: number; garments: number; revenue: number; by_status: Record<string, number>; recent: Order[]; trend: TrendPoint[]; sports: { sport: string; count: number }[] }
interface Partner { id: number; company: string; name: string; email: string; phone: string | null; website: string | null; message: string | null; status: string; created_at: string }
const PARTNER_STATUSES = ['new', 'contacted', 'onboarding', 'live', 'declined'];
interface ApiSettings { configured: boolean; source: string; masked_key: string | null; text_model: string; image_model: string; planning_model?: string | null; hd_image_model?: string | null; production_lead_weeks?: number }
interface DbInfo { driver: string; size: number | null; uploads: number; tables: { name: string; rows: number }[]; expired_tokens: number; php: string; laravel: string; backup: boolean }

/** Every size in order (Order::SIZES): Mens XS–8XL, Womens W8–W24, Kids 2Y–16Y, then the older Kids column. */
export const SIZES = ALL_SIZES;
/**
 * Quantities by size for one kit order ("Order this kit", the admin's order form): the Mens sizes XS–4XL, then
 * "More sizes" for 5XL–8XL, the Womens (W8–W24) and Kids (2Y–16Y) sizes. Sizes with a quantity always show.
 */
export function SizeFields({ sizes, onChange, disabled, legend }: { sizes: Record<string, number>; onChange: (size: string, n: number) => void; disabled?: boolean; legend: React.ReactNode }) {
  const has = (s: string) => (Number(sizes[s]) || 0) > 0;
  const [more, setMore] = useState(() => SIZES.some(s => has(s) && (RARE_SIZES.includes(s) || !MENS_SIZES.includes(s))));
  const groups = sizeGroups(SIZES).map(g => ({ ...g, sizes: g.sizes.filter(s => has(s) || (s !== 'Kids' && (more || (g.fit === 'mens' && !RARE_SIZES.includes(s))))) })).filter(g => g.sizes.length);
  const full = { gridColumn: '1 / -1', margin: '4px 0 0', fontSize: 11.5, fontWeight: 700, color: '#c9d6e2', textAlign: 'left' as const };
  return <fieldset className="size-grid" disabled={disabled}><legend>{legend}</legend>
    {groups.map(g => [
      ...(groups.length > 1 || more ? [<span key={`${g.fit}-h`} style={full}>{g.name} sizes</span>] : []),
      ...g.sizes.map(s => <label key={s}><span>{s}</span><input type="number" min={0} max={10000} value={sizes[s] || ''} placeholder="0" aria-label={`Size ${s}`} onChange={e => onChange(s, Math.max(0, Math.min(10000, Math.floor(Number(e.target.value)) || 0)))} /></label>),
    ])}
    <button type="button" className="text-button" style={{ ...full, fontWeight: 600, color: '#5cc8ec', background: 'none', border: 0, padding: '2px 0', cursor: 'pointer' }} aria-expanded={more} onClick={() => setMore(m => !m)}>
      {more ? 'Fewer sizes' : `+ More sizes: ${rareText(RARE_SIZES.filter(s => MENS_SIZES.includes(s)))}, Womens W8–W24, Kids 2Y–16Y`}</button>
  </fieldset>;
}
export const STATUSES = ['pending', 'confirmed', 'in_production', 'shipped', 'delivered', 'cancelled'];
export const statusLabel = (s: string) => s.replace('_', ' ').replace(/^./, c => c.toUpperCase());
/** "A$1,870.00", the site's one price style (money.ts); "Quote pending" without an amount. */
const money = (v: string | number | null, currency = 'AUD') => moneyOr(v, currency, 'Quote pending');
const date = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const bytes = (n: number | null) => n === null ? '—' : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const sizeSummary = (sizes: Record<string, number>) => Object.entries(sizes).filter(([, n]) => n > 0).map(([s, n]) => `${s}×${n}`).join(' · ');
/** Validated for the dark console surface (dataviz validator: all checks pass). */
const SERIES = { kits: '#00a1b3', orders: '#8b78f2' };

const sections = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, title: 'Admin dashboard', sub: 'Real-time analytics, user metrics and platform status.' },
  { id: 'settings', label: 'API Settings', icon: KeyRound, title: 'API settings', sub: 'The OpenAI connection behind every AI feature.' },
  { id: 'users', label: 'Users', icon: Users, title: 'Users', sub: 'Add, edit and remove accounts and administrators.' },
  { id: 'projects', label: 'Projects', icon: FolderOpen, title: 'Projects', sub: 'Every kit designed on the platform.' },
  { id: 'orders', label: 'Orders', icon: Package, title: 'Orders', sub: 'Quotes, production and delivery.' },
  { id: 'board', label: 'Order board', icon: Columns3, title: 'Order board', sub: 'Every order by stage: drag to move, post updates, proofs and tracking.' },
  { id: 'invoices', label: 'Invoices', icon: Receipt, title: 'Invoices', sub: 'Quotes to price, invoices, payments, refunds.' },
  { id: 'pricing', label: 'Pricing', icon: BadgeDollarSign, title: 'Pricing', sub: 'The price list, business details on invoices, tax and online payments.' },
  { id: 'partners', label: 'Partners', icon: Handshake, title: 'Corporate partners', sub: 'Companies applying to bring 3DEEZI to their website.' },
  { id: 'suppliers', label: 'Suppliers', icon: Factory, title: 'Preferred suppliers', sub: 'Who makes orders: 3DEEZI, Mantis and the approved suppliers; applications and listings.' },
  { id: 'presets', label: 'Presets', icon: PresetsIcon, title: '3DEEZI presets', sub: 'The ready-made designs everyone sees in the Studio: rename, order, hide, sport and garment.' },
  { id: 'team', label: '3DEEZI TEAM', icon: Palette, title: '3DEEZI TEAM', sub: 'Design requests for our designers: assign, design, review and the allowances.' },
  { id: 'support', label: 'Support', icon: LifeBuoy, title: 'Support messages', sub: 'Messages sent with the contact form on the Support page.' },
  { id: 'database', label: 'Database Tools', icon: Database, title: 'Database tools', sub: 'Backups, housekeeping and health.' },
] as const;

/** The admin console: dashboard, API settings, users, projects, orders and database tools. */
export default function AdminPage({ me, onNotice, onLogout, catalog }: { me: User; onNotice: (text: string) => void; onLogout: () => void; catalog: Catalog | null }) {
  const { section = 'dashboard', itemId } = useParams();
  const current = sections.find(s => s.id === section) ?? sections[0];
  const [stats, setStats] = useState<Stats | null>(null);
  const [apiState, setApiState] = useState<ApiSettings | null>(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const refresh = useCallback(() => {
    api<Stats>('/admin/stats').then(setStats).catch(e => setError(e.message));
    api<ApiSettings>('/admin/settings').then(setApiState).catch(() => {});
  }, []);
  useEffect(refresh, [refresh, section]);
  const counts: Record<string, number | undefined> = { users: stats?.users, projects: stats?.projects, orders: stats?.orders, partners: stats?.new_partners || undefined };

  return <div className={`console ${menu ? 'menu-open' : ''}`}>
    <aside className="console-side">
      <Link to="/admin" className="console-brand"><img src={media('showroom/emblem-256.webp')} alt="" /><span><strong>3DEEZI</strong><small>ADMIN CONSOLE</small></span></Link>
      <span className="console-label">MAIN NAVIGATION</span>
      <nav onClick={() => setMenu(false)}>{sections.map(s => <NavLink key={s.id} to={s.id === 'dashboard' ? '/admin' : `/admin/${s.id}`} end className={({ isActive }) => isActive || s.id === section ? 'active' : ''}>
        <s.icon size={17} /><span>{s.label}</span>
        {s.id === 'settings' && apiState && !apiState.configured && <em className="setup">Setup</em>}
        {counts[s.id] !== undefined && <em>{counts[s.id]}</em>}
      </NavLink>)}</nav>
      <Link to="/" className="button button-outline console-site"><ExternalLink size={15} /> View website</Link>
    </aside>
    <div className="console-main">
      <header className="console-top">
        <button className="icon-button console-burger" onClick={() => setMenu(m => !m)} aria-label="Menu"><LayoutDashboard size={18} /></button>
        <div className="console-title"><h1><current.icon size={22} /> {current.title}</h1><p>{current.sub}</p></div>
        <div className="console-actions">
          <Link to="/" className="button button-outline"><ExternalLink size={15} /> View website</Link>
          <span className="super-admin"><ShieldCheck size={15} /> {me.name}<em>SUPER ADMIN</em></span>
          <button className="button button-secondary" onClick={onLogout}><LogOut size={15} /> Sign out</button>
        </div>
      </header>
      {error && <p className="error-message">{error}</p>}
      <div className="console-body">
        {section === 'users' ? <UsersPanel me={me} onNotice={onNotice} onChanged={refresh} />
          : section === 'orders' ? (itemId ? <OrderKit key={itemId} id={Number(itemId)} catalog={catalog} onNotice={onNotice} /> : <OrdersPanel onNotice={onNotice} />)
          : section === 'board' ? <AdminOrderBoard onNotice={onNotice} />
          : section === 'invoices' ? <InvoicesAdmin onNotice={onNotice} />
          : section === 'pricing' ? <PricingAdmin onNotice={onNotice} />
          : section === 'projects' ? <ProjectsPanel catalog={catalog} onNotice={onNotice} />
          : section === 'settings' ? <SettingsPanel state={apiState} onSaved={setApiState} onNotice={onNotice} />
          : section === 'partners' ? <PartnersPanel onNotice={onNotice} />
          : section === 'suppliers' ? <SuppliersAdmin onNotice={onNotice} />
          : section === 'presets' ? <PresetsAdmin catalog={catalog} onNotice={onNotice} />
          : section === 'team' ? <AdminTeam mode="admin" itemId={itemId} onNotice={onNotice} />
          : section === 'support' ? <SupportPanel onNotice={onNotice} />
          : section === 'database' ? <DatabasePanel onNotice={onNotice} />
          : <Dashboard stats={stats} apiState={apiState} />}
      </div>
    </div>
  </div>;
}

function Dashboard({ stats, apiState }: { stats: Stats | null; apiState: ApiSettings | null }) {
  const navigate = useNavigate();
  if (!stats) return <div className="empty-state"><LoaderCircle className="spin" /> Loading…</div>;
  const tiles = [
    ['Users', stats.users, `${stats.admins} admin${stats.admins === 1 ? '' : 's'}`],
    ['3D kits approved', stats.approved, `of ${stats.projects} project${stats.projects === 1 ? '' : 's'}`],
    ['Quotes to price', stats.quotes, 'pending orders without a price'],
    ['Confirmed orders', money(stats.revenue), `${stats.garments} garment${stats.garments === 1 ? '' : 's'} ordered`],
  ] as const;
  const totalKits = stats.sports.reduce((a, s) => a + s.count, 0);
  return <>
    <div className="console-shortcuts"><button className="button button-outline" onClick={() => navigate('/admin/settings')}><PlugZap size={15} /> API settings {apiState && <i className={apiState.configured ? 'dot ok' : 'dot off'} />}</button><button className="button button-gradient" onClick={() => navigate('/admin/projects')}><FolderOpen size={15} /> View projects</button></div>
    <div className="stat-tiles four">{tiles.map(([label, value, note]) => <div key={label} className="stat-tile glow-panel"><strong>{value}</strong><span>{label}</span><small>{note}</small></div>)}</div>
    <div className="admin-grid wide-left">
      <section className="glow-panel admin-card"><div className="card-head"><h2>3D kit production & orders trend</h2><span className="muted">Last 30 days</span></div><TrendChart points={stats.trend} /></section>
      <section className="glow-panel admin-card"><div className="card-head"><h2>Sport popularity breakdown</h2><span className="muted">{stats.sports.length} sport{stats.sports.length === 1 ? '' : 's'}</span></div>
        {stats.sports.length ? <ul className="sport-bars">{stats.sports.map(s => <li key={s.sport} title={`${s.sport}: ${s.count} kit${s.count === 1 ? '' : 's'}`}><span>{s.sport}</span><b>{Math.round(s.count / totalKits * 100)}%</b><i><em style={{ width: `${s.count / stats.sports[0].count * 100}%` }} /></i></li>)}</ul> : <p className="muted">No projects yet.</p>}</section>
    </div>
    <div className="admin-grid">
      <section className="glow-panel admin-card"><h2>Orders by status</h2><ul className="status-bars">{STATUSES.map(s => { const n = stats.by_status[s] ?? 0; return <li key={s}><span className={`status-pill s-${s}`}>{statusLabel(s)}</span><i style={{ width: `${stats.orders ? n / stats.orders * 100 : 0}%` }} /><b>{n}</b></li>; })}</ul></section>
      <section className="glow-panel admin-card"><h2>Latest orders</h2>{stats.recent.length ? <ul className="recent-orders">{stats.recent.map(o => <li key={o.id}><strong>{o.number}</strong><span>{o.user?.name} · {o.quantity} item{o.quantity === 1 ? '' : 's'}</span><span className={`status-pill s-${o.status}`}>{statusLabel(o.status)}</span></li>)}</ul> : <p className="muted">No orders yet.</p>}<NavLink className="button button-outline" to="/admin/orders">Manage orders</NavLink></section>
    </div>
  </>;
}

/** Two series on one count axis, with a crosshair tooltip and a table view. */
function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<SVGSVGElement>(null);
  const W = 640, H = 230, L = 34, R = 10, T = 12, B = 26;
  const max = Math.max(4, ...points.flatMap(p => [p.kits, p.orders]));
  const top = Math.ceil(max / 4) * 4;
  const x = (i: number) => L + i * (W - L - R) / Math.max(1, points.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const line = (k: 'kits' | 'orders') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
  const area = `${line('kits')}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const label = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const totals = useMemo(() => ({ kits: points.reduce((a, p) => a + p.kits, 0), orders: points.reduce((a, p) => a + p.orders, 0) }), [points]);
  function move(e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * W;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round((px - L) / (W - L - R) * (points.length - 1)))));
  }
  const p = hover === null ? null : points[hover];
  return <div className="trend">
    <div className="legend"><span><i style={{ background: SERIES.kits }} />3D kits created · {totals.kits}</span><span><i style={{ background: SERIES.orders }} />Orders placed · {totals.orders}</span></div>
    <div className="trend-plot">
      <svg ref={box} viewBox={`0 0 ${W} ${H}`} onPointerMove={move} onPointerLeave={() => setHover(null)} role="img" aria-label={`Kits and orders per day, last 30 days: ${totals.kits} kit${totals.kits === 1 ? '' : 's'}, ${totals.orders} order${totals.orders === 1 ? '' : 's'}`}>
        <defs><linearGradient id="kitFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={SERIES.kits} stopOpacity=".32" /><stop offset="1" stopColor={SERIES.kits} stopOpacity="0" /></linearGradient></defs>
        {[0, .25, .5, .75, 1].map(f => <g key={f}><line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} className="grid" /><text x={L - 8} y={y(top * f) + 4} textAnchor="end" className="tick">{top * f}</text></g>)}
        {points.map((pt, i) => (points.length - 1 - i) % 7 === 0 ? <text key={pt.day} x={x(i)} y={H - 6} textAnchor="middle" className="tick">{label(pt.day)}</text> : null)}
        <path d={area} fill="url(#kitFill)" />
        <path d={line('kits')} fill="none" stroke={SERIES.kits} strokeWidth="2" strokeLinejoin="round" />
        <path d={line('orders')} fill="none" stroke={SERIES.orders} strokeWidth="2" strokeLinejoin="round" />
        {p && hover !== null && <g><line x1={x(hover)} x2={x(hover)} y1={T} y2={y(0)} className="crosshair" />{(['kits', 'orders'] as const).map(k => <circle key={k} cx={x(hover)} cy={y(p[k])} r="4.5" fill={SERIES[k]} stroke="#071420" strokeWidth="2" />)}</g>}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" />
      </svg>
      {p && hover !== null && <div className="chart-tip" style={{ left: `${x(hover) / W * 100}%` }}><strong>{label(p.day)}</strong><span><i style={{ background: SERIES.kits }} />Kits <b>{p.kits}</b></span><span><i style={{ background: SERIES.orders }} />Orders <b>{p.orders}</b></span></div>}
    </div>
    <details className="table-view"><summary>View as table</summary><table className="admin-table compact"><thead><tr><th>Day</th><th>Kits</th><th>Orders</th></tr></thead><tbody>{points.filter(pt => pt.kits || pt.orders).map(pt => <tr key={pt.day}><td>{label(pt.day)}</td><td>{pt.kits}</td><td>{pt.orders}</td></tr>)}</tbody></table></details>
  </div>;
}

function ProjectsPanel({ catalog, onNotice }: { catalog: Catalog | null; onNotice: (text: string) => void }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [sport, setSport] = useState('');
  const { result, error, setPage, reload } = usePaged<AdminProject>('/admin/projects', { search: query, ...(status ? { status } : {}), ...(sport ? { sport } : {}) });
  const sportName = (id: string) => catalog?.sports.find(s => s.id === id)?.name ?? id;
  const garmentName = (id: string) => catalog?.garments.find(g => g.id === id)?.name ?? id;
  async function patch(p: AdminProject, body: Partial<AdminProject>, message: string) {
    try { await api(`/admin/projects/${p.id}`, { method: 'PATCH', body: JSON.stringify(body) }); onNotice(message); reload(); } catch (e) { onNotice((e as Error).message); }
  }
  return <section className="glow-panel admin-card">
    <div className="admin-toolbar"><h2><FolderOpen size={18} /> Projects {result && <small>{result.total}</small>}</h2>
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Project or customer" /></form>
      <select className="admin-select" value={sport} onChange={e => setSport(e.target.value)} aria-label="Filter by sport"><option value="">All sports</option>{catalog?.sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="">Drafts & approved</option><option value="draft">Drafts</option><option value="approved">Approved</option></select></div>
    {error && <p className="error-message">{error}</p>}
    {!result ? <div className="empty-state"><LoaderCircle className="spin" /></div> : <div className="project-cards">
      {result.data.map(p => <article key={p.id} className="project-card">
        <div className="project-thumb">{p.thumbnail ? <img src={p.thumbnail} alt="" loading="lazy" /> : <span>{garmentName(p.garment)}</span>}<span className={`status-pill s-${p.status === 'approved' ? 'delivered' : 'pending'}`}>{p.status === 'approved' ? 'Approved' : 'Draft'}</span></div>
        <h3>{p.name}</h3><p className="muted">{sportName(p.sport)} · {p.product_name || garmentName(p.garment)} · v{p.version}</p>
        <p className="cell-sub" title={[p.user?.name, p.user?.email].filter(Boolean).join(' · ')}>{p.user?.name} · {p.user?.email}</p>
        <p className="cell-sub">{p.orders_count} order{p.orders_count === 1 ? '' : 's'} · updated {date(p.updated_at)}</p>
        <div className="project-actions">
          <button className="button button-outline" onClick={() => patch(p, { status: p.status === 'approved' ? 'draft' : 'approved' }, p.status === 'approved' ? 'Moved back to draft.' : 'Kit approved.')}><CheckCircle2 size={14} /> {p.status === 'approved' ? 'Unapprove' : 'Approve'}</button>
          <button className="icon-button" aria-label={`Rename ${p.name}`} onClick={() => { const name = window.prompt('Project name', p.name)?.trim(); if (name && name !== p.name) void patch(p, { name }, 'Project renamed.'); }}><Pencil size={15} /></button>
          <button className="icon-button danger" aria-label={`Delete ${p.name}`} onClick={() => confirmDelete(`project “${p.name}”`, () => api(`/admin/projects/${p.id}`, { method: 'DELETE' }), () => { onNotice('Project deleted.'); reload(); }, onNotice)}><Trash2 size={15} /></button>
        </div>
      </article>)}
      {!result.data.length && <p className="muted">No projects found.</p>}
    </div>}
    {result && <Pager result={result} setPage={setPage} />}
  </section>;
}

function SettingsPanel({ state, onSaved, onNotice }: { state: ApiSettings | null; onSaved: (s: ApiSettings) => void; onNotice: (text: string) => void }) {
  const [key, setKey] = useState('');
  const [text, setText] = useState('');
  const [image, setImage] = useState('');
  /** Empty: design planning uses the text model, HD renders the image model. */
  const [planning, setPlanning] = useState('');
  const [hdImage, setHdImage] = useState('');
  /** Orders: the usual production and delivery time (a sooner date required gets a gentle warning). */
  const [lead, setLead] = useState('4');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState('');
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => { if (state) { setText(state.text_model); setImage(state.image_model); setPlanning(state.planning_model ?? ''); setHdImage(state.hd_image_model ?? ''); setLead(String(state.production_lead_weeks ?? 4)); } }, [state]);
  async function save(body: Record<string, unknown>, message: string) {
    setBusy('save'); setError(''); setTest(null);
    try { onSaved(await api<ApiSettings>('/admin/settings', { method: 'PUT', body: JSON.stringify(body) })); setKey(''); onNotice(message); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function runTest() { setBusy('test'); setTest(null); try { setTest(await api('/admin/settings/test', { method: 'POST' })); } catch (e) { setTest({ ok: false, message: (e as Error).message }); } finally { setBusy(null); } }
  if (!state) return <div className="empty-state"><LoaderCircle className="spin" /></div>;
  return <div className="admin-grid">
    <section className="glow-panel admin-card"><h2><PlugZap size={18} /> OpenAI connection</h2>
      <div className={`connection ${state.configured ? 'ok' : 'off'}`}>{state.configured ? <CheckCircle2 size={20} /> : <TriangleAlert size={20} />}<div><strong>{state.configured ? 'Key configured' : 'Not configured: AI features are off'}</strong><span>{state.configured ? `${state.masked_key} · from the ${state.source}` : 'The website falls back to simple non-AI designs.'}</span></div></div>
      <dl className="kv"><dt>Text model</dt><dd>{state.text_model}</dd><dt>Planning model</dt><dd>{state.planning_model || `${state.text_model} (text model)`}</dd><dt>Image model</dt><dd>{state.image_model}</dd><dt>HD image model</dt><dd>{state.hd_image_model || `${state.image_model} (image model)`}</dd></dl>
      <div className="project-actions"><button className="button button-gradient" disabled={!state.configured || busy !== null} onClick={runTest}>{busy === 'test' ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Test connection</button>
        {state.source === 'admin panel' && <button className="button button-outline" disabled={busy !== null} onClick={() => window.confirm('Remove the key saved in the admin panel? The .env key (if any) is used instead.') && save({ clear_key: true }, 'Saved key removed.')}><Trash2 size={15} /> Remove saved key</button>}</div>
      {test && <p className={test.ok ? 'success-message' : 'error-message'}>{test.message}</p>}
    </section>
    <section className="glow-panel admin-card"><h2><KeyRound size={18} /> Update settings</h2>
      <form className="admin-form" onSubmit={e => { e.preventDefault(); void save({ ...(key.trim() ? { openai_key: key.trim() } : {}), openai_text_model: text.trim(), openai_image_model: image.trim(), openai_planning_model: planning.trim(), openai_hd_image_model: hdImage.trim() }, 'API settings saved.'); }}>
        <label className="field">New OpenAI API key<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={state.configured ? 'Leave blank to keep the current key' : 'sk-…'} /><span className="field-hint">Stored encrypted on the server. It overrides the key in the .env file.</span></label>
        <div className="field-row"><label className="field">Text model<input value={text} onChange={e => setText(e.target.value)} /><span className="field-hint">3DEEZI ASSIST and quick edits.</span></label><label className="field">Planning model<input value={planning} onChange={e => setPlanning(e.target.value)} placeholder={`Same as the text model (${text || 'text model'})`} /><span className="field-hint">Plans the AI designer's four designs and the art direction.</span></label></div>
        <div className="field-row"><label className="field">Image model<input value={image} onChange={e => setImage(e.target.value)} /><span className="field-hint">The four designs and print sheets.</span></label><label className="field">HD image model<input value={hdImage} onChange={e => setHdImage(e.target.value)} placeholder={`Same as the image model (${image || 'image model'})`} /><span className="field-hint">HD primary, Make HD and the image editor.</span></label></div>
        {error && <p className="error-message">{error}</p>}
        <button className="button button-gradient full-width" disabled={busy !== null}>{busy === 'save' && <LoaderCircle className="spin" size={15} />}SAVE SETTINGS</button>
      </form>
    </section>
    <section className="glow-panel admin-card"><h2><Clock size={18} /> Orders</h2>
      <form className="admin-form" onSubmit={e => { e.preventDefault(); void save({ production_lead_weeks: Number(lead) }, 'Production lead time saved.'); }}>
        <label className="field">Production lead time (weeks)<input type="number" name="production_lead_weeks" min={0} max={52} step={1} required value={lead} onChange={e => setLead(e.target.value)} />
          <span className="field-hint">Upload Your Order and Create Order Form show a gentle warning when the date required is sooner (the order can still be sent). 0 turns the warning off.</span></label>
        <button className="button button-outline full-width" disabled={busy !== null}>SAVE LEAD TIME</button>
      </form>
    </section>
  </div>;
}

function DatabasePanel({ onNotice }: { onNotice: (text: string) => void }) {
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => { api<DbInfo>('/admin/database').then(setInfo).catch(e => onNotice(e.message)); }, [onNotice]);
  useEffect(load, [load]);
  async function run(name: string, task: () => Promise<void>) { setBusy(name); try { await task(); } catch (e) { onNotice((e as Error).message); } finally { setBusy(''); load(); } }
  if (!info) return <div className="empty-state"><LoaderCircle className="spin" /></div>;
  return <div className="admin-grid">
    <section className="glow-panel admin-card"><h2><Database size={18} /> Health</h2>
      <dl className="kv"><dt>Database</dt><dd>{info.driver.toUpperCase()}{info.size !== null ? ` · ${bytes(info.size)}` : ''}</dd><dt>Uploaded files</dt><dd>{bytes(info.uploads)}</dd><dt>PHP</dt><dd>{info.php}</dd><dt>Laravel</dt><dd>{info.laravel}</dd></dl>
      <table className="admin-table compact"><thead><tr><th>Table</th><th>Rows</th></tr></thead><tbody>{info.tables.map(t => <tr key={t.name}><td>{t.name}</td><td>{t.rows.toLocaleString()}</td></tr>)}</tbody></table>
    </section>
    <section className="glow-panel admin-card"><h2>Tools</h2>
      <div className="tool-row"><div><strong>Download a backup</strong><span>A full copy of the database file. Keep it somewhere safe.</span></div><button className="button button-gradient" disabled={!info.backup || !!busy} onClick={() => run('backup', async () => { saveBlob(await fetchFile('/admin/database/backup'), `3deezi-backup-${new Date().toISOString().slice(0, 10)}.sqlite`); onNotice('Backup downloaded.'); })}>{busy === 'backup' ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />} Backup</button></div>
      {!info.backup && <p className="field-hint">Backups from the panel need SQLite. For MySQL, use your host’s backup tool.</p>}
      <div className="tool-row"><div><strong>Clear caches</strong><span>Use after uploading new files or changing settings.</span></div><button className="button button-outline" disabled={!!busy} onClick={() => run('cache', async () => { await api('/admin/database/clear-cache', { method: 'POST' }); onNotice('Caches cleared.'); })}><RefreshCw size={15} /> Clear</button></div>
      <div className="tool-row"><div><strong>Remove expired sessions</strong><span>{info.expired_tokens} expired sign-in token{info.expired_tokens === 1 ? '' : 's'}.</span></div><button className="button button-outline" disabled={!!busy || !info.expired_tokens} onClick={() => run('tokens', async () => { const r = await api<{ message: string }>('/admin/database/prune-tokens', { method: 'POST' }); onNotice(r.message); })}><Trash2 size={15} /> Remove</button></div>
    </section>
  </div>;
}

function usePaged<T>(path: string, query: Record<string, string>) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<T> | null>(null);
  const [error, setError] = useState('');
  const key = JSON.stringify(query);
  const load = useCallback(() => {
    const params = new URLSearchParams({ ...JSON.parse(key), page: String(page) });
    api<Page<T>>(`${path}?${params}`).then(setResult).catch(e => setError(e.message));
  }, [path, key, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [key]);
  return { result, error, page, setPage, reload: load };
}

function Pager({ result, setPage }: { result: Page<unknown>; setPage: (n: number) => void }) {
  if (result.last_page <= 1) return null;
  return <div className="pager"><button className="icon-button" disabled={result.current_page <= 1} onClick={() => setPage(result.current_page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button><span>Page {result.current_page} of {result.last_page}</span><button className="icon-button" disabled={result.current_page >= result.last_page} onClick={() => setPage(result.current_page + 1)} aria-label="Next page"><ChevronRight size={16} /></button></div>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`modal compact-modal admin-modal${wide ? ' wide' : ''}`} onCancel={onClose}><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X /></button><h2>{title}</h2>{children}</dialog>;
}

async function confirmDelete(what: string, run: () => Promise<unknown>, onDone: () => void, onError: (m: string) => void) {
  if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return;
  try { await run(); onDone(); } catch (e) { onError((e as Error).message); }
}

function UsersPanel({ me, onNotice, onChanged }: { me: User; onNotice: (text: string) => void; onChanged?: () => void }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { result, error, page, setPage, reload } = usePaged<AdminUser>('/admin/users', { search: query });
  /** After "Remove test accounts": the list from its first page, and the menu's user count. */
  const removed = (message: string) => { onNotice(message); onChanged?.(); if (page !== 1) setPage(1); else reload(); };
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  return <section className="glow-panel admin-card">
    <div className="admin-toolbar"><h2><Users size={18} /> Users {result && <small>{result.total}</small>}</h2>
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email" /></form>
      <RemoveTestAccounts onRemoved={removed} />
      <button className="button button-gradient" onClick={() => setEditing('new')}><Plus size={16} /> Add user</button></div>
    {error && <p className="error-message">{error}</p>}
    {!result ? <div className="empty-state"><LoaderCircle className="spin" /></div> : <div className="table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Projects</th><th>Orders</th><th>Joined</th><th /></tr></thead><tbody>
      {result.data.map(u => <tr key={u.id}><td><strong>{u.name}</strong></td><td>{u.email}</td><td>{u.is_admin ? <span className="status-pill s-confirmed">Admin</span> : u.is_designer ? <span className="status-pill s-in_production">Designer</span> : <span className="muted">Customer</span>}{u.is_admin && u.is_designer && <> <span className="status-pill s-in_production">Designer</span></>}</td><td>{u.projects_count}</td><td>{u.orders_count}</td><td>{u.created_at ? date(u.created_at) : ''}</td>
        <td className="row-actions"><button className="icon-button" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}><Pencil size={15} /></button>{u.id !== me.id && <button className="icon-button danger" aria-label={`Delete ${u.name}`} onClick={() => confirmDelete(`${u.name} and all their projects and orders`, () => api(`/admin/users/${u.id}`, { method: 'DELETE' }), () => { onNotice('User deleted.'); reload(); }, onNotice)}><Trash2 size={15} /></button>}</td></tr>)}
      {!result.data.length && <tr><td colSpan={7} className="muted">No users found.</td></tr>}
    </tbody></table></div>}
    {result && <Pager result={result} setPage={setPage} />}
    {editing && <UserForm user={editing === 'new' ? null : editing} isMe={editing !== 'new' && editing.id === me.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onNotice('User saved.'); reload(); }} />}
  </section>;
}

function UserForm({ user, isMe, onClose, onSaved }: { user: AdminUser | null; isMe: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', password: '', is_admin: user?.is_admin ?? false, is_designer: user?.is_designer ?? false, designer_all: user?.designer_all ?? false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api(user ? `/admin/users/${user.id}` : '/admin/users', { method: user ? 'PATCH' : 'POST', body: JSON.stringify(form) }); onSaved(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={user ? `Edit ${user.name}` : 'Add a user'} onClose={onClose}><form onSubmit={submit} className="admin-form">
    <label className="field">Name<input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
    <label className="field">Email<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
    <label className="field">{user ? 'New password (leave blank to keep)' : 'Password'}<input type="password" minLength={8} required={!user} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
    <label className="toggle-row"><input type="checkbox" checked={form.is_admin} disabled={isMe} onChange={e => setForm({ ...form, is_admin: e.target.checked })} /><span><strong>Administrator</strong><small>{isMe ? 'You cannot remove your own admin access.' : 'Can open this admin panel and manage everything.'}</small></span></label>
    <label className="toggle-row"><input type="checkbox" checked={form.is_designer} onChange={e => setForm({ ...form, is_designer: e.target.checked, designer_all: e.target.checked && form.designer_all })} /><span><strong>3DEEZI TEAM designer</strong><small>Works on design requests assigned to them (Admin › 3DEEZI TEAM, or /designer for non-admins).</small></span></label>
    {form.is_designer && <label className="toggle-row"><input type="checkbox" checked={form.designer_all} onChange={e => setForm({ ...form, designer_all: e.target.checked })} /><span><strong>Sees every design request</strong><small>Off: only the requests assigned to them.</small></span></label>}
    {error && <p className="error-message">{error}</p>}
    <button className="button button-gradient full-width" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{user ? 'SAVE CHANGES' : 'ADD USER'}</button>
  </form></Modal>;
}

function OrdersPanel({ onNotice }: { onNotice: (text: string) => void }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [maker, setMaker] = useState('');
  const { result, error, setPage, reload } = usePaged<Order>('/admin/orders', { search: query, ...(status ? { status } : {}), ...(maker ? { supplier: maker } : {}) });
  const [editing, setEditing] = useState<Order | 'new' | null>(null);
  const navigate = useNavigate();
  async function quickStatus(order: Order, next: string) {
    try { await api(`/admin/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); onNotice(`${order.number} is now ${statusLabel(next).toLowerCase()}.`); reload(); }
    catch (e) { onNotice((e as Error).message); }
  }
  return <section className="glow-panel admin-card">
    <div className="admin-toolbar"><h2><Package size={18} /> Orders {result && <small>{result.total}</small>}</h2>
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Order number, customer or email" /></form>
      <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
      <MadeByFilter value={maker} onChange={setMaker} />
      <button className="button button-gradient" onClick={() => setEditing('new')}><Plus size={16} /> Add order</button></div>
    {error && <p className="error-message">{error}</p>}
    {!result ? <div className="empty-state"><LoaderCircle className="spin" /></div> : <div className="table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Kit</th><th>Sizes</th><th>Total</th><th>Status</th><th>Date</th><th /></tr></thead><tbody>
      {result.data.map(o => <tr key={o.id}><td><strong>{o.number}</strong><small className="cell-sub" data-testid="order-made-by">Made by {o.made_by || '3DEEZI'}</small></td><td>{o.user?.name}<small className="cell-sub">{o.user?.email}</small></td><td>{o.project ? <div className="order-kit"><Link to={`/admin/orders/${o.id}`} className="order-kit-thumb" aria-label={`View the kit of ${o.number}`}>{o.project.thumbnail ? <img src={o.project.thumbnail} alt="" loading="lazy" /> : <Package size={20} />}</Link><div><strong>{o.project.name}</strong><Link className="order-kit-link" to={`/admin/orders/${o.id}`}>View kit</Link></div></div> : <span className="muted">No kit</span>}</td><td>{o.quantity}<small className="cell-sub">{sizeSummary(o.sizes)}</small>{o.names === 'list' && o.players?.length ? <small className="cell-sub">{o.players.length} player{o.players.length === 1 ? '' : 's'}</small> : null}</td><td data-testid="order-total">{orderPrice(o)}{o.payment && o.payment.status !== 'quote_required' && <small className="cell-sub">{orderPill(o)[0]}{Number(o.payment.amount_paid) > 0 && o.payment.status !== 'paid' ? ` · ${aud(o.payment.amount_paid, o.payment.currency)} paid` : ''}</small>}</td>
        <td><select className={`status-select s-${o.status}`} value={o.status} onChange={e => quickStatus(o, e.target.value)} aria-label={`Status of ${o.number}`}>{STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></td><td>{date(o.created_at)}</td>
        <td className="row-actions"><button className="icon-button" onClick={() => navigate(`/admin/orders/${o.id}`)} aria-label={`View the kit of ${o.number}`} title="View kit"><Eye size={15} /></button><button className="icon-button" onClick={() => setEditing(o)} aria-label={`Edit ${o.number}`}><Pencil size={15} /></button><button className="icon-button danger" aria-label={`Delete ${o.number}`} onClick={() => confirmDelete(`order ${o.number}`, () => api(`/admin/orders/${o.id}`, { method: 'DELETE' }), () => { onNotice('Order deleted.'); reload(); }, onNotice)}><Trash2 size={15} /></button></td></tr>)}
      {!result.data.length && <tr><td colSpan={8} className="muted">No orders found.</td></tr>}
    </tbody></table></div>}
    {result && <Pager result={result} setPage={setPage} />}
    {editing && <OrderForm order={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onNotice('Order saved.'); reload(); }} />}
  </section>;
}

/** A kit as saved: the design may also hold the AI brief (prompt) and AI photo renders. */
type SavedDesign = Partial<Design> & { prompt?: string; renderFront?: string | null; renderBack?: string | null };
interface KitProject { id: number; name: string; sport: string; garment: string; mode?: string; status?: string; version?: number; thumbnail?: string | null; design?: SavedDesign; updated_at?: string }
interface KitOrder extends Omit<Order, 'project'> {
  project?: KitProject | null; /** The kit as it was ordered. */ design_snapshot?: Pick<KitProject, 'name' | 'sport' | 'garment' | 'mode' | 'design' | 'thumbnail'> | null;
  /** The order's invoice at a glance (OrderView::payment); null before it has one. */ payment?: Payment | null;
  /** The order form's garment rows (Create Order Form, an upload as AI read it); none for a Studio "Order this kit". */ items?: (OrderItem & { file_ids?: number[] })[] | null;
  /** The saved designs on those rows. */ item_projects?: KitProject[]; files?: OrderFile[];
}
/** The payment as the kit page's pill shows it: words and the colour class. */
const PAY_PILL: Record<string, [string, string]> = {
  paid: ['Paid', 'delivered'], part_paid: ['Part paid', 'confirmed'], awaiting_payment: ['Awaiting payment', 'pending'],
  quote_required: ['Quote pending', 'pending'], refunded: ['Refunded', 'cancelled'], cancelled: ['Invoice cancelled', 'cancelled'],
};
/** The pill: the invoice's payment; an older order without one: "Quote pending" until priced, else its status. */
function orderPill(order: Pick<KitOrder, 'payment' | 'total' | 'status'>): [string, string] {
  const pay = order.payment;
  if (pay) return PAY_PILL[pay.status] ?? [pay.label || 'Payment', 'pending'];
  return order.total === null || order.total === undefined || order.total === '' ? ['Quote pending', 'pending'] : [statusLabel(order.status), order.status];
}
/** The order's price in words: the invoice total (A$), "Quote pending", or the older orders' own total. */
function orderPrice(order: Pick<KitOrder, 'payment' | 'total' | 'currency'>): string {
  const pay = order.payment;
  if (pay) return pay.status === 'quote_required' || pay.total === null || pay.total === '' ? 'Quote pending' : aud(pay.total, pay.currency);
  return money(order.total, order.currency);
}
/** The back as printed for this order, for its pictures: the same name and number (or a list's first player), or none. */
function printedBack(order: KitOrder, d: SavedDesign): Partial<Design> {
  const mark = (key: string, hide: boolean) => ({ ...d.marks?.[key], hidden: hide || !!d.marks?.[key]?.hidden });
  const first = order.names === 'same' || order.names === 'list' ? order.players?.[0] : undefined;
  if (order.names === 'none') return { marks: { ...d.marks, top_name: mark('top_name', true), top_number: mark('top_number', true) } };
  return first ? { backName: first.name, number: first.number, marks: { ...d.marks, top_name: mark('top_name', !first.name), top_number: mark('top_number', !first.number) } } : {};
}
const ZONE_NAMES: Record<string, string> = { body: 'Body', yoke: 'Yoke', sleeves: 'Sleeves', sides: 'Sides', hem: 'Hem', pocket: 'Pocket', hood: 'Hood' };
/** A hoodie's own colour areas (design.zoneColors), as the Studio's HOODIE AREAS names them. */
const AREA_NAMES: Record<string, string> = { hood: 'Hood', lining: 'Hood lining', rib: 'Cuffs & waistband', pocket: 'Pocket', zip: 'Zip' };
const shownImage = (src?: string | null) => !!src && /^(data:image\/|https?:\/\/|\/)/.test(src);
const fileType = (src: string) => (src.startsWith('data:image/jpeg') ? 'jpg' : 'png');

/**
 * One order's kit, for production: large Front / Back / Kit pictures (front and back drawn by the 3D viewer from the
 * saved design, the kit picture is the 3D preview saved with it), the kit's details, colours with hex codes, pattern,
 * front text, back name and number, the AI brief, every size and quantity, and the customer's contact details.
 */
function OrderKit({ id, catalog, onNotice }: { id: number; catalog: Catalog | null; onNotice: (text: string) => void }) {
  const [order, setOrder] = useState<KitOrder | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState<{ label: string; src: string } | null>(null);
  const [shots, setShots] = useState<{ front?: string; back?: string; side?: string; state: 'drawing' | 'done' | 'failed' }>({ state: 'drawing' });
  const viewer = useRef<KitViewerHandle>(null);
  const load = useCallback(() => { api<KitOrder>(`/admin/orders/${id}`).then(o => { setOrder(o); setError(''); }).catch(e => setError((e as Error).message)); }, [id]);
  useEffect(load, [load]);
  // The kit as ordered (kept with the order, so later edits don't change it); older orders show the kit as it is now.
  const current = order?.project ?? null, kept = order?.design_snapshot ?? null;
  const project: KitProject | null = kept ? { ...current, ...kept, id: current?.id ?? 0, version: order?.project_version ?? current?.version, updated_at: current?.updated_at } : current;
  const d: SavedDesign = project?.design ?? {};
  // A different kit (or a newer save of it): draw its pictures again.
  useEffect(() => { setShots({ state: 'drawing' }); }, [project?.id, project?.updated_at]);
  const design = useMemo<Design | null>(() => (project && order ? { ...defaultDesign, ...project.design, garment: project.garment as Design['garment'], ...printedBack(order, project.design ?? {}) } : null), [project?.id, project?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  // The order form's garments, one by one (several styles, or rows without the ordered kit): each with its own design
  // picture or artwork, name, colours and fit, sizes and players. A Studio "Order this kit" order has no rows.
  const items = order?.items ?? [];
  const perGarment = items.length > 1 || (items.length === 1 && (!project || items[0].project_id !== project.id));
  const garments = useMemo(() => {
    if (!order || !perGarment) return [];
    // The ordered kit as it was ordered; the other rows' designs as they are now.
    const projects = [...(order.item_projects ?? []).filter(p => p.id !== project?.id), ...(project ? [project] : [])] as unknown as Project[];
    return reviewGarmentsFrom({ items, projects, artwork: artworkOf(order.files), options: catalog ? { sports: catalog.sports, garments: catalog.garments } : null });
  }, [order, perGarment, project?.id, project?.updated_at, catalog]); // eslint-disable-line react-hooks/exhaustive-deps
  // One matching kit (a top and shorts of one design) still shows the kit's own Front / Back / Kit pictures.
  const showPictures = !!project && (!garments.length || reviewLayoutFor(order) === 'kit');
  // Drawn one at a time, after the kit's own pictures (one 3D viewer at a time).
  const mockups = useGarmentMockups(garments, perGarment && !(showPictures && shots.state === 'drawing'));
  async function draw() {
    try {
      const front = await viewer.current!.capture('front'), back = await viewer.current!.capture('back');
      const side = project?.thumbnail ? undefined : await viewer.current!.capture('side');
      setShots({ front, back, side, state: 'done' });
    } catch { setShots({ state: 'failed' }); }
  }
  /** The customer's factory print layout file, as they uploaded it. */
  async function downloadLayout(layout: NonNullable<Design['layout']>) {
    try { saveBlob(await fetchFile(`/assets/${layout.asset}/file`), layout.name); }
    catch (e) { onNotice((e as Error).message); }
  }
  async function setStatus(next: string) {
    if (!order) return;
    try { await api(`/admin/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); onNotice(`${order.number} is now ${statusLabel(next).toLowerCase()}.`); load(); }
    catch (e) { onNotice((e as Error).message); }
  }
  const back = <Link to="/admin/orders" className="button button-outline"><ArrowLeft size={15} /> Back to orders</Link>;
  if (error) return <section className="glow-panel admin-card">{back}<p className="error-message">{error}</p></section>;
  if (!order) return <div className="empty-state"><LoaderCircle className="spin" /> Loading the order…</div>;
  const sportName = project ? catalog?.sports.find(s => s.id === project.sport)?.name ?? project.sport : '';
  const garmentName = project ? project.design?.productName || (catalog?.garments.find(g => g.id === project.garment)?.name ?? project.garment) : '';
  const approved = project?.status === 'approved';
  // Changed after ordering: the project is at a newer version than the one ordered.
  const changed = !!(kept && current && order.project_version && (current.version ?? 0) > order.project_version);
  const sameBack = order.names === 'same' ? order.players?.[0] : undefined;
  const backText = (designed?: string, printed?: string) => order.names === 'none' ? 'None' : order.names === 'list' ? 'One for each player (see Names and numbers)' : (order.names === 'same' ? printed : designed) || '—';
  const pictures: [string, string | undefined | null][] = project ? [['Front', shots.front], ['Back', shots.back], ['Kit', project.thumbnail || shots.side]] : [];
  if (shownImage(d.renderFront)) pictures.push(['AI front render', d.renderFront]);
  if (shownImage(d.renderBack)) pictures.push(['AI back render', d.renderBack]);
  const colours: [string, string | undefined][] = [['Main', d.main], ['Secondary', d.secondary], ['Accent', d.accent], ['Pattern colour', d.patternColor], ...(d.gradient ? [['Gradient from', d.gradient.from], ['Gradient to', d.gradient.to]] as [string, string][] : []),
    // The varsity jacket: every VARSITY AREA as the kit shows it; a hoodie: the areas given their own colour.
    ...(project?.garment === 'varsity' ? varsityAreas.map(a => [a.label, varsityColour(d, a.key)] as [string, string]) : project?.garment === 'trackjacket' ? trackAreas.map(a => [trackAreaLabel(a.key, d.trackStyle), trackColour(d, a.key)] as [string, string]) : Object.entries(d.zoneColors ?? {}).filter(([, c]) => typeof c === 'string' && c).map(([area, c]) => [AREA_NAMES[area] ?? area, c] as [string, string]))];
  const zones = Object.entries(d.zones ?? {}).filter(([, v]) => v && v !== 'None');
  const layers = d.layers ?? [];
  const ordered = SIZES.filter(s => (order.sizes[s] ?? 0) > 0);
  const pill = orderPill(order);
  const pay = order.payment ?? null;
  // The invoice's rows (Invoice, Total, Paid, Amount due) once priced; older orders: their unit price and total.
  const priceRows: [string, string][] = pay && pay.status !== 'quote_required' ? priceRowsFromPayment(pay).map(([k, v]) => [k === 'Total' ? 'Order total' : k, v])
    : pay ? [['Invoice', `${pay.invoice_number ?? '—'} · ${pay.label}`], ['Unit price', 'Quote pending'], ['Order total', 'Quote pending']]
    : [['Unit price', money(order.unit_price, order.currency)], ['Order total', money(order.total, order.currency)]];
  if (pay && pay.status !== 'quote_required' && order.unit_price) priceRows.splice(1, 0, ['Unit price', money(order.unit_price, order.currency)]);
  // Names and numbers given on the garment rows (an upload as AI read it, the Create Order Form).
  const rowPlayers = garments.length ? garments.flatMap(g => (g.players ?? []).map(p => ({ ...p, garment: g.name })))
    : items.flatMap(it => (it.players ?? []).filter(p => p && (p.name || p.number || p.size)).map(p => ({ ...p, garment: it.name ?? it.garment })));
  const playerGarments = new Set(rowPlayers.map(p => p.garment)).size;
  const usedBy = project ? items.map((it, i) => (it.project_id === project.id ? i + 1 : 0)).filter(Boolean) : [];
  const editButton = <button className="button button-gradient" onClick={() => setEditing(true)}><Pencil size={15} /> Edit order, price or status</button>;

  return <div className="kit-page">
    <section className="glow-panel admin-card">
      <div className="kit-head">
        {back}
        <h2>{order.number}</h2>
        <span className={`status-pill s-${pill[1]}`} data-testid="kit-pill">{pill[0]}</span>
        <span className="muted">Placed {date(order.created_at)} · {order.quantity} garment{order.quantity === 1 ? '' : 's'} · {orderPrice(order)}</span>
        <div className="kit-head-actions">
          <select className={`status-select s-${order.status}`} value={order.status} onChange={e => setStatus(e.target.value)} aria-label={`Status of ${order.number}`}>{STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
          {editButton}
        </div>
      </div>
    </section>

    {/* An uploaded order form as 3DEEZI AI read it (garments, sizes, players), with the original file one click away. */}
    <OrderFormReading files={order.files ?? []} onError={onNotice} />

    {garments.length > 0 && <section className="glow-panel admin-card kit-garments" data-testid="kit-garments">
      <div className="card-head"><h2>Garments</h2><ReviewSummaryChip garments={garments} /></div>
      <div className="orm-sections">{garments.map((g, i) => <GarmentReviewSection key={g.key} garment={g} index={i} mockup={mockups.shots[i]} staff />)}</div>
      {mockups.renderer}
    </section>}

    {project ? <>
      <section className="glow-panel admin-card">
        <div className="card-head"><h2>{project.name}</h2>{current ? <span className={`status-pill s-${approved ? 'delivered' : 'pending'}`}>{approved ? 'Approved' : 'Draft'}</span> : <span className="status-pill s-cancelled">Project deleted</span>}</div>
        {changed && <p className="kit-note"><TriangleAlert size={16} /> The customer changed this kit after ordering (it is now v{current!.version}). This page shows v{order.project_version}, as ordered.</p>}
        {kept && !current && <p className="kit-note"><TriangleAlert size={16} /> The customer deleted this kit after ordering. This page shows it as ordered.</p>}
        {!showPictures && <p className="kit-note"><TriangleAlert size={16} /> This order lists its garments one by one: these are the details of the design “{project.name}”{usedBy.length ? ` (garment ${usedBy.join(', ')})` : ''}. Each garment's own pictures, sizes and players are under Garments above.</p>}
        {showPictures && <div className="kit-shots">{pictures.map(([label, src]) => <figure key={label}>
          {src ? <button className="kit-shot" onClick={() => setZoom({ label, src })} aria-label={`Show the ${label.toLowerCase()} picture larger`}><img src={src} alt={`${label} of ${project.name}`} /></button>
            : shots.state === 'drawing' ? <div className="kit-shot wait"><LoaderCircle className="spin" /> Drawing the {label.toLowerCase()}…</div>
            : <div className="kit-shot none">{shots.state === 'failed' ? 'The 3D picture could not be drawn on this computer.' : 'No picture saved.'}</div>}
          <figcaption>{label}{src && <a className="icon-button" href={src} download={`${order.number}-${label.toLowerCase().replace(/\s+/g, '-')}.${fileType(src)}`} aria-label={`Download the ${label.toLowerCase()} picture`} title="Download"><Download size={14} /></a>}</figcaption>
        </figure>)}</div>}
      </section>

      <div className="admin-grid">
        <section className="glow-panel admin-card"><h2>Kit details</h2><dl className="kit-dl">
          <dt>Sport</dt><dd>{sportName}</dd>
          <dt>Garment</dt><dd>{d.layout ? (d.layout.parts ?? ['raglan']).map(p => p === 'shorts' ? 'Shorts' : 'Raglan top').join(' and ') : garmentName}</dd>
          {d.layout && <><dt>Print layout</dt><dd>{d.layout.name} <button className="icon-button" onClick={() => void downloadLayout(d.layout!)} aria-label={`Download the print layout ${d.layout.name}`} title="Download the print layout"><Download size={14} /></button><small>{(n => `${n} panel${n === 1 ? '' : 's'}`)(d.layout.roles.filter(r => r !== 'none').length)} on the kit{d.layout.hemFold !== false ? ' · hem folds sewn inside' : ''}</small></dd></>}
          <dt>Version</dt><dd>{order.project_version ? <>Ordered version v{order.project_version}{changed && <small>Changed after ordering: now v{current!.version}</small>}</> : `v${project.version ?? 1}`}</dd>
          <dt>Status</dt><dd>{approved ? 'Approved' : 'Draft'}</dd>
          <dt>Designed with</dt><dd>{project.mode === 'ai' ? 'AI designer' : 'Design your own'}</dd>
          {project.updated_at && <><dt>Last saved</dt><dd>{date(project.updated_at)}</dd></>}
        </dl></section>
        <section className="glow-panel admin-card"><h2>Colours</h2><ul className="kit-colours">
          {colours.filter(([, c]) => c).map(([name, c]) => <li key={name}><i style={{ background: c }} /><span>{name}</span><code>{c!.toUpperCase()}</code></li>)}
        </ul></section>
        <section className="glow-panel admin-card"><h2>Pattern and text</h2><dl className="kit-dl">
          <dt>Fabric</dt><dd>{fabricLabel({ ...d, garment: d.garment ?? project?.garment })}</dd>
          <dt>Pattern</dt><dd>{d.pattern || '—'}{zones.length > 0 && <small>{zones.map(([z, p]) => `${ZONE_NAMES[z] ?? z}: ${/^(data:image\/|\/|https?:)/.test(String(p)) ? 'My pattern' : p}`).join(' · ')}</small>}</dd>
          {shownImage(d.patternImage) && <><dt>Print pattern</dt><dd><img className="kit-mini" src={d.patternImage!} alt="The kit's print pattern" /></dd></>}
          <dt>Front text</dt><dd>{d.logoText || '—'}</dd>
          {shownImage(d.logoImage) && <><dt>Logo</dt><dd><img className="kit-mini" src={d.logoImage!} alt="Logo" /></dd></>}
          {shownImage(d.sponsorImage) && <><dt>Sponsor</dt><dd><img className="kit-mini" src={d.sponsorImage!} alt="Sponsor logo" /></dd></>}
          <dt>Back name</dt><dd>{backText(d.backName, sameBack?.name)}</dd>
          <dt>Back number</dt><dd>{backText(d.number, sameBack?.number)}</dd>
          {layers.length > 0 && <><dt>Artwork</dt><dd>{layers.map(l => `${l.type === 'text' ? `“${l.text ?? ''}”` : l.name || (l.type === 'image' ? 'Picture' : 'Shape')} (${l.side}${l.part === 'shorts' ? ', shorts' : ''})`).join(' · ')}</dd></>}
        </dl></section>
        <section className="glow-panel admin-card"><h2><Sparkles size={18} /> AI brief</h2>
          {d.prompt ? <p className="kit-brief">“{d.prompt}”</p> : <p className="muted">No AI brief: this kit was designed by hand.</p>}
        </section>
      </div>
    </> : garments.length > 0 ? null : <section className="glow-panel admin-card"><h2>No kit</h2><p className="muted">No kit is linked to this order. Use “Edit order, price or status” to choose one of the customer's kits.</p></section>}

    <div className="admin-grid">
      <section className="glow-panel admin-card"><h2>Sizes and quantities{garments.length > 1 ? ' (all garments)' : ''}</h2>
        <table className="admin-table compact kit-sizes"><thead><tr><th>Size</th><th>Quantity</th></tr></thead>
          <tbody>{ordered.map(s => <tr key={s}><td>{s}</td><td>{order.sizes[s]}</td></tr>)}</tbody>
          <tfoot><tr><td>Total</td><td>{order.quantity}</td></tr>{priceRows.map(([k, v]) => <tr key={k} data-testid="kit-price-row"><td>{k}</td><td>{v}</td></tr>)}</tfoot>
        </table>
      </section>
      <section className="glow-panel admin-card"><h2>Customer</h2><dl className="kit-dl">
        <dt>Account</dt><dd>{order.user?.name ?? '—'}{order.user?.email && <small><a href={`mailto:${order.user.email}`}>{order.user.email}</a></small>}</dd>
        <dt>Contact</dt><dd>{order.contact_name}</dd>
        <dt>Made by</dt><dd data-testid="kit-made-by">{order.made_by || '3DEEZI'}</dd>
        <dt>Phone</dt><dd>{order.phone ? <a href={`tel:${order.phone.replace(/[^\d+]/g, '')}`}>{order.phone}</a> : '—'}</dd>
        <dt>Date required</dt><dd>{order.needed_by ? new Date(`${order.needed_by}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</dd>
        <dt>Delivery address</dt><dd className="kit-pre">{order.shipping_address || '—'}</dd>
        <dt>Notes</dt><dd className="kit-pre">{order.notes || '—'}</dd>
        {order.admin_notes && <><dt>Internal notes</dt><dd className="kit-pre">{order.admin_notes}</dd></>}
      </dl></section>
    </div>

    <section className="glow-panel admin-card"><h2>Names and numbers</h2>
      {order.names === 'list' && order.players ? <>
        <p className="muted">A different name and number for each player · {order.players.length} player{order.players.length === 1 ? '' : 's'}</p>
        <div className="table-wrap"><table className="admin-table compact kit-players"><thead><tr><th>#</th><th>Name</th><th>Number</th><th>Size</th></tr></thead>
          <tbody>{order.players.map((p, i) => <tr key={i}><td>{i + 1}</td><td>{p.name || '—'}</td><td>{p.number || '—'}</td><td>{p.size}</td></tr>)}</tbody></table></div>
      </> : order.names === 'same' ? <dl className="kit-dl"><dt>Choice</dt><dd>The same on every shirt</dd><dt>Name</dt><dd>{sameBack?.name || '—'}</dd><dt>Number</dt><dd>{sameBack?.number || '—'}</dd></dl>
        : order.names === 'none' ? <p>No name or number on the back.</p>
        : rowPlayers.length ? <>
          <p className="muted">Given with the garments · {rowPlayers.length} player{rowPlayers.length === 1 ? '' : 's'}</p>
          <div className="table-wrap"><table className="admin-table compact kit-players" data-testid="kit-row-players"><thead><tr><th>#</th>{playerGarments > 1 && <th>Garment</th>}<th>Name</th><th>Number</th><th>Size</th></tr></thead>
            <tbody>{rowPlayers.map((p, i) => <tr key={i}><td>{i + 1}</td>{playerGarments > 1 && <td>{p.garment}</td>}<td>{p.name || '—'}</td><td>{p.number || '—'}</td><td>{p.size || '—'}</td></tr>)}</tbody></table></div>
        </>
        : <p className="muted">Not given with this order. Check the notes.</p>}
    </section>

    <div className="kit-foot">{back}{editButton}</div>
    {editing && <OrderForm order={order as Order} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onNotice('Order saved.'); load(); }} />}
    {zoom && <Modal title={`${order.number} · ${zoom.label}`} wide onClose={() => setZoom(null)}><div className="kit-zoom"><img src={zoom.src} alt={`${zoom.label} of ${project?.name ?? 'the kit'}`} /></div></Modal>}
    {design && showPictures && shots.state === 'drawing' && <div className="kit-capture" aria-hidden><KitViewer ref={viewer} design={design} onReady={draw} /></div>}
  </div>;
}

function OrderForm({ order, onClose, onSaved }: { order: Order | null; onClose: () => void; onSaved: () => void }) {
  const [userId, setUserId] = useState<number | ''>(order?.user_id ?? '');
  const [customers, setCustomers] = useState<AdminUser[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [form, setForm] = useState({ project_id: order?.project_id ?? '' as number | '', status: order?.status ?? 'pending', unit_price: order?.unit_price ?? '', contact_name: order?.contact_name ?? '', phone: order?.phone ?? '', shipping_address: order?.shipping_address ?? '', notes: order?.notes ?? '', admin_notes: order?.admin_notes ?? '' });
  const [madeBy, setMadeBy] = useState<number | ''>(order?.supplier_id ?? '');
  const [sizes, setSizes] = useState<Record<string, number>>(() => Object.fromEntries(SIZES.map(s => [s, order?.sizes[s] ?? 0])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!order) api<Page<AdminUser>>(`/admin/users?per_page=50&search=${encodeURIComponent(customerSearch)}`).then(r => setCustomers(r.data)).catch(() => {}); }, [order, customerSearch]);
  useEffect(() => { if (userId) api<{ projects: { id: number; name: string }[] }>(`/admin/users/${userId}`).then(u => setProjects(u.projects)).catch(() => setProjects([])); else setProjects([]); }, [userId]);
  const quantity = Object.values(sizes).reduce((a, b) => a + (Number(b) || 0), 0);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const body = { ...form, project_id: form.project_id || null, unit_price: form.unit_price === '' ? null : Number(form.unit_price), sizes: Object.fromEntries(Object.entries(sizes).filter(([, n]) => n > 0)), ...(order ? {} : { user_id: userId }),
      // Made by: only sent when changed (an older order without one stays as it is).
      ...(madeBy !== (order?.supplier_id ?? '') ? { supplier_id: madeBy || null } : {}) };
    try { await api(order ? `/admin/orders/${order.id}` : '/admin/orders', { method: order ? 'PATCH' : 'POST', body: JSON.stringify(body) }); onSaved(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={order ? `Edit ${order.number}` : 'Add an order'} onClose={onClose}><form onSubmit={submit} className="admin-form">
    {order ? <p className="muted">Customer: <strong>{order.user?.name}</strong> ({order.user?.email})</p> : <div className="field-row"><label className="field">Find customer<input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Name or email" /></label><label className="field">Customer<select required value={userId} onChange={e => { setUserId(e.target.value ? Number(e.target.value) : ''); setForm(f => ({ ...f, project_id: '' })); }}><option value="">Choose…</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.email}</option>)}</select></label></div>}
    <div className="field-row"><label className="field">Kit (project)<select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value ? Number(e.target.value) : '' })}><option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="field">Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label></div>
    <MadeBySelect value={madeBy} onChange={setMadeBy} />
    <SizeFields sizes={sizes} disabled={order?.names === 'list'} legend={<>Quantities by size · {quantity} total{order?.names === 'list' ? ' · counted from the players list' : ''}</>} onChange={(s, n) => setSizes({ ...sizes, [s]: n })} />
    <div className="field-row"><label className="field">Unit price (A$)<input type="number" min={0} step="0.01" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} placeholder="Quote pending" /></label><label className="field">Total<input readOnly value={form.unit_price === '' ? 'Quote pending' : money(Number(form.unit_price) * quantity)} /></label></div>
    <div className="field-row"><label className="field">Contact name<input required maxLength={120} value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></label><label className="field">Phone<input maxLength={40} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label></div>
    <label className="field">Shipping address<textarea rows={2} maxLength={1000} value={form.shipping_address} onChange={e => setForm({ ...form, shipping_address: e.target.value })} /></label>
    <label className="field">Customer notes<textarea rows={2} maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
    <label className="field">Internal notes (admins only)<textarea rows={2} maxLength={2000} value={form.admin_notes} onChange={e => setForm({ ...form, admin_notes: e.target.value })} /></label>
    {error && <p className="error-message">{error}</p>}
    <button className="button button-gradient full-width" disabled={busy || quantity < 1 || (!order && !userId)}>{busy && <LoaderCircle className="spin" size={16} />}{order ? 'SAVE ORDER' : 'ADD ORDER'}</button>
  </form></Modal>;
}

function PartnersPanel({ onNotice }: { onNotice: (text: string) => void }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const { result, error, setPage, reload } = usePaged<Partner>('/admin/partners', { search: query, ...(status ? { status } : {}) });
  async function setPartnerStatus(p: Partner, next: string) {
    try { await api(`/admin/partners/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); onNotice(`${p.company} is now ${next}.`); reload(); }
    catch (e) { onNotice((e as Error).message); }
  }
  const site = (url: string) => /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return <section className="glow-panel admin-card">
    <div className="admin-toolbar"><h2><Handshake size={18} /> Partner applications {result && <small>{result.total}</small>}</h2>
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Company, name or email" /></form>
      <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{PARTNER_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></div>
    {error && <p className="error-message">{error}</p>}
    {!result ? <div className="empty-state"><LoaderCircle className="spin" /></div> : <div className="table-wrap"><table className="admin-table"><thead><tr><th>Company</th><th>Contact</th><th>Message</th><th>Status</th><th>Date</th><th /></tr></thead><tbody>
      {result.data.map(p => <tr key={p.id}><td><strong>{p.company}</strong>{p.website && <small className="cell-sub"><a href={site(p.website)} target="_blank" rel="noreferrer noopener">{p.website}</a></small>}</td>
        <td>{p.name}<small className="cell-sub"><a href={`mailto:${p.email}`}>{p.email}</a>{p.phone ? ` · ${p.phone}` : ''}</small></td>
        <td className="cell-message">{p.message || <span className="muted">—</span>}</td>
        <td><select className={`status-select s-${p.status === 'live' ? 'delivered' : p.status === 'declined' ? 'cancelled' : p.status === 'new' ? 'pending' : 'confirmed'}`} value={p.status} onChange={e => setPartnerStatus(p, e.target.value)} aria-label={`Status of ${p.company}`}>{PARTNER_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></td>
        <td>{date(p.created_at)}</td>
        <td className="row-actions"><button className="icon-button danger" aria-label={`Delete ${p.company}`} onClick={() => confirmDelete(`application from ${p.company}`, () => api(`/admin/partners/${p.id}`, { method: 'DELETE' }), () => { onNotice('Application deleted.'); reload(); }, onNotice)}><Trash2 size={15} /></button></td></tr>)}
      {!result.data.length && <tr><td colSpan={6} className="muted">No partner applications yet.</td></tr>}
    </tbody></table></div>}
    {result && <Pager result={result} setPage={setPage} />}
  </section>;
}
