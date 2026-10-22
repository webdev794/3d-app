import { useState } from 'react';
import { ChevronDown, ChevronUp, CircleAlert, Info, Plus, Sparkles, X } from 'lucide-react';
import type { OrderItem, OrderPlayer, Suggested } from '../orderApi';
import { rowSizes, sizeFit, sizeGroups } from '../orderSizes';
import '../../css/order-form-read.css';

/**
 * Upload Your Order, review section 3 "Details from your order form" (client 2026-10-22): the finished form 3DEEZI AI
 * read from the uploaded file, for the customer to check, not fill in: garment rows with their sizes, the players
 * (name, number, size), the date words on the form and the totals. Every value stays editable. Only lines the reading
 * really could not place are listed. When nothing usable was read, nothing has to be filled in: 3DEEZI reads the form
 * and confirms the sizes (rows can still be added by hand).
 */

/** A row on the review: an order row, plus what the form said (sizes as written) for showing only, never sent. */
export interface ReviewItem extends OrderItem { _form?: { form_sizes?: Record<string, number> | null; player_sizes?: string[] | null } | null }

/** What the review says about the reading: who read which files, and the date words on the form. */
export interface ReadNote { source: 'ai' | 'reader' | null; files: string[]; neededByText: string; neededByFilled: string }

/** The rows as read from the order forms' readings (with the sizes as written kept beside them). */
export function rowsFromReadings(found: (Suggested | null)[]): ReviewItem[] {
  return found.flatMap(s => (s?.items ?? []).map((item, i) => ({ ...item, sizes: { ...item.sizes }, players: item.players ? item.players.map(p => ({ ...p })) : item.players, _form: s?.details?.[i] ?? null })));
}

/** The rows as the order and the draft take them: no display-only fields, no empty rows. */
export function cleanRows(items: ReviewItem[] | null | undefined): OrderItem[] {
  return (items ?? []).filter(it => rowTotal(it) > 0).map(({ _form: _shown, ...item }) => item);
}

export const rowTotal = (item: OrderItem) => Object.values(item.sizes).reduce((a, b) => a + (Number(b) || 0), 0);

const formSizesText = (sizes?: Record<string, number> | null) => (sizes ? Object.entries(sizes).map(([s, n]) => `${s} ${n}`).join(' · ') : '');

interface Props {
  items: ReviewItem[] | null; note: ReadNote; unread: string[]; sizes: string[]; garments: { id: string; name: string }[];
  confirmed: boolean; confirmTried: boolean; onConfirm: (value: boolean) => void;
  onSize: (index: number, size: string, value: string) => void; onGarment: (index: number, garment: string) => void; onRemove: (index: number) => void;
  onPlayer: (index: number, player: number, patch: Partial<OrderPlayer> | null) => void; onAddRow: () => void;
  /** The "These details are correct" box (false where the page has its own confirm box bound to the same state). */
  showConfirm?: boolean;
}

