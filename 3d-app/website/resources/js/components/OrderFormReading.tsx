import { useState } from 'react';
import { ChevronDown, ChevronUp, CircleAlert, Download, Sparkles } from 'lucide-react';
import { orderApi, type OrderFile, type Suggested } from '../orderApi';
import '../../css/order-form-read.css';

/**
 * Staff: an uploaded order form as 3DEEZI AI read it (client 2026-10-22), next to the original file (one click to
 * download): the garments with their sizes as the site counts them and as written on the form (10Y, 12Y ... are counted
 * in Kids), the players with their sizes as written, the date and delivery on the form, notes, and the lines it could not
 * place. It is the reading when the customer reviewed it; the order's own rows are what they confirmed.
 */
export default function OrderFormReading({ files, onError }: { files: OrderFile[]; onError?: (message: string) => void }) {
  const read = files.filter(f => f.kind === 'order_form' && f.meta?.suggested?.items?.length);
  if (!read.length) return null;
  return <>{read.map(f => <Reading key={f.id} file={f} reading={f.meta!.suggested!} onError={onError} />)}</>;
}

function Reading({ file, reading, onError }: { file: OrderFile; reading: Suggested; onError?: (message: string) => void }) {
  const [open, setOpen] = useState(true);
  const form = reading.form;
  const total = reading.items.reduce((a, it) => a + Object.values(it.sizes).reduce((x, n) => x + (Number(n) || 0), 0), 0);
  const address = form ? Object.values(form.address ?? {}).filter(Boolean).join(', ') : '';
  const facts: [string, string][] = form ? ([['Team', form.team_name], ['Contact', [form.contact_name, form.contact_email, form.phone].filter(Boolean).join(' · ')],
    ['Date required', [form.needed_by, form.needed_by_text].filter(Boolean).join(' · ')], ['Delivery', [form.delivery === 'pickup' ? 'Pick up' : form.delivery === 'deliver' ? 'Deliver' : '', address].filter(Boolean).join(': ')],
    ['Notes', form.notes]] as [string, string][]).filter(([, v]) => v) : [];
  return <section className="ofr-staff" data-testid="order-form-reading">
    <header>
      <Sparkles size={17} />
      <div><strong>{reading.source === 'ai' ? 'Order form read by 3DEEZI AI' : 'Order form as read on upload'}</strong>
        <small>{file.name}{reading.read_at ? ` · ${new Date(reading.read_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''} · {total} garment{total === 1 ? '' : 's'}{reading.players ? ` · ${reading.players} players` : ''}</small></div>
      <button type="button" className="ofr-add" onClick={() => void orderApi.download(file).catch(e => onError?.((e as Error).message))} aria-label={`Download the original ${file.name}`}><Download size={14} /> Original file</button>
      <button type="button" className="ofr-icon" aria-expanded={open} aria-label={open ? 'Hide the reading' : 'Show the reading'} onClick={() => setOpen(v => !v)}>{open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>
    </header>
    {open && <>
      {facts.length > 0 && <dl className="ofr-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      <div className="ofr-staff-table"><table><thead><tr><th>Garment</th><th>Sizes</th><th>As written on the form</th><th>Total</th></tr></thead><tbody>
        {reading.items.map((it, i) => { const detail = reading.details?.[i]; return <tr key={i}>
          <td>{it.name || it.label || it.garment}{it.fit ? <small> · {it.fit}</small> : null}</td>
          <td>{Object.entries(it.sizes).map(([s, n]) => `${s} ${n}`).join(' · ')}</td>
          <td>{detail?.form_sizes ? Object.entries(detail.form_sizes).map(([s, n]) => `${s} ${n}`).join(' · ') : '—'}</td>
          <td className="is-num">{Object.values(it.sizes).reduce((x, n) => x + (Number(n) || 0), 0)}</td>
        </tr>; })}
      </tbody></table></div>
      {reading.items.map((it, i) => !!it.players?.length && <div key={i} className="ofr-staff-table">
        <p className="ofr-staff-sub">{it.name || it.garment}: players ({it.players.length})</p>
        <table><thead><tr><th>#</th><th>Name</th><th>Number</th><th>Size</th><th>On the form</th></tr></thead><tbody>
          {it.players.map((p, j) => <tr key={j} className={p.size ? '' : 'is-missing'}><td>{j + 1}</td><td>{p.name || '—'}</td><td>{p.number || '—'}</td><td>{p.size || 'No size'}</td><td>{reading.details?.[i]?.player_sizes?.[j] || '—'}</td></tr>)}
        </tbody></table></div>)}
      {reading.unknown.length > 0 && <div className="ofr-unread"><CircleAlert size={16} /><div><b>Lines it could not place</b><ul>{reading.unknown.map((l, i) => <li key={i}>{l}</li>)}</ul></div></div>}
    </>}
  </section>;
}
