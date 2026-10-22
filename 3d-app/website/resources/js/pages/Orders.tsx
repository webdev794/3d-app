import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardPaste, LoaderCircle, Package, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { api, type Project, type User } from '../api';
import { SIZES, SizeFields, statusLabel, type BackNames, type Order, type Player } from './Admin';
import { sizeGroups, siteSize } from '../orderSizes';
import '../../css/orders.css';

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
        {orders.map(o => <tr key={o.id}><td><strong>{o.number}</strong></td><td>{o.project?.name ?? '—'}</td><td>{o.quantity}<small className="cell-sub">{Object.entries(o.sizes).map(([s, n]) => `${s}×${n}`).join(' · ')}</small>{o.names === 'list' && o.players?.length ? <small className="cell-sub">{o.players.length} player{o.players.length === 1 ? '' : 's'}</small> : null}</td><td>{money(o.total, o.currency)}</td><td><span className={`status-pill s-${o.status}`}>{statusLabel(o.status)}</span></td><td>{new Date(o.created_at).toLocaleDateString('en-AU')}</td></tr>)}
      </tbody></table></div>}
  </div>;
}

const MAX_PLAYERS = 300;
/** The sample name a new design starts with: the customer types the real one when ordering. */
const isPlaceholder = (name: string) => name.trim().toUpperCase() === 'YOUR NAME';
/** A size in a spreadsheet cell ("m", "XXL", "10y", "W12", "kids"), or null (orderSizes.ts siteSize). */
const sizeOf = (cell: string) => { const found = siteSize(cell); return found && SIZES.includes(found) ? found : null; };

/**
 * Players pasted from Excel: one per line, cells split by tabs (or commas or semicolons). The size and the number
 * (up to 3 digits) are found in any column, the rest is the name. A heading line is skipped.
 */