export default function OrderFormRead({ items, note, unread, sizes, garments, confirmed, confirmTried, onConfirm, onSize, onGarment, onRemove, onPlayer, onAddRow, showConfirm = true }: Props) {
  const rows = items ?? [];
  const total = rows.reduce((a, it) => a + rowTotal(it), 0);
  const players = rows.reduce((a, it) => a + (it.players?.length ?? 0), 0);
  const files = note.files.join(', ');
  const rowName = (it: OrderItem) => it.name || it.label || garments.find(g => g.id === it.garment)?.name || it.garment;
  // Rows showing every size (all fits), not just their own fit's set.
  const [wide, setWide] = useState<number[]>([]);
  /** The row's fit, else the one its sizes say (only womens or only kids sizes). */
  const fitOf = (it: OrderItem) => { if (it.fit) return it.fit; const sets = new Set(Object.keys(it.sizes).filter(s => (Number(it.sizes[s]) || 0) > 0).map(sizeFit)); return sets.size === 1 ? [...sets][0] : null; };

  return <div className="ofr" data-testid="order-form-read">
    {rows.length > 0 ? <p className={`ofr-note ${note.source === 'ai' ? 'is-ai' : ''}`} data-testid="read-note">
      {note.source === 'ai' ? <Sparkles size={17} /> : <Info size={17} />}
      <span>{note.source === 'ai' ? <>Read by <b>3DEEZI AI</b> from <b>{files}</b>. Please check: you can correct anything below.</>
        : <>Read from <b>{files}</b>. Please check: you can correct anything below.</>}</span>
    </p> : <div className="ofr-none" data-testid="read-nothing">
      <Info size={18} />
      <div><p><b>Nothing to fill in here.</b> 3DEEZI AI couldn’t read the garments and sizes from {files ? <b>{files}</b> : 'your order form'}, so 3DEEZI reads your form and confirms the sizes with you before anything is made.</p>
        <button type="button" className="ofr-add" onClick={onAddRow}><Plus size={15} /> Add sizes yourself (optional)</button></div>
    </div>}

    {(note.neededByText || note.neededByFilled) && <p className="ofr-date" data-testid="read-date">
      <span>Date required on your form:</span> <b>{note.neededByText || note.neededByFilled}</b>
      {note.neededByFilled ? <small>Filled in as your date required. Change it in section 1 if needed.</small> : <small>Choose the exact date in section 1.</small>}
    </p>}

    {rows.length > 0 && <>
      <div className="ofr-rows" role="table" aria-label="Garments and sizes">
        {rows.map((it, i) => {
          const name = rowName(it), detail = formSizesText(it._form?.form_sizes), all = wide.includes(i);
          // The row's fit's sizes (Mens XS–4XL, Womens W8–W20, Kids 6Y–16Y) and any it has; "All sizes" shows every one.
          const shown = all ? sizes : rowSizes(fitOf(it), it.sizes, false, sizes).shown;
          return <div className="ofr-row" role="row" key={i} data-testid="read-row">
            <div className="ofr-row-head">
              <label className="ofr-garment"><span className="op-sr">Garment {i + 1}</span>
                <select value={it.garment} onChange={e => onGarment(i, e.target.value)} aria-label={`Garment ${i + 1}`}>
                  {!garments.some(g => g.id === it.garment) && <option value={it.garment}>{name}</option>}
                  {garments.map(g => <option key={g.id} value={g.id}>{g.id === it.garment ? name : g.name}</option>)}
                </select>
              </label>
              <span className="ofr-row-total" data-testid="row-total">{rowTotal(it)} <small>{rowTotal(it) === 1 ? 'garment' : 'garments'}</small></span>
              {rows.length > 1 && <button type="button" className="ofr-icon" aria-label={`Remove ${name}`} title="Remove this row" onClick={() => onRemove(i)}><X size={17} /></button>}
            </div>
            <div className="ofr-sizes">{shown.map(s => <label key={s} className={it.sizes[s] ? 'is-on' : ''}>{s}
              <input inputMode="numeric" value={it.sizes[s] ? String(it.sizes[s]) : ''} placeholder="0" onChange={e => onSize(i, s, e.target.value)} aria-label={`${name}, size ${s}`} /></label>)}</div>
            <button type="button" className="ofr-more" aria-expanded={all} onClick={() => setWide(w => (all ? w.filter(n => n !== i) : [...w, i]))}>{all ? 'Fewer sizes' : '+ All sizes (Mens, Womens, Kids)'}</button>
            {detail && <p className="ofr-detail" data-testid="form-sizes">As on your form: {detail}{it.sizes.Kids ? ' (in Kids)' : ''}</p>}
            {!!it.players?.length && <Players item={it} index={i} name={name} sizes={sizes} fit={fitOf(it)} onPlayer={onPlayer} />}
          </div>;
        })}
      </div>
      <p className="ofr-totals" data-testid="read-totals"><span>Total</span><b>{total} {total === 1 ? 'garment' : 'garments'}</b>{players > 0 && <span>{players} {players === 1 ? 'player' : 'players'}</span>}
        <button type="button" className="ofr-add" onClick={onAddRow}><Plus size={14} /> Add a garment</button></p>
    </>}

    {unread.length > 0 && <div className="ofr-unread" data-testid="read-unread"><CircleAlert size={16} /><div>
      <b>{unread.length === 1 ? 'One line to check' : `${unread.length} lines to check`}</b>: 3DEEZI couldn’t place {unread.length === 1 ? 'it' : 'them'}, so we check {unread.length === 1 ? 'it' : 'them'} with you.
      <ul>{unread.map((line, i) => <li key={i}>{line}</li>)}</ul></div></div>}

    {rows.length > 0 && showConfirm && <>
      <label className={`ou-confirm ${confirmTried && !confirmed ? 'is-invalid' : ''}`}><input type="checkbox" checked={confirmed} aria-invalid={confirmTried && !confirmed} onChange={e => onConfirm(e.target.checked)} /><span><strong>These details are correct</strong><small>We make your order from them. Anything unclear in your order form is checked with you.</small></span></label>
      {confirmTried && !confirmed && <p className="ou-alert" role="alert"><CircleAlert size={15} /> Tick “These details are correct” (or correct them first) to confirm your order.</p>}
    </>}
  </div>;
}

