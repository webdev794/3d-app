import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Database, Download, ExternalLink, FolderOpen, Handshake, KeyRound, LayoutDashboard, LoaderCircle, LogOut, Package, Pencil, PlugZap, Plus, RefreshCw, Search, ShieldCheck, Trash2, TriangleAlert, Users, X } from 'lucide-react';
import { api, fetchFile, media, saveBlob, type Catalog, type User } from '../api';

export interface AdminUser extends User { is_admin: boolean; projects_count?: number; orders_count?: number }
export interface Order {
  id: number; number: string; user_id: number; project_id: number | null; status: string; sizes: Record<string, number>;
  quantity: number; unit_price: string | null; total: string | null; currency: string; contact_name: string; phone: string | null;
  shipping_address: string | null; notes: string | null; admin_notes?: string | null; created_at: string;
  user?: { id: number; name: string; email: string }; project?: { id: number; name: string; sport: string; garment: string } | null;
}
interface AdminProject { id: number; name: string; sport: string; garment: string; mode: string; status: 'draft' | 'approved'; version: number; thumbnail: string | null; updated_at: string; orders_count: number; user?: { id: number; name: string; email: string } }
interface Page<T> { data: T[]; current_page: number; last_page: number; total: number }
interface TrendPoint { day: string; kits: number; orders: number }
interface Stats { partners: number; new_partners: number; users: number; admins: number; projects: number; orders: number; approved: number; quotes: number; garments: number; revenue: number; by_status: Record<string, number>; recent: Order[]; trend: TrendPoint[]; sports: { sport: string; count: number }[] }
interface Partner { id: number; company: string; name: string; email: string; phone: string | null; website: string | null; message: string | null; status: string; created_at: string }
const PARTNER_STATUSES = ['new', 'contacted', 'onboarding', 'live', 'declined'];
interface ApiSettings { configured: boolean; source: string; masked_key: string | null; text_model: string; image_model: string }
interface DbInfo { driver: string; size: number | null; uploads: number; tables: { name: string; rows: number }[]; expired_tokens: number; php: string; laravel: string; backup: boolean }

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Kids'];
export const STATUSES = ['pending', 'confirmed', 'in_production', 'shipped', 'delivered', 'cancelled'];
export const statusLabel = (s: string) => s.replace('_', ' ').replace(/^./, c => c.toUpperCase());
const money = (v: string | number | null, currency = 'AUD') => v === null || v === '' ? 'Quote pending' : new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(Number(v));
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
  { id: 'partners', label: 'Partners', icon: Handshake, title: 'Corporate partners', sub: 'Companies applying to bring 3DEEZI to their website.' },
  { id: 'database', label: 'Database Tools', icon: Database, title: 'Database tools', sub: 'Backups, housekeeping and health.' },
] as const;