function parsePlayers(text: string): Player[] {
  const players: Player[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(line.includes('\t') ? '\t' : /[,;]/).map(c => c.trim().replace(/^"(.*)"$/, '$1').trim()).filter(Boolean);
    if (!cells.length) continue;
    let sizeAt = -1, numberAt = -1;
    cells.forEach((c, i) => { if (sizeOf(c)) sizeAt = i; });
    cells.forEach((c, i) => { if (i !== sizeAt && /^#?\d{1,3}$/.test(c)) numberAt = i; });
    const name = cells.filter((_, i) => i !== sizeAt && i !== numberAt).join(' ');
    if (sizeAt < 0 && numberAt < 0 && /\b(names?|numbers?|no|sizes?|players?)\b/i.test(name)) continue;
    players.push({ name, number: numberAt < 0 ? '' : cells[numberAt].replace('#', ''), size: sizeAt < 0 ? '' : sizeOf(cells[sizeAt])! });
  }
  return players;
}

/** What is wrong with one player's row, or null. */
function rowProblem(p: Player) {
  if (isPlaceholder(p.name)) return 'change YOUR NAME to the player’s name.';
  if (!p.name.trim() && !p.number) return 'add a name or a number.';
  if (p.name.trim().length > 40) return 'a name can be up to 40 characters.';
  if (!/^\d{0,3}$/.test(p.number)) return 'the number is digits only, up to 3.';
  if (!p.size) return 'choose a size.';
  return null;
}

const CHOICES: [BackNames, string][] = [['same', 'The same on every shirt'], ['list', 'A different name and number for each player'], ['none', 'No name or number on the back']];
type Row = Player & { key: number; size: string };
let lastKey = 0;
const newRow = (p: Partial<Player> = {}): Row => ({ key: ++lastKey, name: p.name ?? '', number: p.number ?? '', size: p.size ?? '' });
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 3);
const shownImage = (src: unknown): src is string => typeof src === 'string' && /^(data:image\/|https?:\/\/|\/)/.test(src);

/**
 * Order a saved kit: sizes, the design confirmed as final (with its saved pictures), the names and numbers on the
 * back (the same on every shirt, a list with one per player, or none), contact and delivery.
 */
export function OrderKitDialog({ projectId, projectName, user, onClose, onOrdered }: { projectId: number; projectName: string; user: User; onClose: () => void; onOrdered: (order: Order) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const [kit, setKit] = useState<Project | null>(null);
  const [kitState, setKitState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [final, setFinal] = useState(false);
  const [names, setNames] = useState<BackNames | null>(null);
  const [same, setSame] = useState({ name: '', number: '' });
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  // The list was changed by hand: pasted players are added to the rows with a name or number (otherwise they replace
  // the starting rows).
  const [edited, setEdited] = useState(false);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [paste, setPaste] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [tried, setTried] = useState(false);
  const [form, setForm] = useState({ contact_name: user.name, phone: '', shipping_address: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The kit as saved: its pictures and version, and the design's back name and number to start from.
  useEffect(() => {
    api<Project>(`/projects/${projectId}`).then(p => {
      setKit(p); setKitState('ready');
      const back = { name: p.design.backName ?? '', number: digits(String(p.design.number ?? '')) };
      setSame(s => (s.name || s.number ? s : back));
      setRows(r => (r.length === 1 && !r[0].name && !r[0].number && !r[0].size ? [newRow(back)] : r));
    }).catch(() => setKitState('failed'));
  }, [projectId]);

  const list = names === 'list';
  const counted = useMemo(() => { const c: Record<string, number> = {}; for (const r of rows) if (r.size) c[r.size] = (c[r.size] ?? 0) + 1; return c; }, [rows]);
  const shown = list ? counted : sizes;
  const quantity = Object.values(shown).reduce((a, b) => a + b, 0);
  // The saved pictures: the 3D preview (or the AI front render) and the AI back render.
  const design = kit?.design as (Project['design'] & { renderFront?: string | null; renderBack?: string | null }) | undefined;
  const shots: [string, string][] = [];
  const front = kit?.thumbnail || design?.renderFront, backShot = design?.renderBack;
  if (shownImage(front)) shots.push(['Front', front]);
  if (shownImage(backShot)) shots.push(['Back', backShot]);

  function problem(): string | null {
    if (!list && quantity < 1) return 'Add at least one garment to the order.';
    if (!final) return 'Tick “This design is final” to place the order.';
    if (!names) return 'Choose what goes on the back: the same name and number on every shirt, one for each player, or none.';
    if (names === 'same') {
      if (isPlaceholder(same.name)) return 'Change YOUR NAME to the name to print on every shirt.';
      if (!same.name.trim() && !same.number) return 'Add the name or the number to print, or choose “No name or number on the back”.';
    }
    if (list) {
      if (!rows.length) return 'Add the players’ names and numbers.';
      if (rows.length > MAX_PLAYERS) return `A list can have up to ${MAX_PLAYERS} players.`;
      for (const [i, r] of rows.entries()) { const wrong = rowProblem(r); if (wrong) return `Player ${i + 1}: ${wrong}`; }
    }
    if (!form.contact_name.trim()) return 'Add a contact name.';
    return null;
  }
  const wrong = tried ? problem() : null;

  /** A list starts with one row for each garment already counted above, the first with the design's name and number. */
  function chooseNames(value: BackNames) {
    setNames(value);
    if (value !== 'list' || edited) return;
    const back = { name: kit?.design.backName ?? '', number: digits(String(kit?.design.number ?? '')) };
    const wanted = SIZES.flatMap(s => Array.from({ length: sizes[s] ?? 0 }, () => s)).slice(0, MAX_PLAYERS);
    setRows(wanted.length ? wanted.map((size, i) => newRow(i ? { size } : { ...back, size })) : [newRow(back)]);
  }
  function setRow(key: number, patch: Partial<Row>) { setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r))); setEdited(true); }
  function addRow() { const row = newRow({ size: rows.at(-1)?.size }); setRows(rs => [...rs, row]); setFocusKey(row.key); setEdited(true); }
  function removeRow(key: number) { setRows(rs => rs.filter(r => r.key !== key)); setEdited(true); }
  function addPasted() {
    const found = parsePlayers(paste ?? '');
    if (!found.length) { setPasted('No players found. Put one player on each line: name, number, size.'); return; }
    const kept = edited ? rows.filter(r => r.name.trim() || r.number) : [];
    const added = found.slice(0, Math.max(0, MAX_PLAYERS - kept.length));
    setRows([...kept, ...added.map(p => newRow(p))]); setEdited(true); setPaste(null);
    const noSize = added.filter(p => !p.size).length, left = found.length - added.length;
    setPasted(`Added ${added.length} player${added.length === 1 ? '' : 's'}.${noSize ? ` Choose a size for ${noSize} of them.` : ''}${left ? ` The list is full at ${MAX_PLAYERS}: ${left} not added.` : ''}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setTried(true); setError('');
    if (problem()) return;
    setBusy(true);
    const players = names === 'same' ? [{ name: same.name.trim(), number: same.number }] : list ? rows.map(({ name, number, size }) => ({ name: name.trim(), number, size })) : null;
    const body = { ...form, project_id: projectId, design_final: true, names, ...(players ? { players } : {}), ...(kit ? { project_version: kit.version } : {}), sizes: Object.fromEntries(Object.entries(shown).filter(([, n]) => n > 0)) };
    try { onOrdered(await api<Order>('/orders', { method: 'POST', body: JSON.stringify(body) })); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return <dialog ref={ref} className="modal compact-modal admin-modal" onCancel={onClose}><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X /></button>
    <span className="eyebrow">ORDER THIS KIT</span><h2>{projectName}</h2><p className="muted">Tell us the sizes and what goes on the back. We’ll confirm the price and timing before anything is made.</p>
    <form onSubmit={submit} className="admin-form" noValidate>
      <SizeFields sizes={shown} disabled={list} legend={<>Quantities by size · {quantity} total{list ? ' · counted from the players list' : ''}</>} onChange={(s, n) => setSizes({ ...sizes, [s]: n })} />

      <div className={`order-final${tried && !final ? ' invalid' : ''}`}>
        {kitState === 'loading' ? <p className="order-wait"><LoaderCircle className="spin" size={14} /> Loading the kit’s pictures…</p>
          : shots.length > 0 && <div className="order-shots">{shots.map(([label, src]) => <figure key={label}><img src={src} alt={`${label} of ${projectName}`} /><figcaption>{label}</figcaption></figure>)}</div>}
        <label className="order-check"><input type="checkbox" checked={final} onChange={e => setFinal(e.target.checked)} /><span><strong>This design is final</strong><small>We make the kit as it is saved{kit ? ` (version ${kit.version})` : ''}. To change it, close this and edit it in the Studio first.</small></span></label>
      </div>

      <fieldset className={`order-names${tried && !names ? ' invalid' : ''}`}><legend>Names and numbers on the back</legend>
        {CHOICES.map(([value, label]) => <label key={value} className={`order-choice${names === value ? ' on' : ''}`}><input type="radio" name="order-names" value={value} checked={names === value} onChange={() => chooseNames(value)} /><span>{label}</span></label>)}
        {names === 'same' && <div className="order-same">
          <label className="order-input">Name<input maxLength={40} value={same.name} onChange={e => setSame({ ...same, name: e.target.value })} placeholder="SMITH" aria-invalid={isPlaceholder(same.name)} /></label>
          <label className="order-input">Number<input inputMode="numeric" maxLength={3} value={same.number} onChange={e => setSame({ ...same, number: digits(e.target.value) })} placeholder="7" /></label>
          {isPlaceholder(same.name) && <p className="order-warn"><TriangleAlert size={14} /> YOUR NAME is the sample name on the design. Type the name to print on every shirt, or clear it for no name.</p>}
        </div>}
        {list && <div className="order-players">
          <div className="order-player head" aria-hidden><span>Name</span><span>Number</span><span>Size</span><span /></div>
          {rows.map((r, i) => <div key={r.key} className={`order-player${tried && rowProblem(r) ? ' invalid' : ''}`}>
            <input aria-label={`Player ${i + 1} name`} maxLength={40} value={r.name} placeholder="Name" autoFocus={r.key === focusKey} onChange={e => setRow(r.key, { name: e.target.value })} />
            <input aria-label={`Player ${i + 1} number`} inputMode="numeric" maxLength={3} value={r.number} placeholder="No." onChange={e => setRow(r.key, { number: digits(e.target.value) })} />
            <select aria-label={`Player ${i + 1} size`} value={r.size} onChange={e => setRow(r.key, { size: e.target.value })}><option value="">Size</option>{r.size && !SIZES.includes(r.size) && <option value={r.size}>{r.size}</option>}{sizeGroups(SIZES).map(g => <optgroup key={g.fit} label={`${g.name} sizes`}>{g.sizes.map(s => <option key={s} value={s}>{s}</option>)}</optgroup>)}</select>
            <button type="button" className="icon-button" onClick={() => removeRow(r.key)} aria-label={`Remove player ${i + 1}`} title="Remove"><Trash2 size={15} /></button>
          </div>)}
          {isPlaceholder(rows[0]?.name ?? '') && <p className="order-warn"><TriangleAlert size={14} /> YOUR NAME is the sample name on the design. Type the player’s name instead.</p>}
          <div className="order-player-actions">
            <button type="button" className="button button-outline" onClick={addRow} disabled={rows.length >= MAX_PLAYERS}><Plus size={15} /> Add a player</button>
            <button type="button" className="button button-outline" onClick={() => { setPaste(''); setPasted(''); }}><ClipboardPaste size={15} /> Paste from Excel</button>
          </div>
          {paste !== null && <div className="order-paste">
            <textarea autoFocus rows={5} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'SMITH, 7, M\nJONES, 10, L'} aria-label="Players to paste" />
            <p className="field-hint">Copy the name, number and size columns in Excel and paste them here: one player on each line.</p>
            <div className="order-player-actions"><button type="button" className="button button-gradient" onClick={addPasted} disabled={!paste.trim()}>Add these players</button><button type="button" className="button button-secondary" onClick={() => setPaste(null)}>Cancel</button></div>
          </div>}
          {pasted && <p className="field-hint" role="status">{pasted}</p>}
          <p className="field-hint">{rows.length} player{rows.length === 1 ? '' : 's'} · the sizes above are counted from this list.</p>
        </div>}
      </fieldset>

      <div className="field-row"><label className="field">Contact name<input required maxLength={120} value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></label><label className="field">Phone<input maxLength={40} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label></div>
      <label className="field">Delivery address<textarea rows={2} maxLength={1000} value={form.shipping_address} onChange={e => setForm({ ...form, shipping_address: e.target.value })} /></label>
      <label className="field">Notes<textarea rows={2} maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Deadline, anything we should know" /></label>
      {(wrong || error) && <p className="error-message" role="alert">{wrong || error}</p>}
      <button className="button button-gradient full-width" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}SEND ORDER REQUEST · {quantity} ITEM{quantity === 1 ? '' : 'S'}</button>
    </form></dialog>;
}