/** The players read for one garment: name, number and size, each editable; the size as written on the form beside it. */
function Players({ item, index, name, sizes, fit, onPlayer }: { item: ReviewItem; index: number; name: string; sizes: string[]; fit: string | null; onPlayer: Props['onPlayer'] }) {
  const list = item.players ?? [];
  const [open, setOpen] = useState(list.length <= 40);
  const written = item._form?.player_sizes ?? [];
  return <div className="ofr-players">
    <button type="button" className="ofr-players-toggle" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      Players: names and numbers <span>{list.length}</span>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </button>
    {open && <ol className="ofr-player-list" aria-label={`${name}: players`}>
      <li className="ofr-player is-head" aria-hidden="true"><span>#</span><span>Name</span><span>Number</span><span>Size</span><span /></li>
      {list.map((p, j) => <li key={j} className={`ofr-player ${p.size ? '' : 'is-missing'}`} data-testid="read-player">
        <span className="ofr-n">{j + 1}</span>
        <input className="ofr-name" value={p.name} maxLength={40} onChange={e => onPlayer(index, j, { name: e.target.value })} aria-label={`Player ${j + 1} name`} placeholder="Name" />
        <input className="ofr-num" value={p.number} inputMode="numeric" maxLength={3} onChange={e => onPlayer(index, j, { number: e.target.value.replace(/\D/g, '').slice(0, 3) })} aria-label={`Player ${j + 1} number`} placeholder="No." />
        <span className="ofr-size">
          <select value={p.size ?? ''} onChange={e => onPlayer(index, j, { size: e.target.value || null })} aria-label={`Player ${j + 1} size`}>
            <option value="">Size?</option>{p.size && !sizes.includes(p.size) && <option value={p.size}>{p.size}</option>}{sizeGroups(sizes, fit).map(g => <optgroup key={g.fit} label={`${g.name} sizes`}>{g.sizes.map(s => <option key={s} value={s}>{s}</option>)}</optgroup>)}
          </select>
          {written[j] && written[j].toUpperCase() !== (p.size ?? '').toUpperCase() && <small title="The size as written on your form">{written[j]}</small>}
        </span>
        <button type="button" className="ofr-icon" aria-label={`Remove player ${j + 1}`} title="Remove this player" onClick={() => onPlayer(index, j, null)}><X size={15} /></button>
      </li>)}
    </ol>}
  </div>;
}