/** The admin console: dashboard, API settings, users, projects, orders and database tools. */
export default function AdminPage({ me, onNotice, onLogout, catalog }: { me: User; onNotice: (text: string) => void; onLogout: () => void; catalog: Catalog | null }) {
  const { section = 'dashboard' } = useParams();
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
      <nav onClick={() => setMenu(false)}>{sections.map(s => <NavLink key={s.id} to={s.id === 'dashboard' ? '/admin' : `/admin/${s.id}`} end className={({ isActive }) => isActive || (s.id === 'dashboard' && section === 'dashboard') ? 'active' : ''}>
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
        {section === 'users' ? <UsersPanel me={me} onNotice={onNotice} />
          : section === 'orders' ? <OrdersPanel onNotice={onNotice} />
          : section === 'projects' ? <ProjectsPanel catalog={catalog} onNotice={onNotice} />
          : section === 'settings' ? <SettingsPanel state={apiState} onSaved={setApiState} onNotice={onNotice} />
          : section === 'partners' ? <PartnersPanel onNotice={onNotice} />
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
    ['3D kits approved', stats.approved, `of ${stats.projects} projects`],
    ['Quotes to price', stats.quotes, 'pending orders without a price'],
    ['Confirmed orders', money(stats.revenue), `${stats.garments} garments ordered`],
  ] as const;
  const totalKits = stats.sports.reduce((a, s) => a + s.count, 0);
  return <>
    <div className="console-shortcuts"><button className="button button-outline" onClick={() => navigate('/admin/settings')}><PlugZap size={15} /> API settings {apiState && <i className={apiState.configured ? 'dot ok' : 'dot off'} />}</button><button className="button button-gradient" onClick={() => navigate('/admin/projects')}><FolderOpen size={15} /> View projects</button></div>
    <div className="stat-tiles four">{tiles.map(([label, value, note]) => <div key={label} className="stat-tile glow-panel"><strong>{value}</strong><span>{label}</span><small>{note}</small></div>)}</div>
    <div className="admin-grid wide-left">
      <section className="glow-panel admin-card"><div className="card-head"><h2>3D kit production & orders trend</h2><span className="muted">Last 30 days</span></div><TrendChart points={stats.trend} /></section>
      <section className="glow-panel admin-card"><div className="card-head"><h2>Sport popularity breakdown</h2><span className="muted">{stats.sports.length} sport{stats.sports.length === 1 ? '' : 's'}</span></div>
        {stats.sports.length ? <ul className="sport-bars">{stats.sports.map(s => <li key={s.sport} title={`${s.sport}: ${s.count} kits`}><span>{s.sport}</span><b>{Math.round(s.count / totalKits * 100)}%</b><i><em style={{ width: `${s.count / stats.sports[0].count * 100}%` }} /></i></li>)}</ul> : <p className="muted">No projects yet.</p>}</section>
    </div>
    <div className="admin-grid">
      <section className="glow-panel admin-card"><h2>Orders by status</h2><ul className="status-bars">{STATUSES.map(s => { const n = stats.by_status[s] ?? 0; return <li key={s}><span className={`status-pill s-${s}`}>{statusLabel(s)}</span><i style={{ width: `${stats.orders ? n / stats.orders * 100 : 0}%` }} /><b>{n}</b></li>; })}</ul></section>
      <section className="glow-panel admin-card"><h2>Latest orders</h2>{stats.recent.length ? <ul className="recent-orders">{stats.recent.map(o => <li key={o.id}><strong>{o.number}</strong><span>{o.user?.name} · {o.quantity} items</span><span className={`status-pill s-${o.status}`}>{statusLabel(o.status)}</span></li>)}</ul> : <p className="muted">No orders yet.</p>}<NavLink className="button button-outline" to="/admin/orders">Manage orders</NavLink></section>
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
      <svg ref={box} viewBox={`0 0 ${W} ${H}`} onPointerMove={move} onPointerLeave={() => setHover(null)} role="img" aria-label={`Kits and orders per day, last 30 days: ${totals.kits} kits, ${totals.orders} orders`}>
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
        <h3>{p.name}</h3><p className="muted">{sportName(p.sport)} · {garmentName(p.garment)} · v{p.version}</p>
        <p className="cell-sub">{p.user?.name} · {p.user?.email}</p>
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
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState('');
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => { if (state) { setText(state.text_model); setImage(state.image_model); } }, [state]);
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
      <dl className="kv"><dt>Text model</dt><dd>{state.text_model}</dd><dt>Image model</dt><dd>{state.image_model}</dd></dl>
      <div className="project-actions"><button className="button button-gradient" disabled={!state.configured || busy !== null} onClick={runTest}>{busy === 'test' ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Test connection</button>
        {state.source === 'admin panel' && <button className="button button-outline" disabled={busy !== null} onClick={() => window.confirm('Remove the key saved in the admin panel? The .env key (if any) is used instead.') && save({ clear_key: true }, 'Saved key removed.')}><Trash2 size={15} /> Remove saved key</button>}</div>
      {test && <p className={test.ok ? 'success-message' : 'error-message'}>{test.message}</p>}
    </section>
    <section className="glow-panel admin-card"><h2><KeyRound size={18} /> Update settings</h2>
      <form className="admin-form" onSubmit={e => { e.preventDefault(); void save({ ...(key.trim() ? { openai_key: key.trim() } : {}), openai_text_model: text.trim(), openai_image_model: image.trim() }, 'API settings saved.'); }}>
        <label className="field">New OpenAI API key<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={state.configured ? 'Leave blank to keep the current key' : 'sk-…'} /><span className="field-hint">Stored encrypted on the server. It overrides the key in the .env file.</span></label>
        <div className="field-row"><label className="field">Text model<input value={text} onChange={e => setText(e.target.value)} /></label><label className="field">Image model<input value={image} onChange={e => setImage(e.target.value)} /></label></div>
        {error && <p className="error-message">{error}</p>}
        <button className="button button-gradient full-width" disabled={busy !== null}>{busy === 'save' && <LoaderCircle className="spin" size={15} />}SAVE SETTINGS</button>
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="modal compact-modal admin-modal" onCancel={onClose}><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X /></button><h2>{title}</h2>{children}</dialog>;
}

async function confirmDelete(what: string, run: () => Promise<unknown>, onDone: () => void, onError: (m: string) => void) {
  if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return;
  try { await run(); onDone(); } catch (e) { onError((e as Error).message); }
}

function UsersPanel({ me, onNotice }: { me: User; onNotice: (text: string) => void }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { result, error, setPage, reload } = usePaged<AdminUser>('/admin/users', { search: query });
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  return <section className="glow-panel admin-card">
    <div className="admin-toolbar"><h2><Users size={18} /> Users {result && <small>{result.total}</small>}</h2>
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email" /></form>
      <button className="button button-gradient" onClick={() => setEditing('new')}><Plus size={16} /> Add user</button></div>
    {error && <p className="error-message">{error}</p>}
    {!result ? <div className="empty-state"><LoaderCircle className="spin" /></div> : <div className="table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Projects</th><th>Orders</th><th>Joined</th><th /></tr></thead><tbody>
      {result.data.map(u => <tr key={u.id}><td><strong>{u.name}</strong></td><td>{u.email}</td><td>{u.is_admin ? <span className="status-pill s-confirmed">Admin</span> : <span className="muted">Customer</span>}</td><td>{u.projects_count}</td><td>{u.orders_count}</td><td>{u.created_at ? date(u.created_at) : ''}</td>
        <td className="row-actions"><button className="icon-button" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}><Pencil size={15} /></button>{u.id !== me.id && <button className="icon-button danger" aria-label={`Delete ${u.name}`} onClick={() => confirmDelete(`${u.name} and all their projects and orders`, () => api(`/admin/users/${u.id}`, { method: 'DELETE' }), () => { onNotice('User deleted.'); reload(); }, onNotice)}><Trash2 size={15} /></button>}</td></tr>)}
      {!result.data.length && <tr><td colSpan={7} className="muted">No users found.</td></tr>}
    </tbody></table></div>}
    {result && <Pager result={result} setPage={setPage} />}
    {editing && <UserForm user={editing === 'new' ? null : editing} isMe={editing !== 'new' && editing.id === me.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onNotice('User saved.'); reload(); }} />}
  </section>;
}

