import { AlertTriangle, FileDown, FileSpreadsheet, Link2, Check, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { media } from '../api';
import { orderApi, type AssistantGroup, type AssistantOrder } from '../orderApi';
import '../../css/order-assistant.css';

const FITS = [['youth', 'KIDS'], ['womens', 'WOMEN'], ['mens', 'MEN']] as const;
const label = (fit: string, size: string) => (fit === 'womens' ? `${size.slice(1)}W` : size);

/**
 * The share link page of a collated order (task TL-3; as the client's example): /orders/summary/{token}. The totals,
 * the table by design / colour, each design's picture and size tables, and the check list; the PDF and the Excel to
 * download. Anyone with the link can open it (no sign-in), as a link shared with a team.
 */
export default function OrderSummaryPage() {
  const { token = '' } = useParams();
  const [order, setOrder] = useState<AssistantOrder | null>(null);
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { orderApi.assistantOrder(token).then(setOrder).catch(() => setMissing(true)); }, [token]);

  if (missing) return <main className="os-page"><section className="os-empty"><h1>Order summary not found</h1><p>The link may be wrong or the summary removed.</p><Link to="/orders/assistant">Start an order</Link></section></main>;
  if (!order?.analysis) return <main className="os-page"><p className="os-loading">Loading the order summary…</p></main>;
  const a = order.analysis;
  const garments = Object.keys(a.totals.by_garment);
  const name = (g: string) => ({ polo: 'Polo', singlet: 'Singlet', tee: 'Tee', jersey: 'Jersey', shorts: 'Shorts', hoodie: 'Hoodie', jacket: 'Jacket', pants: 'Track pants', socks: 'Socks', cap: 'Cap', warmup: 'Warm-up top' } as Record<string, string>)[g] ?? 'Other';
  const tiles: [string, number, boolean?][] = [['Total garments', a.totals.garments], ...Object.entries(a.totals.by_product).slice(0, 3).map(([k, v]) => [k.replace(/^Line Uniform /, 'Line ') + 's', v] as [string, number]), ['To check', a.totals.to_check, true]];
  async function copy() { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* */ } }

  return <main className="os-page" data-testid="order-summary">
    <header className="os-head">
      <img src={order.made_by.logo_url || media('images/brand-final.png')} alt={order.made_by.name} />
      <div><h1>{order.title || 'Order'}</h1><p>Order Form &amp; Production Breakdown · Made by {order.made_by.name}</p></div>
      <div className="os-head-actions">
        <a href={order.links.pdf} className="os-btn"><FileDown size={17} /> PDF</a>
        <a href={order.links.xlsx} className="os-btn"><FileSpreadsheet size={17} /> Excel</a>
        <button type="button" className="os-btn" onClick={copy}>{copied ? <Check size={17} /> : <Link2 size={17} />} {copied ? 'Copied' : 'Copy link'}</button>
      </div>
    </header>
    <section className="os-tiles">{tiles.map(([t, v, warn]) => <div key={t} className={warn ? 'is-warn' : ''}><small>{t}</small><b>{v}</b></div>)}</section>
    <p className="os-summary">{order.summary}</p>

    <section className="os-block"><h2>By design / colour</h2>
      <div className="os-scroll"><table className="os-table">
        <thead><tr><th>Design – colour</th>{garments.map(g => <th key={g}>{name(g)}</th>)}<th>Total</th><th>Lines</th><th>To check</th></tr></thead>
        <tbody>{a.groups.map(g => <tr key={g.key}><th style={{ background: g.colour ?? '#2f6fd6' }}><a href={`#g-${g.key}`}>{g.design}</a></th>
          {garments.map(x => { const n = g.garments.filter(r => r.garment === x).reduce((s, r) => s + r.total, 0); return <td key={x}>{n || '·'}</td>; })}
          <td><b>{g.total}</b></td><td>{g.lines}</td><td className={g.check_lines ? 'is-warn' : ''}>{g.check_lines}</td></tr>)}</tbody>
        <tfoot><tr><th>GRAND TOTAL</th>{garments.map(g => <td key={g}>{a.totals.by_garment[g]}</td>)}<td><b>{a.totals.garments}</b></td><td>{a.totals.lines}</td><td>{a.totals.to_check}</td></tr></tfoot>
      </table></div>
    </section>

    {a.groups.map(g => <GroupBlock key={g.key} g={g} order={order} />)}

    <section className="os-block"><h2><AlertTriangle size={20} /> Check list</h2>
      {a.checks.length ? <ul className="os-checks">{a.checks.map((c, i) => <li key={i} className={c.counts === false ? 'is-info' : ''}>{c.text}
        {c.people && c.people.length > 0 && <details><summary>{c.people.length} {c.people.length === 1 ? 'person' : 'people'}</summary><ul>{c.people.map(p => <li key={p}>{p}</li>)}</ul></details>}
      </li>)}</ul> : <p>Nothing to check: every line was read.</p>}
    </section>
    <p className="os-foot"><Sparkles size={15} /> Collated by the 3DEEZI Order Assistant · <Link to="/orders/assistant">Start your own order</Link></p>
  </main>;
}

function GroupBlock({ g, order }: { g: AssistantGroup; order: AssistantOrder }) {
  const cols = order.analysis!.size_columns;
  const picture = order.designs.find(d => d.name === g.image);
  return <section className="os-block os-group" id={`g-${g.key}`} style={{ '--g': g.colour ?? '#2f6fd6' } as React.CSSProperties}>
    <h2 className="os-group-head">{g.design}</h2>
    <div className="os-group-body">
      <div className="os-picture">{picture ? <img src={picture.url} alt={`${g.design} design`} /> : <span>No design picture added</span>}</div>
      <div className="os-counts">{g.garments.map(r => <div key={r.name}><small>{r.name}</small><b>{r.total}</b></div>)}
        <div><small>Order lines</small><b>{g.lines}</b></div><div className={g.check_lines ? 'is-warn' : ''}><small>Lines to check</small><b>{g.check_lines}</b></div></div>
    </div>
    <div className="os-scroll">{FITS.map(([fit, title]) => {
      const sizes = cols[fit];
      if (!sizes.length || !g.garments.some(r => Object.values(r.sizes[fit]).some(n => n > 0))) return null;
      return <table key={fit} className="os-table os-sizes">
        <thead><tr><th>{title}</th>{sizes.map(s => <th key={s}>{label(fit, s)}</th>)}<th>Total</th></tr></thead>
        <tbody>{g.garments.map(r => <tr key={r.name}><th>{r.name}</th>{sizes.map(s => <td key={s}>{r.sizes[fit][s] || '·'}</td>)}<td><b>{Object.values(r.sizes[fit]).reduce((x, y) => x + y, 0) || '·'}</b></td></tr>)}</tbody>
      </table>;
    })}</div>
  </section>;
}