function UserForm({ user, isMe, onClose, onSaved }: { user: AdminUser | null; isMe: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', password: '', is_admin: user?.is_admin ?? false });
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
    {error && <p className="error-message">{error}</p>}
    <button className="button button-gradient full-width" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{user ? 'SAVE CHANGES' : 'ADD USER'}</button>
  </form></Modal>;
}

function OrdersPanel({ onNotice }: { onNotice: (text: string) => void }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const { result, error, setPage, reload } = usePaged<Order>('/admin/orders', { search: query, ...(status ? { status } : {}) });
  const [editing, setEditing] = useState<Order | 'new' | null>(null);
  async function quickStatus(order: Order, next: string) {
    try { await api(`/admin/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); onNotice(`${order.number} is now ${statusLabel(next).toLowerCase()}.`); reload(); }
    catch (e) { onNotice((e as Error).message); }
  }
  return <section className="glow-panel admin-card">
    <div className="admin-toolbar"><h2><Package size={18} /> Orders {result && <small>{result.total}</small>}</h2>
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Order number, customer or email" /></form>
      <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
      <button className="button button-gradient" onClick={() => setEditing('new')}><Plus size={16} /> Add order</button></div>
    {error && <p className="error-message">{error}</p>}
    {!result ? <div className="empty-state"><LoaderCircle className="spin" /></div> : <div className="table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Kit</th><th>Sizes</th><th>Total</th><th>Status</th><th>Date</th><th /></tr></thead><tbody>
      {result.data.map(o => <tr key={o.id}><td><strong>{o.number}</strong></td><td>{o.user?.name}<small className="cell-sub">{o.user?.email}</small></td><td>{o.project?.name ?? <span className="muted">—</span>}</td><td>{o.quantity}<small className="cell-sub">{sizeSummary(o.sizes)}</small></td><td>{money(o.total, o.currency)}</td>
        <td><select className={`status-select s-${o.status}`} value={o.status} onChange={e => quickStatus(o, e.target.value)} aria-label={`Status of ${o.number}`}>{STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></td><td>{date(o.created_at)}</td>
        <td className="row-actions"><button className="icon-button" onClick={() => setEditing(o)} aria-label={`Edit ${o.number}`}><Pencil size={15} /></button><button className="icon-button danger" aria-label={`Delete ${o.number}`} onClick={() => confirmDelete(`order ${o.number}`, () => api(`/admin/orders/${o.id}`, { method: 'DELETE' }), () => { onNotice('Order deleted.'); reload(); }, onNotice)}><Trash2 size={15} /></button></td></tr>)}
      {!result.data.length && <tr><td colSpan={8} className="muted">No orders found.</td></tr>}
    </tbody></table></div>}
    {result && <Pager result={result} setPage={setPage} />}
    {editing && <OrderForm order={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onNotice('Order saved.'); reload(); }} />}
  </section>;
}

function OrderForm({ order, onClose, onSaved }: { order: Order | null; onClose: () => void; onSaved: () => void }) {
  const [userId, setUserId] = useState<number | ''>(order?.user_id ?? '');
  const [customers, setCustomers] = useState<AdminUser[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [form, setForm] = useState({ project_id: order?.project_id ?? '' as number | '', status: order?.status ?? 'pending', unit_price: order?.unit_price ?? '', contact_name: order?.contact_name ?? '', phone: order?.phone ?? '', shipping_address: order?.shipping_address ?? '', notes: order?.notes ?? '', admin_notes: order?.admin_notes ?? '' });
  const [sizes, setSizes] = useState<Record<string, number>>(() => Object.fromEntries(SIZES.map(s => [s, order?.sizes[s] ?? 0])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!order) api<Page<AdminUser>>(`/admin/users?per_page=50&search=${encodeURIComponent(customerSearch)}`).then(r => setCustomers(r.data)).catch(() => {}); }, [order, customerSearch]);
  useEffect(() => { if (userId) api<{ projects: { id: number; name: string }[] }>(`/admin/users/${userId}`).then(u => setProjects(u.projects)).catch(() => setProjects([])); else setProjects([]); }, [userId]);
  const quantity = Object.values(sizes).reduce((a, b) => a + (Number(b) || 0), 0);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const body = { ...form, project_id: form.project_id || null, unit_price: form.unit_price === '' ? null : Number(form.unit_price), sizes: Object.fromEntries(Object.entries(sizes).filter(([, n]) => n > 0)), ...(order ? {} : { user_id: userId }) };
    try { await api(order ? `/admin/orders/${order.id}` : '/admin/orders', { method: order ? 'PATCH' : 'POST', body: JSON.stringify(body) }); onSaved(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={order ? `Edit ${order.number}` : 'Add an order'} onClose={onClose}><form onSubmit={submit} className="admin-form">
    {order ? <p className="muted">Customer: <strong>{order.user?.name}</strong> ({order.user?.email})</p> : <div className="field-row"><label className="field">Find customer<input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Name or email" /></label><label className="field">Customer<select required value={userId} onChange={e => { setUserId(e.target.value ? Number(e.target.value) : ''); setForm(f => ({ ...f, project_id: '' })); }}><option value="">Choose…</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.email}</option>)}</select></label></div>}
    <div className="field-row"><label className="field">Kit (project)<select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value ? Number(e.target.value) : '' })}><option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="field">Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label></div>
    <fieldset className="size-grid"><legend>Quantities by size · {quantity} total</legend>{SIZES.map(s => <label key={s}><span>{s}</span><input type="number" min={0} max={10000} value={sizes[s] || ''} placeholder="0" onChange={e => setSizes({ ...sizes, [s]: Math.max(0, Number(e.target.value) || 0) })} /></label>)}</fieldset>
    <div className="field-row"><label className="field">Unit price (AUD)<input type="number" min={0} step="0.01" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} placeholder="Quote pending" /></label><label className="field">Total<input readOnly value={form.unit_price === '' ? 'Quote pending' : money(Number(form.unit_price) * quantity)} /></label></div>
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
